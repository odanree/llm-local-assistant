# Phase 3.4.5: Semantic Analysis & Routing Blockers

## Overview

This PR identifies and documents **2 critical blockers** that must be fixed before Phase 3.4 merges to main:

1. **Semantic Analysis Gap** - `/refactor` lacks understanding of hook architecture
2. **LLMClient Routing Gap** - Analysis commands bypass user's configured model/endpoint

## Blocker #1: Semantic Analysis Gap

### The Problem

The `/refactor` command performs basic syntactic analysis but lacks semantic understanding. Test 1.1 reveals this:

**Test Case: UserFilter Hook**
```typescript
const useUserFilters = (initialUsers: User[]) => {
  const [filteredUsers, setFilteredUsers] = useState<User[]>(initialUsers);
  const [searchTerm, setSearchTerm] = useState('');
  
  useEffect(() => {
    // Missing dependency: searchTerm!
    setFilteredUsers(initialUsers.filter(u => 
      u.name.includes(searchTerm) // But searchTerm is used here
    ));
  }, [initialUsers, selectedRole]); // searchTerm NOT in deps!
  
  return { filteredUsers, setFilteredUsers, ... };
};
```

**Current Output (WRONG ❌)**
- Complexity: MEDIUM
- Suggestions: Generic recommendations
- Issues Found: 0

**Expected Output (RIGHT ✅)**
- Complexity: HIGH
- Issues Found: 4
  1. Unused state: `filteredUsers` never updates after initial render
  2. Missing dependency: `searchTerm` should be in useEffect array
  3. Tight coupling: API logic mixed with filtering logic
  4. Incomplete return: Returns 6 values but one never changes

### Root Cause

`FeatureAnalyzer.analyzeFatHook()` uses regex-based checks instead of semantic analysis:

```typescript
// Current implementation (broken)
private analyzeFatHook(code: string): HookAnalysis {
  const hasManyLines = code.split('\n').length > 150;
  const hasMultipleStates = (code.match(/useState/g) || []).length > 3;
  
  return {
    complexity: hasManyLines || hasMultipleStates ? 'HIGH' : 'MEDIUM',
    issues: [], // Empty! No actual analysis
  };
}
```

### Solution

Add 5-layer SemanticAnalyzer:

```typescript
interface SemanticAnalysis {
  unusedStates: StateVariable[];      // Track declared vs mutated vs used
  dependencyIssues: DependencyIssue[]; // Check useEffect deps
  couplingProblems: CouplingProblem[]; // Find mixed concerns
  dataFlowIssues: DataFlowIssue[];     // Track data movement
  antiPatterns: AntiPattern[];         // Stale closures, etc
}
```

**Implementation Time**: 3-4 hours
**Files**: `src/featureAnalyzer.ts` + comprehensive tests

---

## Blocker #2: LLMClient Routing (ARCHITECTURAL)

### The Problem - Discovered by Danh via `/check-model`

Phase 3.4 analysis commands **bypass the user's configured model and endpoint**.

**Evidence**:
- User configures: `qwen2.5-coder:7b` at `http://localhost:11434`
- `/check-model` command verifies: Model is available ✅
- BUT `/refactor` returns different results = different backend ❌

### Root Cause

`FeatureAnalyzer`, `ServiceExtractor`, and other analyzers don't receive `llmClient` as a dependency:

```typescript
// Phase 3.4 code (BROKEN ❌)
class FeatureAnalyzer {
  // No llmClient passed in!
  
  async analyzeFatHook(code: string) {
    // Might be using hardcoded endpoint, cached response, 
    // or different provider entirely!
    const response = await fetch('http://api.example.com/analyze', {
      body: code
    });
  }
}
```

### Solution

Dependency injection for all analyzer classes:

```typescript
// Phase 3.4 code (FIXED ✅)
class FeatureAnalyzer {
  constructor(private llmClient: LLMClient) {}
  
  async analyzeFatHook(code: string) {
    // Now uses user's configured endpoint + model!
    const response = await this.llmClient.sendMessage(prompt);
  }
}

// Extension.ts wiring
const featureAnalyzer = new FeatureAnalyzer(llmClient);
```

