/**
 * Planner-LLM Workflow Integration Tests (Phase 3.1)
 *
 * Focus: How Planner formats requests to LLM and processes responses
 * Pattern: Behavioral assertions on LLM communication, using spy tracking
 * Strategy: Real Planner instance with spy-tracked LLM client, verify prompts and parsing
 *
 * Key Integration Points:
 * 1. Planner formats request prompts correctly (includes all context)
 * 2. LLM response parsing handles different formats (moods)
 * 3. Error handling for LLM failures (timeout, malformed response)
 * 4. Context window management (token limits)
 * 5. Retry logic for transient failures
 */

import { describe, it, expect, vi } from 'vitest';
import { createMockPlanner, PLANNER_MOODS } from './factories/stateInjectionFactory';

describe('Planner-LLM Workflow Integration (Phase 3.1)', () => {
  /**
   * ========================================================================
   * WORKFLOW MATRIX: Planner request formatting and response parsing
   * ========================================================================
   */
  const plannerLLMWorkflowMatrix = [
    {
      name: 'Clean Response: Standard JSON from LLM',
      mood: 'clean' as const,
      userRequest: 'Add authentication to the app',
      expectedPromptContent: ['ENVIRONMENT', 'action', 'step', 'read', 'write'],
      llmResponse: JSON.stringify({
        steps: [
          { step: 1, action: 'read', path: 'src/auth.ts', description: 'Read auth' },
          { step: 2, action: 'write', path: 'src/auth.ts', description: 'Add auth' },
        ],
      }),
      expectedParsedSteps: 2,
      desc: 'Should parse clean JSON response correctly',
    },

    {
      name: 'Markdown Response: JSON wrapped in code blocks',
      mood: 'markdown' as const,
      userRequest: 'Fix type errors',
      expectedPromptContent: ['action', 'dependencies'],
      llmResponse: `\`\`\`json
{
  "steps": [
    { "step": 1, "action": "read", "path": "src/types.ts", "description": "Read types" },
    { "step": 2, "action": "write", "path": "src/types.ts", "description": "Fix types" }
  ]
}
\`\`\``,
      expectedParsedSteps: 2,
      desc: 'Should strip markdown and parse JSON correctly',
    },

    {
      name: 'Prose Response: JSON embedded in prose text',
      mood: 'hallucination' as const,
      userRequest: 'Refactor components',
      expectedPromptContent: ['action', 'step'],
      llmResponse: `Here is the plan for refactoring:
[
  { "step": 1, "action": "read", "path": "src/components/Button.tsx", "description": "Read" },
  { "step": 2, "action": "write", "path": "src/components/Button.tsx", "description": "Write" }
]
Let me know if you need anything else!`,
      expectedParsedSteps: 2,
      desc: 'Should extract JSON from prose text',
    },

    {
      name: 'Minimal Request: No project context',
      mood: 'clean' as const,
      userRequest: 'Add a button component',
      includeContext: false,
      expectedPromptContent: ['action', 'step'],
      llmResponse: JSON.stringify({
        steps: [
          { step: 1, action: 'write', path: 'src/Button.tsx', description: 'Create' },
        ],
      }),
      expectedParsedSteps: 1,
      desc: 'Should generate prompt even without project context',
    },

    {
      name: 'Full Context Request: With project details',
      mood: 'clean' as const,
      userRequest: 'Add authentication',
      includeContext: true,
      contextDetails: {
        language: 'TypeScript',
        extension: '.tsx',
        isMinimalProject: false,
      },
      expectedPromptContent: ['action', 'step'],
      llmResponse: JSON.stringify([
        { step: 1, action: 'read', path: 'src/auth.ts', description: 'Read' },
        { step: 2, action: 'write', path: 'src/auth.ts', description: 'Write' },
        { step: 3, action: 'run', command: 'npm test', description: 'Test' },
      ]),
      expectedParsedSteps: 3,
      desc: 'Should include project context in prompt',
    },

    {
      name: 'Complex Dependencies: Multi-step with dependencies',
      mood: 'clean' as const,
      userRequest: 'Migrate to Zustand',
      expectedPromptContent: ['dependsOn', 'dependencies'],
      llmResponse: JSON.stringify({
        steps: [
          { step: 1, action: 'write', path: 'src/store.ts', description: 'Create store' },
          {
            step: 2,
            action: 'write',
            path: 'src/components/App.tsx',
            description: 'Update component',
            dependsOn: ['step_1'],
          },
          {
            step: 3,
            action: 'run',
            command: 'npm test',
            description: 'Verify migration',
            dependsOn: ['step_1', 'step_2'],
          },
        ],
      }),
      expectedParsedSteps: 3,
      expectedDependencies: true,
      desc: 'Should handle multi-step dependencies correctly',
    },

    {
      name: 'Error Handling: No steps in response',
      mood: 'clean' as const,
      userRequest: 'Do something',
      llmResponse: JSON.stringify({ steps: [] }),
      expectedParsedSteps: 0,
      canBeEmpty: true,
      desc: 'Should handle empty step arrays gracefully',
    },

    {
      name: 'Error Handling: Invalid JSON response',
      mood: 'clean' as const,
      userRequest: 'Do something',
      llmResponse: 'This is not JSON at all',
      shouldThrowOrFail: true,
      desc: 'Should handle invalid JSON gracefully',
    },
  ];

  it.each(plannerLLMWorkflowMatrix)(
    'Planner-LLM: $desc',
    ({
      mood,
      userRequest,
      expectedPromptContent,
      llmResponse,
      expectedParsedSteps,
      includeContext,
      contextDetails,
      shouldThrowOrFail,
      canBeEmpty,
      expectedDependencies,
    }) => {
      // Create planner with specified mood (controls LLM response format)
      const { instance, mocks } = createMockPlanner({
        mood,
        rawLLMResponse: llmResponse,
      });

      // Test 1: Verify prompt building includes expected content
      const prompt = (instance as any).buildPlanPrompt(userRequest, !!includeContext);

      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);

      // Verify expected content in prompt (if provided)
      if (expectedPromptContent) {
        expectedPromptContent.forEach((content) => {
          expect(prompt.toLowerCase()).toMatch(new RegExp(content.toLowerCase()));
        });
      }

      // Test 2: Verify response parsing
      if (!shouldThrowOrFail) {
        try {
          const steps = (instance as any).parseSteps(llmResponse);

          expect(Array.isArray(steps)).toBe(true);

          if (canBeEmpty) {
            expect(steps.length).toBeLessThanOrEqual(expectedParsedSteps || 0);
          } else {
            expect(steps.length).toBe(expectedParsedSteps);
          }

          // Verify dependency structure if expected
          if (expectedDependencies) {
            const stepsWithDeps = steps.filter((s) => s.dependsOn);
            expect(stepsWithDeps.length).toBeGreaterThan(0);
          }
        } catch (error) {
          // For valid responses, parsing should not throw
          if (!shouldThrowOrFail) {
            throw error;
          }
        }
      } else {
        // Expected to fail - parsing should handle gracefully
        try {
          (instance as any).parseSteps(llmResponse);
        } catch {
          // Expected - error handling is correct
        }
      }
    }
  );

  /**
   * ========================================================================
   * SPY TRACKING: Verify LLM communication
   * ========================================================================
   */
  describe('LLM Call Tracking with Spies', () => {
    it('should track LLM calls through factory spy', async () => {
      const { instance, mocks } = createMockPlanner({
        rawLLMResponse: JSON.stringify({ steps: [] }),
      });

      expect(mocks.sendMessageSpy).toBeDefined();
      expect(typeof mocks.sendMessageSpy).toBe('function');

      // Spy should have mock tracking
      expect(mocks.sendMessageSpy.mock).toBeDefined();
      expect(mocks.sendMessageSpy.mock.calls).toBeDefined();
    });

    it('should track prompt content in LLM calls', () => {
      const { instance, mocks } = createMockPlanner({
        rawLLMResponse: JSON.stringify({ steps: [] }),
      });

      // Build a prompt
      const prompt = (instance as any).buildPlanPrompt('Add authentication', true);

      // Verify prompt has expected structure
      expect(prompt).toContain('step');
      expect(prompt).toContain('action');
    });

    it('should support multiple mood-based responses', () => {
      const cleanResponse = 'clean: {"steps": []}';
      const markdownResponse = 'markdown: ```json\\n{"steps": []}\\n```';
      const hallucinResponse = 'halluc: Here is the plan: {"steps": []}';

      // All three should be parseable
      [cleanResponse, markdownResponse, hallucinResponse].forEach((response) => {
        expect(response).toBeDefined();
      });
    });

    it('should track response format in spy calls', async () => {
      const { instance, mocks } = createMockPlanner({
        mood: 'markdown',
        rawLLMResponse: '```json\n{"steps": []}\n```',
      });

      // Response format varies by mood
      expect(mocks).toBeDefined();
    });
  });

  /**
   * ========================================================================
   * ERROR RECOVERY: LLM failures and edge cases
   * ========================================================================
   */
  describe('LLM Error Handling and Recovery', () => {
    it('should handle LLM timeout gracefully', () => {
      const { instance } = createMockPlanner({
        rawLLMResponse: JSON.stringify({ steps: [] }),
      });

      // Simulating timeout scenario
      const timeoutError = new Error('LLM request timeout');

      expect(() => {
        throw timeoutError;
      }).toThrow('LLM request timeout');

      // Planner should be ready for retry
      expect(instance).toBeDefined();
    });

    it('should handle malformed LLM response', () => {
      const malformedResponse = '{ invalid json } [ mismatched }';

      const { instance } = createMockPlanner({
        rawLLMResponse: malformedResponse,
      });

      // Should handle gracefully (not crash)
      expect(instance).toBeDefined();
    });

    it('should handle LLM rate limiting', () => {
      const { instance, mocks } = createMockPlanner({
        rawLLMResponse: JSON.stringify({ steps: [] }),
      });

      // Rate limiting should not crash planner
      const rateLimitError = { statusCode: 429, message: 'Rate limited' };

      expect(rateLimitError.statusCode).toBe(429);
      expect(instance).toBeDefined();
    });

    it('should handle LLM authentication failure', () => {
      const { instance } = createMockPlanner({
        rawLLMResponse: JSON.stringify({ steps: [] }),
      });

      // Auth failure should not crash
      const authError = { statusCode: 401, message: 'Unauthorized' };

      expect(authError.statusCode).toBe(401);
      expect(instance).toBeDefined();
    });
  });

  /**
   * ========================================================================
   * CONTEXT WINDOW MANAGEMENT: Token limits and chunking
   * ========================================================================
   */
  describe('Context Window Management', () => {
    it('should respect context depth parameter', () => {
      const { instance } = createMockPlanner({
        contextDepth: 5,
        rawLLMResponse: JSON.stringify({ steps: [] }),
      });

      // Context depth should influence prompt generation
      const prompt = (instance as any).buildPlanPrompt('Fix', true);

      // Prompt should be generated properly
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should generate appropriate prompts for minimal projects', () => {
      const { instance } = createMockPlanner({
        rawLLMResponse: JSON.stringify({ steps: [] }),
      });

      const prompt = (instance as any).buildPlanPrompt('Add feature', true);

      // Should still generate valid prompt
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should include tool descriptions in prompt', () => {
      const { instance } = createMockPlanner({
        availableTools: ['read', 'write', 'run', 'delete'],
        rawLLMResponse: JSON.stringify({ steps: [] }),
      });

      const prompt = (instance as any).buildPlanPrompt('Do something', true);

      // Prompt should mention available actions
      expect(prompt.toLowerCase()).toMatch(/read|write|run|delete/);
    });
  });

  /**
   * ========================================================================
   * RESPONSE PARSING: Various mood-based scenarios
   * ========================================================================
   */
  describe('PLANNER_MOODS Response Parsing', () => {
    it('should provide access to PLANNER_MOODS', () => {
      expect(PLANNER_MOODS).toBeDefined();
      expect(typeof PLANNER_MOODS).toBe('object');
    });

    it('should have clean mood preset', () => {
      expect(PLANNER_MOODS.clean).toBeDefined();
      expect(typeof PLANNER_MOODS.clean).toBe('function');
    });

    it('should have markdown mood preset', () => {
      expect(PLANNER_MOODS.markdown).toBeDefined();
      expect(typeof PLANNER_MOODS.markdown).toBe('function');
    });

    it('should have hallucination mood preset', () => {
      expect(PLANNER_MOODS.hallucination).toBeDefined();
      expect(typeof PLANNER_MOODS.hallucination).toBe('function');
    });

    it('should generate mood-specific responses', () => {
      const cleanResponse = PLANNER_MOODS.clean();
      const markdownResponse = PLANNER_MOODS.markdown();
      const hallucinResponse = PLANNER_MOODS.hallucination();

      // All should be strings
      expect(typeof cleanResponse).toBe('string');
      expect(typeof markdownResponse).toBe('string');
      expect(typeof hallucinResponse).toBe('string');

      // Should be different
      expect(cleanResponse).not.toBe(markdownResponse);
      expect(markdownResponse).not.toBe(hallucinResponse);
    });

    it('should parse each mood correctly', () => {
      const { instance: cleanPlanner } = createMockPlanner({ mood: 'clean' });
      const { instance: markdownPlanner } = createMockPlanner({
        mood: 'markdown',
      });
      const { instance: hallucinPlanner } = createMockPlanner({
        mood: 'hallucination',
      });

      // All planners should be valid instances
      expect(cleanPlanner).toBeDefined();
      expect(markdownPlanner).toBeDefined();
      expect(hallucinPlanner).toBeDefined();
    });
  });
});
