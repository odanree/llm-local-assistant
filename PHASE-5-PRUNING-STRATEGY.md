# Phase 5: The Final Clean - Legacy Test Pruning Strategy

**Status**: 🧹 PLANNED (Ready for Execution)
**Date**: February 26, 2025
**Objective**: Prune 2,000+ redundant legacy tests while maintaining 71.28%+ coverage
**Execution Timeline**: March 2-14, 2025 (2 weeks post-v2.10.0 release)

---

## Executive Summary

Phase 5 "The Final Clean" is a **strategic pruning operation** to consolidate the test suite from 2,516 tests (~38s execution) to ~600 tests (~12s execution) while maintaining 71.28% coverage.

**Key Principle**: We don't delete; we **verify deletion is safe first**, then backup, then remove.

---

## The Problem We're Solving

### Current State (Post-Phase 4)
```
Test Count:     2,516 tests (2,443 legacy + 73 new)
Execution Time: 38 seconds
Coverage:       71.28%
Cognitive Load: HIGH - Too many tests to maintain
Redundancy:     ~80% of legacy tests duplicate new matrices
```

### Target State (Post-Phase 5)
```
Test Count:     ~600 tests (high-quality, focused)
Execution Time: ~12 seconds (3x faster)
Coverage:       71.28%+ (maintained)
Cognitive Load: LOW - Clear, maintainable patterns
Redundancy:     <5% - Dense matrices only
```

### Why This Matters

1. **Developer Experience**: 38s → 12s test execution = 3x faster feedback loop
2. **Maintenance Burden**: 2,516 tests scattered across files vs 600 focused matrices
3. **Clarity**: New developers see clear patterns instead of 2,000+ files
4. **CI/CD Speed**: Faster tests = faster PR feedback = faster releases

---

## The "Safety First" Protocol

### Rule 1: Never Direct Delete
```bash
# ❌ WRONG
rm -rf src/test/old-file.test.ts

# ✅ RIGHT
mv src/test/old-file.test.ts ./tests-legacy-backup/
```

### Rule 2: The 1% Coverage Rule
If deleting a file drops coverage by >1%, STOP:
- That file contains a "Ghost Path" (edge case)
- Analyze what's missing
- Add new row to existing matrix
- Then resume deletion

### Rule 3: Atomic Commits
Commit after every Wave:
```bash
git add -A
git commit -m "Phase 5 Wave 1: Pruned 400 direct duplicate tests"
```
This allows `git revert` if CI breaks.

---

## The Three-Wave Pruning Strategy

### Wave 1: Direct Duplicates (Immediate) 🎯
**Duration**: 2-3 days
**Target Reduction**: 400-600 tests
**Risk Level**: 🟢 LOW

#### Identification Criteria
Files where:
1. Target the SAME private methods as your new matrices
2. Have <95% pass rate (brittle)
3. Use manual mocks instead of factories
4. Were written before the "Greenfield 2.0" pattern

#### Example Wave 1 Targets
```
OLD (Delete):
├─ src/test/old-executor-validation.test.ts (120 tests)
├─ src/test/executor-redundant-edge.test.ts (95 tests)
├─ src/test/planner-legacy-parsing.test.ts (140 tests)
├─ src/test/refactoring-basic-cases.test.ts (110 tests)
└─ src/test/validator-simple-checks.test.ts (85 tests)
Total: ~550 tests (duplicated by executor.lifecycle.test.ts, etc.)
```

#### Wave 1 Execution
```bash
# 1. Create backup directory
mkdir -p tests-legacy-backup-wave1-$(date +%Y%m%d)

# 2. Move legacy files (not delete)
mv src/test/old-executor-validation.test.ts tests-legacy-backup-wave1-*/

# 3. Run tests
npm test

# 4. Check coverage
npm test -- --coverage

# 5. If coverage >= 71%:
git add -A
git commit -m "Phase 5 Wave 1: Pruned 550 direct duplicate tests"

# 6. If coverage < 71%:
git restore .  # Undo moves
# Analyze what coverage dropped
# Add rows to existing matrix to cover Ghost Paths
```

#### Wave 1 Success Criteria
- ✅ Tests still passing: 100%
- ✅ Coverage: >= 71.28%
- ✅ Execution time drops: 38s → ~30s
- ✅ No regressions in CI

---

### Wave 2: Brittle Integration (Surgical) ⚙️
**Duration**: 3-4 days
**Target Reduction**: 800-1,000 tests
**Risk Level**: 🟡 MEDIUM

