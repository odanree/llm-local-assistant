# Phase 2: Making It Like GitHub Copilot/Claude

**Status**: Planning Phase (Dec 8, 2025)  
**Objective**: Transform Phase 2 Agent Loop into an interactive, intelligent assistant that feels like GitHub Copilot or Claude  
**Target Version**: v1.2.0 → v1.4.0

---

## Current State vs. Copilot/Claude

### What We Have ✅
- **Planner**: Generates multi-step task plans (read → write flow)
- **Executor**: Executes plans step-by-step with retry logic (2 retries)
- **Integration**: Webview chat with `/plan`, `/approve`, `/reject` commands
- **File Operations**: `/read`, `/write`, `/suggestwrite`
- **Error Handling**: Basic retry mechanism
- **Tests**: 94 passing tests (>85% coverage)

### What's Missing vs. Copilot/Claude ⚠️
1. **Conversational Context** - Planner doesn't understand multi-turn chat
2. **Streaming Execution** - Status updates only between steps, not live output
3. **Thinking Phase** - No visible reasoning before showing plan
4. **Error Analysis** - Generic retry, no intelligent failure analysis
5. **Code Awareness** - No understanding of project structure/conventions
6. **Adaptive Learning** - Can't adjust based on failures
7. **Real-time Feedback** - No progress indicators or interactive updates
8. **History** - No way to review or re-run past plans

---

## Priority 1: Interactive Feel (v1.2.0) ⚡

### 1.1 Add Conversation Context to Planner

**What it does**: Planner uses chat history to understand multi-turn requests

**Current behavior**:
```
User: /plan create a component
LLM: [generates plan in isolation]

User: /plan add error handling
LLM: [generates new plan, doesn't remember previous request]
```

**New behavior**:
```
User: /plan create a component
LLM: [generates plan, stores in history]

User: /plan add error handling
LLM: [understands this is about the component from previous request]
```

**Implementation**:
- Modify `planner.ts` to accept optional `history` parameter
- Update system prompt to reference conversation context
- Pass `llmClient.conversationHistory` to planner from extension
- Test with multi-turn plan requests

**Files**: `src/planner.ts`, `src/extension.ts`  
**Effort**: 1 day | **Impact**: Medium

---

### 1.2 Stream Plan Execution with Real-Time Output

**What it does**: Show live step output in chat as it executes (not batched at the end)

**Current behavior**:
```
/approve → "Executing..." → [long wait] → "Step 1 complete"
```

**New behavior**:
```
/approve → "Executing step 1: Read src/index.ts..."
           → "✓ Completed (2.5KB read)"
           → "Executing step 2: Write src/utils.ts..."
           → [live code appears in chat]
           → "✓ Generated 150 lines"
```

**Implementation**:
- Executor: Emit step events instead of just completion
- Extension: Relay executor output to webview messages
- Webview: Display streaming output with progress indicators
- Add real-time token buffering for code blocks

**Files**: `src/executor.ts`, `src/extension.ts`, `src/webviewContent.ts`  
**Effort**: 1.5 days | **Impact**: High (most Copilot-like)

---

### 1.3 Add "Thinking" Phase Before Planning

**What it does**: Show LLM reasoning before showing the plan structure

**Current behavior**:
```
/plan build a todo app
→ [JSON plan appears immediately]
```

**New behavior**:
```
/plan build a todo app
→ "🤔 Analyzing your request..."
→ "I'll break this into 4 main steps:
   1) Create database schema
   2) Build API endpoints
   3) Create React components
   4) Add tests"
→ "Creating detailed plan..."
→ [structured plan appears]
```

**Implementation**:
- Add `generateThinking()` method to Planner
- Show natural language reasoning before JSON plan
- Ask LLM to explain step breakdown before generating steps

**Files**: `src/planner.ts`, `src/extension.ts`  
**Effort**: 0.5 days | **Impact**: Medium (feels intelligent)

---

### 1.4 Improve Error Messages with Suggested Fixes

**What it does**: When steps fail, suggest how to fix it (not just error text)

**Current behavior**:
```
Step 1 failed: ENOENT - file not found
```

