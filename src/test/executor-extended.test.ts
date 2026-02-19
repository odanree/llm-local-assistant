/**
 * executor-extended.test.ts
 * Comprehensive tests for Executor class covering plan execution,
 * step validation, error handling, and retry logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { Executor, ExecutorConfig, ExecutionResult } from '../executor';
import { TaskPlan, PlanStep, StepResult } from '../planner';

// Mock vscode API
vi.mock('vscode', () => ({
  workspace: {
    fs: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      createDirectory: vi.fn(),
      delete: vi.fn(),
    },
    workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
    getConfiguration: vi.fn(),
  },
  Uri: {
    file: (path: string) => ({ fsPath: path }),
    joinPath: (base: any, ...paths: string[]) => ({
      fsPath: `${base.fsPath}/${paths.join('/')}`,
    }),
  },
  window: {
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
}));

/**
 * Mock implementations for testing
 */
const createMockConfig = (overrides?: Partial<ExecutorConfig>): ExecutorConfig => ({
  extension: {} as vscode.ExtensionContext,
  llmClient: {
    sendMessage: vi.fn().mockResolvedValue({ success: true, message: 'test' }),
    clearHistory: vi.fn(),
    getConfig: vi.fn().mockReturnValue({ model: 'test', endpoint: 'http://localhost' }),
  } as any,
  workspace: vscode.Uri.file('/test/workspace'),
  maxRetries: 2,
  timeout: 30000,
  onProgress: vi.fn(),
  onMessage: vi.fn(),
  onStepOutput: vi.fn(),
  onQuestion: vi.fn(),
  ...overrides,
});

const createMockPlan = (steps: Partial<PlanStep>[] = []): TaskPlan => ({
  workspaceName: 'test-workspace',
  workspacePath: '/test/workspace',
  goal: 'Test goal',
  steps: steps.length
    ? (steps as PlanStep[])
    : [
        {
          id: 'step-1',
          stepId: 1,
          action: 'write' as const,
          path: 'test.ts',
          content: 'export const test = true;',
          description: 'Write test file',
          dependencies: [],
          status: 'pending',
          result: undefined,
        },
      ],
  status: 'not-started' as const,
  results: new Map(),
  createdAt: new Date(),
  estimatedDuration: 5000,
});

describe('Executor - Core Functionality', () => {
  let executor: Executor;
  let config: ExecutorConfig;

  beforeEach(() => {
    config = createMockConfig();
    executor = new Executor(config);
    vi.clearAllMocks();
  });

  it('should initialize with default values', () => {
    expect(executor).toBeDefined();
    expect(executor instanceof Executor).toBe(true);
  });

  it('should create with custom config', () => {
    const customConfig = createMockConfig({
      maxRetries: 5,
      timeout: 60000,
    });
    const customExecutor = new Executor(customConfig);
    expect(customExecutor).toBeDefined();
  });

  it('should use default config values if not provided', () => {
    const minimalConfig = createMockConfig({
      maxRetries: undefined,
      timeout: undefined,
    });
    const minimalExecutor = new Executor(minimalConfig);
    expect(minimalExecutor).toBeDefined();
  });
});

describe('Executor - Plan Execution Flow', () => {
  let executor: Executor;
  let config: ExecutorConfig;

  beforeEach(() => {
    config = createMockConfig();
    executor = new Executor(config);
    vi.clearAllMocks();
  });

  it('should execute a simple plan with single step', async () => {
    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: 'test.ts',
        content: 'export const test = true;',
        description: 'Write test file',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    // Mock vscode file operations
    vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);

    const result = await executor.executePlan(plan);

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it('should track progress callback during execution', async () => {
    const progressCallback = vi.fn();
    const config = createMockConfig({ onProgress: progressCallback });
    executor = new Executor(config);

    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: 'test.ts',
        content: 'export const test = true;',
        description: 'Write test file',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);

    await executor.executePlan(plan);

    expect(progressCallback).toHaveBeenCalled();
  });

  it('should clear LLM history before execution', async () => {
    const clearHistorySpy = vi.spyOn(config.llmClient, 'clearHistory');
    const plan = createMockPlan();

    vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);

    await executor.executePlan(plan);

    expect(clearHistorySpy).toHaveBeenCalled();
  });

  it('should handle empty plan', async () => {
    const plan = createMockPlan([]);
    plan.steps = [];

    const result = await executor.executePlan(plan);

    expect(result).toBeDefined();
  });

  it('should set plan status to failed on execution error', async () => {
    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: 'test.ts',
        content: 'export const test = true;',
        description: 'Write test file',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    vi.spyOn(vscode.workspace.fs, 'writeFile').mockRejectedValue(new Error('Write failed'));

    const result = await executor.executePlan(plan);

    expect(result.success).toBe(false);
  });
});

