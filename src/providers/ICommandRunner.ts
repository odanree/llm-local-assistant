/**
 * ICommandRunner: Dependency Injection interface for command execution
 *
 * Purpose: Enable dependency injection of command execution to support:
 * - Mock command runners for testing error paths (timeout, process crash, etc.)
 * - Different execution strategies (local, remote, containerized, etc.)
 * - Better process management and error recovery
 *
 * Design Pattern: Strategy pattern for side effects
 */

export interface ExecOptions {
  timeout?: number;
  maxBuffer?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  shell?: string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ICommandRunner {
  /**
   * Execute command synchronously
   * @throws Error if command fails, timeout, etc.
   */
  execSync(command: string, options?: ExecOptions): string;

  /**
   * Execute command and return full result
   * @throws Error if command fails, timeout, etc.
   */
  execSyncWithResult(command: string, options?: ExecOptions): ExecResult;

  /**
   * Check if a command exists in PATH
   */
  commandExists(command: string): boolean;

  /**
   * Get current working directory
   */
  cwd(): string;

  /**
   * Get environment variable
   */
  getEnv(name: string): string | undefined;

  /**
   * Get all environment variables
   */
  getEnvAll(): NodeJS.ProcessEnv;

  /**
   * Normalize command for platform (e.g., python -> python3 on Unix, py on Windows)
   */
  normalizeCommand(command: string): string;

  /**
   * Get platform type (win32, darwin, linux, etc.)
   */
  getPlatform(): string;

  /**
   * Get shell to use for execution
   */
  getShell(): string;
}

/**
 * Error types that can be thrown by command runner
 * Used for testing error scenarios
 */
export class CommandError extends Error {
  constructor(
    public code: string | number, // exit code or 'TIMEOUT', 'ENOENT', etc.
    public command: string,
    public stdout: string = '',
    public stderr: string = '',
    message?: string
  ) {
    super(message || `Command failed: ${command}`);
    this.name = 'CommandError';
  }
}

/**
 * Timeout error for command execution
 */
export class CommandTimeoutError extends CommandError {
  constructor(command: string, timeout: number) {
    super('TIMEOUT', command, '', '', `Command timeout after ${timeout}ms: ${command}`);
    this.name = 'CommandTimeoutError';
  }
}
