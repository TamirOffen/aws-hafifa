/**
 * Integration tests: real Express app via supertest, fake SQS publisher.
 * Covers the full v2 API contract, including publish-on-create behavior.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import type { Config } from '../src/config';
import { createSqsPublisher, type SQSClientLike, type TaskEventPublisher } from '../src/events';
import { createLogger } from '../src/logger';
import { createInMemoryTaskStore, type Task, type TaskStore } from '../src/task-store';

process.env.LOG_LEVEL = 'silent';

const config: Config = {
  port: 3000,
  environment: 'test',
  queueUrl: 'https://sqs.example/queue',
};
const logger = createLogger('test');

function buildApp(publisher: TaskEventPublisher = fakePublisher()): Express {
  const store = createInMemoryTaskStore();
  return createApp({ config, store, publisher, logger });
}

function fakePublisher(): TaskEventPublisher {
  return { publishTaskCreated: vi.fn(async () => undefined) };
}

function brokenStore(): TaskStore {
  return {
    ...createInMemoryTaskStore(),
    listTasks: () => {
      throw new Error('boom');
    },
  } as TaskStore;
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
});

describe('POST /api/tasks (v2: create + publish TASK_CREATED)', () => {
  test('creates the task and publishes a TASK_CREATED event for it', async () => {
    const publisher = fakePublisher();
    const res = await request(buildApp(publisher)).post('/api/tasks').send({ title: 'Learn Lambda' });

    expect(res.status).toBe(201);
    expect(publisher.publishTaskCreated).toHaveBeenCalledTimes(1);
    const publishedTask = vi.mocked(publisher.publishTaskCreated).mock.calls[0][0] as Task;
    expect(publishedTask.id).toBe(res.body.id);
    expect(publishedTask.title).toBe('Learn Lambda');
  });

  test('still returns 201 when the SQS send fails (best-effort event, logged not thrown)', async () => {
    // Simulates the Stage 7 break-it: task role missing sqs:SendMessage.
    // The real publisher catches the error and logs it — POST still succeeds.
    const sqs: SQSClientLike = {
      send: vi.fn(async () => {
        throw new Error('AccessDenied: sqs:SendMessage is missing');
      }),
    };
    const publisher = createSqsPublisher({ queueUrl: config.queueUrl, sqs, logger });
    const res = await request(buildApp(publisher)).post('/api/tasks').send({ title: 'Learn IAM' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Learn IAM');
    expect(sqs.send).toHaveBeenCalledTimes(1);
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
    const created = (await request(app).post('/api/tasks').send({ title: 'Learn Streams' })).body as Task;
    const res = await request(app).patch(`/api/tasks/${created.id}`).send({ completed: true });
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
  });

  test('returns 404 for an unknown task id', async () => {
    const res = await request(app).patch('/api/tasks/nope').send({ completed: true });
    expect(res.status).toBe(404);
  });

  test('rejects a non-boolean completed field with 400', async () => {
    const created = (await request(app).post('/api/tasks').send({ title: 'Learn DLQs' })).body as Task;
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

  test('returns a generic 500 when the store throws (details stay in the logs)', async () => {
    const app = createApp({ config, store: brokenStore(), publisher: fakePublisher(), logger });
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});
