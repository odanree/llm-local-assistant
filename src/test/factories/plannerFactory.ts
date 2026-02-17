/**
 * Test Factory: Planner
 *
 * Provides type-safe factory methods for creating test data
 * Replaces scattered mock creation across test files
 *
 * Usage:
 *   const mockConfig = createPlannerConfig();
 *   const mockLLMCall = createMockLLMCall('success');
 */

import { vi } from 'vitest';
import type { PlannerConfig } from '../../planner';

/**
 * Create a valid PlannerConfig with sensible defaults
 */
export function createPlannerConfig(overrides?: Partial<PlannerConfig>): PlannerConfig {
  return {
    llmCall: vi.fn(async () => '[]'),
    onProgress: vi.fn(),
    projectContext: {
      language: 'typescript',
      strategy: 'DIFF_MODE',
      extension: '.tsx',
      root: 'src',
      isMinimalProject: false,
    },
    ...overrides,
  };
}

/**
 * Create a mock LLM response with a plan
 */
export function createPlanResponse(steps: Array<{
  step: number;
  action: 'read' | 'write' | 'run' | 'delete';
  description: string;
  path: string;
  notes?: string;
}>) {
  return JSON.stringify(steps);
}

/**
 * Create a single step definition
 */
export function createStep(
  step: number,
  action: 'read' | 'write' | 'run' | 'delete',
  description: string,
  path: string,
  notes?: string
) {
  return {
    step,
    action,
    description,
    path,
    ...(notes && { notes }),
  };
}

/**
 * Create a mock LLM call that returns a plan
 */
export function createMockLLMCall(responseType: 'success' | 'error' | 'malformed' = 'success') {
  const mockFn = vi.fn();

  switch (responseType) {
    case 'success':
      mockFn.mockResolvedValue(JSON.stringify([
        createStep(1, 'write', 'Test step', 'src/test.ts'),
      ]));
      break;
    case 'error':
      mockFn.mockRejectedValue(new Error('LLM call failed'));
      break;
    case 'malformed':
      mockFn.mockResolvedValue('invalid json {{{');
      break;
  }

  return mockFn;
}

/**
 * Create a plan response with dependencies
 */
export function createPlanWithDependencies(
  steps: Array<{
    step: number;
    action: string;
    description: string;
    path: string;
    dependsOn?: number[];
  }>
) {
  return JSON.stringify(
    steps.map(s => ({
      step: s.step,
      action: s.action,
      description: s.description,
      path: s.path,
      ...(s.dependsOn && { notes: `Depends on: ${s.dependsOn.map(n => `step_${n}`).join(', ')}` }),
    }))
  );
}

/**
 * Create a linear chain plan (A → B → C → ...)
 */
export function createLinearChainPlan(count: number = 3) {
  const steps = Array.from({ length: count }, (_, i) => ({
    step: i + 1,
    action: 'write' as const,
    description: `Create step ${i + 1}`,
    path: `src/file${i + 1}.ts`,
    notes: i > 0 ? `Depends on: step_${i}` : undefined,
  }));

  return JSON.stringify(steps);
}

/**
 * Create a parallel plan (A → B, C, D)
 */
export function createParallelPlan() {
  return JSON.stringify([
    { step: 1, action: 'write', description: 'Create base', path: 'src/base.ts' },
    { step: 2, action: 'write', description: 'Create B', path: 'src/b.ts', notes: 'Depends on: step_1' },
    { step: 3, action: 'write', description: 'Create C', path: 'src/c.ts', notes: 'Depends on: step_1' },
    { step: 4, action: 'write', description: 'Create D', path: 'src/d.ts', notes: 'Depends on: step_1' },
  ]);
}

/**
 * Create a diamond plan (A → B, C → D)
 */
export function createDiamondPlan() {
  return JSON.stringify([
    { step: 1, action: 'write', description: 'Create base', path: 'src/base.ts' },
    { step: 2, action: 'write', description: 'Create B', path: 'src/b.ts', notes: 'Depends on: step_1' },
    { step: 3, action: 'write', description: 'Create C', path: 'src/c.ts', notes: 'Depends on: step_1' },
    { step: 4, action: 'write', description: 'Create D', path: 'src/d.ts', notes: 'Depends on: step_2, step_3' },
  ]);
}

/**
 * Create a plan with circular dependencies
 */
export function createCircularPlan() {
  return JSON.stringify([
    { step: 1, action: 'write', description: 'Create A', path: 'src/a.ts', notes: 'Depends on: step_2' },
    { step: 2, action: 'write', description: 'Create B', path: 'src/b.ts', notes: 'Depends on: step_1' },
  ]);
}

/**
 * Create a plan with missing dependencies
 */
export function createPlanWithMissingDeps() {
  return JSON.stringify([
    { step: 1, action: 'write', description: 'Create A', path: 'src/a.ts' },
    { step: 2, action: 'write', description: 'Create B', path: 'src/b.ts', notes: 'Depends on: step_99' },
  ]);
}
