import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PatternRefactoringGenerator, RefactoringResult } from './patternRefactoringGenerator';
import { LLMClient } from './llmClient';

describe('PatternRefactoringGenerator', () => {
  let generator: PatternRefactoringGenerator;
  let mockLLMClient: any;

  beforeEach(() => {
    mockLLMClient = {
      sendMessage: vi.fn(),
    };
    generator = new PatternRefactoringGenerator(mockLLMClient as LLMClient);
  });

  describe('generateRefactoredCode', () => {
    it('should generate refactored code for CRUD pattern', async () => {
      const originalCode = `'use client';
        import { useState } from 'react';
        const [items, setItems] = useState([]);
        
        return <div>{items.length}</div>;
      `;

      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: `
Here's the refactored code using CRUD functions:

\`\`\`typescript
function createItem(item: any) {
  // Create logic
}
\`\`\`

## Changes
- Extracted CRUD functions
`,
      });

      const result = await generator.generateRefactoredCode(
        originalCode,
        'CRUD',
        'app/items/page.tsx'
      );

      expect(result.success).toBe(true);
      expect(result.pattern).toBe('CRUD');
      expect(result.originalCode).toBe(originalCode);
    });

    it('should block patterns that require creating new files', async () => {
      const result = await generator.generateRefactoredCode(
        "'use client'; const x = 1;",
        'Forms',
        'components/Form.tsx'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not supported yet');
    });

    it('should handle LLM exception gracefully', async () => {
      mockLLMClient.sendMessage.mockRejectedValue(new Error('Network error'));

      const result = await generator.generateRefactoredCode("'use client'; const x = 1;", 'CRUD', 'components/Items.tsx');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle malformed code block in response', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'Here is some text but no code block',
      });

      const result = await generator.generateRefactoredCode("'use client'; const x = 1;", 'CRUD', 'components/Items.tsx');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Code extraction failed');
    });
  });

  describe('summarizeChanges', () => {
    it('should summarize successful refactoring with few changes', () => {
      const result: RefactoringResult = {
        originalCode: 'const x = 1;',
        refactoredCode: 'const x = 2;',
        pattern: 'CRUD',
        changes: ['Changed value'],
        explanation: 'Updated the value',
        success: true,
      };

      const summary = generator.summarizeChanges(result);
      expect(summary).toContain('1');
      expect(summary).toContain('major');
    });

    it('should summarize with truncation for many changes', () => {
      const result: RefactoringResult = {
        originalCode: 'const x = 1;',
        refactoredCode: 'const x = 2;',
        pattern: 'CRUD',
        changes: Array(20).fill('Change'),
        explanation: 'Updated',
        success: true,
      };

      const summary = generator.summarizeChanges(result);
      expect(summary).toContain('20');
      expect(summary).toContain('+');
    });

    it('should indicate failure', () => {
      const result: RefactoringResult = {
        originalCode: 'const x = 1;',
        refactoredCode: 'const x = 1;',
        pattern: 'CRUD',
        changes: [],
        explanation: 'Failed',
        success: false,
        error: 'LLM error',
      };

      const summary = generator.summarizeChanges(result);
      expect(summary).toContain('failed');
    });
  });

  describe('pattern blocking', () => {
    it('should block StateManagement pattern (requires new files)', async () => {
      const result = await generator.generateRefactoredCode("'use client'; const x = 1;", 'StateManagement', 'components/State.tsx');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not supported yet');
    });

    it('should block Notifications pattern (requires new files)', async () => {
      const result = await generator.generateRefactoredCode("'use client'; const x = 1;", 'Notifications', 'components/Notify.tsx');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not supported yet');
    });
  });
});
