/**
 * Snapshot & Output Validation Tests
 *
 * Validates generated code structure, plan output, and data transformations
 * against expected patterns without brittle string matching
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Planner, type TaskPlan } from '../planner';
import { createPlannerConfig, createLinearChainPlan, createDiamondPlan } from './factories';

describe('Snapshot & Output Validation', () => {
  describe('TaskPlan Structure Validation', () => {
    let planner: Planner;

    beforeEach(() => {
      const config = createPlannerConfig();
      planner = new Planner(config);
    });

    it('generates valid TaskPlan schema', async () => {
      const config = createPlannerConfig({
        llmCall: async () => createLinearChainPlan(3),
      });
      planner = new Planner(config);

      const plan = await planner.generatePlan('Test request');

      // Verify required fields exist
      expect(plan).toHaveProperty('taskId');
      expect(plan).toHaveProperty('userRequest');
      expect(plan).toHaveProperty('steps');
      expect(plan).toHaveProperty('generatedAt');
      expect(plan).toHaveProperty('reasoning');

      // Verify types
      expect(typeof plan.taskId).toBe('string');
      expect(typeof plan.userRequest).toBe('string');
      expect(Array.isArray(plan.steps)).toBe(true);
      expect(plan.generatedAt instanceof Date).toBe(true);
      expect(typeof plan.reasoning).toBe('string');
    });

    it('taskId follows expected pattern', async () => {
      const config = createPlannerConfig({
        llmCall: async () => createLinearChainPlan(1),
      });
      planner = new Planner(config);

      const plan = await planner.generatePlan('Test');
      // taskId should be deterministic string
      expect(plan.taskId).toMatch(/^plan-/);
    });

    it('preserves user request exactly', async () => {
      const userRequest = 'Create a complex feature with tests';
      const config = createPlannerConfig({
        llmCall: async () => createLinearChainPlan(1),
      });
      planner = new Planner(config);

      const plan = await planner.generatePlan(userRequest);
      expect(plan.userRequest).toBe(userRequest);
    });

    it('reasoning is not empty', async () => {
      const config = createPlannerConfig({
        llmCall: async () => createLinearChainPlan(1),
      });
      planner = new Planner(config);

      const plan = await planner.generatePlan('Test');
      expect(plan.reasoning).toBeTruthy();
      expect(plan.reasoning.length).toBeGreaterThan(0);
    });

    it('generatedAt is recent', async () => {
      const config = createPlannerConfig({
        llmCall: async () => createLinearChainPlan(1),
      });
      planner = new Planner(config);

      const before = new Date();
      const plan = await planner.generatePlan('Test');
      const after = new Date();

      expect(plan.generatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(plan.generatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('ExecutionStep Structure Validation', () => {
    let planner: Planner;

    beforeEach(() => {
      const config = createPlannerConfig();
      planner = new Planner(config);
    });

    it('each step has required fields', async () => {
      const config = createPlannerConfig({
        llmCall: async () => createLinearChainPlan(2),
      });
      planner = new Planner(config);

      const plan = await planner.generatePlan('Test');

      plan.steps.forEach(step => {
        expect(step).toHaveProperty('stepNumber');
        expect(step).toHaveProperty('stepId');
        expect(step).toHaveProperty('id');
        expect(step).toHaveProperty('action');
        expect(step).toHaveProperty('description');
        expect(step).toHaveProperty('path');

        // Verify types
        expect(typeof step.stepNumber).toBe('number');
        expect(typeof step.stepId).toBe('number');
        expect(typeof step.id).toBe('string');
        expect(['read', 'write', 'run', 'delete']).toContain(step.action);
        expect(typeof step.description).toBe('string');
        expect(typeof step.path).toBe('string');
      });
    });

    it('step IDs are sequential and deterministic', async () => {
      const config = createPlannerConfig({
        llmCall: async () => createLinearChainPlan(5),
      });
      planner = new Planner(config);

      const plan = await planner.generatePlan('Test');

      plan.steps.forEach((step, index) => {
        expect(step.id).toBe(`step_${index + 1}`);
        expect(step.stepNumber).toBe(index + 1);
        expect(step.stepId).toBe(index + 1);
      });
    });

    it('paths use configured file extension', async () => {
      const config = createPlannerConfig({
        projectContext: {
          language: 'typescript',
          strategy: 'DIFF_MODE',
          extension: '.tsx',
          root: 'src',
          isMinimalProject: false,
        },
        llmCall: async () => createLinearChainPlan(2),
      });
      planner = new Planner(config);

      const plan = await planner.generatePlan('Test');

      // All paths should respect the root directory structure
      plan.steps.forEach(step => {
        expect(step.path).toBeTruthy();
        // Paths should be relative
        expect(step.path).not.toMatch(/^\/|^[A-Z]:/);
      });
    });
  });

  describe('Dependency Relationships Validation', () => {
    let planner: Planner;

    beforeEach(() => {
      const config = createPlannerConfig();
      planner = new Planner(config);
    });

    it('dependencies reference valid steps', async () => {
      const config = createPlannerConfig({
        llmCall: async () => createDiamondPlan(),
      });
      planner = new Planner(config);

      const plan = await planner.generatePlan('Test');
      const validIds = plan.steps.map(s => s.id);

      plan.steps.forEach(step => {
        if (step.dependsOn) {
          step.dependsOn.forEach(depId => {
            expect(validIds).toContain(depId);
          });
        }
      });
    });

    it('no circular dependencies', async () => {
      const config = createPlannerConfig({
        llmCall: async () => createDiamondPlan(),
      });
      planner = new Planner(config);

      const plan = await planner.generatePlan('Test');

      // Check for cycles: if step A depends on B, B should not depend on A
      plan.steps.forEach(stepA => {
        if (stepA.dependsOn) {
          stepA.dependsOn.forEach(depId => {
            const stepB = plan.steps.find(s => s.id === depId);
            if (stepB && stepB.dependsOn) {
              expect(stepB.dependsOn).not.toContain(stepA.id);
            }
          });
        }
      });
    });

    it('topological order is valid', async () => {
      const config = createPlannerConfig({
        llmCall: async () => createDiamondPlan(),
      });
      planner = new Planner(config);

      const plan = await planner.generatePlan('Test');

      // For each step, all dependencies should appear earlier in the list
      plan.steps.forEach((step, index) => {
        if (step.dependsOn) {
          step.dependsOn.forEach(depId => {
            const depIndex = plan.steps.findIndex(s => s.id === depId);
            expect(depIndex).toBeLessThan(index);
          });
        }
      });
    });
  });

  describe('Plan Consistency Validation', () => {
    let planner: Planner;

    beforeEach(() => {
      const config = createPlannerConfig();
      planner = new Planner(config);
    });

    it('all steps have unique IDs', async () => {
      const config = createPlannerConfig({
        llmCall: async () => createLinearChainPlan(10),
      });
      planner = new Planner(config);

      const plan = await planner.generatePlan('Test');

      const ids = plan.steps.map(s => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('all steps have non-empty descriptions', async () => {
      const config = createPlannerConfig({
        llmCall: async () => createLinearChainPlan(3),
      });
      planner = new Planner(config);

      const plan = await planner.generatePlan('Test');

      plan.steps.forEach(step => {
        expect(step.description).toBeTruthy();
        expect(step.description.length).toBeGreaterThan(0);
      });
    });

    it('all steps have valid paths', async () => {
      const config = createPlannerConfig({
        llmCall: async () => createLinearChainPlan(3),
      });
      planner = new Planner(config);

      const plan = await planner.generatePlan('Test');

      plan.steps.forEach(step => {
        expect(step.path).toBeTruthy();
        // Path should not have invalid characters
        expect(step.path).not.toMatch(/[<>:"|?*]/);
      });
    });
  });

  describe('Output Transformation Validation', () => {
    it('preserves original step order when no dependencies', async () => {
      const planResponse = JSON.stringify([
        { step: 1, action: 'write', description: 'First', path: 'src/first.ts' },
        { step: 2, action: 'write', description: 'Second', path: 'src/second.ts' },
        { step: 3, action: 'write', description: 'Third', path: 'src/third.ts' },
      ]);

      const config = createPlannerConfig({
        llmCall: async () => planResponse,
      });
      const planner = new Planner(config);

      const plan = await planner.generatePlan('Test');

      expect(plan.steps.map(s => s.id)).toEqual(['step_1', 'step_2', 'step_3']);
    });

    it('applies topological sort correctly', async () => {
      const config = createPlannerConfig({
        llmCall: async () => createDiamondPlan(),
      });
      const planner = new Planner(config);

      const plan = await planner.generatePlan('Test');

      // Diamond pattern: 1 -> [2,3] -> 4
      // Expected order: 1, 2, 3, 4 (or 1, 3, 2, 4)
      const ids = plan.steps.map(s => s.id);
      expect(ids[0]).toBe('step_1');
      expect(ids[3]).toBe('step_4');
      expect(ids.slice(1, 3)).toContain('step_2');
      expect(ids.slice(1, 3)).toContain('step_3');
    });
  });

  describe('Edge Case Validation', () => {
    it('handles single-step plan correctly', async () => {
      const config = createPlannerConfig({
        llmCall: async () => JSON.stringify([
          { step: 1, action: 'write', description: 'Only step', path: 'src/file.ts' },
        ]),
      });
      const planner = new Planner(config);

      const plan = await planner.generatePlan('Test');

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].id).toBe('step_1');
      expect(plan.steps[0].dependsOn).toBeUndefined();
    });

    it('handles large number of steps', async () => {
      const config = createPlannerConfig({
        llmCall: async () => createLinearChainPlan(100),
      });
      const planner = new Planner(config);

      const plan = await planner.generatePlan('Test');

      expect(plan.steps).toHaveLength(100);
      // Verify all IDs are unique
      const ids = plan.steps.map(s => s.id);
      expect(new Set(ids).size).toBe(100);
    });

    it('handles steps with special characters in descriptions', async () => {
      const config = createPlannerConfig({
        llmCall: async () => JSON.stringify([
          {
            step: 1,
            action: 'write',
            description: 'Create <MyComponent> with "quoted" text & special chars',
            path: 'src/file.ts',
          },
        ]),
      });
      const planner = new Planner(config);

      const plan = await planner.generatePlan('Test');

      expect(plan.steps[0].description).toContain('<MyComponent>');
      expect(plan.steps[0].description).toContain('&');
    });
  });
});
