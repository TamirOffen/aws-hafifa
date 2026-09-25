import { describe, expect, test } from 'vitest';
import { ConfigError, readConfig } from '../src/config';

describe('readConfig', () => {
  test('reads ENVIRONMENT and PORT from the given environment', () => {
    const config = readConfig({ ENVIRONMENT: 'dev', PORT: '3000' } as NodeJS.ProcessEnv);
    expect(config).toEqual({ port: 3000, environment: 'dev' });
  });

  test('defaults PORT to 3000 when not set', () => {
    const config = readConfig({ ENVIRONMENT: 'dev' } as NodeJS.ProcessEnv);
    expect(config.port).toBe(3000);
  });

  test('fails fast when ENVIRONMENT is missing', () => {
    expect(() => readConfig({} as NodeJS.ProcessEnv)).toThrow(ConfigError);
    expect(() => readConfig({} as NodeJS.ProcessEnv)).toThrow(/ENVIRONMENT/);
  });

  test('fails fast when ENVIRONMENT is blank', () => {
    expect(() => readConfig({ ENVIRONMENT: '   ' } as NodeJS.ProcessEnv)).toThrow(ConfigError);
  });

  test('fails fast when PORT is not an integer', () => {
    expect(() => readConfig({ ENVIRONMENT: 'dev', PORT: 'abc' } as NodeJS.ProcessEnv)).toThrow(/Invalid PORT/);
  });

  test('fails fast when PORT is out of range', () => {
    expect(() => readConfig({ ENVIRONMENT: 'dev', PORT: '70000' } as NodeJS.ProcessEnv)).toThrow(/Invalid PORT/);
    expect(() => readConfig({ ENVIRONMENT: 'dev', PORT: '0' } as NodeJS.ProcessEnv)).toThrow(/Invalid PORT/);
  });
});
