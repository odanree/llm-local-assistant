/**
 * Stateful Correction Utilities - Phase 1 & 2 (v3.0 Relaunch)
 * Phase 5: Code Continuity
 * Phase 6: Multi-Workspace Support
 * Phase 6.5: Runtime Generation Mode Detection
 * Phase 7: Lean Parser for qwen2.5-coder:7b
 * Phase 8: Path Guard & Validation Report (Danh's Senior Architecture)
 * Phase 9: GenerationModeDetector & Path Normalization (Core Four Closure)
 * Phase 10: Post-Execution Handover (Human-in-the-Loop UX)
 * 
 * Core components for the new architecture:
 * 1. SimpleFixer - Deterministic fixes for common errors
 * 2. RetryContext - Memory of previous attempts
 * 3. ContextBuilder - Project context injection for LLM
 * 4. DiffGenerator - Parse LLM responses into structured diffs
 * 5. VirtualFileState - Maintain document state across plan execution steps
 * 6. WorkspaceDetector - Detect multiple workspaces and prompt user
 * 7. GenerationModeDetector - Runtime detection of generation mode (diff vs scaffold)
 * 8. LeanParser - Parse lean prompt output (Danh's optimization for 7B models)
 * 9. PathSanitizer - Strict path guard & circuit breaker (senior architecture)
 * 10. ModeDetector - Detect project structure for context anchoring (Core Four closure)
 * 11. HandoverSummary - Post-execution handover for human-in-the-loop (product thinking)
 */

export { SimpleFixer, type FixResult, type FixAction } from './simpleFixer';
export { RetryContext, createRetryContext, type AttemptRecord, type RetryPolicy } from './retryContext';
export { ContextBuilder, type ProjectContext } from './contextBuilder';
export { DiffGenerator, type DiffBlock, type DiffGeneratorResult } from './diffGenerator';
export { VirtualFileState, type FileEdit } from './virtualFileState';
export { WorkspaceDetector, type DetectedWorkspace } from './workspaceDetector';
export { GenerationModeDetector, type GenerationModeResult } from './generationModeDetector';
export { parseLeanOutput, validateLeanOutput } from './leanParser';
export { PathSanitizer } from './pathSanitizer';
export { GenerationModeDetector as ModeDetector, type ProjectContext as ModeDetectorContext } from './modeDetector';
export {
  generateHandoverSummary,
  formatHandoverHTML,
  type ExecutionHandover,
  type HandoverTask,
} from './handoverSummary';