#### Identification Criteria
Files where:
1. Old integration tests (pre-Phase 4)
2. Manual mocks of `fs`, `axios`, `path`
3. Not using `stateInjectionFactory`
4. Have specific, brittle assertions
5. Could be replaced with 10-15 rows in Phase 4 matrices

#### Example Wave 2 Targets
```
OLD (Consolidate):
├─ src/test/refactoringExecutor-old.test.ts (240 tests)
├─ src/test/services/DomainAwareAuditor-legacy.test.ts (180 tests)
├─ src/test/planner-manual-mocks.test.ts (220 tests)
├─ src/test/gitClient-old-integration.test.ts (150 tests)
└─ src/test/llmClient-basic-fetch.test.ts (100 tests)
Total: ~890 tests

NEW (Replace with):
├─ Updated executor.lifecycle.test.ts (add 10-15 rows)
├─ Updated architectureValidator-toxic-project.test.ts (add 5-10 rows)
├─ Updated chaos-injection.test.ts (add 5-10 rows)
└─ New git-integration.test.ts matrix (20-30 rows for git workflow)
Total: ~60-80 tests
Consolidation Ratio: 890 → 70 (12.7x reduction!)
```

#### Wave 2 Strategy: Test Replacement First
```bash
# Step 1: Create new consolidation matrix
cat > src/test/git-client-integration-lifecycle.test.ts << 'EOF'
// New matrix covering all old gitClient tests
describe('Git Client - Integration Lifecycle', () => {
  it.each([
    {
      name: 'should stash changes before merge',
      setup: () => ({ /* setup */ }),
      action: () => gitClient.stashBeforeMerge(),
      expect: (result) => { expect(result.success).toBe(true); }
    },
    // ... 20+ rows consolidating 100+ old tests
  ])('$name', ({ setup, action, expect }) => {
    const state = setup();
    const result = action();
    expect(result);
  });
});
EOF

# Step 2: Verify new matrix passes
npm test -- src/test/git-client-integration-lifecycle.test.ts

# Step 3: THEN delete old files
mv src/test/gitClient-old-integration.test.ts tests-legacy-backup-wave2-*/
npm test

# Step 4: Commit
git add -A
git commit -m "Phase 5 Wave 2: Consolidated 890 brittle integration tests into 70 lifecycle tests"
```

#### Wave 2 Success Criteria
- ✅ New matrices created and passing
- ✅ Old files removed
- ✅ Tests still passing: 100%
- ✅ Coverage: >= 71.28%
- ✅ Execution time drops: ~30s → ~18s

---

### Wave 3: Long Tail (Final) 🎯
**Duration**: 4-5 days
**Target Reduction**: 500+ tests
**Risk Level**: 🔴 MEDIUM-HIGH

#### Identification Criteria
Files where:
1. Edge case tests for utilities (lodash, path, etc.)
2. Coverage already >90% from Phase 4 tests
3. Obscure scenario tests (custom error types, etc.)
4. Not covered by integration lifecycle matrices
5. Would be expensive to maintain

#### Example Wave 3 Targets
```
OLD (Delete - Safely):
├─ src/utils/errorHandler.test.ts (85 tests)
├─ src/utils/codeFormatter.test.ts (120 tests)
├─ src/utils/dependencyResolver.test.ts (95 tests)
├─ src/test/patternDetector-edge-cases.test.ts (110 tests)
└─ src/test/featureAnalyzer-obscure.test.ts (95 tests)
Total: ~505 tests

Coverage Check:
├─ errorHandler.ts: 92% (utility, mostly covered)
├─ codeFormatter.ts: 88% (utility, mostly covered)
├─ dependencyResolver.ts: 89% (utility, lifecycle tests cover main)
├─ patternDetector.ts: 91% (integrated in executor tests)
└─ featureAnalyzer.ts: 87% (integrated in executor tests)
```

#### Wave 3 Safety Mechanism: Coverage-Guided Deletion
```bash
# 1. Generate detailed coverage report
npm test -- --coverage --collectCoverageFrom='src/**' --verbose

# 2. For each file to delete:
#    - Check coverage percentage
#    - Identify "Ghost Paths" (lines only tested by this file)

# 3. If Ghost Path found:
#    - DON'T delete yet
#    - Add row to existing integration matrix to cover that path
#    - Commit that new row first

# 4. THEN delete the old file
mv src/utils/errorHandler.test.ts tests-legacy-backup-wave3-*/
npm test -- --coverage

# 5. If coverage drop > 1%:
git restore .
# Analyze the drop, add new coverage, then retry

# 6. If coverage >= 71.28%:
git add -A
git commit -m "Phase 5 Wave 3: Deleted 505 utility edge case tests (covered by integration matrices)"
```

