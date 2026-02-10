/**
 * Post-Execution Handover Summary
 * 
 * Purpose: Generate the final screen users see after execution completes.
 * Demonstrates product thinking: closing the human-in-the-loop workflow
 * with clear visibility into what was automated vs. what needs manual attention.
 * 
 * Danh's insight: "Ship a developer workflow, not just code."
 */

import { StepResult } from '../planner';

export interface HandoverTask {
  id: string;
  title: string;
  description: string;
  type: 'manual' | 'testing' | 'verification' | 'documentation';
  priority: 'high' | 'medium' | 'low';
  suggestedAction?: string;
}

export interface ExecutionHandover {
  completionStatus: 'success' | 'partial' | 'failed';
  automatedStepCount: number;
  manualTaskCount: number;
  totalSteps: number;
  executionTimeMs: number;
  
  // What the AI did
  filesCreated: string[];
  filesModified: string[];
  
  // What the human needs to do
  manualTasks: HandoverTask[];
  
  // Suggested next steps
  nextSteps: string[];
  
  // Optional: AI-detected props to test
  suggestedTests?: {
    component: string;
    props: string[];
    testSuggestions: string[];
  }[];
}

/**
 * Generate handover summary from execution results
 * 
 * Takes the step results and generates a human-readable summary
 * of what was done and what's left for the human.
 */
export function generateHandoverSummary(
  stepResults: Map<number, StepResult>,
  planDescription: string,
  filesCreated: string[] = [],
  filesModified: string[] = []
): ExecutionHandover {
  const results = Array.from(stepResults.values());
  
  // Count automated vs manual steps
  const automatedSteps = results.filter(r => r.success && !r.requiresManualVerification);
  const manualSteps = results.filter(r => r.requiresManualVerification);
  const failedSteps = results.filter(r => !r.success);
  
  // Extract manual tasks from results
  const manualTasks: HandoverTask[] = manualSteps.map((step, index) => {
    const output = step.output || '';
    
    return {
      id: `manual-${index}`,
      title: extractTitle(output),
      description: output,
      type: detectTaskType(output),
      priority: detectPriority(output),
      suggestedAction: suggestAction(output),
    };
  });
  
  // Determine completion status
  const completionStatus = 
    failedSteps.length > 0 ? 'failed' :
    manualTasks.length > 0 ? 'partial' :
    'success';
  
  // Calculate total execution time
  const executionTimeMs = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  
  // Generate next steps based on what was created
  const nextSteps = generateNextSteps(
    planDescription,
    filesCreated,
    manualTasks
  );
  
  // Suggest tests based on created components (if possible)
  const suggestedTests = suggestComponentTests(filesCreated, planDescription);
  
  return {
    completionStatus,
    automatedStepCount: automatedSteps.length,
    manualTaskCount: manualTasks.length,
    totalSteps: results.length,
    executionTimeMs,
    filesCreated,
    filesModified,
    manualTasks,
    nextSteps,
    suggestedTests,
  };
}

/**
 * Extract a clean title from manual task output
 */
function extractTitle(output: string): string {
  // Remove markdown-like prefixes
  let title = output
    .replace(/^📝\s*/, '')
    .replace(/^MANUAL\s+STEP:\s*/i, '')
    .replace(/^✓\s*/, '')
    .split('\n')[0] // Take first line
    .trim();
  
  // Limit length
  if (title.length > 100) {
    title = title.substring(0, 97) + '...';
  }
  
  return title;
}

/**
 * Detect task type from output content
 */
function detectTaskType(output: string): 'manual' | 'testing' | 'verification' | 'documentation' {
  const lower = output.toLowerCase();
  
  if (lower.includes('test') || lower.includes('jest') || lower.includes('vitest')) {
    return 'testing';
  }
  if (lower.includes('verify') || lower.includes('check') || lower.includes('browser')) {
    return 'verification';
  }
  if (lower.includes('document') || lower.includes('readme') || lower.includes('comment')) {
    return 'documentation';
  }
  
  return 'manual';
}

/**
 * Detect priority from task description
 */
function detectPriority(output: string): 'high' | 'medium' | 'low' {
  const lower = output.toLowerCase();
  
  if (lower.includes('critical') || lower.includes('must') || lower.includes('important')) {
    return 'high';
  }
  if (lower.includes('optional') || lower.includes('consider') || lower.includes('nice')) {
    return 'low';
  }
  
  return 'medium';
}

/**
 * Suggest a concrete action for the task
 */
function suggestAction(output: string): string | undefined {
  const lower = output.toLowerCase();
  
  if (lower.includes('browser') || lower.includes('visual')) {
    return 'Open VS Code preview or dev server to test manually';
  }
  if (lower.includes('test')) {
    return 'Run `npm test` or `npm run test:watch` to verify';
  }
  if (lower.includes('verify')) {
    return 'Check that the implementation matches requirements';
  }
  
  return undefined;
}

/**
 * Generate suggested next steps based on what was done
 */
