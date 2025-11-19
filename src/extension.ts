// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';
import { LLMClient, LLMConfig } from './llmClient';
import { GitClient } from './gitClient';
import { getWebviewContent } from './webviewContent';
import * as path from 'path';

let llmClient: LLMClient;
let chatPanel: vscode.WebviewPanel | undefined;

/**
 * Get LLM configuration from VS Code settings
 */
function getLLMConfig(): LLMConfig {
  const config = vscode.workspace.getConfiguration('llm-assistant');
  
  return {
    endpoint: config.get('endpoint', 'http://localhost:11434'),
    model: config.get('model', 'mistral'),
    temperature: config.get('temperature', 0.7),
    maxTokens: config.get('maxTokens', 2048),
    timeout: config.get('timeout', 30000),
    stream: true,
  };
}

/**
 * Open the LLM Chat panel
 */
function openLLMChat(context: vscode.ExtensionContext): void {
  if (chatPanel) {
    chatPanel.reveal(vscode.ViewColumn.Two);
    return;
  }

  // Create webview panel
  chatPanel = vscode.window.createWebviewPanel(
    'llmChat',
    'LLM Assistant',
    vscode.ViewColumn.Two,
    {
      enableScripts: true,
    }
  );

  // Set the webview's initial html content
  chatPanel.webview.html = getWebviewContent();

  // Show agent mode command help when panel opens
  setTimeout(() => {
    chatPanel?.webview.postMessage({
      command: 'addMessage',
      text: `**Agent Mode Commands:**\n\n` +
        `📄 **File Operations:**\n` +
        `- /read <path> — Read a file from workspace\n` +
        `- /write <path> <prompt> — Generate and write file content\n` +
        `- /suggestwrite <path> <prompt> — Preview before writing\n\n` +
        `📝 **Git Integration:**\n` +
        `- /git-commit-msg — Generate commit message from staged changes\n` +
        `- /git-review [staged|unstaged|all] — Review code changes with AI`,
      type: 'info',
      success: true,
    });
  }, 500);

  // Handle webview messages
  chatPanel.webview.onDidReceiveMessage(
    async (message) => {
      console.log('[LLM Assistant] Received message from webview:', message);
      try {
        switch (message.command) {
          case 'sendMessage': {
            const text: string = message.text || '';
            console.log('[LLM Assistant] Processing message:', text);

            // Check for /write command
            const writeMatch = text.match(/\/write\s+(\S+)(?:\s+(.+))?$/);
            
            // AGENT MODE: /write <path> [prompt]
            if (writeMatch) {
              const relPath = writeMatch[1];
              const prompt: string = (writeMatch[2] || 'Generate appropriate content for this file based on its name.').trim();
              
              console.log('[LLM Assistant] /write detected - path:', relPath, 'prompt:', prompt);
              
              chatPanel?.webview.postMessage({
                command: 'status',
                text: `Generating content for ${relPath}...`,
                type: 'info',
              });

              try {
                const endpoint: string = llmClient["config"].endpoint;
                const isOllamaNonDefaultPort = endpoint.includes("127.0.0.1:9000") || endpoint.includes("localhost:9000");
                let generatedContent = '';

                if (isOllamaNonDefaultPort) {
                  // Use non-streaming response
                  const response = await llmClient.sendMessage(prompt);
                  if (response.success) {
                    generatedContent = response.message || '';
                  } else {
                    throw new Error(response.error);
                  }
                } else {
                  // Use streaming response - collect all tokens
                  const response = await llmClient.sendMessageStream(
                    prompt,
                    async (token: string, complete: boolean) => {
                      if (!complete && token) {
                        generatedContent += token;
                      }
                    }
                  );
                  if (!response.success) {
                    throw new Error(response.error);
                  }
                }

                // Now write the generated content to file
                const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
                if (!wsFolder) throw new Error('No workspace folder open. Open a folder in VS Code first to use /write command.');
                const fileUri = vscode.Uri.joinPath(wsFolder, relPath);

                // Create parent directories if they don't exist
                const dirUri = vscode.Uri.joinPath(fileUri, '..');
                try {
                  await vscode.workspace.fs.createDirectory(dirUri);
                } catch (e) {
                  // Directory might already exist, that's ok
                }

                await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(generatedContent));
                chatPanel?.webview.postMessage({
                  command: 'addMessage',
                  text: `✅ Successfully generated and wrote file: ${relPath}\n\n\`\`\`\n${generatedContent}\n\`\`\``,
                  success: true,
                });
              } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                const errorDetail = errMsg.includes('EACCES') ? 'Permission denied. Check file permissions.' :
                                    errMsg.includes('ENOENT') ? 'Path not found. Check workspace folder.' :
                                    errMsg.includes('EISDIR') ? 'Target is a directory, not a file.' :
                                    errMsg;
                chatPanel?.webview.postMessage({
                  command: 'addMessage',
                  error: `Error writing file: ${relPath}\nReason: ${errorDetail}`,
                  success: false,
                });
              }
              return;
            }

            // Check for /read command
            const readMatch = text.match(/\/read\s+(\S+)/);

            // AGENT MODE: /read <path>
            if (readMatch) {
              const relPath = readMatch[1];
              const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
              if (!wsFolder) throw new Error('No workspace folder open.');
              const fileUri = vscode.Uri.joinPath(wsFolder, relPath);

              try {
                const data = await vscode.workspace.fs.readFile(fileUri);
                // Performance optimization: Warn and truncate files larger than 5MB
                const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
                let fileContent = new TextDecoder('utf-8').decode(data);
                let sizeWarning = '';
                if (data.byteLength > MAX_FILE_SIZE) {
                  sizeWarning = `\n⚠️ File is ${(data.byteLength / (1024 * 1024)).toFixed(2)}MB. Showing first 5MB.\n`;
                  fileContent = fileContent.substring(0, MAX_FILE_SIZE);
                }
                chatPanel?.webview.postMessage({
                  command: 'addMessage',
                  text: `Read file: ${relPath}${sizeWarning}\n\`\`\`\n${fileContent}\n\`\`\``,
                  success: true,
                });
              } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                const errorDetail = errMsg.includes('EACCES') ? 'Permission denied. Check file permissions.' :
                                    errMsg.includes('ENOENT') ? `File not found: ${relPath}` :
                                    errMsg.includes('EISDIR') ? 'Target is a directory, not a file.' :
                                    errMsg;
                chatPanel?.webview.postMessage({
                  command: 'addMessage',
                  error: `Error reading file: ${relPath}\nReason: ${errorDetail}`,
                  success: false,
                });
              }
              return;
            }

            // Check for /suggestwrite command
            const suggestwriteMatch = text.match(/\/suggestwrite\s+(\S+)(?:\s+(.+))?$/);

            // AGENT MODE: /suggestwrite <path> [prompt]
            if (suggestwriteMatch) {
              const relPath = suggestwriteMatch[1];
              const prompt: string = (suggestwriteMatch[2] || 'Generate appropriate content for this file based on its name.').trim();
              
              chatPanel?.webview.postMessage({
                command: 'status',
                text: `Generating content for ${relPath}...`,
                type: 'info',
              });

              try {
                const endpoint: string = llmClient["config"].endpoint;
                const isOllamaNonDefaultPort = endpoint.includes("127.0.0.1:9000") || endpoint.includes("localhost:9000");
                let generatedContent = '';

                if (isOllamaNonDefaultPort) {
                  // Use non-streaming response
                  const response = await llmClient.sendMessage(prompt);
                  if (response.success) {
                    generatedContent = response.message || '';
                  } else {
                    throw new Error(response.error);
                  }
                } else {
                  // Use streaming response - collect all tokens
                  const response = await llmClient.sendMessageStream(
                    prompt,
                    async (token: string, complete: boolean) => {
                      if (!complete && token) {
                        generatedContent += token;
                      }
                    }
                  );
                  if (!response.success) {
                    throw new Error(response.error);
                  }
                }

                const confirm = await vscode.window.showInformationMessage(
                  `LLM suggests writing to ${relPath}. Preview:\n\n${generatedContent.substring(0, 200)}${generatedContent.length > 200 ? '...' : ''}\n\nProceed?`,
                  { modal: true },
                  'Yes',
                  'No'
                );

                if (confirm === 'Yes') {
                  const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
                  if (!wsFolder) throw new Error('No workspace folder open.');
                  const fileUri = vscode.Uri.joinPath(wsFolder, relPath);

                  // Create parent directories if they don't exist
                  const dirUri = vscode.Uri.joinPath(fileUri, '..');
                  try {
                    await vscode.workspace.fs.createDirectory(dirUri);
                  } catch (e) {
                    // Directory might already exist, that's ok
                  }

                  await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(generatedContent));
                  chatPanel?.webview.postMessage({
                    command: 'addMessage',
                    text: `✅ Successfully wrote file: ${relPath}`,
                    success: true,
                  });
                } else {
                  chatPanel?.webview.postMessage({
                    command: 'addMessage',
                    error: `User cancelled writing to file: ${relPath}`,
                    success: false,
                  });
                }
              } catch (err) {
                chatPanel?.webview.postMessage({
                  command: 'addMessage',
                  error: `Error: ${err instanceof Error ? err.message : String(err)}`,
                  success: false,
                });
              }
              return;
            }

            // Check for /git-commit-msg command
            const gitCommitMatch = text.match(/\/git-commit-msg/);

            // AGENT MODE: /git-commit-msg - Generate commit message from staged changes
            if (gitCommitMatch) {
              const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
              if (!wsFolder) throw new Error('No workspace folder open.');

              try {
                const gitClient = new GitClient(wsFolder);
                const status = await gitClient.getStatus();

                if (status.stagedChanges.length === 0) {
                  chatPanel?.webview.postMessage({
                    command: 'addMessage',
                    error: 'No staged changes found. Stage files with "git add" first.',
                    success: false,
                  });
                  return;
                }

                const diff = await gitClient.getStagedDiff();
                const prompt = `Generate a concise, professional git commit message for these changes:\n\n${diff.summary}\n\nFiles changed: ${diff.filesChanged.join(', ')}\n\nDiff:\n${diff.diff}\n\nRespond with ONLY the commit message, nothing else. Keep it under 72 characters for the title, then optionally add a blank line and body.`;

                chatPanel?.webview.postMessage({
                  command: 'status',
                  text: `Analyzing staged changes (${status.stagedChanges.length} file(s))...`,
                });

                const endpoint: string = llmClient["config"].endpoint;
                const isOllamaNonDefaultPort = endpoint.includes("127.0.0.1:9000") || endpoint.includes("localhost:9000");

                if (isOllamaNonDefaultPort) {
                  const response = await llmClient.sendMessage(prompt);
                  if (response.success) {
                    chatPanel?.webview.postMessage({
                      command: 'addMessage',
                      text: `📝 Suggested commit message:\n\n\`\`\`\n${response.message}\n\`\`\`\n\nCopy this message and run: git commit -m "your message here"`,
                      success: true,
                    });
                  } else {
                    throw new Error(response.error);
                  }
                } else {
                  let commitMsg = '';
                  const response = await llmClient.sendMessageStream(
                    prompt,
                    async (token: string, complete: boolean) => {
                      if (!complete && token) {
                        commitMsg += token;
                      }
                    }
                  );
                  if (response.success) {
                    chatPanel?.webview.postMessage({
                      command: 'addMessage',
                      text: `📝 Suggested commit message:\n\n\`\`\`\n${commitMsg}\n\`\`\`\n\nCopy this message and run: git commit -m "your message here"`,
                      success: true,
                    });
                  } else {
                    throw new Error(response.error);
                  }
                }
              } catch (err) {
                chatPanel?.webview.postMessage({
                  command: 'addMessage',
                  error: `Git error: ${err instanceof Error ? err.message : String(err)}`,
                  success: false,
                });
              }
              return;
            }

            // Check for /git-review command
            const gitReviewMatch = text.match(/\/git-review(?:\s+(\S+))?/);

            // AGENT MODE: /git-review [staged|unstaged|all] - Review code changes
            if (gitReviewMatch) {
              const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
              if (!wsFolder) throw new Error('No workspace folder open.');

              try {
                const gitClient = new GitClient(wsFolder);
                const reviewType = gitReviewMatch[1] || 'staged';
                
                let diff: any;
                if (reviewType === 'unstaged') {
                  diff = await gitClient.getUnstagedDiff();
                } else if (reviewType === 'all') {
                  diff = await gitClient.getAllChanges();
                } else {
                  diff = await gitClient.getStagedDiff();
                }

                if (diff.filesChanged.length === 0) {
                  chatPanel?.webview.postMessage({
                    command: 'addMessage',
                    error: `No ${reviewType} changes found.`,
                    success: false,
                  });
                  return;
                }

                const prompt = `Please review these code changes for quality, best practices, and potential issues:\n\n${diff.summary}\n\nFiles: ${diff.filesChanged.join(', ')}\n\nDiff:\n${diff.diff}\n\nProvide constructive feedback on:\n1. Code quality and style\n2. Potential bugs or issues\n3. Performance considerations\n4. Testing recommendations`;

                chatPanel?.webview.postMessage({
                  command: 'status',
                  text: `Reviewing ${reviewType} changes (${diff.filesChanged.length} file(s))...`,
                });

                const endpoint: string = llmClient["config"].endpoint;
                const isOllamaNonDefaultPort = endpoint.includes("127.0.0.1:9000") || endpoint.includes("localhost:9000");

                if (isOllamaNonDefaultPort) {
                  const response = await llmClient.sendMessage(prompt);
                  if (response.success) {
                    chatPanel?.webview.postMessage({
                      command: 'addMessage',
                      text: `🔍 Code Review:\n\n${response.message}`,
                      success: true,
                    });
                  } else {
                    throw new Error(response.error);
                  }
                } else {
                  const response = await llmClient.sendMessageStream(
                    prompt,
                    async (token: string, complete: boolean) => {
                      if (complete) {
                        chatPanel?.webview.postMessage({
                          command: 'streamComplete',
                        });
                      } else if (token) {
                        chatPanel?.webview.postMessage({
                          command: 'streamToken',
                          token: token,
                        });
                      }
                    }
                  );
                  if (!response.success) {
                    throw new Error(response.error);
                  }
                }
              } catch (err) {
                chatPanel?.webview.postMessage({
                  command: 'addMessage',
                  error: `Git error: ${err instanceof Error ? err.message : String(err)}`,
                  success: false,
                });
              }
              return;
            }

            // Normal LLM chat
            chatPanel?.webview.postMessage({
              command: 'status',
              text: 'Streaming response...',
              type: 'info',
            });

            const endpoint: string = llmClient["config"].endpoint;
            const isOllamaNonDefaultPort = endpoint.includes("127.0.0.1:9000") || endpoint.includes("localhost:9000");

            if (isOllamaNonDefaultPort) {
              // Use non-streaming response
              const response = await llmClient.sendMessage(text);
              if (response.success) {
                chatPanel?.webview.postMessage({
                  command: 'streamToken',
                  token: response.message,
                });
              } else {
                chatPanel?.webview.postMessage({
                  command: 'addMessage',
                  error: response.error,
                  success: false,
                });
              }
            } else {
              // Use streaming response
              const response = await llmClient.sendMessageStream(
                text,
                async (token: string, complete: boolean) => {
                  if (complete) {
                    chatPanel?.webview.postMessage({
                      command: 'streamComplete',
                    });
                  } else if (token) {
                    chatPanel?.webview.postMessage({
                      command: 'streamToken',
                      token: token,
                    });
                  }
                }
              );
              if (!response.success) {
                chatPanel?.webview.postMessage({
                  command: 'addMessage',
                  error: response.error,
                  success: false,
                });
              }
            }
            break;
          }

          case 'clearChat': {
            llmClient.clearHistory();
            chatPanel?.webview.postMessage({
              command: 'status',
              text: 'Chat history cleared',
              type: 'info',
            });
            break;
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        chatPanel?.webview.postMessage({
          command: 'addMessage',
          error: errorMsg,
          success: false,
        });
      }
    },
    undefined,
    context.subscriptions
  );

  // Handle panel close
  chatPanel.onDidDispose(
    () => {
      chatPanel = undefined;
    },
    undefined,
    context.subscriptions
  );
}

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('LLM Local Assistant is now active!');

  // Initialize LLM client with config
  const config = getLLMConfig();
  llmClient = new LLMClient(config);

  // Register commands
  const openChatCommand = vscode.commands.registerCommand('llm-local-assistant.openChat', () => {
    openLLMChat(context);
  });

  const testConnectionCommand = vscode.commands.registerCommand('llm-local-assistant.testConnection', async () => {
    const isHealthy = await llmClient.isServerHealthy();
    if (isHealthy) {
      vscode.window.showInformationMessage('✅ Successfully connected to LLM server!');
    } else {
      const config = getLLMConfig();
      const errorMsg = `❌ Could not connect to LLM server at ${config.endpoint}.\n\nSuggestions:\n` +
        `1. Verify the server is running (e.g., 'ollama run ${config.model}')\n` +
        `2. Check endpoint in settings: llm-assistant.endpoint\n` +
        `3. Ensure model '${config.model}' is installed\n` +
        `4. If using non-default port, update llm-assistant.endpoint`;
      vscode.window.showErrorMessage(errorMsg);
    }
  });

  context.subscriptions.push(openChatCommand, testConnectionCommand);

  // Create status bar item to open chat
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'llm-local-assistant.openChat';
  statusBarItem.text = '$(sparkle) LLM Assistant';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

/**
 * Extension deactivation
 */
export function deactivate() {
  if (chatPanel) {
    chatPanel.dispose();
  }
}
