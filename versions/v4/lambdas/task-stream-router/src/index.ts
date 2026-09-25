/**
 * Version 4 — DynamoDB Stream router Lambda ("task-stream-router").
 *
 * WHAT it does: an event source mapping (which you configure in Stage 9) feeds
 * this function batches of stream records from the tasks table. Each record is
 * translated into a TASK_CREATED / TASK_COMPLETED event and published to SQS,
 * where a second Lambda (task-processor) picks it up.
 *
 * WHY this shape: v2's API *announced* events; v4's *database* emits them
 * (change-data-capture). The API now knows nothing about the event pipeline —
 * anything that writes to the table (today's API, tomorrow's CLI import) gets
 * evented for free.
 *
 * Config (environment variables, read at cold start — fail fast):
 *   QUEUE_URL  — the SQS queue to publish task events to
 *   AWS_REGION — inherited from the function's region configuration
 */
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { DynamoDBStreamEvent } from 'aws-lambda';
import { log } from './logger';
import { toTaskEvent } from './message';

export interface SqsLike {
  send(command: SendMessageCommand): Promise<{ MessageId?: string }>;
}

export interface RouterDeps {
  readonly sqs: SqsLike;
  readonly queueUrl: string;
}

export function createStreamRouter({ sqs, queueUrl }: RouterDeps) {
  return async (event: DynamoDBStreamEvent): Promise<void> => {
    for (const record of event.Records ?? []) {
      const taskEvent = toTaskEvent(record);
      if (!taskEvent) {
        log('Stream router skipped record', {
          eventName: record.eventName ?? 'UNKNOWN',
        });
        continue;
      }
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(taskEvent),
        }),
      );
      log(`Stream router published ${taskEvent.type}`, {
        type: taskEvent.type,
        taskId: taskEvent.taskId,
      });
    }
  };
}

/** Wiring used by Lambda itself. Tests exercise createStreamRouter with fakes. */
const queueUrl = process.env.QUEUE_URL ?? '';
if (!queueUrl) {
  // Fail loudly at cold start — a router with no queue is a misconfiguration,
  // and you want that visible in the Lambda console, not buried per-invoke.
  throw new Error('task-stream-router requires QUEUE_URL to be set (see Stage 9).');
}
export const handler = createStreamRouter({
  sqs: new SQSClient({}),
  queueUrl,
});