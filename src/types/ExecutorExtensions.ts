/**
 * ExecutorExtensions - v2.12.0 Type Extensions
 *
 * Extensions to existing Executor types to support suspend/resume functionality.
 * These show what properties need to be added to the Executor class.
 *
 * NOTE: This file is for documentation. Actual implementation merges these
 * into the Executor class in src/executor.ts
 */

import { PlanState, PlanStateString } from './PlanState';
import { SuspendedExecutionState, IntegrityCheckResult } from './SuspendedExecutionState';
import { ProcessHandle } from './ProcessHandle';
import { ExecutionStep, StepResult } from './executor';

/**
 * Extension to ExecutorConfig for v2.12.0
 *
 * These properties should be added to the ExecutorConfig interface in executor.ts:
 *
 * ```typescript
 * export interface ExecutorConfig {
 *   // ... existing properties ...
 *
 *   // v2.12.0: Streaming I/O
 *   onStreamData?: (stepId: number, data: string, isStderr: boolean) => void;
 *   onStreamPrompt?: (stepId: number, promptText: string) => Promise<string | undefined>;
 *   onStreamSuspended?: (state: SuspendedExecutionState) => void;
 *   onStreamResumed?: (stepId: number, userInput: string) => void;
 * }
 * ```
 */

/**
 * Extension to Executor class for v2.12.0
 *
 * These properties should be added to the Executor class in executor.ts:
 *
 * ```typescript
 * export class Executor {
 *   private config: ExecutorConfig;
 *   private plan: TaskPlan | null = null;
 *   private paused: boolean = false;
 *   private cancelled: boolean = false;
 *
 *   // v2.12.0: NEW STATE MANAGEMENT
 *   private executorState: PlanStateString = PlanState.IDLE;
 *   private suspendedState: SuspendedExecutionState | null = null;
 *   private currentProcess: ProcessHandle | null = null;
 *
 *   // ... rest of class ...
 * }
 * ```
 */

/**
 * Extension to StepResult for v2.12.0
 *
 * The StepResult interface should be extended to include:
 *
 * ```typescript
 * export interface StepResult {
 *   stepId: number;
 *   success: boolean;
 *   output?: string;
 *   error?: string;
 *   duration: number;
 *   timestamp?: number;
 *   requiresManualVerification?: boolean;
 *
 *   // v2.12.0: NEW FIELDS
 *   /**
 *    * True if step requires user input before continuing
 *    * Triggers PlanState.SUSPENDED_FOR_PERMISSION
 *    * /
 *   requiresUserInput?: boolean;
 *
 *   /**
 *    * The detected prompt text (e.g., "npm: proceed? (y/n)")
 *    * Only populated if requiresUserInput is true
 *    * /
 *   promptText?: string;
 *
 *   /**
 *    * Suggested valid inputs for the prompt
 *    * Example: ['y', 'n'] or ['1', '2', '3']
 *    * /
 *   suggestedInputs?: string[];
 * }
 * ```
 */

/**
 * New methods to add to Executor class
 *
 * ```typescript
 * export class Executor {
 *   // ... existing methods ...
 *
 *   /**
 *    * Get current executor state
 *    * /
 *   getState(): PlanStateString {
 *     return this.executorState;
 *   }
 *
 *   /**
 *    * Get suspended execution state (if any)
 *    * /
 *   getSuspendedState(): SuspendedExecutionState | null {
 *     return this.suspendedState;
 *   }
 *
 *   /**
 *    * Resume execution from a suspended state
 *    *
 *    * Call this when user provides input to the suspended prompt.
 *    *
 *    * Process:
 *    * 1. Verify state integrity (files not modified)
 *    * 2. If conflicts: ask user to resolve and return
 *    * 3. Send userInput to process stdin
 *    * 4. Change state to EXECUTING
 *    * 5. Continue with remaining steps
 *    *
 *    * @param userInput The user's response to the prompt
 *    * @throws Error if not in SUSPENDED_FOR_PERMISSION state
 *    * /
 *   async resume(userInput: string): Promise<void> {
 *     if (this.executorState !== PlanState.SUSPENDED_FOR_PERMISSION) {
 *       throw new Error(`Cannot resume: not in suspended state (current: ${this.executorState})`);
 *     }
 *
 *     if (!this.suspendedState) {
 *       throw new Error('Suspended state lost - cannot resume');
 *     }
 *
 *     // Verify files haven't changed
 *     const integrity = await this.verifyStateIntegrity();
 *     if (!integrity.valid) {
 *       // Emit integrity failure event
 *       this.config.onStreamIntegrityFailed?.(integrity.conflicts || []);
 *       // Don't auto-resume - user must resolve conflicts
 *       return;
 *     }
 *
 *     // Send input to process
 *     this.currentProcess?.sendInput(userInput);
 *
 *     // Resume execution
 *     this.executorState = PlanState.EXECUTING;
 *     this.config.onStreamResumed?.(this.suspendedState.stepIndex, userInput);
 *
 *     // Continue with remaining steps
 *     // (Loop continues in main executePlan() method)
 *   }
 *
 *   /**
 *    * Verify that files haven't been modified while executor was suspended
 *    *
 *    * @returns IntegrityCheckResult with valid flag and conflicts (if any)
 *    * /
 *   private async verifyStateIntegrity(): Promise<IntegrityCheckResult> {
 *     if (!this.suspendedState) {
 *       return { valid: true };
 *     }
 *
 *     const conflicts = [];
 *
 *     // Compare file hashes from snapshot to current state
 *     for (const [filePath, expectedHash] of Object.entries(
 *       this.suspendedState.context.fileSnapshot
 *     )) {
 *       try {
 *         const content = await this.fs.readFile(filePath);
 *         const actualHash = hashFile(content);
 *
 *         if (expectedHash !== actualHash) {
 *           conflicts.push({
 *             filePath,
 *             expectedHash,
 *             actualHash,
 *             action: 'block'
 *           });
 *         }
 *       } catch (err) {
 *         // File deleted or unreadable - treat as conflict
 *         conflicts.push({
 *           filePath,
 *           expectedHash,
 *           actualHash: '[DELETED]',
 *           action: 'block'
 *         });
 *       }
 *     }
 *
 *     return {
 *       valid: conflicts.length === 0,
 *       reason: conflicts.length > 0
 *         ? `${conflicts.length} file(s) changed while suspended`
 *         : undefined,
 *       conflicts
 *     };
 *   }
 *
 *   /**
 *    * Capture hashes of all relevant files (for integrity checking)
 *    * /
 *   private async captureFileHashes(): Promise<Record<string, string>> {
 *     const snapshot: Record<string, string> = {};
 *
 *     // Collect files from all preceding WRITE steps
 *     if (!this.plan) return snapshot;
 *
 *     for (const step of this.plan.steps) {
 *       if (step.action === 'write' && step.path) {
 *         try {
 *           const content = await this.fs.readFile(step.path);
 *           snapshot[step.path] = hashFile(content);
 *         } catch (err) {
 *           // File doesn't exist yet - record empty hash
 *           snapshot[step.path] = '[NOT_FOUND]';
 *         }
 *       }
 *     }
 *
 *     return snapshot;
 *   }
 * }
 * ```
 */

