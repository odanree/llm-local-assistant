# Week 2 Implementation Plan: planner.ts Testing

**Goal**: Achieve 90% coverage on planner.ts → 76%+ overall coverage  
**Target Tests**: 70-80 tests across 5 focused test files  
**Duration**: 8-10 hours  
**Priority**: High (final phase to exceed 70% overall coverage goal)

---

## PLanner.ts Architecture Overview

### Public Interface
- `generatePlan(userRequest, workspacePath?, workspaceName?, projectContext?)` - Main entry point
- `constructor(config: PlannerConfig)` - Initialize with LLM callback

### Core Private Methods (Key Testing Targets)
1. **Plan Generation**: buildPlanPrompt, parseSteps, topologicalSort
2. **Step Parsing**: parseStepBlock, extractDescription, extractCommand
3. **Dependency Management**: topologicalSort, extractDependencies
4. **Validation**: validatePlanAgainstTemplates, checkScaffoldDependencies
5. **Utilities**: extractTargetFile, extractReasoning, generateStepId

### Key Design Patterns
- JSON-only response parsing (no markdown fallback from UI)
- Topological sort for dependency ordering
- Semantic ID generation (step_1, step_2, etc.)
- Self-referential dependency filtering
- Schema-strict validation
- Context-aware planning (language, strategy, extension)

---

## Test File Structure (Week 2 Plan)

### File 1: planner-generation.test.ts (20 tests)
**Focus**: Plan generation, LLM integration, configuration  
**Duration**: 2-3 hours

#### Test Categories

**A. Plan Generation Core (5 tests)**
- Generate simple plan with 2-3 steps
- Accept workspace path and project context
- Return TaskPlan with correct structure
- Handle LLM error responses
- Handle UNABLE_TO_COMPLETE responses

**B. LLM Integration (5 tests)**
- Mock LLM calls and verify prompt passing
- Handle LLM response variations
- Pass project context to buildPlanPrompt
- Log response for debugging
- Handle network/timeout errors

**C. Plan Metadata (5 tests)**
- Generate unique taskId with timestamp
- Capture generation date
- Store user request in plan
- Extract reasoning from LLM response
- Store workspace context (path, name)

**D. Configuration Handling (5 tests)**
- Use provided config.llmCall
- Call onProgress callback at stages
- Handle missing callbacks gracefully
- Support projectContext parameter
- Validate PlannerConfig interface

---

### File 2: planner-parsing.test.ts (25 tests)
**Focus**: LLM response parsing, JSON handling, step extraction  
**Duration**: 3-4 hours

#### Test Categories

**A. JSON Parsing (8 tests)**
- Parse valid JSON array response
- Handle markdown code blocks (```json ... ```)
- Handle stripped json (no backticks)
- Sanitize control characters in JSON
- Detect malformed JSON with error message
- Handle empty step arrays
- Handle non-array responses
- Extract JSON from mixed response

**B. Step Extraction (7 tests)**
- Extract action, description, path, command properly
- Convert action to lowercase (write/read/run/delete)
- Handle missing optional fields
- Generate step IDs correctly (step_1, step_2, etc.)
- Validate action types (reject invalid)
- Parse dependencies field
- Handle conditional fields (command for run, path for write)

**C. Dependency Parsing (5 tests)**
- Parse dependencies array format
- Parse dependencies string format ("step_1, step_2")
- Parse numeric dependencies (convert to step_N format)
- Filter self-referential dependencies
- Handle missing dependencies gracefully

**D. Field Extraction (5 tests)**
- Extract description, path, command, outcome accurately
- Handle quotes and backticks in fields
- Normalize whitespace
- Reject empty descriptions
- Parse command inference from keywords

---

### File 3: planner-dependencies.test.ts (15 tests)
**Focus**: Topological sorting, dependency validation, DAG handling  
**Duration**: 2-3 hours

#### Test Categories

**A. Topological Sort (6 tests)**
- Sort simple linear dependency chain (1→2→3)
- Sort diamond dependency pattern (1→{2,3}→4)
- Sort multi-root DAG
- Detect circular dependencies
- Detect missing dependencies
- Detect self-referential dependencies

**B. Dependency Validation (5 tests)**
- Validate all dependencies exist in step map
- Validate no circular references
- Validate dependency IDs are strings
- Handle steps without dependencies
- Verify sorted order maintains DAG properties

**C. Edge Cases (4 tests)**
- Single step with no dependencies
- Steps with multiple incoming dependencies
- Large graphs (20+ steps)
- Complex cycle detection

---

### File 4: planner-validation.test.ts (12 tests)
**Focus**: Plan validation, template compliance, scaffold detection  
**Duration**: 2-3 hours

#### Test Categories

**A. Plan Structure Validation (4 tests)**
- Validate TaskPlan interface compliance
- Validate all steps have required fields
- Validate step count and ordering
- Validate workspace context captured

**B. Template Compliance (4 tests)**
- Validate component props include className
- Validate uses of cn() utility
- Validate file paths follow conventions
- Validate expected outcomes are set

**C. Scaffold Dependency Checking (4 tests)**
- Detect missing cn() utility if referenced
- Detect missing component utilities
- Prepend scaffold steps if needed
- Handle workspace path parameter

---

### File 5: planner-integration.test.ts (8 tests)
**Focus**: End-to-end workflows, real scenarios  
**Duration**: 1-2 hours

#### Test Categories

**A. Complete Workflows (5 tests)**
- Generate plan for "create button component"
- Generate plan for "refactor existing code"
- Generate plan with dependencies between steps
- Handle greenfield vs. existing projects
- Generate plan with context (language, strategy)

