/**
 * TTS Service - Node.js bridge to Python ChatTTS
 * 
 * Manages:
 * - Subprocess spawning (Python TTS service)
 * - Text chunking at sentence boundaries
 * - Audio file caching
 * - Error handling with fallback
 * - Metadata reporting (sample rate, duration)
 */

import { spawn, SpawnOptionsWithoutStdio } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Audio metadata from TTS service
 */
export interface AudioMetadata {
  sample_rate: number;
  size: number;
  duration: number; // seconds
}

/**
 * Synthesis result (audio + metadata)
 */
export interface SynthesisResult {
  audio: Buffer;
  metadata: AudioMetadata;
}

/**
 * TTS Service configuration
 */
export interface TTSConfig {
  pythonPath?: string; // Path to python executable
  pythonDir?: string; // Directory containing python/ folder
  cacheDir?: string; // Where to cache audio files
  maxChunkLength?: number; // Max chars per synthesis call
  language?: string; // 'en' or 'zh'
  timeout?: number; // Subprocess timeout in ms
}

export class TTSService {
  private pythonPath: string;
  private pythonDir: string;
  private cacheDir: string;
  private maxChunkLength: number;
  private language: string;
  private timeout: number;
  private isAvailable: boolean = false;

  constructor(config: TTSConfig = {}) {
    this.pythonPath = config.pythonPath || 'python3';
    this.pythonDir = config.pythonDir || path.join(__dirname, '../../python');
    this.cacheDir = config.cacheDir || path.join(os.homedir(), '.cache', 'chat-tts');
    this.maxChunkLength = config.maxChunkLength || 500; // chars
    this.language = config.language || 'en';
    this.timeout = config.timeout || 30000; // 30 seconds
  }

  /**
   * Check if TTS is available (Python + model installed)
   */
  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.runPythonService(
        '--info',
        { captureOutput: true, timeout: 5000 }
      );

