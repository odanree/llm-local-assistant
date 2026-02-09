import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import SmartAutoCorrection from './smartAutoCorrection';
import { LLMClient } from './llmClient';
import { GitClient } from './gitClient';
import CodebaseIndex from './codebaseIndex';
import { ArchitectureValidator } from './architectureValidator';
import { TaskPlan, PlanStep, StepResult } from './planner';
import { validateExecutionStep } from './types/executor';
import { PathSanitizer } from './utils/pathSanitizer';
import { ValidationReport, formatValidationReportForLLM } from './types/validation';
import { generateHandoverSummary, formatHandoverHTML } from './utils/handoverSummary';
import { GOLDEN_TEMPLATES } from './constants/templates';
import { safeParse, sanitizeJson } from './utils/jsonSanitizer';

/**
 * Executor module for Phase 2: Agent Loop Foundation
 * Executes plans step-by-step with state management and error handling
 */

export interface ExecutorConfig {
  extension: vscode.ExtensionContext;
  llmClient: LLMClient;
  gitClient?: GitClient;
  workspace: vscode.Uri;
  codebaseIndex?: CodebaseIndex; // Phase 3.3.2: Track files being created
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
  handover?: any; // ExecutionHandover from handoverSummary (avoid circular import)
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
        this.validateDependencies(step, completedStepIds);

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
            plan.status = 'failed';
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
          plan.status = 'failed';
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

    plan.status = 'completed';

    // Generate post-execution handover summary (Danh's Product Thinking)
    const filesCreated = plan.steps
      .filter(s => s.action === 'write')
      .map(s => s.path)
      .filter((p): p is string => !!p);

    const handover = generateHandoverSummary(
      plan.results!,
      plan.steps.map(s => s.description).join('; '),
      filesCreated
    );