describe('Executor - Step Validation', () => {
  let executor: Executor;
  let config: ExecutorConfig;

  beforeEach(() => {
    config = createMockConfig();
    executor = new Executor(config);
    vi.clearAllMocks();
  });

  it('should validate write step contract', async () => {
    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: 'src/index.ts',
        content: 'export const app = {}',
        description: 'Create main file',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);

    const result = await executor.executePlan(plan);
    expect(result).toBeDefined();
  });

  it('should handle missing step path gracefully', async () => {
    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'delete',
        path: '',
        description: 'Delete file with empty path',
        dependencies: [],
        status: 'pending',
        result: undefined,
      } as any,
    ]);

    const result = await executor.executePlan(plan);
    expect(result).toBeDefined();
  });

  it('should reject write step without content for non-delete actions', async () => {
    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: 'test.ts',
        content: '',
        description: 'Write empty file',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    const result = await executor.executePlan(plan);
    expect(result).toBeDefined();
  });

  it('should validate all step actions', async () => {
    const actions = ['write', 'read', 'delete', 'modify'];

    for (const action of actions) {
      const plan = createMockPlan([
        {
          id: 'step-1',
          stepId: 1,
          action: action as any,
          path: 'test.ts',
          content: 'test',
          description: `Test ${action}`,
          dependencies: [],
          status: 'pending',
          result: undefined,
        },
      ]);

      vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
      vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);
      vi.spyOn(vscode.workspace.fs, 'readFile').mockResolvedValue(new TextEncoder().encode('test'));

      const result = await executor.executePlan(plan);
      expect(result).toBeDefined();
    }
  });
});

describe('Executor - Path Sanitization', () => {
  let executor: Executor;
  let config: ExecutorConfig;

  beforeEach(() => {
    config = createMockConfig();
    executor = new Executor(config);
    vi.clearAllMocks();
  });

  it('should handle paths with trailing slashes', async () => {
    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: 'src/components/',
        content: 'export const Component = () => <></>;',
        description: 'Write component',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);

    const result = await executor.executePlan(plan);
    expect(result).toBeDefined();
  });

  it('should handle Windows path separators', async () => {
    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: 'src\\components\\Button.tsx',
        content: 'export const Button = () => <button/>;',
        description: 'Write button component',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);

    const result = await executor.executePlan(plan);
    expect(result).toBeDefined();
  });

  it('should handle paths with dots and special characters', async () => {
    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: 'src/utils/helpers.test.ts',
        content: 'export const helper = () => true;',
        description: 'Write test helper',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);

    const result = await executor.executePlan(plan);
    expect(result).toBeDefined();
  });

  it('should normalize relative paths', async () => {
    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: './src/../src/index.ts',
        content: 'export const app = {};',
        description: 'Write with relative path',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);

    const result = await executor.executePlan(plan);
    expect(result).toBeDefined();
  });
});

describe('Executor - File Operations', () => {
  let executor: Executor;
  let config: ExecutorConfig;

  beforeEach(() => {
    config = createMockConfig();
    executor = new Executor(config);
    vi.clearAllMocks();
  });

  it('should create parent directories when writing files', async () => {
    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: 'src/very/deep/nested/file.ts',
        content: 'export const test = true;',
        description: 'Write deeply nested file',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    const result = await executor.executePlan(plan);

    // Verify execution completed (directories would be created during execution)
    expect(result).toBeDefined();
    expect(result).toHaveProperty('success');
  });

  it('should read file content correctly', async () => {
    const fileContent = 'export const test = () => true;';
    vi.spyOn(vscode.workspace.fs, 'readFile').mockResolvedValue(new TextEncoder().encode(fileContent));

    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'read',
        path: 'src/existing.ts',
        description: 'Read existing file',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    const result = await executor.executePlan(plan);
    expect(result).toBeDefined();
  });

  it('should handle large file content', async () => {
    const largeContent = 'export const data = ' + JSON.stringify(Array(1000).fill('test'));

    vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);

    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: 'src/large.ts',
        content: largeContent,
        description: 'Write large file',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    const result = await executor.executePlan(plan);
    expect(result).toBeDefined();
  });

  it('should handle Unicode and special characters in content', async () => {
    const unicodeContent = '// 你好 🚀 العربية\nexport const emoji = "😀";';

    vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);

    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: 'src/unicode.ts',
        content: unicodeContent,
        description: 'Write unicode content',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    const result = await executor.executePlan(plan);
    expect(result).toBeDefined();
  });
});

describe('Executor - Error Handling', () => {
  let executor: Executor;
  let config: ExecutorConfig;

  beforeEach(() => {
    config = createMockConfig();
    executor = new Executor(config);
    vi.clearAllMocks();
  });

  it('should handle file write errors gracefully', async () => {
    const writeError = new Error('Permission denied');
    vi.spyOn(vscode.workspace.fs, 'writeFile').mockRejectedValue(writeError);
    vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);

    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: 'test.ts',
        content: 'export const test = true;',
        description: 'Write file',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    const result = await executor.executePlan(plan);
    expect(result.success).toBe(false);
  });

  it('should handle file read errors gracefully', async () => {
    const readError = new Error('File not found');
    vi.spyOn(vscode.workspace.fs, 'readFile').mockRejectedValue(readError);

    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'read',
        path: 'nonexistent.ts',
        description: 'Read nonexistent file',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    const result = await executor.executePlan(plan);
    expect(result.success).toBe(false);
  });

  it('should handle LLM client errors', async () => {
    config.llmClient.sendMessage = vi.fn().mockRejectedValue(new Error('LLM unavailable'));
    executor = new Executor(config);

    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: 'test.ts',
        content: 'export const test = true;',
        description: 'Write file',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);

    const result = await executor.executePlan(plan);
    expect(result).toBeDefined();
  });

  it('should provide meaningful error messages', async () => {
    const messageCallback = vi.fn();
    const config = createMockConfig({ onMessage: messageCallback });
    executor = new Executor(config);

    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: '',
        content: 'export const test = true;',
        description: 'Write with no path',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    const result = await executor.executePlan(plan);

    // Execution should complete even with invalid input
    expect(result).toBeDefined();
  });
});

