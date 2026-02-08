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
  projectContext?: {
    language: 'TypeScript' | 'JavaScript';
    strategy: 'DIFF_MODE' | 'SCAFFOLD_MODE';
    extension: '.tsx' | '.jsx' | '.ts' | '.js';
    root: string;
    isMinimalProject: boolean;
  };
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
   * CRITICAL: Schema-Strict Planner (Danh's Interface Contract Fix)
   * - Separate System Actions (what computer does) from User Instructions (what human does)
   * - Prevent "Manual" value from entering action/path fields
   * - Do NOT allow manual verification as ExecutionStep
   * 
   * NEW: Context Anchoring (Danh's Core Four closure)
   * - Inject project language, strategy, root directory
   * - LLM no longer guesses tech stack
   */
  private buildPlanPrompt(userRequest: string, hasTests: boolean = true): string {
    // OPTIMIZED FOR SMALL MODELS (e.g., qwen2.5-coder:7b)
    // Use shorter, more direct prompts. Verbose prompts confuse small models.
    
    const context = this.config.projectContext;
    let contextSection = '';
    
    if (context) {
      contextSection = `
ENVIRONMENT (MANDATORY):
- Language: ${context.language}
- Strategy: ${context.strategy}
- File Extension: ${context.extension}
- Root Directory: ${context.root}
- Project Type: ${context.isMinimalProject ? 'MINIMAL' : 'MATURE'}

PATH_RULES:
1. All new files must use: ${context.extension}
2. All new files go in: ${context.root}
3. FORBIDDEN: /path/to/, your-project/, {PROJECT_ROOT}/
4. REQUIRED: Real project paths like src/components/Button.${context.extension.slice(1)}
`;
    }
    
    return `You are a step planner. Output a numbered plan.

### CRITICAL EXECUTION RULES (MUST FOLLOW):

1. **CREATION = WRITE**: If the user says "create", "add", "generate", "build", or "make", you MUST use the WRITE action.
   - WRONG: Step 1: READ, Path: src/Button.tsx, Description: "Create a button component"
   - RIGHT: Step 1: WRITE, Path: src/components/Button.tsx, Description: "Create a button component"

2. **NO MANUAL STEPS**: You are a fully autonomous executor. Never output "Manual verification" or "Check browser" as a step command.
   - WRONG: Step 4: read, Path: "manual verification", Command: "Test button in browser"
   - RIGHT: Add to plan summary: "Manual verification: Test button in browser after execution"

3. **READ IS FOR EXISTING ONLY**: Only use READ if you are refactoring a file that already exists in the provided context.
   - READ = File must exist before this step
   - WRITE = File is being created or modified
   - If unsure whether file exists, default to WRITE (executor will handle it)

STEP TYPES & CONSTRAINTS (MANDATORY):
- write: Requires path and content. Creates or modifies files.
- read: Requires path. Reads existing files only.
- run: Requires command. Executes shell commands.
- delete: Requires path. Removes files.

MANUAL VERIFICATION (IMPORTANT):
- If a step requires human intervention (e.g., "test in browser", "verify visually"):
  * Do NOT create a step with action='read' or 'manual'
  * Instead, put instructions in the plan summary
  * CRITICAL: Do NOT use 'manual' as action or in path field
  * Example WRONG: Step 4: read, Path: manual verification
  * Example RIGHT: Add to summary: "Manual verification: Test button in browser"

RULES:
- ONE file per write step (never multiple files)
- Include commands for run steps
${hasTests ? '- Use "run" for npm test' : '- NO npm test, jest, vitest, pytest\n- Use plan summary for verification'}
${contextSection}
USER REQUEST: ${userRequest}

OUTPUT THIS FORMAT (exactly):

**Step 1: ACTION**
- Description: What to do
- Path/Command: Details
- Expected: Result

**Step 2: ACTION**
- Description: What to do
- Path/Command: Details
- Expected: Result

Output only the plan. No explanations.`;
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

    // Extract action from first line (case-insensitive!)
    const firstLine = lines[0].toLowerCase();  // Convert to lowercase for comparison
    let action = 'read'; // Default to read
    
    if (firstLine.includes('manual')) action = 'manual';   // CONTEXT-AWARE: Check MANUAL first (highest priority)
    else if (firstLine.includes('write')) action = 'write';
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
   * CRITICAL: Must handle various formats that LLM might output
   */
  private extractTargetFile(text: string): string | undefined {
    // Try multiple patterns for extracting file paths
    const patterns = [
      /(?:Target|File|Path)[:\s]+([^\n]+)/i,           // "Path: src/file.tsx"
      /(?:- Path|File Path|Target File)[:\s]+([^\n]+)/i, // "- Path: src/file.tsx"
      /src\/[^\n]+/,                                    // Direct path match "src/..."
      /(?:write|read|modify|update|create)[:\s]+([^\n]+)/i, // "write: src/file.tsx"
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const path = (match[1] || match[0]).trim();
        // Clean up the path
        return path.replace(/^[-*]\s+/, '').replace(/[`'"]([^`'"]+)[`'"]/g, '$1').trim();
      }
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
