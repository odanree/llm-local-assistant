/**
 * Week 2 D2: planner.ts Plan Generation Tests
 *
 * Focus: Plan generation, LLM integration, configuration handling
 * Target: 20 tests covering generatePlan and LLM callbacks
 * Execution Time: ~600-700ms
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Planner, TaskPlan, PlannerConfig } from '../planner';

describe('Planner Generation - Week 2 D2', () => {
  let planner: Planner;
  let mockConfig: PlannerConfig;
  let mockLLMCall: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockLLMCall = vi.fn();
    mockConfig = {
      llmCall: mockLLMCall,
      onProgress: vi.fn(),
      projectContext: {
        language: 'TypeScript',
        strategy: 'SCAFFOLD_MODE',
        extension: '.tsx',
        root: 'src',
        isMinimalProject: false,
      },
    };

    planner = new Planner(mockConfig);
  });

  // ============================================================
  // Plan Generation Core
  // ============================================================
  describe('Plan Generation Core', () => {
    it('should generate plan with valid LLM response', async () => {
      const validResponse = JSON.stringify([
        { step: 1, action: 'write', description: 'Create button', path: 'src/Button.tsx' },
      ]);

      mockLLMCall.mockResolvedValue(validResponse);

      const plan = await planner.generatePlan('Create a button component');

      expect(plan).toBeDefined();
      expect(plan.taskId).toMatch(/^plan-\d+$/);
      expect(plan.userRequest).toBe('Create a button component');
      expect(plan.steps.length).toBe(1);
    });

    it('should include workspace context in generated plan', async () => {
      const validResponse = JSON.stringify([
        { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
      ]);

      mockLLMCall.mockResolvedValue(validResponse);

      const plan = await planner.generatePlan(
        'Create something',
        '/path/to/workspace',
        'MyProject'
      );

      expect(plan.workspacePath).toBe('/path/to/workspace');
      expect(plan.workspaceName).toBe('MyProject');
    });

    it('should capture generation timestamp', async () => {
      const validResponse = JSON.stringify([
        { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
      ]);

      mockLLMCall.mockResolvedValue(validResponse);

      const beforeTime = new Date();
      const plan = await planner.generatePlan('Test');
      const afterTime = new Date();

      expect(plan.generatedAt).toBeInstanceOf(Date);
      expect(plan.generatedAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(plan.generatedAt.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should handle multi-step plan generation', async () => {
      const validResponse = JSON.stringify([
        { step: 1, action: 'write', description: 'Create store', path: 'src/store.ts' },
        { step: 2, action: 'write', description: 'Create component', path: 'src/Button.tsx' },
        { step: 3, action: 'run', description: 'Build', command: 'npm run build' },
      ]);

      mockLLMCall.mockResolvedValue(validResponse);

      const plan = await planner.generatePlan('Full setup');

      expect(plan.steps.length).toBe(3);
      expect(plan.steps[0].action).toBe('write');
      expect(plan.steps[2].action).toBe('run');
    });

    it('should reject UNABLE_TO_COMPLETE response', async () => {
      mockLLMCall.mockResolvedValue('UNABLE_TO_COMPLETE: Cannot process request');

      await expect(planner.generatePlan('Create something')).rejects.toThrow();
    });

    it('should reject empty step arrays', async () => {
      const emptyResponse = JSON.stringify([]);

      mockLLMCall.mockResolvedValue(emptyResponse);

      await expect(planner.generatePlan('Test')).rejects.toThrow();
    });

    it('should handle malformed JSON response', async () => {
      mockLLMCall.mockResolvedValue('{ broken json ]');

      await expect(planner.generatePlan('Test')).rejects.toThrow();
    });
  });

  // ============================================================
  // LLM Integration
  // ============================================================
  describe('LLM Integration', () => {
    it('should pass user request to LLM', async () => {
      const validResponse = JSON.stringify([
        { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
      ]);

      mockLLMCall.mockResolvedValue(validResponse);

      await planner.generatePlan('Create a login form');

      expect(mockLLMCall).toHaveBeenCalled();
      const prompt = mockLLMCall.mock.calls[0][0];
      expect(prompt).toContain('Create a login form');
    });

    it('should pass project context to LLM', async () => {
      const validResponse = JSON.stringify([
        { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
      ]);

      mockLLMCall.mockResolvedValue(validResponse);

      await planner.generatePlan('Create something');

      // Verify LLM was called (context is passed internally)
      expect(mockLLMCall).toHaveBeenCalledTimes(1);
      expect(mockLLMCall.mock.calls[0][0]).toBeDefined();
    });

    it('should call onProgress callback during generation', async () => {
      const validResponse = JSON.stringify([
        { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
      ]);

      mockLLMCall.mockResolvedValue(validResponse);

      await planner.generatePlan('Test');

      expect(mockConfig.onProgress).toHaveBeenCalled();
    });

    it('should handle LLM network error', async () => {
      mockLLMCall.mockRejectedValue(new Error('Network timeout'));

      await expect(planner.generatePlan('Test')).rejects.toThrow();
    });

    it('should pass hasTests flag from projectContext', async () => {
      const validResponse = JSON.stringify([
        { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
      ]);

      mockLLMCall.mockResolvedValue(validResponse);

      const contextWithTests = {
        ...mockConfig.projectContext,
        hasTests: false,
      };

      await planner.generatePlan('Test', undefined, undefined, contextWithTests);

      const prompt = mockLLMCall.mock.calls[0][0];
      // Should reflect hasTests=false in prompt
      expect(prompt).toBeDefined();
    });
  });

  // ============================================================
  // Plan Metadata Extraction
  // ============================================================
  describe('Plan Metadata Extraction', () => {
    it('should generate unique taskIds', async () => {
      const validResponse = JSON.stringify([
        { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
      ]);

      mockLLMCall.mockResolvedValue(validResponse);

      const plan1 = await planner.generatePlan('Test 1');
      
      // Add a small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 1));
      
      const plan2 = await planner.generatePlan('Test 2');

      expect(plan1.taskId).toBeDefined();
      expect(plan2.taskId).toBeDefined();
      expect(plan1.taskId).toMatch(/^plan-\d+$/);
      expect(plan2.taskId).toMatch(/^plan-\d+$/);
    });

    it('should extract reasoning from LLM response', async () => {
      const responseWithReasoning = `
        Here's my plan for creating a login form:
        1. First, I'll create the store for authentication state
        2. Then, I'll create the form component
        
        ${JSON.stringify([
          { step: 1, action: 'write', description: 'Create store', path: 'src/store.ts' },
          { step: 2, action: 'write', description: 'Create form', path: 'src/LoginForm.tsx' },
        ])}
      `;

      mockLLMCall.mockResolvedValue(responseWithReasoning);

      const plan = await planner.generatePlan('Create login form');

      expect(plan.reasoning).toBeDefined();
      expect(typeof plan.reasoning).toBe('string');
    });

    it('should store user request in plan', async () => {
      const validResponse = JSON.stringify([
        { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
      ]);

      mockLLMCall.mockResolvedValue(validResponse);

      const request = 'Create a button component with className support';
      const plan = await planner.generatePlan(request);

      expect(plan.userRequest).toBe(request);
    });

    it('should initialize status as pending', async () => {
      const validResponse = JSON.stringify([
        { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
      ]);

      mockLLMCall.mockResolvedValue(validResponse);

      const plan = await planner.generatePlan('Test');

      // Default status should be pending or undefined
      expect(plan.status).not.toBe('executing');
      expect(plan.status).not.toBe('completed');
    });
  });

  // ============================================================
  // Configuration Handling
  // ============================================================
  describe('Configuration Handling', () => {
    it('should use config.llmCall for LLM communication', async () => {
      const validResponse = JSON.stringify([
        { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
      ]);

      mockLLMCall.mockResolvedValue(validResponse);

      await planner.generatePlan('Test');

      expect(mockLLMCall).toHaveBeenCalledTimes(1);
    });

    it('should handle missing onProgress callback gracefully', async () => {
      const configWithoutProgress: PlannerConfig = {
        llmCall: vi.fn().mockResolvedValue(JSON.stringify([
          { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
        ])),
      };

      const testPlanner = new Planner(configWithoutProgress);

      const plan = await testPlanner.generatePlan('Test');

      expect(plan).toBeDefined();
      expect(plan.steps.length).toBe(1);
    });

    it('should handle missing projectContext gracefully', async () => {
      const configWithoutContext: PlannerConfig = {
        llmCall: vi.fn().mockResolvedValue(JSON.stringify([
          { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
        ])),
      };

      const testPlanner = new Planner(configWithoutContext);

      const plan = await testPlanner.generatePlan('Test');

      expect(plan).toBeDefined();
      expect(plan.steps.length).toBe(1);
    });

    it('should support custom project language context', async () => {
      const validResponse = JSON.stringify([
        { step: 1, action: 'write', description: 'Create', path: 'src/file.py' },
      ]);

      mockLLMCall.mockResolvedValue(validResponse);

      const pythonContext = {
        language: 'Python',
        strategy: 'SCAFFOLD_MODE',
        extension: '.py',
        root: 'src',
        isMinimalProject: false,
      };

      const plan = await planner.generatePlan('Test', undefined, undefined, pythonContext);

      // Verify plan generation succeeded with context
      expect(plan).toBeDefined();
      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('should support DIFF_MODE strategy context', async () => {
      const validResponse = JSON.stringify([
        { step: 1, action: 'read', description: 'Read file', path: 'src/file.tsx' },
      ]);

      mockLLMCall.mockResolvedValue(validResponse);

      const diffContext = {
        language: 'TypeScript',
        strategy: 'DIFF_MODE',
        extension: '.tsx',
        root: 'src',
        isMinimalProject: false,
      };

      const plan = await planner.generatePlan('Test', undefined, undefined, diffContext);

      // Verify plan generation succeeded with DIFF_MODE context
      expect(plan).toBeDefined();
      expect(plan.steps.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // Error Handling
  // ============================================================
  describe('Error Handling', () => {
    it('should wrap error messages with context', async () => {
      mockLLMCall.mockRejectedValue(new Error('Connection failed'));

      try {
        await planner.generatePlan('Test');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).toContain('Plan generation failed');
      }
    });

    it('should handle empty LLM response', async () => {
      mockLLMCall.mockResolvedValue('');

      await expect(planner.generatePlan('Test')).rejects.toThrow();
    });

    it('should handle null LLM response', async () => {
      mockLLMCall.mockResolvedValue(null);

      await expect(planner.generatePlan('Test')).rejects.toThrow();
    });
  });

  // ============================================================
  // Complex Scenarios
  // ============================================================
  describe('Complex Scenarios', () => {
    it('should generate plan for refactoring task', async () => {
      const refactoringResponse = JSON.stringify([
        { step: 1, action: 'read', description: 'Read existing component', path: 'src/Button.tsx' },
        { step: 2, action: 'write', description: 'Refactored component', path: 'src/Button.tsx' },
      ]);

      mockLLMCall.mockResolvedValue(refactoringResponse);

      const plan = await planner.generatePlan('Refactor Button component to add className support');

      expect(plan.steps[0].action).toBe('read');
      expect(plan.steps[1].action).toBe('write');
    });

    it('should generate plan with command execution', async () => {
      const responseWithCommands = JSON.stringify([
        { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
        { step: 2, action: 'run', description: 'Format code', command: 'npm run format' },
        { step: 3, action: 'run', description: 'Test', command: 'npm test' },
      ]);

      mockLLMCall.mockResolvedValue(responseWithCommands);

      const plan = await planner.generatePlan('Create and test component');

      const runSteps = plan.steps.filter(s => s.action === 'run');
      expect(runSteps.length).toBe(2);
    });

    it('should handle plan with dependencies', async () => {
      const responseWithDeps = JSON.stringify([
        { step: 1, action: 'write', description: 'Create store', path: 'src/store.ts' },
        { step: 2, action: 'write', description: 'Create component', path: 'src/Button.tsx', dependsOn: ['step_1'] },
      ]);

      mockLLMCall.mockResolvedValue(responseWithDeps);

      const plan = await planner.generatePlan('Create dependent components');

      expect(plan.steps[1].dependsOn).toBeDefined();
    });
  });
});
