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
import { LLMClient, LLMConfig } from './llmClient';

let extensionContext: vscode.ExtensionContext;
let llmClient: LLMClient;
let chatPanel: vscode.WebviewPanel | undefined;
let messageHandlerAttached = false;
let chatHistory: Array<{ content: string; type?: string; role?: string }> = [];
let helpShown = false;

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  extensionContext = context;

  console.log('[LLM Assistant] Activating v2.6.0 with voice narration');

  // Initialize LLM client
  llmClient = new LLMClient(getLLMConfig());

  // Register voice commands
  registerVoiceCommands(context);

  // Initialize TTS service (lazy loading)
  const ttsService = getTTSService({
    extensionPath: context.extensionPath,
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

  // Register chat command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'llm-assistant.open-chat',
      async () => {
        openLLMChat(context);
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

  // Register narrate message command (for chat window)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'llm-assistant.narrate-message',
      async (text: string) => {
        try {
          await narrateText(text);
        } catch (error) {
          vscode.window.showErrorMessage(
            `Narration failed: ${String(error)}`
          );
        }
      }
    )
  );

  // Register test connection command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'llm-assistant.test-connection',
      async () => {
        try {
          const config = getLLMConfig();
          vscode.window.showInformationMessage('Testing LLM connection...');
          
          const isHealthy = await llmClient.isServerHealthy();
          if (isHealthy) {
            vscode.window.showInformationMessage(
              `✅ LLM Server is running at ${config.endpoint}\nModel: ${config.model}`
            );
          } else {
            vscode.window.showErrorMessage(
              `❌ Cannot connect to LLM server at ${config.endpoint}\n\nMake sure Ollama is running and the model is loaded.`
            );
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Connection test failed: ${String(error)}`
          );
        }
      }
    )
  );

  // Register debug environment command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'llm-assistant.debug-environment',
      async () => {
        const config = getLLMConfig();
        const voiceSettings = getVoiceSettings();
        const ttsService = getTTSService();
        const ttsAvailable = await ttsService.isAvailable();
        
        const debugInfo = `
🔍 **Debug Information:**

**LLM Configuration:**
- Endpoint: ${config.endpoint}
- Model: ${config.model}
- Temperature: ${config.temperature}
- Timeout: ${config.timeout}ms

**Voice Settings:**
- Enabled: ${voiceSettings.enabled}
- Language: ${voiceSettings.language}
- Speed: ${voiceSettings.speed}
- Cache: ${voiceSettings.cacheEnabled}
- TTS Available: ${ttsAvailable}

**Workspace:**
- Root: ${vscode.workspace.workspaceFolders?.[0]?.fsPath || 'None'}
`;

        // Show in output channel
        const outputChannel = vscode.window.createOutputChannel('LLM Assistant Debug');
        outputChannel.append(debugInfo);
        outputChannel.show();
        
        vscode.window.showInformationMessage('Debug information opened in output panel');
      }
    )
  );

  // Show activation message
  const message = '✅ LLM Local Assistant v2.6.1 ready';
  console.log(`[LLM Assistant] ${message}`);

  vscode.window.showInformationMessage(
    `${message}\n\nUse "LLM: Explain Code" or Cmd+Shift+E to get started.`
  );
}

/**
 * Narrate text using TTS service (for chat messages)
 */
async function narrateText(text: string): Promise<void> {
  const settings = getVoiceSettings();
  
  if (!settings.enabled) {
    vscode.window.showWarningMessage('Voice narration is disabled. Enable it in settings.');
    return;
  }

  try {
    const ttsService = getTTSService({
      language: settings.language,
      maxChunkLength: settings.maxChunkLength,
    });

    const available = await ttsService.isAvailable();
    if (!available) {
      vscode.window.showWarningMessage('TTS service is not available.');
      return;
    }

    // Strip markdown from text for clean narration
    const cleanText = stripMarkdown(text);
    console.log('[Narration] Synthesizing:', cleanText.substring(0, 50) + '...');

    const result = await ttsService.synthesize(
      cleanText,
      settings.language
    );

    // Play audio in a simple notification webview
    await playAudioNotification(result.audio, result.metadata);
  } catch (error) {
    console.error('[Narration] Error:', error);
    throw error;
  }
}

/**
 * Play audio in a notification webview
 */
async function playAudioNotification(audio: Buffer, metadata: any): Promise<void> {
  const audioBase64 = Buffer.from(audio).toString('base64');
  
  const panel = vscode.window.createWebviewPanel(
    'audio-player',
    '🎧 Voice Narration',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
    }
  );

  panel.webview.html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          padding: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: #f5f5f5;
        }
        .player {
          background: white;
          padding: 24px;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          width: 100%;
          max-width: 400px;
        }
        h2 { margin: 0 0 16px 0; color: #333; }
        audio { width: 100%; margin: 16px 0; }
        .info { font-size: 12px; color: #666; margin-top: 8px; }
      </style>
    </head>
    <body>
      <div class="player">
        <h2>🎧 Voice Narration</h2>
        <audio controls autoplay>
          <source src="data:audio/mpeg;base64,${audioBase64}" type="audio/mpeg">
          Your browser does not support audio playback.
        </audio>
        <div class="info">
          Duration: ${metadata.duration.toFixed(1)}s
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Post message to chat panel
 */
function postChatMessage(message: any): void {
  if (chatPanel) {
    chatPanel.webview.postMessage(message);
    
    // Store message in history (unless skipHistory is set)
    if ((message.text || message.error) && !message.skipHistory) {
      chatHistory.push({
        content: message.text || message.error,
        type: message.type || 'message',
        role: message.role,
      });
    }
  }
}

/**
 * Open LLM chat panel
 */
function openLLMChat(context: vscode.ExtensionContext): void {
  console.log('[openChat] Starting chat panel...');
  
  if (chatPanel) {
    console.log('[openChat] Chat panel already exists, revealing...');
    chatPanel.reveal(vscode.ViewColumn.Two);
    return;
  }

  console.log('[openChat] Creating new webview panel');

  const { getWebviewContent } = require('./webviewContent');

  // Create webview panel
  chatPanel = vscode.window.createWebviewPanel(
    'llmChat',
    'LLM Assistant',
    vscode.ViewColumn.Two,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  console.log('[openChat] ✓ Webview panel created successfully');

  // Set the webview's initial html content
  chatPanel.webview.html = getWebviewContent();

  // Show help text on first open
  setTimeout(() => {
    if (!helpShown) {
      chatPanel?.webview.postMessage({
        command: 'addMessage',
        text: `**LLM Local Assistant v2.6.1**\n\n` +
          `🎯 **Voice Narration Features:**\n` +
          `- Use \`/explain <filepath>\` to generate code explanations with voice\n` +
          `- Or use Cmd+Shift+E on selected code for quick explanations\n` +
          `- Configure language and voice settings\n\n` +
          `💬 **Chat Commands:** (new in 2.6.1)\n` +
          `- \`/explain <filepath>\` - Explain entire file with voice narration\n` +
          `- Just type questions and press Enter for normal chat\n` +
          `- Click "🎧 Narrate" button on any response to hear it\n\n` +
          `📋 **Available Commands (2.5.0):**\n` +
          `- \`/plan\` - Create execution plan\n` +
          `- \`/execute\` - Execute plan step\n` +
          `- \`/approve\` - Approve changes\n` +
          `- \`/reject\` - Reject changes\n` +
          `- \`/refactor\` - Refactor code\n` +
          `- \`/extract-service\` - Extract service\n` +
          `- \`/design-system\` - Design system\n` +
          `- \`/rate-architecture\` - Rate architecture\n` +
          `- \`/suggest-patterns\` - Suggest patterns\n` +
          `- \`/context\` - Add context\n` +
          `- \`/check-model\` - Check model\n` +
          `- \`/read\` - Read files\n\n` +
          `⚙️ **Configure:**\n` +
          `- Voice settings: Search "LLM: Voice Settings" in command palette\n` +
          `- Model and endpoint: Settings → LLM Assistant\n`,
        type: 'info',
        success: true,
        skipHistory: true,
      });
      helpShown = true;
    }

    // Restore chat history
    for (const msg of chatHistory) {
      chatPanel?.webview.postMessage({
        command: 'addMessage',
        text: msg.content,
        type: msg.type || 'message',
        role: msg.role,
      });
    }
  }, 500);

  // Handle webview messages - ONLY ATTACH ONCE
  if (!messageHandlerAttached && chatPanel) {
    chatPanel.webview.onDidReceiveMessage(async (message) => {
      console.log('[LLM Assistant] Received message from webview:', message);
      try {
        if (message.command === 'sendMessage') {
          const text: string = message.text || '';
          console.log('[LLM Assistant] Processing message:', text);

          // Check for /explain command
          const explainMatch = text.match(/^\/explain\s+(.+)$/);
          if (explainMatch) {
            const filePath = explainMatch[1].trim();
            console.log('[LLM Assistant] Processing /explain command for:', filePath);
            
            postChatMessage({
              command: 'addMessage',
              text: `📝 Generating explanation for \`${filePath}\`...`,
              type: 'info',
            });

            try {
              const fs = require('fs').promises;
              const path = require('path');
              
              // Resolve file path relative to workspace root
              const workspaceFolders = vscode.workspace.workspaceFolders;
              if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('No workspace folder open');
              }
              
              const workspaceFolder = workspaceFolders[0];
              const workspaceRoot = workspaceFolder.uri.fsPath;
              
              if (!workspaceRoot) {
                throw new Error('Workspace root is undefined');
              }
              
              const resolvedPath = path.isAbsolute(filePath) 
                ? filePath 
                : path.join(workspaceRoot, filePath);
              
              console.log('[LLM Assistant] Workspace root:', workspaceRoot);
              console.log('[LLM Assistant] File path:', filePath);
              console.log('[LLM Assistant] Resolved path:', resolvedPath);
              
              const fileContent = await fs.readFile(resolvedPath, 'utf-8');
              const fileName = filePath.split('/').pop();
              
              // Generate explanation using LLM
              const explanation = await generateExplanation(fileContent);
              
              // Try to synthesize audio if voice is enabled
              const settings = getVoiceSettings();
              let audioBase64: string | undefined;
              let audioMetadata: any;
              
              if (settings.enabled) {
                try {
                  const ttsService = getTTSService({
                    language: settings.language,
                    maxChunkLength: settings.maxChunkLength,
                  });
                  const available = await ttsService.isAvailable();
                  if (available) {
                    console.log('[LLM Assistant] Voice synthesis enabled for /explain response');
                    const cleanText = stripMarkdown(explanation);
                    const result = await ttsService.synthesize(cleanText, settings.language);
                    // Convert audio buffer to base64 for embedding in webview
                    audioBase64 = Buffer.from(result.audio).toString('base64');
                    audioMetadata = result.metadata;
                    console.log('[LLM Assistant] Voice synthesis complete for /explain');
                    console.log('[LLM Assistant] Audio base64 length:', audioBase64.length);
                    console.log('[LLM Assistant] Audio metadata:', audioMetadata);
                  }
                } catch (synthError) {
                  console.warn('[LLM Assistant] Voice synthesis in chat failed:', synthError);
                  // Continue without audio - narration button will still be available
                }
              }
              
              // Add explanation to chat with optional embedded audio player
              postChatMessage({
                command: 'addMessage',
                text: explanation,
                success: true,
                audioBase64: audioBase64,
                audioMetadata: audioMetadata,
              });
            } catch (err) {
              postChatMessage({
                command: 'addMessage',
                error: `Error reading file: ${err instanceof Error ? err.message : String(err)}`,
                success: false,
              });
            }
            return;
          }

          // Check for /check-model command
          const checkModelMatch = text.match(/^\/check-model\s*$/);
          if (checkModelMatch) {
            postChatMessage({
              command: 'addMessage',
              text: '🔍 Checking model...',
              type: 'info',
            });

            try {
              const modelInfo = await llmClient.getModelInfo();
              
              if (modelInfo.error) {
                postChatMessage({
                  command: 'addMessage',
                  text: `⚠️ **Model Check**\n\n**Configured Model:** ${modelInfo.configuredModel}\n**Endpoint:** ${modelInfo.endpoint}\n\n**Error:** ${modelInfo.error}`,
                  success: true,
                });
              } else {
                const availableList = modelInfo.availableModels.length > 0 
                  ? modelInfo.availableModels.map((m) => `- ${m}`).join('\n')
                  : 'No models available';
                
                postChatMessage({
                  command: 'addMessage',
                  text: `✅ **Model Check**\n\n**Configured Model:** ${modelInfo.configuredModel}\n**Endpoint:** ${modelInfo.endpoint}\n\n**Available Models:**\n${availableList}`,
                  success: true,
                });
              }
            } catch (err) {
              postChatMessage({
                command: 'addMessage',
                error: `Error checking model: ${err instanceof Error ? err.message : String(err)}`,
                success: false,
              });
            }
            return;
          }

          // Normal chat message
          postChatMessage({
            command: 'addMessage',
            text: '⟳ Generating response...',
            type: 'info',
          });

          try {
            const response = await llmClient.sendMessage(text);
            if (response.success && response.message) {
              postChatMessage({
                command: 'addMessage',
                text: response.message,
                success: true,
              });
            } else {
              postChatMessage({
                command: 'addMessage',
                error: response.error || 'Unknown error',
                success: false,
              });
            }
          } catch (err) {
            postChatMessage({
              command: 'addMessage',
              error: `Error: ${err instanceof Error ? err.message : String(err)}`,
              success: false,
            });
          }
        } else if (message.command === 'narrate') {
          try {
            await narrateText(message.text);
          } catch (error) {
            vscode.window.showErrorMessage(`Narration failed: ${String(error)}`);
          }
        } else if (message.command === 'clearChat') {
          chatHistory = [];
          console.log('[LLM Assistant] Chat cleared');
        }
      } catch (err) {
        console.error('[LLM Assistant] Error handling message:', err);
      }
    });
    messageHandlerAttached = true;
  }

  // Clean up on panel close
  chatPanel.onDidDispose(() => {
    chatPanel = undefined;
    messageHandlerAttached = false;
  });
}

