import * as vscode from 'vscode';
import { Executor, ExecutorConfig } from './executor';
import { ServiceExtractor, RefactoringPlan, ServiceExtraction } from './serviceExtractor';
import { LLMClient } from './llmClient';
import { SmartValidator } from './services/smartValidator';
import { SemanticValidator } from './services/semanticValidator';
import { PromptEngine } from './services/promptEngine';
import { GOLDEN_TEMPLATES, TEMPLATE_FEATURES, TEMPLATE_METADATA } from './constants/templates';

/**
 * Phase 3.4.4: LLM-Guided Refactoring
 * Executes refactoring with LLM assistance, test generation, and validation
 */

export interface RefactoringExecution {
  originalCode: string;
  refactoredCode: string;
  testCases: GeneratedTestCase[];
  validationResults: ValidationResult[];
  executionLog: string[];
  success: boolean;
  errors: string[];
  rollbackAvailable: boolean;
  estimatedImpact: ImpactAssessment;
}

export interface GeneratedTestCase {
  name: string;
  code: string;
  description: string;
  expectedOutcome: string;
}

export interface ValidationResult {
  type: 'syntax' | 'types' | 'logic' | 'performance' | 'compatibility';
  passed: boolean;
  details: string;
  severity: 'critical' | 'warning' | 'info';
}

export interface ImpactAssessment {
  estimatedBenefits: string[];
  potentialRisks: string[];
  performanceImpact: 'positive' | 'neutral' | 'negative' | 'unknown';
  breakingChanges: boolean;
  affectedDependencies: string[];
}

export interface RefactoringPrompt {
  code: string;
  refactoringType: 'extraction' | 'simplification' | 'consolidation' | 'optimization';
  context: string;
  constraints: string[];
}

export class RefactoringExecutor {
  private llmClient: LLMClient;
  private extractor: ServiceExtractor;
  private originalCode: string = '';
  private executionLog: string[] = [];

  constructor(llmClient: LLMClient, extractor?: ServiceExtractor) {
    this.llmClient = llmClient;
    this.extractor = extractor || new ServiceExtractor(undefined, undefined, llmClient);
    
    // Log which model is being used
    const config = this.llmClient.getConfig();
    console.log(`[RefactoringExecutor] Using model: ${config.model} at ${config.endpoint}`);
  }

  /**
   * Execute a refactoring with LLM assistance
   */
  async executeRefactoring(plan: RefactoringPlan, code: string): Promise<RefactoringExecution> {
    this.originalCode = code;
    this.executionLog = [];

    try {
      this.log('Starting refactoring execution');
      this.log(`Plan: ${plan.hookFile}`);
      this.log(`Complexity: ${plan.estimatedComplexity}`);

      // Step 1: Generate refactored code
      this.log('Generating refactored code with LLM...');
      const refactoredCode = await this.generateRefactoredCode(plan, code);

      // Step 2: Generate test cases
      this.log('Generating test cases...');
      const testCases = await this.generateTestCases(refactoredCode);

      // Step 3: Validate refactored code
      this.log('Validating refactored code...');
      const validationResults = await this.validateRefactoring(code, refactoredCode, testCases);

      // Step 4: Assess impact
      this.log('Assessing impact...');
      const impact = this.assessImpact(plan, code, refactoredCode);

      // Step 5: Determine success
      const criticalErrors = validationResults.filter(r => r.severity === 'critical' && !r.passed);
      const success = criticalErrors.length === 0;

      this.log(`Refactoring ${success ? 'successful' : 'failed'}`);

      return {
        originalCode: code,
        refactoredCode,
        testCases,
        validationResults,
        executionLog: this.executionLog,
        success,
        errors: criticalErrors.map(r => r.details),
        rollbackAvailable: true,
        estimatedImpact: impact,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`ERROR: ${errorMsg}`);

      return {
        originalCode: code,
        refactoredCode: code,
        testCases: [],
        validationResults: [
          {
            type: 'logic',
            passed: false,
            details: errorMsg,
            severity: 'critical',
          },
        ],
        executionLog: this.executionLog,
        success: false,
        errors: [errorMsg],
        rollbackAvailable: true,
        estimatedImpact: {
          estimatedBenefits: [],
          potentialRisks: ['Refactoring failed'],
          performanceImpact: 'unknown',
          breakingChanges: false,
          affectedDependencies: [],
        },
      };
    }
  }

