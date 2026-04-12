import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import { IFileSystem } from './providers/IFileSystem';
import { ICommandRunner } from './providers/ICommandRunner';
import { FileSystemProvider } from './providers/FileSystemProvider';
import { CommandRunnerProvider } from './providers/CommandRunnerProvider';
import SmartAutoCorrection from './CodeAnalyzer';
import { LLMClient } from './llmClient';
import { GitClient } from './gitClient';
import CodebaseIndex, { EmbeddingClient } from './codebaseIndex';
import { ArchitectureValidator } from './CodeAnalyzer';
import { TaskPlan, PlanStep, StepResult } from './planner';
import { validateExecutionStep } from './types/executor';
import { PlanState } from './types/PlanState';
import { PathSanitizer } from './utils/pathSanitizer';
import { ValidationReport, formatValidationReportForLLM } from './types/validation';
import { GOLDEN_TEMPLATES } from './constants/templates';
import { ProjectProfile } from './projectProfile';
import { safeParse, sanitizeJson } from './utils/jsonSanitizer';
import { matchFormPatterns, findImportAndSyntaxIssuesPure } from './utils/codePatternMatcher';

/**
 * Executor module for Phase 2: Agent Loop Foundation
 * Executes plans step-by-step with state management and error handling
 */

/** Core dependencies the Executor needs to do its job */
export interface ExecutorDependencies {
  extension: vscode.ExtensionContext;
  llmClient: LLMClient;
  workspace: vscode.Uri;
  gitClient?: GitClient;
  codebaseIndex?: CodebaseIndex;
  embeddingClient?: EmbeddingClient;
  projectProfile?: ProjectProfile;
  fs?: IFileSystem;
  commandRunner?: ICommandRunner;
}

/** Event callbacks — all optional; Executor works without any of them */
export interface ExecutorCallbacks {
  onProgress?: (step: number, total: number, description: string) => void;
  onMessage?: (message: string, type: 'info' | 'error') => void;
  onStepOutput?: (stepId: number, output: string, isStart: boolean) => void;
  onQuestion?: (question: string, options: string[], timeoutMs?: number) => Promise<string | undefined>;
}

/** Tuning knobs with sensible defaults */
export interface ExecutorOptions {
  maxRetries?: number;  // Default: 2
  timeout?: number;     // Default: 30000ms
}

