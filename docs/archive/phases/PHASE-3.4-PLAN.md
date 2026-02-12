# Phase 3.4: Intelligent Refactoring & Architectural Suggestions

**Status:** Starting (Feb 6, 16:15 PST)  
**Target Completion:** Feb 12-15, 2026 (5-7 days)  
**Effort Estimate:** 40-60 hours  
**Goal:** Enable architectural suggestions, service layer extraction, pattern recommendations

---

## Mission

**Phase 3.1 solved:** Code validation gatekeeper ✅  
**Phase 3.2 solved:** Semantic validation (AST-based) ✅  
**Phase 3.3 solved:** Context awareness & multi-file orchestration ✅  
**Phase 3.4 solves:** Intelligent architectural refactoring

Enable:
- `/refactor <file>` — Suggest architectural improvements
- `/extract-service <hook> <name>` — Extract business logic into service layer
- `/suggest-patterns` — Recommend patterns for current codebase
- `/design-system <feature>` — Generate complete feature architecture
- Smart pattern templates (use existing patterns as guides)
- Architectural consistency enforcement

---

## Problem Statement

### Current Limitation
```
User: Create a complex feature with multiple services
Phase 3.3 Result:
  ✅ Files created in correct order
  ✅ Imports correct
  ✅ Patterns followed
  ❌ Architecture suboptimal (hooks too fat, service logic mixed in)
  ❌ Could be refactored to extract services
  ❌ No suggestions for architectural improvements
```

### What Phase 3.4 Solves
```
User: /design-system User Profile
Phase 3.4 Result:
  ✅ Analyzes domain (user profile = read + update + delete)
  ✅ Suggests architecture:
    - useUser hook (read + local state)
    - userService (API calls)
    - userSchema (Zod validation)
    - UserForm component (UI layer)
  ✅ Generates with best practices
  ✅ Refactors if feature already exists
```

---

## Architecture & Components

### Component 1: Architectural Pattern Library (New)
**File:** `src/architecturePatterns.ts`  
**Responsibility:** Recognize and suggest architectural patterns

```typescript
// Pattern detection & templates
export class ArchitecturePatterns {
  // Detect patterns in codebase
  detectPattern(code: string): PatternType
  
  // Get pattern template
  getTemplate(pattern: PatternType): string
  
  // Suggest patterns for feature
  suggestPatterns(feature: string): PatternSuggestion[]
  
  // Generate feature with best practices
  generateFeature(feature: string, patterns: PatternType[]): FeatureTemplate
}
```

**Pattern Types:**
- CRUD (Create-Read-Update-Delete)
- Authentication
- Form Handling
- Data Fetching
- State Management
- Notification System
- Search & Filter
- Pagination

**Example: CRUD Pattern**
```
Domain: User Profile
├── Schema (Zod)
│   ├── userSchema
│   ├── createUserInput
│   ├── updateUserInput
├── Service Layer
│   ├── getUser(id)
│   ├── updateUser(id, data)
│   ├── deleteUser(id)
├── Hook Layer
│   ├── useUser(id) — read + cache
│   ├── useUpdateUser() — mutation
│   ├── useDeleteUser() — mutation
└── Component Layer
    ├── UserProfile — read view
    ├── UserForm — edit view
    └── UserList — list view
```

### Component 2: Feature Analyzer (New)
**File:** `src/featureAnalyzer.ts`  
**Responsibility:** Analyze user requests and suggest architectures

```typescript
export class FeatureAnalyzer {
  // Analyze feature request
  analyzeFeature(description: string): FeatureAnalysis
  
  // Suggest architecture
  suggestArchitecture(feature: FeatureAnalysis): ArchitectureSuggestion
  
  // Estimate complexity
  estimateComplexity(feature: FeatureAnalysis): 'simple' | 'medium' | 'complex'
  
  // Detect anti-patterns
  detectAntiPatterns(code: string): AntiPattern[]
}
```

