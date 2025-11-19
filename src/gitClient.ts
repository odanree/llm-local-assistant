import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as util from 'util';

const exec = util.promisify(cp.exec);

export interface GitStatus {
  branch: string;
  stagedChanges: string[];
  unstagedChanges: string[];
  totalChanges: number;
  isDirty: boolean;
}

export interface GitDiff {
  summary: string;
  diff: string;
  filesChanged: string[];
}

/**
 * GitClient handles git operations and provides diffs for LLM analysis.
 * All operations are synchronous with the local git repository.
 */
export class GitClient {
  private workspaceFolder: vscode.Uri;

  constructor(workspaceFolder: vscode.Uri) {
    this.workspaceFolder = workspaceFolder;
  }

  /**
   * Get current git branch name
   */
  async getBranch(): Promise<string> {
    try {
      const { stdout } = await exec('git rev-parse --abbrev-ref HEAD', {
        cwd: this.workspaceFolder.fsPath,
      });
      return stdout.trim();
    } catch (err) {
      throw new Error('Failed to get git branch');
    }
  }

  /**
   * Get staged changes diff
   */
  async getStagedDiff(): Promise<GitDiff> {
    try {
      const { stdout: files } = await exec('git diff --cached --name-only', {
        cwd: this.workspaceFolder.fsPath,
      });
      const { stdout: diff } = await exec('git diff --cached', {
        cwd: this.workspaceFolder.fsPath,
      });

      const filesChanged = files
        .trim()
        .split('\n')
        .filter((f) => f.length > 0);
      const summary = this.summarizeDiff(diff);

      return {
        summary,
        diff: diff.substring(0, 5000), // Limit to 5KB for context
        filesChanged,
      };
    } catch (err) {
      throw new Error('Failed to get staged diff');
    }
  }

  /**
   * Get unstaged changes diff
   */
  async getUnstagedDiff(): Promise<GitDiff> {
    try {
      const { stdout: files } = await exec('git diff --name-only', {
        cwd: this.workspaceFolder.fsPath,
      });
      const { stdout: diff } = await exec('git diff', {
        cwd: this.workspaceFolder.fsPath,
      });

      const filesChanged = files
        .trim()
        .split('\n')
        .filter((f) => f.length > 0);
      const summary = this.summarizeDiff(diff);

      return {
        summary,
        diff: diff.substring(0, 5000),
        filesChanged,
      };
    } catch (err) {
      throw new Error('Failed to get unstaged diff');
    }
  }

  /**
   * Get all working directory changes (staged + unstaged)
   */
  async getAllChanges(): Promise<GitDiff> {
    try {
      const { stdout: files } = await exec('git diff HEAD --name-only', {
        cwd: this.workspaceFolder.fsPath,
      });
      const { stdout: diff } = await exec('git diff HEAD', {
        cwd: this.workspaceFolder.fsPath,
      });

      const filesChanged = files
        .trim()
        .split('\n')
        .filter((f) => f.length > 0);
      const summary = this.summarizeDiff(diff);

      return {
        summary,
        diff: diff.substring(0, 5000),
        filesChanged,
      };
    } catch (err) {
      throw new Error('Failed to get all changes');
    }
  }

  /**
   * Get git status
   */
  async getStatus(): Promise<GitStatus> {
    try {
      const branch = await this.getBranch();

      const { stdout: stagedOutput } = await exec(
        'git diff --cached --name-only',
        {
          cwd: this.workspaceFolder.fsPath,
        }
      );

      const { stdout: unstagedOutput } = await exec('git diff --name-only', {
        cwd: this.workspaceFolder.fsPath,
      });

      const stagedChanges = stagedOutput
        .trim()
        .split('\n')
        .filter((f) => f.length > 0);
      const unstagedChanges = unstagedOutput
        .trim()
        .split('\n')
        .filter((f) => f.length > 0);
      const totalChanges = new Set([...stagedChanges, ...unstagedChanges])
        .size;

      return {
        branch,
        stagedChanges,
        unstagedChanges,
        totalChanges,
        isDirty: totalChanges > 0,
      };
    } catch (err) {
      throw new Error('Failed to get git status');
    }
  }

  /**
   * Get last N commits
   */
  async getRecentCommits(count: number = 5): Promise<string[]> {
    try {
      const { stdout } = await exec(
        `git log --oneline -${count}`,
        {
          cwd: this.workspaceFolder.fsPath,
        }
      );
      return stdout.trim().split('\n').filter((line) => line.length > 0);
    } catch (err) {
      throw new Error('Failed to get recent commits');
    }
  }

  /**
   * Create a summary of what changed in a diff
   */
  private summarizeDiff(diff: string): string {
    const lines = diff.split('\n');
    let added = 0;
    let removed = 0;
    const filesChanged = new Set<string>();

    for (const line of lines) {
      if (line.startsWith('+++') || line.startsWith('---')) {
        const match = line.match(/b?\/(.*)/);
        if (match) {
          filesChanged.add(match[1]);
        }
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        added++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        removed++;
      }
    }

    const fileCount = filesChanged.size;
    return `${fileCount} file(s) changed: +${added} lines, -${removed} lines`;
  }
}
