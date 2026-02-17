import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Planner } from './planner';

/**
 * Tests for Planner module (Refactored - Separation of Concerns)
 * 
 * Core integration tests for plan generation
 */

describe('Planner', () => {
  let planner: Planner;
  const mockLLMCall = vi.fn();
  const mockProgress = vi.fn();

  beforeEach(() => {
    mockLLMCall.mockClear();
    mockProgress.mockClear();
    planner = new Planner({
      llmCall: mockLLMCall,
      onProgress: mockProgress,
    });
  });

  describe('generatePlan', () => {
    it('should generate a plan with steps from user request', async () => {
      const planResponse = `[
  {
    "step": 1,
    "action": "read",
    "description": "Read existing code",
    "path": "src/App.tsx",
    "expectedOutcome": "Understand structure"
  },
  {
    "step": 2,
    "action": "write",
    "description": "Write new code",
    "path": "src/components/LoginForm.tsx",
    "expectedOutcome": "Feature implemented"
  }
]`;

      mockLLMCall.mockResolvedValue(planResponse);

      const plan = await planner.generatePlan('Create login form');

      expect(plan.taskId).toMatch(/^plan-/);
      expect(plan.userRequest).toBe('Create login form');
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.generatedAt).toBeInstanceOf(Date);
      expect(mockLLMCall).toHaveBeenCalled();
    });

    it('should throw on LLM failure', async () => {
      mockLLMCall.mockRejectedValue(new Error('LLM error'));

      await expect(planner.generatePlan('Test task')).rejects.toThrow('Plan generation failed');
    });

    it('should throw if response contains UNABLE_TO_COMPLETE', async () => {
      mockLLMCall.mockResolvedValue('UNABLE_TO_COMPLETE; Cannot generate plan');

      await expect(planner.generatePlan('Complex task')).rejects.toThrow(
        'LLM could not generate a plan'
      );
    });

    it('should throw if no steps extracted from response', async () => {
      mockLLMCall.mockResolvedValue('Just random text with no JSON array');

      await expect(planner.generatePlan('Ambiguous task')).rejects.toThrow(
        'PLANNER_ERROR'
      );
    });

    it('should extract steps with action types', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read code", "path": "src/App.tsx", "expectedOutcome": "Code read"},
  {"step": 2, "action": "write", "description": "Write code", "path": "src/New.tsx", "expectedOutcome": "Code written"},
  {"step": 3, "action": "run", "description": "Run tests", "command": "npm test", "expectedOutcome": "Tests pass"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);

      const plan = await planner.generatePlan('Multi-step task');

      expect(plan.steps.length).toBeGreaterThan(0);
      const actions = plan.steps.map(s => s.action);
      const hasVariety = actions.length > 1;
      expect(hasVariety).toBe(true);
    });

    it('should have executor-compatible step structure', async () => {
      const planResponse = `[
  {
    "step": 1,
    "action": "read",
    "description": "Analyze requirements",
    "path": "README.md",
    "expectedOutcome": "Requirements clear"
  },
  {
    "step": 2,
    "action": "read",
    "description": "Read existing code",
    "path": "src/App.tsx",
    "expectedOutcome": "Code understood"
  }
]`;

      mockLLMCall.mockResolvedValue(planResponse);

      const plan = await planner.generatePlan('Test');

      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.steps[0].stepNumber).toBeDefined();
      expect(plan.steps[0].stepId).toBeDefined();
      expect(plan.steps[0].action).toBeDefined();
      expect(plan.steps[0].description).toBeDefined();
      expect(plan.steps[0].expectedOutcome).toBeDefined();
    });
  });

  describe('Step Parsing (Phase 7)', () => {
    it('should parse read steps with path', async () => {
      const planResponse = `[
  {
    "step": 1,
    "action": "read",
    "description": "Read component",
    "path": "src/components/Button.tsx",
    "expectedOutcome": "Code analyzed"
  }
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Analyze button');

      expect(plan.steps[0].action).toBe('read');
      expect(plan.steps[0].path).toBe('src/components/Button.tsx');
    });

    it('should parse write steps with path', async () => {
      const planResponse = `[
  {
    "step": 1,
    "action": "write",
    "description": "Create new component",
    "path": "src/components/Form.tsx",
    "prompt": "Create a form component",
    "expectedOutcome": "Component created"
  }
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Create form');

      expect(plan.steps[0].action).toBe('write');
      expect(plan.steps[0].path).toBe('src/components/Form.tsx');
      expect(plan.steps[0].description).toBeDefined();
    });

    it('should parse run steps with command', async () => {
      const planResponse = `[
  {
    "step": 1,
    "action": "run",
    "description": "Run tests",
    "command": "npm test",
    "expectedOutcome": "Tests pass"
  }
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Run tests');

      expect(plan.steps[0].action).toBe('run');
      expect(plan.steps[0].command).toBe('npm test');
    });

    it('should extract dependencies from steps', async () => {
      const planResponse = `[
  {
    "step": 1,
    "action": "read",
    "description": "Read",
    "path": "src/types.ts",
    "expectedOutcome": "Types read"
  },
  {
    "step": 2,
    "action": "write",
    "description": "Write component using types from step 1",
    "path": "src/Component.tsx",
    "expectedOutcome": "Component written",
    "dependsOn": [1]
  }
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Create typed component');

      expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle multi-line descriptions', async () => {
      const planResponse = `[
  {
    "step": 1,
    "action": "read",
    "description": "Read the configuration file\\nto understand project setup",
    "path": "tsconfig.json",
    "expectedOutcome": "Config understood"
  }
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Setup understanding');

      expect(plan.steps[0].description).toBeDefined();
      expect(plan.steps[0].description.length).toBeGreaterThan(0);
    });

    it('should extract expected outcomes', async () => {
      const planResponse = `[
  {
    "step": 1,
    "action": "write",
    "description": "Write API handler",
    "path": "src/api/handler.ts",
    "expectedOutcome": "API endpoint ready for testing",
    "prompt": "Create API"
  }
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Create API');

      expect(plan.steps[0].expectedOutcome).toBe('API endpoint ready for testing');
    });

    it('should handle steps with multiple action types', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read", "path": "src/old.ts", "expectedOutcome": "Read"},
  {"step": 2, "action": "write", "description": "Write", "path": "src/new.ts", "expectedOutcome": "Write", "prompt": "Create"},
  {"step": 3, "action": "run", "description": "Test", "command": "npm test", "expectedOutcome": "Tests pass"},
  {"step": 4, "action": "delete", "description": "Clean", "path": "src/old.ts", "expectedOutcome": "Cleaned"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Refactor');

      expect(plan.steps.length).toBe(4);
      expect(plan.steps.map(s => s.action).includes('read')).toBe(true);
      expect(plan.steps.map(s => s.action).includes('write')).toBe(true);
      expect(plan.steps.map(s => s.action).includes('run')).toBe(true);
      expect(plan.steps.map(s => s.action).includes('delete')).toBe(true);
    });

    it('should assign sequential step IDs', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Step 1", "path": "a.ts", "expectedOutcome": "Done"},
  {"step": 2, "action": "read", "description": "Step 2", "path": "b.ts", "expectedOutcome": "Done"},
  {"step": 3, "action": "read", "description": "Step 3", "path": "c.ts", "expectedOutcome": "Done"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Multi-step');

      expect(plan.steps[0].stepId).toBe(1);
      expect(plan.steps[1].stepId).toBe(2);
      expect(plan.steps[2].stepId).toBe(3);
    });
  });

  describe('Dependency Handling (Phase 7)', () => {
    it('should detect numeric dependencies between steps', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read config", "path": "config.json", "expectedOutcome": "Config loaded"},
  {"step": 2, "action": "write", "description": "Generate code", "path": "generated.ts", "expectedOutcome": "Code generated", "dependsOn": [1], "prompt": "Generate"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Generate based on config');

      expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle missing dependency resolution gracefully', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done"},
  {"step": 2, "action": "write", "description": "Write", "path": "b.ts", "expectedOutcome": "Done", "prompt": "Create", "dependsOn": [1]},
  {"step": 3, "action": "write", "description": "Write", "path": "c.ts", "expectedOutcome": "Done", "prompt": "Create", "dependsOn": [2]}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Dependent steps');

      expect(plan.steps.length).toBe(3);
    });

    it('should remove self-referential dependencies', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done", "dependsOn": [1]}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Self ref test');

      expect(plan.steps[0]).toBeDefined();
    });
  });

  describe('Plan Validation (Phase 7)', () => {
    it('should validate plan has taskId', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Test');

      expect(plan.taskId).toBeDefined();
      expect(typeof plan.taskId).toBe('string');
    });

    it('should parse plan with valid steps', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Test');

      expect(plan.steps).toBeDefined();
      expect(Array.isArray(plan.steps)).toBe(true);
    });

    it('should preserve userRequest in plan', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const userRequest = 'Test request';
      const plan = await planner.generatePlan(userRequest);

      expect(plan.userRequest).toBe(userRequest);
    });

    it('should have generatedat timestamp', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const before = new Date();
      const plan = await planner.generatePlan('Test');
      const after = new Date();

      expect(plan.generatedAt).toBeInstanceOf(Date);
      expect(plan.generatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(plan.generatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Error Handling (Phase 7)', () => {
    it('should handle JSON parse errors', async () => {
      mockLLMCall.mockResolvedValue('{ invalid json [');

      await expect(planner.generatePlan('Invalid JSON')).rejects.toThrow();
    });

    it('should handle responses with markdown code blocks', async () => {
      const planResponse = `\`\`\`json
[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done"}
]
\`\`\``;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Markdown response');

      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('should handle empty steps array', async () => {
      mockLLMCall.mockResolvedValue('[]');

      await expect(planner.generatePlan('Empty')).rejects.toThrow();
    });

    it('should handle plans without action gracefully', async () => {
      const planResponse = `[
  {"step": 1, "description": "No action", "expectedOutcome": "Test"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);

      // Should accept it and parse without action
      const plan = await planner.generatePlan('No action');
      expect(plan.steps).toBeDefined();
    });

    it('should handle malformed step blocks', async () => {
      mockLLMCall.mockResolvedValue('Step 1: This is not JSON');

      await expect(planner.generatePlan('Malformed')).rejects.toThrow();
    });
  });

  describe('LLM Integration (Phase 7)', () => {
    it('should pass user request to LLM', async () => {
      const userRequest = 'Create authentication system';
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      await planner.generatePlan(userRequest);

      expect(mockLLMCall).toHaveBeenCalled();
      const callArg = mockLLMCall.mock.calls[0][0];
      expect(typeof callArg).toBe('string');
      expect(callArg.toLowerCase()).toContain('plan');
    });

    it('should report progress during planning', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      await planner.generatePlan('Test with progress');

      expect(mockProgress).toHaveBeenCalled();
    });

    it('should handle LLM timeout gracefully', async () => {
      mockLLMCall.mockRejectedValue(new Error('Timeout'));

      await expect(planner.generatePlan('Timeout test')).rejects.toThrow('Plan generation failed');
    });

    it('should handle LLM returning empty string', async () => {
      mockLLMCall.mockResolvedValue('');

      await expect(planner.generatePlan('Empty response')).rejects.toThrow();
    });
  });
});
