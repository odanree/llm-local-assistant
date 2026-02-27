/**
 * State Injection Factory: Demo & Verification Test
 *
 * This test demonstrates that the state injection factory works correctly
 * and is backward compatible with existing test patterns.
 *
 * Phase 1 deliverable: Proof that createMockExecutor and createMockPlanner work
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createMockExecutor,
  createMockPlanner,
  PLANNER_MOODS,
  createCodePatterns,
  createValidatorConfig,
} from './factories/stateInjectionFactory';

describe('State Injection Factory: Verification', () => {
  // ============================================================
  // EXECUTOR FACTORY TESTS
  // ============================================================

  describe('createMockExecutor()', () => {
    it('should create an Executor instance with default happy path', () => {
      const { instance, mocks } = createMockExecutor();

      expect(instance).toBeDefined();
      expect(mocks).toBeDefined();
      expect(mocks.llm).toBeDefined();
      expect(mocks.sendMessageSpy).toBeDefined();
    });

    it('should accept custom LLM response', async () => {
      const customResponse = JSON.stringify({ custom: 'response' });
      const { mocks } = createMockExecutor({
        llmResponse: customResponse,
      });

      const response = await mocks.sendMessageSpy('test');
      expect(response).toEqual(customResponse);
    });

    it('should provide spies for verification', () => {
      const { mocks } = createMockExecutor();

      // All spies should be trackable
      expect(mocks.sendMessageSpy.mock).toBeDefined();
      expect(mocks.sendMessageStreamSpy.mock).toBeDefined();
      expect(mocks.isServerHealthySpy.mock).toBeDefined();
      expect(mocks.clearHistorySpy.mock).toBeDefined();
      expect(mocks.writeSpy.mock).toBeDefined();
    });

    it('should track spy calls', async () => {
      const { mocks } = createMockExecutor();

      await mocks.sendMessageSpy('hello');
      await mocks.sendMessageSpy('world');

      expect(mocks.sendMessageSpy).toHaveBeenCalledTimes(2);
      expect(mocks.sendMessageSpy).toHaveBeenCalledWith('hello');
      expect(mocks.sendMessageSpy).toHaveBeenLastCalledWith('world');
    });
  });

  // ============================================================
  // PLANNER FACTORY TESTS
  // ============================================================

  describe('createMockPlanner()', () => {
    it('should create a Planner instance with default happy path', () => {
      const { instance, mocks } = createMockPlanner();

      expect(instance).toBeDefined();
      expect(mocks).toBeDefined();
      expect(mocks.llm).toBeDefined();
      expect(mocks.sendMessageSpy).toBeDefined();
    });

    it('should support "clean" mood (default)', async () => {
      const { mocks } = createMockPlanner({ mood: 'clean' });

      const response = await mocks.sendMessageSpy('test');
      expect(response).toContain('steps');
      expect(response).toContain('read');
      expect(response).not.toContain('```'); // No markdown
    });

    it('should support "markdown" mood', async () => {
      const { mocks } = createMockPlanner({ mood: 'markdown' });

      const response = await mocks.sendMessageSpy('test');
      expect(response).toContain('```json');
      expect(response).toContain('steps');
    });

    it('should support "hallucination" mood', async () => {
      const { mocks } = createMockPlanner({ mood: 'hallucination' });

      const response = await mocks.sendMessageSpy('test');
      expect(response).toContain('plan');
      expect(response).toContain('steps');
      expect(response).toContain('help you get started');
    });

    it('should allow custom response (overrides mood)', async () => {
      const custom = '{"steps":[{"id":99}]}';
      const { mocks } = createMockPlanner({
        mood: 'clean',
        rawLLMResponse: custom,
      });

      const response = await mocks.sendMessageSpy('test');
      expect(response).toEqual(custom);
    });

    it('should provide spies for verification', () => {
      const { mocks } = createMockPlanner();

      expect(mocks.sendMessageSpy.mock).toBeDefined();
      expect(mocks.sendMessageStreamSpy.mock).toBeDefined();
      expect(mocks.isServerHealthySpy.mock).toBeDefined();
      expect(mocks.clearHistorySpy.mock).toBeDefined();
    });
  });

  // ============================================================
  // UTILITY PATTERNS
  // ============================================================

  describe('createCodePatterns()', () => {
    it('should provide code patterns for testing', () => {
      const undefinedVarCode = createCodePatterns.undefinedVariable('myVar');
      expect(undefinedVarCode).toContain('myVar');
      expect(undefinedVarCode).toContain('undefinedVar is never defined');

      const badImportCode = createCodePatterns.badImport('fake-module');
      expect(badImportCode).toContain("from 'fake-module'");

      const validCode = createCodePatterns.valid();
      expect(validCode).toContain('import');
      expect(validCode).toContain('function test');
    });
  });

  describe('createValidatorConfig()', () => {
    it('should provide validator configuration', () => {
      const config = createValidatorConfig();

      expect(config.language).toBe('TypeScript');
      expect(config.projectRoot).toBeDefined();
      expect(Array.isArray(config.allowedImports)).toBe(true);
      expect(Array.isArray(config.forbiddenImports)).toBe(true);
    });
  });

  // ============================================================
  // PLANNER_MOODS CONSTANTS
  // ============================================================

  describe('PLANNER_MOODS', () => {
    it('should export preset mood generators', () => {
      const cleanResponse = PLANNER_MOODS.clean();
      expect(cleanResponse).toContain('steps');
      expect(cleanResponse).not.toContain('```');

      const markdownResponse = PLANNER_MOODS.markdown();
      expect(markdownResponse).toContain('```json');

      const hallucResponse = PLANNER_MOODS.hallucination();
      expect(hallucResponse).toContain('plan');
    });
  });

  // ============================================================
  // INTEGRATION: Both Factories Together
  // ============================================================

  describe('Executor + Planner Integration', () => {
    it('should allow testing executor calling planner', async () => {
      // Setup both with spies
      const { instance: executor, mocks: executorMocks } = createMockExecutor();
      const { instance: planner, mocks: plannerMocks } = createMockPlanner({
        mood: 'markdown',
      });

      // Simulate executor calling planner's LLM
      await executorMocks.sendMessageSpy('create a plan');
      await plannerMocks.sendMessageSpy('execute the plan');

      // Verify both spies tracked calls independently
      expect(executorMocks.sendMessageSpy).toHaveBeenCalledTimes(1);
      expect(plannerMocks.sendMessageSpy).toHaveBeenCalledTimes(1);

      // Each has its own mock state
      expect(executorMocks.sendMessageSpy).toHaveBeenCalledWith('create a plan');
      expect(plannerMocks.sendMessageSpy).toHaveBeenCalledWith('execute the plan');
    });
  });
});
