import { LLMClient, LLMResponse } from './llmClient';
import * as vscode from 'vscode';

/**
 * Planning module for Phase 2: Agent Loop Foundation
 * Analyzes complex user requests and generates structured action plans
 */

export interface PlanStep {
  stepId: number;
  action: 'read' | 'write' | 'suggestwrite' | 'run';
  path?: string;            // For file operations
  command?: string;         // For /run operations
  prompt?: string;          // Optional prompt for write/suggestwrite
  description: string;      // Human-readable description
  dependsOn?: number[];     // Step IDs this depends on (future)
}

export interface TaskPlan {
  taskId: string;
  userRequest: string;
  generatedAt: Date;
  steps: PlanStep[];
  status: 'pending' | 'executing' | 'completed' | 'failed';
  currentStep: number;
  results: Map<number, StepResult>;
}

export interface StepResult {
  stepId: number;
  success: boolean;
  output?: string;
  error?: string;
  duration: number;  // milliseconds
}

export interface PlannerConfig {
  llmClient: LLMClient;
  maxSteps?: number;       // Default: 10
  timeout?: number;        // Default: 30000ms
  workspace?: vscode.Uri;  // For codebase awareness (Priority 2.2)
}

export interface ConversationContext {
  messages: Array<{ role: string; content: string }>;
}

/**
 * System prompt for LLM to generate structured plans
 */
const PLAN_SYSTEM_PROMPT = `You generate step-by-step PLANS in JSON format. NOT code.

RESPOND ONLY WITH JSON. NO OTHER TEXT.

✅ VALID ACTIONS FOR PLANS: read, write, run

❌ DO NOT USE: suggestwrite, delete, analyze, inspect, chooseSubfolder, etc.

Example:
{"steps": [{"stepId": 1, "action": "read", "path": "examples", "description": "Read examples folder"}, {"stepId": 2, "action": "write", "path": "src/MyComponent.js", "prompt": "Create React component based on examples", "description": "Generate component"}]}

STRICT RULES:
1. RESPOND ONLY WITH JSON - no markdown, no explanation, no code blocks
2. Action MUST be one of: read, write, run (NOTHING ELSE - NOT suggestwrite)
3. Return exactly: {"steps": [...]}
4. Steps: 2-4 maximum (keep plans simple)
5. Each step MUST have: stepId (number), action (read|write|run), path (except run), description
6. write steps MUST include prompt field (what to generate)
7. read steps: path only (read files before improving them)
8. run steps: command field instead of path (npm test, git log, etc)
9. Descriptions: SHORT (under 40 chars)
10. Prompts: CONCISE (under 80 chars)
11. NO "content", NO code examples, NO extra fields
12. Typical flow: read → write → run (or similar)
13. Valid JSON that can be parsed immediately
14. If multi-turn context provided: maintain consistency with previous steps

🚫 NEVER WRITE TO THESE FILES (READ ONLY):
- package.json, package-lock.json, yarn.lock, pnpm-lock.yaml
- tsconfig.json, jsconfig.json
- .gitignore, .eslintrc, .prettierrc, webpack.config.js
- Any config files (*.config.js, *.config.ts, .vscode/settings.json)

For "just run X" requests: Use read (if needed) → run. Do NOT add write steps.`;


export class Planner {
  private config: PlannerConfig;

  constructor(config: PlannerConfig) {
    this.config = config;
  }

  /**
   * Generate thinking/reasoning before creating a plan
   * Shows the LLM's analysis of how to approach the task
   * Returns natural language explanation of the planned approach
   */
  async generateThinking(userRequest: string, context?: ConversationContext): Promise<string> {
    const contextStr = context && context.messages.length > 0
      ? `\n\nPrevious context:\n${context.messages.slice(-4).map(m => 
          `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
        ).join('\n')}\n`
      : '';

    const prompt = `You are an expert code assistant analyzing a task request.

${contextStr}

User request: "${userRequest}"

Analyze this request and provide your thinking in 2-3 sentences. Explain:
1. What you need to understand or check first
2. The main steps you'll take
3. Any potential issues to watch for

