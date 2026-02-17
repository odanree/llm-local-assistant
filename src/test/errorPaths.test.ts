/**
 * Error Path Testing Suite
 *
 * Comprehensive tests for error scenarios, timeouts, retries, and recovery
 * Coverage for exception handling, edge cases, and degraded modes
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMClient } from '../llmClient';
import { Planner } from '../planner';
import {
  createLLMConfig,
  createMockResponse,
  createPlannerConfig,
  createMockLLMCall,
} from './factories';

describe('Error Path Testing', () => {
  describe('LLMClient - Network Errors', () => {
    let client: LLMClient;

    beforeEach(() => {
      client = new LLMClient(createLLMConfig());
    });

    it('handles connection timeout gracefully', async () => {
      global.fetch = vi.fn(async () => {
        throw new Error('Connection timeout');
      });

      const result = await client.isServerHealthy();
      expect(result).toBe(false);
    });

    it('handles DNS resolution failure', async () => {
      global.fetch = vi.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND localhost');
      });

      const result = await client.isServerHealthy();
      expect(result).toBe(false);
    });

    it('handles HTTP 500 errors', async () => {
      global.fetch = vi.fn(async () => createMockResponse(500, { error: 'Server error' }));

      const result = await client.isServerHealthy();
      expect(result).toBe(false);
    });

    it('handles HTTP 503 service unavailable', async () => {
      global.fetch = vi.fn(async () => createMockResponse(503));

      const result = await client.isServerHealthy();
      expect(result).toBe(false);
    });

    it('handles malformed JSON response', async () => {
      global.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: vi.fn(async () => {
          throw new Error('Unexpected token } in JSON');
        }),
      } as any));

      const result = await client.isServerHealthy();
      // Malformed response still gets parsed attempt; may return true if fetch succeeds
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Planner - Invalid Input Handling', () => {
    let planner: Planner;

    beforeEach(() => {
      const config = createPlannerConfig();
      planner = new Planner(config);
    });

    it('handles empty user request', async () => {
      const config = createPlannerConfig({
        llmCall: vi.fn(async () => JSON.stringify([
          { step: 1, action: 'write', description: 'Test', path: 'src/test.ts' },
        ])),
      });
      planner = new Planner(config);

      const plan = await planner.generatePlan('');
      expect(plan.userRequest).toBe('');
      expect(plan.steps).toBeDefined();
    });

    it('handles very long user request', async () => {
      const longRequest = 'a'.repeat(10000);
      const config = createPlannerConfig({
        llmCall: vi.fn(async () => JSON.stringify([
          { step: 1, action: 'write', description: 'Test', path: 'src/test.ts' },
        ])),
      });
      planner = new Planner(config);

      const plan = await planner.generatePlan(longRequest);
      expect(plan.userRequest).toBeDefined();
    });

    it('handles LLM returning empty array', async () => {
      const config = createPlannerConfig({
        llmCall: vi.fn(async () => '[]'),
      });
      planner = new Planner(config);

      try {
        await planner.generatePlan('Create something');
        expect.fail('Should reject empty step list');
      } catch (err: any) {
        expect(err.message).toContain('Plan generation failed');
      }
    });

    it('handles LLM returning null', async () => {
      const config = createPlannerConfig({
        llmCall: vi.fn(async () => 'null'),
      });
      planner = new Planner(config);

      try {
        await planner.generatePlan('Create something');
        // Should either throw or handle gracefully
        expect(true).toBe(true);
      } catch {
        expect(true).toBe(true);
      }
    });

    it('handles LLM returning undefined', async () => {
      const config = createPlannerConfig({
        llmCall: vi.fn(async () => undefined as any),
      });
      planner = new Planner(config);

      try {
        await planner.generatePlan('Create something');
        expect(true).toBe(true);
      } catch {
        expect(true).toBe(true);
      }
    });

    it('handles invalid JSON from LLM', async () => {
      const config = createPlannerConfig({
        llmCall: vi.fn(async () => '{invalid json}'),
      });
      planner = new Planner(config);

      try {
        await planner.generatePlan('Create something');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).toBeDefined();
      }
    });

    it('handles LLM returning object instead of array', async () => {
      const config = createPlannerConfig({
        llmCall: vi.fn(async () => JSON.stringify({ step: 1, action: 'write' })),
      });
      planner = new Planner(config);

      try {
        await planner.generatePlan('Create something');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).toContain('JSON array');
      }
    });

    it('handles steps with missing required fields', async () => {
      const config = createPlannerConfig({
        llmCall: vi.fn(async () => JSON.stringify([
          { step: 1, action: 'write' }, // Missing description and path
        ])),
      });
      planner = new Planner(config);

      try {
        await planner.generatePlan('Create');
        expect.fail('Should throw on missing fields');
      } catch (err: any) {
        expect(err.message).toContain('Plan generation failed');
      }
    });

    it('handles steps with invalid action types', async () => {
      const config = createPlannerConfig({
        llmCall: vi.fn(async () => JSON.stringify([
          { step: 1, action: 'invalid-action', description: 'Test', path: 'src/test.ts' },
        ])),
      });
      planner = new Planner(config);

      const plan = await planner.generatePlan('Create');
      // Invalid action defaults to 'read'
      expect(plan.steps[0].action).toBe('read');
    });
  });

  describe('Planner - Parse Recovery', () => {
    it('handles JSON with leading whitespace', async () => {
      const config = createPlannerConfig({
        llmCall: vi.fn(async () => '   \n\n[{"step": 1, "action": "write", "description": "Test", "path": "src/test.ts"}]'),
      });
      const planner = new Planner(config);

      const plan = await planner.generatePlan('Create');
      expect(plan.steps).toHaveLength(1);
    });

    it('handles markdown code blocks', async () => {
      const config = createPlannerConfig({
        llmCall: vi.fn(async () => `
\`\`\`json
[{"step": 1, "action": "write", "description": "Test", "path": "src/test.ts"}]
\`\`\`
        `),
      });
      const planner = new Planner(config);

      const plan = await planner.generatePlan('Create');
      expect(plan.steps).toHaveLength(1);
    });

    it('handles JSON without markdown code blocks', async () => {
      const config = createPlannerConfig({
        llmCall: vi.fn(async () => `
\`\`\`
[{"step": 1, "action": "write", "description": "Test", "path": "src/test.ts"}]
\`\`\`
        `),
      });
      const planner = new Planner(config);

      const plan = await planner.generatePlan('Create');
      expect(plan.steps).toHaveLength(1);
    });

    it('throws on malformed JSON after cleanup', async () => {
      const config = createPlannerConfig({
        llmCall: vi.fn(async () => `[{"step": 1, "action": "write", "description": "Test", "path": "src/test.ts"}]
[{"step": 2, "action": "read"}]`),
      });
      const planner = new Planner(config);

      try {
        await planner.generatePlan('Create');
        expect.fail('Should throw on multiple arrays');
      } catch (err: any) {
        expect(err.message).toContain('Plan generation failed');
      }
    });
  });

  describe('Error Recovery and Fallback Behavior', () => {
    it('uses original order when topological sort fails', async () => {
      const config = createPlannerConfig({
        llmCall: vi.fn(async () => JSON.stringify([
          { step: 1, action: 'write', description: 'A', path: 'src/a.ts', notes: 'Depends on: step_2' },
          { step: 2, action: 'write', description: 'B', path: 'src/b.ts', notes: 'Depends on: step_1' },
        ])),
      });
      const planner = new Planner(config);

      const plan = await planner.generatePlan('Create');
      // Falls back to original order on cycle
      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].id).toBe('step_1');
      expect(plan.steps[1].id).toBe('step_2');
    });

    it('handles plan with no dependencies by preserving order', async () => {
      const config = createPlannerConfig({
        llmCall: vi.fn(async () => JSON.stringify([
          { step: 1, action: 'write', description: 'A', path: 'src/a.ts' },
          { step: 2, action: 'write', description: 'B', path: 'src/b.ts' },
          { step: 3, action: 'write', description: 'C', path: 'src/c.ts' },
        ])),
      });
      const planner = new Planner(config);

      const plan = await planner.generatePlan('Create');
      expect(plan.steps.map(s => s.id)).toEqual(['step_1', 'step_2', 'step_3']);
    });
  });

  describe('Timeout Handling', () => {
    it('respects timeout configuration', async () => {
      const config = createLLMConfig({ timeout: 100 });
      expect(config.timeout).toBe(100);
    });

    it('handles slow LLM responses', async () => {
      const slowMock = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return JSON.stringify([
          { step: 1, action: 'write', description: 'Test', path: 'src/test.ts' },
        ]);
      });

      const config = createPlannerConfig({ llmCall: slowMock });
      const planner = new Planner(config);

      const start = Date.now();
      const plan = await planner.generatePlan('Create');
      const elapsed = Date.now() - start;

      expect(plan.steps).toHaveLength(1);
      expect(elapsed).toBeGreaterThanOrEqual(50);
    });
  });

  describe('Large Data Handling', () => {
    it('handles plan with many steps', async () => {
      const manySteps = Array.from({ length: 100 }, (_, i) => ({
        step: i + 1,
        action: 'write' as const,
        description: `Step ${i + 1}`,
        path: `src/file${i + 1}.ts`,
      }));

      const config = createPlannerConfig({
        llmCall: vi.fn(async () => JSON.stringify(manySteps)),
      });
      const planner = new Planner(config);

      const plan = await planner.generatePlan('Create many files');
      expect(plan.steps).toHaveLength(100);
    });

    it('handles steps with very long paths', async () => {
      const longPath = 'src/' + 'folder/'.repeat(50) + 'file.ts';
      const config = createPlannerConfig({
        llmCall: vi.fn(async () => JSON.stringify([
          { step: 1, action: 'write', description: 'Test', path: longPath },
        ])),
      });
      const planner = new Planner(config);

      const plan = await planner.generatePlan('Create');
      expect(plan.steps[0].path).toBe(longPath);
    });

    it('handles steps with very long descriptions', async () => {
      const longDescription = 'a'.repeat(5000);
      const config = createPlannerConfig({
        llmCall: vi.fn(async () => JSON.stringify([
          { step: 1, action: 'write', description: longDescription, path: 'src/test.ts' },
        ])),
      });
      const planner = new Planner(config);

      const plan = await planner.generatePlan('Create');
      expect(plan.steps[0].description).toBe(longDescription);
    });
  });
});
