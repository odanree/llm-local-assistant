/**
 * Architecture Rules Validator
 * 
 * Enforces .lla-rules to ensure:
 * - Logic/UI separation (no React in business logic)
 * - Component prop typing (interfaces for props, Zod for forms only)
 * - Styling extensibility (className overrides)
 * - Accessibility standards (interactive elements)
 * - Pre-flight checks before plan generation
 */

export interface ArchitectureRuleViolation {
  rule: string;
  severity: 'error' | 'warning';
  location: string;
  description: string;
  fix: string;
}

export interface PreFlightCheckResult {
  taskType: 'component' | 'utility' | 'form' | 'logic' | 'unknown';
  applicableRules: string[];
  violations: ArchitectureRuleViolation[];
  deviations: string[]; // Justified rule exceptions
  approved: boolean;
  output: string; // Pre-flight check markdown output
}

/**
 * Validate that a component follows architecture rules
 */
export class ArchitectureValidator {
  /**
   * Pre-flight check: Validate task against applicable rules
   * MUST be called before generating any plan
   */
  preFlightCheck(
    taskDescription: string,
    taskType: 'component' | 'utility' | 'form' | 'logic'
  ): PreFlightCheckResult {
    const result: PreFlightCheckResult = {
      taskType,
      applicableRules: [],
      violations: [],
      deviations: [],
      approved: true,
      output: '',
    };

    // Determine applicable rules based on task type
    switch (taskType) {
      case 'component':
        result.applicableRules = [
          'Logic/UI Separation',
          'Component Props Typing',
          'Accessibility Standards',
          'Styling Extensibility',
        ];
        break;
      case 'form':
        result.applicableRules = [
          'Logic/UI Separation',
          'Component Props Typing (Zod allowed)',
          'Accessibility Standards',
          'Styling Extensibility',
        ];
        break;
      case 'utility':
        result.applicableRules = [
          'Logic/UI Separation',
          'Code Quality & Type Safety',
          'Testability',
        ];
        break;
      case 'logic':
        result.applicableRules = [
          'Logic/UI Separation',
          'Code Quality & Type Safety',
          'Testability',
        ];
        break;
    }

    // Generate pre-flight output
    result.output = this.generatePreFlightOutput(
      taskType,
      result.applicableRules,
      result.deviations
    );

    return result;
  }

  /**
   * Validate component props definition
   * Rule: Use interface/type, NOT Zod (except forms)
   */
  validateComponentProps(
    filePath: string,
    content: string,
    isForm: boolean = false
  ): ArchitectureRuleViolation[] {
    const violations: ArchitectureRuleViolation[] = [];

    // Check if file is a component
    if (!filePath.includes('src/components/')) {
      return violations; // Rule doesn't apply
    }

    // Check for unnecessary Zod usage
    if (content.includes('z.object({') && !isForm) {
      violations.push({
        rule: 'Component Props Typing',
        severity: 'error',
        location: filePath,
        description: 'UI components should use TypeScript interface/type for props, not Zod',
        fix: 'Replace Zod schema with TypeScript interface: interface ComponentProps { ... }',
      });
    }

    return violations;
  }

