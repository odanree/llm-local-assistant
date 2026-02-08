# Phase 3.4.5 - Known Issues & Recommendations

## Current Status (Feb 6, 21:25 PST)

### ✅ WORKING
- `/refactor` command - LLM-based semantic analysis ✅
- `/extract-service` - Both button + direct command paths ✅
- `/design-system` - Generates architecture plans + writes service files ✅
- File writing to correct paths (src/services/, src/hooks/, etc.) ✅

### ⚠️ BLOCKING ISSUE (Phase 3.1, not Phase 3.4.5)
**Gatekeeper Validation Loop - Infinite Correction**

Discovered during `/design-system` testing:

```
Step 1: LLM generates useUserProfile.ts with unused useState
↓
Step 2: Gatekeeper detects unused import, removes it
↓
Step 3: Gatekeeper re-validates, detects missing useState (hook needs it!)
↓
Step 4: Auto-correction adds useState back
↓
Step 5: LOOP - back to Step 2
```

**Evidence**:
- UserProfileService.ts created successfully ✅
- useUserProfile.ts validation fails in infinite loop ❌
- Remaining steps never execute

**Root Cause**:
The gatekeeper validates BEFORE auto-correction, finds issues, auto-corrects, but doesn't re-validate. It validates again and finds NEW issues created by the correction.

**Proper Flow**:
```
Generate code
  ↓
Validate & collect issues
  ↓
Auto-correct issues
  ↓
RE-VALIDATE after corrections ← THIS STEP IS MISSING
  ↓
Only fail if issues persist after correction
```

### Impact
- `/design-system` generates good plans but can't execute them
- Phase 3.2 (Planner) can create files but validation blocks execution
- Affects multi-file generation (all features that write >1 file)

### Recommendation for Phase 3.1 Improvement
The gatekeeper (src/semanticValidator.ts) needs to:

1. **Separate concerns**:
   - Validation layer (find issues)
   - Correction layer (fix issues)
   - Re-validation layer (confirm fixes worked)

2. **Add max iterations** (prevent infinite loops):
   ```typescript
   let issues = validate(code);
   let iterations = 0;
   const maxIterations = 3;
   
   while (issues.length > 0 && iterations < maxIterations) {
     code = autoCorrect(code, issues);
     issues = validate(code);  // ← RE-VALIDATE
     iterations++;
   }
   
   if (issues.length > 0) {
     return { success: false, issues };  // Give up after 3 tries
   }
   ```

3. **Track what was corrected**:
   - Store original vs corrected code
   - Don't remove same issue twice
   - Detect conflicting corrections

4. **Better heuristics for unused imports**:
   - Check if it's a React hook (might be needed even if not directly used)
   - Check hook dependencies
   - Don't auto-remove React hooks from hook files

### Files Affected
- `src/semanticValidator.ts` - Main validation logic
- `src/refactoringExecutor.ts` - Uses validator for multi-layer validation
- `src/planner.ts` - Orchestrates file generation

### Phase 3.4.5 Status
- ✅ All blockers fixed
- ✅ Both extraction paths working
- ✅ LLM-based analysis + extraction verified
- ⚠️ Blocked by Phase 3.1 gatekeeper issue (not our problem, but affects `/design-system`)

### Next Steps
1. **Phase 3.4.5 → main**: Merge PR #11 with all refactoring fixes
2. **Phase 3.1 Improvement**: Fix gatekeeper validation loop (separate issue)
3. **v2.0 Release**: Once gatekeeper is fixed

---

**Note**: `/design-system` is technically working (service was created). The validation issue is separate and affects Phase 3.2 (Planner) multi-file generation more broadly.
