import * as vscode from 'vscode';

/**
 * Architecture Validator - Enforces layer-based rules before file write
 * 
 * Prevents semantic errors by validating code against layer rules BEFORE writing.
 * Detects hooks in service files, wrong imports, architecture violations.
 * 
 * Layer Rules:
 * - services/: Pure functions only, NO React/hooks/state libs
 * - hooks/: React hooks, can import services, no routing
 * - components/: React components, can import everything except routing
 * - types/: Type definitions only, NO runtime code
 * - utils/: Pure utilities, NO React/hooks/state libs
 */

export interface LayerViolation {
  type: 'forbidden-import' | 'missing-export' | 'wrong-pattern' | 'semantic-error';
  import?: string;
  line?: number;
  message: string;
  suggestion: string;
  severity: 'high' | 'medium' | 'low';
}

export interface LayerValidationResult {
  hasViolations: boolean;
  violations: LayerViolation[];
  layer: string;
  recommendation: 'allow' | 'fix' | 'skip';
}

interface LayerRule {
  forbiddenImports: string[];
  allowedImportPatterns: string[];
  allowedExportPatterns: string[];
  rule: string;
}

const LAYER_RULES: Record<string, LayerRule> = {
  'services/': {
    forbiddenImports: [
      'react',
      'react-dom',
      '@tanstack/react-query',
      'zustand',
      'redux',
      'react-router',
      'react-router-dom',
      'recoil',
      'jotai',
      'valtio',
    ],
    allowedImportPatterns: [
      'types/',
      'utils/',
      'config/',
      'constants/',
      'lodash',
      'axios',
      'fetch',
      'date-fns',
      'zod',  // Schema validation - allowed in services
    ],
    allowedExportPatterns: [
      'export const',
      'export function',
      'export interface',
      'export type',
    ],
    rule: 'Services are pure, testable functions. No React, hooks, or state management.',
  },

  'hooks/': {
    forbiddenImports: [
      'react-dom',
      'react-router-dom', // Use useNavigate instead
      'redux', // Use zustand or context
    ],
    allowedImportPatterns: [
      'react',
      '@tanstack/react-query',
      'zustand',
      'services/',
      'types/',
      'utils/',
      'config/',
    ],
    allowedExportPatterns: [
      'export const use',
      'export function use',
      'export type',
      'export interface',
    ],
    rule: 'Custom hooks for state, data fetching, side effects. Must export use* functions.',
  },

  'components/': {
    forbiddenImports: [],
    allowedImportPatterns: [
      'react',
      'react-dom',
      'hooks/',
      'services/',
      'types/',
      'utils/',
      'config/',
      'components/',
    ],
    allowedExportPatterns: [
      'export function',
      'export const',
      'export type',
      'export interface',
    ],
    rule: 'React components. Use hooks, services, and other components freely.',
  },

  'types/': {
    forbiddenImports: [
      'react',
      'react-dom',
      'services/',
      'hooks/',
      'components/',
      'utils/',
      '@tanstack/react-query',
      'zustand',
      'redux',
    ],
    allowedImportPatterns: [
      'zod',
      'types/',
      'config/',
    ],
    allowedExportPatterns: [
      'export type',
      'export interface',
      'export enum',
      'export const', // For type constants/schemas only
    ],
    rule: 'Type definitions only. No runtime code, no dependencies.',
  },

  'utils/': {
    forbiddenImports: [
      'react',
      'react-dom',
      '@tanstack/react-query',
      'zustand',
      'redux',
      'react-router',
    ],
    allowedImportPatterns: [
      'types/',
      'lodash',
      'date-fns',
      'zod',
      'config/',
      'constants/',
    ],
    allowedExportPatterns: [
      'export const',
      'export function',
      'export type',
      'export interface',
    ],
    rule: 'Pure utility functions. No React or state management.',
  },

  'schemas/': {
    forbiddenImports: [
      'react',
      'react-dom',
      'components/',
      'hooks/',
      'pages/',
      'screens/',
      '@tanstack/react-query',
      'zustand',
      'redux',
      'react-router',
      'react-router-dom',
    ],
    allowedImportPatterns: [
      'zod',
      'yup',
      'joi',
      'types/',
      'utils/',
      'config/',
      'constants/',
    ],
    allowedExportPatterns: [
      'export const',
      'export type',
      'export interface',
      'export function',
    ],
    rule: 'Schema/validation files are pure data contracts. No React, no UI components, no hooks.',
  },

  'validation/': {
    forbiddenImports: [
      'react',
      'react-dom',
      'components/',
      'hooks/',
      'pages/',
      'screens/',
      '@tanstack/react-query',
      'zustand',
      'redux',
      'react-router',
      'react-router-dom',
    ],
    allowedImportPatterns: [
      'zod',
      'yup',
      'joi',
      'types/',
      'utils/',
      'config/',
      'constants/',
    ],
    allowedExportPatterns: [
      'export const',
      'export type',
      'export interface',
      'export function',
    ],
    rule: 'Validation files are pure data contracts. No React, no UI components, no hooks.',
  },
};

export class ArchitectureValidator {
  /**
   * When strict=false (the default), layer violations are reported as warnings
   * but recommendation is always 'allow' — they never block a write.
   * Set strict=true (via lla.config.json or explicit caller opt-in) to restore
   * blocking behavior for projects that have committed to this layer architecture.
   */
  private readonly strict: boolean;

  constructor(options: { strict?: boolean } = {}) {
    this.strict = options.strict ?? false;
  }

  /**
   * Detect which layer a file belongs to based on file path
   */
  private detectLayer(filePath: string): string {
    for (const layer of Object.keys(LAYER_RULES)) {
      if (filePath.includes(layer)) {
        return layer;
      }
    }
    return 'unknown/';
  }

