/**
 * GenerationModeDetector: "Brain" for ContextBuilder
 * 
 * Purpose: Provide deterministic context about project structure
 * so LLM doesn't guess (or hallucinate) the tech stack.
 * 
 * Danh's insight: LLM ambiguity comes from blank-slate context.
 * By detecting tsconfig.json, package.json, etc., we ground the LLM.
 * 
 * This utility runs FIRST in ContextBuilder pipeline.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface ProjectContext {
  /** DIFF_MODE for mature projects, SCAFFOLD_MODE for minimal */
  strategy: 'DIFF_MODE' | 'SCAFFOLD_MODE';
  
  /** .tsx for TypeScript, .jsx for JavaScript */
  extension: '.tsx' | '.jsx' | '.ts' | '.js';
  
  /** src/ for mature, ./ for minimal */
  root: string;
  
  /** TypeScript or JavaScript */
  language: 'TypeScript' | 'JavaScript';
  
  /** Additional flags for LLM context */
  flags: {
    hasTests: boolean;
    hasPackageJson: boolean;
    hasTsConfig: boolean;
    hasGit: boolean;
    isMinimalProject: boolean; // No package.json or tsconfig
  };
}

export class GenerationModeDetector {
  /**
   * Detect project context from workspace structure
   * 
   * Strategy: Check for tsconfig.json and package.json to determine
   * - Language (TypeScript vs JavaScript)
   * - Mode (DIFF_MODE vs SCAFFOLD_MODE)
   * - Root directory convention
   * - File extension pattern
   */
  static async detectContext(workspacePath: string): Promise<ProjectContext> {
    // Check for key files
    const hasTsConfig = await this.fileExists(
      path.join(workspacePath, 'tsconfig.json')
    );
    const hasPackageJson = await this.fileExists(
      path.join(workspacePath, 'package.json')
    );
    const hasTests = await this.fileExists(
      path.join(workspacePath, 'src')
    ) && await this.directoryHasTests(path.join(workspacePath, 'src'));
    const hasGit = await this.fileExists(
      path.join(workspacePath, '.git')
    );

    // Determine language
    const language = hasTsConfig ? 'TypeScript' : 'JavaScript';
    
    // Determine extension
    let extension: '.tsx' | '.jsx' | '.ts' | '.js' = '.jsx';
    if (hasTsConfig) {
      extension = '.tsx'; // TypeScript React
    }

    // Determine strategy
    // Mature project: Has package.json (dependencies managed)
    // Minimal project: No package.json (single file or manual imports)
    const strategy = hasPackageJson ? 'DIFF_MODE' : 'SCAFFOLD_MODE';

    // Determine root directory
    // Mature projects use src/, minimal use ./
    const root = hasPackageJson ? 'src/' : './';

    // Check if minimal project (no package.json, no tsconfig)
    const isMinimalProject = !hasPackageJson && !hasTsConfig;

    return {
      strategy,
      extension,
      root,
      language,
      flags: {
        hasTests,
        hasPackageJson,
        hasTsConfig,
        hasGit,
        isMinimalProject,
      },
    };
  }

  /**
   * Check if a file exists
   */
  private static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if directory has test files
   */
  private static async directoryHasTests(dirPath: string): Promise<boolean> {
    try {
      const files = await fs.readdir(dirPath);
      return files.some(f => 
        f.includes('.test.') || 
        f.includes('.spec.') ||
        f === '__tests__'
      );
    } catch {
      return false;
    }
  }

  /**
   * Format context for prompt injection
   * 
   * Returns a string that can be injected into system prompt
   */
  static formatPromptInjection(context: ProjectContext): string {
    return `
ENVIRONMENT_CONTEXT:
- Language: ${context.language}
- Strategy: ${context.strategy}
- File Extension: ${context.extension}
- Root Directory: ${context.root}
- Project Type: ${context.flags.isMinimalProject ? 'MINIMAL' : 'MATURE'}
- Has Tests: ${context.flags.hasTests}
- Has Package.json: ${context.flags.hasPackageJson}
- Has tsconfig.json: ${context.flags.hasTsConfig}

PATH_RULES (MANDATORY):
1. All new files must use extension: ${context.extension}
2. All new files must be placed in: ${context.root}
3. FORBIDDEN: Placeholder paths like '/path/to/', 'your-project/', '{PROJECT_ROOT}/'
4. REQUIRED: Use absolute relative paths from workspace root

EXAMPLE VALID PATHS:
- src/components/Button.tsx
- src/hooks/useForm.ts
- src/utils/api.ts
- src/types/index.ts

EXAMPLE INVALID PATHS (FORBIDDEN):
- /path/to/Button.tsx (placeholder)
- your-project/Button.tsx (placeholder)
- Button.tsx (missing directory)
- components/Button.jsx (wrong extension)
`;
  }
}
