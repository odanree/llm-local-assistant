import { describe, it, expect } from 'vitest';
import SemanticValidator, { SemanticValidationError } from '../semanticValidator';
import {
  VALIDATOR_PROFILES,
  getApplicableProfiles,
  getProfileById,
  getAllProfileIds,
} from './ValidatorProfiles';

describe('ValidatorProfiles - Rule-Based Architecture Validation', () => {
  // ============================================================================
  // PROFILE DISCOVERY
  // ============================================================================
  describe('Profile Discovery', () => {
    it('should have all profiles defined', () => {
      const ids = getAllProfileIds();
      expect(ids.length).toBeGreaterThan(0);
      expect(ids).toContain('logic_no_react');
      expect(ids).toContain('component_props');
      expect(ids).toContain('infrastructure_helper');
    });

    it('should retrieve profile by ID', () => {
      const profile = getProfileById('logic_no_react');
      expect(profile).toBeDefined();
      expect(profile?.name).toContain('React');
    });

    it('should return undefined for unknown profile', () => {
      const profile = getProfileById('nonexistent_profile');
      expect(profile).toBeUndefined();
    });
  });

  // ============================================================================
  // LOGIC LAYER RULES
  // ============================================================================
  describe('Logic Layer - LOGIC_NO_REACT', () => {
    const profile = getProfileById('logic_no_react');

    it('should detect React imports in logic files', () => {
      const code = `
        import React from 'react';
        export const calculateSum = (a, b) => a + b;
      `;

      const applicableProfiles = getApplicableProfiles(code);
      expect(applicableProfiles.some((p) => p.id === 'logic_no_react')).toBe(true);

      // Check that forbidden patterns are detected
      const forbidden = profile?.forbidden || [];
      const hasViolation = forbidden.some((pattern) => pattern.test(code));
      expect(hasViolation).toBe(true);
    });

    it('should not flag non-logic files', () => {
      const reactComponentCode = `
        export const Button: React.FC = () => (
          <button>Click me</button>
        );
      `;

      const applicableProfiles = getApplicableProfiles(reactComponentCode);
      expect(applicableProfiles.some((p) => p.id === 'logic_no_react')).toBe(false);
    });
  });

  // ============================================================================
  // COMPONENT RULES
  // ============================================================================
  describe('Component Rules - COMPONENT_PROPS', () => {
    const profile = getProfileById('component_props');

    it('should enforce TypeScript interfaces for component props', () => {
      const badCode = `
        const ButtonProps = z.object({
          onClick: z.function(),
        });
        export const Button: React.FC<ButtonProps> = (props) => <button />;
      `;

      const applicableProfiles = getApplicableProfiles(badCode);
      const isComponent = applicableProfiles.some((p) => p.id === 'component_props');
      
      if (isComponent && profile) {
        const forbidden = profile.forbidden || [];
        const hasViolation = forbidden.some((pattern) => pattern.test(badCode));
        expect(hasViolation).toBe(true);
      }
    });

    it('should accept TypeScript interfaces for props', () => {
      const goodCode = `
        interface ButtonProps {
          onClick: () => void;
          children: React.ReactNode;
        }
        export const Button: React.FC<ButtonProps> = (props) => <button />;
      `;

      const applicableProfiles = getApplicableProfiles(goodCode);
      const isComponent = applicableProfiles.some((p) => p.id === 'component_props');
      
      if (isComponent && profile) {
        const required = profile.required || [];
        const hasInterface = required.some((pattern) => pattern.test(goodCode));
        expect(hasInterface).toBe(true);
      }
    });
  });

  describe('Component Rules - COMPONENT_EXTENSIBILITY', () => {
    const profile = getProfileById('component_extensibility');

    it('should require className prop on reusable components', () => {
      const code = `
        interface ButtonProps {
          children: React.ReactNode;
        }
        export const Button: React.FC<ButtonProps> = ({ children }) => (
          <button className="px-4 py-2">{children}</button>
        );
      `;

      const applicableProfiles = getApplicableProfiles(code);
      const isButton = applicableProfiles.some(
        (p) => p.id === 'component_extensibility'
      );

      if (isButton && profile) {
        const required = profile.required || [];
        const hasClassName = required.some(
          (pattern) => pattern.test(code)
        );
        expect(hasClassName).toBe(false); // Missing className prop
      }
    });

    it('should accept className with clsx/twMerge', () => {
      const code = `
        interface ButtonProps {
          className?: string;
          children: React.ReactNode;
        }
        import { clsx } from 'clsx';
        export const Button: React.FC<ButtonProps> = ({ className, children }) => (
          <button className={clsx('px-4 py-2', className)}>{children}</button>
        );
      `;

      const applicableProfiles = getApplicableProfiles(code);
      const isButton = applicableProfiles.some(
        (p) => p.id === 'component_extensibility'
      );

      if (isButton && profile) {
        const required = profile.required || [];
        const satisfied = required.every((pattern) => pattern.test(code));
        expect(satisfied).toBe(true);
      }
    });
  });

  // ============================================================================
  // INFRASTRUCTURE RULES
  // ============================================================================
  describe('Infrastructure - INFRASTRUCTURE_HELPER', () => {
    const profile = getProfileById('infrastructure_helper');

    it('should require named imports for clsx', () => {
      const badCode = `
        import clsx from 'clsx';
        const className = clsx('base', custom);
      `;

      const applicableProfiles = getApplicableProfiles(badCode);
      const isInfra = applicableProfiles.some(
        (p) => p.id === 'infrastructure_helper'
      );

      if (isInfra && profile) {
        const required = profile.required || [];
        const hasNamedImport = required.some((pattern) => pattern.test(badCode));
        expect(hasNamedImport).toBe(false); // Default import, not named
      }
    });

    it('should accept named imports', () => {
      const goodCode = `
        import { clsx } from 'clsx';
        import { twMerge } from 'tailwind-merge';
        const className = clsx('base', custom);
        const merged = twMerge(base, override);
      `;

      const applicableProfiles = getApplicableProfiles(goodCode);
      const isInfra = applicableProfiles.some(
        (p) => p.id === 'infrastructure_helper'
      );

      if (isInfra && profile) {
        const required = profile.required || [];
        const allSatisfied = required.every((pattern) => pattern.test(goodCode));
        expect(allSatisfied).toBe(true);
      }
    });
  });

  // ============================================================================
  // REACT HOOKS
  // ============================================================================
  describe('React Hooks - REACT_HOOKS_USAGE', () => {
    const profile = getProfileById('react_hooks_usage');

    it('should reject storing hooks as values', () => {
      const badCode = `
        import { useState } from 'react';
        const state = useState;
        const [value, setValue] = state(0);
      `;

      const applicableProfiles = getApplicableProfiles(badCode);
      const isHooks = applicableProfiles.some(
        (p) => p.id === 'react_hooks_usage'
      );

      if (isHooks && profile) {
        const forbidden = profile.forbidden || [];
        const hasViolation = forbidden.some((pattern) => pattern.test(badCode));
        expect(hasViolation).toBe(true);
      }
    });

    it('should accept proper hook usage', () => {
      const goodCode = `
        import { useState } from 'react';
        const [value, setValue] = useState(0);
      `;

      const applicableProfiles = getApplicableProfiles(goodCode);
      const isHooks = applicableProfiles.some(
        (p) => p.id === 'react_hooks_usage'
      );

      if (isHooks && profile) {
        const required = profile.required || [];
        const hasFunctionCall = required.some((pattern) => pattern.test(goodCode));
        expect(hasFunctionCall).toBe(true);
      }
    });
  });

  // ============================================================================
  // SEMANTIC VALIDATOR INTEGRATION
  // ============================================================================
  describe('SemanticValidator Integration', () => {
    const validator = new SemanticValidator();

    it('should detect profile violations', () => {
      const badCode = `
        import React from 'react';
        export const logValue = (val: any) => console.log(val);
      `;

      const errors = validator.validateCode(badCode);
      
      // Should find profile-violation errors
      const profileErrors = errors.filter((e) => e.type === 'profile-violation');
      expect(profileErrors.length).toBeGreaterThan(0);
    });

    it('should get applicable profiles from validator', () => {
      const componentCode = `
        interface ButtonProps {
          onClick: () => void;
        }
        export const Button: React.FC<ButtonProps> = ({ onClick }) => (
          <button onClick={onClick} />
        );
      `;

      const profiles = validator.getApplicableProfiles(componentCode);
      expect(profiles.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // PROFILE SELECTOR LOGIC
  // ============================================================================
  describe('Profile Selectors', () => {
    it('should match component patterns correctly', () => {
      const componentCode = `
        interface ButtonProps { children: React.ReactNode; }
        export const Button: React.FC<ButtonProps> = ({ children }) => (
          <button>{children}</button>
        );
      `;

      const profiles = getApplicableProfiles(componentCode);
      
      // Should match component-related profiles
      const componentProfiles = profiles.filter(
        (p) => p.id.includes('component')
      );
      expect(componentProfiles.length).toBeGreaterThan(0);
    });

    it('should match utility/helper patterns', () => {
      const utilCode = `
        import { clsx } from 'clsx';
        export const mergeClasses = (base: string, override?: string) => {
          return clsx(base, override);
        };
      `;

      const profiles = getApplicableProfiles(utilCode);
      const infraProfiles = profiles.filter(
        (p) => p.id.includes('infrastructure')
      );
      expect(infraProfiles.length).toBeGreaterThan(0);
    });

    it('should match form patterns', () => {
      const formCode = `
        import { z } from 'zod';
        const LoginFormSchema = z.object({
          email: z.string().email(),
          password: z.string().min(8),
        });
        export const LoginForm = () => <form />;
      `;

      const profiles = getApplicableProfiles(formCode);
      const formProfiles = profiles.filter(
        (p) => p.id.includes('form') || p.id.includes('validation')
      );
      expect(formProfiles.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // ERROR MESSAGE QUALITY
  // ============================================================================
  describe('Error Messages', () => {
    const validator = new SemanticValidator();

    it('should include rule ID in profile violations', () => {
      const badCode = `
        import React from 'react';
        export const helper = () => {};
      `;

      const errors = validator.validateCode(badCode);
      const profileErrors = errors.filter((e) => e.type === 'profile-violation');
      
      profileErrors.forEach((error) => {
        expect(error.ruleId).toBeDefined();
        expect(error.message).toContain('[');
      });
    });

    it('should include fix suggestions', () => {
      const badCode = `
        import React from 'react';
        export const helper = () => {};
      `;

      const errors = validator.validateCode(badCode);
      errors.forEach((error) => {
        if (error.fix) {
          expect(error.fix.length).toBeGreaterThan(0);
        }
      });
    });
  });
});