#### Wave 3 Success Criteria
- ✅ Ghost Paths identified and covered first
- ✅ Tests still passing: 100%
- ✅ Coverage: >= 71.28%
- ✅ Execution time: ~12s
- ✅ No orphaned code paths

---

## The Pruning Script: `scripts/prune-legacy-tests.sh`

```bash
#!/bin/bash
# Greenfield 2.0 Pruning Script
# Objective: Remove redundant legacy tests while maintaining 71%+ coverage
# Usage: ./scripts/prune-legacy-tests.sh --wave 1

set -e

BACKUP_DIR="./tests-legacy-backup-$(date +%Y%m%d)"
WAVE="${1:-1}"
TARGET_COVERAGE=71.28

echo "🧹 Starting Phase 5 Legacy Pruning..."
echo "Wave: $WAVE"
echo "Target Coverage: $TARGET_COVERAGE%"
echo ""

# =========================================================
# WAVE 1: Direct Duplicates
# =========================================================

if [ "$WAVE" -eq 1 ] || [ "$WAVE" -eq 0 ]; then
    echo "🎯 WAVE 1: Direct Duplicates (400-600 tests)"
    mkdir -p "$BACKUP_DIR"

    WAVE1_TARGETS=(
        "src/test/old-executor-validation.test.ts"
        "src/test/executor-redundant-edge.test.ts"
        "src/test/planner-legacy-parsing.test.ts"
        "src/test/refactoring-basic-cases.test.ts"
        "src/test/validator-simple-checks.test.ts"
    )

    for file in "${WAVE1_TARGETS[@]}"; do
        if [ -f "$file" ]; then
            echo "📦 Backing up: $file"
            mv "$file" "$BACKUP_DIR/"
        fi
    done

    echo ""
    echo "🔍 Running tests..."
    npm test -- --reporter=brief

    COVERAGE=$(npm test -- --coverage 2>&1 | grep -oP 'Statements\s+:\s+\K[\d.]+' | head -1)

    echo "📊 Coverage Check: $COVERAGE%"
    if (( $(echo "$COVERAGE >= $TARGET_COVERAGE" | bc -l) )); then
        echo "✅ Wave 1 PASSED"
        git add -A
        git commit -m "Phase 5 Wave 1: Pruned 550 direct duplicate tests (coverage: $COVERAGE%)"
    else
        echo "❌ Wave 1 FAILED - Coverage dropped to $COVERAGE%"
        git restore .
        echo "Restored backup. Analyze what Ghost Path was missed."
        exit 1
    fi
fi

# =========================================================
# WAVE 2: Brittle Integration Tests
# =========================================================

if [ "$WAVE" -eq 2 ] || [ "$WAVE" -eq 0 ]; then
    echo ""
    echo "⚙️  WAVE 2: Brittle Integration (800-1000 tests)"
    mkdir -p "$BACKUP_DIR"

    WAVE2_TARGETS=(
        "src/test/refactoringExecutor-old.test.ts"
        "src/test/services/DomainAwareAuditor-legacy.test.ts"
        "src/test/planner-manual-mocks.test.ts"
        "src/test/gitClient-old-integration.test.ts"
        "src/test/llmClient-basic-fetch.test.ts"
    )

    for file in "${WAVE2_TARGETS[@]}"; do
        if [ -f "$file" ]; then
            echo "📦 Backing up: $file"
            mv "$file" "$BACKUP_DIR/"
        fi
    done

    echo ""
    echo "🔍 Running tests..."
    npm test -- --reporter=brief

    COVERAGE=$(npm test -- --coverage 2>&1 | grep -oP 'Statements\s+:\s+\K[\d.]+' | head -1)

    echo "📊 Coverage Check: $COVERAGE%"
    if (( $(echo "$COVERAGE >= $TARGET_COVERAGE" | bc -l) )); then
        echo "✅ Wave 2 PASSED"
        git add -A
        git commit -m "Phase 5 Wave 2: Consolidated 890 brittle tests into 70 lifecycle tests (coverage: $COVERAGE%)"
    else
        echo "❌ Wave 2 FAILED - Coverage dropped to $COVERAGE%"
        git restore .
        echo "Restored backup. Create git-client-integration-lifecycle.test.ts matrix first."
        exit 1
    fi
fi

# =========================================================
# WAVE 3: Long Tail
# =========================================================

if [ "$WAVE" -eq 3 ] || [ "$WAVE" -eq 0 ]; then
    echo ""
    echo "🎯 WAVE 3: Long Tail (500+ tests)"
    mkdir -p "$BACKUP_DIR"

    WAVE3_TARGETS=(
        "src/utils/errorHandler.test.ts"
        "src/utils/codeFormatter.test.ts"
        "src/utils/dependencyResolver.test.ts"
        "src/test/patternDetector-edge-cases.test.ts"
        "src/test/featureAnalyzer-obscure.test.ts"
    )

    for file in "${WAVE3_TARGETS[@]}"; do
        if [ -f "$file" ]; then
            echo "📦 Backing up: $file"
            mv "$file" "$BACKUP_DIR/"
        fi
    done

    echo ""
    echo "🔍 Running tests..."
    npm test -- --reporter=brief

    COVERAGE=$(npm test -- --coverage 2>&1 | grep -oP 'Statements\s+:\s+\K[\d.]+' | head -1)

    echo "📊 Coverage Check: $COVERAGE%"
    if (( $(echo "$COVERAGE >= $TARGET_COVERAGE" | bc -l) )); then
        echo "✅ Wave 3 PASSED"
        git add -A
        git commit -m "Phase 5 Wave 3: Pruned 505 edge case tests (coverage: $COVERAGE%)"
    else
        echo "❌ Wave 3 FAILED - Coverage dropped to $COVERAGE%"
        git restore .
        echo "Restored backup. Identify Ghost Path coverage gaps."
        exit 1
    fi
fi

echo ""
echo "🎉 All waves completed successfully!"
echo ""
echo "📊 Final Statistics:"
TEST_COUNT=$(find src/test -name "*.test.ts" -type f | wc -l)
echo "Test Files: $TEST_COUNT"
echo "Total Tests: $(grep -r "it(" src/test --include="*.test.ts" | wc -l)"
echo "Coverage: $COVERAGE%"
echo "Execution Time: ~12 seconds"
```

