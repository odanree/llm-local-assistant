/**
 * IFileSystem: Dependency Injection interface for file system operations
 *
 * Purpose: Enable dependency injection of file system operations to support:
 * - Mock file systems for testing error paths (Disk Full, Permission Denied, etc.)
 * - Alternative implementations (in-memory, cloud storage, etc.)
 * - Better error handling and recovery strategies
 *
 * Design Pattern: Strategy pattern for side effects
 */

export interface IFileSystem {
  /**
   * Read file contents synchronously
   * @throws Error if file not found, permission denied, etc.
   */
  readFileSync(path: string, encoding?: string): string;

  /**
   * Write file contents synchronously
   * @throws Error if disk full, permission denied, etc.
   */
  writeFileSync(path: string, content: string, encoding?: string): void;

  /**
   * Append to file synchronously
   * @throws Error if disk full, permission denied, etc.
   */
  appendFileSync(path: string, content: string, encoding?: string): void;

  /**
   * Delete file synchronously
   * @throws Error if file not found, permission denied, etc.
   */
  deleteFileSync(path: string): void;

  /**
   * Check if file/directory exists
   */
  existsSync(path: string): boolean;

  /**
   * Create directory recursively
   * @throws Error if permission denied, etc.
   */
  mkdirSync(path: string, options?: { recursive?: boolean }): void;

  /**
   * Read directory contents
   * @throws Error if not a directory, permission denied, etc.
   */
  readdirSync(path: string): string[];

  /**
   * Get file stats
   * @throws Error if file not found, permission denied, etc.
   */
  statSync(path: string): {
    isDirectory(): boolean;
    isFile(): boolean;
    size: number;
    mtime: Date;
  };

  /**
   * Copy file synchronously
   * @throws Error if source not found, disk full, etc.
   */
  copyFileSync(src: string, dest: string): void;

  /**
   * Resolve absolute path
   */
  resolve(...paths: string[]): string;

  /**
   * Get directory name from path
   */
  dirname(path: string): string;

  /**
   * Get base name from path
   */
  basename(path: string, ext?: string): string;

  /**
   * Join path segments
   */
  join(...paths: string[]): string;
}

/**
 * Error types that can be thrown by file system operations
 * Used for testing error scenarios
 */
export class FileSystemError extends Error {
  constructor(
    public code: string, // 'ENOENT', 'EACCES', 'ENOSPC', etc.
    message: string,
    public path?: string
  ) {
    super(message);
    this.name = 'FileSystemError';
  }
}
