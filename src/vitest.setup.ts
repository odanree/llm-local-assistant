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

// Handle unhandled promise rejections from git command failures
// These are expected since git is not available in test/CI environment
if (typeof process !== 'undefined' && process.on) {
  process.on('unhandledRejection', (reason) => {
    // Suppress git-related errors which are expected in test environment
    if (reason instanceof Error && reason.message) {
      const msg = reason.message.toLowerCase();
      if (msg.includes('git') || msg.includes('enoent') || msg.includes('failed to get')) {
        return; // Silently ignore expected git errors
      }
    }
    // For other unhandled rejections, let them fail the test
    throw reason;
  });
}
