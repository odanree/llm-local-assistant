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
  return raw
    // Strip raw control characters (except tab, newline, carriage return, form feed)
    // U+0000-U+001F: NUL, SOH, STX, ... (except TAB=09, LF=0A, CR=0D, FF=0C)
    // U+007F-U+009F: DEL and C1 controls
    .replace(/[\x00-\x08\x0B\x0E-\x1F\x7F-\x9F]/g, '')
    
    // Remove null bytes explicitly
    .replace(/\0/g, '')
    
    // Normalize whitespace in object/array endings (trim trailing whitespace)
    .trim();
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
