import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { SQSEvent } from 'aws-lambda';
import { handler, resetProcessedEvents } from '../src/index';

type JsonLine = { message: string } & Record<string, unknown>;

let logs: JsonLine[] = [];

function captureLogs(): void {
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((line: string) => {
    logs.push(JSON.parse(line) as JsonLine);
  });
}

function sqsEvent(bodies: string[]): SQSEvent {
  return {
    Records: bodies.map((body, index) => ({
      messageId: `msg-${index}`,
      body,
      attributes: {},
      messageAttributes: {},
      md5OfBody: 'n/a',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:dev-task-notifications',
      awsRegion: 'us-east-1',
    })),
  } as unknown as SQSEvent;
}

const createdBody = JSON.stringify({ type: 'TASK_CREATED', taskId: 't1', title: 'Learn idempotency' });
const completedBody = JSON.stringify({ type: 'TASK_COMPLETED', taskId: 't1' });

beforeEach(() => {
  resetProcessedEvents();
  captureLogs();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('task-processor handler', () => {
  test('processes a TASK_CREATED event and logs the lifecycle', async () => {
    await handler(sqsEvent([createdBody]));
    expect(logs.find((l) => l.message === 'Task processor received TASK_CREATED')?.taskId).toBe('t1');
    expect(logs.find((l) => l.message === 'Task processor processed TASK_CREATED')?.taskId).toBe('t1');
  });

  test('processes a TASK_COMPLETED event', async () => {
    await handler(sqsEvent([completedBody]));
    expect(logs.find((l) => l.message === 'Task processor processed TASK_COMPLETED')?.taskId).toBe('t1');
  });

  test('skips a duplicate delivery of the same logical event (at-least-once → idempotent)', async () => {
    // Same event delivered twice in one batch (e.g. a redrive).
    await handler(sqsEvent([createdBody, createdBody]));

    const processed = logs.filter((l) => l.message === 'Task processor processed TASK_CREATED');
    const skipped = logs.filter((l) => l.message === 'Task processor skipped duplicate — already processed (idempotent)');
    expect(processed).toHaveLength(1);
    expect(skipped).toHaveLength(1);
  });

  test('throws for a poison TASK_CREATED whose title contains FAIL (drives retries → DLQ)', async () => {
    const poison = JSON.stringify({ type: 'TASK_CREATED', taskId: 't2', title: 'make me FAIL please' });
    await expect(handler(sqsEvent([poison]))).rejects.toThrow(/FAIL/);
    expect(logs.find((l) => l.message === 'Task processor processed TASK_CREATED')).toBeUndefined();
  });

  test('a poison message in a batch retries the whole batch — earlier records are idempotently skipped', async () => {
    const poison = JSON.stringify({ type: 'TASK_CREATED', taskId: 't3', title: 'FAIL me' });
    // Batch 1: good record + poison → whole invocation fails (after the good one was processed).
    await expect(handler(sqsEvent([createdBody, poison]))).rejects.toThrow(/FAIL/);
    const processedAfterFirstBatch = logs.filter((l) => l.message === 'Task processor processed TASK_CREATED').length;
    expect(processedAfterFirstBatch).toBe(1);

    // Batch 2 (the retry): both records redelivered. The good one must not be
    // double-processed (dedup skip); the poison one fails again (→ eventually DLQ).
    await expect(handler(sqsEvent([createdBody, poison]))).rejects.toThrow(/FAIL/);
    const processedAfterRetry = logs.filter((l) => l.message === 'Task processor processed TASK_CREATED').length;
    expect(processedAfterRetry).toBe(processedAfterFirstBatch); // not double-processed
    expect(
      logs.filter((l) => l.message === 'Task processor skipped duplicate — already processed (idempotent)').length,
    ).toBe(1);
  });

  test('throws for garbage message bodies (also poison)', async () => {
    await expect(handler(sqsEvent(['not-json']))).rejects.toThrow();
  });
});