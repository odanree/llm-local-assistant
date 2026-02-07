// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';
import { LLMClient, LLMConfig } from './llmClient';
import { GitClient } from './gitClient';
import { Planner } from './planner';
import GatekeeperValidator from './gatekeeperValidator';
import { Executor } from './executor';
import CodebaseIndex from './codebaseIndex';
import { getWebviewContent } from './webviewContent';
import { ArchitecturePatterns } from './architecturePatterns';
import { FeatureAnalyzer } from './featureAnalyzer';
import { ServiceExtractor } from './serviceExtractor';
import { RefactoringExecutor } from './refactoringExecutor';
import * as path from 'path';

let llmClient: LLMClient;
let planner: Planner;
let executor: Executor;
let codebaseIndex: CodebaseIndex;
let architecturePatterns: ArchitecturePatterns;
let featureAnalyzer: FeatureAnalyzer;
let serviceExtractor: ServiceExtractor;
let refactoringExecutor: RefactoringExecutor;
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
          `📚 **Codebase Context:**\n` +
          `- /context show structure — Show project file organization\n` +
          `- /context show patterns — Show detected code patterns\n` +
          `- /context show dependencies — Show file dependencies\n` +
          `- /context find similar <file> — Find similar files\n\n` +
          `🔧 **Refactoring & Architecture:**\n` +
          `- /refactor <file> — Analyze and suggest improvements\n` +
          `- /extract-service <hook> <name> — Extract business logic to service\n` +
          `- /design-system <feature> — Generate full feature architecture\n` +
          `- /rate-architecture — Score codebase quality (0-10)\n` +
          `- /suggest-patterns — Show pattern improvements\n\n` +
          `📄 **File Operations:**\n` +
          `- /read <path> — Read a file from workspace\n` +
          `- /write <path> <prompt> — Generate and write file content\n` +
          `- /suggestwrite <path> <prompt> — Preview before writing\n` +
          `- /explain <path> — Generate detailed code explanation\n\n` +
          `📝 **Git Integration:**\n` +
          `- /git-commit-msg — Generate commit message from staged changes\n` +
          `- /git-review [staged|unstaged|all] — Review code changes with AI\n\n` +
          `🔍 **Diagnostics:**\n` +
          `- /check-model — Show configured model and available models on server`,
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
                
                let response = `🔍 **Model Configuration**\n\n`;
                response += `**Endpoint:** \`${modelInfo.endpoint}\`\n\n`;
                response += `**Configured Model:** \`${modelInfo.configuredModel}\`\n\n`;
                
                if (modelInfo.availableModels.length > 0) {
                  response += `**Available Models on Server:**\n`;
                  modelInfo.availableModels.forEach(model => {
                    const isCurrent = model === modelInfo.configuredModel;
                    response += `- \`${model}\`${isCurrent ? ' ✅ (configured)' : ''}\n`;
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
                  
                  // Find all namespace.method() patterns
                  const namespaceUsages = new Set<string>();
                  generatedContent.replace(/(\w+)\.\w+\s*[\(\{]/g, (match, namespace) => {
                    const globalKeywords = ['console', 'Math', 'Object', 'Array', 'String', 'Number', 'JSON', 'Date', 'window', 'document', 'this', 'super'];
                    if (!globalKeywords.includes(namespace)) {
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
                    if (['React', 'Component'].includes(item)) return;
                    const usagePattern = new RegExp(`\\b${item}\\s*[\\.(\\[]`, 'g');
                    const usageMatches = generatedContent.match(usagePattern) || [];
                    if (usageMatches.length === 0) {
                      unusedImports.push(item);
                    }
                  });
                  
                  if (unusedImports.length > 0) {
                    unusedImports.forEach((unused) => {
                      validationErrors.push(
                        `⚠️ Unused import: '${unused}' is imported but never used. Remove it.`
                      );
                    });
                  }
                  
                  // Check for return type issues
                  if (generatedContent.includes('JSON.stringify') && generatedContent.includes(': string | null')) {
                    validationErrors.push(
                      `⚠️ Return type mismatch: JSON.stringify() returns 'string', not 'string | null'. ` +
                      `Fix: Change return type to just 'string'`
                    );
                  }
                  
                  if (generatedContent.includes('JSON.parse') && generatedContent.includes(': any')) {
                    validationErrors.push(
                      `⚠️ Type issue: JSON.parse() result should not be 'any'. Use a specific type.`
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
                          `⚠️ Architecture rule: TypeScript strict mode requires return type annotations. ` +
                          `Arrow functions should be: const funcName = (...): ReturnType => { ... }`
                        );
                        console.log(`[LLM Assistant] Arrow functions missing return types`);
                      }

                      // Check for function declarations without return type
                      const functionsWithoutReturnType = generatedContent.match(/function\s+\w+\s*\([^)]*\)\s*{/g);
                      if (functionsWithoutReturnType) {
                        validationErrors.push(
                          `⚠️ Architecture rule: Function declarations need return type annotations. ` +
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
                          `⚠️ Architecture rule: Functions accepting objects should validate input with Zod. ` +
                          `Define schema: const schema = z.object({ ... }); ` +
                          `Then validate: const validated = schema.parse(input);`
                        );
                        console.log(`[LLM Assistant] Object parameters without Zod validation`);
                      }
                    }

                    // Rule: Zod validation
                    if (architectureRules.includes('Zod') && generatedContent.includes('type ') && !generatedContent.includes('z.')) {
                      validationErrors.push(
                        `⚠️ Architecture rule suggestion: Define validation schemas with Zod instead of just TypeScript types. ` +
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
                    
                    chatPanel?.webview.postMessage({
                      command: 'addMessage',
                      error: `❌ VALIDATION FAILED - Code cannot be written:\n${validationErrors.join('\n')}\n\nAttempting auto-correction...`,
                      success: false,
                    });
                    
                    // Attempt auto-correction
                    const fixPrompt = `The code you generated has validation errors that MUST be fixed:\n\n${validationErrors.join('\n')}\n\nPlease fix ALL these errors and provide ONLY the corrected code for ${relPath}. No explanations, no markdown. Start with code immediately.`;
                    
                    let correctedContent = '';
                    if (isOllamaNonDefaultPort) {
                      const fixResponse = await llmClient.sendMessage(fixPrompt);
                      if (fixResponse.success) {
                        correctedContent = fixResponse.message || '';
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
                    
                    // Re-validate corrected code (simplified check)
                    const revalidationErrors: string[] = [];
                    if (correctedContent.includes('```')) {
                      revalidationErrors.push('Still has markdown backticks');
                    }
                    if ((correctedContent.match(/{/g) || []).length > (correctedContent.match(/}/g) || []).length) {
                      revalidationErrors.push('Still has unmatched braces');
                    }
                    
                    if (revalidationErrors.length > 0) {
                      console.log(`[LLM Assistant] Auto-correction failed: ${revalidationErrors.join(', ')}`);
                      
                      chatPanel?.webview.postMessage({
                        command: 'addMessage',
                        error: `❌ Auto-correction incomplete:\n${revalidationErrors.join('\n')}\n\nPlease fix manually.`,
                        success: false,
                      });
                      return;
                    }
                    
                    // Auto-correction succeeded
                    console.log(`[LLM Assistant] Auto-correction succeeded`);
                    
                    chatPanel?.webview.postMessage({
                      command: 'addMessage',
                      text: `✅ Auto-correction successful! Code now passes validation.`,
                      success: true,
                    });
                    
                    finalContent = correctedContent;
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
                  text: `✅ Successfully generated and wrote file: ${relPath}`,
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
                    text: `📚 Scanning codebase...`,
                    type: 'info',
                  });

                  await codebaseIndex.scan();

                  chatPanel?.webview.postMessage({
                    command: 'status',
                    text: `✅ Codebase indexed`,
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
                        response += `→ ${dep}\n`;
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

            // PHASE 3.4.5: New refactoring commands

            // Check for /refactor command
            const refactorMatch = text.match(/^\/refactor\s+(.+)$/);
            if (refactorMatch) {
              const filepath = refactorMatch[1].trim();
              try {
                chatPanel?.webview.postMessage({
                  command: 'status',
                  text: `🔍 Analyzing ${filepath}...`,
                  type: 'info',
                });

                // Read file
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                  throw new Error('No workspace folder open');
                }

                const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, filepath);
                const fileData = await vscode.workspace.fs.readFile(fileUri);
                const code = new TextDecoder().decode(fileData);

                // FIXED: Use semantic analysis instead of regex-based analysis
                console.log('[Extension] /refactor: Starting semantic analysis...');
                const semanticAnalysis = await featureAnalyzer.analyzeHookSemantically(code);
                console.log('[Extension] /refactor: Semantic analysis complete - Complexity:', semanticAnalysis.overallComplexity);
                
                // Build detailed report
                let report = `📊 **Refactoring Analysis: ${filepath}**\n\n`;
                report += `**Overall Complexity:** ${semanticAnalysis.overallComplexity}\n\n`;
                
                if (semanticAnalysis.issues.length > 0) {
                  report += `**Issues Found:**\n${semanticAnalysis.issues.map(i => `- ${i}`).join('\n')}\n\n`;
                }
                
                if (semanticAnalysis.unusedStates.length > 0) {
                  report += `**Unused States:**\n${
                    semanticAnalysis.unusedStates.map(s => `- ${s.name}: ${s.description}`).join('\n')
                  }\n\n`;
                }
                
                if (semanticAnalysis.dependencyIssues.length > 0) {
                  report += `**Dependency Issues:**\n${
                    semanticAnalysis.dependencyIssues.map(d => {
                      let msg = `- Line ${d.effect}: ${d.description}`;
                      if (d.missing.length > 0) msg += ` [Missing: ${d.missing.join(', ')}]`;
                      return msg;
                    }).join('\n')
                  }\n\n`;
                }
                
                if (semanticAnalysis.couplingProblems.length > 0) {
                  report += `**Coupling Problems:**\n${
                    semanticAnalysis.couplingProblems.map(c => `- ${c.type}: ${c.suggestion}`).join('\n')
                  }\n\n`;
                }
                
                if (semanticAnalysis.suggestedExtractions.length > 0) {
                  report += `**Suggested Extractions:**\n${
                    semanticAnalysis.suggestedExtractions.map(s => `- ${s}`).join('\n')
                  }\n\n`;
                  
                  // Add command line options for each extraction
                  report += `**Quick Extract Commands:**\n`;
                  semanticAnalysis.suggestedExtractions.forEach((extraction, idx) => {
                    // Parse extraction suggestion to get service name
                    // e.g., "Extract API logic to useApi hook" -> "useApi"
                    // Try to find camelCase words (useXxx) or PascalCase (Xxx)
                    let serviceName = '';
                    
                    // First try: match 'to <serviceName>' pattern
                    const toMatch = extraction.match(/\bto\s+(\w+)/i);
                    if (toMatch && toMatch[1]) {
                      serviceName = toMatch[1];
                    }
                    
                    // Second try: match camelCase starting with 'use' (useApi, useFilter)
                    if (!serviceName) {
                      const useMatch = extraction.match(/\b(use\w+)\b/i);
                      if (useMatch && useMatch[1]) {
                        serviceName = useMatch[1];
                      }
                    }
                    
                    // Fallback
                    if (!serviceName) {
                      serviceName = `service${idx + 1}`;
                    }
                    
                    report += `\`/extract-service ${filepath} ${serviceName}\`\n`;
                  });
                  report += `\n`;
                }
                
                postChatMessage({
                  command: 'addMessage',
                  text: report,
                  success: true,
                });

                // If there are suggested extractions, show buttons to apply them
                if (semanticAnalysis.suggestedExtractions.length > 0) {
                  // Store analysis for extraction buttons
                  (chatPanel as any)._currentRefactorData = {
                    filepath,
                    code,
                    analysis: semanticAnalysis,
                  };

                  postChatMessage({
                    command: 'question',
                    question: `Would you like to extract a service?`,
                    options: semanticAnalysis.suggestedExtractions.map(s => `Extract: ${s}`),
                  });
                }
              } catch (err) {
                postChatMessage({
                  command: 'addMessage',
                  error: `Refactor error: ${err instanceof Error ? err.message : String(err)}`,
                });
              }
              return;
            }

            // Check for /extract-service command
            const extractMatch = text.match(/^\/extract-service\s+(\S+)\s+(.+)$/);
            if (extractMatch) {
              const hookFile = extractMatch[1].trim();
              const serviceName = extractMatch[2].trim();
              try {
                chatPanel?.webview.postMessage({
                  command: 'status',
                  text: `🔄 Extracting service from ${hookFile}...`,
                  type: 'info',
                });

                // Read file
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                  throw new Error('No workspace folder open');
                }

                const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, hookFile);
                const fileData = await vscode.workspace.fs.readFile(fileUri);
                const code = new TextDecoder().decode(fileData);

                // Extract service using LLM-based extraction
                const extraction = await serviceExtractor.extractServiceWithLLM(code, serviceName);
                
                // Store extraction data for when user clicks a button
                (chatPanel as any)._currentExtraction = {
                  extraction,
                  hookFile,
                  serviceName,
                  code,
                };

                // Show extraction preview with action buttons in the UI
                postChatMessage({
                  command: 'question',
                  question: `📋 **Extraction Preview: ${serviceName}.ts**\n\n**Service File:** ${serviceName}.ts\n**Lines:** ${extraction.extractedCode.split('\n').length}\n**Functions:** ${extraction.exports.length}\n**Tests:** ${extraction.testCases.length}\n\nExecute this extraction?`,
                  options: [
                    'Execute',
                    'Cancel',
                  ],
                });
              } catch (err) {
                postChatMessage({
                  command: 'addMessage',
                  error: `Extract error: ${err instanceof Error ? err.message : String(err)}`,
                });
              }
              return;
            }

            // Check for /design-system command
            const designMatch = text.match(/^\/design-system\s+(.+)$/);
            if (designMatch) {
              const feature = designMatch[1].trim();
              try {
                chatPanel?.webview.postMessage({
                  command: 'status',
                  text: `🎨 Designing system for ${feature}...`,
                  type: 'info',
                });

                // Get patterns
                const patterns = architecturePatterns.getAllPatterns();
                
                // Generate plan
                const designPlan = await planner.generatePlan(
                  `Design a complete ${feature} feature using best practices. Include schema, service layer, custom hook, and component.`,
                  { messages: llmClient.getHistory() }
                );

                postChatMessage({
                  command: 'addMessage',
                  text: `🏗️ **System Design: ${feature}**\n\n` +
                    `${designPlan.markdown}\n\n` +
                    `Available patterns: ${patterns.map(p => p.name).join(', ')}\n\n` +
                    `_Use **/approve** to generate all files_`,
                  success: true,
                });

                (chatPanel as any)._currentPlan = designPlan.plan;
              } catch (err) {
                postChatMessage({
                  command: 'addMessage',
                  error: `Design error: ${err instanceof Error ? err.message : String(err)}`,
                });
              }
              return;
            }

            // Check for /rate-architecture command
            const rateMatch = text.match(/^\/rate-architecture/);
            if (rateMatch) {
              try {
                chatPanel?.webview.postMessage({
                  command: 'status',
                  text: `📊 Scanning codebase...`,
                  type: 'info',
                });

                // Initialize codebase index if needed
                if (!codebaseIndex) {
                  codebaseIndex = new CodebaseIndex(
                    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                  );
                  await codebaseIndex.scan();
                }

                // Get summary and patterns
                const summary = codebaseIndex.getSummary();
                const patterns = codebaseIndex.getPatterns();

                // Better architecture scoring
                const purposes = ['schema', 'service', 'hook', 'component'];
                const filesByPurpose: Record<string, number> = {};
                let hasAllLayers = true;
                let layerScore = 0;

                for (const purpose of purposes) {
                  const files = codebaseIndex.getFilesByPurpose(purpose);
                  filesByPurpose[purpose] = files.length;
                  
                  // Check if layer exists
                  if (files.length === 0) {
                    hasAllLayers = false;
                  } else {
                    // Award points for having this layer with reasonable file count
                    if (files.length >= 1) {
                      layerScore += 2; // Layer exists: 2 points
                    }
                  }
                }

                // Base score from layer completeness
                let totalScore = layerScore; // 0-8 points from layers

                // Bonus for layer separation quality
                const hasServices = filesByPurpose['service'] > 0;
                const hasHooks = filesByPurpose['hook'] > 0;
                const hasComponents = filesByPurpose['component'] > 0;
                const hasSchemas = filesByPurpose['schema'] > 0;

                // Award points for proper architecture patterns
                if (hasSchemas && hasServices && hasHooks && hasComponents) {
                  totalScore += 1.5; // Proper 4-layer architecture
                }
                
                if (hasServices && hasComponents && !hasHooks) {
                  totalScore += 0.5; // Services + Components is acceptable (no hooks needed for all)
                }

                // Bonus for good service-to-component ratio
                const serviceCount = filesByPurpose['service'];
                const componentCount = filesByPurpose['component'];
                if (serviceCount >= 2 && componentCount >= 1) {
                  totalScore += 1; // Good modular structure
                }

                // Penalty for too few files or bad structure
                if (filesByPurpose['component'] === 0 && (filesByPurpose['service'] + filesByPurpose['hook']) === 0) {
                  totalScore -= 3; // No actual code structure
                }

                const score = Math.min(10, Math.max(0, totalScore));

                // Build detailed report
                let report = `🏆 **Architecture Rating: ${Math.round(score)}/10**\n\n`;
                report += `${summary}\n\n`;
                report += `**Layer Breakdown:**\n`;
                report += `${filesByPurpose['schema'] > 0 ? '✅' : '❌'} Schemas: ${filesByPurpose['schema']} file(s)\n`;
                report += `${filesByPurpose['service'] > 0 ? '✅' : '❌'} Services: ${filesByPurpose['service']} file(s)\n`;
                report += `${filesByPurpose['hook'] > 0 ? '✅' : '❌'} Hooks: ${filesByPurpose['hook']} file(s)\n`;
                report += `${filesByPurpose['component'] > 0 ? '✅' : '❌'} Components: ${filesByPurpose['component']} file(s)\n\n`;

                if (score >= 8) {
                  report += `✅ **Excellent architecture!** Clear separation of concerns, proper layering.`;
                } else if (score >= 6) {
                  report += `⚠️ **Good structure** with room for improvement. Consider:`;
                  if (filesByPurpose['schema'] === 0) report += `\n- Add schemas for type safety`;
                  if (filesByPurpose['service'] < 2) report += `\n- Extract more business logic to services`;
                  if (filesByPurpose['component'] === 0) report += `\n- Create UI components`;
                } else {
                  report += `❌ **Needs refactoring.** Consider:`;
                  report += `\n- Create proper layer separation`;
                  report += `\n- Extract business logic from components`;
                  report += `\n- Add schema validation`;
                }

                postChatMessage({
                  command: 'addMessage',
                  text: report,
                  success: true,
                });
              } catch (err) {
                postChatMessage({
                  command: 'addMessage',
                  error: `Rating error: ${err instanceof Error ? err.message : String(err)}`,
                });
              }
              return;
            }

            // Check for /suggest-patterns command
            const suggestMatch = text.match(/^\/suggest-patterns/);
            if (suggestMatch) {
              try {
                chatPanel?.webview.postMessage({
                  command: 'status',
                  text: `🔍 Analyzing patterns...`,
                  type: 'info',
                });

                // Initialize codebase index if needed
                if (!codebaseIndex) {
                  codebaseIndex = new CodebaseIndex(
                    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                  );
                  await codebaseIndex.scan();
                }

                // Get all files and suggest patterns
                const patterns = architecturePatterns.getAllPatterns();
                const suggestions: string[] = [];
                
                const allFiles = codebaseIndex.getFilesInDependencyOrder();
                
                for (const file of allFiles) {
                  // Try to detect pattern from path and purpose
                  const detected = architecturePatterns.detectPattern(file.path || '');
                  if (!detected) {
                    suggestions.push(`📄 ${file.path} (${file.purpose}) — Could use a structured pattern`);
                  }
                }

                postChatMessage({
                  command: 'addMessage',
                  text: `💡 **Pattern Suggestions**\n\n` +
                    `**Available Patterns:**\n${patterns.map(p => `- ${p.name}: ${p.description}`).join('\n')}\n\n` +
                    `**Recommendations:**\n${suggestions.length > 0 ? suggestions.slice(0, 5).join('\n') : 'All files follow good patterns!'}\n\n` +
                    `Use **/refactor <file>** to apply improvements`,
                  success: true,
                });
              } catch (err) {
                postChatMessage({
                  command: 'addMessage',
                  error: `Pattern error: ${err instanceof Error ? err.message : String(err)}`,
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
            const answer = message.answer;
            
            // Check if this is an extraction action response
            const extractionData = (chatPanel as any)._currentExtraction;
            if (extractionData && ['Execute', 'Cancel'].includes(answer)) {
              const { extraction, hookFile, serviceName, code } = extractionData;
              
              try {
                if (answer === 'Execute') {
                  chatPanel?.webview.postMessage({
                    command: 'status',
                    text: `✏️ Executing extraction...`,
                    type: 'info',
                  });

                  const { extraction, hookFile, serviceName, code } = extractionData;

                  try {
                    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                    if (!workspaceFolder) {
                      throw new Error('No workspace folder open');
                    }

                    // Write service file to src/services/ directory
                    const serviceDir = vscode.Uri.joinPath(workspaceFolder.uri, 'src', 'services');
                    try {
                      await vscode.workspace.fs.createDirectory(serviceDir);
                    } catch (e) {
                      // Directory might already exist
                    }

                    const serviceFilePath = vscode.Uri.joinPath(serviceDir, `${serviceName}.ts`);
                    await vscode.workspace.fs.writeFile(
                      serviceFilePath,
                      new TextEncoder().encode(extraction.extractedCode)
                    );

                    chatPanel?.webview.postMessage({
                      command: 'addMessage',
                      text: `✅ **Service Extraction Successful**\n\n` +
                        `**New Service File:** src/services/${serviceName}.ts\n` +
                        `**Updated Hook:** ${hookFile}\n\n` +
                        `The API logic has been extracted to a pure service layer (no React hooks).\n\n` +
                        `**Next Steps:**\n` +
                        `1. Update your hook to import from the new service\n` +
                        `2. Run tests to verify functionality\n` +
                        `3. Remove duplicate logic from the original hook`,
                      success: true,
                    });
                  } catch (err) {
                    chatPanel?.webview.postMessage({
                      command: 'addMessage',
                      error: `Extraction failed: ${err instanceof Error ? err.message : String(err)}`,
                    });
                  }
                } else if (answer === 'Cancel') {
                  chatPanel?.webview.postMessage({
                    command: 'addMessage',
                    text: `⏭️ **Extraction cancelled**`,
                    success: true,
                  });
                }
                
                // Clear extraction data
                (chatPanel as any)._currentExtraction = null;
                break;
              } catch (err) {
                chatPanel?.webview.postMessage({
                  command: 'addMessage',
                  error: `Extract action error: ${err instanceof Error ? err.message : String(err)}`,
                });
                break;
              }
            }
            
            // Check if this is a refactor extraction button click
            const refactorData = (chatPanel as any)._currentRefactorData;
            if (refactorData && answer.startsWith('Extract: ')) {
              const extractionName = answer.replace('Extract: ', '');
              const { filepath, code } = refactorData;
              
              try {
                chatPanel?.webview.postMessage({
                  command: 'status',
                  text: `🔄 Extracting ${extractionName}...`,
                  type: 'info',
                });

                // Generate service name from extraction suggestion
                // e.g., "Extract API logic to useApi hook" -> "useApi"
                let serviceName = '';
                
                // First try: match 'to <serviceName>' pattern
                const toMatch = extractionName.match(/\bto\s+(\w+)/i);
                if (toMatch && toMatch[1]) {
                  serviceName = toMatch[1];
                }
                
                // Second try: match camelCase starting with 'use'
                if (!serviceName) {
                  const useMatch = extractionName.match(/\b(use\w+)\b/i);
                  if (useMatch && useMatch[1]) {
                    serviceName = useMatch[1];
                  }
                }
                
                // Fallback
                if (!serviceName) {
                  serviceName = extractionName.split(' ')[0];
                }

                // Extract service using LLM-based extraction with semantic analysis
                const analysis = refactorData.analysis;
                const extraction = await serviceExtractor.extractServiceWithLLM(code, serviceName, analysis);
                
                // Store extraction data for when user chooses action
                (chatPanel as any)._currentExtraction = {
                  extraction,
                  hookFile: filepath,
                  serviceName,
                  code,
                };

                // Show extraction preview with action buttons
                postChatMessage({
                  command: 'question',
                  question: `📋 **Extraction Preview: ${serviceName}.ts**\n\n**Service File:** ${serviceName}.ts\n**Lines:** ${extraction.extractedCode.split('\n').length}\n**Functions:** ${extraction.exports.length}\n**Tests:** ${extraction.testCases.length}\n\nExecute this extraction?`,
                  options: [
                    'Execute',
                    'Cancel',
                  ],
                });
                
                // Clear refactor data
                (chatPanel as any)._currentRefactorData = null;
                break;
              } catch (err) {
                chatPanel?.webview.postMessage({
                  command: 'addMessage',
                  error: `Refactor extraction error: ${err instanceof Error ? err.message : String(err)}`,
                });
                break;
              }
            }
            
            // Regular question answer (not extraction)
            if (pendingQuestionResolve) {
              pendingQuestionResolve(answer);
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
    codebaseIndex, // Phase 3.3.2: For dependency detection and context
  });
  
  const gitClient = wsFolder ? new GitClient(wsFolder) : undefined;

  executor = new Executor({
    extension: context,
    llmClient,
    gitClient,
    workspace: wsFolder || vscode.Uri.file('/'),
    codebaseIndex, // Phase 3.3.2: Track files created during execution
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

  // Initialize Phase 3.4 components
  architecturePatterns = new ArchitecturePatterns();
  featureAnalyzer = new FeatureAnalyzer(architecturePatterns, llmClient);
  serviceExtractor = new ServiceExtractor(featureAnalyzer, architecturePatterns, llmClient);
  refactoringExecutor = new RefactoringExecutor(llmClient, serviceExtractor);

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
