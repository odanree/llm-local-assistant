# Test Coverage Plan: 58.46% → 70% Goal

**Status**: Active Phase  
**Current**: 58.46% baseline (1,345 tests passing)  
**Target**: 70% coverage across:
- Lines: 70%
- Functions: 70%
- Statements: 70%
- Branches: 65%

**Gap**: 11.54 percentage points (≈ 200-300 additional lines of test code)

---

## 📊 Current Coverage Analysis

### What's Covered (58.46% baseline)

✅ **Core Execution Paths**
- Executor: Step execution, write/read operations, validation
- Planner: Plan generation, step sequencing, dependency tracking
- DAG Validation: Topological sorting, cycle detection
- Git Client: Commit operations, diff generation
- LLM Client: Streaming, message handling, configuration

✅ **Architecture Analysis**
- Architecture Validator: Rule detection, pattern matching
- Semantic Analyzer: Code analysis, dependency detection
- Pattern Detector: Architecture pattern recognition

✅ **Testing Infrastructure**
- Test Factories: Mock generation, factory patterns
- Sanitizers & Utilities: Path sanitization, JSON handling

### What's Under-Covered (<58.46%)

❌ **Error Paths & Edge Cases** (Major Gap)
- Executor: Auto-correction attempts, error recovery, retry logic
- Planner: Malformed input handling, error propagation
- File operations: Permission errors, disk full scenarios
- Network issues: Timeout handling, LLM service failures

❌ **Integration Scenarios** (Moderate Gap)
- Cross-file validation: Store→Component binding (Phase 3c)
- Multi-step orchestration: Complex plan execution
- Workspace detection: Edge cases and unusual folder structures
- User interaction: Clarification questions, approval workflows

❌ **Specialized Modules** (Low coverage)
- Voice narration (TTS): Audio generation, fallback handling
- Markdown rendering: HTML conversion edge cases
- Windows-specific operations: ComSpec paths, PowerShell execution
- Configuration management: Settings validation, defaults

❌ **Performance & Optimization** (Not tested)
- Large file handling (>5MB)
- Batch operations (many files)
- Memory management under load
- Concurrent operations

---

## 🎯 Priority 1: High-Impact Tests (200-300 lines to +11% coverage)

### Phase 1a: Error Paths in Core Modules (3-4 days)

These fixes will likely add **4-6 percentage points** by covering error recovery.

#### 1. Executor Error Recovery Tests
**File**: `src/executor.test.ts`  
**Gap**: Auto-fix attempts, error handling, retry logic

```typescript
// Missing scenarios:
- attemptAutoFix() with file not found (ENOENT)
- attemptAutoFix() with permission denied (EACCES)
- attemptAutoFix() with directory vs file mismatch (EISDIR)
- askClarification() question flow with user response
- Retry logic with max retries exceeded
- Error propagation from LLM failures
- Stack trace collection and logging
- Validation error categorization (critical vs suggestions)
- Step contract validation (manual hallucinations)
- Circular dependency detection in reorderStepsByDependencies()
- Greenfield workspace guards (READ on empty workspace)
```

**Effort**: ~40 tests (80-120 lines)  
**Expected Impact**: +2-3%

#### 2. Planner Error Handling Tests
**File**: `src/planner.test.ts`  
**Gap**: Invalid input, malformed responses, error recovery

```typescript
// Missing scenarios:
- LLM returns non-JSON response
- LLM returns empty or null response
- Plan with circular step dependencies
- Step with missing required fields (action, stepId)
- Invalid step actions (typos: 'write' vs 'writ')
- Step with conflicting dependencies
- Timeout during plan generation
- Out-of-context responses (plan for wrong project)
- Plan with duplicate step IDs
- Oversized plans (>100 steps)
```

**Effort**: ~25 tests (50-80 lines)  
**Expected Impact**: +1-2%

#### 3. LLMClient Failure Scenarios
**File**: `src/llmClient.test.ts`  
**Gap**: Network failures, malformed responses, timeout handling

```typescript
// Missing scenarios:
- Server unreachable (ECONNREFUSED)
- Request timeout (AbortController trigger)
- Malformed SSE stream (incomplete chunks)
- Non-streaming endpoint fallback behavior
- Token accumulation with empty deltas
- History management with failed requests
- Model name validation
- Temperature/maxTokens bounds checking
- Concurrent request handling
- Connection retry logic
```

**Effort**: ~30 tests (60-100 lines)  
**Expected Impact**: +1.5-2%

---

### Phase 1b: Integration Tests (3-4 days)

These tests verify cross-module interactions, likely adding **3-5 percentage points**.

