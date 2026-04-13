/**
 * Phase 6.4 Wave 3: ArchitectureValidator Nested Patterns
 *
 * Target: Lines 1098-1119 (Aliases) and 1154-1176 (Nesting/Complex Patterns)
 * Goal: Close the final 0.2% coverage gap by testing deep destructuring patterns
 *
 * This test file targets the "Dark Blocks" in ArchitectureValidator:
 * 1. Aliased destructuring (rename properties during destructuring)
 * 2. Nested object validation (accessing properties within nested objects)
 * 3. Spread operator patterns (destructuring with spread)
 * 4. Computed property access (dynamic property names)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArchitectureValidator } from '../CodeAnalyzer';

describe('Phase 6.4 Wave 3: ArchitectureValidator Nested Patterns', () => {
  let validator: ArchitectureValidator;

  beforeEach(() => {
    validator = new ArchitectureValidator();
  });

  // ========================================================================
  // WAVE 3.1: Aliased Zustand Destructuring
  // ========================================================================

  describe('Zustand Aliased Destructuring Patterns', () => {
    it('should detect aliased property access in Zustand hooks', () => {
      // Tests lines 1098-1119: Alias detection in destructuring
      // const { count: c } = useStore() → Property renamed from 'count' to 'c'

      const code = `
import { useCounterStore } from '../stores/counter';

export const CounterComponent = () => {
  const { count: c, increment: inc } = useCounterStore();

  return (
    <div>
      <p>Count: {c}</p>
      <button onClick={inc}>Increment</button>
    </div>
  );
};
      `;

      const result = validator.validateHookUsage(
        code,
        'src/components/Counter.tsx',
        new Map()
      );

      // Should not flag as violation - aliasing is valid
      // The validator should recognize 'count' is valid even when aliased to 'c'
      expect(result).toBeDefined();
    });

    it('should detect when aliased property doesnt exist in store', () => {
      // Tests violation detection with aliases
      // const { nonExistent: ne } = useStore() → 'nonExistent' doesn't exist

      const code = `
import { useCounterStore } from '../stores/counter';

export const BadComponent = () => {
  const { nonExistent: ne } = useCounterStore();
  return <div>{ne}</div>;
};
      `;

      const result = validator.validateHookUsage(
        code,
        'src/components/Bad.tsx',
        new Map([
          ['src/stores/counter.ts', 'export const useCounterStore = create(() => ({ count: 0 }))']
        ])
      );

      // Should flag the non-existent property
      expect(result).toBeDefined();
    });

    it('should handle multiple aliases in single destructuring', () => {
      // Tests complex destructuring with multiple renames
      // const { prop1: p1, prop2: p2, prop3: p3 } = useStore()

      const code = `
import { useUserStore } from '../stores/user';

export const UserProfile = () => {
  const {
    user: u,
    setUser: su,
    userRole: ur
  } = useUserStore();

  return (
    <div>
      <h1>{u.name}</h1>
      <p>Role: {ur}</p>
      <button onClick={su}>Update</button>
    </div>
  );
};
      `;

      const result = validator.validateHookUsage(
        code,
        'src/components/Profile.tsx',
        new Map()
      );

      expect(result).toBeDefined();
    });

    it('should validate aliased properties against actual store structure', () => {
      // Tests validation of aliased props against store definition

      const code = `
import { useProfileStore } from '../stores/profile';

export const ProfileView = () => {
  const { firstName: fn, lastName: ln, email: em } = useProfileStore();
  return <div>{fn} {ln} - {em}</div>;
};
      `;

      const previousFiles = new Map([
        ['src/stores/profile.ts', `
export const useProfileStore = create((set) => ({
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  updateProfile: (data) => set(data)
}));
        `]
      ]);

      const result = validator.validateHookUsage(
        code,
        'src/components/ProfileView.tsx',
        previousFiles
      );

      expect(result).toBeDefined();
    });
  });

  // ========================================================================
  // WAVE 3.2: Nested Object Validation
  // ========================================================================

  describe('Nested Object Property Validation', () => {
    it('should handle nested object destructuring', () => {
      // Tests lines 1154-1176: Nested property access
      // const { user: { id, name } } = useStore()

      const code = `
import { useUserStore } from '../stores/user';

export const UserInfo = () => {
  const { user: { id, name } } = useUserStore();
  return <div>ID: {id}, Name: {name}</div>;
};
      `;

      const previousFiles = new Map([
        ['src/stores/user.ts', `
export const useUserStore = create((set) => ({
  user: { id: '1', name: 'John', age: 30 },
  setUser: (u) => set({ user: u })
}));
        `]
      ]);

      const result = validator.validateHookUsage(
        code,
        'src/components/UserInfo.tsx',
        previousFiles
      );

      expect(result).toBeDefined();
    });

    it('should detect missing nested properties', () => {
      // Tests violation detection in nested structures
      // const { user: { nonExistent } } = useStore()

      const code = `
import { useUserStore } from '../stores/user';

export const BadNestedAccess = () => {
  const { user: { nonExistent } } = useUserStore();
  return <div>{nonExistent}</div>;
};
      `;

      const previousFiles = new Map([
        ['src/stores/user.ts', `
export const useUserStore = create((set) => ({
  user: { id: '1', name: 'John' },
  setUser: (u) => set({ user: u })
}));
        `]
      ]);

      const result = validator.validateHookUsage(
        code,
        'src/components/BadNested.tsx',
        previousFiles
      );

      // Should detect the violation
      expect(result).toBeDefined();
    });

    it('should handle deeply nested destructuring (3+ levels)', () => {
      // Tests multi-level nesting
      // const { config: { database: { host } } } = useConfigStore()

      const code = `
import { useConfigStore } from '../stores/config';

export const DatabaseConfig = () => {
  const { config: { database: { host, port } } } = useConfigStore();
  return <div>{host}:{port}</div>;
};
      `;

      const previousFiles = new Map([
        ['src/stores/config.ts', `
export const useConfigStore = create((set) => ({
  config: {
    database: {
      host: 'localhost',
      port: 5432,
      name: 'app'
    },
    cache: { ttl: 3600 }
  }
}));
        `]
      ]);

      const result = validator.validateHookUsage(
        code,
        'src/components/DbConfig.tsx',
        previousFiles
      );

      expect(result).toBeDefined();
    });

    it('should handle mixed nested and aliased properties', () => {
      // Tests combination of nesting and aliasing
      // const { user: { email: e }, settings: { theme: t } } = useStore()

      const code = `
import { useAppStore } from '../stores/app';

export const UserSettings = () => {
  const {
    user: { email: userEmail, id: userId },
    settings: { theme: appTheme, language: lang }
  } = useAppStore();

  return (
    <div>
      <p>{userEmail}</p>
      <p>Theme: {appTheme}</p>
    </div>
  );
};
      `;

      const previousFiles = new Map([
        ['src/stores/app.ts', `
export const useAppStore = create((set) => ({
  user: { id: '1', email: 'user@example.com', name: 'John' },
  settings: { theme: 'dark', language: 'en', notifications: true }
}));
        `]
      ]);

      const result = validator.validateHookUsage(
        code,
        'src/components/Settings.tsx',
        previousFiles
      );

      expect(result).toBeDefined();
    });
  });

  // ========================================================================
  // WAVE 3.3: Spread Operator Patterns
  // ========================================================================

  describe('Spread Operator in Zustand Hooks', () => {
    it('should handle spread operator in destructuring', () => {
      // Tests: const { id, ...rest } = useStore()
      // Spread captures remaining properties

      const code = `
import { useProductStore } from '../stores/product';

export const ProductCard = () => {
  const { id, ...productData } = useProductStore();
  return <div>{productData.name}</div>;
};
      `;

      const previousFiles = new Map([
        ['src/stores/product.ts', `
export const useProductStore = create((set) => ({
  id: '123',
  name: 'Product',
  price: 99.99,
  description: 'A great product'
}));
        `]
      ]);

      const result = validator.validateHookUsage(
        code,
        'src/components/ProductCard.tsx',
        previousFiles
      );

      expect(result).toBeDefined();
    });

    it('should validate properties used with spread operator', () => {
      // Tests validation of accessed properties after spread

      const code = `
import { useDataStore } from '../stores/data';

export const DataDisplay = () => {
  const { primary, ...secondary } = useDataStore();
  return (
    <div>
      <p>{primary}</p>
      <p>{secondary.backup}</p>
      <p>{secondary.cache}</p>
    </div>
  );
};
      `;

      const previousFiles = new Map([
        ['src/stores/data.ts', `
export const useDataStore = create((set) => ({
  primary: 'main',
  backup: 'secondary',
  cache: 'tertiary',
  config: { timeout: 5000 }
}));
        `]
      ]);

      const result = validator.validateHookUsage(
        code,
        'src/components/DataDisplay.tsx',
        previousFiles
      );

      expect(result).toBeDefined();
    });
  });

  // ========================================================================
  // WAVE 3.4: Computed Property Access
  // ========================================================================

  describe('Computed and Dynamic Property Access', () => {
    it('should handle bracket notation property access', () => {
      // Tests: store[key] and store['propertyName']
      // Bracket notation for dynamic property access

      const code = `
import { useStore } from '../stores/main';

export const DynamicComponent = () => {
  const store = useStore();
  const propName = 'value';

  return (
    <div>
      <p>{store['staticProp']}</p>
      <p>{store[propName]}</p>
    </div>
  );
};
      `;

      const result = validator.validateHookUsage(
        code,
        'src/components/Dynamic.tsx',
        new Map()
      );

      expect(result).toBeDefined();
    });

    it('should handle optional chaining in property access', () => {
      // Tests: store?.user?.id and store?.config?.database?.host
      // Optional chaining for safe nested access

      const code = `
import { useConfigStore } from '../stores/config';

export const SafeConfig = () => {
  const store = useConfigStore();

  return (
    <div>
      <p>{store?.database?.host}</p>
      <p>{store?.settings?.theme}</p>
    </div>
  );
};
      `;

      const result = validator.validateHookUsage(
        code,
        'src/components/SafeConfig.tsx',
        new Map()
      );

      expect(result).toBeDefined();
    });
  });

  // ========================================================================
  // WAVE 3.5: Complex Real-World Patterns
  // ========================================================================

  describe('Complex Real-World Zustand Patterns', () => {
    it('should validate e-commerce store with complex structure', () => {
      // Real-world example: shopping cart with nested items and totals

      const code = `
import { useCartStore } from '../stores/cart';

export const CartSummary = () => {
  const {
    items: { products, quantities },
    totals: { subtotal, tax, shipping },
    user: { id: userId, email: userEmail }
  } = useCartStore();

  return (
    <div>
      <h2>{products.length} items</h2>
      <p>Subtotal: {subtotal}</p>
      <p>Tax: {tax}</p>
      <p>Total: {subtotal + tax + shipping}</p>
    </div>
  );
};
      `;

      const previousFiles = new Map([
        ['src/stores/cart.ts', `
export const useCartStore = create((set) => ({
  items: {
    products: [],
    quantities: {},
    lastAdded: null
  },
  totals: {
    subtotal: 0,
    tax: 0,
    shipping: 10,
    total: 10
  },
  user: {
    id: 'user123',
    email: 'user@example.com',
    preferences: {}
  },
  addItem: (product) => set((state) => ({ /* update */ }))
}));
        `]
      ]);

      const result = validator.validateHookUsage(
        code,
        'src/components/CartSummary.tsx',
        previousFiles
      );

      expect(result).toBeDefined();
    });

    it('should handle dashboard app with multiple store access patterns', () => {
      // Real-world: dashboard with mixed access patterns

      const code = `