/**
 * Event emissions to add to executePlan()
 *
 * When a RUN step encounters a prompt:
 *
 * ```typescript
 * // In executePlan() main loop
 * const result = await executeStep(step);
 *
 * if (result.requiresUserInput) {
 *   // Suspend execution
 *   this.executorState = PlanState.SUSPENDED_FOR_PERMISSION;
 *   this.suspendedState = {
 *     stepIndex: i,
 *     step,
 *     planId: plan.id,
 *     timestamp: Date.now(),
 *     remainingSteps: plan.steps.slice(i + 1),
 *     context: {
 *       lastStdout: result.output || '',
 *       lastStderr: '',
 *       fileSnapshot: await this.captureFileHashes(),
 *       completedSteps: results,
 *     },
 *     promptText: result.promptText,
 *     metadata: {
 *       userMessage: `Waiting for user input: ${result.promptText}`,
 *       suggestedInputs: result.suggestedInputs,
 *     }
 *   };
 *
 *   // Persist to codebaseIndex
 *   if (this.codebaseIndex) {
 *     this.codebaseIndex.setPlanSuspension(plan.id, this.suspendedState);
 *   }
 *
 *   // Notify UI
 *   this.config.onStreamSuspended?.(this.suspendedState);
 *
 *   // Return to UI - user will call resume() when ready
 *   return {
 *     success: false,
 *     completedSteps: i,
 *     results,
 *     error: 'Plan suspended waiting for user input'
 *   };
 * }
 * ```
 */

/**
 * Integration with AsyncCommandRunner
 *
 * When executing a RUN step:
 *
 * ```typescript
 * private async executeRun(step: ExecutionStep): Promise<StepResult> {
 *   const timeout = this.config.timeout || 30000;
 *
 *   // Use spawn() for interactive commands
 *   const handle = this.commandRunner.spawn(step.command!, {
 *     cwd: path.join(this.config.workspace.fsPath),
 *     timeout,
 *     shell: true
 *   });
 *
 *   this.currentProcess = handle;
 *   let stdout = '';
 *   let stderr = '';
 *   let promptDetected = false;
 *
 *   // Collect output and detect prompts
 *   handle.onData(data => {
 *     stdout += data;
 *     this.config.onStreamData?.(step.stepId, data, false);
 *
 *     // Check if this looks like a prompt
 *     if (!promptDetected && looksLikePrompt(data)) {
 *       promptDetected = true;
 *       handle.onPrompt(promptText => {
 *         // This will trigger suspend on next iteration
 *       });
 *     }
 *   });
 *
 *   handle.onError(err => {
 *     stderr += err.message;
 *     this.config.onStreamData?.(step.stepId, err.message, true);
 *   });
 *
 *   // Wait for process to complete
 *   return new Promise((resolve) => {
 *     handle.onExit(code => {
 *       this.currentProcess = null;
 *
 *       resolve({
 *         stepId: step.stepId,
 *         success: code === 0,
 *         output: stdout,
 *         error: code !== 0 ? stderr : undefined,
 *         duration: Date.now() - stepStartTime,
 *         requiresUserInput: promptDetected,
 *         promptText: detectPrompt(stdout),
 *         suggestedInputs: getSuggestedInputs(stdout)
 *       });
 *     });
 *   });
 * }
 * ```
 */
