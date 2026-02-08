import { RetryContext } from './retryContext';

describe('RetryContext', () => {
  describe('constructor', () => {
    it('should initialize with original code and error', () => {
      const code = 'const x = 5;';
      const error = { type: 'import', message: 'Missing useState import' };
      const context = new RetryContext(code, error);

      expect(context.originalCode).toBe(code);
      expect(context.originalError).toBe(error);
      expect(context.maxRetries).toBe(3);
    });
  });

  describe('recordAttempt', () => {
    it('should track attempts', () => {
      const context = new RetryContext('code', { type: 'import', message: 'error' });
      context.recordAttempt('generated', { type: 'import', message: 'failed' }, 'approach');

      const attempts = context.getAttempts();
      expect(attempts).toHaveLength(1);
      expect(attempts[0].attemptNumber).toBe(0);
      expect(attempts[0].generatedCode).toBe('generated');
    });

    it('should increment attempt number', () => {
      const context = new RetryContext('code', { type: 'import', message: 'error' });
      context.recordAttempt('gen1', { type: 'import', message: 'fail1' }, 'approach1');
      context.recordAttempt('gen2', { type: 'import', message: 'fail2' }, 'approach2');

      expect(context.getCurrentAttemptNumber()).toBe(1);
      expect(context.getAttempts()).toHaveLength(2);
    });
  });

  describe('isExhausted', () => {
    it('should return false when retries available', () => {
      const context = new RetryContext('code', { type: 'import', message: 'error' }, 3);
      context.recordAttempt('gen', { type: 'import', message: 'fail' }, 'approach');

      expect(context.isExhausted()).toBe(false);
    });

    it('should return true when max retries exceeded', () => {
      const context = new RetryContext('code', { type: 'import', message: 'error' }, 1);
      context.recordAttempt('gen1', { type: 'import', message: 'fail1' }, 'approach1');
      context.recordAttempt('gen2', { type: 'import', message: 'fail2' }, 'approach2');

      expect(context.isExhausted()).toBe(true);
    });
  });

  describe('buildRetryHistoryPrompt', () => {
    it('should return empty string if no attempts', () => {
      const context = new RetryContext('code', { type: 'import', message: 'error' });
      expect(context.buildRetryHistoryPrompt()).toBe('');
    });

    it('should include attempt history in prompt', () => {
      const context = new RetryContext('code', { type: 'import', message: 'error' });
      context.recordAttempt('gen', { type: 'import', message: 'Missing useState' }, 'LLM Generation');

      const prompt = context.buildRetryHistoryPrompt();
      expect(prompt).toContain('Retry History');
      expect(prompt).toContain('Attempt 1');
      expect(prompt).toContain('Missing useState');
      expect(prompt).toContain('DO NOT repeat');
    });
  });

  describe('getRetryConfidence', () => {
    it('should return high confidence for first attempt', () => {
      const context = new RetryContext('code', { type: 'import', message: 'error' });
      expect(context.getRetryConfidence()).toBe(1.0);
    });

    it('should decrease with each failed attempt', () => {
      const context = new RetryContext('code', { type: 'import', message: 'error' }, 3);
      const conf1 = context.getRetryConfidence();

      context.recordAttempt('gen1', { type: 'import', message: 'fail1' }, 'approach1');
      const conf2 = context.getRetryConfidence();

      context.recordAttempt('gen2', { type: 'import', message: 'fail2' }, 'approach2');
      const conf3 = context.getRetryConfidence();

      expect(conf1).toBeGreaterThan(conf2);
      expect(conf2).toBeGreaterThan(conf3);
    });

    it('should return low confidence at max retries', () => {
      const context = new RetryContext('code', { type: 'import', message: 'error' }, 3);
      context.recordAttempt('gen1', { type: 'import', message: 'fail1' }, 'approach1');
      context.recordAttempt('gen2', { type: 'import', message: 'fail2' }, 'approach2');
      context.recordAttempt('gen3', { type: 'import', message: 'fail3' }, 'approach3');

      expect(context.getRetryConfidence()).toBe(0.3);
    });
  });
});
