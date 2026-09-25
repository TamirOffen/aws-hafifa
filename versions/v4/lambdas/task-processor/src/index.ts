/**
 * Version 4 — task processor Lambda ("task-processor").
 *
 * WHAT it does: consumes the task events the stream router published to SQS
 * and "processes" them (here: logs — the processing is deliberately imaginary,
 * the plumbing is the lesson). Two behaviors are pre-built for the Stage 9
 * exercises:
 *
 *   1. POISON HOOK — a TASK_CREATED whose title contains "FAIL" throws, so the
 *      message exhausts its receive attempts and lands in the DLQ.
 *
 *   2. IDEMPOTENCY — SQS is at-least-once: the same logical event can be
 *      delivered more than once (redrive, batch retry after a partial failure,
 *      router republish). A dedup key (type:taskId) makes re-processing a
 *      no-op. This Set only lives in the warm container — deliberately, so you
 *      can ALSO observe the cold-start duplicate in Stage 9 and discuss what a
 *      real system would use (a persistent table of processed keys).
 *
 * Students never edit this file — they only deploy and configure it.
 */
import type { SQSEvent } from 'aws-lambda';
import { log } from './logger';
import { parseTaskEvent } from './message';

const FAIL_MARKER = 'FAIL';

// Warm-container dedup state. Cleared on cold start — see the comment above.
const processedEventKeys = new Set<string>();

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    const taskEvent = parseTaskEvent(record.body);
    const dedupKey = `${taskEvent.type}:${taskEvent.taskId}`;

    log(`Task processor received ${taskEvent.type}`, {
      messageId: record.messageId,
      taskId: taskEvent.taskId,
      dedupKey,
    });

    if (processedEventKeys.has(dedupKey)) {
      // Same logical event delivered again — already processed, skip it.
      log('Task processor skipped duplicate — already processed (idempotent)', { dedupKey });
      continue;
    }

    if (taskEvent.title && taskEvent.title.toUpperCase().includes(FAIL_MARKER)) {
      log('Task processor rejecting event — poison message, expect retries then DLQ', {
        messageId: record.messageId,
        taskId: taskEvent.taskId,
      });
      throw new Error(
        `Title contains "${FAIL_MARKER}" — intentionally failing so this message exhausts its retries and dead-letters.`,
      );
    }

    processedEventKeys.add(dedupKey);
    log(`Task processor processed ${taskEvent.type}`, { taskId: taskEvent.taskId, dedupKey });
  }
};

/** Test-only helper: forget everything processed so far (fresh warm state). */
export function resetProcessedEvents(): void {
  processedEventKeys.clear();
}