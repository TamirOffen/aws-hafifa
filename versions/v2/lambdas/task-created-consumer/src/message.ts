/**
 * Parsing/validation of the message body the API publishes (see the backend's
 * src/events.ts in v2). Anything that is not a well-formed TASK_CREATED body
 * throws — a garbage message is also a poison message and belongs in the DLQ
 * after exhausting retries.
 */

export interface TaskCreatedMessage {
  readonly type: 'TASK_CREATED';
  readonly taskId: string;
  readonly title: string;
}

export class MessageFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessageFormatError';
  }
}

export function parseTaskCreatedMessage(body: string): TaskCreatedMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new MessageFormatError('Message body is not valid JSON.');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as Record<string, unknown>).type !== 'TASK_CREATED' ||
    typeof (parsed as Record<string, unknown>).taskId !== 'string' ||
    typeof (parsed as Record<string, unknown>).title !== 'string'
  ) {
    throw new MessageFormatError('Message body is not a well-formed TASK_CREATED message.');
  }
  const record = parsed as Record<string, unknown>;
  return { type: 'TASK_CREATED', taskId: record.taskId as string, title: record.title as string };
}
