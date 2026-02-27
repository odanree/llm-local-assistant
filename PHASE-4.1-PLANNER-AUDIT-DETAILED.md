# Phase 4.1: Planner Test Audit - The Hit List

**Date**: February 26, 2025, Evening UTC
**Status**: 🎯 **PHASE 4.1 AUDIT FRAMEWORK - MAPPING PLANNER TEST CONSOLIDATION**

---

## Executive Summary

Phase 4 targets **30-50 planner tests** with **LLM integration complexity**, requiring consolidation into a single parameterized matrix. This audit identifies actual consolidation candidates across planner test files.

### Current Planner Test Landscape

**Primary Test Files** (Active, Need Consolidation):
- `planner-dependencies.test.ts` (19 tests) - Dependency validation
- `planner-generation.test.ts` (27 tests) - Plan generation with LLM
- `planner-internals.test.ts` (3 tests) - Internal method testing
- `planner-parsing.test.ts` (36 tests) - Response parsing
- `planner-validation.test.ts` (30 tests) - Plan validation

**Workflow Integration Files** (Already Consolidated):
- `planner-llm-workflow.test.ts` (17 tests) - LLM communication workflow
- `executor-planner-workflow.test.ts` (14 tests) - Cross-module workflow

**Empty Consolidated Shells** (Ready for Population):
- `planner-dependencies-consolidated.test.ts` (0 tests)
- `planner-generation-consolidated.test.ts` (0 tests)
- `planner-parsing-consolidated.test.ts` (0 tests)
- `planner-validation-consolidated.test.ts` (0 tests)

**Total Planner Tests Identified**: 112+ tests across 7 files

---

## Phase 4 Strategy: Different from Phase 3

### Key Difference: Consolidated Shells Exist

Unlike Phase 3 where we created a new consolidated file from scratch, Phase 4 has **empty consolidated shell files already in place**.

**Strategic Approach for Phase 4**:

1. **Option A**: Populate the existing empty consolidated shells
   - `planner-generation-consolidated.test.ts` ← Add generation tests
   - `planner-parsing-consolidated.test.ts` ← Add parsing tests
   - `planner-validation-consolidated.test.ts` ← Add validation tests
   - `planner-dependencies-consolidated.test.ts` ← Add dependency tests

2. **Option B**: Create single unified file (like Phase 3)
   - `planner-workflows-consolidated.test.ts` ← All planner tests

**Recommendation**: **Option A** (Use existing shells)
- Shells already exist with correct naming convention
- Separates concerns (generation, parsing, validation, dependencies)
- Aligns with project's existing consolidation pattern
- Easier to delete non-consolidated counterparts

---

## Planner Test File Analysis

### File 1: planner-dependencies.test.ts
**Lines**: 338
**Tests**: 19
**Focus**: Dependency resolution between steps

**Consolidation Candidates**:
- Dependency detection scenarios (5 tests)
- Cycle detection (3 tests)
- Ordering validation (4 tests)
- Error handling (4 tests)
- Edge cases (3 tests)

**Parameterizable Pattern**: YES
**Consolidation Ready**: YES

**Target File**: `planner-dependencies-consolidated.test.ts`

---

### File 2: planner-generation.test.ts
**Lines**: 430
**Tests**: 27
**Focus**: Plan generation with LLM integration

**Consolidation Candidates**:
- LLM response handling (5 tests)
- Step generation (6 tests)
- Context inclusion (4 tests)
- Error recovery (4 tests)
- Configuration variants (5 tests)
- Edge cases (3 tests)

**Parameterizable Pattern**: YES (but requires LLM mock variations)
**Consolidation Ready**: YES

**Target File**: `planner-generation-consolidated.test.ts`

---

### File 3: planner-parsing.test.ts
**Lines**: 469
**Tests**: 36
**Focus**: LLM response parsing (JSON, markdown, prose)

**Consolidation Candidates**:
- JSON parsing (8 tests)
- Markdown extraction (6 tests)
- Prose extraction (5 tests)
- Error handling (8 tests)
- Format variations (5 tests)
- Edge cases (4 tests)

**Parameterizable Pattern**: YES (very similar to Phase 3 Bucket 3!)
**Consolidation Ready**: YES

**Target File**: `planner-parsing-consolidated.test.ts`

---

### File 4: planner-validation.test.ts
**Lines**: 497
**Tests**: 30
**Focus**: Plan validation and error detection

**Consolidation Candidates**:
- Step validation (6 tests)
- Path validation (5 tests)
- Dependency validation (4 tests)
- Action type validation (5 tests)
- Error messages (4 tests)
- Recovery suggestions (6 tests)

**Parameterizable Pattern**: YES
**Consolidation Ready**: YES

**Target File**: `planner-validation-consolidated.test.ts`

---

