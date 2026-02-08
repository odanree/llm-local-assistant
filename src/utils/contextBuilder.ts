/**
 * ContextBuilder: Pre-scan project for dependencies, imports, and patterns
 *
 * Part of Phase 1: Stateful Correction Architecture
 * Extracts project context before code generation to inform LLM
 *
 * Strategy: Read package.json, scan imports, detect frameworks/libraries
 * Inject into system prompt so LLM respects existing dependencies
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ProjectContext {
  dependencies: Map<string, string>;
  devDependencies: Map<string, string>;
  commonImports: string[];
  frameworks: string[];
  detectedPatterns: string[];
  summary: string;
}

export class ContextBuilder {
  /**
   * Build full project context from workspace
   */
  static buildContext(projectPath: string): ProjectContext {
    const context: ProjectContext = {
      dependencies: new Map(),
      devDependencies: new Map(),
      commonImports: [],
      frameworks: [],
      detectedPatterns: [],
      summary: '',
    };

    // Step 1: Read package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

        // Extract dependencies
        if (packageJson.dependencies) {
          for (const [name, version] of Object.entries(packageJson.dependencies)) {
            context.dependencies.set(name, version as string);
          }
        }

        // Extract dev dependencies
        if (packageJson.devDependencies) {
          for (const [name, version] of Object.entries(packageJson.devDependencies)) {
            context.devDependencies.set(name, version as string);
          }
        }
      } catch (error) {
        console.warn('Failed to parse package.json:', error);
      }
    }

    // Step 2: Detect frameworks
    context.frameworks = this.detectFrameworks(context.dependencies);

    // Step 3: Scan for common imports in source files
    context.commonImports = this.scanCommonImports(projectPath);

    // Step 4: Detect patterns (e.g., React, TypeScript, etc.)
    context.detectedPatterns = this.detectPatterns(projectPath, context);

    // Step 5: Generate summary for LLM injection
    context.summary = this.generateSummary(context);

    return context;
  }

  /**
   * Detect frameworks from dependencies
   */
  private static detectFrameworks(dependencies: Map<string, string>): string[] {
    const frameworks: string[] = [];

    const frameworkMap: Record<string, string[]> = {
      React: ['react', 'react-dom'],
      Vue: ['vue'],
      Angular: ['@angular/core'],
      Svelte: ['svelte'],
      Next: ['next'],
      Nuxt: ['nuxt'],
      Remix: ['@remix-run/react'],
      Gatsby: ['gatsby'],
      Express: ['express'],
      NestJS: ['@nestjs/core'],
      Rails: ['rails'],
      Django: ['django'],
      FastAPI: ['fastapi'],
    };

    for (const [framework, packages] of Object.entries(frameworkMap)) {
      if (packages.some(pkg => dependencies.has(pkg))) {
        frameworks.push(framework);
      }
    }

    return frameworks;
  }

  /**
   * Scan source files for common import patterns
   */
  private static scanCommonImports(projectPath: string): string[] {
    const imports = new Set<string>();

    const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx'];
    const sourceDirs = ['src', 'app', 'lib', 'components'];

    for (const dir of sourceDirs) {
      const dirPath = path.join(projectPath, dir);
      if (!fs.existsSync(dirPath)) continue;

      try {
        const files = this.walkDir(dirPath, sourceExtensions);

        for (const file of files.slice(0, 20)) {
          // Sample first 20 files to avoid slowdown
          try {
            const content = fs.readFileSync(file, 'utf-8');
            const importMatches = content.match(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g) || [];

            for (const match of importMatches) {
              const moduleMatch = match.match(/from\s+['"]([^'"]+)['"]/);
              if (moduleMatch) {
                imports.add(moduleMatch[1]);
              }
            }
          } catch {
            // Skip files that can't be read
          }
        }
      } catch {
        // Skip directories that can't be read
      }
    }

    // Return top 30 imports (limit to avoid token bloat)
    return Array.from(imports)
      .sort()
      .slice(0, 30);
  }

  /**
   * Detect patterns (TypeScript, Testing, etc.)
   */
  private static detectPatterns(projectPath: string, context: ProjectContext): string[] {
    const patterns: string[] = [];

    // Check for TypeScript
    const tsConfigPath = path.join(projectPath, 'tsconfig.json');
    if (fs.existsSync(tsConfigPath)) {
      patterns.push('TypeScript');
    }

    // Check for Jest/Vitest
    if (context.devDependencies.has('jest') || context.devDependencies.has('vitest')) {
      patterns.push('Unit Testing');
    }

    // Check for ESLint
    if (context.devDependencies.has('eslint')) {
      patterns.push('Linting');
    }

    // Check for Prettier
    if (context.devDependencies.has('prettier')) {
      patterns.push('Code Formatting');
    }

    // Check for Webpack/Vite
    if (context.devDependencies.has('webpack') || context.devDependencies.has('vite')) {
      patterns.push('Module Bundling');
    }

    // Check if React project
    if (context.frameworks.includes('React')) {
      if (context.commonImports.some(imp => imp.includes('react-router'))) {
        patterns.push('React Router');
      }
      if (context.commonImports.some(imp => imp.includes('redux') || imp.includes('zustand') || imp.includes('jotai'))) {
        patterns.push('State Management');
      }
    }

    return patterns;
  }

  /**
   * Generate AI-friendly summary for system prompt injection
   */
  private static generateSummary(context: ProjectContext): string {
    const parts: string[] = [];

    // Frameworks
    if (context.frameworks.length > 0) {
      parts.push(`Frameworks: ${context.frameworks.join(', ')}`);
    }

    // Key dependencies
    const keyDeps = Array.from(context.dependencies.keys())
      .filter(dep => !dep.startsWith('@') && dep.length > 3)
      .slice(0, 10)
      .join(', ');
    if (keyDeps) {
      parts.push(`Key Dependencies: ${keyDeps}`);
    }

    // Patterns
    if (context.detectedPatterns.length > 0) {
      parts.push(`Detected Patterns: ${context.detectedPatterns.join(', ')}`);
    }

    // Common imports
    if (context.commonImports.length > 0) {
      const imports = context.commonImports.slice(0, 5).join(', ');
      parts.push(`Common Imports: ${imports}`);
    }

    return parts.join(' | ');
  }

  /**
   * Recursively walk directory and return files matching extensions
   */
  private static walkDir(dir: string, extensions: string[]): string[] {
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules and common ignored directories
          if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
            files.push(...this.walkDir(fullPath, extensions));
          }
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch {
      // Return partial results if directory can't be read
    }

    return files;
  }
}

/**
 * Export convenience function for typical use
 */
export function buildProjectContext(projectPath: string): ProjectContext {
  return ContextBuilder.buildContext(projectPath);
}

/**
 * Export context as formatted string for LLM injection
 */
export function contextToPrompt(context: ProjectContext): string {
  return `
### Project Context
${context.summary}

### Available Dependencies
- Production: ${Array.from(context.dependencies.keys()).slice(0, 15).join(', ')}
- Development: ${Array.from(context.devDependencies.keys()).slice(0, 10).join(', ')}

### Constraints
- Only import from existing dependencies listed above
- Match existing code patterns: ${context.detectedPatterns.join(', ')}
- Follow ${context.frameworks.length > 0 ? context.frameworks.join(', ') : 'vanilla JavaScript'} conventions
`;
}
