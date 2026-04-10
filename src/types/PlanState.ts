/**
 * PlanState Enum - Executor Lifecycle States
 */

export enum PlanState {
  /** Executor is idle, no plan loaded */
  IDLE = 'idle',

  /** Planner is generating execution steps */
  PLANNING = 'planning',

  /** Executor is actively running steps */
  EXECUTING = 'executing',

  /** Executor is paused by user (manual pause button) */
  PAUSED = 'paused',

  /** All steps completed successfully */
  COMPLETED = 'completed',

  /** Plan execution failed (too many retries, fatal error, user cancellation) */
  FAILED = 'failed',
}

/** String literal type for PlanState for flexibility */
export type PlanStateString = 'idle' | 'planning' | 'executing' | 'paused' | 'completed' | 'failed';

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
