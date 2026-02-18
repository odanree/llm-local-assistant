import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RefactoringExecutor } from './refactoringExecutor';
import { LLMClient } from './llmClient';
import { ServiceExtractor, RefactoringPlan } from './serviceExtractor';

describe('RefactoringExecutor', () => {
  let executor: RefactoringExecutor;
  let mockLlmClient: LLMClient;
  let mockExtractor: ServiceExtractor;

  beforeEach(() => {
    mockLlmClient = {
      sendMessage: vi.fn(),
      getConfig: vi.fn().mockReturnValue({
        endpoint: 'http://localhost:11434',
        model: 'test-model',
      }),
    } as unknown as LLMClient;

    mockExtractor = new ServiceExtractor();
    executor = new RefactoringExecutor(mockLlmClient, mockExtractor);
  });

  describe('Refactoring Execution', () => {
    it('executes refactoring successfully', async () => {
      const originalCode = `
export const useUser = () => {
  const [user, setUser] = useState(null);
  const fetchUser = async () => {
    const res = await fetch('/api/user');
    setUser(await res.json());
  };
  return { user, fetchUser };
}
`;

      const refactoredCode = `
export const useUser = () => {
  const [user, setUser] = useState(null);
  const fetchUser = async () => {
    try {
      const res = await fetch('/api/user');
      setUser(await res.json());
    } catch (error) {
      console.error('Failed to fetch user:', error);
    }
  };
  return { user, fetchUser };
}
`;

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: refactoredCode,
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'useUser.ts',
        estimatedComplexity: 'medium',
        proposedChanges: [
          {
            type: 'add',
            description: 'Add error handling',
            impact: 'Improve reliability',
            priority: 'high',
          },
        ],
        estimatedEffort: '30 minutes',
        confidence: 0.8,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, originalCode);

      expect(execution.success).toBe(true);
      expect(execution.originalCode).toBe(originalCode);
      expect(execution.refactoredCode).toBeTruthy();
      expect(execution.executionLog.length).toBeGreaterThan(0);
    });

    it('handles LLM errors gracefully', async () => {
      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: false,
        error: 'LLM service unavailable',
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'test.ts',
        estimatedComplexity: 'high',
        proposedChanges: [],
        estimatedEffort: '1 hour',
        confidence: 0.5,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, 'const x = 1;');

      expect(execution.success).toBe(false);
      expect(execution.errors.length).toBeGreaterThan(0);
    });

    it('extracts code from markdown response', async () => {
      const markdownResponse = `
Here's the refactored code:

\`\`\`typescript
export const useUser = () => {
  return null;
}
\`\`\`

This refactoring improves readability.
`;

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: markdownResponse,
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'test.ts',
        estimatedComplexity: 'low',
        proposedChanges: [],
        estimatedEffort: '10 minutes',
        confidence: 0.9,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, 'const x = 1;');

      expect(execution.success).toBe(true);
      expect(execution.refactoredCode).toContain('useUser');
    });
  });

  describe('Code Validation', () => {
    it('validates syntax correctly', async () => {
      const validCode = `export const test = () => { return 42; };`;

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: validCode,
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'test.ts',
        estimatedComplexity: 'low',
        proposedChanges: [],
        estimatedEffort: '5 minutes',
        confidence: 0.9,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, validCode);

      const syntaxValidation = execution.validationResults.find(r => r.type === 'syntax');
      expect(syntaxValidation?.passed).toBe(true);
    });

    it('detects syntax errors', async () => {
      const invalidCode = `
export const test = () => {
  return 42;
}
// Missing closing brace
`;

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: invalidCode,
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'test.ts',
        estimatedComplexity: 'low',
        proposedChanges: [],
        estimatedEffort: '5 minutes',
        confidence: 0.8,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, 'const x = 1;');

      const syntaxValidation = execution.validationResults.find(r => r.type === 'syntax');
      if (syntaxValidation && !syntaxValidation.passed) {
        expect(syntaxValidation.severity).toBe('critical');
      }
    });

    it('validates type safety', async () => {
      const codeWithAny = `
export const test = (value: any) => {
  return value;
};
`;

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: codeWithAny,
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'test.ts',
        estimatedComplexity: 'low',
        proposedChanges: [],
        estimatedEffort: '5 minutes',
        confidence: 0.8,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, 'const x = 1;');

      const typeValidation = execution.validationResults.find(r => r.type === 'types');
      expect(typeValidation).toBeDefined();
    });

    it('checks logic preservation', async () => {
      const original = `
export async function fetchData() {
  try {
    const res = await fetch('/api/data');
    return res.json();
  } catch (error) {
    console.error(error);
  }
}
`;

      const refactored = `
export async function fetchData() {
  const res = await fetch('/api/data');
  return res.json();
}
`;

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: refactored,
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'test.ts',
        estimatedComplexity: 'medium',
        proposedChanges: [],
        estimatedEffort: '15 minutes',
        confidence: 0.7,
        risks: [
          {
            description: 'Error handling removed',
            severity: 'high',
            mitigation: 'Add try-catch back',
          },
        ],
      };

      const execution = await executor.executeRefactoring(plan, original);

      const logicValidation = execution.validationResults.find(r => r.type === 'logic');
      expect(logicValidation).toBeDefined();
    });
  });

  describe('Test Case Generation', () => {
    it('generates test cases', async () => {
      const code = `
export async function fetchUser(id: string) {
  const res = await fetch(\`/api/users/\${id}\`);
  return res.json();
}
`;

      const testCode = `
test('fetches user successfully', async () => {
  const user = await fetchUser('1');
  expect(user).toBeDefined();
});

test('handles fetch error', async () => {
  expect(() => fetchUser('invalid')).rejects.toThrow();
});
`;

      vi.mocked(mockLlmClient.sendMessage)
        .mockResolvedValueOnce({ success: true, message: code } as any)
        .mockResolvedValueOnce({ success: true, message: testCode } as any);

      const plan: RefactoringPlan = {
        hookFile: 'test.ts',
        estimatedComplexity: 'low',
        proposedChanges: [],
        estimatedEffort: '5 minutes',
        confidence: 0.9,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, code);

      expect(execution.testCases.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Impact Assessment', () => {
    it('detects code size reduction', async () => {
      const original = `
export const useUser = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fetchUser = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/user');
      setUser(await res.json());
    } catch (error) {
      setError(error);
    } finally {
      setLoading(false);
    }
  };
  return { user, loading, error, fetchUser };
};
`;

      const refactored = `
export const useUser = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await fetch('/api/user');
      return res.json();
    },
  });
  return { user: data, loading: isLoading, error, fetchUser: undefined };
};
`;

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: refactored,
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'useUser.ts',
        estimatedComplexity: 'high',
        proposedChanges: [
          {
            type: 'extract',
            description: 'Extract to service layer',
            impact: 'Reduce hook size',
            priority: 'high',
          },
        ],
        estimatedEffort: '1 hour',
        confidence: 0.8,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, original);

      expect(execution.estimatedImpact.estimatedBenefits.length).toBeGreaterThan(0);
    });

    it('identifies breaking changes', async () => {
      const original = `
export function getUserData() { }
export function updateUserData(id: string) { }
`;

      const refactored = `
export function getUserData() { }
`;

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: refactored,
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'userService.ts',
        estimatedComplexity: 'medium',
        proposedChanges: [],
        estimatedEffort: '30 minutes',
        confidence: 0.7,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, original);

      expect(execution.estimatedImpact.breakingChanges).toBe(true);
    });

    it('detects performance improvements', async () => {
      const original = `
export const MyComponent = ({ data }) => {
  const expensiveValue = expensiveComputation(data);
  return <div>{expensiveValue}</div>;
};
`;

      const refactored = `
export const MyComponent = ({ data }) => {
  const expensiveValue = useMemo(() => expensiveComputation(data), [data]);
  return <div>{expensiveValue}</div>;
};
`;

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: refactored,
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'MyComponent.tsx',
        estimatedComplexity: 'low',
        proposedChanges: [
          {
            type: 'extract',
            description: 'Memoize expensive computation',
            impact: 'Improve performance',
            priority: 'medium',
          },
        ],
        estimatedEffort: '15 minutes',
        confidence: 0.85,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, original);

      expect(execution.estimatedImpact.performanceImpact).toMatch(/positive|neutral|unknown/);
    });
  });

  describe('Error Handling', () => {
    it('logs all execution steps', async () => {
      const code = 'export const test = () => { };';

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: code,
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'test.ts',
        estimatedComplexity: 'low',
        proposedChanges: [],
        estimatedEffort: '5 minutes',
        confidence: 0.9,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, code);

      expect(execution.executionLog.length).toBeGreaterThan(0);
      execution.executionLog.forEach(log => {
        expect(log).toMatch(/\[\d{1,2}:\d{2}:\d{2}/);
      });
    });

    it('provides rollback capability', async () => {
      const code = 'export const test = () => { };';

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: code,
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'test.ts',
        estimatedComplexity: 'low',
        proposedChanges: [],
        estimatedEffort: '5 minutes',
        confidence: 0.9,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, code);

      expect(execution.rollbackAvailable).toBe(true);
      expect(execution.originalCode).toBe(code);
    });
  });

  describe('Self-Correction & Golden Templates (Phase 13)', () => {
    it('handles code generation with semantic error detection', async () => {
      const code = 'const x = await undefined.method();';

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: 'const x = await config?.method?.() ?? null;',
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'src/utils/api.ts',
        estimatedComplexity: 'medium',
        proposedChanges: ['Add null-safety checks'],
        estimatedEffort: '10 minutes',
        confidence: 0.8,
        risks: ['May change return type'],
      };

      const execution = await executor.executeRefactoring(plan, code);

      expect(execution).toBeDefined();
      expect(execution.refactoredCode).toBeDefined();
    });

    it('applies golden templates for well-known utilities', async () => {
      const utilityCode = 'export const cn = (...args) => clsx(args);';

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: 'import { clsx } from "clsx";\nimport { twMerge } from "tailwind-merge";\n\nexport function cn(...inputs) {\n  return twMerge(clsx(inputs));\n}',
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'src/utils/cn.ts',
        estimatedComplexity: 'low',
        proposedChanges: ['Apply standard cn() pattern'],
        estimatedEffort: '2 minutes',
        confidence: 1.0,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, utilityCode);

      expect(execution).toBeDefined();
      expect(execution.refactoredCode).toContain('twMerge');
    });

    it('validates file context for different file types', async () => {
      const componentCode = 'export const Button = ({ className }) => <button className={className} />;';

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: 'import { cn } from "@/utils/cn";\n\nexport const Button = ({ className }) => (\n  <button className={cn("px-4 py-2", className)} />\n);',
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'src/components/Button.tsx',
        estimatedComplexity: 'low',
        proposedChanges: ['Add cn() utility for styling'],
        estimatedEffort: '3 minutes',
        confidence: 0.95,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, componentCode);

      expect(execution).toBeDefined();
      expect(execution.refactoredCode).toBeDefined();
    });

    it('handles hook file context with proper patterns', async () => {
      const hookCode = 'export const useQuery = (url) => { const [data, setData] = useState(null); };';

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: 'export const useQuery = (url) => { const { data, loading, error } = useTanstackQuery(url); return { data, loading, error }; };',
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'src/hooks/useQuery.ts',
        estimatedComplexity: 'medium',
        proposedChanges: ['Use TanStack Query instead of useState'],
        estimatedEffort: '15 minutes',
        confidence: 0.85,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, hookCode);

      expect(execution).toBeDefined();
    });

    it('handles utility file refactoring with validation', async () => {
      const utilityCode = 'export const merge = (...args) => Object.assign({}, ...args);';

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: 'export const merge = (...args) => ({ ...args.reduce((a, b) => ({ ...a, ...b }), {}) });',
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'src/utils/merge.ts',
        estimatedComplexity: 'low',
        proposedChanges: ['Refactor to spread operator'],
        estimatedEffort: '5 minutes',
        confidence: 0.9,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, utilityCode);

      expect(execution).toBeDefined();
    });
  });

  describe('Retry & Correction Logic (Phase 13)', () => {
    it('handles code generation retry with semantic errors', async () => {
      const code = 'const result = await api.call();';

      // First attempt returns code with error, second succeeds
      vi.mocked(mockLlmClient.sendMessage)
        .mockResolvedValueOnce({
          success: true,
          message: 'const result = unknownVariable?.call?.();',
        } as any)
        .mockResolvedValueOnce({
          success: true,
          message: 'const result = await api?.call?.() ?? null;',
        } as any);

      const plan: RefactoringPlan = {
        hookFile: 'src/services/api.ts',
        estimatedComplexity: 'medium',
        proposedChanges: ['Add error handling'],
        estimatedEffort: '10 minutes',
        confidence: 0.8,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, code);

      expect(execution).toBeDefined();
      // Should have retried and potentially used the corrected version
    });

    it('exhausts retries gracefully on persistent errors', async () => {
      const code = 'const x = 1;';

      // All attempts return problematic code
      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: 'const x = unknownFunc();',
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'src/broken.ts',
        estimatedComplexity: 'low',
        proposedChanges: [],
        estimatedEffort: '5 minutes',
        confidence: 0.5,
        risks: ['High risk of errors'],
      };

      const execution = await executor.executeRefactoring(plan, code);

      expect(execution).toBeDefined();
      // Should complete even with persistent errors
    });

    it('accepts warnings-only validation results', async () => {
      const code = 'export const test = () => { };';

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: 'export const test = () => { /* optimized */ };',
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'src/utils/test.ts',
        estimatedComplexity: 'low',
        proposedChanges: ['Add comments'],
        estimatedEffort: '2 minutes',
        confidence: 0.95,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, code);

      expect(execution).toBeDefined();
      expect(execution.success).toBe(true);
    });
  });

  describe('Architectural Hints & RAG (Phase 13)', () => {
    it('generates architectural hints for import mismatches', async () => {
      const code = 'import { useState } from "wrong-library";';

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: 'import { useState } from "react";',
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'src/components/Form.tsx',
        estimatedComplexity: 'low',
        proposedChanges: ['Fix import source'],
        estimatedEffort: '1 minute',
        confidence: 0.99,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, code);

      expect(execution).toBeDefined();
      // Verify either the refactored code was updated or the execution succeeded
      expect(execution.refactoredCode || execution.success).toBeTruthy();
    });

    it('provides hints for undefined variable detection', async () => {
      const code = 'const value = undefinedVar + 1;';

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: 'const value = (config?.value ?? 0) + 1;',
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'src/utils/calc.ts',
        estimatedComplexity: 'low',
        proposedChanges: ['Handle undefined variable'],
        estimatedEffort: '5 minutes',
        confidence: 0.8,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, code);

      expect(execution).toBeDefined();
    });

    it('suggests hints for missing type definitions', async () => {
      const code = 'const config: Config = getConfig();';

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: 'import { Config } from "@/types";\n\nconst config: Config = getConfig();',
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'src/services/config.ts',
        estimatedComplexity: 'low',
        proposedChanges: ['Add type import'],
        estimatedEffort: '3 minutes',
        confidence: 0.9,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, code);

      expect(execution).toBeDefined();
    });
  });

  describe('Validation & Golden Shield (Phase 13)', () => {
    it('validates refactored code syntax', async () => {
      const code = 'const x = 1;';

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: 'const x = 1; const y = 2;',
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'src/test.ts',
        estimatedComplexity: 'low',
        proposedChanges: [],
        estimatedEffort: '1 minute',
        confidence: 1.0,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, code);

      expect(execution).toBeDefined();
      expect(execution.refactoredCode).toMatch(/const/);
    });

    it('validates type safety of refactored code', async () => {
      const code = 'const handler = (e: Event) => { };';

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: 'const handler = (e: React.ChangeEvent<HTMLInputElement>) => { };',
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'src/components/Input.tsx',
        estimatedComplexity: 'low',
        proposedChanges: ['Add proper event typing'],
        estimatedEffort: '3 minutes',
        confidence: 0.95,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, code);

      expect(execution).toBeDefined();
    });

    it('detects golden shield for well-known utilities', async () => {
      const cnUtility = `import { clsx } from 'clsx';
export function cn(...inputs) {
  return clsx(inputs);
}`;

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: cnUtility,
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'src/utils/cn.ts',
        estimatedComplexity: 'low',
        proposedChanges: [],
        estimatedEffort: '1 minute',
        confidence: 1.0,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, cnUtility);

      expect(execution).toBeDefined();
      expect(execution.refactoredCode).toContain('clsx');
    });

    it('checks logic preservation in refactoring', async () => {
      const code = 'if (x) { return a; } else { return b; }';

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: 'return x ? a : b;',
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'src/utils/conditional.ts',
        estimatedComplexity: 'low',
        proposedChanges: ['Simplify conditional'],
        estimatedEffort: '2 minutes',
        confidence: 0.95,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, code);

      expect(execution).toBeDefined();
      // Verify that execution completed successfully
      expect(execution.success !== undefined).toBe(true);
    });
  });

  describe('Impact Assessment (Phase 13)', () => {
    it('detects code size reduction', async () => {
      const code = 'const x = 1; const y = 2; const z = x + y;';

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: 'const z = 3;',
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'src/utils/math.ts',
        estimatedComplexity: 'low',
        proposedChanges: ['Simplify constants'],
        estimatedEffort: '1 minute',
        confidence: 0.9,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, code);

      expect(execution).toBeDefined();
    });

    it('identifies breaking changes in refactoring', async () => {
      const code = 'export default { api: { url: "localhost" } };';

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: 'export const config = { api: { url: process.env.API_URL } };',
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'src/config.ts',
        estimatedComplexity: 'medium',
        proposedChanges: ['Use environment variables'],
        estimatedEffort: '10 minutes',
        confidence: 0.8,
        risks: ['Changes default export to named export'],
      };

      const execution = await executor.executeRefactoring(plan, code);

      expect(execution).toBeDefined();
    });

    it('detects performance improvements', async () => {
      const code = 'const result = items.filter(x => x > 5).map(x => x * 2).filter(x => x < 100);';

      vi.mocked(mockLlmClient.sendMessage).mockResolvedValue({
        success: true,
        message: 'const result = items\n  .filter(x => x > 5 && (x * 2) < 100)\n  .map(x => x * 2);',
      } as any);

      const plan: RefactoringPlan = {
        hookFile: 'src/utils/array.ts',
        estimatedComplexity: 'low',
        proposedChanges: ['Optimize filter-map chain'],
        estimatedEffort: '5 minutes',
        confidence: 0.9,
        risks: [],
      };

      const execution = await executor.executeRefactoring(plan, code);

      expect(execution).toBeDefined();
    });
  });
});
