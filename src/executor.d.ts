import * as vscode from 'vscode';
import { LLMClient } from './llmClient';
import { GitClient } from './gitClient';
import { TaskPlan, StepResult } from './planner';
/**
 * Executor module for Phase 2: Agent Loop Foundation
 * Executes plans step-by-step with state management and error handling
 */
export interface ExecutorConfig {
    extension: vscode.ExtensionContext;
    llmClient: LLMClient;
    gitClient?: GitClient;
    workspace: vscode.Uri;
    maxRetries?: number;
    timeout?: number;
    onProgress?: (step: number, total: number, description: string) => void;
    onMessage?: (message: string, type: 'info' | 'error') => void;
    onStepOutput?: (stepId: number, output: string, isStart: boolean) => void;
    onQuestion?: (question: string, options: string[]) => Promise<string | undefined>;
}
export interface ExecutionResult {
    success: boolean;
    completedSteps: number;
    results: Map<number, StepResult>;
    error?: string;
    totalDuration: number;
}
/**
 * Executor: Runs plans step-by-step with retry logic and error handling
 */
export declare class Executor {
    private config;
    private plan;
    private paused;
    private cancelled;
    constructor(config: ExecutorConfig);
    /**
     * Execute a complete plan step-by-step
     */
    executePlan(plan: TaskPlan): Promise<ExecutionResult>;
    /**
     * Suggest fixes for common errors (Priority 1.4: Smart Error Fixes)
     * Provides helpful hints based on error type and context
     */
    private suggestErrorFix;
    /**
     * Auto-correct common errors (Priority 2.1: Auto-Correction)
     * Automatically attempts to fix failures without manual intervention
     * Returns null if no auto-fix is possible, or a fixed StepResult if successful
     */
    private attemptAutoFix;
    /**
     * Ask clarification question during execution (Priority 2.2: Follow-up Questions)
     * Detects ambiguous situations and asks user for guidance
     * Returns clarified step or null if user cancels
     */
    private askClarification;
    /**
     * Execute a single step
     */
    executeStep(plan: TaskPlan, stepId: number): Promise<StepResult>;
    /**
     * Execute /read step: Read file from workspace
     * Handles both individual files and directory structures (including globs like examples/**)
     */
    private executeRead;
    /**
     * Helper: Read directory structure recursively
     */
    private executeReadDirectory;
    /**
     * Recursively read directory structure
     */
    private readDirRecursive;
    /**
     * Execute /write step: Generate content and write to file
     * Streams generated content back to callback
     */
    private executeWrite;
    /**
     * Execute /run step: Run shell command
     */
    private executeRun;
    /**
     * Pause execution (can be resumed)
     */
    pauseExecution(): void;
    /**
     * Cancel execution
     */
    cancelExecution(rollback?: boolean): Promise<void>;
    /**
     * Get execution status
     */
    getStatus(): {
        paused: boolean;
        cancelled: boolean;
        currentPlan: TaskPlan | null;
    };
}
//# sourceMappingURL=executor.d.ts.map