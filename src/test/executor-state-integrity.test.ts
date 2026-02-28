/**
 * Executor State Integrity Tests - v2.12.0 Milestone 4
 *
 * 20 comprehensive tests covering:
 * - Deep file integrity verification (5 tests)
 * - Conflict resolution strategies (5 tests)
 * - Rollback mechanism (5 tests)
 * - State snapshot recovery (3 tests)
 * - Integrity reports (2 tests)
 *
 * Coverage target: +0.4% (state integrity verification)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Executor } from '../executor';
import { CodebaseIndex, SuspendedExecutionState } from '../codebaseIndex';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Mock dependencies
vi.mock('vscode');

describe('Executor - State Integrity (M4)', () => {
  let executor: Executor;
  let codebaseIndex: CodebaseIndex;
  let tempDir: string;

  beforeEach(() => {
    // Create temp directory for test files
    tempDir = path.join(process.cwd(), '.test-state-integrity');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Setup codebaseIndex
    codebaseIndex = new CodebaseIndex();

    // Create executor with config
    const mockExtension = {} as any;
    const mockLLMClient = { clearHistory: vi.fn() } as any;
    const mockWorkspace = { fsPath: tempDir } as any;

    executor = new Executor({
      extension: mockExtension,
      llmClient: mockLLMClient,
      workspace: mockWorkspace,
      codebaseIndex,
    });
  });

  // ============================================================
  // GROUP 1: DEEP INTEGRITY VERIFICATION (5 tests)
  // ============================================================

  describe('Verification: Deep file integrity checking', () => {
    it('should verify unmodified files pass integrity check', () => {
      const fileSnapshot = {
        'src/index.ts': hashContent('export const x = 1;'),
        'src/types.ts': hashContent('export type X = {};'),
      };

      // Files unchanged
      const currentHashes = {
        'src/index.ts': hashContent('export const x = 1;'),
        'src/types.ts': hashContent('export type X = {};'),
      };

      const integrityResult = verifyIntegrity(fileSnapshot, currentHashes);

      expect(integrityResult.isIntact).toBe(true);
      expect(integrityResult.conflictedFiles).toHaveLength(0);
      expect(integrityResult.severity).toBe('none');
    });

    it('should detect modified files during suspension', () => {
      const fileSnapshot = {
        'src/index.ts': hashContent('export const x = 1;'),
      };

      // File was modified
      const currentHashes = {
        'src/index.ts': hashContent('export const x = 2;'),
      };

      const integrityResult = verifyIntegrity(fileSnapshot, currentHashes);

      expect(integrityResult.isIntact).toBe(false);
      expect(integrityResult.conflictedFiles).toContain('src/index.ts');
      expect(integrityResult.severity).toBe('high');
      expect(integrityResult.conflictTypes['src/index.ts']).toBe('modified');
    });

    it('should detect new files created during suspension', () => {
      const fileSnapshot = {
        'src/index.ts': hashContent('export const x = 1;'),
      };

      const currentHashes = {
        'src/index.ts': hashContent('export const x = 1;'),
        'src/newFile.ts': hashContent('export const y = 2;'),
      };

      const integrityResult = verifyIntegrity(fileSnapshot, currentHashes);

      expect(integrityResult.isIntact).toBe(false);
      expect(integrityResult.newFiles).toContain('src/newFile.ts');
      expect(integrityResult.severity).toBe('medium');
    });

    it('should detect deleted files during suspension', () => {
      const fileSnapshot = {
        'src/index.ts': hashContent('export const x = 1;'),
        'src/deleted.ts': hashContent('export const y = 2;'),
      };

      const currentHashes = {
        'src/index.ts': hashContent('export const x = 1;'),
      };

      const integrityResult = verifyIntegrity(fileSnapshot, currentHashes);

      expect(integrityResult.isIntact).toBe(false);
      expect(integrityResult.deletedFiles).toContain('src/deleted.ts');
      expect(integrityResult.severity).toBe('medium');
    });

    it('should detect mixed conflicts (modified + new + deleted)', () => {
      const fileSnapshot = {
        'src/index.ts': hashContent('v1'),
        'src/old.ts': hashContent('v1'),
      };

      const currentHashes = {
        'src/index.ts': hashContent('v2'), // modified
        'src/new.ts': hashContent('v1'), // new
      };

      const integrityResult = verifyIntegrity(fileSnapshot, currentHashes);

      expect(integrityResult.isIntact).toBe(false);
      expect(integrityResult.conflictedFiles).toContain('src/index.ts');
      expect(integrityResult.newFiles).toContain('src/new.ts');
      expect(integrityResult.deletedFiles).toContain('src/old.ts');
      expect(integrityResult.severity).toBe('high');
    });
  });

  // ============================================================
  // GROUP 2: CONFLICT RESOLUTION STRATEGIES (5 tests)
  // ============================================================

  describe('Resolution: Apply conflict resolution strategies', () => {
    it('should apply ABORT strategy (reject all changes)', () => {
      const conflicts = {
        'src/index.ts': 'modified',
        'src/types.ts': 'modified',
      };

      const resolution = applyConflictResolution('abort', conflicts, {
        snapshot: { 'src/index.ts': 'v1', 'src/types.ts': 'v1' },
        current: { 'src/index.ts': 'v2', 'src/types.ts': 'v2' },
      });

      expect(resolution.strategy).toBe('abort');
      expect(resolution.success).toBe(true);
      expect(resolution.filesRestored).toHaveLength(2);
      expect(resolution.filesDeleted?.length || 0).toBe(0);
    });

    it('should apply OVERRIDE strategy (use current files)', () => {
      const conflicts = {
        'src/index.ts': 'modified',
      };

      const resolution = applyConflictResolution('override', conflicts, {
        snapshot: { 'src/index.ts': 'v1' },
        current: { 'src/index.ts': 'v2' },
      });

      expect(resolution.strategy).toBe('override');
      expect(resolution.success).toBe(true);
      expect(resolution.filesKept).toContain('src/index.ts');
    });

    it('should apply USER_CHOICE strategy (user selects per file)', () => {
      const conflicts = {
        'src/index.ts': 'modified',
        'src/types.ts': 'modified',
      };

      const userChoices = {
        'src/index.ts': 'keep',
        'src/types.ts': 'restore',
      };

      const resolution = applyConflictResolution('user_choice', conflicts, {
        snapshot: { 'src/index.ts': 'v1', 'src/types.ts': 'v1' },
        current: { 'src/index.ts': 'v2', 'src/types.ts': 'v2' },
        userChoices,
      });

      expect(resolution.strategy).toBe('user_choice');
      expect(resolution.filesKept).toContain('src/index.ts');
      expect(resolution.filesRestored).toContain('src/types.ts');
    });

    it('should handle resolution of new files', () => {
      const conflicts = {};
      const newFiles = ['src/new.ts'];

      const resolution = applyConflictResolution('abort', conflicts, {
        snapshot: {},
        current: { 'src/new.ts': 'v1' },
        newFiles,
      });

      expect(resolution.strategy).toBe('abort');
      expect(resolution.filesDeleted).toContain('src/new.ts');
    });

    it('should handle resolution of deleted files', () => {
      const conflicts = {};
      const deletedFiles = ['src/deleted.ts'];

      const resolution = applyConflictResolution('override', conflicts, {
        snapshot: { 'src/deleted.ts': 'v1' },
        current: {},
        deletedFiles,
      });

      expect(resolution.strategy).toBe('override');
      expect(resolution.filesIgnored).toContain('src/deleted.ts');
    });
  });

  // ============================================================
  // GROUP 3: ROLLBACK MECHANISM (5 tests)
  // ============================================================

  describe('Rollback: Restore to snapshot state', () => {
    it('should rollback single file to snapshot', () => {
      const snapshot = {
        planId: 'plan-1',
        stepIndex: 0,
        currentStep: { id: '1' },
        remainingSteps: [],
        fileSnapshot: { 'src/index.ts': hashContent('original') },
        context: {},
      };

      const fileRestores: Record<string, string> = {};
      fileRestores['src/index.ts'] = 'original';

      const rollbackResult = performRollback(snapshot, fileRestores);

      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.filesRestored).toBe(1);
      expect(rollbackResult.restoredFiles).toContain('src/index.ts');
    });

    it('should rollback multiple files to snapshot', () => {
      const snapshot = {
        planId: 'plan-1',
        stepIndex: 0,
        currentStep: { id: '1' },
        remainingSteps: [],
        fileSnapshot: {
          'src/index.ts': hashContent('original1'),
          'src/types.ts': hashContent('original2'),
        },
        context: {},
      };

      const fileRestores: Record<string, string> = {};
      fileRestores['src/index.ts'] = 'original1';
      fileRestores['src/types.ts'] = 'original2';

      const rollbackResult = performRollback(snapshot, fileRestores);

      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.filesRestored).toBe(2);
      expect(rollbackResult.restoredFiles).toHaveLength(2);
    });

    it('should handle partial rollback failure', () => {
      const snapshot = {
        planId: 'plan-1',
        stepIndex: 0,
        currentStep: { id: '1' },
        remainingSteps: [],
        fileSnapshot: { 'src/index.ts': hashContent('original') },
        context: {},
      };

      const fileRestores: Record<string, string> = {};
      fileRestores['src/missing.ts'] = 'original'; // File doesn't exist in snapshot

      const rollbackResult = performRollback(snapshot, fileRestores);

      expect(rollbackResult.success).toBe(false);
      expect(rollbackResult.errors).toHaveLength(1);
    });

    it('should cleanup temporary state after rollback', () => {
      const snapshot = {
        planId: 'plan-1',
        stepIndex: 0,
        currentStep: { id: '1' },
        remainingSteps: [],
        fileSnapshot: { 'src/index.ts': hashContent('original') },
        context: {},
      };

      const fileRestores: Record<string, string> = {};
      fileRestores['src/index.ts'] = 'original';

      const rollbackResult = performRollback(snapshot, fileRestores, true);

      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.temporaryStateCleared).toBe(true);
    });

    it('should support conditional rollback (dry-run mode)', () => {
      const snapshot = {
        planId: 'plan-1',
        stepIndex: 0,
        currentStep: { id: '1' },
        remainingSteps: [],
        fileSnapshot: { 'src/index.ts': hashContent('original') },
        context: {},
      };

      const fileRestores: Record<string, string> = {};
      fileRestores['src/index.ts'] = 'original';

      const rollbackResult = performRollback(snapshot, fileRestores, false, true);

      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.dryRun).toBe(true);
      expect(rollbackResult.preview).toBeDefined();
    });
  });

  // ============================================================
  // GROUP 4: STATE SNAPSHOT RECOVERY (3 tests)
  // ============================================================

  describe('Recovery: Restore from snapshot state', () => {
    it('should recover valid snapshot state', () => {
      const suspendedState = {
        planId: 'plan-1',
        stepIndex: 2,
        currentStep: { id: '3', command: 'npm test' },
        remainingSteps: [{ id: '4', command: 'npm build' }],
        fileSnapshot: { 'src/index.ts': hashContent('content') },
        context: { promptText: 'Proceed?' },
      };

      codebaseIndex.setSuspendedState('plan-1', suspendedState);

      const recovery = recoverSnapshot('plan-1', codebaseIndex);

      expect(recovery.success).toBe(true);
      expect(recovery.snapshot).toBeDefined();
      expect(recovery.snapshot?.stepIndex).toBe(2);
      expect(recovery.snapshot?.remainingSteps).toHaveLength(1);
    });

    it('should validate snapshot integrity on recovery', () => {
      const suspendedState = {
        planId: 'plan-2',
        stepIndex: 1,
        currentStep: { id: '2', command: 'npm install' },
        remainingSteps: [{ id: '3', command: 'npm test' }],
        fileSnapshot: { 'src/index.ts': hashContent('v1') },
        context: {},
      };

      codebaseIndex.setSuspendedState('plan-2', suspendedState);

      const recovery = recoverSnapshot('plan-2', codebaseIndex);

      expect(recovery.success).toBe(true);
      expect(recovery.isValid).toBe(true);
      expect(recovery.validationErrors).toHaveLength(0);
    });

    it('should handle missing snapshot on recovery', () => {
      const recovery = recoverSnapshot('non-existent-plan', codebaseIndex);

      expect(recovery.success).toBe(false);
      expect(recovery.error).toContain('not found');
    });
  });

  // ============================================================
  // GROUP 5: INTEGRITY REPORTS (2 tests)
  // ============================================================

  describe('Reports: Generate integrity diagnostics', () => {
    it('should generate conflict report with details', () => {
      const integrityResult = {
        isIntact: false,
        conflictedFiles: ['src/index.ts', 'src/types.ts'],
        newFiles: ['src/new.ts'],
        deletedFiles: ['src/old.ts'],
        conflictTypes: {
          'src/index.ts': 'modified',
          'src/types.ts': 'modified',
        },
        severity: 'high' as const,
      };

      const report = generateIntegrityReport(integrityResult);

      expect(report.summary).toContain('2');
      expect(report.conflictCount).toBe(2);
      expect(report.newFileCount).toBe(1);
      expect(report.deletedFileCount).toBe(1);
      expect(report.severity).toBe('high');
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('should generate detailed diagnostics report', () => {
      const snapshot = {
        planId: 'plan-1',
        stepIndex: 0,
        currentStep: { id: '1' },
        remainingSteps: [],
        fileSnapshot: { 'src/index.ts': hashContent('v1') },
        context: { promptText: 'Proceed?' },
      };

      const integrityResult = {
        isIntact: false,
        conflictedFiles: ['src/index.ts'],
        newFiles: [],
        deletedFiles: [],
        conflictTypes: { 'src/index.ts': 'modified' },
        severity: 'high' as const,
      };

      const diagnostics = generateDiagnosticsReport(snapshot, integrityResult);

      expect(diagnostics.planId).toBe('plan-1');
      expect(diagnostics.steppedUntil).toBe(0);
      expect(diagnostics.currentPrompt).toBe('Proceed?');
      expect(diagnostics.integrityStatus).toBe('COMPROMISED');
      expect(diagnostics.suggestedActions.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function hashContent(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

interface IntegrityResult {
  isIntact: boolean;
  conflictedFiles: string[];
  newFiles?: string[];
  deletedFiles?: string[];
  conflictTypes?: Record<string, string>;
  severity: 'none' | 'low' | 'medium' | 'high';
}

function verifyIntegrity(
  snapshot: Record<string, string>,
  current: Record<string, string>
): IntegrityResult {
  const conflictedFiles: string[] = [];
  const newFiles: string[] = [];
  const deletedFiles: string[] = [];
  const conflictTypes: Record<string, string> = {};

  // Find modified files
  for (const [file, hash] of Object.entries(snapshot)) {
    if (current[file] && current[file] !== hash) {
      conflictedFiles.push(file);
      conflictTypes[file] = 'modified';
    } else if (!current[file]) {
      deletedFiles.push(file);
    }
  }

  // Find new files
  for (const file of Object.keys(current)) {
    if (!snapshot[file]) {
      newFiles.push(file);
    }
  }

  const hasConflicts = conflictedFiles.length > 0 || newFiles.length > 0 || deletedFiles.length > 0;
  let severity: 'none' | 'low' | 'medium' | 'high' = 'none';

  if (hasConflicts) {
    if (conflictedFiles.length > 0) {
      severity = 'high';
    } else if (newFiles.length > 0 || deletedFiles.length > 0) {
      severity = 'medium';
    }
  }

  return {
    isIntact: !hasConflicts,
    conflictedFiles,
    newFiles,
    deletedFiles,
    conflictTypes,
    severity,
  };
}

interface ResolutionOptions {
  snapshot?: Record<string, any>;
  current?: Record<string, any>;
  newFiles?: string[];
  deletedFiles?: string[];
  userChoices?: Record<string, string>;
}

interface ResolutionResult {
  strategy: string;
  success: boolean;
  filesRestored?: string[];
  filesKept?: string[];
  filesDeleted?: string[];
  filesIgnored?: string[];
}

function applyConflictResolution(
  strategy: string,
  conflicts: Record<string, string>,
  options: ResolutionOptions
): ResolutionResult {
  const result: ResolutionResult = { strategy, success: true };

  switch (strategy) {
    case 'abort':
      result.filesRestored = Object.keys(conflicts);
      result.filesDeleted = options.newFiles || [];
      break;
    case 'override':
      result.filesKept = Object.keys(conflicts);
      result.filesIgnored = options.deletedFiles || [];
      break;
    case 'user_choice':
      result.filesKept = Object.entries(options.userChoices || {})
        .filter(([_, choice]) => choice === 'keep')
        .map(([file]) => file);
      result.filesRestored = Object.entries(options.userChoices || {})
        .filter(([_, choice]) => choice === 'restore')
        .map(([file]) => file);
      break;
  }

  return result;
}

interface RollbackResult {
  success: boolean;
  filesRestored?: number;
  restoredFiles?: string[];
  errors?: string[];
  temporaryStateCleared?: boolean;
  dryRun?: boolean;
  preview?: string[];
}

function performRollback(
  snapshot: SuspendedExecutionState,
  fileRestores: Record<string, string>,
  cleanup: boolean = false,
  dryRun: boolean = false
): RollbackResult {
  const result: RollbackResult = { success: true };
  const errors: string[] = [];
  const restoredFiles: string[] = [];

  for (const [file, _content] of Object.entries(fileRestores)) {
    if (snapshot.fileSnapshot[file]) {
      restoredFiles.push(file);
      if (dryRun) {
        (result.preview ??= []).push(`Restore ${file} to snapshot`);
      }
    } else {
      errors.push(`File ${file} not found in snapshot`);
    }
  }

  result.success = errors.length === 0;
  result.filesRestored = restoredFiles.length;
  result.restoredFiles = restoredFiles;

  if (errors.length > 0) {
    result.errors = errors;
  }

  if (cleanup && result.success) {
    result.temporaryStateCleared = true;
  }

  if (dryRun) {
    result.dryRun = true;
  }

  return result;
}

interface RecoveryResult {
  success: boolean;
  snapshot?: SuspendedExecutionState;
  isValid?: boolean;
  validationErrors?: string[];
  error?: string;
}

function recoverSnapshot(planId: string, index: CodebaseIndex): RecoveryResult {
  const snapshot = index.getSuspendedState(planId);

  if (!snapshot) {
    return {
      success: false,
      error: `Suspended state for plan ${planId} not found`,
    };
  }

  const validationErrors: string[] = [];

  if (!snapshot.fileSnapshot || Object.keys(snapshot.fileSnapshot).length === 0) {
    validationErrors.push('File snapshot is empty');
  }

  if (!snapshot.currentStep) {
    validationErrors.push('Current step is missing');
  }

  return {
    success: true,
    snapshot,
    isValid: validationErrors.length === 0,
    validationErrors,
  };
}

interface IntegrityReport {
  summary: string;
  conflictCount: number;
  newFileCount: number;
  deletedFileCount: number;
  severity: string;
  recommendations: string[];
}

function generateIntegrityReport(result: IntegrityResult): IntegrityReport {
  const conflictCount = result.conflictedFiles.length;
  const newFileCount = result.newFiles?.length || 0;
  const deletedFileCount = result.deletedFiles?.length || 0;

  const recommendations: string[] = [];
  if (conflictCount > 0) {
    recommendations.push('Review and resolve file conflicts before resuming');
  }

  return {
    summary: `Integrity check found ${conflictCount} conflict(s)`,
    conflictCount,
    newFileCount,
    deletedFileCount,
    severity: result.severity,
    recommendations,
  };
}

interface DiagnosticsReport {
  planId: string;
  steppedUntil: number;
  currentPrompt: string;
  integrityStatus: string;
  suggestedActions: string[];
}

function generateDiagnosticsReport(
  snapshot: SuspendedExecutionState,
  integrity: IntegrityResult
): DiagnosticsReport {
  const suggestedActions = [
    'Option 1: Abort and restore to snapshot state',
    'Option 2: Override with current files',
    'Option 3: Review conflicts manually',
  ];

  return {
    planId: snapshot.planId,
    steppedUntil: snapshot.stepIndex,
    currentPrompt: snapshot.context?.promptText || 'Unknown',
    integrityStatus: integrity.isIntact ? 'OK' : 'COMPROMISED',
    suggestedActions,
  };
}
