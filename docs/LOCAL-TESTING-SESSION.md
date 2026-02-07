# v2.0 Local Testing Session - Feb 6, 2026

**Goal:** Test all 5 new commands in real scenarios, find bugs, validate features  
**Time Estimate:** 1-2 hours  
**Status:** Ready to start

---

## Quick Setup (5 minutes)

### Step 1: Ensure Extension is Compiled
```bash
cd /tmp/llm-local-assistant
npm run compile
```

### Step 2: Start Extension in Debug Mode
```bash
# In VS Code, open /tmp/llm-local-assistant
# Press F5 to launch debug session
# This opens a new VS Code window with the extension loaded
```

### Step 3: Create Test Project
```bash
bash PHASE-3.4.5-LOCAL-TESTING-SETUP.sh
# Creates ~/test-llm-local-v2.0 with sample files
```

### Step 4: Open Test Project
```bash
# In the debug VS Code window, open folder: ~/test-llm-local-v2.0
```

---

## Testing Checklist

### ✅ Command 1: `/refactor src/hooks/useUser.ts`

**Expected Output:**
- Status message: "🔍 Analyzing src/hooks/useUser.ts..."
- Analysis completes in <5 seconds
- Shows: Complexity (HIGH), Confidence (70-85%)
- Lists suggested changes
- Shows risks section
- No errors or crashes

**What to Verify:**
- [ ] File is read correctly
- [ ] Analysis identifies it as a fat hook
- [ ] Suggests extracting API calls
- [ ] Suggests simplifying filtering logic
- [ ] Confidence score is reasonable (70-85%)
- [ ] No crashes or timeouts

**If Issues:**
- Note exact error message
- Try on different files
- Check console output

---

### ✅ Command 2: `/rate-architecture`

**Expected Output:**
- Status message: "📊 Scanning codebase..."
- Completes in <5 seconds
- Shows overall score (should be 6-7/10 with mixed quality files)
- Lists files analyzed
- Shows message like "⚠️ Good structure, room for improvement"

**What to Verify:**
- [ ] Scans all files in src/
- [ ] Returns score 0-10
- [ ] Score reflects mixed quality (good schemas, bad components)
- [ ] No crashes on empty project
- [ ] Performance acceptable (<5 seconds)

**If Issues:**
- Note the score vs expected
- Test with empty directory
- Check file count detected

---

### ✅ Command 3: `/suggest-patterns`

**Expected Output:**
- Status message: "🔍 Analyzing patterns..."
- Lists available patterns (8 types)
- Shows recommendations (up to 5)
- Message: "Use **/refactor <file>** to apply improvements"

**What to Verify:**
- [ ] Lists all 8 patterns
- [ ] Shows relevant recommendations
- [ ] No crashes
- [ ] Handles non-TS files gracefully
- [ ] Performance <3 seconds

**If Issues:**
- Note missing patterns
- Check if recommendations make sense
- Test with CSS/JS files

---

### ✅ Command 4: `/design-system User Profile`

**Expected Output:**
- Status message: "🎨 Designing system for User Profile..."
- Shows multi-step plan with:
  - Step 1: Create userSchema.ts
  - Step 2: Create userService.ts
  - Step 3: Create useUser.ts
  - Step 4: Create UserProfile.tsx
- Message: "Use **/approve** to generate all files"

**What to Verify:**
- [ ] Plan shows all 4 steps
- [ ] Steps are in correct order (schema → service → hook → component)
- [ ] Step names are descriptive (not "Step 2", "Step 3")
- [ ] No duplicate writes
- [ ] Plan stored for /approve

**Then Execute:**
```
/approve
```

**Expected:**
- Files are created in correct order
- Schema, service, hook, component all exist
- Files are syntactically valid
- No circular dependencies

**If Issues:**
- Note step ordering
- Check if files are created
- Verify no duplicates

---

### ✅ Command 5: `/extract-service src/hooks/useUser.ts UserService`

**Expected Output:**
- Status message: "🔄 Extracting service from src/hooks/useUser.ts..."
- Analysis completes
- Shows dialog with options: Execute Refactoring | Preview Only | Cancel

**Select Preview Only:**
- Shows what will be created
- Service file: UserService.ts
- Modified hook: useUser.ts
- Generated tests: 3
- Impact assessment

**Then run again and select Execute Refactoring:**
- Files are created/updated
- Original hook is modified to use service
- Tests are generated
- Message: "✅ Service Extraction Successful"

**What to Verify:**
- [ ] Preview shows accurate changes
- [ ] Service file is created
- [ ] Hook is updated (no duplicate fetch calls)
- [ ] Tests are generated
- [ ] Files compile without errors
- [ ] No crashes during execution

**If Issues:**
- Note what's wrong in preview
- Check generated service code
- Verify test files exist

---

## Edge Cases to Test

### Test 1: File Not Found
```
/refactor src/nonexistent.ts
```
**Expected:** Error message "File not found" or similar  
**Result:** ☐ Pass / ☐ Fail

