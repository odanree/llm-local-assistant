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
    // Normalize all paths to use forward slashes for consistency across platforms
    this.files = new Map(
      Object.entries(config.files || {}).map(([path, content]) => [
        this.normalizePath(path),
        content,
      ])
    );
    this.directories = new Set(
      Array.from(config.directories || new Set(['/', '/tmp', '/home'])).map(
        (path) => this.normalizePath(path)
      )
    );
  }

  /**
   * Normalize path to use forward slashes (for cross-platform compatibility)
   */
  private normalizePath(path: string): string {
    return path.replace(/\\/g, '/');
  }

  readFileSync(filePath: string, encoding: string = 'utf-8'): string {
    const normalizedPath = this.normalizePath(filePath);
    // Check if should fail
    if (this.config.failOnRead?.some(p => this.normalizePath(p) === normalizedPath)) {
      throw new FileSystemError(
        this.config.readErrorCode || 'ENOENT',
        `Cannot read file: ${filePath}`,
        filePath
      );
    }

    // Check if file exists in mock
    if (!this.files.has(normalizedPath)) {
      throw new FileSystemError('ENOENT', `File not found: ${filePath}`, filePath);
    }

    return this.files.get(normalizedPath)!;
  }

  writeFileSync(filePath: string, content: string, encoding: string = 'utf-8'): void {
    const normalizedPath = this.normalizePath(filePath);
    // Check if should fail
    if (this.config.failOnWrite?.some(p => this.normalizePath(p) === normalizedPath)) {
      throw new FileSystemError(
        this.config.writeErrorCode || 'ENOSPC',
        `Cannot write file: ${filePath}`,
        filePath
      );
    }

    // Check parent directory exists
    const parentDir = this.dirname(normalizedPath);
    if (!this.directories.has(parentDir)) {
      throw new FileSystemError('ENOENT', `Parent directory not found: ${parentDir}`, filePath);
    }

    this.files.set(normalizedPath, content);
  }

  appendFileSync(filePath: string, content: string, encoding: string = 'utf-8'): void {
    const normalizedPath = this.normalizePath(filePath);
    if (this.config.failOnWrite?.some(p => this.normalizePath(p) === normalizedPath)) {
      throw new FileSystemError(
        this.config.writeErrorCode || 'ENOSPC',
        `Cannot append to file: ${filePath}`,
        filePath
      );
    }

    const existing = this.files.get(normalizedPath) || '';
    this.files.set(normalizedPath, existing + content);
  }

  deleteFileSync(filePath: string): void {
    const normalizedPath = this.normalizePath(filePath);
    if (this.config.failOnDelete?.some(p => this.normalizePath(p) === normalizedPath)) {
      throw new FileSystemError('EACCES', `Cannot delete file: ${filePath}`, filePath);
    }

    if (!this.files.has(normalizedPath)) {
      throw new FileSystemError('ENOENT', `File not found: ${filePath}`, filePath);
    }

    this.files.delete(normalizedPath);
  }

  existsSync(filePath: string): boolean {
    const normalizedPath = this.normalizePath(filePath);
    return this.files.has(normalizedPath) || this.directories.has(normalizedPath);
  }

  mkdirSync(dirPath: string, options?: { recursive?: boolean }): void {
    const normalizedPath = this.normalizePath(dirPath);
    if (this.config.failOnMkdir?.some(p => this.normalizePath(p) === normalizedPath)) {
      throw new FileSystemError('EACCES', `Cannot create directory: ${dirPath}`, dirPath);
    }

    if (this.directories.has(normalizedPath)) {
      if (!options?.recursive) {
        throw new FileSystemError('EEXIST', `Directory already exists: ${dirPath}`, dirPath);
      }
      return;
    }

    if (options?.recursive) {
      // Create all parent directories
      const parts = normalizedPath.split('/');
      let current = '';
      for (const part of parts) {
        if (!part) continue;
        current += '/' + part;
        this.directories.add(current);
      }
    } else {
      const parentDir = this.dirname(normalizedPath);
      if (!this.directories.has(parentDir)) {
        throw new FileSystemError('ENOENT', `Parent directory not found: ${parentDir}`, dirPath);
      }
    }

    this.directories.add(normalizedPath);
  }

  readdirSync(dirPath: string, options?: { withFileTypes?: false }): string[];
  readdirSync(dirPath: string, options: { withFileTypes: true }): Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  readdirSync(dirPath: string, options?: { withFileTypes?: boolean }): string[] | Array<{ name: string; isDirectory(): boolean; isFile(): boolean }> {
    const normalizedDir = this.normalizePath(dirPath);
    if (!this.directories.has(normalizedDir)) {
      throw new FileSystemError('ENOENT', `Directory not found: ${dirPath}`, dirPath);
    }

    const prefix = normalizedDir.endsWith('/') ? normalizedDir : normalizedDir + '/';
    const entries = new Map<string, { isDir: boolean }>();

    // Find files in this directory
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(prefix)) {
        const relative = filePath.substring(prefix.length);
        const firstPart = relative.split('/')[0];
        entries.set(firstPart, { isDir: false });
      }
    }

    // Find subdirectories
    for (const dir of this.directories) {
      if (dir.startsWith(prefix) && dir !== normalizedDir) {
        const relative = dir.substring(prefix.length);
        const firstPart = relative.split('/')[0];
        entries.set(firstPart, { isDir: true });
      }
    }

    if (options?.withFileTypes) {
      return Array.from(entries.entries()).map(([name, info]) => ({
        name,
        isDirectory: () => info.isDir,
        isFile: () => !info.isDir,
      }));
    }

    return Array.from(entries.keys());
  }

  statSync(filePath: string): {
    isDirectory(): boolean;
    isFile(): boolean;
    size: number;
    mtime: Date;
  } {
    const normalizedPath = this.normalizePath(filePath);
    if (this.directories.has(normalizedPath)) {
      return {
        isDirectory: () => true,
        isFile: () => false,
        size: 0,
        mtime: new Date(),
      };
    }

    if (this.files.has(normalizedPath)) {
      const content = this.files.get(normalizedPath)!;
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
    const normalizedSrc = this.normalizePath(src);
    if (!this.files.has(normalizedSrc)) {
      throw new FileSystemError('ENOENT', `Source file not found: ${src}`, src);
    }

    const content = this.files.get(normalizedSrc)!;
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
    const normalizedPath = this.normalizePath(path);
    const parentDir = this.dirname(normalizedPath);
    this.mkdirSync(parentDir, { recursive: true });
    this.files.set(normalizedPath, content);
  }

  /**
   * Helper: Get all files in mock
   */
  getAllFiles(): Map<string, string> {
    return new Map(this.files);
  }
}
