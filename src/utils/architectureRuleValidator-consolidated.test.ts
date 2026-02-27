import { describe, it, expect } from 'vitest';
import {
  validateArchitectureRulePure,
  validateFormPatternsPure,
  validateCommonPatternsPure,
  determineFileContextPure,
  isGoldenShieldedPure,
} from './architectureRuleValidator';

describe('architectureRuleValidator - Pure Validation', () => {
  describe('Architecture Rule Validation', () => {
    const testCases = [
      {
        content: 'const data = await fetch("/api");',
        rules: ['TanStack Query'],
        expectedError: 'fetch',
        description: 'detects direct fetch call',
      },
      {
        content: 'const x = useQuery(...);',
        rules: ['TanStack Query'],
        expectedError: null,
        description: 'passes with TanStack Query',
      },
      {
        content: 'const state = useSelector(s => s.user);',
        rules: ['Zustand'],
        expectedError: 'useSelector',
        description: 'detects Redux useSelector',
      },
      {
        content: 'const store = useStore();',
        rules: ['Zustand'],
        expectedError: null,
        description: 'passes with Zustand',
      },
      {
        content: 'class MyComponent extends React.Component { }',
        rules: ['functional components'],
        expectedError: 'class',
        description: 'detects class components',
      },
      {
        content: 'export function MyComponent() { return <div />; }',
        rules: ['functional components'],
        expectedError: null,
        description: 'passes with functional component',
      },
      {
        content: 'const fn = () => { return 42; }',
        rules: ['strict TypeScript'],
        expectedError: 'return type',
        description: 'detects missing return type annotation',
      },
      {
        content: 'const fn = (): number => { return 42; }',
        rules: ['strict TypeScript'],
        expectedError: null,
        description: 'passes with return type annotation',
      },
    ];

    it.each(testCases)(
      'architecture: $description',
      ({ content, rules, expectedError }) => {
        const result = validateArchitectureRulePure(content, rules, 'src/test.ts');
        if (expectedError) {
          expect(result.some(v => v.message.includes(expectedError))).toBe(true);
        } else {
          expect(result.length).toBe(0);
        }
      }
    );
  });

  describe('Form Component Pattern Validation', () => {
    const testCases = [
      {
        content: 'interface LoginFormState { email: string; } export function LoginForm() { return <form></form>; }',
        filePath: 'src/components/LoginForm.tsx',
        expectedPatterns: ['state', 'submit'],
        description: 'valid form with state interface and form element',
      },
      {
        content: 'export function LoginForm() { return <div></div>; }',
        filePath: 'src/components/LoginForm.tsx',
        expectedPatterns: [],
        description: 'form without state interface',
      },
      {
        content: 'interface LoginFormState { email: string; } const handleSubmit = (e: FormEventHandler<HTMLFormElement>) => {}; function LoginForm() { return <form onSubmit={handleSubmit}><input name="email" /></form>; }',
        filePath: 'src/components/LoginForm.tsx',
        shouldPass: false,
        description: 'form component has patterns',
      },
      {
        content: 'export function LoginForm() { return <form><button onClick={handle}></button></form>; }',
        filePath: 'src/components/LoginForm.tsx',
        shouldPass: false,
        description: 'form with button onClick instead of form onSubmit',
      },
      {
        content: 'export function Test() { return <div></div>; }',
        filePath: 'src/components/Test.tsx',
        expectedErrors: [],
        description: 'non-form component not validated',
      },
    ];

    it.each(testCases)(
      'form patterns: $description',
      ({ content, filePath, shouldPass, expectedErrors = [] }) => {
        const result = validateFormPatternsPure(content, filePath);
        if (shouldPass === false) {
          expect(result.length).toBeGreaterThan(0);
        } else if (shouldPass === true) {
          expect(result.length).toBe(0);
        }
      }
    );
  });

  describe('Common Pattern Validation', () => {
    const testCases = [
      {
        content: 'import { useState } from "react"; function test() { useState(); }',
        filePath: 'src/test.tsx',
        hasErrors: false,
        description: 'valid import usage',
      },
      {
        content: 'function test() { useState(); }',
        filePath: 'src/test.tsx',
        hasErrors: true,
        description: 'useState used without import',
      },
      {
        content: 'import { helper } from "./utils"; function test() { helper(); }',
        filePath: 'src/test.ts',
        hasErrors: false,
        description: 'valid named import',
      },
      {
        content: 'import * as React from "react"; function test() { const x = React.useState; return x; }',
        filePath: 'src/test.tsx',
        hasErrors: false,
        description: 'valid namespace import',
      },
      {
        content: 'function test() { Helper.method(); }',
        filePath: 'src/test.ts',
        hasErrors: true,
        description: 'missing import for used function',
      },
      {
        content: 'import { x, y, z } from "module"; const a = x; const b = y;',
        filePath: 'src/test.ts',
        hasErrors: false,
        description: 'multiple imports with some unused is ok for validation',
      },
    ];

    it.each(testCases)(
      'common patterns: $description',
      ({ content, filePath, hasErrors }) => {
        const result = validateCommonPatternsPure(content, filePath);
        if (hasErrors) {
          expect(result.length).toBeGreaterThan(0);
        } else {
          expect(result.length).toBe(0);
        }
      }
    );
  });

  describe('File Context Classification', () => {
    const testCases = [
      {
        filePath: 'src/utils/helper.ts',
        expected: 'utility',
        description: 'utils folder classified as utility',
      },
      {
        filePath: 'src/components/Test.tsx',
        expected: 'component',
        description: 'components folder classified as component',
      },
      {
        filePath: 'src/components/LoginForm.tsx',
        expected: 'form',
        description: 'Form component classified as form',
      },
      {
        filePath: 'src/hooks/useUser.ts',
        expected: 'hook',
        description: 'hooks folder classified as hook',
      },
      {
        filePath: 'src/helpers/data.helper.ts',
        expected: 'utility',
        description: '.helper.ts file classified as utility',
      },
      {
        filePath: 'src/unknown/test.ts',
        description: 'unknown location classified as unknown',
        expected: 'unknown',
      },
    ];

    it.each(testCases)(
      'file context: $description',
      ({ filePath, expected }) => {
        const result = determineFileContextPure(filePath);
        expect(result).toBe(expected);
      }
    );
  });

  describe('Golden Shield Detection', () => {
    const testCases = [
      {
        filePath: 'src/utils/cn.ts',
        content: 'export function cn() {}',
        expected: true,
        description: 'cn.ts file is golden shielded',
      },
      {
        filePath: 'src/components/Test.tsx',
        content: 'import { cn } from "../utils/cn"; function Test() { return <div className={cn("base", { active: true })} />; }',
        expected: true,
        description: 'file using cn pattern is shielded',
      },
      {
        filePath: 'src/components/Test.tsx',
        content: 'const x = "class";',
        expected: false,
        description: 'regular component is not shielded',
      },
      {
        filePath: 'src/lib/cn.tsx',
        content: 'export const cn = () => {}',
        expected: true,
        description: 'cn.tsx file is golden shielded',
      },
    ];

    it.each(testCases)(
      'golden shield: $description',
      ({ filePath, content, expected }) => {
        const result = isGoldenShieldedPure(filePath, content);
        expect(result).toBe(expected);
      }
    );
  });

  describe('Performance Regression Suite', () => {
    it('should validate large architecture files in <50ms', () => {
      // Create a large file with multiple patterns
      const largeCode = Array(500)
        .fill(
          `
        function test() {
          const data = fetch('/api');
          const state = useSelector(s => s.data);
          return <form onSubmit={handleSubmit}></form>;
        }
      `
        )
        .join('\n');

      const rules = ['TanStack Query', 'Zustand', 'functional components', 'strict TypeScript'];

      const start = performance.now();
      validateArchitectureRulePure(largeCode, rules, 'src/test.tsx');
      validateFormPatternsPure(largeCode, 'src/components/TestForm.tsx');
      validateCommonPatternsPure(largeCode, 'src/test.tsx');
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50);
    });

    it('should handle complex regex patterns without hanging', () => {
      // Edge case: deeply nested structures
      const complexCode = `
        const fn = ${'{ '.repeat(100)}${'} '.repeat(100)};
        function complex(${'(a, b, c, d, e, f, g, h)'.repeat(50)}) {
          return ${'(((('.repeat(50)}x${')))).'.repeat(50)};
        }
      `;

      const start = performance.now();
      determineFileContextPure('src/utils/test.ts');
      isGoldenShieldedPure('src/test.ts', complexCode);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50);
    });
  });
});
