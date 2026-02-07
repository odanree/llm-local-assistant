import { LLMClient } from './llmClient';

/**
 * Phase 3.4.5: Semantic Analyzer
 * 
 * Performs deep semantic analysis of React hooks to detect:
 * - Unused state variables
 * - Missing useEffect dependencies
 * - Tight coupling between concerns
 * - Anti-patterns and code smells
 */

export interface StateVariable {
  name: string;
  line: number;
  declared: boolean;
  mutated: boolean;
  used: boolean;
  usedInEffect: boolean;
  severity: 'unused' | 'orphaned' | 'stale' | 'none';
  description: string;
}

export interface DependencyIssue {
  effect: number; // Line number
  missing: string[]; // Variables used but not in deps
  extra: string[]; // In deps but not used
  severity: 'critical' | 'warning';
  description: string;
}

export interface CouplingProblem {
  type: 'api-in-component' | 'api-in-logic' | 'state-mutation' | 'mixed-concerns';
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
}

export interface DataFlowIssue {
  variable: string;
  issue: 'never-updated' | 'stale-closure' | 'inconsistent-return' | 'orphaned-state';
  severity: 'high' | 'medium' | 'low';
  description: string;
}

export interface AntiPatternDetail {
  type: 'stale-closure' | 'missing-deps' | 'unused-state' | 'tight-coupling' | 'infinite-loop';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
}

export interface SemanticAnalysis {
  unusedStates: StateVariable[];
  dependencyIssues: DependencyIssue[];
  couplingProblems: CouplingProblem[];
  dataFlowIssues: DataFlowIssue[];
  antiPatterns: AntiPatternDetail[];
  overallComplexity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  issues: string[]; // Human-readable summary
  suggestedExtractions: string[]; // Services to extract
}

export class SemanticAnalyzer {
  private llmClient: LLMClient | undefined;

  constructor(llmClient?: LLMClient) {
    this.llmClient = llmClient;
  }

  /**
   * Analyze a React hook for semantic issues
   */
  async analyzeHook(code: string): Promise<SemanticAnalysis> {
    console.log('[SemanticAnalyzer] Starting semantic analysis...');
    
    const lines = code.split('\n');
    
    // Layer 1: Find all state variables
    const unusedStates = this.findUnusedStates(code, lines);
    console.log(`[SemanticAnalyzer] Found ${unusedStates.length} potential unused states`);
    
    // Layer 2: Validate useEffect dependencies
    const dependencyIssues = this.validateDependencies(code, lines);
    console.log(`[SemanticAnalyzer] Found ${dependencyIssues.length} dependency issues`);
    
    // Layer 3: Detect tight coupling
    const couplingProblems = this.detectCoupling(code, lines);
    console.log(`[SemanticAnalyzer] Found ${couplingProblems.length} coupling problems`);
    
    // Layer 4: Analyze data flow
    const dataFlowIssues = this.analyzeDataFlow(code, lines, unusedStates);
    console.log(`[SemanticAnalyzer] Found ${dataFlowIssues.length} data flow issues`);
    
    // Layer 5: Detect anti-patterns
    const antiPatterns = this.detectAntiPatterns(code, lines, dependencyIssues, unusedStates);
    console.log(`[SemanticAnalyzer] Found ${antiPatterns.length} anti-patterns`);
    
    // Calculate overall complexity
    const overallComplexity = this.calculateComplexity(
      unusedStates,
      dependencyIssues,
      couplingProblems,
      dataFlowIssues,
      antiPatterns
    );
    
    // Generate human-readable issues
    const issues = this.generateIssueSummary(
      unusedStates,
      dependencyIssues,
      couplingProblems,
      dataFlowIssues,
      antiPatterns
    );
    
    // Suggest extractions
    const suggestedExtractions = this.suggestExtractions(
      couplingProblems,
      antiPatterns,
      unusedStates
    );
    
    return {
      unusedStates,
      dependencyIssues,
      couplingProblems,
      dataFlowIssues,
      antiPatterns,
      overallComplexity,
      issues,
      suggestedExtractions,
    };
  }

