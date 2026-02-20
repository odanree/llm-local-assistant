# Executor Coverage Test Optimization Plan (v2.9.0)

**Goal**: Reduce executor-coverage-extension test runtime from 20+ seconds to <10 seconds (50%+ improvement)
**Branch**: `feat/test-performance-optimization`
**Target Release**: v2.9.0 (MINOR - performance improvement)

---

## Current Baseline

```
Test Suite: executor-coverage-extension.test.ts
Current Runtime: 20+ seconds
Target Runtime: <10 seconds
Improvement Target: 50%+
```

---

## Optimization Strategy (Ranked by Impact)

### Phase 1: Parallel Execution (Highest Impact - Est. 5-8s savings)

Enable concurrent test execution to leverage CPU cores and run isolated tests in parallel.

**Implementation Steps:**

1. **Convert top-level describe block to concurrent**
   ```typescript
   describe.concurrent('Executor Coverage Extension', () => {
     // All tests inside now run in parallel
   });
   ```

2. **Enable concurrent mode for isolated test blocks**
   - Identify tests that don't share mutable state
   - Add `.concurrent` to those describe/it blocks
   - Tests using separate mock instances = safe to parallelize

3. **Safety Check**
   - Verify mocks are properly isolated (separate instances per test)
   - Ensure no shared file system operations
   - Validate no race conditions on module exports

**Vitest Config Requirement:**
```javascript
// vitest.config.mjs
export default {
  test: {
    threads: true,
    maxThreads: 4,  // Adjust based on CPU cores
    minThreads: 1,
  }
}
```

**Expected Savings**: 5-8 seconds (parallel vs sequential waterfall)

---

### Phase 2: Optimize beforeEach Setup (High Impact - Est. 3-5s savings)

Heavy setup code in beforeEach is multiplied by test count. Identify and optimize.

**Implementation Steps:**

1. **Audit Current beforeEach**
   ```bash
   # Run with verbose flag to identify slow setups
   npx vitest run src/test/executor-coverage-extension.test.ts --reporter=verbose
   ```
   Look for tests taking >1000ms (hanging tests)

2. **Move Expensive Setup to beforeAll**
   - Tests that don't modify setup state → move to `beforeAll`
   - Only reset what actually changes per test (e.g., mock call history)

3. **Optimize mockFactory Creation**
   - Check if deepCloning unnecessary objects
   - Avoid re-parsing large JSON fixtures
   - Cache immutable test data

4. **Example Optimization:**
   ```typescript
   // BEFORE: Runs for every test
   beforeEach(() => {
     mockFactory = createMockFactory();  // Expensive
   });

   // AFTER: Setup once, reset minimally
   beforeAll(() => {
     mockFactory = createMockFactory();  // Only once
   });

   beforeEach(() => {
     mockFactory.reset();  // Just reset call counts
   });
   ```

**Expected Savings**: 3-5 seconds (reduced setup duplication)

---

### Phase 3: Eliminate Timing Delays (Medium Impact - Est. 2-4s savings)

Real timeouts (`setTimeout`, `await new Promise(...)`) are slow. Use fake timers.

**Implementation Steps:**

1. **Replace Real Delays with Fake Timers**
   ```typescript
   // BEFORE: Waits real 100ms per test
   it('test', async () => {
     action();
     await new Promise(r => setTimeout(r, 100));
     expect(result).toBe(true);
   });

   // AFTER: Instant
   beforeEach(() => {
     vi.useFakeTimers();
   });

   afterEach(() => {
     vi.restoreAllMocks();
   });

   it('test', async () => {
     action();
     await vi.runAllTimersAsync();  // Instant
     expect(result).toBe(true);
   });
   ```

2. **Find all timing in tests**
   - Search: `setTimeout`, `delay`, `wait`, `new Promise.*setTimeout`
   - Replace with `vi.useFakeTimers()` + `vi.runAllTimersAsync()`

3. **Verify Async Operations**
   - Ensure fake timers work with your executor's async patterns
   - Test Promise resolution order

**Expected Savings**: 2-4 seconds (eliminate all wait time)

---

### Phase 4: Optimize Coverage Instrumentation (Medium Impact - Est. 1-3s savings)

The v8 coverage provider instruments code; exclude unnecessary files.

**Implementation Steps:**

1. **Review vitest.config.mjs**
   ```javascript
   export default {
     test: {
       coverage: {
         provider: 'v8',
         exclude: [
           'node_modules',
           'dist',
           '**/*.test.ts',
           '**/*.fixtures.ts',
           'mock/**',
         ]
       }
     }
   }
   ```

2. **Check Transform Time**
   - Run: `npx vitest run --reporter=verbose 2>&1 | grep -i transform`
   - If >5s, you're over-instrumenting
   - Add more exclusions or reduce coverage scope for this test file

