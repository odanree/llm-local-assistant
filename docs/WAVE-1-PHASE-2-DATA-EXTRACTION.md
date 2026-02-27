# Phase 5 Wave 1: Phase 2 Data-Only Extraction (40 min Sprint)

**Date**: February 26, 2025, Evening UTC
**Status**: 🔬 DATA EXTRACTION IN PROGRESS
**Goal**: Extract 210-250 test cases from 5 executor-*.test.ts files (data-only, no assertions yet)

---

## Current Status: Phase 2.1 Complete ✅

**executor-internals.test.ts**: 65 test cases extracted and consolidated
**executor-validation-consolidated.test.ts**: Expanded from 27 → 92 tests
**Coverage**: Maintained at 71.17% (acceptable margin from 71.28%)

---

## Phase 2.2-2.7 Extraction Targets

### File 1: executor-errors.test.ts ✅ (ALREADY CONSOLIDATED)
**Status**: Already parameterized with 6 it.each() blocks
**Test Count**: ~17 parameterized test cases
**Describe Blocks**: 6
**Coverage**: Error handling, retry logic, validation, pre-flight checks

**Matrices Identified**:
1. **attemptAutoFix** - Directory Walking (3 cases)
   - depth=1, depth=3, depth=5

2. **Error Type Categorization** (4 cases from ERROR_RECOVERY_MATRIX)
   - ENOENT, EACCES, EISDIR, EMFILE

3. **Error Detection and Suggestions** (4 cases)
   - ENOENT, EACCES, EISDIR, EMFILE errors

4. **Retry Logic** (3 cases)
   - maxRetries=1, maxRetries=2, maxRetries=3

5. **Hallucination Detection** (3 cases)
   - Missing path, invalid action, missing command

6. **Pre-Flight Checks** (3 cases)
   - path_validity, command_safety, file_size

**Action**: Review existing matrices → Confirm all rows → Move to consolidated file

---

### File 2: executor-coverage-focus.test.ts ✅ (ALREADY CONSOLIDATED)
**Status**: Partially parameterized with mixed approach
**Test Count**: ~25-30 test cases
**Describe Blocks**: 10
**Coverage**: Constructor, path sanitization, import calculation, type validation, patterns, error handling

**Matrices Identified**:
1. **Constructor Initialization** (3 cases)
   - All options, custom maxRetries, custom timeout

2. **Path Sanitization** (5 cases)
   - Trailing dots, spaces, backticks, backslashes, multiple artifacts

3. **Import Path Calculation** (3 cases)
   - Zustand store, non-store utility, cn utility

4. **Type Validation** (4 cases)
   - Markdown blocks, documentation, any types, valid code

5. **Common Pattern Validation** (3 cases)
   - React imports, Zustand usage, form patterns

6. **Form Component Validation** (2 cases)
   - Form patterns, non-form components

7. **Error Handling** (3 cases)
   - ENOENT, EACCES, EISDIR

8. **Architecture Validation** (2 regular it tests)
   - Modern patterns, valid component structure

9. **Cross-File Contracts** (1 regular it test)
   - Single file validation

10. **Integration Consistency** (2 regular it tests)
    - Minimal plan, metadata tracking

**Action**: Extract matrices → Combine with executor-internals in consolidated file

---

### File 3: executor-validation.test.ts ⏳ (NEEDS EXTRACTION)
**Status**: Selective consolidation with explicit edge cases
**Test Count**: ~28 test cases
**Describe Blocks**: 5
**Coverage**: Type validation, architecture rules, pattern detection, form validation, edge cases

**Matrices to Extract**:
1. **validateTypes** (7 cases)
   - Markdown code blocks, documentation, any types, multiple file refs, valid code, type-only exports, functions with types

2. **validateArchitectureRules** (4 cases)
   - fetch vs TanStack Query, Redux vs Zustand, class vs functional, modern architecture pattern

3. **validateCommonPatterns** (6 cases)
   - React imports without hooks, missing destructuring, Zustand without init, correct Zustand, TanStack misuse, mixed validation libs

4. **validateFormComponentPatterns** (6 cases)
   - Missing state interface, any types in handlers, missing onSubmit, onClick vs form, correct pattern, multiple handlers

