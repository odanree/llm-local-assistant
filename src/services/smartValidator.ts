/**
 * SmartValidator: Semantic Analysis for Generated Code
 * 
 * Problem: Syntax checkers miss semantic errors (undefined variables, import mismatches)
 * Solution: Heuristic semantic analysis before running expensive tsc
 * 
 * Purpose:
 * - Catch "classnames vs clsx" hallucinations
 * - Detect undefined variable usage
 * - Verify import/export consistency
 * - Identify missing type imports
 * 
 * Speed: O(n) regex + set operations (microseconds)
 * vs tsc: O(n²) full compilation (seconds)
 */

export interface SemanticError {
  type: 'undefined-variable' | 'import-mismatch' | 'missing-type' | 'unused-import';
  variable: string;
  message: string;
  severity: 'error' | 'warning';
}

export class SmartValidator {
  /**
   * Performs semantic analysis on generated code
   * Returns array of semantic errors found
   * 
   * Now context-aware: Applies rules based on file type
   */
  public static checkSemantics(
    content: string, 
    fileContext?: {
      type: string;
      requireNamedImports?: string[];
      forbidZod?: boolean;
      rules?: string[];
    }
  ): SemanticError[] {
    const errors: SemanticError[] = [];

    // Check 1: Undefined variables (most critical)
    errors.push(...this.checkUndefinedVariables(content));

    // Check 2: Import mismatches (context-aware)
    errors.push(...this.checkImportMismatches(content, fileContext));

    // Check 3: Missing type imports
    errors.push(...this.checkMissingTypeImports(content));

    // Check 4: Unused imports (warning only)
    errors.push(...this.checkUnusedImports(content));

    // Check 5: Context-specific rules (NEW)
    if (fileContext?.forbidZod) {
      errors.push(...this.checkForbiddenZod(content, fileContext));
    }

    return errors;
  }

