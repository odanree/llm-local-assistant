/**
 * Pure extraction candidate detection utilities
 * Identify code that can be extracted into services
 * Only imports from types/, no LLM or service classes
 */

export interface ExtractionCandidate {
  type: 'state' | 'api' | 'validation' | 'logic' | 'hook';
  description: string;
  confidence: 'high' | 'medium' | 'low';
  lineRange?: { start: number; end: number };
}

/**
 * Detect code patterns that are candidates for extraction
 * Pure function: pattern matching for extractable logic
 */
export function detectExtractionCandidatesPure(code: string): ExtractionCandidate[] {
  const candidates: ExtractionCandidate[] = [];

  // Detect state management candidates
  if (code.includes('useState')) {
    candidates.push({
      type: 'state',
      description: 'State management with useState',
      confidence: 'high',
    });
  }

  // Detect API call candidates
  if (
    code.includes('fetch') ||
    code.includes('axios') ||
    code.includes('api.') ||
    code.includes('useQuery')
  ) {
    candidates.push({
      type: 'api',
      description: 'API call logic',
      confidence: 'high',
    });
  }

  // Detect validation candidates
  if (
    code.includes('z.parse') ||
    code.includes('z.object') ||
    code.includes('validate') ||
    code.includes('schema.parse') ||
    (code.includes('if (!') && code.includes('throw'))
  ) {
    candidates.push({
      type: 'validation',
      description: 'Data validation logic',
      confidence: 'medium',
    });
  }

  // Detect utility/helper candidates
  if (
    code.match(/function\s+\w+\s*\([^)]*\)\s*{[^}]{20,}}/m) ||
    code.includes('export const') && code.includes('=>')
  ) {
    candidates.push({
      type: 'logic',
      description: 'Pure logic/utility functions',
      confidence: 'medium',
    });
  }

  // Detect custom hook candidates
  if (code.match(/const\s+use\w+\s*=\s*\([^)]*\)\s*=>/)) {
    candidates.push({
      type: 'hook',
      description: 'Custom hook implementation',
      confidence: 'high',
    });
  }

  return candidates;
}

/**
 * Extract all dependencies from code
 * Pure function: parse imports and identify dependencies
 */
export function extractDependenciesPure(code: string): string[] {
  const dependencies = new Set<string>();

  // Extract from import statements
  const importMatches = code.matchAll(/import\s+(?:{[^}]*}|[\w\s,*]+)\s+from\s+['"]([^'"]+)['"]/g);
  for (const match of importMatches) {
    dependencies.add(match[1]);
  }

  // Extract from require statements
  const requireMatches = code.matchAll(/require\(['"]([^'"]+)['"]\)/g);
  for (const match of requireMatches) {
    dependencies.add(match[1]);
  }

  return Array.from(dependencies);
}

/**
 * Analyze hook complexity
 * Pure function: count complexity metrics
 */
export function analyzeHookComplexityPure(code: string): {
  complexity: 'simple' | 'moderate' | 'high' | 'critical';
  lines: number;
  asyncOps: number;
  stateCount: number;
  effectCount: number;
} {
  const lines = code.split('\n').length;
  const asyncOps = (code.match(/async|await|fetch|axios|useQuery|useMutation/g) || []).length;
  const stateCount = (code.match(/useState/g) || []).length;
  const effectCount = (code.match(/useEffect/g) || []).length;

  let complexity: 'simple' | 'moderate' | 'high' | 'critical';
  const complexityScore = stateCount + effectCount + asyncOps;

  if (complexityScore <= 1 && lines < 20) {
    complexity = 'simple';
  } else if (complexityScore <= 3 && lines < 50) {
    complexity = 'moderate';
  } else if (complexityScore <= 6 || lines < 100) {
    complexity = 'high';
  } else {
    complexity = 'critical';
  }

  return {
    complexity,
    lines,
    asyncOps,
    stateCount,
    effectCount,
  };
}

/**
 * Detect error handling presence
 * Pure function: check for error handling patterns
 */
