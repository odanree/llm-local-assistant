import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Planner, TaskPlan } from './planner';

/**
 * Tests for Planner module (Phase 2: Agent Loop)
 * 
 * These tests verify:
 * - Plan generation from user requests
 * - JSON parsing and validation
 * - Markdown formatting
 * - Error handling
 */

describe('Planner', () => {
  let planner: Planner;
  let mockLLMClient: any;

  beforeEach(() => {
    mockLLMClient = {
      sendMessage: vi.fn(),
    };
    planner = new Planner({ llmClient: mockLLMClient });
  });

  describe('generateThinking', () => {
    it('should generate thinking/reasoning about the task', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'I need to read the existing component first to understand its structure, then create comprehensive tests that cover all edge cases and user interactions.',
      });

      const thinking = await planner.generateThinking('Create tests for the Button component');

      expect(thinking).toContain('read the existing component');
      expect(thinking).toContain('tests');
      expect(mockLLMClient.sendMessage).toHaveBeenCalled();
      
      const prompt = mockLLMClient.sendMessage.mock.calls[0][0];
      expect(prompt).toContain('Create tests for the Button component');
      expect(prompt).toContain('Analyze');
    });

    it('should handle thinking with conversation context', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'Based on the Button component you created, I will write unit tests that verify all props and event handlers work correctly.',
      });

      const context = {
        messages: [
          { role: 'user', content: 'Create Button component' },
          { role: 'assistant', content: 'Created Button.tsx' },
        ],
      };

      const thinking = await planner.generateThinking('Add tests', context);

      expect(thinking).toBeTruthy();
      
      const prompt = mockLLMClient.sendMessage.mock.calls[0][0];
      expect(prompt).toContain('Previous context');
      expect(prompt).toContain('Create Button component');
    });

    it('should clean up markdown formatting from thinking', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: '**First**, I\'ll read the existing file. **Then**, I\'ll generate the tests.',
      });

      const thinking = await planner.generateThinking('Create tests');

      // Bold markers should be removed
      expect(thinking).not.toContain('**');
      expect(thinking).toContain('First');
      expect(thinking).toContain('generate the tests');
    });

    it('should throw error on LLM failure during thinking', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: false,
        error: 'LLM connection failed',
      });

      await expect(planner.generateThinking('Test task')).rejects.toThrow(
        'Failed to generate thinking'
      );
    });
  });

  describe('generatePlan', () => {
    it('should generate valid plan from simple request', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: JSON.stringify({
          steps: [
            {
              stepId: 1,
              action: 'write',
              path: 'hello.ts',
              description: 'Create hello world function',
            },
          ],
          summary: 'Create a simple hello world script',
        }),
      });

      const { plan, markdown } = await planner.generatePlan(
        'Create a hello world function'
      );

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].action).toBe('write');
      expect(plan.steps[0].path).toBe('hello.ts');
      expect(plan.status).toBe('pending');
      expect(markdown).toContain('hello.ts');
      expect(markdown).toContain('/approve');
    });

    it('should handle multi-step requests', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: JSON.stringify({
          steps: [
            {
              stepId: 1,
              action: 'read',
              path: 'src/types.ts',
              description: 'Read existing types',
            },
            {
              stepId: 2,
              action: 'write',
              path: 'src/component.tsx',
              description: 'Create React component',
              prompt: 'Generate a React component',
            },
            {
              stepId: 3,
              action: 'write',
              path: 'src/component.test.tsx',
              description: 'Create component tests',
            },
            {
              stepId: 4,
              action: 'run',
              command: 'npm test',
              description: 'Run tests',
            },
          ],
          summary: 'Create React component with tests',
        }),
      });

      const { plan, markdown } = await planner.generatePlan(
        'Create a React component for user authentication with tests'
      );

      expect(plan.steps).toHaveLength(4);
      expect(plan.steps[0].action).toBe('read');
      expect(plan.steps[1].action).toBe('write');
      expect(plan.steps[3].action).toBe('run');
      expect(plan.steps[3].command).toBe('npm test');
      expect(markdown).toContain('Step 1:');
      expect(markdown).toContain('Step 4:');
    });

    it('should use conversation context for multi-turn awareness', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: JSON.stringify({
          steps: [
            {
              stepId: 1,
              action: 'read',
              path: 'src/Button.tsx',
              description: 'Read Button component',
            },
            {
              stepId: 2,
              action: 'write',
              path: 'src/Button.test.tsx',
              description: 'Create Button tests',
              prompt: 'Create comprehensive unit tests',
            },
          ],
          summary: 'Add tests for Button component',
        }),
      });

      const context = {
        messages: [
          { role: 'user', content: 'Create a Button component' },
          { role: 'assistant', content: 'I created src/Button.tsx' },
          { role: 'user', content: 'Now add error handling' },
          { role: 'assistant', content: 'Updated with error handling' },
        ],
      };

      const { plan } = await planner.generatePlan(
        'Add tests for it',
        context
      );

      // Verify sendMessage was called with context included
      expect(mockLLMClient.sendMessage).toHaveBeenCalled();
      const callArg = mockLLMClient.sendMessage.mock.calls[0][0];
      
      // Context should be included in the prompt
      expect(callArg).toContain('Previous conversation context');
      expect(callArg).toContain('Button component');
      expect(callArg).toContain('error handling');

      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].path).toBe('src/Button.tsx');
      expect(plan.steps[1].path).toBe('src/Button.test.tsx');
    });

    it('should handle empty conversation context gracefully', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: JSON.stringify({
          steps: [
            {
              stepId: 1,
              action: 'write',
              path: 'hello.ts',
              description: 'Create hello',
            },
          ],
          summary: 'Hello',
        }),
      });

      const context = { messages: [] };

      const { plan } = await planner.generatePlan('Create hello', context);

      expect(plan.steps).toHaveLength(1);
      
      // Verify sendMessage was called without context in prompt
      const callArg = mockLLMClient.sendMessage.mock.calls[0][0];
      expect(callArg).not.toContain('Previous conversation context');
    });

    it('should handle context with more than 6 messages by limiting to recent', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: JSON.stringify({
          steps: [{ stepId: 1, action: 'write', path: 'f.ts', description: 'D' }],
          summary: 'Test',
        }),
      });

      const context = {
        messages: [
          { role: 'user', content: 'msg1' },
          { role: 'user', content: 'msg2' },
          { role: 'user', content: 'msg3' },
          { role: 'user', content: 'msg4' },
          { role: 'user', content: 'msg5' },
          { role: 'user', content: 'msg6' },
          { role: 'user', content: 'msg7' },
          { role: 'user', content: 'msg8' },
        ],
      };

      await planner.generatePlan('Test', context);

      const callArg = mockLLMClient.sendMessage.mock.calls[0][0];
      
      // Should include context
      expect(callArg).toContain('Previous conversation context');
      // But only the last 6 messages should be included
      expect(callArg).toContain('msg3');  // Last 6 starts from msg3
      expect(callArg).toContain('msg8');  // Last message
      expect(callArg).not.toContain('msg1');  // First message should not be included
      expect(callArg).not.toContain('msg2');  // Second message should not be included
    });

    it('should handle JSON in markdown code blocks', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: `Here's your plan:
\`\`\`json
{
  "steps": [
    {
      "stepId": 1,
      "action": "write",
      "path": "test.ts",
      "description": "Create test file"
    }
  ],
  "summary": "Test plan"
}
\`\`\``,
      });

      const { plan } = await planner.generatePlan('Test request');

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].path).toBe('test.ts');
    });

    it('should set plan to pending status initially', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: JSON.stringify({
          steps: [
            {
              stepId: 1,
              action: 'write',
              path: 'file.ts',
              description: 'Create file',
            },
          ],
          summary: 'Test',
        }),
      });

      const { plan } = await planner.generatePlan('Test');

      expect(plan.status).toBe('pending');
      expect(plan.currentStep).toBe(0);
      expect(plan.results.size).toBe(0);
    });

    it('should generate unique taskIds', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: JSON.stringify({
          steps: [{ stepId: 1, action: 'write', path: 'f.ts', description: 'D' }],
          summary: 'Test',
        }),
      });

      const { plan: plan1 } = await planner.generatePlan('Test 1');
      
      // Small delay to ensure different timestamps
      await new Promise(r => setTimeout(r, 10));
      
      const { plan: plan2 } = await planner.generatePlan('Test 2');

      expect(plan1.taskId).not.toBe(plan2.taskId);
    });

    it('should throw error on LLM failure', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: false,
        error: 'LLM server connection failed',
      });

      await expect(planner.generatePlan('Test')).rejects.toThrow(
        'Failed to generate plan'
      );
    });

    it('should throw error on invalid JSON response', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'This is not JSON at all',
      });

      await expect(planner.generatePlan('Test')).rejects.toThrow(
        /Failed to parse plan JSON/
      );
    });

    it('should throw error on missing steps in plan', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: JSON.stringify({
          steps: [],
          summary: 'Empty plan',
        }),
      });

      await expect(planner.generatePlan('Test')).rejects.toThrow(
        'no steps found'
      );
    });

    it('should throw error on malformed JSON', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: `\`\`\`json
{
  "steps": [
    {
      "stepId": 1
      "action": "write"
    }
  ]
}
\`\`\``,
      });

      await expect(planner.generatePlan('Test')).rejects.toThrow(
        'Failed to parse plan JSON'
      );
    });

    it('should include prompt in step when provided', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: JSON.stringify({
          steps: [
            {
              stepId: 1,
              action: 'write',
              path: 'component.tsx',
              prompt: 'Create a button component with custom styling',
              description: 'Write button component',
            },
          ],
          summary: 'Create button',
        }),
      });

      const { plan } = await planner.generatePlan('Create button');

      expect(plan.steps[0].prompt).toBe('Create a button component with custom styling');
    });

    it('should format plan markdown with all step details', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: JSON.stringify({
          steps: [
            {
              stepId: 1,
              action: 'read',
              path: 'src/config.ts',
              description: 'Read configuration',
            },
            {
              stepId: 2,
              action: 'write',
              path: 'src/service.ts',
              prompt: 'Generate service with config',
              description: 'Create service',
            },
          ],
          summary: 'Build service',
        }),
      });

      const { markdown } = await planner.generatePlan('Build service');

      expect(markdown).toContain('Plan: Build service');
      expect(markdown).toContain('**Steps**:');
      expect(markdown).toContain('Step 1: Read configuration');
      expect(markdown).toContain('Step 2: Create service');
      expect(markdown).toContain('`read`');
      expect(markdown).toContain('`write`');
      expect(markdown).toContain('src/config.ts');
      expect(markdown).toContain('src/service.ts');
      expect(markdown).toContain('/approve');
    });
  });

  describe('refinePlan', () => {
    it('should generate refined plan based on feedback', async () => {
      const originalPlan: TaskPlan = {
        taskId: 'task_123',
        userRequest: 'Create a component',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            path: 'component.tsx',
            description: 'Create component',
          },
        ],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: JSON.stringify({
          steps: [
            {
              stepId: 1,
              action: 'read',
              path: 'src/styles.css',
              description: 'Read existing styles',
            },
            {
              stepId: 2,
              action: 'write',
              path: 'component.tsx',
              description: 'Create styled component',
            },
          ],
          summary: 'Create component with styles',
        }),
      });

      const refinedPlan = await planner.refinePlan(
        originalPlan,
        'Add styling support'
      );

      expect(refinedPlan.steps).toHaveLength(2);
      expect(refinedPlan.steps[0].action).toBe('read');
      expect(refinedPlan.status).toBe('pending');
      expect(refinedPlan.currentStep).toBe(0);
    });

    it('should maintain userRequest in refined plan', async () => {
      const originalPlan: TaskPlan = {
        taskId: 'task_123',
        userRequest: 'Original request',
        generatedAt: new Date(),
        steps: [],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: JSON.stringify({
          steps: [
            {
              stepId: 1,
              action: 'write',
              path: 'file.ts',
              description: 'Create file',
            },
          ],
          summary: 'Refined',
        }),
      });

      const refinedPlan = await planner.refinePlan(originalPlan, 'Feedback');

      expect(refinedPlan.userRequest).toBe('Original request');
    });
  });
});
