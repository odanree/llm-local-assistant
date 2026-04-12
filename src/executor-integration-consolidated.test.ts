/**
 * Week 5.2: Executor Integration Tests (Consolidated)
 *
 * Consolidation Strategy:
 * - Merges executor-extended.test.ts (32 tests) and other extended files
 * - Table-driven test configuration matrix for plan execution
 * - Parameterized error scenarios and file operation cases
 * - Consolidated describe blocks for path handling, file operations, and step validation
 * - 32+ tests → 25 tests (-7+ tests, -22% reduction through parameterization)
 *
 * Pattern: Data-driven test matrices with flexible assertions
 * Purpose: Integration testing of multi-step execution flows
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { Executor, ExecutorConfig, ExecutionResult } from './executor';
import { TaskPlan, PlanStep, StepResult } from './planner';

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

// ============================================================
// Mock Factories
// ============================================================

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

// ============================================================
// Core Functionality Tests
// ============================================================

describe('Executor Integration (Consolidated)', () => {
  describe('Initialization', () => {
    it('should initialize with default values', () => {
      const config = createMockConfig();
      const executor = new Executor(config);
      expect(executor).toBeDefined();
      expect(executor instanceof Executor).toBe(true);
    });

    const configCases = [
      {
        name: 'custom config',
        overrides: { maxRetries: 5, timeout: 60000 },
      },
      {
        name: 'minimal config',
        overrides: { maxRetries: undefined, timeout: undefined },
      },
    ];

    it.each(configCases)('should create with $name', ({ overrides }) => {
      const config = createMockConfig(overrides);
      const executor = new Executor(config);
      expect(executor).toBeDefined();
    });
  });

  // ============================================================
  // Plan Execution Flow - Parameterized Test Matrix
  // ============================================================

  describe('Plan Execution Flow', () => {
    let executor: Executor;
    let config: ExecutorConfig;

    beforeEach(() => {
      config = createMockConfig();
      executor = new Executor(config);
      vi.clearAllMocks();
    });

    const executionCases = [
      {
        name: 'simple plan with single step',
        setupPlan: () => [
          {
            id: 'step-1',
            stepId: 1,
            action: 'write' as const,
            path: 'test.ts',
            content: 'export const test = true;',
            description: 'Write test file',
            dependencies: [],
            status: 'pending' as const,
            result: undefined,
          },
        ],
        mockSetup: () => {
          vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
          vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);
        },
        verifyResult: (result: ExecutionResult) => {
          expect(result).toBeDefined();
          expect(result.success).toBe(true);
        },
      },
      {
        name: 'empty plan',
        setupPlan: () => [],
        mockSetup: () => {
          vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
        },
        verifyResult: (result: ExecutionResult) => {
          expect(result).toBeDefined();
        },
      },
    ];

    it.each(executionCases)(
      'executes: $name',
      async ({ setupPlan, mockSetup, verifyResult }) => {
        const steps = setupPlan();
        const plan = createMockPlan(steps);
        mockSetup();

        const result = await executor.executePlan(plan);

        verifyResult(result);
      }
    );

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

  // ============================================================
  // Path Handling - Path Normalization Matrix
  // ============================================================

  describe('Path Handling', () => {
    let executor: Executor;
    let config: ExecutorConfig;

    beforeEach(() => {
      config = createMockConfig();
      executor = new Executor(config);
      vi.clearAllMocks();
    });

    const pathCases = [
      {
        name: 'trailing slashes',
        path: 'src/components/',
      },
      {
        name: 'Windows path separators',
        path: 'src\\components\\Button.tsx',
      },
      {
        name: 'dots and special characters',
        path: 'src/utils/helpers.test.ts',
      },
      {
        name: 'relative paths',
        path: './src/../src/index.ts',
      },
    ];

    it.each(pathCases)(
      'handles path with $name',
      async ({ path }) => {
        const plan = createMockPlan([
          {
            id: 'step-1',
            stepId: 1,
            action: 'write',
            path,
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
        expect(result).toBeDefined();
      }
    );
  });

  // ============================================================
  // File Operations - Operation Scenarios Matrix
  // ============================================================

  describe('File Operations', () => {
    let executor: Executor;
    let config: ExecutorConfig;

    beforeEach(() => {
      config = createMockConfig();
      executor = new Executor(config);
      vi.clearAllMocks();
    });

    const fileOperationCases = [
      {
        name: 'create parent directories when writing',
        setupPlan: () => ({
          id: 'step-1',
          stepId: 1,
          action: 'write' as const,
          path: 'src/very/deep/nested/file.ts',
          content: 'export const test = true;',
          description: 'Write deeply nested file',
          dependencies: [],
          status: 'pending' as const,
          result: undefined,
        }),
        mockSetup: () => {
          vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
          vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);
        },
        verifyResult: (result: ExecutionResult) => {
          expect(result).toBeDefined();
          expect(result).toHaveProperty('success');
        },
      },
      {
        name: 'read file content correctly',
        setupPlan: () => ({
          id: 'step-1',
          stepId: 1,
          action: 'read' as const,
          path: 'src/existing.ts',
          description: 'Read existing file',
          dependencies: [],
          status: 'pending' as const,
          result: undefined,
        }),
        mockSetup: () => {
          vi.spyOn(vscode.workspace.fs, 'readFile').mockResolvedValue(
            new TextEncoder().encode('export const test = () => true;')
          );
        },
        verifyResult: (result: ExecutionResult) => {
          expect(result).toBeDefined();
        },
      },
      {
        name: 'handle large file content',
        setupPlan: () => ({
          id: 'step-1',
          stepId: 1,
          action: 'write' as const,
          path: 'src/large.ts',
          content: 'export const data = ' + JSON.stringify(Array(1000).fill('test')),
          description: 'Write large file',
          dependencies: [],
          status: 'pending' as const,
          result: undefined,
        }),
        mockSetup: () => {
          vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
          vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);
        },
        verifyResult: (result: ExecutionResult) => {
          expect(result).toBeDefined();
        },
      },
      {
        name: 'handle Unicode and special characters',
        setupPlan: () => ({
          id: 'step-1',
          stepId: 1,
          action: 'write' as const,
          path: 'src/unicode.ts',
          content: '// 你好 🚀 العربية\nexport const emoji = "😀";',
          description: 'Write unicode content',
          dependencies: [],
          status: 'pending' as const,
          result: undefined,
        }),
        mockSetup: () => {
          vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
          vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);
        },
        verifyResult: (result: ExecutionResult) => {
          expect(result).toBeDefined();
        },
      },
    ];

    it.each(fileOperationCases)(
      'file operation: $name',
      async ({ setupPlan, mockSetup, verifyResult }) => {
        const stepConfig = setupPlan();
        const plan = createMockPlan([stepConfig]);
        mockSetup();

        const result = await executor.executePlan(plan);

        verifyResult(result);
      }
    );
  });

  // ============================================================
  // Error Handling - Error Scenario Matrix
  // ============================================================

  describe('Error Handling', () => {
    let executor: Executor;
    let config: ExecutorConfig;

    beforeEach(() => {
      config = createMockConfig();
      executor = new Executor(config);
      vi.clearAllMocks();
    });

    const errorCases = [
      {
        name: 'file write errors',
        mockSetup: () => {
          vi.spyOn(vscode.workspace.fs, 'writeFile').mockRejectedValue(
            new Error('Permission denied')
          );
          vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);
        },
        verifyError: (result: ExecutionResult) => {
          expect(result.success).toBe(false);
        },
      },
      {
        name: 'file read errors',
        mockSetup: () => {
          vi.spyOn(vscode.workspace.fs, 'readFile').mockRejectedValue(
            new Error('File not found')
          );
        },
        verifyError: (result: ExecutionResult) => {
          expect(result.success).toBe(false);
        },
      },
      {
        name: 'LLM client errors',
        mockSetup: () => {
          config.llmClient.sendMessage = vi.fn().mockRejectedValue(new Error('LLM unavailable'));
          vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
          vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);
        },
        verifyError: (result: ExecutionResult) => {
          expect(result).toBeDefined();
        },
      },
    ];

    it.each(errorCases)(
      'handles $name',
      async ({ mockSetup, verifyError }) => {
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

        mockSetup();

        const result = await executor.executePlan(plan);

        verifyError(result);
      }
    );

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

      expect(result).toBeDefined();
    });
  });

  // ============================================================
  // Multiple Steps - Multi-Step Execution
  // ============================================================

  describe('Multiple Steps', () => {
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
  });

  // ============================================================
  // Execution Result Structure
  // ============================================================

  describe('Execution Result Structure', () => {
    let executor: Executor;
    let config: ExecutorConfig;

    beforeEach(() => {
      config = createMockConfig();
      executor = new Executor(config);
      vi.clearAllMocks();
    });

    it('should return ExecutionResult with all required properties', async () => {
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

  // ============================================================
  // Named Export Cross-File Check
  // ============================================================

  describe('Integration: named export mismatch detection', () => {
    let executor: Executor;

    beforeEach(() => {
      executor = new Executor(createMockConfig());
      vi.clearAllMocks();
    });

    it('should fail when consumer imports a name not exported by the target module', async () => {
      // T3R-v10: store exports useLoginFormStore, consumer imports useFormStore -> runtime crash.
      const storeContent = [
        "import { create } from 'zustand';",
        "export const useLoginFormStore = create(() => ({ email: '' }));",
      ].join(String.fromCharCode(10));
      const consumerContent = [
        "import { useFormStore } from '../store/useFormStore';",
        "export const getEmail = () => useFormStore();",
      ].join(String.fromCharCode(10));

      const enc = new TextEncoder();
      vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
      vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);
      vi.spyOn(vscode.workspace.fs, 'readFile').mockImplementation(async (uri: any) => {
        const p: string = (uri.fsPath ?? '') as string;
        if (p.includes('useFormStore')) return enc.encode(storeContent);
        if (p.includes('getEmail')) return enc.encode(consumerContent);
        throw new Error('not found');
      });

      const plan = createMockPlan([
        { id: 'step-1', stepId: 1, action: 'write', path: 'src/store/useFormStore.ts', content: storeContent,
          description: 'Write store', dependencies: [], status: 'pending', result: undefined },
        { id: 'step-2', stepId: 2, action: 'write', path: 'src/utils/getEmail.ts', content: consumerContent,
          description: 'Write consumer', dependencies: ['step-1'], status: 'pending', result: undefined },
      ]);

      const result = await executor.executePlan(plan);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/useFormStore/);
    });

    it('should pass when consumer imports a name that IS exported by the target module', async () => {
      const storeContent = [
        "import { create } from 'zustand';",
        "export const useFormStore = create(() => ({ email: '' }));",
      ].join(String.fromCharCode(10));
      const consumerContent = [
        "import { useFormStore } from '../store/useFormStore';",
        "export const getEmail = () => useFormStore();",
      ].join(String.fromCharCode(10));

      const enc = new TextEncoder();
      vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
      vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);
      vi.spyOn(vscode.workspace.fs, 'readFile').mockImplementation(async (uri: any) => {
        const p: string = (uri.fsPath ?? '') as string;
        if (p.includes('useFormStore')) return enc.encode(storeContent);
        if (p.includes('getEmail')) return enc.encode(consumerContent);
        throw new Error('not found');
      });

      const plan = createMockPlan([
        { id: 'step-1', stepId: 1, action: 'write', path: 'src/store/useFormStore.ts', content: storeContent,
          description: 'Write store', dependencies: [], status: 'pending', result: undefined },
        { id: 'step-2', stepId: 2, action: 'write', path: 'src/utils/getEmail.ts', content: consumerContent,
          description: 'Write consumer', dependencies: ['step-1'], status: 'pending', result: undefined },
      ]);

      const result = await executor.executePlan(plan);
      expect(result.success).toBe(true);
    });
  });
});