**New behavior**:
```
❌ Step 1 failed: Cannot read src/index.ts (file doesn't exist)

💡 Suggestions:
   • Check the file path spelling
   • Use /write to create the file first
   • Or try /read src/ to see available files
```

**Implementation**:
- Wrap step execution in error analysis
- Call LLM to interpret error and suggest fixes
- Parse error type (file not found, permission denied, etc.)
- Display suggestions in chat

**Files**: `src/executor.ts`, `src/extension.ts`  
**Effort**: 1 day | **Impact**: High (immediately helpful)

---

## Priority 2: Add Intelligence (v1.3.0) 🧠

### 2.1 Analyze Failed Steps and Suggest Corrections

**What it does**: Auto-fix failed steps by analyzing the error

**Current behavior**:
```
Step 1 fails → Retry 2x → Give up → Tell user
```

**New behavior**:
```
Step 1 fails → Analyze error → "Maybe the file doesn't exist yet?"
            → Suggest reordering → Insert new step to create file
            → Retry modified plan → Success
```

**Implementation**:
- Create new `src/corrector.ts` module (Observer pattern)
- Analyze `StepResult.error` to classify failure type
- Use LLM to suggest corrections
- Optionally reorder or modify plan
- Retry with new plan
- Fall back to user if can't auto-fix

**Files**: `src/corrector.ts`, `src/executor.ts`  
**Effort**: 1.5 days | **Impact**: High (self-healing plans)

---

### 2.2 Learn from Codebase

**What it does**: Scan project structure, dependencies, conventions

**Current behavior**:
```
Generates generic code that doesn't match project
```

**New behavior**:
```
On first plan:
1. Read package.json → understands it's React project
2. Read tsconfig.json → sees strict mode, ES2020
3. Read .eslintrc → learns coding standards
4. Scan src/ structure → understands architecture

When generating code:
→ Uses React patterns from project
→ Follows TypeScript conventions
→ Matches naming style
→ Respects folder structure
```

**Implementation**:
- Create `src/codebaseAnalyzer.ts` module
- Read and analyze package.json, tsconfig, .eslintrc, etc.
- Cache analysis in extension state
- Pass project context to planner system prompt
- Learn framework, language features, conventions

**Files**: `src/codebaseAnalyzer.ts`, `src/planner.ts`  
**Effort**: 1.5 days | **Impact**: High (generated code matches project)

---

### 2.3 Suggest Follow-up Tasks After Completion

**What it does**: Offer next logical steps after plan completes

**Current behavior**:
```
Plan executes → ✓ Done → [waiting for next /plan]
```

**New behavior**:
```
Plan executes → ✓ Done → "You created index.tsx. What next?

Suggestions:
• Add unit tests for this component
• Create README documentation
• Add error boundary handling
• Generate Storybook stories

Type: /plan <suggestion> to continue"
```

**Implementation**:
- Track completed task type (created, modified, tested, etc.)
- Use LLM to generate contextual follow-up suggestions
- Display as interactive prompts
- Detect patterns (created component → suggest tests)

**Files**: `src/executor.ts`, `src/extension.ts`  
**Effort**: 1 day | **Impact**: Medium (feels conversational)

---

### 2.4 Add `/explain` Command for Step-by-Step Walkthrough

**What it does**: User can ask "explain the plan" and get detailed reasoning

**Current behavior**:
```
/plan build a todo app
→ Shows 5 numbered steps with descriptions
→ No further detail available
```

**New behavior**:
```
/plan build a todo app
→ Shows 5 steps

/explain 2
→ "Step 2: Create database schema
   
   Why: We need to store todo items with properties like:
   - id (unique identifier)
   - title (what the user entered)
   - completed (boolean flag)
   - createdAt (timestamp)
   
   Files affected: migrations/001_create_todos.sql
   
   Expected output: Database tables ready for API integration"

/explain
→ Full walkthrough of all steps with detailed explanations
```

**Implementation**:
- Add command handler for `/explain [step_number]`
- Generate detailed step explanations using LLM
- Show implementation details and dependencies
- Display markdown with code examples

**Files**: `src/extension.ts`, `src/planner.ts`  
**Effort**: 1 day | **Impact**: Medium (educational)

---

## Priority 3: Polish & UX (v1.4.0) ✨

### 3.1 Plan Visualization with Expandable Steps

