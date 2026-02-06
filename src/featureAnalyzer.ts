import { ArchitecturePatterns, PatternType, PatternSuggestion, FeatureAnalysis } from './architecturePatterns';

/**
 * Phase 3.4.2: Feature Analyzer
 * Analyzes feature descriptions and suggests appropriate architectures
 */

export interface AntiPattern {
  name: string;
  severity: 'warning' | 'error';
  description: string;
  suggestion: string;
}

export interface FatHook {
  filename: string;
  lines: number;
  complexity: 'moderate' | 'high' | 'critical';
  issues: string[];
}

export interface ArchitectureAnalysis {
  score: number; // 0-10
  layers: LayerScore[];
  duplication: DuplicationAnalysis;
  testability: TestabilityAnalysis;
  maintainability: MaintainabilityAnalysis;
  issues: AntiPattern[];
}

export interface LayerScore {
  name: string;
  score: number; // 0-10
  issues: string[];
}

export interface DuplicationAnalysis {
  score: number; // 0-10
  duplicatePatterns: string[];
  suggestions: string[];
}

export interface TestabilityAnalysis {
  score: number; // 0-10
  testableFiles: string[];
  difficultFiles: string[];
  suggestions: string[];
}

export interface MaintainabilityAnalysis {
  score: number; // 0-10
  wellStructured: string[];
  needsRefactoring: string[];
  suggestions: string[];
}

export class FeatureAnalyzer {
  private patterns: ArchitecturePatterns;

  constructor(patterns?: ArchitecturePatterns) {
    this.patterns = patterns || new ArchitecturePatterns();
  }

  /**
   * Analyze feature request and suggest architecture
   */
  analyzeFeature(description: string): FeatureAnalysis {
    const descUpper = description.toUpperCase();
    const operations = this.extractOperations(description);
    const suggestedPatterns = this.patterns.suggestPatterns(description);
    const complexity = this.patterns.estimateComplexity(
      suggestedPatterns.map(s => s.pattern)
    );

    return {
      name: this.extractFeatureName(description),
      description,
      detectedOperations: operations,
      estimatedComplexity: complexity,
      suggestedPatterns: suggestedPatterns.map(s => s.pattern),
      rationale: this.generateRationale(operations, suggestedPatterns),
    };
  }

  /**
   * Extract operations from feature description
   */
  private extractOperations(description: string): string[] {
    const operations: string[] = [];
    const descUpper = description.toUpperCase();

    if (descUpper.includes('CREATE') || descUpper.includes('ADD') || descUpper.includes('NEW')) {
      operations.push('Create');
    }
    if (descUpper.includes('READ') || descUpper.includes('GET') || descUpper.includes('VIEW') || descUpper.includes('SHOW')) {
      operations.push('Read');
    }
    if (descUpper.includes('UPDATE') || descUpper.includes('EDIT') || descUpper.includes('MODIFY')) {
      operations.push('Update');
    }
    if (descUpper.includes('DELETE') || descUpper.includes('REMOVE')) {
      operations.push('Delete');
    }
    if (descUpper.includes('SEARCH') || descUpper.includes('FIND')) {
      operations.push('Search');
    }
    if (descUpper.includes('FILTER') || descUpper.includes('SORT')) {
      operations.push('Filter');
    }
    if (descUpper.includes('UPLOAD') || descUpper.includes('IMPORT')) {
      operations.push('Upload');
    }
    if (descUpper.includes('DOWNLOAD') || descUpper.includes('EXPORT')) {
      operations.push('Download');
    }

    return operations.length > 0 ? operations : ['Read', 'Display'];
  }

  /**
   * Extract feature name from description
   */
  private extractFeatureName(description: string): string {
    // Try to extract first noun or capitalized word
    const words = description.split(/\s+/);
    for (const word of words) {
      if (word.length > 2 && word !== 'and' && word !== 'the' && word !== 'with') {
        return word.replace(/[^a-zA-Z0-9]/g, '');
      }
    }
    return 'Feature';
  }

