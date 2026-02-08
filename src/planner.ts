/**
 * Planner: Non-Deterministic Intent Decomposition
 *
 * Role: Take a user request and decompose it into atomic execution steps.
 * Output: High-level structured plan (not code, not diffs).
 * Success Metric: Does the sequence make logical sense?
 *
 * Key Difference from Refiner:
 * - Refiner: Deterministic code transformation with validation
 * - Planner: Non-deterministic brainstorming with user review
 *
 * Separation of Concerns:
 * - Planner doesn't know about diffs, scaffolding, or code syntax
 * - Refiner doesn't need to understand planning logic
 * - Executor bridges them by calling Refiner for approved steps
 *
 * CRITICAL: Planner is constrained to Executor's action types.
 * - Valid actions: read, write, run, delete
 * - Invalid actions: analyze, review, suggestwrite (do these in planning, not execution)
 * - Schema enforcement: Prevents Interface Drift between modules
 */

import {
  ActionType,
  ActionTypeString,
  ExecutionStep as SharedExecutionStep,
  StepResult,
  validateExecutionStep,
  assertValidActionType,
} from './types/executor';

/**
 * Re-export StepResult for backward compatibility with executor imports
 */
export { StepResult };

/**
 * TaskPlan: The output from the Planner
 * Compatible with Executor expectations
 * 
 * CRITICAL: Includes workspace context so Executor knows where to create files
 */
export interface TaskPlan {
  taskId: string;
  userRequest: string;
  steps: ExecutionStep[];
  generatedAt: Date;
  reasoning: string; // Why LLM chose this approach
  status?: 'pending' | 'executing' | 'completed' | 'failed'; // For executor tracking
  currentStep?: number; // For executor tracking
  results?: Map<number, StepResult>; // For executor tracking
  
  /** CRITICAL: Workspace context (prevents file routing bug) */
  workspacePath?: string; // Absolute path to selected workspace
  workspaceName?: string; // Display name of workspace (e.g., "RefactorTest")
}

/**
 * ExecutionStep: Local extension with additional Planner-specific fields
 * Inherits contract from shared SharedExecutionStep
 */
export interface ExecutionStep extends SharedExecutionStep {
  targetFile?: string; // Alternate name for path (for backward compatibility)
}

// Alias for executor compatibility
export type PlanStep = ExecutionStep;

export interface PlannerConfig {
  llmCall: (prompt: string) => Promise<string>;
  onProgress?: (stage: string, details: string) => void;
}

export class Planner {
  private config: PlannerConfig;

  constructor(config: PlannerConfig) {
    this.config = config;
  }

