/**
 * ValidatorProfiles.ts
 *
 * Universal constraint sets for code validation.
 * These profiles define rules based on CODE PATTERNS (selectors), not file paths.
 *
 * Philosophy:
 * - Each rule is self-contained with a selector (when to apply)
 * - Forbidden patterns that must NOT appear
 * - Required patterns that MUST appear
 * - Each rule carries its own message and context
 *
 * Example: A file containing 'export const Button' matches the COMPONENT_PROPS rule,
 * which then enforces TypeScript interfaces and className props.
 */

export interface ValidatorProfile {
  id: string;
  name: string;
  description: string;
  /**
   * Selector: Does this content fit the profile?
   * Returns true if the rule should be applied.
   * Example: content.includes('export const') && content.includes('React.FC')
   */
  selector: (content: string) => boolean;
  /**
   * Forbidden patterns that must NOT appear.
   * If any match, the rule is violated.
   */
  forbidden?: RegExp[];
  /**
   * Required patterns that MUST appear.
   * If any don't match, the rule is violated.
   */
  required?: RegExp[];
  /**
   * Suggestion: When a rule is violated, what should the user do?
   */
  message: string;
  /**
   * Error severity: 'error' (must fix) or 'warn' (should fix)
   */
  severity?: 'error' | 'warn';
  /**
   * Linter patterns to suppress when validating against this rule.
   * Prevents generic linter noise from interfering with architecture validation.
   */
  suppressLinterIds?: string[];
  /**
   * Pattern-Based Suppression (Danh's Architecture Fix #1):
   * If true, automatically suppress linter warnings for patterns matching this profile.
   * Example: When clsx() is detected, suppress ClassValue unused warnings.
   */
  patternBasedSuppression?: boolean;
}

/**
 * Universal Validator Rule Registry
 * These rules apply across the entire codebase based on content patterns.
 */
