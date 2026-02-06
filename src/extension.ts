// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';
import { LLMClient, LLMConfig } from './llmClient';
import { GitClient } from './gitClient';
import { Planner } from './planner';
import { Executor } from './executor';
import { getWebviewContent } from './webviewContent';
import * as path from 'path';

let llmClient: LLMClient;
let planner: Planner;
let executor: Executor;
let chatPanel: vscode.WebviewPanel | undefined;
let chatHistory: Array<{ role: string; content: string; type?: string }> = []; // Persist chat messages
let helpShown = false; // Track if help message was shown on first open
let messageHandlerAttached = false; // Track if message handler is already attached
let pendingQuestionResolve: ((answer: string) => void) | null = null; // For handling clarification questions

/**
 * Load architecture rules from workspace root
 * Checks in priority order: .lla-rules (primary) → .cursorrules (migration/fallback)
 * @returns Rules content if file exists, undefined otherwise
 */
async function loadArchitectureRules(): Promise<string | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }

  const workspace = folders[0];

  // Priority order:
  // 1. .lla-rules (LLM Local Assistant - primary)
  // 2. .cursorrules (Cursor IDE - fallback/migration support)
  const filenames = ['.lla-rules', '.cursorrules'];

  for (const filename of filenames) {
    try {
      const rulesUri = vscode.Uri.joinPath(workspace.uri, filename);
      const content = await vscode.workspace.fs.readFile(rulesUri);
      const text = new TextDecoder().decode(content);

      console.log(`✓ Loaded ${filename} from workspace`);
      return text;
    } catch (error) {
      // File doesn't exist, try next
      continue;
    }
  }

  // No rules file found
  return undefined;
}

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
    timeout: config.get('timeout', 120000), // 120s timeout for planning operations
    stream: true,
  };
}

/**
 * Helper to post message to chat and store in history
 */
function postChatMessage(message: any): void {
  chatPanel?.webview.postMessage(message);
  
  // Store in chat history for persistence across panel switches
  if (message.command === 'addMessage' && message.text) {
    chatHistory.push({
      role: message.role || 'assistant',
      content: message.text,
      type: message.type || 'message',
    });
  }
}

/**
 * Open the LLM Chat panel
 */
