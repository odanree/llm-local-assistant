/**
 * SemanticValidator: Deep code analysis for hidden bugs
 * 
 * Purpose: Catch subtle errors that don't show up in syntax checking
 * - Name collisions (importing 'cn' then declaring function 'cn')
 * - Ghost function calls (calling functions that don't exist)
 * - Undefined variable usage
 * - Scope conflicts
 * 
 * Speed: O(n) regex analysis (<1ms)
 * vs tsc: O(n²) full compilation (seconds)
 */

export interface SemanticError {
  type: 'name-collision' | 'undefined-call' | 'scope-conflict' | 'reference-error';
  target: string;
  message: string;
  severity: 'error' | 'warning';
  line?: number;
}

export class SemanticValidator {
  /**
   * Comprehensive semantic audit
   * Catches the bugs that hide in plain sight
   */
  public static audit(content: string): SemanticError[] {
    const errors: SemanticError[] = [];

    // Check 1: Name Collisions (The "cn" vs "cn" hallucination)
    errors.push(...this.detectNameCollisions(content));

    // Check 2: Ghost Function Calls (The "tailwindMerge" bug)
    errors.push(...this.detectUndefinedCalls(content));

    // Check 3: Scope Conflicts (Import shadowing)
    errors.push(...this.detectScopeConflicts(content));

    return errors;
  }

  /**
   * Detect Name Collisions
   * 
   * Problem: Model imports 'cn' from utility, then declares export function 'cn'
   * This creates a scope conflict - which 'cn' is which?
   * 
   * Example (WRONG):
   * ```
   * import { cn } from '@/utils/cn';  // Import named 'cn'
   * export function cn() { }          // Also declare function 'cn'
   * // ❌ Collision: Both named 'cn'
   * ```
   * 
   * Should be:
   * ```
   * import { merge } from '@/utils/cn';
   * export function cn() { }
   * ```
   */
  private static detectNameCollisions(content: string): SemanticError[] {
    const errors: SemanticError[] = [];

    // Extract all imported names
    const importedNames = new Set<string>();
    const importRegex = /import\s+(?:{([^}]+)}|(\w+))\s+from/g;
    let importMatch;

    while ((importMatch = importRegex.exec(content)) !== null) {
      const namedImports = importMatch[1];
      const defaultImport = importMatch[2];

      if (namedImports) {
        // Parse: import { name1, name2 as alias } from ...
        namedImports.split(',').forEach(part => {
          const match = part.trim().match(/(\w+)(?:\s+as\s+(\w+))?/);
          if (match) {
            const alias = match[2] || match[1];
            importedNames.add(alias);
          }
        });
      }

      if (defaultImport) {
        importedNames.add(defaultImport);
      }
    }