  /**
   * Generate rationale for pattern suggestions
   */
  private generateRationale(operations: string[], patterns: PatternSuggestion[]): string {
    if (patterns.length === 0) {
      return 'No specific patterns detected.';
    }

    const primaryPattern = patterns[0];
    const operationsStr = operations.join(', ');

    return `Based on detected operations (${operationsStr}), ` +
      `${primaryPattern.pattern} pattern is recommended (${Math.round(primaryPattern.confidence * 100)}% confidence). ` +
      `${primaryPattern.reason}`;
  }

  /**
   * Detect fat hooks (too much logic in one file)
   */
  detectFatHooks(codeFiles: Map<string, string>): FatHook[] {
    const fatHooks: FatHook[] = [];

    codeFiles.forEach((code, filename) => {
      if (!filename.includes('use') || !filename.endsWith('.ts')) {
        return; // Only analyze hooks
      }

      const lines = code.split('\n').length;
      const issues: string[] = [];

      let complexity: 'moderate' | 'high' | 'critical' = 'moderate';

      // Lines check
      if (lines > 150) {
        complexity = 'high';
        issues.push(`Too many lines (${lines}): Consider extracting service logic`);
      } else if (lines > 200) {
        complexity = 'critical';
        issues.push(`Critical: ${lines} lines - Needs refactoring`);
      }

      // Complexity indicators
      const asyncCount = (code.match(/async\s+function|async\s*\(/g) || []).length;
      if (asyncCount > 3) {
        issues.push(`Multiple async operations (${asyncCount}): Extract to service`);
        complexity = 'high';
      }

      // Logic duplication
      const ifStatements = (code.match(/if\s*\(/g) || []).length;
      if (ifStatements > 5) {
        issues.push(`Complex conditionals (${ifStatements}): Simplify logic`);
      }

      // Try-catch blocks
      const trycatches = (code.match(/try\s*\{/g) || []).length;
      if (trycatches > 2) {
        issues.push(`Error handling spread across (${trycatches}): Centralize`);
      }

      if (issues.length > 0 || lines > 100) {
        fatHooks.push({
          filename,
          lines,
          complexity,
          issues,
        });
      }
    });

    return fatHooks.sort((a, b) => b.lines - a.lines);
  }

  /**
   * Detect anti-patterns in code
   */
  detectAntiPatterns(code: string): AntiPattern[] {
    const patterns: AntiPattern[] = [];
    const codeUpper = code.toUpperCase();

    // Anti-pattern: Direct API calls in components
    if (
      code.includes('fetch(') &&
      (code.includes('export const') || code.includes('export function')) &&
      (code.includes('.tsx') || code.includes('.jsx'))
    ) {
      patterns.push({
        name: 'API Calls in Components',
        severity: 'warning',
        description: 'Components should not make direct API calls',
        suggestion: 'Extract to service layer and use hooks for data fetching',
      });
    }

    // Anti-pattern: Global state in props
    if (code.includes('Redux') && !code.includes('selector')) {
      patterns.push({
        name: 'Redux Props Without Selectors',
        severity: 'warning',
        description: 'Redux state passed to components without selectors',
        suggestion: 'Use useSelector hooks to select only needed data',
      });
    }

    // Anti-pattern: Validation logic in components
    if (
      code.includes('.test(') &&
      (code.includes('<') || code.includes('JSX'))
    ) {
      patterns.push({
        name: 'Validation in JSX',
        severity: 'warning',
        description: 'Validation logic mixed with JSX rendering',
        suggestion: 'Extract validation to schemas or utilities',
      });
    }

    // Anti-pattern: Too many props
    const propsMatch = code.match(/\{\s*([^}]+)\s*\}\s*[:=]\s*\{/);
    if (propsMatch && propsMatch[1].split(',').length > 7) {
      patterns.push({
        name: 'Too Many Props',
        severity: 'warning',
        description: `Component has ${propsMatch[1].split(',').length} props - hard to use`,
        suggestion: 'Group related props into objects or use composition',
      });
    }

    // Anti-pattern: No error handling
    if (code.includes('fetch(') && !code.includes('catch') && !code.includes('.catch')) {
      patterns.push({
        name: 'Missing Error Handling',
        severity: 'error',
        description: 'API calls without error handling',
        suggestion: 'Add try-catch blocks or .catch handlers for all API calls',
      });
    }

    // Anti-pattern: Inline styles
    if (code.includes('style={{') && (code.match(/style={{/g) || []).length > 3) {
      patterns.push({
        name: 'Inline Styles',
        severity: 'warning',
        description: 'Multiple inline styles make code hard to maintain',
        suggestion: 'Extract to CSS modules or styled-components',
      });
    }

    // Anti-pattern: Magic numbers/strings
    if ((code.match(/["'][a-z_]{10,}["']/gi) || []).length > 10) {
      patterns.push({
        name: 'Magic Strings',
        severity: 'warning',
        description: 'Hard-coded strings scattered throughout code',
        suggestion: 'Extract to constants file',
      });
    }

    return patterns;
  }

  /**
   * Rate architecture of a codebase
   */
  rateArchitecture(analysis: {
    fileCount: number;
    hasSchemaLayer: boolean;
    hasServiceLayer: boolean;
    hasHookLayer: boolean;
    hasComponentLayer: boolean;
    averageFileSize: number;
    testCoverage: number;
    hasDuplication: boolean;
  }): ArchitectureAnalysis {
    const layerScores: LayerScore[] = [];
    let totalScore = 0;

    // Score schema layer
    const schemaScore = analysis.hasSchemaLayer ? 9 : 3;
    layerScores.push({
      name: 'Schema/Validation',
      score: schemaScore,
      issues: !analysis.hasSchemaLayer ? ['No schema layer detected'] : [],
    });
    totalScore += schemaScore;

    // Score service layer
    const serviceScore = analysis.hasServiceLayer ? 9 : 2;
    layerScores.push({
      name: 'Service/Business Logic',
      score: serviceScore,
      issues: !analysis.hasServiceLayer ? ['No service layer detected'] : [],
    });
    totalScore += serviceScore;

    // Score hook layer
    const hookScore = analysis.hasHookLayer ? 8 : 4;
    layerScores.push({
      name: 'Hooks/State',
      score: hookScore,
      issues: !analysis.hasHookLayer ? ['No hook layer detected'] : [],
    });
    totalScore += hookScore;

    // Score component layer
    const componentScore = analysis.hasComponentLayer ? 8 : 5;
    layerScores.push({
      name: 'Components/UI',
      score: componentScore,
      issues: !analysis.hasComponentLayer ? ['No component layer detected'] : [],
    });
    totalScore += componentScore;

    // Duplication score
    const duplicationScore = analysis.hasDuplication ? 4 : 8;

    // Testability score
    const testScore = analysis.testCoverage > 0.7 ? 8 : analysis.testCoverage > 0.5 ? 6 : 3;

    // File size score (prefer smaller files)
    let fileSizeScore = 10;
    if (analysis.averageFileSize > 300) fileSizeScore = 3;
    else if (analysis.averageFileSize > 200) fileSizeScore = 5;
    else if (analysis.averageFileSize > 150) fileSizeScore = 7;

    const finalScore =
      (totalScore / layerScores.length +
        duplicationScore +
        testScore +
        fileSizeScore) /
      4;

    return {
      score: Math.min(10, Math.round(finalScore * 10) / 10),
      layers: layerScores,
      duplication: {
        score: duplicationScore,
        duplicatePatterns: analysis.hasDuplication ? ['Similar code found in multiple files'] : [],
        suggestions: analysis.hasDuplication ? ['Extract common logic to utilities'] : [],
      },
      testability: {
        score: testScore,
        testableFiles: [],
        difficultFiles: [],
        suggestions: testScore < 7 ? ['Increase test coverage', 'Add unit tests for business logic'] : [],
      },
      maintainability: {
        score: Math.round((fileSizeScore + totalScore / layerScores.length) / 2),
        wellStructured: analysis.hasSchemaLayer && analysis.hasServiceLayer ? ['Good layer separation'] : [],
        needsRefactoring: !analysis.hasServiceLayer ? ['Extract business logic to services'] : [],
        suggestions: [
          analysis.averageFileSize > 200 ? 'Break down large files' : 'Good file sizes',
          analysis.hasDuplication ? 'Remove code duplication' : 'Good code reusability',
        ].filter(s => s),
      },
      issues: [],
    };
  }
}
