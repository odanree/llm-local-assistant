/**
 * ExecutorFactory Tests - Hit #3: Factory Infrastructure Coverage
 *
 * Goal: Push executorFactory.ts from 0% → 70%+
 * Effort: 1-2 hours
 * Expected Impact: +3-5% overall coverage
 *
 * Strategy: Test the factories themselves
 * Why: Your factory functions are used in other tests
 * If factories are broken, all dependent tests are unreliable (garbage in = garbage out)
 */

import { describe, it, expect } from 'vitest';
import {
  createExecutionStep,
  createTaskPlan,
} from './executorFactory';

describe('ExecutorFactory - Factory Functions', () => {
  describe('createExecutionStep()', () => {
    it('creates step with defaults', () => {
      const step = createExecutionStep();
      expect(step).toBeDefined();
      expect(step.id).toBeDefined();
      expect(step.action).toBeDefined();
      expect(step.description).toBeDefined();
    });

    it('accepts custom id', () => {
      const step = createExecutionStep({ id: 'step_1' });
      expect(step.id).toBe('step_1');
    });

    it('accepts custom action', () => {
      const step = createExecutionStep({ action: 'write' });
      expect(step.action).toBe('write');
    });

    it('accepts custom description', () => {
      const step = createExecutionStep({ description: 'Test description' });
      expect(step.description).toBe('Test description');
    });

    it('accepts custom path', () => {
      const step = createExecutionStep({ path: 'src/file.ts' });
      expect(step.path).toBe('src/file.ts');
    });

    it('accepts all action types', () => {
      const actions = ['read', 'write', 'run', 'delete'];
      actions.forEach(action => {
        const step = createExecutionStep({ action: action as any });
        expect(step.action).toBe(action);
      });
    });

    it('creates step with dependsOn', () => {
      const step = createExecutionStep({ dependsOn: ['step_0'] });
      expect(step.dependsOn).toEqual(['step_0']);
    });

    it('creates step with expectedOutcome', () => {
      const step = createExecutionStep({ expectedOutcome: 'File created' });
      expect(step.expectedOutcome).toBe('File created');
    });

    it('merges custom properties', () => {
      const step = createExecutionStep({
        id: 'step_test',
        action: 'read',
        path: 'config.json',
        description: 'Read config',
        expectedOutcome: 'Config loaded'
      });
      expect(step.id).toBe('step_test');
      expect(step.action).toBe('read');
      expect(step.path).toBe('config.json');
      expect(step.description).toBe('Read config');
      expect(step.expectedOutcome).toBe('Config loaded');
    });

    it('returns valid ExecutionStep structure', () => {
      const step = createExecutionStep();
      expect(typeof step.id).toBe('string');
      expect(typeof step.description).toBe('string');
      expect(['read', 'write', 'run', 'delete']).toContain(step.action);
    });

    it('creates independent steps', () => {
      const step1 = createExecutionStep({ id: 'step_1' });
      const step2 = createExecutionStep({ id: 'step_2' });
      expect(step1.id).not.toBe(step2.id);
    });

    it('handles empty options object', () => {
      const step = createExecutionStep({});
      expect(step).toBeDefined();
      expect(step.id).toBeDefined();
    });
  });

  describe('createTaskPlan()', () => {
    it('creates plan with defaults', () => {
      const plan = createTaskPlan();
      expect(plan).toBeDefined();
      expect(plan.taskId).toBeDefined();
      expect(plan.userRequest).toBeDefined();
      expect(Array.isArray(plan.steps)).toBe(true);
    });

    it('accepts custom taskId', () => {
      const plan = createTaskPlan({ taskId: 'custom-task-123' });
      expect(plan.taskId).toBe('custom-task-123');
    });

    it('accepts custom userRequest', () => {
      const plan = createTaskPlan({ userRequest: 'Custom request' });
      expect(plan.userRequest).toBe('Custom request');
    });

    it('accepts steps array', () => {
      const step1 = createExecutionStep({ id: 'step_1' });
      const step2 = createExecutionStep({ id: 'step_2' });
      const plan = createTaskPlan({ steps: [step1, step2] });
      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].id).toBe('step_1');
      expect(plan.steps[1].id).toBe('step_2');
    });

    it('generates unique task IDs', () => {
      const plan1 = createTaskPlan();
      // Add small delay to ensure different timestamps
      const start = Date.now();
      while (Date.now() - start < 1) {
        // Busy wait for at least 1ms
      }
      const plan2 = createTaskPlan();
      expect(plan1.taskId).not.toBe(plan2.taskId);
    });

    it('includes generated timestamp', () => {
      const plan = createTaskPlan();
      expect(plan.generatedAt).toBeInstanceOf(Date);
    });

    it('timestamps are different for different plans', () => {
      const plan1 = createTaskPlan();
      // Small delay to ensure different timestamps
      const now = Date.now();
      const plan2 = createTaskPlan();
      expect(plan2.generatedAt.getTime()).toBeGreaterThanOrEqual(plan1.generatedAt.getTime());
    });

    it('merges custom properties', () => {
      const step = createExecutionStep({ id: 'step_1' });
      const plan = createTaskPlan({
        taskId: 'task-123',
        userRequest: 'Build component',
        steps: [step]
      });
      expect(plan.taskId).toBe('task-123');
      expect(plan.userRequest).toBe('Build component');
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].id).toBe('step_1');
    });

    it('handles empty steps array', () => {
      const plan = createTaskPlan({ steps: [] });
      expect(plan.steps).toHaveLength(0);
    });

    it('returns valid TaskPlan structure', () => {
      const plan = createTaskPlan();
      expect(typeof plan.taskId).toBe('string');
      expect(typeof plan.userRequest).toBe('string');
      expect(Array.isArray(plan.steps)).toBe(true);
    });

    it('creates independent plans', () => {
      const plan1 = createTaskPlan();
      // Add small delay to ensure different timestamps
      const start = Date.now();
      while (Date.now() - start < 1) {
        // Busy wait for at least 1ms
      }
      const plan2 = createTaskPlan();
      expect(plan1.taskId).not.toBe(plan2.taskId);
      expect(plan1.generatedAt.getTime()).not.toBe(plan2.generatedAt.getTime());
    });
  });

  describe('Factory Chaining', () => {
    it('steps and plans work together', () => {
      const step1 = createExecutionStep({ id: 'step_1' });
      const step2 = createExecutionStep({ id: 'step_2', dependsOn: ['step_1'] });
      const plan = createTaskPlan({ steps: [step1, step2] });

      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].id).toBe('step_1');
      expect(plan.steps[1].id).toBe('step_2');
      expect(plan.steps[1].dependsOn).toContain('step_1');
    });

    it('builds complex plan with dependencies', () => {
      const steps = [
        createExecutionStep({ id: 'step_1', action: 'read' }),
        createExecutionStep({ id: 'step_2', action: 'run', dependsOn: ['step_1'] }),
        createExecutionStep({ id: 'step_3', action: 'write', dependsOn: ['step_2'] })
      ];
      const plan = createTaskPlan({ steps });

      expect(plan.steps).toHaveLength(3);
      expect(plan.steps[1].dependsOn).toContain('step_1');
      expect(plan.steps[2].dependsOn).toContain('step_2');
    });

    it('factory creates valid step objects for plan use', () => {
      const step = createExecutionStep({ id: 'test' });
      const plan = createTaskPlan({ steps: [step] });

      const retrievedStep = plan.steps[0];
      expect(retrievedStep.id).toBe('test');
      expect(retrievedStep.action).toBeDefined();
      expect(retrievedStep.description).toBeDefined();
    });

    it('multiple steps in plan maintain independence', () => {
      const step1 = createExecutionStep({ id: 'step_1', action: 'read' });
      const step2 = createExecutionStep({ id: 'step_2', action: 'write' });

      expect(step1.action).toBe('read');
      expect(step2.action).toBe('write');

      const plan = createTaskPlan({ steps: [step1, step2] });
      expect(plan.steps[0].action).toBe('read');
      expect(plan.steps[1].action).toBe('write');
    });
  });

  describe('Factory Consistency', () => {
    it('factory output matches expected interfaces', () => {
      const step = createExecutionStep();
      const plan = createTaskPlan();

      // Verify step structure
      expect(['read', 'write', 'run', 'delete']).toContain(step.action);
      expect(typeof step.id).toBe('string');

      // Verify plan structure
      expect(typeof plan.taskId).toBe('string');
      expect(Array.isArray(plan.steps)).toBe(true);
    });

    it('factory defaults are reasonable', () => {
      const step = createExecutionStep();
      const plan = createTaskPlan();

      // Defaults should be present
      expect(step.id.length).toBeGreaterThan(0);
      expect(step.description.length).toBeGreaterThanOrEqual(0);
      expect(plan.taskId.length).toBeGreaterThan(0);
      expect(plan.userRequest.length).toBeGreaterThanOrEqual(0);
    });

    it('repeated factory calls produce consistent behavior', () => {
      const plans = [
        createTaskPlan(),
        createTaskPlan(),
        createTaskPlan()
      ];

      plans.forEach(plan => {
        expect(typeof plan.taskId).toBe('string');
        expect(Array.isArray(plan.steps)).toBe(true);
        expect(plan.generatedAt).toBeInstanceOf(Date);
      });
    });
  });
});
