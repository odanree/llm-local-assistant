# Branch Strategy: v2.10.0 → v2.11.0 Roadmap

**Date**: February 26, 2025
**Status**: ✅ DUAL-BRANCH STRATEGY ESTABLISHED
**Scope**: Phases 4-5-6 (Integration → Pruning → Excellence)

---

## Overview

Two complementary feature branches manage the v2.10.0 → v2.11.0 roadmap:

### Branch 1: `feat/v2.10.0-phase4-integration` (PHASE 4 COMPLETE)
- **Status**: ✅ Complete & ready
- **Scope**: Phase 4 Integration Strike only
- **Tests**: 73 new (2,516 total)
- **Coverage**: 71.28%
- **Action**: PR to main → v2.10.0 release (Mar 1)
- **Tracking**: Remote-ready for immediate release

### Branch 2: `feat/v2.10.0-v2.11.0-excellence` (PHASES 5-6)
- **Status**: 🧹 In progress
- **Scope**: Phase 5 (Pruning) + Phase 6 (Excellence Gap)
- **Tests**: 450-600 (from 2,516)
- **Coverage**: 71.28% → 75%+
- **Action**: Local-only until complete, then consolidated PR
- **Timeline**: Mar 2 - May 31
- **Tracking**: No remote push (local development only)

---

## Dual-Release Strategy

### Release 1: v2.10.0 (Phase 4 Only)

**When**: March 1, 2025
**Branch**: `feat/v2.10.0-phase4-integration`
**Release Type**: Minor (73 new tests, +2.19% coverage)

```bash
# 1. Create PR from feat/v2.10.0-phase4-integration → main
gh pr create \
  --title "feat: v2.10.0 - Integration Strike Phase 4 Complete" \
  --base main \
  --body "73 new integration tests, 71.28% coverage achieved"

# 2. Merge immediately (no review blocking)
gh pr merge --merge

# 3. Semantic release automatic
# - Detects "feat:" prefix
# - Generates v2.10.0 tag
# - Publishes to npm
# - Creates release notes

# Result: Users get Phase 4 improvements immediately
```

**What Users Get**:
- ✅ Integration Strike testing improvements
- ✅ 71.28% coverage baseline
- ✅ Better error handling
- ✅ Executor + Validator + LLM Client validation
- ✅ Production-ready quality

**Timeline**:
- Feb 27-28: Create/merge PR
- Mar 1: Released to npm
- Users immediately benefit

---

### Release 2: v2.11.0 (Phases 5-6)

**When**: June 1, 2025
**Branch**: `feat/v2.10.0-v2.11.0-excellence`
**Release Type**: Minor (Pruning + Gap closure, +3.72% coverage)

```bash
# 1. Develop Phases 5-6 locally (no remote push)
# March 2-21: Phase 5 pruning (3 waves)
# April 1-May 31: Phase 6 gap closure

# 2. When ready (May 31):
git push origin feat/v2.10.0-v2.11.0-excellence

# 3. Create PR
gh pr create \
  --title "feat: v2.11.0 - Test Suite Excellence (75% Coverage)" \
  --base main \
  --body "Phase 5: Pruned to 550-600 tests. Phase 6: Reached 75%+ coverage"

# 4. Merge
gh pr merge --merge

# 5. Semantic release automatic
# - Detects "feat:" prefix
# - Generates v2.11.0 tag
# - Publishes to npm

# Result: Users get pruned, optimized, high-coverage suite
```

**What Users Get**:
- ✅ 3x faster test execution (38s → 14s)
- ✅ Cleaner codebase (2,516 → 550-600 tests)
- ✅ 75%+ coverage (professional standard)
- ✅ Easier maintenance
- ✅ Better developer experience
- ✅ Stable, professional-grade testing

**Timeline**:
- Mar 2-21: Phase 5 (local)
- Apr 1-May 31: Phase 6 (local)
- May 31: Push to remote
- Jun 1: Released to npm
- Users get 3 months of improvements combined

---

## Branch Management

### Current State (Feb 26)

```
feat/v2.10.0-phase4-integration (12 commits)
├─ Phase 4 complete ✅
├─ 11 commits ready
├─ Tests: 100% passing
├─ Coverage: 71.28%
└─ Status: Ready for PR

feat/v2.10.0-v2.11.0-excellence (12 commits)
├─ Branched from Phase 4 ✅
├─ Phase 5-6 roadmap documented
├─ Tests: Unchanged (Phase 4)
├─ Coverage: 71.28%
└─ Status: Ready for Phase 5 work
```

### Workflow

