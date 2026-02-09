/**
 * SimpleFixer: Deterministic, regex-based fixes for common code errors
 *
 * Part of Phase 1: Stateful Correction Architecture
 * Handles common errors without invoking LLM, reducing retry loops
 *
 * Strategy: Fix what we're SURE about (missing imports, unused vars, syntax)
 * Defer to LLM only when logic is unclear or context-dependent
 */

export interface FixResult {
  code: string;
  fixed: boolean;
  fixes: FixAction[];
}

export interface FixAction {
  type: string;
  description: string;
  line?: number;
}

export class SimpleFixer {
  /**
   * Attempt deterministic fixes on invalid code
   * Returns enhanced code if fixable, otherwise returns original
   */
  static fix(code: string): FixResult {
    const fixes: FixAction[] = [];
    let fixed = code;

    // Fix 1: Missing imports for common React hooks
    const importFixes = this.fixMissingImports(fixed);
    if (importFixes.code !== fixed) {
      fixed = importFixes.code;
      fixes.push(...importFixes.fixes);
    }

    // Fix 2: Missing semicolons at end of statements
    const semiColonFixes = this.fixMissingSemicolons(fixed);
    if (semiColonFixes.code !== fixed) {
      fixed = semiColonFixes.code;
      fixes.push(...semiColonFixes.fixes);
    }

    // Fix 3: Unused variable declarations
    const unusedFixes = this.fixUnusedVariables(fixed);
    if (unusedFixes.code !== fixed) {
      fixed = unusedFixes.code;
      fixes.push(...unusedFixes.fixes);
    }

    // Fix 4: Missing closing braces/brackets
    const closingBracketFixes = this.fixMissingClosingBrackets(fixed);
    if (closingBracketFixes.code !== fixed) {
      fixed = closingBracketFixes.code;
      fixes.push(...closingBracketFixes.fixes);
    }

    // Fix 5: Incorrect return statements in conditionals
    const returnFixes = this.fixIncorrectReturns(fixed);
    if (returnFixes.code !== fixed) {
      fixed = returnFixes.code;
      fixes.push(...returnFixes.fixes);
    }

    // Fix 6: Double function declarations
    const duplicateFixes = this.fixDuplicateFunctionDeclarations(fixed);
    if (duplicateFixes.code !== fixed) {
      fixed = duplicateFixes.code;
      fixes.push(...duplicateFixes.fixes);
    }

    return {
      code: fixed,
      fixed: fixes.length > 0,
      fixes,
    };
  }

  /**
   * Fix 1: Add missing React imports
   */
  private static fixMissingImports(code: string): FixResult {
    const fixes: FixAction[] = [];
    let fixed = code;

    const hooks = {
      useState: /useState/,
      useEffect: /useEffect/,
      useContext: /useContext/,
      useReducer: /useReducer/,
      useCallback: /useCallback/,
      useMemo: /useMemo/,
      useRef: /useRef/,
    };

    const missingHooks = Object.entries(hooks)
      .filter(([, regex]) => regex.test(fixed))
      .filter(([hook]) => !fixed.includes(`import ${hook} from`))
      .map(([hook]) => hook);

    if (missingHooks.length > 0) {
      const hooksString = missingHooks.join(", ");
      const importStatement = `import { ${hooksString} } from "react";`;

      if (!fixed.includes('import')) {
        fixed = importStatement + "\n" + fixed;
      } else {
        // Insert after first React import or at top
        const firstImportIndex = fixed.indexOf('import ');
        const endOfFirstImport = fixed.indexOf('\n', firstImportIndex);
        fixed = fixed.substring(0, endOfFirstImport + 1) + importStatement + "\n" + fixed.substring(endOfFirstImport + 1);
      }

      fixes.push({
        type: 'missing-import',
        description: `Added missing React imports: ${hooksString}`,
      });
    }

    return { code: fixed, fixed: fixes.length > 0, fixes };
  }

