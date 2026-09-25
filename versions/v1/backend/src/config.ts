/**
 * Application configuration — read once at startup, fail fast.
 *
 * WHY: a container that starts with missing configuration should die loudly at
 * boot (where ECS surfaces the stopped-task reason) instead of failing
 * mysteriously on the first request. This file is the single place that reads
 * process.env — everything else receives a typed, immutable Config object.
 */

export interface Config {
  readonly port: number;
  readonly environment: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const DEFAULT_PORT = 3000;

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const environment = env.ENVIRONMENT?.trim();
  if (!environment) {
    throw new ConfigError(
      'Missing required environment variable ENVIRONMENT (expected "dev" or "prod"). ' +
        'The API refuses to start without it — see Stage 3 of the workshop (task definition environment variables).',
    );
  }

  const portRaw = env.PORT ?? String(DEFAULT_PORT);
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(
      `Invalid PORT value "${portRaw}" — expected an integer between 1 and 65535.`,
    );
  }

  return { port, environment };
}
