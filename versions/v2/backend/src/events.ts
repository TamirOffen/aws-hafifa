/**
 * Event publishing, Version 2: the API announces TASK_CREATED to SQS.
 *
 * Architectural point of v2: the API *explicitly publishes* an event after
 * doing its synchronous work. Compare with Version 4, where the *database*
 * emits events via DynamoDB Streams and the API knows nothing about it.
 *
 * The publish is deliberately best-effort: if it fails (e.g. the task role is
 * missing sqs:SendMessage — a Stage 7 break-it exercise), the task creation
 * still succeeds and the failure is logged as an error. Watch for
 * "Failed to publish TASK_CREATED" in CloudWatch Logs while POST keeps
 * returning 201.
 */
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { AppLogger } from './logger';
import type { Task } from './task-store';

/** Structural slice of the SDK client — tests inject a fake instead of mocking the SDK. */
export interface SQSClientLike {
  send(command: SendMessageCommand): Promise<{ MessageId?: string }>;
}

export interface TaskEventPublisher {
  publishTaskCreated(task: Task): Promise<void>;
}

export interface SqsPublisherDeps {
  readonly queueUrl: string;
  readonly sqs: SQSClientLike;
  readonly logger: AppLogger;
}

export function createSqsPublisher({ queueUrl, sqs, logger }: SqsPublisherDeps): TaskEventPublisher {
  return {
    async publishTaskCreated(task) {
      const body = {
        type: 'TASK_CREATED',
        taskId: task.id,
        title: task.title,
        createdAt: task.createdAt,
      };
      try {
        const result = await sqs.send(
          new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(body) }),
        );
        logger.info(
          { event: 'taskPublished', taskId: task.id, sqsMessageId: result.MessageId },
          'Published TASK_CREATED',
        );
      } catch (err) {
        logger.error(
          { event: 'publishFailed', taskId: task.id, err: serializeError(err) },
          'Failed to publish TASK_CREATED',
        );
      }
    },
  };
}

/** Default client used by index.ts — region comes from AWS_REGION / the SDK region chain. */
export function createDefaultSqsClient(): SQSClientLike {
  return new SQSClient({});
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return { error: String(err) };
}
