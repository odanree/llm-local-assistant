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
 * - Invalid actions: analyze, review (do these in planning, not execution)
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
import { PlanStateString } from './types/PlanState';
import { sanitizeJson, safeParse } from './utils/jsonSanitizer';
import { TEMPLATE_FEATURES, TEMPLATE_METADATA } from './constants/templates';

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
  status?: PlanStateString | 'pending'; // For executor tracking (PlanState enum + backward compat)
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
    projectContext?: any,  // CONTEXT-AWARE PLANNING: Accept project context
    ragContext?: string    // RAG: relevant existing files for this task
  ): Promise<TaskPlan> {
    this.config.onProgress?.('Planning', 'Decomposing request into steps...');

    // CONTEXT-AWARE PLANNING: Check if project has tests
    let hasTests = true; // Default: assume has tests
    if (projectContext) {
      hasTests = projectContext.hasTests ?? true;
      console.log(`[Planner] Project context: hasTests=${hasTests}, testFramework=${projectContext.testFramework}`);
    }

    const planPrompt = this.buildPlanPrompt(userRequest, hasTests, ragContext);

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

      // POST-PROCESS: Drop WRITE steps for files that are already in the RAG context
      // The LLM was explicitly told not to write these files, but sometimes ignores it.
      // Enforcing in code is more reliable than relying solely on prompt instructions.
      if (ragContext) {
        sortedSteps = this.filterRedundantWrites(sortedSteps, ragContext, workspacePath);
      }

      // POST-PROCESS: Drop WRITE steps to entry/global files not mentioned in the user request.
      // The planner commonly adds App.tsx/index.tsx modifications to "wire up" a new component
      // even when the user only asked for one file. This is almost never correct behavior.
      sortedSteps = this.filterUnrequestedEntryWrites(sortedSteps, userRequest);

      // POST-PROCESS: Drop noise READ steps.
      // A READ step is noise when the plan already has WRITE steps but this READ
      // has no downstream WRITE to the same path — these are LLM epilogues:
      // "verify your work", "view result", "see the output", etc.
      sortedSteps = this.filterNoisyReadSteps(sortedSteps);

      // POST-PROCESS: Drop test RUN steps when the project has no test files,
      // OR when the user didn't explicitly ask to run/verify tests.
      // The LLM prompt discourages unconditional test steps, but this guard
      // is the hard backstop for when the LLM ignores the instruction.
      const userRequestedTests =
        /\b(test|spec|vitest|jest|pytest|coverage|run tests?|verify tests?|check tests?)\b/i.test(
          userRequest
        );
      if (!hasTests || !userRequestedTests) {
        sortedSteps = this.filterTestSteps(sortedSteps);
      }

      // POST-PROCESS: Strip dependency references that point to steps removed by filters above.
      // Without this, remaining steps that declared dependsOn a filtered step throw
      // DEPENDENCY_VIOLATION at execution time.
      sortedSteps = this.stripStaleDependencies(sortedSteps);

      // POST-PROCESS: Re-sort after filtering to ensure correct execution order.
      // Filters may change the step set; the original topological order may now be stale
      // (e.g. step_3 placed before step_2 because step_4 — which was its only predecessor in
      // the original graph — was filtered out). Re-running topological sort on the surviving
      // steps with their updated dependencies produces a valid execution order.
      try {
        sortedSteps = this.topologicalSort(sortedSteps);
        console.log(`[Planner] Re-sorted ${sortedSteps.length} steps after filtering`);
      } catch (resortErr) {
        // If re-sort fails (should not happen after stripStaleDependencies), keep current order
        console.warn(`[Planner] Post-filter re-sort failed (keeping current order): ${resortErr}`);
      }

      // FINAL: Re-number steps sequentially to match display order.
      // Topological sort changes execution order but stepNumber still holds the LLM's
      // original numbering — this causes display gaps like [Step 1][Step 2][Step 4][Step 3].
      sortedSteps = sortedSteps.map((step, i) => ({ ...step, stepNumber: i + 1 }));

      const plan: TaskPlan = {
        taskId: `plan-${Date.now()}`,
        userRequest,
        steps: sortedSteps,
        generatedAt: new Date(),
        reasoning: this.extractReasoning(llmResponse),
        workspacePath, // CRITICAL: Carry workspace context forward
        workspaceName, // CRITICAL: Display name for logging/debugging
      };

      // PRE-FLIGHT VALIDATION: Check template compliance before execution (NEW)
      this.validatePlanAgainstTemplates(plan);

      this.config.onProgress?.('Planning', `Generated ${sortedSteps.length} steps`);
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
    if (steps.length === 0) {return steps;}

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
      if (!step.id) {continue;}
      
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

  private buildPlanPrompt(userRequest: string, hasTests: boolean = true, ragContext?: string): string {
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
    
    // Extract file paths from RAG context to build an explicit FORBIDDEN list
    const ragPaths = ragContext
      ? [...ragContext.matchAll(/^-\s+(\S+)\s+\(/gm)].map(m => m[1])
      : [];

    const ragSection = ragContext
      ? `\nEXISTING CODEBASE — these files ALREADY EXIST in the project. Do NOT create or recreate them. Import and use them directly:\n${ragContext}\n\n` +
        (ragPaths.length > 0
          ? `FORBIDDEN WRITES — you MUST NOT generate a WRITE step for any of these paths (they already exist):\n` +
            ragPaths.map(p => `  ✗ ${p}`).join('\n') + '\n'
          : '')
      : '';

    return `You are a step planner. Output a numbered plan.
${ragSection}
### CRITICAL: PLAN-CONTENT DECOUPLING (DANH'S ARCHITECTURE)

THE PLANNER'S JOB: Only output Path and Reasoning
- DO NOT include file content in the plan
- DO NOT include code snippets in the plan
- DO NOT include file bodies in the plan

THE EXECUTOR'S JOB: Generate actual file content
- Executor receives your plan (path + reasoning)
- Executor calls LLM separately to generate code
- This separation keeps JSON small and clean

YOUR OUTPUT FORMAT:
✅ CORRECT:
  Step 1: WRITE, Path: src/components/Button.tsx, Description: "Create button component with className prop"

❌ WRONG:
  Step 1: WRITE, Path: src/components/Button.tsx, Description: "Create button component with className prop",
          Content: "import React from 'react'; export function Button() { ... }"

BENEFIT OF DECOUPLING:
- Planner focuses on WHAT to create (path, purpose)
- Executor focuses on HOW to create it (code generation)
- No giant JSON payloads with embedded code
- No control character issues from code content
- Cleaner, simpler architecture

### CRITICAL EXECUTION RULES (MUST FOLLOW):

1. **CREATION = WRITE**: If the user says "create", "add", "generate", "build", or "make", you MUST use the WRITE action.
   - WRONG: Step 1: READ, Path: src/Button.tsx, Description: "Create a button component"
   - RIGHT: Step 1: WRITE, Path: src/components/Button.tsx, Description: "Create a button component"

2. **NO MANUAL STEPS**: You are a fully autonomous executor. Never output "Manual verification" or "Check browser" as a step command.
   - WRONG: Step 4: read, Path: "manual verification", Command: "Test button in browser"
   - RIGHT: Add to plan summary: "Manual verification: Test button in browser after execution"

3. **READ IS FOR EXISTING FILES**: Use READ when (a) refactoring a file that already exists, OR (b) a WRITE step needs to import from an EXISTING file whose API must be known first.
   - DEPENDENCY READ: if the request says "using the existing X" or "integrating with X" and X is an existing file (store, hook, module), add READ X immediately BEFORE the WRITE step that imports it
   - Example: "using the existing authStore" → Step 1: READ src/stores/authStore.ts, Step 2: WRITE the new component
   - READ = File must exist before this step
   - WRITE = File is being created or modified
   - If unsure whether file exists, default to WRITE (executor will handle it)

STEP TYPES & CONSTRAINTS (MANDATORY):
- write: Requires path and content. Creates or modifies files.
- read: Requires path. Reads existing files only.
- run: Requires a real shell command (e.g. "npm test"). NEVER use run for manual/visual verification — omit the step and note it in the summary instead. NEVER use "npm run dev", "npm start", "yarn dev", "yarn start", or any command that starts a long-running server — these never exit and will hang execution. NEVER add a step to run "npx tsc --noEmit" or check TypeScript compilation — the executor runs tsc automatically after every WRITE step. Avoid "npm run build" — it may fail in environments without a complete entry point (e.g. missing index.html).
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
  * Do NOT create a step with action='read', 'run', or 'manual'
  * Instead, put instructions in the plan summary
  * CRITICAL: Do NOT use 'manual' as action or in path field
  * CRITICAL: Do NOT use 'run' with a description instead of a real shell command
  * Example WRONG: Step 4: run, Command: "Manual verification: Test Counter in browser"
  * Example WRONG: Step 4: read, Path: manual verification
  * Example RIGHT: Add to summary: "Manual verification: Test button in browser"

RULES:
- ONE file per write step (never multiple files)
- Include commands for run steps
${hasTests ? '- Only add a "run" step for tests if the user explicitly asked to run or verify tests — do NOT add a test step for every feature request' : '- NO npm test, jest, vitest, pytest\n- Use plan summary for verification'}
- FILE EXTENSION: use .tsx for files containing JSX/React components; use .ts for pure logic (hooks, stores, services, utils, config)
  WRONG: src/App.ts (renders components) → RIGHT: src/App.tsx
  WRONG: src/components/Button.ts (returns JSX) → RIGHT: src/components/Button.tsx
  EXCEPTION — route config files export arrays of route data (no JSX):
    RIGHT: src/routes/Routes.ts  ← exports RouteConfig[], no JSX, pure data
    WRONG: src/routes/Routes.tsx ← .tsx implies JSX; route configs have no render output

SCOPE CONSTRAINT — FILE CREATION:
- ONLY create files explicitly named or clearly implied by the user's request
- If the user says "create LoginForm.tsx", create ONLY LoginForm.tsx — do NOT invent helper components (Input.tsx, Button.tsx, etc.) unless the user asked for them
- If a helper already exists in EXISTING CODEBASE above, it will be imported inside the generated file — do NOT add a WRITE step to recreate it
- Creating unrequested abstractions (reusable components, utilities, wrappers) is OUT OF SCOPE and will be rejected

DELIVERABLE COMPLETENESS RULE (CRITICAL — check this first):
The user's request names what they want created. That EXACT artifact MUST appear as a WRITE step.
A step description that mentions a file is NOT the same as a WRITE step for that file.
- "create a ProtectedRoute wrapper that checks a mockAuth service"
  → MUST have: WRITE src/components/ProtectedRoute.tsx  (primary deliverable)
  → MUST have: WRITE src/services/mockAuth.ts  (prerequisite)
  → WRONG: Plan only has WRITE src/services/mockAuth.ts — wrapper was never written
  → WRONG: Step description says "which the ProtectedRouteWrapper will use" but no WRITE step for it
- "create a Button component with variants" → MUST have: WRITE src/components/Button.tsx
- "decompose/extract/split App.tsx into Layout, Navigation, Routes"
  → MUST have: READ App.tsx, WRITE Layout.tsx, WRITE Navigation.tsx, WRITE Routes.ts, WRITE App.tsx (slim)
  → Count the deliverables in the request — every named artifact needs its own WRITE step
  → The final WRITE App.tsx step is MANDATORY — without it the original bloated file stays unchanged
- Rule: if the deliverable is mentioned in a description but has no WRITE step — the plan is incomplete

DECOMPOSE / EXTRACT PATTERN (applies when request says "decompose", "extract", "split", "break out", "pull out"):
The source file MUST be updated in the plan. Steps:
  1. READ the source file first (get full content)
  2. WRITE EVERY extracted file named in the request — if the request says "Layout, Navigation, Routes" that is THREE separate WRITE steps
  3. WRITE the source file again as a slim version that imports the new files
WRONG: Plan ends after writing the extracted files — source file still has all the old code
WRONG: Request names 3 files but plan only has 2 WRITE steps — one deliverable was silently dropped
RIGHT: Final step is WRITE src/App.tsx with only imports + composition of the new components

DECOMPOSE STEP DESCRIPTION REQUIREMENTS (each WRITE step description must be specific):
- Each extracted file description MUST name what the file owns/exports and what it reads from
  RIGHT: "Extract Navigation — reads accessible routes from Routes module, renders nav links"
  WRONG: "Extract the navigation rendering logic"  ← missing data source
- Each extracted file WRITE step must specify the contract: what it exports, what it consumes
- The slimmed source file description MUST state what was delegated
  RIGHT: "Slim App.tsx — routing delegated to Layout, only renders <BrowserRouter><Layout /></BrowserRouter>"
  WRONG: "Update App.tsx to use new components"  ← doesn't state what changed

FILE EXTENSION RULE FOR CONFIG/DATA FILES (mandatory):
- Route config files export arrays or objects of route definitions — they are DATA files, not components
  RIGHT: src/routes/Routes.ts  (exports RouteConfig[], no JSX)
  WRONG: src/routes/Routes.tsx  (.tsx implies JSX; a data config file has no JSX)
- Use .tsx ONLY when the file renders JSX (returns <JSX />)
- Use .ts for: hooks, services, utilities, config files, constants, type definitions, route arrays

STEP DESCRIPTION VOCABULARY (MANDATORY):
- Step descriptions must be specific about the CONTRACT (prop names, types, export shape) but silent about IMPLEMENTATION UTILITIES (how classes are merged, which library call is used).
  WRONG: "Create Badge component utilizing the cn() utility for class merging"  ← prescribes internal utility
  RIGHT:  "Create Badge component with severity: 'success'|'warning'|'error'|'info' prop and optional className prop"  ← specific contract, silent on utility
  WRONG: "Create form using react-hook-form's register and handleSubmit"
  RIGHT:  "Create form with email/password controlled inputs, onSubmit handler, and field-level error state"
- NEVER write "cn()", "clsx()", "classnames()" in a step description — how classes are merged is an implementation detail the executor decides
- In step descriptions, NEVER write "useForm", "react-hook-form", "register", "handleSubmit from useForm", or "FormProvider"
  These are react-hook-form library terms — do NOT use them to describe Zustand state management
- If the task involves a form that reads state from a Zustand store, write:
  "reads email, password from useAuthStore; calls login() on submit" — NOT "useForm (Zustand)"
- "useForm" is a react-hook-form hook. Zustand stores use "useXxxStore" (e.g. useAuthStore, useUserStore)

PROTECTED ROUTE PATTERN (applies when request mentions "protected route", "route guard", "auth check", "redirect to /login"):
A protected route checks whether the user IS ALREADY AUTHENTICATED — it does NOT re-validate credentials.
- The auth service/hook must check session state: isAuthenticated() → boolean, or getToken() → string | null
  WRONG: authenticateUser(username, password) — that's a LOGIN function, not a session check
  RIGHT: isAuthenticated(): boolean — reads a stored flag (e.g. localStorage, cookie, or Zustand isLoggedIn)
  RIGHT: getToken(): string | null — returns current session token from storage
- NEVER design the service to accept username/password arguments — there are no credentials at route-check time
- The component checks auth status, shows loading while checking, then either renders children or navigates to /login
- If an existing authStore is in scope (e.g. EXISTING CODEBASE has authStore.ts), read isLoggedIn from it directly

COMPONENT PROP CONTRACT (MANDATORY FOR src/components/):
📌 ALL NEW components must:
  - Extend standard HTML attributes (type, disabled, aria-label, etc.)
  - Accept className?: string prop for style extensibility
  - If src/utils/cn.ts exists in the workspace (visible in RAG context), import and use it for class merging; otherwise use clsx or conditional class expressions — never hallucinate cn() if it is not present
  - Interactive components (button, input) MUST include px-4 py-2 in base classes — components without padding are invisible by default
  - forwardRef components MUST set ComponentName.displayName = 'ComponentName' after definition
  - Example: interface ButtonProps { className?: string; children: React.ReactNode; }
  - Merge styles with the workspace's established pattern (cn() if confirmed available, otherwise clsx or conditional strings)
📌 EXCEPTION — DECOMPOSITION TASKS: When the task is "decompose/extract/split" an EXISTING file, do NOT impose cn() on extracted components. Match the styling approach of the source file. If the source uses inline style={{}}, the extracted components must also use inline style={{}}. Never write "uses cn()" in a step description for a component being extracted from an inline-style source.

${contextSection}
USER REQUEST: ${userRequest}

🔴 SELF-VERIFY BEFORE OUTPUTTING (mandatory — do this mentally before writing the JSON):
1. List every artifact the user named in the request (e.g. "Layout, Navigation, Routes.ts" = 3 artifacts)
2. Count your WRITE steps for NEW files — they must equal or exceed the artifact count
3. If any named artifact has no WRITE step: ADD IT before outputting
4. Check dependency order: if file A imports from file B, WRITE B must come before WRITE A
   Example: Navigation.tsx imports ROUTES from Routes.ts → WRITE Routes.ts first, WRITE Navigation.tsx second
   Example: Layout.tsx imports Navigation.tsx → WRITE Navigation.tsx BEFORE WRITE Layout.tsx
   DECOMPOSITION ORDER (mandatory): Routes.ts → Navigation.tsx → Layout.tsx → App.tsx (each imports the previous)
5. Check that the source file is updated: if decomposing a file, the final WRITE must slim it down

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

    // Step 3: Extract and parse JSON with robust sanitization
    const jsonBody = cleaned.substring(startIdx, endIdx + 1);
    
    let parsedSteps: any[];
    
    // Use robust jsonSanitizer (Danh's JSON Hardening)
    const parseResult = safeParse(jsonBody);
    
    if (!parseResult.success) {
      throw new Error(
        `PLANNER_ERROR: Failed to parse JSON response. ${parseResult.error}`
      );
    }

    parsedSteps = parseResult.data;

    // Step 4: Convert parsed JSON to ExecutionStep objects
    const steps: ExecutionStep[] = [];
    
    if (!Array.isArray(parsedSteps)) {
      throw new Error('PLANNER_ERROR: JSON root must be an array of steps');
    }

    for (let i = 0; i < parsedSteps.length; i++) {
      const raw = parsedSteps[i];
      // Use nullish coalescing (not ||) so step: 0 from LLM doesn't fall through to i+1
      // Clamp to minimum 1 — step IDs are 1-indexed (step_0 would mismatch completedStepIds)
      const stepNumber = Math.max(1, (raw.step ?? i + 1) as number);

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
              if (typeof dep === 'number') {return `step_${dep}`;}
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

      // Drop manual/human verification steps — they cannot be executed autonomously.
      // The planner prompt instructs the LLM to put these in the summary, not as steps,
      // but the LLM occasionally emits them anyway. Filter here as a hard guard.
      const descLower = step.description.toLowerCase();
      const isManualStep =
        descLower.includes('test in browser') ||
        descLower.includes('verify visually') ||
        descLower.includes('check browser') ||
        (action === 'read' && (step.path ?? '').toLowerCase().includes('manual'));
      if (isManualStep) {
        console.warn(`[PARSER] Dropping manual/human verification step: "${step.description}"`);
        continue;
      }

      // Drop redundant RUN/tsc steps — TypeScript compilation runs inline (Check 6)
      // after every WRITE step. A trailing tsc step adds noise and always gets skipped.
      const isTscStep =
        action === 'run' &&
        (descLower.includes('typescript') || descLower.includes('type check') ||
         descLower.includes('type-check') || descLower.includes(' tsc') ||
         descLower.startsWith('tsc') || descLower.includes('compilation')) &&
        !step.command; // Only drop if no actual shell command — real test runners still pass through
      if (isTscStep) {
        console.warn(`[PARSER] Dropping redundant tsc step (Check 6 handles this inline): "${step.description}"`);
        continue;
      }

      // Only add if step has a description
      if (step.description) {
        steps.push(step);
      }
    }

    return steps;
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

  /**
   * PRE-FLIGHT VALIDATION: Check Template Compliance (Danh's Enhancement)
   * 
   * Purpose: Catch template violations BEFORE execution
   * - Early rejection = faster feedback to user
   * - Prevents wasted execution on invalid plans
   * - Single Source of Truth validation
   * 
   * For each step that writes a known file:
   * 1. Check if TEMPLATE_FEATURES exist for that file
   * 2. Validate structure requirements
   * 3. Log violations with clear guidance
   * 4. Allow execution (Executor has final recovery with golden template)
   */
  private validatePlanAgainstTemplates(plan: TaskPlan): void {
    const violations: string[] = [];

    for (const step of plan.steps) {
      // Only validate write steps for known template files
      if (step.action === 'write' && step.path) {
        const templateKey = this.getTemplateKeyForPath(step.path);
        
        if (templateKey && TEMPLATE_FEATURES[templateKey as keyof typeof TEMPLATE_FEATURES]) {
          const features = TEMPLATE_FEATURES[templateKey as keyof typeof TEMPLATE_FEATURES];
          const metadata = TEMPLATE_METADATA[templateKey as keyof typeof TEMPLATE_METADATA];

          // Log what we expect to validate
          if (metadata) {
            console.log(`[Planner] Pre-flight check for ${step.path}:`);
            console.log(`  Required: ${metadata.criticalPoints.join(', ')}`);
            console.log(`  Avoid: ${metadata.commonHallucinations.slice(0, 2).join(', ')}`);
          }

          // Note: Full content validation happens in Executor with generated code
          console.log(`[Planner] Step ${step.id} (${step.path}) will be validated during execution`);
        }
      }
    }

    // Log summary
    console.log(`[Planner] Pre-flight validation complete. Executor will handle content validation.`);
  }

  /**
   * Helper: Get template key from file path
   * Maps: cn.ts → CN_UTILITY, etc.
   */
  private getTemplateKeyForPath(filePath: string): string | null {
    if (filePath.endsWith('cn.ts') || filePath.endsWith('cn.js')) {
      return 'CN_UTILITY';
    }
    // Add more mappings as needed
    return null;
  }


  /**
   * Drop noise READ steps from a plan that contains WRITE steps.
   *
   * A READ step is noise when:
   *   - The plan has at least one WRITE step (so this isn't a read-only query plan), AND
   *   - No later WRITE step in the plan targets the same path (so the READ output is never used).
   *
   * The LLM frequently appends "verify your work" epilogues — reading the file it just wrote.
   * These steps produce no output that affects subsequent steps and inflate the step count.
   *
   * Kept:
   *   - READ → WRITE same path (legitimate refactor pattern)
   *   - All READ steps in plans with zero WRITE steps
   *
   * Dropped:
   *   - READ with no matching downstream WRITE (pure noise)
   */
  private filterNoisyReadSteps(steps: ExecutionStep[]): ExecutionStep[] {
    const writtenPaths = new Set<string>(
      steps
        .filter(s => s.action === 'write' && s.path)
        .map(s => s.path!)
    );

    // If the plan has no writes at all, every read is intentional — keep them all
    if (writtenPaths.size === 0) { return steps; }

    const filtered = steps.filter((step, index) => {
      if (step.action !== 'read' || !step.path) { return true; }

      const normalizedPath = step.path.replace(/\\/g, '/');

      // Keep if a WRITE step targets the same file (refactor: read-then-overwrite)
      if (writtenPaths.has(normalizedPath)) { return true; }

      // Keep if there is any WRITE step AFTER this READ — it's providing context
      const hasSubsequentWrite = steps.slice(index + 1).some(s => s.action === 'write');
      if (hasSubsequentWrite) { return true; }

      // Drop: READ with no same-file write AND no subsequent write = trailing epilogue
      console.log(`[Planner] Dropped noise READ step (trailing, no downstream write): ${normalizedPath}`);
      return false;
    });

    const dropped = steps.length - filtered.length;
    if (dropped > 0) {
      console.log(`[Planner] Filtered ${dropped} noise READ step(s) with no downstream write`);
    }

    return filtered;
  }

  /**
   * Drop WRITE steps targeting entry/global files (App.tsx, index.tsx, main.tsx, layout.tsx)
   * when those files are not explicitly mentioned in the user's request.
   *
   * The planner routinely adds "wire up the new component in App.tsx" steps even when the
   * user only asked for a single new file. This is scope creep — the user gets an unexpected
   * modification to a file they didn't ask to change. The prompt constraint alone is unreliable;
   * this filter enforces it in code.
   *
   * Heuristic: only targets well-known entry/global filenames. Safe to false-positive on:
   * if the user explicitly names App.tsx in their request, the filter passes it through.
   */
  private filterUnrequestedEntryWrites(steps: ExecutionStep[], userRequest: string): ExecutionStep[] {
    // Files the planner modifies unprompted to "wire up" new components.
    // index.ts is intentionally excluded — it's commonly a module barrel file, not a UI entry point.
    // Only index.tsx / index.jsx count as entry points (the JSX variants are UI roots).
    const entryFilePattern = /\/(App|main|layout|Root|_app|_document)\.[tj]sx?$|\/index\.[tj]sx$/i;

    const filtered = steps.filter(step => {
      if (step.action !== 'write' || !step.path) { return true; }
      if (!entryFilePattern.test(step.path)) { return true; }

      // If the user explicitly named this file in their request, keep it
      const fileName = step.path.split('/').pop()?.replace(/\.[tj]sx?$/, '') || '';
      if (new RegExp(`\\b${fileName}\\b`, 'i').test(userRequest)) { return true; }

      console.log(`[Planner] filterUnrequestedEntryWrites: dropped unrequested WRITE to "${step.path}" (not in user request)`);
      return false;
    });

    const dropped = steps.length - filtered.length;
    if (dropped > 0) {
      console.log(`[Planner] Removed ${dropped} unrequested entry-file WRITE step(s)`);
    }

    return filtered;
  }

  /**
   * Drop RUN steps that invoke test runners when the user did not ask for tests.
   * Matches both command-based runners (command contains vitest/jest/…) and
   * description-based runners (description says "run vitest", "run tests", …).
   * The LLM sometimes emits test steps even when the prompt says not to;
   * removing them in code is more reliable than relying on prompt compliance alone.
   */
  private filterTestSteps(steps: ExecutionStep[]): ExecutionStep[] {
    const testCommandPattern = /\b(vitest|jest|pytest|mocha|npm\s+(?:run\s+)?test|yarn\s+test|pnpm\s+test)\b/i;
    const testDescPattern =
      /\b(test suite|run tests?|unit tests?|run vitest|run jest|vitest run|jest run)\b/i;
    const filtered = steps.filter(step => {
      if (step.action !== 'run') return true;
      const commandIsTest = step.command ? testCommandPattern.test(step.command) : false;
      const descIsTest = testDescPattern.test(step.description ?? '');
      if (commandIsTest || descIsTest) {
        console.log(`[Planner] filterTestSteps: removed test step: "${step.description}"`);
        return false;
      }
      return true;
    });
    const dropped = steps.length - filtered.length;
    if (dropped > 0) {
      console.log(`[Planner] Filtered ${dropped} test step(s) — not requested by user`);
    }
    return filtered;
  }

  /**
   * After any filter removes steps, strip references to those steps from dependsOn arrays.
   * Without this, remaining steps that declared a dependency on a filtered step will throw
   * DEPENDENCY_VIOLATION at execution time even though the dependency is gone.
   */
  private stripStaleDependencies(steps: ExecutionStep[]): ExecutionStep[] {
    const remainingIds = new Set(steps.map(s => s.id).filter(Boolean) as string[]);
    return steps.map(step => {
      if (!step.dependsOn || step.dependsOn.length === 0) { return step; }
      const validDeps = step.dependsOn.filter(depId => remainingIds.has(depId));
      if (validDeps.length === step.dependsOn.length) { return step; }
      console.log(`[Planner] stripStaleDependencies: removed ${step.dependsOn.length - validDeps.length} stale dep(s) from "${step.id}"`);
      return { ...step, dependsOn: validDeps };
    });
  }

  /**
   * Drop WRITE steps for files that already exist in the RAG context.
   *
   * The LLM is told "don't recreate these files" but sometimes generates a WRITE
   * step anyway (especially for utilities like cn.ts). Filtering in code is more
   * reliable than relying on prompt compliance alone.
   *
   * Only drops WRITE steps for files that:
   *   1. Appear verbatim in the RAG context path list, AND
   *   2. Are utility/lib files (src/utils/, src/lib/, etc.) OR actually exist on disk.
   *   (Avoids blocking intentional refactor writes to components.)
   */
  private filterRedundantWrites(
    steps: ExecutionStep[],
    ragContext: string,
    workspacePath?: string
  ): ExecutionStep[] {
    // Extract file paths from RAG context lines: "- src/utils/cn.ts (utility) — ..."
    const ragPaths = new Set<string>();
    for (const match of ragContext.matchAll(/^-\s+(\S+)\s+\(/gm)) {
      ragPaths.add(match[1]);
    }

    if (ragPaths.size === 0) { return steps; }

    const fs = require('fs');
    const path = require('path');

    // Utility-layer path pattern — these should never be re-written unless explicitly requested
    const utilityLayerPattern = /\bsrc[\\/](?:utils|lib|helpers|constants|stores)[\\/]/i;

    const filtered = steps.filter(step => {
      if (step.action !== 'write' || !step.path) { return true; }

      const normalizedPath = step.path.replace(/\\/g, '/');
      const inRagContext = ragPaths.has(normalizedPath);
      const isUtility = utilityLayerPattern.test(normalizedPath) ||
        /[\\/](cn|utils|helpers|classnames)\.[tj]s$/.test(normalizedPath);
      const existsOnDisk = workspacePath
        ? fs.existsSync(path.join(workspacePath, normalizedPath))
        : false;

      // Case A: File is in RAG context (LLM was told it exists) AND (utility OR exists on disk)
      if (inRagContext && (isUtility || existsOnDisk)) {
        console.log(`[Planner] Dropped redundant WRITE for existing RAG file: ${normalizedPath}`);
        return false;
      }

      // Case B: Utility file exists on disk even if not returned by RAG query.
      // RAG only returns top-5 results; a utility file not in the top-5 can still be
      // healthy and should not be blindly overwritten.
      if (!inRagContext && isUtility && existsOnDisk) {
        console.log(`[Planner] Dropped redundant WRITE for existing utility (not in RAG): ${normalizedPath}`);
        return false;
      }

      return true;
    });

    const dropped = steps.length - filtered.length;
    if (dropped > 0) {
      console.log(`[Planner] Filtered ${dropped} redundant WRITE step(s) for files already in workspace`);
    }

    return filtered;
  }

}
