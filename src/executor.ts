import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';
import { IFileSystem } from './providers/IFileSystem';
import { ICommandRunner } from './providers/ICommandRunner';
import { FileSystemProvider } from './providers/FileSystemProvider';
import { CommandRunnerProvider } from './providers/CommandRunnerProvider';
import SmartAutoCorrection from './smartAutoCorrection';
import { LLMClient } from './llmClient';
import { GitClient } from './gitClient';
import CodebaseIndex, { EmbeddingClient } from './codebaseIndex';
import { ArchitectureValidator } from './architectureValidator';
import { TaskPlan, PlanStep, StepResult } from './planner';
import { validateExecutionStep } from './types/executor';
import { PlanState } from './types/PlanState';
import { PathSanitizer } from './utils/pathSanitizer';
import { ValidationReport, formatValidationReportForLLM } from './types/validation';
import { GOLDEN_TEMPLATES } from './constants/templates';
import { ProjectProfile } from './projectProfile';
import { safeParse, sanitizeJson } from './utils/jsonSanitizer';
// matchFormPatterns and findImportAndSyntaxIssuesPure moved to executor-validator.ts
import {
  isNonVisualWrapper,
  isHOCComponent,
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
import {
  validateTypes,
  validateFormComponentPatterns,
  validateCommonPatterns,
  suggestErrorFix,
  categorizeValidationErrors,
  filterCriticalErrors,
  buildValidationConstraints,
} from './executor-validator';
import {
  getFileBaseName,
  sanitizePath,
  calculateImportStatement,
  stepsAreEqual,
  reorderStepsByDependencies,
  validateDependencies,
  preFlightCheck,
  validateStepContract,
  attemptStrategySwitch,
  shouldAskForWrite,
  classifyStderr,
} from './executor-step-utils';

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
  private static isHOCComponent(fp: string) { return isHOCComponent(fp); }
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
  }

  /**
   * Return the actual source of a previously-written file as a typed code block.
   * Showing real code is more reliable than regex-derived summaries: the LLM sees
   * the exact export names, hook signatures, and prop types it needs to integrate with.
   */
  private async extractFileContract(filePath: string, workspace: vscode.Uri): Promise<string> {
    try {
      const fileUri = vscode.Uri.joinPath(workspace, filePath);
      const content = new TextDecoder().decode(await vscode.workspace.fs.readFile(fileUri));
      const preview = content.length > 2000 ? content.slice(0, 2000) + '\n// … (truncated)' : content;
      return `### ${filePath}\n\`\`\`typescript\n${preview}\n\`\`\``;
    } catch {
      return `### ${filePath}\n_(could not be read — use path as reference)_`;
    }
  }

  /**
   * CRITICAL FIX: Calculate the exact import statement from source file to target file
   * This prevents the LLM from guessing at paths
   * @param sourcePath Current file being generated (e.g., "src/components/LoginForm.tsx")
   * @param targetPath File being imported (e.g., "src/stores/useLoginFormStore.ts")
   * @returns Import statement (e.g., "import { useLoginFormStore } from '../stores/useLoginFormStore';")
   */
  /** Delegates to executor-step-utils.ts. */
  private calculateImportStatement(sourcePath: string, targetPath: string): string | null {
    return calculateImportStatement(sourcePath, targetPath);
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
          // Special case: a READ step that fails with ENOENT means the planner
          // generated a wrong path for a dependency file. Skip it gracefully so
          // the WRITE step for the actual output file can still run. Aborting the
          // plan here would prevent the output file from ever being created.
          if (step.action === 'read' && result!.error?.includes('ENOENT')) {
            const skipMsg = `⚠️ READ step skipped: "${step.path}" not found — continuing without dependency context.`;
            this.config.onMessage?.(skipMsg, 'info');
            plan.results.set(step.stepId, {
              stepId: step.stepId,
              success: true,
              output: skipMsg,
              duration: Date.now() - startTime,
              timestamp: Date.now(),
            });
            succeededSteps++;
            continue; // proceed to next step
          }

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

      // ABSOLUTE PATH CHECK: catch workspace-relative imports used as bare specifiers.
      // e.g. from 'src/stores/authStore' instead of '../stores/authStore'.
      // These look like npm packages but are actually broken path references — block them.
      const absolutePathPrefixes = ['src/', 'app/', 'lib/', 'components/', 'stores/', 'hooks/', 'utils/', 'services/', 'pages/', 'types/'];
      const allBareImports = [...content.matchAll(/from\s+['"]([^.@'"\/][^'"]*)['"]/g)];
      for (const m of allBareImports) {
        const imp = m[1];
        if (absolutePathPrefixes.some(p => imp.startsWith(p))) {
          const relative = imp.replace(/^[^/]+\//, '../');
          integrationErrors.push(
            `❌ ${filePath}: Absolute workspace import '${imp}' will not resolve at runtime. ` +
            `Use a relative path instead: '${relative}'`
          );
        }
      }

      // NPM PACKAGE CHECK: verify bare package imports (e.g. 'react-router-dom', 'zod')
      // are actually in package.json. Only runs when we successfully read package.json.
      if (this.availablePackages.length > 0) {
        // Match bare package imports: 'react-router-dom', '@tanstack/react-query', etc.
        // Exclude relative paths (./ ../), @/ alias paths, node builtins, and workspace paths (caught above).
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
          // Skip workspace-relative paths already caught above
          if (absolutePathPrefixes.some(p => pkgName.startsWith(p))) continue;
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

        // Detect orchestrator/composition steps: when the step description explicitly says
        // to compose, render, or import the sub-components, sibling imports are intentional.
        const compositionSignals = /\b(compos|orchestrat|render.*sub|import.*component|slim.*down.*composing|use.*new.*component)/i;
        const isCompositionStep = compositionSignals.test(step.description ?? '') || compositionSignals.test(step.prompt ?? '');

        const validator = new ArchitectureValidator();
        const contractResult = await validator.validateCrossFileContract(
          content,
          filePath,
          this.config.workspace,
          previousStepFiles.size > 0 ? previousStepFiles : undefined,
          isCompositionStep   // Allow sibling imports for orchestrator steps
        );

        if (contractResult.hasViolations) {
          // Skip "Cannot find module" errors for component-to-component imports.
          // The cross-file contract check is designed to catch store/hook API mismatches
          // (e.g. a component destructures a property that doesn't exist on the store).
          // It is NOT designed to enforce that every imported component file already exists
          // on disk — that is TypeScript's job. Blocking here causes an oscillation loop:
          //   1. LLM imports Input → contract fires (file not found)
          //   2. LLM removes import (uses native <input>) → criterion fires (not using <Input />)
          //   3. Repeat until loop-detected.
          // Rule: skip "Cannot find module" whenever the missing module is in a UI layer
          // (components/, pages/, screens/, views/) for EITHER .ts config OR .tsx component files.
          const contractErrors = contractResult.violations
            .filter(v => {
              if (v.message.includes('Cannot find module')) {
                const moduleRef = v.message.match(/Cannot find module '([^']+)'/)?.[1] ?? '';
                if (/\/(components|pages|screens|views)\//i.test(moduleRef)) {
                  console.log(`[Executor] ℹ️ Skipping UI-layer component import check (not a store contract): ${moduleRef}`);
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

    // Check 4.5: Prop-drilling detection for coordinator (composition) steps in .tsx files.
    // Runs on every validation pass (including inner correction loop re-validations) so SmartAutoCorrection
    // cannot silently clear only the cn() error and declare victory while prop-drilling persists.
    if (filePath.endsWith('.tsx')) {
      const compositionSignalsVGC = /\b(compos|orchestrat|render.*sub|import.*component|slim.*down.*composing|use.*new.*component)/i;
      const isCoordinatorVGC = compositionSignalsVGC.test(step.description ?? '') || compositionSignalsVGC.test(step.prompt ?? '');
      if (isCoordinatorVGC) {
        const hasPropDrilledUserVGC = /(?:^|\s|\()(?:user|currentUser)\s*:\s*User\b/.test(content);
        const hasUserIdPropVGC = /userId\s*:\s*string/.test(content);
        if (hasPropDrilledUserVGC && !hasUserIdPropVGC) {
          errors.push(
            `❌ DATA FETCHING HOOK VIOLATION: coordinator accepts 'user: User' as a prop (prop-drilling). ` +
            `This coordinator MUST have 'userId: string' in its props interface and call the data-fetching hook internally. ` +
            `Correct pattern: interface Props { userId: string } → const { user, loading, error } = useUser(userId). ` +
            `NEVER accept a pre-fetched user object — the coordinator is responsible for data fetching.`
          );
        }
      }

      // Check 4.6: Sub-component user-object coupling.
      // Sub-components (UserAvatar, UserStats, etc.) must NOT accept a 'user' object as a prop —
      // they should accept scalar props (e.g. imageUrl: string, name: string, followingCount: number).
      // Accepting a 'user' prop creates implicit schema coupling and prevents reuse.
      // This check only applies to non-coordinator component steps.
      if (!isCoordinatorVGC && filePath.includes('/components/')) {
        // Detect: any prop named 'user' (or 'currentUser') regardless of its type
        // Pattern: interface XProps { user: ... } or { user: ..., ... }
        const hasUserObjectProp = /(?:interface\s+\w+Props|Props\s*=\s*\{)[^}]*?\buser\s*:\s*(?:\{|User\b)/.test(content) ||
          /\(\s*\{[^}]*\buser\b[^}]*\}\s*:[^)]*\bProps\b/.test(content);
        if (hasUserObjectProp) {
          // Infer likely scalar props from the filename so the correction message is actionable.
          const compName = filePath.split(/[\\/]/).pop()?.replace(/\.tsx?$/, '') ?? 'Component';
          const scalarExample = /[Aa]vatar/.test(compName)
            ? `interface ${compName}Props { imageUrl: string; name: string; className?: string; }`
            : /[Ss]tat/.test(compName)
            ? `interface ${compName}Props { name: string; email: string; age: number; className?: string; }`
            : `interface ${compName}Props { /* scalar fields from the user object */ className?: string; }`;
          errors.push(
            `❌ SCHEMA COUPLING VIOLATION: this sub-component accepts a 'user' object as a prop. ` +
            `Sub-components must NEVER accept an entire user object — use scalar props instead. ` +
            `In ONE edit: (1) change the props interface to scalar fields, (2) remove any User/schema import lines that become unused, (3) keep ALL JSX and render logic intact. ` +
            `Suggested props interface: ${scalarExample}. ` +
            `The coordinator (UserProfile) will extract these values from the hook result and pass them as scalars.`
          );
        }
      }
    }

    // Check 4.7: Schema field fidelity — generated z.object() fields must match source-accessed fields.
    // Catches the LLM inventing field names (e.g. 'username' when source uses 'name').
    if (filePath.endsWith('.ts') && !filePath.endsWith('.tsx') &&
        (filePath.includes('/schemas/') || filePath.includes('/validation/')) && this.plan) {
      const schemaBase = filePath.split(/[\\/]/).pop()!.replace(/\.ts$/, '');
      const entityLower = schemaBase.replace(/[Ss]chema$/, '').replace(/[Vv]alidation$/, '').toLowerCase();
      const inPattern = new RegExp(`'(\\w+)'\\s+in\\s+\\b${entityLower}\\b`, 'g');
      const dotPattern = new RegExp(`\\b${entityLower}\\.(\\w+)\\b`, 'g');
      let sourceText = '';
      for (const prevStep of this.plan.steps) {
        if (prevStep.stepId === step.stepId) continue;
        const prevResult = this.plan.results?.get(prevStep.stepId);
        if (prevStep && prevResult?.success && prevStep.action === 'read' && prevResult.output) {
          const isSummaryText = prevResult.output.startsWith('Read ') && prevResult.output.includes(' bytes)');
          if (!isSummaryText && prevResult.output.length > 0) { sourceText += prevResult.output + '\n'; }
        }
      }
      if (sourceText.length > 0) {
        const inFields = [...sourceText.matchAll(inPattern)].map(m => m[1]);
        const dotFields = [...sourceText.matchAll(dotPattern)].map(m => m[1]);
        const expectedFields = [...new Set([...inFields, ...dotFields])].filter(f => f !== entityLower && f !== 'length');
        if (expectedFields.length > 0) {
          const zObjectMatch = content.match(/z\.object\(\s*\{([^}]+)\}/s);
          if (zObjectMatch) {
            const genFields = new Set([...zObjectMatch[1].matchAll(/(\w+)\s*:/g)].map(m => m[1]));
            const invalidFields = [...genFields].filter(f => !expectedFields.includes(f));
            const missingFields = expectedFields.filter(f => !genFields.has(f));
            if (invalidFields.length > 0 || missingFields.length > 0) {
              const template = expectedFields.map(f => {
                if (f === 'email') { return `  ${f}: z.string().email()`; }
                if (f === 'age') { return `  ${f}: z.number()`; }
                return `  ${f}: z.string()`;
              }).join(',\n');
              errors.push(
                `❌ Schema Field Mismatch: Generated z.object() has [${[...genFields].join(', ')}] ` +
                `but source accesses EXACTLY [${expectedFields.join(', ')}]. ` +
                (invalidFields.length > 0 ? `Remove invented fields: ${invalidFields.join(', ')}. ` : '') +
                (missingFields.length > 0 ? `Add missing fields: ${missingFields.join(', ')}. ` : '') +
                `Required structure:\n  z.object({\n${template},\n  })`
              );
            }
          }
        }
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

  /** Delegates to executor-validator.ts. */
  private validateTypes(content: string, filePath: string): string[] {
    return validateTypes(content, filePath);
  }

  /** Delegates to executor-validator.ts. */
  private validateFormComponentPatterns(content: string, filePath: string): string[] {
    return validateFormComponentPatterns(content, filePath);
  }

  /**
   * Validate common code patterns and syntax issues.
   * Delegates to executor-validator.ts.
   */
  private validateCommonPatterns(content: string, filePath: string): string[] {
    return validateCommonPatterns(content, filePath);
  }



  /** Delegates to executor-validator.ts. */
  private suggestErrorFix(action: string, path: string, error: string): string | null {
    return suggestErrorFix(action, path, error);
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
  /** Delegates to executor-validator.ts. */
  private categorizeValidationErrors(errors: string[]): { critical: string[]; suggestions: string[] } {
    return categorizeValidationErrors(errors);
  }

  /**
   * Build the constraint block for LLM-as-judge validation.
   * Combines the step's scope description with detected project conventions.
   * Delegates to executor-validator.ts.
   */
  private buildValidationConstraints(filePath: string, step: PlanStep): string {
    return buildValidationConstraints(
      filePath,
      step,
      this.config.projectProfile?.getGenerationConstraints()
    );
  }

  /**
   * Architect pre-flight: generate a task-specific acceptance checklist BEFORE code generation.
   * Delegates to executor-llm-prompts.ts.
   */
  private async generateAcceptanceCriteria(step: PlanStep, sourceContent?: string): Promise<string[]> {
    return generateAcceptanceCriteria(
      step,
      sourceContent,
      this.config.llmClient,
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
      this.config.llmClient,
      this.buildValidationConstraints(filePath, step)
    );
  }

  /**
   * Filter validation errors to only return critical errors.
   * Soft suggestions are logged but not returned as validation failures.
   *
   * This prevents the "bully effect" where suggestions distract from hard errors.
   */
  /** Delegates to executor-validator.ts. */
  private filterCriticalErrors(
    errors: string[] | undefined,
    verbose: boolean = false
  ): { critical: string[]; suggestions: string[] } {
    return filterCriticalErrors(errors, verbose, this.config.onMessage);
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


  /** Delegates to executor-step-utils.ts. */
  private reorderStepsByDependencies(steps: PlanStep[]): PlanStep[] {
    return reorderStepsByDependencies(steps);
  }

  // ---------------------------------------------------------------------------
  // Delegation wrappers — logic lives in executor-llm-prompts.ts.
  // ---------------------------------------------------------------------------
  private computeRelativeImportPath(c: string, s: string, i: string) { return computeRelativeImportPath(c, s, i); }
  private buildSurgicalTscPrompt(content: string, errors: string[], fp: string) { return buildSurgicalTscPrompt(content, errors, fp); }
  private applySurgicalTscPatches(content: string, patch: string) { return applySurgicalTscPatches(content, patch); }
  private buildSurgicalValidatorPrompt(content: string, errors: string[], fp: string) { return buildSurgicalValidatorPrompt(content, errors, fp); }
  private applySurgicalValidatorPatches(content: string, patch: string) { return applySurgicalValidatorPatches(content, patch); }

  /** Delegates to executor-step-utils.ts. */
  private getFileBaseName(filePath: string): string { return getFileBaseName(filePath); }

  /** Delegates to executor-step-utils.ts. */
  private stepsAreEqual(steps1: PlanStep[], steps2: PlanStep[]): boolean { return stepsAreEqual(steps1, steps2); }

  /** Delegates to executor-step-utils.ts. */
  private validateDependencies(
    step: PlanStep,
    completedStepIds: Set<string>,
    planStepIds?: Set<string>,
    planStepOrder?: string[]
  ): void { return validateDependencies(step, completedStepIds, planStepIds, planStepOrder); }

  /** Delegates to executor-step-utils.ts. */
  private preFlightCheck(step: PlanStep, workspaceExists: boolean): void {
    return preFlightCheck(step, workspaceExists);
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

  /** Delegates to executor-step-utils.ts. */
  private attemptStrategySwitch(
    step: PlanStep,
    error: string
  ): { message: string; suggestedAction: string; suggestedPath?: string } | null {
    return attemptStrategySwitch(step, error);
  }

  /** Delegates to executor-step-utils.ts. */
  private validateStepContract(step: PlanStep): void { return validateStepContract(step); }

  /** Delegates to executor-step-utils.ts. */
  private sanitizePath(path: string): string { return sanitizePath(path); }

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

  /** Delegates to executor-step-utils.ts. */
  private shouldAskForWrite(filePath: string): boolean { return shouldAskForWrite(filePath); }

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

    // Stage 1: Guard (user confirmation for risky files)
    const guardResult = await this.runWriteGuard(step, startTime);
    if (guardResult) return guardResult;

    try {
      // Stage 2: Multi-step context (previously created files, READ contents, dependency scan)
      const { multiStepContext, sourceReadContents } = await this.buildMultiStepContext(step, workspaceUri);

      // Stage 3: Prompt assembly + acceptance criteria generation
      const { prompt, acceptanceCriteria } = await this.buildWritePromptWithCriteria(step, multiStepContext, sourceReadContents);

      // Stage 4: LLM code generation + markdown cleanup
      this.config.onStepOutput?.(step.stepId, `📝 Generating ${step.path}...`, false);
      const content = await this.generateAndCleanContent(prompt, step);

      // Stage 4.5: Pre-validation deterministic fix for HOC files.
      // Remove unused navigation hook imports (useNavigate, useHistory) before the validator
      // sees them. The LLM frequently co-imports useNavigate alongside <Navigate> even when
      // the pattern explicitly shows only <Navigate>. Removing it here costs 0 fix passes.
      let contentAfterPreFix = content;
      if (isHOCComponent(step.path)) {
        const navHooks = ['useNavigate', 'useHistory', 'useRouter'];
        for (const hook of navHooks) {
          const isCalled = new RegExp(`\\b${hook}\\s*\\(`).test(contentAfterPreFix);
          if (isCalled) continue; // actually used — keep it
          // Remove the hook name from any named import block on the same source
          const importBlockRe = /import\s*\{([^}]+)\}\s*from\s*(['"][^'"]+['"]\s*;?)/g;
          let hookRemoved = false;
          const patched = contentAfterPreFix.replace(importBlockRe, (match, importBody, source) => {
            const names = importBody.split(',').map((s: string) => s.trim()).filter(Boolean);
            const filtered = names.filter((n: string) => n !== hook);
            if (filtered.length === names.length) return match; // hook not in this block
            hookRemoved = true;
            if (filtered.length === 0) return ''; // entire import line removed
            return `import { ${filtered.join(', ')} } from ${source}`;
          });
          if (hookRemoved) {
            console.log(`[Executor] Pre-validation: removed unused '${hook}' from HOC import`);
            contentAfterPreFix = patched;
          }
        }
      }

      // Stage 4.5b: Pre-validation deterministic fix for schema files.
      // The LLM sometimes generates an entire React component inside schemas/ .ts files.
      // When JSX is detected, replace the whole content with a proper Zod schema — stripping
      // individual lines is not enough because JSX tags remain in function bodies.
      if (step.path && (step.path.includes('/schemas/') || step.path.includes('/validation/'))
          && step.path.endsWith('.ts') && !step.path.endsWith('.tsx')) {
        // Exclude TypeScript keyword generics (typeof, keyof, extends, infer) which are NOT JSX
        const hasJsxInSchema = /<(?!typeof\b|keyof\b|extends\b|infer\b|import\b)[A-Za-z][A-Za-z0-9.]*[\s/>]/.test(contentAfterPreFix)
          || /React\.FC|JSX\.Element|ReactElement/.test(contentAfterPreFix)
          || /import React/.test(contentAfterPreFix)
          || /return\s*\(?\s*</.test(contentAfterPreFix);
        if (hasJsxInSchema) {
          console.log(`[Executor] Pre-validation: replacing JSX-contaminated schema file ${step.path} with Zod template`);
          // Derive entity name from filename: userSchema.ts → user → User
          const rawBase = (step.path.split('/').pop() ?? 'entity').replace(/\.ts$/, '');
          const entityRaw = rawBase.replace(/[Ss]chema$/, '').replace(/[Vv]alidation$/, '') || rawBase;
          const entityCap = entityRaw.charAt(0).toUpperCase() + entityRaw.slice(1);
          const schemaVar = `${entityRaw}Schema`;
          // Try to salvage any z.object field lines from the contaminated content
          const zodFieldLines = contentAfterPreFix
            .split('\n')
            .filter(line => /^\s+\w+:\s*z\./.test(line))
            .join('\n');
          const objectBody = zodFieldLines || '  id: z.string(),\n  name: z.string().min(1),\n  email: z.string().email(),';
          contentAfterPreFix =
`import { z } from 'zod';

export const ${schemaVar} = z.object({
${objectBody}
});

export type ${entityCap} = z.infer<typeof ${schemaVar}>;

export const validate${entityCap} = (data: unknown) => ${schemaVar}.parse(data);
`;
        }
      }

      // Stage 5: Pre-write validation + auto-correction loop
      const filePath = vscode.Uri.joinPath(workspaceUri, step.path);
      const matchingSource = sourceReadContents.find(
        r => (r.path.split(/[\\/]/).pop() ?? '') === (step.path.split(/[\\/]/).pop() ?? '')
      );
      const finalContent = await this.validateAndAutoCorrect(step, contentAfterPreFix, matchingSource, acceptanceCriteria);

      // Stage 6: Write to disk + post-write tsc check (Check 6)
      const resolvedContent = await this.writeAndVerify(step, filePath, finalContent, sourceReadContents, matchingSource, workspaceUri);

      // Stage 7: Update CodebaseIndex
      if (this.config.codebaseIndex) {
        this.config.codebaseIndex.addFile(filePath.fsPath, resolvedContent);
      }

      const result: any = {
        stepId: step.stepId,
        success: true,
        output: `Wrote ${step.path} (${resolvedContent.length} bytes)`,
        duration: Date.now() - startTime,
        content: resolvedContent,  // ✅ CRITICAL: Store the actual content for next steps
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


  // ── executeWrite pipeline stages ───────────────────────────────────────────

  /**
   * Stage 1 — Guard: prompt user before writing to risky/important files.
   * Returns a skip StepResult when the user declines, throws on cancel,
   * returns null when it is safe to proceed.
   */
  private async runWriteGuard(step: PlanStep, startTime: number): Promise<StepResult | null> {
    if (!this.shouldAskForWrite(step.path!)) return null;

    console.log(`[Executor] Detected risky write to: ${step.path}`);
    console.log(`[Executor] onQuestion callback exists: ${!!this.config.onQuestion}`);

    const answer = await this.config.onQuestion?.(
      `About to write to important file: \`${step.path}\`\n\nThis is a critical configuration or data file. Should I proceed with writing?`,
      ['Yes, write the file', 'No, skip this step', 'Cancel execution'],
      30000
    );
    console.log(`[Executor] User answered for write: ${answer}`);

    if (answer === 'No, skip this step') {
      return {
        stepId: step.stepId,
        success: true,
        output: `Skipped: ${step.description}`,
        duration: Date.now() - startTime,
      };
    }
    if (answer === 'Cancel execution') {
      throw new Error('User cancelled execution');
    }
    return null; // 'Yes, write the file' or no answer — proceed
  }

  /**
   * Stage 2 — Context: collect previously-written files, READ step contents,
   * and auto-scanned workspace dependencies into a multiStepContext string.
   */
  private async buildMultiStepContext(
    step: PlanStep,
    workspaceUri: vscode.Uri
  ): Promise<{ multiStepContext: string; sourceReadContents: { path: string; content: string }[] }> {
    let multiStepContext = '';
    let sourceReadContents: { path: string; content: string }[] = [];

    if (!this.plan) {
      return { multiStepContext, sourceReadContents };
    }

    const completedSteps = new Map(this.plan.results || new Map());

    // If no prior steps have completed at all, skip context building.
    // Note: we cannot use `step.stepId <= 1` because the planner injects a read step
    // with stepId = maxId+1 (high) but places it first in the array — so steps with
    // low IDs like stepId=1 may still have a completed prior read step.
    const hasCompletedPrior = [...completedSteps.entries()].some(
      ([id, r]) => id !== step.stepId && r.success
    );
    if (!hasCompletedPrior) {
      return { multiStepContext, sourceReadContents };
    }

    // Collect content from prior READ steps.
    // Iterate plan.steps directly (not by stepId index) — injected read steps get
    // stepId = maxId+1 but are placed at array position 0, so `for i < step.stepId`
    // would miss them. Checking completedSteps.get() ensures we only use results
    // that have actually been stored (i.e. the step has already executed).
    const readStepContents: { path: string; content: string }[] = [];
    for (const prevStep of this.plan.steps) {
      if (prevStep.stepId === step.stepId) continue;
      const prevResult = completedSteps.get(prevStep.stepId);
      if (prevStep && prevResult?.success && prevStep.action === 'read' && prevResult.output) {
        const isSummary = prevResult.output.startsWith('Read ') && prevResult.output.includes(' bytes)');
        if (!isSummary && prevResult.output.length > 0) {
          readStepContents.push({ path: prevStep.path, content: prevResult.output });
        }
      }
    }

    // Auto-scan workspace for dependency files the planner forgot to READ
    const workspaceDeps = await this.scanWorkspaceForDependencies(
      step,
      workspaceUri,
      new Set(readStepContents.map(r => r.path))
    );
    if (workspaceDeps.length > 0) {
      readStepContents.push(...workspaceDeps);
    }

    // Collect files written in prior steps
    const previouslyCreatedFiles: string[] = [];
    for (let i = 1; i < step.stepId; i++) {
      const prevStep = this.plan.steps.find(s => s.stepId === i);
      const prevResult = completedSteps.get(i);
      if (prevStep && prevResult?.success && prevStep.action === 'write') {
        previouslyCreatedFiles.push(prevStep.path);
      }
    }

    if (previouslyCreatedFiles.length === 0 && readStepContents.length === 0) {
      return { multiStepContext, sourceReadContents };
    }

    const fileContracts: string[] = [];
    const requiredImports: string[] = [];

    // Detect if this step is a composition/orchestrator step — only those should import
    // previously created sibling components. Peer steps must NOT import each other.
    const compositionSignalsCtx = /\b(compos|orchestrat|render.*sub|import.*component|slim.*down.*composing|use.*new.*component)/i;
    const isCompositionCtx = compositionSignalsCtx.test(step.description ?? '') || compositionSignalsCtx.test(step.prompt ?? '');

    for (const filePath of previouslyCreatedFiles) {
      try {
        const contract = await this.extractFileContract(filePath, workspaceUri);
        fileContracts.push(contract);
        // For non-composition steps: skip .tsx component files in required imports.
        // Adding them causes the LLM to import peer components, triggering the SIBLING RULE.
        const isTsxComponent = filePath.endsWith('.tsx') && filePath.includes('components/');
        if (isTsxComponent && !isCompositionCtx) {
          console.log(`[Executor] Skipping required import for sibling component: ${filePath} (non-composition step)`);
          continue;
        }
        // For non-composition steps: skip schema/validation .ts files in required imports.
        // Adding them causes the LLM to import the User type from the schema, triggering the
        // SCHEMA COUPLING RULE — only the coordinator should import from schemas directly.
        const isSchemaFile = filePath.endsWith('.ts') && (filePath.includes('/schemas/') || filePath.includes('/validation/'));
        if (isSchemaFile && !isCompositionCtx) {
          console.log(`[Executor] Skipping schema import for non-composition step: ${filePath}`);
          continue;
        }
        const importStmt = this.calculateImportStatement(step.path!, filePath);
        if (importStmt) requiredImports.push(importStmt);
      } catch {
        fileContracts.push(`📄 **File** - \`${filePath}\``);
      }
    }

    let importSection = '';
    if (requiredImports.length > 0) {
      importSection = `## REQUIRED IMPORTS
You MUST start your file with these EXACT import statements (copy-paste):

\`\`\`typescript
${requiredImports.join('\n')}
\`\`\`

These are calculated based on actual file paths. Do NOT modify them.
Do NOT create your own import paths - use EXACTLY what's shown above.

`;
    }

    let pathOffsetNote = '';
    if (readStepContents.length > 0 && step.path) {
      const targetDir = step.path.includes('/') ? step.path.substring(0, step.path.lastIndexOf('/')) : '';
      for (const r of readStepContents) {
        const sourceDir = r.path.includes('/') ? r.path.substring(0, r.path.lastIndexOf('/')) : '';
        if (targetDir !== sourceDir && targetDir.startsWith(sourceDir + '/')) {
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

DATA FETCHING HOOK PRESERVATION: If the source file uses a data-fetching hook (e.g. useUser,
useAuth, useFetch, useQuery, useSelector, or any custom use* hook that returns data), you MUST
keep that hook call in the updated file — do NOT replace it with hardcoded mock data or inline
objects, and do NOT convert the component from data-fetching to prop-drilling.
The refactor task is structural (decompose into sub-components), NOT a data-source change.
- WRONG (mock data):    const user = { id: userId, name: "John Doe", email: "..." };
- WRONG (prop-drilling): export const UserProfile = ({ user }: { user: User }) => { ... }
  This removes data-fetching from the component and breaks all existing callers.
- WRONG (any type): user: any[] — never use 'any' as a prop type. The hook's return type is the source of truth.
- WRONG (schema validation as replacement): do NOT call userSchema.safeParse() inside the
  component to replace the hook. The schema is for type inference only (e.g. z.infer<typeof userSchema>),
  not for runtime data fetching.
- RIGHT: Keep 'userId: string' in the props interface and retain the hook:
  const { user, loading, error } = useUser(userId);
  If sub-components need data that the hook does not return (e.g. followersCount, postsCount),
  ADD those as additional props on UserProfile's interface — accept them from the parent.
  NEVER hardcode or invent values (no 'const dummyFollowers = 12345').
  Pass all values through as props: <UserStats followersCount={followersCount} />
If the source does not use a data-fetching hook, do not invent one.

${isCompositionCtx ? `COMPOSITION-ONLY RULE: Your sole job is to compose the extracted sub-components using
data from the existing hook. DO NOT add any of the following:
- useState for editing or form management
- Form submit handlers or onSubmit callbacks
- Inline Zod validation (z.object({...}).parse() inside the component)
- Additional imports beyond what sub-components need
- Any functionality not present in the original source
Correct pattern: 1) call useUser(userId), 2) pass data to <UserAvatar> and <UserStats>, done.
` : ''}`
      : '';

    const createdFilesSection = fileContracts.length > 0
      ? `## CONTEXT: Files Already Created in This Plan
Use the EXACT export names, hook signatures, and prop types shown below — do not guess.

${fileContracts.join('\n\n')}

CRITICAL INTEGRATION RULES:
1. Start with the REQUIRED IMPORTS shown above (copy them exactly)
2. Use ONLY the exports visible in the source above — do NOT invent new API calls
3. For Zustand stores: destructure only fields that appear in the store definition
4. Do NOT create duplicate stores/utilities if they already exist above
5. Do NOT create inline implementations if a shared file already exists
6. ⚠️ SIBLING COMPONENT RULE: The .tsx files listed above are PEER components from the same plan.
   If the REQUIREMENT says to "compose" or "orchestrate" those components, you MUST import them — that is the goal.
   If the REQUIREMENT does NOT say to compose them, do NOT import them — they are siblings, not helpers.
   PEER example (UserStats step — no compose instruction): UserStats must NOT import UserAvatar.
     WRONG: import UserAvatar from './UserAvatar'
     RIGHT:  Accept required data as props (e.g. interface UserStatsProps { age: number; email: string })
   ORCHESTRATOR example (UserProfile step — REQUIREMENT says "compose the new <UserAvatar /> and <UserStats />"):
     CORRECT: import { UserAvatar } from './UserAvatar'; import { UserStats } from './UserStats';
7. ⚠️ SCHEMA ISOLATION RULE: Do NOT import from schemas/ or validation/ directories into a UI component.
   Schema files define Zod/validation shapes for form validation — they are NOT the source of TypeScript
   interfaces for component props. Define component prop interfaces locally (e.g. interface UserAvatarProps).
   WRONG: import { userSchema } from '../schemas/userSchema'  // schema in a component
   RIGHT:  interface UserAvatarProps { name: string; imageUrl?: string }  // local interface

`
      : '';

    multiStepContext = `${readContextSection}${importSection}${createdFilesSection}`;
    sourceReadContents = readStepContents;
    console.log(`[Executor] ℹ️ Injecting multi-step context: ${fileContracts.length} file contract(s), ${requiredImports.length} import(s), ${readStepContents.length} read file(s)`);

    return { multiStepContext, sourceReadContents };
  }

  /**
   * Stage 3 — Prompt: assemble all constraint sections, build the final
   * generation prompt, generate acceptance criteria, and append them.
   */
  private async buildWritePromptWithCriteria(
    step: PlanStep,
    multiStepContext: string,
    sourceReadContents: { path: string; content: string }[]
  ): Promise<{ prompt: string; acceptanceCriteria: string[] }> {
    let prompt = step.prompt || `Generate appropriate content for ${step.path} based on its name.`;

    const intentRequirement = step.description
      ? `REQUIREMENT: ${step.description}\n\n`
      : '';

    // GOLDEN TEMPLATE INJECTION: For known files, inject exact template to copy
    let goldenTemplateSection = '';
    const fileName = step.path!.split('/').pop() || '';
    if (fileName === 'cn.ts' || fileName === 'cn.js') {
      goldenTemplateSection = `GOLDEN TEMPLATE (copy this exactly - do NOT modify):
\`\`\`typescript
${GOLDEN_TEMPLATES.CN_UTILITY}
\`\`\`

Your ONLY job: Output this code exactly. Do NOT modify it.

`;
      console.log(`[Executor] ✅ Injecting golden template for ${fileName}`);
    }

    // REACT IMPORTS INJECTION: single-step React components only
    let reactImportsSection = '';
    const isReactComponent = step.path!.endsWith('.tsx') || step.path!.endsWith('.jsx');
    if (isReactComponent && !multiStepContext) {
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

1. **State Interface** - Define a typed state interface named after your form component. Example: interface RegisterFormState { name: string; email: string; password: string; }
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

    // PROJECT PROFILE CONSTRAINTS
    let profileConstraintsSection = '';
    if (this.config.projectProfile) {
      const constraints = this.config.projectProfile.getGenerationConstraints();
      if (constraints) {
        profileConstraintsSection = `\n${constraints}\n`;
        console.log(`[Executor] ✅ Injecting project profile constraints for ${fileName}`);
      }
    }

    // INTERACTIVE COMPONENT RULES (Button, Input, Select, etc.)
    const interactiveComponentPattern = /\/(Button|Input|Select|Textarea|Checkbox|Radio|Toggle|Switch|Slider)\.[tj]sx?$/i;
    const isInteractiveComponent = interactiveComponentPattern.test(step.path!);
    const componentName = step.path!.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Component';
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

    // NON-INTERACTIVE TSX RULES (form/page/layout components)
    const isNonInteractiveTsx = step.path!.endsWith('.tsx') && !isInteractiveComponent;
    const isNonVisualWrapperTsx = isNonInteractiveTsx && Executor.isNonVisualWrapper(step.path!);
    const isHOCTsx = isNonInteractiveTsx && Executor.isHOCComponent(step.path!);
    const isStructuralLayoutTsx = isNonInteractiveTsx && Executor.isStructuralLayout(step.path!, step.description);
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
        (isHOCTsx
          ? `- HOC RULES (mandatory — this is a Higher-Order Component, NOT a children wrapper):\n` +
            `- NEVER use React.forwardRef — HOCs are plain functions, not ref-forwarders.\n` +
            `- COMPLETE PATTERN (copy this exactly, adapt auth field name from store context):\n` +
            `  import useAuthStore from '../stores/authStore';  // DEFAULT import — no braces\n` +
            `  import { Navigate } from 'react-router-dom';  // ONLY Navigate — NEVER import useNavigate\n` +
            `  export function ${componentName}<P extends object>(Component: React.ComponentType<P>) {\n` +
            `    const Wrapped = (props: P) => {\n` +
            `      const { isLoggedIn } = useAuthStore();  // use the ACTUAL field name from the store\n` +
            `      if (!isLoggedIn) return <Navigate to="/login" replace />;\n` +
            `      return <Component {...props as P} />;\n` +
            `    };\n` +
            `    Wrapped.displayName = \`${componentName}(\${Component.displayName ?? Component.name})\`;\n` +
            `    return Wrapped;\n` +
            `  }\n` +
            `- IMPORT RULES: useAuthStore uses \`export default\` — import WITHOUT braces: \`import useAuthStore from '...'\`\n` +
            `  WRONG: import { useAuthStore } from '../stores/authStore'\n` +
            `  RIGHT:  import useAuthStore from '../stores/authStore'\n` +
            `- NEVER import useNavigate — it will be flagged as an unused import. The declarative\n` +
            `  \`<Navigate to="/login" replace />\` component is the ONLY redirect mechanism for HOCs.\n` +
            `  WRONG: import { useNavigate, Navigate } from 'react-router-dom'\n` +
            `  RIGHT:  import { Navigate } from 'react-router-dom'\n` +
            `- GENERIC: ALWAYS use \`<P extends object>\` — NEVER use \`any\` as the props type workaround.\n` +
            `  WRONG: function ${componentName}(Component: React.ComponentType<any>)\n` +
            `  RIGHT:  function ${componentName}<P extends object>(Component: React.ComponentType<P>)\n` +
            `- REDIRECT: use declarative \`<Navigate to="/login" replace />\` — NEVER \`useNavigate()\` with \`useEffect\`.\n` +
            `  WRONG: const navigate = useNavigate(); useEffect(() => { if (!isLoggedIn) navigate('/login'); }, [...]);\n` +
            `  RIGHT:  if (!isLoggedIn) return <Navigate to="/login" replace />;\n` +
            `- PROPS SPREAD: use \`{...props as P}\` to forward all props through to the wrapped component.\n` +
            `- NEVER accept \`children\` prop — a HOC takes a Component argument, not JSX children.\n` +
            `- NEVER import \`cn\` — HOCs have no styled elements.\n` +
            `- NEVER add loading state (isLoading, isCheckingAuth) unless the store actually exports one.\n` +
            `  Use ONLY the fields the store actually exports — if the store has \`isLoggedIn: boolean\`, use that.\n` +
            `  WRONG: const { isLoggedIn, isLoading } = useAuthStore();  // if isLoading doesn't exist in store\n` +
            `  RIGHT:  const { isLoggedIn } = useAuthStore();  // use only what the store actually exports\n` +
            `- ZUSTAND STATE ACCESS: import and call the store hook DIRECTLY inside the Wrapped component.\n` +
            `  NEVER access state via window, globalThis, or any global object.\n`
          : '') +
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

    // HOOK FILE RULES
    const isHookTarget = /[\\/]hooks[\\/][^/]+\.ts$/.test(step.path!) && !step.path!.endsWith('.tsx');
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

    // ZUSTAND STORE RULES
    const isStoreTarget = /[\\/]store[s]?[\\/][^/]+\.ts$/.test(step.path!) && !step.path!.endsWith('.tsx');
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

    // SCHEMA/VALIDATION FILE RULES (schemas/ or validation/ directories, .ts extension)
    const isSchemaTarget = step.path!.endsWith('.ts') && !step.path!.endsWith('.tsx')
      && (step.path!.includes('/schemas/') || step.path!.includes('/validation/'));
    const existingSchemaContent = isSchemaTarget ? (sourceReadContents[0]?.content ?? '') : '';
    // Derive the canonical schema var name from the filename: userSchema.ts → userSchema, loginSchema.ts → loginSchema
    const schemaFileBase = isSchemaTarget
      ? (step.path!.split('/').pop() ?? 'entity').replace(/\.ts$/, '')
      : 'entity';
    const schemaEntityRaw = schemaFileBase.replace(/[Ss]chema$/, '').replace(/[Vv]alidation$/, '') || schemaFileBase;
    const schemaEntityCap = schemaEntityRaw.charAt(0).toUpperCase() + schemaEntityRaw.slice(1);
    const schemaVarName = schemaFileBase; // e.g. "userSchema" — the PRIMARY export must use this name
    const schemaTypeName = schemaEntityCap; // e.g. "User"
    let schemaConstraintSection = isSchemaTarget
      ? `\nSCHEMA/VALIDATION FILE RULES (mandatory — this is a pure Zod schema file):\n` +
        `- ABSOLUTELY NO JSX: no <elements>, no </tags>, no React components, no render functions\n` +
        `- NEVER import React (default or named) — Zod schemas have zero React dependency\n` +
        `- NEVER use React.FC, JSX.Element, ReactElement, or any React type annotation\n` +
        `- NEVER import from components/, hooks/, pages/, or any UI layer\n` +
        `- ONLY allowed imports: { z } from 'zod' (and optionally zod utilities like z.infer)\n` +
        `- PRIMARY EXPORT NAME (mandatory): The main schema object MUST be named \`${schemaVarName}\`.\n` +
        `  Do NOT split into multiple sub-schemas with different names — use one top-level \`${schemaVarName}\`.\n` +
        `\nFIELD FIDELITY (critical): Model ONLY the fields that appear in the source component shown in\n` +
        `## EXISTING CODEBASE above. Do NOT invent fields (e.g. 'bio', 'id') that are not accessed in\n` +
        `the source. Do NOT drop fields that ARE accessed in the source (e.g. if the source reads\n` +
        `user.age, include age: z.number() in the schema).\n` +
        `\nCORRECT format for this file (${step.path!.split('/').pop()}):\n` +
        `  import { z } from 'zod';\n` +
        `\n` +
        `  export const ${schemaVarName} = z.object({\n` +
        `    // ONLY include fields that the source component actually accesses — derive from the READ file\n` +
        `  });\n` +
        `\n` +
        `  export type ${schemaTypeName} = z.infer<typeof ${schemaVarName}>;\n` +
        `\n` +
        `  export const validate${schemaTypeName} = (data: unknown) => ${schemaVarName}.parse(data);\n` +
        `\n`
      : '';

    // Augment schema constraint with programmatically-extracted field names from source.
    // The step description often invents fields (e.g. "dateOfBirth") that don't exist in the
    // source — the injection below overrides those suggestions with the actual accessed fields.
    if (isSchemaTarget && sourceReadContents.length > 0) {
      const sourceCombined = sourceReadContents.map(r => r.content).join('\n');
      const entityLower = schemaEntityRaw.toLowerCase();
      const dotPattern = new RegExp(`\\b${entityLower}\\.(\\w+)\\b`, 'g');
      const dotFields = [...sourceCombined.matchAll(dotPattern)].map(m => m[1]);
      const inPattern = new RegExp(`'(\\w+)'\\s+in\\s+\\b${entityLower}\\b`, 'g');
      const inFields = [...sourceCombined.matchAll(inPattern)].map(m => m[1]);
      const extractedFields = [...new Set([...dotFields, ...inFields])].filter(f => f !== entityLower);
      if (extractedFields.length > 0) {
        // Build a concrete z.object() template so the LLM cannot misread the field list.
        const fieldLines = extractedFields.map(f => {
          if (f === 'email') { return `  ${f}: z.string().email(),`; }
          if (f === 'age') { return `  ${f}: z.number(),`; }
          return `  ${f}: z.string(),`;
        }).join('\n');
        schemaConstraintSection +=
          `\n⚠️ FIELD OVERRIDE (this rule OVERRIDES any field suggestions in the step description):\n` +
          `The source file accesses EXACTLY these fields: ${extractedFields.join(', ')}.\n` +
          `DO NOT rename fields (e.g. do NOT rename 'age' to 'dateOfBirth' or 'dob').\n` +
          `DO NOT add fields that are not in this list.\n` +
          `Required z.object() structure:\n` +
          `  z.object({\n${fieldLines}\n  })\n`;
      }
    }

    // CONFIG/DATA FILE RULES (.ts non-hook, non-store, non-schema)
    const isConfigOrDataTsTarget = step.path!.endsWith('.ts') && !step.path!.endsWith('.tsx') && !isHookTarget && !isStoreTarget && !isSchemaTarget;
    const configTsFormatExample = (() => {
      if (!isConfigOrDataTsTarget) return '';
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

    // APP ROOT RULES
    const isAppRoot = /(?:^|\/)App\.tsx$/.test(step.path!);
    const appRootSourceRules = (() => {
      if (!isAppRoot) return '';
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

    // NAVIGATION/SIDEBAR COMPONENT RULES (pure presentation, props-only)
    const isDecomposedNavigationTsx = isNonInteractiveTsx && Executor.isDecomposedNavigation(step.path!, step.description);
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

    // AVAILABLE PACKAGES
    const isTypescriptFile = step.path!.endsWith('.ts') || step.path!.endsWith('.tsx');
    const availablePackagesSection = (isTypescriptFile && this.availablePackages.length > 0)
      ? `\nINSTALLED PACKAGES (ONLY import from these — do NOT import from packages not on this list):\n` +
        `${this.availablePackages.join(', ')}\n` +
        `- If a package you want isn't listed, use a different approach (e.g. window.location for navigation, built-in React for state)\n` +
        `- typescript is always available even if not listed\n` +
        (step.path!.endsWith('.tsx') || step.path!.endsWith('.jsx')
          ? `- react and react-dom are available for .tsx/.jsx files even if not listed\n`
          : `- do NOT import react or react-dom in .ts files — they have no JSX\n`) +
        `\n`
      : '';

    // SUB-COMPONENT FIELD OVERRIDE
    // When a non-coordinator .tsx component step has access to the source file, inject the
    // exact fields the source accesses so the LLM doesn't invent props from the step description
    // (e.g. step says "total posts, followers, join date" but source only uses name/email/age).
    const compositionSignalsSub = /\b(compos|orchestrat|render.*sub|import.*component|slim.*down.*composing|use.*new.*component)/i;
    const isCompositionSub = compositionSignalsSub.test(step.description ?? '') || compositionSignalsSub.test(step.prompt ?? '');
    const isSubcomponent = step.path!.endsWith('.tsx') && step.path!.includes('/components/') && !isCompositionSub;
    let subcomponentFieldOverrideSection = '';
    if (isSubcomponent && sourceReadContents.length > 0) {
      const sourceCombined = sourceReadContents.map(r => r.content).join('\n');
      // Collect all entity fields accessed in source (dot-access and 'field' in entity patterns)
      const entityWords = new Set<string>();
      const dotAnyPattern = /\b(\w+)\.(\w+)\b/g;
      for (const m of sourceCombined.matchAll(dotAnyPattern)) {
        const obj = m[1]; const field = m[2];
        if (['React', 'useState', 'useEffect', 'console', 'Math', 'Object', 'Array', 'String', 'Number', 'Boolean', 'window', 'document'].includes(obj)) continue;
        if (field.length > 1 && !/^[A-Z]/.test(field)) entityWords.add(field);
      }
      const inAnyPattern = /'(\w+)'\s+in\s+\b\w+\b/g;
      for (const m of sourceCombined.matchAll(inAnyPattern)) entityWords.add(m[1]);
      // Remove obvious non-prop words
      const SKIP = new Set(['length', 'toString', 'map', 'filter', 'find', 'reduce', 'forEach', 'push', 'pop', 'slice', 'join', 'split', 'includes', 'indexOf', 'trim', 'replace', 'log', 'error', 'warn', 'then', 'catch', 'finally', 'current', 'style', 'className', 'children']);
      const srcFields = [...entityWords].filter(f => !SKIP.has(f));
      if (srcFields.length > 0) {
        subcomponentFieldOverrideSection =
          `\n⚠️ PROPS FIELD OVERRIDE (this rule OVERRIDES any example fields in the REQUIREMENT):\n` +
          `The source file accesses EXACTLY these fields: ${srcFields.join(', ')}.\n` +
          `Your props interface MUST use ONLY fields from this set.\n` +
          `DO NOT invent props like totalPosts, followersCount, joinDate, createdAt, bio, or any field not in the list above.\n` +
          `WRONG example: interface UserStatsProps { joinDate: string; totalPosts: number; followersCount: number }\n` +
          `RIGHT example: interface UserStatsProps { ${srcFields.slice(0, 3).map(f => `${f}: ${f === 'age' ? 'number' : 'string'}`).join('; ')} }\n\n`;
        console.log(`[Executor] ℹ️ Injecting sub-component field override for ${step.path}: [${srcFields.join(', ')}]`);
      }
    }

    // FINAL PROMPT ASSEMBLY
    const fileExtension = step.path!.split('.').pop()?.toLowerCase();
    const isCodeFile = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'json', 'yml', 'yaml', 'html', 'css', 'sh'].includes(fileExtension || '');

    if (isCodeFile) {
      prompt = `You are generating code for a SINGLE file: ${step.path}

${intentRequirement}${reactImportsSection}${multiStepContext}${availablePackagesSection}${subcomponentFieldOverrideSection}${formPatternSection}${goldenTemplateSection}${profileConstraintsSection}${schemaConstraintSection}${hookConstraintSection}${storeConstraintSection}${configTsConstraintSection}${appRootConstraintSection}${navigationConstraintSection}${interactiveComponentSection}${noForwardRefSection}STRICT REQUIREMENTS:
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
- Intermediate const variables for single class strings are dead indirection — inline them directly.

CLASS MERGING RULE (mandatory): Only import a class-merging utility when you actually need to combine classes conditionally.
- ONLY import cn when the component accepts a 'className' prop OR has conditional Tailwind classes driven by props/state (e.g. variant, disabled, active)
- Do NOT import cn for components with static layouts — forms, modals with fixed structure, pages, or any component whose className values never change at runtime
- WRONG: importing cn in a RegisterForm, LoginForm, or SettingsPage that has no className prop and no variant logic
- RIGHT: importing cn in a Button that merges variant classes with an optional className prop
- ALWAYS use cn from the project's utility: import { cn } from '@/utils/cn'  (or relative path e.g. '../utils/cn')
- NEVER import clsx directly from 'clsx' — the project wraps clsx in cn(), use cn() instead
- NEVER pass an empty string as an argument: WRONG: cn('px-4 py-2', '') — RIGHT: cn('px-4 py-2')

Example format (raw code, nothing else):
import React from 'react';
import { cn } from '@/utils/cn';

export const MyComponent = ({ className }: { className?: string }) => {
  return <div className={cn('p-4', className)}>...</div>;
};

Do NOT include: backticks, markdown, explanations, other files, instructions`;
    }

    // Acceptance criteria: generated by architect pre-flight, injected into prompt
    const acceptanceCriteria = await this.generateAcceptanceCriteria(step, sourceReadContents[0]?.content);
    if (acceptanceCriteria.length > 0) {
      const criteriaBlock =
        '\nACCEPTANCE CRITERIA (Reviewer will check each — your code MUST satisfy all):\n' +
        acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n') + '\n';
      prompt += criteriaBlock;
    }

    return { prompt, acceptanceCriteria };
  }

  /**
   * Stage 4 — Generate: call the LLM and strip markdown wrappers from the response.
   */
  private async generateAndCleanContent(prompt: string, step: PlanStep): Promise<string> {
    const response = await this.config.llmClient.sendMessage(prompt);
    if (!response.success) {
      throw new Error(response.error || 'LLM request failed');
    }

    const fileExtension = step.path!.split('.').pop()?.toLowerCase();
    const isCodeFile = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'json', 'yml', 'yaml', 'html', 'css', 'sh'].includes(fileExtension || '');

    let content = response.message || '';

    const hasMarkdownBackticks = content.includes('```');
    const hasExcessiveComments = (content.match(/^\/\//gm) || []).length > 5;
    const hasMultipleFileInstructions = (content.match(/\/\/\s*(Create|Setup|In|Step|First|Then|Next|Install)/gi) || []).length > 2;
    const hasYAMLOrConfigMarkers = content.includes('---') || content.includes('package.json') || content.includes('tsconfig');

    if (hasMarkdownBackticks) {
      const codeBlockMatch = content.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) content = codeBlockMatch[1];
    }

    if (isCodeFile && (hasExcessiveComments || hasMultipleFileInstructions || hasYAMLOrConfigMarkers)) {
      this.config.onMessage?.(
        `⚠️ Warning: LLM provided documentation/setup instructions instead of executable code. Validation will catch this.`,
        'info'
      );
    }

    if (isCodeFile && !hasMarkdownBackticks) {
      content = content
        .replace(/^[\s\S]*?(?=^import|^export|^const|^function|^class|^interface|^type|^\/\/)/m, '')
        .replace(/\n\n\n[#\-\*\s]*Installation[\s\S]*?(?=\n\n|$)/i, '')
        .replace(/\n\n\n[#\-\*\s]*Setup[\s\S]*?(?=\n\n|$)/i, '')
        .trim();
    }

    return content;
  }

  /**
   * Stage 5 — Validate: run all pre-write validation checks and auto-correction loop.
   * Returns the validated (and possibly corrected) content ready to write to disk.
   */
  private async validateAndAutoCorrect(
    step: PlanStep,
    content: string,
    matchingSource: { path: string; content: string } | undefined,
    acceptanceCriteria: string[]
  ): Promise<string> {
    const fileExtension = step.path!.split('.').pop()?.toLowerCase();
    let finalContent = content;

    if (!['ts', 'tsx', 'js', 'jsx'].includes(fileExtension || '')) {
      // Non-code files (JSON, YAML, etc) — skip validation
      this.config.onMessage?.(`✅ Skipping validation for non-code file ${step.path}`, 'info');
      return finalContent;
    }

    this.config.onMessage?.(`🔍 Validating ${step.path}...`, 'info');

    const validationResult = await this.validateGeneratedCode(step.path!, content, step, acceptanceCriteria);

    // CALLBACK PRESERVATION CHECK
    if (matchingSource) {
      const cbErrors = Executor.collectCallbackErrors(content, matchingSource.content);
      if (cbErrors.length > 0) {
        validationResult.errors = validationResult.errors ?? [];
        validationResult.errors.push(...cbErrors);
      }

      // DATA FETCHING HOOK PRESERVATION: if source had a custom data-fetching hook,
      // the updated file must also call it. Catches prop-drilling replacement.
      const REACT_BUILTIN_HOOKS = new Set([
        'useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext',
        'useReducer', 'useId', 'useLayoutEffect', 'useInsertionEffect',
        'useDeferredValue', 'useTransition', 'useSyncExternalStore',
        'useImperativeHandle', 'useDebugValue',
      ]);
      const sourceHookMatches = [...matchingSource.content.matchAll(/\b(use[A-Z]\w*)\s*\(/g)];
      const missingHooks = sourceHookMatches
        .map(m => m[1])
        .filter(h => !REACT_BUILTIN_HOOKS.has(h))
        .filter(h => !content.includes(h + '('));
      if (missingHooks.length > 0) {
        validationResult.errors = validationResult.errors ?? [];
        for (const hook of missingHooks) {
          // Extract the exact import path for this hook from the source file so the LLM
          // uses the correct relative path (not an invented @/ alias path).
          const hookImportMatch = matchingSource.content.match(
            new RegExp(`import\\s+\\{[^}]*\\b${hook}\\b[^}]*\\}\\s+from\\s+['"]([^'"]+)['"]`)
          );
          const hookImportPath = hookImportMatch ? hookImportMatch[1] : `../hooks/${hook.replace(/^use/, '').toLowerCase()}`;
          validationResult.errors.push(
            `❌ DATA FETCHING HOOK VIOLATION: '${hook}()' was called in the source file but is missing from the updated component. ` +
            `Do NOT remove data-fetching hooks during decomposition — they are the component's data source. ` +
            `Add: import { ${hook} } from '${hookImportPath}'; then call: const { user, loading, error } = ${hook}(userId). ` +
            `Keep 'userId: string' in the props interface. ` +
            `If sub-components need data the hook doesn't return (e.g. followersCount), add it to the props interface — do NOT hardcode values. ` +
            `Pass data as props to sub-components: <UserAvatar imageUrl={user.imageUrl} name={user.name} />.`
          );
        }
      }
    }

    const { critical: criticalErrors, suggestions: softSuggestions } = this.filterCriticalErrors(
      validationResult.errors,
      true
    );

    if (criticalErrors.length === 0) {
      // Apply smart cleanup for actionable suggestions (e.g. dead cn import in .tsx)
      const actionableSuggestions = softSuggestions.filter(
        s => s.includes('Dead import') && s.includes('cn')
      );
      if (actionableSuggestions.length > 0) {
        const ragResolver = (this.config.codebaseIndex && this.config.embeddingClient)
          ? (name: string) => this.config.codebaseIndex!.resolveExportSource(name, this.config.embeddingClient!)
          : () => Promise.resolve(null);
        content = await SmartAutoCorrection.fixCommonPatternsAsync(
          content, actionableSuggestions, ragResolver, step.path!
        );
      }
      this.config.onMessage?.(`✅ Validation passed for ${step.path}`, 'info');
      return content;
    }

    // ❌ CRITICAL ERRORS FOUND — Auto-correction loop
    let validationAttempt = 1;
    let currentContent = content;
    let lastCriticalErrors = criticalErrors;
    let loopDetected = false;
    let previousAttemptErrors: string[] = [];
    let consecutiveSameErrors = 0;
    const recentErrorFingerprints: string[] = [];

    while (validationAttempt <= this.MAX_VALIDATION_ITERATIONS && !loopDetected) {
      const errorList = lastCriticalErrors.map((e, i) => `  ${i + 1}. ${e}`).join('\n');
      this.config.onMessage?.(
        `❌ Critical validation errors (attempt ${validationAttempt}/${this.MAX_VALIDATION_ITERATIONS}) for ${step.path}:\n${errorList}`,
        'error'
      );

      const currentFingerprint = JSON.stringify([...lastCriticalErrors].sort());

      if (
        previousAttemptErrors.length > 0 &&
        currentFingerprint === JSON.stringify([...previousAttemptErrors].sort())
      ) {
        consecutiveSameErrors++;
      } else {
        consecutiveSameErrors = 0;
      }
      previousAttemptErrors = [...lastCriticalErrors];

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

      // DETERMINISTIC CALLBACK SPLICER
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
            const splicedCbErrors = Executor.collectCallbackErrors(spliced, matchingSource.content);
            const resolvedCount = missingCbErrors.length - splicedCbErrors.filter(
              e => e.includes('missing from the generated output')
            ).length;
            if (resolvedCount > 0) {
              console.log(`[Executor] Spliced ${resolvedCount} missing callback handler(s): ${missingNames.join(', ')}`);
              currentContent = spliced;
              lastCriticalErrors = [
                ...lastCriticalErrors.filter(e => !missingCbErrors.includes(e)),
                ...splicedCbErrors,
              ];
              if (lastCriticalErrors.length === 0) {
                finalContent = spliced;
                this.config.onMessage?.(`✅ Deterministic callback splice resolved all errors.`, 'info');
                break;
              }
            }
          }
        }
      }

      if (validationAttempt === this.MAX_VALIDATION_ITERATIONS) {
        const remainingErrors = lastCriticalErrors.map((e, i) => `  ${i + 1}. ${e}`).join('\n');
        this.config.onMessage?.(
          `❌ Max validation attempts (${this.MAX_VALIDATION_ITERATIONS}) reached. Remaining issues:\n${remainingErrors}\n\nPlease fix manually in the editor.`,
          'error'
        );
        throw new Error(`Validation failed after ${this.MAX_VALIDATION_ITERATIONS} attempts.\n${remainingErrors}`);
      }

      this.config.onMessage?.(
        `🔧 Attempting auto-correction (attempt ${validationAttempt}/${this.MAX_VALIDATION_ITERATIONS})...`,
        'info'
      );

      // Fast-path: forwardRef missing displayName is a pure append — no LLM needed
      const displayNameError = lastCriticalErrors.find(e => e.includes('forwardRef missing displayName'));
      if (displayNameError && lastCriticalErrors.length === 1) {
        const compNameMatch = displayNameError.match(/Add `(\w+)\.displayName/);
        if (compNameMatch) {
          const compName = compNameMatch[1];
          const patched = currentContent.trimEnd() + `\n${compName}.displayName = '${compName}';\n`;
          const patchValidation = await this.validateGeneratedCode(step.path!, patched, step, acceptanceCriteria);
          const { critical: patchCritical } = this.filterCriticalErrors(patchValidation.errors, false);
          if (patchCritical.length === 0) {
            currentContent = patched;
            lastCriticalErrors = [];
            break;
          }
        }
      }

      const canAutoFix = SmartAutoCorrection.isAutoFixable(lastCriticalErrors);
      let correctedContent: string;

      const hasJsxInTsError = step.path!.endsWith('.ts') && !step.path!.endsWith('.tsx') &&
        lastCriticalErrors.some(e => e.includes('Wrong file extension') || e.includes('contains JSX'));

      if (canAutoFix) {
        this.config.onMessage?.(`🧠 Attempting smart auto-correction (circular imports, missing/unused imports, etc.)...`, 'info');
        const ragResolver = (this.config.codebaseIndex && this.config.embeddingClient)
          ? (name: string) => this.config.codebaseIndex!.resolveExportSource(name, this.config.embeddingClient!)
          : () => Promise.resolve(null);
        const smartFixed = await SmartAutoCorrection.fixCommonPatternsAsync(
          currentContent, lastCriticalErrors, ragResolver, step.path!
        );

        const smartValidation = await this.validateGeneratedCode(step.path!, smartFixed, step, acceptanceCriteria);
        const { critical: criticalAfterFix, suggestions: suggestionsAfterFix } = this.filterCriticalErrors(
          smartValidation.errors,
          false
        );

        if (criticalAfterFix.length === 0) {
          this.config.onMessage?.(
            `✅ Smart auto-correction successful! Fixed: ${lastCriticalErrors.slice(0, 2).map(e => e.split(':')[0]).join(', ')}${lastCriticalErrors.length > 2 ? ', ...' : ''}`,
            'info'
          );
          if (suggestionsAfterFix.length > 0) {
            this.config.onMessage?.(
              `⚠️ Remaining suggestions: ${suggestionsAfterFix.map(s => s.replace(/⚠️/g, '').trim()).join('; ')}`,
              'info'
            );
          }
          correctedContent = smartFixed;
        } else {
          this.config.onMessage?.(`⚠️ Smart fix incomplete, using LLM for context-aware correction...`, 'info');
          correctedContent = await this.llmCorrectContent(currentContent, lastCriticalErrors, step, hasJsxInTsError, acceptanceCriteria);
        }
      } else {
        this.config.onMessage?.(`🤖 Using LLM for context-aware correction (complex errors detected)...`, 'info');
        correctedContent = await this.llmCorrectContent(currentContent, lastCriticalErrors, step, hasJsxInTsError, acceptanceCriteria);
      }

      // Re-validate the corrected code
      const nextValidation = await this.validateGeneratedCode(step.path!, correctedContent, step, acceptanceCriteria);
      if (matchingSource) {
        const cbErrors = Executor.collectCallbackErrors(correctedContent, matchingSource.content);
        if (cbErrors.length > 0) {
          nextValidation.errors = nextValidation.errors ?? [];
          nextValidation.errors.push(...cbErrors);
        }
        // Re-run hook check — auto-correction can silently remove hooks that it treats as
        // "unused" variables (when the hook result isn't referenced in the corrected output).
        const REACT_BUILTIN_HOOKS_RECHECK = new Set([
          'useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext',
          'useReducer', 'useId', 'useLayoutEffect', 'useInsertionEffect',
          'useDeferredValue', 'useTransition', 'useSyncExternalStore',
          'useImperativeHandle', 'useDebugValue',
        ]);
        const reHookMatches = [...matchingSource.content.matchAll(/\b(use[A-Z]\w*)\s*\(/g)];
        const reRemovedHooks = reHookMatches
          .map(m => m[1])
          .filter(h => !REACT_BUILTIN_HOOKS_RECHECK.has(h))
          .filter(h => !correctedContent.includes(h + '('));
        if (reRemovedHooks.length > 0) {
          nextValidation.errors = nextValidation.errors ?? [];
          for (const hook of reRemovedHooks) {
            const reHookImportMatch = matchingSource.content.match(
              new RegExp(`import\\s+\\{[^}]*\\b${hook}\\b[^}]*\\}\\s+from\\s+['"]([^'"]+)['"]`)
            );
            const reHookPath = reHookImportMatch ? reHookImportMatch[1] : `../hooks/${hook.replace(/^use/, '').toLowerCase()}`;
            nextValidation.errors.push(
              `❌ DATA FETCHING HOOK VIOLATION: auto-correction removed '${hook}()'. ` +
              `Add: import { ${hook} } from '${reHookPath}'; then call: const { user } = ${hook}(userId). ` +
              `Keep 'userId: string' in the interface. ` +
              `Add any extra props sub-components need (e.g. followersCount: number) — NEVER hardcode them. ` +
              `Pass data as props: <UserStats followersCount={user.followersCount} />.`
            );
          }
        }
      }
      const { critical: nextCritical, suggestions: nextSuggestions } = this.filterCriticalErrors(
        nextValidation.errors,
        false
      );

      if (nextCritical.length === 0) {
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

      currentContent = correctedContent;
      lastCriticalErrors = nextCritical;
      validationAttempt++;
    }

    if (loopDetected) {
      throw new Error(`Validation loop detected - infinite correction cycle prevented. Please fix manually.`);
    }

    return finalContent;
  }

  /**
   * Shared LLM correction helper used by validateAndAutoCorrect.
   * Chooses whole-file rewrite for JSX-in-.ts errors; surgical patches otherwise.
   */
  private async llmCorrectContent(
    currentContent: string,
    lastCriticalErrors: string[],
    step: PlanStep,
    hasJsxInTsError: boolean,
    acceptanceCriteria: string[]
  ): Promise<string> {
    const formattedErrors = lastCriticalErrors.map((e, i) => {
      if (e.includes('Hook') && e.includes('imported but never called')) {
        const hookMatch = e.match(/Hook '(\w+)'/);
        const hookName = hookMatch ? hookMatch[1] : 'hook';
        // Navigation router hooks should be REMOVED, not called — calling useNavigate() conflicts
        // with declarative <Navigate> and triggers criteria violations (two contradictory rules).
        if (/^use(Navigate|Location|Params|SearchParams|Match)$/.test(hookName)) {
          return `${i + 1}. ${e}\n   ACTION: REMOVE '${hookName}' from the import line — do NOT call it. ` +
            `Use the declarative <Navigate to="..." replace /> component for redirects instead. ` +
            `Delete '${hookName}' from the import and do not add a ${hookName}() call.`;
        }
        const callExample = (hookName.endsWith('Store') || hookName.toLowerCase().includes('store'))
          ? `const { fieldA, fieldB, setFieldA } = ${hookName}();`
          : `const value = ${hookName}();`;
        return `${i + 1}. ${e}\n   ACTION: Remove the unused import OR call the hook at the top level of the component body. Example: ${callExample}`;
      }
      return `${i + 1}. ${e}`;
    }).join('\n');

    if (hasJsxInTsError) {
      const isSchemaFile = step.path!.includes('/schemas/') || step.path!.includes('/validation/');
      const fixPrompt = isSchemaFile
        ? `The schema file ${step.path} INCORRECTLY contains JSX/React code. It must be rewritten as a pure Zod schema.\n\nCURRENT (WRONG — has JSX):\n${currentContent}\n\nCRITICAL: This is a SCHEMA/VALIDATION file. NO JSX, NO React, NO components.\nRewrite it in this exact format:\n\nimport { z } from 'zod';\n\nexport const [entityName]Schema = z.object({\n  // keep all fields from the wrong code, expressed as zod validators\n});\n\nexport type [EntityName] = z.infer<typeof [entityName]Schema>;\n\nexport const validate[EntityName] = (data: unknown) => [entityName]Schema.parse(data);\n\nProvide ONLY the corrected TypeScript/Zod code. No explanations, no markdown.`
        : `The following code for ${step.path} has CRITICAL validation errors that MUST be fixed.\n\nCURRENT CODE:\n${currentContent}\n\nERRORS TO FIX:\n${formattedErrors}\n\nCRITICAL: This is a .ts (NOT .tsx) file. REMOVE ALL JSX — no angle brackets, no JSX expressions, no renderRoutes(), no React.FC. Replace component-type references with \`import type { ComponentType } from 'react'\`. Keep only TypeScript interfaces, type aliases, plain objects, and data arrays. NEVER add 'any' type. Provide ONLY the corrected code. No explanations, no markdown.`;
      const fixResponse = await this.config.llmClient.sendMessage(fixPrompt);
      if (!fixResponse.success) throw new Error(`Auto-correction attempt failed: ${fixResponse.error || 'LLM error'}`);
      let result = fixResponse.message || '';
      const fence = result.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/);
      if (fence) result = fence[1];
      return result;
    }

    // SCHEMA COUPLING VIOLATION requires a full-file rewrite — the surgical patch format
    // produces a cascade (fix user: User prop → User import unused → remove import → lose JSX).
    // Use a whole-file prompt instead so all three changes happen atomically in one LLM call.
    const hasSchemaCouplingError = lastCriticalErrors.some(e => e.includes('SCHEMA COUPLING VIOLATION'));
    if (hasSchemaCouplingError && step.path?.endsWith('.tsx')) {
      const schemaCouplingPrompt =
        `The following React component has a SCHEMA COUPLING VIOLATION that must be fixed.\n\n` +
        `FILE: ${step.path}\n\nCURRENT CODE:\n${currentContent}\n\n` +
        `ERROR: ${lastCriticalErrors.find(e => e.includes('SCHEMA COUPLING VIOLATION'))}\n\n` +
        `REWRITE INSTRUCTIONS — do ALL of these in one edit:\n` +
        `1. Change the props interface: remove the 'user' object prop, replace with scalar props ` +
        `   (e.g. imageUrl: string, name: string for Avatar; name: string, email: string, age: number for Stats).\n` +
        `2. Remove ALL import lines that import User/schema types (they are now unused).\n` +
        `3. Keep ALL JSX and render logic intact — update JSX attribute references to use the new scalar props.\n` +
        `4. Keep import React and import { cn } lines.\n` +
        `NEVER return a file without a JSX return statement. NEVER return only types or interfaces.\n` +
        `Provide ONLY the corrected complete TypeScript/React file. No explanations, no markdown.`;
      const schemaCouplingResp = await this.config.llmClient.sendMessage(schemaCouplingPrompt);
      if (!schemaCouplingResp.success) throw new Error(`Auto-correction attempt failed: ${schemaCouplingResp.error || 'LLM error'}`);
      let schemaCouplingResult = schemaCouplingResp.message || '';
      const scFence = schemaCouplingResult.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/);
      if (scFence) schemaCouplingResult = scFence[1];
      return schemaCouplingResult;
    }

    const surgicalPrompt = this.buildSurgicalValidatorPrompt(currentContent, lastCriticalErrors, step.path!);
    const surgicalResponse = await this.config.llmClient.sendMessage(surgicalPrompt);
    if (!surgicalResponse.success) throw new Error(`Auto-correction attempt failed: ${surgicalResponse.error || 'LLM error'}`);
    const patched = this.applySurgicalValidatorPatches(currentContent, surgicalResponse.message || '');
    if (patched) return patched;
    // Patch parsing failed — strip fences and treat as whole-file fallback
    let result = surgicalResponse.message || '';
    const fence = result.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/);
    if (fence) result = fence[1];
    return result;
  }

  /**
   * Stage 6 — Write & Verify: write validated content to disk, run post-write
   * tsc check (Check 6), and return the final (possibly tsc-corrected) content.
   */
  private async writeAndVerify(
    step: PlanStep,
    filePath: vscode.Uri,
    finalContent: string,
    sourceReadContents: { path: string; content: string }[],
    matchingSource: { path: string; content: string } | undefined,
    workspaceUri: vscode.Uri
  ): Promise<string> {
    const fileExtension = step.path!.split('.').pop()?.toLowerCase();

    // Show preview of final (validated) content
    if (this.config.onStepOutput && finalContent.length > 0) {
      const preview = finalContent.length > 200
        ? `\`\`\`${fileExtension || ''}\n${finalContent.substring(0, 200)}...\n\`\`\``
        : `\`\`\`${fileExtension || ''}\n${finalContent}\n\`\`\``;
      this.config.onStepOutput(step.stepId, preview, false);
    }

    // Write file
    const bytes = new Uint8Array(finalContent.length);
    for (let i = 0; i < finalContent.length; i++) {
      bytes[i] = finalContent.charCodeAt(i);
    }
    await vscode.workspace.fs.writeFile(filePath, bytes);

    // Check 6: TypeScript compiler (ground truth — runs post-write so tsc sees the file)
    const isTsFile = step.path!.endsWith('.ts') || step.path!.endsWith('.tsx');
    if (!isTsFile || !workspaceUri) return finalContent;

    // Pass 0.3: pre-emptive named→default import fix (filesystem-based, no tsc needed)
    // Scan `import { X } from 'path'` statements. If the resolved file has `export default X`
    // but NO named export for X, convert to `import X from 'path'` before tsc runs.
    // This catches the common LLM mistake of using named imports for default-export stores/hooks.
    {
      const targetDir = path.dirname(path.join(workspaceUri.fsPath, step.path!));
      const namedImportScanRe = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
      let p03Content = finalContent;
      let p03Changed = false;
      let p03Match: RegExpExecArray | null;
      while ((p03Match = namedImportScanRe.exec(finalContent)) !== null) {
        const [fullMatch, importedBlock, modulePath] = p03Match;
        // Only handle relative imports (start with . or ..)
        if (!modulePath.startsWith('.')) continue;
        const names = importedBlock.split(',').map((s: string) => s.trim()).filter(Boolean);
        // Resolve module path with extension candidates
        const exts = ['', '.ts', '.tsx', '.js', '.jsx'];
        let resolvedPath: string | null = null;
        for (const ext of exts) {
          const candidate = path.join(targetDir, modulePath + ext);
          if (fs.existsSync(candidate)) { resolvedPath = candidate; break; }
        }
        if (!resolvedPath) continue;
        let moduleSource: string;
        try { moduleSource = fs.readFileSync(resolvedPath, 'utf8'); } catch { continue; }
        for (const name of names) {
          const hasDefaultExport = new RegExp(`export\\s+default\\s+${name}\\b`).test(moduleSource);
          const hasNamedExport =
            new RegExp(`export\\s+(?:const|function|class|let|var)\\s+${name}\\b`).test(moduleSource) ||
            new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(moduleSource);
          if (hasDefaultExport && !hasNamedExport) {
            const otherNames = names.filter((n: string) => n !== name);
            const defaultLine = `import ${name} from '${modulePath}'`;
            const replacement = otherNames.length > 0
              ? `${defaultLine};\nimport { ${otherNames.join(', ')} } from '${modulePath}'`
              : defaultLine;
            p03Content = p03Content.replace(fullMatch, replacement);
            p03Changed = true;
          }
        }
      }
      if (p03Changed) {
        this.config.onMessage?.(`🔧 Pre-emptive fix: named→default import (filesystem check)...`, 'info');
        finalContent = p03Content;
        await vscode.workspace.fs.writeFile(filePath, Buffer.from(finalContent, 'utf8'));
      }
    }

    this.config.onMessage?.(`🔎 Check 6: TypeScript compiler...`, 'info');
    let tscErrors = await this.runTscCheck(workspaceUri.fsPath, step.path!);

    if (tscErrors.length === 0) {
      this.config.onMessage?.(`✅ Check 6: TypeScript clean.`, 'info');
      return finalContent;
    }

    this.config.onMessage?.(
      `⚠️ ${tscErrors.length} TypeScript error(s) in ${step.path}:\n` +
      tscErrors.map(e => `  ${e}`).join('\n'),
      'info'
    );

    // Pass 0: deterministic fixes before LLM
    const deterministicFixed = SmartAutoCorrection.fixCommonPatterns(finalContent, tscErrors, step.path!);
    if (deterministicFixed !== finalContent) {
      this.config.onMessage?.(`🔧 Applying deterministic TypeScript fixes...`, 'info');
      finalContent = deterministicFixed;
      const detBytes = Buffer.from(finalContent, 'utf8');
      await vscode.workspace.fs.writeFile(filePath, detBytes);
      tscErrors = await this.runTscCheck(workspaceUri.fsPath, step.path!);
    }

    // Pass 0.5: deterministic import resolver for TS2304 "Cannot find name 'X'"
    const ts2304Names = tscErrors
      .filter(e => e.includes('TS2304'))
      .map(e => { const m = e.match(/Cannot find name '(\w+)'/); return m?.[1] ?? ''; })
      .filter(Boolean);

    if (ts2304Names.length > 0) {
      let resolvedContent = finalContent;
      const allSources: { path: string; content: string }[] = [...sourceReadContents];
      if (matchingSource && !allSources.find(s => s.path === matchingSource.path)) {
        allSources.unshift(matchingSource);
      }

      for (const unknownName of ts2304Names) {
        const importLines = resolvedContent.split('\n').filter(l => l.trimStart().startsWith('import'));
        if (new RegExp(`\\b${unknownName}\\b`).test(importLines.join('\n'))) continue;

        for (const src of allSources) {
          const defaultRe = new RegExp(`import\\s+${unknownName}\\s+from\\s+(['"])([^'"]+)\\1`);
          const namedRe = new RegExp(`import\\s+\\{[^}]*\\b${unknownName}\\b[^}]*\\}\\s+from\\s+(['"])([^'"]+)\\1`);
          const defaultMatch = src.content.match(defaultRe);
          const namedMatch = src.content.match(namedRe);

          let importStatement: string | null = null;
          if (defaultMatch) {
            const relPath = this.computeRelativeImportPath(step.path!, src.path, defaultMatch[2]);
            importStatement = `import ${unknownName} from '${relPath}';`;
          } else if (namedMatch) {
            const relPath = this.computeRelativeImportPath(step.path!, src.path, namedMatch[2]);
            importStatement = `import { ${unknownName} } from '${relPath}';`;
          }

          if (importStatement && !resolvedContent.includes(importStatement)) {
            const importLineMatches = [...resolvedContent.matchAll(/^import[^\n]*\n/gm)];
            if (importLineMatches.length > 0) {
              const last = importLineMatches[importLineMatches.length - 1];
              const insertPos = last.index! + last[0].length;
              resolvedContent = resolvedContent.slice(0, insertPos) + importStatement + '\n' + resolvedContent.slice(insertPos);
            } else {
              resolvedContent = importStatement + '\n' + resolvedContent;
            }
            break;
          }
        }
      }

      if (resolvedContent !== finalContent) {
        this.config.onMessage?.(`🔧 Resolving missing imports deterministically (TS2304)...`, 'info');
        finalContent = resolvedContent;
        await vscode.workspace.fs.writeFile(filePath, Buffer.from(finalContent, 'utf8'));
        tscErrors = await this.runTscCheck(workspaceUri.fsPath, step.path!);
      }
    }

    // Pass 0.6: deterministic fix for TS2614 "Module has no exported member X"
    // This fires when the LLM generates `import { useAuthStore }` but the store uses `export default`.
    // The TypeScript error already contains the suggested fix — apply it without an LLM call.
    const ts2614Errors = tscErrors.filter(e => e.includes('TS2614'));
    if (ts2614Errors.length > 0) {
      let ts2614Fixed = finalContent;
      for (const err of ts2614Errors) {
        // Error format: Module '"../stores/authStore"' has no exported member 'useAuthStore'. Did you mean to use 'import useAuthStore from "../stores/authStore"' instead?
        const m = err.match(/Module '"([^'"]+)"' has no exported member '(\w+)'/);
        if (!m) continue;
        const [, modulePath, memberName] = m;
        const escapedPath = modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedName = memberName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Replace named import `import { memberName, ...rest } from 'path'` with default import.
        // If other names are in the same import, split them into a separate named import.
        const namedImportRe = new RegExp(
          `import\\s+\\{([^}]*)\\b${escapedName}\\b([^}]*)\\}\\s+from\\s+(['"])${escapedPath}\\3;?`,
          'g'
        );
        ts2614Fixed = ts2614Fixed.replace(namedImportRe, (_match, before, after) => {
          const rest = (before + after).split(',').map((s: string) => s.trim()).filter(Boolean);
          const defaultImport = `import ${memberName} from '${modulePath}';`;
          return rest.length > 0
            ? defaultImport + `\nimport { ${rest.join(', ')} } from '${modulePath}';`
            : defaultImport;
        });
      }
      if (ts2614Fixed !== finalContent) {
        this.config.onMessage?.(`🔧 Fixing named→default import (TS2614) deterministically...`, 'info');
        finalContent = ts2614Fixed;
        await vscode.workspace.fs.writeFile(filePath, Buffer.from(finalContent, 'utf8'));
        tscErrors = await this.runTscCheck(workspaceUri.fsPath, step.path!);
      }
    }

    // Compute custom hooks from source (for hook-preservation guard inside the loop).
    const REACT_BUILTIN_TSC = new Set([
      'useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext',
      'useReducer', 'useId', 'useLayoutEffect', 'useInsertionEffect',
      'useDeferredValue', 'useTransition', 'useSyncExternalStore',
      'useImperativeHandle', 'useDebugValue',
    ]);
    const sourceCustomHooks = matchingSource
      ? [...matchingSource.content.matchAll(/\b(use[A-Z]\w*)\s*\(/g)]
          .map(m => m[1])
          .filter(h => !REACT_BUILTIN_TSC.has(h))
      : [];

    // Up to 2 LLM correction passes if errors remain
    for (let tscPass = 0; tscPass < 2 && tscErrors.length > 0; tscPass++) {
      this.config.onMessage?.(`🔧 Fixing TypeScript errors (pass ${tscPass + 1}/2)...`, 'info');

      const surgicalPrompt = this.buildSurgicalTscPrompt(finalContent, tscErrors, step.path!);
      let corrected: string | null = null;

      if (surgicalPrompt) {
        const surgicalResponse = await this.config.llmClient.sendMessage(surgicalPrompt);
        if (surgicalResponse.success && surgicalResponse.message?.trim()) {
          corrected = this.applySurgicalTscPatches(finalContent, surgicalResponse.message);
        }
      }

      if (corrected === null) {
        const hookNames = sourceCustomHooks.length > 0
          ? `\nCRITICAL — DATA FETCHING HOOKS: The following hooks from the source must remain: ` +
            `${sourceCustomHooks.join(', ')}. ` +
            `If the error is 'Cannot find name X' (e.g. 'User'), add a missing import statement ` +
            `(e.g. import { User } from '../schemas/userSchema') — DO NOT remove the hook or ` +
            `convert the component to prop-drilling to work around the missing type.\n`
          : '';
        // TS2339 guidance: when user is typed as unknown (from useUser hook), cast it
        const hasTs2339 = tscErrors.some(e => e.includes('TS2339') || e.includes("Property") && e.includes("does not exist on type 'unknown'"));
        const ts2339Hint = hasTs2339
          ? `\nTS2339 FIX (Property does not exist on type 'unknown'): ` +
            `The hook returns 'user' typed as 'unknown'. ` +
            `Fix by importing the User type from the schema and casting: ` +
            `import { User } from '../schemas/userSchema'; ` +
            `then use 'const typedUser = user as User;' before accessing properties, ` +
            `OR narrow inline: '(user as User).name'. ` +
            `DO NOT change the hook call or restructure the component. DO NOT use 'any'.\n`
          : '';
        const fixPrompt =
          `The following TypeScript file has compiler errors reported by tsc.\n\n` +
          `FILE: ${step.path}\n\nCURRENT CODE:\n${finalContent}\n\n` +
          `COMPILER ERRORS:\n${tscErrors.join('\n')}\n\n` +
          `Fix ONLY the listed errors. Do not change logic, structure, or add comments. ` +
          `NEVER use 'any', 'any[]', 'any | undefined', or any type that includes 'any' — ` +
          `use specific types or 'unknown' instead. ` +
          hookNames +
          ts2339Hint +
          `Provide ONLY the corrected code. No explanations, no markdown fences.`;
        const fixResponse = await this.config.llmClient.sendMessage(fixPrompt);
        if (!fixResponse.success || !fixResponse.message?.trim()) break;
        let raw = fixResponse.message;
        const fenceMatch = raw.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/);
        if (fenceMatch) raw = fenceMatch[1];
        corrected = raw;
      }

      // Guards: evaluate corrected before advancing finalContent so a rejected fix
      // doesn't corrupt the base for the next attempt.
      if (/:\s*any\b/.test(corrected)) {
        tscErrors = [
          ...tscErrors,
          `❌ TypeScript fix introduced 'any' type — NEVER use any, any[], or any union with any. ` +
          `Find and import the correct type instead of falling back to any.`,
        ];
        continue; // finalContent unchanged — next attempt uses the last accepted version
      }
      const removedHooks = sourceCustomHooks.filter(h => !corrected.includes(h + '('));
      if (removedHooks.length > 0) {
        tscErrors = [
          ...tscErrors,
          `❌ TypeScript fix removed hook(s): ${removedHooks.join(', ')}. ` +
          `NEVER remove data-fetching hooks to fix type errors. ` +
          `Instead, add the missing import for the type (e.g. import { User } from '../schemas/userSchema').`,
        ];
        continue; // finalContent unchanged — preserve hooks
      }
      // PROP-DRILLING GUARD: for coordinator steps, reject tsc fixes that convert the component
      // from hook-based data fetching to prop-drilling — even if sourceCustomHooks is empty
      // (matchingSource missing). Check structurally: user: User prop without userId: string.
      {
        const compositionSignalsTsc = /\b(compos|orchestrat|render.*sub|import.*component|slim.*down.*composing|use.*new.*component)/i;
        const isCoordinatorTsc = (compositionSignalsTsc.test(step.description ?? '') || compositionSignalsTsc.test(step.prompt ?? '')) && step.path?.endsWith('.tsx');
        if (isCoordinatorTsc) {
          const fixIntroducedPropDrilling =
            /(?:^|\s)(?:user|currentUser)\s*:\s*User\b/.test(corrected) &&
            !/userId\s*:\s*string/.test(corrected);
          if (fixIntroducedPropDrilling) {
            tscErrors = [
              ...tscErrors,
              `❌ TypeScript fix introduced prop-drilling: coordinator now accepts 'user: User' as a prop. ` +
              `NEVER convert the coordinator to prop-drilling — keep 'userId: string' and call useUser(userId) internally. ` +
              `Fix the type error by adding a missing import (e.g. import { User } from '../schemas/userSchema'), not by restructuring props.`,
            ];
            continue; // finalContent unchanged — preserve hook-based pattern
          }
        }
      }
      finalContent = corrected; // Only advance if all guards pass
      await vscode.workspace.fs.writeFile(filePath, Buffer.from(finalContent, 'utf8'));
      tscErrors = await this.runTscCheck(workspaceUri.fsPath, step.path!);
    }

    if (tscErrors.length > 0) {
      if (step.path) this.filesWithPersistentTscErrors.add(step.path);
      this.config.onMessage?.(
        `⚠️ ${tscErrors.length} TypeScript error(s) persist after correction. ` +
        `File written — the final tsc RUN step will surface any remaining issues.`,
        'info'
      );
    } else {
      this.config.onMessage?.(`✅ Check 6: TypeScript errors resolved.`, 'info');
    }

    return finalContent;
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
  /** Delegates to executor-step-utils.ts. */
  private classifyStderr(data: any): { isWarning: boolean; message: string } { return classifyStderr(data); }

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
