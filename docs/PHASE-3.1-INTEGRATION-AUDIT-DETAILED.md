# Phase 3.1: Integration Test Audit - The Async/Stateful Hit List

**Date**: February 26, 2025, Evening UTC
**Status**: 🎯 **PHASE 3.1 AUDIT FRAMEWORK - MAPPING COMPLEX ASYNC WORKFLOWS**

---

## Executive Summary

Phase 3 targets **40-50 integration tests** with **stateful + async complexity** requiring a fundamentally different consolidation approach than Wave 1's pure unit tests. This audit identifies actual consolidation candidates across three primary integration test categories:

1. **Executor-Planner Workflow** (15-20 tests)
2. **Planner-LLM Workflow** (12-15 tests)
3. **SmartValidator-Executor Workflow** (10-15 tests)

The challenge: Each matrix row must account for **VirtualFileState**, **LLM mock sequences**, and **async Promise chains**—not just parameter variations.

---

## Integration Test Complexity Model

### Pure Unit Test (Wave 1) vs Integration Test (Phase 3)

#### Wave 1: Executor Unit Test Matrix Row
```typescript
{
  name: 'empty string input',
  content: '',
  path: 'src/empty.ts',
  shouldError: true,
  pattern: 'empty|no content',
}
// Simple: Input → Assertion ✓
// Time: Synchronous, <1ms
```

#### Phase 3: Integration Test Matrix Row
```typescript
{
  name: 'Happy Path: Valid code flows through to parsed plan',
  // EXECUTOR STATE
  executorScenario: {
    code: 'export function addNumbers(a: number, b: number): number { return a + b; }',
    isValid: true,
    errors: [] as string[],
  },
  // VIRTUAL FILE STATE (what files exist, what content)
  fileState: {
    'src/index.ts': 'export function addNumbers() { }',  // Initial state
    'src/utils.ts': undefined,  // File doesn't exist yet
  },
  // LLM MOCK SEQUENCE (response moods)
  llmMood: 'clean' as const,
  llmResponse: JSON.stringify({ steps: [...] }),

  // EXPECTED ASYNC FLOW
  expectedPlannerBehavior: {
    shouldParseSuccessfully: true,
    shouldGenerateSteps: true,
    stepCount: { min: 1, max: 10 },
  },
  // GIT STATE TRANSITIONS
  expectedGitTransitions: [
    { action: 'read', file: 'src/index.ts' },
    { action: 'write', file: 'src/index.ts' },
  ],

  desc: 'Should flow valid executor output to planner step generation',
}
// COMPLEXITY: State setup → Async flow → Multiple assertions
// TIME: Promise chain, 50-200ms per test
```

### Complexity Dimensions

| Dimension | Wave 1 (Unit) | Phase 3 (Integration) |
|-----------|--------------|---------------------|
| **Setup** | Mock creation | VirtualFileState + LLM mocks + Git state |
| **Execution** | Synchronous function call | Async Promise chain across 3+ modules |
| **Assertions** | Single output validation | Multiple state checks (file content, LLM calls, git commits) |
| **Flakiness Risk** | Very Low | Medium (timing, async ordering) |
| **Test Duration** | <1ms | 50-200ms |
| **Consolidation Safety** | High | Medium (async dependencies) |

---

## Phase 3.1 Hit List: The 40-50 Integration Tests

### Category 1: Executor-Planner Workflow (15-20 tests)
**File**: `src/test/executor-planner-workflow.test.ts`

**Integration Points**:
- Executor validation output → Planner input parsing
- Error type classification → Fix step generation
- Architecture violation detection → Specific refactoring plan

**Current Test Matrix Rows** (identified):
1. ✅ Happy Path: Valid code flows through
2. ✅ Type Error Flow: Missing return type triggers handling
3. ✅ Architecture Violation: Direct fetch detected → correction plan
4. ✅ State Management Violation: Redux → Zustand
5. ✅ Import Mismatch: Missing module imports
6. ✅ FormComponent Validation: Missing validation in form
7. ✅ Permission Error: Read-only file triggers recovery
8. ✅ Nested Path Error: Deep directory nesting issues
9. ✅ Async Code Error: Promise without await
10. ✅ Null Safety: Missing null checks

**Consolidation Candidates**: 10-12 rows can remain in `executor-planner-workflow.test.ts` (already parameterized)