    return {
      success: true,
      completedSteps: succeededSteps,
      results: plan.results,
      totalDuration: Date.now() - startTime,
      handover,
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
    const ruleErrors = await this.validateArchitectureRules(content, filePath);
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
   * Check generated code against architecture rules
   */
  private async validateArchitectureRules(content: string, filePath?: string): Promise<string[]> {
    const errors: string[] = [];

    // Get architecture rules if available
    const rules = this.config.llmClient && (this.config.llmClient as any).config?.architectureRules;
    if (!rules) {
      return errors; // No rules to validate against
    }

    // CRITICAL FIX: Check if this is a UI component
    // Per .lla-rules: Components should NOT use Zod for props, only for form data
    const isComponent = filePath && filePath.includes('src/components/');
    const isFormComponent = filePath && filePath.includes('Form');

    // Check Rule: No direct fetch calls (should use TanStack Query or API hooks)
    if (rules.includes('TanStack Query') && /fetch\s*\(/.test(content)) {
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

    // Check Rule: TypeScript strict mode - return types required
    if (rules.includes('strict TypeScript') || rules.includes('Never use implicit types')) {
      // Check for arrow functions without return type annotation
      // Pattern: const funcName = (...) => { ... } without : Type
      const arrowFunctionsWithoutReturnType = content.match(/const\s+\w+\s*=\s*\([^)]*\)\s*=>\s*(?!:)/g);
      if (arrowFunctionsWithoutReturnType) {
        errors.push(
          `⚠️ Rule: TypeScript strict mode requires return type annotations. ` +
          `Arrow functions should be: const funcName = (...): ReturnType => { ... }`
        );
      }

      // Check for function declarations without return type
      const functionsWithoutReturnType = content.match(/function\s+\w+\s*\([^)]*\)\s*{/g);
      if (functionsWithoutReturnType) {
        functionsWithoutReturnType.forEach((func) => {
          // Check if this specific function has a return type annotation
          const funcName = func.match(/function\s+(\w+)/)?.[1];
          if (funcName) {
            const funcRegex = new RegExp(`function\\s+${funcName}\\s*\\([^)]*\\)\\s*:\\s*\\w+`);
            if (!funcRegex.test(content)) {
              errors.push(
                `⚠️ Function '${funcName}' missing return type annotation. ` +
                `Use: function ${funcName}(...): ReturnType { ... }`
              );
            }
          }
        });
      }
    }

    // Check Rule: Runtime validation with Zod for utility functions
    if (rules.includes('Zod for all runtime validation')) {
      // If file has function parameters that accept objects but no Zod validation
      const hasObjectParams = /\([^)]*{[^)]*}\s*[:|,)]/.test(content);
      const hasZodValidation = content.includes('z.parse') || content.includes('z.parseAsync');

      if (hasObjectParams && !hasZodValidation && !content.includes('z.object')) {
        errors.push(
          `⚠️ Rule: Functions accepting objects should validate input with Zod. ` +
          `Example: const schema = z.object({ ... }); ` +
          `Then: const validated = schema.parse(input);`
        );
      }
    }

    // Check Rule: Validation with Zod
    // CRITICAL: Do NOT suggest Zod for UI components or simple utilities (per .lla-rules)
    // Exception: Allow Zod for Form components (form data validation) and domain logic
    // Utilities like cn.ts, helpers.ts are exempt - they're simple transforms, not validators
    const isUtilityFile = filePath.includes('/utils/') || filePath.match(/\.(util|helper)\.ts$/);
    if (rules.includes('Zod') && content.includes('type ') && !content.includes('z.')) {
      // Skip Zod suggestion for utility files - they don't need runtime validation
      if (isUtilityFile) {
        // Silently skip for utilities
      } else if (!isComponent || (isComponent && isFormComponent)) {
        // Only suggest for non-component/non-utility code or form components
        errors.push(
          `⚠️ Rule suggestion: Define validation schemas with Zod instead of just TypeScript types. ` +
          `Example: const userSchema = z.object({ name: z.string(), email: z.string().email() })`
        );
      }
      // Silently skip for non-form UI components (they use TypeScript interfaces for props)
    }

    // PATTERN: React Hook Form + Zod must use zodResolver, not manual async
    if ((content.includes('useForm') || content.includes('react-hook-form')) && content.includes('z.')) {
      if (content.includes('async') && content.includes('validate')) {
        errors.push(
          `❌ Incorrect resolver pattern: Using manual async validation instead of zodResolver. ` +
          `Correct: import { zodResolver } from '@hookform/resolvers/zod'` +
          `Then: useForm({ resolver: zodResolver(schema) })`
        );
      }
    }

    // PATTERN: Check for mixed resolver libraries
    if ((content.includes('yupResolver') && content.includes('z.object')) ||
        (content.includes('yupResolver') && content.includes('zod'))) {
      errors.push(
        `❌ Mixed validation libraries: yupResolver with Zod schema. ` +
        `Use zodResolver for Zod schemas: import { zodResolver } from '@hookform/resolvers/zod'`
      );
    }

    return errors;
  }

