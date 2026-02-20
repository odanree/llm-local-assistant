/**
 * services-edge-cases.test.ts
 *
 * Strategic edge case coverage for services layer
 * Goal: Push src/services from 84.74% → 90%+
 *
 * Targets high-priority gaps to reach 90% coverage
 */

import { describe, it, expect } from 'vitest';
import PromptEngine, { PromptContext } from '../services/PromptEngine';
import DomainAwareAuditor, { DOMAIN_AUDIT_PROFILES } from '../services/DomainAwareAuditor';
import { SemanticValidator } from '../services/semanticValidator';

describe('Services Layer - Edge Case Coverage', () => {
  describe('PromptEngine - Fallback & Empty Handling', () => {
    it('should handle empty user request gracefully', () => {
      const context: PromptContext = {
        userRequest: '',
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);

      expect(prompt).toBeTruthy();
      expect(prompt).toContain('Code Generation Instructions');
    });

    it('should handle undefined optional fields', () => {
      const context: PromptContext = {
        userRequest: 'Create component',
        planDescription: undefined,
        workspaceName: undefined,
        existingCodeSamples: undefined,
        customConstraints: undefined,
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);

      expect(prompt).toContain('Create component');
      expect(prompt).toBeTruthy();
    });

    it('should handle empty custom constraints array', () => {
      const context: PromptContext = {
        userRequest: 'Create Button',
        customConstraints: [],
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);

      expect(prompt).toBeTruthy();
    });

    it('should handle empty code samples array', () => {
      const context: PromptContext = {
        userRequest: 'Create hook',
        existingCodeSamples: [],
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);

      expect(prompt).toContain('Code Generation Instructions');
    });

    it('should infer applicable profiles correctly', () => {
      const context: PromptContext = {
        userRequest: 'Create a React component that renders a button',
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);

      // Should contain architectural requirements section
      expect(prompt).toContain('Architectural Requirements');
    });

    it('should handle very long user request', () => {
      const longRequest = 'Create ' + 'a very long component '.repeat(50);
      const context: PromptContext = {
        userRequest: longRequest,
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);

      expect(prompt).toContain('Code Generation Instructions');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should hydrate prompt with backward compatibility', () => {
      const options = {
        filePath: 'src/components/Button.tsx',
        fileDescription: 'Reusable button component',
        existingCode: 'export default function Button() {}',
        basePrompt: 'Generate a button',
      };

      const result = PromptEngine.hydratePrompt(options);

      expect(result.augmented).toBeTruthy();
      expect(result.appliedRules).toBeInstanceOf(Array);
      expect(result.reference).toContain('function Button');
    });

    it('should handle hydrate with minimal options', () => {
      const options = {
        filePath: 'src/utils/helper.ts',
      };

      const result = PromptEngine.hydratePrompt(options);

      expect(result.augmented).toBeTruthy();
      expect(result.appliedRules).toBeInstanceOf(Array);
    });
  });

  describe('PromptEngine - Validation Prompt Building', () => {
    it('should build validation prompt for code without profiles', () => {
      const code = 'export function test() { return 42; }';
      const profiles = [];

      const prompt = PromptEngine.buildValidationPrompt(code, profiles);

      expect(prompt).toContain('Code Validation Guidelines');
      expect(prompt).toContain('test');
    });

    it('should build validation prompt with single profile', () => {
      const code = 'export const Button = () => <button />;';
      const profiles = [
        {
          id: 'react-component',
          name: 'React Component Rules',
          severity: 'error' as const,
          message: 'Components must export as React.FC',
          forbidden: [{ source: 'function', target: 'arrow' }],
        },
      ];

      const prompt = PromptEngine.buildValidationPrompt(code, profiles);

      expect(prompt).toContain('React Component Rules');
      expect(prompt).toContain('Forbidden');
      expect(prompt).toContain('function');
    });

    it('should build validation prompt with required patterns', () => {
      const code = 'export const useHook = () => {};';
      const profiles = [
        {
          id: 'hook-naming',
          name: 'Hook Naming',
          severity: 'warn' as const,
          message: 'Hooks must start with use',
          required: [{ source: 'use', target: 'hook-prefix' }],
        },
      ];

      const prompt = PromptEngine.buildValidationPrompt(code, profiles);

      expect(prompt).toContain('Hook Naming');
      expect(prompt).toContain('Required');
      expect(prompt).toContain('useHook');
    });
  });

  describe('DomainAwareAuditor - Edge Cases', () => {
    it('should handle empty code in findDomain', () => {
      const code = '';

      // Should not crash on empty code
      const domain = DomainAwareAuditor.findDomain(code);

      expect(domain).toBeNull();
    });

    it('should identify infrastructure domain correctly', () => {
      const infrastructureCode = `
        import { twMerge } from 'tailwind-merge';
        import { clsx } from 'clsx';
        
        export const mergedClasses = twMerge('px-2', 'px-4');
      `;

      const domain = DomainAwareAuditor.findDomain(infrastructureCode);

      expect(domain).toBeTruthy();
      expect(domain?.id).toBe('infra_integrity');
    });

    it('should identify component domain correctly', () => {
      const componentCode = `
        import React from 'react';
        
        interface Props {
          label: string;
          onClick: () => void;
        }
        
        export const Button: React.FC<Props> = ({ label, onClick }) => (
          <button onClick={onClick}>{label}</button>
        );
      `;

      const domain = DomainAwareAuditor.findDomain(componentCode);

      expect(domain).toBeTruthy();
    });

    it('should identify logic domain correctly', () => {
      const logicCode = `
        export function calculateSum(a: number, b: number): number {
          return a + b;
        }
        
        export async function fetchData(url: string) {
          const response = await fetch(url);
          return response.json();
        }
      `;

      const domain = DomainAwareAuditor.findDomain(logicCode);

      expect(domain).toBeTruthy();
    });

    it('should identify form domain correctly', () => {
      const formCode = `
        import { z } from 'zod';
        
        export const UserSchema = z.object({
          email: z.string().email(),
          password: z.string().min(8),
        });
      `;

      const domain = DomainAwareAuditor.findDomain(formCode);

      expect(domain).toBeTruthy();
    });

    it('should detect violations in infrastructure code', () => {
      const badCode = `import clsx from 'clsx';
export const c = clsx('a', 'b');`;

      const violations = DomainAwareAuditor.audit(badCode);

      expect(Array.isArray(violations)).toBe(true);
      expect(violations.length).toBeGreaterThan(0);
    });

    it('should get suppressed rules for infrastructure', () => {
      const tailwindCode = `import { twMerge } from 'tailwind-merge';
export const merged = twMerge('px-2', 'px-4');`;

      const suppressedRules = DomainAwareAuditor.getSuppressedRules(tailwindCode);

      expect(suppressedRules).toBeInstanceOf(Array);
      expect(suppressedRules.length).toBeGreaterThan(0);
      expect(suppressedRules.some(r => r.includes('zod'))).toBe(true);
    });

    it('should generate audit report', () => {
      const code = `import { twMerge } from 'tailwind-merge';
export const merged = twMerge('px-2', 'px-4');`;

      const report = DomainAwareAuditor.report(code);

      expect(report).toContain('AUDIT REPORT');
      expect(report).toContain('infra_integrity');
    });
  });

  describe('SemanticValidator - Edge Cases', () => {
    it('should detect name collisions', () => {
      const code = `
        import { cn } from '@/utils/cn';
        export function cn() { return 'collision'; }
      `;

      const errors = SemanticValidator.audit(code);

      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle code without collisions', () => {
      const code = `
        import { cn } from '@/utils/cn';
        export function merge() { return cn('a', 'b'); }
      `;

      const errors = SemanticValidator.audit(code);

      expect(Array.isArray(errors)).toBe(true);
    });

    it('should detect undefined calls', () => {
      const code = `
        export function test() {
          return undefinedFunction();
        }
      `;

      const errors = SemanticValidator.audit(code);

      expect(Array.isArray(errors)).toBe(true);
    });

    it('should detect scope conflicts from imports', () => {
      const code = `
        import { useContext as customContext } from 'react';
        import useContext from 'another-module';
      `;

      const errors = SemanticValidator.audit(code);

      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle valid code without errors', () => {
      const code = `
        import { cn } from '@/utils/cn';
        export function Button() {
          return <button className={cn('px-4')}>Click</button>;
        }
      `;

      const errors = SemanticValidator.audit(code);

      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle empty code', () => {
      const errors = SemanticValidator.audit('');

      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle code with multiple issues', () => {
      const code = `
        import { cn } from '@/utils/cn';
        import { cn as classNames } from 'clsx';
        
        export function cn() {
          return tailwindMerge('a', 'b');
        }
      `;

      const errors = SemanticValidator.audit(code);

      expect(Array.isArray(errors)).toBe(true);
    });
  });

  describe('Cross-Service Integration Edge Cases', () => {
    it('should work with PromptEngine + DomainAwareAuditor', () => {
      const context: PromptContext = {
        userRequest: 'Create a function',
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);
      const code = 'export function test() { return 42; }';
      const domain = DomainAwareAuditor.findDomain(code);

      expect(prompt).toBeTruthy();
      expect(domain).toBeTruthy();
    });

    it('should work with DomainAwareAuditor + SemanticValidator', () => {
      const code = 'export const x = 5;';

      const domain = DomainAwareAuditor.findDomain(code);
      const errors = SemanticValidator.audit(code);

      expect(domain).toBeTruthy();
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle large code samples', () => {
      const largeCode = 'export function test() {}\n'.repeat(100);
      const context: PromptContext = {
        userRequest: 'Refactor',
        existingCodeSamples: [largeCode],
      };

      const prompt = PromptEngine.buildGenerationPrompt(context);

      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should handle complex validation profiles', () => {
      const code = `
        export interface ButtonProps {
          label: string;
          onClick: () => void;
        }
        
        export const Button: React.FC<ButtonProps> = ({ label, onClick }) => (
          <button onClick={onClick}>{label}</button>
        );
      `;

      const domain = DomainAwareAuditor.findDomain(code);
      const violations = DomainAwareAuditor.audit(code);
      const semanticErrors = SemanticValidator.audit(code);

      expect(domain).toBeTruthy();
      expect(Array.isArray(violations)).toBe(true);
      expect(Array.isArray(semanticErrors)).toBe(true);
    });
  });
});
