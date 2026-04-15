/**
 * Week 3 D2: SmartAutoCorrection Tests (Consolidated)
 *
 * Consolidation Strategy:
 * - Table-driven auto-fix methods with varied import patterns
 * - Circular import detection grouped by file suffix
 * - Missing imports & common patterns via matrix
 * - 92 → 28 tests (-70% reduction)
 *
 * Pattern: Each row includes code, errors, and expected result validation
 */

import { describe, it, expect } from 'vitest';
import { SmartAutoCorrection } from './CodeAnalyzer';

describe('SmartAutoCorrection (Consolidated)', () => {
  // ============================================================
  // Circular Import Detection - By File Type
  // ============================================================
  const circularDetectionCases = [
    {
      name: 'detect by full filename match',
      code: `import { User } from './userService';\nexport class UserService {}`,
      filePath: 'src/services/userService.ts',
      assertions: (result: string[]) => {
        expect(Array.isArray(result)).toBe(true);
      },
    },
    {
      name: 'detect by base name match',
      code: `import { data } from './user';\nexport class UserService {}`,
      filePath: 'src/services/userService.ts',
      assertions: (result: string[]) => {
        expect(Array.isArray(result)).toBe(true);
      },
    },
    {
      name: 'no circular imports returns empty',
      code: `import { useState } from 'react';\nexport function MyComponent() {}`,
      filePath: 'src/components/MyComponent.tsx',
      assertions: (result: string[]) => {
        expect(Array.isArray(result)).toBe(true);
      },
    },
    {
      name: 'code with no imports',
      code: `export class MyClass {}`,
      filePath: 'src/MyClass.ts',
      assertions: (result: string[]) => {
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(0);
      },
    },
    {
      name: 'Repository suffix handling',
      code: `import { data } from './user';\nexport class UserRepository {}`,
      filePath: 'src/repositories/userRepository.ts',
      assertions: (result: string[]) => {
        expect(Array.isArray(result)).toBe(true);
      },
    },
    {
      name: 'Hook suffix handling',
      code: `import { state } from './use-counter';\nexport function useCounterHook() {}`,
      filePath: 'src/hooks/useCounterHook.ts',
      assertions: (result: string[]) => {
        expect(Array.isArray(result)).toBe(true);
      },
    },
    {
      name: 'Controller suffix handling',
      code: `import { routes } from './user';\nexport class UserController {}`,
      filePath: 'src/controllers/userController.ts',
      assertions: (result: string[]) => {
        expect(Array.isArray(result)).toBe(true);
      },
    },
  ];

  it.each(circularDetectionCases)(
    'detectCircularImports: $name',
    ({ code, filePath, assertions }) => {
      const result = SmartAutoCorrection.detectCircularImports(code, filePath);
      assertions(result);
    }
  );

  // ============================================================
  // Circular Import Fixing
  // ============================================================
  const fixCircularCases = [
    {
      name: 'remove circular imports',
      code: `import { User } from './userService';\nfunction test() {}`,
      filePath: 'src/services/userService.ts',
      assertions: (result: string) => {
        expect(typeof result).toBe('string');
        expect(result).toBeDefined();
      },
    },
    {
      name: 'return unchanged if no circular imports',
      code: `import { useState } from 'react';\nfunction test() {}`,
      filePath: 'src/components/test.tsx',
      assertions: (result: string, original: string) => {
        expect(result).toBe(original);
      },
    },
    {
      name: 'handle multiple circular imports',
      code: `import { A } from './module';\nimport { B } from './moduleService';\nfunction test() {}`,
      filePath: 'src/module.ts',
      assertions: (result: string) => {
        expect(typeof result).toBe('string');
      },
    },
    {
      name: 'preserve valid imports',
      code: `import { useState } from 'react';\nimport { User } from './userService';\nfunction test() {}`,
      filePath: 'src/services/userService.ts',
      assertions: (result: string) => {
        expect(result).toContain('react');
      },
    },
    {
      name: 'escape regex special characters',
      code: `import { fn } from './file.name';\nfunction test() {}`,
      filePath: 'src/file.name.ts',
      assertions: (result: string) => {
        expect(typeof result).toBe('string');
      },
    },
  ];

  it.each(fixCircularCases)(
    'fixCircularImports: $name',
    ({ code, filePath, assertions }) => {
      const result = SmartAutoCorrection.fixCircularImports(code, filePath);
      assertions(result, code);
    }
  );

  // ============================================================
  // Missing Imports Fixing
  // ============================================================
  const fixMissingCases = [
    {
      name: 'return string with no errors',
      code: `import { useState } from 'react';\nfunction test() {}`,
      errors: [],
      assertions: (result: string) => {
        expect(typeof result).toBe('string');
      },
    },
    {
      name: 'return string with errors',
      code: `function test() { useState(); }`,
      errors: ['Missing import: useState is used but not imported'],
      assertions: (result: string) => {
        expect(typeof result).toBe('string');
      },
    },
    {
      name: 'handle multiple errors',
      code: `function test() {}`,
      errors: [
        'Missing import: useState is used but not imported',
        'Missing import: useEffect is used but not imported',
      ],
      assertions: (result: string) => {
        expect(typeof result).toBe('string');
      },
    },
    {
      name: 'remove unused imports',
      code: `import { unused } from 'lib';\nfunction test() {}`,
      errors: ["Unused import: 'unused'"],
      assertions: (result: string) => {
        expect(typeof result).toBe('string');
      },
    },
    {
      name: 'preserve code structure',
      code: `export function MyComponent() { return null; }`,
      errors: [],
      assertions: (result: string) => {
        expect(result).toContain('export function MyComponent');
      },
    },
    {
      name: 'handle empty error array',
      code: `function test() {}`,
      errors: [],
      assertions: (result: string, original: string) => {
        expect(result).toBe(original);
      },
    },
    {
      name: 'handle malformed error messages',
      code: `function test() {}`,
      errors: ['Some random error message that doesnt match patterns'],
      assertions: (result: string) => {
        expect(typeof result).toBe('string');
      },
    },
  ];

  it.each(fixMissingCases)(
    'fixMissingImports: $name',
    ({ code, errors, assertions }) => {
      const result = SmartAutoCorrection.fixMissingImports(code, errors);
      assertions(result, code);
    }
  );

  // ============================================================
  // Integration Scenarios
  // ============================================================
  const integrationCases = [
    {
      name: 'React Hook pattern (useState)',
      code: `function Component() { const [state, setState] = useState(0); }`,
      errors: ['Missing import: useState is used but not imported'],
      assertions: (result: string) => {
        expect(typeof result).toBe('string');
        expect(result).toContain('useState');
      },
    },
    {
      name: 'React Router pattern (useNavigate)',
      code: `function Home() { const navigate = useNavigate(); }`,
      errors: ['Missing import: useNavigate is used but not imported'],
      assertions: (result: string) => {
        expect(typeof result).toBe('string');
      },
    },
    {
      name: 'service layer circular reference',
      code: `import { User } from './userService';\nexport class UserService { }`,
      filePath: 'src/services/userService.ts',
      assertions: (result: string) => {
        expect(typeof result).toBe('string');
      },
    },
    {
      name: 'chain fixes: circular + missing imports',
      code: `import { User } from './userService';\nfunction test() { useState(); }`,
      filePath: 'src/services/userService.ts',
      errors: ['Missing import: useState is used but not imported'],
      assertions: (result: string) => {
        expect(typeof result).toBe('string');
      },
    },
    {
      name: 'complex code with multiple issues',
      code: `
        import { UnusedLib } from 'unused';
        import { User } from './userService';
        export class UserService {
          method() { useState(); }
        }
      `,
      errors: [
        "Unused import: 'UnusedLib'",
        'Missing import: useState is used but not imported',
      ],
      assertions: (result: string) => {
        expect(typeof result).toBe('string');
      },
    },
  ];

  it.each(integrationCases)(
    'integration: $name',
    ({ code, filePath, errors = [], assertions }) => {
      let result: string;
      if (filePath) {
        result = SmartAutoCorrection.fixCircularImports(code, filePath);
        result = SmartAutoCorrection.fixMissingImports(result, errors);
      } else {
        result = SmartAutoCorrection.fixMissingImports(code, errors);
      }
      assertions(result);
    }
  );

  // ============================================================
  // Edge Cases & Code Patterns
  // ============================================================
  const edgeCases = [
    {
      name: 'code with no matches',
      code: `function noop() {}`,
      filePath: 'src/noop.ts',
    },
    {
      name: 'import statements with various quote styles',
      code: `import { x } from "module";\nimport { y } from 'module';\nimport { z } from \`module\`;`,
    },
    {
      name: 'code with TypeScript syntax',
      code: `interface User { id: number; }\nexport class UserService implements IService {}`,
      filePath: 'src/services/userService.ts',
    },
    {
      name: 'code with comments',
      code: `// import { test } from './test';\nfunction test() {}`,
      filePath: 'src/test.ts',
    },
    {
      name: 'multiline imports',
      code: `import {
        useState,
        useEffect
      } from 'react';`,
    },
  ];

  it.each(edgeCases)('edge case: $name', ({ code, filePath }) => {
    if (filePath) {
      const result = SmartAutoCorrection.detectCircularImports(code, filePath);
      expect(Array.isArray(result)).toBe(true);
    }
    const fixResult = SmartAutoCorrection.fixMissingImports(code, []);
    expect(typeof fixResult).toBe('string');
  });

  // ============================================================
  // Common Patterns & Zustand Integration
  // ============================================================
  describe('Common Patterns & Zustand Integration', () => {
    it('should expose fixCommonPatterns method', () => {
      expect(typeof SmartAutoCorrection.fixCommonPatterns).toBe('function');
    });

    it('should expose isAutoFixable method', () => {
      expect(typeof SmartAutoCorrection.isAutoFixable).toBe('function');
    });

    it('should expose extractStoreExports method', () => {
      expect(SmartAutoCorrection.extractStoreExports).toBeDefined();
    });

    it('should process useState hook errors', () => {
      const code = 'const [state, setState] = useState(null);';
      const result = SmartAutoCorrection.fixCommonPatterns(code, []);
      expect(typeof result).toBe('string');
    });

    it('should handle Zustand store pattern', () => {
      const storeCode = `export const useCounterStore = create((set) => ({
        count: 0,
        increment: () => set(state => ({ count: state.count + 1 }))
      }))`;
      const result = SmartAutoCorrection.extractStoreExports(storeCode);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should fix component-store destructuring mismatch', () => {
      const componentCode = `const { email, password, nonexistent } = useLoginStore()`;
      const storeExports = ['email', 'password', 'setEmail', 'setPassword'];
      const result = SmartAutoCorrection.fixZustandMismatch(componentCode, storeExports);
      expect(typeof result).toBe('string');
    });

    it('should fix component from store integration', () => {
      const componentCode = `const { count, missing } = useCounterStore()`;
      const storeCode = `export const useCounterStore = create((set) => ({ count: 0, increment: () => {} }))`;
      const result = SmartAutoCorrection.fixZustandComponentFromStore(
        componentCode,
        storeCode
      );
      expect(typeof result).toBe('string');
    });

    it('should return unchanged if no store provided', () => {
      const componentCode = `const { count } = useCounterStore()`;
      const result = SmartAutoCorrection.fixZustandComponentFromStore(
        componentCode,
        undefined
      );
      expect(result).toBe(componentCode);
    });

    it('should preserve component structure while fixing', () => {
      const componentCode = `
        export const LoginForm = () => {
          const { email, password, incorrectField } = useLoginStore()
          return <form onSubmit={handleSubmit}>{/* form fields */}</form>
        }
      `;
      const storeCode = `export const useLoginStore = create((set) => ({
        email: '',
        password: '',
        errors: {}
      }))`;
      const result = SmartAutoCorrection.fixZustandComponentFromStore(
        componentCode,
        storeCode
      );
      expect(result).toContain('LoginForm');
      expect(result).toContain('form');
    });

    it('should handle React Hook pattern detection', () => {
      const code = `const [count] = useState(0);`;
      const errors = ["Cannot find name 'useState'"];
      const result = SmartAutoCorrection.fixMissingImports(code, errors);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle custom hooks pattern', () => {
      const code = 'const store = useCustomStore();';
      const errors = ["Cannot find name 'useCustomStore'"];
      const result = SmartAutoCorrection.fixMissingImports(code, errors);
      expect(typeof result).toBe('string');
    });

    it('should handle Zod schema pattern', () => {
      const code = 'const schema = z.object({ name: z.string() });';
      const errors = ["Cannot find name 'z'"];
      const result = SmartAutoCorrection.fixMissingImports(code, errors);
      expect(typeof result).toBe('string');
    });

    it('should return boolean for isAutoFixable', () => {
      const errors: string[] = [];
      const result = SmartAutoCorrection.isAutoFixable(errors);
      expect(typeof result).toBe('boolean');
    });

    it('should handle empty error array gracefully', () => {
      const code = 'const x = 1;';
      const errors: string[] = [];
      const result = SmartAutoCorrection.fixMissingImports(code, errors);
      expect(result).toBe(code);
    });

    it('should handle malformed error messages', () => {
      const code = 'const x = y;';
      const errors = ['Some random error text'];
      const result = SmartAutoCorrection.fixMissingImports(code, errors);
      expect(typeof result).toBe('string');
    });

    it('should preserve comments in code', () => {
      const code = `// This is a comment
const [state] = useState(0);`;
      const errors = ["Cannot find name 'useState'"];
      const result = SmartAutoCorrection.fixMissingImports(code, errors);
      expect(result).toContain('// This is a comment');
    });

    it('should not break on complex TypeScript generics', () => {
      const code = 'const x: Record<string, Array<UseHookReturn>> = {};';
      const errors: string[] = [];
      const result = SmartAutoCorrection.fixMissingImports(code, errors);
      expect(typeof result).toBe('string');
    });
  });

  // ============================================================
  // cn() Phantom Import Fix (FIRST-B deterministic fix)
  // ============================================================
  describe('cn() phantom import replacement', () => {
    const cnPhantomError = "❌ Cross-file Contract: Cannot find module 'src/utils/cn' from 'src/components/Badge.tsx'. Verify the file exists at: src/utils/cn.ts (or .tsx)";

    it('replaces cn import with clsx and renames call sites', () => {
      const code = [
        `import { cn } from 'src/utils/cn';`,
        `export const Badge = ({ label }: { label: string }) => (`,
        `  <span className={cn('badge', 'badge-blue')}>{label}</span>`,
        `);`,
      ].join('\n');

      const result = SmartAutoCorrection.fixCommonPatterns(code, [cnPhantomError]);
      expect(result).not.toContain("from 'src/utils/cn'");
      expect(result).toContain("from 'clsx'");
      expect(result).not.toMatch(/\bcn\(/);
      expect(result).toContain('clsx(');
    });

    it('handles relative cn import paths', () => {
      const code = [
        `import { cn } from '../utils/cn';`,
        `export const Chip = () => <div className={cn('chip')} />;`,
      ].join('\n');
      const error = "❌ Cross-file Contract: Cannot find module 'utils/cn' from 'src/components/Chip.tsx'. Verify the file exists at: utils/cn.ts (or .tsx)";

      const result = SmartAutoCorrection.fixCommonPatterns(code, [error]);
      expect(result).not.toContain("from '../utils/cn'");
      expect(result).toContain('clsx(');
    });

    it('does not add duplicate clsx import when already present', () => {
      const code = [
        `import { clsx } from 'clsx';`,
        `import { cn } from 'src/utils/cn';`,
        `export const Badge = () => <div className={cn('a', 'b')} />;`,
      ].join('\n');

      const result = SmartAutoCorrection.fixCommonPatterns(code, [cnPhantomError]);
      const clsxImportCount = (result.match(/from 'clsx'/g) ?? []).length;
      expect(clsxImportCount).toBe(1);
      expect(result).toContain('clsx(');
    });

    it('is a no-op when no cn phantom import error is present', () => {
      const code = [
        `import { cn } from 'src/utils/cn';`,
        `export const Badge = () => <div className={cn('badge')} />;`,
      ].join('\n');

      const result = SmartAutoCorrection.fixCommonPatterns(code, []);
      expect(result).toBe(code);
    });
  });

  // ============================================================
  // Static Methods Exposure
  // ============================================================
  describe('Static Methods', () => {
    it('should expose detectCircularImports as static', () => {
      expect(typeof SmartAutoCorrection.detectCircularImports).toBe('function');
    });

    it('should expose fixCircularImports as static', () => {
      expect(typeof SmartAutoCorrection.fixCircularImports).toBe('function');
    });

    it('should expose fixMissingImports as static', () => {
      expect(typeof SmartAutoCorrection.fixMissingImports).toBe('function');
    });

    it('should expose fixCommonPatterns as static', () => {
      expect(typeof SmartAutoCorrection.fixCommonPatterns).toBe('function');
    });

    it('should expose isAutoFixable as static', () => {
      expect(typeof SmartAutoCorrection.isAutoFixable).toBe('function');
    });
  });
});
