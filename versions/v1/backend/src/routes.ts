/**
 * API routes, mounted under the /api prefix (see app.ts).
 *
 * WHY the /api prefix: in Stage 4 a single Application Load Balancer will route
 * "/api/*" (plus "/health") to this backend and everything else to the frontend
 * container. Same-origin, relative URLs everywhere — no CORS, ever.
 */
import { Router, type Response } from 'express';
import type { AppLogger } from './logger';
import type { TaskStore } from './task-store';
import { parseCompleted, parseTitle } from './validate';

export interface ApiRouterDeps {
  readonly store: TaskStore;
  readonly logger: AppLogger;
}

export function createApiRouter({ store, logger }: ApiRouterDeps): Router {
  const router = Router();

  router.get('/tasks', (_req, res: Response) => {
    res.json(store.listTasks());
  });

  router.post('/tasks', (req, res) => {
    const title = parseTitle(req.body?.title);
    const task = store.createTask(title);
    logger.info({ event: 'taskCreated', taskId: task.id, title: task.title }, 'Task created');
    res.status(201).json(task);
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