5. **Validation Edge Cases** (7 cases)
   - Empty content, null/undefined, very long files, special characters, many violations, error messages, normalized paths

**Bucket Assignment**:
- Bucket 1 (Architecture): validateArchitectureRules (4) + multiple file refs (1) + many violations (1) = 6 rows
- Bucket 2 (Code Quality): validateTypes (7) + validateCommonPatterns (6) + validateFormComponentPatterns (6) = 19 rows
- Bucket 3 (Error Recovery): Edge cases (7) = 7 rows
- Bucket 4: (none)

**Action**: Extract test parameters → Organize by bucket → Add to consolidated file

---

### File 4: executor-dependencies.test.ts ⏳ (NEEDS EXTRACTION)
**Status**: All explicit tests (no parameterization)
**Test Count**: ~23 test cases
**Describe Blocks**: 6
**Coverage**: Dependency ordering, validation, contracts, pre-flight checks, complex scenarios

**Candidates for Parameterization**:
1. **preFlightCheck file extensions** (5 cases)
   - ts, tsx, css, json, .env.local → Can consolidate

2. **validateDependencies** (3 cases)
   - Empty, null, multiple dependencies → Can consolidate

3. **Path validation** (4 cases)
   - Invalid chars, missing extension, special cases → Can consolidate

4. **Dependency ordering** (8 cases) → KEEP EXPLICIT (complex logic)

5. **Contract validation** (6 cases) → KEEP EXPLICIT (detailed assertions)

6. **Complex scenarios** (5 cases) → KEEP EXPLICIT (diamond patterns, circular imports)

7. **Integration** (4 cases) → KEEP EXPLICIT (workflow patterns)

**Consolidation Strategy**:
- Extract 12 tests into 3 parameterized matrices
- Keep 11 tests as explicit (complex dependency logic)

**Bucket Assignment**:
- Bucket 4 (Execution & Lifecycle): All 23 tests focus on dependency and contract management

**Action**: Identify which tests can be parameterized → Extract parameters → Keep complex tests explicit

---

### File 5: executor-real-execution.test.ts ⏳ (NEEDS EXTRACTION)
**Status**: All explicit tests (real-world scenarios)
**Test Count**: ~43 test cases
**Describe Blocks**: 12
**Coverage**: Config, lifecycle, actions, contracts, paths, callbacks, multi-step, errors, results, LLM, workspace, scenarios

**Candidates for Parameterization**:
1. **Step action types** (5 cases: read, write, run, delete, manual)
   - Can consolidate into 1 parameterized test

2. **File path types** (5 cases: simple, nested, special chars, various types)
   - Can consolidate into 1 parameterized test

3. **Callback handlers** (5 cases: onProgress, onMessage, onStepOutput, onQuestion, optional)
   - Can consolidate into 1 parameterized test

4. **ExecutorConfig defaults** (5 cases: minimal, custom, defaults)
   - Can consolidate into 1 parameterized test

5. **Config validation** (5 cases) → KEEP EXPLICIT (unique init scenarios)

6. **Real-world scenarios** (5 cases) → KEEP EXPLICIT (React, Next.js, Forms, Full-stack)

7. **Plan lifecycle** (3 cases) → KEEP EXPLICIT (status transitions)

8. **Error handling** (5 cases) → Mix of parameterizable + explicit

**Consolidation Strategy**:
- Extract 20 tests into 4 parameterized matrices
- Keep 23 tests as explicit (real-world + complex workflows)

**Bucket Assignment**:
- Bucket 3 (Error Recovery): Error handling tests (5)
- Bucket 4 (Execution & Lifecycle): All other tests (38)

**Action**: Extract parameterizable tests → Keep real-world scenarios explicit → Combine with consolidated file

---

### File 6: executor-execution.test.ts ✅ (ALREADY CONSOLIDATED)
**Status**: Already parameterized with 6 it.each() blocks
**Test Count**: ~14-16 test cases
**Describe Blocks**: 7
**Coverage**: Plan execution, step actions, file I/O, command execution, error handling

**Matrices Identified**:
1. **executePlan** (2 cases)
   - Empty plan, single step plan

2. **executeStep** (3 cases)
   - read, write, run actions

3. **read** (3 cases)
   - TypeScript, JSON, utility files