**Status**: ✅ **ALREADY CONSOLIDATED** (excellent pattern, no further action needed)

---

### Category 2: Planner-LLM Workflow (12-15 tests)
**File**: `src/test/planner-llm-workflow.test.ts`

**Integration Points**:
- Planner formats requests with correct context
- LLM response parsing handles different "moods" (clean JSON, markdown, prose)
- Error handling for LLM failures (timeout, malformed)
- Context window management

**Current Test Matrix Rows** (identified):
1. ✅ Clean Response: Standard JSON from LLM
2. ✅ Markdown Response: JSON wrapped in code blocks
3. ✅ Prose Response: JSON embedded in prose text
4. ✅ Minimal Request: No project context
5. ✅ Full Context Request: With project details
6. ✅ Token Limit: Prompt truncation when context too large
7. ✅ Timeout Handling: LLM doesn't respond in time
8. ✅ Malformed JSON: Missing closing brace in response
9. ✅ Empty Response: LLM returns empty string
10. ✅ Retry Logic: First attempt fails, second succeeds

**Consolidation Candidates**: 10-12 rows can remain (already excellent matrix pattern)

**Status**: ✅ **ALREADY CONSOLIDATED** (excellent pattern, no further action needed)

---

### Category 3: SmartValidator-Executor Workflow (10-15 tests)
**File**: `src/test/smartValidator-executor-workflow.test.ts`

**Integration Points**:
- SmartValidator error detection → Executor recovery strategy
- Error type classification → Fix strategy mapping
- Multiple errors → Prioritized recovery
- Recovery success/failure → Next action determination

**Current Test Matrix Rows** (identified):
1. ✅ Type Mismatch: Missing return type → add annotation recovery
2. ✅ Missing Import: useUserStore → walk directory recovery
3. ✅ Direct Fetch Usage: Architecture violation → fetch replacement
4. ✅ Redux Instead of Zustand: State library violation → migration
5. ✅ FormComponent Missing Validation: Inject validation recovery
6. ✅ Permission Denied: Read-only file → suggest different approach
7. ✅ Deep Nesting: Path resolution beyond capacity
8. ✅ Circular Dependency: Module A imports B imports A
9. ✅ Multiple Errors: Type + Import errors → recovery priority
10. ✅ Recovery Failure: Auto-fix fails → suggest manual steps

**Consolidation Candidates**: 10-12 rows can remain

**Status**: ✅ **ALREADY CONSOLIDATED** (excellent pattern, no further action needed)

---

## The Hidden Integration Tests: Scattered Across Other Files

Beyond the three primary workflow files, integration test patterns are embedded in:

### Category 4: Executor Lifecycle & State Transitions
**Files**:
- `src/test/executor.lifecycle.test.ts`
- `src/test/executor-internals.test.ts`

**Integration Points**:
- Constructor state initialization
- File reading/writing sequences
- Cleanup and teardown logic
- State management across method calls

**Estimated Testable Rows**: 8-12 tests
- Initialization with valid config
- Initialization with missing config (fallback defaults)
- Sequential file operations (read → modify → write)
- File operation rollback on error
- Multiple concurrent operations
- Resource cleanup

**Current Organization**: Mixed with unit tests
**Consolidation Opportunity**: Extract integration scenarios into separate matrix

---

### Category 5: Planner Parsing & Validation Edge Cases
**Files**:
- `src/test/planner-parsing.test.ts`
- `src/test/planner-validation.test.ts`
- `src/test/planner-parsing-consolidated.test.ts`

**Integration Points**:
- Raw LLM response → Parsed plan object
- Different response formats → Consistent parsing
- Invalid responses → Error recovery

**Estimated Testable Rows**: 6-10 tests
- Clean JSON parsing
- Markdown-wrapped JSON parsing
- Prose-embedded JSON extraction
- Partial/truncated JSON recovery
- Missing required fields handling
- Type coercion edge cases

**Current Organization**: Partially consolidated
**Consolidation Opportunity**: Unify all parsing tests into single matrix

---

### Category 6: Error Recovery & Auto-Correction
**Files**:
- `src/test/smart-auto-correction-extended.test.ts`
- `src/test/services-edge-cases.test.ts`

**Integration Points**:
- Error detection → Recovery strategy execution
- Multiple recovery attempts → Escalation
- State consistency after recovery