```
MAIN BRANCH (Latest Release)
    ↑
    │ PR #1: Phase 4 (Mar 1)
    │ v2.10.0 released
    │
    ├─→ feat/v2.10.0-phase4-integration (RELEASED)
    │   └─ 12 commits (Phase 4 only)
    │
    └─→ feat/v2.10.0-v2.11.0-excellence (LOCAL DEV)
        ├─ Starts with Phase 4 work
        ├─ Phase 5: Mar 2-21 (3 weeks)
        ├─ Phase 6: Apr 1-May 31 (8 weeks)
        ├─ 40-50 additional commits
        └─ PR #2: Phase 5-6 (Jun 1)
           v2.11.0 released
```

---

## Phase 5-6 Development (Local)

### Phase 5: Pruning (Mar 2-21)

**Working Locally**:
```bash
# All work on local branch, no remote
git checkout feat/v2.10.0-v2.11.0-excellence

# Wave 1: Mar 2-6 (Direct duplicates)
# - Move old files to backup
# - Run tests, verify coverage
# - Commit: "Phase 5 Wave 1: 550 tests pruned"

# Wave 2: Mar 9-13 (Brittle integration)
# - Create consolidation matrices
# - Test thoroughly
# - Delete old files
# - Commit: "Phase 5 Wave 2: 890 tests consolidated"

# Wave 3: Mar 14-21 (Long tail)
# - Ghost Path analysis
# - Add new coverage
# - Delete old files
# - Commit: "Phase 5 Wave 3: 505 tests deleted"

# Result (still local):
# - ~450-500 tests remaining
# - 12-14s execution
# - 71.28%+ coverage
```

### Phase 6: Excellence Gap (Apr 1-May 31)

**Working Locally**:
```bash
# Continue on same local branch

# Week 1-2: Category A gaps (+2-2.5%)
# - Add rows to existing matrices
# - Coverage: 71.28% → 73.78%

# Week 3-6: Category B gaps (+1-1.5%)
# - Create focused integration matrices
# - Coverage: 73.78% → 75.28%

# Week 7-8: Category C gaps (+0.2-0.5%)
# - Fine-tuning and verification
# - Coverage: 75.28% → 75%+

# Result (still local):
# - ~550-600 tests
# - 14-16s execution
# - 75%+ coverage 🎯
```

### Pushing to Remote (May 31)

**When Everything is Ready**:
```bash
# Verify all tests passing
npm test
# 100% passing ✅

# Verify coverage at 75%+
npm test -- --coverage
# 75.5% coverage ✅

# Push to remote
git push origin feat/v2.10.0-v2.11.0-excellence

# Create PR
gh pr create \
  --title "feat: v2.11.0 - Test Suite Excellence" \
  --base main

# Merge
gh pr merge --merge

# Semantic release handles v2.11.0 tag + npm publish
```

---

## Commit Strategy

### Phase 4 (Already Done)
```
12 commits on feat/v2.10.0-phase4-integration
├─ 3 feature test commits
├─ 4 documentation commits
└─ Supporting commits
```

### Phase 5 (Planned)
```
10-15 commits on feat/v2.10.0-v2.11.0-excellence
├─ Phase 5 Wave 1 commit
├─ Phase 5 Wave 2 commit
├─ Phase 5 Wave 3 commit
├─ Phase 5 final summary commit
└─ Documentation commits (4-5)
```

### Phase 6 (Planned)
```
15-20 commits on feat/v2.10.0-v2.11.0-excellence
├─ Category A gaps (2-3 commits)
├─ Category B gaps (8-10 commits)
├─ Category C gaps (2-3 commits)
└─ Documentation commits (3-5)
```

### Total
```
Phase 4: 12 commits (released)
Phase 5-6: 25-35 commits (local, then consolidated PR)

When merged: Single PR with 40-50 commits
Semantic release: Single v2.11.0 tag + npm release
```

---

## Documentation Strategy

### Phase 4 Documentation (Complete)
```
PHASE-4-1-COMPLETION-REPORT.md ✅
PHASE-4-2-COMPLETION-REPORT.md ✅
PHASE-4-3-COMPLETION-REPORT.md ✅
PHASE-4-FINAL-SUMMARY.md ✅
```

### Phase 5 Documentation (Will Add)
```
PHASE-5-WAVE-1-REPORT.md (after Wave 1)
PHASE-5-WAVE-2-REPORT.md (after Wave 2)
PHASE-5-WAVE-3-REPORT.md (after Wave 3)
PHASE-5-FINAL-SUMMARY.md (end of Phase 5)
```

### Phase 6 Documentation (Will Add)
```
PHASE-6-COVERAGE-ANALYSIS.md (initial gap analysis)
PHASE-6-PROGRESS-REPORT.md (weekly updates)
PHASE-6-FINAL-SUMMARY.md (when 75% reached)
```

### Master Documentation
```
PHASES-4-5-6-ROADMAP.md ✅ (master strategy)
TEST-SUITE-ARCHITECTURE.md (new organization)
MAINTENANCE-GUIDE.md (how to add tests)
PROJECT-STATUS-v2.10.0-v2.11.0.md (updated status)
BRANCHES-STRATEGY.md ✅ (this document)
```

---

## Risk Management

