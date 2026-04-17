/**
 * AuditAgent — scan → classify → report loop for codebase concept audits.
 *
 * Architecture:
 *   detector    — regex patterns that find candidate lines
 *   classifier  — LLM reads a ±N line context window, applies a rubric
 *   reporter    — structured result per match (classification + reason + action)
 *
 * The first audit definition is cn-mandate: find every cn() reference in source
 * files and classify it as prescriptive / reactive / incidental so legacy mandate
 * code can be removed without touching legitimate enforcement logic.
 */

import * as fs from 'fs';
import * as path from 'path';
import { LLMClient, LLMConfig } from '../llmClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Classification = 'prescriptive' | 'reactive' | 'incidental';
export type RecommendedAction = 'remove' | 'update' | 'keep';

export interface AuditMatch {
  /** Absolute path to the file. */
  file: string;
  /** 1-based line number of the matched line. */
  line: number;
  /** The matched line content (trimmed). */
  content: string;
  /** ±contextLines lines around the match, joined as a single string. */
  context: string;
}

export interface AuditResult {
  match: AuditMatch;
  classification: Classification;
  reason: string;
  action: RecommendedAction;
}

export interface AuditReport {
  definition: string;
  scannedFiles: number;
  totalMatches: number;
  results: AuditResult[];
  /** Counts by classification for quick summary. */
  summary: Record<Classification, number>;
}

export interface AuditDefinition {
  /** Human-readable name for the audit (used in reports). */
  name: string;
  /** Regex patterns — a line matches if ANY pattern matches. */
  patterns: RegExp[];
  /** File path patterns to skip (e.g. test files, node_modules). */
  excludeFiles?: RegExp[];
  /** Classification rubric injected into the classifier prompt. */
  rubric: string;
  /** Lines of context to include above and below the matched line. */
  contextLines: number;
}

export interface ClassificationResult {
  classification: Classification;
  reason: string;
  action: RecommendedAction;
}

// ---------------------------------------------------------------------------
// cn-mandate audit definition
// ---------------------------------------------------------------------------

const CN_RUBRIC = `
You are auditing source code for a concept called the "cn-mandate".
The cn() function is a Tailwind class-merging utility. The codebase previously
mandated its use everywhere — that mandate has been removed. Your job is to
classify each code snippet as one of three categories:

PRESCRIPTIVE
  The code actively tells a language model or code generator to USE cn().
  Examples: prompt strings that say "use cn()", import mandates in LLM prompts,
  getGenerationConstraints() that inject cn() rules, example code in prompt
  templates that show "import { cn } from '@/utils/cn'".
  KEY SIGNAL: the snippet contains directive language like "mandatory", "always",
  "required", "NEVER ... instead use cn()", or WRONG/RIGHT usage examples that exist
  to enforce cn() adoption — even if those WRONG/RIGHT examples look like template code.
  A usage rule labeled "(mandatory)" or containing "always import cn as ..." is
  PRESCRIPTIVE regardless of whether WRONG/RIGHT examples appear alongside it.
  → These should be REMOVED or made conditional.

REACTIVE
  The code only fires WHEN cn() is already present in generated output.
  It enforces correct usage or cleans up cn() but does not prescribe it.
  Examples:
  - validators that check "if cn is imported, all classNames must use it"
  - auto-correction that removes a dead or phantom cn import
  - error messages that fire on "cn() is imported but className uses bare string"
  - code that detects cn() in generated output and replaces or removes it
  KEY SIGNAL: the gate variable checks for cn() presence in GENERATED OUTPUT —
  variables like importsCn, hasCnPhantomImport, or error.includes('cn') test whether
  the generated code already contains cn(). If the code only runs because cn is
  already in the generated output, it is REACTIVE regardless of whether it keeps or
  removes cn().
  IMPORTANT: an error message inside an if(importsCn) block is STILL REACTIVE even if
  the message text says "Use cn() for all class merging." The message fires only when
  cn() is already imported in generated code — it enforces correct usage, it does NOT
  inject a mandate into a fresh LLM prompt.
  CONTRAST WITH PRESCRIPTIVE: if the gate checks a PROJECT CONFIG variable such as
  cnUtilityPath, cnEnabled, or data.cnUtilityPath — and the body pushes a string into
  an LLM prompt (lines.push, constraints.push, prompt +=) — that is PRESCRIPTIVE. It
  uses project config to actively tell the LLM to use cn() in new code.
  → These should be KEPT — they are still valid for projects that have cn.ts.

INCIDENTAL
  cn() appears in a string literal, JSDoc comment, template/example code,
  or a negation rule — none of which prescribe cn() usage.
  Examples:
  - GOLDEN_TEMPLATES containing cn.ts source as a string value
  - JSDoc comments that mention cn() in passing
  - "NEVER use cn()" guards that explicitly forbid it
  - Test fixtures that use cn() as sample input data
  → These should be KEPT as-is.

Respond in this exact format — nothing else:
CLASSIFICATION: <prescriptive|reactive|incidental>
REASON: <one sentence>
ACTION: <remove|update|keep>
`.trim();

