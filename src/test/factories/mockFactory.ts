/**
 * Test Factory: Mocks
 *
 * Type-safe mock creators for external dependencies
 * Replaces loose `any` types with proper interfaces
 */

import { vi } from 'vitest';
import type { LLMConfig } from '../../llmClient';

/**
 * Create a type-safe LLMConfig
 */
export function createLLMConfig(overrides?: Partial<LLMConfig>): LLMConfig {
  return {
    endpoint: 'http://localhost:11434',
    model: 'mistral',
    temperature: 0.7,
    maxTokens: 2048,
    timeout: 30000,
    ...overrides,
  };
}

/**
 * Create a mock fetch response
 */
export function createMockResponse(
  status: number = 200,
  data: any = { ok: true }
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: vi.fn(async () => data),
    text: vi.fn(async () => JSON.stringify(data)),
    headers: new Headers(),
    clone: vi.fn(),
    arrayBuffer: vi.fn(),
    blob: vi.fn(),
    formData: vi.fn(),
    body: null,
    bodyUsed: false,
    redirected: false,
    type: 'basic' as any,
    url: 'http://test.com',
  } as unknown as Response;
}

/**
 * Mock fs module for file operations
 */
export function createMockFS() {
  return {
    readFileSync: vi.fn((path: string) => Buffer.from('test content')),
    writeFileSync: vi.fn(),
    existsSync: vi.fn((path: string) => true),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn((path: string) => ['file1.ts', 'file2.ts']),
    statSync: vi.fn((path: string) => ({
      isDirectory: () => path.includes('/'),
      isFile: () => !path.includes('/'),
    })),
    promises: {
      readFile: vi.fn(async () => Buffer.from('test content')),
      writeFile: vi.fn(async () => undefined),
      mkdir: vi.fn(async () => undefined),
      readdir: vi.fn(async () => ['file1.ts', 'file2.ts']),
    },
  };
}

/**
 * Mock git client
 */
export function createMockGitClient() {
  return {
    getStatus: vi.fn(async () => ({
      added: [],
      deleted: [],
      modified: [],
      untracked: [],
    })),
    diff: vi.fn(async () => ''),
    stage: vi.fn(async () => undefined),
    commit: vi.fn(async () => 'abc123'),
    push: vi.fn(async () => undefined),
    getCurrentBranch: vi.fn(async () => 'main'),
  };
}

/**
 * Mock LLM client
 */
export function createMockLLMClient() {
  return {
    sendMessage: vi.fn(async (message: string) => 'Response from LLM'),
    sendMessageStream: vi.fn(async (message: string, callback: (chunk: string) => void) => {
      callback('Streaming response');
    }),
    isServerHealthy: vi.fn(async () => true),
    clearHistory: vi.fn(),
  };
}

/**
 * Mock VS Code extension context
 */
export function createMockVSCodeContext() {
  return {
    subscriptions: [] as any[],
    workspaceState: {
      get: vi.fn(),
      update: vi.fn(),
      keys: vi.fn(() => []),
    },
    globalState: {
      get: vi.fn(),
      update: vi.fn(),
      keys: vi.fn(() => []),
    },
    secrets: {
      get: vi.fn(),
      store: vi.fn(),
      delete: vi.fn(),
    },
    extensionPath: '/path/to/extension',
    extensionUri: { fsPath: '/path/to/extension' } as any,
    globalStoragePath: '/global/storage',
    globalStorageUri: { fsPath: '/global/storage' } as any,
    logPath: '/log/path',
    logUri: { fsPath: '/log/path' } as any,
    storagePath: '/storage/path',
    storageUri: { fsPath: '/storage/path' } as any,
  };
}

/**
 * Mock workspace folder
 */
export function createMockWorkspaceFolder(path: string = '/workspace') {
  return {
    uri: { fsPath: path },
    name: path.split('/').pop() || 'workspace',
    index: 0,
  };
}

/**
 * Create a mock that rejects after N calls
 */
export function createEventuallyFailingMock<T>(
  successResponses: T[],
  errorMessage: string = 'Mock failed'
) {
  let callCount = 0;
  return vi.fn(async () => {
    if (callCount < successResponses.length) {
      return successResponses[callCount++];
    }
    throw new Error(errorMessage);
  });
}

/**
 * Create a mock that returns different values on each call
 */
export function createSequentialMock<T>(values: T[]) {
  let index = 0;
  return vi.fn(async () => {
    const value = values[index];
    index = (index + 1) % values.length;
    return value;
  });
}
