/**
 * Example: Call Ollama's /api/generate endpoint directly
 * @param prompt The prompt to send
 * @param model The model to use (e.g., "llama2")
 * @param endpoint The Ollama endpoint (default: http://127.0.0.1:9000)
 */
export async function ollamaGenerate({
  prompt,
  model = "llama2",
  endpoint = "http://127.0.0.1:9000"
}: {
  prompt: string;
  model?: string;
  endpoint?: string;
}): Promise<string> {
  const res = await fetch(`${endpoint}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt })
  });
  if (!res.ok) {throw new Error(`LLM API error: ${res.status} ${res.statusText}. Check endpoint and model availability.`);}
  const data = await res.json() as any;
  return data.response as string;
}
/**
 * LLM Client - HTTP communication with local LLM servers
 * Supports both streaming and non-streaming responses
 */

export interface LLMConfig {
  endpoint: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  stream?: boolean;
  architectureRules?: string; // Project-specific rules (.cursorrules content)
}

export interface LLMResponse {
  success: boolean;
  message?: string;
  error?: string;
  tokensUsed?: number;
}

export type StreamCallback = (token: string, complete: boolean) => Promise<void>;

export class LLMClient {
  private config: LLMConfig;
  private conversationHistory: Array<{ role: string; content: string }> = [];

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /**
   * Build messages array with system prompt injection (architecture rules)
   * @param userMessage The user's current message
   * @returns Messages array with optional system message if rules exist
   */
  private buildMessagesWithSystemPrompt(userMessage: string): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    // Inject system prompt with architecture rules if available
    if (this.config.architectureRules) {
      messages.push({
        role: 'system',
        content: `You are a VS Code AI assistant for code generation and planning. Follow the project's architecture rules and patterns.\n\n## PROJECT ARCHITECTURE RULES\n${this.config.architectureRules}`,
      });
    }

    // Add conversation history (user/assistant pairs)
    messages.push(...this.conversationHistory);

    // Add current user message
    messages.push({ role: 'user', content: userMessage });

    return messages;
  }

  /**
   * Check if the LLM server is healthy
   */
  async isServerHealthy(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(`${this.config.endpoint}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.error('LLM server health check failed:', error);
      return false;
    }
  }

  /**
   * Send message with streaming response
   */
  async sendMessageStream(
    userMessage: string,
    onToken: StreamCallback
  ): Promise<LLMResponse> {
    try {
      // Add user message to history
      this.conversationHistory.push({ role: 'user', content: userMessage });

      // Prepare request with system prompt injection
      const endpoint = `${this.config.endpoint}/v1/chat/completions`;
      const payload = {
        model: this.config.model,
        messages: this.buildMessagesWithSystemPrompt(userMessage),
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        stream: true,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const statusError = response.status === 404 ? 'Model not found. Check llm-assistant.model setting.' :
                            response.status === 503 ? 'LLM server is busy. Try again in a moment.' :
                            `Server error: ${response.statusText}`;
        throw new Error(statusError);
      }

      // Process streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let assistantMessage = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {break;}

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines[lines.length - 1];

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (!line || !line.startsWith('data: ')) {continue;}

          try {
            const data = JSON.parse(line.substring(6));
            const token = data.choices?.[0]?.delta?.content;

            if (token) {
              assistantMessage += token;
              await onToken(token, false);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }

      // Signal completion
      await onToken('', true);

      // Add assistant response to history
      this.conversationHistory.push({ role: 'assistant', content: assistantMessage });

      return {
        success: true,
        message: assistantMessage,
        tokensUsed: 0,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // Provide better error message for timeout/abort errors
      if (errorMsg.includes('aborted') || errorMsg.includes('abort')) {
        return {
          success: false,
          error: `Request timeout (120s). LLM server not responding. Check: 1) ollama serve is running 2) Model is loaded 3) Try a simpler request`,
        };
      }
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Send message without streaming
   */
  async sendMessage(userMessage: string): Promise<LLMResponse> {
    try {
      // Add user message to history
      this.conversationHistory.push({ role: 'user', content: userMessage });

      // Prepare request with system prompt injection
      const endpoint = `${this.config.endpoint}/v1/chat/completions`;
      const payload = {
        model: this.config.model,
        messages: this.buildMessagesWithSystemPrompt(userMessage),
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        stream: false,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`LLM server error: ${response.statusText}`);
      }

      const data = await response.json() as any;
      const message = data.choices?.[0]?.message?.content as string;

      if (!message) {
        throw new Error('No response from LLM server');
      }

      // Add assistant response to history
      this.conversationHistory.push({ role: 'assistant', content: message });

      return {
        success: true,
        message,
        tokensUsed: (data.usage?.total_tokens as number) || 0,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // Provide better error message for timeout/abort errors
      if (errorMsg.includes('aborted') || errorMsg.includes('abort')) {
        return {
          success: false,
          error: `Request timeout (120s). LLM server not responding. Check: 1) ollama serve is running 2) Model is loaded 3) Try a simpler request`,
        };
      }
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Get current conversation history
   */
  getHistory(): Array<{ role: string; content: string }> {
    return [...this.conversationHistory];
  }
}
