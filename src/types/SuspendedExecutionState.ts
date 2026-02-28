/**
 * SuspendedExecutionState - v2.12.0 Suspend/Resume State Persistence
 *
 * When the Executor encounters an interactive command that requires user input,
 * it saves its current state to codebaseIndex. This allows the executor to:
 *
 * 1. Survive extension crashes (state recovered on restart)
 * 2. Resume from the exact same step after user provides input
 * 3. Verify file consistency before resuming (no data loss)
 * 4. Report clear status to the user
 */

import { ExecutionStep, StepResult } from './executor';

/**
 * SuspendedExecutionState: Snapshot of execution state before yielding to user
 *
 * Stored in: codebaseIndex.planSuspensions[planId]
 * Lifetime: Persists until plan is completed, resumed, or explicitly cleared
 *
 * Example:
 * ```json
 * {
 *   "planId": "plan-abc123",
 *   "stepIndex": 4,
 *   "step": {
 *     "stepId": 4,
 *     "action": "run",
 *     "command": "npm install",
 *     "description": "Install dependencies"
 *   },
 *   "timestamp": 1708956234000,
 *   "remainingSteps": [
 *   "context": {
 *     "lastStdout": "npm WARN: ...\nproceed? (y/n) ",
 *     "lastStderr": "",
 *     "fileSnapshot": {
 *       "src/LoginForm.tsx": "hash:abc123...",
 *       "src/store.ts": "hash:def456..."
 *     },
 *     "completedSteps": {
 *       "1": { "success": true, "duration": 1200 },
 *       "2": { "success": true, "duration": 500 },
 *       "3": { "success": true, "duration": 800 }
 *     }
 *   },
 *   "promptText": "npm: proceed? (y/n)",
 *   "metadata": {
 *     "userMessage": "Waiting for npm installation prompt response",
 *     "retryCount": 0
 *   }
 * }
 * ```
 */
export interface SuspendedExecutionState {
  /** Unique identifier for the plan being executed */
  planId: string;

  /** Index of the step that triggered suspension (0-based) */
  stepIndex: number;

  /** The actual step that requires user input */
  step: ExecutionStep;

  /** Unix timestamp when suspension occurred */
  timestamp: number;

  /** All remaining steps after the current one */
  remainingSteps: ExecutionStep[];

  /**
   * Contextual information about the suspension
   */
  context: {
    /** Last stdout before process requested input */
    lastStdout: string;

    /** Last stderr before process requested input */
    lastStderr: string;

    /**
     * File content hashes at suspension time
     * Maps file path → SHA256 hash of file content
     *
     * Used to detect if user edited files while executor was paused
     * Example: { "src/LoginForm.tsx": "abc123...", "src/store.ts": "def456..." }
     */
    fileSnapshot: Record<string, string>;

    /** Results of all completed steps (for reference/debugging) */
    completedSteps: Map<number, StepResult>;

    /**
     * Exit code from the suspended process (if available)
     * undefined = process still running
     */
    processExitCode?: number;

    /** PID of the suspended process (for debugging) */
    processPID?: number;
  };

  /**
   * The detected prompt text that caused suspension
   * Shown to user in VS Code UI
   * Example: "npm: proceed? (y/n)"
   */
  promptText?: string;

  /**
   * Additional metadata
   */
  metadata?: {
    /** User-friendly message explaining why execution paused */
    userMessage?: string;

    /** How many times the user has failed to provide valid input */
    retryCount?: number;

    /** Suggested valid inputs (e.g., ['y', 'n'] or ['1', '2', '3']) */
    suggestedInputs?: string[];

    /** Custom tags for organizing suspensions */
    tags?: string[];
  };
}

/**
 * IntegrityCheckResult: Output from verifyStateIntegrity()
 *
 * Used before resuming a suspended plan to ensure no files were
 * modified while the executor was paused.
 */
export interface IntegrityCheckResult {
  /** True if all files match their expected state */
  valid: boolean;

  /** Reason why check failed (if valid === false) */
  reason?: string;

  /**
   * List of files that changed while executor was suspended
   *
   * Empty array if no conflicts
   */
  conflicts?: FileConflict[];
}

/**
 * FileConflict: Represents a file that changed during suspension
 */
export interface FileConflict {
  /** Absolute path to the conflicted file */
  filePath: string;

  /** Hash of the file when executor suspended */
  expectedHash: string;

  /** Hash of the file on disk now */
  actualHash: string;

  /**
   * Recommended action
   * - 'block': User must resolve conflict before continuing
   * - 'overwrite': Safe to re-write the file with executor's version
   * - 'skip': Safe to ignore and continue
   */
  action: 'block' | 'overwrite' | 'skip';
}

/**
 * ResumeOptions: Configuration for executor.resume()
 */
export interface ResumeOptions {
  /** The user input to send to the suspended process */
  userInput: string;

  /** Whether to skip integrity checks (not recommended) */
  skipIntegrityCheck?: boolean;

  /** Action to take if file conflicts detected */
  conflictResolution?: 'block' | 'overwrite' | 'skip';
}
