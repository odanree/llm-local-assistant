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
      // DIAMOND TIER: Coverage thresholds locked at v2.11.1 achievement (81.21%)
      // These thresholds enforce enterprise-grade testing standards and prevent regression
      // Achieved through targeted testing of executor, refiner, and smartAutoCorrection modules
      lines: 81,
      functions: 82,
      branches: 73, // Branch coverage requires focused decision logic testing
      statements: 81,
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
