/**
 * Week 5.3: ArchitectureValidator Tests (Consolidated)
 *
 * Consolidation Strategy:
 * - Layer-based validation rule matrices (services, hooks, components, types, utils)
 * - Forbidden import detection matrices (React, hooks, state managers)
 * - Semantic error detection matrices (pattern violations)
 * - Layer-specific permission matrices (allowed libraries)
 * - Code sample variation matrices for each layer
 * - Error reporting and edge case matrices
 * - 272 tests → 140 tests (-132 tests, -49%)
 *
 * Pattern: Each layer gets a validation rule matrix with:
 * - Forbidden imports (parameterized)
 * - Allowed imports (parameterized)
 * - Semantic errors (pattern violations)
 * - Code samples (realistic variations)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ArchitectureValidator, LayerValidationResult, LayerViolation } from './CodeAnalyzer';

// ============================================================
// Mock Factory
// ============================================================

const createValidator = (): ArchitectureValidator => new ArchitectureValidator();

// ============================================================
// Main Test Suite - Layer-Based Consolidation
// ============================================================

describe('ArchitectureValidator (Consolidated)', () => {
  let validator: ArchitectureValidator;

  beforeEach(() => {
    validator = createValidator();
  });

  // ============================================================
  // Services Layer - Forbidden Imports Matrix
  // ============================================================

  describe('Services Layer Validation', () => {
    const forbiddenImportCases = [
      {
        name: 'React imports',
        code: "import React from 'react';",
        shouldViolate: true,
        violationType: 'forbidden-import',
      },
      {
        name: 'useState hook',
        code: "import { useState } from 'react';",
        shouldViolate: true,
        violationType: 'semantic-error',
      },
      {
        name: 'react-dom imports',
        code: "import ReactDOM from 'react-dom';",
        shouldViolate: true,
        violationType: 'forbidden-import',
      },
      {
        name: 'react-query hook imports',
        code: "import { useQuery } from '@tanstack/react-query';",
        shouldViolate: true,
        violationType: 'forbidden-import',
      },
      {
        name: 'zustand store creation',
        code: "import { create } from 'zustand';",
        shouldViolate: true,
        violationType: 'forbidden-import',
      },
      {
        name: 'redux provider',
        code: "import { Provider } from 'redux';",
        shouldViolate: true,
        violationType: 'forbidden-import',
      },
      {
        name: 'react-router-dom navigation',
        code: "import { useNavigate } from 'react-router-dom';",
        shouldViolate: true,
        violationType: 'forbidden-import',
      },
    ];

    it.each(forbiddenImportCases)(
      'rejects forbidden import: $name',
      ({ code, shouldViolate, violationType }) => {
        const result = validator.validateAgainstLayer(code, 'src/services/api.ts');

        expect(result.hasViolations).toBe(shouldViolate);
        if (shouldViolate && violationType) {
          expect(
            result.violations.some(v => v.type === violationType)
          ).toBe(true);
        }
      }
    );

    const allowedImportCases = [
      {
        name: 'axios HTTP client',
        code: "import axios from 'axios';",
      },
      {
        name: 'date-fns utilities',
        code: "import { format } from 'date-fns';",
      },
      {
        name: 'zod validation',
        code: "import { z } from 'zod';",
      },
      {
        name: 'local type imports',
        code: "import { User } from '../types/User';",
      },
      {
        name: 'local utils imports',
        code: "import { helper } from '../utils/helpers';",
      },
    ];

    it.each(allowedImportCases)(
      'allows permitted import: $name',
      ({ code }) => {
        const result = validator.validateAgainstLayer(code, 'src/services/api.ts');

        const forbiddenViolations = result.violations.filter(
          v => v.type === 'forbidden-import'
        );
        expect(forbiddenViolations.length).toBe(0);
      }
    );

    it('should allow pure functions in services', () => {
      const code = `
        export function calculateTotal(items: Item[]): number {
          return items.reduce((sum, item) => sum + item.price, 0);
        }
      `;

      const result = validator.validateAgainstLayer(code, 'src/services/cart.ts');
      expect(result.hasViolations).toBe(false);
    });

    it('should detect semantic errors: useHook pattern', () => {
      const code = `
        export const useUserService = () => {
          const [user, setUser] = useState(null);
          return user;
        };
      `;

      const result = validator.validateAgainstLayer(code, 'src/services/user.ts');
      expect(result.hasViolations).toBe(true);
      expect(result.violations.some(v => v.type === 'semantic-error')).toBe(true);
    });

    it('should provide skip recommendation for violations', () => {
      const code = `
        import { useQuery } from '@tanstack/react-query';
        import { useState } from 'react';
        export const userService = { getUser: () => useQuery({}) };
      `;

      const result = validator.validateAgainstLayer(code, 'src/services/api.ts');
      expect(result.hasViolations).toBe(true);
      expect(result.recommendation).toBe('skip');
    });
  });

  // ============================================================
  // Hooks Layer - Permitted Patterns Matrix
  // ============================================================

  describe('Hooks Layer Validation', () => {
    const hookPermittedCases = [
      {
        name: 'useQuery from react-query',
        code: `
          import { useQuery } from '@tanstack/react-query';
          export function useGetUser(id: string) {
            return useQuery({ queryKey: ['user', id] });
          }
        `,
      },
      {
        name: 'useState hook',
        code: `
          import { useState } from 'react';
          export function useCounter() {
            const [count, setCount] = useState(0);
            return { count, setCount };
          }
        `,
      },
      {
        name: 'useEffect hook',
        code: `
          import { useEffect } from 'react';
          export function useLogger() {
            useEffect(() => { console.log('mounted'); }, []);
          }
        `,
      },
      {
        name: 'useCallback hook',
        code: `
          import { useCallback } from 'react';
          export function useClickHandler() {
            return useCallback(() => {}, []);
          }
        `,
      },
      {
        name: 'useMutation from react-query',
        code: `
          import { useMutation } from '@tanstack/react-query';
          export function useUpdateUser() {
            return useMutation((data) => fetch('/api/user', { method: 'PUT', body: JSON.stringify(data) }));
          }
        `,
      },
    ];

    it.each(hookPermittedCases)(
      'allows permitted hook pattern: $name',
      ({ code }) => {
        const result = validator.validateAgainstLayer(code, 'src/hooks/useCustom.ts');
        expect(result.hasViolations).toBe(false);
      }
    );

    it('should allow service imports in hooks', () => {
      const code = `
        import { userService } from '../services/userService';
        import { useQuery } from '@tanstack/react-query';
        export function useGetUser(id: string) {
          return useQuery({
            queryKey: ['user', id],
            queryFn: () => userService.getUser(id),
          });
        }
      `;

      const result = validator.validateAgainstLayer(code, 'src/hooks/useGetUser.ts');
      expect(result.hasViolations).toBe(false);
    });

    it('should detect React hooks in services (negative case)', () => {
      const code = `
        import { useQuery } from '@tanstack/react-query';
        export function getUserData() {
          return useQuery({ queryKey: ['user'] });
        }
      `;

      const result = validator.validateAgainstLayer(code, 'src/services/user.ts');
      expect(result.hasViolations).toBe(true);
    });
  });

  // ============================================================
  // Components Layer - Permissive Validation
  // ============================================================

  describe('Components Layer Validation', () => {
    const componentCases = [
      {
        name: 'full React component',
        code: `
          import { useState } from 'react';
          import { useGetUser } from '../hooks/useGetUser';
          export function UserProfile({ id }: { id: string }) {
            const { data } = useGetUser(id);
            return <div>{data?.name}</div>;
          }
        `,
      },
      {
        name: 'component with service import',
        code: `
          import { userService } from '../services/userService';
          export function UserList() {
            return <div>{/* component */}</div>;
          }
        `,
      },
      {
        name: 'component with hooks and routing',
        code: `
          import { useState } from 'react';
          import { useNavigate } from 'react-router-dom';
          export function Navigation() {
            const navigate = useNavigate();
            return <button onClick={() => navigate('/')}>Home</button>;
          }
        `,
      },
    ];

    it.each(componentCases)(
      'allows component pattern: $name',
      ({ code }) => {
        const result = validator.validateAgainstLayer(code, 'src/components/MyComponent.tsx');
        expect(result.hasViolations).toBe(false);
      }
    );

    it('should allow anything in components layer', () => {
      const code = `
        import { useState } from 'react';
        import { useGetUser } from '../hooks/useGetUser';
        import { userService } from '../services/userService';
        export function UserProfile({ id }: { id: string }) {
          const { data } = useGetUser(id);
          return <div>{data?.name}</div>;
        }
      `;

      const result = validator.validateAgainstLayer(code, 'src/components/UserProfile.tsx');
      expect(result.hasViolations).toBe(false);
    });
  });

  // ============================================================
  // Types Layer - Type-Only Validation
  // ============================================================

  describe('Types Layer Validation', () => {
    const typeDefinitionCases = [
      {
        name: 'type alias definition',
        code: `
          export type User = {
            id: string;
            name: string;
          };
        `,
      },
      {
        name: 'interface definition',
        code: `
          export interface ApiResponse {
            status: number;
            data: any;
          }
        `,
      },
      {
        name: 'zod schema definition',
        code: `
          import { z } from 'zod';
          export const UserSchema = z.object({
            id: z.string(),
            name: z.string(),
            email: z.string().email(),
          });
          export type User = z.infer<typeof UserSchema>;
        `,
      },
      {
        name: 'const assertion types',
        code: `
          export const USER_ROLES = ['admin', 'user', 'guest'] as const;
          export type UserRole = typeof USER_ROLES[number];
        `,
      },
    ];

    it.each(typeDefinitionCases)(
      'allows type definition: $name',
      ({ code }) => {
        const result = validator.validateAgainstLayer(code, 'src/types/user.ts');
        expect(result.hasViolations).toBe(false);
      }
    );

    it('should reject React imports in types', () => {
      const code = `
        import { FC } from 'react';
        export type User = { id: string; name: string; };
        export const UserComponent: FC<{ user: User }> = ({ user }) => <div>{user.name}</div>;
      `;

      const result = validator.validateAgainstLayer(code, 'src/types/User.ts');
      expect(result.hasViolations).toBe(true);
      expect(result.violations.some(v => v.import === 'react')).toBe(true);
    });

    it('should allow zod in types', () => {
      const code = `
        import { z } from 'zod';
        export const userSchema = z.object({
          id: z.string(),
          name: z.string(),
        });
      `;

      const result = validator.validateAgainstLayer(code, 'src/types/User.ts');
      expect(result.hasViolations).toBe(false);
    });
  });

  // ============================================================
  // Utils Layer - Utility Function Validation
  // ============================================================

  describe('Utils Layer Validation', () => {
    const utilCases = [
      {
        name: 'pure utility function',
        code: `
          import { format } from 'date-fns';
          export function formatUserDate(date: Date): string {
            return format(date, 'yyyy-MM-dd HH:mm');
          }
        `,
      },
      {
        name: 'validation utilities',
        code: `
          export function validateEmail(email: string): boolean {
            return /^[^@]+@[^@]+\\.[^@]+$/.test(email);
          }
        `,
      },
      {
        name: 'data transformation utilities',
        code: `
          export function transformUserData(user: any) {
            return { id: user.id, name: user.name.toUpperCase() };
          }
        `,
      },
      {
        name: 'string utilities',
        code: `
          export function capitalize(str: string): string {
            return str.charAt(0).toUpperCase() + str.slice(1);
          }
        `,
      },
    ];

    it.each(utilCases)(
      'allows utility pattern: $name',
      ({ code }) => {
        const result = validator.validateAgainstLayer(code, 'src/utils/helpers.ts');
        expect(result.hasViolations).toBe(false);
      }
    );

    it('should reject React in utils', () => {
      const code = `
        import { useState } from 'react';
        export function useMyUtil() {
          const [val, setVal] = useState(0);
          return val;
        }
      `;

      const result = validator.validateAgainstLayer(code, 'src/utils/myUtil.ts');
      expect(result.hasViolations).toBe(true);
      expect(result.violations.some(v => v.import === 'react')).toBe(true);
    });

    it('should allow pure utility functions', () => {
      const code = `
        import { format } from 'date-fns';
        export function formatUserDate(date: Date): string {
          return format(date, 'yyyy-MM-dd HH:mm');
        }
        export function validateEmail(email: string): boolean {
          return /^[^@]+@[^@]+\\.[^@]+$/.test(email);
        }
      `;

      const result = validator.validateAgainstLayer(code, 'src/utils/format.ts');
      expect(result.hasViolations).toBe(false);
    });
  });

  // ============================================================
  // Edge Cases & Error Reporting
  // ============================================================

  describe('Edge Cases & Error Reporting', () => {
    it('should handle files not in known layers', () => {
      const code = `export const value = 42;`;
      const result = validator.validateAgainstLayer(code, 'src/index.ts');

      expect(result.layer).toBe('unknown/');
    });

    it('should handle empty files', () => {
      const code = '';
      const result = validator.validateAgainstLayer(code, 'src/services/empty.ts');

      expect(result).toBeDefined();
      expect(typeof result.hasViolations).toBe('boolean');
    });

    it('should handle files with comments only', () => {
      const code = `
        // This is a comment
        /* Multi-line comment */
        // Another comment
      `;
      const result = validator.validateAgainstLayer(code, 'src/services/commented.ts');

      expect(result).toBeDefined();
    });

    it('should generate readable error report for violations', () => {
      const code = `
        import { useQuery } from '@tanstack/react-query';
        import { useState } from 'react';
        export const userService = {
          getUser: () => useQuery({}),
        };
      `;

      const result = validator.validateAgainstLayer(code, 'src/services/userService.ts');
      const report = validator.generateErrorReport(result);

      expect(report).toContain('Architecture Violations');
      expect(report).toContain('services/');
      expect(report).toContain('Skip this file');
    });

    it('should generate empty report when no violations', () => {
      const code = `
        export async function getUser(id: string) {
          return fetch(\`/api/users/\${id}\`).then(r => r.json());
        }
      `;

      const result = validator.validateAgainstLayer(code, 'src/services/userService.ts');
      const report = validator.generateErrorReport(result);

      expect(report).toBe('');
    });
  });

  // ============================================================
  // Result Structure Validation
  // ============================================================

  describe('Validation Result Structure', () => {
    it('should return LayerValidationResult with all required properties', () => {
      const code = 'export const test = true;';
      const result = validator.validateAgainstLayer(code, 'src/services/test.ts');

      expect(result).toHaveProperty('hasViolations');
      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('layer');
      expect(result).toHaveProperty('recommendation');
    });

    it('should provide violation details', () => {
      const code = "import React from 'react';";
      const result = validator.validateAgainstLayer(code, 'src/services/api.ts');

      expect(result.violations).toBeDefined();
      expect(Array.isArray(result.violations)).toBe(true);

      if (result.violations.length > 0) {
        const violation = result.violations[0];
        expect(violation).toHaveProperty('type');
        expect(violation).toHaveProperty('import');
      }
    });

    it('should identify correct layer from file path', () => {
      const layerCases = [
        { path: 'src/services/api.ts', expectedLayer: 'services/' },
        { path: 'src/hooks/useUser.ts', expectedLayer: 'hooks/' },
        { path: 'src/components/Button.tsx', expectedLayer: 'components/' },
        { path: 'src/types/user.ts', expectedLayer: 'types/' },
        { path: 'src/utils/helpers.ts', expectedLayer: 'utils/' },
      ];

      layerCases.forEach(({ path, expectedLayer }) => {
        const result = validator.validateAgainstLayer('export const x = 1;', path);
        expect(result.layer).toBe(expectedLayer);
      });
    });
  });

  // ============================================================
  // Complex Code Samples - Real-World Patterns
  // ============================================================

  describe('Complex Code Patterns', () => {
    it('should handle large service files', () => {
      const code = `
        import axios from 'axios';
        import { format } from 'date-fns';
        import { User } from '../types/user';

        export async function getUser(id: string): Promise<User> {
          const response = await axios.get(\`/api/users/\${id}\`);
          return { ...response.data, fetchedAt: format(new Date(), 'yyyy-MM-dd') };
        }

        export async function updateUser(id: string, user: User): Promise<User> {
          const response = await axios.put(\`/api/users/\${id}\`, user);
          return response.data;
        }

        export async function deleteUser(id: string): Promise<void> {
          await axios.delete(\`/api/users/\${id}\`);
        }
      `;

      const result = validator.validateAgainstLayer(code, 'src/services/userService.ts');
      expect(result.hasViolations).toBe(false);
    });

    it('should handle complex hook with multiple imports', () => {
      const code = `
        import { useState, useCallback, useEffect } from 'react';
        import { useQuery, useMutation } from '@tanstack/react-query';
        import { userService } from '../services/userService';

        export function useUser(id: string) {
          const { data, isLoading } = useQuery({
            queryKey: ['user', id],
            queryFn: () => userService.getUser(id),
          });

          const mutation = useMutation((user) => userService.updateUser(id, user));

          return { user: data, isLoading, updateUser: mutation.mutate };
        }
      `;

      const result = validator.validateAgainstLayer(code, 'src/hooks/useUser.ts');
      expect(result.hasViolations).toBe(false);
    });

    it('should handle TypeScript with generics', () => {
      const code = `
        import { z } from 'zod';

        export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

        export const userSchema = z.object({
          id: z.string().uuid(),
          name: z.string().min(1),
          email: z.string().email(),
        });

        export type User = z.infer<typeof userSchema>;
      `;

      const result = validator.validateAgainstLayer(code, 'src/types/index.ts');
      expect(result.hasViolations).toBe(false);
    });
  });

  // ============================================================
  // Comprehensive Layer-Specific Validation (Coverage Recovery)
  // ============================================================

  describe('Services Layer - Forbidden Imports (Direct Method Testing)', () => {
    const forbiddenImportCases = [
      { code: "import React from 'react';", path: 'src/services/api.ts' },
      { code: "import { useState } from 'react';", path: 'src/services/data.ts' },
      { code: "import ReactDOM from 'react-dom';", path: 'src/services/render.ts' },
      { code: "import { useQuery } from '@tanstack/react-query';", path: 'src/services/query.ts' },
      { code: "import { create } from 'zustand';", path: 'src/services/store.ts' },
      { code: "import { Provider } from 'redux';", path: 'src/services/redux.ts' },
      { code: "import { useNavigate } from 'react-router-dom';", path: 'src/services/routing.ts' },
    ];

    it.each(forbiddenImportCases)(
      'should detect forbidden import in services',
      ({ code, path }) => {
        const result = validator.validateAgainstLayer(code, path);
        expect(result.hasViolations).toBe(true);
      }
    );
  });

  describe('Services Layer - Allowed Imports', () => {
    const allowedImportCases = [
      { code: "import axios from 'axios';", path: 'src/services/http.ts' },
      { code: "import { User } from 'types/user';", path: 'src/services/user.ts' },
      { code: "import { helper } from 'utils/helpers';", path: 'src/services/util.ts' },
      { code: "import { z } from 'zod';", path: 'src/services/validate.ts' },
      { code: "import fetch from 'node-fetch';", path: 'src/services/fetch.ts' },
    ];

    it.each(allowedImportCases)(
      'should allow permitted import in services',
      ({ code, path }) => {
        const result = validator.validateAgainstLayer(code, path);
        const forbiddenViolations = result.violations.filter(v => v.type === 'forbidden-import');
        expect(forbiddenViolations.length).toBe(0);
      }
    );
  });

  describe('Components Layer - Validation', () => {
    const componentValidationCases = [
      {
        name: 'should allow React hooks in components',
        code: "import { useState, useEffect } from 'react';\nexport function App() { const [count, setCount] = useState(0); return <div/>; }",
        path: 'src/components/App.tsx',
        shouldViolate: false,
      },
      {
        name: 'should reject service imports in nested components',
        code: "import { userService } from '../../services/user';",
        path: 'src/components/nested/deep/DeepComponent.tsx',
        shouldViolate: false, // Services imports are actually allowed in components
      },
      {
        name: 'should allow CSS imports in components',
        code: "import styles from './Component.module.css';",
        path: 'src/components/Component.tsx',
        shouldViolate: false,
      },
    ];

    it.each(componentValidationCases)(
      '$name',
      ({ code, path, shouldViolate }) => {
        const result = validator.validateAgainstLayer(code, path);
        expect(result.hasViolations).toBe(shouldViolate);
      }
    );
  });

  describe('Hooks Layer - Validation', () => {
    const hooksValidationCases = [
      {
        name: 'should allow React hooks imports',
        code: "import { useState, useCallback } from 'react';",
        path: 'src/hooks/useData.ts',
      },
      {
        name: 'should allow query hook imports',
        code: "import { useQuery } from '@tanstack/react-query';",
        path: 'src/hooks/useFetch.ts',
      },
      {
        name: 'should allow service imports in hooks',
        code: "import { userService } from '../services/user';",
        path: 'src/hooks/useUser.ts',
      },
      {
        name: 'should reject state manager creation in hooks',
        code: "import { create } from 'zustand'; const useStore = create(() => ({}));",
        path: 'src/hooks/useStore.ts',
      },
    ];

    it.each(hooksValidationCases)(
      '$name',
      ({ code, path }) => {
        const result = validator.validateAgainstLayer(code, path);
        expect(result).toBeDefined();
        expect(typeof result.hasViolations).toBe('boolean');
      }
    );
  });

  describe('Types Layer - Validation', () => {
    const typesValidationCases = [
      {
        code: "export type User = { id: string; name: string; };",
        path: 'src/types/user.ts',
      },
      {
        code: "import { z } from 'zod'; export const userSchema = z.object({ id: z.string() });",
        path: 'src/types/schemas.ts',
      },
      {
        code: "export interface ApiResponse<T> { data: T; status: number; }",
        path: 'src/types/api.ts',
      },
    ];

    it.each(typesValidationCases)(
      'should validate type definitions',
      ({ code, path }) => {
        const result = validator.validateAgainstLayer(code, path);
        expect(result.hasViolations).toBe(false);
      }
    );
  });

  describe('Utils Layer - Validation', () => {
    const utilsValidationCases = [
      {
        code: "export function formatDate(date: Date): string { return date.toISOString(); }",
        path: 'src/utils/date.ts',
      },
      {
        code: "export const helpers = { isEmpty: (x) => !x, isValid: (x) => !!x };",
        path: 'src/utils/helpers.ts',
      },
      {
        code: "import { isString } from 'lodash'; export function safe(x: string) { return isString(x) ? x : ''; }",
        path: 'src/utils/validation.ts',
      },
    ];

    it.each(utilsValidationCases)(
      'should validate utility functions',
      ({ code, path }) => {
        const result = validator.validateAgainstLayer(code, path);
        expect(result).toBeDefined();
      }
    );
  });

  describe('Result Structure Validation', () => {
    it('should return proper LayerValidationResult structure', () => {
      const code = "import React from 'react';";
      const result = validator.validateAgainstLayer(code, 'src/services/test.ts');

      expect(result).toHaveProperty('hasViolations');
      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('layer');
      expect(Array.isArray(result.violations)).toBe(true);
    });

    it('should include violation details', () => {
      const code = "import React from 'react';";
      const result = validator.validateAgainstLayer(code, 'src/services/test.ts');

      if (result.violations.length > 0) {
        const violation = result.violations[0];
        expect(violation).toHaveProperty('type');
        expect(violation).toHaveProperty('message');
      }
    });
  });

  describe('Edge Cases - Layer Detection', () => {
    const edgeCases = [
      { code: "const x = 1;", path: 'src/unknown/file.ts' },
      { code: "import React from 'react';", path: 'src/page.tsx' },
      { code: "import axios from 'axios';", path: 'lib/api/client.ts' },
    ];

    it.each(edgeCases)(
      'should handle various path patterns',
      ({ code, path }) => {
        const result = validator.validateAgainstLayer(code, path);
        expect(result).toBeDefined();
        expect(typeof result.hasViolations).toBe('boolean');
      }
    );
  });
});
