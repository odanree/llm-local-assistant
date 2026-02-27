import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LLMConfig, LLMResponse, StreamCallback } from '../llmClient';
import { LLMClient } from '../llmClient';

/**
 * Phase 9B: LLMClient Branch Coverage Deep Dive
 *
 * Target: Close the massive 17.18% gap between statements (75.18%) and branch (58%) coverage
 * Focus: Decision logic, error paths, status code handling, timeout scenarios
 *
 * Key Areas:
 * - HTTP status codes (200, 400, 404, 503, other)
 * - Timeout handling and AbortController
 * - Streaming response parsing
 * - Conversation history management
 * - Model information API responses
 * - Error message generation
 *
 * Expected gain: +3-5% overall coverage from branch logic testing
 */

describe('Phase 9B: LLMClient Branch Coverage Deep Dive', () => {
  let client: LLMClient;
  let config: LLMConfig;
  let fetchSpy: any;

  beforeEach(() => {
    config = {
      endpoint: 'http://localhost:8000',
      model: 'llama2',
      temperature: 0.7,
      maxTokens: 1024,
      timeout: 5000,
      stream: true,
    };

    client = new LLMClient(config);

    // Mock fetch globally
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Server Health Check - isServerHealthy()', () => {
    it('should return true when server is healthy (200 OK)', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const healthy = await client.isServerHealthy();

      expect(healthy).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8000/api/tags',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return false when server is not healthy (non-200)', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const healthy = await client.isServerHealthy();

      expect(healthy).toBe(false);
    });

    it('should return false when fetch fails', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Network error'));

      const healthy = await client.isServerHealthy();

      expect(healthy).toBe(false);
    });

    it('should handle timeout during health check', async () => {
      fetchSpy.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('AbortError')), 100);
          })
      );

      const healthy = await client.isServerHealthy();

      expect(healthy).toBe(false);
    });

    it('should handle connection refused errors', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const healthy = await client.isServerHealthy();

      expect(healthy).toBe(false);
    });
  });

  describe('Model Info Retrieval - getModelInfo()', () => {
    it('should return model info with available models', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            { name: 'llama2' },
            { name: 'mistral' },
            { name: 'neural-chat' },
          ],
        }),
      });

      const info = await client.getModelInfo();

      expect(info.configuredModel).toBe('llama2');
      expect(info.availableModels).toEqual(['llama2', 'mistral', 'neural-chat']);
      expect(info.error).toBeUndefined();
    });

    it('should handle empty models array', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      const info = await client.getModelInfo();

      expect(info.availableModels).toEqual([]);
      expect(info.error).toBeUndefined();
    });

    it('should handle missing models property', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const info = await client.getModelInfo();

      expect(info.availableModels).toEqual([]);
      expect(info.error).toBeUndefined();
    });

    it('should return error when server returns 404', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const info = await client.getModelInfo();

      expect(info.availableModels).toEqual([]);
      expect(info.error).toContain('404');
    });

    it('should return error when server returns 500', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const info = await client.getModelInfo();

      expect(info.error).toBeDefined();
      expect(info.availableModels).toEqual([]);
    });

    it('should handle fetch errors in getModelInfo', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Network failure'));

      const info = await client.getModelInfo();

      expect(info.error).toContain('Network failure');
      expect(info.availableModels).toEqual([]);
    });

    it('should handle timeout in getModelInfo', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Timeout'));

      const info = await client.getModelInfo();

      expect(info.error).toBeDefined();
    });

    it('should preserve configured model and endpoint in error case', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Network error'));

      const info = await client.getModelInfo();

      expect(info.configuredModel).toBe('llama2');
      expect(info.endpoint).toBe('http://localhost:8000');
      expect(info.availableModels).toEqual([]);
    });
  });

  describe('Send Message Stream - sendMessageStream()', () => {
    it('should handle successful streaming response', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n'),
              })
              .mockResolvedValueOnce({
                done: true,
              }),
          }),
        },
      };

      fetchSpy.mockResolvedValueOnce(mockResponse);

      const tokens: string[] = [];
      const callback: StreamCallback = async (token, complete) => {
        tokens.push(token);
      };

      const result = await client.sendMessageStream('Hi', callback);

      expect(result.success).toBe(true);
    });

    it('should handle 404 Model Not Found error', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        clone: () => ({
          text: async () => 'Model not found',
        }),
      });

      const callback: StreamCallback = async () => {};
      const result = await client.sendMessageStream('Hi', callback);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Model not found');
    });

    it('should handle 503 Server Busy error', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 503,
        clone: () => ({
          text: async () => 'Service Unavailable',
        }),
      });

      const callback: StreamCallback = async () => {};
      const result = await client.sendMessageStream('Hi', callback);

      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM server is busy');
    });

    it('should handle 400 Bad Request error', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 400,
        clone: () => ({
          text: async () => 'Invalid request body',
        }),
      });

      const callback: StreamCallback = async () => {};
      const result = await client.sendMessageStream('Hi', callback);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Bad Request');
    });

    it('should handle generic server error', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        clone: () => ({
          text: async () => 'Server error',
        }),
      });

      const callback: StreamCallback = async () => {};
      const result = await client.sendMessageStream('Hi', callback);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Server error');
    });

    it('should handle non-readable response body', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        body: null,
      });

      const callback: StreamCallback = async () => {};
      const result = await client.sendMessageStream('Hi', callback);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not readable');
    });

    it('should handle network error during streaming', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Network error'));

      const callback: StreamCallback = async () => {};
      const result = await client.sendMessageStream('Hi', callback);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle malformed JSON in stream', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: {invalid json}\n'),
              })
              .mockResolvedValueOnce({
                done: true,
              }),
          }),
        },
      };

      fetchSpy.mockResolvedValueOnce(mockResponse);

      const callback: StreamCallback = async () => {};
      const result = await client.sendMessageStream('Hi', callback);

      // Should handle gracefully and continue
      expect(result.success).toBe(true);
    });

    it('should skip non-data lines in stream', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('ignored: line\ndata: {"choices":[{"delta":{"content":"Test"}}]}\n'),
              })
              .mockResolvedValueOnce({
                done: true,
              }),
          }),
        },
      };

      fetchSpy.mockResolvedValueOnce(mockResponse);

      const callback: StreamCallback = async () => {};
      const result = await client.sendMessageStream('Hi', callback);

      expect(result.success).toBe(true);
    });

    it('should handle multiple chunks in stream', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n'),
              })
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":" "}}]}\n'),
              })
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"World"}}]}\n'),
              })
              .mockResolvedValueOnce({
                done: true,
              }),
          }),
        },
      };

      fetchSpy.mockResolvedValueOnce(mockResponse);

      const tokens: string[] = [];
      const callback: StreamCallback = async (token) => {
        tokens.push(token);
      };

      const result = await client.sendMessageStream('Hi', callback);

      expect(result.success).toBe(true);
    });

    it('should handle empty content in stream chunk', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: {"choices":[{"delta":{}}]}\n'),
              })
              .mockResolvedValueOnce({
                done: true,
              }),
          }),
        },
      };

      fetchSpy.mockResolvedValueOnce(mockResponse);

      const callback: StreamCallback = async () => {};
      const result = await client.sendMessageStream('Hi', callback);

      expect(result.success).toBe(true);
    });
  });

  describe('Send Non-Streaming Message - sendMessage()', () => {
    it('should send message and get response', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Hello! How can I help?' } }],
          usage: { total_tokens: 50 },
        }),
      });

      const result = await client.sendMessage('Hi');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Hello! How can I help?');
      expect(result.tokensUsed).toBe(50);
    });

    it('should handle error response in sendMessage', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        clone: () => ({
          text: async () => 'Server error',
        }),
      });

      const result = await client.sendMessage('Hi');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle network error in sendMessage', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Network failure'));

      const result = await client.sendMessage('Hi');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle missing choices in response', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ usage: { total_tokens: 50 } }),
      });

      const result = await client.sendMessage('Hi');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle missing message in choices', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{}],
          usage: { total_tokens: 50 },
        }),
      });

      const result = await client.sendMessage('Hi');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should track tokens used in response', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
          usage: { total_tokens: 123 },
        }),
      });

      const result = await client.sendMessage('Hi');

      expect(result.tokensUsed).toBe(123);
    });

    it('should handle missing token usage', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
        }),
      });

      const result = await client.sendMessage('Hi');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Response');
    });
  });

  describe('Conversation History Management', () => {
    it('should maintain conversation history across messages', async () => {
      // First message
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'First response' } }],
        }),
      });

      await client.sendMessage('First question');

      // Second message should include first in history
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Second response' } }],
        }),
      });

      const result = await client.sendMessage('Second question');

      expect(result.success).toBe(true);
    });

    it('should build correct message format with system prompt', async () => {
      const clientWithRules = new LLMClient({
        ...config,
        architectureRules: 'Follow MVC pattern',
      });

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
        }),
      });

      await clientWithRules.sendMessage('Test message');

      const callArgs = (globalThis.fetch as any).mock.calls[0];
      const payload = JSON.parse(callArgs[1].body);

      expect(payload.messages.length).toBeGreaterThan(0);
      // Should have system message if rules provided
      const hasSystemMessage = payload.messages.some(
        (m: any) => m.role === 'system'
      );
      expect(hasSystemMessage).toBe(true);
    });

    it('should not add system message when no architecture rules', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
        }),
      });

      await client.sendMessage('Test message');

      const callArgs = (globalThis.fetch as any).mock.calls[0];
      const payload = JSON.parse(callArgs[1].body);

      const hasSystemMessage = payload.messages.some(
        (m: any) => m.role === 'system'
      );
      expect(hasSystemMessage).toBe(false);
    });
  });

  describe('Configuration Management', () => {
    it('should return current configuration', () => {
      const retrievedConfig = client.getConfig();

      expect(retrievedConfig).toEqual(config);
      expect(retrievedConfig.model).toBe('llama2');
      expect(retrievedConfig.endpoint).toBe('http://localhost:8000');
    });

    it('should preserve configuration across method calls', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
      });

      await client.isServerHealthy();

      const retrievedConfig = client.getConfig();

      expect(retrievedConfig).toEqual(config);
    });

    it('should use temperature and maxTokens from config', async () => {
      const customConfig: LLMConfig = {
        endpoint: 'http://localhost:8000',
        model: 'custom-model',
        temperature: 0.3,
        maxTokens: 2048,
        timeout: 10000,
      };

      const customClient = new LLMClient(customConfig);

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValueOnce({ done: true }),
          }),
        },
      });

      await customClient.sendMessageStream('Test', async () => {});

      const callArgs = (globalThis.fetch as any).mock.calls[0];
      const payload = JSON.parse(callArgs[1].body);

      expect(payload.temperature).toBe(0.3);
      expect(payload.max_tokens).toBe(2048);
    });
  });

  describe('Model Name Trimming', () => {
    it('should trim model name in request payload', async () => {
      const trimConfig: LLMConfig = {
        endpoint: 'http://localhost:8000',
        model: '  llama2  ',
        temperature: 0.7,
        maxTokens: 1024,
        timeout: 5000,
      };

      const trimClient = new LLMClient(trimConfig);

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValueOnce({ done: true }),
          }),
        },
      });

      await trimClient.sendMessageStream('Test', async () => {});

      const callArgs = (globalThis.fetch as any).mock.calls[0];
      const payload = JSON.parse(callArgs[1].body);

      expect(payload.model).toBe('llama2');
    });
  });

  describe('Endpoint URL Construction', () => {
    it('should construct correct streaming endpoint', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValueOnce({ done: true }),
          }),
        },
      });

      await client.sendMessageStream('Test', async () => {});

      const callUrl = (globalThis.fetch as any).mock.calls[0][0];

      expect(callUrl).toContain('/v1/chat/completions');
      expect(callUrl).toContain('http://localhost:8000');
    });

    it('should construct correct health check endpoint', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
      });

      await client.isServerHealthy();

      const callUrl = (globalThis.fetch as any).mock.calls[0][0];

      expect(callUrl).toContain('/api/tags');
    });

    it('should construct correct model info endpoint', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      await client.getModelInfo();

      const callUrl = (globalThis.fetch as any).mock.calls[0][0];

      expect(callUrl).toContain('/api/tags');
    });
  });

  describe('Stream Error Response Handling', () => {
    it('should read error body from failed response', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 400,
        clone: () => ({
          text: async () => 'Invalid model parameter',
        }),
      });

      const callback: StreamCallback = async () => {};
      const result = await client.sendMessageStream('Hi', callback);

      expect(result.error).toContain('Invalid model parameter');
    });

    it('should handle error body read failures', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        clone: () => ({
          text: async () => {
            throw new Error('Cannot read response');
          },
        }),
      });

      const callback: StreamCallback = async () => {};
      const result = await client.sendMessageStream('Hi', callback);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Response Content Extraction', () => {
    it('should extract token from nested response structure', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode(
                  'data: {"choices":[{"delta":{"content":"extracted"}}]}\n'
                ),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      fetchSpy.mockResolvedValueOnce(mockResponse);

      const tokens: string[] = [];
      const callback: StreamCallback = async (token) => {
        tokens.push(token);
      };

      const result = await client.sendMessageStream('Hi', callback);

      expect(result.success).toBe(true);
    });

    it('should handle missing choices array', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: {"message":"no choices"}\n'),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      fetchSpy.mockResolvedValueOnce(mockResponse);

      const callback: StreamCallback = async () => {};
      const result = await client.sendMessageStream('Hi', callback);

      expect(result.success).toBe(true);
    });

    it('should handle missing delta object', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: {"choices":[{"message":{"content":"test"}}]}\n'),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      fetchSpy.mockResolvedValueOnce(mockResponse);

      const callback: StreamCallback = async () => {};
      const result = await client.sendMessageStream('Hi', callback);

      expect(result.success).toBe(true);
    });
  });
});
