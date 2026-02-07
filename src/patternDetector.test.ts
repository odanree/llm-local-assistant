import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PatternDetector } from './patternDetector';
import { LLMClient } from './llmClient';

describe('PatternDetector', () => {
  let patternDetector: PatternDetector;
  let mockLLMClient: Partial<LLMClient>;

  beforeEach(() => {
    // Mock LLMClient
    mockLLMClient = {
      sendMessage: vi.fn(),
    };
    patternDetector = new PatternDetector(mockLLMClient as LLMClient);
  });

  describe('detectPatternWithLLM', () => {
    it('should detect CRUD pattern from LLM response', async () => {
      const crudCode = `
        export async function createUser(data: UserData) {
          return api.post('/users', data);
        }
        export async function getUser(id: string) {
          return api.get(\`/users/\${id}\`);
        }
        export async function updateUser(id: string, data: Partial<UserData>) {
          return api.put(\`/users/\${id}\`, data);
        }
        export async function deleteUser(id: string) {
          return api.delete(\`/users/\${id}\`);
        }
      `;

      (mockLLMClient.sendMessage as any).mockResolvedValue({
        success: true,
        message: JSON.stringify({
          pattern: 'CRUD',
          confidence: 0.95,
          reasoning: 'File exports create, read, update, delete operations',
          suggestedImprovements: ['Add error handling', 'Use transaction for batch ops'],
        }),
      });

      const result = await patternDetector.detectPatternWithLLM(crudCode, 'userService.ts');

      expect(result.pattern).toBe('CRUD');
      expect(result.confidence).toBe(0.95);
      expect(result.reasoning).toContain('operations');
      expect(result.suggestedImprovements).toHaveLength(2);
    });

    it('should detect Forms pattern from LLM response', async () => {
      const formCode = `
        import { useForm } from 'react-hook-form';
        import { zodResolver } from '@hookform/resolvers/zod';
        
        export function LoginForm() {
          const { register, handleSubmit, formState: { errors } } = useForm({
            resolver: zodResolver(loginSchema),
          });
          
          return <form onSubmit={handleSubmit(onSubmit)}>...</form>;
        }
      `;

      (mockLLMClient.sendMessage as any).mockResolvedValue({
        success: true,
        message: JSON.stringify({
          pattern: 'Forms',
          confidence: 0.92,
          reasoning: 'Uses react-hook-form with Zod validation',
          suggestedImprovements: ['Add loading state', 'Show field-level validation'],
        }),
      });

      const result = await patternDetector.detectPatternWithLLM(formCode, 'LoginForm.tsx');

      expect(result.pattern).toBe('Forms');
      expect(result.confidence).toBe(0.92);
    });

    it('should return None when file has no pattern', async () => {
      const pureComponent = `
        export function Header() {
          return <header><h1>My App</h1></header>;
        }
      `;

      (mockLLMClient.sendMessage as any).mockResolvedValue({
        success: true,
        message: JSON.stringify({
          pattern: 'None',
          confidence: 0.0,
          reasoning: 'Pure UI component, no architectural pattern',
          suggestedImprovements: ['Consider adding a pattern if needed'],
        }),
      });

      const result = await patternDetector.detectPatternWithLLM(pureComponent, 'Header.tsx');

      expect(result.pattern).toBe('None');
      expect(result.confidence).toBe(0.0);
    });

    it('should handle LLM parsing errors gracefully', async () => {
      (mockLLMClient.sendMessage as any).mockResolvedValue({
        success: true,
        message: 'Invalid JSON response',
      });

      const code = 'const x = 1;';
      const result = await patternDetector.detectPatternWithLLM(code, 'test.ts');

      // Should fall back to keyword detection
      expect(result).toBeDefined();
      expect(result.pattern).toBeDefined();
    });

    it('should handle LLM failures with fallback', async () => {
      (mockLLMClient.sendMessage as any).mockResolvedValue({
        success: false,
        error: 'LLM service unavailable',
      });

      const code = 'export function useQuery() {}';
      const result = await patternDetector.detectPatternWithLLM(code, 'useQuery.ts');

      // Should fall back to keyword detection and detect DataFetching
      expect(result.pattern).toBe('DataFetching');
      expect(result.confidence).toBe(0.85);
    });

    it('should clamp confidence between 0 and 1', async () => {
      (mockLLMClient.sendMessage as any).mockResolvedValue({
        success: true,
        message: JSON.stringify({
          pattern: 'CRUD',
          confidence: 1.5, // Invalid: > 1
          reasoning: 'Test',
          suggestedImprovements: [],
        }),
      });

      const result = await patternDetector.detectPatternWithLLM('code', 'file.ts');

      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('fallbackKeywordDetection', () => {
    it('should detect Notifications pattern by keywords', () => {
      const code = "import toast from 'react-hot-toast';";
      const result = patternDetector['fallbackKeywordDetection'](code);

      expect(result.pattern).toBe('Notifications');
      expect(result.confidence).toBe(0.8);
    });

    it('should detect Authentication pattern by keywords', () => {
      const code = "const token = jwt.decode(authToken);";
      const result = patternDetector['fallbackKeywordDetection'](code);

      expect(result.pattern).toBe('Authentication');
      expect(result.confidence).toBe(0.75);
    });

    it('should detect DataFetching pattern by keywords', () => {
      const code = 'const { data } = useQuery({ queryKey: [id] });';
      const result = patternDetector['fallbackKeywordDetection'](code);

      expect(result.pattern).toBe('DataFetching');
      expect(result.confidence).toBe(0.85);
    });

    it('should detect StateManagement pattern by keywords', () => {
      const code = 'import { create } from "zustand"; const store = create((set) => ({...}));';
      const result = patternDetector['fallbackKeywordDetection'](code);

      expect(result.pattern).toBe('StateManagement');
      expect(result.confidence).toBe(0.9);
    });

    it('should detect SearchFilter pattern by keywords', () => {
      const code = 'const [search, setSearch] = useState(""); const filtered = items.filter(i => i.includes(search));';
      const result = patternDetector['fallbackKeywordDetection'](code);

      expect(result.pattern).toBe('SearchFilter');
      expect(result.confidence).toBe(0.7);
    });

    it('should detect Pagination pattern by keywords', () => {
      const code = 'const pageSize = 10; const limit = 20; const offset = (page - 1) * pageSize;';
      const result = patternDetector['fallbackKeywordDetection'](code);

      expect(result.pattern).toBe('Pagination');
      expect(result.confidence).toBe(0.75);
    });

    it('should detect CRUD pattern by multiple keywords', () => {
      const code = 'async function create() {} async function read() {} async function update() {} async function delete() {}';
      const result = patternDetector['fallbackKeywordDetection'](code);

      expect(result.pattern).toBe('CRUD');
      expect(result.confidence).toBe(0.65);
    });

    it('should return None when no pattern keywords found', () => {
      const code = 'const x = 1; const y = 2; return x + y;';
      const result = patternDetector['fallbackKeywordDetection'](code);

      expect(result.pattern).toBe('None');
      expect(result.confidence).toBe(0);
    });
  });

  describe('shouldFlagPattern', () => {
    it('should flag pattern with confidence >= 0.6', () => {
      const result = {
        pattern: 'CRUD' as const,
        confidence: 0.75,
        reasoning: 'Test',
        suggestedImprovements: [],
      };

      expect(patternDetector.shouldFlagPattern(result)).toBe(true);
    });

    it('should not flag pattern with confidence < 0.6', () => {
      const result = {
        pattern: 'CRUD' as const,
        confidence: 0.5,
        reasoning: 'Test',
        suggestedImprovements: [],
      };

      expect(patternDetector.shouldFlagPattern(result)).toBe(false);
    });

    it('should not flag "None" pattern', () => {
      const result = {
        pattern: 'None' as const,
        confidence: 1.0,
        reasoning: 'Test',
        suggestedImprovements: [],
      };

      expect(patternDetector.shouldFlagPattern(result)).toBe(false);
    });

    it('should flag exactly at confidence threshold (0.6)', () => {
      const result = {
        pattern: 'Forms' as const,
        confidence: 0.6,
        reasoning: 'Test',
        suggestedImprovements: [],
      };

      expect(patternDetector.shouldFlagPattern(result)).toBe(true);
    });
  });

  describe('Integration: LLM -> Fallback flow', () => {
    it('should use LLM when available, fallback on error', async () => {
      const code = 'const { data } = useQuery();';

      // First call: LLM succeeds
      (mockLLMClient.sendMessage as any).mockResolvedValueOnce({
        success: true,
        message: JSON.stringify({
          pattern: 'DataFetching',
          confidence: 0.88,
          reasoning: 'Uses TanStack Query',
          suggestedImprovements: [],
        }),
      });

      const llmResult = await patternDetector.detectPatternWithLLM(code, 'hook.ts');
      expect(llmResult.pattern).toBe('DataFetching');
      expect(llmResult.confidence).toBe(0.88);

      // Second call: LLM fails, uses fallback
      (mockLLMClient.sendMessage as any).mockResolvedValueOnce({
        success: false,
        error: 'Service down',
      });

      const fallbackResult = await patternDetector.detectPatternWithLLM(code, 'hook.ts');
      expect(fallbackResult.pattern).toBe('DataFetching');
      expect(fallbackResult.confidence).toBe(0.85); // Fallback confidence
    });
  });

  describe('Suggested improvements', () => {
    it('should parse suggested improvements from LLM response', async () => {
      const improvements = [
        'Add error boundary',
        'Implement retry logic',
        'Add caching strategy',
      ];

      (mockLLMClient.sendMessage as any).mockResolvedValue({
        success: true,
        message: JSON.stringify({
          pattern: 'DataFetching',
          confidence: 0.9,
          reasoning: 'API call pattern',
          suggestedImprovements: improvements,
        }),
      });

      const result = await patternDetector.detectPatternWithLLM('const data = fetch();', 'api.ts');

      expect(result.suggestedImprovements).toEqual(improvements);
      expect(result.suggestedImprovements).toHaveLength(3);
    });

    it('should handle empty suggestedImprovements gracefully', async () => {
      (mockLLMClient.sendMessage as any).mockResolvedValue({
        success: true,
        message: JSON.stringify({
          pattern: 'None',
          confidence: 0,
          reasoning: 'No pattern',
          suggestedImprovements: null, // Invalid but should handle
        }),
      });

      const result = await patternDetector.detectPatternWithLLM('code', 'file.ts');

      expect(Array.isArray(result.suggestedImprovements)).toBe(true);
      expect(result.suggestedImprovements.length).toBe(0);
    });
  });
});
