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
