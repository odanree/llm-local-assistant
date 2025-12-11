# v1.2.0 Developer Reference Guide

## Quick Feature Overview

### 1. Auto-Correction (executor.ts)
**What**: Automatically fixes common execution errors
**Where**: `src/executor.ts` - `attemptAutoFix()` method
**When**: Runs on first failure, before manual retries
**How it helps**: Reduces failures from directory/command issues

```typescript
// Pattern 1: Missing directories
write to src/utils/helpers.ts → auto-creates src/utils/ → succeeds

// Pattern 2: Parent directory fallback
read nonexistent/file.txt → reads nonexistent/ instead → shows structure

// Pattern 3: Command alternatives
npm test (npm not found) → tries npx npm → succeeds

// Pattern 4: Directory vs file
read src/utils/ (actually a directory) → reads directory structure
```

---

### 2. Codebase Awareness (planner.ts)
**What**: Analyzes project structure before planning
**Where**: `src/planner.ts` - `analyzeCodebase()` method
**When**: Runs during `generatePlan()` before LLM call
**How it helps**: LLM understands project conventions

```typescript
// Detects:
const analysis = {
  projectType: 'Node.js/JavaScript' | 'TypeScript' | 'Python',
  frameworks: ['React', 'Vue', 'Express', 'Next.js'],
  structure: ['src/', 'lib/', 'test/', '__tests__/'],
  language: 'TypeScript' | 'JavaScript',
  name: 'project-name'
}

// Passed to LLM:
"Codebase context:\n**Project Type**: TypeScript\n**Framework**: Express\n..."
```

---

### 3. Follow-up Questions (executor.ts)
**What**: Infrastructure for asking user clarification during execution
**Where**: `src/executor.ts` - `askClarification()` method
**When**: Ready to trigger on ambiguity
**How it helps**: Prevents wrong decisions, improves reliability

```typescript
// Pattern 1: Multiple similar files
Files in directory: [helpers.ts, validators.ts, utils.ts]
Question: "Which file should I modify?"
Options: ['helpers.ts', 'validators.ts', 'utils.ts', 'Skip this step']

// Pattern 2: Long-running commands
Command: npm test
Question: "This might take a while. Should I proceed?"
Options: ['Yes, proceed', 'No, skip', 'Cancel execution']
```

**Future UI Integration**:
- Connect `onQuestion` callback to webview dialog
- Display options as buttons
- Resume execution with selected option

---

### 4. /explain Command (extension.ts)
**What**: Generate detailed code explanations
**Where**: `src/extension.ts` - `/explain <path>` handler
**When**: User types `/explain src/executor.ts`
**How it helps**: Understand code without reading it

```typescript
// Command parsing:
const explainMatch = text.match(/\/explain\s+(\S+)/);
// Matches: /explain src/executor.ts
// Captures: src/executor.ts

// Processing:
1. Read file content
2. Include conversation history for context
3. Send explanation prompt to LLM
4. Stream response to chat
5. Display with markdown formatting

// Output format:
📖 **Code Explanation: src/executor.ts**

The executor module is responsible for:
1. Executing multi-step plans sequentially
...
```

---

## Code Architecture

### Integration Points

```
Extension (extension.ts)
├── User Input
│   ├── /explain <path> → File read → LLM → Explanation
│   ├── /plan → Codebase analysis → LLM → Plan generation
│   └── /approve → Executor.executePlan()
│
├── Planner (planner.ts)
│   ├── analyzeCodebase() → Project analysis
│   ├── generatePlanPrompt() → Include codebase context
│   └── generatePlan() → LLM call with context
│
└── Executor (executor.ts)
    ├── executePlan()
    │   └── executeStep() with retry loop
    │       ├── attemptAutoFix() → Auto-correction
    │       └── askClarification() → Follow-up questions
    └── executeRead/executeWrite/executeRun()
```

---

## File Changes Reference

### executor.ts Changes
**Lines 15-26**: `ExecutorConfig` interface
- Added `onQuestion` callback for follow-up questions

**Lines 147-245**: `attemptAutoFix()` method (NEW)
- 4 patterns: directory creation, parent fallback, directory read, command alternatives
- Returns fixed StepResult or null

**Lines 247-309**: `askClarification()` method (NEW)
- Detects write ambiguity and command risks
- Ready for webview integration

