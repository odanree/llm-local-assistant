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
        // Lowered after removing coverage-hunting test files (10 files, ~545 tests deleted).
        // Remaining suite covers regressions, failure modes, and LLM classification cases.
        // Numbers reflect post-cleanup baseline: statements 75.4 | branches 67.6 | functions 74.2 | lines 76.1
        statements: 74,
        branches: 67,
        functions: 73,
        lines: 75,
      },
    },
  },
  resolve: {
    alias: {
      vscode: new URL('./mock/vscode.ts', import.meta.url).pathname,
    },
  },
});
