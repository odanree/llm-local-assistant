/**
 * executor-code-classifier.ts
 *
 * Pure static helpers extracted from Executor for classifying and extracting
 * structural information from source code text. No instance state, no side effects.
 *
 * Extracted from executor.ts (lines 87–376) as Phase 1 of the executor decomposition.
 */

// ---------------------------------------------------------------------------
// File-type classifiers
// ---------------------------------------------------------------------------

/**
 * Returns true when a file is a pure logic redirector: no styled HTML, no cn(), just
 * conditional navigation or context provision.
 * Route/Guard/Provider/Context/HOC/Outlet — these redirect or forward children with zero visual output.
 * Layout is intentionally excluded: Layout components ARE visual (structural HTML + cn for class merging).
 */
export function isNonVisualWrapper(filePath: string): boolean {
  if (!filePath.endsWith('.tsx')) { return false; }
  const name = filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? '';
  // HOCs (with[A-Z] prefix) are classified separately by isHOCComponent.
  // They do NOT accept children — the HOC takes a Component argument, not JSX children.
  // Exclude them here so the children validator and criteria generator don't treat them as wrappers.
  if (/^with[A-Z]/.test(name)) { return false; }
  return /Route|Guard|Provider|Context|HOC|Outlet/i.test(name);
}

/**
 * Returns true when a file is a Higher-Order Component (HOC).
 * HOCs use a `with*` prefix naming convention (withAuth, withPermission, withTheme, etc.).
 * They are functions that accept a Component argument and return a new component —
 * NOT wrappers that accept children. They need generics like <P extends object>.
 */
export function isHOCComponent(filePath: string): boolean {
  if (!filePath.endsWith('.tsx')) { return false; }
  const name = filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? '';
  return /^with[A-Z]/.test(name);
}

/**
 * Returns true when a file is a structural layout wrapper:
 * Layout components render HTML structure (header/main/footer) around children.
 * They ARE visual, use cn(), but still require a children prop.
 */
export function isStructuralLayout(filePath: string, stepDescription?: string): boolean {
  if (!filePath.endsWith('.tsx')) { return false; }
  const name = filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? '';
  if (/Layout/i.test(name)) { return true; }
  if (stepDescription && /\b(layout\s+component|app\s+shell|page\s+wrapper|main\s+frame|shell\s+component)\b/i.test(stepDescription)) {
    return true;
  }
  return false;
}

/**
 * Returns true when a file is a pure presentation navigation component:
 * Navigation, Navbar, Sidebar, Header — these receive ALL state as props,
 * they do NOT import from stores directly.
 */
export function isDecomposedNavigation(filePath: string, stepDescription?: string): boolean {
  if (!filePath.endsWith('.tsx')) { return false; }
  const name = filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? '';
  if (/^(Navigation|Navbar|NavBar|Nav|Sidebar|SideNav|Header|TopBar|AppBar|MenuBar)$/i.test(name)) {
    return true;
  }
  if (stepDescription && /\b(navigation|navbar|sidebar|nav\s+component|menu\s+component|side\s+panel)\b/i.test(stepDescription)) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Code extractors
// ---------------------------------------------------------------------------

/**
 * Extract page component imports from a source file.
 * Finds: import X from '...pages/...' or '...screens/...' or '...views/...'
 * Returns [{name, from}] so callers can reconstruct import lines or list names.
 */
export function extractPageImports(code: string): Array<{ name: string; from: string }> {
  const results: Array<{ name: string; from: string }> = [];
  const pattern = /import\s+(\w+)\s+from\s+['"]([^'"]*\/(?:pages|screens|views)\/[^'"]+)['"]/g;
  let match;
  while ((match = pattern.exec(code)) !== null) {
    results.push({ name: match[1], from: match[2] });
  }
  return results;
}

/**
 * Extract what fields an app destructures from store hooks in a source file.
 * Finds: const { a, b } = useSomeStore()
 * Returns a map of storeName → field list so callers know the actual store API in use.
 */
export function extractStoreFields(code: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const pattern = /const\s+\{\s*([^}]+)\s*\}\s*=\s*(use\w+Store)\s*\(\)/g;
  let match;
  while ((match = pattern.exec(code)) !== null) {
    const fields = match[1].split(',').map(f => f.trim()).filter(Boolean);
    const hook = match[2];
    map.set(hook, [...(map.get(hook) ?? []), ...fields]);
  }
  return map;
}

