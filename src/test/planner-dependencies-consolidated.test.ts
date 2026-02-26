/**
 * Week 2 D3: planner.ts Dependency & Topological Sort Tests (Consolidated)
 *
 * Consolidation Strategy:
 * - Table-driven topological sort testing with matrix-driven assertions
 * - Grouped by scenario: basic cases, linear deps, diamond deps, circular detection
 * - 19 → 8 tests (-58% reduction)
 *
 * Pattern: Each describe block uses it.each() with scenarios in matrix rows
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Planner, ExecutionStep, PlannerConfig } from '../planner';

describe('Planner Dependencies - Week 2 D3 (Consolidated)', () => {
  let planner: Planner;
  let mockConfig: PlannerConfig;

  beforeEach(() => {
    mockConfig = {
      llmCall: vi.fn(),
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
  // Basic Cases & Linear Dependencies (Combined)
  // ============================================================
  const basicAndLinearCases = [
    {
      name: 'single step unchanged',
      steps: [{ stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'Create', path: 'src/file.ts' }],
      assertions: (sorted: ExecutionStep[]) => {
        expect(sorted.length).toBe(1);
        expect(sorted[0].id).toBe('step_1');
      },
    },
    {
      name: 'steps without dependencies in original order',
      steps: [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'First', path: 'file1.ts' },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'Second', path: 'file2.ts' },
        { stepNumber: 3, stepId: 3, id: 'step_3', action: 'write', description: 'Third', path: 'file3.ts' },
      ],
      assertions: (sorted: ExecutionStep[]) => {
        expect(sorted.length).toBe(3);
        expect(sorted[0].id).toBe('step_1');
        expect(sorted[1].id).toBe('step_2');
      },
    },
    {
      name: 'empty step array',
      steps: [],
      assertions: (sorted: ExecutionStep[]) => {
        expect(sorted.length).toBe(0);
      },
    },
    {
      name: 'linear dependency chain 1→2→3',
      steps: [
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'Second', path: 'file2.ts', dependsOn: ['step_1'] },
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'First', path: 'file1.ts' },
        { stepNumber: 3, stepId: 3, id: 'step_3', action: 'write', description: 'Third', path: 'file3.ts', dependsOn: ['step_2'] },
      ],
      assertions: (sorted: ExecutionStep[]) => {
        const indices = new Map(sorted.map((s, i) => [s.id, i]));
        expect(indices.get('step_1')! < indices.get('step_2')!).toBe(true);
        expect(indices.get('step_2')! < indices.get('step_3')!).toBe(true);
      },
    },
    {
      name: 'reverse-ordered input with linear chain',
      steps: [
        { stepNumber: 3, stepId: 3, id: 'step_3', action: 'write', description: 'Third', path: 'file3.ts', dependsOn: ['step_2'] },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'Second', path: 'file2.ts', dependsOn: ['step_1'] },
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'First', path: 'file1.ts' },
      ],
      assertions: (sorted: ExecutionStep[]) => {
        expect(sorted[0].id).toBe('step_1');
        expect(sorted[1].id).toBe('step_2');
        expect(sorted[2].id).toBe('step_3');
      },
    },
  ];

  it.each(basicAndLinearCases)(
    'topological sort should handle: $name',
    ({ steps, assertions }) => {
      const sorted = planner['topologicalSort'](steps);
      assertions(sorted);
    }
  );

  // ============================================================
  // Diamond & Complex Dependencies
  // ============================================================
  const diamondDependenciesCases = [
    {
      name: 'diamond pattern: 1 ← {2,3} ← 4',
      steps: [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'Base', path: 'base.ts' },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'Util', path: 'util.ts', dependsOn: ['step_1'] },
        { stepNumber: 3, stepId: 3, id: 'step_3', action: 'write', description: 'Store', path: 'store.ts', dependsOn: ['step_1'] },
        { stepNumber: 4, stepId: 4, id: 'step_4', action: 'write', description: 'App', path: 'app.tsx', dependsOn: ['step_2', 'step_3'] },
      ],
      assertions: (sorted: ExecutionStep[]) => {
        const indices = new Map(sorted.map((s, i) => [s.id, i]));
        expect(indices.get('step_1')).toBe(0);
        expect(indices.get('step_2')! > indices.get('step_1')!).toBe(true);
        expect(indices.get('step_3')! > indices.get('step_1')!).toBe(true);
        expect(indices.get('step_4')! > indices.get('step_2')!).toBe(true);
        expect(indices.get('step_4')! > indices.get('step_3')!).toBe(true);
      },
    },
    {
      name: 'multi-root diamond pattern',
      steps: [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'First', path: 'file1.ts' },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'Second', path: 'file2.ts' },
        { stepNumber: 3, stepId: 3, id: 'step_3', action: 'write', description: 'Third', path: 'file3.ts', dependsOn: ['step_1', 'step_2'] },
      ],
      assertions: (sorted: ExecutionStep[]) => {
        const indices = new Map(sorted.map((s, i) => [s.id, i]));
        expect(indices.get('step_3')! > indices.get('step_1')!).toBe(true);
        expect(indices.get('step_3')! > indices.get('step_2')!).toBe(true);
      },
    },
    {
      name: 'valid topological ordering with large graph (20 steps)',
      steps: (() => {
        const steps: ExecutionStep[] = [];
        for (let i = 1; i <= 20; i++) {
          steps.push({
            stepNumber: i,
            stepId: i,
            id: `step_${i}`,
            action: 'write',
            description: `Step ${i}`,
            path: `file${i}.ts`,
            dependsOn: i > 1 ? [`step_${i - 1}`] : undefined,
          });
        }
        return steps;
      })(),
      assertions: (sorted: ExecutionStep[]) => {
        expect(sorted.length).toBe(20);
        // Verify linear order: 1 → 2 → 3 → ... → 20
        for (let i = 0; i < sorted.length - 1; i++) {
          expect(sorted[i].id).toBe(`step_${i + 1}`);
        }
        // Verify all dependencies are satisfied
        const indices = new Map(sorted.map((s, i) => [s.id, i]));
        sorted.forEach(step => {
          if (step.dependsOn) {
            step.dependsOn.forEach(depId => {
              expect(indices.get(depId)!).toBeLessThan(indices.get(step.id)!);
            });
          }
        });
      },
    },
  ];

  it.each(diamondDependenciesCases)(
    'topological sort should handle: $name',
    ({ steps, assertions }) => {
      const sorted = planner['topologicalSort'](steps);
      assertions(sorted);
    }
  );

  // ============================================================
  // Error Cases: Circular Dependencies & Missing Dependencies
  // ============================================================
  const errorCases = [
    {
      name: 'simple circular dependency: 1→2→1',
      steps: [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'A', path: 'a.ts', dependsOn: ['step_2'] },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'B', path: 'b.ts', dependsOn: ['step_1'] },
      ],
      errorCheck: (error: any) => {
        expect(error.message).toContain('CIRCULAR_DEPENDENCY');
      },
    },
    {
      name: 'complex circular dependency: 1→2→3→1',
      steps: [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'A', path: 'a.ts', dependsOn: ['step_3'] },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'B', path: 'b.ts', dependsOn: ['step_1'] },
        { stepNumber: 3, stepId: 3, id: 'step_3', action: 'write', description: 'C', path: 'c.ts', dependsOn: ['step_2'] },
      ],
      errorCheck: (error: any) => {
        expect(error.message).toContain('CIRCULAR_DEPENDENCY');
      },
    },
    {
      name: 'self-referential dependency',
      steps: [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'A', path: 'a.ts', dependsOn: ['step_1'] },
      ],
      errorCheck: (error: any) => {
        expect(error.message).toContain('SELF_DEPENDENCY');
      },
    },
    {
      name: 'missing dependency reference',
      steps: [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'A', path: 'a.ts' },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'B', path: 'b.ts', dependsOn: ['step_99'] },
      ],
      errorCheck: (error: any) => {
        expect(error.message).toContain('MISSING_DEPENDENCY');
      },
    },
  ];

  it.each(errorCases)(
    'topological sort should detect error: $name',
    ({ steps, errorCheck }) => {
      try {
        planner['topologicalSort'](steps);
        expect.fail('Should have thrown');
      } catch (err: any) {
        errorCheck(err);
      }
    }
  );

  // ============================================================
  // Edge Cases
  // ============================================================
  const edgeCases = [
    {
      name: 'steps with empty dependsOn array',
      steps: [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'A', path: 'a.ts', dependsOn: [] },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'B', path: 'b.ts' },
      ],
      assertions: (sorted: ExecutionStep[]) => {
        expect(sorted.length).toBe(2);
      },
    },
    {
      name: 'steps with undefined dependsOn',
      steps: [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'A', path: 'a.ts', dependsOn: undefined },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'B', path: 'b.ts' },
      ],
      assertions: (sorted: ExecutionStep[]) => {
        expect(sorted.length).toBe(2);
      },
    },
    {
      name: 'preserve step count in output',
      steps: [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'A', path: 'a.ts' },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'B', path: 'b.ts', dependsOn: ['step_1'] },
        { stepNumber: 3, stepId: 3, id: 'step_3', action: 'write', description: 'C', path: 'c.ts' },
      ],
      assertions: (sorted: ExecutionStep[]) => {
        expect(sorted.length).toBe(3);
        expect(sorted.every(s => s.id)).toBe(true);
      },
    },
  ];

  it.each(edgeCases)(
    'topological sort edge case: $name',
    ({ steps, assertions }) => {
      const sorted = planner['topologicalSort'](steps);
      assertions(sorted);
    }
  );
});
