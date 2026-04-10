/**
 * Pure architecture rule validation utilities
 * These functions validate code against architecture rules without side effects
 * Only imports from types/, no service classes
 */

import type { ArchitectureViolation } from '../types/validation';

// ---------------------------------------------------------------------------
// Rule registry — OCP: add a new rule here; never edit validateArchitectureRulePure
// ---------------------------------------------------------------------------

interface ArchitectureRule {
  /** Must match an entry in the caller-supplied `rules` string array */
  name: string;
  check(content: string, filePath: string): ArchitectureViolation[];
}

const ARCHITECTURE_RULES: ArchitectureRule[] = [
  {
    name: 'TanStack Query',
    check: (content) => {
      if (!/fetch\s*\(/.test(content)) { return []; }
      return [{
        type: 'fetch_rule',
        severity: 'error',
        message: `❌ Rule violation: Using direct fetch() instead of TanStack Query.`,
        rule: 'TanStack Query',
        suggestion: `Use: const { data } = useQuery(...) or useMutation(...)`,
      }];
    },
  },
  {
    name: 'Zustand',
    check: (content) => {
      if (!content.includes('useSelector')) { return []; }
      return [{
        type: 'redux_rule',
        severity: 'error',
        message: `❌ Rule violation: Using Redux (useSelector) instead of Zustand.`,
        rule: 'Zustand',
        suggestion: `Use: const store = useStore() from your Zustand store`,
      }];
    },
  },
  {
    name: 'functional components',
    check: (content) => {
      if (!content.includes('extends React.Component')) { return []; }
      return [{
        type: 'class_component_rule',
        severity: 'error',
        message: `❌ Rule violation: Using class component instead of functional component.`,
        rule: 'functional components',
        suggestion: `Convert to: export function ComponentName() { ... }`,
      }];
    },
  },
  {
    name: 'strict TypeScript',
    check: (content) => {
      const violations: ArchitectureViolation[] = [];
      if (/const\s+\w+\s*=\s*\([^)]*\)\s*=>\s*(?!:)/.test(content)) {
        violations.push({
          type: 'typescript_strict',
          severity: 'warning',
          message: `⚠️ Rule: TypeScript strict mode requires return type annotations.`,
          rule: 'strict TypeScript',
          suggestion: `Arrow functions should be: const funcName = (...): ReturnType => { ... }`,
        });
      }
      const funcsWithoutReturn = content.match(/function\s+\w+\s*\([^)]*\)\s*{/g) ?? [];
      for (const func of funcsWithoutReturn) {
        const funcName = func.match(/function\s+(\w+)/)?.[1];
        if (funcName && !new RegExp(`function\\s+${funcName}\\s*\\([^)]*\\)\\s*:\\s*\\w+`).test(content)) {
          violations.push({
            type: 'typescript_strict',
            severity: 'warning',
            message: `⚠️ Function '${funcName}' missing return type annotation.`,
            rule: 'strict TypeScript',
            suggestion: `Use: function ${funcName}(...): ReturnType { ... }`,
          });
        }
      }
      return violations;
    },
  },
  {
    // Alias so both rule name strings resolve to the same check
    name: 'Never use implicit types',
    check: (content, filePath) =>
      ARCHITECTURE_RULES.find(r => r.name === 'strict TypeScript')!.check(content, filePath),
  },
  {
    name: 'Zod for all runtime validation',
    check: (content) => {
      const hasObjectParams = /\([^)]*{[^)]*}\s*[:|,)]/.test(content);
      const hasZodValidation = content.includes('z.parse') || content.includes('z.parseAsync');
      if (!hasObjectParams || hasZodValidation || content.includes('z.object')) { return []; }
      return [{
        type: 'zod_runtime_validation',
        severity: 'warning',
        message: `⚠️ Rule: Functions accepting objects should validate input with Zod.`,
        rule: 'Zod for all runtime validation',
        suggestion: `Example: const schema = z.object({ ... }); Then: const validated = schema.parse(input);`,
      }];
    },
  },
  {
    name: 'Zod',
    check: (content, filePath) => {
      const isComponent = filePath.includes('src/components/');
      const isFormComponent = filePath.includes('Form');
      const isUtilityFile = filePath.includes('/utils/') || /\.(util|helper)\.ts$/.test(filePath);
      if (!content.includes('type ') || content.includes('z.')) { return []; }
      if (isUtilityFile || (isComponent && !isFormComponent)) { return []; }
      return [{
        type: 'zod_validation',
        severity: 'info',
        message: `⚠️ Rule suggestion: Define validation schemas with Zod instead of just TypeScript types.`,
        rule: 'Zod',
        suggestion: `Example: const userSchema = z.object({ name: z.string(), email: z.string().email() })`,
      }];
    },
  },
];

