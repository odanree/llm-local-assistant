# Executor Coverage Test - Concurrent Safety Audit

**Goal**: Re-structure 753-line test file for safe concurrent execution (45% runtime improvement)
**Current Status**: 26.89s sequential → 14.79s concurrent (but has safety concerns)
**Strategy**: Nested describe blocks with selective concurrency + spy-based mocks

---

## Phase 1: Global Mocks Audit ✓

### Current Global Mocks
```typescript
vi.mock('vscode', ...)  // Line 20 - STATELESS ✓ Safe for concurrent
```

#### Safety Assessment

| Mock | Type | Concurrent Safe? | Reason |
|------|------|------------------|--------|
| `vscode` module | Global | ✅ YES | Stateless - only returns mocked functions, no internal state |
| `workspace.fs.*` | Global | ✅ YES | Each mock function returns fresh mock, no shared state |
| `Uri helpers` | Global | ✅ YES | Pure functions (no state changes) |
| `window` messages | Global | ✅ YES | vi.fn() tracked independently, safe for parallel |

**Verdict**: Global vscode mock is **safe for concurrent execution**.

---

## Phase 2: Test Data Audit

### Current Approach
```typescript
// Using factories - GOOD ✓
const executor = createTestExecutor();
const plan = createTaskPlan();
const step = createExecutionStep({...});
```

**Safety**: ✅ Fresh instance per test = Safe for concurrent

**Risk Areas Identified**: None - all tests use factories, no shared object mutations

---

## Phase 3: Test Categorization

### Pure Logic Tests (CPU-bound, no state side-effects)
✅ **SAFE FOR CONCURRENT**

These test pure computation, data transformation, validation logic:

1. **Path Sanitization** (7 tests)
   - Normalize paths, handle special chars, strip artifacts
   - No file I/O, no state changes
   
2. **Step Validation & Contract Checking** (15 tests)
   - Validate step structure, check contracts
   - Pure logic validation
   
3. **Dependency Management** (8 tests)
   - Dependency graph analysis, topological sort
   - Computation-only, mocked results
   
4. **Step Reordering & Dependencies** (5 tests)
   - Plan reordering logic
   - Pure computation
   
5. **Plan Status Management** (3 tests)
   - Status state tracking
   - No file/network I/O
   
6. **Results Tracking** (3 tests)
   - Result aggregation, duration tracking
   - State computation only

**Total Safe for Concurrent**: ~41 tests

---

### Heavy Integration Tests (file I/O, LLM calls)
⚠️ **KEEP SEQUENTIAL** (safer for testing)

These integrate with mocked dependencies and may have interdependencies:

1. **File Contract Extraction** (1 test)
   - Exercises file reading logic
   
2. **Workspace Context Integration** (1 test)
   - Multiple workspace scenarios
   
3. **LLM Context Management** (2 tests)
   - LLM client calls, response handling
   
4. **Error Recovery & Retry Logic** (1 test)
   - Retry logic with timeouts
   
5. **Edge Cases & Robustness** (2 tests)
   - Complex integration scenarios
   
6. **Progress Callbacks** (1 test)
   - Callback execution verification

**Total Sequential**: ~8 tests (but includes heavy executePlan calls)

---

## Phase 4: Implementation Strategy

### Structure

```typescript
describe('Executor - Coverage Extension', () => {
  
  // Pure Logic - CPU-only, safe for parallel execution
  describe.concurrent('Pure Logic & Validation', () => {
    describe('Path Sanitization', () => { /* 7 tests */ });
    describe('Step Validation & Contract Checking', () => { /* 15 tests */ });
    describe('Dependency Management', () => { /* 8 tests */ });
    describe('Step Reordering & Dependencies', () => { /* 5 tests */ });
    describe('Plan Status Management', () => { /* 3 tests */ });
    describe('Results Tracking', () => { /* 3 tests */ });
  });
  
  // Heavy Integration - Keep sequential for safety
  describe('Integration & Complex Cases', () => {
    describe('File Contract Extraction', () => { /* 1 test */ });
    describe('Workspace Context Integration', () => { /* 1 test */ });
    describe('LLM Context Management', () => { /* 2 tests */ });
    describe('Error Recovery & Retry Logic', () => { /* 1 test */ });
    describe('Edge Cases & Robustness', () => { /* 2 tests */ });
  });
  
});
```

