/**
 * RetryContext: Track attempt history for stateful correction
 *
 * Part of Phase 1: Stateful Correction Architecture
 * Maintains memory of previous generation attempts and failures
 *
 * Strategy: Store each attempt + error, inject into LLM prompt with explicit
 * "avoid these approaches" instructions to break retry loops
 */

export interface AttemptRecord {
  attemptNumber: number;
  timestamp: number;
  code: string;
  error?: string;
  errorType?: string;
  fixes?: string[];
  context?: string;
}

export interface RetryPolicy {
  maxAttempts: number;
  maxSimpleFixRetries: number;
  backoffMultiplier: number;
}

export class RetryContext {
  private commandId: string;
  private attempts: AttemptRecord[] = [];
  private policy: RetryPolicy;
  private startTime: number;

  constructor(
    commandId: string,
    policy: RetryPolicy = {
      maxAttempts: 3,
      maxSimpleFixRetries: 2,
      backoffMultiplier: 1.5,
    }
  ) {
    this.commandId = commandId;
    this.policy = policy;
    this.startTime = Date.now();
  }

  /**
   * Record an attempt with its outcome
   */
  recordAttempt(code: string, error?: string, errorType?: string, fixes?: string[]): AttemptRecord {
    const attempt: AttemptRecord = {
      attemptNumber: this.attempts.length + 1,
      timestamp: Date.now(),
      code,
      error,
      errorType,
      fixes,
    };

    this.attempts.push(attempt);
    return attempt;
  }

  /**
   * Get the number of attempts made so far
   */
  getAttemptCount(): number {
    return this.attempts.length;
  }

  /**
   * Check if we've exceeded the retry limit
   */
  isExhausted(): boolean {
    return this.attempts.length >= this.policy.maxAttempts;
  }

  /**
   * Get remaining attempts
   */
  getRemainingAttempts(): number {
    return Math.max(0, this.policy.maxAttempts - this.attempts.length);
  }

  /**
   * Get all attempts in order
   */
  getAllAttempts(): AttemptRecord[] {
    return [...this.attempts];
  }

  /**
   * Get the most recent attempt
   */
  getLatestAttempt(): AttemptRecord | null {
    return this.attempts.length > 0 ? this.attempts[this.attempts.length - 1] : null;
  }

  /**
   * Get all errors from previous attempts
   */
  getErrorHistory(): Array<{ attempt: number; error: string; type?: string }> {
    return this.attempts
      .filter(a => a.error)
      .map(a => ({
        attempt: a.attemptNumber,
        error: a.error!,
        type: a.errorType,
      }));
  }

  /**
   * Get all fixes applied in previous attempts
   */
  getFixHistory(): Array<{ attempt: number; fixes: string[] }> {
    return this.attempts
      .filter(a => a.fixes && a.fixes.length > 0)
      .map(a => ({
        attempt: a.attemptNumber,
        fixes: a.fixes!,
      }));
  }

  /**
   * Check if we've tried this error before
   */
  hasSeenError(error: string): boolean {
    return this.attempts.some(a => a.error && a.error.includes(error));
  }

  /**
   * Generate summary of attempts for LLM injection
   */
  generateAttemptSummary(): string {
    if (this.attempts.length === 0) {
      return 'No previous attempts.';
    }

    const summaryParts: string[] = [];

    summaryParts.push(`## Attempt History (${this.attempts.length}/${this.policy.maxAttempts})\n`);

    for (const attempt of this.attempts) {
      summaryParts.push(`### Attempt ${attempt.attemptNumber}`);

      if (attempt.error) {
        summaryParts.push(`**Error:** ${attempt.error.substring(0, 200)}...`);
      }

      if (attempt.errorType) {
        summaryParts.push(`**Type:** ${attempt.errorType}`);
      }

      if (attempt.fixes && attempt.fixes.length > 0) {
        summaryParts.push(`**Fixes Applied:** ${attempt.fixes.join(', ')}`);
      }

      summaryParts.push('');
    }

    summaryParts.push(`## Instruction for Next Attempt`);
    summaryParts.push(`You have ${this.getRemainingAttempts()} attempts remaining.`);
    summaryParts.push(`\n**DO NOT repeat these approaches:**`);

    // Extract what didn't work
    const failedPatterns = this.extractFailedPatterns();
    for (const pattern of failedPatterns) {
      summaryParts.push(`- ${pattern}`);
    }

    return summaryParts.join('\n');
  }

