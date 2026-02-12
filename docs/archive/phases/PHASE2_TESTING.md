# Phase 2 Testing Guide

Complete testing checklist for Phase 2 integration of Planner and Executor modules.

## Prerequisites

Before testing, ensure:
- ✅ Node.js 16+ installed
- ✅ npm or yarn available
- ✅ VS Code 1.106.1+ installed
- ✅ Local LLM server running (Ollama, LM Studio, or vLLM)
- ✅ `feat/phase-2-agent-loop` branch checked out

## Setup

### 1. Install Dependencies
```bash
cd /Users/odanree/Documents/Projects/llm-local-assistant
npm install
```

### 2. Compile TypeScript
```bash
npm run compile
```

Expected output:
```
✓ No compilation errors (console warnings are pre-existing tsconfig issues)
```

### 3. Start Local LLM Server

**Option A: Ollama (Recommended)**
```bash
ollama run mistral
# Server should be at http://localhost:11434
```

**Option B: LM Studio**
- Launch LM Studio
- Start local server on http://localhost:8000
- Configure in VS Code settings: `llm-assistant.endpoint: "http://localhost:8000"`

## Unit Testing

### Run All Tests
```bash
npm test
```

Expected output:
```
✓ planner.test.ts (17 tests)
  ✓ generatePlan: simple request
  ✓ generatePlan: multi-step request
  ✓ generatePlan: handles JSON variants
  ✓ formatPlanAsMarkdown: renders steps
  ✓ refinePlan: improves based on feedback
  ... (17 total)

✓ executor.test.ts (15 tests)
  ✓ executeStep: read action
  ✓ executeStep: write action
  ✓ executeStep: run action
  ✓ executePlan: completes all steps
  ✓ executePlan: retries on failure
  ✓ pause/resume: state control
  ✓ cancel: stops execution
  ... (15 total)

✓ All tests passing
✓ Coverage: >85%
```

### Run Specific Test Suite
```bash
npm test -- src/planner.test.ts   # Planner tests only
npm test -- src/executor.test.ts  # Executor tests only
```

## Integration Testing (Manual)

### 1. Launch Extension in Debug Mode
```bash
# In VS Code terminal, or use F5 shortcut
npm run watch    # Watch mode for auto-compile
# Then F5 to launch debug instance
```

This opens a new VS Code window with the extension loaded.

### 2. Test /plan Command

**Test Case 1: Simple plan**
```
Input:  /plan create a hello world TypeScript file
Expected: 
  - Plan with 2-3 steps
  - Step descriptions visible
  - "Use /approve to execute or /reject to discard"
  - No errors in console
```

**Test Case 2: Complex plan**
```
Input:  /plan create a React component with unit tests and documentation
Expected:
  - Plan with 4-6 steps
  - Steps include: create component file, write tests, generate docs
  - All steps clearly described
```

**Test Case 3: Malformed input**
```
Input:  /plan
Expected:
  - Error message: "Planning error: ..."
  - Chat shows error but doesn't crash
```

### 3. Test /approve Command

**Test Case 1: Approve after /plan**
```
Steps:
  1. /plan create a simple config file
  2. Review the plan
  3. /approve
Expected:
  - Execution starts
  - Progress updates show step completion
  - Final message: "✅ Plan completed successfully"
  - Files appear in workspace
```

**Test Case 2: Approve without plan**
```
Input:  /approve (without prior /plan)
Expected:
  - Error: "No plan to approve. Use /plan <task> first."
  - Chat continues normally
```

**Test Case 3: Execution with failures**
```
Steps:
  1. /plan create a file in an invalid path
  2. /approve
Expected:
  - Step fails with error message
  - Automatic retry (up to 2 times)
  - Detailed error shown: "Cannot create file: ..."
  - Plan stops gracefully
```

### 4. Test /reject Command

**Test Case 1: Reject after /plan**
```
Steps:
  1. /plan create a file
  2. /reject
Expected:
  - Message: "🗑️ Plan discarded."
  - Plan is cleared from session
  - Next /approve shows: "No plan to approve"
```

**Test Case 2: Reject without plan**
```
Input:  /reject (without prior /plan)
Expected:
  - Error: "No plan to reject."
  - Chat continues normally
```

### 5. Test Phase 1 Commands (Regression Testing)

Verify all v1.0.0 commands still work:

**Test /read**
```
/read src/extension.ts
Expected: File contents displayed in chat
```

**Test /write**
```
/write test-file.txt generate a test file
Expected: File created with LLM-generated content
```

