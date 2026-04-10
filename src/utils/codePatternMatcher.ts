/**
 * Pure code pattern matching utilities
 * Reusable pattern detection functions for validators
 * Only imports from types/, no service classes
 */

/**
 * Extract form patterns from code
 * Pure function: detects state interfaces, handlers, consolidators, etc.
 */
export function matchFormPatterns(
  code: string
): Array<{
  type: string;
  found: boolean;
  details?: string;
}> {
  const patterns = [];

  // Pattern 1: State Interface
  const hasStateInterface =
    /interface\s+\w+State\s*{/.test(code) || /type\s+\w+State\s*=\s*{/.test(code);
  patterns.push({
    type: 'stateInterface',
    found: hasStateInterface,
    details: hasStateInterface ? 'Found state interface/type' : 'Missing state interface',
  });

  // Pattern 2: Form Event Handlers
  const hasFormEventHandler = /FormEventHandler\s*<\s*HTMLFormElement\s*>/.test(code);
  patterns.push({
    type: 'formEventHandler',
    found: hasFormEventHandler,
    details: hasFormEventHandler ? 'Using FormEventHandler<HTMLFormElement>' : 'Not using FormEventHandler',
  });

  // Pattern 3: Consolidator Pattern
  const fieldChangeHandlers = (
    code.match(/const\s+(handle(?:Change|Input|Update|Form(?!Submit))\w*)\s*=/gi) || []
  ).length;
  const hasConsolidator =
    /\[name,\s*value\]\s*=\s*.*currentTarget/.test(code) ||
    /currentTarget.*name.*value/.test(code);
  patterns.push({
    type: 'consolidator',
    found: hasConsolidator || fieldChangeHandlers <= 1,
    details: `${fieldChangeHandlers} field handlers, consolidator: ${hasConsolidator}`,
  });

  // Pattern 4: Form Element & onSubmit
  const hasFormElement = /<form/.test(code);
  const hasFormOnSubmit = /onSubmit\s*=\s*{?\s*handleSubmit/.test(code);
  patterns.push({
    type: 'formSubmitHandler',
    found: !hasFormElement || hasFormOnSubmit,
    details: `Form element: ${hasFormElement}, onSubmit handler: ${hasFormOnSubmit}`,
  });

  // Pattern 5: Validation Logic
  const hasValidationLogic =
    /if\s*\(\s*!/.test(code) || /setErrors\s*\(/.test(code) || /validate/.test(code);
  patterns.push({
    type: 'validationLogic',
    found: hasValidationLogic,
    details: hasValidationLogic ? 'Found validation logic' : 'Missing validation logic',
  });

  // Pattern 6: Error State
  const hasErrorState = /useState\s*<\s*Record\s*<\s*string\s*,\s*string\s*>\s*>\s*\(\s*{}/.test(
    code
  );
  patterns.push({
    type: 'errorState',
    found: hasErrorState,
    details: hasErrorState ? 'Using Record<string, string> for error state' : 'Not using error state',
  });

  // Pattern 7: Named Inputs
  const hasNamedInputs = /name\s*=\s*['"]\w+['"]/.test(code);
  const hasInputElements = /<input|<textarea|<select/.test(code);
  patterns.push({
    type: 'namedInputs',
    found: !hasInputElements || hasNamedInputs,
    details: `Input elements: ${hasInputElements}, named inputs: ${hasNamedInputs}`,
  });

  return patterns;
}

/**
 * Extract architecture patterns from code
 * Pure function: detects fetch/Redux/class components/TypeScript issues
 */
export function matchArchitecturePatterns(code: string): Array<{
  type: string;
  found: boolean;
  details?: string;
}> {
  const patterns = [];

  // Pattern 1: Direct fetch calls
  const hasFetchCalls = /fetch\s*\(/.test(code);
  patterns.push({
    type: 'directFetch',
    found: hasFetchCalls,
    details: hasFetchCalls ? 'Found direct fetch() calls' : 'No direct fetch calls',
  });

  // Pattern 2: Redux usage
  const hasReduxSelector = code.includes('useSelector');
  const hasReduxDispatch = code.includes('useDispatch');
  patterns.push({
    type: 'redux',
    found: hasReduxSelector || hasReduxDispatch,
    details: `useSelector: ${hasReduxSelector}, useDispatch: ${hasReduxDispatch}`,
  });

  // Pattern 3: Class components
  const hasClassComponent = /extends\s+React\.Component|extends\s+Component/.test(code);
  patterns.push({
    type: 'classComponent',
    found: hasClassComponent,
    details: hasClassComponent ? 'Found class component' : 'No class components',
  });

  // Pattern 4: TypeScript return types
  const arrowFunctionsWithoutReturnType = code.match(/const\s+\w+\s*=\s*\([^)]*\)\s*=>\s*(?!:)/g);
  const functionsWithoutReturnType = code.match(/function\s+\w+\s*\([^)]*\)\s*{/g);
  patterns.push({
    type: 'typeAnnotations',
    found: !arrowFunctionsWithoutReturnType && !functionsWithoutReturnType,
    details: `Arrow functions without return type: ${arrowFunctionsWithoutReturnType?.length || 0}, function declarations without return type: ${functionsWithoutReturnType?.length || 0}`,
  });

  // Pattern 5: Zod validation
  const hasZodUsage = /z\.object|z\.parse|z\.parseAsync|z\.string|z\.number/.test(code);
  patterns.push({
    type: 'zodValidation',
    found: hasZodUsage,
    details: hasZodUsage ? 'Using Zod validation' : 'No Zod validation',
  });

  // Pattern 6: React Hook Form + Zod
  const hasReactHookForm = /useForm|react-hook-form/.test(code);
  const hasZodResolver = /zodResolver|@hookform\/resolvers\/zod/.test(code);
  patterns.push({
    type: 'zodResolver',
    found: !hasReactHookForm || hasZodResolver,
    details: `React Hook Form: ${hasReactHookForm}, zodResolver: ${hasZodResolver}`,
  });

  // Pattern 7: Mixed validation libraries
  const hasYupResolver = /yupResolver|yup/.test(code);
  const hasMixedResolvers = hasYupResolver && hasZodUsage;
  patterns.push({
    type: 'mixedValidation',
    found: !hasMixedResolvers,
    details: hasMixedResolvers ? 'Mixed Yup and Zod validation' : 'No mixed validation',
  });

  return patterns;
}

/**
 * Extract import patterns from code
 * Pure function: detects imported items and used imports
 */
export function matchImportPatterns(
  code: string
): {
  declared: Set<string>;
  used: Set<string>;
  missing: string[];
} {
  const declared = new Set<string>();
  const used = new Set<string>();
  const missing: string[] = [];

  // Extract all declared imports
  // Named imports: { x, y }
  code.replace(/import\s+(?:\w+\s*,\s*)?{([^}]+)}/g, (_, items) => {
    items.split(',').forEach((item: string) => {
      declared.add(item.trim());
    });
    return '';
  });

  // Namespace imports: * as X
  code.replace(/import\s+\*\s+as\s+(\w+)/g, (_, namespace) => {
    declared.add(namespace.trim());
    return '';
  });

  // Default imports
  code.replace(/import\s+(\w+)\s+from/g, (_, name) => {
    declared.add(name.trim());
    return '';
  });

  // Collect local variables to exclude from "used" analysis
  const localVariables = new Set<string>();

  // Function parameters
  code.replace(/\(([^)]*)\)\s*=>/g, (_, params) => {
    params.split(',').forEach((param: string) => {
      const cleaned = param.trim().split(/[:\s=]/)[0].trim();
      if (cleaned) {
        localVariables.add(cleaned);
      }
    });
    return '';
  });

  // Variable definitions
  code.replace(/(?:const|let|var)\s+(\w+)\s*[=;]/g, (_, varName) => {
    localVariables.add(varName.trim());
    return '';
  });

  // Destructured variables
  code.replace(/(?:const|let|var)\s+{\s*([^}]+)\s*}/g, (_, vars) => {
    vars.split(',').forEach((v: string) => {
      const cleaned = v.trim().split(/[:=]/)[0].trim();
      if (cleaned) {
        localVariables.add(cleaned);
      }
    });
    return '';
  });

  // Find used imports
  code.replace(/(\w+)\.\w+\s*[\(\{]|(\w+)\s*\(/g, (match, namespace, funcName) => {
    const name = namespace || funcName;
    if (name) {
      const globalKeywords = [
        'console',
        'Math',
        'Object',
        'Array',
        'String',
        'Number',
        'JSON',
        'Date',
        'window',
        'document',
        'this',
        'super',
        'return',
        'throw',
        'if',
        'else',
        'for',
        'while',
      ];
      const isSingleLetter = name.length === 1;
      const isLocal = localVariables.has(name);

      if (!globalKeywords.includes(name) && !isSingleLetter && !isLocal && declared.has(name)) {
        used.add(name);
      }
    }
    return '';
  });

  // Detect missing imports (used but not declared)
  const allIdentifiers = new Set<string>();
  code.replace(/\b([a-zA-Z_$]\w*)\b/g, (match) => {
    allIdentifiers.add(match);
    return '';
  });

  Array.from(allIdentifiers).forEach(identifier => {
    if (!declared.has(identifier) && !localVariables.has(identifier)) {
      const globalKeywords = [
        'console',
        'Math',
        'Object',
        'Array',
        'String',
        'Number',
        'JSON',
        'Date',
        'window',
        'document',
        'return',
        'if',
        'else',
        'for',
        'while',
        'const',
        'let',
        'var',
        'function',
        'class',
        'export',
        'import',
        'from',
        'async',
        'await',
        'try',
        'catch',
        'finally',
        'true',
        'false',
        'null',
        'undefined',
        'typeof',
        'instanceof',
      ];
      if (!globalKeywords.includes(identifier) && identifier.length > 1) {
        // Could be missing import
      }
    }
  });

  return { declared, used, missing };
}

/**
 * Detect import and syntax issues in code
 * Pure function: finds missing imports, syntax errors, library-specific issues
 */
export function findImportAndSyntaxIssuesPure(
  code: string,
  filePath: string = ''
): Array<{
  type: 'missing_import' | 'syntax_error' | 'library_issue' | 'jsx_issue';
  severity: 'error' | 'warning';
  message: string;
}> {
  const issues: Array<{
    type: 'missing_import' | 'syntax_error' | 'library_issue' | 'jsx_issue';
    severity: 'error' | 'warning';
    message: string;
  }> = [];

  // Extract imported items and namespaces
  const importedItems = new Set<string>();
  const importedNamespaces = new Set<string>();

  // Named imports: { x, y }
  code.replace(/import\s+(?:\w+\s*,\s*)?{([^}]+)}/g, (_, items) => {
    items.split(',').forEach((item: string) => {
      importedItems.add(item.trim());
    });
    return '';
  });

  // Namespace imports: * as X
  code.replace(/import\s+\*\s+as\s+(\w+)/g, (_, namespace) => {
    importedNamespaces.add(namespace.trim());
    return '';
  });

  // Default imports: import React from 'react'
  code.replace(/import\s+(\w+)\s+from/g, (_, name) => {
    importedNamespaces.add(name.trim());
    return '';
  });

  // Collect local variables to exclude from analysis
  const localVariables = new Set<string>();

  // Helper: extract param names from "email: string, password: string"
  const addParamsCPM = (params: string) => {
    params.split(',').forEach((p: string) => {
      const name = p.trim().split(/[:\s=<(]/)[0].trim();
      if (name && /^[a-zA-Z_$]/.test(name)) { localVariables.add(name); }
    });
  };
  // Arrow function params: (email) =>
  code.replace(/\(([^)]*)\)\s*=>/g, (_, params) => { addParamsCPM(params); return ''; });
  // Named function declarations: function foo(email: string)
  code.replace(/function\s+\w*\s*\(([^)]*)\)/g, (_, params) => { addParamsCPM(params); return ''; });

  // Variable definitions
  code.replace(/(?:const|let|var)\s+(\w+)\s*[=;]/g, (_, varName) => {
    localVariables.add(varName.trim());
    return '';
  });

  // Destructured variables
  code.replace(/(?:const|let|var)\s+{\s*([^}]+)\s*}/g, (_, vars) => {
    vars.split(',').forEach((v: string) => {
      const cleaned = v.trim().split(/[:=]/)[0].trim();
      if (cleaned) {
        localVariables.add(cleaned);
      }
    });
    return '';
  });

  // Array destructuring: const [x, y] = ...
  code.replace(/(?:const|let|var)\s+\[\s*([^\]]+)\s*\]/g, (_, vars) => {
    vars.split(',').forEach((v: string) => {
      const cleaned = v.trim().split(/[:=\s]/)[0].trim();
      if (cleaned) { localVariables.add(cleaned); }
    });
    return '';
  });

  // Find namespace usages — (?<!\.) prevents false positives from chained access like foo.bar.baz()
  const namespaceUsages = new Set<string>();
  code.replace(/(?<!\.|\w)(\w+)\.\w+\s*[\(\{]/g, (match, namespace) => {
    const globalKeywords = [
      'console', 'Math', 'Object', 'Array', 'String', 'Number', 'JSON', 'Date',
      'window', 'document', 'this', 'super',
      // Common event/error parameter names
      'event', 'e', 'err', 'error', 'ev',
    ];
    const isSingleLetter = namespace.length === 1;
    const isLocal = localVariables.has(namespace);

    if (!globalKeywords.includes(namespace) && !isSingleLetter && !isLocal) {
      namespaceUsages.add(namespace);
    }
    return '';
  });

  // Check if all used namespaces are imported
  Array.from(namespaceUsages).forEach((namespace) => {
    if (!importedNamespaces.has(namespace) && !importedItems.has(namespace)) {
      issues.push({
        type: 'missing_import',
        severity: 'error',
        message: `Missing import: '${namespace}' is used but never imported. Add: import { ${namespace} } from '...' or import * as ${namespace} from '...'`,
      });
    }
  });

  // Check for useState/useEffect without import
  if ((code.includes('useState') || code.includes('useEffect')) && !importedItems.has('useState') && !importedItems.has('useEffect')) {
    const useStateUsage = /\b(useState|useEffect)\s*\(/.test(code);
    if (useStateUsage && !importedItems.has('useState')) {
      issues.push({
        type: 'missing_import',
        severity: 'error',
        message: `Missing import: useState is used but not imported. Add: import { useState } from 'react'`,
      });
    }
  }

  // Check for unclosed braces
  const openBraces = (code.match(/{/g) || []).length;
  const closeBraces = (code.match(/}/g) || []).length;
  if (openBraces > closeBraces) {
    issues.push({
      type: 'syntax_error',
      severity: 'error',
      message: `Syntax error: ${openBraces - closeBraces} unclosed brace(s)`,
    });
  }

  // Check for JSX without React import
  if ((filePath.endsWith('.jsx') || filePath.endsWith('.tsx')) && code.includes('<')) {
    if (!importedItems.has('React') && !importedNamespaces.has('React')) {
      issues.push({
        type: 'jsx_issue',
        severity: 'warning',
        message: `Possible issue: JSX detected but no React import. Modern React (17+) doesn't require this, but check your tsconfig.json`,
      });
    }
  }

  // Check for typo in @hookform/resolvers
  if (code.includes('@hookform/resolve') && !code.includes('@hookform/resolvers')) {
    issues.push({
      type: 'library_issue',
      severity: 'error',
      message: `Typo detected: '@hookform/resolve' is not a valid package. Did you mean '@hookform/resolvers'?`,
    });
  }

  // Check for TanStack Query without proper import
  if (code.includes('useQuery') || code.includes('useMutation')) {
    if (!code.includes('@tanstack/react-query')) {
      issues.push({
        type: 'library_issue',
        severity: 'error',
        message: `TanStack Query used but not imported correctly. Add: import { useQuery, useMutation } from '@tanstack/react-query'`,
      });
    }
  }

  // Check for Zod imports
  if (code.includes('z.') && !code.includes("import { z }") && !code.includes("import * as z")) {
    issues.push({
      type: 'library_issue',
      severity: 'error',
      message: `Zod used (z.object, z.string, etc) but not imported. Add: import { z } from 'zod'`,
    });
  }

  // Check for unused imports (sophisticated dual-pattern matching)
  const unusedImports: string[] = [];
  importedItems.forEach((item) => {
    // Skip common React hooks that might be used indirectly
    if (['React', 'Component'].includes(item)) {
      return;
    }

    // Pattern 1: Used as value/identifier: Item.x or Item(...) or Item[...]
    const valueUsagePattern = new RegExp(`\\b${item}\\s*[\\.(\\[]`, 'g');
    const valueMatches = code.match(valueUsagePattern) || [];

    // Pattern 2: Used as type annotation (e.g., : ClassValue or ClassValue[])
    const typeUsagePattern = new RegExp(`[:\\s<]${item}[\\s\\[,>]`, 'g');
    const typeMatches = code.match(typeUsagePattern) || [];

    // If used in either value or type position, it's not unused
    if (valueMatches.length === 0 && typeMatches.length === 0) {
      unusedImports.push(item);
    }
  });

  if (unusedImports.length > 0) {
    unusedImports.forEach((unused) => {
      issues.push({
        type: 'missing_import',
        severity: 'warning',
        message: `Unused import: '${unused}' is imported but never used. Remove: import { ${unused} } from '...'`,
      });
    });
  }

  // Return type checks
  if (code.includes('JSON.stringify') && code.includes(': string | null')) {
    issues.push({
      type: 'library_issue',
      severity: 'warning',
      message: `Return type mismatch: JSON.stringify() returns 'string', not 'string | null'. Fix: Change return type to just 'string'`,
    });
  }

  if (code.includes('JSON.parse') && code.includes(': any')) {
    issues.push({
      type: 'library_issue',
      severity: 'warning',
      message: `Type issue: JSON.parse() result should not be 'any'. Use a Zod schema or specific type instead of 'any'`,
    });
  }

  return issues;
}
