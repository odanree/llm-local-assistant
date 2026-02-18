# Phase 3 Execution Guide - Follow the Critical Hit List

**Status**: Ready to Execute
**Goal**: 41% → 50%+ coverage in one week
**Effort**: 5-7 hours total

---

## Quick Start: Copy-Paste Test Templates

Below are battle-tested test templates you can copy and adapt. Just fill in your specific code paths and error messages.

---

## Hit #1: pathSanitizer.ts (20 minutes) → +1-2% coverage

**File**: `src/utils/pathSanitizer.test.ts`

**Current Coverage**: 14.7%
**Target**: 90%+
**Uncovered Lines**: ...64,187,226-293

### What to Test

The `PathSanitizer.validatePath()` function validates file paths. Test these scenarios:

```typescript
// ✅ VALID PATHS (should return valid=true)
- 'src/components/Button.tsx'        // standard path
- 'app/layout.tsx'                   // different directory
- './src/file.ts'                    // relative with ./
- '../utils/helper.ts'               // relative with ../
- 'index.ts'                         // single file

// ❌ INVALID PATHS (should return valid=false)
- undefined / null                    // missing input
- ''                                  // empty string
- 'src/components'                    // no extension
- 'src/file.xyz'                      // invalid extension
- 'src/this is a sentence.ts'        // multiple spaces
- 'src/contains button.ts'            // description pattern
- 'invalid/file.ts'                   // bad directory prefix
```

### Template: Minimal Test File

```typescript
import { describe, it, expect } from 'vitest';
import { PathSanitizer } from './pathSanitizer';
import { ViolationCodes } from '../types/validation';

describe('PathSanitizer', () => {
  // Valid paths
  it('accepts src/ paths', () => {
    const result = PathSanitizer.validatePath('src/file.tsx');
    expect(result.valid).toBe(true);
  });

  // Invalid paths
  it('rejects undefined', () => {
    const result = PathSanitizer.validatePath(undefined);
    expect(result.valid).toBe(false);
  });

  it('rejects no extension', () => {
    const result = PathSanitizer.validatePath('src/file');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('extension');
  });

  it('rejects multiple spaces', () => {
    const result = PathSanitizer.validatePath('src/this is bad.ts');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('spaces');
  });

  it('rejects description patterns', () => {
    const result = PathSanitizer.validatePath('src/contains button.ts');
    expect(result.valid).toBe(false);
  });

  // Edge cases
  it('trims whitespace', () => {
    const result = PathSanitizer.validatePath('  src/file.ts  ');
    expect(result.valid).toBe(true);
  });

  it('accepts multiple dots', () => {
    const result = PathSanitizer.validatePath('src/index.test.ts');
    expect(result.valid).toBe(true);
  });
});
```

### How to Run

```bash
# Run just this file
npm test -- src/utils/pathSanitizer.test.ts

# With coverage
npm test -- src/utils/pathSanitizer.test.ts --coverage

# Watch mode while developing
npm test -- src/utils/pathSanitizer.test.ts --watch
```

### Expected Result

```
pathSanitizer.ts | 14.7%  →  90%+  ✅
Overall         | 41.36% → 42.5%+ ✅
```

---

## Hit #2: SemanticValidator.ts (2-3 hours) → +5-8% coverage

**File**: `src/services/semanticValidator.test.ts`

