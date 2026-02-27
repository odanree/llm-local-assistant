/**
 * Test Factories - Centralized test data creation
 *
 * Export all factory functions for easy importing in tests
 *
 * Usage:
 *   import {
 *     createPlannerConfig,
 *     createTaskPlan,
 *     createMockLLMClient,
 *   } from '@test/factories';
 */

// Phase 1: Global Mock Factory (State Injection) - NEW
export * from './stateInjectionFactory';

// Legacy factories (still available for backward compatibility)
export * from './plannerFactory';
export * from './executorFactory';
export * from './mockFactory';
