/**
 * FileSystemProvider: Implementation of IFileSystem using Node.js fs module
 *
 * Real implementation that directly wraps fs operations
 * In production: Uses actual file system
 * In tests: Can be replaced with MockFileSystem for error injection
 */

import * as fs from 'fs';
import * as path from 'path';
import { IFileSystem, FileSystemError } from './IFileSystem';

export class FileSystemProvider implements IFileSystem {
  readFileSync(filePath: string, encoding: string = 'utf-8'): string {
    try {
      return fs.readFileSync(filePath, { encoding: encoding as BufferEncoding });
    } catch (error) {
      this.throwFileSystemError(error as NodeJS.ErrnoException, filePath);
    }
  }

  writeFileSync(filePath: string, content: string, encoding: string = 'utf-8'): void {
    try {
      fs.writeFileSync(filePath, content, { encoding: encoding as BufferEncoding });
    } catch (error) {
      this.throwFileSystemError(error as NodeJS.ErrnoException, filePath);
    }
  }

  appendFileSync(filePath: string, content: string, encoding: string = 'utf-8'): void {
    try {
      fs.appendFileSync(filePath, content, { encoding: encoding as BufferEncoding });
    } catch (error) {
      this.throwFileSystemError(error as NodeJS.ErrnoException, filePath);
    }
  }

  deleteFileSync(filePath: string): void {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      this.throwFileSystemError(error as NodeJS.ErrnoException, filePath);
    }
  }

  existsSync(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  mkdirSync(dirPath: string, options?: { recursive?: boolean }): void {
    try {
      fs.mkdirSync(dirPath, options);
    } catch (error) {
      this.throwFileSystemError(error as NodeJS.ErrnoException, dirPath);
    }
  }

  readdirSync(dirPath: string, options?: { withFileTypes?: false }): string[];
  readdirSync(dirPath: string, options: { withFileTypes: true }): Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  readdirSync(dirPath: string, options?: { withFileTypes?: boolean }): string[] | Array<{ name: string; isDirectory(): boolean; isFile(): boolean }> {
    try {
      if (options?.withFileTypes) {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        return entries.map(entry => ({
          name: entry.name,
          isDirectory: () => entry.isDirectory(),
          isFile: () => entry.isFile(),
        }));
      }
      return fs.readdirSync(dirPath);
    } catch (error) {
      this.throwFileSystemError(error as NodeJS.ErrnoException, dirPath);
    }
  }

  statSync(filePath: string): {
    isDirectory(): boolean;
    isFile(): boolean;
    size: number;
    mtime: Date;
  } {
    try {
      const stats = fs.statSync(filePath);
      return {
        isDirectory: () => stats.isDirectory(),
        isFile: () => stats.isFile(),
        size: stats.size,
        mtime: stats.mtime,
      };
    } catch (error) {
      this.throwFileSystemError(error as NodeJS.ErrnoException, filePath);
    }
  }

  copyFileSync(src: string, dest: string): void {
    try {
      fs.copyFileSync(src, dest);
    } catch (error) {
      this.throwFileSystemError(error as NodeJS.ErrnoException, src);
    }
  }

  resolve(...paths: string[]): string {
    return path.resolve(...paths);
  }

  dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  basename(filePath: string, ext?: string): string {
    return path.basename(filePath, ext);
  }

  join(...paths: string[]): string {
    return path.join(...paths);
  }

  /**
   * Convert Node.js error to FileSystemError
   */
  private throwFileSystemError(error: NodeJS.ErrnoException, filePath: string): never {
    const code = error.code || 'UNKNOWN';
    const message = error.message || `File system error on ${filePath}`;
    throw new FileSystemError(code, message, filePath);
  }
}
