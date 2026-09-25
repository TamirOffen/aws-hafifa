/**
 * API routes, mounted under the /api prefix (see app.ts).
 *
 * WHY the /api prefix: a single Application Load Balancer routes "/api/*"
 * (plus "/health") to this backend and everything else to the frontend
 * container. Same-origin, relative URLs everywhere — no CORS, ever.
 *
 * v3 change: the store is now DynamoDB-backed and async, so handlers chain
 * promises to the error middleware explicitly (Express 4 does not catch
 * async/await rejections by itself).
 */
import { Router, type NextFunction, type Response } from 'express';
import type { AppLogger } from './logger';
import type { Task, TaskStore } from './task-store';
import { parseCompleted, parseTitle } from './validate';

export interface ApiRouterDeps {
  readonly store: TaskStore;
  readonly logger: AppLogger;
}

export function createApiRouter({ store, logger }: ApiRouterDeps): Router {
  const router = Router();

  router.get('/tasks', (_req, res: Response, next: NextFunction) => {
    store.listTasks().then((tasks) => res.json(tasks), next);
  });

  router.post('/tasks', (req, res, next) => {
    try {
      const title = parseTitle(req.body?.title);
      store.createTask(title).then((task) => {
        logger.info({ event: 'taskCreated', taskId: task.id, title: task.title }, 'Task created');
        res.status(201).json(task);
      }, next);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/tasks/:id', (req, res, next) => {
    try {
      const completed = parseCompleted(req.body?.completed);
      store.setCompleted(req.params.id, completed).then((task) => {
        if (!task) {
          res.status(404).json({ error: `No task with id ${req.params.id}` });
          return;
        }
        logger.info({ event: 'taskUpdated', taskId: task.id, completed: task.completed }, 'Task updated');
        res.json(task);
      }, next);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export type { Task };