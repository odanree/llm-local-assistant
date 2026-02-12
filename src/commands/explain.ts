/**
 * Explain Command with Optional Voice Narration
 * 
 * Generates code explanation with optional audio narration
 */

import * as vscode from 'vscode';
import { getTTSService } from '../services/ttsService';
import { TTSSettings, DEFAULT_TTS_SETTINGS } from '../types/tts';

/**
 * Handle /explain command
 */
export async function handleExplain(
  llm: any, // LLM provider instance
  code: string,
  context?: { file?: string; range?: vscode.Range }
): Promise<void> {
  const config = vscode.workspace.getConfiguration('llm-assistant');
  const ttsSettings = getTTSSettings(config);

  try {
    // Generate explanation from LLM
    const explanation = await generateExplanation(llm, code, context);

    // Show explanation in webview
    const panel = vscode.window.createWebviewPanel(
      'llm-explanation',
      'Code Explanation',
      vscode.ViewColumn.Two,
      { enableScripts: true }
    );

    // If TTS is enabled, synthesize audio
    let audioData: { buffer: Buffer; metadata: any } | null = null;
    if (ttsSettings.enabled) {
      try {
        audioData = await synthesizeExplanation(explanation, ttsSettings);
      } catch (error) {
        // Log but don't fail - explanation still available as text
        console.warn(`Voice narration failed: ${String(error)}`);
      }
    }

    // Render webview with explanation ± audio
    panel.webview.html = renderExplanationPanel(
      explanation,
      audioData,
      ttsSettings
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Explanation failed: ${String(error)}`);
  }
}

/**
 * Generate code explanation using LLM
 */
async function generateExplanation(
  llm: any,
  code: string,
  context?: { file?: string; range?: vscode.Range }
): Promise<string> {
  const prompt = `Explain this code clearly and concisely:

\`\`\`
${code}
\`\`\`

Focus on:
1. What the code does
2. Key concepts
3. Important patterns
4. Potential issues`;

  // Call LLM provider (implementation depends on provider)
  const explanation = await llm.generate(prompt);
  return explanation;
}

/**
 * Synthesize explanation to audio
 */
async function synthesizeExplanation(
  explanation: string,
  settings: TTSSettings
): Promise<{ buffer: Buffer; metadata: any }> {
  const ttsService = getTTSService({
    language: settings.language,
    maxChunkLength: settings.maxChunkLength,
  });

  // Check if TTS is available (Python + model installed)
  const available = await ttsService.isAvailable();
  if (!available) {
    throw new Error('Voice narration not set up. Run /setup-voice to enable.');
  }

  // Synthesize text
  const result = await ttsService.synthesize(explanation, settings.language);
  return { buffer: result.audio, metadata: result.metadata };
}

/**
 * Get TTS settings from VS Code config
 */
function getTTSSettings(config: vscode.WorkspaceConfiguration): TTSSettings {
  return {
    enabled: config.get('voice.enabled', DEFAULT_TTS_SETTINGS.enabled),
    speed: config.get('voice.speed', DEFAULT_TTS_SETTINGS.speed),
    language: config.get('voice.language', DEFAULT_TTS_SETTINGS.language) as
      | 'en'
      | 'zh',
    maxChunkLength: config.get(
      'voice.maxChunkLength',
      DEFAULT_TTS_SETTINGS.maxChunkLength
    ),
    cacheEnabled: config.get(
      'voice.cacheEnabled',
      DEFAULT_TTS_SETTINGS.cacheEnabled
    ),
  };
}

/**
 * Render webview panel with explanation + audio player
 */
function renderExplanationPanel(
  explanation: string,
  audioData: { buffer: Buffer; metadata: any } | null,
  settings: TTSSettings
): string {
  const audioHtml = audioData
    ? `
    <div class="audio-player">
      <h3>🎧 Narration</h3>
      <audio controls style="width: 100%;">
        <source 
          src="data:audio/wav;base64,${audioData.buffer.toString('base64')}"
          type="audio/wav"
        />
        Your browser does not support audio playback.
      </audio>
      <div class="audio-info">
        Duration: ${audioData.metadata.duration.toFixed(1)}s | 
        Sample Rate: ${audioData.metadata.sample_rate} Hz
      </div>
    </div>
    `
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Code Explanation</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding: 20px;
          line-height: 1.6;
          color: var(--vscode-foreground);
          background-color: var(--vscode-editor-background);
        }
        h2 {
          color: var(--vscode-symbolIcon-textForeground);
          margin-top: 0;
        }
        h3 {
          color: var(--vscode-symbolIcon-methodForeground);
          margin-top: 24px;
          margin-bottom: 12px;
        }
        .explanation {
          background-color: var(--vscode-editor-background);
          padding: 12px;
          border-left: 3px solid var(--vscode-symbolIcon-textForeground);
          margin: 12px 0;
          border-radius: 4px;
        }
        .audio-player {
          background-color: var(--vscode-textBlockQuote-background);
          padding: 16px;
          border-radius: 4px;
          margin: 16px 0;
        }
        .audio-info {
          font-size: 12px;
          color: var(--vscode-descriptionForeground);
          margin-top: 8px;
        }
        audio {
          border-radius: 4px;
        }
      </style>
    </head>
    <body>
      <h2>📝 Code Explanation</h2>
      
      ${audioHtml}
      
      <div class="explanation">
        <h3>Explanation</h3>
        <div>${escapeHtml(explanation).replace(/\n/g, '<br>')}</div>
      </div>
      
      <div style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 32px;">
        Generated with LLM Local Assistant v2.6
        ${audioData ? ' • Voice narration powered by ChatTTS' : ''}
      </div>
    </body>
    </html>
  `;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
