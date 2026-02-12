/**
 * Chatterbox TTS Strategy (Stub)
 * 
 * Future implementation for Chatterbox TTS backend.
 * 
 * To implement:
 * 1. Install: pip install chatterbox
 * 2. Load model
 * 3. Synthesize and return MP3
 * 
 * Example usage:
 *   const chatterbox = new ChatterboxStrategy({ language: 'en' });
 *   await chatterbox.isAvailable(); // true if model loaded
 *   const result = await chatterbox.synthesize('Hello world');
 *   // result.audio is MP3 buffer
 */

import {
  BaseTTSStrategy,
  ITTSStrategy,
  SynthesisResult,
  TTSStrategyConfig,
  AudioMetadata,
} from './ttsStrategy';

export interface ChatterboxConfig extends TTSStrategyConfig {
  modelPath?: string;
  gpu?: boolean;
}

export class ChatterboxStrategy extends BaseTTSStrategy implements ITTSStrategy {
  private modelPath: string;
  private gpu: boolean;

  constructor(config: ChatterboxConfig = {}) {
    super(config);
    this.modelPath = config.modelPath || './models/chatterbox';
    this.gpu = config.gpu ?? false;
    
    console.log('[Chatterbox] Strategy stub initialized (not yet implemented)');
  }

  getBackendName(): string {
    return 'chatterbox';
  }

  async isAvailable(): Promise<boolean> {
    // TODO: Check if chatterbox is installed and model is available
    console.log('[Chatterbox] isAvailable() - NOT YET IMPLEMENTED');
    return false;
  }

  async synthesize(text: string, lang?: string): Promise<SynthesisResult> {
    throw new Error('[Chatterbox] synthesize() - NOT YET IMPLEMENTED');
    // TODO: Implement Chatterbox synthesis
    // 1. Load model if not loaded
    // 2. Synthesize text
    // 3. Convert to MP3
    // 4. Return buffer + metadata
  }

  async getInfo(): Promise<Record<string, any>> {
    return {
      backend: this.getBackendName(),
      available: false,
      status: 'Not implemented',
      note: 'Chatterbox strategy is a planned feature. Use EdgeTTS for now.',
    };
  }
}
