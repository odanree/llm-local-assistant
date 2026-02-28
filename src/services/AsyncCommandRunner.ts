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
    // When shell is a boolean, pass it to spawn directly — parseCommand
    // returns the raw command for shell=true (spawn handles wrapping).
    // When shell is a custom string, parseCommand already wraps it,
    // so spawn gets shell=false to avoid double-wrapping.
    const child = cp.spawn(cmd, args, {
      cwd,
      shell: typeof shell === 'boolean' ? shell : false,
      stdio: ['pipe', 'pipe', 'pipe'],
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
   * parseCommand('npm install', true)  // → ['npm install'] (spawn handles shell)
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

    // shell === true: Return raw command — spawn's shell option handles
    // wrapping in the system shell (sh -c on Linux, cmd /s /c on Windows).
    // Do NOT wrap here to avoid double-shelling, which corrupts argument
    // parsing (e.g., "exit 42" becomes "exit" with $0="42" → code 0).
    return [command] as [string, ...string[]];
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

    // Replay buffers — on fast Linux CI, the child process can emit data
    // and exit BEFORE the caller registers callbacks (since spawn() returns
    // synchronously but I/O events fire on the next microtask). These buffers
    // capture all events so late-registered callbacks receive the full history.
    const dataReplayBuffer: string[] = [];
    const errorReplayBuffer: Error[] = [];
    const promptReplayBuffer: string[] = [];

    // Register callback methods with replay support
    handle.onData = (cb) => {
      // Synchronously replay all buffered data in the same tick
      for (const chunk of dataReplayBuffer) {
        try { cb(chunk); } catch (err) { console.error('Error in onData replay:', err); }
      }
      // Add callback to receive future data (happens in same tick, before process yields)
      dataCallbacks.push(cb);
    };
    handle.onError = (cb) => {
      for (const err of errorReplayBuffer) {
        try { cb(err); } catch (e) { console.error('Error in onError replay:', e); }
      }
      errorCallbacks.push(cb);
    };
    handle.onExit = (cb) => {
      if (exited && exitCode !== undefined) {
        try { cb(exitCode); } catch (err) { console.error('Error in onExit replay:', err); }
      }
      exitCallbacks.push(cb);
    };
    handle.onPrompt = (cb) => {
      for (const text of promptReplayBuffer) {
        try { cb(text); } catch (err) { console.error('Error in onPrompt replay:', err); }
      }
      promptCallbacks.push(cb);
    };

    // ================== stdout Handler ==================
    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        const data = chunk.toString('utf8');

        // Buffer for replay (late-registered callbacks)
        dataReplayBuffer.push(data);

        // Prompt detection heuristic: check if this looks like a prompt
        if (!promptDetected && this.looksLikePrompt(data)) {
          promptDetected = true;
          promptReplayBuffer.push(data);
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
        errorReplayBuffer.push(err);
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
        const data = chunk.toString('utf8');
        const err = new Error(data);

        // Buffer for replay
        errorReplayBuffer.push(err);

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
        errorReplayBuffer.push(err);
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
    // Use 'exit' (not 'close'): 'close' waits for ALL stdio streams to end,
    // which hangs when kill() sends SIGTERM to a shell — the shell dies but
    // its child process (e.g., sleep) inherits the pipes and holds them open.
    // 'exit' fires reliably when the process itself terminates.
    //
    // Data integrity is handled separately by replay buffers: stdout/stderr
    // handlers have NO `if (exited) return` guard, so late-arriving data is
    // still captured in dataReplayBuffer and replayed to late-registered
    // callbacks. This eliminates the original race condition without needing
    // 'close'.
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
