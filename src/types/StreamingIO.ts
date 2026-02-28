/**
 * StreamingIO Types - v2.12.0 Real-Time I/O Infrastructure
 *
 * Core types for streaming output, interactive input, and process monitoring.
 */

/**
 * StreamingEvent: Emitted by Executor during streaming operations
 *
 * These events allow VS Code extension to update UI in real-time
 */
export type StreamingEvent =
  | { type: 'data'; stepId: number; data: string; isStderr: boolean }
  | { type: 'prompt'; stepId: number; promptText: string; suggestedInputs?: string[] }
  | { type: 'suspended'; stepId: number; planId: string; promptText: string; resumable: boolean }
  | { type: 'resumed'; stepId: number; userInput: string }
  | { type: 'integrity_failed'; conflicts: Array<{ filePath: string; action: string }> }
  | { type: 'process_exit'; stepId: number; exitCode: number; duration: number }
  | { type: 'process_timeout'; stepId: number; timeout: number }
  | { type: 'process_killed'; stepId: number; reason: string }
  | { type: 'error'; message: string; code: string };

/**
 * StreamingConfig: Configuration for streaming output
 */
export interface StreamingConfig {
  /** Enable real-time streaming to OutputChannel */
  enabled: boolean;

  /** Maximum lines to buffer before flushing (default: 100) */
  bufferSize?: number;

  /** Auto-detect and handle prompts */
  autoDetectPrompts?: boolean;

  /** Patterns to match for prompt detection */
  promptPatterns?: RegExp[];

  /** Echo user input to output (for debugging) */
  echoInput?: boolean;
}

/**
 * PromptPattern: Regex and metadata for detecting user prompts
 *
 * v2.12.0: Centralized prompt detection patterns
 */
export interface PromptPattern {
  /** Regex pattern to match prompt text */
  pattern: RegExp;

  /** Human-readable name for this pattern (e.g., 'npm_proceed', 'git_rebase') */
  name: string;

  /** Suggested valid inputs for this prompt */
  suggestedInputs?: string[];

  /** Default input if user just hits Enter */
  defaultInput?: string;
}

/**
 * Default prompt patterns used by v2.12.0
 *
 * Covers npm, yarn, pnpm, git, sudo, and generic yes/no prompts
 * Order matters: More specific patterns should come first
 */
