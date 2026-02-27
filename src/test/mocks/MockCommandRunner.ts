/**
 * MockCommandRunner: Test implementation of ICommandRunner with fault injection
 *
 * Enables testing of error handling paths that are difficult to reach:
 * - Command not found (ENOENT)
 * - Timeout errors
 * - Process exit codes and stderr
 * - Permission denied errors
 */

import { ICommandRunner, ExecOptions, ExecResult, CommandError, CommandTimeoutError } from '../../providers/ICommandRunner';

export interface MockCommandConfig {
  // Commands that should fail
  failingCommands?: string[];

  // Specific error to throw for failing commands
  failureErrorCode?: string | number; // e.g., 'ENOENT', 1, 127
  failureStderr?: string;

  // Commands that should timeout
  timeoutCommands?: string[];
  timeoutMs?: number;

  // Custom command responses
  commandResponses?: Record<string, { stdout: string; stderr: string; exitCode: number }>;

  // Platform to simulate
  platform?: string;

  // Environment variables
  env?: NodeJS.ProcessEnv;
}

export class MockCommandRunner implements ICommandRunner {
  private config: MockCommandConfig;
  private platform: string;

  constructor(config: MockCommandConfig = {}) {
    this.config = config;
    this.platform = config.platform || 'linux';
  }

  execSync(command: string, options?: ExecOptions): string {
    const result = this.execSyncWithResult(command, options);
    if (result.exitCode !== 0) {
      throw new CommandError(result.exitCode, command, result.stdout, result.stderr);
    }
    return result.stdout;
  }

  execSyncWithResult(command: string, options?: ExecOptions): ExecResult {
    // Check for timeout
    if (this.config.timeoutCommands?.some(cmd => command.includes(cmd))) {
      throw new CommandTimeoutError(command, options?.timeout || this.config.timeoutMs || 1000);
    }

    // Check for custom response
    if (this.config.commandResponses?.[command]) {
      return this.config.commandResponses[command];
    }

    // Check for failing commands
    if (this.config.failingCommands?.some(cmd => command.includes(cmd))) {
      const errorCode = this.config.failureErrorCode || 1;
      throw new CommandError(
        errorCode,
        command,
        '',
        this.config.failureStderr || `Command failed: ${command}`
      );
    }

    // Default success response
    return {
      stdout: '',
      stderr: '',
      exitCode: 0,
    };
  }

  commandExists(command: string): boolean {
    // Check if command is in failing list
    if (this.config.failingCommands?.some(cmd => command.includes(cmd))) {
      return false;
    }

    // Default: assume common commands exist
    const commonCommands = ['git', 'npm', 'node', 'python', 'python3', 'ls', 'cat', 'grep'];
    return commonCommands.some(c => command.includes(c));
  }

  cwd(): string {
    return '/home/user/project';
  }

  getEnv(name: string): string | undefined {
    return this.config.env?.[name];
  }

  getEnvAll(): NodeJS.ProcessEnv {
    return this.config.env || {
      PATH: '/usr/local/bin:/usr/bin:/bin',
      HOME: '/home/user',
      USER: 'test',
    };
  }

  normalizeCommand(command: string): string {
    if (this.platform === 'win32') {
      return command.replace(/^python\s/, 'py ').replace(/^python$/, 'py');
    }
    return command;
  }

  getPlatform(): string {
    return this.platform;
  }

  getShell(): string {
    return this.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
  }

  /**
   * Helper: Set up command to fail
   */
  setFailingCommand(command: string, errorCode: string | number = 'ENOENT', stderr: string = ''): void {
    this.config.failingCommands = [...(this.config.failingCommands || []), command];
    this.config.failureErrorCode = errorCode;
    this.config.failureStderr = stderr;
  }

  /**
   * Helper: Set up command to timeout
   */
  setTimeoutCommand(command: string, timeoutMs: number = 5000): void {
    this.config.timeoutCommands = [...(this.config.timeoutCommands || []), command];
    this.config.timeoutMs = timeoutMs;
  }

  /**
   * Helper: Set custom response for command
   */
  setCommandResponse(command: string, stdout: string, stderr: string = '', exitCode: number = 0): void {
    this.config.commandResponses = {
      ...(this.config.commandResponses || {}),
      [command]: { stdout, stderr, exitCode },
    };
  }

  /**
   * Helper: Get all configured failing commands
   */
  getFailingCommands(): string[] {
    return this.config.failingCommands || [];
  }
}
