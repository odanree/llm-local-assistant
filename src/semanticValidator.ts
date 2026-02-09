import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import {
  VALIDATOR_PROFILES,
  getApplicableProfiles,
  ValidatorProfile,
} from './services/ValidatorProfiles';
import { DomainAwareAuditor } from './services/DomainAwareAuditor';

export interface SemanticValidationError {
  type:
    | 'import'
    | 'usage'
    | 'pattern'
    | 'architecture'
    | 'rule-violation'
    | 'profile-violation';
  line: number;
  column: number;
  message: string;
  fix?: string;
  /**
   * Which rule triggered this error?
   * Links back to ValidatorProfile.id
   */
  ruleId?: string;
  severity?: 'error' | 'warn';
}

/**
 * SemanticValidator - Rule-Based Code Validation
 *
 * NEW APPROACH (v2):
 * - Don't check hardcoded paths
 * - Use ValidatorProfiles (pattern-based selectors)
 * - Apply rules only when content matches the selector
 * - Support suppression of generic linter noise
 *
 * VALIDATION LAYERS:
 * 1. Profile Selection (which rules apply?)
 * 2. Forbidden Pattern Check (what must NOT appear)
 * 3. Required Pattern Check (what MUST appear)
 * 4. AST Semantic Check (detailed analysis)
 */
export class SemanticValidator {
  private suppressedLinterIds: Set<string> = new Set();

  /**
   * Validate code using rule-based profiles and AST analysis
   * @param code TypeScript/JSX code to validate
   * @returns Array of semantic validation errors
   */
  validateCode(code: string): SemanticValidationError[] {
    const errors: SemanticValidationError[] = [];

    try {
      // STEP 0: DOMAIN DETECTION & SUPPRESSION RULES
      // Detect which domain this code belongs to
      const domain = DomainAwareAuditor.findDomain(code);
      const suppressedRules = domain
        ? DomainAwareAuditor.getSuppressedRules(code)
        : [];

      // STEP 1: Apply rule-based validation (ValidatorProfiles)
      // This is pattern-based, not AST-dependent
      errors.push(...this.validateByProfiles(code));

      // STEP 2: Apply AST-based validation (imports, usages, etc.)
      // Only run if we have a valid AST
      try {
        const ast = this.parseAST(code);
        errors.push(...this.validateByAST(code, ast));
      } catch (astError) {
        // AST parsing failed, skip AST validation
        // But we still have profile-based validation from STEP 1
        if (astError instanceof Error) {
          console.log(`[SemanticValidator] AST parsing skipped: ${astError.message}`);
        }
      }

      // STEP 3: RULE FILTERING (Domain-Aware)
      // Filter out errors that are suppressed for this domain
      // This prevents infrastructure files from being bullied by component rules
      const filteredErrors = this.filterErrorsByDomain(
        errors,
        suppressedRules,
        domain?.id
      );

      // Deduplicate errors (same location + message)
      return this.deduplicateErrors(filteredErrors);
    } catch (e) {
      if (e instanceof Error) {
        console.log(`[SemanticValidator] Validation error: ${e.message}`);
      }
      return this.deduplicateErrors(errors);
    }
  }

  /**
   * STEP 3: Filter errors based on domain context
   * Removes errors that are suppressed for this domain
   * 
   * EXAMPLE: Infrastructure domain suppresses ClassValue unused warnings
   * because they're needed for type safety, even if "unused"
   */
  private filterErrorsByDomain(
    errors: SemanticValidationError[],
    suppressedRules: string[],
    domainId?: string
  ): SemanticValidationError[] {
    if (!domainId || suppressedRules.length === 0) {
      return errors; // No domain context, return all errors
    }

    return errors.filter((error) => {
      // Check if this error matches any suppressed rule
      for (const suppressedRule of suppressedRules) {
        // Match by:
        // 1. Error message containing the rule name
        // 2. Rule ID if present
        if (
          error.message.toLowerCase().includes(suppressedRule.toLowerCase()) ||
          error.ruleId === suppressedRule
        ) {
          // This error is suppressed for this domain
          console.log(
            `[SemanticValidator] Suppressed for ${domainId}: ${error.message}`
          );
          return false; // Filter it out
        }
      }
      return true; // Keep this error
    });
  }

