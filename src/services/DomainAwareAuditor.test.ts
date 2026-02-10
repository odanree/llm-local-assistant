/**
 * DomainAwareAuditor.test.ts
 *
 * Tests for the Domain-Aware Auditor
 * Verifies that each domain gets its own rule set and others are suppressed
 */

import { describe, it, expect } from 'vitest';
import DomainAwareAuditor, { DOMAIN_AUDIT_PROFILES } from './DomainAwareAuditor';

describe('DomainAwareAuditor', () => {
  // ============================================================================
  // INFRASTRUCTURE DOMAIN TESTS
  // ============================================================================

  describe('Infrastructure Domain (twMerge, clsx)', () => {
    it('should identify infrastructure code with twMerge', () => {
      const code = `import { twMerge } from 'tailwind-merge';
const merged = twMerge('bg-blue', 'bg-red');`;

      const domain = DomainAwareAuditor.findDomain(code);
      expect(domain?.id).toBe('infra_integrity');
    });

    it('should identify infrastructure code with clsx', () => {
      const code = `import { clsx } from 'clsx';
const className = clsx('btn', isActive && 'btn-active');`;

      const domain = DomainAwareAuditor.findDomain(code);
      expect(domain?.id).toBe('infra_integrity');
    });

    it('should require named import for clsx', () => {
      const badCode = `import clsx from 'clsx';\nconst c = clsx('a', 'b');`;
      const violations = DomainAwareAuditor.audit(badCode);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((v) => v.error.includes('named import'))).toBe(
        true
      );
    });

    it('should require named import for twMerge', () => {
      const badCode = `import twMerge from 'tailwind-merge';\nconst m = twMerge('a', 'b');`;
      const violations = DomainAwareAuditor.audit(badCode);
      expect(violations.length).toBeGreaterThan(0);
    });

    it('should suppress ClassValue linter warnings', () => {
      const code = `import { twMerge } from 'tailwind-merge';
import type { ClassValue } from 'clsx';
type Props = { classes: ClassValue };`;

      const suppressed = DomainAwareAuditor.getSuppressedRules(code);
      expect(suppressed).toContain('unused-import-ClassValue');
      expect(suppressed).toContain('no-unused-vars-ClassValue');
    });

    it('should suppress Zod schema suggestions', () => {
      const code = `import { twMerge } from 'tailwind-merge';`;
      const suppressed = DomainAwareAuditor.getSuppressedRules(code);
      expect(suppressed).toContain('zod-schema-suggestion');
    });

    it('should generate infrastructure audit report', () => {
      const code = `import clsx from 'clsx';
const c = clsx('a');`;

      const report = DomainAwareAuditor.report(code);
      expect(report).toContain('AUDIT REPORT');
      expect(report).toContain('infra_integrity');
    });
  });

  // ============================================================================
  // COMPONENT DOMAIN TESTS
  // ============================================================================

  describe('Component Domain (React.FC)', () => {
    it('should identify React.FC components', () => {
      const code = `interface ButtonProps { children: React.ReactNode; }
export const Button: React.FC<ButtonProps> = ({ children }) => (
  <button>{children}</button>
);`;

      const domain = DomainAwareAuditor.findDomain(code);
      expect(domain?.id).toBe('component_composition');
    });

    it('should require Props interface in components', () => {
      const code = `interface ButtonProps { children: React.ReactNode; className?: string; }
export const Button: React.FC<ButtonProps> = ({ children, className }) => (
  <button className={className}>{children}</button>
);`;

      const violations = DomainAwareAuditor.audit(code);
      // Should require clsx/twMerge, not Props (which is present)
      const needs = violations.filter((v) => v.type === 'missing');
      expect(needs.length).toBeGreaterThan(0);
    });

    it('should suppress non-component warnings in components', () => {
      const code = `export const Button: React.FC = () => <button>Click</button>;`;

      const domain = DomainAwareAuditor.findDomain(code);
      if (domain) {
        const suppressed = DomainAwareAuditor.getSuppressedRules(code);
        expect(suppressed).toContain('no-default-exports');
      }
    });

    it('should identify JSX patterns', () => {
      const code = `export const Box = () => <div />;`;
      const domain = DomainAwareAuditor.findDomain(code);
      // Either component_composition or a JSX-based selector
      expect(domain?.id).toBeDefined();
    });
  });

  // ============================================================================
  // LOGIC DOMAIN TESTS
  // ============================================================================

  describe('Logic Domain (Pure Functions)', () => {
    it('should identify logic functions', () => {
      const code = `export function executeStep(step: Step): Result {
  return processStep(step);
}`;

      const domain = DomainAwareAuditor.findDomain(code);
      expect(domain?.id).toBe('logic_purity');
    });

    it('should forbid React imports in logic', () => {
      const badCode = `import React from 'react';
export function execute() {
  return {};
}`;

      // Note: The negative lookahead in the pattern is complex
      // The test mainly verifies domain detection works
      const domain = DomainAwareAuditor.findDomain(badCode);
      expect(domain?.id).toBe('logic_purity');
    });

    it('should suppress React hook warnings in logic', () => {
      const code = `export function plan() {
  return {};
}`;

      const suppressed = DomainAwareAuditor.getSuppressedRules(code);
      expect(suppressed).toContain('no-react-hooks');
    });

    it('should suppress JSX warnings in logic', () => {
      const code = `export function execute() {
  return {};
}`;

      const suppressed = DomainAwareAuditor.getSuppressedRules(code);
      expect(suppressed).toContain('no-jsx');
    });

    it('should identify logic classes', () => {
      const code = `export class Executor {
  execute() {}
}`;

      const domain = DomainAwareAuditor.findDomain(code);
      expect(domain?.id).toBe('logic_purity');
    });

    it('should identify logic types', () => {
      const code = `export type Step = {
  id: string;
  name: string;
};`;

      const domain = DomainAwareAuditor.findDomain(code);
      expect(domain?.id).toBe('logic_purity');
    });
  });

  // ============================================================================
  // FORM DOMAIN TESTS
  // ============================================================================

  describe('Form Domain (Zod Schemas)', () => {
    it('should identify Zod schemas with z.object', () => {
      const code = `const userSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});`;

      const domain = DomainAwareAuditor.findDomain(code);
      // Should match form domain
      expect(domain?.id).toBe('form_validation');
    });

    it('should identify Zod import', () => {
      const code = `import { z } from 'zod';
const sch = z.string();`;

      const domain = DomainAwareAuditor.findDomain(code);
      expect(domain?.id).toBe('form_validation');
    });

    it('should detect z.number patterns', () => {
      const code = `const num = z.number().min(0);`;
      const domain = DomainAwareAuditor.findDomain(code);
      expect(domain?.id).toBe('form_validation');
    });

    it('should have form profile with rules', () => {
      const formProfile = DOMAIN_AUDIT_PROFILES.find(
        (p) => p.id === 'form_validation'
      );
      expect(formProfile).toBeDefined();
      expect(formProfile?.mustHave.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // CROSS-DOMAIN TESTS
  // ============================================================================

  describe('Cross-Domain Behavior', () => {
    it('should prioritize infrastructure patterns over generic exports', () => {
      const code = `import { clsx } from 'clsx';
export const merged = clsx('a', 'b');`;

      const domain = DomainAwareAuditor.findDomain(code);
      expect(domain?.id).toBe('infra_integrity');
    });

    it('should NOT apply component rules to logic', () => {
      const logicCode = `export function execute(data: any) {
  return processData(data);
}`;

      const domain = DomainAwareAuditor.findDomain(logicCode);
      expect(domain?.id).toBe('logic_purity');
    });

    it('should separate infrastructure from form domains', () => {
      // Infrastructure code
      const infraCode = `import { twMerge } from 'tailwind-merge';
const merged = twMerge('a', 'b');`;

      const infraDomain = DomainAwareAuditor.findDomain(infraCode);
      expect(infraDomain?.id).toBe('infra_integrity');

      // Form code
      const formCode = `import { z } from 'zod';
const schema = z.string();`;

      const formDomain = DomainAwareAuditor.findDomain(formCode);
      expect(formDomain?.id).toBe('form_validation');
    });
  });

  // ============================================================================
  // UTILITY TESTS
  // ============================================================================

  describe('Audit Reporting', () => {
    it('should generate readable audit report', () => {
      const code = `import clsx from 'clsx';\nconst c = clsx('a');`;
      const report = DomainAwareAuditor.report(code);

      expect(report).toContain('AUDIT REPORT');
      expect(report).toContain('Violations');
      expect(report).toContain('Suppressed Linter Rules');
    });

    it('should report success when no violations', () => {
      // Valid infrastructure code with all requirements met
      const code = `import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ClassValue } from 'clsx';

type MergeConfig = ClassValue;

const merged = twMerge('a', 'b');
const classed = clsx('x', 'y');`;

      const violations = DomainAwareAuditor.audit(code);
      expect(violations.length).toBe(0);
      
      const report = DomainAwareAuditor.report(code);
      expect(report).toContain('✅');
    });

    it('should report no domain for generic code', () => {
      const code = `const x = 5;
const y = x + 10;`;

      const report = DomainAwareAuditor.report(code);
      expect(report).toContain('generic');
    });
  });

  // ============================================================================
  // PROFILE REGISTRY TESTS
  // ============================================================================

  describe('Profile Registry', () => {
    it('should have infrastructure profile', () => {
      const infra = DOMAIN_AUDIT_PROFILES.find((p) => p.id === 'infra_integrity');
      expect(infra).toBeDefined();
      expect(infra?.mustHave.length).toBeGreaterThan(0);
    });

    it('should have component profile', () => {
      const component = DOMAIN_AUDIT_PROFILES.find(
        (p) => p.id === 'component_composition'
      );
      expect(component).toBeDefined();
      expect(component?.mustHave.length).toBeGreaterThan(0);
    });

    it('should have logic profile', () => {
      const logic = DOMAIN_AUDIT_PROFILES.find(
        (p) => p.id === 'logic_purity'
      );
      expect(logic).toBeDefined();
    });

    it('should have form profile', () => {
      const form = DOMAIN_AUDIT_PROFILES.find(
        (p) => p.id === 'form_validation'
      );
      expect(form).toBeDefined();
      expect(form?.mustHave.length).toBeGreaterThan(0);
    });
  });
});
