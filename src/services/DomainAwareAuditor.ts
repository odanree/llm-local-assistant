/**
 * DomainAwareAuditor.ts
 *
 * The "Domain-Aware Auditor" - Fixes the Linter Paradox
 *
 * PROBLEM: Validator enforces strict linter rules, LLM must break code to comply
 * SOLUTION: Rules are domain-specific, not one-size-fits-all
 *
 * Domains:
 * 1. INFRASTRUCTURE - Tailwind/CSS merging code (needs ClassValue, twMerge)
 * 2. COMPONENTS - React UI elements (needs props, types, accessibility)
 * 3. LOGIC - Executors, planners, utilities (no React, pure functions)
 * 4. FORMS - Validation schemas (Zod only)
 *
 * Key Insight: Each domain has different rules.
 * Infrastructure files should NOT be bullied by component rules.
 * Logic files should NOT be bullied by React hook rules.
 */

export interface AuditorConstraint {
  /** Pattern that must exist in code */
  pattern: RegExp;
  /** Error message if missing */
  error: string;
}

export interface AuditorProfile {
  /** Unique identifier for this audit domain */
  id: string;
  /** Human-readable name */
  description: string;
  /** When does this profile apply? (pattern matching on code) */
  selector: (code: string) => boolean;
  /** Patterns that MUST exist (hard requirements) */
  mustHave: AuditorConstraint[];
  /** Linter rules to SUPPRESS in this domain (allows exceptions) */
  suppress: string[];
  /** Patterns that MUST NOT exist (hard forbidden) */
  forbidden?: AuditorConstraint[];
  /** Severity: 'error' (block) or 'warn' (advisory) */
  severity?: 'error' | 'warn';
}

/**
 * Domain-Aware Validation Rules
 * These rules protect each domain from being bullied by the others
 * 
 * ORDER MATTERS: More specific patterns should come first!
 * 1. INFRASTRUCTURE (twMerge, clsx patterns)
 * 2. FORM (Zod patterns)
 * 3. COMPONENT (React patterns)
 * 4. LOGIC (generic exports)
 */