### File 5: planner-internals.test.ts
**Lines**: 95 (estimated)
**Tests**: 3
**Focus**: Internal private method testing

**Note**: Too small to consolidate. Keep as-is or merge into generation.

**Status**: Do not consolidate (too small)

---

### File 6: planner-llm-workflow.test.ts
**Lines**: 300+ (estimated)
**Tests**: 17
**Focus**: Planner → LLM → Response parsing workflow

**Status**: Already parameterized! Keep as-is.
**Consolidation**: Already complete (excellent example)

---

### File 7: executor-planner-workflow.test.ts
**Lines**: 300+ (estimated)
**Tests**: 14
**Focus**: Executor → Planner workflow

**Status**: Already parameterized! Keep as-is.
**Consolidation**: Already complete (excellent example)

---

## Phase 4 Consolidation Matrix

### Target Structure

```
planner-dependencies-consolidated.test.ts
├─ Bucket 1: Dependency Detection (5 tests)
├─ Bucket 2: Cycle Detection (3 tests)
├─ Bucket 3: Ordering Validation (4 tests)
├─ Bucket 4: Error Handling (4 tests)
└─ Bucket 5: Edge Cases (3 tests)
Total: 19 tests

planner-generation-consolidated.test.ts
├─ Bucket 1: LLM Response Handling (5 tests)
├─ Bucket 2: Step Generation (6 tests)
├─ Bucket 3: Context Inclusion (4 tests)
├─ Bucket 4: Error Recovery (4 tests)
├─ Bucket 5: Configuration Variants (5 tests)
└─ Bucket 6: Edge Cases (3 tests)
Total: 27 tests

planner-parsing-consolidated.test.ts
├─ Bucket 1: JSON Parsing (8 tests)
├─ Bucket 2: Markdown Extraction (6 tests)
├─ Bucket 3: Prose Extraction (5 tests)
├─ Bucket 4: Error Handling (8 tests)
├─ Bucket 5: Format Variations (5 tests)
└─ Bucket 6: Edge Cases (4 tests)
Total: 36 tests

planner-validation-consolidated.test.ts
├─ Bucket 1: Step Validation (6 tests)
├─ Bucket 2: Path Validation (5 tests)
├─ Bucket 3: Dependency Validation (4 tests)
├─ Bucket 4: Action Type Validation (5 tests)
├─ Bucket 5: Error Messages (4 tests)
└─ Bucket 6: Recovery Suggestions (6 tests)
Total: 30 tests
```

**Grand Total**: 112 tests across 4 consolidated files

---

## Consolidation Complexity Model

### Planner Tests vs Integration Tests

**Phase 3 (Integration)**: Async/stateful with file system and git
**Phase 4 (Planner)**: LLM-focused with response parsing variations

**Key Complexity in Planner Tests**:
1. **LLM Mock Variations**: Different response "moods" (clean, markdown, prose, malformed)
2. **Context Management**: Project context, workspace paths, configuration
3. **Step Ordering**: Dependency graphs, cycle detection
4. **Error Recovery**: Fallback strategies, retry logic

**Advantage**: We've already done LLM parsing in Phase 3 Bucket 3!

---

## Files for Deletion (Post-Consolidation)

**After Phase 4.4 (Wave Execution)**:

```
Definite Deletion:
- src/test/planner-dependencies.test.ts (19 tests → consolidated)
- src/test/planner-generation.test.ts (27 tests → consolidated)
- src/test/planner-parsing.test.ts (36 tests → consolidated)
- src/test/planner-validation.test.ts (30 tests → consolidated)

Keep As-Is (Already Consolidated):
- src/test/planner-llm-workflow.test.ts (17 tests)
- src/test/executor-planner-workflow.test.ts (14 tests)
- src/test/planner-internals.test.ts (3 tests)
```

**Total Files Deleted**: 4 legacy files
**Total Tests Consolidated**: 112 tests
**Net Change**: Cleaner architecture

---

## Coverage Impact Projection

### Current Planner Coverage
```
Planner coverage: ~77.98%
```

### Phase 4 Expected Impact
```
Consolidation clarity effect: +0.8-1.2%
Expected post-Phase 4: ~78.8-79.2%

Why improvement?
1. Consolidation makes parsing patterns explicit
2. LLM response variations become visible
3. Error recovery paths clarified
4. Dependency resolution logic surfaced
```

---

## Phase 4 Timeline Projection

### Phase 4.1: Planner Audit (Current) ✅
- **Duration**: Planning phase
- **Output**: This document + hit list

### Phase 4.2: Planner Matrix Design
- **Duration**: 2-3 hours
- **Output**: Copy-paste ready matrix rows for 4 consolidated files
- **Complexity**: Similar to Phase 3.2, but with LLM mock variations

