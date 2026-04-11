# ADR-002: Architect-Executor-Reviewer Pattern for Code Generation

**Date:** 2026-04-11  
**Status:** Accepted  
**Deciders:** Danh Le  
**Branch:** `feature/generation-quality-v2`

---

## Context

Early generation runs produced code that failed validation on the first pass ~60% of the time. The correction loop (generate → validate → auto-correct → re-validate) was the norm, not the exception.

Two structural problems caused this:

1. **The generator didn't know what the reviewer would check.** The LLM generated code against a vague description. The validator then checked specific rules (forwardRef, padding, controlled inputs). The generator and reviewer were operating with different information.

2. **The corrector didn't have the original code.** When auto-correction ran, it sent only the error list to the LLM and asked for a fix. The LLM regenerated from scratch rather than patching — sometimes fixing the flagged issue while breaking something else (the v24 case: forwardRef added, `<button>` element lost).

---

## Decision

Adopt the **Architect-Executor-Reviewer** pattern:

```
Architect  →  generateAcceptanceCriteria()
               (task-specific YES/NO criteria, before generation)
                       ↓
Executor   →  LLM generates code
               (criteria injected into generation prompt)
                       ↓
Reviewer   →  llmValidate() + validateCommonPatterns()
               (checks code against same criteria)
                       ↓
Corrector  →  attemptAutoFix()
               (sends current code + errors, not just errors)
```

### Architect (generateAcceptanceCriteria)

Calls the LLM with a short task description before code generation. Returns 3–5 concrete YES/NO criteria specific to this task (e.g. `"Uses React.forwardRef"`, `"Only 'primary'/'secondary' variants defined"`).

Criteria are injected into the generation prompt as `ACCEPTANCE CRITERIA (Reviewer will check each — your code MUST satisfy all)`. The generator now knows what it will be judged on.

**Reliability constraints for 7B models:**
- System message: `'You output only valid JSON arrays of strings. No explanation, no preamble, no markdown.'`
- Prompt suffix: `Output the JSON array:` (not `JSON:` — causes empty output)
- `max_tokens: 150`, `timeout: 5000ms`
- Fallback: `|| '[]'` not `?? '[]'` (catches empty string)

### Executor (generation prompt)

The generation prompt includes:
- Task description and file target
- `ACCEPTANCE CRITERIA` block from the Architect
- Constraint sections based on file type: `INTERACTIVE COMPONENT RULES` (for Button/Input/etc.), `HOOK FILE RULES` (for hooks/), `formPatternSection` (for Form components)
- `SCOPE CONSTRAINT` — explicit ban on implicit bounds, extra variants, unrequested props

### Reviewer (validation)

`validateGeneratedCode` runs two passes:
1. `validateCommonPatterns` — deterministic rule checks (forwardRef, JSX return, padding, cn usage, controlled inputs, export consistency, import hygiene)
2. `llmValidate` — LLM yes/no check against the Architect's criteria (skipped if LLM unavailable)

Errors are split into `critical` (❌ — block generation) and `suggestions` (⚠️ — log only, non-blocking).

### Corrector (auto-fix prompt)

Fix prompt format:
```
"The following code for {path} has CRITICAL validation errors that MUST be fixed.

CURRENT CODE:
{currentContent}

ERRORS TO FIX:
1. ❌ ...

Fix ONLY the listed errors. Keep all existing JSX structure, imports, and logic intact.
Provide ONLY the corrected code. No explanations, no markdown."
```

Including `CURRENT CODE` is mandatory. Without it, the LLM regenerates from scratch and loses context it had before (JSX body, styling utilities, etc.).

---

## Consequences

**Positive:**
- First-pass success rate improved significantly (run 1 of the series: always corrected; after full pattern: usually passes on first attempt)
- The JSX return bug (v24) is now caught as a critical error — can never be written to disk
- Correction loops preserve the original structure instead of regenerating

**Negative:**
- `generateAcceptanceCriteria` adds one extra LLM call per WRITE step (~500ms on local hardware)
- If the LLM returns malformed JSON for criteria, the generation prompt falls back to no criteria — silent degradation

**Mitigations:**
- 5s timeout and `|| '[]'` fallback prevent blocking on bad criteria responses
- The `⚠️ [AC debug]` log message surfaces criteria failures visibly in the UI during development
- Deterministic validators (`validateCommonPatterns`) don't depend on the Architect call — they always run

---

## Alternatives Considered

### Single-pass generation with very long prompt

Inject all possible constraints upfront. Rejected: 7B context window is limited and a long fixed prompt dilutes the task-specific signal. The Architect generates criteria that are precise for this task, not generic.

### Post-hoc correction only (no Architect)

Keep the validate → correct loop but improve the fix prompt. Partially implemented (CURRENT CODE fix). Insufficient alone — the generator still doesn't know what it will be checked on, so first-pass failures remain common.

### Static acceptance criteria per file type

Hardcode criteria per component type (Button always gets these 4 criteria, Form always gets these 5). Simpler but misses task-specific requirements (e.g. "Does not import cn" only matters if the task context involved cn recently).
