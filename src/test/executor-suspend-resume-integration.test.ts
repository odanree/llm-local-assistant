/**
 * v2.13.0 Phase 4: Executor Suspend/Resume Integration Tests
 *
 * Tests the core suspend/resume functionality:
 * 1. Detecting previously suspended plans
 * 2. Saving and recovering execution state
 * 3. Resuming execution with user input
 * 4. Detecting file modifications during suspension
 * 5. Canceling suspended executions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Executor } from '../executor';
import { TaskPlan } from '../planner';
import { PlanState } from '../types/PlanState';
import { FileSystemProvider } from '../providers/FileSystemProvider';
import { CommandRunnerProvider } from '../providers/CommandRunnerProvider';
import CodebaseIndex from '../codebaseIndex';
import * as vscode from 'vscode';

describe('v2.13.0 Phase 4: Executor Suspend/Resume Integration', () => {
  let executor: Executor;
  let mockWorkspace: vscode.Uri;
  let codebaseIndex: CodebaseIndex;
  let mockLLMClient: any;
  let messageLog: Array<{ message: string; type: string }>;

  beforeEach(() => {
    mockWorkspace = vscode.Uri.file('/test/project');
    messageLog = [];

    mockLLMClient = {
      clearHistory: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue('test response'),
    };

    codebaseIndex = new CodebaseIndex(mockWorkspace.fsPath);

    executor = new Executor({
      extension: {
        globalState: { get: vi.fn(), update: vi.fn() },
        workspaceState: { get: vi.fn(), update: vi.fn() },
      } as any,
      llmClient: mockLLMClient,
      workspace: mockWorkspace,
      codebaseIndex,
      onMessage: (msg, type) => {
        messageLog.push({ message: msg, type });
      },
      onProgress: vi.fn(),
      onStepOutput: vi.fn(),
      fs: new FileSystemProvider(),
      commandRunner: new CommandRunnerProvider(),
    });
  });

  describe('Suspend/Resume State Persistence', () => {
    it('should save suspended execution state to codebaseIndex', async () => {
      const plan: TaskPlan = {
        id: 'test-plan-1',
        taskId: 'task-1',
        taskDescription: 'Test state persistence',
        status: PlanState.IDLE,
        steps: [
          {
            stepId: 1,
            action: 'read',
            description: 'Read file',
            path: '/test/project/src/index.ts',
            expectedOutcome: 'Success',
          } as any,
        ],
        results: new Map(),
        workspaceName: 'Test Project',
        workspacePath: '/test/project',
      };

      // Simulate setting suspended state
      const suspendedState = {
        planId: plan.id,
        stepIndex: 0,
        remainingSteps: plan.steps,
        fileSnapshots: { '/test/project/src/index.ts': 'hash123' },
      };
      codebaseIndex.setSuspendedState(plan.id, suspendedState);

      // Verify state was saved
      const retrieved = codebaseIndex.getSuspendedState(plan.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.stepIndex).toBe(0);
      expect(retrieved?.planId).toBe(plan.id);
    });

    it('should clear suspended state when resumed', async () => {
      const plan: TaskPlan = {
        id: 'test-plan-2',
        taskId: 'task-2',
        taskDescription: 'Test state cleanup',
        status: PlanState.SUSPENDED_FOR_PERMISSION,
        steps: [],
        results: new Map(),
        workspaceName: 'Test Project',
        workspacePath: '/test/project',
      };

      // Setup suspended state
      codebaseIndex.setSuspendedState(plan.id, {
        planId: plan.id,
        stepIndex: 0,
        remainingSteps: [],
        fileSnapshots: {},
      });

      // Clear it (simulating successful resume)
      codebaseIndex.setSuspendedState(plan.id, null);

      // Verify it's cleared
      const retrieved = codebaseIndex.getSuspendedState(plan.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Resume Integration', () => {
    it('should successfully send input on resume', async () => {
      const plan: TaskPlan = {
        id: 'test-plan-3',
        taskId: 'task-3',
        taskDescription: 'Test resume',
        status: PlanState.SUSPENDED_FOR_PERMISSION,
        steps: [],
        results: new Map(),
        workspaceName: 'Test Project',
        workspacePath: '/test/project',
      };

      // Setup suspended state
      const suspendedState = {
        planId: plan.id,
        stepIndex: 0,
        remainingSteps: [],
        fileSnapshots: {},
      };
      codebaseIndex.setSuspendedState(plan.id, suspendedState);

      // Mock lastHandle
      const mockHandle = {
        sendInput: vi.fn(),
        kill: vi.fn(),
      };
      (executor['commandRunner'] as any).lastHandle = mockHandle;

      const result = await executor.resume(plan.id, {
        userInput: 'y',
      });

      expect(result.success).toBe(true);
      expect(mockHandle.sendInput).toHaveBeenCalledWith('y\n');
    });

    it('should return error for non-existent plan', async () => {
      const result = await executor.resume('non-existent', {
        userInput: 'y',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No suspended plan found');
    });
  });

  describe('Cancel Suspended Execution', () => {
    it('should kill process and clear state on cancel', async () => {
      const plan: TaskPlan = {
        id: 'test-plan-4',
        taskId: 'task-4',
        taskDescription: 'Test cancel',
        status: PlanState.SUSPENDED_FOR_PERMISSION,
        steps: [],
        results: new Map(),
        workspaceName: 'Test Project',
        workspacePath: '/test/project',
      };

      // Setup suspended state
      codebaseIndex.setSuspendedState(plan.id, {
        planId: plan.id,
        stepIndex: 0,
        remainingSteps: [],
        fileSnapshots: {},
      });

      // Mock lastHandle
      const mockHandle = {
        sendInput: vi.fn(),
        kill: vi.fn(),
      };
      (executor['commandRunner'] as any).lastHandle = mockHandle;

      const result = await executor.cancel(plan.id);

      expect(result.cancelled).toBe(true);
      expect(mockHandle.kill).toHaveBeenCalled();

      // State should be cleared
      const clearedState = codebaseIndex.getSuspendedState(plan.id);
      expect(clearedState).toBeNull();
    });

    it('should return error for non-existent plan', async () => {
      const result = await executor.cancel('non-existent');

      expect(result.cancelled).toBe(false);
      expect(result.error).toContain('No suspended plan found');
    });
  });

  describe('PlanState Enum Usage', () => {
    it('should use PlanState.SUSPENDED_FOR_PERMISSION correctly', () => {
      expect(PlanState.SUSPENDED_FOR_PERMISSION).toBe('suspended_for_permission');
    });

    it('should use PlanState.EXECUTING correctly', () => {
      expect(PlanState.EXECUTING).toBe('executing');
    });

    it('should use PlanState.COMPLETED correctly', () => {
      expect(PlanState.COMPLETED).toBe('completed');
    });

    it('should use PlanState.FAILED correctly', () => {
      expect(PlanState.FAILED).toBe('failed');
    });
  });

  describe('File Modification Detection', () => {
    it('should detect when a file is modified during suspension', async () => {
      const plan: TaskPlan = {
        id: 'test-plan-5',
        taskId: 'task-5',
        taskDescription: 'Test file detection',
        status: PlanState.SUSPENDED_FOR_PERMISSION,
        steps: [],
        results: new Map(),
        workspaceName: 'Test Project',
        workspacePath: '/test/project',
      };

      const suspendedState = {
        planId: plan.id,
        stepIndex: 0,
        remainingSteps: [],
        fileSnapshots: {
          '/test/project/src/index.ts': '1234567890', // Original hash
        },
      };

      codebaseIndex.setSuspendedState(plan.id, suspendedState);

      // Mock fileSystem to return modified content
      const mockFS = executor['config'].fs as any;
      mockFS.readFile = vi.fn().mockResolvedValue('different content');

      try {
        await executor.executePlan(plan);
      } catch (err) {
        // Expected
      }

      // Should have logged file modification detection
      const modMsg = messageLog.find(m => m.message.includes('file modification'));
      expect(modMsg).toBeDefined();
    });
  });
});
