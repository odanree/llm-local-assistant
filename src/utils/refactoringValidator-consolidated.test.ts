import { describe, it, expect } from 'vitest';
import {
  validateSyntaxPure,
  validateTypesPure,
  validateLogicPure,
  validatePerformancePure,
  validateCompatibilityPure,
  assessImpactPure,
} from './refactoringValidator';
import type { RefactoringPlan } from '../refactoringExecutor';

describe('refactoringValidator - Pure Validation Functions', () => {
  describe('Syntax Validation', () => {
    const testCases = [
      {
        code: '',
        expectedPassed: false,
        expectedDetails: 'Code is empty',
        description: 'empty code fails',
      },
      {
        code: '  \n  ',
        expectedPassed: false,
        expectedDetails: 'Code is empty',
        description: 'whitespace-only code fails',
      },
      {
        code: 'const x = 1;',
        expectedPassed: true,
        expectedDetails: 'Syntax check passed',
        description: 'balanced single braces passes',
      },
      {
        code: '{ { } }',
        expectedPassed: true,
        expectedDetails: 'Syntax check passed',
        description: 'nested balanced braces passes',
      },
      {
        code: '{ { }',
        expectedPassed: false,
        expectedDetails: 'Unbalanced braces: 2 open, 1 close',
        description: 'unbalanced braces fails',
      },
      {
        code: '} } {',
        expectedPassed: false,
        expectedDetails: 'Unbalanced braces: 1 open, 2 close',
        description: 'more close than open braces fails',
      },
      {
        code: 'function test() { return 42; } if (true) { console.log("test"); }',
        expectedPassed: true,
        expectedDetails: 'Syntax check passed',
        description: 'multiple functions with balanced braces passes',
      },
      {
        code: 'const arr = [1, 2, { a: 1 }];',
        expectedPassed: true,
        expectedDetails: 'Syntax check passed',
        description: 'array with nested object passes',
      },
    ];

    it.each(testCases)(
      'should validate syntax: $description',
      ({ code, expectedPassed, expectedDetails }) => {
        const result = validateSyntaxPure(code);
        expect(result.type).toBe('syntax');
        expect(result.passed).toBe(expectedPassed);
        expect(result.details).toBe(expectedDetails);
      }
    );
  });

  describe('Type Validation', () => {
    const testCases = [
      {
        code: 'const x: string = "test";',
        hasIssues: false,
        description: 'proper type annotation passes',
      },
      {
        code: 'function test(x: any) { }',
        hasIssues: true,
        description: 'any type detected',
      },
      {
        code: 'function test() { return; }',
        hasIssues: true,
        description: 'implicit return without void detected',
      },
      {
        code: 'function test(): void { return; }',
        hasIssues: false,
        description: 'void return is valid',
      },
      {
        code: 'const x: any = 5;',
        hasIssues: true,
        description: 'any type detected',
      },
      {
        code: 'const x: string = "test";',
        hasIssues: false,
        description: 'specific types passes',
      },
    ];

    it.each(testCases)('type check: $description', ({ code, hasIssues }) => {
      const result = validateTypesPure(code);
      expect(result.type).toBe('types');
      expect(result.passed).toBe(!hasIssues);
    });
  });

  describe('Logic Validation', () => {
    const testCases = [
      {
        original: 'export function test() { try { } catch { } }',
        refactored: 'export function test() { try { } catch { } }',
        hasissues: false,
        description: 'identical logic passes',
      },
      {
        original: 'export function test() { } export function helper() { }',
        refactored: 'export function test() { }',
        hasIssues: true,
        description: 'removed exported function detected',
      },
      {
        original: 'function test() { try { } catch { } }',
        refactored: 'function test() { }',
        hasIssues: true,
        description: 'removed error handling detected',
      },
      {
        original: 'async function test() { }',
        refactored: 'function test() { }',
        hasIssues: true,
        description: 'removed async detected',
      },
      {
        original: 'function test() { return 42; }',
        refactored: 'function test() { return 42; }',
        hasIssues: false,
        description: 'sync function without changes passes',
      },
    ];

    it.each(testCases)(
      'logic check: $description',
      ({ original, refactored, hasIssues }) => {
        const result = validateLogicPure(original, refactored);
        expect(result.type).toBe('logic');
        expect(result.passed).toBe(!hasIssues);
      }
    );
  });

  describe('Performance Validation', () => {
    const testCases = [
      {
        original: 'const x = [1, 2, 3];',
        refactored: 'const x = [1, 2, 3];',
        hasIssues: false,
        description: 'no loops passes',
      },
      {
        original: 'for (let i = 0; i < n; i++) { }',
        refactored: 'for (let i = 0; i < n; i++) { } for (let j = 0; j < m; j++) { }',
        hasIssues: true,
        description: 'added loops detected',
      },
      {
        original: 'function test() { useState(); useEffect(() => {}); }',
        refactored:
          'function test() { useState(); useEffect(() => {}); useEffect(() => {}); }',
        hasIssues: true,
        description: 'added useEffect detected',
      },
      {
        original: 'while (true) { } while (true) { }',
        refactored: 'while (true) { }',
        hasIssues: false,
        description: 'removed loops passes',
      },
    ];

    it.each(testCases)(
      'performance check: $description',
      ({ original, refactored, hasIssues }) => {
        const result = validatePerformancePure(original, refactored);
        expect(result.type).toBe('performance');
        expect(result.passed).toBe(!hasIssues);
      }
    );
  });

  describe('Compatibility Validation', () => {
    const testCases = [
      {
        original: 'import { x } from "module";',
        refactored: 'import { x } from "module";',
        hasIssues: false,
        description: 'same imports passes',
      },
      {
        original: 'import { x } from "a"; import { y } from "b";',
        refactored: 'import { x } from "a";',
        hasIssues: true,
        description: 'removed imports detected',
      },
      {
        original: 'interface Test { a: string; }',
        refactored: 'interface Test { a: string; }',
        hasIssues: false,
        description: 'same interfaces passes',
      },
      {
        original: 'interface A { } interface B { }',
        refactored: 'interface A { }',
        hasIssues: true,
        description: 'removed interface detected',
      },
    ];

    it.each(testCases)(
      'compatibility check: $description',
      ({ original, refactored, hasIssues }) => {
        const result = validateCompatibilityPure(original, refactored);
        expect(result.type).toBe('compatibility');
        expect(result.passed).toBe(!hasIssues);
      }
    );
  });

  describe('Impact Assessment', () => {
    const createPlan = (changes: any[] = [], risks: any[] = []): RefactoringPlan => ({
      hookFile: 'test.ts',
      estimatedComplexity: 'high',
      proposedChanges: changes,
      risks: risks,
      extractedServices: [],
      usageLocations: [],
    });

    const testCases = [
      {
        plan: createPlan([{ type: 'extract', description: 'helper' }]),
        original: 'code with original',
        refactored: 'code with refactored',
        expectsBenefits: true,
        description: 'extract change adds benefit',
      },
      {
        plan: createPlan([{ type: 'simplify', description: 'logic' }]),
        original: 'very long code '.repeat(100),
        refactored: 'short',
        expectsBenefits: true,
        description: 'size reduction detected',
      },
      {
        plan: createPlan([], [{ description: 'potential risk' }]),
        original: 'function test() { }',
        refactored: 'function test() { }',
        expectsRisks: true,
        description: 'plan risks included',
      },
      {
        plan: createPlan(),
        original: 'export function a() {} export function b() {}',
        refactored: 'export function a() {}',
        expectsBreakingChanges: true,
        description: 'breaking changes detected when exports removed',
      },
      {
        plan: createPlan(),
        original: 'function test() { }',
        refactored: 'function test() { useMemo(() => {}); }',
        expectsPositivePerf: true,
        description: 'useMemo optimization detected',
      },
    ];

    it.each(testCases)(
      'impact assessment: $description',
      ({ plan, original, refactored, expectsBenefits, expectsRisks, expectsBreakingChanges, expectsPositivePerf }) => {
        const result = assessImpactPure(plan, original, refactored);

        if (expectsBenefits) {
          expect(result.estimatedBenefits.length).toBeGreaterThan(0);
        }
        if (expectsRisks) {
          expect(result.potentialRisks.length).toBeGreaterThan(0);
        }
        if (expectsBreakingChanges) {
          expect(result.breakingChanges).toBe(true);
        }
        if (expectsPositivePerf) {
          expect(result.performanceImpact).toBe('positive');
        }
      }
    );
  });

  describe('Performance Regression Suite', () => {
    it('should validate large files in <50ms', () => {
      // Create a 1000-line file
      const largeCode = Array(1000)
        .fill('function test() { const x = 1; }')
        .join('\n');

      const start = performance.now();
      validateSyntaxPure(largeCode);
      validateTypesPure(largeCode);
      validateLogicPure(largeCode, largeCode);
      validatePerformancePure(largeCode, largeCode);
      validateCompatibilityPure(largeCode, largeCode);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50);
    });

    it('should handle edge case patterns without hanging', () => {
      // Edge case: very long string with many braces
      const edgeCase = '{ '.repeat(500) + ' }'.repeat(500);

      const start = performance.now();
      const result = validateSyntaxPure(edgeCase);
      const duration = performance.now() - start;

      expect(result.type).toBe('syntax');
      expect(duration).toBeLessThan(50);
    });
  });
});
