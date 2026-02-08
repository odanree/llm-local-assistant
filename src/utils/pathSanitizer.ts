/**
 * Path Sanitizer: Strict Path Guard & Circuit Breaker
 * 
 * Purpose: Acts as a circuit breaker between Planner output and filesystem calls.
 * Rejects malformed paths BEFORE they create garbage files.
 * 
 * Danh's principle: Fail-fast on path validation, not after file corruption.
 * 
 * NEW: Postel's Law Implementation
 * "Be conservative in what you do, be liberal in what you accept from others"
 * - Reject invalid paths (conservative output)
 * - Clean & normalize LLM output (liberal input acceptance)
 * - Strip trailing prose, ellipses, quotes automatically
 */

import path from 'path';
import {
  ViolationCode,
  ViolationCodes,
  createValidationReport,
  ValidationReport,
} from '../types/validation';

export class PathSanitizer {
  /**
   * Validate a path string before filesystem operations
   * 
   * Returns ValidationReport so Executor can decide: fail fast or retry
   */
  static validatePath(
    rawPath: string | undefined,
    context?: { workspace?: string; action?: string }
  ): ValidationReport {
    // Guard: Path exists
    if (!rawPath || typeof rawPath !== 'string') {
      return createValidationReport(
        false,
        'Path is missing or not a string',
        [ViolationCodes.PATH_INVALID],
        { action: context?.action }
      );
    }

    const trimmedPath = rawPath.trim();

    // Guard 1: Path is not empty
    if (trimmedPath.length === 0) {
      return createValidationReport(
        false,
        'Path is empty string',
        [ViolationCodes.PATH_INVALID],
        { action: context?.action, targetFile: rawPath }
      );
    }

    // Guard 2: Path is not a description/sentence
    // Heuristics:
    // - Contains "contains", "has", "with", "for the" (sentence patterns)
    // - Longer than 100 chars (descriptions are verbose)
    // - Doesn't start with valid path prefix (src/, components/, etc.)
    // - Contains multiple spaces (natural language)
    const descriptionPatterns = [
      /contains.*\w+/i,
      /has\s+the\s+\w+/i,
      /with\s+\w+/i,
      /for\s+the\s+\w+/i,
      /includes\s+\w+/i,
      /jsx|code|form|component/i, // Common in descriptions
    ];

    const isDescription =
      trimmedPath.length > 100 || // Too long for a path
      descriptionPatterns.some(p => p.test(trimmedPath)) ||
      trimmedPath.split(/\s+/).length > 3; // Multiple words (3+ spaces)

    if (isDescription) {
      return createValidationReport(
        false,
        `Path looks like a description, not a filename: "${trimmedPath.substring(0, 50)}..."`,
        [ViolationCodes.PATH_DESCRIPTION],
        { action: context?.action, targetFile: rawPath }
      );
    }

    // Guard 3: Path doesn't contain multiple files (comma-separated)
    if (trimmedPath.includes(',')) {
      return createValidationReport(
        false,
        `Path contains comma-separated files (multiple files in one step): "${trimmedPath}"`,
        [ViolationCodes.PATH_MULTIPLE],
        { action: context?.action, targetFile: rawPath }
      );
    }

    // Guard 4: Path doesn't contain space-separated files
    // But allow spaces in actual filenames (e.g., "My File.tsx")
    // Only reject if it looks like multiple paths: ".tsx .tsx" pattern
    if (trimmedPath.match(/\.tsx?\s+\w+\.tsx?/)) {
      return createValidationReport(
        false,
        `Path contains multiple files (space-separated): "${trimmedPath}"`,
        [ViolationCodes.PATH_MULTIPLE],
        { action: context?.action, targetFile: rawPath }
      );
    }

    // Guard 5: Path has valid extension for code files
    const validExtensions = ['.tsx', '.ts', '.jsx', '.js', '.json', '.css', '.scss', '.html'];
    const hasValidExtension = validExtensions.some(ext => trimmedPath.endsWith(ext));

    if (!hasValidExtension) {
      // Warning, not critical (some paths might not need extension)
      // But log it for debugging
      console.warn(`[PathSanitizer] Path has no standard extension: "${trimmedPath}"`);
    }

    // Guard 6: Path starts with valid directory (src/, app/, components/, etc.)
    const validPrefixes = ['src/', 'app/', 'components/', 'pages/', 'utils/', 'styles/', 'public/', './', '../'];
    const hasValidPrefix = validPrefixes.some(prefix => trimmedPath.startsWith(prefix)) ||
                          !trimmedPath.includes('/'); // Allow single-file paths

    if (!hasValidPrefix) {
      console.warn(`[PathSanitizer] Path doesn't start with common directory: "${trimmedPath}"`);
    }

    // If all guards passed, return success
    return createValidationReport(
      true,
      `Path validated successfully: "${trimmedPath}"`,
      [],
      { action: context?.action, targetFile: trimmedPath }
    );
  }

