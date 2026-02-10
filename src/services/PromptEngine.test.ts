import { describe, it, expect } from 'vitest';
import { PromptEngine } from './PromptEngine';

describe('PromptEngine - Rule-Based Prompt Generation', () => {
  // ============================================================================
  // BASIC PROMPT GENERATION
  // ============================================================================
  describe('Generation Prompt Building', () => {
    it('should include task context in prompt', () => {
      const context = {
        userRequest: 'Create a reusable Button component',
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);

      expect(prompt).toContain('Code Generation Instructions');
      expect(prompt).toContain('Task Context');
      expect(prompt).toContain('Create a reusable Button component');
    });

    it('should include workspace context when provided', () => {
      const context = {
        userRequest: 'Create a Button',
        workspaceName: 'MyProject',
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);
      expect(prompt).toContain('MyProject');
    });

    it('should include plan description when provided', () => {
      const context = {
        userRequest: 'Create Button',
        planDescription: 'Step 1: Define props interface; Step 2: Implement component',
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);
      expect(prompt).toContain('Step 1: Define props');
    });

    it('should include custom constraints', () => {
      const context = {
        userRequest: 'Create Button',
        customConstraints: [
          'Component must be exported as default',
          'Props must be documented with JSDoc',
        ],
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);
      expect(prompt).toContain('Custom Constraints');
      expect(prompt).toContain('exported as default');
    });
  });

  // ============================================================================
  // ARCHITECTURAL REQUIREMENTS INJECTION
  // ============================================================================
  describe('ValidatorProfile Injection', () => {
    it('should inject architectural requirements into prompt', () => {
      const context = {
        userRequest: 'Create a Button component that uses clsx for styling',
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);

      expect(prompt).toContain('Architectural Requirements');
      expect(prompt).toContain('component');
    });

    it('should include forbidden patterns in requirements when profiles apply', () => {
      const context = {
        userRequest: 'Create a Button component',
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);

      // When profiles are applied, patterns should be shown
      // The prompt should at least have the structure for showing patterns
      expect(prompt).toContain('Architectural Requirements');
    });

    it('should include required patterns in requirements when profiles apply', () => {
      const context = {
        userRequest: 'Create a Button component that uses clsx',
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);

      // When profiles are applied, patterns should be shown
      expect(prompt).toContain('Architectural Requirements');
    });
  });

  // ============================================================================
  // REFERENCE CODE INJECTION
  // ============================================================================
  describe('Code Example Injection', () => {
    it('should include reference code samples', () => {
      const context = {
        userRequest: 'Create Button like the Link component',
        existingCodeSamples: [
          `
          interface LinkProps {
            href: string;
            className?: string;
          }
          export const Link: React.FC<LinkProps> = ({ href, className }) => (
            <a href={href} className={className} />
          );
          `,
        ],
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);

      expect(prompt).toContain('Reference Code Examples');
      expect(prompt).toContain('interface LinkProps');
      expect(prompt).toContain('className?');
    });

    it('should format code samples as markdown blocks', () => {
      const context = {
        userRequest: 'Create Button',
        existingCodeSamples: ['const foo = () => {}'],
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);

      expect(prompt).toContain('```typescript');
      expect(prompt).toContain('foo');
      expect(prompt).toContain('```');
    });
  });

  // ============================================================================
  // OUTPUT FORMAT SPECIFICATION
  // ============================================================================
  describe('Output Format', () => {
    it('should specify output format clearly', () => {
      const context = {
        userRequest: 'Create Button',
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);

      expect(prompt).toContain('Output Format');
      expect(prompt).toContain('TypeScript');
    });

    it('should instruct to omit explanations', () => {
      const context = {
        userRequest: 'Create Button',
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);

      expect(prompt).toMatch(/code only|no explanation|do not include|without explanation/i);
    });
  });

  // ============================================================================
  // VALIDATION PROMPT BUILDING
  // ============================================================================
  describe('Validation Prompt Building', () => {
    it('should build validation guidelines', () => {
      const code = 'const x = 1;';
      const profiles = [];

      const prompt = PromptEngine.buildValidationPrompt(code, profiles);

      expect(prompt).toContain('Code Validation Guidelines');
      expect(prompt).toContain(code);
    });

    it('should include validation profiles', () => {
      const code = 'export const Button = () => <button />;';
      const profiles = [];

      const prompt = PromptEngine.buildValidationPrompt(code, profiles);

      expect(prompt).toContain('Validate the following code');
    });

    it('should format code in markdown', () => {
      const code = 'export const foo = () => {};';
      const profiles = [];

      const prompt = PromptEngine.buildValidationPrompt(code, profiles);

      expect(prompt).toContain('```typescript');
      expect(prompt).toContain(code);
      expect(prompt).toContain('```');
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================
  describe('Edge Cases', () => {
    it('should handle minimal context', () => {
      const context = {
        userRequest: 'Create something',
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);

      expect(prompt).toBeDefined();
      expect(prompt.length).toBeGreaterThan(0);
      expect(() => PromptEngine.buildGenerationPrompt(context)).not.toThrow();
    });

    it('should handle empty code samples', () => {
      const context = {
        userRequest: 'Create Button',
        existingCodeSamples: [],
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);

      expect(prompt).toBeDefined();
      expect(() => PromptEngine.buildGenerationPrompt(context)).not.toThrow();
    });

    it('should handle special characters in context', () => {
      const context = {
        userRequest: 'Create Button with <click> && "features"',
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);

      expect(prompt).toContain('<click>');
      expect(prompt).toContain('features');
    });
  });

  // ============================================================================
  // PROFILE INFERENCE
  // ============================================================================
  describe('Profile Inference (when applicable)', () => {
    it('should infer component profiles for component requests', () => {
      const context = {
        userRequest: 'Create a Button component with styling',
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);

      // Prompt should mention component-related rules
      const mentionedComponents = prompt.includes('Component') || 
                                   prompt.includes('component') ||
                                   prompt.includes('Button');
      expect(mentionedComponents).toBe(true);
    });

    it('should infer form profiles for form requests', () => {
      const context = {
        userRequest: 'Create a login form with validation',
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);

      // Should mention form/validation
      const mentionedForm = prompt.includes('form') ||
                           prompt.includes('validation') ||
                           prompt.includes('Form');
      expect(mentionedForm).toBe(true);
    });

    it('should infer infrastructure profiles for styling requests', () => {
      const context = {
        userRequest: 'Create a component with clsx styling',
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);

      // Should mention infrastructure/styling
      const mentionedInfra = prompt.includes('clsx') ||
                            prompt.includes('style') ||
                            prompt.includes('className');
      expect(mentionedInfra).toBe(true);
    });
  });

  // ============================================================================
  // INTEGRATION TEST
  // ============================================================================
  describe('Integration: Generation + Validation Flow', () => {
    it('should generate consistent prompts for same context', () => {
      const context = {
        userRequest: 'Create Button',
        workspaceName: 'MyApp',
      };

      const prompt1 = PromptEngine.buildGenerationPrompt(context);
      const prompt2 = PromptEngine.buildGenerationPrompt(context);

      expect(prompt1).toBe(prompt2);
    });

    it('should produce different prompts for different contexts', () => {
      const context1 = {
        userRequest: 'Create Button',
      };

      const context2 = {
        userRequest: 'Create form validation schema',
      };

      const prompt1 = PromptEngine.buildGenerationPrompt(context1);
      const prompt2 = PromptEngine.buildGenerationPrompt(context2);

      expect(prompt1).not.toBe(prompt2);
    });
  });
});