export const CN_MANDATE: AuditDefinition = {
  name: 'cn-mandate',
  patterns: [
    /\bcn\s*\(/,                  // any cn( call — cn('p-4'), cn(a, b), cn()
    /import\s*\{\s*cn\s*\}/,     // named import of cn
    /utils\/cn/,                  // path reference to utils/cn
    /use\s+cn\(\)/,               // prose: "use cn()"
    /import cn/,                  // default import of cn
  ],
  excludeFiles: [
    /\.test\.ts$/,
    /node_modules/,
    /\.d\.ts$/,
    /services\/AuditAgent\.ts$/,  // exclude the audit tool itself — rubric string causes false positives
  ],
  rubric: CN_RUBRIC,
  contextLines: 7,  // 15 was too much — distant lines drowned the mandate signal
};

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

/**
 * Classify a single code snippet against the given rubric.
 *
 * @param snippet  The code context window to classify (matched line ± N lines).
 * @param rubric   The classification instructions (from AuditDefinition.rubric).
 * @param client   Optional LLMClient — uses a default local Ollama client if omitted.
 */
export async function classifyMatch(
  snippet: string,
  rubric: string,
  client?: LLMClient
): Promise<ClassificationResult> {
  const llm = client ?? makeDefaultClient();

  const prompt = `${rubric}

---
CODE SNIPPET TO CLASSIFY:
\`\`\`
${snippet.trim()}
\`\`\`
`;

  const response = await llm.sendMessage(prompt);
  if (!response.success || !response.message) {
    throw new Error(`AuditAgent LLM call failed: ${response.error ?? 'no response'}`);
  }

  return parseClassification(response.message);
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parseClassification(raw: string): ClassificationResult {
  const classificationMatch = raw.match(/CLASSIFICATION:\s*(prescriptive|reactive|incidental)/i);
  const reasonMatch = raw.match(/REASON:\s*(.+)/i);
  const actionMatch = raw.match(/ACTION:\s*(remove|update|keep)/i);

  const classification = (classificationMatch?.[1]?.toLowerCase() ?? 'incidental') as Classification;
  const reason = reasonMatch?.[1]?.trim() ?? 'No reason provided.';
  const action = (actionMatch?.[1]?.toLowerCase() ?? 'keep') as RecommendedAction;

  return { classification, reason, action };
}

// ---------------------------------------------------------------------------
// Default LLM client (local Ollama)
// ---------------------------------------------------------------------------

function makeDefaultClient(): LLMClient {
  const config: LLMConfig = {
    endpoint: 'http://localhost:11434',
    model: 'gemma4:latest',
    temperature: 0.1,   // low temperature — classification should be deterministic
    maxTokens: 1024,    // gemma4 uses thinking tokens before classification output
    contextWindow: 8192,
    timeout: 30_000,
  };
  return new LLMClient(config);
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

/**
 * Walk a directory recursively and return all .ts/.tsx files that are not
 * excluded by the definition's excludeFiles patterns.
 */
function walkFiles(dir: string, excludeFiles: RegExp[] = []): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') { continue; }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, excludeFiles));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      const isExcluded = excludeFiles.some(p => p.test(full.replace(/\\/g, '/')));
      if (!isExcluded) { results.push(full); }
    }
  }
  return results;
}

/**
 * Scan a single file for lines matching any of the definition's patterns.
 * Returns one AuditMatch per matching line with surrounding context.
 */
function scanFile(filePath: string, definition: AuditDefinition): AuditMatch[] {
  let source: string;
  try {
    source = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const lines = source.split('\n');
  const matches: AuditMatch[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matched = definition.patterns.some(p => p.test(line));
    if (!matched) { continue; }

    const from = Math.max(0, i - definition.contextLines);
    const to = Math.min(lines.length - 1, i + definition.contextLines);
    const contextLines = lines.slice(from, to + 1);

    // Mark the matched line with a ▶ prefix so the classifier knows which line triggered
    const matchOffset = i - from;
    contextLines[matchOffset] = `▶ ${contextLines[matchOffset]}`;

    matches.push({
      file: filePath,
      line: i + 1,
      content: line.trim(),
      context: contextLines.join('\n'),
    });
  }

  return matches;
}

/**
 * Scan a directory for all matches of the audit definition.
 * Returns raw matches without classification — call run() for the full pipeline.
 */
export function scan(definition: AuditDefinition, rootDir: string): AuditMatch[] {
  const files = walkFiles(rootDir, definition.excludeFiles);
  return files.flatMap(f => scanFile(f, definition));
}

// ---------------------------------------------------------------------------
// Full pipeline: scan → classify → report
// ---------------------------------------------------------------------------

/**
 * Run the full audit: scan rootDir, classify every match, return a report.
 *
 * @param definition  The audit definition (patterns, rubric, excludes).
 * @param rootDir     Directory to scan (e.g. path.join(__dirname, '../../src')).
 * @param client      Optional LLMClient — uses default local Ollama if omitted.
 */
export async function run(
  definition: AuditDefinition,
  rootDir: string,
  client?: LLMClient
): Promise<AuditReport> {
  const llm = client ?? makeDefaultClient();
  const matches = scan(definition, rootDir);

  const files = new Set(matches.map(m => m.file));
  console.log(`[AuditAgent] ${definition.name}: ${matches.length} matches in ${files.size} files`);

  const results: AuditResult[] = [];
  for (const match of matches) {
    const rel = path.relative(rootDir, match.file).replace(/\\/g, '/');
    console.log(`[AuditAgent] Classifying ${rel}:${match.line} …`);
    // Clear history before each classify call — each classification is single-shot;
    // accumulated history from prior matches would push the context window to 100%.
    llm.clearHistory();
    const classified = await classifyMatch(match.context, definition.rubric, llm);
    results.push({ match, ...classified });
  }

  const summary: Record<Classification, number> = { prescriptive: 0, reactive: 0, incidental: 0 };
  for (const r of results) { summary[r.classification]++; }

  return {
    definition: definition.name,
    scannedFiles: files.size,
    totalMatches: matches.length,
    results,
    summary,
  };
}