  /**
   * Generate a "what not to do" prompt for LLM
   */
  generateAvoidancePrompt(): string {
    const avoidances: string[] = [];

    for (const attempt of this.attempts) {
      if (attempt.error) {
        if (attempt.error.includes('is not defined')) {
          avoidances.push('- Do not use undefined variables or missing imports');
        }
        if (attempt.error.includes('unexpected token')) {
          avoidances.push('- Check syntax - ensure all brackets, braces, and parens are balanced');
        }
        if (attempt.error.includes('is not a function')) {
          avoidances.push('- Do not call things that are not functions - check variable types');
        }
        if (attempt.error.includes('Cannot read properties')) {
          avoidances.push('- Do not access properties on undefined/null - add null checks');
        }
      }
    }

    if (avoidances.length === 0) {
      return '';
    }

    return `
## Known Issues to Avoid
${avoidances.join('\n')}
`;
  }

  /**
   * Extract patterns of what failed
   */
  private extractFailedPatterns(): string[] {
    const patterns: Set<string> = new Set();

    for (const attempt of this.attempts) {
      if (!attempt.error) continue;

      const error = attempt.error.toLowerCase();

      if (error.includes('not defined') || error.includes('undefined')) {
        patterns.add('Variables used without definition or import');
      }
      if (error.includes('syntax') || error.includes('unexpected')) {
        patterns.add('Syntax errors or unmatched brackets');
      }
      if (error.includes('not a function')) {
        patterns.add('Calling non-function values');
      }
      if (error.includes('cannot read') || error.includes('cannot assign')) {
        patterns.add('Type mismatches or invalid operations');
      }
      if (error.includes('module') || error.includes('import')) {
        patterns.add('Missing or invalid imports');
      }
    }

    return Array.from(patterns);
  }

  /**
   * Check if we're in an infinite loop (same error repeated)
   */
  isInfiniteLoop(): boolean {
    if (this.attempts.length < 2) return false;

    const recentErrors = this.attempts
      .slice(-2)
      .map(a => a.errorType)
      .filter(Boolean);

    // Same error type twice in a row = potential infinite loop
    return recentErrors.length === 2 && recentErrors[0] === recentErrors[1];
  }

  /**
   * Calculate confidence that we should keep retrying
   * 0 = give up, 1 = confident we can fix
   */
  getRetryConfidence(): number {
    if (this.attempts.length === 0) return 1.0;
    if (this.isInfiniteLoop()) return 0.1; // Low confidence if looping
    if (this.isExhausted()) return 0.0; // No confidence if exhausted

    // Confidence based on progress
    const errorCounts = this.attempts.filter(a => a.error).length;
    const fixCounts = this.attempts.filter(a => a.fixes?.length).length;

    // If we've successfully applied fixes, confidence stays high
    if (fixCounts > errorCounts / 2) {
      return 0.8;
    }

    // If all attempts failed, confidence drops
    if (errorCounts === this.attempts.length) {
      return 0.3;
    }

    return 0.6;
  }

  /**
   * Get command metadata
   */
  getMetadata() {
    return {
      commandId: this.commandId,
      attemptCount: this.attempts.length,
      totalTimeMs: Date.now() - this.startTime,
      isExhausted: this.isExhausted(),
      isLooping: this.isInfiniteLoop(),
      confidence: this.getRetryConfidence(),
    };
  }
}

/**
 * Export convenience function for creating retry contexts
 */
export function createRetryContext(commandId: string): RetryContext {
  return new RetryContext(commandId);
}