/**
 * Get LLM configuration
 */
function getLLMConfig(): LLMConfig {
  const config = vscode.workspace.getConfiguration('llm-assistant');
  return {
    endpoint: config.get('endpoint', 'http://localhost:11434'),
    model: config.get('model', 'mistral'),
    temperature: config.get('temperature', 0.7),
    timeout: config.get('timeout', 30000),
  };
}

/**
 * Handle explain command
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
      console.log('[LLM Assistant] Voice narration is not set up - synthesis test failed');
      console.log('[LLM Assistant] This is normal on CPU-only systems. Voice disabled.');
    }
  } catch (error) {
    console.warn('[LLM Assistant] Voice narration check failed (expected on CPU):', error);
  }
}

/**
 * Strip markdown formatting from text for clean narration
 */
function stripMarkdown(text: string): string {
  // Remove code blocks (```...```)
  text = text.replace(/```[\s\S]*?```/g, '');
  
  // Remove inline code (`...`)
  text = text.replace(/`([^`]+)`/g, '$1');
  
  // Remove bold (**text** or __text__)
  text = text.replace(/\*\*(.*?)\*\*/g, '$1');
  text = text.replace(/__(.+?)__/g, '$1');
  
  // Remove italic (*text* or _text_)
  text = text.replace(/\*(.*?)\*/g, '$1');
  text = text.replace(/_(.*?)_/g, '$1');
  
  // Remove links [text](url)
  text = text.replace(/\[(.*?)\]\((.*?)\)/g, '$1');
  
  // Remove headers (#, ##, ###, etc.)
  text = text.replace(/^#+\s+/gm, '');
  
  // Remove list markers (-, *, +)
  text = text.replace(/^[\s]*[\-\*\+]\s+/gm, '');
  
  // Remove extra whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

/**
 * Handle explain command
 */
async function handleExplain(code: string, fileName?: string): Promise<void> {
  const settings = getVoiceSettings();
  console.log('[LLM Assistant] handleExplain: voice.enabled =', settings.enabled);

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

  // Generate explanation from LLM
  const explanation = await generateExplanation(code);

  // Optional: Generate audio (skip if voice not available on CPU)
  let audioBuffer: Uint8Array | undefined;
  let audioMetadata: any = undefined;

  if (settings.enabled) {
    try {
      console.log('[LLM Assistant] Voice enabled, initializing TTS...');
      const ttsService = getTTSService({
        language: settings.language,
        maxChunkLength: settings.maxChunkLength,
      });

      console.log('[LLM Assistant] Checking TTS availability...');
      const available = await ttsService.isAvailable();
      console.log('[LLM Assistant] TTS available:', available);

      if (available) {
        try {
          console.log('[LLM Assistant] Synthesizing audio...');
          // Strip markdown from explanation for clean narration
          const cleanText = stripMarkdown(explanation);
          console.log('[LLM Assistant] Synthesizing:', cleanText.substring(0, 50) + '...');
          
          const result = await ttsService.synthesize(
            cleanText,
            settings.language
          );
          audioBuffer = new Uint8Array(result.audio);
          audioMetadata = {
            sampleRate: result.metadata.sample_rate,
            duration: result.metadata.duration,
          };
          console.log('[LLM Assistant] Audio synthesis successful');
        } catch (synthError) {
          console.warn('[LLM Assistant] Voice synthesis failed:', synthError);
          // Continue without audio
        }
      } else {
        console.log('[LLM Assistant] TTS not available');
      }
    } catch (error) {
      console.warn('[LLM Assistant] Voice initialization error:', error);
      // Continue without audio
    }
  } else {
    console.log('[LLM Assistant] Voice disabled in settings');
  }

  // Render webview with explanation + optional audio
  panel.webview.html = getExplanationHTML(
    explanation,
    audioBuffer,
    audioMetadata,
    code
  );
}

/**
 * Generate explanation using LLM
 */
async function generateExplanation(code: string): Promise<string> {
  try {
    // Get LLM configuration from VS Code settings
    const config = vscode.workspace.getConfiguration('llm-assistant');
    const endpoint = config.get<string>('endpoint', 'http://localhost:11434');
    const model = config.get<string>('model', 'mistral');
    const temperature = config.get<number>('temperature', 0.7);
    const maxTokens = config.get<number>('maxTokens', 2000);

    // Create LLM client
    const llmConfig: LLMConfig = {
      endpoint,
      model,
      temperature,
      maxTokens,
      timeout: 120000, // 120 seconds
    };

    const llmClient = new LLMClient(llmConfig);

    // Check if server is healthy
    const isHealthy = await llmClient.isServerHealthy();
    if (!isHealthy) {
      return `⚠️ LLM Server Not Available\n\nCould not connect to LLM server at ${endpoint}.\n\nMake sure:\n1. Ollama is running: \`ollama serve\`\n2. Model is loaded: \`ollama run ${model}\`\n3. Endpoint is correct in settings`;
    }

    // Send prompt to LLM
    const prompt = `Explain the following code concisely and clearly. Focus on what it does, why it's written that way, and any important considerations.\n\n\`\`\`\n${code}\n\`\`\``;

    const response = await llmClient.sendMessage(prompt);

    if (!response.success) {
      return `⚠️ Explanation Failed\n\nError: ${response.error || 'Unknown error'}`;
    }

    return response.message || 'No explanation generated';
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return `⚠️ Explanation Failed\n\nError: ${errorMsg}\n\nMake sure Ollama is running with a model loaded (e.g., \`ollama run mistral\`)`;
  }
}

