/**
 * Example: Call Ollama's /api/generate endpoint directly
 * @param prompt The prompt to send
 * @param model The model to use (e.g., "llama2")
 * @param endpoint The Ollama endpoint (default: http://127.0.0.1:9000)
 */
export declare function ollamaGenerate({ prompt, model, endpoint }: {
    prompt: string;
    model?: string;
    endpoint?: string;
}): Promise<string>;
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
}
export interface LLMResponse {
    success: boolean;
    message?: string;
    error?: string;
    tokensUsed?: number;
}
export type StreamCallback = (token: string, complete: boolean) => Promise<void>;
export declare class LLMClient {
    private config;
    private conversationHistory;
    constructor(config: LLMConfig);
    /**
     * Check if the LLM server is healthy
     */
    isServerHealthy(): Promise<boolean>;
    /**
     * Send message with streaming response
     */
    sendMessageStream(userMessage: string, onToken: StreamCallback): Promise<LLMResponse>;
    /**
     * Send message without streaming
     */
    sendMessage(userMessage: string): Promise<LLMResponse>;
    /**
     * Clear conversation history
     */
    clearHistory(): void;
    /**
     * Get current conversation history
     */
    getHistory(): Array<{
        role: string;
        content: string;
    }>;
}
//# sourceMappingURL=llmClient.d.ts.map