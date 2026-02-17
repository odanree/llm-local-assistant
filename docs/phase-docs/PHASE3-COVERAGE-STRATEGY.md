# Test Coverage Strategy: SE2 "Seatbelt" Plan

**Status**: Honest Assessment Complete
**Current State**: 41.36% statements (High-Risk Zone)
**Goal**: 70% statements with critical services at 85%+ (SE2 Healthy)

---

## Executive Assessment

You have the infrastructure (factories, test organization) but lack the armor (service/core logic coverage). This isn't failure—it's a normal SE2 refactor point. The "red flags" are real and must be addressed before scaling.

### Risk Dashboard

| Zone | Current | SE2 Target | Risk Level | Status |
|------|---------|-----------|-----------|--------|
| **Services** | 36.87% | 85%+ | 🔴 CRITICAL | Untested API calls, DB interactions, core logic |
| **Branches** | 37.86% | 65%+ | 🔴 CRITICAL | Complex if/else logic unexplored |
| **Statements** | 41.36% | 70%+ | 🔴 HIGH | 58% of code is "hope-based" |
| **Factories** | 19.71% | 70%+ | 🟠 MEDIUM | Tools that help tests are untested (meta-risk) |
| **Utils** | 68.48% | 90%+ | 🟢 LOW | Almost there, good foundation |
| **Constants** | 100% | 100% | ✅ PERFECT | No action needed |

---

## The "Red Flags" Decoded

### 1. **src/services (36.87%) — THE BIGGEST RISK**

This is where your application DOES WORK. Services typically contain:
- API/LLM client calls
- Data transformations
- Business logic
- State management

**Current Reality**: 63% of your service logic is untested.

**What can break**:
```typescript
// services/PromptEngine.ts (75.89% - some coverage but not comprehensive)
async generatePrompt(request: UserRequest): Promise<string> {
  // If THIS fails, your whole application fails
  // But 24% of this is untested
}

// services/SemanticValidator.ts (0% - COMPLETELY UNTESTED)
validateResponse(response: any): boolean {
  // This controls whether responses are accepted
  // 100% flying blind
}

// services/PatternInductionValidator.ts (0% - COMPLETELY UNTESTED)
inferPatternFromCode(code: string): Pattern {
  // Pattern inference with ZERO tests
}
```

**Impact**: If a service bug slips through, your tests will PASS while the app breaks in production.

### 2. **src/test/factories (19.71%) — THE META-PROBLEM**

You built factories to help tests be consistent. But the factories themselves are 80% untested!

**The Irony**:
```typescript
// If this factory is broken...
export function createMockLLMClient() {
  return {
    isServerHealthy: () => Promise.resolve(true),  // ← Always true!
    sendMessage: async () => "generic response",   // ← Generic response!
  };
}

// ...then ALL tests using it are testing a LIE
```

**Risk**: "Garbage in, garbage out." Your tests might pass because the mocks are wrong, not because your code is right.

### 3. **Branch Coverage (37.86% vs Statements 41.36%) — THE LOGIC GAP**

Lower branch coverage = You have complex conditional logic (if/else, switch, try/catch) that your tests don't explore.

**Example**:
```typescript
// You might test the happy path (statement covered)
if (response.ok) {
  return response.data;  // ← Tested
}

// But NOT the error path (branch not covered)
else {
  handleError(response);  // ← NOT tested
}
```

**Impact**: Error handling, edge cases, and fallbacks are invisible to your test suite.

---

## The "Green Flags" Analysis

### **src/utils (68.48%) — YOUR STRENGTH**

You're almost at 70%! This is your foundation:
- `diffGenerator.ts`: 90.17% ✅
- `virtualFileState.ts`: 85.96% ✅
- `workspaceDetector.ts`: 92.92% ✅

**Why this matters**: Utils are building blocks. Having these solid means your tests can trust helper functions.

### **src/constants (100%) — PERFECT**

No action needed. Constants don't need tests (they test themselves by existing).

---

## SE2 Action Plan: The Targeted Strike

Instead of trying to get 70% everywhere at once, you hit the **highest-ROI targets first**.

### **Phase 1: The Critical Service** (Week 1-2)

**Goal**: Pick ONE service and get it to 80%.

**Candidate: `src/services/PromptEngine.ts` (currently 75.89%)**

Why?
- Already has 75% coverage (close to goal)
- Smaller than other services (~250 lines)
- Direct impact on core functionality