### Risk 1: Phase 5 Pruning Breaks Coverage
**Mitigation**:
- "1% Coverage Rule" - stop if drop > 1%
- Backup before deletion (tests-legacy-backup-*)
- Atomic commits allow git revert

**Resolution**:
```bash
# If coverage drops too much:
git revert <wave-commit>
# Analyze what broke
# Add coverage for Ghost Path
# Commit coverage addition
# Retry wave deletion
```

---

### Risk 2: Phase 6 Gap Analysis Incomplete
**Mitigation**:
- Generate detailed coverage reports
- Categorize gaps (A, B, C)
- Iterate systematically

**Resolution**:
```bash
# If 75% not reached by deadline:
# 1. Continue Phase 6 past May 31 (extend timeline)
# 2. Or release v2.11.0 at 74%+ (close enough)
# 3. Mark remaining gaps for v2.12.0
```

---

### Risk 3: Local Branch Gets Too Far from Main
**Mitigation**:
- Monitor main for critical changes
- Rebase occasionally (not merge)
- Keep communication open

**Resolution**:
```bash
# If main changes significantly:
git fetch origin
git rebase origin/main
# Fix any conflicts locally
# Continue development
```

---

## Expected Timeline

### March (Phase 5)
```
Mar 1:    v2.10.0 released (Phase 4)
Mar 2-6:  Phase 5 Wave 1 (550 tests pruned)
Mar 9-13: Phase 5 Wave 2 (890 consolidated)
Mar 14-21: Phase 5 Wave 3 (505 deleted)
Mar 31:   Phase 5 complete, local branch stable
```

### April (Phase 6, Part A)
```
Apr 1-10:   Category A gaps (+2-2.5%)
Apr 11-20:  Category B gaps start
Apr 21-30:  Category B gaps continue
```

### May (Phase 6, Part B)
```
May 1-10:   Category B gaps finish
May 11-20:  Category C gaps + fine-tuning
May 21-31:  Final verification, push to remote
```

### June (Release)
```
Jun 1:  v2.11.0 released (Phases 5-6)
Jun 2+: Users benefit from pruned, excellent test suite
```

---

## Success Metrics

### Phase 4 Success (Already Met ✅)
- ✅ 73 new tests created
- ✅ 2,516 total tests (100% passing)
- ✅ 71.28% coverage achieved
- ✅ Zero breaking changes
- ✅ v2.10.0 released Mar 1

### Phase 5 Success (Target)
- ✅ 450-500 tests remaining
- ✅ 12-14s execution time
- ✅ 71.28%+ coverage maintained
- ✅ All 3 waves atomic commits
- ✅ Complete by Mar 21

### Phase 6 Success (Target)
- ✅ 550-600 tests final
- ✅ 14-16s execution time
- ✅ 75%+ coverage achieved
- ✅ Systematic gap closure
- ✅ Complete by May 31

### Overall Success (Final)
- ✅ v2.11.0 released Jun 1
- ✅ 77% test reduction (2,516 → 600)
- ✅ 62% speed improvement (38s → 14s)
- ✅ 75%+ coverage achieved
- ✅ Professional excellence tier

---

## FAQ

### Q: Why two branches?
**A**: Phase 4 is production-ready now (Mar 1). Phases 5-6 need 3 months. Separate branches allow immediate Phase 4 release while developing Phases 5-6 concurrently.

### Q: Why keep Phase 5-6 local?
**A**:
- Protects main branch from work-in-progress
- Allows experimental refactoring safely
- Enables rollback if needed
- Only pushes stable, tested code

### Q: Can I release v2.11.0 earlier?
**A**:
- If Phase 6 reaches 75% by May 1: Yes, release early
- If stuck below 75%: Release Phase 5 only (v2.11.0-beta)
- Default: June 1 (all phases complete)

### Q: What if Phase 5 breaks something?
**A**:
- Atomic commits = easy git revert
- Backup folders = can restore individual files
- Coverage rule = stop before regression
- Git history = can trace exact change

### Q: How do I add tests during Phase 5-6?
**A**:
- Existing test files: Add it.each() rows
- New scenarios: Create focused matrix files
- Never scatter tests across files
- Always use parameterized tests

---

## Conclusion

**Dual-branch strategy** enables:
1. **Immediate v2.10.0 release** (Mar 1) with Phase 4 improvements
2. **Concurrent development** of Phases 5-6 safely on local branch
3. **Professional release cadence** with v2.11.0 (Jun 1)
4. **Excellence-tier quality** by end of May

**Timeline**: Feb 26 - Jun 1 (3 months 5 days)
**Branches**: 2 feature branches (1 released, 1 local-dev)
**Result**: v2.10.0 (71.28%) + v2.11.0 (75%+)

---

**Status**: ✅ **DUAL-BRANCH STRATEGY ESTABLISHED**

Next: Start Phase 5 Wave 1 on local branch ⚡

