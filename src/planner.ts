/**
 * Planner: Non-Deterministic Intent Decomposition
 *
 * Role: Take a user request and decompose it into atomic execution steps.
 * Output: High-level structured plan (not code, not diffs).
 * Success Metric: Does the sequence make logical sense?
 *
 * Key Difference from Refiner:
 * - Refiner: Deterministic code transformation with validation
 * - Planner: Non-deterministic brainstorming with user review
 *
 * Separation of Concerns:
 * - Planner doesn't know about diffs, scaffolding, or code syntax
 * - Refiner doesn't need to understand planning logic
 * - Executor bridges them by calling Refiner for approved steps
 */

export interface ExecutionStep {
  stepId?: number; // For executor compatibility
  stepNumber: number;
  action: 'read' | 'write' | 'run' | 'analyze' | 'review' | 'suggestwrite';
  description: string;
  targetFile?: string;
  path?: string; // Alternate name for targetFile (for executor)
  prompt?: string; // For suggestwrite/write actions
  expectedOutcome: string;
  dependencies?: number[]; // Step numbers this depends on
  command?: string; // For run actions
}

// Alias for executor compatibility
export type PlanStep = ExecutionStep;

export interface StepResult {
  stepId: number;
  success: boolean;
  output?: string;
  error?: string;
  duration: number;
}

export interface TaskPlan {
  taskId: string;
  userRequest: string;
  steps: ExecutionStep[];
  generatedAt: Date;
  reasoning: string; // Why LLM chose this approach
  status?: 'pending' | 'executing' | 'completed' | 'failed'; // For executor tracking
  currentStep?: number; // For executor tracking
  results?: Map<number, StepResult>; // For executor tracking
}

export interface PlannerConfig {
  llmCall: (prompt: string) => Promise<string>;
  onProgress?: (stage: string, details: string) => void;
}

export class Planner {
  private config: PlannerConfig;

  constructor(config: PlannerConfig) {
    this.config = config;
  }

