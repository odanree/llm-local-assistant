# Phase 2 Bulk Entry - Quick Reference Guide

**Use this guide during the 60-minute bulk entry phase**

---

## File Locations

**Target File**:
- `src/test/executor-validation-consolidated.test.ts` (currently 560 lines, 92 tests)

**Source Matrices**:
- `WAVE-1-PHASE-2-TEST-EXTRACTION-WORKBOOK.md` (all matrices organized by bucket)

**Current Status**:
- Phase 2.1 (65 tests from executor-internals): ✅ Already in file
- Phase 2.2-2.7 (150+ tests remaining): ⏳ Ready to add

---

## Matrix Count by Bucket

**BUCKET 1: Architecture & Layer Rules** (3 matrices, ~9 tests)
1. validateArchitectureRules - 4 tests
2. Multiple file references - 1 test
3. Error type categorization - 4 tests

**BUCKET 2: Code Quality & Patterns** (8 matrices, ~36 tests)
1. validateTypes - 7 tests
2. validateCommonPatterns - 6 tests
3. validateFormComponentPatterns - 6 tests
4. Path sanitization - 5 tests
5. Import path calculation - 3 tests
6. Type validation - 4 tests
7. Common pattern validation - 3 tests
8. Form component validation - 2 tests

**BUCKET 3: Auto-Fix & Error Recovery** (8 matrices, ~33 tests)
1. Directory walking - 3 tests
2. Retry logic - 3 tests
3. Hallucination detection - 3 tests
4. Pre-flight safety checks - 3 tests
5. Error detection & suggestions - 4 tests
6. Validation edge cases - 7 tests
7. Error handling integration - 3 tests
8. Execution error handling - 3 tests

**BUCKET 4: Execution & Lifecycle** (12 matrix groups, ~48 tests + explicit)
1. Constructor initialization - 3 tests
2. executePlan orchestration - 2 tests
3. executeStep action execution - 3 tests
4. Step action types - 5 tests
5. File operations (read) - 3 tests
6. File operations (write) - 2 tests
7. Command execution - 3 tests
8. File path types - 5 tests
9. Callback handlers - 5 tests
+ Explicit tests: Dependency management (11), Contract validation (6)

---

## Entry Workflow (60 min)

### Phase 1: Prepare (5 min)
1. Open `src/test/executor-validation-consolidated.test.ts` in editor
2. Open `WAVE-1-PHASE-2-TEST-EXTRACTION-WORKBOOK.md` in reference window
3. Identify sections by bucket (BUCKET 1, BUCKET 2, etc.)
4. Note: Each Matrix Set has copy-paste ready format

### Phase 2: Add Bucket 1 (5 min)
- Add validateArchitectureRules matrix (4 test rows)
- Add Multiple file references matrix (1 test row)
- Add Error type categorization matrix (4 test rows)
- Total: 3 describe blocks, ~9 test cases

### Phase 3: Add Bucket 2 (10 min)
- Add validateTypes matrix (7 test rows)
- Add validateCommonPatterns matrix (6 test rows)
- Add validateFormComponentPatterns matrix (6 test rows)
- Add Path sanitization matrix (5 test rows)
- Add Import path calculation matrix (3 test rows)
- Add Type validation matrix (4 test rows)
- Add Common pattern validation matrix (3 test rows)
- Add Form component validation matrix (2 test rows)
- Total: 8 describe blocks, ~36 test cases

### Phase 4: Add Bucket 3 (10 min)
- Add Directory walking matrix (3 test rows)
- Add Retry logic matrix (3 test rows)
- Add Hallucination detection matrix (3 test rows)
- Add Pre-flight safety checks matrix (3 test rows)
- Add Error detection & suggestions matrix (4 test rows)
- Add Validation edge cases matrix (7 test rows)
- Add Error handling integration matrix (3 test rows)
- Add Execution error handling matrix (3 test rows)
- Total: 8 describe blocks, ~33 test cases

