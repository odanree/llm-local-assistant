# The Great Inhale: Strategic Extraction Guide

**Purpose**: Extract 240+ remaining test cases from 5 executor-*.test.ts files into bucketed consolidated matrix.

**Timeline**: 2-hour sprint using efficient "Data-Only" extraction workflow

---

## Files to Extract & Test Counts

### Already Extracted ✅
- **executor-internals.test.ts**: 65 rows → executor-validation-consolidated.test.ts

### To Extract (Priority Order)
1. **executor-errors.test.ts** (~40-50 rows)
   - Location: attemptAutoFix - Directory Walking
   - Location: Error Type Categorization
   - Location: Error Detection and Suggestions

2. **executor-coverage-focus.test.ts** (~30-40 rows)
   - Focus: Line coverage edge cases
   - Pattern: Coverage-targeted scenarios

3. **executor-validation.test.ts** (~40-50 rows)
   - Focus: Validation-specific paths
   - Pattern: Rule enforcement edge cases

4. **executor-dependencies.test.ts** (~40-50 rows)
   - Focus: Dependency pattern testing
   - Pattern: Module resolution scenarios

5. **executor-real-execution.test.ts** (~40-50 rows)
   - Focus: Real execution (non-mocked) paths
   - Pattern: File system interaction scenarios

6. **executor-execution.test.ts** (~20-30 rows)
   - Focus: Execution orchestration
   - Pattern: Multi-step execution scenarios

**Total Remaining**: ~210-250 test cases

---

## Bucket Structure (Proposed)

```
executor-validation-consolidated.test.ts
├── BUCKET 1: Architecture & Layer Rules (~80 rows)
│   ├ validateArchitectureRules()
│   └ Extracted from: executor-internals, executor-validation
│
├── BUCKET 2: Code Quality & Patterns (~100 rows)
│   ├ validateGeneratedCode()
│   └ Extracted from: executor-internals, executor-coverage-focus
│
├── BUCKET 3: Auto-Fix & Error Recovery (~70 rows)
│   ├ attemptAutoFix()
│   └ Extracted from: executor-errors, executor-real-execution
│
├── BUCKET 4: Execution & Lifecycle (~40 rows)
│   ├ Full execution workflows
│   └ Extracted from: executor-execution, executor-dependencies
│
└── BUCKET 5: Complex Integration (Hold for lifecycle.test.ts)
    └ Scenarios requiring git state or network mocks
```

---

## 2-Hour Sprint Workflow

### Phase 1: Data-Only Extraction (40 min)
**Goal**: Copy input snippets and expected results - NO implementation yet

For each legacy test file:
1. Open file in read mode
2. Extract ONLY:
   - Input code snippet (the test data)
   - Expected error/result string
   - Scenario description
3. Paste into scratch document
4. **Skip**: All setup/teardown code, mock configuration

### Phase 2: Bulk Row Entry (60 min)
**Goal**: Enter extracted data into matrix rows

For each bucket:
1. Copy data rows from scratch document
2. Paste into it.each([]) array
3. Minimal formatting - just get data in
4. At 50-row intervals: Run coverage pulse check

### Phase 3: Coverage Pulse & Verification (20 min)
**Goal**: Verify consolidation preserves coverage

```bash
# After every 50 rows added:
npm test -- src/test/executor-validation-consolidated.test.ts --coverage

# Critical metric: executor.ts coverage
# Target: >= 71.28%
# Current: 71.17%
```

---

## Data Extraction Template

For each test case found, extract ONLY:

```typescript
// BUCKET [N]: [CATEGORY]
{
  scenario: 'descriptive name of test case',
  input: 'code snippet or test data',
  expected: 'expected result or error type',
  category: 'validation|error-recovery|architecture|execution',
  source: 'executor-[filename].test.ts',
}
```

Example from executor-errors.test.ts:
```typescript
{
  scenario: 'walk up one level for missing file (ENOENT)',
  input: '../nonexistent.ts',
  expected: 'executeStep completes without throwing',
  category: 'error-recovery',
  source: 'executor-errors.test.ts',
}
```

---

## Ghost Path Detection Log

If you encounter a test that is TOO COMPLEX for matrix:
- **Pattern**: Requires git state, network mocks, file system setup
- **Action**: Label as "Complex Integration"
- **Move to**: executor.lifecycle.test.ts (instead of consolidation)
- **Log**: Document in COMPLEX_INTEGRATION_CASES section

Example:
```typescript
// COMPLEX_INTEGRATION_CASES (Not suitable for consolidated matrix)
// Reason: Requires actual git repo state and file system operations
// File: executor-real-execution.test.ts, Line 250
// Test: "should execute git diff and parse output correctly"
// Action: Keep in executor.lifecycle.test.ts or executor-real-execution.test.ts
```

---

## Success Criteria

✅ After Phase 2 Complete:
- [ ] executor-errors.test.ts: 40-50 rows consolidated
- [ ] executor-coverage-focus.test.ts: 30-40 rows consolidated
- [ ] executor-validation.test.ts: 40-50 rows consolidated
- [ ] executor-dependencies.test.ts: 40-50 rows consolidated
- [ ] executor-real-execution.test.ts: 40-50 rows consolidated
- [ ] executor-execution.test.ts: 20-30 rows consolidated
- [ ] **Total**: 210-250 rows added (65 + 210-250 = 275-315 total)
- [ ] Coverage: >= 71.28%
- [ ] All tests passing
- [ ] executor.ts coverage >= 48.5%

---

## Coverage Pulse Checkpoints

Run these checks at strategic intervals:

```bash
# After every 50 rows added:
npm test -- --coverage 2>&1 | grep "All files"

# Target progression:
# Row 50:  71.17% → 71.20% (slight gain expected)
# Row 100: 71.20% → 71.25% (approaching threshold)
# Row 150: 71.25% → 71.28%+ (target achieved!)
# Row 200: 71.28% → 71.30%+ (safety margin)
```

---

## If Coverage Drops

**Scenario**: Coverage falls below 71.28% during extraction

**Action**:
1. Stop extraction at current row count
2. Identify which rows caused drop (binary search)
3. Those rows represent **Ghost Paths** - code not covered by lifecycle tests
4. Move Ghost Path rows to executor.lifecycle.test.ts integration tests
5. Resume consolidation with remaining rows

**Result**: Wave 1 safe to execute with identified missing coverage

---

## Expected Output Timeline

```
Start (Now):        275 tests in executor-validation-consolidated.test.ts
After Phase 1 (40 min):     Scratch document with 210-250 extracted rows
After Phase 2 (60 min):     executor-validation-consolidated.test.ts with all rows
After Phase 3 (20 min):     Coverage verified >= 71.28%
Total Time:                 2 hours for complete extraction & verification
```

---

## Ready to Execute?

When 275-315 tests are consolidated and coverage is >= 71.28%:

✅ Wave 1 execution can proceed (Mar 2-6)
✅ Delete 6 executor-*.test.ts files
✅ All test cases preserved in consolidated matrix
✅ Coverage maintained
✅ Atomic commit

---

**Status**: 🎯 **EXTRACTION WORKFLOW READY**

Ready to begin 2-hour sprint on remaining 5 executor-*.test.ts files.