**Action**:
1. Read the file and identify the 5 untested functions
2. Write 10-15 targeted tests for those functions
3. Target: 80%+ coverage

**Expected Effort**: 2-3 hours

**Expected Impact**: +5% coverage, +massive risk reduction

### **Phase 2: The Zero-Coverage Services** (Week 2-3)

**Goal**: Get ONE zero-coverage service to 50% (foundation).

**Candidates**:
- `src/services/SemanticValidator.ts` (0%)
- `src/services/PatternInductionValidator.ts` (0%)

**Action**:
1. Pick whichever one is used more frequently
2. Write basic tests for the 3-5 most important functions
3. Target: 50% (bare minimum for "not flying blind")

**Expected Effort**: 2-3 hours

**Expected Impact**: +2-3% coverage, +eliminates one "black box"

### **Phase 3: The Factory Tests** (Week 3)

**Goal**: Test the testers.

**Action**:
1. Write tests that verify each factory function returns valid objects
2. Example:
   ```typescript
   test('createMockLLMClient returns valid mock', () => {
     const mock = createMockLLMClient();
     expect(mock.isServerHealthy).toBeDefined();
     expect(typeof mock.isServerHealthy).toBe('function');
     // ... etc
   })
   ```
3. Target: 70%+ for all factories

**Expected Effort**: 1-2 hours

**Expected Impact**: +15% factory coverage, meta-confidence boost

### **Phase 4: The Branch Expansion** (Week 4+)

**Goal**: Identify and test the untested branches.

**Action**:
1. Use coverage report to find branches < 50%
2. Add conditional tests (happy path + error path)
3. Focus on try/catch blocks and error handlers

**Expected Effort**: 3-5 hours

**Expected Impact**: +5-10% coverage, +major error-path confidence

---

## Quick Wins: Low-Hanging Fruit (This Week)

### **Target 1: `src/types/validation.ts` (7.69%)**

Only 174 lines! This type validation file is crying for tests.

```bash
# Step 1: See what's not tested
npm test -- --coverage src/types/validation.ts

# Step 2: Write 5 tests covering the main validators
# Step 3: Expect 50% → 70% improvement immediately
```

**Time**: 1 hour
**Impact**: +1-2% overall, satisfying win

### **Target 2: `src/utils/pathSanitizer.ts` (14.7%)**

Path sanitization is a utility—should be nearly 100%.

```bash
# Test various path inputs:
# - Absolute paths
# - Relative paths
# - Windows vs Unix paths
# - Invalid characters
# - Edge cases (empty, null, etc.)
```

**Time**: 1.5 hours
**Impact**: +1-2% overall, improves utils from 68% → 72%

### **Target 3: `src/utils/jsonSanitizer.ts` (60%)**

Already 60%! Just need 10-15% more.

**Time**: 1 hour
**Impact**: +1% overall, pushes utils closer to 90%

---

## The 30-Day Roadmap

### **Week 1: Foundation (Quick Wins)**
- [ ] Add tests for `validation.ts` (8 tests, 1 hour)
- [ ] Add tests for `pathSanitizer.ts` (12 tests, 1.5 hours)
- [ ] Add tests for `jsonSanitizer.ts` (8 tests, 1 hour)
- **Target**: 41.36% → 43-44%
- **Effort**: 3.5 hours

### **Week 2: Critical Service**
- [ ] Analyze `PromptEngine.ts` untested paths
- [ ] Write 15 targeted tests
- [ ] Get to 85%+
- **Target**: 43% → 45-46%
- **Effort**: 3 hours

### **Week 3: Zero-Coverage**
- [ ] Pick `SemanticValidator` or `PatternInductionValidator`
- [ ] Write 20 tests for the most critical functions
- [ ] Get to 50%
- **Target**: 45% → 47-48%
- **Effort**: 3 hours

### **Week 4: Factory Tests + Branch Coverage**
- [ ] Test factory functions (8 tests, 1 hour)
- [ ] Expand executor.ts error branches (15 tests, 2 hours)
- [ ] Expand planner.ts error branches (15 tests, 2 hours)
- **Target**: 47% → 50-52%
- **Effort**: 5 hours

### **End of Month Goal**: 50%+ coverage (realistic), 59% services (vs 36% today)

---

## File-by-File Priority Matrix

### **CRITICAL (Do First)**

