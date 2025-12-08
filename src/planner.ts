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

/**
 * System prompt for LLM to generate structured plans
 */
const PLAN_SYSTEM_PROMPT = `You are an expert code assistant that breaks down complex requests into atomic steps.

Generate a JSON plan with this exact structure:
{
  "steps": [
    {
      "stepId": 1,
      "action": "read|write|suggestwrite|run",
      "path": "file/path.ts" (for file actions),
      "command": "command" (for run actions),
      "prompt": "optional prompt",
      "description": "Human-readable step description"
    },
    ...
  ],
  "summary": "Brief overview of the plan"
}

Rules:
- Break large tasks into 3-10 small steps
- Read dependencies first, then write
- Use "read" to understand existing code
- Use "write" for new code, "suggestwrite" for modifications
- End with "run" to verify (tests, lint, build)
- Each step must be independently understandable
- Respond ONLY with valid JSON, no markdown code blocks`;

export class Planner {
  private config: PlannerConfig;

  constructor(config: PlannerConfig) {
    this.config = config;
  }

  /**
   * Generate a plan for a complex user request
   * Returns plan + markdown description for user approval
   */
  async generatePlan(userRequest: string): Promise<{
    plan: TaskPlan;
    markdown: string;
  }> {
    const prompt = this.generatePlanPrompt(userRequest);
    
    const response = await this.config.llmClient.sendMessage(prompt);
    if (!response.success) {
      throw new Error(`Failed to generate plan: ${response.error}`);
    }

    // Extract JSON from response (handle various formats)
    let planData: any;
    try {
      // Try to parse as plain JSON first
      planData = JSON.parse(response.message || '');
    } catch (e) {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = (response.message || '').match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) ||
                        (response.message || '').match(/(\{[\s\S]*\})/);
      
      if (!jsonMatch) {
        throw new Error('LLM did not return valid JSON plan');
      }
      
      try {
        planData = JSON.parse(jsonMatch[1]);
      } catch (parseError) {
        throw new Error('Failed to parse plan JSON: ' + (parseError as Error).message);
      }
    }

    // Validate plan structure
    if (!planData.steps || !Array.isArray(planData.steps) || planData.steps.length === 0) {
      throw new Error('Invalid plan: no steps found');
    }

    // Construct TaskPlan
    const steps: PlanStep[] = planData.steps.map((s: any) => ({
      stepId: s.stepId || 0,
      action: s.action || 'write',
      path: s.path,
      command: s.command,
      prompt: s.prompt,
      description: s.description || `Step ${s.stepId}`,
      dependsOn: s.dependsOn,
    }));

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
      if (!jsonMatch) throw new Error('No valid JSON in refined plan');
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
   */
  private generatePlanPrompt(userRequest: string): string {
    return `${PLAN_SYSTEM_PROMPT}

User request: "${userRequest}"

Generate a step-by-step plan in JSON format.`;
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
      if (step.path) md += ` | **Path**: \`${step.path}\``;
      if (step.command) md += ` | **Command**: \`${step.command}\``;
      md += '\n';
      if (step.prompt) md += `**Prompt**: "${step.prompt}"\n`;
      md += '\n';
    });

    md += `---\n\n**Approve this plan?** Reply with \`/approve\` to proceed or \`/reject\` to cancel.`;

    return md;
  }
}
