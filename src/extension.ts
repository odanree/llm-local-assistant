/**
 * Extension Main Entry Point
 * 
 * Initializes:
 * - LLM provider connection
 * - Voice narration service
 * - Command registration
 * - Configuration loading
 */

import * as vscode from 'vscode';
import { registerVoiceCommands, getVoiceSettings } from './commands/voiceCommands';
import { getTTSService } from './services/ttsService';

let extensionContext: vscode.ExtensionContext;

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  extensionContext = context;

  console.log('[LLM Assistant] Activating v2.6.0 with voice narration');

  // Register voice commands
  registerVoiceCommands(context);

  // Initialize TTS service (lazy loading)
  const ttsService = getTTSService({
    language: getVoiceSettings().language,
    maxChunkLength: getVoiceSettings().maxChunkLength,
  });

  // Check if voice is available
  checkVoiceAvailability();

  // Register explain command (with voice support)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'llm-assistant.explain',
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showErrorMessage('No active editor');
          return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
          vscode.window.showErrorMessage('Please select code to explain');
          return;
        }

        const code = editor.document.getText(selection);
        const fileName = editor.document.fileName.split('/').pop();

        // Show loading message
        vscode.window.showInformationMessage('Generating explanation...');

        try {
          await handleExplain(code, fileName);
        } catch (error) {
          vscode.window.showErrorMessage(
            `Explanation failed: ${String(error)}`
          );
        }
      }
    )
  );

  // Register voice settings command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'llm-assistant.voice-settings',
      async () => {
        const { showVoiceSettingsQuickPick } = await import(
          './commands/voiceCommands'
        );
        showVoiceSettingsQuickPick();
      }
    )
  );

  // Show activation message
  const message = '✅ LLM Local Assistant v2.6.0 ready';
  console.log(`[LLM Assistant] ${message}`);

  vscode.window.showInformationMessage(
    `${message}\n\nUse "LLM: Explain Code" or Cmd+Shift+E to get started.`
  );
}

/**
 * Check if voice narration is available
 */
async function checkVoiceAvailability(): Promise<void> {
  const settings = getVoiceSettings();
  
  if (!settings.enabled) {
    console.log('[LLM Assistant] Voice narration is disabled');
    return;
  }

  try {
    const ttsService = getTTSService();
    const available = await ttsService.isAvailable();

    if (available) {
      console.log('[LLM Assistant] Voice narration is available');
    } else {
      console.log('[LLM Assistant] Voice narration is not set up');
      
      // Offer to set up
      const action = await vscode.window.showWarningMessage(
        'Voice narration requires Python. Set it up now?',
        'Setup',
        'Later'
      );

      if (action === 'Setup') {
        vscode.commands.executeCommand('llm-assistant.setup-voice');
      }
    }
  } catch (error) {
    console.warn('[LLM Assistant] Error checking voice availability:', error);
  }
}

/**
 * Handle explain command
 */
async function handleExplain(code: string, fileName?: string): Promise<void> {
  const settings = getVoiceSettings();

  // Create webview panel
  const panel = vscode.window.createWebviewPanel(
    'llm-explanation',
    `Explanation: ${fileName || 'Code'}`,
    vscode.ViewColumn.Two,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  // Generate explanation (mock - integrate with your LLM provider)
  const explanation = await generateExplanation(code);

  // Optional: Generate audio
  let audioBuffer: Uint8Array | undefined;
  let audioMetadata: any = undefined;

  if (settings.enabled) {
    try {
      const ttsService = getTTSService({
        language: settings.language,
        maxChunkLength: settings.maxChunkLength,
      });

      const available = await ttsService.isAvailable();
      if (available) {
        const result = await ttsService.synthesize(
          explanation,
          settings.language
        );
        audioBuffer = new Uint8Array(result.audio);
        audioMetadata = {
          sampleRate: result.metadata.sample_rate,
          duration: result.metadata.duration,
        };
      }
    } catch (error) {
      console.warn('Voice narration failed:', error);
      // Continue without audio
    }
  }

  // Render webview with explanation + audio
  panel.webview.html = getExplanationHTML(
    explanation,
    audioBuffer,
    audioMetadata,
    code
  );
}

/**
 * Generate explanation (mock - integrate with your LLM)
 */
async function generateExplanation(code: string): Promise<string> {
  // TODO: Integrate with your LLM provider
  // This is a placeholder
  return `This code performs the following:

1. **Main Purpose**: The code section you provided handles [specific functionality]

2. **Key Components**:
   - Component 1: Handles [what it does]
   - Component 2: Manages [what it manages]
   - Component 3: Controls [what it controls]

3. **How It Works**:
   - First step: [description]
   - Second step: [description]
   - Third step: [description]

4. **Important Notes**:
   - Note 1: [relevant point]
   - Note 2: [relevant point]

5. **Performance Considerations**:
   - Optimization 1: [description]
   - Optimization 2: [description]`;
}

/**
 * Render explanation webview HTML
 */
function getExplanationHTML(
  explanation: string,
  audioBuffer?: Uint8Array,
  audioMetadata?: any,
  code?: string
): string {
  const audioSection = audioBuffer
    ? `
    <div style="background: #f0f0f0; padding: 12px; border-radius: 4px; margin: 16px 0;">
      <h3>🎧 Voice Narration</h3>
      <audio controls style="width: 100%;">
        <source src="data:audio/wav;base64,${bufferToBase64(audioBuffer)}" type="audio/wav">
        Your browser does not support audio playback.
      </audio>
      <p style="font-size: 12px; color: #666; margin: 8px 0 0 0;">
        Duration: ${audioMetadata.duration.toFixed(1)}s
      </p>
    </div>
    `
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          padding: 20px;
          line-height: 1.6;
        }
        h2 { color: #0066cc; margin-top: 0; }
        h3 { color: #333; }
        pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; }
        code { font-family: 'Monaco', 'Menlo', monospace; }
      </style>
    </head>
    <body>
      <h2>📝 Code Explanation</h2>
      
      ${audioSection}
      
      <div style="background: #fff9f0; padding: 12px; border-left: 3px solid #0066cc; margin: 16px 0;">
        ${explanation.replace(/\n/g, '<br>')}
      </div>
      
      ${code ? `<details style="margin-top: 24px;">
        <summary style="cursor: pointer; font-weight: 500;">📄 View Code</summary>
        <pre><code>${escapeHtml(code)}</code></pre>
      </details>` : ''}
      
      <p style="font-size: 12px; color: #999; margin-top: 32px;">
        Generated by LLM Local Assistant v2.6.0
        ${audioBuffer ? ' • Voice narration powered by ChatTTS' : ''}
      </p>
    </body>
    </html>
  `;
}

/**
 * Convert Uint8Array to base64
 */
function bufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

/**
 * Escape HTML
 */
function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
  console.log('[LLM Assistant] Deactivating');
}
