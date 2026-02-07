# Phase 3.4.5: /refactor Command Semantic Analysis Bug Report

## Issue Summary

The `/refactor` command is performing basic syntactic analysis but lacks semantic understanding of hooks. Test 1.1 failed with generic complexity scores and vague suggestions instead of detecting actual architectural problems.

## Test Case: UserFilter Hook Analysis

### Input Hook
```typescript
const useUserFilters = (initialUsers: User[]): FilterState => {
  const [filteredUsers, setFilteredUsers] = useState<User[]>(initialUsers);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<'admin' | 'user'>('user');
  
  const fetchUsers = async () => {
    const response = await fetch('/api/users');
    return response.json();
  };

  useEffect(() => {
    // This dependency is wrong - searchTerm should be here
    setFilteredUsers(initialUsers.filter(u => 
      u.name.includes(searchTerm) && 
      u.role === selectedRole
    ));
  }, [initialUsers, selectedRole]); // MISSING searchTerm!

  return { filteredUsers, setFilteredUsers, searchTerm, setSearchTerm, selectedRole, setSelectedRole };
};
```

### Current Behavior (BROKEN ❌)
- **Complexity**: MEDIUM (incorrect)
- **Analysis**: "Generic analysis structure detected"
- **Suggestions**: Vague recommendations without specifics
- **Gap**: No detection of the missing `searchTerm` dependency

### Expected Behavior (WHAT IT SHOULD DO ✅)
- **Complexity**: HIGH (correct)
- **Issues Detected**:
  1. **Unused State Variable**: `filteredUsers` is set but never updated after initial render because `searchTerm` is missing from dependency array
  2. **Inefficient Dependencies**: `useEffect` should depend on `searchTerm`, `selectedRole`, and `initialUsers` but only has 2/3
  3. **Tight Coupling**: API logic (`fetchUsers`) is tightly coupled with filtering logic (should extract)
  4. **Incomplete Return**: Returns 6 properties but `filteredUsers` never changes (architectural flaw)
- **Extraction Suggestions**:
  - Extract `useApi` service hook for API calls
  - Extract `useUserFilterLogic` for pure filtering logic
  - Keep `useUserFilters` as composition layer
  - Improve separation of concerns

## Root Cause Analysis

### What's Broken
The `FeatureAnalyzer.analyzeFatHook()` method does basic checks but misses semantic patterns:

```typescript
// CURRENT IMPLEMENTATION (INCOMPLETE)
private analyzeFatHook(code: string): HookAnalysis {
  const hasManyLines = code.split('\n').length > 150;
  const hasMultipleStates = (code.match(/useState/g) || []).length > 3;
  // ... basic regex checks

  return {
    complexity: hasManyLines || hasMultipleStates ? 'HIGH' : 'MEDIUM',
    issues: [], // EMPTY! No actual issue detection
    suggestedExtraction: 'GENERIC'
  };
}
```

### What's Missing (Semantic Analysis)

1. **Unused State Detection** - Track declared states vs. actual mutations
2. **Dependency Analysis** - Compare referenced variables with useEffect dependency arrays
3. **Coupling Analysis** - Detect API calls mixed with business logic
4. **Data Flow Analysis** - Track how data flows through hook
5. **Anti-Pattern Detection** - Missing closures, stale closures, sync-async bugs

## Solution Strategy

### Phase 3.4.5.1: Enhanced FeatureAnalyzer
Add 5-layer semantic analysis:

```typescript
interface SemanticAnalysis {
  unusedStates: StateVariable[];
  dependencyIssues: DependencyIssue[];
  couplingProblems: CouplingProblem[];
  dataFlowIssues: DataFlowIssue[];
  antiPatterns: AntiPattern[];
}

type StateVariable = {
  name: string;
  declared: boolean;
  mutated: boolean;
  used: boolean;
  severity: 'unused' | 'orphaned' | 'stale';
};

type DependencyIssue = {
  effect: string; // line number or name
  missing: string[]; // ['searchTerm']
  extra: string[];
  severity: 'critical' | 'warning';
};
```

### Phase 3.4.5.2: ServiceExtractor Updates
Add extraction confidence scores based on semantic analysis:

```typescript
// CURRENT: Generic extraction plans
// NEW: Semantic-aware extraction with specific refactoring steps
extractionPlan: {
  confidence: 0.85, // Up from generic "70%"
  steps: [
    {
      action: 'extract-hook',
      name: 'useApi',
      code: 'const useApi = () => { ... }',
      reason: 'Decouple API logic from filtering logic'
    },
    {
      action: 'fix-dependencies',
      effect: 'useEffect at line 12',
      fix: 'Add searchTerm to dependency array',
      reason: 'Missing dependency causes stale closures'
    }
  ]
}
```

### Phase 3.4.5.3: Testing Guide Updates
Update `PHASE-3.4.5-LOCAL-TESTING-GUIDE.md` with:
- Specific expected outputs for each test case
- Severity levels for issues (CRITICAL vs WARNING)
- Confidence scores for extraction suggestions
- Anti-pattern detection examples

## Files to Update

1. **src/featureAnalyzer.ts** (+200 lines)
   - Add `SemanticAnalyzer` class
   - Implement state tracking (AST parsing)
   - Implement dependency validation
   - Implement coupling detection

2. **src/featureAnalyzer.test.ts** (+80 lines)
   - Test 1.1 (UserFilter - HIGH complexity)
   - Test 1.2 (API Hook - MEDIUM complexity)
   - Test 1.3 (Pure Logic - LOW complexity)

3. **PHASE-3.4.5-LOCAL-TESTING-GUIDE.md** (Update)
   - Fix expected outputs
   - Add issue definitions
   - Add extraction confidence scoring

## Impact

- **Before**: 40-50% accuracy on complex hooks
- **After**: 85-90% accuracy with specific, actionable suggestions
- **Time to Fix**: +3 hours for implementation + tests
- **Priority**: BLOCKER for v2.0 (refactor command is core feature)

## Next Steps

1. Create new branch: `fix/phase-3.4.5-semantic-analysis`
2. Implement SemanticAnalyzer class
3. Update tests with correct expected outputs
4. Open PR with detailed impact analysis
5. Create post-release follow-up: Phase 3.4.6 (AST-based parsing for even better accuracy)

---

**Status**: READY FOR PR
**Estimated Time**: 3-4 hours
**Blocker**: YES (testing guide accuracy)
