/**
 * API integration tests.
 *
 * Two layers:
 *  1. Contract/validation tests with a fake in-memory store — always run.
 *  2. Happy-path round-trip with the real DynamoDB store — only when
 *     DynamoDB Local is up (scripts/dynamodb-local.sh).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import type { Config } from '../src/config';
import { createDynamoTaskStore } from '../src/dynamo-store';
import { createLogger } from '../src/logger';
import type { Task, TaskStore } from '../src/task-store';
import {
  createLocalDocumentClient,
  createTestTable,
  deleteTestTable,
  isDynamoLocalReachable,
} from './helpers';

process.env.LOG_LEVEL = 'silent';

const config: Config = {
  port: 3000,
  environment: 'test',
  tableName: 'test-tasks',
  awsRegion: 'us-east-1',
};
const logger = createLogger('test');

/** Store double with the same async shape as the real DynamoDB store. */
function fakeStore(overrides: Partial<TaskStore> = {}): TaskStore {
  const tasks = new Map<string, Task>();
  const base: TaskStore = {
    async createTask(title) {
      const task: Task = { id: 'fixed-id', title, completed: false, createdAt: '2025-01-01T00:00:00Z' };
      tasks.set(task.id, task);
      return task;
    },
    async listTasks() {
      return [...tasks.values()];
    },
    async setCompleted(id, completed) {
      const existing = tasks.get(id);
      return existing ? { ...existing, completed } : undefined;
    },
  };
  return { ...base, ...overrides };
}

function buildApp(store: TaskStore = fakeStore()): Express {
  return createApp({ config, store, logger });
}

let app: Express;
beforeEach(() => {
  app = buildApp();
});

describe('GET /health', () => {
  test('returns ok status with the environment (ALB target group health check)', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', environment: 'test' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});

describe('GET /api/environment', () => {
  test('returns the environment the backend is running in', async () => {
    const res = await request(app).get('/api/environment');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ environment: 'test' });
  });
});

describe('POST /api/tasks', () => {
  test('creates a task and returns it with 201', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 'Learn ECS' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Learn ECS');
    expect(res.body.completed).toBe(false);
  });

  test('rejects a missing title with 400 and a helpful message', async () => {
    const res = await request(app).post('/api/tasks').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/);
  });

  test('rejects a blank title with 400', async () => {
    const res = await request(app).post('/api/tasks').send({ title: '   ' });
    expect(res.status).toBe(400);
  });

  test('rejects a title longer than 200 characters with 400', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 'x'.repeat(201) });
    expect(res.status).toBe(400);
  });

  test('rejects malformed JSON bodies with 400', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Content-Type', 'application/json')
      .send('{not-json');
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/tasks/:id', () => {
  test('marks a task completed and returns the updated task', async () => {
    const created = (await request(app).post('/api/tasks').send({ title: 'Learn Lambda' })).body as Task;
    const res = await request(app).patch(`/api/tasks/${created.id}`).send({ completed: true });
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
  });

  test('returns 404 when the store reports no such task', async () => {
    const res = await request(app).patch('/api/tasks/nope').send({ completed: true });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/nope/);
  });

  test('rejects a non-boolean completed field with 400', async () => {
    const created = (await request(app).post('/api/tasks').send({ title: 'Learn SQS' })).body as Task;
    const res = await request(app).patch(`/api/tasks/${created.id}`).send({ completed: 'yes' });
    expect(res.status).toBe(400);
  });
});

describe('error handling', () => {
  test('unknown routes return a JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/No route/);
  });

  test('returns a generic 500 when the store rejects (details stay in the logs)', async () => {
    const broken = fakeStore({
      listTasks: vi.fn(async () => {
        throw new Error('AccessDeniedException: dynamodb:PutItem');
      }),
    });
    const res = await request(buildApp(broken)).get('/api/tasks');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});

// ---------------------------------------------------------------------------
// Real-store round trip — requires DynamoDB Local.
// ---------------------------------------------------------------------------

const dynamoLocalUp = await isDynamoLocalReachable();

describe.skipIf(!dynamoLocalUp)('full API round-trip against the real DynamoDB store', () => {
  const client = createLocalDocumentClient();
  let tableName: string;
  let app: Express;

  beforeAll(async () => {
    tableName = await createTestTable(client);
    const store = createDynamoTaskStore({ tableName, client });
    app = createApp({ config: { ...config, tableName }, store, logger });
  });

  afterAll(async () => {
    await deleteTestTable(client, tableName);
  });

  test('create → list → complete survives a "container restart" (fresh store, same table)', async () => {
    const created = (await request(app).post('/api/tasks').send({ title: 'Learn persistence' })).body as Task;
    expect(created.completed).toBe(false);

    // A "restart": a brand-new store instance pointing at the same table.
    const restartedApp = createApp({
      config: { ...config, tableName },
      store: createDynamoTaskStore({ tableName, client }),
      logger,
    });
    const listed = (await request(restartedApp).get('/api/tasks')).body as Task[];
    expect(listed.map((t) => t.id)).toContain(created.id);

    const patched = await request(restartedApp).patch(`/api/tasks/${created.id}`).send({ completed: true });
    expect(patched.status).toBe(200);
    expect(patched.body.completed).toBe(true);

    const missing = await request(restartedApp).patch('/api/tasks/never-existed').send({ completed: true });
    expect(missing.status).toBe(404);
  });
});

describe.skipIf(dynamoLocalUp)('full API round-trip against the real DynamoDB store', () => {
  test('skips: DynamoDB Local is not running — start it with scripts/dynamodb-local.sh', () => {
    console.warn(`Skipped: no DynamoDB Local on ${LOCAL_ENDPOINT}.`);
  });
});