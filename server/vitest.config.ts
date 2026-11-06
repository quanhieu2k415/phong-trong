import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './test/global-setup.ts',
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    coverage: { include: ['src/**'], exclude: ['src/index.ts', 'src/seed.ts'] },
  },
});