// Pattern-based checks that always run regardless of the caller's rule list
const PATTERN_CHECKS: Array<(content: string) => ArchitectureViolation[]> = [
  (content) => {
    if (
      !(content.includes('useForm') || content.includes('react-hook-form')) ||
      !content.includes('z.') ||
      !(content.includes('async') && content.includes('validate'))
    ) { return []; }
    return [{
      type: 'zod_resolver',
      severity: 'error',
      message: `❌ Incorrect resolver pattern: Using manual async validation instead of zodResolver.`,
      rule: 'React Hook Form + Zod',
      suggestion: `Use: import { zodResolver } from '@hookform/resolvers/zod'; Then: useForm({ resolver: zodResolver(schema) })`,
    }];
  },
  (content) => {
    if (
      !(content.includes('yupResolver') && content.includes('z.object')) &&
      !(content.includes('yupResolver') && content.includes('zod'))
    ) { return []; }
    return [{
      type: 'mixed_validators',
      severity: 'error',
      message: `❌ Mixed validation libraries: yupResolver with Zod schema.`,
      rule: 'Mixed validator consistency',
      suggestion: `Use zodResolver for Zod schemas: import { zodResolver } from '@hookform/resolvers/zod'`,
    }];
  },
];

/**
 * Validate architecture rules for code.
 * Pure function — rule-based checks run only for names present in `rules`;
 * pattern-based checks always run.
 */
export function validateArchitectureRulePure(
  content: string,
  rules: string[],
  filePath: string = ''
): ArchitectureViolation[] {
  const violations: ArchitectureViolation[] = [];

  if (rules && rules.length > 0) {
    for (const rule of ARCHITECTURE_RULES) {
      if (rules.includes(rule.name)) {
        violations.push(...rule.check(content, filePath));
      }
    }
  }

  for (const check of PATTERN_CHECKS) {
    violations.push(...check(content));
  }

  return violations;
}

/**
 * Validate form component patterns
 * Pure function: checks 7 required form patterns (state, handlers, consolidator, submit, validation, error state, markup)
 */
