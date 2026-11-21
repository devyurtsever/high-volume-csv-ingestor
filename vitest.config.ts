import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false, // Prevents concurrent database truncation clashes in integration tests
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5433/customer_import_test',
      REDIS_URL: 'redis://localhost:6380/1',
      MAX_FILE_SIZE_BYTES: '1024',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'dist/', 'tests/'],
    },
  },
});