**What it does**: Show plan as interactive tree, expand steps for details

**Current behavior**:
```
Step 1: Read components/Button.tsx
Step 2: Write components/Button.test.tsx
Step 3: Run npm test
```

**New behavior**:
```
📋 Plan: Create Component Tests (3 steps)

▸ Step 1: Read components/Button.tsx
  └─ File: components/Button.tsx (2.3KB)
  
▼ Step 2: Write components/Button.test.tsx [EXPANDED]
  └─ Action: Generate test file
  └─ Prompt: "Create comprehensive unit tests..."
  └─ Expected: 50+ lines of test code
  
▸ Step 3: Run npm test
  └─ Command: npm test -- Button.test.tsx
```

**Implementation**:
- Update webview HTML/CSS for tree structure
- Add expand/collapse buttons for each step
- Show more details when expanded
- Style with hierarchical indentation

**Files**: `src/webviewContent.ts`  
**Effort**: 0.5 days | **Impact**: Low (nice-to-have)

---

### 3.2 Real-Time Progress Indicators

**What it does**: Visual progress bar + step highlights during execution

**Current behavior**:
```
Executing plan...
[waiting...]
Step complete
```

**New behavior**:
```
Executing plan [████░░░░░░] 40% (2/5 steps)

Current: Step 2 - Write utils.ts (estimated 5s remaining)
✓ Step 1 - Read existing file
⟳ Step 2 - Generate new version
○ Step 3 - Run tests
```

**Implementation**:
- Add CSS progress bar (linear or circular)
- Highlight current step with different color
- Show checkmarks for completed steps
- Update in real-time as executor progresses
- Add time estimates

**Files**: `src/webviewContent.ts`, `src/executor.ts`  
**Effort**: 1 day | **Impact**: Medium (visual polish)

---

### 3.3 Rollback Support (Undo Last Steps)

**What it does**: User can undo changes from last N steps

**Current behavior**:
```
Plan executes, modifies files → Can't undo
```

**New behavior**:
```
Plan executed successfully

/undo     → Undo last step (reverts file changes)
/undo 2   → Undo last 2 steps
/undo all → Undo entire plan

Before undoing, shows:
"Rolling back these changes:
 • Modified src/index.ts
 • Created src/utils.ts
 • Deleted src/temp.ts

Type /confirm-undo to proceed"
```

**Implementation**:
- Track file changes per step (path, before/after content)
- Implement rollback handler
- Add command `/undo [count]`
- Show confirmation before executing
- Restore previous file versions

**Files**: `src/executor.ts`, `src/rollback.ts`, `src/extension.ts`  
**Effort**: 0.5 days | **Impact**: Medium (safety feature)

---

### 3.4 History of Executed Plans

**What it does**: Show past plans and results, allow re-running

**Current behavior**:
```
No history of executed plans available
```

**New behavior**:
```
📜 Plan History

Today:
  ✓ Dec 8 10:30 - Create Button component (3 steps)
  ✓ Dec 8 09:15 - Fix TypeScript errors (2 steps)

Yesterday:
  ✓ Dec 7 14:45 - Write API tests (5 steps)
  ✗ Dec 7 13:20 - Deploy to production (3 steps, failed at step 2)

[Click to expand or re-run]
```

**Implementation**:
- Store plan metadata in extension state (timestamp, request, result)
- Display in separate panel or sidebar view
- Add timestamps and success/failure indicators
- Allow clicking to re-run with `/re-run <plan-id>`
- Show which steps succeeded/failed

**Files**: `src/extension.ts`, `src/webviewContent.ts`  
**Effort**: 1 day | **Impact**: Low (nice-to-have)

---

## Implementation Order & Timeline

```
Week 1 (Dec 9-13): Priority 1
├─ 1.1 Conversation context (1 day)
├─ 1.2 Stream execution (1.5 days)  
├─ 1.3 Thinking phase (0.5 days)
└─ 1.4 Smart errors (1 day)
→ Release: v1.2.0

Week 2 (Dec 16-20): Priority 2
├─ 2.1 Auto-correction (1.5 days)
├─ 2.2 Codebase learning (1.5 days)
├─ 2.3 Follow-ups (1 day)
└─ 2.4 /explain (1 day)
→ Release: v1.3.0

Week 3 (Dec 23-27): Priority 3
├─ 3.1 Tree visualization (0.5 days)
├─ 3.2 Progress indicators (1 day)
├─ 3.3 Rollback (0.5 days)
└─ 3.4 History (1 day)
→ Release: v1.4.0
```

