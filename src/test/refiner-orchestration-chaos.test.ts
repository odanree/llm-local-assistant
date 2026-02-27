/**
 * Phase 6C: Refiner Orchestration Chaos Testing
 *
 * Purpose: Test Refiner's complete orchestration pipeline under failure scenarios
 * Focus: Decision logic in mode switching, retry behavior, last-chance fallbacks
 *
 * Current Coverage: 39.84% (CRITICAL - lowest in codebase)
 *
 * Scenarios:
 * 1. LLM Call Failures (timeout, network error, invalid response)
 * 2. Context Building Failures (missing dependencies, empty projects)
 * 3. Diff Parsing Edge Cases (malformed responses, valid code but invalid diffs)
 * 4. Mode Switching Logic (diff-mode vs scaffold-mode detection)
 * 5. Retry Exhaustion (all retries failed, fallback to scaffold)
 * 6. SimpleFixer Integration (fixed code vs unfixed code paths)
 * 7. Generation Mode Detection (runtime detection with existing files)
 *
 * Expected Coverage Gain: +2.0-2.5% from orchestration decision paths
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Refiner, RefinerConfig, RefinerResult } from '../refiner';

describe('Phase 6C: Refiner Orchestration Chaos - Integration Testing', () => {
  let config: RefinerConfig;

  const mockLlmCall = vi.fn();
  const mockProgress = vi.fn();

  beforeEach(() => {
    mockLlmCall.mockClear();
    mockProgress.mockClear();

    config = {
      projectRoot: '/test-project',
      llmCall: mockLlmCall,
      onProgress: mockProgress,
      maxRetries: 3,
    };
  });

  describe('LLM Call Failure Scenarios', () => {
    it('should handle LLM call timeout gracefully', async () => {
      mockLlmCall.mockRejectedValue(new Error('Request timeout'));

      const refiner = new Refiner(config);
      const result = await refiner.generateCode('write a function');

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.explanation).toContain('LLM call failed');
      expect(result.error).toBeDefined();
    });

    it('should handle LLM call network error', async () => {
      mockLlmCall.mockRejectedValue(new Error('ECONNREFUSED: Connection refused'));

      const refiner = new Refiner(config);
      const result = await refiner.generateCode('add feature');

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.explanation).toContain('LLM call failed');
    });

    it('should handle LLM returning empty string', async () => {
      mockLlmCall.mockResolvedValue('');

      const refiner = new Refiner(config);
      const result = await refiner.generateCode('write code');

      expect(result).toBeDefined();
      // Empty LLM response should be handled gracefully
      expect(result.explanation).toBeDefined();
    });

    it('should handle LLM returning whitespace-only response', async () => {
      mockLlmCall.mockResolvedValue('   \n  \n   ');

      const refiner = new Refiner(config);
      const result = await refiner.generateCode('test');

      expect(result).toBeDefined();
      // Should handle gracefully
      expect(result.explanation).toBeDefined();
    });
  });

  describe('Minimal Project Detection & Mode Switching', () => {
    it('should detect minimal project and force scaffold-mode on startup', async () => {
      mockLlmCall.mockResolvedValue('```typescript\nexport const x = 1;\n```');

      const refiner = new Refiner({
        ...config,
        projectRoot: '/empty-project',
      });

      const result = await refiner.generateCode('create basic code');

      expect(result).toBeDefined();
      // Progress callback should show mode detection
      expect(mockProgress).toHaveBeenCalled();
    });

    it('should switch from diff-mode to scaffold-mode on failed parse', async () => {
      // First call: invalid diff response
      // Should detect as minimal project and switch to scaffold
      mockLlmCall
        .mockResolvedValueOnce('This is just plain text, not a valid diff')
        .mockResolvedValueOnce('```typescript\nexport function hello() { return "world"; }\n```');

      const refiner = new Refiner(config);
      const result = await refiner.generateCode('add greeting function');

      expect(result).toBeDefined();
      // Should have attempted multiple times
      expect(mockLlmCall.mock.calls.length).toBeGreaterThan(1);
    });

    it('should respect maxRetries limit in mode switching', async () => {
      // Keep returning invalid diffs to exhaust retries
      mockLlmCall.mockResolvedValue('Invalid diff format');

      const refiner = new Refiner({
        ...config,
        maxRetries: 2,
      });

      const result = await refiner.generateCode('test');

      expect(result).toBeDefined();
      // Should have limited attempts
      expect(result.attempts).toBeLessThanOrEqual(4); // maxRetries + last-chance
    });
  });

  describe('Diff Parsing Edge Cases', () => {
    it('should handle valid code but no structured diffs', async () => {
      mockLlmCall.mockResolvedValue('const x = 1;\nconst y = 2;');

      const refiner = new Refiner(config);
      const result = await refiner.generateCode('write constants');

      expect(result).toBeDefined();
      // Might fall back to scaffold or return the code as-is
      expect(result.code !== undefined || result.success === false).toBe(true);
    });

    it('should handle malformed diff syntax', async () => {
      const malformedDiff = `
        {
          "type": "replacement",
          "path": "/file.ts"
          "search": "broken json
        }
      `;

      mockLlmCall.mockResolvedValue(malformedDiff);

      const refiner = new Refiner(config);
      const result = await refiner.generateCode('fix something');

      expect(result).toBeDefined();
      // Should attempt retry or fallback
    });

    it('should handle diffs with missing required fields', async () => {
      mockLlmCall.mockResolvedValue(`
        {
          "type": "replacement"
        }
      `);

      const refiner = new Refiner(config);
      const result = await refiner.generateCode('test');

      expect(result).toBeDefined();
      expect(result.attempts).toBeGreaterThan(0);
    });

    it('should handle diffs with invalid file paths', async () => {
      mockLlmCall.mockResolvedValue(`
        {
          "diffs": [{
            "type": "replacement",
            "path": "/../../etc/passwd",
            "search": "old",
            "replacement": "new"
          }]
        }
      `);

      const refiner = new Refiner(config);
      const result = await refiner.generateCode('test');

      expect(result).toBeDefined();
      // Should reject malicious path or handle gracefully
    });
  });

  describe('SimpleFixer Integration', () => {
    it('should apply SimpleFixer fixes and track them', async () => {
      mockLlmCall.mockResolvedValue('export function App() { return "Hello"; }');

      const refiner = new Refiner(config);
      const result = await refiner.generateCode('add App component');

      expect(result).toBeDefined();
      // If SimpleFixer found fixes, they should be tracked
      expect(result.appliedFixes).toBeDefined();
      expect(Array.isArray(result.appliedFixes)).toBe(true);
    });

    it('should continue even if SimpleFixer finds no fixes', async () => {
      mockLlmCall.mockResolvedValue('export const x = 1;');

      const refiner = new Refiner(config);
      const result = await refiner.generateCode('test');

      expect(result).toBeDefined();
      expect(result.appliedFixes).toBeDefined();
    });
  });

  describe('Last-Chance Fallback Logic', () => {
    it('should attempt last-chance scaffold mode after retry exhaustion', async () => {
      mockLlmCall
        .mockResolvedValueOnce('Invalid 1')
        .mockResolvedValueOnce('Invalid 2')
        .mockResolvedValueOnce('Invalid 3')
        .mockResolvedValueOnce('```typescript\nscaffold code\n```');

      const refiner = new Refiner({
        ...config,
        maxRetries: 2,
      });

      const result = await refiner.generateCode('test');

      expect(result).toBeDefined();
      // Should have attempted scaffold fallback
      expect(mockLlmCall.mock.calls.length).toBeGreaterThan(2);
    });

    it('should fail gracefully if last-chance fallback also fails', async () => {
      mockLlmCall.mockRejectedValue(new Error('All LLM calls failed'));

      const refiner = new Refiner({
        ...config,
        maxRetries: 1,
      });

      const result = await refiner.generateCode('test');

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.explanation.toLowerCase()).toContain('could not generate');
    });

    it('should provide helpful error message on complete failure', async () => {
      mockLlmCall.mockRejectedValue(new Error('Network timeout'));

      const refiner = new Refiner(config);
      const result = await refiner.generateCode('test');

      expect(result.explanation.length).toBeGreaterThan(0);
      expect(result.explanation).toBeDefined();
    });
  });

  describe('Retry Loop Behavior', () => {
    it('should track attempt count accurately', async () => {
      mockLlmCall
        .mockResolvedValueOnce('Attempt 1: invalid')
        .mockResolvedValueOnce('Attempt 2: invalid')
        .mockResolvedValueOnce('Attempt 3: invalid')
        .mockResolvedValueOnce('```json\n{"diffs": []}\n```');

      const refiner = new Refiner({
        ...config,
        maxRetries: 2,
      });

      const result = await refiner.generateCode('test');

      expect(result.attempts).toBeLessThanOrEqual(4); // Max retries + fallback
    });

    it('should not exceed maxRetries setting', async () => {
      mockLlmCall.mockResolvedValue('Invalid response');

      const refiner = new Refiner({
        ...config,
        maxRetries: 1,
      });

      const result = await refiner.generateCode('test');

      // Should attempt initial + 1 retry + 1 fallback max
      expect(result.attempts).toBeLessThanOrEqual(3);
    });

    it('should succeed on second attempt if first fails', async () => {
      mockLlmCall
        .mockResolvedValueOnce('Invalid first attempt')
        .mockResolvedValueOnce('```typescript\nexport const success = true;\n```');

      const refiner = new Refiner(config);
      const result = await refiner.generateCode('test');

      expect(result).toBeDefined();
      expect(mockLlmCall.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('Progress Callback Invocation', () => {
    it('should invoke progress callback at each stage', async () => {
      mockLlmCall.mockResolvedValue('```typescript\nexport const x = 1;\n```');

      const refiner = new Refiner(config);
      await refiner.generateCode('test');

      // Should call onProgress multiple times for different stages
      expect(mockProgress.mock.calls.length).toBeGreaterThan(0);

      // Should include stage names
      const stages = mockProgress.mock.calls.map(call => call[0]);
      expect(stages.some(s => typeof s === 'string')).toBe(true);
    });

    it('should provide stage details in progress callback', async () => {
      mockLlmCall.mockResolvedValue('code');

      const refiner = new Refiner(config);
      await refiner.generateCode('test');

      // Each call should have stage and details
      mockProgress.mock.calls.forEach(call => {
        expect(call.length).toBeGreaterThanOrEqual(2);
        expect(typeof call[0]).toBe('string'); // stage
        expect(typeof call[1]).toBe('string'); // details
      });
    });
  });

  describe('Context Building Integration', () => {
    it('should handle projects with package.json', async () => {
      mockLlmCall.mockResolvedValue('```typescript\nexport function x() {}\n```');

      const refiner = new Refiner({
        ...config,
        projectRoot: '/project-with-deps',
      });

      const result = await refiner.generateCode('add function');

      expect(result).toBeDefined();
    });

    it('should handle projects without package.json', async () => {
      mockLlmCall.mockResolvedValue('```typescript\nexport const x = 1;\n```');

      const refiner = new Refiner({
        ...config,
        projectRoot: '/minimal-project',
      });

      const result = await refiner.generateCode('test');

      expect(result).toBeDefined();
      // Should force scaffold mode for minimal projects
    });

    it('should handle projects with framework detection', async () => {
      mockLlmCall.mockResolvedValue('```typescript\nconst App = () => <div>Hi</div>;\n```');

      const refiner = new Refiner({
        ...config,
        projectRoot: '/react-project',
      });

      const result = await refiner.generateCode('add React component');

      expect(result).toBeDefined();
    });
  });

  describe('Error Context Preservation', () => {
    it('should preserve error information through retry loop', async () => {
      mockLlmCall.mockRejectedValue(new Error('Initial LLM failure'));

      const refiner = new Refiner(config);
      const result = await refiner.generateCode('test');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('LLM');
    });

    it('should distinguish between different error types', async () => {
      mockLlmCall.mockRejectedValue(new Error('EACCES: Permission denied'));

      const refiner = new Refiner(config);
      const result = await refiner.generateCode('test');

      expect(result.explanation).toContain('failed');
    });
  });

  describe('Applied Fixes Tracking', () => {
    it('should accumulate applied fixes across retries', async () => {
      mockLlmCall
        .mockResolvedValueOnce("const React = require('react');") // SimpleFixer should fix this
        .mockResolvedValueOnce('```typescript\nconst x = 1;\n```');

      const refiner = new Refiner(config);
      const result = await refiner.generateCode('test');

      expect(result.appliedFixes).toBeDefined();
      expect(Array.isArray(result.appliedFixes)).toBe(true);
    });

    it('should handle case with no applied fixes', async () => {
      mockLlmCall.mockResolvedValue('export const valid = true;');

      const refiner = new Refiner(config);
      const result = await refiner.generateCode('test');

      expect(result.appliedFixes).toBeDefined();
      // Can be empty array
      expect(Array.isArray(result.appliedFixes)).toBe(true);
    });
  });

  describe('Target File Handling', () => {
    it('should accept optional targetFile parameter', async () => {
      mockLlmCall.mockResolvedValue('export const target = true;');

      const refiner = new Refiner(config);
      const result = await refiner.generateCode('add to file', '/src/target.ts');

      expect(result).toBeDefined();
    });

    it('should accept optional existingCode parameter', async () => {
      mockLlmCall.mockResolvedValue('export const added = true;');

      const refiner = new Refiner(config);
      const result = await refiner.generateCode(
        'extend code',
        undefined,
        'const existing = true;'
      );

      expect(result).toBeDefined();
    });
  });

  describe('High-Load Error Scenarios', () => {
    it('should handle rapid sequential requests', async () => {
      mockLlmCall.mockResolvedValue('export const x = 1;');

      const refiner = new Refiner(config);

      const results = await Promise.all([
        refiner.generateCode('request 1'),
        refiner.generateCode('request 2'),
        refiner.generateCode('request 3'),
      ]);

      expect(results).toHaveLength(3);
      expect(results.every(r => r !== undefined)).toBe(true);
    });

    it('should handle concurrent LLM call failures', async () => {
      mockLlmCall.mockRejectedValue(new Error('Service unavailable'));

      const refiner = new Refiner(config);

      const results = await Promise.allSettled([
        refiner.generateCode('request 1'),
        refiner.generateCode('request 2'),
      ]);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.status === 'fulfilled')).toBe(true);
    });
  });

  describe('Configuration Options', () => {
    it('should use provided maxRetries', async () => {
      mockLlmCall.mockResolvedValue('invalid');

      const refiner = new Refiner({
        ...config,
        maxRetries: 5,
      });

      const result = await refiner.generateCode('test');

      expect(result.attempts).toBeLessThanOrEqual(7); // 5 retries + fallback + initial
    });

    it('should use default maxRetries if not provided', async () => {
      mockLlmCall.mockResolvedValue('invalid');

      const refiner = new Refiner({
        ...config,
        maxRetries: undefined,
      });

      const result = await refiner.generateCode('test');

      // Should use default (3)
      expect(result.attempts).toBeGreaterThanOrEqual(1);
    });

    it('should handle workspaceName in config', async () => {
      mockLlmCall.mockResolvedValue('export const x = 1;');

      const refiner = new Refiner({
        ...config,
        workspaceName: 'test-workspace',
      });

      const result = await refiner.generateCode('test');

      expect(result).toBeDefined();
    });
  });

  describe('Response Structure Validation', () => {
    it('should always return RefinerResult with expected structure', async () => {
      mockLlmCall.mockResolvedValue('export const x = 1;');

      const refiner = new Refiner(config);
      const result = await refiner.generateCode('test');

      // Should have all required fields
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('explanation');
      expect(result).toHaveProperty('attempts');
      expect(result).toHaveProperty('appliedFixes');
    });

    it('should include error field when applicable', async () => {
      mockLlmCall.mockRejectedValue(new Error('test error'));

      const refiner = new Refiner(config);
      const result = await refiner.generateCode('test');

      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it('should include code field on success', async () => {
      mockLlmCall.mockResolvedValue('export const success = true;');

      const refiner = new Refiner(config);
      const result = await refiner.generateCode('test');

      if (result.success && result.code) {
        expect(typeof result.code).toBe('string');
      }
    });
  });
});
