# Phase 3.4.5 Testing - Quick Start

## What's Ready to Test

**5 New Commands:**
- ✅ `/refactor <file>` — Analyze file + suggest improvements
- ✅ `/extract-service <hook> <name>` — Extract to service
- ✅ `/design-system <feature>` — Generate full architecture
- ✅ `/rate-architecture` — Score codebase (0-10)
- ✅ `/suggest-patterns` — Show improvements

**Production Code:** 70KB, 234 tests passing, all compiling

---

## How to Test (30 minutes to 3 hours)

### Step 1: Setup (5 min)
```bash
cd llm-local-assistant

# Ensure you're on the right branch
git checkout feat/phase3.3-context-awareness
git pull

# Compile
npm run compile

# Start dev extension (F5 in VS Code)
```

### Step 2: Create Test Project (10 min)
```bash
# Run the setup script
bash PHASE-3.4.5-LOCAL-TESTING-SETUP.sh

# This creates:
# ~/test-llm-local-v2.0/
#   ├── src/schemas/userSchema.ts (GOOD example)
#   ├── src/services/userService.ts (GOOD example)
#   ├── src/hooks/useUser.ts (FAT HOOK - needs refactoring)
#   └── src/components/UserProfile.tsx (BAD patterns)
```

### Step 3: Open Test Project
```bash
# In VS Code
code ~/test-llm-local-v2.0
```

### Step 4: Start Testing
Open the integrated terminal in VS Code and type commands:

```
/refactor src/hooks/useUser.ts
/rate-architecture
/suggest-patterns
/design-system User Profile
/extract-service src/hooks/useUser.ts UserService
```

---

## Testing Guide

**Read:** `PHASE-3.4.5-LOCAL-TESTING-GUIDE.md`

Contains:
- 25 detailed test scenarios (5 per command)
- Edge cases and error handling
- Performance benchmarks
- Cross-command workflows
- Bug report template
- Full testing checklist

---

## Key Things to Test

### Critical Path (test these first)
1. ✅ `/refactor src/hooks/useUser.ts`
   - Should detect HIGH complexity
   - Should suggest extracting API calls
   - Confidence ~80%

2. ✅ `/extract-service src/hooks/useUser.ts UserService`
   - Should show preview
   - Should have Execute/Preview/Cancel options
   - Should complete extraction successfully

3. ✅ `/design-system User Profile System`
   - Should create plan with multiple steps
   - Should offer `/approve` to execute
   - Should generate all 4 files (schema, service, hook, component)

4. ✅ `/rate-architecture`
   - Should analyze all files
   - Should return score 6-7/10 (mixed quality)
   - Should not crash on empty project

5. ✅ `/suggest-patterns`
   - Should list 8 available patterns
   - Should suggest improvements
   - Should not crash

### Edge Cases (test after critical path)
- File not found errors
- Invalid paths
- Empty files
- Very long paths
- Special characters
- Timeout handling
- Cancel operations

---

## Expected Outcomes

### Best Case (v2.0 ready to ship)
- All 5 commands work perfectly
- No crashes or hangs
- Good error messages
- Fast performance (<5s per command)
- Score improves after refactoring

### Acceptable (minor bugs ok)
- 4/5 commands fully working
- Minor UI/UX issues
- Some edge cases fail gracefully
- Performance acceptable

### Needs Work
- 3+ commands have issues
- Crashes or hangs
- Poor error messages
- Performance problems

---

## What to Report

Use the bug report template in the testing guide:

```markdown
### Bug: [Title]

**Command:** /command-name

**Steps to Reproduce:**
1. ...
2. ...

**Expected:** ...
**Actual:** ...
**Severity:** [Critical/High/Medium/Low]
```

---

## Testing Workflow

```
30-minute sprint:
- Setup (5 min)
- Test critical path (25 min)
- Initial assessment

Full test session (3 hours):
- Test all edge cases
- Test workflows
- Performance benchmarking
- Report all bugs/gaps
```

---

## Files to Reference

- `PHASE-3.4.5-LOCAL-TESTING-GUIDE.md` — Comprehensive testing guide
- `PHASE-3.4.5-LOCAL-TESTING-SETUP.sh` — Automated setup
- `src/extension.ts` — Command implementations
- `src/architecturePatterns.ts` — Pattern library
- `src/featureAnalyzer.ts` — Analysis engine
- `src/serviceExtractor.ts` — Extraction logic
- `src/refactoringExecutor.ts` — Execution engine

---

## Quick Commands Reference

```bash
# Compile and test
npm run compile
npm test

# Start testing
code ~/test-llm-local-v2.0

# In test project, try:
/refactor src/hooks/useUser.ts
/rate-architecture
/suggest-patterns
/design-system User Profile
/extract-service src/hooks/useUser.ts UserService
```

---

## Final Sign-Off Questions

After testing, answer:

1. **Quality Rating:** 1-10 (1=broken, 10=perfect)
2. **All Commands Working?** Y/N
3. **Critical Bugs?** [List any]
4. **Performance OK?** Y/N
5. **Ready to Merge?** Y/N

---

**Estimated Time:** 30 min (quick) to 3 hours (full)  
**Goal:** Find gaps before v2.0 release  
**Good luck!** 🚀
