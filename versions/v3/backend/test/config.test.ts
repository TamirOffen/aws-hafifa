import { describe, expect, test } from 'vitest';
import { ConfigError, readConfig } from '../src/config';

describe('readConfig', () => {
  test('reads ENVIRONMENT, PORT, TABLE_NAME and AWS_REGION from the given environment', () => {
    const config = readConfig({
      ENVIRONMENT: 'dev',
      PORT: '3000',
      TABLE_NAME: 'dev-tasks',
      AWS_REGION: 'us-east-1',
    } as NodeJS.ProcessEnv);
    expect(config).toEqual({
      port: 3000,
      environment: 'dev',
      tableName: 'dev-tasks',
      awsRegion: 'us-east-1',
      dynamodbEndpointUrl: undefined,
    });
  });

  test('accepts an optional DYNAMODB_ENDPOINT_URL (local testing only)', () => {
    const config = readConfig({
      ENVIRONMENT: 'dev',
      TABLE_NAME: 'dev-tasks',
      AWS_REGION: 'us-east-1',
      DYNAMODB_ENDPOINT_URL: 'http://127.0.0.1:8000',
    } as NodeJS.ProcessEnv);
    expect(config.dynamodbEndpointUrl).toBe('http://127.0.0.1:8000');
  });

  test('treats a blank DYNAMODB_ENDPOINT_URL as unset', () => {
    const config = readConfig({
      ENVIRONMENT: 'dev',
      TABLE_NAME: 'dev-tasks',
      AWS_REGION: 'us-east-1',
      DYNAMODB_ENDPOINT_URL: '   ',
    } as NodeJS.ProcessEnv);
    expect(config.dynamodbEndpointUrl).toBeUndefined();
  });

  test('fails fast when ENVIRONMENT is missing', () => {
    expect(() => readConfig({} as NodeJS.ProcessEnv)).toThrow(ConfigError);
  });

  test('fails fast when TABLE_NAME is missing (v3 requires the table)', () => {
    expect(() => readConfig({ ENVIRONMENT: 'dev' } as NodeJS.ProcessEnv)).toThrow(/TABLE_NAME/);
  });

  test('fails fast when AWS_REGION is missing', () => {
    expect(() =>
      readConfig({ ENVIRONMENT: 'dev', TABLE_NAME: 'dev-tasks' } as NodeJS.ProcessEnv),
    ).toThrow(/AWS_REGION/);
  });

  test('fails fast when PORT is invalid', () => {
    expect(() =>
      readConfig({
        ENVIRONMENT: 'dev',
        TABLE_NAME: 'dev-tasks',
        AWS_REGION: 'us-east-1',
        PORT: 'abc',
      } as NodeJS.ProcessEnv),
    ).toThrow(/Invalid PORT/);
  });
});