**Test /git-commit-msg**
```
git add src/extension.ts
/git-commit-msg
Expected: Commit message generated from staged changes
```

**Test /git-review**
```
/git-review
Expected: Code review of staged changes
```

### 6. Stress Testing

**Test Case 1: Long-running plan**
```
/plan create a full TypeScript project with 10 components, tests, and documentation
Expected:
  - Plan with many steps executes without timeout
  - All steps complete successfully
  - Reasonable total execution time (< 2 minutes for LLM)
```

**Test Case 2: Rapid command execution**
```
Steps:
  1. /plan task 1
  2. /approve
  3. /plan task 2
  4. /approve
Expected:
  - Plans clear properly between executions
  - No memory leaks or state pollution
```

**Test Case 3: Cancel execution**
```
Steps:
  1. /plan long task
  2. /approve
  3. (Wait a second, then close chat panel)
Expected:
  - Execution stops gracefully
  - No orphaned processes
  - Can reopen chat without issues
```

## Debug Logging

If issues occur, check debug output:

### View Extension Output
1. Open VS Code Debug Console (Ctrl+Shift+J or View → Debug Console)
2. Look for `[LLM Assistant]` logs
3. Look for `[Executor]` logs
4. Look for `[Planner]` logs

### Key log patterns:
```
[LLM Assistant] Received message from webview: { command: 'sendMessage', text: '/plan...' }
[Executor] Step 1/3: Reading file...
[Executor] Step 2/3: Writing file...
[Executor] Plan complete: SUCCESS
```

### Common Issues & Solutions

**Issue: "Planning error: JSON parsing failed"**
- Solution: LLM response format unexpected. Check LLM model output in debug console.
- Retry: Usually resolves on next attempt

**Issue: "Cannot find module 'planner'"**
- Solution: Run `npm run compile` to build TypeScript
- Check: `src/planner.ts` exists and imports are correct

**Issue: "No workspace folder open"**
- Solution: Open a folder in VS Code (File → Open Folder)
- Required for file operations to work

**Issue: Timeout during execution**
- Solution: Increase timeout in settings or check LLM server is responding
- Check: `llm-assistant.timeout` setting (default: 30000ms)

## Coverage Report

View detailed test coverage:

```bash
npm test -- --coverage
```

Expected output:
- `src/planner.ts`: >85% coverage
- `src/executor.ts`: >85% coverage
- Total coverage: >85%

## Manual Checklist

### Before Merging to Main

- [ ] Unit tests pass (npm test)
- [ ] Code compiles without errors (npm run compile)
- [ ] /plan generates valid plans
- [ ] /approve executes plans successfully
- [ ] /reject discards plans properly
- [ ] All Phase 1 commands still work
- [ ] No new errors in debug console
- [ ] Memory usage stable (no leaks)
- [ ] Workspace folder not required for basic chat
- [ ] Error messages are user-friendly

### Before Release

- [ ] All manual tests pass on macOS
- [ ] All manual tests pass on Linux (if possible)
- [ ] All manual tests pass on Windows (if possible)
- [ ] Docs updated with examples
- [ ] CHANGELOG updated with features
- [ ] Version bumped to 1.1.0
- [ ] Commit message follows semantic versioning
- [ ] Ready to merge to main
- [ ] Ready to publish to VS Code Marketplace

## Performance Baselines

Expected performance metrics:

| Operation | Baseline | Max |
|-----------|----------|-----|
| /plan generation | 2-5s | 10s |
| /approve execution | 5-30s | 60s |
| /read file (< 1MB) | 100-500ms | 2s |
| /write file | 2-10s | 30s |
| Chat response | 1-3s | 10s |

*Times depend on LLM model and hardware*

## Troubleshooting

### Extension Won't Load

```bash
# Clear build cache
rm -rf out/
npm run compile
# Then F5 to reload
```

### Tests Won't Run

```bash
# Check vitest is installed
npm list vitest

# Run with verbose output
npm test -- --reporter=verbose
```

### LLM Server Connection Issues

```bash
# Test connection from VS Code
Command Palette (Ctrl+Shift+P) → LLM Local Assistant: Test Connection

# Should show: "✅ Successfully connected to LLM server!"
```

## Next Steps

After testing:
1. ✅ If all tests pass → Merge to main
2. ✅ If all tests pass → Tag as v1.1.0
3. ✅ If all tests pass → Publish to VS Code Marketplace
4. 🔜 Plan Phase 2.2 (refinement, feedback loop)

---

**Questions?** See [docs/PHASE2_INTEGRATION.md](PHASE2_INTEGRATION.md) for integration details.