Be concise and direct. Do NOT generate code or detailed plans yet.`;

    const response = await this.config.llmClient.sendMessage(prompt);
    if (!response.success) {
      const errorMsg = response.error || 'Unknown error';
      // Handle timeout errors gracefully
      if (errorMsg.includes('aborted') || errorMsg.includes('timeout')) {
        throw new Error(`Planning timeout: The LLM took too long to respond. Try with a shorter request or check your LLM server's performance.`);
      }
      throw new Error(`Failed to generate thinking: ${errorMsg}`);
    }

    // Clean up the response (remove markdown, formatting)
    let thinking = response.message || '';
    thinking = thinking
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/\*\*/g, '')        // Remove bold markers
      .trim();

    return thinking;
  }

  /**
   * Generate a plan for a complex user request
   * Optionally uses conversation context for multi-turn awareness
   * Returns plan + markdown description for user approval
   */
  async generatePlan(userRequest: string, context?: ConversationContext): Promise<{
    plan: TaskPlan;
    markdown: string;
  }> {
    // Analyze codebase for context awareness (Priority 2.2)
    const codebaseContext = await this.analyzeCodebase();
    
    const prompt = this.generatePlanPrompt(userRequest, context, codebaseContext);
    
    const response = await this.config.llmClient.sendMessage(prompt);
    if (!response.success) {
      throw new Error(`Failed to generate plan: ${response.error}`);
    }

    // Extract JSON from response (handle various formats)
    let planData: any;
    const message = response.message || '';
    
    try {
      // Try to parse as plain JSON first
      planData = JSON.parse(message);
    } catch (e) {
      // Try to extract JSON from response that has text before/after it
      let jsonStr: string | undefined;
      
      // Find the first { and match it with the last }
      const startIdx = message.indexOf('{');
      if (startIdx !== -1) {
        // Find the matching closing brace
        let braceCount = 0;
        let endIdx = -1;
        for (let i = startIdx; i < message.length; i++) {
          if (message[i] === '{') {braceCount++;}
          if (message[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
              endIdx = i;
              break;
            }
          }
        }
        
        if (endIdx !== -1) {
          jsonStr = message.substring(startIdx, endIdx + 1);
          try {
            planData = JSON.parse(jsonStr);
          } catch (parseErr) {
            console.warn('[Planner] Brace-matched JSON failed to parse:', (parseErr as Error).message);
            jsonStr = undefined;
          }
        }
      }
      
      // If brace matching didn't work, try regex patterns
      if (!planData) {
        const patterns = [
          /```(?:json)?\s*\n?([\s\S]*?)\n?```/,  // Markdown code block
          /```([\s\S]*?)```/,                      // Generic code block
        ];
        
        for (const pattern of patterns) {
          const match = message.match(pattern);
          if (match && match[1]) {
            jsonStr = match[1].trim();
            try {
              planData = JSON.parse(jsonStr);
              break;
            } catch {
              continue;
            }
          }
        }
      }
      
      if (!planData) {
        // Check if message appears truncated
        const isTruncated = message.endsWith('fil') || message.endsWith('...') || 
                           message.match(/[a-z]$/) && message.length > 1000;
        
        const errorMsg = isTruncated 
          ? `Failed to parse plan JSON. Response appears truncated. Length: ${message.length}. Last 200 chars: ${message.substring(Math.max(0, message.length - 200))}`
          : `Failed to parse plan JSON. Response length: ${message.length}. First 300 chars: ${message.substring(0, 300)}`;
        
        throw new Error(errorMsg);
      }
    }

    // Validate plan structure
    if (!planData.steps || !Array.isArray(planData.steps) || planData.steps.length === 0) {
      throw new Error('Invalid plan: no steps found');
    }

    // Valid actions that the executor supports
    const VALID_ACTIONS = ['read', 'write', 'suggestwrite', 'run'];
    
    // Protected files that should never be overwritten by plans
    const PROTECTED_FILES = [
      'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
      'tsconfig.json', 'jsconfig.json', 
      '.gitignore', '.eslintrc', '.eslintrc.js', '.eslintrc.json', 
      '.prettierrc', '.prettierrc.js', '.prettierrc.json',
      'webpack.config.js', 'vite.config.js', 'vite.config.ts',
      'rollup.config.js', 'next.config.js',
    ];

    // Track invalid actions for better error reporting
    const invalidSteps: any[] = [];

    // Construct TaskPlan - filter out invalid steps
    const steps: PlanStep[] = planData.steps
      .filter((s: any) => {
        const action = (s.action || 'write').toLowerCase();
        if (!VALID_ACTIONS.includes(action)) {
          invalidSteps.push({ action: s.action, description: s.description });
          console.warn(`[Planner] Skipping step with invalid action: ${s.action}`);
          return false;
        }
        
        // Check if trying to write to protected files
        if ((action === 'write' || action === 'suggestwrite') && s.path) {
          const fileName = s.path.split('/').pop() || '';
          if (PROTECTED_FILES.includes(fileName)) {
            invalidSteps.push({ 
              action: s.action, 
              path: s.path,
              description: s.description,
              reason: `Protected file: ${fileName}`
            });
            console.warn(`[Planner] Blocked write to protected file: ${s.path}`);
            return false;
          }
          
          // Also check for config patterns
          if (fileName.match(/\.(config|rc)\.(js|ts|json)$/) || 
              fileName.match(/^\..*rc$/) ||
              s.path.includes('.vscode/settings.json')) {
            invalidSteps.push({ 
              action: s.action, 
              path: s.path,
              description: s.description,
              reason: 'Config file'
            });
            console.warn(`[Planner] Blocked write to config file: ${s.path}`);
            return false;
          }
        }
        // Ensure step has required fields
        if (!s.path && action !== 'run') {
          console.warn(`[Planner] Skipping step without path: ${s.description}`);
          return false;
        }
        if (!s.command && action === 'run') {
          console.warn(`[Planner] Skipping run step without command`);
          return false;
        }
        return true;
      })
      .map((s: any) => ({
        stepId: s.stepId || 0,
        action: (s.action || 'write').toLowerCase() as any,
        path: s.path,
        command: s.command,
        prompt: s.prompt,  // Include prompt for write steps
        description: s.description || `Step ${s.stepId}`,
        dependsOn: s.dependsOn,
      }));

    if (steps.length === 0) {
      const protectedFileBlocks = invalidSteps.filter(s => s.reason).map(s => s.path);
      const invalidActionsStr = invalidSteps.filter(s => !s.reason).map(s => s.action).join(', ');
      
      let errorMsg = 'No valid steps found after filtering.';
      if (protectedFileBlocks.length > 0) {
        errorMsg += ` Blocked writes to protected files: ${protectedFileBlocks.join(', ')}.`;
      }
      if (invalidActionsStr) {
        errorMsg += ` Invalid actions used: ${invalidActionsStr}. Valid actions are: read, write, suggestwrite, run`;
      }
      
      throw new Error(errorMsg);
    }

    const plan: TaskPlan = {
      taskId: `task_${Date.now()}`,
      userRequest,
      generatedAt: new Date(),
      steps,
      status: 'pending',
      currentStep: 0,
      results: new Map(),
    };

    const markdown = this.formatPlanAsMarkdown(plan, planData.summary || 'Generated Plan');

    return { plan, markdown };
  }

  /**
   * Refine an existing plan based on feedback (Phase 2.2+)
   */
  async refinePlan(
    originalPlan: TaskPlan,
    feedback: string
  ): Promise<TaskPlan> {
    const refinementPrompt = `
Original request: "${originalPlan.userRequest}"

Previous plan had ${originalPlan.steps.length} steps.
Steps completed: ${originalPlan.currentStep}

User feedback: "${feedback}"

Please generate a refined plan that addresses the feedback. Use the same JSON format as before.`;

    const response = await this.config.llmClient.sendMessage(refinementPrompt);
    if (!response.success) {
      throw new Error(`Failed to refine plan: ${response.error}`);
    }

    // Parse refined plan (same as generatePlan)
    let planData: any;
    try {
      planData = JSON.parse(response.message || '');
    } catch (e) {
      const jsonMatch = (response.message || '').match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) ||
                        (response.message || '').match(/(\{[\s\S]*\})/);
      if (!jsonMatch) {throw new Error('No valid JSON in refined plan');}
      planData = JSON.parse(jsonMatch[1]);
    }

    const steps: PlanStep[] = planData.steps.map((s: any) => ({
      stepId: s.stepId || 0,
      action: s.action || 'write',
      path: s.path,
      command: s.command,
      prompt: s.prompt,
      description: s.description || `Step ${s.stepId}`,
      dependsOn: s.dependsOn,
    }));

    return {
      ...originalPlan,
      taskId: `task_${Date.now()}`,
      steps,
      status: 'pending',
      currentStep: 0,
      results: new Map(),
    };
  }

  /**
   * Generate LLM prompt for plan generation
   * Includes conversation context if provided for multi-turn awareness
   * Includes codebase analysis for intelligent decisions (Priority 2.2)
   */
  private generatePlanPrompt(userRequest: string, context?: ConversationContext, codebaseContext?: string): string {
    let contextStr = '';
    if (context && context.messages.length > 0) {
      const recentMessages = context.messages.slice(-6).map(m => 
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
      ).join('\n');
      contextStr = `\n\nPrevious conversation context:\n${recentMessages}\n`;
    }
    const codebase = codebaseContext || '';
    return `${PLAN_SYSTEM_PROMPT}${contextStr}${codebase}\nNew user request: "${userRequest}"\n\nGenerate a step-by-step plan in JSON format.`;
  }

  /**
   * Analyze codebase for awareness (Priority 2.2: Codebase Awareness)
   * Detects project type, language, and conventions
   * Returns context string to enhance plan generation
   */
  private async analyzeCodebase(): Promise<string> {
    if (!this.config.workspace) {
      return ''; // No workspace, skip analysis
    }

    try {
      const projectRoot = this.config.workspace;
      const analysis: string[] = [];

      // Check for package.json (Node.js/JavaScript project)
      try {
        const pkgPath = vscode.Uri.joinPath(projectRoot, 'package.json');
        const pkgContent = await vscode.workspace.fs.readFile(pkgPath);
        const pkgText = new TextDecoder().decode(pkgContent);
        const pkg = JSON.parse(pkgText);
        
        analysis.push(`**Project Type**: Node.js/JavaScript`);
        if (pkg.name) {analysis.push(`**Name**: ${pkg.name}`);}
        if (pkg.type) {analysis.push(`**Type**: ${pkg.type}`);}
        
        // Detect framework
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.react) {analysis.push(`**Framework**: React`);}
        else if (deps.vue) {analysis.push(`**Framework**: Vue`);}
        else if (deps.express) {analysis.push(`**Framework**: Express`);}
        else if (deps.next) {analysis.push(`**Framework**: Next.js`);}
        
        // Check for TypeScript
        if (deps.typescript || pkg.type === 'module') {analysis.push(`**Language**: TypeScript`);}
      } catch {
        // Not a Node.js project, continue checking
      }

      // Check for tsconfig.json (TypeScript)
      if (analysis.length === 0) {
        try {
          const tsconfigPath = vscode.Uri.joinPath(projectRoot, 'tsconfig.json');
          await vscode.workspace.fs.stat(tsconfigPath);
          analysis.push(`**Project Type**: TypeScript`);
        } catch {
          // Not TypeScript either
        }
      }

      // Check for Python project
      if (analysis.length === 0) {
        try {
          const pyPath = vscode.Uri.joinPath(projectRoot, 'pyproject.toml');
          await vscode.workspace.fs.stat(pyPath);
          analysis.push(`**Project Type**: Python`);
        } catch {
          // Not Python
        }
      }

      // Check for src/ or lib/ structure
      try {
        const srcPath = vscode.Uri.joinPath(projectRoot, 'src');
        await vscode.workspace.fs.stat(srcPath);
        analysis.push(`**Structure**: src/ directory exists`);
      } catch {
        try {
          const libPath = vscode.Uri.joinPath(projectRoot, 'lib');
          await vscode.workspace.fs.stat(libPath);
          analysis.push(`**Structure**: lib/ directory exists`);
        } catch {
          // Neither exists
        }
      }

      // Check for test directory
      try {
        const testPath = vscode.Uri.joinPath(projectRoot, 'test');
        await vscode.workspace.fs.stat(testPath);
        analysis.push(`**Testing**: test/ directory exists`);
      } catch {
        try {
          const specPath = vscode.Uri.joinPath(projectRoot, '__tests__');
          await vscode.workspace.fs.stat(specPath);
          analysis.push(`**Testing**: __tests__/ directory exists`);
        } catch {
          // No test directory found
        }
      }

      if (analysis.length === 0) {
        return ''; // Couldn't determine project type
      }

      return `\n\nCodebase context:\n${analysis.join('\n')}\n`;
    } catch (error) {
      // Analysis failed, continue without it
      return '';
    }
  }

  /**
   * Format plan as markdown for display to user
   */
  private formatPlanAsMarkdown(plan: TaskPlan, summary: string): string {
    let md = `## 📋 Plan: ${summary}\n\n`;
    md += `**Steps**: ${plan.steps.length} | **Estimated time**: ~${Math.max(30, plan.steps.length * 10)}s\n\n`;

    plan.steps.forEach((step) => {
      md += `### Step ${step.stepId}: ${step.description}\n`;
      md += `**Action**: \`${step.action}\``;
      if (step.path) {md += ` | **Path**: \`${step.path}\``;}
      if (step.command) {md += ` | **Command**: \`${step.command}\``;}
      md += '\n';
      if (step.prompt) {md += `**Prompt**: "${step.prompt}"\n`;}
      md += '\n';
    });

    md += `---\n\n**Approve this plan?** Reply with \`/approve\` to proceed or \`/reject\` to cancel.`;

    return md;
  }
}
