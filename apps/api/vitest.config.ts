import { defineConfig } from 'vitest/config';

import { testDatabaseUrl as testDb } from './tests/testDb';

// Tests run against a SEPARATE database. It is wiped and re-seeded.

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/globalSetup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DEMO_MODE: 'true',
      DATABASE_URL: testDb,
      JWT_SECRET: 'test-secret-0123456789-0123456789-0123456789',
      VISION_API_KEY: 'test-vision-key-0123456789',
      CORS_ORIGINS: 'http://localhost:5173',
    },
  },
});