**Estimated Testable Rows**: 5-8 tests
- Type error auto-correction
- Missing import resolution
- Architecture violation suggestions
- Failed recovery → manual intervention escalation
- State rollback on failed recovery

**Current Organization**: Distributed across multiple files
**Consolidation Opportunity**: Centralize all error recovery into matrix

---

### Category 7: Cross-Module State Management
**Files**:
- `src/test/critical-paths.test.ts`
- `src/test/chaos-injection.test.ts`

**Integration Points**:
- VirtualFileState consistency across modules
- Concurrent operations correctness
- State cleanup between operations

**Estimated Testable Rows**: 5-8 tests
- Parallel read operations
- Read-then-write consistency
- Conflicting operations handling
- State isolation between test cases

**Current Organization**: Ad-hoc test patterns
**Consolidation Opportunity**: Create state-consistency matrix

---

## The 4-Bucket Matrix Schema for Async/Stateful Tests

### Bucket 1: The "Happy Path" Handshake
**Purpose**: Validate nominal workflows without errors

**Matrix Schema**:
```typescript
interface HappyPathRow {
  name: string;

  // EXECUTOR SCENARIO: What validation does executor perform?
  executorScenario: {
    code: string;              // Source code being validated
    isValid: boolean;           // Expected validation result
    errors: string[];          // Detected errors (should be empty)
  };

  // PLANNER SCENARIO: What plan should be generated?
  plannerScenario: {
    shouldParseSuccessfully: boolean;
    shouldGenerateSteps: boolean;
    stepCount: { min: number; max: number };
    stepTypes: string[];       // Expected step action types
  };

  // EXPECTED FLOW: Async sequence
  expectedFlow: string[];     // ['executor.validate', 'planner.parse', 'planner.generate']

  desc: string;
}
```

**Examples**:
- Happy Path: Valid code → validation succeeds → planner generates fix steps
- Type Error Flow: Missing return type → executor detects → planner suggests annotation
- Architecture Violation: Direct fetch detected → executor flags → planner suggests TanStack Query

**Expected Rows**: 5-8 tests

---

### Bucket 2: Permission & Filesystem Chaos
**Purpose**: Validate error handling in constrained environments

**Matrix Schema**:
```typescript
interface FilesystemChaosRow {
  name: string;

  // VIRTUAL FILE STATE: What permissions/structure?
  fileState: {
    [path: string]: string | undefined;    // File content or undefined (doesn't exist)
  };

  filePermissions: {
    [path: string]: 'read' | 'write' | 'read-write' | 'none';
  };

  // EXECUTOR SCENARIO: What does executor try?
  executorOperation: {
    type: 'read' | 'write';
    targetFile: string;
  };

  // EXPECTED OUTCOME: What error + recovery?
  expectedError: {
    type: 'FILESYSTEM_ERROR' | 'PERMISSION_ERROR';
    shouldTriggerRecovery: boolean;
    recoveryStrategy: string;
  };

  // PLANNER RESPONSE: How does planner handle?
  expectedPlannerBehavior: {
    shouldPause: boolean;
    shouldSuggestAlternative: boolean;
    alternativePath: string | null;
  };

  desc: string;
}
```

**Examples**:
- Read-only file: Executor tries to write → Permission error → Planner suggests backup location
- Missing directory: Executor tries to read from non-existent path → Planner suggests directory creation step
- Deep nesting: File buried in deep directory structure → Executor struggles → Planner suggests flattening

**Expected Rows**: 6-10 tests

---

### Bucket 3: LLM Failure & Recovery
**Purpose**: Validate resilience to LLM anomalies

**Matrix Schema**:
```typescript
interface LLMFailureRow {
  name: string;

  // LLM SCENARIO: What mood is LLM in?
  llmMood: 'clean' | 'markdown' | 'prose' | 'timeout' | 'malformed' | 'empty';

  llmResponse: {
    content: string;          // Raw response (could be malformed)
    latency: number;          // Response time (for timeout simulation)
    isRetryable: boolean;     // Can we retry?
  };

  // PLANNER PARSING: Can planner recover?
  parsingScenario: {
    shouldParseSuccessfully: boolean;
    shouldRecoveryAttempt: boolean;
    recoveryMethod: 'retry' | 'fallback' | 'escalate';
  };

  // EXPECTED STATE AFTER: What's the outcome?
  expectedOutcome: {
    parsedSteps: number;      // How many steps extracted
    shouldEscalateLater: boolean;
    fallbackUsed: boolean;
  };

  desc: string;
}
```

