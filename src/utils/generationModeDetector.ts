/**
 * GenerationModeDetector: Runtime detection of correct generation mode
 *
 * Problem: Context quality is detected upfront, but requirements change at runtime.
 * Solution: Check if target files exist. If not, fall back to scaffolding.
 *
 * Strategy:
 * 1. Try DIFF-MODE: Does target file exist? → Use diffs
 * 2. Fall through: Target file missing → Switch to SCAFFOLD-MODE
 * 3. Scaffold: Generate complete files + folder structure
 *
 * This enables graceful degradation when initial context assessment was wrong.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface GenerationModeResult {
  mode: 'diff-mode' | 'scaffold-mode';
  targetFiles: string[];
  missingFiles: string[];
  reason: string;
  shouldRetry: boolean; // Whether we should retry LLM with new prompt
}

export class GenerationModeDetector {
  /**
   * Detect optimal generation mode at runtime
   * When no diffs are parsed, or all target files are missing, switch to scaffold mode
   */
  static detectMode(
    projectRoot: string,
    diffs: any[] | undefined,
    hasSrcDirectory: boolean
  ): GenerationModeResult {
    // No diffs parsed → must scaffold
    if (!diffs || diffs.length === 0) {
      return {
        mode: 'scaffold-mode',
        targetFiles: [],
        missingFiles: [],
        reason: 'No structured diffs extracted from LLM. Switching to complete file generation.',
        shouldRetry: true,
      };
    }

    // If project has a src/ (or similar) directory, it's ready for diffs
    if (hasSrcDirectory) {
      return {
        mode: 'diff-mode',
        targetFiles: [],
        missingFiles: [],
        reason: 'Project has source directory structure. Using diff mode.',
        shouldRetry: false,
      };
    }

    // No source structure → Must scaffold
    return {
      mode: 'scaffold-mode',
      targetFiles: [],
      missingFiles: [],
      reason: 'No source directory found (no src/, app/, etc.). Switching to scaffolding mode.',
      shouldRetry: true,
    };
  }

  /**
   * Generate system prompt modifier based on detected mode
   * This instructs LLM on correct generation strategy
   */
  static generateModePrompt(mode: 'diff-mode' | 'scaffold-mode'): string {
    if (mode === 'diff-mode') {
      return `\n\n**Generation Mode: DIFF-MODE**
Your target is to modify EXISTING files. 
Use precise Search/Replace patterns:
- Search: [exact code to find]
- Replace: [new code]

Do NOT generate complete files. Only output precise diffs.`;
    } else {
      return `\n\n**Generation Mode: SCAFFOLD-MODE**
Target files don't exist yet. Generate COMPLETE files with full scaffolding:
- Create folder structure (src/components/, src/pages/, etc.)
- Generate all necessary files with complete, working code
- User will manually place files in project
- Output must be complete, self-contained code blocks

Do NOT use Search/Replace patterns. Generate whole files.`;
    }
  }

  /**
   * Check if a src/ or source directory exists
   */
  static hasSourceDirectory(projectRoot: string): boolean {
    const possibleSourceDirs = ['src', 'app', 'components', 'lib', 'source'];
    for (const dir of possibleSourceDirs) {
      if (fs.existsSync(path.join(projectRoot, dir))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get recommended location for scaffolded files
   */
  static getScaffoldLocation(projectRoot: string): string {
    const possibleDirs = ['src', 'app', 'components', 'lib', 'source'];
    for (const dir of possibleDirs) {
      const fullPath = path.join(projectRoot, dir);
      if (fs.existsSync(fullPath)) {
        return dir;
      }
    }
    // Default: return 'src' (may need to be created)
    return 'src';
  }
}

