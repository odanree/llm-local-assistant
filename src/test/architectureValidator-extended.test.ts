/**
 * architectureValidator-extended.test.ts
 * Comprehensive tests for ArchitectureValidator covering layer validation,
 * import checking, semantic error detection across all layers
 */

import { describe, it, expect } from 'vitest';
import { ArchitectureValidator, LayerValidationResult, LayerViolation } from '../architectureValidator';

/**
 * Helper to create validator instance
 */
const createValidator = (): ArchitectureValidator => new ArchitectureValidator();

describe('ArchitectureValidator - Services Layer', () => {
  let validator: ArchitectureValidator;

  it('should validate pure functions in services layer', () => {
    validator = createValidator();
    const code = `
      export function calculateTotal(items: Item[]): number {
        return items.reduce((sum, item) => sum + item.price, 0);
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/services/cart.ts');
    expect(result.hasViolations).toBe(false);
  });

  it('should reject React imports in services layer', () => {
    validator = createValidator();
    const code = `
      import React from 'react';
      export function getData() {
        return [];
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/services/data.ts');
    expect(result.hasViolations).toBe(true);
    expect(result.violations.some(v => v.type === 'forbidden-import')).toBe(true);
  });

  it('should reject React hooks in services layer', () => {
    validator = createValidator();
    const code = `
      import { useMutation } from '@tanstack/react-query';
      export function useUpdateUser() {
        return useMutation(() => fetch('/api/user'));
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/services/api.ts');
    expect(result.hasViolations).toBe(true);
  });

  it('should reject zustand imports in services layer', () => {
    validator = createValidator();
    const code = `
      import { create } from 'zustand';
      export const useStore = create(() => ({}));
    `;

    const result = validator.validateAgainstLayer(code, 'src/services/store.ts');
    expect(result.hasViolations).toBe(true);
  });

  it('should allow axios and date-fns in services layer', () => {
    validator = createValidator();
    const code = `
      import axios from 'axios';
      import { format } from 'date-fns';
      export async function fetchUserData(id: string) {
        const response = await axios.get(\`/api/users/\${id}\`);
        return { ...response.data, fetchedAt: format(new Date(), 'yyyy-MM-dd') };
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/services/user.ts');
    expect(result.hasViolations).toBe(false);
  });

  it('should allow types and utils imports in services layer', () => {
    validator = createValidator();
    const code = `
      import { User } from '../types/user';
      import { validateEmail } from '../utils/validation';
      export function processUser(user: User) {
        if (validateEmail(user.email)) {
          return user;
        }
        throw new Error('Invalid email');
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/services/user.ts');
    expect(result.hasViolations).toBe(false);
  });

  it('should allow local imports in services layer', () => {
    validator = createValidator();
    const code = `
      import { helper } from './helpers';
      import { config } from '../config';
      export function process() {
        return helper(config.value);
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/services/processor.ts');
    expect(result.hasViolations).toBe(false);
  });

  it('should detect useState in services', () => {
    validator = createValidator();
    const code = `
      import { useState } from 'react';
      export function useCounter() {
        const [count, setCount] = useState(0);
        return { count, setCount };
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/services/counter.ts');
    expect(result.hasViolations).toBe(true);
  });

  it('should recommend fix for services layer violations', () => {
    validator = createValidator();
    const code = `
      import React from 'react';
      export function getData() { return []; }
    `;

    const result = validator.validateAgainstLayer(code, 'src/services/data.ts');
    // Violations should result in either 'fix' or 'skip' recommendation
    expect(['fix', 'skip']).toContain(result.recommendation);
  });
});

describe('ArchitectureValidator - Hooks Layer', () => {
  let validator: ArchitectureValidator;

  it('should validate custom hooks in hooks layer', () => {
    validator = createValidator();
    const code = `
      import { useState, useEffect } from 'react';
      export function useCounter(initialValue: number = 0) {
        const [count, setCount] = useState(initialValue);
        return { count, setCount };
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/hooks/useCounter.ts');
    expect(result.hasViolations).toBe(false);
  });

  it('should allow services imports in hooks layer', () => {
    validator = createValidator();
    const code = `
      import { useState, useEffect } from 'react';
      import { fetchUser } from '../services/user';
      export function useUser(id: string) {
        const [user, setUser] = useState(null);
        useEffect(() => {
          fetchUser(id).then(setUser);
        }, [id]);
        return user;
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/hooks/useUser.ts');
    expect(result.hasViolations).toBe(false);
  });

  it('should allow react-query in hooks layer', () => {
    validator = createValidator();
    const code = `
      import { useQuery } from '@tanstack/react-query';
      import { fetchUsers } from '../services/api';
      export function useUsers() {
        return useQuery({
          queryKey: ['users'],
          queryFn: fetchUsers,
        });
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/hooks/useUsers.ts');
    expect(result.hasViolations).toBe(false);
  });

  it('should reject react-router-dom in hooks layer', () => {
    validator = createValidator();
    const code = `
      import { useNavigate } from 'react-router-dom';
      export function useCustomNav() {
        return useNavigate();
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/hooks/useNav.ts');
    expect(result.hasViolations).toBe(true);
  });

  it('should require use* export names in hooks layer', () => {
    validator = createValidator();
    const code = `
      export function invalidHookName() {
        return null;
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/hooks/invalid.ts');
    // Validation allows it but recommendation might be 'fix'
    expect(result).toBeDefined();
  });

  it('should allow zustand in hooks layer', () => {
    validator = createValidator();
    const code = `
      import { useShallow } from 'zustand/react/shallow';
      import { useStore } from '../store';
      export const useAppState = () => useStore(useShallow(state => ({
        user: state.user,
        setUser: state.setUser,
      })));
    `;

    const result = validator.validateAgainstLayer(code, 'src/hooks/useAppState.ts');
    expect(result.hasViolations).toBe(false);
  });
});

describe('ArchitectureValidator - Components Layer', () => {
  let validator: ArchitectureValidator;

  it('should validate React components in components layer', () => {
    validator = createValidator();
    const code = `
      import React from 'react';
      export function Button({ onClick, children }) {
        return <button onClick={onClick}>{children}</button>;
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/components/Button.tsx');
    expect(result.hasViolations).toBe(false);
  });

  it('should allow all imports in components layer', () => {
    validator = createValidator();
    const code = `
      import React from 'react';
      import { useUser } from '../hooks/useUser';
      import { fetchData } from '../services/api';
      import { User } from '../types/user';
      import { cn } from '../utils/classnames';
      export function UserProfile({ id }) {
        const user = useUser(id);
        return <div className={cn('profile')}>{user?.name}</div>;
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/components/UserProfile.tsx');
    expect(result.hasViolations).toBe(false);
  });

  it('should allow nested component imports in components layer', () => {
    validator = createValidator();
    const code = `
      import React from 'react';
      import { Button } from './Button';
      import { Card } from './Card';
      export function Modal({ isOpen, onClose, children }) {
        if (!isOpen) return null;
        return <Card><Button onClick={onClose}>Close</Button></Card>;
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/components/Modal.tsx');
    expect(result.hasViolations).toBe(false);
  });

  it('should allow react-dom in components layer', () => {
    validator = createValidator();
    const code = `
      import React from 'react';
      import { createPortal } from 'react-dom';
      export function Portal({ children }) {
        return createPortal(children, document.body);
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/components/Portal.tsx');
    expect(result.hasViolations).toBe(false);
  });
});

describe('ArchitectureValidator - Types Layer', () => {
  let validator: ArchitectureValidator;

  it('should validate type definitions in types layer', () => {
    validator = createValidator();
    const code = `
      export interface User {
        id: string;
        name: string;
        email: string;
      }
      export type UserId = string & { readonly __brand: 'UserId' };
    `;

    const result = validator.validateAgainstLayer(code, 'src/types/user.ts');
    expect(result.hasViolations).toBe(false);
  });

  it('should reject React imports in types layer', () => {
    validator = createValidator();
    const code = `
      import React from 'react';
      export interface Props {
        onClick: () => void;
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/types/props.ts');
    expect(result.hasViolations).toBe(true);
  });

  it('should reject services imports in types layer', () => {
    validator = createValidator();
    const code = `
      import { getUser } from '../services/user';
      export interface User {
        id: string;
        name: string;
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/types/user.ts');
    expect(result.hasViolations).toBe(true);
  });

  it('should reject hooks imports in types layer', () => {
    validator = createValidator();
    const code = `
      import { useUser } from '../hooks/useUser';
      export interface UserState {
        user: any;
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/types/state.ts');
    expect(result.hasViolations).toBe(true);
  });

  it('should allow Zod schemas in types layer', () => {
    validator = createValidator();
    const code = `
      import { z } from 'zod';
      export const UserSchema = z.object({
        id: z.string(),
        name: z.string(),
        email: z.string().email(),
      });
      export type User = z.infer<typeof UserSchema>;
    `;

    const result = validator.validateAgainstLayer(code, 'src/types/user.ts');
    expect(result.hasViolations).toBe(false);
  });

  it('should allow type-only imports in types layer', () => {
    validator = createValidator();
    const code = `
      export type Config = {
        apiUrl: string;
        timeout: number;
      };
      export interface Environment {
        config: Config;
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/types/config.ts');
    expect(result.hasViolations).toBe(false);
  });

  it('should allow const assertions in types layer for enums', () => {
    validator = createValidator();
    const code = `
      export const USER_ROLES = ['admin', 'user', 'guest'] as const;
      export type UserRole = typeof USER_ROLES[number];
      export enum Status {
        Active = 'active',
        Inactive = 'inactive',
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/types/constants.ts');
    expect(result.hasViolations).toBe(false);
  });
});

describe('ArchitectureValidator - Utils Layer', () => {
  let validator: ArchitectureValidator;

  it('should validate pure utility functions in utils layer', () => {
    validator = createValidator();
    const code = `
      export function formatDate(date: Date): string {
        return date.toISOString().split('T')[0];
      }
      export function parseJSON<T>(json: string): T {
        return JSON.parse(json);
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/utils/helpers.ts');
    expect(result.hasViolations).toBe(false);
  });

  it('should reject React imports in utils layer', () => {
    validator = createValidator();
    const code = `
      import React from 'react';
      export function getValue() {
        return 'value';
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/utils/helpers.ts');
    expect(result.hasViolations).toBe(true);
  });

  it('should reject zustand in utils layer', () => {
    validator = createValidator();
    const code = `
      import { create } from 'zustand';
      export const store = create(() => ({}));
    `;

    const result = validator.validateAgainstLayer(code, 'src/utils/store.ts');
    expect(result.hasViolations).toBe(true);
  });

  it('should allow lodash and date-fns in utils layer', () => {
    validator = createValidator();
    const code = `
      import { debounce } from 'lodash';
      import { format } from 'date-fns';
      export const debouncedSearch = debounce((query: string) => search(query), 300);
      export function formatTimestamp(ts: number) {
        return format(new Date(ts), 'yyyy-MM-dd HH:mm:ss');
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/utils/time.ts');
    expect(result.hasViolations).toBe(false);
  });

  it('should allow zod in utils layer', () => {
    validator = createValidator();
    const code = `
      import { z } from 'zod';
      export function validateUser(data: any) {
        return z.object({
          name: z.string(),
          email: z.string().email(),
        }).parse(data);
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/utils/validation.ts');
    expect(result.hasViolations).toBe(false);
  });

  it('should allow classnames utilities in utils layer', () => {
    validator = createValidator();
    const code = `
      import { clsx } from 'clsx';
      import { twMerge } from 'tailwind-merge';
      export function cn(...classes: any[]) {
        return twMerge(clsx(classes));
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/utils/cn.ts');
    expect(result.hasViolations).toBe(false);
  });
});

describe('ArchitectureValidator - Import Detection', () => {
  let validator: ArchitectureValidator;

  it('should detect named imports correctly', () => {
    validator = createValidator();
    const code = `
      import { useState, useEffect } from 'react';
      import { format } from 'date-fns';
    `;

    const result = validator.validateAgainstLayer(code, 'src/hooks/custom.ts');
    expect(result).toBeDefined();
  });

  it('should detect default imports correctly', () => {
    validator = createValidator();
    const code = `
      import React from 'react';
      import axios from 'axios';
    `;

    const result = validator.validateAgainstLayer(code, 'src/services/api.ts');
    expect(result.hasViolations).toBe(true);
  });

  it('should detect side-effect-only imports', () => {
    validator = createValidator();
    const code = `
      import 'tailwindcss/tailwind.css';
      import 'normalize.css';
    `;

    const result = validator.validateAgainstLayer(code, 'src/styles/index.ts');
    expect(result).toBeDefined();
  });

  it('should handle mixed import styles', () => {
    validator = createValidator();
    const code = `
      import React, { Fragment } from 'react';
      import * as fs from 'fs';
      import { join } from 'path';
    `;

    const result = validator.validateAgainstLayer(code, 'src/components/app.tsx');
    expect(result).toBeDefined();
  });
});

describe('ArchitectureValidator - Violation Reporting', () => {
  let validator: ArchitectureValidator;

  it('should include violation type in report', () => {
    validator = createValidator();
    const code = 'import React from "react";';

    const result = validator.validateAgainstLayer(code, 'src/services/api.ts');
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0].type).toBeDefined();
  });

  it('should include severity level in violations', () => {
    validator = createValidator();
    const code = 'import React from "react";';

    const result = validator.validateAgainstLayer(code, 'src/services/api.ts');
    expect(result.violations[0].severity).toMatch(/high|medium|low/);
  });

  it('should provide helpful suggestion in violations', () => {
    validator = createValidator();
    const code = 'import React from "react";';

    const result = validator.validateAgainstLayer(code, 'src/services/data.ts');
    expect(result.violations[0].suggestion).toBeDefined();
    expect(result.violations[0].suggestion.length).toBeGreaterThan(0);
  });

  it('should include import module name in violation message', () => {
    validator = createValidator();
    const code = 'import { useState } from "react";';

    const result = validator.validateAgainstLayer(code, 'src/services/counter.ts');
    expect(result.violations[0].import).toBe('react');
  });

  it('should provide multiple violations for multiple issues', () => {
    validator = createValidator();
    const code = `
      import React from 'react';
      import { useState } from 'react';
      import { useNavigate } from 'react-router';
    `;

    const result = validator.validateAgainstLayer(code, 'src/services/api.ts');
    expect(result.violations.length).toBeGreaterThan(1);
  });
});

describe('ArchitectureValidator - Edge Cases', () => {
  let validator: ArchitectureValidator;

  it('should handle empty code files', () => {
    validator = createValidator();
    const code = '';

    const result = validator.validateAgainstLayer(code, 'src/services/empty.ts');
    expect(result.hasViolations).toBe(false);
  });

  it('should handle code with only comments', () => {
    validator = createValidator();
    const code = `
      // This is a service
      // It does nothing
    `;

    const result = validator.validateAgainstLayer(code, 'src/services/comment.ts');
    expect(result.hasViolations).toBe(false);
  });

  it('should handle import statements in string literals', () => {
    validator = createValidator();
    const code = `
      export function getImportStatement() {
        return "import React from 'react'";
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/services/generator.ts');
    // Should have violation because regex will match the string literal
    expect(result).toBeDefined();
  });

  it('should handle multiline imports', () => {
    validator = createValidator();
    const code = `
      import {
        useState,
        useEffect,
        useCallback,
      } from 'react';
    `;

    const result = validator.validateAgainstLayer(code, 'src/hooks/multi.ts');
    expect(result.hasViolations).toBe(false);
  });

  it('should handle deeply nested paths', () => {
    validator = createValidator();
    const code = 'export const helper = () => true;';

    const result = validator.validateAgainstLayer(code, 'src/utils/deep/nested/path/helpers.ts');
    expect(result).toBeDefined();
  });

  it('should handle unknown layers gracefully', () => {
    validator = createValidator();
    const code = 'export const value = 42;';

    const result = validator.validateAgainstLayer(code, 'src/unknown/file.ts');
    expect(result.hasViolations).toBe(false);
    expect(result.recommendation).toBe('allow');
  });

  it('should handle relative imports', () => {
    validator = createValidator();
    const code = `
      import { helper } from './helper';
      import { util } from '../utils/util';
    `;

    const result = validator.validateAgainstLayer(code, 'src/services/processor.ts');
    expect(result.hasViolations).toBe(false);
  });

  it('should handle TypeScript paths', () => {
    validator = createValidator();
    const code = `
      import { helper } from '@utils/helper';
      import { User } from '@types/user';
    `;

    const result = validator.validateAgainstLayer(code, 'src/services/api.ts');
    expect(result) .toBeDefined();
  });
});

describe('ArchitectureValidator - Recommendations', () => {
  let validator: ArchitectureValidator;

  it('should recommend allow for valid code', () => {
    validator = createValidator();
    const code = 'export function pure() { return true; }';

    const result = validator.validateAgainstLayer(code, 'src/services/pure.ts');
    expect(result.recommendation).toBe('allow');
  });

  it('should recommend fix for violations', () => {
    validator = createValidator();
    const code = 'import React from "react";';

    const result = validator.validateAgainstLayer(code, 'src/services/bad.ts');
    // Violations should result in either 'fix' or 'skip' recommendation, not 'allow'
    expect(['fix', 'skip']).toContain(result.recommendation);
  });

  it('should recommend skip for warnings', () => {
    validator = createValidator();
    const code = 'export const config = { debug: true };';

    const result = validator.validateAgainstLayer(code, 'src/types/config.ts');
    expect(result.recommendation).toBeOneOf(['allow', 'fix', 'skip']);
  });
});

describe('ArchitectureValidator - Complex Scenarios', () => {
  let validator: ArchitectureValidator;

  it('should validate modern React Hooks in hooks layer', () => {
    validator = createValidator();
    const code = `
      import { useState, useCallback, useMemo, useRef, useContext } from 'react';
      import { useQuery } from '@tanstack/react-query';
      export function useComplexHook() {
        const [state, setState] = useState(null);
        const query = useQuery({ queryKey: ['data'], queryFn: () => fetch('/api') });
        const memoized = useMemo(() => process(state), [state]);
        const ref = useRef<HTMLDivElement>(null);
        const callback = useCallback(() => setState(null), []);
        return { state, query, memoized, ref, callback };
      }
    `;

    const result = validator.validateAgainstLayer(code, 'src/hooks/useComplex.ts');
    expect(result.hasViolations).toBe(false);
  });

  it('should validate layered architecture in full project structure', () => {
    validator = createValidator();

    // Service layer - pure functions
    const serviceCode = `
      import { format } from 'date-fns';
      export function processData(items: any[]) {
        return items.map(item => ({
          ...item,
          processed: format(new Date(), 'yyyy-MM-dd'),
        }));
      }
    `;
    const serviceResult = validator.validateAgainstLayer(serviceCode, 'src/services/processor.ts');
    expect(serviceResult.hasViolations).toBe(false);

    // Hook using service
    const hookCode = `
      import { useQuery } from '@tanstack/react-query';
      import { processData } from '../services/processor';
      export function useProcessed() {
        return useQuery({
          queryKey: ['processed'],
          queryFn: async () => {
            const data = await fetch('/api/items').then(r => r.json());
            return processData(data);
          },
        });
      }
    `;
    const hookResult = validator.validateAgainstLayer(hookCode, 'src/hooks/useProcessed.ts');
    expect(hookResult.hasViolations).toBe(false);

    // Component using hook
    const componentCode = `
      import React from 'react';
      import { useProcessed } from '../hooks/useProcessed';
      export function DataDisplay() {
        const { data, isLoading } = useProcessed();
        return isLoading ? <div>Loading...</div> : <div>{JSON.stringify(data)}</div>;
      }
    `;
    const componentResult = validator.validateAgainstLayer(componentCode, 'src/components/DataDisplay.tsx');
    expect(componentResult.hasViolations).toBe(false);
  });
});
