# Context Prompt for Phase 2 Development

**Use this document as a prompt when starting Phase 2 (Agent Loop Foundation) development.**

---

## Project Foundation (Phase 1)

You're extending **LLM Local Assistant**, a mature VS Code extension with:

### Current Capabilities
- Local LLM chat integration (Ollama, LM Studio, vLLM)
- Streaming response support
- Three agent commands: `/read`, `/write`, `/suggestwrite`
- Full VS Code integration
- Production-quality error handling

### Current Architecture
```
Extension.ts (385 lines)
  ↓ orchestrates ↓
LLMClient.ts (246 lines)
  ↓ handles ↓
WebviewContent.ts (226 lines)
```

### Key Patterns to Preserve
- All file operations use `vscode.workspace.fs` (async, URI-based)
- All LLM calls use OpenAI-compatible `/v1/chat/completions` endpoint
- Streaming uses SSE parsing with TextDecoder
- WebView communicates via `postMessage`/`onDidReceiveMessage`
- Errors are caught and sent to UI with `addMessage` command

**See ARCHITECTURE.md for full details**

---

## Phase 2 Goal: Agent Loop (Think-Act-Observe-Correct)

### What This Means

Today: User types `/write file.ts generate a function` → LLM generates content → file is written

Tomorrow: User types "Create a REST API with tests and validation" → Agent:
1. **THINK**: Plans steps (read existing types → generate endpoint → generate tests → run tests)
2. **ACT**: Executes each step sequentially
3. **OBSERVE**: Checks results (did test pass? did linter pass?)
4. **CORRECT**: If step failed, LLM generates fix and retries