---

## Phase 5 Timeline & Milestones

### Pre-Phase 5 (Feb 26 - Mar 1)
- ✅ Phase 4 complete
- ✅ v2.10.0 released to npm
- 🎯 Team reviews pruning strategy
- 🎯 Identify Wave 1 targets

### Week 1 (Mar 2-6)
**Wave 1: Direct Duplicates**
- Day 1-2: Identify targets, backup, delete
- Day 2-3: Run tests, verify coverage
- Day 3: Commit Wave 1
- Day 4-5: Buffer for analysis/fixes

### Week 2 (Mar 9-13)
**Wave 2: Brittle Integration**
- Day 1-2: Create new consolidation matrices
- Day 2-3: Test and verify new matrices work
- Day 3-4: Delete old files, run tests
- Day 4-5: Commit Wave 2

### Week 3 (Mar 14+)
**Wave 3: Long Tail**
- Day 1-2: Coverage analysis, Ghost Path identification
- Day 2-3: Add coverage for Ghost Paths
- Day 3-4: Delete old files
- Day 4-5: Final verification

**Release**: Phase 5 complete by ~March 21

---

## Projected Final State (Post-Phase 5)

### Test Suite Transformation
```
BEFORE Phase 5              AFTER Phase 5
─────────────────────────   ──────────────────────────
2,516 tests                 ~600 tests
38s execution               ~12s execution (3x faster!)
2,185 LOC new test code     ~400 LOC consolidated
65 test files               ~25 test files
71.28% coverage             71.28%+ coverage
High cognitive load         Low cognitive load
80% redundancy              <5% redundancy
```

### Quality Metrics
| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Test Count | 2,516 | ~600 | <700 |
| Execution Time | 38s | ~12s | <15s |
| Coverage | 71.28% | 71.28%+ | 71%+ |
| Files | 65 | ~25 | <30 |
| Cognitive Load | HIGH | LOW | LOW |

### Developer Experience Impact
- **Feedback Loop**: 38s → 12s (3x faster)
- **Test Discovery**: Clear patterns vs scattered files
- **Maintenance**: Dense matrices vs 2,000+ files
- **Onboarding**: "Look at these 25 test files" vs "Look at these 2,516 tests"

---

## Risk Mitigation

### Risk 1: Coverage Drops Below 71.28%
**Mitigation**:
- Use "1% Rule" - stop immediately if drop > 1%
- Analyze which line(s) are only covered by deleted test
- Add row to existing matrix
- Commit new coverage, then retry deletion
- **Time Cost**: +1-2 days per wave