  /**
   * Validate styling extensibility
   * Rule: Components must accept className?: string
   */
  validateStylingExtensibility(
    filePath: string,
    content: string
  ): ArchitectureRuleViolation[] {
    const violations: ArchitectureRuleViolation[] = [];

    // Only check components
    if (!filePath.includes('src/components/')) {
      return violations;
    }

    // Check if component accepts className
    const hasClassNameProp = /className\s*\??:/g.test(content);
    const hasClsx = /clsx\s*\(|twMerge\s*\(/g.test(content);

    if (!hasClassNameProp) {
      violations.push({
        rule: 'Styling Extensibility',
        severity: 'warning',
        location: filePath,
        description: 'Reusable component should accept className?: string for style overrides',
        fix: 'Add className?: string to props interface and merge with clsx/twMerge',
      });
    }

    if (hasClassNameProp && !hasClsx) {
      violations.push({
        rule: 'Styling Extensibility',
        severity: 'warning',
        location: filePath,
        description: 'Component accepts className but does not merge styles using clsx/twMerge',
        fix: 'Use clsx or twMerge to safely merge default and custom classes',
      });
    }

    return violations;
  }

  /**
   * Validate accessibility standards
   * Rule: Interactive elements must have proper HTML attributes
   */
  validateAccessibility(
    filePath: string,
    content: string
  ): ArchitectureRuleViolation[] {
    const violations: ArchitectureRuleViolation[] = [];

    // Only check components
    if (!filePath.includes('src/components/')) {
      return violations;
    }

    // Check for interactive elements
    const interactivePatterns = [
      /<button/,
      /<input/,
      /<a /,
      /<select/,
      /<textarea/,
    ];

    const hasInteractive = interactivePatterns.some(p => p.test(content));

    if (!hasInteractive) {
      return violations; // No interactive elements
    }

    // Check for required attributes
    if (/<button/.test(content) && !/type\s*=/g.test(content)) {
      violations.push({
        rule: 'Accessibility Standards',
        severity: 'error',
        location: filePath,
        description: 'Button elements must have type attribute',
        fix: 'Add type="button" (or "submit"/"reset") to all <button> elements',
      });
    }

    if (
      (/<input/.test(content) || /<button/.test(content)) &&
      !/aria-label|aria-describedby/g.test(content)
    ) {
      violations.push({
        rule: 'Accessibility Standards',
        severity: 'warning',
        location: filePath,
        description: 'Interactive elements should have ARIA labels for screen readers',
        fix: 'Add aria-label or aria-describedby to inputs and buttons',
      });
    }

    return violations;
  }

  /**
   * Validate logic/UI separation
   * Rule: No React imports in src/utils, src/executor, etc.
   */
  validateLogicUISeparation(
    filePath: string,
    content: string
  ): ArchitectureRuleViolation[] {
    const violations: ArchitectureRuleViolation[] = [];

    // Check if file is in logic layer
    const isLogicFile =
      filePath.match(/src\/(utils|executor|planner|llmClient)/);

    if (!isLogicFile) {
      return violations; // Rule doesn't apply
    }

    // Check for React imports
    if (/import.*from\s+['"]react['"]/.test(content)) {
      violations.push({
        rule: 'Logic/UI Separation',
        severity: 'error',
        location: filePath,
        description: 'Logic layer files must not import React',
        fix: 'Move React-dependent code to src/components/',
      });
    }

    // Check for Tailwind classes (indicates UI code)
    if (/className\s*=\s*['"][^'"]*(?:p-|m-|text-|bg-)/g.test(content)) {
      violations.push({
        rule: 'Logic/UI Separation',
        severity: 'error',
        location: filePath,
        description: 'Logic layer files must not contain Tailwind styling',
        fix: 'Move UI rendering to src/components/',
      });
    }

    return violations;
  }

  /**
   * Generate pre-flight check markdown output
   */
  private generatePreFlightOutput(
    taskType: string,
    applicableRules: string[],
    deviations: string[]
  ): string {
    let output = `Pre-flight check: ${taskType} task\n`;
    output += `- Logic/UI separation? ${applicableRules.includes('Logic/UI Separation') ? 'Yes' : 'N/A'}\n`;
    output += `- Component prop typing? ${
      applicableRules.includes('Component Props Typing')
        ? 'interface/type'
        : applicableRules.includes('Component Props Typing (Zod allowed)')
          ? 'Zod allowed'
          : 'N/A'
    }\n`;
    output += `- Accessibility required? ${applicableRules.includes('Accessibility Standards') ? 'Yes' : 'N/A'}\n`;
    output += `- Styling extensibility? ${applicableRules.includes('Styling Extensibility') ? 'Yes' : 'N/A'}\n`;

    if (deviations.length > 0) {
      output += `\nDeviations:\n`;
      deviations.forEach(d => (output += `- ${d}\n`));
    } else {
      output += `\nDeviations: None\n`;
    }

    output += `\nPlan: ✅ Approved`;

    return output;
  }
}

// Export singleton instance
export const architectureValidator = new ArchitectureValidator();
