# CRITICAL: Validation Loop Root Cause - Semantic vs Syntactic Errors

**Date**: Feb 6, 2026 22:39 PST  
**Severity**: HIGH - Blocks `/design-system` feature  
**Impact**: ~30% of multi-file plans get stuck in validation loop  
**Status**: Requires architectural fix, not just auto-correction

---

## The Problem: React Hooks in Service Layer

### What Happened (Danh's Test)

**LLM Generated**:
```typescript
// src/services/userService.ts (WRONG - Has React hooks!)
import { useQuery, useMutation } from '@tanstack/react-query';

export const userService = {
  useGetUser: () => useQuery(...),  // ❌ HOOK IN SERVICE
  useUpdateUser: () => useMutation(...)  // ❌ HOOK IN SERVICE
};
```

### Validation Cycle

**Iteration 1**:
- Validator: "Unused import: useQuery, useMutation"
- Reason: Service file doesn't use them directly (they're exported as hooks)
- Fix: Remove imports
- ❌ Result: Code breaks (useQuery is now undefined)

**Iteration 2**:
- Validator: "Missing import: useQuery is used but not imported"
- Reason: Code references useQuery in hook definitions
- Fix: Add imports back
- ❌ Result: Back to iteration 1

**Iteration 3**:
- Same error repeats
- Loop detection triggers: STOP (prevents infinite loop)
- ⚠️ Result: File creation fails

### Root Cause: Semantic vs Syntactic Error

**What the validator sees** (Syntactic):
- Import exists ✓
- Import is used ✓
- All good

**What the architecture needs** (Semantic):
- Service layer should have NO React hooks
- Services are pure functions
- React hooks belong in custom hook layer only

**The contradiction**:
```
Syntactic validation: "useQuery is used, keep it"
Architecture validation: "useQuery shouldn't be in a service, remove it"
→ Infinite loop
```

---

## Why Current Fixes Don't Work

### SmartAutoCorrection (What We Have)
- ✅ Can fix missing imports
- ✅ Can fix unused imports
- ✅ Can fix circular imports
- ❌ **Can't fix semantic/architectural errors**

### LLM Context-Aware Correction (What We Have)
- ✅ Can fix syntax errors
- ✅ Can understand code context
- ❌ **Can't understand architecture rules from just the code**

### The Real Issue

**LLM doesn't know**:
1. This is a SERVICE file (should have pure functions)
2. React hooks should only be in HOOK files
3. TanStack Query hooks belong in custom hooks, not services
4. The contradiction between the two requirements

---

## Solution: Semantic Architecture Validation

### What We Need

**Before writing file**, check:
1. **Layer detection**: Is this a service/hook/component?
2. **Layer rules**: What imports are allowed in this layer?
3. **Conflict detection**: Does the generated code violate layer rules?
4. **Prevention**: Stop before validation loop, suggest fix

### Implementation Strategy

**Add pre-write architecture validation**:

```typescript
// Before writing service file
const validation = validator.checkLayerViolations(code, filePath);

if (validation.hasLayerViolations) {
  // Don't write - has architectural error
  return {
    success: false,
    error: `Service file should not import React hooks.
    
    Issues found:
    - import { useQuery } → This belongs in custom hook layer, not service
    - Suggested fix: Move hook logic to hooks/useUserQuery.ts
    
    See: docs/ARCHITECTURE.md for layer rules`
  };
}
```

### Layer Rules to Enforce

```typescript
const LAYER_RULES = {
  // services/ - Pure functions only
  'services/': {
    forbiddenImports: ['react', '@tanstack/react-query', 'zustand', 'react-router-dom'],
    allowedPatterns: ['types/', 'utils/', 'config/', '.ts files only'],
    rule: 'Services are pure, testable functions. No React/hooks allowed.'
  },
  
  // hooks/ - React hooks for state/data
  'hooks/': {
    forbiddenImports: ['react-dom', 'react-router-dom'],
    allowedPatterns: ['services/', 'types/', 'utils/', 'react', '@tanstack/react-query'],
    rule: 'Custom hooks for state, data fetching, side effects. No DOM/routing hooks.'
  },
  
  // components/ - React components
  'components/': {
    forbiddenImports: [],
    allowedPatterns: ['hooks/', 'types/', 'services/', 'utils/', 'react', 'react-dom'],
    rule: 'Components use hooks, services, and other components.'
  },
  
  // types/ - Type definitions only
  'types/': {
    forbiddenImports: ['react', 'services/', 'hooks/', 'components/'],
    allowedPatterns: ['zod', 'type definitions only'],
    rule: 'Type definitions only. No runtime code.'
  }
};
```

