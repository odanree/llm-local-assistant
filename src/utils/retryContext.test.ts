/**
 * Tests for RetryContext utility
 */

import { describe, it, expect } from 'vitest';
import { RetryContext, createRetryContext } from './retryContext';

describe('RetryContext', () => {
  describe('attempt tracking', () => {
    it('should record attempts with errors', () => {
      const ctx = new RetryContext('test-cmd-1');

      ctx.recordAttempt(
        'const x = y;',
        'y is not defined',
        'ReferenceError',
        ['add-import']
      );

      expect(ctx.getAttemptCount()).toBe(1);
      expect(ctx.getLatestAttempt()?.error).toContain('is not defined');
    });

    it('should track multiple attempts', () => {
      const ctx = new RetryContext('test-cmd-2');

      ctx.recordAttempt('code1', 'error1');
      ctx.recordAttempt('code2', 'error2');
      ctx.recordAttempt('code3');

      expect(ctx.getAttemptCount()).toBe(3);
      expect(ctx.getAllAttempts()).toHaveLength(3);
    });
  });

  describe('retry limits', () => {
    it('should enforce max attempts limit', () => {
      const ctx = new RetryContext('test-cmd-3', {
        maxAttempts: 3,
        maxSimpleFixRetries: 2,
        backoffMultiplier: 1.5,
      });

      for (let i = 0; i < 3; i++) {
        ctx.recordAttempt(`code${i}`, `error${i}`);
      }

      expect(ctx.isExhausted()).toBe(true);
      expect(ctx.getRemainingAttempts()).toBe(0);
    });

    it('should track remaining attempts correctly', () => {
      const ctx = new RetryContext('test-cmd-4', {
        maxAttempts: 5,
        maxSimpleFixRetries: 2,
        backoffMultiplier: 1.5,
      });

      expect(ctx.getRemainingAttempts()).toBe(5);

      ctx.recordAttempt('code1', 'error1');
      expect(ctx.getRemainingAttempts()).toBe(4);

      ctx.recordAttempt('code2');
      expect(ctx.getRemainingAttempts()).toBe(3);
    });
  });

  describe('error history', () => {
    it('should collect error history', () => {
      const ctx = new RetryContext('test-cmd-5');

      ctx.recordAttempt('code1', 'Variable not defined', 'ReferenceError');
      ctx.recordAttempt('code2', 'Unexpected token', 'SyntaxError');
      ctx.recordAttempt('code3'); // No error

      const errorHistory = ctx.getErrorHistory();
      expect(errorHistory).toHaveLength(2);
      expect(errorHistory[0].type).toBe('ReferenceError');
    });

    it('should detect recurring errors', () => {
      const ctx = new RetryContext('test-cmd-6');

      ctx.recordAttempt('code1', 'useState is not defined');
      ctx.recordAttempt('code2', 'useState is not defined');

      expect(ctx.hasSeenError('useState is not defined')).toBe(true);
      expect(ctx.hasSeenError('other error')).toBe(false);
    });
  });

  describe('infinite loop detection', () => {
    it('should detect infinite loops (same error twice)', () => {
      const ctx = new RetryContext('test-cmd-7');

      ctx.recordAttempt('code1', 'x is not defined', 'ReferenceError');
      ctx.recordAttempt('code2', 'y is not defined', 'ReferenceError');

      expect(ctx.isInfiniteLoop()).toBe(true);
    });

    it('should not flag as infinite loop with different errors', () => {
      const ctx = new RetryContext('test-cmd-8');

      ctx.recordAttempt('code1', 'x is not defined', 'ReferenceError');
      ctx.recordAttempt('code2', 'Unexpected token', 'SyntaxError');

      expect(ctx.isInfiniteLoop()).toBe(false);
    });
  });

  describe('retry confidence', () => {
    it('should return high confidence initially', () => {
      const ctx = new RetryContext('test-cmd-9');
      expect(ctx.getRetryConfidence()).toBeGreaterThan(0.5);
    });

    it('should reduce confidence on infinite loops', () => {
      const ctx = new RetryContext('test-cmd-10');

      ctx.recordAttempt('code1', 'error', 'Type1');
      ctx.recordAttempt('code2', 'error', 'Type1');

      expect(ctx.getRetryConfidence()).toBeLessThan(0.3);
    });

    it('should reduce confidence when exhausted', () => {
      const ctx = new RetryContext('test-cmd-11', {
        maxAttempts: 2,
        maxSimpleFixRetries: 1,
        backoffMultiplier: 1.5,
      });

      ctx.recordAttempt('code1', 'error');
      ctx.recordAttempt('code2', 'error');

      expect(ctx.getRetryConfidence()).toBe(0);
      expect(ctx.isExhausted()).toBe(true);
    });
  });

  describe('prompts generation', () => {
    it('should generate attempt summary', () => {
      const ctx = new RetryContext('test-cmd-12');

      ctx.recordAttempt('code1', 'y is not defined', 'ReferenceError', ['add-import']);
      ctx.recordAttempt('code2', 'Unexpected token', 'SyntaxError');

      const summary = ctx.generateAttemptSummary();
      expect(summary).toContain('Attempt History');
      expect(summary).toContain('Attempt 1');
      expect(summary).toContain('y is not defined');
    });

    it('should generate avoidance prompt', () => {
      const ctx = new RetryContext('test-cmd-13');

      ctx.recordAttempt('code1', 'x is not defined');
      ctx.recordAttempt('code2', 'Cannot read properties of undefined');

      const avoidance = ctx.generateAvoidancePrompt();
      expect(avoidance).toContain('Known Issues');
      expect(avoidance).toContain('undefined');
    });
  });

  describe('factory function', () => {
    it('should create context with createRetryContext', () => {
      const ctx = createRetryContext('test-id');
      expect(ctx).toBeInstanceOf(RetryContext);
      expect(ctx.getAttemptCount()).toBe(0);
    });
  });

  describe('metadata', () => {
    it('should return metadata', () => {
      const ctx = new RetryContext('test-cmd-14');
      ctx.recordAttempt('code1', 'error1');

      const metadata = ctx.getMetadata();
      expect(metadata.commandId).toBe('test-cmd-14');
      expect(metadata.attemptCount).toBe(1);
      expect(metadata.totalTimeMs).toBeGreaterThan(0);
      expect(metadata.isExhausted).toBe(false);
    });
  });

  describe('fix history', () => {
    it('should collect fix history', () => {
      const ctx = new RetryContext('test-cmd-15');

      ctx.recordAttempt('code1', undefined, undefined, ['fix-import', 'fix-syntax']);
      ctx.recordAttempt('code2', 'error', undefined, ['fix-brace']);
      ctx.recordAttempt('code3'); // No fixes

      const fixHistory = ctx.getFixHistory();
      expect(fixHistory).toHaveLength(2);
      expect(fixHistory[0].fixes).toContain('fix-import');
    });
  });
});
