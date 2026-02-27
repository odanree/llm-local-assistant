import { describe, it, expect, beforeEach } from 'vitest';
import {
  RetryContext,
  AttemptRecord,
  RetryPolicy,
  createRetryContext,
} from '../utils/retryContext';

/**
 * Phase 10A: RetryContext Comprehensive Testing
 *
 * Strategy: Test all methods and decision logic in RetryContext
 * Target: Increase coverage from 17.39% to 60%+
 * Focus: Stateful retry logic, pattern extraction, confidence calculation
 *
 * Critical paths:
 * - Attempt recording and history
 * - Infinite loop detection
 * - Retry confidence calculation
 * - Pattern extraction from errors
 * - Summary generation for LLM injection
 */

describe('Phase 10A: RetryContext Comprehensive Testing', () => {
  let context: RetryContext;

  beforeEach(() => {
    context = new RetryContext('test-command-123');
  });

  describe('Basic Operations', () => {
    it('should create a retry context with default policy', () => {
      expect(context).toBeDefined();
      expect(context.getAttemptCount()).toBe(0);
    });

    it('should create a retry context with custom policy', () => {
      const customPolicy: RetryPolicy = {
        maxAttempts: 5,
        maxSimpleFixRetries: 3,
        backoffMultiplier: 2.0,
      };
      const customContext = new RetryContext('test', customPolicy);
      expect(customContext).toBeDefined();
      expect(customContext.getRemainingAttempts()).toBe(5);
    });

    it('should create context via factory function', () => {
      const factoryContext = createRetryContext('factory-test');
      expect(factoryContext).toBeDefined();
      expect(factoryContext.getAttemptCount()).toBe(0);
    });
  });

  describe('Attempt Recording', () => {
    it('should record a successful attempt without error', () => {
      const attempt = context.recordAttempt('const x = 1;');
      expect(attempt).toBeDefined();
      expect(attempt.attemptNumber).toBe(1);
      expect(attempt.code).toBe('const x = 1;');
      expect(attempt.error).toBeUndefined();
    });

    it('should record an attempt with error', () => {
      const attempt = context.recordAttempt(
        'const x = undefined;',
        'x is not defined',
        'ReferenceError'
      );
      expect(attempt.error).toBe('x is not defined');
      expect(attempt.errorType).toBe('ReferenceError');
    });

    it('should record an attempt with fixes', () => {
      const attempt = context.recordAttempt(
        'const x = 1;',
        undefined,
        undefined,
        ['added import', 'fixed syntax']
      );
      expect(attempt.fixes).toEqual(['added import', 'fixed syntax']);
    });

    it('should increment attempt numbers', () => {
      context.recordAttempt('code 1');
      context.recordAttempt('code 2');
      context.recordAttempt('code 3');

      const attempts = context.getAllAttempts();
      expect(attempts).toHaveLength(3);
      expect(attempts[0].attemptNumber).toBe(1);
      expect(attempts[1].attemptNumber).toBe(2);
      expect(attempts[2].attemptNumber).toBe(3);
    });
  });

  describe('Attempt Count & Status', () => {
    it('should return correct attempt count', () => {
      expect(context.getAttemptCount()).toBe(0);
      context.recordAttempt('code 1');
      expect(context.getAttemptCount()).toBe(1);
      context.recordAttempt('code 2');
      expect(context.getAttemptCount()).toBe(2);
    });

    it('should check if exhausted (below limit)', () => {
      context.recordAttempt('attempt 1');
      context.recordAttempt('attempt 2');
      expect(context.isExhausted()).toBe(false);
    });

    it('should check if exhausted (at limit)', () => {
      context.recordAttempt('attempt 1');
      context.recordAttempt('attempt 2');
      context.recordAttempt('attempt 3');
      expect(context.isExhausted()).toBe(true);
    });

    it('should calculate remaining attempts', () => {
      expect(context.getRemainingAttempts()).toBe(3);
      context.recordAttempt('attempt 1');
      expect(context.getRemainingAttempts()).toBe(2);
      context.recordAttempt('attempt 2');
      expect(context.getRemainingAttempts()).toBe(1);
      context.recordAttempt('attempt 3');
      expect(context.getRemainingAttempts()).toBe(0);
    });

    it('should never return negative remaining attempts', () => {
      context.recordAttempt('1');
      context.recordAttempt('2');
      context.recordAttempt('3');
      context.recordAttempt('4'); // Beyond limit
      expect(context.getRemainingAttempts()).toBe(0);
    });
  });

  describe('Attempt Retrieval', () => {
    it('should get all attempts', () => {
      context.recordAttempt('code 1', 'error 1');
      context.recordAttempt('code 2', 'error 2');
      const attempts = context.getAllAttempts();

      expect(attempts).toHaveLength(2);
      expect(attempts[0].code).toBe('code 1');
      expect(attempts[1].code).toBe('code 2');
    });

    it('should get latest attempt', () => {
      context.recordAttempt('code 1');
      context.recordAttempt('code 2');
      context.recordAttempt('code 3');

      const latest = context.getLatestAttempt();
      expect(latest).toBeDefined();
      expect(latest!.code).toBe('code 3');
      expect(latest!.attemptNumber).toBe(3);
    });

    it('should return null for latest when no attempts', () => {
      const latest = context.getLatestAttempt();
      expect(latest).toBeNull();
    });

    it('should not modify returned attempts array', () => {
      context.recordAttempt('code 1');
      const attempts1 = context.getAllAttempts();
      attempts1.push({
        attemptNumber: 999,
        timestamp: Date.now(),
        code: 'fake',
      } as AttemptRecord);

      const attempts2 = context.getAllAttempts();
      expect(attempts2).toHaveLength(1); // Should not be affected
    });
  });

  describe('Error History', () => {
    it('should get error history', () => {
      context.recordAttempt('code 1', 'error 1', 'TypeError');
      context.recordAttempt('code 2', 'error 2', 'SyntaxError');
      context.recordAttempt('code 3'); // No error

      const errors = context.getErrorHistory();
      expect(errors).toHaveLength(2);
      expect(errors[0].error).toBe('error 1');
      expect(errors[0].type).toBe('TypeError');
      expect(errors[1].error).toBe('error 2');
      expect(errors[1].type).toBe('SyntaxError');
    });

    it('should filter out attempts without errors', () => {
      context.recordAttempt('code 1', 'error 1');
      context.recordAttempt('code 2'); // No error
      context.recordAttempt('code 3', 'error 3');

      const errors = context.getErrorHistory();
      expect(errors).toHaveLength(2);
      expect(errors.every(e => e.error)).toBe(true);
    });

    it('should detect if error was seen before', () => {
      context.recordAttempt('code 1', 'undefined is not defined');
      context.recordAttempt('code 2', 'different error');

      expect(context.hasSeenError('undefined is not defined')).toBe(true);
      expect(context.hasSeenError('is not defined')).toBe(true); // Substring match
      expect(context.hasSeenError('completely different')).toBe(false);
    });

    it('should return false for hasSeenError when no attempts', () => {
      expect(context.hasSeenError('any error')).toBe(false);
    });
  });

  describe('Fix History', () => {
    it('should get fix history', () => {
      context.recordAttempt('code 1', 'error', undefined, ['fix1', 'fix2']);
      context.recordAttempt('code 2', undefined, undefined, ['fix3']);
      context.recordAttempt('code 3'); // No fixes

      const fixes = context.getFixHistory();
      expect(fixes).toHaveLength(2);
      expect(fixes[0].fixes).toEqual(['fix1', 'fix2']);
      expect(fixes[1].fixes).toEqual(['fix3']);
    });

    it('should filter out attempts without fixes', () => {
      context.recordAttempt('code 1', 'error', undefined, []);
      context.recordAttempt('code 2', undefined, undefined, ['fix1']);
      context.recordAttempt('code 3');

      const fixes = context.getFixHistory();
      expect(fixes).toHaveLength(1);
      expect(fixes[0].attempts).toBeUndefined(); // No attempts field in output
      expect(fixes[0].fixes).toEqual(['fix1']);
    });
  });

  describe('Pattern Extraction', () => {
    it('should extract undefined variable pattern', () => {
      context.recordAttempt('code', 'x is not defined');
      const summary = context.generateAttemptSummary();
      expect(summary).toContain('Variables used without definition');
    });

    it('should extract syntax error pattern', () => {
      context.recordAttempt('code', 'Unexpected token }');
      const summary = context.generateAttemptSummary();
      expect(summary).toContain('Syntax errors');
    });

    it('should extract function call pattern', () => {
      context.recordAttempt('code', 'x is not a function');
      const summary = context.generateAttemptSummary();
      expect(summary).toContain('Calling non-function values');
    });

    it('should extract property access pattern', () => {
      context.recordAttempt('code', 'Cannot read properties of undefined');
      const summary = context.generateAttemptSummary();
      expect(summary).toContain('Type mismatches');
    });

    it('should extract import pattern', () => {
      context.recordAttempt('code', 'Module not found');
      const summary = context.generateAttemptSummary();
      expect(summary).toContain('Missing or invalid imports');
    });

    it('should ignore case in pattern matching', () => {
      context.recordAttempt('code1', 'NOT DEFINED');
      context.recordAttempt('code2', 'SYNTAX ERROR');
      const summary = context.generateAttemptSummary();
      expect(summary).toContain('Variables used without definition');
      expect(summary).toContain('Syntax errors');
    });

    it('should deduplicate patterns', () => {
      context.recordAttempt('code1', 'x is not defined');
      context.recordAttempt('code2', 'y is not defined');
      context.recordAttempt('code3', 'z is not defined');
      const summary = context.generateAttemptSummary();

      // Pattern should appear once
      const count = (summary.match(/Variables used without definition/g) || [])
        .length;
      expect(count).toBe(1);
    });
  });

  describe('Infinite Loop Detection', () => {
    it('should not detect loop with fewer than 2 attempts', () => {
      expect(context.isInfiniteLoop()).toBe(false);
      context.recordAttempt('code', undefined, 'SyntaxError');
      expect(context.isInfiniteLoop()).toBe(false);
    });

    it('should detect same error type repeated', () => {
      context.recordAttempt('code1', 'error', 'SyntaxError');
      context.recordAttempt('code2', 'error', 'SyntaxError');
      expect(context.isInfiniteLoop()).toBe(true);
    });

    it('should not detect loop with different error types', () => {
      context.recordAttempt('code1', 'error', 'SyntaxError');
      context.recordAttempt('code2', 'error', 'TypeError');
      expect(context.isInfiniteLoop()).toBe(false);
    });

    it('should not detect loop when error type missing', () => {
      context.recordAttempt('code1', 'error');
      context.recordAttempt('code2', 'error');
      expect(context.isInfiniteLoop()).toBe(false);
    });

    it('should detect loop based on last two errors only', () => {
      context.recordAttempt('code1', 'error', 'TypeError');
      context.recordAttempt('code2', 'error', 'SyntaxError');
      context.recordAttempt('code3', 'error', 'SyntaxError');
      expect(context.isInfiniteLoop()).toBe(true);
    });
  });

  describe('Retry Confidence Calculation', () => {
    it('should return 1.0 confidence with no attempts', () => {
      expect(context.getRetryConfidence()).toBe(1.0);
    });

    it('should return 0.0 confidence when exhausted', () => {
      context.recordAttempt('code1', 'error');
      context.recordAttempt('code2', 'error');
      context.recordAttempt('code3', 'error');
      expect(context.isExhausted()).toBe(true);
      expect(context.getRetryConfidence()).toBe(0.0);
    });

    it('should return 0.1 confidence when looping', () => {
      context.recordAttempt('code1', 'error', 'SyntaxError');
      context.recordAttempt('code2', 'error', 'SyntaxError');
      expect(context.isInfiniteLoop()).toBe(true);
      expect(context.getRetryConfidence()).toBe(0.1);
    });

    it('should return 0.8 confidence when fixes applied successfully', () => {
      context.recordAttempt('code1', 'error', undefined, ['fix1']);
      context.recordAttempt('code2', undefined, undefined, ['fix2']);

      // 2 fixes > 1 error / 2, so confidence should be 0.8
      expect(context.getRetryConfidence()).toBe(0.8);
    });

    it('should return 0.3 confidence when all attempts failed', () => {
      context.recordAttempt('code1', 'error');
      context.recordAttempt('code2', 'error');
      expect(context.getRetryConfidence()).toBe(0.3);
    });

    it('should return 0.6 confidence for mixed attempts', () => {
      context.recordAttempt('code1', 'error');
      context.recordAttempt('code2'); // No error
      expect(context.getRetryConfidence()).toBe(0.6);
    });
  });

  describe('Attempt Summary Generation', () => {
    it('should generate summary for empty context', () => {
      const summary = context.generateAttemptSummary();
      expect(summary).toBe('No previous attempts.');
    });

    it('should include attempt count in summary', () => {
      context.recordAttempt('code1', 'error1');
      context.recordAttempt('code2', 'error2');
      const summary = context.generateAttemptSummary();
      expect(summary).toContain('Attempt History (2/3)');
    });

    it('should include error information in summary', () => {
      context.recordAttempt('code', 'specific error message here');
      const summary = context.generateAttemptSummary();
      expect(summary).toContain('specific error message');
    });

    it('should handle long error messages in summary', () => {
      const longError = 'x'.repeat(300); // 300 character error
      context.recordAttempt('code', longError);
      const summary = context.generateAttemptSummary();
      // The error is truncated to 200 chars + "..."
      expect(summary).toContain('Error');
      expect(summary).toBeDefined();
    });

    it('should include error type in summary', () => {
      context.recordAttempt('code', 'error', 'SyntaxError');
      const summary = context.generateAttemptSummary();
      expect(summary).toContain('SyntaxError');
    });

    it('should include fixes applied in summary', () => {
      context.recordAttempt('code', 'error', undefined, ['added import', 'fixed bracket']);
      const summary = context.generateAttemptSummary();
      expect(summary).toContain('added import');
      expect(summary).toContain('fixed bracket');
    });

    it('should include remaining attempts in summary', () => {
      context.recordAttempt('code1');
      const summary = context.generateAttemptSummary();
      expect(summary).toContain('2 attempts remaining');
    });

    it('should include instruction for next attempt', () => {
      context.recordAttempt('code', 'x is not defined');
      const summary = context.generateAttemptSummary();
      expect(summary).toContain('DO NOT repeat these approaches');
      expect(summary).toContain('Variables used without definition');
    });
  });

  describe('Avoidance Prompt Generation', () => {
    it('should return empty string when no errors', () => {
      context.recordAttempt('code');
      const prompt = context.generateAvoidancePrompt();
      expect(prompt).toBe('');
    });

    it('should generate prompt for undefined variables', () => {
      context.recordAttempt('code', 'x is not defined');
      const prompt = context.generateAvoidancePrompt();
      expect(prompt).toContain('undefined variables');
    });

    it('should generate prompt for syntax errors', () => {
      context.recordAttempt('code', 'unexpected token');
      const prompt = context.generateAvoidancePrompt();
      expect(prompt).toContain('syntax');
      expect(prompt).toContain('brackets');
    });

    it('should generate prompt for function call errors', () => {
      context.recordAttempt('code', 'x is not a function');
      const prompt = context.generateAvoidancePrompt();
      expect(prompt).toContain('function');
    });

    it('should generate prompt for property access errors', () => {
      context.recordAttempt('code', 'Cannot read properties');
      const prompt = context.generateAvoidancePrompt();
      expect(prompt).toContain('null checks');
    });

    it('should handle multiple similar errors', () => {
      context.recordAttempt('code1', 'x is not defined');
      context.recordAttempt('code2', 'y is not defined');
      const prompt = context.generateAvoidancePrompt();

      // Multiple undefined errors should be detected
      expect(prompt).toContain('undefined');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should handle multiple error types', () => {
      context.recordAttempt('code1', 'x is not defined');
      context.recordAttempt('code2', 'unexpected token');
      context.recordAttempt('code3', 'x is not a function');
      const prompt = context.generateAvoidancePrompt();

      expect(prompt).toContain('undefined');
      expect(prompt).toContain('syntax');
      expect(prompt).toContain('function');
    });
  });

  describe('Metadata & Reporting', () => {
    it('should return metadata with command ID', () => {
      const metadata = context.getMetadata();
      expect(metadata.commandId).toBe('test-command-123');
    });

    it('should include attempt count in metadata', () => {
      context.recordAttempt('code1');
      context.recordAttempt('code2');
      const metadata = context.getMetadata();
      expect(metadata.attemptCount).toBe(2);
    });

    it('should include time spent in metadata', () => {
      const before = Date.now();
      context.recordAttempt('code');
      const metadata = context.getMetadata();
      const after = Date.now();

      expect(metadata.totalTimeMs).toBeGreaterThanOrEqual(0);
      expect(metadata.totalTimeMs).toBeLessThanOrEqual(after - before + 100); // Allow 100ms buffer
    });

    it('should report exhaustion status in metadata', () => {
      context.recordAttempt('code1');
      let metadata = context.getMetadata();
      expect(metadata.isExhausted).toBe(false);

      context.recordAttempt('code2');
      context.recordAttempt('code3');
      metadata = context.getMetadata();
      expect(metadata.isExhausted).toBe(true);
    });

    it('should report looping status in metadata', () => {
      context.recordAttempt('code1', 'error', 'SyntaxError');
      context.recordAttempt('code2', 'error', 'SyntaxError');
      const metadata = context.getMetadata();
      expect(metadata.isLooping).toBe(true);
    });

    it('should include confidence in metadata', () => {
      context.recordAttempt('code1');
      const metadata = context.getMetadata();
      expect(typeof metadata.confidence).toBe('number');
      expect(metadata.confidence).toBeGreaterThanOrEqual(0);
      expect(metadata.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Integration: Complete Workflow', () => {
    it('should handle complete retry workflow with multiple error types', () => {
      // Attempt 1: Syntax error
      context.recordAttempt('const x = {', 'Unexpected end of input', 'SyntaxError', [
        'added closing bracket',
      ]);
      expect(context.getAttemptCount()).toBe(1);
      expect(context.getRetryConfidence()).toBeGreaterThan(0.5);

      // Attempt 2: Different error
      context.recordAttempt(
        'const x = {}; const y = x.foo.bar;',
        'Cannot read properties of undefined',
        'TypeError',
        ['added null check']
      );
      expect(context.getAttemptCount()).toBe(2);
      expect(context.isInfiniteLoop()).toBe(false);

      // Get summary for LLM
      const summary = context.generateAttemptSummary();
      expect(summary).toContain('Attempt History (2/3)');
      expect(summary).toContain('SyntaxError');
      expect(summary).toContain('TypeError');
    });

    it('should handle infinite loop scenario', () => {
      context.recordAttempt('code1', 'ReferenceError: x is not defined', 'ReferenceError');
      context.recordAttempt('code2', 'ReferenceError: y is not defined', 'ReferenceError');

      expect(context.isInfiniteLoop()).toBe(true);
      expect(context.getRetryConfidence()).toBe(0.1);

      const avoidance = context.generateAvoidancePrompt();
      expect(avoidance).toContain('undefined variables');
    });

    it('should handle recovery from low confidence', () => {
      // Start in low confidence state
      context.recordAttempt('code1', 'error1', 'SyntaxError');
      context.recordAttempt('code2', 'error2', 'SyntaxError');
      expect(context.isInfiniteLoop()).toBe(true);
      expect(context.getRetryConfidence()).toBe(0.1);

      // Recover with fixes
      context.recordAttempt('code3', undefined, undefined, [
        'changed approach',
        'new pattern',
      ]);
      expect(context.getAttemptCount()).toBe(3);
      expect(context.isInfiniteLoop()).toBe(false); // Not looping anymore
    });
  });

  describe('Edge Cases & Boundaries', () => {
    it('should handle very large error messages', () => {
      const largeError = 'x'.repeat(10000);
      context.recordAttempt('code', largeError);
      const summary = context.generateAttemptSummary();
      expect(summary).toContain('...');
    });

    it('should handle many attempts', () => {
      for (let i = 1; i <= 10; i++) {
        context.recordAttempt(`code${i}`, `error${i}`, `Type${i}`);
      }
      expect(context.getAttemptCount()).toBe(10);
      const summary = context.generateAttemptSummary();
      expect(summary).toContain('Attempt History (10/3)');
    });

    it('should handle attempts with no error but with fixes', () => {
      const attempt = context.recordAttempt('code', undefined, undefined, ['fix1', 'fix2']);
      expect(attempt.fixes).toEqual(['fix1', 'fix2']);
      expect(attempt.error).toBeUndefined();
    });

    it('should handle error strings with special characters', () => {
      const specialError = 'Error: "foo" is not defined (check <template>)';
      context.recordAttempt('code', specialError);
      expect(context.hasSeenError(specialError)).toBe(true);
    });
  });
});
