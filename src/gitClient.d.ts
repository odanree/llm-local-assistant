import * as vscode from 'vscode';
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
export declare class GitClient {
    private workspaceFolder;
    constructor(workspaceFolder: vscode.Uri);
    /**
     * Get current git branch name
     */
    getBranch(): Promise<string>;
    /**
     * Get staged changes diff
     */
    getStagedDiff(): Promise<GitDiff>;
    /**
     * Get unstaged changes diff
     */
    getUnstagedDiff(): Promise<GitDiff>;
    /**
     * Get all working directory changes (staged + unstaged)
     */
    getAllChanges(): Promise<GitDiff>;
    /**
     * Get git status
     */
    getStatus(): Promise<GitStatus>;
    /**
     * Get last N commits
     */
    getRecentCommits(count?: number): Promise<string[]>;
    /**
     * Create a summary of what changed in a diff
     */
    private summarizeDiff;
}
//# sourceMappingURL=gitClient.d.ts.map