4. **write** (2 cases)
   - TypeScript, config files

5. **runCommand** (3 cases)
   - npm test, npm build, npm install

6. **Error Handling** (3 cases)
   - ENOENT, EACCES, COMMAND_ERROR

7. **Execution Metadata** (2 regular it tests)
   - Metadata tracking, execution summary

**Action**: Review existing matrices → Confirm all rows → Move to consolidated file

---

## Summary: Test Count by File

| File | Status | Test Cases | Parameterized | Explicit | Bucket |
|------|--------|-----------|---------------|----------|--------|
| executor-errors.test.ts | ✅ Consolidated | 17 | 6 matrices | 0 | 1,3 |
| executor-coverage-focus.test.ts | ✅ Consolidated | 25-30 | 7 matrices | 5 | 1,2,3,4 |
| executor-validation.test.ts | ⏳ Extract | 28 | 5 matrices | 0 | 1,2,3 |
| executor-dependencies.test.ts | ⏳ Extract | 23 | 3 matrices | 20 | 4 |
| executor-real-execution.test.ts | ⏳ Extract | 43 | 4 matrices | 39 | 3,4 |
| executor-execution.test.ts | ✅ Consolidated | 14-16 | 6 matrices | 2 | 4 |
| **TOTAL** | | **150-160** | **31 matrices** | **66 explicit** | **Mixed** |

---

## Phase 2 Consolidation Strategy

### What's Already Done (Phase 2.1)
✅ executor-internals.test.ts: 65 cases extracted → consolidated file
✅ executor-errors.test.ts: 17 cases identified (already parameterized)
✅ executor-coverage-focus.test.ts: 25-30 cases identified
✅ executor-execution.test.ts: 14-16 cases identified

### What Needs Extraction (Phase 2.2-2.7)
⏳ executor-validation.test.ts: 28 cases → Extract matrices + edge cases
⏳ executor-dependencies.test.ts: 23 cases → 12 parameterizable + 11 explicit
⏳ executor-real-execution.test.ts: 43 cases → 20 parameterizable + 23 explicit

### Result After Complete Consolidation
- **Total Test Cases**: 150-160 from 5+ files
- **Consolidated into Matrices**: 31 parameterized test groups
- **Kept as Explicit**: 66+ tests (complex logic, real-world scenarios)
- **New Consolidated File Lines**: ~1,200-1,400 LOC (if split into 2 files)
- **Expected Coverage**: >= 71.28% (maintaining current baseline)

---

## Next Steps

### Phase 2.2: executor-validation.test.ts (30 min)
1. Read full file
2. Extract validateTypes matrix (7 cases)
3. Extract validateArchitectureRules matrix (4 cases)
4. Extract validateCommonPatterns matrix (6 cases)
5. Extract validateFormComponentPatterns matrix (6 cases)
6. Extract edge cases matrix (7 cases)
7. Organize by bucket → Add to consolidated file

### Phase 2.3: executor-dependencies.test.ts (30 min)
1. Identify parameterizable tests (12 cases)
2. Extract 3 new matrices
3. Keep 11 explicit tests as-is
4. Add parameterizable matrices to consolidated file

### Phase 2.4: executor-real-execution.test.ts (30 min)
1. Extract 4 parameterizable matrices
2. Keep 23 explicit real-world scenario tests
3. Organize error tests into Bucket 3
4. Add to consolidated file

### Phase 2.5: Consolidation & Verification (20 min)
1. Combine all matrices into executor-validation-consolidated.test.ts
2. Run coverage check: `npm test -- --coverage executor-validation-consolidated.test.ts`
3. Verify coverage >= 71.28%
4. If successful, ready for Wave 1 deletion

---

## 2-Hour Sprint Timeline

- **0:00-0:40**: Data extraction (this document + detailed test parameters)
- **0:40-1:40**: Bulk matrix entry (paste extracted data into it.each arrays)
- **1:40-2:00**: Coverage verification (run tests, confirm >= 71.28%)

**Go-Live**: Feb 27-28, prepare for Wave 1 execution Mar 2-6

---

**Status**: 🔬 **PHASE 2.2-2.7 READY FOR DETAILED EXTRACTION**

Next: Begin extracting executor-validation.test.ts test cases in detail