  /**
   * Validate form components against .lla-rules 7 required patterns
   */
  private validateFormComponentPatterns(content: string, filePath: string): string[] {
    const errors: string[] = [];
    
    // Only validate if this is a form component
    if (!filePath.includes('Form') || !filePath.endsWith('.tsx')) {
      return errors;
    }

    // Pattern 1: State Interface - Must have interface for form state
    const hasStateInterface = /interface\s+\w+State\s*{/.test(content) || 
                            /type\s+\w+State\s*=\s*{/.test(content);
    if (!hasStateInterface) {
      errors.push(
        `❌ Pattern 1 violation: Missing state interface. ` +
        `Forms require: interface LoginFormState { email: string; password: string; }`
      );
    }

    // Pattern 2: Handler Typing - FormEventHandler must be used, not any
    const hasFormEventHandler = /FormEventHandler\s*<\s*HTMLFormElement\s*>/.test(content);
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

    // Pattern 3: Consolidator Pattern - Single handleChange function for multi-field forms
    // KEY: Only count field-change handlers (not submit handlers)
    // A form legitimately needs: handleChange (field updates) + handleSubmit (form submission)
    const fieldChangeHandlers = (content.match(/const\s+(handle(?:Change|Input|Update|Form(?!Submit))\w*)\s*=/gi) || []).length;
    const hasConsolidator = /\[name,\s*value\]\s*=\s*.*currentTarget/.test(content) ||
                           /currentTarget.*name.*value/.test(content);
    
    // Only fail if there are MULTIPLE field-change handlers without consolidator
    // (handleChange + handleSubmit is OK - submit handler is allowed)
    if (fieldChangeHandlers > 1 && !hasConsolidator) {
      errors.push(
        `❌ Pattern 3 violation: Multiple field handlers instead of consolidator. ` +
        `Multi-field forms must use single handleChange: ` +
        `const handleChange = (e) => { const { name, value } = e.currentTarget; }`
      );
    }

    // Pattern 4: Submit Handler - onSubmit must be on <form>, not button click
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

    // Pattern 5: Validation Logic - Must have some form of input validation
    // NOTE: Simple inline validation is preferred (NOT Zod). Zod was removed from form requirements.
    // Validation can be done with simple if-checks in handlers: if (!email.includes('@')) { ... }
    const hasValidationLogic = /if\s*\(\s*!/.test(content) || 
                               /setErrors\s*\(/.test(content) ||
                               /validate/.test(content);
    
    if (!hasValidationLogic && content.includes('email')) {
      errors.push(
        `⚠️ Pattern 5 info: Consider adding basic validation. ` +
        `Example: if (!email.includes('@')) { setErrors(...); return; }`
      );
    }

    // Pattern 6: Error State Tracking - Must track field-level errors
    const hasErrorState = /useState\s*<\s*Record\s*<\s*string\s*,\s*string\s*>\s*>\s*\(\s*{}/.test(content);
    const hasErrorDisplay = /\{errors\.\w+/.test(content) || /errors\[\w+\]/.test(content);
    
    if (!hasErrorState && (content.includes('validation') || content.includes('error'))) {
      errors.push(
        `⚠️ Pattern 6 warning: Consider tracking field-level errors. ` +
        `Use: const [errors, setErrors] = useState<Record<string, string>>({})`
      );
    }

    // Pattern 7: Semantic Form Markup - Input elements must have name attributes
    const hasNamedInputs = /name\s*=\s*['"]\w+['"]/.test(content);
    const hasInputElements = /<input|<textarea|<select/.test(content);
    const hasMissingName = /<input[^>]*\/?>/.test(content) && !hasNamedInputs;
    
    if (hasInputElements && !hasNamedInputs) {
      errors.push(
        `❌ Pattern 7 violation: Input elements missing name attributes. ` +
        `Use: <input type="email" name="email" value={formData.email} />`
      );
    }

    return errors;
  }

  /**
   * Validate common code patterns and syntax issues
   */
  private validateCommonPatterns(content: string, filePath: string): string[] {
    const errors: string[] = [];

    // Check form component patterns first
    const formErrors = this.validateFormComponentPatterns(content, filePath);
    if (formErrors.length > 0) {
      errors.push(...formErrors);
    }

    // Extract all imported items and namespaces
    const importedItems = new Set<string>();
    const importedNamespaces = new Set<string>();

    // ✅ FIX: Handle mixed imports like "import React, { useState } from 'react'"
    // Pattern: import [DefaultName] [, { NamedImports }] from 'module'
    
    // First, extract named imports (destructured)
    content.replace(/import\s+(?:\w+\s*,\s*)?{([^}]+)}/g, (_, items) => {
      items.split(',').forEach((item: string) => {
        importedItems.add(item.trim());
      });
      return '';
    });

    // Also capture namespace imports (import * as X)
    content.replace(/import\s+\*\s+as\s+(\w+)/g, (_, namespace) => {
      importedNamespaces.add(namespace.trim());
      return '';
    });

    // And default imports (import React from 'react')
    content.replace(/import\s+(\w+)\s+from/g, (_, name) => {
      importedNamespaces.add(name.trim());
      return '';
    });

    // GENERIC NAMESPACE PATTERN DETECTOR
    // Find all namespace.method() patterns and verify namespaces are imported
    const namespaceUsages = new Set<string>();
    
    // First, collect all local variable definitions and function parameters
    const localVariables = new Set<string>();
    
    // Collect function parameters: (e) => or (e, f) =>
    content.replace(/\(([^)]*)\)\s*=>/g, (_, params) => {
      params.split(',').forEach((param: string) => {
        const cleaned = param.trim().split(/[:\s=]/)[0].trim();
        if (cleaned) localVariables.add(cleaned);
      });
      return '';
    });
    
    // Collect variable definitions: const x = or let x = or var x =
    content.replace(/(?:const|let|var)\s+(\w+)\s*[=;]/g, (_, varName) => {
      localVariables.add(varName.trim());
      return '';
    });
    
    // Collect destructured variables: const { x, y } =
    content.replace(/(?:const|let|var)\s+{\s*([^}]+)\s*}/g, (_, vars) => {
      vars.split(',').forEach((v: string) => {
        const cleaned = v.trim().split(/[:=]/)[0].trim();
        if (cleaned) localVariables.add(cleaned);
      });
      return '';
    });
    
    // Now find namespace usages, excluding local variables
    content.replace(/(\w+)\.\w+\s*[\(\{]/g, (match, namespace) => {
      // Skip common JavaScript globals
      const globalKeywords = ['console', 'Math', 'Object', 'Array', 'String', 'Number', 'JSON', 'Date', 'window', 'document', 'this', 'super'];
      // Skip single-letter params like 'e' (event parameters)
      const isSingleLetter = namespace.length === 1;
      // Skip if it's a local variable
      const isLocal = localVariables.has(namespace);
      
      if (!globalKeywords.includes(namespace) && !isSingleLetter && !isLocal) {
        namespaceUsages.add(namespace);
      }
      return '';
    });

    // Check if all used namespaces are imported
    Array.from(namespaceUsages).forEach((namespace) => {
      if (!importedNamespaces.has(namespace) && !importedItems.has(namespace)) {
        // This namespace is used but not imported
        errors.push(
          `❌ Missing import: '${namespace}' is used (${namespace}.something) but never imported. ` +
          `Add: import { ${namespace} } from '...' or import * as ${namespace} from '...'`
        );
      }
    });

    // Pattern: React/useState without import
    if ((content.includes('useState') || content.includes('useEffect')) && !importedItems.has('useState') && !importedItems.has('useEffect')) {
      // Check if useState is actually used in the code (not just mentioned in comments)
      const useStateUsage = /\b(useState|useEffect)\s*\(/.test(content);
      if (useStateUsage && !importedItems.has('useState')) {
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
      // React can be imported as default import or named import
      if (!importedItems.has('React') && !importedNamespaces.has('React')) {
        // In newer React versions, this is optional, so just warn
        errors.push(
          `⚠️ Possible issue: JSX detected but no React import. ` +
          `Modern React (17+) doesn't require this, but check your tsconfig.json`
        );
      }
    }

    // TYPO CHECK: @hookform/resolve vs @hookform/resolvers (common mistake)
    if (content.includes('@hookform/resolve') && !content.includes('@hookform/resolvers')) {
      errors.push(
        `❌ Typo detected: '@hookform/resolve' is not a valid package. ` +
        `Did you mean '@hookform/resolvers'? ` +
        `Correct usage: import { zodResolver } from '@hookform/resolvers/zod'`
      );
    }

    // IMPORT PATTERN: TanStack Query imports
    if (content.includes('useQuery') || content.includes('useMutation')) {
      if (!content.includes('@tanstack/react-query')) {
        errors.push(
          `❌ TanStack Query used but not imported correctly. ` +
          `Add: import { useQuery, useMutation } from '@tanstack/react-query'`
        );
      }
    }

    // IMPORT PATTERN: Zod imports
    if (content.includes('z.') && !content.includes("import { z }") && !content.includes("import * as z")) {
      errors.push(
        `❌ Zod used (z.object, z.string, etc) but not imported. ` +
        `Add: import { z } from 'zod'`
      );
    }

    // UNUSED IMPORTS: Check for imported items that are never used
    const unusedImports: string[] = [];
    importedItems.forEach((item) => {
      // Skip common React hooks that might be used indirectly
      if (['React', 'Component'].includes(item)) return;

      // Check if this import is actually used in the code
      // Pattern 1: Used as value/identifier: Item.x or Item(...) or Item[...]
      const valueUsagePattern = new RegExp(`\\b${item}\\s*[\\.(\\[]`, 'g');
      const valueMatches = content.match(valueUsagePattern) || [];
      
      // Pattern 2: Used as type annotation (e.g., : ClassValue or ClassValue[])
      const typeUsagePattern = new RegExp(`[:\\s<]${item}[\\s\\[,>]`, 'g');
      const typeMatches = content.match(typeUsagePattern) || [];

      // If used in either value or type position, it's not unused
      if (valueMatches.length === 0 && typeMatches.length === 0) {
        unusedImports.push(item);
      }
    });

    if (unusedImports.length > 0) {
      unusedImports.forEach((unused) => {
        errors.push(
          `⚠️ Unused import: '${unused}' is imported but never used. ` +
          `Remove: import { ${unused} } from '...'`
        );
      });
    }

    // RETURN TYPE CHECK: Detect common functions with wrong return types
    // JSON.stringify() always returns string, never null
    if (content.includes('JSON.stringify') && content.includes(': string | null')) {
      errors.push(
        `⚠️ Return type mismatch: JSON.stringify() returns 'string', not 'string | null'. ` +
        `Fix: Change return type to just 'string'`
      );
    }

    // JSON.parse() can throw, but return type should reflect actual object type
    if (content.includes('JSON.parse') && content.includes(': any')) {
      errors.push(
        `⚠️ Type issue: JSON.parse() result should not be 'any'. ` +
        `Use a Zod schema or specific type instead of 'any'`
      );
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

    // INTERCEPTOR: Detect Manual Steps (Fix 2: Postel's Law)
    // If path is missing but description mentions manual verification,
    // treat as human instruction, not executable step
    if (!step.path && /manual|verify|check|browser|test|visually/i.test(step.description)) {
      console.log(`[Executor] Intercepted manual step: "${step.description}"`);
      return {
        stepId: step.stepId,
        success: true,
        output: `📝 MANUAL STEP: ${step.description}`,
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
            // User skipped this step
            return {
              stepId: step.stepId,
              success: true,
              output: `Skipped: ${step.description}`,
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
   * Validate step dependencies (DAG: Directed Acyclic Graph)
   *
   * NEW: Dependency-Linked Schema
   * Forces LLM to explicitly state what each step depends on.
   * Prevents "smushed" steps and ensures proper sequencing.
   *
   * If Step B depends on Step A, and Step A hasn't been completed yet,
   * this throws an error to block Step B's execution.
   */
  private validateDependencies(step: PlanStep, completedStepIds: Set<string>): void {
    // Only validate if step has dependencies
    if (!step.dependsOn || step.dependsOn.length === 0) {
      return;
    }

    // Check each dependency
    for (const depId of step.dependsOn) {
      if (!completedStepIds.has(depId)) {
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

    // Check for missing command on run action
    if (step.action === 'run') {
      if (!(step as any).command || ((step as any).command as string).trim().length === 0) {
        throw new Error(
          `CONTRACT_VIOLATION: Action 'run' requires a command, but none was provided. ` +
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
    if (!path || typeof path !== 'string') return path;

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
    // CONTRACT INJECTION: Inject step description as source of truth for intent
    let prompt = step.prompt || `Generate appropriate content for ${step.path} based on its name.`;

    // CRITICAL: Use step.description as primary requirement (intent preservation)
    // This bridges the planning → execution gap by injecting the actual requirement
    const intentRequirement = step.description
      ? `REQUIREMENT: ${step.description}\n\n`
      : '';

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

    // FORM COMPONENT PATTERN INJECTION: Critical for form generation
    // Extract and inject form patterns from .lla-rules if this is a form component
    let formPatternSection = '';
    const isFormComponent = fileName.includes('Form');
    if (isFormComponent) {
      const llmConfig = this.config.llmClient.getConfig();
      const architectureRules = llmConfig.architectureRules || '';
      
      // Extract Form Component Architecture section from .lla-rules
      const formPatternMatch = architectureRules.match(/###\s+Form Component Architecture[\s\S]*?(?=###\s+|$)/);
      if (formPatternMatch) {
        formPatternSection = `
## REQUIRED: Form Component Patterns

${formPatternMatch[0]}

CRITICAL: ALL 7 PATTERNS ARE MANDATORY FOR FORM COMPONENTS.
Validator will REJECT if any pattern is missing.

`;
        console.log(`[Executor] ✅ Injecting form component patterns for ${fileName}`);
      } else {
        // Fallback: Inject form patterns directly if not in rules
        formPatternSection = `
## REQUIRED: Form Component Patterns (7 Mandatory)

1. **State Interface** - Define typed state: interface LoginFormState { email: string; password: string; }
2. **Event Typing** - Use FormEvent types:
   - Input: const handleChange = (event: FormEvent<HTMLInputElement>) => { const { name, value } = event.currentTarget; ... }
   - Form: const handleSubmit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); ... }
3. **Consolidator Pattern** - Single handleChange function that updates state: setFormData(prev => ({ ...prev, [name]: value }))
4. **Submit Handler** - Use onSubmit on <form> element: <form onSubmit={handleSubmit}>
5. **Error Tracking** - Use local error state: const [errors, setErrors] = useState<Record<string, string>>({})
6. **Input Validation** - Simple validation in handlers (NOT Zod): if (!email.includes('@')) { setErrors(...); return; }
7. **Semantic Form Markup** - Use proper HTML: <input name="email" type="email" required /> with name attributes

CRITICAL RULES:
- DO NOT use Zod, yup, or external schema validation in form components
- Validation is simple: check string length, email format, etc in event handlers
- Keep form logic simple and lean
- No external dependencies for validation (useState is enough)

Missing ANY pattern = REJECTED by validator. Regenerate with ALL 7.

`;
        console.log(`[Executor] ⚠️ Fallback: Injecting hardcoded form patterns for ${fileName}`);
      }
    }

    // Add instruction to output ONLY code, no explanations
    // Detect file type from extension
    const fileExtension = step.path.split('.').pop()?.toLowerCase();
    const isCodeFile = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'json', 'yml', 'yaml', 'html', 'css', 'sh'].includes(fileExtension || '');

    if (isCodeFile) {
      prompt = `You are generating code for a SINGLE file: ${step.path}

${intentRequirement}${formPatternSection}${goldenTemplateSection}STRICT REQUIREMENTS:
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

Example format (raw code, nothing else):
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({...});
export function MyComponent() {...}

Do NOT include: backticks, markdown, explanations, other files, instructions`;
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

        const validationResult = await this.validateGeneratedCode(step.path, content, step);

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
              const smartFixed = SmartAutoCorrection.fixCommonPatterns(currentContent, lastCriticalErrors, step.path);

              // Validate the smart-fixed code - only check CRITICAL errors
              const smartValidation = await this.validateGeneratedCode(step.path, smartFixed, step);
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
                const fixPrompt = `The code you generated has CRITICAL validation errors that MUST be fixed:\n\n${lastCriticalErrors.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n\nPlease fix ALL these critical errors and provide ONLY the corrected code for ${step.path}. No explanations, no markdown. Start with the code immediately.`;

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
              const fixPrompt = `The code you generated has CRITICAL validation errors that MUST be fixed:\n\n${lastCriticalErrors.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n\nPlease fix ALL these critical errors and provide ONLY the corrected code for ${step.path}. No explanations, no markdown. Start with the code immediately.`;

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
            const nextValidation = await this.validateGeneratedCode(step.path, correctedContent, step);
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

      // Phase 3.3.2: Track file in CodebaseIndex for next steps
      if (this.config.codebaseIndex) {
        this.config.codebaseIndex.addFile(filePath.fsPath, finalContent);
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

    return new Promise<StepResult>((resolve) => {
      // Build environment: Start with full copy of process.env, then enhance
      // This ensures all inherited environment variables are available
      const env: { [key: string]: string } = { ...process.env };

      // Ensure PATH includes homebrew and common locations
      // macOS homebrew is typically at /opt/homebrew/bin
      // Windows uses ; separator, Unix uses :
      const pathSeparator = process.platform === 'win32' ? ';' : ':';
      const existingPath = env.PATH || '';
      
      const pathParts = process.platform === 'win32'
        ? [
            'C:\\Program Files\\nodejs',
            'C:\\Program Files (x86)\\nodejs',
            'C:\\Users\\odanree\\AppData\\Roaming\\npm',
            existingPath,
          ]
        : [
            '/opt/homebrew/bin',
            '/usr/local/bin',
            '/usr/bin',
            '/bin',
            '/usr/sbin',
            '/sbin',
            existingPath,
          ];

      env.PATH = pathParts.filter(p => p).join(pathSeparator);

      // CRITICAL: On Windows, ensure SystemRoot is set (required to find cmd.exe)
      // Windows relies on SystemRoot (usually C:\Windows) to locate system commands
      if (process.platform === 'win32' && !env.SystemRoot) {
        env.SystemRoot = 'C:\\Windows';
      }

      // CRITICAL: On Windows, ensure ComSpec is set (command interpreter specification)
      // Some shells require this to find cmd.exe
      if (process.platform === 'win32' && !env.ComSpec) {
        env.ComSpec = 'cmd.exe';
      }

      // Log environment setup for debugging
      console.log(`[Executor] Environment PATH: ${env.PATH?.substring(0, 100)}...`);
      console.log(`[Executor] SystemRoot: ${env.SystemRoot}`);
      console.log(`[Executor] ComSpec: ${env.ComSpec}`);
      console.log(`[Executor] Platform: ${process.platform}`);

      // CRITICAL FIX: Use platform-aware shell selection
      // On Windows with shell: true, spawn uses default shell (cmd.exe)
      // On Unix with shell: true, spawn uses /bin/sh
      
      console.log(`[Executor] Executing command: ${command}`);
      console.log(`[Executor] Platform: ${process.platform}`);
      console.log(`[Executor] Using shell: ${process.platform === 'win32' ? 'cmd.exe' : 'bash'}`);

      const child = process.platform === 'win32'
        ? cp.spawn('cmd.exe', ['/c', command], {
            cwd: workspaceUri.fsPath,
            env: env,
            stdio: 'pipe',
            shell: false, // Don't double-shell on Windows
          })
        : cp.spawn('bash', ['-l', '-c', command], {
            cwd: workspaceUri.fsPath,
            env: env,
            stdio: 'pipe',
            shell: false, // Don't double-shell on Unix
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
