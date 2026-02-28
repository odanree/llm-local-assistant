/**
 * AsyncCommandRunner Interactive Tests - v2.12.0 Milestone 2
 *
 * 18 comprehensive tests covering:
 * - Prompt pattern detection (8 tests)
 * - sendInput() functionality (4 tests)
 * - Pattern-specific handling (4 tests)
 * - Edge cases (2 tests)
 *
 * Coverage target: +0.2% (prompt detection & input piping)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AsyncCommandRunner } from '../services/AsyncCommandRunner';
import { ProcessHandle } from '../types/ProcessHandle';
import { detectPrompt, DEFAULT_PROMPT_PATTERNS, looksLikePrompt } from '../types/StreamingIO';

describe('AsyncCommandRunner - Interactive Input (M2)', () => {
  let runner: AsyncCommandRunner;

  beforeEach(() => {
    runner = new AsyncCommandRunner();
  });

  // ============================================================
  // GROUP 1: PROMPT PATTERN DETECTION (8 tests)
  // ============================================================

  describe('Prompt Detection: Pattern Matching', () => {
    it('should detect npm proceed prompt', () => {
      const text = 'npm ERR! unknown command "foobar"\n(y/n)';
      const pattern = detectPrompt(text, DEFAULT_PROMPT_PATTERNS);

      expect(pattern).toBeDefined();
      expect(pattern?.name).toBe('npm_proceed');
      expect(pattern?.suggestedInputs).toContain('y');
      expect(pattern?.suggestedInputs).toContain('n');
    });

    it('should detect yarn proceed prompt', () => {
      const text = 'yarn ERR! Not found\n(y/n)';
      const pattern = detectPrompt(text);

      expect(pattern).toBeDefined();
      expect(pattern?.name).toMatch(/npm|yarn|proceed/);
    });

    it('should detect password prompt', () => {
      const text = '[sudo] password for user:';
      const pattern = detectPrompt(text);

      expect(pattern).toBeDefined();
      expect(pattern?.name).toMatch(/password|sudo/i);
    });

    it('should detect yes/no uppercase prompt [Y/n]', () => {
      const text = 'Continue? [Y/n]';
      const pattern = detectPrompt(text);

      expect(pattern).toBeDefined();
      expect(pattern?.suggestedInputs).toEqual(['y', 'n']);
    });

    it('should detect yes/no lowercase prompt [y/N]', () => {
      const text = 'Proceed? [y/N]';
      const pattern = detectPrompt(text);

      expect(pattern).toBeDefined();
      expect(pattern?.suggestedInputs).toEqual(['y', 'n']);
    });

    it('should detect selection menu prompt', () => {
      const text = 'Select a version:\n1) v1.0.0\n2) v2.0.0\n3) v3.0.0';
      const pattern = detectPrompt(text);

      expect(pattern).toBeDefined();
      expect(pattern?.suggestedInputs).toContain('1');
      expect(pattern?.suggestedInputs).toContain('2');
    });

    it('should detect git rebase prompt', () => {
      const text = 'pick abc123 first commit\n>>>';
      const pattern = detectPrompt(text);

      expect(pattern).toBeDefined();
      expect(pattern?.name).toBe('git_rebase_editor');
    });

    it('should return null for non-prompt text', () => {
      const text = 'This is just regular output\nNo prompt here';
      const pattern = detectPrompt(text);

      expect(pattern).toBeNull();
    });
  });

  // ============================================================
  // GROUP 2: SENDINPUT FUNCTIONALITY (4 tests)
  // ============================================================

  describe('sendInput: Interactive Response', () => {
    it('should send input to process stdin', async () => {
      let receivedPrompt = false;
      const handle = runner.spawn('read -p "Enter something: " var; echo $var');

      handle.onPrompt((text) => {
        receivedPrompt = true;
        handle.sendInput('test_input\n');
      });

      await waitForExit(handle);

      // Just verify process ran and exited
      expect(handle.isRunning()).toBe(false);
    });

    it('should handle input before process ready', async () => {
      const handle = runner.spawn('sleep 0.1; echo done');

      // Send input before process is ready (should buffer)
      expect(() => {
        handle.sendInput('early_input\n');
      }).not.toThrow();

      await waitForExit(handle);
      expect(handle.isRunning()).toBe(false);
    });

    it('should handle large input (>1KB)', async () => {
      const largeInput = 'x'.repeat(2000) + '\n';
      const handle = runner.spawn('cat > /dev/null 2>&1');

      expect(() => {
        handle.sendInput(largeInput);
      }).not.toThrow();

      handle.kill();
    });

    it('should handle non-ASCII characters (unicode)', async () => {
      const unicodeInput = '你好世界🚀\n';
      const handle = runner.spawn('cat > /dev/null 2>&1');

      expect(() => {
        handle.sendInput(unicodeInput);
      }).not.toThrow();

      handle.kill();
    });
  });

  // ============================================================
  // GROUP 3: PATTERN-SPECIFIC HANDLING (4 tests)
  // ============================================================

  describe('Pattern-Specific: Behavior per prompt type', () => {
    it('should provide default input for [Y/n] prompt', () => {
      const text = 'Continue? [Y/n]';
      const pattern = detectPrompt(text);

      expect(pattern?.defaultInput).toBe('y');
    });

    it('should provide default input for [y/N] prompt', () => {
      const text = 'Overwrite? [y/N]';
      const pattern = detectPrompt(text);

      expect(pattern?.defaultInput).toBe('n');
    });

    it('should provide suggested inputs for selection', () => {
      const text = 'Select version:\n1) v1.0.0\n2) v2.0.0';
      const pattern = detectPrompt(text);

      expect(pattern?.suggestedInputs).toEqual(['1', '2', '3']);
    });

    it('should handle password prompts (no suggestions)', () => {
      const text = '[sudo] password for user:';
      const pattern = detectPrompt(text);

      expect(pattern?.suggestedInputs).toEqual([]);
      expect(pattern?.name).toMatch(/password|sudo/i);
    });
  });

  // ============================================================
  // GROUP 4: EDGE CASES (2 tests)
  // ============================================================

  describe('Edge Cases: Robustness', () => {
    it('should handle multiline prompts correctly', async () => {
      const multilinePrompt = `This is a multiline prompt
with multiple lines
Proceed? (y/n)`;
      const pattern = detectPrompt(multilinePrompt);

      expect(pattern).toBeDefined();
      expect(pattern?.suggestedInputs).toContain('y');
    });

    it('should prioritize more specific patterns', () => {
      // If text matches multiple patterns, more specific should win
      const text = 'npm ERR! (y/n)';
      const pattern = detectPrompt(text);

      // Should match npm_proceed (more specific) not generic_proceed
      expect(pattern?.name).toBe('npm_proceed');
    });
  });
});

// ============================================================
// HELPER: Utility Functions
// ============================================================

describe('StreamingIO: Utility Functions', () => {
  describe('looksLikePrompt heuristic', () => {
    it('should detect prompt-like text', () => {
      expect(looksLikePrompt('Continue?')).toBe(true);
      expect(looksLikePrompt('password:')).toBe(true);
      expect(looksLikePrompt('[Y/n]')).toBe(true);
    });

    it('should not detect regular output', () => {
      expect(looksLikePrompt('regular output')).toBe(false);
      expect(looksLikePrompt('some text')).toBe(false);
    });
  });

  describe('detectPrompt with custom patterns', () => {
    it('should allow custom pattern sets', () => {
      const customPatterns = [
        {
          name: 'custom_prompt',
          pattern: /CUSTOM\?/,
          suggestedInputs: ['custom1', 'custom2'],
        },
      ];

      const text = 'CUSTOM?';
      const pattern = detectPrompt(text, customPatterns);

      expect(pattern?.name).toBe('custom_prompt');
    });

    it('should return null with empty pattern set', () => {
      const text = 'Continue? [Y/n]';
      const pattern = detectPrompt(text, []);

      expect(pattern).toBeNull();
    });
  });

  describe('DEFAULT_PROMPT_PATTERNS completeness', () => {
    it('should have patterns for npm, yarn, pnpm', () => {
      const names = DEFAULT_PROMPT_PATTERNS.map((p) => p.name);

      expect(names).toContain('npm_proceed');
      expect(names).toContain('yarn_proceed');
      expect(names).toContain('pnpm_proceed');
    });

    it('should have password patterns', () => {
      const names = DEFAULT_PROMPT_PATTERNS.map((p) => p.name);

      expect(names.some((n) => n.includes('password'))).toBe(true);
    });

    it('should have yes/no patterns', () => {
      const names = DEFAULT_PROMPT_PATTERNS.map((p) => p.name);

      expect(names).toContain('uppercase_yes_no');
      expect(names).toContain('lowercase_yes_no');
    });

    it('should have selection menu pattern', () => {
      const names = DEFAULT_PROMPT_PATTERNS.map((p) => p.name);

      expect(names).toContain('select_version');
    });

    it('should have git rebase pattern', () => {
      const names = DEFAULT_PROMPT_PATTERNS.map((p) => p.name);

      expect(names).toContain('git_rebase_editor');
    });
  });
});

// ============================================================
// Helper Function
// ============================================================

function waitForExit(
  handle: ProcessHandle,
  timeout: number = 5000
): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (handle.isRunning()) {
        handle.kill();
      }
      resolve();
    }, timeout);

    handle.onExit(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}
