# Phase 5 Wave 1: Ghost Path Analysis

**Date**: February 26, 2025, 6:35 PM UTC
**Status**: 🔴 COVERAGE DROP DETECTED - Ghost Paths Identified
**Incident**: Wave 1 deletion caused 2.0% coverage drop (71.14% → 69.19%)

---

## Incident Summary

### What Happened
Deleted 6 executor test files as planned:
- executor-internals.test.ts
- executor-real-execution.test.ts
- executor-errors.test.ts
- executor-coverage-focus.test.ts
- executor-dependencies.test.ts
- executor-validation.test.ts

### Coverage Result
- **Before Deletion**: 71.14% (2,516 tests)
- **After Deletion**: 69.19% (2,257 tests)
- **Delta**: -1.95% (exceeds 1% threshold) ❌
- **Action Taken**: ✅ Restored all files (Gold Standard guardrail triggered)

### Root Cause
The executor-internals.test.ts file contains **direct unit-level tests** of high-complexity private methods that executor.lifecycle.test.ts doesn't fully cover:

1. **validateGeneratedCode()** (CC ≈ 8)
   - Tests 20+ distinct code path branches
   - executor.lifecycle.test.ts exercises it implicitly through workflow
   - Missing: Direct edge case testing for validation logic

2. **validateArchitectureRules()** (CC ≈ 7)
   - Tests 15+ distinct rule violation patterns
   - executor.lifecycle.test.ts exercises through code generation
   - Missing: Isolated validation of each rule

3. **attemptAutoFix()** (CC ≈ 6)
   - Tests auto-recovery logic
   - executor.lifecycle.test.ts may not trigger all failure modes
   - Missing: Direct failure simulation testing

---

## What Coverage Was Lost (2.0% Gap)

### executor-internals.test.ts Unique Paths
1. **Direct branch coverage** of validateGeneratedCode() validation logic
   - Type validation branches (TypeScript vs JavaScript)
   - Pattern detection branches (Zustand vs Redux, hooks vs class)
   - Contract validation branches

2. **Isolated error scenarios** in validateArchitectureRules()
   - Each rule violation tested in isolation
   - Edge cases (empty content, malformed patterns)

3. **Auto-fix recovery paths**
   - Direct testing of auto-correction logic
   - Mock-based failure injection (not dependent on realistic failures)

### Why executor.lifecycle.test.ts Doesn't Cover This
- **Lifestyle tests are integration-level**: They execute full workflows
- **Missing:** Direct unit-level branching of private methods
- **Result:** Some code paths in private methods aren't triggered

---

## Solution: Add Private Method Tests to executor.lifecycle.test.ts

### Strategy
Instead of keeping 6 separate test files, **add targeted rows to executor.lifecycle.test.ts** that:
1. Test private method behavior directly
2. Use the same HighFidelityLLMClient mock
3. Follow the same test.each() parameterization pattern
4. Restore the 2.0% coverage gap

### Implementation Plan

#### Phase 1: Identify Missing Code Paths
From executor-internals.test.ts, extract the 20-25 most critical test cases:

**validateGeneratedCode() Edge Cases** (8-10 rows):
```typescript
{
  scenario: 'validateGeneratedCode: valid TypeScript assignment',
  setup: () => ({ code: 'export const x = 1;' }),
  test: (instance) => (instance as any).validateGeneratedCode(...),
  expect: { valid: true, errors: 0 }
}
```

**validateArchitectureRules() Violations** (8-10 rows):
```typescript
{
  scenario: 'validateArchitectureRules: detect direct fetch',
  setup: () => ({ code: 'fetch("/api/user")' }),
  test: (instance) => (instance as any).validateArchitectureRules(...),
  expect: { valid: false, violationCount: 1 }
}
```

**attemptAutoFix() Recovery** (5-7 rows):
```typescript
{
  scenario: 'attemptAutoFix: should fix Redux to Zustand',
  setup: () => ({ code: 'useSelector(...)' }),
  test: (instance) => (instance as any).attemptAutoFix(...),
  expect: { fixed: true, newCode: expect.stringContaining('useAppStore') }
}
```

#### Phase 2: Add to executor.lifecycle.test.ts
Create new describe block: **"Private Method Unit Tests"**
- Contains it.each() matrix with 20-25 test cases
- Tests private methods directly with state injection
- Covers all validation branches identified in executor-internals.test.ts

#### Phase 3: Verify Coverage
```bash
npm test -- --coverage

# Target: >= 71.28%
# Measure: executor.ts lines coverage
```

---

## Why This Approach Works

### 1. Maintains Integration Focus
- executor.lifecycle.test.ts remains the integration test anchor
- Added tests are integration-aware (not isolated mocks)
- Full test suite still exercises realistic workflows

### 2. Eliminates Redundancy
- Single comprehensive test file (executor.lifecycle.test.ts)
- No 6 separate unit test files
- Easier to maintain

### 3. Covers Ghost Paths
- Direct method testing catches edge cases
- Same mocking infrastructure (HighFidelityLLMClient)
- Parameterized approach scales to 50+ tests

### 4. Meets Gold Standard
- Coverage should recover to >= 71.28%
- All tests remain passing
- Atomic commit possible

---

## Next Steps

### Immediate (Today)
1. ✅ Analyze executor-internals.test.ts to extract critical test cases (Done)
2. ⏳ Identify the 20-25 most important tests from executor-internals.test.ts
3. ⏳ Add "Private Method Unit Tests" describe block to executor.lifecycle.test.ts
4. ⏳ Add test cases as new it.each() rows
5. ⏳ Run coverage and verify >= 71.28%
6. ⏳ Execute Wave 1 deletion again

### If Coverage Still Below Threshold
- Extract more test cases from executor-internals.test.ts
- Add to executor.lifecycle.test.ts matrix
- Iterate until coverage restored

### Once Coverage Restored
- Proceed with Wave 1 atomic commit
- Continue to Wave 2 (Mar 9-13)

---

## Key Learning: Ghost Paths

**Ghost Paths** = Code executed implicitly in integration tests but not explicitly in their assertions

**Detection**: Coverage drop > 1% indicates Ghost Paths exist in deleted files

**Resolution**: Add direct unit-level assertions to integration tests to cover Ghost Paths

**Prevention**: Before deletion, check if lifecycle tests have explicit assertions covering all branches

---

## Estimated Effort

- **Time**: 1-2 hours to add coverage rows
- **New Lines**: 150-200 LOC added to executor.lifecycle.test.ts
- **Risk**: Low (only adding rows, not refactoring)
- **Confidence**: 90%+ that coverage will restore to >= 71.28%

---

## Status: Ready for Coverage Gap Closure

✅ Ghost Paths identified
✅ Root cause understood
✅ Solution designed
⏳ Ready to implement

**Next Action**: Extract critical test cases from executor-internals.test.ts and add to executor.lifecycle.test.ts

---

*Gold Standard Guardrail in effect: Coverage must stay >= 71.28%*
