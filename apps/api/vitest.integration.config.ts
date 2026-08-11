import { resolve } from 'node:path';
import { config as loadEnvironment } from 'dotenv';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const projectEnvironment = resolve(process.cwd(), '../../.env');
loadEnvironment({ path: projectEnvironment });

const applicationDatabaseUrl = process.env.DATABASE_URL;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for integration tests.');
}
if (applicationDatabaseUrl === testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL must point to a database separate from DATABASE_URL.');
}

// Prisma reads DATABASE_URL. Override it only in this Vitest process and its children.
process.env.DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    globals: true,
    include: ['test/integration/**/*.integration.spec.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
