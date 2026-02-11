# Phase 2 Integration Guide: Adding Planner & Executor to Extension

**Status**: Ready for integration  
**Effort**: 2-3 hours  
**Files to modify**: `src/extension.ts`, `package.json` (version bump)

---

## Overview

Phase 2 adds two new commands to the extension:
- `/plan <request>` - Generate action plan
- `/approve` - Execute approved plan

This document provides step-by-step integration instructions.

---

## Step 1: Add Imports to extension.ts

**Location**: After existing imports (around line 5)

```typescript
// Add these imports
import { Planner } from './planner';
import { Executor, ExecutionResult } from './executor';
```

---

## Step 2: Initialize Phase 2 Modules in activate()

**Location**: In the `activate()` function, after llmClient is created (around line 535)

```typescript
export function activate(context: vscode.ExtensionContext) {
  // ... existing Phase 1 initialization ...

  const llmConfig = getLLMConfig();
  llmClient = new LLMClient(llmConfig);

  // NEW: Phase 2 initialization
  let currentPlan: TaskPlan | null = null;
  
  const planner = new Planner({
    llmClient,
    maxSteps: 10,
    timeout: 30000,
  });

  const workspace = vscode.workspace.workspaceFolders?.[0] ||
                   vscode.Uri.file(process.cwd());
  
  const executor = new Executor({
    extension: context,
    llmClient,
    gitClient: new GitClient(workspace),
    workspace,
    maxRetries: 2,
    timeout: 30000,
    onProgress: (step, total, description) => {
      chatPanel?.webview.postMessage({
        command: 'status',
        text: `Step ${step}/${total}: ${description}`,
        type: 'info',
      });
    },
    onMessage: (message, type) => {
      chatPanel?.webview.postMessage({
        command: type === 'error' ? 'addMessage' : 'status',
        text: message,
        type: type === 'error' ? undefined : 'info',
        error: type === 'error' ? message : undefined,
      });
    },
  });

  // ... rest of existing code ...
}
```

---

## Step 3: Add Help Text for Phase 2 Commands

**Location**: In the `openLLMChat()` function, update the help message (around line 54)

```typescript
  // Show agent mode command help when panel opens
  setTimeout(() => {
    chatPanel?.webview.postMessage({
      command: 'addMessage',
      text: `**Agent Mode Commands:**\n\n` +
        `📄 **File Operations:**\n` +
        `- /read <path> — Read a file from workspace\n` +
        `- /write <path> <prompt> — Generate and write file content\n` +
        `- /suggestwrite <path> <prompt> — Preview before writing\n\n` +
        `📝 **Git Integration:**\n` +
        `- /git-commit-msg — Generate commit message from staged changes\n` +
        `- /git-review [staged|unstaged|all] — Review code changes with AI\n\n` +
        `🤖 **Phase 2: Autonomous Planning (Beta):**\n` +
        `- /plan <request> — Generate multi-step action plan\n` +
        `- /approve — Execute the generated plan\n` +
        `- /reject — Discard plan and start over`,
      type: 'info',
      success: true,
    });
  }, 500);
```

---

## Step 4: Add /plan Command Handler

**Location**: In the webview message handler, add this before the existing command handlers (around line 74, after `switch (message.command)`)

