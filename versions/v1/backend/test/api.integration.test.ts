/**
 * Integration tests: real Express app via supertest, no network.
 * Covers the full API contract students will deploy in Stage 3/4.
 */
import { beforeEach, describe, expect, test } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import type { Config } from '../src/config';
import { createLogger } from '../src/logger';
import { createInMemoryTaskStore, type Task, type TaskStore } from '../src/task-store';

process.env.LOG_LEVEL = 'silent';

const config: Config = { port: 3000, environment: 'test' };
const logger = createLogger('test');

function buildApp(store: TaskStore = createInMemoryTaskStore()): Express {
  return createApp({ config, store, logger });
}

function fakeStore(overrides: Partial<TaskStore>): TaskStore {
  return { ...createInMemoryTaskStore(), ...overrides };
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

describe('GET /api/tasks', () => {
  test('returns an empty list before any task is created', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('lists created tasks', async () => {
    await request(app).post('/api/tasks').send({ title: 'Learn VPCs' });
    const res = await request(app).get('/api/tasks');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Learn VPCs');
  });
});

describe('POST /api/tasks', () => {
  test('creates a task and returns it with 201', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 'Learn ECS' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Learn ECS');
    expect(res.body.completed).toBe(false);
    expect(res.body.id).toBeTruthy();
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

  test('rejects a non-string title with 400', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 42 });
    expect(res.status).toBe(400);
  });

  test('rejects a title longer than 200 characters with 400', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 'x'.repeat(201) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/200/);
  });

  test('rejects malformed JSON bodies with 400', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Content-Type', 'application/json')
      .send('{not-json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

describe('PATCH /api/tasks/:id', () => {
  test('marks a task completed and returns the updated task', async () => {
    const created = (await request(app).post('/api/tasks').send({ title: 'Learn Lambda' })).body as Task;
    const res = await request(app).patch(`/api/tasks/${created.id}`).send({ completed: true });
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
  });

  test('returns 404 for an unknown task id', async () => {
    const res = await request(app).patch('/api/tasks/nope').send({ completed: true });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/nope/);
  });

  test('rejects a missing or non-boolean completed field with 400', async () => {
    const created = (await request(app).post('/api/tasks').send({ title: 'Learn SQS' })).body as Task;
    const missing = await request(app).patch(`/api/tasks/${created.id}`).send({});
    expect(missing.status).toBe(400);
    const wrongType = await request(app).patch(`/api/tasks/${created.id}`).send({ completed: 'yes' });
    expect(wrongType.status).toBe(400);
  });
});

describe('error handling', () => {
  test('unknown routes return a JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/No route/);
  });

  test('returns a generic 500 when the store throws (details stay in the logs)', async () => {
    const brokenStore = fakeStore({
      listTasks: () => {
        throw new Error('boom');
      },
    });
    const res = await request(buildApp(brokenStore)).get('/api/tasks');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});
