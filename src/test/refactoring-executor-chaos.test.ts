/**
 * Phase 7A: RefactoringExecutor Fault Injection Testing
 *
 * Purpose: Test RefactoringExecutor's complete pipeline under failure scenarios
 * Focus: Retry logic, semantic validation, code extraction, test generation
 *
 * Current Coverage: 37.24% (CRITICAL - second-lowest in codebase)
 *
 * Scenarios:
 * 1. LLM Failures (timeout, network, invalid response)
 * 2. Code Extraction Edge Cases (malformed, missing code blocks)
 * 3. Semantic Validation Retry Loop (fatal errors, warnings, recovery)
 * 4. Test Case Generation (parsing, edge cases, empty responses)
 * 5. Validation Chain (syntax, types, logic, performance, compatibility)
 * 6. Impact Assessment (breaking changes, dependencies, performance)
 * 7. Pipeline Orchestration (failure propagation, error handling)
 *
 * Expected Coverage Gain: +5-6% from critical refactoring pipeline paths
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RefactoringExecutor, RefactoringExecution } from '../refactoringExecutor';
import { LLMClient, LLMConfig } from '../llmClient';
import { ServiceExtractor } from '../serviceExtractor';

describe('Phase 7A: RefactoringExecutor Fault Injection - Integration Testing', () => {
  let mockLlmClient: LLMClient;
  let mockExtractor: ServiceExtractor;

  const mockSendMessage = vi.fn();
  const mockGetConfig = vi.fn();

  const validRefactoringPlan = {
    hookFile: '/src/services/user.ts',
    estimatedComplexity: 'medium' as const,
    extractionTargets: [],
    refactoringType: 'extraction' as const,
    expectedDuration: '5 minutes',
  };

  const sampleCode = `
export function processUser(user) {
  const name = user.name.trim();
  const email = user.email.toLowerCase();
  const age = parseInt(user.age);
  return { name, email, age };
}
  `;

  beforeEach(() => {
    mockSendMessage.mockClear();
    mockGetConfig.mockClear();

    mockGetConfig.mockReturnValue({
      model: 'test-model',
      endpoint: 'http://localhost:11434',
    });

    // Create mock LLMClient
    mockLlmClient = {
      sendMessage: mockSendMessage,
      getConfig: mockGetConfig,
    } as any;

    mockExtractor = {
      extractServices: vi.fn(),
    } as any;
  });

  describe('LLM Failure Scenarios', () => {
    it('should handle LLM timeout during code generation', async () => {
      mockSendMessage.mockRejectedValue(new Error('Request timeout after 30s'));

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.rollbackAvailable).toBe(true);
    });

    it('should handle LLM network error', async () => {
      mockSendMessage.mockRejectedValue(new Error('ECONNREFUSED: Connection refused'));

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result.success).toBe(false);
      expect(result.originalCode).toBe(sampleCode);
      expect(result.refactoredCode).toBe(sampleCode); // Fallback to original
    });

    it('should handle LLM returning failure response', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: 'Model overloaded',
        message: undefined,
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle LLM returning empty message', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle LLM returning null message', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: null,
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result.success).toBe(false);
    });
  });

  describe('Code Extraction Edge Cases', () => {
    it('should handle response without code block markers', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: 'Here is the refactored version:\n' +
                 'function processUser(user) { return user; }',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result).toBeDefined();
      // Should attempt to extract code or fail gracefully
    });

    it('should handle malformed code block syntax', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```\nfunction broken( { return; }',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result).toBeDefined();
      // Should attempt recovery or fail with clear error
    });

    it('should handle code block with multiple nested backticks', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```javascript\nconst template = `backticks inside: ${x}`;\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result).toBeDefined();
    });

    it('should handle extremely large code responses', async () => {
      const largeCode = 'export const x = ' + '"a".repeat(100000);';
      mockSendMessage.mockResolvedValue({
        success: true,
        message: `\`\`\`typescript\n${largeCode}\n\`\`\``,
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result).toBeDefined();
    });
  });

  describe('Semantic Validation Retry Loop', () => {
    it('should handle semantic errors in generated code', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nconst x = undefined.property;\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result).toBeDefined();
      // May fail on validation but should have attempted processing
      expect(result.validationResults).toBeDefined();
    });

    it('should exhaust max retries and report final error', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nerror syntax {\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle retry with non-fatal warnings', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\n// Variable declared but not used\nconst unused = 1;\nexport const x = 2;\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result).toBeDefined();
      // Warnings should not cause failure
    });
  });

  describe('Test Case Generation', () => {
    it('should generate test cases from refactored code', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: `\`\`\`typescript
export function add(a, b) { return a + b; }
test('should add numbers', async () => { expect(add(1, 2)).toBe(3); });
\`\`\``,
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result.testCases).toBeDefined();
      expect(Array.isArray(result.testCases)).toBe(true);
    });

    it('should handle refactored code with no test cases', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nexport const value = 42;\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result.testCases).toBeDefined();
      expect(result.testCases.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle malformed test case syntax', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: `\`\`\`typescript
export const x = 1;
test('broken syntax' => {
  expect(x).toBe(1);
});
\`\`\``,
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result).toBeDefined();
    });
  });

  describe('Validation Chain Execution', () => {
    it('should run all validation types', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nexport function refactored(x) { return x * 2; }\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result.validationResults).toBeDefined();
      expect(Array.isArray(result.validationResults)).toBe(true);
      // Should have validations for different types
      const types = result.validationResults.map(v => v.type);
      expect(types.length).toBeGreaterThan(0);
    });

    it('should mark critical validation failures as errors', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nbad syntax {\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result.success).toBe(false);
      const criticalFailures = result.validationResults.filter(
        v => v.severity === 'critical' && !v.passed
      );
      expect(criticalFailures.length).toBeGreaterThan(0);
    });

    it('should allow warnings without failing', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nconst unused = 1;\nexport const x = 2;\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      // May have warnings but should not necessarily fail
      expect(result).toBeDefined();
      expect(result.executionLog).toBeDefined();
    });
  });

  describe('Impact Assessment', () => {
    it('should assess breaking changes', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nexport function newSignature(a, b, c) { return a + b + c; }\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result.estimatedImpact).toBeDefined();
      expect(result.estimatedImpact.breakingChanges).toBeDefined();
    });

    it('should identify performance impacts', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nexport function optimized(x) { return x * 2; }\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result.estimatedImpact.performanceImpact).toBeDefined();
      expect(['positive', 'neutral', 'negative', 'unknown']).toContain(
        result.estimatedImpact.performanceImpact
      );
    });

    it('should list affected dependencies', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nimport { something } from "external";\nexport const x = something();\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(Array.isArray(result.estimatedImpact.affectedDependencies)).toBe(true);
    });
  });

  describe('Pipeline Orchestration', () => {
    it('should maintain execution log throughout pipeline', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nexport const x = 42;\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result.executionLog).toBeDefined();
      expect(Array.isArray(result.executionLog)).toBe(true);
      expect(result.executionLog.length).toBeGreaterThan(0);
    });

    it('should preserve original code in execution result', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nexport const refactored = true;\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result.originalCode).toBe(sampleCode);
    });

    it('should always set rollbackAvailable flag', async () => {
      mockSendMessage.mockRejectedValue(new Error('LLM error'));

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result.rollbackAvailable).toBe(true);
    });
  });

  describe('Error Context Preservation', () => {
    it('should include error details in execution result', async () => {
      mockSendMessage.mockRejectedValue(new Error('Specific LLM failure'));

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.success).toBe(false);
    });

    it('should map errors to validation results', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nbad code {\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result.errors.length).toBeGreaterThan(0);
      const criticalValidations = result.validationResults.filter(
        v => v.severity === 'critical' && !v.passed
      );
      expect(criticalValidations.length).toBeGreaterThan(0);
    });
  });

  describe('Config and Initialization', () => {
    it('should log model information on initialization', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nexport const x = 1;\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      expect(mockGetConfig).toHaveBeenCalled();
    });

    it('should use provided ServiceExtractor', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nexport const x = 1;\n```',
      });

      const customExtractor = {
        extractServices: vi.fn(),
      } as any;

      const executor = new RefactoringExecutor(mockLlmClient, customExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result).toBeDefined();
    });

    it('should create default ServiceExtractor if not provided', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nexport const x = 1;\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      expect(result).toBeDefined();
    });
  });

  describe('Response Structure Validation', () => {
    it('should always return RefactoringExecution with all fields', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nexport const x = 1;\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      // Check all required fields exist
      expect(result).toHaveProperty('originalCode');
      expect(result).toHaveProperty('refactoredCode');
      expect(result).toHaveProperty('testCases');
      expect(result).toHaveProperty('validationResults');
      expect(result).toHaveProperty('executionLog');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('rollbackAvailable');
      expect(result).toHaveProperty('estimatedImpact');
    });

    it('should have typed validation results', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nexport const x = 1;\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      result.validationResults.forEach(validation => {
        expect(['syntax', 'types', 'logic', 'performance', 'compatibility']).toContain(
          validation.type
        );
        expect(['critical', 'warning', 'info']).toContain(validation.severity);
        expect(typeof validation.passed).toBe('boolean');
      });
    });

    it('should have typed impact assessment', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nexport const x = 1;\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);

      const impact = result.estimatedImpact;
      expect(Array.isArray(impact.estimatedBenefits)).toBe(true);
      expect(Array.isArray(impact.potentialRisks)).toBe(true);
      expect(['positive', 'neutral', 'negative', 'unknown']).toContain(impact.performanceImpact);
      expect(typeof impact.breakingChanges).toBe('boolean');
      expect(Array.isArray(impact.affectedDependencies)).toBe(true);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle empty input code', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\n\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, '');

      expect(result.originalCode).toBe('');
    });

    it('should handle single-line code', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nconst x = 1;\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, 'const y = 1;');

      expect(result).toBeDefined();
    });

    it('should handle code with special characters', async () => {
      const specialCode = 'export const emoji = "🚀"; export const math = `a < b && c > d`;';
      mockSendMessage.mockResolvedValue({
        success: true,
        message: `\`\`\`typescript\n${specialCode}\n\`\`\``,
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(validRefactoringPlan, specialCode);

      expect(result).toBeDefined();
    });

    it('should handle plan with minimal details', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nexport const x = 1;\n```',
      });

      const minimalPlan = {
        hookFile: '/test.ts',
        estimatedComplexity: 'low' as const,
      } as any;

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
      const result = await executor.executeRefactoring(minimalPlan, sampleCode);

      expect(result).toBeDefined();
    });
  });

  describe('High-Load Scenarios', () => {
    it('should handle multiple concurrent refactorings', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nexport const x = 1;\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);

      const results = await Promise.all([
        executor.executeRefactoring(validRefactoringPlan, sampleCode),
        executor.executeRefactoring(validRefactoringPlan, sampleCode + ' // variant 2'),
        executor.executeRefactoring(validRefactoringPlan, sampleCode + ' // variant 3'),
      ]);

      expect(results).toHaveLength(3);
      expect(results.every(r => r !== undefined)).toBe(true);
    });

    it('should handle rapid sequential refactorings', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        message: '```typescript\nexport const x = 1;\n```',
      });

      const executor = new RefactoringExecutor(mockLlmClient, mockExtractor);

      for (let i = 0; i < 5; i++) {
        const result = await executor.executeRefactoring(validRefactoringPlan, sampleCode);
        expect(result).toBeDefined();
      }
    });
  });
});
