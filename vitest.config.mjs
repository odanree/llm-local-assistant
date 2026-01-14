import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/vitest.setup.ts'],
  },
  resolve: {
    alias: {
      vscode: new URL('./mock/vscode.ts', import.meta.url).pathname,
    },
  },
});
