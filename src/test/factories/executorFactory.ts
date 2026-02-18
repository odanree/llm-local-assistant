/**
 * Test Factory: Executor
 *
 * Type-safe mock data for executor tests
 */

import { vi } from 'vitest';
import type { TaskPlan, ExecutionStep } from '../../planner';

/**
 * Create a minimal ExecutionStep
 */
export function createExecutionStep(overrides?: Partial<ExecutionStep>): ExecutionStep {
  return {
    stepNumber: 1,
    stepId: 1,
    id: 'step_1',
    action: 'write',
    description: 'Test step',
    path: 'src/test.ts',
    expectedOutcome: 'Test completed',
    ...overrides,
  };
}

/**
 * Create a TaskPlan
 */
export function createTaskPlan(overrides?: Partial<TaskPlan>): TaskPlan {
  return {
    taskId: `plan-${Date.now()}`,
    userRequest: 'Test request',
    steps: [createExecutionStep()],
    generatedAt: new Date(),
    reasoning: 'Test reasoning',
    ...overrides,
  };
}

/**
 * Create mock executor config
 */
export function createExecutorConfig(overrides?: any) {
  return {
    extension: {} as any,
    llmClient: {
      sendMessage: vi.fn(),
      clearHistory: vi.fn(),
    },
    workspace: {
      fsPath: '/workspace',
    },
    maxRetries: 2,
    timeout: 30000,
    onProgress: vi.fn(),
    onMessage: vi.fn(),
    ...overrides,
  };
}

/**
 * Create a plan with multiple sequential steps
 */
export function createSequentialPlan(stepCount: number = 3): TaskPlan {
  const steps = Array.from({ length: stepCount }, (_, i) =>
    createExecutionStep({
      stepNumber: i + 1,
      id: `step_${i + 1}`,
      description: `Step ${i + 1}`,
      path: `src/file${i + 1}.ts`,
    })
  );

  return createTaskPlan({ steps });
}

/**
 * Create a plan with dependent steps
 */
export function createDependentPlan(): TaskPlan {
  const steps = [
    createExecutionStep({
      stepNumber: 1,
      id: 'step_1',
      description: 'Create config',
      path: 'src/config.ts',
    }),
    createExecutionStep({
      stepNumber: 2,
      id: 'step_2',
      description: 'Create component',
      path: 'src/Component.tsx',
      dependsOn: ['step_1'],
    }),
    createExecutionStep({
      stepNumber: 3,
      id: 'step_3',
      description: 'Create tests',
      path: 'src/Component.test.tsx',
      dependsOn: ['step_2'],
    }),
  ];

  return createTaskPlan({ steps });
}
