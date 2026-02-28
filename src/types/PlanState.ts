/**
 * PlanState Enum - Executor Lifecycle States for v2.12.0
 *
 * Defines all possible states the Executor can be in during plan execution.
 * NEW: SUSPENDED_FOR_PERMISSION state for interactive command handling.
 */

export enum PlanState {
  /** Executor is idle, no plan loaded */
  IDLE = 'idle',

  /** Planner is generating execution steps */
  PLANNING = 'planning',

  /** Executor is actively running steps */
  EXECUTING = 'executing',

  /**
   * NEW v2.12.0: Executor paused waiting for user permission
   *
   * This state is triggered when:
   * - A RUN step encounters an interactive prompt (npm install: proceed? y/n)
   * - The executor detects requiresUserInput flag on step result
   * - The executor has saved its state to codebaseIndex for recovery
   *
   * The executor will NOT auto-retry or fail. Instead:
   * 1. It emits 'executor:suspended' event to UI
   * 2. User sees the prompt in OutputChannel
   * 3. User types response into OutputChannel input box
   * 4. Extension calls executor.resume(userInput)
   * 5. Executor continues from exact same step
   *
   * Recovery: If extension crashes while suspended, resuming the plan will
   * restore the executor to this exact state via codebaseIndex.
   */
  SUSPENDED_FOR_PERMISSION = 'suspended_for_permission',

  /** Executor is paused by user (manual pause button) */
  PAUSED = 'paused',

  /** All steps completed successfully */
  COMPLETED = 'completed',

  /** Plan execution failed (too many retries, fatal error, user cancellation) */
  FAILED = 'failed',
}

/** String literal type for PlanState for flexibility */
export type PlanStateString = 'idle' | 'planning' | 'executing' | 'suspended_for_permission' | 'paused' | 'completed' | 'failed';

/**
 * Validate that a string is a valid PlanState
 */
export function isValidPlanState(state: unknown): state is PlanStateString {
  if (typeof state !== 'string') {
    return false;
  }
  return Object.values(PlanState).includes(state as PlanState);
}

/**
 * Type guard for async/await context
 */
export function assertValidPlanState(state: unknown): PlanStateString {
  if (!isValidPlanState(state)) {
    throw new Error(
      `Invalid PlanState: "${state}". ` +
      `Valid states: ${Object.values(PlanState).join(', ')}`
    );
  }
  return state;
}
