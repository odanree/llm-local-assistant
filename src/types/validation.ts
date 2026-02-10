/**
 * ValidationReport: Machine-Readable Feedback Structure
 * 
 * Purpose: Ensure Planner/Refiner receive actionable validation feedback,
 * not just error messages they can "hallucinate" away.
 * 
 * Danh's insight: LLMs treat general errors as suggestions.
 * Specific violation codes trigger instruction-following.
 */

export interface ViolationCode {
  code: string; // e.g., "PATH_INVALID", "EXPORT_MISSING"
  severity: 'critical' | 'error' | 'warning';
  description: string; // Human-readable explanation
  example?: string; // Example of correct behavior
  instruction: string; // What to do next (for LLM)
}

export interface ValidationReport {
  /** Unique ID for tracking this validation result */
  validationId: string;
  
  /** Timestamp of validation */
  timestamp: Date;
  
  /** Was validation successful? */
  success: boolean;
  
  /** List of violations found */
  violations: ViolationCode[];
  
  /** What failed? */
  failedAt?: 'path' | 'structure' | 'type' | 'export' | 'import' | 'unknown';
  
  /** Machine-readable context for retry */
  context?: {
    step?: number;
    action?: string;
    targetFile?: string;
    errorDetails?: string;
  };
  
  /** Instructions for LLM (goes into RetryContext) */
  instruction?: string;
  
  /** Summary for human reader */
  summary: string;
}

/**
 * Violation Codes Registry (Danh's "Specific Violation Codes")
 * These trigger LLM instruction-following better than generic errors.
 */
export const ViolationCodes = {
  // Path violations
  PATH_INVALID: {
    code: 'PATH_INVALID',
    severity: 'critical' as const,
    description: 'Path contains invalid characters or format',
    example: 'Invalid: "contains the JSX code...". Valid: "src/components/Button.tsx"',
    instruction: 'Provide a valid file path. Format: relative path from project root. Example: src/components/MyComponent.tsx',
  },
  
  PATH_DESCRIPTION: {
    code: 'PATH_DESCRIPTION',
    severity: 'critical' as const,
    description: 'Path is a description/sentence, not a file path',
    example: 'Invalid: "contains the JSX code for form". Valid: "src/components/LoginForm.tsx"',
    instruction: 'Replace the description with a real filename. Use format: src/components/ComponentName.tsx',
  },
  
  PATH_MULTIPLE: {
    code: 'PATH_MULTIPLE',
    severity: 'critical' as const,
    description: 'Multiple files in one step (violates One Step, One Effect)',
    example: 'Invalid: "Button.tsx, Input.tsx". Valid: Create separate steps for each file.',
    instruction: 'Each step must target exactly ONE file. If you need multiple files, create multiple steps.',
  },
  
  // Export violations
  EXPORT_MISSING: {
    code: 'EXPORT_MISSING',
    severity: 'error' as const,
    description: 'Code missing export default statement',
    example: 'Missing: export default ComponentName;',
    instruction: 'Add "export default ComponentName;" at the end of your code. The name must match your function/class.',
  },
  
  // Import violations
  IMPORT_UNUSED: {
    code: 'IMPORT_UNUSED',
    severity: 'warning' as const,
    description: 'Imported but never used',
    example: 'Remove: import { useForm } from "@hookform/resolvers/zod";',
    instruction: 'Remove unused imports. Keep only imports you actually use in the code.',
  },
  
  // Type violations
  TYPE_ANY: {
    code: 'TYPE_ANY',
    severity: 'error' as const,
    description: 'Code uses "any" type (forbidden)',
    example: 'Invalid: const data: any = ...; Valid: const data: unknown = ...;',
    instruction: 'Replace "any" with specific types or "unknown" with type guards.',
  },
  
  // Structure violations
  STRUCTURE_INCOMPLETE: {
    code: 'STRUCTURE_INCOMPLETE',
    severity: 'error' as const,
    description: 'Code structure incomplete or malformed',
    example: 'Missing brackets, incomplete function, etc.',
    instruction: 'Provide complete, compilable code. Include all brackets, proper indentation, complete functions.',
  },
};

/**
 * Helper to create a ValidationReport
 */
export function createValidationReport(
  success: boolean,
  summary: string,
  violations: ViolationCode[] = [],
  context?: ValidationReport['context']
): ValidationReport {
  return {
    validationId: `val-${Date.now()}`,
    timestamp: new Date(),
    success,
    violations,
    summary,
    context,
    instruction: violations.length > 0 ? violations[0].instruction : undefined,
  };
}

/**
 * Format ValidationReport for LLM consumption
 * (Goes into RetryContext for next prompt)
 */
export function formatValidationReportForLLM(report: ValidationReport): string {
  if (report.success) {
    return `✅ Validation successful: ${report.summary}`;
  }

  let message = `❌ VALIDATION FAILED\n\n`;
  message += `Summary: ${report.summary}\n\n`;

  for (const violation of report.violations) {
    message += `⚠️ [${violation.code}] (${violation.severity})\n`;
    message += `   ${violation.description}\n`;
    if (violation.example) {
      message += `   Example: ${violation.example}\n`;
    }
    message += `   Action: ${violation.instruction}\n\n`;
  }

  return message;
}
