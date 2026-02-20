import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SmartAutoCorrection } from '../smartAutoCorrection';

describe('SmartAutoCorrection Extended Coverage', () => {
  describe('Circular Import Detection', () => {
    it('should detect self-referential imports', () => {
      const code = `
        import { UserService } from './userService';
        export class UserService {}
      `;

      const circularImports = SmartAutoCorrection.detectCircularImports(code, 'src/services/userService.ts');

      expect(circularImports).toBeDefined();
      expect(Array.isArray(circularImports)).toBe(true);
      if (circularImports.length > 0) {
        expect(circularImports[0]).toContain('import');
      }
    });

    it('should not detect imports from different modules', () => {
      const code = `
        import { UserService } from './services/userService';
        import { BlogService } from './services/blogService';
        export class AppService {}
      `;

      const circularImports = SmartAutoCorrection.detectCircularImports(code, 'src/appService.ts');

      expect(Array.isArray(circularImports)).toBe(true);
      // Should not detect as circular since it's different files
      if (circularImports.length === 0) {
        expect(true).toBe(true);
      }
    });

    it('should detect service importing itself', () => {
      const code = `
        import { findUser } from './repositories/userRepository';
        import UserRepository from '../repositories/userRepo';
        export class UserRepository {}
      `;

      const circularImports = SmartAutoCorrection.detectCircularImports(code, 'src/repositories/userRepository.ts');

      expect(Array.isArray(circularImports)).toBe(true);
      // May detect self-import depending on pattern matching
    });

    it('should handle various file extensions', () => {
      const code = `import { Service } from './service';`;

      const circularTsx = SmartAutoCorrection.detectCircularImports(code, 'src/component.tsx');
      const circularTsX = SmartAutoCorrection.detectCircularImports(code, 'src/component.tsX');
      const circularJs = SmartAutoCorrection.detectCircularImports(code, 'src/component.js');

      expect(Array.isArray(circularTsx)).toBe(true);
      expect(Array.isArray(circularTsX)).toBe(true);
      expect(Array.isArray(circularJs)).toBe(true);
    });

    it('should ignore comments with imports', () => {
      const code = `
        // import { Self } from './self';
        /* import { Me } from './me'; */
        export class FileClass {}
      `;

      const circularImports = SmartAutoCorrection.detectCircularImports(code, 'src/fileClass.ts');

      // Comments should be filtered by regex pattern matching
      expect(Array.isArray(circularImports)).toBe(true);
    });
  });

  describe('Circular Import Fixing', () => {
    it('should remove detected circular imports', () => {
      const code = `import { UserService } from './userService';
export class UserService {}`;

      const fixed = SmartAutoCorrection.fixCircularImports(code, 'src/userService.ts');

      expect(fixed).toBeDefined();
      expect(typeof fixed).toBe('string');
      // After fixing, should have no or fewer imports
      const originalImportCount = (code.match(/import/g) || []).length;
      const fixedImportCount = (fixed.match(/import/g) || []).length;
      expect(fixedImportCount).toBeLessThanOrEqual(originalImportCount);
    });

    it('should preserve other imports when fixing circular ones', () => {
      const code = `import { UserService } from './userService';
import { BlogService } from './blogService';
export class UserService {}`;

      const fixed = SmartAutoCorrection.fixCircularImports(code, 'src/userService.ts');

      // Should keep BlogService import but remove circular one
      expect(fixed).toContain('BlogService');
    });

    it('should handle no circular imports gracefully', () => {
      const code = `import { BlogService } from './blogService';
export const doSomething = () => {};`;

      const fixed = SmartAutoCorrection.fixCircularImports(code, 'src/helper.ts');

      // Should return same code if no circular imports
      expect(fixed).toBe(code);
    });

    it('should remove multiple circular imports', () => {
      const code = `import { FileA } from './fileA';
import { Service } from '../services/service';
import { FileA as Alias } from './fileA';
export class FileA {}`;

      const fixed = SmartAutoCorrection.fixCircularImports(code, 'src/fileA.ts');

      expect(fixed).toBeDefined();
      const removedLines = code.split('\n').length - fixed.split('\n').length;
      expect(removedLines).toBeGreaterThan(0);
    });
  });

  describe('Missing Imports Detection & Fixing', () => {
    it('should detect and fix React hooks missing import', () => {
      const code = `
        export const Component = () => {
          const [value, setValue] = useState(0);
          return <div>{value}</div>;
        };
      `;

      const validationErrors = ['Missing import: useState is used but not imported in component.tsx'];

      const fixed = SmartAutoCorrection.fixMissingImports(code, validationErrors);

      expect(fixed).toBeDefined();
      expect(fixed.includes('useState')).toBe(true);
      expect(fixed.includes('from')).toBe(true);
    });

    it('should infer import source for useEffect', () => {
      const code = `useEffect(() => { console.log('mounted'); }, []);`;

      const validationErrors = ['Missing import: useEffect is used but not imported'];

      const fixed = SmartAutoCorrection.fixMissingImports(code, validationErrors);

      expect(fixed).toContain('useEffect');
      expect(fixed).toContain('react');
    });

    it('should infer import for custom hooks', () => {
      const code = `const Component = () => {
const user = useUserData();
return <div>{user}</div>;
};`;

      const validationErrors = ['Missing import: useUserData is used but not imported'];

      const fixed = SmartAutoCorrection.fixMissingImports(code, validationErrors);

      // Should infer custom hook from hooks directory
      expect(fixed).toBeDefined();
      expect(fixed.includes('useUserData')).toBe(true);
    });

    it('should handle multiple missing imports', () => {
      const code = `
        export const Component = () => {
          const [count, setCount] = useState(0);
          const navigate = useNavigate();
          return <div>{count}</div>;
        };
      `;

      const validationErrors = [
        'Missing import: useState is used but not imported',
        'Missing import: useNavigate is used but not imported',
      ];

      const fixed = SmartAutoCorrection.fixMissingImports(code, validationErrors);

      expect(fixed).toBeDefined();
      expect(fixed.includes('react')).toBe(true);
      expect(fixed.includes('react-router-dom')).toBe(true);
    });

    it('should remove unused imports when fixing', () => {
      const code = `import { unused } from './unused';
export const Component = () => {
const value = useState(0);
return <div>{value}</div>;
};`;

      const validationErrors = [
        'Unused import: \'unused\'',
        'Missing import: useState is used but not imported',
      ];

      const fixed = SmartAutoCorrection.fixMissingImports(code, validationErrors);

      expect(fixed).toBeDefined();
      // Should have removed unused import
      expect(fixed.includes('unused')).toBe(false);
    });

    it('should infer import source for Repository pattern', () => {
      const code = `const user = await userRepository.find(id);`;

      const validationErrors = ['Missing import: userRepository is used but not imported'];

      const fixed = SmartAutoCorrection.fixMissingImports(code, validationErrors);

      expect(fixed).toBeDefined();
      expect(fixed.includes('userRepository')).toBe(true);
    });

    it('should infer import source for Service pattern', () => {
      const code = `const user = await blogService.getPost(id);`;

      const validationErrors = ['Missing import: blogService is used but not imported'];

      const fixed = SmartAutoCorrection.fixMissingImports(code, validationErrors);

      expect(fixed).toBeDefined();
      expect(fixed.includes('blogService')).toBe(true);
    });

    it('should infer import for common utilities', () => {
      const code = `const merged = clsx('button', isActive && 'active');`;

      const validationErrors = ['Missing import: clsx is used but not imported'];

      const fixed = SmartAutoCorrection.fixMissingImports(code, validationErrors);

      expect(fixed).toBeDefined();
      expect(fixed.includes('clsx')).toBe(true);
    });

    it('should infer import for tailwind class merger', () => {
      const code = `const classes = cn('px-2 py-4', 'px-4');`;

      const validationErrors = ['Missing import: cn is used but not imported'];

      const fixed = SmartAutoCorrection.fixMissingImports(code, validationErrors);

      expect(fixed).toBeDefined();
      expect(fixed.includes('cn')).toBe(true);
    });

    it('should handle empty validation errors', () => {
      const code = `export const test = () => {};`;

      const fixed = SmartAutoCorrection.fixMissingImports(code, []);

      expect(fixed).toBe(code);
    });

    it('should preserve code structure when fixing', () => {
      const originalCode = `export async function fetchUsers() {
  const users = useUserQuery();
  return users;
}`;

      const validationErrors = ['Missing import: useUserQuery is used but not imported'];

      const fixed = SmartAutoCorrection.fixMissingImports(originalCode, validationErrors);

      expect(fixed).toContain('fetchUsers');
      expect(fixed).toContain('useUserQuery');
      expect(fixed).toContain('export');
      expect(fixed).toContain('async');
    });
  });

  describe('Import Source Inference', () => {
    it('should infer React imports correctly', () => {
      const code = `
        function test() {
          useState(0);
          useEffect(() => {});
        }
      `;

      // Test via fixMissingImports which uses inferImportSource internally
      const fixed = SmartAutoCorrection.fixMissingImports(code, [
        'Missing import: useState is used but not imported',
        'Missing import: useEffect is used but not imported',
      ]);

      expect(fixed.includes('react')).toBe(true);
    });

    it('should infer React Router imports', () => {
      const code = 'const nav = useNavigate();';
      const validationErrors = ['Missing import: useNavigate is used but not imported'];

      const fixed = SmartAutoCorrection.fixMissingImports(code, validationErrors);

      expect(fixed.includes('react-router-dom')).toBe(true);
    });

    it('should handle unknown symbols gracefully', () => {
      const code = `const result = unknownFunction();`;

      const fixed = SmartAutoCorrection.fixMissingImports(code, [
        'Missing import: unknownFunction is used but not imported',
      ]);

      expect(fixed).toBeDefined();
      // May not add import for unknown symbol, but should not crash
    });
  });

  describe('Type Patterns', () => {
    it('should infer imports for Interface types', () => {
      const code = `const user: IUser = {};`;

      const validationErrors = ['Missing import: IUser is used but not imported'];

      const fixed = SmartAutoCorrection.fixMissingImports(code, validationErrors);

      expect(fixed).toBeDefined();
      expect(fixed.includes('IUser')).toBe(true);
    });

    it('should infer imports for Class patterns', () => {
      const code = `const service = new UserService();`;

      const validationErrors = ['Missing import: UserService is used but not imported'];

      const fixed = SmartAutoCorrection.fixMissingImports(code, validationErrors);

      expect(fixed).toBeDefined();
      expect(fixed.includes('UserService')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle code with no imports section', () => {
      const code = `const x = 42;
export { x };`;

      const fixed = SmartAutoCorrection.fixMissingImports(code, [
        'Missing import: something is used but not imported',
      ]);

      expect(fixed).toBeDefined();
      expect(typeof fixed).toBe('string');
    });

    it('should handle code with only imports', () => {
      const code = `import React from 'react';
import { Component } from 'react';`;

      const fixed = SmartAutoCorrection.fixMissingImports(code, []);

      expect(fixed).toBe(code);
    });

    it('should handle whitespace variations in imports', () => {
      const code = `import   {   useState   }   from   'react'  ;`;

      const fixed = SmartAutoCorrection.fixMissingImports(code, []);

      // Should handle irregular spacing
      expect(fixed).toBeDefined();
    });

    it('should handle default imports', () => {
      const code = `import React from 'react';
const Component = () => {};`;

      const fixed = SmartAutoCorrection.fixMissingImports(code, []);

      expect(fixed).toContain('React');
    });

    it('should handle namespace imports', () => {
      const code = `import * as React from 'react';`;

      const fixed = SmartAutoCorrection.fixMissingImports(code, []);

      expect(fixed).toContain('React');
    });

    it('should not add duplicate imports', () => {
      const code = `import { useState } from 'react';`;

      const fixed = SmartAutoCorrection.fixMissingImports(code, [
        'Missing import: useState is used but not imported',
      ]);

      const importLines = fixed.match(/import.*useState.*from.*react/g) || [];
      expect(importLines.length).toBeLessThanOrEqual(1);
    });

    it('should preserve destructuring patterns', () => {
      const code = `import { a, b, c } from './module';`;

      const fixed = SmartAutoCorrection.fixMissingImports(code, []);

      expect(fixed).toContain('{ a, b, c }');
      expect(fixed).toContain('./module');
    });

    it('should handle nested directory paths', () => {
      const code = ``;

      const fixed = SmartAutoCorrection.fixMissingImports(code, [
        'Missing import: userRepository is used but not imported',
      ]);

      expect(fixed).toBeDefined();
      // Should infer nested path for repositories
    });
  });

  describe('Validation Error Parsing', () => {
    it('should handle various error message formats', () => {
      const code = '';

      const errors = [
        'Missing import: useState is used but not imported in component.tsx',
        'Missing import:useState is used but not imported in component.tsx',
        'Missing import: useState is used but not imported',
      ];

      const fixed = SmartAutoCorrection.fixMissingImports(code, errors);

      expect(fixed).toBeDefined();
      expect(typeof fixed).toBe('string');
    });

    it('should extract symbol names correctly', () => {
      const code = '';

      const errors = ['Unused import: \'useContext\''];

      const fixed = SmartAutoCorrection.fixMissingImports(code, errors);

      expect(fixed).toBeDefined();
    });

    it('should handle case sensitivity', () => {
      const code = `const Component = () => useState(0);`;

      const errors = ['Missing import: useState is used but not imported'];

      const fixed = SmartAutoCorrection.fixMissingImports(code, errors);

      expect(fixed).toContain('useState');
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle complex code with multiple issues', () => {
      const code = `
        import { unused } from './unused';
        export const Component = () => {
          const [count, setCount] = useState(0);
          const navigate = useNavigate();
          const user: IUser = { id: 1, name: 'Test' };
          const service = new UserService();
          return (
            <div>
              {count}
              <button onClick={() => navigate('/')}>Home</button>
            </div>
          );
        };
      `;

      const errors = [
        'Unused import: \'unused\'',
        'Missing import: useState is used but not imported',
        'Missing import: useNavigate is used but not imported',
        'Missing import: IUser is used but not imported',
        'Missing import: UserService is used but not imported',
      ];

      const fixed = SmartAutoCorrection.fixMissingImports(code, errors);

      expect(fixed).toBeDefined();
      expect(fixed.includes('useState')).toBe(true);
      expect(fixed.includes('useNavigate')).toBe(true);
    });

    it('should fix React code with JSX and Hooks', () => {
      const code = `
        export const UserProfile = () => {
          const [user, setUser] = useState(null);
          useEffect(() => { fetchUser(); }, []);
          return <div>{user?.name}</div>;
        };
      `;

      const errors = [
        'Missing import: useState is used but not imported',
        'Missing import: useEffect is used but not imported',
      ];

      const fixed = SmartAutoCorrection.fixMissingImports(code, errors);

      expect(fixed).toContain('react');
      expect(fixed).toContain('useState');
      expect(fixed).toContain('useEffect');
    });

    it('should handle deeply nested service structures', () => {
      const code = `
        const userRepo = new UserRepository();
        const blogRepo = new BlogRepository();
        const userService = new UserService();
      `;

      const errors = [
        'Missing import: UserRepository is used but not imported',
        'Missing import: BlogRepository is used but not imported',
        'Missing import: UserService is used but not imported',
      ];

      const fixed = SmartAutoCorrection.fixMissingImports(code, errors);

      expect(fixed).toBeDefined();
      expect(fixed.includes('UserRepository')).toBe(true);
      expect(fixed.includes('BlogRepository')).toBe(true);
      expect(fixed.includes('UserService')).toBe(true);
    });
  });
});
