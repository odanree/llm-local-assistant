/**
 * Test Factory: State Injection (Global Mock Factory)
 *
 * Phase 1: The Infrastructure - Centralized mock creation with state injection
 *
 * Strategy: Create real instances (not mocked) and inject state directly into
 * private fields. Provides "Happy Path" defaults that can be overridden per test.
 * This prevents "Mock Bloat" where tests become 90% setup and 10% assertions.
 *
 * Key Benefits:
 * 1. State Injection: Only specify what matters; everything else gets sensible defaults
 * 2. Partial Mocks: Real instances + controlled dependencies = true unit testing
 * 3. Reusability: One factory handles 90% of test scenarios
 */

import { vi } from 'vitest';
import { Executor, type ExecutorConfig } from '../../executor';
import { Planner, type PlannerConfig, type ExecutionStep } from '../../planner';
import type { LLMClient, LLMConfig } from '../../llmClient';

// ============================================================
// EXECUTOR MOCK FACTORY
// ============================================================

/**
 * Options for configuring the Executor mock
 */
export interface ExecutorMockOptions {
  /** File system state: { exists: boolean, read: string, write: jest.fn } */
  fileSystem?: Record<string, any>;
  /** LLM response to return (as JSON string) */
  llmResponse?: string;
  /** Current retry count (for retry logic testing) */
  retryCount?: number;
  /** Authorization check result */
  isAuthorized?: boolean;
}

/**
 * Create a mocked Executor with state injection
 *
 * Usage:
 * ```typescript
 * // Default happy path
 * const { instance, mocks } = createMockExecutor();
 *
 * // Injected unhappy path
 * const { instance, mocks } = createMockExecutor({
 *   fileSystem: { exists: false },
 *   llmResponse: JSON.stringify({ error: 'file not found' })
 * });
 * ```
 *
 * @param options State overrides for specific test scenarios
 * @returns { instance: Executor, mocks: { llm, sendMessageSpy, writeSpy, etc } }
 */
export const createMockExecutor = (options: ExecutorMockOptions = {}) => {
  const defaults = {
    fileSystem: {
      exists: true,
      read: 'export const x = 1;',
      write: vi.fn(),
    },
    llmResponse: JSON.stringify({ status: 'success', plan: [] }),
    isAuthorized: true,
    retryCount: 0,
  };

  const config = { ...defaults, ...options };

  // 1. Create mock LLM client spies - CRITICAL: Preserve spies for verification
  const sendMessageSpy = vi.fn().mockResolvedValue(config.llmResponse);
  const sendMessageStreamSpy = vi.fn();
  const isServerHealthySpy = vi.fn().mockResolvedValue(true);
  const clearHistorySpy = vi.fn();

  const mockLLMConfig: LLMConfig = {
    endpoint: 'http://localhost:11434',
    model: 'test-model',
    temperature: 0.1,
    maxTokens: 1024,
    contextWindow: 8192,
    timeout: 30000,
  };

  const mockLLM = {
    sendMessage: sendMessageSpy,
    sendMessageStream: sendMessageStreamSpy,
    isServerHealthy: isServerHealthySpy,
    clearHistory: clearHistorySpy,
    getConfig: vi.fn().mockReturnValue(mockLLMConfig),
  } as unknown as LLMClient;

  // 2. Create executor config with minimal setup
  const executorConfig: ExecutorConfig = {
    extension: {} as any,
    llmClient: mockLLM,
    workspace: { fsPath: '/test/workspace' } as any,
    maxRetries: 3,
    timeout: 30000,
    onProgress: vi.fn(),
    onMessage: vi.fn(),
    onStepOutput: vi.fn(),
  };

  // 3. Instantiate real Executor (not mocked)
  const executor = new Executor(executorConfig);

  // 4. Inject state directly into private fields for white-box testing
  (executor as any).fileSystem = config.fileSystem;
  (executor as any).authProvider = { check: () => config.isAuthorized };
  (executor as any).maxRetries = 3;
  (executor as any).currentRetry = config.retryCount;

  return {
    instance: executor as Executor,
    mocks: {
      llm: mockLLM,
      sendMessageSpy,
      sendMessageStreamSpy,
      isServerHealthySpy,
      clearHistorySpy,
      writeSpy: config.fileSystem.write,
    },
  };
};

// ============================================================
// PLANNER MOCK FACTORY
// ============================================================

/**
 * LLM Response "Moods" - Preset scenarios for realistic LLM behavior
 */
export const PLANNER_MOODS = {
  /** Clean JSON response (happy path) */
  clean: () => '{"steps": [{"action": "read", "path": "src/index.ts"}]}',

  /** Markdown-wrapped JSON (common model behavior) */
  markdown: () => '```json\n{"steps": [{"action": "read", "path": "src/index.ts"}]}\n```',

  /** Hallucinated response with JSON embedded in prose */
  hallucination: () =>
    'Here is the execution plan for your code: {"steps": [{"action": "read", "path": "src/index.ts"}]} This should help you get started!',
} as const;