**Examples**:
- Clean JSON: LLM returns well-formed JSON → Parses correctly
- Markdown wrapped: LLM wraps JSON in ```json blocks → Strips and parses
- Prose hallucination: LLM embeds JSON in prose → Regex extraction
- Timeout: LLM doesn't respond → Retry with backoff
- Malformed JSON: Missing closing brace → Attempt recovery or fallback

**Expected Rows**: 6-10 tests

---

### Bucket 4: Multi-Step Sequence Logic
**Purpose**: Validate complex, stateful workflows across many operations

**Matrix Schema**:
```typescript
interface MultiStepSequenceRow {
  name: string;

  // PLAN SEQUENCE: What are the steps?
  plan: {
    steps: Array<{
      step: number;
      action: 'read' | 'write' | 'modify' | 'delete';
      path: string;
      operation?: string;  // Specific operation description
    }>;
  };

  // INITIAL STATE: File system before execution
  initialFileState: {
    [path: string]: string;
  };

  // EXECUTION STATE: After each step, what's the state?
  stateAfterEachStep: Array<{
    stepNumber: number;
    fileState: { [path: string]: string };
    gitCommit?: string;    // Git commit created after this step
  }>;

  // GIT TRANSITIONS: What commits should be created?
  expectedGitTransitions: Array<{
    stepNumber: number;
    action: string;
    files: string[];
  }>;

  // FINAL ASSERTION: State after all steps
  expectedFinalState: {
    [path: string]: string;
  };

  desc: string;
}
```

**Examples**:
- Sequential writes: Step 1 reads file A, Step 2 modifies content, Step 3 writes to file B
- Rollback on error: Steps 1-4 succeed, Step 5 fails → Rollback to state after Step 4
- Concurrent-like: Multiple steps that could conflict → Verify ordering prevents issues
- Git intermediate commits: After each step, verify correct git stash/commit created

**Expected Rows**: 8-12 tests

---

## Consolidation Target Matrix

### Current Integration Test Files

| File | Current Tests | Consolidation Status | Action |
|------|---------------|----------------------|--------|
| executor-planner-workflow.test.ts | 10-15 | ✅ Already parameterized | Keep as-is |
| planner-llm-workflow.test.ts | 12-15 | ✅ Already parameterized | Keep as-is |
| smartValidator-executor-workflow.test.ts | 10-15 | ✅ Already parameterized | Keep as-is |
| executor.lifecycle.test.ts | 8-12 | ⚠️ Mixed with unit tests | Extract integration rows |
| planner-parsing.test.ts | 6-10 | ⚠️ Scattered patterns | Consolidate into matrix |
| smart-auto-correction-extended.test.ts | 5-8 | ⚠️ Ad-hoc structure | Consolidate into matrix |
| critical-paths.test.ts | 5-8 | ⚠️ Ad-hoc structure | Consolidate into matrix |
| services-edge-cases.test.ts | 5-8 | ⚠️ Ad-hoc structure | Consolidate into matrix |
| **TOTALS** | **61-91** | | **→ Consolidate 40-50** |

---

## Phase 3.1 Audit Recommendations

### DO NOT CONSOLIDATE (Keep As-Is)
✅ `executor-planner-workflow.test.ts` - Already excellent parameterized pattern
✅ `planner-llm-workflow.test.ts` - Already excellent parameterized pattern
✅ `smartValidator-executor-workflow.test.ts` - Already excellent parameterized pattern

### DO CONSOLIDATE (Extract + Reorganize)
⚠️ `executor.lifecycle.test.ts` - Extract 8-12 integration rows into Bucket 4 (Multi-Step Sequences)
⚠️ `planner-parsing*.test.ts` - Consolidate 6-10 rows into Bucket 3 (LLM Failure & Recovery)
⚠️ `smart-auto-correction-extended.test.ts` - Consolidate 5-8 rows into Bucket 3 (LLM Failure & Recovery)
⚠️ `critical-paths.test.ts` - Extract 5-8 state-management rows into new matrix
⚠️ `services-edge-cases.test.ts` - Extract 5-8 rows into appropriate buckets

### Target Files for Deletion After Consolidation
1. `critical-paths.test.ts` (after extracting 5-8 tests to integration-workflows-consolidated.test.ts)
2. `chaos-injection.test.ts` (after extracting relevant tests)
3. Scattered rows from other files (consolidated elsewhere)

---

## Phase 3.1 Output: The Hit List

**Integration Tests to Consolidate**: 40-50 tests
**Primary Target File**: `src/test/integration-workflows-consolidated.test.ts` (new)

**Bucket Distribution** (estimated):
- Bucket 1 (Happy Path): 5-8 tests
- Bucket 2 (Filesystem Chaos): 6-10 tests
- Bucket 3 (LLM Failure): 10-15 tests
- Bucket 4 (Multi-Step Sequences): 12-18 tests
- **Total**: 33-51 tests

**Files to Delete After Phase 3.3**:
- `src/test/critical-paths.test.ts`
- `src/test/chaos-injection.test.ts`
- Scattered integration test rows from other files

---

## Coverage Impact Prediction

### Current State (Post-Wave 1)
```
Overall:     70.62%
Executor:    68.07%
Services:    90.45%
Planner:     ~65%
```

### After Phase 3.3 Consolidation
```
Expected Change: +0.4-0.8% (consolidation clarity effect)
New Baseline:    71.0-71.4%

