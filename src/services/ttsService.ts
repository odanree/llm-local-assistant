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
  extensionPath?: string; // VS Code extension path (from context.extensionPath)
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
  private _isAvailable: boolean = false;

  constructor(config: TTSConfig = {}) {
    // Determine correct Python command based on platform
    // Windows uses 'python', Unix-like systems use 'python3'
    const defaultPythonPath = os.platform() === 'win32' ? 'python' : 'python3';
    this.pythonPath = config.pythonPath || defaultPythonPath;
    
    // Resolve python directory - prefer extensionPath if provided (production)
    if (config.pythonDir) {
      this.pythonDir = config.pythonDir;
    } else if (config.extensionPath) {
      // Production: Use absolute path from VS Code extension context
      // When packaged, extension is at: %USERPROFILE%\.vscode\extensions\odanree.llm-local-assistant-X.X.X\
      this.pythonDir = path.join(config.extensionPath, 'python');
    } else {
      // Development fallback: Use relative path from dist/
      // In dev, __dirname = /project/dist, we want /project/python
      this.pythonDir = path.join(__dirname, '../python');
      
      // If that doesn't exist, try the fallback
      const fallback = path.join(__dirname, '../../python');
      if (!require('fs').existsSync(this.pythonDir) && require('fs').existsSync(fallback)) {
        this.pythonDir = fallback;
      }
    }
    
    this.cacheDir = config.cacheDir || path.join(os.homedir(), '.cache', 'llm-assistant-tts');
    this.maxChunkLength = config.maxChunkLength || 500; // chars
    this.language = config.language || 'en';
    this.timeout = config.timeout || 30000; // 30 seconds
    
    console.log('[TTS] Service initialized:');
    console.log('[TTS]   pythonDir:', this.pythonDir);
    console.log('[TTS]   pythonPath:', this.pythonPath);
    console.log('[TTS]   cacheDir:', this.cacheDir);
    console.log('[TTS]   extensionPath:', config.extensionPath || '(not provided)');
  }

  /**
   * Check if TTS is available (Python + edge-tts installed)
   */
  async isAvailable(): Promise<boolean> {
    try {
      const pythonScript = path.join(this.pythonDir, 'tts_service.py');
      
      // Check if the Python script exists
      try {
        await fs.access(pythonScript);
      } catch {
        console.log('[TTS] Script not found at:', pythonScript);
        return false;
      }

      // Just check --info instead of doing a full synthesis
      // This verifies edge-tts is installed without the timeout risk
      console.log('[TTS] Checking edge-tts availability...');
      const result = await this.runPythonService(
        '--info',
        { captureOutput: true, timeout: 5000 }
      );

      // If we got metadata back with edge-tts backend, TTS is available
      const available = result.metadata && result.metadata.backend === 'edge-tts';
      console.log('[TTS] Check result:', available, 'metadata:', result.metadata);
      this._isAvailable = available;
      return available;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn('[TTS] Check failed:', errorMsg);
      this._isAvailable = false;
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

      // Ensure duration is set (if missing, estimate from size)
      if (!result.metadata.duration || result.metadata.duration === 0) {
        // MP3 bitrate is typically 128kbps = 16KB/s
        // So duration in seconds = size / 16000
        result.metadata.duration = Math.max(0.1, result.audio.length / 16000);
        console.log('[TTS] Estimated duration:', result.metadata.duration);
      }

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

    console.log('[TTS] Synthesizing', chunks.length, 'chunks');

    for (const chunk of chunks) {
      try {
        const result = await this.synthesizeChunk(chunk, lang, '');
        audioBuffers.push(result.audio);
        totalDuration += result.metadata.duration;
        console.log('[TTS] Chunk duration:', result.metadata.duration, 'Total so far:', totalDuration);
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

    console.log('[TTS] Final concatenated duration:', totalDuration);

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
      
      // Parse args properly - don't just split on spaces
      // Args are passed as a string like: --text "hello world" --lang en
      const spawnArgs = [pythonScript];
      
      // Simple argument parser: split on spaces but respect quoted strings
      let currentArg = '';
      let inQuotes = false;
      for (let i = 0; i < args.length; i++) {
        const char = args[i];
        if (char === '"' && (i === 0 || args[i - 1] !== '\\')) {
          inQuotes = !inQuotes;
          currentArg += char;
        } else if (char === ' ' && !inQuotes) {
          if (currentArg) {
            spawnArgs.push(currentArg);
            currentArg = '';
          }
        } else {
          currentArg += char;
        }
      }
      if (currentArg) {
        spawnArgs.push(currentArg);
      }

      console.log('[TTS] Spawning Python service:', this.pythonPath, spawnArgs);

      let pythonProcess: any;
      const timeout = setTimeout(() => {
        if (pythonProcess) {
          pythonProcess.kill('SIGTERM');
        }
        reject(new Error('TTS service timeout'));
      }, options.timeout);

      pythonProcess = spawn(this.pythonPath, spawnArgs);
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      pythonProcess.stdout.on('data', (data: Buffer) => {
        stdout.push(data);
      });

      pythonProcess.stderr.on('data', (data: Buffer) => {
        stderr.push(data);
      });

      pythonProcess.on('close', (code: number) => {
        clearTimeout(timeout);

        if (code !== 0) {
          const errorMsg = Buffer.concat(stderr).toString('utf-8');
          console.log('[TTS] Python stderr:', errorMsg);
          try {
            const error = JSON.parse(errorMsg);
            reject(new Error(error.error || 'Unknown error'));
          } catch {
            reject(new Error(`Python process exited with code ${code}: ${errorMsg}`));
          }
          return;
        }

        // Parse metadata from stderr
        const stderrStr = Buffer.concat(stderr).toString('utf-8').trim();
        let metadata: AudioMetadata;

        console.log('[TTS] Metadata string:', stderrStr);

        try {
          metadata = JSON.parse(stderrStr);
          console.log('[TTS] Parsed metadata:', metadata);
        } catch (e) {
          console.log('[TTS] Failed to parse metadata:', e);
          reject(new Error('Failed to parse TTS metadata'));
          return;
        }

        const audio = Buffer.concat(stdout);
        console.log('[TTS] Audio buffer size:', audio.length);
        resolve({ audio, metadata });
      });

      pythonProcess.on('error', (error: Error) => {
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
      const audioPath = path.join(this.cacheDir, `${key}.mp3`);
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

      const audioPath = path.join(this.cacheDir, `${key}.mp3`);
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
