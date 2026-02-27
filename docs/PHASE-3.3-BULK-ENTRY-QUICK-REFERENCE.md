# Phase 3.3: Integration Bulk Entry - Quick Reference

**Estimated Duration**: 90-120 minutes total
**Deliverable**: `src/test/integration-workflows-consolidated.test.ts`
**Success Criteria**: All tests passing, coverage ≥70%

---

## Timeline Overview

```
0-5 min:    File setup + Bucket 1 copy-paste
5-30 min:   Bucket 1 test run + coverage check
30-50 min:  Buckets 2-3 copy-paste (parallel work)
50-75 min:  Bucket 2-3 test run + coverage check
75-95 min:  Bucket 4 copy-paste
95-120 min: Bucket 4 test run + final verification
```

---

## Phase 3.3.1: File Setup (5 minutes)

### Step 1: Create New Test File
```bash
touch src/test/integration-workflows-consolidated.test.ts
```

### Step 2: Add File Header
```typescript
/**
 * Integration Workflows Consolidated Test Matrix (Phase 3)
 *
 * Four buckets for async/stateful integration testing:
 * 1. BUCKET 1: Happy Path Handshake (executor → planner flow)
 * 2. BUCKET 2: Permission & Filesystem Chaos (error scenarios)
 * 3. BUCKET 3: LLM Failure & Recovery (resilience testing)
 * 4. BUCKET 4: Multi-Step Sequence Logic (stateful workflows)
 *
 * Total: 26-51 integration tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockExecutor, createMockPlanner } from './factories/stateInjectionFactory';

describe('Integration Workflows Consolidated', () => {
  // BUCKET 1: Happy Path Handshake will go here
  // BUCKET 2: Permission & Filesystem Chaos will go here
  // BUCKET 3: LLM Failure & Recovery will go here
  // BUCKET 4: Multi-Step Sequence Logic will go here
});
```

---

## Phase 3.3.2: Bucket 1 Entry (25 minutes)

### Step 1: Add Bucket 1 Description (1 min)
```typescript
describe('BUCKET 1: Happy Path Handshake', () => {
  /**
   * Purpose: Nominal workflows where executor validates, planner generates steps
   * Scenarios: Valid code, type errors, architecture violations
   * Assertions: Step count, step types, flow correctness
   */
```

### Step 2: Copy All 6 Rows (5 min)
**Source**: `PHASE-3.2-INTEGRATION-MATRIX-DESIGN.md` → Bucket 1 rows (Row 1.1-1.6)

**Paste the entire `happyPathMatrix` array**:
```typescript
  const happyPathMatrix = [
    // Row 1.1: Valid function with return type
    { name: '...', executorScenario: {...}, ... },
    // Row 1.2: Type error (missing return)
    { name: '...', executorScenario: {...}, ... },
    // Row 1.3: Architecture violation (direct fetch)
    { name: '...', executorScenario: {...}, ... },
    // Row 1.4: State library violation (Redux)
    { name: '...', executorScenario: {...}, ... },
    // Row 1.5: Missing import
    { name: '...', executorScenario: {...}, ... },
    // Row 1.6: Form validation missing
    { name: '...', executorScenario: {...}, ... },
  ];
```

### Step 3: Add Test Loop (2 min)
```typescript
  happyPathMatrix.forEach(({
    name,
    executorScenario,
    plannerScenario,
    expectedFlow,
    desc,
  }) => {
    it(`Happy Path: ${desc}`, async () => {
      const { instance: executor, mocks: executorMocks } = createMockExecutor({
        code: executorScenario.code,
        isValid: executorScenario.isValid,
      });

      const { instance: planner } = createMockPlanner({
        expectedStepCount: plannerScenario.stepCount.min,
      });

      const validationResult = (executor as any).validate(executorScenario.code);
      const planResult = (planner as any).parse(validationResult);

      expect(validationResult.isValid).toBe(executorScenario.isValid);
      expect(planResult.steps.length).toBeGreaterThanOrEqual(plannerScenario.stepCount.min);
      expect(planResult.steps.length).toBeLessThanOrEqual(plannerScenario.stepCount.max);
    });
  });
});
```

### Step 4: Test Bucket 1 (15 min)
```bash
npm test -- integration-workflows-consolidated.test.ts --reporter=verbose
```

**Expected Output**:
```
✓ Integration Workflows Consolidated (25)
  ✓ BUCKET 1: Happy Path Handshake (6)
    ✓ Happy Path: Valid code flows through to parsed plan
    ✓ Happy Path: Type Error: Missing return type triggers fix plan
    ✓ Happy Path: Architecture Violation: Direct fetch → TanStack Query refactor
    ✓ Happy Path: State Library: Redux → Zustand migration
    ✓ Happy Path: Missing Import: Detect and suggest import addition
    ✓ Happy Path: Form Validation: Detect missing validation and suggest pattern
```

