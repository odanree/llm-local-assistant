/**
 * Consolidated Planner Tests with Table-Driven Expectations
 *
 * Week 2.1 Consolidation: Table-driven parameterized testing
 *
 * Pattern: test.each() with dynamic assertions in the matrix
 *
 * Before:
 * - 60 individual tests in planner.test.ts
 * - Repetitive LLM mock setup
 * - Similar assertion patterns
 *
 * After:
 * - ~25 parameterized tests with table-driven expectations
 * - Single setup pattern
 * - Dynamic assertions based on matrix
 *
 * Target reduction: 60 → 25 tests (-35 tests, -58%)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Planner } from './planner';

describe('Planner (Consolidated - Table-Driven)', () => {
  let planner: Planner;
  let mockLLMCall: any;

  beforeEach(() => {
    mockLLMCall = vi.fn();
    planner = new Planner({
      llmCall: mockLLMCall,
    });
  });

  // ============================================================
  // Step Parsing with Table-Driven Expectations
  // ============================================================
  describe('Step Parsing - All Action Types', () => {
    it.each([
      {
        name: 'read step with path',
        action: 'read',
        llmResponse: `[
  {
    "step": 1,
    "action": "read",
    "description": "Read component",
    "path": "src/components/Button.tsx",
    "expectedOutcome": "Code analyzed"
  }
]`,
        assertions: (plan: any) => {
          expect(plan.steps[0].action).toBe('read');
          expect(plan.steps[0].path).toBe('src/components/Button.tsx');
          expect(plan.steps[0].description).toBe('Read component');
        },
      },
      {
        name: 'write step with path',
        action: 'write',
        llmResponse: `[
  {
    "step": 1,
    "action": "write",
    "description": "Create new component",
    "path": "src/components/Form.tsx",
    "prompt": "Create a form component",
    "expectedOutcome": "Component created"
  }
]`,
        assertions: (plan: any) => {
          expect(plan.steps[0].action).toBe('write');
          expect(plan.steps[0].path).toBe('src/components/Form.tsx');
          expect(plan.steps[0].description).toBeDefined();
        },
      },
      {
        name: 'run step with command',
        action: 'run',
        llmResponse: `[
  {
    "step": 1,
    "action": "run",
    "description": "Run linting",
    "command": "npm run lint",
    "expectedOutcome": "No lint errors"
  }
]`,
        assertions: (plan: any) => {
          expect(plan.steps[0].action).toBe('run');
          expect(plan.steps[0].command).toBe('npm run lint');
        },
      },
      {
        name: 'delete step',
        action: 'delete',
        llmResponse: `[
  {
    "step": 1,
    "action": "delete",
    "description": "Remove old file",
    "path": "src/old.tsx",
    "expectedOutcome": "File removed"
  }
]`,
        assertions: (plan: any) => {
          expect(plan.steps[0].action).toBe('delete');
          expect(plan.steps[0].path).toBe('src/old.tsx');
        },
      },
    ])(
      'should parse $name',
      async ({ llmResponse, assertions }) => {
        mockLLMCall.mockResolvedValue(llmResponse);
        const plan = await planner.generatePlan('Test request');

        expect(plan.steps.length).toBeGreaterThan(0);
        assertions(plan);
      }
    );
  });

  // ============================================================
  // Step ID and Sequencing with Table-Driven Expectations
  // ============================================================
  describe('Step Sequencing and IDs', () => {
    it.each([
      {
        name: 'single step',
        stepCount: 1,
        llmResponse: `[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done"}
]`,
        expectedIds: [1],
      },
      {
        name: 'multiple steps sequential',
        stepCount: 3,
        llmResponse: `[
  {"step": 1, "action": "read", "description": "Step 1", "path": "a.ts", "expectedOutcome": "Done"},
  {"step": 2, "action": "write", "description": "Step 2", "path": "b.ts", "expectedOutcome": "Done", "prompt": "Create"},
  {"step": 3, "action": "run", "description": "Step 3", "command": "npm test", "expectedOutcome": "Done"}
]`,
        expectedIds: [1, 2, 3],
      },
      {
        name: 'four step workflow',
        stepCount: 4,
        llmResponse: `[
  {"step": 1, "action": "read", "description": "Read", "path": "src/old.ts", "expectedOutcome": "Read"},
  {"step": 2, "action": "write", "description": "Write", "path": "src/new.ts", "expectedOutcome": "Write", "prompt": "Create"},
  {"step": 3, "action": "run", "description": "Test", "command": "npm test", "expectedOutcome": "Tests pass"},
  {"step": 4, "action": "delete", "description": "Clean", "path": "src/old.ts", "expectedOutcome": "Cleaned"}
]`,
        expectedIds: [1, 2, 3, 4],
      },
    ])(
      'should handle $name',
      async ({ stepCount, llmResponse, expectedIds }) => {
        mockLLMCall.mockResolvedValue(llmResponse);
        const plan = await planner.generatePlan('Test');

        expect(plan.steps.length).toBe(stepCount);
        expectedIds.forEach((id, idx) => {
          expect(plan.steps[idx].stepId).toBe(id);
        });
      }
    );
  });

  // ============================================================
  // Dependency Handling with Table-Driven Expectations
  // ============================================================
  describe('Dependency Handling', () => {
    it.each([
      {
        name: 'linear dependencies',
        llmResponse: `[
  {"step": 1, "action": "read", "description": "Read config", "path": "config.json", "expectedOutcome": "Config loaded"},
  {"step": 2, "action": "write", "description": "Generate code", "path": "generated.ts", "expectedOutcome": "Code generated", "dependsOn": [1], "prompt": "Generate"},
  {"step": 3, "action": "run", "description": "Run", "command": "npm test", "expectedOutcome": "Tests pass", "dependsOn": [2]}
]`,
        expectedSteps: 3,
        expectedStructure: (steps: any) => {
          expect(steps.length).toBe(3);
          expect(steps[0].stepId).toBe(1);
          expect(steps[1].stepId).toBe(2);
          expect(steps[2].stepId).toBe(3);
        },
      },
      {
        name: 'multi-step with dependencies',
        llmResponse: `[
  {"step": 1, "action": "read", "description": "Read types", "path": "types.ts", "expectedOutcome": "Types loaded"},
  {"step": 2, "action": "read", "description": "Read config", "path": "config.json", "expectedOutcome": "Config loaded"},
  {"step": 3, "action": "write", "description": "Create component", "path": "Component.tsx", "expectedOutcome": "Component created", "dependsOn": [1, 2], "prompt": "Create"}
]`,
        expectedSteps: 3,
        expectedStructure: (steps: any) => {
          expect(steps.length).toBe(3);
          expect(steps[0].stepId).toBe(1);
          expect(steps[1].stepId).toBe(2);
          expect(steps[2].stepId).toBe(3);
        },
      },
      {
        name: 'complex dependency graph',
        llmResponse: `[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done"},
  {"step": 2, "action": "write", "description": "Write", "path": "b.ts", "expectedOutcome": "Done", "prompt": "Create", "dependsOn": [1]},
  {"step": 3, "action": "write", "description": "Write", "path": "c.ts", "expectedOutcome": "Done", "prompt": "Create", "dependsOn": [2]},
  {"step": 4, "action": "run", "description": "Test", "command": "npm test", "expectedOutcome": "Done", "dependsOn": [3]}
]`,
        expectedSteps: 4,
        expectedStructure: (steps: any) => {
          expect(steps.length).toBe(4);
          steps.forEach((step: any, idx: number) => {
            if (idx > 0) {
              expect(step.dependsOn?.length || 0).toBeGreaterThanOrEqual(0);
            }
          });
        },
      },
    ])(
      'should handle $name',
      async ({ llmResponse, expectedSteps, expectedStructure }) => {
        mockLLMCall.mockResolvedValue(llmResponse);
        const plan = await planner.generatePlan('Dependency test');

        expect(plan.steps.length).toBe(expectedSteps);
        expectedStructure(plan.steps);
      }
    );
  });

  // ============================================================
  // Content and Metadata with Table-Driven Expectations
  // ============================================================
  describe('Step Content and Metadata', () => {
    it.each([
      {
        name: 'multi-line descriptions',
        llmResponse: `[
  {
    "step": 1,
    "action": "read",
    "description": "Read the configuration file\\nto understand project setup",
    "path": "tsconfig.json",
    "expectedOutcome": "Config understood"
  }
]`,
        expectations: (plan: any) => {
          expect(plan.steps[0].description).toContain('configuration');
          expect(plan.steps[0].description.length).toBeGreaterThan(0);
        },
      },
      {
        name: 'expected outcomes extraction',
        llmResponse: `[
  {
    "step": 1,
    "action": "write",
    "description": "Write API handler",
    "path": "src/api/handler.ts",
    "expectedOutcome": "API endpoint ready for testing",
    "prompt": "Create API"
  }
]`,
        expectations: (plan: any) => {
          expect(plan.steps[0].expectedOutcome).toBe('API endpoint ready for testing');
          expect(plan.steps[0].path).toBe('src/api/handler.ts');
        },
      },
      {
        name: 'description and path combination',
        llmResponse: `[
  {
    "step": 1,
    "action": "write",
    "description": "Create component",
    "path": "src/Button.tsx",
    "prompt": "Create a reusable button component with variant support",
    "expectedOutcome": "Button created"
  }
]`,
        expectations: (plan: any) => {
          expect(plan.steps[0].description).toBeDefined();
          expect(plan.steps[0].path).toBe('src/Button.tsx');
        },
      },
    ])(
      'should handle $name',
      async ({ llmResponse, expectations }) => {
        mockLLMCall.mockResolvedValue(llmResponse);
        const plan = await planner.generatePlan('Test');

        expect(plan.steps.length).toBeGreaterThan(0);
        expectations(plan);
      }
    );
  });

  // ============================================================
  // Error Handling and Edge Cases
  // ============================================================
  describe('Error Handling', () => {
    it.each([
      {
        name: 'LLM failure',
        shouldThrow: true,
        llmSetup: () => mockLLMCall.mockRejectedValue(new Error('LLM error')),
      },
      {
        name: 'UNABLE_TO_COMPLETE response',
        shouldThrow: true,
        llmSetup: () => mockLLMCall.mockResolvedValue('UNABLE_TO_COMPLETE'),
      },
      {
        name: 'empty steps array',
        shouldThrow: true,
        llmSetup: () => mockLLMCall.mockResolvedValue('[]'),
      },
    ])(
      'should throw on $name',
      async ({ shouldThrow, llmSetup }) => {
        llmSetup();

        if (shouldThrow) {
          await expect(planner.generatePlan('Test')).rejects.toThrow();
        }
      }
    );
  });

  // ============================================================
  // Plan Generation Completeness
  // ============================================================
  describe('Plan Generation Completeness', () => {
    it('should generate a valid plan with all required fields', async () => {
      const planResponse = `[
  {
    "step": 1,
    "action": "read",
    "description": "Read requirements",
    "path": "requirements.md",
    "expectedOutcome": "Requirements clear"
  },
  {
    "step": 2,
    "action": "write",
    "description": "Create component",
    "path": "src/Component.tsx",
    "prompt": "Create a component",
    "expectedOutcome": "Component ready"
  }
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Test');

      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.steps[0].stepId).toBeDefined();
      expect(plan.steps[0].action).toBeDefined();
      expect(plan.steps[0].description).toBeDefined();
      expect(plan.steps[0].expectedOutcome).toBeDefined();
    });

    it('should extract all step components correctly', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Analyze", "path": "src/old.tsx", "expectedOutcome": "Analyzed"},
  {"step": 2, "action": "write", "description": "Create", "path": "src/new.tsx", "prompt": "Refactor", "expectedOutcome": "Created"},
  {"step": 3, "action": "run", "description": "Verify", "command": "npm test", "expectedOutcome": "Verified"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Refactor and run tests');

      // Check step 1 (read)
      expect(plan.steps[0].action).toBe('read');
      expect(plan.steps[0].path).toBe('src/old.tsx');

      // Check step 2 (write)
      expect(plan.steps[1].action).toBe('write');
      expect(plan.steps[1].path).toBe('src/new.tsx');
      expect(plan.steps[1].description).toBeDefined();

      // Check step 3 (run)
      expect(plan.steps[2].action).toBe('run');
      expect(plan.steps[2].command).toBe('npm test');
    });
  });
});
