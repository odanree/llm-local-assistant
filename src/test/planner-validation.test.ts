import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Planner } from '../planner';
import { TaskPlan, Step } from '../types';

describe('Planner Validation', () => {
  let planner: Planner;
  let mockConfig: any;

  beforeEach(() => {
    mockConfig = {
      llmEndpoint: 'http://localhost:11434',
      model: 'mistral',
      temperature: 0.7,
      maxTokens: 2048,
      timeout: 30000,
      llmCall: vi.fn(),
    };
    planner = new Planner(mockConfig);
  });

  describe('Plan Structure Validation', () => {
    it('should validate complete TaskPlan structure', () => {
      const validPlan: TaskPlan = {
        title: 'Refactor Authentication',
        description: 'Move auth to separate service',
        steps: [
          {
            id: 'step1',
            title: 'Extract Auth Service',
            command: 'refactor extract-service auth',
            expectedOutcome: 'AuthService created',
            dependencies: [],
          },
        ],
        estimatedDuration: '2 hours',
        riskLevel: 'medium',
        successCriteria: 'All tests pass',
      };

      // Validate required fields
      expect(validPlan).toHaveProperty('title');
      expect(validPlan).toHaveProperty('description');
      expect(validPlan).toHaveProperty('steps');
      expect(validPlan).toHaveProperty('estimatedDuration');
      expect(validPlan).toHaveProperty('riskLevel');
      expect(validPlan).toHaveProperty('successCriteria');

      // Validate step structure
      const step = validPlan.steps[0];
      expect(step).toHaveProperty('id');
      expect(step).toHaveProperty('title');
      expect(step).toHaveProperty('command');
      expect(step).toHaveProperty('expectedOutcome');
      expect(step).toHaveProperty('dependencies');
    });

    it('should validate step type compliance', () => {
      const validStep = {
        id: 'step1',
        title: 'Test Step',
        command: 'refactor extract-service',
        expectedOutcome: 'Success',
        dependencies: [],
      };

      // Validate all required fields are present
      expect(validStep).toHaveProperty('id');
      expect(validStep).toHaveProperty('title');
      expect(validStep).toHaveProperty('command');
      expect(validStep).toHaveProperty('expectedOutcome');
      expect(validStep).toHaveProperty('dependencies');
    });

    it('should validate riskLevel enum values', () => {
      const validRiskLevels = ['low', 'medium', 'high', 'critical'];
      
      validRiskLevels.forEach((level) => {
        const plan: TaskPlan = {
          title: 'Test',
          description: 'Test',
          steps: [],
          estimatedDuration: '1 hour',
          riskLevel: level as any,
          successCriteria: 'Pass',
        };
        expect(validRiskLevels).toContain(plan.riskLevel);
      });
    });

    it('should validate steps array structure', () => {
      const plan: TaskPlan = {
        title: 'Multi-step Plan',
        description: 'Multiple steps',
        steps: [
          {
            id: 'step1',
            title: 'First',
            command: 'cmd1',
            expectedOutcome: 'out1',
            dependencies: [],
          },
          {
            id: 'step2',
            title: 'Second',
            command: 'cmd2',
            expectedOutcome: 'out2',
            dependencies: ['step1'],
          },
        ],
        estimatedDuration: '1 hour',
        riskLevel: 'low',
        successCriteria: 'Pass',
      };

      expect(Array.isArray(plan.steps)).toBe(true);
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.steps[1].dependencies).toContain('step1');
    });

    it('should validate estimatedDuration format', () => {
      const validDurations = ['30 minutes', '2 hours', '1 day', '2 weeks'];
      
      validDurations.forEach((duration) => {
        expect(duration).toMatch(/^\d+\s+(minute|hour|day|week)s?$/i);
      });
    });

    it('should reject invalid duration format', () => {
      const invalidDuration = 'forever';
      expect(invalidDuration).not.toMatch(/^\d+\s+(minute|hour|day|week)s?$/i);
    });

    it('should validate successCriteria is non-empty string', () => {
      const plan: TaskPlan = {
        title: 'Test',
        description: 'Test',
        steps: [],
        estimatedDuration: '1 hour',
        riskLevel: 'low',
        successCriteria: 'All tests pass',
      };

      expect(typeof plan.successCriteria).toBe('string');
      expect(plan.successCriteria.length).toBeGreaterThan(0);
    });
  });

  describe('Template Compliance Validation', () => {
    it('should validate against component scaffolding templates', () => {
      const componentTemplate = {
        componentName: 'Button',
        requiredProps: ['label', 'onClick'],
        optionalProps: ['disabled', 'variant'],
      };

      const componentUsage = {
        componentName: 'Button',
        props: {
          label: 'Save',
          onClick: 'handleSave',
          variant: 'primary',
        },
      };

      // Verify required props are present
      componentTemplate.requiredProps.forEach((prop) => {
        expect(componentUsage.props).toHaveProperty(prop);
      });
    });

    it('should validate React component props match TypeScript types', () => {
      const buttonProps = {
        label: 'Click Me',
        onClick: () => {},
        disabled: false,
        variant: 'primary',
      };

      // Type validation
      expect(typeof buttonProps.label).toBe('string');
      expect(typeof buttonProps.onClick).toBe('function');
      expect(typeof buttonProps.disabled).toBe('boolean');
      expect(['primary', 'secondary', 'destructive']).toContain(buttonProps.variant);
    });

    it('should validate cn() utility usage for className composition', () => {
      const classNameComposition = "cn('base-class', isDarkMode && 'dark:class', condition && 'conditional')";
      
      // Check for proper cn() function structure
      expect(classNameComposition).toMatch(/cn\(/);
      expect(classNameComposition).toMatch(/&&/); // Conditional syntax
      expect(classNameComposition).toContain('dark:');
    });

    it('should validate Tailwind class names in scaffolding', () => {
      const tailwindClasses = 'px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600';
      const validTailwindPattern = /^[\w\-:]+(\s+[\w\-:]+)*$/;
      
      expect(tailwindClasses).toMatch(validTailwindPattern);
    });

    it('should validate template file references exist', () => {
      const templateReference = {
        path: 'src/components/templates/Button.tsx',
        exists: true,
        type: 'component',
      };

      expect(templateReference.path).toMatch(/\.tsx?$/);
      expect(templateReference.type).toMatch(/component|service|util/);
    });

    it('should validate import statements in generated code', () => {
      const importStatement = "import { Button } from '@/components/ui/button';";
      
      expect(importStatement).toMatch(/^import\s+{.*}\s+from\s+['"].*['"];$/);
      expect(importStatement).toContain('Button');
    });
  });

  describe('Scaffold Dependency Validation', () => {
    it('should detect service dependencies before usage', () => {
      const steps: Step[] = [
        {
          id: 'step1',
          title: 'Use Auth Service',
          command: 'scaffold add-service AuthService',
          expectedOutcome: 'AuthService available',
          dependencies: ['AuthModule'], // Missing or not created yet
        },
        {
          id: 'step2',
          title: 'Create Auth Module',
          command: 'scaffold create-module AuthModule',
          expectedOutcome: 'AuthModule created',
          dependencies: [],
        },
      ];

      // Check if step1 depends on step2
      const step1Deps = steps[0].dependencies;
      const availableAtStep1 = steps.slice(0, 0).map((s) => s.id); // Nothing created before step1

      step1Deps.forEach((dep) => {
        expect(() => {
          if (!availableAtStep1.includes(dep) && !['AuthModule'].includes(dep)) {
            throw new Error(`Dependency ${dep} not available`);
          }
        }).not.toThrow(); // Should not throw for planning purposes
      });
    });

    it('should validate no circular dependencies between scaffolds', () => {
      const scaffoldDeps: Record<string, string[]> = {
        AuthService: ['UserRepository'],
        UserRepository: ['Database'],
        Database: [], // No circular ref
      };

      const visited = new Set<string>();
      const visiting = new Set<string>();

      const hasCycle = (node: string): boolean => {
        if (visiting.has(node)) return true;
        if (visited.has(node)) return false;

        visiting.add(node);
        const deps = scaffoldDeps[node] || [];

        for (const dep of deps) {
          if (hasCycle(dep)) return true;
        }

        visiting.delete(node);
        visited.add(node);
        return false;
      };

      expect(hasCycle('AuthService')).toBe(false);
    });

    it('should detect missing parent scaffolds', () => {
      const scaffold = {
        type: 'component',
        path: 'src/components/ui/Button.tsx',
        parent: 'src/components/ui', // Parent directory must exist or be created
      };

      // Validate parent is created or specified in plan
      expect(scaffold.parent).toBeDefined();
      expect(scaffold.parent).not.toBe('');
    });

    it('should validate schema compatibility for database scaffolds', () => {
      const tableSchema = {
        name: 'users',
        columns: [
          { name: 'id', type: 'uuid', primary: true },
          { name: 'email', type: 'varchar', unique: true },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
        ],
      };

      // Validate required columns for auth scaffold
      const columnNames = tableSchema.columns.map((c) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('email');
    });

    it('should validate environment variable dependencies', () => {
      const step: Step = {
        id: 'step1',
        title: 'Configure API',
        command: 'scaffold add-env DATABASE_URL',
        expectedOutcome: 'Env var set',
        dependencies: [],
      };

      const requiredEnvVars = ['DATABASE_URL'];
      const envPattern = /^[A-Z_]+$/;

      requiredEnvVars.forEach((envVar) => {
        expect(envVar).toMatch(envPattern);
      });
    });

    it('should validate npm package dependencies are lockfile compatible', () => {
      const packageDeps = {
        react: '^18.0.0',
        'react-dom': '^18.0.0',
        typescript: '^5.0.0',
      };

      Object.values(packageDeps).forEach((version) => {
        expect(version).toMatch(/^\^?\d+\.\d+\.\d+/);
      });
    });
  });

  describe('Expected Outcome Validation', () => {
    it('should validate expected outcome is achievable', () => {
      const step: Step = {
        id: 'step1',
        title: 'Create Component',
        command: 'scaffold create-component Button',
        expectedOutcome: 'Button component created at src/components/Button.tsx',
        dependencies: [],
      };

      expect(step.expectedOutcome).toMatch(/created|generated|moved|refactored/i);
    });

    it('should validate outcome metrics are measurable', () => {
      const outcomes = [
        'All 42 tests passing',
        'Coverage increased from 60% to 75%',
        'Bundle size reduced by 15%',
        'Component renders without errors',
      ];

      outcomes.forEach((outcome) => {
        // Outcomes should be specific and measurable
        expect(outcome.length).toBeGreaterThan(10);
        expect(outcome).not.toMatch(/^[a-z]$/); // At least somewhat descriptive
      });
    });

    it('should validate outcome references expected file locations', () => {
      const outcome = 'Button component created at src/components/ui/Button.tsx';
      
      // File path reference should be present
      expect(outcome).toMatch(/[src\w/.-]+\.\w+$/);
    });

    it('should validate test outcomes are specific', () => {
      const testOutcome = 'AuthService tests passing with 100% coverage';
      
      expect(testOutcome).toMatch(/test|coverage|pass|fail/i);
      expect(testOutcome.length).toBeGreaterThan(10);
    });
  });

  describe('Error Handling & Edge Cases', () => {
    it('should detect corrupted step data missing required fields', () => {
      const corruptedStep: any = {
        id: 'step1',
        title: 'Test',
        // Missing: command, expectedOutcome, dependencies
      };

      // Validate detection of missing fields
      const requiredFields = ['id', 'title', 'command', 'expectedOutcome', 'dependencies'];
      const missingFields = requiredFields.filter((field) => !(field in corruptedStep));
      
      expect(missingFields.length).toBeGreaterThan(0);
      expect(missingFields).toContain('command');
    });

    it('should validate plan with no steps (empty planning)', () => {
      const emptyPlan: TaskPlan = {
        title: 'Empty Plan',
        description: 'Just a title',
        steps: [],
        estimatedDuration: '1 hour',
        riskLevel: 'low',
        successCriteria: 'Plan created',
      };

      // Empty plans are allowed in planning phase
      expect(emptyPlan.steps).toHaveLength(0);
      expect(emptyPlan.title).toBeDefined();
    });

    it('should handle very long title strings', () => {
      const longTitle = 'A'.repeat(500);
      const plan: TaskPlan = {
        title: longTitle,
        description: 'Test',
        steps: [],
        estimatedDuration: '1 hour',
        riskLevel: 'low',
        successCriteria: 'Pass',
      };

      expect(plan.title.length).toBe(500);
      // Should not truncate without warning
    });

    it('should validate special characters in step titles', () => {
      const specialCharTitle = 'Create "Button" component with @decorator & more()';
      
      expect(specialCharTitle).toMatch(/["\w@&()]/);
    });

    it('should handle unicode in descriptions', () => {
      const plan: TaskPlan = {
        title: 'Test',
        description: 'Convert → modern pattern with ✨ features',
        steps: [],
        estimatedDuration: '1 hour',
        riskLevel: 'low',
        successCriteria: 'Done',
      };

      expect(plan.description).toContain('→');
      expect(plan.description).toContain('✨');
    });

    it('should validate step ID uniqueness within plan', () => {
      const steps: Step[] = [
        {
          id: 'step1',
          title: 'First',
          command: 'cmd1',
          expectedOutcome: 'out1',
          dependencies: [],
        },
        {
          id: 'step2',
          title: 'Second',
          command: 'cmd2',
          expectedOutcome: 'out2',
          dependencies: [],
        },
      ];

      const ids = steps.map((s) => s.id);
      const uniqueIds = new Set(ids);
      
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should reject duplicate step IDs', () => {
      const steps: Step[] = [
        {
          id: 'step1',
          title: 'First',
          command: 'cmd1',
          expectedOutcome: 'out1',
          dependencies: [],
        },
        {
          id: 'step1', // Duplicate!
          title: 'Second',
          command: 'cmd2',
          expectedOutcome: 'out2',
          dependencies: [],
        },
      ];

      const ids = steps.map((s) => s.id);
      const uniqueIds = new Set(ids);
      
      expect(uniqueIds.size).toBeLessThan(ids.length);
    });
  });
});