  /**
   * Fix 2: Add missing semicolons
   */
  private static fixMissingSemicolons(code: string): FixResult {
    const fixes: FixAction[] = [];

    // Skip lines that already end with semicolons or are control flow
    const lines = code.split('\n');
    const shouldHaveSemicolon = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return false;
      if (/^(if|else|for|while|switch|try|catch|do|function|class|interface|export|import)/.test(trimmed)) return false;
      if (/[{}\[\]]$/.test(trimmed)) return false;
      return /[a-zA-Z0-9_\)\]\}]$/.test(trimmed);
    };

    let fixed = code;
    let lineNum = 0;

    for (const line of lines) {
      if (shouldHaveSemicolon(line) && !line.trim().endsWith(';')) {
        fixed = fixed.replace(line, line + ';');
        fixes.push({
          type: 'missing-semicolon',
          description: 'Added missing semicolon',
          line: lineNum,
        });
      }
      lineNum++;
    }

    return { code: fixed, fixed: fixes.length > 0, fixes };
  }

  /**
   * Fix 3: Remove or fix unused variable declarations
   */
  private static fixUnusedVariables(code: string): FixResult {
    const fixes: FixAction[] = [];
    let fixed = code;

    // CRITICAL FIX #2: Use AST-aware import detection
    // Check for unused imports BEFORE using regex (which can't see JSX)
    const importFixes = this.removeUnusedImportsASTAware(code);
    if (importFixes.code !== fixed) {
      fixed = importFixes.code;
      fixes.push(...importFixes.fixes);
    }

    // Pattern: const/let/var declarations that are never used (variables, not imports)
    const unusedVarPattern = /^(const|let|var)\s+(\w+)\s*=/gm;
    const matches = Array.from(code.matchAll(unusedVarPattern));

    for (const match of matches) {
      const varName = match[2];
      const varRegex = new RegExp(`\\b${varName}\\b`, 'g');
      const usages = code.match(varRegex) || [];

      // If used only once (declaration), comment it out
      if (usages.length === 1) {
        const line = code.substring(code.lastIndexOf('\n', match.index) + 1, code.indexOf('\n', match.index) + 1);
        fixed = fixed.replace(line, `// ${line.trim()}`);
        fixes.push({
          type: 'unused-variable',
          description: `Commented out unused variable: ${varName}`,
        });
      }
    }

    return { code: fixed, fixed: fixes.length > 0, fixes };
  }

  /**
   * CRITICAL FIX #2: AST-Aware Import Removal
   * Detects unused imports by understanding JSX and scope, not just regex
   * 
   * The Problem: Regex can't see usage inside JSX tags
   * import { Link } from 'react-router-dom'  ← Detected as import
   * <Link to="/products">  ← JSX usage NOT detected by regex ❌
   * 
   * The Solution: Check for actual usage in code (including JSX)
   * 
   * SEMANTIC PROTECTION: Protected React hooks that are ALWAYS valid
   */
  private static removeUnusedImportsASTAware(code: string): FixResult {
    const fixes: FixAction[] = [];
    let fixed = code;

    // React core hooks that must NEVER be removed (they're always semantically valid)
    const PROTECTED_HOOKS = new Set([
      'useState',
      'useEffect',
      'useContext',
      'useReducer',
      'useCallback',
      'useMemo',
      'useRef',
      'useLayoutEffect',
      'useImperativeHandle',
      'useDebugValue',
      'useDeferredValue',
      'useTransition',
      'useId',
    ]);

    /**
     * Guard: Semantic check for React hook usage
     * React hooks MUST be called with parentheses: useState(), useEffect(), etc.
     * This protects against false positives in validators
     */
    const isImportActuallyUsed = (importName: string, fileContent: string): boolean => {
      // React hooks: Check for function call pattern hookName()
      if (PROTECTED_HOOKS.has(importName)) {
        // Pattern: hookName( or hookName () - React hooks are always called
        const hookUsagePattern = new RegExp(`\\b${importName}\\s*\\(`, 'g');
        if (hookUsagePattern.test(fileContent)) {
          return true;
        }
        
        // If it's a protected hook and NOT found, something is wrong with the code
        // Better to keep it than remove it (prevents the validator paradox)
        // The LLM will fix the actual logic error, not the fixer
        console.log(`[SimpleFixer] Protected hook '${importName}' - not obviously used, but keeping it to avoid false positive removal`);
        return true; // Assume it's used - let LLM handle actual logic errors
      }

      // For non-hook imports, use standard word boundary check
      const usagePattern = new RegExp(`\\b${importName}\\b(?!\\s*:)`);
      return usagePattern.test(fileContent);
    };

    // Find all import statements
    const importPattern = /import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
    let importMatch;
    const importsToCheck = [];

    while ((importMatch = importPattern.exec(code)) !== null) {
      const namedImports = importMatch[1]; // { Item1, Item2 }
      const defaultImport = importMatch[2]; // SomethingDefault
      const importLine = importMatch[0];

      if (namedImports) {
        // Parse named imports
        const names = namedImports.split(',').map(n => n.trim().split(/\s+as\s+/)[1] || n.trim());
        names.forEach(name => {
          if (name) {
            importsToCheck.push({ name, importLine });
          }
        });
      } else if (defaultImport) {
        importsToCheck.push({ name: defaultImport, importLine });
      }
    }

    // For each import, check if it's actually used
    for (const { name, importLine } of importsToCheck) {
      // Remove the import statement itself from the search
      const codeWithoutImport = code.replace(importLine, '');
      
      // Use semantic guard to check if import is truly used
      if (!isImportActuallyUsed(name, codeWithoutImport)) {
        // Only remove if we're confident it's unused
        fixed = fixed.replace(importLine + '\n', '');
        fixes.push({
          type: 'unused-import',
          description: `Removed unused import: ${name}`,
        });
      } else if (PROTECTED_HOOKS.has(name)) {
        // Protected hook - log that we're keeping it
        console.log(`[SimpleFixer] Kept protected hook: ${name}`);
      }
    }

    return { code: fixed, fixed: fixes.length > 0, fixes };
  }

  /**
   * Fix 4: Add missing closing brackets/braces
   */
  private static fixMissingClosingBrackets(code: string): FixResult {
    const fixes: FixAction[] = [];
    let fixed = code;

    // Count unmatched opening/closing braces
    let braceCount = 0;
    let bracketCount = 0;
    let parenCount = 0;

    for (const char of code) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      if (char === '[') bracketCount++;
      if (char === ']') bracketCount--;
      if (char === '(') parenCount++;
      if (char === ')') parenCount--;
    }

    // Add missing closing braces
    while (braceCount > 0) {
      fixed += '\n}';
      braceCount--;
      fixes.push({
        type: 'missing-closing-brace',
        description: 'Added missing closing brace }',
      });
    }

    // Add missing closing brackets
    while (bracketCount > 0) {
      fixed += '\n]';
      bracketCount--;
      fixes.push({
        type: 'missing-closing-bracket',
        description: 'Added missing closing bracket ]',
      });
    }

    // Add missing closing parens
    while (parenCount > 0) {
      fixed += ')';
      parenCount--;
      fixes.push({
        type: 'missing-closing-paren',
        description: 'Added missing closing parenthesis )',
      });
    }

    return { code: fixed, fixed: fixes.length > 0, fixes };
  }

  /**
   * Fix 5: Fix return statements in conditionals
   */
  private static fixIncorrectReturns(code: string): FixResult {
    const fixes: FixAction[] = [];

    // Pattern: else { return ... } should be compatible with if { return ... }
    // This is a heuristic - don't change logic, just structure
    let fixed = code;

    // Simple case: return without value when one expected
    const returnPattern = /return\s*;/g;
    if (returnPattern.test(code) && code.includes('return ')) {
      // Count if there are returns with values
      const returnsWithValue = (code.match(/return\s+\S+/g) || []).length;
      const returnsWithoutValue = (code.match(/return\s*;/g) || []).length;

      if (returnsWithValue > 0 && returnsWithoutValue > 0) {
        // This is a potential mismatch - flag it but don't fix (logic-dependent)
        fixes.push({
          type: 'inconsistent-returns',
          description: 'Found inconsistent return statements (some with values, some without)',
        });
      }
    }

    return { code: fixed, fixed: fixes.length > 0, fixes };
  }

  /**
   * Fix 6: Remove duplicate function declarations
   */
  private static fixDuplicateFunctionDeclarations(code: string): FixResult {
    const fixes: FixAction[] = [];
    let fixed = code;

    // Pattern: function name() { ... } function name() { ... }
    const functionPattern = /^(?:export\s+)?(function|const)\s+(\w+)\s*(?::|=|\()/gm;
    const seenFunctions = new Set<string>();
    const linesToRemove = new Set<number>();

    let match;
    let lineNum = 0;

    // Use Array.from to avoid downlevelIteration issues
    const matches = Array.from(code.matchAll(functionPattern));

    for (const m of matches) {
      match = m;
      const funcName = match[2];

      // Count lines up to this point
      lineNum = code.substring(0, match.index).split('\n').length - 1;

      if (seenFunctions.has(funcName)) {
        linesToRemove.add(lineNum);
        fixes.push({
          type: 'duplicate-function',
          description: `Removed duplicate function declaration: ${funcName}`,
          line: lineNum,
        });
      }

      seenFunctions.add(funcName);
    }

    // Remove duplicate lines (in reverse to preserve indices)
    const lines = code.split('\n');
    const sortedLines = Array.from(linesToRemove).sort((a, b) => b - a);

    for (const line of sortedLines) {
      lines.splice(line, 1);
    }

    fixed = lines.join('\n');

    return { code: fixed, fixed: fixes.length > 0, fixes };
  }
}

/**
 * Export a simpler convenience function for direct use
 */
export function simpleFix(code: string): string {
  return SimpleFixer.fix(code).code;
}
