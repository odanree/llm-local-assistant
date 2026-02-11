# Phase 2 Implementation Guide: Agent Loop Foundation

**Status**: ✅ Core Implementation Complete (Dec 8, 2025) | Now: Making It Like Copilot/Claude

**Objective**: Build autonomous multi-step task execution with planning and error correction.

**Build Time**: 10-15 person-days for core (complete) + 13 days for Copilot improvements (Priority 1-3)

**Stability Promise**: Phase 1 codebase remains untouched; Phase 2 is additive.

---

## 📌 Current Status

**Phase 2 Core (Agent Loop)**: ✅ Complete
- ✅ Planner module (generates multi-step plans)
- ✅ Executor module (executes plans with retry logic)
- ✅ Integration with extension (`,/plan`, `/approve`, `/reject` commands)
- ✅ 94 passing tests (>85% coverage)
- ✅ No Phase 1 regressions

**Next**: Making it feel like GitHub Copilot/Claude (Priority 1-3)
- See `PHASE2_COPILOT_IMPROVEMENTS.md` for detailed specifications
- Quick summary:
  - **Priority 1** (v1.2.0): Conversational context + streaming output + thinking phase + smart errors
  - **Priority 2** (v1.3.0): Auto-correction + codebase awareness + follow-ups + /explain
  - **Priority 3** (v1.4.0): Tree visualization + progress bars + rollback + history

**Estimated Timeline**: 3 weeks for all improvements (~13 days of work)

---

## Architecture Overview

### Phase 1 → Phase 2 Integration

```
Phase 1 (Stable)                 Phase 2 (New)
┌─────────────────────────────┐
│ Chat Interface              │
│ - /read, /write, /suggestwrite
│ - Git integration           │
└────────────────┬────────────┘
                 │
        ┌────────▼────────┐
        │ Message Router  │
        └────────┬────────┘
                 │
         ┌───────┴──────────┐
         │                  │
    ┌────▼──────┐  ┌────────▼──────┐
    │ Agent Mode │  │ Chat Mode     │
    │ (New)      │  │ (Unchanged)   │
    └────┬──────┘  └───────────────┘
         │
    ┌────▼──────────────────────┐
    │ Phase 2: Agent Loop       │
    │ ┌──────────────────────┐  │
    │ │ 1. Planner          │  │
    │ │ 2. Executor         │  │
    │ │ 3. Observer         │  │
    │ │ 4. Corrector        │  │
    │ └──────────────────────┘  │
    └────┬──────────────────────┘
         │
    ┌────▼──────────────────────────┐
    │ Phase 1: File I/O + LLM       │
    │ (Unchanged API)               │
    └───────────────────────────────┘
```

### Data Structures

```typescript
// Plan representation
interface PlanStep {
  stepId: number;           // 1, 2, 3, ...
  action: 'read' | 'write' | 'suggestwrite' | 'run' | 'observe';
  path?: string;            // For file operations
  command?: string;         // For /run operations
  prompt?: string;          // Optional prompt for write/suggestwrite
  description: string;      // Human-readable description
  dependsOn?: number[];     // Step IDs this depends on
}

interface TaskPlan {
  taskId: string;
  userRequest: string;
  generatedAt: Date;
  steps: PlanStep[];
  status: 'pending' | 'executing' | 'completed' | 'failed';
  currentStep: number;
  results: Map<number, StepResult>;
}

interface StepResult {
  stepId: number;
  success: boolean;
  output?: string;
  error?: string;
  duration: number;  // milliseconds
}
```

---

## Module 1: Planner (`src/planner.ts`)

**Purpose**: Analyze user requests and generate structured action plans.

### Interface

```typescript
export interface PlannerConfig {
  llmClient: LLMClient;
  maxSteps?: number;       // Default: 10
  timeout?: number;        // Default: 30000ms
}

export class Planner {
  constructor(config: PlannerConfig);
  
  /**
   * Generate a plan for a complex user request
   * Returns plan + markdown description for user approval
   */
  async generatePlan(userRequest: string): Promise<{
    plan: TaskPlan;
    markdown: string;  // Formatted plan for display
  }>;
  
  /**
   * Refine an existing plan based on feedback
   * Used when execution reveals issues
   */
  async refinePlan(
    originalPlan: TaskPlan,
    feedback: string
  ): Promise<TaskPlan>;
}
```

### Implementation Steps

#### Step 1: LLM Prompt Engineering

Create a system prompt that guides the LLM to generate structured plans:

```typescript
// In src/planner.ts
const PLAN_SYSTEM_PROMPT = `You are an expert code assistant that breaks down complex requests into atomic steps.

Generate a JSON plan with this exact structure:
{
  "steps": [
    {
      "stepId": 1,
      "action": "read|write|suggestwrite|run",
      "path": "file/path.ts" (for file actions),
      "command": "command" (for run actions),
      "prompt": "optional prompt",
      "description": "Human-readable step description"
    },
    ...
  ],
  "summary": "Brief overview of the plan"
}

Rules:
- Break large tasks into 3-10 small steps
- Read dependencies first, then write
- Use /read to understand existing code
- Use /write for new code, /suggestwrite for modifications
- End with /run to verify (tests, lint, build)
- Each step must be independently understandable
`;

export async function generatePlanPrompt(userRequest: string): Promise<string> {
  return `${PLAN_SYSTEM_PROMPT}

User request: "${userRequest}"

Generate a step-by-step plan in JSON format.`;
}
```

#### Step 2: Parse LLM Response

```typescript
async generatePlan(userRequest: string): Promise<{
  plan: TaskPlan;
  markdown: string;
}> {
  const prompt = generatePlanPrompt(userRequest);
  
  const response = await this.config.llmClient.sendMessage(prompt);
  if (!response.success) {
    throw new Error(`Failed to generate plan: ${response.error}`);
  }
  
  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = response.message?.match(/```json\n?([\s\S]*?)\n?```/) ||
                    response.message?.match(/(\{[\s\S]*\})/);
  
  if (!jsonMatch) {
    throw new Error('LLM did not return valid JSON plan');
  }
  
  const planData = JSON.parse(jsonMatch[1]);
  
  // Validate and construct TaskPlan
  const steps: PlanStep[] = planData.steps.map((s: any) => ({
    stepId: s.stepId,
    action: s.action,
    path: s.path,
    command: s.command,
    prompt: s.prompt,
    description: s.description,
  }));
  
  const plan: TaskPlan = {
    taskId: `task_${Date.now()}`,
    userRequest,
    generatedAt: new Date(),
    steps,
    status: 'pending',
    currentStep: 0,
    results: new Map(),
  };
  
  const markdown = formatPlanAsMarkdown(plan, planData.summary);
  
  return { plan, markdown };
}
```

#### Step 3: Format Plan for Display

```typescript
function formatPlanAsMarkdown(plan: TaskPlan, summary: string): string {
  let md = `## Plan: ${summary}\n\n`;
  md += `**Steps**: ${plan.steps.length} | **Estimated time**: ~${plan.steps.length * 10}s\n\n`;
  
  plan.steps.forEach((step) => {
    md += `### Step ${step.stepId}: ${step.description}\n`;
    md += `**Action**: \`${step.action}\``;
    if (step.path) md += ` | **Path**: \`${step.path}\``;
    if (step.command) md += ` | **Command**: \`${step.command}\``;
    md += '\n';
    if (step.prompt) md += `**Prompt**: "${step.prompt}"\n`;
    md += '\n';
  });
  
  md += `---\n\n**Approve this plan to proceed?** (Use \`/approve\` or \`/reject\`)`;
  
  return md;
}
```

#### Step 4: Add Tests

```typescript
// src/planner.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Planner } from './planner';

describe('Planner', () => {
  describe('generatePlan', () => {
    it('should generate valid plan from simple request', async () => {
      const mockLLMClient = {
        sendMessage: vi.fn().mockResolvedValue({
          success: true,
          message: `\`\`\`json
{
  "steps": [
    {
      "stepId": 1,
      "action": "write",
      "path": "hello.ts",
      "description": "Create hello world function"
    }
  ],
  "summary": "Create a simple hello world script"
}
\`\`\``
        })
      };
      
      const planner = new Planner({ llmClient: mockLLMClient as any });
      const { plan, markdown } = await planner.generatePlan(
        'Create a hello world function'
      );
      
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].action).toBe('write');
      expect(markdown).toContain('hello.ts');
    });
    
    it('should handle multi-step requests', async () => {
      // Test with 5+ step plan
    });
    
    it('should validate plan structure', async () => {
      // Test invalid JSON response handling
    });
  });
});
```

---

## Module 2: Executor (`src/executor.ts`)

**Purpose**: Execute plans step-by-step with state management and error handling.

### Interface

```typescript
export interface ExecutorConfig {
  extension: vscode.ExtensionContext;
  llmClient: LLMClient;
  gitClient?: GitClient;
  workspace: vscode.Uri;
  maxRetries?: number;      // Default: 2
  timeout?: number;         // Default: 30000ms
}