3. **Skip Coverage for This Test (Optional)**
   ```typescript
   describe.skip.concurrent('Executor Coverage Extension', () => {
     // If coverage isn't the goal, skip instrumentation
   });
   ```

**Expected Savings**: 1-3 seconds (faster instrumentation)

---

### Phase 5: Direct Imports (Low Impact - Est. 0.5-1s savings)

Barrel files trigger loading of everything; import directly.

**Implementation Steps:**

1. **Audit Test Imports**
   ```typescript
   // BAD: Loads all exported symbols
   import { executor, planner } from '../../src';

   // GOOD: Load only what you need
   import { executor } from '../../src/executor';
   ```

2. **Search and Replace**
   - Find: `import { ... } from '../src'` (barrel imports)
   - Replace with: `import { ... } from '../src/[moduleName]'`

3. **Verify Imports Still Work**
   - Run: `npm run lint`

**Expected Savings**: 0.5-1 second (faster module resolution)

---

## Implementation Roadmap

### Step 1: Establish Baseline (5 min)
```bash
npm run test -- src/test/executor-coverage-extension.test.ts --reporter=verbose
# Record the current runtime
```

### Step 2: Phase 1 - Concurrent Execution (30 min)
- [ ] Add `.concurrent` to top-level describe
- [ ] Verify test isolation
- [ ] Run baseline again
- **Expected**: 20s → ~15s

### Step 3: Phase 2 - beforeEach Optimization (45 min)
- [ ] Identify slow setup code
- [ ] Move to beforeAll where safe
- [ ] Optimize mockFactory
- [ ] Run baseline again
- **Expected**: 15s → ~11s

### Step 4: Phase 3 - Fake Timers (30 min)
- [ ] Replace all setTimeout with fake timers
- [ ] Test async behavior
- [ ] Run baseline again
- **Expected**: 11s → ~7-8s

### Step 5: Phase 4 - Coverage Optimization (20 min)
- [ ] Review coverage config
- [ ] Add exclusions
- [ ] Run baseline again
- **Expected**: 7-8s → ~6-7s

### Step 6: Phase 5 - Import Optimization (15 min)
- [ ] Audit and fix barrel imports
- [ ] Run baseline again
- **Expected**: 6-7s → ~6s (minor savings)

### Step 7: Verification & Documentation (20 min)
- [ ] Verify all tests still pass
- [ ] Document improvements
- [ ] Create PR with results
- [ ] Update CHANGELOG

**Total Time Estimate**: 2.5-3 hours
**Expected Result**: 20s → 6-7s (65% improvement)

---

## Testing Strategy

### Baseline Measurement
```bash
npx vitest run src/test/executor-coverage-extension.test.ts --reporter=verbose
```

### After Each Phase
```bash
npx vitest run src/test/executor-coverage-extension.test.ts --reporter=verbose --reporter=html
```

### Full Suite Validation
```bash
npm test
```

### Performance Monitoring
Track metrics:
- Total runtime
- Setup time
- Execution time per test
- Teardown time

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Concurrent tests fail | Start with Phase 1 only; revert if needed |
| Mock isolation issues | Use fresh mock instances; verify beforeEach |
| Fake timers break async | Use Promise-aware fake timers; test thoroughly |
| Coverage changes | Exclude only non-critical files |
| Breaking changes | Keep tests functionally identical; only optimize |

---

## Success Criteria

- ✅ All 45+ executor-coverage tests pass
- ✅ Runtime reduced to <10 seconds (from 20s+)
- ✅ No test reliability regressions
- ✅ No mock isolation issues
- ✅ Code coverage maintained at 72%+
- ✅ Zero flaky tests in 5 consecutive runs

---

## Commit Strategy

```
1. feat(perf): enable concurrent test execution
2. perf(tests): optimize beforeEach setup in executor-coverage
3. perf(tests): replace real timeouts with fake timers
4. perf(coverage): optimize v8 instrumentation config
5. perf(imports): consolidate barrel imports in test
6. docs(perf): update CHANGELOG and commit message with results
```

---

## Expected Outcome

```
Branch: feat/test-performance-optimization
Release: v2.9.0
Type: MINOR (performance improvement)

PR Title: perf(v2.9.0): 65% test performance improvement (20s → 6-7s)

Highlights:
- Enabled concurrent test execution
- Optimized setup and teardown
- Replaced timers with fake timers
- Refined coverage instrumentation
- Direct imports optimization

Result: executor-coverage test suite: 20+ seconds → 6-7 seconds
```

---

## Next Steps

1. ✅ Branch created: `feat/test-performance-optimization`
2. → Switch to implementation phase
3. → Run Phase 1-5 sequentially
4. → Create PR with metrics
5. → Merge to main for v2.9.0 release

