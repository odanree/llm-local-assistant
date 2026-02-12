# Phase 3.3: Context Awareness & Multi-File Orchestration

**Status:** Starting (Feb 6, 2026)  
**Target Completion:** Feb 13-15, 2026  
**Effort Estimate:** 3-5 days (40-50 hours)

---

## Mission

**Phase 3.2 solved:** Single-file validation ✅  
**Phase 3.3 solves:** Multi-file awareness + orchestration ⏳

Enable:
- `/context` command to view codebase structure
- Intelligent `/plan` execution with dependency tracking
- Barrel file generation (knowing what exists)
- Cross-file consistency enforcement
- Better auto-correction with architectural context

---

## Problem Statement

### Current Failure Mode
```
/plan "Create user authentication system"
  Step 1: Generate src/schemas/user.ts ✅
  Step 2: Generate src/services/userApi.ts ❌
    - Doesn't know schemas/user.ts was created
    - Tries to import from wrong path
    - Creates duplicates or inconsistent patterns
  Step 3: Generate src/hooks/useAuth.ts ❌
    - Cascading failures from Step 2
    - Dependencies untracked
```

### Root Causes
1. **No codebase context:** LLM doesn't see existing files
2. **No dependency tracking:** Planner doesn't know which files depend on which
3. **No output passing:** Each step runs independently
4. **No consistency checking:** Generated code doesn't match existing patterns

---

## Solution Architecture

### Component 1: Vector Database + Codebase Indexing
**File:** `src/vectorDB.ts` (enhance existing stub)

**What it does:**
- Index all TypeScript files in project
- Generate embeddings for each file (semantic understanding)
- Enable similarity search ("find hooks similar to useAuth")
- Track file purposes and patterns

**Implementation:**
```typescript
interface CodebaseIndex {
  files: FileEntry[];
  dependencies: Map<string, string[]>; // src/hooks/useAuth.ts → [schemas, services]
  patterns: PatternRegistry;
  embeddings: Map<string, number[]>;
}

// On startup:
const index = new CodebaseIndex();
await index.scan(projectRoot);
await index.generateEmbeddings(); // Use transformers.js locally
```

**Technologies:**
- AST parsing for dependency extraction
- transformers.js for local embeddings (no API calls)
- hnswlib-wasm for similarity search

---

### Component 2: /context Command
**File:** `src/extension.ts` (add command handler)

**What it does:**
- Show codebase structure to user/LLM
- List existing files and their purposes
- Show dependency graph
- Provide pattern examples

**User facing:**
```
/context show schemas
/context show hooks
/context show services
/context show dependencies for useAuth
/context find similar hooks to useUser
```

**LLM facing (sent with plan requests):**
```
"Existing codebase:
 - src/schemas/user.ts: User validation schema
 - src/schemas/post.ts: Post validation schema
 - src/services/api.ts: Base API service
 - src/hooks/useUser.ts: Fetch user data with TanStack Query
 - Dependencies: useUser → services/api → schemas/user
 
 Patterns found:
 - Hooks pattern: All hooks use TanStack Query + useQuery
 - Services pattern: All services export async functions
 - Schemas pattern: All use Zod with explicit validation"
```

---

### Component 3: Intelligent Planner
**File:** `src/planner.ts` (enhance existing)

**What it does:**
- Analyze task requirements
- Detect dependencies between steps
- Order steps correctly (dependencies first)
- Generate step-specific context
- Validate each step against existing code

**Implementation:**
```typescript
interface Step {
  id: string;
  description: string;
  dependencies: string[]; // Step IDs this depends on
  context: string; // Codebase info specific to this step
  expectedOutput: string; // What should be created
  validation: ValidationRule[];
}

class IntelligentPlanner {
  analyzePlan(task: string): Step[] {
    // 1. Extract requirements
    // 2. Identify needed files
    // 3. Detect dependencies
    // 4. Order steps (topological sort)
    // 5. Generate step-specific context
    // 6. Add validation rules
  }
  
  orderSteps(steps: Step[]): Step[] {
    // Topological sort by dependencies
    // Ensure files are created in dependency order
  }
  
  generateStepContext(step: Step, index: CodebaseIndex): string {
    // Find existing patterns
    // Show similar examples
    // Provide architecture guidance
  }
}
```

---

### Component 4: Output Tracking & Validation
**File:** `src/executor.ts` (enhance existing)

**What it does:**
- Track what's generated in each step
- Make previous step output available to next step
- Validate step output matches expectations
- Update index as files are created