export const VALIDATOR_PROFILES: Record<string, ValidatorProfile> = {
  // ============================================================================
  // LOGIC LAYER RULES
  // ============================================================================

  LOGIC_NO_REACT: {
    id: 'logic_no_react',
    name: 'Logic Layer - No React Imports',
    description:
      'Files in logic layer (executor, planner, utils at root) must not import React',
    selector: (content: string) => {
      // Match files that are clearly logic-layer based on exports
      // Logic exports are functions, classes, enums, types (not components)
      return (
        (content.includes('export const') || content.includes('export class')) &&
        content.includes('export') &&
        !content.includes('<>') && // No JSX
        !content.includes('React.FC') &&
        !content.includes('function ') // No React functional components
      );
    },
    forbidden: [
      /import\s+.*\bReact\b/, // No React import
      /from\s+['"]react['"]/, // No react imports
    ],
    message: 'Logic layer must not import React. Move UI logic to components/',
    severity: 'error',
  },

  // ============================================================================
  // COMPONENT RULES
  // ============================================================================

  COMPONENT_PROPS: {
    id: 'component_props',
    name: 'Component Props - TypeScript Interfaces',
    description:
      'React components must define props with TypeScript interfaces (not Zod schemas)',
    selector: (content: string) => {
      // Match React functional components or FC types
      // BUT exclude infrastructure helpers (clsx, twMerge utilities)
      const isComponent =
        (content.includes('React.FC') ||
          content.includes('React.FC<') ||
          (content.includes('export const') && content.includes('function '))) &&
        content.includes('interface'); // They already define an interface

      const isInfrastructure = content.includes('clsx(') || content.includes('twMerge(') || content.includes('ClassValue');
      
      return isComponent && !isInfrastructure; // Only apply to actual React components
    },
    forbidden: [
      /const\s+\w+Props\s*=\s*z\.object/, // Zod schema for simple component props
      /z\.object\(\s*{[^}]*onClick[^}]*}\s*\)/, // Zod for onClick props
    ],
    required: [/interface\s+\w+Props/], // Must have Props interface
    message:
      'Components must define props with TypeScript interfaces. Reserve Zod for top-level form validation only.',
    severity: 'error',
  },

  COMPONENT_EXTENSIBILITY: {
    id: 'component_extensibility',
    name: 'Component Extensibility - className Props',
    description: 'Reusable components must accept className prop for style customization',
    selector: (content: string) => {
      // Match reusable component patterns
      // If it's a library component (Button, Card, Input, etc.)
      const isComponent =
        content.includes('React.FC') || content.includes('function ');
      const isLibComponent =
        isComponent &&
        (content.includes('Button') ||
          content.includes('Card') ||
          content.includes('Input') ||
          content.includes('Modal') ||
          content.includes('Dialog') ||
          content.includes('Badge') ||
          content.includes('Tag'));
      return isLibComponent;
    },
    required: [
      /className\s*\?:\s*string/, // Must accept className prop
      /(clsx|twMerge)\s*\(/, // Must use clsx or twMerge
    ],
    message:
      'Reusable components must: 1) Accept className?: string prop, 2) Use clsx or twMerge to merge styles',
    severity: 'error',
  },

  // ============================================================================
  // INFRASTRUCTURE & UTILITY RULES
  // ============================================================================

  INFRASTRUCTURE_HELPER: {
    id: 'infrastructure_helper',
    name: 'Infrastructure Helpers - Named Imports',
    description: 'Files using clsx/twMerge must use named imports (not default)',
    selector: (content: string) => {
      // Match files that use clsx() or twMerge()
      return content.includes('clsx(') || content.includes('twMerge(');
    },
    required: [
      /import\s*{[^}]*clsx[^}]*}\s*from\s*['"]clsx['"]/, // Named import from clsx
      /import\s*{[^}]*twMerge[^}]*}\s*from\s*['"]tailwind-merge['"]/, // Named import from tailwind-merge
    ],
    message:
      "Infrastructure helpers must use named imports: import { clsx } from 'clsx' and import { twMerge } from 'tailwind-merge'",
    severity: 'error',
    suppressLinterIds: [
      'unused-import-ClassValue',
      'zod-suggestion',
      'zod-schema-suggestion',
      'define-validation-schemas',
      'no-unused-vars-ClassValue',
      'no-any',
      'found-any-type',
    ],
    /**
     * Pattern-Based Suppression (Danh's Architecture Fix #1):
     * Automatically suppress ClassValue warnings when clsx/twMerge are detected.
     * This prevents generic linters from complaining about unused ClassValue type.
     */
    patternBasedSuppression: true,
  },

  /**
   * Danh's Architecture Fix #2: Named Export Enforcement
   * Ensures that if clsx is imported, it MUST be a named import
   * This prevents silent failures from default imports that don't work
   */
  INFRASTRUCTURE_NAMED_EXPORTS: {
    id: 'infrastructure_named_exports',
    name: 'Infrastructure - Enforce Named Exports',
    description:
      'Infrastructure libraries (clsx, twMerge) must be imported with named syntax, never default imports',
    selector: (content: string) => {
      // Match if trying to import from clsx or tailwind-merge
      return (
        content.includes("from 'clsx'") ||
        content.includes('from "clsx"') ||
        content.includes("from 'tailwind-merge'") ||
        content.includes('from "tailwind-merge"')
      );
    },
    forbidden: [
      /import\s+clsx\s+from\s+['"]clsx['"]/, // default: import clsx from 'clsx' ❌
      /import\s+twMerge\s+from\s+['"]tailwind-merge['"]/, // default: import twMerge ❌
      /import\s+\*\s+as\s+clsx\s+from\s+['"]clsx['"]/, // namespace: import * as clsx ❌
    ],
    required: [
      /import\s*{[^}]*clsx[^}]*}\s*from\s*['"]clsx['"]/, // named: import { clsx } ✅
      /import\s*{[^}]*twMerge[^}]*}\s*from\s*['"]tailwind-merge['"]/, // named: import { twMerge } ✅
    ],
    message:
      'Named exports REQUIRED for infrastructure helpers. Use: import { clsx } from "clsx", NOT: import clsx from "clsx"',
    severity: 'error',
  },

  // ============================================================================
  // FORM & VALIDATION RULES
  // ============================================================================

  FORM_VALIDATION: {
    id: 'form_validation',
    name: 'Form Validation - Zod for Forms Only',
    description: 'Top-level form components MAY use Zod for form data validation',
    selector: (content: string) => {
      // Match form-specific patterns
      return (
        (content.includes('Form') || content.includes('LoginForm') || content.includes('SignupForm')) &&
        content.includes('z.object')
      );
    },
    required: [
      /import\s*{[^}]*z[^}]*}\s*from\s*['"]zod['"]/, // Must import z from zod
    ],
    message: 'Form validation with Zod is allowed for top-level forms. Ensure form submission uses this schema.',
    severity: 'warn',
  },

  // ============================================================================
  // ACCESSIBILITY RULES
  // ============================================================================

  COMPONENT_ACCESSIBILITY: {
    id: 'component_accessibility',
    name: 'Interactive Components - Accessibility',
    description:
      'All interactive components (Button, Input, Link) must include accessibility attributes',
    selector: (content: string) => {
      // Match interactive component patterns
      return (
        (content.includes('Button') ||
          content.includes('Input') ||
          content.includes('Link') ||
          content.includes('Dialog') ||
          content.includes('Modal')) &&
        (content.includes('<button') ||
          content.includes('<input') ||
          content.includes('<a ') ||
          content.includes('role='))
      );
    },
    required: [
      /aria-label/, // Must have aria-label or aria-describedby
      /(type\s*=|disabled|aria-)/, // Standard HTML attributes
    ],
    message:
      'Interactive components must include: aria-label, type attribute, disabled prop, and proper semantic HTML',
    severity: 'error',
    suppressLinterIds: ['jsx-a11y/anchor-is-valid'],
  },

  // ============================================================================
  // TYPE SAFETY RULES
  // ============================================================================

  STRICT_TYPING: {
    id: 'strict_typing',
    name: 'Type Safety - No Any/Unknown',
    description: 'Exported functions/classes must not use "any" or "unknown" types',
    selector: (content: string) => {
      // Match files with exported code BUT exclude infrastructure helpers
      // Infrastructure (clsx, twMerge) are allowed to use unknown[] patterns
      const hasExports = content.includes('export') && (content.includes('const') || content.includes('function'));
      const isInfrastructure = content.includes('clsx(') || content.includes('twMerge(') || content.includes('ClassValue');
      return hasExports && !isInfrastructure; // Only apply to non-infrastructure code
    },
    forbidden: [
      /:\s*any\b/, // Explicit 'any' type
      /:\s*unknown\[\]/, // unknown array
      /as\s+any\b/, // Type assertion to any
    ],
    message:
      'Replace "any" and "unknown" with explicit interface types. Use generics if needed.',
    severity: 'error',
  },

  // ============================================================================
  // DEPENDENCY RULES
  // ============================================================================

  REACT_HOOKS_USAGE: {
    id: 'react_hooks_usage',
    name: 'React Hooks - Proper Calling Convention',
    description: 'React hooks must be called as functions (not stored as values)',
    selector: (content: string) => {
      // Match files that import React hooks
      return (
        (content.includes('useState') ||
          content.includes('useEffect') ||
          content.includes('useContext') ||
          content.includes('useReducer')) &&
        content.includes('React')
      );
    },
    forbidden: [
      /const\s+\w+\s*=\s*useState/, // Storing useState as value
      /const\s+\w+\s*=\s*useEffect/, // Storing useEffect
    ],
    required: [
      /useState\(\)/, // Must call as function
      /useEffect\(\)/, // Must call as function
    ],
    message:
      'React hooks must be called as functions: useState(), useEffect(), etc. Do not store them as values.',
    severity: 'error',
  },

  // ============================================================================
  // DAG & PLANNING RULES
  // ============================================================================

  PLAN_SEMANTICS: {
    id: 'plan_semantics',
    name: 'Plan Semantics - Step Dependencies',
    description: 'Steps in a plan must have explicit dependency declarations',
    selector: (content: string) => {
      // Match plan/task definitions
      return (
        content.includes('step_') &&
        (content.includes('dependencies') || content.includes('dependsOn'))
      );
    },
    required: [
      /step_\d+/, // Standard step ID format
      /dependencies\s*:\s*\[/, // Explicit dependency array
    ],
    message:
      'Plan steps must use step_N format and include explicit dependencies: ["step_0", "step_1"]',
    severity: 'error',
  },
};

/**
 * Get applicable profiles for a given code content
 * @param content Code to check
 * @returns Array of matching ValidatorProfiles
 */
export function getApplicableProfiles(content: string): ValidatorProfile[] {
  return Object.values(VALIDATOR_PROFILES).filter((profile) =>
    profile.selector(content)
  );
}

/**
 * Get all profile IDs (for reference)
 */
export function getAllProfileIds(): string[] {
  return Object.values(VALIDATOR_PROFILES).map((p) => p.id);
}

/**
 * Get a specific profile by ID
 */
export function getProfileById(id: string): ValidatorProfile | undefined {
  return Object.values(VALIDATOR_PROFILES).find((p) => p.id === id);
}
