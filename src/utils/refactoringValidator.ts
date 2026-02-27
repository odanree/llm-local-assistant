/**
 * Pure validation utilities for refactoring code
 * These functions have zero side effects and can be tested without mocking
 * Only imports from types/, no service classes
 */

import type { ValidationResult, ImpactAssessment, RefactoringPlan } from '../refactoringExecutor';

/**
 * Validate syntax of code
 * Pure function: checks braces balance, empty code
 */
export function validateSyntaxPure(code: string): ValidationResult {
  try {
    // Basic syntax checks
    if (!code.trim()) {
      return {
        type: 'syntax',
        passed: false,
        details: 'Code is empty',
        severity: 'critical',
      };
    }

    // Check for balanced braces
    const openBraces = (code.match(/\{/g) || []).length;
    const closeBraces = (code.match(/\}/g) || []).length;

    if (openBraces !== closeBraces) {
      return {
        type: 'syntax',
        passed: false,
        details: `Unbalanced braces: ${openBraces} open, ${closeBraces} close`,
        severity: 'critical',
      };
    }

    return {
      type: 'syntax',
      passed: true,
      details: 'Syntax check passed',
      severity: 'info',
    };
  } catch (error) {
    return {
      type: 'syntax',
      passed: false,
      details: `Syntax error: ${error instanceof Error ? error.message : String(error)}`,
      severity: 'critical',
    };
  }
}

/**
 * Validate types of code
 * Pure function: checks for any types, implicit returns, type annotations
 */
export function validateTypesPure(code: string): ValidationResult {
  const issues: string[] = [];

  // Check for `any` types
  if (code.includes(': any')) {
    issues.push('Found `any` type - should use specific types');
  }

  // Check for implicit returns
  if (code.includes('return;') && !code.includes('void')) {
    issues.push('Implicit return should be typed as void or return a value');
  }

  // Check for missing type annotations on exports
  const exports = code.match(/export\s+(?:const|function)\s+\w+/g) || [];
  if (exports.length > 0 && !code.includes('export ')) {
    issues.push('Exported declarations should have type annotations');
  }

  return {
    type: 'types',
    passed: issues.length === 0,
    details: issues.length > 0 ? issues.join('; ') : 'Type check passed',
    severity: issues.length > 0 ? 'warning' : 'info',
  };
}

/**
 * Validate logic of code
 * Pure function: checks exported functions, error handling, async operations
 */