### Phase 5: Add Bucket 4 (20 min)
**Parameterized Matrices**:
- Add Constructor initialization matrix (3 test rows)
- Add executePlan orchestration matrix (2 test rows)
- Add executeStep action execution matrix (3 test rows)
- Add Step action types matrix (5 test rows)
- Add File operations (read) matrix (3 test rows)
- Add File operations (write) matrix (2 test rows)
- Add Command execution matrix (3 test rows)
- Add File path types matrix (5 test rows)
- Add Callback handlers matrix (5 test rows)

**Explicit Tests** (keep simple it() blocks):
- Add Dependency management tests (11 explicit tests)
- Add Contract validation tests (6 explicit tests)

- Total: 9 describe blocks + 2 describe blocks for explicit tests, ~48 + 17 test cases

### Phase 6: Verify & Test (10 min)
```bash
# Run consolidated test file
npm test -- src/test/executor-validation-consolidated.test.ts

# Check coverage
npm test -- src/test/executor-validation-consolidated.test.ts --coverage

# Verify:
✅ All tests passing (should be 180-190 total)
✅ Coverage >= 71.28%
✅ No TypeScript errors
```

---

## Common Patterns

### Parameterized Matrix Template
```typescript
describe('New Test Block', () => {
  it.each([
    { name: 'case 1', param1: 'value1', expected: 'result1' },
    { name: 'case 2', param1: 'value2', expected: 'result2' },
    // ... more rows
  ])('description: $name', ({ param1, expected }) => {
    // Test logic
    expect(result).toBe(expected);
  });
});
```

### Key Variables to Use
- `name` or `description`: Human readable test identifier
- `content` or `code`: Code snippet being tested
- `path`: File path being tested
- `shouldError` or `shouldWarn`: Boolean expected
- `expected` or `expectedValue`: Expected output
- `pattern` or `regex`: Regex pattern to match

### Test Organization
1. Each bucket has multiple describe blocks
2. Each describe block has 1 it.each() with multiple rows
3. Some complex tests stay as explicit it() blocks (keep as-is)
4. Group related tests together within same describe block

---

## Critical Checkpoints

### Checkpoint 1: After Adding Bucket 1 (5 min mark)
```bash
npm test -- executor-validation-consolidated.test.ts
```
- Should have ~101 tests (92 existing + 9 new)
- Coverage should hold at ~71.17%

### Checkpoint 2: After Adding Bucket 2 (15 min mark)
```bash
npm test -- executor-validation-consolidated.test.ts
```
- Should have ~137 tests (92 existing + 9 bucket1 + 36 bucket2)
- Coverage should improve slightly

### Checkpoint 3: After Adding Bucket 3 (25 min mark)
```bash
npm test -- executor-validation-consolidated.test.ts
```
- Should have ~170 tests
- Coverage should be at/above 71.20%

### Checkpoint 4: After Adding Bucket 4 (45 min mark)
```bash
npm test -- executor-validation-consolidated.test.ts --coverage
```
- Should have ~180-190 tests
- **Coverage MUST be >= 71.28%** ← CRITICAL GO/NO-GO

### Final Verification (60 min mark)
```bash
# Full coverage report
npm test -- --coverage executor-validation-consolidated.test.ts

# Check full test suite too
npm test
```

---

## Troubleshooting Quick Fixes

### If Tests Fail
1. Check TypeScript compilation: `npm run type-check`
2. Verify matrix parameter names match it() template variables
3. Check for missing imports
4. Verify test logic functions (expect statements)

### If Coverage Drops Below 71.20%
1. Identify which test matrix caused drop
2. Check if test is actually executing code paths
3. May need to adjust test inputs to hit more branches
4. Add specific scenario if Ghost Path detected

### If Total Test Count Wrong
1. Verify each matrix was added
2. Check matrix row count matches workbook
3. Look for duplicates (matrix may have been added twice)
4. Verify describe/it structure is correct

---

## File Structure Template

The file should have this structure after completion:

