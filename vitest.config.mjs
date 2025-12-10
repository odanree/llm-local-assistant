import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/vitest.setup.ts'],
    alias: {
      vscode: '/mock/vscode.ts',
    },
  },
  resolve: {
    alias: {
      vscode: new URL('./mock/vscode.ts', import.meta.url).pathname,
    },
  },
});
