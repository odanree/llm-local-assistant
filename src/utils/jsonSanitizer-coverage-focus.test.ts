import { describe, it, expect } from 'vitest';
import { sanitizeJson, safeParse, isValidJson } from './jsonSanitizer';

/**
 * JSON SANITIZER - COVERAGE FOCUS
 * 
 * Goal: Cover jsonSanitizer.ts edge cases - lines 61-66 and all utility functions
 * Focus: Control character stripping, edge cases
 */

describe('jsonSanitizer - Coverage Focus', () => {
  describe('sanitizeJson - Control Character Removal', () => {
    // Core functionality - clean JSON unchanged
    it('should leave clean JSON unchanged', () => {
      const result = sanitizeJson('{"test": "value"}');
      expect(result).toBe('{"test": "value"}');
    });

    // Strip null bytes explicitly
    it('should remove null bytes', () => {
      const result = sanitizeJson('test\x00value');
      expect(result).not.toContain('\x00');
    });

    // U+0001-U+0008 should be removed
    it('should remove control chars U+0001-U+0008', () => {
      const input = 'test\x01\x02\x03\x04\x05\x06\x07\x08value';
      const result = sanitizeJson(input);
      for (let i = 1; i <= 8; i++) {
        expect(result).not.toContain(String.fromCharCode(i));
      }
    });

    // U+000B (VT - vertical tab) should be removed
    it('should remove vertical tab U+000B', () => {
      const result = sanitizeJson('test\x0Bvalue');
      expect(result).not.toContain('\x0B');
    });

    // U+000E-U+001F should be removed (but 09 TAB, 0A LF, 0D CR, 0C FF preserved)
    it('should remove U+000E-U+001F range', () => {
      let input = 'test';
      for (let i = 0x0E; i <= 0x1F; i++) {
        input += String.fromCharCode(i);
      }
      input += 'value';
      const result = sanitizeJson(input);
      for (let i = 0x0E; i <= 0x1F; i++) {
        expect(result).not.toContain(String.fromCharCode(i));
      }
    });

    // TAB (U+0009) should be PRESERVED
    it('should preserve TAB character U+0009', () => {
      const result = sanitizeJson('test\t value');
      expect(result).toContain('\t');
    });

    // LF (U+000A) should be PRESERVED
    it('should preserve newline LF U+000A', () => {
      const result = sanitizeJson('test\nvalue');
      expect(result).toContain('\n');
    });

    // CR (U+000D) should be PRESERVED
    it('should preserve carriage return CR U+000D', () => {
      const result = sanitizeJson('test\rvalue');
      expect(result).toContain('\r');
    });

    // FF (U+000C) should be PRESERVED
    it('should preserve form feed FF U+000C', () => {
      const result = sanitizeJson('test\fvalue');
      expect(result).toContain('\f');
    });

    // DEL (U+007F) should be removed
    it('should remove DEL U+007F', () => {
      const result = sanitizeJson('test\x7Fvalue');
      expect(result).not.toContain('\x7F');
    });

    // C1 controls U+0080-U+009F should be removed
    it('should remove C1 control range U+0080-U+009F', () => {
      let input = 'test';
      for (let i = 0x80; i <= 0x9F; i++) {
        input += String.fromCharCode(i);
      }
      input += 'value';
      const result = sanitizeJson(input);
      for (let i = 0x80; i <= 0x9F; i++) {
        expect(result).not.toContain(String.fromCharCode(i));
      }
    });

    // Multiple control chars scattered through
    it('should remove mixed control characters', () => {
      const input = '{"test"\x00:\x01"val\x02ue"\x7F}';
      const result = sanitizeJson(input);
      expect(result).not.toContain('\x00');
      expect(result).not.toContain('\x01');
      expect(result).not.toContain('\x02');
      expect(result).not.toContain('\x7F');
    });

    // Whitespace normalization - trim
    it('should trim leading/trailing whitespace', () => {
      expect(sanitizeJson('  {"test": "value"}  ')).toBe('{"test": "value"}');
    });

    // Preserve JSON structure
    it('should preserve all valid JSON structure', () => {
      const input = '{"nested":{"array":[1,2,3]}}';
      expect(sanitizeJson(input)).toBe(input);
    });

    // Empty string
    it('should handle empty string', () => {
      expect(sanitizeJson('')).toBe('');
    });
  });

  describe('safeParse - Parsing with Sanitization', () => {
    // Success cases
    it('should parse valid JSON object', () => {
      const result = safeParse('{"test": "value"}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ test: 'value' });
    });

    it('should parse array', () => {
      const result = safeParse('[1, 2, 3]');
      expect(result.success).toBe(true);
      expect(result.data).toEqual([1, 2, 3]);
    });

    it('should parse null', () => {
      const result = safeParse('null');
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should parse boolean true', () => {
      const result = safeParse('true');
      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
    });

    it('should parse boolean false', () => {
      const result = safeParse('false');
      expect(result.success).toBe(true);
      expect(result.data).toBe(false);
    });

    it('should parse number', () => {
      const result = safeParse('123.456');
      expect(result.success).toBe(true);
      expect(result.data).toBe(123.456);
    });

    it('should parse string', () => {
      const result = safeParse('"hello world"');
      expect(result.success).toBe(true);
      expect(result.data).toBe('hello world');
    });

    it('should parse nested structure', () => {
      const result = safeParse('{"a":{"b":{"c":123}}}');
      expect(result.success).toBe(true);
      expect(result.data.a.b.c).toBe(123);
    });

    it('should sanitize control chars before parsing', () => {
      const result = safeParse('{"test"\x00:"value"\x01}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ test: 'value' });
    });

    // Failure cases
    it('should fail on invalid JSON', () => {
      const result = safeParse('{invalid}');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.data).toBeNull();
    });

    it('should fail on unclosed brace', () => {
      const result = safeParse('{"test": "value"');
      expect(result.success).toBe(false);
    });

    it('should fail on unclosed bracket', () => {
      const result = safeParse('[1, 2, 3');
      expect(result.success).toBe(false);
    });

    it('should fail on malformed array', () => {
      const result = safeParse('[1, 2,,,]');
      expect(result.success).toBe(false);
    });

    it('should fail on trailing comma', () => {
      const result = safeParse('{"test": "value",}');
      expect(result.success).toBe(false);
    });

    it('should return error message on failure', () => {
      const result = safeParse('invalid');
      expect(typeof result.error).toBe('string');
      expect(result.error).toMatch(/Unexpected|parse|JSON/i);
    });

    // Empty structures
    it('should parse empty object', () => {
      const result = safeParse('{}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });

    it('should parse empty array', () => {
      const result = safeParse('[]');
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    // Real-world LLM response
    it('should parse step array format', () => {
      const response = '[{"step":1,"action":"read","path":"src/App.tsx"},{"step":2,"action":"write","path":"src/Form.tsx"}]';
      const result = safeParse(response);
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(2);
      expect(result.data[0].action).toBe('read');
    });
  });

  describe('isValidJson - Validation Without Parsing', () => {
    // Valid cases
    it('should validate valid object', () => {
      expect(isValidJson('{"test": "value"}')).toBe(true);
    });

    it('should validate array', () => {
      expect(isValidJson('[1, 2, 3]')).toBe(true);
    });

    it('should validate null', () => {
      expect(isValidJson('null')).toBe(true);
    });

    it('should validate true', () => {
      expect(isValidJson('true')).toBe(true);
    });

    it('should validate false', () => {
      expect(isValidJson('false')).toBe(true);
    });

    it('should validate empty object', () => {
      expect(isValidJson('{}')).toBe(true);
    });

    it('should validate empty array', () => {
      expect(isValidJson('[]')).toBe(true);
    });

    // Invalid cases
    it('should invalidate incomplete object', () => {
      expect(isValidJson('{"test": "value"')).toBe(false);
    });

    it('should invalidate incomplete array', () => {
      expect(isValidJson('[1, 2, 3')).toBe(false);
    });

    it('should invalidate malformed JSON', () => {
      expect(isValidJson('{invalid}')).toBe(false);
    });

    it('should invalidate plain text', () => {
      expect(isValidJson('hello world')).toBe(false);
    });

    it('should invalidate undefined keyword', () => {
      expect(isValidJson('undefined')).toBe(false);
    });

    it('should invalidate NaN', () => {
      expect(isValidJson('NaN')).toBe(false);
    });

    it('should invalidate Infinity', () => {
      expect(isValidJson('Infinity')).toBe(false);
    });

    // Validation with sanitization
    it('should sanitize before validating', () => {
      expect(isValidJson('{"test"\x00:"value"}')).toBe(true);
    });

    it('should validate deeply nested structure', () => {
      expect(isValidJson('{"a":{"b":{"c":{"d":123}}}}')).toBe(true);
    });

    it('should validate complex LLM response', () => {
      const response = JSON.stringify([
        { step: 1, action: 'read', path: 'src/App.tsx', dependsOn: [] },
        { step: 2, action: 'write', path: 'src/Form.tsx', dependsOn: [1] }
      ]);
      expect(isValidJson(response)).toBe(true);
    });
  });

  describe('Integration - Sanitize → Parse → Validate', () => {
    it('should handle full pipeline', () => {
      const dirty = '"{test"\x00:"value\x01"}\x7F';
      const sanitized = sanitizeJson(dirty);
      const parsed = safeParse(sanitized);
      expect(parsed.success).toBe(false); // Because { } mismatch
    });

    it('should validate before expensive parse', () => {
      const candidates = [
        '{"valid": true}',
        '{invalid}',
        '[]'
      ];
      const valid = candidates.filter(c => isValidJson(c));
      expect(valid.length).toBe(2);
    });

    it('should handle  multiple sanitization passes', () => {
      const input = '{"test": "value"}';
      const pass1 = sanitizeJson(input);
      const pass2 = sanitizeJson(pass1);
      expect(pass2).toBe(input);
    });

    it('should parse large response after sanitization', () => {
      const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      const json = JSON.stringify(items);
      const result = safeParse(json);
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(100);
    });

    it('should preserve unicode through sanitization', () => {
      const input = '{"emoji":"😀","text":"你好"}';
      const sanitized = sanitizeJson(input);
      const result = safeParse(sanitized);
      expect(result.success).toBe(true);
      expect(result.data.emoji).toContain('😀');
    });
  });
});
