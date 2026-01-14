import { LLMClient } from './llmClient';
import * as vscode from 'vscode';
/**
 * Planning module for Phase 2: Agent Loop Foundation
 * Analyzes complex user requests and generates structured action plans
 */
export interface PlanStep {
    stepId: number;
    action: 'read' | 'write' | 'suggestwrite' | 'run';
    path?: string;
    command?: string;
    prompt?: string;
    description: string;
    dependsOn?: number[];
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
    duration: number;
}
export interface PlannerConfig {
    llmClient: LLMClient;
    maxSteps?: number;
    timeout?: number;
    workspace?: vscode.Uri;
}
export interface ConversationContext {
    messages: Array<{
        role: string;
        content: string;
    }>;
}
export declare class Planner {
    private config;
    constructor(config: PlannerConfig);
    /**
     * Generate thinking/reasoning before creating a plan
     * Shows the LLM's analysis of how to approach the task
     * Returns natural language explanation of the planned approach
     */
    generateThinking(userRequest: string, context?: ConversationContext): Promise<string>;
    /**
     * Generate a plan for a complex user request
     * Optionally uses conversation context for multi-turn awareness
     * Returns plan + markdown description for user approval
     */
    generatePlan(userRequest: string, context?: ConversationContext): Promise<{
        plan: TaskPlan;
        markdown: string;
    }>;
    /**
     * Refine an existing plan based on feedback (Phase 2.2+)
     */
    refinePlan(originalPlan: TaskPlan, feedback: string): Promise<TaskPlan>;
    /**
     * Generate LLM prompt for plan generation
     * Includes conversation context if provided for multi-turn awareness
     * Includes codebase analysis for intelligent decisions (Priority 2.2)
     */
    private generatePlanPrompt;
    /**
     * Analyze codebase for awareness (Priority 2.2: Codebase Awareness)
     * Detects project type, language, and conventions
     * Returns context string to enhance plan generation
     */
    private analyzeCodebase;
    /**
     * Format plan as markdown for display to user
     */
    private formatPlanAsMarkdown;
}
//# sourceMappingURL=planner.d.ts.map