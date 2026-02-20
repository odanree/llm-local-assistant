import { describe, it, expect } from 'vitest';
import { PathSanitizer } from './pathSanitizer';
import { ViolationCodes } from '../types/validation';

/**
 * PATH SANITIZER - COVERAGE FOCUS
 * 
 * Goal: Cover critical uncovered lines:
 * - sanitizePath() method (lines 226-293): placeholder replacement, description cleaning
 * - normalizeString() edge cases: control characters, artifacts
 * - extractFilename() paths
 */

describe('PathSanitizer - Coverage Focus', () => {
  // Test sanitizePath - lines 226+ (currently uncovered)
  describe('sanitizePath - Placeholder & Description Cleaning', () => {
    it('should throw on empty path', () => {
      expect(() => PathSanitizer.sanitizePath('')).toThrow();
    });

    it('should replace /path/to/ placeholder', () => {
      const result = PathSanitizer.sanitizePath('/path/to/file.ts');
      expect(result).toBe('src/file.ts');
    });

    it('should replace /PATH/TO/ (case insensitive)', () => {
      const result = PathSanitizer.sanitizePath('/PATH/TO/file.ts');
      expect(result).toBe('src/file.ts');
    });

    it('should replace your-project/', () => {
      const result = PathSanitizer.sanitizePath('your-project/utils.ts');
      expect(result).toBe('utils.ts');
    });

    it('should replace {PROJECT_ROOT}/', () => {
      const result = PathSanitizer.sanitizePath('{PROJECT_ROOT}/utils.ts');
      expect(result).toBe('src/utils.ts');
    });

    it('should replace {workspacePath}/', () => {
      const result = PathSanitizer.sanitizePath('{workspacePath}/utils.ts');
      expect(result).toBe('utils.ts');
    });

    it('should replace ./src/ pattern', () => {
      const result = PathSanitizer.sanitizePath('./src/file.ts');
      expect(result).toBe('src/file.ts');
    });

    it('should replace ./components/ pattern', () => {
      const result = PathSanitizer.sanitizePath('./components/Form.tsx');
      expect(result).toBe('src/components/Form.tsx');
    });

    it('should remove pattern but fail on remaining spaces', () => {
      // The colon removal doesn't help because leading text still has spaces
      expect(() => PathSanitizer.sanitizePath('contains jsp: src/Form.tsx')).toThrow();
    });

    it('should remove for pattern from description', () => {
      // 'for the login form: src/Login.tsx' -> 'src/Login.tsx' (valid)
      const result = PathSanitizer.sanitizePath('for the login form: src/Login.tsx');
      expect(result).toBe('src/Login.tsx');
    });

    it('should remove description: prefix (spaces prevent success)', () => {
      // Prefix removal alone: 'description: src/file.ts' -> 'src/file.ts' (valid, no throw)
      const result = PathSanitizer.sanitizePath('description: src/file.ts');
      expect(result).toBe('src/file.ts');
    });

    it('should remove path: prefix (spaces prevent success)', () => {
      const result = PathSanitizer.sanitizePath('path: src/file.ts');
      expect(result).toBe('src/file.ts');
    });

    it('should remove file: prefix (spaces prevent success)', () => {
      const result = PathSanitizer.sanitizePath('file: src/utils.ts');
      expect(result).toBe('src/utils.ts');
    });

    it('should normalize backslashes to slashes', () => {
      const result = PathSanitizer.sanitizePath('src\\utils\\file.ts');
      expect(result).not.toContain('\\');
      expect(result).toContain('/');
    });

    it('should throw on pure description', () => {
      expect(() => PathSanitizer.sanitizePath('this is a description')).toThrow();
    });

    it('should throw on comma-separated list (has spaces)', () => {
      expect(() => PathSanitizer.sanitizePath('src/a.tsx, src/b.tsx')).toThrow();
    });

    it('should throw on path too long', () => {
      const long = 'src/' + 'a'.repeat(100) + '.tsx';
      expect(() => PathSanitizer.sanitizePath(long)).toThrow();
    });

    it('should throw on spaces after cleaning', () => {
      expect(() => PathSanitizer.sanitizePath('src my file.tsx')).toThrow();
    });
  });

  // Test normalizeString - artifact removal
  describe('normalizeString - Artifact Removal', () => {
    it('should strip backticks', () => {
      expect(PathSanitizer.normalizeString('`src/file.ts`')).toBe('src/file.ts');
    });

    it('should strip double trailing dots', () => {
      expect(PathSanitizer.normalizeString('src/file.ts..')).toBe('src/file.ts');
    });

    it('should strip triple trailing dots', () => {
      expect(PathSanitizer.normalizeString('src/file.ts...')).toBe('src/file.ts');
    });

    it('should remove asterisks', () => {
      const result = PathSanitizer.normalizeString('**src/file.ts**');
      expect(result).not.toContain('*');
    });

    it('should remove underscores', () => {
      const result = PathSanitizer.normalizeString('_src/file.ts_');
      expect(result).not.toContain('_');
    });

    it('should remove tildes', () => {
      const result = PathSanitizer.normalizeString('~~src/file.ts~~');
      expect(result).not.toContain('~');
    });

    it('should remove trailing punctuation', () => {
      expect(PathSanitizer.normalizeString('src/file.ts,;!?:')).toBe('src/file.ts');
    });

    it('should remove double quotes', () => {
      expect(PathSanitizer.normalizeString('"src/file.ts"')).toBe('src/file.ts');
    });

    it('should remove single quotes', () => {
      expect(PathSanitizer.normalizeString("'src/file.ts'")).toBe('src/file.ts');
    });

    it('should normalize multiple spaces', () => {
      const result = PathSanitizer.normalizeString('src/file.ts    other');
      expect(result).not.toContain('    ');
    });

    it('should trim leading whitespace', () => {
      expect(PathSanitizer.normalizeString('   src/file.ts')).toBe('src/file.ts');
    });

    it('should trim trailing whitespace', () => {
      expect(PathSanitizer.normalizeString('src/file.ts   ')).toBe('src/file.ts');
    });

    it('should remove control characters U+0000', () => {
      const result = PathSanitizer.normalizeString('src/file.ts\x00');
      expect(result).not.toContain('\x00');
    });

    it('should remove control characters U+001F', () => {
      const result = PathSanitizer.normalizeString('src/file.ts\x1F');
      expect(result).not.toContain('\x1F');
    });

    it('should remove DEL U+007F', () => {
      const result = PathSanitizer.normalizeString('src/file.ts\x7F');
      expect(result).not.toContain('\x7F');
    });

    it('should handle null input', () => {
      expect(PathSanitizer.normalizeString(null as any)).toBe('');
    });

    it('should handle combined artifacts', () => {
      const result = PathSanitizer.normalizeString('`**src/file.ts**...`');
      expect(result).toBe('src/file.ts');
    });
  });

  // Test extractFilename - filename extraction
  describe('extractFilename - Filename Path Extraction', () => {
    it('should extract filename from path', () => {
      expect(PathSanitizer.extractFilename('src/utils.ts')).toBe('utils.ts');
    });

    it('should extract single filename', () => {
      expect(PathSanitizer.extractFilename('utils.ts')).toBe('utils.ts');
    });

    it('should extract nested filename', () => {
      expect(PathSanitizer.extractFilename('src/components/Button.tsx')).toBe('Button.tsx');
    });

    it('should extract from relative path', () => {
      expect(PathSanitizer.extractFilename('./src/utils.ts')).toBe('utils.ts');
    });

    it('should extract from parent relative path', () => {
      expect(PathSanitizer.extractFilename('../src/utils.ts')).toBe('utils.ts');
    });

    it('should handle trailing slash', () => {
      expect(PathSanitizer.extractFilename('src/utils/')).toBe('');
    });

    it('should handle different extensions', () => {
      expect(PathSanitizer.extractFilename('src/style.css')).toBe('style.css');
      expect(PathSanitizer.extractFilename('config.json')).toBe('config.json');
      expect(PathSanitizer.extractFilename('Component.tsx')).toBe('Component.tsx');
    });
  });

  // Integration tests - ensure guards all work
  describe('validatePath - Guard Conditions (Coverage)', () => {
    it('should reject path with 2+ spaces', () => {
      const result = PathSanitizer.validatePath('src file test.tsx');
      expect(result.success).toBe(false);
    });

    it('should reject description patterns', () => {
      const result = PathSanitizer.validatePath('path contains jsx code');
      expect(result.success).toBe(false);
    });

    it('should reject comma-separated files', () => {
      const result = PathSanitizer.validatePath('file.tsx, file2.tsx');
      expect(result.success).toBe(false);
    });

    it('should reject path without extension', () => {
      const result = PathSanitizer.validatePath('src/utils');
      expect(result.success).toBe(false);
    });

    it('should reject invalid extension', () => {
      const result = PathSanitizer.validatePath('src/file.exe');
      expect(result.success).toBe(false);
    });

    it('should reject unrecognized prefix', () => {
      const result = PathSanitizer.validatePath('foo/bar.tsx');
      expect(result.success).toBe(false);
    });

    it('should accept src/ prefixed path', () => {
      expect(PathSanitizer.validatePath('src/file.tsx').success).toBe(true);
    });

    it('should accept components/ with prefix', () => {
      expect(PathSanitizer.validatePath('src/components/Button.tsx').success).toBe(true);
    });

    it('should accept utils/ with prefix', () => {
      expect(PathSanitizer.validatePath('src/utils/helper.ts').success).toBe(true);
    });

    it('should accept ./ relative prefix', () => {
      expect(PathSanitizer.validatePath('./src/file.ts').success).toBe(true);
    });

    it('should accept ../ relative prefix', () => {
      expect(PathSanitizer.validatePath('../src/file.ts').success).toBe(true);
    });

    it('should accept single file without prefix', () => {
      expect(PathSanitizer.validatePath('index.ts').success).toBe(true);
    });
  });

  // Pipeline integration tests
  describe('Full Pipeline - Normalize → Sanitize → Validate', () => {
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
});
