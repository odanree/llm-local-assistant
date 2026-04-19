/**
 * executor-llm-prompts.ts
 *
 * LLM prompt builders and LLM-calling functions extracted from Executor.
 * No instance state — all inputs are passed as parameters.
 *
 * Extracted from executor.ts as Phase 2 of the executor decomposition.
 */

import { PlanStep } from './planner';
import { LLMClient } from './llmClient';
import {
  isNonVisualWrapper,
  isStructuralLayout,
  isDecomposedNavigation,
  extractPropsInterface,
  extractRouteConfig,
  extractStoreFields,
  extractCallbackHandlers,
} from './executor-code-classifier';

// ---------------------------------------------------------------------------
// Acceptance criteria generator
// ---------------------------------------------------------------------------

/**
 * Architect pre-flight: generate a task-specific acceptance checklist BEFORE code generation.
 * The Reviewer (llmValidate) then checks the generated code against this list item-by-item.
 * Non-blocking — returns [] on LLM failure, falling back to open-ended review.
 */
export async function generateAcceptanceCriteria(
  step: PlanStep,
  sourceContent: string | undefined,
  llmClient: LLMClient,
  profileConstraints: string,
  onMessage?: (msg: string, type: 'info' | 'error') => void
): Promise<string[]> {
  try {
    const constraintLine = profileConstraints ? ` CONSTRAINTS: ${profileConstraints.replace(/\n/g, ' ')}` : '';
    const isHookTarget = /[\\/]hooks[\\/][^/]+\.ts$/.test(step.path) && !step.path.endsWith('.tsx');
    const isServiceTarget = /[\\/](?:services|utils|lib|api|helpers)[\\/][^/]+\.ts$/.test(step.path) && !step.path.endsWith('.tsx');
    const isConfigTarget = /[\\/](?:routes|config|types|constants|models)[\\/][^/]+\.ts$/.test(step.path) && !step.path.endsWith('.tsx');
    const isPureLogicFile = isHookTarget || isServiceTarget || isConfigTarget;
    const isNonVisual = isNonVisualWrapper(step.path);
    const stepBaseName = step.path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? '';
    const isMockAuthService = isPureLogicFile && /mockAuth|authService|authHelper/i.test(stepBaseName);
    const mockAuthNote = isMockAuthService
      ? ' MOCK AUTH SERVICE: one criterion MUST check that the auth function returns false by default (not true). A mock that returns true makes the redirect unreachable and untestable.'
      : '';
    const isStructuralLayoutCriteria = isStructuralLayout(step.path, step.description);
    const isDecomposedNavigationCriteria = isDecomposedNavigation(step.path, step.description);

    // Short-circuit: pre-define criteria for well-known decomposition targets.
    if (isStructuralLayoutCriteria) {
      const layoutPropsBody = sourceContent
        ? extractPropsInterface(sourceContent, 'Layout')
        : null;
      const propsDesc = layoutPropsBody
        ? `Props interface matches source: ${layoutPropsBody.replace(/\s+/g, ' ').replace(/;/g, ',').trim()}`
        : 'Accepts correct props from parent (all state passed as props — no store imports)';
      return [
        propsDesc,
        'Renders Navigation component conditionally based on the sidebar-open prop',
        'Has header, sidebar (with Navigation), main content area, and footer structure',
        'Renders routes internally from route config — Layout owns routing, not the parent',
        'Uses inline style={{}} objects for ALL styling — NO cn(), clsx, className with Tailwind strings',
      ];
    }
    if (isDecomposedNavigationCriteria) {
      const navPropsBody = sourceContent
        ? extractPropsInterface(sourceContent, 'Navigation')
        : null;
      const propsDesc = navPropsBody
        ? `Props interface matches source: ${navPropsBody.replace(/\s+/g, ' ').replace(/;/g, ',').trim()}`
        : 'Accepts all state as props (isLoggedIn, theme, onLogout) — no store imports';
      const routeConfig = sourceContent ? extractRouteConfig(sourceContent) : null;
      const filterFn = routeConfig?.filterFnName ?? 'getAccessibleRoutes';
      return [
        propsDesc,
        'Uses <Link> component for all navigation links (NOT useNavigate, NOT <a href>)',
        `Calls ${filterFn}(isLoggedIn) to get accessible routes — NOT Routes.${filterFn}() or array.${filterFn}()`,
        'Logout button is shown only when isLoggedIn is true',
        'Uses inline style={{}} objects for ALL styling — NO cn(), clsx, className with Tailwind strings',
      ];
    }

    // Short-circuit: App.tsx
    const isAppRootCriteria = /(?:^|\/)App\.tsx$/.test(step.path);
    if (isAppRootCriteria) {
      const storeFieldMap = sourceContent ? extractStoreFields(sourceContent) : new Map();
      const storeEntries = [...storeFieldMap.entries()];
      const storeDesc = storeEntries.length > 0
        ? storeEntries.map(([hook, fields]) => `Gets ${fields.join(', ')} from ${hook}`).join('; ')
        : 'Gets only what the store actually exports — does NOT read local state from any store';
      const sourceCallbacks = sourceContent ? extractCallbackHandlers(sourceContent) : new Map();
      const callbackNames = [...sourceCallbacks.keys()];
      const callbackCriteria = callbackNames.length > 0
        ? `Defines exactly these useCallback handlers (exact names from source): ${callbackNames.join(', ')}`
        : 'Uses useCallback for event handlers passed as props';
      return [
        'Wraps everything in <BrowserRouter> — NEVER calls useNavigate() directly in App',
        storeDesc,
        callbackCriteria,
        'Renders the top-level Layout/Shell component with all needed props',
        'Uses inline style={{}} objects for any styling — NO cn(), clsx, className with Tailwind strings',
      ];
    }

    // Short-circuit: route-config .ts file
    const isRoutesCriteria = /(?:^|\/)Routes\.ts$/.test(step.path);
    if (isRoutesCriteria) {
      const routeConfig = sourceContent ? extractRouteConfig(sourceContent) : null;
      const constName = routeConfig?.constName ?? 'ROUTES';
      const filterFn = routeConfig?.filterFnName ?? 'getAccessibleRoutes';
      const ifaceFields = routeConfig?.interfaceBody
        ? `RouteConfig interface has: ${routeConfig.interfaceBody.replace(/\s+/g, ' ').trim()}`
        : 'RouteConfig interface matches fields from source — NO invented fields (no meta, no extra props)';
      return [
        `Exports a const named ${constName} (exact case from source) — NOT routes, routeList, or any other name`,
        ifaceFields,
        `Exports ${filterFn}(...): RouteConfig[] that filters routes based on auth/access`,
        'No JSX, no styled elements, no cn() — pure TypeScript config file',
      ];
    }

    const hookLine = isPureLogicFile
      ? ` PURE LOGIC FILE: this file contains NO JSX and NO UI rendering. NEVER include cn, className, React component, or styling imports in criteria. Only check for correct TypeScript types, exported function signatures, and logic correctness.${mockAuthNote}`
      : isNonVisual
      ? ' NON-VISUAL COMPONENT: this component is a logic wrapper — it redirects, renders children, or provides context. It has NO styled elements. NEVER require cn(), className, or styling in criteria. NEVER reference hook imports unless a hook file is explicitly named in the step description — reference the ACTUAL functions described (e.g., "calls isAuthenticated() from mockAuth service", "reads token from localStorage"). ALWAYS include one criterion that checks: "Accepts and renders children prop" — a wrapper that ignores children is broken. Only check for: correct children prop, redirects to correct path, and that imported symbols match the step description exactly.'
      : isStructuralLayoutCriteria
      ? ' STRUCTURAL LAYOUT: This component is extracted from a source that may use inline styles (style={{}}), not Tailwind. Do NOT require cn() — require only: (1) Accepts children prop, (2) Correct props interface with isLoggedIn/theme/onLogout/isSidebarOpen/onToggleSidebar, (3) Renders Navigation conditionally based on isSidebarOpen, (4) Has header + sidebar + main + footer structure, (5) Renders children in the main area.'
      : isDecomposedNavigationCriteria
      ? ' PURE PRESENTATION NAVIGATION: This component receives all state as props (isLoggedIn, theme, onLogout). Do NOT require store imports. Require: (1) NavigationProps interface with isLoggedIn/theme/onLogout, (2) Uses <Link> for navigation (not useNavigate), (3) Shows accessible routes based on isLoggedIn prop, (4) Has logout button when isLoggedIn is true.'
      : '';
    const isTsxComponent = step.path.endsWith('.tsx') && !isPureLogicFile && !isNonVisual;
    // Only suggest children criterion for genuine layout/wrapper components.
    // Forms, pages, inputs, and data-display components do NOT accept children —
    // adding a children criterion to RegisterForm or LoginPage is an architectural mistake.
    const isFormOrInputComponent = /(?:Form|Input|Field|Checkbox|Radio|Select|TextArea|Toggle|Switch)/i.test(step.path);
    const isPageOrScreenComponent = /(?:Page|Screen|Dashboard|Settings|Profile|Detail|List|Table)/i.test(step.path);
    const childrenReminder = isTsxComponent
      && !isFormOrInputComponent
      && !isPageOrScreenComponent
      && !step.description.toLowerCase().includes('children')
      ? ' LAYOUT/WRAPPER ONLY: If this component is a layout container, shell, card, or modal that wraps arbitrary content, include a criterion for "Accepts children: React.ReactNode". Do NOT add this criterion for forms, inputs, pages, or focused data-display components.'
      : '';
    const prompt = `You output only valid JSON arrays of strings. No explanation, no preamble, no markdown.\n\nTask: ${step.description}\nFile: ${step.path}${constraintLine}${hookLine}${childrenReminder}\n\nList 3-5 YES/NO acceptance criteria (concrete, checkable by reading code). Focus on structure, required APIs, and what must NOT appear.\n\nIMPORTANT: NEVER prescribe which utility to use for class merging. Do NOT write criteria like "uses cn()" or "imports cn from". Instead write the observable outcome: e.g. "Accepts optional className prop" or "Applies variant-based Tailwind classes conditionally".\n\nExample output: ["Uses React.forwardRef", "Only 'primary'/'secondary' variants defined", "Accepts className prop"]\n\nOutput the JSON array:`;

    const llmResponse = await llmClient.sendMessage(prompt);
    if (!llmResponse.success || !llmResponse.message) { return []; }

    const match = llmResponse.message.match(/\[[\s\S]*\]/);
    if (!match) { return []; }

    let criteria: string[];
    try {
      criteria = JSON.parse(match[0]);
    } catch {
      return [];
    }
    if (!Array.isArray(criteria)) { return []; }
    const filtered = criteria
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      .filter(c => !/\bcn\s*\(|\bimports?\s+cn\b|\buse[s]?\s+cn\b/i.test(c));

    if (filtered.length > 0) {
      onMessage?.(
        `🎯 Acceptance criteria (${filtered.length}): ${filtered.slice(0, 3).map((c, i) => `${i + 1}. ${c}`).join(' | ')}${filtered.length > 3 ? ' ...' : ''}`,
        'info'
      );
    }
    return filtered;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// LLM-as-judge validator
// ---------------------------------------------------------------------------

/**
 * LLM-as-judge: semantic validation that regex cannot catch.
 * When criteria[] is provided, uses structured YES/NO checking against the pre-generated list.
 * When criteria[] is empty, uses the pre-computed constraints string for open-ended review.
 * Non-blocking — returns [] on LLM failure so write proceeds.
 */
export async function llmValidate(
  filePath: string,
  content: string,
  step: PlanStep,
  criteria: string[],
  llmClient: LLMClient,
  constraints: string
): Promise<string[]> {
  try {
    const truncatedContent = content.length > 2000
      ? content.slice(0, 2000) + '\n// ... (truncated)'
      : content;

    let prompt: string;

    if (criteria.length > 0) {
      const criteriaList = criteria.map((c, i) => `${i + 1}. ${c}`).join('\n');
      prompt = `You are a strict code reviewer. Check the code against each acceptance criterion.

ACCEPTANCE CRITERIA:
${criteriaList}

CODE (${filePath}):
\`\`\`
${truncatedContent}
\`\`\`

For each criterion, decide: YES (passes), NO (critical failure), or WARN (minor issue).
Output ONLY a JSON array of the failures and warnings. Use:
- "❌ Criterion N: <brief reason>" for failures
- "⚠️ Criterion N: <brief reason>" for warnings

If all criteria pass, respond with: []

JSON array only. No explanation.`;
    } else {
      prompt = `You are a strict code reviewer. Evaluate the code below against the given constraints.

CONSTRAINTS:
${constraints}

CODE TO REVIEW:
\`\`\`
${truncatedContent}
\`\`\`

OUTPUT FORMAT — respond with ONLY a JSON array of issues. Each issue must be one of:
- "❌ <short description>" for violations that must be fixed
- "⚠️ <short description>" for minor concerns

Focus ONLY on what regex cannot catch:
- Scope creep: props/variants/features not in TASK SCOPE
- Invalid or non-existent Tailwind classes
- Dead code (unused variables/imports)
- Unnecessary variable extraction: a const that holds a single Tailwind class string and is only used once (e.g. const paddingStyle = 'px-4 py-2') — flag as ⚠️ unnecessary indirection
- Semantic incorrectness (logic that won't work as described)

Do NOT flag: structural imports, forwardRef, displayName, padding — those are checked elsewhere.
If no issues, respond with: []

JSON array only. No explanation.`;
    }

    const llmResponse = await llmClient.sendMessage(prompt);
    if (!llmResponse.success || !llmResponse.message) {
      console.warn(`[LLM Validator] LLM call failed — skipping semantic check`);
      return [];
    }

    const match = llmResponse.message.match(/\[[\s\S]*\]/);
    if (!match) {
      console.warn('[LLM Validator] Response not a JSON array — skipping');
      return [];
    }

    const issues: string[] = JSON.parse(match[0]);
    if (!Array.isArray(issues)) { return []; }

    const filtered = issues.filter((i): i is string => typeof i === 'string' && (i.includes('❌') || i.includes('⚠️')));
    if (filtered.length > 0) {
      console.log(`[LLM Validator] Found ${filtered.length} issue(s) in ${filePath}:`);
      filtered.forEach(i => console.log(`  ${i}`));
    }

    return filtered;
  } catch (err) {
    console.warn(`[LLM Validator] Skipped (${err instanceof Error ? err.message : String(err)})`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Pure prompt builders
// ---------------------------------------------------------------------------

/**
 * Compute the import path from currentFilePath to a module that was originally
 * imported relative to sourceFilePath.
 */
export function computeRelativeImportPath(
  currentFilePath: string,
  sourceFilePath: string,
  sourceImportPath: string
): string {
  const normCurrent = currentFilePath.replace(/\\/g, '/');
  const normSource  = sourceFilePath.replace(/\\/g, '/');
  const normImport  = sourceImportPath.replace(/\\/g, '/');

  // Bare package specifiers (e.g. 'react', 'lodash') need no adjustment.
  if (!normImport.startsWith('./') && !normImport.startsWith('../') && !normImport.startsWith('/')) {
    return normImport;
  }

  const sourceDir = normSource.replace(/\/[^/]+$/, '');
  let resolved: string;
  if (normImport.startsWith('./') || normImport.startsWith('../')) {
    const parts = sourceDir.split('/');
    const importParts = normImport.split('/');
    for (const seg of importParts) {
      if (seg === '..') { parts.pop(); }
      else if (seg !== '.') { parts.push(seg); }
    }
    resolved = parts.join('/');
  } else {
    resolved = normImport;
  }

  const currentDir = normCurrent.replace(/\/[^/]+$/, '');
  const fromParts = currentDir.split('/');
  const toParts   = resolved.split('/');

  let common = 0;
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common++;
  }
  const ups = fromParts.length - common;
  const downs = toParts.slice(common);
  const rel = [...Array(ups).fill('..'), ...downs].join('/');
  return rel.startsWith('.') ? rel : './' + rel;
}

/**
 * Build a per-line tsc correction prompt.
 * Groups errors by line number, extracts context windows, requests a JSON patch.
 * Returns '' if none of the errors carry line numbers (caller falls back to whole-file).
 */
export function buildSurgicalTscPrompt(content: string, tscErrors: string[], filePath: string): string {
  const lines = content.split('\n');

  const errorsByLine = new Map<number, string[]>();
  for (const error of tscErrors) {
    const m = error.match(/\(line (\d+)\)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!errorsByLine.has(n)) { errorsByLine.set(n, []); }
      errorsByLine.get(n)!.push(error);
    }
  }
  if (errorsByLine.size === 0) { return ''; }

  const uniqueLines = [...errorsByLine.keys()].sort((a, b) => a - b);
  const RADIUS = 4;

  const windows: Array<{ start: number; end: number }> = [];
  for (const ln of uniqueLines) {
    const s = Math.max(0, ln - 1 - RADIUS);
    const e = Math.min(lines.length - 1, ln - 1 + RADIUS);
    if (windows.length > 0 && s <= windows[windows.length - 1].end + 1) {
      windows[windows.length - 1].end = Math.max(windows[windows.length - 1].end, e);
    } else {
      windows.push({ start: s, end: e });
    }
  }

  const contextSections = windows
    .map(({ start, end }) =>
      lines
        .slice(start, end + 1)
        .map((line, i) => `${start + i + 1}: ${line}`)
        .join('\n')
    )
    .join('\n...\n');

  const errorList = uniqueLines
    .map(ln => `Line ${ln}:\n${errorsByLine.get(ln)!.map(e => `  - ${e}`).join('\n')}`)
    .join('\n');

  return (
    `Fix ONLY the TypeScript compiler errors listed below in: ${filePath}\n\n` +
    `ERRORS:\n${errorList}\n\n` +
    `RELEVANT CODE (with line numbers):\n${contextSections}\n\n` +
    `RESPONSE FORMAT — return ONLY a JSON array, nothing else:\n` +
    `[{"line": N, "content": "replacement for that entire line (preserve indentation)"}]\n\n` +
    `Rules:\n` +
    `- Patch ONLY the lines mentioned in ERRORS — do NOT touch any other line\n` +
    `- To delete a line: {"line": N, "content": ""}\n` +
    `- To insert a new line before line N: {"line": N, "insertBefore": "new line content"}\n` +
    `- NEVER rewrite logic, JSX, or template literals — only fix the listed error tokens\n` +
    `- Output ONLY the JSON array. No markdown, no explanation.`
  );
}

/**
 * Apply a JSON patch array returned by the surgical tsc fixer.
 * Returns null if the JSON cannot be parsed (caller falls back to whole-file).
 */
export function applySurgicalTscPatches(content: string, patchJson: string): string | null {
  try {
    const stripped = patchJson.replace(/```(?:json)?\n?([\s\S]*?)\n?```/, '$1').trim();
    const patches: Array<{ line: number; content: string; insertBefore?: string }> =
      JSON.parse(stripped);
    if (!Array.isArray(patches)) { return null; }

    const lines = content.split('\n');
    const sorted = [...patches].sort((a, b) => b.line - a.line);

    for (const patch of sorted) {
      const idx = patch.line - 1;
      if (idx < 0 || idx > lines.length) { continue; }
      if (patch.insertBefore !== undefined) {
        lines.splice(idx, 0, patch.insertBefore);
      } else if (patch.content === '') {
        lines.splice(idx, 1);
      } else {
        if (idx < lines.length) { lines[idx] = patch.content; }
      }
    }
    return lines.join('\n');
  } catch {
    return null;
  }
}

/**
 * Build a SEARCH/REPLACE correction prompt for validator errors.
 */
export function buildSurgicalValidatorPrompt(
  content: string,
  errors: string[],
  filePath: string
): string {
  const isImportOnly = errors.every(e =>
    e.includes('Cross-file Contract') ||
    e.includes('Missing import') ||
    e.includes('Unused import') ||
    e.includes('Wrong import') ||
    e.includes('Dead import') ||
    e.includes('Export consistency')
  );

  const codeContext = isImportOnly
    ? `IMPORT SECTION (lines 1-${Math.min(25, content.split('\n').length)}):\n` +
      content.split('\n').slice(0, 25).map((l, i) => `${i + 1}: ${l}`).join('\n')
    : `FULL FILE:\n${content}`;

  return (
    `Fix the following validation errors in: ${filePath}\n\n` +
    `ERRORS:\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n\n` +
    `${codeContext}\n\n` +
    `RESPONSE FORMAT — return ONLY search/replace blocks, one per change:\n` +
    `<<<SEARCH\n[exact text to find in the file]\n=====\n[replacement text]\n>>>REPLACE\n\n` +
    `Rules:\n` +
    `- Each SEARCH string must be a verbatim substring of the file — it will be used for exact replacement\n` +
    `- Make the SEARCH string as SHORT as possible (just the line(s) that need changing)\n` +
    `- Do NOT change anything not covered by the listed errors\n` +
    `- Output ONLY the <<<SEARCH...>>>REPLACE blocks. No explanation, no full file.`
  );
}

/**
 * Apply SEARCH/REPLACE blocks to content.
 * Returns null if no valid blocks are found.
 */
export function applySurgicalValidatorPatches(content: string, patchText: string): string | null {
  const blockRe = /<<<SEARCH\n([\s\S]*?)\n=====\n([\s\S]*?)\n>>>REPLACE/g;
  let result = content;
  let matched = false;

  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(patchText)) !== null) {
    const search = m[1];
    const replace = m[2];
    if (result.includes(search)) {
      result = result.replace(search, replace);
      matched = true;
    }
  }
  return matched ? result : null;
}
