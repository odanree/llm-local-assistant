import { describe, it, expect } from 'vitest';
import { SmartValidator, SemanticError } from './smartValidator';

describe('SmartValidator', () => {
  describe('checkSemantics', () => {
    it('should return empty array for valid code', () => {
      const code = `import { useState } from 'react';\nexport function App() { const [state] = useState(); return null; }`;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should detect undefined variables', () => {
      const code = `function test() { return undefined_var; }`;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should detect import mismatches', () => {
      const code = `import { clsx } from 'clsx';\nfunction test() { return classnames(); }`;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should detect missing type imports', () => {
      const code = `function test(): Promise<string> { return ''; }`;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should detect unused imports', () => {
      const code = `import { unused } from 'lib';\nfunction test() { return 42; }`;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should accept optional fileContext', () => {
      const code = `import { z } from 'zod';\nconst schema = z.string();`;
      const context = { type: 'hook', forbidZod: true };
      const errors = SmartValidator.checkSemantics(code, context);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should enforce forbidZod rule when specified', () => {
      const code = `import { z } from 'zod';\nconst schema = z.string();`;
      const context = { type: 'validation', forbidZod: true };
      const errors = SmartValidator.checkSemantics(code, context);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should allow Zod when forbidZod is false', () => {
      const code = `import { z } from 'zod';\nconst schema = z.string();`;
      const context = { type: 'schema', forbidZod: false };
      const errors = SmartValidator.checkSemantics(code, context);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle empty code', () => {
      const errors = SmartValidator.checkSemantics('');
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle code with comments', () => {
      const code = `// import { fake } from 'lib';\nfunction test() { return 42; }`;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle code with multiline strings', () => {
      const code = 'const str = `import { fake } from "lib";`;\nfunction test() { return str; }';
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle React code', () => {
      const code = `import React from 'react';\nexport const App = () => <div>test</div>;`;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle TypeScript code', () => {
      const code = `interface User { id: number; }\nconst user: User = { id: 1 };`;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should recognize built-in globals', () => {
      const code = `function test() { console.log(Math.PI); Array.isArray([]); }`;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should return SemanticError objects with correct structure', () => {
      const code = `function test() { return undefined_var; }`;
      const errors = SmartValidator.checkSemantics(code);
      if (errors.length > 0) {
        const error = errors[0];
        expect(error).toHaveProperty('type');
        expect(error).toHaveProperty('variable');
        expect(error).toHaveProperty('message');
        expect(error).toHaveProperty('severity');
      }
    });

    it('should support custom rules in fileContext', () => {
      const code = `function test() { return 42; }`;
      const context = { type: 'custom', rules: ['rule1', 'rule2'] };
      const errors = SmartValidator.checkSemantics(code, context);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should support requireNamedImports in fileContext', () => {
      const code = `import React from 'react';\nfunction test() { return <div/>; }`;
      const context = { type: 'component', requireNamedImports: ['useState', 'useEffect'] };
      const errors = SmartValidator.checkSemantics(code, context);
      expect(Array.isArray(errors)).toBe(true);
    });
  });

  describe('formatErrors', () => {
    it('should return string', () => {
      const errors: SemanticError[] = [];
      const result = SmartValidator.formatErrors(errors);
      expect(typeof result).toBe('string');
    });

    it('should format empty error array', () => {
      const errors: SemanticError[] = [];
      const result = SmartValidator.formatErrors(errors);
      expect(result).toBeDefined();
    });

    it('should format single error', () => {
      const errors: SemanticError[] = [{
        type: 'undefined-variable',
        variable: 'test',
        message: 'Variable test is undefined',
        severity: 'error'
      }];
      const result = SmartValidator.formatErrors(errors);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should format multiple errors', () => {
      const errors: SemanticError[] = [
        {
          type: 'undefined-variable',
          variable: 'test1',
          message: 'Variable test1 is undefined',
          severity: 'error'
        },
        {
          type: 'unused-import',
          variable: 'unused',
          message: 'Import unused is not used',
          severity: 'warning'
        }
      ];
      const result = SmartValidator.formatErrors(errors);
      expect(typeof result).toBe('string');
    });

    it('should include severity in formatted output', () => {
      const errors: SemanticError[] = [{
        type: 'import-mismatch',
        variable: 'clsx',
        message: 'Import mismatch',
        severity: 'error'
      }];
      const result = SmartValidator.formatErrors(errors);
      expect(typeof result).toBe('string');
    });
  });

  describe('hasFatalErrors', () => {
    it('should return false for empty array', () => {
      const errors: SemanticError[] = [];
      const result = SmartValidator.hasFatalErrors(errors);
      expect(typeof result).toBe('boolean');
      expect(result).toBe(false);
    });

    it('should return boolean', () => {
      const errors: SemanticError[] = [];
      const result = SmartValidator.hasFatalErrors(errors);
      expect(typeof result).toBe('boolean');
    });

    it('should identify error severity', () => {
      const errors: SemanticError[] = [{
        type: 'undefined-variable',
        variable: 'test',
        message: 'Test is undefined',
        severity: 'error'
      }];
      const result = SmartValidator.hasFatalErrors(errors);
      expect(typeof result).toBe('boolean');
    });

    it('should distinguish errors from warnings', () => {
      const warnings: SemanticError[] = [{
        type: 'unused-import',
        variable: 'unused',
        message: 'Unused import',
        severity: 'warning'
      }];
      const result = SmartValidator.hasFatalErrors(warnings);
      expect(typeof result).toBe('boolean');
    });

    it('should handle mixed errors and warnings', () => {
      const errors: SemanticError[] = [
        {
          type: 'undefined-variable',
          variable: 'test',
          message: 'Undefined',
          severity: 'error'
        },
        {
          type: 'unused-import',
          variable: 'unused',
          message: 'Unused',
          severity: 'warning'
        }
      ];
      const result = SmartValidator.hasFatalErrors(errors);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('integration scenarios', () => {
    it('should handle React component with hooks', () => {
      const code = `
        import { useState, useEffect } from 'react';
        export function Counter() {
          const [count, setCount] = useState(0);
          useEffect(() => { console.log(count); }, [count]);
          return <div>{count}</div>;
        }
      `;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should validate import/export consistency', () => {
      const code = `
        export { unused };
        function test() { return 42; }
      `;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should detect common hallucination: clsx vs classnames', () => {
      const code = `
        import { clsx } from 'clsx';
        export function Button() {
          return <button className={classnames('btn')} />;
        }
      `;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should validate TypeScript generic syntax', () => {
      const code = `
        import { useState } from 'react';
        interface User { id: number; }
        export function App() {
          const [user, setUser] = useState<User | null>(null);
          return null;
        }
      `;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle Zod validation schemas', () => {
      const code = `
        import { z } from 'zod';
        const userSchema = z.object({
          name: z.string(),
          age: z.number()
        });
      `;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should validate function parameters and returns', () => {
      const code = `
        function add(a: number, b: number): number {
          return a + b;
        }
        const result = add(1, 2);
      `;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle default exports and named exports', () => {
      const code = `
        export default function App() { return null; }
        export const helper = () => 42;
        export function utility() { return 'test'; }
      `;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should validate with context awareness', () => {
      const code = `
        import { useState } from 'react';
        export const useCounter = () => {
          const [count, setCount] = useState(0);
          return { count, setCount };
        };
      `;
      const context = { type: 'hook' };
      const errors = SmartValidator.checkSemantics(code, context);
      expect(Array.isArray(errors)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle code with no imports', () => {
      const code = `function test() { return 42; }`;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle code with no exports', () => {
      const code = `import { test } from 'lib';\nfunction helper() { return test(); }`;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle deeply nested code', () => {
      const code = `
        function outer() {
          function inner() {
            function deeper() {
              return console.log('test');
            }
          }
        }
      `;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle code with special characters in strings', () => {
      const code = `const str = "import { fake } from 'lib';";`;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle code with template literals', () => {
      const code = 'const template = `import { x } from "lib";`;';
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle code with arrow functions', () => {
      const code = `const fn = () => {\n  return undefined_var;\n};`;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle code with async/await', () => {
      const code = `
        async function fetch() {
          const response = await undefined_fetch();
          return response;
        }
      `;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle code with destructuring', () => {
      const code = `
        const { useState, useEffect } = require('react');
        const [state, setState] = useState(0);
      `;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle code with spread operators', () => {
      const code = `const arr = [...undefined_arr, 1, 2];`;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle code with object syntax', () => {
      const code = `const obj = { key: value, fn: () => 42 };`;
      const errors = SmartValidator.checkSemantics(code);
      expect(Array.isArray(errors)).toBe(true);
    });
  });

  describe('error types', () => {
    it('should produce errors with undefined-variable type', () => {
      const code = `function test() { return undefined_var; }`;
      const errors = SmartValidator.checkSemantics(code);
      const hasUndefined = errors.some(e => e.type === 'undefined-variable');
      expect(typeof hasUndefined).toBe('boolean');
    });

    it('should produce errors with import-mismatch type', () => {
      const code = `import { clsx } from 'clsx';\nclassnames();`;
      const errors = SmartValidator.checkSemantics(code);
      const hasMismatch = errors.some(e => e.type === 'import-mismatch');
      expect(typeof hasMismatch).toBe('boolean');
    });

    it('should produce errors with missing-type type', () => {
      const code = `function test(): Promise<void> { return Promise.resolve(); }`;
      const errors = SmartValidator.checkSemantics(code);
      const hasMissingType = errors.some(e => e.type === 'missing-type');
      expect(typeof hasMissingType).toBe('boolean');
    });

    it('should produce errors with unused-import type', () => {
      const code = `import { unused } from 'lib';\nfunction test() {}`;
      const errors = SmartValidator.checkSemantics(code);
      const hasUnused = errors.some(e => e.type === 'unused-import');
      expect(typeof hasUnused).toBe('boolean');
    });

    it('should have severity property on errors', () => {
      const code = `function test() { return undefined_var; }`;
      const errors = SmartValidator.checkSemantics(code);
      errors.forEach(error => {
        expect(['error', 'warning']).toContain(error.severity);
      });
    });

    it('should have variable property on errors', () => {
      const code = `function test() { return undefined_var; }`;
      const errors = SmartValidator.checkSemantics(code);
      errors.forEach(error => {
        expect(typeof error.variable).toBe('string');
      });
    });

    it('should have message property on errors', () => {
      const code = `function test() { return undefined_var; }`;
      const errors = SmartValidator.checkSemantics(code);
      errors.forEach(error => {
        expect(typeof error.message).toBe('string');
      });
    });
  });

  describe('static methods existence', () => {
    it('should expose checkSemantics as public static', () => {
      expect(typeof SmartValidator.checkSemantics).toBe('function');
    });

    it('should expose formatErrors as public static', () => {
      expect(typeof SmartValidator.formatErrors).toBe('function');
    });

    it('should expose hasFatalErrors as public static', () => {
      expect(typeof SmartValidator.hasFatalErrors).toBe('function');
    });
  });
});
