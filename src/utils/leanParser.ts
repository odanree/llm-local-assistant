/**
 * Lean Parser: Optimized for qwen2.5-coder:7b output
 * 
 * Danh's insight: "Positional Anchoring"
 * Small models are heavily biased by start and end of sequence.
 * By mandating // @path: header and export footer, we "sandwich" model into valid code.
 */

/**
 * Parse lean code output format:
 * - Start: // @path: <FILE_PATH>
 * - End: export default <NAME>;
 * - No markdown fences
 */
export function parseLeanOutput(rawText: string): { filePath: string; cleanCode: string } {
  // 1. Extract path from mandatory header
  const pathMatch = rawText.match(/^\/\/\s*@path:\s*(.+?)(?:\n|$)/);
  if (!pathMatch) {
    throw new Error('Validation Failed: Missing @path header. First line must be: // @path: <FILE_PATH>');
  }
  const filePath = pathMatch[1].trim();

  // 2. Strip the header line and any markdown fences to get clean code
  let cleanCode = rawText
    .replace(/^\/\/\s*@path:.+\n/, '') // Remove @path header
    .replace(/^```tsx?\n?/gm, '') // Remove markdown fences
    .replace(/\n```$/gm, '') // Remove closing markdown
    .trim();

  // 3. Guard: Does it have an export?
  if (!cleanCode.includes('export default')) {
    throw new Error('Validation Failed: Missing Export Anchor. Code must end with: export default <COMPONENT_NAME>;');
  }

  // 4. Guard: Does it start with import React?
  if (!cleanCode.startsWith('import')) {
    throw new Error('Validation Failed: Code must start with import statement. First line should be: import React from "react";');
  }

  return { filePath, cleanCode };
}

/**
 * Validate lean output structure before execution
 */
export function validateLeanOutput(rawText: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for @path header
  if (!rawText.match(/^\/\/\s*@path:/m)) {
    errors.push('Missing @path header (first line must be: // @path: <FILE_PATH>)');
  }

  // Check for export default footer
  if (!rawText.includes('export default')) {
    errors.push('Missing export default statement');
  }

  // Check for markdown fences (should be eliminated)
  if (rawText.includes('```')) {
    errors.push('Contains markdown fences (```) - should be raw code only');
  }

  // Check for common hallucinations
  if (rawText.includes('Here is') || rawText.includes('Sure!') || rawText.includes('Here\'s')) {
    errors.push('Contains conversational text (explanations detected)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
