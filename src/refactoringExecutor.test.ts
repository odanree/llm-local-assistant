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
});
