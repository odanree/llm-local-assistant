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
   * Detect semantic errors specific to services layer
   */
  private detectServiceSemanticErrors(code: string): LayerViolation[] {
    const violations: LayerViolation[] = [];

    // Pattern: React hooks in service
    const useHooks = code.match(/use[A-Z]\w+\s*=\s*\(\s*\)\s*=>\s*(useQuery|useMutation|useState|useEffect|useContext)/gm);
    if (useHooks) {
      violations.push({
        type: 'semantic-error',
        message: `Service file contains React hooks: ${useHooks.join(', ')}`,
        suggestion: 'Move hook definitions to src/hooks/ layer. Services should be pure functions only.',
        severity: 'high',
      });
    }

    // Pattern: useQuery directly in export
    if (code.includes('useQuery') && code.includes('export')) {
      const useQueryExport = code.match(/export\s+(const|function)\s+\w+\s*=\s*\(\s*\)\s*=>\s*useQuery/m);
      if (useQueryExport) {
        violations.push({
          type: 'semantic-error',
          message: 'Service exports a React hook (useQuery)',
          suggestion: 'Services should export pure functions. Move useQuery usage to a custom hook in src/hooks/.',
          severity: 'high',
        });
      }
    }

    // Pattern: useState in service
    if (code.includes('useState')) {
      violations.push({
        type: 'semantic-error',
        message: 'Service file uses useState',
        suggestion: 'Services are not React components. Move state management to hooks or components.',
        severity: 'high',
      });
    }

    return violations;
  }

  /**
   * Detect semantic errors specific to types layer
   */
  private detectTypeSemanticErrors(code: string): LayerViolation[] {
    const violations: LayerViolation[] = [];

    // Pattern: Runtime code in types layer
    if (code.includes('export const') && !code.includes('as const') && !code.includes('Zod')) {
      // Check if it's actual runtime code (not just type definition)
      const lines = code.split('\n');
      for (const line of lines) {
        if (line.includes('export const') && !line.includes('=')) {
          // This is a type definition (no value)
          continue;
        }
        if (line.includes('export const') && line.includes('=') && !line.includes('z.')) {
          // Potential runtime code
          violations.push({
            type: 'semantic-error',
            message: `Runtime code in types layer: "${line.trim()}"`,
            suggestion: 'Types layer should only contain type definitions. Move runtime logic to utils or services.',
            severity: 'medium',
          });
        }
      }
    }

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

    // Check semantic errors (layer-specific)
    if (layer === 'services/') {
      violations.push(...this.detectServiceSemanticErrors(code));
    } else if (layer === 'types/') {
      violations.push(...this.detectTypeSemanticErrors(code));
    }

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
    previousStepFiles?: Map<string, string>  // ✅ CRITICAL: Files from previous steps (path -> content)
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
            violations.push({
              type: 'missing-export',
              import: imp.symbols[0],
              message: `Cannot find module '${resolvedPath}' from '${filePath}'`,
              suggestion: `Verify the file exists at: ${resolvedPath}.ts (or .tsx)`,
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
        .filter(s => s.startsWith('use'));
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
          
          if (hookName === 'useState') {
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

// ============================================================
// SmartAutoCorrection (merged from smartAutoCorrection.ts)
// ============================================================
/**
 * Smart Auto-Correction for Validation Errors
 * Understands import dependencies and can fix common validation failures
 */
export class SmartAutoCorrection {
  /**
   * Detect if code has circular/self-referential imports
   * Example: blogService.ts importing blogService
   */
  static detectCircularImports(code: string, filePath: string): string[] {
    const circularImports: string[] = [];
    
    // Extract filename without extension
    const fileName = filePath.split('/').pop()?.split('.')[0] || '';
    const baseName = fileName.replace(/Service|Repository|Hook|Controller/, '');
    
    // Check for self-referential imports
    const importLines = code.match(/^import\s+.*from\s+['"].*['"];?$/gm) || [];
    
    importLines.forEach(importLine => {
      // Extract the module being imported
      const moduleMatch = importLine.match(/from\s+['"]([^'"]+)['"]/);
      if (moduleMatch) {
        const importSource = moduleMatch[1];
        
        // Check if importing itself (by filename or base name)
        if (
          importSource.includes(fileName) ||
          importSource.includes(baseName) ||
          importSource.includes(fileName.replace(/Service/, '')) ||
          importSource.includes(fileName.replace(/Repository/, ''))
        ) {
          circularImports.push(importLine);
        }
      }
    });
    
    return circularImports;
  }

  /**
   * Merge split React imports into one line — deterministic, no LLM needed.
   * Routes.ts / config files often generate:
   *   import React from 'react';
   *   import type { ComponentType } from 'react';
   * which must become:
   *   import React, { ComponentType } from 'react';
   */
  static mergeSplitReactImports(code: string): string {
    const reactImportRegex = /^import\s+.+\s+from\s+['"]react['"];?$/gm;
    const reactImportLines = code.match(reactImportRegex);
    if (!reactImportLines || reactImportLines.length <= 1) { return code; }

    let defaultImport = '';
    const namedImports: string[] = [];

    for (const line of reactImportLines) {
      // Extract default import: `import React from 'react'` or `import React, { ... } from 'react'`
      const defaultMatch = line.match(/^import\s+([A-Z]\w*)\s*(?:,|from)/);
      if (defaultMatch) { defaultImport = defaultMatch[1]; }
      // Extract named imports: `{ X, Y }` or `import type { X }`
      const namedMatch = line.match(/\{([^}]+)\}/);
      if (namedMatch) {
        namedMatch[1].split(',').forEach(n => {
          const cleaned = n.trim().replace(/^type\s+/, ''); // strip 'type' keyword
          if (cleaned) { namedImports.push(cleaned); }
        });
      }
    }

    const named = namedImports.length > 0 ? `{ ${namedImports.join(', ')} }` : '';
    let merged: string;
    if (defaultImport && named) {
      merged = `import ${defaultImport}, ${named} from 'react';`;
    } else if (defaultImport) {
      merged = `import ${defaultImport} from 'react';`;
    } else if (named) {
      merged = `import ${named} from 'react';`;
    } else {
      return code;
    }

    // Replace first react import with merged, blank out the rest, then collapse blank lines
    let firstFound = false;
    return code.replace(reactImportRegex, (line) => {
      if (!firstFound) { firstFound = true; return merged; }
      return ''; // subsequent react imports removed
    }).replace(/\n{3,}/g, '\n\n');
  }

  /**
   * Fix circular/self-referential imports by removing them
   * These are always semantic errors - the file shouldn't import itself
   */
  static fixCircularImports(code: string, filePath: string): string {
    const circularImports = this.detectCircularImports(code, filePath);
    
    if (circularImports.length === 0) {
      return code;
    }
    
    let fixed = code;
    
    // Remove each circular import
    circularImports.forEach(circularImport => {
      // Escape special regex characters
      const escaped = circularImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      fixed = fixed.replace(new RegExp(`^${escaped}\n?`, 'gm'), '');
    });
    
    return fixed;
  }

  /**
   * Analyze code and auto-fix missing imports
   * @param code The code with validation errors
   * @param validationErrors The errors to fix
   * @returns Fixed code, or null if can't auto-fix
   */
  static fixMissingImports(code: string, validationErrors: string[]): string {
    let fixed = code;
    const addedImports: Set<string> = new Set();

    console.log('[SmartAutoCorrection] fixMissingImports called with', validationErrors.length, 'errors');

    // Parse all validation errors for missing imports
    validationErrors.forEach(error => {
      console.log('[SmartAutoCorrection] Processing error:', error);
      // Pattern: "Missing import: useState is used but not imported..."
      // Matches: "Missing import: <name> is used but not imported"
      const missingImportMatch = error.match(/Missing import: (\w+) is used but not imported/);
      console.log('[SmartAutoCorrection] Regex match result:', missingImportMatch);
      if (missingImportMatch) {
        const missingName = missingImportMatch[1];
        console.log('[SmartAutoCorrection] Extracted missing name:', missingName);
        
        // Find where it's used to infer import
        const usagePattern = new RegExp(`\\b${missingName}\\b`, 'g');
        const usages = fixed.match(usagePattern) || [];
        
        if (usages.length > 0) {
          // Try to infer the import source
          const inferredImport = this.inferImportSource(fixed, missingName);
          console.log('[SmartAutoCorrection] Inferred import for', missingName, ':', inferredImport);
          
          if (inferredImport) {
            fixed = this.addImport(fixed, missingName, inferredImport);
            addedImports.add(missingName);
            console.log('[SmartAutoCorrection] Added import for', missingName);
          } else {
            console.log('[SmartAutoCorrection] WARNING: inferImportSource returned null for', missingName);
          }
        }
      }
    });

    // Remove unused imports
    validationErrors.forEach(error => {
      const unusedMatch = error.match(/Unused import: '(\w+)'/);
      if (unusedMatch && !addedImports.has(unusedMatch[1])) {
        const unusedName = unusedMatch[1];
        fixed = this.removeUnusedImport(fixed, unusedName);
      }
    });

    return fixed;
  }

  /**
   * Infer where an import should come from based on naming and usage
   */
  // TODO(RAG): replace this entire method with a codebaseIndex vector lookup.
  // Query: "which file in this project exports <name>?" → returns the real path.
  // The hardcoded dict below is a blind guess that breaks on any project-local symbol.
  private static inferImportSource(code: string, name: string): string | null {
    console.log('[SmartAutoCorrection.inferImportSource] Looking up:', name);
    // Common patterns
    const patterns: { [key: string]: string } = {
      // React Hooks (CRITICAL: fixes missing import validation loop)
      'useState': 'react',
      'useEffect': 'react',
      'useContext': 'react',
      'useReducer': 'react',
      'useCallback': 'react',
      'useMemo': 'react',
      'useRef': 'react',
      'useLayoutEffect': 'react',
      'useImperativeHandle': 'react',
      'useDebugValue': 'react',
      'React': 'react',
      
      // React Router
      'useNavigate': 'react-router-dom',
      'useParams': 'react-router-dom',
      'useLocation': 'react-router-dom',
      'useMatch': 'react-router-dom',
      'useSearchParams': 'react-router-dom',
      'Link': 'react-router-dom',
      'BrowserRouter': 'react-router-dom',
      'Routes': 'react-router-dom',
      'Route': 'react-router-dom',
      
      // Form/State Management
      'useForm': 'react-hook-form',
      'useQuery': '@tanstack/react-query',
      'useMutation': '@tanstack/react-query',
      'useStore': 'zustand',
      
      // Styling & Utilities
      'clsx': 'clsx',
      'twMerge': 'tailwind-merge',
      'cn': '../utils/cn',  // Tailwind class merging utility (CRITICAL: prevents ReferenceError)
      'classNames': 'classnames',
      
      // Common Utilities
      'logger': '../utils/logger',
      'formatDate': '../utils/formatDate',
      'parseDate': '../utils/parseDate',
      'validateEmail': '../utils/validateEmail',
      'debounce': 'lodash-es',
      'throttle': 'lodash-es',
      'isEmpty': 'lodash-es',
      'pick': 'lodash-es',
      'omit': 'lodash-es',
      'merge': 'lodash-es',
      
      // Repositories
      'repository': './repository',
      'Repository': './repository',
      'userRepository': './repositories/userRepository',
      'blogRepository': './repositories/blogRepository',
      'blogPostRepository': './repositories/blogPostRepository',
      'postRepository': './repositories/postRepository',
      'commentRepository': './repositories/commentRepository',
      
      // Services
      'service': './service',
      'Service': './service',
      'userService': './services/userService',
      'blogService': './services/blogService',
      'postService': './services/postService',
      'authService': './services/authService',
      
      // Database/ORM
      'db': './db',
      'database': './database',
      'DataSource': 'typeorm',
      'getRepository': 'typeorm',
      
      // Types
      'IUser': './types/IUser',
      'IBlog': './types/IBlog',
      'IPost': './types/IPost',
      
      // Config
      'config': './config',
      'constants': './constants',
    };

    // Direct match
    if (patterns[name]) {
      console.log('[SmartAutoCorrection.inferImportSource] Found direct match for', name, ':', patterns[name]);
      return patterns[name];
    }

    console.log('[SmartAutoCorrection.inferImportSource] No direct match found, checking patterns...');
    
    // CUSTOM HOOKS: Handle useXXX pattern for non-built-in React hooks
    // Check if it's a custom hook (starts with 'use' but not a standard React hook)
    const isStandardReactHook = [
      'useState', 'useEffect', 'useContext', 'useReducer', 'useCallback', 'useMemo',
      'useRef', 'useLayoutEffect', 'useImperativeHandle', 'useDebugValue', 'useId',
      'useDeferredValue', 'useTransition', 'useSyncExternalStore'
    ].includes(name);
    
    if (name.startsWith('use') && !isStandardReactHook) {
      // Custom hook - typically in src/hooks/useXXX
      // Import paths: 
      // - From component in src/components/: '../hooks/useXXX'
      // - From hook in src/hooks/: './useXXX'
      // We'll use relative path assuming most likely case (src/components/)
      console.log(`[SmartAutoCorrection.inferImportSource] Detected custom hook: ${name}`);
      return `../hooks/${name}`;
    }
    
    if (name.includes('Repository')) {
      const baseName = name.replace('Repository', '');
      return `./repositories/${baseName}Repository`;
    }
    if (name.includes('Service')) {
      const baseName = name.replace('Service', '');
      return `./services/${baseName}Service`;
    }
    if (name.startsWith('I') && name.length > 1) {
      // Interface pattern
      return `./types/${name}`;
    }
    if (name.match(/^[A-Z]/)) {
      // Class pattern - likely from same directory
      return `./${name}`;
    }

    // Check if it's used in a .query() or .find() pattern (likely a repository)
    if (code.includes(`${name}.query`) || code.includes(`${name}.find`)) {
      const baseName = name.replace('Repository', '').toLowerCase();
      return `./repositories/${name}`;
    }

    console.log('[SmartAutoCorrection.inferImportSource] No pattern match found for:', name, '- returning null');
    return null;
  }

  /**
   * Add an import statement to the code
   */
  private static addImport(code: string, name: string, source: string): string {
    console.log(`[SmartAutoCorrection.addImport] Processing: name=${name}, source=${source}`);
    console.log(`[SmartAutoCorrection.addImport] Code length: ${code.length}, starts with: ${code.substring(0, 100)}`);
    
    // Check if the SPECIFIC import already exists (not just if name is used somewhere)
    // Pattern: import { name } from 'source' OR import Default, { name } from 'source' (accounts for default imports)
    // NOTE: Do NOT use 'g' flag - it maintains state between test() calls, causing alternating true/false!
    const specificImportPattern = new RegExp(`import\\s+[^{]*{[^}]*\\b${name}\\b[^}]*}\\s+from\\s+['"]${source}['"]`);
    if (specificImportPattern.test(code)) {
      // Import already exists, don't add duplicate
      console.log(`[SmartAutoCorrection.addImport] ✓ Import already exists, returning unchanged`);
      return code;
    }

    // Also check if source is already imported (to add to existing import)
    const sourceImportPattern = new RegExp(`import\\s+(?:\\w+\\s*,\\s*)?{([^}]*)}\\s+from\\s+['"]${source}['"]`, 'm');
    const sourceMatch = code.match(sourceImportPattern);

    if (sourceMatch && sourceMatch[1]) {
      // Source is already imported, add name to existing import statement
      const existingImports = sourceMatch[1];
      if (!existingImports.includes(name)) {
        const updatedImport = `import { ${existingImports}, ${name} } from '${source}'`;
        const result = code.replace(sourceMatch[0], updatedImport);
        console.log(`[SmartAutoCorrection.addImport] ✓ Added to existing import, result length: ${result.length}`);
        return result;
      }
      console.log(`[SmartAutoCorrection.addImport] ✓ ${name} already in existing import`);
      return code;
    }

    // Find where to insert import (after existing imports or at top)
    const importRegex = /^(import\s+.*from\s+['"][^'"]*['"];?\n?)*/m;
    const match = code.match(importRegex);
    console.log(`[SmartAutoCorrection.addImport] Import regex match: ${match ? `length=${match[0].length}` : 'NO MATCH'}`);
    
    if (match && match[0]) {
      // Insert after last import
      const insertPos = match[0].length;
      const newImport = `import { ${name} } from '${source}';\n`;
      const result = code.slice(0, insertPos) + newImport + code.slice(insertPos);
      console.log(`[SmartAutoCorrection.addImport] ✓ Added after existing imports at pos=${insertPos}, result length: ${result.length}`);
      return result;
    } else {
      // No imports found, add at very top
      const newImport = `import { ${name} } from '${source}';\n\n`;
      const result = newImport + code;
      console.log(`[SmartAutoCorrection.addImport] ✓ Added at top (no existing imports), result length: ${result.length}`);
      return result;
    }
  }

  /**
   * Remove an unused import statement
   */
  private static removeUnusedImport(code: string, name: string): string {
    // Pattern: import { NAME } from 'source'; or import NAME from 'source';
    const patterns = [
      new RegExp(`import\\s+{[^}]*\\b${name}\\b[^}]*}\\s+from\\s+['"][^'"]*['"];?\\n?`, 'g'),
      new RegExp(`import\\s+${name}\\s+from\\s+['"][^'"]*['"];?\\n?`, 'g'),
    ];

    let result = code;
    patterns.forEach(pattern => {
      result = result.replace(pattern, '');
    });

    return result;
  }

  /**
   * Fix multiple common patterns
   */
  static fixCommonPatterns(code: string, validationErrors: string[], filePath?: string): string {
    let fixed = code;

    // ZEROTH: Strip LLM narration comment lines that reference other file paths.
    // When the LLM produces a single file but includes comments like "// src/components/Layout.tsx"
    // or "// See src/routes/Routes.ts", the "Multiple file references detected" validator fires.
    // These comment lines are never part of valid executable code and can be stripped safely.
    // Only fires when the "Multiple file references" error is already present, so unrelated
    // comment lines in other files are never touched.
    const hasMultiFileError = validationErrors.some(e => e.includes('Multiple file references detected'));
    if (hasMultiFileError) {
      // Match comment-only lines that contain a file extension reference (.ts / .tsx / .js / .json / .yaml / .css).
      // Uses the same extension set as the validator regex so we clear exactly what it counts.
      fixed = fixed.replace(/^[ \t]*\/\/[^\n]*\.(ts|tsx|js|jsx|json|yaml|css)[^\n]*\n?/gm, '');
      console.log('[SmartAutoCorrection] Stripped file-reference comment lines (multi-file error fix)');
    }

    // FIRST-A: Fix absolute-path imports to relative paths.
    // The LLM sometimes generates: import X from '/routes/Routes' (absolute, starting with '/')
    // instead of the correct relative: import X from './routes/Routes'.
    // Strip the leading '/' and replace with './' — correct for files at src/ level.
    // Only fires when a "Cannot find module '/" error is present, so unrelated imports are untouched.
    const hasAbsolutePathError = validationErrors.some(e => e.includes("Cannot find module '/"));
    if (hasAbsolutePathError) {
      fixed = fixed.replace(/\bfrom\s+(['"])\/([a-zA-Z][^'"]*)\1/g, (_match, q, importPath) => {
        return `from ${q}./${importPath}${q}`;
      });
      console.log('[SmartAutoCorrection] Fixed absolute import paths (leading / → ./)');
    }

    // FIRST-B: Replace phantom cn() import with clsx.
    // cn() is a training-data hallucination — generators import it even when src/utils/cn.ts
    // is absent from the workspace. The cross-file contract validator fires:
    //   "Cannot find module 'src/utils/cn' from '...'"
    // clsx is always available as a real npm package and has the same variadic API as cn().
    // This fix is deterministic: no LLM call, no path guessing.
    const hasCnPhantomImport = validationErrors.some(e =>
      e.includes('Cannot find module') && /\bcn\b|utils\/cn/.test(e)
    );
    if (hasCnPhantomImport) {
      // Remove any import line that brings in `cn` from a utils/cn path
      fixed = fixed.replace(
        /^import\s*\{[^}]*\bcn\b[^}]*\}\s*from\s*['"][^'"]*cn[^'"]*['"]\s*;?\n?/gm,
        ''
      );
      // Add clsx import at the top if cn() is still used in the file and clsx not already imported
      if (fixed.includes('cn(') && !/from\s+['"]clsx['"]/.test(fixed)) {
        fixed = `import { clsx } from 'clsx';\n` + fixed;
      }
      // Replace all cn( call sites with clsx(
      fixed = fixed.replace(/\bcn\(/g, 'clsx(');
      console.log('[SmartAutoCorrection] Replaced phantom cn() with clsx — src/utils/cn.ts not in workspace');
    }

    // FIRST: Merge split React imports (deterministic — no LLM needed)
    fixed = this.mergeSplitReactImports(fixed);

    // SECOND: Check for circular imports (always wrong)
    if (filePath) {
      fixed = this.fixCircularImports(fixed, filePath);
    }

    // THIRD: Deterministic import repair for "Symbol X not found in Y" cross-file contract errors.
    // Rather than handing the whole file to the LLM (which rewrites too much and breaks template literals),
    // do a targeted import-line fix: remove the wrong symbol, reroute to the correct source.
    const REACT_ROUTER_SYMBOLS = new Set([
      'BrowserRouter', 'Routes', 'Route', 'Navigate', 'Link', 'Outlet',
      'NavLink', 'useNavigate', 'useLocation', 'useParams', 'useSearchParams',
      'useMatch', 'RouterProvider',
    ]);
    for (const error of validationErrors) {
      const symbolMatch = error.match(/Symbol '(\w+)' not found in '([^']+)'\. Available exports: (.+)/);
      if (!symbolMatch) { continue; }
      const [, missingSymbol, sourceFilePath] = symbolMatch;
      const sourceBasename = sourceFilePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') ?? '';

      // 1. Remove missingSymbol from the wrong import (the source it doesn't belong to)
      const importRemoveRe = new RegExp(
        `^(import\\s*\\{)([^}]+)(\\}\\s*from\\s*['"][^'"]*${sourceBasename}['"])`,
        'm'
      );
      const wrongImportMatch = fixed.match(importRemoveRe);
      if (wrongImportMatch) {
        const symbols = wrongImportMatch[2]
          .split(',')
          .map(s => s.trim())
          .filter(s => s && s !== missingSymbol);
        const replacement = symbols.length > 0
          ? `${wrongImportMatch[1]} ${symbols.join(', ')} ${wrongImportMatch[3]}`
          : ''; // Remove entire import line if it's now empty
        fixed = fixed.replace(wrongImportMatch[0], replacement);
      }

      // 2. Re-route react-router-dom symbols to their correct package
      if (REACT_ROUTER_SYMBOLS.has(missingSymbol)) {
        const routerImportRe = /import\s*\{([^}]+)\}\s*from\s*['"]react-router-dom['"]/;
        const routerMatch = fixed.match(routerImportRe);
        if (routerMatch) {
          if (!routerMatch[1].includes(missingSymbol)) {
            const updated = routerMatch[0].replace(
              routerMatch[1],
              `${routerMatch[1].trim()}, ${missingSymbol}`
            );
            fixed = fixed.replace(routerMatch[0], updated);
          }
        } else {
          fixed = `import { ${missingSymbol} } from 'react-router-dom';\n` + fixed;
        }
      }
    }

    // FOURTH: Deterministic export default → named export conversion.
    // The validator flags "Export consistency: Component uses only a default export — named exports are required."
    // This is a structural transform, not a semantic one — always safe to do deterministically.
    const hasDefaultExportError = validationErrors.some(e =>
      e.includes('Export consistency') && e.includes('default export')
    );
    if (hasDefaultExportError) {
      // Pattern 1: `const Foo = ...; export default Foo;`
      // → add `export` to the const declaration, remove the `export default Foo;` line
      const defaultExportLineRe = /^export\s+default\s+(\w+)\s*;?\s*$/m;
      const defaultMatch = fixed.match(defaultExportLineRe);
      if (defaultMatch) {
        const componentName = defaultMatch[1];
        // Add export keyword to the const/function declaration if not already exported
        const declarationRe = new RegExp(
          `^(const|function|class)\\s+(${componentName}\\b)`,
          'm'
        );
        if (declarationRe.test(fixed) && !new RegExp(`^export\\s+(const|function|class)\\s+${componentName}\\b`, 'm').test(fixed)) {
          fixed = fixed.replace(declarationRe, `export $1 $2`);
        }
        // Remove the `export default ComponentName;` line
        fixed = fixed.replace(defaultExportLineRe, '');
        // Clean up any trailing blank lines left by the removal
        fixed = fixed.replace(/\n{3,}/g, '\n\n');
      }

      // Pattern 2: `export default function Foo(...)` → `export function Foo(...)`
      fixed = fixed.replace(/^export\s+default\s+(function\s+\w)/m, 'export $1');
    }

    // FIFTH: Convert template literals in JSX style objects to plain ternary expressions.
    // Template literals with ternary operators inside ${...} in style props (e.g.
    // `borderBottom: \`1px solid ${theme === 'dark' ? '#444' : '#ddd'}\``) consistently cause
    // TS1002 "Unterminated string literal" parse errors when the LLM mismatches backtick quotes.
    // They can also cause TS1005 "',' expected", TS1128 "Declaration or statement expected", and
    // TS1180 "Property destructuring pattern expected" as cascade parse errors from the same root
    // cause. All four share the same fix: convert the backtick template to a plain ternary.
    // The transform: `prefix${A ? B : C}suffix` → A ? 'prefixBsuffix' : 'prefixCsuffix'
    // Only applies for the common single-ternary-interpolation case used in theme style objects.
    // Fires when tsc reports TS1002 (unterminated string literal), OR when TS1005/TS1128/TS1180
    // appear alongside actual backtick template literals in style-like positions in the file.
    const hasUnterminatedStringLiteral = validationErrors.some(e => e.includes('TS1002'));
    const hasStyleTemplateLiteral = /:\s*`[^`]*\$\{[^}]+\}[^`]*`/.test(fixed);
    const hasCascadeParseError = validationErrors.some(e =>
      e.includes('TS1005') || e.includes('TS1128') || e.includes('TS1180') || e.includes('TS1434')
    );
    if (hasUnterminatedStringLiteral || (hasCascadeParseError && hasStyleTemplateLiteral)) {
      // Pattern: propertyName: `staticPrefix${condition ? trueLiteral : falseLiteral}staticSuffix`
      // e.g. borderBottom: `1px solid ${theme === 'dark' ? '#444' : '#ddd'}`
      fixed = fixed.replace(
        /:\s*`([^`$]*)\$\{([^}]+)\s*\?\s*(['"][^'"]*['"])\s*:\s*(['"][^'"]*['"])\}([^`]*)`/g,
        (_match, prefix, _cond, trueVal, falseVal, suffix) => {
          const condition = _cond.trim();
          const trueLiteral = trueVal.replace(/^['"]|['"]$/g, '');
          const falseLiteral = falseVal.replace(/^['"]|['"]$/g, '');
          const trueStr = prefix || suffix
            ? `'${prefix}${trueLiteral}${suffix}'`
            : trueVal;
          const falseStr = prefix || suffix
            ? `'${prefix}${falseLiteral}${suffix}'`
            : falseVal;
          return `: ${condition} ? ${trueStr} : ${falseStr}`;
        }
      );
    }

    // SEVENTH-A: Fix CSS string-literal properties in extracted style const variables — TS2322.
    // When a style object is assigned to a const variable, TypeScript widens string literals like
    // 'center' to `string`. CSSProperties expects the narrow literal type, so tsc reports TS2322:
    //   Type '{ textAlign: string; }' is not assignable to type 'Properties<...>'.
    // Fix: add `as const` to the value of known CSS properties that require string literal types.
    // Only fires when tsc reports TS2322 with 'Properties<string | number' in the message.
    const hasCSSPropertiesError = validationErrors.some(e =>
      e.includes('TS2322') && e.includes('Properties<string | number')
    );
    if (hasCSSPropertiesError) {
      const cssStringProps = [
        'textAlign', 'alignItems', 'alignSelf', 'justifyContent', 'justifySelf',
        'flexDirection', 'flexWrap', 'position', 'display', 'float',
        'overflow', 'overflowX', 'overflowY', 'whiteSpace', 'wordBreak',
        'textTransform', 'textDecoration', 'fontWeight', 'fontStyle',
        'verticalAlign', 'boxSizing', 'cursor', 'pointerEvents',
        'visibility', 'userSelect', 'resize',
      ];
      const propPattern = new RegExp(
        `((?:${cssStringProps.join('|')})\\s*:\\s*'[^']+')(?!\\s+as\\s+const)`,
        'g'
      );
      fixed = fixed.replace(propPattern, '$1 as const');
    }

    // SEVENTH: Fix `element={X.component}` — TS2322 ComponentType not assignable to ReactNode.
    // React Router's `element` prop expects ReactNode (a rendered element), not ComponentType
    // (a constructor/function). The generator sometimes passes the type directly instead of
    // calling it as JSX. Wrap in React.createElement() to produce a valid ReactElement.
    // Only fires when tsc reports TS2322 with ComponentType→ReactNode mismatch.
    const hasComponentTypeError = validationErrors.some(e =>
      e.includes('TS2322') && e.includes('ComponentType') && e.includes('ReactNode')
    );
    if (hasComponentTypeError) {
      fixed = fixed.replace(/\belement=\{(\w+\.component)\}/g, 'element={React.createElement($1)}');
    }

    validationErrors.forEach(error => {
      // Fix: React hook is used but not imported (e.g., "React hook 'useCallback' is used but not imported from React")
      // Also matches: "useState is used but not imported from React"
      let hookNotImportedMatch = error.match(/React hook '(\w+)' is used but not imported from React/);
      if (!hookNotImportedMatch) {
        hookNotImportedMatch = error.match(/^(\w+) is used but not imported from React/);
      }
      
      if (hookNotImportedMatch) {
        const hookName = hookNotImportedMatch[1];
        console.log(`[SmartAutoCorrection] Found hook '${hookName}' used but not imported`);
        
        // Check if the hook is actually used in the code
        if (fixed.includes(hookName)) {
          // Add the import at the top
          fixed = this.addImport(fixed, hookName, 'react');
          console.log(`[SmartAutoCorrection] Added import for ${hookName} from 'react'`);
        }
      }

      // Fix: Hook imported but never called → Remove the import
      // Pattern: "Hook 'useState' is imported but never called in src/..."
      if (error.includes('Hook') && error.includes('imported but never called')) {
        const hookMatch = error.match(/Hook '(\w+)' is imported but never called/);
        if (hookMatch) {
          const hookName = hookMatch[1];
          fixed = this.removeUnusedImport(fixed, hookName);
          console.log(`[SmartAutoCorrection] Removed unused hook import: ${hookName}`);
        }
      }

      // Fix: Unused import → Remove it
      if (error.includes('Unused import')) {
        const match = error.match(/Unused import: '(\w+)'/);
        if (match) {
          fixed = this.removeUnusedImport(fixed, match[1]);
        }
      }

      // Fix: Missing import → Add it
      if (error.includes('Missing import')) {
        // Try multiple patterns to extract the missing import name
        let match = error.match(/Missing import: '(\w+)'/);  // Pattern: 'name'
        if (!match) {
          match = error.match(/Missing import: (\w+) is used but not imported/);  // Pattern: name is used
        }
        if (!match) {
          match = error.match(/Missing import:\s+(\w+)/);  // Pattern: name
        }
        
        if (match) {
          const missingName = match[1];
          const source = this.inferImportSource(fixed, missingName);
          if (source) {
            fixed = this.addImport(fixed, missingName, source);
            console.log(`[SmartAutoCorrection] Added import for ${missingName} from '${source}'`);
          }
        }
      }

      // Fix: Any types → Replace with unknown
      if (error.includes('any')) {
        fixed = fixed.replace(/:\s*any\b/g, ': unknown');
        fixed = fixed.replace(/\bas\s+any\b/g, 'as unknown');
      }

      // Fix: Config/data .ts file imports from a store — remove the store import line entirely.
      // Config files have no React lifecycle so store hooks are invalid here.
      if (error.includes('Config File Store Import')) {
        // Remove any import line that imports from a store file
        fixed = fixed.replace(/^import\s+[^;]*from\s+['"][^'"]*\/stores\/[^'"]*['"];?\s*\n?/gm, '');
        console.log(`[SmartAutoCorrection] Removed store import from config/data .ts file`);
      }

      // Fix: Semicolons used as commas in TypeScript object literals (CSSProperties pattern).
      // LLM sometimes outputs CSS syntax (semicolons) inside TS object literals:
      //   const headerStyle: CSSProperties = { padding: '1rem'; display: 'flex'; }
      // TypeScript reports TS1005: ',' expected at these lines.
      // Strategy: use the line number from the error message to fix only the bad line.
      if (error.includes("',' expected") || error.includes('TS1005')) {
        const lineNumMatch = error.match(/\(line (\d+)\)/);
        if (lineNumMatch) {
          const lineNum = parseInt(lineNumMatch[1], 10);
          const lines = fixed.split('\n');
          if (lineNum > 0 && lineNum <= lines.length) {
            const targetLine = lines[lineNum - 1];
            const trimmed = targetLine.trim();
            // Only fix lines that look like object property assignments ending with ;
            // Skip comments, standalone statements, and interface declarations
            const isObjectProperty = trimmed
              && !trimmed.startsWith('//')
              && !trimmed.startsWith('*')
              && !trimmed.startsWith('interface')
              && !trimmed.startsWith('type ')
              && /^\w/.test(trimmed)
              && trimmed.includes(':')
              && /;\s*$/.test(targetLine);
            if (isObjectProperty) {
              lines[lineNum - 1] = targetLine.replace(/;\s*$/, ',');
              fixed = lines.join('\n');
              console.log(`[SmartAutoCorrection] Fixed semicolon→comma in object literal at line ${lineNum}`);
            }
          }
        }
      }

      // Fix: cn() imported but bare string className detected.
      // Replace all className="foo" / className='foo' / className={"foo"} / className={'foo'}
      // with className={cn('foo')} so the validator stops firing.
      if (error.includes('bare string literal')) {
        const importsCn = /import\s+.*\bcn\b.*from/.test(fixed);
        if (importsCn) {
          // className="foo bar" → className={cn('foo bar')}
          fixed = fixed.replace(/className="([^"]+)"/g, `className={cn('$1')}`);
          // className='foo bar' → className={cn('foo bar')}
          fixed = fixed.replace(/className='([^']+)'/g, `className={cn('$1')}`);
          // className={"foo bar"} → className={cn('foo bar')}
          fixed = fixed.replace(/className=\{"([^"]+)"\}/g, `className={cn('$1')}`);
          // className={'foo bar'} → className={cn('foo bar')}
          fixed = fixed.replace(/className=\{'([^']+)'\}/g, `className={cn('$1')}`);
          console.log(`[SmartAutoCorrection] Wrapped bare className strings in cn()`);
        }
      }

      // Fix: cn() imported but template-literal className used for concatenation.
      // className={`foo ${bar}`} → className={cn('foo', bar)}
      // Handles simple one-variable cases; complex template literals are left for LLM.
      if (error.includes('manual string concatenation')) {
        const importsCn = /import\s+.*\bcn\b.*from/.test(fixed);
        if (importsCn) {
          // Match: className={`staticPart ${varName}`}  (exactly one static part + one variable)
          fixed = fixed.replace(
            /className=\{`([^`${}]+)\$\{([^}]+)\}`\}/g,
            (_match, staticPart, varExpr) => {
              const base = staticPart.trim();
              const varName = varExpr.trim();
              return base
                ? `className={cn('${base}', ${varName})}`
                : `className={cn(${varName})}`;
            }
          );
          console.log(`[SmartAutoCorrection] Converted template-literal className to cn()`);
        }
      }

      // Fix: Unclosed braces — deterministic tail append
      // Common cause: LLM truncated the output; missing closing braces are at the end.
      // Extract the count from the error "Syntax error: N unclosed brace(s)" and append N '}'.
      if (error.includes('unclosed brace')) {
        const countMatch = error.match(/(\d+)\s+unclosed brace/);
        const missing = countMatch ? parseInt(countMatch[1], 10) : 1;
        const openCount = (fixed.match(/{/g) || []).length;
        const closeCount = (fixed.match(/}/g) || []).length;
        const actualMissing = Math.max(0, openCount - closeCount);
        const toAppend = actualMissing > 0 ? actualMissing : missing;
        console.log(`[SmartAutoCorrection] Appending ${toAppend} closing brace(s) to fix truncation`);
        fixed = fixed.trimEnd() + '\n' + '}'.repeat(toAppend);
      }
    });

    return fixed;
  }

  /**
   * Async variant of fixCommonPatterns — uses RAG resolver for unknown symbols.
   *
   * @param resolver  `(symbolName) => Promise<filePath | null>` — call
   *                  `codebaseIndex.resolveExportSource(name, embeddingClient)`.
   *                  Falls back to the hardcoded dict when resolver returns null.
   */
  static async fixCommonPatternsAsync(
    code: string,
    validationErrors: string[],
    resolver: (name: string) => Promise<string | null>,
    filePath?: string
  ): Promise<string> {
    // First: apply ALL synchronous deterministic fixes (mergeSplitReactImports, cn bare-string,
    // unclosed brace, any-type, etc.). fixCommonPatterns also handles fixCircularImports.
    let fixed = this.fixCommonPatterns(code, validationErrors, filePath);

    for (const error of validationErrors) {
      // React hook not imported
      let hookMatch = error.match(/React hook '(\w+)' is used but not imported from React/)
        ?? error.match(/^(\w+) is used but not imported from React/);
      if (hookMatch && fixed.includes(hookMatch[1])) {
        fixed = this.addImport(fixed, hookMatch[1], 'react');
        continue;
      }

      // Hook imported but never called
      if (error.includes('Hook') && error.includes('imported but never called')) {
        const m = error.match(/Hook '(\w+)' is imported but never called/);
        if (m) { fixed = this.removeUnusedImport(fixed, m[1]); }
        continue;
      }

      // Wrong import: cn in a non-component .ts file — remove the cn import entirely
      if (error.includes('Wrong import') && error.includes('cn')) {
        fixed = this.removeUnusedImport(fixed, 'cn');
        console.log(`[SmartAutoCorrection] Removed cn import from non-component .ts file`);
        continue;
      }

      // Dead import: cn imported in a .tsx file but never called — remove it
      if (error.includes('Dead import') && error.includes('cn')) {
        fixed = this.removeUnusedImport(fixed, 'cn');
        console.log(`[SmartAutoCorrection] Removed unused cn import from .tsx file`);
        continue;
      }

      // Mock Auth Bug: no falsy return path — cannot be fixed with a simple regex swap
      // (the truthy value may be !!token, Boolean(x), etc. — LLM correction handles it)
      if (error.includes('Mock Auth Bug')) {
        continue; // let the error propagate to LLM correction with the full error message
      }

      // Missing import — try RAG first, then dict fallback
      if (error.includes('Missing import')) {
        const m = error.match(/Missing import: '(\w+)'/)
          ?? error.match(/Missing import: (\w+) is used but not imported/)
          ?? error.match(/Missing import:\s+(\w+)/);
        if (m) {
          const name = m[1];
          const ragSource = await resolver(name);
          const dictSource = ragSource === null ? this.inferImportSource(fixed, name) : null;
          const source = ragSource ?? dictSource;
          if (source) {
            fixed = this.addImport(fixed, name, source);
            const via = ragSource ? '🔍 RAG index' : '📖 hardcoded dict';
            console.log(`[SmartAutoCorrection] Added import for '${name}' from '${source}' (via ${via})`);
          } else {
            console.warn(`[SmartAutoCorrection] ❌ Could not resolve import for '${name}' — neither RAG nor dict matched`);
          }
        }
        continue;
      }

      // Any types → unknown
      if (error.includes('any')) {
        fixed = fixed.replace(/:\s*any\b/g, ': unknown');
        fixed = fixed.replace(/\bas\s+any\b/g, 'as unknown');
      }
    }

    return fixed;
  }

  /**
   * Check if code is likely fixable automatically
   */
  static isAutoFixable(validationErrors: string[]): boolean {
    const fixablePatterns = [
      'Missing import',
      'Unused import',
      'Split React imports',             // Deterministic merge — no LLM needed
      'is used but not imported from React',  // NEW: Specific hook import pattern
      'any type',
      'typo',
      'Hook',  // Added: Hook usage errors (imported but never called)
      'imported but never called',  // Added: More specific pattern
      'Wrong import',  // Added: cn/UI import in a non-component .ts file
      'Dead import',   // Added: cn/UI import in a .tsx file that never uses it
      'bare string literal',        // Deterministic: className="foo" → className={cn('foo')}
      'manual string concatenation', // Deterministic: className={`foo ${bar}`} → className={cn('foo', bar)}
      'Config File Store Import',    // Deterministic: remove store imports from plain .ts config files
      "',' expected",                // Deterministic: semicolons used as commas in TS object literals (CSSProperties)
      'TS1005',                      // Same — TypeScript ',' expected error code
      'Wrong file extension',        // LLM corrector removes JSX from .ts file content (no rename needed)
      'Cross-file Contract',         // Deterministic: wrong symbol removed from import, rerouted to correct package
      'Export consistency',          // Deterministic: export default → named export transformation
    ];

    // NOTE: 'Wrong file extension' is NOT here — the corrector CAN fix this by removing JSX
    // from the content (it doesn't need to rename the file; the file extension is what the
    // planner intended, but the LLM put JSX inside a .ts file by mistake).
    const unfixablePatterns = [
      'unclosed brace',  // Deterministic fixer exists in fixCommonPatterns, but isAutoFixable must stay false
      'unmatched brace',
      'documentation instead of code',
      'multiple file',
    ];

    let hasFixable = false;
    let hasUnfixable = false;

    validationErrors.forEach(error => {
      const isUnfixable = unfixablePatterns.some(p => error.includes(p));
      const isFixable = fixablePatterns.some(p => error.includes(p));

      if (isUnfixable) {hasUnfixable = true;}
      if (isFixable) {hasFixable = true;}
    });

    // Fixable if has fixable errors and no unfixable ones
    return hasFixable && !hasUnfixable;
  }

  /**
   * Extract what a Zustand store actually exports
   * Analyzes the store code to find the initial state and actions
   * 
   * Example: create<LoginState>((set) => ({ email: '', password: '', setEmail: (e) => ... }))
   * Extracts: { email, password, setEmail }
   */
  static extractStoreExports(storeCode: string): string[] {
    const exports: string[] = [];
    
    // Look for create<Type>((set) => ({ ... }))
    const createMatch = storeCode.match(/create<[\w\s,|&]+>\s*\(\s*\(set\)\s*=>\s*\({([^}]+)}\)/s);
    if (createMatch) {
      const stateBlock = createMatch[1];
      // Extract property names (email: '', setEmail: (e) => ...)
      const propMatches = stateBlock.match(/(\w+)\s*[:=]/g) || [];
      propMatches.forEach(prop => {
        const name = prop.replace(/[:=].*/g, '').trim();
        if (name) {
          exports.push(name);
        }
      });
    }
    
    return exports.length > 0 ? exports : ['email', 'password']; // Default if extraction fails
  }

  /**
   * Fix Zustand component to match what the store actually exports
   * 
   * Problem: Component destructures `{ state, setFormData, handleSubmit }`
   * but store only exports `{ email, password }`
   * 
   * Solution: Fix the destructuring to only include what exists in the store
   */
  static fixZustandMismatch(componentCode: string, storeExports: string[]): string {
    if (storeExports.length === 0) {
      return componentCode;
    }

    // Find the destructuring pattern: const { ... } = useStore();
    const hookPattern = /const\s+{([^}]*)}\s*=\s*(use\w+)\s*\(\)/g;
    
    let fixed = componentCode;
    let match;
    
    while ((match = hookPattern.exec(componentCode)) !== null) {
      const currentDestructure = match[1];
      const hookName = match[2];
      
      // Only keep properties that exist in store
      const requestedProps = currentDestructure
        .split(',')
        .map(p => p.trim().split(/\s+as\s+/)[0].trim())
        .filter(p => storeExports.includes(p));
      
      if (requestedProps.length > 0 && requestedProps.length !== currentDestructure.split(',').length) {
        // The component was asking for properties that don't exist - fix it
        const newDestructure = requestedProps.join(', ');
        const oldLine = `const {${currentDestructure}} = ${hookName}()`;
        const newLine = `const { ${newDestructure} } = ${hookName}()`;
        
        fixed = fixed.replace(oldLine, newLine);
      }
    }
    
    return fixed;
  }

  /**
   * Overall strategy: If component imports from store but has mismatched properties,
   * and we have access to the store code, fix the component to match the store
   */
  static fixZustandComponentFromStore(
    componentCode: string,
    storeCode: string | undefined
  ): string {
    if (!storeCode) {
      return componentCode; // Can't fix without store code
    }
    
    const storeExports = this.extractStoreExports(storeCode);
    return this.fixZustandMismatch(componentCode, storeExports);
  }
}

export default SmartAutoCorrection;
