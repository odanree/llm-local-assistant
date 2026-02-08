/**
 * Stateful Correction Utilities - Phase 1 (v3.0 Relaunch)
 * 
 * Three core components for the new architecture:
 * 1. SimpleFixer - Deterministic fixes for common errors
 * 2. RetryContext - Memory of previous attempts
 * 3. ContextBuilder - Project context injection for LLM
 */

export { SimpleFixer, FixResult, FixAction } from './simpleFixer';
export { RetryContext, AttemptRecord, RetryPolicy } from './retryContext';
export { ContextBuilder, ProjectContext } from './contextBuilder';
