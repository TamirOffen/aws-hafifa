/**
 * Task storage, Version 3+: DynamoDB.
 *
 * THE LESSON IN THIS FILE (Stage 8): the previous versions lost tasks on every
 * restart. This adapter makes the same API persistent with three SDK calls.
 *
 * The subtle-but-critical detail is setCompleted's ConditionExpression.
 * UpdateItem without a condition would happily "update" a non-existent key by
 * *creating* it — so the 404s you relied on in v1 would silently become
 * garbage items. `attribute_exists(id)` keeps PATCH honest.
 *
 * Networking tie-back: these calls leave the task's ENI in a private subnet and
 * reach DynamoDB's public regional endpoint THROUGH THE NAT GATEWAY (Stage 2's
 * routing table). That is why deleting the NAT in Stage 8's break-it exercise
 * takes this whole API down with timeouts, not with auth errors.
 */
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { PutCommand, ScanCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import type { Task, TaskStore } from './task-store';

export interface DynamoStoreDeps {
  readonly tableName: string;
  readonly client: DynamoDBDocumentClient;
}

export function createDynamoTaskStore({ tableName, client }: DynamoStoreDeps): TaskStore {
  return {
    async createTask(title) {
      const task: Task = {
        id: randomUUID(),
        title,
        completed: false,
        createdAt: new Date().toISOString(),
      };
      await client.send(new PutCommand({ TableName: tableName, Item: task }));
      return task;
    },

    async listTasks() {
      const result = await client.send(new ScanCommand({ TableName: tableName }));
      const items = (result.Items ?? []) as Task[];
      // Scan order is unspecified — sort deterministically (createdAt, then id
      // as a tie-breaker for same-millisecond creates) so the UI is stable.
      return [...items].sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      );
    },

    async setCompleted(id, completed) {
      try {
        const result = await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { id },
            UpdateExpression: 'SET completed = :completed',
            ExpressionAttributeValues: { ':completed': completed },
            ConditionExpression: 'attribute_exists(id)',
            ReturnValues: 'ALL_NEW',
          }),
        );
        return result.Attributes as Task;
      } catch (err) {
        if (err instanceof ConditionalCheckFailedException) {
          return undefined; // no such task → the route turns this into a 404
        }
        throw err; // e.g. AccessDeniedException (Stage 8 break-it) — let the 500 handler/log have it
      }
    },
  };
}