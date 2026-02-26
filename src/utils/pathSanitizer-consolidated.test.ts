/**
 * Week 4 D1: PathSanitizer Tests (Consolidated)
 *
 * Consolidation Strategy:
 * - Table-driven validatePath testing with success/failure expectations
 * - sanitizePath patterns grouped by replacement type (placeholders, descriptions, etc)
 * - normalizeString artifact removal via data matrix
 * - extractFilename and pipeline integration as focused tests
 * - 31 + 58 tests = 89 → 42 tests (-47, -53% reduction)
 *
 * Pattern: Each row includes input, expected behavior, and flexible assertions
 */

import { describe, it, expect } from 'vitest';
import { PathSanitizer } from './pathSanitizer';
import { ViolationCodes } from '../types/validation';

describe('PathSanitizer (Consolidated)', () => {
  // ============================================================
  // validatePath - Success Cases
  // ============================================================
  const validatePathSuccessCases = [
    { name: 'accepts src/ paths', path: 'src/file.tsx' },
    { name: 'accepts app/ paths', path: 'app/layout.tsx' },
    { name: 'accepts pages/ paths', path: 'pages/index.ts' },
    { name: 'accepts ./ relative paths', path: './src/file.ts' },
    { name: 'accepts ../ relative paths', path: '../utils/file.ts' },
    { name: 'accepts single file paths', path: 'index.ts' },
    { name: 'accepts hyphenated paths', path: 'src/my-helper/index.tsx' },
    { name: 'accepts paths with multiple dots', path: 'src/index.test.ts' },
    { name: 'trims whitespace', path: '  src/file.ts  ' },
    { name: 'handles camelCase filenames', path: 'src/myHelper/index.tsx' },
    { name: 'handles snake_case filenames', path: 'src/my_helper/index.tsx' },
    { name: 'handles deeply nested paths', path: 'src/views/sections/items/TextField/index.tsx' },
    { name: 'handles numeric filenames', path: 'src/123.ts' },
    { name: 'accepts all valid directory prefixes', path: 'utils/file.ts' },
  ];

  it.each(validatePathSuccessCases)(
    'validatePath success: $name',
    ({ path }) => {
      const result = PathSanitizer.validatePath(path);
      expect(result.success).toBe(true);
    }
  );

  // ============================================================
  // validatePath - Failure Cases
  // ============================================================
  const validatePathFailureCases = [
    { name: 'rejects undefined', path: undefined, expectViolation: ViolationCodes.PATH_INVALID },
    { name: 'rejects null', path: null as any },
    { name: 'rejects empty string', path: '', expectSummary: /empty|missing/ },
    { name: 'rejects whitespace-only string', path: '   ' },
    { name: 'rejects no extension', path: 'src/file', expectSummary: /extension/ },
    { name: 'rejects multiple spaces', path: 'src/this is bad.ts', expectSummary: /spaces/ },
    { name: 'rejects description patterns', path: 'src/contains button.ts' },
    { name: 'rejects comma-separated files', path: 'src/file1.ts, src/file2.ts', expectSummary: /multiple/ },
    { name: 'rejects invalid directory prefix', path: 'invalid/file.ts', expectSummary: /directory/ },
    { name: 'rejects invalid extension', path: 'src/file.xyz', expectSummary: /extension/ },
  ];

  it.each(validatePathFailureCases)(
    'validatePath failure: $name',
    ({ path, expectViolation, expectSummary }) => {
      const result = PathSanitizer.validatePath(path);
      expect(result.success).toBe(false);
      if (expectViolation) {
        expect(result.violations).toContain(expectViolation);
      }
      if (expectSummary) {
        expect(result.summary.toLowerCase()).toMatch(expectSummary);
      }
    }
  );

  // ============================================================
  // validatePath - Non-String Type Rejection
  // ============================================================
  it('rejects non-string inputs', () => {
    expect(PathSanitizer.validatePath(123 as any).success).toBe(false);
    expect(PathSanitizer.validatePath({} as any).success).toBe(false);
    expect(PathSanitizer.validatePath([] as any).success).toBe(false);
  });

  // ============================================================
  // validatePath - Result Structure
  // ============================================================
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

  // ============================================================
  // validatePath - Extension Testing
  // ============================================================
  it('accepts various extensions', () => {
    const extensions = ['.tsx', '.ts', '.js', '.css', '.json'];
    extensions.forEach(ext => {
      const result = PathSanitizer.validatePath(`src/file${ext}`);
      expect(result.success).toBe(true, `Should accept ${ext}`);
    });
  });

  // ============================================================
  // sanitizePath - Placeholder Replacement
  // ============================================================
  const sanitizePathCases = [
    { name: 'replace /path/to/ placeholder', path: '/path/to/file.ts', expected: 'src/file.ts' },
    { name: 'replace /PATH/TO/ (case insensitive)', path: '/PATH/TO/file.ts', expected: 'src/file.ts' },
    { name: 'replace your-project/', path: 'your-project/utils.ts', expected: 'utils.ts' },
    { name: 'replace {PROJECT_ROOT}/', path: '{PROJECT_ROOT}/utils.ts', expected: 'src/utils.ts' },
    { name: 'replace {workspacePath}/', path: '{workspacePath}/utils.ts', expected: 'utils.ts' },
    { name: 'replace ./src/ pattern', path: './src/file.ts', expected: 'src/file.ts' },
    { name: 'replace ./components/ pattern', path: './components/Form.tsx', expected: 'src/components/Form.tsx' },
    { name: 'remove for pattern from description', path: 'for the login form: src/Login.tsx', expected: 'src/Login.tsx' },
    { name: 'remove description: prefix', path: 'description: src/file.ts', expected: 'src/file.ts' },
    { name: 'remove path: prefix', path: 'path: src/file.ts', expected: 'src/file.ts' },
    { name: 'remove file: prefix', path: 'file: src/utils.ts', expected: 'src/utils.ts' },
  ];

  it.each(sanitizePathCases)(
    'sanitizePath: $name',
    ({ path, expected }) => {
      const result = PathSanitizer.sanitizePath(path);
      expect(result).toBe(expected);
    }
  );

  // ============================================================
  // sanitizePath - Failure Cases
  // ============================================================
  const sanitizePathFailureCases = [
    { name: 'throw on empty path' },
    { name: 'throw on pure description', path: 'this is a description' },
    { name: 'throw on remaining spaces', path: 'contains jsp: src/Form.tsx' },
    { name: 'throw on comma-separated list', path: 'src/a.tsx, src/b.tsx' },
    { name: 'throw on path too long', path: 'src/' + 'a'.repeat(100) + '.tsx' },
    { name: 'throw on spaces after cleaning', path: 'src my file.tsx' },
  ];

  it.each(sanitizePathFailureCases)(
    'sanitizePath failure: $name',
    ({ path }) => {
      expect(() => PathSanitizer.sanitizePath(path || '')).toThrow();
    }
  );

  // ============================================================
  // sanitizePath - Normalization
  // ============================================================
  it('normalize backslashes to slashes', () => {
    const result = PathSanitizer.sanitizePath('src\\utils\\file.ts');
    expect(result).not.toContain('\\');
    expect(result).toContain('/');
  });

  // ============================================================
  // normalizeString - Artifact Removal Matrix
  // ============================================================
  const normalizeStringCases = [
    { name: 'strip backticks', input: '`src/file.ts`', expected: 'src/file.ts' },
    { name: 'strip double trailing dots', input: 'src/file.ts..', expected: 'src/file.ts' },
    { name: 'strip triple trailing dots', input: 'src/file.ts...', expected: 'src/file.ts' },
    { name: 'strip trailing punctuation', input: 'src/file.ts,;!?:', expected: 'src/file.ts' },
    { name: 'remove double quotes', input: '"src/file.ts"', expected: 'src/file.ts' },
    { name: 'remove single quotes', input: "'src/file.ts'", expected: 'src/file.ts' },
    { name: 'trim leading whitespace', input: '   src/file.ts', expected: 'src/file.ts' },
    { name: 'trim trailing whitespace', input: 'src/file.ts   ', expected: 'src/file.ts' },
    { name: 'handle combined artifacts', input: '`**src/file.ts**...`', expected: 'src/file.ts' },
  ];

  it.each(normalizeStringCases)(
    'normalizeString: $name',
    ({ input, expected }) => {
      const result = PathSanitizer.normalizeString(input);
      expect(result).toBe(expected);
    }
  );

  // ============================================================
  // normalizeString - Character Removal
  // ============================================================
  const normalizeStringCharacterCases = [
    { name: 'remove asterisks', input: '**src/file.ts**', char: '*' },
    { name: 'remove underscores', input: '_src/file.ts_', char: '_' },
    { name: 'remove tildes', input: '~~src/file.ts~~', char: '~' },
    { name: 'remove control characters U+0000', input: 'src/file.ts\x00', char: '\x00' },
    { name: 'remove control characters U+001F', input: 'src/file.ts\x1F', char: '\x1F' },
    { name: 'remove DEL U+007F', input: 'src/file.ts\x7F', char: '\x7F' },
  ];

  it.each(normalizeStringCharacterCases)(
    'normalizeString character removal: $name',
    ({ input, char }) => {
      const result = PathSanitizer.normalizeString(input);
      expect(result).not.toContain(char);
    }
  );

  // ============================================================
  // normalizeString - Edge Cases
  // ============================================================
  it('normalize multiple spaces', () => {
    const result = PathSanitizer.normalizeString('src/file.ts    other');
    expect(result).not.toContain('    ');
  });

  it('handle null input', () => {
    expect(PathSanitizer.normalizeString(null as any)).toBe('');
    expect(PathSanitizer.normalizeString(undefined as any)).toBe('');
  });

  // ============================================================
  // extractFilename - Filename Extraction
  // ============================================================
  const extractFilenameCases = [
    { name: 'extract from path', path: 'src/utils.ts', expected: 'utils.ts' },
    { name: 'extract single filename', path: 'utils.ts', expected: 'utils.ts' },
    { name: 'extract nested filename', path: 'src/components/Button.tsx', expected: 'Button.tsx' },
    { name: 'extract from relative path', path: './src/utils.ts', expected: 'utils.ts' },
    { name: 'extract from parent relative path', path: '../src/utils.ts', expected: 'utils.ts' },
    { name: 'handle different extensions .css', path: 'src/style.css', expected: 'style.css' },
    { name: 'handle different extensions .json', path: 'config.json', expected: 'config.json' },
    { name: 'handle different extensions .tsx', path: 'Component.tsx', expected: 'Component.tsx' },
  ];

  it.each(extractFilenameCases)(
    'extractFilename: $name',
    ({ path, expected }) => {
      const result = PathSanitizer.extractFilename(path);
      expect(result).toBe(expected);
    }
  );

  // ============================================================
  // extractFilename - Edge Cases
  // ============================================================
  it('handle trailing slash', () => {
    expect(PathSanitizer.extractFilename('src/utils/')).toBe('');
  });

  // ============================================================
  // Full Pipeline Integration
  // ============================================================
  describe('Full Pipeline Integration', () => {
    it('should process backticks through pipeline', () => {
      const normalized = PathSanitizer.normalizeString('`src/file.ts`');
      const result = PathSanitizer.validatePath(normalized);
      expect(result.success).toBe(true);
    });

    it('should process placeholder through sanitize', () => {
      const sanitized = PathSanitizer.sanitizePath('/path/to/utils.ts');
      const result = PathSanitizer.validatePath(sanitized);
      expect(result.success).toBe(true);
    });

    it('should process full artifact cleanup pipeline', () => {
      const raw = '`/path/to/src/file.ts...`';
      const normalized = PathSanitizer.normalizeString(raw);
      const sanitized = PathSanitizer.sanitizePath(normalized);
      const validated = PathSanitizer.validatePath(sanitized);
      expect(validated.success).toBe(true);
    });

    it('should process filename extraction after sanitize', () => {
      const sanitized = PathSanitizer.sanitizePath('/path/to/utils.ts');
      const filename = PathSanitizer.extractFilename(sanitized);
      expect(filename).toBe('utils.ts');
    });
  });

  // ============================================================
  // Static Methods Exposure
  // ============================================================
  describe('Static Methods', () => {
    it('should expose validatePath as public static', () => {
      expect(typeof PathSanitizer.validatePath).toBe('function');
    });

    it('should expose sanitizePath as public static', () => {
      expect(typeof PathSanitizer.sanitizePath).toBe('function');
    });

    it('should expose normalizeString as public static', () => {
      expect(typeof PathSanitizer.normalizeString).toBe('function');
    });

    it('should expose extractFilename as public static', () => {
      expect(typeof PathSanitizer.extractFilename).toBe('function');
    });
  });
});