**Implementation:**
```typescript
interface ExecutionContext {
  planId: string;
  currentStep: number;
  previousOutputs: Map<number, string>; // Step number → generated code
  codebaseIndex: CodebaseIndex; // Updated as we generate
  consistencyRules: Rule[]; // Enforce patterns
}

class PlanExecutor {
  async executePlan(steps: Step[], context: ExecutionContext) {
    for (const step of steps) {
      // Generate with context from previous steps
      const code = await this.generateCode(step, context);
      
      // Validate against patterns
      const errors = await this.validateConsistency(code, context);
      
      // Store for next step
      context.previousOutputs.set(step.id, code);
      
      // Update index
      await context.codebaseIndex.addFile(step.expectedOutput, code);
    }
  }
  
  private async validateConsistency(code: string, context: ExecutionContext) {
    // Check: Does this hook use TanStack Query like others?
    // Check: Does this service follow the pattern?
    // Check: Do imports match existing patterns?
  }
}
```

---

### Component 5: Pattern Registry
**File:** `src/patterns.ts` (new)

**What it does:**
- Detect and catalog code patterns
- Find pattern violations
- Suggest pattern-compliant fixes
- Learn from existing code

**Implementation:**
```typescript
interface Pattern {
  name: string;
  description: string;
  examples: string[]; // Code examples
  detector: (ast: AST) => boolean;
  fixer: (ast: AST) => AST;
}

class PatternRegistry {
  // Detect hook pattern
  detectHookPattern(): Pattern {
    return {
      name: 'TanStack Query Hook',
      detector: (ast) => ast.contains('useQuery') && ast.hasCustomHook(),
      examples: [...],
      fixer: (ast) => transform(ast).toUseQuery()
    };
  }
  
  // Detect service pattern
  detectServicePattern(): Pattern {
    return {
      name: 'API Service',
      detector: (ast) => ast.hasExportedAsyncFunctions(),
      examples: [...],
      fixer: (ast) => transform(ast).toServicePattern()
    };
  }
  
  // Find violations
  findViolations(code: string, patterns: Pattern[]): Violation[] {
    // Check code against all patterns
  }
}
```

---

## Implementation Roadmap

### Week 1: Foundation (Days 1-3)

**Day 1: Codebase Indexing**
- Enhance vectorDB.ts
- AST-based file parsing
- Dependency graph extraction
- Local embedding generation

**Day 2: /context Command**
- Add command handler
- Output formatter
- Example responses
- UI integration

**Day 3: Intelligent Planner**
- Enhance planner.ts
- Dependency detection
- Step ordering
- Context generation

### Week 1-2: Integration (Days 4-5)

**Day 4: Output Tracking**
- Enhance executor.ts
- ExecutionContext implementation
- Previous output passing
- Index updates during execution

**Day 5: Pattern Registry**
- Detect patterns from existing code
- Consistency validation
- Violation detection
- Fix suggestions

### Week 2: Testing & Polish (Days 6+)

**Day 6: Integration Testing**
```bash
/plan "Create blog system" with full context
  - Should see existing patterns
  - Should order steps correctly
  - Should enforce consistency
```

**Day 7: Documentation & Release**
- Update README
- Add example `/context` usage
- Create Phase 3.3 release notes
- Performance benchmarks

---

## Key APIs (What Users Will See)

### /context Command
```
// Show file structure
/context show structure
Output:
  src/
    schemas/ (3 files)
      - user.ts
      - post.ts
      - comment.ts
    services/ (2 files)
      - api.ts
      - auth.ts
    hooks/ (4 files)
      - useUser.ts
      - usePosts.ts
      - useAuth.ts
      - useComments.ts

// Show dependencies
/context show dependencies
Output:
  useAuth → services/auth, schemas/user
  usePosts → services/api, schemas/post
  useUser → services/api, schemas/user

// Find patterns
/context show patterns
Output:
  Hooks pattern: All use TanStack Query + useQuery
  Services pattern: All export async functions, no class
  Schemas pattern: All use Zod with z.object()

// Find similar code
/context find hooks similar to useUser
Output:
  Similar hooks:
  1. useComments (94% match)
  2. usePosts (89% match)
```

