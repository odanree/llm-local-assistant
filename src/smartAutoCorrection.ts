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
      
      // Styling
      'clsx': 'clsx',
      'twMerge': 'tailwind-merge',
      
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
      
      // Utils
      'logger': './utils/logger',
      'config': './config',
      'constants': './constants',
    };

    // Direct match
    if (patterns[name]) {
      console.log('[SmartAutoCorrection.inferImportSource] Found direct match for', name, ':', patterns[name]);
      return patterns[name];
    }

    console.log('[SmartAutoCorrection.inferImportSource] No direct match found, checking patterns...');
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
    // Check if import already exists
    if (code.includes(`import`) && code.includes(name)) {
      return code;
    }

    // Find where to insert import (after existing imports or at top)
    const importRegex = /^(import\s+.*from\s+['"][^'"]*['"];?\n?)*/m;
    const match = code.match(importRegex);
    
    if (match && match[0]) {
      // Insert after last import
      const insertPos = match[0].length;
      const newImport = `import { ${name} } from '${source}';\n`;
      return code.slice(0, insertPos) + newImport + code.slice(insertPos);
    } else {
      // No imports found, add at very top
      const newImport = `import { ${name} } from '${source}';\n\n`;
      return newImport + code;
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
      // Fix: Unused import → Remove it
      if (error.includes('Unused import')) {
        const match = error.match(/Unused import: '(\w+)'/);
        if (match) {
          fixed = this.removeUnusedImport(fixed, match[1]);
        }
      }

      // Fix: Missing import → Add it
      if (error.includes('Missing import')) {
        const match = error.match(/Missing import: '(\w+)'/);
        if (match) {
          const source = this.inferImportSource(fixed, match[1]);
          if (source) {
            fixed = this.addImport(fixed, match[1], source);
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
      'any type',
      'typo',
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
}

export default SmartAutoCorrection;
