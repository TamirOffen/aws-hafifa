/**
 * Turns raw DynamoDB Stream records into clean task events.
 *
 * THE LESSON (Stage 9): the stream is change-data-capture on the table.
 * INSERT  → a task came into existence        → TASK_CREATED
 * MODIFY  → completed flipped false → true    → TASK_COMPLETED
 *           (other updates — e.g. a title change — are not interesting yet)
 * REMOVE  → not part of this app's lifecycle   → skipped
 *
 * Note the images are DynamoDB's JSON format ({ "id": { "S": "..." } }) —
 * deliberately extracted field-by-field so the shape is visible instead of
 * hidden behind an unmarshaller.
 */
import type { DynamoDBRecord, StreamRecord } from 'aws-lambda';

export type TaskEventType = 'TASK_CREATED' | 'TASK_COMPLETED';

export interface TaskEvent {
  readonly type: TaskEventType;
  readonly taskId: string;
  readonly title?: string;
}

interface TaskImage {
  id?: { S?: string };
  title?: { S?: string };
  completed?: { BOOL?: boolean };
}

export function toTaskEvent(record: DynamoDBRecord): TaskEvent | null {
  const dynamodb = record.dynamodb as StreamRecord | undefined;
  const newImage = dynamodb?.NewImage as unknown as TaskImage | undefined;
  if (!newImage?.id?.S) {
    return null; // nothing new/recognizable in this record
  }
  const taskId = newImage.id.S;
  const title = newImage.title?.S;

  if (record.eventName === 'INSERT') {
    return { type: 'TASK_CREATED', taskId, ...(title !== undefined ? { title } : {}) };
  }

  if (record.eventName === 'MODIFY') {
    const oldImage = dynamodb?.OldImage as unknown as TaskImage | undefined;
    const wasCompleted = oldImage?.completed?.BOOL ?? false;
    const isCompleted = newImage.completed?.BOOL ?? false;
    if (isCompleted && !wasCompleted) {
      return { type: 'TASK_COMPLETED', taskId, ...(title !== undefined ? { title } : {}) };
    }
  }

  return null; // MODIFY without a completion transition, or REMOVE
}