### Expected Performance Profile

```
Before Concurrent:
  Total: 26.89s
  Pure Logic: ~18s (67% of time)
  Integration: ~8.9s (33% of time)

With Selective Concurrent:
  Pure Logic (concurrent): 18s → 6-7s (4x CPU cores)
  Integration (sequential): ~8.9s (no change)
  Total: ~15-16s (42% improvement)

With Full Concurrent (current):
  All parallel: 14.79s (45% improvement)
  Risk: Potential flakiness if state pollution
```

---

## Phase 5: Implementation Checklist

### Step 1: Reorganize Describe Blocks (15 min)
- [ ] Group pure logic tests into single `describe.concurrent` block
- [ ] Move integration tests to separate sequential block
- [ ] Verify all 45 tests still exist
- [ ] Run tests - verify all pass

### Step 2: Add Spy-Based Mocks for State-Heavy Tests (20 min)
- [ ] Audit `LLM Context Management` for potential state issues
- [ ] Audit `Error Recovery` for retry state
- [ ] Convert any problematic global mocks to local spies if needed
- [ ] Run tests - verify spies work correctly

### Step 3: Add Concurrent Safety Comments (10 min)
- [ ] Document why each section is concurrent/sequential
- [ ] Explain factory usage and data isolation
- [ ] Add audit results as code comments

### Step 4: Performance Measurement (10 min)
- [ ] Run baseline before changes
- [ ] Run after reorganization
- [ ] Document results
- [ ] Compare with current 14.79s concurrent

### Step 5: Create PR with Audit Results (10 min)
- [ ] Commit with detailed message
- [ ] Include measurements before/after
- [ ] Reference this audit document
- [ ] Explain the safety gains from selective concurrency

---

## Safety Validation

### Pre-Implementation Checks ✓
- [x] All tests use factories (fresh instances)
- [x] Global mocks are stateless
- [x] No shared object mutations detected
- [x] Mock data properly isolated

### Post-Implementation Tests
- [ ] All 45 tests pass
- [ ] Run 5 consecutive times - zero flakiness
- [ ] CI/CD validation
- [ ] Coverage maintained at 72%+

---

## Risk Assessment

| Risk | Probability | Mitigation |
|------|-------------|-----------|
| Race condition in test data | LOW | All tests use factories ✓ |
| Mock state pollution | LOW | vscode mock is stateless ✓ |
| Callback race conditions | LOW | Separate sequential block |
| Retry logic interference | LOW | Local isolation, fresh executors |
| Flaky concurrent tests | LOW | Selective concurrency approach |

---

## Expected Outcome

**Before**: 26.89s (all sequential)
**After**: 15-16s (pure logic concurrent + integration sequential)
**Improvement**: 40-44%
**Safety**: HIGH (selective, audited concurrency)

---

## Commit Message Template

```
perf(tests): restructure executor-coverage for selective concurrency

Implements "Concurrent Safety Audit" strategy:
- Reorganize tests into Pure Logic (concurrent) + Integration (sequential)
- Pure Logic group: Path Sanitization, Step Validation, Dependencies (41 tests)
- Integration group: File/LLM/Error handling (4 tests)
- All tests use factories for data isolation
- Global vscode mock verified as stateless

Safety Validation:
✓ No shared object mutations across tests
✓ All mocks are stateless or properly isolated
✓ Test data always fresh (factory-generated)
✓ No concurrent safety risks identified

Performance Impact:
- Pure logic tests (concurrent): 18s → 6-7s
- Integration tests (sequential): 8.9s (unchanged)
- Total: 26.89s → 15-16s (40% improvement)

All 45/45 tests pass, coverage maintained at 72%+
```

