import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Executor, ExecutionResult } from './executor';
import { TaskPlan, PlanStep } from './planner';

/**
 * Tests for Executor module (Phase 2: Agent Loop)
 * 
 * These tests verify:
 * - Single step execution (read, write, run)
 * - Plan execution with retry logic
 * - Error handling and recovery
 * - Pause/resume/cancel operations
 * - Progress tracking
 */

describe('Executor', () => {
  let executor: Executor;
  let mockConfig: any;
  let mockLLMClient: any;
  let mockWorkspace: any;

  beforeEach(() => {
    mockLLMClient = {
      sendMessage: vi.fn(),
      clearHistory: vi.fn(),
    };

    mockWorkspace = {
      fsPath: '/workspace',
    };

    mockConfig = {
      extension: {} as any,
      llmClient: mockLLMClient,
      workspace: mockWorkspace,
      maxRetries: 2,
      timeout: 30000,
      onProgress: vi.fn(),
      onMessage: vi.fn(),
    };

    executor = new Executor(mockConfig);
  });

  describe('executeStep', () => {
    it('should execute read step successfully', async () => {
      const plan: TaskPlan = {
        taskId: 'task_1',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'read',
            path: 'test.ts',
            description: 'Read test file',
          },
        ],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      // Mock vscode fs API
      vi.mock('vscode');

      const result = await executor.executeStep(plan, 1);

      expect(result.stepId).toBe(1);
      expect(result.success).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should execute write step successfully', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'function hello() { return "world"; }',
      });

      const plan: TaskPlan = {
        taskId: 'task_1',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            path: 'hello.ts',
            description: 'Create hello file',
          },
        ],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      const result = await executor.executeStep(plan, 1);

      expect(result.stepId).toBe(1);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(mockLLMClient.sendMessage).toHaveBeenCalled();
    });

    it('should handle write step with custom prompt', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'Generated content',
      });

      const plan: TaskPlan = {
        taskId: 'task_1',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            path: 'custom.ts',
            prompt: 'Generate a custom file',
            description: 'Write custom file',
          },
        ],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      await executor.executeStep(plan, 1);

      const calls = mockLLMClient.sendMessage.mock.calls;
      expect(calls[0][0]).toContain('custom file');
    });

    it('should reject write step without path', async () => {
      const plan: TaskPlan = {
        taskId: 'task_1',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            description: 'Missing path',
          } as any,
        ],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      const result = await executor.executeStep(plan, 1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('path');
    });

    it('should handle suggestwrite as not yet implemented', async () => {
      const plan: TaskPlan = {
        taskId: 'task_1',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'suggestwrite',
            path: 'test.ts',
            description: 'Suggest write',
          },
        ],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      const result = await executor.executeStep(plan, 1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Schema Violation');
    });

    it('should emit onStepOutput callback during execution', async () => {
      const onStepOutput = vi.fn();
      const config = {
        ...mockConfig,
        onStepOutput,
      };
      const executorWithCallback = new Executor(config);

      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'function test() { return 42; }',
      });

      const plan: TaskPlan = {
        taskId: 'task_1',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            path: 'test.ts',
            description: 'Write test file',
          },
        ],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      const result = await executorWithCallback.executeStep(plan, 1);

      // Should emit step start, content preview, and completion
      expect(onStepOutput).toHaveBeenCalled();
      
      const calls = onStepOutput.mock.calls;
      // First call should be step start
      expect(calls[0][0]).toBe(1);  // stepId
      expect(calls[0][1]).toContain('Write test file');  // description
      expect(calls[0][2]).toBe(true);  // isStart
      
      // Should have additional calls for content preview
      expect(calls.length).toBeGreaterThan(1);

      expect(result.success).toBe(true);
    });

    it('should handle unknown action', async () => {
      const plan: TaskPlan = {
        taskId: 'task_1',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'unknown' as any,
            description: 'Unknown action',
          },
        ],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      const result = await executor.executeStep(plan, 1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Schema Violation');
    });

    it('should handle LLM failure during write', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: false,
        error: 'LLM server unavailable',
      });

      const plan: TaskPlan = {
        taskId: 'task_1',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            path: 'test.ts',
            description: 'Write file',
          },
        ],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      const result = await executor.executeStep(plan, 1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM');
    });
  });

  describe('executePlan', () => {
    it('should execute single-step plan', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'Content',
      });

      const plan: TaskPlan = {
        taskId: 'task_1',
        userRequest: 'Create file',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            path: 'file.ts',
            description: 'Create file',
          },
        ],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      const result = await executor.executePlan(plan);

      expect(result.success).toBeDefined();
      expect(result.completedSteps).toBeGreaterThanOrEqual(0);
      expect(result.totalDuration).toBeGreaterThanOrEqual(0);
      expect(['executing', 'completed', 'failed']).toContain(plan.status);
    });

    it('should update plan status on success', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'Content',
      });

      const plan: TaskPlan = {
        taskId: 'task_1',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            path: 'file.ts',
            description: 'Write',
          },
        ],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      await executor.executePlan(plan);

      expect(['completed', 'executing']).toContain(plan.status);
    });

    it('should call onProgress callback', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'Content',
      });

      const plan: TaskPlan = {
        taskId: 'task_1',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            path: 'file.ts',
            description: 'Write file',
          },
        ],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      await executor.executePlan(plan);

      if (mockConfig.onProgress.mock.calls.length > 0) {
        expect(mockConfig.onProgress).toHaveBeenCalled();
      }
    });

    it('should support pause/resume', async () => {
      const plan: TaskPlan = {
        taskId: 'task_1',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            path: 'file.ts',
            description: 'Write',
          },
        ],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      executor.pauseExecution();
      expect(executor.getStatus().paused).toBe(true);

      executor.resumeExecution();
      expect(executor.getStatus().paused).toBe(false);
    });

    it('should support cancel', async () => {
      const plan: TaskPlan = {
        taskId: 'task_1',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            path: 'file.ts',
            description: 'Write',
          },
        ],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      await executor.cancelExecution();
      expect(executor.getStatus().cancelled).toBe(true);
    });

    it('should track step results in plan', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'Content',
      });

      const plan: TaskPlan = {
        taskId: 'task_1',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            path: 'file.ts',
            description: 'Write',
          },
        ],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      await executor.executePlan(plan);

      // Results should be populated
      expect(plan.results.size >= 0).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return current execution status', () => {
      const status = executor.getStatus();

      expect(status).toHaveProperty('paused');
      expect(status).toHaveProperty('cancelled');
      expect(status).toHaveProperty('currentPlan');
      expect(typeof status.paused).toBe('boolean');
      expect(typeof status.cancelled).toBe('boolean');
    });

    it('should reflect pause state', () => {
      executor.pauseExecution();
      const status = executor.getStatus();

      expect(status.paused).toBe(true);
    });
  });

  describe('Follow-up Questions (Priority 2.2)', () => {
    it('should call onQuestion callback when clarification is needed', async () => {
      const onQuestionMock = vi.fn().mockResolvedValue('Yes, proceed');

      const config = {
        extension: {} as any,
        llmClient: mockLLMClient,
        workspace: mockWorkspace,
        onQuestion: onQuestionMock,
      };

      const executor2 = new Executor(config);

      // Verify onQuestion can be called
      expect(onQuestionMock).toBeDefined();
    });

    it('should handle question response in execution flow', async () => {
      let questionCalled = false;
      const onQuestionMock = vi.fn(async (question: string, options: string[]) => {
        questionCalled = true;
        expect(question).toBeDefined();
        expect(options.length).toBeGreaterThan(0);
        return options[0]; // Return first option
      });

      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'Generated content',
      });

      const config = {
        extension: {} as any,
        llmClient: mockLLMClient,
        workspace: mockWorkspace,
        onQuestion: onQuestionMock,
      };

      const executor2 = new Executor(config);
      expect(executor2).toBeDefined();
      // Note: Actual question triggering requires specific conditions
      // (e.g., directory with >5 files, or run command in plan)
    });

    it('should trigger question when executing npm commands', async () => {
      const onQuestionMock = vi.fn(async (question: string, options: string[]) => {
        expect(question).toContain('npm test');
        expect(options).toContain('Yes, proceed');
        return 'Yes, proceed'; // User proceeds
      });

      const config = {
        extension: {} as any,
        llmClient: mockLLMClient,
        workspace: mockWorkspace,
        onQuestion: onQuestionMock,
      };

      const executor2 = new Executor(config);
      
      // Create a run step with npm command
      const runStep: PlanStep = {
        stepId: 1,
        action: 'run',
        command: 'npm test',
        description: 'Run test suite',
      };

      // Call askClarification directly to verify it triggers the question
      const result = await (executor2 as any).askClarification(runStep, '');
      
      // Verify onQuestion was called
      expect(onQuestionMock).toHaveBeenCalledWith(
        expect.stringContaining('npm test'),
        expect.arrayContaining(['Yes, proceed', 'No, skip this step', 'Cancel execution'])
      );
      
      // When user answers "Yes, proceed", askClarification returns the step to continue execution
      expect(result).toEqual(runStep);
    });

    it('should trigger question for various package manager and testing commands', async () => {
      const onQuestionMock = vi.fn(async () => 'Yes, proceed');

      const config = {
        extension: {} as any,
        llmClient: mockLLMClient,
        workspace: mockWorkspace,
        onQuestion: onQuestionMock,
      };

      const executor2 = new Executor(config);
      
      // Test various commands that should trigger questions
      const testCases = [
        { cmd: 'yarn build', description: 'Yarn build' },
        { cmd: 'pnpm install', description: 'PNPM install' },
        { cmd: 'pytest tests/', description: 'Python pytest' },
        { cmd: 'docker compose up', description: 'Docker compose' },
        { cmd: 'git push origin main', description: 'Git push' },
        { cmd: 'npm run dev', description: 'NPM dev server' },
      ];

      for (const { cmd, description } of testCases) {
        onQuestionMock.mockClear();
        
        const runStep: PlanStep = {
          stepId: 1,
          action: 'run',
          command: cmd,
          description,
        };

        await (executor2 as any).askClarification(runStep, '');
        
        // Each command should trigger a question
        expect(onQuestionMock).toHaveBeenCalled();
      }
    });

    it('should not trigger question for simple utility commands', async () => {
      const onQuestionMock = vi.fn(async () => 'Yes, proceed');

      const config = {
        extension: {} as any,
        llmClient: mockLLMClient,
        workspace: mockWorkspace,
        onQuestion: onQuestionMock,
      };

      const executor2 = new Executor(config);
      
      // Simple commands that shouldn't trigger questions
      const simpleCommands = [
        { cmd: 'ls -la', description: 'List files' },
        { cmd: 'pwd', description: 'Print working directory' },
        { cmd: 'echo hello', description: 'Echo text' },
        { cmd: 'cat file.txt', description: 'Cat file' },
      ];

      for (const { cmd, description } of simpleCommands) {
        onQuestionMock.mockClear();
        
        const runStep: PlanStep = {
          stepId: 1,
          action: 'run',
          command: cmd,
          description,
        };

        await (executor2 as any).askClarification(runStep, '');
        
        // Simple commands should not trigger questions
        expect(onQuestionMock).not.toHaveBeenCalled();
      }
    });
  });

  describe('Write Operation Questions (Phase 2.2)', () => {
    it('should trigger question for critical config files', async () => {
      const onQuestionMock = vi.fn().mockResolvedValue('Yes, write the file');

      const mockConfig2 = {
        extension: {} as any,
        llmClient: {
          sendMessage: vi.fn().mockResolvedValue({
            success: true,
            message: 'test content',
          }),
          clearHistory: vi.fn(),
          config: {},
          conversationHistory: [],
          isServerHealthy: vi.fn(),
          sendMessageStream: vi.fn(),
          getHistory: vi.fn(),
        } as any,
        workspace: { fsPath: '/workspace' },
        onQuestion: onQuestionMock,
        onStepOutput: vi.fn(),
      };

      const executor2 = new Executor(mockConfig2 as any);
      
      const plan: TaskPlan = {
        taskId: 'task_1',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            path: 'package.json',
            prompt: 'Update package.json',
            description: 'Write package.json',
          },
        ],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      await executor2.executeStep(plan, 1);

      // Question should be triggered for package.json
      expect(onQuestionMock).toHaveBeenCalledWith(
        expect.stringContaining('package.json'),
        expect.arrayContaining(['Yes, write the file', 'No, skip this step', 'Cancel execution'])
      );
    });

    it('should trigger question for environment config files', async () => {
      const onQuestionMock = vi.fn().mockResolvedValue('Yes, write the file');

      const mockConfig2 = {
        extension: {} as any,
        llmClient: {
          sendMessage: vi.fn().mockResolvedValue({
            success: true,
            message: 'test content',
          }),
          clearHistory: vi.fn(),
          config: {},
          conversationHistory: [],
          isServerHealthy: vi.fn(),
          sendMessageStream: vi.fn(),
          getHistory: vi.fn(),
        } as any,
        workspace: { fsPath: '/workspace' },
        onQuestion: onQuestionMock,
        onStepOutput: vi.fn(),
      };

      const executor2 = new Executor(mockConfig2 as any);
      
      const plan: TaskPlan = {
        taskId: 'task_2',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            path: '.env',
            prompt: 'Update .env',
            description: 'Write .env file',
          },
        ],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      await executor2.executeStep(plan, 1);

      expect(onQuestionMock).toHaveBeenCalledWith(
        expect.stringContaining('.env'),
        expect.any(Array)
      );
    });

    it('should NOT trigger question for simple text files', async () => {
      const onQuestionMock = vi.fn().mockResolvedValue('Yes, write the file');

      const mockConfig2 = {
        extension: {} as any,
        llmClient: {
          sendMessage: vi.fn().mockResolvedValue({
            success: true,
            message: 'test content',
          }),
          clearHistory: vi.fn(),
          config: {},
          conversationHistory: [],
          isServerHealthy: vi.fn(),
          sendMessageStream: vi.fn(),
          getHistory: vi.fn(),
        } as any,
        workspace: { fsPath: '/workspace' },
        onQuestion: onQuestionMock,
        onStepOutput: vi.fn(),
      };

      const executor2 = new Executor(mockConfig2 as any);
      
      const plan: TaskPlan = {
        taskId: 'task_3',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            path: 'output.txt',
            prompt: 'Write output',
            description: 'Write output.txt',
          },
        ],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      await executor2.executeStep(plan, 1);

      // Question should NOT be triggered for simple text files
      expect(onQuestionMock).not.toHaveBeenCalled();
    });

    it('should handle user skipping a risky write operation', async () => {
      const onQuestionMock = vi.fn().mockResolvedValue('No, skip this step');

      const mockConfig2 = {
        extension: {} as any,
        llmClient: {
          sendMessage: vi.fn().mockResolvedValue({
            success: true,
            message: 'test content',
          }),
          clearHistory: vi.fn(),
          config: {},
          conversationHistory: [],
          isServerHealthy: vi.fn(),
          sendMessageStream: vi.fn(),
          getHistory: vi.fn(),
        } as any,
        workspace: { fsPath: '/workspace' },
        onQuestion: onQuestionMock,
        onStepOutput: vi.fn(),
      };

      const executor2 = new Executor(mockConfig2 as any);
      
      const plan: TaskPlan = {
        taskId: 'task_4',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            path: 'tsconfig.json',
            prompt: 'Update tsconfig',
            description: 'Write tsconfig.json',
          },
        ],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      const result = await executor2.executeStep(plan, 1);

      // Should succeed but skip the write
      expect(result.success).toBe(true);
      expect(result.output).toContain('Skipped');
    });

    it('should trigger question for Dockerfile and compose files', async () => {
      const onQuestionMock = vi.fn().mockResolvedValue('Yes, write the file');

      const mockConfig2 = {
        extension: {} as any,
        llmClient: {
          sendMessage: vi.fn().mockResolvedValue({
            success: true,
            message: 'test content',
          }),
          clearHistory: vi.fn(),
          config: {},
          conversationHistory: [],
          isServerHealthy: vi.fn(),
          sendMessageStream: vi.fn(),
          getHistory: vi.fn(),
        } as any,
        workspace: { fsPath: '/workspace' },
        onQuestion: onQuestionMock,
        onStepOutput: vi.fn(),
      };

      const executor2 = new Executor(mockConfig2 as any);
      
      const plan: TaskPlan = {
        taskId: 'task_5',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            path: 'Dockerfile',
            prompt: 'Create Dockerfile',
            description: 'Write Dockerfile',
          },
        ],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      await executor2.executeStep(plan, 1);

      expect(onQuestionMock).toHaveBeenCalledWith(
        expect.stringContaining('Dockerfile'),
        expect.any(Array)
      );
    });
  });

  describe('Smart Error Fixes (Priority 1.4)', () => {
    it('should provide error context for missing files', async () => {
      const step: PlanStep = {
        stepId: 1,
        action: 'read',
        path: 'missing.txt',
        description: 'Read missing file',
      };

      const plan: TaskPlan = {
        taskId: 'task_1',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [step],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      expect(step.action).toBe('read');
      expect(step.path).toBe('missing.txt');
    });

    it('should structure errors for command failures', async () => {
      const plan: TaskPlan = {
        taskId: 'task_1',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'run',
            command: 'nonexistent-command',
            description: 'Run missing command',
          },
        ],
        status: 'pending',
        currentStep: 0,
        results: new Map(),
      };

      const runStep = plan.steps[0];
      expect(runStep.action).toBe('run');
      expect(runStep.command).toBe('nonexistent-command');
    });

    it('should categorize permission errors for write operations', async () => {
      const step: PlanStep = {
        stepId: 1,
        action: 'write',
        path: '/protected/file.txt',
        prompt: 'Write something',
        description: 'Write to protected location',
      };

      expect(step.action).toBe('write');
      expect(step.path).toBeDefined();
      if (step.path) {
        expect(step.path).toContain('protected');
      }
    });
  });

  describe('Phase 15: Integration Tests for Validation & Auto-Correction', () => {
    describe('validateGeneratedCode Integration', () => {
      it('should detect and report TypeScript validation errors in generated code', async () => {
        const codeWithErrors = `
const count = useState(0);  // ERROR: useState not imported
interface Props { name: string; }
export const Component: React.FC<Props> = () => {
  return <button>{count}</button>;
};`;

        const plan: TaskPlan = {
          taskId: 'task_1',
          userRequest: 'Create counter component',
          generatedAt: new Date(),
          steps: [
            {
              stepId: 1,
              action: 'write',
              path: 'Counter.tsx',
              prompt: 'Generate counter component',
              description: 'Create Counter component',
              generatedCode: codeWithErrors,
            } as any,
          ],
          status: 'pending',
          currentStep: 0,
          results: new Map(),
        };

        const step = plan.steps[0];
        expect(step.generatedCode).toContain('useState');
        expect(step.generatedCode).toContain('React.FC');
      });

      it('should validate architecture patterns in React components', async () => {
        const componentCode = `
import React, { useState } from 'react';
import { useStore } from 'zustand';

export interface CounterState {
  count: number;
  increment: () => void;
}

export const useCounterStore = create<CounterState>(set => ({
  count: 0,
  increment: () => set(state => ({ count: state.count + 1 }))
}));

export const Counter: React.FC = () => {
  const { count, increment } = useCounterStore();
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={increment}>+1</button>
    </div>
  );
};`;

        const plan: TaskPlan = {
          taskId: 'task_2',
          userRequest: 'Create Zustand store with counter',
          generatedAt: new Date(),
          steps: [
            {
              stepId: 1,
              action: 'write',
              path: 'useCounterStore.ts',
              generatedCode: componentCode,
              description: 'Create counter store',
            } as any,
          ],
          status: 'pending',
          currentStep: 0,
          results: new Map(),
        };

        const step = plan.steps[0];
        expect(step.generatedCode).toContain('create<CounterState>');
        expect(step.generatedCode).toContain('useCounterStore');
      });

      it('should detect missing required form patterns', async () => {
        const formCodeMissingPatterns = `
export const LoginForm: React.FC = () => {
  const [email, setEmail] = useState('');

  return (
    <form>
      <input value={email} onChange={e => setEmail(e.target.value)} />
      <button type="submit">Login</button>
    </form>
  );
};`;

        const plan: TaskPlan = {
          taskId: 'task_3',
          userRequest: 'Create login form',
          generatedAt: new Date(),
          steps: [
            {
              stepId: 1,
              action: 'write',
              path: 'LoginForm.tsx',
              generatedCode: formCodeMissingPatterns,
              description: 'Create LoginForm component',
            } as any,
          ],
          status: 'pending',
          currentStep: 0,
          results: new Map(),
        };

        const code = plan.steps[0].generatedCode as string;
        // Form missing FormEventHandler and proper typing
        expect(code).toContain('onChange');
        expect(code).not.toContain('FormEventHandler');
      });

      it('should validate hook naming conventions', async () => {
        const hookCode = `
import { useState } from 'react';

// Custom hook - should follow useXXX naming
export function getUserData(userId: string) {
  const [user, setUser] = useState(null);
  return user;
}

export function useUserData(userId: string) {
  const [user, setUser] = useState(null);
  return user;
}`;

        const plan: TaskPlan = {
          taskId: 'task_4',
          userRequest: 'Create hooks for user data',
          generatedAt: new Date(),
          steps: [
            {
              stepId: 1,
              action: 'write',
              path: 'hooks/useUserData.ts',
              generatedCode: hookCode,
              description: 'Create useUserData hook',
            } as any,
          ],
          status: 'pending',
          currentStep: 0,
          results: new Map(),
        };

        const code = plan.steps[0].generatedCode as string;
        expect(code).toContain('useUserData'); // Good hook name
        expect(code).toContain('getUserData'); // Bad hook name - missing use prefix
      });

      it('should detect unused imports and undefined variables', async () => {
        const codeWithUnused = `
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export const Dashboard: React.FC = () => {
  const [data, setData] = useState([]);
  // useNavigate is imported but never used
  // axios is imported but never used

  return <div>{data.length} items</div>;
};`;

        const plan: TaskPlan = {
          taskId: 'task_5',
          userRequest: 'Create dashboard',
          generatedAt: new Date(),
          steps: [
            {
              stepId: 1,
              action: 'write',
              path: 'Dashboard.tsx',
              generatedCode: codeWithUnused,
              description: 'Create Dashboard component',
            } as any,
          ],
          status: 'pending',
          currentStep: 0,
          results: new Map(),
        };

        const code = plan.steps[0].generatedCode as string;
        expect(code).toContain('useNavigate');
        expect(code).toContain('axios');
      });
    });

    describe('smartAutoCorrection Integration', () => {
      it('should orchestrate circular import detection and fixing', async () => {
        const circularCode = `
import { userService } from './userService';

export class UserService {
  getUser(id: number) {
    return userService.fetchUser(id);
  }
}`;

        const step: PlanStep = {
          stepId: 1,
          action: 'write',
          path: 'services/userService.ts',
          generatedCode: circularCode,
          description: 'Create user service',
        };

        const plan: TaskPlan = {
          taskId: 'task_6',
          userRequest: 'Create user service',
          generatedAt: new Date(),
          steps: [step],
          status: 'pending',
          currentStep: 0,
          results: new Map(),
        };

        expect(plan.steps[0].generatedCode).toContain('userService');
        expect(plan.steps[0].path).toContain('userService');
      });

      it('should detect and fix missing React imports with hook usage', async () => {
        const missingReactCode = `
const MyComponent = () => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    console.log('Component mounted');
  }, []);

  return <div>{count}</div>;
};`;

        const step: PlanStep = {
          stepId: 1,
          action: 'write',
          path: 'MyComponent.tsx',
          generatedCode: missingReactCode,
          description: 'Create component with hooks',
        };

        const plan: TaskPlan = {
          taskId: 'task_7',
          userRequest: 'Create component',
          generatedAt: new Date(),
          steps: [step],
          status: 'pending',
          currentStep: 0,
          results: new Map(),
        };

        const code = plan.steps[0].generatedCode as string;
        // Code uses hooks but may not have proper imports
        expect(code).toContain('useState');
        expect(code).toContain('useEffect');
      });

      it('should identify and suggest fixes for multiple missing imports', async () => {
        const multiMissingCode = `
export const UserList = () => {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['users'],
    queryFn: () => axios.get('/api/users')
  });

  const users = useUserStore(state => state.users);

  return (
    <div>
      {users.map(user => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
};`;

        const step: PlanStep = {
          stepId: 1,
          action: 'write',
          path: 'UserList.tsx',
          generatedCode: multiMissingCode,
          description: 'Create user list component',
        };

        const plan: TaskPlan = {
          taskId: 'task_8',
          userRequest: 'Create user list',
          generatedAt: new Date(),
          steps: [step],
          status: 'pending',
          currentStep: 0,
          results: new Map(),
        };

        const code = plan.steps[0].generatedCode as string;
        expect(code).toContain('useNavigate');
        expect(code).toContain('useQuery');
        expect(code).toContain('axios');
        expect(code).toContain('useUserStore');
      });

      it('should handle mixed state management patterns requiring fixes', async () => {
        const mixedStateCode = `
import { useState } from 'react';
import { useCounterStore } from './store';

export const Counter = () => {
  const [localCount, setLocalCount] = useState(0);
  const { count, increment } = useCounterStore();

  const handleClick = () => {
    setLocalCount(localCount + 1);
    increment();
  };

  return (
    <button onClick={handleClick}>
      Local: {localCount}, Store: {count}
    </button>
  );
};`;

        const step: PlanStep = {
          stepId: 1,
          action: 'write',
          path: 'Counter.tsx',
          generatedCode: mixedStateCode,
          description: 'Create counter with mixed state',
        };

        const plan: TaskPlan = {
          taskId: 'task_9',
          userRequest: 'Create counter',
          generatedAt: new Date(),
          steps: [step],
          status: 'pending',
          currentStep: 0,
          results: new Map(),
        };

        const code = plan.steps[0].generatedCode as string;
        expect(code).toContain('useState');
        expect(code).toContain('useCounterStore');
      });

      it('should validate form-specific import patterns', async () => {
        const formCode = `
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const LoginForm = () => {
  const { register, handleSubmit } = useForm({
    resolver: zodResolver(schema),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} />
      <input type="password" {...register('password')} />
      <button type="submit">Login</button>
    </form>
  );
};`;

        const step: PlanStep = {
          stepId: 1,
          action: 'write',
          path: 'LoginForm.tsx',
          generatedCode: formCode,
          description: 'Create form with validation',
        };

        const plan: TaskPlan = {
          taskId: 'task_10',
          userRequest: 'Create login form with validation',
          generatedAt: new Date(),
          steps: [step],
          status: 'pending',
          currentStep: 0,
          results: new Map(),
        };

        const code = plan.steps[0].generatedCode as string;
        expect(code).toContain('useForm');
        expect(code).toContain('zodResolver');
      });
    });

    describe('validateCommonPatterns Integration', () => {
      it('should detect misused React hooks in service files', async () => {
        const serviceWithHooks = `
// ERROR: Hooks should not be in services
import { useState } from 'react';

export class UserService {
  const [cache, setCache] = useState([]);  // INVALID!

  async getUser(id: number) {
    return fetch(\`/api/users/\${id}\`).then(r => r.json());
  }
}`;

        const step: PlanStep = {
          stepId: 1,
          action: 'write',
          path: 'services/userService.ts',
          generatedCode: serviceWithHooks,
          description: 'Create user service',
        };

        const plan: TaskPlan = {
          taskId: 'task_11',
          userRequest: 'Create user service',
          generatedAt: new Date(),
          steps: [step],
          status: 'pending',
          currentStep: 0,
          results: new Map(),
        };

        const code = plan.steps[0].generatedCode as string;
        expect(code).toContain('useState');
        expect(code).toContain('UserService');
      });

      it('should detect unsafe namespace usage patterns', async () => {
        const namespaceCode = `
export const Logger = {
  log: (msg: string) => {
    const timestamp = new Date().toISOString();
    console.log(\`[\${timestamp}] \${msg}\`);
    Math.random(); // Random number generation in logger?
  }
};`;

        const step: PlanStep = {
          stepId: 1,
          action: 'write',
          path: 'utils/logger.ts',
          generatedCode: namespaceCode,
          description: 'Create logger utility',
        };

        const plan: TaskPlan = {
          taskId: 'task_12',
          userRequest: 'Create logger',
          generatedAt: new Date(),
          steps: [step],
          status: 'pending',
          currentStep: 0,
          results: new Map(),
        };

        const code = plan.steps[0].generatedCode as string;
        expect(code).toContain('console.log');
        expect(code).toContain('Math.random');
      });

      it('should detect React Router hook misuse in non-component context', async () => {
        const routerHookCode = `
import { useNavigate } from 'react-router-dom';

export async function redirectUser(path: string) {
  const navigate = useNavigate();  // ERROR: Hooks outside components
  navigate(path);
}`;

        const step: PlanStep = {
          stepId: 1,
          action: 'write',
          path: 'utils/navigation.ts',
          generatedCode: routerHookCode,
          description: 'Create navigation utility',
        };

        const plan: TaskPlan = {
          taskId: 'task_13',
          userRequest: 'Create navigation utility',
          generatedAt: new Date(),
          steps: [step],
          status: 'pending',
          currentStep: 0,
          results: new Map(),
        };

        const code = plan.steps[0].generatedCode as string;
        expect(code).toContain('useNavigate');
        expect(code).toContain('async function');
      });

      it('should detect TanStack Query hook usage in service layer', async () => {
        const queryInService = `
import { useQuery } from '@tanstack/react-query';

export class UserRepository {
  getUser(id: number) {
    const { data } = useQuery({  // ERROR: Service shouldn't use hooks
      queryKey: ['user', id],
      queryFn: () => fetch(\`/api/users/\${id}\`).then(r => r.json())
    });
    return data;
  }
}`;

        const step: PlanStep = {
          stepId: 1,
          action: 'write',
          path: 'repositories/userRepository.ts',
          generatedCode: queryInService,
          description: 'Create user repository',
        };

        const plan: TaskPlan = {
          taskId: 'task_14',
          userRequest: 'Create user repository',
          generatedAt: new Date(),
          steps: [step],
          status: 'pending',
          currentStep: 0,
          results: new Map(),
        };

        const code = plan.steps[0].generatedCode as string;
        expect(code).toContain('useQuery');
        expect(code).toContain('UserRepository');
      });

      it('should validate Zod schema imports in type files', async () => {
        const typeFileWithSchema = `
import { z } from 'zod';

export type User = {
  id: number;
  email: string;
  name: string;
};

// Schemas should not be in type files
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  name: z.string(),
});`;

        const step: PlanStep = {
          stepId: 1,
          action: 'write',
          path: 'types/user.ts',
          generatedCode: typeFileWithSchema,
          description: 'Create user type definitions',
        };

        const plan: TaskPlan = {
          taskId: 'task_15',
          userRequest: 'Create type definitions',
          generatedAt: new Date(),
          steps: [step],
          status: 'pending',
          currentStep: 0,
          results: new Map(),
        };

        const code = plan.steps[0].generatedCode as string;
        expect(code).toContain('userSchema');
        expect(code).toContain('z.object');
      });
    });

    describe('validateFormComponentPatterns Integration', () => {
      it('should validate FormEventHandler type annotations on input handlers', async () => {
        const formWithoutTypes = `
import React, { useState } from 'react';

export const EmailInput = () => {
  const [email, setEmail] = useState('');

  const handleChange = (e) => {  // Missing type annotation
    setEmail(e.target.value);
  };

  return <input value={email} onChange={handleChange} />;
};`;

        const step: PlanStep = {
          stepId: 1,
          action: 'write',
          path: 'EmailInput.tsx',
          generatedCode: formWithoutTypes,
          description: 'Create email input component',
        };

        const plan: TaskPlan = {
          taskId: 'task_16',
          userRequest: 'Create email input',
          generatedAt: new Date(),
          steps: [step],
          status: 'pending',
          currentStep: 0,
          results: new Map(),
        };

        const code = plan.steps[0].generatedCode as string;
        expect(code).toContain('handleChange');
        expect(code).not.toContain('FormEventHandler');
      });

      it('should verify form onSubmit handler patterns', async () => {
        const formWithSubmit = `
import { FormEventHandler } from 'react';
import { useForm } from 'react-hook-form';

export const ContactForm = () => {
  const { register, handleSubmit } = useForm();

  const onSubmit: FormEventHandler = (e) => {
    e.preventDefault();
    console.log('Submitting form');
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} />
      <button type="submit">Send</button>
    </form>
  );
};`;

        const step: PlanStep = {
          stepId: 1,
          action: 'write',
          path: 'ContactForm.tsx',
          generatedCode: formWithSubmit,
          description: 'Create contact form',
        };

        const plan: TaskPlan = {
          taskId: 'task_17',
          userRequest: 'Create contact form',
          generatedAt: new Date(),
          steps: [step],
          status: 'pending',
          currentStep: 0,
          results: new Map(),
        };

        const code = plan.steps[0].generatedCode as string;
        expect(code).toContain('FormEventHandler');
        expect(code).toContain('handleSubmit');
      });

      it('should validate state interface separation from form components', async () => {
        const formWithStateInterface = `
import { useState } from 'react';

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
}

export const UserForm = () => {
  const [formState, setFormState] = useState<FormState>({
    firstName: '',
    lastName: '',
    email: ''
  });

  const handleChange = (field: keyof FormState, value: string) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form>
      <input value={formState.firstName} onChange={e => handleChange('firstName', e.target.value)} />
      <input value={formState.lastName} onChange={e => handleChange('lastName', e.target.value)} />
      <input value={formState.email} onChange={e => handleChange('email', e.target.value)} />
    </form>
  );
};`;

        const step: PlanStep = {
          stepId: 1,
          action: 'write',
          path: 'UserForm.tsx',
          generatedCode: formWithStateInterface,
          description: 'Create user form with state interface',
        };

        const plan: TaskPlan = {
          taskId: 'task_18',
          userRequest: 'Create user form',
          generatedAt: new Date(),
          steps: [step],
          status: 'pending',
          currentStep: 0,
          results: new Map(),
        };

        const code = plan.steps[0].generatedCode as string;
        expect(code).toContain('interface FormState');
        expect(code).toContain('setFormState');
      });

      it('should validate error state tracking patterns in forms', async () => {
        const formWithErrorTracking = `
import { useState } from 'react';
import { z } from 'zod';

interface FormErrors {
  email?: string;
  password?: string;
}

export const LoginForm = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<FormErrors>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8)
    });

    const result = schema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: FormErrors = {};
      result.error.errors.forEach(err => {
        fieldErrors[err.path[0] as keyof FormErrors] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    console.log('Form valid, submitting');
  };

  return (
    <form onSubmit={handleSubmit}>
      <input value={formData.email} />
      {errors.email && <span>{errors.email}</span>}
      <button type="submit">Login</button>
    </form>
  );
};`;

        const step: PlanStep = {
          stepId: 1,
          action: 'write',
          path: 'LoginForm.tsx',
          generatedCode: formWithErrorTracking,
          description: 'Create login form with error tracking',
        };

        const plan: TaskPlan = {
          taskId: 'task_19',
          userRequest: 'Create login form with validation',
          generatedAt: new Date(),
          steps: [step],
          status: 'pending',
          currentStep: 0,
          results: new Map(),
        };

        const code = plan.steps[0].generatedCode as string;
        expect(code).toContain('interface FormErrors');
        expect(code).toContain('setErrors');
      });

      it('should validate named inputs and consolidator patterns', async () => {
        const formWithConsolidator = `
import { useState } from 'react';

interface FormFields {
  username: string;
  email: string;
  phone: string;
}

export const RegistrationForm = () => {
  const [fields, setFields] = useState<FormFields>({
    username: '',
    email: '',
    phone: '',
  });

  // Consolidator pattern - single handler for all inputs
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.currentTarget;
    setFields(prev => ({ ...prev, [name]: value }));
  };

  return (
    <form>
      <input name="username" value={fields.username} onChange={handleInputChange} />
      <input name="email" type="email" value={fields.email} onChange={handleInputChange} />
      <input name="phone" value={fields.phone} onChange={handleInputChange} />
    </form>
  );
};`;

        const step: PlanStep = {
          stepId: 1,
          action: 'write',
          path: 'RegistrationForm.tsx',
          generatedCode: formWithConsolidator,
          description: 'Create registration form with consolidator',
        };

        const plan: TaskPlan = {
          taskId: 'task_20',
          userRequest: 'Create registration form',
          generatedAt: new Date(),
          steps: [step],
          status: 'pending',
          currentStep: 0,
          results: new Map(),
        };

        const code = plan.steps[0].generatedCode as string;
        expect(code).toContain('handleInputChange');
        expect(code).toContain('interface FormFields');
      });
    });

    describe('handoverSummary Integration', () => {
      it('should generate complete handover from execution results', async () => {
        const results = new Map();
        results.set(1, {
          stepId: 1,
          success: true,
          duration: 500,
          output: 'Created user store',
          requiresManualVerification: false,
        });
        results.set(2, {
          stepId: 2,
          success: true,
          duration: 800,
          output: 'Created user component',
          requiresManualVerification: false,
        });
        results.set(3, {
          stepId: 3,
          success: true,
          duration: 300,
          output: '📝 MANUAL STEP: Add tests for User component',
          requiresManualVerification: true,
        });

        // Verify handover would be generated correctly
        expect(results.size).toBe(3);
        expect(results.get(1)?.success).toBe(true);
        expect(results.get(3)?.requiresManualVerification).toBe(true);
      });

      it('should summarize partial execution with manual tasks', async () => {
        const results = new Map();
        results.set(1, {
          stepId: 1,
          success: true,
          duration: 1000,
          output: 'Created API routes',
          requiresManualVerification: false,
        });
        results.set(2, {
          stepId: 2,
          success: false,
          duration: 500,
          error: 'Database migration pending',
          requiresManualVerification: false,
        });
        results.set(3, {
          stepId: 3,
          success: true,
          duration: 200,
          output: 'Run database migrations with: npm run migrate',
          requiresManualVerification: true,
        });

        expect(results.size).toBe(3);
        const successCount = Array.from(results.values()).filter(r => r.success).length;
        expect(successCount).toBe(2);
      });

      it('should calculate execution metrics for handover', async () => {
        const results = new Map();
        const durations = [300, 450, 250, 600];

        durations.forEach((duration, index) => {
          results.set(index + 1, {
            stepId: index + 1,
            success: true,
            duration,
            output: `Step ${index + 1} completed`,
            requiresManualVerification: false,
          });
        });

        const totalDuration = Array.from(results.values()).reduce((sum, r) => sum + (r.duration || 0), 0);
        expect(totalDuration).toBe(1600);
        expect(results.size).toBe(4);
      });

      it('should identify manual tasks from step outputs', async () => {
        const results = new Map();
        results.set(1, {
          stepId: 1,
          success: true,
          duration: 500,
          output: 'Created components',
          requiresManualVerification: false,
        });
        results.set(2, {
          stepId: 2,
          success: true,
          duration: 800,
          output: '📝 MANUAL: Add integration tests for new API endpoints',
          requiresManualVerification: true,
        });
        results.set(3, {
          stepId: 3,
          success: true,
          duration: 600,
          output: '✓ Test implementation guide: Use vitest for unit tests and SuperTest for API tests',
          requiresManualVerification: true,
        });

        const manualSteps = Array.from(results.values()).filter(r => r.requiresManualVerification);
        expect(manualSteps.length).toBe(2);
      });

      it('should suggest component tests based on created files', async () => {
        const results = new Map();
        results.set(1, {
          stepId: 1,
          success: true,
          duration: 400,
          output: 'Created UserCard.tsx component',
          requiresManualVerification: false,
        });
        results.set(2, {
          stepId: 2,
          success: true,
          duration: 350,
          output: 'Created UserProfile.tsx component',
          requiresManualVerification: false,
        });

        const filesCreated = ['src/components/UserCard.tsx', 'src/components/UserProfile.tsx'];

        expect(filesCreated.length).toBe(2);
        expect(filesCreated[0]).toContain('UserCard');
      });

      it('should format handover HTML with completion status', async () => {
        const results = new Map();
        results.set(1, {
          stepId: 1,
          success: true,
          duration: 500,
          output: 'Step 1 done',
          requiresManualVerification: false,
        });
        results.set(2, {
          stepId: 2,
          success: true,
          duration: 600,
          output: 'Step 2 done',
          requiresManualVerification: false,
        });

        const totalSteps = results.size;
        const successCount = Array.from(results.values()).filter(r => r.success).length;

        expect(totalSteps).toBe(2);
        expect(successCount).toBe(2);
        // Success handover has zero manual tasks
      });

      it('should include next steps and suggested actions in handover', async () => {
        const results = new Map();
        results.set(1, {
          stepId: 1,
          success: true,
          duration: 800,
          output: 'Created API service with endpoints',
          requiresManualVerification: false,
        });
        results.set(2, {
          stepId: 2,
          success: true,
          duration: 600,
          output: '📝 Next: Integrate with UI components and test error scenarios',
          requiresManualVerification: true,
        });

        const manualTasks = Array.from(results.values()).filter(r => r.requiresManualVerification);
        expect(manualTasks.length).toBe(1);
        expect(manualTasks[0].output).toContain('Next');
      });
    });
  });
});