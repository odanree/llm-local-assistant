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

import { LLMClient, LLMConfig } from '../llmClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Classification = 'prescriptive' | 'reactive' | 'incidental';
export type RecommendedAction = 'remove' | 'update' | 'keep';

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
  → These should be REMOVED or made conditional.

REACTIVE
  The code only fires WHEN cn() is already present in generated output.
  It enforces correct usage or cleans up cn() but does not prescribe it.
  Examples:
  - validators that check "if cn is imported, all classNames must use it"
  - auto-correction that removes a dead or phantom cn import
  - error messages that fire on "cn() is imported but className uses bare string"
  - code that detects cn() in generated output and replaces or removes it
  KEY SIGNAL: look for an if-condition that gates on cn() being present (importsCn,
  error.includes('cn'), hasCnPhantomImport) — if the code only runs because cn is
  already there, it is REACTIVE regardless of whether it keeps or removes cn().
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
  ],
  rubric: CN_RUBRIC,
  contextLines: 15,
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
    model: 'mistral',
    temperature: 0.1,   // low temperature — classification should be deterministic
    maxTokens: 256,     // short response: CLASSIFICATION / REASON / ACTION only
    contextWindow: 8192,
    timeout: 30_000,
  };
  return new LLMClient(config);
}
