import { defineConfig } from 'vitest/config';
import path from 'path';

// Mirrors the '@' path alias from tsconfig.json so lib modules using
// '@/lib/...' imports resolve identically under the test runner.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
