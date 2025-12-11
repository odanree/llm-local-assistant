# v1.2.0 Manual Testing Checklist

## Pre-Test Setup

- [ ] LLM Server running (Ollama: `ollama run mistral`)
- [ ] VS Code open with llm-local-assistant folder
- [ ] Extension compiled: `npm run compile`
- [ ] F5 pressed to launch Extension Development Host
- [ ] Chat panel opened with "Open LLM Chat" command

---

## Feature 1: Auto-Correction ✨

### Test 1.1: Auto-Create Nested Directories
**Command**: `/plan create a configuration file at config/database/prod.json`
- [ ] Plan generated successfully
- [ ] Approve plan with `/approve`
- [ ] **Expected**: File created at config/database/prod.json
- [ ] **Auto-fix evidence**: Look for message "Auto-fix: Creating parent directories..."
- [ ] **What happened**: Without auto-correction, ENOENT error would occur. Auto-fix creates the path.

---

### Test 1.2: Directory Fallback on Read
**Command**: `/read src/nonexistent/file.ts`
- [ ] Command fails gracefully
- [ ] **Auto-fix behavior**: Should attempt to read `src/nonexistent/` directory instead
- [ ] **Evidence**: Directory structure shown instead of "file not found" error
- [ ] **What this shows**: Smart fallback when file path is wrong

---

### Test 1.3: Plan with Write to New Directory
**Command**: `/plan create utils/string/formatter.ts with helper functions`
- [ ] Approve with `/approve`
- [ ] **Expected**: utils/string/ auto-created, file written successfully
- [ ] **Check**: No "ENOENT" errors in output
- [ ] **What's happening**: Multiple directory levels auto-created before write

---

## Feature 2: Codebase Awareness 🧠

### Test 2.1: Detect Project Type
**In llm-local-assistant workspace:**
**Command**: `/plan improve TypeScript strict mode configuration`
- [ ] Plan generated successfully
- [ ] Observe plan generation (look for "Analyzing codebase..." in debug)
- [ ] **Expected**: Plan assumes TypeScript project (mentions tsconfig.json, src/ structure)
- [ ] **Evidence**: Plan suggests TypeScript-specific improvements
- [ ] **What's happening**: analyzeCodebase() detected TypeScript, pass context to LLM

---

### Test 2.2: Framework-Specific Planning
**Command**: `/plan add middleware for request logging`
- [ ] Plan generated
- [ ] **Evidence in plan**: Should understand this is an Express project
- [ ] Should suggest middleware patterns appropriate for Express
- [ ] **What's happening**: Project analysis found Express in dependencies

---

### Test 2.3: Codebase Context in Prompt
**Command**: `/plan create tests for the executor module`
- [ ] Plan generated
- [ ] **Evidence**: Plan mentions existing test patterns (vitest, mocking)
- [ ] Suggests test locations aligned with project structure (__tests__, .test.ts)
- [ ] **What's happening**: Codebase analysis is feeding project conventions to planner

---

## Feature 3: Follow-up Questions Infrastructure 🔧

### Test 3.1: Infrastructure Ready
**In code**: Open `src/executor.ts`
- [ ] Find `askClarification()` method (around line 250)
- [ ] Verify it exists and is callable
- [ ] Check `ExecutorConfig` interface has `onQuestion` callback
- [ ] **What this shows**: Infrastructure is in place, ready for UI integration

---

### Test 3.2: Simulate Ambiguity Detection
**When implemented with UI**:
**Command**: `/plan modify src/utils/helper.ts and src/utils/validators.ts`
- [ ] Plan would detect ambiguity (which file to modify?)
- [ ] **Expected**: System asks: "Which file should I modify?"
- [ ] User selects option
- [ ] Execution resumes with clarification

**Current state**: Infrastructure ready, UI integration pending

---

## Feature 4: /explain Command 📖

### Test 4.1: Explain Core Extension File
**Command**: `/explain src/extension.ts`
- [ ] Response starts with: `📖 **Code Explanation: src/extension.ts**`
- [ ] **Content includes**:
  - [ ] What extension.ts does (main entry point)
  - [ ] Command registration and handling
  - [ ] Webview management
  - [ ] LLM integration points
- [ ] **Streaming**: Response appears token-by-token
- [ ] Explanation is accurate and helpful

---

### Test 4.2: Explain with Conversation Context
**Conversation flow**:
1. Ask: `I'm having trouble understanding how the planner works`
2. Then ask: `/explain src/planner.ts`

- [ ] Second explanation is more focused on planner functionality
- [ ] Response reflects the previous context about "having trouble understanding"
- [ ] **Evidence**: Explanation is context-aware, not generic
- [ ] **What's happening**: Conversation history included in prompt

