/**
 * Shared Mock Setup and Test Data for Executor Tests
 *
 * This file centralizes the mock setup logic used across:
 * - executor.test.ts (base tests)
 * - executor-validation.test.ts (validation tests)
 * - executor-errors.test.ts (error recovery tests)
 * - executor-execution.test.ts (execution tests)
 *
 * Reduces duplication and makes it easier to maintain consistent test fixtures.
 */

import { vi } from 'vitest';
import { Executor } from '../executor';
import { TaskPlan, PlanStep } from '../planner';

/**
 * Create a standard mock Executor configuration
 */
export function createMockExecutorConfig(overrides?: any) {
  const mockLLMClient = {
    sendMessage: vi.fn(),
    clearHistory: vi.fn(),
  };

  const mockWorkspace = {
    fsPath: '/workspace',
  };

  const baseConfig = {
    extension: {} as any,
    llmClient: mockLLMClient,
    workspace: mockWorkspace,
    maxRetries: 2,
    timeout: 30000,
    onProgress: vi.fn(),
    onMessage: vi.fn(),
    onQuestion: vi.fn(),
  };

  return {
    config: { ...baseConfig, ...overrides },
    mockLLMClient,
    mockWorkspace,
  };
}

/**
 * Create a standard TaskPlan for testing
 */
export function createTestPlan(
  steps: Partial<PlanStep>[] = [],
  overrides?: Partial<TaskPlan>
): TaskPlan {
  return {
    taskId: 'test_task_' + Math.random().toString(36).substr(2, 9),
    userRequest: 'Test request',
    generatedAt: new Date(),
    steps: steps.map((step, idx) => ({
      stepId: idx + 1,
      action: 'write' as const,
      path: 'test.ts',
      description: 'Test step',
      ...step,
    })),
    status: 'pending' as const,
    currentStep: 0,
    results: new Map(),
    ...overrides,
  };
}

/**
 * Matrix of validation error cases for parameterized testing
 */
export const VALIDATION_ERROR_MATRIX = [
  {
    name: 'TypeScript syntax errors',
    code: 'invalid syntax {{{',
    errors: ['SyntaxError', 'typescript'],
  },
  {
    name: 'Missing imports',
    code: 'useState()',
    errors: ['useState', 'not imported'],
  },
  {
    name: 'React component patterns',
    code: 'class MyComponent extends React.Component {}',
    errors: ['class component', 'functional'],
  },
  {
    name: 'Fetch instead of TanStack Query',
    code: 'fetch("/api/data")',
    errors: ['fetch', 'TanStack Query'],
  },
  {
    name: 'Redux instead of Zustand',
    code: 'useSelector()',
    errors: ['Redux', 'Zustand'],
  },
  {
    name: 'Missing form patterns',
    code: '<input onChange={(e) => setState(e.target.value)} />',
    errors: ['form pattern', 'validation'],
  },
  {
    name: 'Markdown backticks in code',
    code: '```\nfunction test() {}\n```',
    errors: ['markdown', 'backticks'],
  },
  {
    name: 'Type "any" usage',
    code: 'function process(data: any) {}',
    errors: ['any type', 'type safety'],
  },
  {
    name: 'Missing TypeScript exports',
    code: 'export type MyType = string;',
    errors: ['type-only', 'implementation'],
  },
];

/**
 * Matrix of error recovery cases
 */
export const ERROR_RECOVERY_MATRIX = [
  {
    error: 'ENOENT',
    description: 'File not found',
    expectedAction: 'walk_up_directory',
    recoveryStrategy: 'suggest_parent_directory',
  },
  {
    error: 'EACCES',
    description: 'Permission denied',
    expectedAction: 'abort',
    recoveryStrategy: 'suggest_alternative_location',
  },
  {
    error: 'EISDIR',
    description: 'Is a directory (not file)',
    expectedAction: 'abort',
    recoveryStrategy: 'suggest_recurse_flag',
  },
  {
    error: 'EEXIST',
    description: 'File already exists',
    expectedAction: 'suggest_overwrite',
    recoveryStrategy: 'ask_user_confirmation',
  },
  {
    error: 'EMFILE',
    description: 'Too many open files',
    expectedAction: 'retry_later',
    recoveryStrategy: 'exponential_backoff',
  },
];

/**
 * Matrix of command execution cases
 */
export const COMMAND_EXECUTION_MATRIX = [
  {
    command: 'npm test',
    description: 'Run test suite',
    shouldAskQuestion: true,
    questionContext: 'test command',
  },
  {
    command: 'npm run build',
    description: 'Build application',
    shouldAskQuestion: true,
    questionContext: 'build command',
  },
  {
    command: 'npm install',
    description: 'Install dependencies',
    shouldAskQuestion: true,
    questionContext: 'package manager',
  },
  {
    command: 'ls -la',
    description: 'List directory',
    shouldAskQuestion: false,
    questionContext: null,
  },
  {
    command: 'echo "hello"',
    description: 'Echo command',
    shouldAskQuestion: false,
    questionContext: null,
  },
];

/**
 * Matrix of form component pattern cases
 */
export const FORM_PATTERN_MATRIX = [
  {
    pattern: 'missing_state_interface',
    code: 'const form = useForm()',
    error: 'missing form state type',
  },
  {
    pattern: 'missing_validation',
    code: '<input type="text" />',
    error: 'no validation schema',
  },
  {
    pattern: 'onclick_instead_onsubmit',
    code: '<button onClick={handleSubmit} />',
    error: 'should use onSubmit on form',
  },
  {
    pattern: 'missing_error_display',
    code: '<input {...register("email")} />',
    error: 'no error message display',
  },
  {
    pattern: 'missing_required_fields',
    code: '<form><input /></form>',
    error: 'form fields not marked required',
  },
];

/**
 * Helper to create a plan step with common defaults
 */
export function createPlanStep(
  action: 'read' | 'write' | 'run',
  overrides?: Partial<PlanStep>
): PlanStep {
  const defaults: PlanStep = {
    stepId: 1,
    action,
    path: action === 'run' ? undefined : 'test.ts',
    command: action === 'run' ? 'npm test' : undefined,
    description: `${action} step`,
  };

  return { ...defaults, ...overrides } as PlanStep;
}

/**
 * Mock LLM responses for different scenarios
 */
export const MOCK_LLM_RESPONSES = {
  success: {
    success: true,
    message: 'function test() { return 42; }',
  },
  error: {
    success: false,
    error: 'LLM service unavailable',
  },
  timeout: {
    success: false,
    error: 'Request timeout after 30000ms',
  },
  malformed: 'This is not valid JSON {{{',
  empty: '',
};