### Test 2: Empty File
```
# Create empty file
touch src/empty.ts

/refactor src/empty.ts
```
**Expected:** Analysis completes, shows "No issues found" or low complexity  
**Result:** ☐ Pass / ☐ Fail

### Test 3: Very Long Path
```
mkdir -p src/deeply/nested/folder/structure
touch src/deeply/nested/folder/structure/useTest.ts

/refactor src/deeply/nested/folder/structure/useTest.ts
```
**Expected:** Works correctly with long paths  
**Result:** ☐ Pass / ☐ Fail

### Test 4: Special Characters in File Name
```
touch src/hooks/use-Custom-Hook.ts

/refactor src/hooks/use-Custom-Hook.ts
```
**Expected:** Works with hyphens and capitals  
**Result:** ☐ Pass / ☐ Fail

### Test 5: Non-TypeScript File
```
touch src/styles.css

/refactor src/styles.css
```
**Expected:** Graceful handling or error message  
**Result:** ☐ Pass / ☐ Fail

---

## Performance Benchmarks

Test and time each command:

```
/refactor src/hooks/useUser.ts
```
**Time:** _____ seconds  
**Expected:** <5 seconds  
**Result:** ☐ Pass / ☐ Fail

```
/rate-architecture
```
**Time:** _____ seconds  
**Expected:** <5 seconds  
**Result:** ☐ Pass / ☐ Fail

```
/suggest-patterns
```
**Time:** _____ seconds  
**Expected:** <3 seconds  
**Result:** ☐ Pass / ☐ Fail

```
/design-system User Profile
```
**Time:** _____ seconds  
**Expected:** <5 seconds  
**Result:** ☐ Pass / ☐ Fail

---

## Bug Report Template

If you find an issue, use this format:

```markdown
### Bug: [Brief Title]

**Command:** /command-name

**Steps to Reproduce:**
1. ...
2. ...
3. ...

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happened]

**Error Message:**
[Exact error or console output]

**Environment:**
- Extension: LLM Local Assistant v2.0
- Test Project: ~/test-llm-local-v2.0
- File Tested: [file path]

**Severity:** [Critical/High/Medium/Low]

**Notes:**
[Any additional context]
```

---

## Quick Reference

### Commands to Test
```bash
/refactor src/hooks/useUser.ts
/rate-architecture
/suggest-patterns
/design-system User Profile
/extract-service src/hooks/useUser.ts UserService
```

### Files in Test Project
```
~/test-llm-local-v2.0/
  ├── src/
  │   ├── schemas/
  │   │   └── userSchema.ts (GOOD - reference)
  │   ├── services/
  │   │   └── userService.ts (GOOD - reference)
  │   ├── hooks/
  │   │   └── useUser.ts (FAT HOOK - needs refactoring)
  │   └── components/
  │       └── UserProfile.tsx (BAD - anti-patterns)
  └── package.json
```

### Expected Results

| Command | Success Rate | Time | Notes |
|---------|-------------|------|-------|
| /refactor | 90%+ | <5s | Should identify fat hook |
| /rate-architecture | 100% | <5s | Should score 6-7/10 |
| /suggest-patterns | 100% | <3s | Should list improvements |
| /design-system | 90%+ | <5s | Should create all 4 layers |
| /extract-service | 90%+ | <5s | Should extract API calls |

---

## Session Log Template

```markdown
# Local Testing Session - Feb 6, 2026

## Setup
- [x] Extension compiled
- [x] Debug mode started (F5)
- [x] Test project created
- [x] All sample files present

## Test Results

### /refactor src/hooks/useUser.ts
- Status: ☐ PASS / ☐ FAIL
- Time: ____ seconds
- Issue: [if any]

### /rate-architecture
- Status: ☐ PASS / ☐ FAIL
- Score: ____/10
- Issue: [if any]

### /suggest-patterns
- Status: ☐ PASS / ☐ FAIL
- Patterns listed: ☐ Yes / ☐ No
- Issue: [if any]

### /design-system User Profile
- Status: ☐ PASS / ☐ FAIL
- Files created: ☐ 4/4
- Issue: [if any]

### /extract-service
- Status: ☐ PASS / ☐ FAIL
- Service created: ☐ Yes / ☐ No
- Hook updated: ☐ Yes / ☐ No
- Issue: [if any]

## Overall Quality Rating
1-10: ____

## Critical Issues Found
- [List any]

## Ready to Publish?
☐ YES - All tests pass, ready for marketplace
☐ NO - Issues found, need fixes
```

---

## Starting Point

When you're ready:

1. **Compile:** `npm run compile` (in llm-local-assistant folder)
2. **Debug:** Press F5 in VS Code
3. **Setup:** `bash PHASE-3.4.5-LOCAL-TESTING-SETUP.sh`
4. **Open:** Open ~/test-llm-local-v2.0 in debug VS Code window
5. **Test:** Run the 5 commands in order

---

## Questions During Testing?

If something doesn't work:
1. Check console output (View → Toggle Developer Tools)
2. Note the exact error
3. Try the command again
4. If consistent, document in bug report template

---

**Ready to test v2.0 locally?** Let me know when you've set up the extension and test project. I'll be here to help debug anything! 🚀
