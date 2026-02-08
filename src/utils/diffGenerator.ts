/**
 * DiffGenerator: Parse LLM responses into structured, minimal diffs
 *
 * Part of Phase 2: Differential Prompting Integration
 * Converts free-form LLM text into targeted Search & Replace operations
 *
 * Strategy: Extract ONLY the changes needed, avoid full-file rewrites
 * Allows incremental fixes with precise context preservation
 */

export interface DiffBlock {
  type: 'search-replace' | 'insert' | 'delete' | 'modify' | 'unknown';
  original?: string;
  replacement?: string;
  context?: string;
  lineNumber?: number;
  confidence: number; // 0.0 to 1.0 — how sure we are this is a valid change
}

export interface DiffGeneratorResult {
  diffs: DiffBlock[];
  rawText: string;
  isValid: boolean;
  parseErrors: string[];
  explanation: string;
}

export class DiffGenerator {
  /**
   * Parse LLM response text into structured diffs
   * IMPROVED: Handles edge cases like "Sure!" prefix before code (Danh's feedback)
   */
  static parse(response: string): DiffGeneratorResult {
    const parseErrors: string[] = [];
    const diffs: DiffBlock[] = [];

    // **NEW: Regex Guard to strip conversational filler (Danh's feedback)**
    // Remove common LLM prefixes like "Sure!", "Here's", "Of course!", etc.
    let cleanedResponse = response;
    const fillerPatterns = [
      /^(Sure!?|Here(?:'s|'s)?|Of course!?|Certainly!?|Absolutely!?)[:\s]+/i,
      /^(Here's the|Here is|Let me|I'?ll)[^]*?\n/,
    ];
    
    for (const pattern of fillerPatterns) {
      cleanedResponse = cleanedResponse.replace(pattern, '');
    }

    // Strategy: Try multiple parsing strategies in order of specificity
    // 1. Markdown code blocks with language hints
    // 2. Search & Replace patterns (explicit or implicit)
    // 3. Line-by-line diff format
    // 4. Fallback: treat entire response as guidance (low confidence)

    // **Strategy 1: Extract markdown code blocks**
    const codeBlockDiffs = this.parseMarkdownBlocks(cleanedResponse);
    if (codeBlockDiffs.length > 0) {
      diffs.push(...codeBlockDiffs);
    }

    // **Strategy 2: Find explicit search-replace patterns**
    // Look for "Search:" / "Replace:" or "FROM:" / "TO:" patterns
    const searchReplaceDiffs = this.parseSearchReplacePatterns(cleanedResponse);
    if (searchReplaceDiffs.length > 0) {
      diffs.push(...searchReplaceDiffs);
    }

    // **Strategy 3: Detect inline replacements**
    // "Change X to Y", "Replace line 5 with ...", etc.
    const inlineDiffs = this.parseInlineReplacements(cleanedResponse);
    if (inlineDiffs.length > 0) {
      diffs.push(...inlineDiffs);
    }

    // **Strategy 4: Heuristic detection of changes**
    // Look for common diff indicators (-, +, @@, etc.)
    const heuristicDiffs = this.parseHeuristicDiffs(cleanedResponse);
    if (heuristicDiffs.length > 0) {
      diffs.push(...heuristicDiffs);
    }

    // Validate and score each diff
    const scoredDiffs = diffs.map((diff) => this.scoreConfidence(diff));

    // Generate explanation for the parse result
    const explanation = this.generateExplanation(scoredDiffs, response);

    return {
      diffs: scoredDiffs,
      rawText: response,
      isValid: scoredDiffs.some((d) => d.confidence > 0.5),
      parseErrors,
      explanation,
    };
  }

  /**
   * Parse markdown code blocks from response
   * Looks for ```language ... ``` patterns
   */
  private static parseMarkdownBlocks(text: string): DiffBlock[] {
    const diffs: DiffBlock[] = [];
    const blockRegex = /```(?:tsx?|jsx?|typescript|javascript|js)?\n([\s\S]*?)```/g;

    let match;
    while ((match = blockRegex.exec(text)) !== null) {
      const code = match[1].trim();

      if (code.length > 0) {
        // Any code block is valuable — could be fragment or complete
        diffs.push({
          type: 'unknown',
          original: undefined,
          replacement: code,
          context: `Code block from markdown`,
          confidence: 0.65,
        });
      }
    }

    return diffs;
  }

  /**
   * Parse explicit search-replace patterns
   * Looks for "Search: ... Replace: ..." or "FROM: ... TO: ..."
   */
  private static parseSearchReplacePatterns(text: string): DiffBlock[] {
    const diffs: DiffBlock[] = [];

    // Pattern 1: "Search: X Replace: Y"
    const searchReplaceRegex =
      /(?:Search|Find|FROM):\s*\n?([\s\S]*?)(?:\n\n)?(?:Replace|WITH|TO):\s*\n?([\s\S]*?)(?=\n\n|$)/gi;

    let match;
    while ((match = searchReplaceRegex.exec(text)) !== null) {
      const original = match[1].trim();
      const replacement = match[2].trim();

      if (original && replacement) {
        diffs.push({
          type: 'search-replace',
          original,
          replacement,
          context: `Explicit search-replace pattern detected`,
          confidence: 0.9,
        });
      }
    }

    return diffs;
  }

