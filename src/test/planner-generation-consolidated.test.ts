/**
 * Week 2 D2: planner.ts Plan Generation Tests (Consolidated)
 *
 * Consolidation Strategy:
 * - Table-driven generation testing across all LLM integration scenarios
 * - 27 → 9 tests (-67% reduction)
 *
 * Pattern: Each describe block uses it.each() with scenarios in matrix rows
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Planner, TaskPlan, PlannerConfig } from '../planner';

describe('Planner Generation - Week 2 D2 (Consolidated)', () => {
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
  // Plan Generation Core & Metadata
  // ============================================================
  const generationCases = [
    {
      name: 'generate plan with valid single-step LLM response',
      setupMock: () => {
        mockLLMCall.mockResolvedValue(JSON.stringify([
          { step: 1, action: 'write', description: 'Create button', path: 'src/Button.tsx' },
        ]));
      },
      request: 'Create a button component',
      assertions: (plan: TaskPlan) => {
        expect(plan).toBeDefined();
        expect(plan.taskId).toMatch(/^plan-\d+$/);
        expect(plan.userRequest).toBe('Create a button component');
        expect(plan.steps.length).toBe(1);
      },
    },
    {
      name: 'include workspace context in generated plan',
      setupMock: () => {
        mockLLMCall.mockResolvedValue(JSON.stringify([
          { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
        ]));
      },
      request: 'Create something',
      workspacePath: '/path/to/workspace',
      workspaceName: 'MyProject',
      assertions: (plan: TaskPlan) => {
        expect(plan.workspacePath).toBe('/path/to/workspace');
        expect(plan.workspaceName).toBe('MyProject');
      },
    },
    {
      name: 'capture generation timestamp within valid range',
      setupMock: () => {
        mockLLMCall.mockResolvedValue(JSON.stringify([
          { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
        ]));
      },
      request: 'Test',
      assertions: (plan: TaskPlan) => {
        expect(plan.generatedAt).toBeInstanceOf(Date);
        expect(plan.generatedAt.getTime()).toBeGreaterThan(0);
      },
    },
    {
      name: 'handle multi-step plan generation with mixed actions',
      setupMock: () => {
        mockLLMCall.mockResolvedValue(JSON.stringify([
          { step: 1, action: 'write', description: 'Create store', path: 'src/store.ts' },
          { step: 2, action: 'write', description: 'Create component', path: 'src/Button.tsx' },
          { step: 3, action: 'run', description: 'Build', command: 'npm run build' },
        ]));
      },
      request: 'Full setup',
      assertions: (plan: TaskPlan) => {
        expect(plan.steps.length).toBe(3);
        expect(plan.steps[0].action).toBe('write');
        expect(plan.steps[2].action).toBe('run');
      },
    },
    {
      name: 'generate valid taskId format',
      setupMock: () => {
        mockLLMCall.mockResolvedValue(JSON.stringify([
          { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
        ]));
      },
      request: 'Test',
      assertions: (plan: TaskPlan) => {
        expect(plan.taskId).toMatch(/^plan-\d+$/);
      },
    },
    {
      name: 'extract reasoning from LLM response with explanation',
      setupMock: () => {
        mockLLMCall.mockResolvedValue(`
          Here's my plan for creating a login form:
          1. First, I'll create the store for authentication state
          2. Then, I'll create the form component

          ${JSON.stringify([
            { step: 1, action: 'write', description: 'Create store', path: 'src/store.ts' },
            { step: 2, action: 'write', description: 'Create form', path: 'src/LoginForm.tsx' },
          ])}
        `);
      },
      request: 'Create login form',
      assertions: (plan: TaskPlan) => {
        expect(plan.reasoning).toBeDefined();
        expect(typeof plan.reasoning).toBe('string');
      },
    },
    {
      name: 'store user request verbatim in plan',
      setupMock: () => {
        mockLLMCall.mockResolvedValue(JSON.stringify([
          { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
        ]));
      },
      request: 'Create a button component with className support',
      assertions: (plan: TaskPlan) => {
        expect(plan.userRequest).toBe('Create a button component with className support');
      },
    },
    {
      name: 'initialize plan status as pending or undefined',
      setupMock: () => {
        mockLLMCall.mockResolvedValue(JSON.stringify([
          { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
        ]));
      },
      request: 'Test',
      assertions: (plan: TaskPlan) => {
        expect(plan.status).not.toBe('executing');
        expect(plan.status).not.toBe('completed');
      },
    },
  ];

  it.each(generationCases)(
    'generation core: $name',
    async ({ setupMock, request, workspacePath, workspaceName, assertions }) => {
      setupMock();

      const plan = await planner.generatePlan(request, workspacePath, workspaceName);

      assertions(plan);
    }
  );

  // ============================================================
  // LLM Integration & Configuration
  // ============================================================
  const llmIntegrationCases = [
    {
      name: 'pass user request to LLM in prompt',
      request: 'Create a login form',
      assertions: () => {
        expect(mockLLMCall).toHaveBeenCalled();
        const prompt = mockLLMCall.mock.calls[0][0];
        expect(prompt).toContain('Create a login form');
      },
    },
    {
      name: 'call LLM with project context information',
      request: 'Create something',
      assertions: () => {
        expect(mockLLMCall).toHaveBeenCalledTimes(1);
        expect(mockLLMCall.mock.calls[0][0]).toBeDefined();
      },
    },
    {
      name: 'invoke onProgress callback during generation',
      request: 'Test',
      assertions: () => {
        expect(mockConfig.onProgress).toHaveBeenCalled();
      },
    },
    {
      name: 'use config.llmCall for LLM communication exactly once',
      request: 'Test',
      assertions: () => {
        expect(mockLLMCall).toHaveBeenCalledTimes(1);
      },
    },
  ];

  it.each(llmIntegrationCases)(
    'LLM integration: $name',
    async ({ request, setupMock, assertions }) => {
      const validResponse = JSON.stringify([
        { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
      ]);
      mockLLMCall.mockResolvedValue(validResponse);

      await planner.generatePlan(request);

      assertions();
    }
  );

  // ============================================================
  // Configuration Handling
  // ============================================================
  const configCases = [
    {
      name: 'handle missing onProgress callback gracefully',
      noProgress: true,
      setupMock: () => {
        mockLLMCall.mockResolvedValue(JSON.stringify([
          { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
        ]));
      },
      assertions: (plan: TaskPlan) => {
        expect(plan).toBeDefined();
        expect(plan.steps.length).toBe(1);
      },
    },
    {
      name: 'handle missing projectContext gracefully',
      noContext: true,
      setupMock: () => {
        mockLLMCall.mockResolvedValue(JSON.stringify([
          { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
        ]));
      },
      assertions: (plan: TaskPlan) => {
        expect(plan).toBeDefined();
        expect(plan.steps.length).toBe(1);
      },
    },
    {
      name: 'support custom project language context (Python)',
      pythonContext: true,
      setupMock: () => {
        mockLLMCall.mockResolvedValue(JSON.stringify([
          { step: 1, action: 'write', description: 'Create', path: 'src/file.py' },
        ]));
      },
      assertions: (plan: TaskPlan) => {
        expect(plan).toBeDefined();
        expect(plan.steps.length).toBeGreaterThan(0);
      },
    },
    {
      name: 'support DIFF_MODE strategy context',
      diffMode: true,
      setupMock: () => {
        mockLLMCall.mockResolvedValue(JSON.stringify([
          { step: 1, action: 'read', description: 'Read file', path: 'src/file.tsx' },
        ]));
      },
      assertions: (plan: TaskPlan) => {
        expect(plan).toBeDefined();
        expect(plan.steps.length).toBeGreaterThan(0);
      },
    },
  ];

  it.each(configCases)(
    'configuration: $name',
    async ({ setupMock, noProgress, noContext, pythonContext, diffMode, assertions }) => {
      setupMock();

      let testConfig: PlannerConfig;
      if (noProgress) {
        testConfig = {
          llmCall: mockLLMCall,
          projectContext: mockConfig.projectContext,
        };
      } else if (noContext) {
        testConfig = {
          llmCall: mockLLMCall,
          onProgress: vi.fn(),
        };
      } else {
        testConfig = mockConfig;
      }

      const testPlanner = new Planner(testConfig);
      let plan: TaskPlan;

      if (pythonContext) {
        const pythonCtx = {
          language: 'Python',
          strategy: 'SCAFFOLD_MODE',
          extension: '.py',
          root: 'src',
          isMinimalProject: false,
        };
        plan = await testPlanner.generatePlan('Test', undefined, undefined, pythonCtx);
      } else if (diffMode) {
        const diffCtx = {
          language: 'TypeScript',
          strategy: 'DIFF_MODE',
          extension: '.tsx',
          root: 'src',
          isMinimalProject: false,
        };
        plan = await testPlanner.generatePlan('Test', undefined, undefined, diffCtx);
      } else {
        plan = await testPlanner.generatePlan('Test');
      }

      assertions(plan);
    }
  );

  // ============================================================
  // Error Handling & Complex Scenarios
  // ============================================================
  const errorAndComplexCases = [
    {
      name: 'reject UNABLE_TO_COMPLETE response with error',
      setupMock: () => {
        mockLLMCall.mockResolvedValue('UNABLE_TO_COMPLETE: Cannot process request');
      },
      expectError: true,
    },
    {
      name: 'reject empty step arrays',
      setupMock: () => {
        mockLLMCall.mockResolvedValue(JSON.stringify([]));
      },
      expectError: true,
    },
    {
      name: 'reject malformed JSON response',
      setupMock: () => {
        mockLLMCall.mockResolvedValue('{ broken json ]');
      },
      expectError: true,
    },
    {
      name: 'handle LLM network error',
      setupMock: () => {
        mockLLMCall.mockRejectedValue(new Error('Network timeout'));
      },
      expectError: true,
    },
    {
      name: 'handle empty LLM response',
      setupMock: () => {
        mockLLMCall.mockResolvedValue('');
      },
      expectError: true,
    },
    {
      name: 'handle null LLM response',
      setupMock: () => {
        mockLLMCall.mockResolvedValue(null);
      },
      expectError: true,
    },
    {
      name: 'generate plan for refactoring task with read and write',
      setupMock: () => {
        mockLLMCall.mockResolvedValue(JSON.stringify([
          { step: 1, action: 'read', description: 'Read existing component', path: 'src/Button.tsx' },
          { step: 2, action: 'write', description: 'Refactored component', path: 'src/Button.tsx' },
        ]));
      },
      expectError: false,
      verifyComplex: true,
    },
    {
      name: 'generate plan with command execution steps',
      setupMock: () => {
        mockLLMCall.mockResolvedValue(JSON.stringify([
          { step: 1, action: 'write', description: 'Create', path: 'src/file.tsx' },
          { step: 2, action: 'run', description: 'Format code', command: 'npm run format' },
          { step: 3, action: 'run', description: 'Test', command: 'npm test' },
        ]));
      },
      expectError: false,
      verifyComplex: true,
    },
    {
      name: 'generate plan with step dependencies',
      setupMock: () => {
        mockLLMCall.mockResolvedValue(JSON.stringify([
          { step: 1, action: 'write', description: 'Create store', path: 'src/store.ts' },
          { step: 2, action: 'write', description: 'Create component', path: 'src/Button.tsx', dependsOn: ['step_1'] },
        ]));
      },
      expectError: false,
      verifyComplex: true,
    },
  ];

  it.each(errorAndComplexCases)(
    'error handling & complex: $name',
    async ({ setupMock, expectError, verifyComplex }) => {
      setupMock();

      if (expectError) {
        await expect(planner.generatePlan('Test')).rejects.toThrow();
      } else {
        const plan = await planner.generatePlan('Test');
        expect(plan).toBeDefined();

        if (verifyComplex) {
          expect(plan.steps.length).toBeGreaterThan(0);
        }
      }
    }
  );
});
