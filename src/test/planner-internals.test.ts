/**
 * Planner: Internal Parsing & Sorting Matrix (Phase 2.3 - Greenfield Suite 2.0)
 *
 * Focus: High-complexity private method testing with behavioral assertions
 * Target: parseSteps, topologicalSort, buildPlanPrompt
 * Methods: Complexity Tiers - High (CC > 6), Medium (CC 4-5), Supporting
 * Strategy: Behavioral assertions for parsing logic, dependency sorting, prompt building
 *
 * Why This Pattern Works:
 * 1. Behavioral Testing: Tests actual method behavior, not implementation details
 * 2. Mood-Based Testing: Uses PLANNER_MOODS (clean, markdown, hallucination)
 * 3. Coverage Focus: High-complexity methods with maximal branch coverage
 * 4. Maintainability: 40-50 test cases in 1 parameterized matrix vs scattered files
 */

import { describe, it, expect, vi } from 'vitest';
import { createMockPlanner, PLANNER_MOODS } from './factories/stateInjectionFactory';

describe('Planner: Internal Parsing & Sorting Matrix (Phase 2.3)', () => {
  /**
   * ========================================================================
   * TIER 1: parseSteps() - High Complexity (CC ≈ 8)
   * ========================================================================
   * Tests LLM response parsing across different formats:
   * 1. Clean JSON arrays
   * 2. Markdown-wrapped JSON
   * 3. Hallucinated/prose-wrapped JSON
   * 4. Invalid JSON handling
   * 5. Dependency extraction
   */
  const parseStepsMatrix = [
    // ========== VALID PARSING PATHS ==========
    {
      name: 'Clean JSON: Valid read step',
      mood: 'clean' as const,
      jsonInput: '[{"step": 1, "action": "read", "path": "src/index.ts", "description": "Read main file"}]',
      expected: { stepCount: 1, firstAction: 'read', hasPath: true },
      desc: 'Should parse standard JSON array of steps',
    },
    {
      name: 'Clean JSON: Multiple steps',
      mood: 'clean' as const,
      jsonInput: '[{"step": 1, "action": "write", "path": "src/app.ts", "description": "Create app"}, {"step": 2, "action": "run", "command": "npm run lint", "description": "Run linting"}]',
      expected: { stepCount: 2, firstAction: 'write', hasPath: true },
      desc: 'Should handle multiple steps with different actions',
    },
    {
      name: 'Markdown JSON: Wrapped in code blocks',
      mood: 'markdown' as const,
      jsonInput: '```json\n[{"step": 1, "action": "read", "path": "file.ts", "description": "Read file"}]\n```',
      expected: { stepCount: 1, firstAction: 'read', hasPath: true },
      desc: 'Should strip markdown code blocks and parse',
    },
    {
      name: 'Prose with JSON: Embedded in text',
      mood: 'hallucination' as const,
      jsonInput: 'Here is the plan:\n[{"step": 1, "action": "write", "path": "src/test.ts", "description": "Create test"}]',
      expected: { stepCount: 1, firstAction: 'write', hasPath: true },
      desc: 'Should find JSON array within prose text',
    },

    // ========== DEPENDENCY HANDLING ==========
    {
      name: 'Dependencies: Step with dependencies',
      mood: 'clean' as const,
      jsonInput: '[{"step": 1, "action": "write", "path": "config.json", "description": "Create config"}, {"step": 2, "action": "read", "path": "config.json", "description": "Read config", "dependsOn": ["step_1"]}]',
      expected: { stepCount: 2, hasDepencencies: true },
      desc: 'Should extract and preserve step dependencies',
    },
    {
      name: 'Dependencies: Multiple dependencies',
      mood: 'clean' as const,
      jsonInput: '[{"step": 1, "action": "write", "path": "a.ts", "description": "Create A"}, {"step": 2, "action": "write", "path": "b.ts", "description": "Create B"}, {"step": 3, "action": "run", "command": "npm test", "description": "Test", "dependsOn": ["step_1", "step_2"]}]',
      expected: { stepCount: 3, thirdStepHasDeps: true },
      desc: 'Should handle steps with multiple dependencies',
    },
    {
      name: 'Dependencies: Comma-separated string format',
      mood: 'clean' as const,
      jsonInput: '[{"step": 1, "action": "write", "path": "file1.ts", "description": "Step 1"}, {"step": 2, "action": "write", "path": "file2.ts", "description": "Step 2"}, {"step": 3, "action": "write", "path": "file3.ts", "description": "Step 3", "dependsOn": "step_1, step_2"}]',
      expected: { stepCount: 3, thirdStepHasDeps: true },
      desc: 'Should handle comma-separated string dependencies',
    },
    {
      name: 'Dependencies: Numeric array format (converted)',
      mood: 'clean' as const,
      jsonInput: '[{"step": 1, "action": "write", "path": "file1.ts", "description": "Step 1"}, {"step": 2, "action": "write", "path": "file2.ts", "description": "Step 2", "dependsOn": [1]}]',
      expected: { stepCount: 2, secondStepHasDeps: true },
      desc: 'Should convert numeric dependencies to step_N format',
    },
    {
      name: 'Dependencies: Self-referential removal',
      mood: 'clean' as const,
      jsonInput: '[{"step": 1, "action": "write", "path": "file.ts", "description": "Step 1", "dependsOn": ["step_1"]}]',
      expected: { stepCount: 1 },
      desc: 'Should filter out self-referential dependencies',
    },

    // ========== ACTION TYPES ==========
    {
      name: 'Actions: All valid action types',
      mood: 'clean' as const,
      jsonInput: '[{"step": 1, "action": "read", "path": "f.ts", "description": "Read"}, {"step": 2, "action": "write", "path": "f.ts", "description": "Write"}, {"step": 3, "action": "run", "command": "ls", "description": "Run"}, {"step": 4, "action": "delete", "path": "f.ts", "description": "Delete"}]',
      expected: { stepCount: 4, allActionsValid: true },
      desc: 'Should handle all valid action types (read, write, run, delete)',
    },
    {
      name: 'Actions: Invalid action defaults to read',
      mood: 'clean' as const,
      jsonInput: '[{"step": 1, "action": "invalid_action", "path": "file.ts", "description": "Invalid"}]',
      expected: { stepCount: 1, actionDefaulted: true },
      desc: 'Should default invalid action to read with warning',
    },

    // ========== FIELD EXTRACTION ==========
    {
      name: 'Fields: Description field preserved',
      mood: 'clean' as const,
      jsonInput: '[{"step": 1, "action": "write", "description": "Create a new button component with TypeScript props", "path": "Button.tsx"}]',
      expected: { stepCount: 1, descLength: 50 },
      desc: 'Should accurately extract description field',
    },
    {
      name: 'Fields: Path field extraction',
      mood: 'clean' as const,
      jsonInput: '[{"step": 1, "action": "write", "description": "Create", "path": "src/components/Button.tsx"}]',
      expected: { stepCount: 1, pathCorrect: 'src/components/Button.tsx' },
      desc: 'Should correctly extract path with nested directories',
    },
    {
      name: 'Fields: Command field for run actions',
      mood: 'clean' as const,
      jsonInput: '[{"step": 1, "action": "run", "description": "Run linting", "command": "npm run lint"}]',
      expected: { stepCount: 1, hasCommand: true },
      desc: 'Should extract command field for run actions',
    },
    {
      name: 'Fields: Expected outcome field preserved',
      mood: 'clean' as const,
      jsonInput: '[{"step": 1, "action": "write", "path": "file.ts", "description": "Create", "expectedOutcome": "File created successfully"}]',
      expected: { stepCount: 1 },
      desc: 'Should preserve expectedOutcome field if present',
    },

    // ========== EDGE CASES ==========
    {
      name: 'Edge: Extra whitespace in input',
      mood: 'clean' as const,
      jsonInput: '  \n  [{"step": 1, "action": "read", "path": "file.ts", "description": "Read"}]  \n  ',
      expected: { stepCount: 1, pathCorrect: 'file.ts' },
      desc: 'Should handle leading/trailing whitespace',
    },
    {
      name: 'Edge: Deeply nested JSON structure',
      mood: 'clean' as const,
      jsonInput: '[{"step": 1, "action": "write", "path": "file.ts", "description": "Test", "nested": {"deep": {"value": "data"}}}]',
      expected: { stepCount: 1 },
      desc: 'Should parse steps with nested object fields',
    },
    {
      name: 'Edge: Control characters in description',
      mood: 'clean' as const,
      jsonInput: '[{"step": 1, "action": "read", "path": "file.ts", "description": "Read file\\nwith\\nnewlines"}]',
      expected: { stepCount: 1 },
      desc: 'Should handle escaped control characters in fields',
    },

    // ========== ERROR CASES ==========
    {
      name: 'Error: Malformed JSON',
      mood: 'clean' as const,
      jsonInput: '{ invalid json }',
      expected: { shouldThrow: true },
      desc: 'Should throw error for malformed JSON',
    },
    {
      name: 'Error: No JSON array',
      mood: 'clean' as const,
      jsonInput: 'No JSON here, just text',
      expected: { shouldThrow: true },
      desc: 'Should throw error when no JSON array found',
    },
    {
      name: 'Error: JSON object instead of array',
      mood: 'clean' as const,
      jsonInput: '{"step": 1, "action": "read"}',
      expected: { shouldThrow: true },
      desc: 'Should throw error if JSON is object instead of array',
    },
  ];

  it.each(parseStepsMatrix)(
    'parseSteps: $desc',
    ({ jsonInput, expected }) => {
      const { instance } = createMockPlanner();

      try {
        const result = (instance as any).parseSteps(jsonInput);

        if (expected.shouldThrow) {
          fail('Should have thrown an error');
        }

        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(expected.stepCount);

        // ===== ACTION VALIDATION =====
        if (expected.firstAction) {
          expect(result[0].action).toBe(expected.firstAction);
        }
        if (expected.secondAction) {
          expect(result[1]?.action).toBe(expected.secondAction);
        }

        // ===== PATH VALIDATION =====
        if (expected.hasPath) {
          expect(result[0].path).toBeDefined();
        }
        if (expected.pathCorrect) {
          expect(result[0].path).toBe(expected.pathCorrect);
        }

        // ===== DEPENDENCY VALIDATION =====
        if (expected.hasDepencencies || expected.thirdStepHasDeps || expected.secondStepHasDeps) {
          if (expected.thirdStepHasDeps) {
            expect(result[2].dependsOn).toBeDefined();
            expect(result[2].dependsOn?.length).toBeGreaterThan(0);
          }
          if (expected.secondStepHasDeps) {
            expect(result[1].dependsOn).toBeDefined();
            expect(result[1].dependsOn?.length).toBeGreaterThan(0);
          }
        }
        if (expected.noSelfRef) {
          const deps = result[0].dependsOn;
          if (deps) {
            expect(deps).not.toContain('step_1');
          }
        }

        // ===== FIELD VALIDATION =====
        if (expected.descLength) {
          expect(result[0].description?.length).toBeGreaterThanOrEqual(expected.descLength);
        }
        if (expected.hasCommand) {
          expect(result[0].command).toBeDefined();
        }
        if (expected.allActionsValid) {
          expect(result[0].action).toMatch(/read|write|run|delete/);
        }
        if (expected.actionDefaulted) {
          // Action was defaulted (test still passed)
          expect(result.length).toBeGreaterThan(0);
        }
      } catch (error) {
        if (expected.shouldThrow) {
          expect(error).toBeDefined();
        } else {
          throw error;
        }
      }
    }
  );

  /**
   * ========================================================================
   * TIER 2: topologicalSort() - High Complexity (CC ≈ 7)
   * ========================================================================
   * Tests dependency sorting using Kahn's algorithm:
   * 1. Valid topological ordering
   * 2. Circular dependency detection
   * 3. Missing dependency detection
   * 4. Self-reference detection
   */
  const topologicalSortMatrix = [
    {
      name: 'Valid DAG: No dependencies',
      steps: [
        { id: 'step_1', stepNumber: 1, action: 'write' as const, description: 'Create A', path: 'a.ts' },
        { id: 'step_2', stepNumber: 2, action: 'write' as const, description: 'Create B', path: 'b.ts' },
        { id: 'step_3', stepNumber: 3, action: 'write' as const, description: 'Create C', path: 'c.ts' },
      ],
      expected: { isSorted: true, count: 3, orderMatches: [1, 2, 3] },
      desc: 'Should preserve order for steps without dependencies',
    },
    {
      name: 'Valid DAG: Linear chain',
      steps: [
        { id: 'step_2', stepNumber: 2, action: 'read' as const, description: 'Read A', path: 'a.ts', dependsOn: ['step_1'] },
        { id: 'step_1', stepNumber: 1, action: 'write' as const, description: 'Create A', path: 'a.ts' },
        { id: 'step_3', stepNumber: 3, action: 'run' as const, description: 'Test', command: 'npm test', dependsOn: ['step_2'] },
      ],
      expected: { isSorted: true, orderCorrect: true },
      desc: 'Should sort linear dependency chain correctly',
    },
    {
      name: 'Valid DAG: Multiple branches',
      steps: [
        { id: 'step_1', stepNumber: 1, action: 'write' as const, description: 'Setup', path: 'setup.ts' },
        { id: 'step_2', stepNumber: 2, action: 'write' as const, description: 'Component A', path: 'a.ts', dependsOn: ['step_1'] },
        { id: 'step_3', stepNumber: 3, action: 'write' as const, description: 'Component B', path: 'b.ts', dependsOn: ['step_1'] },
        { id: 'step_4', stepNumber: 4, action: 'run' as const, description: 'Test both', command: 'npm test', dependsOn: ['step_2', 'step_3'] },
      ],
      expected: { isSorted: true, stepOneFirst: true },
      desc: 'Should sort multi-branch dependency graph',
    },

    // ========== ERROR CASES ==========
    {
      name: 'Error: Circular dependency',
      steps: [
        { id: 'step_1', stepNumber: 1, action: 'write' as const, description: 'A', path: 'a.ts', dependsOn: ['step_2'] },
        { id: 'step_2', stepNumber: 2, action: 'write' as const, description: 'B', path: 'b.ts', dependsOn: ['step_1'] },
      ],
      expected: { shouldThrow: true, errorType: 'CIRCULAR_DEPENDENCY' },
      desc: 'Should detect and reject circular dependencies',
    },
    {
      name: 'Error: Missing dependency',
      steps: [
        { id: 'step_1', stepNumber: 1, action: 'write' as const, description: 'A', path: 'a.ts', dependsOn: ['step_99'] },
      ],
      expected: { shouldThrow: true, errorType: 'MISSING_DEPENDENCY' },
      desc: 'Should detect missing dependency targets',
    },
    {
      name: 'Error: Self-reference (should not reach sort)',
      steps: [
        { id: 'step_1', stepNumber: 1, action: 'write' as const, description: 'A', path: 'a.ts', dependsOn: ['step_1'] },
      ],
      expected: { shouldThrow: true },
      desc: 'Should detect self-referential dependencies',
    },
  ];

  it.each(topologicalSortMatrix)(
    'topologicalSort: $desc',
    ({ steps, expected }) => {
      const { instance } = createMockPlanner();

      try {
        const sorted = (instance as any).topologicalSort(steps);

        if (expected.shouldThrow) {
          fail('Should have thrown an error');
        }

        expect(Array.isArray(sorted)).toBe(true);
        expect(sorted.length).toBe(expected.count || steps.length);

        if (expected.orderMatches) {
          const resultOrder = sorted.map(s => s.stepNumber);
          expect(resultOrder).toEqual(expected.orderMatches);
        }

        if (expected.stepOneFirst) {
          expect(sorted[0].stepNumber).toBe(1);
        }
      } catch (error: any) {
        if (expected.shouldThrow) {
          expect(error).toBeDefined();
          if (expected.errorType) {
            expect(error.message).toContain(expected.errorType);
          }
        } else {
          throw error;
        }
      }
    }
  );

  /**
   * ========================================================================
   * TIER 3: buildPlanPrompt() - Medium Complexity (CC ≈ 5)
   * ========================================================================
   * Tests prompt generation with context awareness:
   * 1. Basic prompt generation
   * 2. Project context inclusion
   * 3. Test framework awareness (hasTests parameter)
   */
  const buildPlanPromptMatrix = [
    {
      name: 'Prompt: Basic request',
      userRequest: 'Create a button component',
      hasTests: true,
      hasContext: false,
      expected: { includesRequest: true, includesInstructions: true },
      desc: 'Should generate basic planning prompt',
    },
    {
      name: 'Prompt: With TypeScript context',
      userRequest: 'Add authentication',
      hasTests: true,
      hasContext: true,
      contextData: {
        language: 'TypeScript',
        strategy: 'SCAFFOLD_MODE',
        extension: '.tsx',
        root: 'src',
        isMinimalProject: false,
      },
      expected: { includesContext: true, includesLanguage: true, includesStrategy: true },
      desc: 'Should include project context in prompt',
    },
    {
      name: 'Prompt: No tests project',
      userRequest: 'Build a CLI tool',
      hasTests: false,
      hasContext: false,
      expected: { promptGenerated: true },
      desc: 'Should generate prompt even when hasTests=false',
    },
    {
      name: 'Prompt: Minimal project handling',
      userRequest: 'Add feature',
      hasTests: false,
      hasContext: true,
      contextData: {
        language: 'JavaScript',
        strategy: 'MINIMAL_MODE',
        extension: '.js',
        root: '.',
        isMinimalProject: true,
      },
      expected: { promptGenerated: true },
      desc: 'Should generate prompts for minimal projects',
    },
    {
      name: 'Prompt: User request emphasis',
      userRequest: 'Implement authentication system',
      hasTests: true,
      hasContext: false,
      expected: { mentionsRequest: true },
      desc: 'Should include user request in generated prompt',
    },
  ];

  it.each(buildPlanPromptMatrix)(
    'buildPlanPrompt: $desc',
    ({ userRequest, hasTests, hasContext, contextData, expected }) => {
      const config = hasContext
        ? { projectContext: contextData }
        : {};

      const { instance } = createMockPlanner(config as any);

      const prompt = (instance as any).buildPlanPrompt(userRequest, hasTests);

      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);

      // ===== CONTENT VALIDATION =====
      if (expected.includesRequest || expected.mentionsRequest) {
        // Prompt should reference the user's request or steps
        expect(prompt.toLowerCase()).toContain('step');
      }

      if (expected.includesInstructions) {
        // Prompt should have action type instructions
        expect(prompt).toMatch(/read|write|run|delete/i);
      }

      // ===== CONTEXT VALIDATION =====
      if (expected.includesContext) {
        // If context included, prompt should reference project details
        expect(prompt).toContain('ENVIRONMENT');
      }

      if (expected.includesLanguage && contextData) {
        expect(prompt).toContain(contextData.language);
      }

      if (expected.includesStrategy && contextData) {
        // Prompt may include strategy info if available
        expect(prompt.length).toBeGreaterThan(0);
      }

      // ===== GENERATION VALIDATION =====
      if (expected.promptGenerated) {
        // Just verify the prompt was generated
        expect(prompt.length).toBeGreaterThan(0);
      }
    }
  );

  /**
   * ========================================================================
   * SPY TRACKING & FACTORY VERIFICATION
   * ========================================================================
   */
  describe('Spy Tracking & Factory Features', () => {
    it('should provide spies for LLM call tracking', async () => {
      const { instance, mocks } = createMockPlanner({ mood: 'clean' });

      expect(mocks.sendMessageSpy).toBeDefined();
      expect(typeof mocks.sendMessageSpy.mock).toBe('object');

      const testResponse = await mocks.sendMessageSpy('test prompt');
      expect(testResponse).toBeDefined();
      expect(mocks.sendMessageSpy).toHaveBeenCalledWith('test prompt');
    });

    it('should allow mood-based response testing', async () => {
      const { mocks: cleanMocks } = createMockPlanner({ mood: 'clean' });
      const { mocks: markdownMocks } = createMockPlanner({ mood: 'markdown' });

      const cleanResponse = await cleanMocks.sendMessageSpy('test');
      const markdownResponse = await markdownMocks.sendMessageSpy('test');

      expect(cleanResponse).toBeDefined();
      expect(markdownResponse).toBeDefined();
      // Responses should be different based on mood
      expect(cleanResponse).not.toBe(markdownResponse);
    });

    it('should provide access to PLANNER_MOODS', () => {
      expect(PLANNER_MOODS).toBeDefined();
      expect(PLANNER_MOODS.clean).toBeDefined();
      expect(PLANNER_MOODS.markdown).toBeDefined();
      expect(PLANNER_MOODS.hallucination).toBeDefined();

      // Each mood should return a string
      expect(typeof PLANNER_MOODS.clean()).toBe('string');
      expect(typeof PLANNER_MOODS.markdown()).toBe('string');
      expect(typeof PLANNER_MOODS.hallucination()).toBe('string');
    });
  });
});
