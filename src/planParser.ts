/**
 * PlanParser: Convert Refiner-generated text plans into executable TaskPlan format
 *
 * Bridge between Refiner output (natural language) and Executor input (structured TaskPlan)
 * Parses step descriptions to extract action types and parameters
 */

import { TaskPlan, PlanStep } from './planner';

export class PlanParser {
  /**
   * Parse natural language plan text into structured TaskPlan
   */
  static parse(planText: string, taskDescription: string): TaskPlan {
    const steps = this.extractSteps(planText);
    const parsedSteps = steps.map((step, index) => this.parseStep(step, index + 1));

    const plan: TaskPlan = {
      taskId: `plan-${Date.now()}`,
      userRequest: taskDescription,
      generatedAt: new Date(),
      steps: parsedSteps,
      status: 'pending',
      currentStep: 0,
      results: new Map(),
    };

    return plan;
  }

  /**
   * Extract individual steps from plan text
   */
  private static extractSteps(text: string): string[] {
    // Look for patterns like "Step 1:", "[Step 1]", "1.", etc.
    const stepPatterns = [
      /(?:^|\n)\[?Step\s+\d+\]?:?\s*(.+?)(?=(?:^|\n)\[?Step\s+\d+\]?:|$)/gims,
      /(?:^|\n)\d+\.\s+(.+?)(?=(?:^|\n)\d+\.|$)/gims,
      /(?:^|\n)[-*]\s+(.+?)(?=(?:^|\n)[-*]|$)/gims,
    ];

    for (const pattern of stepPatterns) {
      const matches = Array.from(text.matchAll(pattern));
      if (matches.length > 0) {
        return matches.map((m) => m[1].trim()).filter((s) => s.length > 0);
      }
    }

    // Fallback: split by newlines and filter non-empty
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 10 && !line.startsWith('**'));
  }

  /**
   * Parse individual step into PlanStep
   */
  private static parseStep(stepText: string, stepId: number): PlanStep {
    const step: PlanStep = {
      stepId,
      description: stepText.substring(0, 200),
      action: this.detectAction(stepText),
    };

    // Extract path if present (for read/write operations)
    const pathMatch = stepText.match(/(?:file|path|at)\s+(?:["'`]?([^"'`\n]+?)["'`]?|([^\s]+?)(?:\s|$))/i);
    if (pathMatch) {
      step.path = pathMatch[1] || pathMatch[2];
    }

    // Extract prompt/command if present
    const commandMatch = stepText.match(/(?:run|execute|command)[:\s]+(?:["'`]([^"'`]+)["'`]|([^\n]+))/i);
    if (commandMatch) {
      step.command = commandMatch[1] || commandMatch[2];
    } else if (step.action === 'write' || step.action === 'suggestwrite') {
      // For write operations, use step description as prompt
      step.prompt = stepText;
    }

    return step;
  }

  /**
   * Detect action type from step text
   * Limited to valid action types: 'read' | 'write' | 'suggestwrite' | 'run'
   */
  private static detectAction(text: string): 'read' | 'write' | 'suggestwrite' | 'run' {
    const textLower = text.toLowerCase();

    if (textLower.includes('read') || textLower.includes('check') || textLower.includes('view')) {
      return 'read';
    }

    if (textLower.includes('suggest')) {
      return 'suggestwrite';
    }

    if (textLower.includes('write') || textLower.includes('create') || textLower.includes('generate')) {
      return 'write';
    }

    if (textLower.includes('run') || textLower.includes('execute') || textLower.includes('command')) {
      return 'run';
    }

    // Default to read for analysis/review steps
    return 'read';
  }
}
