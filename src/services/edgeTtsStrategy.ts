/**
 * EdgeTTS Strategy Implementation
 * 
 * TTS backend using edge-tts (Microsoft Edge cloud API)
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  BaseTTSStrategy,
  ITTSStrategy,
  SynthesisResult,
  TTSStrategyConfig,
  AudioMetadata,
} from './ttsStrategy';

export interface EdgeTTSConfig extends TTSStrategyConfig {
  pythonPath?: string;
  pythonDir?: string;
}

export class EdgeTTSStrategy extends BaseTTSStrategy implements ITTSStrategy {
  private pythonPath: string;
  private pythonDir: string;

  constructor(config: EdgeTTSConfig = {}) {
    super(config);
    
    this.pythonPath = config.pythonPath || 'python3';
    
    // Resolve python directory
    if (config.pythonDir) {
      this.pythonDir = config.pythonDir;
    } else {
      this.pythonDir = path.join(__dirname, '../python');
      const fallback = path.join(__dirname, '../../python');
      if (!require('fs').existsSync(this.pythonDir) && require('fs').existsSync(fallback)) {
        this.pythonDir = fallback;
      }
    }
    
    console.log('[EdgeTTS] Strategy initialized:');
    console.log('[EdgeTTS]   pythonDir:', this.pythonDir);
    console.log('[EdgeTTS]   pythonPath:', this.pythonPath);
    console.log('[EdgeTTS]   cacheDir:', this.cacheDir);
  }

  getBackendName(): string {
    return 'edge-tts';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const pythonScript = path.join(this.pythonDir, 'tts_service.py');
      
      try {
        await fs.access(pythonScript);
      } catch {
        console.log('[EdgeTTS] Script not found at:', pythonScript);
        return false;
      }

      console.log('[EdgeTTS] Checking availability...');
      const result = await this.runPythonService('--info', { captureOutput: true, timeout: 5000 });
      
      const available = result.metadata && result.metadata.backend === 'edge-tts';
      console.log('[EdgeTTS] Available:', available);
      this._isAvailable = available;
      return available;
    } catch (error) {
      console.warn('[EdgeTTS] Check failed:', String(error));
      this._isAvailable = false;
      return false;
    }
  }

  async synthesize(text: string, lang?: string): Promise<SynthesisResult> {
    const language = lang || this.language;

    // Check cache
    const cacheKey = this.getCacheKey(text, language);
    const cached = await this.readCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Chunk and synthesize
    const chunks = this.chunkText(text);
    
    if (chunks.length === 1) {
      return this.synthesizeChunk(chunks[0], language, cacheKey);
    } else {
      return this.synthesizeMultiple(chunks, language, cacheKey);
    }
  }

  async getInfo(): Promise<Record<string, any>> {
    try {
      const result = await this.runPythonService('--info', { captureOutput: true, timeout: 5000 });
      return {
        backend: this.getBackendName(),
        available: this._isAvailable,
        metadata: result.metadata,
      };
    } catch (error) {
      return {
        backend: this.getBackendName(),
        available: false,
        error: String(error),
      };
    }
  }

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

      // Estimate duration if missing
      if (!result.metadata.duration || result.metadata.duration === 0) {
        result.metadata.duration = Math.max(0.1, result.audio.length / 16000);
        console.log('[EdgeTTS] Estimated duration:', result.metadata.duration);
      }

      // Cache result
      await this.writeCache(cacheKey, result.audio, result.metadata);
      return result;
    } catch (error) {
      throw new Error(`EdgeTTS synthesis failed: ${String(error)}`);
    }
  }

  private async synthesizeMultiple(
    chunks: string[],
    lang: string,
    cacheKey: string
  ): Promise<SynthesisResult> {
    const audioBuffers: Buffer[] = [];
    let totalDuration = 0;

    console.log('[EdgeTTS] Synthesizing', chunks.length, 'chunks');

    for (const chunk of chunks) {
      try {
        const result = await this.synthesizeChunk(chunk, lang, '');
        audioBuffers.push(result.audio);
        totalDuration += result.metadata.duration;
      } catch (error) {
        console.warn(`[EdgeTTS] Failed to synthesize chunk: ${String(error)}`);
      }
    }

    if (audioBuffers.length === 0) {
      throw new Error('No chunks synthesized successfully');
    }

    const audio = Buffer.concat(audioBuffers);
    const metadata = this.formatMetadata({
      sample_rate: 24000,
      size: audio.length,
      duration: totalDuration,
    });

    await this.writeCache(cacheKey, audio, metadata);
    return { audio, metadata };
  }

  private async runPythonService(
    args: string,
    options: { captureOutput: boolean; timeout: number }
  ): Promise<SynthesisResult> {
    return new Promise((resolve, reject) => {
      const pythonScript = path.join(this.pythonDir, 'tts_service.py');
      const spawnArgs = [pythonScript];
      
      // Parse arguments respecting quoted strings
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

      console.log('[EdgeTTS] Spawning Python:', this.pythonPath, spawnArgs);

      let pythonProcess: any;
      const timeout = setTimeout(() => {
        if (pythonProcess) {
          pythonProcess.kill('SIGTERM');
        }
        reject(new Error('EdgeTTS service timeout'));
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
          console.log('[EdgeTTS] Python stderr:', errorMsg);
          try {
            const error = JSON.parse(errorMsg);
            reject(new Error(error.error || 'Unknown error'));
          } catch {
            reject(new Error(`Python exited with code ${code}: ${errorMsg}`));
          }
          return;
        }

        const stderrStr = Buffer.concat(stderr).toString('utf-8').trim();
        let metadata: AudioMetadata;

        console.log('[EdgeTTS] Metadata:', stderrStr);

        try {
          metadata = JSON.parse(stderrStr);
        } catch (e) {
          reject(new Error('Failed to parse TTS metadata'));
          return;
        }

        const audio = Buffer.concat(stdout);
        console.log('[EdgeTTS] Audio size:', audio.length);
        resolve({ audio, metadata });
      });

      pythonProcess.on('error', (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private async readCache(key: string): Promise<SynthesisResult | null> {
    try {
      const audioPath = path.join(this.cacheDir, `${key}.mp3`);
      const metadataPath = path.join(this.cacheDir, `${key}.json`);

      const [audio, metadataStr] = await Promise.all([
        fs.readFile(audioPath),
        fs.readFile(metadataPath, 'utf-8'),
      ]);

      const metadata = JSON.parse(metadataStr);
      return { audio, metadata };
    } catch {
      return null;
    }
  }

  private async writeCache(key: string, audio: Buffer, metadata: AudioMetadata): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });

      const audioPath = path.join(this.cacheDir, `${key}.mp3`);
      const metadataPath = path.join(this.cacheDir, `${key}.json`);

      await Promise.all([
        fs.writeFile(audioPath, audio),
        fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2)),
      ]);
    } catch (error) {
      console.warn(`[EdgeTTS] Cache write failed: ${String(error)}`);
    }
  }

  async clearCache(): Promise<void> {
    try {
      const files = await fs.readdir(this.cacheDir);
      await Promise.all(
        files.map((file) => fs.unlink(path.join(this.cacheDir, file)))
      );
    } catch (error) {
      console.warn(`[EdgeTTS] Cache clear failed: ${String(error)}`);
    }
  }

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
