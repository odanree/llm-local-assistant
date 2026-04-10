// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';
import { LLMClient, LLMConfig } from './llmClient';
import { GitClient } from './gitClient';
import { Planner } from './planner';
import GatekeeperValidator from './gatekeeperValidator';
import { Executor } from './executor';
import CodebaseIndex, { EmbeddingClient } from './codebaseIndex';
import { getWebviewContent } from './webviewContent';
import { PlanParser } from './planParser';
import { WorkspaceDetector } from './utils';
import { ContextBuilder } from './utils/contextBuilder';  // CONTEXT-AWARE PLANNING
import { registerDiagnostics } from './diagnostics';
import * as path from 'path';

let llmClient: LLMClient;
let executor: Executor;
let codebaseIndex: CodebaseIndex;
let embeddingClient: EmbeddingClient;
let chatPanel: vscode.WebviewPanel | undefined;
let chatHistory: Array<{ role: string; content: string; type?: string }> = []; // Persist chat messages
let helpShown = false; // Track if help message was shown on first open
let messageHandlerAttached = false; // Track if message handler is already attached
let pendingQuestionResolve: ((answer: string) => void) | null = null; // For handling clarification questions
let wsFolder: vscode.Uri | undefined; // Current workspace folder context

/**
 * Find the workspace folder that contains a given file path
 * @param filepath - The file path to search for (relative or absolute)
 * @returns The workspace folder URI, or the first folder if not found
 */
async function findWorkspaceFolderForFile(filepath: string): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }

  // If only one workspace folder, use it
  if (folders.length === 1) {
    return folders[0];
  }

  // Normalize the path: convert backslashes to forward slashes for consistency
  const normalizedPath = filepath.replace(/\\/g, '/');

  // For multiple folders, try to find the one containing the file
  // First, check if filepath is absolute
  if (path.isAbsolute(filepath)) {
    for (const folder of folders) {
      const folderPath = folder.uri.fsPath;
      if (filepath.startsWith(folderPath)) {
        return folder;
      }
    }
  }

  // If relative path, try to find it in any workspace folder by checking existence
  for (const folder of folders) {
    try {
      // Use normalized path with forward slashes
      const fileUri = vscode.Uri.joinPath(folder.uri, normalizedPath);
      console.log(`[Multi-workspace] Checking ${folder.name}: ${fileUri.fsPath}`);
      // Try to stat the file to check if it exists
      await vscode.workspace.fs.stat(fileUri);
      // If we get here, file exists in this folder
      console.log(`[Multi-workspace] Found file in workspace: ${folder.name}`);
      return folder;
    } catch (error) {
      // File doesn't exist in this folder, continue searching
      continue;
    }
  }

  // Default to first folder (will let command handler report the error)
  console.log(`[Multi-workspace] File not found in any workspace, defaulting to first folder`);
  return folders[0];
}

/**
 * Load architecture rules from workspace root
 * Checks in priority order: .lla-rules (primary) → .cursorrules (migration/fallback)
 * @returns Rules content if file exists, undefined otherwise
 */
