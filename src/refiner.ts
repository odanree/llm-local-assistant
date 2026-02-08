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

import { SimpleFixer, RetryContext, ContextBuilder, DiffGenerator, GenerationModeDetector } from './utils';

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

    // **CRITICAL FIX (Issue #3): Force generation mode for minimal projects IMMEDIATELY**
    // Don't even try DIFF-MODE if the project lacks structure
    // This prevents wasted retries and context pollution
    if (!projectContext.hasPackageJson) {
      console.log('[Refiner] No package.json detected. FORCING SCAFFOLD-MODE immediately.');
      this.config.onProgress?.('Mode Selection', 'Minimal project detected. Using scaffold mode...');
      projectContext.generationMode = 'scaffold-mode';
    }

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
        
        // **NEW: Check if this is a minimal project where diffs won't work**
        // Before retrying, detect if we should switch to scaffold mode
        const hasSrc = GenerationModeDetector.hasSourceDirectory(this.config.projectRoot);
        const isMinimalProject = !projectContext.hasPackageJson || projectContext.frameworks.length === 0;
        
        console.log(`[Refiner] Diff parse failed. Minimal project: ${isMinimalProject}, has src: ${hasSrc}`);

        // If it's a minimal project and we've tried diff mode, switch to scaffold
        if (isMinimalProject && projectContext.generationMode === 'diff-mode' && attempt === 1) {
          console.log('[Refiner] Minimal project detected. Switching to SCAFFOLD-MODE immediately.');
          this.config.onProgress?.('Mode Switch', 'Minimal project detected. Switching to scaffold mode...');

          const scaffoldPrompt = GenerationModeDetector.generateModePrompt('scaffold-mode');
          const scaffoldRequest = userRequest + scaffoldPrompt + this.context.generateAvoidancePrompt();

          this.context.recordAttempt(
            llmResponse,
            'Minimal project: switching to scaffold mode',
            'mode-switch-immediate'
          );

          // Try scaffold mode immediately
          try {
            llmResponse = await this.config.llmCall(
              this.buildSystemPrompt(projectContext, existingCode),
              scaffoldRequest
            );
            this.context.recordAttempt(llmResponse, undefined, 'LLM generation (scaffold)');

            // Apply SimpleFixer
            const fixResult = SimpleFixer.fix(llmResponse);
            if (fixResult.fixed) {
              appliedFixes.push(...fixResult.fixes.map((f) => f.description));
              llmResponse = fixResult.code;
            }

            // Return success with scaffold-generated code
            return {
              success: true,
              code: llmResponse,
              explanation: `Generated complete scaffolding (minimal project detected).`,
              attempts: 1,
              appliedFixes,
            };
          } catch (err) {
            console.warn('[Refiner] Scaffold mode attempt failed:', err);
            // Fall through to retry logic
          }
        }

        // Standard retry logic
        if (attempt < maxRetries) {
          this.context.recordAttempt(
            llmResponse,
            'No structured diffs found in LLM response',
            'parse-failed'
          );
          continue; // Retry
        } else {
          // **Last-chance fallback: Try scaffold mode before giving up completely**
          console.log('[Refiner] All diff attempts failed. Last-chance: trying scaffold mode...');
          this.config.onProgress?.('Final Attempt', 'Trying scaffolding as last-chance fallback...');

          const scaffoldPrompt = GenerationModeDetector.generateModePrompt('scaffold-mode');
          const lastChanceRequest = userRequest + scaffoldPrompt + 
            '\n\nFINAL ATTEMPT: Generate complete, self-contained code. Do not use Search/Replace patterns.';

          try {
            const scaffoldResponse = await this.config.llmCall(
              this.buildSystemPrompt(projectContext, existingCode),
              lastChanceRequest
            );

            // Try to use scaffolded response as-is
            return {
              success: true,
              code: scaffoldResponse,
              explanation: `Generated via last-chance scaffold fallback. (Original diff mode failed after ${attempt} attempts)`,
              attempts: attempt + 1,
              appliedFixes,
            };
          } catch (err) {
            console.warn('[Refiner] Last-chance scaffold also failed:', err);
            // Now we can truly give up
            return {
              success: false,
              explanation: `Could not generate code after ${attempt} diff attempts + 1 scaffold attempt. This project may need more context (package.json, framework setup).`,
              attempts: attempt + 1,
              appliedFixes,
              error: `Diff parsing failed: ${diffResult.explanation}. Last-chance scaffold also failed.`,
            };
          }
        }
      }

      // **Phase 4.5: Runtime mode detection (NEW - Danh's smart fallback)**
      this.config.onProgress?.('Detecting Generation Mode', 'Checking file existence...');
      const hasSrc = GenerationModeDetector.hasSourceDirectory(this.config.projectRoot);
      const modeDetection = GenerationModeDetector.detectMode(this.config.projectRoot, diffResult.diffs, hasSrc);
      console.log('[Refiner] Generation mode:', modeDetection.mode, '—', modeDetection.reason);

      // If we should retry with different mode, do that
      if (modeDetection.shouldRetry && attempt < maxRetries) {
        const currentMode = projectContext.generationMode;
        const newMode = modeDetection.mode;

        if (currentMode !== newMode) {
          console.log(`[Refiner] Mode switch: ${currentMode} → ${newMode}`);
          this.config.onProgress?.('Mode Switch', `Switching from ${currentMode} to ${newMode}...`);

          const modePrompt = GenerationModeDetector.generateModePrompt(newMode);
          const updatedRequest = userRequest + modePrompt + this.context.generateAvoidancePrompt();

          this.context.recordAttempt(
            llmResponse,
            `Switched generation mode: ${modeDetection.reason}`,
            'mode-switch'
          );

          // Re-prompt LLM with new mode instructions
          try {
            llmResponse = await this.config.llmCall(this.buildSystemPrompt(projectContext, existingCode), updatedRequest);
            this.context.recordAttempt(llmResponse, undefined, 'LLM generation');

            // Re-apply SimpleFixer
            const fixResult2 = SimpleFixer.fix(llmResponse);
            if (fixResult2.fixed) {
              appliedFixes.push(...fixResult2.fixes.map((f) => f.description));
              llmResponse = fixResult2.code;
            }

            // Re-parse diffs
            const diffResult2 = DiffGenerator.parse(llmResponse);
            if (diffResult2.isValid) {
              // Success with new mode, continue to apply
              return {
                success: true,
                code: llmResponse,
                diffs: diffResult2.diffs,
                explanation: `Generated in ${newMode}. ${modeDetection.reason}`,
                attempts: attempt,
                appliedFixes,
              };
            }
          } catch (err) {
            console.warn('[Refiner] Mode switch LLM call failed:', err);
            // Fall through to next retry
          }

          continue; // Retry loop
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
   * Aware of context quality and generation mode
   * - Diff-Mode: Minimal, focused prompts for structured edits
   * - Scaffold-Mode: Full file generation prompts (Danh's insight)
   */
  private buildSystemPrompt(projectContext: any, existingCode?: string): string {
    const isSacaffoldMode = projectContext.generationMode === 'scaffold-mode';

    let systemPrompt = `You are an autonomous code generation agent.

## CRITICAL: WORKSPACE CONTEXT
Target Workspace: ${this.config.workspaceName || 'default'}
Root Path: ${this.config.projectRoot}

## CONTEXT QUALITY & GENERATION MODE
${projectContext.generationMode === 'diff-mode' ? '**Mode: DIFF-MODE** — Project has clear structure, use precise edits' : '**Mode: SCAFFOLD-MODE** — Limited context, generate complete files for user to place'}
${projectContext.suggestedStrategy || ''}

## STRICT SCHEMA ENFORCEMENT
You are FORBIDDEN from:
- ❌ Providing advice, conversational filler, or markdown explanations
- ❌ Prefixing your response with "Sure!", "Here's", or similar phrases
- ❌ Including commentary outside the required format
- ❌ Generating pseudo-code or incomplete patterns

${isSacaffoldMode
  ? `## SCAFFOLD-MODE: Generate Complete Files

Your output for a WRITE step must ONLY be compilable, executable code.

MANDATORY OUTPUT STRUCTURE:
1. Line 1+: import statements (all required imports)
2. Middle: component/function/logic implementation
3. Last line: export statement (export default or named export)

FORBIDDEN - Do NOT do any of these:
- ❌ Do not include markdown code fences (\`\`\`tsx, \`\`\`, etc)
- ❌ Do not include conversational text or prose
- ❌ Do not include explanations ("Here's the component", "This does...")
- ❌ Do not include comments about the code (unless useful documentation)
- ❌ Do not include incomplete or pseudo-code
- ❌ Do not say "I created", "You can", or other first-person language

VALID OUTPUT EXAMPLE:
import React, { useState } from 'react';
import { Link } from 'react-router-dom';

export default function ProductPage() {
  const [products, setProducts] = useState([]);
  return (
    <div>
      {products.map(p => (
        <Link key={p.id} to={p.url}>{p.name}</Link>
      ))}
    </div>
  );
}

INVALID OUTPUT EXAMPLE (DO NOT DO THIS):
Here's a ProductPage component:
\`\`\`tsx
import React from 'react';
export default function ProductPage() {
  // ... implementation
}
\`\`\`

CRITICAL: If output starts with prose or code fences, it WILL BE REJECTED.

The user will place this file in the correct location.
Focus on generating COMPLETE, WORKING code only.`
  : `## DIFF-MODE: Precise Edits for Existing Structure

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
\`\`\``
}

## Project Context
${projectContext.frameworks.length > 0 ? `Frameworks: ${projectContext.frameworks.join(', ')}` : 'No frameworks detected'}
${projectContext.dependencies && projectContext.dependencies.size > 0 ? `Available packages: ${Array.from(projectContext.dependencies.keys()).join(', ')}` : 'No dependencies detected'}

## Code Generation Rules
1. ${isSacaffoldMode ? 'Generate COMPLETE, WORKING code' : 'Generate ONLY the code needed'}
2. Include necessary imports — check available packages above
3. Use TypeScript/JSX when appropriate
4. Do NOT use packages not in the available list
${!isSacaffoldMode ? '5. If modifying existing code, use Search & Replace format' : ''}

## If You Cannot Complete Task
Return ONLY this:
\`\`\`
UNABLE_TO_COMPLETE
\`\`\`

And nothing else. No explanation.`;

    if (existingCode && !isSacaffoldMode) {
      systemPrompt += `\n\n## Existing Code Context\n\`\`\`\n${existingCode.substring(0, 1000)}\n\`\`\``;
    }

    return systemPrompt;
  }

  /**
   * Generate code for a single step with complete previous code context
   * PHASE 5: Code Continuity - maintains document state across steps
   * 
   * Instead of isolated snapshots, this provides the LLM with the actual
   * current state and asks it to apply precise edits.
   */
  async generateStepCode(
    stepNumber: number,
    stepDescription: string,
    targetFile: string,
    previousCode: string,
  ): Promise<RefinerResult> {
    const maxRetries = this.config.maxRetries || 3;
    let attempt = 0;
    const appliedFixes: string[] = [];

    // Build system prompt with Code Continuity focus
    const systemPrompt = this.buildStepSystemPrompt(stepNumber, targetFile, previousCode);

    while (attempt < maxRetries) {
      attempt++;
      this.config.onProgress?.('Step Generation', `Attempt ${attempt}/${maxRetries}`);

      try {
        // Call LLM with full code context
        const response = await this.config.llmCall(systemPrompt, stepDescription);

        // Try SimpleFixer first
        const fixedResponse = SimpleFixer.fix(response);
        if (fixedResponse.fixes.length > 0) {
          appliedFixes.push(...fixedResponse.fixes.map(f => f.description));
          this.config.onProgress?.('SimpleFixer', `Applied ${fixedResponse.fixes.length} fixes`);
        }

        // Parse into diffs
        const diffResult = DiffGenerator.parse(fixedResponse.code);

        // For step-based execution, apply diffs to previous code
        let resultCode = previousCode;
        for (const diff of diffResult.diffs) {
          if (diff.original && diff.replacement) {
            resultCode = resultCode.replace(diff.original, diff.replacement);
          }
        }

        return {
          success: true,
          code: resultCode,
          diffs: diffResult.diffs,
          explanation: `Step ${stepNumber} generated successfully. ${appliedFixes.length} automatic fixes applied.`,
          attempts: attempt,
          appliedFixes,
        };
      } catch (err) {
        this.config.onProgress?.('Step Generation Error', err instanceof Error ? err.message : String(err));
      }
    }

    return {
      success: false,
      explanation: `Failed to generate Step ${stepNumber} code after ${attempt} attempts`,
      attempts: attempt,
      appliedFixes,
      error: `Max retries (${maxRetries}) exceeded`,
    };
  }

  /**
   * Build system prompt for step-by-step execution
   * PHASE 5: Enforces Code Continuity constraints
   */
  private buildStepSystemPrompt(stepNumber: number, targetFile: string, previousCode: string): string {
    return `You are an autonomous code generation agent executing Step ${stepNumber} of a plan.

## CRITICAL: CODE CONTINUITY

Your task: Modify the existing code to implement Step ${stepNumber}.

Current File State:
\`\`\`tsx
${previousCode}
\`\`\`

## STRICT CONSTRAINTS
- You MUST modify ONLY what's necessary for this step
- Use Search & Replace format:
  \`\`\`
  Search:
  [exact code to replace]
  
  Replace:
  [new code]
  \`\`\`
- OR use full component with \`// ... existing code\` markers
- Ensure ALL imports are present
- Do NOT generate broken partial snippets
- If you add a hook (useState, useEffect, etc), it must be imported
- Do NOT remove existing code from previous steps
- If you cannot complete this step safely, return ONLY:
  \`\`\`
  UNABLE_TO_COMPLETE
  \`\`\`

## Focus
- Complete this ONE step correctly
- Maintain scaffolding from previous steps
- Ensure the result is syntactically valid TypeScript/React
`;
  }
}