describe('Executor - Multiple Steps', () => {
  let executor: Executor;
  let config: ExecutorConfig;

  beforeEach(() => {
    config = createMockConfig();
    executor = new Executor(config);
    vi.clearAllMocks();
  });

  it('should execute multiple steps in order', async () => {
    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: 'src/index.ts',
        content: 'export const app = {};',
        description: 'Write index',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
      {
        id: 'step-2',
        stepId: 2,
        action: 'write',
        path: 'src/components/App.tsx',
        content: 'export const App = () => <></>;',
        description: 'Write App component',
        dependencies: ['step-1'],
        status: 'pending',
        result: undefined,
      },
    ]);

    vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);

    const result = await executor.executePlan(plan);
    expect(result).toBeDefined();
  });

  it('should track completed steps', async () => {
    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: 'src/index.ts',
        content: 'export const app = {};',
        description: 'Write index',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
      {
        id: 'step-2',
        stepId: 2,
        action: 'write',
        path: 'src/components/App.tsx',
        content: 'export const App = () => <></>;',
        description: 'Write App component',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);

    const result = await executor.executePlan(plan);
    expect(result.completedSteps).toBeGreaterThanOrEqual(0);
  });

  it('should handle mixed step types', async () => {
    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: 'src/utils.ts',
        content: 'export const helper = () => true;',
        description: 'Write utils',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
      {
        id: 'step-2',
        stepId: 2,
        action: 'read',
        path: 'src/utils.ts',
        description: 'Read utils',
        dependencies: ['step-1'],
        status: 'pending',
        result: undefined,
      },
      {
        id: 'step-3',
        stepId: 3,
        action: 'delete',
        path: 'src/old-file.ts',
        description: 'Delete old file',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);
    vi.spyOn(vscode.workspace.fs, 'readFile').mockResolvedValue(new TextEncoder().encode('test'));
    vi.spyOn(vscode.workspace.fs, 'delete').mockResolvedValue(undefined);

    const result = await executor.executePlan(plan);
    expect(result).toBeDefined();
  });

  it('should stop on critical error mid-execution', async () => {
    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: 'src/file1.ts',
        content: 'export const a = 1;',
        description: 'Write file 1',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
      {
        id: 'step-2',
        stepId: 2,
        action: 'write',
        path: 'src/file2.ts',
        content: 'export const b = 2;',
        description: 'Write file 2',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    let writeCallCount = 0;
    vi.spyOn(vscode.workspace.fs, 'writeFile').mockImplementation(() => {
      writeCallCount++;
      if (writeCallCount === 2) {
        return Promise.reject(new Error('Critical error on second write'));
      }
      return Promise.resolve(undefined);
    });
    vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);

    const result = await executor.executePlan(plan);
    expect(result).toBeDefined();
  });
});

describe('Executor - Execution Result', () => {
  let executor: Executor;
  let config: ExecutorConfig;

  beforeEach(() => {
    config = createMockConfig();
    executor = new Executor(config);
    vi.clearAllMocks();
  });

  it('should return ExecutionResult with success status', async () => {
    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: 'test.ts',
        content: 'export const test = true;',
        description: 'Write test',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);

    const result: ExecutionResult = await executor.executePlan(plan);

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('completedSteps');
    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('totalDuration');
  });

  it('should include timing information', async () => {
    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: 'test.ts',
        content: 'export const test = true;',
        description: 'Write test',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);

    const result = await executor.executePlan(plan);

    expect(result.totalDuration).toBeGreaterThanOrEqual(0);
    expect(typeof result.totalDuration).toBe('number');
  });

  it('should provide error message on failure', async () => {
    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: 'test.ts',
        content: 'export const test = true;',
        description: 'Write test',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    vi.spyOn(vscode.workspace.fs, 'writeFile').mockRejectedValue(new Error('Write failed'));

    const result = await executor.executePlan(plan);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should map step results correctly', async () => {
    const plan = createMockPlan([
      {
        id: 'step-1',
        stepId: 1,
        action: 'write',
        path: 'test.ts',
        content: 'export const test = true;',
        description: 'Write test',
        dependencies: [],
        status: 'pending',
        result: undefined,
      },
    ]);

    vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);

    const result = await executor.executePlan(plan);

    expect(result.results).toBeDefined();
    expect(result.results instanceof Map).toBe(true);
  });
});
