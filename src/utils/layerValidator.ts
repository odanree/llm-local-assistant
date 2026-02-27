/**
 * Pure layer validation utilities
 * Validates code against architectural layer rules
 * Only imports from types/, no service classes
 */

/**
 * Layer rules definition exported for reuse
 */
export const LAYER_RULES: Record<string, {
  forbiddenImports: string[];
  allowedImportPatterns: string[];
  allowedExportPatterns: string[];
  rule: string;
}> = {
  'services/': {
    forbiddenImports: [
      'react', 'react-dom', '@tanstack/react-query', 'zustand', 'redux',
      'react-router', 'react-router-dom', 'recoil', 'jotai', 'valtio',
    ],
    allowedImportPatterns: [
      'types/', 'utils/', 'config/', 'constants/', 'lodash', 'axios', 'fetch', 'date-fns', 'zod',
    ],
    allowedExportPatterns: [
      'export const', 'export function', 'export interface', 'export type',
    ],
    rule: 'Services are pure, testable functions. No React, hooks, or state management.',
  },

  'hooks/': {
    forbiddenImports: ['react-dom', 'react-router-dom', 'redux'],
    allowedImportPatterns: [
      'react', '@tanstack/react-query', 'zustand', 'services/',
      'types/', 'utils/', 'config/',
    ],
    allowedExportPatterns: [
      'export const use', 'export function use', 'export type', 'export interface',
    ],
    rule: 'Custom hooks for state, data fetching, side effects. Must export use* functions.',
  },

  'components/': {
    forbiddenImports: [],
    allowedImportPatterns: [
      'react', 'react-dom', 'hooks/', 'services/', 'types/', 'utils/',
      'config/', 'components/',
    ],
    allowedExportPatterns: [
      'export function', 'export const', 'export type', 'export interface',
    ],
    rule: 'React components. Use hooks, services, and other components freely.',
  },

  'types/': {
    forbiddenImports: [
      'react', 'react-dom', 'services/', 'hooks/', 'components/', 'utils/',
      '@tanstack/react-query', 'zustand', 'redux',
    ],
    allowedImportPatterns: ['zod', 'types/', 'config/'],
    allowedExportPatterns: [
      'export type', 'export interface', 'export enum', 'export const',
    ],
    rule: 'Type definitions only. No runtime code, no dependencies.',
  },

  'utils/': {
    forbiddenImports: [
      'react', 'react-dom', '@tanstack/react-query', 'zustand',
      'redux', 'react-router',
    ],
    allowedImportPatterns: [
      'types/', 'lodash', 'date-fns', 'zod', 'config/', 'constants/',
    ],
    allowedExportPatterns: [
      'export const', 'export function', 'export type', 'export interface',
    ],
    rule: 'Pure utility functions. No React or state management.',
  },
};

/**
 * Classify file into a layer based on path
 * Pure function: path-based classification
 */
export function classifyLayerPure(filePath: string): string {
  for (const layer of Object.keys(LAYER_RULES)) {
    if (filePath.includes(layer)) {
      return layer;
    }
  }
  return 'unknown/';
}

/**
 * Extract imports from code
 * Pure function: regex-based import extraction
 */
export function extractImportsPure(code: string): string[] {
  const imports: string[] = [];

  // Match: import { x } from 'module'
  const namedImportPattern = /import\s*{\s*[^}]*?\s*}\s*from\s*['"](.*?)['"]/gm;
  let match;
  while ((match = namedImportPattern.exec(code)) !== null) {
    imports.push(match[1]);
  }

  // Match: import x from 'module'
  const defaultImportPattern = /import\s+\w+\s+from\s+['"](.*?)['"]/gm;
  while ((match = defaultImportPattern.exec(code)) !== null) {
    imports.push(match[1]);
  }

  // Match: import 'module' (side effects)
  const sideEffectPattern = /import\s+['"](.*?)['"]/gm;
  while ((match = sideEffectPattern.exec(code)) !== null) {
    if (!imports.includes(match[1])) {
      imports.push(match[1]);
    }
  }

  return Array.from(new Set(imports)); // Remove duplicates
}

/**
 * Check if import is allowed for a layer
 * Pure function: import validation against layer rules
 */
export function isImportAllowedPure(
  importModule: string,
  forbiddenImports: string[],
  allowedPatterns: string[]
): boolean {
  // Check forbidden list first
  for (const forbidden of forbiddenImports) {
    if (importModule.includes(forbidden)) {
      return false;
    }
  }

  // Check allowed list
  for (const allowed of allowedPatterns) {
    if (importModule.includes(allowed)) {
      return true;
    }
  }

  // Common allowed libraries
  const commonAllowedLibraries = [
    'lodash', 'date-fns', 'axios', 'zod', '@tanstack', 'react', 'classnames',
  ];
  for (const lib of commonAllowedLibraries) {
    if (importModule.includes(lib)) {
      return true;
    }
  }

  return false;
}

/**
 * Validate layer imports
 * Pure function: check all imports against layer rules
 */
export function validateLayerImportsPure(
  imports: string[],
  layer: string
): { forbidden: string[]; allowed: string[] } {
  const rule = LAYER_RULES[layer];
  if (!rule) {
    return { forbidden: [], allowed: imports };
  }

  const forbidden: string[] = [];
  const allowed: string[] = [];

  imports.forEach(imp => {
    if (isImportAllowedPure(imp, rule.forbiddenImports, rule.allowedImportPatterns)) {
      allowed.push(imp);
    } else {
      forbidden.push(imp);
    }
  });

  return { forbidden, allowed };
}

/**
 * Detect forbidden imports in code
 * Pure function: find imports that violate layer rules
 */
export function detectForbiddenImportsPure(
  content: string,
  forbiddenList: string[]
): Array<{ import: string; line: number }> {
  const violations: Array<{ import: string; line: number }> = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    forbiddenList.forEach(forbidden => {
      if (line.includes(`from '${forbidden}'`) || line.includes(`from "${forbidden}"`)) {
        // Extract the full import statement
        const importMatch = line.match(/import\s+(?:{[^}]+}|[\w\s,*]+)\s+from\s+['"]([^'"]+)['"]/);
        if (importMatch) {
          violations.push({
            import: importMatch[1],
            line: index + 1,
          });
        }
      }
    });
  });

  return violations;
}

/**
 * Validate export patterns for a layer
 * Pure function: check exports match layer requirements
 */
export function validateLayerPatternsPure(
  content: string,
  layer: string
): Array<{ type: string; found: boolean; details: string }> {
  const rule = LAYER_RULES[layer];
  if (!rule) {
    return [];
  }

  const violations: Array<{ type: string; found: boolean; details: string }> = [];

  // Check allowed export patterns
  const hasValidExport = rule.allowedExportPatterns.some(pattern =>
    content.includes(pattern)
  );

  violations.push({
    type: 'exportPattern',
    found: hasValidExport,
    details: hasValidExport ? 'Valid exports found' : 'No valid exports found',
  });

  return violations;
}

/**
 * Build violation details string
 * Pure function: format violations for display
 */
export function buildViolationDetailsPure(
  violations: Array<{ type: string; message: string }>
): string {
  return violations
    .map(v => `${v.type}: ${v.message}`)
    .join('\n');
}
