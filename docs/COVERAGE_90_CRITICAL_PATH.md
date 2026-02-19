# Critical Path Strategy: Execute + Planner at 90%

**Strategic Decision**: Rather than dilute effort across many files, achieve **90% coverage on the two critical modules** that contain 60%+ of system complexity.

**Rationale**:
- executor.ts + planner.ts = ~5500 lines of core orchestration
- These two files account for ~40-50% of overall codebase
- Getting 90% on these likely brings overall coverage to 70%+ alone
- Creates rock-solid foundation for 80%+ push later

---

## 📊 The Math

### Current State (Estimated)
```
executor.ts:  3000 lines × 55% coverage = 1650 lines covered
planner.ts:   2500 lines × 60% coverage = 1500 lines covered
Combined:     5500 lines × 57% coverage = 3150 lines covered
```

### Target State (90% Coverage)
```
executor.ts:  3000 lines × 90% coverage = 2700 lines covered (+1050 lines)
planner.ts:   2500 lines × 90% coverage = 2250 lines covered (+750 lines)
Combined:     5500 lines × 90% coverage = 4950 lines covered (+1800 lines)
```

### Impact on Overall Coverage
```
Baseline:     ~5400 lines covered across entire codebase (58.46%)
After Push:   ~5400 + 1800 = 7200 lines covered
Overall:      7200 / 10,200 ≈ 70.6% ✅
```

**This strategy alone reaches 70% target.**

---

## 🎯 executor.ts → 90% Coverage (1050+ lines to cover)

### Current Gaps by Method

#### 1. Error Recovery Methods (~300 lines)
**Methods**: `attemptAutoFix()`, `attemptStrategySwitch()`  
**Current Coverage**: ~30%  
**Tests Needed**: 35-40  
**Gap Analysis**:
- ❌ ENOENT (file not found) scenarios completely untested
- ❌ EACCES (permission denied) scenarios untested
- ❌ EISDIR (directory instead of file) completely untested
- ❌ Strategy switching logic untested
- ❌ All fallback paths untested

**Critical Tests**:
```typescript
// attemptAutoFix scenarios (15 tests)
- attemptAutoFix with ENOENT → walk up directory tree
- attemptAutoFix with EACCES → suggest permission fix
- attemptAutoFix with EISDIR → list directory contents
- attemptAutoFix with run command → try alternatives
- Max iterations exceeded → return null
- Nested error recovery chains

// attemptStrategySwitch scenarios (8 tests)
- File not found → suggest write action
- Config file pattern → suggest init
- Source file pattern → suggest write
- Non-recoverable → suggest nothing

// Error categorization (12 tests)
- Separating critical errors from suggestions
- Soft warnings not blocking validation
- Error message formatting and clarity
```

**Expected Gain**: +2.5-3%

#### 2. Validation Methods (~400 lines)
**Methods**: `validateGeneratedCode()`, `validateTypes()`, `validateArchitectureRules()`, `validateCommonPatterns()`, `validateFormComponentPatterns()`  
**Current Coverage**: ~45%  
**Tests Needed**: 50-60  
**Gap Analysis**:
- ❌ Type validation edge cases (any, implicit types)
- ❌ Architecture rule violations incomplete
- ❌ Form component patterns (7 patterns) ~40% covered
- ❌ Import validation (unused imports, missing imports)
- ❌ Zustand store usage patterns untested
- ❌ Pattern detection for complex code

**Critical Tests**:
```typescript
// Type validation (10 tests)
- Function return types missing
- Arrow functions without return type
- Implicit any usage
- Generic type bounds
- Union type handling

// Form component patterns (15 tests)
- Pattern 1: Missing state interface
- Pattern 2: Handler typing (any vs FormEventHandler)
- Pattern 3: Missing consolidator pattern
- Pattern 4: Form submission handling
- Pattern 5: Validation logic present
- Pattern 6: Error state tracking
- Pattern 7: Semantic form markup
- Plus edge cases and combinations

// Import validation (12 tests)
- Unused imports detection (with edge cases)
- Missing imports detection
- Circular imports (indirect)
- Namespace resolution (console, Math, custom)
- React hooks without import

// Architecture rules (13 tests)
- TanStack Query enforced over fetch
- Zustand enforced over Redux
- Fetch patterns detected
- Component composition patterns
- Dependency isolation rules
```

