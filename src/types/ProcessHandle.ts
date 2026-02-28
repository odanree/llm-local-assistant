/**
 * ProcessHandle Interface - v2.12.0 Streaming I/O
 *
 * Represents a spawned process with real-time streaming, interactive input,
 * and process management capabilities.
 *
 * This is the contract for AsyncCommandRunner.spawn() method.
 */

/**
 * ProcessHandle: Allows real-time interaction with spawned processes
 *
 * Usage Example:
 * ```typescript
 * const handle = commandRunner.spawn('npm install', { timeout: 30000 });
 * handle.onData(data => console.log('stdout:', data));
 * handle.onError(err => console.error('stderr:', err.message));
 * handle.onExit(code => console.log('exit code:', code));
 *
 * // When a prompt appears in the output
 * if (output.includes('proceed?')) {
 *   handle.sendInput('y\n');  // Send user response
 * }
 *
 * // Kill the process if needed
 * handle.kill();
 * ```
 */
export interface ProcessHandle {
  /**
   * Fired when stdout data is received from the process
   *
   * @param callback Function called with each chunk of stdout data
   * @example
   * handle.onData(data => {
   *   outputChannel.appendLine(data);
   * });
   */
  onData: (callback: (data: string) => void) => void;

  /**
   * Fired when stderr data is received from the process
   *
   * @param callback Function called with each chunk of stderr data
   * @example
   * handle.onError(err => {
   *   outputChannel.appendLine(`[ERROR] ${err.message}`);
   * });
   */
  onError: (callback: (error: Error) => void) => void;

  /**
   * Fired when the process exits (either normally or via kill)
   *
   * @param callback Function called with the exit code
   * @example
   * handle.onExit(code => {
   *   if (code === 0) console.log('Success');
   *   else console.log('Failed with code:', code);
   * });
   */
  onExit: (callback: (code: number) => void) => void;

  /**
   * Fired when a user prompt is detected in stdout
   *
   * v2.12.0 NEW: Replaces manual prompt detection
   * Uses heuristics to detect common prompt patterns (npm, yarn, git, etc.)
   *
   * @param callback Function called with the detected prompt text
   * @example
   * handle.onPrompt(prompt => {
   *   ui.showInputBox({
   *     prompt: prompt,
   *     onSubmit: (input) => handle.sendInput(input + '\n')
   *   });
   * });
   */
  onPrompt: (callback: (text: string) => void) => void;

  /**
   * Send input to the process stdin
   *
   * v2.12.0 NEW: Critical for interactive commands
   * Used when:
   * - npm install prompts "proceed? (y/n)"
   * - git rebase asks for commands
   * - sudo prompts for password
   *
   * @param data The data to send to stdin (e.g., 'y\n')
   * @example
   * handle.sendInput('y\n');
   *
   * @throws Error if process is not running or stdin is closed
   */
  sendInput: (data: string) => void;

  /**
   * Terminate the process immediately
   *
   * Signal sequence:
   * 1. Send SIGTERM (graceful shutdown)
   * 2. Wait 5 seconds
   * 3. Send SIGKILL (force kill)
   *
   * @example
   * handle.kill();  // Gracefully terminates, then forcefully if needed
   */
  kill: () => void;

  /**
   * Check if the process is still running
   *
   * @returns true if process is alive, false if exited or killed
   * @example
   * if (handle.isRunning()) {
   *   handle.kill();
   * }
   */
  isRunning: () => boolean;

  /**
   * Reference to the underlying stdin stream (optional)
   *
   * Advanced usage: For piping or direct stream manipulation
   * Prefer sendInput() for normal use cases
   */
  stdin?: NodeJS.WritableStream;

  /**
   * Reference to the underlying stdout stream (optional)
   *
   * Advanced usage: For piping or direct stream manipulation
   * Prefer onData() for normal use cases
   */
  stdout?: NodeJS.ReadableStream;

  /**
   * Reference to the underlying stderr stream (optional)
   *
   * Advanced usage: For piping or direct stream manipulation
   * Prefer onError() for normal use cases
   */
  stderr?: NodeJS.ReadableStream;

  /**
   * Get the current exit code (only valid after process exits)
   *
   * @returns The exit code, or undefined if still running
   */
  getExitCode: () => number | undefined;

  /**
   * Get the process ID
   *
   * @returns The PID of the spawned process
   */
  getPID: () => number | undefined;
}

/**
 * SpawnOptions: Configuration for ProcessHandle.spawn()
 */
export interface SpawnOptions {
  /**
   * Working directory for the process
   * @default process.cwd()
   */
  cwd?: string;

  /**
   * Environment variables for the process
   * @default process.env
   */
  env?: NodeJS.ProcessEnv;

  /**
   * Shell to use (e.g., '/bin/bash', 'cmd.exe')
   * @default undefined (no shell)
   */
  shell?: boolean | string;

  /**
   * Timeout in milliseconds before auto-killing process
   * @default 30000 (30 seconds)
   */
  timeout?: number;

  /**
   * Maximum buffer size for stdout/stderr
   * @default 10MB (10 * 1024 * 1024 bytes)
   */
  maxBuffer?: number;

  /**
   * Enable echo of user input (for debugging)
   * @default false
   */
  echo?: boolean;
}

/**
 * ProcessStartOptions: Used internally by AsyncCommandRunner
 */
export interface ProcessStartOptions extends SpawnOptions {
  /** Command to execute */
  command: string;

  /** Arguments to pass to command */
  args?: string[];
}
