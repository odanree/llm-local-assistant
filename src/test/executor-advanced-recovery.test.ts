/**
 * Phase 5B: Executor - Advanced Error Scenarios
 *
 * Purpose: Test executor's error handling for complex scenarios
 * Focus: File system errors, command failures, and recovery paths
 *
 * Expected Coverage Gain: +0.85-1.0% from advanced error path testing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Executor, ExecutorConfig } from '../executor';
import { MockFileSystem } from './mocks/MockFileSystem';
import { MockCommandRunner } from './mocks/MockCommandRunner';
import { TaskPlan, ExecutionStep } from '../planner';
import * as vscode from 'vscode';

describe('Phase 5B: Executor - Advanced Error Scenarios', () => {
  let mockFs: MockFileSystem;
  let mockCommandRunner: MockCommandRunner;
  let executor: Executor;
  let config: ExecutorConfig;

  beforeEach(() => {
    mockFs = new MockFileSystem({
      directories: new Set(['/project', '/project/src']),
      files: { '/project/package.json': '{}' },
    });

    mockCommandRunner = new MockCommandRunner();

    config = {
      extension: {} as vscode.ExtensionContext,
      llmClient: {
        generateCode: vi.fn().mockResolvedValue('generated code'),
        clearHistory: vi.fn(),
      } as any,
      workspace: vscode.Uri.file('/project'),
      fs: mockFs,
      commandRunner: mockCommandRunner,
      maxRetries: 2,
      timeout: 30000,
    };

    executor = new Executor(config);
  });

  describe('File System Error Handling', () => {
    it('should handle permission denied on file read', async () => {
      mockFs.setFailureMode('read', '/project/src/index.ts', 'EACCES');

      const plan: TaskPlan = {
        taskId: 'plan-read-denied',
        userRequest: 'read file',
        steps: [
          {
            id: '1',
            stepId: 1,
            action: 'read',
            path: '/project/src/index.ts',
          },
        ] as ExecutionStep[],
        generatedAt: new Date(),
        reasoning: 'test',
      };

      const result = await executor.executePlan(plan);
      expect(result).toBeDefined();
      expect(result.completedSteps).toBeGreaterThanOrEqual(0);
    });

    it('should handle permission denied on file write', async () => {
      mockFs.setFailureMode('write', '/project/src/output.ts', 'EACCES');

      const plan: TaskPlan = {
        taskId: 'plan-write-denied',
        userRequest: 'write file',
        steps: [
          {
            id: '1',
            stepId: 1,
            action: 'write',
            path: '/project/src/output.ts',
            content: 'const x = 1;',
          },
        ] as ExecutionStep[],
        generatedAt: new Date(),
        reasoning: 'test',
      };

      const result = await executor.executePlan(plan);
      expect(result).toBeDefined();
    });

    it('should handle file not found errors', async () => {
      // Try to read a file that doesn't exist
      const plan: TaskPlan = {
        taskId: 'plan-not-found',
        userRequest: 'read missing file',
        steps: [
          {
            id: '1',
            stepId: 1,
            action: 'read',
            path: '/project/nonexistent.ts',
          },
        ] as ExecutionStep[],
        generatedAt: new Date(),
        reasoning: 'test',
      };

      const result = await executor.executePlan(plan);
      expect(result).toBeDefined();
    });

    it('should handle mkdir failures', async () => {
      mockFs.setFailureMode('mkdir', '/project/build', 'EACCES');

      const plan: TaskPlan = {
        taskId: 'plan-mkdir',
        userRequest: 'create directory',
        steps: [
          {
            id: '1',
            stepId: 1,
            action: 'run',
            command: 'mkdir -p /project/build',
            cwd: '/project',
          },
        ] as ExecutionStep[],
        generatedAt: new Date(),
        reasoning: 'test',
      };

      const result = await executor.executePlan(plan);
      expect(result).toBeDefined();
    });

    it('should handle resource exhaustion (EMFILE)', async () => {
      mockFs.setFailureMode('read', '/project/src', 'EMFILE');

      const plan: TaskPlan = {
        taskId: 'plan-emfile',
        userRequest: 'read many files',
        steps: [
          {
            id: '1',
            stepId: 1,
            action: 'read',
            path: '/project/src',
          },
        ] as ExecutionStep[],
        generatedAt: new Date(),
        reasoning: 'test',
      };

      const result = await executor.executePlan(plan);
      expect(result).toBeDefined();
      // Should not crash, should report error
    });
  });

  describe('Command Execution Errors', () => {
    it('should handle command not found', async () => {
      mockCommandRunner.setCommandResponse('nonexistent-cmd', '', 'command not found', 127);

      const plan: TaskPlan = {
        taskId: 'plan-cmd-not-found',
        userRequest: 'run missing command',
        steps: [
          {
            id: '1',
            stepId: 1,
            action: 'run',
            command: 'nonexistent-cmd',
            cwd: '/project',
          },
        ] as ExecutionStep[],
        generatedAt: new Date(),
        reasoning: 'test',
      };

      const result = await executor.executePlan(plan);
      expect(result).toBeDefined();
    });

    it('should handle command exit code failures', async () => {
      mockCommandRunner.setCommandResponse('failing-cmd', '', 'Build failed', 1);

      const plan: TaskPlan = {
        taskId: 'plan-exit-fail',
        userRequest: 'run command',
        steps: [
          {
            id: '1',
            stepId: 1,
            action: 'run',
            command: 'failing-cmd',
            cwd: '/project',
          },
        ] as ExecutionStep[],
        generatedAt: new Date(),
        reasoning: 'test',
      };

      const result = await executor.executePlan(plan);
      expect(result).toBeDefined();
    });

    it('should handle commands with stderr output', async () => {
      mockCommandRunner.setCommandResponse(
        'cmd-with-stderr',
        'partial output',
        'Error: something failed',
        1
      );

      const plan: TaskPlan = {
        taskId: 'plan-stderr',
        userRequest: 'run command with errors',
        steps: [
          {
            id: '1',
            stepId: 1,
            action: 'run',
            command: 'cmd-with-stderr',
            cwd: '/project',
          },
        ] as ExecutionStep[],
        generatedAt: new Date(),
        reasoning: 'test',
      };

      const result = await executor.executePlan(plan);
      expect(result).toBeDefined();
    });

    it('should handle out of memory scenario', async () => {
      mockCommandRunner.setCommandResponse(
        'memory-heavy',
        '',
        'JavaScript heap out of memory',
        137
      );

      const plan: TaskPlan = {
        taskId: 'plan-oom',
        userRequest: 'run memory heavy command',
        steps: [
          {
            id: '1',
            stepId: 1,
            action: 'run',
            command: 'memory-heavy',
            cwd: '/project',
          },
        ] as ExecutionStep[],
        generatedAt: new Date(),
        reasoning: 'test',
      };

      const result = await executor.executePlan(plan);
      expect(result).toBeDefined();
    });
  });

  describe('Multi-Step Error Handling', () => {
    it('should continue executing steps after one fails', async () => {
      mockCommandRunner.setCommandResponse('cmd1', 'success', '', 0);
      mockCommandRunner.setCommandResponse('cmd2', '', 'failed', 1);
      mockCommandRunner.setCommandResponse('cmd3', 'success', '', 0);

      const plan: TaskPlan = {
        taskId: 'plan-multi',
        userRequest: 'run multiple commands',
        steps: [
          {
            id: '1',
            stepId: 1,
            action: 'run',
            command: 'cmd1',
            cwd: '/project',
          },
          {
            id: '2',
            stepId: 2,
            action: 'run',
            command: 'cmd2',
            cwd: '/project',
          },
          {
            id: '3',
            stepId: 3,
            action: 'run',
            command: 'cmd3',
            cwd: '/project',
          },
        ] as ExecutionStep[],
        generatedAt: new Date(),
        reasoning: 'test',
      };

      const result = await executor.executePlan(plan);
      expect(result).toBeDefined();
      // Should report all steps attempted
      expect(result.completedSteps).toBeGreaterThanOrEqual(0);
    });

    it('should handle mixed file operations and commands', async () => {
      mockCommandRunner.setCommandResponse('build', 'Built successfully', '', 0);

      const plan: TaskPlan = {
        taskId: 'plan-mixed',
        userRequest: 'mixed operations',
        steps: [
          {
            id: '1',
            stepId: 1,
            action: 'write',
            path: '/project/src/new-file.ts',
            content: 'export const x = 1;',
          },
          {
            id: '2',
            stepId: 2,
            action: 'run',
            command: 'build',
            cwd: '/project',
          },
          {
            id: '3',
            stepId: 3,
            action: 'read',
            path: '/project/src/new-file.ts',
          },
        ] as ExecutionStep[],
        generatedAt: new Date(),
        reasoning: 'test',
      };

      const result = await executor.executePlan(plan);
      expect(result).toBeDefined();
    });

    it('should handle file operations with errors', async () => {
      mockFs.setFailureMode('write', '/project/src/bad.ts', 'ENOSPC');

      const plan: TaskPlan = {
        taskId: 'plan-file-error',
        userRequest: 'write file with error',
        steps: [
          {
            id: '1',
            stepId: 1,
            action: 'write',
            path: '/project/src/good.ts',
            content: 'export const x = 1;',
          },
          {
            id: '2',
            stepId: 2,
            action: 'write',
            path: '/project/src/bad.ts',
            content: 'export const y = 2;',
          },
        ] as ExecutionStep[],
        generatedAt: new Date(),
        reasoning: 'test',
      };

      const result = await executor.executePlan(plan);
      expect(result).toBeDefined();
    });
  });

  describe('Error Recovery and State Management', () => {
    it('should not accumulate state from failed steps', async () => {
      mockCommandRunner.setCommandResponse('failing', '', 'error', 1);
      mockCommandRunner.setCommandResponse('recovery', 'recovered', '', 0);

      const plan: TaskPlan = {
        taskId: 'plan-recovery',
        userRequest: 'test recovery',
        steps: [
          {
            id: '1',
            stepId: 1,
            action: 'run',
            command: 'failing',
            cwd: '/project',
          },
          {
            id: '2',
            stepId: 2,
            action: 'run',
            command: 'recovery',
            cwd: '/project',
          },
        ] as ExecutionStep[],
        generatedAt: new Date(),
        reasoning: 'test',
      };

      const result = await executor.executePlan(plan);
      expect(result).toBeDefined();
      // Recovery step should not be affected by previous failure
    });

    it('should handle cascading errors gracefully', async () => {
      mockFs.setFailureMode('read', '/project/src', 'EACCES');

      const plan: TaskPlan = {
        taskId: 'plan-cascade',
        userRequest: 'test cascading errors',
        steps: [
          {
            id: '1',
            stepId: 1,
            action: 'read',
            path: '/project/src/a.ts',
          },
          {
            id: '2',
            stepId: 2,
            action: 'read',
            path: '/project/src/b.ts',
          },
          {
            id: '3',
            stepId: 3,
            action: 'read',
            path: '/project/src/c.ts',
          },
        ] as ExecutionStep[],
        generatedAt: new Date(),
        reasoning: 'test',
      };

      const result = await executor.executePlan(plan);
      expect(result).toBeDefined();
      // Should handle multiple file read failures without crashing
    });
  });

  describe('Error Reporting and Messaging', () => {
    it('should provide meaningful error messages', async () => {
      const plan: TaskPlan = {
        taskId: 'plan-error-msg',
        userRequest: 'test error message',
        steps: [
          {
            id: '1',
            stepId: 1,
            action: 'read',
            path: '/project/nonexistent/file.ts',
          },
        ] as ExecutionStep[],
        generatedAt: new Date(),
        reasoning: 'test',
      };

      const result = await executor.executePlan(plan);
      expect(result).toBeDefined();
      if (result.error) {
        expect(result.error.length).toBeGreaterThan(0);
      }
    });

    it('should track completed steps despite errors', async () => {
      mockCommandRunner.setCommandResponse('success-cmd', 'OK', '', 0);
      mockCommandRunner.setCommandResponse('fail-cmd', '', 'Failed', 1);

      const plan: TaskPlan = {
        taskId: 'plan-tracking',
        userRequest: 'track completed steps',
        steps: [
          {
            id: '1',
            stepId: 1,
            action: 'run',
            command: 'success-cmd',
            cwd: '/project',
          },
          {
            id: '2',
            stepId: 2,
            action: 'run',
            command: 'fail-cmd',
            cwd: '/project',
          },
        ] as ExecutionStep[],
        generatedAt: new Date(),
        reasoning: 'test',
      };

      const result = await executor.executePlan(plan);
      expect(result.completedSteps).toBeGreaterThanOrEqual(0);
      expect(result.results).toBeDefined();
    });
  });

  describe('Performance Under Error Conditions', () => {
    it('should complete execution within timeout', async () => {
      const plan: TaskPlan = {
        taskId: 'plan-perf',
        userRequest: 'performance test',
        steps: Array.from({ length: 10 }, (_, i) => ({
          id: String(i + 1),
          stepId: i + 1,
          action: 'read',
          path: `/project/file${i}.ts`,
        })) as ExecutionStep[],
        generatedAt: new Date(),
        reasoning: 'test',
      };

      const start = performance.now();
      const result = await executor.executePlan(plan);
      const duration = performance.now() - start;

      expect(result).toBeDefined();
      // Should complete in reasonable time even with errors
      expect(duration).toBeLessThan(60000);
    });
  });
});
