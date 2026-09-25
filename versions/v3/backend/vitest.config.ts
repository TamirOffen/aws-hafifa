import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // src/index.ts is process bootstrap (listen/shutdown) — exercised by `npm run dev`, not unit tests.
      exclude: ['src/index.ts'],
      // No thresholds here (unlike v1/v2): the DynamoDB-backed happy-path tests
      // only run when DynamoDB Local (scripts/dynamodb-local.sh) is reachable,
      // so coverage legitimately varies between machines.
    },
  },
});