### /plan with Context
```
/plan "Create comment system" with:
  1. Schema for comments
  2. Service for API calls
  3. Hook for data fetching
  4. Component for display

[Internal: Planner sees existing patterns]
Step 1: Create schemas/comment.ts
  Context: "Similar to schemas/user.ts and schemas/post.ts
   Pattern: z.object with Zod validators"

Step 2: Create services for comments
  Context: "Follow services/api.ts pattern
   Pattern: Export async functions, no classes"

Step 3: Create hooks/useComments.ts
  Context: "Similar to hooks/useUser.ts and hooks/usePosts.ts
   Pattern: Use useQuery with TanStack Query"

Step 4: Create component
  Context: "See components/PostList.tsx for similar pattern"
```

---

## Success Metrics

### Phase 3.3 Targets

**Correctness:**
- ✅ Dependency detection 95%+ accurate
- ✅ Pattern matching 90%+ accurate
- ✅ Cross-file consistency 85%+ maintained

**Capability:**
- ✅ Barrel files generated correctly
- ✅ Multi-file plans orchestrated properly
- ✅ Dependencies tracked correctly
- ✅ Patterns learned from existing code

**Performance:**
- `/context` command: <500ms
- Codebase indexing: <1s on startup
- Plan generation: <2s for 5-step plan

**User Experience:**
- `/plan` success rate: 70%+ (up from 50%)
- Auto-correction with context: 60%+ (up from 50%)
- Fewer manual fixes needed

---

## Testing Strategy

### Unit Tests
```typescript
// Dependency detection
test('should detect useUser → services/api dependency');
test('should detect hooks → schemas dependency');
test('should detect circular dependencies');

// Pattern detection
test('should detect TanStack Query hook pattern');
test('should detect service export pattern');
test('should detect schema validation pattern');

// Planner
test('should order steps by dependencies');
test('should generate context for each step');
test('should detect missing dependencies');
```

### Integration Tests
```typescript
// Real codebase test
test('/context show dependencies matches actual dependencies');
test('/plan with context generates consistent code');
test('multi-file plan execution maintains patterns');
```

### Manual Testing
```
1. Create new project
2. Run /plan "Build blog system"
3. Verify:
   - Step order correct
   - Files generated in dependency order
   - Imports match existing patterns
   - No duplicates across files
   - Code passes gatekeeper first try
```

---

## Files to Modify

### New Files
- `src/codebaseIndex.ts` — AST-based file analysis
- `src/patterns.ts` — Pattern registry

### Modified Files
- `src/vectorDB.ts` — Enhance stub (add codebase indexing)
- `src/planner.ts` — Add intelligent planning
- `src/executor.ts` — Add output tracking + consistency validation
- `src/extension.ts` — Add /context command
- `src/llmClient.ts` — Enhance prompts with context

### Documentation
- `README.md` — Add /context examples
- `PHASE-3.3-GUIDE.md` — User guide for new features
- `PHASE-3.3-TESTING.md` — Testing procedures

---

## Timeline

| Phase | Days | Deliverable |
|-------|------|-------------|
| 3.3.1 (Foundation) | 1-3 | Indexing + /context + Planner |
| 3.3.2 (Integration) | 4-5 | Output tracking + Patterns |
| 3.3.3 (Testing) | 6-7 | Testing + Documentation |
| **Release** | 7-8 | Phase 3.3 v1.0 |

**Estimated:** Feb 13-15, 2026 (1 week with focused effort)

---

## Dependencies

**External:**
- @babel/parser (already added in Phase 3.2)
- transformers.js (local embeddings)
- hnswlib-wasm (similarity search)

**Internal:**
- Phase 3.1 gatekeeper (validation)
- Phase 3.2 SemanticValidator (AST parsing)

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Dependency detection complexity | High | Start with simple AST, expand iteratively |
| Embedding generation slow | Medium | Cache embeddings, lazy load |
| Pattern learning from bad code | Medium | Manual pattern registry + AST validation |
| Planner creates circular deps | Medium | Topological sort + validation |

---

## Success Criteria

✅ Phase 3.3 launches when:
1. `/context` command works
2. Dependency detection 90%+ accurate
3. Multi-file `/plan` success rate 70%+
4. All 155 tests still passing
5. Documentation complete
6. Performance acceptable (<1s startup, <500ms /context)

---

## Next Steps (After Phase 3.3)

### Phase 3.4: Intelligent Planning
- Architectural decision making
- Service layer extraction patterns
- Multi-step refactoring guidance
- Smart error recovery

### Phase 4.0: Production Release
- Performance optimization
- Security hardening
- Documentation
- v2.0 release

---

**Status:** Ready to start. Beginning implementation Feb 6, 2026.
