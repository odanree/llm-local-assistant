/**
 * AsyncCommandRunner - v2.12.0 Streaming I/O Implementation
 *
 * Implements ProcessHandle interface using child_process.spawn()
 * Provides real-time streaming, interactive stdin, and signal management.
 *
 * Replaces exec() for interactive commands (npm, yarn, git, etc.)
 * Enables suspend/resume on user prompts via prompt detection.
 */

import * as cp from 'child_process';
import { ProcessHandle, SpawnOptions } from '../types/ProcessHandle';

/**
 * AsyncCommandRunner: Non-blocking command execution with streaming
 *
 * Implements real-time streaming for interactive commands.
 * Used internally by CommandRunnerProvider for the spawn() method.
 *
 * Usage:
 * ```typescript
 * const runner = new AsyncCommandRunner();
 * const handle = runner.spawn('npm install', { timeout: 30000 });
 *
 * handle.onData(data => console.log('stdout:', data));
 * handle.onError(err => console.error('stderr:', err.message));
 * handle.onExit(code => console.log('done:', code));
 *
 * // For interactive commands:
 * handle.onPrompt(prompt => {
 *   console.log('Detected prompt:', prompt);
 * });
 *
 * // Send user input back to process
 * handle.sendInput('y\n');
 *
 * // Kill if needed
 * handle.kill();
 * ```
 */
export class AsyncCommandRunner {
  /**
   * Spawn a process with real-time streaming
   *
   * @param command Command string to execute (e.g., "npm install")
   * @param options Spawn options (cwd, shell, timeout, maxBuffer, echo)
   * @returns ProcessHandle for real-time interaction
   *
   * @example
   * const handle = runner.spawn('npm install', {
   *   cwd: '/path/to/project',
   *   timeout: 30000,
   *   shell: true
   * });
   */
  spawn(command: string, options: SpawnOptions = {}): ProcessHandle {
    const cwd = options.cwd || process.cwd();
    const shell = options.shell ?? true;
    const timeout = options.timeout ?? 30000;
    // Note: maxBuffer is stored for reference but not passed to spawn
    // (spawn doesn't support it; only exec does)
    const echo = options.echo ?? false;

    // Parse command into [executable, ...args]
    const [cmd, ...args] = this.parseCommand(command, shell);

    // Spawn the child process
    const child = cp.spawn(cmd, args, {
      cwd,
      shell: typeof shell === 'boolean' ? shell : false,
      stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
      // Note: maxBuffer option is not standard for spawn(), only for exec()
      // Buffer overflow is managed by stream handling, not by this option
    });

    // Create ProcessHandle implementation
    const handle: ProcessHandle = {
      onData: () => {},
      onError: () => {},
      onExit: () => {},
      onPrompt: () => {},
      sendInput: () => {},
      kill: () => {},
      isRunning: () => true,
      getExitCode: () => undefined,
      getPID: () => child.pid,
      stdin: child.stdin,
      stdout: child.stdout,
      stderr: child.stderr,
    };

    // Setup all event handlers and lifecycle management
    this.setupHandlers(child, handle, timeout, echo);

    return handle;
  }

  /**
   * Internal: Parse command string into [executable, ...args]
   *
   * Handles different shell configurations:
   * - shell: true → use system shell
   * - shell: false → parse manually
   * - shell: string → use custom shell
   *
   * @example
   * parseCommand('npm install', true)  // → ['sh', '-c', 'npm install']
   * parseCommand('npm install', false) // → ['npm', 'install']
   */
  private parseCommand(
    command: string,
    shell: boolean | string
  ): [string, ...string[]] {
    // Custom shell specified (e.g., '/bin/bash', 'powershell')
    if (typeof shell === 'string') {
      return [shell, '-c', command];
    }

    // No shell - split by whitespace manually
    if (shell === false) {
      const parts = command.trim().split(/\s+/);
      return parts as [string, ...string[]];
    }

    // Default shell behavior - use system shell with -c flag
    const isWindows = process.platform === 'win32';
    const shellCmd = isWindows ? 'cmd.exe' : '/bin/sh';
    const flag = isWindows ? '/c' : '-c';
    return [shellCmd, flag, command];
  }