```typescript
        // Phase 2: /plan command
        const planMatch = text.match(/^\/plan\s+(.+)$/);
        if (planMatch) {
          const userRequest = planMatch[1];
          try {
            chatPanel?.webview.postMessage({
              command: 'status',
              text: `Planning: ${userRequest}...`,
              type: 'info',
            });

            const { plan, markdown } = await planner.generatePlan(userRequest);
            currentPlan = plan;

            chatPanel?.webview.postMessage({
              command: 'addMessage',
              text: markdown,
              success: true,
            });
          } catch (error) {
            chatPanel?.webview.postMessage({
              command: 'addMessage',
              error: error instanceof Error ? error.message : String(error),
              success: false,
            });
          }
          return;
        }

        // Phase 2: /approve command
        const approveMatch = text.match(/^\/approve/);
        if (approveMatch) {
          if (!currentPlan) {
            chatPanel?.webview.postMessage({
              command: 'status',
              text: 'No plan to approve. Use /plan <request> first.',
              type: 'info',
            });
            return;
          }

          try {
            chatPanel?.webview.postMessage({
              command: 'status',
              text: `Executing plan: ${currentPlan.userRequest}...`,
              type: 'info',
            });

            const result = await executor.executePlan(currentPlan);

            const resultMarkdown = `## ✅ Execution Complete\n\n` +
              `**Status**: ${result.success ? '✅ Success' : '❌ Failed'}\n` +
              `**Steps Completed**: ${result.completedSteps}/${currentPlan.steps.length}\n` +
              `**Duration**: ${(result.totalDuration / 1000).toFixed(2)}s\n\n` +
              (result.error ? `**Error**: ${result.error}\n\n` : '') +
              `**Step Results**:\n${
                Array.from(result.results.entries())
                  .map(([stepId, res]) => 
                    `- Step ${stepId}: ${res.success ? '✅' : '❌'} (${res.duration}ms)\n` +
                    (res.output ? `  Output: ${res.output}\n` : '') +
                    (res.error ? `  Error: ${res.error}\n` : '')
                  )
                  .join('')
              }`;

            chatPanel?.webview.postMessage({
              command: 'addMessage',
              text: resultMarkdown,
              success: result.success,
            });

            // Clear plan after execution
            currentPlan = null;
          } catch (error) {
            chatPanel?.webview.postMessage({
              command: 'addMessage',
              error: error instanceof Error ? error.message : String(error),
              success: false,
            });
          }
          return;
        }

        // Phase 2: /reject command
        const rejectMatch = text.match(/^\/reject/);
        if (rejectMatch) {
          if (!currentPlan) {
            chatPanel?.webview.postMessage({
              command: 'status',
              text: 'No plan to reject.',
              type: 'info',
            });
            return;
          }

          currentPlan = null;
          chatPanel?.webview.postMessage({
            command: 'status',
            text: 'Plan rejected. Start over with /plan <request>',
            type: 'info',
          });
          return;
        }
```

---

## Step 5: Update package.json Version

**Location**: `package.json`, line 4

```json
  "version": "1.1.0-phase2",
```

OR if going straight to release:

```json
  "version": "1.1.0",
```

---

## Step 6: Update CHANGELOG.md

**Location**: Top of CHANGELOG.md, add new unreleased section

```markdown
## [Unreleased]

### Added - Phase 2: Agent Loop Foundation
- `/plan <request>` - Generate multi-step action plans from natural language requests
- `/approve` - Execute approved plans step-by-step
- Planner module: Analyzes requests, generates structured plans (3-10 atomic steps)
- Executor module: Executes plans with retry logic, error recovery, progress tracking
- Auto-retry on step failure (default: 2 retries per step)
- Pause/resume/cancel execution support
- Real-time progress callbacks for UI updates
- Comprehensive error handling and reporting

### Architecture
- Plans break tasks into: read (files), write (LLM generate), run (shell commands)
- Each step has unique ID, description, and result tracking
- Execution results include duration and detailed error messages
- Support for conditional step dependencies (Phase 2.2+)

### Known Limitations (Phase 2.1)
- suggestwrite action deferred (requires user approval UI - Phase 2.2)
- Rollback on failure not yet implemented (Phase 2.2)
- No plan persistence across sessions (Phase 2.2)
- Single-step /plan generation only (no iteration yet)
```

---

## Step 7: Update README.md

**Location**: In README.md, add Phase 2 section

Find the "Agent Mode Commands" section and update:

```markdown
### Agent Mode Commands

#### File Operations
- `/read <path>` - Read files from your workspace
- `/write <path> [prompt]` - Generate content and write to files via LLM
- `/suggestwrite <path> [prompt]` - LLM suggests changes, you approve before writing