export class Executor {
  constructor(config: ExecutorConfig);
  
  /**
   * Execute a plan step-by-step
   * Returns completion status and results
   */
  async executePlan(plan: TaskPlan): Promise<{
    success: boolean;
    completedSteps: number;
    results: Map<number, StepResult>;
    error?: string;
  }>;
  
  /**
   * Execute a single step (for debugging/manual execution)
   */
  async executeStep(plan: TaskPlan, stepId: number): Promise<StepResult>;
  
  /**
   * Pause execution (can be resumed)
   */
  pauseExecution(): void;
  
  /**
   * Resume paused execution
   */
  resumeExecution(): void;
  
  /**
   * Cancel execution and optionally rollback
   */
  async cancelExecution(rollback?: boolean): Promise<void>;
}
```

### Implementation Steps

#### Step 1: Core Execution Loop

```typescript
export class Executor {
  private plan: TaskPlan | null = null;
  private paused: boolean = false;
  private cancelled: boolean = false;
  
  async executePlan(plan: TaskPlan): Promise<ExecutionResult> {
    this.plan = plan;
    this.paused = false;
    this.cancelled = false;
    plan.status = 'executing';
    
    for (const step of plan.steps) {
      // Check for pause/cancel
      while (this.paused && !this.cancelled) {
        await new Promise(r => setTimeout(r, 100));
      }
      if (this.cancelled) {
        plan.status = 'failed';
        return {
          success: false,
          completedSteps: plan.currentStep,
          results: plan.results,
          error: 'Execution cancelled by user',
        };
      }
      
      // Execute step with retry logic
      let retries = 0;
      let result: StepResult | null = null;
      
      while (retries <= (this.config.maxRetries ?? 2)) {
        result = await this.executeStep(plan, step.stepId);
        
        if (result.success) break;
        
        retries++;
        if (retries <= (this.config.maxRetries ?? 2)) {
          // Notify user of retry
          this.notifyUser(
            `Step ${step.stepId} failed. Retrying (${retries}/${this.config.maxRetries})...`,
            'info'
          );
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      
      plan.results.set(step.stepId, result!);
      
      if (!result!.success) {
        plan.status = 'failed';
        plan.currentStep = step.stepId;
        return {
          success: false,
          completedSteps: plan.currentStep,
          results: plan.results,
          error: `Step ${step.stepId} failed: ${result!.error}`,
        };
      }
      
      plan.currentStep = step.stepId;
      
      // Notify progress
      this.notifyProgress(plan);
    }
    
    plan.status = 'completed';
    return {
      success: true,
      completedSteps: plan.steps.length,
      results: plan.results,
    };
  }
  
  private async executeStep(
    plan: TaskPlan,
    stepId: number
  ): Promise<StepResult> {
    const step = plan.steps.find(s => s.stepId === stepId)!;
    const startTime = Date.now();
    
    try {
      switch (step.action) {
        case 'read':
          return await this.executeRead(step, startTime);
        case 'write':
          return await this.executeWrite(step, startTime);
        case 'suggestwrite':
          return await this.executeSuggestWrite(step, startTime);
        case 'run':
          return await this.executeRun(step, startTime);
        default:
          throw new Error(`Unknown action: ${step.action}`);
      }
    } catch (error) {
      return {
        stepId,
        success: false,
        error: (error as Error).message,
        duration: Date.now() - startTime,
      };
    }
  }
  
  private async executeRead(step: PlanStep, startTime: number): Promise<StepResult> {
    const filePath = path.join(this.config.workspace.fsPath, step.path!);
    const content = await fs.promises.readFile(filePath, 'utf-8');
    
    return {
      stepId: step.stepId,
      success: true,
      output: `Read ${step.path} (${content.length} bytes)`,
      duration: Date.now() - startTime,
    };
  }
  
  private async executeWrite(step: PlanStep, startTime: number): Promise<StepResult> {
    // Use existing /write logic from extension.ts
    const prompt = step.prompt || 
      `Generate appropriate content for ${step.path} based on its name.`;
    
    const response = await this.config.llmClient.sendMessage(prompt);
    if (!response.success) {
      throw new Error(response.error);
    }
    
    const filePath = path.join(this.config.workspace.fsPath, step.path!);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, response.message!);
    
    return {
      stepId: step.stepId,
      success: true,
      output: `Wrote ${step.path} (${response.message!.length} bytes)`,
      duration: Date.now() - startTime,
    };
  }
  
  private async executeSuggestWrite(step: PlanStep, startTime: number): Promise<StepResult> {
    // Similar to executeWrite but uses /suggestwrite flow
    // This requires user approval, which we'll handle via webview
    throw new Error('suggestwrite requires user approval - not yet implemented for agent mode');
  }
  
  private async executeRun(step: PlanStep, startTime: number): Promise<StepResult> {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    try {
      const { stdout, stderr } = await execAsync(step.command!, {
        cwd: this.config.workspace.fsPath,
        timeout: this.config.timeout,
      });
      
      return {
        stepId: step.stepId,
        success: true,
        output: stdout || '(no output)',
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        stepId: step.stepId,
        success: false,
        error: error.stderr || error.message,
        duration: Date.now() - startTime,
      };
    }
  }
  
  private notifyProgress(plan: TaskPlan): void {
    // Post message to webview
    const progress = `${plan.currentStep}/${plan.steps.length}`;
    const statusText = plan.steps[plan.currentStep - 1]?.description || 'Processing...';
    
    // This will be integrated with extension.ts webview message handler
  }
  
  private notifyUser(message: string, type: 'info' | 'error' = 'info'): void {
    // Post status message to webview
  }
  
  pauseExecution(): void {
    this.paused = true;
  }
  
  resumeExecution(): void {
    this.paused = false;
  }
  
  async cancelExecution(rollback?: boolean): Promise<void> {
    this.cancelled = true;
    // TODO: Implement rollback logic
  }
}
```

#### Step 2: Add Tests

```typescript
// src/executor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Executor } from './executor';

describe('Executor', () => {
  describe('executeStep', () => {
    it('should execute /read step', async () => {
      // Mock filesystem and test read
    });
    
    it('should execute /write step', async () => {
      // Mock LLM client and filesystem
    });
    
    it('should retry failed steps', async () => {
      // Mock transient failure then success
    });
    
    it('should handle execution pause/resume', async () => {
      // Test pause/resume logic
    });
  });
});
```

---

## Module 3: Observer & Corrector (`src/observer.ts`, `src/corrector.ts`)

**Phase 2.2+**: Error detection and auto-correction. Start simple:

```typescript
// src/observer.ts - Minimal v1
export class Observer {
  /**
   * Analyze step results for errors
   */
  analyzeResult(result: StepResult): {
    hasError: boolean;
    errorType?: string;  // 'file_not_found' | 'permission' | 'other'
    context?: string;
  } {
    if (result.success) return { hasError: false };
    
    const error = result.error || '';
    
    if (error.includes('ENOENT') || error.includes('not found')) {
      return { hasError: true, errorType: 'file_not_found' };
    }
    if (error.includes('EACCES') || error.includes('permission')) {
      return { hasError: true, errorType: 'permission' };
    }
    
    return { hasError: true, errorType: 'other', context: error };
  }
}

// src/corrector.ts - Minimal v1
export class Corrector {
  /**
   * Generate a correction prompt for failed step
   */
  generateCorrectionPrompt(
    step: PlanStep,
    error: string
  ): string {
    return `The previous step failed:\n\n` +
           `Step: ${step.description}\n` +
           `Error: ${error}\n\n` +
           `Suggest a fix or alternative approach.`;
  }
}
```

---

## Module 4: Integration with Extension (`src/extension.ts`)

### New Commands

Add `/plan` and `/approve` commands to the message handler:

```typescript
// In openLLMChat() webview message handler

switch (message.command) {
  case 'sendMessage': {
    const text: string = message.text || '';
    
    // NEW: Plan command
    const planMatch = text.match(/^\/plan\s+(.+)$/);
    if (planMatch) {
      const userRequest = planMatch[1];
      try {
        const { plan, markdown } = await planner.generatePlan(userRequest);
        
        // Store current plan in extension state
        currentPlan = plan;
        
        chatPanel?.webview.postMessage({
          command: 'addMessage',
          text: markdown,
          type: 'info',
        });
      } catch (error) {
        chatPanel?.webview.postMessage({
          command: 'addMessage',
          error: (error as Error).message,
        });
      }
      return;
    }
    
    // NEW: Approve command
    const approveMatch = text.match(/^\/approve/);
    if (approveMatch) {
      if (!currentPlan) {
        chatPanel?.webview.postMessage({
          command: 'status',
          text: 'No plan to approve. Use /plan first.',
          type: 'info',
        });
        return;
      }
      
      try {
        const result = await executor.executePlan(currentPlan);
        
        chatPanel?.webview.postMessage({
          command: 'addMessage',
          text: formatExecutionResults(result),
          success: result.success,
        });
      } catch (error) {
        chatPanel?.webview.postMessage({
          command: 'addMessage',
          error: (error as Error).message,
        });
      }
      return;
    }
    
    // ... rest of Phase 1 commands unchanged
  }
}
```

### Initialize Phase 2 Components

```typescript
function activate(context: vscode.ExtensionContext) {
  // ... Phase 1 initialization ...
  
  // NEW: Phase 2 initialization
  const planner = new Planner({
    llmClient,
    maxSteps: 10,
    timeout: 30000,
  });
  
  const executor = new Executor({
    extension: context,
    llmClient,
    gitClient,
    workspace: vscode.workspace.workspaceFolders?.[0] || 
               vscode.Uri.file('/'),
    maxRetries: 2,
  });
  
  // ... rest of activation ...
}
```

---

## Implementation Roadmap

### Week 1: Core Planner
- [ ] Create `src/planner.ts` with `generatePlan()` method
- [ ] Add system prompt and LLM prompt engineering
- [ ] Test with mock LLMClient
- [ ] Create markdown formatter
- [ ] Add to `extension.ts` as `/plan` command
- [ ] Test end-to-end with real LLM

### Week 2: Core Executor
- [ ] Create `src/executor.ts` with execution loop
- [ ] Implement `/read`, `/write`, `/run` steps
- [ ] Add retry logic
- [ ] Test individual step execution
- [ ] Integration with Planner (add `/approve` command)
- [ ] Manual testing with 3-5 step plan

### Week 3: Polish & Testing
- [ ] Add comprehensive unit tests
- [ ] Error handling improvements
- [ ] UI enhancements (progress display)
- [ ] Documentation (README update)
- [ ] Code review + merge to main

### Optional Week 4+: Observer & Corrector
- [ ] Error type classification
- [ ] Auto-correction attempts
- [ ] Conversation history integration

---

## Testing Checklist

### Unit Tests
- [ ] Planner generates valid plans from various requests
- [ ] Executor executes single steps correctly
- [ ] Executor retries failed steps
- [ ] Step results are properly recorded
- [ ] Pause/resume/cancel work correctly

### Integration Tests
- [ ] Generate plan → Approve → Execute full workflow
- [ ] Multi-step plans with dependencies
- [ ] Error handling throughout execution
- [ ] Plan refinement after failures

### Manual Testing
- [ ] `/plan create a hello world function`
- [ ] `/plan generate a React component with tests`
- [ ] `/plan refactor this file for performance` (complex request)
- [ ] Test pause/resume during execution
- [ ] Test cancellation
- [ ] Verify no Phase 1 commands are broken

---

## Success Criteria

✅ Phase 2 is complete when:

1. **Planner works**: `/plan` generates 3-10 step plans
2. **Executor works**: `/approve` executes plans step-by-step
3. **Error handling**: Failed steps retry and report errors clearly
4. **Tests pass**: >85% coverage on new modules
5. **No regression**: All Phase 1 commands still work
6. **Documentation**: README updated with `/plan` and `/approve` examples

---

## Code Quality Standards

- **TypeScript**: Strict mode, no `any` types
- **Testing**: vitest with >85% coverage
- **Linting**: ESLint passes (npm run lint)
- **Naming**: Clear, descriptive names (planner, executor, not p, x)
- **Logging**: Debug logs with `[LLM Assistant]` prefix
- **Error messages**: User-friendly, actionable

---

## Future Extensions (Phase 2.2+)

Once core Phase 2 works:

1. **Multi-file batch operations**: `/write --batch file1 file2 file3`
2. **Code-aware reading**: `/read --function UserService.login`
3. **Observer/Corrector loop**: Automatic error fixing
4. **Plan visualization**: Show executing plan in webview with checkmarks
5. **Terminal integration**: `/run npm test` with output capture
6. **Rollback support**: `git checkout` after failures

---

## References

- FUTURE_ROADMAP.md - Detailed Phase 2 specification
- ARCHITECTURE.md - Phase 1 architecture (build on this)
- .github/copilot-instructions.md - AI coding conventions
- src/extension.ts - Integration point for Phase 2 commands

Good luck! This is a significant feature that will unlock real autonomous coding. 🚀