/**
 * Render explanation webview HTML
 */
/**
 * Simple markdown parser for webview
 */
function parseMarkdown(text: string): string {
  // Escape HTML first to prevent injection
  text = escapeHtml(text);
  
  // Headers (###, ##, #)
  text = text.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  text = text.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  text = text.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
  
  // Bold (**text**)
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
  
  // Italic (*text* or _text_)
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  text = text.replace(/_(.*?)_/g, '<em>$1</em>');
  
  // Inline code (`code`)
  text = text.replace(/`([^`]+)`/g, '<code style="background: #f5f5f5; padding: 2px 4px; border-radius: 2px; font-family: monospace;">$1</code>');
  
  // Code blocks (```code```)
  text = text.replace(/```(.*?)```/gs, (match, code) => {
    return `<pre style="background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto;"><code>${code.trim()}</code></pre>`;
  });
  
  // Links [text](url)
  text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" style="color: #0066cc; text-decoration: none;">$1</a>');
  
  // Lists (- item or * item)
  text = text.replace(/^[\*\-] (.*?)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>.*?<\/li>)/gs, (match) => {
    return `<ul style="margin: 8px 0; padding-left: 20px;">${match}</ul>`;
  });
  
  // Line breaks
  text = text.replace(/\n\n/g, '</p><p>');
  text = text.replace(/\n/g, '<br>');
  
  return text;
}

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
        <source src="data:audio/mp3;base64,${bufferToBase64(audioBuffer)}" type="audio/mpeg">
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
          color: #333;
        }
        h1 { color: #0066cc; font-size: 24px; margin: 16px 0 8px 0; }
        h2 { color: #0066cc; font-size: 20px; margin: 14px 0 6px 0; }
        h3 { color: #333; font-size: 16px; margin: 12px 0 4px 0; font-weight: 600; }
        p { margin: 8px 0; }
        pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; }
        code { font-family: 'Monaco', 'Menlo', monospace; font-size: 13px; }
        ul { margin: 8px 0; }
        li { margin: 4px 0; }
        a { color: #0066cc; text-decoration: none; }
        a:hover { text-decoration: underline; }
        strong { font-weight: 600; }
        em { font-style: italic; }
      </style>
    </head>
    <body>
      <h2>📝 Code Explanation</h2>
      
      ${audioSection}
      
      <div style="background: #fff9f0; padding: 12px; border-left: 3px solid #0066cc; margin: 16px 0;">
        <p>${parseMarkdown(explanation)}</p>
      </div>
      
      ${code ? `<details style="margin-top: 24px;">
        <summary style="cursor: pointer; font-weight: 500;">📄 View Code</summary>
        <pre><code>${escapeHtml(code)}</code></pre>
      </details>` : ''}
      
      <p style="font-size: 12px; color: #999; margin-top: 32px;">
        Generated by LLM Local Assistant v2.6.1
        ${audioBuffer ? ' • Voice narration powered by edge-tts' : ''}
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
