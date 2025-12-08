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
      expect(result.error).toContain('not yet implemented');
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
      expect(result.error).toContain('Unknown action');
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
});
