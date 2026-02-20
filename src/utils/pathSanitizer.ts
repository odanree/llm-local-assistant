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
   * 
   * ✅ SENIOR FIX: "Angrier" Executor with strict path rules
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

    // ✅ FIX 1: STRICT "NO-SPACE" RULE (Danh's Senior Fix)
    // File paths should almost never have multiple spaces in web projects
    // If more than 1 space, it's a sentence (description), not a path
    const spaceCount = (trimmedPath.match(/ /g) || []).length;
    if (spaceCount > 1) {
      return createValidationReport(
        false,
        `PATH_VIOLATION: Path contains ${spaceCount} spaces (looks like a sentence): "${trimmedPath}". ` +
        `Web project paths should be kebab-case or camelCase, not sentences.`,
        [ViolationCodes.PATH_INVALID],
        { action: context?.action, targetFile: rawPath }
      );
    }

    // ✅ FIX 2: STRICT EXTENSION REQUIREMENT (Danh's Senior Fix)
    // MUST have a file extension in web projects
    if (!trimmedPath.includes('.')) {
      return createValidationReport(
        false,
        `PATH_VIOLATION: Path has no file extension: "${trimmedPath}". ` +
        `Web project paths MUST include extension (.tsx, .ts, .js, .json, etc.).`,
        [ViolationCodes.PATH_INVALID],
        { action: context?.action, targetFile: rawPath }
      );
    }

    // ✅ FIX 2B: SPACE IN FILENAME (Danh's Fix)
    // Filenames should usually not have spaces - indicates LLM description
    // Extract filename portion (after last /)
    const lastSlash = trimmedPath.lastIndexOf('/');
    const filename = lastSlash === -1 ? trimmedPath : trimmedPath.substring(lastSlash + 1);
    if (filename.includes(' ') && !filename.startsWith('"') && !filename.startsWith("'")) {
      return createValidationReport(
        false,
        `PATH_VIOLATION: Filename contains spaces: "${filename}". ` +
        `Web project filenames should use kebab-case or camelCase, not spaces.`,
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
      /^contains\s+/i,
      /^has\s+the\s+/i,
      /^with\s+/i,
      /^for\s+the\s+/i,
      /^includes\s+/i,
      /^(jsx|code|form|html)\s+/i, // Match only at beginning, not in "components/"
    ];

    const isDescription =
      trimmedPath.length > 100 || // Too long for a path
      descriptionPatterns.some(p => p.test(trimmedPath));

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
      return createValidationReport(
        false,
        `PATH_VIOLATION: Path has invalid extension: "${trimmedPath}". ` +
        `Valid extensions: .tsx, .ts, .jsx, .js, .json, .css, .scss, .html`,
        [ViolationCodes.PATH_INVALID],
        { action: context?.action, targetFile: rawPath }
      );
    }

    // Guard 6: Path starts with valid directory (src/, app/, components/, etc.)
    const validPrefixes = ['src/', 'app/', 'components/', 'pages/', 'utils/', 'styles/', 'public/', './', '../'];
    const hasValidPrefix = validPrefixes.some(prefix => trimmedPath.startsWith(prefix)) ||
                          !trimmedPath.includes('/'); // Allow single-file paths

    if (!hasValidPrefix) {
      return createValidationReport(
        false,
        `PATH_VIOLATION: Path doesn't start with recognized directory: "${trimmedPath}". ` +
        `Use: src/, app/, components/, pages/, utils/, styles/, public/, ./, or ../`,
        [ViolationCodes.PATH_INVALID],
        { action: context?.action, targetFile: rawPath }
      );
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

    // ✅ EARLY: Normalize placeholders BEFORE removing underscores
    // (Otherwise {PROJECT_ROOT} becomes {PROJECTROOT} when _ is removed)
    const placeholderNormalizations = [
      { pattern: /^\{PROJECT_ROOT\}\//i, replace: 'src/' },
      { pattern: /^\{workspacePath\}\//i, replace: '' },
    ];
    for (const { pattern, replace } of placeholderNormalizations) {
      if (pattern.test(clean)) {
        clean = clean.replace(pattern, replace);
      }
    }

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
    clean = clean.replace(/^for\s+the\s+.+?:\s*/i, ''); // "for the X: " → "" (handles multi-word like "login form")
    clean = clean.replace(/^(description|path|file):\s*/i, '');

    // 3. Normalize remaining placeholders (ones not caught during normalizeString)
    const placeholders = [
      { pattern: /^\/path\/to\//i, replace: 'src/' },
      { pattern: /^your-project\//i, replace: '' },
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
