import * as vscode from 'vscode';
import { Executor, ExecutorConfig } from './executor';
import { ServiceExtractor, RefactoringPlan, ServiceExtraction } from './serviceExtractor';
import { LLMClient } from './llmClient';
import { SmartValidator } from './services/smartValidator';

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