    // Extract all declared function/class/const names
    const declaredNames = new Set<string>();
    const declarePatterns = [
      /export\s+(?:default\s+)?function\s+(\w+)/g,
      /export\s+(?:default\s+)?class\s+(\w+)/g,
      /export\s+(?:default\s+)?const\s+(\w+)/g,
      /export\s+\{([^}]+)\}/g,
    ];

    declarePatterns.forEach(pattern => {
      let declareMatch;
      while ((declareMatch = pattern.exec(content)) !== null) {
        if (declareMatch[1]) {
          declareMatch[1].split(',').forEach(name => {
            const trimmed = name.trim().split(' ')[0];
            if (trimmed) {declaredNames.add(trimmed);}
          });
        }
      }
    });

    // Check for collisions
    importedNames.forEach(imported => {
      if (declaredNames.has(imported)) {
        errors.push({
          type: 'name-collision',
          target: imported,
          message: `❌ Name Collision: '${imported}' is both imported and declared as a function/class/const. This creates a scope conflict. Rename the import or the declaration.`,
          severity: 'error'
        });
      }
    });

    return errors;
  }

  /**
   * Detect Ghost Function Calls
   * 
   * Problem: Model calls functions that aren't imported or defined
   * This causes "undefined function" runtime errors
   * 
   * Example (WRONG):
   * ```
   * export function Button() {
   *   return tailwindMerge(cn()); // tailwindMerge is undefined!
   * }
   * ```
   * 
   * Should be:
   * ```
   * import { twMerge } from 'tailwind-merge';
   * export function Button() {
   *   return twMerge(cn());
   * }
   * ```
   */
  private static detectUndefinedCalls(content: string): SemanticError[] {
    const errors: SemanticError[] = [];

    // Extract all function calls
    const callRegex = /(\w+)\(/g;
    const calls = new Set<string>();
    let callMatch;

    while ((callMatch = callRegex.exec(content)) !== null) {
      calls.add(callMatch[1]);
    }

    // Extract all defined names
    const definedNames = new Set<string>([
      // Built-in globals
      'React', 'console', 'window', 'document',
      'Array', 'Object', 'String', 'Number', 'Boolean',
      'Error', 'Promise', 'Set', 'Map', 'JSON',
      'Math', 'Date', 'RegExp', 'Symbol',
      // React
      'useState', 'useEffect', 'useContext', 'useRef',
      'useCallback', 'useMemo', 'useReducer',
      // Common utilities
      'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
    ]);

    // Add imported names
    const importRegex = /import\s+(?:{([^}]+)}|(\w+))\s+from/g;
    let importMatch;

    while ((importMatch = importRegex.exec(content)) !== null) {
      const namedImports = importMatch[1];
      const defaultImport = importMatch[2];

      if (namedImports) {
        namedImports.split(',').forEach(part => {
          const match = part.trim().match(/(\w+)(?:\s+as\s+(\w+))?/);
          if (match) {
            const alias = match[2] || match[1];
            definedNames.add(alias);
          }
        });
      }

      if (defaultImport) {
        definedNames.add(defaultImport);
      }
    }

    // Add declared function names
    const funcRegex = /(?:export\s+)?(?:function\s+|const\s+)(\w+)\s*(?:=|function|=>)/g;
    let funcMatch;

    while ((funcMatch = funcRegex.exec(content)) !== null) {
      definedNames.add(funcMatch[1]);
    }

    // Check for undefined calls
    calls.forEach(call => {
      if (!definedNames.has(call)) {
        // These are actually fine - might be methods or other valid calls
        // Only report if they look like they should be defined
        if (!this.isLikelyMethodOrBuiltin(call)) {
          errors.push({
            type: 'undefined-call',
            target: call,
            message: `⚠️ Potential Issue: '${call}' is called but never imported or defined. Make sure it's available in scope.`,
            severity: 'warning'
          });
        }
      }
    });

    return errors;
  }

  /**
   * Detect Scope Conflicts
   * 
   * Problem: Variable or function shadows an import
   * This creates subtle bugs where behavior changes unexpectedly
   */
  private static detectScopeConflicts(content: string): SemanticError[] {
    const errors: SemanticError[] = [];

    // Extract all variable declarations
    const declareRegex = /(?:const|let|var)\s+(\w+)\s*=/g;
    const localVars = new Set<string>();
    let declareMatch;

    while ((declareMatch = declareRegex.exec(content)) !== null) {
      localVars.add(declareMatch[1]);
    }

    // Extract all imported names
    const importedNames = new Set<string>();
    const importRegex = /import\s+(?:{([^}]+)}|(\w+))\s+from/g;
    let importMatch;

    while ((importMatch = importRegex.exec(content)) !== null) {
      const namedImports = importMatch[1];
      const defaultImport = importMatch[2];

      if (namedImports) {
        namedImports.split(',').forEach(part => {
          const match = part.trim().match(/(\w+)(?:\s+as\s+(\w+))?/);
          if (match) {
            const alias = match[2] || match[1];
            importedNames.add(alias);
          }
        });
      }

      if (defaultImport) {
        importedNames.add(defaultImport);
      }
    }

    // Check for shadowing
    localVars.forEach(varName => {
      if (importedNames.has(varName)) {
        errors.push({
          type: 'scope-conflict',
          target: varName,
          message: `⚠️ Scope Conflict: '${varName}' is both imported and declared as a local variable. This shadows the import. Consider renaming.`,
          severity: 'warning'
        });
      }
    });

    return errors;
  }

  /**
   * Helper: Determine if a call is likely a method or builtin
   */
  private static isLikelyMethodOrBuiltin(name: string): boolean {
    // Single lowercase (likely a method or prop): .map, .filter, .then
    if (/^[a-z][a-z0-9]*$/.test(name) && name.length < 3) {
      return true;
    }

    // Known common builtins
    const commonCalls = [
      'push', 'pop', 'shift', 'unshift', 'slice', 'splice',
      'map', 'filter', 'reduce', 'forEach', 'find', 'includes',
      'split', 'join', 'trim', 'toUpperCase', 'toLowerCase',
      'then', 'catch', 'finally', 'resolve', 'reject',
      'toString', 'valueOf', 'constructor',
    ];

    return commonCalls.includes(name);
  }

  /**
   * Validate against Template Features (Single Source of Truth)
   * 
   * Instead of checking for exact string matches, verify that the code
   * has all the REQUIRED FEATURES defined in the template metadata.
   * 
   * This prevents logic desync: if features match, the code is correct.
   */
  public static validateAgainstTemplateFeatures(
    content: string,
    templateFeatures: any
  ): SemanticError[] {
    const errors: SemanticError[] = [];

    if (!templateFeatures) {
      return errors;
    }

    // Check 1: All required imports present
    if (templateFeatures.imports) {
      for (const importSpec of templateFeatures.imports) {
        const found = this.checkImportExists(content, importSpec);
        if (!found) {
          errors.push({
            type: 'reference-error',
            target: importSpec.name,
            message: `❌ Missing required import: import ${
              importSpec.type === 'type' ? 'type ' : ''
            }{ ${importSpec.name} } from '${importSpec.from}';`,
            severity: 'error'
          });
        }
      }
    }

    // Check 2: All required exports present
    if (templateFeatures.exports) {
      for (const exportSpec of templateFeatures.exports) {
        const found = this.checkExportExists(content, exportSpec);
        if (!found) {
          errors.push({
            type: 'reference-error',
            target: exportSpec.name,
            message: `❌ Missing required export: ${exportSpec.pattern}`,
            severity: 'error'
          });
        }
      }
    }

    return errors;
  }

  /**
   * Check if a specific import exists
   */
  private static checkImportExists(content: string, importSpec: any): boolean {
    if (importSpec.type === 'type') {
      // Check for: import type { Name } from 'library'
      const pattern = new RegExp(
        `import\\s+type\\s+.*\\b${importSpec.name}\\b.*from\\s+['"]${importSpec.from}['"]`,
        'i'
      );
      return pattern.test(content);
    } else {
      // Check for: import { Name } from 'library'
      const pattern = new RegExp(
        `import\\s+.*\\b${importSpec.name}\\b.*from\\s+['"]${importSpec.from}['"]`,
        'i'
      );
      return pattern.test(content);
    }
  }

  /**
   * Check if a specific export exists
   */
  private static checkExportExists(content: string, exportSpec: any): boolean {
    // Check for the pattern (e.g., "export const cn")
    const pattern = new RegExp(exportSpec.pattern, 'i');
    return pattern.test(content);
  }
}