/** Full config = all three concerns combined (backwards-compatible) */
export interface ExecutorConfig extends ExecutorDependencies, ExecutorCallbacks, ExecutorOptions {}

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
  private readonly MAX_VALIDATION_ITERATIONS = 3; // Phase 3.1: Prevent infinite validation loops

  // Phase 3A: Dependency Injection for side effects
  private fs: IFileSystem;
  private commandRunner: ICommandRunner;
  private codebaseIndex: CodebaseIndex;

  // v2.12.0 M2: StreamingIO for prompt detection
  private streamingIO: any; // Type: StreamingIO from types/StreamingIO.ts

  constructor(config: ExecutorConfig) {
    this.config = {
      maxRetries: 2,
      timeout: 30000,
      ...config,
    };

    // Phase 3A: Default to production providers if not injected
    // Tests can inject mocks via ExecutorConfig.fs and ExecutorConfig.commandRunner
    this.fs = config.fs || new FileSystemProvider();
    this.commandRunner = config.commandRunner || new CommandRunnerProvider();
    this.codebaseIndex = config.codebaseIndex || new CodebaseIndex();

    // v2.12.0 M2: Initialize StreamingIO for prompt detection
    // This enables the Circuit Breaker pattern for interactive commands
    try {
      const { DEFAULT_PROMPT_PATTERNS, detectPrompt, getSuggestedInputs } = require('./types/StreamingIO');
      this.streamingIO = {
        detectPrompt,
        getSuggestedInputs,
        patterns: DEFAULT_PROMPT_PATTERNS,
      };
    } catch (error) {
      console.warn('[Executor] StreamingIO not available, prompt detection disabled');
      this.streamingIO = null;
    }
  }

  /**
   * Extract contract information from a previously created file
   * Detects what the file exports (stores, components, utilities, etc.)
   * Returns a human-readable description for LLM consumption
   */
  private async extractFileContract(filePath: string, workspace: vscode.Uri): Promise<string> {
    try {
      const fileUri = vscode.Uri.joinPath(workspace, filePath);
      const fileContent = new TextDecoder().decode(await vscode.workspace.fs.readFile(fileUri));

      // ZUSTAND STORES: Detect useXXXStore patterns
      const zustandMatch = fileContent.match(/export\s+const\s+(use\w+Store)\s*=\s*create<(\w+)>\(\(set\)\s*=>\s*\({([^}]*?)}\n\s*\}\)/s);
      if (zustandMatch) {
        const [, hookName, stateType, stateBody] = zustandMatch;
        // Extract state properties from store
        const stateProps = stateBody.match(/(\w+):\s*[^,}]+/g) || [];
        const propList = stateProps.map(p => p.split(':')[0].trim()).join(', ');
        return `📦 **Zustand Store** - \`${filePath}\`
   - Export: \`const ${hookName} = create<${stateType}>()\`
   - Hook name: \`${hookName}\`
   - State object has: ${propList}
   - Usage: \`const { ${propList} } = ${hookName}()\`
   - ⚠️ State is structured - check field nesting. Example: if state is \`{ formState: { email, password } }\`, access as \`state.formState.email\`, NOT \`state.email\``;
      }

      // REACT COMPONENTS: Detect export function/const XXX components
      const componentMatch = fileContent.match(/export\s+(?:const|function)\s+(\w+)\s*(?::|=|\()/);
      const propsMatch = fileContent.match(/interface\s+(\w+Props)\s*{([^}]*)}/);
      if (componentMatch) {
        const [, componentName] = componentMatch;
        const [, propsName, propsBody] = propsMatch || [null, 'Props', ''];
        return `⚛️ **React Component** - \`${filePath}\`
   - Export: \`export const ${componentName}: React.FC<${propsName || 'Props'}>\`
   - Component name: \`${componentName}\`
   - Props available: ${propsBody ? propsBody.split(';').map(l => l.trim()).filter(l => l).join(', ') : 'See component definition'}
   - Usage: \`<${componentName} ... />\` or \`import { ${componentName} } from '...'\``;
      }

      // UTILITY EXPORTS: Detect exported functions or constants
      const utilMatches = fileContent.match(/export\s+(?:const|function|interface|type)\s+(\w+)/g) || [];
      if (utilMatches.length > 0) {
        const exports = utilMatches.map(m => m.replace(/export\s+(?:const|function|interface|type)\s+/, ''));
        return `🛠️ **Utility/Helper** - \`${filePath}\`
   - Exports: ${exports.join(', ')}
   - Usage: \`import { ${exports[0]} } from '...'\` or use as needed`;
      }

      // DEFAULT: Generic description
      return `📄 **File** - \`${filePath}\` (use as reference for context)`;
    } catch (error) {
      // If file can't be read, just return generic description
      return `📄 **File** - \`${filePath}\` (couldn't extract contract, use as reference)`;
    }
  }

  /**
   * CRITICAL FIX: Calculate the exact import statement from source file to target file
   * This prevents the LLM from guessing at paths
   * @param sourcePath Current file being generated (e.g., "src/components/LoginForm.tsx")
   * @param targetPath File being imported (e.g., "src/stores/useLoginFormStore.ts")
   * @returns Import statement (e.g., "import { useLoginFormStore } from '../stores/useLoginFormStore';")
   */
  private calculateImportStatement(sourcePath: string, targetPath: string): string | null {
    try {
      // Get directories
      const sourceDir = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
      const targetDir = targetPath.substring(0, targetPath.lastIndexOf('/'));
      const targetFileName = targetPath.substring(targetPath.lastIndexOf('/') + 1);
      
      // Remove extension for import (import useLoginFormStore from '...' , not '.ts')
      const importName = targetFileName.replace(/\.(ts|tsx|js|jsx)$/, '');
      
      // Calculate relative path
      const sourceParts = sourceDir.split('/').filter(p => p);
      const targetParts = targetDir.split('/').filter(p => p);
      
      // Find common prefix length
      let commonLength = 0;
      for (let i = 0; i < Math.min(sourceParts.length, targetParts.length); i++) {
        if (sourceParts[i] === targetParts[i]) {
          commonLength = i + 1;
        } else {
          break;
        }
      }
      
      // Calculate up path (..)
      const upCount = sourceParts.length - commonLength;
      const upPath = upCount > 0 ? '../'.repeat(upCount) : './';
      
      // Calculate down path
      const downPath = targetParts.slice(commonLength).join('/');
      
      // Combine to get relative path
      let relativePath = upPath + downPath;
      if (downPath) {
        relativePath = upPath + downPath + '/' + importName;
      } else {
        relativePath = upPath + importName;
      }
      
      // Detect if it's a Zustand store (starts with 'use' and ends with 'Store')
      const isZustandStore = importName.startsWith('use') && importName.endsWith('Store');
      
      // Generate import statement
      if (isZustandStore) {
        return `import { ${importName} } from '${relativePath}';`;
      }
      
      // For utilities and helpers, use named imports
      if (targetFileName === 'cn.ts' || targetFileName === 'cn.js') {
        return `import { cn } from '${relativePath}';`;
      }
      
      // Default: assume named export with same name as file
      return `import { ${importName} } from '${relativePath}';`;
    } catch (error) {
      console.warn(`[Executor] Failed to calculate import for ${targetPath}: ${error}`);
      return null;
    }
  }

  /**
   * Execute a complete plan step-by-step
   */
  async executePlan(plan: TaskPlan): Promise<ExecutionResult> {
    this.plan = plan;
    this.paused = false;
    this.cancelled = false;

    plan.status = PlanState.EXECUTING;

    // CRITICAL: Initialize results Map if not already present
    if (!plan.results) {
      plan.results = new Map<number, StepResult>();
    }

    // CRITICAL FIX: Use workspace from plan context, not executor config
    // This fixes the "RefactorTest selection not persisting" bug
    const planWorkspaceUri = plan.workspacePath
      ? vscode.Uri.file(plan.workspacePath)
      : this.config.workspace;

    if (plan.workspacePath) {
      console.log(
        `[Executor] Using workspace from plan: "${plan.workspaceName}" at ${plan.workspacePath}`
      );
    } else {
      console.log(
        `[Executor] No workspace in plan, using default: ${this.config.workspace.fsPath}`
      );
    }

    // Clear LLM conversation history to avoid context pollution from planning phase
    // This clears the LLM's internal context, NOT the chat UI history
    this.config.llmClient.clearHistory();

    // 🔴 CRITICAL: Reorder steps based on file dependencies (topological sort)
    // This ensures store/interface files are written BEFORE components that import them
    const reorderedSteps = this.reorderStepsByDependencies(plan.steps);
    if (reorderedSteps.length !== plan.steps.length) {
      console.warn('[Executor] Warning: Step reordering changed step count');
    } else if (!this.stepsAreEqual(plan.steps, reorderedSteps)) {
      this.config.onMessage?.(
        '🔄 Reordering steps to satisfy import dependencies...',
        'info'
      );
      plan.steps = reorderedSteps;
    }

    const startTime = Date.now();
    let succeededSteps = 0;

    // ✅ SURGICAL REFACTOR: Greenfield Guard (State-Aware Contract Enforcement)
    // Check if workspace is greenfield (empty) and enforce READ constraints
    const workspaceExists = await this.checkWorkspaceExists(planWorkspaceUri);
    const hasInitialization = plan.steps.some(s => s.action === 'write');

    if (!workspaceExists && !hasInitialization) {
      // Greenfield workspace with no initialization - inform user
      this.config.onMessage?.(
        '⚠️ Greenfield Workspace: Plan starts with READ operations on empty workspace. Consider WRITE operations first.',
        'info'
      );
    }

    for (const step of plan.steps) {
      try {
        // ✅ SURGICAL REFACTOR: Pre-Flight Contract Check (State-Aware)
        // Run atomic contract validation BEFORE any normalization/sanitization
        this.preFlightCheck(step, workspaceExists);

        // ✅ NEW: Dependency Validation (DAG Support)
        // Track completed step IDs and validate dependencies
        const completedStepIds = new Set<string>();
        for (const completed of plan.results?.values() ?? []) {
          if (completed.success && plan.steps[completed.stepId - 1]?.id) {
            completedStepIds.add(plan.steps[completed.stepId - 1].id);
          }
        }
        // Build the set of step IDs that are actually in this plan (after filtering)
        const planStepOrder = plan.steps.map(s => s.id).filter((id): id is string => !!id);
        const planStepIds = new Set<string>(planStepOrder);
        this.validateDependencies(step, completedStepIds, planStepIds, planStepOrder);

        // ✅ SENIOR FIX: String Normalization (Danh's Markdown Artifact Handling)
        // Call BEFORE validation to ensure LLM output is clean (Tolerant Receiver pattern)
        if ((step.action === 'write' || step.action === 'read' || step.action === 'delete') && step.path) {
          step.path = PathSanitizer.normalizeString(step.path);
        }

        // ✅ ATOMIC STEP VALIDATION (Danh's Fix A)
        // 1. Deterministic Path Guard: Validate step contract BEFORE execution
        this.validateStepContract(step);

        // ✅ LIBERAL PATH SANITIZER (Danh's Fix B)
        // Auto-fix common Qwen 7b artifacts: trailing dots, spaces, backticks
        if ((step.action === 'write' || step.action === 'read' || step.action === 'delete') && step.path) {
          step.path = this.sanitizePath(step.path);
        }

        // ✅ 2. Actual Execution with retry logic
        let retries = 0;
        let result: StepResult | null = null;
        let autoFixAttempted = false;
        let retryCount = 0;
        const maxRetries = this.config.maxRetries || 2;

        while (retries <= maxRetries) {
          // Check for pause/cancel before executing
          while (this.paused && !this.cancelled) {
            await new Promise(r => setTimeout(r, 100));
          }

          if (this.cancelled) {
            plan.status = PlanState.FAILED;
            return {
              success: false,
              completedSteps: succeededSteps,
              results: plan.results,
              error: 'Execution cancelled by user',
              totalDuration: Date.now() - startTime,
            };
          }

          result = await this.executeStep(plan, step.stepId, planWorkspaceUri);


          if (result.success) {
            // Success! Show retry info if retries happened
            if (retryCount > 0) {
              this.config.onMessage?.(`✅ Step ${step.stepId} succeeded (after ${retryCount} retry attempt${retryCount > 1 ? 's' : ''})`, 'info');
            }
            succeededSteps++;
            break;
          }

          // ✅ SURGICAL REFACTOR: Smart Retry Strategy Switching
          // Detect READ-ENOENT and attempt intelligent recovery
          if (result.error && step.action === 'read' && result.error.includes('ENOENT')) {
            const strategySwitch = this.attemptStrategySwitch(step, result.error);
            if (strategySwitch) {
              this.config.onMessage?.(
                `⚠️ Step ${step.stepId}: File not found. ${strategySwitch.message}`,
                'info'
              );
              // Update step with suggested action
              step.action = strategySwitch.suggestedAction as any;
              if (strategySwitch.suggestedPath) {
                step.path = strategySwitch.suggestedPath;
              }
              // Retry with new strategy
              retryCount++;
              await new Promise(r => setTimeout(r, 500));
              continue; // Retry this step with new action
            }
          }

          // Try auto-correction on first failure (Priority 2.1: Auto-Correction)
          if (!autoFixAttempted && result.error) {
            this.config.onMessage?.(`Attempting automatic fix for step ${step.stepId} (iteration 1/${this.MAX_VALIDATION_ITERATIONS})...`, 'info');
            const fixedResult = await this.attemptAutoFix(step, result.error, Date.now(), this.MAX_VALIDATION_ITERATIONS, planWorkspaceUri);
            if (fixedResult && fixedResult.success) {
              result = fixedResult;
              autoFixAttempted = true;
              succeededSteps++;
              this.config.onMessage?.(`✅ Auto-correction succeeded for step ${step.stepId}`, 'info');
              break; // Auto-fix succeeded, move to next step
            }
            autoFixAttempted = true; // Mark that we tried, don't try again
          }

          retries++;
          retryCount++;
          if (retries <= maxRetries) {
            const msg = `❌ Step ${step.stepId} failed. Retrying (${retries}/${maxRetries})...`;
            this.config.onMessage?.(msg, 'error');
            await new Promise(r => setTimeout(r, 1000));
          }
        }

        plan.results.set(step.stepId, result!);

        if (!result!.success) {
          plan.status = PlanState.FAILED;
          plan.currentStep = step.stepId;
          const failureMsg = retryCount > 0
            ? `Step ${step.stepId} failed after ${retryCount} retry attempt${retryCount > 1 ? 's' : ''}`
            : `Step ${step.stepId} failed on first attempt`;
          return {
            success: false,
            completedSteps: succeededSteps,
            results: plan.results,
            error: failureMsg + `: ${result!.error}`,
            totalDuration: Date.now() - startTime,
          };
        }

        plan.currentStep = step.stepId;
        this.config.onProgress?.(
          plan.currentStep,
          plan.steps.length,
          step.description
        );
      } catch (error) {
        // ✅ ATOMIC CATCH BLOCK (Danh's Fix A)
        // Terminal failure at this step: mark as failed and break execution
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[Executor] Terminal failure at step ${step.stepId}: ${errorMsg}`);

        plan.results?.set(step.stepId, {
          success: false,
          stepId: step.stepId,
          output: '',
          error: errorMsg,
          duration: 0,
          timestamp: Date.now(),
        });

        // Return immediately with the current count
        return {
          success: false,
          completedSteps: succeededSteps,
          results: plan.results,
          error: errorMsg,
          totalDuration: Date.now() - startTime,
        };
      }
    }

    plan.status = PlanState.COMPLETED;

    // 🔴 CRITICAL: Integration Validation (User's Recommendation)
    // After all files are generated, validate they ACTUALLY integrate
    // This catches issues like "Zustand store imported but component doesn't call it correctly"
    this.config.onMessage?.(
      '🔍 Validating integration between dependent files...',
      'info'
    );

    const filesCreated = plan.steps
      .filter(s => s.action === 'write')
      .map(s => s.path)
      .filter((p): p is string => !!p);

    // Read all generated files and check they work together
    const validator = new ArchitectureValidator();
    const generatedFileContents = new Map<string, string>();

    for (const filePath of filesCreated) {
      try {
        const fileUri = vscode.Uri.joinPath(planWorkspaceUri, filePath);
        const fileData = await vscode.workspace.fs.readFile(fileUri);
        const content = new TextDecoder().decode(fileData);
        generatedFileContents.set(filePath, content);
      } catch (err) {
        console.warn(`[Executor] Could not read generated file for integration check: ${filePath}`);
      }
    }

    // Check each file against all others for integration issues
    const integrationErrors: string[] = [];
    
    // Build a set of all "known" file paths for import resolution checks.
    // Includes files created this run + canonical base paths without extensions.
    const knownPaths = new Set<string>();
    for (const p of generatedFileContents.keys()) {
      // Strip leading src/ if present, add both forms
      const normalized = p.replace(/\\/g, '/').replace(/^src\//, '');
      knownPaths.add(normalized);
      knownPaths.add(normalized.replace(/\.[tj]sx?$/, '')); // without extension
    }

    for (const [filePath, content] of generatedFileContents) {
      // IMPORT PATH RESOLUTION: verify @/-prefixed and relative imports resolve to known files.
      // This catches fabricated paths like `@/components/ui/form-login` when only
      // `src/components/LoginForm.tsx` was created.
      const importLines = [...content.matchAll(/from\s+['"](@\/[^'"]+|\.\.?\/[^'"]+)['"]/g)];
      for (const importMatch of importLines) {
        const rawPath = importMatch[1];

        // Resolve @/ alias (maps to src/)
        const resolved = rawPath.startsWith('@/')
          ? rawPath.slice(2)  // strip '@/' → relative to src/
          : rawPath.replace(/^\.\//, '').replace(/^\.\.\//, ''); // strip leading ./ or ../

        const resolvedNoExt = resolved.replace(/\.[tj]sx?$/, '');

        // Skip known-good paths (in this plan or clearly a utility)
        const isKnown = knownPaths.has(resolved) || knownPaths.has(resolvedNoExt) ||
          resolved.includes('utils/cn') || resolved.includes('utils/') ||
          resolved.includes('hooks/') || resolved.includes('stores/') ||
          resolved.includes('types/') || resolved.includes('lib/');

        if (!isKnown) {
          integrationErrors.push(
            `❌ ${filePath}: Unresolvable import path '${rawPath}'. ` +
            `This path was not created in this plan and is likely fabricated. ` +
            `Known paths: ${[...knownPaths].slice(0, 5).join(', ')}`
          );
        }
      }

      // Check if this file imports from stores but doesn't use the hook correctly
      const storeImportMatch = content.match(/from\s+['\"]([^'\"]*stores[^'\"]*)['\"]/);
      if (storeImportMatch) {
        const storeHookMatches = content.matchAll(/import\s+{([^}]*use\w+Store[^}]*)}/g);
        for (const match of storeHookMatches) {
          const hookNames = match[1].split(',').map((h: string) => h.trim());
          for (const hookName of hookNames) {
            // Check if hook is actually called/destructured in the component
            if (!content.match(new RegExp(`const\\s+{[^}]+}\\s*=\\s*${hookName}\\s*\\(\\)`))) {
              integrationErrors.push(
                `\u274c ${filePath}: Imports '${hookName}' but never calls it. ` +
                `Expected: const { state } = ${hookName}();`
              );
            }
            // Check for wrong calling pattern: const store = useStoreHook(); then store.x or store()
            if (content.match(new RegExp(`const\\s+\\w+\\s*=\\s*${hookName}\\s*\\(\\)`))) {
              integrationErrors.push(
                `\u274c ${filePath}: WRONG: Storing store hook in variable. Must destructure directly.` +
                `Change: const { x } = ${hookName}(); NOT const store = ${hookName}();`
              );
            }
          }
        }
      }
    }

    if (integrationErrors.length > 0) {
      console.error('[Executor] \u274c Integration validation failed:');
      for (const error of integrationErrors) {
        console.error(`  ${error}`);
        this.config.onMessage?.(error, 'error');
      }
      
      // Integration failures are CRITICAL - files won't work together
      return {
        success: false,
        completedSteps: succeededSteps,
        results: plan.results,
        error: `Integration validation failed: ${integrationErrors[0]}`,
        totalDuration: Date.now() - startTime,
      };
    }

    this.config.onMessage?.(
      '✅ All files validated for integration consistency',
      'info'
    );

    return {
      success: true,
      completedSteps: succeededSteps,
      results: plan.results,
      totalDuration: Date.now() - startTime,
    };
  }

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
    step: PlanStep,
    criteria: string[] = []
  ): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];

    // Check 1: Type validation (if TypeScript)
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      const typeErrors = this.validateTypes(content, filePath);
      if (typeErrors.length > 0) {
        errors.push(...typeErrors);
      }
    }


    // Check 3: Common patterns (imports, syntax)
    const patternErrors = this.validateCommonPatterns(content, filePath);
    if (patternErrors.length > 0) {
      errors.push(...patternErrors);
    }

    // Check 4: CRITICAL - Cross-file contract validation (multi-step orchestration)
    // Verify that imported symbols actually exist in their source files
    if ((filePath.endsWith('.ts') || filePath.endsWith('.tsx')) && this.plan) {
      try {
        // ✅ CRITICAL: Build context of files from previous steps
        // Pass these to the validator so it can resolve imports without reading disk
        const previousStepFiles = new Map<string, string>();
        if (this.plan.results) {
          for (let i = 1; i < step.stepId; i++) {
            const prevResult = this.plan.results.get(i);
            if (prevResult && prevResult.output && (prevResult as any).content) {
              // If output is a file path, try to get content from plan storage
              // The output format is usually "Wrote {filePath} (XX bytes)"
              const pathMatch = prevResult.output.match(/Wrote\s+(\S+)\s+/);
              if (pathMatch) {
                const prevFilePath = pathMatch[1];
                const fileContent = (prevResult as any).content;
                
                // Store with multiple variants for robust path matching
                // e.g., "src/stores/loginStore.ts" also stored as "src/stores/loginStore"
                previousStepFiles.set(prevFilePath, fileContent);
                
                // Also store without extension for relative import resolution
                if (prevFilePath.endsWith('.ts') || prevFilePath.endsWith('.tsx') || 
                    prevFilePath.endsWith('.js') || prevFilePath.endsWith('.jsx')) {
                  const pathWithoutExt = prevFilePath.replace(/\.(ts|tsx|js|jsx)$/, '');
                  previousStepFiles.set(pathWithoutExt, fileContent);
                }
                
                console.log(`[Executor] ✅ Stored previous step file for validator: ${prevFilePath}`);
              }
            }
          }
        }

        const validator = new ArchitectureValidator();
        const contractResult = await validator.validateCrossFileContract(
          content,
          filePath,
          this.config.workspace,
          previousStepFiles.size > 0 ? previousStepFiles : undefined  // ✅ Pass previous files context
        );

        if (contractResult.hasViolations) {
          const contractErrors = contractResult.violations.map(
            v =>
              `❌ Cross-file Contract: ${v.message}. ${v.suggestion}`
          );
          errors.push(...contractErrors);
          
          if (contractResult.recommendation === 'skip') {
            console.warn(
              `[Executor] ⚠️ CRITICAL: Cross-file contract violations found in ${filePath}. Component/feature will not work correctly.`
            );
          }
        }

        // ✅ NEW: Validate semantic hook usage (prevents refactoring failures)
        const hookUsageViolations = await validator.validateHookUsage(
          content,
          filePath,
          previousStepFiles.size > 0 ? previousStepFiles : undefined  // ✅ Pass previous files context
        );
        if (hookUsageViolations.length > 0) {
          const hookErrors = hookUsageViolations.map(
            v => `❌ Hook Usage: ${v.message}. ${v.suggestion}`
          );
          errors.push(...hookErrors);
          console.warn(
            `[Executor] ⚠️ Hook usage violations found in ${filePath}. Refactoring may not be complete.`
          );
        }

        // ✅ REMOVED: Validate Zustand components for correctness
        // validateImportUsage and validateZustandComponent were unused methods removed in cleanup

        // If component imports from stores but Zustand pattern not detected, that's also an error
        if (content.match(/from\s+['"]([^'"]*\/stores\/[^'"]*)['"]/) && !content.match(/const\s+{[^}]+}\s*=\s*use\w+Store\s*\(\)/)) {
          errors.push(
            `❌ Zustand Pattern: Component imports from stores but doesn't use destructuring pattern. ` +
            `Expected: const { x, y } = useStoreHook();`
          );
        }
      } catch (error) {
        console.error(`[Executor] ❌ CRITICAL: Cross-file validation threw exception:`, error);
        // Don't silently swallow - this is a critical issue
        errors.push(`❌ Validation system error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Check 5: LLM semantic validation — only when no ❌ structural errors
    // When criteria[] is provided: structured YES/NO per acceptance criterion (Reviewer pattern)
    // When criteria[] is empty: open-ended "find problems" fallback
    const hasCriticalStructural = errors.some(e => e.includes('❌'));
    if (!hasCriticalStructural) {
      const llmIssues = await this.llmValidate(filePath, content, step, criteria);
      if (llmIssues.length > 0) {
        errors.push(...llmIssues);
      }
    }

    // ✅ NEW: Ensure all errors are treated as block if they contain ❌
    const finalValid = !errors.some(e => e.includes('❌ Zustand'));

    return {
      valid: finalValid && errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Validate TypeScript types (simple check, not full compilation)
   */
  private validateTypes(content: string, filePath: string): string[] {
    const errors: string[] = [];

    // CRITICAL: Check if content is documentation or markdown instead of code
    if (content.includes('```') || content.match(/^```/m)) {
      errors.push(
        `❌ Code wrapped in markdown backticks. This is not valid TypeScript. ` +
        `LLM provided markdown instead of raw code.`
      );
      return errors; // Stop validation, this is a critical error
    }

    if (content.includes('# Setup') || content.includes('## Installation') || content.includes('### Step')) {
      errors.push(
        `❌ Content appears to be documentation/tutorial instead of executable code. ` +
        `No markdown, setup instructions, or step-by-step guides allowed.`
      );
      return errors;
    }

    // Check for multiple file references
    const fileRefs = (content.match(/\/\/(.*\.(ts|tsx|js|json|yaml))/gi) || []).length;
    if (fileRefs > 1) {
      errors.push(
        `❌ Multiple file references detected in single-file output. ` +
        `This file should contain code for ${filePath.split('/').pop()} only, not instructions for other files.`
      );
      return errors;
    }

    // Check for common type issues
    if (content.includes('export type LoginFormValues') || content.match(/export type \w+ = {/)) {
      // Types might need validation, but let's check the content is valid TypeScript
      if (!content.includes('export function') && !content.includes('export const')) {
        errors.push(
          `⚠️ This file only exports types but no components/hooks. ` +
          `Make sure you're exporting the actual hook/component, not just types.`
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
   * Validate form components against required patterns
   */
  private validateFormComponentPatterns(content: string, filePath: string): string[] {
    const errors: string[] = [];

    // Only validate if this is a form component
    if (!filePath.includes('Form') || !filePath.endsWith('.tsx')) {
      return errors;
    }

    // Orchestration: Call the utility to extract all form patterns
    const patterns = matchFormPatterns(content);

    // Map results to error messages - keeping the orchestration logic
    const patternMap = new Map(patterns.map(p => [p.type, p.found]));

    // Pattern 1: State Interface
    if (!patternMap.get('stateInterface')) {
      errors.push(
        `❌ Pattern 1 violation: Missing state interface. ` +
        `Forms require: interface LoginFormState { email: string; password: string; }`
      );
    }

    // Pattern 2: Handler Typing - needs additional checks beyond the pattern
    const hasFormEventHandler = patternMap.get('formEventHandler');
    const hasInlineHandler = /const\s+handle\w+\s*=\s*\(\s*e\s*:\s*any\s*\)/.test(content);
    if (hasInlineHandler) {
      errors.push(
        `❌ Pattern 2 violation: Handler typed as 'any'. ` +
        `Use: const handleChange: FormEventHandler<HTMLFormElement> = (e) => { ... }`
      );
    }
    if (!hasFormEventHandler && (content.includes('handleChange') || content.includes('handleSubmit'))) {
      errors.push(
        `⚠️ Pattern 2 warning: Handlers should use FormEventHandler<HTMLFormElement> type.`
      );
    }

    // Pattern 3: Consolidator Pattern
    const fieldChangeHandlers = (content.match(/const\s+(handle(?:Change|Input|Update|Form(?!Submit))\w*)\s*=/gi) || []).length;
    const hasConsolidator = /\[name,\s*value\]\s*=\s*.*currentTarget/.test(content) ||
                           /currentTarget.*name.*value/.test(content);
    if (fieldChangeHandlers > 1 && !hasConsolidator) {
      errors.push(
        `❌ Pattern 3 violation: Multiple field handlers instead of consolidator. ` +
        `Multi-field forms must use single handleChange: ` +
        `const handleChange = (e) => { const { name, value } = e.currentTarget; }`
      );
    }

    // Pattern 4: Submit Handler
    const hasFormElement = /<form/.test(content);
    const hasFormOnSubmit = /onSubmit\s*=\s*{?\s*handleSubmit/.test(content);
    const hasButtonOnClick = /<button[^>]*onClick\s*=\s*{?\s*handle/.test(content);

    if (!hasFormOnSubmit && hasFormElement) {
      errors.push(
        `❌ Pattern 4 violation: Missing form onSubmit handler. ` +
        `Use: <form onSubmit={handleSubmit}>` +
        `Then: const handleSubmit: FormEventHandler<HTMLFormElement> = (e) => { e.preventDefault(); ... }`
      );
    }
    if (hasButtonOnClick && !hasFormOnSubmit) {
      errors.push(
        `❌ Pattern 4 violation: Using button onClick instead of form onSubmit. ` +
        `Forms should handle submission via: <form onSubmit={handleSubmit}>`
      );
    }

    // Pattern 5: Validation Logic
    const hasValidationLogic = /if\s*\(\s*!/.test(content) ||
                               /setErrors\s*\(/.test(content) ||
                               /validate/.test(content);
    if (!hasValidationLogic && content.includes('email')) {
      errors.push(
        `⚠️ Pattern 5 info: Consider adding basic validation. ` +
        `Example: if (!email.includes('@')) { setErrors(...); return; }`
      );
    }

    // Pattern 6: Error State Tracking
    const hasErrorState = /useState\s*<\s*Record\s*<\s*string\s*,\s*string\s*>\s*>\s*\(\s*{}/.test(content);
    if (!hasErrorState && (content.includes('validation') || content.includes('error'))) {
      errors.push(
        `⚠️ Pattern 6 warning: Consider tracking field-level errors. ` +
        `Use: const [errors, setErrors] = useState<Record<string, string>>({})`
      );
    }

    // Pattern 7: Semantic Form Markup
    const hasNamedInputs = /name\s*=\s*['"]\w+['"]/.test(content);
    const hasInputElements = /<input|<textarea|<select/.test(content);
    if (hasInputElements && !hasNamedInputs) {
      errors.push(
        `❌ Pattern 7 violation: Input elements missing name attributes. ` +
        `Use: <input type="email" name="email" value={formData.email} />`
      );
    }

    // Controlled component check: inputs with onChange MUST have value prop.
    // An input with onChange but no value is uncontrolled — state updates but the UI
    // doesn't reflect the current state value, breaking the controlled component contract.
    const hasOnChangeOnInput = /onChange\s*=\s*\{/.test(content);
    const hasValueBinding = /\bvalue\s*=\s*\{[^}]+\}/.test(content);
    if (hasInputElements && hasOnChangeOnInput && !hasValueBinding) {
      errors.push(
        `❌ Uncontrolled input: inputs have onChange but no value prop. ` +
        `Add value={formData.fieldName} to each controlled input. ` +
        `Without value= the input is uncontrolled and state changes won't reflect in the UI.`
      );
    }

    return errors;
  }

  /**
   * Validate common code patterns and syntax issues
   */
  private validateCommonPatterns(content: string, filePath: string): string[] {
    const errors: string[] = [];

    // Split React imports: multiple `from 'react'` lines is always wrong.
    // Root cause: the old reactImportsSection showed each hook as a separate import example,
    // which the LLM reproduced verbatim. The fix lives in the prompt (merged example) AND here
    // (deterministic catch for when the prompt is ignored).
    if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
      const reactImportLines = (content.match(/^import\s+.+\s+from\s+['"]react['"]/gm) || []);
      if (reactImportLines.length > 1) {
        errors.push(
          `❌ Split React imports: Found ${reactImportLines.length} separate import lines from 'react'. ` +
          `Merge into one: import React, { useState, FormEvent, FormEventHandler } from 'react'`
        );
      }
    }

    // Check form component patterns first
    const formErrors = this.validateFormComponentPatterns(content, filePath);
    if (formErrors.length > 0) {
      errors.push(...formErrors);
    }

    // Phase 2C: Map and Wrap - Use pure utility to detect import/syntax issues
    const issues = findImportAndSyntaxIssuesPure(content, filePath || '');
    issues.forEach(issue => {
      // Wrap pure utility results into error message format
      const prefix = issue.severity === 'error' ? '❌' : '⚠️';
      errors.push(`${prefix} ${issue.message}`);
    });

    // ----------------------------------------------------------------
    // CSS module import detection
    // Flags `import styles from '*.module.css'` in projects that don't use CSS modules.
    // ProjectProfile tracks hasCssModules; if false, any *.module.css import is fabricated.
    // We check regardless of profile because CSS modules are rarely added mid-component.
    // ----------------------------------------------------------------
    const cssModuleImport = content.match(/import\s+\w+\s+from\s+['"]([^'"]*\.module\.css)['"]/);
    if (cssModuleImport) {
      errors.push(
        `❌ Fabricated CSS module: \`${cssModuleImport[1]}\` was imported but this project uses Tailwind, not CSS modules. ` +
        `Remove the CSS module import and replace all \`styles.xxx\` references with Tailwind classes via cn().`
      );
    }

    // ----------------------------------------------------------------
    // Cross-layer dependency violation (catches circular imports)
    // Rule: utility/lib/store files must NOT import from component layer.
    // Components depend on utils, never the other way around.
    // ----------------------------------------------------------------
    const utilityLayerPattern = /\bsrc[\\/](?:utils|lib|helpers|constants|stores)[\\/]/i;
    const isUtilityLayerFile = utilityLayerPattern.test(filePath) ||
      /[\\/](cn|utils|helpers|classnames)\.[tj]s$/.test(filePath);

    if (isUtilityLayerFile) {
      const componentImport = content.match(
        /from\s+['"]([^'"]*(?:components|pages|app|routes|views|screens)[^'"]*)['"]/i
      );
      if (componentImport) {
        errors.push(
          `❌ Circular dependency: \`${filePath}\` is a utility/lib file but imports from "${componentImport[1]}". ` +
          `Utility files must never import from the component layer — this will crash the module loader at runtime. ` +
          `Remove the component import; if you need shared logic, extract it to a separate utility.`
        );
      }
    }

    // TSX component-specific checks
    if (filePath.endsWith('.tsx')) {
      // Detect React.ReactNode / React.ReactElement used as a runtime value (not a type)
      // e.g. "React.ReactNode.propTypes ? React.ReactNode : children" — always falsy, renders nothing
      if (/React\.ReactNode\s*[\?:\.](?!.*:)/.test(content) ||
          /React\.ReactElement\s*[\?:\.](?!.*:)/.test(content)) {
        errors.push(
          `❌ Runtime bug: React.ReactNode or React.ReactElement used as a value expression. ` +
          `These are TypeScript types — they don't exist at runtime. ` +
          `Replace the ternary with just \`{children}\` or the actual JSX.`
        );
      }

      // Detect manual className string concatenation when cn() is imported
      const importsCn = /import\s+.*\bcn\b.*from/.test(content);
      const hasManualConcat = /className\s*=\s*[`'"][^`'"]*\$\{/.test(content) ||
                              /className\s*=\s*\{[^}]*\+\s*['"`]/.test(content);
      if (importsCn && hasManualConcat) {
        errors.push(
          `❌ Style bug: cn() is imported but className uses manual string concatenation. ` +
          `Use cn() for all class merging: className={cn('base', variant === 'primary' && 'bg-indigo-600', className)}`
        );
      }

      // Detect bare string classNames when cn() is imported.
      // Every className prop must go through cn() — no exceptions, including submit buttons.
      // Catches: className="..." and className={"..."} but NOT className={cn(...)}
      if (importsCn) {
        const bareStringClassName = /className\s*=\s*(?:"[^"]*"|'[^']*'|\{["'][^"']*["']\})/.test(content);
        if (bareStringClassName) {
          errors.push(
            `❌ Style bug: cn() is imported but a className prop uses a bare string literal. ` +
            `Every className must go through cn(): className={cn('your-classes')} — this applies to every element, including submit buttons.`
          );
        }
      }

      // Detect component file with only default export and no named export
      // Only warn for truly anonymous patterns — allow `const X = ...; export default X;`
      const hasDefaultExport = /export\s+default\b/.test(content);
      const hasNamedExport = /export\s+(?:const|function|class)\s+[A-Z]/.test(content);
      const hasNamedDefinition = /\b(?:const|function|class)\s+[A-Z]\w+/.test(content);
      if (hasDefaultExport && !hasNamedExport && !hasNamedDefinition && filePath.includes('components/')) {
        errors.push(
          `⚠️ Export consistency: Component has only a default export. ` +
          `Add a named export for consistency: export const ${filePath.split('/').pop()?.replace('.tsx', '')} = ...`
        );
      }

      // Interactive components MUST use forwardRef; forwardRef components MUST set .displayName
      const interactiveFilePattern = /\/(Button|Input|Select|Textarea|Checkbox|Radio|Toggle|Switch|Slider)\.[tj]sx?$/i;
      const isInteractiveFile = interactiveFilePattern.test(filePath);
      // Match both forwardRef( (no generics) and forwardRef<T>( (TypeScript generics)
      const usesForwardRef = content.includes('React.forwardRef') || /\bforwardRef\s*[<(]/.test(content);
      const hasDisplayName = /\.displayName\s*=/.test(content);
      const componentName = filePath.split('/').pop()?.replace(/\.[tj]sx?$/, '') || 'Component';

      if (isInteractiveFile && !usesForwardRef) {
        errors.push(
          `❌ Missing forwardRef: ${componentName} is an interactive component — it MUST use React.forwardRef to support ref forwarding. ` +
          `Wrap with: export const ${componentName} = React.forwardRef<HTMLButtonElement, ${componentName}Props>(({ ...props }, ref) => { ... }); ` +
          `then add ${componentName}.displayName = '${componentName}';`
        );
      } else if (usesForwardRef && !hasDisplayName) {
        errors.push(
          `❌ forwardRef missing displayName: Add \`${componentName}.displayName = '${componentName}';\` ` +
          `after the component definition. Without it React DevTools shows "ForwardRef" instead of the component name.`
        );
      }

      // TSX components MUST return JSX, not a plain string/expression.
      // Auto-correction can introduce this bug by wrapping the function signature but leaving the
      // body as a bare cn() call — returns a string, throws "Nothing was returned from render".
      //
      // ROOT CAUSE of prior false-passes: /<[A-Za-z][\w.]*[\s/>]/ matched TypeScript generic
      // annotations like <HTMLInputElement> or React.forwardRef<HTMLInputElement, InputProps>.
      // TypeScript generics are always PascalCase; JSX HTML elements are always lowercase.
      // Fix: match only lowercase tags (<button, <input, <div, <form, <label, <span, etc.)
      // Also allow `return null` as a valid empty render.
      if (filePath.endsWith('.tsx') && (isInteractiveFile || filePath.includes('/components/'))) {
        const hasJsxReturn =
          /<[a-z][a-z0-9-]*[\s/>]/.test(content) ||   // lowercase HTML element (<button, <input, <div …)
          /return\s+null\b/.test(content);              // explicit null render is valid
        if (!hasJsxReturn) {
          errors.push(
            `❌ Component returns no JSX: The component body has no JSX HTML element (no <button>, <input>, <div>, etc.). ` +
            `React components MUST return JSX — e.g. return <button ref={ref} {...props} />. ` +
            `A bare cn() call or string return will throw "Nothing was returned from render" at runtime. ` +
            `NOTE: TypeScript generics like <HTMLInputElement> are NOT JSX — the check requires a real HTML tag.`
          );
        }
      }

      // Detect self-referential export: `export const Button = Button` or `export { Button as Button }`.
      // Auto-correction introduces this pattern when it wraps an inner const and then re-exports by name.
      // TypeScript throws "Block-scoped variable used before its declaration" or a circular reference.
      // Fires for any component file (.tsx) — not just interactive files.
      if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
        // Pattern: export const X = X  (same identifier on both sides)
        const selfRefExportMatch = content.match(/export\s+const\s+(\w+)\s*=\s*(\w+)\s*;/);
        if (selfRefExportMatch && selfRefExportMatch[1] === selfRefExportMatch[2]) {
          const name = selfRefExportMatch[1];
          errors.push(
            `❌ Self-referential export: \`export const ${name} = ${name};\` is a circular declaration. ` +
            `Export the component directly: \`export const ${name} = React.forwardRef<...>(...)\` — ` +
            `do NOT assign to an internal name and then re-export it by the same name.`
          );
        }
      }

      // Interactive components (Button, Input, etc.) need at least one padding utility in base styles.
      // Lack of padding makes the component invisible/unusable until the consumer adds classes.
      // Critical (❌) not just a warning: a button with no padding is non-functional out of the box.
      const isInteractiveComponent = /\b(button|input|textarea|select)\b/i.test(
        filePath.split('/').pop() || ''
      );
      if (isInteractiveComponent) {
        const hasPadding = /\b(?:p|px|py|pt|pb|pl|pr)-\d/.test(content);
        if (!hasPadding) {
          errors.push(
            `❌ Missing default sizing: Interactive component has no padding utilities (px-*, py-*, p-*). ` +
            `Add \`px-4 py-2\` to the cn() base string so the component is usable without consumer overrides.`
          );
        }
      }

      // Detect conflicting Tailwind transition utilities.
      // twMerge silently drops all but the last one — the component loses the intended animation.
      // e.g. transition-colors + transition-transform → only transition-transform survives.
      const transitionMatches = content.match(/\btransition-\w+\b/g) ?? [];
      const uniqueTransitions = [...new Set(transitionMatches)];
      if (uniqueTransitions.length > 1) {
        errors.push(
          `⚠️ Conflicting Tailwind utilities: multiple transition-* classes detected (${uniqueTransitions.join(', ')}). ` +
          `twMerge keeps only the last one. Use a single transition utility — \`transition-colors\` is correct for most interactive components.`
        );
      }

      // Detect initial* props destructured from params but never forwarded to a hook or used in body.
      // Pattern: `({ initialCount = 0 }: Props)` but `useCounter()` called with no args.
      // This creates a silent bug: the prop is accepted, the consumer passes a value, nothing happens.
      // Heuristic: if the prop name appears ≤ 2 times in the whole file (interface def + destructuring)
      // it was never referenced in the function body.
      const initialPropDetector = /\(\s*\{[^}]*\b(initial[A-Z]\w*)[^}]*\}/g;
      let ipMatch: RegExpExecArray | null;
      while ((ipMatch = initialPropDetector.exec(content)) !== null) {
        const propName = ipMatch[1];
        const occurrences = (content.match(new RegExp(`\\b${propName}\\b`, 'g')) ?? []).length;
        if (occurrences <= 2) {
          errors.push(
            `❌ Silent prop: \`${propName}\` is destructured from props but never referenced in the component body. ` +
            `Pass it to the hook (e.g. \`use${propName.replace(/^initial/, '')}(${propName})\`) or remove the prop from the interface.`
          );
        }
      }
    }

    // cn imported but never called — applies to both .ts and .tsx
    // A dead `import { cn }` means copy-paste residue or scope creep; it will be tree-shaken
    // but signals the LLM deviated from the step's intent.
    const importsCn = /import\s+.*\bcn\b.*from/.test(content);
    if (importsCn && !/\bcn\s*\(/.test(content)) {
      errors.push(
        `⚠️ Dead import: \`cn\` is imported but never called. ` +
        `Either use it for class merging (className={cn(...)}) or remove the import.`
      );
    }

    // cn must never appear in hook files (.ts in hooks/ directory)
    // Hooks are pure logic — no styling concerns. Its presence here means the LLM
    // copy-pasted from a component template and didn't strip the style utilities.
    const isHookFile = /[\\/]hooks[\\/][^/]+\.ts$/.test(filePath) && !filePath.endsWith('.tsx');
    if (isHookFile && importsCn) {
      errors.push(
        `❌ Wrong layer: \`cn\` is a style utility and must not be imported in a hook. ` +
        `Hooks are pure logic — remove the cn import from \`${filePath.split('/').pop()}\`.`
      );
    }

    // Hook return contract: every useState value must be in the return object.
    // The most common failure: a hook creates `const [count, setCount] = useState(...)` but
    // only returns the manipulation functions `{ increment, decrement, reset }`, hiding count
    // from the consumer. The consumer then has no way to read the current value.
    if (isHookFile) {
      const stateVarMatches = [...content.matchAll(/const\s+\[(\w+),\s*\w+\]\s*=\s*useState/g)];
      if (stateVarMatches.length > 0) {
        // Find the return statement(s) in the hook
        const returnMatch = content.match(/return\s*\{([^}]+)\}/);
        if (returnMatch) {
          const returnBody = returnMatch[1];
          for (const match of stateVarMatches) {
            const stateVar = match[1];
            // Check if the state variable name appears in the return object
            if (!new RegExp(`\\b${stateVar}\\b`).test(returnBody)) {
              errors.push(
                `❌ Hook return missing state: \`${stateVar}\` is managed by useState but not in the return object. ` +
                `Consumers cannot read the value. Add \`${stateVar}\` to the return: return { ${stateVar}, ... }.`
              );
            }
          }
        }
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
   * ✅ FIX THE VALIDATION BULLY EFFECT
   * 
   * Separate critical errors from soft suggestions.
   * Hard errors (missing imports, syntax) block validation.
   * Soft suggestions (Zod recommendations, style) don't block, just warn.
   * 
   * This prevents the LLM from getting confused by contradictory messages.
   */
  private categorizeValidationErrors(errors: string[]): {
    critical: string[];
    suggestions: string[];
  } {
    const critical: string[] = [];
    const suggestions: string[] = [];

    errors.forEach(error => {
      // CRITICAL: Hard blockers that must be fixed
      if (
        error.includes('❌') ||  // Explicit error marker
        (error.includes('Pattern') && error.includes('violation')) ||  // Form pattern violations
        error.includes('Missing import') ||
        error.includes('Syntax error') ||
        error.includes('unclosed') ||
        error.includes('unmatched') ||
        error.includes('not imported') ||
        error.includes('Code wrapped in markdown') ||
        error.includes('documentation/tutorial') ||
        error.includes('Multiple file references') ||
        error.includes('Typo detected') ||
        error.includes('Multiple file') ||
        error.includes('Incorrect resolver') ||
        error.includes('Mixed validation') ||
        error.includes('Zod used but not imported') ||
        error.includes('TanStack Query used but not imported') ||
        error.includes('@hookform') || // Import errors for hooks
        error.match(/Missing return type|unclosed brace|unmatched/) // Type/syntax errors
      ) {
        critical.push(error);
      } else {
        // SUGGESTION: Advisory messages that don't block
        suggestions.push(error);
      }
    });

    return { critical, suggestions };
  }

  /**
   * Build the constraint block for LLM-as-judge validation.
   * Combines the step's scope description with detected project conventions.
   */
  private buildValidationConstraints(filePath: string, step: PlanStep): string {
    const lines: string[] = [];

    lines.push(`FILE: ${filePath}`);
    lines.push(`TASK SCOPE: ${step.description}`);

    const profileConstraints = this.config.projectProfile?.getGenerationConstraints();
    if (profileConstraints) {
      lines.push('');
      lines.push(profileConstraints);
    }

    lines.push('');
    lines.push('SCOPE CONSTRAINT: Implement ONLY what the TASK SCOPE explicitly describes. Props, variants, or features not mentioned are OUT OF SCOPE.');

    return lines.join('\n');
  }

  /**
   * Architect pre-flight: generate a task-specific acceptance checklist BEFORE code generation.
   * The Reviewer (llmValidate) then checks the generated code against this list item-by-item.
   * Non-blocking — returns [] on LLM failure, falling back to open-ended review.
   */
  private async generateAcceptanceCriteria(step: PlanStep): Promise<string[]> {
    try {
      const llmConfig = this.config.llmClient.getConfig();
      const profileConstraints = this.config.projectProfile?.getGenerationConstraints() ?? '';

      const constraintLine = profileConstraints ? ` CONSTRAINTS: ${profileConstraints.replace(/\n/g, ' ')}` : '';
      const isHookTarget = /[\\/]hooks[\\/][^/]+\.ts$/.test(step.path) && !step.path.endsWith('.tsx');
      const hookLine = isHookTarget ? ' HOOK FILE: never include cn/clsx/classnames imports in criteria — hooks are pure logic.' : '';
      const prompt = `Task: ${step.description}\nFile: ${step.path}${constraintLine}${hookLine}\n\nList 3-5 YES/NO acceptance criteria (concrete, checkable by reading code). Focus on structure, required APIs, and what must NOT appear.\n\nExample output: ["Uses React.forwardRef", "Only 'primary'/'secondary' variants defined", "Includes px-4 py-2 padding"]\n\nOutput the JSON array:`;

      const endpoint = `${llmConfig.endpoint}/v1/chat/completions`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: llmConfig.model.trim(),
          messages: [
            { role: 'system', content: 'You output only valid JSON arrays of strings. No explanation, no preamble, no markdown.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.0,
          max_tokens: 150,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[Acceptance Criteria] Server returned ${response.status} — skipping pre-flight`);
        return [];
      }

      const data = await response.json() as any;
      const raw: string = data?.choices?.[0]?.message?.content || '[]';
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) { return []; }

      let criteria: string[];
      try {
        criteria = JSON.parse(match[0]);
      } catch {
        return [];
      }
      if (!Array.isArray(criteria)) { return []; }
      const filtered = criteria.filter((c): c is string => typeof c === 'string' && c.trim().length > 0);

      if (filtered.length > 0) {
        this.config.onMessage?.(
          `🎯 Acceptance criteria (${filtered.length}): ${filtered.slice(0, 3).map((c, i) => `${i + 1}. ${c}`).join(' | ')}${filtered.length > 3 ? ' ...' : ''}`,
          'info'
        );
      }
      return filtered;
    } catch {
      return [];
    }
  }

  /**
   * LLM-as-judge: semantic validation that regex cannot catch.
   * When criteria[] is provided (from generateAcceptanceCriteria), uses structured YES/NO
   * checking against the pre-generated acceptance list.
   * When criteria[] is empty, falls back to open-ended "find problems" review.
   * Non-blocking — returns [] on LLM failure so write proceeds.
   * Only runs when structural checks produce no ❌ errors.
   */
  private async llmValidate(filePath: string, content: string, step: PlanStep, criteria: string[] = []): Promise<string[]> {
    try {
      const llmConfig = this.config.llmClient.getConfig();

      // Truncate content to avoid overwhelming small local models
      const truncatedContent = content.length > 2000
        ? content.slice(0, 2000) + '\n// ... (truncated)'
        : content;

      let prompt: string;

      if (criteria.length > 0) {
        // Structured review: check code against pre-generated acceptance criteria
        const criteriaList = criteria.map((c, i) => `${i + 1}. ${c}`).join('\n');
        prompt = `You are a strict code reviewer. Check the code against each acceptance criterion.

ACCEPTANCE CRITERIA:
${criteriaList}

CODE (${filePath}):
\`\`\`
${truncatedContent}
\`\`\`

For each criterion, decide: YES (passes), NO (critical failure), or WARN (minor issue).
Output ONLY a JSON array of the failures and warnings. Use:
- "❌ Criterion N: <brief reason>" for failures
- "⚠️ Criterion N: <brief reason>" for warnings

If all criteria pass, respond with: []

JSON array only. No explanation.`;
      } else {
        // Open-ended fallback when no criteria were pre-generated
        const constraints = this.buildValidationConstraints(filePath, step);
        prompt = `You are a strict code reviewer. Evaluate the code below against the given constraints.

CONSTRAINTS:
${constraints}

CODE TO REVIEW:
\`\`\`
${truncatedContent}
\`\`\`

OUTPUT FORMAT — respond with ONLY a JSON array of issues. Each issue must be one of:
- "❌ <short description>" for violations that must be fixed
- "⚠️ <short description>" for minor concerns

Focus ONLY on what regex cannot catch:
- Scope creep: props/variants/features not in TASK SCOPE
- Invalid or non-existent Tailwind classes
- Dead code (unused variables/imports)
- Unnecessary variable extraction: a const that holds a single Tailwind class string and is only used once (e.g. const paddingStyle = 'px-4 py-2') — flag as ⚠️ unnecessary indirection
- Semantic incorrectness (logic that won't work as described)

Do NOT flag: structural imports, forwardRef, displayName, padding — those are checked elsewhere.
If no issues, respond with: []

JSON array only. No explanation.`;
      }

      const endpoint = `${llmConfig.endpoint}/v1/chat/completions`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s max

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: llmConfig.model.trim(),
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.0,
          max_tokens: 300,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[LLM Validator] Server returned ${response.status} — skipping semantic check`);
        return [];
      }

      const data = await response.json() as any;
      const raw: string = data?.choices?.[0]?.message?.content ?? '[]';

      // Extract JSON array from response (LLM may wrap it in prose)
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) {
        console.warn('[LLM Validator] Response not a JSON array — skipping');
        return [];
      }

      const issues: string[] = JSON.parse(match[0]);
      if (!Array.isArray(issues)) { return []; }

      const filtered = issues.filter((i): i is string => typeof i === 'string' && (i.includes('❌') || i.includes('⚠️')));
      if (filtered.length > 0) {
        console.log(`[LLM Validator] Found ${filtered.length} issue(s) in ${filePath}:`);
        filtered.forEach(i => console.log(`  ${i}`));
      }

      return filtered;
    } catch (err) {
      // Non-blocking: LLM unavailable or timed out — proceed with write
      console.warn(`[LLM Validator] Skipped (${err instanceof Error ? err.message : String(err)})`);
      return [];
    }
  }

  /**
   * Filter validation errors to only return critical errors.
   * Soft suggestions are logged but not returned as validation failures.
   *
   * This prevents the "bully effect" where suggestions distract from hard errors.
   */
  private filterCriticalErrors(
    errors: string[] | undefined,
    verbose: boolean = false
  ): { critical: string[]; suggestions: string[] } {
    if (!errors || errors.length === 0) {
      return { critical: [], suggestions: [] };
    }

    const { critical, suggestions } = this.categorizeValidationErrors(errors);

    // Log suggestions as warnings, not as validation failures
    if (verbose && suggestions.length > 0) {
      this.config.onMessage?.(
        `⚠️ Suggestions (not blocking): ${suggestions.map(s => s.replace(/⚠️/g, '').trim()).join('; ')}`,
        'info'
      );
    }

    return { critical, suggestions };
  }

  /**
   * Auto-correct common errors (Priority 2.1: Auto-Correction)
   * Automatically attempts to fix failures without manual intervention
   * Returns null if no auto-fix is possible, or a fixed StepResult if successful
   */
  private async attemptAutoFix(
    step: PlanStep,
    error: string,
    startTime: number,
    maxIterations: number = 3,
    workspace?: vscode.Uri
  ): Promise<StepResult | null> {
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
          return await this.executeRun(fixedStep, startTime, workspace);
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
              [step.path, ...files, 'Skip this step'],
              30000 // Standard timeout for file selection
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

      // Pre-check: skip bare `npm install` / `yarn install` if node_modules already exists
      const isBareInstall = /^(?:npm\s+install|yarn\s+install|pnpm\s+install)\s*$/i.test(step.command.trim());
      if (isBareInstall) {
        try {
          const nmUri = vscode.Uri.joinPath(this.config.workspace, 'node_modules');
          await vscode.workspace.fs.stat(nmUri);
          // node_modules exists — no need to reinstall
          console.log(`[Executor] Skipping bare install — node_modules already exists`);
          this.config.onMessage?.(`⏭ Skipped install — node_modules already exists`, 'info');
          return null;
        } catch {
          // node_modules doesn't exist — proceed with the install
        }
      }

      // Pre-check: skip npm/yarn/pnpm install for packages already in package.json
      const installMatch = step.command.match(/^(?:npm\s+install|yarn\s+add|pnpm\s+add)\s+(.+)/i);
      if (installMatch) {
        const requestedPkgs = installMatch[1]
          .split(/\s+/)
          .filter(p => p && !p.startsWith('-'))  // strip flags like --save-dev
          .map(p => p.replace(/@[^@]+$/, ''));    // strip version specifiers like pkg@1.0.0
        try {
          const pkgJsonUri = vscode.Uri.joinPath(this.config.workspace, 'package.json');
          const raw = await vscode.workspace.fs.readFile(pkgJsonUri);
          const pkgJson = JSON.parse(new TextDecoder().decode(raw)) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
          };
          const installed = new Set([
            ...Object.keys(pkgJson.dependencies ?? {}),
            ...Object.keys(pkgJson.devDependencies ?? {}),
          ]);
          const alreadyInstalled = requestedPkgs.filter(p => installed.has(p));
          const notInstalled = requestedPkgs.filter(p => !installed.has(p));
          if (notInstalled.length === 0) {
            console.log(`[Executor] Skipping install — all packages already in package.json: ${alreadyInstalled.join(', ')}`);
            this.config.onMessage?.(`⏭ Skipped install — already in package.json: ${alreadyInstalled.join(', ')}`, 'info');
            return null; // signals "skip this step" to the caller
          }
          if (alreadyInstalled.length > 0) {
            console.log(`[Executor] Partial skip — already installed: ${alreadyInstalled.join(', ')}; will install: ${notInstalled.join(', ')}`);
            // Rewrite the command to only install the missing packages
            const pm = step.command.match(/^(npm\s+install|yarn\s+add|pnpm\s+add)/i)?.[1] ?? 'npm install';
            const flags = installMatch[1].split(/\s+/).filter(p => p.startsWith('-')).join(' ');
            step = { ...step, command: `${pm} ${notInstalled.join(' ')}${flags ? ' ' + flags : ''}` };
          }
        } catch {
          // Can't read package.json — proceed normally
        }
      }
      
      // Commands that are always safe to run without confirmation:
      // - test runners (deterministic, bounded, expected in CI)
      // - type-checkers (read-only)
      // - linters (read-only or auto-fix)
      // These NEVER prompt the user — just run.
      const safeWithoutConfirmation = [
        /^(?:npx\s+)?vitest(\s+run|\s+--run|\s+[^\s]+)*$/i,         // vitest, npx vitest, vitest run
        /^(?:npx\s+)?jest(\s+--runInBand|\s+--ci|\s+[^\s]+)*$/i,    // jest, npx jest
        /^npm\s+test$/i,                                              // npm test (bare)
        /^yarn\s+test$/i,                                             // yarn test (bare)
        /^(?:npx\s+)?tsc\b.*--noEmit/i,                              // tsc --noEmit (type-check only)
        /^(?:npx\s+)?eslint\b/i,                                     // eslint
        /^(?:npx\s+)?ruff\b/i,                                       // ruff (Python linter)
        /^(?:npx\s+)?prettier\b.*--check/i,                          // prettier --check (read-only)
      ];
      const isSafeToRunDirectly = safeWithoutConfirmation.some(p => p.test(step.command.trim()));

      // For vitest/jest bare commands (no --run flag), append --run to avoid watch mode hanging
      if (isSafeToRunDirectly && /vitest|jest/i.test(step.command) && !/--run|--ci|--watch=false/i.test(step.command)) {
        step = { ...step, command: step.command.trim() + ' --run' };
        console.log(`[Executor] Appended --run to prevent watch mode: ${step.command}`);
      }

      if (isSafeToRunDirectly) {
        console.log(`[Executor] Test/lint command — running without confirmation: ${step.command}`);
        return step;
      }

      // Patterns that warrant user confirmation (potentially long-running or risky)
      const confirmationPatterns = [
        // Package install / build (can be slow or modify disk)
        /npm\s+(install|run\s+build|run\s+dev)/,
        /yarn\s+(install|add|run\s+build|run\s+dev)/,
        /pnpm\s+(install|add|run\s+build|run\s+dev)/,
        /bun\s+(install|add|run\s+build|run\s+dev)/,

        // Build tools (produce artefacts)
        /webpack|rollup/,
        /gradle|maven|make|cmake/,

        // Database/backend operations
        /migrate|seed|dump|restore|backup/,
        /docker\s+(build|run|compose)|docker-compose/,

        // Deployment & destructive git operations
        /deploy|push|merge|rebase|reset|force/,
        /git\s+(push|merge|rebase|reset|force)/,

        // Long-running server processes
        /npm\s+start|yarn\s+start|pnpm\s+start|bun\s+start/,
        /\bdev\b|\bwatch\b|\bwatch-mode\b|\bserve\b/,
      ];

      const shouldAsk = confirmationPatterns.some(pattern => pattern.test(command));
      
      if (shouldAsk) {
        console.log(`[Executor] Detected command needing confirmation: ${step.command}`);
        console.log(`[Executor] onQuestion callback exists: ${!!this.config.onQuestion}`);

        // v2.12.2: Detect package managers and use longer timeout
        // Package managers (npm, yarn, pnpm, pip, maven, gradle) often take longer to respond
        const packageManagerPattern = /npm|yarn|pnpm|pip|maven|gradle/i;
        const isPackageManager = packageManagerPattern.test(command);
        const timeoutMs = isPackageManager ? 60000 : 30000; // 60s for package managers, 30s for others

        console.log(`[Executor] v2.12.2 timeout detection: isPackageManager=${isPackageManager}, timeoutMs=${timeoutMs}`);

        const answer = await this.config.onQuestion?.(
          `About to run: \`${step.command}\`\n\nThis might take a while. Should I proceed?`,
          ['Yes, proceed', 'No, skip this step', 'Cancel execution'],
          timeoutMs
        );
        console.log(`[Executor] User answered: ${answer}`);

        // CRITICAL FIX: Check the actual answer string, not just return step
        if (answer === 'No, skip this step') {
          console.log(`[Executor] User chose to skip this step`);
          return null;
        } else if (answer === 'Cancel execution') {
          console.log(`[Executor] User chose to cancel execution`);
          throw new Error('User cancelled execution');
        } else if (answer === 'Yes, proceed') {
          console.log(`[Executor] User approved, proceeding with: ${step.command}`);
          return step; // User approved, continue with step
        } else {
          // If no answer (callback failed), default to proceeding
          console.log(`[Executor] No answer received, defaulting to proceed`);
          return step;
        }
      }
    }

    return step; // Return step to continue with normal execution
  }

  /**
   * Execute a single step
   */
  async executeStep(
    plan: TaskPlan,
    stepId: number,
    planWorkspaceUri?: vscode.Uri
  ): Promise<StepResult> {
    const stepWorkspace = planWorkspaceUri || this.config.workspace;
    const step = plan.steps.find(s => s.stepId === stepId);
    if (!step) {
      return {
        stepId,
        success: false,
        error: `Step ${stepId} not found in plan`,
        duration: 0,
        timestamp: Date.now(),
      };
    }

    // INTERCEPTOR: Silently drop steps that require human action and can't be executed.
    // Covers two cases:
    //   1. run step with no real shell command (LLM used description instead of command)
    //   2. no path + description mentions manual/visual verification
    const isEmptyRunStep = step.action === 'run' &&
      (!(step as any).command || ((step as any).command as string).trim().length === 0);
    const isManualVerification = !step.path &&
      /manual|verify|check|browser|visually/i.test(step.description);

    if (isEmptyRunStep || isManualVerification) {
      const skipOutput = `📝 Skipped (human verification): ${step.description}`;
      this.config.onStepOutput?.(stepId, skipOutput, false);
      return {
        stepId: step.stepId,
        success: true,
        output: skipOutput,
        duration: 0,
        timestamp: Date.now(),
        requiresManualVerification: true,
      };
    }

    // VALIDATOR GATE 1: Check step schema (basic validation)
    try {
      const validatedStep = validateExecutionStep(step);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Executor] Schema Violation for Step ${stepId}:`, errorMsg);
      return {
        stepId,
        success: false,
        error: errorMsg,
        duration: 0,
        timestamp: Date.now(),
      };
    }

    // VALIDATOR GATE 2: Contract Enforcement (Danh's Fix B)
    // Catch "Manual" hallucinations and missing path errors BEFORE execution

    // Pre-check: read/write/delete with no path whose description looks like manual verification
    // → auto-skip gracefully instead of failing the plan
    const isManualVerificationMisfire = (
      ['read', 'write', 'delete'].includes(step.action) &&
      (!step.path || step.path.trim().length === 0) &&
      /manual|verif|test\s+in\s+browser|check\s+in\s+browser/i.test(step.description)
    );
    if (isManualVerificationMisfire) {
      console.warn(`[Executor] Manual verification step disguised as '${step.action}' — auto-skipping: "${step.description}"`);
      this.config.onMessage?.(`📋 Manual verification (skipped by executor): ${step.description}`, 'info');
      return {
        stepId,
        success: true,
        output: `Manual verification note: ${step.description}`,
        duration: 0,
        timestamp: Date.now(),
      };
    }

    try {
      this.validateStepContract(step);
    } catch (err) {
      const contractError = err instanceof Error ? err.message : String(err);
      console.error(`[Executor] CONTRACT_VIOLATION for Step ${stepId}:`, contractError);
      return {
        stepId,
        success: false,
        error: contractError,
        duration: 0,
        timestamp: Date.now(),
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
          result = await this.executeRead(step, startTime, stepWorkspace);
          break;
        case 'write':
          result = await this.executeWrite(step, startTime, stepWorkspace);
          break;
        case 'run':
          // Ask clarification before running potentially long commands
          console.log(`[Executor] About to ask clarification for run command: ${(step as any).command}`);
          const clarifiedStep = await this.askClarification(step, '');
          console.log(`[Executor] askClarification returned: ${clarifiedStep ? 'step' : 'null'}`);
          if (clarifiedStep === null) {
            // User skipped this step — emit to UI so it's visible in the execution log
            const skipOutput = `⏭ Skipped by user: ${step.description}`;
            this.config.onStepOutput?.(stepId, skipOutput, false);
            return {
              stepId: step.stepId,
              success: true,
              output: skipOutput,
              duration: Date.now() - startTime,
              timestamp: Date.now(),
            };
          }
          result = await this.executeRun(clarifiedStep || step, startTime, stepWorkspace);
          break;
        case 'manual':
          // CONTEXT-AWARE PLANNING: Manual verification step (no automated testing)
          // Show instructions to user, mark as requiring manual action
          result = {
            stepId: step.stepId,
            success: true,
            output: `MANUAL VERIFICATION (No Test Infrastructure)\n\n${step.description}\n\nInstructions:\n${(step as any).instructions || step.path || 'Follow step requirements manually'}\n\nExpected outcome:\n${step.expectedOutcome}`,
            duration: Date.now() - startTime,
            timestamp: Date.now(),
            requiresManualVerification: true,
          };
          break;
        case 'delete':
          // Delete not yet implemented - return with helpful error
          return {
            stepId,
            success: false,
            error: `Delete action not yet implemented. Please implement executeDelete() method.`,
            duration: 0,
            timestamp: Date.now(),
          };
        default:
          // This should never happen if validator gate works
          throw new Error(
            `Schema Violation: Unknown action "${step.action}". ` +
            `Valid actions: read, write, run, delete, manual`
          );
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
   * ✅ SURGICAL REFACTOR: Pre-Flight Contract Check
   *
   * Runs BEFORE any normalization or sanitization.
   * Enforces state-aware constraints based on workspace conditions.
   *
   * ✅ SENIOR FIX: "Angrier" Executor with strict path rules
   *
   * Purpose: Catch unrecoverable contract violations early
   * - READ operations on greenfield (empty) workspaces
   * - Paths with critical formatting issues (ellipses)
   * - Paths with multiple spaces (sentences, not paths)
   * - Paths without extensions
   * - Action mismatches with workspace state
   */

  /**
   * Reorder steps based on file import dependencies (topological sort)
   * 
   * Problem: Planner generates steps in logical order, not dependency order.
   * Example: LoginForm.tsx (Step 1) imports useLoginStore (Step 3)
   * This causes validation failures because the dependency doesn't exist yet.
   *
   * Solution: Analyze import statements and reorder WRITE steps so:
   * - Store files (containing exports) are written FIRST
   * - Components (importing stores) are written AFTER  
   * - Interface files are written when first needed
   *
   * Algorithm:
   * 1. Extract all import patterns from each step's description/path
   * 2. Build dependency graph (which files import which others)
   * 3. Topological sort: dependencies first
   * 4. Return reordered steps
   */
  private reorderStepsByDependencies(steps: PlanStep[]): PlanStep[] {
    // Only reorder WRITE steps (READ/DELETE don't create dependencies)
    const writeSteps = steps.filter(s => s.action === 'write');
    const nonWriteSteps = steps.filter(s => s.action !== 'write');

    if (writeSteps.length <= 1) {
      return steps; // No reordering needed
    }

    // Build dependency map: for each write step, what other write steps does it depend on?
    const dependencies = new Map<number, Set<number>>();
    const stepDescriptions = new Map<number, { path?: string; description?: string }>();

    writeSteps.forEach((step, idx) => {
      dependencies.set(idx, new Set());
      stepDescriptions.set(idx, { path: step.path, description: step.description });
    });

    // Analyze imports in descriptions to detect dependencies
    writeSteps.forEach((step, currentIdx) => {
      const pathLower = (step.path || '').toLowerCase();
      const descLower = (step.description || '').toLowerCase();
      const fullText = `${pathLower} ${descLower}`;

      writeSteps.forEach((otherStep, otherIdx) => {
        if (currentIdx === otherIdx) {return;}

        const otherPath = (otherStep.path || '').toLowerCase();
        const otherDesc = (otherStep.description || '').toLowerCase();

        // Check if current step imports from other step
        // Look for patterns like "import from stores/useAuthStore" or "import from types/LoginFormState"
        const importPatterns = [
          `imports?.*from.*${this.getFileBaseName(otherPath)}`,
          `uses?.*${this.getFileBaseName(otherPath)}`,
          `from.*['"]([^'"]*${this.getFileBaseName(otherPath)}[^'"]*)['"]`,
        ];

        for (const pattern of importPatterns) {
          if (new RegExp(pattern, 'i').test(fullText)) {
            dependencies.get(currentIdx)?.add(otherIdx);
            break;
          }
        }

        // Also check: if other step creates "useLoginStore" and current is "LoginForm", likely dependency
        if (
          otherPath.includes('store') && !pathLower.includes('store') &&
          (pathLower.includes('component') || pathLower.includes('form'))
        ) {
          dependencies.get(currentIdx)?.add(otherIdx);
        }
      });
    });

    // Topological sort: Kahn's algorithm
    // inDegree[i] = number of prerequisites step i has (steps that must run before it)
    const inDegree = new Map<number, number>();
    writeSteps.forEach((_, idx) => {
      inDegree.set(idx, dependencies.get(idx)?.size ?? 0);
    });

    // Build reverse map: dependents[i] = set of steps that depend on step i
    const dependents = new Map<number, Set<number>>();
    writeSteps.forEach((_, idx) => { dependents.set(idx, new Set()); });
    dependencies.forEach((deps, idx) => {
      deps.forEach(prereq => { dependents.get(prereq)?.add(idx); });
    });

    const queue: number[] = [];
    inDegree.forEach((degree, idx) => {
      if (degree === 0) {queue.push(idx);}
    });

    const sorted: number[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      // Decrement in-degree for everything that depended on current
      dependents.get(current)?.forEach(dep => {
        inDegree.set(dep, (inDegree.get(dep) ?? 0) - 1);
        if (inDegree.get(dep) === 0) {
          queue.push(dep);
        }
      });
    }

    // If we couldn't sort all (cycle detected), return original order
    if (sorted.length !== writeSteps.length) {
      console.warn('[Executor] Circular dependency detected in plan steps, keeping original order');
      return steps;
    }

    // Rebuild: [sorted writes] + [non-writes in original positions where possible]
    const result: PlanStep[] = [];
    const sortedWriteSteps = sorted.map(idx => writeSteps[idx]);
    const writeIndices = new Set(steps.map((s, i) => s.action === 'write' ? i : -1).filter(i => i >= 0));
    
    let writeIdx = 0;
    for (let i = 0; i < steps.length; i++) {
      if (writeIndices.has(i)) {
        result.push(sortedWriteSteps[writeIdx++]);
      } else {
        result.push(steps[i]);
      }
    }

    return result;
  }

  /** Helper: Get base filename without path or extension */
  private getFileBaseName(filePath: string): string {
    const withoutExt = filePath.replace(/\.[^.]+$/, '');
    const parts = withoutExt.split('/');
    return parts[parts.length - 1];
  }

  /** Helper: Check if step order changed (for logging) */
  private stepsAreEqual(steps1: PlanStep[], steps2: PlanStep[]): boolean {
    if (steps1.length !== steps2.length) {return false;}
    return steps1.every((s, i) => s.stepId === steps2[i].stepId && s.path === steps2[i].path);
  }

  /**
   * Validate step dependencies (DAG: Directed Acyclic Graph)
   *
   * NEW: Dependency-Linked Schema
   * Forces LLM to explicitly state what each step depends on.
   * Prevents "smushed" steps and ensures proper sequencing.
   *
   * If Step B depends on Step A, and Step A hasn't been completed yet,
   * this throws an error to block Step B's execution.
   */
  private validateDependencies(
    step: PlanStep,
    completedStepIds: Set<string>,
    planStepIds?: Set<string>,
    planStepOrder?: string[]
  ): void {
    // Only validate if step has dependencies
    if (!step.dependsOn || step.dependsOn.length === 0) {
      return;
    }

    const currentIndex = planStepOrder ? planStepOrder.indexOf(step.id ?? '') : -1;

    // Check each dependency
    for (const depId of step.dependsOn) {
      // Skip dependencies that were filtered out of the plan before execution.
      // stripStaleDependencies in the planner should remove these, but this is the
      // executor-side safety net for any that slip through.
      if (planStepIds && !planStepIds.has(depId)) {
        console.log(`[Executor] Skipping stale dep "${depId}" on step "${step.id}" — not in current plan`);
        continue;
      }
      if (!completedStepIds.has(depId)) {
        // If we know the plan order, check whether the dep precedes this step.
        // If the dep appears AFTER this step in plan order, the topo sort failed —
        // warn and skip rather than aborting the whole plan.
        if (planStepOrder && currentIndex >= 0) {
          const depIndex = planStepOrder.indexOf(depId);
          if (depIndex > currentIndex) {
            console.warn(`[Executor] Dep "${depId}" appears after "${step.id}" in plan order — topo sort anomaly, skipping`);
            continue;
          }
        }
        throw new Error(
          `DEPENDENCY_VIOLATION: Step "${step.id}" depends on "${depId}" which hasn't been completed yet. ` +
          `Steps must be executed in dependency order. ` +
          `Check that all dependencies are satisfied before this step.`
        );
      }
    }
  }

  private preFlightCheck(step: PlanStep, workspaceExists: boolean): void {
    // ✅ GREENFIELD GUARD: No READ on empty workspace without prior WRITE
    if (!workspaceExists && step.action === 'read') {
      throw new Error(
        `GREENFIELD_VIOLATION: Cannot READ from "${step.path}" in empty workspace. ` +
        `First step must WRITE or INIT files. Are you missing a WRITE step?`
      );
    }

    // ✅ FIX 1: STRICT "NO-SPACE" RULE (Danh's Senior Fix)
    // Multiple spaces indicate sentence/description, not a valid path
    if (step.path) {
      const spaceCount = (step.path.match(/ /g) || []).length;
      if (spaceCount > 1) {
        throw new Error(
          `PATH_VIOLATION: Path "${step.path}" contains ${spaceCount} spaces. ` +
          `This looks like a sentence, not a file path. ` +
          `Use kebab-case or camelCase instead: src/components/my-component.tsx`
        );
      }
    }

    // ✅ FIX 2: STRICT EXTENSION REQUIREMENT (Danh's Senior Fix)
    // Web project paths MUST have file extensions
    if (step.path && !step.path.includes('.')) {
      throw new Error(
        `PATH_VIOLATION: Path "${step.path}" has no file extension. ` +
        `Web project paths MUST include extension (.tsx, .ts, .js, .json, etc.).`
      );
    }

    // ✅ PATH VIOLATION: Paths with ellipses are malformed
    if (step.path && step.path.includes('...')) {
      throw new Error(
        `PATH_VIOLATION: Step path contains ellipses "...": "${step.path}". ` +
        `Provide complete filename. Remove trailing prose.`
      );
    }

    // ✅ ACTION MISMATCH: If path looks like a description, reject READ
    if (step.action === 'read' && step.path && step.path.length > 80) {
      throw new Error(
        `ACTION_MISMATCH: READ action path looks like a description (too long): "${step.path.substring(0, 60)}...". ` +
        `Provide a valid file path, not a description.`
      );
    }
  }

  /**
   * ✅ SURGICAL REFACTOR: Check if workspace exists
   *
   * Determines if workspace has any files (greenfield check)
   */
  private async checkWorkspaceExists(workspaceUri: vscode.Uri): Promise<boolean> {
    try {
      const files = await vscode.workspace.fs.readDirectory(workspaceUri);
      // Workspace exists if it has ANY files
      return files.length > 0;
    } catch (error) {
      // Directory doesn't exist or is empty
      return false;
    }
  }

  /**
   * ✅ SURGICAL REFACTOR: Intelligent Strategy Switching
   *
   * When READ fails with ENOENT (file not found), suggests alternative actions:
   * - If file doesn't exist → WRITE (create it)
   * - If path looks like template → init with template
   * - Otherwise → null (can't fix)
   *
   * Returns correction signal for Executor to use in retry
   */
  private attemptStrategySwitch(
    step: PlanStep,
    error: string
  ): { message: string; suggestedAction: string; suggestedPath?: string } | null {
    // Only handle file not found errors
    if (!error.includes('ENOENT') && !error.includes('not found')) {
      return null;
    }

    // Heuristic: If trying to read a config file that doesn't exist, suggest init
    const configPatterns = ['tsconfig', 'package.json', '.eslintrc', 'jest.config', 'babel.config'];
    const isConfigFile = configPatterns.some(pattern => step.path?.includes(pattern));

    if (isConfigFile) {
      return {
        message: `Config file "${step.path}" doesn't exist. Would you like to WRITE it?`,
        suggestedAction: 'write',
        suggestedPath: step.path,
      };
    }

    // Heuristic: If trying to read a component/source file, suggest write
    const sourcePatterns = ['.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte'];
    const isSourceFile = sourcePatterns.some(ext => step.path?.endsWith(ext));

    if (isSourceFile) {
      return {
        message: `Source file "${step.path}" doesn't exist. Creating it...`,
        suggestedAction: 'write',
        suggestedPath: step.path,
      };
    }

    // Can't determine recovery strategy
    return null;
  }

  /**
   * Validate Step Contract (Danh's Fix B: Pre-Flight Check)
   *
   * Purpose: Catch interface violations BEFORE execution:
   * - "Manual" value in path or command fields (hallucination)
   * - Missing path for file-based actions
   * - Missing command for run actions
   *
   * Returns error message if contract violated, undefined if valid
   */
  private validateStepContract(step: PlanStep): void {
    // Check for "manual" hallucination in path
    if (step.path && typeof step.path === 'string') {
      if (step.path.toLowerCase().includes('manual')) {
        throw new Error(
          `CONTRACT_VIOLATION: Step "${step.description}" has path="${step.path}". ` +
          `Manual verification is not a valid executor action. ` +
          `Use action='manual' instead, or describe verification in summary.`
        );
      }
    }

    // Check for "manual" hallucination in command
    if ((step as any).command && typeof (step as any).command === 'string') {
      if ((step as any).command.toLowerCase().includes('manual')) {
        throw new Error(
          `CONTRACT_VIOLATION: Step "${step.description}" has command="${(step as any).command}". ` +
          `Manual verification is not a valid executor action.`
        );
      }
    }

    // Check for missing path on file-based actions
    if (['read', 'write', 'delete'].includes(step.action)) {
      if (!step.path || step.path.trim().length === 0) {
        throw new Error(
          `CONTRACT_VIOLATION: Action '${step.action}' requires a valid file path, but none was provided. ` +
          `Step: "${step.description}"`
        );
      }
    }

    // Contract validated - no error thrown
  }

  /**
   * ✅ LIBERAL PATH SANITIZER (Danh's Fix B)
   * Strips common Qwen 7b artifacts from LLM-generated paths:
   * - Trailing ellipses (..., ..)
   * - Accidental quotes and backticks
   * - Trailing commas and semicolons
   * - Placeholder paths (/path/to/ → src/)
   */
  private sanitizePath(path: string): string {
    if (!path || typeof path !== 'string') {return path;}

    // Remove trailing ellipses
    let cleaned = path.replace(/\.{2,}$/, '');

    // Remove accidental quotes and backticks
    cleaned = cleaned.replace(/^[`'"]|[`'"]$/g, '');

    // Remove trailing commas and semicolons
    cleaned = cleaned.replace(/[,;]$/, '');

    // Normalize placeholder paths
    // Convert /path/to/filename.tsx → src/filename.tsx
    cleaned = cleaned.replace(/^\/path\/to\//, 'src/');

    // Trim whitespace
    cleaned = cleaned.trim();

    if (cleaned !== path) {
      console.log(`[Executor] Path sanitized: "${path}" → "${cleaned}"`);
    }

    return cleaned;
  }

  /**
   * Execute /read step: Read file from workspace
   * Handles both individual files and directory structures (including globs like examples/**)
   */
  private async executeRead(
    step: PlanStep,
    startTime: number,
    workspace?: vscode.Uri
  ): Promise<StepResult> {
    // CONTEXT-AWARE PLANNING: Add diagnostic logging for debugging
    console.log(`[Executor.executeRead] Step details:`, {
      stepId: step.stepId,
      action: step.action,
      path: step.path,
      targetFile: (step as any).targetFile,
      command: (step as any).command,
      description: step.description,
    });

    if (!step.path) {
      // Fallback: Check targetFile property
      if ((step as any).targetFile) {
        (step as any).path = (step as any).targetFile;
      } else {
        // No path found - log detailed error for debugging
        console.error(`[Executor.executeRead] CRITICAL: No path in READ step`, {
          step,
          keys: Object.keys(step),
        });
        throw new Error(
          `Read step requires path. Step received: ${JSON.stringify({
            action: step.action,
            description: step.description,
            stepId: step.stepId,
          })}`
        );
      }
    }

    // CRITICAL FIX: Use workspace from plan, not just this.config.workspace
    const workspaceUri = workspace || this.config.workspace;
    const filePath = vscode.Uri.joinPath(workspaceUri, step.path);
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
   * CRITICAL: Extract and store file contract after successful write
   * This allows subsequent steps to use the ACTUAL API that was created,
   * not a guessed API or calculated import paths
   * 
   * Runs AFTER file write succeeds, extracts real exports for validation/injection
   */
  private async extractAndStoreContract(
    filePath: string,
    content: string,
    stepId: number,
    workspace: vscode.Uri
  ): Promise<void> {
    try {
      // Only extract contracts for code files
      const ext = filePath.split('.').pop()?.toLowerCase();
      if (!['ts', 'tsx', 'js', 'jsx'].includes(ext || '')) {
        return;
      }

      // ZUSTAND STORES: Extract hook and state shape
      const zustandMatch = content.match(/export\s+const\s+(use\w+)\s*=\s*create[<\(]/i);
      if (zustandMatch) {
        const [, hookName] = zustandMatch;
        
        // Extract state properties: look for patterns like "email: ...", "password: ...", etc
        const propsMatch = content.match(/\{\s*([^}]+?(?::[^,}]+[,]?)*)\s*\}/);
        const stateProps: string[] = [];
        
        if (propsMatch) {
          // Split by comma and extract property names
          const propLines = propsMatch[1].split(',');
          for (const line of propLines) {
            const match = line.match(/^\s*(\w+)\s*:/);
            if (match) {
              stateProps.push(match[1]);
            }
          }
        }

        // Store contract for later injection
        const contract = {
          type: 'zustand-store',
          hookName,
          filePath,
          stateProps,
          importStatement: `import { ${hookName} } from './${filePath.split('/').pop()?.replace(/\.(ts|tsx|js|jsx)$/, '')}'`,
          relativeImportExample: `import { ${hookName} } from '../stores/${filePath.split('/').pop()?.replace(/\.(ts|tsx|js|jsx)$/, '')}';`,
          usageExample: `const { ${stateProps.slice(0, 3).join(', ')}${stateProps.length > 3 ? ', ...' : ''} } = ${hookName}();`,
          description: `**Zustand Store**: ${hookName}\n   Exports: ${stateProps.join(', ')}\n   Usage: const {...} = ${hookName}()`
        };

        // Store in plan results metadata
        if (!this.plan) {return;}
        if (!this.plan.results) {this.plan.results = new Map();}
        
        const stepResult = this.plan.results.get(stepId);
        if (stepResult) {
          (stepResult as any).contract = contract;
          console.log(`[Executor] ✅ Stored Zustand contract for Step ${stepId}: ${hookName}`);
          console.log(`  Exports: ${stateProps.join(', ')}`);
        }
        return;
      }

      // UTILITIES/HELPERS: Extract all exports
      const exportMatches = content.match(/export\s+(?:const|function|interface|type)\s+(\w+)/g) || [];
      if (exportMatches.length > 0) {
        const exports = exportMatches.map(m => m.replace(/export\s+(?:const|function|interface|type)\s+/, ''));
        
        const contract = {
          type: 'utility',
          exports,
          filePath,
          description: `**Utility**: ${exports.join(', ')}`
        };

        // Store in plan results metadata
        if (!this.plan) {return;}
        if (!this.plan.results) {this.plan.results = new Map();}
        
        const stepResult = this.plan.results.get(stepId);
        if (stepResult) {
          (stepResult as any).contract = contract;
          console.log(`[Executor] ✅ Stored utility contract for Step ${stepId}: ${exports.join(', ')}`);
        }
      }
    } catch (error) {
      // Don't fail the step if contract extraction fails
      console.warn(`[Executor] Failed to extract contract for ${filePath}: ${error}`);
    }
  }

  /**
   * Execute /write step: Generate content and write to file
   * Streams generated content back to callback
   */
  private async executeWrite(
    step: PlanStep,
    startTime: number,
    workspace?: vscode.Uri
  ): Promise<StepResult> {
    if (!step.path) {
      throw new Error('Write step requires path');
    }

    // CRITICAL FIX: Use workspace from plan, not just this.config.workspace
    const workspaceUri = workspace || this.config.workspace;

    // Check if this is a risky write operation that warrants confirmation
    if (this.shouldAskForWrite(step.path)) {
      console.log(`[Executor] Detected risky write to: ${step.path}`);
      console.log(`[Executor] onQuestion callback exists: ${!!this.config.onQuestion}`);

      const answer = await this.config.onQuestion?.(
        `About to write to important file: \`${step.path}\`\n\nThis is a critical configuration or data file. Should I proceed with writing?`,
        ['Yes, write the file', 'No, skip this step', 'Cancel execution'],
        30000 // Standard timeout for write confirmation
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
    // CONTRACT INJECTION: Inject step description as source of truth for intent
    let prompt = step.prompt || `Generate appropriate content for ${step.path} based on its name.`;

    // CRITICAL: Use step.description as primary requirement (intent preservation)
    // This bridges the planning → execution gap by injecting the actual requirement
    const intentRequirement = step.description
      ? `REQUIREMENT: ${step.description}\n\n`
      : '';

    // MULTI-STEP CONTEXT INJECTION WITH FILE CONTRACTS
    // This prevents duplicate stores, unused imports, and pseudo-refactoring
    // KEY ENHANCEMENT: Include actual exported APIs from previous files
    let multiStepContext = '';
    if (this.plan && step.stepId > 1) {
      const previouslyCreatedFiles: string[] = [];
      const completedSteps = new Map(this.plan.results || new Map());
      
      // Collect files created in previous steps
      for (let i = 1; i < step.stepId; i++) {
        const prevStep = this.plan.steps.find(s => s.stepId === i);
        const prevResult = completedSteps.get(i);
        
        if (prevStep && prevResult && prevResult.success && prevStep.action === 'write') {
          previouslyCreatedFiles.push(prevStep.path);
        }
      }
      
      if (previouslyCreatedFiles.length > 0) {
        // ✅ CRITICAL: Use STORED CONTRACTS from previous steps (actual APIs)
        // NOT calculated/guessed paths
        const fileContracts: string[] = [];
        const requiredImports: string[] = [];
        const storedContracts: any[] = [];
        
        for (let i = 1; i < step.stepId; i++) {
          const prevResult = this.plan.results?.get(i);
          if (prevResult && (prevResult as any).contract) {
            storedContracts.push((prevResult as any).contract);
          }
        }

        // ✅ If we have stored contracts, use them (actual APIs that were created)
        if (storedContracts.length > 0) {
          console.log(`[Executor] ✅ Using ${storedContracts.length} stored contract(s) from previous steps`);
          
          for (const contract of storedContracts) {
            if (contract.type === 'zustand-store') {
              // Zustand store contract
              fileContracts.push(`📦 **Zustand Store** - \`${contract.filePath}\`
   - Hook name: \`${contract.hookName}\`
   - Exports: \`${contract.stateProps.join(', ')}\`
   - Usage: \`const { ${contract.stateProps.slice(0, 3).join(', ')}${contract.stateProps.length > 3 ? ', ...' : ''} } = ${contract.hookName}()\`
   - Example import: \`${contract.relativeImportExample}\``);
              
              // Add import statement (use relative import from target file's perspective)
              requiredImports.push(contract.relativeImportExample);
            } else if (contract.type === 'utility') {
              // Utility/Helper export
              fileContracts.push(`🛠️ **Utility** - \`${contract.filePath}\`
   - Exports: \`${contract.exports.join(', ')}\``);
            }
          }
        } else {
          // Fallback: extract contracts dynamically (same as before)
          console.log(`[Executor] ℹ️ No stored contracts found, extracting dynamically...`);
          
          for (const filePath of previouslyCreatedFiles) {
            try {
              const contract = await this.extractFileContract(filePath, workspace || this.config.workspace);
              fileContracts.push(contract);
              
              // CRITICAL FIX: Generate exact relative import paths
              // Calculate the import statement for this file from the current file's perspective
              const importStmt = this.calculateImportStatement(step.path, filePath);
              if (importStmt) {
                requiredImports.push(importStmt);
              }
            } catch {
              // Fallback if contract extraction fails
              fileContracts.push(`📄 **File** - \`${filePath}\``);
            }
          }
        }

        // Build the multiStepContext with both contracts and required imports
        let importSection = '';
        if (requiredImports.length > 0) {
          importSection = `## REQUIRED IMPORTS
You MUST start your file with these EXACT import statements (copy-paste):

\`\`\`typescript
${requiredImports.join('\n')}
\`\`\`

These are ${storedContracts.length > 0 ? 'extracted from files created in previous steps' : 'calculated based on actual file paths'}. Do NOT modify them.
Do NOT create your own import paths - use EXACTLY what's shown above.

`;
        }

        multiStepContext = `${importSection}## CONTEXT: Related Files Already Created
The following files were created in previous steps. Use their exported APIs as shown below.

${fileContracts.join('\n\n')}

CRITICAL INTEGRATION RULES:
1. Start with the REQUIRED IMPORTS shown above (copy them exactly)
2. Use ONLY the APIs and exports documented above - do NOT invent new API calls
3. For Zustand stores: Use ONLY the methods/properties exported (do NOT guess at other properties)
4. Do NOT create duplicate stores/utilities if they already exist above
5. Do NOT create inline implementations if a shared file already exists

`;
        console.log(`[Executor] ℹ️ Injecting multi-step context: ${fileContracts.length} file contract(s), ${requiredImports.length} import(s)`);
      }
    }

    // GOLDEN TEMPLATE INJECTION: For known files, inject exact template to copy
    let goldenTemplateSection = '';
    const fileName = step.path.split('/').pop() || '';
    if (fileName === 'cn.ts' || fileName === 'cn.js') {
      goldenTemplateSection = `GOLDEN TEMPLATE (copy this exactly - do NOT modify):
\`\`\`typescript
${GOLDEN_TEMPLATES.CN_UTILITY}
\`\`\`

Your ONLY job: Output this code exactly. Do NOT modify it.

`;
      console.log(`[Executor] ✅ Injecting golden template for ${fileName}`);
    }

    // REACT IMPORTS INJECTION: For single-step React components, explicitly require React imports
    // This prevents the LLM from generating hooks without importing them
    let reactImportsSection = '';
    const isReactComponent = step.path.endsWith('.tsx') || step.path.endsWith('.jsx');
    if (isReactComponent && !multiStepContext) {
      // Only inject if this is a single-step plan (no multiStepContext already added)
      // Multi-step plans handle imports differently
      reactImportsSection = `## REQUIRED REACT IMPORTS

RULE: All React imports MUST be in a SINGLE combined import statement. NEVER split across multiple lines.

WRONG (two separate import lines — will fail validation):
  import React from 'react';
  import { useState, FormEvent } from 'react';

RIGHT (one merged import line):
  import React, { useState, FormEvent, FormEventHandler } from 'react';

Include in the single import: React (default), plus every named export you use (useState, useEffect, FormEvent, FormEventHandler, useCallback, useRef, etc.).

`;
      console.log(`[Executor] ✅ Injecting required React imports for ${fileName}`);
    }

    // FORM COMPONENT PATTERN INJECTION
    let formPatternSection = '';
    const isFormComponent = fileName.includes('Form');
    if (isFormComponent) {
      formPatternSection = `
## REQUIRED: Form Component Patterns

1. **State Interface** - Define typed state: interface LoginFormState { email: string; password: string; }
2. **Event Typing** - Use FormEventHandler for submit, FormEvent for inputs:
   - Input: const handleChange = (event: FormEvent<HTMLInputElement>) => { const { name, value } = event.currentTarget; ... }
   - Form: const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => { event.preventDefault(); ... }
3. **Consolidator Pattern** - Single handleChange: setFormData(prev => ({ ...prev, [name]: value }))
4. **Submit Handler** - onSubmit on the form element: <form onSubmit={handleSubmit}>
5. **Controlled Inputs** - Every input MUST have both value AND onChange: <input value={formData.email} onChange={handleChange} name="email" />

CRITICAL RULES:
- DO NOT use Zod, yup, or any external validation library
- Only add validation (email format checks, length checks) if the REQUIREMENT explicitly requests it
- Keep form logic lean — implement only what the REQUIREMENT describes

IMPORT vs RE-DEFINE:
- If an Input component already exists in the workspace (e.g. src/components/Input.tsx), import it:
  import { Input } from './Input';
- NEVER write a local Input interface or mock component inside the form file
- NEVER write a comment like "// Assuming Input exists in scope" and then define it locally — either import it or use a plain HTML <input> element
- If the REQUIREMENT does not mention creating a new Input component, do NOT create one

`;
    }

    // PROJECT PROFILE CONSTRAINTS: Inject detected project conventions as hard rules
    let profileConstraintsSection = '';
    if (this.config.projectProfile) {
      const constraints = this.config.projectProfile.getGenerationConstraints();
      if (constraints) {
        profileConstraintsSection = `\n${constraints}\n`;
        console.log(`[Executor] ✅ Injecting project profile constraints for ${fileName}`);
      }
    }

    // Interactive component constraint block: injected for Button, Input, Select, etc.
    const interactiveComponentPattern = /\/(Button|Input|Select|Textarea|Checkbox|Radio|Toggle|Switch|Slider)\.[tj]sx?$/i;
    const isInteractiveComponent = interactiveComponentPattern.test(step.path);
    const componentName = step.path.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Component';
    // Map component name to the correct HTML element type for forwardRef generics
    const htmlElementType = /input/i.test(componentName) ? 'HTMLInputElement'
      : /select/i.test(componentName) ? 'HTMLSelectElement'
      : /textarea/i.test(componentName) ? 'HTMLTextAreaElement'
      : 'HTMLButtonElement';
    const htmlTag = /input/i.test(componentName) ? 'input'
      : /select/i.test(componentName) ? 'select'
      : /textarea/i.test(componentName) ? 'textarea'
      : 'button';
    const interactiveComponentSection = isInteractiveComponent
      ? `\nINTERACTIVE COMPONENT RULES (mandatory — interactive elements MUST support refs):\n` +
        `- MUST use React.forwardRef exported directly: export const ${componentName} = React.forwardRef<${htmlElementType}, ${componentName}Props>(({ ...props }, ref) => { return <${htmlTag} ref={ref} {...props} />; });\n` +
        `- MUST set displayName: ${componentName}.displayName = '${componentName}';\n` +
        `- MUST return JSX — the component body MUST contain a return statement with a JSX element (e.g. <${htmlTag} ...>). Never return a plain string or cn() call.\n` +
        `- NEVER use an internal alias: do NOT write \`const ${componentName}Inner = ...\` then \`export const ${componentName} = ${componentName}Inner\` or \`export const ${componentName} = ${componentName}\`. Export forwardRef directly.\n\n`
      : '';

    // Hook-specific constraint block: injected when the target file is a hook (.ts in hooks/)
    const isHookTarget = /[\\/]hooks[\\/][^/]+\.ts$/.test(step.path) && !step.path.endsWith('.tsx');
    const hookConstraintSection = isHookTarget
      ? `\nHOOK FILE RULES (mandatory — hooks are pure logic, no styling):\n` +
        `- NEVER import cn, clsx, classnames, or any CSS/style utility — hooks have no className\n` +
        `- NEVER import React UI primitives (Button, Input, etc.) — hooks return state/callbacks only\n` +
        `- Only import: React hooks (useState, useCallback, useEffect, useRef), types, and domain utilities\n` +
        `- RETURN CONTRACT: The return object MUST expose ALL managed state values AND their manipulation functions.\n` +
        `  WRONG: return { increment, decrement, reset }  — hides the count value from the consumer\n` +
        `  RIGHT:  return { count, increment, decrement, reset }  — count is the primary value, always expose it\n` +
        `  Rule: every piece of state created with useState MUST appear in the return object.\n\n`
      : '';

    // Add instruction to output ONLY code, no explanations
    // Detect file type from extension
    const fileExtension = step.path.split('.').pop()?.toLowerCase();
    const isCodeFile = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'json', 'yml', 'yaml', 'html', 'css', 'sh'].includes(fileExtension || '');

    if (isCodeFile) {
      prompt = `You are generating code for a SINGLE file: ${step.path}

${intentRequirement}${reactImportsSection}${multiStepContext}${formPatternSection}${goldenTemplateSection}${profileConstraintsSection}${hookConstraintSection}${interactiveComponentSection}STRICT REQUIREMENTS:
1. Implement the exact logic described in the REQUIREMENT above
2. Output ONLY valid, executable code for this file
3. NO markdown backticks, NO code blocks, NO explanations
4. NO documentation, NO comments about what you're doing
5. NO instructions for other files
6. Start with the first line of code immediately
7. End with the last line of code
8. Every line must be syntactically valid for a ${fileExtension} file
9. This code will be parsed as pure code - nothing else matters
10. Validate: Does this code fulfill the REQUIREMENT stated above?
${multiStepContext ? '11. Integration Check: Does this code properly use/import files mentioned in CONTEXT above?' : ''}
SCOPE CONSTRAINT (mandatory): Implement ONLY what the REQUIREMENT explicitly describes.
- If the REQUIREMENT says "variant prop supporting primary and secondary", output EXACTLY those two variants — no size prop, no loading state, no icon slot, no extra variants.
- Every prop, state variable, or feature NOT mentioned in the REQUIREMENT is OUT OF SCOPE and must be omitted.
- Do NOT add implicit bounds, clamping (Math.max/Math.min), guard clauses, or validation unless the REQUIREMENT explicitly asks for them. "decrement" means subtract 1 — not "subtract 1 but clamp at 0".
- Adding unrequested features is a spec violation. When in doubt, do less.

TAILWIND STYLE RULE (mandatory): Do NOT extract Tailwind class strings into intermediate variables.
- WRONG: const paddingStyle = 'px-4 py-2';  cn(paddingStyle, variantClasses[variant], className)
- RIGHT: cn('px-4 py-2 text-sm font-medium', variantClasses[variant], className)
- Intermediate const variables for single class strings are dead indirection — inline them directly in cn().

Example format (raw code, nothing else):
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({...});
export function MyComponent() {...}

Do NOT include: backticks, markdown, explanations, other files, instructions`;
    }

    // Architect pre-flight: generate task-specific acceptance criteria before code generation.
    // Criteria are injected into the Executor prompt (so the generator knows what will be checked)
    // AND passed to the Reviewer (llmValidate) for structured YES/NO validation after generation.
    const acceptanceCriteria = await this.generateAcceptanceCriteria(step);

    // Inject criteria into the generation prompt so the Executor satisfies them upfront
    if (acceptanceCriteria.length > 0) {
      const criteriaBlock =
        '\nACCEPTANCE CRITERIA (Reviewer will check each — your code MUST satisfy all):\n' +
        acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n') + '\n';
      prompt += criteriaBlock;
    }

    // Emit that we're generating content
    this.config.onStepOutput?.(step.stepId, `📝 Generating ${step.path}...`, false);

    const response = await this.config.llmClient.sendMessage(prompt);
    if (!response.success) {
      throw new Error(response.error || 'LLM request failed');
    }

    const filePath = vscode.Uri.joinPath(workspaceUri, step.path);

    try {
      // Extract content and clean up if it's code
      let content = response.message || '';

      // DETECTION: Check if LLM ignored instructions and provided markdown/documentation
      const hasMarkdownBackticks = content.includes('```');
      const hasExcessiveComments = (content.match(/^\/\//gm) || []).length > 5; // More than 5 comment lines at start
      const hasMultipleFileInstructions = (content.match(/\/\/\s*(Create|Setup|In|Step|First|Then|Next|Install)/gi) || []).length > 2;
      const hasYAMLOrConfigMarkers = content.includes('---') || content.includes('package.json') || content.includes('tsconfig');

      if (hasMarkdownBackticks) {
        // LLM wrapped code in markdown - extract it
        const codeBlockMatch = content.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/);
        if (codeBlockMatch) {
          content = codeBlockMatch[1];
        }
      }

      if (isCodeFile && (hasExcessiveComments || hasMultipleFileInstructions || hasYAMLOrConfigMarkers)) {
        // LLM provided documentation/setup instructions instead of just code
        // This will be caught by validation as unparseable, triggering auto-fix
        this.config.onMessage?.(
          `⚠️ Warning: LLM provided documentation/setup instructions instead of executable code. Validation will catch this.`,
          'info'
        );
      }

      // For code files, try to extract just the code portion
      if (isCodeFile && !hasMarkdownBackticks) {
        // Remove common explanation patterns (but preserve code)
        content = content
          .replace(/^[\s\S]*?(?=^import|^export|^const|^function|^class|^interface|^type|^\/\/)/m, '') // Remove text before first code line
          .replace(/\n\n\n[#\-\*\s]*Installation[\s\S]*?(?=\n\n|$)/i, '') // Remove Installation sections
          .replace(/\n\n\n[#\-\*\s]*Setup[\s\S]*?(?=\n\n|$)/i, '') // Remove Setup sections
          .trim();
      }

      // ============================================================================
      // GATEKEEPER: Validate code BEFORE writing to disk
      // LLM output is a PROPOSAL, not final. Must pass validation gates before committing.
      // ============================================================================

      let finalContent = content;

      if (['ts', 'tsx', 'js', 'jsx'].includes(fileExtension || '')) {
        this.config.onMessage?.(
          `🔍 Validating ${step.path}...`,
          'info'
        );

        const validationResult = await this.validateGeneratedCode(step.path, content, step, acceptanceCriteria);

        // ✅ FIX: Separate critical errors from soft suggestions
        const { critical: criticalErrors, suggestions: softSuggestions } = this.filterCriticalErrors(
          validationResult.errors,
          true // verbose: log suggestions as warnings
        );

        if (criticalErrors.length === 0) {
          // ✅ No critical errors - validation passed!
          // (Soft suggestions are logged but not blocking)
          this.config.onMessage?.(
            `✅ Validation passed for ${step.path}`,
            'info'
          );
          finalContent = content;
        } else {
          // ❌ CRITICAL ERRORS FOUND - Try auto-correction up to MAX_VALIDATION_ITERATIONS
          let validationAttempt = 1;
          let currentContent = content;
          let lastCriticalErrors = criticalErrors;
          let loopDetected = false;
          const previousErrors: string[] = [];

          while (validationAttempt <= this.MAX_VALIDATION_ITERATIONS && !loopDetected) {
            const errorList = lastCriticalErrors.map((e, i) => `  ${i + 1}. ${e}`).join('\n');

            this.config.onMessage?.(
              `❌ Critical validation errors (attempt ${validationAttempt}/${this.MAX_VALIDATION_ITERATIONS}) for ${step.path}:\n${errorList}`,
              'error'
            );

            // LOOP DETECTION: Check if same errors are repeating
            if (previousErrors.length > 0 && JSON.stringify(lastCriticalErrors.sort()) === JSON.stringify(previousErrors.sort())) {
              this.config.onMessage?.(
                `🔄 LOOP DETECTED: Same validation errors appearing again - stopping auto-correction to prevent infinite loop`,
                'error'
              );
              loopDetected = true;
              break;
            }
            previousErrors.push(...lastCriticalErrors);

            // If last attempt, give up
            if (validationAttempt === this.MAX_VALIDATION_ITERATIONS) {
              const remainingErrors = lastCriticalErrors.map((e, i) => `  ${i + 1}. ${e}`).join('\n');
              this.config.onMessage?.(
                `❌ Max validation attempts (${this.MAX_VALIDATION_ITERATIONS}) reached. Remaining issues:\n${remainingErrors}\n\nPlease fix manually in the editor.`,
                'error'
              );
              throw new Error(`Validation failed after ${this.MAX_VALIDATION_ITERATIONS} attempts.\n${remainingErrors}`);
            }

            // Attempt auto-correction
            this.config.onMessage?.(
              `🔧 Attempting auto-correction (attempt ${validationAttempt}/${this.MAX_VALIDATION_ITERATIONS})...`,
              'info'
            );

            // ✅ FIX: Only pass CRITICAL errors to auto-correction, not soft suggestions
            const canAutoFix = SmartAutoCorrection.isAutoFixable(lastCriticalErrors);
            let correctedContent: string;

            if (canAutoFix) {
              // Try smart auto-correction first
              this.config.onMessage?.(
                `🧠 Attempting smart auto-correction (circular imports, missing/unused imports, etc.)...`,
                'info'
              );
              const ragResolver = (this.config.codebaseIndex && this.config.embeddingClient)
                ? (name: string) => this.config.codebaseIndex!.resolveExportSource(name, this.config.embeddingClient!)
                : () => Promise.resolve(null);
              const smartFixed = await SmartAutoCorrection.fixCommonPatternsAsync(
                currentContent, lastCriticalErrors, ragResolver, step.path
              );

              // 🔴 CRITICAL: Try Zustand mismatch fix if component imports from stores
              let zustandFixed = smartFixed;
              if (smartFixed.match(/from\s+['"]([^'\"]*stores[^'\"]*)['\"]/) && lastCriticalErrors.some(e => e.includes('Zustand'))) {
                this.config.onMessage?.(
                  `🛠️ Attempting Zustand-specific fix (matching component to store exports)...`,
                  'info'
                );
                
                // Try to find and read the store file
                const storeImportMatch = smartFixed.match(/from\s+['"]([^'\"]*stores[^'\"]*)['\"]/);
                if (storeImportMatch) {
                  const storeImportPath = storeImportMatch[1];
                  const storeFilePath = vscode.Uri.joinPath(workspaceUri, storeImportPath.replace(/^\.\//, 'src/').replace(/^\.\.\//, ''));
                  
                  try {
                    const storeData = await vscode.workspace.fs.readFile(storeFilePath);
                    const storeCode = new TextDecoder().decode(storeData);
                    zustandFixed = SmartAutoCorrection.fixZustandComponentFromStore(smartFixed, storeCode);
                    
                    if (zustandFixed !== smartFixed) {
                      this.config.onMessage?.(
                        `✅ Applied Zustand mismatch fix`,
                        'info'
                      );
                    }
                  } catch (storeReadErr) {
                    // Store file not found yet - will be created in later step
                    console.warn('[Executor] Store file not yet available for Zustand mismatch fix');
                  }
                }
              }

              // Validate the fixed code - only check CRITICAL errors
              const smartValidation = await this.validateGeneratedCode(step.path, zustandFixed, step, acceptanceCriteria);
              const { critical: criticalAfterFix, suggestions: suggestionsAfterFix } = this.filterCriticalErrors(
                smartValidation.errors,
                false // Don't spam logs during auto-correction
              );

              if (criticalAfterFix.length === 0) {
                // ✅ Smart fix worked! (No more critical errors)
                this.config.onMessage?.(
                  `✅ Smart auto-correction successful! Fixed: ${lastCriticalErrors.slice(0, 2).map(e => e.split(':')[0]).join(', ')}${lastCriticalErrors.length > 2 ? ', ...' : ''}`,
                  'info'
                );
                // Log any remaining suggestions
                if (suggestionsAfterFix.length > 0) {
                  this.config.onMessage?.(
                    `⚠️ Remaining suggestions: ${suggestionsAfterFix.map(s => s.replace(/⚠️/g, '').trim()).join('; ')}`,
                    'info'
                  );
                }
                correctedContent = zustandFixed;
              } else {
                // ❌ Smart fix didn't fully work, fall back to LLM with ONLY CRITICAL ERRORS
                this.config.onMessage?.(
                  `⚠️ Smart fix incomplete, using LLM for context-aware correction...`,
                  'info'
                );
                // ✅ FIX: Only send CRITICAL errors to LLM, not soft suggestions
                // Format errors with context and specific guidance for the LLM
                const formattedErrors = lastCriticalErrors.map((e, i) => {
                  // For hook errors, add specific guidance
                  if (e.includes('Hook') && e.includes('imported but never called')) {
                    const hookMatch = e.match(/Hook '(\w+)'/);
                    const hookName = hookMatch ? hookMatch[1] : 'hook';
                    return `${i + 1}. ${e}\n   ACTION: Remove the unused import OR use the hook. If using the hook, call it like: const [state, setState] = ${hookName}(initialValue);`;
                  }
                  return `${i + 1}. ${e}`;
                }).join('\n');
                
                const fixPrompt = `The following code for ${step.path} has CRITICAL validation errors that MUST be fixed.\n\nCURRENT CODE:\n${currentContent}\n\nERRORS TO FIX:\n${formattedErrors}\n\nFix ONLY the listed errors. Keep all existing JSX structure, imports, and logic intact. IMPORTANT: Never introduce an internal alias re-export (e.g. \`const X = forwardRef(...); export const X = X;\` is WRONG — export forwardRef directly: \`export const X = forwardRef(...)\`). Provide ONLY the corrected code. No explanations, no markdown. Start with the code immediately.`;

                const fixResponse = await this.config.llmClient.sendMessage(fixPrompt);
                if (!fixResponse.success) {
                  throw new Error(`Auto-correction attempt failed: ${fixResponse.error || 'LLM error'}`);
                }

                correctedContent = fixResponse.message || '';
                const codeBlockMatch = correctedContent.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/);
                if (codeBlockMatch) {
                  correctedContent = codeBlockMatch[1];
                }
              }
            } else {
              // Complex errors that need LLM
              this.config.onMessage?.(
                `🤖 Using LLM for context-aware correction (complex errors detected)...`,
                'info'
              );
              // ✅ FIX: Only send CRITICAL errors to LLM
              // Format errors with context and specific guidance for the LLM
              const formattedErrors = lastCriticalErrors.map((e, i) => {
                // For hook errors, add specific guidance
                if (e.includes('Hook') && e.includes('imported but never called')) {
                  const hookMatch = e.match(/Hook '(\w+)'/);
                  const hookName = hookMatch ? hookMatch[1] : 'hook';
                  return `${i + 1}. ${e}\n   ACTION: Remove the unused import OR use the hook. If using the hook, call it like: const [state, setState] = ${hookName}(initialValue);`;
                }
                return `${i + 1}. ${e}`;
              }).join('\n');

              const fixPrompt = `The following code for ${step.path} has CRITICAL validation errors that MUST be fixed.\n\nCURRENT CODE:\n${currentContent}\n\nERRORS TO FIX:\n${formattedErrors}\n\nFix ONLY the listed errors. Keep all existing JSX structure, imports, and logic intact. IMPORTANT: Never introduce an internal alias re-export (e.g. \`const X = forwardRef(...); export const X = X;\` is WRONG — export forwardRef directly: \`export const X = forwardRef(...)\`). Provide ONLY the corrected code. No explanations, no markdown. Start with the code immediately.`;

              const fixResponse = await this.config.llmClient.sendMessage(fixPrompt);
              if (!fixResponse.success) {
                throw new Error(`Auto-correction attempt failed: ${fixResponse.error || 'LLM error'}`);
              }

              correctedContent = fixResponse.message || '';
              const codeBlockMatch = correctedContent.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/);
              if (codeBlockMatch) {
                correctedContent = codeBlockMatch[1];
              }
            }

            // Re-validate the corrected code - only check CRITICAL errors
            const nextValidation = await this.validateGeneratedCode(step.path, correctedContent, step, acceptanceCriteria);
            const { critical: nextCritical, suggestions: nextSuggestions } = this.filterCriticalErrors(
              nextValidation.errors,
              false // Don't spam logs during loops
            );

            if (nextCritical.length === 0) {
              // ✅ Auto-correction succeeded
              this.config.onMessage?.(
                `✅ Auto-correction successful on attempt ${validationAttempt}! Code now passes all critical validation checks.`,
                'info'
              );
              if (nextSuggestions.length > 0) {
                this.config.onMessage?.(
                  `⚠️ Remaining suggestions: ${nextSuggestions.map(s => s.replace(/⚠️/g, '').trim()).join('; ')}`,
                  'info'
                );
              }
              finalContent = correctedContent;
              break;
            }

            // Validation still failing - prepare for next iteration
            currentContent = correctedContent;
            lastCriticalErrors = nextCritical;
            validationAttempt++;
          }

          if (loopDetected) {
            throw new Error(`Validation loop detected - infinite correction cycle prevented. Please fix manually.`);
          }
        }
      } else {
        // ✅ Non-code files (JSON, YAML, etc) - skip validation for now
        this.config.onMessage?.(
          `✅ Skipping validation for non-code file ${step.path}`,
          'info'
        );
        finalContent = content;
      }

      // Show preview of final (validated) content
      if (this.config.onStepOutput && finalContent.length > 0) {
        const preview = finalContent.length > 200
          ? `\`\`\`${fileExtension || ''}\n${finalContent.substring(0, 200)}...\n\`\`\``
          : `\`\`\`${fileExtension || ''}\n${finalContent}\n\`\`\``;
        this.config.onStepOutput(step.stepId, preview, false);
      }

      // PRE-WRITE ARCHITECTURE VALIDATION (Phase 3.4.6)
      // Check if code violates layer-based architecture rules before writing
      const archValidator = new ArchitectureValidator();
      const archValidation = archValidator.validateAgainstLayer(finalContent, step.path);

      if (archValidation.hasViolations) {
        const report = archValidator.generateErrorReport(archValidation);
        this.config.onMessage?.(report, 'error');

        if (archValidation.recommendation === 'skip') {
          // High-severity violations - skip this file
          this.config.onMessage?.(
            `⏭️ Skipping ${step.path} due to architecture violations. Plan will continue with other files.`,
            'info'
          );
          return {
            stepId: step.stepId,
            success: true, // Return success so plan continues
            output: `Skipped (architecture violations): ${step.path}`,
            duration: Date.now() - startTime,
          };
        } else if (archValidation.recommendation === 'fix') {
          // Medium-severity violations - try to fix with LLM
          this.config.onMessage?.(
            `🔧 Attempting to fix architecture violations...`,
            'info'
          );

          const violationDesc = archValidation.violations
            .map(v => `- ${v.type}: ${v.message}\n  Suggestion: ${v.suggestion}`)
            .join('\n');

          const fixPrompt = `The code you generated has ARCHITECTURE VIOLATIONS in ${step.path}:\n\n${violationDesc}\n\nPlease FIX these violations and provide ONLY the corrected code. No explanations, no markdown.`;

          const fixResponse = await this.config.llmClient.sendMessage(fixPrompt);
          if (fixResponse.success) {
            let fixedContent = fixResponse.message || finalContent;
            const codeBlockMatch = fixedContent.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/);
            if (codeBlockMatch) {
              fixedContent = codeBlockMatch[1];
            }

            // Re-validate the fixed code
            const revalidation = archValidator.validateAgainstLayer(fixedContent, step.path);
            if (!revalidation.hasViolations || revalidation.recommendation === 'allow') {
              this.config.onMessage?.(
                `✅ Architecture violations fixed! Code now complies with layer rules.`,
                'info'
              );
              // Use the fixed content
              const fixedBytes = new Uint8Array(fixedContent.length);
              for (let i = 0; i < fixedContent.length; i++) {
                fixedBytes[i] = fixedContent.charCodeAt(i);
              }
              await vscode.workspace.fs.writeFile(filePath, fixedBytes);

              if (this.config.codebaseIndex) {
                this.config.codebaseIndex.addFile(filePath.fsPath, fixedContent);
              }

              return {
                stepId: step.stepId,
                success: true,
                output: `Wrote ${step.path} (${fixedContent.length} bytes, after architecture fixes)`,
                duration: Date.now() - startTime,
              };
            }
          }

          // If LLM fix didn't work, skip this file
          this.config.onMessage?.(
            `⏭️ Could not auto-fix architecture violations. Skipping ${step.path}.`,
            'info'
          );
          return {
            stepId: step.stepId,
            success: true,
            output: `Skipped (could not fix architecture violations): ${step.path}`,
            duration: Date.now() - startTime,
          };
        }
      }

      // NOW safe to write (only reached if validation passed or non-code file)
      const bytes = new Uint8Array(finalContent.length);
      for (let i = 0; i < finalContent.length; i++) {
        bytes[i] = finalContent.charCodeAt(i);
      }

      await vscode.workspace.fs.writeFile(filePath, bytes);

      // ✅ CRITICAL: Post-step contract extraction
      // After writing, immediately extract what was created (actual APIs, exports, etc)
      // This allows next steps to use the REAL contract, not calculated/guessed paths
      await this.extractAndStoreContract(step.path, finalContent, step.stepId, workspaceUri);

      // Phase 3.3.2: Track file in CodebaseIndex for next steps
      if (this.config.codebaseIndex) {
        this.config.codebaseIndex.addFile(filePath.fsPath, finalContent);
      }

      const result: any = {
        stepId: step.stepId,
        success: true,
        output: `Wrote ${step.path} (${finalContent.length} bytes)`,
        duration: Date.now() - startTime,
        content: finalContent,  // ✅ CRITICAL: Store the actual content for next steps
      };

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const suggestion = this.suggestErrorFix('write', step.path, errorMsg);
      throw new Error(
        `Failed to write ${step.path}: ${errorMsg}${suggestion ? `\n💡 Suggestion: ${suggestion}` : ''}`
      );
    }
  }

  /**
   * Execute /run step: Run shell command
   */
  private async executeRun(
    step: PlanStep,
    startTime: number,
    workspace?: vscode.Uri
  ): Promise<StepResult> {
    if (!step.command) {
      throw new Error('Run step requires command');
    }

    const command = step.command; // TypeScript type narrowing

    // CRITICAL FIX: Use workspace from plan, not just this.config.workspace
    const workspaceUri = workspace || this.config.workspace;

    console.log(`[Executor] Executing command: ${command}`);
    console.log(`[Executor] Platform: ${process.platform}`);

    try {
      // ============================================================
      // v2.13.0 STREAMING HOOK: Replace synchronous blocking with async streaming
      // ============================================================

      // Use the new AsyncCommandRunner with ProcessHandle callbacks
      const handle = (this.commandRunner as any).spawn(command, {
        cwd: workspaceUri.fsPath,
        timeout: this.config.timeout,
      });

      let output = '';

      return new Promise<StepResult>((resolve, reject) => {
        // 1. Stream data and check for prompts (Circuit Breaker)
        handle.onData?.((data: any) => {
          // ✅ v2.12.1 FIX: Handle both string and ProcessStream object data
          // 1. Unbox the chunk safely - prefer data.chunk, fallback to string conversion
          let chunk: string;
          if (typeof data === 'string') {
            chunk = data;
          } else if (typeof data === 'object' && data.chunk) {
            chunk = String(data.chunk);
          } else if (typeof data === 'object' && data.toString) {
            // Try toString() if available, but only if it produces meaningful output
            const str = data.toString();
            chunk = (str !== '[object Object]') ? str : '';
          } else {
            chunk = '';
          }

          // 2. Ignore empty chunks to avoid extra blank lines and {} serialization
          if (!chunk || chunk.trim() === '') {
            return;
          }

          output += chunk;

          // 3. Pass output to UI in real-time (only non-empty)
          this.config.onStepOutput?.(step.stepId || 0, chunk, false);

        });

        // 2. Handle error stream
        handle.onError?.((data: any) => {
          // ✅ v2.12.1 ROBUST FIX: Use the type-safe classifier directly
          const classification = this.classifyStderr(data);

          // Skip empty messages (prevents {} and blank lines)
          if (!classification.message) {
            return;
          }

          output += classification.message;

          // Only pass real errors to output with ❌ prefix
          // Warnings get ⚠️ prefix and go to console instead
          if (!classification.isWarning) {
            const errorOutput = `❌ ${classification.message}`;
            this.config.onStepOutput?.(step.stepId || 0, errorOutput, false);
          } else {
            // Warnings: just log to console, don't clutter the UI with error icons
            console.log(`[Executor] ℹ️  ${classification.message}`);
          }
        });

        // 3. Handle process exit
        handle.onExit?.((code: number) => {
          if (code === 0) {
            resolve({
              stepId: step.stepId,
              success: true,
              output: output || '(no output)',
              duration: Date.now() - startTime,
            });
          } else {
            // Special case: test runner exits code 1 because no test files exist.
            // This is not a failure — the component simply has no tests yet.
            const isTestCommand = /vitest|jest|npm\s+test|yarn\s+test/i.test(command);
            const isNoTestFiles = /no test files found/i.test(output);
            if (isTestCommand && isNoTestFiles) {
              console.log(`[Executor] No test files found for "${command}" — treating as skip`);
              resolve({
                stepId: step.stepId,
                success: true,
                output: '⏭ No test files found — step skipped (no tests to run)',
                duration: Date.now() - startTime,
              });
              return;
            }

            const errorMsg = output || `Command failed with exit code ${code}`;
            const suggestion = this.suggestErrorFix('run', command, errorMsg);
            resolve({
              stepId: step.stepId,
              success: false,
              error: `${errorMsg}${suggestion ? `\n💡 Suggestion: ${suggestion}` : ''}`,
              duration: Date.now() - startTime,
            });
          }
        });

        // 4. Log streaming start
        console.log(`[Executor] Streaming started - event loop is free for prompts`);
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Executor] executeRun error: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * ✅ v2.12.1 POLISH: Classify stderr output as warning or error
   * Separates npm warnings/deprecations from fatal errors
   */
  /**
   * ✅ v2.12.1 ROBUST CLASSIFIER: Pre-processor for stream data
   * Handles type conversion, null filtering, and pattern matching
   * Prevents {} serialization and filters npm noise
   */
  private classifyStderr(data: any): { isWarning: boolean; message: string } {
    // 1. TYPE GUARD: Ensure we have a string
    // This is the key fix for preventing {} serialization
    let message: string;
    if (typeof data === 'string') {
      message = data;
    } else if (data?.chunk) {
      message = String(data.chunk);
    } else if (data?.message) {
      message = String(data.message);
    } else if (typeof data === 'object') {
      // Don't stringify - return empty to skip this chunk
      return { isWarning: true, message: '' };
    } else {
      message = String(data);
    }

    // 2. NULL FILTER: Skip empty messages to prevent blank lines and {}
    if (!message || message.trim() === '' || message === '{}') {
      return { isWarning: true, message: '' };
    }

    // 3. REGEX PATTERNS: Comprehensive warning detection
    const warningPatterns = [
      /^npm\s+(warn|notice|deprecated)/i,  // npm WARN, npm notice, npm deprecated
      /deprecated/i,
      /vulnerabilities/i,
      /looking for funding/i,               // npm funding message
      /peer\s?dependency/i,
      /optional\s+dependency/i,
      /will\s+not\s+be\s+installed/i,
      /(\d+)\s+(moderate|low|high)\s+severity/i,  // Audit summary
      /run\s+`npm\s+audit\s+fix`/i,         // Audit fix suggestion
      /WARN/i,
    ];

    // Check if this is a known non-fatal warning
    const isWarning = warningPatterns.some(pattern => pattern.test(message));

    // Clean up the message
    const cleanMessage = message
      .replace(/^\s*[❌✔️⚠️]+\s*/, '')  // Remove emoji prefix
      .replace(/^Error:\s*/i, '')        // Remove 'Error:' prefix
      .trim();

    return { isWarning, message: cleanMessage };
  }

  /**
   * Pause execution (can be resumed)
   */
  pauseExecution(): void {
    this.paused = true;
    this.config.onMessage?.('Execution paused', 'info');
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
