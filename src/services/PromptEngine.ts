/**
 * PromptEngine.ts
 *
 * Injects ValidatorProfile constraints into generation prompts.
 *
 * Philosophy (from Danh's "plan-content decoupling"):
 * 1. Planner decides what needs to be created (WRITE action)
 * 2. Planner identifies which ValidatorProfiles should apply
 * 3. PromptEngine injects these profiles as REQUIREMENTS into the prompt
 * 4. LLM sees the requirements and generates compliant code
 * 5. Validator uses the SAME rules to check the generated code
 * 6. Sync is maintained: same rules everywhere
 *
 * This is the "Secret Sauce" - the bridge between planning and validation.
 */

import { ValidatorProfile, getApplicableProfiles } from './ValidatorProfiles';

export interface PromptContext {
  /**
   * What does the user want to build?
   */
  userRequest: string;

  /**
   * What's the broader task/plan context?
   */
  planDescription?: string;

  /**
   * Which workspace/project is this for?
   */
  workspaceName?: string;

  /**
   * What code patterns should guide generation?
   */
  existingCodeSamples?: string[];

  /**
   * Any custom constraints beyond the profiles?
   */
  customConstraints?: string[];
}

/**
 * Legacy interface for backward compatibility
 */
export interface HydratePromptOptions {
  filePath: string;
  fileDescription?: string;
  existingCode?: string;
  basePrompt?: string;
  [key: string]: any;
}

/**
 * Hydrated prompt result (legacy return format)
 */
export interface HydratedPromptResult {
  augmented: string;
  appliedRules: string[];
  reference?: string;
}

export class PromptEngine {
  /**
   * Legacy method for backward compatibility
   * Maps old-style HydratePromptOptions to new PromptContext
   */
  static hydratePrompt(options: HydratePromptOptions): HydratedPromptResult {
    const context: PromptContext = {
      userRequest: options.fileDescription || `Generate code for: ${options.filePath}`,
      existingCodeSamples: options.existingCode ? [options.existingCode] : undefined,
      customConstraints: [],
    };

    const prompt = this.buildGenerationPrompt(context);
    const applicableProfiles = this.inferApplicableProfiles(context);
    const appliedRuleIds = applicableProfiles.map((p) => p.id);

    return {
      augmented: options.basePrompt ? `${options.basePrompt}\n\n${prompt}` : prompt,
      appliedRules: appliedRuleIds,
      reference: options.existingCode,
    };
  }

