/**
 * API routes, mounted under the /api prefix (see app.ts).
 *
 * WHY the /api prefix: a single Application Load Balancer routes "/api/*"
 * (plus "/health") to this backend and everything else to the frontend
 * container. Same-origin, relative URLs everywhere — no CORS, ever.
 *
 * v2 change: creating a task also publishes TASK_CREATED to SQS (best-effort,
 * see src/events.ts).
 */
import { Router, type NextFunction, type Response } from 'express';
import type { TaskEventPublisher } from './events';
import type { AppLogger } from './logger';
import type { TaskStore } from './task-store';
import { parseCompleted, parseTitle } from './validate';

export interface ApiRouterDeps {
  readonly store: TaskStore;
  readonly publisher: TaskEventPublisher;
  readonly logger: AppLogger;
}

export function createApiRouter({ store, publisher, logger }: ApiRouterDeps): Router {
  const router = Router();

  router.get('/tasks', (_req, res: Response) => {
    res.json(store.listTasks());
  });

  // Express 4 does not catch errors thrown inside async handlers, so this
  // stays a sync handler: validation errors go straight to next(err), and the
  // awaited publish is chained explicitly. (publishTaskCreated never rejects
  // — it logs failures internally — but the .catch(next) guard keeps that
  // promise visible to the error handler if it ever did.)
  router.post('/tasks', (req, res, next: NextFunction) => {
    try {
      const title = parseTitle(req.body?.title);
      const task = store.createTask(title);
      logger.info({ event: 'taskCreated', taskId: task.id, title: task.title }, 'Task created');
      void publisher
        .publishTaskCreated(task)
        .then(() => res.status(201).json(task))
        .catch(next);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/tasks/:id', (req, res) => {
    const completed = parseCompleted(req.body?.completed);
    const task = store.setCompleted(req.params.id, completed);
    if (!task) {
      res.status(404).json({ error: `No task with id ${req.params.id}` });
      return;
    }
    logger.info({ event: 'taskUpdated', taskId: task.id, completed: task.completed }, 'Task updated');
    res.json(task);
  });

  return router;
}