### Why This Matters
- Multi-step tasks without manual intervention between steps
- Error auto-correction (agent fixes its own mistakes)
- Context awareness (sees previous steps' results)

---

## Phase 2 Detailed Specs

### 2.1 Planning Module

**Goal**: Convert user task → structured execution plan

**Input**:
```
User: "Create a login form component with TypeScript and tests"
```

**Output**:
```json
{
  "taskId": "task-001",
  "description": "Create a login form component with TypeScript and tests",
  "steps": [
    {
      "step": 1,
      "description": "Read existing form components to understand patterns",
      "action": {
        "type": "read",
        "params": { "path": "src/components/forms" }
      }
    },
    {
      "step": 2,
      "description": "Generate LoginForm component",
      "action": {
        "type": "write",
        "params": {
          "path": "src/components/LoginForm.tsx",
          "prompt": "Create a login form with email/password validation using React hooks"
        }
      }
    },
    {
      "step": 3,
      "description": "Generate tests for LoginForm",
      "action": {
        "type": "write",
        "params": {
          "path": "src/components/__tests__/LoginForm.test.tsx",
          "prompt": "Create comprehensive tests for LoginForm component"
        }
      }
    },
    {
      "step": 4,
      "description": "Run tests",
      "action": {
        "type": "run",
        "params": { "command": "npm test -- LoginForm" }
      }
    }
  ]
}
```

**Implementation**:
```typescript
class Planner {
  async generatePlan(task: string, context: FileContext[]): Promise<AgentPlan> {
    const prompt = `
      Analyze this task and generate a structured execution plan.
      
      Task: ${task}
      
      Available context:
      ${JSON.stringify(context)}
      
      Generate a JSON plan with steps array. Each step has:
      - step: number
      - description: string
      - action: { type, params }
      
      Action types: read, write, delete, run, build, test
    `;
    
    const plan = await this.llm.sendMessage(prompt);
    return JSON.parse(plan);
  }
}
```

**Integration**:
- Planner is invoked when user message starts with a complex task (not a slash command)
- Plan is displayed in UI with checkboxes
- User can approve, edit, or decline plan
- Plan execution begins on approval

### 2.2 Execution Engine

**Goal**: Execute plan steps sequentially, capture results

```typescript
class Executor {
  async executePlan(plan: AgentPlan): Promise<ExecutionResult> {
    const results: ActionResult[] = [];
    
    for (const step of plan.steps) {
      try {
        const result = await this.executeStep(step);
        results.push(result);
        
        if (!result.success) {
          // Move to OBSERVE phase
          const shouldCorrect = await this.observer.analyzeFailure(result);
          if (shouldCorrect) {
            // Move to CORRECT phase
            const fix = await this.corrector.generateFix(result, plan, results);
            const fixedResult = await this.executeStep(fix.action);
            results.push(fixedResult);
          }
        }
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          step: step
        });
      }
    }
    
    return { success: results.every(r => r.success), results };
  }
  
  private async executeStep(step: Step): Promise<ActionResult> {
    // Dispatch based on action type
    switch (step.action.type) {
      case 'read':
        return await this.executeRead(step.action.params);
      case 'write':
        return await this.executeWrite(step.action.params);
      case 'run':
        return await this.executeRun(step.action.params);
      // ... etc
    }
  }
}
```

**Integration**:
- Executor runs in extension.ts after plan approval
- Each step result is sent to webview for progress display
- Step context is accumulated and passed to LLM for next steps

### 2.3 Observation System

**Goal**: Analyze step results and determine if action succeeded

```typescript
class Observer {
  async analyzeResult(result: ActionResult): Promise<AnalysisResult> {
    return {
      success: result.success,
      errorType: this.classifyError(result),
      confidence: this.getConfidence(result),
      suggestions: this.generateSuggestions(result)
    };
  }
  
  private classifyError(result: ActionResult): ErrorType {
    if (result.stderr?.includes('SyntaxError')) return ErrorType.SYNTAX_ERROR;
    if (result.stderr?.includes('TypeError')) return ErrorType.TYPE_ERROR;
    if (result.stdout?.includes('FAIL')) return ErrorType.TEST_FAILURE;
    // ... comprehensive error classification
    return ErrorType.UNKNOWN;
  }
}
```

**Error Classification**:
```typescript
enum ErrorType {
  SYNTAX_ERROR = "syntax",
  TYPE_ERROR = "type",
  RUNTIME_ERROR = "runtime",
  TEST_FAILURE = "test",
  FILE_NOT_FOUND = "file_not_found",
  PERMISSION_DENIED = "permission",
  LOGIC_ERROR = "logic",
  UNKNOWN = "unknown"
}
```

### 2.4 Correction Mechanism

**Goal**: Automatically generate and execute fixes

```typescript
class Corrector {
  async generateFix(
    failureResult: ActionResult,
    plan: AgentPlan,
    previousResults: ActionResult[]
  ): Promise<CorrectionAction> {
    const context = {
      failureAnalysis: this.analyzeFailure(failureResult),
      previousSteps: previousResults.map(r => ({
        description: r.step.description,
        output: r.output
      })),
      errorType: failureResult.errorType
    };
    
    const prompt = `
      The following step failed:
      ${JSON.stringify(failureResult)}
      
      Error Type: ${context.errorType}
      
      Previous successful steps:
      ${JSON.stringify(context.previousSteps)}
      
      Generate a corrected action that fixes this error.
      Return as JSON with { type, params }.
    `;
    
    const fixJson = await this.llm.sendMessage(prompt);
    return JSON.parse(fixJson);
  }
}
```

**Example Fix Generation**:
```
Failure: TypeScript compilation error - "Property 'email' does not exist on type 'User'"

Context:
- Previous step successfully read User type (doesn't have email)
- New step trying to use user.email

Fix Generated:
"The User type needs an email property. Regenerate LoginForm to use username instead,
or update User type to include email. Let's update the User type."

Action:
{
  "type": "write",
  "params": {
    "path": "src/types/User.ts",
    "prompt": "Add an email property to the User interface"
  }
}
```

---

## Phase 2 UI Updates

### Plan Display
```
Show in webview:
┌──────────────────────────────────────────┐
│ 📋 Plan: Create login form with tests    │
├──────────────────────────────────────────┤
│ ☐ Step 1: Read existing form patterns    │
│ ☐ Step 2: Generate LoginForm component   │
│ ☐ Step 3: Generate tests                 │
│ ☐ Step 4: Run tests                      │
└──────────────────────────────────────────┘

Once approved:

┌──────────────────────────────────────────┐
│ ▶ Executing Plan...                      │
├──────────────────────────────────────────┤
│ ✓ Step 1: Read existing patterns (2s)   │
│ ⊙ Step 2: Generating LoginForm... (5s)   │
│ ◯ Step 3: Generate tests                │
│ ◯ Step 4: Run tests                      │
│                                          │
│ Progress: 1/4 steps complete             │
└──────────────────────────────────────────┘
```

### New Message Types
- `{ command: 'planGenerated', plan: AgentPlan }`
- `{ command: 'planApproved' }`
- `{ command: 'stepStarted', step: Step }`
- `{ command: 'stepComplete', step: Step, result: ActionResult }`
- `{ command: 'planComplete', results: ExecutionResult }`

---

## Data Structures

```typescript
interface AgentPlan {
  taskId: string;
  description: string;
  steps: Step[];
  createdAt: Date;
  status: 'pending' | 'executing' | 'complete' | 'failed';
}

interface Step {
  id: string;
  step: number;
  description: string;
  action: Action;
  status: 'pending' | 'executing' | 'complete' | 'failed';
  attempts: number;
  maxRetries: number;
  result?: ActionResult;
  error?: Error;
}

interface Action {
  type: 'read' | 'write' | 'delete' | 'run' | 'build' | 'test';
  params: Record<string, any>;
}

interface ActionResult {
  success: boolean;
  step: Step;
  output?: string;
  stdout?: string;
  stderr?: string;
  duration: number;
  errorType?: ErrorType;
}

interface ExecutionResult {
  success: boolean;
  results: ActionResult[];
  totalDuration: number;
  successCount: number;
  failureCount: number;
}

enum ErrorType {
  SYNTAX_ERROR = "syntax",
  TYPE_ERROR = "type",
  RUNTIME_ERROR = "runtime",
  TEST_FAILURE = "test",
  FILE_NOT_FOUND = "file_not_found",
  PERMISSION_DENIED = "permission",
  LOGIC_ERROR = "logic",
  UNKNOWN = "unknown"
}
```

---

## Integration with Phase 1

### Reuse These Components
- **LLMClient**: Already handles streaming and non-streaming. Phase 2 adds plan-specific prompts.
- **File Operations**: Executor wraps existing `/read` and `/write` logic
- **Error Handling**: Enhance with error classification
- **Webview**: Add plan display UI, use same message protocol

### Keep These Patterns
- All file I/O uses `vscode.workspace.fs`
- All LLM calls go through LLMClient
- All errors are caught and sent to UI
- Configuration is read via `vscode.workspace.getConfiguration()`

### Extend These Files
- **extension.ts**: Add Planner/Executor/Observer/Corrector classes
- **llmClient.ts**: Add plan-specific prompt generation
- **webviewContent.ts**: Add plan UI components and status display

---

## Testing Phase 2

### Test Case 1: Simple Multi-Step Task
```
User: "Create a TypeScript file with a function that adds two numbers and a test for it"

Expected:
1. Plan generated with 2 steps (write function, write test)
2. Both steps execute
3. Both succeed
4. Execution time < 30s
```

### Test Case 2: Error Correction
```
User: "Create a function that uses a non-existent import"

Expected:
1. Plan generated
2. First step fails (missing import)
3. Error is classified as TYPE_ERROR
4. Correction mechanism generates fix (add import or change function)
5. Fixed version executes successfully
```

### Test Case 3: Complex Workflow
```
User: "Create a React component with validation, tests, and type definitions"

Expected:
1. Plan has 3-4 steps (read types, write component, write tests, run tests)
2. All steps execute in order
3. Errors are corrected automatically
4. User sees progress in real-time
```

---

## Deployment Notes

### Dependencies to Add (if any)
- None in Phase 2 (uses existing dependencies)

### Breaking Changes
- None - Phase 1 commands still work
- New plans are additive feature

### Migration Path
- Phase 1 users won't be affected
- New behavior: Complex tasks trigger planning
- Old behavior: Slash commands still work

---

## Success Criteria for Phase 2

- ✓ 60%+ of multi-step tasks complete without user intervention
- ✓ Error correction handles 70%+ of common error types
- ✓ Plan display is intuitive and shows progress
- ✓ No regressions to Phase 1 commands
- ✓ Performance: Plans complete in < 5 min for typical tasks
- ✓ Documentation updated for new workflow

---

## Resources

- **Phase 1 Code**: `src/extension.ts`, `src/llmClient.ts`, `src/webviewContent.ts`
- **Architecture**: `ARCHITECTURE.md`
- **Copilot Instructions**: `.github/copilot-instructions.md`
- **Future Roadmap**: `FUTURE_ROADMAP.md` (Phases 3-7)
- **Agent Loop Pseudocode**: See FUTURE_ROADMAP.md "Technical Deep Dive"

---

## Questions for Planning Phase 2

1. **Should Planner be LLM-based or rule-based?**
   - Recommended: LLM-based (more flexible, handles diverse tasks)

2. **How many automatic retries before asking user?**
   - Recommended: 3 retries, then escalate

3. **Should user be able to edit plan before execution?**
   - Recommended: Yes, show plan in UI with edit buttons

4. **How to handle long-running tasks (> 5 minutes)?**
   - Recommended: Run in background with notifications

5. **Should we persist plan history?**
   - Recommended: Store in local workspace for next Phase

---

**Document Version**: 1.0  
**Created**: November 2025  
**For**: Phase 2 Development  
**Audience**: Developer extending Phase 1 project

Use this as your context prompt when starting Phase 2. All Phase 1 foundations are stable and ready for extension.
