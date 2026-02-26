/**
 * Week 2 D1: planner.ts Parsing Tests (Consolidated)
 *
 * Consolidation Strategy:
 * - Stateful Parsing: Incremental coverage via input mutations
 * - Table-driven with assertions functions for varying JSON formats
 * - Focus on "parsing fault injection" - feeding progressively broken strings
 * - 36 → 13 tests (-64% reduction)
 *
 * Pattern: Each describe block groups related parsing scenarios
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Planner, TaskPlan, ExecutionStep, PlannerConfig } from '../planner';

describe('Planner Parsing - Week 2 D1 (Consolidated)', () => {
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
  // Valid JSON Parsing - Format Variations
  // ============================================================
  const validParsingCases = [
    {
      name: 'simple valid JSON array with single step',
      responseText: JSON.stringify([
        {
          step: 1,
          action: 'write',
          description: 'Create button component',
          path: 'src/Button.tsx',
          expectedOutcome: 'Component file created',
        },
      ]),
      assertions: (steps: ExecutionStep[]) => {
        expect(steps.length).toBe(1);
        expect(steps[0].action).toBe('write');
        expect(steps[0].description).toBe('Create button component');
        expect(steps[0].path).toBe('src/Button.tsx');
      },
    },
    {
      name: 'multi-step JSON response with mixed actions',
      responseText: JSON.stringify([
        { step: 1, action: 'write', description: 'Create store', path: 'src/store.ts' },
        { step: 2, action: 'write', description: 'Create component', path: 'src/Button.tsx' },
        { step: 3, action: 'run', description: 'Build', command: 'npm run build' },
      ]),
      assertions: (steps: ExecutionStep[]) => {
        expect(steps.length).toBe(3);
        expect(steps[0].stepNumber).toBe(1);
        expect(steps[1].stepNumber).toBe(2);
        expect(steps[2].command).toBe('npm run build');
      },
    },
    {
      name: 'markdown json code block wrapper',
      responseText: '```json\n' + JSON.stringify([
        { step: 1, action: 'write', description: 'Create file', path: 'src/file.ts' },
      ]) + '\n```',
      assertions: (steps: ExecutionStep[]) => {
        expect(steps.length).toBe(1);
        expect(steps[0].path).toBe('src/file.ts');
      },
    },
    {
      name: 'stripped markdown code block (no json label)',
      responseText: '```\n' + JSON.stringify([
        { step: 1, action: 'read', description: 'Read file', path: 'src/existing.ts' },
      ]) + '\n```',
      assertions: (steps: ExecutionStep[]) => {
        expect(steps.length).toBe(1);
        expect(steps[0].action).toBe('read');
      },
    },
    {
      name: 'action normalization to lowercase',
      responseText: JSON.stringify([
        { step: 1, action: 'WRITE', description: 'Test', path: 'file.ts' },
        { step: 2, action: 'Read', description: 'Test', path: 'file.ts' },
        { step: 3, action: 'RUN', description: 'Test', command: 'npm test' },
      ]),
      assertions: (steps: ExecutionStep[]) => {
        expect(steps[0].action).toBe('write');
        expect(steps[1].action).toBe('read');
        expect(steps[2].action).toBe('run');
      },
    },
    {
      name: 'responses with extra whitespace trimmed',
      responseText: '  \n  ' + JSON.stringify([
        { step: 1, action: 'write', description: 'Create', path: 'src/file.ts' },
      ]) + '  \n  ',
      assertions: (steps: ExecutionStep[]) => {
        expect(steps.length).toBe(1);
        expect(steps[0].path).toBe('src/file.ts');
      },
    },
    {
      name: 'generate correct step IDs from step numbers',
      responseText: JSON.stringify([
        { step: 1, action: 'write', description: 'First', path: 'file1.ts' },
        { step: 2, action: 'write', description: 'Second', path: 'file2.ts' },
        { step: 3, action: 'write', description: 'Third', path: 'file3.ts' },
      ]),
      assertions: (steps: ExecutionStep[]) => {
        expect(steps[0].id).toBe('step_1');
        expect(steps[1].id).toBe('step_2');
        expect(steps[2].id).toBe('step_3');
      },
    },
    {
      name: 'handle missing optional fields gracefully',
      responseText: JSON.stringify([
        { step: 1, action: 'write', description: 'Test' },
        { step: 2, action: 'run', description: 'Test' },
      ]),
      assertions: (steps: ExecutionStep[]) => {
        expect(steps.length).toBe(2);
        expect(steps[0].path).toBeUndefined();
        expect(steps[1].command).toBeUndefined();
      },
    },
    {
      name: 'mixed markdown and JSON in complex response',
      responseText: '## Plan\n```json\n' + JSON.stringify([
        { step: 1, action: 'write', description: 'Create', path: 'file.tsx' },
      ]) + '\n```\nEnd of plan',
      assertions: (steps: ExecutionStep[]) => {
        expect(steps.length).toBe(1);
      },
    },
    {
      name: 'large response with 50+ steps',
      responseText: JSON.stringify(
        Array.from({ length: 50 }, (_, i) => ({
          step: i + 1,
          action: 'write',
          description: `Step ${i + 1}`,
          path: `src/file${i + 1}.ts`,
        }))
      ),
      assertions: (steps: ExecutionStep[]) => {
        expect(steps.length).toBe(50);
        expect(steps[49].stepNumber).toBe(50);
      },
    },
  ];

  it.each(validParsingCases)(
    'JSON parsing valid: $name',
    ({ responseText, assertions }) => {
      const steps = planner['parseSteps'](responseText);
      assertions(steps);
    }
  );

  // ============================================================
  // Dependency Parsing - Format Variations
  // ============================================================
  const dependencyParsingCases = [
    {
      name: 'dependencies as array format',
      responseText: JSON.stringify([
        { step: 1, action: 'write', description: 'Create store', path: 'store.ts' },
        { step: 2, action: 'write', description: 'Create component', path: 'component.tsx', dependsOn: ['step_1'] },
      ]),
      assertions: (steps: ExecutionStep[]) => {
        expect(steps[1].dependsOn).toContain('step_1');
      },
    },
    {
      name: 'dependencies as comma-separated string',
      responseText: JSON.stringify([
        { step: 1, action: 'write', description: 'Step 1', path: 'file1.ts' },
        { step: 2, action: 'write', description: 'Step 2', path: 'file2.ts' },
        { step: 3, action: 'write', description: 'Step 3', path: 'file3.ts', dependsOn: 'step_1, step_2' },
      ]),
      assertions: (steps: ExecutionStep[]) => {
        expect(steps[2].dependsOn).toContain('step_1');
        expect(steps[2].dependsOn).toContain('step_2');
      },
    },
    {
      name: 'numeric dependencies converted to step_N format',
      responseText: JSON.stringify([
        { step: 1, action: 'write', description: 'Step 1', path: 'file1.ts' },
        { step: 2, action: 'write', description: 'Step 2', path: 'file2.ts', dependsOn: [1] },
      ]),
      assertions: (steps: ExecutionStep[]) => {
        expect(steps[1].dependsOn).toContain('step_1');
      },
    },
    {
      name: 'self-referential dependencies filtered out',
      responseText: JSON.stringify([
        { step: 1, action: 'write', description: 'Step 1', path: 'file1.ts', dependsOn: ['step_1'] },
      ]),
      assertions: (steps: ExecutionStep[]) => {
        expect(steps[0].dependsOn?.length).toBe(0);
      },
    },
    {
      name: 'steps without dependencies undefined',
      responseText: JSON.stringify([
        { step: 1, action: 'write', description: 'Independent', path: 'file.ts' },
      ]),
      assertions: (steps: ExecutionStep[]) => {
        expect(steps[0].dependsOn).toBeUndefined();
      },
    },
    {
      name: 'empty dependency array handled',
      responseText: JSON.stringify([
        { step: 1, action: 'write', description: 'Step', path: 'file.ts', dependsOn: [] },
      ]),
      assertions: (steps: ExecutionStep[]) => {
        expect(steps[0].dependsOn?.length).toBe(0);
      },
    },
  ];

  it.each(dependencyParsingCases)(
    'dependency parsing: $name',
    ({ responseText, assertions }) => {
      const steps = planner['parseSteps'](responseText);
      assertions(steps);
    }
  );

  // ============================================================
  // Field Extraction & Validation
  // ============================================================
  const fieldExtractionCases = [
    {
      name: 'extract all field types accurately',
      responseText: JSON.stringify([
        { step: 1, action: 'write', description: 'Create button', path: 'src/Button.tsx', expectedOutcome: 'Component ready' },
        { step: 2, action: 'run', description: 'Install', command: 'npm install --save react' },
      ]),
      assertions: (steps: ExecutionStep[]) => {
        expect(steps[0].description).toBe('Create button');
        expect(steps[0].path).toBe('src/Button.tsx');
        expect(steps[0].expectedOutcome).toBe('Component ready');
        expect(steps[1].command).toBe('npm install --save react');
      },
    },
    {
      name: 'normalize whitespace in fields',
      responseText: JSON.stringify([
        { step: 1, action: 'write', description: '  Create   file  ', path: '  src/file.ts  ' },
      ]),
      assertions: (steps: ExecutionStep[]) => {
        expect(steps[0].description).toBe('Create   file');
        expect(steps[0].path).toBe('src/file.ts');
      },
    },
    {
      name: 'filePath alias resolves to path',
      responseText: JSON.stringify([
        { step: 1, action: 'write', description: 'Create', filePath: 'src/file.ts' },
      ]),
      assertions: (steps: ExecutionStep[]) => {
        expect(steps[0].path).toBe('src/file.ts');
      },
    },
    {
      name: 'action validation accepts all valid types',
      responseText: JSON.stringify([
        { step: 1, action: 'write', description: 'Write', path: 'file.ts' },
        { step: 2, action: 'read', description: 'Read', path: 'file.ts' },
        { step: 3, action: 'run', description: 'Run', command: 'npm test' },
        { step: 4, action: 'delete', description: 'Delete', path: 'file.ts' },
      ]),
      assertions: (steps: ExecutionStep[]) => {
        expect(steps[0].action).toBe('write');
        expect(steps[1].action).toBe('read');
        expect(steps[2].action).toBe('run');
        expect(steps[3].action).toBe('delete');
      },
    },
    {
      name: 'action case normalization handles mixed case',
      responseText: JSON.stringify([
        { step: 1, action: 'WrItE', description: 'Test', path: 'file.ts' },
      ]),
      assertions: (steps: ExecutionStep[]) => {
        expect(steps[0].action).toBe('write');
      },
    },
    {
      name: 'preserve order of steps with out-of-order step numbers',
      responseText: JSON.stringify([
        { step: 5, action: 'write', description: 'Fifth', path: 'file5.ts' },
        { step: 2, action: 'write', description: 'Second', path: 'file2.ts' },
        { step: 1, action: 'write', description: 'First', path: 'file1.ts' },
      ]),
      assertions: (steps: ExecutionStep[]) => {
        expect(steps[0].stepNumber).toBe(5);
        expect(steps[1].stepNumber).toBe(2);
        expect(steps[2].stepNumber).toBe(1);
      },
    },
  ];

  it.each(fieldExtractionCases)(
    'field extraction: $name',
    ({ responseText, assertions }) => {
      const steps = planner['parseSteps'](responseText);
      assertions(steps);
    }
  );

  // ============================================================
  // Error Handling - Fault Injection
  // ============================================================
  const errorCases = [
    {
      name: 'reject malformed JSON',
      responseText: '{ broken json }',
      expectError: true,
    },
    {
      name: 'reject non-array root',
      responseText: 'only text without any brackets',
      expectError: true,
    },
    {
      name: 'reject missing JSON array brackets',
      responseText: 'random text without json',
      expectError: true,
    },
    {
      name: 'handle control characters in JSON escaped strings',
      responseText: '[{"step":1,"action":"write","description":"Test\\nwith\\nnewlines","path":"src/file.ts"}]',
      expectError: false,
      assertions: (steps: ExecutionStep[]) => {
        expect(steps.length).toBe(1);
        expect(steps[0].description).toContain('with');
      },
    },
    {
      name: 'handle JSON with unicode characters',
      responseText: JSON.stringify([
        { step: 1, action: 'write', description: 'Create 🚀 component', path: 'src/component.tsx' },
      ]),
      expectError: false,
      assertions: (steps: ExecutionStep[]) => {
        expect(steps[0].description).toContain('component');
      },
    },
  ];

  it.each(errorCases)(
    'error handling: $name',
    ({ responseText, expectError, assertions }) => {
      if (expectError) {
        expect(() => {
          planner['parseSteps'](responseText);
        }).toThrow();
      } else {
        const steps = planner['parseSteps'](responseText);
        if (assertions) {
          assertions(steps);
        }
      }
    }
  );
});