#### 4. Cross-File Validation Integration
**File**: `src/test/integration-validation.test.ts` (NEW)  
**Gap**: Store→Component binding, schema imports, multi-file orchestration

```typescript
// Zustand Store Pattern:
- LoginForm.tsx imports useLoginStore from stores/
- Component destructures hooks correctly: const { login } = useLoginStore()
- Store exports match what component expects
- No unused imports between files
- Component uses store methods correctly

// Zod Schema Pattern:
- Schema (z.object) is exported from schema.ts
- Store imports and uses schema: z.ZodType
- Component receives validated data from store
- TypeScript types align across all three files

// Test structure:
{
  filePath: 'src/stores/useLoginStore.ts',
  content: '...',  // Full store implementation
  exports: ['login', 'logout', 'isLoading']
}
→ Component tries to use these exports
→ Validator checks all are actually imported
→ Validator checks all are actually used
```

**Effort**: ~35 tests (70-110 lines)  
**Expected Impact**: +2-2.5%

#### 5. Multi-Step Execution Flow
**File**: `src/test/execution-flow.test.ts` (NEW)  
**Gap**: Complex plans with 5+ steps, dependency chains

```typescript
// Scenarios:
- Write Store → Write Component → Read Both → Verify Integration
- Write Schema → Write Store → Write Component → Run Tests
- Read Existing → Modify → Write → Validate No Breakage
- Sequential file generation with import ordering
- Validation at each step vs. after all steps
```

**Effort**: ~20 tests (40-70 lines)  
**Expected Impact**: +1.5-2%

#### 6. Workspace Detection Edge Cases
**File**: `src/utils/workspaceDetector.test.ts`  
**Gap**: Unusual directory structures, confidence scoring

```typescript
// Missing scenarios:
- Deeply nested projects (>5 levels)
- Sparse project markers (only tsconfig, no package.json)
- Multiple workspace standards (npm + yarn + pnpm in same dir)
- Git submodules detected as workspaces
- Symlinks and circular path references
- Permission-denied folders (no read access)
- Very large directory listings (>1000 entries)
- Confidence scoring edge cases
```

**Effort**: ~20 tests (40-60 lines)  
**Expected Impact**: +1-1.5%

---

## 📈 Priority 2: Specialized & Edge Cases (100-150 lines to +4-5%)

### Phase 2a: Voice & Markdown Features

#### 7. Voice Narration Edge Cases
**File**: `src/test/voice-narration.test.ts` (NEW)  
**Gap**: TTS failures, long explanations, special characters

```typescript
// Scenarios:
- TTS service unavailable (fallback to text)
- Very long explanations (>5000 chars, multiple chunks)
- Special characters in content (< > & quotes)
- Unicode handling (emoji, accents)
- Duration calculation accuracy
- MP3 bitrate formula edge cases
- Callback error handling
```

**Effort**: ~15 tests (30-50 lines)  
**Expected Impact**: +0.5-1%

#### 8. Markdown Rendering
**File**: `src/test/markdown-rendering.test.ts` (NEW)  
**Gap**: Complex markdown, type annotation escaping

```typescript
// Scenarios:
- Generic type notations (<T extends Foo>)
- Code blocks with language tags
- Mixed lists (nested, mixed ordered/unordered)
- Blockquotes with nested formatting
- Very long markdown (performance)
- Invalid markdown (mixed closing tags)
- HTML entity encoding
```

**Effort**: ~15 tests (30-50 lines)  
**Expected Impact**: +0.5-1%

### Phase 2b: Platform-Specific Tests

#### 9. Cross-Platform Execution
**File**: `src/test/cross-platform.test.ts` (NEW)  
**Gap**: Windows ComSpec, PowerShell paths, Unix commands

```typescript
// Scenarios:
- Windows paths with spaces: C:\Program Files\...
- PowerShell escape sequences
- Unix vs Windows line endings in files
- Command execution on Windows vs macOS/Linux
- Environment variable handling across platforms
- Temp folder creation and cleanup
```

**Effort**: ~15 tests (30-50 lines)  
**Expected Impact**: +0.5-1%

---

## 🛠️ Implementation Roadmap

### Week 1: Core Error Paths (Phase 1a)
```bash
# Create test files
touch src/test/executor-errors.test.ts
touch src/test/planner-errors.test.ts
touch src/test/llmclient-failures.test.ts

# Run tests incrementally
npm test -- src/test/executor-errors.test.ts --coverage
npm test -- src/test/planner-errors.test.ts --coverage
npm test -- src/test/llmclient-failures.test.ts --coverage
```

**Expected Progress**: 58.46% → 62-65%