export function detectErrorHandlingPure(code: string): {
  hasTryCatch: boolean;
  hasErrorState: boolean;
  hasErrorDisplay: boolean;
  isComplete: boolean;
} {
  const hasTryCatch = /try\s*{|catch\s*\(/.test(code);
  const hasErrorState = /useState.*[Ee]rror|setError|errorState/i.test(code);
  const hasErrorDisplay = /error\s*&&|{.*error|error\?/i.test(code);

  const isComplete = hasTryCatch || hasErrorState;

  return {
    hasTryCatch,
    hasErrorState,
    hasErrorDisplay,
    isComplete,
  };
}

/**
 * Calculate extraction viability score
 * Pure function: determine how safe/easy extraction is
 */
export function calculateExtractionViabilityPure(code: string): {
  score: number; // 0-100
  recommendation: 'excellent' | 'good' | 'risky' | 'not-ready';
  blockers: string[];
} {
  let score = 100;
  const blockers: string[] = [];

  // Deduct for complexity
  const complexity = analyzeHookComplexityPure(code);
  if (complexity.complexity === 'critical') {
    score -= 50;
    blockers.push('Code is too complex for safe extraction');
  } else if (complexity.complexity === 'high') {
    score -= 15;
  }

  // Deduct for state management (indicates component dependency)
  const stateCount = (code.match(/useState/g) || []).length;
  if (stateCount > 0) {
    score -= 15;
  }

  // Deduct for missing error handling (only if there's async operations)
  const errorHandling = detectErrorHandlingPure(code);
  if (complexity.asyncOps > 0 && !errorHandling.isComplete) {
    score -= 20;
    blockers.push('Missing error handling');
  }

  // Check for external dependencies
  const deps = extractDependenciesPure(code);
  if (deps.length > 5) {
    score -= 10;
  }

  // Check for side effects
  if (code.includes('localStorage') || code.includes('sessionStorage') || code.includes('window.')) {
    score -= 25;
    blockers.push('Contains browser-specific side effects');
  }

  let recommendation: 'excellent' | 'good' | 'risky' | 'not-ready';
  if (score >= 80) {
    recommendation = 'excellent';
  } else if (score >= 60) {
    recommendation = 'good';
  } else if (score >= 40) {
    recommendation = 'risky';
  } else {
    recommendation = 'not-ready';
  }

  return { score, recommendation, blockers };
}

/**
 * Identify circular dependency risks
 * Pure function: detect circular import patterns
 */
export function detectCircularDependencyRisksPure(
  code: string,
  filePath: string
): { hasRisk: boolean; likelyDependents: string[] } {
  const likelyDependents: string[] = [];

  // Extract what this file exports
  const exports = code.match(/export\s+(?:const|function|class)\s+(\w+)/g) || [];

  // Check for imports that might create cycles
  if (code.includes('import') && exports.length > 0) {
    // If file both imports and exports, there might be circular dependency potential
    const deps = extractDependenciesPure(code);
    if (deps.some(d => d.includes('components/') || d.includes('hooks/'))) {
      likelyDependents.push('...');
    }
  }

  const hasRisk = likelyDependents.length > 0;
  return { hasRisk, likelyDependents };
}

/**
 * Generate extraction recommendation
 * Pure function: suggest best extraction strategy
 */
export function generateExtractionRecommendationPure(code: string): {
  suggestedType: 'service' | 'hook' | 'utility' | 'none';
  reason: string;
  steps: string[];
} {
  const candidates = detectExtractionCandidatesPure(code);
  const viability = calculateExtractionViabilityPure(code);
  const complexity = analyzeHookComplexityPure(code);

  if (viability.recommendation === 'not-ready') {
    return {
      suggestedType: 'none',
      reason: 'Code is not ready for extraction due to: ' + viability.blockers.join(', '),
      steps: ['Address blockers first', 'Add error handling', 'Reduce complexity'],
    };
  }

  let suggestedType: 'service' | 'hook' | 'utility' | 'none' = 'utility';
  let reason = '';
  const steps: string[] = [];

  if (candidates.some(c => c.type === 'api')) {
    suggestedType = 'hook';
    reason = 'Code contains API calls - extract as custom hook';
    steps.push('Extract to custom hook using useQuery/useMutation');
    steps.push('Add error handling');
    steps.push('Add loading state');
  } else if (candidates.some(c => c.type === 'state')) {
    suggestedType = 'hook';
    reason = 'Code contains state management - extract as custom hook';
    steps.push('Extract state to custom hook');
    steps.push('Export hook with state management');
    steps.push('Document hook dependencies');
  } else if (candidates.some(c => c.type === 'logic')) {
    suggestedType = 'utility';
    reason = 'Code contains pure logic - extract as utility function';
    steps.push('Extract functions to utils/');
    steps.push('Add unit tests');
    steps.push('Document function signatures');
  } else if (complexity.complexity === 'simple') {
    suggestedType = 'utility';
    reason = 'Simple code suitable for utility extraction';
    steps.push('Extract as pure utility');
    steps.push('Add tests');
    steps.push('Update imports');
  }

  return { suggestedType, reason, steps };
}
