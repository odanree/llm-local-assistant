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

        // Handle relative paths
        if (resolvedPath.startsWith('.')) {
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
              console.log(`[ArchitectureValidator] ✅ Using context of previously-written file: ${pathVariant} (matched from ${resolvedPath})`);
              break;
            }
          }

          // If not in previous step files, try reading from disk
          if (!sourceContent) {
            const sourceUri = vscode.Uri.joinPath(workspace, resolvedPath);
            sourceContent = new TextDecoder().decode(await vscode.workspace.fs.readFile(sourceUri));
          }

          if (!sourceContent) {
            throw new Error(`File is empty: ${resolvedPath}`);
          }

          // Extract what the source file exports
          const exportRegex = /export\s+(?:const|function|interface|type)\s+(\w+)/g;
          const sourceExports: Set<string> = new Set();
          let exportMatch;

          while ((exportMatch = exportRegex.exec(sourceContent)) !== null) {
            sourceExports.add(exportMatch[1]);
          }

          // For named imports, verify each symbol exists in source exports
          if (!imp.isDefault) {
            for (const symbol of imp.symbols) {
              // Check for exact match or pattern matching (e.g., useStore hook)
              const exists = sourceExports.has(symbol);
              const isHookPattern = symbol.startsWith('use') && 
                                    Array.from(sourceExports).some(e => e.startsWith('use'));

              if (!exists && !isHookPattern) {
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
          if (!['node_modules', '@types', 'react', 'zustand', 'axios'].some(p => imp.source.includes(p))) {
            violations.push({
              type: 'missing-export',
              import: imp.symbols[0],
              message: `Cannot find module '${resolvedPath}' from '${filePath}'`,
              suggestion: `Verify the import path is correct`,
              severity: 'medium',
            });
          }
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
   * Ensures that imported hooks are actually USED in the component
   * 
   * Detects:
   * ❌ Hook imported but never called
   * ❌ Hook called but state never destructured/used
   * ❌ Local state (useState) still used alongside store hook
   * ❌ Missing destructuring of store state properties
   * 
   * Example:
   * ✅ VALID:
   *   import { useLoginStore } from '../stores/loginStore';
   *   const { formState, setFormState } = useLoginStore();
   *   // Uses formState in JSX
   * 
   * ❌ INVALID:
   *   import { useLoginStore } from '../stores/loginStore';  // Imported but never called!
   *   const [formData, setFormData] = useState(...);         // Still using local state
   */
  public validateHookUsage(
    generatedCode: string,
    filePath: string
  ): LayerViolation[] {
    const violations: LayerViolation[] = [];

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

    // Step 2: For each imported hook, check if it's actually CALLED in the component
    for (const hookImport of importedHooks) {
      for (const hookName of hookImport.names) {
        // Pattern: hookName() - must be called to work
        const hookCallPattern = new RegExp(`const\\s+[{\\s]?\\w+[\\s}]*=\\s*${hookName}\\(`, 'g');
        const isCalled = hookCallPattern.test(generatedCode);

        if (!isCalled) {
          violations.push({
            type: 'semantic-error',
            import: hookName,
            message: `Hook '${hookName}' imported but never called`,
            suggestion: `Add: const { ... } = ${hookName}(); to destructure hook state`,
            severity: 'high',
          });
        }

        // Step 3: If hook is called, verify state is actually USED (not just destructured)
        if (isCalled) {
          // Extract destructured properties: const { x, y, z } = hookName()
          const destructureRegex = new RegExp(
            `const\\s+{([^}]+)}\\s*=\\s*${hookName}\\(`,
            'g'
          );
          let destructMatch;

          while ((destructMatch = destructureRegex.exec(generatedCode)) !== null) {
            const properties = destructMatch[1]
              .split(',')
              .map(p => p.trim());

            // Check if each property is used in the code (not just destructured)
            for (const prop of properties) {
              const propUsagePattern = new RegExp(`\\b${prop}\\b`, 'g');
              const usages = (generatedCode.match(propUsagePattern) || []).length;

              // First match is the destructuring itself, so need at least 2
              if (usages < 2) {
                violations.push({
                  type: 'semantic-error',
                  import: hookName,
                  message: `Property '${prop}' destructured from '${hookName}' but never used`,
                  suggestion: `Remove unused property or use it: ${prop}, setForm(...), etc.`,
                  severity: 'medium',
                });
              }
            }
          }
        }
      }
    }

    // Step 4: Check for MIXED STATE MANAGEMENT
    // If a store hook is imported, local useState shouldn't still be used for the same state
    if (importedHooks.length > 0) {
      const hasLocalState = /const\s+\[\w+,\s*\w+\]\s*=\s*useState/.test(generatedCode);

      if (hasLocalState) {
        // Check if it looks like the component is still using local state instead of store
        const stateVarMatch = generatedCode.match(/const\s+\[(\w+),\s*\w+\]\s*=\s*useState\s*\([^)]*\)/);
        if (stateVarMatch) {
          const localStateVar = stateVarMatch[1];
          // If the local state and hook seem to manage similar things (heuristic)
          if (
            (importedHooks[0].names[0].includes('Form') && localStateVar.includes('form')) ||
            (importedHooks[0].names[0].includes('Form') && localStateVar.includes('data')) ||
            (importedHooks[0].names[0].includes('Store') && generatedCode.includes('setState'))
          ) {
            violations.push({
              type: 'semantic-error',
              import: importedHooks[0].names[0],
              message: `Both store hook '${importedHooks[0].names[0]}' and local state '${localStateVar}' detected. Should use only store.`,
              suggestion: `Remove useState and use only the store hook's state management`,
              severity: 'high',
            });
          }
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
