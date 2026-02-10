/**
 * Smart Auto-Correction for Validation Errors
 * Understands import dependencies and can fix common validation failures
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
    // Pattern: import { NAME } from 'source'; or import NAME from 'source';
    const patterns = [
      new RegExp(`import\\s+{[^}]*\\b${name}\\b[^}]*}\\s+from\\s+['"][^'"]*['"];?\\n?`, 'g'),
      new RegExp(`import\\s+${name}\\s+from\\s+['"][^'"]*['"];?\\n?`, 'g'),
    ];

    let result = code;
    patterns.forEach(pattern => {
      result = result.replace(pattern, '');
    });

    return result;
  }

  /**
   * Fix multiple common patterns
   */
  static fixCommonPatterns(code: string, validationErrors: string[], filePath?: string): string {
    let fixed = code;

    // FIRST: Check for circular imports (highest priority - always wrong)
    if (filePath) {
      fixed = this.fixCircularImports(fixed, filePath);
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

      // Fix: Unmatched braces → Check and report (can't auto-fix)
      if (error.includes('unclosed brace')) {
        // This needs manual fixing
        console.log('[SmartAutoCorrection] Cannot auto-fix brace mismatch');
      }
    });

    return fixed;
  }

  /**
   * Check if code is likely fixable automatically
   */
  static isAutoFixable(validationErrors: string[]): boolean {
    const fixablePatterns = [
      'Missing import',
      'Unused import',
      'is used but not imported from React',  // NEW: Specific hook import pattern
      'any type',
      'typo',
      'Hook',  // Added: Hook usage errors (imported but never called)
      'imported but never called',  // Added: More specific pattern
    ];

    const unfixablePatterns = [
      'unclosed brace',
      'unmatched brace',
      'documentation instead of code',
      'multiple file',
    ];

    let hasFixable = false;
    let hasUnfixable = false;

    validationErrors.forEach(error => {
      const isUnfixable = unfixablePatterns.some(p => error.includes(p));
      const isFixable = fixablePatterns.some(p => error.includes(p));

      if (isUnfixable) hasUnfixable = true;
      if (isFixable) hasFixable = true;
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
