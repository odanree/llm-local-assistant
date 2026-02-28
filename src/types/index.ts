/**
 * Shared type definitions for LLM Local Assistant
 *
 * This is the single source of truth for contracts between modules.
 */

// Executor contract types
export * from './executor';

// v2.12.0: Streaming I/O types
export * from './PlanState';
export * from './ProcessHandle';
export * from './SuspendedExecutionState';
export * from './StreamingIO';
export * from './ExecutorExtensions';
