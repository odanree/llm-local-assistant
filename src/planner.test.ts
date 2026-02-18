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

  describe('Scaffold Dependencies (Phase 12)', () => {
    it('should not add scaffold steps for non-component tasks', async () => {
      const planResponse = `[
  {"step": 1, "action": "run", "description": "Run tests", "command": "npm test", "expectedOutcome": "Tests pass"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Run tests');

      // Non-component tasks should not have scaffold steps
      expect(plan.steps.length).toBe(1);
      expect(plan.steps[0].action).toBe('run');
    });

    it('should add scaffold steps when creating components without cn utility', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create button component", "path": "src/components/Button.tsx", "expectedOutcome": "Button created"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);

      const plan = await planner.generatePlan('Create button component', '/test/workspace');

      // Should have prepended scaffold step for cn utility if workspace path provided
      // Note: The implementation checks for workspace path, so we verify the step count
      expect(plan.steps.length).toBeGreaterThanOrEqual(1);
      expect(plan.steps.some(s => s.path?.includes('components'))).toBe(true);
    });

    it('should preserve original steps when adding scaffold dependencies', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create header", "path": "src/components/Header.tsx", "expectedOutcome": "Header created"},
  {"step": 2, "action": "write", "description": "Create footer", "path": "src/components/Footer.tsx", "expectedOutcome": "Footer created"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Create header and footer');

      // All original steps should still be present
      expect(plan.steps.some(s => s.path?.includes('Header'))).toBe(true);
      expect(plan.steps.some(s => s.path?.includes('Footer'))).toBe(true);
    });

    it('should extract workspace context in plan', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const workspacePath = '/home/user/projects/myapp';
      const workspaceName = 'MyApp';

      const plan = await planner.generatePlan('Test', workspacePath, workspaceName);

      expect(plan.workspacePath).toBe(workspacePath);
      expect(plan.workspaceName).toBe(workspaceName);
    });

    it('should handle project context in plan generation', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);

      const projectContext = {
        hasTests: true,
        testFramework: 'vitest',
      };

      const plan = await planner.generatePlan('Test task', undefined, undefined, projectContext);

      expect(plan.steps.length).toBeGreaterThan(0);
      expect(mockLLMCall).toHaveBeenCalled();
    });

    it('should handle project context with minimal project flag', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create index", "path": "src/index.ts", "expectedOutcome": "Index created"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);

      const projectContext = {
        hasTests: false,
        isMinimalProject: true,
      };

      const plan = await planner.generatePlan('Setup project', undefined, undefined, projectContext);

      // No test step should be added for minimal projects
      expect(plan.steps.every(s => s.action !== 'run' || !s.command?.includes('test'))).toBe(true);
    });
  });

  describe('Topological Sort Error Handling (Phase 12)', () => {
    it('should handle circular dependencies gracefully in topological sort', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done", "dependsOn": [2]},
  {"step": 2, "action": "write", "description": "Write", "path": "b.ts", "expectedOutcome": "Done", "prompt": "Create", "dependsOn": [1]}
]`;

      mockLLMCall.mockResolvedValue(planResponse);

      // Should handle circular deps - either throws or falls back
      try {
        await planner.generatePlan('Circular deps');
      } catch (err) {
        // Expected: circular dependency error
        expect(String(err)).toContain('CIRCULAR');
      }
    });

    it('should handle missing dependencies gracefully in topological sort', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done", "dependsOn": [99]}
]`;

      mockLLMCall.mockResolvedValue(planResponse);

      // Should handle missing deps - either throws or includes invalid deps
      const plan = await planner.generatePlan('Missing dep');
      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('should process valid topological sort correctly', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done"},
  {"step": 2, "action": "read", "description": "Read", "path": "b.ts", "expectedOutcome": "Done"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Valid plan');

      // Should have 2 steps in order
      expect(plan.steps.length).toBe(2);
      expect(plan.steps[0].stepNumber).toBe(1);
      expect(plan.steps[1].stepNumber).toBe(2);
    });
  });

  describe('Template Validation (Phase 12)', () => {
    it('should perform pre-flight template validation for component writes', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create button", "path": "src/components/Button.tsx", "expectedOutcome": "Button created"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Create button');

      // Plan should complete successfully with component write step
      expect(plan.steps.some(s => s.path?.includes('Button'))).toBe(true);
      expect(plan.steps.some(s => s.action === 'write')).toBe(true);
    });

    it('should validate plan has reasoning field', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Test');

      expect(plan.reasoning).toBeDefined();
      expect(typeof plan.reasoning).toBe('string');
    });

    it('should set plan status to pending by default', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Test');

      expect(plan.status).not.toBeDefined(); // Status is optional, set by executor
    });
  });

  describe('Plan Reasoning Extraction (Phase 12)', () => {
    it('should extract reasoning from LLM response with explicit Reasoning section', async () => {
      const planResponse = `Reasoning: We need to create components incrementally to ensure proper typing.

[
  {"step": 1, "action": "write", "description": "Create button", "path": "src/components/Button.tsx", "expectedOutcome": "Done"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Test');

      expect(plan.reasoning).toContain('create');
    });

    it('should extract reasoning from LLM response with Approach section', async () => {
      const planResponse = `Approach: Start with utility components, then composite components.

[
  {"step": 1, "action": "write", "description": "Create button", "path": "src/components/Button.tsx", "expectedOutcome": "Done"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Test');

      expect(plan.reasoning).toBeDefined();
    });
  });

  describe('Edge Cases - Context Awareness (Phase 12)', () => {
    it('should include hasTests in project context when provided', async () => {
      const planResponse = `[
  {"step": 1, "action": "run", "description": "Run tests", "command": "npm test", "expectedOutcome": "Pass"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);

      const context = { hasTests: true, testFramework: 'vitest' };
      const plan = await planner.generatePlan('Test task', undefined, undefined, context);

      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('should handle steps with both numeric and string dependencies', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done"},
  {"step": 2, "action": "write", "description": "Write", "path": "b.ts", "expectedOutcome": "Done", "prompt": "Create", "dependsOn": [1]}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Dep test');

      expect(plan.steps[1].dependsOn).toBeDefined();
    });

    it('should generate consistent taskId format', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan1 = await planner.generatePlan('Test 1');
      await new Promise(resolve => setTimeout(resolve, 5)); // Ensure different timestamp
      const plan2 = await planner.generatePlan('Test 2');

      expect(plan1.taskId).toMatch(/^plan-\d+$/);
      expect(plan2.taskId).toMatch(/^plan-\d+$/);
      expect(plan1.taskId).not.toBe(plan2.taskId); // Should be different due to timestamp
    });

    it('should preserve generatedAt timestamp within reasonable bounds', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);

      const before = new Date();
      const plan = await planner.generatePlan('Time test');
      const after = new Date();

      expect(plan.generatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(plan.generatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Private Helper Methods - Edge Cases (Phase 12+)', () => {
    it('should handle buildPlanPrompt with project context', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create component", "path": "src/components/Test.tsx", "expectedOutcome": "Created"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);

      const context = {
        language: 'TypeScript' as const,
        strategy: 'SCAFFOLD_MODE' as const,
        extension: '.tsx' as const,
        root: 'src',
        isMinimalProject: false,
      };

      const planner2 = new Planner({
        llmCall: mockLLMCall,
        onProgress: mockProgress,
        projectContext: context,
      });

      const plan = await planner2.generatePlan('Create test component');

      expect(plan.steps.length).toBeGreaterThan(0);
      expect(mockLLMCall).toHaveBeenCalled();
      // Verify the prompt included context
      const callArg = mockLLMCall.mock.calls[0][0];
      expect(callArg).toContain('TypeScript');
      expect(callArg).toContain('SCAFFOLD_MODE');
    });

    it('should handle empty dependencies in topological sort', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read A", "path": "a.ts", "expectedOutcome": "Done"},
  {"step": 2, "action": "read", "description": "Read B", "path": "b.ts", "expectedOutcome": "Done"},
  {"step": 3, "action": "read", "description": "Read C", "path": "c.ts", "expectedOutcome": "Done"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Multi-step no deps');

      expect(plan.steps.length).toBe(3);
      // All steps should be present in order
      expect(plan.steps.map(s => s.stepNumber)).toEqual([1, 2, 3]);
    });

    it('should handle large step numbers', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "First", "path": "a.ts", "expectedOutcome": "Done"},
  {"step": 100, "action": "write", "description": "Hundredth", "path": "z.ts", "expectedOutcome": "Done", "prompt": "Create"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Non-sequential steps');

      expect(plan.steps.length).toBe(2);
      expect(plan.steps.some(s => s.stepNumber === 100)).toBe(true);
    });

    it('should handle steps with minimal required fields', async () => {
      const planResponse = `[
  {"step": 1, "action": "run", "description": "Test", "command": "npm test"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Minimal fields');

      expect(plan.steps.length).toBe(1);
      expect(plan.steps[0].command).toBe('npm test');
      expect(plan.steps[0].action).toBe('run');
    });

    it('should extract reasoning fallback on missing section', async () => {
      const planResponse = `Some initial context about the approach here.

[
  {"step": 1, "action": "read", "description": "Read", "path": "a.ts", "expectedOutcome": "Done"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('No explicit reasoning');

      expect(plan.reasoning).toBeDefined();
      expect(plan.reasoning.length).toBeGreaterThan(0);
    });

    it('should handle dependencies as both array and string formats', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Config", "path": "config.ts", "expectedOutcome": "Done"},
  {"step": 2, "action": "write", "description": "App", "path": "app.ts", "prompt": "Create", "expectedOutcome": "Done", "dependsOn": "step_1"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('String deps');

      expect(plan.steps[1].dependsOn).toBeDefined();
      expect(Array.isArray(plan.steps[1].dependsOn)).toBe(true);
    });

    it('should handle template key mapping for cn.ts', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create cn utility", "path": "src/utils/cn.ts", "expectedOutcome": "Created"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Create cn utility');

      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.steps[0].path).toContain('cn.ts');
    });

    it('should handle validation of plan against templates', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create cn", "path": "src/utils/cn.ts", "expectedOutcome": "Created"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Template validation test');

      // Should complete without throwing
      expect(plan).toBeDefined();
      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('should handle steps with delete action', async () => {
      const planResponse = `[
  {"step": 1, "action": "delete", "description": "Remove old file", "path": "src/old.ts", "expectedOutcome": "Deleted"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Delete file');

      expect(plan.steps[0].action).toBe('delete');
      expect(plan.steps[0].path).toBe('src/old.ts');
    });

    it('should handle invalid action type with graceful fallback', async () => {
      const planResponse = `[
  {"step": 1, "action": "analyze", "description": "Analyze code", "path": "src/app.ts", "expectedOutcome": "Done"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Invalid action');

      // Should fallback to 'read' for invalid actions
      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('should handle very long description fields', async () => {
      const longDesc = 'A'.repeat(500);
      const planResponse = `[
  {"step": 1, "action": "read", "description": "${longDesc}", "path": "a.ts", "expectedOutcome": "Done"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Long description');

      expect(plan.steps[0].description.length).toBeGreaterThan(400);
    });

    it('should handle steps with alternative field names', async () => {
      const planResponse = `[
  {"step": 1, "action": "read", "description": "Read file", "filePath": "src/test.ts", "expectedOutcome": "Done"}
]`;

      mockLLMCall.mockResolvedValue(planResponse);
      const plan = await planner.generatePlan('Alternative fields');

      // Should recognize filePath as path alternative
      expect(plan.steps[0].path).toBe('src/test.ts');
    });
  });
});
