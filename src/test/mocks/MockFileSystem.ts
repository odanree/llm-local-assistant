/**
 * MockFileSystem: Test implementation of IFileSystem with fault injection
 *
 * Enables testing of error handling paths that are difficult to reach:
 * - Disk Full errors (ENOSPC)
 * - Permission Denied errors (EACCES)
 * - File Not Found errors (ENOENT)
 * - etc.
 */

import { IFileSystem, FileSystemError } from '../../providers/IFileSystem';

export interface MockFileSystemConfig {
  // Throw error on these paths
  failOnRead?: string[];
  failOnWrite?: string[];
  failOnDelete?: string[];
  failOnMkdir?: string[];

  // Specific error types to throw
  readErrorCode?: string; // e.g., 'ENOENT', 'EACCES'
  writeErrorCode?: string; // e.g., 'ENOSPC', 'EACCES'

  // File contents in memory
  files?: Record<string, string>;

  // Existing directories
  directories?: Set<string>;
}

export class MockFileSystem implements IFileSystem {
  private files: Map<string, string>;
  private directories: Set<string>;
  private config: MockFileSystemConfig;

  constructor(config: MockFileSystemConfig = {}) {
    this.config = config;
    this.files = new Map(Object.entries(config.files || {}));
    this.directories = config.directories || new Set(['/', '/tmp', '/home']);
  }

  readFileSync(filePath: string, encoding: string = 'utf-8'): string {
    // Check if should fail
    if (this.config.failOnRead?.includes(filePath)) {
      throw new FileSystemError(
        this.config.readErrorCode || 'ENOENT',
        `Cannot read file: ${filePath}`,
        filePath
      );
    }

    // Check if file exists in mock
    if (!this.files.has(filePath)) {
      throw new FileSystemError('ENOENT', `File not found: ${filePath}`, filePath);
    }

    return this.files.get(filePath)!;
  }

  writeFileSync(filePath: string, content: string, encoding: string = 'utf-8'): void {
    // Check if should fail
    if (this.config.failOnWrite?.includes(filePath)) {
      throw new FileSystemError(
        this.config.writeErrorCode || 'ENOSPC',
        `Cannot write file: ${filePath}`,
        filePath
      );
    }

    // Check parent directory exists
    const parentDir = this.dirname(filePath);
    if (!this.directories.has(parentDir)) {
      throw new FileSystemError('ENOENT', `Parent directory not found: ${parentDir}`, filePath);
    }

    this.files.set(filePath, content);
  }

  appendFileSync(filePath: string, content: string, encoding: string = 'utf-8'): void {
    if (this.config.failOnWrite?.includes(filePath)) {
      throw new FileSystemError(
        this.config.writeErrorCode || 'ENOSPC',
        `Cannot append to file: ${filePath}`,
        filePath
      );
    }

    const existing = this.files.get(filePath) || '';
    this.files.set(filePath, existing + content);
  }

  deleteFileSync(filePath: string): void {
    if (this.config.failOnDelete?.includes(filePath)) {
      throw new FileSystemError('EACCES', `Cannot delete file: ${filePath}`, filePath);
    }

    if (!this.files.has(filePath)) {
      throw new FileSystemError('ENOENT', `File not found: ${filePath}`, filePath);
    }

    this.files.delete(filePath);
  }

  existsSync(filePath: string): boolean {
    return this.files.has(filePath) || this.directories.has(filePath);
  }

  mkdirSync(dirPath: string, options?: { recursive?: boolean }): void {
    if (this.config.failOnMkdir?.includes(dirPath)) {
      throw new FileSystemError('EACCES', `Cannot create directory: ${dirPath}`, dirPath);
    }

    if (this.directories.has(dirPath)) {
      if (!options?.recursive) {
        throw new FileSystemError('EEXIST', `Directory already exists: ${dirPath}`, dirPath);
      }
      return;
    }

    if (options?.recursive) {
      // Create all parent directories
      const parts = dirPath.split('/');
      let current = '';
      for (const part of parts) {
        if (!part) continue;
        current += '/' + part;
        this.directories.add(current);
      }
    } else {
      const parentDir = this.dirname(dirPath);
      if (!this.directories.has(parentDir)) {
        throw new FileSystemError('ENOENT', `Parent directory not found: ${parentDir}`, dirPath);
      }
    }

    this.directories.add(dirPath);
  }