function openLLMChat(context: vscode.ExtensionContext): void {
  if (chatPanel) {
    chatPanel.reveal(vscode.ViewColumn.Two);
    return; // Panel already exists, just reveal it - don't reset HTML or history
  }

  // Create webview panel
  chatPanel = vscode.window.createWebviewPanel(
    'llmChat',
    'LLM Assistant',
    vscode.ViewColumn.Two,
    {
      enableScripts: true,
      retainContextWhenHidden: true, // Keep panel alive when hidden to preserve chat history
    }
  );

  // Set the webview's initial html content ONLY on first creation
  chatPanel.webview.html = getWebviewContent();

  // Show agent mode command help ONLY on first open
  setTimeout(() => {
    if (!helpShown) {
      postChatMessage({
        command: 'addMessage',
        text: `**Agent Mode Commands:**\n\n` +
          `🤖 **Planning & Execution:**\n` +
          `- /plan <task> — Create a multi-step action plan\n` +
          `- /approve — Execute the current plan\n` +
          `- /reject — Discard the current plan\n\n` +
          `📄 **File Operations:**\n` +
          `- /read <path> — Read a file from workspace\n` +
          `- /write <path> <prompt> — Generate and write file content\n` +
          `- /suggestwrite <path> <prompt> — Preview before writing\n` +
          `- /explain <path> — Generate detailed code explanation\n\n` +
          `📝 **Git Integration:**\n` +
          `- /git-commit-msg — Generate commit message from staged changes\n` +
          `- /git-review [staged|unstaged|all] — Review code changes with AI`,
        type: 'info',
        success: true,
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
  if (!messageHandlerAttached) {
    chatPanel.webview.onDidReceiveMessage(
    async (message) => {
      console.log('[LLM Assistant] Received message from webview:', message);
      try {
        switch (message.command) {
          case 'sendMessage': {
            const text: string = message.text || '';
            console.log('[LLM Assistant] Processing message:', text);

            // Check for /plan command
            const planMatch = text.match(/^\/plan\s+(.+)$/);

            // AGENT MODE: /plan <task>
            if (planMatch) {
              const userRequest = planMatch[1].trim();
              
              chatPanel?.webview.postMessage({
                command: 'status',
                text: `🤔 Analyzing task...`,
                type: 'info',
              });

              try {
                // First: Generate thinking to show reasoning
                const thinking = await planner.generateThinking(
                  userRequest,
                  { messages: llmClient.getHistory() }
                );

                postChatMessage({
                  command: 'addMessage',
                  text: `**My approach:**\n\n${thinking}`,
                  success: true,
                });

                // Second: Generate the actual plan
                chatPanel?.webview.postMessage({
                  command: 'status',
                  text: `Creating detailed plan...`,
                  type: 'info',
                });

                const { plan, markdown } = await planner.generatePlan(
                  userRequest,
                  { messages: llmClient.getHistory() }
                );
                
                // Store current plan for approval
                (chatPanel as any)._currentPlan = plan;
                
                postChatMessage({
                  command: 'addMessage',
                  text: `📋 **Plan Created** (${plan.steps.length} steps)\n\n${markdown}\n\n_Use **/approve** to execute or **/reject** to discard_`,
                  success: true,
                });
              } catch (err) {
                postChatMessage({
                  command: 'addMessage',
                  error: `Planning error: ${err instanceof Error ? err.message : String(err)}`,
                  success: false,
                });
              }
              return;
            }

            // Check for /approve command
            const approveMatch = text.match(/^\/approve/);

            // AGENT MODE: /approve - Execute current plan
            if (approveMatch) {
              try {
                const currentPlan = (chatPanel as any)._currentPlan;
                if (!currentPlan) {
                  chatPanel?.webview.postMessage({
                    command: 'addMessage',
                    error: 'No plan to approve. Use /plan <task> first.',
                    success: false,
                  });
                  return;
                }

                chatPanel?.webview.postMessage({
                  command: 'status',
                  text: 'Executing plan...',
                  type: 'info',
                });

                console.log('[Extension] About to execute plan with', currentPlan.steps.length, 'steps');
                currentPlan.steps.forEach((step, idx) => {
                  console.log(`[Extension] Step ${idx + 1}: action=${step.action}, description=${step.description}`);
                });

                const result = await executor.executePlan(currentPlan);
                
                // Clear current plan
                delete (chatPanel as any)._currentPlan;
                
                const message = result.success 
                  ? `✅ **Plan completed successfully**\n\nCompleted ${result.completedSteps} of ${currentPlan.steps.length} steps`
                  : `⚠️ **Plan execution failed**\n\nError: ${result.error || 'Unknown error'}`;
                
                chatPanel?.webview.postMessage({
                  command: 'addMessage',
                  text: message,
                  success: result.success,
                });
              } catch (err) {
                chatPanel?.webview.postMessage({
                  command: 'addMessage',
                  error: `Execution error: ${err instanceof Error ? err.message : String(err)}`,
                  success: false,
                });
              }
              return;
            }

            // Check for /reject command
            const rejectMatch = text.match(/^\/reject/);

            // AGENT MODE: /reject - Discard current plan
            if (rejectMatch) {
              const currentPlan = (chatPanel as any)._currentPlan;
              if (!currentPlan) {
                chatPanel?.webview.postMessage({
                  command: 'addMessage',
                  error: 'No plan to reject.',
                  success: false,
                });
                return;
              }

              // Clear current plan
              delete (chatPanel as any)._currentPlan;
              
              chatPanel?.webview.postMessage({
                command: 'addMessage',
                text: '🗑️ Plan discarded.',
                success: true,
              });
              return;
            }

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
                if (!wsFolder) {throw new Error('No workspace folder open. Open a folder in VS Code first to use /write command.');}
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
              if (!wsFolder) {throw new Error('No workspace folder open.');}
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
                  if (!wsFolder) {throw new Error('No workspace folder open.');}
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
              if (!wsFolder) {throw new Error('No workspace folder open.');}

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
              if (!wsFolder) {throw new Error('No workspace folder open.');}

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

            // Check for /explain command (Priority 2.2)
            const explainMatch = text.match(/\/explain\s+(\S+)/);

            // AGENT MODE: /explain <path> - Generate explanation of code
            if (explainMatch) {
              const relPath = explainMatch[1];
              const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
              if (!wsFolder) { throw new Error('No workspace folder open.'); }
              const fileUri = vscode.Uri.joinPath(wsFolder, relPath);

              chatPanel?.webview.postMessage({
                command: 'status',
                text: `📖 Analyzing ${relPath}...`,
                type: 'info',
              });

              try {
                const data = await vscode.workspace.fs.readFile(fileUri);
                const fileContent = new TextDecoder('utf-8').decode(data);
                
                // Build explanation prompt with context
                const contextStr = llmClient.getHistory().length > 0
                  ? `\n\nConversation context:\n${llmClient.getHistory().slice(-4).map((m: any) => 
                      `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
                    ).join('\n')}\n`
                  : '';

                const prompt = `Explain the following code from ${relPath}. Cover:
1. What this code does at a high level
2. Key functions/classes and their purposes
3. Important algorithms or patterns used
4. Any notable edge cases or error handling
5. How it fits into the larger system (if context available)

Keep the explanation clear and concise, suitable for a developer reviewing the code.${contextStr}

Code from ${relPath}:
\`\`\`
${fileContent}
\`\`\``;

                chatPanel?.webview.postMessage({
                  command: 'status',
                  text: 'Generating explanation...',
                  type: 'info',
                });

                const endpoint: string = llmClient["config"].endpoint;
                const isOllamaNonDefaultPort = endpoint.includes("127.0.0.1:9000") || endpoint.includes("localhost:9000");

                if (isOllamaNonDefaultPort) {
                  // Use non-streaming response
                  const response = await llmClient.sendMessage(prompt);
                  if (response.success) {
                    postChatMessage({
                      command: 'addMessage',
                      text: `📖 **Code Explanation: ${relPath}**\n\n${response.message}`,
                      success: true,
                    });
                  } else {
                    throw new Error(response.error);
                  }
                } else {
                  // Use streaming response
                  let explanation = '';
                  const response = await llmClient.sendMessageStream(
                    prompt,
                    async (token: string, complete: boolean) => {
                      if (!complete && token) {
                        explanation += token;
                      }
                    }
                  );
                  if (response.success) {
                    postChatMessage({
                      command: 'addMessage',
                      text: `📖 **Code Explanation: ${relPath}**\n\n${explanation}`,
                      success: true,
                    });
                  } else {
                    throw new Error(response.error);
                  }
                }
              } catch (err) {
                postChatMessage({
                  command: 'addMessage',
                  error: `Error explaining code: ${err instanceof Error ? err.message : String(err)}`,
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

          case 'answerQuestion': {
            // Handle clarification question response
            if (pendingQuestionResolve) {
              pendingQuestionResolve(message.answer);
              pendingQuestionResolve = null;
            }
            break;
          }

          case 'clearChat': {
            llmClient.clearHistory();
            chatHistory = []; // Clear persisted chat history
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
    messageHandlerAttached = true; // Mark handler as attached
  }

  // Handle panel close
  chatPanel.onDidDispose(
    () => {
      chatPanel = undefined;
      messageHandlerAttached = false; // Reset handler flag when panel is disposed
    },
    undefined,
    context.subscriptions
  );
}

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('LLM Local Assistant is now active!');

  // Initialize LLM client with config
  const config = getLLMConfig();

  // Load architecture rules from .cursorrules if available
  const rules = await loadArchitectureRules();
  if (rules) {
    config.architectureRules = rules;
  }

  llmClient = new LLMClient(config);

  // Get workspace folder for codebase awareness
  const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri;

  // Initialize Planner and Executor
  planner = new Planner({
    llmClient,
    maxSteps: 10,
    timeout: 120000, // Increased to 120s for longer-running planning operations
    workspace: wsFolder, // For codebase awareness (Priority 2.2)
  });
  
  const gitClient = wsFolder ? new GitClient(wsFolder) : undefined;

  executor = new Executor({
    extension: context,
    llmClient,
    gitClient,
    workspace: wsFolder || vscode.Uri.file('/'),
    maxRetries: 2,
    timeout: 30000,
    onProgress: (step: number, total: number, description: string) => {
      console.log(`[Executor] Step ${step}/${total}: ${description}`);
    },
    onMessage: (message: string, type: 'info' | 'error') => {
      console.log(`[Executor ${type.toUpperCase()}]`, message);
      if (chatPanel) {
        chatPanel.webview.postMessage({
          command: 'addMessage',
          text: message,
          success: type === 'info',
        });
      }
    },
    onStepOutput: (stepId: number, output: string, isStart: boolean) => {
      // Stream step output to webview
      if (chatPanel) {
        chatPanel.webview.postMessage({
          command: isStart ? 'status' : 'addMessage',
          text: output,
          success: true,
        });
      }
    },
    onQuestion: (question: string, options: string[]) => {
      // Display question and wait for response
      return new Promise((resolve) => {
        console.log('[Extension] onQuestion callback invoked:', question);
        console.log('[Extension] Current chatPanel:', !!chatPanel);
        console.log('[Extension] Options:', options);
        
        if (chatPanel) {
          console.log('[Extension] Posting question to webview');
          pendingQuestionResolve = resolve;
          const messageToSend = {
            command: 'question',
            question,
            options,
          };
          console.log('[Extension] Message to send:', JSON.stringify(messageToSend));
          chatPanel.webview.postMessage(messageToSend);
        } else {
          // If no chat panel, auto-proceed with first option (default behavior)
          console.log('[Extension] No chat panel for question, auto-proceeding with:', options[0]);
          resolve(options[0]);
        }
      });
    },
  });

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
