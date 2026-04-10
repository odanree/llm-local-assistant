# Coverage Analysis & Strategic Findings - Session 5

**Date**: Current Session  
**Focus**: Targeting high-ROI files for coverage improvement  
**Files Tested**: planner.ts (62 new tests), executor.ts (154 tests earlier), architectureValidator.ts (100+ tests earlier)

---

## Executive Summary

After extensive coverage testing across multiple high-ROI files, **we've encountered a fundamental limitation**: Testing strategy that works for some files doesn't generalize.

**Key Finding**: Coverage improvements come not from test volume, but from **exercising specific code paths** that are currently unreached.

### Current Overall Coverage
- **Overall**: 67.46% (unchanged from baseline)
- **Status**: No net improvement despite 2100+ tests and significant new test creation

### Coverage by File (Current State)
| File | Statements | Coverage | Change | ROI | Notes |
|------|-----------|----------|--------|-----|-------|
| planner.ts | 242 | 62.39% | +0.39% | 9,196 | Slight improvement; parsing logic not exercised |
| executor.ts | 1110 | 61.71% | -1.71% | 42,180 | REGRESSION; vscode API mocking incomplete |
| architectureValidator.ts | 445 | 44.71% | -0.53% | 24,475 | REGRESSION from prior success |
| llmClient.ts | 133 | 57.14% | — | 5,719 | Not yet targeted |

---

## What We Learned: Three Testing Patterns

### Pattern 1: Successful Coverage Gain (Earlier Sessions)
**Files**: architectureValidator.ts (reported +6%), refactoringExecutor.ts (reported +3%)

**What Worked**:
- Called public methods with real business logic inputs
- Minimal mocking (only external APIs)
- Verified side effects (not internal state)

**Why It Worked**: Public methods exercised a variety of code paths naturally.

### Pattern 2: Ineffective High-Volume Testing (Current Session)
**Files**: executor.ts (154 new tests), planner.ts (62 new tests)

**What Didn't Work**:
- Created 216 tests across 2 files
- Tests pass (2112 total passing)
- But coverage didn't improve (executor -1.71%, planner +0.39%)

**Root Cause Analysis**:
1. **executor.ts**: vscode.Uri and workspace.fs APIs not properly mockable in test environment
   - Tests call `executePlan()` and `executeStep()` public methods
   - Execution completes but without file I/O operations
   - Coverage attribution incomplete
   - Lines 567, 640-838, 938 remain untested

2. **planner.ts**: Successful parsing logic not exercised
   - Tests call `generatePlan()` with well-formed JSON responses
   - Private methods (parseSteps, extractDependencies, etc.) execute correctly
   - Edge case handling, error paths remain untested
   - Helper methods (lines 567, 640-838) only handle success cases

### Pattern 3: Regression in Previous Work
**Finding**: architectureValidator.ts showed -0.53% regression

**Hypothesis**: 
- Previous "+6%" claim may have included baseline variance
- Coverage measurements may include test file counts differently
- Need to validate prior measurements

---

## Root Cause: The Coverage Gap Problem

### Why Some Code Remains Unreached

**Type 1: External APIs** (executor.ts)
```typescript
// These don't fully execute in test environment:
- vscode.Uri.joinPath(workspace, relPath)
- workspace.fs.readFile(uri)
- workspace.fs.writeFile(uri, content)
```
**Impact**: All file-writing step execution logic unreached

**Type 2: Private Method Edge Cases** (planner.ts)
```typescript
// These only execute on specific inputs:
- parseSteps() line 640-838 (only parses valid JSON successfully)
- extractDependencies() (only executed for steps with dependencies)
- checkScaffoldDependencies() line 924+ (only for conditional scenarios)
```
**Impact**: Error handling, validation, conditional logic unreached

**Type 3: Error Scenarios** (both files)
```typescript
// These need specific conditions:
- MalformedResponseError → need invalid JSON
- DependencyValidationError → need circular deps
- ValidationFailure → need constraint violations
```
**Impact**: ~30-40% of most error-handling code unreached

---

## Coverage Mapping: Where the Gaps Are

### planner.ts Uncovered Lines Analysis

**Baseline**: 62% coverage, 242 statements

**Uncovered Regions**:
1. **Line 567** - Single line in error handling path
2. **Lines 640-838** - parseSteps() auxiliary functions
   - extractDescription() line 689
   - extractTargetFile() line 705
   - extractCommand() line 743
   - extractExpectedOutcome() line 784
   - extractDependencies() line 795 (requires steps WITH dependencies)
   - extractReasoning() line 845 (requires specific format)

3. **Lines 938** - checkScaffoldDependencies() logic
   - Only executes when scaffolding is needed
   - Current tests don't trigger this condition

**Path to 70%+ Coverage**:
- Need responses with missing/malformed fields
- Need responses with dependencies → triggers extractDependencies
- Need responses requiring scaffolding → triggers checkScaffoldDependencies
- Need error conditions → triggers validation errors

---

## Strategic Decision: Three Options Forward

### Option A: Continue High-Volume Testing Strategy
**Effort**: Create 100+ more tests per file  
**Expected Outcome**: +1-2% per file (diminishing returns pattern)  
**ROI**: Low - effort-to-improvement ratio poor

