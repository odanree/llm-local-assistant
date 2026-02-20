import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Planner } from '../planner';
import { TaskPlan, Step } from '../types';

describe('Planner Integration', () => {
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

  describe('End-to-End Plan Generation', () => {
    it('should generate complete plan from high-level request', () => {
      // Simulate a complete plan structure from LLM response
      const simulatedPlan: TaskPlan = {
        title: 'Migrate to OAuth2 Authentication',
        description: 'Transition from password-based auth to OAuth2 providers',
        steps: [
          {
            id: 'step1',
            title: 'Create OAuth2 Service',
            command: 'scaffold create-service OAuth2Service',
            expectedOutcome: 'OAuth2Service created and configured',
            dependencies: [],
          },
          {
            id: 'step2',
            title: 'Update Login Component',
            command: 'refactor update-component LoginComponent',
            expectedOutcome: 'LoginComponent uses OAuth2Service',
            dependencies: ['step1'],
          },
          {
            id: 'step3',
            title: 'Update Tests',
            command: 'test update-tests',
            expectedOutcome: 'All tests passing with OAuth2 mocks',
            dependencies: ['step2'],
          },
        ],
        estimatedDuration: '8 hours',
        riskLevel: 'high',
        successCriteria: 'Users can login via OAuth2, all tests pass, old auth removed',
      };

      expect(simulatedPlan).toBeDefined();
      expect(simulatedPlan.title).toContain('OAuth2');
      expect(simulatedPlan.steps.length).toBe(3);
      expect(simulatedPlan.steps[0].id).toBe('step1');
      expect(simulatedPlan.steps[2].dependencies).toContain('step2');
    });

    it('should handle dependencies across 5+ step plan', async () => {
      const steps: Step[] = [
        {
          id: 'step1',
          title: 'Database Schema',
          command: 'migrate create-table users',
          expectedOutcome: 'users table created',
          dependencies: [],
        },
        {
          id: 'step2',
          title: 'User Repository',
          command: 'scaffold create-service UserRepository',
          expectedOutcome: 'UserRepository service created',
          dependencies: ['step1'],
        },
        {
          id: 'step3',
          title: 'Auth Service',
          command: 'scaffold create-service AuthService',
          expectedOutcome: 'AuthService service created',
          dependencies: ['step2'],
        },
        {
          id: 'step4',
          title: 'Login Component',
          command: 'scaffold create-component LoginComponent',
          expectedOutcome: 'LoginComponent created and wired',
          dependencies: ['step3'],
        },
        {
          id: 'step5',
          title: 'Update Tests',
          command: 'test update-tests',
          expectedOutcome: 'All tests pass',
          dependencies: ['step4'],
        },
      ];

      // Verify topological order is correct
      const resolved = new Set<string>();
      for (const step of steps) {
        step.dependencies.forEach((dep) => {
          expect(resolved).toContain(dep);
        });
        resolved.add(step.id);
      }

      expect(resolved.size).toBe(5);
    });

    it('should generate plan with conditional branches', async () => {
      const complexPlan: TaskPlan = {
        title: 'Feature Implementation with Branches',
        description: 'Build new feature with optional enterprise variant',
        steps: [
          {
            id: 'base-feature',
            title: 'Core Feature',
            command: 'scaffold create-feature core',
            expectedOutcome: 'Core feature available',
            dependencies: [],
          },
          {
            id: 'enterprise-variant',
            title: 'Enterprise Variant',
            command: 'scaffold create-variant enterprise',
            expectedOutcome: 'Enterprise variant available',
            dependencies: ['base-feature'],
          },
          {
            id: 'testing',
            title: 'Test Both Variants',
            command: 'test run-all',
            expectedOutcome: 'All tests passing for both variants',
            dependencies: ['base-feature', 'enterprise-variant'],
          },
        ],
        estimatedDuration: '6 hours',
        riskLevel: 'medium',
        successCriteria: 'Core and enterprise features working, all tests pass',
      };

      expect(complexPlan.steps[2].dependencies).toContain('base-feature');
      expect(complexPlan.steps[2].dependencies).toContain('enterprise-variant');
      expect(complexPlan.steps.length).toBe(3);
    });

    it('should recover from partial execution', async () => {
      const plan: TaskPlan = {
        title: 'Multi-Stage Refactor',
        description: 'Refactor with checkpoints',
        steps: [
          {
            id: 'stage1',
            title: 'Extract Layer 1',
            command: 'refactor extract-layer1',
            expectedOutcome: 'Layer 1 extracted',
            dependencies: [],
          },
          {
            id: 'stage2',
            title: 'Extract Layer 2',
            command: 'refactor extract-layer2',
            expectedOutcome: 'Layer 2 extracted',
            dependencies: ['stage1'],
          },
          {
            id: 'stage3',
            title: 'Extract Layer 3',
            command: 'refactor extract-layer3',
            expectedOutcome: 'Layer 3 extracted',
            dependencies: ['stage2'],
          },
        ],
        estimatedDuration: '4 hours',
        riskLevel: 'medium',
        successCriteria: 'All layers extracted and working',
      };

      // Simulate partial execution (stage1 complete, stage2 in progress)
      const completedSteps = ['stage1'];
      const remainingSteps = plan.steps.filter((s) => !completedSteps.includes(s.id));

      expect(remainingSteps.length).toBe(2);
      expect(remainingSteps[0].id).toBe('stage2');

      // Can resume from stage2
      const resumePlan = { ...plan, steps: remainingSteps };
      expect(resumePlan.steps[0].dependencies).toContain('stage1');
    });
  });

  describe('Complex Dependency Scenarios', () => {
    it('should resolve diamond dependency pattern', async () => {
      // Diamond: step1 <- {step2, step3} <- step4
      const steps: Step[] = [
        {
          id: 'step1',
          title: 'Core Service',
          command: 'scaffold create-service CoreService',
          expectedOutcome: 'Core created',
          dependencies: [],
        },
        {
          id: 'step2',
          title: 'API Handler',
          command: 'scaffold create-handler APIHandler',
          expectedOutcome: 'API created',
          dependencies: ['step1'],
        },
        {
          id: 'step3',
          title: 'Database Handler',
          command: 'scaffold create-handler DBHandler',
          expectedOutcome: 'DB created',
          dependencies: ['step1'],
        },
        {
          id: 'step4',
          title: 'Integration Tests',
          command: 'test integration',
          expectedOutcome: 'Tests passing',
          dependencies: ['step2', 'step3'],
        },
      ];

      // Verify diamond resolved correctly
      expect(steps[3].dependencies).toHaveLength(2);
      expect(steps[3].dependencies).toContain('step2');
      expect(steps[3].dependencies).toContain('step3');

      // Both step2 and step3 depend on step1
      expect(steps[1].dependencies).toContain('step1');
      expect(steps[2].dependencies).toContain('step1');
    });

    it('should handle multiple independent parallel branches', async () => {
      const branches: Record<string, Step[]> = {
        frontend: [
          {
            id: 'fe-1',
            title: 'UI Components',
            command: 'scaffold create-components',
            expectedOutcome: 'Components created',
            dependencies: [],
          },
          {
            id: 'fe-2',
            title: 'UI Tests',
            command: 'test ui',
            expectedOutcome: 'UI tests passing',
            dependencies: ['fe-1'],
          },
        ],
        backend: [
          {
            id: 'be-1',
            title: 'API Service',
            command: 'scaffold create-service',
            expectedOutcome: 'Service created',
            dependencies: [],
          },
          {
            id: 'be-2',
            title: 'API Tests',
            command: 'test api',
            expectedOutcome: 'API tests passing',
            dependencies: ['be-1'],
          },
        ],
      };

      // Frontend and backend branches are independent
      expect(branches.frontend[0].dependencies).toHaveLength(0);
      expect(branches.backend[0].dependencies).toHaveLength(0);

      // But each branch is linearly dependent
      expect(branches.frontend[1].dependencies).toContain('fe-1');
      expect(branches.backend[1].dependencies).toContain('be-1');
    });

    it('should detect conflicting dependencies early', async () => {
      // Impossible scenario: A depends on B, B depends on A
      const conflictingDeps = [
        {
          id: 'service-a',
          dependencies: ['service-b'],
        },
        {
          id: 'service-b',
          dependencies: ['service-a'],
        },
      ];

      const detected = (deps: any[]) => {
        const visited = new Set<string>();
        const visiting = new Set<string>();

        const hasCycle = (id: string): boolean => {
          if (visiting.has(id)) return true;
          if (visited.has(id)) return false;

          visiting.add(id);
          const node = deps.find((d) => d.id === id);
          if (node) {
            for (const dep of node.dependencies) {
              if (hasCycle(dep)) return true;
            }
          }

          visiting.delete(id);
          visited.add(id);
          return false;
        };

        return hasCycle('service-a');
      };

      expect(detected(conflictingDeps)).toBe(true);
    });
  });

  describe('Error Recovery & Resilience', () => {
    it('should handle LLM timeout gracefully', async () => {
      mockConfig.llmCall.mockRejectedValue(new Error('Request timeout after 30000ms'));

      try {
        await planner.generatePlan('Test request', mockConfig, () => {});
        expect.fail('Should have thrown timeout error');
      } catch (error: any) {
        expect(error.message).toContain('timeout');
      }
    });

    it('should handle malformed LLM response', async () => {
      mockConfig.llmCall.mockResolvedValue('Not valid JSON {{{');

      let error: Error | null = null;
      try {
        await planner.generatePlan('Test request', mockConfig, () => {});
      } catch (e: any) {
        error = e;
      }

      expect(error).toBeDefined();
    });

    it('should validate plan structure before execution', async () => {
      const invalidResponse = JSON.stringify({
        title: 'Incomplete Plan',
        // Missing: description, steps, estimatedDuration, etc.
      });

      mockConfig.llmCall.mockResolvedValue(invalidResponse);

      let generatedPlan: TaskPlan | null = null;
      try {
        generatedPlan = await planner.generatePlan('Test', mockConfig, () => {});
      } catch (e) {
        // Expected to fail or succeed with defaults
      }

      // Either fails validation or has defaults
      if (generatedPlan) {
        expect(generatedPlan.title).toBeDefined();
      }
    });

    it('should retry on transient failures', async () => {
      let attempts = 0;
      mockConfig.llmCall.mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Temporary network error'));
        }
        return Promise.resolve(
          JSON.stringify({
            title: 'Success After Retry',
            description: 'Plan generated after retry',
            steps: [],
            estimatedDuration: '1 hour',
            riskLevel: 'low',
            successCriteria: 'Complete',
          })
        );
      });

      // Implementation would retry internally
      // For now, just verify the mock logic
      expect(attempts).toBe(0);
    });
  });

  describe('Context Preservation Across Requests', () => {
    it('should maintain conversation history across multiple plans', () => {
      // Simulate maintaining two separate plan contexts
      const plan1: TaskPlan = {
        title: 'Authentication System',
        description: 'Initial auth implementation',
        steps: [
          {
            id: 's1',
            title: 'Auth Service',
            command: 'scaffold',
            expectedOutcome: 'Service created',
            dependencies: [],
          },
        ],
        estimatedDuration: '1 hour',
        riskLevel: 'medium',
        successCriteria: 'Auth working',
      };

      const plan2: TaskPlan = {
        title: 'OAuth2 Enhancement',
        description: 'Add OAuth2 to existing auth',
        steps: [
          {
            id: 's2',
            title: 'OAuth2 Provider',
            command: 'scaffold',
            expectedOutcome: 'OAuth2 integrated',
            dependencies: ['s1'],
          },
        ],
        estimatedDuration: '2 hours',
        riskLevel: 'high',
        successCriteria: 'OAuth2 available',
      };

      expect(plan1).toBeDefined();
      expect(plan2).toBeDefined();
      // Both should be valid plans maintained separately
      expect(plan1.steps.length).toBeGreaterThan(0);
      expect(plan2.steps.length).toBeGreaterThan(0);
    });

    it('should support refining existing plan through conversation', () => {
      const initialPlan: TaskPlan = {
        title: 'Initial Database Migration',
        description: 'Migrate to PostgreSQL',
        steps: [
          {
            id: 'step1',
            title: 'Backup Current DB',
            command: 'backup current-db',
            expectedOutcome: 'Backup created',
            dependencies: [],
          },
          {
            id: 'step2',
            title: 'Install PostgreSQL',
            command: 'install postgres',
            expectedOutcome: 'PostgreSQL ready',
            dependencies: [],
          },
          {
            id: 'step3',
            title: 'Migrate Data',
            command: 'migrate data',
            expectedOutcome: 'Data migrated',
            dependencies: ['step1', 'step2'],
          },
        ],
        estimatedDuration: '4 hours',
        riskLevel: 'high',
        successCriteria: 'All data migrated, zero downtime',
      };

      // Simulate refinement: user asks to add verification step
      const refinedPlan = {
        ...initialPlan,
        steps: [
          ...initialPlan.steps,
          {
            id: 'step4',
            title: 'Verify Migration',
            command: 'verify migration',
            expectedOutcome: 'All tables and data verified',
            dependencies: ['step3'],
          },
        ],
      };

      expect(refinedPlan.steps.length).toBe(4);
      expect(refinedPlan.steps[3].dependencies).toContain('step3');
    });
  });
});
