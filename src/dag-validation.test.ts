import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Planner } from './planner';

/**
 * Tests for DAG Dependency Validation (Phase 2.4)
 *
 * Tests the topological sorting, circular dependency detection,
 * and missing dependency detection in the Planner.
 *
 * NOTE: Step IDs are generated as step_1, step_2, etc. based on position
 */

describe('DAG Dependency Validation', () => {
  let planner: Planner;
  let mockConfig: any;

  beforeEach(() => {
    mockConfig = {
      llmCall: async (prompt: string) => '',
      projectContext: {
        language: 'typescript',
        strategy: 'component-based',
        extension: '.tsx',
        root: 'src',
        isMinimalProject: false,
      },
      onProgress: undefined,
    };
  });

  describe('Topological Sorting - Linear Chains', () => {
    it('sorts linear dependency chain step1 → step2 → step3', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create A", "path": "src/a.ts"},
  {"step": 2, "action": "write", "description": "Create B", "path": "src/b.ts", "notes": "Depends on: step_1"},
  {"step": 3, "action": "write", "description": "Create C", "path": "src/c.ts", "notes": "Depends on: step_2"}
]`;

      mockConfig.llmCall = vi.fn().mockResolvedValue(planResponse);
      planner = new Planner(mockConfig);

      const plan = await planner.generatePlan('Create ABC');
      expect(plan.steps[0].id).toBe('step_1');
      expect(plan.steps[1].id).toBe('step_2');
      expect(plan.steps[2].id).toBe('step_3');
      // Verify topological order was maintained
      expect(plan.steps.map(s => s.id)).toEqual(['step_1', 'step_2', 'step_3']);
    });

    it('maintains order for independent steps', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create A", "path": "src/a.ts"},
  {"step": 2, "action": "write", "description": "Create B", "path": "src/b.ts"},
  {"step": 3, "action": "write", "description": "Create C", "path": "src/c.ts"}
]`;

      mockConfig.llmCall = vi.fn().mockResolvedValue(planResponse);
      planner = new Planner(mockConfig);

      const plan = await planner.generatePlan('Create files');
      expect(plan.steps).toHaveLength(3);
      expect(plan.steps.every(s => !s.dependsOn || s.dependsOn.length === 0)).toBe(true);
    });
  });

  describe('Topological Sorting - Parallel Steps', () => {
    it('handles parallel steps before dependent step', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create base", "path": "src/base.ts"},
  {"step": 2, "action": "write", "description": "Create B", "path": "src/b.ts", "notes": "Depends on: step_1"},
  {"step": 3, "action": "write", "description": "Create C", "path": "src/c.ts", "notes": "Depends on: step_1"}
]`;

      mockConfig.llmCall = vi.fn().mockResolvedValue(planResponse);
      planner = new Planner(mockConfig);

      const plan = await planner.generatePlan('Create parallel');
      const step1Idx = plan.steps.findIndex(s => s.id === 'step_1');
      const step2Idx = plan.steps.findIndex(s => s.id === 'step_2');
      const step3Idx = plan.steps.findIndex(s => s.id === 'step_3');

      expect(step1Idx).toBeLessThan(step2Idx);
      expect(step1Idx).toBeLessThan(step3Idx);
    });

    it('handles multi-level parallel dependencies', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create base", "path": "src/base.ts"},
  {"step": 2, "action": "write", "description": "Create B", "path": "src/b.ts", "notes": "Depends on: step_1"},
  {"step": 3, "action": "write", "description": "Create C", "path": "src/c.ts", "notes": "Depends on: step_1"},
  {"step": 4, "action": "write", "description": "Create D", "path": "src/d.ts", "notes": "Depends on: step_1"}
]`;

      mockConfig.llmCall = vi.fn().mockResolvedValue(planResponse);
      planner = new Planner(mockConfig);

      const plan = await planner.generatePlan('Create multi-leaf');
      const step1Idx = plan.steps.findIndex(s => s.id === 'step_1');

      expect(plan.steps[0].id).toBe('step_1');
      expect(step1Idx).toBeLessThan(plan.steps.findIndex(s => s.id === 'step_2'));
      expect(step1Idx).toBeLessThan(plan.steps.findIndex(s => s.id === 'step_3'));
      expect(step1Idx).toBeLessThan(plan.steps.findIndex(s => s.id === 'step_4'));
    });
  });

  describe('Diamond Pattern Dependencies', () => {
    it('handles diamond pattern step1 → step2,step3 → step4', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create base", "path": "src/base.ts"},
  {"step": 2, "action": "write", "description": "Create B", "path": "src/b.ts", "notes": "Depends on: step_1"},
  {"step": 3, "action": "write", "description": "Create C", "path": "src/c.ts", "notes": "Depends on: step_1"},
  {"step": 4, "action": "write", "description": "Create D", "path": "src/d.ts", "notes": "Depends on: step_2, step_3"}
]`;

      mockConfig.llmCall = vi.fn().mockResolvedValue(planResponse);
      planner = new Planner(mockConfig);

      const plan = await planner.generatePlan('Create diamond');
      const indices = {
        1: plan.steps.findIndex(s => s.id === 'step_1'),
        2: plan.steps.findIndex(s => s.id === 'step_2'),
        3: plan.steps.findIndex(s => s.id === 'step_3'),
        4: plan.steps.findIndex(s => s.id === 'step_4'),
      };

      // step_1 comes first
      expect(indices[1]).toBeLessThan(indices[2]);
      expect(indices[1]).toBeLessThan(indices[3]);
      // step_2 and step_3 come before step_4
      expect(indices[2]).toBeLessThan(indices[4]);
      expect(indices[3]).toBeLessThan(indices[4]);
    });
  });

  describe('Multiple Independent Chains', () => {
    it('handles independent chains A→B and C→D', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create A", "path": "src/a.ts"},
  {"step": 2, "action": "write", "description": "Create B", "path": "src/b.ts", "notes": "Depends on: step_1"},
  {"step": 3, "action": "write", "description": "Create C", "path": "src/c.ts"},
  {"step": 4, "action": "write", "description": "Create D", "path": "src/d.ts", "notes": "Depends on: step_3"}
]`;

      mockConfig.llmCall = vi.fn().mockResolvedValue(planResponse);
      planner = new Planner(mockConfig);

      const plan = await planner.generatePlan('Create chains');
      const indices = {
        1: plan.steps.findIndex(s => s.id === 'step_1'),
        2: plan.steps.findIndex(s => s.id === 'step_2'),
        3: plan.steps.findIndex(s => s.id === 'step_3'),
        4: plan.steps.findIndex(s => s.id === 'step_4'),
      };

      // Chain 1: step_1 before step_2
      expect(indices[1]).toBeLessThan(indices[2]);
      // Chain 2: step_3 before step_4
      expect(indices[3]).toBeLessThan(indices[4]);
    });
  });

  describe('Circular Dependency Handling', () => {
    it('handles circular dependency with fallback ordering', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create A", "path": "src/a.ts", "notes": "Depends on: step_2"},
  {"step": 2, "action": "write", "description": "Create B", "path": "src/b.ts", "notes": "Depends on: step_1"}
]`;

      mockConfig.llmCall = vi.fn().mockResolvedValue(planResponse);
      planner = new Planner(mockConfig);

      // Circular dependency triggers fallback: original order is used
      const plan = await planner.generatePlan('Create AB');
      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].id).toBe('step_1');
      expect(plan.steps[1].id).toBe('step_2');
    });

    it('handles complex cycle with fallback', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create A", "path": "src/a.ts", "notes": "Depends on: step_3"},
  {"step": 2, "action": "write", "description": "Create B", "path": "src/b.ts", "notes": "Depends on: step_1"},
  {"step": 3, "action": "write", "description": "Create C", "path": "src/c.ts", "notes": "Depends on: step_2"}
]`;

      mockConfig.llmCall = vi.fn().mockResolvedValue(planResponse);
      planner = new Planner(mockConfig);

      // Should return original order due to cycle
      const plan = await planner.generatePlan('Create ABC');
      expect(plan.steps).toHaveLength(3);
      expect(plan.steps.map(s => s.id)).toEqual(['step_1', 'step_2', 'step_3']);
    });

    it('returns valid plan even on circular detection', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create A", "path": "src/a.ts", "notes": "Depends on: step_2"},
  {"step": 2, "action": "write", "description": "Create B", "path": "src/b.ts", "notes": "Depends on: step_1"}
]`;

      mockConfig.llmCall = vi.fn().mockResolvedValue(planResponse);
      planner = new Planner(mockConfig);

      const plan = await planner.generatePlan('Create AB');
      // Even with circular deps, plan is valid with original order
      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].id).toBe('step_1');
      expect(plan.steps[1].id).toBe('step_2');
    });
  });

  describe('Missing Dependency Detection', () => {
    it('detects reference to non-existent step and uses fallback ordering', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create B", "path": "src/b.ts", "notes": "Depends on: step_99"}
]`;

      mockConfig.llmCall = vi.fn().mockResolvedValue(planResponse);
      planner = new Planner(mockConfig);

      // The Planner falls back to original order on sort failure
      const plan = await planner.generatePlan('Create B');
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].id).toBe('step_1');
    });

    it('handles multiple steps with invalid dependency references', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create A", "path": "src/a.ts"},
  {"step": 2, "action": "write", "description": "Create B", "path": "src/b.ts", "notes": "Depends on: step_99"}
]`;

      mockConfig.llmCall = vi.fn().mockResolvedValue(planResponse);
      planner = new Planner(mockConfig);

      // Fallback behavior: returns original order
      const plan = await planner.generatePlan('Create AB');
      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].id).toBe('step_1');
      expect(plan.steps[1].id).toBe('step_2');
    });

    it('shows dependency attempt even when target missing', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create A", "path": "src/a.ts"},
  {"step": 2, "action": "write", "description": "Create B", "path": "src/b.ts", "notes": "Depends on: step_missing"}
]`;

      mockConfig.llmCall = vi.fn().mockResolvedValue(planResponse);
      planner = new Planner(mockConfig);

      const plan = await planner.generatePlan('Create AB');
      expect(plan.steps).toHaveLength(2);
      // Both steps should be present in fallback order
      expect(plan.steps[0].id).toBe('step_1');
      expect(plan.steps[1].id).toBe('step_2');
    });
  });

  describe('Edge Cases', () => {
    it('handles single step', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create file", "path": "src/file.ts"}
]`;

      mockConfig.llmCall = vi.fn().mockResolvedValue(planResponse);
      planner = new Planner(mockConfig);

      const plan = await planner.generatePlan('Create file');
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].id).toBe('step_1');
    });

    it('handles steps with no dependencies', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create A", "path": "src/a.ts"},
  {"step": 2, "action": "write", "description": "Create B", "path": "src/b.ts"}
]`;

      mockConfig.llmCall = vi.fn().mockResolvedValue(planResponse);
      planner = new Planner(mockConfig);

      const plan = await planner.generatePlan('Create files');
      expect(plan.steps.every(s => !s.dependsOn || s.dependsOn.length === 0)).toBe(true);
    });

    it('handles undefined dependsOn', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Create file", "path": "src/file.ts"}
]`;

      mockConfig.llmCall = vi.fn().mockResolvedValue(planResponse);
      planner = new Planner(mockConfig);

      const plan = await planner.generatePlan('Create file');
      expect(plan.steps[0].dependsOn).toBeUndefined();
    });

    it('preserves step order with no dependencies', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "First", "path": "src/first.ts"},
  {"step": 2, "action": "write", "description": "Second", "path": "src/second.ts"},
  {"step": 3, "action": "write", "description": "Third", "path": "src/third.ts"}
]`;

      mockConfig.llmCall = vi.fn().mockResolvedValue(planResponse);
      planner = new Planner(mockConfig);

      const plan = await planner.generatePlan('Create three');
      expect(plan.steps.map(s => s.id)).toEqual(['step_1', 'step_2', 'step_3']);
    });
  });

  describe('Integration: Full DAG Flow', () => {
    it('parses plan → generates IDs → extracts deps → topological sort', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Setup config", "path": "src/config.ts"},
  {"step": 2, "action": "write", "description": "Create component", "path": "src/Component.tsx", "notes": "Depends on: step_1"},
  {"step": 3, "action": "write", "description": "Create tests", "path": "src/Component.test.tsx", "notes": "Depends on: step_2"}
]`;

      mockConfig.llmCall = vi.fn().mockResolvedValue(planResponse);
      planner = new Planner(mockConfig);

      const plan = await planner.generatePlan('Setup component');

      expect(plan.taskId).toBeDefined();
      expect(plan.userRequest).toBe('Setup component');
      expect(plan.steps).toHaveLength(3);
      expect(plan.steps[0].id).toBe('step_1');
      // Verify topological order (dependencies should be sorted)
      expect(plan.steps.map(s => s.id)).toEqual(['step_1', 'step_2', 'step_3']);
    });

    it('maintains execution order for complex dependencies', async () => {
      const planResponse = `[
  {"step": 1, "action": "write", "description": "Setup", "path": "src/setup.ts"},
  {"step": 2, "action": "write", "description": "Feature A", "path": "src/a.ts", "notes": "Depends on: step_1"},
  {"step": 3, "action": "write", "description": "Feature B", "path": "src/b.ts", "notes": "Depends on: step_1"},
  {"step": 4, "action": "write", "description": "Integrate", "path": "src/index.ts", "notes": "Depends on: step_2, step_3"}
]`;

      mockConfig.llmCall = vi.fn().mockResolvedValue(planResponse);
      planner = new Planner(mockConfig);

      const plan = await planner.generatePlan('Complex flow');
      const idOrder = plan.steps.map(s => s.id);

      // step_1 must come before step_2, step_3, and step_4
      expect(idOrder.indexOf('step_1')).toBeLessThan(idOrder.indexOf('step_2'));
      expect(idOrder.indexOf('step_1')).toBeLessThan(idOrder.indexOf('step_3'));
      expect(idOrder.indexOf('step_1')).toBeLessThan(idOrder.indexOf('step_4'));
      // step_2 and step_3 must come before step_4
      expect(idOrder.indexOf('step_2')).toBeLessThan(idOrder.indexOf('step_4'));
      expect(idOrder.indexOf('step_3')).toBeLessThan(idOrder.indexOf('step_4'));
    });
  });
});