**Analysis Output:**
```
Feature: "User profile with avatar upload"

Complexity: medium
Operations: Read, Update, Upload
Data: User profile + image file
Interactions: Forms, Async uploads, Caching

Suggested Architecture:
  - Service layer: API calls + upload handler
  - Schema layer: User schema + file validation
  - Hook layer: useUser, useUploadAvatar
  - Component layer: ProfileForm, AvatarUploader
```

### Component 3: Service Extractor (New)
**File:** `src/serviceExtractor.ts`  
**Responsibility:** Detect fat hooks and suggest service extraction

```typescript
export class ServiceExtractor {
  // Detect fat hooks (too much logic)
  detectFatHooks(codebaseIndex: CodebaseIndex): FatHook[]
  
  // Extract service from hook
  extractService(hook: string, serviceName: string): ServiceExtraction
  
  // Suggest refactoring
  suggestRefactoring(analysis: FatHookAnalysis): RefactoringPlan
}
```

**Example: Fat Hook Detection**
```
Current useUser hook:
  - Fetches user data (50 lines)
  - Handles mutations (60 lines)
  - Manages cache (40 lines)
  - Validation logic (30 lines)
  → Total: 180 lines (too fat!)

Suggested refactoring:
  ✅ Extract userService (fetch + mutations)
  ✅ Extract userSchema (validation)
  ✅ Simplify useUser (15 lines, just orchestration)
  ✅ Recommended: userService.ts (90 lines)
              userSchema.ts (20 lines)
              useUser.ts (15 lines)
```

### Component 4: Refactoring Suggester (New)
**File:** `src/refactoringSuggester.ts`  
**Responsibility:** Suggest architectural improvements

```typescript
export class RefactoringSuggester {
  // Suggest refactorings for file
  suggestRefactorings(file: string, code: string): Refactoring[]
  
  // Rate current architecture
  rateArchitecture(codebaseIndex: CodebaseIndex): ArchitectureScore
  
  // Suggest improvements
  suggestImprovements(analysis: ArchitectureAnalysis): Improvement[]
  
  // Generate refactoring plan
  generateRefactoringPlan(analysis: ArchitectureAnalysis): RefactoringPlan
}
```

**Scoring System:**
```
Architecture Assessment:
  - Layer separation: 8/10 (good)
  - Reusability: 6/10 (some duplication)
  - Testability: 7/10 (mostly testable)
  - Maintainability: 6/10 (some fat files)
  - Overall: 6.75/10 (needs improvement)

Specific Recommendations:
  1. Extract userService (70% confidence) — Reduce hook complexity
  2. Create useForm hook (60% confidence) — DRY form logic
  3. Add error boundary (80% confidence) — Better error handling
  4. Extract api.ts (75% confidence) — Centralize API calls
```

### Component 5: LLM-Guided Refactoring (New)
**File:** Enhanced `src/executor.ts`  
**Responsibility:** Execute refactoring with LLM

```typescript
export class RefactoringExecutor extends Executor {
  // Execute refactoring with LLM guidance
  async executeRefactoring(plan: RefactoringPlan): Promise<RefactoringResult>
  
  // Validate refactoring maintains functionality
  async validateRefactoring(before: string, after: string): Promise<ValidationResult>
  
  // Generate test cases for refactoring
  async generateTestCases(refactoring: Refactoring): Promise<string>
}
```

### Component 6: New Commands in Extension
**File:** `src/extension.ts`  
**New Commands:**

```
/refactor <file>
  → Analyze file
  → Suggest improvements
  → Ask for approval
  → Execute refactoring

/extract-service <hook> <service-name>
  → Detect business logic in hook
  → Create service file
  → Update hook imports
  → Validate

/design-system <feature>
  → Analyze feature requirements
  → Suggest full architecture
  → Generate all files (schema, service, hooks, components)
  → Multi-file coordinated generation

/suggest-patterns
  → Analyze codebase
  → Identify current patterns
  → Suggest improvements
  → Show best practices

/rate-architecture
  → Score current architecture
  → Show improvements
  → Prioritize refactorings
```

---

## Implementation Plan

### Phase 3.4.1: Pattern Library (Days 1-2, 15-20 hrs)