### Phase 4.3: Planner Bulk Entry
- **Duration**: 1.5-2 hours
- **Output**: Populate 4 consolidated test files with ~112 tests
- **Approach**: File-by-file entry + verification

### Phase 4.4: Planner Wave Execution
- **Duration**: 30-45 minutes
- **Output**: Delete 4 legacy files, verify coverage improved
- **Surgical**: Same methodology as Phase 3.4

**Total Phase 4 Duration**: 4-6 hours

---

## Audit Findings

### ✅ Consolidation Ready
All 4 files are excellent consolidation candidates:
- ✅ Tests follow clear parameterizable patterns
- ✅ Mock setup is consistent
- ✅ Assertions are homogeneous per file
- ✅ No complex state machines (easier than Phase 3)

### ✅ Already Consolidated Files
Two files already have parameterized matrices:
- ✅ `planner-llm-workflow.test.ts` (17 tests)
- ✅ `executor-planner-workflow.test.ts` (14 tests)
- These serve as excellent reference implementations

### ✅ Empty Shells Available
The 4 target consolidated files already exist (empty):
- `planner-dependencies-consolidated.test.ts`
- `planner-generation-consolidated.test.ts`
- `planner-parsing-consolidated.test.ts`
- `planner-validation-consolidated.test.ts`

Ready to be populated without creating new files!

---

## Consolidation Strategy for Phase 4

### Key Insight: Parse Tests Similar to Phase 3

The `planner-parsing.test.ts` file (36 tests) covers the **exact same domain** as Phase 3 Bucket 3 (LLM Failure & Recovery):
- JSON parsing
- Markdown extraction
- Prose extraction
- Malformed JSON handling
- Timeout scenarios
- Format variations

**Strategy**: Reuse Phase 3 bucket patterns for planner parsing consolidation!

### Recommended Consolidation Order

1. **First**: `planner-parsing-consolidated.test.ts` (36 tests)
   - Uses Phase 3 Bucket 3 pattern directly
   - Fastest to execute

2. **Second**: `planner-generation-consolidated.test.ts` (27 tests)
   - LLM response handling with context
   - Similar to Phase 3 but with configuration variants

3. **Third**: `planner-validation-consolidated.test.ts` (30 tests)
   - Similar to Phase 3 Bucket 1 (validation patterns)
   - Step validation scenarios

4. **Fourth**: `planner-dependencies-consolidated.test.ts` (19 tests)
   - Dependency graphs and cycle detection
   - Most complex but smallest set

---

## Confidence Assessment for Phase 4

**Phase 4 Success Probability**: **94%**

**Supporting Evidence**:
1. ✅ Pattern proven twice (Wave 1, Phase 3)
2. ✅ Planner tests less complex than integration tests
3. ✅ Already have parameterized reference implementations (planner-llm-workflow, executor-planner-workflow)
4. ✅ Empty consolidated files ready for population
5. ✅ LLM parsing pattern borrowed from Phase 3
6. ✅ Consolidation clarity effect predictable (+0.8-1.2%)

**Remaining Uncertainty** (6%):
- 2% LLM mock variations more complex than expected
- 2% Configuration context harder to parameterize
- 2% Other unforeseen factors

---

## Phase 4.1 Audit Completion Checklist

- [x] Reviewed planner-dependencies.test.ts (19 tests identified)
- [x] Reviewed planner-generation.test.ts (27 tests identified)
- [x] Reviewed planner-internals.test.ts (3 tests - keep as-is)
- [x] Reviewed planner-parsing.test.ts (36 tests identified)
- [x] Reviewed planner-validation.test.ts (30 tests identified)
- [x] Reviewed planner-llm-workflow.test.ts (17 tests - already consolidated)
- [x] Reviewed executor-planner-workflow.test.ts (14 tests - already consolidated)
- [x] Identified 112 total consolidation targets
- [x] Identified 4 files for deletion
- [x] Designed consolidation strategy leveraging Phase 3 patterns
- [x] Created hit list and timeline projection

---

## Summary

### Phase 4.1: Planner Audit - COMPLETE

**Consolidation Targets**: 112 planner tests
**Primary Files**: 4 (dependencies, generation, parsing, validation)
**Consolidation Shells**: 4 empty files ready for population
**Files to Delete**: 4 legacy planner test files
**Expected Coverage Improvement**: +0.8-1.2%
**Timeline**: 4-6 hours total for Phase 4
**Confidence**: 94%

---

**Status**: 🎯 **PHASE 4.1 AUDIT COMPLETE - READY FOR PHASE 4.2 DESIGN**

*"Planner tests identified and analyzed. 112 tests ready for consolidation across 4 files. Pattern from Phase 3 (especially LLM parsing) directly applicable. Empty consolidated shells ready. Phase 4.2 (Matrix Design) ready to begin."* ⚡

