/**
 * smartAutoCorrection-async-branches.test.ts
 *
 * Targeted coverage for two branches in fixCommonPatterns and all six
 * conditional branches in fixCommonPatternsAsync.
 *
 * Uncovered lines addressed:
 *   727       — fixCommonPatterns: console.log after bare-string className wrap
 *   735-748   — fixCommonPatterns: template-literal className → cn() conversion
 *   792-793   — fixCommonPatternsAsync: React hook not imported → addImport
 *   798-800   — fixCommonPatternsAsync: Hook imported but never called → removeUnusedImport
 *   805-807   — fixCommonPatternsAsync: Wrong import cn (non-component .ts) → remove
 *   812-814   — fixCommonPatternsAsync: Dead import cn (.tsx never called) → remove
 *   820       — fixCommonPatternsAsync: Mock Auth Bug → continue (let LLM handle it)
 *   825-838   — fixCommonPatternsAsync: Missing import → RAG resolver then dict fallback
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SmartAutoCorrection } from '../smartAutoCorrection';

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// A resolver that always returns null (falls back to dict)
const nullResolver = async (_name: string): Promise<string | null> => null;

// ---------------------------------------------------------------------------
// fixCommonPatterns — bare-string className wrapped in cn()
// ---------------------------------------------------------------------------

describe('SmartAutoCorrection.fixCommonPatterns() — bare-string className wrap (line 727)', () => {
  const CN_IMPORT = `import { cn } from '@/utils/cn';\n`;

  it('wraps className="foo" in cn() when bare-string error and cn imported', () => {
    const code = `${CN_IMPORT}const x = <div className="p-4 text-sm" />;\n`;
    const fixed = SmartAutoCorrection.fixCommonPatterns(code, ['bare string literal']);
    expect(fixed).toContain("className={cn('p-4 text-sm')}");
  });

  it('wraps className=\'foo\' in cn()', () => {
    const code = `${CN_IMPORT}const x = <div className='p-4' />;\n`;
    const fixed = SmartAutoCorrection.fixCommonPatterns(code, ['bare string literal']);
    expect(fixed).toContain("className={cn('p-4')}");
  });

  it('wraps className={"foo"} in cn()', () => {
    const code = `${CN_IMPORT}const x = <div className={"text-blue-500"} />;\n`;
    const fixed = SmartAutoCorrection.fixCommonPatterns(code, ['bare string literal']);
    expect(fixed).toContain("className={cn('text-blue-500')}");
  });

  it('wraps className={\'foo\'} in cn()', () => {
    const code = `${CN_IMPORT}const x = <div className={'rounded'} />;\n`;
    const fixed = SmartAutoCorrection.fixCommonPatterns(code, ['bare string literal']);
    expect(fixed).toContain("className={cn('rounded')}");
  });

  it('does NOT wrap when cn is not imported', () => {
    const code = `const x = <div className="p-4" />;\n`;
    const fixed = SmartAutoCorrection.fixCommonPatterns(code, ['bare string literal']);
    expect(fixed).not.toContain('cn(');
  });

  it('does NOT wrap when error does not mention bare string literal', () => {
    const code = `${CN_IMPORT}const x = <div className="p-4" />;\n`;
    const fixed = SmartAutoCorrection.fixCommonPatterns(code, ['some other error']);
    expect(fixed).not.toContain("cn('p-4')");
  });
});

// ---------------------------------------------------------------------------
// fixCommonPatterns — template-literal className → cn() (lines 735-748)
// ---------------------------------------------------------------------------

describe('SmartAutoCorrection.fixCommonPatterns() — template-literal className → cn()', () => {
  const CN_IMPORT = `import { cn } from '@/utils/cn';\n`;

  it('converts className={`staticPart ${varName}`} to cn() (line 735-748)', () => {
    const code = `${CN_IMPORT}const x = <div className={\`p-4 \${className}\`} />;\n`;
    const fixed = SmartAutoCorrection.fixCommonPatterns(code, ['manual string concatenation']);
    expect(fixed).toContain("className={cn('p-4', className)}");
  });

  it('does NOT convert when cn is not imported', () => {
    const code = `const x = <div className={\`p-4 \${className}\`} />;\n`;
    const fixed = SmartAutoCorrection.fixCommonPatterns(code, ['manual string concatenation']);
    expect(fixed).toContain('`p-4 ${className}`');
  });

  it('does NOT convert when error does not mention manual string concatenation', () => {
    const code = `${CN_IMPORT}const x = <div className={\`p-4 \${className}\`} />;\n`;
    const fixed = SmartAutoCorrection.fixCommonPatterns(code, ['bare string literal']);
    expect(fixed).toContain('`p-4 ${className}`');
  });
});

// ---------------------------------------------------------------------------
// fixCommonPatternsAsync — React hook not imported (lines 792-793)
// ---------------------------------------------------------------------------

describe('SmartAutoCorrection.fixCommonPatternsAsync() — hook not imported from React', () => {
  it('adds React import for a hook mentioned in error (lines 792-793)', async () => {
    const code = `const [count, setCount] = useState(0);\n`;
    const errors = ["React hook 'useState' is used but not imported from React"];
    const fixed = await SmartAutoCorrection.fixCommonPatternsAsync(code, errors, nullResolver);
    expect(fixed).toMatch(/import.*useState.*from ['"]react['"]/);
  });

  it('handles the alternate error pattern "X is used but not imported from React"', async () => {
    const code = `useEffect(() => {}, []);\n`;
    const errors = ['useEffect is used but not imported from React'];
    const fixed = await SmartAutoCorrection.fixCommonPatternsAsync(code, errors, nullResolver);
    expect(fixed).toMatch(/import.*useEffect.*from ['"]react['"]/);
  });

  it('skips the hook fix when hook name is not in code', async () => {
    // Error mentions useState but code doesn't contain it
    const code = `const x = 1;\n`;
    const errors = ["React hook 'useState' is used but not imported from React"];
    const fixed = await SmartAutoCorrection.fixCommonPatternsAsync(code, errors, nullResolver);
    expect(fixed).not.toMatch(/import.*useState/);
  });
});

// ---------------------------------------------------------------------------
// fixCommonPatternsAsync — Hook imported but never called (lines 798-800)
// ---------------------------------------------------------------------------

describe('SmartAutoCorrection.fixCommonPatternsAsync() — hook imported but never called', () => {
  it('removes the unused hook import (lines 798-800)', async () => {
    const code = `import { useEffect } from 'react';\nconst x = 1;\n`;
    const errors = ["Hook 'useEffect' is imported but never called"];
    const fixed = await SmartAutoCorrection.fixCommonPatternsAsync(code, errors, nullResolver);
    expect(fixed).not.toMatch(/import.*useEffect/);
  });

  it('handles multiple hooks — removes only the specified one', async () => {
    const code = `import { useState, useEffect } from 'react';\nconst [x] = useState(0);\n`;
    const errors = ["Hook 'useEffect' is imported but never called"];
    const fixed = await SmartAutoCorrection.fixCommonPatternsAsync(code, errors, nullResolver);
    expect(fixed).not.toContain('useEffect');
    expect(fixed).toContain('useState');
  });
});

// ---------------------------------------------------------------------------
// fixCommonPatternsAsync — Wrong import: cn in non-component .ts (lines 805-807)
// ---------------------------------------------------------------------------

describe('SmartAutoCorrection.fixCommonPatternsAsync() — Wrong import cn', () => {
  it('removes cn import from non-component .ts file (lines 805-807)', async () => {
    const code = `import { cn } from '@/utils/cn';\nconst helper = (s: string) => s.trim();\n`;
    const errors = ["Wrong import: 'cn' should not be imported in a non-component .ts file"];
    const fixed = await SmartAutoCorrection.fixCommonPatternsAsync(code, errors, nullResolver);
    expect(fixed).not.toMatch(/import.*cn.*from/);
  });
});

// ---------------------------------------------------------------------------
// fixCommonPatternsAsync — Dead import: cn in .tsx file but never called (lines 812-814)
// ---------------------------------------------------------------------------

describe('SmartAutoCorrection.fixCommonPatternsAsync() — Dead import cn', () => {
  it('removes unused cn import from .tsx file (lines 812-814)', async () => {
    const code = `import { cn } from '@/utils/cn';\nconst x = <div className="p-4" />;\n`;
    const errors = ["Dead import: 'cn' is imported in .tsx but never called"];
    const fixed = await SmartAutoCorrection.fixCommonPatternsAsync(code, errors, nullResolver);
    expect(fixed).not.toMatch(/import.*cn.*from/);
  });
});

// ---------------------------------------------------------------------------
// fixCommonPatternsAsync — Mock Auth Bug: let LLM handle it (line 820)
// ---------------------------------------------------------------------------

describe('SmartAutoCorrection.fixCommonPatternsAsync() — Mock Auth Bug passthrough', () => {
  it('does not alter code for Mock Auth Bug errors (line 820)', async () => {
    const code = `export const authenticate = () => ({ token: 'abc' });\n`;
    const errors = ['Mock Auth Bug: no falsy return path for unauthenticated case'];
    const fixed = await SmartAutoCorrection.fixCommonPatternsAsync(code, errors, nullResolver);
    // Code should pass through unchanged (Mock Auth Bug is handed off to LLM)
    expect(fixed).toContain("{ token: 'abc' }");
  });
});

// ---------------------------------------------------------------------------
// fixCommonPatternsAsync — Missing import with RAG resolver (lines 825-838)
// ---------------------------------------------------------------------------

describe('SmartAutoCorrection.fixCommonPatternsAsync() — Missing import with resolver', () => {
  it('adds import from RAG source when resolver finds a path (lines 825-836)', async () => {
    const code = `const x = MyComponent();\n`;
    const errors = ["Missing import: 'MyComponent'"];
    const ragResolver = async (name: string): Promise<string | null> =>
      name === 'MyComponent' ? '@/components/MyComponent' : null;
    const fixed = await SmartAutoCorrection.fixCommonPatternsAsync(code, errors, ragResolver);
    expect(fixed).toMatch(/import.*MyComponent.*from ['"]@\/components\/MyComponent['"]/);
  });

  it('falls back to dict when resolver returns null (lines 831-836)', async () => {
    // 'useState' is a known dict entry → resolver returns null → dict provides 'react'
    const code = `const [x, setX] = useState(0);\n`;
    const errors = ["Missing import: 'useState'"];
    const fixed = await SmartAutoCorrection.fixCommonPatternsAsync(code, errors, nullResolver);
    expect(fixed).toMatch(/import.*useState.*from ['"]react['"]/);
  });

  it('logs a warning when neither RAG nor dict can resolve the import (line 838)', async () => {
    const warnSpy = vi.spyOn(console, 'warn');
    // Use a lowercase name that is not in the dict and does not match any heuristic
    // (not use-prefixed, not PascalCase, not containing Repository/Service)
    const code = `const x = mysteryHelper();\n`;
    const errors = ["Missing import: 'mysteryHelper'"];
    await SmartAutoCorrection.fixCommonPatternsAsync(code, errors, nullResolver);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Could not resolve import for 'mysteryHelper'/)
    );
  });

  it('handles the alternate Missing import: error pattern (lines 826-827)', async () => {
    const code = `const x = useMyHook();\n`;
    const errors = ['Missing import: useMyHook is used but not imported'];
    const ragResolver = async (name: string): Promise<string | null> =>
      name === 'useMyHook' ? '@/hooks/useMyHook' : null;
    const fixed = await SmartAutoCorrection.fixCommonPatternsAsync(code, errors, ragResolver);
    expect(fixed).toMatch(/import.*useMyHook.*from ['"]@\/hooks\/useMyHook['"]/);
  });
});
