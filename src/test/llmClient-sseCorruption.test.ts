/**
 * Phase 6.4 Wave 1: LLMClient SSE Corruption Testing
 *
 * Target: Lines 209-222 (Error handling) and 232-259 (Buffer accumulation)
 * Goal: Close the final 0.5% coverage gap by testing edge cases in SSE streaming
 *
 * This test file targets the "Dark Block" in LLMClient:
 * 1. Truncated SSE chunks (buffer accumulation across multiple reads)
 * 2. Malformed SSE format (invalid JSON in SSE lines)
 * 3. Partial JSON handling (closing brace in next chunk)
 * 4. Error response handling (non-200 status codes)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMClient } from '../llmClient';

describe('Phase 6.4 Wave 1: LLMClient SSE Corruption Testing', () => {
  let client: LLMClient;

  beforeEach(() => {
    client = new LLMClient({
      baseURL: 'http://localhost:11434',
      model: 'mistral',
      temperature: 0.7,
      maxTokens: 2048,
      timeout: 30000,
    });
  });

  // ========================================================================
  // WAVE 1.1: Truncated SSE Chunks - Buffer Accumulation
  // ========================================================================

  describe('SSE Buffer Accumulation - Truncated Chunks', () => {
    it('should handle SSE data split across multiple chunks', async () => {
      // Tests lines 232-242: Buffer management when SSE lines span chunks
      // Simulates network delivering: "data: {incomplete..." in chunk 1
      // Then: "...complete}" in chunk 2

      const mockReader = {
        read: vi.fn()
          // Chunk 1: Partial SSE line
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hello')
          })
          // Chunk 2: Continuation
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(' world"}}]}\n')
          })
          // Chunk 3: EOF
          .mockResolvedValueOnce({
            done: true,
            value: undefined
          })
      };

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        body: {
          getReader: () => mockReader
        },
        clone: () => ({ text: async () => '' })
      };

      // Mock fetch to return our response
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const tokens: string[] = [];
      const response = await client.sendMessageStream(
        'test',
        (token) => {
          if (token && !token.endsWith('[END]')) tokens.push(token);
        }
      );

      // Should successfully accumulate and parse the message
      expect(response.success).toBe(true);
      expect(response.message).toContain('hello');
      expect(response.message).toContain('world');
    });

    it('should handle incomplete JSON at chunk boundary', async () => {
      // Tests lines 239-241: Buffer retention when line ends mid-JSON
      // Scenario: {"choices": at end of chunk, [0] at start of next

      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"choices":')
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('[{"delta":{"content":"text"}}]}\n')
          })
          .mockResolvedValueOnce({
            done: true,
            value: undefined
          })
      };

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        body: { getReader: () => mockReader },
        clone: () => ({ text: async () => '' })
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const response = await client.sendMessageStream('test', () => {});

      // Should handle the split JSON correctly
      expect(response.success).toBe(true);
      expect(response.message).toContain('text');
    });

    it('should preserve buffer content when processing multiple lines', async () => {
      // Tests lines 243-258: Line-by-line processing with buffer preservation
      // Multiple SSE lines in single chunk

      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"line1"}}]}\n' +
              'data: {"choices":[{"delta":{"content":"line2"}}]}\n'
            )
          })
          .mockResolvedValueOnce({
            done: true,
            value: undefined
          })
      };

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        body: { getReader: () => mockReader },
        clone: () => ({ text: async () => '' })
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const response = await client.sendMessageStream('test', () => {});

      expect(response.success).toBe(true);
      expect(response.message).toContain('line1');
      expect(response.message).toContain('line2');
    });
  });

  // ========================================================================
  // WAVE 1.2: Malformed SSE Format - JSON Parse Errors
  // ========================================================================

  describe('SSE Format Violations - Invalid JSON', () => {
    it('should gracefully handle malformed JSON in SSE line', async () => {
      // Tests lines 247-257: Try-catch for JSON.parse errors
      // SSE line has "data: " prefix but invalid JSON content

      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {invalid json here}\n' +
              'data: {"choices":[{"delta":{"content":"valid"}}]}\n'
            )
          })
          .mockResolvedValueOnce({
            done: true,
            value: undefined
          })
      };

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        body: { getReader: () => mockReader },
        clone: () => ({ text: async () => '' })
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const response = await client.sendMessageStream('test', () => {});

      // Should skip invalid line and process valid ones
      expect(response.success).toBe(true);
      expect(response.message).toContain('valid');
    });

    it('should skip non-data lines in stream', async () => {
      // Tests lines 244-245: Filtering lines that don\'t start with "data: "
      // SSE spec allows comments and other non-data lines

      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              ':comment line\n' +
              'data: {"choices":[{"delta":{"content":"hello"}}]}\n' +
              ': another comment\n' +
              'data: {"choices":[{"delta":{"content":"world"}}]}\n'
            )
          })
          .mockResolvedValueOnce({
            done: true,
            value: undefined
          })
      };

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        body: { getReader: () => mockReader },
        clone: () => ({ text: async () => '' })
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const response = await client.sendMessageStream('test', () => {});

      expect(response.success).toBe(true);
      expect(response.message).toContain('hello');
      expect(response.message).toContain('world');
      expect(response.message).not.toContain('comment');
    });

    it('should handle empty content tokens', async () => {
      // Tests lines 251-253: Token presence check
      // Some SSE chunks might have delta without content field

      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {"choices":[{"delta":{}}]}\n' +
              'data: {"choices":[{"delta":{"content":"actual"}}]}\n'
            )
          })
          .mockResolvedValueOnce({
            done: true,
            value: undefined
          })
      };

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        body: { getReader: () => mockReader },
        clone: () => ({ text: async () => '' })
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const response = await client.sendMessageStream('test', () => {});

      expect(response.success).toBe(true);
      expect(response.message).toBe('actual');
    });
  });

  // ========================================================================
  // WAVE 1.3: Error Response Handling - Non-200 Status Codes
  // ========================================================================

  describe('Error Response Handling', () => {
    it('should handle 503 Service Unavailable errors', async () => {
      // Tests lines 217-222: 503 specific error message
      // Server returns 503 when LLM is busy

      const mockResponse = {
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        clone: () => ({ text: async () => 'Server busy' })
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const response = await client.sendMessageStream('test', () => {});

      expect(response.success).toBe(false);
      expect(response.error).toContain('busy');
    });

    it('should handle 404 Model Not Found errors', async () => {
      // Tests lines 217-222: 404 specific error message
      // Model doesn't exist in LLM server

      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        clone: () => ({ text: async () => 'Model not found' })
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const response = await client.sendMessageStream('test', () => {});

      expect(response.success).toBe(false);
      expect(response.error).toContain('Model not found');
    });

    it('should handle 400 Bad Request errors', async () => {
      // Tests lines 219-222: 400 error with body details
      // Request payload was invalid

      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        clone: () => ({ text: async () => 'Invalid model parameter' })
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const response = await client.sendMessageStream('test', () => {});

      expect(response.success).toBe(false);
      expect(response.error).toContain('Bad Request');
    });

    it('should handle network timeout errors', async () => {
      // Tests lines 273-279: Timeout error handling
      // Request aborted after 120s timeout

      global.fetch = vi.fn().mockRejectedValue(new Error('request aborted'));

      const response = await client.sendMessageStream('test', () => {});

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/timeout|request/i);
    });
  });

  // ========================================================================
  // WAVE 1.4: Streaming Callback Integration
  // ========================================================================

  describe('Token Callback During Streaming', () => {
    it('should invoke onToken callback for each content chunk', async () => {
      // Tests lines 251-253: Token callback invocation
      // Verify streaming callback fires for each token

      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"hello"}}]}\n' +
              'data: {"choices":[{"delta":{"content":" "}}]}\n' +
              'data: {"choices":[{"delta":{"content":"world"}}]}\n'
            )
          })
          .mockResolvedValueOnce({
            done: true,
            value: undefined
          })
      };

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        body: { getReader: () => mockReader },
        clone: () => ({ text: async () => '' })
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const tokens: string[] = [];
      const response = await client.sendMessageStream('test', (token, isEnd) => {
        if (token) tokens.push(token);
      });

      expect(response.success).toBe(true);
      expect(tokens).toContain('hello');
      expect(tokens).toContain(' ');
      expect(tokens).toContain('world');
    });

    it('should signal completion with isEnd callback', async () => {
      // Tests lines 262: Final onToken(\'', true) call
      // Verify completion signal is sent

      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"message"}}]}\n'
            )
          })
          .mockResolvedValueOnce({
            done: true,
            value: undefined
          })
      };

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        body: { getReader: () => mockReader },
        clone: () => ({ text: async () => '' })
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      let completionSignaled = false;
      await client.sendMessageStream('test', (token, isEnd) => {
        if (isEnd) completionSignaled = true;
      });

      expect(completionSignaled).toBe(true);
    });
  });

  // ========================================================================
  // WAVE 1.5: Real-World SSE Scenarios
  // ========================================================================

  describe('Real-World SSE Scenarios', () => {
    it('should handle typical Ollama streaming response', async () => {
      // Realistic Ollama format
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {"model":"mistral","created_at":"2025-02-26T21:55:00.000Z",' +
              '"choices":[{"index":0,"delta":{"role":"assistant","content":"The"},"finish_reason":null}]}\n'
            )
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {"model":"mistral","created_at":"2025-02-26T21:55:00.100Z",' +
              '"choices":[{"index":0,"delta":{"content":" answer"},"finish_reason":null}]}\n'
            )
          })
          .mockResolvedValueOnce({
            done: true,
            value: undefined
          })
      };

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        body: { getReader: () => mockReader },
        clone: () => ({ text: async () => '' })
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const response = await client.sendMessageStream('test', () => {});

      expect(response.success).toBe(true);
      expect(response.message).toContain('The');
      expect(response.message).toContain('answer');
    });

    it('should handle streaming with mixed empty and content chunks', async () => {
      // Real scenario: some chunks have no content
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {"choices":[{"delta":{}}]}\n' +
              'data: {"choices":[{"delta":{"content":"first"}}]}\n' +
              'data: {"choices":[{"delta":{}}]}\n' +
              'data: {"choices":[{"delta":{"content":"second"}}]}\n'
            )
          })
          .mockResolvedValueOnce({
            done: true,
            value: undefined
          })
      };

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        body: { getReader: () => mockReader },
        clone: () => ({ text: async () => '' })
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const response = await client.sendMessageStream('test', () => {});

      expect(response.success).toBe(true);
      expect(response.message).toBe('firstsecond');
    });
  });
});
