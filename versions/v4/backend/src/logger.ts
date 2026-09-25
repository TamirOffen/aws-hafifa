/**
 * Structured JSON logging.
 *
 * WHY JSON: every line is one JSON object with a stable set of fields. When the
 * app runs on ECS (Stage 3+), these lines are shipped to CloudWatch Logs
 * (Stage 6) exactly as they are — queryable, filterable, alarm-able. The same
 * logs you read in your terminal in Stage 0 are the logs you will grep in AWS.
 */
import pino from 'pino';

export type LogFields = Record<string, unknown>;

/** Minimal logger surface the app depends on — trivially fakeable in tests. */
export interface AppLogger {
  info(fields: LogFields, message: string): void;
  warn(fields: LogFields, message: string): void;
  error(fields: LogFields, message: string): void;
}

export function createLogger(environment: string): AppLogger {
  const pinoLogger = pino({
    level: process.env.LOG_LEVEL ?? 'info',
    // Every line carries the environment so a log line is never ambiguous
    // about which deployment produced it.
    base: { environment },
    formatters: { level: (label) => ({ level: label }) },
  });

  return {
    info: (fields, message) => pinoLogger.info(fields, message),
    warn: (fields, message) => pinoLogger.warn(fields, message),
    error: (fields, message) => pinoLogger.error(fields, message),
  };
}