function generateNextSteps(
  planDescription: string,
  filesCreated: string[],
  manualTasks: HandoverTask[]
): string[] {
  const steps: string[] = [];
  
  // Step 1: Complete manual tasks
  if (manualTasks.length > 0) {
    steps.push(`📋 Complete the ${manualTasks.length} manual task(s) listed below`);
  }
  
  // Step 2: Run tests if not already included
  if (!planDescription.toLowerCase().includes('test') && filesCreated.length > 0) {
    steps.push('🧪 Run `npm test` to verify all tests pass');
  }
  
  // Step 3: Review generated code
  if (filesCreated.length > 0) {
    steps.push(`👀 Review the ${filesCreated.length} file(s) created to ensure they meet expectations`);
  }
  
  // Step 4: Commit changes
  steps.push('💾 Commit your changes to version control');
  
  // Step 5: Iterate or extend
  steps.push('🔄 Run `/plan` again to create unit tests, add documentation, or extend functionality');
  
  return steps;
}

/**
 * Suggest component tests based on created files
 * 
 * Example: If a Button component was created with a `loading` prop,
 * suggest testing the loading state.
 */
function suggestComponentTests(
  filesCreated: string[],
  planDescription: string
): { component: string; props: string[]; testSuggestions: string[] }[] {
  const suggestions: { component: string; props: string[]; testSuggestions: string[] }[] = [];
  
  // Simple heuristics: look for component files
  const componentFiles = filesCreated.filter(f => 
    f.includes('component') || 
    f.endsWith('.tsx') || 
    f.endsWith('.jsx')
  );
  
  for (const file of componentFiles) {
    // Extract component name from filename
    const componentName = file
      .split('/')
      .pop()
      ?.replace(/\.(tsx|jsx)$/, '')
      ?.replace(/([A-Z])/g, ' $1')
      .trim() || 'Component';
    
    // Detect common props from plan description
    const commonProps = [
      { name: 'disabled', test: 'disabled state renders correctly' },
      { name: 'loading', test: 'loading spinner displays when true' },
      { name: 'error', test: 'error message shows when present' },
      { name: 'isOpen', test: 'modal/drawer opens and closes' },
      { name: 'variant', test: 'visual variants render correctly' },
      { name: 'size', test: 'size variants are responsive' },
      { name: 'onClick', test: 'click handler is called' },
      { name: 'onChange', test: 'change handler is triggered' },
    ];
    
    const detectedProps = commonProps
      .filter(p => planDescription.toLowerCase().includes(p.name))
      .map(p => p.name);
    
    if (detectedProps.length > 0) {
      suggestions.push({
        component: componentName,
        props: detectedProps,
        testSuggestions: commonProps
          .filter(p => detectedProps.includes(p.name))
          .map(p => p.test),
      });
    }
  }
  
  return suggestions;
}

/**
 * Format handover for display in VS Code webview
 * Returns HTML/markdown suitable for rendering
 */
export function formatHandoverHTML(handover: ExecutionHandover): string {
  const manualTasksHTML = handover.manualTasks
    .map((task, idx) => `
      <div class="checklist-item" data-priority="${task.priority}">
        <input type="checkbox" id="task-${idx}" class="task-checkbox" />
        <label for="task-${idx}">
          <strong>${task.title}</strong>
          <span class="task-type">${task.type}</span>
          ${task.suggestedAction ? `<p class="suggested-action">${task.suggestedAction}</p>` : ''}
        </label>
      </div>
    `)
    .join('');
  
  const nextStepsHTML = handover.nextSteps
    .map(step => `<li>${step}</li>`)
    .join('');
  
  const filesCreatedHTML = handover.filesCreated.length > 0
    ? `<div class="section">
         <h4>📁 Files Created</h4>
         <ul>${handover.filesCreated.map(f => `<li><code>${f}</code></li>`).join('')}</ul>
       </div>`
    : '';
  
  const suggestedTestsHTML = handover.suggestedTests && handover.suggestedTests.length > 0
    ? `<div class="section">
         <h4>🧪 Suggested Tests</h4>
         ${handover.suggestedTests.map(test => `
           <div class="test-suggestion">
             <strong>${test.component}</strong>
             <ul>${test.testSuggestions.map(s => `<li>${s}</li>`).join('')}</ul>
           </div>
         `).join('')}
       </div>`
    : '';
  
  return `
    <div class="handover-container" data-status="${handover.completionStatus}">
      <div class="header">
        <h3>✅ Execution Complete</h3>
        <p class="summary">
          <strong>${handover.automatedStepCount}/${handover.totalSteps}</strong> steps automated
          ${handover.manualTaskCount > 0 ? `• <strong>${handover.manualTaskCount}</strong> manual task(s)` : ''}
          • <strong>${(handover.executionTimeMs / 1000).toFixed(1)}s</strong>
        </p>
      </div>
      
      ${handover.manualTaskCount > 0 ? `
        <div class="section">
          <h4>📋 Manual Tasks</h4>
          <p>The agent has finished writing the core logic. Please complete the following:</p>
          <div class="manual-checklist">
            ${manualTasksHTML}
          </div>
        </div>
      ` : ''}
      
      ${filesCreatedHTML}
      
      <div class="section">
        <h4>📝 Next Steps</h4>
        <ol>${nextStepsHTML}</ol>
      </div>
      
      ${suggestedTestsHTML}
    </div>
  `;
}
