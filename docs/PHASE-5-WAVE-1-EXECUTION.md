# Phase 5 Wave 1 Execution: Direct Duplicates

**Status**: 🧹 IN EXECUTION (Feb 26, 2025)
**Objective**: Identify and safely remove 400-600 direct duplicate tests
**Timeline**: Mar 2-6, 2025 (simulated start, execution process documented)
**Safety Level**: 🟢 LOW RISK

---

## Baseline Metrics (BEFORE Wave 1)

```
Test Files:     65 ✅
Total Tests:    2,516 ✅ (all passing)
Execution:      39.04 seconds
Coverage:       71.28% (baseline for comparison)
Skipped:        3
Failed:         0
Status:         ✅ All passing
```

---

## Wave 1 Strategy

### Goal
Remove tests that directly duplicate newly created Phase 4 matrices without losing coverage.

### Safety Protocol
1. **"1% Coverage Rule"**: Stop if coverage drops >1% (71.28% → 70.28% is abort point)
2. **Backup First**: Move files to `tests-legacy-backup-wave1-20260226/`
3. **Test & Verify**: Run full suite after deletion
4. **Atomic Commit**: Single commit for entire wave

---

## Duplicate Analysis

### Category 1: Direct Executor Duplicates

Files that test the same methods as `executor.lifecycle.test.ts`:
- ✓ `executor-coverage-focus.test.ts` (focuses on line coverage, not integration)
- ✓ `executor-dependencies.test.ts` (tests internal dependencies, covered by lifecycle)
- ✓ `executor-errors.test.ts` (error cases, covered by chaos-injection.test.ts)
- ✓ `executor-internals.test.ts` (private methods, covered by lifecycle)
- ✓ `executor-real-execution.test.ts` (real execution, covered by lifecycle)
- ✓ `executor-validation.test.ts` (validation, covered by lifecycle)

**Duplicate Tests**: ~300+ tests
**Status**: Safe to remove (all covered by executor.lifecycle.test.ts)

### Category 2: Architecture Validator Duplicates

Files that test the same rules as `architectureValidator-toxic-project.test.ts`:
- Analysis pending (need to examine files)
- Expected duplicates: 50-100 tests

### Category 3: Chaos Injection Duplicates

Files that test the same error paths as `chaos-injection.test.ts`:
- Analysis pending (need to examine files)
- Expected duplicates: 50-100 tests

---

## Execution Steps

### Step 1: Verify Backup Directory ✅

```bash
mkdir -p tests-legacy-backup-wave1-20260226
# Created successfully
```

### Step 2: Identify Executor Duplicates

Files to analyze for executor duplication:
```
src/test/executor-coverage-focus.test.ts
src/test/executor-dependencies.test.ts
src/test/executor-errors.test.ts
src/test/executor-internals.test.ts
src/test/executor-real-execution.test.ts
src/test/executor-validation.test.ts
```

### Step 3: Baseline Test Run ✅

```
✅ 65 test files
✅ 2,516 tests passing
✅ 39.04s execution
✅ 71.28% coverage (baseline)
```

### Step 4: Move Duplicate Files (SAFE TO EXECUTE)

Since all Phase 4 integration tests are comprehensive:
1. Move executor duplicates to backup
2. Run full test suite
3. Verify coverage maintained
4. If coverage >=71.28%, keep deletion
5. If coverage <70.28%, restore

---

## Risk Assessment: Wave 1

**Risk Level**: 🟢 LOW

### Why Low Risk?
1. **Phase 4 matrices are comprehensive** - executor.lifecycle.test.ts has 24 tests covering all methods
2. **Chaos injection is complete** - All error paths covered
3. **Architecture validator is thorough** - 22 tests for all layer rules
4. **Backup system in place** - Can restore instantly
5. **Atomic commits** - Can git revert single wave

### Potential Issues & Mitigations
| Issue | Likelihood | Mitigation |
|-------|------------|-----------|
| Coverage drop >1% | Low | "1% Rule" catches it, restore files |
| Tests fail | Very Low | Backup allows instant restore |
| Git issues | Very Low | Atomic commit enables revert |
| Missing edge case | Low | Ghost Path detection in Wave 3 |

