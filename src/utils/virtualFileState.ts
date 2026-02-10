/**
 * VirtualFileState: Maintain document state across plan execution steps
 *
 * Part of Phase 5: Code Continuity Architecture
 * 
 * Instead of LLM generating isolated snapshots, we maintain the actual
 * code in memory and ask the LLM to apply JSON Patches or edits to it.
 * 
 * This solves the "Fragmented Context" problem where each step forgets
 * the scaffolding from previous steps (component wrapper, imports, etc).
 */

export interface FileEdit {
  type: 'search-replace' | 'json-patch' | 'append' | 'prepend';
  path: string;
  original?: string; // For search-replace
  replacement?: string; // For search-replace
  patch?: any; // For JSON Patch (RFC 6902)
  content?: string; // For append/prepend
  lineNumber?: number; // For precise line edits
}

export class VirtualFileState {
  private files: Map<string, string> = new Map();
  private history: Array<{ step: number; edits: FileEdit[]; timestamp: Date }> = [];

  /**
   * Initialize virtual file with content
   */
  loadFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  /**
   * Get current file content
   */
  getFile(path: string): string | undefined {
    return this.files.get(path);
  }

  /**
   * Get all files
   */
  getAllFiles(): { path: string; content: string }[] {
    const result: { path: string; content: string }[] = [];
    for (const [path, content] of this.files) {
      result.push({ path, content });
    }
    return result;
  }

  /**
   * Apply a file edit to the virtual state
   * Returns true if successful, false if failed
   */
  applyEdit(edit: FileEdit): { success: boolean; error?: string } {
    const content = this.files.get(edit.path);
    if (!content) {
      return { success: false, error: `File not found: ${edit.path}` };
    }

    try {
      switch (edit.type) {
        case 'search-replace':
          if (!edit.original || !edit.replacement) {
            return { success: false, error: 'search-replace requires original and replacement' };
          }
          if (!content.includes(edit.original)) {
            return { success: false, error: `Original text not found in ${edit.path}` };
          }
          this.files.set(edit.path, content.replace(edit.original, edit.replacement));
          return { success: true };

        case 'append':
          if (!edit.content) {
            return { success: false, error: 'append requires content' };
          }
          this.files.set(edit.path, content + '\n' + edit.content);
          return { success: true };

        case 'prepend':
          if (!edit.content) {
            return { success: false, error: 'prepend requires content' };
          }
          this.files.set(edit.path, edit.content + '\n' + content);
          return { success: true };

        case 'json-patch':
          // TODO: Implement RFC 6902 JSON Patch
          return { success: false, error: 'json-patch not yet implemented' };

        default:
          return { success: false, error: `Unknown edit type: ${edit.type}` };
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Record a step's edits in history
   */
  recordStep(stepNumber: number, edits: FileEdit[]): void {
    this.history.push({
      step: stepNumber,
      edits,
      timestamp: new Date(),
    });
  }

  /**
   * Get step history
   */
  getHistory() {
    return [...this.history];
  }

  /**
   * Create a "context snapshot" for LLM: current file state + edit instructions
   * Used to prompt the LLM for the next step
   */
  createStepContext(path: string, stepNumber: number): string {
    const content = this.files.get(path);
    if (!content) {
      return `File not found: ${path}`;
    }

    return `## Current File State (Step ${stepNumber})

\`\`\`tsx
${content}
\`\`\`

## Instructions for Next Step
- Provide ONLY the edits needed (search-replace pairs)
- OR provide the full component with this marker: \`// ... existing code\`
- Ensure all imports are complete
- Do NOT generate broken partial snippets
- If you modify a hook (useState, useEffect, etc), ensure it's imported
`;
  }

  /**
   * Validate file syntax (basic check: balanced braces, valid imports)
   */
  validateSyntax(path: string): { valid: boolean; errors: string[] } {
    const content = this.files.get(path);
    if (!content) {
      return { valid: false, errors: ['File not found'] };
    }

    const errors: string[] = [];

    // Check balanced braces
    const openBraces = (content.match(/{/g) || []).length;
    const closeBraces = (content.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
    }

    // Check balanced parentheses
    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      errors.push(`Unbalanced parentheses: ${openParens} open, ${closeParens} close`);
    }

    // Check for common missing imports
    if (content.includes('useState') && !content.includes("import { useState }")) {
      errors.push("useState used but not imported");
    }
    if (content.includes('useEffect') && !content.includes("import { useEffect }")) {
      errors.push("useEffect used but not imported");
    }
    if (content.includes('useContext') && !content.includes("import { useContext }")) {
      errors.push("useContext used but not imported");
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Reset all state (for new plan execution)
   */
  clear(): void {
    this.files.clear();
    this.history = [];
  }
}
