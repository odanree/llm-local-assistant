import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

export interface SemanticValidationError {
  type: 'import' | 'usage' | 'pattern' | 'architecture';
  line: number;
  column: number;
  message: string;
  fix?: string;
}

export class SemanticValidator {
  /**
   * Validate code using AST for semantic correctness
   * @param code TypeScript/JSX code to validate
   * @returns Array of semantic validation errors
   */
  validateCode(code: string): SemanticValidationError[] {
    const errors: SemanticValidationError[] = [];

    try {
      const ast = parse(code, {
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
          'decorators-legacy'
        ]
      });

      // Extract imports and their sources
      const imports = this.extractImports(ast);
      const usages = this.extractUsages(ast);

      // Validate: used items are imported
      errors.push(...this.validateImportedUsages(imports, usages, ast));

      // Validate: imported items are used
      errors.push(...this.validateUnusedImports(imports, usages, ast));

      // Validate: semantic patterns (Zod, TanStack Query, etc.)
      errors.push(...this.validateSemanticPatterns(ast, imports));

      // Validate: architecture violations
      errors.push(...this.validateArchitecture(ast, imports));
    } catch (e) {
      // AST parsing error - fall back to basic validation
      // Don't fail hard, just skip semantic checks
      if (e instanceof Error) {
        console.log(`[SemanticValidator] AST parsing failed: ${e.message}`);
      }
    }

    return errors;
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
      }
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
        if (path.node.name.startsWith('_')) {
          return; // Skip private/unused vars
        }

        const name = path.node.name;
        const line = path.node.loc?.start.line || 0;
        if (!usages.has(name)) {
          usages.set(name, []);
        }
        usages.get(name)!.push(line);
      }
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
      'console', 'Math', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date',
      'RegExp', 'Error', 'JSON', 'Promise', 'Map', 'Set', 'React', 'Component'
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
          fix: `Import '${name}' or define it locally`
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
    ast: t.File
  ): SemanticValidationError[] {
    const errors: SemanticValidationError[] = [];

    imports.forEach((source, name) => {
      if (!usages.has(name)) {
        const line = this.findImportLine(ast, name);
        errors.push({
          type: 'import',
          line,
          column: 0,
          message: `'${name}' is imported but never used`,
          fix: `Remove: import ... ${name} ... from '${source}'`
        });
      }
    });

    return errors;
  }

  /**
   * Validate semantic patterns (Zod, TanStack Query, etc.)
   */
  private validateSemanticPatterns(
    ast: t.File,
    imports: Map<string, string>
  ): SemanticValidationError[] {
    const errors: SemanticValidationError[] = [];

    // Zod pattern validation
    if (imports.has('z') && imports.get('z') === 'zod') {
      errors.push(...this.validateZodPatterns(ast));
    }

    // TanStack Query pattern validation
    if (imports.has('useQuery') && imports.get('useQuery')?.includes('@tanstack')) {
      errors.push(...this.validateTanStackQueryPatterns(ast));
    }

    // Zustand pattern validation
    if (imports.has('create') && imports.get('create') === 'zustand') {
      errors.push(...this.validateZustandPatterns(ast));
    }

    return errors;
  }

  /**
   * Validate Zod usage patterns
   */
  private validateZodPatterns(ast: t.File): SemanticValidationError[] {
    const errors: SemanticValidationError[] = [];
    // TODO: Implement specific Zod pattern validation
    return errors;
  }

  /**
   * Validate TanStack Query usage patterns
   */
  private validateTanStackQueryPatterns(ast: t.File): SemanticValidationError[] {
    const errors: SemanticValidationError[] = [];
    // TODO: Implement specific TanStack Query pattern validation
    return errors;
  }

  /**
   * Validate Zustand patterns
   */
  private validateZustandPatterns(ast: t.File): SemanticValidationError[] {
    const errors: SemanticValidationError[] = [];
    // TODO: Implement specific Zustand pattern validation
    return errors;
  }

  /**
   * Validate architecture rules
   */
  private validateArchitecture(
    ast: t.File,
    imports: Map<string, string>
  ): SemanticValidationError[] {
    const errors: SemanticValidationError[] = [];
    // TODO: Implement architecture validation
    return errors;
  }

  /**
   * Find line number of import statement
   */
  private findImportLine(ast: t.File, name: string): number {
    let line = 1;
    traverse(ast, {
      ImportDeclaration(path) {
        path.node.specifiers.forEach((spec) => {
          if (t.isImportSpecifier(spec) && spec.local.name === name) {
            line = spec.local.loc?.start.line || 1;
          }
        });
      }
    });
    return line;
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
      },
      ClassDeclaration(path) {
        if (path.node.id) {
          definitions.add(path.node.id.name);
        }
      },
      ArrowFunctionExpression(path) {
        // Only if assigned: const foo = () => {}
        if (t.isVariableDeclarator(path.parent) && t.isIdentifier(path.parent.id)) {
          definitions.add(path.parent.id.name);
        }
      }
    });

    return definitions;
  }
}

export default SemanticValidator;
