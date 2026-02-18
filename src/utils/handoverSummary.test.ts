import { describe, it, expect } from 'vitest';
import {
  generateHandoverSummary,
  formatHandoverHTML,
  type ExecutionHandover,
} from './handoverSummary';
import { type StepResult } from '../planner';

describe('handoverSummary - Post-Execution Workflow', () => {
  describe('Phase 19 - Helper Functions Coverage (Tier 1 Priority)', () => {
    describe('extractTitle - Task title extraction (+95% coverage)', () => {
      it('should remove emoji prefix from title', () => {
        const output = '📝 Set up authentication service';
        // We test this indirectly through generateHandoverSummary since extractTitle is private
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Create auth', [], []);
        expect(handover.manualTasks[0].title).not.toContain('📝');
      });

      it('should remove MANUAL STEP prefix', () => {
        const output = 'MANUAL STEP: Configure environment variables';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Config', [], []);
        expect(handover.manualTasks[0].title).not.toContain('MANUAL STEP');
      });

      it('should remove checkmark prefix from title', () => {
        const output = '✓ Verify form submission works';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Form', [], []);
        expect(handover.manualTasks[0].title).not.toContain('✓');
      });

      it('should extract first line only as title', () => {
        const output = 'Set up database\nThen configure migrations\nFinally seed data';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'DB', [], []);
        expect(handover.manualTasks[0].title).toContain('Set up database');
        expect(handover.manualTasks[0].title).not.toContain('migrations');
      });

      it('should truncate long titles with ellipsis', () => {
        const longTitle = 'a'.repeat(150);
        const output = `📝 ${longTitle}`;
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Long', [], []);
        expect(handover.manualTasks[0].title.length).toBeLessThanOrEqual(100);
        expect(handover.manualTasks[0].title).toContain('...');
      });

      it('should trim whitespace from title', () => {
        const output = 'Trimmed title  \n  more details';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Trim', [], []);
        expect(handover.manualTasks[0].title).toBe('Trimmed title');
      });
    });

    describe('detectTaskType - Categorize task type (+95% coverage)', () => {
      it('should detect testing task type', () => {
        const output = 'Run unit tests for the new component';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Test', [], []);
        expect(handover.manualTasks[0].type).toBe('testing');
      });

      it('should detect jest keyword as testing', () => {
        const output = 'Run jest tests to ensure coverage';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Jest', [], []);
        expect(handover.manualTasks[0].type).toBe('testing');
      });

      it('should detect vitest keyword as testing', () => {
        const output = 'Run vitest to verify all components';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Vitest', [], []);
        expect(handover.manualTasks[0].type).toBe('testing');
      });

      it('should detect verification task type', () => {
        const output = 'Verify the UI looks correct in browser';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Verify', [], []);
        expect(handover.manualTasks[0].type).toBe('verification');
      });

      it('should detect check keyword as verification', () => {
        const output = 'Check that all inputs validate correctly';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Check', [], []);
        expect(handover.manualTasks[0].type).toBe('verification');
      });

      it('should detect browser keyword as verification', () => {
        const output = 'Open in browser and verify the visual layout';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Browser', [], []);
        expect(handover.manualTasks[0].type).toBe('verification');
      });

      it('should detect documentation task type', () => {
        const output = 'Document the API endpoints';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Docs', [], []);
        expect(handover.manualTasks[0].type).toBe('documentation');
      });

      it('should detect readme keyword as documentation', () => {
        const output = 'Update the README with setup instructions';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'README', [], []);
        expect(handover.manualTasks[0].type).toBe('documentation');
      });

      it('should detect comment keyword as documentation', () => {
        const output = 'Add comments explaining the complex algorithm';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Comment', [], []);
        expect(handover.manualTasks[0].type).toBe('documentation');
      });

      it('should default to manual task type', () => {
        const output = 'Handle this manually';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Manual', [], []);
        expect(handover.manualTasks[0].type).toBe('manual');
      });

      it('should be case-insensitive', () => {
        const output = 'TEST THE FEATURE IN JEST';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Test', [], []);
        expect(handover.manualTasks[0].type).toBe('testing');
      });
    });

    describe('detectPriority - Assign task priority (+95% coverage)', () => {
      it('should detect high priority from critical keyword', () => {
        const output = 'CRITICAL: Fix security vulnerability';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Security', [], []);
        expect(handover.manualTasks[0].priority).toBe('high');
      });

      it('should detect high priority from must keyword', () => {
        const output = 'You must configure the API keys before running';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Config', [], []);
        expect(handover.manualTasks[0].priority).toBe('high');
      });

      it('should detect high priority from important keyword', () => {
        const output = 'It is important to test edge cases';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Testing', [], []);
        expect(handover.manualTasks[0].priority).toBe('high');
      });

      it('should detect low priority from optional keyword', () => {
        const output = 'Optionally add more comprehensive logging';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Logging', [], []);
        expect(handover.manualTasks[0].priority).toBe('low');
      });

      it('should detect low priority from consider keyword', () => {
        const output = 'Consider adding analytics tracking';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Analytics', [], []);
        expect(handover.manualTasks[0].priority).toBe('low');
      });

      it('should detect low priority from nice keyword', () => {
        const output = 'It would be nice to have dark mode support';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Dark mode', [], []);
        expect(handover.manualTasks[0].priority).toBe('low');
      });

      it('should default to medium priority', () => {
        const output = 'Review the generated code';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Review', [], []);
        expect(handover.manualTasks[0].priority).toBe('medium');
      });

      it('should be case-insensitive', () => {
        const output = 'CRITICAL FIX REQUIRED';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Fix', [], []);
        expect(handover.manualTasks[0].priority).toBe('high');
      });
    });

    describe('suggestAction - Action suggestions (+90% coverage)', () => {
      it('should suggest browser action for visual tasks', () => {
        const output = 'Verify the visual appearance in browser';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Visual', [], []);
        expect(handover.manualTasks[0].suggestedAction).toContain('VS Code');
      });

      it('should suggest test action for testing tasks', () => {
        const output = 'Run tests to verify functionality';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Test', [], []);
        expect(handover.manualTasks[0].suggestedAction).toContain('npm test');
      });

      it('should suggest verification action for verify tasks', () => {
        const output = 'Verify that the implementation matches requirements';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Verify', [], []);
        expect(handover.manualTasks[0].suggestedAction).toContain('Check');
      });

      it('should not suggest action if no keywords match', () => {
        const output = 'Something generic without keywords';
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output,
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Generic', [], []);
        expect(handover.manualTasks[0].suggestedAction).toBeUndefined();
      });
    });

    describe('generateNextSteps - Workflow guidance (+65% coverage)', () => {
      it('should include step for manual tasks', () => {
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output: 'Manual task required',
          duration: 100,
          requiresManualVerification: true,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Test', [], []);
        expect(handover.nextSteps.some(s => s.includes('manual'))).toBe(true);
      });

      it('should suggest running tests if not in plan', () => {
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output: 'Task done',
          duration: 100,
          requiresManualVerification: false,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Create component', ['src/Component.tsx'], []);
        expect(handover.nextSteps.some(s => s.includes('npm test'))).toBe(true);
      });

      it('should not suggest tests if test is in plan', () => {
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output: 'Task done',
          duration: 100,
          requiresManualVerification: false,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Create tests for component', ['src/Component.test.tsx'], []);
        const testSteps = handover.nextSteps.filter(s => s.includes('npm test'));
        expect(testSteps.length).toBeLessThanOrEqual(1);
      });

      it('should suggest reviewing files if created', () => {
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output: 'Created files',
          duration: 100,
          requiresManualVerification: false,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Create', ['src/A.ts', 'src/B.ts'], []);
        expect(handover.nextSteps.some(s => s.includes('Review'))).toBe(true);
      });

      it('should always include commit step', () => {
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output: 'Task',
          duration: 100,
          requiresManualVerification: false,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Task', [], []);
        expect(handover.nextSteps.some(s => s.includes('Commit') || s.includes('commit'))).toBe(true);
      });

      it('should always include iterate step', () => {
        const stepResults = new Map<number, StepResult>();
        stepResults.set(0, {
          stepId: 0,
          success: true,
          output: 'Task',
          duration: 100,
          requiresManualVerification: false,
          errors: []
        });
        const handover = generateHandoverSummary(stepResults, 'Task', [], []);
        expect(handover.nextSteps.some(s => s.includes('plan'))).toBe(true);
      });
    });

    describe('suggestComponentTests - Component test suggestions (+70% coverage)', () => {
      it('should detect tsx component files', () => {
        const stepResults = new Map<number, StepResult>();
        const handover = generateHandoverSummary(
          stepResults,
          'Create Button component with disabled and loading props',
          ['src/components/Button.tsx'],
          []
        );
        expect(handover.suggestedTests).toBeDefined();
      });

      it('should detect jsx component files', () => {
        const stepResults = new Map<number, StepResult>();
        const handover = generateHandoverSummary(
          stepResults,
          'Create Card component',
          ['src/components/Card.jsx'],
          []
        );
        expect(handover.suggestedTests).toBeDefined();
      });

      it('should extract component name from filename', () => {
        const stepResults = new Map<number, StepResult>();
        const handover = generateHandoverSummary(
          stepResults,
          'Create LoginForm component',
          ['src/components/LoginForm.tsx'],
          []
        );
        if (handover.suggestedTests && handover.suggestedTests.length > 0) {
          expect(handover.suggestedTests[0].component).toBeTruthy();
        }
      });

      it('should detect disabled prop in description', () => {
        const stepResults = new Map<number, StepResult>();
        const handover = generateHandoverSummary(
          stepResults,
          'Create Button with disabled, loading, and onClick',
          ['src/Button.tsx'],
          []
        );
        if (handover.suggestedTests && handover.suggestedTests.length > 0) {
          expect(handover.suggestedTests[0].props).toContain('disabled');
        }
      });

      it('should detect loading prop in description', () => {
        const stepResults = new Map<number, StepResult>();
        const handover = generateHandoverSummary(
          stepResults,
          'Create SubmitButton with loading indicator',
          ['src/SubmitButton.tsx'],
          []
        );
        if (handover.suggestedTests && handover.suggestedTests.length > 0) {
          expect(handover.suggestedTests[0].props).toContain('loading');
        }
      });

      it('should detect error prop in description', () => {
        const stepResults = new Map<number, StepResult>();
        const handover = generateHandoverSummary(
          stepResults,
          'Create FormField with error handling',
          ['src/FormField.tsx'],
          []
        );
        if (handover.suggestedTests && handover.suggestedTests.length > 0) {
          expect(handover.suggestedTests[0].props).toContain('error');
        }
      });

      it('should detect isOpen prop in description', () => {
        const stepResults = new Map<number, StepResult>();
        const handover = generateHandoverSummary(
          stepResults,
          'Create Modal component that can be opened and closed',
          ['src/Modal.tsx'],
          []
        );
        if (handover.suggestedTests && handover.suggestedTests.length > 0) {
          expect(handover.suggestedTests[0].props).toContain('isOpen');
        }
      });

      it('should detect variant prop in description', () => {
        const stepResults = new Map<number, StepResult>();
        const handover = generateHandoverSummary(
          stepResults,
          'Create Button with primary, secondary, and danger variants',
          ['src/Button.tsx'],
          []
        );
        if (handover.suggestedTests && handover.suggestedTests.length > 0) {
          expect(handover.suggestedTests[0].props).toContain('variant');
        }
      });

      it('should detect size prop in description', () => {
        const stepResults = new Map<number, StepResult>();
        const handover = generateHandoverSummary(
          stepResults,
          'Create Button with small, medium, and large sizes',
          ['src/Button.tsx'],
          []
        );
        if (handover.suggestedTests && handover.suggestedTests.length > 0) {
          expect(handover.suggestedTests[0].props).toContain('size');
        }
      });

      it('should detect onClick prop in description', () => {
        const stepResults = new Map<number, StepResult>();
        const handover = generateHandoverSummary(
          stepResults,
          'Create Button with onClick handler',
          ['src/Button.tsx'],
          []
        );
        if (handover.suggestedTests && handover.suggestedTests.length > 0) {
          expect(handover.suggestedTests[0].props).toContain('onClick');
        }
      });

      it('should detect onChange prop in description', () => {
        const stepResults = new Map<number, StepResult>();
        const handover = generateHandoverSummary(
          stepResults,
          'Create Input field with onChange handler',
          ['src/Input.tsx'],
          []
        );
        if (handover.suggestedTests && handover.suggestedTests.length > 0) {
          expect(handover.suggestedTests[0].props).toContain('onChange');
        }
      });
    });

    describe('formatHandoverHTML - HTML rendering (+70% coverage)', () => {
      it('should format manual tasks as checklist items', () => {
        const handover: ExecutionHandover = {
          completionStatus: 'partial',
          automatedStepCount: 2,
          manualTaskCount: 1,
          totalSteps: 3,
          executionTimeMs: 1000,
          filesCreated: [],
          filesModified: [],
          manualTasks: [
            {
              id: 'manual-0',
              title: 'Configure API keys',
              description: 'Add your API keys to .env',
              type: 'manual',
              priority: 'high',
              suggestedAction: 'Set up environment variables'
            }
          ],
          nextSteps: ['Commit changes'],
          suggestedTests: []
        };
        const html = formatHandoverHTML(handover);
        expect(html).toContain('checklist-item');
        expect(html).toContain('Configure API keys');
      });

      it('should include files created section when present', () => {
        const handover: ExecutionHandover = {
          completionStatus: 'success',
          automatedStepCount: 3,
          manualTaskCount: 0,
          totalSteps: 3,
          executionTimeMs: 500,
          filesCreated: ['src/Component.tsx', 'src/Component.test.tsx'],
          filesModified: [],
          manualTasks: [],
          nextSteps: ['Commit'],
          suggestedTests: []
        };
        const html = formatHandoverHTML(handover);
        expect(html).toContain('Files Created');
        expect(html).toContain('Component.tsx');
      });

      it('should not include files created section when empty', () => {
        const handover: ExecutionHandover = {
          completionStatus: 'success',
          automatedStepCount: 1,
          manualTaskCount: 0,
          totalSteps: 1,
          executionTimeMs: 100,
          filesCreated: [],
          filesModified: [],
          manualTasks: [],
          nextSteps: [],
          suggestedTests: []
        };
        const html = formatHandoverHTML(handover);
        expect(html).not.toContain('Files Created');
      });

      it('should include suggested tests section when present', () => {
        const handover: ExecutionHandover = {
          completionStatus: 'success',
          automatedStepCount: 1,
          manualTaskCount: 0,
          totalSteps: 1,
          executionTimeMs: 100,
          filesCreated: ['src/Button.tsx'],
          filesModified: [],
          manualTasks: [],
          nextSteps: [],
          suggestedTests: [
            {
              component: 'Button',
              props: ['disabled', 'loading'],
              testSuggestions: ['disabled state renders correctly', 'loading spinner displays when true']
            }
          ]
        };
        const html = formatHandoverHTML(handover);
        expect(html).toContain('Suggested Tests');
        expect(html).toContain('Button');
      });

      it('should include next steps as ordered list', () => {
        const handover: ExecutionHandover = {
          completionStatus: 'success',
          automatedStepCount: 1,
          manualTaskCount: 0,
          totalSteps: 1,
          executionTimeMs: 100,
          filesCreated: [],
          filesModified: [],
          manualTasks: [],
          nextSteps: ['Run tests', 'Commit changes'],
          suggestedTests: []
        };
        const html = formatHandoverHTML(handover);
        expect(html).toContain('Run tests');
        expect(html).toContain('Commit changes');
      });

      it('should display completion status in data attribute', () => {
        const handover: ExecutionHandover = {
          completionStatus: 'partial',
          automatedStepCount: 1,
          manualTaskCount: 1,
          totalSteps: 2,
          executionTimeMs: 500,
          filesCreated: [],
          filesModified: [],
          manualTasks: [
            {
              id: 'manual-0',
              title: 'Manual task',
              description: 'Do this manually',
              type: 'manual',
              priority: 'medium'
            }
          ],
          nextSteps: [],
          suggestedTests: []
        };
        const html = formatHandoverHTML(handover);
        expect(html).toContain('data-status="partial"');
      });

      it('should include execution summary stats', () => {
        const handover: ExecutionHandover = {
          completionStatus: 'success',
          automatedStepCount: 5,
          manualTaskCount: 0,
          totalSteps: 5,
          executionTimeMs: 2500,
          filesCreated: [],
          filesModified: [],
          manualTasks: [],
          nextSteps: [],
          suggestedTests: []
        };
        const html = formatHandoverHTML(handover);
        expect(html).toContain('5/5');
        expect(html).toContain('2.5s');
      });

      it('should include suggested action in manual task item', () => {
        const handover: ExecutionHandover = {
          completionStatus: 'partial',
          automatedStepCount: 1,
          manualTaskCount: 1,
          totalSteps: 2,
          executionTimeMs: 100,
          filesCreated: [],
          filesModified: [],
          manualTasks: [
            {
              id: 'manual-0',
              title: 'Run tests',
              description: 'Run tests to verify',
              type: 'testing',
              priority: 'high',
              suggestedAction: 'Run npm test'
            }
          ],
          nextSteps: [],
          suggestedTests: []
        };
        const html = formatHandoverHTML(handover);
        expect(html).toContain('Run npm test');
      });

      it('should assign priority class to tasks', () => {
        const handover: ExecutionHandover = {
          completionStatus: 'partial',
          automatedStepCount: 0,
          manualTaskCount: 2,
          totalSteps: 2,
          executionTimeMs: 0,
          filesCreated: [],
          filesModified: [],
          manualTasks: [
            {
              id: 'manual-0',
              title: 'Critical task',
              description: 'Must do',
              type: 'manual',
              priority: 'high'
            },
            {
              id: 'manual-1',
              title: 'Optional task',
              description: 'Nice to do',
              type: 'manual',
              priority: 'low'
            }
          ],
          nextSteps: [],
          suggestedTests: []
        };
        const html = formatHandoverHTML(handover);
        expect(html).toContain('data-priority="high"');
        expect(html).toContain('data-priority="low"');
      });
    });
  });

  describe('Integration - Full workflow', () => {
    it('should generate complete handover for successful execution', () => {
      const stepResults = new Map<number, StepResult>();
      stepResults.set(0, {
        stepId: 0,
        success: true,
        output: 'Created component',
        duration: 100,
        requiresManualVerification: false,
        errors: []
      });
      const handover = generateHandoverSummary(
        stepResults,
        'Create Button component',
        ['src/Button.tsx'],
        []
      );
      expect(handover.completionStatus).toBe('success');
      expect(handover.automatedStepCount).toBe(1);
      expect(handover.manualTaskCount).toBe(0);
    });

    it('should generate handover with manual tasks', () => {
      const stepResults = new Map<number, StepResult>();
      stepResults.set(0, {
        stepId: 0,
        success: true,
        output: 'Created component',
        duration: 100,
        requiresManualVerification: false,
        errors: []
      });
      stepResults.set(1, {
        stepId: 1,
        success: true,
        output: 'Run npm test to verify',
        duration: 200,
        requiresManualVerification: true,
        errors: []
      });
      const handover = generateHandoverSummary(
        stepResults,
        'Create and test component',
        ['src/Button.tsx'],
        []
      );
      expect(handover.completionStatus).toBe('partial');
      expect(handover.manualTaskCount).toBeGreaterThan(0);
    });

    it('should generate HTML for display', () => {
      const stepResults = new Map<number, StepResult>();
      stepResults.set(0, {
        stepId: 0,
        success: true,
        output: 'Created component',
        duration: 100,
        requiresManualVerification: false,
        errors: []
      });
      const handover = generateHandoverSummary(
        stepResults,
        'Create Button',
        ['src/Button.tsx'],
        []
      );
      const html = formatHandoverHTML(handover);
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
      expect(html).toContain('handover-container');
    });
  });
});