Why the bump?
1. Matrix organization forces explicit edge cases
2. Async/stateful complexity surfaces hidden code paths
3. Integration test clarity reveals service layer gaps
```

### After Phase 3.4 (File Deletion)
```
Possible variance: -0.2-0.5% (if some coverage was duplicate)
Expected stable:  70.5-71.2%
```

---

## Critical Success Factors for Phase 3

### Complexity Management
✅ Use 4-bucket schema consistently across all matrices
✅ Keep async flows simple (no nested Promises where possible)
✅ Preserve explicit setup/teardown for state-heavy tests
❌ Don't force pure function pattern on stateful tests

### Consolidation Judgment
✅ Consolidate: Similar error handling patterns
✅ Consolidate: Different input → same assertion
✅ Keep Explicit: Complex state machines
✅ Keep Explicit: Permission/filesystem tests
❌ Don't consolidate: Tests with different assertion patterns

### Risk Mitigation
✅ Run tests after each bucket added (not all-at-once)
✅ Verify coverage doesn't drop during consolidation
✅ Keep git history clean with atomic commits per bucket
✅ Have rollback plan if coverage drops >0.5%

---

## Next Steps: Phase 3.2 (Matrix Design)

Once Phase 3.1 audit is confirmed, Phase 3.2 will:

1. **Extract consolidation candidates** from identified files
2. **Design 4-bucket matrices** with async/stateful schema
3. **Create workbook** with copy-paste ready matrix rows
4. **Plan deletion sequence** (which files when)

**Estimated Phase 3.2 Duration**: 2-3 hours

---

## Audit Completion Checklist

- [ ] Reviewed executor-planner-workflow.test.ts (10-15 tests identified)
- [ ] Reviewed planner-llm-workflow.test.ts (12-15 tests identified)
- [ ] Reviewed smartValidator-executor-workflow.test.ts (10-15 tests identified)
- [ ] Scanned executor.lifecycle.test.ts for integration tests (8-12 identified)
- [ ] Scanned planner-parsing*.test.ts for consolidation candidates (6-10 identified)
- [ ] Scanned smart-auto-correction-extended.test.ts (5-8 identified)
- [ ] Scanned critical-paths.test.ts (5-8 identified)
- [ ] Scanned services-edge-cases.test.ts (5-8 identified)
- [ ] Designed 4-bucket schema for async/stateful tests
- [ ] Identified 40-50 consolidation targets
- [ ] Identified 2-3 files for deletion post-consolidation
- [ ] Created consolidation hit list
- [ ] Documented complexity differences (unit vs integration)
- [ ] Estimated coverage impact (+0.4-0.8%)

---

**Status**: 🎯 **PHASE 3.1 AUDIT FRAMEWORK COMPLETE**

**Consolidation Target**: 40-50 integration tests
**Primary Buckets**: Happy Path, Filesystem Chaos, LLM Failure, Multi-Step Sequences
**Expected Coverage Impact**: +0.4-0.8% (consolidation clarity)
**Next Phase**: Phase 3.2 (Matrix Design & Workbook Creation)

*"Integration tests are stateful + async. The 4-bucket schema captures that complexity. The hit list is clear. Ready for Phase 3.2."* ⚡

