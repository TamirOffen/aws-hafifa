import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // src/index.ts fails fast at module load when QUEUE_URL is missing (the
    // cold-start misconfiguration behavior you see in the Lambda console) —
    // so tests must provide it before the module is imported.
    setupFiles: ['test/setup.ts'],
  },
});