  /**
   * Layer 1: Find unused state variables
   */
  private findUnusedStates(code: string, lines: string[]): StateVariable[] {
    const states: StateVariable[] = [];
    
    // Find all useState declarations
    const useStateRegex = /const\s+\[\s*(\w+)\s*,\s*\w+\s*\]\s*=\s*useState/g;
    let match;
    
    while ((match = useStateRegex.exec(code)) !== null) {
      const varName = match[1];
      const lineNum = code.substring(0, match.index).split('\n').length;
      
      // Check if variable is used
      const varRegex = new RegExp(`\\b${varName}\\b`, 'g');
      const allMatches = code.match(varRegex) || [];
      
      // Count: 1 for declaration, rest are usage
      const usageCount = allMatches.length - 1;
      
      // Check if used in useEffect or return
      const usedInEffect = new RegExp(`useEffect\\s*\\([^)]*${varName}[^)]*\\)`).test(code);
      const usedInReturn = new RegExp(`return\\s*\\{[^}]*${varName}[^}]*\\}`).test(code);
      
      // Check if setter is called
      const setterName = `set${varName.charAt(0).toUpperCase()}${varName.slice(1)}`;
      const setterRegex = new RegExp(`${setterName}\\s*\\(`);
      const isMutated = setterRegex.test(code);
      
      let severity: StateVariable['severity'] = 'none';
      let description = `State variable '${varName}' is used`;
      
      if (usageCount === 0) {
        severity = 'unused';
        description = `State variable '${varName}' is declared but never used`;
      } else if (!isMutated && usedInEffect) {
        severity = 'orphaned';
        description = `State variable '${varName}' is used but never mutated (orphaned state)`;
      } else if (isMutated && !usedInEffect && !usedInReturn) {
        severity = 'stale';
        description = `State variable '${varName}' is mutated but never read (stale closure)`;
      }
      
      states.push({
        name: varName,
        line: lineNum,
        declared: true,
        mutated: isMutated,
        used: usageCount > 0,
        usedInEffect,
        severity,
        description,
      });
    }
    
    return states.filter(s => s.severity !== 'none');
  }