export const DOMAIN_AUDIT_PROFILES: AuditorProfile[] = [
  // ============================================================================
  // INFRASTRUCTURE DOMAIN - Tailwind/CSS Merging Code
  // ============================================================================
  // PROTECTED: ClassValue unused warnings are NOT allowed here
  // PROTECTED: This domain needs twMerge and clsx to work properly
  // RULE: If you detect twMerge/clsx, you're in infrastructure → use protected profile
  // ============================================================================

  {
    id: 'infra_integrity',
    description: 'Protects tailwind merging infrastructure (twMerge, clsx)',
    selector: (code: string) => /twMerge|clsx|ClassValue/.test(code),
    severity: 'error',
    // MUST HAVES: Infrastructure requires these patterns
    mustHave: [
      {
        pattern: /import\s*{[^}]*clsx[^}]*}\s*from\s*['"]clsx['"]/,
        error: "Infrastructure must use named import: import { clsx } from 'clsx'",
      },
      {
        pattern:
          /import\s*{[^}]*twMerge[^}]*}\s*from\s*['"]tailwind-merge['"]/,
        error:
          "Infrastructure must use named import: import { twMerge } from 'tailwind-merge'",
      },
      {
        pattern: /type\s+\w+\s*=\s*ClassValue|ClassValue\[\]/,
        error: 'Infrastructure must use ClassValue type for proper typing',
      },
    ],
    // SUPPRESS: These rules do NOT apply in infrastructure domain
    suppress: [
      'unused-import-ClassValue', // ClassValue IS used, trust us
      'zod-schema-suggestion', // Infrastructure doesn't use Zod
      'no-unused-vars-ClassValue', // Needed for type safety
    ],
  },

  // ============================================================================
  // COMPONENT DOMAIN - React UI Elements
  // ============================================================================
  // PROTECTED: Components need props interfaces and extensibility
  // PROTECTED: className prop is REQUIRED for styling
  // RULE: If you detect React.FC or export function with return, you're a component
  // ============================================================================

  {
    id: 'component_composition',
    description: 'Enforces React Component standards (props, types, extensibility)',
    selector: (code: string) => {
      // Match if it's a React component (exports something that returns JSX)
      return code.includes('React.FC') || (code.includes('<') && code.includes('/>'));
    },
    severity: 'error',
    mustHave: [
      {
        pattern: /interface\s+\w+Props/,
        error: 'Components must define a Props interface for type safety',
      },
      {
        pattern: /className\s*[?:]|className\s*=/,
        error: 'Components must accept optional className prop for styling',
      },
      {
        pattern:
          /import\s*{[^}]*clsx[^}]*}\s*from\s*['"]clsx['"]|import\s*{[^}]*twMerge[^}]*}\s*from\s*['"]tailwind-merge['"]/,
        error:
          'Components should use clsx or twMerge for conditional styles',
      },
    ],
    // SUPPRESS: These rules do NOT apply in component domain
    suppress: [
      'unused-import-ClassValue', // Not used in components
      'no-default-exports', // Components often use default exports
      'function-complexity', // Components can be complex
    ],
  },

  // ============================================================================
  // LOGIC DOMAIN - Executors, Planners, Utilities
  // ============================================================================
  // PROTECTED: Logic layer should NOT import React
  // PROTECTED: Pure functions, no side effects
  // RULE: If exports are functions/classes/types (no JSX), you're logic
  // ============================================================================

  {
    id: 'logic_purity',
    description: 'Enforces pure function standards for logic layer',
    selector: (code: string) =>
      /export\s+(const|function|class|type|interface)\s+\w+/.test(code) &&
      !code.includes('<'), // No JSX
    severity: 'error',
    mustHave: [],
    // SUPPRESS: These rules do NOT apply in logic domain
    suppress: [
      'no-react-hooks', // Not a component, no hooks here
      'no-jsx', // Not a component, no JSX
      'react-in-jsx-scope', // Logic doesn't need React in scope
    ],
  },

  // ============================================================================
  // FORM DOMAIN - Zod Validation Schemas
  // ============================================================================
  // PROTECTED: Forms use Zod only, no mixed validation
  // RULE: If you detect z.object or Zod schema, you're a form
  // ============================================================================

  {
    id: 'form_validation',
    description: 'Ensures form validation uses Zod exclusively',
    selector: (code: string) => {
      // More specific: must have z.something patterns AND (import z or z.object)
      return /z\.(object|string|number|boolean|array|lazy)|\bfrom\s+['"]zod['"]/.test(code);
    },
    severity: 'warn',
    mustHave: [
      {
        pattern: /import\s*{\s*z\s*}\s*from\s*['"]zod['"]/,
        error: 'Form validation must import Zod: import { z } from "zod"',
      },
    ],
    forbidden: [
      {
        pattern: /import.*Joi|import.*yup|import.*validator/,
        error:
          'Form domain must use Zod exclusively, no other validation libraries',
      },
    ],
    suppress: [
      'schema-complexity', // Schemas can be complex
      'no-const-assign', // Zod allows chaining
    ],
  },
];

/**
 * Domain-Aware Audit Engine
 * Finds which domain a file belongs to, then applies ONLY that domain's rules
 */
export class DomainAwareAuditor {
  /**
   * Find the primary domain this code belongs to
   */
  static findDomain(code: string): AuditorProfile | null {
    // Find the FIRST matching profile (most specific match)
    // Order matters: infrastructure before components
    for (const profile of DOMAIN_AUDIT_PROFILES) {
      if (profile.selector(code)) {
        return profile;
      }
    }
    return null;
  }

  /**
   * Audit code within its domain context
   * Returns violations ONLY for rules that apply to this domain
   */
  static audit(
    code: string
  ): Array<{
    domain: string;
    type: 'missing' | 'forbidden';
    error: string;
    severity: 'error' | 'warn';
  }> {
    const domain = this.findDomain(code);
    if (!domain) {
      return []; // Code doesn't match any domain (might be generic utility)
    }

    const violations: Array<{
      domain: string;
      type: 'missing' | 'forbidden';
      error: string;
      severity: 'error' | 'warn';
    }> = [];

    // Check MUST HAVES
    domain.mustHave.forEach((constraint) => {
      if (!constraint.pattern.test(code)) {
        violations.push({
          domain: domain.id,
          type: 'missing',
          error: constraint.error,
          severity: domain.severity || 'error',
        });
      }
    });

    // Check FORBIDDEN
    if (domain.forbidden) {
      domain.forbidden.forEach((constraint) => {
        if (constraint.pattern.test(code)) {
          violations.push({
            domain: domain.id,
            type: 'forbidden',
            error: constraint.error,
            severity: domain.severity || 'error',
          });
        }
      });
    }

    return violations;
  }

  /**
   * Get the linter rules that should be SUPPRESSED for this domain
   */
  static getSuppressedRules(code: string): string[] {
    const domain = this.findDomain(code);
    return domain ? domain.suppress : [];
  }

  /**
   * Human-readable audit report
   */
  static report(code: string): string {
    const domain = this.findDomain(code);
    if (!domain) {
      return '✅ Code is generic (no specific domain rules apply)';
    }

    const violations = this.audit(code);
    if (violations.length === 0) {
      return `✅ ${domain.description} - All rules satisfied`;
    }

    const lines = [
      `📋 AUDIT REPORT: ${domain.description}`,
      `🔍 Domain: ${domain.id}`,
      `⚠️  Violations: ${violations.length}`,
      '',
    ];

    violations.forEach((v, i) => {
      lines.push(`${i + 1}. [${v.type.toUpperCase()}] ${v.error}`);
    });

    lines.push('');
    lines.push(`🚫 Suppressed Linter Rules: ${domain.suppress.join(', ')}`);

    return lines.join('\n');
  }
}

export default DomainAwareAuditor;
