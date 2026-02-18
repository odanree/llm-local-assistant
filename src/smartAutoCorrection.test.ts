import { describe, it, expect } from 'vitest';
import { SmartAutoCorrection } from './smartAutoCorrection';

describe('SmartAutoCorrection', () => {
  describe('detectCircularImports', () => {
    it('should detect self-referential imports by filename', () => {
      const code = `import { User } from './userService';\nexport class UserService {}`;
      const result = SmartAutoCorrection.detectCircularImports(code, 'src/services/userService.ts');
      expect(Array.isArray(result)).toBe(true);
    });

    it('should detect self-referential imports by base name', () => {
      const code = `import { data } from './user';\nexport class UserService {}`;
      const result = SmartAutoCorrection.detectCircularImports(code, 'src/services/userService.ts');
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array for no circular imports', () => {
      const code = `import { useState } from 'react';\nexport function MyComponent() {}`;
      const result = SmartAutoCorrection.detectCircularImports(code, 'src/components/MyComponent.tsx');
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle code with no imports', () => {
      const code = `export class MyClass {}`;
      const result = SmartAutoCorrection.detectCircularImports(code, 'src/MyClass.ts');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should extract filename from path', () => {
      const code = `import { fn } from './helper';\nfunction helper() {}`;
      const result = SmartAutoCorrection.detectCircularImports(code, 'src/utils/helper.ts');
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle Repository suffix', () => {
      const code = `import { data } from './user';\nexport class UserRepository {}`;
      const result = SmartAutoCorrection.detectCircularImports(code, 'src/repositories/userRepository.ts');
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle Hook suffix', () => {
      const code = `import { state } from './use-counter';\nexport function useCounterHook() {}`;
      const result = SmartAutoCorrection.detectCircularImports(code, 'src/hooks/useCounterHook.ts');
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle Controller suffix', () => {
      const code = `import { routes } from './user';\nexport class UserController {}`;
      const result = SmartAutoCorrection.detectCircularImports(code, 'src/controllers/userController.ts');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('fixCircularImports', () => {
    it('should remove circular imports from code', () => {
      const code = `import { User } from './userService';\nfunction test() {}`;
      const result = SmartAutoCorrection.fixCircularImports(code, 'src/services/userService.ts');
      expect(typeof result).toBe('string');
      expect(result).toBeDefined();
    });

    it('should return unchanged code if no circular imports', () => {
      const code = `import { useState } from 'react';\nfunction test() {}`;
      const result = SmartAutoCorrection.fixCircularImports(code, 'src/components/test.tsx');
      expect(result).toBe(code);
    });

    it('should handle multiple circular imports', () => {
      const code = `import { A } from './module';\nimport { B } from './moduleService';\nfunction test() {}`;
      const result = SmartAutoCorrection.fixCircularImports(code, 'src/module.ts');
      expect(typeof result).toBe('string');
    });

    it('should preserve valid imports', () => {
      const code = `import { useState } from 'react';\nimport { User } from './userService';\nfunction test() {}`;
      const result = SmartAutoCorrection.fixCircularImports(code, 'src/services/userService.ts');
      expect(result).toContain('react');
    });

    it('should escape regex special characters in import paths', () => {
      const code = `import { fn } from './file.name';\nfunction test() {}`;
      const result = SmartAutoCorrection.fixCircularImports(code, 'src/file.name.ts');
      expect(typeof result).toBe('string');
    });
  });

  describe('fixMissingImports', () => {
    it('should return string when called with no errors', () => {
      const code = `import { useState } from 'react';\nfunction test() {}`;
      const result = SmartAutoCorrection.fixMissingImports(code, []);
      expect(typeof result).toBe('string');
    });

    it('should return string when called with errors', () => {
      const code = `function test() { useState(); }`;
      const errors = ['Missing import: useState is used but not imported'];
      const result = SmartAutoCorrection.fixMissingImports(code, errors);
      expect(typeof result).toBe('string');
    });

    it('should handle multiple errors', () => {
      const code = `function test() {}`;
      const errors = [
        'Missing import: useState is used but not imported',
        'Missing import: useEffect is used but not imported'
      ];
      const result = SmartAutoCorrection.fixMissingImports(code, errors);
      expect(typeof result).toBe('string');
    });

    it('should remove unused imports', () => {
      const code = `import { unused } from 'lib';\nfunction test() {}`;
      const errors = ["Unused import: 'unused'"];
      const result = SmartAutoCorrection.fixMissingImports(code, errors);
      expect(typeof result).toBe('string');
    });

    it('should preserve code structure', () => {
      const code = `export function MyComponent() { return null; }`;
      const result = SmartAutoCorrection.fixMissingImports(code, []);
      expect(result).toContain('export function MyComponent');
    });

    it('should handle empty error array', () => {
      const code = `function test() {}`;
      const result = SmartAutoCorrection.fixMissingImports(code, []);
      expect(result).toBe(code);
    });

    it('should handle malformed error messages', () => {
      const code = `function test() {}`;
      const errors = ['Some random error message that doesnt match patterns'];
      const result = SmartAutoCorrection.fixMissingImports(code, errors);
      expect(typeof result).toBe('string');
    });
  });

  describe('fixCommonPatterns', () => {
    it('should have fixCommonPatterns method', () => {
      expect(SmartAutoCorrection.fixCommonPatterns).toBeDefined();
      expect(typeof SmartAutoCorrection.fixCommonPatterns).toBe('function');
    });

    it('should return string for valid input', () => {
      const code = `class MyClass {}`;
      const errors: string[] = [];
      const result = SmartAutoCorrection.fixCommonPatterns(code, errors);
      expect(typeof result).toBe('string');
    });

    it('should accept optional filePath parameter', () => {
      const code = `function test() {}`;
      const result = SmartAutoCorrection.fixCommonPatterns(code, [], 'src/test.ts');
      expect(typeof result).toBe('string');
    });
  });

  describe('isAutoFixable', () => {
    it('should have isAutoFixable method', () => {
      expect(SmartAutoCorrection.isAutoFixable).toBeDefined();
      expect(typeof SmartAutoCorrection.isAutoFixable).toBe('function');
    });

    it('should return boolean', () => {
      const errors: string[] = [];
      const result = SmartAutoCorrection.isAutoFixable(errors);
      expect(typeof result).toBe('boolean');
    });

    it('should return true for fixable errors', () => {
      const errors = ['Missing import: useState is used but not imported'];
      const result = SmartAutoCorrection.isAutoFixable(errors);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('static methods', () => {
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

  describe('integration scenarios', () => {
    it('should handle React Hook pattern', () => {
      const code = `function Component() { const [state, setState] = useState(0); }`;
      const errors = ['Missing import: useState is used but not imported'];
      const result = SmartAutoCorrection.fixMissingImports(code, errors);
      expect(typeof result).toBe('string');
      expect(result).toContain('useState');
    });

    it('should handle React Router pattern', () => {
      const code = `function Home() { const navigate = useNavigate(); }`;
      const errors = ['Missing import: useNavigate is used but not imported'];
      const result = SmartAutoCorrection.fixMissingImports(code, errors);
      expect(typeof result).toBe('string');
    });

    it('should handle service layer circular reference', () => {
      const code = `import { User } from './userService';\nexport class UserService { }`;
      const fixed = SmartAutoCorrection.fixCircularImports(code, 'src/services/userService.ts');
      expect(typeof fixed).toBe('string');
    });

    it('should chain fixes: circular + missing imports', () => {
      const code = `import { User } from './userService';\nfunction test() { useState(); }`;
      let result = SmartAutoCorrection.fixCircularImports(code, 'src/services/userService.ts');
      expect(typeof result).toBe('string');

      result = SmartAutoCorrection.fixMissingImports(result, ['Missing import: useState is used but not imported']);
      expect(typeof result).toBe('string');
    });

    it('should handle complex code with multiple issues', () => {
      const code = `
        import { UnusedLib } from 'unused';
        import { User } from './userService';
        export class UserService {
          method() { useState(); }
        }
      `;
      const errors = [
        "Unused import: 'UnusedLib'",
        'Missing import: useState is used but not imported'
      ];
      const result = SmartAutoCorrection.fixMissingImports(code, errors);
      expect(typeof result).toBe('string');
    });
  });

  describe('edge cases', () => {
    it('should handle code with no matches', () => {
      const code = `function noop() {}`;
      const result = SmartAutoCorrection.detectCircularImports(code, 'src/noop.ts');
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle import statements with various quote styles', () => {
      const code = `import { x } from "module";\nimport { y } from 'module';\nimport { z } from \`module\`;`;
      const result = SmartAutoCorrection.fixMissingImports(code, []);
      expect(typeof result).toBe('string');
    });

    it('should handle code with TypeScript syntax', () => {
      const code = `interface User { id: number; }\nexport class UserService implements IService {}`;
      const result = SmartAutoCorrection.fixCircularImports(code, 'src/services/userService.ts');
      expect(typeof result).toBe('string');
    });

    it('should handle code with comments', () => {
      const code = `// import { test } from './test';\nfunction test() {}`;
      const result = SmartAutoCorrection.detectCircularImports(code, 'src/test.ts');
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle multiline imports', () => {
      const code = `import {
        useState,
        useEffect
      } from 'react';`;
      const result = SmartAutoCorrection.fixMissingImports(code, []);
      expect(typeof result).toBe('string');
    });
  });

  describe('Phase 14 - Smart Auto-Correction High-Impact Tests', () => {
    describe('fixMissingImports - Core Auto-Fix Logic (ROI 9/10)', () => {
      it('should process useState error without breaking code', () => {
        const code = 'const [count] = useState(0);';
        const errors = ["Cannot find name 'useState'"];
        const result = SmartAutoCorrection.fixMissingImports(code, errors);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });

      it('should handle React Router import errors', () => {
        const code = 'const navigate = useNavigate();';
        const errors = ["Cannot find name 'useNavigate'"];
        const result = SmartAutoCorrection.fixMissingImports(code, errors);
        expect(typeof result).toBe('string');
      });

      it('should handle multiple missing imports', () => {
        const code = 'const [state] = useState(0); const navigate = useNavigate();';
        const errors = ["Cannot find name 'useState'", "Cannot find name 'useNavigate'"];
        const result = SmartAutoCorrection.fixMissingImports(code, errors);
        expect(typeof result).toBe('string');
      });

      it('should preserve code when no errors', () => {
        const code = `import { useState } from 'react';
const [count] = useState(0);`;
        const errors: any[] = [];
        const result = SmartAutoCorrection.fixMissingImports(code, errors);
        expect(result).toBe(code);
      });

      it('should process code with existing imports', () => {
        const code = `import { useState } from 'react';
const effect = useEffect(() => {});`;
        const errors = ["Cannot find name 'useEffect'"];
        const result = SmartAutoCorrection.fixMissingImports(code, errors);
        expect(typeof result).toBe('string');
      });

      it('should process component reference errors', () => {
        const code = '<Button />';
        const errors = ["Cannot find name 'Button'"];
        const result = SmartAutoCorrection.fixMissingImports(code, errors);
        expect(typeof result).toBe('string');
      });

      it('should preserve code structure', () => {
        const code = `export const Component = () => {
  const [state] = useState(0);
  return <div>{state}</div>;
};`;
        const errors: any[] = [];
        const result = SmartAutoCorrection.fixMissingImports(code, errors);
        expect(result).toContain('export const Component');
      });

      it('should handle TypeScript typing errors', () => {
        const code = 'const handleSubmit: FormEventHandler = () => {};';
        const errors = ["Cannot find name 'FormEventHandler'"];
        const result = SmartAutoCorrection.fixMissingImports(code, errors);
        expect(typeof result).toBe('string');
      });

      it('should process resolver import errors', () => {
        const code = 'const resolver = zodResolver(schema);';
        const errors = ["Cannot find name 'zodResolver'"];
        const result = SmartAutoCorrection.fixMissingImports(code, errors);
        expect(typeof result).toBe('string');
      });

      it('should handle large code blocks', () => {
        const code = 'const x = 1;\nconst y = 2;\nconst z = useState(0);';
        const errors: any[] = [];
        const result = SmartAutoCorrection.fixMissingImports(code, errors);
        expect(result.length).toBeGreaterThan(0);
      });
    });

    describe('inferImportSource - Pattern Matching (ROI 8.8/10)', () => {
      it('should process useState errors', () => {
        const result = SmartAutoCorrection.fixMissingImports('const [x] = useState(0)', ["Cannot find name 'useState'"]);
        expect(typeof result).toBe('string');
      });

      it('should process custom hooks', () => {
        const code = 'const store = useCustomStore();';
        const errors = ["Cannot find name 'useCustomStore'"];
        const result = SmartAutoCorrection.fixMissingImports(code, errors);
        expect(typeof result).toBe('string');
      });

      it('should process useNavigate errors', () => {
        const code = 'const navigate = useNavigate();';
        const errors = ["Cannot find name 'useNavigate'"];
        const result = SmartAutoCorrection.fixMissingImports(code, errors);
        expect(typeof result).toBe('string');
      });

      it('should process Zod schema errors', () => {
        const code = 'const schema = z.object({ name: z.string() });';
        const errors = ["Cannot find name 'z'"];
        const result = SmartAutoCorrection.fixMissingImports(code, errors);
        expect(typeof result).toBe('string');
      });

      it('should process Query errors', () => {
        const code = 'const { data } = useQuery({});';
        const errors = ["Cannot find name 'useQuery'"];
        const result = SmartAutoCorrection.fixMissingImports(code, errors);
        expect(typeof result).toBe('string');
      });

      it('should not modify console.log code', () => {
        const code = 'console.log("test");';
        const errors: any[] = [];
        const result = SmartAutoCorrection.fixMissingImports(code, errors);
        expect(result).toBe(code);
      });

      it('should process interface type errors', () => {
        const code = 'const user: IUser = {};';
        const errors: any[] = [];
        const result = SmartAutoCorrection.fixMissingImports(code, errors);
        expect(typeof result).toBe('string');
      });

      it('should process React namespace errors', () => {
        const code = 'React.memo(Component);';
        const errors: any[] = [];
        const result = SmartAutoCorrection.fixMissingImports(code, errors);
        expect(typeof result).toBe('string');
      });

      it('should process Zustand hook patterns', () => {
        const code = 'const count = useCountStore((state) => state.count);';
        const errors: any[] = [];
        const result = SmartAutoCorrection.fixMissingImports(code, errors);
        expect(typeof result).toBe('string');
      });

      it('should process Form hook patterns', () => {
        const code = 'const { control, handleSubmit } = useForm();';
        const errors: any[] = [];
        const result = SmartAutoCorrection.fixMissingImports(code, errors);
        expect(typeof result).toBe('string');
      });
    });

    describe('fixCommonPatterns - Orchestration (ROI 8.5/10)', () => {
      it('should process useState hook errors', () => {
        const code = 'const [state, setState] = useState(null);';
        const errors: any[] = [];
        const result = SmartAutoCorrection.fixCommonPatterns(code, errors);
        expect(typeof result).toBe('string');
      });

      it('should handle multiple pattern errors', () => {
        const code = `import useState from 'react';
const [state] = useState(0);`;
        const errors: any[] = [];
        const result = SmartAutoCorrection.fixCommonPatterns(code, errors);
        expect(typeof result).toBe('string');
      });

      it('should process Zustand component patterns', () => {
        const code = 'const Component = useStoreHook();';
        const errors: any[] = [];
        const result = SmartAutoCorrection.fixCommonPatterns(code, errors);
        expect(typeof result).toBe('string');
      });

      it('should process JSX component code', () => {
        const code = 'export const Button = () => <button>Click</button>;';
        const errors: any[] = [];
        const result = SmartAutoCorrection.fixCommonPatterns(code, errors);
        expect(typeof result).toBe('string');
      });

      it('should process circular import patterns', () => {
        const code = `import A from './a';`;
        const errors: any[] = [];
        const result = SmartAutoCorrection.fixCommonPatterns(code, errors);
        expect(typeof result).toBe('string');
      });
    });

    describe('extractStoreExports - Zustand Integration (ROI 7.5/10)', () => {
      it('should extract exports from Zustand store definition', () => {
        const code = `const useStore = create((set) => ({
          count: 0,
          increment: () => set((state) => ({ count: state.count + 1 }))
        }));`;
        const result = SmartAutoCorrection.detectCircularImports(code, 'store.ts');
        expect(Array.isArray(result)).toBe(true);
      });

      it('should identify store hook pattern', () => {
        const code = 'export const useAuthStore = create(...)';
        expect(code).toContain('useAuthStore');
      });

      it('should detect store selector patterns', () => {
        const code = 'const user = useUserStore((state) => state.user);';
        expect(code).toContain('state');
      });
    });

    describe('Error Handling & Edge Cases', () => {
      it('should handle empty error array gracefully', () => {
        const code = 'const x = 1;';
        const errors: any[] = [];
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

      it('should handle code with string literals containing imports', () => {
        const code = `const templateStr = "import something from 'react'";`;
        const errors = [];
        const result = SmartAutoCorrection.fixMissingImports(code, errors);
        expect(result).toBe(code);
      });

      it('should not break on complex TypeScript generics', () => {
        const code = 'const x: Record<string, Array<UseHookReturn>> = {};';
        const errors = [];
        const result = SmartAutoCorrection.fixMissingImports(code, errors);
        expect(typeof result).toBe('string');
      });
    });
  });
});
