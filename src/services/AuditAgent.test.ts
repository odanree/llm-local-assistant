/**
 * AuditAgent — cn-mandate audit definition and known-answer test cases.
 *
 * These cases are ground truth from the manual audit we ran on the codebase.
 * The agent must classify each snippet correctly before the implementation
 * is considered complete.
 *
 * Classification rubric:
 *   prescriptive — tells the LLM/generator to USE cn() (mandate)
 *   reactive     — fires only WHEN cn() is already in generated code (enforcer)
 *   incidental   — cn() appears in a string, comment, or example that is not an instruction
 */

import { describe, it, expect } from 'vitest';
import { classifyMatch, CN_MANDATE } from './AuditAgent';

// ---------------------------------------------------------------------------
// Audit definition — the cn mandate
// ---------------------------------------------------------------------------

describe('AuditAgent — cn-mandate definition', () => {
  it('has a name, patterns, rubric, and contextLines', () => {
    expect(CN_MANDATE.name).toBe('cn-mandate');
    expect(CN_MANDATE.patterns.length).toBeGreaterThan(0);
    expect(typeof CN_MANDATE.rubric).toBe('string');
    expect(CN_MANDATE.contextLines).toBeGreaterThan(0);
  });

  it('patterns match cn import strings', () => {
    const samples = [
      `import { cn } from '@/utils/cn'`,
      `import { cn } from 'src/utils/cn'`,
      `import { cn } from '../utils/cn'`,
      `className={cn('p-4', className)}`,
      `use cn() for ALL className merging`,
    ];
    for (const s of samples) {
      expect(CN_MANDATE.patterns.some(p => p.test(s))).toBe(true);
    }
  });

  it('patterns do not match clsx-only lines', () => {
    const nonMatches = [
      `import { clsx } from 'clsx'`,
      `className={clsx('p-4', className)}`,
    ];
    for (const s of nonMatches) {
      expect(CN_MANDATE.patterns.some(p => p.test(s))).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Known-answer classification cases
// ---------------------------------------------------------------------------

describe('AuditAgent — classifyMatch (known answers)', () => {

  // ── PRESCRIPTIVE ────────────────────────────────────────────────────────

  it('classifies generator-prompt CN() USAGE RULE as prescriptive', async () => {
    const snippet = `
CN() USAGE RULE (mandatory): cn() takes a single base string plus optional
conditional arguments — NEVER pass an empty string as an argument.
- WRONG: className={cn('px-4 py-2', '')}
- RIGHT: className={cn('px-4 py-2')}
- IMPORT PATH: always import cn as: import { cn } from '@/utils/cn'
`;
    const result = await classifyMatch(snippet, CN_MANDATE.rubric);
    expect(result.classification).toBe('prescriptive');
  });

  it('classifies getGenerationConstraints cn injection as prescriptive', async () => {
    const snippet = `
if (this.data.cnUtilityPath) {
  lines.push(\`- Import cn from "\${this.data.cnUtilityPath}" — use cn() for ALL className merging (never string concat or template literals)\`);
}
`;
    const result = await classifyMatch(snippet, CN_MANDATE.rubric);
    expect(result.classification).toBe('prescriptive');
  });

  it('classifies planner unconditional cn mandate as prescriptive', async () => {
    const snippet = `
- Use cn() utility from src/utils/cn.ts to merge custom classes
`;
    const result = await classifyMatch(snippet, CN_MANDATE.rubric);
    expect(result.classification).toBe('prescriptive');
  });

  // ── REACTIVE ─────────────────────────────────────────────────────────────

  it('classifies manual-concat validator as reactive', async () => {
    const snippet = `
const importsCn = /import\\s+.*\\bcn\\b.*from/.test(content);
const hasManualConcat = /className\\s*=\\s*[\`'"][^\`'"]*\\$\\{/.test(content);
if (importsCn && hasManualConcat) {
  errors.push(
    \`❌ Style bug: cn() is imported but className uses manual string concatenation. \` +
    \`Use cn() for all class merging: className={cn('base', variant === 'primary' && 'bg-indigo-600', className)}\`
  );
}
`;
    const result = await classifyMatch(snippet, CN_MANDATE.rubric);
    expect(result.classification).toBe('reactive');
  });

  it('classifies bare-string validator as reactive', async () => {
    const snippet = `
// Detect bare string classNames when cn() is imported.
// Every className prop must go through cn() — no exceptions, including submit buttons.
if (importsCn && bareStringClassName) {
  errors.push(
    \`❌ Style bug: cn() is imported but a className prop uses a bare string literal.\`
  );
}
`;
    const result = await classifyMatch(snippet, CN_MANDATE.rubric);
    expect(result.classification).toBe('reactive');
  });

  it('classifies Wrong/Dead import cn removal as reactive', async () => {
    const snippet = `
// Wrong import: cn in a non-component .ts file — remove the cn import entirely
if (error.includes('Wrong import') && error.includes('cn')) {
  fixed = this.removeUnusedImport(fixed, 'cn');
}
// Dead import: cn imported in a .tsx file but never called — remove it
if (error.includes('Dead import') && error.includes('cn')) {
  fixed = this.removeUnusedImport(fixed, 'cn');
}
`;
    const result = await classifyMatch(snippet, CN_MANDATE.rubric);
    expect(result.classification).toBe('reactive');
  });

  // ── INCIDENTAL ───────────────────────────────────────────────────────────

  it('classifies GOLDEN_TEMPLATES CN_UTILITY string as incidental', async () => {
    const snippet = `
export const GOLDEN_TEMPLATES = {
  CN_UTILITY: \`import { twMerge } from 'tailwind-merge';
import { clsx, type ClassValue } from 'clsx';

export const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs));
};\`,
};
`;
    const result = await classifyMatch(snippet, CN_MANDATE.rubric);
    expect(result.classification).toBe('incidental');
  });

  it('classifies FIRST-B SmartAutoCorrection fix as reactive', async () => {
    const snippet = `
// FIRST-B: Replace phantom cn() import with clsx.
// cn() is a training-data hallucination — generators import it even when src/utils/cn.ts
// is absent from the workspace.
const hasCnPhantomImport = validationErrors.some(e =>
  e.includes('Cannot find module') && /\\bcn\\b|utils\\/cn/.test(e)
);
if (hasCnPhantomImport) {
  fixed = fixed.replace(/^import\\s*\\{[^}]*\\bcn\\b[^}]*\\}.*$/gm, '');
  fixed = fixed.replace(/\\bcn\\(/g, 'clsx(');
}
`;
    const result = await classifyMatch(snippet, CN_MANDATE.rubric);
    // Reactive: fires only when cn() phantom import is detected in generated output
    expect(result.classification).toBe('reactive');
  });

  it('classifies JSDoc comment mentioning cn() as incidental', async () => {
    const snippet = `
/**
 * Returns true when a file is a structural layout wrapper:
 * Layout components render HTML structure (header/main/footer) around children.
 * They ARE visual, use cn(), but still require a children prop.
 */
`;
    const result = await classifyMatch(snippet, CN_MANDATE.rubric);
    expect(result.classification).toBe('incidental');
  });

  // ── NEGATIVE / BOUNDARY ──────────────────────────────────────────────────

  it('classifies explicit NEVER-use-cn guard as incidental', async () => {
    const snippet = `
'Uses inline style={{}} objects for ALL styling — NO cn(), clsx, className with Tailwind strings'
`;
    const result = await classifyMatch(snippet, CN_MANDATE.rubric);
    // Explicitly forbids cn() — not prescribing it, not enforcing it
    expect(result.classification).toBe('incidental');
  });

});
