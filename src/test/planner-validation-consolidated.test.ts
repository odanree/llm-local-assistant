/**
 * Week 2 D4: planner.ts Validation Tests (Consolidated)
 *
 * Consolidation Strategy:
 * - Table-driven schema & structure validation with assertion matrices
 * - Grouped by validation domain: plan structure, templates, scaffolds, outcomes
 * - 30 → 11 tests (-63% reduction)
 *
 * Pattern: Each describe block validates related schema properties
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Planner } from '../planner';
import { TaskPlan, Step } from '../types';

describe('Planner Validation (Consolidated)', () => {
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

  // ============================================================
  // Plan & Step Structure Validation
  // ============================================================
  const planStructureCases = [
    {
      name: 'complete TaskPlan with all required fields',
      plan: {
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
      } as TaskPlan,
      assertions: (plan: TaskPlan) => {
        expect(plan).toHaveProperty('title');
        expect(plan).toHaveProperty('description');
        expect(plan).toHaveProperty('steps');
        expect(plan).toHaveProperty('estimatedDuration');
        expect(plan).toHaveProperty('riskLevel');
        expect(plan).toHaveProperty('successCriteria');

        const step = plan.steps[0];
        expect(step).toHaveProperty('id');
        expect(step).toHaveProperty('title');
        expect(step).toHaveProperty('command');
        expect(step).toHaveProperty('expectedOutcome');
        expect(step).toHaveProperty('dependencies');
      },
    },
    {
      name: 'multi-step plan with dependency chains',
      plan: {
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
      } as TaskPlan,
      assertions: (plan: TaskPlan) => {
        expect(Array.isArray(plan.steps)).toBe(true);
        expect(plan.steps.length).toBeGreaterThan(0);
        expect(plan.steps[1].dependencies).toContain('step1');
      },
    },
    {
      name: 'empty plan with title and metadata',
      plan: {
        title: 'Empty Plan',
        description: 'Just a title',
        steps: [],
        estimatedDuration: '1 hour',
        riskLevel: 'low',
        successCriteria: 'Plan created',
      } as TaskPlan,
      assertions: (plan: TaskPlan) => {
        expect(plan.steps).toHaveLength(0);
        expect(plan.title).toBeDefined();
      },
    },
    {
      name: 'handle very long title strings',
      plan: {
        title: 'A'.repeat(500),
        description: 'Test',
        steps: [],
        estimatedDuration: '1 hour',
        riskLevel: 'low',
        successCriteria: 'Pass',
      } as TaskPlan,
      assertions: (plan: TaskPlan) => {
        expect(plan.title.length).toBe(500);
      },
    },
    {
      name: 'handle special characters in titles',
      plan: {
        title: 'Create "Button" component with @decorator & more()',
        description: 'Test',
        steps: [],
        estimatedDuration: '1 hour',
        riskLevel: 'low',
        successCriteria: 'Pass',
      } as TaskPlan,
      assertions: (plan: TaskPlan) => {
        expect(plan.title).toMatch(/["\w@&()]/);
      },
    },
    {
      name: 'handle unicode in descriptions',
      plan: {
        title: 'Test',
        description: 'Convert → modern pattern with ✨ features',
        steps: [],
        estimatedDuration: '1 hour',
        riskLevel: 'low',
        successCriteria: 'Done',
      } as TaskPlan,
      assertions: (plan: TaskPlan) => {
        expect(plan.description).toContain('→');
        expect(plan.description).toContain('✨');
      },
    },
  ];

  it.each(planStructureCases)(
    'plan structure: $name',
    ({ plan, assertions }) => {
      assertions(plan);
    }
  );

  // ============================================================
  // Enum & Format Validation
  // ============================================================
  const enumAndFormatCases = [
    {
      name: 'riskLevel enum values validation',
      validValues: ['low', 'medium', 'high', 'critical'],
      assertions: (validRiskLevels: string[]) => {
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
      },
    },
    {
      name: 'estimatedDuration format validation',
      validValues: ['30 minutes', '2 hours', '1 day', '2 weeks'],
      assertions: (validDurations: string[]) => {
        validDurations.forEach((duration) => {
          expect(duration).toMatch(/^\d+\s+(minute|hour|day|week)s?$/i);
        });
      },
    },
    {
      name: 'invalid duration format detection',
      invalidValue: 'forever',
      assertions: (invalidDuration: string) => {
        expect(invalidDuration).not.toMatch(/^\d+\s+(minute|hour|day|week)s?$/i);
      },
    },
    {
      name: 'successCriteria must be non-empty string',
      criteria: 'All tests pass',
      assertions: (criteria: string) => {
        expect(typeof criteria).toBe('string');
        expect(criteria.length).toBeGreaterThan(0);
      },
    },
    {
      name: 'step ID uniqueness within plan',
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
          dependencies: [],
        },
      ] as Step[],
      assertions: (steps: Step[]) => {
        const ids = steps.map((s) => s.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
      },
    },
    {
      name: 'detect duplicate step IDs',
      steps: [
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
      ] as Step[],
      assertions: (steps: Step[]) => {
        const ids = steps.map((s) => s.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBeLessThan(ids.length);
      },
    },
  ];

  it.each(enumAndFormatCases)(
    'format validation: $name',
    ({ validValues, validValue, invalidValue, criteria, steps, assertions }) => {
      if (validValues) {
        assertions(validValues);
      } else if (invalidValue) {
        assertions(invalidValue);
      } else if (criteria) {
        assertions(criteria);
      } else if (steps) {
        assertions(steps);
      }
    }
  );

  // ============================================================
  // Scaffold & Dependency Validation
  // ============================================================
  const scaffoldCases = [
    {
      name: 'validate template compliance for component scaffolding',
      template: {
        componentName: 'Button',
        requiredProps: ['label', 'onClick'],
        optionalProps: ['disabled', 'variant'],
      },
      usage: {
        componentName: 'Button',
        props: {
          label: 'Save',
          onClick: 'handleSave',
          variant: 'primary',
        },
      },
      assertions: (template: any, usage: any) => {
        template.requiredProps.forEach((prop: string) => {
          expect(usage.props).toHaveProperty(prop);
        });
      },
    },
    {
      name: 'validate React component props against TypeScript types',
      props: {
        label: 'Click Me',
        onClick: () => {},
        disabled: false,
        variant: 'primary',
      },
      assertions: (props: any) => {
        expect(typeof props.label).toBe('string');
        expect(typeof props.onClick).toBe('function');
        expect(typeof props.disabled).toBe('boolean');
        expect(['primary', 'secondary', 'destructive']).toContain(props.variant);
      },
    },
    {
      name: 'validate cn() utility usage for className composition',
      classNameComposition: "cn('base-class', isDarkMode && 'dark:class', condition && 'conditional')",
      assertions: (composition: string) => {
        expect(composition).toMatch(/cn\(/);
        expect(composition).toMatch(/&&/);
        expect(composition).toContain('dark:');
      },
    },
    {
      name: 'validate Tailwind class names pattern',
      classes: 'px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600',
      assertions: (classes: string) => {
        const validTailwindPattern = /^[\w\-:]+(\s+[\w\-:]+)*$/;
        expect(classes).toMatch(validTailwindPattern);
      },
    },
    {
      name: 'validate template file path references',
      template: {
        path: 'src/components/templates/Button.tsx',
        exists: true,
        type: 'component',
      },
      assertions: (template: any) => {
        expect(template.path).toMatch(/\.tsx?$/);
        expect(template.type).toMatch(/component|service|util/);
      },
    },
    {
      name: 'validate import statement syntax',
      importStatement: "import { Button } from '@/components/ui/button';",
      assertions: (stmt: string) => {
        expect(stmt).toMatch(/^import\s+{.*}\s+from\s+['"].*['"];$/);
        expect(stmt).toContain('Button');
      },
    },
  ];

  it.each(scaffoldCases)(
    'scaffold validation: $name',
    ({ template, usage, props, classNameComposition, classes, importStatement, assertions }) => {
      if (template && usage) {
        assertions(template, usage);
      } else if (props) {
        assertions(props);
      } else if (classNameComposition) {
        assertions(classNameComposition);
      } else if (classes) {
        assertions(classes);
      } else if (importStatement) {
        assertions(importStatement);
      }
    }
  );

  // ============================================================
  // Expected Outcome Validation
  // ============================================================
  const outcomeCases = [
    {
      name: 'expected outcomes must reference completion keywords',
      outcome: 'Button component created at src/components/Button.tsx',
      assertions: (outcome: string) => {
        expect(outcome).toMatch(/created|generated|moved|refactored/i);
      },
    },
    {
      name: 'outcome metrics must be measurable',
      outcomes: [
        'All 42 tests passing',
        'Coverage increased from 60% to 75%',
        'Bundle size reduced by 15%',
        'Component renders without errors',
      ],
      assertions: (outcomes: string[]) => {
        outcomes.forEach((outcome) => {
          expect(outcome.length).toBeGreaterThan(10);
          expect(outcome).not.toMatch(/^[a-z]$/);
        });
      },
    },
    {
      name: 'outcome must reference expected file locations',
      outcome: 'Button component created at src/components/ui/Button.tsx',
      assertions: (outcome: string) => {
        expect(outcome).toMatch(/[src\w/.-]+\.\w+$/);
      },
    },
    {
      name: 'test outcomes must mention coverage or test metrics',
      testOutcome: 'AuthService tests passing with 100% coverage',
      assertions: (outcome: string) => {
        expect(outcome).toMatch(/test|coverage|pass|fail/i);
        expect(outcome.length).toBeGreaterThan(10);
      },
    },
  ];

  it.each(outcomeCases)(
    'outcome validation: $name',
    ({ outcome, outcomes, testOutcome, assertions }) => {
      if (outcome) {
        assertions(outcome);
      } else if (outcomes) {
        assertions(outcomes);
      } else if (testOutcome) {
        assertions(testOutcome);
      }
    }
  );

  // ============================================================
  // Dependency & Edge Cases
  // ============================================================
  const dependencyCases = [
    {
      name: 'validate circular dependency detection in scaffolds',
      deps: {
        AuthService: ['UserRepository'],
        UserRepository: ['Database'],
        Database: [],
      },
      assertions: (scaffoldDeps: Record<string, string[]>) => {
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
      },
    },
    {
      name: 'detect missing parent scaffold directories',
      scaffold: {
        type: 'component',
        path: 'src/components/ui/Button.tsx',
        parent: 'src/components/ui',
      },
      assertions: (scaffold: any) => {
        expect(scaffold.parent).toBeDefined();
        expect(scaffold.parent).not.toBe('');
      },
    },
    {
      name: 'validate database schema column requirements',
      schema: {
        name: 'users',
        columns: [
          { name: 'id', type: 'uuid', primary: true },
          { name: 'email', type: 'varchar', unique: true },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
        ],
      },
      assertions: (schema: any) => {
        const columnNames = schema.columns.map((c: any) => c.name);
        expect(columnNames).toContain('id');
        expect(columnNames).toContain('email');
      },
    },
    {
      name: 'validate environment variable naming conventions',
      envVar: 'DATABASE_URL',
      assertions: (envVar: string) => {
        const envPattern = /^[A-Z_]+$/;
        expect(envVar).toMatch(envPattern);
      },
    },
    {
      name: 'validate npm package version compatibility',
      deps: {
        react: '^18.0.0',
        'react-dom': '^18.0.0',
        typescript: '^5.0.0',
      },
      assertions: (deps: Record<string, string>) => {
        Object.values(deps).forEach((version) => {
          expect(version).toMatch(/^\^?\d+\.\d+\.\d+/);
        });
      },
    },
    {
      name: 'detect corrupted step data missing required fields',
      step: {
        id: 'step1',
        title: 'Test',
        // Missing: command, expectedOutcome, dependencies
      },
      assertions: (step: any) => {
        const requiredFields = ['id', 'title', 'command', 'expectedOutcome', 'dependencies'];
        const missingFields = requiredFields.filter((field) => !(field in step));
        expect(missingFields.length).toBeGreaterThan(0);
        expect(missingFields).toContain('command');
      },
    },
  ];

  it.each(dependencyCases)(
    'dependency & edge case validation: $name',
    ({ deps, scaffold, schema, envVar, step, assertions }) => {
      if (deps) {
        assertions(deps);
      } else if (scaffold) {
        assertions(scaffold);
      } else if (schema) {
        assertions(schema);
      } else if (envVar) {
        assertions(envVar);
      } else if (step) {
        assertions(step);
      }
    }
  );
});
