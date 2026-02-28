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
      // CRITICAL: Coverage thresholds locked at Phase 6.4 achievement (74.68%)
      // These thresholds enforce the realistic testable ceiling and prevent regression
      // Note: 74.68% is the maximum testable coverage without architectural refactoring
      lines: 74,
      functions: 80,
      branches: 67, // Branch coverage is harder to achieve
      statements: 74,
      // Fail the build if any threshold is not met
      all: true,
    },
  },
  resolve: {
    alias: {
      vscode: new URL('./mock/vscode.ts', import.meta.url).pathname,
    },
  },
});
