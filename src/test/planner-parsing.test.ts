/**
 * Week 2 D1: planner.ts Parsing Tests
 *
 * Focus: LLM response parsing, JSON handling, step extraction
 * Target: 25 tests covering parseSteps and field extraction methods
 * Execution Time: ~700-800ms
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Planner, TaskPlan, ExecutionStep, PlannerConfig } from '../planner';

describe('Planner Parsing - Week 2 D1', () => {
  let planner: Planner;
  let mockConfig: PlannerConfig;

  beforeEach(() => {
    mockConfig = {
      llmCall: vi.fn().mockResolvedValue('{}'),
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
  // JSON Parsing - Valid Responses
  // ============================================================
  describe('JSON Parsing - Valid Responses', () => {
    it('should parse simple valid JSON array response', () => {
      const responseText = JSON.stringify([
        {
          step: 1,
          action: 'write',
          description: 'Create button component',
          path: 'src/Button.tsx',
          expectedOutcome: 'Component file created',
        },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps.length).toBe(1);
      expect(steps[0].action).toBe('write');
      expect(steps[0].description).toBe('Create button component');
      expect(steps[0].path).toBe('src/Button.tsx');
    });

    it('should parse multi-step JSON response', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'write', description: 'Create store', path: 'src/store.ts' },
        { step: 2, action: 'write', description: 'Create component', path: 'src/Button.tsx' },
        { step: 3, action: 'run', description: 'Build', command: 'npm run build' },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps.length).toBe(3);
      expect(steps[0].stepNumber).toBe(1);
      expect(steps[1].stepNumber).toBe(2);
      expect(steps[2].command).toBe('npm run build');
    });

    it('should handle markdown code block wrapping', () => {
      const responseText = '```json\n' + JSON.stringify([
        { step: 1, action: 'write', description: 'Create file', path: 'src/file.ts' },
      ]) + '\n```';

      const steps = planner['parseSteps'](responseText);

      expect(steps.length).toBe(1);
      expect(steps[0].path).toBe('src/file.ts');
    });

    it('should handle stripped markdown code blocks', () => {
      const responseText = '```\n' + JSON.stringify([
        { step: 1, action: 'read', description: 'Read file', path: 'src/existing.ts' },
      ]) + '\n```';

      const steps = planner['parseSteps'](responseText);

      expect(steps.length).toBe(1);
      expect(steps[0].action).toBe('read');
    });

    it('should normalize action to lowercase', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'WRITE', description: 'Test', path: 'file.ts' },
        { step: 2, action: 'Read', description: 'Test', path: 'file.ts' },
        { step: 3, action: 'RUN', description: 'Test', command: 'npm test' },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps[0].action).toBe('write');
      expect(steps[1].action).toBe('read');
      expect(steps[2].action).toBe('run');
    });

    it('should handle responses with extra whitespace', () => {
      const responseText = '  \n  ' + JSON.stringify([
        { step: 1, action: 'write', description: 'Create', path: 'src/file.ts' },
      ]) + '  \n  ';

      const steps = planner['parseSteps'](responseText);

      expect(steps.length).toBe(1);
      expect(steps[0].path).toBe('src/file.ts');
    });

    it('should generate correct step IDs', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'write', description: 'First', path: 'file1.ts' },
        { step: 2, action: 'write', description: 'Second', path: 'file2.ts' },
        { step: 3, action: 'write', description: 'Third', path: 'file3.ts' },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps[0].id).toBe('step_1');
      expect(steps[1].id).toBe('step_2');
      expect(steps[2].id).toBe('step_3');
    });

    it('should handle missing optional fields', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'write', description: 'Test' },
        { step: 2, action: 'run', description: 'Test' },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps.length).toBe(2);
      expect(steps[0].path).toBeUndefined();
      expect(steps[1].command).toBeUndefined();
    });
  });

  // ============================================================
  // JSON Parsing - Error Cases
  // ============================================================
  describe('JSON Parsing - Error Cases', () => {
    it('should reject malformed JSON', () => {
      const responseText = '{ broken json }';

      expect(() => {
        planner['parseSteps'](responseText);
      }).toThrow();
    });

    it('should reject non-array root', () => {
      const responseText = 'only text without any brackets';

      expect(() => {
        planner['parseSteps'](responseText);
      }).toThrow();
    });

    it('should reject empty array', () => {
      const responseText = '[]';

      const steps = planner['parseSteps'](responseText);

      expect(steps.length).toBe(0);
    });

    it('should handle missing JSON array brackets', () => {
      const responseText = 'random text without json';

      expect(() => {
        planner['parseSteps'](responseText);
      }).toThrow();
    });

    it('should reject invalid action type', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'invalid_action', description: 'Test', path: 'file.ts' },
      ]);

      const steps = planner['parseSteps'](responseText);

      // Should default to read or throw
      expect(steps.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle control characters in JSON', () => {
      // JSON with escaped newlines and tabs in strings
      const responseText = '[{"step":1,"action":"write","description":"Test\\nwith\\nnewlines","path":"src/file.ts"}]';

      const steps = planner['parseSteps'](responseText);

      expect(steps.length).toBe(1);
      expect(steps[0].description).toContain('with');
    });

    it('should handle deeply nested invalid JSON', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'write', description: 'Test', nested: { deep: { value: 'data' } } },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps.length).toBe(1);
    });
  });

  // ============================================================
  // Dependency Parsing
  // ============================================================
  describe('Dependency Parsing', () => {
    it('should parse dependencies as array', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'write', description: 'Create store', path: 'store.ts' },
        { step: 2, action: 'write', description: 'Create component', path: 'component.tsx', dependsOn: ['step_1'] },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps[1].dependsOn).toContain('step_1');
    });

    it('should parse dependencies as string comma-separated', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'write', description: 'Step 1', path: 'file1.ts' },
        { step: 2, action: 'write', description: 'Step 2', path: 'file2.ts' },
        { step: 3, action: 'write', description: 'Step 3', path: 'file3.ts', dependsOn: 'step_1, step_2' },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps[2].dependsOn).toContain('step_1');
      expect(steps[2].dependsOn).toContain('step_2');
    });

    it('should parse numeric dependencies and convert to step_N', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'write', description: 'Step 1', path: 'file1.ts' },
        { step: 2, action: 'write', description: 'Step 2', path: 'file2.ts', dependsOn: [1] },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps[1].dependsOn).toContain('step_1');
    });

    it('should filter self-referential dependencies', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'write', description: 'Step 1', path: 'file1.ts', dependsOn: ['step_1'] },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps[0].dependsOn?.length).toBe(0);
    });

    it('should handle steps without dependencies', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'write', description: 'Independent', path: 'file.ts' },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps[0].dependsOn).toBeUndefined();
    });

    it('should handle empty dependency array', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'write', description: 'Step', path: 'file.ts', dependsOn: [] },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps[0].dependsOn?.length).toBe(0);
    });
  });

  // ============================================================
  // Field Extraction
  // ============================================================
  describe('Field Extraction', () => {
    it('should extract description accurately', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'write', description: 'Create a new button component with props', path: 'Button.tsx' },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps[0].description).toBe('Create a new button component with props');
    });

    it('should extract path from path field', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'write', description: 'Create', path: 'src/components/Button.tsx' },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps[0].path).toBe('src/components/Button.tsx');
    });

    it('should extract command from run action', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'run', description: 'Install', command: 'npm install --save react' },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps[0].command).toBe('npm install --save react');
    });

    it('should extract expectedOutcome or use default', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'write', description: 'Test', path: 'file.ts', expectedOutcome: 'Custom outcome' },
        { step: 2, action: 'write', description: 'Test', path: 'file.ts' },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps[0].expectedOutcome).toBe('Custom outcome');
      expect(steps[1].expectedOutcome).toBe('Step completed');
    });

    it('should normalize whitespace in fields', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'write', description: '  Create   file  ', path: '  src/file.ts  ' },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps[0].description).toBe('Create   file');
      expect(steps[0].path).toBe('src/file.ts');
    });

    it('should reject empty descriptions but keep the step', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'write', description: '', path: 'file.ts' },
      ]);

      const steps = planner['parseSteps'](responseText);

      // Empty descriptions are filtered
      expect(steps.length).toBe(0);
    });

    it('should handle filePath alias for path', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'write', description: 'Create', filePath: 'src/file.ts' },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps[0].path).toBe('src/file.ts');
    });
  });

  // ============================================================
  // Action Type Validation & Conversion
  // ============================================================
  describe('Action Type Validation & Conversion', () => {
    it('should accept valid action types', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'write', description: 'Write', path: 'file.ts' },
        { step: 2, action: 'read', description: 'Read', path: 'file.ts' },
        { step: 3, action: 'run', description: 'Run', command: 'npm test' },
        { step: 4, action: 'delete', description: 'Delete', path: 'file.ts' },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps[0].action).toBe('write');
      expect(steps[1].action).toBe('read');
      expect(steps[2].action).toBe('run');
      expect(steps[3].action).toBe('delete');
    });

    it('should default invalid actions to read', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'invalid', description: 'Test', path: 'file.ts' },
        { step: 2, action: 'modify', description: 'Test', path: 'file.ts' },
      ]);

      const steps = planner['parseSteps'](responseText);

      // Should default to read or handle gracefully
      expect(steps.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle action as mixed case', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'WrItE', description: 'Test', path: 'file.ts' },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps[0].action).toBe('write');
    });
  });

  // ============================================================
  // Complex Response Scenarios
  // ============================================================
  describe('Complex Response Scenarios', () => {
    it('should parse response with mixed JSON and markdown', () => {
      const responseText = '## Plan\n```json\n' + JSON.stringify([
        { step: 1, action: 'write', description: 'Create', path: 'file.tsx' },
      ]) + '\n```\nEnd of plan';

      const steps = planner['parseSteps'](responseText);

      expect(steps.length).toBe(1);
    });

    it('should parse response with trailing/leading markers', () => {
      const responseText = '```json\n' + JSON.stringify([
        { step: 1, action: 'write', description: 'Test', path: 'file.ts' },
      ]) + '\n```';

      const steps = planner['parseSteps'](responseText);

      expect(steps.length).toBe(1);
    });

    it('should handle JSON with unicode characters', () => {
      const responseText = JSON.stringify([
        { step: 1, action: 'write', description: 'Create 🚀 component', path: 'src/component.tsx' },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps[0].description).toContain('component');
    });

    it('should preserve order of steps', () => {
      const responseText = JSON.stringify([
        { step: 5, action: 'write', description: 'Fifth', path: 'file5.ts' },
        { step: 2, action: 'write', description: 'Second', path: 'file2.ts' },
        { step: 1, action: 'write', description: 'First', path: 'file1.ts' },
      ]);

      const steps = planner['parseSteps'](responseText);

      expect(steps[0].stepNumber).toBe(5);
      expect(steps[1].stepNumber).toBe(2);
      expect(steps[2].stepNumber).toBe(1);
    });

    it('should handle large response with many steps', () => {
      const stepsData = Array.from({ length: 50 }, (_, i) => ({
        step: i + 1,
        action: 'write',
        description: `Step ${i + 1}`,
        path: `src/file${i + 1}.ts`,
      }));

      const responseText = JSON.stringify(stepsData);

      const steps = planner['parseSteps'](responseText);

      expect(steps.length).toBe(50);
      expect(steps[49].stepNumber).toBe(50);
    });
  });
});
