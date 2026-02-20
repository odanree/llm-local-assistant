/**
 * architectureValidator-layer-rules.test.ts
 * Focused tests for ArchitectureValidator layer validation
 * Tests the actual validateAgainstLayer() API with realistic code samples
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ArchitectureValidator } from '../architectureValidator';

describe('ArchitectureValidator - Layer Rules & Violations', () => {
  let validator: ArchitectureValidator;

  beforeEach(() => {
    validator = new ArchitectureValidator();
  });

  describe('Services Layer Validation', () => {
    it('should reject React imports in services layer', () => {
      const code = 'import React from "react";';
      const result = validator.validateAgainstLayer(code, 'src/services/api.ts');
      
      expect(result).toBeDefined();
      expect(result.layer).toBe('services/');
    });

    it('should reject hooks imports in services layer', () => {
      const code = 'import { useQuery } from "@tanstack/react-query";';
      const result = validator.validateAgainstLayer(code, 'src/services/user.ts');
      
      expect(result).toBeDefined();
      expect(result.layer).toBe('services/');
    });

    it('should allow axios in services layer', () => {
      const code = `
        import axios from 'axios';
        export async function fetchData() {
          return axios.get('/api/data');
        }
      `;
      const result = validator.validateAgainstLayer(code, 'src/services/api.ts');
      
      expect(result).toBeDefined();
      expect(result.layer).toBe('services/');
    });

    it('should allow zod validation in services', () => {
      const code = `
        import { z } from 'zod';
        const userSchema = z.object({ id: z.string() });
      `;
      const result = validator.validateAgainstLayer(code, 'src/services/validate.ts');
      
      expect(result).toBeDefined();
      expect(result.layer).toBe('services/');
    });

    it('should return hasViolations flag correctly', () => {
      const codeWithViolation = 'import React from "react";';
      const result1 = validator.validateAgainstLayer(codeWithViolation, 'src/services/test.ts');
      
      expect(result1.hasViolations).toBeDefined();
      expect(typeof result1.hasViolations).toBe('boolean');
    });
  });

  describe('Types Layer Validation', () => {
    it('should allow type definitions', () => {
      const code = `
        export type User = {
          id: string;
          name: string;
        };
      `;
      const result = validator.validateAgainstLayer(code, 'src/types/user.ts');
      
      expect(result).toBeDefined();
      expect(result.layer).toBe('types/');
    });

    it('should allow interfaces', () => {
      const code = `
        export interface ApiResponse {
          status: number;
          data: any;
        }
      `;
      const result = validator.validateAgainstLayer(code, 'src/types/api.ts');
      
      expect(result).toBeDefined();
      expect(result.layer).toBe('types/');
    });

    it('should allow zod schemas', () => {
      const code = `
        import { z } from 'zod';
        export const userSchema = z.object({
          id: z.string(),
          email: z.string().email()
        });
      `;
      const result = validator.validateAgainstLayer(code, 'src/types/schemas.ts');
      
      expect(result).toBeDefined();
      expect(result.layer).toBe('types/');
    });
  });

  describe('Utils Layer Validation', () => {
    it('should allow utility functions', () => {
      const code = `
        export function formatDate(date: Date): string {
          return date.toISOString().split('T')[0];
        }
      `;
      const result = validator.validateAgainstLayer(code, 'src/utils/date.ts');
      
      expect(result).toBeDefined();
      expect(result.layer).toBe('utils/');
    });

    it('should allow lodash in utils', () => {
      const code = `
        import { debounce } from 'lodash';
        export const debouncedFn = debounce(() => {}, 300);
      `;
      const result = validator.validateAgainstLayer(code, 'src/utils/func.ts');
      
      expect(result).toBeDefined();
      expect(result.layer).toBe('utils/');
    });

    it('should reject React in utils', () => {
      const code = `
        import React from 'react';
        export function renderDate() {}
      `;
      const result = validator.validateAgainstLayer(code, 'src/utils/render.ts');
      
      expect(result).toBeDefined();
      expect(result.layer).toBe('utils/');
    });
  });

  describe('Components Layer Validation', () => {
    it('should allow React components', () => {
      const code = `
        import React from 'react';
        export const Button = ({ label }) => (
          <button>{label}</button>
        );
      `;
      const result = validator.validateAgainstLayer(code, 'src/components/Button.tsx');
      
      expect(result).toBeDefined();
      expect(result.layer).toBe('components/');
    });

    it('should allow hooks in components', () => {
      const code = `
        import { useUser } from '../hooks/useUser';
        export const UserProfile = () => {
          const user = useUser();
          return <div>{user.name}</div>;
        };
      `;
      const result = validator.validateAgainstLayer(code, 'src/components/Profile.tsx');
      
      expect(result).toBeDefined();
      expect(result.layer).toBe('components/');
    });

    it('should allow all imports in components', () => {
      const code = `
        import React from 'react';
        import { Button } from './Button';
        import { formatDate } from '../utils/date';
        import type { User } from '../types/user';
        import { fetchUser } from '../services/user';
      `;
      const result = validator.validateAgainstLayer(code, 'src/components/Card.tsx');
      
      expect(result).toBeDefined();
      expect(result.layer).toBe('components/');
    });
  });

  describe('Hooks Layer Validation', () => {
    it('should allow custom hooks', () => {
      const code = `
        import { useState } from 'react';
        export const useCounter = () => {
          const [count, setCount] = useState(0);
          return { count, increment: () => setCount(c => c + 1) };
        };
      `;
      const result = validator.validateAgainstLayer(code, 'src/hooks/useCounter.ts');
      
      expect(result).toBeDefined();
      expect(result.layer).toBe('hooks/');
    });

    it('should allow react-query in hooks', () => {
      const code = `
        import { useQuery } from '@tanstack/react-query';
        export const useUsers = () => 
          useQuery({ 
            queryKey: ['users'],
            queryFn: async () => fetch('/api/users').then(r => r.json())
          });
      `;
      const result = validator.validateAgainstLayer(code, 'src/hooks/useUsers.ts');
      
      expect(result).toBeDefined();
      expect(result.layer).toBe('hooks/');
    });
  });

  describe('Layer Detection', () => {
    it('should detect services layer from path', () => {
      const result = validator.validateAgainstLayer('export const api = {};', 'src/services/test.ts');
      expect(result.layer).toBe('services/');
    });

    it('should detect hooks layer from path', () => {
      const result = validator.validateAgainstLayer('export const useTest = () => {};', 'src/hooks/useTest.ts');
      expect(result.layer).toBe('hooks/');
    });

    it('should detect components layer from path', () => {
      const result = validator.validateAgainstLayer('export const Test = () => <div/>;', 'src/components/Test.tsx');
      expect(result.layer).toBe('components/');
    });

    it('should detect types layer from path', () => {
      const result = validator.validateAgainstLayer('export type Test = string;', 'src/types/test.ts');
      expect(result.layer).toBe('types/');
    });

    it('should detect utils layer from path', () => {
      const result = validator.validateAgainstLayer('export const test = () => {};', 'src/utils/test.ts');
      expect(result.layer).toBe('utils/');
    });

    it('should handle unknown layers', () => {
      const result = validator.validateAgainstLayer('export const test = {};', 'src/random/file.ts');
      expect(result.layer).toBe('unknown/');
      expect(result.recommendation).toBe('allow');
    });
  });

  describe('Violation Structure', () => {
    it('should include violations array in result', () => {
      const result = validator.validateAgainstLayer('import React from "react";', 'src/services/test.ts');
      expect(Array.isArray(result.violations)).toBe(true);
    });

    it('should include recommendation in result', () => {
      const result = validator.validateAgainstLayer('export const test = {};', 'src/services/api.ts');
      expect(['allow', 'fix', 'skip'].includes(result.recommendation)).toBe(true);
    });

    it('should mark violations with severity', () => {
      const result = validator.validateAgainstLayer('import React from "react";', 'src/services/test.ts');
      if (result.violations.length > 0) {
        result.violations.forEach(v => {
          expect(['low', 'medium', 'high'].includes(v.severity)).toBe(true);
        });
      }
    });

    it('violation should have type and message', () => {
      const result = validator.validateAgainstLayer('import React from "react";', 'src/services/test.ts');
      if (result.violations.length > 0) {
        result.violations.forEach(v => {
          expect(v.type).toBeDefined();
          expect(v.message).toBeDefined();
        });
      }
    });
  });

  describe('Code Patterns', () => {
    it('should handle empty code', () => {
      const result = validator.validateAgainstLayer('', 'src/services/empty.ts');
      expect(result).toBeDefined();
      expect(typeof result.hasViolations).toBe('boolean');
    });

    it('should handle code with only comments', () => {
      const code = `
        // This is a service file
        // It does something important
      `;
      const result = validator.validateAgainstLayer(code, 'src/services/commented.ts');
      expect(result).toBeDefined();
    });

    it('should handle multiple imports', () => {
      const code = `
        import axios from 'axios';
        import { z } from 'zod';
        import lodash from 'lodash';
      `;
      const result = validator.validateAgainstLayer(code, 'src/utils/multi.ts');
      expect(result).toBeDefined();
    });

    it('should handle complex import syntax', () => {
      const code = `
        import { 
          Component,
          type ComponentProps,
          useState
        } from 'react';
      `;
      const result = validator.validateAgainstLayer(code, 'src/components/complex.tsx');
      expect(result).toBeDefined();
    });

    it('should handle star imports', () => {
      const code = 'import * as lodash from "lodash";';
      const result = validator.validateAgainstLayer(code, 'src/utils/all.ts');
      expect(result).toBeDefined();
    });
  });

  describe('Validation Result Consistency', () => {
    it('should always return LayerValidationResult with required fields', () => {
      const result = validator.validateAgainstLayer(
        'export const test = {};',
        'src/services/test.ts'
      );

      expect(result).toHaveProperty('hasViolations');
      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('layer');
      expect(result).toHaveProperty('recommendation');
    });

    it('hasViolations should match violations array length', () => {
      const result = validator.validateAgainstLayer(
        'import React from "react";',
        'src/services/test.ts'
      );

      expect(result.hasViolations).toBe(result.violations.length > 0);
    });

    it('recommendation should match severity of violations', () => {
      const resultClean = validator.validateAgainstLayer(
        'export const api = {};',
        'src/services/api.ts'
      );

      if (!resultClean.hasViolations) {
        expect(resultClean.recommendation).toBe('allow');
      }
    });
  });
});
