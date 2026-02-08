/**
 * Path Sanitizer: Strict Path Guard & Circuit Breaker
 * 
 * Purpose: Acts as a circuit breaker between Planner output and filesystem calls.
 * Rejects malformed paths BEFORE they create garbage files.
 * 
 * Danh's principle: Fail-fast on path validation, not after file corruption.
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
   * Sanitize a path by removing/fixing common issues
   * 
   * This is more aggressive than validate() — it tries to fix instead of just rejecting.
   */
  static sanitizePath(rawPath: string, workspace?: string): string {
    let sanitized = rawPath.trim();

    // Remove common description patterns
    sanitized = sanitized.replace(/contains.*JSX.*code/i, '');
    sanitized = sanitized.replace(/for.*form.*component/i, '');
    sanitized = sanitized.replace(/^(description|path|file):\s*/i, '');

    // If empty after cleaning, it was definitely a description
    if (sanitized.length === 0) {
      throw new Error(`Cannot sanitize path: input was pure description "${rawPath}"`);
    }

    // Take first valid component if multiple paths
    if (sanitized.includes(',')) {
      const parts = sanitized.split(',').map(p => p.trim());
      sanitized = parts[0]; // Take first
    }

    // Normalize path separators
    sanitized = sanitized.replace(/\\/g, '/');

    // Ensure relative path if workspace provided
    if (workspace && !sanitized.startsWith('/')) {
      // Already relative, good
    }

    return sanitized;
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
