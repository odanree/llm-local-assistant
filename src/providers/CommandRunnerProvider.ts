/**
 * CommandRunnerProvider: Implementation of ICommandRunner using Node.js child_process
 *
 * Real implementation that directly wraps child_process operations
 * In production: Uses actual process execution
 * In tests: Can be replaced with MockCommandRunner for error injection
 */

import * as cp from 'child_process';
import * as os from 'os';
import { ICommandRunner, ExecOptions, ExecResult, CommandError, CommandTimeoutError } from './ICommandRunner';
import { ProcessHandle, SpawnOptions } from '../types';
import { AsyncCommandRunner } from '../services/AsyncCommandRunner';

export class CommandRunnerProvider implements ICommandRunner {
  private asyncRunner = new AsyncCommandRunner();

  execSync(command: string, options?: ExecOptions): string {
    try {
      return cp.execSync(command, {
        timeout: options?.timeout,
        maxBuffer: options?.maxBuffer,
        cwd: options?.cwd,
        env: options?.env,
        shell: options?.shell,
        encoding: 'utf-8',
      });
    } catch (error) {
      this.throwCommandError(error as any, command);
    }
  }

  execSyncWithResult(command: string, options?: ExecOptions): ExecResult {
    try {
      const result = cp.spawnSync('sh' /* or cmd on Windows */, ['-c', command], {
        timeout: options?.timeout,
        maxBuffer: options?.maxBuffer,
        cwd: options?.cwd,
        env: options?.env,
        shell: options?.shell,
        encoding: 'utf-8',
      });

      return {
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.status || 0,
      };
    } catch (error) {
      this.throwCommandError(error as any, command);
    }
  }

  commandExists(command: string): boolean {
    try {
      const checkCommand = process.platform === 'win32'
        ? `where ${command}`
        : `which ${command}`;
      cp.execSync(checkCommand, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  cwd(): string {
    return process.cwd();
  }

  getEnv(name: string): string | undefined {
    return process.env[name];
  }

  getEnvAll(): NodeJS.ProcessEnv {
    return process.env;
  }

  normalizeCommand(command: string): string {
    const isWindows = process.platform === 'win32';

    // Common Python command normalization
    if (command.startsWith('python ') || command === 'python') {
      return isWindows ? command.replace(/^python/, 'py') : command;
    }

    // Common Node command normalization
    if (command.startsWith('node ') || command === 'node') {
      return command;
    }

    return command;
  }

  getPlatform(): string {
    return process.platform;
  }

  getShell(): string {
    return process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
  }

  /**
   * NEW v2.12.0: Spawn a process with real-time streaming
   *
   * Delegates to AsyncCommandRunner for streaming I/O support.
   * Enables interactive commands (npm, yarn, git, etc.)
   */
  spawn(command: string, options?: SpawnOptions): ProcessHandle {
    return this.asyncRunner.spawn(command, options);
  }

  /**
   * Convert Node.js error to CommandError
   */
  private throwCommandError(error: any, command: string): never {
    if (error.killed) {
      throw new CommandTimeoutError(command, error.timeout || 0);
    }

    if (error.code === 'ENOENT') {
      throw new CommandError('ENOENT', command, '', `Command not found: ${command}`);
    }

    if (error.signal) {
      throw new CommandError(error.signal, command, error.stdout || '', error.stderr || '');
    }

    throw new CommandError(
      error.status || error.code || 'UNKNOWN',
      command,
      error.stdout || '',
      error.stderr || '',
      error.message
    );
  }
}
