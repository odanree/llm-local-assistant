import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/vitest.setup.ts'],
    exclude: [
      'node_modules',
      '.claude/worktrees/**',
      'dist/**',
      'out/**',
      'examples/**', // Exclude examples folder (contains zod tests in node_modules)
      '**/examples/**', // Exclude examples at any level
      '**/examples/node_modules/**', // Explicitly exclude examples node_modules
      'tests-legacy-backup-wave1-20260226/**', // Phase 5 Wave 1 backup
      'tests-legacy-backup-*/**', // All legacy backup directories
    ],
    onConsoleLog(log, type) {
      // Suppress specific console logs if needed
      if (log.includes && log.includes('git')) {
        return false;
      }
    },
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        '.claude/worktrees/',
        'src/vitest.setup.ts',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/mock/**',
        'src/test/executor.shared-mocks.ts', // Test utilities don't need coverage
      ],
      thresholds: {
        // Updated to match post-PR-71 coverage baseline (planner/semanticValidator/smartAutoCorrection passes)
        // Numbers reflect current All Files row: statements 80.04 | branches 71.28 | functions 80.02 | lines 80.52
        statements: 80,
        branches: 71,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      vscode: new URL('./mock/vscode.ts', import.meta.url).pathname,
    },
  },
});
