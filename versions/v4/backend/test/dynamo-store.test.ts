/**
 * Store integration tests against DynamoDB Local (scripts/dynamodb-local.sh).
 *
 * These skip automatically with a visible message when DynamoDB Local is not
 * running, so `npm test` stays green on a laptop without Docker. Start the
 * local table first:
 *   ./scripts/dynamodb-local.sh start   (from the repo root — i.e. ../../../scripts/dynamodb-local.sh relative to this package)
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createDynamoTaskStore } from '../src/dynamo-store';
import {
  createLocalDocumentClient,
  createTestTable,
  deleteTestTable,
  isDynamoLocalReachable,
} from './helpers';

const dynamoLocalUp = await isDynamoLocalReachable();

describe.skipIf(!dynamoLocalUp)('dynamo task store (integration, DynamoDB Local)', () => {
  const client = createLocalDocumentClient();
  let tableName: string;
  let store: ReturnType<typeof createDynamoTaskStore>;

  beforeAll(async () => {
    tableName = await createTestTable(client);
    store = createDynamoTaskStore({ tableName, client });
  });

  afterAll(async () => {
    await deleteTestTable(client, tableName);
  });

  test('creates a task and lists it back', async () => {
    const created = await store.createTask('Learn DynamoDB');
    const listed = await store.listTasks();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(created.id);
    expect(listed[0].title).toBe('Learn DynamoDB');
    expect(listed[0].completed).toBe(false);
  });

  test('lists tasks in a stable, deterministic order across repeated scans', async () => {
    await store.createTask('B task');
    await store.createTask('A task');
    const first = (await store.listTasks()).map((t) => t.title);
    const second = (await store.listTasks()).map((t) => t.title);
    // Same order every time (createdAt + id tie-break), regardless of what
    // order Scan happens to return rows in.
    expect(first).toEqual(second);
    expect([...first]).toHaveLength(3);
  });

  test('setCompleted updates the stored item and returns the new state', async () => {
    const created = await store.createTask('Learn partition keys');
    const updated = await store.setCompleted(created.id, true);
    expect(updated?.completed).toBe(true);
    expect((await store.listTasks()).find((t) => t.id === created.id)?.completed).toBe(true);
  });

  test('setCompleted returns undefined for an unknown id — and must NOT create an item', async () => {
    const before = (await store.listTasks()).length;

    const result = await store.setCompleted('does-not-exist', true);
    expect(result).toBeUndefined();

    // The classic UpdateItem pitfall this store guards against with
    // attribute_exists(id): without the condition, DynamoDB would silently
    // "update" the missing key by creating a garbage item.
    expect(await store.listTasks()).toHaveLength(before);
  });
});

describe.skipIf(dynamoLocalUp)('dynamo task store (integration, DynamoDB Local)', () => {
  test('skips: DynamoDB Local is not running — start it with scripts/dynamodb-local.sh', () => {
    console.warn(
      `Skipped: no DynamoDB Local on ${LOCAL_ENDPOINT}. Run ./scripts/dynamodb-local.sh start from the repo root.`,
    );
  });
});