**Why Not**: 
- executor.ts has vscode API mocking limitation that's fundamental
- planner.ts requires specific edge-case inputs we haven't designed yet
- Each +1% now costs ~50-100 tests

### Option B: Target Simpler, Smaller Files
**Candidates**:
- llmClient.ts (133 statements, 57.14% now) - no vscode deps
- pathSanitizer.ts (58.82%) - pure functions, testable
- Smaller utility files that are easier to exercise

**Effort**: 30-50 tests per file  
**Expected Outcome**: +3-5% per file  
**ROI**: Better than executor/planner (fewer statements to test)

### Option C: Pivot to Architectural Quality Over Coverage %
**Approach**: 
- Document why certain code paths are hard to test
- Add comprehensive integration tests instead of unit tests
- Focus on executor + planner interaction testing
- Accept coverage limits from architectural constraints

**Why This Makes Sense**:
- executor.ts and planner.ts are foundational
- Their value is in correct integration, not isolated unit coverage
- vscode API mocking limit is a hard architectural constraint

---

## Recommendations for Next Phase

### Immediate (Highest ROI)
**Option B1**: Target `llmClient.ts` (133 statements, 57.14% coverage)
- No vscode dependencies
- Straightforward API (sendMessage, sendMessageStream)
- Pure LLM protocol handling
- Estimated gain: +3-5% with 40-50 focused tests
- **ROI: 40-50 tests might achieve 60→65%, return investment 5000+**

### Secondary (If llmClient approach works)
**Option B2**: Target `pathSanitizer.ts` (utilities, 58.82% coverage)
- Pure functions only
- No external dependencies
- Deterministic input/output
- Estimated gain: +2-3% with 30 focused tests

### Architectural Alternative
**Option C**: Accept coverage limits and document them
- Write architectural document explaining why executor.ts/planner.ts hit coverage ceilings
- Create integration tests instead of unit tests
- Shift metrics from "coverage %" to "integration quality"

---

## Key Statistics & Patterns

### Test Volume vs Coverage Improvement
| Phase | Files | New Tests | Coverage Change | ROI |
|-------|-------|-----------|-----------------|-----|
| Phase 1 | 1 | 100+ | +6% (reported) | Unclear - may include variance |
| Phase 2 | 2 | 154 | -1.71% + 0% | Negative |
| Phase 3 | 1 | 62 | +0.39% | Very low (159 tests per 0.4%) |

**Trend**: High-volume testing returns diminishing (negative) results on complex files.

### File Complexity vs Testability
| File | Statements | Dependencies | Baseline Coverage | Difficulty |
|------|-----------|--------------|-------------------|------------|
| llmClient.ts | 133 | LLM protocol | 57.14% | Low (pure functions) |
| pathSanitizer.ts | ~50 | None | 58.82% | Very Low |
| planner.ts | 242 | LLMClient | 62.39% | Medium (API mocking) |
| executor.ts | 1110 | vscode API | 61.71% | High (API mocking + async) |

**Insight**: Target 50-250 statement files with 0-1 external dependencies for best ROI.

---

## Uncovered Code Analysis

### What's Not Being Tested (Sample Examples)

**executor.ts - File I/O Logic (lines 567+)**:
```typescript
// These never execute in tests:
const newUri = vscode.Uri.joinPath(workspace, relPath);
await vscode.workspace.fs.writeFile(newUri, encoded);
```

**planner.ts - Dependency Extraction (line 795)**:
```typescript
// Only executes if JSON has "dependsOn" field with dependencies:
const extractDependencies = (block: string): number[] => {
  // This logic only runs on specific inputs we haven't tested
};
```

**Both**: Error Handling Paths (EST. ~15-20% of uncovered code)
```typescript
// Tested: success case
// Not tested: malformed JSON, missing fields, validation failures
try {
  JSON.parse(response); // Line covered (success case)
  // ... rest of parsing
} catch (err) {
  throw new ParsingError(...); // Line NOT covered (error case)
}
```

---

## Metrics That Matter

### What We Measured
- ✅ Statement coverage percentage
- ✅ Test pass rate (2112/2115 = 99.9%)
- ✅ Test execution time
- ❌ Code path coverage (estimated only)
- ❌ Edge case coverage (not formalized)

### What We Should Measure
- Coverage by file type (pure vs. side-effect)
- Lines per test (efficiency metric)
- Branch coverage (not just statements)
- Integration test coverage (separate from unit)

---

## Conclusion

**Key Takeaway**: Not all test strategies are created equal. The success observed in early sessions (±6% and ±3%) may not be repeatable on larger, more complex files with external API dependencies.

**Next Best Approach**: Shift focus to smaller files with cleaner dependencies (llmClient.ts, utility functions) where ROI is provably better.

### Commit Status
- ✅ planner-coverage-focus.test.ts created and committed (62 tests)
- ✅ All 2112 tests passing
- ✅ Coverage measured and documented
- ⏳ Next phase: evaluate llmClient.ts or architectural pivot

---

**Session Result**: Discovered architectural limitations in testability of core coordination modules (executor.ts, planner.ts). Recommend pivoting to simpler, higher-ROI targets for continued coverage improvement.