  /**
   * Internal: Setup all event handlers for the child process
   *
   * Responsibilities:
   * 1. Collect stdout/stderr into buffers
   * 2. Emit real-time data to callbacks
   * 3. Detect prompts and emit onPrompt
   * 4. Manage process timeout (SIGTERM → SIGKILL)
   * 5. Track process state (running/exited)
   * 6. Implement sendInput() and kill() methods
   *
   * @param child The child process from cp.spawn()
   * @param handle The ProcessHandle to populate
   * @param timeout Milliseconds before auto-kill (0 = disabled)
   * @param echo Whether to echo user input to stdout
   */
  private setupHandlers(
    child: cp.ChildProcess,
    handle: ProcessHandle,
    timeout: number,
    echo: boolean = false
  ): void {
    // State tracking
    let exited = false;
    let exitCode: number | undefined;
    let timeoutId: NodeJS.Timeout | null = null;
    let promptDetected = false;

    // Callback arrays (multiple listeners supported)
    const dataCallbacks: ((data: string) => void)[] = [];
    const errorCallbacks: ((error: Error) => void)[] = [];
    const exitCallbacks: ((code: number) => void)[] = [];
    const promptCallbacks: ((text: string) => void)[] = [];

    // Register callback methods on handle
    handle.onData = (cb) => dataCallbacks.push(cb);
    handle.onError = (cb) => errorCallbacks.push(cb);
    handle.onExit = (cb) => exitCallbacks.push(cb);
    handle.onPrompt = (cb) => promptCallbacks.push(cb);

    // ================== stdout Handler ==================
    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        if (exited) return; // Ignore data after exit

        const data = chunk.toString('utf8');

        // Prompt detection heuristic: check if this looks like a prompt
        // (This is simple detection - Milestone 2 will add full pattern matching)
        if (!promptDetected && this.looksLikePrompt(data)) {
          promptDetected = true;
          // Emit to prompt handlers
          promptCallbacks.forEach((cb) => {
            try {
              cb(data);
            } catch (err) {
              console.error('Error in onPrompt callback:', err);
            }
          });
        }

        // Emit to data handlers
        dataCallbacks.forEach((cb) => {
          try {
            cb(data);
          } catch (err) {
            console.error('Error in onData callback:', err);
          }
        });
      });

      child.stdout.on('error', (err) => {
        errorCallbacks.forEach((cb) => {
          try {
            cb(err);
          } catch (cbErr) {
            console.error('Error in onError callback:', cbErr);
          }
        });
      });
    }

    // ================== stderr Handler ==================
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        if (exited) return;

        const data = chunk.toString('utf8');
        const err = new Error(data);

        // Emit to error handlers
        errorCallbacks.forEach((cb) => {
          try {
            cb(err);
          } catch (cbErr) {
            console.error('Error in onError callback:', cbErr);
          }
        });
      });

      child.stderr.on('error', (err) => {
        errorCallbacks.forEach((cb) => {
          try {
            cb(err);
          } catch (cbErr) {
            console.error('Error in onError callback:', cbErr);
          }
        });
      });
    }

    // ================== Process Exit Handler ==================
    child.on('exit', (code) => {
      exited = true;
      exitCode = code ?? 1;

      // Clear timeout if still pending
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      // Emit exit code to all handlers
      exitCallbacks.forEach((cb) => {
        try {
          cb(exitCode!);
        } catch (err) {
          console.error('Error in onExit callback:', err);
        }
      });

      // Update process state methods
      handle.isRunning = () => false;
      handle.getExitCode = () => exitCode;
    });

    // ================== Process Error Handler ==================
    child.on('error', (err) => {
      exited = true;
      exitCode = 1;

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      // Emit error
      errorCallbacks.forEach((cb) => {
        try {
          cb(err);
        } catch (cbErr) {
          console.error('Error in onError callback:', cbErr);
        }
      });

      // Emit exit with error code
      exitCallbacks.forEach((cb) => {
        try {
          cb(1);
        } catch (cbErr) {
          console.error('Error in onExit callback:', cbErr);
        }
      });

      handle.isRunning = () => false;
      handle.getExitCode = () => 1;
    });

    // ================== sendInput Implementation ==================
    handle.sendInput = (data: string) => {
      if (exited || !child.stdin || child.stdin.destroyed) {
        return; // Silently fail if already exited
      }

      try {
        child.stdin.write(data);

        // Optionally echo input to output
        if (echo) {
          dataCallbacks.forEach((cb) => {
            try {
              cb(`[INPUT] ${data}`);
            } catch (err) {
              console.error('Error in onData callback:', err);
            }
          });
        }
      } catch (err) {
        errorCallbacks.forEach((cb) => {
          try {
            cb(err as Error);
          } catch (cbErr) {
            console.error('Error in onError callback:', cbErr);
          }
        });
      }
    };

    // ================== kill Implementation ==================
    // SIGTERM → SIGKILL escalation (5 second window)
    handle.kill = () => {
      if (exited || !child.pid) {
        return;
      }

      try {
        // Send SIGTERM first (graceful shutdown)
        child.kill('SIGTERM');

        // If still alive after 5 seconds, send SIGKILL
        const killTimeout = setTimeout(() => {
          if (!exited && child.pid) {
            try {
              child.kill('SIGKILL');
            } catch (err) {
              // Process already gone, ignore
            }
          }
        }, 5000);

        // Clear timeout on exit
        const exitHandler = () => {
          clearTimeout(killTimeout);
        };

        child.once('exit', exitHandler);
      } catch (err) {
        errorCallbacks.forEach((cb) => {
          try {
            cb(err as Error);
          } catch (cbErr) {
            console.error('Error in onError callback:', cbErr);
          }
        });
      }
    };

    // ================== isRunning Implementation ==================
    handle.isRunning = () => !exited;

    // ================== getPID Implementation ==================
    handle.getPID = () => child.pid;

    // ================== Auto-Timeout Implementation ==================
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        if (!exited) {
          // Timeout reached - kill the process
          handle.kill();

          // Emit timeout error
          const timeoutErr = new Error(`Process timeout after ${timeout}ms`);
          errorCallbacks.forEach((cb) => {
            try {
              cb(timeoutErr);
            } catch (err) {
              console.error('Error in onError callback:', err);
            }
          });
        }
      }, timeout);
    }
  }

  /**
   * Internal: Simple heuristic to detect if text looks like a prompt
   *
   * Checks for common prompt indicators:
   * - Ends with '?'
   * - Ends with ':'
   * - Contains '[Y/n]', '[y/N]'
   * - Ends with '>>' or '>>>'
   * - Starts with number and ')'
   *
   * Full pattern matching happens in Milestone 2 (StreamingIO patterns)
   */
  private looksLikePrompt(text: string): boolean {
    const lines = text.split('\n');
    const lastLine = lines[lines.length - 1].trim();

    if (!lastLine) {
      return false; // Empty line is not a prompt
    }

    return (
      lastLine.endsWith('?') ||
      lastLine.endsWith(':') ||
      lastLine.includes('[Y/n]') ||
      lastLine.includes('[y/N]') ||
      lastLine.endsWith('>>') ||
      lastLine.endsWith('>>>') ||
      /^\d+\)/.test(lastLine) // "1) option", "2) option", etc.
    );
  }
}
