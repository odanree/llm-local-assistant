# Phase 3.2: Semantic Validation + Vector RAG

**Status:** Planning  
**Timeline:** 8-12 days  
**Goal:** Increase validation success from 70% (Phase 3.1) to 90%+ with semantic understanding

---

## Why Phase 3.2 is Necessary

Phase 3.1 catches obvious issues (missing imports, syntax errors) but misses semantic violations:
- ❌ Regex patterns can't distinguish real `z` from fake `const z = {}`
- ❌ Auto-correction fails on complex refactoring
- ❌ Can't detect wrong patterns (Zustand for server state, useState for client queries)
- ❌ Error messages lack context (no line numbers, no usage examples)

**Real-world impact:** 30% of validations need manual fixing due to semantic gaps.

---

## Phase 3.2 Components

### 1. AST-Based Semantic Validation (2-3 days)

Replace regex patterns with Abstract Syntax Tree parsing.

**Current (Phase 3.1):**
```typescript
// Regex check: just looks for "import { z }"
if (content.includes('import { z }')) { ... }
```

**Better (Phase 3.2):**
```typescript
// AST check: verifies z actually comes from 'zod'
const tree = parse(code);
const imports = tree.body.filter(n => n.type === 'ImportDeclaration');
const zFromZod = imports.find(i => 
  i.source.value === 'zod' && 
  i.specifiers.some(s => s.imported.name === 'z')
);
if (usesZ && !zFromZod) {
  error("z used but not imported from 'zod'");
}
```

**Benefits:**
- ✅ Distinguish `import { z } from 'zod'` vs `const z = {}`
- ✅ Validate actual import sources (not just patterns)
- ✅ Enable semantic checks on function calls
- ✅ Find undefined variables properly

**Tools:**
- `@babel/parser` - Parse TypeScript/JSX
- `@babel/traverse` - Walk AST
- Custom validators for semantic rules

**Validation Types:**
1. **Import validation** - Verify imports actually exist
2. **Usage validation** - Verify used items are imported
3. **Pattern validation** - Zustand stores, React Query hooks, etc.
4. **Architectural validation** - Wrong state management patterns

---

### 2. Vector RAG for Context (3-4 days)

Index codebase for semantic code search. Provide context-aware suggestions.

**Current (Phase 3.1):**
```
❌ Auto-correction failed
Try manually: "Fix missing import in editor"
```

**Better (Phase 3.2):**
```
❌ Auto-correction failed (2 attempts)
Similar patterns in your codebase:
- src/hooks/useUsers.ts: imports z from 'zod' at line 1
- src/schemas/user.ts: defines z.object schema

Suggestion: Add at top of file:
  import { z } from 'zod'
```

**Implementation:**
1. Create vector embeddings of code snippets
2. Store in local vector DB (Supabase pgvector or Qdrant)
3. On validation failure, search similar patterns
4. Extract and present working examples

**Benefits:**
- ✅ Learn from existing code patterns
- ✅ Provide context-aware fixes
- ✅ Show examples of correct usage
- ✅ Improve LLM prompting with real examples

**Tools:**
- `transformers.js` - Local embeddings (Xenova)
- `hnswlib-wasm` - Vector similarity search
- `Supabase` or `Qdrant` - Vector storage (optional, local first)

---

### 3. Smarter Error Messages (1-2 days)

Include context, line numbers, and specific fix instructions.

**Current (Phase 3.1):**
```
❌ Missing import: 'z' is used but never imported
```

**Better (Phase 3.2):**
```
❌ Line 5: z.object() called but z not imported
   Code: const schema = z.object({ name: z.string() })
   Fix: Add at top: import { z } from 'zod'
   
   Use /context to see similar patterns in your codebase
```

**Implementation:**
1. AST gives us line numbers
2. Extract code snippets around errors
3. Generate specific fix instructions
4. Link to `/context` command for examples

---

### 4. Advanced Auto-Correction (2-3 days)

Multi-step fixes, semantic understanding, graceful degradation.

**Current (Phase 3.1):**
- 2 retry attempts
- Single-line fixes only
- Fails on complex issues

**Better (Phase 3.2):**
- 3-5 retry attempts with escalating strategies
- Multi-step fixes (import, then fix usage)
- Semantic understanding (understand what code should do)
- Graceful degradation (helpful manual guidance)

**Escalation Strategy:**
1. **Attempt 1:** Simple fix (add import, fix typo)
2. **Attempt 2:** Context fix (specific line numbers, code samples)
3. **Attempt 3:** Pattern-based fix (show similar patterns)
4. **Attempt 4:** Manual guidance (detailed instructions + examples)
5. **Attempt 5:** Request user help (context + suggested changes)

