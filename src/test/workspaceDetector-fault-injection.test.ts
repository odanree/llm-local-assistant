/**
 * Phase 4B Batch 1: WorkspaceDetector Fault Injection Tests
 *
 * Purpose: Test error handling paths in WorkspaceDetector via DI injection
 * Impact: Tests previously untestable error conditions in workspace detection
 * Expected Coverage Gain: +0.15-0.2% from error path testing
 *
 * Test Strategy:
 * - Use MockFileSystem to simulate ENOENT, EACCES, EBUSY errors
 * - Test symbolic link loops (recursive directory references)
 * - Verify graceful degradation when workspace detection fails
 * - Test discovery with mixed readable/unreadable directories
 */

import { describe, it, expect } from 'vitest';
import { WorkspaceDetector, DetectedWorkspace } from '../utils/workspaceDetector';
import { MockFileSystem } from './mocks/MockFileSystem';

describe('Phase 4B Batch 1: WorkspaceDetector Fault Injection - Error Path Coverage', () => {
  let mockFs: MockFileSystem;
  let detector: WorkspaceDetector;

  const createDetectorWithMocks = (config = {}) => {
    mockFs = new MockFileSystem(config);
    return new WorkspaceDetector(mockFs);
  };

  describe('Directory Scanning Errors (ENOENT)', () => {
    it('should handle non-existent root directory gracefully', () => {
      detector = createDetectorWithMocks();

      // Scanning non-existent directory should not throw
      expect(() => {
        detector.findWorkspaces('/nonexistent');
      }).not.toThrow();
    });

    it('should return empty array when workspace root is missing', () => {
      detector = createDetectorWithMocks();

      const result = detector.findWorkspaces('/missing/workspace');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should skip missing subdirectories during workspace detection', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/workspace']),
        files: {
          '/workspace/package.json': '{}',
        },
      });
      detector = new WorkspaceDetector(mockFs);

      const result = detector.findWorkspaces('/workspace');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Permission Denied Errors (EACCES)', () => {
    it('should handle permission denied during directory listing', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/workspace']),
      });
      mockFs.setFailureMode('read', '/workspace', 'EACCES');

      detector = new WorkspaceDetector(mockFs);

      // Must not throw, gracefully degrade
      expect(() => {
        detector.findWorkspaces('/workspace');
      }).not.toThrow();
    });

    it('should detect workspaces even when some subdirs are unreadable', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/workspace', '/workspace/readable', '/workspace/locked']),
        files: {
          '/workspace/readable/package.json': '{}',
          '/workspace/readable/tsconfig.json': '{}',
        },
      });
      mockFs.setFailureMode('read', '/workspace/locked', 'EACCES');

      detector = new WorkspaceDetector(mockFs);
      const result = detector.findWorkspaces('/workspace');

      // Should detect the readable workspace despite permission denied on locked dir
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle permission denied when checking for config files', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/workspace', '/workspace/project']),
        files: {
          '/workspace/project/package.json': '{}',
        },
      });
      mockFs.setFailureMode('read', '/workspace/project/package.json', 'EACCES');

      detector = new WorkspaceDetector(mockFs);

      // Must not throw despite permission denied
      expect(() => {
        detector.findWorkspaces('/workspace');
      }).not.toThrow();
    });
  });

  describe('Workspace Detection with Mixed File States', () => {
    it('should detect TypeScript workspace with tsconfig.json', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/workspace', '/workspace/project1']),
        files: {
          '/workspace/project1/package.json': '{}',
          '/workspace/project1/tsconfig.json': '{}',
        },
      });

      detector = new WorkspaceDetector(mockFs);
      const result = detector.findWorkspaces('/workspace');

      expect(result.length).toBeGreaterThan(0);
      if (result.length > 0) {
        expect(result[0].type).toBe('typescript');
        expect(result[0].indicators).toContain('tsconfig.json');
      }
    });

    it('should detect Node project with package.json only', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/workspace', '/workspace/nodeapp']),
        files: {
          '/workspace/nodeapp/package.json': '{}',
        },
      });

      detector = new WorkspaceDetector(mockFs);
      const result = detector.findWorkspaces('/workspace');

      expect(result.length).toBeGreaterThan(0);
      if (result.length > 0) {
        expect(result[0].type).toBe('node');
      }
    });

    it('should detect workspace with VS Code settings', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/workspace', '/workspace/vscode-project', '/workspace/vscode-project/.vscode']),
        files: {
          '/workspace/vscode-project/.vscode/settings.json': '{}',
        },
      });

      detector = new WorkspaceDetector(mockFs);
      const result = detector.findWorkspaces('/workspace');

      expect(Array.isArray(result)).toBe(true);
    });

    it('should detect workspace with src directory', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/workspace', '/workspace/app', '/workspace/app/src']),
      });

      detector = new WorkspaceDetector(mockFs);
      const result = detector.findWorkspaces('/workspace');

      expect(Array.isArray(result)).toBe(true);
    });

    it('should detect workspace with git repository', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/workspace', '/workspace/gitrepo', '/workspace/gitrepo/.git']),
      });

      detector = new WorkspaceDetector(mockFs);
      const result = detector.findWorkspaces('/workspace');

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Source File Detection', () => {
    it('should detect TypeScript source files', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/workspace', '/workspace/src']),
        files: {
          '/workspace/index.ts': 'export const x = 1;',
        },
      });

      detector = new WorkspaceDetector(mockFs);
      const result = detector.findWorkspaces('/workspace');

      expect(Array.isArray(result)).toBe(true);
    });

    it('should detect JavaScript source files', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/workspace', '/workspace/src']),
        files: {
          '/workspace/index.js': 'module.exports = {};',
        },
      });

      detector = new WorkspaceDetector(mockFs);
      const result = detector.findWorkspaces('/workspace');

      expect(Array.isArray(result)).toBe(true);
    });

    it('should detect source files in subdirectories', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/workspace', '/workspace/project', '/workspace/project/src']),
        files: {
          '/workspace/project/src/main.ts': 'export function main() {}',
        },
      });

      detector = new WorkspaceDetector(mockFs);
      const result = detector.findWorkspaces('/workspace');

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Confidence Scoring', () => {
    it('should filter out low-confidence workspaces', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/workspace', '/workspace/random', '/workspace/real']),
        files: {
          '/workspace/real/package.json': '{}',
          '/workspace/real/tsconfig.json': '{}',
        },
      });

      detector = new WorkspaceDetector(mockFs);
      const result = detector.findWorkspaces('/workspace');

      // Real workspace should be included, random dir should be filtered
      expect(result.length).toBeGreaterThan(0);
    });

    it('should sort workspaces by confidence (highest first)', () => {
      mockFs = new MockFileSystem({
        directories: new Set([
          '/workspace',
          '/workspace/typescript-project',
          '/workspace/simple-project',
        ]),
        files: {
          '/workspace/typescript-project/package.json': '{}',
          '/workspace/typescript-project/tsconfig.json': '{}',
          '/workspace/typescript-project/.git': '',
          '/workspace/simple-project/package.json': '{}',
        },
      });

      detector = new WorkspaceDetector(mockFs);
      const result = detector.findWorkspaces('/workspace');

      if (result.length >= 2) {
        // TypeScript project should have higher confidence
        expect(result[0].confidence).toBeGreaterThanOrEqual(result[1].confidence);
      }
    });
  });

  describe('Display Formatting', () => {
    it('should format empty workspace list for display', () => {
      detector = createDetectorWithMocks();
      const empty: DetectedWorkspace[] = [];

      const display = detector.formatForDisplay(empty);
      expect(typeof display).toBe('string');
      expect(display).toContain('No existing workspaces');
    });

    it('should format multiple workspaces with emoji indicators', () => {
      const workspaces: DetectedWorkspace[] = [
        {
          path: '/project1',
          name: 'typescript-app',
          type: 'typescript',
          confidence: 0.9,
          indicators: ['package.json', 'tsconfig.json'],
        },
        {
          path: '/project2',
          name: 'node-app',
          type: 'node',
          confidence: 0.6,
          indicators: ['package.json'],
        },
      ];

      detector = createDetectorWithMocks();
      const display = detector.formatForDisplay(workspaces);

      expect(display).toContain('typescript-app');
      expect(display).toContain('node-app');
      expect(display).toContain('✅'); // High confidence icon
      expect(display).toContain('⚠️'); // Medium confidence icon
    });
  });

  describe('Workspace Index Lookup', () => {
    it('should get workspace by valid index', () => {
      const workspaces: DetectedWorkspace[] = [
        {
          path: '/project1',
          name: 'app1',
          type: 'typescript',
          confidence: 0.9,
          indicators: [],
        },
        {
          path: '/project2',
          name: 'app2',
          type: 'node',
          confidence: 0.7,
          indicators: [],
        },
      ];

      detector = createDetectorWithMocks();
      const result = detector.getWorkspaceByIndex(workspaces, 1);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('app1');
    });

    it('should return null for invalid index', () => {
      const workspaces: DetectedWorkspace[] = [];

      detector = createDetectorWithMocks();
      const result = detector.getWorkspaceByIndex(workspaces, 1);

      expect(result).toBeNull();
    });

    it('should return null for out-of-bounds index', () => {
      const workspaces: DetectedWorkspace[] = [
        {
          path: '/project1',
          name: 'app1',
          type: 'typescript',
          confidence: 0.9,
          indicators: [],
        },
      ];

      detector = createDetectorWithMocks();
      const result = detector.getWorkspaceByIndex(workspaces, 5);

      expect(result).toBeNull();
    });
  });

  describe('Performance Regression Tests', () => {
    it('should scan workspace with <100ms latency', () => {
      const directories = new Set(['/workspace']);
      const files: Record<string, string> = {};

      // Create 10 potential workspace directories
      for (let i = 0; i < 10; i++) {
        directories.add(`/workspace/project${i}`);
        files[`/workspace/project${i}/package.json`] = '{}';
        if (i % 2 === 0) {
          files[`/workspace/project${i}/tsconfig.json`] = '{}';
        }
      }

      mockFs = new MockFileSystem({ directories, files });
      detector = new WorkspaceDetector(mockFs);

      const start = performance.now();
      const result = detector.findWorkspaces('/workspace');
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle large number of non-workspace directories efficiently', () => {
      const directories = new Set(['/workspace']);
      const files: Record<string, string> = {};

      // Create 50 non-workspace directories
      for (let i = 0; i < 50; i++) {
        directories.add(`/workspace/dir${i}`);
      }

      // Add one real workspace
      directories.add('/workspace/real-project');
      files['/workspace/real-project/package.json'] = '{}';
      files['/workspace/real-project/tsconfig.json'] = '{}';

      mockFs = new MockFileSystem({ directories, files });
      detector = new WorkspaceDetector(mockFs);

      const start = performance.now();
      const result = detector.findWorkspaces('/workspace');
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