  /**
   * Generate a plan for a user request
   * 
   * CRITICAL: Now accepts workspace context to avoid file routing bugs
   * 
   * Key: No retries, no validation logic, no code transformation.
   * Just decompose the request into steps and return.
   */
  async generatePlan(
    userRequest: string,
    workspacePath?: string,
    workspaceName?: string,
    projectContext?: any  // CONTEXT-AWARE PLANNING: Accept project context
  ): Promise<TaskPlan> {
    this.config.onProgress?.('Planning', 'Decomposing request into steps...');

    // CONTEXT-AWARE PLANNING: Check if project has tests
    let hasTests = true; // Default: assume has tests
    if (projectContext) {
      hasTests = projectContext.hasTests ?? true;
      console.log(`[Planner] Project context: hasTests=${hasTests}, testFramework=${projectContext.testFramework}`);
    }

    const planPrompt = this.buildPlanPrompt(userRequest, hasTests);

    try {
      const llmResponse = await this.config.llmCall(planPrompt);

      if (!llmResponse || llmResponse.includes('UNABLE_TO_COMPLETE')) {
        throw new Error('LLM could not generate a plan for this request');
      }

      // Parse the response into structured steps
      const steps = this.parseSteps(llmResponse);

      if (!steps || steps.length === 0) {
        throw new Error('No steps could be extracted from LLM response');
      }

      const plan: TaskPlan = {
        taskId: `plan-${Date.now()}`,
        userRequest,
        steps,
        generatedAt: new Date(),
        reasoning: this.extractReasoning(llmResponse),
        workspacePath, // CRITICAL: Carry workspace context forward
        workspaceName, // CRITICAL: Display name for logging/debugging
      };

      this.config.onProgress?.('Planning', `Generated ${steps.length} steps`);
      return plan;
    } catch (err) {
      throw new Error(`Plan generation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Build the planning prompt
   * 
   * CRITICAL: Constraint added to prevent Interface Drift
   * - Tell LLM only 4 action types exist
   * - Tell LLM to do ANALYZE/REVIEW itself, not output as steps
   * - Schema enforcement at prompt level
   */
  private buildPlanPrompt(userRequest: string, hasTests: boolean = true): string {
    return `You are a project planning expert. Your job is to decompose a user request into atomic, executable steps.

IMPORTANT CONSTRAINT - You can ONLY output steps with these actions:
- read: Read a file or directory
- write: Write or modify a file
- run: Execute a shell command or npm script
- delete: Delete a file or directory

You CANNOT output steps for:
- analyze: Do your own analysis BEFORE creating the plan, don't output it as a step
- review: Review code yourself, don't ask the Executor to do it
- suggestwrite: Write actual code, don't suggest

If a request requires analysis or review, do it yourself first, then output only executable (read/write/run/delete) steps.

${!hasTests ? `
CONTEXT-AWARE PLANNING: This project has NO automated testing infrastructure (no jest/vitest/pytest).

CRITICAL: You are FORBIDDEN from:
- ❌ Outputting steps that run npm test, jest, vitest, pytest, or any test commands
- ❌ Assuming the project has testing setup
- ❌ Recommending automated testing

INSTEAD:
- ✅ Skip automated testing steps entirely
- ✅ Suggest manual verification: "Verify in dev environment"
- ✅ Focus on code generation and implementation
` : ''}

USER REQUEST:
${userRequest}

Create a detailed step-by-step plan using ONLY the allowed actions above.

For each step, provide:
1. Action type: read, write, run, or delete (ONLY these)
2. Description: What to do (2-3 sentence summary)
3. File/Command: Path for read/write/delete, or the actual command for run
4. Expected outcome: what will be true after this step
5. Dependencies: which previous steps it depends on (if any)

OUTPUT FORMAT - Be VERY specific and clear:

**Step 1: read**
- Description: Read the current login form component
- Path: src/components/LoginForm.tsx
- Expected outcome: Understand current form structure and imports
- Dependencies: None

**Step 2: write**
- Description: Add remember-me checkbox to login form
- Path: src/components/LoginForm.tsx
- Expected outcome: Form has remember-me checkbox with state
- Dependencies: Step 1

**Step 3: run**
- Description: Run tests to verify changes
- Command: npm test
- Expected outcome: All tests pass
- Dependencies: Step 2

========================================
CRITICAL CONSTRAINT FOR 'write' STEPS - READ CAREFULLY:
========================================

Each 'write' step creates EXACTLY ONE file.

You are STRICTLY FORBIDDEN from:
- ❌ Including multiple file paths in a single step
- ❌ Using commas to list multiple files
- ❌ Creating multiple files in one step

INVALID EXAMPLES (DO NOT DO THIS):
❌ **Step 2: write**
- Path: ProductPage.tsx, SearchFilter.tsx
- Description: Create multiple files
[THIS IS WRONG - MULTIPLE FILES IN ONE STEP]

❌ **Step 3: write**
- Path: src/components/ProductPage.tsx, src/pages/Details.tsx
[THIS IS WRONG - COMMA-SEPARATED PATHS FORBIDDEN]

VALID EXAMPLES (DO THIS):
✅ **Step 2: write**
- Path: src/components/ProductPage.tsx
- Description: Create product page component

✅ **Step 3: write**
- Path: src/pages/SearchFilter.tsx
- Description: Create search filter component

REMEMBER:
- ONE file per 'write' step
- NO commas in Path
- NO multiple paths
- Create separate steps for each file

If you need to create 3 files, output 3 separate 'write' steps.

========================================
CRITICAL CONSTRAINT FOR 'run' STEPS - READ CAREFULLY:
========================================

If your step's action is 'run', the 'command' field is MANDATORY.

You are STRICTLY FORBIDDEN from generating a 'run' step without a valid shell command.

INVALID EXAMPLES (DO NOT DO THIS):
❌ **Step 2: run**
- Description: Run tests
- [No Command field] ← THIS IS WRONG - YOU MUST INCLUDE COMMAND

❌ **Step 2: run**
- Description: Run the tests to verify
- Command: [empty or missing] ← THIS IS WRONG - COMMAND CANNOT BE EMPTY

VALID EXAMPLES (DO THIS):
✅ **Step 2: run**
- Description: Run tests to verify changes
- Command: npm test

✅ **Step 4: run**
- Description: Run linting checks
- Command: npm run lint

✅ **Step 6: run**
- Description: Build the project for production
- Command: npm run build

REMEMBER:
- Every 'run' step MUST have a Command field
- The Command field MUST NOT be empty
- The Command field MUST be a valid shell command
- Examples: npm test, npm run build, npm run lint, pytest, yarn build, etc.

If you cannot determine the exact command, do NOT output a run step.
Output a different step type instead (read, write, delete).

Continue for all steps needed to complete the request.
Use only read/write/run/delete actions. No analyze/review/suggestwrite.`;
  }

  /**
   * Parse LLM response into structured ExecutionStep objects
   */
  private parseSteps(responseText: string): ExecutionStep[] {
    const steps: ExecutionStep[] = [];

    // Look for step patterns: "**Step N:** action"
    const stepPatterns = [
      /\*\*Step\s+(\d+):\s*(\w+)\*\*/gi,
      /Step\s+(\d+):\s*(\w+)/gi,
      /^\d+\.\s+(\w+)/gim,
    ];

    let stepMatches: RegExpExecArray | null = null;
    let currentPattern = 0;

    // Try each pattern
    for (const pattern of stepPatterns) {
      stepMatches = pattern.exec(responseText);
      if (stepMatches) {
        currentPattern = stepPatterns.indexOf(pattern);
        break;
      }
    }

    if (!stepMatches) {
      // Fallback: split by "Step" and parse each block
      const stepBlocks = responseText.split(/\*\*Step\s+\d+:|Step\s+\d+:/i).slice(1);

      stepBlocks.forEach((block, index) => {
        const step = this.parseStepBlock(block, index + 1);
        if (step) steps.push(step);
      });

      return steps;
    }

    // Parse with the matching pattern
    const pattern = stepPatterns[currentPattern];
    let match;
    let stepNumber = 1;

    while ((match = pattern.exec(responseText)) !== null) {
      let action = (match[2] || 'read').toLowerCase();
      
      // SCHEMA ENFORCEMENT: Validate action against allowed types
      try {
        assertValidActionType(action);
      } catch (err) {
        // If action is invalid (like 'analyze' or 'review'), map to closest valid action
        if (['analyze', 'review'].includes(action)) {
          console.warn(`Warning: Action "${action}" is not executable. Planner should do this analysis itself.`);
          // Skip this step since it shouldn't have been output
          continue;
        }
        if (action === 'suggestwrite') {
          console.warn(`Warning: Action "suggestwrite" should be "write". Correcting...`);
          action = 'write';
        }
        // For unknown actions, skip
        action = 'read'; // Default fallback
      }

      const startIndex = pattern.lastIndex;

      // Find the next step or end of text
      const nextStepMatch = /(?:\*\*Step\s+\d+:|Step\s+\d+:|\n\d+\.)/i.exec(responseText.substring(startIndex));
      const endIndex = nextStepMatch ? startIndex + nextStepMatch.index : responseText.length;
      const stepContent = responseText.substring(startIndex, endIndex);

      const step: ExecutionStep = {
        stepNumber,
        stepId: stepNumber,
        action: action as ActionTypeString,
        description: this.extractDescription(stepContent),
        path: this.extractTargetFile(stepContent),
        targetFile: this.extractTargetFile(stepContent), // For backward compat
        command: this.extractCommand(stepContent), // CRITICAL: Extract command for run steps
        expectedOutcome: this.extractExpectedOutcome(stepContent),
        dependencies: this.extractDependencies(stepContent),
      };

      if (step.description) {
        steps.push(step);
        stepNumber++;
      }
    }

    return steps;
  }

  /**
   * Parse a single step block (for fallback pattern)
   */
  private parseStepBlock(block: string, stepNumber: number): ExecutionStep | null {
    const lines = block.split('\n').filter(l => l.trim());
    if (lines.length === 0) return null;

    // Extract action from first line
    const firstLine = lines[0];
    let action = 'read'; // Default to read
    
    if (firstLine.includes('write')) action = 'write';
    else if (firstLine.includes('run')) action = 'run';
    else if (firstLine.includes('delete')) action = 'delete';
    else if (firstLine.includes('read')) action = 'read';
    // Note: If it says 'analyze' or 'review', we default to 'read' 
    // (schema enforcement: these should not appear in step output)

    return {
      stepNumber,
      stepId: stepNumber,
      action: action as ActionTypeString,
      description: this.extractDescription(block),
      path: this.extractTargetFile(block),
      targetFile: this.extractTargetFile(block), // For backward compat
      command: this.extractCommand(block), // CRITICAL: Extract command for run steps
      expectedOutcome: this.extractExpectedOutcome(block),
      dependencies: this.extractDependencies(block),
    };
  }

  /**
   * Extract description from step block
   */
  private extractDescription(text: string): string {
    // Look for "Description:" or "- Description:"
    const descMatch = text.match(/(?:Description|What to do)[:\s]+([^\n]+)/i);
    if (descMatch) {
      return descMatch[1].trim();
    }

    // Fallback: first non-empty line
    const lines = text.split('\n').filter(l => l.trim());
    return lines[0]?.replace(/^[-*]\s+/, '').trim() || '';
  }

  /**
   * Extract target file from step block
   */
  private extractTargetFile(text: string): string | undefined {
    const targetMatch = text.match(/(?:Target|File|Path)[:\s]+([^\n]+)/i);
    if (targetMatch) {
      return targetMatch[1].trim();
    }
    return undefined;
  }

  /**
   * Extract command from step block (for 'run' actions)
   * Looks for "Command:" or "Run:" patterns
   * Falls back to inferring common test/build commands from description
   */
  private extractCommand(text: string): string | undefined {
    // Try explicit "Command: npm test" or "Run: npm test"
    const cmdMatch = text.match(/(?:Command|Run)[:\s]+([^\n]+)/i);
    if (cmdMatch) {
      const cmd = cmdMatch[1].trim();
      // Remove trailing punctuation
      return cmd.replace(/[.;,]*$/, '');
    }

    // Fallback: Infer from description if it mentions common commands
    if (text.toLowerCase().includes('test')) {
      return 'npm test'; // Most common pattern
    }
    if (text.toLowerCase().includes('build')) {
      return 'npm run build';
    }
    if (text.toLowerCase().includes('lint')) {
      return 'npm run lint';
    }
    if (text.toLowerCase().includes('format')) {
      return 'npm run format';
    }
    if (text.toLowerCase().includes('dev') || text.toLowerCase().includes('start')) {
      return 'npm run dev';
    }

    // No command found or inferred
    return undefined;
  }

  /**
   * Extract expected outcome from step block
   */
  private extractExpectedOutcome(text: string): string {
    const outcomeMatch = text.match(/Expected\s+(?:outcome|result)[:\s]+([^\n]+)/i);
    if (outcomeMatch) {
      return outcomeMatch[1].trim();
    }
    return 'Step completed';
  }

  /**
   * Extract dependencies from step block
   */
  private extractDependencies(text: string): number[] | undefined {
    const depsMatch = text.match(/Dependencies?[:\s]+(?:Step\s+)?(\d+(?:\s*,\s*\d+)*)/i);
    if (depsMatch) {
      return depsMatch[1]
        .split(',')
        .map(n => parseInt(n.trim(), 10))
        .filter(n => !isNaN(n));
    }
    return undefined;
  }

  /**
   * Extract high-level reasoning from LLM response
   * (For user understanding of why this plan was chosen)
   */
  private extractReasoning(text: string): string {
    // Look for reasoning section
    const reasoningMatch = text.match(/(?:Reasoning|Approach|Strategy)[:\s]+([^\n]+(?:\n(?!\*\*Step)[^\n]*)*)/i);
    if (reasoningMatch) {
      return reasoningMatch[1].trim();
    }

    // Fallback: return first paragraph
    const lines = text.split('\n\n')[0];
    return lines || 'Plan generated based on user request';
  }
}
