/**
 * PathSanitizer Tests - Hit #1: Quick Win Coverage
 *
 * Goal: Push pathSanitizer.ts from 14.7% → 90%+
 * Effort: 20 minutes
 * Expected Impact: +1-2% overall coverage
 */

import { describe, it, expect } from 'vitest';
import { PathSanitizer } from './pathSanitizer';
import { ViolationCodes } from '../types/validation';

describe('PathSanitizer', () => {
  // Valid paths
  it('accepts src/ paths', () => {
    const result = PathSanitizer.validatePath('src/file.tsx');
    expect(result.success).toBe(true);
  });

  it('accepts app/ paths', () => {
    const result = PathSanitizer.validatePath('app/layout.tsx');
    expect(result.success).toBe(true);
  });

  it('accepts pages/ paths', () => {
    const result = PathSanitizer.validatePath('pages/index.ts');
    expect(result.success).toBe(true);
  });

  it('accepts ./ relative paths', () => {
    const result = PathSanitizer.validatePath('./src/file.ts');
    expect(result.success).toBe(true);
  });

  it('accepts ../ relative paths', () => {
    const result = PathSanitizer.validatePath('../utils/file.ts');
    expect(result.success).toBe(true);
  });

  it('accepts single file paths', () => {
    const result = PathSanitizer.validatePath('index.ts');
    expect(result.success).toBe(true);
  });

  it('accepts various extensions', () => {
    expect(PathSanitizer.validatePath('src/file.tsx').success).toBe(true);
    expect(PathSanitizer.validatePath('src/file.ts').success).toBe(true);
    expect(PathSanitizer.validatePath('src/file.js').success).toBe(true);
    expect(PathSanitizer.validatePath('src/file.css').success).toBe(true);
    expect(PathSanitizer.validatePath('src/config.json').success).toBe(true);
  });

  it('accepts hyphenated paths', () => {
    const result = PathSanitizer.validatePath('src/my-helper/index.tsx');
    expect(result.success).toBe(true);
  });

  it('accepts paths with multiple dots', () => {
    const result = PathSanitizer.validatePath('src/index.test.ts');
    expect(result.success).toBe(true);
  });

  it('trims whitespace', () => {
    const result = PathSanitizer.validatePath('  src/file.ts  ');
    expect(result.success).toBe(true);
  });

  // Invalid paths
  it('rejects undefined', () => {
    const result = PathSanitizer.validatePath(undefined);
    expect(result.success).toBe(false);
    expect(result.violations).toContain(ViolationCodes.PATH_INVALID);
  });

  it('rejects null', () => {
    const result = PathSanitizer.validatePath(null as any);
    expect(result.success).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(PathSanitizer.validatePath(123 as any).success).toBe(false);
    expect(PathSanitizer.validatePath({} as any).success).toBe(false);
    expect(PathSanitizer.validatePath([] as any).success).toBe(false);
  });

  it('rejects empty string', () => {
    const result = PathSanitizer.validatePath('');
    expect(result.success).toBe(false);
    expect(result.summary.toLowerCase()).toMatch(/empty|missing/);
  });

  it('rejects whitespace-only string', () => {
    const result = PathSanitizer.validatePath('   ');
    expect(result.success).toBe(false);
  });

  it('rejects no extension', () => {
    const result = PathSanitizer.validatePath('src/file');
    expect(result.success).toBe(false);
    expect(result.summary).toContain('extension');
  });

  it('rejects multiple spaces', () => {
    const result = PathSanitizer.validatePath('src/this is bad.ts');
    expect(result.success).toBe(false);
    expect(result.summary).toContain('spaces');
  });

  it('rejects description patterns', () => {
    const result = PathSanitizer.validatePath('src/contains button.ts');
    expect(result.success).toBe(false);
  });

  it('rejects comma-separated files', () => {
    const result = PathSanitizer.validatePath('src/file1.ts, src/file2.ts');
    expect(result.success).toBe(false);
    expect(result.summary).toContain('multiple');
  });

  it('rejects invalid directory prefix', () => {
    const result = PathSanitizer.validatePath('invalid/file.ts');
    expect(result.success).toBe(false);
    expect(result.summary).toContain('directory');
  });

  it('rejects invalid extension', () => {
    const result = PathSanitizer.validatePath('src/file.xyz');
    expect(result.success).toBe(false);
    expect(result.summary).toContain('extension');
  });

  // Edge cases
  it('handles camelCase filenames', () => {
    const result = PathSanitizer.validatePath('src/myHelper/index.tsx');
    expect(result.success).toBe(true);
  });

  it('handles snake_case filenames', () => {
    const result = PathSanitizer.validatePath('src/my_helper/index.tsx');
    expect(result.success).toBe(true);
  });

  it('handles deeply nested paths', () => {
    const result = PathSanitizer.validatePath('src/views/sections/items/TextField/index.tsx');
    expect(result.success).toBe(true);
  });

  it('handles numeric filenames', () => {
    const result = PathSanitizer.validatePath('src/123.ts');
    expect(result.success).toBe(true);
  });

  it('returns proper error structure', () => {
    const result = PathSanitizer.validatePath('');
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('violations');
    expect(result).toHaveProperty('context');
    expect(Array.isArray(result.violations)).toBe(true);
  });

  it('includes context when provided', () => {
    const result = PathSanitizer.validatePath('src/file.ts', { action: 'write' });
    expect(result.context?.action).toBe('write');
  });

  it('accepts all valid directory prefixes', () => {
    const prefixes = ['src/', 'app/', 'pages/', 'utils/', 'styles/', 'public/', './', '../'];
    prefixes.forEach(prefix => {
      const result = PathSanitizer.validatePath(`${prefix}file.ts`);
      expect(result.success).toBe(true, `Should accept ${prefix}`);
    });
  });

  it('normalizeString strips backticks', () => {
    const cleaned = PathSanitizer.normalizeString('`src/file.tsx`');
    expect(cleaned).not.toContain('`');
  });

  it('normalizeString strips trailing ellipsis', () => {
    const cleaned = PathSanitizer.normalizeString('src/file.tsx...');
    expect(cleaned).not.toContain('...');
  });

  it('normalizeString handles null gracefully', () => {
    expect(PathSanitizer.normalizeString(null as any)).toBe('');
    expect(PathSanitizer.normalizeString(undefined as any)).toBe('');
  });
});
