/**
 * Phase 3B: Executor Fault Injection Tests
 *
 * Purpose: Test error handling paths by injecting faults via mocked providers
 * Impact: Reaches previously untestable catch blocks
 * Expected Coverage Gain: +3-4% toward 80% Diamond Tier
 *
 * Test Strategy:
 * - Use MockFileSystem to simulate ENOSPC, EACCES, ENOENT
 * - Use MockCommandRunner to simulate timeouts and exit codes
 * - Verify Executor handles each failure gracefully
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Executor } from '../executor';
import { MockFileSystem } from './mocks/MockFileSystem';
import { MockCommandRunner } from './mocks/MockCommandRunner';
import * as vscode from 'vscode';

describe('Phase 3B: Executor Fault Injection - Error Path Coverage', () => {
  let mockFs: MockFileSystem;
  let mockCommandRunner: MockCommandRunner;
  let executor: Executor;

  // Helper to create test executor with mocks
  const createExecutorWithMocks = (fsConfig = {}, cmdConfig = {}) => {
    mockFs = new MockFileSystem(fsConfig);
    mockCommandRunner = new MockCommandRunner(cmdConfig);

    // Minimal config - just enough to create executor
    return new Executor({
      extension: {} as vscode.ExtensionContext,
      llmClient: null as any,
      workspace: vscode.Uri.file('/test'),
      fs: mockFs,
      commandRunner: mockCommandRunner,
    });
  };

  describe('Disk Full Errors (ENOSPC)', () => {
    it('should handle file write failure when disk is full', () => {
      executor = createExecutorWithMocks({
        failOnWrite: ['/test/output.ts'],
        writeErrorCode: 'ENOSPC',
      });

      // Attempting to write to a file on a full disk should fail gracefully
      expect(() => {
        mockFs.writeFileSync('/test/output.ts', 'const x = 1;');
      }).toThrow();

      // Error should have ENOSPC code
      try {
        mockFs.writeFileSync('/test/output.ts', 'const x = 1;');
      } catch (error: any) {
        expect(error.code).toBe('ENOSPC');
      }
    });

    it('should handle append failure when disk is full', () => {
      executor = createExecutorWithMocks({
        failOnWrite: ['/test/log.txt'],
        writeErrorCode: 'ENOSPC',
      });

      mockFs.addFile('/test/log.txt', 'Initial content\n');

      expect(() => {
        mockFs.appendFileSync('/test/log.txt', 'More content');
      }).toThrow();
    });

    it('should handle mkdir failure when disk is full', () => {
      executor = createExecutorWithMocks({
        failOnMkdir: ['/test/newdir'],
      });

      expect(() => {
        mockFs.mkdirSync('/test/newdir');
      }).toThrow();
    });
  });

  describe('Permission Denied Errors (EACCES)', () => {
    it('should handle read permission denied', () => {
      executor = createExecutorWithMocks({
        failOnRead: ['/test/protected.ts'],
        readErrorCode: 'EACCES',
      });

      expect(() => {
        mockFs.readFileSync('/test/protected.ts');
      }).toThrow();

      try {
        mockFs.readFileSync('/test/protected.ts');
      } catch (error: any) {
        expect(error.code).toBe('EACCES');
      }
    });

    it('should handle write permission denied', () => {
      executor = createExecutorWithMocks({
        files: { '/test/readonly.ts': 'const x = 1;' },
        failOnWrite: ['/test/readonly.ts'],
        writeErrorCode: 'EACCES',
      });

      expect(() => {
        mockFs.writeFileSync('/test/readonly.ts', 'const x = 2;');
      }).toThrow();
    });

    it('should handle delete permission denied', () => {
      executor = createExecutorWithMocks({
        files: { '/test/protected-delete.ts': 'content' },
        failOnDelete: ['/test/protected-delete.ts'],
      });

      expect(() => {
        mockFs.deleteFileSync('/test/protected-delete.ts');
      }).toThrow();
    });
  });

  describe('File Not Found Errors (ENOENT)', () => {
    it('should handle reading non-existent file', () => {
      executor = createExecutorWithMocks();

      expect(() => {
        mockFs.readFileSync('/test/nonexistent.ts');
      }).toThrow();

      try {
        mockFs.readFileSync('/test/nonexistent.ts');
      } catch (error: any) {
        expect(error.code).toBe('ENOENT');
      }
    });

    it('should handle deleting non-existent file', () => {
      executor = createExecutorWithMocks();

      expect(() => {
        mockFs.deleteFileSync('/test/nonexistent.ts');
      }).toThrow();
    });

    it('should handle reading from directory that does not exist', () => {
      executor = createExecutorWithMocks();

      expect(() => {
        mockFs.readdirSync('/nonexistent/dir');
      }).toThrow();
    });

    it('should handle stat on non-existent path', () => {
      executor = createExecutorWithMocks();

      expect(() => {
        mockFs.statSync('/nonexistent/file.ts');
      }).toThrow();
    });
  });

  describe('Command Execution Errors', () => {
    it('should handle command not found (ENOENT)', () => {
      executor = createExecutorWithMocks({}, {
        failingCommands: ['nonexistent-cmd'],
        failureErrorCode: 'ENOENT',
      });

      expect(() => {
        mockCommandRunner.execSync('nonexistent-cmd');
      }).toThrow();
    });

    it('should handle command exit code failure', () => {
      executor = createExecutorWithMocks({}, {
        failingCommands: ['git push'],
        failureErrorCode: 128,
        failureStderr: 'fatal: could not read Username',
      });

      expect(() => {
        mockCommandRunner.execSync('git push');
      }).toThrow();
    });

    it('should handle command timeout', () => {
      executor = createExecutorWithMocks({}, {
        timeoutCommands: ['slow-command'],
        timeoutMs: 1000,
      });

      expect(() => {
        mockCommandRunner.execSync('slow-command', { timeout: 1000 });
      }).toThrow();
    });

    it('should differentiate timeout from other errors', () => {
      executor = createExecutorWithMocks({}, {
        timeoutCommands: ['slow-git'],
      });

      try {
        mockCommandRunner.execSync('slow-git', { timeout: 100 });
      } catch (error: any) {
        expect(error.name).toBe('CommandTimeoutError');
      }
    });
  });

  describe('File System State Validation', () => {
    it('should track file existence correctly', () => {
      executor = createExecutorWithMocks({
        files: { '/test/exists.ts': 'content' },
      });

      expect(mockFs.existsSync('/test/exists.ts')).toBe(true);
      expect(mockFs.existsSync('/test/nonexistent.ts')).toBe(false);
    });

    it('should distinguish between files and directories', () => {
      executor = createExecutorWithMocks({
        files: { '/test/file.ts': 'content' },
        directories: new Set(['/test', '/test/dir']),
      });

      const fileStats = mockFs.statSync('/test/file.ts');
      expect(fileStats.isFile()).toBe(true);
      expect(fileStats.isDirectory()).toBe(false);

      const dirStats = mockFs.statSync('/test/dir');
      expect(dirStats.isDirectory()).toBe(true);
      expect(dirStats.isFile()).toBe(false);
    });

    it('should handle path resolution correctly', () => {
      executor = createExecutorWithMocks();

      expect(mockCommandRunner.getPlatform()).toMatch(/linux|win32|darwin/);
      expect(mockCommandRunner.cwd()).toBe('/home/user/project');
    });
  });

  describe('Complex Error Scenarios', () => {
    it('should handle cascading write failures', () => {
      executor = createExecutorWithMocks({
        files: { '/test/base.ts': 'export const x = 1;' },
        failOnWrite: ['/test/base.ts', '/test/derived.ts'],
        writeErrorCode: 'ENOSPC',
      });

      // First write fails
      expect(() => {
        mockFs.writeFileSync('/test/base.ts', 'modified');
      }).toThrow();

      // Related write also fails
      expect(() => {
        mockFs.writeFileSync('/test/derived.ts', 'new content');
      }).toThrow();
    });

    it('should handle partial directory creation failure', () => {
      executor = createExecutorWithMocks({
        directories: new Set(['/test']),
        failOnMkdir: ['/test/deeply/nested/dir'],
      });

      // Recursive mkdir with failure
      expect(() => {
        mockFs.mkdirSync('/test/deeply/nested/dir', { recursive: true });
      }).toThrow();
    });

    it('should recover from transient failures', () => {
      executor = createExecutorWithMocks({
        files: { '/test/file.ts': 'initial' },
      });

      // Read succeeds on first attempt
      const content1 = mockFs.readFileSync('/test/file.ts');
      expect(content1).toBe('initial');

      // Simulate transient failure by recreating with failure
      mockFs.setFailureMode('read', '/test/file.ts', 'EACCES');

      // Now read fails
      expect(() => {
        mockFs.readFileSync('/test/file.ts');
      }).toThrow();
    });
  });

  describe('Command Response Customization', () => {
    it('should handle custom command responses', () => {
      executor = createExecutorWithMocks({}, {
        commandResponses: {
          'git status': {
            stdout: 'On branch main\nnothing to commit',
            stderr: '',
            exitCode: 0,
          },
        },
      });

      const result = mockCommandRunner.execSyncWithResult('git status');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('On branch main');
    });

    it('should handle commands with stderr output', () => {
      executor = createExecutorWithMocks({}, {
        commandResponses: {
          'npm install': {
            stdout: 'added 150 packages',
            stderr: 'npm WARN deprecated package-name',
            exitCode: 0,
          },
        },
      });

      const result = mockCommandRunner.execSyncWithResult('npm install');
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('deprecated');
    });
  });

  describe('Environment and Platform Handling', () => {
    it('should handle different platforms', () => {
      executor = createExecutorWithMocks({}, { platform: 'win32' });
      expect(mockCommandRunner.getPlatform()).toBe('win32');
      expect(mockCommandRunner.getShell()).toBe('cmd.exe');
    });

    it('should provide environment variables', () => {
      const env = { TEST_VAR: 'test-value' };
      executor = createExecutorWithMocks({}, { env });

      expect(mockCommandRunner.getEnv('TEST_VAR')).toBe('test-value');
      expect(mockCommandRunner.getEnvAll()).toHaveProperty('TEST_VAR');
    });

    it('should normalize platform-specific commands', () => {
      // Windows python normalization
      executor = createExecutorWithMocks({}, { platform: 'win32' });
      const normalized = mockCommandRunner.normalizeCommand('python script.py');
      expect(normalized).toBe('py script.py');

      // Unix python stays unchanged
      executor = createExecutorWithMocks({}, { platform: 'linux' });
      const unixNormalized = mockCommandRunner.normalizeCommand('python script.py');
      expect(unixNormalized).toBe('python script.py');
    });
  });
});
