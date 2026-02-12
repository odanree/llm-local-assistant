/**
 * TTS Service Factory
 * 
 * Manages TTS strategy selection and instantiation.
 * Allows swapping between different TTS backends without changing extension code.
 * 
 * Example: Switch from edge-tts to chatterbox:
 *   getTTSService({ strategy: 'chatterbox' })
 */

import { ITTSStrategy, TTSStrategyConfig } from './ttsStrategy';
import { EdgeTTSStrategy, EdgeTTSConfig } from './edgeTtsStrategy';
import { ChatterboxStrategy, ChatterboxConfig } from './chatterboxStrategy';

export type TTSStrategy = 'edge-tts' | 'chatterbox';

/**
 * Extended config with strategy selection
 */
export interface TTSServiceConfig extends TTSStrategyConfig {
  strategy?: TTSStrategy;
  pythonPath?: string;
  pythonDir?: string;
  modelPath?: string;
  gpu?: boolean;
}

/**
 * TTS Service Factory - creates and manages TTS strategy instances
 */
export class TTSServiceFactory {
  private static instance: ITTSStrategy | null = null;
  private static currentStrategy: TTSStrategy = 'edge-tts';

  /**
   * Create or retrieve TTS strategy instance
   * 
   * @param config Configuration including strategy selection
   * @returns TTS strategy instance
   * 
   * @example
   * // Use default EdgeTTS
   * const tts = TTSServiceFactory.create();
   * 
   * // Use EdgeTTS with custom config
   * const tts = TTSServiceFactory.create({ 
   *   language: 'zh',
   *   pythonPath: '/usr/bin/python3'
   * });
   * 
   * // Switch to Chatterbox strategy
   * const tts = TTSServiceFactory.create({ 
   *   strategy: 'chatterbox',
   *   gpu: true
   * });
   */
  static create(config: TTSServiceConfig = {}): ITTSStrategy {
    const strategy = config.strategy || 'edge-tts';

    // If switching strategies, reset instance
    if (strategy !== this.currentStrategy) {
      console.log(`[TTSFactory] Switching strategy: ${this.currentStrategy} -> ${strategy}`);
      this.instance = null;
      this.currentStrategy = strategy;
    }

    // Create new instance if not cached
    if (!this.instance) {
      this.instance = this.createStrategy(strategy, config);
    }

    return this.instance;
  }

  /**
   * Create a new strategy instance without caching
   * Useful for testing or running multiple strategies in parallel
   */
  static createNew(config: TTSServiceConfig = {}): ITTSStrategy {
    const strategy = config.strategy || 'edge-tts';
    return this.createStrategy(strategy, config);
  }

  /**
   * Get current strategy instance
   */
  static getInstance(): ITTSStrategy | null {
    return this.instance;
  }

  /**
   * Get current strategy name
   */
  static getCurrentStrategy(): TTSStrategy {
    return this.currentStrategy;
  }

  /**
   * Reset factory (clears cached instance)
   */
  static reset(): void {
    console.log('[TTSFactory] Resetting factory');
    this.instance = null;
    this.currentStrategy = 'edge-tts';
  }

  /**
   * Internal: Create strategy based on type
   */
  private static createStrategy(strategy: TTSStrategy, config: TTSServiceConfig): ITTSStrategy {
    console.log(`[TTSFactory] Creating ${strategy} strategy`);

    switch (strategy) {
      case 'edge-tts':
        return new EdgeTTSStrategy(config as EdgeTTSConfig);

      case 'chatterbox':
        return new ChatterboxStrategy(config as ChatterboxConfig);

      default:
        throw new Error(`Unknown TTS strategy: ${strategy}`);
    }
  }

  /**
   * Get list of available strategies (for UI/diagnostics)
   */
  static getAvailableStrategies(): Array<{
    name: TTSStrategy;
    description: string;
    status: 'stable' | 'experimental' | 'planned';
  }> {
    return [
      {
        name: 'edge-tts',
        description: 'Microsoft Edge cloud TTS (free, no API keys)',
        status: 'stable',
      },
      {
        name: 'chatterbox',
        description: 'Local Chatterbox TTS (planned)',
        status: 'planned',
      },
    ];
  }
}

/**
 * Backward compatibility wrapper
 * Maps old getTTSService() calls to new factory
 */
export interface TTSConfig extends TTSServiceConfig {
  pythonPath?: string;
  pythonDir?: string;
  cacheDir?: string;
  maxChunkLength?: number;
  language?: string;
  timeout?: number;
}

let legacyInstance: ITTSStrategy | null = null;

/**
 * Legacy getTTSService() function for backward compatibility
 * 
 * @deprecated Use TTSServiceFactory.create() instead
 * @example
 * const tts = getTTSService();
 * const result = await tts.synthesize('hello');
 */
export function getTTSService(config?: TTSConfig): ITTSStrategy {
  // If config specifies strategy, use factory
  if (config?.strategy) {
    return TTSServiceFactory.create(config);
  }

  // For backward compatibility, use cached instance
  if (!legacyInstance) {
    legacyInstance = TTSServiceFactory.create(config);
  }
  return legacyInstance;
}

/**
 * Re-export for convenience
 */
export { EdgeTTSStrategy } from './edgeTtsStrategy';
export { ChatterboxStrategy } from './chatterboxStrategy';
export type { ITTSStrategy, AudioMetadata, SynthesisResult } from './ttsStrategy';
