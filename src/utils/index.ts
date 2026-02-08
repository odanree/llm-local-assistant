/**
 * Stateful Correction Utilities - Phase 1 & 2 (v3.0 Relaunch)
 * Phase 5: Code Continuity
 * Phase 6: Multi-Workspace Support
 * 
 * Core components for the new architecture:
 * 1. SimpleFixer - Deterministic fixes for common errors
 * 2. RetryContext - Memory of previous attempts
 * 3. ContextBuilder - Project context injection for LLM
 * 4. DiffGenerator - Parse LLM responses into structured diffs
 * 5. VirtualFileState - Maintain document state across plan execution steps
 * 6. WorkspaceDetector - Detect multiple workspaces and prompt user
 */

export { SimpleFixer, type FixResult, type FixAction } from './simpleFixer';
export { RetryContext, createRetryContext, type AttemptRecord, type RetryPolicy } from './retryContext';
export { ContextBuilder, type ProjectContext } from './contextBuilder';
export { DiffGenerator, type DiffBlock, type DiffGeneratorResult } from './diffGenerator';
export { VirtualFileState, type FileEdit } from './virtualFileState';
export { WorkspaceDetector, type DetectedWorkspace } from './workspaceDetector';