  /**
   * Generate refactored code with semantic retry loop
   * Feeds semantic errors back to LLM for automatic correction
   */
  private async generateRefactoredCode(plan: RefactoringPlan, code: string): Promise<string> {
    return this.generateRefactoredCodeWithRetry(plan, code, code, 0);
  }

  /**
   * Recursive retry handler with semantic feedback loop
   * Max 3 attempts to generate semantically correct code
   */
  private async generateRefactoredCodeWithRetry(
    plan: RefactoringPlan,
    originalCode: string,
    currentCode: string,
    attemptNumber: number
  ): Promise<string> {
    const MAX_ATTEMPTS = 3;

    // Build the prompt for this attempt
    let prompt: string;
    if (attemptNumber === 0) {
      // First attempt: normal refactoring prompt
      prompt = this.buildRefactoringPrompt(plan, originalCode);
      this.log(`[Generation Attempt ${attemptNumber + 1}/${MAX_ATTEMPTS}] Generating refactored code...`);
    } else {
      // Retry attempt: include semantic error feedback
      const semanticErrors = SmartValidator.checkSemantics(currentCode);
      if (semanticErrors.length === 0) {
        // No errors on retry - shouldn't happen, but return code
        return currentCode;
      }

      const errorSummary = SmartValidator.formatErrors(semanticErrors);
      prompt = this.buildCorrectionPrompt(plan, originalCode, currentCode, errorSummary);
      this.log(
        `[Generation Attempt ${attemptNumber + 1}/${MAX_ATTEMPTS}] ` +
        `Correcting ${semanticErrors.length} semantic errors...`
      );
    }

    // Send to LLM
    const response = await this.llmClient.sendMessage(prompt);

    if (!response.success) {
      throw new Error(`LLM failed to generate refactoring: ${response.error}`);
    }

    // Extract code from response
    const refactored = this.extractCodeFromResponse(response.message || '');

    if (!refactored) {
      throw new Error('LLM response did not contain valid code');
    }

    // Semantic validation
    if (process.env.NODE_ENV !== 'test') {
      const semanticErrors = SmartValidator.checkSemantics(refactored);

      if (SmartValidator.hasFatalErrors(semanticErrors)) {
        // Still has errors
        if (attemptNumber < MAX_ATTEMPTS - 1) {
          // Retry with error feedback
          this.log(
            `⚠️ Generation attempt ${attemptNumber + 1} had semantic errors. Retrying...`
          );
          return this.generateRefactoredCodeWithRetry(
            plan,
            originalCode,
            refactored,
            attemptNumber + 1
          );
        } else {
          // Max attempts reached
          const errorMessage = SmartValidator.formatErrors(semanticErrors);
          this.log(
            `❌ Max retry attempts reached. Final errors:\n${errorMessage}`
          );
          throw new Error(
            `Semantic validation failed after ${MAX_ATTEMPTS} attempts:\n${errorMessage}`
          );
        }
      } else if (semanticErrors.length > 0) {
        // Warnings only - log but accept
        const warningMessage = SmartValidator.formatErrors(
          semanticErrors.filter(e => e.severity === 'warning')
        );
        this.log(`ℹ️ Generated code has minor warnings:\n${warningMessage}`);
      }
    }

    // Success!
    if (attemptNumber > 0) {
      this.log(`✅ Semantic validation passed on attempt ${attemptNumber + 1}`);
    }
    return refactored;
  }

  /**
   * Build correction prompt with specific semantic errors
   * Feeds error context back to LLM for targeted fixes
   */
  private buildCorrectionPrompt(
    plan: RefactoringPlan,
    originalCode: string,
    failedAttempt: string,
    semanticErrors: string
  ): string {
    return `You are a TypeScript/React refactoring expert.

TASK: Fix the semantic errors in the refactored code and regenerate.

ORIGINAL CODE:
\`\`\`typescript
${originalCode}
\`\`\`

PREVIOUS ATTEMPT (had errors):
\`\`\`typescript
${failedAttempt}
\`\`\`

SEMANTIC ERRORS FOUND:
${semanticErrors}

CRITICAL FIXES NEEDED:
- Ensure all variables used are defined or imported
- Check import statements match actual library names
  * clsx is exported from 'clsx' package, not 'classnames'
  * twMerge is exported from 'tailwind-merge' package
- Import types as \`import type { TypeName }\` when used in type positions
- Do NOT use undefined variables

REQUIREMENTS:
- Output ONLY valid TypeScript code in a code block
- No explanations or markdown outside code block
- All imports must reference actual libraries
- All types must be properly imported
- All variables must be defined before use`;
  }