**Expected Gain**: +3-3.5%

#### 3. Step Execution & Orchestration (~250 lines)
**Methods**: `executeStep()`, `executeRead()`, `executeWrite()`, `executeRun()`  
**Current Coverage**: ~60%  
**Tests Needed**: 25-30  
**Gap Analysis**:
- ❌ Edge cases in file reading (large files, binary files)
- ❌ Write operation confirmation flow
- ❌ Run command handling on different shells
- ❌ Progress callbacks in all scenarios
- ❌ Stream output handling

**Critical Tests**:
```typescript
// Read execution (8 tests)
- Reading directory vs file
- Large file handling (>10MB)
- Binary files (should error)
- Symlinks and special files
- Unicode handling

// Write execution (10 tests)
- Parent directory creation
- File overwrite confirmation
- Risky file detection
- Content validation before write
- Failed writes with rollback

// Run execution (7 tests)
- Multiline commands
- Shell-specific syntax (PowerShell vs bash)
- Command not found scenarios
- Exit code handling
- Output streaming callbacks
```

**Expected Gain**: +1.5-2%

#### 4. Dependency & Contract Methods (~200 lines)
**Methods**: `reorderStepsByDependencies()`, `validateDependencies()`, `validateStepContract()`, `preFlightCheck()`  
**Current Coverage**: ~50%  
**Tests Needed**: 20-25  
**Gap Analysis**:
- ❌ Complex dependency chains untested
- ❌ Circular dependency detection incomplete
- ❌ Contract violations incompletely tested
- ❌ Greenfield workspace guards untested
- ❌ Path validation edge cases

**Critical Tests**:
```typescript
// Dependency reordering (8 tests)
- Linear chain: A → B → C
- Diamond pattern: A → B,C → D
- Complex multi-level: deep graphs
- Circular detection: proper error
- Topological sort correctness

// Contract validation (10 tests)
- "Manual" hallucination in path
- "Manual" hallucination in command
- Missing path for file operations
- Missing command for run action
- Invalid action values

// Pre-flight checks (7 tests)
- Greenfield guard (no READ on empty workspace)
- Multiple spaces in path (description vs path)
- Extension requirement validation
- Ellipsis path detection
- Action vs workspace state mismatch
```

**Expected Gain**: +1.5-2%

#### 5. Remaining Methods (~100 lines)
**Methods**: `clearHistory()`, `extractFileContract()`, `calculateImportStatement()`, utilities  
**Current Coverage**: ~70%  
**Tests Needed**: 10-15  
**Expected Gain**: +0.5-1%

---

## 🎯 planner.ts → 90% Coverage (750+ lines to cover)

### Current Gaps by Method

#### 1. Plan Generation Core (~800 lines)
**Methods**: `generatePlan()`, main orchestration  
**Current Coverage**: ~55%  
**Tests Needed**: 40-50  
**Gap Analysis**:
- ❌ Malformed LLM response handling (80% untested)
- ❌ Retry logic after LLM failures incomplete
- ❌ JSON parsing edge cases
- ❌ Invalid step sequences
- ❌ Circular dependencies in planning

**Critical Tests**:
```typescript
// LLM Response Handling (15 tests)
- Non-JSON response
- Partial/truncated JSON
- Empty response
- Null/undefined steps
- Steps with null paths
- Steps with invalid actions
- Duplicate step IDs
- Out-of-order steps
- Missing required fields

// Validation Loop (12 tests)
- Max iterations reached (prevent infinite loops)
- Validation failure recovery
- Improvement detection
- Schema compliance checks
- Dependency cycle detection in planning

// Error Propagation (13 tests)
- LLM service unavailable
- Timeout during generation
- Token limit exceeded
- Memory issues
- Invalid configuration context
- Missing workspace context
```

**Expected Gain**: +2.5-3%

#### 2. Step Parsing & Normalization (~400 lines)
**Methods**: `parseStepsFromResponse()`, step normalization  
**Current Coverage**: ~60%  
**Tests Needed**: 30-40  
**Gap Analysis**:
- ❌ Edge cases in step extraction (50% untested)
- ❌ Path normalization for different OS
- ❌ Action enumeration validation incomplete
- ❌ Description extraction from varied formats
- ❌ Dependency linking between steps

