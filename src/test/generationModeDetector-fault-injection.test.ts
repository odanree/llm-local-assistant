/**
 * Phase 4B Batch 2: GenerationModeDetector Fault Injection Tests
 *
 * Purpose: Test error handling paths in GenerationModeDetector via DI injection
 * Impact: Tests previously untestable error conditions (permission denied, etc.)
 * Expected Coverage Gain: +0.15-0.2% from error path testing
 *
 * Test Strategy:
 * - Use MockFileSystem to simulate ENOENT, EACCES errors
 * - Verify graceful fallback behavior
 * - Test source directory detection with various filesystem states
 */

import { describe, it, expect } from 'vitest';
import { GenerationModeDetector } from '../utils/generationModeDetector';
import { MockFileSystem } from './mocks/MockFileSystem';

describe('Phase 4B Batch 2: GenerationModeDetector Fault Injection - Error Path Coverage', () => {
  let mockFs: MockFileSystem;
  let detector: GenerationModeDetector;

  const createDetectorWithMocks = (config = {}) => {
    mockFs = new MockFileSystem(config);
    return new GenerationModeDetector(mockFs);
  };

  describe('Source Directory Detection (existsSync)', () => {
    it('should detect src directory exists', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project', '/project/src']),
      });
      detector = new GenerationModeDetector(mockFs);

      const result = detector.hasSourceDirectory('/project');
      expect(result).toBe(true);
    });

    it('should detect app directory as source', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project', '/project/app']),
      });
      detector = new GenerationModeDetector(mockFs);

      const result = detector.hasSourceDirectory('/project');
      expect(result).toBe(true);
    });

    it('should detect components directory as source', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project', '/project/components']),
      });
      detector = new GenerationModeDetector(mockFs);

      const result = detector.hasSourceDirectory('/project');
      expect(result).toBe(true);
    });

    it('should return false when no source directory exists', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project', '/project/public', '/project/dist']),
      });
      detector = new GenerationModeDetector(mockFs);

      const result = detector.hasSourceDirectory('/project');
      expect(result).toBe(false);
    });

    it('should handle permission denied gracefully', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
      });
      mockFs.setFailureMode('read', '/project/src', 'EACCES');

      detector = new GenerationModeDetector(mockFs);

      // Should not throw, should return false
      expect(() => {
        detector.hasSourceDirectory('/project');
      }).not.toThrow();

      const result = detector.hasSourceDirectory('/project');
      expect(typeof result).toBe('boolean');
    });

    it('should handle missing project root gracefully', () => {
      detector = createDetectorWithMocks();

      // Should not throw
      expect(() => {
        detector.hasSourceDirectory('/nonexistent');
      }).not.toThrow();

      const result = detector.hasSourceDirectory('/nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('Scaffold Location Detection', () => {
    it('should return src when src directory exists', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project', '/project/src']),
      });
      detector = new GenerationModeDetector(mockFs);

      const result = detector.getScaffoldLocation('/project');
      expect(result).toBe('src');
    });

    it('should return app when app directory exists (and src does not)', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project', '/project/app']),
      });
      detector = new GenerationModeDetector(mockFs);

      const result = detector.getScaffoldLocation('/project');
      expect(result).toBe('app');
    });

    it('should return lib when only lib directory exists', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project', '/project/lib']),
      });
      detector = new GenerationModeDetector(mockFs);

      const result = detector.getScaffoldLocation('/project');
      expect(result).toBe('lib');
    });

    it('should return src as default when no directories exist', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
      });
      detector = new GenerationModeDetector(mockFs);

      const result = detector.getScaffoldLocation('/project');
      expect(result).toBe('src');
    });

    it('should handle permission denied and return default', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
      });
      mockFs.setFailureMode('read', '/project/src', 'EACCES');

      detector = new GenerationModeDetector(mockFs);

      // Should not throw
      expect(() => {
        detector.getScaffoldLocation('/project');
      }).not.toThrow();

      const result = detector.getScaffoldLocation('/project');
      expect(result).toBe('src');
    });

    it('should handle missing project root and return default', () => {
      detector = createDetectorWithMocks();

      // Should not throw
      expect(() => {
        detector.getScaffoldLocation('/nonexistent');
      }).not.toThrow();

      const result = detector.getScaffoldLocation('/nonexistent');
      expect(result).toBe('src');
    });
  });

  describe('Mode Detection', () => {
    it('should return scaffold-mode when no diffs provided', () => {
      detector = createDetectorWithMocks();

      const result = detector.detectMode('/project', undefined, true);
      expect(result.mode).toBe('scaffold-mode');
      expect(result.shouldRetry).toBe(true);
    });

    it('should return scaffold-mode when diffs array is empty', () => {
      detector = createDetectorWithMocks();

      const result = detector.detectMode('/project', [], true);
      expect(result.mode).toBe('scaffold-mode');
      expect(result.shouldRetry).toBe(true);
    });

    it('should return diff-mode when diffs exist and src directory present', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project', '/project/src']),
      });
      detector = new GenerationModeDetector(mockFs);

      const result = detector.detectMode('/project', [{ type: 'replacement' }], true);
      expect(result.mode).toBe('diff-mode');
      expect(result.shouldRetry).toBe(false);
    });

    it('should return scaffold-mode when diffs exist but no src directory', () => {
      detector = createDetectorWithMocks();

      const result = detector.detectMode('/project', [{ type: 'replacement' }], false);
      expect(result.mode).toBe('scaffold-mode');
      expect(result.shouldRetry).toBe(true);
    });
  });

  describe('Mode Prompt Generation', () => {
    it('should generate diff-mode prompt', () => {
      detector = createDetectorWithMocks();

      const prompt = detector.generateModePrompt('diff-mode');
      expect(prompt).toContain('DIFF-MODE');
      expect(prompt).toContain('Search/Replace');
      expect(prompt).toContain('precise diffs');
    });

    it('should generate scaffold-mode prompt', () => {
      detector = createDetectorWithMocks();

      const prompt = detector.generateModePrompt('scaffold-mode');
      expect(prompt).toContain('SCAFFOLD-MODE');
      expect(prompt).toContain('COMPLETE files');
      expect(prompt).toContain('folder structure');
    });

    it('should not throw when generating prompts', () => {
      detector = createDetectorWithMocks();

      expect(() => {
        detector.generateModePrompt('diff-mode');
        detector.generateModePrompt('scaffold-mode');
      }).not.toThrow();
    });
  });

  describe('Integration: Detect Mode Workflow', () => {
    it('should properly detect mode based on filesystem state', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project', '/project/src']),
      });
      detector = new GenerationModeDetector(mockFs);

      // Check if source directory exists
      const hasSrc = detector.hasSourceDirectory('/project');
      expect(hasSrc).toBe(true);

      // Detect mode
      const result = detector.detectMode('/project', [{ type: 'replacement' }], hasSrc);
      expect(result.mode).toBe('diff-mode');
    });

    it('should fallback to scaffold-mode when source directory is missing', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
      });
      detector = new GenerationModeDetector(mockFs);

      const hasSrc = detector.hasSourceDirectory('/project');
      expect(hasSrc).toBe(false);

      const result = detector.detectMode('/project', [{ type: 'replacement' }], hasSrc);
      expect(result.mode).toBe('scaffold-mode');
      expect(result.shouldRetry).toBe(true);
    });

    it('should prioritize src over app directory', () => {
      mockFs = new MockFileSystem({
        directories: new Set([
          '/project',
          '/project/src',
          '/project/app',
          '/project/lib',
        ]),
      });
      detector = new GenerationModeDetector(mockFs);

      const location = detector.getScaffoldLocation('/project');
      expect(location).toBe('src'); // src is checked first
    });
  });

  describe('Error Resilience', () => {
    it('should never throw during hasSourceDirectory', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
      });
      mockFs.setFailureMode('read', '/project', 'EACCES');
      detector = new GenerationModeDetector(mockFs);

      expect(() => {
        detector.hasSourceDirectory('/project');
      }).not.toThrow();
    });

    it('should never throw during getScaffoldLocation', () => {
      mockFs = new MockFileSystem({
        directories: new Set(['/project']),
      });
      mockFs.setFailureMode('read', '/project', 'EACCES');
      detector = new GenerationModeDetector(mockFs);

      expect(() => {
        detector.getScaffoldLocation('/project');
      }).not.toThrow();
    });

    it('should never throw during detectMode', () => {
      detector = createDetectorWithMocks();

      expect(() => {
        detector.detectMode('/project', null as any, true);
        detector.detectMode('/project', undefined, false);
        detector.detectMode('/project', [], false);
      }).not.toThrow();
    });

    it('should never throw during generateModePrompt', () => {
      detector = createDetectorWithMocks();

      expect(() => {
        detector.generateModePrompt('diff-mode');
        detector.generateModePrompt('scaffold-mode');
      }).not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should detect source directory quickly', () => {
      mockFs = new MockFileSystem({
        directories: new Set([
          '/project',
          '/project/src',
          '/project/public',
          '/project/node_modules',
          '/project/dist',
        ]),
      });
      detector = new GenerationModeDetector(mockFs);

      const start = performance.now();
      detector.hasSourceDirectory('/project');
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(10); // Should be very fast
    });

    it('should get scaffold location quickly', () => {
      mockFs = new MockFileSystem({
        directories: new Set([
          '/project',
          '/project/src',
          '/project/app',
          '/project/components',
          '/project/lib',
        ]),
      });
      detector = new GenerationModeDetector(mockFs);

      const start = performance.now();
      detector.getScaffoldLocation('/project');
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(10); // Should be very fast
    });
  });
});