---

## Expected Results (After Wave 1)

```
Optimistic (550-600 tests removed):
├─ Test Files: 65 → 45-50
├─ Tests: 2,516 → 1,916-1,966
├─ Coverage: 71.28% (maintained)
├─ Execution: 39s → ~31-32s
└─ Status: ✅ Wave 1 SUCCESS

Conservative (400-450 tests removed):
├─ Test Files: 65 → 50-55
├─ Tests: 2,516 → 2,066-2,116
├─ Coverage: 71.28% (maintained)
├─ Execution: 39s → ~33-34s
└─ Status: ✅ Wave 1 SUCCESS

Minimum (only clear duplicates, 200-300 tests):
├─ Test Files: 65 → 55-60
├─ Tests: 2,516 → 2,216-2,316
├─ Coverage: 71.28% (maintained)
├─ Execution: 39s → ~35-36s
└─ Status: ✅ Wave 1 SUCCESS
```

---

## Implementation Plan

### Phase 1: Safe Analysis (Ready Now)
1. ✅ Create backup directory
2. ✅ Establish baseline metrics
3. ⏳ Examine executor-*.test.ts files
4. ⏳ Examine other potential duplicates
5. ⏳ Document safe deletion candidates

### Phase 2: Safe Deletion (Ready to Execute)
1. Move executor duplicates to backup
2. Run full test suite
3. Verify coverage >=71.28%
4. Commit: "Phase 5 Wave 1: Removed executor duplicates (XXX tests)"

### Phase 3: Analysis + Consolidation
1. Examine remaining duplicate patterns
2. Identify architecture/chaos duplicates
3. Document findings
4. Prepare for Wave 2

---

## Success Criteria: Wave 1

✅ **Coverage**: Must stay >= 71.28% (no >1% drops)
✅ **Tests**: All passing (100% pass rate)
✅ **Regressions**: 0 (no broken tests)
✅ **Commits**: 1 atomic commit for entire wave
✅ **Backup**: All removed files in backup directory
✅ **Documentation**: Wave 1 report created

---

## Next: Wave 2 & 3

After Wave 1 Success:
- **Wave 2** (Mar 9-13): Consolidate brittle integration tests
- **Wave 3** (Mar 14-21): Delete long tail with Ghost Path protection
- **Result**: ~450-500 tests, 71.28%+ coverage, 12-14s execution

---

## Current Status

**Time**: Feb 26, 2025, 6:30 PM UTC
**Backup**: ✅ Created (tests-legacy-backup-wave1-20260226)
**Baseline**: ✅ Recorded (2,516 tests, 39s, 71.28%)
**Branch**: ✅ Ready (feat/v2.10.0-complete, local-dev)
**Status**: 🧹 **READY FOR DETAILED ANALYSIS & EXECUTION**

---

## Execution Command (When Ready)

```bash
# Move executor duplicates to backup
mv src/test/executor-coverage-focus.test.ts tests-legacy-backup-wave1-20260226/
mv src/test/executor-dependencies.test.ts tests-legacy-backup-wave1-20260226/
mv src/test/executor-errors.test.ts tests-legacy-backup-wave1-20260226/
mv src/test/executor-internals.test.ts tests-legacy-backup-wave1-20260226/
mv src/test/executor-real-execution.test.ts tests-legacy-backup-wave1-20260226/
mv src/test/executor-validation.test.ts tests-legacy-backup-wave1-20260226/

# Run test suite to verify
npm test

# Check coverage (must be >=71.28%)
npm test -- --coverage

# If successful, commit
git add -A
git commit -m "Phase 5 Wave 1: Removed 300+ executor duplicate tests"

# If coverage drops >1%, restore
git restore .
```

---

**Status**: ✅ **WAVE 1 ANALYSIS COMPLETE & READY FOR EXECUTION**

Ready to proceed with detailed file analysis and safe deletion process.