  /**
   * Extract imports from TypeScript/JavaScript code
   */
  private extractImports(code: string): string[] {
    const imports: string[] = [];

    // Match: import { x } from 'module'
    const namedImportPattern = /import\s*{\s*[^}]*?\s*}\s*from\s*['"](.*?)['"]/gm;
    let match;
    while ((match = namedImportPattern.exec(code)) !== null) {
      imports.push(match[1]);
    }

    // Match: import x from 'module'
    const defaultImportPattern = /import\s+\w+\s+from\s+['"](.*?)['"]/gm;
    while ((match = defaultImportPattern.exec(code)) !== null) {
      imports.push(match[1]);
    }

    // Match: import 'module' (side effects)
    const sideEffectPattern = /import\s+['"](.*?)['"]/gm;
    while ((match = sideEffectPattern.exec(code)) !== null) {
      // Avoid duplicates with other imports
      if (!imports.includes(match[1])) {
        imports.push(match[1]);
      }
    }

    return Array.from(new Set(imports)); // Remove any remaining duplicates
  }

  /**
   * Check if an import is allowed in a layer
   */
  private isImportAllowed(
    importModule: string,
    rule: LayerRule
  ): boolean {
    // First check: Is it in the forbidden list?
    for (const forbidden of rule.forbiddenImports) {
      if (importModule.includes(forbidden)) {
        return false;
      }
    }

    // Second check: Is it in the allowed list?
    for (const allowed of rule.allowedImportPatterns) {
      if (importModule.includes(allowed)) {
        return true;
      }
    }

    // Third check: For files without strict rules (like utils/), allow common libraries
    const commonAllowedLibraries = [
      'lodash',
      'date-fns',
      'axios',
      'fetch',
      'zod',
      'uuid',
      'classnames',
      'clsx',
    ];
    for (const lib of commonAllowedLibraries) {
      if (importModule.includes(lib)) {
        return true;
      }
    }

    // Default: If no patterns matched and it's not forbidden, allow local imports (../, ./)
    if (importModule.startsWith('.')) {
      return true;
    }

    // Only reject if it's clearly a forbidden module name
    // Otherwise be permissive (secure by default is too restrictive for normal code)
    return !rule.forbiddenImports.some(f => importModule.startsWith(f));
  }

  /**
   * Check if exports follow layer patterns
   */
  private checkExports(code: string, rule: LayerRule): LayerViolation[] {
    const violations: LayerViolation[] = [];

    // Note: Disable strict export pattern checking for now
    // It's catching too many false positives for common patterns
    // TODO: Re-enable with better regex patterns
    
    // Check if code exports anything
    if (!code.includes('export ')) {
      // This might be OK if it's a utility file
      return violations;
    }

    // For now, just allow common export patterns
    // This is permissive but catches obvious issues
    return violations;
  }

  /**
   * Main validation method: Check if code violates layer rules
   */
  public validateAgainstLayer(code: string, filePath: string): LayerValidationResult {
    const layer = this.detectLayer(filePath);
    const rule = LAYER_RULES[layer];

    if (!rule) {
      return {
        hasViolations: false,
        violations: [],
        layer,
        recommendation: 'allow',
      };
    }

    const violations: LayerViolation[] = [];

    // Check imports
    const imports = this.extractImports(code);
    for (const importModule of imports) {
      if (!this.isImportAllowed(importModule, rule)) {
        violations.push({
          type: 'forbidden-import',
          import: importModule,
          message: `Forbidden import in ${layer}: "${importModule}"`,
          suggestion: `${layer} layer only allows: ${rule.allowedImportPatterns.join(', ')}. Forbidden: ${rule.forbiddenImports.join(', ')}`,
          // In non-strict mode, downgrade severity so violations never block writes
          severity: this.strict ? 'high' : 'low',
        });
      }
    }

    // Check exports
    violations.push(...this.checkExports(code, rule));

    // Determine recommendation.
    // High-severity violations always block the write ('skip').
    // In strict mode, any violation triggers a fix attempt ('fix').
    // In non-strict mode (the default), low/medium violations are surfaced as warnings only ('allow').
    let recommendation: 'allow' | 'fix' | 'skip' = 'allow';
    const highSeverity = violations.some(v => v.severity === 'high');
    if (highSeverity) {
      recommendation = 'skip';
    } else if (this.strict && violations.length > 0) {
      recommendation = 'fix';
    }

    return {
      hasViolations: violations.length > 0,
      violations,
      layer,
      recommendation,
    };
  }

  /**
   * Generate a formatted error report from validation result
   * Returns an empty string if no violations, formatted report if violations exist
   */
  public generateErrorReport(result: LayerValidationResult): string {
    if (!result.hasViolations || result.violations.length === 0) {
      return '';
    }

    const lines: string[] = [];
    lines.push('');
    lines.push('Architecture Violations');
    lines.push('======================');
    lines.push('');
    lines.push(`Layer: ${result.layer}`);
    lines.push(`Recommendation: ${result.recommendation}`);
    lines.push('');

    result.violations.forEach((violation, index) => {
      lines.push(`${index + 1}. [${violation.severity}] ${violation.type}`);
      lines.push(`   ${violation.message}`);
      if (violation.import) {
        lines.push(`   Import: ${violation.import}`);
      }
      lines.push(`   Fix: ${violation.suggestion}`);
      lines.push('');
    });

    if (result.recommendation === 'skip') {
      lines.push('💡 Recommendation: Skip this file');
      lines.push('   Review the violations and either fix them or mark this layer as exempt.');
    } else if (result.recommendation === 'fix') {
      lines.push('⚠️  Recommendation: Fix before writing');
      lines.push('   Address the violations above before generating this code.');
    }

    return lines.join('\n');
  }

  /**
   * Validate cross-file contracts: Do imported symbols actually exist in dependencies?
   * CRITICAL for multi-step execution: Verifies component uses store API correctly
   * 
   * Example:
   * - Component imports: `import { useLoginStore } from '../stores/loginStore'`
   * - Component uses: `const { formState, setFormState } = useLoginStore()`
   * - Store exports: `export const useLoginStore = create<T>()`
   * - This validates: formState and setFormState actually exist in the store
   */
  public async validateCrossFileContract(
    generatedCode: string,
    filePath: string,
    workspace: vscode.Uri,
    previousStepFiles?: Map<string, string>,  // ✅ CRITICAL: Files from previous steps (path -> content)
    allowSiblingImports?: boolean             // True when the step explicitly composes/orchestrates peers
  ): Promise<LayerValidationResult> {
    const violations: LayerViolation[] = [];

    // Extract all import statements
    const importRegex = /import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    const imports: Array<{ symbols: string[]; source: string; isDefault: boolean }> = [];

    while ((match = importRegex.exec(generatedCode)) !== null) {
      const namedImports = match[1]; // Named exports: { a, b, c }
      const defaultImport = match[2]; // Default: import X
      const source = match[3]; // Path

      if (namedImports) {
        const symbols = namedImports
          .split(',')
          .map(s => s.trim())
          .filter(s => s);
        imports.push({ symbols, source, isDefault: false });
      } else if (defaultImport) {
        imports.push({ symbols: [defaultImport], source, isDefault: true });
      }
    }

    // For each import, verify it exists in the source file
    for (const imp of imports) {
      try {
        // Resolve source path relative to current file
        const currentDir = filePath.substring(0, filePath.lastIndexOf('/'));
        let resolvedPath = imp.source;

        // Skip npm packages — they don't start with . or / or @/ and live in node_modules
        // BUT check @/ alias paths (they map to src/ and may not exist)
        if (!resolvedPath.startsWith('.') && !resolvedPath.startsWith('/') && !resolvedPath.startsWith('@/')) {
          continue;
        }

        // Resolve @/ alias (maps to src/ in standard TypeScript projects)
        if (resolvedPath.startsWith('@/')) {
          resolvedPath = 'src/' + resolvedPath.slice(2); // e.g. '@/utils/cn' → 'src/utils/cn'
        }

        // Skip JSON/config files — they have no TypeScript exports to verify
        // (handles cases where relative traversal resolves to /package.json, tsconfig.json, etc.)
        if (resolvedPath.endsWith('.json') || resolvedPath.endsWith('.yaml') || resolvedPath.endsWith('.yml')) {
          continue;
        }

        // Handle different path formats
        if (resolvedPath.startsWith('.')) {
          // ✅ Relative paths: ../utils/cn, ./helpers
          // Resolve ../ and ./
          resolvedPath = resolvedPath
            .split('/')
            .reduce((acc, part) => {
              if (part === '.' || part === '') {return acc;}
              if (part === '..') {
                const parts = acc.split('/');
                parts.pop();
                return parts.join('/');
              }
              return acc + '/' + part;
            }, currentDir);
        } else if (!resolvedPath.startsWith('/')) {
          // ✅ Absolute-from-workspace-root paths: src/utils/cn, components/Form
          // These are already workspace-root-relative, use as-is
          // The vscode.Uri.joinPath below will handle them correctly
        } else {
          // ✅ Absolute paths: /src/utils/cn (less common but supported)
          // Already absolute, use as-is
        }

        // SIBLING COMPONENT RULE: A .tsx component must not import another .tsx component
        // that was generated in the same plan (i.e. is in previousStepFiles).
        // Decomposition tasks produce peer components — none should depend on a sibling.
        // Exception: allowSiblingImports=true for composition/orchestrator steps (e.g. a
        // UserProfile step that explicitly composes UserAvatar + UserStats is NOT a peer).
        if (
          !allowSiblingImports &&
          previousStepFiles &&
          filePath.endsWith('.tsx') &&
          (filePath.includes('components/') || filePath.includes('pages/') || filePath.includes('screens/'))
        ) {
          const siblingCandidates = [
            resolvedPath + '.tsx',
            resolvedPath,
          ];
          for (const candidate of siblingCandidates) {
            if (previousStepFiles.has(candidate) && candidate.endsWith('.tsx')) {
              const importedName = candidate.split('/').pop() ?? candidate;
              const currentName = filePath.split('/').pop() ?? filePath;
              violations.push({
                type: 'wrong-pattern',
                import: imp.source,
                message:
                  `❌ SIBLING COMPONENT RULE: ${currentName} imports ${importedName}, but both are peer components from the same plan. ` +
                  `Peer components must NOT depend on each other — accept required data as props instead.`,
                suggestion:
                  `Remove the import of ${importedName} AND remove all JSX usages of <${importedName.replace('.tsx', '')} ... /> from the component body. ` +
                  `Do NOT add any other import as a replacement — simply delete that import line and any JSX elements that used it. ` +
                  `Define a local props interface with the data this component needs (e.g. interface ${currentName.replace('.tsx', '')}Props { ... }). ` +
                  `The parent page/layout that renders both siblings will pass props to each.`,
                severity: 'high',
              });
              break;
            }
          }
        }

        // Try to read the source file
        try {
          let sourceContent: string | null = null;

          // ✅ CRITICAL: Check previousStepFiles FIRST (from previous steps in the same plan)
          // This avoids disk I/O and prevents "file not found" errors for just-written files
          // Try exact match first, then with .ts/.tsx extensions (path normalization)
          const pathVariants = [
            resolvedPath,
            resolvedPath + '.ts',
            resolvedPath + '.tsx',
            resolvedPath + '.js',
            resolvedPath + '.jsx',
          ];

          for (const pathVariant of pathVariants) {
            if (previousStepFiles && previousStepFiles.has(pathVariant)) {
              sourceContent = previousStepFiles.get(pathVariant) || '';
              console.log(
                `[ArchitectureValidator] ✅ Using context of previously-written file: ${pathVariant} (matched from ${resolvedPath})`
              );
              break;
            }
          }

          // If not in previous step files, try reading from disk
          if (!sourceContent) {
            console.log(
              `[ArchitectureValidator] 📁 Reading from disk: ${resolvedPath} (variants: ${pathVariants.join(', ')})`
            );
            
            // Try each path variant until we find the file
            for (const pathVariant of pathVariants) {
              try {
                const sourceUri = vscode.Uri.joinPath(workspace, pathVariant);
                console.log(`[ArchitectureValidator] 🔗 Trying: ${sourceUri.fsPath}`);
                sourceContent = new TextDecoder().decode(await vscode.workspace.fs.readFile(sourceUri));
                console.log(`[ArchitectureValidator] ✅ Successfully read: ${sourceUri.fsPath}`);
                break;  // Found it!
              } catch (variantError) {
                console.log(`[ArchitectureValidator] ❌ Not found: ${pathVariant}`);
                // Try next variant
              }
            }
            
            if (!sourceContent) {
              throw new Error(`File not found: tried variants ${pathVariants.join(', ')}`);
            }
          }

          if (!sourceContent) {
            throw new Error(`File is empty: ${resolvedPath}`);
          }

          // Extract what the source file exports
          // Handles: export const, export function, export interface, export type, export default
          // Also handles: export { name }, export { name as alias }
          const exportRegex = /export\s+(?:(?:const|function|interface|type|class)\s+(\w+)|{([^}]+)}|default\s+(\w+))/g;
          const sourceExports: Set<string> = new Set();
          let exportMatch;

          while ((exportMatch = exportRegex.exec(sourceContent)) !== null) {
            // Capture group 1: named exports (const, function, etc)
            if (exportMatch[1]) {
              sourceExports.add(exportMatch[1]);
            }
            // Capture group 2: export { } syntax
            if (exportMatch[2]) {
              const names = exportMatch[2].split(',').map(n => {
                const parts = n.trim().split(/\s+as\s+/);
                return parts[parts.length - 1]; // Get the exported name (after 'as' if present)
              });
              names.forEach(n => n && sourceExports.add(n.trim()));
            }
            // Capture group 3: export default
            if (exportMatch[3]) {
              sourceExports.add('default');
            }
          }

          // For named imports, verify each symbol exists in source exports
          if (!imp.isDefault) {
            for (const symbol of imp.symbols) {
              // Check for exact match or pattern matching (e.g., useStore hook)
              const exists = sourceExports.has(symbol);
              
              // Zustand/custom hook pattern: if importing use*, check if any use* exists
              const isHookPattern = symbol.startsWith('use') && 
                                    Array.from(sourceExports).some(e => e.startsWith('use'));
              
              // Fallback: check if 'default' export exists (for default exports)
              const hasDefaultExport = sourceExports.has('default');

              if (!exists && !isHookPattern && !hasDefaultExport) {
                violations.push({
                  type: 'missing-export',
                  import: symbol,
                  message: `Symbol '${symbol}' not found in '${resolvedPath}'`,
                  suggestion: `Available exports: ${Array.from(sourceExports).join(', ') || 'none'}`,
                  severity: 'high',
                });
              }
            }
          }

          // Extract usage of imported symbols in generated code
          // Look for patterns like: const { x, y } = hookName() or hookName.method()
          for (const symbol of imp.symbols) {
            const usagePatterns = [
              // Destructuring: const { x } = symbol()
              new RegExp(`{[^}]*\\b${symbol}\\b[^}]*}\\s*=\\s*${symbol}\\(`, 'g'),
              // Property access: symbol.method or symbol.property
              new RegExp(`${symbol}\\.[a-zA-Z_][a-zA-Z0-9_]*`, 'g'),
            ];

            for (const pattern of usagePatterns) {
              const usages = generatedCode.match(pattern) || [];
              
              // Extract accessed properties
              for (const usage of usages) {
                const propMatch = usage.match(/\.([a-zA-Z_][a-zA-Z0-9_]*)/);
                if (propMatch) {
                  const property = propMatch[1];
                  // For Zustand stores, the export is the hook, but we should verify
                  // that the accessed property makes sense (rough check).
                  // Whitelist: Zustand runtime methods (getState, setState, subscribe, destroy)
                  // and single-char / file-extension tokens from path references (e.g. storeName.ts)
                  const zustandBuiltins = new Set(['getState', 'setState', 'subscribe', 'destroy', 'getInitialState']);
                  const fileExtTokens = new Set(['ts', 'tsx', 'js', 'jsx', 'json', 'css', 'svg']);
                  if (symbol.includes('Store') && !sourceContent.includes(property) &&
                      !zustandBuiltins.has(property) && !fileExtTokens.has(property)) {
                    violations.push({
                      type: 'semantic-error',
                      import: symbol,
                      message: `Property '${property}' used on '${symbol}' but not found in store definition`,
                      suggestion: `Verify '${property}' is defined in the store's state object`,
                      severity: 'high',
                    });
                  }
                }
              }
            }
          }
        } catch (error) {
          // Source file not found or read failed - could be external package
          // Check if this is likely an external package or a workspace-relative path
          const isExternalPackage = [
            'node_modules', '@types', 'react', 'zustand', 'axios', 'clsx', 'tailwind-merge',
            'lodash', 'date-fns', 'zod', 'express', 'next', 'vite'
          ].some(p => imp.source.includes(p) || imp.source.startsWith(p));
          
          const isWorkspaceRelativePath = ['src/', 'utils/', 'components/', 'services/', 'hooks/', 'types/'].some(
            p => resolvedPath.startsWith(p)
          );

          if (!isExternalPackage && !isWorkspaceRelativePath) {
            // Truly unknown import
            violations.push({
              type: 'missing-export',
              import: imp.symbols[0],
              message: `Cannot find module '${resolvedPath}' from '${filePath}'`,
              suggestion: `Verify the import path is correct`,
              severity: 'medium',
            });
          } else if (isWorkspaceRelativePath) {
            // Workspace-relative path but file not found - this is a real error
            const isTypesDir = resolvedPath.includes('/types/') || resolvedPath.includes('src/types');
            const typeSuggestion = isTypesDir
              ? `There is no src/types/ directory in this project. ` +
                `TypeScript types are exported from schema files in src/schemas/. ` +
                `Change the import to use the schema: e.g. \`import { ${imp.symbols[0]} } from '../schemas/userSchema'\``
              : `Verify the file exists at: ${resolvedPath}.ts (or .tsx)`;
            violations.push({
              type: 'missing-export',
              import: imp.symbols[0],
              message: `Cannot find module '${resolvedPath}' from '${filePath}'`,
              suggestion: typeSuggestion,
              severity: 'high',
            });
            console.warn(
              `[ArchitectureValidator] ⚠️ Workspace file not found: ${resolvedPath}`
            );
          }
          // If external package, silently skip (assumed to be available)
        }
      } catch (error) {
        // Skip validation for this import if something goes wrong
        console.warn(`[ArchitectureValidator] Error validating import: ${error}`);
      }
    }

    const recommendation: 'allow' | 'fix' | 'skip' = violations.some(v => v.severity === 'high')
      ? 'skip'
      : violations.length > 0
      ? 'fix'
      : 'allow';

    return {
      hasViolations: violations.length > 0,
      violations,
      layer: 'cross-file-contracts',
      recommendation,
    };
  }

  /**
   * Validate semantic usage of imported hooks
   * Ensures that imported hooks are actually USED correctly in the component
   * 
   * CRITICAL CHECKS:
   * 1. Hook must be called (not just imported)
   * 2. Destructured properties must exist in source
   * 3. All used imports must be properly imported (e.g., useState from React)
   * 4. No mixed state management (useState + store hook together)
   * 5. Destructured properties must be used
   * 
   * Detects:
   * ❌ Hook imported but never called
   * ❌ Destructuring properties that don't exist in store
   * ❌ Using useState without importing it
   * ❌ Mixed state management
   * ❌ Destructured but unused properties
   */
  public async validateHookUsage(
    generatedCode: string,
    filePath: string,
    previousStepFiles?: Map<string, string>
  ): Promise<LayerViolation[]> {
    const violations: LayerViolation[] = [];

    // ── Pure string-based checks (no vscode needed) ──────────────────────────

    // Step 0: Validate all React imports (useState, etc.)
    // Check if code uses useState but doesn't import it
    if (/\s*useState\s*</.test(generatedCode) || /\s*useState\s*\(/.test(generatedCode)) {
      // Updated pattern to handle: import { useState } OR import React, { useState }
      // Pattern explanation: import [optional: DefaultName, ] { ...useState... } from 'react'
      if (!/import\s+(?:\w+\s*,\s*)?{[^}]*useState[^}]*}\s+from\s+['"]react['"]/.test(generatedCode)) {
        violations.push({
          type: 'semantic-error',
          import: 'useState',
          message: `useState is used but not imported from React`,
          suggestion: `Add: import { useState } from 'react';`,
          severity: 'high',
        });
      }
    }

    // NEW: Step 0.5: Comprehensive React hook import validation
    // Check for ALL React hooks that might be used but not imported
    const reactHooks = [
      'useCallback', 'useEffect', 'useContext', 'useReducer', 'useMemo',
      'useRef', 'useLayoutEffect', 'useImperativeHandle', 'useDebugValue',
      'useId', 'useDeferredValue', 'useTransition', 'useSyncExternalStore'
    ];

    const reactImportLine = generatedCode.match(/import\s+(?:\w+\s*,\s*)?{([^}]*)}\s+from\s+['"]react['"]/);
    const importedReactHooks = reactImportLine ? reactImportLine[1].split(',').map(h => h.trim()) : [];

    for (const hook of reactHooks) {
      // Check if hook is USED in code
      if (new RegExp(`\\b${hook}\\s*\\(`).test(generatedCode)) {
        // Check if it's IMPORTED
        if (!importedReactHooks.includes(hook)) {
          console.log(`[ArchitectureValidator] ⚠️ React hook '${hook}' is used but not imported from React`);
          violations.push({
            type: 'semantic-error',
            import: hook,
            message: `React hook '${hook}' is used but not imported from React`,
            suggestion: `Add: import { ${hook} } from 'react';`,
            severity: 'high',
          });
        }
      }
    }

    // Step 1: Extract all imports that LOOK like hooks (use* pattern)
    const hookImportRegex = /import\s+{([^}]*\buse\w+[^}]*)}\s+from\s+['"]([^'"]+)['"]/g;
    const importedHooks: Array<{ names: string[]; source: string }> = [];
    let hookMatch;

    while ((hookMatch = hookImportRegex.exec(generatedCode)) !== null) {
      const importList = hookMatch[1];
      const source = hookMatch[2];
      const names = importList
        .split(',')
        .map(s => s.trim())
        .filter(s => /^use[A-Z]/.test(s));  // React hook convention: use + uppercase (excludes userService, usecase, etc.)
      if (names.length > 0) {
        importedHooks.push({ names, source });
      }
    }

    // IMPORTANT: Detect refactoring context
    // If component has store hooks, useState being unused is OK (it's being replaced)
    const hasStoreHook = importedHooks.some(h =>
      h.names.some(n => n.includes('Store') || n.includes('store')) &&
      generatedCode.includes(`const`)
    );
    const usingStoreHook = importedHooks.some(h =>
      h.source.includes('store') &&
      h.names.some(n => {
        const escapedName = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(
          `const\\s+(?:\\[\\s*[\\w\\s,]*\\s*\\]|\\{\\s*[\\w\\s,]*\\s*\\}|\\w+)\\s*=\\s*${escapedName}\\s*\\(`,
          'g'
        );
        return pattern.test(generatedCode);
      })
    );

    // Dead useState check: after Zustand refactor, useState left in imports is a dead import.
    // Handles both `import { useState }` and `import React, { useState }` since
    // hookImportRegex only captures named-only imports.
    if (usingStoreHook) {
      const useStateImported =
        importedReactHooks.includes('useState') ||
        importedHooks.some(h => h.names.includes('useState'));
      const useStateCalled = /\buseState\s*[(<]/.test(generatedCode);
      if (useStateImported && !useStateCalled) {
        violations.push({
          type: 'semantic-error',
          import: 'useState',
          message: `Unused import: 'useState' is imported but never called. Remove it — all state is managed by the Zustand store hook.`,
          suggestion: `Remove 'useState' from the React import. Keep only the hooks you actually use.`,
          severity: 'high',
        });
      }
    }

    // Step 6: CRITICAL - Check for CUSTOM HOOKS that are CALLED but NOT IMPORTED
    // Pure string analysis — runs before the workspace guard so it works in all environments.
    // Pattern: const { x } = useCustomHook() but no import statement for useCustomHook.
    {
      const customHookCallRegex = /const\s+(?:\[[\w\s,]*\]|\{[^}]+\})\s*=\s*(use\w+)\s*\(/g;
      let customHookCallMatch;
      const customHooksCalled = new Set<string>();
      while ((customHookCallMatch = customHookCallRegex.exec(generatedCode)) !== null) {
        customHooksCalled.add(customHookCallMatch[1]);
      }

      // Collect imported hook names — both named and default import styles.
      // Named: `import { useAuthStore } from '...'`
      // Default: `import useAuthStore from '@/stores/authStore'`
      const importedHookNames = new Set<string>();
      importedHooks.forEach(h => h.names.forEach(name => importedHookNames.add(name)));
      const defaultHookImportRegex = /import\s+(use\w+)\s+from\s+['"][^'"]+['"]/g;
      let defaultHookImport;
      while ((defaultHookImport = defaultHookImportRegex.exec(generatedCode)) !== null) {
        importedHookNames.add(defaultHookImport[1]);
      }

      // Hooks DEFINED in this file are not missing imports — they ARE the definition.
      const definedHookNames = new Set<string>();
      const definedHookRegex = /(?:export\s+)?(?:const|function)\s+(use\w+)\s*(?:[=<(])/g;
      let definedHookMatch;
      while ((definedHookMatch = definedHookRegex.exec(generatedCode)) !== null) {
        definedHookNames.add(definedHookMatch[1]);
      }

      const builtinReactHooks = new Set([
        'useState', 'useEffect', 'useContext', 'useReducer', 'useCallback', 'useMemo',
        'useRef', 'useLayoutEffect', 'useImperativeHandle', 'useDebugValue', 'useId',
        'useDeferredValue', 'useTransition', 'useSyncExternalStore'
      ]);

      customHooksCalled.forEach(hookName => {
        if (builtinReactHooks.has(hookName)) return;
        if (definedHookNames.has(hookName)) return;
        if (importedHookNames.has(hookName)) return;

        console.log(`[ArchitectureValidator] ⚠️ Custom hook '${hookName}' is called but not imported`);
        // Do NOT suggest a hardcoded '../hooks/' path — the hook may live in stores/, hooks/,
        // or any other directory. A wrong path leads the auto-corrector into an import loop.
        const importHint = hookName.endsWith('Store') || hookName.toLowerCase().includes('store')
          ? `import ${hookName} from '@/stores/...';`
          : `import { ${hookName} } from '../hooks/${hookName}';`;
        violations.push({
          type: 'semantic-error',
          import: hookName,
          message: `Missing import: ${hookName} is called but not imported`,
          suggestion: `Add an import for ${hookName} from the correct file. Example: ${importHint}`,
          severity: 'high',
        });
      });
    }

    // ── Checks below require vscode workspace context (filesystem reads) ────────
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) { return violations; }

    // HOOK FILE DETECTION: Check if this is a hook/store definition file.
    // Covers: src/hooks/, src/store/, src/stores/ directories, plus any file that
    // exports a use* symbol via any export syntax (inline or re-export).
    const isHookFile =
      /src\/hooks\//.test(filePath) ||
      /src\/store[s]?\//.test(filePath) ||
      /export\s+(?:const|function)\s+use\w+/.test(generatedCode) ||
      /export\s*\{[^}]*\buse\w+/.test(generatedCode);

    // Step 2: For each imported hook, check if it's actually CALLED in the component
    for (const hookImport of importedHooks) {
      for (const hookName of hookImport.names) {
        const escapedHookName = hookName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // HOOK CALL DETECTION: Multiple patterns for flexibility
        // Pattern 1 (strict): const [x] = hookName( or const {x} = hookName(
        const hookCallPattern = new RegExp(
          `const\\s*(?:\\[\\s*[\\w\\s,]*\\s*\\]|\\{\\s*[\\w\\s,]*\\s*\\}|\\w+)\\s*=\\s*${escapedHookName}\\s*\\(`,
          'g'
        );
        
        // Pattern 2 (lenient): hookName( appears anywhere - for single-line or flexible code
        const lenientPattern = new RegExp(`${escapedHookName}\\s*\\(`, 'g');
        
        const isCalledStrict = hookCallPattern.test(generatedCode);
        const isCalledLenient = lenientPattern.test(generatedCode);
        
        // For hook files, use lenient check since they MUST use React hooks
        // For other files, use strict check
        const isCalled = isHookFile ? isCalledLenient : isCalledStrict;

        if (!isCalled) {
          // EXCEPTION: useState imported but not called is OK if using store hooks
          // This is a refactoring scenario (local state → store management)
          if (hookName === 'useState' && usingStoreHook) {
            console.log(
              `[ArchitectureValidator] ℹ️ useState imported but not called (OK in refactoring to store)`
            );
            continue; // Handled by the dedicated dead-import check below
          }
          
          // EXCEPTION: For hook files, skip validation of React hooks
          // Custom hooks MUST use React hooks internally, but we can't validate format
          if (isHookFile && (hookName === 'useState' || hookName === 'useEffect' || hookName === 'useReducer' || hookName === 'useCallback' || hookName === 'useMemo')) {
            console.log(
              `[ArchitectureValidator] ℹ️ Skipping hook validation for hook file: ${filePath}`
            );
            continue; // Custom hooks are allowed to call React hooks
          }

          // Generate context-aware suggestion based on hook type and file content
          let suggestion = `Must call the hook: const { ... } = ${hookName}();`;

          if (/^use(Navigate|Location|Params|SearchParams|Match)$/.test(hookName)) {
            // Router navigation hooks: unused import means <Navigate> component is already
            // handling the redirect declaratively. REMOVE the import — do NOT add a call.
            // Adding a useNavigate() call conflicts with <Navigate> and triggers a criteria violation.
            suggestion = `REMOVE '${hookName}' from the import — it is imported but not used. ` +
              `If redirecting, use the declarative <Navigate to="..." replace /> component instead of calling ${hookName}(). ` +
              `Fix: delete '${hookName}' from the import line.`;
          } else if (hookName === 'useState') {
            // For useState, provide more specific guidance
            suggestion = `useState must be called in the component body. Example: const [state, setState] = useState(initialValue);`;
          } else if (hookName === 'useEffect') {
            suggestion = `useEffect must be called to register side effects. Example: useEffect(() => { /* effect */ }, [dependencies]);`;
          } else if (hookName === 'useContext') {
            suggestion = `useContext must be called to consume context. Example: const contextValue = useContext(MyContext);`;
          } else if (hookName === 'useReducer') {
            suggestion = `useReducer must be called for complex state. Example: const [state, dispatch] = useReducer(reducer, initialState);`;
          } else if (hookName === 'useCallback') {
            suggestion = `useCallback must be called to memoize callbacks. Example: const memoizedCallback = useCallback(() => { /* callback */ }, [dependencies]);`;
          } else if (hookName === 'useMemo') {
            suggestion = `useMemo must be called to memoize values. Example: const memoizedValue = useMemo(() => computeValue(), [dependencies]);`;
          }

          violations.push({
            type: 'semantic-error',
            import: hookName,
            message: `Hook '${hookName}' is imported but never called in ${filePath}`,
            suggestion: hookName === 'useState' && usingStoreHook 
              ? `Remove unused useState import since using store hook instead`
              : suggestion,
            severity: 'high',
          });
          continue; // Can't validate destructuring if hook isn't called
        }

        // Step 3: Extract destructured properties and validate they exist per store
        const objectDestructureRegex = new RegExp(
          `const\\s+{([^}]+)}\\s*=\\s*${escapedHookName}\\s*\\(`,
          'g'
        );
        let destructMatch;
        const destructuredProps: Set<string> = new Set();

        // CRITICAL: Only validate destructuring for Zustand store hooks
        // Custom hooks like useCounter should use basic destructuring without full property validation
        // Zustand stores must have their destructured properties validated against store exports
        const isZustandStore = hookName.includes('Store') || hookImport.source.includes('stores');
        
        if (!isZustandStore) {
          console.log(`[ArchitectureValidator] ℹ️ Skipping store property validation for non-store hook: ${hookName}`);
          continue;
        }

        while ((destructMatch = objectDestructureRegex.exec(generatedCode)) !== null) {
          const properties = destructMatch[1]
            .split(',')
            .map(p => {
              // Handle { x: y } and { x } patterns
              const parts = p.trim().split(':');
              return parts[0].trim();
            })
            .filter(p => p.length > 0);

          properties.forEach(p => destructuredProps.add(p));

          // CRITICAL: For each destructured property, validate it exists in the store
          // Read the source store file to get available exports
          try {
            const currentDir = filePath.substring(0, filePath.lastIndexOf('/'));
            let resolvedPath = hookImport.source;

            // Resolve the path
            if (resolvedPath.startsWith('.')) {
              resolvedPath = resolvedPath
                .split('/')
                .reduce((acc, part) => {
                  if (part === '.' || part === '') {return acc;}
                  if (part === '..') {
                    const parts = acc.split('/');
                    parts.pop();
                    return parts.join('/');
                  }
                  return acc + '/' + part;
                }, currentDir);
            }

            // Try to read store file (similar to cross-file validation)
            let storeContent: string | null = null;
            const pathVariants = [
              resolvedPath,
              resolvedPath + '.ts',
              resolvedPath + '.tsx',
              resolvedPath + '.js',
              resolvedPath + '.jsx',
            ];

            // Check previousStepFiles first
            for (const variant of pathVariants) {
              if (previousStepFiles && previousStepFiles.has(variant)) {
                storeContent = previousStepFiles.get(variant) || '';
                break;
              }
            }

            // If not found, try disk
            if (!storeContent) {
              for (const variant of pathVariants) {
                try {
                  const storeUri = vscode.Uri.joinPath(workspace.uri, variant);
                  storeContent = new TextDecoder().decode(await vscode.workspace.fs.readFile(storeUri));
                  break;
                } catch {
                  // Try next variant
                }
              }
            }

            if (storeContent) {
              // Extract available state properties from Zustand store
              // Zustand pattern: export const useXxxStore = create<Type>((set) => ({ prop: value, ... }))
              // Key insight: We need to find the RUNTIME object, not TypeScript type params

              let storeProps: Set<string> = new Set();

              // Strategy 0: Extract property names from TypeScript interfaces defined in the store.
              // This is the most reliable approach because interface bodies use simple `name: type`
              // syntax without nested `{}` that confuses the create() body regex.
              // Handles both single-interface and split-interface (State + Actions) patterns.
              const interfaceRegex = /interface\s+\w+\s*\{([^}]+)\}/g;
              let ifaceMatch;
              while ((ifaceMatch = interfaceRegex.exec(storeContent)) !== null) {
                const ifaceBody = ifaceMatch[1];
                const memberRegex = /^\s*(\w+)\s*[?:]?\s*:/gm;
                let memberMatch;
                while ((memberMatch = memberRegex.exec(ifaceBody)) !== null) {
                  storeProps.add(memberMatch[1]);
                  console.log(`[ArchitectureValidator] Found interface property: ${memberMatch[1]}`);
                }
              }

              // Strategy 1: Brace-balanced extraction of create() callback object.
              // The old regex used [^}]+ which stopped at the FIRST } inside the object
              // (e.g. the } inside `set({ email })`), missing properties declared after it.
              // Fix: locate `=> ({` then count braces to find the full top-level object body,
              // then extract only top-level keys (lines starting with an identifier followed by `:`).
              if (storeProps.size === 0) {
                const arrowObjMatch = storeContent.match(/=>\s*\(\s*\{/);
                if (arrowObjMatch && arrowObjMatch.index !== undefined) {
                  const startIdx = arrowObjMatch.index + arrowObjMatch[0].length;
                  let depth = 1;
                  let i = startIdx;
                  while (i < storeContent.length && depth > 0) {
                    if (storeContent[i] === '{') depth++;
                    else if (storeContent[i] === '}') depth--;
                    i++;
                  }
                  const stateBody = storeContent.slice(startIdx, i - 1);
                  console.log(`[ArchitectureValidator] Found state body (brace-balanced): ${stateBody.substring(0, 120)}...`);
                  // Only match property names at the start of a line (top-level keys only)
                  const propRegex = /^\s*(\w+)\s*:/gm;
                  let propMatch;
                  while ((propMatch = propRegex.exec(stateBody)) !== null) {
                    storeProps.add(propMatch[1]);
                    console.log(`[ArchitectureValidator] Found store property: ${propMatch[1]}`);
                  }
                } else {
                  console.warn(`[ArchitectureValidator] ⚠️ Could not locate => ({ pattern in store`);
                }
              }

              // Strategy 2: If that fails, try simpler regex
              if (storeProps.size === 0) {
                console.log(`[ArchitectureValidator] Strategy 1 failed, trying fallback...`);
                // Look for exports: interface exports, named exports
                const exportRegex = /export\s+(?:const\s+(\w+)|interface\s+(\w+))/g;
                let exportMatch;
                while ((exportMatch = exportRegex.exec(storeContent)) !== null) {
                  const name = exportMatch[1] || exportMatch[2];
                  if (name) {
                    storeProps.add(name);
                    console.log(`[ArchitectureValidator] Found export: ${name}`);
                  }
                }
              }

              console.log(
                `[ArchitectureValidator] 📦 Store '${hookName}' has TOP-LEVEL properties: [${Array.from(storeProps).join(', ')}]`
              );
              console.log(
                `[ArchitectureValidator] 🔍 Component tries to destructure: [${properties.join(', ')}]`
              );

              // Check each destructured property against store exports
              let hasPropertyMismatch = false;
              if (storeProps.size > 0) {
                for (const prop of properties) {
                  // Skip setter patterns - if prop exists, that's OK
                  if (prop.toLowerCase().startsWith('set')) {
                    if (storeProps.has(prop)) {
                      console.log(`[ArchitectureValidator] ✅ Setter '${prop}' found in store`);
                    } else {
                      console.log(`[ArchitectureValidator] ⚠️ Setter '${prop}' not found (might be nested or might not exist)`);
                    }
                    continue;
                  }

                  if (!storeProps.has(prop)) {
                    console.log(
                      `[ArchitectureValidator] ❌ CRITICAL MISMATCH: Component destructures '${prop}' but store exports: ${Array.from(storeProps).join(', ')}`
                    );
                    hasPropertyMismatch = true;
                    // Give actionable guidance depending on what's missing:
                    // handleSubmit → define locally (form event handler, not a store concern)
                    // anything else → add to store or remove from destructure
                    const isSubmitHandler = prop === 'handleSubmit' ||
                      (prop.startsWith('handle') && /submit/i.test(prop));
                    const suggestion = isSubmitHandler
                      ? `'${prop}' is a form event handler — it should be defined locally in the component, NOT destructured from the store. ` +
                        `Remove '${prop}' from const { ... } = ${hookName}() and add: ` +
                        `const ${prop}: FormEventHandler<HTMLFormElement> = (e) => { e.preventDefault(); /* use store state here */ };`
                      : `Store exports: { ${Array.from(storeProps).join(', ')} } but component destructures '${prop}' which doesn't exist. ` +
                        `Either add '${prop}' to the store's state object, or remove it from the destructure.`;
                    violations.push({
                      type: 'semantic-error',
                      import: hookName,
                      message: `❌ CRITICAL: Property '${prop}' destructured but NOT in store. Store exports: ${Array.from(storeProps).join(', ')}. This will cause runtime TypeError!`,
                      suggestion,
                      severity: 'high',
                    });
                  } else {
                    console.log(`[ArchitectureValidator] ✅ Property '${prop}' found in store`);
                  }
                }
              } else if (properties.length > 0) {
                // Could not extract store props - might be an error or might be intentional
                console.warn(
                  `[ArchitectureValidator] ⚠️ Could not extract store properties JSON object, but component destructures: [${properties.join(', ')}]`
                );
                console.warn(`[ArchitectureValidator] This might indicate store extraction failed - cannot properly validate!`);
                // Flag as error since we can't validate
                violations.push({
                  type: 'semantic-error',
                  import: hookName,
                  message: `⚠️ Cannot validate store properties - extraction failed. Component tries to destructure: ${properties.join(', ')}`,
                  suggestion: `Verify store structure and ensure component destructuring matches store exports.`,
                  severity: 'high',
                });
              }

              // BONUS: Check for function calls that don't exist in store
              // E.g., component calls submitLogin() but store doesn't export it
              if (hookName.includes('Store')) {
                // Extract all function calls on the component code
                // Pattern: functionName() that looks like a store method
                const functionCallRegex = /([a-zA-Z_]\w*)\s*\(/g;
                let funcMatch;
                const functionsUsed = new Set<string>();
                
                while ((funcMatch = functionCallRegex.exec(generatedCode)) !== null) {
                  const funcName = funcMatch[1];
                  // Check if this might be a store function (heuristic)
                  if (funcName.startsWith('set') || funcName.startsWith('handle') || funcName.startsWith('submit')) {
                    functionsUsed.add(funcName);
                  }
                }

                // Check if any of these functions exist in the store
                for (const func of functionsUsed) {
                  if (!storeContent.includes(`${func}:`)) {
                    // Function called but not defined in store
                    console.log(
                      `[ArchitectureValidator] ⚠️ Function call '${func}()' but not found in store definition`
                    );
                    if (!properties.includes(func)) {
                      // Not destructured AND not in store = definitely broken
                      violations.push({
                        type: 'semantic-error',
                        import: hookName,
                        message: `Function '${func}' is called but not in destructuring or store exports`,
                        suggestion: `Add '${func}' to destructuring: const { ..., ${func} } = ${hookName}() OR define it in the store`,
                        severity: 'high',
                      });
                    }
                  }
                }
              }
            }
          } catch (e) {
            // If we can't read store, skip property validation but still check usage
            console.log(`[ArchitectureValidator] Could not validate store properties: ${e}`);
          }

          // Step 4: Validate destructured properties are actually USED
          for (const prop of properties) {
            // Skip validation for setters - they're meant for updates
            if (prop.toLowerCase().startsWith('set')) {
              continue;
            }

            // Count usage (excluding the destructuring line itself)
            const propUsagePattern = new RegExp(`\\b${prop}\\b`, 'g');
            const allMatches = generatedCode.match(propUsagePattern) || [];
            const usages = allMatches.length - 1; // Subtract the destructuring occurrence

            if (usages === 0) {
              violations.push({
                type: 'semantic-error',
                import: hookName,
                message: `Property '${prop}' destructured but never used`,
                suggestion: `Either use '${prop}' in your code or remove it from destructuring`,
                severity: 'medium',
              });
            }
          }
        }

        // Also handle array destructuring for useState
        const arrayDestructureRegex = new RegExp(
          `const\\s+\\[\\s*([\\w\\s,]*?)\\s*\\]\\s*=\\s*${escapedHookName}\\s*\\(`,
          'g'
        );
        let arrayMatch;
        
        while ((arrayMatch = arrayDestructureRegex.exec(generatedCode)) !== null) {
          const vars = arrayMatch[1]
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);

          // For array destructuring (useState), check both value and setter are used
          if (vars.length === 2) {
            const [stateVar, setterVar] = vars;
            const stateUsages = (generatedCode.match(new RegExp(`\\b${stateVar}\\b`, 'g')) || []).length - 1;
            const setterUsages = (generatedCode.match(new RegExp(`\\b${setterVar}\\b`, 'g')) || []).length - 1;

            if (stateUsages === 0) {
              violations.push({
                type: 'semantic-error',
                import: hookName,
                message: `State variable '${stateVar}' destructured but never used`,
                suggestion: `Use '${stateVar}' in your code or remove it`,
                severity: 'medium',
              });
            }

            if (setterUsages === 0 && !setterVar.startsWith('_')) {
              violations.push({
                type: 'semantic-error',
                import: hookName,
                message: `Setter '${setterVar}' destructured but never used`,
                suggestion: `Use '${setterVar}' to update state or prefix with underscore: _${setterVar}`,
                severity: 'low',
              });
            }
          }
        }
      }
    }

    // Step 5: Check for MIXED STATE MANAGEMENT
    // Using both useState and store hooks means you're not fully refactored
    // Exception: root App component legitimately uses both Zustand (global auth state) and
    // local useState (pure UI state like theme, sidebar toggle) — skip this check for App.tsx
    const stateHooks = importedHooks.filter(h => h.names.some(n => n.includes('Store') || n.includes('store')));
    const usesLocalState = /const\s+\[\w+,\s*\w+\]\s*=\s*useState/.test(generatedCode);
    const isRootAppFile = /(?:^|\/)App\.tsx$/.test(filePath);

    if (stateHooks.length > 0 && usesLocalState && !isRootAppFile) {
      violations.push({
        type: 'semantic-error',
        import: stateHooks[0].names[0],
        message: `Both store hook and local useState detected - use only store for state management`,
        suggestion: `Remove all useState calls and use store hook exclusively`,
        severity: 'high',
      });
    }

    // Step 7: (Step 6 was moved before the workspace guard — it's pure string analysis) CRITICAL - Check for UTILITY FUNCTIONS that are called but NOT IMPORTED
    // Utilities: cn(), clsx(), twMerge(), logger(), etc.
    // These commonly get used but are easy to forget to import
    const utilityFunctions: { [key: string]: string[] } = {
      'cn': ['../utils/cn', './utils/cn', '@/utils/cn'],
      'clsx': ['clsx'],
      'twMerge': ['tailwind-merge'],
      'logger': ['../utils/logger', './utils/logger'],
      'formatDate': ['../utils/formatDate', './utils/formatDate'],
      'parseDate': ['../utils/parseDate', './utils/parseDate'],
      'validateEmail': ['../utils/validateEmail', './utils/validateEmail'],
    };

    // Extract all imports to check what's available
    const importedNames = new Set<string>();
    const allImportRegex = /import\s+(?:{([^}]*)}|(\w+))/g;
    let allImportMatch;
    while ((allImportMatch = allImportRegex.exec(generatedCode)) !== null) {
      if (allImportMatch[1]) {
        // Named imports: { a, b, c }
        allImportMatch[1].split(',').forEach(name => {
          importedNames.add(name.trim().split(' as ')[0]);
        });
      } else if (allImportMatch[2]) {
        // Default import: React
        importedNames.add(allImportMatch[2].trim());
      }
    }

    // Check for utility function calls
    for (const [utilFunc, possibleSources] of Object.entries(utilityFunctions)) {
      // Check if utility is called in code
      const isUsed = new RegExp(`\\b${utilFunc}\\s*\\(`).test(generatedCode);
      
      if (isUsed && !importedNames.has(utilFunc)) {
        console.log(`[ArchitectureValidator] ⚠️ Utility '${utilFunc}' is called but not imported`);
        violations.push({
          type: 'semantic-error',
          import: utilFunc,
          message: `Missing import: ${utilFunc}() is used but not imported`,
          suggestion: `Add: import { ${utilFunc} } from '${possibleSources[0]}';`,
          severity: 'high',
        });
      }
    }

    return violations;
  }

}