**Lines 84-108**: `executePlan()` enhancement
- Auto-fix attempt before manual retries
- Message feedback on auto-fix attempts

---

### planner.ts Changes
**Lines 2-3**: Import additions
- Added `import * as vscode from 'vscode';`

**Lines 35-37**: `PlannerConfig` interface
- Added `workspace?: vscode.Uri;` for codebase analysis

**Lines 143-162**: `generatePlanPrompt()` enhancement
- Accepts `codebaseContext` parameter
- Includes context in LLM prompt

**Lines 165-240**: `analyzeCodebase()` method (NEW)
- Detects project type, frameworks, structure
- Gracefully handles failures
- Async implementation with file system checks

**Lines 130-132**: `generatePlan()` enhancement
- Calls `analyzeCodebase()` before planning
- Passes context to prompt generation

---

### extension.ts Changes
**Lines 705-712**: Planner instantiation
- Pass workspace URI: `workspace: wsFolder`

**Lines 74-87**: Help text update
- Added `/explain <path>` command documentation

**Lines 605-680**: `/explain` command handler (NEW)
- Command parsing: `/\/explain\s+(\S+)/`
- File reading and LLM analysis
- Streaming and non-streaming modes
- Error handling with user feedback

---

## Testing Commands

### Run All Tests
```bash
npm test  # 130 tests total
```

### Test Specific Feature
```bash
npm test v1.2.0.features.test.ts
```

### Check Linting
```bash
npm run lint
```

### Build Extension
```bash
npm run compile  # Webpack build
npm run package  # Create VSIX
```

---

## Debug Tips

### Enable Debug Logging
In VS Code Debug Console (Shift+Ctrl+Y):
- Look for `[LLM Assistant]` prefix messages
- Shows planner, executor, extension actions

### Test Auto-Correction
```
/plan create deep/nested/structure/file.ts
/approve
→ Watch for "Auto-fix: Creating parent directories..." message
```

### Test Codebase Awareness
```
1. In llm-local-assistant folder:
   /plan improve TypeScript compilation performance
2. Observe plan mentions TypeScript, src/, tsconfig.json
```

### Test /explain
```
/explain src/executor.ts
→ Full explanation generated with markdown formatting
```

---

## Known Limitations

### Current Release
- ❌ Follow-up questions need UI integration (infrastructure ready)
- ❌ Codebase analysis doesn't appear in UI (silent analysis)
- ✅ Auto-correction works silently (by design)
- ✅ /explain command fully functional

### Next Release (v1.3.0)
- [ ] Plan modification before execution
- [ ] Rollback capability
- [ ] Tree visualization
- [ ] Progress bars with time estimates

---

## Common Issues & Solutions

### Issue: /explain not working
**Check**:
1. File exists and is readable
2. LLM server running
3. Debug console for errors (Shift+Ctrl+Y)

**Solution**:
- Verify endpoint in settings
- Check file permissions
- Restart extension (Ctrl+Shift+P → Reload Window)

### Issue: Auto-correction not visible
**Why**: It's working silently (by design)
**How to verify**: Success without errors = auto-correction worked
**Evidence**: File created despite missing parent directory

### Issue: Plan seems generic
**Why**: Codebase analysis may not have detected project type
**Check**: Does workspace have package.json?
**Solution**: Try `/read package.json` first to ensure it's readable

---

## Performance Notes

- **Codebase Analysis**: <100ms (async, doesn't block UI)
- **Auto-Correction Attempts**: Typically <1 retry needed
- **/explain Generation**: 2-5 seconds (depends on LLM)
- **Plan Generation**: 3-10 seconds with context (LLM dependent)

---

## Release Checklist

- [ ] All 130 tests passing
- [ ] Linting clean
- [ ] Manual testing complete
- [ ] CHANGELOG updated
- [ ] Version bumped (1.1.2 → 1.2.0)
- [ ] Git tag created (v1.2.0)
- [ ] VSIX packaged
- [ ] Published to marketplace

---

## Support & Questions

**Feature questions**: See `copilot-instructions.md`
**Architecture questions**: See `ARCHITECTURE.md`
**Implementation details**: See inline code comments
**Testing**: See `TESTING_CHECKLIST_V1.2.0.md`