**Step 1: Architectural Pattern Library**
- Create `src/architecturePatterns.ts` (400 lines)
- Define 8 pattern types: CRUD, Auth, Forms, Fetching, State, Notifications, Search, Pagination
- Pattern templates for each (Zod + service + hook + component)
- Pattern detection algorithm (analyze code → detect pattern)

**Step 2: Feature Analyzer**
- Create `src/featureAnalyzer.ts` (300 lines)
- Parse feature descriptions (NLP-like analysis)
- Map to pattern types
- Estimate complexity
- Anti-pattern detection

**Testing:**
- Unit tests for pattern detection
- Test feature analysis
- Validate templates
- ~50 tests expected

### Phase 3.4.2: Service Extractor (Days 2-3, 10-15 hrs)

**Step 1: Fat Hook Detection**
- Analyze hook files (lines of code, complexity metrics)
- Detect when hooks exceed 80 lines
- Identify extraction candidates
- Generate extraction suggestions

**Step 2: Service Extraction**
- Extract business logic from hook
- Create service file with extracted logic
- Update hook to use service
- Maintain imports and dependencies

**Step 3: Validation**
- Ensure refactored code maintains functionality
- Check imports are correct
- Validate against architecture rules

**Testing:**
- Test extraction on real hooks
- Validate generated services
- ~30 tests expected

### Phase 3.4.3: Refactoring Suggester (Days 3-4, 15-20 hrs)

**Step 1: Architecture Scoring**
- Analyze codebase structure
- Score each dimension: layers, reusability, testability, maintainability
- Generate architecture assessment

**Step 2: Improvement Suggestions**
- Identify duplicate logic
- Detect untestable patterns
- Spot missing abstractions
- Generate prioritized recommendations

**Step 3: Refactoring Plans**
- Create step-by-step refactoring plans
- Estimate effort
- Show before/after code

**Testing:**
- Test scoring algorithm
- Validate suggestions
- ~40 tests expected

### Phase 3.4.4: LLM-Guided Refactoring (Days 4-5, 15-20 hrs)

**Step 1: Refactoring Executor**
- Extend Executor to handle refactoring
- Add LLM-guided refactoring
- Validate refactored code

**Step 2: Test Generation**
- Generate test cases for refactoring
- Ensure tests pass after changes
- Validate functionality

**Step 3: Interactive Refactoring**
- Show before/after
- Ask for confirmation
- Execute with rollback capability

**Testing:**
- Test refactoring execution
- Validate test generation
- ~50 tests expected

### Phase 3.4.5: New Commands (Days 5-6, 10-15 hrs)

**Step 1: Extension Integration**
- Add `/refactor` command
- Add `/extract-service` command
- Add `/design-system` command
- Add `/suggest-patterns` command
- Add `/rate-architecture` command

**Step 2: UI & Messaging**
- Display analysis results
- Show improvement suggestions
- Ask for approval before executing
- Report results

**Step 3: Help & Documentation**
- Update help text
- Add command descriptions
- Create usage examples

**Testing:**
- Integration tests
- End-to-end command testing
- ~60 tests expected

---

## Success Metrics

### Phase 3.4 Goals
✅ **Pattern Detection:** 90%+ accuracy  
✅ **Service Extraction:** Successfully extract 80%+ of fat hooks  
✅ **Architecture Scoring:** Realistic assessment of code quality  
✅ **Refactoring Suggestions:** 70%+ applicable recommendations  
✅ **Test Coverage:** 200+ new tests  
✅ **Zero Regressions:** All Phase 3.1-3.3 tests still passing  

---

## Timeline & Estimates

```
Phase 3.4.1: Pattern Library     (15-20 hrs) → Feb 7-8
Phase 3.4.2: Service Extractor  (10-15 hrs) → Feb 8-9
Phase 3.4.3: Refactoring Sugg.  (15-20 hrs) → Feb 9-10
Phase 3.4.4: LLM Refactoring    (15-20 hrs) → Feb 11-12
Phase 3.4.5: Commands & UI      (10-15 hrs) → Feb 12-13

Total: 65-90 hours (~1-2 weeks @ 5-10 hrs/day)
v2.0 Release: Feb 13-15, 2026
```

---