  /**
   * Check 1: Undefined Variables
   * Detects when a variable is used but never defined or imported
   * 
   * Example catch:
   * ```
   * import { clsx } from 'clsx'; // clsx imported as 'clsx'
   * export function cn() {
   *   return classnames(...); // ❌ 'classnames' is undefined
   * }
   * ```
   */
  private static checkUndefinedVariables(content: string): SemanticError[] {
    const errors: SemanticError[] = [];

    // Extract all identifiers used in the code
    const usedVariables = new Set<string>();
    const identifierRegex = /[a-zA-Z_$][0-9a-zA-Z_$]*(?=\s*[\(\.\[=]|$)/g;
    let match;

    while ((match = identifierRegex.exec(content)) !== null) {
      const identifier = match[0];
      // Filter out keywords and builtins
      if (!this.isCommonKeyword(identifier) && !this.isTypeScriptKeyword(identifier)) {
        usedVariables.add(identifier);
      }
    }

    // Extract all defined variables (imports + declarations)
    const definedVariables = new Set<string>([
      // Built-in globals
      'React', 'console', 'window', 'document', 'window',
      'Array', 'Object', 'String', 'Number', 'Boolean',
      'Error', 'Promise', 'Set', 'Map', 'JSON',
      'Math', 'Date', 'RegExp', 'Symbol', 'BigInt',
    ]);

    // Add imported names
    this.getImportedNames(content).forEach(name => definedVariables.add(name));

    // Add declared names (const, let, var, function, class, interface, type)
    this.getDeclaredNames(content).forEach(name => definedVariables.add(name));

    // Check for undefined usage
    usedVariables.forEach(varName => {
      if (!definedVariables.has(varName)) {
        errors.push({
          type: 'undefined-variable',
          variable: varName,
          message: `❌ Undefined variable: '${varName}' is used but not defined or imported. Did you mean to import this?`,
          severity: 'error'
        });
      }
    });

    return errors;
  }

  /**
   * Check 2: Import Mismatches
   * Detects when imports don't match the actual library names or export style
   * 
   * CRITICAL CHECKS (Danh's validation score enhancement):
   * - import clsx from 'clsx' ❌ (clsx is NOT a default export)
   * - import twMerge from 'tailwind-merge' ❌ (twMerge is NOT a default export)
   * 
   * Example catch:
   * ```
   * import clsx from 'classnames';  // ❌ 'classnames' doesn't exist
   * import clsx from 'clsx';  // ❌ clsx is NOT a default export
   * // Should be: import { clsx, type ClassValue } from 'clsx';
   * ```
   */
  private static checkImportMismatches(
    content: string,
    fileContext?: { type?: string; requireNamedImports?: string[] }
  ): SemanticError[] {
    const errors: SemanticError[] = [];

    // CONTEXT-AWARE: If file requires specific named imports, verify them
    if (fileContext?.requireNamedImports && fileContext.requireNamedImports.length > 0) {
      for (const requiredImport of fileContext.requireNamedImports) {
        // Check if this import is used
        if (content.includes(`${requiredImport}(`)) {
          // Used in code, so must be named import
          const namedPattern = new RegExp(`import\\s+.*\\{.*${requiredImport}.*\\}.*from\\s+['"][^'"]*['"]`);
          const defaultPattern = new RegExp(`import\\s+${requiredImport}\\s+from\\s+['"][^'"]*['"]`);

          if (defaultPattern.test(content)) {
            errors.push({
              type: 'import-mismatch',
              variable: requiredImport,
              message: `❌ CONTEXT-AWARE CHECK: '${requiredImport}' must be a named import in this file type. Found default import.`,
              severity: 'error'
            });
          } else if (!namedPattern.test(content)) {
            errors.push({
              type: 'import-mismatch',
              variable: requiredImport,
              message: `❌ CONTEXT-AWARE CHECK: '${requiredImport}' is used but not imported as named import`,
              severity: 'error'
            });
          }
        }
      }
    }

    // Generic library mismatch detection (applies to all files)
    // These are general checks that apply regardless of file context
    const knownMismatches = [
      {
        used: 'clsx',
        wrong: ['classnames', 'classname', 'clsxnames'],
        correct: 'clsx'
      },
      {
        used: 'twMerge',
        wrong: ['tailwindmerge', 'merge', 'tailwind-merge'],
        correct: 'tailwind-merge'
      }
    ];

    // Check each known mismatch pattern
    for (const mismatch of knownMismatches) {
      // Check if variable is used
      if (content.includes(mismatch.used)) {
        // Check if it's imported from wrong library
        for (const wrongLib of mismatch.wrong) {
          if (content.includes(`from '${wrongLib}'`) || content.includes(`from "${wrongLib}"`)) {
            errors.push({
              type: 'import-mismatch',
              variable: mismatch.used,
              message: `❌ Import mismatch: You're importing '${mismatch.used}' from '${wrongLib}', but it should be from '${mismatch.correct}'`,
              severity: 'error'
            });
          }
        }
      }
    }

    return errors;
  }

  /**
   * Check 3: Missing Type Imports
   * Detects when types are used but not imported as type imports
   * 
   * Example catch:
   * ```
   * export function cn(...inputs: ClassValue[]) {  // ❌ ClassValue not imported
   *   return twMerge(clsx(inputs));
   * }
   * // Should import: import type { ClassValue } from 'clsx';
   * ```
   */
  private static checkMissingTypeImports(content: string): SemanticError[] {
    const errors: SemanticError[] = [];

    // Known types that need to be imported
    const knownTypes = [
      { name: 'ClassValue', library: 'clsx' },
      { name: 'ClassProp', library: 'clsx' },
      { name: 'CSSClassName', library: 'tailwind-merge' }
    ];

    for (const type of knownTypes) {
      // Check if type is used
      if (new RegExp(`\\b${type.name}\\b`).test(content)) {
        // Check if it's imported with 'import type'
        const typeImportRegex = new RegExp(`import\\s+type.*\\b${type.name}\\b.*from\\s+['"]${type.library}['"]`);
        if (!typeImportRegex.test(content)) {
          errors.push({
            type: 'missing-type',
            variable: type.name,
            message: `❌ Missing type import: '${type.name}' is used but not imported as a type. Add: import type { ${type.name} } from '${type.library}';`,
            severity: 'error'
          });
        }
      }
    }

    return errors;
  }

  /**
   * Check 4: Unused Imports
   * Detects when libraries are imported but never used (warning level)
   */
  private static checkUnusedImports(content: string): SemanticError[] {
    const errors: SemanticError[] = [];

    const importedNames = this.getImportedNames(content);
    const importRegex = /import\s+(?:type\s+)?(?:{[\s\S]*?}|[\w*]+)\s+from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const libraryName = match[1];
      const importLine = match[0];

      // Extract names from import statement
      const namesMatch = importLine.match(/(?:{([\s\S]*?)}|import\s+(\w+))/);
      if (namesMatch) {
        const namesStr = namesMatch[1] || namesMatch[2];
        const names = namesStr
          .split(',')
          .map(n => n.trim().split(' as ')[0].trim())
          .filter(n => n && n !== '*');

        // Check if any imported name is actually used
        for (const name of names) {
          if (name && !content.includes(name)) {
            // Special case: React is often used implicitly with JSX
            if (name === 'React' && content.includes('jsx')) {continue;}

            errors.push({
              type: 'unused-import',
              variable: name,
              message: `⚠️ Unused import: '${name}' is imported from '${libraryName}' but never used`,
              severity: 'warning'
            });
          }
        }
      }
    }

    return errors;
  }

  /**
   * Extract all names imported in the file
   * Handles: import x from 'y', import { a, b } from 'y', import * as x from 'y'
   */
  private static getImportedNames(content: string): string[] {
    const names: string[] = [];
    const importRegex = /import\s+(?:type\s+)?(?:\{([\s\S]*?)\}|(\*\s+as\s+(\w+))|(\w+))\s+from/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) {
        // Named imports: { a, b, c as d }
        const named = match[1]
          .split(',')
          .map(n => n.trim().split(' as ')[0].trim())
          .filter(n => n);
        names.push(...named);
      } else if (match[3]) {
        // Star imports: * as React
        names.push(match[3]);
      } else if (match[4]) {
        // Default imports: import React
        names.push(match[4]);
      }
    }