export function validateFormPatternsPure(content: string, filePath: string): string[] {
  const errors: string[] = [];

  // Only validate if this is a form component
  if (!filePath.includes('Form') || !filePath.endsWith('.tsx')) {
    return errors;
  }

  // Pattern 1: State Interface
  const hasStateInterface =
    /interface\s+\w+State\s*{/.test(content) || /type\s+\w+State\s*=\s*{/.test(content);
  if (!hasStateInterface) {
    errors.push(
      `❌ Pattern 1 violation: Missing state interface. ` +
        `Forms require: interface LoginFormState { email: string; password: string; }`
    );
  }

  // Pattern 2: Handler Typing
  const hasFormEventHandler = /FormEventHandler\s*<\s*HTMLFormElement\s*>/.test(content);
  const hasInlineHandler = /const\s+handle\w+\s*=\s*\(\s*e\s*:\s*any\s*\)/.test(content);
  if (hasInlineHandler) {
    errors.push(
      `❌ Pattern 2 violation: Handler typed as 'any'. ` +
        `Use: const handleChange: FormEventHandler<HTMLFormElement> = (e) => { ... }`
    );
  }
  if (!hasFormEventHandler && (content.includes('handleChange') || content.includes('handleSubmit'))) {
    errors.push(
      `⚠️ Pattern 2 warning: Handlers should use FormEventHandler<HTMLFormElement> type.`
    );
  }

  // Pattern 3: Consolidator Pattern
  const fieldChangeHandlers = (
    content.match(
      /const\s+(handle(?:Change|Input|Update|Form(?!Submit))\w*)\s*=/gi
    ) || []
  ).length;
  const hasConsolidator =
    /\[name,\s*value\]\s*=\s*.*currentTarget/.test(content) ||
    /currentTarget.*name.*value/.test(content);

  if (fieldChangeHandlers > 1 && !hasConsolidator) {
    errors.push(
      `❌ Pattern 3 violation: Multiple field handlers instead of consolidator. ` +
        `Multi-field forms must use single handleChange: ` +
        `const handleChange = (e) => { const { name, value } = e.currentTarget; }`
    );
  }

  // Pattern 4: Submit Handler
  const hasFormElement = /<form/.test(content);
  const hasFormOnSubmit = /onSubmit\s*=\s*{?\s*handleSubmit/.test(content);
  const hasButtonOnClick = /<button[^>]*onClick\s*=\s*{?\s*handle/.test(content);

  if (!hasFormOnSubmit && hasFormElement) {
    errors.push(
      `❌ Pattern 4 violation: Missing form onSubmit handler. ` +
        `Use: <form onSubmit={handleSubmit}>` +
        `Then: const handleSubmit: FormEventHandler<HTMLFormElement> = (e) => { e.preventDefault(); ... }`
    );
  }
  if (hasButtonOnClick && !hasFormOnSubmit) {
    errors.push(
      `❌ Pattern 4 violation: Using button onClick instead of form onSubmit. ` +
        `Forms should handle submission via: <form onSubmit={handleSubmit}>`
    );
  }

  // Pattern 5: Validation Logic
  const hasValidationLogic =
    /if\s*\(\s*!/.test(content) || /setErrors\s*\(/.test(content) || /validate/.test(content);

  if (!hasValidationLogic && content.includes('email')) {
    errors.push(
      `⚠️ Pattern 5 info: Consider adding basic validation. ` +
        `Example: if (!email.includes('@')) { setErrors(...); return; }`
    );
  }

  // Pattern 6: Error State Tracking
  const hasErrorState = /useState\s*<\s*Record\s*<\s*string\s*,\s*string\s*>\s*>\s*\(\s*{}/.test(
    content
  );
  const hasErrorDisplay = /\{errors\.\w+/.test(content) || /errors\[\w+\]/.test(content);

  if (!hasErrorState && (content.includes('validation') || content.includes('error'))) {
    errors.push(
      `⚠️ Pattern 6 warning: Consider tracking field-level errors. ` +
        `Use: const [errors, setErrors] = useState<Record<string, string>>({})`
    );
  }

  // Pattern 7: Semantic Form Markup
  const hasNamedInputs = /name\s*=\s*['"]\w+['"]/.test(content);
  const hasInputElements = /<input|<textarea|<select/.test(content);

  if (hasInputElements && !hasNamedInputs) {
    errors.push(
      `❌ Pattern 7 violation: Input elements missing name attributes. ` +
        `Use: <input type="email" name="email" value={formData.email} />`
    );
  }

  return errors;
}

/**
 * Validate common code patterns
 * Pure function: checks for missing imports, unused imports, pattern violations
 */
export function validateCommonPatternsPure(content: string, filePath: string): string[] {
  const errors: string[] = [];

  // Check form component patterns first
  const formErrors = validateFormPatternsPure(content, filePath);
  if (formErrors.length > 0) {
    errors.push(...formErrors);
  }

  // Extract all imported items and namespaces
  const importedItems = new Set<string>();
  const importedNamespaces = new Set<string>();

  // Extract named imports (destructured)
  content.replace(/import\s+(?:\w+\s*,\s*)?{([^}]+)}/g, (_, items) => {
    items.split(',').forEach((item: string) => {
      importedItems.add(item.trim());
    });
    return '';
  });

  // Capture namespace imports (import * as X)
  content.replace(/import\s+\*\s+as\s+(\w+)/g, (_, namespace) => {
    importedNamespaces.add(namespace.trim());
    return '';
  });

  // Capture default imports
  content.replace(/import\s+(\w+)\s+from/g, (_, name) => {
    importedNamespaces.add(name.trim());
    return '';
  });

  // Collect all local variable definitions
  const localVariables = new Set<string>();

  // Collect function parameters
  content.replace(/\(([^)]*)\)\s*=>/g, (_, params) => {
    params.split(',').forEach((param: string) => {
      const cleaned = param.trim().split(/[:\s=]/)[0].trim();
      if (cleaned) {
        localVariables.add(cleaned);
      }
    });
    return '';
  });

  // Collect variable definitions
  content.replace(/(?:const|let|var)\s+(\w+)\s*[=;]/g, (_, varName) => {
    localVariables.add(varName.trim());
    return '';
  });

  // Collect destructured variables (object)
  content.replace(/(?:const|let|var)\s+{\s*([^}]+)\s*}/g, (_, vars) => {
    vars.split(',').forEach((v: string) => {
      const cleaned = v.trim().split(/[:=]/)[0].trim();
      if (cleaned) {
        localVariables.add(cleaned);
      }
    });
    return '';
  });

  // Collect array-destructured variables: const [email, setEmail] = ...
  content.replace(/(?:const|let|var)\s+\[\s*([^\]]+)\s*\]/g, (_, vars) => {
    vars.split(',').forEach((v: string) => {
      const cleaned = v.trim().split(/[:=\s]/)[0].trim();
      if (cleaned) {
        localVariables.add(cleaned);
      }
    });
    return '';
  });

  // Collect named function declaration parameters
  content.replace(/function\s+\w*\s*\(([^)]*)\)/g, (_, params) => {
    params.split(',').forEach((param: string) => {
      const cleaned = param.trim().split(/[:\s=]/)[0].trim();
      if (cleaned) {
        localVariables.add(cleaned);
      }
    });
    return '';
  });

  // Find namespace usages — (?<!\.) prevents false positives from chained access like foo.bar.baz()
  const namespaceUsages = new Set<string>();
  content.replace(/(?<!\.|\w)(\w+)\.\w+\s*[\(\{]/g, (match, namespace) => {
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
      'event',
      'ev',
      'err',
      'error',
    ];
    const isSingleLetter = namespace.length === 1;
    const isLocal = localVariables.has(namespace);

    if (!globalKeywords.includes(namespace) && !isSingleLetter && !isLocal) {
      namespaceUsages.add(namespace);
    }
    return '';
  });

  // Check if all used namespaces are imported
  Array.from(namespaceUsages).forEach(namespace => {
    if (!importedNamespaces.has(namespace) && !importedItems.has(namespace)) {
      errors.push(
        `❌ Missing import: '${namespace}' is used (${namespace}.something) but never imported. ` +
          `Add: import { ${namespace} } from '...' or import * as ${namespace} from '...'`
      );
    }
  });

  // Pattern: React/useState without import
  if (
    (content.includes('useState') || content.includes('useEffect')) &&
    !importedItems.has('useState') &&
    !importedItems.has('useEffect')
  ) {
    const useStateUsage = /\b(useState|useEffect)\s*\(/.test(content);
    if (useStateUsage && !importedItems.has('useState')) {
      errors.push(
        `❌ Missing import: useState is used but not imported. ` +
          `Add: import { useState } from 'react'`
      );
    }
  }

  return errors;
}

/**
 * Determine file context classification
 * Pure function: classifies files as utility/component/hook/form/unknown
 */
export function determineFileContextPure(filePath: string, description: string = ''): string {
  if (filePath.includes('/utils/') || filePath.match(/\.(util|helper)\.ts$/)) {
    return 'utility';
  }
  if (filePath.includes('Form') && filePath.includes('components')) {
    return 'form';
  }
  if (filePath.includes('components')) {
    return 'component';
  }
  if (filePath.includes('hooks')) {
    return 'hook';
  }
  if (description.toLowerCase().includes('form')) {
    return 'form';
  }
  return 'unknown';
}

/**
 * Check if file is "golden shielded" (uses cn.ts pattern)
 * Pure function: detects cn.ts pattern (twMerge + clsx combo)
 */
export function isGoldenShieldedPure(filePath: string, content: string): boolean {
  // Golden Shield: cn.ts file itself or files using the cn pattern
  if (filePath.includes('cn.ts') || filePath.includes('cn.tsx')) {
    return true;
  }

  // Check if file imports and uses cn from cn.ts
  const importsFromCn =
    /import\s+{\s*cn\s*}\s+from\s+['"].*cn['"]/.test(content) ||
    /import\s+{\s*cn\s+.*}\s+from/.test(content);

  const usesCnPattern =
    /cn\s*\(\s*['"]\w+['"],\s*{/.test(content) || /cn\s*\(\s*.*clsx/.test(content);

  return importsFromCn && usesCnPattern;
}
