import { LLMClient, LLMResponse } from './llmClient';

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
}

export interface ConversationContext {
  messages: Array<{ role: string; content: string }>;
}

/**
 * System prompt for LLM to generate structured plans
 */
const PLAN_SYSTEM_PROMPT = `You generate step-by-step PLANS in JSON format. NOT code.

RESPOND ONLY WITH JSON. NO OTHER TEXT.

VALID ACTIONS ONLY: write, read, run

Example:
{"steps": [{"stepId": 1, "action": "read", "path": "src/Hello.js", "description": "Read existing component"}, {"stepId": 2, "action": "write", "path": "src/Hello.js", "prompt": "Create an improved React component", "description": "Write improved component"}]}

Rules:
1. RESPOND ONLY WITH JSON - no markdown, no explanation
2. Return exactly this format: {"steps": [...]}
3. Steps array: 2-4 objects maximum (keep plans simple)
4. Each step needs: stepId (number), action (string), path (string), description (short, max 40 chars)
5. For write: also include prompt (max 80 chars describing what to generate)
6. For read: path only, used to read files before improving them
7. For run: ONLY for critical shell operations like git, tests. Avoid diff/echo/cat
8. Keep descriptions SHORT (under 40 characters)
9. Keep prompts CONCISE (under 80 characters)
10. NO "content" field, NO code examples, NO extra fields
11. Most tasks: read → write (improve/create content)
12. Valid JSON that can be parsed immediately
13. If conversation context is provided: use it to understand multi-turn requests and maintain consistency`;

export class Planner {
  private config: PlannerConfig;

  constructor(config: PlannerConfig) {
    this.config = config;
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
    const prompt = this.generatePlanPrompt(userRequest, context);
    
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

    // Construct TaskPlan - filter out invalid steps
    const steps: PlanStep[] = planData.steps
      .filter((s: any) => {
        const action = (s.action || 'write').toLowerCase();
        if (!VALID_ACTIONS.includes(action)) {
          console.warn(`[Planner] Skipping step with invalid action: ${s.action}`);
          return false;
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
      throw new Error('No valid steps found after filtering');
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
   */
  private generatePlanPrompt(userRequest: string, context?: ConversationContext): string {
    let contextStr = '';
    if (context && context.messages.length > 0) {
      const recentMessages = context.messages.slice(-6).map(m => 
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
      ).join('\n');
      contextStr = `\n\nPrevious conversation context:\n${recentMessages}\n`;
    }
    return `${PLAN_SYSTEM_PROMPT}${contextStr}\nNew user request: "${userRequest}"\n\nGenerate a step-by-step plan in JSON format.`;
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