export function validateLogicPure(
  originalCode: string,
  refactoredCode: string
): ValidationResult {
  const issues: string[] = [];

  // Check if refactored exports same functions
  const originalExports = originalCode.match(/export\s+(?:function|const)\s+(\w+)/g) || [];
  const refactoredExports = refactoredCode.match(/export\s+(?:function|const)\s+(\w+)/g) || [];

  if (originalExports.length > refactoredExports.length) {
    issues.push('Some exported functions were removed');
  }

  // Check if error handling maintained
  const originalTryCatch = (originalCode.match(/try\s*\{/g) || []).length;
  const refactoredTryCatch = (refactoredCode.match(/try\s*\{/g) || []).length;

  if (originalTryCatch > refactoredTryCatch) {
    issues.push('Some error handling was removed');
  }

  // Check if async functions maintained
  const originalAsync = (originalCode.match(/async\s+function|async\s*\(/g) || []).length;
  const refactoredAsync = (refactoredCode.match(/async\s+function|async\s*\(/g) || []).length;

  if (originalAsync > refactoredAsync) {
    issues.push('Some async operations were removed');
  }

  return {
    type: 'logic',
    passed: issues.length === 0,
    details: issues.length > 0 ? issues.join('; ') : 'Logic check passed',
    severity: issues.length > 0 ? 'warning' : 'info',
  };
}

/**
 * Validate performance of code
 * Pure function: checks for loops, useEffect hooks
 */
export function validatePerformancePure(
  originalCode: string,
  refactoredCode: string
): ValidationResult {
  const issues: string[] = [];

  // Check for unnecessary loops
  const originalLoops = (originalCode.match(/for\s*\(|while\s*\(/g) || []).length;
  const refactoredLoops = (refactoredCode.match(/for\s*\(|while\s*\(/g) || []).length;

  if (refactoredLoops > originalLoops) {
    issues.push('Refactored code has more loops - check performance');
  }

  // Check for unnecessary re-renders (React)
  if (originalCode.includes('useState') && refactoredCode.includes('useState')) {
    const originalUseEffects = (originalCode.match(/useEffect/g) || []).length;
    const refactoredUseEffects = (refactoredCode.match(/useEffect/g) || []).length;

    if (refactoredUseEffects > originalUseEffects) {
      issues.push('More useEffect hooks - potential performance issue');
    }
  }

  return {
    type: 'performance',
    passed: issues.length === 0,
    details: issues.length > 0 ? issues.join('; ') : 'Performance check passed',
    severity: issues.length > 0 ? 'warning' : 'info',
  };
}

/**
 * Validate compatibility of code
 * Pure function: checks for removed imports, interfaces, breaking changes
 */
export function validateCompatibilityPure(
  originalCode: string,
  refactoredCode: string
): ValidationResult {
  const issues: string[] = [];

  // Check for removed imports
  const originalImports = originalCode.match(/import\s+[^;]+from/g) || [];
  const refactoredImports = refactoredCode.match(/import\s+[^;]+from/g) || [];

  if (refactoredImports.length < originalImports.length) {
    issues.push('Some imports were removed - check if dependencies still work');
  }

  // Check for breaking API changes
  if (originalCode.includes('interface') && refactoredCode.includes('interface')) {
    // If interfaces changed significantly, that's a breaking change
    const originalInterfaceCount = (originalCode.match(/interface\s+\w+/g) || []).length;
    const refactoredInterfaceCount = (refactoredCode.match(/interface\s+\w+/g) || []).length;

    if (refactoredInterfaceCount < originalInterfaceCount) {
      issues.push('Some interfaces were removed - possible breaking changes');
    }
  }

  return {
    type: 'compatibility',
    passed: issues.length === 0,
    details: issues.length > 0 ? issues.join('; ') : 'Compatibility check passed',
    severity: issues.length > 0 ? 'warning' : 'info',
  };
}

/**
 * Assess impact of refactoring
 * Pure function: analyzes benefits, risks, performance, breaking changes
 */
export function assessImpactPure(
  plan: RefactoringPlan,
  originalCode: string,
  refactoredCode: string
): ImpactAssessment {
  const benefits: string[] = [];
  const risks: string[] = [];
  const affectedDeps: string[] = [];

  // Extract benefits from plan
  plan.proposedChanges.forEach(change => {
    if (change.type === 'extract') {
      benefits.push(`Extract ${change.description}`);
    } else if (change.type === 'simplify') {
      benefits.push(`Simplify: ${change.description}`);
    }
  });

  // Detect performance benefits
  const originalSize = originalCode.length;
  const refactoredSize = refactoredCode.length;

  if (refactoredSize < originalSize * 0.8) {
    benefits.push(
      `Code size reduced by ${Math.round(((originalSize - refactoredSize) / originalSize) * 100)}%`
    );
  }

  // Detect risks from plan
  plan.risks.forEach(risk => {
    risks.push(risk.description);
  });

  // Performance impact
  let performanceImpact: ImpactAssessment['performanceImpact'] = 'neutral';
  if (refactoredCode.includes('useMemo') || refactoredCode.includes('useCallback')) {
    performanceImpact = 'positive';
  }

  // Breaking changes
  const hasBreakingChanges =
    originalCode.match(/export\s+\w+/g)?.length !== refactoredCode.match(/export\s+\w+/g)?.length;

  // Affected dependencies
  const imports = refactoredCode.match(/from\s+['"]([^'"]+)['"]/g) || [];
  imports.forEach(imp => {
    const pkg = imp.match(/from\s+['"]([^'"]+)['"]/);
    if (pkg) {
      affectedDeps.push(pkg[1]);
    }
  });

  return {
    estimatedBenefits: benefits,
    potentialRisks: risks,
    performanceImpact,
    breakingChanges: hasBreakingChanges,
    affectedDependencies: affectedDeps,
  };
}
