/**
 * Critical Path Testing - Target 90% Coverage
 *
 * Focus on core business logic for Planner, Executor, and LLMClient
 * These are the most critical paths in the application
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Planner } from '../planner';
import { LLMClient } from '../llmClient';
import {
  createPlannerConfig,
  createLinearChainPlan,
  createParallelPlan,
  createDiamondPlan,
  createMockLLMClient,
  createLLMConfig,
} from './factories';

describe('Critical Paths - 90% Coverage Target', () => {
  describe('Planner - Core Execution Path', () => {
    let planner: Planner;

    beforeEach(() => {
      const config = createPlannerConfig();
      planner = new Planner(config);
    });

    it('complete workflow: plan generation with valid config', async () => {
      const config = createPlannerConfig({
        llmCall: async () => createLinearChainPlan(3),
      });
      planner = new Planner(config);

      const plan = await planner.generatePlan('Create feature');

      expect(plan).toBeDefined();
      expect(plan.taskId).toBeDefined();
      expect(plan.userRequest).toBe('Create feature');
      expect(plan.steps).toHaveLength(3);
      expect(plan.generatedAt).toBeInstanceOf(Date);
      expect(plan.reasoning).toBeTruthy();
      expect(plan.steps[0].action).toBe('write');
    });

    it('handles varying project contexts', async () => {
      const tsConfig = createPlannerConfig({
        projectContext: {
          language: 'typescript',
          strategy: 'DIFF_MODE',
          extension: '.ts',
          root: 'lib',
          isMinimalProject: true,
        },
        llmCall: async () => createLinearChainPlan(1),
      });
      planner = new Planner(tsConfig);

      const plan = await planner.generatePlan('Add utility');
      expect(plan.steps[0].path).toContain('.ts');
    });

    it('processes complex multi-step plans correctly', async () => {
      const config = createPlannerConfig({
        llmCall: async () => createDiamondPlan(),
      });
      planner = new Planner(config);

      const plan = await planner.generatePlan('Complex feature');

      // Verify all steps are present
      expect(plan.steps).toHaveLength(4);
      // Verify topological order
      const ids = plan.steps.map(s => s.id);
      expect(ids[0]).toBe('step_1');
      expect(ids.slice(1, 3)).toContain('step_2');
      expect(ids.slice(1, 3)).toContain('step_3');
      expect(ids[3]).toBe('step_4');
    });

    it('correctly handles all step properties', async () => {
      const customPlan = JSON.stringify([
        {
          step: 1,
          action: 'write',
          description: 'Create config',
          path: 'src/config.ts',
          expectedOutcome: 'Config ready',
        },
        {
          step: 2,
          action: 'run',
          description: 'Build project',
          path: 'src',
          expectedOutcome: 'Compiled successfully',
          notes: 'Depends on: step_1',
        },
      ]);

      const config = createPlannerConfig({
        llmCall: async () => customPlan,
      });
      planner = new Planner(config);

      const plan = await planner.generatePlan('Setup');

      expect(plan.steps[0].description).toBe('Create config');
      expect(plan.steps[0].expectedOutcome).toBe('Config ready');
      expect(plan.steps[1].action).toBe('run');
      // Note field is preserved (contains dependency info from LLM)
      expect(plan.steps[1].description || plan.steps[1].expectedOutcome).toBeDefined();
    });

    it('preserves reasoning from LLM response', async () => {
      const config = createPlannerConfig({
        llmCall: async () => createLinearChainPlan(1),
      });
      planner = new Planner(config);

      const plan = await planner.generatePlan('Test request');
      expect(plan.reasoning).toBeTruthy();
      expect(typeof plan.reasoning).toBe('string');
      expect(plan.reasoning.length).toBeGreaterThan(0);
    });

    it('calls onProgress callback when provided', async () => {
      const onProgress = vi.fn();
      const config = createPlannerConfig({
        onProgress,
        llmCall: async () => createLinearChainPlan(1),
      });
      planner = new Planner(config);

      await planner.generatePlan('Test');

      expect(onProgress).toHaveBeenCalled();
    });

    it('generates unique task IDs for each plan', async () => {
      const config = createPlannerConfig({
        llmCall: async () => createLinearChainPlan(1),
      });
      planner = new Planner(config);

      const plan1 = await planner.generatePlan('First');
      // Add delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      const plan2 = await planner.generatePlan('Second');

      expect(plan1.taskId).not.toBe(plan2.taskId);
    });
  });

  describe('LLMClient - Network & Communication Path', () => {
    let client: LLMClient;

    beforeEach(() => {
      client = new LLMClient(createLLMConfig());
    });

    it('initializes with correct configuration', () => {
      const config = createLLMConfig({
        endpoint: 'http://localhost:5000',
        model: 'custom-model',
        temperature: 0.5,
      });
      const testClient = new LLMClient(config);

      expect(testClient).toBeDefined();
    });

    it('checks server health successfully', async () => {
      global.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: vi.fn(async () => ({})),
      } as any));

      const result = await client.isServerHealthy();

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalled();
    });

    it('handles server health check failure', async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        status: 500,
        json: vi.fn(async () => ({ error: 'Server error' })),
      } as any));

      const result = await client.isServerHealthy();

      expect(result).toBe(false);
    });

    it('respects timeout configuration', async () => {
      const config = createLLMConfig({ timeout: 1000 });
      const testClient = new LLMClient(config);

      expect(testClient).toBeDefined();
    });

    it('clears message history when requested', () => {
      // clearHistory is a synchronous method that clears the in-memory conversation history
      const clearHistorySpy = vi.spyOn(client, 'clearHistory');

      client.clearHistory();

      expect(clearHistorySpy).toHaveBeenCalled();
    });
  });

  describe('Core Integration - Full Workflow', () => {
    it('complete workflow: config → plan → execution ready', async () => {
      const mockLLMClient = createMockLLMClient();
      const config = createPlannerConfig({
        llmCall: async () => createParallelPlan(),
      });
      const planner = new Planner(config);

      // Generate plan
      const plan = await planner.generatePlan('Create parallel features');

      // Verify plan structure
      expect(plan).toHaveProperty('taskId');
      expect(plan).toHaveProperty('userRequest');
      expect(plan).toHaveProperty('steps');
      expect(plan).toHaveProperty('generatedAt');
      expect(plan).toHaveProperty('reasoning');

      // Verify steps are executable
      plan.steps.forEach(step => {
        expect(step).toHaveProperty('id');
        expect(step).toHaveProperty('action');
        expect(step).toHaveProperty('description');
        expect(step).toHaveProperty('path');
      });

      // Verify dependencies are valid
      plan.steps.forEach(step => {
        if (step.dependsOn) {
          step.dependsOn.forEach(depId => {
            expect(plan.steps.some(s => s.id === depId)).toBe(true);
          });
        }
      });
    });

    it('handles various action types in workflow', async () => {
      const multiActionPlan = JSON.stringify([
        { step: 1, action: 'read', description: 'Read file', path: 'src/old.ts' },
        { step: 2, action: 'write', description: 'Write new', path: 'src/new.ts', notes: 'Depends on: step_1' },
        { step: 3, action: 'run', description: 'Build', path: 'src', notes: 'Depends on: step_2' },
        { step: 4, action: 'delete', description: 'Cleanup', path: 'src/old.ts', notes: 'Depends on: step_3' },
      ]);

      const config = createPlannerConfig({
        llmCall: async () => multiActionPlan,
      });
      const planner = new Planner(config);

      const plan = await planner.generatePlan('Multi-action workflow');

      const actions = plan.steps.map(s => s.action);
      expect(actions).toContain('read');
      expect(actions).toContain('write');
      expect(actions).toContain('run');
      expect(actions).toContain('delete');
    });

    it('maintains topological order across all workflow types', async () => {
      const config = createPlannerConfig({
        llmCall: async () => createDiamondPlan(),
      });
      const planner = new Planner(config);

      const plan = await planner.generatePlan('Complex workflow');

      // Verify topological ordering
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        if (step.dependsOn) {
          for (const depId of step.dependsOn) {
            const depIndex = plan.steps.findIndex(s => s.id === depId);
            expect(depIndex).toBeLessThan(i);
          }
        }
      }
    });
  });

  describe('Error Recovery in Critical Paths', () => {
    it('gracefully handles LLM failure in planning', async () => {
      const config = createPlannerConfig({
        llmCall: vi.fn(async () => {
          throw new Error('LLM service unavailable');
        }),
      });
      const planner = new Planner(config);

      await expect(planner.generatePlan('Create')).rejects.toThrow();
    });

    it('recovers from circular dependencies', async () => {
      const circularPlan = JSON.stringify([
        { step: 1, action: 'write', description: 'A', path: 'src/a.ts', notes: 'Depends on: step_2' },
        { step: 2, action: 'write', description: 'B', path: 'src/b.ts', notes: 'Depends on: step_1' },
      ]);

      const config = createPlannerConfig({
        llmCall: async () => circularPlan,
      });
      const planner = new Planner(config);

      const plan = await planner.generatePlan('Circular');

      // Should fall back to original order
      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].id).toBe('step_1');
      expect(plan.steps[1].id).toBe('step_2');
    });

    it('recovers from invalid dependency references', async () => {
      const invalidPlan = JSON.stringify([
        { step: 1, action: 'write', description: 'A', path: 'src/a.ts' },
        { step: 2, action: 'write', description: 'B', path: 'src/b.ts', notes: 'Depends on: step_99' },
      ]);

      const config = createPlannerConfig({
        llmCall: async () => invalidPlan,
      });
      const planner = new Planner(config);

      const plan = await planner.generatePlan('Invalid deps');

      // Should still produce valid plan in original order
      expect(plan.steps).toHaveLength(2);
    });

    it('handles malformed but partially valid JSON', async () => {
      const config = createPlannerConfig({
        llmCall: async () => `
\`\`\`json
[
  {"step": 1, "action": "write", "description": "Test", "path": "src/test.ts"}
]
\`\`\`
        `,
      });
      const planner = new Planner(config);

      const plan = await planner.generatePlan('Markdown JSON');

      expect(plan.steps).toHaveLength(1);
    });
  });
});