```typescript
describe('Executor - Validation Consolidated (Phase 2 Complete)', () => {
  // Phase 2.1 Tests (existing - keep as-is)
  describe('BUCKET 2: Code Quality - generateCode Patterns', () => {
    // 11 tests from executor-internals
  });

  // Phase 2.2-2.7 New Tests (add these)

  // BUCKET 1: Architecture & Layer Rules
  describe('validateArchitectureRules', () {
    it.each([...]) // Add matrix
  });

  describe('Multiple File References', () {
    it.each([...]) // Add matrix
  });

  describe('Error Type Categorization', () {
    it.each([...]) // Add matrix
  });

  // BUCKET 2: Code Quality & Patterns
  // ... (8 more describe blocks with it.each matrices)

  // BUCKET 3: Auto-Fix & Error Recovery
  // ... (8 more describe blocks with it.each matrices)

  // BUCKET 4: Execution & Lifecycle
  // ... (9 describe blocks with it.each matrices)
  // ... (2 describe blocks with explicit it() tests)
});
```

---

## Expected Results After Completion

| Metric | Current | Target | After Entry |
|--------|---------|--------|------------|
| Test Files | 66 | 66 | 66 |
| Total Tests | 2,612 | 2,800+ | 2,750+ |
| Consolidated File Tests | 92 | 180-190 | 180-190 |
| Consolidated File LOC | 560 | 1,200-1,400 | 1,200-1,400 |
| Coverage | 71.17% | >= 71.28% | >= 71.28% |
| executor.ts coverage | 47% (est.) | >= 48% | >= 48% |
| Pass Rate | 100% | 100% | 100% |

---

## Go/No-Go Decision Framework

After Phase 2 Bulk Entry Complete:

✅ **GO**:
- Coverage >= 71.28%
- All tests passing (100%)
- Consolidated file properly structured
- Next: Ready for Wave 1 deletion (Mar 2-6)

⚠️ **HOLD**:
- Coverage 71.20-71.27%
- Add 2-3 missing edge case tests
- Re-run coverage check
- Then proceed

❌ **NO-GO**:
- Coverage < 71.20%
- Investigate Ghost Paths
- May need restructuring
- Contact user for guidance

---

## Timer Reference

```
0:00  ├─ Preparation (5 min)
      ├─ BUCKET 1 Entry (5 min) → Checkpoint 1 at 5:00
      ├─ BUCKET 2 Entry (10 min) → Checkpoint 2 at 15:00
      ├─ BUCKET 3 Entry (10 min) → Checkpoint 3 at 25:00
      ├─ BUCKET 4 Entry (20 min) → Checkpoint 4 at 45:00
      ├─ Coverage Verification (10 min) → Final Check at 55:00
1:00  └─ Complete! Assess go/no-go
```

---

## Quick Copy-Paste Checklist

- [ ] Bucket 1 matrices (3 groups, 9 tests)
- [ ] Bucket 2 matrices (8 groups, 36 tests)
- [ ] Bucket 3 matrices (8 groups, 33 tests)
- [ ] Bucket 4 parameterized matrices (9 groups, 30 tests)
- [ ] Bucket 4 explicit tests (2 groups, 17 tests)
- [ ] Checkpoint 1 passed (101 tests, coverage ~71.17%)
- [ ] Checkpoint 2 passed (137 tests, coverage ~71.18%)
- [ ] Checkpoint 3 passed (170 tests, coverage ~71.22%)
- [ ] Checkpoint 4 passed (180-190 tests, coverage >= 71.28%)
- [ ] All tests passing (100%)
- [ ] Coverage >= 71.28% ✅
- [ ] Ready for Wave 1 deletion

---

**Phase 2 Bulk Entry Ready to Execute**

Use this guide as reference during the 60-minute consolidation sprint. All matrices are ready in WAVE-1-PHASE-2-TEST-EXTRACTION-WORKBOOK.md

*"Copy, paste, verify. Systematic consolidation at scale."* ⚡