---

## Commit Strategy

Each feature is ONE atomic commit following conventional commits:

```bash
# Priority 1.1
git commit -m "feat(planner): add conversation context support"

# Priority 1.2  
git commit -m "feat(executor): stream step output to webview in real-time"

# Priority 1.3
git commit -m "feat(planner): add thinking phase before plan generation"

# etc...
```

**Always**:
- Run tests before commit: `npm test -- --run`
- Update CHANGELOG.md for each priority
- Tag releases: `git tag -a v1.2.0 -m "Release v1.2.0: Interactive feel"`

---

## Success Metrics

### Priority 1 Complete When:
- [ ] `/plan <task>` shows thinking + structured plan
- [ ] `/approve` displays streaming output as steps execute
- [ ] Failed steps show helpful suggestions
- [ ] Tests still pass (>85% coverage)
- [ ] No Phase 1 regressions

### Priority 2 Complete When:
- [ ] Failed steps auto-correct when possible
- [ ] Generated code matches project conventions
- [ ] `/explain` command works
- [ ] Follow-up suggestions appear naturally
- [ ] Tests pass with new observer/corrector modules

### Priority 3 Complete When:
- [ ] Plan visualization is interactive
- [ ] Progress bar updates in real-time
- [ ] `/undo` reverts changes safely
- [ ] Plan history is browsable
- [ ] All tests pass

---

## Testing Strategy

For each priority, add tests:

```typescript
describe('Planner', () => {
  it('should use conversation history in plan generation', async () => {
    // Test 1.1
  });
  
  it('should generate thinking before plan', async () => {
    // Test 1.3
  });
});

describe('Executor', () => {
  it('should stream step output to callbacks', async () => {
    // Test 1.2
  });
  
  it('should auto-correct failed steps', async () => {
    // Test 2.1
  });
});

describe('Corrector', () => {
  it('should classify error types', async () => {
    // Test 2.1
  });
});

describe('WebView Integration', () => {
  it('should display streaming output in chat', async () => {
    // Test 1.2 integration
  });
});
```

---

## Git Workflow Reminder

**Before starting each priority**:
```bash
git checkout feat/phase-2-agent-loop
git pull origin main
npm install  # if deps changed
```

**After completing each priority**:
```bash
npm test -- --run      # All tests must pass
git add .
git commit -m "feat(scope): message"
git push origin feat/phase-2-agent-loop
```

**When releasing**:
```bash
# Update version in package.json
git add package.json
git commit -m "chore: bump version to 1.2.0"

# Update CHANGELOG.md
git add CHANGELOG.md  
git commit -m "docs(changelog): update for v1.2.0"

# Create tag
git tag -a v1.2.0 -m "Release v1.2.0: Interactive feel"

# Merge to main
git checkout main
git merge feat/phase-2-agent-loop
git push origin main
git push origin v1.2.0
```

---

## Quick Reference

| Priority | Feature | Files | Days | Impact |
|----------|---------|-------|------|--------|
| 1.1 | Context | planner.ts | 1 | Medium |
| 1.2 | Streaming | executor.ts, webview | 1.5 | **High** |
| 1.3 | Thinking | planner.ts | 0.5 | Medium |
| 1.4 | Errors | executor.ts | 1 | **High** |
| 2.1 | Auto-fix | corrector.ts | 1.5 | **High** |
| 2.2 | Codebase | analyzer.ts | 1.5 | **High** |
| 2.3 | Followups | executor.ts | 1 | Medium |
| 2.4 | Explain | planner.ts | 1 | Medium |
| 3.1 | Tree UI | webview | 0.5 | Low |
| 3.2 | Progress | webview | 1 | Medium |
| 3.3 | Rollback | executor.ts | 0.5 | Medium |
| 3.4 | History | extension.ts | 1 | Low |

**Total**: ~13 days for all improvements = v1.2.0 → v1.4.0 (~2.5 weeks)