      // If we get metadata back, TTS is available
      this.isAvailable = result.metadata !== null;
      return this.isAvailable;
    } catch (e) {
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Synthesize text to audio
   * 
   * Handles:
   * - Text chunking at sentence boundaries
   * - Caching
   * - Error recovery
   * 
   * @param text - Text to synthesize
   * @param lang - Language (optional, uses config default)
   * @returns Audio buffer + metadata
   */
  async synthesize(text: string, lang?: string): Promise<SynthesisResult> {
    const language = lang || this.language;

    // Check cache first
    const cacheKey = this.getCacheKey(text, language);
    const cached = await this.readCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Chunk text at sentence boundaries
    const chunks = this.chunkText(text);
    
    if (chunks.length === 1) {
      // Single chunk - synthesize directly
      return this.synthesizeChunk(chunks[0], language, cacheKey);
    } else {
      // Multiple chunks - concatenate audio
      return this.synthesizeMultiple(chunks, language, cacheKey);
    }
  }

  /**
   * Synthesize a single chunk (internal)
   */
  private async synthesizeChunk(
    text: string,
    lang: string,
    cacheKey: string
  ): Promise<SynthesisResult> {
    try {
      const result = await this.runPythonService(
        `--text "${this.escapePythonString(text)}" --lang ${lang}`,
        { captureOutput: true, timeout: this.timeout }
      );

      // Cache the result
      await this.writeCache(cacheKey, result.audio, result.metadata);

      return result;
    } catch (error) {
      throw new Error(`TTS synthesis failed: ${String(error)}`);
    }
  }

  /**
   * Synthesize multiple chunks and concatenate
   */
  private async synthesizeMultiple(
    chunks: string[],
    lang: string,
    cacheKey: string
  ): Promise<SynthesisResult> {
    const audioBuffers: Buffer[] = [];
    let totalDuration = 0;

    for (const chunk of chunks) {
      try {
        const result = await this.synthesizeChunk(chunk, lang, '');
        audioBuffers.push(result.audio);
        totalDuration += result.metadata.duration;
      } catch (error) {
        // Log but continue with other chunks
        console.warn(`Failed to synthesize chunk: ${String(error)}`);
      }
    }

    if (audioBuffers.length === 0) {
      throw new Error('No chunks synthesized successfully');
    }

    // Concatenate audio buffers (simple concatenation for WAV files)
    const audio = Buffer.concat(audioBuffers);
    const metadata: AudioMetadata = {
      sample_rate: 24000, // ChatTTS standard
      size: audio.length,
      duration: totalDuration,
    };

    // Cache the concatenated result
    await this.writeCache(cacheKey, audio, metadata);

    return { audio, metadata };
  }

  /**
   * Run Python TTS service via subprocess
   */
  private async runPythonService(
    args: string,
    options: { captureOutput: boolean; timeout: number }
  ): Promise<SynthesisResult> {
    return new Promise((resolve, reject) => {
      const pythonScript = path.join(this.pythonDir, 'tts_service.py');
      const spawnArgs = `${pythonScript} ${args}`.split(' ');

      const timeout = setTimeout(() => {
        python.kill('SIGTERM');
        reject(new Error('TTS service timeout'));
      }, options.timeout);

      const python = spawn(this.pythonPath, spawnArgs);
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      python.stdout.on('data', (data) => {
        stdout.push(data);
      });

      python.stderr.on('data', (data) => {
        stderr.push(data);
      });

      python.on('close', (code) => {
        clearTimeout(timeout);

        if (code !== 0) {
          const errorMsg = Buffer.concat(stderr).toString('utf-8');
          try {
            const error = JSON.parse(errorMsg);
            reject(new Error(error.error || 'Unknown error'));
          } catch {
            reject(new Error(`Python process exited with code ${code}`));
          }
          return;
        }

        // Parse metadata from stderr
        const stderrStr = Buffer.concat(stderr).toString('utf-8').trim();
        let metadata: AudioMetadata;

        try {
          metadata = JSON.parse(stderrStr);
        } catch {
          reject(new Error('Failed to parse TTS metadata'));
          return;
        }

        const audio = Buffer.concat(stdout);
        resolve({ audio, metadata });
      });

      python.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Chunk text at sentence boundaries
   */
  private chunkText(text: string): string[] {
    // Split on sentence boundaries (. ! ? followed by space or newline)
    const sentences = text.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + ' ' + sentence).length > this.maxChunkLength) {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    if (currentChunk) chunks.push(currentChunk.trim());
    return chunks.filter((c) => c.length > 0);
  }

  /**
   * Generate cache key from text and language
   */
  private getCacheKey(text: string, lang: string): string {
    const crypto = require('crypto');
    const hash = crypto
      .createHash('sha256')
      .update(text + lang)
      .digest('hex');
    return hash.substring(0, 16);
  }

  /**
   * Read audio from cache
   */
  private async readCache(key: string): Promise<SynthesisResult | null> {
    try {
      const audioPath = path.join(this.cacheDir, `${key}.wav`);
      const metadataPath = path.join(this.cacheDir, `${key}.json`);

      const [audio, metadataStr] = await Promise.all([
        fs.readFile(audioPath),
        fs.readFile(metadataPath, 'utf-8'),
      ]);

      const metadata = JSON.parse(metadataStr) as AudioMetadata;
      return { audio, metadata };
    } catch {
      return null; // Cache miss
    }
  }

  /**
   * Write audio to cache
   */
  private async writeCache(
    key: string,
    audio: Buffer,
    metadata: AudioMetadata
  ): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });

      const audioPath = path.join(this.cacheDir, `${key}.wav`);
      const metadataPath = path.join(this.cacheDir, `${key}.json`);

      await Promise.all([
        fs.writeFile(audioPath, audio),
        fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2)),
      ]);
    } catch (error) {
      // Log warning but don't fail - cache is optional
      console.warn(`Failed to cache TTS audio: ${String(error)}`);
    }
  }

  /**
   * Escape string for Python command line
   */
  private escapePythonString(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  /**
   * Clear cache directory
   */
  async clearCache(): Promise<void> {
    try {
      const files = await fs.readdir(this.cacheDir);
      await Promise.all(
        files.map((file) => fs.unlink(path.join(this.cacheDir, file)))
      );
    } catch (error) {
      console.warn(`Failed to clear cache: ${String(error)}`);
    }
  }

  /**
   * Get cache size in bytes
   */
  async getCacheSize(): Promise<number> {
    try {
      const files = await fs.readdir(this.cacheDir);
      const sizes = await Promise.all(
        files.map(async (file) => {
          const stat = await fs.stat(path.join(this.cacheDir, file));
          return stat.size;
        })
      );
      return sizes.reduce((a, b) => a + b, 0);
    } catch {
      return 0;
    }
  }
}

// Export singleton instance
let instance: TTSService | null = null;

export function getTTSService(config?: TTSConfig): TTSService {
  if (!instance) {
    instance = new TTSService(config);
  }
  return instance;
}
