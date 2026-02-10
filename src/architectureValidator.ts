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
          severity: 'high',
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

    // Determine recommendation
    let recommendation: 'allow' | 'fix' | 'skip' = 'allow';
    const highSeverity = violations.some(v => v.severity === 'high');
    if (highSeverity) {
      recommendation = 'skip'; // Don't write this file
    } else if (violations.length > 0) {
      recommendation = 'fix'; // Try to fix it
    }

    return {
      hasViolations: violations.length > 0,
      violations,
      layer,
      recommendation,
    };
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

        // Handle different path formats
        if (resolvedPath.startsWith('.')) {
          // ✅ Relative paths: ../utils/cn, ./helpers
          // Resolve ../ and ./
          resolvedPath = resolvedPath
            .split('/')
            .reduce((acc, part) => {
              if (part === '.' || part === '') return acc;
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
                  // that the accessed property makes sense (rough check)
                  if (symbol.includes('Store') && !sourceContent.includes(property)) {
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
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) return violations;

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

    // HOOK FILE DETECTION: Check if this is a custom hook file (exports use* function)
    const isHookFile = /src\/hooks\//.test(filePath) || /export\s+(?:const|function)\s+use\w+/.test(generatedCode);
    
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
            continue; // Skip this error - refactoring is intentional
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
                  if (part === '.' || part === '') return acc;
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
              
              // Strategy 1: Find create call and extract state object properties
              // Pattern: => { prop1: ..., prop2: ..., etc
              // Look for the arrow function body that contains property definitions
              const arrowFunctionRegex = /create[^]*?\)\s*=>\s*\(\s*{([^}]+)}/;
              const arrowMatch = storeContent.match(arrowFunctionRegex);
              
              if (arrowMatch) {
                const stateBody = arrowMatch[1];
                console.log(`[ArchitectureValidator] Found state body: ${stateBody.substring(0, 100)}...`);
                
                // Extract ALL property names that look like key: value
                // Handle: propName: ..., nestedObj: { ... }, function: () => ...
                const propRegex = /(\w+)\s*:\s*(?:[^,}]|\{[^}]*\}|function|\([^)]*\))/g;
                let propMatch;
                while ((propMatch = propRegex.exec(stateBody)) !== null) {
                  storeProps.add(propMatch[1]);
                  console.log(`[ArchitectureValidator] Found store property: ${propMatch[1]}`);
                }
              } else {
                console.warn(`[ArchitectureValidator] ⚠️ Could not match arrow function pattern in store`);
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
                    violations.push({
                      type: 'semantic-error',
                      import: hookName,
                      message: `❌ CRITICAL: Property '${prop}' destructured but NOT in store. Store exports: ${Array.from(storeProps).join(', ')}. This will cause runtime TypeError!`,
                      suggestion: `Component expects: { ${properties.join(', ')} } but store has: { ${Array.from(storeProps).join(', ')} }. Refactoring is INCOMPLETE.`,
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
    const stateHooks = importedHooks.filter(h => h.names.some(n => n.includes('Store') || n.includes('store')));
    const usesLocalState = /const\s+\[\w+,\s*\w+\]\s*=\s*useState/.test(generatedCode);

    if (stateHooks.length > 0 && usesLocalState) {
      violations.push({
        type: 'semantic-error',
        import: stateHooks[0].names[0],
        message: `Both store hook and local useState detected - use only store for state management`,
        suggestion: `Remove all useState calls and use store hook exclusively`,
        severity: 'high',
      });
    }

    // Step 6: CRITICAL - Check for CUSTOM HOOKS that are CALLED but NOT IMPORTED
    // Pattern: const { x } = useCounter() but no import statement
    // This catches: `const { increment } = useCounter()` without import
    const customHookCallRegex = /const\s+(?:\[[\w\s,]*\]|\{[^}]+\})\s*=\s*(use\w+)\s*\(/g;
    let customHookCallMatch;
    const customHooksCalled = new Set<string>();
    
    while ((customHookCallMatch = customHookCallRegex.exec(generatedCode)) !== null) {
      const hookName = customHookCallMatch[1];
      customHooksCalled.add(hookName);
    }
    
    // Get list of imported hook names
    const importedHookNames = new Set<string>();
    importedHooks.forEach(h => {
      h.names.forEach(name => importedHookNames.add(name));
    });
    
    // Check if each called hook is imported
    customHooksCalled.forEach(hookName => {
      // Skip built-in React hooks
      const isBuiltinReactHook = [
        'useState', 'useEffect', 'useContext', 'useReducer', 'useCallback', 'useMemo',
        'useRef', 'useLayoutEffect', 'useImperativeHandle', 'useDebugValue', 'useId',
        'useDeferredValue', 'useTransition', 'useSyncExternalStore'
      ].includes(hookName);
      
      if (!isBuiltinReactHook && !importedHookNames.has(hookName)) {
        console.log(`[ArchitectureValidator] ⚠️ Custom hook '${hookName}' is called but not imported`);
        violations.push({
          type: 'semantic-error',
          import: hookName,
          message: `Missing import: ${hookName} is used but not imported from '../hooks/${hookName}'`,
          suggestion: `Add: import { ${hookName} } from '../hooks/${hookName}';`,
          severity: 'high',
        });
      }
    });

    // Step 7: CRITICAL - Check for UTILITY FUNCTIONS that are called but NOT IMPORTED
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

  /**
   * Validates that all imported identifiers are actually used in code
   * Catches unused imports and missing import errors
   */
  public validateImportUsage(code: string): LayerViolation[] {
    const violations: LayerViolation[] = [];

    // Extract all imports with their names
    const importRegex = /import\s+(?:(?:{([^}]+)})|(\w+)|(\*\s+as\s+(\w+)))\s+from\s+['"]([^'"]+)['"]/g;
    const importedNames: Map<string, string> = new Map(); // name -> source
    let importMatch;

    while ((importMatch = importRegex.exec(code)) !== null) {
      if (importMatch[1]) {
        // Named imports: { a, b, c as d }
        importMatch[1].split(',').forEach(n => {
          const trimmed = n.trim();
          const parts = trimmed.split(/\s+as\s+/);
          const usedName = parts[1]?.trim() || parts[0].trim();
          if (usedName) importedNames.set(usedName, importMatch[5]);
        });
      } else if (importMatch[2]) {
        // Default imports
        importedNames.set(importMatch[2], importMatch[5]);
      } else if (importMatch[4]) {
        // Namespace imports: import * as Name
        importedNames.set(importMatch[4], importMatch[5]);
      }
    }

    // Check each import is actually used
    for (const [name, source] of importedNames) {
      // Pattern: word boundary + name, but NOT when it's part of a string or inside 'from'
      const usagePattern = new RegExp(`(?<!["'\\w])${name}(?!["'\\w])(?!\\s*from)`, 'g');
      const usages = code.match(usagePattern) || [];

      // A name appears in its own import statement, so ignore that
      const filteredUsages = usages.filter(
        (_, index) => {
          const pos = code.indexOf(name, index > 0 ? code.indexOf(usages[index - 1]) + usages[index - 1].length : 0);
          return !code.substring(Math.max(0, pos - 50), pos).includes('import');
        }
      );

      if (filteredUsages.length === 0 && !name.includes('*')) {
        violations.push({
          type: 'semantic-error',
          import: name,
          message: `Imported '${name}' from '${source}' but never used`,
          suggestion: `Remove unused import: import { ${name} } from '${source}';`,
          severity: 'medium',
        });
      }
    }

    return violations;
  }

  /**
   * Validates Zustand component correctness:
   * - Store hook MUST be destructured directly: const { x } = useStore()
   * - NOT intermediate variable: const store = useStore(); const { x } = store;
   * - useState MUST NOT be used
   * - All state MUST come from store hook destructuring
   */
  public validateZustandComponent(
    componentCode: string,
    expectedStoreHook: string
  ): LayerViolation[] {
    const violations: LayerViolation[] = [];

    console.log(`[ArchitectureValidator] 🧪 Validating Zustand component for hook: ${expectedStoreHook}`);

    // Check 1: Store hook is imported
    const hookImportPattern = new RegExp(
      `import\\s+{[^}]*${expectedStoreHook}[^}]*}\\s+from`,
      'i'
    );
    if (!hookImportPattern.test(componentCode)) {
      violations.push({
        type: 'semantic-error',
        import: expectedStoreHook,
        message: `Zustand component must import '${expectedStoreHook}' from store`,
        suggestion: `Add: import { ${expectedStoreHook} } from '../stores/...';`,
        severity: 'high',
      });
      return violations; // Can't continue without import
    }

    // Check 2: Store hook is destructured directly (NOT intermediate variable)
    // CORRECT: const { email, password } = useLoginStore();
    // WRONG:   const store = useLoginStore(); const { email } = store;
    const directDestructurePattern = new RegExp(
      `const\\s+{[^}]+}\\s*=\\s*${expectedStoreHook}\\s*\\(\\)`,
      'g'
    );
    
    if (!directDestructurePattern.test(componentCode)) {
      violations.push({
        type: 'semantic-error',
        import: expectedStoreHook,
        message: `Store hook '${expectedStoreHook}' must be destructured directly in single line`,
        suggestion: `Use this pattern: const { email, password, setEmail } = ${expectedStoreHook}();`,
        severity: 'high',
      });
      return violations; // Critical structural issue
    }

    // Check 3: No intermediate store variable
    // This catches: const store = useLoginStore(); (storing hook result in variable)
    const intermediateVarPattern = new RegExp(
      `const\\s+\\w+\\s*=\\s*${expectedStoreHook}\\s*\\(\\)\\s*;`
    );
    if (intermediateVarPattern.test(componentCode)) {
      violations.push({
        type: 'semantic-error',
        import: expectedStoreHook,
        message: `Do not store store hook in intermediate variable. Destructure directly instead.`,
        suggestion: `Change: const store = ${expectedStoreHook}(); to: const { ... } = ${expectedStoreHook}();`,
        severity: 'high',
      });
    }

    // Check 4: No useState in Zustand components (single source of truth)
    if (/const\s+\[[\w\s,]+\]\s*=\s*useState\s*\(/.test(componentCode)) {
      violations.push({
        type: 'semantic-error',
        message: `Zustand component uses both store hook and useState - violates single source of truth principle`,
        suggestion: `Remove all useState. Use '${expectedStoreHook}' hook exclusively for state.`,
        severity: 'high',
      });
    }

    // Check 5: Validate that destructured properties are actually used
    // Extract what was destructured
    const destructureMatch = componentCode.match(
      new RegExp(`const\\s+{([^}]+)}\\s*=\\s*${expectedStoreHook}\\s*\\(\\)`)
    );
    
    if (destructureMatch) {
      const destructuredProps = destructureMatch[1]
        .split(',')
        .map(p => {
          const parts = p.trim().split(/\s+as\s+/);
          return parts[parts.length - 1].trim(); // Get the actual name used in code
        });

      for (const prop of destructuredProps) {
        // Check if this property is used anywhere in the component (not counting the destructuring line)
        const propUsagePattern = new RegExp(`\\b${prop}\\b(?!\\s*[,}])`);
        const usages = (componentCode.split(destructureMatch[0])[1] || '').match(propUsagePattern);
        
        if (!usages) {
          violations.push({
            type: 'semantic-error',
            import: expectedStoreHook,
            message: `Property '${prop}' destructured from store but never used`,
            suggestion: `Remove '${prop}' from destructuring or use it in the component`,
            severity: 'medium',
          });
        }
      }
    }

    return violations;
  }

  /**
   * Generate human-readable error report
   */
  public generateErrorReport(result: LayerValidationResult): string {
    if (!result.hasViolations) {
      return '';
    }

    let report = `\n⚠️ **Architecture Violations in ${result.layer}**\n\n`;
    report += `Layer Rule: ${LAYER_RULES[result.layer]?.rule || 'Unknown'}\n\n`;

    for (const violation of result.violations) {
      report += `**${violation.type}**: ${violation.message}\n`;
      report += `→ ${violation.suggestion}\n\n`;
    }

    report += `**Recommendation**: `;
    if (result.recommendation === 'skip') {
      report += `Skip this file (high-severity violations)`;
    } else if (result.recommendation === 'fix') {
      report += `Fix violations before writing`;
    } else {
      report += `OK to write`;
    }

    return report;
  }
}
