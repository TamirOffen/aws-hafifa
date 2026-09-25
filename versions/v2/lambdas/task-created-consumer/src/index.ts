/**
 * Version 2 — SQS consumer Lambda ("task-created-consumer").
 *
 * WHAT it does: receives TASK_CREATED messages published by the API, logs the
 * task lifecycle ("Lambda received TASK_CREATED" → "Lambda processed task"),
 * and deliberately fails for poison messages.
 *
 * WHY it throws: you (not the code) configure the queue's retry policy and
 * dead-letter queue in Stage 7. This handler is the pre-written way to make a
 * message fail on purpose: create a task whose title contains "FAIL" and
 * watch the message exhaust its receive attempts and land in the DLQ.
 *
 * Students never edit this file — they only deploy and configure it.
 */
import type { SQSEvent } from 'aws-lambda';
import { log } from './logger';
import { parseTaskCreatedMessage } from './message';

const FAIL_MARKER = 'FAIL';

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    const message = parseTaskCreatedMessage(record.body);
    log('Lambda received TASK_CREATED', {
      messageId: record.messageId,
      taskId: message.taskId,
      title: message.title,
    });

    if (message.title.toUpperCase().includes(FAIL_MARKER)) {
      log('Lambda rejecting task — poison message, expect retries then DLQ', {
        messageId: record.messageId,
        taskId: message.taskId,
      });
      throw new Error(
        `Title contains "${FAIL_MARKER}" — intentionally failing so this message exhausts its retries and dead-letters.`,
      );
    }

    log('Lambda processed task', { messageId: record.messageId, taskId: message.taskId });
  }
};
