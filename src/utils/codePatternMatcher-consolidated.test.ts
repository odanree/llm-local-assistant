import { describe, it, expect } from 'vitest';
import { matchFormPatterns, matchArchitecturePatterns, matchImportPatterns } from './codePatternMatcher';

describe('codePatternMatcher - Pure Pattern Detection', () => {
  describe('Form Pattern Matching', () => {
    const testCases = [
      {
        code: `
          interface LoginState { email: string; }
          function Login() {
            const handleChange: FormEventHandler<HTMLFormElement> = (e) => {
              const { name, value } = e.currentTarget;
            };
            return <form onSubmit={handleChange}></form>;
          }
        `,
        description: 'complete form pattern',
        expectedPatterns: ['stateInterface', 'formEventHandler'],
      },
      {
        code: `
          function Test() {
            const handleChange = (e: any) => {};
            return <form><input /></form>;
          }
        `,
        description: 'form with typed-as-any handler',
        expectedIssues: ['formEventHandler'],
      },
      {
        code: `
          function Test() {
            return <div></div>;
          }
        `,
        description: 'non-form code',
        expectedPatterns: [],
      },
      {
        code: `
          interface UserFormState { name: string; }
          type ErrorState = Record<string, string>;
          const [errors, setErrors] = useState<Record<string, string>>({});
          function UserForm() {
            const handleChange = (e) => {
              const { name, value } = e.currentTarget;
            };
            return (
              <form onSubmit={handleChange}>
                <input name="name" value={name} onChange={handleChange} />
                {errors.name && <span>{errors.name}</span>}
              </form>
            );
          }
        `,
        description: 'complete form with error state',
        expectedPatterns: ['stateInterface', 'errorState', 'namedInputs'],
      },
    ];

    it.each(testCases)(
      'form matching: $description',
      ({ code, expectedPatterns = [], expectedIssues = [] }) => {
        const patterns = matchFormPatterns(code);

        if (expectedPatterns.length > 0) {
          expectedPatterns.forEach(patternType => {
            const found = patterns.find(p => p.type === patternType && p.found);
            expect(found).toBeTruthy();
          });
        }
      }
    );
  });

  describe('Architecture Pattern Matching', () => {
    const testCases = [
      {
        code: 'const data = fetch("/api");',
        description: 'direct fetch call',
        expectedPattern: 'directFetch',
      },
      {
        code: 'const { data } = useQuery({...});',
        description: 'TanStack Query usage',
        expectedPattern: 'directFetch',
        shouldNotFind: true,
      },
      {
        code: 'const state = useSelector(s => s.user);',
        description: 'Redux usage',
        expectedPattern: 'redux',
      },
      {
        code: 'const store = useStore();',
        description: 'Zustand usage',
        expectedPattern: 'redux',
        shouldNotFind: true,
      },
      {
        code: 'class MyComponent extends React.Component { }',
        description: 'class component',
        expectedPattern: 'classComponent',
      },
      {
        code: 'export function MyComponent() { return <div />; }',
        description: 'functional component',
        expectedPattern: 'classComponent',
        shouldNotFind: true,
      },
      {
        code: 'const fn = (): number => 42;',
        description: 'arrow function with return type',
        expectedPattern: 'typeAnnotations',
      },
      {
        code: 'const fn = () => 42;',
        description: 'arrow function without return type',
        expectedPattern: 'typeAnnotations',
        shouldNotFind: true,
      },
      {
        code: 'const schema = z.object({ name: z.string() });',
        description: 'Zod validation',
        expectedPattern: 'zodValidation',
      },
      {
        code: 'useForm({ resolver: zodResolver(schema) })',
        description: 'zodResolver usage',
        expectedPattern: 'zodResolver',
      },
      {
        code: `
          import { yupResolver } from '@hookform/resolvers/yup';
          import z from 'zod';
          const schema = z.object({});
          useForm({ resolver: yupResolver(schema) });
        `,
        description: 'mixed Yup and Zod detected as bad pattern',
        expectedPattern: 'mixedValidation',
        shouldNotFind: true,
      },
    ];

    it.each(testCases)(
      'architecture matching: $description',
      ({ code, expectedPattern, shouldNotFind = false }) => {
        const patterns = matchArchitecturePatterns(code);
        const pattern = patterns.find(p => p.type === expectedPattern);

        if (shouldNotFind) {
          expect(pattern?.found).toBe(false);
        } else {
          expect(pattern?.found).toBe(true);
        }
      }
    );
  });

  describe('Import Pattern Matching', () => {
    const testCases = [
      {
        code: `
          import { useState, useEffect } from 'react';
          function test() { useState(); }
        `,
        description: 'basic import and usage',
        expectedDeclared: ['useState', 'useEffect'],
      },
      {
        code: `
          import React from 'react';
          function test() { React.useState(); }
        `,
        description: 'default import with namespace usage',
        expectedDeclared: ['React'],
      },
      {
        code: `
          import * as React from 'react';
          function test() { React.useState(); }
        `,
        description: 'namespace import',
        expectedDeclared: ['React'],
      },
      {
        code: `
          import { a, b, c } from 'module';
          const x = a + b;
        `,
        description: 'multiple imports, some unused',
        expectedDeclared: ['a', 'b', 'c'],
      },
      {
        code: `
          import { useState } from 'react';
          import { helper } from './utils';
          function test() { useState(); helper(); }
        `,
        description: 'multiple import statements',
        expectedDeclared: ['useState', 'helper'],
      },
    ];

    it.each(testCases)(
      'import matching: $description',
      ({ code, expectedDeclared = [] }) => {
        const result = matchImportPatterns(code);

        expectedDeclared.forEach(imp => {
          expect(result.declared.has(imp)).toBe(true);
        });
      }
    );
  });

  describe('Complex Pattern Detection', () => {
    const testCases = [
      {
        code: `
          import { useState } from 'react';
          interface FormState { email: string; password: string; }

          export function LoginForm() {
            const [form, setForm] = useState<FormState>({});
            const [errors, setErrors] = useState<Record<string, string>>({});

            const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
              const { name, value } = e.currentTarget;
              setForm(prev => ({ ...prev, [name]: value }));
            };

            const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              // validation logic
            };

            return (
              <form onSubmit={handleSubmit}>
                <input name="email" type="email" onChange={handleChange} />
                {errors.email && <p>{errors.email}</p>}
                <input name="password" type="password" onChange={handleChange} />
                {errors.password && <p>{errors.password}</p>}
              </form>
            );
          }
        `,
        description: 'complete form component',
        checksForm: true,
        checksImports: true,
      },
      {
        code: `
          import { useQuery } from '@tanstack/react-query';

          export function UserList() {
            const { data } = useQuery({ queryKey: ['users'] });

            return (
              <ul>
                {data?.map(user => <li key={user.id}>{user.name}</li>)}
              </ul>
            );
          }
        `,
        description: 'TanStack Query component',
        checksArchitecture: true,
        checksImports: true,
      },
    ];

    it.each(testCases)(
      'complex detection: $description',
      ({ code, checksForm, checksImports, checksArchitecture }) => {
        if (checksForm) {
          const forms = matchFormPatterns(code);
          expect(forms.length).toBeGreaterThan(0);
        }
        if (checksImports) {
          const imports = matchImportPatterns(code);
          expect(imports.declared.size).toBeGreaterThan(0);
        }
        if (checksArchitecture) {
          const arch = matchArchitecturePatterns(code);
          expect(arch.length).toBeGreaterThan(0);
        }
      }
    );
  });

  describe('Performance Regression Suite', () => {
    it('should match patterns on large files in <50ms', () => {
      // Create a large code file with many patterns
      const largeCode = Array(1000)
        .fill(`
          import { useState } from 'react';
          interface State { x: string; }
          function Component() {
            const [state, setState] = useState<State>({});
            const handle = (e) => { setState({}); };
            return <form onSubmit={handle}></form>;
          }
        `)
        .join('\n');

      const start = performance.now();
      matchFormPatterns(largeCode);
      matchArchitecturePatterns(largeCode);
      matchImportPatterns(largeCode);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50);
    });

    it('should handle deeply nested patterns without hanging', () => {
      // Edge case: deeply nested structures
      const edgeCase = `
        ${Array(100).fill('{ const x = {').join('')}
        const x = 1;
        ${Array(100).fill('};').join('')}
      `;

      const start = performance.now();
      matchImportPatterns(edgeCase);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50);
    });
  });
});