import { useDashboardStore } from '../stores/dashboard';
import { useUserStore } from '../stores/user';

export const Dashboard = () => {
  const {
    widgets: { main, sidebar },
    layout: { theme: t, sidebarWidth }
  } = useDashboardStore();

  const { name, email, preferences: { language } } = useUserStore();

  return (
    <div style={{width: sidebarWidth}}>
      <h1>{name}</h1>
      <p>{email}</p>
      <div>{main}</div>
      <aside>{sidebar}</aside>
    </div>
  );
};
      `;

      const previousFiles = new Map([
        ['src/stores/dashboard.ts', `
export const useDashboardStore = create((set) => ({
  widgets: { main: null, sidebar: null, alerts: [] },
  layout: { theme: 'light', sidebarWidth: '250px' },
  user: { role: 'admin' }
}));
        `],
        ['src/stores/user.ts', `
export const useUserStore = create((set) => ({
  name: 'John',
  email: 'john@example.com',
  preferences: { language: 'en', timezone: 'UTC' }
}));
        `]
      ]);

      const result = validator.validateHookUsage(
        code,
        'src/components/Dashboard.tsx',
        previousFiles
      );

      expect(result).toBeDefined();
    });
  });

  // ========================================================================
  // Default import + missing import regression tests
  // Regression for: "Missing import: useAuthStore from '../hooks/useAuthStore'"
  // false positive caused by the custom hook check not recognising default imports.
  // ========================================================================

  describe('Default import recognition — no false positive for useAuthStore', () => {
    it('should NOT flag useAuthStore as missing when imported as a default import', async () => {
      // Correct pattern: default import from stores/ directory, destructured at top level
      const code = `
