import { describe, expect, test } from 'vitest';
import { ConfigError, readConfig } from '../src/config';

describe('readConfig', () => {
  test('reads ENVIRONMENT, PORT and QUEUE_URL from the given environment', () => {
    const config = readConfig({
      ENVIRONMENT: 'dev',
      PORT: '3000',
      QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123456789012/dev-task-events',
    } as NodeJS.ProcessEnv);
    expect(config).toEqual({
      port: 3000,
      environment: 'dev',
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/dev-task-events',
    });
  });

  test('defaults PORT to 3000 when not set', () => {
    const config = readConfig({ ENVIRONMENT: 'dev', QUEUE_URL: 'https://example/queue' } as NodeJS.ProcessEnv);
    expect(config.port).toBe(3000);
  });

  test('fails fast when ENVIRONMENT is missing', () => {
    expect(() => readConfig({} as NodeJS.ProcessEnv)).toThrow(ConfigError);
    expect(() => readConfig({} as NodeJS.ProcessEnv)).toThrow(/ENVIRONMENT/);
  });

  test('fails fast when QUEUE_URL is missing (v2 requires the queue)', () => {
    expect(() => readConfig({ ENVIRONMENT: 'dev' } as NodeJS.ProcessEnv)).toThrow(ConfigError);
    expect(() => readConfig({ ENVIRONMENT: 'dev' } as NodeJS.ProcessEnv)).toThrow(/QUEUE_URL/);
  });

  test('fails fast when QUEUE_URL is blank', () => {
    expect(() => readConfig({ ENVIRONMENT: 'dev', QUEUE_URL: '   ' } as NodeJS.ProcessEnv)).toThrow(ConfigError);
  });

  test('fails fast when PORT is not an integer', () => {
    expect(() => readConfig({ ENVIRONMENT: 'dev', QUEUE_URL: 'q', PORT: 'abc' } as NodeJS.ProcessEnv)).toThrow(/Invalid PORT/);
  });

  test('fails fast when PORT is out of range', () => {
    expect(() => readConfig({ ENVIRONMENT: 'dev', QUEUE_URL: 'q', PORT: '70000' } as NodeJS.ProcessEnv)).toThrow(/Invalid PORT/);
  });
});
