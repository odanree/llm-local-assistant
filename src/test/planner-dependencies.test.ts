/**
 * Week 2 D3: planner.ts Dependency & Topological Sort Tests
 *
 * Focus: Dependency ordering, DAG validation, circular detection
 * Target: 15 tests covering topologicalSort and dependency scenarios
 * Execution Time: ~600ms
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Planner, ExecutionStep, PlannerConfig } from '../planner';

describe('Planner Dependencies - Week 2 D3', () => {
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
  // Topological Sort - Basic Cases
  // ============================================================
  describe('Topological Sort - Basic Cases', () => {
    it('should return single step unchanged', () => {
      const steps: ExecutionStep[] = [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'Create', path: 'src/file.ts' },
      ];

      const sorted = planner['topologicalSort'](steps);

      expect(sorted.length).toBe(1);
      expect(sorted[0].id).toBe('step_1');
    });

    it('should return steps without dependencies in original order', () => {
      const steps: ExecutionStep[] = [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'First', path: 'file1.ts' },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'Second', path: 'file2.ts' },
        { stepNumber: 3, stepId: 3, id: 'step_3', action: 'write', description: 'Third', path: 'file3.ts' },
      ];

      const sorted = planner['topologicalSort'](steps);

      expect(sorted.length).toBe(3);
      expect(sorted[0].id).toBe('step_1');
      expect(sorted[1].id).toBe('step_2');
    });

    it('should handle empty step array', () => {
      const steps: ExecutionStep[] = [];

      const sorted = planner['topologicalSort'](steps);

      expect(sorted.length).toBe(0);
    });
  });

  // ============================================================
  // Topological Sort - Linear Dependencies
  // ============================================================
  describe('Topological Sort - Linear Dependencies', () => {
    it('should sort linear dependency chain 1→2→3', () => {
      const steps: ExecutionStep[] = [
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'Second', path: 'file2.ts', dependsOn: ['step_1'] },
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'First', path: 'file1.ts' },
        { stepNumber: 3, stepId: 3, id: 'step_3', action: 'write', description: 'Third', path: 'file3.ts', dependsOn: ['step_2'] },
      ];

      const sorted = planner['topologicalSort'](steps);

      const indices = new Map(sorted.map((s, i) => [s.id, i]));
      expect(indices.get('step_1')! < indices.get('step_2')!).toBe(true);
      expect(indices.get('step_2')! < indices.get('step_3')!).toBe(true);
    });

    it('should handle reverse-ordered input', () => {
      const steps: ExecutionStep[] = [
        { stepNumber: 3, stepId: 3, id: 'step_3', action: 'write', description: 'Third', path: 'file3.ts', dependsOn: ['step_2'] },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'Second', path: 'file2.ts', dependsOn: ['step_1'] },
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'First', path: 'file1.ts' },
      ];

      const sorted = planner['topologicalSort'](steps);

      expect(sorted[0].id).toBe('step_1');
      expect(sorted[1].id).toBe('step_2');
      expect(sorted[2].id).toBe('step_3');
    });
  });

  // ============================================================
  // Topological Sort - Diamond Dependencies
  // ============================================================
  describe('Topological Sort - Diamond Dependencies', () => {
    it('should handle diamond pattern: 1 ← {2,3} ← 4', () => {
      const steps: ExecutionStep[] = [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'Base', path: 'base.ts' },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'Util', path: 'util.ts', dependsOn: ['step_1'] },
        { stepNumber: 3, stepId: 3, id: 'step_3', action: 'write', description: 'Store', path: 'store.ts', dependsOn: ['step_1'] },
        { stepNumber: 4, stepId: 4, id: 'step_4', action: 'write', description: 'App', path: 'app.tsx', dependsOn: ['step_2', 'step_3'] },
      ];

      const sorted = planner['topologicalSort'](steps);

      const indices = new Map(sorted.map((s, i) => [s.id, i]));
      
      // step_1 must be first
      expect(indices.get('step_1')).toBe(0);
      
      // step_2 and step_3 must come after step_1
      expect(indices.get('step_2')! > indices.get('step_1')!).toBe(true);
      expect(indices.get('step_3')! > indices.get('step_1')!).toBe(true);
      
      // step_4 must come after both step_2 and step_3
      expect(indices.get('step_4')! > indices.get('step_2')!).toBe(true);
      expect(indices.get('step_4')! > indices.get('step_3')!).toBe(true);
    });

    it('should handle multi-root diamond pattern', () => {
      const steps: ExecutionStep[] = [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'First', path: 'file1.ts' },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'Second', path: 'file2.ts' },
        { stepNumber: 3, stepId: 3, id: 'step_3', action: 'write', description: 'Third', path: 'file3.ts', dependsOn: ['step_1', 'step_2'] },
      ];

      const sorted = planner['topologicalSort'](steps);

      const indices = new Map(sorted.map((s, i) => [s.id, i]));
      expect(indices.get('step_3')! > indices.get('step_1')!).toBe(true);
      expect(indices.get('step_3')! > indices.get('step_2')!).toBe(true);
    });
  });

  // ============================================================
  // Circular Dependency Detection
  // ============================================================
  describe('Circular Dependency Detection', () => {
    it('should detect simple circular dependency: 1→2→1', () => {
      const steps: ExecutionStep[] = [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'A', path: 'a.ts', dependsOn: ['step_2'] },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'B', path: 'b.ts', dependsOn: ['step_1'] },
      ];

      expect(() => {
        planner['topologicalSort'](steps);
      }).toThrow();
    });

    it('should detect complex circular dependency: 1→2→3→1', () => {
      const steps: ExecutionStep[] = [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'A', path: 'a.ts', dependsOn: ['step_3'] },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'B', path: 'b.ts', dependsOn: ['step_1'] },
        { stepNumber: 3, stepId: 3, id: 'step_3', action: 'write', description: 'C', path: 'c.ts', dependsOn: ['step_2'] },
      ];

      expect(() => {
        planner['topologicalSort'](steps);
      }).toThrow();
    });

    it('should throw error message with cycle info', () => {
      const steps: ExecutionStep[] = [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'A', path: 'a.ts', dependsOn: ['step_2'] },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'B', path: 'b.ts', dependsOn: ['step_1'] },
      ];

      try {
        planner['topologicalSort'](steps);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).toContain('CIRCULAR_DEPENDENCY');
      }
    });
  });

  // ============================================================
  // Missing Dependency Detection
  // ============================================================
  describe('Missing Dependency Detection', () => {
    it('should detect missing dependency reference', () => {
      const steps: ExecutionStep[] = [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'A', path: 'a.ts' },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'B', path: 'b.ts', dependsOn: ['step_99'] },
      ];

      expect(() => {
        planner['topologicalSort'](steps);
      }).toThrow();
    });

    it('should provide helpful error message for missing dependency', () => {
      const steps: ExecutionStep[] = [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'A', path: 'a.ts' },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'B', path: 'b.ts', dependsOn: ['step_missing'] },
      ];

      try {
        planner['topologicalSort'](steps);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).toContain('MISSING_DEPENDENCY');
      }
    });
  });

  // ============================================================
  // Self-Referential Dependency Detection
  // ============================================================
  describe('Self-Referential Dependency Detection', () => {
    it('should reject self-referential dependencies', () => {
      const steps: ExecutionStep[] = [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'A', path: 'a.ts', dependsOn: ['step_1'] },
      ];

      expect(() => {
        planner['topologicalSort'](steps);
      }).toThrow();
    });

    it('should throw SELF_DEPENDENCY error', () => {
      const steps: ExecutionStep[] = [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'A', path: 'a.ts', dependsOn: ['step_1'] },
      ];

      try {
        planner['topologicalSort'](steps);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).toContain('SELF_DEPENDENCY');
      }
    });
  });

  // ============================================================
  // Kahn's Algorithm Correctness
  // ============================================================
  describe("Kahn's Algorithm Correctness", () => {
    it('should produce valid topological ordering', () => {
      const steps: ExecutionStep[] = [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'A', path: 'a.ts' },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'B', path: 'b.ts', dependsOn: ['step_1'] },
        { stepNumber: 3, stepId: 3, id: 'step_3', action: 'write', description: 'C', path: 'c.ts', dependsOn: ['step_1'] },
        { stepNumber: 4, stepId: 4, id: 'step_4', action: 'write', description: 'D', path: 'd.ts', dependsOn: ['step_2', 'step_3'] },
      ];

      const sorted = planner['topologicalSort'](steps);

      // Verify ordering property: for each edge, source comes before destination
      const indices = new Map(sorted.map((s, i) => [s.id, i]));
      
      steps.forEach(step => {
        if (step.dependsOn) {
          step.dependsOn.forEach(depId => {
            const depIndex = indices.get(depId);
            const currentIndex = indices.get(step.id);
            expect(depIndex).toBeLessThan(currentIndex);
          });
        }
      });
    });

    it('should handle large graphs (20+ steps)', () => {
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

      const sorted = planner['topologicalSort'](steps);

      expect(sorted.length).toBe(20);
      // Verify linear order: 1 → 2 → 3 → ... → 20
      for (let i = 0; i < sorted.length - 1; i++) {
        expect(sorted[i].id).toBe(`step_${i + 1}`);
      }
    });
  });

  // ============================================================
  // Edge Cases
  // ============================================================
  describe('Edge Cases', () => {
    it('should handle steps with empty dependsOn array', () => {
      const steps: ExecutionStep[] = [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'A', path: 'a.ts', dependsOn: [] },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'B', path: 'b.ts' },
      ];

      const sorted = planner['topologicalSort'](steps);

      expect(sorted.length).toBe(2);
    });

    it('should handle steps with undefined dependsOn', () => {
      const steps: ExecutionStep[] = [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'A', path: 'a.ts', dependsOn: undefined },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'B', path: 'b.ts' },
      ];

      const sorted = planner['topologicalSort'](steps);

      expect(sorted.length).toBe(2);
    });

    it('should preserve step count in output', () => {
      const steps: ExecutionStep[] = [
        { stepNumber: 1, stepId: 1, id: 'step_1', action: 'write', description: 'A', path: 'a.ts' },
        { stepNumber: 2, stepId: 2, id: 'step_2', action: 'write', description: 'B', path: 'b.ts', dependsOn: ['step_1'] },
        { stepNumber: 3, stepId: 3, id: 'step_3', action: 'write', description: 'C', path: 'c.ts' },
      ];

      const sorted = planner['topologicalSort'](steps);

      expect(sorted.length).toBe(3);
      expect(sorted.every(s => s.id)).toBe(true);
    });
  });
});
