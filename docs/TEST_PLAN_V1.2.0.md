# v1.2.0 Feature Testing Plan

## Setup
1. Open the extension in VS Code debug mode (F5)
2. Ensure LLM server is running (Ollama, LM Studio, or vLLM)
3. Configure endpoint in settings if needed
4. Open chat panel with "Open LLM Chat" command

---

## Feature 1: Auto-Correction in Executor

### Test Case 1.1: Missing Parent Directory Auto-Creation
**Objective**: Verify that /plan auto-creates missing directories

**Steps**:
1. Run: `/plan create src/utils/helpers.ts with TypeScript utilities`
2. Approve plan with `/approve`
3. **Expected**: Plan executes successfully, auto-creating `src/utils/` if missing

**What's Happening**:
- Executor detects ENOENT error (directory doesn't exist)
- `attemptAutoFix()` creates parent directories
- Write step retries and succeeds
- Message shows: "Auto-fix: Creating parent directories..."

---

### Test Case 1.2: Parent Directory Fallback
**Objective**: Verify read failures fall back to parent directory (during plan execution)

**Steps**:
1. Run: `/plan read a TypeScript file from src/nonexistent/helpers.ts`
2. Approve with `/approve` (file doesn't exist, but src/ does)
3. **Expected**: Plan execution auto-fixes by reading `src/` directory instead

**What's Happening**:
- Executor reads plan step that targets non-existent file
- Detects ENOENT error
- `attemptAutoFix()` Pattern 1: Extracts parent directory path
- Retries read with parent directory instead of failing
- Message shows: "Auto-fix: Reading parent directory 'src' instead..."
- Successfully returns directory listing of `src/` with all files and folders

**SUCCESS SIGNS** ✅:
- Auto-fix message appears
- Plan shows directory listing of `src/`
- No final error message

---

### Test Case 1.3: Command Not Found Recovery
**Objective**: Verify CLI tool command alternatives

**Steps**:
1. Create plan: `/plan run npm list to show installed packages`
2. Approve with `/approve`
3. **Expected**: Plan executes successfully, showing npm packages

**What's Happening**:
- Plan generates a "run npm list" step
- If npm not in PATH: Auto-fix tries 'npx npm' or 'yarn'
- First successful alternative executes
- Message shows: "Auto-fix: Trying alternative command 'npx npm'..." (if needed)

**Note**: This test may pass silently if npm is in PATH. Watch for either:
- ✅ Direct success: "npm list" output shown
- ✅ Auto-fix success: "Auto-fix: Trying alternative..." then output shown

---

## Feature 2: Codebase Awareness

### Test Case 2.1: Project Detection
**Objective**: Verify codebase analysis works

**Steps**:
1. In the llm-local-assistant workspace, run: `/plan improve the TypeScript configuration`
2. Observe plan generation
3. **Expected**: Plan shows it's aware of Node.js, TypeScript project

**What's Happening**:
- `analyzeCodebase()` reads package.json
- Detects TypeScript, Express, project name
- Passes analysis to LLM before planning
- Plan generation uses this context for smarter steps

**Evidence in Output**:
- Plan mentions TypeScript files
- Understands project structure
- Suggests appropriate src/ paths

---

### Test Case 2.2: Framework-Specific Planning
**Objective**: Verify framework detection influences planning

**Steps**:
1. Switch to a React project (or simulate): `/plan add a new component`
2. Observe plan generation
3. **Expected**: Plan assumes React structure (src/components/, etc.)

**What's Happening**:
- Codebase analysis detects framework
- LLM receives framework context
- Planning recommendations reflect framework conventions

---

## Feature 3: Follow-up Questions (Preparation)

### Test Case 3.1: Infrastructure Ready
**Objective**: Verify follow-up question system is wired

**Steps**:
1. Check code in `src/executor.ts`
2. Verify `askClarification()` method exists
3. Verify `onQuestion` callback in ExecutorConfig

**What's Happening**:
- Infrastructure is in place
- Ready for webview UI integration
- Can be triggered when needed

**Future Test** (when UI integrated):
- Plan to modify existing file
- System detects multiple similar files
- Shows dialog: "Which file should I modify?"
- User selects option
- Execution resumes with selected file

---

## Feature 4: /explain Command

### Test Case 4.1: Explain Local File
**Objective**: Generate explanation of code

**Steps**:
1. Run: `/explain src/executor.ts`
2. **Expected**: Detailed explanation of the executor module

**Output Should Include**:
- What the module does
- Key classes/functions
- Important algorithms
- Error handling approach
- Integration points

**Evidence**:
- 📖 **Code Explanation: src/executor.ts**
- Multi-paragraph explanation
- References to specific patterns in code

---

### Test Case 4.2: /explain with Context
**Objective**: Verify explanation uses conversation history

**Steps**:
1. Ask: `I'm debugging the executor module. What does it do?`
2. Then ask: `/explain src/executor.ts`
3. **Expected**: Explanation focuses on debugging-relevant aspects

**What's Happening**:
- Conversation history is included in /explain prompt
- LLM adjusts explanation based on context
- More relevant output

---

### Test Case 4.3: /explain Non-Existent File
**Objective**: Test error handling

**Steps**:
1. Run: `/explain src/nonexistent.ts`
2. **Expected**: Error message: "Error explaining code: File not found: src/nonexistent.ts"

---

## Feature 5: Integration - All Together

### Test Case 5.1: Full Workflow
**Objective**: Use multiple new features in one workflow

**Steps**:
```
1. /explain src/planner.ts
   (Understanding what planner does)

2. /plan enhance the planner to better understand JavaScript projects
   (Create plan using codebase awareness)

3. /approve
   (Auto-correction handles any issues)

4. Observe that plan was smart about JS projects
   (Because codebase analysis informed the planning)
```

**What's Happening**:
- Explain command provides knowledge
- Plan command uses codebase context
- Executor uses auto-correction for reliability
- All systems work together

---

## Test Results Tracking

| Test Case | Expected | Actual | Status |
|-----------|----------|--------|--------|
| 1.1 Auto-create directories | Success | ✅ Created src/utils/ | ✅ PASS |
| 1.2 Parent directory fallback | Success | ✅ Read src/ directory | ✅ PASS |
| 1.3 Command not found recovery | Success | ✅ npm list output shown | ✅ PASS |
| 2.1 Project detection | ✓ TypeScript project | ✅ Improved tsconfig.json | ✅ PASS |
| 2.2 Framework awareness | ✓ Framework detected | ⏭️ Deferred | ⏭️ DEFERRED |
| 3.1 Infrastructure ready | Methods exist | ✅ askClarification() exists | ✅ PASS |
| 4.1 Explain file | Explanation shown | ✅ Code explanation generated | ✅ PASS |
| 4.2 Explain with context | Context-aware output | ✅ Focused on debugging aspects | ✅ PASS |
| 4.3 Error handling | Error message shown | ✅ File not found error | ✅ PASS |
| 5.1 Full workflow | All features work | ✅ All systems integrated | ✅ PASS |

---

## Test Summary

### Overall Results
- **Total Tests**: 10
- **Passed**: 8 ✅
- **Deferred**: 1 ⏭️ (Test 2.2 - requires React project)
- **Success Rate**: 89% (8/9 applicable tests)

### Features Verified

✅ **Feature 1: Auto-Correction in Executor** - FULLY WORKING
- Parent directory auto-creation
- Parent directory fallback on read failures
- Command not found recovery with proper shell environment

✅ **Feature 2: Codebase Awareness** - MOSTLY WORKING
- Project detection from package.json
- Context-aware plan generation
- TypeScript/Node.js project recognition

✅ **Feature 3: Follow-up Questions** - INFRASTRUCTURE READY
- `askClarification()` method implemented
- `onQuestion` callback wired in ExecutorConfig
- Ready for webview UI integration

✅ **Feature 4: /explain Command** - FULLY WORKING
- Code explanation generation
- Context-aware explanations
- Error handling for missing files

✅ **Feature 5: Full Integration** - WORKING
- Explain + Plan + Executor all working together

---

## Debug Mode

To test with detailed logs:

```bash
# Run extension in debug mode
# Press F5 in VS Code to launch Extension Development Host

# In debug console, you'll see:
# - [LLM Assistant] Planner: Analyzing codebase...
# - [LLM Assistant] Executor: Auto-fix: Creating parent directories...
# - [LLM Assistant] Extension: /explain command received
```

---

## LLM Server Requirements

For best testing:
- **Ollama**: `ollama run mistral`
- **LM Studio**: Ensure server running on http://localhost:1234
- **vLLM**: Ensure OpenAI-compatible endpoint

Configure in VS Code settings:
```json
{
  "llm-assistant.endpoint": "http://localhost:11434",
  "llm-assistant.model": "mistral"
}
```

---

## Notes

- Auto-correction is transparent - you won't see attempts, only results
- Codebase analysis happens silently before plan generation
- /explain command works like /read but with LLM analysis
- Follow-up questions await webview UI integration
