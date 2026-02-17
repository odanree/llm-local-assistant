import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/vitest.setup.ts',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/mock/**',
      ],
      lines: 70,
      functions: 70,
      branches: 65,
      statements: 70,
    },
  },
  resolve: {
    alias: {
      vscode: new URL('./mock/vscode.ts', import.meta.url).pathname,
    },
  },
});