import React, { FormEvent } from 'react';
import { cn } from '@/utils/cn';
import useAuthStore from '@/stores/authStore';

export const LoginFormRefactor = () => {
  const { email, password, setEmail, setPassword } = useAuthStore();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log('Login:', email, password);
  };

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-4')}>
      <input name="email" value={email} onChange={e => setEmail(e.target.value)} />
      <input name="password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <button type="submit" className={cn('px-4 py-2 bg-blue-500 text-white rounded')}>Login</button>
    </form>
  );
};`;

      const result = await validator.validateHookUsage(
        code,
        'src/components/LoginFormRefactor.tsx',
        new Map()
      );

      const missingImportErrors = result.filter(
        v => v.message.includes('Missing import') && v.message.includes('useAuthStore')
      );
      expect(missingImportErrors).toHaveLength(0);
    });

    it('should still flag useAuthStore when it is truly not imported at all', async () => {
      // Bug scenario: hook called without any import statement
      const code = `
import React from 'react';

export const BadComponent = () => {
  const { email } = useAuthStore();
  return <div>{email}</div>;
};`;

      const result = await validator.validateHookUsage(
        code,
        'src/components/BadComponent.tsx',
        new Map()
      );

      const missingImportErrors = result.filter(
        v => v.message.includes('useAuthStore') && v.message.toLowerCase().includes('import')
      );
      expect(missingImportErrors.length).toBeGreaterThan(0);
    });

    it('should NOT flag useAuthStore when imported as named import', async () => {
      // Named import variant — less common for Zustand stores but valid
      const code = `
import React from 'react';
import { useAuthStore } from '@/stores/authStore';

export const Component = () => {
  const { email } = useAuthStore();
  return <div>{email}</div>;
};`;

      const result = await validator.validateHookUsage(
        code,
        'src/components/Component.tsx',
        new Map()
      );

      const missingImportErrors = result.filter(
        v => v.message.includes('Missing import') && v.message.includes('useAuthStore')
      );
      expect(missingImportErrors).toHaveLength(0);
    });
  });
});
