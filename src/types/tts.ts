/**
 * TTS Type Definitions
 * 
 * Shared types for TTS integration across extension
 */

/**
 * Audio data returned by TTS service
 */
export interface TTSAudio {
  buffer: Uint8Array;
  sampleRate: number;
  duration: number;
}

/**
 * Settings for TTS feature
 */
export interface TTSSettings {
  enabled: boolean;
  speed: number; // 0.5 to 2.0
  language: 'en' | 'zh';
  maxChunkLength: number; // chars
  cacheEnabled: boolean;
}

/**
 * Default TTS settings
 */
export const DEFAULT_TTS_SETTINGS: TTSSettings = {
  enabled: true,
  speed: 1.0,
  language: 'en',
  maxChunkLength: 500,
  cacheEnabled: true,
};

/**
 * TTS state in extension
 */
export interface TTSState {
  initialized: boolean;
  available: boolean;
  isSetup: boolean; // Has user run /setup-voice?
  setupError?: string;
  lastError?: string;
}

/**
 * TTS command results
 */
export interface TTSCommandResult {
  success: boolean;
  message: string;
  error?: string;
  duration?: number; // synthesis time
}
