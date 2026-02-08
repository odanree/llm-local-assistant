/**
 * Executor Contract Types - Shared Schema Between Planner and Executor
 * 
 * This is the SINGLE SOURCE OF TRUTH for what actions the Executor can perform.
 * Both Planner (system prompt) and Executor (switch block) must use this enum.
 */

/**
 * ActionType: The only actions the Executor can perform
 * 
 * These are "Worker-level" operations that map to file system and terminal primitives.
 * NO "Manager-level" tasks (ANALYZE, REVIEW) — those happen in planning, not execution.
 */
export enum ActionType {
  /** Read a file or directory and return contents */
  READ = 'read',

  /** Write or modify a file */
  WRITE = 'write',

  /** Execute a shell command or npm script */
  RUN = 'run',

  /** Delete a file or directory */
  DELETE = 'delete',

  /** Manual verification step (for projects without testing infrastructure) */
  MANUAL = 'manual',
}

/** String literal type for flexibility when needed */
export type ActionTypeString = 'read' | 'write' | 'run' | 'delete' | 'manual';

/**
 * Validate that an action string is a valid ActionType
 */
export function isValidActionType(action: unknown): action is ActionTypeString {
  if (typeof action !== 'string') return false;
  return ['read', 'write', 'run', 'delete'].includes(action);
}

/**
 * Throw an error if action is invalid (Schema Violation Guard)
 */
export function assertValidActionType(action: unknown): ActionTypeString {
  if (!isValidActionType(action)) {
    throw new Error(
      `Schema Violation: Action "${action}" is not a valid executor action. ` +
      `Valid actions: ${Object.values(ActionType).join(', ')}. ` +
      `Manager-level tasks (ANALYZE, REVIEW) must be performed in the Planner, not the Executor.`
    );
  }
  return action;
}

/**
 * ExecutionStep: The minimal contract between Planner and Executor
 */
export interface ExecutionStep {
  /** Unique identifier for this step */
  stepId: number;

  /** Sequential step number (1-indexed) */
  stepNumber: number;

  /** The action to perform (must be from ActionType) */
  action: ActionTypeString;

  /** Human-readable description of what this step does */
  description: string;

  /** File or directory path this step operates on */
  path?: string;

  /** Expected outcome (for documentation and validation) */
  expectedOutcome: string;

  /** Step IDs this step depends on (for ordering) */
  dependencies?: number[];

  /** Command to run (for RUN actions) */
  command?: string;

  /** Prompt or code to generate (for WRITE actions) */
  prompt?: string;

  /** Additional context (internal use) */
  metadata?: Record<string, unknown>;
}

/**
 * StepResult: The output from executing a single step
 */
export interface StepResult {
  stepId: number;
  success: boolean;
  output?: string; // File contents (READ) or command output (RUN)
  error?: string; // Error message if failed
  duration: number; // Milliseconds
  timestamp?: number; // Unix timestamp when step completed (optional for backward compat)
  requiresManualVerification?: boolean; // True if step requires manual user action (MANUAL action type)
}

/**
 * Validator Guard: Used at the start of Executor.execute()
 * Fails fast with clear error message if step is malformed
 */
export function validateExecutionStep(step: unknown): ExecutionStep {
  if (!step || typeof step !== 'object') {
    throw new Error(
      `Validator Gate Failed: Step is not an object. ` +
      `Received: ${typeof step} - "${step}". ` +
      `This usually means step initialization failed or state was lost.`
    );
  }

  const s = step as Partial<ExecutionStep>;

  if (typeof s.stepId !== 'number') {
    throw new Error(
      `Validator Gate Failed: Step missing stepId (number). ` +
      `Received: ${typeof s.stepId} - "${s.stepId}". ` +
      `This prevents error logging and state tracking.`
    );
  }

  if (typeof s.action !== 'string') {
    throw new Error(
      `Validator Gate Failed: Step ${s.stepId} missing action (string). ` +
      `Received: ${typeof s.action} - "${s.action}". ` +
      `Cannot determine what operation to perform.`
    );
  }

  assertValidActionType(s.action);

  if (typeof s.description !== 'string' || !s.description.trim()) {
    throw new Error(
      `Validator Gate Failed: Step ${s.stepId} missing description. ` +
      `Cannot understand what this step is supposed to do.`
    );
  }

  return s as ExecutionStep;
}
