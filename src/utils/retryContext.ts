/**
 * RetryContext - Memory of previous attempts within a single retry cycle
 * 
 * Part of the "Stateful Correction" architecture (Phase 1 - v3.0 Relaunch)
 * 
 * Problem:
 * When the LLM fails to fix code and we retry, it doesn't remember what it tried before.
 * This causes infinite loops where the LLM repeats the same mistake.
 * 
 * Solution:
 * Track all attempts in the current retry cycle, and inject the full history
 * into the system prompt with explicit instructions like:
 * "You previously generated code with [ERROR]. Do NOT repeat this mistake."
 * 
 * Lifecycle:
 * 1. Create RetryContext when first error is encountered
 * 2. Store original code + error
 * 3. For each retry attempt, add attempt record with generated code + failure reason
 * 4. Pass full history to LLM in next retry
 * 5. Dispose after command completes (max 3 retries)
 */

export interface ValidationError {
  type: string;
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface AttemptRecord {
  attemptNumber: number;
  timestamp: number;
  generatedCode: string;
  error: ValidationError;
  fixApproach: string;
}

export class RetryContext {
  /** Original code before any fixes */
  readonly originalCode: string;

  /** Original validation error that triggered retries */
  readonly originalError: ValidationError;

  /** All attempts made so far in this retry cycle */
  private attempts: AttemptRecord[] = [];

  /** Maximum retries before giving up (default: 3) */
  readonly maxRetries: number;

  /** Timestamp when this context was created */
  readonly createdAt: number;

  /** Current attempt number (0-indexed) */
  private attemptNumber: number = -1;

  constructor(originalCode: string, originalError: ValidationError, maxRetries: number = 3) {
    this.originalCode = originalCode;
    this.originalError = originalError;
    this.maxRetries = maxRetries;
    this.createdAt = Date.now();
  }

  /**
   * Record an attempt with its generated code and failure
   */
  recordAttempt(generatedCode: string, error: ValidationError, fixApproach: string): void {
    this.attemptNumber++;
    this.attempts.push({
      attemptNumber: this.attemptNumber,
      timestamp: Date.now(),
      generatedCode,
      error,
      fixApproach,
    });
  }

  /**
   * Get the current attempt number (0-indexed)
   */
  getCurrentAttemptNumber(): number {
    return this.attemptNumber;
  }

  /**
   * Check if we've exhausted retries
   */
  isExhausted(): boolean {
    return this.attemptNumber >= this.maxRetries;
  }

  /**
   * Get the number of remaining retries
   */
  getRemainingRetries(): number {
    return Math.max(0, this.maxRetries - this.attemptNumber);
  }

  /**
   * Get the full history of attempts
   */
  getAttempts(): AttemptRecord[] {
    return [...this.attempts];
  }

  /**
   * Get the last attempt (most recent)
   */
  getLastAttempt(): AttemptRecord | undefined {
    return this.attempts[this.attempts.length - 1];
  }

  /**
   * Build a system prompt injection that encodes the retry history
   * This is used to instruct the LLM about what mistakes to avoid
   */
  buildRetryHistoryPrompt(): string {
    if (this.attempts.length === 0) {
      return '';
    }

    let prompt = `## Retry History\n\n`;
    prompt += `You have already attempted to fix this code ${this.attempts.length} time(s).\n\n`;

    for (const attempt of this.attempts) {
      prompt += `### Attempt ${attempt.attemptNumber + 1}\n`;
      prompt += `**Approach:** ${attempt.fixApproach}\n`;
      prompt += `**Code Generated:**\n\`\`\`typescript\n${this.truncateCode(attempt.generatedCode)}\n\`\`\`\n`;
      prompt += `**Failed With:** ${attempt.error.message}\n`;
      if (attempt.error.suggestion) {
        prompt += `**Why:** ${attempt.error.suggestion}\n`;
      }
      prompt += `\n`;
    }

    prompt += `## Critical Instructions\n`;
    prompt += `**DO NOT repeat the mistakes above.** Each attempt failed for a specific reason.\n`;
    prompt += `This time, focus ONLY on fixing: **${this.originalError.message}**\n\n`;

    // Add specific anti-patterns based on error history
    const commonMistakes = this.identifyCommonMistakes();
    if (commonMistakes.length > 0) {
      prompt += `**Mistakes to avoid:**\n`;
      commonMistakes.forEach((mistake) => {
        prompt += `- ${mistake}\n`;
      });
      prompt += `\n`;
    }

    return prompt;
  }

  /**
   * Identify patterns in the retry history to guide the next attempt
   */
  private identifyCommonMistakes(): string[] {
    const mistakes: Set<string> = new Set();

    for (const attempt of this.attempts) {
      const error = attempt.error;

      if (error.message.includes('missing') && error.message.includes('import')) {
        mistakes.add('Missing import statement');
      }
      if (error.message.includes('useState') || error.message.includes('useEffect')) {
        mistakes.add('React hook not imported from react');
      }
      if (error.message.includes('unused variable')) {
        mistakes.add('Declaring variables that are never used');
      }
      if (error.message.includes('syntax')) {
        mistakes.add('Syntax errors (missing semicolon, bracket)');
      }
      if (error.message.includes('undefined')) {
        mistakes.add('Using undefined variables or functions');
      }
    }

    return Array.from(mistakes);
  }

  /**
   * Truncate long code snippets for readability in prompts
   */
  private truncateCode(code: string, maxLines: number = 15): string {
    const lines = code.split('\n');
    if (lines.length <= maxLines) {
      return code;
    }
    return lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`;
  }

  /**
   * Get confidence score (0-1) that we should continue retrying
   * Based on whether we're making progress
   */
  getRetryConfidence(): number {
    if (this.attempts.length === 0) {
      return 1.0; // First attempt, high confidence
    }

    // If we have 3+ attempts, confidence drops to 0.3
    if (this.attempts.length >= 3) {
      return 0.3;
    }

    // Check if error messages are different (sign of progress)
    const errorMessages = this.attempts.map((a) => a.error.message);
    const uniqueErrors = new Set(errorMessages);

    // If we're seeing the same error repeatedly, low confidence
    if (uniqueErrors.size === 1) {
      return 0.4;
    }

    // Decreasing confidence with each attempt
    return 1.0 - this.attempts.length * 0.25;
  }

  /**
   * Get a summary of the retry context for logging
   */
  getSummary(): string {
    return (
      `RetryContext: ${this.attempts.length} attempts, ` +
      `exhausted=${this.isExhausted()}, ` +
      `confidence=${this.getRetryConfidence().toFixed(2)}, ` +
      `duration=${Date.now() - this.createdAt}ms`
    );
  }
}