  /**
   * ✅ SENIOR FIX: String Normalization (Danh's Markdown Artifact Handling)
   * 
   * Strips ALL markdown/control character artifacts with hardened regex.
   * This is called BEFORE validation to ensure LLM output is clean.
   * 
   * Handles:
   * - Markdown backticks: `path.tsx` → path.tsx
   * - Trailing prose: path.tsx... → path.tsx
   * - Control characters: \u0000-\u001F → removed
   * 
   * Pattern: Tolerant Receiver — Accept any input, normalize aggressively
   */
  static normalizeString(inputPath: string): string {
    if (!inputPath || typeof inputPath !== 'string') {
      return '';
    }

    let clean = inputPath.trim();

    // 1. Strip Markdown backticks (e.g., `path.tsx`)
    clean = clean.replace(/[`]/g, '');

    // 2. Strip LLM "trailing prose" (e.g., path.tsx...)
    clean = clean.replace(/\.{2,}$/, '');

    // 3. Remove accidental whitespace or control characters (UTF-8 artifacts)
    clean = clean.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');

    // 4. Strip markdown quotes and emphasis markers
    clean = clean.replace(/[*_~]/g, '');

    // 5. Remove stray punctuation at end
    clean = clean.replace(/[,;!?:]+$/, '');

    // 6. Remove accidental quotes
    clean = clean.replace(/["']/g, '');

    // 7. Clean up whitespace (normalize multiple spaces to single)
    clean = clean.replace(/\s+/g, ' ').trim();

    return clean;
  }

  /**
   * Sanitize a path by removing/fixing common issues
   * 
   * Danh's Postel's Law Implementation:
   * - Conservative: Reject invalid paths
   * - Liberal: Clean & normalize LLM output automatically
   * 
   * This is more aggressive than validate() — it tries to fix instead of just rejecting.
   */
  static sanitizePath(rawPath: string, workspace?: string): string {
    if (!rawPath) {
      throw new Error('Cannot sanitize empty path');
    }

    // ✅ STEP 1: Normalize string first (strip markdown artifacts)
    let clean = this.normalizeString(rawPath);

    if (clean.length === 0) {
      throw new Error(`Cannot sanitize path: input was pure description "${rawPath}"`);
    }

    // 2. Remove common description patterns
    clean = clean.replace(/contains.*JSX.*code/i, '');
    clean = clean.replace(/for.*form.*component/i, '');
    clean = clean.replace(/^(description|path|file):\s*/i, '');

    // 3. Normalize common placeholders (The /path/to/ fix)
    const placeholders = [
      { pattern: /^\/path\/to\//i, replace: 'src/' },
      { pattern: /^your-project\//i, replace: '' },
      { pattern: /^{PROJECT_ROOT}\//i, replace: 'src/' },
      { pattern: /^\{workspacePath\}\//i, replace: '' },
      { pattern: /^\.\/src\//i, replace: 'src/' },
      { pattern: /^\.\/components\//i, replace: 'src/components/' },
    ];

    for (const { pattern, replace } of placeholders) {
      if (pattern.test(clean)) {
        clean = clean.replace(pattern, replace);
      }
    }

    // 4. Final validation gate
    // If it still has spaces or is too long, it's definitely a description
    if (clean.includes(' ') || clean.length > 100) {
      throw new Error(
        `CRITICAL: Path is too descriptive after cleaning: "${clean}". ` +
        `Original input: "${rawPath}"`
      );
    }

    // If empty after cleaning, it was definitely a description
    if (clean.length === 0) {
      throw new Error(`Cannot sanitize path: input was pure description "${rawPath}"`);
    }

    // Take first valid component if multiple paths remain
    if (clean.includes(',')) {
      const parts = clean.split(',').map(p => p.trim());
      clean = parts[0]; // Take first
    }

    // Normalize path separators
    clean = clean.replace(/\\/g, '/');

    return clean;
  }

  /**
   * Extract filename from a potentially malformed path
   */
  static extractFilename(rawPath: string): string {
    const sanitized = rawPath.trim();
    const lastSlash = sanitized.lastIndexOf('/');
    if (lastSlash === -1) {
      return sanitized; // No slashes, entire thing is filename
    }
    return sanitized.substring(lastSlash + 1);
  }
}