export const DEFAULT_PROMPT_PATTERNS: PromptPattern[] = [
  // npm & yarn package manager prompts
  {
    name: 'npm_proceed',
    pattern: /npm\s+(?:ERR|WARN)!.*\s*\(y\/n\)/i,
    suggestedInputs: ['y', 'n'],
    defaultInput: 'n',
  },
  {
    name: 'yarn_proceed',
    pattern: /yarn\s+(?:ERR|WARN)!.*\s*\(y\/n\)/i,
    suggestedInputs: ['y', 'n'],
    defaultInput: 'n',
  },
  {
    name: 'pnpm_proceed',
    pattern: /pnpm\s+(?:ERR|WARN)!.*\s*\(y\/n\)/i,
    suggestedInputs: ['y', 'n'],
    defaultInput: 'n',
  },

  // Password prompts (sudo, ssh, etc.)
  {
    name: 'password_prompt',
    pattern: /[Pp]assword\s*[:]/,
    suggestedInputs: [],
  },
  {
    name: 'sudo_password',
    pattern: /\[sudo\]\s+password\s+for/i,
    suggestedInputs: [],
  },

  // Yes/No confirmation prompts
  {
    name: 'uppercase_yes_no',
    pattern: /\[Y\/n\]/,
    suggestedInputs: ['y', 'n'],
    defaultInput: 'y',
  },
  {
    name: 'lowercase_yes_no',
    pattern: /\[y\/N\]/,
    suggestedInputs: ['y', 'n'],
    defaultInput: 'n',
  },
  {
    name: 'confirm_yes_no',
    pattern: /\(yes\/no\)/i,
    suggestedInputs: ['yes', 'no'],
    defaultInput: 'no',
  },

  // Generic proceed/continue prompts
  {
    name: 'generic_proceed',
    pattern: /[Pp]roceed\s*\?\s*(?:\(y\/n\))?/,
    suggestedInputs: ['y', 'n'],
    defaultInput: 'y',
  },
  {
    name: 'continue_prompt',
    pattern: /[Cc]ontinue\s*\?\s*(?:\(y\/n\))?/,
    suggestedInputs: ['y', 'n'],
    defaultInput: 'y',
  },
  {
    name: 'overwrite_prompt',
    pattern: /[Oo]verwrite\s*\?\s*(?:\(y\/n\))?/,
    suggestedInputs: ['y', 'n'],
    defaultInput: 'n',
  },

  // Selection menus (version selection, etc.)
  {
    name: 'select_version',
    pattern: /[Ss]elect\s+(?:a\s+)?[a-z]+\s*[:]/i,
    suggestedInputs: ['1', '2', '3'],
  },
  {
    name: 'numbered_selection',
    pattern: /^\s*\d+\)\s+.+$/m,
    suggestedInputs: ['1', '2', '3'],
  },

  // Git-specific prompts
  {
    name: 'git_rebase_editor',
    pattern: />>>\s*$/m,
    suggestedInputs: [],
    defaultInput: 'continue',
  },
  {
    name: 'git_merge_conflict',
    pattern: /\(Aborting\)|CONFLICT/i,
    suggestedInputs: [],
  },

  // Generic catch-all patterns (must be last)
  {
    name: 'question_mark',
    pattern: /\?\s*$/,
    suggestedInputs: ['y', 'n'],
    defaultInput: 'n',
  },
];

/**
 * CommandOutput: Streaming output from a command
 */
export interface CommandOutput {
  /** Standard output lines */
  stdout: string[];

  /** Standard error lines */
  stderr: string[];

  /** Exit code (null if still running) */
  exitCode: number | null;

  /** Total duration in milliseconds */
  duration: number;

  /** Detected prompt text (if any) */
  detectedPrompt?: string;

  /** Whether output indicates user input is needed */
  requiresUserInput: boolean;
}

/**
 * PromptResponse: User's response to a detected prompt
 */
export interface PromptResponse {
  /** The actual input the user provided */
  userInput: string;

  /** Timestamp when user provided input */
  timestamp: number;

  /** Suggested input that was selected (if user clicked suggestion) */
  selectedSuggestion?: string;

  /** Whether user confirmed (vs cancelled) */
  confirmed: boolean;
}

/**
 * Prompt detection helper function
 *
 * Checks if text matches any of the known prompt patterns
 */
export function detectPrompt(
  text: string,
  patterns: PromptPattern[] = DEFAULT_PROMPT_PATTERNS
): PromptPattern | null {
  for (const pattern of patterns) {
    if (pattern.pattern.test(text)) {
      return pattern;
    }
  }
  return null;
}

/**
 * Extract suggested inputs from detected prompt
 */
export function getSuggestedInputs(
  promptText: string,
  patterns: PromptPattern[] = DEFAULT_PROMPT_PATTERNS
): string[] {
  const pattern = detectPrompt(promptText, patterns);
  return pattern?.suggestedInputs ?? [];
}

/**
 * Check if a string looks like a prompt (ends with ?, >>, [Y/n], etc.)
 *
 * Used as a heuristic before checking regex patterns
 */
export function looksLikePrompt(text: string): boolean {
  const lines = text.split('\n');
  const lastLine = lines[lines.length - 1].trim();

  return (
    lastLine.endsWith('?') ||
    lastLine.endsWith(':') ||
    lastLine.includes('[Y/n]') ||
    lastLine.includes('[y/N]') ||
    lastLine.endsWith('>>') ||
    lastLine.endsWith('>>>') ||
    /^\d+\)/.test(lastLine) // Option numbers like "1) option"
  );
}