**Coverage Check** (2 min):
```bash
npm test -- integration-workflows-consolidated.test.ts --coverage
```

**Expected**:
```
Bucket 1 contribution: ~2-3% to overall coverage
No regression from previous 70.62%
All 6 tests passing
```

---

## Phase 3.3.3: Bucket 2 Entry (20 minutes)

### Step 1: Add Bucket 2 Section (1 min)
```typescript
describe('BUCKET 2: Permission & Filesystem Chaos', () => {
  /**
   * Purpose: Error handling with filesystem constraints
   * Scenarios: Read-only files, missing directories, deep nesting
   * Assertions: Error type, recovery strategy, planner behavior
   */
```

### Step 2: Copy All 6 Rows (4 min)
**Source**: `PHASE-3.2-INTEGRATION-MATRIX-DESIGN.md` → Bucket 2 rows (Row 2.1-2.6)

```typescript
  const filesystemChaosMatrix = [
    // Row 2.1: Read-only file triggers permission error
    { name: '...', fileState: {...}, ... },
    // Row 2.2: Missing directory
    { name: '...', fileState: {...}, ... },
    // Row 2.3: Deep nesting
    { name: '...', fileState: {...}, ... },
    // Row 2.4: No write permissions
    { name: '...', fileState: {...}, ... },
    // Row 2.5: Circular symlink
    { name: '...', fileState: {...}, ... },
    // Row 2.6: Concurrent modification
    { name: '...', fileState: {...}, ... },
  ];
```

### Step 3: Add Test Loop (2 min)
```typescript
  filesystemChaosMatrix.forEach(({
    name,
    fileState,
    filePermissions,
    executorOperation,
    expectedError,
    desc,
  }) => {
    it(`Chaos: ${desc}`, async () => {
      const { instance: executor } = createMockExecutor({
        fileState,
        filePermissions,
      });

      try {
        await (executor as any).perform(executorOperation);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.type).toBe(expectedError.type);
        expect(expectedError.shouldTriggerRecovery).toBe(true);
      }
    });
  });
});
```

### Step 4: Test Bucket 2 (13 min)
```bash
npm test -- integration-workflows-consolidated.test.ts --reporter=verbose
```

**Expected**: All 12 tests (Bucket 1 + 2) passing
**Coverage Check**: Should be ~4-6% total now

---

## Phase 3.3.4: Bucket 3 Entry (20 minutes)

### Step 1: Add Bucket 3 Section (1 min)
```typescript
describe('BUCKET 3: LLM Failure & Recovery', () => {
  /**
   * Purpose: Resilience to LLM response anomalies
   * Scenarios: Clean JSON, markdown, prose, timeout, malformed, empty
   * Assertions: Parsed steps, recovery method, escalation flags
   */
```

### Step 2: Copy All 8 Rows (4 min)
**Source**: `PHASE-3.2-INTEGRATION-MATRIX-DESIGN.md` → Bucket 3 rows (Row 3.1-3.8)

```typescript
  const llmFailureMatrix = [
    // Row 3.1: Clean JSON response
    { name: '...', llmMood: 'clean', ... },
    // Row 3.2: Markdown-wrapped JSON
    { name: '...', llmMood: 'markdown', ... },
    // ... continue for rows 3.3-3.8
  ];
```

### Step 3: Add Test Loop (2 min)
```typescript
  llmFailureMatrix.forEach(({
    name,
    llmMood,
    llmResponse,
    parsingScenario,
    expectedOutcome,
    desc,
  }) => {
    it(`LLM: ${desc}`, async () => {
      const { instance: planner } = createMockPlanner({
        llmResponse: llmResponse.content,
        llmMood,
      });

      const result = (planner as any).parse(llmResponse.content);

      if (parsingScenario.shouldParseSuccessfully) {
        expect(result.steps.length).toBe(expectedOutcome.parsedSteps);
      } else {
        expect(result.isError || result.steps.length < expectedOutcome.parsedSteps).toBe(true);
      }
    });
  });
});
```

### Step 4: Test Bucket 3 (13 min)
```bash
npm test -- integration-workflows-consolidated.test.ts --reporter=verbose
```

**Expected**: All 20 tests (Buckets 1-3) passing
**Coverage Check**: Should be ~6-8% total now

---

## Phase 3.3.5: Bucket 4 Entry (25 minutes)

### Step 1: Add Bucket 4 Section (1 min)
```typescript
describe('BUCKET 4: Multi-Step Sequence Logic', () => {
  /**
   * Purpose: Complex stateful workflows with transitions
   * Scenarios: Sequential ops, multi-file updates, complex refactors, file creation
   * Assertions: Final state, git transitions, rollback correctness
   */
```

### Step 2: Copy All 6 Rows (6 min)
**Source**: `PHASE-3.2-INTEGRATION-MATRIX-DESIGN.md` → Bucket 4 rows (Row 4.1-4.6)