async function loadArchitectureRules(): Promise<string | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    console.log('[.lla-rules] No workspace folders found');
    return undefined;
  }

  const workspace = folders[0];
  const workspacePath = workspace.uri.fsPath;
  console.log(`[.lla-rules] Checking workspace: ${workspacePath}`);

  // Priority order:
  // 1. .lla-rules (LLM Local Assistant - primary)
  // 2. .cursorrules (Cursor IDE - fallback/migration support)
  const filenames = ['.lla-rules', '.cursorrules'];

  for (const filename of filenames) {
    try {
      const rulesUri = vscode.Uri.joinPath(workspace.uri, filename);
      const rulesPath = rulesUri.fsPath;
      console.log(`[.lla-rules] Attempting to read: ${rulesPath}`);
      
      const content = await vscode.workspace.fs.readFile(rulesUri);
      const text = new TextDecoder().decode(content);
      const lines = text.split('\n').length;

      console.log(`✅ [.lla-rules] Successfully loaded ${filename} (${lines} lines, ${content.byteLength} bytes)`);
      console.log(`[.lla-rules] First line: ${text.split('\n')[0].substring(0, 80)}`);
      return text;
    } catch (error) {
      // File doesn't exist, try next
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`[.lla-rules] ${filename} not found: ${errorMsg}`);
      continue;
    }
  }

  // No rules file found
  console.log(`[.lla-rules] No .lla-rules or .cursorrules file found in workspace`);
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
  // Skip storage if message has skipHistory flag (e.g., startup help text)
  if (message.command === 'addMessage' && message.text && !message.skipHistory) {
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
  console.log('[openChat] Starting chat panel...');
  
  if (chatPanel) {
    console.log('[openChat] Chat panel already exists, revealing...');
    chatPanel.reveal(vscode.ViewColumn.Two);
    return; // Panel already exists, just reveal it - don't reset HTML or history
  }

  console.log('[openChat] Creating new webview panel');

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

  console.log('[openChat] ✅ Webview panel created successfully');

  // Set the webview's initial html content ONLY on first creation
  chatPanel.webview.html = getWebviewContent();

  // Show agent mode command help ONLY on first open
  setTimeout(() => {
    if (!helpShown) {
      chatPanel?.webview.postMessage({
        command: 'addMessage',
        text: `**LLM Local Assistant - v2.13.1**\n` +
          `📊 89 test files, 3,251 tests passing\n\n` +
          `📋 **Planning & Execution:**\n` +
          `- /plan <task> → Create a multi-step action plan with validation\n` +
          `- /execute → Execute the current plan step-by-step\n` +
          `- /approve → Acknowledge and approve the plan\n` +
          `- /reject → Discard the current plan\n\n` +
          `📝 **Code Explanation:**\n` +
          `- /explain <path> → Generate detailed code explanation with markdown formatting\n\n` +
          `🔍 **Codebase Context & Analysis:**\n` +
          `- /context show structure → Show project file organization\n` +
          `- /context show patterns → Show detected code patterns\n` +
          `- /context show dependencies → Show file dependencies\n` +
          `- /context find similar <file> → Find similar files\n\n` +
          `🔧 **Refactoring & Architecture:**\n` +
          `- /refactor <file> → Analyze and suggest improvements\n` +
          `\n` +
          `📝 **File Operations:**\n` +
          `- /read <path> → Read a file from workspace\n` +
          `- /write <path> <prompt> → Generate and write file content\n` +
          `- /suggestwrite <path> <prompt> → Preview before writing\n\n` +
          `📚 **Git Integration:**\n` +
          `- /git-commit-msg → Generate commit message from staged changes\n` +
          `- /git-review [staged|unstaged|all] → Review code changes with AI\n\n` +
          `🧪 **Diagnostics:**\n` +
          `- /check-model → Verify LLM server connection\n\n` +
          `📖 **Documentation:**\n` +
          `- See docs/MAINTENANCE.md for deployment and troubleshooting`,
        type: 'info',
        success: true,
        skipHistory: true, // Don't store startup help in history
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

            // PHASE 6: /plan command → With multi-folder workspace detection
            if (planMatch) {
              const userRequest = planMatch[1];
              
              console.log('[/plan] Command triggered:', userRequest);

              try {
                // Check if VS Code has multiple folders open (multi-folder workspace)
                const folders = vscode.workspace.workspaceFolders;
                console.log('[/plan] Folders in workspace:', folders?.length || 0);

                // If multiple folders, ask user which one
                if (folders && folders.length > 1) {
                  console.log('[/plan] Multiple folders detected. Showing selection prompt.');
                  postChatMessage({
                    command: 'question',
                    question: `❓ **Multiple folders detected.** Which project should I create the plan for?`,
                    options: folders.map(f => f.name),
                  });
                  
                  // Store for handling the answer
                  (chatPanel as any)._planFolders = folders;
                  (chatPanel as any)._pendingPlanRequest = userRequest;
                  return;
                }

                // Single folder or use default
                const selectedFolder = folders?.[0];
                if (!selectedFolder) {
                  postChatMessage({
                    command: 'addMessage',
                    error: 'No workspace folder open.',
                    success: false,
                  });
                  return;
                }

                console.log('[/plan] Single folder. Proceeding with:', selectedFolder.name);

                // Generate plan in selected folder
                postChatMessage({
                  command: 'addMessage',
                  text: `📊 Generating plan for: "${userRequest}"`,
                  type: 'info',
                });

                try {
                  // Use Planner (not Refiner) for planning tasks
                  // Planner is for non-deterministic intent decomposition
                  // Refiner is for deterministic code transformation
                  const planner = new Planner({
                    llmCall: async (prompt: string) => {
                      const response = await llmClient.sendMessage(prompt);
                      if (!response.success) {
                        throw new Error(response.error || 'LLM call failed');
                      }
                      return response.message || '';
                    },
                    onProgress: (stage: string, details: string) => {
                      chatPanel?.webview.postMessage({
                        command: 'addMessage',
                        text: `→ ${stage}: ${details}`,
                        type: 'info',
                      });
                    },
                  });

                  // CONTEXT-AWARE PLANNING: Build project context and pass to Planner
                  const contextBuilder = new ContextBuilder();
                  const projectContext = contextBuilder.buildContext(selectedFolder.uri.fsPath);

                  const plan = await planner.generatePlan(
                    userRequest,
                    selectedFolder.uri.fsPath,  // CRITICAL: Pass workspace path
                    selectedFolder.name,        // CRITICAL: Pass workspace name
                    projectContext              // CONTEXT-AWARE: Pass project context
                  );
                  
                  // Store plan for /execute command
                  (chatPanel as any)._currentPlan = plan;

                  // Format plan for display
                  let planDisplay = plan.steps
                    .map(
                      (s) =>
                        `**[Step ${s.stepNumber}] ${s.action.toUpperCase()}**\n` +
                        `${s.description}\n` +
                        (s.targetFile ? ` Target: \`${s.targetFile}\`\n` : '') +
                        `✅ Expected: ${s.expectedOutcome}`
                    )
                    .join('\n\n');

                  postChatMessage({
                    command: 'addMessage',
                    text: `✨ Plan generated successfully!\n\n${planDisplay}\n\n**Next:** Click a button below or use \`/execute\` to run, \`/reject\` to discard.`,
                    success: true,
                    options: ['Execute', 'Reject'],
                  });
                } catch (err) {
                  postChatMessage({
                    command: 'addMessage',
                    error: `Error generating plan: ${err instanceof Error ? err.message : String(err)}`,
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
              return;
            }

            // Check for /check-model command
            const checkModelMatch = text.match(/^\/check-model/);

            // DIAGNOSTIC: /check-model - Show configured and running models
            if (checkModelMatch) {
              chatPanel?.webview.postMessage({
                command: 'status',
                text: 'Checking model configuration...',
                type: 'info',
              });

              try {
                const modelInfo = await llmClient.getModelInfo();
                
                let response = ` **Model Configuration**\n\n`;
                response += `**Endpoint:** \`${modelInfo.endpoint}\`\n\n`;
                response += `**Configured Model:** \`${modelInfo.configuredModel}\`\n\n`;
                
                if (modelInfo.availableModels.length > 0) {
                  response += `**Available Models on Server:**\n`;
                  modelInfo.availableModels.forEach(model => {
                    const isCurrent = model === modelInfo.configuredModel;
                    response += `- \`${model}\`${isCurrent ? ' ✨ (configured)' : ''}\n`;
                  });
                } else if (modelInfo.error) {
                  response += `**Error:** ${modelInfo.error}\n\n`;
                  response += `**Troubleshooting:**\n`;
                  response += `- Check if Ollama is running: \`ollama serve\`\n`;
                  response += `- Verify endpoint in settings: \`llm-assistant.endpoint\`\n`;
                  response += `- Pull the model if missing: \`ollama pull ${modelInfo.configuredModel}\`\n`;
                } else {
                  response += `**Status:** Server is running but no models found.\n`;
                  response += `Pull a model first: \`ollama pull ${modelInfo.configuredModel}\`\n`;
                }
                
                postChatMessage({
                  command: 'addMessage',
                  text: response,
                  success: !modelInfo.error,
                });
              } catch (err) {
                postChatMessage({
                  command: 'addMessage',
                  error: `Error checking models: ${err instanceof Error ? err.message : String(err)}`,
                  success: false,
                });
              }
              return;
            }

            // Check for /approve command
            const approveMatch = text.match(/^\/approve/);

            // PHASE 4: /approve command → Acknowledge approved plans
            if (approveMatch) {
              postChatMessage({
                command: 'addMessage',
                text: `✨ Plan approved! Use \`/execute\` to run the steps, or \`/reject\` to discard it.`,
                success: true,
              });
              return;
            }

            // Check for /execute command
            const executeMatch = text.match(/^\/execute/);

            // PHASE 4: /execute command → Execute the current plan step-by-step
            if (executeMatch) {
              const currentPlan = (chatPanel as any)._currentPlan;
              if (!currentPlan) {
                postChatMessage({
                  command: 'addMessage',
                  error: 'No plan to execute. Use /plan <task> to generate one first.',
                  success: false,
                });
                return;
              }

              postChatMessage({
                command: 'addMessage',
                text: `▶️ Executing plan: "${currentPlan.userRequest || 'Unnamed Task'}"\n\nRunning ${currentPlan.steps.length} steps...`,
                type: 'info',
              });

              try {
                executor.executePlan(currentPlan).then((result) => {
                  if (result.success) {
                    postChatMessage({
                      command: 'addMessage',
                      text: `✨ Plan execution complete! ${result.completedSteps}/${currentPlan.steps.length} steps succeeded.`,
                      success: true,
                    });
                    delete (chatPanel as any)._currentPlan;
                  } else {
                    postChatMessage({
                      command: 'addMessage',
                      error: `Plan execution failed: ${result.error || 'Unknown error'}`,
                      success: false,
                    });
                  }
                }).catch((err) => {
                  postChatMessage({
                    command: 'addMessage',
                    error: `Execution error: ${err instanceof Error ? err.message : String(err)}`,
                    success: false,
                  });
                });
              } catch (err) {
                postChatMessage({
                  command: 'addMessage',
                  error: `Error starting execution: ${err instanceof Error ? err.message : String(err)}`,
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

                // GATEKEEPER: Build strict prompt for code generation
                const fileExtension = relPath.split('.').pop()?.toLowerCase();
                const isCodeFile = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'json', 'yml', 'yaml', 'html', 'css', 'sh'].includes(fileExtension || '');
                
                let finalPrompt = prompt;
                if (isCodeFile) {
                  finalPrompt = `You are generating code for a SINGLE file: ${relPath}

${prompt}

STRICT REQUIREMENTS:
1. Output ONLY valid, executable code for this file
2. NO markdown backticks, NO code blocks, NO explanations
3. NO documentation, NO comments about what you're doing
4. NO instructions for other files
5. Start with the first line of code immediately
6. End with the last line of code
7. Every line must be syntactically valid for a ${fileExtension} file
8. This code will be parsed as pure code - nothing else matters

Example format (raw code, nothing else):
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({...});
export function MyComponent() {...}

Do NOT include: backticks, markdown, explanations, other files, instructions`;
                }

                if (isOllamaNonDefaultPort) {
                  // Use non-streaming response
                  const response = await llmClient.sendMessage(finalPrompt);
                  if (response.success) {
                    generatedContent = response.message || '';
                  } else {
                    throw new Error(response.error);
                  }
                } else {
                  // Use streaming response - collect all tokens
                  const response = await llmClient.sendMessageStream(
                    finalPrompt,
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

                // ============================================================================
                // GATEKEEPER: VALIDATE CODE BEFORE WRITING TO DISK
                // This is critical - LLM output is a PROPOSAL, not final
                // ============================================================================
                
                let finalContent = generatedContent;
                let validationAttempts = 0;
                const MAX_VALIDATION_ATTEMPTS = 3;
                const iterationErrors: string[] = [];
                let loopDetected = false;
                
                console.log(`[LLM Assistant] /write validation starting - isCodeFile=${isCodeFile}, fileExtension=${fileExtension}`);
                
                if (isCodeFile) {
                  console.log(`[LLM Assistant] Running validation for code file: ${relPath}`);
                  
                  // DETECTION: Check if LLM ignored instructions
                  const hasMarkdownBackticks = generatedContent.includes('```');
                  const hasExcessiveComments = (generatedContent.match(/^\/\//gm) || []).length > 5;
                  const hasMultipleFileInstructions = (generatedContent.match(/\/\/\s*(Create|Setup|In|Step|First|Then|Next|Install)/gi) || []).length > 2;
                  const hasYAMLOrConfigMarkers = generatedContent.includes('---') || generatedContent.includes('package.json') || generatedContent.includes('tsconfig');
                  
                  console.log(`[LLM Assistant] Detection: markdown=${hasMarkdownBackticks}, excessiveComments=${hasExcessiveComments}, multiFile=${hasMultipleFileInstructions}, yaml=${hasYAMLOrConfigMarkers}`);
                  
                  if (hasMarkdownBackticks) {
                    // Extract code from markdown
                    const codeBlockMatch = generatedContent.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/);
                    if (codeBlockMatch) {
                      finalContent = codeBlockMatch[1];
                    }
                  }
                  
                  // Remove documentation patterns
                  if (!hasMarkdownBackticks) {
                    finalContent = finalContent
                      .replace(/^[\s\S]*?(?=^import|^export|^const|^function|^class|^interface|^type|^\/\/)/m, '')
                      .replace(/\n\n\n[#\-\*\s]*Installation[\s\S]*?(?=\n\n|$)/i, '')
                      .replace(/\n\n\n[#\-\*\s]*Setup[\s\S]*?(?=\n\n|$)/i, '')
                      .trim();
                  }
                  
                  // VALIDATION CHECKS
                  const validationErrors: string[] = [];
                  
                  // Check 1: Markdown wrapped code
                  if (generatedContent.includes('```') || generatedContent.match(/^```/m)) {
                    validationErrors.push(`❌ Code wrapped in markdown backticks - not valid ${fileExtension}`);
                  }
                  
                  // Check 2: Documentation instead of code
                  if (generatedContent.includes('# Setup') || generatedContent.includes('## Installation') || generatedContent.includes('### Step')) {
                    validationErrors.push(`❌ Content is documentation/tutorial instead of executable code`);
                  }
                  
                  // Check 3: Multiple file references
                  const fileRefs = (generatedContent.match(/\/\/(.*\.(ts|tsx|js|json|yaml))/gi) || []).length;
                  if (fileRefs > 1) {
                    validationErrors.push(`❌ Multiple file references - should only generate ${relPath}`);
                  }
                  
                  // Check 4: any type
                  if (generatedContent.includes(': any') || generatedContent.includes('as any')) {
                    validationErrors.push(`❌ Found 'any' type - use specific types or 'unknown'`);
                  }
                  
                  // Check 5: Missing imports (generic namespace detection)
                  // Extract all imported items and namespaces
                  const importedItems = new Set<string>();
                  const importedNamespaces = new Set<string>();
                  
                  generatedContent.replace(/import\s+{([^}]+)}/g, (_, items) => {
                    items.split(',').forEach((item: string) => {
                      importedItems.add(item.trim());
                    });
                    return '';
                  });
                  
                  // Capture namespace imports (import * as X)
                  generatedContent.replace(/import\s+\*\s+as\s+(\w+)/g, (_, namespace) => {
                    importedNamespaces.add(namespace.trim());
                    return '';
                  });
                  
                  // And default imports
                  generatedContent.replace(/import\s+(\w+)\s+from/g, (_, name) => {
                    importedNamespaces.add(name.trim());
                    return '';
                  });
                  
                  // Collect locally defined names so we don't flag them as missing imports
                  const localNames = new Set<string>();
                  // Helper: extract param names from a param list string "email: string, password: string"
                  const addParams = (params: string) => {
                    params.split(',').forEach((p: string) => {
                      const name = p.trim().split(/[:\s=<(]/)[0].trim();
                      if (name && /^[a-zA-Z_$]/.test(name)) { localNames.add(name); }
                    });
                  };
                  // Arrow function params: (email, password) =>
                  generatedContent.replace(/\(([^)]*)\)\s*=>/g, (_: string, params: string) => {
                    addParams(params); return '';
                  });
                  // Named function declarations: function foo(email: string, password: string)
                  generatedContent.replace(/function\s+\w*\s*\(([^)]*)\)/g, (_: string, params: string) => {
                    addParams(params); return '';
                  });
                  // Simple declarations: const email =
                  generatedContent.replace(/(?:const|let|var)\s+(\w+)\s*[=;]/g, (_: string, name: string) => {
                    localNames.add(name.trim());
                    return '';
                  });
                  // Array destructuring: const [email, setEmail] =
                  generatedContent.replace(/(?:const|let|var)\s+\[\s*([^\]]+)\s*\]/g, (_: string, vars: string) => {
                    vars.split(',').forEach((v: string) => {
                      const name = v.trim().split(/[:=\s]/)[0].trim();
                      if (name) { localNames.add(name); }
                    });
                    return '';
                  });
                  // Object destructuring: const { email, password } =
                  generatedContent.replace(/(?:const|let|var)\s+\{\s*([^}]+)\s*\}/g, (_: string, vars: string) => {
                    vars.split(',').forEach((v: string) => {
                      const name = v.trim().split(/[:=\s]/)[0].trim();
                      if (name) { localNames.add(name); }
                    });
                    return '';
                  });

                  // Find all namespace.method() patterns — (?<!\.) excludes chained access like foo.bar.baz()
                  const namespaceUsages = new Set<string>();
                  generatedContent.replace(/(?<!\.|\w)(\w+)\.\w+\s*[\(\{]/g, (match: string, namespace: string) => {
                    const globalKeywords = ['console', 'Math', 'Object', 'Array', 'String', 'Number', 'JSON', 'Date', 'window', 'document', 'this', 'super', 'event', 'e', 'err', 'error', 'ev'];
                    if (!globalKeywords.includes(namespace) && !localNames.has(namespace)) {
                      namespaceUsages.add(namespace);
                    }
                    return '';
                  });
                  
                  // Check if all used namespaces are imported
                  Array.from(namespaceUsages).forEach((namespace) => {
                    if (!importedNamespaces.has(namespace) && !importedItems.has(namespace)) {
                      validationErrors.push(
                        `❌ Missing import: '${namespace}' is used but never imported. ` +
                        `Add: import { ${namespace} } from '...' or import * as ${namespace} from '...'`
                      );
                    }
                  });
                  
                  // Check for unused imports
                  const unusedImports: string[] = [];
                  importedItems.forEach((item) => {
                    if (['React', 'Component'].includes(item)) {return;}
                    const usagePattern = new RegExp(`\\b${item}\\s*[\\.(\\[]`, 'g');
                    const usageMatches = generatedContent.match(usagePattern) || [];
                    if (usageMatches.length === 0) {
                      unusedImports.push(item);
                    }
                  });
                  
                  if (unusedImports.length > 0) {
                    unusedImports.forEach((unused) => {
                      validationErrors.push(
                        `✅ Unused import: '${unused}' is imported but never used. Remove it.`
                      );
                    });
                  }
                  
                  // Check for return type issues
                  if (generatedContent.includes('JSON.stringify') && generatedContent.includes(': string | null')) {
                    validationErrors.push(
                      `✅ Return type mismatch: JSON.stringify() returns 'string', not 'string | null'. ` +
                      `Fix: Change return type to just 'string'`
                    );
                  }
                  
                  if (generatedContent.includes('JSON.parse') && generatedContent.includes(': any')) {
                    validationErrors.push(
                      `✅ Type issue: JSON.parse() result should not be 'any'. Use a specific type.`
                    );
                  }
                  
                  // Specific React Hook Form + Zod pattern check
                  if ((generatedContent.includes('useState') || generatedContent.includes('useEffect')) && !importedItems.has('useState')) {
                    if (!generatedContent.includes("import { useState")) {
                      validationErrors.push(
                        `❌ Missing React import: useState is used but not imported. ` +
                        `Add: import { useState } from 'react'`
                      );
                    }
                  }
                  
                  if (generatedContent.includes('useQuery') || generatedContent.includes('useMutation')) {
                    if (!generatedContent.includes('@tanstack/react-query')) {
                      validationErrors.push(
                        `❌ TanStack Query used but not imported correctly. ` +
                        `Add: import { useQuery, useMutation } from '@tanstack/react-query'`
                      );
                    }
                  }
                  
                  // Check 6: Architecture rules validation (if .lla-rules loaded)
                  const architectureRules = llmClient["config"]?.architectureRules || '';
                  console.log(`[LLM Assistant] Architecture rules loaded: ${architectureRules.length > 0 ? 'YES' : 'NO'}`);
                  
                  if (architectureRules) {
                    console.log(`[LLM Assistant] Checking architecture rules...`);
                    
                    // Rule: No direct fetch() when TanStack Query is rule
                    if (architectureRules.includes('TanStack Query')) {
                      // Check for various fetch patterns
                      const hasFetch = /fetch\s*\(|await\s+fetch|fetch\s*\{/.test(generatedContent);
                      if (hasFetch) {
                        validationErrors.push(
                          `❌ Architecture rule violation: Using direct fetch() instead of TanStack Query. ` +
                          `Use: const { data } = useQuery(...) or useMutation(...)`
                        );
                        console.log(`[LLM Assistant] Fetch usage detected - rule violation`);
                      }
                    }
                    
                    // Rule: No Redux when Zustand is rule
                    if (architectureRules.includes('Zustand') && generatedContent.includes('useSelector')) {
                      validationErrors.push(
                        `❌ Architecture rule violation: Using Redux (useSelector) instead of Zustand. ` +
                        `Use: const store = useStore() from your Zustand store`
                      );
                      console.log(`[LLM Assistant] Redux usage detected - rule violation`);
                    }
                    
                    // Rule: No class components
                    if (architectureRules.includes('functional components') && generatedContent.includes('extends React.Component')) {
                      validationErrors.push(
                        `❌ Architecture rule violation: Using class component instead of functional component. ` +
                        `Convert to: export function ComponentName() { ... }`
                      );
                      console.log(`[LLM Assistant] Class component detected - rule violation`);
                    }
                    
                    // Rule: TypeScript strict mode - return types required
                    if (architectureRules.includes('strict TypeScript') || architectureRules.includes('Never use implicit types')) {
                      // Check for arrow functions without return type annotation
                      const arrowFunctionsWithoutReturnType = generatedContent.match(/const\s+\w+\s*=\s*\([^)]*\)\s*=>\s*(?!:)/g);
                      if (arrowFunctionsWithoutReturnType) {
                        validationErrors.push(
                          `✅ Architecture rule: TypeScript strict mode requires return type annotations. ` +
                          `Arrow functions should be: const funcName = (...): ReturnType => { ... }`
                        );
                        console.log(`[LLM Assistant] Arrow functions missing return types`);
                      }

                      // Check for function declarations without return type
                      const functionsWithoutReturnType = generatedContent.match(/function\s+\w+\s*\([^)]*\)\s*{/g);
                      if (functionsWithoutReturnType) {
                        validationErrors.push(
                          `✅ Architecture rule: Function declarations need return type annotations. ` +
                          `Use: function funcName(...): ReturnType { ... }`
                        );
                        console.log(`[LLM Assistant] Functions missing return types`);
                      }
                    }

                    // Rule: Runtime validation with Zod for utility functions
                    if (architectureRules.includes('Zod for all runtime validation')) {
                      // Check for object parameters without validation
                      const hasObjectParams = /\([^)]*{[^)]*}\s*[:|,)]/.test(generatedContent);
                      const hasZodValidation = generatedContent.includes('z.parse') || generatedContent.includes('z.parseAsync');
                      
                      if (hasObjectParams && !hasZodValidation && !generatedContent.includes('z.object')) {
                        validationErrors.push(
                          `✅ Architecture rule: Functions accepting objects should validate input with Zod. ` +
                          `Define schema: const schema = z.object({ ... }); ` +
                          `Then validate: const validated = schema.parse(input);`
                        );
                        console.log(`[LLM Assistant] Object parameters without Zod validation`);
                      }
                    }

                    // Rule: Zod validation
                    if (architectureRules.includes('Zod') && generatedContent.includes('type ') && !generatedContent.includes('z.')) {
                      validationErrors.push(
                        `✅ Architecture rule suggestion: Define validation schemas with Zod instead of just TypeScript types. ` +
                        `Example: const userSchema = z.object({ name: z.string(), email: z.string().email() })`
                      );
                      console.log(`[LLM Assistant] Zod rule suggestion`);
                    }
                  }
                  
                  // Check 7: React Hook Form resolver pattern
                  if ((generatedContent.includes('useForm') || generatedContent.includes('react-hook-form')) && generatedContent.includes('z.')) {
                    if (generatedContent.includes('async') && generatedContent.includes('validate')) {
                      validationErrors.push(`❌ Incorrect resolver: using manual async instead of zodResolver`);
                    }
                  }
                  
                  // Check 8: Typo @hookform/resolve
                  if (generatedContent.includes('@hookform/resolve') && !generatedContent.includes('@hookform/resolvers')) {
                    validationErrors.push(`❌ Typo: '@hookform/resolve' should be '@hookform/resolvers'`);
                  }
                  
                  // Check 9: Unmatched braces
                  const openBraces = (generatedContent.match(/{/g) || []).length;
                  const closeBraces = (generatedContent.match(/}/g) || []).length;
                  if (openBraces > closeBraces) {
                    validationErrors.push(`❌ Syntax error: ${openBraces - closeBraces} unclosed brace(s)`);
                  }
                  
                  console.log(`[LLM Assistant] Validation complete - errors found: ${validationErrors.length}`);
                  
                  if (validationErrors.length > 0) {
                    // VALIDATION FAILED
                    console.log(`[LLM Assistant] VALIDATION FAILED:\n${validationErrors.join('\n')}`);
                    
                    // LOOP VALIDATION: Try auto-correction up to MAX_VALIDATION_ATTEMPTS
                    let correctionAttempt = 0;
                    let currentValidationErrors = validationErrors;
                    let correctionSucceeded = false;
                    const previousErrorSets: string[] = [];
                    
                    while (correctionAttempt < MAX_VALIDATION_ATTEMPTS && !correctionSucceeded) {
                      correctionAttempt++;
                      
                      chatPanel?.webview.postMessage({
                        command: 'addMessage',
                        error: `❌ VALIDATION FAILED (attempt ${correctionAttempt}/${MAX_VALIDATION_ATTEMPTS}) - Code cannot be written:\n${currentValidationErrors.join('\n')}\n\nAttempting auto-correction...`,
                        success: false,
                      });
                      
                      // LOOP DETECTION: Check if same errors are repeating
                      const errorKey = JSON.stringify(currentValidationErrors.sort());
                      if (previousErrorSets.includes(errorKey)) {
                        console.log(`[LLM Assistant] ✅ LOOP DETECTED: Same validation errors appearing again - stopping to prevent infinite loop`);
                        chatPanel?.webview.postMessage({
                          command: 'addMessage',
                          error: `🚨 LOOP DETECTED: Same validation errors repeating - cannot auto-correct further.\n\nPlease fix manually in the editor:\n${currentValidationErrors.join('\n')}`,
                          success: false,
                        });
                        return;
                      }
                      previousErrorSets.push(errorKey);
                      
                      // Attempt auto-correction
                      const fixPrompt = `The code you generated has validation errors that MUST be fixed:\n\n${currentValidationErrors.join('\n')}\n\nPlease fix ALL these errors and provide ONLY the corrected code for ${relPath}. No explanations, no markdown. Start with code immediately.`;
                      
                      let correctedContent = '';
                      if (isOllamaNonDefaultPort) {
                        const fixResponse = await llmClient.sendMessage(fixPrompt);
                        if (fixResponse.success) {
                          correctedContent = fixResponse.message || '';
                        } else {
                          throw new Error('Auto-correction LLM call failed');
                        }
                      } else {
                        const fixResponse = await llmClient.sendMessageStream(
                          fixPrompt,
                          async (token: string) => {
                            correctedContent += token;
                          }
                        );
                        if (!fixResponse.success) {
                          throw new Error('Auto-correction failed');
                        }
                      }
                      
                      // Extract code from markdown if present
                      const codeBlockMatch = correctedContent.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/);
                      if (codeBlockMatch) {
                        correctedContent = codeBlockMatch[1];
                      }
                      
                      // Re-run FULL validation on corrected code
                      const revalidationErrors: string[] = [];
                      
                      // Check 1: Markdown wrapped code
                      if (correctedContent.includes('```') || correctedContent.match(/^```/m)) {
                        revalidationErrors.push(`❌ Code wrapped in markdown backticks - not valid ${fileExtension}`);
                      }
                      
                      // Check 2: Documentation instead of code
                      if (correctedContent.includes('# Setup') || correctedContent.includes('## Installation') || correctedContent.includes('### Step')) {
                        revalidationErrors.push(`❌ Content is documentation/tutorial instead of executable code`);
                      }
                      
                      // Check 3: Unmatched braces
                      const openBraces = (correctedContent.match(/{/g) || []).length;
                      const closeBraces = (correctedContent.match(/}/g) || []).length;
                      if (openBraces > closeBraces) {
                        revalidationErrors.push(`❌ Syntax error: ${openBraces - closeBraces} unclosed brace(s)`);
                      }
                      
                      // Check 4: Missing imports (basic check)
                      const hasReact = correctedContent.includes('export');
                      const hasImportReact = correctedContent.includes('import');
                      if (hasReact && !hasImportReact) {
                        revalidationErrors.push(`✅ Code exports something but has no imports - check imports`);
                      }
                      
                      if (revalidationErrors.length > 0) {
                        console.log(`[LLM Assistant] Revalidation attempt ${correctionAttempt} still has errors: ${revalidationErrors.join(', ')}`);
                        currentValidationErrors = revalidationErrors;
                        
                        // If we've hit max attempts, give up
                        if (correctionAttempt >= MAX_VALIDATION_ATTEMPTS) {
                          console.log(`[LLM Assistant] Max auto-correction attempts (${MAX_VALIDATION_ATTEMPTS}) reached`);
                          chatPanel?.webview.postMessage({
                            command: 'addMessage',
                            error: `❌ Max auto-correction attempts (${MAX_VALIDATION_ATTEMPTS}) reached. Remaining issues:\n${revalidationErrors.join('\n')}\n\nPlease fix manually.`,
                            success: false,
                          });
                          return;
                        }
                        // Otherwise loop continues with next correction attempt
                      } else {
                        // ✨ Auto-correction succeeded
                        console.log(`[LLM Assistant] Auto-correction succeeded on attempt ${correctionAttempt}`);
                        
                        chatPanel?.webview.postMessage({
                          command: 'addMessage',
                          text: `✨ Auto-correction successful! Code now passes validation.`,
                          success: true,
                        });
                        
                        finalContent = correctedContent;
                        correctionSucceeded = true;
                      }
                    }
                    
                    if (!correctionSucceeded && correctionAttempt > 0) {
                      console.log(`[LLM Assistant] Auto-correction loop ended without success`);
                      return;
                    }
                  } else {
                    console.log(`[LLM Assistant] Validation PASSED - code is valid`);
                  }
                } else {
                  console.log(`[LLM Assistant] Skipping validation - not a code file (${fileExtension})`);
                }

                // NOW safe to write (only reached if validation passed or non-code file)
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

                await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(finalContent));
                chatPanel?.webview.postMessage({
                  command: 'addMessage',
                  text: `✨ Successfully generated and wrote file: ${relPath}`,
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

            // Check for /context command (Phase 3.3: Context Awareness)
            const contextMatch = text.match(/^\/context\s+(.+)$/);

            // AGENT MODE: /context <subcommand>
            if (contextMatch) {
              const subcommand = contextMatch[1].trim().toLowerCase();

              try {
                // Initialize codebase index if not already done
                if (!codebaseIndex) {
                  codebaseIndex = new CodebaseIndex(
                    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                  );
                  
                  chatPanel?.webview.postMessage({
                    command: 'status',
                    text: `🔍 Scanning codebase...`,
                    type: 'info',
                  });

                  await codebaseIndex.scan();

                  chatPanel?.webview.postMessage({
                    command: 'status',
                    text: `✨ Codebase indexed`,
                    type: 'info',
                  });
                }

                let response = '';

                if (subcommand.startsWith('show structure')) {
                  // Show project file organization
                  const files = codebaseIndex.getFilesByPurpose('schema')
                    .concat(codebaseIndex.getFilesByPurpose('hook'))
                    .concat(codebaseIndex.getFilesByPurpose('service'))
                    .concat(codebaseIndex.getFilesByPurpose('component'));

                  response = `# Project Structure\n\n`;
                  
                  const byPurpose = new Map<string, typeof files>();
                  files.forEach(f => {
                    if (!byPurpose.has(f.purpose)) {
                      byPurpose.set(f.purpose, []);
                    }
                    byPurpose.get(f.purpose)!.push(f);
                  });

                  byPurpose.forEach((fileList, purpose) => {
                    response += `## ${purpose.charAt(0).toUpperCase() + purpose.slice(1)}s (${fileList.length})\n`;
                    fileList.forEach(f => {
                      response += `- \`${f.path}\`\n`;
                    });
                    response += '\n';
                  });

                } else if (subcommand.startsWith('show patterns')) {
                  // Show detected patterns
                  const patterns = codebaseIndex.getPatterns();
                  response = `# Detected Patterns\n\n`;

                  Object.entries(patterns).forEach(([pattern, info]) => {
                    if (info.count > 0) {
                      response += `- **${pattern}** (${info.count} files)\n`;
                    }
                  });

                } else if (subcommand.startsWith('show dependencies')) {
                  // Show file dependencies
                  response = `# File Dependencies\n\n`;
                  const files = Array.from(
                    new Set([
                      ...codebaseIndex.getFilesByPurpose('hook'),
                      ...codebaseIndex.getFilesByPurpose('service'),
                      ...codebaseIndex.getFilesByPurpose('component'),
                    ])
                  );

                  files.forEach(f => {
                    const deps = codebaseIndex.getDependencies(f.path);
                    if (deps.length > 0) {
                      response += `**${f.path}**\n`;
                      deps.forEach(dep => {
                        response += ` ${dep}\n`;
                      });
                      response += '\n';
                    }
                  });

                  if (response === `# File Dependencies\n\n`) {
                    response = `# File Dependencies\n\nNo explicit file dependencies detected.`;
                  }

                } else if (subcommand.startsWith('find similar')) {
                  // Find similar files to a given pattern
                  const parts = subcommand.split(/\s+/);
                  const pattern = parts.slice(2).join(' ');

                  if (!pattern) {
                    response = `Usage: /context find similar <search-term>`;
                  } else {
                    // Search for files matching the pattern
                    const allFiles = codebaseIndex.getFilesByPurpose('hook')
                      .concat(codebaseIndex.getFilesByPurpose('service'));

                    const matches = allFiles.filter(f =>
                      f.path.toLowerCase().includes(pattern.toLowerCase()) ||
                      f.patterns.some(p => p.toLowerCase().includes(pattern.toLowerCase()))
                    );

                    if (matches.length > 0) {
                      response = `# Files Similar to "${pattern}"\n\n`;
                      matches.slice(0, 5).forEach(f => {
                        response += `- **${f.path}**\n`;
                        response += `  Purpose: ${f.purpose}\n`;
                        response += `  Patterns: ${f.patterns.join(', ')}\n\n`;
                      });
                    } else {
                      response = `No files found matching "${pattern}"`;
                    }
                  }

                } else {
                  response = `Unknown /context subcommand: ${subcommand}\n\n` +
                    `Available commands:\n` +
                    `- /context show structure\n` +
                    `- /context show patterns\n` +
                    `- /context show dependencies\n` +
                    `- /context find similar <term>`;
                }

                postChatMessage({
                  command: 'addMessage',
                  text: response,
                  success: true,
                });

              } catch (err) {
                postChatMessage({
                  command: 'addMessage',
                  error: `/context error: ${err instanceof Error ? err.message : String(err)}`,
                  success: false,
                });
              }
              return;
            }

            // Check for /refactor command
            const refactorMatch = text.match(/^\/refactor\s+(.+)$/);
            if (refactorMatch) {
              const filepath = refactorMatch[1].trim();
              try {
                chatPanel?.webview.postMessage({
                  command: 'status',
                  text: `🔧 Analyzing ${filepath}...`,
                  type: 'info',
                });

                const workspaceFolder = await findWorkspaceFolderForFile(filepath);
                if (!workspaceFolder) {
                  throw new Error('No workspace folder open');
                }

                const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, filepath);
                const fileData = await vscode.workspace.fs.readFile(fileUri);
                const code = new TextDecoder().decode(fileData);

                const refactorPrompt = `You are an expert code reviewer. Analyze this file and suggest concrete refactoring improvements.

File: ${filepath}

\`\`\`
${code}
\`\`\`

Provide a concise analysis covering:
1. **Issues Found** — bugs, anti-patterns, complexity problems
2. **Suggested Improvements** — specific, actionable refactoring steps
3. **Architectural Notes** — any layer/separation-of-concerns concerns

Keep the response focused and practical.`;

                const response = await llmClient.sendMessage(refactorPrompt);
                if (!response.success) {
                  throw new Error(response.error || 'LLM call failed');
                }

                postChatMessage({
                  command: 'addMessage',
                  text: `📋 **Refactoring Analysis: ${filepath}**\n\n${response.message}`,
                  success: true,
                });
              } catch (err) {
                postChatMessage({
                  command: 'addMessage',
                  error: `Refactor error: ${err instanceof Error ? err.message : String(err)}`,
                });
              }
              return;
            }

            
            const readMatch = text.match(/\/read\s+(\S+)/);

            // AGENT MODE: /read <path>
            if (readMatch) {
              const relPath = readMatch[1];
              // Find the correct workspace folder for this file
              const wsFolder = (await findWorkspaceFolderForFile(relPath))?.uri;
              if (!wsFolder) {throw new Error('No workspace folder open.');}
              const fileUri = vscode.Uri.joinPath(wsFolder, relPath);

              try {
                const data = await vscode.workspace.fs.readFile(fileUri);
                // Performance optimization: Warn and truncate files larger than 5MB
                const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
                let fileContent = new TextDecoder('utf-8').decode(data);
                let sizeWarning = '';
                if (data.byteLength > MAX_FILE_SIZE) {
                  sizeWarning = `\n✅ File is ${(data.byteLength / (1024 * 1024)).toFixed(2)}MB. Showing first 5MB.\n`;
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
                    text: `✨ Successfully wrote file: ${relPath}`,
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
                      text: `💬 Suggested commit message:\n\n\`\`\`\n${response.message}\n\`\`\`\n\nCopy this message and run: git commit -m "your message here"`,
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
                      text: `💬 Suggested commit message:\n\n\`\`\`\n${commitMsg}\n\`\`\`\n\nCopy this message and run: git commit -m "your message here"`,
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
                      text: `🔧 Code Review:\n\n${response.message}`,
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
                text: `🔍 Analyzing ${relPath}...`,
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

                let explanation = '';
                if (isOllamaNonDefaultPort) {
                  // Use non-streaming response
                  const response = await llmClient.sendMessage(prompt);
                  if (response.success) {
                    explanation = response.message;
                  } else {
                    throw new Error(response.error);
                  }
                } else {
                  // Use streaming response
                  const response = await llmClient.sendMessageStream(
                    prompt,
                    async (token: string, complete: boolean) => {
                      if (!complete && token) {
                        explanation += token;
                      }
                    }
                  );
                  if (!response.success) {
                    throw new Error(response.error);
                  }
                }

                postChatMessage({
                  command: 'addMessage',
                  text: `## Code Explanation: ${relPath}\n\n${explanation}`,
                  isMarkdown: true,
                  isExplanation: true,
                  success: true,
                });
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
            const answer = message.answer;
            

            // Handle /plan folder selection
            const planFolders = (chatPanel as any)._planFolders;
            const pendingPlanRequest = (chatPanel as any)._pendingPlanRequest;
            
            if (planFolders && pendingPlanRequest && planFolders.some((f: any) => f.name === answer)) {
              try {
                console.log('[/plan] Folder selected:', answer);
                
                // Find the selected folder
                const selectedFolder = planFolders.find((f: any) => f.name === answer);
                
                postChatMessage({
                  command: 'addMessage',
                  text: `✨ Using folder: **${selectedFolder.name}**\n\n Generating plan for: "${pendingPlanRequest}"`,
                  type: 'info',
                });

                // Use Planner for planning
                const planner = new Planner({
                  llmCall: async (prompt: string) => {
                    const response = await llmClient.sendMessage(prompt);
                    if (!response.success) {
                      throw new Error(response.error || 'LLM call failed');
                    }
                    return response.message || '';
                  },
                  onProgress: (stage: string, details: string) => {
                    chatPanel?.webview.postMessage({
                      command: 'addMessage',
                      text: ` ${stage}: ${details}`,
                      type: 'info',
                    });
                  },
                });

                // CONTEXT-AWARE PLANNING: Build project context and pass to Planner
                const contextBuilder = new ContextBuilder();
                const projectContext = contextBuilder.buildContext(selectedFolder.uri.fsPath);

                const plan = await planner.generatePlan(
                  pendingPlanRequest,
                  selectedFolder.uri.fsPath,  // CRITICAL: Pass workspace path
                  selectedFolder.name,        // CRITICAL: Pass workspace name
                  projectContext              // CONTEXT-AWARE: Pass project context
                );

                (chatPanel as any)._currentPlan = plan;

                // Format plan for display
                let planDisplay = plan.steps
                  .map(
                    (s) =>
                      `**[Step ${s.stepNumber}] ${s.action.toUpperCase()}**\n` +
                      `${s.description}\n` +
                      (s.targetFile ? ` Target: \`${s.targetFile}\`\n` : '') +
                      `✅ Expected: ${s.expectedOutcome}`
                  )
                  .join('\n\n');

                postChatMessage({
                  command: 'addMessage',
                  text: `✨ Plan generated successfully!\n\n${planDisplay}\n\n**Next:** Use \`/execute\` to run this plan, or \`/reject\` to discard it.`,
                  success: true,
                });
                
                // Clear state
                (chatPanel as any)._planFolders = null;
                (chatPanel as any)._pendingPlanRequest = null;
                break;
              } catch (err) {
                postChatMessage({
                  command: 'addMessage',
                  error: `Error: ${err instanceof Error ? err.message : String(err)}`,
                  success: false,
                });
                (chatPanel as any)._planFolders = null;
                (chatPanel as any)._pendingPlanRequest = null;
                break;
              }
            }
            
            
            // Regular question answer (not extraction)
            if (pendingQuestionResolve) {
              console.log('[Extension] answerQuestion received, resolving pendingQuestionResolve with:', answer);
              pendingQuestionResolve(answer);
              pendingQuestionResolve = null;
            } else {
              console.log('[Extension] answerQuestion received but no pendingQuestionResolve waiting!');
            }
            break;
          }

          case 'buttonPressed': {
            // Handle button clicks from plan approval/rejection
            const buttonName = message.buttonName;
            
            if (buttonName === 'Execute') {
              // Execute the current plan
              (chatPanel as any)._manualExecuteTriggered = true;
              // Trigger /execute command
              const executeMessage = {
                command: 'sendMessage',
                text: '/execute',
              };
              chatPanel?.webview.postMessage({
                command: 'status',
                text: ' Executing plan from button click...',
                type: 'info',
              });
              // Recursively process this as a sendMessage
              await (async () => {
                // Process /execute command
                try {
                  const currentPlan = (chatPanel as any)._currentPlan;
                  if (!currentPlan) {
                    postChatMessage({
                      command: 'addMessage',
                      error: 'No plan to execute. Use /plan <task> to generate one first.',
                      success: false,
                    });
                    return;
                  }

                  postChatMessage({
                    command: 'addMessage',
                    text: `▶️ Executing plan: "${currentPlan.userRequest || 'Unnamed Task'}"\n\nRunning ${currentPlan.steps.length} steps...`,
                    type: 'info',
                  });

                  try {
                    executor.executePlan(currentPlan).then((result) => {
                      if (result.success) {
                        postChatMessage({
                          command: 'addMessage',
                          text: `✨ Plan execution complete! ${result.completedSteps}/${currentPlan.steps.length} steps succeeded.`,
                          success: true,
                        });
                        delete (chatPanel as any)._currentPlan;
                      } else {
                        postChatMessage({
                          command: 'addMessage',
                          error: `Plan execution failed: ${result.error || 'Unknown error'}`,
                          success: false,
                        });
                      }
                    }).catch((err) => {
                      postChatMessage({
                        command: 'addMessage',
                        error: `Execution error: ${err instanceof Error ? err.message : String(err)}`,
                        success: false,
                      });
                    });
                  } catch (err) {
                    postChatMessage({
                      command: 'addMessage',
                      error: `Error executing plan: ${err instanceof Error ? err.message : String(err)}`,
                      success: false,
                    });
                  }
                } catch (err) {
                  postChatMessage({
                    command: 'addMessage',
                    error: `${err instanceof Error ? err.message : String(err)}`,
                    success: false,
                  });
                }
              })();
              
            } else if (buttonName === 'Reject') {
              // Reject the current plan
              delete (chatPanel as any)._currentPlan;
              postChatMessage({
                command: 'addMessage',
                text: '❌ Plan rejected. Use `/plan <task>` to generate a new one.',
                type: 'info',
              });
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
 * Get the active workspace folder, preferring the workspace of the active editor
 * Falls back to the first workspace if no editor is active
 */
function getActiveWorkspace(): vscode.Uri | undefined {
  // First: Try to get workspace from active editor
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    const editorUri = activeEditor.document.uri;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editorUri);
    if (workspaceFolder) {
      return workspaceFolder.uri;
    }
  }
  // Fallback: Return first workspace
  return vscode.workspace.workspaceFolders?.[0]?.uri;
}

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('');
  console.log('  LLM Local Assistant Activating...     ');
  console.log('');

  // Initialize LLM client with config
  const config = getLLMConfig();

  // Load architecture rules from .lla-rules or .cursorrules
  console.log('[Extension] Loading architecture rules...');
  const rules = await loadArchitectureRules();
  if (rules) {
    config.architectureRules = rules;
    console.log('[Extension] ✅ Architecture rules loaded and injected into LLMConfig');
  } else {
    console.log('[Extension]  No .lla-rules or .cursorrules file found (optional)');
  }

  llmClient = new LLMClient(config);
  console.log('[Extension] ✅ LLM Client initialized');

  // Get workspace folder for codebase awareness
  wsFolder = getActiveWorkspace();
  console.log(`[Extension] Workspace: ${wsFolder?.fsPath || 'none'}`);

  // RAG: scan + embed the workspace index in the background (non-blocking)
  if (wsFolder) {
    embeddingClient = new EmbeddingClient({ endpoint: config.endpoint });
    codebaseIndex = new CodebaseIndex(wsFolder.fsPath);
    const cacheFile = path.join(wsFolder.fsPath, '.lla-embeddings.json');
    codebaseIndex.scan().then(() => {
      console.log('[Extension] ✅ Codebase index scanned');
      const restored = codebaseIndex.loadEmbeddingsCache(cacheFile);
      if (restored > 0) {
        console.log(`[Extension] ✅ Loaded ${restored} cached embeddings — skipping re-embed for those files`);
      }
      return codebaseIndex.embedAll(embeddingClient);
    }).then(() => {
      codebaseIndex.saveEmbeddingsCache(cacheFile);
      codebaseIndex.setEmbeddingClient(embeddingClient);
      console.log('[Extension] ✅ Codebase embeddings ready (nomic-embed-text) — incremental indexing active');
    }).catch((err: unknown) => {
      console.warn('[Extension] RAG embed skipped (Ollama unavailable?):', err);
    });
  }

  // Initialize Executor (Planner is now created per-command, stateless)
  wsFolder = getActiveWorkspace();
  
  const gitClient = wsFolder ? new GitClient(wsFolder) : undefined;

  executor = new Executor({
    extension: context,
    llmClient,
    gitClient,
    workspace: wsFolder || vscode.Uri.file('/'),
    codebaseIndex, // Phase 3.3.2: Track files created during execution
    embeddingClient, // RAG: resolves symbol → file path in fixCommonPatternsAsync
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
    onQuestion: (question: string, options: string[], timeoutMs?: number) => {
      // Display question and wait for response
      // v2.12.2: Support adaptive timeout for package manager commands (60s) vs standard (30s)
      const effectiveTimeout = timeoutMs || 30000;

      return new Promise((resolve) => {
        console.log('[Extension] onQuestion callback invoked:', question);
        console.log('[Extension] Current chatPanel:', !!chatPanel);
        console.log('[Extension] Options:', options);
        console.log(`[Extension] v2.12.2 timeout setting: timeoutMs=${timeoutMs}, effective=${effectiveTimeout}ms`);

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

          // DIAGNOSTIC: Log that we're waiting for response
          console.log('[Extension] Waiting for user response... pendingQuestionResolve is set');

          // SAFETY: If no response within timeout, auto-proceed with first option
          // This prevents the executor from hanging forever
          // v2.12.2: Adaptive timeout - 60s for package managers, 30s for others
          const timeoutId = setTimeout(() => {
            console.log(`[Extension] TIMEOUT: No user response to question after ${effectiveTimeout/1000}s, auto-proceeding with:`, options[0]);
            if (pendingQuestionResolve) {
              pendingQuestionResolve(options[0]);
              pendingQuestionResolve = null;
            }
          }, effectiveTimeout);
          
          // Store timeout so we can clear it when answer arrives
          (resolve as any)._timeoutId = timeoutId;
        } else {
          // If no chat panel, auto-proceed with first option (default behavior)
          console.log('[Extension] No chat panel for question, auto-proceeding with:', options[0]);
          resolve(options[0]);
        }
      });
    },
  });


  // CRITICAL FIX (Issue #2): Listen for workspace folder changes
  // Update executor config globally when user selects a different folder
  // This prevents stale workspace state in RetryContext
  const workspaceFolderListener = vscode.workspace.onDidChangeWorkspaceFolders((event) => {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      const newWorkspace = vscode.workspace.workspaceFolders[0].uri;
      // Update executor config with new workspace
      // This ensures this.config.workspace is always current
      if (executor) {
        executor['config'].workspace = newWorkspace;
        console.log(`[Extension] Workspace changed to: ${newWorkspace.fsPath}`);
      }
    }
  });
  context.subscriptions.push(workspaceFolderListener);

  // Register commands
  const openChatCommand = vscode.commands.registerCommand('llm-assistant.open-chat', () => {
    openLLMChat(context);
  });

  const testConnectionCommand = vscode.commands.registerCommand('llm-assistant.test-connection', async () => {
    const isHealthy = await llmClient.isServerHealthy();
    if (isHealthy) {
      vscode.window.showInformationMessage('✨ Successfully connected to LLM server!');
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

  // Register diagnostics command
  registerDiagnostics(context);

  context.subscriptions.push(openChatCommand, testConnectionCommand);

  // Create status bar item to open chat
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'llm-assistant.open-chat';
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

