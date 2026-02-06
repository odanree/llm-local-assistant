import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
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
  onQuestion?: (question: string, options: string[]) => Promise<string | undefined>;  // Ask clarification question (Priority 2.2)
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

      // Execute step with retry logic and auto-correction (Priority 2.1)
      let retries = 0;
      let result: StepResult | null = null;
      let autoFixAttempted = false;
      const maxRetries = this.config.maxRetries || 2;

      while (retries <= maxRetries) {
        result = await this.executeStep(plan, step.stepId);

        if (result.success) {break;}

        // Try auto-correction on first failure (Priority 2.1: Auto-Correction)
        if (!autoFixAttempted && result.error) {
          this.config.onMessage?.(`Attempting automatic fix for step ${step.stepId}...`, 'info');
          const fixedResult = await this.attemptAutoFix(step, result.error, Date.now());
          if (fixedResult && fixedResult.success) {
            result = fixedResult;
            autoFixAttempted = true;
            break; // Auto-fix succeeded, move to next step
          }
          autoFixAttempted = true; // Mark that we tried, don't try again
        }

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
  /**
   * Validate generated TypeScript/JavaScript code
   * Checks for:
   * 1. TypeScript compilation errors (tsc --noEmit)
   * 2. Architecture rule violations (pattern matching)
   * 3. Missing imports or typos
   *
   * Returns validation result with errors found
   */
  private async validateGeneratedCode(
    filePath: string,
    content: string,
    step: PlanStep
  ): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];

    // Check 1: Type validation (if TypeScript)
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      const typeErrors = this.validateTypes(content, filePath);
      if (typeErrors.length > 0) {
        errors.push(...typeErrors);
      }
    }

    // Check 2: Architecture rule violations
    const ruleErrors = await this.validateArchitectureRules(content);
    if (ruleErrors.length > 0) {
      errors.push(...ruleErrors);
    }

    // Check 3: Common patterns (imports, syntax)
    const patternErrors = this.validateCommonPatterns(content, filePath);
    if (patternErrors.length > 0) {
      errors.push(...patternErrors);
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Validate TypeScript types (simple check, not full compilation)
   */
  private validateTypes(content: string, filePath: string): string[] {
    const errors: string[] = [];

    // Check for common type issues
    // Pattern: missing return type on exported function
    if (content.includes('export') && filePath.endsWith('.ts')) {
      if (content.includes('export function') && !content.includes(': ')) {
        errors.push(
          `⚠️ Missing return type annotation on exported function. ` +
          `Add type annotation: export function name(): ReturnType { ... }`
        );
      }
    }

    // Pattern: any type usage (forbidden in strict projects)
    if (content.includes(': any') || content.includes('as any')) {
      errors.push(
        `❌ Found 'any' type. Use specific types or 'unknown' with type guards instead. ` +
        `Example: function process(data: unknown) { if (typeof data === 'string') { ... } }`
      );
    }

    return errors;
  }

  /**
   * Check generated code against architecture rules
   */
  private async validateArchitectureRules(content: string): Promise<string[]> {
    const errors: string[] = [];

    // Get architecture rules if available
    const rules = this.config.llmClient && (this.config.llmClient as any).config?.architectureRules;
    if (!rules) {
      return errors; // No rules to validate against
    }

    // Check Rule: No direct fetch calls (should use TanStack Query or API hooks)
    if (rules.includes('TanStack Query') && content.includes('fetch(')) {
      errors.push(
        `❌ Rule violation: Using direct fetch() instead of TanStack Query. ` +
        `Use: const { data } = useQuery(...) or useMutation(...)`
      );
    }

    // Check Rule: No Redux (should use Zustand)
    if (rules.includes('Zustand') && content.includes('useSelector')) {
      errors.push(
        `❌ Rule violation: Using Redux (useSelector) instead of Zustand. ` +
        `Use: const store = useStore() from your Zustand store`
      );
    }

    // Check Rule: No class components
    if (rules.includes('functional components') && content.includes('extends React.Component')) {
      errors.push(
        `❌ Rule violation: Using class component instead of functional component. ` +
        `Convert to: export function ComponentName() { ... }`
      );
    }

    // Check Rule: Validation with Zod
    if (rules.includes('Zod') && content.includes('type ') && !content.includes('z.')) {
      errors.push(
        `⚠️ Rule suggestion: Define validation schemas with Zod instead of just TypeScript types. ` +
        `Example: const userSchema = z.object({ name: z.string(), email: z.string().email() })`
      );
    }

    return errors;
  }

  /**
   * Validate common code patterns and syntax issues
   */
  private validateCommonPatterns(content: string, filePath: string): string[] {
    const errors: string[] = [];

    // Check: Missing imports
    const importedItems = new Set<string>();
    content.replace(/import\s+{([^}]+)}/g, (_, items) => {
      items.split(',').forEach((item: string) => {
        importedItems.add(item.trim());
      });
      return '';
    });

    // Pattern: React/useState without import
    if ((content.includes('useState') || content.includes('useEffect')) && !importedItems.has('useState')) {
      if (!content.includes("import { useState")) {
        errors.push(
          `❌ Missing import: useState is used but not imported. ` +
          `Add: import { useState } from 'react'`
        );
      }
    }

    // Pattern: Missing closing tags/braces
    const openBraces = (content.match(/{/g) || []).length;
    const closeBraces = (content.match(/}/g) || []).length;
    if (openBraces > closeBraces) {
      errors.push(`❌ Syntax error: ${openBraces - closeBraces} unclosed brace(s)`);
    }

    // Pattern: JSX without React import
    if ((filePath.endsWith('.jsx') || filePath.endsWith('.tsx')) && content.includes('<')) {
      if (!importedItems.has('React') && !content.includes("import React")) {
        // In newer React versions, this is optional, so just warn
        errors.push(
          `⚠️ Possible issue: JSX detected but no React import. ` +
          `Modern React (17+) doesn't require this, but check your tsconfig.json`
        );
      }
    }

    return errors;
  }

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
   * Auto-correct common errors (Priority 2.1: Auto-Correction)
   * Automatically attempts to fix failures without manual intervention
   * Returns null if no auto-fix is possible, or a fixed StepResult if successful
   */
  private async attemptAutoFix(step: PlanStep, error: string, startTime: number): Promise<StepResult | null> {
    // Pattern 1: File not found on read → Try reading parent directory (walk up until exists)
    if (step.action === 'read' && error.includes('ENOENT') && step.path) {
      let currentPath = step.path;
      // Walk up the directory tree until we find an existing parent
      while (currentPath.includes('/')) {
        currentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
        if (currentPath && currentPath !== step.path) {
          this.config.onMessage?.(`Auto-fix: Reading parent directory '${currentPath}' instead...`, 'info');
          const fixedStep: PlanStep = { ...step, path: currentPath };
          try {
            return await this.executeRead(fixedStep, startTime);
          } catch (err) {
            // This parent also doesn't exist, try the next one up
            const errMsg = err instanceof Error ? err.message : String(err);
            if (errMsg.includes('ENOENT')) {
              continue; // Try next parent up
            }
            return null; // Different error, don't auto-fix
          }
        }
      }
    }

    // Pattern 2: Directory doesn't exist for write → Create parent directories first
    if (step.action === 'write' && step.path) {
      const filePath = vscode.Uri.joinPath(this.config.workspace, step.path);
      const parentDir = filePath.fsPath.substring(0, filePath.fsPath.lastIndexOf('/'));
      
      try {
        // Check if parent directory exists
        await vscode.workspace.fs.stat(vscode.Uri.file(parentDir));
      } catch {
        // Parent doesn't exist, create it
        this.config.onMessage?.(`Auto-fix: Creating parent directories for '${step.path}'...`, 'info');
        try {
          await vscode.workspace.fs.createDirectory(vscode.Uri.file(parentDir));
          // Retry the write with parent directory created
          return await this.executeWrite(step, startTime);
        } catch {
          return null; // Auto-fix didn't work
        }
      }
    }

    // Pattern 3: Directory read when file expected → List files in directory instead
    if (step.action === 'read' && error.includes('EISDIR') && step.path) {
      this.config.onMessage?.(`Auto-fix: Reading directory structure instead of treating as file...`, 'info');
      const fixedStep: PlanStep = { ...step };
      try {
        return await this.executeReadDirectory(fixedStep, startTime);
      } catch {
        return null; // Auto-fix didn't work
      }
    }

    // Pattern 4: Command not found → Try with full path or common alternatives
    if (step.action === 'run' && error.includes('not found') && step.command) {
      // Try common alternatives (e.g., 'npm' → 'npx npm', 'python' → 'python3')
      const alternatives: { [key: string]: string[] } = {
        'npm': ['npx npm', 'yarn'],
        'tsc': ['npx tsc'],
        'jest': ['npx jest'],
        'eslint': ['npx eslint'],
        'python': ['python3', 'py'],
        'node': ['node.exe'],
        'npm test': ['npm run test', 'yarn test'],
      };

      const cmdBase = step.command.split(' ')[0];
      const alts = alternatives[cmdBase] || [];

      for (const alt of alts) {
        this.config.onMessage?.(`Auto-fix: Trying alternative command '${alt}'...`, 'info');
        const fixedCommand = step.command.replace(cmdBase, alt);
        const fixedStep: PlanStep = { ...step, command: fixedCommand };
        try {
          return await this.executeRun(fixedStep, startTime);
        } catch {
          // Try next alternative
          continue;
        }
      }
    }

    return null; // No auto-fix available
  }

  /**
   * Ask clarification question during execution (Priority 2.2: Follow-up Questions)
   * Detects ambiguous situations and asks user for guidance
   * Returns clarified step or null if user cancels
   */
  private async askClarification(step: PlanStep, error: string): Promise<PlanStep | null> {
    const action = step.action;
    console.log(`[Executor] askClarification called for action: ${action}, command: ${(step as any).command}`);

    // Pattern 1: Ambiguous write destination
    if (action === 'write' && step.path && step.path.includes('/')) {
      const parentDir = step.path.substring(0, step.path.lastIndexOf('/'));
      try {
        const dirUri = vscode.Uri.joinPath(this.config.workspace, parentDir);
        const entries = await vscode.workspace.fs.readDirectory(dirUri);
        
        // If directory has many potential files, ask which one to update
        if (entries.length > 5) {
          const files = entries
            .filter(([_, type]) => type === vscode.FileType.File)
            .map(([name]) => name)
            .slice(0, 5);

          if (files.length > 0) {
            const answer = await this.config.onQuestion?.(
              `Multiple files exist in ${parentDir}. Which should I modify?\n\nCurrent target: ${step.path}`,
              [step.path, ...files, 'Skip this step']
            );

            if (answer && answer !== 'Skip this step') {
              return { ...step, path: answer };
            } else if (answer === 'Skip this step') {
              return null; // User chose to skip
            }
          }
        }
      } catch {
        // Directory doesn't exist or can't be read, continue with original path
      }
    }

    // Pattern 2: Run command ambiguity - ask for confirmation on various command types
    if (action === 'run' && step.command) {
      const command = step.command.toLowerCase();
      
      // Patterns that warrant user confirmation (potentially long-running or risky)
      const confirmationPatterns = [
        // Package managers & testing
        /npm\s+(test|run|install|build)/,
        /yarn\s+(test|run|install|build)/,
        /pnpm\s+(test|run|install|build)/,
        /bun\s+(test|run|install|build)/,
        
        // Testing frameworks
        /jest|mocha|vitest|pytest|pytest-|cargo\s+test|go\s+test|mix\s+test/,
        
        // Build tools
        /webpack|rollup|vite|tsc|typescript|babel/,
        /gradle|maven|make|cmake/,
        
        // Database/backend operations
        /migrate|seed|dump|restore|backup/,
        /docker\s+(build|run|compose)|docker-compose/,
        
        // Deployment & git operations (risky)
        /deploy|push|merge|rebase|reset|force/,
        /git\s+(push|merge|rebase|reset|force)/,
        
        // Long-running operations
        /npm\s+start|yarn\s+start|pnpm\s+start|bun\s+start/,
        /server|dev|watch|watch-mode/,
      ];
      
      const shouldAsk = confirmationPatterns.some(pattern => pattern.test(command));
      
      if (shouldAsk) {
        console.log(`[Executor] Detected command needing confirmation: ${step.command}`);
        console.log(`[Executor] onQuestion callback exists: ${!!this.config.onQuestion}`);
        
        const answer = await this.config.onQuestion?.(
          `About to run: \`${step.command}\`\n\nThis might take a while. Should I proceed?`,
          ['Yes, proceed', 'No, skip this step', 'Cancel execution']
        );
        console.log(`[Executor] User answered: ${answer}`);

        if (answer === 'No, skip this step') {
          return null;
        } else if (answer === 'Cancel execution') {
          throw new Error('User cancelled execution');
        }
        // If 'Yes, proceed' or no answer, return step to continue execution
        return step;
      }
    }

    return step; // Return step to continue with normal execution
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

    console.log(`[Executor] Starting step ${stepId}: action=${step.action}, description=${step.description}`);

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
          // Ask clarification before running potentially long commands
          console.log(`[Executor] About to ask clarification for run command: ${(step as any).command}`);
          const clarifiedStep = await this.askClarification(step, '');
          console.log(`[Executor] askClarification returned: ${clarifiedStep ? 'step' : 'null'}`);
          if (clarifiedStep === null) {
            // User skipped this step
            return {
              stepId: step.stepId,
              success: true,
              output: `Skipped: ${step.description}`,
              duration: Date.now() - startTime,
            };
          }
          result = await this.executeRun(clarifiedStep || step, startTime);
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
    if (depth > maxDepth) {
      return '';
    }

    try {
      const entries = await vscode.workspace.fs.readDirectory(uri);
      const lines: string[] = [];
      const indent = '  '.repeat(depth);

      for (const [name, type] of entries) {
        if (name.startsWith('.')) {
          continue; // Skip hidden files
        }
        
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
   * Detect if a write operation should trigger a user question
   * Returns true for risky operations like config files, large files, or critical data files
   */
  private shouldAskForWrite(filePath: string): boolean {
    const fileName = filePath.split('/').pop() || '';
    
    // Files that warrant confirmation
    const riskPatterns = [
      // Core config files
      /package\.json$/,
      /package-lock\.json$/,
      /yarn\.lock$/,
      /pnpm-lock\.yaml$/,
      /tsconfig\.json$/,
      /jsconfig\.json$/,
      
      // Build configs
      /webpack\.config/,
      /vite\.config/,
      /rollup\.config/,
      /next\.config/,
      /nuxt\.config/,
      /gatsby\.config/,
      
      // Linter/Formatter configs
      /\.eslintrc/,
      /\.prettierrc/,
      /\.stylelintrc/,
      /\.editorconfig/,
      
      // CI/CD configs
      /\.github\/workflows\//,
      /\.gitlab-ci\.yml/,
      /\.travis\.yml/,
      /Jenkinsfile/,
      
      // Environment and secrets
      /\.env/,
      /\.secrets/,
      /credentials/,
      
      // Critical data files
      /database\.json/,
      /config\.json/,
      /settings\.json/,
      /\.gitignore$/,
      /\.dockerignore$/,
      /Dockerfile$/,
      /docker-compose\.ya?ml$/,
      
      // Root-level files that are typically important
      /^README\.md$/,
      /^LICENSE$/,
      /^Makefile$/,
    ];
    
    // Check if file matches any risk pattern
    const isRisky = riskPatterns.some(pattern => pattern.test(fileName));
    
    return isRisky;
  }

  /**
   * Execute /write step: Generate content and write to file
   * Streams generated content back to callback
   */
  private async executeWrite(step: PlanStep, startTime: number): Promise<StepResult> {
    if (!step.path) {
      throw new Error('Write step requires path');
    }

    // Check if this is a risky write operation that warrants confirmation
    if (this.shouldAskForWrite(step.path)) {
      console.log(`[Executor] Detected risky write to: ${step.path}`);
      console.log(`[Executor] onQuestion callback exists: ${!!this.config.onQuestion}`);
      
      const answer = await this.config.onQuestion?.(
        `About to write to important file: \`${step.path}\`\n\nThis is a critical configuration or data file. Should I proceed with writing?`,
        ['Yes, write the file', 'No, skip this step', 'Cancel execution']
      );
      console.log(`[Executor] User answered for write: ${answer}`);

      if (answer === 'No, skip this step') {
        return {
          stepId: step.stepId,
          success: true,
          output: `Skipped: ${step.description}`,
          duration: Date.now() - startTime,
        };
      } else if (answer === 'Cancel execution') {
        throw new Error('User cancelled execution');
      }
      // If 'Yes, write the file' or no answer, continue with write
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

      // Validate generated code if it's a TypeScript/JavaScript file
      if (['ts', 'tsx', 'js', 'jsx'].includes(fileExtension || '')) {
        const validationResult = await this.validateGeneratedCode(step.path, content, step);
        if (!validationResult.valid && validationResult.errors) {
          // Attempt auto-correction via LLM
          this.config.onMessage?.(
            `⚠️ Validation issues found in ${step.path}:\n${validationResult.errors.join('\n')}`,
            'info'
          );
          
          const fixPrompt = `The code you generated has validation errors:\n\n${validationResult.errors.join('\n')}\n\nPlease fix these errors and provide the corrected code for ${step.path}.`;
          const fixResponse = await this.config.llmClient.sendMessage(fixPrompt);
          
          if (fixResponse.success) {
            // Extract corrected content
            let correctedContent = fixResponse.message || '';
            const codeBlockMatch = correctedContent.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/);
            if (codeBlockMatch) {
              correctedContent = codeBlockMatch[1];
            }
            
            // Re-validate
            const secondValidation = await this.validateGeneratedCode(step.path, correctedContent, step);
            if (secondValidation.valid) {
              this.config.onMessage?.('✓ Auto-fix successful! Code now passes validation.', 'info');
              // Write the corrected content
              const correctedBytes = new Uint8Array(correctedContent.length);
              for (let i = 0; i < correctedContent.length; i++) {
                correctedBytes[i] = correctedContent.charCodeAt(i);
              }
              await vscode.workspace.fs.writeFile(filePath, correctedBytes);
            } else {
              this.config.onMessage?.(
                `⚠️ Auto-fix didn't fully resolve issues. Please review manually.`,
                'error'
              );
            }
          }
        }
      }

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

    const command = step.command; // TypeScript type narrowing

    return new Promise<StepResult>((resolve) => {
      // Build environment with full PATH, explicitly including homebrew paths
      const env: { [key: string]: string } = {};
      for (const key in process.env) {
        const value = process.env[key];
        if (value !== undefined) {
          env[key] = value;
        }
      }
      
      // Ensure PATH includes homebrew and common locations
      // macOS homebrew is typically at /opt/homebrew/bin
      const pathParts = [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/usr/bin',
        '/bin',
        '/usr/sbin',
        '/sbin',
        env.PATH || '',
      ].filter(p => p); // Remove empty strings
      
      env.PATH = pathParts.join(':');

      // Use login shell (-l) to source shell configuration
      const child = cp.spawn('/bin/bash', ['-l', '-c', command], {
        cwd: this.config.workspace.fsPath,
        env: env,
        stdio: 'pipe',
      });

      let stdout = '';
      let stderr = '';

      if (child.stdout) {
        child.stdout.on('data', (data: any) => {
          stdout += data.toString();
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (data: any) => {
          stderr += data.toString();
        });
      }

      const timeout = setTimeout(() => {
        (child as any).kill();
        resolve({
          stepId: step.stepId,
          success: false,
          error: `Command timed out after ${this.config.timeout}ms`,
          duration: Date.now() - startTime,
        });
      }, this.config.timeout);

      child.on('close', (code: any) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve({
            stepId: step.stepId,
            success: true,
            output: stdout || '(no output)',
            duration: Date.now() - startTime,
          });
        } else {
          const errorMsg = stderr || stdout || `Command failed with exit code ${code}`;
          const suggestion = this.suggestErrorFix('run', command, errorMsg);
          resolve({
            stepId: step.stepId,
            success: false,
            error: `${errorMsg}${suggestion ? `\n💡 Suggestion: ${suggestion}` : ''}`,
            duration: Date.now() - startTime,
          });
        }
      });

      child.on('error', (error: any) => {
        clearTimeout(timeout);
        const errorMsg = error.message;
        const suggestion = this.suggestErrorFix('run', command, errorMsg);
        resolve({
          stepId: step.stepId,
          success: false,
          error: `${errorMsg}${suggestion ? `\n💡 Suggestion: ${suggestion}` : ''}`,
          duration: Date.now() - startTime,
        });
      });
    });
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