/**
 * Extract a props interface body from source code.
 * Tries <ComponentName>Props and App<ComponentName>Props patterns.
 * Returns the raw body text (the part inside the braces) or null if not found.
 */
export function extractPropsInterface(code: string, componentName?: string): string | null {
  const candidates = componentName
    ? [`${componentName}Props`, `App${componentName}Props`]
    : ['\\w+Props'];
  for (const name of candidates) {
    const m = code.match(new RegExp(`interface\\s+${name}\\s*\\{([^}]+)\\}`));
    if (m) { return m[1].trim(); }
  }
  return null;
}

/**
 * Extract the RouteConfig interface text and export names from a source file.
 * Returns what the source actually defined so the prompt can mirror it exactly.
 */
export function extractRouteConfig(code: string): {
  interfaceBody: string | null;
  constName: string;
  filterFnName: string | null;
} {
  const ifaceMatch = code.match(/(?:export\s+)?interface\s+RouteConfig\s*\{([^}]+)\}/);
  const interfaceBody = ifaceMatch ? ifaceMatch[1].trim() : null;
  const constMatch = code.match(/export\s+const\s+([A-Z][A-Z0-9_]+)\s*:\s*RouteConfig/);
  const constName = constMatch ? constMatch[1] : 'ROUTES';
  const fnMatch = code.match(/export\s+function\s+(\w+)\s*\(/);
  const filterFnName = fnMatch ? fnMatch[1] : null;
  return { interfaceBody, constName, filterFnName };
}

// ---------------------------------------------------------------------------
// Callback handler helpers
// ---------------------------------------------------------------------------

/**
 * Extract all useCallback handler bodies from a source file.
 * Returns a Map of handlerName → normalized body string (trimmed lines joined by \n).
 * Uses a paren-depth counter to correctly handle nested function calls.
 */
