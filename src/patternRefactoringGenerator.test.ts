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
    it('should generate refactored code for StateManagement pattern', async () => {
      const originalCode = `'use client';
        import { useState } from 'react';
        const [cart, setCart] = useState([]);
        const [loading, setLoading] = useState(false);
        
        return <div>{cart.length}</div>;
      `;

      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: `
Here's the refactored code using Zustand for state management:

\`\`\`typescript
import { create } from 'zustand';

const useCartStore = create((set) => ({
  cart: [],
  addItem: (item) => set((state) => ({ cart: [...state.cart, item] })),
}));

export default function CartPage() {
  const cart = useCartStore(state => state.cart);
  return <div>{cart.length}</div>;
}
\`\`\`

## Changes
- Extracted cart state to Zustand store
- Removed useState for cart management
- Added type-safe store methods
- Simplified component logic

## Explanation
The code now uses Zustand for global state management, which provides better performance and easier debugging.
        `,
      });

      const result = await generator.generateRefactoredCode(
        originalCode,
        'StateManagement',
        'app/cart/page.tsx'
      );

      expect(result.success).toBe(true);
      expect(result.pattern).toBe('StateManagement');
      expect(result.refactoredCode).toContain('useCartStore');
      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.originalCode).toBe(originalCode);
    });

    it('should generate refactored code for DataFetching pattern', async () => {
      const originalCode = `
        const [data, setData] = useState(null);
        
        useEffect(() => {
          fetch('/api/data').then(r => r.json()).then(setData);
        }, []);
        
        return <div>{data?.name}</div>;
      `;

      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: `
\`\`\`typescript
function useData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    setLoading(true);
    fetch('/api/data')
      .then(r => r.json())
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);
  
  return { data, loading, error };
}

export default function Page() {
  const { data, loading, error } = useData();
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  return <div>{data?.name}</div>;
}
\`\`\`

## Changes
- Extracted data fetching to custom hook
- Added loading and error states
- Implemented proper error handling
- Added loading UI

## Explanation
The refactored code separates data fetching logic into a reusable hook.
        `,
      });

      const result = await generator.generateRefactoredCode(
        originalCode,
        'DataFetching',
        'app/products/page.tsx'
      );

      expect(result.success).toBe(true);
      expect(result.refactoredCode).toContain('useData');
      expect(result.refactoredCode).toContain('loading');
      expect(result.refactoredCode).toContain('error');
    });

    it('should handle LLM failure gracefully', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: false,
        message: null,
      });

      const result = await generator.generateRefactoredCode('const x = 1;', 'Forms', 'app.tsx');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.refactoredCode).toBe('const x = 1;');
    });

    it('should handle LLM exception gracefully', async () => {
      mockLLMClient.sendMessage.mockRejectedValue(new Error('Network error'));

      const result = await generator.generateRefactoredCode("'use client'; const x = 1;", 'Forms', 'components/Form.tsx');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle malformed code block in response', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'Here is some text but no code block',
      });

      const result = await generator.generateRefactoredCode("'use client'; const x = 1;", 'Forms', 'components/Form.tsx');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Code extraction failed');
    });
  });

  describe('summarizeChanges', () => {
    it('should summarize successful refactoring with few changes', () => {
      const result: RefactoringResult = {
        originalCode: 'original',
        refactoredCode: 'refactored',
        pattern: 'StateManagement',
        changes: ['Change 1', 'Change 2'],
        explanation: 'Explanation',
        success: true,
      };

      const summary = generator.summarizeChanges(result);

      expect(summary).toContain('2 major changes');
      expect(summary).toContain('Change 1');
      expect(summary).toContain('Change 2');
    });

    it('should summarize with truncation for many changes', () => {
      const result: RefactoringResult = {
        originalCode: 'original',
        refactoredCode: 'refactored',
        pattern: 'Forms',
        changes: ['C1', 'C2', 'C3', 'C4', 'C5'],
        explanation: 'Explanation',
        success: true,
      };

      const summary = generator.summarizeChanges(result);

      expect(summary).toContain('5 major changes');
      expect(summary).toContain('+2 more');
    });

    it('should indicate failure', () => {
      const result: RefactoringResult = {
        originalCode: 'original',
        refactoredCode: 'original',
        pattern: 'Forms',
        changes: [],
        explanation: 'Failed',
        success: false,
        error: 'Some error',
      };

      const summary = generator.summarizeChanges(result);

      expect(summary).toContain('failed');
    });
  });

  describe('pattern guidelines', () => {
    it('should include StateManagement guidelines', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: `\`\`\`typescript\nconst x = 1;\n\`\`\`\n## Changes\n- Test`,
      });

      await generator.generateRefactoredCode("'use client'; const x = 1;", 'StateManagement', 'components/State.tsx');

      const callArgs = mockLLMClient.sendMessage.mock.calls[0][0];
      expect(callArgs).toContain('StateManagement');
      expect(callArgs).toContain('Zustand');
    });

    it('should include DataFetching guidelines', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: `\`\`\`typescript\nconst x = 1;\n\`\`\`\n## Changes\n- Test`,
      });

      await generator.generateRefactoredCode('x', 'DataFetching', 'app.tsx');

      const callArgs = mockLLMClient.sendMessage.mock.calls[0][0];
      expect(callArgs).toContain('DataFetching');
      expect(callArgs).toContain('useEffect');
    });

    it('should include Forms guidelines', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: `\`\`\`typescript\nconst x = 1;\n\`\`\`\n## Changes\n- Test`,
      });

      await generator.generateRefactoredCode("'use client'; const x = 1;", 'Forms', 'components/Form.tsx');

      const callArgs = mockLLMClient.sendMessage.mock.calls[0][0];
      expect(callArgs).toContain('Forms');
      expect(callArgs).toContain('validation');
    });

    it('should include CRUD guidelines', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: `\`\`\`typescript\nconst x = 1;\n\`\`\`\n## Changes\n- Test`,
      });

      await generator.generateRefactoredCode('x', 'CRUD', 'app.tsx');

      const callArgs = mockLLMClient.sendMessage.mock.calls[0][0];
      expect(callArgs).toContain('CRUD');
      expect(callArgs).toContain('Create, Read, Update, Delete');
    });

    it('should handle unknown patterns gracefully', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: `\`\`\`typescript\nconst x = 1;\n\`\`\`\n## Changes\n- Test`,
      });

      const result = await generator.generateRefactoredCode('x', 'UnknownPattern', 'app.tsx');

      expect(result.success).toBe(true);
      const callArgs = mockLLMClient.sendMessage.mock.calls[0][0];
      expect(callArgs).toContain('UnknownPattern');
    });
  });

  describe('change extraction', () => {
    it('should extract changes from bullet list format', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: `\`\`\`typescript\ncode\n\`\`\`\n## Changes\n- First change\n- Second change\n- Third change`,
      });

      const result = await generator.generateRefactoredCode("'use client'; const x = 1;", 'Forms', 'components/Form.tsx');

      expect(result.changes).toContain('First change');
      expect(result.changes).toContain('Second change');
      expect(result.changes).toContain('Third change');
    });

    it('should extract changes from markdown format', async () => {
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: `\`\`\`typescript\ncode\n\`\`\`\n## Changes\n• Changed state management\n• Updated props\n• Removed unused code`,
      });

      const result = await generator.generateRefactoredCode("'use client'; const x = 1;", 'Forms', 'components/Form.tsx');

      expect(result.changes.length).toBeGreaterThan(0);
    });
  });
});
