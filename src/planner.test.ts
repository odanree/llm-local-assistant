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
});