**Current Coverage**: 0%
**Target**: 50%+
**File Size**: 538 lines (MASSIVE - don't test everything!)

### Strategy: Test Entry Point Only

`SemanticValidator.audit()` is the main entry point. Test:
1. It initializes without crashing
2. It returns an array
3. It detects name collisions (import 'cn' then export 'cn')
4. It handles edge cases (null, empty string, huge files)

### What NOT to Test

- Don't test internal detection methods exhaustively
- Don't test every regex pattern
- Just test: "does it work for the happy path?"

### Template: Minimal Test File

```typescript
import { describe, it, expect } from 'vitest';
import { SemanticValidator } from './semanticValidator';

describe('SemanticValidator - Integration Tests', () => {
  describe('audit() - Main Entry Point', () => {
    it('initializes without errors', () => {
      const errors = SemanticValidator.audit('const x = 1;');
      expect(Array.isArray(errors)).toBe(true);
    });

    it('returns empty array for clean code', () => {
      const code = `
        const x = 1;
        const y = x + 1;
      `;
      const errors = SemanticValidator.audit(code);
      expect(errors.length).toBe(0);
    });

    it('detects name collisions', () => {
      const code = `
        import { cn } from '@/utils';
        export function cn() {}
      `;
      const errors = SemanticValidator.audit(code);
      expect(errors.length).toBeGreaterThan(0);
      if (errors.length > 0) {
        expect(errors[0].type).toBe('name-collision');
      }
    });

    it('handles edge cases', () => {
      expect(() => SemanticValidator.audit('')).not.toThrow();
      expect(() => SemanticValidator.audit(null as any)).not.toThrow();
      expect(() => SemanticValidator.audit('a'.repeat(10000))).not.toThrow();
    });

    it('returns proper error structure', () => {
      const code = `
        import { cn } from '@/utils';
        export const cn = 'name-collision';
      `;
      const errors = SemanticValidator.audit(code);
      if (errors.length > 0) {
        const err = errors[0];
        expect(err).toHaveProperty('type');
        expect(err).toHaveProperty('message');
        expect(err).toHaveProperty('severity');
      }
    });
  });
});
```

### How to Run

```bash
npm test -- src/services/semanticValidator.test.ts --coverage
```

### Expected Result

```
semanticValidator.ts | 0%   →  50%+  ✅
Services section     | 36.87% → 42%+  ✅
Overall              | 42.5% → 47%+   ✅
```

---

## Hit #3: executorFactory.ts (1-2 hours) → +3-5% coverage

**File**: `src/test/factories/executorFactory.test.ts`

**Current Coverage**: 0%
**Target**: 70%+
**Importance**: CRITICAL - test the testers!

### Why This Matters

Your factory functions (`createExecutionStep`, `createTaskPlan`) are used in other tests. If they're broken, ALL dependent tests are unreliable.

### What to Test

1. Each factory function returns valid objects
2. Factory functions respect input parameters
3. Generated objects have required properties
4. Objects can chain (step → plan)

### Template: Minimal Test File

```typescript
import { describe, it, expect } from 'vitest';
import {
  createExecutionStep,
  createTaskPlan,
} from './executorFactory';

describe('ExecutorFactory - Factory Functions', () => {
  describe('createExecutionStep()', () => {
    it('creates step with defaults', () => {
      const step = createExecutionStep();
      expect(step).toBeDefined();
      expect(step.id).toBeDefined();
      expect(step.action).toBeDefined();
      expect(step.description).toBeDefined();
    });

    it('accepts custom values', () => {
      const step = createExecutionStep({
        id: 'step_1',
        action: 'write',
        path: 'test.ts'
      });
      expect(step.id).toBe('step_1');
      expect(step.action).toBe('write');
      expect(step.path).toBe('test.ts');
    });

    it('supports all action types', () => {
      const actions = ['read', 'write', 'run', 'delete'];
      actions.forEach(action => {
        const step = createExecutionStep({ action: action as any });
        expect(step.action).toBe(action);
      });
    });

    it('creates valid ExecutionStep objects', () => {
      const step = createExecutionStep();
      expect(typeof step.id).toBe('string');
      expect(typeof step.description).toBe('string');
      expect(['read', 'write', 'run', 'delete']).toContain(step.action);
    });
  });

  describe('createTaskPlan()', () => {
    it('creates plan with defaults', () => {
      const plan = createTaskPlan();
      expect(plan).toBeDefined();
      expect(plan.taskId).toBeDefined();
      expect(plan.userRequest).toBeDefined();
      expect(Array.isArray(plan.steps)).toBe(true);
    });

    it('accepts steps', () => {
      const step = createExecutionStep({ id: 'step_1' });
      const plan = createTaskPlan({ steps: [step] });
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].id).toBe('step_1');
    });

    it('generates unique task IDs', () => {
      const plan1 = createTaskPlan();
      const plan2 = createTaskPlan();
      expect(plan1.taskId).not.toBe(plan2.taskId);
    });

    it('includes generated timestamp', () => {
      const plan = createTaskPlan();
      expect(plan.generatedAt).toBeInstanceOf(Date);
    });
  });

  describe('Factory Chaining', () => {
    it('steps and plans work together', () => {
      const steps = [
        createExecutionStep({ id: 'step_1' }),
        createExecutionStep({ id: 'step_2', dependsOn: ['step_1'] })
      ];
      const plan = createTaskPlan({ steps });
      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[1].dependsOn).toContain('step_1');
    });
  });
});
```

### How to Run

```bash
npm test -- src/test/factories/executorFactory.test.ts --coverage
```

### Expected Result

```
executorFactory.ts | 0%   →  70%+  ✅
test/factories     | 19.71% → 50%+  ✅
Overall            | 47%   → 50%+   ✅
```

---

## Weekly Execution Plan

### Monday (20 min)
1. Create `src/utils/pathSanitizer.test.ts` (copy template above)
2. Run: `npm test -- src/utils/pathSanitizer.test.ts --coverage`
3. Check: pathSanitizer should jump to 90%+
4. Expected overall: 41% → 43%

### Tuesday-Wednesday (2-3 hours)
1. Create `src/services/semanticValidator.test.ts` (copy template)
2. Run: `npm test -- src/services/semanticValidator.test.ts --coverage`
3. Check: semanticValidator should jump to 50%+
4. Expected overall: 43% → 47%

### Thursday (1-2 hours)
1. Create `src/test/factories/executorFactory.test.ts` (copy template)
2. Run: `npm test -- src/test/factories/executorFactory.test.ts --coverage`
3. Check: executorFactory should jump to 70%+
4. Expected overall: 47% → 50%

### Friday (Verification)
```bash
# Run full suite
npm test -- --coverage

# Verify coverage jumps
# Should see: 41% → 50%+
```

---

## Commands Cheat Sheet

```bash
# Run specific test file
npm test -- src/path/to/file.test.ts

# Run with coverage
npm test -- src/path/to/file.test.ts --coverage

# Run in watch mode (auto-rerun on save)
npm test -- src/path/to/file.test.ts --watch

# Run full suite with coverage
npm test -- --coverage

# View HTML coverage report
coverage/index.html  # Open in browser
```

---

## Troubleshooting

### Test file not running?
- Check file ends with `.test.ts`
- Check import paths are correct
- Try: `npm test -- --listTests | grep filename`

### Coverage shows 0% for new tests?
- Make sure test actually runs (check test output)
- Make sure you're testing the right file
- Check: Are the imports working?

### Want to see exactly what's untested?
```bash
npm test -- --coverage
# Then open coverage/index.html in browser
# Green lines = tested, Red lines = untested
```

### Can't modify imported class?
- Maybe it's exported wrong
- Check: `export class ClassName` in source file
- Check import: `import { ClassName } from './path'`

---

## Success Checklist

- [ ] Hit #1 pathSanitizer tests written and passing
- [ ] Hit #1: Verify coverage went from 14.7% → 90%+
- [ ] Hit #2 semanticValidator tests written and passing
- [ ] Hit #2: Verify coverage went from 0% → 50%+
- [ ] Hit #3 executorFactory tests written and passing
- [ ] Hit #3: Verify coverage went from 0% → 70%+
- [ ] Overall coverage increased from 41% → 50%+
- [ ] All new tests added to PR and committed

---

## Next Phase (After 50%)

Once you hit 50%, continue with:

1. **executor.ts error paths** (lines 2891-3154)
   - Test error handling
   - Test fallback scenarios
   - Expected: +3-5%

2. **Low-hanging utils**
   - jsonSanitizer.ts (60% → 80%)
   - pathSanitizer follow-up
   - Expected: +2-3%

3. **Continue expansion**
   - refactoringExecutor.ts
   - Additional services
   - Target: 60% by end of month

---

**Ready to execute? Start with Hit #1 on Monday!** 🚀