  /**
   * Parse inline replacements
   * Looks for "Change X to Y", "Replace ... with ...", etc.
   */
  private static parseInlineReplacements(text: string): DiffBlock[] {
    const diffs: DiffBlock[] = [];

    // Pattern: "Change/Replace X to/with Y"
    const inlineRegex =
      /(?:change|replace|update|modify)\s+(?:the\s+)?(?:line|code)?\s*(?:with|to)?\s*(?::|from)?\s*\n?([\s\S]*?)\n+(?:to|with):\s*\n?([\s\S]*?)(?=\n\n|$)/gi;

    let match;
    while ((match = inlineRegex.exec(text)) !== null) {
      const original = match[1].trim();
      const replacement = match[2].trim();

      if (original && replacement && original.length < 500 && replacement.length < 500) {
        diffs.push({
          type: 'modify',
          original,
          replacement,
          context: `Inline replacement pattern detected`,
          confidence: 0.65,
        });
      }
    }

    return diffs;
  }

  /**
   * Heuristic diff detection
   * Looks for unified diff format (@@, -, +, etc.)
   */
  private static parseHeuristicDiffs(text: string): DiffBlock[] {
    const diffs: DiffBlock[] = [];

    // Check for unified diff markers
    const lines = text.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Look for "@@" line numbers (unified diff format)
      if (line.includes('@@')) {
        const removedLines: string[] = [];
        const addedLines: string[] = [];
        let j = i + 1;

        // Collect removed lines (start with -)
        while (j < lines.length && lines[j].startsWith('-')) {
          removedLines.push(lines[j].substring(1));
          j++;
        }

        // Collect added lines (start with +)
        while (j < lines.length && lines[j].startsWith('+')) {
          addedLines.push(lines[j].substring(1));
          j++;
        }

        if (removedLines.length > 0 && addedLines.length > 0) {
          diffs.push({
            type: 'search-replace',
            original: removedLines.join('\n'),
            replacement: addedLines.join('\n'),
            context: `Unified diff format detected`,
            confidence: 0.8,
          });
          i = j;
          continue;
        }
      }

      i++;
    }

    return diffs;
  }

  /**
   * Score confidence for a diff based on structure and patterns
   */
  private static scoreConfidence(diff: DiffBlock): DiffBlock {
    let confidence = diff.confidence;

    // Boost confidence if original and replacement are both reasonable length
    if (diff.original && diff.replacement) {
      const origLen = diff.original.length;
      const replLen = diff.replacement.length;

      // Reasonable change size (not too small, not too large)
      if (origLen > 5 && origLen < 1000 && replLen > 5 && replLen < 1000) {
        confidence = Math.min(1.0, confidence + 0.1);
      }

      // Penalize if they're identical
      if (diff.original === diff.replacement) {
        confidence *= 0.3;
      }
    }

    // Penalize if replacement looks like incomplete/pseudo-code
    if (diff.replacement && (diff.replacement.includes('...') || diff.replacement.includes('/* ... */'))) {
      confidence *= 0.6;
    }

    return { ...diff, confidence: Math.max(0, Math.min(1, confidence)) };
  }

  /**
   * Generate a human-readable explanation of what was parsed
   */
  private static generateExplanation(diffs: DiffBlock[], originalText: string): string {
    if (diffs.length === 0) {
      return 'No structured diffs detected. LLM response may be guidance-only.';
    }

    const highConfidence = diffs.filter((d) => d.confidence > 0.7).length;
    const lowConfidence = diffs.filter((d) => d.confidence <= 0.5).length;

    let explanation = `Parsed ${diffs.length} diff(s): `;
    explanation += `${highConfidence} high-confidence, ${lowConfidence} low-confidence.`;

    if (highConfidence > 0) {
      explanation += ' Ready for execution.';
    } else if (diffs.some((d) => d.confidence > 0.5)) {
      explanation += ' Moderate confidence — review recommended.';
    } else {
      explanation += ' Low confidence — treat as guidance, not executable.';
    }

    return explanation;
  }

  /**
   * Apply diffs to source code
   * Executes search-replace operations, validating each change
   */
  static apply(code: string, diffs: DiffBlock[]): { result: string; applied: number; failed: number } {
    let result = code;
    let applied = 0;
    let failed = 0;

    // Filter to high-confidence diffs only
    const executableDiffs = diffs.filter((d) => d.confidence > 0.6 && d.type === 'search-replace');

    for (const diff of executableDiffs) {
      if (diff.original && diff.replacement) {
        // Use exact match first, then fuzzy match if needed
        if (result.includes(diff.original)) {
          result = result.replace(diff.original, diff.replacement);
          applied++;
        } else {
          // Attempt fuzzy match (for minor whitespace differences)
          const fuzzyOriginal = diff.original
            .split('\n')
            .map((l) => l.trim())
            .join('\n');
          const fuzzyResult = result
            .split('\n')
            .map((l) => l.trim())
            .join('\n');

          if (fuzzyResult.includes(fuzzyOriginal)) {
            // Restore formatting in replacement
            result = fuzzyResult.replace(fuzzyOriginal, diff.replacement);
            applied++;
          } else {
            failed++;
          }
        }
      }
    }

    return { result, applied, failed };
  }
}