  /**
   * STEP 1: Validate using rule-based profiles
   * Pattern matching without AST parsing
   */
  private validateByProfiles(code: string): SemanticValidationError[] {
    const errors: SemanticValidationError[] = [];
    const applicableProfiles = getApplicableProfiles(code);

    applicableProfiles.forEach((profile) => {
      // Collect linter IDs to suppress for this profile
      if (profile.suppressLinterIds) {
        profile.suppressLinterIds.forEach((id) =>
          this.suppressedLinterIds.add(id)
        );
      }

      // Check FORBIDDEN patterns
      if (profile.forbidden) {
        profile.forbidden.forEach((pattern) => {
          if (pattern.test(code)) {
            const lineNum = this.findLineOfPattern(code, pattern);
            errors.push({
              type: 'profile-violation',
              line: lineNum,
              column: 0,
              message: `[${profile.name}] ${profile.message}`,
              fix: `Remove code matching: ${pattern.source}`,
              ruleId: profile.id,
              severity: profile.severity || 'error',
            });
          }
        });
      }

      // Check REQUIRED patterns
      if (profile.required) {
        const missingPatterns = profile.required.filter(
          (pattern) => !pattern.test(code)
        );

        if (missingPatterns.length > 0) {
          errors.push({
            type: 'profile-violation',
            line: 1,
            column: 0,
            message: `[${profile.name}] ${profile.message}`,
            fix: `Add missing pattern(s): ${missingPatterns
              .map((p) => p.source)
              .join(', ')}`,
            ruleId: profile.id,
            severity: profile.severity || 'error',
          });
        }
      }
    });

    return errors;
  }

  /**
   * STEP 2: Validate using AST analysis
   * Deep semantic checks for imports, usages, etc.
   */
  private validateByAST(code: string, ast: t.File): SemanticValidationError[] {
    const errors: SemanticValidationError[] = [];

    // Extract semantic information
    const imports = this.extractImports(ast);
    const usages = this.extractUsages(ast);

    // Validate imported usage (used items are imported)
    errors.push(...this.validateImportedUsages(imports, usages, ast));

    // Validate unused imports (imported items are used)
    errors.push(...this.validateUnusedImports(imports, usages, ast));

    // Validate semantic patterns (React hooks, Zod, etc.)
    errors.push(...this.validateSemanticPatterns(ast, imports));

    return errors;
  }

  /**
   * Parse code to AST with TypeScript/JSX support
   */
  private parseAST(code: string): t.File {
    return parse(code, {
      sourceType: 'module',
      plugins: [
        'typescript',
        'jsx',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        ['pipelineOperator', { proposal: 'minimal' }],
        'nullishCoalescingOperator',
        'logicalAssignment',
        'partialApplication',
        'optionalCatchBinding',
        'asyncGenerators',
        'decorators-legacy',
      ],
    });
  }

  /**
   * Extract all imports from AST
   */
  private extractImports(ast: t.File): Map<string, string> {
    const imports = new Map<string, string>();

    traverse(ast, {
      ImportDeclaration(path) {
        const source = path.node.source.value;
        path.node.specifiers.forEach((spec) => {
          if (t.isImportSpecifier(spec)) {
            const name = spec.local.name;
            imports.set(name, source);
          } else if (t.isImportDefaultSpecifier(spec)) {
            imports.set(spec.local.name, source);
          } else if (t.isImportNamespaceSpecifier(spec)) {
            imports.set(spec.local.name, source);
          }
        });
      },
    });

    return imports;
  }

  /**
   * Extract all identifier usages from AST
   */
  private extractUsages(ast: t.File): Map<string, number[]> {
    const usages = new Map<string, number[]>();

    traverse(ast, {
      Identifier(path) {
        // Skip import declarations and definitions
        if (path.isImportSpecifier() || path.isImportDeclaration()) {
          return;
        }

        // Skip variable/function/class declarations (they're not usages)
        if (
          path.parent &&
          ((t.isVariableDeclarator(path.parent) &&
            path.parent.id === path.node) ||
            (t.isFunctionDeclaration(path.parent) &&
              path.parent.id === path.node) ||
            (t.isClassDeclaration(path.parent) && path.parent.id === path.node))
        ) {
          return;
        }

        if (path.node.name.startsWith('_')) {
          return; // Skip private/unused vars
        }

        const name = path.node.name;
        const line = path.node.loc?.start.line || 0;
        if (!usages.has(name)) {
          usages.set(name, []);
        }
        usages.get(name)!.push(line);
      },
    });

    return usages;
  }

  /**
   * Validate that used identifiers are imported
   */
  private validateImportedUsages(
    imports: Map<string, string>,
    usages: Map<string, number[]>,
    ast: t.File
  ): SemanticValidationError[] {
    const errors: SemanticValidationError[] = [];
    const jsGlobals = new Set([
      'console',
      'Math',
      'Object',
      'Array',
      'String',
      'Number',
      'Boolean',
      'Date',
      'RegExp',
      'Error',
      'JSON',
      'Promise',
      'Map',
      'Set',
      'React',
      'Component',
    ]);

    const localDefinitions = this.extractLocalDefinitions(ast);

    usages.forEach((lines, name) => {
      if (!imports.has(name) && !jsGlobals.has(name) && !localDefinitions.has(name)) {
        const line = lines[0];
        errors.push({
          type: 'usage',
          line,
          column: 0,
          message: `'${name}' is used but never imported or defined`,
          fix: `Import '${name}' or define it locally`,
          severity: 'error',
        });
      }
    });

    return errors;
  }

