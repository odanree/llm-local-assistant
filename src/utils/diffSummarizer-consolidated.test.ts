import { describe, it, expect } from 'vitest';
import {
  summarizeDiffPure,
  parseGitFilePathsPure,
  countDiffStatisticsPure,
  analyzeDiffImpactPure,
  extractDiffHunksPure,
  formatDiffStatisticsPure,
  isDiffEmptyPure,
  getDiffSummaryWithDetailsPure,
} from './diffSummarizer';

describe('diffSummarizer - Pure Diff Analysis', () => {
  describe('Diff Summarization', () => {
    const testCases = [
      {
        diff: `--- a/file.txt
+++ b/file.txt
@@ -1,5 +1,6 @@
 line1
+added line
 line2
-removed line
 line3`,
        expectedSummary: '1 file(s) changed: +1 lines, -1 lines',
        description: 'summarizes simple diff',
      },
      {
        diff: `--- a/file1.txt
+++ b/file1.txt
+new line 1
+new line 2
--- a/file2.txt
+++ b/file2.txt
-old line 1`,
        expectedFiles: 2,
        expectedAdded: 2,
        description: 'summarizes multi-file diff',
      },
      {
        diff: '',
        expectedSummary: '0 file(s) changed: +0 lines, -0 lines',
        description: 'handles empty diff',
      },
    ];

    it.each(testCases)(
      'diff summarization: $description',
      ({ diff, expectedSummary, expectedFiles, expectedAdded }) => {
        const result = summarizeDiffPure(diff);
        if (expectedSummary) {
          expect(result).toBe(expectedSummary);
        }
      }
    );
  });

  describe('File Path Parsing', () => {
    const testCases = [
      {
        output: `--- a/src/index.ts
+++ b/src/index.ts`,
        expectedPaths: ['src/index.ts'],
        description: 'extracts single file path',
      },
      {
        output: `--- a/file1.ts
+++ b/file1.ts
--- a/dir/file2.ts
+++ b/dir/file2.ts`,
        expectedCount: 2,
        description: 'extracts multiple file paths',
      },
      {
        output: `--- a/src/utils/helper.ts
+++ b/src/utils/helper.ts`,
        expectedPaths: ['src/utils/helper.ts'],
        description: 'extracts nested file paths',
      },
      {
        output: 'no diff content',
        expectedCount: 0,
        description: 'returns empty for non-diff content',
      },
    ];

    it.each(testCases)(
      'file parsing: $description',
      ({ output, expectedPaths, expectedCount }) => {
        const result = parseGitFilePathsPure(output);
        if (expectedPaths) {
          expect(result).toEqual(expectedPaths);
        } else {
          expect(result.length).toBe(expectedCount);
        }
      }
    );
  });

  describe('Diff Statistics Counting', () => {
    const testCases = [
      {
        diff: `+added
-removed`,
        expectedAdded: 1,
        expectedRemoved: 1,
        description: 'counts additions and removals',
      },
      {
        diff: `--- a/file
+++ b/file
+line1
+line2
+line3`,
        expectedAdded: 3,
        expectedRemoved: 0,
        description: 'counts only additions',
      },
      {
        diff: `--- a/file
+++ b/file
-line1
-line2`,
        expectedAdded: 0,
        expectedRemoved: 2,
        description: 'counts only removals',
      },
      {
        diff: '',
        expectedAdded: 0,
        expectedRemoved: 0,
        description: 'returns zeros for empty diff',
      },
    ];

    it.each(testCases)(
      'statistics counting: $description',
      ({ diff, expectedAdded, expectedRemoved }) => {
        const result = countDiffStatisticsPure(diff);
        expect(result.added).toBe(expectedAdded);
        expect(result.removed).toBe(expectedRemoved);
      }
    );
  });

  describe('Diff Impact Analysis', () => {
    const testCases = [
      {
        diff: '+line1\n-line1',
        expectedSeverity: 'trivial',
        description: 'one line change is trivial',
      },
      {
        diff: Array(5).fill('+added').join('\n'),
        expectedSeverity: 'minor',
        description: 'under 10 lines is minor',
      },
      {
        diff: Array(50).fill('+added').join('\n'),
        expectedSeverity: 'moderate',
        description: '10-100 lines is moderate',
      },
      {
        diff: Array(150).fill('+added').join('\n'),
        expectedSeverity: 'major',
        description: 'over 100 lines is major',
      },
    ];

    it.each(testCases)(
      'impact analysis: $description',
      ({ diff, expectedSeverity }) => {
        const result = analyzeDiffImpactPure(diff);
        expect(result.severity).toBe(expectedSeverity);
      }
    );
  });

  describe('Diff Hunk Extraction', () => {
    it('should extract hunks from multi-file diff', () => {
      const diff = `--- a/file1.ts
+++ b/file1.ts
+new line
--- a/file2.ts
+++ b/file2.ts
-old line`;

      const hunks = extractDiffHunksPure(diff);
      expect(hunks.length).toBeGreaterThan(0);
    });

    it('should count additions and deletions per file', () => {
      const diff = `--- a/file.ts
+++ b/file.ts
+added1
+added2
-removed1`;

      const hunks = extractDiffHunksPure(diff);
      if (hunks.length > 0) {
        expect(hunks[0].additions).toBeGreaterThan(0);
      }
    });
  });

  describe('Statistics Formatting', () => {
    const testCases = [
      {
        added: 10,
        removed: 5,
        filesChanged: 2,
        expectedFormat: '2 file(s) modified • +10 additions • -5 deletions (Δ 15)',
        description: 'formats statistics',
      },
      {
        added: 0,
        removed: 0,
        filesChanged: 0,
        expectedFormat: '0 file(s) modified • +0 additions • -0 deletions (Δ 0)',
        description: 'formats zero statistics',
      },
    ];

    it.each(testCases)(
      'formatting: $description',
      ({ added, removed, filesChanged, expectedFormat }) => {
        const result = formatDiffStatisticsPure(added, removed, filesChanged);
        expect(result).toBe(expectedFormat);
      }
    );
  });

  describe('Empty Diff Detection', () => {
    const testCases = [
      {
        diff: '',
        isEmpty: true,
        description: 'empty string is empty',
      },
      {
        diff: '   \n  \n  ',
        isEmpty: true,
        description: 'whitespace only is empty',
      },
      {
        diff: '+added',
        isEmpty: false,
        description: 'diff with content is not empty',
      },
    ];

    it.each(testCases)(
      'empty detection: $description',
      ({ diff, isEmpty }) => {
        const result = isDiffEmptyPure(diff);
        expect(result).toBe(isEmpty);
      }
    );
  });

  describe('Comprehensive Diff Summary', () => {
    it('should provide detailed summary', () => {
      const diff = `--- a/file.ts
+++ b/file.ts
+added line 1
+added line 2
-removed line`;

      const result = getDiffSummaryWithDetailsPure(diff);

      expect(result.summary).toContain('file(s) changed');
      expect(result.filesChanged.length).toBeGreaterThan(0);
      expect(result.statistics.added).toBeGreaterThan(0);
      expect(result.isEmpty).toBe(false);
    });

    it('should mark empty diffs', () => {
      const result = getDiffSummaryWithDetailsPure('');
      expect(result.isEmpty).toBe(true);
      expect(result.statistics.total).toBe(0);
    });
  });

  describe('Performance Regression Suite', () => {
    it('should summarize large diffs in <100ms', () => {
      // Create a large diff (10MB equivalent in terms of line count)
      const largeDiff = Array(10000)
        .fill(`--- a/file${Math.random()}.ts
+++ b/file${Math.random()}.ts
+added line
-removed line`)
        .join('\n');

      const start = performance.now();
      summarizeDiffPure(largeDiff);
      countDiffStatisticsPure(largeDiff);
      parseGitFilePathsPure(largeDiff);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('should analyze complex diffs in <50ms', () => {
      const complexDiff = Array(500)
        .fill(`--- a/src/deeply/nested/file.ts
+++ b/src/deeply/nested/file.ts
+new content 1
+new content 2
-old content 1
-old content 2
-old content 3`)
        .join('\n');

      const start = performance.now();
      analyzeDiffImpactPure(complexDiff);
      extractDiffHunksPure(complexDiff);
      getDiffSummaryWithDetailsPure(complexDiff);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50);
    });
  });
});