**Critical Tests**:
```typescript
// Step Extraction (12 tests)
- Multiple steps in different formats
- Steps in arrays vs objects
- Nested structures
- Missing action fields (infer from description)
- Malformed action values

// Path Normalization (10 tests)
- Windows vs Unix paths
- Relative vs absolute (should normalize to relative)
- Paths with ../ (go up directories)
- Paths with // (double slashes)
- Paths with spaces
- Trailing slashes

// Dependency Linking (8 tests)
- Extract dependencies from descriptions
- Handle missing dependency references
- Circular dependency detection
- Orphaned step dependencies
- Cross-workspace dependencies
```

**Expected Gain**: +2-2.5%

#### 3. Validation Pass (MAX_VALIDATION_ITERATIONS) (~300 lines)
**Methods**: Validation loop, improvement detection  
**Current Coverage**: ~45%  
**Tests Needed**: 25-35  
**Gap Analysis**:
- ❌ Validation failure conditions mostly untested
- ❌ Improvement threshold detection untested
- ❌ Recovery strategies incomplete
- ❌ Loop termination conditions edge cases

**Critical Tests**:
```typescript
// Loop Management (10 tests)
- First iteration validates correctly
- Validates 3 iterations max
- Stops early if valid on iteration 2
- Handles max iterations reached
- Improvement detection (not just pass/fail)

// Validation Failures (12 tests)
- Schema validation failure
- Dependency validation failure
- Range validation failure
- Type validation failure
- Multiple failures in one iteration
- Recovery suggestions provided

// Edge Cases (8 tests)
- Zero steps generated (should reject)
- Duplicate step IDs (should fix)
- Steps with no action (should infer)
- Extremely large plan (>100 steps)
- Extremely deep dependencies (>10 levels)
```

**Expected Gain**: +1.5-2%

#### 4. Configuration & Context (~200 lines)
**Methods**: Config handling, context injection, prompt building  
**Current Coverage**: ~65%  
**Tests Needed**: 15-20  
**Gap Analysis**:
- ❌ Edge cases in configuration incomplete
- ❌ Missing workspace handling
- ❌ Architecture rules injection untested
- ❌ Prompt context overflow scenarios

**Critical Tests**:
```typescript
// Configuration (7 tests)
- Missing required config
- Invalid temperature/maxTokens
- Unknown model names
- Timeout configuration edge cases
- Retry count validation

// Context Injection (8 tests)
- Workspace context properly injected
- Architecture rules properly injected
- Code style examples included
- Project structure represented correctly
- Context limits respected (not too long)
```

**Expected Gain**: +0.8-1.2%

#### 5. Output Formatting & Callbacks (~100 lines)
**Methods**: Progress callbacks, formatting  
**Current Coverage**: ~70%  
**Tests Needed**: 10-15  
**Expected Gain**: +0.5-0.8%

---

## 📅 Implementation Timeline: 90% Coverage Strategy

### Week 1: executor.ts → 90% (65-75 tests)

**Day 1-2: Error Recovery (35-40 tests)** ✅ COMPLETE
```bash
# Completed: src/test/executor-errors.test.ts
# Tests: 45 (100% passing)
# Coverage: attemptAutoFix, attemptStrategySwitch, error categorization
# Status: Ready for Day 3-4
npm test -- src/test/executor-errors.test.ts
```

**Day 3-4: Validation Methods (50-60 tests)** 🔄 IN PROGRESS
```bash
npm test -- src/executor.test.ts -t "Validation"
npm test -- src/executor.test.ts -t "Type Validation"
npm test -- src/executor.test.ts -t "Form Patterns"
# Aim: 70% → 83%
```

**Day 5: Execution & Orchestration (25-30 tests)** ⏳ PENDING
```bash
npm test -- src/executor.test.ts -t "Execute"
npm test -- src/executor.test.ts -t "executeRead|executeWrite|executeRun"
# Aim: 83% → 88%
```

**Day 6: Dependencies & Contracts (20-25 tests)** ⏳ PENDING
```bash
npm test -- src/executor.test.ts -t "Dependencies|Contract|PreFlight"
# Aim: 88% → 90%+
```

**Expected**: executor.ts → **90% coverage**

### Week 2: planner.ts → 90% (70-80 tests)

