/**
 * TTS Strategy Interface - Pluggable TTS Backends
 * 
 * Allows swapping different TTS implementations (edge-tts, chatterbox, etc)
 * without changing the extension code.
 * 
 * Example: Switch from edge-tts to chatterbox by changing getTTSService config
 */

/**
 * Audio metadata returned by TTS strategies
 */
export interface AudioMetadata {
  sample_rate: number;
  size: number;
  duration: number; // seconds
  backend?: string; // Name of the backend (for debugging)
}

/**
 * Synthesis result (audio + metadata)
 */
export interface SynthesisResult {
  audio: Buffer;
  metadata: AudioMetadata;
}

/**
 * TTS Strategy Configuration (base)
 */
export interface TTSStrategyConfig {
  cacheDir?: string;
  timeout?: number;
  language?: string;
  maxChunkLength?: number;
}

/**
 * TTS Strategy Interface
 * 
 * All TTS backends must implement this interface to be swappable.
 */
export interface ITTSStrategy {
  /**
   * Check if TTS service is available/working
   */
  isAvailable(): Promise<boolean>;

  /**
   * Synthesize text to audio
   * @param text - Text to synthesize
   * @param lang - Language code (e.g., 'en', 'zh')
   */
  synthesize(text: string, lang?: string): Promise<SynthesisResult>;

  /**
   * Get backend name for debugging
   */
  getBackendName(): string;

  /**
   * Get backend information
   */
  getInfo(): Promise<Record<string, any>>;
}

/**
 * Abstract base class for TTS strategies
 * Provides common functionality (caching, chunking, etc)
 */
export abstract class BaseTTSStrategy implements ITTSStrategy {
  protected cacheDir: string;
  protected maxChunkLength: number;
  protected language: string;
  protected timeout: number;
  protected _isAvailable: boolean = false;

  constructor(config: TTSStrategyConfig = {}) {
    const os = require('os');
    const path = require('path');
    
    this.cacheDir = config.cacheDir || path.join(os.homedir(), '.cache', 'llm-assistant-tts');
    this.maxChunkLength = config.maxChunkLength || 500;
    this.language = config.language || 'en';
    this.timeout = config.timeout || 30000;
  }

  abstract isAvailable(): Promise<boolean>;
  abstract synthesize(text: string, lang?: string): Promise<SynthesisResult>;
  abstract getBackendName(): string;
  abstract getInfo(): Promise<Record<string, any>>;

  /**
   * Chunk text at sentence boundaries
   */
  protected chunkText(text: string, maxLength: number = this.maxChunkLength): string[] {
    // Split at sentence boundaries (. ! ? followed by space or end)
    const sentences = text.match(/[^.!?]*[.!?]+/g) || [text];
    
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;

      if ((current + trimmed).length > maxLength && current.length > 0) {
        chunks.push(current.trim());
        current = trimmed;
      } else {
        current += (current ? ' ' : '') + trimmed;
      }
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    return chunks.length > 0 ? chunks : [text];
  }

  /**
   * Escape string for command line
   */
  protected escapePythonString(str: string): string {
    return str.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
  }

  /**
   * Generate cache key for text
   */
  protected getCacheKey(text: string, lang: string): string {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(`${text}:${lang}`).digest('hex');
    return hash;
  }

  /**
   * Format metadata with backend name
   */
  protected formatMetadata(metadata: Partial<AudioMetadata>): AudioMetadata {
    return {
      sample_rate: metadata.sample_rate || 24000,
      size: metadata.size || 0,
      duration: metadata.duration || 0,
      backend: this.getBackendName(),
    };
  }
}
