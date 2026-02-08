import { LLMClient } from './llmClient';

/**
 * Phase 3.5: Pattern-Based Code Refactoring
 * Generates refactored code to apply architectural patterns
 */

export interface RefactoringResult {
  originalCode: string;
  refactoredCode: string;
  pattern: string;
  changes: string[];
  explanation: string;
  success: boolean;
  error?: string;
}

export class PatternRefactoringGenerator {
  private llmClient: LLMClient;

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
  }

  /**
   * Generate refactored code to apply a specific pattern
   */
  async generateRefactoredCode(
    code: string,
    pattern: string,
    filepath: string
  ): Promise<RefactoringResult> {
    try {
      // Get pattern-specific prompt
      const prompt = this.getPatternRefactoringPrompt(code, pattern, filepath);

      // Call LLM to generate refactored code
      const response = await this.llmClient.sendMessage(prompt);

      if (!response.success || !response.message) {
        return {
          originalCode: code,
          refactoredCode: code,
          pattern,
          changes: [],
          explanation: 'Failed to generate refactored code',
          success: false,
          error: 'LLM call failed',
        };
      }

      // Extract refactored code from response
      const codeMatch = response.message.match(/```(?:typescript|javascript)?\n([\s\S]*?)\n```/);
      if (!codeMatch) {
        return {
          originalCode: code,
          refactoredCode: code,
          pattern,
          changes: [],
          explanation: 'Could not extract refactored code from LLM response',
          success: false,
          error: 'Code extraction failed',
        };
      }

      const refactoredCode = codeMatch[1];

      // Extract changes explanation from response
      const changesMatch = response.message.match(/## Changes\n([\s\S]*?)(?:##|$)/);
      const explanation = response.message;
      const changes = this.extractChanges(changesMatch ? changesMatch[1] : '');

      return {
        originalCode: code,
        refactoredCode,
        pattern,
        changes,
        explanation,
        success: true,
      };
    } catch (error) {
      return {
        originalCode: code,
        refactoredCode: code,
        pattern,
        changes: [],
        explanation: `Error during refactoring: ${error instanceof Error ? error.message : String(error)}`,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate pattern-specific refactoring prompt
   */
  private getPatternRefactoringPrompt(code: string, pattern: string, filepath: string): string {
    const basePrompt = `Refactor this code to apply the ${pattern} architectural pattern.

File: ${filepath}

Current code:
\`\`\`typescript
${code}
\`\`\`

Apply the ${pattern} pattern following these guidelines:`;

    const patternGuidelines = this.getPatternGuidelines(pattern);

    return (
      basePrompt +
      `
${patternGuidelines}

## CRITICAL Requirements (DO NOT BREAK THESE)
1. **PRESERVE all existing components, functions, and exports**
   - Do NOT remove or replace existing JSX components
   - Do NOT delete function calls or component renders
   - Do NOT strip CSS modules or styling imports
   - Keep all props, parameters, and function signatures

2. **ENHANCE, don't REPLACE**
   - Extract logic into hooks/utilities while keeping existing components
   - Create NEW hooks/functions, don't remove originals
   - Use extracted logic WITHIN the existing components
   - Wrap existing components with new patterns, don't replace them

3. **Maintain all existing functionality**
   - All features must work exactly as before
   - All UI elements must render
   - All business logic must be preserved
   - User experience must not change (except improvements)

4. Use modern React patterns (hooks, context, custom hooks)
5. Add proper error handling
6. Include TypeScript types
7. Add JSDoc comments for new functions
8. Keep the code readable and maintainable

## Output Format
Provide the refactored code in a TypeScript code block, then explain the changes made.

IMPORTANT: The refactored code must be a MODIFIED VERSION of the original, not a complete rewrite.

\`\`\`typescript
// Refactored code here - should look similar to original but with pattern applied
\`\`\`

## Changes
- Change 1: description (what was added/extracted, not removed)
- Change 2: description (how pattern was applied while preserving functionality)

## Explanation
Detailed explanation of how the pattern was applied while maintaining all original functionality...
`
    );
  }

  /**
   * Get pattern-specific refactoring guidelines
   */
  private getPatternGuidelines(pattern: string): string {
    const guidelines: Record<string, string> = {
      StateManagement: `
- Extract component state into a custom hook or store (e.g., useCartState) using Zustand or Context API
- Keep the original component structure and JSX
- Use the extracted hook within the existing component
- Preserve all prop drilling and component hierarchy`,

      DataFetching: `
- Extract API calls into a custom hook (useData pattern)
- Implement proper loading states
- Add error handling and retry logic
- Use useEffect for data fetching
- Implement request cancellation on unmount
- Add caching where appropriate
- Handle race conditions properly`,

      Forms: `
- Extract form state into a custom hook (e.g., useCostForm) but KEEP the original component structure
- Implement field validation using libraries like Yup or Zod
- Add error display for each field
- Use React Hook Form or Formik to manage form state
- Add loading state and submission handling
- Implement form reset
- KEEP all existing JSX and child components - just enhance the form logic`,

      CRUD: `
- Create separate functions for Create, Read, Update, Delete operations
- Add proper error handling and validation
- Implement loading/success/error states
- Use optimistic updates where appropriate
- PRESERVE the existing UI that uses these operations
- Wrap CRUD operations in custom hooks
- Don't remove any existing components or UI elements`,

      Pagination: `
- Create a custom hook to manage pagination state (currentPage, pageSize, totalItems)
- Implement page navigation controls
- Add loading states and error handling
- Preserve filters and sorts across page changes
- KEEP the original list component that displays items
- Just add pagination logic around it, don't replace it`,

      Authentication: `
- Create an auth context or hook to manage login state
- Implement login/logout functions with proper error handling
- Add token management (storage, refresh)
- Preserve all existing components
- Wrap components with auth checks, don't remove them
- Implement protected routes while keeping the existing route structure`,

      Notifications: `
- Create a notifications context/hook for managing toast/alert state
- Implement a toast component to display notifications
- Use this in existing components without removing them
- Add different notification types
- Implement auto-dismiss and user dismissal
- PRESERVE all existing functionality, just add notifications to it`,

      SearchFilter: `
- Create a custom hook for search/filter logic with debouncing
- Add search and filter state management
- Implement combined search + filter functionality
- Use this logic in the existing component that displays results
- PRESERVE the original result display, just enhance filtering
- Add proper loading/empty states while keeping the original UI structure`,
    };

    return guidelines[pattern] || `Apply the ${pattern} pattern appropriately to this code while preserving all existing functionality and components.`;
  }

  /**
   * Extract change list from explanation
   */
  private extractChanges(changesText: string): string[] {
    const lines = changesText
      .split('\n')
      .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'));

    return lines.map(line => line.replace(/^[\s\-•]+/, '').trim()).filter(line => line.length > 0);
  }

  /**
   * Generate a summary of changes for UI display
   */
  summarizeChanges(result: RefactoringResult): string {
    if (!result.success) {
      return '⚠️ Refactoring failed';
    }

    const changeCount = result.changes.length;
    if (changeCount === 0) {
      return '✅ Code refactored successfully';
    }

    return `✅ ${changeCount} major changes:\n${result.changes.slice(0, 3).map(c => `• ${c}`).join('\n')}${changeCount > 3 ? `\n• +${changeCount - 3} more...` : ''}`;
  }
}