```typescript
  const multiStepSequenceMatrix = [
    // Row 4.1: Sequential read-modify-write
    { name: '...', plan: {...}, initialFileState: {...}, ... },
    // Row 4.2: Multi-file updates with rollback
    { name: '...', plan: {...}, initialFileState: {...}, ... },
    // ... continue for rows 4.3-4.6
  ];
```

### Step 3: Add Test Loop (2 min)
```typescript
  multiStepSequenceMatrix.forEach(({
    name,
    plan,
    initialFileState,
    expectedFinalState,
    expectedGitTransitions,
    desc,
  }) => {
    it(`Sequence: ${desc}`, async () => {
      const { instance: executor } = createMockExecutor({
        fileState: initialFileState,
      });

      const vfs = { ...initialFileState };

      for (const step of plan.steps) {
        await (executor as any).executeStep(step, vfs);
      }

      expect(vfs).toEqual(expectedFinalState);
    });
  });
});
```

### Step 4: Test Bucket 4 (16 min)
```bash
npm test -- integration-workflows-consolidated.test.ts --reporter=verbose
```

**Expected**: All 26 tests (all buckets) passing ✓

---

## Final Verification (5 minutes)

### Step 1: Full Test Suite
```bash
npm test -- --coverage
```

**Verify**:
- ✅ All 2,533+ tests passing (100%)
- ✅ Coverage ≥70% (ideally 70.5-71.4%)
- ✅ integration-workflows-consolidated.test.ts: 26+ tests
- ✅ No regressions from previous 70.62%

### Step 2: Coverage Report
```bash
npm test -- --coverage --reporter=text-summary
```

**Expected**:
```
Lines        70.5-71.4%  (↑ from 70.62%)
Statements   70.5-71.4%
Functions    70.5-71.4%
Branches     68-70%

integration-workflows-consolidated.test.ts contribution:
  ~7-10% of overall coverage
```

### Step 3: File Statistics
```bash
wc -l src/test/integration-workflows-consolidated.test.ts
```

**Expected**:
- Lines: 1,500-2,000 (26+ test rows with detailed schemas)
- Readability: Good (organized by 4 buckets)

---

## Troubleshooting Guide

### Issue 1: Tests Failing in Bucket 1
**Symptom**: Some Happy Path tests failing
**Solution**:
1. Check mock factory implementation (`createMockExecutor`, `createMockPlanner`)
2. Verify executor/planner instances have required methods
3. Ensure `(executor as any).validate()` is correct method name

### Issue 2: Coverage Drops
**Symptom**: Coverage goes below 70.62%
**Solution**:
1. Stop adding more rows
2. Run `npm test -- src/test/executor.lifecycle.test.ts` to check executor coverage
3. Verify old tests still passing: `npm test -- --reporter=verbose`
4. If issue persists, roll back to stable state

### Issue 3: Timeout on Async Tests
**Symptom**: Tests take >5 minutes to run
**Solution**:
1. Check LLM mock latencies (should be 15-120ms, not seconds)
2. Increase vitest timeout: `it(..., async () => {...}, 10000)` (10s timeout)
3. Verify no infinite loops in Bucket 4 multi-step tests

### Issue 4: Type Errors in Test Matrix
**Symptom**: TypeScript compilation errors
**Solution**:
1. Ensure all required fields present in each row
2. Check union types (e.g., `llmMood: 'clean' as const`)
3. Verify mock factory return types match usage

---

## Success Checklist

### Bucket 1 ✓
- [ ] All 6 rows copied
- [ ] Test loop added
- [ ] All 6 tests passing
- [ ] Coverage stable

### Bucket 2 ✓
- [ ] All 6 rows copied
- [ ] Test loop added
- [ ] All 6 tests passing
- [ ] Coverage stable

### Bucket 3 ✓
- [ ] All 8 rows copied
- [ ] Test loop added
- [ ] All 8 tests passing
- [ ] Coverage stable

### Bucket 4 ✓
- [ ] All 6 rows copied
- [ ] Test loop added
- [ ] All 6 tests passing
- [ ] Coverage stable

### Final Verification ✓
- [ ] npm test: 100% pass rate
- [ ] npm test --coverage: ≥70% (ideally 70.5-71.4%)
- [ ] No regressions
- [ ] File properly formatted (4 buckets visible)

---

## Next Phase Alert

Once Phase 3.3 complete:
1. Run full test suite verification
2. Document any modifications to matrix schema
3. Ready to proceed to Phase 3.4 (Deletion)

**Phase 3.4** will execute the surgical deletion of 5-8 legacy integration files using the same methodology as Wave 1.

---

**Status**: 🎯 **PHASE 3.3 QUICK REFERENCE READY**

*"90-120 minutes from start to finish. Four buckets, copy-paste ready. Let's consolidate the integration tests."* ⚡

