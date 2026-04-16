import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';
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
import {
  isNonVisualWrapper,
  isStructuralLayout,
  isDecomposedNavigation,
  extractPageImports,
  extractStoreFields,
  extractPropsInterface,
  extractRouteConfig,
  extractCallbackHandlers,
  collectCallbackErrors,
  extractFullCallbackDeclaration,
  spliceCallbackHandlers,
} from './executor-code-classifier';
import {
  generateAcceptanceCriteria,
  llmValidate,
  computeRelativeImportPath,
  buildSurgicalTscPrompt,
  applySurgicalTscPatches,
  buildSurgicalValidatorPrompt,
  applySurgicalValidatorPatches,
} from './executor-llm-prompts';

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
  /** Files written in the current plan execution that still have unresolved tsc errors. */
  private filesWithPersistentTscErrors = new Set<string>();
  private cancelled: boolean = false;
  private readonly MAX_VALIDATION_ITERATIONS = 3; // Phase 3.1: Prevent infinite validation loops
  /** Packages available in the workspace (populated from package.json at execution start) */
  private availablePackages: string[] = [];

  // -------------------------------------------------------------------------
  // Delegation wrappers — logic lives in executor-code-classifier.ts.
  // These thin statics keep existing call sites (including private-method tests
  // that access via executor['methodName']) working without any changes.
  // -------------------------------------------------------------------------
  private static isNonVisualWrapper(fp: string) { return isNonVisualWrapper(fp); }
  private static isStructuralLayout(fp: string, d?: string) { return isStructuralLayout(fp, d); }
  private static isDecomposedNavigation(fp: string, d?: string) { return isDecomposedNavigation(fp, d); }
  private static extractPageImports(code: string) { return extractPageImports(code); }
  private static extractStoreFields(code: string) { return extractStoreFields(code); }
  private static extractPropsInterface(code: string, n?: string) { return extractPropsInterface(code, n); }
  private static extractRouteConfig(code: string) { return extractRouteConfig(code); }
  private static extractCallbackHandlers(code: string) { return extractCallbackHandlers(code); }
  private static collectCallbackErrors(gen: string, src: string) { return collectCallbackErrors(gen, src); }
  private static extractFullCallbackDeclaration(src: string, name: string) { return extractFullCallbackDeclaration(src, name); }
  private static spliceCallbackHandlers(gen: string, src: string, names: string[]) { return spliceCallbackHandlers(gen, src, names); }

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
    // Reset per-plan tsc error tracking (instance var shared with executeWrite)
    this.filesWithPersistentTscErrors.clear();

    // Read package.json once before the step loop so every code generation step
    // knows which packages are actually installed. Non-fatal: missing package.json
    // (e.g. greenfield workspaces) just leaves availablePackages empty.
    this.availablePackages = await this.readInstalledPackages(planWorkspaceUri);

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
      // Skip steps that are manual verification disguised as read/run actions.
      // Pattern: description contains "manual" and path is missing or contains non-code keywords.
      // This prevents CONTRACT_VIOLATION crashes from recurring planner hallucinations.
      const descLower = (step.description ?? '').toLowerCase();
      const stepCommand = typeof (step as any).command === 'string' ? (step as any).command as string : '';
      const isManualVerification =
        descLower.includes('manual verification') ||
        descLower.includes('manually test') ||
        descLower.includes('manually verify') ||
        // Planner put "Manual verification: ..." as the command value
        /^manual\s*(verification|verify|test)/i.test(stepCommand) ||
        (descLower.includes('browser') && step.action === 'read' && !step.path) ||
        (step.action === 'read' && step.path && /manual|browser/i.test(step.path));
      if (isManualVerification) {
        const skipMsg = `📝 Skipped (human verification): ${step.description}`;
        this.config.onStepOutput?.(step.stepId, skipMsg, false);
        // Record as succeeded so downstream dependsOn checks don't throw DEPENDENCY_VIOLATION
        plan.results.set(step.stepId, {
          stepId: step.stepId,
          success: true,
          output: skipMsg,
          duration: 0,
        });
        continue;
      }

      try {
        // ✅ SURGICAL REFACTOR: Pre-Flight Contract Check (State-Aware)
        // Run atomic contract validation BEFORE any normalization/sanitization
        this.preFlightCheck(step, workspaceExists);

        // ✅ NEW: Dependency Validation (DAG Support)
        // Track completed step IDs and validate dependencies.
        // CRITICAL: Build a stepId→step lookup so completed step IDs are resolved
        // correctly even when reorderStepsByDependencies has shuffled plan.steps.
        // Using array index (stepId - 1) is wrong after reorder because positions
        // no longer match original step numbers.
        const completedStepIds = new Set<string>();
        const stepIdToStep = new Map<number, PlanStep>();
        for (const s of plan.steps) {
          if (typeof s.stepId === 'number') { stepIdToStep.set(s.stepId, s); }
        }
        for (const completed of plan.results?.values() ?? []) {
          if (completed.success) {
            const s = stepIdToStep.get(completed.stepId);
            if (s?.id) { completedStepIds.add(s.id); }
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
    const integrationErrors: string[] = []; // hard failures: unresolvable paths, wrong export names
    const pkgWarnings: string[] = [];       // soft warnings: npm packages not in package.json
    
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
      // Files with persistent tsc errors are already tracked in filesWithPersistentTscErrors —
      // skip import-resolution checks for them to avoid double-reporting and to let the tsc
      // error message (which is more precise) be the primary failure signal.
      const normalizedFilePath = filePath.replace(/\\/g, '/');
      const hasPersistentTscErrors = [...this.filesWithPersistentTscErrors].some((p) => {
        const np = p.replace(/\\/g, '/');
        return np.endsWith(normalizedFilePath) || normalizedFilePath.endsWith(np) || np === normalizedFilePath;
      });
      if (hasPersistentTscErrors) { continue; }

      // IMPORT PATH RESOLUTION: verify @/-prefixed and relative imports resolve to known files.
      // This catches fabricated paths like `@/components/ui/form-login` when only
      // `src/components/LoginForm.tsx` was created.
      const importLines = [...content.matchAll(/from\s+['"](@\/[^'"]+|\.\.?\/[^'"]+|src\/[^'"]+)['"]/g)];
      for (const importMatch of importLines) {
        const rawPath = importMatch[1];

        // Resolve @/ alias (maps to src/), bare src/ prefix, or relative paths.
        // For relative paths we must include the file's own directory so that
        // `./Navigation` from `src/components/Layout.tsx` → `components/Navigation`
        // (not just `Navigation` which misses the `components/` prefix).
        const resolveRelative = (base: string, rel: string): string => {
          const baseParts = base.split('/').filter(Boolean);
          for (const seg of rel.split('/')) {
            if (seg === '.') { continue; }
            else if (seg === '..') { baseParts.pop(); }
            else { baseParts.push(seg); }
          }
          return baseParts.join('/');
        };

        // currentFileDir without trailing slash, stripped of leading src/
        const currentFileDir = (() => {
          const d = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
          return d.startsWith('src/') ? d.slice(4) : d;
        })();

        const resolved = rawPath.startsWith('@/')
          ? rawPath.slice(2)  // strip '@/' → relative to src/
          : rawPath.startsWith('src/')
          ? rawPath.slice(4)  // strip 'src/' → same level as src/
          : (rawPath.startsWith('./') || rawPath.startsWith('../'))
          ? resolveRelative(currentFileDir, rawPath)  // proper relative resolution with context
          : rawPath;

        const resolvedNoExt = resolved.replace(/\.[tj]sx?$/, '');

        // Skip known-good paths (in this plan or clearly a utility)
        const inThisPlan = knownPaths.has(resolved) || knownPaths.has(resolvedNoExt);
        // Only skip disk verification for utilities known to exist in every project.
        // Do NOT skip hooks/, types/, lib/ — those may or may not exist and must be verified.
        const isWellKnownDir = resolved.includes('utils/cn');

        // For workspace paths not in this plan (e.g. a store created in a prior run),
        // verify the file actually exists on disk before reporting a missing import.
        let existsOnDisk = false;
        if (!inThisPlan && !isWellKnownDir) {
          // Build store/ ↔ stores/ normalization variants: authStore might be in
          // either `store/` or `stores/` depending on the project convention.
          const storeNormVariants: string[] = [];
          if (resolvedNoExt.startsWith('store/')) {
            storeNormVariants.push(`src/stores/${resolvedNoExt.slice(6)}.ts`);
            storeNormVariants.push(`src/stores/${resolvedNoExt.slice(6)}.tsx`);
          } else if (resolvedNoExt.startsWith('stores/')) {
            storeNormVariants.push(`src/store/${resolvedNoExt.slice(7)}.ts`);
            storeNormVariants.push(`src/store/${resolvedNoExt.slice(7)}.tsx`);
          }
          const diskVariants = [
            `src/${resolvedNoExt}.ts`,
            `src/${resolvedNoExt}.tsx`,
            `${resolvedNoExt}.ts`,
            `${resolvedNoExt}.tsx`,
            ...storeNormVariants,
          ];
          for (const dv of diskVariants) {
            try {
              await vscode.workspace.fs.readFile(vscode.Uri.joinPath(planWorkspaceUri, dv));
              existsOnDisk = true;
              break;
            } catch { /* not found */ }
          }
        }

        const isKnown = inThisPlan || isWellKnownDir || existsOnDisk;

        if (!isKnown) {
          integrationErrors.push(
            `❌ ${filePath}: Unresolvable import '${rawPath}' — file was not created in this plan ` +
            `and does not exist on disk. Known paths: ${[...knownPaths].slice(0, 5).join(', ')}`
          );
        }

        // NAMED EXPORT CHECK: for files written in this plan, verify each imported name is
        // actually exported by the target file. This catches hook name mismatches like
        // importing `useFormStore` when the store file exports `useLoginFormStore`.
        if (inThisPlan) {
          // Find the full importLine to extract named imports (e.g. `import { useFormStore }`)
          const fullImportRegex = new RegExp(
            `import\\s+(?:type\\s+)?\\{([^}]+)\\}\\s+from\\s+['"]${rawPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`
          );
          const namedImportMatch = content.match(fullImportRegex);
          if (namedImportMatch) {
            const importedNames = namedImportMatch[1]
              .split(',')
              .map(s => s.trim().replace(/\s+as\s+\w+$/, '').trim())
              .filter(s => /^\w+$/.test(s));

            // Find the target file content in generatedFileContents
            let targetContent: string | undefined;
            for (const [tp, tc] of generatedFileContents) {
              const tpNorm = tp.replace(/\\/g, '/').replace(/^src\//, '').replace(/\.[tj]sx?$/, '');
              if (tpNorm === resolvedNoExt || tp.replace(/\\/g, '/').endsWith(resolvedNoExt + '.ts') ||
                  tp.replace(/\\/g, '/').endsWith(resolvedNoExt + '.tsx')) {
                targetContent = tc;
                break;
              }
            }

            if (targetContent) {
              // Extract all named exports from the target file
              const namedExports = new Set<string>();
              const exportMatches = [
                ...targetContent.matchAll(/export\s+(?:const|function|class|type|interface|enum)\s+(\w+)/g),
                ...targetContent.matchAll(/export\s*\{([^}]+)\}/g),
              ];
              for (const m of exportMatches) {
                if (m[0].includes('{')) {
                  // export { a, b as c } form
                  m[1].split(',').forEach(s => {
                    const name = s.trim().replace(/\s+as\s+\w+$/, '').trim();
                    if (/^\w+$/.test(name)) namedExports.add(name);
                  });
                } else {
                  namedExports.add(m[1]);
                }
              }

              for (const importedName of importedNames) {
                if (!namedExports.has(importedName)) {
                  integrationErrors.push(
                    `❌ ${filePath}: Imports \`${importedName}\` from '${rawPath}' but that file does not export it. ` +
                    `Available exports: { ${[...namedExports].join(', ')} }. ` +
                    `Rename the export in the store to match the import, or update the import to match the export.`
                  );
                }
              }
            }
          }
        }
      }

      // NPM PACKAGE CHECK: verify bare package imports (e.g. 'react-router-dom', 'zod')
      // are actually in package.json. Only runs when we successfully read package.json.
      if (this.availablePackages.length > 0) {
        // Match bare package imports: 'react-router-dom', '@tanstack/react-query', etc.
        // Exclude relative paths (./ ../), @/ alias paths, and node builtins.
        const pkgImportLines = [...content.matchAll(/from\s+['"]([^.@'"\/][^'"]*|@[^/'"]+\/[^'"]+)['"]/g)];
        const nodeBuiltins = new Set([
          'path', 'fs', 'os', 'http', 'https', 'url', 'util', 'crypto', 'stream',
          'events', 'buffer', 'child_process', 'cluster', 'net', 'tls', 'dns',
          'readline', 'zlib', 'assert', 'vm', 'module', 'perf_hooks', 'worker_threads',
        ]);
        // Always-available packages that don't need to be in package.json
        const alwaysAvailable = new Set(['react', 'react-dom', 'typescript']);
        for (const pkgMatch of pkgImportLines) {
          const pkgName = pkgMatch[1];
          // Normalize scoped packages to their root (e.g. '@tanstack/react-query' → '@tanstack/react-query')
          const rootPkg = pkgName.startsWith('@')
            ? pkgName  // keep full scoped name
            : pkgName.split('/')[0];  // e.g. 'react-router-dom/server' → 'react-router-dom'
          if (
            nodeBuiltins.has(rootPkg) ||
            alwaysAvailable.has(rootPkg) ||
            this.availablePackages.includes(rootPkg)
          ) {
            continue; // ✅ package is available
          }
          pkgWarnings.push(
            `❌ ${filePath}: Imports from '${pkgName}' but this package is NOT in package.json. ` +
            `Either install it (\`npm install ${rootPkg}\`) or use a different approach that doesn't require it.`
          );
        }
      }

      // Check if this file imports from stores but doesn't use the hook correctly.
      // Only applies to .tsx component files — plain .ts files (config, routes, utils) should
      // NEVER import stores; they get a "Config File Store Import" error from the static validator.
      const isComponentFile = filePath.endsWith('.tsx');
      const storeImportMatch = isComponentFile && content.match(/from\s+['\"]([^'\"]*stores[^'\"]*)['\"]/);
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

    // Soft warnings: npm packages not in package.json (non-blocking — user may install separately)
    if (pkgWarnings.length > 0) {
      for (const warning of pkgWarnings) {
        console.warn(`[Executor] ⚠ Package warning: ${warning}`);
        this.config.onMessage?.(`⚠ Integration warning: ${warning}`, 'info');
      }
    }

    // Hard failures: unresolvable file paths, wrong export names, store hook misuse
    if (integrationErrors.length > 0) {
      console.error('[Executor] ❌ Integration validation failed:');
      for (const error of integrationErrors) {
        console.error(`  ${error}`);
        this.config.onMessage?.(error, 'error');
      }
      return {
        success: false,
        completedSteps: succeededSteps,
        results: plan.results,
        error: `Integration validation failed: ${integrationErrors[0]}`,
        totalDuration: Date.now() - startTime,
      };
    }

    // Fail if any written file still had unresolved tsc errors — the import/export
    // checks above may have passed (syntax is a separate concern), but a compile-broken
    // file means the plan output is not usable. Report this as an integration failure
    // instead of emitting a false-positive ✅.
    if (this.filesWithPersistentTscErrors.size > 0) {
      const errorList = [...this.filesWithPersistentTscErrors].join(', ');
      const msg = `❌ Integration check: ${this.filesWithPersistentTscErrors.size} file(s) written with unresolved TypeScript errors: ${errorList}`;
      this.config.onMessage?.(msg, 'error');
      return {
        success: false,
        completedSteps: succeededSteps,
        results: plan.results,
        error: msg,
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
          // For pure .ts config/data files (not .tsx), skip "Cannot find module" for
          // page/component/screen imports — these are external leaf dependencies that
          // legitimately don't exist in the test workspace (e.g. Routes.ts importing HomePage).
          // The contract validator is designed for store↔component contracts, not config files.
          const isConfigTs = filePath.endsWith('.ts') && !filePath.endsWith('.d.ts');
          const contractErrors = contractResult.violations
            .filter(v => {
              if (isConfigTs && v.message.includes('Cannot find module')) {
                const moduleRef = v.message.match(/Cannot find module '([^']+)'/)?.[1] ?? '';
                if (/\/(pages|screens|views|components)\//i.test(moduleRef)) {
                  console.log(`[Executor] ℹ️ Skipping page/component import check for config file: ${moduleRef}`);
                  return false;
                }
              }
              return true;
            })
            .map(v => `❌ Cross-file Contract: ${v.message}. ${v.suggestion}`);
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
        // Exception: root App component legitimately uses both Zustand (auth) and local useState (UI state)
        // Only applies to .tsx files (React components) — plain .ts files (routes, config, utils) should
        // NEVER import from stores; they get a different error via the config-file check below.
        const isRootApp = /(?:^|\/)App\.tsx$/.test(filePath);
        const isTsxFile = filePath.endsWith('.tsx');
        if (isTsxFile && !isRootApp && content.match(/from\s+['"]([^'"]*\/stores\/[^'"]*)['"]/) && !content.match(/const\s+{[^}]+}\s*=\s*use\w+Store\s*\(\)/)) {
          errors.push(
            `❌ Zustand Pattern: Component imports from stores but doesn't use destructuring pattern. ` +
            `Expected: const { x, y } = useStoreHook();`
          );
        }

        // Config/data .ts files must NEVER import from stores — they are plain data, not React components.
        const isConfigOrDataTs = filePath.endsWith('.ts') && !filePath.endsWith('.tsx');
        if (isConfigOrDataTs && content.match(/from\s+['"]([^'"]*\/stores\/[^'"]*)['"]/) ) {
          errors.push(
            `❌ Config File Store Import: ${filePath.split(/[\\/]/).pop()} imports from a store — this is wrong. ` +
            `Config/data .ts files are plain TypeScript with no hooks. Remove all store imports.`
          );
        }

        // App.tsx must NEVER call useNavigate() — it renders <BrowserRouter> and is outside the router context.
        if (isRootApp && content.match(/\buseNavigate\s*\(\)/)) {
          errors.push(
            `❌ Router Hook Violation: App.tsx calls useNavigate() but App renders <BrowserRouter>, ` +
            `so it is OUTSIDE the router context. useNavigate() will throw at runtime. ` +
            `Move navigation logic into a child component rendered INSIDE <BrowserRouter>.`
          );
        }

        // Decomposed navigation components (Navigation, Navbar, Sidebar, Header) must be prop-driven.
        // They should NEVER import from stores — state comes from parent props.
        const isDecomposedNavFile = Executor.isDecomposedNavigation(filePath);
        if (isDecomposedNavFile && content.match(/from\s+['"]([^'"]*\/stores?\/[^'"]*)['"]/) ) {
          errors.push(
            `❌ Architecture Violation: ${filePath.split(/[\\/]/).pop()} is a pure presentation component but imports from a store. ` +
            `Remove all store imports — receive isLoggedIn, theme, onLogout as props from the parent instead.`
          );
        }

        // Detect .getState() anti-pattern in React components
        // useXxxStore.getState() bypasses React's render cycle — setters and state must come from the hook call
        if (content.match(/use\w+Store\.getState\s*\(\)/)) {
          errors.push(
            `❌ Zustand Anti-Pattern: NEVER call useXxxStore.getState() inside a React component. ` +
            `Destructure everything you need from the hook: const { email, password, setEmail, setPassword, login } = useAuthStore();`
          );
        }

        // Detect react-hook-form imports — banned when the task is Zustand-based state management
        if (content.match(/from\s+['"]react-hook-form['"]/)) {
          errors.push(
            `❌ Wrong Library: react-hook-form is imported. This task uses Zustand for state management. ` +
            `Remove react-hook-form entirely. State comes from the Zustand store hook: const { email, password, setEmail, setPassword } = useAuthStore();`
          );
        }

        // Detect mock auth service that always evaluates truthy — makes redirect untestable.
        // Checks for a falsy code path rather than a specific literal, so it catches:
        //   return true            → ❌ literal true
        //   return !!token         → ❌ non-empty string always truthy
        //   return Boolean(token)  → ❌ same
        //   return token !== null  → ❌ non-null string always truthy
        // But passes:
        //   return false           → ✅ explicit false
        //   return null            → ✅ falsy
        //   return storedFlag      → ✅ (could be false at runtime; we trust it)
        const isMockAuthFile = /[\\/]services[\\/][^/]*auth[^/]*\.ts$/i.test(filePath)
          && !filePath.endsWith('.tsx');
        if (isMockAuthFile) {
          const hasExplicitFalsy =
            /\breturn\s+false\b/.test(content) ||
            /\breturn\s+(null|undefined|0)\b/.test(content) ||
            /\breturn\s+''/.test(content) ||
            /\breturn\s+""/.test(content);
          if (!hasExplicitFalsy) {
            errors.push(
              `❌ Mock Auth Bug: no code path in this auth service returns a falsy value. ` +
              `The redirect to /login will NEVER fire — ProtectedRoute always passes. ` +
              `Add \`return false\` as the default so the redirect path is observable and testable. ` +
              `WRONG: return !!token  WRONG: return true  RIGHT: return false`
            );
          }
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
    // Skip when the form delegates state to a Zustand store — the interface lives there.
    const importsZustandStore = /import\s+\{[^}]*use\w+Store[^}]*\}/.test(content);
    if (!patternMap.get('stateInterface') && !importsZustandStore) {
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
    // Critical: handler annotated with FormEvent (event type) instead of FormEventHandler (function type).
    // e.g. `const handleSubmit: FormEvent<HTMLFormElement> = ...` — TypeScript compile error because
    // FormEvent is the event object interface, not a callable function type.
    const handlersTypedAsEvent = [...content.matchAll(/const\s+(handle\w+)\s*:\s*FormEvent\s*</g)];
    for (const m of handlersTypedAsEvent) {
      errors.push(
        `❌ Pattern 2 violation: \`${m[1]}\` is annotated as \`FormEvent<...>\` which is an event object type, not a function type — this is a TypeScript compile error. ` +
        `Use: const ${m[1]}: FormEventHandler<HTMLFormElement> = (e) => { e.preventDefault(); ... }`
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

    // Split React imports: multiple `from 'react'` lines is always wrong in .tsx files.
    // Pure .ts files may legitimately have separate `import type` lines (e.g. ComponentType,
    // ReactElement) without a value import — those are not a problem. Only enforce in .tsx
    // where JSX requires React in scope and merged imports are the canonical style.
    if (filePath.endsWith('.tsx')) {
      const reactImportLines = (content.match(/^import\s+.+\s+from\s+['"]react['"]/gm) || []);
      if (reactImportLines.length > 1) {
        errors.push(
          `❌ Split React imports: Found ${reactImportLines.length} separate import lines from 'react'. ` +
          `Merge into one: import React, { useState, FormEvent, FormEventHandler } from 'react'`
        );
      }
    }

    // JSON file imports: importing from *.json (especially package.json) is a hallucination.
    // e.g. `import { package.json } from '../../package.json'` — invalid identifier and wrong path.
    // Strip these silently so they don't block the file write or propagate to integration checks.
    if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
      const jsonImportMatch = content.match(/^import\s+[^'"]*\s+from\s+['"][^'"]*\.json['"]/m);
      if (jsonImportMatch) {
        errors.push(
          `❌ Fabricated JSON import: \`${jsonImportMatch[0].trim()}\` — do not import JSON files. ` +
          `Remove this line entirely. It serves no purpose in a TypeScript component or store.`
        );
      }
    }

    // Invalid import names: TypeScript generic syntax used as import identifier.
    // e.g. `import { FormEvent<HTMLFormElement> } from 'react'` — angle brackets are not valid
    // in import specifiers; this is a syntax error that TypeScript rejects immediately.
    // Handles both `import { ... }` and `import Foo, { ... }` forms.
    if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
      const importBlockMatches = [...content.matchAll(/import\s+(?:\w+\s*,\s*)?\{([^}]+)\}/g)];
      for (const m of importBlockMatches) {
        const rawNames = m[1];
        if (/</.test(rawNames)) {
          // Extract the offending tokens
          const badTokens = rawNames.split(',')
            .map(s => s.trim())
            .filter(s => s.includes('<') || s.includes('>'));
          errors.push(
            `❌ Invalid import syntax: Generic type syntax inside import braces is not valid. ` +
            `Remove angle brackets from: { ${badTokens.join(', ')} }. ` +
            `Import the base type only — TypeScript infers the generic at the call site: { ${badTokens.map(t => t.replace(/<[^>]*>/g, '').trim()).join(', ')} }`
          );
        }
      }
    }

    // Malformed JSX attribute: consecutive double-quotes like placeholder="""""""""""
    // In JSX, ="..." means the first " opens the string and the second " immediately closes it.
    // Three or more consecutive quotes produce a syntax error that esbuild/tsc rejects.
    // Common LLM failure: mis-escaping a placeholder value into repeated quote chars.
    if (filePath.endsWith('.tsx')) {
      const malformedAttrMatch = content.match(/="{3,}/);
      if (malformedAttrMatch) {
        errors.push(
          `❌ Malformed JSX attribute value: Found consecutive double-quotes \`${malformedAttrMatch[0]}\` — this is a JavaScript parse error. ` +
          `Use a plain string literal: e.g., \`placeholder="Enter your email"\`. ` +
          `Never repeat double-quote characters in a JSX attribute value.`
        );
      }
    }

    // Duplicate identifier: imported symbol also declared locally — crashes at runtime.
    // Happens when SmartFixer adds an import for a name already defined via create()/useState()/etc.
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      const importedNames = [...content.matchAll(/import\s+\{([^}]+)\}/g)]
        .flatMap(m => m[1].split(',').map(s => s.trim().replace(/\s+as\s+\w+$/, '').trim()))
        .filter(s => /^\w+$/.test(s));
      for (const name of importedNames) {
        if (new RegExp(`\\b(?:const|let|var|function|class|interface|type)\\s+${name}\\b`).test(content)) {
          errors.push(
            `❌ Duplicate identifier: '${name}' is both imported and declared locally. ` +
            `Remove either the import OR the local declaration — do not have both.`
          );
        }
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
        `Remove the CSS module import and replace all \`styles.xxx\` references with Tailwind classes (use clsx or cn() if available in the project).`
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

    // Component-to-component circular import check.
    // Navigation.tsx must never import Layout.tsx (Layout already imports Navigation → circular).
    // General rule: a component in components/ must not import another sibling component that is
    // known to import it back.
    if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
      const isNavigationFile = Executor.isDecomposedNavigation(filePath);
      if (isNavigationFile) {
        // Navigation must never import Layout — Layout imports Navigation, so this would be circular.
        const importsLayout = /from\s+['"][^'"]*[Ll]ayout['"]/i.test(content);
        if (importsLayout) {
          errors.push(
            `❌ Circular dependency: Navigation imports Layout, but Layout already imports Navigation. ` +
            `This creates a circular module dependency (Navigation → Layout → Navigation) that crashes the module loader. ` +
            `Remove the Layout import from Navigation. Navigation should only import from: react-router-dom, routes/Routes, and react.`
          );
        }

        // Navigation must call getAccessibleRoutes() as a plain function, not as a method on
        // Routes (react-router component) or ROUTES (the array). Both are runtime errors.
        const routesNamespaceCall = /\bRoutes\.getAccessibleRoutes\s*\(/.test(content)
          || /\bROUTES\.getAccessibleRoutes\s*\(/.test(content);
        if (routesNamespaceCall) {
          errors.push(
            `❌ Wrong function call: \`Routes.getAccessibleRoutes()\` or \`ROUTES.getAccessibleRoutes()\` is not valid. ` +
            `\`Routes\` is a react-router-dom component; \`ROUTES\` is a plain array — neither has .getAccessibleRoutes(). ` +
            `Import and call it as a standalone function: ` +
            `import { ROUTES, getAccessibleRoutes } from '../routes/Routes'; ` +
            `const accessible = getAccessibleRoutes(isLoggedIn);`
          );
        }
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

      // Validate cn import path: must be a relative path (../utils/cn, ./utils/cn) or alias (@/utils/cn)
      // Catches: import { cn } from 'src/utils/cn' — a bare path that TypeScript resolves differently
      const cnImportMatch = content.match(/import\s+[^'"]*\bcn\b[^'"]*from\s+['"]([^'"]+)['"]/);
      if (cnImportMatch) {
        const cnSource = cnImportMatch[1];
        const isValidCnPath = cnSource.startsWith('./') || cnSource.startsWith('../') || cnSource.startsWith('@/');
        if (!isValidCnPath) {
          errors.push(
            `❌ Import path: cn is imported from '${cnSource}' which is not a valid module specifier. ` +
            `Use a relative path or alias: import { cn } from '@/utils/cn' or '../utils/cn'`
          );
        }
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

      // Detect component file that uses default export without a named export.
      // `const X = ...; export default X` is the exact anti-pattern — component consumers
      // expect named imports: `import { LoginForm } from './LoginForm'`.
      // A named definition without `export` is NOT acceptable — it must be `export const X`.
      const hasDefaultExport = /export\s+default\b/.test(content);
      const hasNamedExport = /export\s+(?:const|function|class)\s+[A-Z]/.test(content);
      if (hasDefaultExport && !hasNamedExport && filePath.includes('components/')) {
        const componentName = filePath.split('/').pop()?.replace(/\.[tj]sx?$/, '') ?? 'Component';
        errors.push(
          `❌ Export consistency: Component uses only a default export — named exports are required. ` +
          `Replace: \`const ${componentName} = ...; export default ${componentName};\` ` +
          `with: \`export const ${componentName} = ...;\` (remove the default export entirely)`
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
      } else if (usesForwardRef && isInteractiveFile && !hasDisplayName) {
        // displayName is only required for interactive components that use forwardRef.
        // For form/page/layout components (LoginForm, Dashboard, etc.) forwardRef is never needed —
        // flag its presence as scope creep instead of requiring displayName.
        errors.push(
          `❌ forwardRef missing displayName: Add \`${componentName}.displayName = '${componentName}';\` ` +
          `after the component definition. Without it React DevTools shows "ForwardRef" instead of the component name.`
        );
      } else if (usesForwardRef && !isInteractiveFile) {
        errors.push(
          `❌ Unnecessary forwardRef: \`${componentName}\` is not an interactive form control (Button/Input/Select/etc.) and does not need forwardRef. ` +
          `Remove it and use a plain arrow function: \`export const ${componentName} = ({ ...props }: ${componentName}Props) => { ... };\``
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
          /<[a-z][a-z0-9-]*[\s/>]/.test(content) ||    // lowercase HTML element (<button, <input, <div …)
          /<>|<\/>/.test(content) ||                    // React fragment opener/closer (<> </>)
          /return\s*\(?\s*<[A-Z]/.test(content) ||     // uppercase component in return (<Navigate, <Outlet …)
          /return\s+null\b/.test(content);              // explicit null render is valid
        if (!hasJsxReturn) {
          errors.push(
            `❌ Component returns no JSX: The component body has no JSX HTML element (no <div>, <Navigate />, <>{children}</>, etc.). ` +
            `React components MUST return JSX — e.g. return <>{children}</> or return <Navigate to="/login" />. ` +
            `A bare cn() call or string return will throw "Nothing was returned from render" at runtime. ` +
            `NOTE: TypeScript generics like <HTMLInputElement> are NOT JSX — the check requires a real HTML tag or component.`
          );
        }
      }

      // Detect self-referential export: `export const Button = Button` or
      // `export const Button = forwardRef<T>(Button)` / `export const Button = React.forwardRef<T>(Button)`.
      // Auto-correction introduces this pattern when it wraps an inner const and then re-exports by name.
      // TypeScript throws "Block-scoped variable used before its declaration" or a circular reference.
      // Fires for any component file (.tsx) — not just interactive files.
      if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
        // Pattern 1: export const X = X  (same identifier on both sides)
        const selfRefSimple = content.match(/export\s+const\s+(\w+)\s*=\s*(\w+)\s*;/);
        if (selfRefSimple && selfRefSimple[1] === selfRefSimple[2]) {
          const name = selfRefSimple[1];
          errors.push(
            `❌ Self-referential export: \`export const ${name} = ${name};\` is a circular declaration. ` +
            `Export the component directly: \`export const ${name} = React.forwardRef<...>(...)\` — ` +
            `do NOT assign to an internal name and then re-export it by the same name.`
          );
        }
        // Pattern 2: export const X = forwardRef<...>(X) or React.forwardRef<...>(X)
        // The last argument to forwardRef() is the render function — using the component itself
        // here is a recursive reference that causes "used before declaration" errors.
        const selfRefForwardRef = content.match(/export\s+const\s+(\w+)\s*=\s*(?:React\.)?forwardRef(?:<[^>]*>)?\s*\(\s*(\w+)\s*\)/);
        if (selfRefForwardRef && selfRefForwardRef[1] === selfRefForwardRef[2]) {
          const name = selfRefForwardRef[1];
          errors.push(
            `❌ Self-referential forwardRef: \`export const ${name} = forwardRef(${name})\` wraps the component in itself — ` +
            `this causes a "used before declaration" error. ` +
            `Define the render function inline: \`export const ${name} = React.forwardRef<HTMLElement, ${name}Props>((props, ref) => (<element ref={ref} {...props} />));\`. ` +
            `If ${name} is not an interactive component (Button, Input), remove forwardRef entirely.`
          );
        }
        // Pattern 3: export const X = (props: React.ComponentProps<typeof X>) => ...
        // ComponentProps<typeof X> inside X's own definition is a circular self-reference —
        // TypeScript cannot resolve it: "'X' implicitly has type 'any' because it does not have a
        // type annotation and is referenced directly or indirectly in its own initializer".
        // Fix: define a dedicated Props interface and use it instead.
        const selfRefComponentProps = [...content.matchAll(
          /export\s+const\s+(\w+)\s*=\s*\([^)]*(?:React\.)?ComponentProps<\s*typeof\s+(\w+)\s*>/g
        )];
        for (const m of selfRefComponentProps) {
          if (m[1] === m[2]) {
            errors.push(
              `❌ Self-referential ComponentProps: \`export const ${m[1]} = (props: React.ComponentProps<typeof ${m[1]}>) => ...\` ` +
              `references the component inside its own type annotation — TypeScript compile error. ` +
              `Replace with a named interface: \`interface ${m[1]}Props { /* your props */ }\` ` +
              `then use: \`export const ${m[1]} = ({ ...props }: ${m[1]}Props) => ...\``
            );
          }
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

      // Detect hook calls inside JSX attribute expressions — violates Rules of Hooks.
      // e.g. value={useFormStore((s) => s.email)} or onClick={useStore(s => s.handler)}
      // Hooks must be called at the top level of the component body, never inside JSX props.
      // Pattern: find =\{use\w+( anywhere that isn't a const/let/var/return assignment outside JSX.
      // Simple heuristic: detect `prop={useXxx(` — hooks called directly as JSX attribute values.
      const jsxHookViolations = [...content.matchAll(/\b\w+\s*=\s*\{\s*(use[A-Z]\w+)\s*\(/g)];
      for (const m of jsxHookViolations) {
        const hookName = m[1];
        errors.push(
          `❌ Rules of Hooks violation: \`${hookName}()\` is called inside a JSX prop expression. ` +
          `Hooks must be called at the top level of the component body. ` +
          `Extract to a variable above the return: \`const value = ${hookName}(selector);\` then use \`value\` in JSX.`
        );
      }

      // Detect non-visual wrapper components that don't accept or render children.
      // A Route/Guard/Provider or Layout component that ignores children is broken —
      // it can never render the content it's supposed to wrap.
      // EXCEPTION: Layout components that render <Routes> internally own their own routing
      // and do NOT need to accept children from outside — they are self-contained.
      const isLayoutFile = Executor.isStructuralLayout(filePath);
      const layoutOwnsRouting = isLayoutFile && /<Routes[\s>]/.test(content);
      const needsChildren = (Executor.isNonVisualWrapper(filePath) || isLayoutFile) && !layoutOwnsRouting;
      if (needsChildren && !/\bchildren\b/.test(content)) {
        const isLayout = isLayoutFile;
        const baseName = filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? '';
        errors.push(
          `❌ Missing children prop: ${baseName} is a ${isLayout ? 'layout' : 'wrapper'} component but never references \`children\`. ` +
          `A ${isLayout ? 'layout' : 'wrapper'} must accept and render children: \`({ children }: { children: React.ReactNode })\`.`
        );
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

    // cn imported — severity depends on file type and component role
    // .ts files (services, hooks, utils): ❌ cn must never appear
    // .tsx non-visual wrappers (Route/Guard/Wrapper/Provider/Layout/Context/HOC/Outlet): ❌ cn must never appear
    // .tsx regular components: ⚠️ dead import warning only when cn is imported but not called
    const importsCn = /import\s+.*\bcn\b.*from/.test(content);
    if (importsCn) {
      const isPureTs = filePath.endsWith('.ts') && !filePath.endsWith('.tsx');
      const isNonVisualWrapperFile = Executor.isNonVisualWrapper(filePath);
      if (isPureTs) {
        errors.push(
          `❌ Wrong import: \`cn\` is imported in a non-component .ts file. ` +
          `cn is a UI class-merging utility — it must NEVER appear in service, utility, or hook files. Remove the import.`
        );
      } else if (isNonVisualWrapperFile) {
        errors.push(
          `❌ Wrong import: \`cn\` is imported in a non-visual wrapper component. ` +
          `${filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '')} is a logic wrapper (redirects/renders children) with NO styled elements. ` +
          `NEVER import cn here — remove the import entirely.`
        );
      } else if (!/\bcn\s*\(/.test(content)) {
        // Regular .tsx component: warn only when cn is imported but never called
        errors.push(
          `⚠️ Dead import: \`cn\` is imported but never called. ` +
          `Either use it for class merging (className={cn(...)}) or remove the import.`
        );
      }
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

    // JSX in a pure .ts file is a TypeScript compiler error — it must be .tsx
    // Use unambiguous JSX patterns that never appear in plain TypeScript generics:
    //   - closing tags </Foo>   — TypeScript generics never have closing tags
    //   - fragments <>  </>     — unambiguous JSX syntax
    //   - self-closing <Foo />  — uppercase component followed by space or /
    //   - type annotations      — React.FC, JSX.Element (only meaningful with JSX)
    const isPureTsFile = filePath.endsWith('.ts') && !filePath.endsWith('.tsx');
    if (isPureTsFile) {
      const hasJsx = /<\/[A-Za-z]/.test(content)        // closing tag e.g. </div> </Component>
        || /<>|<\/>/.test(content)                       // React fragment <> </>
        || /<[A-Z][a-zA-Z]*[\s/]/.test(content)         // self-closing or spaced JSX <Foo /> <Foo >
        || /<[a-z][a-zA-Z]*[\s/]/.test(content)         // lowercase HTML JSX <div /> <span > (NOT generic <T> which has no space/slash)
        || /\(\)\s*=>\s*</.test(content)                 // arrow fn returning JSX: () => <Component>
        || /React\.FC|JSX\.Element/.test(content);       // JSX-specific type annotations
      if (hasJsx) {
        errors.push(
          `❌ Wrong file extension: This file contains JSX but has a .ts extension. ` +
          `Rename to .tsx (e.g. Routes.tsx, App.tsx). TypeScript cannot compile JSX in .ts files.`
        );
      }
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
   * Delegates to executor-llm-prompts.ts.
   */
  private async generateAcceptanceCriteria(step: PlanStep, sourceContent?: string): Promise<string[]> {
    return generateAcceptanceCriteria(
      step,
      sourceContent,
      this.config.llmClient.getConfig(),
      this.config.projectProfile?.getGenerationConstraints() ?? '',
      this.config.onMessage
    );
  }

  /**
   * LLM-as-judge: semantic validation that regex cannot catch.
   * Delegates to executor-llm-prompts.ts.
   */
  private async llmValidate(filePath: string, content: string, step: PlanStep, criteria: string[] = []): Promise<string[]> {
    return llmValidate(
      filePath,
      content,
      step,
      criteria,
      this.config.llmClient.getConfig(),
      this.buildValidationConstraints(filePath, step)
    );
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

    // Special case: if an empty run step describes TypeScript compilation, infer the tsc command
    // so it actually executes instead of being skipped as "human verification".
    if (isEmptyRunStep && /compil|tsc\b|typescript.*build|stack.*compil/i.test(step.description)) {
      (step as any).command = 'tsc --noEmit --skipLibCheck';
      console.log(`[Executor] Inferred tsc command for compile-verify step: "${step.description}"`);
      // Fall through to normal execution with the inferred command
    } else {
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

    writeSteps.forEach((step, idx) => {
      dependencies.set(idx, new Set());
    });

    // Build an id→index lookup for dependsOn resolution
    const stepIdToWriteIdx = new Map<string, number>();
    writeSteps.forEach((step, idx) => {
      if (step.id) { stepIdToWriteIdx.set(step.id, idx); }
    });

    // Pass 1: Use planner-declared dependsOn (structural, not linguistic — always preferred)
    writeSteps.forEach((step, currentIdx) => {
      if (step.dependsOn && step.dependsOn.length > 0) {
        for (const depId of step.dependsOn) {
          const depWriteIdx = stepIdToWriteIdx.get(depId);
          if (depWriteIdx !== undefined && depWriteIdx !== currentIdx) {
            dependencies.get(currentIdx)?.add(depWriteIdx);
          }
        }
      }
    });

    // Pass 2: Text analysis fallback — runs for steps that declared no dependsOn, OR
    // for steps whose dependsOn refs all pointed to non-WRITE steps (READ/RUN) and therefore
    // produced zero write-step edges in Pass 1. Without this, steps like Layout.tsx that
    // declare `dependsOn: ["step_1_READ"]` get zero edges and sort before Routes.ts.
    writeSteps.forEach((step, currentIdx) => {
      const hasWriteEdges = (dependencies.get(currentIdx)?.size ?? 0) > 0;
      if (step.dependsOn && step.dependsOn.length > 0 && hasWriteEdges) {
        return; // planner declared write-step dependencies — trust them, skip text analysis
      }

      const pathLower = (step.path || '').toLowerCase();
      const descLower = (step.description || '').toLowerCase();
      const fullText = `${pathLower} ${descLower}`;

      writeSteps.forEach((otherStep, otherIdx) => {
        if (currentIdx === otherIdx) { return; }
        const basename = this.getFileBaseName((otherStep.path || '').toLowerCase());
        // Filename appears anywhere in the description → likely a dependency
        if (basename && new RegExp(`\\b${basename}\\b`, 'i').test(fullText)) {
          dependencies.get(currentIdx)?.add(otherIdx);
        }
        // Store → component heuristic (layout-independent of vocabulary)
        const otherPathLower = (otherStep.path || '').toLowerCase();
        if (
          otherPathLower.includes('store') && !pathLower.includes('store') &&
          (pathLower.includes('component') || pathLower.includes('form'))
        ) {
          dependencies.get(currentIdx)?.add(otherIdx);
        }
      });
    });

    // Pass 3: Path-based structural ordering — description-independent.
    // Vague step descriptions (e.g. "Extract Layout component") don't mention their
    // dependency on Routes.ts, so Pass 2 text analysis misses the edge. This pass
    // enforces well-known decomposition conventions based purely on file path patterns:
    //   routes/       → priority 0 (config, no local imports)
    //   navigation/navbar/nav/sidebar → priority 1 (imports routes)
    //   layout        → priority 2 (imports Navigation + routes)
    //   other components/pages → priority 3
    //   App.tsx       → priority 4 (root, imports everything)
    // Any step with a lower priority number must come BEFORE steps with higher numbers.
    const getStructuralPriority = (path: string): number => {
      const p = (path || '').toLowerCase();
      if (/[\\/]routes?[\\/]|[\\/]routes?\.[tj]s$|routes?\.ts$/i.test(p)) { return 0; }
      if (/[\\/](navigation|navbar|nav|sidebar)\.[tj]sx?$/i.test(p)) { return 1; }
      if (/[\\/]layout\.[tj]sx?$/i.test(p)) { return 2; }
      if (/(?:^|[\\/])app\.[tj]sx?$/i.test(p)) { return 4; }
      return 3;
    };
    writeSteps.forEach((step, currentIdx) => {
      const myPriority = getStructuralPriority(step.path || '');
      writeSteps.forEach((otherStep, otherIdx) => {
        if (currentIdx === otherIdx) { return; }
        const otherPriority = getStructuralPriority(otherStep.path || '');
        if (otherPriority < myPriority) {
          // otherStep has a lower priority number → it must come before this step
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

  // ---------------------------------------------------------------------------
  // Surgical correction helpers
  // ---------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Delegation wrappers — logic lives in executor-llm-prompts.ts.
  // -------------------------------------------------------------------------
  private computeRelativeImportPath(c: string, s: string, i: string) { return computeRelativeImportPath(c, s, i); }
  private buildSurgicalTscPrompt(content: string, errors: string[], fp: string) { return buildSurgicalTscPrompt(content, errors, fp); }
  private applySurgicalTscPatches(content: string, patch: string) { return applySurgicalTscPatches(content, patch); }
  private buildSurgicalValidatorPrompt(content: string, errors: string[], fp: string) { return buildSurgicalValidatorPrompt(content, errors, fp); }
  private applySurgicalValidatorPatches(content: string, patch: string) { return applySurgicalValidatorPatches(content, patch); }

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
   * Reads package.json from the workspace root and returns the union of all
   * dependency keys (dependencies + devDependencies + peerDependencies).
   * Returns an empty array if package.json doesn't exist or can't be parsed.
   */
  private async readInstalledPackages(workspaceUri: vscode.Uri): Promise<string[]> {
    try {
      const pkgUri = vscode.Uri.joinPath(workspaceUri, 'package.json');
      const raw = new TextDecoder().decode(await vscode.workspace.fs.readFile(pkgUri));
      const pkg = JSON.parse(raw) as Record<string, unknown>;
      const sections = ['dependencies', 'devDependencies', 'peerDependencies'] as const;
      const names = new Set<string>();
      for (const section of sections) {
        const deps = pkg[section];
        if (deps && typeof deps === 'object') {
          for (const name of Object.keys(deps)) {
            names.add(name);
          }
        }
      }
      console.log(`[Executor] 📦 Read ${names.size} packages from package.json`);
      return [...names];
    } catch {
      // No package.json or parse error — not fatal
      return [];
    }
  }

  /**
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

    // Check for "manual" hallucination in command — clear the command so the step falls through
    // to the isManualVerification skip in executeStep rather than throwing a fatal error.
    if ((step as any).command && typeof (step as any).command === 'string') {
      if (/^manual\s*(verification|verify|test)/i.test(((step as any).command as string).trim())) {
        // Nullify the command so executeStep's isEmptyRunStep check will catch it as human verification
        (step as any).command = '';
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
      this.config.onMessage?.(`Read ${step.path} (${text.length} bytes)`, 'info');
      return {
        stepId: step.stepId,
        success: true,
        // Store actual file content in output so subsequent WRITE steps can use it as context
        output: text,
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
   * Scan workspace for dependency files whose names appear in the step description.
   * Extracts identifiers ending in Store/Hook/Context/Service/etc., globs for matching
   * .ts/.tsx files in the workspace, and returns their content for injection into the
   * generation prompt. Gracefully returns [] when VS Code API is unavailable (tests).
   */
  private async scanWorkspaceForDependencies(
    step: PlanStep,
    workspaceUri: vscode.Uri,
    alreadyInjected: Set<string>
  ): Promise<{ path: string; content: string }[]> {
    const results: { path: string; content: string }[] = [];
    try {
      const desc = step.description ?? '';

      // Extract identifiers that look like module/hook/store names
      const matches =
        desc.match(/\b([A-Za-z][a-zA-Z0-9]*(?:Store|Hook|Context|Service|Api|Util|Client|Provider))\b/g) ?? [];
      if (matches.length === 0) return results;

      const candidates = new Set<string>();
      for (const m of matches) {
        candidates.add(m);
        // Strip 'use' prefix: useAuthStore → authStore
        if (m.startsWith('use') && m.length > 4) {
          candidates.add(m.charAt(3).toLowerCase() + m.slice(4));
        }
        // Lowercase first char: AuthStore → authStore
        if (m.charAt(0) !== m.charAt(0).toLowerCase()) {
          candidates.add(m.charAt(0).toLowerCase() + m.slice(1));
        }
      }

      for (const name of candidates) {
        const pattern = new vscode.RelativePattern(workspaceUri, `**/${name}.{ts,tsx}`);
        const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 3);

        for (const file of files) {
          const relPath = path.relative(workspaceUri.fsPath, file.fsPath).replace(/\\/g, '/');
          if (alreadyInjected.has(relPath)) continue;

          try {
            const content = this.fs.readFileSync(file.fsPath, 'utf-8');
            if (content.length > 0) {
              results.push({ path: relPath, content });
              alreadyInjected.add(relPath);
              console.log(`[Executor] ℹ️ Auto-injected workspace dependency: ${relPath}`);
            }
          } catch { /* file unreadable — skip */ }
        }
      }
    } catch {
      // VS Code API unavailable (unit test env) or glob failed — skip gracefully
    }
    return results;
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
    // Hoisted outside the plan-context block so the callback-preservation validator
    // (which runs after generation) can access the source READ contents.
    let sourceReadContents: { path: string; content: string }[] = [];
    if (this.plan && step.stepId > 1) {
      const previouslyCreatedFiles: string[] = [];
      const completedSteps = new Map(this.plan.results || new Map());

      // Collect prior READ step content so the LLM knows the exact API of existing files.
      // This prevents guessing import paths (e.g. store/ vs stores/) and export names.
      const readStepContents: { path: string; content: string }[] = [];
      for (let i = 1; i < step.stepId; i++) {
        const prevStep = this.plan.steps.find(s => s.stepId === i);
        const prevResult = completedSteps.get(i);
        if (prevStep && prevResult?.success && prevStep.action === 'read' && prevResult.output) {
          // output now stores actual file content (not just the summary message)
          const isSummary = prevResult.output.startsWith('Read ') && prevResult.output.includes(' bytes)');
          if (!isSummary && prevResult.output.length > 0) {
            readStepContents.push({ path: prevStep.path, content: prevResult.output });
          }
        }
      }

      // Auto-scan workspace for dependency files mentioned in step description.
      // Handles the case where the planner forgot to add a READ step for a dependency
      // (e.g., "using the existing authStore" without a READ step for authStore.ts).
      const workspaceDeps = await this.scanWorkspaceForDependencies(
        step,
        workspaceUri,
        new Set(readStepContents.map(r => r.path))
      );
      if (workspaceDeps.length > 0) {
        readStepContents.push(...workspaceDeps);
      }

      // Collect files created in previous steps
      for (let i = 1; i < step.stepId; i++) {
        const prevStep = this.plan.steps.find(s => s.stepId === i);
        const prevResult = completedSteps.get(i);

        if (prevStep && prevResult && prevResult.success && prevStep.action === 'write') {
          previouslyCreatedFiles.push(prevStep.path);
        }
      }

      if (previouslyCreatedFiles.length > 0 || readStepContents.length > 0) {
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

        // Include content from prior READ steps so the LLM sees the actual API of existing files
        // Also compute path offset: if this WRITE target is in a subdirectory relative to
        // a READ source, the model must adjust relative import paths (e.g. ./pages/ → ../pages/).
        let pathOffsetNote = '';
        if (readStepContents.length > 0 && step.path) {
          const targetDir = step.path.includes('/') ? step.path.substring(0, step.path.lastIndexOf('/')) : '';
          for (const r of readStepContents) {
            const sourceDir = r.path.includes('/') ? r.path.substring(0, r.path.lastIndexOf('/')) : '';
            if (targetDir !== sourceDir && targetDir.startsWith(sourceDir + '/')) {
              // Target is one or more levels deeper than source.
              // Count the extra levels so we know how many '../' to prepend.
              const extra = targetDir.slice(sourceDir.length + 1).split('/').length;
              const prefix = '../'.repeat(extra);
              pathOffsetNote = `\n⚠️ PATH ADJUSTMENT REQUIRED: You are writing to \`${step.path}\` (directory: \`${targetDir}/\`). ` +
                `The source file \`${r.path}\` is at \`${sourceDir}/\`. ` +
                `Its relative imports (e.g. \`./pages/X\`) resolve from \`${sourceDir}/\`, ` +
                `but from \`${targetDir}/\` you must add \`${'../'.repeat(extra)}\` prefix: ` +
                `WRONG: \`./pages/X\`  RIGHT: \`${prefix}pages/X\`\n`;
              break;
            }
          }
        }

        const readContextSection = readStepContents.length > 0
          ? `## EXISTING CODEBASE (files read in prior steps — use their EXACT APIs)
${pathOffsetNote}
${readStepContents.map(r => `### ${r.path}\n\`\`\`typescript\n${r.content.slice(0, 4000)}\n\`\`\``).join('\n\n')}

CRITICAL: When importing from any file shown above, use the EXACT export names and path
shown in that file. For example, if a store uses \`export default useAuthStore\`, import it
as \`import useAuthStore from '...' \` (default import), NOT \`{ useAuthStore }\`.

CALLBACK PRESERVATION: If a file shown above is the source you are decomposing or updating,
every useCallback handler must be reproduced with the IDENTICAL body — same lines, same order.
Rules:
- Do NOT add side-effects (window.location.href, navigate(), etc.) that are absent from the source
- Do NOT remove or simplify lines inside a handler body
- Do NOT drop any handler that exists in the source and belongs in this file

`
          : '';

        const createdFilesSection = fileContracts.length > 0
          ? `## CONTEXT: Related Files Already Created
The following files were created in previous steps. Use their exported APIs as shown below.

${fileContracts.join('\n\n')}

CRITICAL INTEGRATION RULES:
1. Start with the REQUIRED IMPORTS shown above (copy them exactly)
2. Use ONLY the APIs and exports documented above - do NOT invent new API calls
3. For Zustand stores: Use ONLY the methods/properties exported (do NOT guess at other properties)
4. Do NOT create duplicate stores/utilities if they already exist above
5. Do NOT create inline implementations if a shared file already exists
6. ⚠️ SIBLING COMPONENT RULE: These files are for API reference only. Do NOT import sibling components
   (other components from this plan) into this file unless the step description explicitly says you must
   compose or render them. Example: Navigation must NOT import Layout — they are siblings, not parent/child.
   Only the top-level App or the parent that owns both should import both.

`
          : '';

        multiStepContext = `${readContextSection}${importSection}${createdFilesSection}`;
        console.log(`[Executor] ℹ️ Injecting multi-step context: ${fileContracts.length} file contract(s), ${requiredImports.length} import(s), ${readStepContents.length} read file(s)`);
        // Hoist for post-generation callback-preservation validator
        sourceReadContents = readStepContents;
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

STRICTLY FORBIDDEN (these will be rejected):
- NEVER import from a fabricated API module: no \`import { api } from 'src/api'\`, no \`import { api } from '../api'\`, no \`import axios from 'axios'\` unless the REQUIREMENT explicitly names it
- NEVER add isSubmitting / setIsSubmitting / isLoading / setIsLoading state unless the REQUIREMENT explicitly asks for a loading indicator
- NEVER call setTimeout, setInterval, or any async delay inside a form handler
- NEVER call api.post, api.get, fetch(), or axios() unless the REQUIREMENT explicitly specifies an API call
- The submit handler MUST only read formData and call the onSubmit/onLogin prop — do NOT fabricate network logic
- NEVER import from react-hook-form: no \`useForm\`, \`register\`, \`Controller\`, \`FormProvider\`, \`FieldValues\`, \`zodResolver\`, \`@hookform/resolvers\`
  React Hook Form is a completely different library — it is NOT related to Zustand.
  If the REQUIREMENT says "use Zustand", state comes from: const { field, setField } = useXxxStore();
  If the REQUIREMENT says "use local state", state comes from: const [value, setValue] = useState('');
- NEVER call useXxxStore.getState() inside a React component — it bypasses React's render cycle
  WRONG: useAuthStore.getState().setEmail(value)
  RIGHT:  const { email, password, setEmail, setPassword, login } = useAuthStore();  ← destructure everything at the top

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

    // Non-interactive component guard: injected for .tsx files that are NOT interactive controls.
    // Prevents the LLM from hallucinating forwardRef on form/page/layout components.
    const isNonInteractiveTsx = step.path.endsWith('.tsx') && !isInteractiveComponent;
    const isNonVisualWrapperTsx = isNonInteractiveTsx && Executor.isNonVisualWrapper(step.path);
    const isStructuralLayoutTsx = isNonInteractiveTsx && Executor.isStructuralLayout(step.path, step.description);
    const noForwardRefSection = isNonInteractiveTsx
      ? `\nCOMPONENT RULES (mandatory):\n` +
        `- NEVER use React.forwardRef or forwardRef — this is not a ref-forwarding component.\n` +
        `- Do NOT add .displayName — it is only needed on forwardRef components.\n` +
        `- Props type: ONLY define a props interface if the component actually accepts external props.\n` +
        `  If the component takes NO props (e.g. reads everything from a Zustand store), omit props entirely:\n` +
        `  export const ${componentName} = () => { ... };  ← no interface, no { ...props }\n` +
        `  If props ARE needed: interface ${componentName}Props { onSubmit?: () => void; className?: string; }\n` +
        `  NEVER create an empty interface \`interface ${componentName}Props {}\` — that is dead code.\n` +
        `  NEVER use React.ComponentProps<typeof ${componentName}> — compile error (circular self-reference).\n` +
        `- Use a plain arrow function. NEVER spread \`...props\` unless there are actual props to forward.\n` +
        (isNonVisualWrapperTsx
          ? `- NEVER import \`cn\` — this is a logic wrapper with NO styled elements. It renders children or redirects; it has no CSS class merging.\n` +
            `- MUST accept and render \`children\`: ({ children }: { children: React.ReactNode }) or React.PropsWithChildren<{}>\n` +
            `  When authenticated: return <>{children}</>  When unauthenticated: return <Navigate to="/login" /> or equivalent\n` +
            `  A wrapper that ignores children is broken — it can never render the protected content.\n`
          : '') +
        (isStructuralLayoutTsx
          ? `- STRUCTURAL LAYOUT RULES: This is a DECOMPOSITION task — copy the visual structure from the source file above.\n` +
            `- DO NOT produce a thin wrapper like \`<div>{children}</div>\`. That is WRONG.\n` +
            `- The source file shows the exact structure: header / sidebar (Navigation) / main content / footer.\n` +
            `  Copy ALL of those sections into this Layout component. Minimum ~80 lines.\n` +
            `- Props: accept isLoggedIn, theme, onLogout, isSidebarOpen, onToggleSidebar from the parent.\n` +
            `  interface LayoutProps { isLoggedIn: boolean; theme: 'light'|'dark'; onLogout: ()=>void; isSidebarOpen: boolean; onToggleSidebar: ()=>void; }\n` +
            `  DO NOT add a children prop — Layout renders its own routes internally.\n` +
            `- Render Navigation conditionally: {isSidebarOpen && <Navigation isLoggedIn={isLoggedIn} theme={theme} onLogout={onLogout} />}\n` +
            `- Render routes inside <main> using ROUTES from '../routes/Routes' — Layout owns routing, App does not.\n` +
            `  HOW to render route components dynamically:\n` +
            `    WRONG: element={route.component}   ← passes a ComponentType, not a ReactElement\n` +
            `    CORRECT: element={React.createElement(route.component)}  ← valid ReactElement\n` +
            `    ALSO CORRECT: const C = route.component; ... element={<C />}\n` +
            `  Include auth guard: if (route.requiresAuth && !isLoggedIn) return <Navigate to="/" replace />\n` +
            `- STYLING: Use inline style={{...}} objects for all styling — the source file uses inline styles, NOT Tailwind classes.\n` +
            `  DO NOT import cn, clsx, or any CSS-class utility. DO NOT use className with Tailwind strings.\n` +
            `  WRONG: <div className="flex bg-white">  RIGHT: <div style={{ display: 'flex', background: 'white' }}>\n` +
            `  CRITICAL — NO template literals in style objects: backtick strings with ternaries inside \$\{...\} cause parse errors.\n` +
            `    WRONG: style={{ borderBottom: \`1px solid \${theme === 'dark' ? '#444' : '#ddd'}\` }}\n` +
            `    RIGHT: style={{ borderBottom: theme === 'dark' ? '1px solid #444' : '1px solid #ddd' }}\n` +
            `  Use a plain ternary for every theme-dependent style value — never concatenate or template-literal them.\n` +
            `- DO NOT import hooks, form state, services, or business logic.\n` +
            `- DO NOT import ReactNode, ReactElement, or PropsWithChildren — no children prop exists.\n` +
            `- DO NOT call getAccessibleRoutes() in Layout — Navigation handles its own route filtering internally.\n` +
            `  Layout only needs ROUTES to render <Route> elements; it does NOT filter them by auth here (each Route does auth check inline).\n` +
            `- EXPORT: use a named export — NEVER export default.\n` +
            `  CORRECT: export const Layout = ({ isLoggedIn, theme, onLogout, isSidebarOpen, onToggleSidebar }: LayoutProps) => { ... };\n` +
            `  WRONG:   const Layout = ...; export default Layout;\n` +
            `  WRONG:   export const Layout = ({ children, isLoggedIn, ... }) — DO NOT include children in props.\n`
          : '') +
        `\n`
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
        `  Rule: every piece of state created with useState MUST appear in the return object.\n` +
        `- MOCK DETERMINISM: NEVER use Math.random(), Date.now(), or any non-deterministic value for auth/permission state\n` +
        `  A mock auth hook must return predictable results — use a simple boolean constant or read from a Zustand store\n` +
        `  WRONG: const isAuthenticated = Math.random() > 0.3  — random on every render, causes flickering\n` +
        `  RIGHT:  const isAuthenticated = true  // or: const { isLoggedIn } = useAuthStore();\n` +
        `- TIMER LOOPS: NEVER use setInterval or setTimeout to update auth state — auth does not change on a timer\n\n`
      : '';

    // Zustand store constraint block: injected when the target file is in store/ or stores/
    const isStoreTarget = /[\\/]store[s]?[\\/][^/]+\.ts$/.test(step.path) && !step.path.endsWith('.tsx');
    const storeConstraintSection = isStoreTarget
      ? `\nZUSTAND STORE RULES (mandatory — stores are plain state objects, NOT React components):\n` +
        `- ONLY import: { create } from 'zustand' and TypeScript type definitions\n` +
        `- NEVER import React, useState, useCallback, useEffect, FormEvent, or any React type — stores have no JSX\n` +
        `- Use FLAT state: expose each state field and setter directly on the store object\n` +
        `  WRONG: { state: { email: '', password: '' }, setFormData: (data) => set({ state: data }) }\n` +
        `  RIGHT:  { email: '', password: '', setEmail: (v) => set({ email: v }), setPassword: (v) => set({ password: v }) }\n` +
        `- Actions use set() from Zustand, NOT setState() from React\n` +
        `- NEVER put event handlers (handleSubmit, handleChange, onClick) in the store — they belong in the component\n` +
        `- Store actions are ONLY state mutations: setEmail, setPassword, reset, etc.\n` +
        `- Export the hook as: export const useFooStore = create<FooStore>((set) => ({ ... }));\n` +
        `- NEVER use export default — use named exports only\n\n`
      : '';

    // Config/data file constraint: injected for plain .ts files that are NOT hooks or stores.
    // Routes.ts, config.ts, types.ts, constants.ts — these are data-only with zero JSX.
    const isConfigOrDataTsTarget = step.path.endsWith('.ts') && !step.path.endsWith('.tsx') && !isHookTarget && !isStoreTarget;
    // Pre-compute the source-derived "correct format" example for config/data .ts files.
    const configTsFormatExample = (() => {
      if (!isConfigOrDataTsTarget) { return ''; }
      const sourceCode = sourceReadContents[0]?.content ?? '';
      const pageImports = Executor.extractPageImports(sourceCode);
      const routeConfig = Executor.extractRouteConfig(sourceCode);
      const pageImportLines = pageImports.length > 0
        ? pageImports.map(p => `  import ${p.name} from '${p.from}';`).join('\n')
        : `  // Import ALL page components from the source file using their exact names`;
      const ifaceBody = routeConfig.interfaceBody
        ? `  export interface RouteConfig { ${routeConfig.interfaceBody.replace(/\n\s*/g, ' ')} }`
        : `  export interface RouteConfig { path: string; label: string; component: ComponentType; /* ...fields from source */ }`;
      const constName = routeConfig.constName;
      const filterFn = routeConfig.filterFnName ?? 'getAccessibleRoutes';
      return `\nCORRECT format — mirror the source file exactly:\n` +
        `  import type { ComponentType } from 'react';\n` +
        pageImportLines + '\n' +
        ifaceBody + '\n' +
        `  export const ${constName}: RouteConfig[] = [ /* entries from source */ ];\n` +
        `  export function ${filterFn}(...): RouteConfig[] { /* logic from source */ }\n` +
        `WRONG (never do this):\n` +
        `  function renderRoute() { return <Route ... />; }  ← JSX in a .ts file is illegal\n` +
        `  import { SomeName } from '../pages/SomeName'  ← named import instead of default import\n\n`;
    })();
    const configTsConstraintSection = isConfigOrDataTsTarget
      ? `\nCONFIG/DATA FILE RULES (mandatory — this is a .ts file, NOT a React component):\n` +
        `- ABSOLUTELY NO JSX: no <elements>, no </tags>, no <>, no JSX expressions anywhere in this file\n` +
        `- NEVER import React (default or named) — this file has no JSX and needs no React runtime\n` +
        `- NEVER use React.FC, JSX.Element, ReactElement, or any JSX-specific type annotation\n` +
        `- If you must reference a React component type (e.g. in a RouteConfig interface), use:\n` +
        `  import type { ComponentType } from 'react'  ← type-only, no runtime React needed\n` +
        `- NEVER import cn, clsx, classnames — no styling in data/config files\n` +
        `- NEVER import from store files (useAuthStore, useXxxStore) — config files have no React lifecycle\n` +
        `- NEVER include renderRoutes(), render functions, or any function that returns JSX\n` +
        `- Export ONLY: TypeScript interfaces, type aliases, plain objects, and data arrays\n` +
        configTsFormatExample
      : '';

    // App root constraint: injected for App.tsx to prevent useNavigate in the BrowserRouter wrapper.
    const isAppRoot = /(?:^|\/)App\.tsx$/.test(step.path);
    // Pre-compute source-derived state/routing rules so they can be spliced into the constraint string.
    const appRootSourceRules = (() => {
      if (!isAppRoot) { return ''; }
      const sourceCode = sourceReadContents[0]?.content ?? '';
      const storeFieldMap = Executor.extractStoreFields(sourceCode);
      const pageImports = Executor.extractPageImports(sourceCode);

      let storeRules = `STATE ORIGIN RULES (critical — do NOT invent store fields):\n`;
      if (storeFieldMap.size > 0) {
        for (const [hook, fields] of storeFieldMap) {
          storeRules += `- ${hook} exposes EXACTLY: ${fields.join(', ')}\n`;
          storeRules += `  CORRECT: const { ${fields.join(', ')} } = ${hook}();\n`;
          storeRules += `  WRONG: const { ${fields.join(', ')}, extraField } = ${hook}();  ← do not add fields not in source\n`;
        }
      } else {
        storeRules += `- Use ONLY the fields the store actually exports (check the EXISTING CODEBASE section above)\n`;
        storeRules += `  WRONG: destructuring fields that are not in the store — they do not exist at runtime\n`;
      }
      storeRules += `- Any other state (theming, sidebar, etc.) must come from local useState — NOT from stores\n\n`;

      const pageNameList = pageImports.length > 0
        ? pageImports.map(p => p.name).join(', ')
        : 'page components (check the source file imports)';
      const routingRules =
        `ROUTING DELEGATION RULES (critical — App.tsx must NOT own routing):\n` +
        `- Layout handles all <Routes> and <Route> rendering — App.tsx must NOT contain <Routes> or <Route> tags\n` +
        `- DO NOT import page components (${pageNameList}) in App.tsx\n` +
        `  Those imports belong in Layout (or Routes.ts). If App.tsx imports page components it has duplicated routing logic.\n` +
        `- Only import BrowserRouter from react-router-dom — do NOT import Routes, Route, Navigate, or Link.\n` +
        `  Those belong in Layout. Importing them in App.tsx duplicates routing and breaks the architecture.\n\n`;

      // Derive the list of useCallback handlers that must be preserved.
      // This prevents the LLM from "slimming" App.tsx by silently dropping handlers.
      const callbackHandlerNames = [...Executor.extractCallbackHandlers(sourceCode).keys()];
      const callbackRules = callbackHandlerNames.length > 0
        ? `HANDLER PRESERVATION RULES (all handlers from the source App component are required):\n` +
          `- These useCallback handlers MUST ALL appear in the generated file (exact names): ${callbackHandlerNames.join(', ')}\n` +
          `  DO NOT drop any — each is called from JSX inside App and connected to props passed to <Layout />\n\n`
        : '';

      return storeRules + routingRules + callbackRules;
    })();
    const appRootConstraintSection = isAppRoot
      ? `\nAPP ROOT RULES (mandatory — App.tsx renders the router, it cannot use router hooks itself):\n` +
        `- NEVER call useNavigate() directly inside App — App renders <BrowserRouter>, so it is OUTSIDE the router context\n` +
        `  useNavigate() throws "useNavigate() may be used only in the context of a <Router>" if called in App itself.\n` +
        `  If you need navigation logic, put it in a child component that is rendered INSIDE <BrowserRouter>.\n` +
        `- CORRECT pattern: App renders <BrowserRouter><Layout ...>...</Layout></BrowserRouter> with no useNavigate in App\n` +
        `- onLogout must ONLY call logout() — do NOT add window.location.href or any navigation side-effect\n\n` +
        appRootSourceRules +
        `- STYLING: Use inline style={{...}} objects — the source file uses inline styles, NOT Tailwind classes.\n` +
        `  DO NOT import cn, clsx, or any CSS-class utility.\n\n`
      : '';

    // Navigation/Sidebar/Header constraint: injected for pure presentation components that
    // are extracted/decomposed from a parent. They receive ALL state as props — never from stores.
    const isDecomposedNavigationTsx = isNonInteractiveTsx && Executor.isDecomposedNavigation(step.path, step.description);
    const navigationConstraintSection = isDecomposedNavigationTsx
      ? `\nNAVIGATION COMPONENT RULES (mandatory — this is a PURE PRESENTATION component):\n` +
        `- DO NOT import from any store files (useAuthStore, useThemeStore, useXxxStore, etc.)\n` +
        `- ALL state comes from PROPS — never reach into a store for data you should receive as a prop\n` +
        `- Define a props interface: interface NavigationProps { isLoggedIn: boolean; theme: 'light'|'dark'; onLogout: () => void; }\n` +
        `- The parent (Layout or App) owns the state and passes it down — this component just renders it\n` +
        `- DO NOT use useNavigate or any router hook inside this component — render <Link> elements instead\n` +
        `  useNavigate is only legal inside a component that is already rendered INSIDE a <BrowserRouter>.\n` +
        `  Navigation receives its router context from the parent's <BrowserRouter> — use <Link to="..."> for nav.\n` +
        `- ROUTE FILTERING: import getAccessibleRoutes from '../routes/Routes' and call it as a FUNCTION:\n` +
        `  CORRECT: import { ROUTES, getAccessibleRoutes } from '../routes/Routes';\n` +
        `           const accessibleRoutes = getAccessibleRoutes(isLoggedIn);\n` +
        `  WRONG:   Routes.getAccessibleRoutes(isLoggedIn)  ← Routes is a react-router-dom component, not a namespace\n` +
        `  WRONG:   ROUTES.getAccessibleRoutes(isLoggedIn)  ← ROUTES is an array, arrays have no .getAccessibleRoutes\n` +
        `  WRONG:   ROUTES.filter(...)                       ← use getAccessibleRoutes() instead of re-implementing the filter\n` +
        `- NEVER import Layout (or any component that already imports Navigation) — that creates a circular dependency:\n` +
        `  Navigation → Layout → Navigation = module loader crash. Navigation must NOT import Layout.\n` +
        `- STYLING: Use inline \`style={{...}}\` objects — the source file uses inline styles, NOT Tailwind classes.\n` +
        `  DO NOT import cn, clsx, or any CSS-class utility. DO NOT use className with Tailwind strings.\n` +
        `- EXPORT: use a named export — NEVER export default.\n` +
        `  CORRECT: export const Navigation = ({ isLoggedIn, theme, onLogout }: NavigationProps) => { ... };\n` +
        `  WRONG:   const Navigation = ...; export default Navigation;\n\n`
      : '';

    // AVAILABLE PACKAGES: Tell the LLM which packages are actually installed so it
    // doesn't import from packages that don't exist in this project.
    // Only injected for TS/TSX files; no-op when package.json wasn't found.
    const isTypescriptFile = (step.path.endsWith('.ts') || step.path.endsWith('.tsx'));
    const availablePackagesSection = (isTypescriptFile && this.availablePackages.length > 0)
      ? `\nINSTALLED PACKAGES (ONLY import from these — do NOT import from packages not on this list):\n` +
        `${this.availablePackages.join(', ')}\n` +
        `- If a package you want isn't listed, use a different approach (e.g. window.location for navigation, built-in React for state)\n` +
        `- react, react-dom, typescript are always available even if not listed\n\n`
      : '';

    // Add instruction to output ONLY code, no explanations
    // Detect file type from extension
    const fileExtension = step.path.split('.').pop()?.toLowerCase();
    const isCodeFile = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'json', 'yml', 'yaml', 'html', 'css', 'sh'].includes(fileExtension || '');

    if (isCodeFile) {
      prompt = `You are generating code for a SINGLE file: ${step.path}

${intentRequirement}${reactImportsSection}${multiStepContext}${availablePackagesSection}${formPatternSection}${goldenTemplateSection}${profileConstraintsSection}${hookConstraintSection}${storeConstraintSection}${configTsConstraintSection}${appRootConstraintSection}${navigationConstraintSection}${interactiveComponentSection}${noForwardRefSection}STRICT REQUIREMENTS:
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
- WRONG: const paddingStyle = 'px-4 py-2';  clsx(paddingStyle, variantClasses[variant], className)
- RIGHT: clsx('px-4 py-2 text-sm font-medium', variantClasses[variant], className)
- Intermediate const variables for single class strings are dead indirection — inline them directly.

CLASS MERGING RULE (mandatory): For combining Tailwind classes conditionally:
- If src/utils/cn.ts is listed in the CONTEXT section above, import and use it: import { cn } from './utils/cn'
- Otherwise use clsx: import { clsx } from 'clsx' — clsx is always available as an npm package
- NEVER import cn from a path that is not explicitly present in the CONTEXT section above
- NEVER pass an empty string as an argument: WRONG: clsx('px-4 py-2', '') — RIGHT: clsx('px-4 py-2')

Example format (raw code, nothing else):
import React from 'react';
import { clsx } from 'clsx';

export const MyComponent = ({ className }: { className?: string }) => {
  return <div className={clsx('p-4', className)}>...</div>;
};

Do NOT include: backticks, markdown, explanations, other files, instructions`;
    }

    // Architect pre-flight: generate task-specific acceptance criteria before code generation.
    // Criteria are injected into the Executor prompt (so the generator knows what will be checked)
    // AND passed to the Reviewer (llmValidate) for structured YES/NO validation after generation.
    const acceptanceCriteria = await this.generateAcceptanceCriteria(step, sourceReadContents[0]?.content);

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

      // Hoist matchingSource above the validation block so it's accessible in both
      // the custom validation section and the post-write tsc correction section (line ~5182).
      // const inside the validation if-block would go out of scope before tsc runs.
      const targetFileName = step.path.split(/[\\/]/).pop() ?? '';
      const matchingSource = sourceReadContents.find(r =>
        (r.path.split(/[\\/]/).pop() ?? '') === targetFileName
      );

      if (['ts', 'tsx', 'js', 'jsx'].includes(fileExtension || '')) {
        this.config.onMessage?.(
          `🔍 Validating ${step.path}...`,
          'info'
        );

        const validationResult = await this.validateGeneratedCode(step.path, content, step, acceptanceCriteria);

        // CALLBACK PRESERVATION CHECK: when this WRITE targets the same file that was READ
        // in a prior step, ensure all useCallback handlers are preserved intact.
        // Uses collectCallbackErrors (also called in the correction loop below) so the
        // check runs on EVERY validation attempt, not just the first generation.
        if (matchingSource) {
          const cbErrors = Executor.collectCallbackErrors(content, matchingSource.content);
          if (cbErrors.length > 0) {
            validationResult.errors = validationResult.errors ?? [];
            validationResult.errors.push(...cbErrors);
          }
        }

        // ✅ FIX: Separate critical errors from soft suggestions
        const { critical: criticalErrors, suggestions: softSuggestions } = this.filterCriticalErrors(
          validationResult.errors,
          true // verbose: log suggestions as warnings
        );

        if (criticalErrors.length === 0) {
          // ✅ No critical errors - validation passed!
          // Apply smart cleanup for actionable suggestions (e.g. dead cn import in .tsx)
          const actionableSuggestions = softSuggestions.filter(
            s => s.includes('Dead import') && s.includes('cn')
          );
          if (actionableSuggestions.length > 0) {
            const ragResolver = (this.config.codebaseIndex && this.config.embeddingClient)
              ? (name: string) => this.config.codebaseIndex!.resolveExportSource(name, this.config.embeddingClient!)
              : () => Promise.resolve(null);
            content = await SmartAutoCorrection.fixCommonPatternsAsync(
              content, actionableSuggestions, ragResolver, step.path
            );
          }
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
          // Loop detection: catch both consecutive-same (A→A) and oscillation (A→B→A) cycles.
          let previousAttemptErrors: string[] = [];
          let consecutiveSameErrors = 0;
          // Sliding window of error fingerprints — detect repeated sets within 3 attempts
          const recentErrorFingerprints: string[] = [];

          while (validationAttempt <= this.MAX_VALIDATION_ITERATIONS && !loopDetected) {
            const errorList = lastCriticalErrors.map((e, i) => `  ${i + 1}. ${e}`).join('\n');

            this.config.onMessage?.(
              `❌ Critical validation errors (attempt ${validationAttempt}/${this.MAX_VALIDATION_ITERATIONS}) for ${step.path}:\n${errorList}`,
              'error'
            );

            const currentFingerprint = JSON.stringify([...lastCriticalErrors].sort());

            // LOOP DETECTION 1: same errors on consecutive attempts (A→A)
            if (
              previousAttemptErrors.length > 0 &&
              currentFingerprint === JSON.stringify([...previousAttemptErrors].sort())
            ) {
              consecutiveSameErrors++;
            } else {
              consecutiveSameErrors = 0;
            }
            previousAttemptErrors = [...lastCriticalErrors];

            // LOOP DETECTION 2: oscillation within a window of 3 (A→B→A)
            recentErrorFingerprints.push(currentFingerprint);
            if (recentErrorFingerprints.length > 3) recentErrorFingerprints.shift();
            const isOscillating =
              recentErrorFingerprints.length === 3 &&
              recentErrorFingerprints[0] === recentErrorFingerprints[2] &&
              recentErrorFingerprints[0] !== recentErrorFingerprints[1];

            if (consecutiveSameErrors >= 2 || isOscillating) {
              this.config.onMessage?.(
                `🔄 LOOP DETECTED: Validation errors oscillating — stopping auto-correction to prevent infinite loop`,
                'error'
              );
              loopDetected = true;
              break;
            }

            // DETERMINISTIC CALLBACK SPLICER: when handlers are missing from the generated
            // file, extract their full declarations from source and inject them directly.
            // The LLM consistently drops handlers on "slim" rewrites; splicing from source
            // is reliable and avoids an extra LLM round-trip for this specific failure mode.
            if (matchingSource) {
              const missingCbErrors = lastCriticalErrors.filter(e =>
                e.includes('Callback Preservation') && e.includes('missing from the generated output')
              );
              if (missingCbErrors.length > 0) {
                const missingNames = missingCbErrors
                  .map(e => { const m = e.match(/handler `(\w+)`/); return m?.[1] ?? ''; })
                  .filter(Boolean);
                const spliced = Executor.spliceCallbackHandlers(currentContent, matchingSource.content, missingNames);
                if (spliced !== currentContent) {
                  // Re-run callback check on spliced content to see which errors are resolved
                  const splicedCbErrors = Executor.collectCallbackErrors(spliced, matchingSource.content);
                  const resolvedCount = missingCbErrors.length - splicedCbErrors.filter(
                    e => e.includes('missing from the generated output')
                  ).length;
                  if (resolvedCount > 0) {
                    console.log(`[Executor] Spliced ${resolvedCount} missing callback handler(s): ${missingNames.join(', ')}`);
                    // Apply the splice and update the error list
                    currentContent = spliced;
                    lastCriticalErrors = [
                      ...lastCriticalErrors.filter(e => !missingCbErrors.includes(e)),
                      ...splicedCbErrors,
                    ];
                    // If all critical errors are now resolved, exit the loop immediately
                    if (lastCriticalErrors.length === 0) {
                      finalContent = spliced;
                      this.config.onMessage?.(`✅ Deterministic callback splice resolved all errors.`, 'info');
                      break;
                    }
                  }
                }
              }
            }

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

            // Fast-path: forwardRef missing displayName is a pure append — no LLM needed.
            // Pattern: last non-whitespace line is `});` or `});` and component name is known.
            const displayNameError = lastCriticalErrors.find(e => e.includes('forwardRef missing displayName'));
            if (displayNameError && lastCriticalErrors.length === 1) {
              const compNameMatch = displayNameError.match(/Add `(\w+)\.displayName/);
              if (compNameMatch) {
                const compName = compNameMatch[1];
                const patched = currentContent.trimEnd() + `\n${compName}.displayName = '${compName}';\n`;
                const patchValidation = await this.validateGeneratedCode(step.path, patched, step, acceptanceCriteria);
                const { critical: patchCritical } = this.filterCriticalErrors(patchValidation.errors, false);
                if (patchCritical.length === 0) {
                  currentContent = patched;
                  lastCriticalErrors = [];
                  break;
                }
              }
            }

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

              // Validate the fixed code - only check CRITICAL errors
              const smartValidation = await this.validateGeneratedCode(step.path, smartFixed, step, acceptanceCriteria);
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
                correctedContent = smartFixed;
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
                    // Zustand stores return objects (destructure), not [state, setter] tuples
                    const callExample = (hookName.endsWith('Store') || hookName.toLowerCase().includes('store'))
                      ? `const { fieldA, fieldB, setFieldA } = ${hookName}();`
                      : `const value = ${hookName}();`;
                    return `${i + 1}. ${e}\n   ACTION: Remove the unused import OR call the hook at the top level of the component body. Example: ${callExample}`;
                  }
                  return `${i + 1}. ${e}`;
                }).join('\n');

                const hasJsxInTsError1 = step.path.endsWith('.ts') && !step.path.endsWith('.tsx') &&
                  lastCriticalErrors.some(e => e.includes('Wrong file extension') || e.includes('contains JSX'));

                let correctedContent1: string;
                if (hasJsxInTsError1) {
                  // JSX-in-.ts: must gut the file — whole-file rewrite is unavoidable
                  const fixPrompt = `The following code for ${step.path} has CRITICAL validation errors that MUST be fixed.\n\nCURRENT CODE:\n${currentContent}\n\nERRORS TO FIX:\n${formattedErrors}\n\nCRITICAL: This is a .ts (NOT .tsx) file. REMOVE ALL JSX — no angle brackets, no JSX expressions, no renderRoutes(), no React.FC. Replace component-type references with \`import type { ComponentType } from 'react'\`. Keep only TypeScript interfaces, type aliases, plain objects, and data arrays. NEVER add 'any' type. Provide ONLY the corrected code. No explanations, no markdown.`;
                  const fixResponse = await this.config.llmClient.sendMessage(fixPrompt);
                  if (!fixResponse.success) {
                    throw new Error(`Auto-correction attempt failed: ${fixResponse.error || 'LLM error'}`);
                  }
                  correctedContent1 = fixResponse.message || '';
                  const fence = correctedContent1.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/);
                  if (fence) { correctedContent1 = fence[1]; }
                } else {
                  // Surgical: SEARCH/REPLACE blocks — LLM edits only what the error requires
                  const surgicalPrompt = this.buildSurgicalValidatorPrompt(currentContent, lastCriticalErrors, step.path);
                  const surgicalResponse = await this.config.llmClient.sendMessage(surgicalPrompt);
                  if (!surgicalResponse.success) {
                    throw new Error(`Auto-correction attempt failed: ${surgicalResponse.error || 'LLM error'}`);
                  }
                  const patched = this.applySurgicalValidatorPatches(currentContent, surgicalResponse.message || '');
                  correctedContent1 = patched ?? (surgicalResponse.message || '');
                  if (!patched) {
                    // Patch parsing failed — strip fences and treat as whole-file fallback
                    const fence = correctedContent1.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/);
                    if (fence) { correctedContent1 = fence[1]; }
                  }
                }
                correctedContent = correctedContent1;
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
                  // Zustand stores return objects (destructure), not [state, setter] tuples
                  const callExample = (hookName.endsWith('Store') || hookName.toLowerCase().includes('store'))
                    ? `const { fieldA, fieldB, setFieldA } = ${hookName}();`
                    : `const value = ${hookName}();`;
                  return `${i + 1}. ${e}\n   ACTION: Remove the unused import OR call the hook at the top level of the component body. Example: ${callExample}`;
                }
                return `${i + 1}. ${e}`;
              }).join('\n');

              const hasJsxInTsError2 = step.path.endsWith('.ts') && !step.path.endsWith('.tsx') &&
                lastCriticalErrors.some(e => e.includes('Wrong file extension') || e.includes('contains JSX'));

              let correctedContent2: string;
              if (hasJsxInTsError2) {
                // JSX-in-.ts: whole-file rewrite required
                const fixPrompt = `The following code for ${step.path} has CRITICAL validation errors that MUST be fixed.\n\nCURRENT CODE:\n${currentContent}\n\nERRORS TO FIX:\n${formattedErrors}\n\nCRITICAL: This is a .ts (NOT .tsx) file. REMOVE ALL JSX — no angle brackets, no JSX expressions, no renderRoutes(), no React.FC. Replace component-type references with \`import type { ComponentType } from 'react'\`. Keep only TypeScript interfaces, type aliases, plain objects, and data arrays. NEVER add 'any' type. Provide ONLY the corrected code. No explanations, no markdown.`;
                const fixResponse = await this.config.llmClient.sendMessage(fixPrompt);
                if (!fixResponse.success) {
                  throw new Error(`Auto-correction attempt failed: ${fixResponse.error || 'LLM error'}`);
                }
                correctedContent2 = fixResponse.message || '';
                const fence = correctedContent2.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/);
                if (fence) { correctedContent2 = fence[1]; }
              } else {
                // Surgical: SEARCH/REPLACE blocks
                const surgicalPrompt = this.buildSurgicalValidatorPrompt(currentContent, lastCriticalErrors, step.path);
                const surgicalResponse = await this.config.llmClient.sendMessage(surgicalPrompt);
                if (!surgicalResponse.success) {
                  throw new Error(`Auto-correction attempt failed: ${surgicalResponse.error || 'LLM error'}`);
                }
                const patched = this.applySurgicalValidatorPatches(currentContent, surgicalResponse.message || '');
                correctedContent2 = patched ?? (surgicalResponse.message || '');
                if (!patched) {
                  const fence = correctedContent2.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/);
                  if (fence) { correctedContent2 = fence[1]; }
                }
              }
              correctedContent = correctedContent2;
            }

            // Re-validate the corrected code - only check CRITICAL errors
            const nextValidation = await this.validateGeneratedCode(step.path, correctedContent, step, acceptanceCriteria);
            // Re-run callback preservation on the corrected content — same check as initial pass.
            // Without this, SmartAutoCorrection can fix TypeScript errors while leaving callback
            // violations intact, causing nextValidation to pass even though handlers are wrong.
            if (matchingSource) {
              const cbErrors = Executor.collectCallbackErrors(correctedContent, matchingSource.content);
              if (cbErrors.length > 0) {
                nextValidation.errors = nextValidation.errors ?? [];
                nextValidation.errors.push(...cbErrors);
              }
            }
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

      // Check 6: TypeScript compiler (ground truth — runs post-write so tsc sees the file)
      // Only for .ts/.tsx files where a tsconfig.json exists in the workspace root.
      // Cascading errors in OTHER files (e.g. App.tsx importing a renamed export) are
      // intentionally ignored here — the plan's final RUN/tsc step is the hard gate.
      const isTsFile = step.path.endsWith('.ts') || step.path.endsWith('.tsx');
      if (isTsFile && workspaceUri) {
        this.config.onMessage?.(`🔎 Check 6: TypeScript compiler...`, 'info');
        let tscErrors = await this.runTscCheck(workspaceUri.fsPath, step.path);

        if (tscErrors.length > 0) {
          this.config.onMessage?.(
            `⚠️ ${tscErrors.length} TypeScript error(s) in ${step.path}:\n` +
            tscErrors.map(e => `  ${e}`).join('\n'),
            'warning'
          );

          // Pass 0: deterministic fixes (TS1005 semicolons, split imports, etc.) before LLM
          const deterministicFixed = SmartAutoCorrection.fixCommonPatterns(finalContent, tscErrors, step.path);
          if (deterministicFixed !== finalContent) {
            this.config.onMessage?.(`🔧 Applying deterministic TypeScript fixes...`, 'info');
            finalContent = deterministicFixed;
            const detBytes = Buffer.from(finalContent, 'utf8');
            await vscode.workspace.fs.writeFile(filePath, detBytes);
            tscErrors = await this.runTscCheck(workspaceUri.fsPath, step.path);
          }

          // Pass 0.5: deterministic import resolver for TS2304 "Cannot find name 'X'" errors.
          // When the generator forgets to import a symbol that appears in a previously-read
          // source file (e.g. NotFoundPage used by Layout but only imported in App.tsx),
          // extract the import from the source file and add it with the correct relative path.
          // This fires before LLM correction so the 2 LLM passes focus on other errors.
          const ts2304Names = tscErrors
            .filter(e => e.includes('TS2304'))
            .map(e => { const m = e.match(/Cannot find name '(\w+)'/); return m?.[1] ?? ''; })
            .filter(Boolean);

          if (ts2304Names.length > 0) {
            let resolvedContent = finalContent;
            // Check all source files we have: the matching source + any others we read
            const allSources: { path: string; content: string }[] = [...sourceReadContents];
            if (matchingSource && !allSources.find(s => s.path === matchingSource.path)) {
              allSources.unshift(matchingSource);
            }

            for (const unknownName of ts2304Names) {
              // Skip if already present in import lines
              const importLines = resolvedContent.split('\n').filter(l => l.trimStart().startsWith('import'));
              if (new RegExp(`\\b${unknownName}\\b`).test(importLines.join('\n'))) { continue; }

              // Search source files for default or named import of this symbol
              for (const src of allSources) {
                const defaultRe = new RegExp(`import\\s+${unknownName}\\s+from\\s+(['"])([^'"]+)\\1`);
                const namedRe = new RegExp(`import\\s+\\{[^}]*\\b${unknownName}\\b[^}]*\\}\\s+from\\s+(['"])([^'"]+)\\1`);
                const defaultMatch = src.content.match(defaultRe);
                const namedMatch = src.content.match(namedRe);

                let importStatement: string | null = null;
                if (defaultMatch) {
                  const relPath = this.computeRelativeImportPath(step.path, src.path, defaultMatch[2]);
                  importStatement = `import ${unknownName} from '${relPath}';`;
                } else if (namedMatch) {
                  const relPath = this.computeRelativeImportPath(step.path, src.path, namedMatch[2]);
                  importStatement = `import { ${unknownName} } from '${relPath}';`;
                }

                if (importStatement && !resolvedContent.includes(importStatement)) {
                  // Insert after the last import line in the file
                  const importLineMatches = [...resolvedContent.matchAll(/^import[^\n]*\n/gm)];
                  if (importLineMatches.length > 0) {
                    const last = importLineMatches[importLineMatches.length - 1];
                    const insertPos = last.index! + last[0].length;
                    resolvedContent = resolvedContent.slice(0, insertPos) + importStatement + '\n' + resolvedContent.slice(insertPos);
                  } else {
                    resolvedContent = importStatement + '\n' + resolvedContent;
                  }
                  break; // Found and added — move to next unknown name
                }
              }
            }

            if (resolvedContent !== finalContent) {
              this.config.onMessage?.(`🔧 Resolving missing imports deterministically (TS2304)...`, 'info');
              finalContent = resolvedContent;
              await vscode.workspace.fs.writeFile(filePath, Buffer.from(finalContent, 'utf8'));
              tscErrors = await this.runTscCheck(workspaceUri.fsPath, step.path);
            }
          }

          // Attempt up to 2 LLM correction passes if errors remain
          for (let tscPass = 0; tscPass < 2 && tscErrors.length > 0; tscPass++) {
            this.config.onMessage?.(
              `🔧 Fixing TypeScript errors (pass ${tscPass + 1}/2)...`, 'info'
            );

            // Surgical first: build a per-line JSON-patch prompt if errors have line numbers.
            // This avoids handing the whole file to the LLM (which tends to rewrite everything
            // and introduce new errors in unrelated parts like template literals).
            const surgicalPrompt = this.buildSurgicalTscPrompt(finalContent, tscErrors, step.path);
            let corrected: string | null = null;

            if (surgicalPrompt) {
              const surgicalResponse = await this.config.llmClient.sendMessage(surgicalPrompt);
              if (surgicalResponse.success && surgicalResponse.message?.trim()) {
                corrected = this.applySurgicalTscPatches(finalContent, surgicalResponse.message);
              }
            }

            if (corrected === null) {
              // Fallback: whole-file correction when no line numbers or patch parsing failed
              const fixPrompt =
                `The following TypeScript file has compiler errors reported by tsc.\n\n` +
                `FILE: ${step.path}\n\nCURRENT CODE:\n${finalContent}\n\n` +
                `COMPILER ERRORS:\n${tscErrors.join('\n')}\n\n` +
                `Fix ONLY the listed errors. Do not change logic, structure, or add comments. ` +
                `NEVER add 'any' type — use specific types or 'unknown'. ` +
                `Provide ONLY the corrected code. No explanations, no markdown fences.`;
              const fixResponse = await this.config.llmClient.sendMessage(fixPrompt);
              if (!fixResponse.success || !fixResponse.message?.trim()) { break; }
              let raw = fixResponse.message;
              const fenceMatch = raw.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/);
              if (fenceMatch) { raw = fenceMatch[1]; }
              corrected = raw;
            }

            finalContent = corrected;

            // Overwrite file with correction
            const fixedBytes = Buffer.from(finalContent, 'utf8');
            await vscode.workspace.fs.writeFile(filePath, fixedBytes);

            // Re-check — break early if clean
            tscErrors = await this.runTscCheck(workspaceUri.fsPath, step.path);
          }

          if (tscErrors.length > 0) {
            if (step.path) { this.filesWithPersistentTscErrors.add(step.path); }
            this.config.onMessage?.(
              `⚠️ ${tscErrors.length} TypeScript error(s) persist after correction. ` +
              `File written — the final tsc RUN step will surface any remaining issues.`,
              'warning'
            );
          } else {
            this.config.onMessage?.(`✅ Check 6: TypeScript errors resolved.`, 'info');
          }
        } else {
          this.config.onMessage?.(`✅ Check 6: TypeScript clean.`, 'info');
        }
      }

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
   * Check 6: TypeScript compiler validation (ground truth).
   *
   * Runs `tsc --noEmit --skipLibCheck` from the workspace root after the file
   * is written to disk. Filters the output to errors in `relativeFilePath` only
   * — cascading errors in OTHER files that import the new file are ignored here;
   * the plan's final RUN/tsc step is the hard gate for those.
   *
   * Returns an array of formatted error strings, or [] when:
   * - No tsconfig.json found in the workspace root
   * - tsc binary not found
   * - tsc exits cleanly (no errors in this file)
   */
  private async runTscCheck(
    workspaceRoot: string,
    relativeFilePath: string
  ): Promise<string[]> {
    // Require tsconfig.json — without it tsc doesn't know the project boundaries
    if (!fs.existsSync(path.join(workspaceRoot, 'tsconfig.json'))) {
      console.log('[Executor] Check 6: no tsconfig.json found, skipping tsc check');
      return [];
    }

    // Prefer workspace-local tsc over global to match the project's TypeScript version
    const isWin = process.platform === 'win32';
    const localTsc = path.join(workspaceRoot, 'node_modules', '.bin', isWin ? 'tsc.cmd' : 'tsc');
    const tscBin = fs.existsSync(localTsc) ? `"${localTsc}"` : 'tsc';

    return new Promise<string[]>((resolve) => {
      cp.exec(
        `${tscBin} --noEmit --skipLibCheck`,
        { cwd: workspaceRoot, timeout: 30000 },
        (_err, stdout, stderr) => {
          // tsc exits non-zero when errors exist — _err is expected, use output instead
          const output = (stdout + stderr).replace(/\r\n/g, '\n');

          // Normalise to forward slashes for cross-platform path matching
          const normTarget = relativeFilePath.replace(/\\/g, '/');

          const errors = output
            .split('\n')
            .filter(line => {
              const normLine = line.replace(/\\/g, '/');
              return normLine.includes(normTarget) && /error TS\d+/.test(line);
            })
            .map(line => {
              // "src/Foo.tsx(42,5): error TS2304: Cannot find name 'cn'."
              const m = line.match(/\((\d+),\d+\):\s*error\s*(TS\d+):\s*(.+)/);
              if (m) {
                return `❌ TypeScript(${m[2]}): ${m[3].trim()} (line ${m[1]})`;
              }
              return `❌ TypeScript: ${line.trim()}`;
            });

          console.log(
            `[Executor] Check 6: ${errors.length} tsc error(s) in ${relativeFilePath}`
          );
          resolve(errors);
        }
      );
    });
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