export function extractCallbackHandlers(code: string): Map<string, string> {
  const handlers = new Map<string, string>();
  const startPattern = /const\s+(\w+)\s*=\s*useCallback\s*\(/g;
  let match;
  while ((match = startPattern.exec(code)) !== null) {
    const name = match[1];
    let depth = 1;
    let i = match.index + match[0].length;
    while (i < code.length && depth > 0) {
      if (code[i] === '(') { depth++; }
      else if (code[i] === ')') { depth--; }
      i++;
    }
    const body = code.slice(match.index + match[0].length, i - 1).trim();
    const normalized = body.split('\n').map(l => l.trim()).filter(Boolean).join('\n');
    handlers.set(name, normalized);
  }
  return handlers;
}

/**
 * Compare generated code against source code for useCallback handler violations.
 * Returns ❌-prefixed error strings for: missing handlers and added lines.
 */
export function collectCallbackErrors(generatedCode: string, sourceCode: string): string[] {
  const HARMLESS_TOKENS = new Set([
    'return', 'if', 'else', 'true', 'false', 'null', 'undefined',
    'const', 'let', 'var', 'typeof', 'instanceof', 'new', 'this',
  ]);

  const errors: string[] = [];
  const sourceHandlers = extractCallbackHandlers(sourceCode);
  const generatedHandlers = extractCallbackHandlers(generatedCode);
  for (const [name, sourceBody] of sourceHandlers) {
    if (!generatedHandlers.has(name)) {
      errors.push(
        `❌ Callback Preservation: handler \`${name}\` exists in the source file but is missing from the generated output. Preserve all handlers from the source.`
      );
    } else {
      const genBody = generatedHandlers.get(name)!;
      const sourceLines = new Set(sourceBody.split('\n').map(l => l.trim()).filter(Boolean));
      const sourceIdents = new Set<string>(sourceBody.match(/\b[a-zA-Z_]\w*\b/g) ?? []);

      const addedLines = genBody.split('\n').map(l => l.trim()).filter(Boolean)
        .filter(line => {
          if (sourceLines.has(line)) { return false; }
          if (line.startsWith('//')) { return false; }
          if (/^[()[\]{}]|^},\s*[\[{]/.test(line)) { return false; }
          const primaryIdent = (line.match(/\b([a-zA-Z_]\w*)\b/) ?? [])[1];
          if (!primaryIdent) { return false; }
          if (HARMLESS_TOKENS.has(primaryIdent)) { return false; }
          return !sourceIdents.has(primaryIdent);
        });

      if (addedLines.length > 0) {
        errors.push(
          `❌ Callback Preservation: handler \`${name}\` has ${addedLines.length} line(s) not in the source:\n` +
          addedLines.map(l => `  + ${l}`).join('\n') +
          `\n  Remove these lines — they were not in the original.`
        );
      }
    }
  }
  return errors;
}

/**
 * Extract the full `const handlerName = useCallback(...)` declaration text from source.
 * Uses paren-depth tracking to correctly handle nested calls inside the callback body.
 * Returns the declaration INCLUDING the trailing semicolon, or null if not found.
 */
export function extractFullCallbackDeclaration(source: string, handlerName: string): string | null {
  const startPattern = new RegExp(`\\bconst\\s+${handlerName}\\s*=\\s*useCallback\\s*\\(`);
  const startMatch = startPattern.exec(source);
  if (!startMatch) { return null; }

  let depth = 1;
  let i = startMatch.index + startMatch[0].length;
  while (i < source.length && depth > 0) {
    if (source[i] === '(') { depth++; }
    else if (source[i] === ')') { depth--; }
    i++;
  }
  while (i < source.length && (source[i] === ' ' || source[i] === '\t')) { i++; }
  if (i < source.length && source[i] === ';') { i++; }

  return source.slice(startMatch.index, i).trim();
}

/**
 * Deterministic callback splicer: inject missing useCallback handler declarations
 * (and any associated useState declarations) from source into the generated file.
 */
export function spliceCallbackHandlers(
  generated: string,
  source: string,
  missingHandlerNames: string[]
): string {
  if (missingHandlerNames.length === 0) { return generated; }

  const handlerDecls: string[] = [];
  for (const name of missingHandlerNames) {
    const decl = extractFullCallbackDeclaration(source, name);
    if (decl) { handlerDecls.push(decl); }
  }
  if (handlerDecls.length === 0) { return generated; }

  const setterNames = new Set<string>();
  for (const decl of handlerDecls) {
    const setters = decl.match(/\bset[A-Z]\w*\b/g) ?? [];
    setters.forEach(s => setterNames.add(s));
  }

  const useStateDecls: string[] = [];
  for (const setter of setterNames) {
    if (generated.includes(setter)) { continue; }
    const re = new RegExp(`const\\s+\\[\\w+,\\s*${setter}\\]\\s*=\\s*useState[^;]*;`, 'g');
    const hits = source.match(re) ?? [];
    useStateDecls.push(...hits);
  }

  let insertPoint = generated.lastIndexOf('\n  return (');
  if (insertPoint === -1) { insertPoint = generated.lastIndexOf('\n  return <'); }
  if (insertPoint === -1) { return generated; }

  const insertBlock = '\n' + [...useStateDecls, ...handlerDecls].join('\n') + '\n';
  let result = generated.slice(0, insertPoint) + insertBlock + generated.slice(insertPoint);

  const reactImportMatch = result.match(/^import\s+React(?:,\s*\{([^}]*)\})?\s+from\s+['"]react['"]/m);
  if (reactImportMatch) {
    const existing = (reactImportMatch[1] ?? '').split(',').map(h => h.trim()).filter(Boolean);
    const needed: string[] = [];
    if (useStateDecls.length > 0 && !existing.includes('useState')) { needed.push('useState'); }
    if (handlerDecls.length > 0 && !existing.includes('useCallback')) { needed.push('useCallback'); }
    if (needed.length > 0) {
      const all = [...existing, ...needed].join(', ');
      result = result.replace(reactImportMatch[0], `import React, { ${all} } from 'react'`);
    }
  }

  return result;
}
