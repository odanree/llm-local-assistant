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

      // DEBUG: Log raw LLM response to see Qwen output format
      console.log('[Planner] Raw LLM Response: ', llmResponse);
      console.log('[Planner] Response length:', llmResponse.length);

      // Parse the response into structured steps
      const steps = this.parseSteps(llmResponse);

      if (!steps || steps.length === 0) {
        throw new Error('No steps could be extracted from LLM response');
      }

      // NEW: Topological sort steps by dependencies (Phase 2.3)
      // Ensures optimal execution order and detects circular dependencies
      let sortedSteps: ExecutionStep[];
      try {
        sortedSteps = this.topologicalSort(steps);
        console.log('[Planner] Steps sorted topologically:', sortedSteps.map(s => s.id).join(' → '));
      } catch (err) {
        // If sorting fails, fall back to original order with warning
        console.warn('[Planner] Topological sort failed, using original order:', err);
        sortedSteps = steps;
      }

      const plan: TaskPlan = {
        taskId: `plan-${Date.now()}`,
        userRequest,
        steps: sortedSteps,
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

  /**
   * Topological sort of DAG steps (Phase 2.3)
   * 
   * Sorts steps in dependency order for optimal execution.
   * Detects circular dependencies and missing dependencies.
   * 
   * Algorithm:
   * 1. Build adjacency list from dependencies
   * 2. Detect cycles (Kahn's algorithm)
   * 3. Return sorted order or throw error if cyclic
   * 
   * Input: Array of ExecutionStep with id and dependsOn fields
   * Output: Sorted array ready for execution
   * Throws: Error if circular dependency or missing dependency detected
   */
  private topologicalSort(steps: ExecutionStep[]): ExecutionStep[] {
    if (steps.length === 0) return steps;

    // Build map of step ID to step
    const stepMap = new Map<string, ExecutionStep>();
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // Initialize all steps
    for (const step of steps) {
      if (step.id) {
        stepMap.set(step.id, step);
        inDegree.set(step.id, 0);
        adjacency.set(step.id, []);
      }
    }

    // Build graph
    for (const step of steps) {
      if (!step.id) continue;
      
      if (step.dependsOn && step.dependsOn.length > 0) {
        for (const depId of step.dependsOn) {
          // CRITICAL: Reject self-referential dependencies (should not happen after parsing filter)
          if (depId === step.id) {
            throw new Error(
              `SELF_DEPENDENCY: Step "${step.id}" depends on itself. ` +
              `This is invalid and should have been filtered during parsing. ` +
              `Please report this as a parser bug.`
            );
          }
          
          // Check if dependency exists
          if (!stepMap.has(depId)) {
            throw new Error(
              `MISSING_DEPENDENCY: Step "${step.id}" depends on "${depId}" which doesn't exist. ` +
              `Available steps: ${Array.from(stepMap.keys()).join(', ')}`
            );
          }
          
          // Add edge: depId → step.id
          adjacency.get(depId)!.push(step.id);
          inDegree.set(step.id, (inDegree.get(step.id) || 0) + 1);
        }
      }
    }

    // Kahn's algorithm for topological sort
    const queue: string[] = [];
    const sorted: ExecutionStep[] = [];

    // Find all nodes with in-degree 0
    for (const [stepId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(stepId);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      const step = stepMap.get(current)!;
      sorted.push(step);

      // Reduce in-degree for all neighbors
      for (const neighbor of adjacency.get(current)!) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, newDegree);
        
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // Check for cycles
    if (sorted.length !== steps.length) {
      throw new Error(
        `CIRCULAR_DEPENDENCY: Dependency graph contains a cycle. ` +
        `Cannot determine valid execution order. ` +
        `Check that dependencies form a DAG (no cycles).`
      );
    }

    return sorted;
  }

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

DEPENDENCIES (NEW - CRITICAL FOR EXECUTION ORDER):
- EACH STEP MAY HAVE DEPENDENCIES: List step IDs that must complete first
- Format: "Depends on: step_write_config, step_install_deps"
- Use when a step requires output/results from previous steps
- EXAMPLES:
  * Step 2 installs packages → Step 3 (run tests) Depends on: step_run_install
  * Step 1 creates config → Step 2 (read config) Depends on: step_write_config
  * Step 1-2 independent → Step 3 Depends on: step_write_app, step_install_deps
- If a step has NO dependencies (can run first or independently), omit this field
- IMPORTANT: Declare dependencies explicitly - don't assume the executor will figure it out

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

🔴 CRITICAL: Output ONLY a valid JSON array of steps. 
DO NOT include bold text, bullet points, markdown, code blocks, or conversational filler. 
Your entire response must start with '[' and end with ']'.
NOTHING ELSE. Not even triple backticks.

JSON FORMAT (exactly):
[
  {
    "step": 1,
    "action": "write",
    "description": "What to do",
    "path": "src/file.tsx",
    "expectedOutcome": "File created"
  },
  {
    "step": 2,
    "action": "run",
    "description": "Install dependencies",
    "command": "npm install",
    "dependsOn": ["step_1"],
    "expectedOutcome": "All packages installed"
  }
]

REQUIRED FIELDS (all steps):
- step: Number (1, 2, 3...)
- action: One of: write, read, run, delete
- description: What this step does

CONDITIONAL FIELDS:
- path: Required for write/read/delete actions
- command: Required for run actions
- dependsOn: Optional array of step numbers this depends on (e.g., ["step_1"] or ["step_1", "step_2"])
- expectedOutcome: Optional (defaults to "Step completed")

Output ONLY the JSON array. No markdown. No explanations. Nothing else.`;
  }

  /**
   * Generate deterministic semantic ID for a step
   * 
   * NEW: DAG Foundation (Phase 2)
   * Semantic IDs are used as DAG node keys and dependency references.
   * Format: step_[action]_[description_slug]
   * Examples: step_write_config, step_install_deps, step_run_tests
   */
  /**
   * Generate step ID for DAG dependency tracking
   * CRITICAL: Must match format that LLM outputs in dependencies
   * LLM outputs: "Depends on: step_1, step_2"
   * So we use simple numeric format: step_1, step_2, step_3
   * 
   * Option B: Simple numeric IDs (SELECTED)
   * - Simpler and cleaner than semantic IDs
   * - Matches LLM output format exactly
   * - Better contract between LLM and Executor
   * - stepNumber is 1-indexed (first step = 1)
   */
  private generateStepId(stepNumber: number): string {
    return `step_${stepNumber}`;
  }

  /**
   * Parse LLM response into structured ExecutionStep objects
   * NEW: JSON-based parsing instead of markdown
   * 
   * Handles:
   * 1. Pure JSON array (expected)
   * 2. Markdown code blocks (```json ... ```)
   * 3. Markdown formatting that slipped through
   */
  private parseSteps(responseText: string): ExecutionStep[] {
    // Step 1: Strip markdown code blocks if present
    let cleaned = responseText
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    // Step 2: Find the JSON array boundaries
    const startIdx = cleaned.indexOf('[');
    const endIdx = cleaned.lastIndexOf(']');

    if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
      throw new Error(
        'PLANNER_ERROR: Response did not contain a valid JSON array. ' +
        'Expected format: [{ "step": 1, "action": "write", ... }, ...]'
      );
    }

    // Step 3: Extract and parse JSON
    const jsonBody = cleaned.substring(startIdx, endIdx + 1);
    let parsedSteps: any[];
    
    try {
      parsedSteps = JSON.parse(jsonBody);
    } catch (err) {
      throw new Error(
        `PLANNER_ERROR: Failed to parse JSON response. ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Step 4: Convert parsed JSON to ExecutionStep objects
    const steps: ExecutionStep[] = [];
    
    if (!Array.isArray(parsedSteps)) {
      throw new Error('PLANNER_ERROR: JSON root must be an array of steps');
    }

    for (let i = 0; i < parsedSteps.length; i++) {
      const raw = parsedSteps[i];
      const stepNumber = (raw.step || i + 1) as number;

      // Validate action
      let action = (raw.action || 'read').toLowerCase().trim();
      try {
        assertValidActionType(action);
      } catch {
        console.warn(`Warning: Invalid action "${action}", defaulting to "read"`);
        action = 'read';
      }

      // Extract dependencies (convert from array if present)
      let dependsOn: string[] | undefined;
      if (raw.dependsOn) {
        if (Array.isArray(raw.dependsOn)) {
          dependsOn = raw.dependsOn
            .map((dep: any) => {
              if (typeof dep === 'number') return `step_${dep}`;
              return String(dep).toLowerCase();
            });
        } else if (typeof raw.dependsOn === 'string') {
          // Handle comma-separated string like "step_1, step_2"
          dependsOn = raw.dependsOn
            .split(',')
            .map(d => d.trim().toLowerCase());
        }
      }

      // CRITICAL: Filter out self-referential dependencies
      const currentStepId = this.generateStepId(stepNumber);
      const cleanDependsOn = dependsOn
        ? dependsOn.filter(depId => depId !== currentStepId)
        : undefined;

      // Warn if self-reference was detected
      if (dependsOn && dependsOn.length > 0 && cleanDependsOn && 
          dependsOn.length !== cleanDependsOn.length) {
        console.warn(`[PARSER] Warning: Step "${currentStepId}" had self-referential dependency, removed`);
      }

      // Create ExecutionStep
      const step: ExecutionStep = {
        stepNumber,
        stepId: stepNumber,
        id: currentStepId,
        action: action as ActionTypeString,
        description: (raw.description || '').trim(),
        path: (raw.path || raw.filePath || undefined)?.trim(),
        targetFile: (raw.path || raw.filePath || undefined)?.trim(),
        command: (raw.command || undefined)?.trim(),
        expectedOutcome: (raw.expectedOutcome || 'Step completed').trim(),
        dependencies: undefined, // Deprecated - use dependsOn instead
        dependsOn: cleanDependsOn,
      };

      // Only add if step has a description
      if (step.description) {
        steps.push(step);
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

    const description = this.extractDescription(block);
    const rawDependsOn = this.extractSemanticDependencies(block);
    
    // CRITICAL: Filter out self-referential dependencies
    // If a step somehow includes its own ID in dependsOn, remove it
    const currentStepId = this.generateStepId(stepNumber);
    const cleanDependsOn = rawDependsOn
      ? rawDependsOn.filter(depId => depId !== currentStepId)
      : undefined;
    
    // Warn if self-reference was detected (shouldn't happen, but catch it)
    if (rawDependsOn && rawDependsOn.length > 0 && cleanDependsOn && 
        rawDependsOn.length !== cleanDependsOn.length) {
      console.warn(`[PARSER] Warning: Step "${currentStepId}" had self-referential dependency, removed`);
    }

    return {
      stepNumber,
      stepId: stepNumber,
      id: currentStepId, // NEW: Simple numeric ID for DAG (step_1, step_2, ...)
      action: action as ActionTypeString,
      description,
      path: this.extractTargetFile(block),
      targetFile: this.extractTargetFile(block), // For backward compat
      command: this.extractCommand(block), // CRITICAL: Extract command for run steps
      expectedOutcome: this.extractExpectedOutcome(block),
      dependencies: this.extractDependencies(block),
      dependsOn: cleanDependsOn, // CRITICAL: Already filtered for self-references
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
   * CRITICAL: Must reject sentence fragments, only accept valid file paths
   */
  private extractTargetFile(text: string): string | undefined {
    // CRITICAL: Match "- Path:" or "- Command:" FIRST before description
    // This prevents grabbing description content as path
    
    // Pattern 1: Explicitly look for "- Path: " lines (highest priority)
    const pathMatch = text.match(/^[\s]*-\s*(?:Path|File|Target)[:\s]+([^\n]+)$/im);
    if (pathMatch) {
      const path = pathMatch[1].trim();
      // Only accept if it looks like a valid path (has file extension or src/ prefix)
      if (path.includes('.') || path.includes('/')) {
        return path.replace(/[`'"]([^`'"]+)[`'"]/g, '$1').trim();
      }
    }

    // Pattern 2: Look for "Path: " anywhere in text (not preceded by description marker)
    const pathOnlyMatch = text.match(/(?<!Description[:\s]*[^\n]*)Path[:\s]+([^\n:]+\.[a-z]{2,}[^\n]*)/i);
    if (pathOnlyMatch) {
      return pathOnlyMatch[1].trim().replace(/[`'"]([^`'"]+)[`'"]/g, '$1').trim();
    }

    // Pattern 3: Look for explicit file paths with extensions (src/ or similar)
    const filePathMatch = text.match(/(src\/[^\n\s]+\.[a-z]{2,})/i);
    if (filePathMatch) {
      const path = filePathMatch[1].trim();
      // Reject if it's part of a sentence (contains sentence words)
      if (!path.includes(' for ') && !path.includes(' the ') && !path.includes('component.')) {
        return path;
      }
    }

    return undefined;
  }

  /**
   * Extract command from step block (for 'run' actions)
   * Looks for "- Command:" or "- Run:" patterns specifically
   * CRITICAL: Must match the actual Command line, not Description
   */
  private extractCommand(text: string): string | undefined {
    // Pattern 1: Explicitly look for "- Command: " or "- Run: " lines (highest priority)
    const explicitCmdMatch = text.match(/^[\s]*-\s*(?:Command|Run)[:\s]+([^\n]+)$/im);
    if (explicitCmdMatch) {
      const cmd = explicitCmdMatch[1].trim();
      // Remove trailing punctuation
      return cmd.replace(/[.;,]*$/, '');
    }

    // Pattern 2: Look for "Command: " anywhere but ensure it's not part of Description
    const cmdMatch = text.match(/(?<!Description[:\s]*[^\n]*)(?:Command|Run)[:\s]+([^\n]+)/i);
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
   * Extract semantic dependencies from step (NEW: DAG Phase 2.2)
   * 
   * Looks for:
   * - "Depends on: step_write_config, step_install_deps"
   * - "Depends on step_xyz"
   * - "Dependency: step_abc, step_def"
   * 
   * Returns array of step IDs, or undefined if none found.
   */
  private extractSemanticDependencies(text: string): string[] | undefined {
    // Pattern 1: "Depends on: step_xyz, step_abc" or "Depends on step_xyz"
    const depsMatch = text.match(/Depends\s+on[:\s]+([^.\n]+)/i);
    if (depsMatch) {
      const depText = depsMatch[1];
      // Extract all step_xxx identifiers
      const stepIds = depText.match(/step_[a-z0-9_]+/gi);
      if (stepIds) {
        return stepIds.map(id => id.toLowerCase());
      }
    }
    
    // Pattern 2: "Dependency: step_xyz, step_abc"
    const depMatch2 = text.match(/Dependency[:\s]+([^.\n]+)/i);
    if (depMatch2) {
      const depText = depMatch2[1];
      const stepIds = depText.match(/step_[a-z0-9_]+/gi);
      if (stepIds) {
        return stepIds.map(id => id.toLowerCase());
      }
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
