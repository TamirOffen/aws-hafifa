import { afterEach, describe, expect, test, vi } from 'vitest';
import type { SQSEvent } from 'aws-lambda';
import { handler } from '../src/index';

type JsonLine = { message: string } & Record<string, unknown>;

function captureLogs(): JsonLine[] {
  const lines: JsonLine[] = [];
  vi.spyOn(console, 'log').mockImplementation((line: string) => {
    lines.push(JSON.parse(line) as JsonLine);
  });
  return lines;
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
      eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:dev-task-events',
      awsRegion: 'us-east-1',
    })),
  } as unknown as SQSEvent;
}

const goodBody = JSON.stringify({ type: 'TASK_CREATED', taskId: 'task-1', title: 'Learn DLQs', createdAt: '2025-01-01T00:00:00Z' });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('task-created-consumer handler', () => {
  test('logs received and processed lifecycle lines for a valid message', async () => {
    const logs = captureLogs();
    await handler(sqsEvent([goodBody]));

    expect(logs.find((l) => l.message === 'Lambda received TASK_CREATED')?.taskId).toBe('task-1');
    expect(logs.find((l) => l.message === 'Lambda processed task')?.taskId).toBe('task-1');
  });

  test('throws for a poison message whose title contains FAIL (drives retries → DLQ)', async () => {
    const logs = captureLogs();
    const poison = JSON.stringify({ type: 'TASK_CREATED', taskId: 'task-2', title: 'BREAK THIS FAIL PLEASE' });

    await expect(handler(sqsEvent([poison]))).rejects.toThrow(/FAIL/);
    expect(logs.find((l) => l.message === 'Lambda received TASK_CREATED')?.taskId).toBe('task-2');
    expect(logs.find((l) => l.message === 'Lambda processed task')).toBeUndefined();
  });

  test('throws for garbage message bodies (also poison: they must not loop forever)', async () => {
    await expect(handler(sqsEvent(['not-json']))).rejects.toThrow();
    await expect(handler(sqsEvent([JSON.stringify({ type: 'WRONG' })]))).rejects.toThrow();
  });

  test('processes every record in a batch', async () => {
    const logs = captureLogs();
    const bodies = [
      goodBody,
      JSON.stringify({ type: 'TASK_CREATED', taskId: 'task-9', title: 'Learn visibility timeouts' }),
    ];
    await handler(sqsEvent(bodies));

    expect(logs.filter((l) => l.message === 'Lambda received TASK_CREATED')).toHaveLength(2);
    expect(logs.filter((l) => l.message === 'Lambda processed task')).toHaveLength(2);
  });
});
