/**
 * Pure diff summarization utilities
 * Parse and analyze git diff output
 * Only imports from types/, no git or file I/O
 */

/**
 * Summarize a diff - count changes and files affected
 * Pure function: parse unified diff format
 */
export function summarizeDiffPure(diff: string): string {
  const stats = countDiffStatisticsPure(diff);
  const files = parseGitFilePathsPure(diff);

  const fileCount = files.length;
  return `${fileCount} file(s) changed: +${stats.added} lines, -${stats.removed} lines`;
}

/**
 * Parse file paths from git diff output
 * Pure function: extract changed files
 */
export function parseGitFilePathsPure(output: string): string[] {
  const files = new Set<string>();
  const lines = output.split('\n');

  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---')) {
      const match = line.match(/b?\/(.*)/);
      if (match) {
        files.add(match[1]);
      }
    }
  }

  return Array.from(files);
}

/**
 * Count diff statistics - added/removed lines and file changes
 * Pure function: count diff markers
 */
export function countDiffStatisticsPure(diff: string): {
  added: number;
  removed: number;
  filesChanged: number;
} {
  const lines = diff.split('\n');
  let added = 0;
  let removed = 0;
  const filesChanged = new Set<string>();

  for (const line of lines) {
    // Track changed files
    if (line.startsWith('+++') || line.startsWith('---')) {
      const match = line.match(/b?\/(.*)/);
      if (match) {
        filesChanged.add(match[1]);
      }
    }
    // Count added lines (+ but not +++)
    else if (line.startsWith('+') && !line.startsWith('+++')) {
      added++;
    }
    // Count removed lines (- but not ---)
    else if (line.startsWith('-') && !line.startsWith('---')) {
      removed++;
    }
  }

  return {
    added,
    removed,
    filesChanged: filesChanged.size,
  };
}

/**
 * Analyze diff for large changes
 * Pure function: identify significant modifications
 */
export function analyzeDiffImpactPure(diff: string): {
  isMajorChange: boolean;
  linesChanged: number;
  filesAffected: number;
  severity: 'trivial' | 'minor' | 'moderate' | 'major';
} {
  const stats = countDiffStatisticsPure(diff);
  const linesChanged = stats.added + stats.removed;

  let severity: 'trivial' | 'minor' | 'moderate' | 'major';
  if (linesChanged <= 2) {
    severity = 'trivial';
  } else if (linesChanged < 10) {
    severity = 'minor';
  } else if (linesChanged < 100) {
    severity = 'moderate';
  } else {
    severity = 'major';
  }

  return {
    isMajorChange: linesChanged > 100,
    linesChanged,
    filesAffected: stats.filesChanged,
    severity,
  };
}

/**
 * Extract diff hunks (sections of changes)
 * Pure function: parse unified diff hunks
 */
export function extractDiffHunksPure(
  diff: string
): Array<{ file: string; additions: number; deletions: number }> {
  const hunks: Array<{ file: string; additions: number; deletions: number }> = [];
  const lines = diff.split('\n');
  let currentFile = '';
  let fileAdditions = 0;
  let fileDeletions = 0;

  for (const line of lines) {
    if (line.startsWith('---')) {
      // New file section
      if (currentFile) {
        hunks.push({
          file: currentFile,
          additions: fileAdditions,
          deletions: fileDeletions,
        });
      }
      const match = line.match(/---.*/);
      if (match) {
        currentFile = match[0];
        fileAdditions = 0;
        fileDeletions = 0;
      }
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      fileAdditions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      fileDeletions++;
    }
  }

  // Add the last file
  if (currentFile) {
    hunks.push({
      file: currentFile,
      additions: fileAdditions,
      deletions: fileDeletions,
    });
  }

  return hunks;
}

/**
 * Format diff statistics for display
 * Pure function: human-readable summary
 */
export function formatDiffStatisticsPure(
  added: number,
  removed: number,
  filesChanged: number
): string {
  const total = added + removed;
  return `${filesChanged} file(s) modified • +${added} additions • -${removed} deletions (Δ ${total})`;
}

/**
 * Check if diff is empty (no changes)
 * Pure function: validate diff content
 */
export function isDiffEmptyPure(diff: string): boolean {
  if (!diff || diff.trim().length === 0) {
    return true;
  }

  const stats = countDiffStatisticsPure(diff);
  return stats.added === 0 && stats.removed === 0 && stats.filesChanged === 0;
}

/**
 * Get diff summary with file details
 * Pure function: detailed diff analysis
 */
export function getDiffSummaryWithDetailsPure(diff: string): {
  summary: string;
  filesChanged: string[];
  statistics: {
    added: number;
    removed: number;
    total: number;
  };
  isEmpty: boolean;
} {
  const isEmpty = isDiffEmptyPure(diff);
  const stats = countDiffStatisticsPure(diff);
  const files = parseGitFilePathsPure(diff);

  return {
    summary: summarizeDiffPure(diff),
    filesChanged: files,
    statistics: {
      added: stats.added,
      removed: stats.removed,
      total: stats.added + stats.removed,
    },
    isEmpty,
  };
}