  /**
   * Generate a plan for a user request
   * 
   * Key: No retries, no validation logic, no code transformation.
   * Just decompose the request into steps and return.
   */
  async generatePlan(userRequest: string): Promise<TaskPlan> {
    this.config.onProgress?.('Planning', 'Decomposing request into steps...');

    const planPrompt = this.buildPlanPrompt(userRequest);

    try {
      const llmResponse = await this.config.llmCall(planPrompt);

      if (!llmResponse || llmResponse.includes('UNABLE_TO_COMPLETE')) {
        throw new Error('LLM could not generate a plan for this request');
      }

      // Parse the response into structured steps
      const steps = this.parseSteps(llmResponse);

      if (!steps || steps.length === 0) {
        throw new Error('No steps could be extracted from LLM response');
      }

      const plan: TaskPlan = {
        taskId: `plan-${Date.now()}`,
        userRequest,
        steps,
        generatedAt: new Date(),
        reasoning: this.extractReasoning(llmResponse),
      };

      this.config.onProgress?.('Planning', `Generated ${steps.length} steps`);
      return plan;
    } catch (err) {
      throw new Error(`Plan generation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Build the planning prompt
   * 
   * Key: Simple, non-technical, doesn't mention diffs/scaffolding/code.
   * Just asks LLM to decompose the request into steps.
   */
  private buildPlanPrompt(userRequest: string): string {
    return `You are a project planning expert. Your job is to decompose a user request into atomic, executable steps.

USER REQUEST:
${userRequest}

Create a detailed step-by-step plan. For each step, provide:
1. Action type: read, write, run, analyze, or review
2. What to do: specific file, command, or analysis
3. Expected outcome: what will be true after this step
4. Dependencies: which previous steps it depends on (if any)

OUTPUT FORMAT - Be descriptive and clear:

**Step 1: read**
- Description: Read the current authentication system
- Target: src/auth/index.ts
- Expected outcome: Understand current auth flow
- Dependencies: None

**Step 2: analyze**
- Description: Identify where to add remember-me logic
- Target: auth system analysis
- Expected outcome: Clear understanding of integration points
- Dependencies: Step 1

**Step 3: write**
- Description: Add remember-me checkbox to login form
- Target: src/components/LoginForm.tsx
- Expected outcome: Form has remember-me checkbox with state
- Dependencies: Step 2

Continue for all steps needed to complete the request.
Be thorough but concise. Focus on the sequence and dependencies.`;
  }

  /**
   * Parse LLM response into structured ExecutionStep objects
   */
  private parseSteps(responseText: string): ExecutionStep[] {
    const steps: ExecutionStep[] = [];

    // Look for step patterns: "**Step N:** action"
    const stepPatterns = [
      /\*\*Step\s+(\d+):\s*(\w+)\*\*/gi,
      /Step\s+(\d+):\s*(\w+)/gi,
      /^\d+\.\s+(\w+)/gim,
    ];

    let stepMatches: RegExpExecArray | null = null;
    let currentPattern = 0;

    // Try each pattern
    for (const pattern of stepPatterns) {
      stepMatches = pattern.exec(responseText);
      if (stepMatches) {
        currentPattern = stepPatterns.indexOf(pattern);
        break;
      }
    }

    if (!stepMatches) {
      // Fallback: split by "Step" and parse each block
      const stepBlocks = responseText.split(/\*\*Step\s+\d+:|Step\s+\d+:/i).slice(1);

      stepBlocks.forEach((block, index) => {
        const step = this.parseStepBlock(block, index + 1);
        if (step) steps.push(step);
      });

      return steps;
    }

    // Parse with the matching pattern
    const pattern = stepPatterns[currentPattern];
    let match;
    let stepNumber = 1;

    while ((match = pattern.exec(responseText)) !== null) {
      const action = (match[2] || 'analyze').toLowerCase() as ExecutionStep['action'];
      const startIndex = pattern.lastIndex;

      // Find the next step or end of text
      const nextStepMatch = /(?:\*\*Step\s+\d+:|Step\s+\d+:|\n\d+\.)/i.exec(responseText.substring(startIndex));
      const endIndex = nextStepMatch ? startIndex + nextStepMatch.index : responseText.length;
      const stepContent = responseText.substring(startIndex, endIndex);

      const step: ExecutionStep = {
        stepNumber,
        stepId: stepNumber,
        action,
        description: this.extractDescription(stepContent),
        targetFile: this.extractTargetFile(stepContent),
        expectedOutcome: this.extractExpectedOutcome(stepContent),
        dependencies: this.extractDependencies(stepContent),
      };

      if (step.description) {
        steps.push(step);
        stepNumber++;
      }
    }

    return steps;
  }

  /**
   * Parse a single step block (for fallback pattern)
   */
  private parseStepBlock(block: string, stepNumber: number): ExecutionStep | null {
    const lines = block.split('\n').filter(l => l.trim());
    if (lines.length === 0) return null;

    // Extract action from first line
    const firstLine = lines[0];
    let action: ExecutionStep['action'] = 'analyze';
    
    if (firstLine.includes('read')) action = 'read';
    else if (firstLine.includes('write')) action = 'write';
    else if (firstLine.includes('run')) action = 'run';
    else if (firstLine.includes('review')) action = 'review';

    return {
      stepNumber,
      stepId: stepNumber,
      action,
      description: this.extractDescription(block),
      targetFile: this.extractTargetFile(block),
      expectedOutcome: this.extractExpectedOutcome(block),
      dependencies: this.extractDependencies(block),
    };
  }

  /**
   * Extract description from step block
   */
  private extractDescription(text: string): string {
    // Look for "Description:" or "- Description:"
    const descMatch = text.match(/(?:Description|What to do)[:\s]+([^\n]+)/i);
    if (descMatch) {
      return descMatch[1].trim();
    }

    // Fallback: first non-empty line
    const lines = text.split('\n').filter(l => l.trim());
    return lines[0]?.replace(/^[-*]\s+/, '').trim() || '';
  }

  /**
   * Extract target file from step block
   */
  private extractTargetFile(text: string): string | undefined {
    const targetMatch = text.match(/(?:Target|File|Path)[:\s]+([^\n]+)/i);
    if (targetMatch) {
      return targetMatch[1].trim();
    }
    return undefined;
  }

  /**
   * Extract expected outcome from step block
   */
  private extractExpectedOutcome(text: string): string {
    const outcomeMatch = text.match(/Expected\s+(?:outcome|result)[:\s]+([^\n]+)/i);
    if (outcomeMatch) {
      return outcomeMatch[1].trim();
    }
    return 'Step completed';
  }

  /**
   * Extract dependencies from step block
   */
  private extractDependencies(text: string): number[] | undefined {
    const depsMatch = text.match(/Dependencies?[:\s]+(?:Step\s+)?(\d+(?:\s*,\s*\d+)*)/i);
    if (depsMatch) {
      return depsMatch[1]
        .split(',')
        .map(n => parseInt(n.trim(), 10))
        .filter(n => !isNaN(n));
    }
    return undefined;
  }

  /**
   * Extract high-level reasoning from LLM response
   * (For user understanding of why this plan was chosen)
   */
  private extractReasoning(text: string): string {
    // Look for reasoning section
    const reasoningMatch = text.match(/(?:Reasoning|Approach|Strategy)[:\s]+([^\n]+(?:\n(?!\*\*Step)[^\n]*)*)/i);
    if (reasoningMatch) {
      return reasoningMatch[1].trim();
    }

    // Fallback: return first paragraph
    const lines = text.split('\n\n')[0];
    return lines || 'Plan generated based on user request';
  }
}