/**
 * Options for configuring the Planner mock
 */
export interface PlannerMockOptions {
  /** Preset mood: 'clean' | 'markdown' | 'hallucination', or custom rawLLMResponse */
  mood?: keyof typeof PLANNER_MOODS;
  /** Custom raw LLM response (overrides mood if provided) */
  rawLLMResponse?: string;
  /** Context window depth for planning */
  contextDepth?: number;
  /** Available tools for planning */
  availableTools?: string[];
}

/**
 * Create a mocked Planner with state injection
 *
 * Supports preset "moods" for common LLM response scenarios:
 * 1. 'clean': Standard JSON output (happy path)
 * 2. 'markdown': JSON wrapped in markdown code blocks
 * 3. 'hallucination': JSON embedded in prose text
 *
 * Usage:
 * ```typescript
 * // Default happy path (clean JSON)
 * const { instance, mocks } = createMockPlanner();
 *
 * // Markdown-wrapped response (using mood preset)
 * const { instance, mocks } = createMockPlanner({ mood: 'markdown' });
 *
 * // Hallucinated response (using mood preset)
 * const { instance, mocks } = createMockPlanner({ mood: 'hallucination' });
 *
 * // Custom response (overrides mood)
 * const { instance, mocks } = createMockPlanner({
 *   rawLLMResponse: '{"steps": [{"id": 1}]}'
 * });
 * ```
 *
 * @param options State overrides for specific test scenarios
 * @returns { instance: Planner, mocks: { llm, sendMessageSpy, sendMessageStreamSpy } }
 */
export const createMockPlanner = (options: PlannerMockOptions = {}) => {
  // Resolve "mood" to response string
  const mood = options.mood || 'clean';
  const moodResponse = options.rawLLMResponse || PLANNER_MOODS[mood]();

  const defaults = {
    rawLLMResponse: moodResponse,
    contextDepth: 5,
    availableTools: ['read', 'write', 'search'],
  };

  const config = { ...defaults, ...options };

  // 1. Create mock LLM client spies - CRITICAL: Preserve spies for verification
  const sendMessageSpy = vi.fn().mockResolvedValue(config.rawLLMResponse);
  const sendMessageStreamSpy = vi.fn();
  const isServerHealthySpy = vi.fn().mockResolvedValue(true);
  const clearHistorySpy = vi.fn();

  const mockLLM = {
    sendMessage: sendMessageSpy,
    sendMessageStream: sendMessageStreamSpy,
    isServerHealthy: isServerHealthySpy,
    clearHistory: clearHistorySpy,
  } as unknown as LLMClient;

  // 2. Create planner config
  const plannerConfig: PlannerConfig = {
    llmCall: vi.fn().mockResolvedValue(config.rawLLMResponse),
    onProgress: vi.fn(),
    projectContext: {
      language: 'TypeScript',
      strategy: 'SCAFFOLD_MODE',
      extension: '.ts',
      root: '/test/workspace',
      isMinimalProject: false,
    },
  };

  // 3. Instantiate real Planner (not mocked)
  const planner = new Planner(plannerConfig);

  // 4. Inject internal state for white-box testing
  (planner as any).contextWindow = config.contextDepth;
  (planner as any).tools = config.availableTools;
  (planner as any).llmClient = mockLLM;

  return {
    instance: planner as Planner,
    mocks: {
      llm: mockLLM,
      sendMessageSpy,
      sendMessageStreamSpy,
      isServerHealthySpy,
      clearHistorySpy,
    },
  };
};

// ============================================================
// SMART VALIDATOR UTILITIES
// ============================================================

/**
 * Utility to create test code strings with known patterns
 * Supports: undefined variables, bad imports, missing types, unused imports
 */
export const createCodePatterns = {
  /**
   * Code with undefined variables
   */
  undefinedVariable: (varName: string = 'undefinedVar') =>
    `function test() {
  console.log(${varName});
  // undefinedVar is never defined
}`,

  /**
   * Code with bad imports
   */
  badImport: (importPath: string = 'non-existent-module') =>
    `import { foo } from '${importPath}';
export const bar = foo;`,

  /**
   * Code with unused imports
   */
  unusedImport: (importName: string = 'unused') =>
    `import { ${importName} } from 'some-module';
export const bar = 'something';`,

  /**
   * Code with missing type imports
   */
  missingTypeImport: (typeName: string = 'MyType') =>
    `function process(data: ${typeName}) {
  return data;
}`,

  /**
   * Valid code (baseline)
   */
  valid: () =>
    `import { foo } from 'module';
function test() {
  return foo();
}`,
};

/**
 * Configuration for validator testing
 */
export const createValidatorConfig = () => ({
  language: 'TypeScript' as const,
  projectRoot: '/test/workspace',
  strictMode: true,
  allowedImports: ['react', 'lodash', 'axios'],
  forbiddenImports: ['electron'],
});
