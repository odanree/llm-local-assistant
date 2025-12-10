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
  onStepOutput?: (stepId: number, output: string, isStart: boolean) => void;  // Stream step output
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
    // This clears the LLM's internal context, NOT the chat UI history
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

        if (result.success) {break;}

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
   * Suggest fixes for common errors (Priority 1.4: Smart Error Fixes)
   * Provides helpful hints based on error type and context
   */
  private suggestErrorFix(action: string, path: string, error: string): string | null {
    if (action === 'read' && error.includes('ENOENT')) {
      // File not found - suggest creating it or checking path
      const filename = path.split('/').pop();
      return `File '${filename}' doesn't exist. Create it with /write or check the path is correct.`;
    }
    if (action === 'write' && error.includes('EACCES')) {
      // Permission denied
      return `No write permission. Check file permissions or try a different location.`;
    }
    if (action === 'run' && error.includes('not found')) {
      // Command not found
      const cmd = error.split("'")[1];
      return `Command '${cmd}' not found. Make sure it's installed and in your PATH.`;
    }
    if (action === 'read' && error.includes('EISDIR')) {
      // Tried to read a directory
      return `'${path}' is a directory, not a file. Specify a file inside the directory instead.`;
    }
    return null;
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

    // Emit step start
    this.config.onStepOutput?.(stepId, `⟳ ${step.description}...`, true);

    try {
      let result: StepResult;
      
      switch (step.action) {
        case 'read':
          result = await this.executeRead(step, startTime);
          break;
        case 'write':
          result = await this.executeWrite(step, startTime);
          break;
        case 'suggestwrite':
          result = await this.executeSuggestWrite(step, startTime);
          break;
        case 'run':
          result = await this.executeRun(step, startTime);
          break;
        default:
          throw new Error(`Unknown action: ${step.action}`);
      }

      // Emit step completion
      if (result.success) {
        const output = result.output || `✓ ${step.description} completed`;
        this.config.onStepOutput?.(stepId, output, false);
      }

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.config.onStepOutput?.(stepId, `✗ Error: ${errorMsg}`, false);
      return {
        stepId,
        success: false,
        error: errorMsg,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute /read step: Read file from workspace
   * Handles both individual files and directory structures (including globs like examples/**)
   */
  private async executeRead(step: PlanStep, startTime: number): Promise<StepResult> {
    if (!step.path) {
      throw new Error('Read step requires path');
    }

    const filePath = vscode.Uri.joinPath(this.config.workspace, step.path);
    try {
      // Check if path contains glob pattern
      if (step.path.includes('**') || step.path.includes('*')) {
        // Handle glob/directory pattern
        return await this.executeReadDirectory(step, startTime);
      }

      // First, check if path is a directory
      try {
        const stat = await vscode.workspace.fs.stat(filePath);
        if (stat.type === vscode.FileType.Directory) {
          // It's a directory, read its structure
          return await this.executeReadDirectory(step, startTime);
        }
      } catch (e) {
        // stat failed, continue with file read attempt
      }

      // Try to read as file
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
      const errorMsg = error instanceof Error ? error.message : String(error);
      const suggestion = this.suggestErrorFix('read', step.path, errorMsg);
      throw new Error(
        `Failed to read ${step.path}: ${errorMsg}${suggestion ? `\n💡 Suggestion: ${suggestion}` : ''}`
      );
    }
  }

  /**
   * Helper: Read directory structure recursively
   */
  private async executeReadDirectory(step: PlanStep, startTime: number): Promise<StepResult> {
    if (!step.path) {
      throw new Error('Read step requires path');
    }

    const basePath = step.path.replace(/\/\*\*$/, '').replace(/\/\*$/, '');
    const baseUri = vscode.Uri.joinPath(this.config.workspace, basePath);

    try {
      const structure = await this.readDirRecursive(baseUri, basePath);
      
      return {
        stepId: step.stepId,
        success: true,
        output: `Read directory structure from ${step.path}:\n${structure}`,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read directory ${step.path}: ${errorMsg}`);
    }
  }

  /**
   * Recursively read directory structure
   */
  private async readDirRecursive(uri: vscode.Uri, relativePath: string, depth: number = 0, maxDepth: number = 4): Promise<string> {
    if (depth > maxDepth) return '';

    try {
      const entries = await vscode.workspace.fs.readDirectory(uri);
      const lines: string[] = [];
      const indent = '  '.repeat(depth);

      for (const [name, type] of entries) {
        if (name.startsWith('.')) continue; // Skip hidden files
        
        const isDir = type === vscode.FileType.Directory;
        const icon = isDir ? '📁' : '📄';
        lines.push(`${indent}${icon} ${name}${isDir ? '/' : ''}`);

        // Recursively read subdirectories
        if (isDir && depth < maxDepth) {
          const subUri = vscode.Uri.joinPath(uri, name);
          const subStructure = await this.readDirRecursive(subUri, `${relativePath}/${name}`, depth + 1, maxDepth);
          if (subStructure) {
            lines.push(subStructure);
          }
        }
      }

      return lines.join('\n');
    } catch (error) {
      return '';
    }
  }

  /**
   * Execute /write step: Generate content and write to file
   * Streams generated content back to callback
   */
  private async executeWrite(step: PlanStep, startTime: number): Promise<StepResult> {
    if (!step.path) {
      throw new Error('Write step requires path');
    }

    // Build a detailed prompt that asks for code-only output
    let prompt = step.prompt || `Generate appropriate content for ${step.path} based on its name.`;
    
    // Add instruction to output ONLY code, no explanations
    // Detect file type from extension
    const fileExtension = step.path.split('.').pop()?.toLowerCase();
    const isCodeFile = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'json', 'yml', 'yaml', 'html', 'css', 'sh'].includes(fileExtension || '');
    
    if (isCodeFile) {
      prompt = `${prompt}

IMPORTANT: Output ONLY the code content for ${step.path}. NO explanations, NO comments, NO text outside the code. Start immediately with the code.`;
    }

    // Emit that we're generating content
    this.config.onStepOutput?.(step.stepId, `📝 Generating ${step.path}...`, false);

    const response = await this.config.llmClient.sendMessage(prompt);
    if (!response.success) {
      throw new Error(response.error || 'LLM request failed');
    }

    const filePath = vscode.Uri.joinPath(this.config.workspace, step.path);
    
    try {
      // Extract content and clean up if it's code
      let content = response.message || '';
      
      // If response contains markdown code blocks, extract the code
      const codeBlockMatch = content.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        content = codeBlockMatch[1];
      } else if (isCodeFile) {
        // For code files, try to extract just the code portion
        // Remove common explanation patterns
        content = content
          .replace(/^[\s\S]*?(?=^[/\*{<]|^[\w\-])/m, '') // Remove text before code starts
          .replace(/\n\n[\s\S]*$/, '') // Remove trailing explanation
          .trim();
      }
      
      // Stream the generated content to callback
      if (this.config.onStepOutput && content.length > 0) {
        // Show first 200 chars as preview, or full content if shorter
        const preview = content.length > 200 
          ? `\`\`\`${fileExtension || ''}\n${content.substring(0, 200)}...\n\`\`\``
          : `\`\`\`${fileExtension || ''}\n${content}\n\`\`\``;
        this.config.onStepOutput(step.stepId, preview, false);
      }
      
      // Encode string to bytes
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
      const errorMsg = error instanceof Error ? error.message : String(error);
      const suggestion = this.suggestErrorFix('write', step.path, errorMsg);
      throw new Error(
        `Failed to write ${step.path}: ${errorMsg}${suggestion ? `\n💡 Suggestion: ${suggestion}` : ''}`
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
      const errorMsg = error.stderr || error.message;
      const suggestion = this.suggestErrorFix('run', step.command, errorMsg);
      return {
        stepId: step.stepId,
        success: false,
        error: `${errorMsg}${suggestion ? `\n💡 Suggestion: ${suggestion}` : ''}`,
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