  /**
   * Validate that imported items are actually used
   */
  private validateUnusedImports(
    imports: Map<string, string>,
    usages: Map<string, number[]>,
    _ast: t.File
  ): SemanticValidationError[] {
    const errors: SemanticValidationError[] = [];

    imports.forEach((source, name) => {
      if (!usages.has(name)) {
        const line = 1; // Simplified: imports are at top
        errors.push({
          type: 'import',
          line,
          column: 0,
          message: `'${name}' is imported but never used`,
          fix: `Remove: import ... ${name} ... from '${source}'`,
          severity: 'warn',
        });
      }
    });

    return errors;
  }

  /**
   * Validate semantic patterns (React hooks, Zod, etc.)
   */
  private validateSemanticPatterns(
    ast: t.File,
    imports: Map<string, string>
  ): SemanticValidationError[] {
    const errors: SemanticValidationError[] = [];

    // React hooks validation
    if (this.hasReactHooks(imports)) {
      errors.push(...this.validateReactHooks(ast));
    }

    // Zod validation
    if (imports.has('z') && imports.get('z') === 'zod') {
      // Already handled by profiles
    }

    return errors;
  }

  /**
   * Check if code imports any React hooks
   */
  private hasReactHooks(imports: Map<string, string>): boolean {
    const hooks = [
      'useState',
      'useEffect',
      'useContext',
      'useReducer',
      'useCallback',
      'useMemo',
    ];
    return hooks.some((hook) => imports.has(hook));
  }

  /**
   * Validate React hooks are called as functions
   */
  private validateReactHooks(ast: t.File): SemanticValidationError[] {
    const errors: SemanticValidationError[] = [];
    const hooks = [
      'useState',
      'useEffect',
      'useContext',
      'useReducer',
      'useCallback',
      'useMemo',
    ];

    traverse(ast, {
      VariableDeclarator(path) {
        const name = t.isIdentifier(path.node.id) ? path.node.id.name : null;
        if (!name) return;

        // Check if assigning a hook to a variable (bad pattern)
        const init = path.node.init;
        if (init && t.isIdentifier(init)) {
          if (hooks.includes(init.name)) {
            errors.push({
              type: 'pattern',
              line: path.node.loc?.start.line || 1,
              column: 0,
              message: `React hook '${init.name}' stored as value instead of called`,
              fix: `Call as function: ${init.name}() instead of ${init.name}`,
              severity: 'error',
            });
          }
        }
      },
    });

    return errors;
  }

  /**
   * Extract locally defined identifiers (const, let, var, function, class)
   */
  private extractLocalDefinitions(ast: t.File): Set<string> {
    const definitions = new Set<string>();

    traverse(ast, {
      VariableDeclarator(path) {
        if (t.isIdentifier(path.node.id)) {
          definitions.add(path.node.id.name);
        }
      },
      FunctionDeclaration(path) {
        if (path.node.id) {
          definitions.add(path.node.id.name);
        }
        // Also collect parameters
        path.node.params.forEach((param) => {
          if (t.isIdentifier(param)) {
            definitions.add(param.name);
          }
        });
      },
      ClassDeclaration(path) {
        if (path.node.id) {
          definitions.add(path.node.id.name);
        }
      },
      ArrowFunctionExpression(path) {
        // Collect parameters from arrow functions
        path.node.params.forEach((param) => {
          if (t.isIdentifier(param)) {
            definitions.add(param.name);
          }
        });
        // Only if assigned: const foo = () => {}
        if (
          t.isVariableDeclarator(path.parent) &&
          t.isIdentifier(path.parent.id)
        ) {
          definitions.add(path.parent.id.name);
        }
      },
      FunctionExpression(path) {
        // Collect parameters
        path.node.params.forEach((param) => {
          if (t.isIdentifier(param)) {
            definitions.add(param.name);
          }
        });
      },
      ObjectProperty(path) {
        // Object shorthand: { name } where name is a local binding
        if (path.node.shorthand && t.isIdentifier(path.node.key)) {
          definitions.add(path.node.key.name);
        }
      },
      ImportSpecifier(path) {
        // imported items are also "locally defined" in the module scope
        definitions.add(path.node.local.name);
      },
    });

    return definitions;
  }

  /**
   * Find the line number where a pattern first matches
   */
  private findLineOfPattern(code: string, pattern: RegExp): number {
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        return i + 1; // 1-indexed
      }
    }
    return 1;
  }

  /**
   * Deduplicate errors (same line + message)
   */
  private deduplicateErrors(errors: SemanticValidationError[]): SemanticValidationError[] {
    const seen = new Set<string>();
    return errors.filter((error) => {
      const key = `${error.line}:${error.message}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Public utility: Get applicable profiles for code
   */
  getApplicableProfiles(code: string): ValidatorProfile[] {
    return getApplicableProfiles(code);
  }

  /**
   * Public utility: Get all profile IDs
   */
  getAllProfileIds(): string[] {
    return Object.keys(VALIDATOR_PROFILES);
  }
}

export default SemanticValidator;
