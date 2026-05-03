/**
 * executor-validator.ts
 *
 * Pure static validation helpers extracted from Executor.
 * No instance state, no side effects beyond the returned error strings.
 *
 * Extracted from executor.ts (lines 1096–1929) as Phase 3 of the executor decomposition.
 */

import { PlanStep } from './planner';
import { matchFormPatterns, findImportAndSyntaxIssuesPure } from './utils/codePatternMatcher';
import {
  isNonVisualWrapper,
  isStructuralLayout,
  isDecomposedNavigation,
} from './executor-code-classifier';

// ---------------------------------------------------------------------------
// Type validation
// ---------------------------------------------------------------------------

/**
 * Validate TypeScript type hygiene: markdown wrapping, documentation content,
 * multi-file references, type-only exports, and `any` usage.
 */
export function validateTypes(content: string, filePath: string): string[] {
  const errors: string[] = [];

  // CRITICAL: Check if content is documentation or markdown instead of code
  if (content.includes('```') || content.match(/^```/m)) {
    errors.push(
      `❌ Code wrapped in markdown backticks. This is not valid TypeScript. ` +
      `LLM provided markdown instead of raw code.`
    );
    return errors; // Stop validation, this is a critical error
  }

  if (content.includes('# Setup') || content.includes('## Installation') || content.includes('### Step')) {
    errors.push(
      `❌ Content appears to be documentation/tutorial instead of executable code. ` +
      `No markdown, setup instructions, or step-by-step guides allowed.`
    );
    return errors;
  }

  // Check for multiple file references
  const fileRefs = (content.match(/\/\/(.*\.(ts|tsx|js|json|yaml))/gi) || []).length;
  if (fileRefs > 1) {
    errors.push(
      `❌ Multiple file references detected in single-file output. ` +
      `This file should contain code for ${filePath.split('/').pop()} only, not instructions for other files.`
    );
    return errors;
  }

  // Check for common type issues
  if (content.includes('export type LoginFormValues') || content.match(/export type \w+ = {/)) {
    // Types might need validation, but let's check the content is valid TypeScript
    if (!content.includes('export function') && !content.includes('export const')) {
      errors.push(
        `⚠️ This file only exports types but no components/hooks. ` +
        `Make sure you're exporting the actual hook/component, not just types.`
      );
    }
  }

  // Pattern: any type usage (forbidden in strict projects)
  if (content.includes(': any') || content.includes('as any')) {
    errors.push(
      `❌ Found 'any' type. Use specific types or 'unknown' with type guards instead. ` +
      `Example: function process(data: unknown) { if (typeof data === 'string') { ... } }`
    );
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Form component pattern validation
// ---------------------------------------------------------------------------

/**
 * Validate form components against required patterns (state interface, handlers,
 * consolidator, onSubmit, validation, error tracking, semantic markup).
 * Only fires for .tsx files with "Form" in the name.
 */
export function validateFormComponentPatterns(content: string, filePath: string): string[] {
  const errors: string[] = [];

  // Only validate if this is a form component
  if (!filePath.includes('Form') || !filePath.endsWith('.tsx')) {
    return errors;
  }

  // Orchestration: Call the utility to extract all form patterns
  const patterns = matchFormPatterns(content);

  // Map results to error messages - keeping the orchestration logic
  const patternMap = new Map(patterns.map(p => [p.type, p.found]));

  // Pattern 1: State Interface
  // Skip when the form delegates state to a Zustand store — the interface lives there.
  const importsZustandStore = /import\s+\{[^}]*use\w+Store[^}]*\}/.test(content);
  if (!patternMap.get('stateInterface') && !importsZustandStore) {
    errors.push(
      `❌ Pattern 1 violation: Missing state interface. ` +
      `Forms require a typed state interface, e.g.: interface RegisterFormState { name: string; email: string; }`
    );
  }

  // Pattern 2: Handler Typing - needs additional checks beyond the pattern
  const hasFormEventHandler = patternMap.get('formEventHandler');
  const hasInlineHandler = /const\s+handle\w+\s*=\s*\(\s*e\s*:\s*any\s*\)/.test(content);
  if (hasInlineHandler) {
    errors.push(
      `❌ Pattern 2 violation: Handler typed as 'any'. ` +
      `Use: const handleChange: FormEventHandler<HTMLFormElement> = (e) => { ... }`
    );
  }
  // Critical: handler annotated with FormEvent (event type) instead of FormEventHandler (function type).
  // e.g. `const handleSubmit: FormEvent<HTMLFormElement> = ...` — TypeScript compile error because
  // FormEvent is the event object interface, not a callable function type.
  const handlersTypedAsEvent = [...content.matchAll(/const\s+(handle\w+)\s*:\s*FormEvent\s*</g)];
  for (const m of handlersTypedAsEvent) {
    errors.push(
      `❌ Pattern 2 violation: \`${m[1]}\` is annotated as \`FormEvent<...>\` which is an event object type, not a function type — this is a TypeScript compile error. ` +
      `Use: const ${m[1]}: FormEventHandler<HTMLFormElement> = (e) => { e.preventDefault(); ... }`
    );
  }
  if (!hasFormEventHandler && (content.includes('handleChange') || content.includes('handleSubmit'))) {
    errors.push(
      `⚠️ Pattern 2 warning: Handlers should use FormEventHandler<HTMLFormElement> type.`
    );
  }

  // Pattern 3: Consolidator Pattern
  const fieldChangeHandlers = (content.match(/const\s+(handle(?:Change|Input|Update|Form(?!Submit))\w*)\s*=/gi) || []).length;
  const hasConsolidator = /\[name,\s*value\]\s*=\s*.*currentTarget/.test(content) ||
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
  const hasValidationLogic = /if\s*\(\s*!/.test(content) ||
                             /setErrors\s*\(/.test(content) ||
                             /validate/.test(content);
  if (!hasValidationLogic && content.includes('email')) {
    errors.push(
      `⚠️ Pattern 5 info: Consider adding basic validation. ` +
      `Example: if (!email.includes('@')) { setErrors(...); return; }`
    );
  }

  // Pattern 6: Error State Tracking
  const hasErrorState = /useState\s*<\s*Record\s*<\s*string\s*,\s*string\s*>\s*>\s*\(\s*{}/.test(content);
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

  // Controlled component check: inputs with onChange MUST have value prop.
  // An input with onChange but no value is uncontrolled — state updates but the UI
  // doesn't reflect the current state value, breaking the controlled component contract.
  const hasOnChangeOnInput = /onChange\s*=\s*\{/.test(content);
  const hasValueBinding = /\bvalue\s*=\s*\{[^}]+\}/.test(content);
  if (hasInputElements && hasOnChangeOnInput && !hasValueBinding) {
    errors.push(
      `❌ Uncontrolled input: inputs have onChange but no value prop. ` +
      `Add value={formData.fieldName} to each controlled input. ` +
      `Without value= the input is uncontrolled and state changes won't reflect in the UI.`
    );
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Common pattern validation
// ---------------------------------------------------------------------------

/**
 * Validate common code patterns and syntax issues across all .ts/.tsx files.
 * Covers: split React imports, JSON/invalid imports, duplicate identifiers,
 * CSS modules, circular deps, cn() usage, forwardRef, JSX-in-ts, hook return
 * contracts, and more.
 */
export function validateCommonPatterns(content: string, filePath: string): string[] {
  const errors: string[] = [];

  // Split React imports: multiple `from 'react'` lines is always wrong in .tsx files.
  // Pure .ts files may legitimately have separate `import type` lines (e.g. ComponentType,
  // ReactElement) without a value import — those are not a problem. Only enforce in .tsx
  // where JSX requires React in scope and merged imports are the canonical style.
  if (filePath.endsWith('.tsx')) {
    const reactImportLines = (content.match(/^import\s+.+\s+from\s+['"]react['"]/gm) || []);
    if (reactImportLines.length > 1) {
      errors.push(
        `❌ Split React imports: Found ${reactImportLines.length} separate import lines from 'react'. ` +
        `Merge into one: import React, { useState, FormEvent, FormEventHandler } from 'react'`
      );
    }
  }

  // JSON file imports: importing from *.json (especially package.json) is a hallucination.
  // e.g. `import { package.json } from '../../package.json'` — invalid identifier and wrong path.
  // Strip these silently so they don't block the file write or propagate to integration checks.
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    const jsonImportMatch = content.match(/^import\s+[^'"]*\s+from\s+['"][^'"]*\.json['"]/m);
    if (jsonImportMatch) {
      errors.push(
        `❌ Fabricated JSON import: \`${jsonImportMatch[0].trim()}\` — do not import JSON files. ` +
        `Remove this line entirely. It serves no purpose in a TypeScript component or store.`
      );
    }
  }

  // Invalid import names: TypeScript generic syntax used as import identifier.
  // e.g. `import { FormEvent<HTMLFormElement> } from 'react'` — angle brackets are not valid
  // in import specifiers; this is a syntax error that TypeScript rejects immediately.
  // Handles both `import { ... }` and `import Foo, { ... }` forms.
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    const importBlockMatches = [...content.matchAll(/import\s+(?:\w+\s*,\s*)?\{([^}]+)\}/g)];
    for (const m of importBlockMatches) {
      const rawNames = m[1];
      if (/</.test(rawNames)) {
        // Extract the offending tokens
        const badTokens = rawNames.split(',')
          .map(s => s.trim())
          .filter(s => s.includes('<') || s.includes('>'));
        errors.push(
          `❌ Invalid import syntax: Generic type syntax inside import braces is not valid. ` +
          `Remove angle brackets from: { ${badTokens.join(', ')} }. ` +
          `Import the base type only — TypeScript infers the generic at the call site: { ${badTokens.map(t => t.replace(/<[^>]*>/g, '').trim()).join(', ')} }`
        );
      }
    }
  }

  // Malformed JSX attribute: consecutive double-quotes like placeholder="""""""""""
  // In JSX, ="..." means the first " opens the string and the second " immediately closes it.
  // Three or more consecutive quotes produce a syntax error that esbuild/tsc rejects.
  // Common LLM failure: mis-escaping a placeholder value into repeated quote chars.
  if (filePath.endsWith('.tsx')) {
    const malformedAttrMatch = content.match(/="{3,}/);
    if (malformedAttrMatch) {
      errors.push(
        `❌ Malformed JSX attribute value: Found consecutive double-quotes \`${malformedAttrMatch[0]}\` — this is a JavaScript parse error. ` +
        `Use a plain string literal: e.g., \`placeholder="Enter your email"\`. ` +
        `Never repeat double-quote characters in a JSX attribute value.`
      );
    }
  }

  // Duplicate identifier: imported symbol also declared locally — crashes at runtime.
  // Happens when SmartFixer adds an import for a name already defined via create()/useState()/etc.
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
    const importedNames = [...content.matchAll(/import\s+\{([^}]+)\}/g)]
      .flatMap(m => m[1].split(',').map(s => s.trim().replace(/\s+as\s+\w+$/, '').trim()))
      .filter(s => /^\w+$/.test(s));
    for (const name of importedNames) {
      if (new RegExp(`\\b(?:const|let|var|function|class|interface|type)\\s+${name}\\b`).test(content)) {
        errors.push(
          `❌ Duplicate identifier: '${name}' is both imported and declared locally. ` +
          `Remove either the import OR the local declaration — do not have both.`
        );
      }
    }
  }

  // Check form component patterns first
  const formErrors = validateFormComponentPatterns(content, filePath);
  if (formErrors.length > 0) {
    errors.push(...formErrors);
  }

  // Phase 2C: Map and Wrap - Use pure utility to detect import/syntax issues
  const issues = findImportAndSyntaxIssuesPure(content, filePath || '');
  issues.forEach(issue => {
    // Wrap pure utility results into error message format
    const prefix = issue.severity === 'error' ? '❌' : '⚠️';
    errors.push(`${prefix} ${issue.message}`);
  });

  // ----------------------------------------------------------------
  // CSS module import detection
  // Flags `import styles from '*.module.css'` in projects that don't use CSS modules.
  // ProjectProfile tracks hasCssModules; if false, any *.module.css import is fabricated.
  // We check regardless of profile because CSS modules are rarely added mid-component.
  // ----------------------------------------------------------------
  const cssModuleImport = content.match(/import\s+\w+\s+from\s+['"]([^'"]*\.module\.css)['"]/);
  if (cssModuleImport) {
    errors.push(
      `❌ Fabricated CSS module: \`${cssModuleImport[1]}\` was imported but this project uses Tailwind, not CSS modules. ` +
      `Remove the CSS module import and replace all \`styles.xxx\` references with Tailwind classes (use clsx or cn() if available in the project).`
    );
  }

  // ----------------------------------------------------------------
  // Cross-layer dependency violation (catches circular imports)
  // Rule: utility/lib/store files must NOT import from component layer.
  // Components depend on utils, never the other way around.
  // ----------------------------------------------------------------
  const utilityLayerPattern = /\bsrc[\\/](?:utils|lib|helpers|constants|stores)[\\/]/i;
  const isUtilityLayerFile = utilityLayerPattern.test(filePath) ||
    /[\\/](cn|utils|helpers|classnames)\.[tj]s$/.test(filePath);

  if (isUtilityLayerFile) {
    const componentImport = content.match(
      /from\s+['"]([^'"]*(?:components|pages|app|routes|views|screens)[^'"]*)['"]/i
    );
    if (componentImport) {
      errors.push(
        `❌ Circular dependency: \`${filePath}\` is a utility/lib file but imports from "${componentImport[1]}". ` +
        `Utility files must never import from the component layer — this will crash the module loader at runtime. ` +
        `Remove the component import; if you need shared logic, extract it to a separate utility.`
      );
    }
  }

  // Component-to-component circular import check.
  // Navigation.tsx must never import Layout.tsx (Layout already imports Navigation → circular).
  // General rule: a component in components/ must not import another sibling component that is
  // known to import it back.
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    const isNavigationFile = isDecomposedNavigation(filePath);
    if (isNavigationFile) {
      // Navigation must never import Layout — Layout imports Navigation, so this would be circular.
      const importsLayout = /from\s+['"][^'"]*[Ll]ayout['"]/i.test(content);
      if (importsLayout) {
        errors.push(
          `❌ Circular dependency: Navigation imports Layout, but Layout already imports Navigation. ` +
          `This creates a circular module dependency (Navigation → Layout → Navigation) that crashes the module loader. ` +
          `Remove the Layout import from Navigation. Navigation should only import from: react-router-dom, routes/Routes, and react.`
        );
      }

      // Navigation must call getAccessibleRoutes() as a plain function, not as a method on
      // Routes (react-router component) or ROUTES (the array). Both are runtime errors.
      const routesNamespaceCall = /\bRoutes\.getAccessibleRoutes\s*\(/.test(content)
        || /\bROUTES\.getAccessibleRoutes\s*\(/.test(content);
      if (routesNamespaceCall) {
        errors.push(
          `❌ Wrong function call: \`Routes.getAccessibleRoutes()\` or \`ROUTES.getAccessibleRoutes()\` is not valid. ` +
          `\`Routes\` is a react-router-dom component; \`ROUTES\` is a plain array — neither has .getAccessibleRoutes(). ` +
          `Import and call it as a standalone function: ` +
          `import { ROUTES, getAccessibleRoutes } from '../routes/Routes'; ` +
          `const accessible = getAccessibleRoutes(isLoggedIn);`
        );
      }
    }
  }

  // TSX component-specific checks
  if (filePath.endsWith('.tsx')) {
    // Detect React.ReactNode / React.ReactElement used as a runtime value (not a type)
    // e.g. "React.ReactNode.propTypes ? React.ReactNode : children" — always falsy, renders nothing
    if (/React\.ReactNode\s*[\?:\.](?!.*:)/.test(content) ||
        /React\.ReactElement\s*[\?:\.](?!.*:)/.test(content)) {
      errors.push(
        `❌ Runtime bug: React.ReactNode or React.ReactElement used as a value expression. ` +
        `These are TypeScript types — they don't exist at runtime. ` +
        `Replace the ternary with just \`{children}\` or the actual JSX.`
      );
    }

    // Catch direct clsx import — this project uses a cn() wrapper, not clsx directly.
    // import { clsx } from 'clsx' bypasses the wrapper and should never appear in component files.
    if (/import\s+[{]?\s*clsx\s*[}]?\s*from\s*['"]clsx['"]/.test(content)) {
      errors.push(
        `❌ Direct clsx import: do not import clsx directly. ` +
        `This project wraps clsx in a cn() utility. ` +
        `Replace: import { clsx } from 'clsx'  →  import { cn } from '@/utils/cn' (or relative path)`
      );
    }

    // Validate cn import path: must be a relative path (../utils/cn, ./utils/cn) or alias (@/utils/cn)
    // Catches: import { cn } from 'src/utils/cn' — a bare path that TypeScript resolves differently
    const cnImportMatch = content.match(/import\s+[^'"]*\bcn\b[^'"]*from\s+['"]([^'"]+)['"]/);
    if (cnImportMatch) {
      const cnSource = cnImportMatch[1];
      const isValidCnPath = cnSource.startsWith('./') || cnSource.startsWith('../') || cnSource.startsWith('@/');
      if (!isValidCnPath) {
        errors.push(
          `❌ Import path: cn is imported from '${cnSource}' which is not a valid module specifier. ` +
          `Use a relative path or alias: import { cn } from '@/utils/cn' or '../utils/cn'`
        );
      }
    }

    // Detect manual className string concatenation when cn() is imported
    const importsCn = /import\s+.*\bcn\b.*from/.test(content);
    const hasManualConcat = /className\s*=\s*[`'"][^`'"]*\$\{/.test(content) ||
                            /className\s*=\s*\{[^}]*\+\s*['"`]/.test(content);
    if (importsCn && hasManualConcat) {
      errors.push(
        `❌ Style bug: cn() is imported but className uses manual string concatenation. ` +
        `Use cn() for all class merging: className={cn('base', variant === 'primary' && 'bg-indigo-600', className)}`
      );
    }

    // Detect bare string classNames when cn() is imported.
    // Every className prop must go through cn() — no exceptions, including submit buttons.
    // Catches: className="..." and className={"..."} but NOT className={cn(...)}
    if (importsCn) {
      const bareStringClassName = /className\s*=\s*(?:"[^"]*"|'[^']*'|\{["'][^"']*["']\})/.test(content);
      if (bareStringClassName) {
        errors.push(
          `❌ Style bug: cn() is imported but a className prop uses a bare string literal. ` +
          `Every className must go through cn(): className={cn('your-classes')} — this applies to every element, including submit buttons.`
        );
      }
    }

    // Detect cn() called as a JSX child expression — this renders the class string as DOM text.
    // Pattern: cn() appearing immediately after a JSX tag close (>) rather than in className={cn(...)}.
    // e.g. <p>{cn('text-gray-600', '')}<strong>...</strong></p> renders "text-gray-600" literally.
    if (importsCn && />\s*\{cn\(/.test(content)) {
      errors.push(
        `❌ Runtime rendering bug: cn() is called inside JSX text content (e.g. <p>{cn('...')}</p>). ` +
        `cn() returns a className string — it must only appear in a className prop: className={cn('...')}. ` +
        `To style the element, move the cn() call to className: <p className={cn('text-gray-600')}>...</p>`
      );
    }

    // Detect obviously unused named imports — imported symbol never referenced in file body.
    // This catches the sibling-rule correction anti-pattern: LLM removes sibling import
    // but adds a phantom schema/util import that's never called.
    // Heuristic: find `import { X } from '...'` where X doesn't appear anywhere after the import block.
    const importLines = content.split('\n').filter(l => l.trimStart().startsWith('import'));
    const bodyAfterImports = content.replace(/^import[^\n]*\n/gm, '');
    for (const importLine of importLines) {
      const namedMatch = importLine.match(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/);
      if (!namedMatch) continue;
      const [, importBlock, importSource] = namedMatch;
      const allNames = importBlock.split(',')
        .map(n => n.trim().replace(/\s+as\s+\w+/, '').trim()) // strip 'as alias'
        .filter(n => n && !/^type\s/.test(n));                 // skip type-only imports
      for (const name of allNames) {
        if (!name || name.includes(' ')) continue;
        // Skip React — always implicitly used by JSX
        if (name === 'React' || name === 'cn' || name === 'clsx') continue;
        const usedInBody = new RegExp(`\\b${name}\\b`).test(bodyAfterImports);
        if (!usedInBody) {
          // Identify which other symbols in the SAME import line ARE used — tell LLM to keep them.
          const keepNames = allNames.filter(n => n !== name && new RegExp(`\\b${n}\\b`).test(bodyAfterImports));
          const keepClause = keepNames.length > 0
            ? ` Keep '${keepNames.join("', '")}' (still used). ` +
              `Correct the import to: import { ${keepNames.join(', ')} } from '${importSource}'`
            : ` Remove the entire import line.`;
          errors.push(
            `❌ Unused import: '${name}' is imported but never used in this file.${keepClause} ` +
            `Do NOT add replacement imports — if you removed a sibling import, only delete that line.`
          );
        }
      }
    }

    // Detect component file that uses default export without a named export.
    // `const X = ...; export default X` is the exact anti-pattern — component consumers
    // expect named imports: `import { LoginForm } from './LoginForm'`.
    // A named definition without `export` is NOT acceptable — it must be `export const X`.
    const hasDefaultExport = /export\s+default\b/.test(content);
    const hasNamedExport = /export\s+(?:const|function|class)\s+[A-Z]/.test(content);
    if (hasDefaultExport && !hasNamedExport && filePath.includes('components/')) {
      const componentName = filePath.split('/').pop()?.replace(/\.[tj]sx?$/, '') ?? 'Component';
      errors.push(
        `❌ Export consistency: Component uses only a default export — named exports are required. ` +
        `Replace: \`const ${componentName} = ...; export default ${componentName};\` ` +
        `with: \`export const ${componentName} = ...;\` (remove the default export entirely)`
      );
    }

    // Interactive components MUST use forwardRef; forwardRef components MUST set .displayName
    const interactiveFilePattern = /\/(Button|Input|Select|Textarea|Checkbox|Radio|Toggle|Switch|Slider)\.[tj]sx?$/i;
    const isInteractiveFile = interactiveFilePattern.test(filePath);
    // Match both forwardRef( (no generics) and forwardRef<T>( (TypeScript generics)
    const usesForwardRef = content.includes('React.forwardRef') || /\bforwardRef\s*[<(]/.test(content);
    const hasDisplayName = /\.displayName\s*=/.test(content);
    const componentName = filePath.split('/').pop()?.replace(/\.[tj]sx?$/, '') || 'Component';

    if (isInteractiveFile && !usesForwardRef) {
      errors.push(
        `❌ Missing forwardRef: ${componentName} is an interactive component — it MUST use React.forwardRef to support ref forwarding. ` +
        `Wrap with: export const ${componentName} = React.forwardRef<HTMLButtonElement, ${componentName}Props>(({ ...props }, ref) => { ... }); ` +
        `then add ${componentName}.displayName = '${componentName}';`
      );
    } else if (usesForwardRef && isInteractiveFile && !hasDisplayName) {
      // displayName is only required for interactive components that use forwardRef.
      // For form/page/layout components (LoginForm, Dashboard, etc.) forwardRef is never needed —
      // flag its presence as scope creep instead of requiring displayName.
      errors.push(
        `❌ forwardRef missing displayName: Add \`${componentName}.displayName = '${componentName}';\` ` +
        `after the component definition. Without it React DevTools shows "ForwardRef" instead of the component name.`
      );
    } else if (usesForwardRef && !isInteractiveFile) {
      errors.push(
        `❌ Unnecessary forwardRef: \`${componentName}\` is not an interactive form control (Button/Input/Select/etc.) and does not need forwardRef. ` +
        `Remove it and use a plain arrow function: \`export const ${componentName} = ({ ...props }: ${componentName}Props) => { ... };\``
      );
    }

    // TSX components MUST return JSX, not a plain string/expression.
    // Auto-correction can introduce this bug by wrapping the function signature but leaving the
    // body as a bare cn() call — returns a string, throws "Nothing was returned from render".
    //
    // ROOT CAUSE of prior false-passes: /<[A-Za-z][\w.]*[\s/>]/ matched TypeScript generic
    // annotations like <HTMLInputElement> or React.forwardRef<HTMLInputElement, InputProps>.
    // TypeScript generics are always PascalCase; JSX HTML elements are always lowercase.
    // Fix: match only lowercase tags (<button, <input, <div, <form, <label, <span, etc.)
    // Also allow `return null` as a valid empty render.
    // Pure re-export files (barrel files) have no function body and no JSX.
    // Detect them by: contains `export ... from` and has no function/const declarations.
    const isPureReExport =
      /export\s*\{[^}]+\}\s*from\s*['"]/.test(content) &&
      !/\bfunction\s+\w+|\bconst\s+\w+\s*=\s*(React\.|function|\(|async)/.test(content);
    if (!isPureReExport && filePath.endsWith('.tsx') && (isInteractiveFile || filePath.includes('/components/'))) {
      const hasJsxReturn =
        /<[a-z][a-z0-9-]*[\s/>]/.test(content) ||    // lowercase HTML element (<button, <input, <div …)
        /<>|<\/>/.test(content) ||                    // React fragment opener/closer (<> </>)
        /return\s*\(?\s*<[A-Z]/.test(content) ||     // uppercase component in return (<Navigate, <Outlet …)
        /return\s+null\b/.test(content);              // explicit null render is valid
      if (!hasJsxReturn) {
        errors.push(
          `❌ Component returns no JSX: The component body has no JSX HTML element (no <div>, <Navigate />, <>{children}</>, etc.). ` +
          `React components MUST return JSX — e.g. return <>{children}</> or return <Navigate to="/login" />. ` +
          `A bare cn() call or string return will throw "Nothing was returned from render" at runtime. ` +
          `NOTE: TypeScript generics like <HTMLInputElement> are NOT JSX — the check requires a real HTML tag or component.`
        );
      }
    }

    // Detect self-referential export: `export const Button = Button` or
    // `export const Button = forwardRef<T>(Button)` / `export const Button = React.forwardRef<T>(Button)`.
    // Auto-correction introduces this pattern when it wraps an inner const and then re-exports by name.
    // TypeScript throws "Block-scoped variable used before its declaration" or a circular reference.
    // Fires for any component file (.tsx) — not just interactive files.
    if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
      // Pattern 1: export const X = X  (same identifier on both sides)
      const selfRefSimple = content.match(/export\s+const\s+(\w+)\s*=\s*(\w+)\s*;/);
      if (selfRefSimple && selfRefSimple[1] === selfRefSimple[2]) {
        const name = selfRefSimple[1];
        errors.push(
          `❌ Self-referential export: \`export const ${name} = ${name};\` is a circular declaration. ` +
          `Export the component directly: \`export const ${name} = React.forwardRef<...>(...)\` — ` +
          `do NOT assign to an internal name and then re-export it by the same name.`
        );
      }
      // Pattern 2: export const X = forwardRef<...>(X) or React.forwardRef<...>(X)
      // The last argument to forwardRef() is the render function — using the component itself
      // here is a recursive reference that causes "used before declaration" errors.
      const selfRefForwardRef = content.match(/export\s+const\s+(\w+)\s*=\s*(?:React\.)?forwardRef(?:<[^>]*>)?\s*\(\s*(\w+)\s*\)/);
      if (selfRefForwardRef && selfRefForwardRef[1] === selfRefForwardRef[2]) {
        const name = selfRefForwardRef[1];
        errors.push(
          `❌ Self-referential forwardRef: \`export const ${name} = forwardRef(${name})\` wraps the component in itself — ` +
          `this causes a "used before declaration" error. ` +
          `Define the render function inline: \`export const ${name} = React.forwardRef<HTMLElement, ${name}Props>((props, ref) => (<element ref={ref} {...props} />));\`. ` +
          `If ${name} is not an interactive component (Button, Input), remove forwardRef entirely.`
        );
      }
      // Pattern 3: export const X = (props: React.ComponentProps<typeof X>) => ...
      // ComponentProps<typeof X> inside X's own definition is a circular self-reference —
      // TypeScript cannot resolve it: "'X' implicitly has type 'any' because it does not have a
      // type annotation and is referenced directly or indirectly in its own initializer".
      // Fix: define a dedicated Props interface and use it instead.
      const selfRefComponentProps = [...content.matchAll(
        /export\s+const\s+(\w+)\s*=\s*\([^)]*(?:React\.)?ComponentProps<\s*typeof\s+(\w+)\s*>/g
      )];
      for (const m of selfRefComponentProps) {
        if (m[1] === m[2]) {
          errors.push(
            `❌ Self-referential ComponentProps: \`export const ${m[1]} = (props: React.ComponentProps<typeof ${m[1]}>) => ...\` ` +
            `references the component inside its own type annotation — TypeScript compile error. ` +
            `Replace with a named interface: \`interface ${m[1]}Props { /* your props */ }\` ` +
            `then use: \`export const ${m[1]} = ({ ...props }: ${m[1]}Props) => ...\``
          );
        }
      }
    }

    // Interactive components (Button, Input, etc.) need at least one padding utility in base styles.
    // Lack of padding makes the component invisible/unusable until the consumer adds classes.
    // Critical (❌) not just a warning: a button with no padding is non-functional out of the box.
    const isInteractiveComponent = /\b(button|input|textarea|select)\b/i.test(
      filePath.split('/').pop() || ''
    );
    if (isInteractiveComponent) {
      const hasPadding = /\b(?:p|px|py|pt|pb|pl|pr)-\d/.test(content);
      if (!hasPadding) {
        errors.push(
          `❌ Missing default sizing: Interactive component has no padding utilities (px-*, py-*, p-*). ` +
          `Add \`px-4 py-2\` to the cn() base string so the component is usable without consumer overrides.`
        );
      }
    }

    // Detect hook calls inside JSX attribute expressions — violates Rules of Hooks.
    // e.g. value={useFormStore((s) => s.email)} or onClick={useStore(s => s.handler)}
    // Hooks must be called at the top level of the component body, never inside JSX props.
    // Pattern: find =\{use\w+( anywhere that isn't a const/let/var/return assignment outside JSX.
    // Simple heuristic: detect `prop={useXxx(` — hooks called directly as JSX attribute values.
    const jsxHookViolations = [...content.matchAll(/\b\w+\s*=\s*\{\s*(use[A-Z]\w+)\s*\(/g)];
    for (const m of jsxHookViolations) {
      const hookName = m[1];
      errors.push(
        `❌ Rules of Hooks violation: \`${hookName}()\` is called inside a JSX prop expression. ` +
        `Hooks must be called at the top level of the component body. ` +
        `Extract to a variable above the return: \`const value = ${hookName}(selector);\` then use \`value\` in JSX.`
      );
    }

    // Detect non-visual wrapper components that don't accept or render children.
    // A Route/Guard/Provider or Layout component that ignores children is broken —
    // it can never render the content it's supposed to wrap.
    // EXCEPTION: Layout components that render <Routes> internally own their own routing
    // and do NOT need to accept children from outside — they are self-contained.
    const isLayoutFile = isStructuralLayout(filePath);
    const layoutOwnsRouting = isLayoutFile && /<Routes[\s>]/.test(content);
    const needsChildren = (isNonVisualWrapper(filePath) || isLayoutFile) && !layoutOwnsRouting;
    if (needsChildren && !/\bchildren\b/.test(content)) {
      const isLayout = isLayoutFile;
      const baseName = filePath.split(/[\\/]/).pop()?.replace(/[^.]+$/, '') ?? '';
      errors.push(
        `❌ Missing children prop: ${baseName} is a ${isLayout ? 'layout' : 'wrapper'} component but never references \`children\`. ` +
        `A ${isLayout ? 'layout' : 'wrapper'} must accept and render children: \`({ children }: { children: React.ReactNode })\`.`
      );
    }

    // Detect conflicting Tailwind transition utilities.
    // twMerge silently drops all but the last one — the component loses the intended animation.
    // e.g. transition-colors + transition-transform → only transition-transform survives.
    const transitionMatches = content.match(/\btransition-\w+\b/g) ?? [];
    const uniqueTransitions = [...new Set(transitionMatches)];
    if (uniqueTransitions.length > 1) {
      errors.push(
        `⚠️ Conflicting Tailwind utilities: multiple transition-* classes detected (${uniqueTransitions.join(', ')}). ` +
        `twMerge keeps only the last one. Use a single transition utility — \`transition-colors\` is correct for most interactive components.`
      );
    }

    // Detect initial* props destructured from params but never forwarded to a hook or used in body.
    // Pattern: `({ initialCount = 0 }: Props)` but `useCounter()` called with no args.
    // This creates a silent bug: the prop is accepted, the consumer passes a value, nothing happens.
    // Heuristic: if the prop name appears ≤ 2 times in the whole file (interface def + destructuring)
    // it was never referenced in the function body.
    const initialPropDetector = /\(\s*\{[^}]*\b(initial[A-Z]\w*)[^}]*\}/g;
    let ipMatch: RegExpExecArray | null;
    while ((ipMatch = initialPropDetector.exec(content)) !== null) {
      const propName = ipMatch[1];
      const occurrences = (content.match(new RegExp(`\\b${propName}\\b`, 'g')) ?? []).length;
      if (occurrences <= 2) {
        errors.push(
          `❌ Silent prop: \`${propName}\` is destructured from props but never referenced in the component body. ` +
          `Pass it to the hook (e.g. \`use${propName.replace(/^initial/, '')}(${propName})\`) or remove the prop from the interface.`
        );
      }
    }
  }

  // cn imported — severity depends on file type and component role
  // .ts files (services, hooks, utils): ❌ cn must never appear
  // .tsx non-visual wrappers (Route/Guard/Wrapper/Provider/Layout/Context/HOC/Outlet): ❌ cn must never appear
  // .tsx regular components: ⚠️ dead import warning only when cn is imported but not called
  const importsCn = /import\s+.*\bcn\b.*from/.test(content);
  if (importsCn) {
    const isPureTs = filePath.endsWith('.ts') && !filePath.endsWith('.tsx');
    const isNonVisualWrapperFile = isNonVisualWrapper(filePath);
    if (isPureTs) {
      errors.push(
        `❌ Wrong import: \`cn\` is imported in a non-component .ts file. ` +
        `cn is a UI class-merging utility — it must NEVER appear in service, utility, or hook files. Remove the import.`
      );
    } else if (isNonVisualWrapperFile) {
      errors.push(
        `❌ Wrong import: \`cn\` is imported in a non-visual wrapper component. ` +
        `${filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '')} is a logic wrapper (redirects/renders children) with NO styled elements. ` +
        `NEVER import cn here — remove the import entirely.`
      );
    } else if (!/\bcn\s*\(/.test(content)) {
      // Regular .tsx component: warn only when cn is imported but never called
      errors.push(
        `⚠️ Dead import: \`cn\` is imported but never called. ` +
        `Either use it for class merging (className={cn(...)}) or remove the import.`
      );
    }
  }

  // cn must never appear in hook files (.ts in hooks/ directory)
  // Hooks are pure logic — no styling concerns. Its presence here means the LLM
  // copy-pasted from a component template and didn't strip the style utilities.
  const isHookFile = /[\\/]hooks[\\/][^/]+\.ts$/.test(filePath) && !filePath.endsWith('.tsx');
  if (isHookFile && importsCn) {
    errors.push(
      `❌ Wrong layer: \`cn\` is a style utility and must not be imported in a hook. ` +
      `Hooks are pure logic — remove the cn import from \`${filePath.split('/').pop()}\`.`
    );
  }

  // JSX in a pure .ts file is a TypeScript compiler error — it must be .tsx
  // Use unambiguous JSX patterns that never appear in plain TypeScript generics:
  //   - closing tags </Foo>   — TypeScript generics never have closing tags
  //   - fragments <>  </>     — unambiguous JSX syntax
  //   - self-closing <Foo />  — uppercase component followed by space or /
  //   - type annotations      — React.FC, JSX.Element (only meaningful with JSX)
  const isPureTsFile = filePath.endsWith('.ts') && !filePath.endsWith('.tsx');
  if (isPureTsFile) {
    const hasJsx = /<\/[A-Za-z]/.test(content)        // closing tag e.g. </div> </Component>
      || /<>|<\/>/.test(content)                       // React fragment <> </>
      || /<[A-Z][a-zA-Z]*[\s/]/.test(content)         // self-closing or spaced JSX <Foo /> <Foo >
      // lowercase HTML JSX <div /> <span> — but NOT TypeScript keyword generics like
      // <typeof T>, <keyof T>, <extends T>, <infer U>, <import(...)> which are NOT JSX
      || /<(?!typeof\b|keyof\b|extends\b|infer\b|import\b)[a-z][a-zA-Z]*[\s/]/.test(content)
      || /\(\)\s*=>\s*</.test(content)                 // arrow fn returning JSX: () => <Component>
      || /React\.FC|JSX\.Element/.test(content);       // JSX-specific type annotations
    if (hasJsx) {
      errors.push(
        `❌ Wrong file extension: This file contains JSX but has a .ts extension. ` +
        `Rename to .tsx (e.g. Routes.tsx, App.tsx). TypeScript cannot compile JSX in .ts files.`
      );
    }
  }

  // Hook return contract: every useState value must be in the return object.
  // The most common failure: a hook creates `const [count, setCount] = useState(...)` but
  // only returns the manipulation functions `{ increment, decrement, reset }`, hiding count
  // from the consumer. The consumer then has no way to read the current value.
  if (isHookFile) {
    const stateVarMatches = [...content.matchAll(/const\s+\[(\w+),\s*\w+\]\s*=\s*useState/g)];
    if (stateVarMatches.length > 0) {
      // Find the return statement(s) in the hook
      const returnMatch = content.match(/return\s*\{([^}]+)\}/);
      if (returnMatch) {
        const returnBody = returnMatch[1];
        for (const match of stateVarMatches) {
          const stateVar = match[1];
          // Check if the state variable name appears in the return object
          if (!new RegExp(`\\b${stateVar}\\b`).test(returnBody)) {
            errors.push(
              `❌ Hook return missing state: \`${stateVar}\` is managed by useState but not in the return object. ` +
              `Consumers cannot read the value. Add \`${stateVar}\` to the return: return { ${stateVar}, ... }.`
            );
          }
        }
      }
    }
  }

  // Detect props that are declared in the interface OR destructured in the signature but
  // never used in the component body. Two checks:
  //  A) Interface props: declared in `interface FooProps { name: string; ... }` but
  //     not referenced anywhere after the interface closing brace.
  //  B) Destructured props: in `({ name, email })` but not in the component body.
  // The LLM's evasion was to declare email/age in the interface but not destructure them —
  // that satisfies criterion regex but leaves them unreachable. Catch it here.
  // Only runs for PascalCase-named .tsx components (not coordinator/layout/HOC files).
  if (filePath.endsWith('.tsx') && filePath.includes('/components/')) {
    const skipProps = new Set(['className', 'children', 'style', 'key', 'ref', 'id', 'role',
      'onClick', 'onChange', 'onSubmit', 'onBlur', 'onFocus', 'onMouseEnter', 'onMouseLeave',
      'disabled', 'type', 'href', 'target', 'loading', 'error', 'isLoading']);

    // Check A: interface props not used after the interface closes
    const interfaceMatch = content.match(/interface\s+\w+Props\s*\{([^}]+)\}/);
    if (interfaceMatch) {
      const interfaceEnd = content.indexOf(interfaceMatch[0]) + interfaceMatch[0].length;
      const afterInterface = content.slice(interfaceEnd);
      const interfaceProps = interfaceMatch[1]
        .split('\n')
        .map(l => l.trim().replace(/\/\/.*$/, '').split(/\s*[?:]/)[0].trim())
        .filter(n => n && /^[a-z]/.test(n) && !skipProps.has(n));
      for (const prop of interfaceProps) {
        if (!new RegExp(`\\b${prop}\\b`).test(afterInterface)) {
          errors.push(
            `❌ Unused prop '${prop}': declared in the props interface but never referenced in the component body. ` +
            `Either render it in JSX (e.g. <span>{${prop}}</span>) or remove it from the interface.`
          );
        }
      }
    }

    // Check B: destructured props not in component body (catches destructure-without-render)
    const compDestructMatch = content.match(/export\s+const\s+[A-Z]\w*\s*(?::[^=]+)?\s*=\s*\(\s*\{([^}]+)\}/);
    if (compDestructMatch) {
      const destructured = compDestructMatch[1]
        .split(',')
        .map(s => s.trim().split(/\s*[=:?]/)[0].trim())
        .filter(n => n && /^[a-z]/.test(n) && !skipProps.has(n));
      if (destructured.length > 0) {
        const matchEnd = content.indexOf(compDestructMatch[0]) + compDestructMatch[0].length;
        const componentBody = content.slice(matchEnd);
        const unusedDestructured = destructured.filter(name => !new RegExp(`\\b${name}\\b`).test(componentBody));
        for (const prop of unusedDestructured) {
          errors.push(
            `❌ Unused prop '${prop}': destructured in the component signature but never referenced ` +
            `in the component body. Render it in JSX (e.g. <span>{${prop}}</span>) or remove it ` +
            `from the interface and signature.`
          );
        }
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Error fix suggestion
// ---------------------------------------------------------------------------

/**
 * Suggest a human-readable fix for common step execution errors.
 * Returns null when no suggestion is applicable.
 */
export function suggestErrorFix(action: string, path: string, error: string): string | null {
  if (action === 'read' && error.includes('ENOENT')) {
    // File not found - suggest creating it or checking path
    const filename = path.split('/').pop();
    return `File '${filename}' doesn't exist. Create it with /write or check the path is correct.`;
  }
  if (action === 'write' && error.includes('EACCES')) {
    // Permission denied
    return `No write permission. Check file permissions or try a different location.`;
  }
  if (action === 'run' && error.includes('not found')) {
    // Command not found
    const cmd = error.split("'")[1];
    return `Command '${cmd}' not found. Make sure it's installed and in your PATH.`;
  }
  if (action === 'read' && error.includes('EISDIR')) {
    // Tried to read a directory
    return `'${path}' is a directory, not a file. Specify a file inside the directory instead.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Error categorization and filtering
// ---------------------------------------------------------------------------

/**
 * Separate critical errors from soft suggestions.
 * Hard errors (missing imports, syntax) block validation.
 * Soft suggestions (Zod recommendations, style) don't block, just warn.
 *
 * This prevents the LLM from getting confused by contradictory messages.
 */
export function categorizeValidationErrors(errors: string[]): {
  critical: string[];
  suggestions: string[];
} {
  const critical: string[] = [];
  const suggestions: string[] = [];

  errors.forEach(error => {
    // CRITICAL: Hard blockers that must be fixed
    if (
      error.includes('❌') ||  // Explicit error marker
      (error.includes('Pattern') && error.includes('violation')) ||  // Form pattern violations
      error.includes('Missing import') ||
      error.includes('Syntax error') ||
      error.includes('unclosed') ||
      error.includes('unmatched') ||
      error.includes('not imported') ||
      error.includes('Code wrapped in markdown') ||
      error.includes('documentation/tutorial') ||
      error.includes('Multiple file references') ||
      error.includes('Typo detected') ||
      error.includes('Multiple file') ||
      error.includes('Incorrect resolver') ||
      error.includes('Mixed validation') ||
      error.includes('Zod used but not imported') ||
      error.includes('TanStack Query used but not imported') ||
      error.includes('@hookform') || // Import errors for hooks
      error.match(/Missing return type|unclosed brace|unmatched/) // Type/syntax errors
    ) {
      critical.push(error);
    } else {
      // SUGGESTION: Advisory messages that don't block
      suggestions.push(error);
    }
  });

  return { critical, suggestions };
}

/**
 * Filter validation errors to only return critical errors.
 * Soft suggestions are logged as warnings but do not block validation.
 *
 * This prevents the "bully effect" where suggestions distract from hard errors.
 *
 * @param errors  Raw error list from validators (may be undefined)
 * @param verbose When true, log suggestions via onMessage
 * @param onMessage Optional callback for emitting suggestion warnings
 */
export function filterCriticalErrors(
  errors: string[] | undefined,
  verbose: boolean = false,
  onMessage?: (msg: string, type: 'info' | 'error') => void
): { critical: string[]; suggestions: string[] } {
  if (!errors || errors.length === 0) {
    return { critical: [], suggestions: [] };
  }

  const { critical, suggestions } = categorizeValidationErrors(errors);

  // Log suggestions as warnings, not as validation failures
  if (verbose && suggestions.length > 0) {
    onMessage?.(
      `⚠️ Suggestions (not blocking): ${suggestions.map(s => s.replace(/⚠️/g, '').trim()).join('; ')}`,
      'info'
    );
  }

  return { critical, suggestions };
}

// ---------------------------------------------------------------------------
// Validation constraint builder
// ---------------------------------------------------------------------------

/**
 * Build the constraint block for LLM-as-judge validation.
 * Combines the step's scope description with detected project conventions.
 *
 * @param filePath          The file being validated
 * @param step              The plan step that produced the content
 * @param profileConstraints Optional project-level constraint text from ProjectProfile
 */
export function buildValidationConstraints(
  filePath: string,
  step: PlanStep,
  profileConstraints?: string
): string {
  const lines: string[] = [];

  lines.push(`FILE: ${filePath}`);
  lines.push(`TASK SCOPE: ${step.description}`);

  if (profileConstraints) {
    lines.push('');
    lines.push(profileConstraints);
  }

  lines.push('');
  lines.push('SCOPE CONSTRAINT: Implement ONLY what the TASK SCOPE explicitly describes. Props, variants, or features not mentioned are OUT OF SCOPE.');

  return lines.join('\n');
}