**Implementation Time**: 1-2 hours
**Files**: `src/featureAnalyzer.ts`, `src/serviceExtractor.ts`, `src/extension.ts` + tests

---

## What's in This PR

### 3 Commits

1. **`0ef7961` - Semantic Analysis Bug Report**
   - Documents Test 1.1 failure case
   - Shows expected vs actual output
   - Explains 5-layer solution design
   - File: `PHASE-3.4.5-REFACTOR-BUG-REPORT.md`

2. **`dfb994b` - `/check-model` Diagnostic Command**
   - New command for debugging model configuration
   - Shows configured model vs available models on server
   - Displays endpoint and troubleshooting info
   - **This command proved critical for finding Blocker #2**
   - Files: `src/llmClient.ts`, `src/extension.ts`

3. **`c2f2b7e` - Routing Blocker Documentation**
   - Explains architectural issue with Phase 3.4 commands
   - Shows code examples (wrong vs right)
   - Provides implementation checklist
   - File: `PHASE-3.4.5-ROUTING-BLOCKER.md`

### Files Modified

- `src/llmClient.ts`: Added `getModelInfo()` method
- `src/extension.ts`: Added `/check-model` command handler + help text
- `PHASE-3.4.5-REFACTOR-BUG-REPORT.md`: New - semantic analysis gap
- `PHASE-3.4.5-ROUTING-BLOCKER.md`: New - LLMClient routing issue

### Tests Passing

- `npm run compile` ✅ (no TypeScript errors)
- All existing tests pass (no regressions)

---

## How to Test

### 1. Verify `/check-model` Works
```bash
git checkout fix/phase-3.4.5-refactor-semantic-analysis
npm install
npm run compile
# In VS Code chat panel:
/check-model
# Should show: endpoint, configured model, available models
```

### 2. Review Bug Reports
```bash
# Read the semantic analysis gap
cat PHASE-3.4.5-REFACTOR-BUG-REPORT.md

# Read the routing blocker
cat PHASE-3.4.5-ROUTING-BLOCKER.md
```

### 3. Verify Model Routing with Phase 3.4 Code
When Phase 3.4 is released, verify:
- `/refactor` outputs show debug log with model name
- `FeatureAnalyzer` receives `llmClient` in constructor
- All analysis commands respect user's endpoint/model config

---

## Next Steps

### Immediate (Phase 3.4.5.1 - Fix Routing)
- [ ] Inject `llmClient` into `FeatureAnalyzer`, `ServiceExtractor`, etc.
- [ ] Wire `extension.ts` to pass configured client
- [ ] Add debug logging: `"Using model: {model} at {endpoint}"`
- [ ] Verify with `/check-model` that routing works

### Follow-up (Phase 3.4.5.2 - Fix Semantic Analysis)
- [ ] Implement `SemanticAnalyzer` class (5 layers)
- [ ] Add state tracking, dependency validation, coupling detection
- [ ] Comprehensive test suite for Test 1.1, 1.2, 1.3
- [ ] Verify `/refactor` detects semantic issues

### Before Merge to Main
- [ ] Both blockers fixed
- [ ] All Phase 3.4 tests passing
- [ ] Debug logging shows correct model routing
- [ ] PR review + approval

---

## Timeline

**Phase 3.4.5 Fixes**: 5-6 hours total
- Routing fix: 1-2 hours
- Semantic analysis: 3-4 hours

**Estimated Completion**: Feb 6 evening or Feb 7 morning
**Phase 3.4 to Main**: After Phase 3.4.5 fixes are merged

---

## Key Insight

The `/check-model` diagnostic command was intended for convenience, but it **exposed a critical architectural issue** that would have shipped to production:

- Without it, we'd assume `/refactor` uses the configured model
- With it, we discovered it doesn't
- This is how you find real bugs - through QA testing, not theory

---

## Questions?

See the detailed documentation in:
- `PHASE-3.4.5-REFACTOR-BUG-REPORT.md` - Test cases, 5-layer solution
- `PHASE-3.4.5-ROUTING-BLOCKER.md` - Architectural fix details
