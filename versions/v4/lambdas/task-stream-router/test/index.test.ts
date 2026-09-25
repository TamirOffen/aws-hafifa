import { describe, expect, test, vi } from 'vitest';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { createStreamRouter, type SqsLike } from '../src/index';
import { toTaskEvent } from '../src/message';

const QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/dev-task-notifications';

function streamRecord(opts: {
  eventName: 'INSERT' | 'MODIFY' | 'REMOVE';
  id?: string;
  title?: string;
  newCompleted?: boolean;
  oldCompleted?: boolean;
}): DynamoDBRecord {
  const { eventName, id = 'task-1', title = 'Learn Streams', newCompleted = false, oldCompleted = false } = opts;
  return {
    eventID: 'fixed-event-id',
    eventName,
    eventVersion: '1.1',
    eventSource: 'aws:dynamodb',
    awsRegion: 'us-east-1',
    dynamodb: {
      ApproximateCreationDateTime: 1730000000,
      SequenceNumber: '1000',
      SizeBytes: 64,
      StreamViewType: 'NEW_AND_OLD_IMAGES',
      Keys: { id: { S: id } },
      NewImage: {
        id: { S: id },
        title: { S: title },
        completed: { BOOL: newCompleted },
        createdAt: { S: '2025-01-01T00:00:00Z' },
      },
      OldImage:
        eventName === 'MODIFY'
          ? {
              id: { S: id },
              title: { S: title },
              completed: { BOOL: oldCompleted },
              createdAt: { S: '2025-01-01T00:00:00Z' },
            }
          : undefined,
    },
  } as unknown as DynamoDBRecord;
}

function streamEvent(records: DynamoDBRecord[]): DynamoDBStreamEvent {
  return { Records: records } as unknown as DynamoDBStreamEvent;
}

function fakeSqs(): SqsLike & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(async () => ({ MessageId: 'sq-1' })) };
}

describe('toTaskEvent (stream record → task event)', () => {
  test('INSERT maps to TASK_CREATED with id and title', () => {
    expect(toTaskEvent(streamRecord({ eventName: 'INSERT', id: 't1', title: 'Buy milk' }))).toEqual({
      type: 'TASK_CREATED',
      taskId: 't1',
      title: 'Buy milk',
    });
  });

  test('MODIFY with completed false→true maps to TASK_COMPLETED', () => {
    expect(
      toTaskEvent(streamRecord({ eventName: 'MODIFY', oldCompleted: false, newCompleted: true })),
    ).toMatchObject({ type: 'TASK_COMPLETED', taskId: 'task-1' });
  });

  test('MODIFY without a completion transition is ignored', () => {
    expect(toTaskEvent(streamRecord({ eventName: 'MODIFY', oldCompleted: false, newCompleted: false }))).toBeNull();
    expect(toTaskEvent(streamRecord({ eventName: 'MODIFY', oldCompleted: true, newCompleted: true }))).toBeNull();
  });

  test('REMOVE is ignored', () => {
    expect(toTaskEvent(streamRecord({ eventName: 'REMOVE' }))).toBeNull();
  });
});

describe('stream router handler', () => {
  test('publishes one SQS message per interesting stream record', async () => {
    const sqs = fakeSqs();
    const router = createStreamRouter({ sqs, queueUrl: QUEUE_URL });

    await router(
      streamEvent([
        streamRecord({ eventName: 'INSERT', id: 't1' }),
        streamRecord({ eventName: 'MODIFY', id: 't1', oldCompleted: false, newCompleted: true }),
        streamRecord({ eventName: 'REMOVE', id: 't1' }),
      ]),
    );

    expect(sqs.send).toHaveBeenCalledTimes(2);
    const first = sqs.send.mock.calls[0][0] as SendMessageCommand;
    const second = sqs.send.mock.calls[1][0] as SendMessageCommand;
    expect(first.input.QueueUrl).toBe(QUEUE_URL);
    expect(JSON.parse(first.input.MessageBody as string)).toMatchObject({ type: 'TASK_CREATED', taskId: 't1' });
    expect(JSON.parse(second.input.MessageBody as string)).toMatchObject({ type: 'TASK_COMPLETED', taskId: 't1' });
  });

  test('passes skipped records through without publishing', async () => {
    const sqs = fakeSqs();
    const router = createStreamRouter({ sqs, queueUrl: QUEUE_URL });
    await router(streamEvent([streamRecord({ eventName: 'REMOVE' })]));
    expect(sqs.send).not.toHaveBeenCalled();
  });
});