### Week 2: Integration Tests (Phase 1b)
```bash
touch src/test/integration-validation.test.ts
touch src/test/execution-flow.test.ts
touch src/test/workspace-detection-edge-cases.test.ts

npm test -- src/test/integration-validation.test.ts --coverage
npm test -- src/test/execution-flow.test.ts --coverage
```

**Expected Progress**: 62-65% → 68-70%

### Week 3: Polish & Edge Cases (Phase 2)
```bash
touch src/test/voice-narration.test.ts
touch src/test/markdown-rendering.test.ts
touch src/test/cross-platform.test.ts

npm test -- --coverage
```

**Expected Final**: 70%+ ✅

---

## 📋 Test Template Patterns

### Error Path Testing Pattern
```typescript
describe('Error Recovery', () => {
  it('should recover from ENOENT (file not found)', async () => {
    const step = { action: 'read', path: '/nonexistent/file.ts' };
    const result = await executor.executeStep(step);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('ENOENT');
    expect(result.suggestedFix).toBeDefined();
  });
});
```

### Integration Testing Pattern
```typescript
describe('Cross-File Integration', () => {
  it('should bind store exports to component imports', () => {
    const files = {
      store: 'export const useStore = () => ({ data: [] })',
      component: 'const { data } = useStore()',
    };
    
    const validation = validator.validateCrossFileIntegration(files);
    expect(validation.isValid).toBe(true);
    expect(validation.bindings).toContain('data');
  });
});
```

---

## 🎯 Success Metrics

| Metric | Current | Target | Delta |
|--------|---------|--------|-------|
| Coverage % | 58.46% | 70% | +11.54% |
| Tests | 1,345 | 1,500+ | +155 |
| Pass Rate | 100% | 100% | ✅ |
| Lines Covered | ~2,400 | ~2,900 | +500 |
| Error Paths | ~40% | ~75% | +35% |
| Integration Tests | ~20 | ~100 | +80 |

---

## 📝 Execution Checklist

### Prerequisites
- [ ] Review current coverage gaps via `npm test -- --coverage`
- [ ] Identify lowest-coverage files
- [ ] Set up test file structure

### Phase 1a (Week 1)
- [ ] Executor error path tests (~40)
- [ ] Planner error handling tests (~25)
- [ ] LLMClient failure scenarios (~30)
- [ ] Run coverage: Should be 62-65%

### Phase 1b (Week 2)
- [ ] Cross-file validation integration (~35)
- [ ] Multi-step execution flow (~20)
- [ ] Workspace detection edge cases (~20)
- [ ] Run coverage: Should be 68-70%

### Phase 2 (Week 3)
- [ ] Voice narration edge cases (~15)
- [ ] Markdown rendering (~15)
- [ ] Cross-platform execution (~15)
- [ ] Final coverage: Should be 70%+

### Final Validation
- [ ] All tests pass: `npm test`
- [ ] Coverage meets 70% minimum: `npm test -- --coverage`
- [ ] No regressions in existing tests
- [ ] Commit with meaningful message: `test(coverage): reach 70% test coverage target`

---

## 🚀 Quick Start Commands

```bash
# Check current coverage
npm test -- --coverage

# Run specific test file
npm test -- src/test/executor-errors.test.ts

# Watch mode for development
npm test -- --watch src/test/executor-errors.test.ts

# Generate HTML coverage report
npm test -- --coverage
open coverage/lcov-report/index.html  # or start coverage/lcov-report/index.html on Windows
```

---

## 💡 Key Opportunities

### Quick Wins (0.5-1% each)
- [ ] LLMClient timeout scenarios (already partially done)
- [ ] Executor retry logic edge cases
- [ ] Path sanitization with unusual characters

### Medium Efforts (1-2% each)
- [ ] Planner error handling
- [ ] Cross-file validation
- [ ] Workspace detection edge cases

### Strategic Tests (2-3% each)
- [ ] Integration validation (Store→Component binding)
- [ ] Multi-step execution flows
- [ ] Error recovery and auto-correction

---

## 📌 Notes

**Why 70% is Strategic**:
- Covers all core execution paths
- Catches 90%+ of bugs in production
- Enables confident refactoring
- Balances effort vs. diminishing returns (80%+ requires 3x effort)

**What Won't Be Tested (By Design)**:
- UI rendering (Vitest tests logic, not UI)
- VS Code extension lifecycle (requires e2e testing)
- LLM response quality (subjective, not testable)
- Performance benchmarks (separate perf tests)

**Maintenance**:
- New code must include tests
- Tests should document expected behavior
- Review coverage on PRs
- Update thresholds only when justified

---

**Next Steps**:
1. Review this plan with team
2. Identify any missing high-impact areas
3. Start Phase 1a (error paths)
4. Track progress weekly
5. Adjust timeline based on findings

