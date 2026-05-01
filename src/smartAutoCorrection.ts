/**
 * SmartAutoCorrection
 *
 * Deterministic fix passes for common validation errors (missing imports,
 * circular imports, split React imports, phantom cn(), etc.).
 * All methods are pure string → string — no vscode dependency.
 */
export class SmartAutoCorrection {
  /**
   * Detect if code has circular/self-referential imports
   * Example: blogService.ts importing blogService
   */
  static detectCircularImports(code: string, filePath: string): string[] {
    const circularImports: string[] = [];
    
    // Extract filename without extension
    const fileName = filePath.split('/').pop()?.split('.')[0] || '';
    const baseName = fileName.replace(/Service|Repository|Hook|Controller/, '');
    
    // Check for self-referential imports
    const importLines = code.match(/^import\s+.*from\s+['"].*['"];?$/gm) || [];
    
    importLines.forEach(importLine => {
      // Extract the module being imported
      const moduleMatch = importLine.match(/from\s+['"]([^'"]+)['"]/);
      if (moduleMatch) {
        const importSource = moduleMatch[1];
        
        // Check if importing itself (by filename or base name)
        if (
          importSource.includes(fileName) ||
          importSource.includes(baseName) ||
          importSource.includes(fileName.replace(/Service/, '')) ||
          importSource.includes(fileName.replace(/Repository/, ''))
        ) {
          circularImports.push(importLine);
        }
      }
    });
    
    return circularImports;
  }

  /**
   * Merge split React imports into one line — deterministic, no LLM needed.
   * Routes.ts / config files often generate:
   *   import React from 'react';
   *   import type { ComponentType } from 'react';
   * which must become:
   *   import React, { ComponentType } from 'react';
   */
  static mergeSplitReactImports(code: string): string {
    const reactImportRegex = /^import\s+.+\s+from\s+['"]react['"];?$/gm;
    const reactImportLines = code.match(reactImportRegex);
    if (!reactImportLines || reactImportLines.length <= 1) { return code; }

    let defaultImport = '';
    const namedImports: string[] = [];

    for (const line of reactImportLines) {
      // Extract default import: `import React from 'react'` or `import React, { ... } from 'react'`
      const defaultMatch = line.match(/^import\s+([A-Z]\w*)\s*(?:,|from)/);
      if (defaultMatch) { defaultImport = defaultMatch[1]; }
      // Extract named imports: `{ X, Y }` or `import type { X }`
      const namedMatch = line.match(/\{([^}]+)\}/);
      if (namedMatch) {
        namedMatch[1].split(',').forEach(n => {
          const cleaned = n.trim().replace(/^type\s+/, ''); // strip 'type' keyword
          if (cleaned) { namedImports.push(cleaned); }
        });
      }
    }

    const named = namedImports.length > 0 ? `{ ${namedImports.join(', ')} }` : '';
    let merged: string;
    if (defaultImport && named) {
      merged = `import ${defaultImport}, ${named} from 'react';`;
    } else if (defaultImport) {
      merged = `import ${defaultImport} from 'react';`;
    } else if (named) {
      merged = `import ${named} from 'react';`;
    } else {
      return code;
    }

    // Replace first react import with merged, blank out the rest, then collapse blank lines
    let firstFound = false;
    return code.replace(reactImportRegex, (line) => {
      if (!firstFound) { firstFound = true; return merged; }
      return ''; // subsequent react imports removed
    }).replace(/\n{3,}/g, '\n\n');
  }

  /**
   * Fix circular/self-referential imports by removing them
   * These are always semantic errors - the file shouldn't import itself
   */
  static fixCircularImports(code: string, filePath: string): string {
    const circularImports = this.detectCircularImports(code, filePath);
    
    if (circularImports.length === 0) {
      return code;
    }
    
    let fixed = code;
    
    // Remove each circular import
    circularImports.forEach(circularImport => {
      // Escape special regex characters
      const escaped = circularImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      fixed = fixed.replace(new RegExp(`^${escaped}\n?`, 'gm'), '');
    });
    
    return fixed;
  }

  /**
   * Analyze code and auto-fix missing imports
   * @param code The code with validation errors
   * @param validationErrors The errors to fix
   * @returns Fixed code, or null if can't auto-fix
   */
  static fixMissingImports(code: string, validationErrors: string[]): string {
    let fixed = code;
    const addedImports: Set<string> = new Set();

    console.log('[SmartAutoCorrection] fixMissingImports called with', validationErrors.length, 'errors');

    // Parse all validation errors for missing imports
    validationErrors.forEach(error => {
      console.log('[SmartAutoCorrection] Processing error:', error);
      // Pattern: "Missing import: useState is used but not imported..."
      // Matches: "Missing import: <name> is used but not imported"
      const missingImportMatch = error.match(/Missing import: (\w+) is used but not imported/);
      console.log('[SmartAutoCorrection] Regex match result:', missingImportMatch);
      if (missingImportMatch) {
        const missingName = missingImportMatch[1];
        console.log('[SmartAutoCorrection] Extracted missing name:', missingName);
        
        // Find where it's used to infer import
        const usagePattern = new RegExp(`\\b${missingName}\\b`, 'g');
        const usages = fixed.match(usagePattern) || [];
        
        if (usages.length > 0) {
          // Try to infer the import source
          const inferredImport = this.inferImportSource(fixed, missingName);
          console.log('[SmartAutoCorrection] Inferred import for', missingName, ':', inferredImport);
          
          if (inferredImport) {
            fixed = this.addImport(fixed, missingName, inferredImport);
            addedImports.add(missingName);
            console.log('[SmartAutoCorrection] Added import for', missingName);
          } else {
            console.log('[SmartAutoCorrection] WARNING: inferImportSource returned null for', missingName);
          }
        }
      }
    });

    // Remove unused imports
    validationErrors.forEach(error => {
      const unusedMatch = error.match(/Unused import: '(\w+)'/);
      if (unusedMatch && !addedImports.has(unusedMatch[1])) {
        const unusedName = unusedMatch[1];
        fixed = this.removeUnusedImport(fixed, unusedName);
      }
    });

    return fixed;
  }

  /**
   * Infer where an import should come from based on naming and usage
   */
  // TODO(RAG): replace this entire method with a codebaseIndex vector lookup.
  // Query: "which file in this project exports <name>?" → returns the real path.
  // The hardcoded dict below is a blind guess that breaks on any project-local symbol.
  private static inferImportSource(code: string, name: string): string | null {
    console.log('[SmartAutoCorrection.inferImportSource] Looking up:', name);
    // Common patterns
    const patterns: { [key: string]: string } = {
      // React Hooks (CRITICAL: fixes missing import validation loop)
      'useState': 'react',
      'useEffect': 'react',
      'useContext': 'react',
      'useReducer': 'react',
      'useCallback': 'react',
      'useMemo': 'react',
      'useRef': 'react',
      'useLayoutEffect': 'react',
      'useImperativeHandle': 'react',
      'useDebugValue': 'react',
      'React': 'react',
      
      // React Router
      'useNavigate': 'react-router-dom',
      'useParams': 'react-router-dom',
      'useLocation': 'react-router-dom',
      'useMatch': 'react-router-dom',
      'useSearchParams': 'react-router-dom',
      'Link': 'react-router-dom',
      'BrowserRouter': 'react-router-dom',
      'Routes': 'react-router-dom',
      'Route': 'react-router-dom',
      
      // Form/State Management
      'useForm': 'react-hook-form',
      'useQuery': '@tanstack/react-query',
      'useMutation': '@tanstack/react-query',
      'useStore': 'zustand',
      
      // Styling & Utilities
      'clsx': 'clsx',
      'twMerge': 'tailwind-merge',
      'cn': '../utils/cn',  // Tailwind class merging utility (CRITICAL: prevents ReferenceError)
      'classNames': 'classnames',
      
      // Common Utilities
      'logger': '../utils/logger',
      'formatDate': '../utils/formatDate',
      'parseDate': '../utils/parseDate',
      'validateEmail': '../utils/validateEmail',
      'debounce': 'lodash-es',
      'throttle': 'lodash-es',
      'isEmpty': 'lodash-es',
      'pick': 'lodash-es',
      'omit': 'lodash-es',
      'merge': 'lodash-es',
      
      // Repositories
      'repository': './repository',
      'Repository': './repository',
      'userRepository': './repositories/userRepository',
      'blogRepository': './repositories/blogRepository',
      'blogPostRepository': './repositories/blogPostRepository',
      'postRepository': './repositories/postRepository',
      'commentRepository': './repositories/commentRepository',
      
      // Services
      'service': './service',
      'Service': './service',
      'userService': './services/userService',
      'blogService': './services/blogService',
      'postService': './services/postService',
      'authService': './services/authService',
      
      // Database/ORM
      'db': './db',
      'database': './database',
      'DataSource': 'typeorm',
      'getRepository': 'typeorm',
      
      // Types
      'IUser': './types/IUser',
      'IBlog': './types/IBlog',
      'IPost': './types/IPost',
      
      // Config
      'config': './config',
      'constants': './constants',
    };

    // Direct match
    if (patterns[name]) {
      console.log('[SmartAutoCorrection.inferImportSource] Found direct match for', name, ':', patterns[name]);
      return patterns[name];
    }

    console.log('[SmartAutoCorrection.inferImportSource] No direct match found, checking patterns...');
    
    // CUSTOM HOOKS: Handle useXXX pattern for non-built-in React hooks
    // Check if it's a custom hook (starts with 'use' but not a standard React hook)
    const isStandardReactHook = [
      'useState', 'useEffect', 'useContext', 'useReducer', 'useCallback', 'useMemo',
      'useRef', 'useLayoutEffect', 'useImperativeHandle', 'useDebugValue', 'useId',
      'useDeferredValue', 'useTransition', 'useSyncExternalStore'
    ].includes(name);
    
    if (name.startsWith('use') && !isStandardReactHook) {
      // Custom hook - typically in src/hooks/useXXX
      // Import paths: 
      // - From component in src/components/: '../hooks/useXXX'
      // - From hook in src/hooks/: './useXXX'
      // We'll use relative path assuming most likely case (src/components/)
      console.log(`[SmartAutoCorrection.inferImportSource] Detected custom hook: ${name}`);
      return `../hooks/${name}`;
    }
    
    if (name.includes('Repository')) {
      const baseName = name.replace('Repository', '');
      return `./repositories/${baseName}Repository`;
    }
    if (name.includes('Service')) {
      const baseName = name.replace('Service', '');
      return `./services/${baseName}Service`;
    }
    if (name.startsWith('I') && name.length > 1) {
      // Interface pattern
      return `./types/${name}`;
    }
    if (name.match(/^[A-Z]/)) {
      // Class pattern - likely from same directory
      return `./${name}`;
    }

    // Check if it's used in a .query() or .find() pattern (likely a repository)
    if (code.includes(`${name}.query`) || code.includes(`${name}.find`)) {
      const baseName = name.replace('Repository', '').toLowerCase();
      return `./repositories/${name}`;
    }

    console.log('[SmartAutoCorrection.inferImportSource] No pattern match found for:', name, '- returning null');
    return null;
  }

  /**
   * Add an import statement to the code
   */
  private static addImport(code: string, name: string, source: string): string {
    console.log(`[SmartAutoCorrection.addImport] Processing: name=${name}, source=${source}`);
    console.log(`[SmartAutoCorrection.addImport] Code length: ${code.length}, starts with: ${code.substring(0, 100)}`);
    
    // Check if the SPECIFIC import already exists (not just if name is used somewhere)
    // Pattern: import { name } from 'source' OR import Default, { name } from 'source' (accounts for default imports)
    // NOTE: Do NOT use 'g' flag - it maintains state between test() calls, causing alternating true/false!
    const specificImportPattern = new RegExp(`import\\s+[^{]*{[^}]*\\b${name}\\b[^}]*}\\s+from\\s+['"]${source}['"]`);
    if (specificImportPattern.test(code)) {
      // Import already exists, don't add duplicate
      console.log(`[SmartAutoCorrection.addImport] ✓ Import already exists, returning unchanged`);
      return code;
    }

    // Also check if source is already imported (to add to existing import)
    const sourceImportPattern = new RegExp(`import\\s+(?:\\w+\\s*,\\s*)?{([^}]*)}\\s+from\\s+['"]${source}['"]`, 'm');
    const sourceMatch = code.match(sourceImportPattern);

    if (sourceMatch && sourceMatch[1]) {
      // Source is already imported, add name to existing import statement
      const existingImports = sourceMatch[1];
      if (!existingImports.includes(name)) {
        const updatedImport = `import { ${existingImports}, ${name} } from '${source}'`;
        const result = code.replace(sourceMatch[0], updatedImport);
        console.log(`[SmartAutoCorrection.addImport] ✓ Added to existing import, result length: ${result.length}`);
        return result;
      }
      console.log(`[SmartAutoCorrection.addImport] ✓ ${name} already in existing import`);
      return code;
    }

    // Find where to insert import (after existing imports or at top)
    const importRegex = /^(import\s+.*from\s+['"][^'"]*['"];?\n?)*/m;
    const match = code.match(importRegex);
    console.log(`[SmartAutoCorrection.addImport] Import regex match: ${match ? `length=${match[0].length}` : 'NO MATCH'}`);
    
    if (match && match[0]) {
      // Insert after last import
      const insertPos = match[0].length;
      const newImport = `import { ${name} } from '${source}';\n`;
      const result = code.slice(0, insertPos) + newImport + code.slice(insertPos);
      console.log(`[SmartAutoCorrection.addImport] ✓ Added after existing imports at pos=${insertPos}, result length: ${result.length}`);
      return result;
    } else {
      // No imports found, add at very top
      const newImport = `import { ${name} } from '${source}';\n\n`;
      const result = newImport + code;
      console.log(`[SmartAutoCorrection.addImport] ✓ Added at top (no existing imports), result length: ${result.length}`);
      return result;
    }
  }

  /**
   * Remove an unused import statement
   */
  private static removeUnusedImport(code: string, name: string): string {
    let result = code;
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Named imports — three passes to handle all positions:

    // Pass 1: NAME is first in list → `import { NAME, Rest }` → `import { Rest }`
    result = result.replace(
      new RegExp(`(import\\s+\\{)\\s*${esc}\\s*,\\s*`, 'g'),
      '$1 '
    );

    // Pass 2: NAME is middle or last → `, NAME` → ``
    result = result.replace(
      new RegExp(`,\\s*${esc}\\b`, 'g'),
      ''
    );

    // Pass 3: NAME is the only named import → `import { NAME } from 'source';` → (drop line)
    result = result.replace(
      new RegExp(`import\\s+\\{\\s*${esc}\\s*\\}\\s+from\\s+['"][^'"]*['"];?\\n?`, 'g'),
      ''
    );

    // Default import: `import NAME from 'source';`
    result = result.replace(
      new RegExp(`import\\s+${esc}\\s+from\\s+['"][^'"]*['"];?\\n?`, 'g'),
      ''
    );

    return result;
  }

  /**
   * Fix multiple common patterns
   */
  static fixCommonPatterns(code: string, validationErrors: string[], filePath?: string): string {
    let fixed = code;

    // ZEROTH: Strip LLM narration comment lines that reference other file paths.
    // When the LLM produces a single file but includes comments like "// src/components/Layout.tsx"
    // or "// See src/routes/Routes.ts", the "Multiple file references detected" validator fires.
    // These comment lines are never part of valid executable code and can be stripped safely.
    // Only fires when the "Multiple file references" error is already present, so unrelated
    // comment lines in other files are never touched.
    const hasMultiFileError = validationErrors.some(e => e.includes('Multiple file references detected'));
    if (hasMultiFileError) {
      // Match comment-only lines that contain a file extension reference (.ts / .tsx / .js / .json / .yaml / .css).
      // Uses the same extension set as the validator regex so we clear exactly what it counts.
      fixed = fixed.replace(/^[ \t]*\/\/[^\n]*\.(ts|tsx|js|jsx|json|yaml|css)[^\n]*\n?/gm, '');
      console.log('[SmartAutoCorrection] Stripped file-reference comment lines (multi-file error fix)');
    }

    // FIRST-A: Fix absolute-path imports to relative paths.
    // The LLM sometimes generates: import X from '/routes/Routes' (absolute, starting with '/')
    // instead of the correct relative: import X from './routes/Routes'.
    // Strip the leading '/' and replace with './' — correct for files at src/ level.
    // Only fires when a "Cannot find module '/" error is present, so unrelated imports are untouched.
    const hasAbsolutePathError = validationErrors.some(e => e.includes("Cannot find module '/"));
    if (hasAbsolutePathError) {
      fixed = fixed.replace(/\bfrom\s+(['"])\/([a-zA-Z][^'"]*)\1/g, (_match, q, importPath) => {
        return `from ${q}./${importPath}${q}`;
      });
      console.log('[SmartAutoCorrection] Fixed absolute import paths (leading / → ./)');
    }

    // FIRST-B: Replace phantom cn() import with clsx.
    // cn() is a training-data hallucination — generators import it even when src/utils/cn.ts
    // is absent from the workspace. The cross-file contract validator fires:
    //   "Cannot find module 'src/utils/cn' from '...'"
    // clsx is always available as a real npm package and has the same variadic API as cn().
    // This fix is deterministic: no LLM call, no path guessing.
    const hasCnPhantomImport = validationErrors.some(e =>
      e.includes('Cannot find module') && /\bcn\b|utils\/cn/.test(e)
    );
    if (hasCnPhantomImport) {
      // Remove any import line that brings in `cn` from a utils/cn path
      fixed = fixed.replace(
        /^import\s*\{[^}]*\bcn\b[^}]*\}\s*from\s*['"][^'"]*cn[^'"]*['"]\s*;?\n?/gm,
        ''
      );
      // Add clsx import at the top if cn() is still used in the file and clsx not already imported
      if (fixed.includes('cn(') && !/from\s+['"]clsx['"]/.test(fixed)) {
        fixed = `import { clsx } from 'clsx';\n` + fixed;
      }
      // Replace all cn( call sites with clsx(
      fixed = fixed.replace(/\bcn\(/g, 'clsx(');
      console.log('[SmartAutoCorrection] Replaced phantom cn() with clsx — src/utils/cn.ts not in workspace');
    }

    // FIRST-C: Remove exact duplicate import lines. LLM corrections sometimes add a second
    // `import { cn } from '@/utils/cn'` when one already exists, causing TS2300.
    {
      const seen = new Set<string>();
      fixed = fixed.split('\n').filter(line => {
        const trimmed = line.trim();
        if (!trimmed.startsWith('import ')) return true;
        if (seen.has(trimmed)) {
          console.log(`[SmartAutoCorrection] Removed duplicate import: ${trimmed}`);
          return false;
        }
        seen.add(trimmed);
        return true;
      }).join('\n');
    }

    // FIRST: Merge split React imports (deterministic — no LLM needed)
    fixed = this.mergeSplitReactImports(fixed);

    // SECOND: Check for circular imports (always wrong)
    if (filePath) {
      fixed = this.fixCircularImports(fixed, filePath);
    }

    // THIRD: Deterministic import repair for "Symbol X not found in Y" cross-file contract errors.
    // Rather than handing the whole file to the LLM (which rewrites too much and breaks template literals),
    // do a targeted import-line fix: remove the wrong symbol, reroute to the correct source.
    const REACT_ROUTER_SYMBOLS = new Set([
      'BrowserRouter', 'Routes', 'Route', 'Navigate', 'Link', 'Outlet',
      'NavLink', 'useNavigate', 'useLocation', 'useParams', 'useSearchParams',
      'useMatch', 'RouterProvider',
    ]);
    for (const error of validationErrors) {
      const symbolMatch = error.match(/Symbol '(\w+)' not found in '([^']+)'\. Available exports: (.+)/);
      if (!symbolMatch) { continue; }
      const [, missingSymbol, sourceFilePath] = symbolMatch;
      const sourceBasename = sourceFilePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') ?? '';

      // 1. Remove missingSymbol from the wrong import (the source it doesn't belong to)
      const importRemoveRe = new RegExp(
        `^(import\\s*\\{)([^}]+)(\\}\\s*from\\s*['"][^'"]*${sourceBasename}['"])`,
        'm'
      );
      const wrongImportMatch = fixed.match(importRemoveRe);
      if (wrongImportMatch) {
        const symbols = wrongImportMatch[2]
          .split(',')
          .map(s => s.trim())
          .filter(s => s && s !== missingSymbol);
        const replacement = symbols.length > 0
          ? `${wrongImportMatch[1]} ${symbols.join(', ')} ${wrongImportMatch[3]}`
          : ''; // Remove entire import line if it's now empty
        fixed = fixed.replace(wrongImportMatch[0], replacement);
      }

      // 2. Re-route react-router-dom symbols to their correct package
      if (REACT_ROUTER_SYMBOLS.has(missingSymbol)) {
        const routerImportRe = /import\s*\{([^}]+)\}\s*from\s*['"]react-router-dom['"]/;
        const routerMatch = fixed.match(routerImportRe);
        if (routerMatch) {
          if (!routerMatch[1].includes(missingSymbol)) {
            const updated = routerMatch[0].replace(
              routerMatch[1],
              `${routerMatch[1].trim()}, ${missingSymbol}`
            );
            fixed = fixed.replace(routerMatch[0], updated);
          }
        } else {
          fixed = `import { ${missingSymbol} } from 'react-router-dom';\n` + fixed;
        }
      }
    }

    // FOURTH: Deterministic export default → named export conversion.
    // The validator flags "Export consistency: Component uses only a default export — named exports are required."
    // This is a structural transform, not a semantic one — always safe to do deterministically.
    const hasDefaultExportError = validationErrors.some(e =>
      e.includes('Export consistency') && e.includes('default export')
    );
    if (hasDefaultExportError) {
      // Pattern 1: `const Foo = ...; export default Foo;`
      // → add `export` to the const declaration, remove the `export default Foo;` line
      const defaultExportLineRe = /^export\s+default\s+(\w+)\s*;?\s*$/m;
      const defaultMatch = fixed.match(defaultExportLineRe);
      if (defaultMatch) {
        const componentName = defaultMatch[1];
        // Add export keyword to the const/function declaration if not already exported
        const declarationRe = new RegExp(
          `^(const|function|class)\\s+(${componentName}\\b)`,
          'm'
        );
        if (declarationRe.test(fixed) && !new RegExp(`^export\\s+(const|function|class)\\s+${componentName}\\b`, 'm').test(fixed)) {
          fixed = fixed.replace(declarationRe, `export $1 $2`);
        }
        // Remove the `export default ComponentName;` line
        fixed = fixed.replace(defaultExportLineRe, '');
        // Clean up any trailing blank lines left by the removal
        fixed = fixed.replace(/\n{3,}/g, '\n\n');
      }

      // Pattern 2: `export default function Foo(...)` → `export function Foo(...)`
      fixed = fixed.replace(/^export\s+default\s+(function\s+\w)/m, 'export $1');
    }

    // FIFTH: Convert template literals in JSX style objects to plain ternary expressions.
    // Template literals with ternary operators inside ${...} in style props (e.g.
    // `borderBottom: \`1px solid ${theme === 'dark' ? '#444' : '#ddd'}\``) consistently cause
    // TS1002 "Unterminated string literal" parse errors when the LLM mismatches backtick quotes.
    // They can also cause TS1005 "',' expected", TS1128 "Declaration or statement expected", and
    // TS1180 "Property destructuring pattern expected" as cascade parse errors from the same root
    // cause. All four share the same fix: convert the backtick template to a plain ternary.
    // The transform: `prefix${A ? B : C}suffix` → A ? 'prefixBsuffix' : 'prefixCsuffix'
    // Only applies for the common single-ternary-interpolation case used in theme style objects.
    // Fires when tsc reports TS1002 (unterminated string literal), OR when TS1005/TS1128/TS1180
    // appear alongside actual backtick template literals in style-like positions in the file.
    const hasUnterminatedStringLiteral = validationErrors.some(e => e.includes('TS1002'));
    const hasStyleTemplateLiteral = /:\s*`[^`]*\$\{[^}]+\}[^`]*`/.test(fixed);
    const hasCascadeParseError = validationErrors.some(e =>
      e.includes('TS1005') || e.includes('TS1128') || e.includes('TS1180') || e.includes('TS1434')
    );
    if (hasUnterminatedStringLiteral || (hasCascadeParseError && hasStyleTemplateLiteral)) {
      // Pattern: propertyName: `staticPrefix${condition ? trueLiteral : falseLiteral}staticSuffix`
      // e.g. borderBottom: `1px solid ${theme === 'dark' ? '#444' : '#ddd'}`
      fixed = fixed.replace(
        /:\s*`([^`$]*)\$\{([^}]+)\s*\?\s*(['"][^'"]*['"])\s*:\s*(['"][^'"]*['"])\}([^`]*)`/g,
        (_match, prefix, _cond, trueVal, falseVal, suffix) => {
          const condition = _cond.trim();
          const trueLiteral = trueVal.replace(/^['"]|['"]$/g, '');
          const falseLiteral = falseVal.replace(/^['"]|['"]$/g, '');
          const trueStr = prefix || suffix
            ? `'${prefix}${trueLiteral}${suffix}'`
            : trueVal;
          const falseStr = prefix || suffix
            ? `'${prefix}${falseLiteral}${suffix}'`
            : falseVal;
          return `: ${condition} ? ${trueStr} : ${falseStr}`;
        }
      );
    }

    // SEVENTH-A: Fix CSS string-literal properties in extracted style const variables — TS2322.
    // When a style object is assigned to a const variable, TypeScript widens string literals like
    // 'center' to `string`. CSSProperties expects the narrow literal type, so tsc reports TS2322:
    //   Type '{ textAlign: string; }' is not assignable to type 'Properties<...>'.
    // Fix: add `as const` to the value of known CSS properties that require string literal types.
    // Only fires when tsc reports TS2322 with 'Properties<string | number' in the message.
    const hasCSSPropertiesError = validationErrors.some(e =>
      e.includes('TS2322') && e.includes('Properties<string | number')
    );
    if (hasCSSPropertiesError) {
      const cssStringProps = [
        'textAlign', 'alignItems', 'alignSelf', 'justifyContent', 'justifySelf',
        'flexDirection', 'flexWrap', 'position', 'display', 'float',
        'overflow', 'overflowX', 'overflowY', 'whiteSpace', 'wordBreak',
        'textTransform', 'textDecoration', 'fontWeight', 'fontStyle',
        'verticalAlign', 'boxSizing', 'cursor', 'pointerEvents',
        'visibility', 'userSelect', 'resize',
      ];
      const propPattern = new RegExp(
        `((?:${cssStringProps.join('|')})\\s*:\\s*'[^']+')(?!\\s+as\\s+const)`,
        'g'
      );
      fixed = fixed.replace(propPattern, '$1 as const');
    }

    // SEVENTH: Fix `element={X.component}` — TS2322 ComponentType not assignable to ReactNode.
    // React Router's `element` prop expects ReactNode (a rendered element), not ComponentType
    // (a constructor/function). The generator sometimes passes the type directly instead of
    // calling it as JSX. Wrap in React.createElement() to produce a valid ReactElement.
    // Only fires when tsc reports TS2322 with ComponentType→ReactNode mismatch.
    const hasComponentTypeError = validationErrors.some(e =>
      e.includes('TS2322') && e.includes('ComponentType') && e.includes('ReactNode')
    );
    if (hasComponentTypeError) {
      fixed = fixed.replace(/\belement=\{(\w+\.component)\}/g, 'element={React.createElement($1)}');
    }

    validationErrors.forEach(error => {
      // Fix: React hook is used but not imported (e.g., "React hook 'useCallback' is used but not imported from React")
      // Also matches: "useState is used but not imported from React"
      let hookNotImportedMatch = error.match(/React hook '(\w+)' is used but not imported from React/);
      if (!hookNotImportedMatch) {
        hookNotImportedMatch = error.match(/^(\w+) is used but not imported from React/);
      }
      
      if (hookNotImportedMatch) {
        const hookName = hookNotImportedMatch[1];
        console.log(`[SmartAutoCorrection] Found hook '${hookName}' used but not imported`);
        
        // Check if the hook is actually used in the code
        if (fixed.includes(hookName)) {
          // Add the import at the top
          fixed = this.addImport(fixed, hookName, 'react');
          console.log(`[SmartAutoCorrection] Added import for ${hookName} from 'react'`);
        }
      }

      // Fix: Hook imported but never called → Remove the import
      // Pattern: "Hook 'useState' is imported but never called in src/..."
      if (error.includes('Hook') && error.includes('imported but never called')) {
        const hookMatch = error.match(/Hook '(\w+)' is imported but never called/);
        if (hookMatch) {
          const hookName = hookMatch[1];
          fixed = this.removeUnusedImport(fixed, hookName);
          console.log(`[SmartAutoCorrection] Removed unused hook import: ${hookName}`);
        }
      }

      // Fix: Unused import → Remove it
      if (error.includes('Unused import')) {
        const match = error.match(/Unused import: '(\w+)'/);
        if (match) {
          fixed = this.removeUnusedImport(fixed, match[1]);
        }
      }

      // Fix: Missing import → Add it
      if (error.includes('Missing import')) {
        // Try multiple patterns to extract the missing import name
        let match = error.match(/Missing import: '(\w+)'/);  // Pattern: 'name'
        if (!match) {
          match = error.match(/Missing import: (\w+) is used but not imported/);  // Pattern: name is used
        }
        if (!match) {
          match = error.match(/Missing import:\s+(\w+)/);  // Pattern: name
        }
        
        if (match) {
          const missingName = match[1];
          const source = this.inferImportSource(fixed, missingName);
          if (source) {
            fixed = this.addImport(fixed, missingName, source);
            console.log(`[SmartAutoCorrection] Added import for ${missingName} from '${source}'`);
          }
        }
      }

      // Fix: Any types → Replace with unknown
      if (error.includes('any')) {
        fixed = fixed.replace(/:\s*any\b/g, ': unknown');
        fixed = fixed.replace(/\bas\s+any\b/g, 'as unknown');
      }

      // Fix: Config/data .ts file imports from a store — remove the store import line entirely.
      // Config files have no React lifecycle so store hooks are invalid here.
      if (error.includes('Config File Store Import')) {
        // Remove any import line that imports from a store file
        fixed = fixed.replace(/^import\s+[^;]*from\s+['"][^'"]*\/stores\/[^'"]*['"];?\s*\n?/gm, '');
        console.log(`[SmartAutoCorrection] Removed store import from config/data .ts file`);
      }

      // Fix: Semicolons used as commas in TypeScript object literals (CSSProperties pattern).
      // LLM sometimes outputs CSS syntax (semicolons) inside TS object literals:
      //   const headerStyle: CSSProperties = { padding: '1rem'; display: 'flex'; }
      // TypeScript reports TS1005: ',' expected at these lines.
      // Strategy: use the line number from the error message to fix only the bad line.
      if (error.includes("',' expected") || error.includes('TS1005')) {
        const lineNumMatch = error.match(/\(line (\d+)\)/);
        if (lineNumMatch) {
          const lineNum = parseInt(lineNumMatch[1], 10);
          const lines = fixed.split('\n');
          if (lineNum > 0 && lineNum <= lines.length) {
            const targetLine = lines[lineNum - 1];
            const trimmed = targetLine.trim();
            // Only fix lines that look like object property assignments ending with ;
            // Skip comments, standalone statements, and interface declarations
            const isObjectProperty = trimmed
              && !trimmed.startsWith('//')
              && !trimmed.startsWith('*')
              && !trimmed.startsWith('interface')
              && !trimmed.startsWith('type ')
              && /^\w/.test(trimmed)
              && trimmed.includes(':')
              && /;\s*$/.test(targetLine);
            if (isObjectProperty) {
              lines[lineNum - 1] = targetLine.replace(/;\s*$/, ',');
              fixed = lines.join('\n');
              console.log(`[SmartAutoCorrection] Fixed semicolon→comma in object literal at line ${lineNum}`);
            }
          }
        }
      }

      // Fix: cn() imported but bare string className detected.
      // Replace all className="foo" / className='foo' / className={"foo"} / className={'foo'}
      // with className={cn('foo')} so the validator stops firing.
      if (error.includes('bare string literal')) {
        const importsCn = /import\s+.*\bcn\b.*from/.test(fixed);
        if (importsCn) {
          // className="foo bar" → className={cn('foo bar')}
          fixed = fixed.replace(/className="([^"]+)"/g, `className={cn('$1')}`);
          // className='foo bar' → className={cn('foo bar')}
          fixed = fixed.replace(/className='([^']+)'/g, `className={cn('$1')}`);
          // className={"foo bar"} → className={cn('foo bar')}
          fixed = fixed.replace(/className=\{"([^"]+)"\}/g, `className={cn('$1')}`);
          // className={'foo bar'} → className={cn('foo bar')}
          fixed = fixed.replace(/className=\{'([^']+)'\}/g, `className={cn('$1')}`);
          console.log(`[SmartAutoCorrection] Wrapped bare className strings in cn()`);
        }
      }

      // Fix: cn() imported but template-literal className used for concatenation.
      // className={`foo ${bar}`} → className={cn('foo', bar)}
      // Handles simple one-variable cases; complex template literals are left for LLM.
      if (error.includes('manual string concatenation')) {
        const importsCn = /import\s+.*\bcn\b.*from/.test(fixed);
        if (importsCn) {
          // Match: className={`staticPart ${varName}`}  (exactly one static part + one variable)
          fixed = fixed.replace(
            /className=\{`([^`${}]+)\$\{([^}]+)\}`\}/g,
            (_match, staticPart, varExpr) => {
              const base = staticPart.trim();
              const varName = varExpr.trim();
              return base
                ? `className={cn('${base}', ${varName})}`
                : `className={cn(${varName})}`;
            }
          );
          console.log(`[SmartAutoCorrection] Converted template-literal className to cn()`);
        }
      }

      // Fix: Unclosed braces — deterministic tail append
      // Common cause: LLM truncated the output; missing closing braces are at the end.
      // Extract the count from the error "Syntax error: N unclosed brace(s)" and append N '}'.
      if (error.includes('unclosed brace')) {
        const countMatch = error.match(/(\d+)\s+unclosed brace/);
        const missing = countMatch ? parseInt(countMatch[1], 10) : 1;
        const openCount = (fixed.match(/{/g) || []).length;
        const closeCount = (fixed.match(/}/g) || []).length;
        const actualMissing = Math.max(0, openCount - closeCount);
        const toAppend = actualMissing > 0 ? actualMissing : missing;
        console.log(`[SmartAutoCorrection] Appending ${toAppend} closing brace(s) to fix truncation`);
        fixed = fixed.trimEnd() + '\n' + '}'.repeat(toAppend);
      }
    });

    return fixed;
  }

  /**
   * Async variant of fixCommonPatterns — uses RAG resolver for unknown symbols.
   *
   * @param resolver  `(symbolName) => Promise<filePath | null>` — call
   *                  `codebaseIndex.resolveExportSource(name, embeddingClient)`.
   *                  Falls back to the hardcoded dict when resolver returns null.
   */
  static async fixCommonPatternsAsync(
    code: string,
    validationErrors: string[],
    resolver: (name: string) => Promise<string | null>,
    filePath?: string
  ): Promise<string> {
    // First: apply ALL synchronous deterministic fixes (mergeSplitReactImports, cn bare-string,
    // unclosed brace, any-type, etc.). fixCommonPatterns also handles fixCircularImports.
    let fixed = this.fixCommonPatterns(code, validationErrors, filePath);

    for (const error of validationErrors) {
      // React hook not imported
      let hookMatch = error.match(/React hook '(\w+)' is used but not imported from React/)
        ?? error.match(/^(\w+) is used but not imported from React/);
      if (hookMatch && fixed.includes(hookMatch[1])) {
        fixed = this.addImport(fixed, hookMatch[1], 'react');
        continue;
      }

      // Hook imported but never called
      if (error.includes('Hook') && error.includes('imported but never called')) {
        const m = error.match(/Hook '(\w+)' is imported but never called/);
        if (m) { fixed = this.removeUnusedImport(fixed, m[1]); }
        continue;
      }

      // Wrong import: cn in a non-component .ts file — remove the cn import entirely
      if (error.includes('Wrong import') && error.includes('cn')) {
        fixed = this.removeUnusedImport(fixed, 'cn');
        console.log(`[SmartAutoCorrection] Removed cn import from non-component .ts file`);
        continue;
      }

      // Dead import: cn imported in a .tsx file but never called — remove it
      if (error.includes('Dead import') && error.includes('cn')) {
        fixed = this.removeUnusedImport(fixed, 'cn');
        console.log(`[SmartAutoCorrection] Removed unused cn import from .tsx file`);
        continue;
      }

      // Mock Auth Bug: no falsy return path — cannot be fixed with a simple regex swap
      // (the truthy value may be !!token, Boolean(x), etc. — LLM correction handles it)
      if (error.includes('Mock Auth Bug')) {
        continue; // let the error propagate to LLM correction with the full error message
      }

      // Missing import — try RAG first, then dict fallback
      if (error.includes('Missing import')) {
        const m = error.match(/Missing import: '(\w+)'/)
          ?? error.match(/Missing import: (\w+) is used but not imported/)
          ?? error.match(/Missing import:\s+(\w+)/);
        if (m) {
          const name = m[1];
          const ragSource = await resolver(name);
          const dictSource = ragSource === null ? this.inferImportSource(fixed, name) : null;
          const source = ragSource ?? dictSource;
          if (source) {
            fixed = this.addImport(fixed, name, source);
            const via = ragSource ? '🔍 RAG index' : '📖 hardcoded dict';
            console.log(`[SmartAutoCorrection] Added import for '${name}' from '${source}' (via ${via})`);
          } else {
            console.warn(`[SmartAutoCorrection] ❌ Could not resolve import for '${name}' — neither RAG nor dict matched`);
          }
        }
        continue;
      }

      // Any types → unknown
      if (error.includes('any')) {
        fixed = fixed.replace(/:\s*any\b/g, ': unknown');
        fixed = fixed.replace(/\bas\s+any\b/g, 'as unknown');
      }
    }

    return fixed;
  }

  /**
   * Check if code is likely fixable automatically
   */
  static isAutoFixable(validationErrors: string[]): boolean {
    const fixablePatterns = [
      'Missing import',
      'Unused import',
      'Split React imports',             // Deterministic merge — no LLM needed
      'is used but not imported from React',  // NEW: Specific hook import pattern
      'any type',
      'typo',
      'Hook Usage',  // Added: Hook usage errors (imported but never called) — narrow to avoid matching DATA FETCHING HOOK VIOLATION
      'imported but never called',  // Added: More specific pattern
      'Wrong import',  // Added: cn/UI import in a non-component .ts file
      'Dead import',   // Added: cn/UI import in a .tsx file that never uses it
      'bare string literal',        // Deterministic: className="foo" → className={cn('foo')}
      'manual string concatenation', // Deterministic: className={`foo ${bar}`} → className={cn('foo', bar)}
      'Config File Store Import',    // Deterministic: remove store imports from plain .ts config files
      "',' expected",                // Deterministic: semicolons used as commas in TS object literals (CSSProperties)
      'TS1005',                      // Same — TypeScript ',' expected error code
      'Wrong file extension',        // LLM corrector removes JSX from .ts file content (no rename needed)
      'Cross-file Contract',         // Deterministic: wrong symbol removed from import, rerouted to correct package
      'Export consistency',          // Deterministic: export default → named export transformation
    ];

    // NOTE: 'Wrong file extension' is NOT here — the corrector CAN fix this by removing JSX
    // from the content (it doesn't need to rename the file; the file extension is what the
    // planner intended, but the LLM put JSX inside a .ts file by mistake).
    const unfixablePatterns = [
      'unclosed brace',  // Deterministic fixer exists in fixCommonPatterns, but isAutoFixable must stay false
      'unmatched brace',
      'documentation instead of code',
      'multiple file',
      'DATA FETCHING HOOK VIOLATION',  // Architectural error — requires LLM to restructure props/hooks, not SmartAutoCorrection
      'prop-drilling',                  // Same — structural pattern that needs LLM reasoning
      'SCHEMA COUPLING VIOLATION',     // Sub-component accepting user object — needs LLM to restructure to scalar props
      'Schema Field Mismatch',         // Wrong field names in z.object() — needs LLM to rewrite the schema
    ];

    let hasFixable = false;
    let hasUnfixable = false;

    validationErrors.forEach(error => {
      const isUnfixable = unfixablePatterns.some(p => error.includes(p));
      const isFixable = fixablePatterns.some(p => error.includes(p));

      if (isUnfixable) {hasUnfixable = true;}
      if (isFixable) {hasFixable = true;}
    });

    // Fixable if has fixable errors and no unfixable ones
    return hasFixable && !hasUnfixable;
  }

  /**
   * Extract what a Zustand store actually exports
   * Analyzes the store code to find the initial state and actions
   * 
   * Example: create<LoginState>((set) => ({ email: '', password: '', setEmail: (e) => ... }))
   * Extracts: { email, password, setEmail }
   */
  static extractStoreExports(storeCode: string): string[] {
    const exports: string[] = [];
    
    // Look for create<Type>((set) => ({ ... }))
    const createMatch = storeCode.match(/create<[\w\s,|&]+>\s*\(\s*\(set\)\s*=>\s*\({([^}]+)}\)/s);
    if (createMatch) {
      const stateBlock = createMatch[1];
      // Extract property names (email: '', setEmail: (e) => ...)
      const propMatches = stateBlock.match(/(\w+)\s*[:=]/g) || [];
      propMatches.forEach(prop => {
        const name = prop.replace(/[:=].*/g, '').trim();
        if (name) {
          exports.push(name);
        }
      });
    }
    
    return exports.length > 0 ? exports : ['email', 'password']; // Default if extraction fails
  }

  /**
   * Fix Zustand component to match what the store actually exports
   * 
   * Problem: Component destructures `{ state, setFormData, handleSubmit }`
   * but store only exports `{ email, password }`
   * 
   * Solution: Fix the destructuring to only include what exists in the store
   */
  static fixZustandMismatch(componentCode: string, storeExports: string[]): string {
    if (storeExports.length === 0) {
      return componentCode;
    }

    // Find the destructuring pattern: const { ... } = useStore();
    const hookPattern = /const\s+{([^}]*)}\s*=\s*(use\w+)\s*\(\)/g;
    
    let fixed = componentCode;
    let match;
    
    while ((match = hookPattern.exec(componentCode)) !== null) {
      const currentDestructure = match[1];
      const hookName = match[2];
      
      // Only keep properties that exist in store
      const requestedProps = currentDestructure
        .split(',')
        .map(p => p.trim().split(/\s+as\s+/)[0].trim())
        .filter(p => storeExports.includes(p));
      
      if (requestedProps.length > 0 && requestedProps.length !== currentDestructure.split(',').length) {
        // The component was asking for properties that don't exist - fix it
        const newDestructure = requestedProps.join(', ');
        const oldLine = `const {${currentDestructure}} = ${hookName}()`;
        const newLine = `const { ${newDestructure} } = ${hookName}()`;
        
        fixed = fixed.replace(oldLine, newLine);
      }
    }
    
    return fixed;
  }

  /**
   * Overall strategy: If component imports from store but has mismatched properties,
   * and we have access to the store code, fix the component to match the store
   */
  static fixZustandComponentFromStore(
    componentCode: string,
    storeCode: string | undefined
  ): string {
    if (!storeCode) {
      return componentCode; // Can't fix without store code
    }
    
    const storeExports = this.extractStoreExports(storeCode);
    return this.fixZustandMismatch(componentCode, storeExports);
  }
}

export default SmartAutoCorrection;