## What Users Can Do (Phase 3.4 Complete)

```
/refactor src/hooks/useUser.ts
→ Analysis shows hook is 150 lines
→ Suggests extracting userService
→ Shows before/after code
→ Asks for approval
→ Executes refactoring + updates imports

/extract-service useUser UserAPI
→ Extracts all API logic from hook
→ Creates src/services/userApi.ts
→ Updates hook to use service
→ Validates imports

/design-system "User profile with notifications"
→ Analyzes feature complexity
→ Suggests CRUD + Notification patterns
→ Generates:
  - User schema (Zod)
  - User service (API + notifications)
  - useUser hook (data fetching)
  - useNotifications hook (notification logic)
  - UserProfile component
  - All coordinated and tested

/suggest-patterns
→ Shows current patterns (CRUD: 2, Auth: 1, Forms: 3)
→ Suggests missing patterns
→ Shows best practices

/rate-architecture
→ Score: 7.2/10
→ Improvements:
  1. Extract userService (75% confidence)
  2. Consolidate forms (60% confidence)
  3. Add error boundaries (80% confidence)
```

---

## Risk Mitigation

### Risk 1: Refactoring Breaks Code
**Mitigation:**
- Generate test cases before refactoring
- Run tests after each step
- Maintain rollback capability
- Validate imports and types

### Risk 2: Poor Architectural Suggestions
**Mitigation:**
- Use proven patterns (CRUD, Auth, Forms, etc.)
- Let user approve before executing
- Show confidence scores
- Ask for clarification on complex cases

### Risk 3: LLM-Generated Refactoring Code Quality
**Mitigation:**
- Phase 3.1 gatekeeper validates all generated code
- Phase 3.2 semantic validation ensures correctness
- Phase 3.3 context awareness prevents orphaned imports
- Test generation validates functionality

### Risk 4: Performance (Scanning Large Codebases)
**Mitigation:**
- Cache analysis results
- Lazy load components
- Incremental indexing
- Progress reporting

---

## Integration with Phase 3.1-3.3

**Phase 3.1 Gatekeeper:** Validates all generated/refactored code ✅  
**Phase 3.2 Semantic Validation:** Ensures AST correctness ✅  
**Phase 3.3 Context Awareness:** Provides codebase visibility ✅  
**Phase 3.4 Intelligent Refactoring:** Uses 3.1-3.3 as foundation ✅

---

## Decision Points

### Should Phase 3.4 Include Search & Replace?
**No.** Too risky without user approval. Stick to new file generation + code suggestions.

### Should Phase 3.4 Support Rollback?
**Yes.** Store git history, allow easy rollback of failed refactorings.

### Should Phase 3.4 Generate Tests?
**Yes.** Generate test cases alongside refactorings to ensure functionality.

### Should Phase 3.4 Include Database Schema Migrations?
**No.** Defer to v2.1. Keep Phase 3.4 focused on code architecture.

---

## What Gets Shipped in v2.0

**Phase 3.1 (Code Validation)** ✅
- Gatekeeper validation before write
- Auto-correction for common errors
- 3-layer validation (types, rules, patterns)

**Phase 3.2 (Semantic Validation)** ✅
- AST-based validation
- Perfect for single files
- Catches semantic errors

**Phase 3.3 (Context Awareness)** ✅
- /context command (4 subcommands)
- Intelligent multi-file planning
- Output tracking during execution
- 70%+ /plan success rate

**Phase 3.4 (Intelligent Refactoring)** ⏳
- /refactor, /extract-service, /design-system, /suggest-patterns, /rate-architecture
- Pattern library with 8 pattern types
- Fat hook detection and extraction
- Architecture scoring and suggestions
- LLM-guided refactoring

**v2.0 = Complete AI-Powered Code Generation System**
- Single-file generation: 95%+ success rate
- Multi-file generation: 75%+ success rate
- Intelligent refactoring: Suggested improvements
- Architectural guidance: Smart pattern recommendations
- Backward compatible: All v1.x features preserved

---

**Status: Phase 3.4 ready to start. Estimated v2.0 release: Feb 13-15, 2026 🚀**
