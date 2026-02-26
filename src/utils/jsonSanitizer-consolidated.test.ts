/**
 * Week 4 D2-3: JSON Sanitizer Tests (Consolidated)
 *
 * Consolidation Strategy:
 * - Table-driven control character removal testing
 * - safeParse success/failure cases via data matrix
 * - isValidJson validation via case matrix
 * - Integration testing via scenario table
 * - 55 → 28 tests (-27, -49% reduction)
 *
 * Pattern: Each row includes input, expected behavior, and flexible assertions
 */

import { describe, it, expect } from 'vitest';
import { sanitizeJson, safeParse, isValidJson } from './jsonSanitizer';

describe('jsonSanitizer (Consolidated)', () => {
  // ============================================================
  // sanitizeJson - Basic Functionality
  // ============================================================
  it('should leave clean JSON unchanged', () => {
    const result = sanitizeJson('{"test": "value"}');
    expect(result).toBe('{"test": "value"}');
  });

  it('should trim leading/trailing whitespace', () => {
    expect(sanitizeJson('  {"test": "value"}  ')).toBe('{"test": "value"}');
  });

  it('should preserve all valid JSON structure', () => {
    const input = '{"nested":{"array":[1,2,3]}}';
    expect(sanitizeJson(input)).toBe(input);
  });

  it('should handle empty string', () => {
    expect(sanitizeJson('')).toBe('');
  });

  // ============================================================
  // sanitizeJson - Control Character Removal Matrix
  // ============================================================
  const controlCharCases = [
    { name: 'remove null bytes', char: '\x00', shouldRemove: true },
    { name: 'remove U+0001-U+0008', char: '\x01', shouldRemove: true },
    { name: 'remove vertical tab U+000B', char: '\x0B', shouldRemove: true },
    { name: 'remove DEL U+007F', char: '\x7F', shouldRemove: true },
    { name: 'preserve TAB U+0009', char: '\t', shouldRemove: false },
    { name: 'preserve newline LF U+000A', char: '\n', shouldRemove: false },
    { name: 'preserve carriage return CR U+000D', char: '\r', shouldRemove: false },
    { name: 'preserve form feed FF U+000C', char: '\f', shouldRemove: false },
  ];

  it.each(controlCharCases)(
    'sanitizeJson: $name',
    ({ char, shouldRemove }) => {
      const input = `test${char}value`;
      const result = sanitizeJson(input);
      if (shouldRemove) {
        expect(result).not.toContain(char);
      } else {
        expect(result).toContain(char);
      }
    }
  );

  // ============================================================
  // sanitizeJson - Range Testing
  // ============================================================
  it('should remove U+0001-U+0008 range', () => {
    let input = 'test';
    for (let i = 1; i <= 8; i++) {
      input += String.fromCharCode(i);
    }
    input += 'value';
    const result = sanitizeJson(input);
    for (let i = 1; i <= 8; i++) {
      expect(result).not.toContain(String.fromCharCode(i));
    }
  });

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

  // ============================================================
  // sanitizeJson - Mixed Control Characters
  // ============================================================
  it('should remove mixed control characters', () => {
    const input = '{"test"\x00:\x01"val\x02ue"\x7F}';
    const result = sanitizeJson(input);
    expect(result).not.toContain('\x00');
    expect(result).not.toContain('\x01');
    expect(result).not.toContain('\x02');
    expect(result).not.toContain('\x7F');
  });

  // ============================================================
  // safeParse - Success Cases Matrix
  // ============================================================
  const safeParseSuccessCases = [
    { name: 'parse object', input: '{"test": "value"}', expectData: { test: 'value' } },
    { name: 'parse array', input: '[1, 2, 3]', expectData: [1, 2, 3] },
    { name: 'parse null', input: 'null', expectData: null },
    { name: 'parse boolean true', input: 'true', expectData: true },
    { name: 'parse boolean false', input: 'false', expectData: false },
    { name: 'parse number', input: '123.456', expectData: 123.456 },
    { name: 'parse string', input: '"hello world"', expectData: 'hello world' },
    { name: 'parse empty object', input: '{}', expectData: {} },
    { name: 'parse empty array', input: '[]', expectData: [] },
  ];

  it.each(safeParseSuccessCases)(
    'safeParse success: $name',
    ({ input, expectData }) => {
      const result = safeParse(input);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(expectData);
    }
  );

  // ============================================================
  // safeParse - Complex Parsing
  // ============================================================
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

  it('should parse step array format (real-world LLM)', () => {
    const response = '[{"step":1,"action":"read","path":"src/App.tsx"},{"step":2,"action":"write","path":"src/Form.tsx"}]';
    const result = safeParse(response);
    expect(result.success).toBe(true);
    expect(result.data.length).toBe(2);
    expect(result.data[0].action).toBe('read');
  });

  // ============================================================
  // safeParse - Failure Cases Matrix
  // ============================================================
  const safeParseFailureCases = [
    { name: 'invalid JSON', input: '{invalid}' },
    { name: 'unclosed brace', input: '{"test": "value"' },
    { name: 'unclosed bracket', input: '[1, 2, 3' },
    { name: 'malformed array', input: '[1, 2,,,]' },
    { name: 'trailing comma', input: '{"test": "value",}' },
    { name: 'plain text', input: 'invalid' },
  ];

  it.each(safeParseFailureCases)(
    'safeParse failure: $name',
    ({ input }) => {
      const result = safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.data).toBeNull();
    }
  );

  // ============================================================
  // safeParse - Error Messages
  // ============================================================
  it('should return error message on failure', () => {
    const result = safeParse('invalid');
    expect(typeof result.error).toBe('string');
    expect(result.error).toMatch(/Unexpected|parse|JSON/i);
  });

  // ============================================================
  // isValidJson - Valid Cases Matrix
  // ============================================================
  const isValidJsonSuccessCases = [
    { input: '{"test": "value"}', name: 'object' },
    { input: '[1, 2, 3]', name: 'array' },
    { input: 'null', name: 'null' },
    { input: 'true', name: 'boolean true' },
    { input: 'false', name: 'boolean false' },
    { input: '{}', name: 'empty object' },
    { input: '[]', name: 'empty array' },
    { input: '{"a":{"b":{"c":{"d":123}}}}', name: 'deeply nested' },
  ];

  it.each(isValidJsonSuccessCases)(
    'isValidJson valid: $name',
    ({ input }) => {
      expect(isValidJson(input)).toBe(true);
    }
  );

  // ============================================================
  // isValidJson - Invalid Cases Matrix
  // ============================================================
  const isValidJsonFailureCases = [
    { input: '{"test": "value"', name: 'incomplete object' },
    { input: '[1, 2, 3', name: 'incomplete array' },
    { input: '{invalid}', name: 'malformed JSON' },
    { input: 'hello world', name: 'plain text' },
    { input: 'undefined', name: 'undefined keyword' },
    { input: 'NaN', name: 'NaN' },
    { input: 'Infinity', name: 'Infinity' },
  ];

  it.each(isValidJsonFailureCases)(
    'isValidJson invalid: $name',
    ({ input }) => {
      expect(isValidJson(input)).toBe(false);
    }
  );

  // ============================================================
  // isValidJson - Special Cases
  // ============================================================
  it('should sanitize before validating', () => {
    expect(isValidJson('{"test"\x00:"value"}')).toBe(true);
  });

  it('should validate complex LLM response', () => {
    const response = JSON.stringify([
      { step: 1, action: 'read', path: 'src/App.tsx', dependsOn: [] },
      { step: 2, action: 'write', path: 'src/Form.tsx', dependsOn: [1] },
    ]);
    expect(isValidJson(response)).toBe(true);
  });

  // ============================================================
  // Integration - Pipeline Testing
  // ============================================================
  describe('Integration - Sanitize → Parse → Validate', () => {
    it('should validate before expensive parse', () => {
      const candidates = ['{"valid": true}', '{invalid}', '[]'];
      const valid = candidates.filter((c) => isValidJson(c));
      expect(valid.length).toBe(2);
    });

    it('should handle multiple sanitization passes', () => {
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