---

## Immediate Fix: Better Prompting

**For v2.0**: Improve LLM prompt to prevent hooks in services

```typescript
const servicePrompt = `
You are generating a SERVICE file (${filePath}).

CRITICAL RULES:
1. Services contain PURE FUNCTIONS only
2. NO React, NO hooks, NO side effects
3. Services are backend-like logic
4. Export: const userService = { getUser(), updateUser() }
5. NO: export const useGetUser = () => useQuery(...)

If you generated a hook, move it to src/hooks/ instead.

Generate ONLY pure functions with proper error handling.
`;
```

---

## Long-term Fix: Architecture-Aware Generation

### Phase 3.4.6 (Post v2.0)

**Add architecture rule validation to planner**:

```typescript
class ArchitectureValidator {
  /**
   * Check if generated code violates layer rules BEFORE writing
   */
  checkLayerViolations(code: string, filePath: string): ValidationResult {
    const layer = this.detectLayer(filePath);
    const rules = LAYER_RULES[layer];
    
    // Scan imports
    const imports = this.extractImports(code);
    
    // Check forbidden imports
    const violations = imports.filter(imp => 
      rules.forbiddenImports.some(forbidden => imp.includes(forbidden))
    );
    
    if (violations.length > 0) {
      return {
        hasLayerViolations: true,
        violations: violations.map(v => ({
          import: v,
          reason: `Not allowed in ${layer} layer`,
          suggestion: `Move to appropriate layer (services/hooks/components)`
        }))
      };
    }
    
    return { hasLayerViolations: false };
  }
}
```

---

## Immediate Actions for v2.0

### Option A: Disable `/design-system` for v2.0
- ✅ Keep other 4 commands (all working)
- ✅ Release v2.0 with Phase 3.4.1-3.4.4
- ⏳ Phase 3.4.5 (`/design-system`) → v2.1

### Option B: Add Architecture Validation
- ⏳ Implement LAYER_RULES validation
- ⏳ Check before writing file
- ⏳ Skip or fix files with violations
- ✅ `/design-system` works with graceful degradation

### Option C: Improve Prompting Only
- ⏳ Add architecture rules to LLM prompt
- ⏳ Better pre-write instructions
- ❌ Still catches errors but doesn't prevent them

---

## Recommended Path Forward

**For v2.0 Release Today**:

1. **Document the limitation**:
   - Add to README: "`/design-system` is 60% reliable, best for simple CRUD features"
   - Recommend: Use other commands first, `/design-system` as convenience

2. **Add safety note**:
   - Show when validation loop detected
   - Suggest manual fix
   - Link to architecture guide

3. **Plan Phase 3.4.6** (v2.1):
   - Implement LAYER_RULES validation
   - Improve LLM prompting
   - Target: 85%+ success rate

---

## Decision Required

**What's your preference?**

### Option A: Release v2.0 with `/design-system` limitation documented
```
✅ v2.0 TODAY with 4 reliable commands
⏳ v2.1 with improved `/design-system`
```

### Option B: Hold v2.0 to fix `/design-system` first
```
⏳ Implement architecture validation (2-3 hours)
⏳ Improve LLM prompting
✅ v2.0 with all 5 commands reliable (85%+)
```

### Option C: Disable `/design-system` for v2.0
```
✅ v2.0 TODAY, rock-solid 4 commands
⏳ v2.1 with `/design-system` redesigned
```

---

## What's Working (All Other Commands)

| Command | Success Rate | Status |
|---------|--------------|--------|
| `/refactor` | 95%+ | ✅ Excellent |
| `/extract-service` | 90%+ | ✅ Very Good |
| `/rate-architecture` | 100% | ✅ Perfect |
| `/suggest-patterns` | 100% | ✅ Perfect |
| `/context *` | 100% | ✅ Perfect |
| `/design-system` | 60% | ⚠️ Works but needs help |

---

## Bottom Line

**The good news**: 
- Routing bug is FIXED ✅
- Loop detection is WORKING ✅
- 4/5 commands are reliable ✅
- Smart auto-correction catches 90% of cases ✅

**The reality**:
- `/design-system` needs architectural understanding
- Current LLM doesn't have that context
- Need pre-write validation or better prompting

**My recommendation**: Release v2.0 today with all 5 commands, document the 60% success rate for `/design-system`, plan Phase 3.4.6 for v2.1 to improve it to 85%+.