  /**
   * Build a generation prompt with injected ValidatorProfile requirements
   */
  static buildGenerationPrompt(context: PromptContext): string {
    const lines: string[] = [];

    // ========================================================================
    // SYSTEM INSTRUCTIONS
    // ========================================================================
    lines.push('# Code Generation Instructions');
    lines.push('');
    lines.push('You are a code generation agent. Generate code that is:');
    lines.push('- Architecturally sound');
    lines.push('- Type-safe (TypeScript)');
    lines.push('- Accessible (for UI components)');
    lines.push('- Testable (pure functions, no side effects)');
    lines.push('');

    // ========================================================================
    // TASK CONTEXT
    // ========================================================================
    lines.push('## Task Context');
    lines.push(`User Request: ${context.userRequest}`);
    if (context.planDescription) {
      lines.push(`Plan: ${context.planDescription}`);
    }
    if (context.workspaceName) {
      lines.push(`Target Workspace: ${context.workspaceName}`);
    }
    lines.push('');

    // ========================================================================
    // ARCHITECTURAL REQUIREMENTS (from ValidatorProfiles)
    // ========================================================================
    lines.push('## Architectural Requirements');
    lines.push('');
    lines.push(
      'Generate code that matches these universal constraints:'
    );
    lines.push('');

    // Determine which profiles apply based on context
    const applicableProfiles = this.inferApplicableProfiles(context);

    if (applicableProfiles.length > 0) {
      applicableProfiles.forEach((profile, idx) => {
        lines.push(
          `### Requirement ${idx + 1}: ${profile.name}`
        );
        lines.push(`ID: ${profile.id}`);
        lines.push(`Description: ${profile.description}`);
        lines.push('');

        // Forbidden patterns
        if (profile.forbidden && profile.forbidden.length > 0) {
          lines.push('**FORBIDDEN patterns (must NOT appear):**');
          profile.forbidden.forEach((pattern) => {
            lines.push(`- ${pattern.source}`);
          });
          lines.push('');
        }

        // Required patterns
        if (profile.required && profile.required.length > 0) {
          lines.push('**REQUIRED patterns (must appear):**');
          profile.required.forEach((pattern) => {
            lines.push(`- ${pattern.source}`);
          });
          lines.push('');
        }

        // Message/guidance
        lines.push(`Message: ${profile.message}`);
        lines.push('');
      });
    } else {
      lines.push('(No specific architecture profiles apply to this task)');
      lines.push('');
    }

    // ========================================================================
    // CUSTOM CONSTRAINTS
    // ========================================================================
    if (context.customConstraints && context.customConstraints.length > 0) {
      lines.push('## Custom Constraints');
      context.customConstraints.forEach((constraint) => {
        lines.push(`- ${constraint}`);
      });
      lines.push('');
    }

    // ========================================================================
    // CODE EXAMPLES
    // ========================================================================
    if (context.existingCodeSamples && context.existingCodeSamples.length > 0) {
      lines.push('## Reference Code Examples');
      lines.push('');
      context.existingCodeSamples.forEach((sample, idx) => {
        lines.push(`### Example ${idx + 1}`);
        lines.push('```typescript');
        lines.push(sample);
        lines.push('```');
        lines.push('');
      });
    }

    // ========================================================================
    // OUTPUT FORMAT
    // ========================================================================
    lines.push('## Output Format');
    lines.push('');
    lines.push('Generate ONLY the code. Do NOT include explanations.');
    lines.push('Output must be valid TypeScript/JSX.');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Infer which ValidatorProfiles apply based on context
   *
   * This is heuristic-based; in real usage, the Planner would explicitly
   * list which profiles apply for a given task.
   */
  private static inferApplicableProfiles(
    context: PromptContext
  ): ValidatorProfile[] {
    const profiles: ValidatorProfile[] = [];

    // Check keywords in userRequest
    const request = context.userRequest.toLowerCase();

    // Component-related tasks?
    if (request.includes('button') || request.includes('input') || request.includes('component')) {
      // Component rules apply
      const semVals = getApplicableProfiles('React.FC<Props>');
      profiles.push(...semVals);
    }

    // Form-related tasks?
    if (request.includes('form') || request.includes('validation')) {
      const semVals = getApplicableProfiles('z.object({ name: z.string() })');
      profiles.push(...semVals);
    }

    // Infrastructure helpers?
    if (request.includes('clsx') || request.includes('twmerge') || request.includes('style')) {
      const semVals = getApplicableProfiles('clsx()');
      profiles.push(...semVals);
    }

    // Deduplicate by profile ID
    const seen = new Set<string>();
    return profiles.filter((p) => {
      if (seen.has(p.id)) {
        return false;
      }
      seen.add(p.id);
      return true;
    });
  }

  /**
   * Build a validation prompt - what should code look like?
   * (For use during validation/post-generation)
   */
  static buildValidationPrompt(code: string, profiles: ValidatorProfile[]): string {
    const lines: string[] = [];

    lines.push('# Code Validation Guidelines');
    lines.push('');
    lines.push('Validate the following code against these profiles:');
    lines.push('');

    profiles.forEach((profile) => {
      lines.push(`## ${profile.name}`);
      lines.push(`ID: ${profile.id}`);
      lines.push(`Severity: ${profile.severity || 'error'}`);
      lines.push('');

      if (profile.forbidden) {
        lines.push('Forbidden:');
        profile.forbidden.forEach((p) => lines.push(`  - ${p.source}`));
        lines.push('');
      }

      if (profile.required) {
        lines.push('Required:');
        profile.required.forEach((p) => lines.push(`  - ${p.source}`));
        lines.push('');
      }

      lines.push(`Guidance: ${profile.message}`);
      lines.push('');
    });

    lines.push('---');
    lines.push('Code to validate:');
    lines.push('```typescript');
    lines.push(code);
    lines.push('```');

    return lines.join('\n');
  }
}

export default PromptEngine;
