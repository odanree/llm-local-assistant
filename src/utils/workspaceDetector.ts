/**
 * WorkspaceDetector: Scan parent folders for multiple workspaces
 *
 * Solves multi-workspace problem: When user has multiple project folders,
 * detect them and ask user which one to use instead of guessing.
 * 
 * Pattern Detection:
 * - package.json + tsconfig.json (TypeScript project)
 * - package.json + .vscode/settings.json (VS Code workspace)
 * - src/ + tests/ folders (project structure)
 * - .git folder (git repository)
 */

import * as path from 'path';
import { IFileSystem } from '../providers/IFileSystem';
import { FileSystemProvider } from '../providers/FileSystemProvider';

export interface DetectedWorkspace {
  path: string; // Absolute path
  name: string; // Folder name
  type: 'typescript' | 'node' | 'general';
  confidence: number; // 0.0-1.0 (how sure we are this is a real project)
  indicators: string[]; // What markers were found
}

export class WorkspaceDetector {
  constructor(private fs: IFileSystem = new FileSystemProvider()) {}

  /**
   * Scan parent folder for multiple workspaces
   * Returns array of detected workspaces sorted by confidence
   */
  findWorkspaces(startPath: string, maxDepth: number = 2): DetectedWorkspace[] {
    const workspaces: DetectedWorkspace[] = [];
    const root = this.findProjectRoot(startPath);

    console.log('[WorkspaceDetector] Scanning from:', root);
    console.log('[WorkspaceDetector] Start path was:', startPath);

    // Check immediate children
    try {
      const entries = this.fs.readdirSync(root, { withFileTypes: true });
      console.log('[WorkspaceDetector] Found entries:', entries.map(e => e.name));

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) {
          console.log(`[WorkspaceDetector] Skipping: ${entry.name} (not dir or hidden)`);
          continue;
        }

        const fullPath = path.join(root, entry.name);
        const workspace = this.analyzeFolder(fullPath, entry.name);

        if (workspace) {
          console.log(`[WorkspaceDetector] Detected: ${entry.name}`, {
            type: workspace.type,
            confidence: workspace.confidence.toFixed(2),
            indicators: workspace.indicators,
          });

          if (workspace.confidence > 0.3) {
            workspaces.push(workspace);
          } else {
            console.log(`[WorkspaceDetector] Filtered out (confidence ${workspace.confidence.toFixed(2)} < 0.3): ${entry.name}`);
          }
        }
      }
    } catch (err) {
      console.warn('[WorkspaceDetector] Scan error:', err);
    }

    // Sort by confidence
    workspaces.sort((a, b) => b.confidence - a.confidence);
    console.log(`[WorkspaceDetector] Final result: ${workspaces.length} workspaces`, 
      workspaces.map(w => ({ name: w.name, confidence: w.confidence.toFixed(2) }))
    );

    return workspaces;
  }

  /**
   * Analyze a folder to determine if it's a workspace
   */
  private analyzeFolder(folderPath: string, folderName: string): DetectedWorkspace | null {
    const indicators: string[] = [];
    let confidence = 0;

    // Check for package.json (node project)
    try {
      if (this.fs.existsSync(path.join(folderPath, 'package.json'))) {
        indicators.push('package.json');
        confidence += 0.4;
      }
    } catch {
      // Ignore errors during existence checks
    }

    // Check for tsconfig.json (TypeScript project)
    try {
      if (this.fs.existsSync(path.join(folderPath, 'tsconfig.json'))) {
        indicators.push('tsconfig.json');
        confidence += 0.3;
      }
    } catch {
      // Ignore errors during existence checks
    }

    // Check for .vscode/settings.json (VS Code workspace)
    try {
      if (this.fs.existsSync(path.join(folderPath, '.vscode/settings.json'))) {
        indicators.push('.vscode/settings.json');
        confidence += 0.2;
      }
    } catch {
      // Ignore errors during existence checks
    }

    // Check for src folder (project structure)
    try {
      if (this.fs.existsSync(path.join(folderPath, 'src'))) {
        indicators.push('src/');
        confidence += 0.1;
      }
    } catch {
      // Ignore errors during existence checks
    }

    // Check for .git folder (git repository)
    try {
      if (this.fs.existsSync(path.join(folderPath, '.git'))) {
        indicators.push('.git/');
        confidence += 0.2;
      }
    } catch {
      // Ignore errors during existence checks
    }

    // Check for common source file patterns
    const hasSourceFiles = this.hasSourceFiles(folderPath);
    if (hasSourceFiles) {
      indicators.push('source-files');
      confidence += 0.1;
    }

    // Determine type
    let type: 'typescript' | 'node' | 'general' = 'general';
    if (indicators.includes('tsconfig.json')) {
      type = 'typescript';
    } else if (indicators.includes('package.json')) {
      type = 'node';
    }

    // If confidence is too low, don't report it as workspace
    if (confidence < 0.3) {
      return null;
    }

    return {
      path: folderPath,
      name: folderName,
      type,
      confidence,
      indicators,
    };
  }

  /**
   * Check if folder has source files (.ts, .tsx, .js, .jsx)
   */
  private hasSourceFiles(folderPath: string): boolean {
    const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx'];

    try {
      const entries = this.fs.readdirSync(folderPath);

      for (const entry of entries) {
        const ext = path.extname(entry);
        if (sourceExtensions.includes(ext)) {
          return true;
        }
      }

      // Check immediate subdirectories
      const subdirs = entries
        .filter((e) => {
          try {
            return this.fs.statSync(path.join(folderPath, e)).isDirectory();
          } catch {
            return false;
          }
        })
        .slice(0, 3); // Only check first 3 subdirs

      for (const subdir of subdirs) {
        const subPath = path.join(folderPath, subdir);
        const subEntries = this.fs.readdirSync(subPath);
        for (const entry of subEntries) {
          const ext = path.extname(entry);
          if (sourceExtensions.includes(ext)) {
            return true;
          }
        }
      }
    } catch (err) {
      return false;
    }

    return false;
  }

  /**
   * Find the root folder to start scanning from
   * (walk up until we find a folder with multiple subfolders)
   */
  private findProjectRoot(startPath: string): string {
    let current = startPath;

    // Walk up to find a folder with multiple projects
    for (let i = 0; i < 3; i++) {
      const parent = path.dirname(current);
      if (parent === current) {break;} // Reached filesystem root

      // Count child workspaces in parent
      const children = this.countProjectChildren(parent);
      if (children >= 2) {
        return parent; // Found multi-project folder
      }

      current = parent;
    }

    // Default to the start path
    return startPath;
  }

  /**
   * Count how many child folders look like projects
   */
  private countProjectChildren(folderPath: string): number {
    try {
      const entries = this.fs.readdirSync(folderPath, { withFileTypes: true });
      let count = 0;

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) {continue;}

        const fullPath = path.join(folderPath, entry.name);
        const workspace = this.analyzeFolder(fullPath, entry.name);

        if (workspace && workspace.confidence > 0.3) {
          count++;
        }
      }

      return count;
    } catch {
      return 0;
    }
  }

  /**
   * Format workspaces for display (chat UI)
   */
  formatForDisplay(workspaces: DetectedWorkspace[]): string {
    if (workspaces.length === 0) {
      return 'No existing workspaces detected. Create a new one with `./src`?';
    }

    let display = `✅ **Detected ${workspaces.length} workspace(s):**\n\n`;
    display += '📁 **Which workspace should I create this in?**\n\n';

    for (let i = 0; i < workspaces.length; i++) {
      const ws = workspaces[i];
      const icon = ws.type === 'typescript' ? '📘' : ws.type === 'node' ? '📦' : '📂';
      const confidence =
        ws.confidence > 0.7 ? '✅' : ws.confidence > 0.5 ? '⚠️' : '❓';
      display += `${i + 1}️⃣  ${icon} ${ws.name} ${confidence}\n`;
    }

    display += `\n➕ **new** — Create \`./src\` in current folder\n\n`;
    display += `**Response:** [Type 1-${workspaces.length} or "new"]\n`;

    return display;
  }

  /**
   * Get workspace by index
   */
  getWorkspaceByIndex(workspaces: DetectedWorkspace[], index: number): DetectedWorkspace | null {
    if (index < 1 || index > workspaces.length) {
      return null;
    }
    return workspaces[index - 1];
  }
}