**Implementation:**
```typescript
async attemptAutoCorrection(errors, attempt, context) {
  if (attempt === 1) {
    // Simple error message
    return await llm.fix(errors);
  }
  if (attempt === 2) {
    // Add line numbers and code
    return await llm.fix(errors + context);
  }
  if (attempt === 3) {
    // Show similar patterns
    const patterns = await vectorDb.search(errors);
    return await llm.fix(errors + patterns);
  }
  if (attempt === 4) {
    // Graceful degradation
    return await gracefulDegradation(errors, context);
  }
}
```

---

### 5. Graceful Degradation UI (1-2 days)

Better manual guidance when auto-correction fails.

**Current (Phase 3.1):**
```
❌ Auto-correction failed
Fix manually in editor
```

**Better (Phase 3.2):**
```
❌ Auto-correction failed after 5 attempts

REMAINING ISSUES:
1. Line 5: z.object() without z import
2. Line 12: useQuery config structure (v4 vs v5)

NEXT STEPS:
1. Add at line 1: import { z } from 'zod'
2. Change line 12 queryKey: ['users'] to { queryKey: ['users'] }
3. Run /write again to revalidate

SIMILAR WORKING PATTERNS:
- src/hooks/useUsers.ts ← Check this for examples
- src/schemas/user.ts ← Shows correct z.object setup

Need help? Use:
- /context to search similar patterns
- /explain to understand the issue
```

---

## Implementation Roadmap

### Week 1: AST + Semantic Validation
- [ ] Add `@babel/parser` and traverse
- [ ] Implement import validation
- [ ] Implement usage validation
- [ ] Add semantic rule validators
- [ ] Update validation in executor.ts
- [ ] All tests passing

### Week 2: Vector RAG + Context
- [ ] Add transformers.js for embeddings
- [ ] Implement vector DB interface
- [ ] Integrate `/context` command
- [ ] Index codebase on startup
- [ ] Implement similarity search
- [ ] All tests passing

### Week 3: Better Errors + Advanced Correction
- [ ] Upgrade error messages with context
- [ ] Implement escalation strategy
- [ ] Add graceful degradation
- [ ] Improve manual guidance
- [ ] Add `/explain` command
- [ ] All tests passing

### Week 4: Integration + Polish
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Documentation
- [ ] Version v2.0 release

---

## Success Metrics

**Phase 3.1:** 70% validation coverage, 50-70% auto-correction success  
**Phase 3.2 Goal:** 90%+ validation coverage, 80%+ auto-correction success

**Metrics to Track:**
- Validation false negatives (should decrease)
- Auto-correction retry count (should decrease)
- User manual fixes (should decrease by 40%+)
- Time to deployable code (should improve 3-5x)

---

## Known Risks

1. **AST parsing complexity** - TypeScript AST is complex, edge cases possible
2. **Vector DB performance** - Embedding 1000+ files could be slow
3. **Context window limits** - LLM might not have room for full context
4. **False positives** - Semantic validation might flag valid patterns

**Mitigation:**
- Test on real codebases early
- Implement performance profiling
- Graceful degradation if context too large
- Conservative semantic rules (high precision over recall)

---

## Files to Create/Modify

**New Files:**
- `src/semanticValidator.ts` - AST-based validation
- `src/vectorDB.ts` - Vector DB interface
- `src/codeEmbeddings.ts` - Code embedding logic
- `docs/PHASE-3.2-USAGE.md` - User guide
- `PHASE-3.2-PROGRESS.md` - Development log

**Modified Files:**
- `src/executor.ts` - Use semantic validators
- `src/extension.ts` - Add /context, /explain commands
- `src/llmClient.ts` - Escalation strategy
- `tests/*` - New test cases for Phase 3.2

---

## Dependencies to Add

```json
{
  "dependencies": {
    "@babel/parser": "^7.23.0",
    "@babel/traverse": "^7.23.0",
    "@babel/types": "^7.23.0",
    "transformers": "^2.6.0",
    "hnswlib-wasm": "^0.1.0"
  },
  "devDependencies": {
    "@babel/core": "^7.23.0"
  }
}
```

---

## Decision Points for Danh

1. **Vector DB Choice:**
   - Option A: Local only (hnswlib-wasm, fast but limited)
   - Option B: Local + Cloud (Supabase pgvector, scalable)
   - Option C: Start local, migrate to cloud later

2. **Semantic Rule Strictness:**
   - Conservative (high precision, might miss some issues)
   - Aggressive (low precision, might flag false positives)
   - Recommended: Conservative first, relax based on feedback

3. **Timeline:**
   - Fast track (2 weeks, basic AST + Vector)
   - Standard (3-4 weeks, full Phase 3.2)
   - Extended (4+ weeks, with advanced features)
   - Recommended: Standard (full implementation)

---

## Next Steps

1. Review this plan
2. Make decisions on Vector DB, strictness, timeline
3. Create semantic validator skeleton
4. Implement AST-based import validation
5. Get to 80%+ auto-correction success

Ready to start Phase 3.2? 🚀
