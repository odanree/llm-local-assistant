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

## Requirements
1. Maintain all existing functionality
2. Preserve all props, state, and logic
3. Use modern React patterns (hooks, context, custom hooks)
4. Add proper error handling
5. Include TypeScript types
6. Add JSDoc comments for new functions
7. Keep the code readable and maintainable

## Output Format
Provide the refactored code in a TypeScript code block, then explain the changes made.

\`\`\`typescript
// Refactored code here
\`\`\`

## Changes
- Change 1: description
- Change 2: description
- Change 3: description

## Explanation
Detailed explanation of how the pattern was applied...
`
    );
  }

  /**
   * Get pattern-specific refactoring guidelines
   */
  private getPatternGuidelines(pattern: string): string {
    const guidelines: Record<string, string> = {
      StateManagement: `
- Extract component state into a custom hook or store
- Use Zustand, Redux, or Context API for global state
- Remove unnecessary useState calls
- Implement proper state getters/setters
- Add loading and error states
- Implement state reset/cleanup functions`,

      DataFetching: `
- Extract API calls into a custom hook (useData pattern)
- Implement proper loading states
- Add error handling and retry logic
- Use useEffect for data fetching
- Implement request cancellation on unmount
- Add caching where appropriate
- Handle race conditions properly`,

      Forms: `
- Extract form state into a custom hook or store
- Implement field validation
- Add error messages and display
- Use form libraries (React Hook Form, Formik) if complex
- Implement proper submission handling
- Add loading state during submission
- Implement form reset functionality`,

      CRUD: `
- Implement separate functions for Create, Read, Update, Delete
- Add proper error handling for each operation
- Implement optimistic updates where appropriate
- Add loading states for each operation
- Implement proper data synchronization
- Add validation for each operation
- Use proper HTTP methods (GET, POST, PUT, DELETE)`,

      Pagination: `
- Split data into pages with configurable page size
- Implement page navigation controls
- Handle edge cases (empty data, partial pages)
- Add loading state during page transitions
- Preserve filters/sorts during pagination
- Implement keyboard navigation
- Add total count and current page indicators`,

      Authentication: `
- Implement login/logout flows
- Add token management (storage, refresh)
- Implement protected routes
- Add session checking on mount
- Implement role-based access control if needed
- Add proper error handling for auth failures
- Implement logout on token expiration`,

      Notifications: `
- Create a notification context/store
- Implement toast/alert component
- Add auto-dismiss with configurable duration
- Implement different notification types (success, error, info, warning)
- Add notification queue management
- Implement accessibility features (ARIA)
- Add click-to-dismiss functionality`,

      SearchFilter: `
- Implement search input with debouncing
- Add filter selection UI
- Implement combined search + filter logic
- Add clear/reset functionality
- Implement URL params for state persistence
- Add loading state during search
- Implement result count display
- Add "no results" handling`,
    };

    return guidelines[pattern] || `Apply the ${pattern} pattern appropriately to this code.`;
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