**Day 1-2: Plan Generation Core (40-50 tests)**
```bash
npm test -- src/planner.test.ts -t "generatePlan"
npm test -- src/planner.test.ts -t "LLM Response|Error Handling"
# Aim: 60% → 75%
```

**Day 3-4: Step Parsing (30-40 tests)**
```bash
npm test -- src/planner.test.ts -t "Step Parsing|Normalization"
npm test -- src/planner.test.ts -t "Path Normalization|Dependency"
# Aim: 75% → 85%
```

**Day 5: Validation Loop (25-35 tests)**
```bash
npm test -- src/planner.test.ts -t "Validation|Iteration"
# Aim: 85% → 90%
```

**Day 6: Polish (15-20 tests)**
```bash
npm test -- src/planner.test.ts -t "Config|Context|Format"
# Aim: 90% → 90%+
```

**Expected**: planner.ts → **90% coverage**

---

## 📈 Expected Overall Impact

### Starting Baseline
```
Total Coverage: 58.46%
Total Lines: 10,200
Covered Lines: 5,963
```

### After executor.ts +90%
```
executor.ts: 3000 × 0.90 = 2700 lines (was 1650, +1050)
New Total: 5963 + 1050 = 7013 lines
New Coverage: 7013 / 10,200 = 68.8%
```

### After planner.ts +90%
```
planner.ts: 2500 × 0.90 = 2250 lines (was 1500, +750)
New Total: 7013 + 750 = 7763 lines
New Coverage: 7763 / 10,200 = 76.1% ✅
```

**Result**: Just these two files at 90% coverage brings overall to **76%+** (exceeds 70% target by 6%).

---

## 💪 Effort Estimate

| Phase | Tests | Hours | Complexity |
|-------|-------|-------|------------|
| executor.ts | 65-75 | 25-30 | High |
| planner.ts | 70-80 | 25-30 | High |
| Review & Polish | - | 5-10 | Medium |
| **Total** | **140-155** | **55-70** | **High** |

**Timeline**: 2 weeks @ 25-35 hrs/week = **feasible sprint**

---

## 🎬 Getting Started

### Setup
```bash
# Create test file for executor focus
touch src/test/executor-90-percent.test.ts

# Create test file for planner focus  
touch src/test/planner-90-percent.test.ts

# Run focused suite
npm test -- src/test/executor-90-percent.test.ts
npm test -- src/test/planner-90-percent.test.ts

# Track progress
npm test -- --coverage src/executor.ts
npm test -- --coverage src/planner.ts
```

### Testing Discipline
```bash
# After every 10 tests, verify coverage impact
npm test -- --coverage
# Expected: 0.5-1 percentage point gain per 10 tests

# If actual < expected, investigate:
# - Are tests hitting new lines?
# - Are branches being exercised?
# - Is coverage reporter picking up changes?
```

---

## ✅ Success Criteria

- [ ] executor.ts reaches **90% coverage** (2700/3000 lines)
- [ ] planner.ts reaches **90% coverage** (2250/2500 lines)
- [ ] Overall coverage reaches **70%+** (7763+/10,200 lines)
- [ ] All 140-155 new tests pass
- [ ] No regressions in existing tests
- [ ] Documentation updated

---

## 🚀 Why This Strategy Works

1. **High Concentration**: 60% of code logic in 2 files
2. **Multiplier Effect**: 90% on core files compound into 76% overall
3. **Foundation**: Creates rock-solid base for 80%+ later (utilities will be easy)
4. **Time Efficiency**: 2 weeks to 70%+ vs 3+ weeks for distributed approach
5. **Developer Confidence**: When core orchestration is 90% tested, refactoring becomes safe

---

## 📌 Notes for Implementation

**Key Insight**: This isn't padding coverage numbers. These are *real, important test cases*:
- Error recovery in executor directly affects production reliability
- Plan generation validation directly affects output quality
- Every test protects against a real failure mode

**Sustainability**: Once these two pillars are solid (90%), reaching 80%+ on the overall codebase becomes straightforward because:
- Utilities and helpers have fewer edge cases
- Support modules test easily once core is tested
- Payoff ratio improves (easier tests remain)

**Milestone Value**: At 70% overall (with executor/planner at 90%), you have:
- Portfolio-ready code quality
- Confidence for production
- Clear path to 80%+ (last 10 percentage points are incremental)

