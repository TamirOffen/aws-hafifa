/**
 * Express app assembly: middleware, health endpoints, API routes, error handling.
 *
 * The app is a pure factory — it takes its dependencies (config, store, logger)
 * and returns an Express instance without touching the network. index.ts is the
 * only file that binds a port, which keeps the whole app testable with
 * supertest.
 */
import express, {
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { randomUUID } from 'node:crypto';
import type { AppLogger, LogFields } from './logger';
import { createApiRouter } from './routes';
import type { TaskStore } from './task-store';
import type { Config } from './config';
import { ValidationError } from './validate';

const REQUEST_BODY_LIMIT = '100kb';

export interface AppDeps {
  readonly config: Config;
  readonly store: TaskStore;
  readonly logger: AppLogger;
}

export function createApp({ config, store, logger }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
  app.use(requestLogger(logger));

  // Health check target for the ALB target group (Stage 4).
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', environment: config.environment });
  });

  // The frontend header reads this to show which environment it is talking to.
  app.get('/api/environment', (_req, res) => {
    res.json({ environment: config.environment });
  });

  app.use('/api', createApiRouter({ store, logger }));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}

function requestLogger(logger: AppLogger): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = randomUUID();
    const startedAt = process.hrtime.bigint();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const fields: LogFields = {
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      };
      logger.info(fields, 'request completed');
    });
    next();
  };
}

function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
}

function errorHandler(logger: AppLogger) {
  return (err: unknown, req: Request, res: Response, next: NextFunction): void => {
    const status =
      err instanceof ValidationError
        ? 400
        : typeof (err as { status?: unknown })?.status === 'number'
          ? (err as { status: number }).status
          : 500;

    if (status >= 500) {
      logger.error(
        { err: serializeError(err), requestId: res.locals.requestId, path: req.originalUrl },
        'Unhandled error',
      );
    } else {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), status, path: req.originalUrl },
        'Request rejected',
      );
    }

    if (res.headersSent) {
      next(err);
      return;
    }
    // User-facing errors stay generic for 5xx (no stack traces to clients);
    // the details live in the logs.
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : err instanceof Error ? err.message : String(err) });
  };
}

function serializeError(err: unknown): LogFields {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { error: String(err) };
}