---

### Test 4.3: Explain Complex Module
**Command**: `/explain src/executor.ts`
- [ ] Response covers:
  - [ ] Plan execution loop
  - [ ] Retry logic
  - [ ] Error handling and auto-correction
  - [ ] Step output streaming
  - [ ] Git client integration
- [ ] **Length**: Should be several paragraphs
- [ ] **Accuracy**: Technical details are correct
- [ ] **Usefulness**: Helps understand the module

---

### Test 4.4: Error Handling
**Command**: `/explain src/nonexistent.ts`
- [ ] Error message shown clearly
- [ ] Message: "Error explaining code: File not found: src/nonexistent.ts"
- [ ] No crash or exception
- [ ] Chat continues to work

---

### Test 4.5: Explain Small File
**Command**: `/explain .gitignore`
- [ ] Works on non-code files
- [ ] Explanation covers what's being ignored and why
- [ ] **What this shows**: Works on any file type

---

## Feature 5: Integration Tests 🚀

### Test 5.1: Explain → Plan → Execute Workflow
**Full workflow**:
1. `/explain src/planner.ts` (understand how it works)
2. `/plan create tests for the generateThinking method` (use knowledge in planning)
3. `/approve` (execute with auto-corrections)

- [ ] Step 1: Clear explanation generated
- [ ] Step 2: Plan shows understanding of planner internals
- [ ] Step 3: Execution succeeds, auto-corrections handle any issues
- [ ] **What's happening**: All features working together

---

### Test 5.2: Auto-Correct During Intelligent Planning
**Command**: `/plan refactor all shell commands to use async/await`
- [ ] Plan generates multiple complex steps
- [ ] Approve with `/approve`
- [ ] **Expected**: Any file operations auto-correct missing paths
- [ ] Run commands execute, auto-correcting with alternatives if needed
- [ ] **What this shows**: Intelligent planning + auto-correction reliability

---

### Test 5.3: Codebase Awareness Influences Plan Quality
**Compare two scenarios**:

**Scenario A** (without codebase awareness):
- Generic plan suggestions
- Generic paths (src/, lib/, etc.)
- Generic solutions

**Scenario B** (with codebase awareness):
- Project-specific suggestions
- Correct paths based on actual structure
- Solutions tailored to project conventions

- [ ] Observe difference in quality
- [ ] v1.2.0 plans should be smarter (Scenario B)

---

## Verification Checklist

### Code Quality
- [ ] No new linting errors: `npm run lint`
- [ ] Compilation succeeds: `npm run compile`
- [ ] All tests pass: `npm test` (should show 130+ tests)

### Feature Completeness
- [ ] Auto-correction works silently (user sees results, not attempts)
- [ ] Codebase analysis doesn't slow down planning noticeably
- [ ] /explain command available and functional
- [ ] Follow-up question infrastructure in place

### Backward Compatibility
- [ ] `/read` command still works
- [ ] `/write` command still works
- [ ] `/plan` → `/approve` workflow still works
- [ ] `/git-commit-msg` still works
- [ ] `/git-review` still works

---

## Known Behaviors

### What You'll See:
- Auto-corrections happen transparently (success without showing attempts)
- Codebase analysis is silent (no UI for it yet)
- /explain command shows markdown-formatted response with 📖 icon
- Follow-up questions await UI integration (infrastructure ready)

### What You Won't See Yet:
- "Auto-fix attempt" messages (only final success shown)
- Progress dialogs for follow-up questions (infrastructure ready)
- Codebase analysis results in UI (analysis happens silently)

---

## Troubleshooting

### /explain command not working
- [ ] Check file path is correct
- [ ] Check file is readable (not in .gitignore or node_modules)
- [ ] Check LLM server is running
- [ ] Check in Debug Console for errors

### Plan generation seems generic
- [ ] Check workspace has package.json (for codebase analysis)
- [ ] Check LLM model is good (Mistral 7B recommended)
- [ ] Try `/read package.json` first to prime context

### Auto-correction not visible
- [ ] This is expected - it works silently
- [ ] Only failures that can't be auto-corrected show errors
- [ ] Check Debug Console (Shift+Ctrl+Y) for "[LLM Assistant]" logs

---

## Success Criteria

✅ All features are:
- Implemented correctly
- Tested and working
- Integrated smoothly
- Backward compatible
- Ready for v1.2.0 release

---

## Next Steps

After successful testing:
1. Create release branch: `git checkout -b release/v1.2.0`
2. Update version: Change 1.1.2 → 1.2.0 in package.json
3. Update CHANGELOG.md with features
4. Create release commit and tag
5. Package VSIX: `npm run package`
6. Publish to VS Code Marketplace