  /**
   * Build refactoring prompt for LLM
   */
  private buildRefactoringPrompt(plan: RefactoringPlan, code: string): string {
    const changes = plan.proposedChanges
      .map(c => `- ${c.type}: ${c.description} (${c.impact})`)
      .join('\n');

    return `You are a TypeScript/React refactoring expert.

TASK: Refactor the following code according to the plan.

ORIGINAL CODE:
\`\`\`
${code}
\`\`\`

REFACTORING PLAN:
${changes}

REQUIREMENTS:
1. Output ONLY the refactored code, no explanations
2. Maintain 100% backward compatibility
3. Keep function signatures the same (external API unchanged)
4. Add JSDoc comments for complex logic
5. Follow existing code style
6. No breaking changes
7. Handle all error cases from original code

OUTPUT: Valid TypeScript/JavaScript code only. Start immediately with the code.`;
  }

  /**
   * Extract code from LLM response
   */
  private extractCodeFromResponse(response: string): string | null {
    // Try markdown code blocks first
    const codeBlockMatch = response.match(/\`\`\`(?:ts|tsx|javascript|typescript)?\n([\s\S]*?)\n\`\`\`/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Try plain code block
    const plainBlockMatch = response.match(/\`\`\`\n?([\s\S]*?)\n?\`\`\`/);
    if (plainBlockMatch) {
      return plainBlockMatch[1].trim();
    }

    // Return response as-is if it looks like code
    if (response.includes('export') || response.includes('function') || response.includes('const')) {
      return response.trim();
    }

    return null;
  }

  /**
   * Generate test cases for refactored code
   */
  private async generateTestCases(refactoredCode: string): Promise<GeneratedTestCase[]> {
    const prompt = `Generate unit tests for this code:

\`\`\`
${refactoredCode}
\`\`\`

Requirements:
1. Write 2-3 focused test cases
2. Use Vitest/Jest syntax
3. Test happy path and error cases
4. Each test should be self-contained
5. Output ONLY test code

Format each test as:
test('description', async () => {
  // test code
});`;

    const response = await this.llmClient.sendMessage(prompt);

    if (!response.success) {
      this.log(`Warning: Could not generate tests: ${response.error}`);
      return [];
    }

    return this.parseTestCases(response.message || '', refactoredCode);
  }

  /**
   * Parse test cases from LLM response
   */
  private parseTestCases(response: string, code: string): GeneratedTestCase[] {
    const testCases: GeneratedTestCase[] = [];

    // Find test definitions
    const testRegex = /test\(['"]([^'"]+)['"]\s*,\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)\n\}\);/g;

    let match;
    while ((match = testRegex.exec(response)) !== null) {
      testCases.push({
        name: match[1],
        code: `test('${match[1]}', async () => {${match[2]}\n});`,
        description: `Test: ${match[1]}`,
        expectedOutcome: 'Test passes without errors',
      });
    }