  readdirSync(dirPath: string): string[] {
    if (!this.directories.has(dirPath)) {
      throw new FileSystemError('ENOENT', `Directory not found: ${dirPath}`, dirPath);
    }

    const prefix = dirPath.endsWith('/') ? dirPath : dirPath + '/';
    const entries = new Set<string>();

    // Find files in this directory
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(prefix)) {
        const relative = filePath.substring(prefix.length);
        const firstPart = relative.split('/')[0];
        entries.add(firstPart);
      }
    }

    // Find subdirectories
    for (const dir of this.directories) {
      if (dir.startsWith(prefix) && dir !== dirPath) {
        const relative = dir.substring(prefix.length);
        const firstPart = relative.split('/')[0];
        entries.add(firstPart);
      }
    }

    return Array.from(entries);
  }

  statSync(filePath: string): {
    isDirectory(): boolean;
    isFile(): boolean;
    size: number;
    mtime: Date;
  } {
    if (this.directories.has(filePath)) {
      return {
        isDirectory: () => true,
        isFile: () => false,
        size: 0,
        mtime: new Date(),
      };
    }

    if (this.files.has(filePath)) {
      const content = this.files.get(filePath)!;
      return {
        isDirectory: () => false,
        isFile: () => true,
        size: content.length,
        mtime: new Date(),
      };
    }

    throw new FileSystemError('ENOENT', `File not found: ${filePath}`, filePath);
  }

  copyFileSync(src: string, dest: string): void {
    if (!this.files.has(src)) {
      throw new FileSystemError('ENOENT', `Source file not found: ${src}`, src);
    }

    const content = this.files.get(src)!;
    this.writeFileSync(dest, content);
  }

  resolve(...paths: string[]): string {
    return paths.join('/').replace(/\/+/g, '/');
  }

  dirname(filePath: string): string {
    const parts = filePath.split('/');
    parts.pop();
    return parts.join('/') || '/';
  }

  basename(filePath: string, ext?: string): string {
    const parts = filePath.split('/');
    let name = parts[parts.length - 1] || '';
    if (ext && name.endsWith(ext)) {
      name = name.substring(0, name.length - ext.length);
    }
    return name;
  }

  join(...paths: string[]): string {
    return paths.join('/').replace(/\/+/g, '/');
  }

  /**
   * Helper: Set up mock to fail on specific operations
   */
  setFailureMode(operation: 'read' | 'write' | 'delete' | 'mkdir', path: string, errorCode: string = 'EACCES'): void {
    switch (operation) {
      case 'read':
        this.config.failOnRead = [...(this.config.failOnRead || []), path];
        this.config.readErrorCode = errorCode;
        break;
      case 'write':
        this.config.failOnWrite = [...(this.config.failOnWrite || []), path];
        this.config.writeErrorCode = errorCode;
        break;
      case 'delete':
        this.config.failOnDelete = [...(this.config.failOnDelete || []), path];
        break;
      case 'mkdir':
        this.config.failOnMkdir = [...(this.config.failOnMkdir || []), path];
        break;
    }
  }

  /**
   * Helper: Add file to mock
   */
  addFile(path: string, content: string): void {
    const parentDir = this.dirname(path);
    this.mkdirSync(parentDir, { recursive: true });
    this.files.set(path, content);
  }

  /**
   * Helper: Get all files in mock
   */
  getAllFiles(): Map<string, string> {
    return new Map(this.files);
  }
}
