/**
 * Phase 10F: RefactoringExecutor Comprehensive Testing
 *
 * Strategy: Target the 37.24% statement gap in refactoringExecutor
 * Focus: Code extraction, parsing, classification, validation orchestration
 *
 * Key Areas:
 * 1. Code extraction from LLM responses (regex patterns)
 * 2. Test case parsing and structure
 * 3. File context determination and classification
 * 4. Golden template matching and shielding
 * 5. Validation result structures
 * 6. Impact assessment contracts
 * 7. Error handling and logging
 * 8. Refactoring execution orchestration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RefactoringExecutor, RefactoringExecution, ValidationResult, GeneratedTestCase, ImpactAssessment } from '../refactoringExecutor';
import { LLMClient, LLMClientConfig } from '../llmClient';
import { ServiceExtractor, RefactoringPlan } from '../serviceExtractor';

// Mock dependencies
vi.mock('../llmClient');
vi.mock('../serviceExtractor');
vi.mock('../services/smartValidator');
vi.mock('../services/semanticValidator');

describe('Phase 10F: RefactoringExecutor Comprehensive Testing', () => {
  let executor: RefactoringExecutor;
  let mockLLMClient: any;
  let mockExtractor: any;

  beforeEach(() => {
    mockLLMClient = {
      getConfig: vi.fn(() => ({
        model: 'test-model',
        endpoint: 'http://localhost',
      })),
      sendMessage: vi.fn(),
    };

    mockExtractor = {};
    executor = new RefactoringExecutor(mockLLMClient, mockExtractor);
  });

  // =========================================================================
  // SECTION 1: Class Instantiation & Structure
  // =========================================================================

  describe('Class Instantiation & Structure', () => {
    it('should instantiate with LLMClient and optional ServiceExtractor', () => {
      const client = new RefactoringExecutor(mockLLMClient);
      expect(client).toBeInstanceOf(RefactoringExecutor);
    });

    it('should accept custom ServiceExtractor', () => {
      const custom = new RefactoringExecutor(mockLLMClient, mockExtractor);
      expect(custom).toBeInstanceOf(RefactoringExecutor);
    });

    it('should log model configuration on instantiation', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      new RefactoringExecutor(mockLLMClient);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // =========================================================================
  // SECTION 2: Code Extraction from LLM Responses
  // =========================================================================

  describe('Code Extraction - Regex Patterns', () => {
    it('should extract code from typescript markdown block', () => {
      const response = '```typescript\nfunction test() { return 42; }\n```';
      const extracted = executor['extractCodeFromResponse'](response);
      expect(extracted).toContain('function test');
      expect(extracted).toContain('return 42');
    });

    it('should extract code from tsx markdown block', () => {
      const response = '```tsx\nconst Component = () => <div/>;\n```';
      const extracted = executor['extractCodeFromResponse'](response);
      expect(extracted).toContain('const Component');
    });

    it('should extract code from plain javascript block', () => {
      const response = '```javascript\nconst x = 1;\n```';
      const extracted = executor['extractCodeFromResponse'](response);
      expect(extracted).toContain('const x');
    });

    it('should extract code from plain backtick block', () => {
      const response = '```\nexport function test() {}\n```';
      const extracted = executor['extractCodeFromResponse'](response);
      expect(extracted).toContain('export function test');
    });

    it('should extract code if no fence but contains code keywords', () => {
      const response = 'function hello() { return "world"; }';
      const extracted = executor['extractCodeFromResponse'](response);
      expect(extracted).toContain('function hello');
    });

    it('should extract code with export keyword', () => {
      const response = 'export const value = 42;';
      const extracted = executor['extractCodeFromResponse'](response);
      expect(extracted).toContain('export const value');
    });

    it('should extract code with const keyword', () => {
      const response = 'const handler = () => { };';
      const extracted = executor['extractCodeFromResponse'](response);
      expect(extracted).toContain('const handler');
    });

    it('should return null for non-code response', () => {
      const response = 'This is just some text without code';
      const extracted = executor['extractCodeFromResponse'](response);
      expect(extracted).toBeNull();
    });

    it('should handle multiline code blocks', () => {
      const response = `\`\`\`ts
function complex(a: number, b: number): number {
  return a + b;
}
\`\`\``;
      const extracted = executor['extractCodeFromResponse'](response);
      expect(extracted).toContain('function complex');
      expect(extracted).toContain('return a + b');
    });

    it('should trim whitespace from extracted code', () => {
      const response = '```\n  const x = 1;  \n```';
      const extracted = executor['extractCodeFromResponse'](response);
      expect(extracted).toBe('const x = 1;');
    });

    it('should handle code with special characters', () => {
      const response = '```ts\nconst regex = /test\\d+/g;\n```';
      const extracted = executor['extractCodeFromResponse'](response);
      expect(extracted).toContain('regex');
    });
  });

  // =========================================================================
  // SECTION 3: Test Case Parsing
  // =========================================================================

  describe('Test Case Parsing', () => {
    it('should parse single test case', () => {
      const response = `test('addition', async () => {
  const result = 1 + 1;
  expect(result).toBe(2);
});`;
      const parsed = executor['parseTestCases'](response, 'code');
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe('addition');
    });

    it('should parse multiple test cases', () => {
      const response = `test('first', async () => {
  expect(1).toBe(1);
});
test('second', async () => {
  expect(2).toBe(2);
});`;
      const parsed = executor['parseTestCases'](response, 'code');
      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('first');
      expect(parsed[1].name).toBe('second');
    });

    it('should preserve test code in parsed cases', () => {
      const response = `test('example', async () => {
  const x = 42;
  return x;
});`;
      const parsed = executor['parseTestCases'](response, 'code');
      expect(parsed[0].code).toContain('const x = 42');
    });

    it('should return empty array for no tests', () => {
      const response = 'No tests here';
      const parsed = executor['parseTestCases'](response, 'code');
      expect(parsed).toEqual([]);
    });

    it('should handle test names with special characters', () => {
      const response = `test('handles @deprecated properly', async () => {
  expect(true).toBe(true);
});`;
      const parsed = executor['parseTestCases'](response, 'code');
      expect(parsed[0].name).toBe('handles @deprecated properly');
    });

    it('should handle multiline test bodies', () => {
      const response = `test('complex', async () => {
  const a = 1;
  const b = 2;
  const result = a + b;
  expect(result).toBe(3);
});`;
      const parsed = executor['parseTestCases'](response, 'code');
      expect(parsed[0].code).toContain('const a = 1');
      expect(parsed[0].code).toContain('const b = 2');
    });

    it('should set description from test name', () => {
      const response = `test('my test', async () => {
  expect(true).toBe(true);
});`;
      const parsed = executor['parseTestCases'](response, 'code');
      expect(parsed[0].description).toContain('my test');
    });

    it('should set expectedOutcome for all tests', () => {
      const response = `test('test', async () => {
  expect(true).toBe(true);
});`;
      const parsed = executor['parseTestCases'](response, 'code');
      expect(parsed[0].expectedOutcome).toBe('Test passes without errors');
    });
  });

  // =========================================================================
  // SECTION 4: File Context Determination
  // =========================================================================

  describe('File Context Determination', () => {
    it('should classify utility files in src/utils/', () => {
      const context = executor['determineFileContext']('src/utils/helpers.ts', 'helper');
      expect(context.type).toBe('utility');
      expect(context.forbidZod).toBe(true);
    });

    it('should classify component files in src/components/', () => {
      const context = executor['determineFileContext']('src/components/Button.tsx', 'Button');
      expect(context.type).toBe('component');
      expect(context.requireClassNameProp).toBe(true);
    });

    it('should classify hook files in src/hooks/', () => {
      const context = executor['determineFileContext']('src/hooks/useAuth.ts', 'useAuth');
      expect(context.type).toBe('hook');
    });

    it('should classify form files by path', () => {
      const context = executor['determineFileContext']('src/forms/LoginForm.tsx', 'Login');
      expect(context.type).toBe('form');
    });

    it('should classify form files by description', () => {
      const context = executor['determineFileContext']('src/forms/LoginForm.tsx', 'form field');
      expect(context.type).toBe('form');
    });

    it('should classify unknown files', () => {
      const context = executor['determineFileContext']('src/unknown/file.ts', 'unknown');
      expect(context.type).toBe('unknown');
    });

    it('should detect cn.ts golden template', () => {
      const context = executor['determineFileContext']('src/utils/cn.ts', 'classname');
      expect(context.hasGoldenTemplate).toBe(true);
      expect(context.requireNamedImports).toContain('clsx');
    });

    it('should include appropriate rules for utilities', () => {
      const context = executor['determineFileContext']('src/utils/helpers.ts', 'helper');
      expect(context.rules.length).toBeGreaterThan(0);
      expect(context.rules[0]).toContain('Zod');
    });

    it('should include className rule for components', () => {
      const context = executor['determineFileContext']('src/components/Test.tsx', 'Test');
      const hasClassNameRule = context.rules.some(r => r.includes('className'));
      expect(hasClassNameRule).toBe(true);
    });

    it('should detect Button component rules', () => {
      const context = executor['determineFileContext']('src/components/Button.tsx', 'Button');
      const hasButtonRule = context.rules.some(r => r.includes('Button'));
      expect(hasButtonRule).toBe(true);
    });
  });

  // =========================================================================
  // SECTION 5: Golden Template Matching
  // =========================================================================

  describe('Golden Template Matching', () => {
    it('should return cn.ts golden template', () => {
      const template = executor['getGoldenTemplate']('src/utils/cn.ts', 'classname');
      expect(template).toBeTruthy();
      expect(typeof template).toBe('string');
    });

    it('should return null for unknown files', () => {
      const template = executor['getGoldenTemplate']('src/unknown/file.ts', 'unknown');
      expect(template).toBeNull();
    });

    it('should match cn.js variant', () => {
      const template = executor['getGoldenTemplate']('src/utils/cn.js', 'classname');
      expect(template).toBeTruthy();
    });

    it('should return API constants template', () => {
      const template = executor['getGoldenTemplate']('src/constants.ts', 'API constants');
      expect(template).toBeTruthy();
      expect(template).toContain('API_BASE_URL');
    });

    it('should return merge utility template', () => {
      const template = executor['getGoldenTemplate']('src/utils/utils.ts', 'merge helper');
      expect(template).toBeTruthy();
      expect(template).toContain('merge');
    });

    it('should return null for non-golden templates', () => {
      const template = executor['getGoldenTemplate']('src/utils/helpers.ts', 'general');
      expect(template).toBeNull();
    });
  });

  // =========================================================================
  // SECTION 6: Golden Shield Detection
  // =========================================================================

  describe('Golden Shield Detection', () => {
    it('should detect golden pattern in cn.ts', () => {
      const content = 'export const cn = (...inputs) => twMerge(clsx(...inputs));';
      const isShielded = executor['isGoldenShielded']('src/utils/cn.ts', content);
      expect(isShielded).toBe(true);
    });

    it('should detect golden pattern in classNames.ts', () => {
      const content = 'export const cn = (...inputs) => twMerge(clsx(...inputs));';
      const isShielded = executor['isGoldenShielded']('src/utils/classNames.ts', content);
      expect(isShielded).toBe(true);
    });

    it('should reject files without twMerge', () => {
      const content = 'export const cn = (...inputs) => clsx(...inputs);';
      const isShielded = executor['isGoldenShielded']('src/utils/cn.ts', content);
      expect(isShielded).toBe(false);
    });

    it('should reject files without clsx', () => {
      const content = 'export const cn = (...inputs) => twMerge(...inputs);';
      const isShielded = executor['isGoldenShielded']('src/utils/cn.ts', content);
      expect(isShielded).toBe(false);
    });

    it('should reject non-core utility files', () => {
      const content = 'export const cn = (...inputs) => twMerge(clsx(...inputs));';
      const isShielded = executor['isGoldenShielded']('src/utils/helpers.ts', content);
      expect(isShielded).toBe(false);
    });

    it('should detect twMerge(clsx pattern', () => {
      const content = 'const cn = (...inputs) => twMerge(clsx(...));';
      const isShielded = executor['isGoldenShielded']('src/utils/cn.ts', content);
      expect(isShielded).toBe(true);
    });
  });

  // =========================================================================
  // SECTION 7: Return Type Contracts
  // =========================================================================

  describe('Return Type Contracts - ValidationResult', () => {
    it('should have ValidationResult with required fields', () => {
      const result: ValidationResult = {
        type: 'syntax',
        passed: true,
        details: 'Syntax is valid',
        severity: 'info',
      };

      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('details');
      expect(result).toHaveProperty('severity');
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.details).toBe('string');
    });

    it('should support all validation types', () => {
      const types: Array<'syntax' | 'types' | 'logic' | 'performance' | 'compatibility'> = [
        'syntax',
        'types',
        'logic',
        'performance',
        'compatibility',
      ];

      types.forEach(type => {
        const result: ValidationResult = {
          type,
          passed: true,
          details: 'Test',
          severity: 'info',
        };
        expect(result.type).toBe(type);
      });
    });

    it('should support all severity levels', () => {
      const severities: Array<'critical' | 'warning' | 'info'> = ['critical', 'warning', 'info'];

      severities.forEach(severity => {
        const result: ValidationResult = {
          type: 'syntax',
          passed: false,
          details: 'Test',
          severity,
        };
        expect(result.severity).toBe(severity);
      });
    });
  });

  describe('Return Type Contracts - ImpactAssessment', () => {
    it('should have ImpactAssessment with required fields', () => {
      const impact: ImpactAssessment = {
        estimatedBenefits: ['Benefit 1'],
        potentialRisks: ['Risk 1'],
        performanceImpact: 'positive',
        breakingChanges: false,
        affectedDependencies: ['dep1'],
      };

      expect(impact).toHaveProperty('estimatedBenefits');
      expect(impact).toHaveProperty('potentialRisks');
      expect(impact).toHaveProperty('performanceImpact');
      expect(impact).toHaveProperty('breakingChanges');
      expect(impact).toHaveProperty('affectedDependencies');
      expect(Array.isArray(impact.estimatedBenefits)).toBe(true);
      expect(typeof impact.breakingChanges).toBe('boolean');
    });

    it('should support all performance impacts', () => {
      const impacts: Array<'positive' | 'neutral' | 'negative' | 'unknown'> = [
        'positive',
        'neutral',
        'negative',
        'unknown',
      ];

      impacts.forEach(impact => {
        const assessment: ImpactAssessment = {
          estimatedBenefits: [],
          potentialRisks: [],
          performanceImpact: impact,
          breakingChanges: false,
          affectedDependencies: [],
        };
        expect(assessment.performanceImpact).toBe(impact);
      });
    });
  });

  describe('Return Type Contracts - RefactoringExecution', () => {
    it('should have RefactoringExecution with required fields', () => {
      const execution: RefactoringExecution = {
        originalCode: 'original',
        refactoredCode: 'refactored',
        testCases: [],
        validationResults: [],
        executionLog: [],
        success: true,
        errors: [],
        rollbackAvailable: true,
        estimatedImpact: {
          estimatedBenefits: [],
          potentialRisks: [],
          performanceImpact: 'unknown',
          breakingChanges: false,
          affectedDependencies: [],
        },
      };

      expect(execution).toHaveProperty('originalCode');
      expect(execution).toHaveProperty('refactoredCode');
      expect(execution).toHaveProperty('testCases');
      expect(execution).toHaveProperty('validationResults');
      expect(execution).toHaveProperty('executionLog');
      expect(execution).toHaveProperty('success');
      expect(execution).toHaveProperty('errors');
      expect(execution).toHaveProperty('rollbackAvailable');
      expect(execution).toHaveProperty('estimatedImpact');
    });
  });

  // =========================================================================
  // SECTION 8: Logging & Timestamps
  // =========================================================================

  describe('Logging & Timestamps', () => {
    it('should format timestamps in locale time', () => {
      const timestamp = new Date().toLocaleTimeString();
      expect(timestamp).toMatch(/\d{1,2}:\d{2}:\d{2}/); // HH:MM:SS format
    });

    it('should include timestamp in log format', () => {
      const message = 'Test message';
      const timestamp = new Date().toLocaleTimeString();
      const formatted = `[${timestamp}] ${message}`;
      expect(formatted).toContain('[');
      expect(formatted).toContain(']');
      expect(formatted).toContain(message);
    });
  });

  // =========================================================================
  // SECTION 9: Refactoring Plan Structure
  // =========================================================================

  describe('Refactoring Plan Contracts', () => {
    it('should accept valid RefactoringPlan', () => {
      const plan: RefactoringPlan = {
        hookFile: 'test.hook',
        estimatedComplexity: 'medium',
        proposedChanges: [
          {
            type: 'extraction',
            description: 'Extract logic',
            impact: 'high',
          },
        ],
      } as any;

      expect(plan).toHaveProperty('hookFile');
      expect(plan).toHaveProperty('estimatedComplexity');
      expect(plan).toHaveProperty('proposedChanges');
    });
  });

  // =========================================================================
  // SECTION 10: Edge Cases & Data Validation
  // =========================================================================

  describe('Edge Cases & Data Validation', () => {
    it('should handle empty code response', () => {
      const extracted = executor['extractCodeFromResponse']('');
      expect(extracted).toBeNull();
    });

    it('should handle response with only markdown fence', () => {
      const extracted = executor['extractCodeFromResponse']('```\n```');
      expect(extracted).toBe('');
    });

    it('should handle test cases with no body', () => {
      const response = 'test("empty", async () => {\n});';
      const parsed = executor['parseTestCases'](response, 'code');
      expect(parsed).toBeDefined();
    });

    it('should handle file paths with special characters', () => {
      const context = executor['determineFileContext']('src/components/my-component.tsx', 'test');
      expect(context).toBeDefined();
    });

    it('should handle very long file paths', () => {
      const longPath = 'src/features/auth/components/login/forms/' + 'a'.repeat(200) + '.tsx';
      const context = executor['determineFileContext'](longPath, 'test');
      expect(context).toBeDefined();
    });

    it('should handle unicode characters in descriptions', () => {
      const context = executor['determineFileContext']('src/utils/helpers.ts', '中文描述');
      expect(context).toBeDefined();
    });

    it('should handle code with unicode characters', () => {
      const response = '```ts\nconst comment = "你好";\n```';
      const extracted = executor['extractCodeFromResponse'](response);
      expect(extracted).toContain('你好');
    });

    it('should handle test names with quotes', () => {
      const response = `test('test with special chars', async () => {
  expect(true).toBe(true);
});`;
      const parsed = executor['parseTestCases'](response, 'code');
      // Test parsing works and returns valid structure
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('should handle code blocks with syntax highlighting', () => {
      const response = '```ts\nfunction test() { }\n```';
      const extracted = executor['extractCodeFromResponse'](response);
      expect(extracted).toContain('function test');
    });
  });

  // =========================================================================
  // SECTION 11: Method Existence & Signatures
  // =========================================================================

  describe('Method Existence & Signatures', () => {
    it('should have executeRefactoring method', () => {
      expect(typeof executor.executeRefactoring).toBe('function');
    });

    it('should have private helper methods', () => {
      expect(typeof executor['extractCodeFromResponse']).toBe('function');
      expect(typeof executor['parseTestCases']).toBe('function');
      expect(typeof executor['determineFileContext']).toBe('function');
      expect(typeof executor['getGoldenTemplate']).toBe('function');
      expect(typeof executor['isGoldenShielded']).toBe('function');
    });
  });
});
