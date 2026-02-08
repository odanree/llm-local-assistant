/**
 * ContextBuilder - Extract project context for LLM awareness
 * 
 * Part of the "Stateful Correction" architecture (Phase 1 - v3.0 Relaunch)
 * 
 * Problem:
 * Cursor/Windsurf work better than the extension because they index the project.
 * When the LLM generates code, it doesn't know what dependencies are available
 * or what patterns are already in use. This leads to:
 * - Importing from wrong packages
 * - Not using available utilities
 * - Breaking existing patterns
 * 
 * Solution:
 * Before running /plan or /design-system, scan the project to build context:
 * 1. Read package.json (available dependencies)
 * 2. Scan source files for common imports (what patterns are used)
 * 3. Detect frameworks and libraries (React, Next, Vue, etc.)
 * 4. Inject this into system prompt so LLM knows what to use
 * 
 * Result: LLM generates imports for packages that actually exist
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ProjectDependencies {
  name: string;
  version?: string;
  description?: string;
  dependencies: Map<string, string>;
  devDependencies: Map<string, string>;
  framework?: string; // 'react', 'next', 'vue', 'angular', etc.
}

export interface ImportPattern {
  source: string;
  imports: Set<string>;
  frequency: number;
}

export interface ProjectContext {
  projectName: string;
  projectPath: string;
  dependencies: ProjectDependencies;
  commonImports: ImportPattern[];
  detectedFrameworks: string[];
  sourceFiles: string[];
}

export class ContextBuilder {
  /**
   * Build complete project context
   */
  static async buildContext(workspacePath: string): Promise<ProjectContext> {
    const projectName = path.basename(workspacePath);
    const packageJson = this.readPackageJson(workspacePath);
    const sourceFiles = this.findSourceFiles(workspacePath);
    const commonImports = this.analyzeImports(sourceFiles.slice(0, 20)); // Limit to 20 files
    const detectedFrameworks = this.detectFrameworks(packageJson);

    return {
      projectName,
      projectPath: workspacePath,
      dependencies: packageJson,
      commonImports: this.sortImportsByFrequency(commonImports),
      detectedFrameworks,
      sourceFiles,
    };
  }

  /**
   * Read and parse package.json
   */
  private static readPackageJson(workspacePath: string): ProjectDependencies {
    const packageJsonPath = path.join(workspacePath, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      return {
        name: 'unknown',
        dependencies: new Map(),
        devDependencies: new Map(),
      };
    }

    try {
      const content = fs.readFileSync(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);

      return {
        name: packageJson.name || 'unknown',
        version: packageJson.version,
        description: packageJson.description,
        dependencies: new Map(Object.entries(packageJson.dependencies || {})),
        devDependencies: new Map(Object.entries(packageJson.devDependencies || {})),
      };
    } catch (e) {
      console.error('Failed to parse package.json:', e);
      return {
        name: 'unknown',
        dependencies: new Map(),
        devDependencies: new Map(),
      };
    }
  }

  /**
   * Find TypeScript/JavaScript source files
   */
  private static findSourceFiles(workspacePath: string): string[] {
    const files: string[] = [];
    const sourceDir = this.getSourceDir(workspacePath);

    if (!fs.existsSync(sourceDir)) {
      return files;
    }

    const walkDir = (dir: string, maxDepth: number = 3, currentDepth: number = 0): void => {
      if (currentDepth > maxDepth) return;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walkDir(fullPath, maxDepth, currentDepth + 1);
          } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
            files.push(fullPath);
          }
        }
      } catch (e) {
        // Ignore permission errors
      }
    };

    walkDir(sourceDir);
    return files;
  }

  /**
   * Determine the source directory (src, app, components, lib, etc.)
   */
  private static getSourceDir(workspacePath: string): string {
    const possibleDirs = ['src', 'app', 'components', 'lib', 'pages'];

    for (const dir of possibleDirs) {
      const fullPath = path.join(workspacePath, dir);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    // Fallback to workspace root
    return workspacePath;
  }

  /**
   * Analyze imports from source files
   */
  private static analyzeImports(sourceFiles: string[]): ImportPattern[] {
    const importMap = new Map<string, ImportPattern>();

    for (const file of sourceFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const imports = this.extractImportsFromFile(content);

        // Use Array.from to handle Map iteration with es5 target
        const importEntries = Array.from(imports.entries());
        for (const [source, importSet] of importEntries) {
          if (!importMap.has(source)) {
            importMap.set(source, {
              source,
              imports: new Set(),
              frequency: 0,
            });
          }

          const pattern = importMap.get(source)!;
          const importArray = Array.from(importSet);
          for (let i = 0; i < importArray.length; i++) {
            pattern.imports.add(importArray[i]);
          }
          pattern.frequency++;
        }
      } catch (e) {
        // Skip files that can't be read
      }
    }

    return Array.from(importMap.values());
  }

  /**
   * Extract import statements from a file's content
   */
  private static extractImportsFromFile(content: string): Map<string, Set<string>> {
    const imports = new Map<string, Set<string>>();

    // Match import statements
    const importRegex =
      /import\s*(?:{([^}]+)}|(?:(\w+)(?:\s*,\s*{([^}]+)})?)|(?:\*\s+as\s+(\w+)))\s*from\s+['"]([^'"]+)['"]/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const source = match[5];
      const namedImports = match[1] || match[3] || '';
      const defaultImport = match[2];
      const namespaceImport = match[4];

      const importSet = new Set<string>();

      if (defaultImport) {
        importSet.add(defaultImport);
      }
      if (namespaceImport) {
        importSet.add(`* as ${namespaceImport}`);
      }
      if (namedImports) {
        namedImports.split(',').forEach((item) => {
          const trimmed = item.trim().split(' as ')[0].trim();
          if (trimmed) {
            importSet.add(trimmed);
          }
        });
      }

      if (importSet.size > 0) {
        imports.set(source, importSet);
      }
    }

    return imports;
  }

  /**
   * Detect frameworks from dependencies
   */
  private static detectFrameworks(deps: ProjectDependencies): string[] {
    const frameworks: string[] = [];

    if (deps.dependencies.has('react') || deps.devDependencies.has('react')) {
      frameworks.push('react');
    }
    if (deps.dependencies.has('next') || deps.devDependencies.has('next')) {
      frameworks.push('next');
    }
    if (deps.dependencies.has('vue')) {
      frameworks.push('vue');
    }
    if (deps.dependencies.has('@angular/core')) {
      frameworks.push('angular');
    }
    if (deps.dependencies.has('svelte')) {
      frameworks.push('svelte');
    }
    if (deps.dependencies.has('solid-js')) {
      frameworks.push('solid');
    }

    // UI libraries
    if (deps.dependencies.has('tailwindcss') || deps.devDependencies.has('tailwindcss')) {
      frameworks.push('tailwindcss');
    }
    if (deps.dependencies.has('@mui/material')) {
      frameworks.push('mui');
    }
    if (deps.dependencies.has('shadcn-ui') || deps.dependencies.has('@shadcn/ui')) {
      frameworks.push('shadcn-ui');
    }

    return frameworks;
  }

  /**
   * Sort imports by frequency
   */
  private static sortImportsByFrequency(patterns: ImportPattern[]): ImportPattern[] {
    return [...patterns].sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Generate a system prompt injection with project context
   */
  static generateContextPrompt(context: ProjectContext): string {
    let prompt = `# Project Context\n\n`;

    // Frameworks
    if (context.detectedFrameworks.length > 0) {
      prompt += `## Detected Frameworks\n`;
      context.detectedFrameworks.forEach((f) => {
        prompt += `- ${f}\n`;
      });
      prompt += `\n`;
    }

    // Dependencies
    if (context.dependencies.dependencies.size > 0) {
      prompt += `## Available Dependencies\n`;
      const deps = Array.from(context.dependencies.dependencies.keys()).slice(0, 20);
      deps.forEach((dep) => {
        prompt += `- ${dep}\n`;
      });
      if (context.dependencies.dependencies.size > 20) {
        prompt += `- ... and ${context.dependencies.dependencies.size - 20} more\n`;
      }
      prompt += `\n`;
    }

    // Common imports
    if (context.commonImports.length > 0) {
      prompt += `## Common Imports in This Project\n`;
      context.commonImports.slice(0, 10).forEach((pattern) => {
        const imports = Array.from(pattern.imports).join(', ');
        prompt += `- From \`${pattern.source}\`: ${imports}\n`;
      });
      prompt += `\n`;
    }

    // Instructions
    prompt += `## Guidelines\n`;
    prompt += `- Use ONLY the dependencies listed above. Do not import from packages not listed.\n`;
    prompt += `- Follow the import patterns shown above for consistency.\n`;
    prompt += `- When generating code, use the same libraries and patterns as the existing codebase.\n`;
    prompt += `\n`;

    return prompt;
  }
}