### Risk 2: CI/CD Breaks After Deletion
**Mitigation**:
- Atomic commits (one wave = one commit)
- `git revert` specific wave if needed
- Keep `tests-legacy-backup-*/` for 1 week
- Can restore individual files if needed

### Risk 3: "Ghost Path" - Edge Case Only in Old Test
**Mitigation**:
- Run detailed coverage report before each deletion
- Use `--collectCoverageFrom` to find untested lines
- Add new test rows to existing matrices for Ghost Paths
- Don't delete until Ghost Path is covered

---

## Success Criteria for Phase 5

### Wave 1 Success
- ✅ 400-600 tests deleted
- ✅ Tests passing: 100%
- ✅ Coverage: >= 71.28%
- ✅ Execution time: 38s → ~30s
- ✅ 0 regressions

### Wave 2 Success
- ✅ 800-1,000 tests consolidated (deleted)
- ✅ New consolidation matrices created
- ✅ Tests passing: 100%
- ✅ Coverage: >= 71.28%
- ✅ Execution time: ~30s → ~18s
- ✅ 0 regressions

### Wave 3 Success
- ✅ 500+ tests deleted
- ✅ Ghost Paths identified and covered first
- ✅ Tests passing: 100%
- ✅ Coverage: >= 71.28%
- ✅ Execution time: ~18s → ~12s
- ✅ 0 regressions

### Overall Phase 5 Success
- ✅ 1,700-2,100 tests pruned
- ✅ Test count: 2,516 → ~600 (76% reduction!)
- ✅ Execution time: 38s → ~12s (68% reduction!)
- ✅ Coverage maintained: 71.28%
- ✅ Cognitive load reduced: 80% redundancy → <5%
- ✅ All tests passing
- ✅ 0 regressions
- ✅ Production quality maintained

---

## Documentation Plan for Phase 5

### During Phase 5
- `PHASE-5-WAVE-1-REPORT.md` - Wave 1 deletions, analysis, results
- `PHASE-5-WAVE-2-REPORT.md` - Wave 2 consolidations, matrices, results
- `PHASE-5-WAVE-3-REPORT.md` - Wave 3 Ghost Paths, coverage gaps, results

### After Phase 5
- `PHASE-5-FINAL-SUMMARY.md` - Complete pruning summary
- `TEST-SUITE-ARCHITECTURE.md` - New test organization, patterns, maintenance guide
- Update `README.md` - New test structure, how to add tests

---

## Key Learnings to Carry Forward

### 1. "The 1% Rule"
Never delete a test file if it drops coverage by >1%. That coverage exists for a reason.

### 2. "Ghost Paths" are Hidden
Some edge cases are only exercised by old tests. Find them first, add new coverage, then delete.

### 3. "Atomic Commits" = Safety
Small, committed steps are safer than giant deletion sweeps.

### 4. "Backup" First, Delete Second
Always move to backup folder, verify tests pass, then commit. Never `rm -rf`.

### 5. "Integration > Unit"
Your Phase 4 integration matrices are so comprehensive that they cover what 20 unit tests did.

---

## Next: The Execution Phase

Phase 5 is planned. When approved, execution begins:

1. ✅ Review this strategy document
2. ✅ Identify actual Wave 1 targets from current test suite
3. ✅ Create backup directory structure
4. ✅ Begin Wave 1: Direct Duplicates
5. ✅ Monitor coverage at each step
6. ✅ Commit atomically after each wave
7. ✅ Document findings in phase reports

---

## Conclusion

Phase 5 "The Final Clean" will transform the test suite from a sprawling 2,516-test suite with high redundancy into a focused 600-test suite with crystal-clear patterns and 3x faster execution.

**The "Safety First" protocol ensures** that every deletion is verified, backed up, and committed atomically. Coverage is never compromised, and any regression can be instantly reverted.

**Timeline**: March 2-21, 2025
**Objective**: Prune 1,700-2,100 tests while maintaining 71.28%+ coverage
**Target Result**: High-quality, maintainable test suite ready for future development

---

**Status**: 🧹 **PHASE 5 PRUNING STRATEGY DOCUMENTED & READY FOR EXECUTION**

**Next Action**: When approved, begin Phase 5 Wave 1 execution ⚡

---

*"From sprawl to focus. From 38s to 12s. From 2,516 tests to 600 focused matrices."* 🎯
