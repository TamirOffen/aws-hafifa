import { describe, expect, test, vi } from 'vitest';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { createSqsPublisher, type SQSClientLike } from '../src/events';
import { createLogger } from '../src/logger';
import type { Task } from '../src/task-store';

process.env.LOG_LEVEL = 'silent';

const QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/dev-task-events';
const task: Task = {
  id: 'task-1',
  title: 'Learn SQS',
  completed: false,
  createdAt: '2025-01-01T00:00:00.000Z',
};

function fakeClient(send: SQSClientLike['send']): SQSClientLike {
  return { send };
}

describe('createSqsPublisher', () => {
  test('sends a TASK_CREATED message as JSON to the configured queue', async () => {
    const send = vi.fn(async () => ({ MessageId: 'sq-1' }));
    const publisher = createSqsPublisher({ queueUrl: QUEUE_URL, sqs: fakeClient(send), logger: createLogger('test') });

    await publisher.publishTaskCreated(task);

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0] as SendMessageCommand;
    expect(command.input.QueueUrl).toBe(QUEUE_URL);
    expect(JSON.parse(command.input.MessageBody as string)).toEqual({
      type: 'TASK_CREATED',
      taskId: 'task-1',
      title: 'Learn SQS',
      createdAt: '2025-01-01T00:00:00.000Z',
    });
  });

  test('does not throw when the queue rejects the send (task creation still succeeds)', async () => {
    const send = vi.fn(async () => {
      throw new Error('AccessDenied: sqs:SendMessage is missing');
    });
    const publisher = createSqsPublisher({ queueUrl: QUEUE_URL, sqs: fakeClient(send), logger: createLogger('test') });

    await expect(publisher.publishTaskCreated(task)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
