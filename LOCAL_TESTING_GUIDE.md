# How to Test the LLM-Based Pattern Detection Locally

## Prerequisites
- Node.js 18+
- Ollama running locally with a model (e.g., `qwen2.5-coder`)
- VS Code with the extension development environment

## 1. Setup Extension Development

```bash
cd /Users/odanree/Documents/Projects/llm-local-assistant

# Install dependencies
npm install

# Start watch mode for auto-compilation
npm run watch
```

This will recompile the extension as you make changes.

## 2. Run Tests (All Tests)

```bash
npm test
```

Should see:
```
✓ Test Files: 13 passed (13)
✓ Tests: 273 passed | 3 skipped (276)
```

## 3. Run Just PatternDetector Tests

```bash
npm test -- patternDetector
```

Should see:
```
✓ PatternDetector (21 tests)
  ✓ detectPatternWithLLM (5 tests)
  ✓ fallbackKeywordDetection (8 tests)
  ✓ shouldFlagPattern (4 tests)
  ✓ Integration tests (4 tests)
```

## 4. Manual Testing in VS Code

### Step 1: Launch Extension in Debug Mode

```bash
# In VS Code, press Ctrl+Shift+D (Debug)
# Select "Run Extension" from the dropdown
# Click the green Play button (or F5)
```

This opens a new VS Code window with the extension running.

### Step 2: Open Multi-Workspace Project

In the new VS Code window:
- File → Open Folder (or drag folders)
- Select multiple folders to open in workspace
- Example: `portfolio` + `adu-cost-matcher`

### Step 3: Test `/suggest-patterns` Command

1. Open the Chat Panel (Ctrl+Shift+P → "LLM: Open Chat")
2. Type: `/suggest-patterns`
3. **Expected behavior:**
   - If multiple workspaces → Shows workspace selection buttons
   - Click a workspace → Analyzes all files in that workspace
   - Output shows:
     ```
     💡 **Pattern Suggestions** (workspace-name)
     
     📄 src/components/ChatWidget.tsx — Could use **DataFetching** pattern (88% confidence)
        ℹ️ Uses TanStack Query or similar for data management
     ```

### Step 4: Test With Different Scenarios

**Scenario A: Pure UI Component (No Pattern)**
```bash
# Create test file: src/components/Header.tsx
export function Header() {
  return <header><h1>My App</h1></header>;
}

# Result: Should NOT be flagged by /suggest-patterns
```

**Scenario B: Clear CRUD Pattern**
```bash
# Create test file: src/services/userService.ts
export async function createUser(data) { return api.post('/users', data); }
export async function getUser(id) { return api.get(`/users/${id}`); }
export async function updateUser(id, data) { return api.put(`/users/${id}`, data); }
export async function deleteUser(id) { return api.delete(`/users/${id}`); }

# Result: Should be flagged as CRUD pattern (high confidence)
```

**Scenario C: Forms Pattern**
```bash
// Create test file: src/components/LoginForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

export function LoginForm() {
  const { register, handleSubmit } = useForm({
    resolver: zodResolver(loginSchema),
  });
  return <form onSubmit={handleSubmit(onSubmit)}>...</form>;
}

# Result: Should be flagged as Forms pattern
```

## 5. Test Fallback Behavior (No LLM)

To test the fallback keyword detection:

1. Stop Ollama: `cmd+c` in terminal
2. Run `/suggest-patterns` again
3. **Expected:**
   - Extension still works (no crash)
   - Uses fast keyword-based detection
   - Results less accurate but functional

## 6. Debug Logs

In the extension's Debug Console (Ctrl+Shift+Y), you'll see:

```
[PatternDetector] LLM analysis for src/components/ChatWidget.tsx
[PatternDetector] Pattern detection: DataFetching (confidence: 0.88)
```

Or if LLM fails:
```
[PatternDetector] LLM analysis failed: Error: connection timeout, falling back to keywords
[PatternDetector] Using keyword-based fallback detection
```

## 7. Verify Alignment Between `/suggest-patterns` and `/refactor`

### Before the Fix (Old Behavior)
1. `/suggest-patterns` → Flags ChatWidget.tsx
2. `/refactor src/components/ChatWidget.tsx` → No issues found

❌ Disconnect!

### After the Fix (New Behavior)
1. `/suggest-patterns` → Only flags if LLM agrees it needs a pattern
2. `/refactor src/components/ChatWidget.tsx` → Both use semantic analysis

✅ Aligned!

## 8. Full Integration Test (Recommended)

```bash
# 1. Kill old extension process
pkill -f "extension.js"

# 2. Recompile
npm run compile

# 3. Run all tests
npm test

# 4. Launch extension (F5 in VS Code)

# 5. Test /suggest-patterns
# 6. Test /refactor
# 7. Verify alignment
```

## Expected Results

**Pattern Detection Accuracy:**
- CRUD operations: 85-95% confidence
- Forms (with react-hook-form): 80-92% confidence
- API calls (useQuery, fetch): 75-85% confidence
- Pure UI components: 0% (correctly returns "None")

**Confidence Threshold:**
- Only files with ≥60% confidence are flagged
- Reduces false positives significantly
- More helpful recommendations

## Troubleshooting

### Issue: "LLM service unavailable"
**Solution:** Make sure Ollama is running
```bash
ollama serve
```

### Issue: Extension doesn't reload on code changes
**Solution:** Stop and restart debug session (Ctrl+Shift+F5)

### Issue: Tests fail with "Cannot find module"
**Solution:** Clear node_modules and reinstall
```bash
rm -rf node_modules
npm install
```

### Issue: "Pattern not detected" when it should be
**Solution:** Check LLM output in debug console
- If LLM response is incomplete, increase timeout
- If keywords don't match, check fallback detection rules
- Update pattern detection in `patternDetector.ts`

## Next Steps After Testing

1. ✅ Verify alignment: `/suggest-patterns` and `/refactor` give consistent results
2. ✅ Test all 8 pattern types (CRUD, Forms, Auth, DataFetching, StateManagement, etc.)
3. ✅ Test with real code from `ai-chatbot` and `adu-cost-matcher` workspaces
4. ✅ Merge PR to main when confident
5. ✅ Release as v2.0.1 patch

---

**Questions?** Check PR #13 comments or debug logs!