    return names;
  }

  /**
   * Extract all declared variable/function/class/type names
   */
  private static getDeclaredNames(content: string): string[] {
    const names: string[] = [];

    // Match: const x, let x, var x, function x(), class X, interface X, type X
    const declRegex = /(?:const|let|var|function|class|interface|type)\s+([a-zA-Z_$][0-9a-zA-Z_$]*)/g;
    let match;

    while ((match = declRegex.exec(content)) !== null) {
      names.push(match[1]);
    }

    return names;
  }

  /**
   * Check if name is a common prop name or React keyword
   */
  private static isCommonKeyword(name: string): boolean {
    const keywords = [
      // React props
      'props', 'children', 'className', 'key', 'ref', 'style',
      // Common prop names
      'onClick', 'onChange', 'onSubmit', 'disabled', 'type', 'value',
      'placeholder', 'required', 'title', 'aria-label',
      // Util function inputs
      'inputs', 'args', 'params', 'options', 'config',
      // Common variables
      'error', 'warning', 'success', 'info',
      // HTML attributes
      'href', 'src', 'alt', 'target', 'rel'
    ];
    return keywords.includes(name);
  }

  /**
   * Check if name is a TypeScript/JavaScript keyword
   */
  private static isTypeScriptKeyword(name: string): boolean {
    const keywords = [
      'abstract', 'any', 'as', 'async', 'await',
      'boolean', 'break', 'case', 'catch', 'class', 'const', 'continue',
      'debugger', 'declare', 'default', 'delete', 'do',
      'else', 'enum', 'export', 'extends',
      'false', 'finally', 'for', 'from', 'function',
      'global', 'goto',
      'if', 'implements', 'import', 'in', 'instanceof', 'interface', 'is',
      'keyof',
      'let',
      'module', 'namespace', 'never', 'new', 'null', 'number',
      'of', 'out', 'override',
      'package', 'private', 'protected', 'public',
      'readonly', 'require', 'return',
      'static', 'string', 'super', 'switch', 'symbol',
      'this', 'throw', 'true', 'try', 'type', 'typeof',
      'unique',
      'var', 'void',
      'while', 'with',
      'yield'
    ];
    return keywords.includes(name);
  }

  /**
   * Format semantic errors for display/logging
   */
  public static formatErrors(errors: SemanticError[]): string {
    if (errors.length === 0) {
      return '✅ No semantic errors detected';
    }

    const errorsByType = errors.reduce((acc, err) => {
      acc[err.type] = (acc[err.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return errors
      .map(err => `${err.message}`)
      .join('\n');
  }

  /**
   * Check if errors are fatal (prevent execution) vs warnings
   */
  public static hasFatalErrors(errors: SemanticError[]): boolean {
    return errors.some(err => err.severity === 'error');
  }

  /**
   * Check 5: Context-specific rules
   * For utilities: Forbid Zod (utilities should never validate with Zod)
   */
  private static checkForbiddenZod(
    content: string,
    fileContext: { type?: string; forbidZod?: boolean }
  ): SemanticError[] {
    const errors: SemanticError[] = [];

    if (fileContext?.forbidZod && content.includes('z.object')) {
      errors.push({
        type: 'import-mismatch',
        variable: 'Zod',
        message: `❌ CONTEXT-AWARE RULE: Utilities should NOT use Zod schemas. Zod is for forms/validation only.`,
        severity: 'error'
      });
    }

    return errors;
  }
}
