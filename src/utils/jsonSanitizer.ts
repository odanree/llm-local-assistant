/**
 * JSON Sanitizer: Robust cleaning utility for LLM-generated JSON
 * 
 * Problem: LLM outputs can contain control characters that break JSON.parse()
 * Solution: Strip illegal characters, preserve valid escapes
 * 
 * Handles:
 * - Raw control characters (U+0000-U+001F, U+007F-U+009F)
 * - Improperly escaped newlines
 * - Unicode edge cases
 * - Null bytes
 */

export function sanitizeJson(raw: string): string {
  // Phase 1: strip obvious non-JSON noise
  let s = raw
    // Strip raw control characters (except tab, newline, carriage return, form feed)
    // U+0000-U+001F: NUL, SOH, STX, ... (except TAB=09, LF=0A, CR=0D, FF=0C)
    // U+007F-U+009F: DEL and C1 controls
    .replace(/[\x00-\x08\x0B\x0E-\x1F\x7F-\x9F]/g, '')
    .replace(/\0/g, '')   // null bytes
    .trim();

  // Phase 2: fix unescaped newlines/carriage returns inside string values.
  // LLMs frequently emit multi-line description/content fields without escaping,
  // causing "Expected ',' or '}' after property value" parse errors.
  // Strategy: scan char-by-char; inside a string, replace bare \n/\r with \\n/\\r.
  let result = '';
  let inString = false;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '"' && (i === 0 || s[i - 1] !== '\\')) {
      inString = !inString;
      result += ch;
    } else if (inString) {
      if (ch === '\n') {
        result += '\\n';
      } else if (ch === '\r') {
        result += '\\r';
      } else if (ch === '\t') {
        result += '\\t';
      } else {
        result += ch;
      }
    } else {
      result += ch;
    }
    i++;
  }

  // Phase 3: remove trailing commas before ] or } (common LLM habit)
  result = result.replace(/,(\s*[}\]])/g, '$1');

  return result;
}

/**
 * Attempt safe JSON parse with sanitization
 * Returns: { success: boolean, data: any, error?: string }
 */
export function safeParse(raw: string): { success: boolean; data: any; error?: string } {
  try {
    // First, sanitize the input
    const sanitized = sanitizeJson(raw);
    
    // Log sanitization for debugging
    if (sanitized !== raw) {
      console.log(`[jsonSanitizer] Sanitized JSON (removed ${raw.length - sanitized.length} chars)`);
    }
    
    // Attempt parse
    const data = JSON.parse(sanitized);
    return { success: true, data };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[jsonSanitizer] Parse failed: ${errorMsg}`);
    return {
      success: false,
      data: null,
      error: errorMsg
    };
  }
}

/**
 * Validate that a string is valid JSON without parsing
 * Useful for checking before expensive operations
 */
export function isValidJson(raw: string): boolean {
  try {
    const sanitized = sanitizeJson(raw);
    JSON.parse(sanitized);
    return true;
  } catch {
    return false;
  }
}
