/**
 * Parsing/validation of the task events the stream router publishes
 * (see lambdas/task-stream-router/src/message.ts). Malformed bodies throw —
 * a garbage message is a poison message and belongs in the DLQ after
 * exhausting retries, not in a silent skip.
 */

export type TaskEventType = 'TASK_CREATED' | 'TASK_COMPLETED';

export interface TaskEvent {
  readonly type: TaskEventType;
  readonly taskId: string;
  readonly title?: string;
}

export class MessageFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessageFormatError';
  }
}

export function parseTaskEvent(body: string): TaskEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new MessageFormatError('Message body is not valid JSON.');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    ((parsed as Record<string, unknown>).type !== 'TASK_CREATED' &&
      (parsed as Record<string, unknown>).type !== 'TASK_COMPLETED') ||
    typeof (parsed as Record<string, unknown>).taskId !== 'string'
  ) {
    throw new MessageFormatError('Message body is not a well-formed task event.');
  }
  const record = parsed as Record<string, unknown>;
  return {
    type: record.type as TaskEventType,
    taskId: record.taskId as string,
    ...(typeof record.title === 'string' ? { title: record.title } : {}),
  };
}