| File | Current | Priority | Why |
|------|---------|----------|-----|
| `services/SemanticValidator.ts` | 0% | 🔴 P0 | Validator untested = validation untested |
| `services/PatternInductionValidator.ts` | 0% | 🔴 P0 | Pattern inference untested = patterns untested |
| `executor.ts` | 31.35% | 🔴 P1 | Core execution logic mostly untested |
| `planner.ts` | 39.25% | 🔴 P1 | Plan generation 60% untested |
| `test/factories` | 19.71% | 🟠 P2 | Factories themselves need testing |

### **HIGH VALUE (Do Second)**

| File | Current | Priority | Why |
|------|---------|----------|-----|
| `types/validation.ts` | 7.69% | 🟠 P2 | Quick win (174 lines) |
| `utils/pathSanitizer.ts` | 14.7% | 🟠 P2 | Quick win (utils are foundational) |
| `llmClient.ts` | 57.89% | 🟠 P2 | Mid-range, easy wins available |
| `refactoringExecutor.ts` | 42.34% | 🟠 P2 | Just below threshold, low effort |

### **NICE TO HAVE (Do Third)**

| File | Current | Priority | Why |
|------|---------|----------|-----|
| `gitClient.ts` | 3.17% | 🟢 P3 | Low priority if git is not core path |
| `systemAnalyzer.ts` | 0.66% | 🟢 P3 | Low priority if analysis is optional |
| `semanticCorrection.ts` | 0% | 🟢 P3 | Low priority if corrections are fallback |

---

## How to Execute This Plan

### **Step 1: Pick One Quick Win**
```bash
# Choose: validation.ts, pathSanitizer.ts, or jsonSanitizer.ts
npm test -- src/types/validation.ts --coverage

# Identify untested lines
# Write 5-8 tests to cover them
# Commit: test: improve validation.ts coverage to 50%
```

### **Step 2: Analyze the Critical Service**
```bash
# Pick: PromptEngine.ts (75.89%)
npm test -- src/services/PromptEngine.ts --coverage

# Open coverage/index.html and see exact uncovered lines
# Read the code, understand the logic
# Write tests for branches/edge cases
# Commit: test: expand PromptEngine coverage to 85%
```

### **Step 3: Monitor Progress**
```bash
# Run full suite with coverage
npm test -- --coverage

# Track week-to-week progress
# Expected: 41% → 43% → 45% → 48% → 50%+ by month end
```

---

## The Seatbelt Checklist

Before you ship v3.0, you need:

- [ ] **Services**: At least ONE service at 80%+
- [ ] **Factories**: At least 70% (so mocks are trustworthy)
- [ ] **Branches**: 50%+ (so error paths exist in tests)
- [ ] **Overall**: 50%+ (so you have basic safety net)

If you hit these, you're no longer "flying blind." You're at SE2 level.

---

## Why This Order?

**Services First**: Because service bugs are silent. Your tests can pass while the app breaks.

**Factories Second**: Because if your test tools are broken, everything else is a lie.

**Quick Wins Third**: Because momentum matters. Hitting 43-44% fast keeps morale high.

**Branches Last**: Because once you have coverage, expanding to branches is straightforward.

---

## Expected Timeline

| Milestone | Week | Coverage | Risk Level |
|-----------|------|----------|-----------|
| **Start** | 0 | 41% | 🔴 High |
| **Quick Wins Done** | 1 | 43-44% | 🔴 High |
| **Critical Service Done** | 2 | 45-46% | 🟠 Medium |
| **Zero-Coverage Done** | 3 | 47-48% | 🟠 Medium |
| **Factories + Branches Done** | 4 | 50-52% | 🟢 Low-Medium |
| **SE2 "Seatbelt" Goal** | 6-8 | 70%+ | 🟢 Low |

---

## The Bottom Line

You're not "behind." You're at the start of a disciplined refactor. The infrastructure is right. You just need to:

1. **Test one service deeply** (not all services shallowly)
2. **Test your test tools** (factories must be trustworthy)
3. **Cover the branches** (error paths, not just happy paths)
4. **Monitor momentum** (celebrate 43%, 45%, 48% as wins)

By end of month, you'll have 50%+ coverage and SE2-level confidence.

By end of Q1, you'll have 70%+ and be production-ready.

---

**Generated**: February 16, 2025
**Status**: Ready for Phase 3 (Critical Service Deep Dive)
**Next Action**: Pick one quick win and start
