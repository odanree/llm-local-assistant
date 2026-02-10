/**
 * PlanParser: DEPRECATED
 * 
 * Planner now returns structured TaskPlan directly.
 * This file is kept for backwards compatibility only.
 */

import { TaskPlan } from './planner';

export class PlanParser {
  /**
   * Legacy: Convert text to plan (now done by Planner)
   * This is here for backwards compatibility only.
   */
  static parse(planText: string, taskDescription: string): TaskPlan {
    // Just return a minimal plan - the real parsing is done by Planner
    return {
      taskId: `plan-${Date.now()}`,
      userRequest: taskDescription,
      generatedAt: new Date(),
      steps: [],
      reasoning: 'Legacy parse method - use Planner instead',
    };
  }
}
