/**
 * Refiner: Core integration module for Phase 2
 *
 * Combines SimpleFixer, RetryContext, ContextBuilder, and DiffGenerator
 * into a unified code generation and correction pipeline.
 *
 * Pipeline:
 * 1. Context Collection (ContextBuilder) — scan project, gather dependencies
 * 2. LLM Generation — ask with context injections
 * 3. SimpleFixer — deterministic regex-based fixes
 * 4. Validation — check if code is syntactically valid
 * 5. DiffGenerator — parse response into structured changes
 * 6. Retry Loop — if validation fails, retry with history (RetryContext)
 */

import { SimpleFixer, RetryContext, ContextBuilder, DiffGenerator } from './utils';

export interface RefinerConfig {
  projectRoot: string;
  workspaceName?: string; // NEW: explicit workspace name
  maxRetries?: number; // Default: 3
  llmCall: (systemPrompt: string, userMessage: string) => Promise<string>;
  onProgress?: (stage: string, details: string) => void;
}

export interface RefinerResult {
  success: boolean;
  code?: string;
  diffs?: any[];
  explanation: string;
  attempts: number;
  appliedFixes: string[];
  error?: string;
}

export class Refiner {
  private config: RefinerConfig;
  private context: RetryContext | null = null;

  constructor(config: RefinerConfig) {
    this.config = {
      maxRetries: 3,
      ...config,
    };
  }

  /**
   * Main entry point: Generate code with full retry and correction pipeline
   */
  async generateCode(
    userRequest: string,
    targetFile?: string,
    existingCode?: string
  ): Promise<RefinerResult> {
    const commandId = `gen-${Date.now()}`;
    this.context = new RetryContext(commandId);

    const appliedFixes: string[] = [];
    let attempt = 0;
    const maxRetries = this.config.maxRetries || 3;

    // **Phase 1: Build Context**
    this.config.onProgress?.('Building Project Context', 'Scanning dependencies and imports...');
    const projectContext = ContextBuilder.buildContext(this.config.projectRoot);

    // **Main retry loop**
    while (attempt <= maxRetries) {
      attempt++;

      // **Phase 2: Generate with LLM**
      this.config.onProgress?.(
        `LLM Generation (Attempt ${attempt}/${maxRetries + 1})`,
        'Calling language model...'
      );

      const systemPrompt = this.buildSystemPrompt(projectContext, existingCode);
      const retryHistory = this.context.generateAvoidancePrompt();

      let llmResponse: string;
      try {
        llmResponse = await this.config.llmCall(systemPrompt, userRequest + retryHistory);
      } catch (err) {
        return {
          success: false,
          explanation: `LLM call failed: ${err instanceof Error ? err.message : String(err)}`,
          attempts: attempt,
          appliedFixes,
          error: String(err),
        };
      }

      // Record attempt in history
      this.context.recordAttempt(
        llmResponse,
        undefined,
        'LLM generation'
      );

      // **Phase 3: Try SimpleFixer first**
      this.config.onProgress?.('Deterministic Fixes', 'Attempting regex-based corrections...');
      const fixResult = SimpleFixer.fix(llmResponse);

      if (fixResult.fixed) {
        appliedFixes.push(...fixResult.fixes.map((f) => f.description));
        llmResponse = fixResult.code;
      }

      // **Phase 4: Parse into diffs**
      this.config.onProgress?.('Parsing Changes', 'Extracting structured diffs...');
      const diffResult = DiffGenerator.parse(llmResponse);

      if (!diffResult.isValid) {
        // No diffs found, might be guidance-only or malformed
        if (attempt < maxRetries) {
          this.context.recordAttempt(
            llmResponse,
            'No structured diffs found in LLM response',
            'parse-failed'
          );
          continue; // Retry
        } else {
          return {
            success: false,
            explanation: `Could not parse code from LLM response after ${attempt} attempts`,
            attempts: attempt,
            appliedFixes,
            error: diffResult.explanation,
          };
        }
      }

      // **Phase 5: Apply diffs (if we have target code)**
      let resultCode = llmResponse;
      if (existingCode) {
        this.config.onProgress?.('Applying Changes', 'Integrating diffs into existing code...');
        const { result, applied, failed } = DiffGenerator.apply(existingCode, diffResult.diffs);
        resultCode = result;

        if (failed > 0) {
          // Some diffs failed to apply
          if (attempt < maxRetries) {
            this.context.recordAttempt(
              llmResponse,
              `${failed}/${applied + failed} diffs failed to apply`,
              'diff-apply-failed'
            );
            continue; // Retry
          }
        }
      }

      // **Success!**
      return {
        success: true,
        code: resultCode,
        diffs: diffResult.diffs,
        explanation: `Successfully generated code in ${attempt} attempt(s). ${appliedFixes.length} automatic fixes applied.`,
        attempts: attempt,
        appliedFixes,
      };
    }

    // Exhausted retries
    return {
      success: false,
      explanation: `Failed to generate valid code after ${attempt} attempts`,
      attempts: attempt,
      appliedFixes,
      error: `Max retries (${maxRetries}) exceeded`,
    };
  }

  /**
   * Build system prompt with STRICT schema enforcement (Danh's feedback)
   * - Explicit workspace context injection
   * - Negative constraints (what NOT to do)
   * - Grammar-constrained output requirement
   */
  private buildSystemPrompt(projectContext: any, existingCode?: string): string {
    let systemPrompt = `You are an autonomous code generation agent.

## CRITICAL: WORKSPACE CONTEXT
Target Workspace: ${this.config.workspaceName || 'default'}
Root Path: ${this.config.projectRoot}

## STRICT SCHEMA ENFORCEMENT
You are FORBIDDEN from:
- ❌ Providing advice, conversational filler, or markdown explanations
- ❌ Prefixing your response with "Sure!", "Here's", or similar phrases
- ❌ Including commentary outside the required format
- ❌ Generating pseudo-code or incomplete patterns

Your output must STRICTLY follow ONE of these formats:

**Format 1: Search & Replace (for modifications)**
\`\`\`
Search:
[exact original code to replace]

Replace:
[replacement code]
\`\`\`

**Format 2: Code Block (for new code)**
\`\`\`tsx
[complete, compilable code with all imports]
\`\`\`

## Project Context
${projectContext.frameworks.length > 0 ? `Frameworks: ${projectContext.frameworks.join(', ')}` : 'No frameworks detected'}
${projectContext.dependencies.length > 0 ? `Available packages: ${projectContext.dependencies.join(', ')}` : 'No dependencies detected'}

## Code Generation Rules
1. Generate ONLY the code needed, not full files
2. If modifying existing code, use Search & Replace format
3. Include necessary imports — check available packages above
4. Use TypeScript/JSX when appropriate
5. Do NOT use packages not in the available list
6. Do NOT generate orphaned functions or incomplete handlers
7. Output must be parseable by code validators

## If You Cannot Complete Task
Return ONLY this:
\`\`\`
UNABLE_TO_COMPLETE
\`\`\`

And nothing else. No explanation.`;

    if (existingCode) {
      systemPrompt += `\n\n## Existing Code Context\n\`\`\`\n${existingCode.substring(0, 1000)}\n\`\`\``;
    }

    return systemPrompt;
  }
}
