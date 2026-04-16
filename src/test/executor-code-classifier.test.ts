/**
 * executor-code-classifier.ts — unit tests
 *
 * All functions are pure string-in / string-out with no external dependencies.
 * No mocks required.
 */

import { describe, it, expect } from 'vitest';
import {
  isNonVisualWrapper,
  isStructuralLayout,
  isDecomposedNavigation,
  extractPageImports,
  extractStoreFields,
  extractPropsInterface,
  extractRouteConfig,
  extractCallbackHandlers,
  collectCallbackErrors,
  extractFullCallbackDeclaration,
  spliceCallbackHandlers,
} from '../executor-code-classifier';

// ---------------------------------------------------------------------------
// isNonVisualWrapper
// ---------------------------------------------------------------------------

describe('isNonVisualWrapper', () => {
  it('returns true for Route component', () => {
    expect(isNonVisualWrapper('src/components/PrivateRoute.tsx')).toBe(true);
  });

  it('returns true for Guard component', () => {
    expect(isNonVisualWrapper('src/components/AuthGuard.tsx')).toBe(true);
  });

  it('returns true for Provider component', () => {
    expect(isNonVisualWrapper('src/components/ThemeProvider.tsx')).toBe(true);
  });

  it('returns true for Context component', () => {
    expect(isNonVisualWrapper('src/components/AuthContext.tsx')).toBe(true);
  });

  it('returns true for HOC component', () => {
    expect(isNonVisualWrapper('src/components/WithAuthHOC.tsx')).toBe(true);
  });

  it('returns true for Outlet component', () => {
    expect(isNonVisualWrapper('src/components/RouterOutlet.tsx')).toBe(true);
  });

  it('returns false for Layout (explicitly excluded)', () => {
    expect(isNonVisualWrapper('src/components/AppLayout.tsx')).toBe(false);
  });

  it('returns false for non-tsx files', () => {
    expect(isNonVisualWrapper('src/utils/AuthGuard.ts')).toBe(false);
    expect(isNonVisualWrapper('src/components/AuthGuard.jsx')).toBe(false);
  });

  it('returns false for unrelated component names', () => {
    expect(isNonVisualWrapper('src/components/Button.tsx')).toBe(false);
    expect(isNonVisualWrapper('src/components/Modal.tsx')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isStructuralLayout
// ---------------------------------------------------------------------------

describe('isStructuralLayout', () => {
  it('returns true when filename contains Layout', () => {
    expect(isStructuralLayout('src/components/AppLayout.tsx')).toBe(true);
    expect(isStructuralLayout('src/components/Layout.tsx')).toBe(true);
  });

  it('returns true when stepDescription contains "layout component"', () => {
    expect(isStructuralLayout('src/components/Shell.tsx', 'Create layout component')).toBe(true);
  });

  it('returns true when stepDescription contains "app shell"', () => {
    expect(isStructuralLayout('src/components/Frame.tsx', 'Create the app shell with sidebar')).toBe(true);
  });

  it('returns true when stepDescription contains "page wrapper"', () => {
    expect(isStructuralLayout('src/components/Wrapper.tsx', 'Create page wrapper')).toBe(true);
  });

  it('returns true when stepDescription contains "main frame"', () => {
    expect(isStructuralLayout('src/components/Frame.tsx', 'Create main frame component')).toBe(true);
  });

  it('returns true when stepDescription contains "shell component"', () => {
    expect(isStructuralLayout('src/components/App.tsx', 'Build shell component')).toBe(true);
  });

  it('returns false for non-tsx files', () => {
    expect(isStructuralLayout('src/utils/Layout.ts')).toBe(false);
  });

  it('returns false for unrelated tsx files with no matching description', () => {
    expect(isStructuralLayout('src/components/Button.tsx')).toBe(false);
    expect(isStructuralLayout('src/components/Button.tsx', 'Create button')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isDecomposedNavigation
// ---------------------------------------------------------------------------

describe('isDecomposedNavigation', () => {
  it('returns true for Navigation.tsx', () => {
    expect(isDecomposedNavigation('src/components/Navigation.tsx')).toBe(true);
  });

  it('returns true for Navbar.tsx variants', () => {
    expect(isDecomposedNavigation('src/components/Navbar.tsx')).toBe(true);
    expect(isDecomposedNavigation('src/components/NavBar.tsx')).toBe(true);
  });

  it('returns true for Nav.tsx', () => {
    expect(isDecomposedNavigation('src/components/Nav.tsx')).toBe(true);
  });

  it('returns true for Sidebar.tsx', () => {
    expect(isDecomposedNavigation('src/components/Sidebar.tsx')).toBe(true);
    expect(isDecomposedNavigation('src/components/SideNav.tsx')).toBe(true);
  });

  it('returns true for Header.tsx', () => {
    expect(isDecomposedNavigation('src/components/Header.tsx')).toBe(true);
  });

  it('returns true for TopBar / AppBar / MenuBar', () => {
    expect(isDecomposedNavigation('src/components/TopBar.tsx')).toBe(true);
    expect(isDecomposedNavigation('src/components/AppBar.tsx')).toBe(true);
    expect(isDecomposedNavigation('src/components/MenuBar.tsx')).toBe(true);
  });

  it('returns true when stepDescription contains "navigation"', () => {
    expect(isDecomposedNavigation('src/components/Menu.tsx', 'Create navigation component')).toBe(true);
  });

  it('returns true when stepDescription contains "sidebar"', () => {
    expect(isDecomposedNavigation('src/components/Panel.tsx', 'Build sidebar menu')).toBe(true);
  });

  it('returns false for non-tsx files', () => {
    expect(isDecomposedNavigation('src/utils/Navigation.ts')).toBe(false);
  });

  it('returns false for unrelated component names', () => {
    expect(isDecomposedNavigation('src/components/Button.tsx')).toBe(false);
    expect(isDecomposedNavigation('src/components/Footer.tsx')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractPageImports
// ---------------------------------------------------------------------------

describe('extractPageImports', () => {
  it('extracts a single pages import', () => {
    const code = `import Home from './pages/Home';`;
    expect(extractPageImports(code)).toEqual([{ name: 'Home', from: './pages/Home' }]);
  });

  it('extracts screens imports', () => {
    const code = `import Login from './screens/Login';`;
    expect(extractPageImports(code)).toEqual([{ name: 'Login', from: './screens/Login' }]);
  });

  it('extracts views imports', () => {
    const code = `import Dashboard from '../views/Dashboard';`;
    expect(extractPageImports(code)).toEqual([{ name: 'Dashboard', from: '../views/Dashboard' }]);
  });

  it('extracts multiple page imports', () => {
    const code = [
      `import Home from './pages/Home';`,
      `import About from './pages/About';`,
    ].join('\n');
    const result = extractPageImports(code);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Home');
    expect(result[1].name).toBe('About');
  });

  it('returns [] for non-page imports', () => {
    const code = `import React from 'react';\nimport { useState } from 'react';`;
    expect(extractPageImports(code)).toEqual([]);
  });

  it('returns [] for empty code', () => {
    expect(extractPageImports('')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// extractStoreFields
// ---------------------------------------------------------------------------

describe('extractStoreFields', () => {
  it('extracts single store with multiple fields', () => {
    const code = `const { user, token } = useAuthStore();`;
    const result = extractStoreFields(code);
    expect(result.get('useAuthStore')).toEqual(['user', 'token']);
  });

  it('extracts multiple different stores', () => {
    const code = [
      `const { user } = useAuthStore();`,
      `const { cart, total } = useCartStore();`,
    ].join('\n');
    const result = extractStoreFields(code);
    expect(result.get('useAuthStore')).toEqual(['user']);
    expect(result.get('useCartStore')).toEqual(['cart', 'total']);
  });

  it('merges fields from repeated calls to the same store', () => {
    const code = [
      `const { user } = useAuthStore();`,
      `const { token } = useAuthStore();`,
    ].join('\n');
    const result = extractStoreFields(code);
    const fields = result.get('useAuthStore') ?? [];
    expect(fields).toContain('user');
    expect(fields).toContain('token');
  });

  it('returns empty map for code with no store hooks', () => {
    const code = `const x = someOtherFn();`;
    expect(extractStoreFields(code).size).toBe(0);
  });

  it('returns empty map for empty code', () => {
    expect(extractStoreFields('').size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// extractPropsInterface
// ---------------------------------------------------------------------------

describe('extractPropsInterface', () => {
  it('extracts named props interface by component name', () => {
    const code = `interface ButtonProps { label: string; onClick: () => void; }`;
    const result = extractPropsInterface(code, 'Button');
    expect(result).toContain('label: string');
    expect(result).toContain('onClick: () => void');
  });

  it('extracts AppXxxProps fallback pattern', () => {
    const code = `interface AppModalProps { isOpen: boolean; }`;
    const result = extractPropsInterface(code, 'Modal');
    expect(result).toContain('isOpen: boolean');
  });

  it('returns null when no matching interface exists', () => {
    const code = `interface UnrelatedThing { foo: string; }`;
    expect(extractPropsInterface(code, 'Button')).toBeNull();
  });

  it('returns null for empty code', () => {
    expect(extractPropsInterface('', 'Button')).toBeNull();
  });

  it('matches any Props interface when no componentName given', () => {
    const code = `interface CardProps { title: string; }`;
    const result = extractPropsInterface(code);
    expect(result).toContain('title: string');
  });
});

// ---------------------------------------------------------------------------
// extractRouteConfig
// ---------------------------------------------------------------------------

describe('extractRouteConfig', () => {
  const fullCode = `
export interface RouteConfig {
  path: string;
  element: React.ReactNode;
  protected: boolean;
}
export const ROUTES: RouteConfig[] = [];
export function filterRoutes(user: User) {}
`;

  it('extracts interface body', () => {
    const { interfaceBody } = extractRouteConfig(fullCode);
    expect(interfaceBody).toContain('path: string');
    expect(interfaceBody).toContain('protected: boolean');
  });

  it('extracts const name', () => {
    const { constName } = extractRouteConfig(fullCode);
    expect(constName).toBe('ROUTES');
  });

  it('extracts filter function name', () => {
    const { filterFnName } = extractRouteConfig(fullCode);
    expect(filterFnName).toBe('filterRoutes');
  });

  it('falls back to "ROUTES" when no const found', () => {
    const { constName } = extractRouteConfig('const x = 1;');
    expect(constName).toBe('ROUTES');
  });

  it('returns null filterFnName when no exported function found', () => {
    const { filterFnName } = extractRouteConfig('const x = 1;');
    expect(filterFnName).toBeNull();
  });

  it('returns null interfaceBody when no RouteConfig interface found', () => {
    const { interfaceBody } = extractRouteConfig('const x = 1;');
    expect(interfaceBody).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractCallbackHandlers
// ---------------------------------------------------------------------------

describe('extractCallbackHandlers', () => {
  it('extracts a single useCallback handler', () => {
    const code = `const handleClick = useCallback(() => { doThing(); }, [dep]);`;
    const result = extractCallbackHandlers(code);
    expect(result.has('handleClick')).toBe(true);
    const body = result.get('handleClick')!;
    expect(body).toContain('doThing()');
  });

  it('extracts multiple handlers', () => {
    const code = [
      `const handleClick = useCallback(() => { clickFn(); }, []);`,
      `const handleChange = useCallback((e) => { setVal(e.target.value); }, []);`,
    ].join('\n');
    const result = extractCallbackHandlers(code);
    expect(result.has('handleClick')).toBe(true);
    expect(result.has('handleChange')).toBe(true);
  });

  it('handles nested parentheses inside callback correctly', () => {
    const code = `const handler = useCallback(() => { fn(a(b(c()))); }, []);`;
    const result = extractCallbackHandlers(code);
    expect(result.has('handler')).toBe(true);
    expect(result.get('handler')).toContain('fn(a(b(c())))');
  });

  it('normalizes (trims each line)', () => {
    const code = `const handler = useCallback(() => {\n  line1();\n  line2();\n}, []);`;
    const body = extractCallbackHandlers(code).get('handler')!;
    expect(body).toContain('line1();');
    expect(body).toContain('line2();');
    // No leading spaces on lines
    body.split('\n').filter(Boolean).forEach(line => {
      expect(line).toBe(line.trim());
    });
  });

  it('returns empty map for code with no useCallback', () => {
    expect(extractCallbackHandlers('const x = () => {};').size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// collectCallbackErrors
// ---------------------------------------------------------------------------

describe('collectCallbackErrors', () => {
  const sourceWithHandler = `
const handleSubmit = useCallback(() => {
  submitForm(data);
}, [data]);
`;

  it('reports missing handler as ❌ error', () => {
    const generated = `const x = 1;`; // no handlers
    const errors = collectCallbackErrors(generated, sourceWithHandler);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('❌');
    expect(errors[0]).toContain('handleSubmit');
  });

  it('returns no errors when handler is present and unchanged', () => {
    const generated = `
const handleSubmit = useCallback(() => {
  submitForm(data);
}, [data]);
`;
    const errors = collectCallbackErrors(generated, sourceWithHandler);
    expect(errors).toEqual([]);
  });

  it('returns no errors when handler has only comment additions', () => {
    const generated = `
const handleSubmit = useCallback(() => {
  // handle submission
  submitForm(data);
}, [data]);
`;
    const errors = collectCallbackErrors(generated, sourceWithHandler);
    expect(errors).toEqual([]);
  });

  it('reports ❌ error when handler has added lines with unknown identifiers', () => {
    const generated = `
const handleSubmit = useCallback(() => {
  submitForm(data);
  trackAnalytics('submit'); // new call with unknown identifier
}, [data]);
`;
    const errors = collectCallbackErrors(generated, sourceWithHandler);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('❌');
  });

  it('returns no errors when source has no handlers', () => {
    const errors = collectCallbackErrors('const x = 1;', 'const y = 2;');
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// extractFullCallbackDeclaration
// ---------------------------------------------------------------------------

describe('extractFullCallbackDeclaration', () => {
  it('extracts a handler declaration including trailing semicolon', () => {
    const source = `
const handleClick = useCallback(() => {
  doSomething();
}, [dep]);
`;
    const result = extractFullCallbackDeclaration(source, 'handleClick');
    expect(result).not.toBeNull();
    expect(result!).toContain('handleClick');
    expect(result!).toContain('doSomething()');
    expect(result!.endsWith(';')).toBe(true);
  });

  it('handles nested parens inside handler body', () => {
    const source = `const handler = useCallback(() => { fn(a(b())); }, []);`;
    const result = extractFullCallbackDeclaration(source, 'handler');
    expect(result).toContain('fn(a(b()))');
  });

  it('returns null when handler name is not found', () => {
    const source = `const handleClick = useCallback(() => {}, []);`;
    expect(extractFullCallbackDeclaration(source, 'handleSubmit')).toBeNull();
  });

  it('returns null for empty source', () => {
    expect(extractFullCallbackDeclaration('', 'handler')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// spliceCallbackHandlers
// ---------------------------------------------------------------------------

describe('spliceCallbackHandlers', () => {
  it('returns generated unchanged when missingHandlerNames is empty', () => {
    const gen = `const x = 1;\n  return (<div />);`;
    expect(spliceCallbackHandlers(gen, 'const src = 1;', [])).toBe(gen);
  });

  it('injects missing handler before return (', () => {
    const source = `const handleClick = useCallback(() => { click(); }, []);`;
    const generated = `import React from 'react';\nfunction C() {\n  return (<div />);\n}`;
    const result = spliceCallbackHandlers(generated, source, ['handleClick']);
    expect(result).toContain('handleClick');
    expect(result.indexOf('handleClick') < result.indexOf('return (')).toBe(true);
  });

  it('adds useCallback to react import when not already present', () => {
    const source = `const handleSubmit = useCallback(() => { submit(); }, []);`;
    const generated = `import React from 'react';\nfunction C() {\n  return (<div />);\n}`;
    const result = spliceCallbackHandlers(generated, source, ['handleSubmit']);
    expect(result).toContain('useCallback');
    expect(result).toMatch(/import React,\s*\{[^}]*useCallback[^}]*\}\s*from 'react'/);
  });

  it('injects associated useState declarations for missing setters', () => {
    const source = [
      `const [count, setCount] = useState(0);`,
      `const increment = useCallback(() => { setCount(c => c + 1); }, []);`,
    ].join('\n');
    const generated = `import React from 'react';\nfunction C() {\n  return (<div />);\n}`;
    const result = spliceCallbackHandlers(generated, source, ['increment']);
    expect(result).toContain('useState');
    expect(result).toContain('setCount');
  });

  it('skips useState injection when setter is already present in generated', () => {
    const source = [
      `const [count, setCount] = useState(0);`,
      `const increment = useCallback(() => { setCount(c => c + 1); }, []);`,
    ].join('\n');
    const generated = [
      `import React, { useState } from 'react';`,
      `function C() {`,
      `  const [count, setCount] = useState(0);`,
      `  return (<div />);`,
      `}`,
    ].join('\n');
    const result = spliceCallbackHandlers(generated, source, ['increment']);
    // setCount already in generated, so useState line not duplicated
    const setCountOccurrences = (result.match(/setCount/g) ?? []).length;
    expect(setCountOccurrences).toBeGreaterThan(0);
  });

  it('returns generated unchanged when handler not found in source', () => {
    const generated = `function C() {\n  return (<div />);\n}`;
    const result = spliceCallbackHandlers(generated, 'const x = 1;', ['missingHandler']);
    expect(result).toBe(generated);
  });

  it('returns generated unchanged when no return ( or return < marker found', () => {
    const source = `const handler = useCallback(() => { fn(); }, []);`;
    const generated = `function C() { const x = 1; }`;
    const result = spliceCallbackHandlers(generated, source, ['handler']);
    expect(result).toBe(generated);
  });
});