  /**
   * Layer 2: Validate useEffect dependencies
   */
  private validateDependencies(code: string, lines: string[]): DependencyIssue[] {
    const issues: DependencyIssue[] = [];
    
    // Find all useEffect hooks
    const useEffectRegex = /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{([^}]+)\}\s*,\s*\[([^\]]*)\]/g;
    let match;
    
    while ((match = useEffectRegex.exec(code)) !== null) {
      const effectBody = match[1];
      const depsStr = match[2];
      const lineNum = code.substring(0, match.index).split('\n').length;
      
      // Parse dependencies
      const deps = depsStr.split(',').map(d => d.trim()).filter(d => d);
      
      // Find all variables used in effect body (excluding local variables)
      const varRegex = /\b([a-zA-Z_]\w*)\b/g;
      const usedVars = new Set<string>();
      let varMatch;
      
      while ((varMatch = varRegex.exec(effectBody)) !== null) {
        const varName = varMatch[1];
        // Skip keywords and common functions
        if (!['function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'async', 'await'].includes(varName)) {
          usedVars.add(varName);
        }
      }
      
      // Check for missing dependencies
      const missing = Array.from(usedVars).filter(v => !deps.includes(v));
      const extra = deps.filter(d => !usedVars.has(d));
      
      if (missing.length > 0 || extra.length > 0) {
        issues.push({
          effect: lineNum,
          missing,
          extra,
          severity: missing.length > 0 ? 'critical' : 'warning',
          description: missing.length > 0 
            ? `Missing dependencies: ${missing.join(', ')}`
            : `Extra dependencies: ${extra.join(', ')}`,
        });
      }
    }
    
    return issues;
  }

  /**
   * Layer 3: Detect tight coupling
   */
  private detectCoupling(code: string, lines: string[]): CouplingProblem[] {
    const problems: CouplingProblem[] = [];
    
    // Check for fetch/API calls in component
    if (/fetch\s*\(|axios\s*\.|\.get\s*\(|\.post\s*\(/.test(code)) {
      problems.push({
        type: 'api-in-component',
        severity: 'high',
        description: 'Direct API calls found in component logic',
        suggestion: 'Extract API logic to a custom hook (useApi) or service',
      });
    }
    
    // Check for business logic mixed with filtering
    if (/filter\s*\(|map\s*\(|reduce\s*\(/.test(code) && /fetch\s*\(|axios\s*\./.test(code)) {
      problems.push({
        type: 'mixed-concerns',
        severity: 'high',
        description: 'Business logic mixed with data fetching',
        suggestion: 'Separate concerns: API layer and filtering layer',
      });
    }
    
    // Check for multiple state mutations in one effect
    const useEffectCount = (code.match(/useEffect/g) || []).length;
    const setStateCount = (code.match(/set[A-Z]\w+\s*\(/g) || []).length;
    
    if (setStateCount > useEffectCount * 2) {
      problems.push({
        type: 'state-mutation',
        severity: 'medium',
        description: 'Multiple state mutations suggest unrelated concerns',
        suggestion: 'Consider breaking hook into smaller, focused hooks',
      });
    }
    
    return problems;
  }

  /**
   * Layer 4: Analyze data flow
   */
  private analyzeDataFlow(code: string, lines: string[], states: StateVariable[]): DataFlowIssue[] {
    const issues: DataFlowIssue[] = [];
    
    for (const state of states) {
      if (state.severity === 'unused') {
        issues.push({
          variable: state.name,
          issue: 'never-updated',
          severity: 'high',
          description: `'${state.name}' is never updated after declaration`,
        });
      } else if (state.severity === 'stale') {
        issues.push({
          variable: state.name,
          issue: 'stale-closure',
          severity: 'high',
          description: `'${state.name}' creates stale closure - updated but never read`,
        });
      }
    }
    
    // Check for inconsistent returns
    const returnRegex = /return\s*\{([^}]+)\}/g;
    let returnMatch = returnRegex.exec(code);
    
    if (returnMatch) {
      const returnedVars = returnMatch[1].split(',').map(v => v.trim().split(':')[0]).filter(v => v);
      for (const varName of returnedVars) {
        const stateInfo = states.find(s => s.name === varName);
        if (stateInfo && !stateInfo.mutated) {
          issues.push({
            variable: varName,
            issue: 'inconsistent-return',
            severity: 'medium',
            description: `'${varName}' is returned but never changes (read-only state)`,
          });
        }
      }
    }
    
    return issues;
  }

  /**
   * Layer 5: Detect anti-patterns
   */
  private detectAntiPatterns(
    code: string,
    lines: string[],
    deps: DependencyIssue[],
    states: StateVariable[]
  ): AntiPatternDetail[] {
    const patterns: AntiPatternDetail[] = [];
    
    // Anti-pattern: Missing dependencies
    if (deps.length > 0) {
      patterns.push({
        type: 'missing-deps',
        severity: 'critical',
        description: `${deps.length} useEffect hook(s) have missing dependencies`,
        suggestion: 'Add all used variables to dependency arrays',
      });
    }
    
    // Anti-pattern: Unused state
    const unusedStates = states.filter(s => s.severity === 'unused');
    if (unusedStates.length > 0) {
      patterns.push({
        type: 'unused-state',
        severity: 'high',
        description: `${unusedStates.length} unused state variable(s): ${unusedStates.map(s => s.name).join(', ')}`,
        suggestion: 'Remove unused state or add to dependency arrays',
      });
    }
    
    // Anti-pattern: Stale closures
    const staleClosure = states.filter(s => s.severity === 'stale');
    if (staleClosure.length > 0) {
      patterns.push({
        type: 'stale-closure',
        severity: 'high',
        description: `${staleClosure.length} potential stale closure(s)`,
        suggestion: 'Ensure all state is read after being updated',
      });
    }
    
    return patterns;
  }

  /**
   * Calculate overall complexity based on issues
   */
  private calculateComplexity(
    unused: StateVariable[],
    deps: DependencyIssue[],
    coupling: CouplingProblem[],
    dataFlow: DataFlowIssue[],
    antiPatterns: AntiPatternDetail[]
  ): SemanticAnalysis['overallComplexity'] {
    const criticalIssues = [
      deps.filter(d => d.severity === 'critical').length,
      antiPatterns.filter(p => p.severity === 'critical').length,
      dataFlow.filter(d => d.severity === 'high').length,
    ].reduce((a, b) => a + b, 0);
    
    const highIssues = [
      unused.filter(s => s.severity !== 'none').length,
      coupling.filter(c => c.severity === 'high').length,
    ].reduce((a, b) => a + b, 0);
    
    if (criticalIssues >= 2 || (criticalIssues >= 1 && highIssues >= 3)) {
      return 'CRITICAL';
    } else if (criticalIssues === 1 || highIssues >= 2) {
      return 'HIGH';
    } else if (criticalIssues === 0 && highIssues === 1) {
      return 'MEDIUM';
    }
    
    return 'LOW';
  }

  /**
   * Generate human-readable issue summary
   */
  private generateIssueSummary(
    unused: StateVariable[],
    deps: DependencyIssue[],
    coupling: CouplingProblem[],
    dataFlow: DataFlowIssue[],
    antiPatterns: AntiPatternDetail[]
  ): string[] {
    const issues: string[] = [];
    
    if (deps.length > 0) {
      issues.push(`⚠️ Missing dependencies in ${deps.length} useEffect hook(s)`);
    }
    
    if (unused.length > 0) {
      issues.push(`🔴 Unused state: ${unused.map(u => u.name).join(', ')}`);
    }
    
    if (coupling.length > 0) {
      issues.push(`🔗 Tight coupling detected: ${coupling.map(c => c.type).join(', ')}`);
    }
    
    if (dataFlow.length > 0) {
      issues.push(`💾 Data flow issues: ${dataFlow.map(d => d.issue).join(', ')}`);
    }
    
    if (antiPatterns.length > 0) {
      issues.push(`⚡ Anti-patterns: ${antiPatterns.map(p => p.type).join(', ')}`);
    }
    
    return issues.length > 0 ? issues : ['✅ No major semantic issues detected'];
  }

  /**
   * Suggest which services to extract
   */
  private suggestExtractions(
    coupling: CouplingProblem[],
    antiPatterns: AntiPatternDetail[],
    unused: StateVariable[]
  ): string[] {
    const suggestions: string[] = [];
    
    if (coupling.some(c => c.type === 'api-in-component' || c.type === 'api-in-logic')) {
      suggestions.push('Extract API logic to useApi hook');
    }
    
    if (coupling.some(c => c.type === 'mixed-concerns')) {
      suggestions.push('Extract filtering logic to useFilter hook');
    }
    
    if (antiPatterns.some(p => p.type === 'stale-closure')) {
      suggestions.push('Extract state management to Zustand/Redux');
    }
    
    return suggestions;
  }
}
