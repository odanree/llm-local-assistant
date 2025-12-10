import { vi } from 'vitest';

// Mock vscode module for all tests
vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
  window: {
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  workspace: {
    getConfiguration: vi.fn(),
    onDidChangeConfiguration: vi.fn(),
  },
  Uri: {
    file: (path: string) => ({ fsPath: path }),
  },
  ExtensionContext: {},
  // Add more vscode APIs as needed
}));