    return testCases;
  }

  /**
   * Validate refactored code
   */
  private async validateRefactoring(
    originalCode: string,
    refactoredCode: string,
    testCases: GeneratedTestCase[]
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    // 1. Syntax validation
    results.push(this.validateSyntax(refactoredCode));

    // 2. Type validation
    results.push(this.validateTypes(refactoredCode));

    // 3. Logic validation (basic)
    results.push(this.validateLogic(originalCode, refactoredCode));

    // 4. Performance check
    results.push(this.validatePerformance(originalCode, refactoredCode));

    // 5. Compatibility check
    results.push(this.validateCompatibility(originalCode, refactoredCode));

    return results;
  }

  /**
   * Validate syntax of code
   */
  private validateSyntax(code: string): ValidationResult {
    try {
      // Basic syntax checks
      if (!code.trim()) {
        return {
          type: 'syntax',
          passed: false,
          details: 'Code is empty',
          severity: 'critical',
        };
      }

      // Check for balanced braces
      const openBraces = (code.match(/\{/g) || []).length;
      const closeBraces = (code.match(/\}/g) || []).length;

      if (openBraces !== closeBraces) {
        return {
          type: 'syntax',
          passed: false,
          details: `Unbalanced braces: ${openBraces} open, ${closeBraces} close`,
          severity: 'critical',
        };
      }

      return {
        type: 'syntax',
        passed: true,
        details: 'Syntax check passed',
        severity: 'info',
      };
    } catch (error) {
      return {
        type: 'syntax',
        passed: false,
        details: `Syntax error: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'critical',
      };
    }
  }

  /**
   * Validate types of code
   */
  private validateTypes(code: string): ValidationResult {
    const issues: string[] = [];

    // Check for `any` types
    if (code.includes(': any')) {
      issues.push('Found `any` type - should use specific types');
    }

    // Check for implicit returns
    if (code.includes('return;') && !code.includes('void')) {
      issues.push('Implicit return should be typed as void or return a value');
    }

    // Check for missing type annotations on exports
    const exports = code.match(/export\s+(?:const|function)\s+\w+/g) || [];
    if (exports.length > 0 && !code.includes('export ')) {
      issues.push('Exported declarations should have type annotations');
    }

    return {
      type: 'types',
      passed: issues.length === 0,
      details: issues.length > 0 ? issues.join('; ') : 'Type check passed',
      severity: issues.length > 0 ? 'warning' : 'info',
    };
  }

  /**
   * Validate logic of code
   */
  private validateLogic(originalCode: string, refactoredCode: string): ValidationResult {
    const issues: string[] = [];

    // Check if refactored exports same functions
    const originalExports = originalCode.match(/export\s+(?:function|const)\s+(\w+)/g) || [];
    const refactoredExports = refactoredCode.match(/export\s+(?:function|const)\s+(\w+)/g) || [];

    if (originalExports.length > refactoredExports.length) {
      issues.push('Some exported functions were removed');
    }

    // Check if error handling maintained
    const originalTryCatch = (originalCode.match(/try\s*\{/g) || []).length;
    const refactoredTryCatch = (refactoredCode.match(/try\s*\{/g) || []).length;

    if (originalTryCatch > refactoredTryCatch) {
      issues.push('Some error handling was removed');
    }

    // Check if async functions maintained
    const originalAsync = (originalCode.match(/async\s+function|async\s*\(/g) || []).length;
    const refactoredAsync = (refactoredCode.match(/async\s+function|async\s*\(/g) || []).length;

    if (originalAsync > refactoredAsync) {
      issues.push('Some async operations were removed');
    }

    return {
      type: 'logic',
      passed: issues.length === 0,
      details: issues.length > 0 ? issues.join('; ') : 'Logic check passed',
      severity: issues.length > 0 ? 'warning' : 'info',
    };
  }

  /**
   * Validate performance of code
   */
  private validatePerformance(originalCode: string, refactoredCode: string): ValidationResult {
    const issues: string[] = [];

    // Check for unnecessary loops
    const originalLoops = (originalCode.match(/for\s*\(|while\s*\(/g) || []).length;
    const refactoredLoops = (refactoredCode.match(/for\s*\(|while\s*\(/g) || []).length;

    if (refactoredLoops > originalLoops) {
      issues.push('Refactored code has more loops - check performance');
    }

    // Check for unnecessary re-renders (React)
    if (originalCode.includes('useState') && refactoredCode.includes('useState')) {
      const originalUseEffects = (originalCode.match(/useEffect/g) || []).length;
      const refactoredUseEffects = (refactoredCode.match(/useEffect/g) || []).length;

      if (refactoredUseEffects > originalUseEffects) {
        issues.push('More useEffect hooks - potential performance issue');
      }
    }

    return {
      type: 'performance',
      passed: issues.length === 0,
      details: issues.length > 0 ? issues.join('; ') : 'Performance check passed',
      severity: issues.length > 0 ? 'warning' : 'info',
    };
  }

  /**
   * Validate compatibility of code
   */
  private validateCompatibility(originalCode: string, refactoredCode: string): ValidationResult {
    const issues: string[] = [];

    // Check for removed imports
    const originalImports = originalCode.match(/import\s+[\w{}*]+\s+from/g) || [];
    const refactoredImports = refactoredCode.match(/import\s+[\w{}*]+\s+from/g) || [];

    if (refactoredImports.length < originalImports.length) {
      issues.push('Some imports were removed - check if dependencies still work');
    }

    // Check for breaking API changes
    if (originalCode.includes('interface') && refactoredCode.includes('interface')) {
      // If interfaces changed significantly, that's a breaking change
      const originalInterfaceCount = (originalCode.match(/interface\s+\w+/g) || []).length;
      const refactoredInterfaceCount = (refactoredCode.match(/interface\s+\w+/g) || []).length;

      if (refactoredInterfaceCount < originalInterfaceCount) {
        issues.push('Some interfaces were removed - possible breaking changes');
      }
    }

    return {
      type: 'compatibility',
      passed: issues.length === 0,
      details: issues.length > 0 ? issues.join('; ') : 'Compatibility check passed',
      severity: issues.length > 0 ? 'warning' : 'info',
    };
  }

  /**
   * Assess impact of refactoring
   */
  private assessImpact(
    plan: RefactoringPlan,
    originalCode: string,
    refactoredCode: string
  ): ImpactAssessment {
    const benefits: string[] = [];
    const risks: string[] = [];
    const affectedDeps: string[] = [];

    // Extract benefits from plan
    plan.proposedChanges.forEach(change => {
      if (change.type === 'extract') {
        benefits.push(`Extract ${change.description}`);
      } else if (change.type === 'simplify') {
        benefits.push(`Simplify: ${change.description}`);
      }
    });

    // Detect performance benefits
    const originalSize = originalCode.length;
    const refactoredSize = refactoredCode.length;

    if (refactoredSize < originalSize * 0.8) {
      benefits.push(`Code size reduced by ${Math.round(((originalSize - refactoredSize) / originalSize) * 100)}%`);
    }

    // Detect risks from plan
    plan.risks.forEach(risk => {
      risks.push(risk.description);
    });

    // Performance impact
    let performanceImpact: ImpactAssessment['performanceImpact'] = 'neutral';
    if (refactoredCode.includes('useMemo') || refactoredCode.includes('useCallback')) {
      performanceImpact = 'positive';
    }

    // Breaking changes
    const hasBreakingChanges =
      originalCode.match(/export\s+\w+/g)?.length !== refactoredCode.match(/export\s+\w+/g)?.length;

    // Affected dependencies
    const imports = refactoredCode.match(/from\s+['"]([^'"]+)['"]/g) || [];
    imports.forEach(imp => {
      const pkg = imp.match(/from\s+['"]([^'"]+)['"]/);
      if (pkg) {
        affectedDeps.push(pkg[1]);
      }
    });

    return {
      estimatedBenefits: benefits,
      potentialRisks: risks,
      performanceImpact,
      breakingChanges: hasBreakingChanges,
      affectedDependencies: affectedDeps,
    };
  }

  /**
   * Log execution step
   */
  private log(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.executionLog.push(`[${timestamp}] ${message}`);
  }

  /**
   * Execute a step with self-correction cycle
   * Danh's v3.0 Knowledge Anchor: Feed architectural hints to LLM
   * 
   * This implements the "Inference Ceiling" mitigation:
   * When SmartValidator detects errors, provide the 32B model with
   * specific architectural hints about what went wrong and how to fix it.
   * 
   * BONUS: Danh's "Midnight Fix" - Hard-code golden templates for common files
   * to prevent model hallucinations entirely.
   */
  private async executeWithCorrection(
    originalContent: string,
    stepPath: string,
    stepDescription: string
  ): Promise<string> {
    // GOLDEN TEMPLATE CHECK: Prevent hallucination for well-known files
    const goldenTemplate = this.getGoldenTemplate(stepPath, stepDescription);
    if (goldenTemplate) {
      this.log(`✅ Using golden template for ${stepPath} (skip LLM hallucination)`);
      return goldenTemplate;
    }

    const MAX_RETRIES = 2;
    let currentContent = originalContent;
    let attemptNumber = 0;

    // CONTEXT-AWARE VALIDATION: Determine file type and applicable rules
    const fileContext = this.determineFileContext(stepPath, stepDescription);
    console.log(`[RefactoringExecutor] File context: ${JSON.stringify(fileContext)}`);

    while (attemptNumber <= MAX_RETRIES) {
      // CONTEXT-AWARE GOLDEN OVERRIDE: Match template based on file type rules
      if (fileContext.type === 'utility' && fileContext.hasGoldenTemplate) {
        if (currentContent.trim() === GOLDEN_TEMPLATES.CN_UTILITY.trim()) {
          console.log(`[RefactoringExecutor] ✅ CONTEXT-AWARE GOLDEN OVERRIDE: Utility matches golden template`);
          this.log(`✅ Context-aware override: Utility matches golden template - PASS validation`);
          return currentContent;
        }
      }

      // STEP 1: SmartValidator - Syntax and import validation
      const semanticErrors = SmartValidator.checkSemantics(currentContent, fileContext);

      // STEP 2: SemanticValidator - Deep code analysis (NEW)
      // Catches name collisions, ghost calls, scope conflicts
      const deepErrors = SemanticValidator.audit(currentContent);
      const allErrors = [...semanticErrors, ...deepErrors];

      if (allErrors.length === 0) {
        // Success!
        this.log(`✅ Self-correction cycle complete on attempt ${attemptNumber + 1} (all validations passed)`);
        return currentContent;
      }

      // Still has errors
      if (attemptNumber >= MAX_RETRIES) {
        // Max retries reached
        const errorMessage = SmartValidator.formatErrors(semanticErrors) +
          (deepErrors.length > 0 ? '\n\nDeep Semantic Issues:\n' + 
            deepErrors.map(e => `${e.message}`).join('\n') : '');
        this.log(`❌ Max correction attempts (${MAX_RETRIES + 1}) reached`);
        throw new Error(
          `Self-correction failed after ${MAX_RETRIES + 1} attempts:\n${errorMessage}`
        );
      }

      // Build correction prompt with architectural hints
      const correctionPrompt = this.buildArchitecturalHintsPrompt(
        currentContent,
        semanticErrors,
        stepPath,
        stepDescription,
        attemptNumber
      );

      this.log(
        `⚠️ Self-correction attempt ${attemptNumber + 1}/${MAX_RETRIES + 1}: ` +
        `${semanticErrors.length} errors detected, requesting LLM correction with hints...`
      );

      // Request correction from LLM with architectural guidance
      const response = await this.llmClient.sendMessage(correctionPrompt);

      if (!response.success) {
        throw new Error(`LLM failed to generate correction: ${response.error}`);
      }

      // Extract corrected code
      currentContent = this.extractCodeFromResponse(response.message || '');

      if (!currentContent) {
        throw new Error('LLM failed to return code in correction attempt');
      }

      attemptNumber++;
    }

    // Shouldn't reach here, but safety net
    throw new Error('Self-correction cycle failed unexpectedly');
  }

  /**
   * CONTEXT-AWARE VALIDATION: Determine file type and applicable rules
   * 
   * Danh's insight: Rules should be context-based, not name-based.
   * Scales to any file type, not just hardcoded names.
   * 
   * Returns: File context with applicable rules and golden template info
   */
  private determineFileContext(filePath: string, description: string): {
    type: 'utility' | 'component' | 'hook' | 'form' | 'unknown';
    rules: string[];
    hasGoldenTemplate: boolean;
    requireNamedImports: string[];
    requireClassNameProp: boolean;
    forbidZod: boolean;
  } {
    const context = {
      type: 'unknown' as 'utility' | 'component' | 'hook' | 'form' | 'unknown',
      rules: [] as string[],
      hasGoldenTemplate: false,
      requireNamedImports: [] as string[],
      requireClassNameProp: false,
      forbidZod: false,
    };

    // RULE-BASED CLASSIFICATION: Determine file type by path + content

    // UTILITIES: src/utils/
    if (filePath.includes('src/utils/')) {
      context.type = 'utility';
      context.forbidZod = true; // Utilities never use Zod
      context.rules.push('No Zod schemas');
      context.rules.push('Require named imports for utilities');
      context.rules.push('Export functions or constants only');

      // Check if this is a known utility with golden template
      const fileName = filePath.split('/').pop() || '';
      if (fileName === 'cn.ts' || fileName === 'cn.js') {
        context.hasGoldenTemplate = true;
        context.requireNamedImports = ['clsx', 'twMerge'];
        context.rules.push('Apply golden template: cn.ts');
      } else if (fileName === 'constants.ts' || fileName === 'constants.js') {
        context.hasGoldenTemplate = true;
        context.rules.push('Apply golden template: constants.ts');
      }
    }

    // COMPONENTS: src/components/
    else if (filePath.includes('src/components/')) {
      context.type = 'component';
      context.rules.push('Require className?: string prop');
      context.rules.push('Require cn() usage for class merging');
      context.rules.push('Use interfaces for props, NOT Zod');
      context.requireClassNameProp = true;

      // Check for specific component types
      if (description.includes('Button') || description.includes('button')) {
        context.rules.push('Extends ButtonHTMLAttributes');
        context.rules.push('Require variant prop support');
      }
    }

    // HOOKS: src/hooks/
    else if (filePath.includes('src/hooks/')) {
      context.type = 'hook';
      context.rules.push('Require exported function starting with use');
      context.rules.push('Allow useState/useReducer/useContext');
      context.rules.push('No JSX, functions only');
    }

    // FORMS: Detect by description or path
    else if (filePath.includes('form') || description.toLowerCase().includes('form')) {
      context.type = 'form';
      context.rules.push('Allow Zod schemas (form validation only)');
      context.rules.push('Use useForm hook');
      context.rules.push('Require error handling');
    }

    console.log(`[determineFileContext] Classified: type=${context.type}, rules=[${context.rules.join(', ')}]`);

    return context;
  }

  /**
   * Danh's "Midnight Fix": Golden templates for common files
   * Prevents 32B model from hallucinating imports like `import clsx from 'classnames'`
   * 
   * Strategy: For well-known utility files, use a hard-coded template instead of
   * asking LLM to generate (which can hallucinate). The template is proven,
   * tested, and correct.
   */
  private getGoldenTemplate(filePath: string, description: string): string | null {
    // Extract filename from path
    const fileName = filePath.split('/').pop() || '';

    console.log(`[RefactoringExecutor.getGoldenTemplate] Checking file: ${fileName}`);

    // cn.ts - The classic classname utility
    // GOLDEN TEMPLATE - cn.ts from centralized Single Source of Truth
    if (fileName === 'cn.ts' || fileName === 'cn.js') {
      console.log(`[RefactoringExecutor] ✅ GOLDEN TEMPLATE MATCH: CN_UTILITY`);
      console.log(`[RefactoringExecutor] Returning from GOLDEN_TEMPLATES.CN_UTILITY`);
      console.log(`[RefactoringExecutor] Template preview (first 100 chars):`);
      console.log(`[RefactoringExecutor] "${GOLDEN_TEMPLATES.CN_UTILITY.substring(0, 100)}..."`);
      this.log(`✅ Using centralized golden template CN_UTILITY for ${fileName}`);
      return GOLDEN_TEMPLATES.CN_UTILITY;
    }

    // constants.ts - Common constants file
    if (fileName === 'constants.ts' || fileName === 'constants.js') {
      if (description.toLowerCase().includes('api') || description.includes('API')) {
        console.log(`[RefactoringExecutor] ✅ GOLDEN TEMPLATE MATCH: constants.ts (API)`);
        return `// API Configuration Constants

export const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://api.example.com';
export const API_TIMEOUT = 30000; // 30 seconds
export const API_RETRY_ATTEMPTS = 3;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
} as const;`;
      }
    }

    // utils.ts or helpers.ts - Common utility functions
    if ((fileName === 'utils.ts' || fileName === 'helpers.ts') && description.includes('merge')) {
      return `/**
 * Utility functions for common tasks
 */

export function merge<T extends Record<string, any>>(
  target: T,
  source: Partial<T>
): T {
  return { ...target, ...source };
}

export function isEmpty(value: any): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'object' && Object.keys(value).length === 0)
  );
}

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}`;
    }

    // No golden template for this file
    console.log(`[RefactoringExecutor] ℹ️ No golden template for ${fileName} - will use LLM generation with RAG`);
    return null;
  }

  /**
   * Build prompt with architectural hints for correction
   * Now enhanced with Heuristic RAG to provide grounded references
   * This is the "10/10 Perfect Run" enhancement from Danh
   */
  private buildArchitecturalHintsPrompt(
    failedAttempt: string,
    semanticErrors: any[],
    filePath: string,
    stepDescription: string,
    attemptNumber: number
  ): string {
    // Extract specific error types for targeted hints
    const errorTypes = {
      hasUndefinedVars: semanticErrors.some(e => e.type === 'undefined-variable'),
      hasImportMismatches: semanticErrors.some(e => e.type === 'import-mismatch'),
      hasMissingTypes: semanticErrors.some(e => e.type === 'missing-type'),
    };

    // Build targeted hints based on errors found
    const hints: string[] = [];

    if (errorTypes.hasImportMismatches) {
      hints.push(
        "- 'clsx' must be a named import: import { clsx, type ClassValue } from 'clsx';",
        "- Do NOT use 'import clsx from ...' (it is not a default export from clsx)",
        "- 'twMerge' is imported from 'tailwind-merge' (not 'merge' or 'tw-merge')",
        "- Check library names match actual npm package names"
      );
    }

    if (errorTypes.hasUndefinedVars) {
      hints.push(
        "- Ensure every variable used in the code is defined before use",
        "- Check that all imports are present for referenced identifiers",
        "- Verify that destructured variables are actually exported from imported libraries"
      );
    }

    if (errorTypes.hasMissingTypes) {
      hints.push(
        "- Types should be imported with 'import type { TypeName }' syntax",
        "- Example: import type { ClassValue } from 'clsx';",
        "- Runtime values use 'import { value }', types use 'import type { Type }'"
      );
    }

    // Always include core architectural rules
    hints.push(
      "- All imports must reference real npm packages (not made-up names)",
      "- All variables must be defined or imported before use",
      "- All types must be properly imported when used in type positions",
      "- Use '@/utils/cn' alias for utility imports (NOT relative paths like '../../')",
      "- Path aliases: @/ = src/, @/components = src/components/, @/utils = src/utils/",
      "- Always use absolute aliases, never relative paths starting with '../'"
    );

    const hintsText = hints.join('\n');

    // Build base correction prompt
    let basePrompt = `You are a TypeScript/React refactoring expert fixing code generation errors.

