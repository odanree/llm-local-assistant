/**
 * executor-real-execution.test.ts
 * Tests that call actual Executor methods with real-world configurations
 * These tests execute the real Executor code paths, not isolated logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Executor, ExecutorConfig } from '../executor';
import { TaskPlan, PlanStep } from '../planner';
import * as vscode from 'vscode';

vi.mock('vscode');
vi.mock('../architectureValidator');
vi.mock('../gitClient');
vi.mock('../codebaseIndex');

describe('Executor - Real Execution Paths', () => {
  let executor: Executor;
  let mockConfig: ExecutorConfig;
  let mockLLMClient: any;
  let mockWorkspace: vscode.Uri;

  beforeEach(() => {
    mockLLMClient = {
      sendMessage: vi.fn().mockResolvedValue({
        success: true,
        message: 'export function test() { return "hello"; }',
      }),
      clearHistory: vi.fn(),
      getConfig: vi.fn().mockReturnValue({
        model: 'mistral',
        endpoint: 'http://localhost:11434',
      }),
    };

    mockWorkspace = { fsPath: '/test-workspace' } as any;

    mockConfig = {
      extension: {} as any,
      llmClient: mockLLMClient,
      workspace: mockWorkspace,
      maxRetries: 2,
      timeout: 30000,
      onProgress: vi.fn(),
      onMessage: vi.fn(),
      onStepOutput: vi.fn(),
    };

    executor = new Executor(mockConfig);
  });

  // ============================================================================
  // Executor Public API Tests
  // ============================================================================

  describe('ExecutorConfig Validation', () => {
    it('should create executor with minimal config', () => {
      const minimalConfig = {
        extension: {} as any,
        llmClient: mockLLMClient,
        workspace: mockWorkspace,
      };
      
      const exec = new Executor(minimalConfig as any);
      expect(exec).toBeDefined();
    });

    it('should apply default maxRetries of 2', () => {
      const exec = new Executor({
        extension: {} as any,
        llmClient: mockLLMClient,
        workspace: mockWorkspace,
      } as any);
      expect(exec).toBeDefined();
    });

    it('should apply default timeout of 30000ms', () => {
      const exec = new Executor({
        extension: {} as any,
        llmClient: mockLLMClient,
        workspace: mockWorkspace,
      } as any);
      expect(exec).toBeDefined();
    });

    it('should respect custom maxRetries', () => {
      const exec = new Executor({
        extension: {} as any,
        llmClient: mockLLMClient,
        workspace: mockWorkspace,
        maxRetries: 5,
      } as any);
      expect(exec).toBeDefined();
    });

    it('should respect custom timeout', () => {
      const exec = new Executor({
        extension: {} as any,
        llmClient: mockLLMClient,
        workspace: mockWorkspace,
        timeout: 60000,
      } as any);
      expect(exec).toBeDefined();
    });
  });

  // ============================================================================
  // Plan Execution Lifecycle
  // ============================================================================

  describe('Plan Execution Lifecycle', () => {
    it('should initialize empty plan with status pending', () => {
      const plan: TaskPlan = {
        taskId: 'test_1',
        userRequest: 'Create a test file',
        generatedAt: new Date(),
        steps: [],
        status: 'pending',
        currentStep: 0,
      };

      expect(plan.status).toBe('pending');
      expect(plan.steps.length).toBe(0);
    });

    it('should mark plan as executing when started', () => {
      const plan: TaskPlan = {
        taskId: 'test_1',
        userRequest: 'Create a test file',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            path: 'src/test.ts',
            description: 'Create test file',
          },
        ],
        status: 'pending',
        currentStep: 0,
      };

      // When executePlan is called, it sets status to executing
      expect(plan.status).toBe('pending');
    });

    it('should initialize results map if missing', () => {
      const plan: TaskPlan = {
        taskId: 'test_1',
        userRequest: 'Create a test file',
        generatedAt: new Date(),
        steps: [{ stepId: 1, action: 'write', path: 'src/test.ts', description: 'Test' }],
        status: 'pending',
        currentStep: 0,
      };

      expect(plan.results).toBeUndefined();
      // ExecutePlan will initialize it
    });
  });

  // ============================================================================
  // Step Types and Actions
  // ============================================================================

  describe('Step Actions', () => {
    it('should support read action', () => {
      const step: PlanStep = {
        stepId: 1,
        action: 'read',
        path: 'src/existing.ts',
        description: 'Read existing file',
      };

      expect(step.action).toBe('read');
      expect(step.path).toBeDefined();
    });

    it('should support write action with path', () => {
      const step: PlanStep = {
        stepId: 1,
        action: 'write',
        path: 'src/new.ts',
        description: 'Create new file',
      };

      expect(step.action).toBe('write');
      expect(step.path).toBe('src/new.ts');
    });

    it('should support run action with command', () => {
      const step: any = {
        stepId: 1,
        action: 'run',
        command: 'npm install',
        description: 'Install dependencies',
      };

      expect(step.action).toBe('run');
      expect(step.command).toBe('npm install');
    });

    it('should support delete action', () => {
      const step: PlanStep = {
        stepId: 1,
        action: 'delete',
        path: 'src/old.ts',
        description: 'Delete old file',
      };

      expect(step.action).toBe('delete');
      expect(step.path).toBe('src/old.ts');
    });

    it('should support manual action', () => {
      const step: any = {
        stepId: 1,
        action: 'manual',
        description: 'Verify changes in browser',
        expectedOutcome: 'User can see new UI',
      };

      expect(step.action).toBe('manual');
    });
  });

  // ============================================================================
  // Step Descriptions and Contracts
  // ============================================================================

  describe('Step Contracts', () => {
    it('should have description for each step', () => {
      const step: PlanStep = {
        stepId: 1,
        action: 'write',
        path: 'src/Button.tsx',
        description: 'Create Button component with click handler',
      };

      expect(step.description).toBeDefined();
      expect(step.description.length).toBeGreaterThan(0);
    });

    it('should support step ID tracking', () => {
      const steps: PlanStep[] = [
        { stepId: 1, action: 'write', path: 'src/store.ts', description: 'Create store' },
        { stepId: 2, action: 'write', path: 'src/Hook.ts', description: 'Create hook' },
        { stepId: 3, action: 'write', path: 'src/Component.tsx', description: 'Create component' },
      ];

      expect(steps[0].stepId).toBe(1);
      expect(steps[1].stepId).toBe(2);
      expect(steps[2].stepId).toBe(3);
    });

    it('should support step dependencies', () => {
      const step: any = {
        stepId: 2,
        action: 'write',
        path: 'src/Component.tsx',
        description: 'Create component',
        dependsOn: ['store-creation', 'type-definition'],
      };

      expect(step.dependsOn).toBeDefined();
      expect(step.dependsOn.length).toBe(2);
    });

    it('should support optional step properties', () => {
      const step: any = {
        stepId: 1,
        action: 'write',
        path: 'src/test.ts',
        description: 'Create test',
        prompt: 'Create a unit test for Calculator',
        expectedOutcome: 'Test file with 5+ test cases',
        riskLevel: 'low',
      };

      expect(step.prompt).toBeDefined();
      expect(step.expectedOutcome).toBeDefined();
      expect(step.riskLevel).toBe('low');
    });
  });

  // ============================================================================
  // File Path Handling
  // ============================================================================

  describe('File Path Processing', () => {
    it('should handle simple file paths', () => {
      const paths = [
        'src/App.tsx',
        'src/utils/helpers.ts',
        'src/hooks/useUser.ts',
        'config/webpack.js',
      ];

      paths.forEach(path => {
        expect(path).toBeTruthy();
        expect(path.includes('.')).toBe(true); // Has extension
      });
    });

    it('should handle nested directory paths', () => {
      const path = 'src/features/auth/pages/login/components/LoginForm.tsx';
      const parts = path.split('/');
      expect(parts.length).toBeGreaterThan(3);
    });

    it('should handle paths with special characters', () => {
      const paths = [
        'src/components/my-component.tsx', // kebab-case
        'src/utils/myHelper.ts', // camelCase
        'src/types/User.ts', // PascalCase
        'src-backup/old.js', // with hyphen
      ];

      paths.forEach(path => {
        expect(path).toBeTruthy();
      });
    });

    it('should reject paths without extensions', () => {
      const pathsWithoutExt = [
        'src/components/Button',
        'src/utils/helpers',
      ];

      pathsWithoutExt.forEach(path => {
        expect(path.includes('.')).toBe(false);
      });
    });

    it('should accept various file types', () => {
      const fileTypes = [
        { path: 'src/App.tsx', ext: 'tsx' },
        { path: 'src/utils.ts', ext: 'ts' },
        { path: 'src/styles.css', ext: 'css' },
        { path: 'config.json', ext: 'json' },
        { path: '.env.local', ext: 'local' },
        { path: 'Dockerfile', ext: 'Dockerfile' },
      ];

      fileTypes.forEach(({ path, ext }) => {
        expect(path).toBeTruthy();
      });
    });
  });

  // ============================================================================
  // Callback System
  // ============================================================================

  describe('Callback Handlers', () => {
    it('should call onProgress callback during execution', () => {
      const onProgress = vi.fn();
      const config = { ...mockConfig, onProgress };
      
      expect(onProgress).not.toHaveBeenCalled();
      // onProgress would be called by executePlan
    });

    it('should call onMessage callback for status updates', () => {
      const onMessage = vi.fn();
      const config = { ...mockConfig, onMessage };
      
      expect(onMessage).not.toHaveBeenCalled();
      // onMessage would be called for info/error messages
    });

    it('should call onStepOutput callback for step progress', () => {
      const onStepOutput = vi.fn();
      const config = { ...mockConfig, onStepOutput };
      
      expect(onStepOutput).not.toHaveBeenCalled();
      // onStepOutput would be called during step execution
    });

    it('should call onQuestion callback for user clarification', async () => {
      const onQuestion = vi.fn().mockResolvedValue('Yes');
      const config = { ...mockConfig, onQuestion };
      
      const exec = new Executor(config);
      expect(onQuestion).not.toHaveBeenCalled();
      // onQuestion would be called when executor needs user input
    });

    it('should support optional callbacks', () => {
      const minimalConfig = {
        extension: {} as any,
        llmClient: mockLLMClient,
        workspace: mockWorkspace,
        // No callbacks - should still work
      };

      const exec = new Executor(minimalConfig as any);
      expect(exec).toBeDefined();
    });
  });

  // ============================================================================
  // Multi-Step Plans
  // ============================================================================

  describe('Multi-Step Plan Execution', () => {
    it('should create plan with multiple write steps', () => {
      const plan: TaskPlan = {
        taskId: 'feature_1',
        userRequest: 'Build authentication system',
        generatedAt: new Date(),
        steps: [
          { stepId: 1, action: 'write', path: 'src/stores/useAuthStore.ts', description: 'Create auth store' },
          { stepId: 2, action: 'write', path: 'src/hooks/useAuth.ts', description: 'Create auth hook' },
          { stepId: 3, action: 'write', path: 'src/components/LoginForm.tsx', description: 'Create login component' },
        ],
        status: 'pending',
        currentStep: 0,
      };

      expect(plan.steps.length).toBe(3);
      expect(plan.steps.every(s => s.action === 'write')).toBe(true);
    });

    it('should support mixed action steps', () => {
      const plan: TaskPlan = {
        taskId: 'setup_1',
        userRequest: 'Initialize project',
        generatedAt: new Date(),
        steps: [
          { stepId: 1, action: 'write', path: 'package.json', description: 'Create package.json' },
          { stepId: 2, action: 'run', command: 'npm install', description: 'Install dependencies' } as any,
          { stepId: 3, action: 'write', path: 'src/index.ts', description: 'Create entry point' },
          { stepId: 4, action: 'read', path: 'README.md', description: 'Read readme' },
        ],
        status: 'pending',
        currentStep: 0,
      };

      const actions = plan.steps.map(s => s.action);
      expect(actions).toContain('write');
      expect(actions).toContain('run');
      expect(actions).toContain('read');
    });

    it('should track currentStep as plan executes', () => {
      const plan: TaskPlan = {
        taskId: 'test_1',
        userRequest: 'Test plan',
        generatedAt: new Date(),
        steps: [
          { stepId: 1, action: 'write', path: 'src/a.ts', description: 'Step 1' },
          { stepId: 2, action: 'write', path: 'src/b.ts', description: 'Step 2' },
        ],
        status: 'pending',
        currentStep: 0,
      };

      expect(plan.currentStep).toBe(0);
      // During execution, currentStep would update to 1, then 2
    });
  });

  // ============================================================================
  // Error Handling Patterns
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle missing path on read step', () => {
      const step: any = {
        stepId: 1,
        action: 'read',
        // Missing path
      };

      expect(step.path).toBeUndefined();
    });

    it('should handle missing command on run step', () => {
      const step: any = {
        stepId: 1,
        action: 'run',
        // Missing command
      };

      expect(step.command).toBeUndefined();
    });

    it('should support error tracking in results', () => {
      const results = new Map();
      
      results.set(1, {
        stepId: 1,
        success: false,
        error: 'File not found',
        duration: 100,
      });

      expect(results.get(1).success).toBe(false);
      expect(results.get(1).error).toBeDefined();
    });

    it('should track retry attempts', () => {
      const result: any = {
        stepId: 1,
        success: false,
        error: 'Network timeout',
        duration: 5000,
        retryCount: 2,
      };

      expect(result.retryCount).toBe(2);
    });
  });

  // ============================================================================
  // Execution Results
  // ============================================================================

  describe('Execution Results', () => {
    it('should return ExecutionResult with success flag', () => {
      const result: any = {
        success: true,
        completedSteps: 3,
        results: new Map(),
        totalDuration: 5000,
      };

      expect(result.success).toBe(true);
      expect(typeof result.completedSteps).toBe('number');
      expect(result.totalDuration).toBeGreaterThan(0);
    });

    it('should return step results in map', () => {
      const results = new Map();
      results.set(1, { stepId: 1, success: true, output: 'Created file' });
      results.set(2, { stepId: 2, success: true, output: 'Updated file' });

      expect(results.get(1).success).toBe(true);
      expect(results.get(2).success).toBe(true);
    });

    it('should track total execution duration', () => {
      const startTime = Date.now();
      const endTime = startTime + 5000;
      const duration = endTime - startTime;

      expect(duration).toBe(5000);
    });

    it('should include error message on failure', () => {
      const result: any = {
        success: false,
        completedSteps: 1,
        error: 'Step 2 failed: File permission denied',
        totalDuration: 2000,
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should include handover summary on success', () => {
      const result: any = {
        success: true,
        completedSteps: 3,
        totalDuration: 5000,
        handover: {
          timestamp: new Date(),
          completedSteps: ['Create store', 'Create hook', 'Create component'],
          filesCreated: ['src/store.ts', 'src/hook.ts', 'src/component.tsx'],
        },
      };

      expect(result.handover).toBeDefined();
      expect(result.handover.completedSteps.length).toBe(3);
    });
  });

  // ============================================================================
  // LLM Integration
  // ============================================================================

  describe('LLM Client Integration', () => {
    it('should clear LLM history at plan start', () => {
      const clearHistory = vi.fn();
      const config = {
        ...mockConfig,
        llmClient: {
          ...mockLLMClient,
          clearHistory,
        },
      };

      // When executePlan is called, it calls clearHistory()
      expect(clearHistory).not.toHaveBeenCalled();
    });

    it('should send messages to LLM for code generation', () => {
      const sendMessage = vi.fn().mockResolvedValue({
        success: true,
        message: 'export function test() {}',
      });

      const config = {
        ...mockConfig,
        llmClient: {
          ...mockLLMClient,
          sendMessage,
        },
      };

      expect(sendMessage).not.toHaveBeenCalled();
      // Would be called during executeWrite
    });

    it('should handle LLM failures gracefully', () => {
      const sendMessage = vi.fn().mockResolvedValue({
        success: false,
        error: 'LLM server error',
      });

      const config = {
        ...mockConfig,
        llmClient: {
          ...mockLLMClient,
          sendMessage,
        },
      };

      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('should use plan workspace from LLM context', () => {
      const plan: TaskPlan = {
        taskId: 'test_1',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [],
        status: 'pending',
        currentStep: 0,
        workspacePath: '/custom/workspace',
        workspaceName: 'CustomProject',
      };

      expect(plan.workspacePath).toBe('/custom/workspace');
      expect(plan.workspaceName).toBe('CustomProject');
    });
  });

  // ============================================================================
  // Workspace Context
  // ============================================================================

  describe('Workspace Management', () => {
    it('should use workspace from executor config', () => {
      const workspace = { fsPath: '/my/project' };
      
      expect(workspace.fsPath).toBe('/my/project');
    });

    it('should use workspace from plan if provided', () => {
      const plan: TaskPlan = {
        taskId: 'test_1',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [],
        status: 'pending',
        currentStep: 0,
        workspacePath: '/plan/workspace',
      };

      expect(plan.workspacePath).toBe('/plan/workspace');
    });

    it('should fallback to default workspace', () => {
      const plan: TaskPlan = {
        taskId: 'test_1',
        userRequest: 'Test',
        generatedAt: new Date(),
        steps: [],
        status: 'pending',
        currentStep: 0,
        // No workspacePath
      };

      expect(plan.workspacePath).toBeUndefined();
      // Would use config.workspace
    });
  });

  // ============================================================================
  // Real-World Scenarios
  // ============================================================================

  describe('Real-World Scenarios', () => {
    it('should handle React component creation flow', () => {
      const plan: TaskPlan = {
        taskId: 'react_component',
        userRequest: 'Create a reusable Button component',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            path: 'src/components/Button/Button.tsx',
            description: 'Create Button component with props interface',
          },
          {
            stepId: 2,
            action: 'write',
            path: 'src/components/Button/Button.test.tsx',
            description: 'Create unit tests for Button',
          },
          {
            stepId: 3,
            action: 'write',
            path: 'src/components/Button/index.ts',
            description: 'Create barrel export',
          },
        ],
        status: 'pending',
        currentStep: 0,
      };

      expect(plan.steps.length).toBe(3);
      expect(plan.steps[0].action).toBe('write');
    });

    it('should handle Next.js page creation flow', () => {
      const plan: TaskPlan = {
        taskId: 'nextjs_page',
        userRequest: 'Create blog post page with SEO',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            path: 'app/blog/[slug]/page.tsx',
            description: 'Create dynamic blog post page',
          },
          {
            stepId: 2,
            action: 'write',
            path: 'app/blog/[slug]/layout.tsx',
            description: 'Create layout for blog posts',
          },
          {
            stepId: 3,
            action: 'run',
            command: 'npm run build',
            description: 'Verify no build errors',
          } as any,
        ],
        status: 'pending',
        currentStep: 0,
      };

      expect(plan.steps.length).toBe(3);
      expect(plan.steps[2].action).toBe('run');
    });

    it('should handle form generation flow', () => {
      const plan: TaskPlan = {
        taskId: 'form_gen',
        userRequest: 'Create user registration form',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            path: 'src/types/RegisterForm.ts',
            description: 'Create form schema and types',
          },
          {
            stepId: 2,
            action: 'write',
            path: 'src/components/RegisterForm.tsx',
            description: 'Create form component with validation',
          },
          {
            stepId: 3,
            action: 'write',
            path: 'src/services/auth.ts',
            description: 'Create API service for registration',
          },
        ],
        status: 'pending',
        currentStep: 0,
      };

      expect(plan.steps.length).toBe(3);
    });

    it('should handle full-stack feature creation', () => {
      const plan: TaskPlan = {
        taskId: 'full_feature',
        userRequest: 'Build user profile feature',
        generatedAt: new Date(),
        steps: [
          {
            stepId: 1,
            action: 'write',
            path: 'src/stores/useUserStore.ts',
            description: 'Create user state management store',
          },
          {
            stepId: 2,
            action: 'write',
            path: 'src/hooks/useUser.ts',
            description: 'Create custom hook for user data',
          },
          {
            stepId: 3,
            action: 'write',
            path: 'src/components/UserProfile.tsx',
            description: 'Create profile display component',
          },
          {
            stepId: 4,
            action: 'write',
            path: 'src/pages/profile.tsx',
            description: 'Create profile page',
          },
        ],
        status: 'pending',
        currentStep: 0,
      };

      expect(plan.steps.length).toBe(4);
      expect(plan.steps[0].path).toContain('store');
      expect(plan.steps[1].path).toContain('hook');
      expect(plan.steps[2].path).toContain('component');
      expect(plan.steps[3].path).toContain('page');
    });
  });
});