#### Git Integration
- `/git-commit-msg` - Generate commit message from staged changes
- `/git-review [staged|unstaged|all]` - Review code changes with AI

#### Phase 2: Autonomous Planning (Beta)
- `/plan <request>` - Break down complex tasks into multi-step action plans
  - Example: `/plan create a React component with unit tests and TypeScript`
  - Generates 3-10 atomic steps (read files, generate code, run tests)
- `/approve` - Execute the generated plan step-by-step
  - Auto-retries failed steps (up to 2 attempts per step)
  - Shows real-time progress and detailed results
- `/reject` - Discard plan and start over

**Example Workflow**:
```
User: /plan Create a user authentication service with tests
↓
LLM generates plan:
  1. Read: src/types/User.ts (existing types)
  2. Write: src/services/auth.ts (create service with LLM prompt)
  3. Write: src/services/__tests__/auth.test.ts (generate tests)
  4. Run: npm test (verify tests pass)
↓
User: /approve
↓
Agent executes all 4 steps automatically
```
```

---

## Integration Testing Checklist

Before committing, test each scenario:

### Basic Planning
- [ ] `/plan create a hello world function` generates valid plan
- [ ] Plan shows 1+ steps with descriptions
- [ ] Plan includes /approve and /reject instructions

### Multi-Step Planning  
- [ ] `/plan create React component with tests` generates 4+ steps
- [ ] Steps include read, write, run actions
- [ ] Each step has clear description

### Plan Approval
- [ ] `/approve` after `/plan` shows execution progress
- [ ] Progress updates show step number and description
- [ ] Completion message shows success/failure status

### Error Handling
- [ ] `/approve` without `/plan` shows helpful error
- [ ] `/reject` without `/plan` shows helpful error
- [ ] LLM failure during planning shows error message
- [ ] Step execution failure shows error with retry count

### Phase 1 Regression
- [ ] `/read src/extension.ts` still works
- [ ] `/write test.ts hello world` still works
- [ ] `/git-commit-msg` still works
- [ ] Regular chat messages still work

---

## Deployment Notes

**Breaking Changes**: None - Phase 2 is purely additive

**Database Migrations**: None

**Configuration**: No new settings required

**Backward Compatibility**: ✅ Full - Phase 1 commands unchanged

---

## Next Steps After Integration

1. **Manual Testing** (1 day)
   - Test planning with various requests
   - Test execution with real LLM
   - Verify error recovery

2. **Performance Testing** (0.5 days)
   - Measure plan generation time
   - Measure execution time for 10-step plans
   - Memory usage with concurrent plans

3. **Documentation** (0.5 days)
   - Update ARCHITECTURE.md with Planner/Executor diagrams
   - Add examples to QUICK_REFERENCE.md
   - Update .github/copilot-instructions.md

4. **Minor Fixes** (1 day)
   - Fix any linting issues
   - UI polish for progress display
   - Error message improvements

5. **Release** (0.5 days)
   - Bump version to 1.1.0
   - Create release notes
   - Publish to marketplace

**Total Estimated Time**: 3-5 days

---

## Troubleshooting

### LLM doesn't generate valid JSON plan
- Check Planner system prompt - ensure it's clear about JSON format
- Try simplifying the user request
- Increase timeout if LLM is slow

### Steps fail during execution
- Check workspace permissions
- Verify LLM server is running
- Check file paths are correct
- Review error message for hints

### Progress updates not showing
- Verify onProgress callback is connected
- Check webview postMessage is called
- Look for errors in VS Code debug console

---

## References

- `.github/copilot-instructions.md` - AI agent coding guidelines
- `PHASE2_GUIDE.md` - Full Phase 2 specification
- `src/planner.ts` - Planner implementation
- `src/executor.ts` - Executor implementation
- `ARCHITECTURE.md` - System design

Good luck with integration! 🚀