TASK: Fix the semantic errors in the failed code using architectural hints.

FILE: ${filePath}
DESCRIPTION: ${stepDescription}
ATTEMPT: ${attemptNumber + 1}/3

PREVIOUS ATTEMPT (had errors):
\`\`\`typescript
${failedAttempt}
\`\`\`

SEMANTIC ERRORS FOUND:
${semanticErrors.map(e => `- ${e.message}`).join('\n')}

ARCHITECTURAL HINTS (Project-Specific Rules):
${hintsText}

CRITICAL REQUIREMENTS:
1. Fix ALL listed semantic errors
2. Follow the architectural hints exactly
3. Maintain the original intent of the code
4. Output ONLY the corrected TypeScript code in a code block
5. No explanations, no markdown outside the code block

REMEMBER:
- Named imports like: import { clsx, type ClassValue } from 'clsx';
- NOT default imports like: import clsx from 'clsx';
- Types imported with 'import type { }'
- All variables defined before use
- All imports from real npm packages`;

    // ENHANCEMENT: Apply Heuristic RAG hydration
    // This adds explicit reference samples that the model's attention mechanism
    // will prioritize over its fuzzy training data
    console.log(`\n[RefactoringExecutor] Calling PromptEngine.hydratePrompt`);
    console.log(`[RefactoringExecutor] File: ${filePath}`);
    console.log(`[RefactoringExecutor] Description: ${stepDescription}`);
    
    const hydratedPrompt = PromptEngine.hydratePrompt({
      filePath,
      fileDescription: stepDescription,
      basePrompt,
    });

    this.log(`✅ RAG hydration applied: ${hydratedPrompt.appliedRules.join(', ')}`);
    console.log(`[RefactoringExecutor] Hydrated prompt length: ${hydratedPrompt.augmented.length} chars`);
    if (hydratedPrompt.reference) {
      console.log(`[RefactoringExecutor] Golden template injected ✅`);
    }

    return hydratedPrompt.augmented;
  }

  /**
   * Run a command with hardened shell configuration
   * Uses absolute ComSpec path to ensure Windows reliability
   * Danh's "Final Boss" fix for shell execution
   */
  private async runCommand(command: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Use the exact ComSpec path confirmed by diagnostic tool
      // Fallback to default Windows path if not found
      const SHELL_PATH = process.env.ComSpec || 'C:\\WINDOWS\\system32\\cmd.exe';

      const { exec } = require('child_process');
      
      // Execute with hardened configuration
      exec(
        command,
        {
          cwd,
          env: {
            ...process.env,  // Spread all existing environment vars
            SystemRoot: process.env.SystemRoot || 'C:\\WINDOWS',  // Anchor: kernel path
            PATH: process.env.PATH || '',  // Anchor: tool discovery
            // On non-Windows, exec handles shell naturally
            // On Windows, the shell property below ensures cmd.exe is used
          },
          shell: SHELL_PATH,  // Force to verified ComSpec path (Windows only, ignored on Unix)
          timeout: 30000,  // 30 second timeout
        },
        (error: any, stdout: string, stderr: string) => {
          if (error) {
            // Real command error (plumbing is working, command itself failed)
            const errorMessage = stderr || error.message || 'Unknown error';
            this.log(`❌ Command failed: ${errorMessage}`);
            reject(new Error(errorMessage));
            return;
          }

          this.log(`✅ Command succeeded: ${command}`);
          resolve(stdout);
        }
      );
    });
  }
}
