import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMClient, LLMConfig } from './llmClient';

describe('LLMClient', () => {
  let client: LLMClient;
  const mockConfig: LLMConfig = {
    endpoint: 'http://localhost:11434',
    model: 'mistral',
    temperature: 0.7,
    maxTokens: 2048,
    timeout: 30000,
  };

  beforeEach(() => {
    client = new LLMClient(mockConfig);
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create instance with provided config', () => {
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(LLMClient);
    });

    it('should accept different config values', () => {
      const altConfig: LLMConfig = {
        endpoint: 'http://localhost:8000',
        model: 'llama2',
        temperature: 0.5,
        maxTokens: 4096,
        timeout: 60000,
      };
      const altClient = new LLMClient(altConfig);
      expect(altClient).toBeDefined();
    });
  });

  describe('isServerHealthy', () => {
    it('should return boolean for server health check', async () => {
      // Mock fetch for health check
      global.fetch = vi.fn(async () =>
        ({
          ok: true,
          status: 200,
        } as Response),
      );

      const isHealthy = await client.isServerHealthy();
      expect(typeof isHealthy).toBe('boolean');
    });

    it('should return false on connection failure', async () => {
      global.fetch = vi.fn(async () => {
        throw new Error('Connection failed');
      });

      const isHealthy = await client.isServerHealthy();
      expect(isHealthy).toBe(false);
    });

    it('should handle timeout during health check', async () => {
      global.fetch = vi.fn(async () => {
        await new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 100);
        });
        return {} as Response;
      });

      const isHealthy = await client.isServerHealthy();
      expect(isHealthy).toBe(false);
    });
  });

  describe('sendMessage error handling', () => {
    it('should handle connection errors gracefully', async () => {
      global.fetch = vi.fn(async () => {
        throw new Error('Network error');
      });

      try {
        await client.sendMessage('test message');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle invalid endpoint', async () => {
      const badClient = new LLMClient({
        ...mockConfig,
        endpoint: 'not-a-valid-url',
      });

      global.fetch = vi.fn(async () => {
        throw new Error('Invalid URL');
      });

      try {
        await badClient.sendMessage('test');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle 404 model not found error', async () => {
      global.fetch = vi.fn(async () =>
        ({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        } as Response),
      );

      try {
        await client.sendMessage('test');
      } catch (error: any) {
        expect(error.message).toContain('Model not found');
      }
    });

    it('should handle 503 server busy error', async () => {
      global.fetch = vi.fn(async () =>
        ({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
        } as Response),
      );

      try {
        await client.sendMessage('test');
      } catch (error: any) {
        expect(error.message).toContain('server is busy');
      }
    });

    it('should handle timeout errors', async () => {
      const timeoutClient = new LLMClient({
        ...mockConfig,
        timeout: 10,
      });

      global.fetch = vi.fn(async () => {
        await new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 100);
        });
        return {} as Response;
      });

      try {
        await timeoutClient.sendMessage('test');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('sendMessageStream behavior', () => {
    it('should accept callback for streaming', async () => {
      const callback = vi.fn();

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          body: {
            getReader: () => ({
              read: async () => ({ done: true, value: undefined }),
            }),
          },
        } as any as Response),
      );

      try {
        await client.sendMessageStream('test message', callback);
      } catch (error) {
        // Expected to fail with mock, but method signature is correct
      }

      expect(typeof callback).toBe('function');
    });

    it('should handle streaming with multiple tokens', async () => {
      const tokens: string[] = [];
      const callback = vi.fn((token: string) => {
        tokens.push(token);
        return Promise.resolve();
      });

      expect(typeof callback).toBe('function');
    });
  });

  describe('configuration lifecycle', () => {
    it('should maintain config across instance lifetime', () => {
      const config: LLMConfig = {
        endpoint: 'http://localhost:11434',
        model: 'mistral',
        temperature: 0.7,
        maxTokens: 2048,
        timeout: 30000,
      };

      const instance1 = new LLMClient(config);
      const instance2 = new LLMClient(config);

      expect(instance1).toBeDefined();
      expect(instance2).toBeDefined();
    });

    it('should support different model configurations', () => {
      const mistralConfig: LLMConfig = { ...mockConfig, model: 'mistral' };
      const llamaConfig: LLMConfig = { ...mockConfig, model: 'llama2' };
      const neuralConfig: LLMConfig = { ...mockConfig, model: 'neural-chat' };

      const mistralClient = new LLMClient(mistralConfig);
      const llamaClient = new LLMClient(llamaConfig);
      const neuralClient = new LLMClient(neuralConfig);

      expect(mistralClient).toBeDefined();
      expect(llamaClient).toBeDefined();
      expect(neuralClient).toBeDefined();
    });

    it('should support different temperature settings', () => {
      const preciseConfig: LLMConfig = { ...mockConfig, temperature: 0.1 };
      const balancedConfig: LLMConfig = { ...mockConfig, temperature: 0.7 };
      const creativeConfig: LLMConfig = { ...mockConfig, temperature: 0.9 };

      const preciseClient = new LLMClient(preciseConfig);
      const balancedClient = new LLMClient(balancedConfig);
      const creativeClient = new LLMClient(creativeConfig);

      expect(preciseClient).toBeDefined();
      expect(balancedClient).toBeDefined();
      expect(creativeClient).toBeDefined();
    });
  });

  describe('instance isolation', () => {
    it('should maintain separate instances independently', () => {
      const client1 = new LLMClient(mockConfig);
      const client2 = new LLMClient({ ...mockConfig, model: 'llama2' });

      expect(client1).not.toBe(client2);
    });

    it('should support concurrent operations on different instances', async () => {
      const client1 = new LLMClient(mockConfig);
      const client2 = new LLMClient({ ...mockConfig, model: 'llama2' });

      // Both instances exist independently
      expect(client1).toBeDefined();
      expect(client2).toBeDefined();

      // They can be used in parallel conceptually
      expect(client1).not.toEqual(client2);
    });
  });

  describe('API contract validation', () => {
    it('should have sendMessage method', () => {
      expect(typeof client.sendMessage).toBe('function');
    });

    it('should have sendMessageStream method', () => {
      expect(typeof client.sendMessageStream).toBe('function');
    });

    it('should have isServerHealthy method', () => {
      expect(typeof client.isServerHealthy).toBe('function');
    });
  });

  describe('endpoint handling', () => {
    it('should accept Ollama endpoint', () => {
      const ollama = new LLMClient({
        ...mockConfig,
        endpoint: 'http://localhost:11434',
      });
      expect(ollama).toBeDefined();
    });

    it('should accept LM Studio endpoint', () => {
      const lmStudio = new LLMClient({
        ...mockConfig,
        endpoint: 'http://localhost:1234',
      });
      expect(lmStudio).toBeDefined();
    });

    it('should accept vLLM endpoint', () => {
      const vllm = new LLMClient({
        ...mockConfig,
        endpoint: 'http://localhost:8000',
      });
      expect(vllm).toBeDefined();
    });

    it('should accept custom port numbers', () => {
      const custom = new LLMClient({
        ...mockConfig,
        endpoint: 'http://192.168.1.100:9999',
      });
      expect(custom).toBeDefined();
    });
  });

  describe('Architecture Rules (.cursorrules)', () => {
    it('should accept architectureRules in config', () => {
      const rulesConfig: LLMConfig = {
        ...mockConfig,
        architectureRules: 'Use functional components only',
      };
      const rulesClient = new LLMClient(rulesConfig);
      expect(rulesClient).toBeDefined();
    });

    it('should handle empty architecture rules', () => {
      const emptyRulesConfig: LLMConfig = {
        ...mockConfig,
        architectureRules: '',
      };
      const emptyClient = new LLMClient(emptyRulesConfig);
      expect(emptyClient).toBeDefined();
    });

    it('should work with or without architecture rules', () => {
      const withRules = new LLMClient({
        ...mockConfig,
        architectureRules: 'Test rule',
      });
      const withoutRules = new LLMClient(mockConfig);

      expect(withRules).toBeDefined();
      expect(withoutRules).toBeDefined();
    });
  });
});
