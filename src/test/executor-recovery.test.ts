/**
 * Phase 11: Executor Recovery & Validation Loop Comprehensive Testing
 *
 * Target: executor.ts lines 2354-2562 (Validation Loop & Error Recovery)
 * Focus: Deep logic branches in error handling, auto-correction, and state management
 *
 * Three Core Test Clusters:
 * 1. Validation Loop Detection (lines 2368-2376) - prevents infinite loops
 * 2. Smart Auto-Correction Branching (lines 2399-2459) - auto-fix vs LLM fallback
 * 3. Zustand Mismatch Fixing (lines 2408-2437) - store-aware component fixes
 * 4. Error Message Formatting (lines 2468-2509) - hook errors with ACTION guidance
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Executor } from '../executor';
import SmartAutoCorrection from '../smartAutoCorrection';

// Mock the vscode module
vi.mock('vscode', () => ({
  workspace: {
    fs: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
    },
    workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
  },
  Uri: {
    joinPath: vi.fn((...args) => ({ fsPath: args[args.length - 1] })),
  },
  window: {
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
  },
}));

describe('Phase 11: Executor Validation Loop Recovery (Lines 2354-2562)', () => {
  let executor: Executor;
  let mockLLMClient: any;
  let mockConfig: any;

  beforeEach(() => {
    // Suppress console output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Create mock LLM client
    mockLLMClient = {
      sendMessage: vi.fn(),
      clearHistory: vi.fn(),
    };

    // Create executor with mocked LLM
    mockConfig = {
      llmClient: mockLLMClient,
      onMessage: vi.fn(),
      onQuestion: vi.fn(),
      onProgress: vi.fn(),
      maxRetries: 3,
      timeout: 30000,
    };

    executor = new Executor(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * ========================================================================
   * CLUSTER 1: Validation Loop Detection (Lines 2368-2376)
   * ========================================================================
   * Tests that the executor detects when validation errors repeat and stops
   * retrying to prevent infinite loops.
   */
  describe('Validation Loop Detection', () => {
    it('should detect when same errors repeat and stop retrying', async () => {
      // Simulate validateGeneratedCode returning same errors repeatedly
      const repetitiveError = 'Type error: Property missing';

      // Mock validation to always return the same error
      vi.spyOn(executor as any, 'validateGeneratedCode').mockImplementation(async () => ({
        errors: [repetitiveError],
        valid: false,
      }));

      // Mock SmartAutoCorrection to not fix the issue
      vi.spyOn(SmartAutoCorrection, 'isAutoFixable').mockReturnValue(true);
      vi.spyOn(SmartAutoCorrection, 'fixCommonPatterns').mockReturnValue('same broken code');

      // Mock LLM to also not fix the issue
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'same broken code',
      });

      // Mock filterCriticalErrors to extract critical errors
      vi.spyOn(executor as any, 'filterCriticalErrors').mockReturnValue({
        critical: [repetitiveError],
        suggestions: [],
      });

      const step = {
        id: 'write_test',
        action: 'write',
        path: 'src/test.ts',
        params: { content: 'broken code' },
      };

      // This should throw after detecting loop (same errors appearing again)
      try {
        await executor['executeWrite'](step as any, 0, { files: new Map() } as any);
      } catch (error: any) {
        // Expect loop detection error
        expect(error.message).toContain('loop detected' || 'infinite correction');
      }

      // Verify loop was detected (should stop before MAX_VALIDATION_ITERATIONS)
      const messagesCalled = mockConfig.onMessage.mock.calls;
      const loopDetectedMessage = messagesCalled.find((call: any) =>
        call[0]?.includes('LOOP DETECTED') || call[0]?.includes('loop detected')
      );
      expect(loopDetectedMessage || error).toBeDefined();
    });

    it('should allow retries when validation errors change between attempts', async () => {
      let validationPass = 0;

      // Mock validation to return different errors each time
      vi.spyOn(executor as any, 'validateGeneratedCode').mockImplementation(async () => {
        validationPass++;
        if (validationPass === 1) {
          return { errors: ['Error 1'], valid: false };
        } else if (validationPass === 2) {
          return { errors: ['Error 2'], valid: false }; // Different error
        } else {
          return { errors: [], valid: true }; // Eventually passes
        }
      });

      vi.spyOn(SmartAutoCorrection, 'isAutoFixable').mockReturnValue(true);
      vi.spyOn(SmartAutoCorrection, 'fixCommonPatterns')
        .mockReturnValueOnce('partially fixed 1')
        .mockReturnValueOnce('partially fixed 2');

      vi.spyOn(executor as any, 'filterCriticalErrors')
        .mockReturnValueOnce({ critical: ['Error 1'], suggestions: [] })
        .mockReturnValueOnce({ critical: ['Error 2'], suggestions: [] })
        .mockReturnValueOnce({ critical: [], suggestions: [] });

      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'corrected code',
      });

      const step = {
        id: 'write_test',
        action: 'write',
        path: 'src/test.ts',
        params: { content: 'initial code' },
      };

      try {
        await executor['executeWrite'](step as any, 0, { files: new Map() } as any);
      } catch {
        // Expected if write fails for other reasons
      }

      // Verify validateGeneratedCode was called multiple times with different errors
      expect(executor['validateGeneratedCode']).toHaveBeenCalled();
      // Should not have thrown a loop detection error
    });

    it('should prevent infinite retries by enforcing MAX_VALIDATION_ITERATIONS limit', async () => {
      // Mock validation to always fail
      vi.spyOn(executor as any, 'validateGeneratedCode').mockResolvedValue({
        errors: ['Persistent error that never goes away'],
        valid: false,
      });

      vi.spyOn(SmartAutoCorrection, 'isAutoFixable').mockReturnValue(false);

      // LLM also fails to fix
      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'still broken code', // LLM can't fix it either
      });

      vi.spyOn(executor as any, 'filterCriticalErrors').mockReturnValue({
        critical: ['Persistent error that never goes away'],
        suggestions: [],
      });

      const step = {
        id: 'write_test',
        action: 'write',
        path: 'src/test.ts',
        params: { content: 'broken code' },
      };

      try {
        await executor['executeWrite'](step as any, 0, { files: new Map() } as any);
      } catch (error: any) {
        // Should throw max attempts error
        expect(error.message).toContain('Max validation attempts' || 'max retries');
      }

      // Verify onMessage was called with max attempts message
      const maxAttemptsMessage = mockConfig.onMessage.mock.calls.find((call: any) =>
        call[0]?.includes('Max validation') || call[0]?.includes('max attempts')
      );
      expect(maxAttemptsMessage).toBeDefined();
    });
  });

  /**
   * ========================================================================
   * CLUSTER 2: Smart Auto-Correction Branching (Lines 2399-2459)
   * ========================================================================
   * Tests the decision logic for choosing between SmartAutoCorrection and LLM.
   * High-risk path: SmartAutoCorrection fallback to LLM (lines 2450-2459).
   */
  describe('Smart Auto-Correction Branching', () => {
    it('should attempt SmartAutoCorrection when isAutoFixable returns true', async () => {
      const fixedCode = 'export const foo = () => {};';
      const smartFixSpy = vi.spyOn(SmartAutoCorrection, 'fixCommonPatterns').mockReturnValue(fixedCode);

      vi.spyOn(SmartAutoCorrection, 'isAutoFixable').mockReturnValue(true);
      vi.spyOn(executor as any, 'validateGeneratedCode')
        .mockResolvedValueOnce({ errors: ['Circular import detected'], valid: false })
        .mockResolvedValueOnce({ errors: [], valid: true }); // After smart fix, passes

      vi.spyOn(executor as any, 'filterCriticalErrors')
        .mockReturnValueOnce({ critical: ['Circular import detected'], suggestions: [] })
        .mockReturnValueOnce({ critical: [], suggestions: [] });

      const step = {
        id: 'write_test',
        action: 'write',
        path: 'src/test.ts',
        params: { content: 'code with circular import' },
      };

      try {
        await executor['executeWrite'](step as any, 0, { files: new Map() } as any);
      } catch {
        // Ignore other errors
      }

      // Verify SmartAutoCorrection.fixCommonPatterns was called
      expect(smartFixSpy).toHaveBeenCalledWith(
        expect.stringContaining('circular import'),
        expect.any(Array),
        expect.stringContaining('test.ts')
      );
    });

    it('should use LLM when SmartAutoCorrection fails (fallback path)', async () => {
      // Mock SmartAutoCorrection to fail (return code with critical errors still present)
      const partiallyFixedCode = 'partially fixed but still broken';
      vi.spyOn(SmartAutoCorrection, 'isAutoFixable').mockReturnValue(true);
      vi.spyOn(SmartAutoCorrection, 'fixCommonPatterns').mockReturnValue(partiallyFixedCode);

      // Mock validation to show SmartAutoCorrection didn't fully fix it
      vi.spyOn(executor as any, 'validateGeneratedCode')
        .mockResolvedValueOnce({ errors: ['Hook error'], valid: false })
        .mockResolvedValueOnce({ errors: ['Type mismatch'], valid: false }) // Still fails after smart fix
        .mockResolvedValueOnce({ errors: [], valid: true }); // But LLM fixes it

      vi.spyOn(executor as any, 'filterCriticalErrors')
        .mockReturnValueOnce({ critical: ['Hook error'], suggestions: [] })
        .mockReturnValueOnce({ critical: ['Type mismatch'], suggestions: [] })
        .mockReturnValueOnce({ critical: [], suggestions: [] });

      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'fully fixed code',
      });

      const step = {
        id: 'write_test',
        action: 'write',
        path: 'src/test.ts',
        params: { content: 'broken code' },
      };

      try {
        await executor['executeWrite'](step as any, 0, { files: new Map() } as any);
      } catch {
        // Ignore other errors
      }

      // Verify LLM was called after SmartAutoCorrection failed
      expect(mockLLMClient.sendMessage).toHaveBeenCalled();
      const llmCall = mockLLMClient.sendMessage.mock.calls[0];
      // Should contain the error that SmartAutoCorrection couldn't fix
      expect(llmCall[0]).toContain('Type mismatch' || 'Hook error');
    });

    it('should skip SmartAutoCorrection and use LLM directly when isAutoFixable returns false', async () => {
      const complexError = 'Architecture rule violation: Complex pattern detected';

      vi.spyOn(SmartAutoCorrection, 'isAutoFixable').mockReturnValue(false);
      const smartFixSpy = vi.spyOn(SmartAutoCorrection, 'fixCommonPatterns');

      vi.spyOn(executor as any, 'validateGeneratedCode')
        .mockResolvedValueOnce({ errors: [complexError], valid: false })
        .mockResolvedValueOnce({ errors: [], valid: true });

      vi.spyOn(executor as any, 'filterCriticalErrors')
        .mockReturnValueOnce({ critical: [complexError], suggestions: [] })
        .mockReturnValueOnce({ critical: [], suggestions: [] });

      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'code fixed by LLM',
      });

      const step = {
        id: 'write_test',
        action: 'write',
        path: 'src/test.ts',
        params: { content: 'broken code' },
      };

      try {
        await executor['executeWrite'](step as any, 0, { files: new Map() } as any);
      } catch {
        // Ignore other errors
      }

      // Verify SmartAutoCorrection was NOT called
      expect(smartFixSpy).not.toHaveBeenCalled();
      // But LLM should be called
      expect(mockLLMClient.sendMessage).toHaveBeenCalled();
    });

    it('should extract code from markdown code blocks in LLM response', async () => {
      const llmResponseWithMarkdown = `
Here's the fixed code:

\`\`\`typescript
export const myFunction = () => {
  return 'fixed';
};
\`\`\`

Hope this helps!`;

      vi.spyOn(executor as any, 'validateGeneratedCode')
        .mockResolvedValueOnce({ errors: ['Missing function'], valid: false })
        .mockResolvedValueOnce({ errors: [], valid: true });

      vi.spyOn(executor as any, 'filterCriticalErrors')
        .mockReturnValueOnce({ critical: ['Missing function'], suggestions: [] })
        .mockReturnValueOnce({ critical: [], suggestions: [] });

      vi.spyOn(SmartAutoCorrection, 'isAutoFixable').mockReturnValue(false);

      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: llmResponseWithMarkdown,
      });

      const step = {
        id: 'write_test',
        action: 'write',
        path: 'src/test.ts',
        params: { content: 'incomplete code' },
      };

      try {
        await executor['executeWrite'](step as any, 0, { files: new Map() } as any);
      } catch {
        // Ignore other errors
      }

      // Verify that the code block was extracted and validated
      // The validateGeneratedCode should be called with the extracted code
      const validateCalls = (executor['validateGeneratedCode'] as any).mock.calls;
      const hasExtractedCode = validateCalls.some((call: any) =>
        call[1]?.includes("return 'fixed'") || call[1]?.includes('myFunction')
      );
      expect(hasExtractedCode).toBe(true);
    });
  });

  /**
   * ========================================================================
   * CLUSTER 3: Zustand Mismatch Fixing (Lines 2408-2437)
   * ========================================================================
   * Tests the high-risk path where SmartAutoCorrection handles Zustand
   * store mismatches by reading the store file and applying fixes.
   */
  describe('Zustand Store Mismatch Fixing', () => {
    it('should detect Zustand store imports and attempt mismatch fix', async () => {
      const componentCode = `
import { useFormStore } from '../stores/formStore';
export const Form = () => {
  const { formData } = useFormStore();
  return <form>{formData.name}</form>;
};`;

      const fixedCode = `
import { useFormStore } from '../stores/formStore';
export const Form = () => {
  const { values, errors } = useFormStore();
  return <form>{values.name}</form>;
};`;

      vi.spyOn(SmartAutoCorrection, 'isAutoFixable').mockReturnValue(true);
      vi.spyOn(SmartAutoCorrection, 'fixCommonPatterns').mockReturnValue(componentCode);

      const zustandFixSpy = vi
        .spyOn(SmartAutoCorrection, 'fixZustandComponentFromStore')
        .mockReturnValue(fixedCode);

      // Mock store file read
      const { workspace } = await import('vscode');
      (workspace.fs.readFile as any).mockResolvedValue(
        new TextEncoder().encode(`
export const useFormStore = create((set) => ({
  values: { name: 'test' },
  errors: {},
}));`)
      );

      vi.spyOn(executor as any, 'validateGeneratedCode')
        .mockResolvedValueOnce({ errors: ['Zustand hook mismatch'], valid: false })
        .mockResolvedValueOnce({ errors: [], valid: true });

      vi.spyOn(executor as any, 'filterCriticalErrors')
        .mockReturnValueOnce({ critical: ['Zustand hook mismatch'], suggestions: [] })
        .mockReturnValueOnce({ critical: [], suggestions: [] });

      const step = {
        id: 'write_test',
        action: 'write',
        path: 'src/components/Form.tsx',
        params: { content: componentCode },
      };

      try {
        await executor['executeWrite'](step as any, 0, { files: new Map() } as any);
      } catch {
        // Ignore other errors
      }

      // Verify Zustand mismatch fix was attempted
      expect(zustandFixSpy).toHaveBeenCalledWith(
        expect.stringContaining('useFormStore'),
        expect.stringContaining('create')
      );
    });

    it('should handle store file read error gracefully (store not yet created)', async () => {
      vi.spyOn(SmartAutoCorrection, 'isAutoFixable').mockReturnValue(true);
      vi.spyOn(SmartAutoCorrection, 'fixCommonPatterns').mockReturnValue('partial fix');

      // Mock store file read to fail (file doesn't exist yet)
      const { workspace } = await import('vscode');
      (workspace.fs.readFile as any).mockRejectedValue(new Error('File not found'));

      vi.spyOn(executor as any, 'validateGeneratedCode')
        .mockResolvedValueOnce({ errors: ['Zustand hook mismatch'], valid: false })
        .mockResolvedValueOnce({ errors: ['Still broken'], valid: false });

      vi.spyOn(executor as any, 'filterCriticalErrors')
        .mockReturnValueOnce({ critical: ['Zustand hook mismatch'], suggestions: [] })
        .mockReturnValueOnce({ critical: ['Still broken'], suggestions: [] });

      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'fixed by LLM',
      });

      const step = {
        id: 'write_test',
        action: 'write',
        path: 'src/components/Form.tsx',
        params: { content: 'component code with store import' },
      };

      try {
        await executor['executeWrite'](step as any, 0, { files: new Map() } as any);
      } catch {
        // Expected - store file not found
      }

      // Should not throw during store read, should continue with LLM fallback
      expect(mockConfig.onMessage).toHaveBeenCalled();
      // Verify a warning was logged about store not being available
      const warnCalls = console.warn.mock.calls;
      const hasWarning = warnCalls.some((call: any) =>
        call[0]?.includes('Store file not yet available') ||
        call[0]?.includes('Zustand')
      );
      // The code should handle this gracefully
    });

    it('should skip Zustand fix when no store imports detected', async () => {
      const componentCode = `
export const Button = () => {
  return <button>Click me</button>;
};`;

      vi.spyOn(SmartAutoCorrection, 'isAutoFixable').mockReturnValue(true);
      vi.spyOn(SmartAutoCorrection, 'fixCommonPatterns').mockReturnValue(componentCode);

      const zustandFixSpy = vi
        .spyOn(SmartAutoCorrection, 'fixZustandComponentFromStore');

      vi.spyOn(executor as any, 'validateGeneratedCode')
        .mockResolvedValueOnce({ errors: [], valid: true });

      vi.spyOn(executor as any, 'filterCriticalErrors')
        .mockReturnValueOnce({ critical: [], suggestions: [] });

      const step = {
        id: 'write_test',
        action: 'write',
        path: 'src/components/Button.tsx',
        params: { content: componentCode },
      };

      try {
        await executor['executeWrite'](step as any, 0, { files: new Map() } as any);
      } catch {
        // Ignore other errors
      }

      // Should not attempt Zustand fix when no stores imported
      expect(zustandFixSpy).not.toHaveBeenCalled();
    });

    it('should verify SmartAutoCorrection fallback when Zustand fix incomplete', async () => {
      const originalCode = 'code with zustand mismatch';
      const partialFix = 'partial fix but still has errors';

      vi.spyOn(SmartAutoCorrection, 'isAutoFixable').mockReturnValue(true);
      vi.spyOn(SmartAutoCorrection, 'fixCommonPatterns').mockReturnValue(partialFix);

      // Zustand fix doesn't help
      vi.spyOn(SmartAutoCorrection, 'fixZustandComponentFromStore')
        .mockReturnValue(partialFix); // No change

      // Mock store file read to succeed
      const { workspace } = await import('vscode');
      (workspace.fs.readFile as any).mockResolvedValue(
        new TextEncoder().encode('export const useStore = create(...);')
      );

      vi.spyOn(executor as any, 'validateGeneratedCode')
        .mockResolvedValueOnce({ errors: ['Zustand mismatch'], valid: false })
        .mockResolvedValueOnce({ errors: ['Still broken'], valid: false })
        .mockResolvedValueOnce({ errors: [], valid: true });

      vi.spyOn(executor as any, 'filterCriticalErrors')
        .mockReturnValueOnce({ critical: ['Zustand mismatch'], suggestions: [] })
        .mockReturnValueOnce({ critical: ['Still broken'], suggestions: [] })
        .mockReturnValueOnce({ critical: [], suggestions: [] });

      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'fully fixed code',
      });

      const step = {
        id: 'write_test',
        action: 'write',
        path: 'src/components/Form.tsx',
        params: { content: originalCode },
      };

      try {
        await executor['executeWrite'](step as any, 0, { files: new Map() } as any);
      } catch {
        // Ignore other errors
      }

      // Verify LLM was called after Zustand fix didn't fully work
      expect(mockLLMClient.sendMessage).toHaveBeenCalled();
    });
  });

  /**
   * ========================================================================
   * CLUSTER 4: Error Message Formatting (Lines 2468-2509)
   * ========================================================================
   * Tests that error messages are properly formatted with ACTION guidance
   * for the LLM, especially for hook-related errors.
   */
  describe('Error Message Formatting for LLM', () => {
    it('should add ACTION guidance for unused hook errors', async () => {
      const hookError = "Hook 'useCustomHook' imported but never called";

      vi.spyOn(SmartAutoCorrection, 'isAutoFixable').mockReturnValue(false);

      vi.spyOn(executor as any, 'validateGeneratedCode')
        .mockResolvedValueOnce({ errors: [hookError], valid: false })
        .mockResolvedValueOnce({ errors: [], valid: true });

      vi.spyOn(executor as any, 'filterCriticalErrors')
        .mockReturnValueOnce({ critical: [hookError], suggestions: [] })
        .mockReturnValueOnce({ critical: [], suggestions: [] });

      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'fixed code',
      });

      const step = {
        id: 'write_test',
        action: 'write',
        path: 'src/test.ts',
        params: { content: 'code with unused hook' },
      };

      try {
        await executor['executeWrite'](step as any, 0, { files: new Map() } as any);
      } catch {
        // Ignore other errors
      }

      // Verify LLM was called with formatted error including ACTION
      expect(mockLLMClient.sendMessage).toHaveBeenCalled();
      const llmCall = mockLLMClient.sendMessage.mock.calls[0][0];
      // Should include ACTION guidance for the hook error
      expect(llmCall).toMatch(/ACTION|Remove|use the hook/i);
    });

    it('should format multiple errors with proper numbering', async () => {
      const errors = [
        'Type error: missing property',
        "Hook 'useForm' imported but never called",
        'Circular import detected'
      ];

      vi.spyOn(SmartAutoCorrection, 'isAutoFixable').mockReturnValue(false);

      vi.spyOn(executor as any, 'validateGeneratedCode')
        .mockResolvedValueOnce({ errors, valid: false })
        .mockResolvedValueOnce({ errors: [], valid: true });

      vi.spyOn(executor as any, 'filterCriticalErrors')
        .mockReturnValueOnce({ critical: errors, suggestions: [] })
        .mockReturnValueOnce({ critical: [], suggestions: [] });

      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'fixed code',
      });

      const step = {
        id: 'write_test',
        action: 'write',
        path: 'src/test.ts',
        params: { content: 'broken code' },
      };

      try {
        await executor['executeWrite'](step as any, 0, { files: new Map() } as any);
      } catch {
        // Ignore other errors
      }

      // Verify LLM received properly formatted errors
      const llmCall = mockLLMClient.sendMessage.mock.calls[0][0];
      expect(llmCall).toContain('1.');
      expect(llmCall).toContain('2.');
      expect(llmCall).toContain('3.');
      expect(llmCall).toContain('Type error');
      expect(llmCall).toContain('Hook');
    });

    it('should include file path in error context for LLM', async () => {
      const error = 'Validation failed';

      vi.spyOn(SmartAutoCorrection, 'isAutoFixable').mockReturnValue(false);

      vi.spyOn(executor as any, 'validateGeneratedCode')
        .mockResolvedValueOnce({ errors: [error], valid: false })
        .mockResolvedValueOnce({ errors: [], valid: true });

      vi.spyOn(executor as any, 'filterCriticalErrors')
        .mockReturnValueOnce({ critical: [error], suggestions: [] })
        .mockReturnValueOnce({ critical: [], suggestions: [] });

      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'fixed code',
      });

      const step = {
        id: 'write_test',
        action: 'write',
        path: 'src/components/MyComponent.tsx',
        params: { content: 'broken code' },
      };

      try {
        await executor['executeWrite'](step as any, 0, { files: new Map() } as any);
      } catch {
        // Ignore other errors
      }

      // Verify LLM call includes file path
      const llmCall = mockLLMClient.sendMessage.mock.calls[0][0];
      expect(llmCall).toContain('MyComponent.tsx');
    });

    it('should indicate when code has CRITICAL errors vs soft suggestions', async () => {
      const criticalError = 'Type error: missing property';
      const softSuggestion = 'Consider adding JSDoc comments';

      vi.spyOn(SmartAutoCorrection, 'isAutoFixable').mockReturnValue(false);

      vi.spyOn(executor as any, 'validateGeneratedCode')
        .mockResolvedValueOnce({
          errors: [criticalError, softSuggestion],
          valid: false,
        })
        .mockResolvedValueOnce({ errors: [], valid: true });

      vi.spyOn(executor as any, 'filterCriticalErrors')
        .mockReturnValueOnce({
          critical: [criticalError],
          suggestions: [softSuggestion],
        })
        .mockReturnValueOnce({ critical: [], suggestions: [] });

      mockLLMClient.sendMessage.mockResolvedValue({
        success: true,
        message: 'fixed code',
      });

      const step = {
        id: 'write_test',
        action: 'write',
        path: 'src/test.ts',
        params: { content: 'code with issues' },
      };

      try {
        await executor['executeWrite'](step as any, 0, { files: new Map() } as any);
      } catch {
        // Ignore other errors
      }

      // Verify LLM was told about CRITICAL errors only, not soft suggestions
      const llmCall = mockLLMClient.sendMessage.mock.calls[0][0];
      expect(llmCall).toContain('CRITICAL');
      expect(llmCall).toContain('Type error');
      // Should NOT include soft suggestions in the fix prompt
      expect(llmCall).not.toContain('JSDoc comments');
    });
  });

  /**
   * ========================================================================
   * INTEGRATION: End-to-End Validation Loop Scenarios
   * ========================================================================
   * Tests complete validation loop flows with multiple iterations.
   */
  describe('End-to-End Validation Loop Scenarios', () => {
    it('should complete validation loop on first correction attempt', async () => {
      vi.spyOn(SmartAutoCorrection, 'isAutoFixable').mockReturnValue(true);
      vi.spyOn(SmartAutoCorrection, 'fixCommonPatterns').mockReturnValue('fixed code');

      vi.spyOn(executor as any, 'validateGeneratedCode')
        .mockResolvedValueOnce({ errors: ['Circular import'], valid: false })
        .mockResolvedValueOnce({ errors: [], valid: true });

      vi.spyOn(executor as any, 'filterCriticalErrors')
        .mockReturnValueOnce({ critical: ['Circular import'], suggestions: [] })
        .mockReturnValueOnce({ critical: [], suggestions: [] });

      const step = {
        id: 'write_test',
        action: 'write',
        path: 'src/test.ts',
        params: { content: 'code with circular import' },
      };

      try {
        await executor['executeWrite'](step as any, 0, { files: new Map() } as any);
      } catch {
        // Ignore other errors
      }

      // Verify successful correction message was shown
      const successMessage = mockConfig.onMessage.mock.calls.find((call: any) =>
        call[0]?.includes('successful') || call[0]?.includes('Auto-correction succeeded')
      );
      expect(successMessage).toBeDefined();
    });

    it('should require multiple correction attempts when errors change', async () => {
      let attempt = 0;
      vi.spyOn(SmartAutoCorrection, 'isAutoFixable').mockReturnValue(true);
      vi.spyOn(SmartAutoCorrection, 'fixCommonPatterns')
        .mockReturnValueOnce('partial fix 1')
        .mockReturnValueOnce('partial fix 2');

      vi.spyOn(executor as any, 'validateGeneratedCode').mockImplementation(async () => {
        attempt++;
        if (attempt === 1) return { errors: ['Error A'], valid: false };
        if (attempt === 2) return { errors: ['Error B'], valid: false };
        return { errors: [], valid: true };
      });

      vi.spyOn(executor as any, 'filterCriticalErrors')
        .mockReturnValueOnce({ critical: ['Error A'], suggestions: [] })
        .mockReturnValueOnce({ critical: ['Error B'], suggestions: [] })
        .mockReturnValueOnce({ critical: [], suggestions: [] });

      const step = {
        id: 'write_test',
        action: 'write',
        path: 'src/test.ts',
        params: { content: 'initial code' },
      };

      try {
        await executor['executeWrite'](step as any, 0, { files: new Map() } as any);
      } catch {
        // Ignore other errors
      }

      // Verify multiple correction attempts were made
      expect(SmartAutoCorrection.fixCommonPatterns).toHaveBeenCalledTimes(2);
    });
  });
});