**B. Error Recovery (3 tests)**
- Handle LLM returning malformed response
- Handle LLM returning empty steps
- Gracefully degrade when dependencies unresolvable

---

## Expected Coverage Improvements

### Before Week 2
- planner.ts: ~35% (baseline)
- Overall: ~70% (from Week 1)

### After Week 2 (Complete)
- planner.ts: ~90%+ (target: 58 of 65 public/testable methods)
- Overall: ~76%+ (target exceeded!)

### Coverage Gap Analysis
- generatePlan: ~15 lines → 25 lines (main entry point)
- buildPlanPrompt: ~40 lines → 65 lines (text-heavy, hard to test)
- parseSteps: ~30 lines → 50 lines (json parsing)
- topologicalSort: ~40 lines → 65 lines (algorithm)
- Utilities: ~60 lines → 85 lines (extract* methods)
- **Total Testable**: ~185 lines → ~290 lines

---

## Testing Implementation Strategy

### Phase 1: Parsing Tests (1 day)
1. Create planner-parsing.test.ts first (most straightforward)
2. Test JSON parsing with Various mocked LLM responses
3. Test field extraction with edge cases
4. Build confidence with 25 passing tests

### Phase 2: Generation Tests (1 day)
1. Create planner-generation.test.ts
2. Mock LLMClient and config callbacks
3. Test generatePlan with various contexts
4. Verify TaskPlan structure

### Phase 3: Dependency Tests (0.5 day)
1. Create planner-dependencies.test.ts
2. Implement topological sort testing
3. Verify DAG properties

### Phase 4: Validation Tests (0.5 day)
1. Create planner-validation.test.ts
2. Test template compliance
3. Test scaffold detection

### Phase 5: Integration Tests (1 day)
1. Create planner-integration.test.ts
2. End-to-end scenario testing
3. Real-world error handling

### Phase 6: Coverage Verification (0.5 day)
1. Run full coverage report
2. Verify planner.ts at 90%+
3. Verify overall at 76%+
4. Document final coverage metrics

---

## Key Testing Patterns

### Mocking LLMClient
```typescript
const mockConfig = {
  llmCall: vi.fn().mockResolvedValue(validJsonResponse),
  onProgress: vi.fn(),
  projectContext: { language: 'TypeScript', ... }
};
const planner = new Planner(mockConfig);
```

### Testing Private Methods
```typescript
const steps = planner['parseSteps'](responseText);
const sorted = planner['topologicalSort'](steps);
```

### Mocking LLM Responses
```typescript
// Valid response
const validResponse = JSON.stringify([
  { step: 1, action: 'write', path: 'src/file.ts', description: 'Create file' }
]);

// Invalid response
const malformedResponse = '{ broken json';
```

---

## Success Criteria

### All Tests Passing
- [ ] planner-generation: 20/20 passing
- [ ] planner-parsing: 25/25 passing
- [ ] planner-dependencies: 15/15 passing
- [ ] planner-validation: 12/12 passing
- [ ] planner-integration: 8/8 passing
- [ ] **Total: 80/80 passing (100%)**

### Coverage Achieved
- [ ] planner.ts: 90%+
- [ ] Overall project: 76%+
- [ ] executor.ts: 82%+ maintained

### Code Quality
- [ ] Zero TypeScript compilation errors
- [ ] All 1600+ tests passing (Week 1 + 2)
- [ ] Comprehensive git history
- [ ] Professional documentation

---

## Risk Mitigation

### Potential Issues
1. **buildPlanPrompt is large text block**: Not directly testable, may skip or proxy test
2. **planner.ts has complex regex patterns**: Test extraction methods thoroughly
3. **LLM response variations**: Create fixture library with real/edge cases
4. **Topological sort algorithm**: Test thoroughly with various DAG structures

### Mitigation Strategies
- Focus on parseSteps (LLM output handling) first
- Create comprehensive fixture library for responses
- Test private methods via bracket notation
- Document untestable code sections

---

## Week 2 Timeline

| Day | Focus | Target Tests | Expected Duration |
|-----|-------|--------------|------------------|
| **D1** | Parsing framework | planner-parsing.test.ts | 3-4 hours |
| **D2** | Generation & LLM | planner-generation.test.ts | 2-3 hours |
| **D3** | Dependencies | planner-dependencies.test.ts | 2-3 hours |
| **D4** | Validation & Integration | planner-validation.test.ts, planner-integration.test.ts | 3-4 hours |
| **D5** | Coverage verification | Run full suite, verify metrics | 1-2 hours |
| **TOTAL** | Full planner.ts coverage | **80 tests** | **8-10 hours** |

---

## Expected Outcomes

### Code Artifacts
- [ ] 5 new test files (planner*.test.ts)
- [ ] 1,000+ lines of test code
- [ ] 10+ comprehensive progress documents
- [ ] Clean git history with atomic commits

### Coverage Metrics
- [ ] 80 new planner tests (100% passing)
- [ ] executor.ts 82%+ maintained
- [ ] planner.ts 90%+
- [ ] **Overall: 76%+ (goal exceeded by 6%!)**

### Portfolio Value
- [ ] Demonstrates test-driven development
- [ ] Shows architecture comprehension
- [ ] Professional git commit history
- [ ] Comprehensive documentation
- [ ] High-quality test suite

---

## Success Definition

✅ **Complete Week 2 when**:
1. All 80 planner tests passing (100%)
2. Coverage report shows:
   - planner.ts: 90%+
   - Overall: 76%+
3. Zero TypeScript compilation errors
4. Git history shows atomic, well-documented commits
5. All Week 1 tests still passing (no regressions)
6. Professional documentation complete

**Estimated Completion**: End of Week 2 sprint  
**Overall Project Status**: 76%+ coverage (exceeds 70% goal!)
