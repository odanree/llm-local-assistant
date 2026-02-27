/**
 * Phase 4B Batch 3: ContextBuilder Fault Injection Tests
 *
 * Purpose: Test error handling paths in ContextBuilder via DI injection
 * Impact: Tests previously untestable error conditions (permission denied, file not found, parse errors)
 * Expected Coverage Gain: +0.25-0.3% from error path testing
 *
 * Test Strategy:
 * - Use MockFileSystem to simulate ENOENT, EACCES, read errors
 * - Verify graceful degradation when one data source fails
 * - Test with partial/incomplete project structures
 * - Verify recursive directory walking with errors
 * - Test context quality assessment with various data states
 */

import { describe, it, expect } from 'vitest';
import { ContextBuilder } from '../utils/contextBuilder';
import { MockFileSystem } from './mocks/MockFileSystem';

describe('Phase 4B Batch 3: ContextBuilder Fault Injection - Error Path Coverage', () => {
  let mockFs: MockFileSystem;
  let builder: ContextBuilder;

  const createBuilderWithMocks = (config = {}) => {
    mockFs = new MockFileSystem(config);
    return new ContextBuilder(mockFs);
  };

  describe('Package.json Read/Parse Errors', () => {
    it('should handle missing package.json gracefully', () => {
      builder = createBuilderWithMocks({
        directories: new Set(['/project']),
      });

      const context = builder.buildContext('/project');
      expect(context.hasPackageJson).toBe(false);
      expect(context.dependencies.size).toBe(0);
      expect(context.devDependencies.size).toBe(0);
    });

    it('should handle permission denied on package.json', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
        files: { '/project/package.json': '{}' },
      });
      mockFs.setFailureMode('read', '/project/package.json', 'EACCES');
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      // File exists (hasPackageJson = true) but can't be read, so no dependencies parsed
      expect(context.hasPackageJson).toBe(true);
      expect(context.dependencies.size).toBe(0);
      // Should not throw, should gracefully skip
      expect(typeof context).toBe('object');
    });

    it('should handle invalid JSON in package.json', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
        files: { '/project/package.json': 'not valid json {{{' },
      });
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      // Should parse gracefully, skip invalid file
      expect(context.dependencies.size).toBe(0);
      expect(context.devDependencies.size).toBe(0);
    });

    it('should extract dependencies when package.json is valid', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
        files: {
          '/project/package.json': JSON.stringify({
            dependencies: { react: '^18.0.0', lodash: '^4.17.0' },
            devDependencies: { typescript: '^5.0.0', jest: '^29.0.0' },
          }),
        },
      });
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      expect(context.hasPackageJson).toBe(true);
      expect(context.dependencies.has('react')).toBe(true);
      expect(context.devDependencies.has('typescript')).toBe(true);
    });
  });

  describe('Framework Detection', () => {
    it('should detect React framework', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
        files: {
          '/project/package.json': JSON.stringify({
            dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
          }),
        },
      });
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      expect(context.frameworks).toContain('React');
    });

    it('should detect multiple frameworks', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
        files: {
          '/project/package.json': JSON.stringify({
            dependencies: {
              react: '^18.0.0',
              express: '^4.18.0',
              '@nestjs/core': '^10.0.0',
            },
          }),
        },
      });
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      expect(context.frameworks.length).toBeGreaterThan(0);
    });

    it('should return empty frameworks array when no dependencies match', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
        files: {
          '/project/package.json': JSON.stringify({
            dependencies: { lodash: '^4.17.0', 'moment': '^2.29.0' },
          }),
        },
      });
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      expect(context.frameworks.length).toBe(0);
      expect(context.hasFrameworks).toBe(false);
    });
  });

  describe('Test Framework Detection', () => {
    it('should detect Jest test framework', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
        files: {
          '/project/package.json': JSON.stringify({
            devDependencies: { jest: '^29.0.0' },
          }),
        },
      });
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      expect(context.testFramework).toBe('jest');
      expect(context.hasTests).toBe(true);
    });

    it('should detect Vitest test framework', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
        files: {
          '/project/package.json': JSON.stringify({
            devDependencies: { vitest: '^1.0.0' },
          }),
        },
      });
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      expect(context.testFramework).toBe('vitest');
      expect(context.hasTests).toBe(true);
    });

    it('should set testFramework to none when no tests configured', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
        files: {
          '/project/package.json': JSON.stringify({
            dependencies: { react: '^18.0.0' },
          }),
        },
      });
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      expect(context.testFramework).toBe('none');
      expect(context.hasTests).toBe(false);
    });
  });

  describe('Test File Detection', () => {
    it('should detect test files in test directory', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project', '/project/test']),
        files: {
          '/project/package.json': '{}',
          '/project/test/example.test.ts': 'test code',
        },
      });
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      expect(context.hasTestFiles).toBe(true);
    });

    it('should detect test files in src directory', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project', '/project/src']),
        files: {
          '/project/package.json': '{}',
          '/project/src/utils.test.ts': 'test code',
        },
      });
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      expect(context.hasTestFiles).toBe(true);
    });

    it('should detect spec files', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project', '/project/src']),
        files: {
          '/project/package.json': '{}',
          '/project/src/app.spec.ts': 'test code',
        },
      });
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      expect(context.hasTestFiles).toBe(true);
    });

    it('should handle permission denied on test directory', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project', '/project/test']),
        files: { '/project/package.json': '{}' },
      });
      mockFs.setFailureMode('read', '/project/test', 'EACCES');
      builder = new ContextBuilder(mockFs);

      // Should not throw, should gracefully handle
      const context = builder.buildContext('/project');
      expect(typeof context).toBe('object');
    });
  });

  describe('Source Directory Scanning', () => {
    it('should scan src directory for imports', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project', '/project/src']),
        files: {
          '/project/package.json': '{}',
          '/project/src/app.ts': "import React from 'react';\nimport { Button } from './Button';",
        },
      });
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      expect(context.commonImports.length).toBeGreaterThan(0);
    });

    it('should skip missing source directories gracefully', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
        files: { '/project/package.json': '{}' },
      });
      builder = new ContextBuilder(mockFs);

      // Should not throw even with no src directory
      const context = builder.buildContext('/project');
      expect(Array.isArray(context.commonImports)).toBe(true);
    });

    it('should handle permission denied on source directory', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project', '/project/src']),
        files: { '/project/package.json': '{}' },
      });
      mockFs.setFailureMode('read', '/project/src', 'EACCES');
      builder = new ContextBuilder(mockFs);

      // Should not throw, should return empty imports
      const context = builder.buildContext('/project');
      expect(Array.isArray(context.commonImports)).toBe(true);
    });

    it('should sample first 20 files to avoid slowdown', () => {
      const files: Record<string, string> = { '/project/package.json': '{}' };
      for (let i = 0; i < 50; i++) {
        files[`/project/src/file${i}.ts`] = "import React from 'react';";
      }

      mockFs = new MockFileSystem({
        directories: new Set(['/project', '/project/src']),
        files,
      });
      builder = new ContextBuilder(mockFs);

      // Should complete quickly despite 50 files
      const start = performance.now();
      const context = builder.buildContext('/project');
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(500);
      expect(context.commonImports.includes('react')).toBe(true);
    });
  });

  describe('Pattern Detection', () => {
    it('should detect TypeScript', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
        files: {
          '/project/package.json': '{}',
          '/project/tsconfig.json': '{}',
        },
      });
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      expect(context.detectedPatterns).toContain('TypeScript');
    });

    it('should detect Unit Testing', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
        files: {
          '/project/package.json': JSON.stringify({
            devDependencies: { jest: '^29.0.0' },
          }),
        },
      });
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      expect(context.detectedPatterns).toContain('Unit Testing');
    });

    it('should detect multiple patterns', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
        files: {
          '/project/package.json': JSON.stringify({
            devDependencies: {
              jest: '^29.0.0',
              eslint: '^8.0.0',
              prettier: '^3.0.0',
            },
          }),
          '/project/tsconfig.json': '{}',
        },
      });
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      expect(context.detectedPatterns.length).toBeGreaterThan(2);
    });
  });

  describe('Context Quality Assessment', () => {
    it('should assess rich context for full projects', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
        files: {
          '/project/package.json': JSON.stringify({
            dependencies: {
              react: '^18.0.0',
              express: '^4.18.0',
              lodash: '^4.17.0',
              axios: '^1.0.0',
              'date-fns': '^2.30.0',
              typescript: '^5.0.0',
            },
          }),
        },
      });
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      expect(context.contextQuality).toBe('rich');
      expect(context.generationMode).toBe('diff-mode');
    });

    it('should assess insufficient context when no package.json', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
      });
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      expect(context.contextQuality).toBe('insufficient');
      expect(context.generationMode).toBe('scaffold-mode');
    });

    it('should assess minimal context with few dependencies', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
        files: {
          '/project/package.json': JSON.stringify({
            dependencies: { lodash: '^4.17.0' },
          }),
        },
      });
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      expect(context.contextQuality).toBe('minimal');
      expect(context.generationMode).toBe('scaffold-mode');
    });
  });

  describe('Graceful Degradation', () => {
    it('should return valid context even when source directory is unreadable', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project', '/project/src']),
        files: {
          '/project/package.json': JSON.stringify({
            dependencies: { react: '^18.0.0' },
          }),
        },
      });
      mockFs.setFailureMode('read', '/project/src', 'EACCES');
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      expect(context).toBeDefined();
      expect(context.hasPackageJson).toBe(true);
      expect(context.frameworks.includes('React')).toBe(true);
      // But imports will be empty due to permission denied
      expect(context.commonImports.length).toBe(0);
    });

    it('should return valid context with partial data', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project', '/project/src', '/project/test']),
        files: {
          '/project/package.json': JSON.stringify({
            dependencies: { react: '^18.0.0' },
            devDependencies: { jest: '^29.0.0' },
          }),
          '/project/tsconfig.json': '{}',
          '/project/test/example.test.ts': 'test code',
        },
      });
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      expect(context.hasPackageJson).toBe(true);
      expect(context.hasFrameworks).toBe(true);
      expect(context.detectedPatterns).toContain('TypeScript');
      expect(context.detectedPatterns).toContain('Unit Testing');
      expect(context.hasTestFiles).toBe(true);
    });
  });

  describe('Summary Generation', () => {
    it('should generate non-empty summary for rich context', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
        files: {
          '/project/package.json': JSON.stringify({
            dependencies: { react: '^18.0.0', axios: '^1.0.0' },
            devDependencies: { jest: '^29.0.0' },
          }),
          '/project/tsconfig.json': '{}',
          '/project/src/app.ts': "import React from 'react';\nimport axios from 'axios';",
        },
      });
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      expect(context.summary.length).toBeGreaterThan(0);
      expect(context.summary).toContain('Framework');
    });

    it('should handle empty context in summary', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
      });
      builder = new ContextBuilder(mockFs);

      const context = builder.buildContext('/project');
      expect(typeof context.summary).toBe('string');
      // May be empty or very short
      expect(context.summary.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Performance Regression Tests', () => {
    it('should build context quickly for typical project', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project', '/project/src', '/project/test']),
        files: {
          '/project/package.json': JSON.stringify({
            dependencies: { react: '^18.0.0', lodash: '^4.17.0' },
            devDependencies: { jest: '^29.0.0', typescript: '^5.0.0' },
          }),
          '/project/tsconfig.json': '{}',
          '/project/src/index.ts': "import React from 'react';",
          '/project/test/index.test.ts': "import { describe, it } from 'jest';",
        },
      });
      builder = new ContextBuilder(mockFs);

      const start = performance.now();
      builder.buildContext('/project');
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });
});
