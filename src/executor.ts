import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as util from 'util';
import { LLMClient } from './llmClient';
import { GitClient } from './gitClient';
import { TaskPlan, PlanStep, StepResult } from './planner';

/**
 * Executor module for Phase 2: Agent Loop Foundation
 * Executes plans step-by-step with state management and error handling
 */

export interface ExecutorConfig {
  extension: vscode.ExtensionContext;
  llmClient: LLMClient;
  gitClient?: GitClient;
  workspace: vscode.Uri;
  maxRetries?: number;      // Default: 2
  timeout?: number;         // Default: 30000ms
  onProgress?: (step: number, total: number, description: string) => void;
  onMessage?: (message: string, type: 'info' | 'error') => void;
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
export class Executor {
  private config: ExecutorConfig;
  private plan: TaskPlan | null = null;
  private paused: boolean = false;
  private cancelled: boolean = false;

  constructor(config: ExecutorConfig) {
    this.config = {
      maxRetries: 2,
      timeout: 30000,
      ...config,
    };
  }

  /**
   * Execute a complete plan step-by-step
   */
  async executePlan(plan: TaskPlan): Promise<ExecutionResult> {
    this.plan = plan;
    this.paused = false;
    this.cancelled = false;
    plan.status = 'executing';

    // Clear LLM conversation history to avoid context pollution from planning phase
    this.config.llmClient.clearHistory();

    const startTime = Date.now();

    for (const step of plan.steps) {
      // Check for pause/cancel
      while (this.paused && !this.cancelled) {
        await new Promise(r => setTimeout(r, 100));
      }

      if (this.cancelled) {
        plan.status = 'failed';
        return {
          success: false,
          completedSteps: plan.currentStep,
          results: plan.results,
          error: 'Execution cancelled by user',
          totalDuration: Date.now() - startTime,
        };
      }

      // Execute step with retry logic
      let retries = 0;
      let result: StepResult | null = null;
      const maxRetries = this.config.maxRetries || 2;

      while (retries <= maxRetries) {
        result = await this.executeStep(plan, step.stepId);

        if (result.success) break;

        retries++;
        if (retries <= maxRetries) {
          const msg = `Step ${step.stepId} failed. Retrying (${retries}/${maxRetries})...`;
          this.config.onMessage?.(msg, 'info');
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      plan.results.set(step.stepId, result!);

      if (!result!.success) {
        plan.status = 'failed';
        plan.currentStep = step.stepId;
        return {
          success: false,
          completedSteps: plan.currentStep,
          results: plan.results,
          error: `Step ${step.stepId} failed: ${result!.error}`,
          totalDuration: Date.now() - startTime,
        };
      }

      plan.currentStep = step.stepId;
      this.config.onProgress?.(
        plan.currentStep,
        plan.steps.length,
        step.description
      );
    }

    plan.status = 'completed';
    return {
      success: true,
      completedSteps: plan.steps.length,
      results: plan.results,
      totalDuration: Date.now() - startTime,
    };
  }

  /**
   * Execute a single step
   */
  async executeStep(plan: TaskPlan, stepId: number): Promise<StepResult> {
    const step = plan.steps.find(s => s.stepId === stepId);
    if (!step) {
      return {
        stepId,
        success: false,
        error: `Step ${stepId} not found in plan`,
        duration: 0,
      };
    }

    const startTime = Date.now();

    try {
      switch (step.action) {
        case 'read':
          return await this.executeRead(step, startTime);
        case 'write':
          return await this.executeWrite(step, startTime);
        case 'suggestwrite':
          return await this.executeSuggestWrite(step, startTime);
        case 'run':
          return await this.executeRun(step, startTime);
        default:
          throw new Error(`Unknown action: ${step.action}`);
      }
    } catch (error) {
      return {
        stepId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute /read step: Read file from workspace
   */
  private async executeRead(step: PlanStep, startTime: number): Promise<StepResult> {
    if (!step.path) {
      throw new Error('Read step requires path');
    }

    const filePath = vscode.Uri.joinPath(this.config.workspace, step.path);
    try {
      const content = await vscode.workspace.fs.readFile(filePath);
      // Decode bytes to string
      let text = '';
      for (let i = 0; i < content.length; i++) {
        text += String.fromCharCode(content[i]);
      }
      return {
        stepId: step.stepId,
        success: true,
        output: `Read ${step.path} (${text.length} bytes)`,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      throw new Error(
        `Failed to read ${step.path}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Execute /write step: Generate content and write to file
   */
  private async executeWrite(step: PlanStep, startTime: number): Promise<StepResult> {
    if (!step.path) {
      throw new Error('Write step requires path');
    }

    const prompt = step.prompt || `Generate appropriate content for ${step.path} based on its name.`;

    const response = await this.config.llmClient.sendMessage(prompt);
    if (!response.success) {
      throw new Error(response.error || 'LLM request failed');
    }

    const filePath = vscode.Uri.joinPath(this.config.workspace, step.path);
    
    try {
      // Encode string to bytes
      const content = response.message || '';
      const bytes = new Uint8Array(content.length);
      for (let i = 0; i < content.length; i++) {
        bytes[i] = content.charCodeAt(i);
      }
      
      await vscode.workspace.fs.writeFile(filePath, bytes);

      return {
        stepId: step.stepId,
        success: true,
        output: `Wrote ${step.path} (${content.length} bytes)`,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      throw new Error(
        `Failed to write ${step.path}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Execute /suggestwrite step: Generate suggestions for user approval
   * Note: This is deferred for Phase 2.1 as it requires user interaction
   */
  private async executeSuggestWrite(step: PlanStep, startTime: number): Promise<StepResult> {
    return {
      stepId: step.stepId,
      success: false,
      error: 'suggestwrite requires user approval - not yet implemented in agent mode (Phase 2.2+)',
      duration: Date.now() - startTime,
    };
  }

  /**
   * Execute /run step: Run shell command
   */
  private async executeRun(step: PlanStep, startTime: number): Promise<StepResult> {
    if (!step.command) {
      throw new Error('Run step requires command');
    }

    // Use promisified child_process.exec for command execution
    const execAsync = util.promisify(cp.exec);

    try {
      const { stdout, stderr } = await execAsync(step.command, {
        cwd: this.config.workspace.fsPath,
        timeout: this.config.timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer for large outputs
      });

      return {
        stepId: step.stepId,
        success: true,
        output: stdout || '(no output)',
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        stepId: step.stepId,
        success: false,
        error: error.stderr || error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Pause execution (can be resumed)
   */
  pauseExecution(): void {
    this.paused = true;
    this.config.onMessage?.('Execution paused', 'info');
  }

  /**
   * Resume paused execution
   */
  resumeExecution(): void {
    this.paused = false;
    this.config.onMessage?.('Execution resumed', 'info');
  }

  /**
   * Cancel execution
   */
  async cancelExecution(rollback?: boolean): Promise<void> {
    this.cancelled = true;
    this.config.onMessage?.('Execution cancelled', 'info');

    // TODO: Phase 2.2+ - Implement rollback via git checkout
    if (rollback && this.plan) {
      this.config.onMessage?.(
        'Rollback not yet implemented (Phase 2.2+)',
        'info'
      );
    }
  }

  /**
   * Get execution status
   */
  getStatus(): {
    paused: boolean;
    cancelled: boolean;
    currentPlan: TaskPlan | null;
  } {
    return {
      paused: this.paused,
      cancelled: this.cancelled,
      currentPlan: this.plan,
    };
  }
}
