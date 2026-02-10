/**
 * Simplified Planner Prompts for Smaller Models (e.g., qwen2.5-coder:7b)
 * 
 * Rationale:
 * - Large models (Claude, GPT-4) can handle complex hierarchies and lots of examples
 * - Small models (7B) have limited token budget and need direct, simple instructions
 * - Verbose prompts confuse small models instead of clarifying
 * - This module provides simplified prompts for smaller deployed models
 */

/**
 * Build a simplified planning prompt optimized for small LLMs
 * 
 * Key simplifications:
 * - Single example per action type (not multiple)
 * - Direct "output these" instructions (not hierarchies)
 * - No explanations of why (just what)
 * - Token-efficient (much shorter)
 */
export function buildSimplePlanPrompt(userRequest: string, hasTests: boolean = true): string {
  return `You are a project planner. Output a numbered step-by-step plan.

ALLOWED ACTIONS: read, write, run, delete, manual
FORBIDDEN: analyze, review, suggest

ACTION DESCRIPTIONS:
- read: Open and read a file
- write: Create or modify a file  
- run: Execute a shell command
- delete: Delete a file
- manual: Manual task (no command)

RULES:
- ONE file per write step (no multiple files)
- Include file paths for read/write/delete
- Include commands for run steps
${hasTests ? '' : `- NO "npm test" or similar test commands
- Use "manual" for verification instead`}

REQUEST: ${userRequest}

OUTPUT THIS FORMAT:

**Step 1: ACTION**
- Description: What to do
- ${hasTests ? 'Path/Command: ...' : 'Path/Command/Instructions: ...'}
- Expected: Result

**Step 2: ACTION**
- Description: What to do
- ${hasTests ? 'Path/Command: ...' : 'Path/Command/Instructions: ...'}
- Expected: Result

Output only the plan. No talk. No explanation.`;
}
