# ADR-007: Criteria Generator Must Not Prescribe Implementation Choices

**Date:** 2026-04-15
**Status:** Accepted
**Deciders:** Danh Le
**Branch:** `fix/criteria-generator-cn-prescription`

---

## Context

The Architect-Executor-Reviewer pipeline (ADR-002) uses a criteria generator (`generateAcceptanceCriteria`) to produce 3–5 YES/NO acceptance criteria before code generation. These criteria serve two roles:

1. **Generator directive** — injected into the WRITE prompt so the LLM knows what will be checked
2. **Reviewer input** — passed to the LLM reviewer (Check 5) for structured YES/NO validation

Run 1V (Badge component eval) revealed a systematic failure: the criteria LLM generated:

> *"Accepts 'className' prop and merges it using cn()"*

This criterion:
- **Pre-instructed** the generator to import `cn` from `@/utils/cn`
- **Neutralized** the phantom-import probe (Check 2 / cross-file contract) before it could fire — because the LLM was told to import cn, it did, and the validator found it and passed

The phantom-import probe's purpose is exactly to catch hallucinated import paths. By locking in the import via criteria, the test was collapsed: the only way to fail was to import cn *incorrectly*, not to hallucinate it *at all*.

### Why the criteria LLM generates implementation directives

The criteria prompt asked for criteria that are "concrete and checkable by reading code." For a Tailwind project, `"uses cn()"` satisfies that description — it is concrete, it is checkable, and it pattern-matches to every Tailwind component the LLM has seen in training. The model has no concept of probe space or downstream validation layers; it generates what looks like a good criterion.

This is a category of failure not covered by ADR-005 (Dual-Enforcement). ADR-005 addresses prompt constraints that the generator LLM ignores. This failure is upstream: the **criteria generator itself** is issuing an instruction that forecloses a validation check before the generator runs.

---

## Decision

**Acceptance criteria must describe observable outcomes, not implementation choices.**

A criterion is an *observable outcome* if it can be verified by inspecting the file's behavior, API, or structure independently of which utility was used to implement it. A criterion is an *implementation directive* if it specifies which library, function, or import path to use.

| Directive (forbidden) | Outcome (required) |
|---|---|
| "Accepts 'className' prop and merges it using cn()" | "Accepts optional className prop" |
| "Imports cn from @/utils/cn" | "Applies variant-based Tailwind classes conditionally" |
| "Uses clsx for conditional class merging" | "Severity prop controls which color classes are applied" |

### Enforcement — two layers (per ADR-005)

**Layer 1 — Prompt constraint:**
The criteria prompt now explicitly states:

> *NEVER prescribe which utility to use for class merging. Do NOT write criteria like "uses cn()" or "imports cn from". Instead write the observable outcome: "Accepts optional className prop" or "Applies variant-based Tailwind classes conditionally".*

**Layer 2 — Post-filter:**
After the criteria LLM responds, strip any criterion matching `/\bcn\s*\(/` or `/imports?\s+cn\b/` or `/use[s]?\s+cn\b/`. Local LLMs reliably ignore negative constraints on high-frequency patterns.

### Why the validator (not criteria) enforces cn() usage

Check 2 (bare-string className) and the manual-concat check already fire on the actual written file content — they are the correct enforcement layer for cn() usage. Criteria should check *what* the component does, not *how* it implements class merging.

### Scope of the principle

The implementation-directive prohibition applies specifically to:
- Class-merging utilities (`cn`, `clsx`, `classnames`)
- State management imports (`zustand`, `redux`, specific store hooks)
- Any import path that the validator is designed to probe as potentially hallucinated

It does **not** apply to:
- API constraints that are definitionally implementation: `"Uses React.forwardRef"`, `"Exports a named const"`, `"Uses useCallback for handlers"` — these describe the required interface, not a utility choice
- File-type constraints: `"No JSX in a .ts file"`, `"No CSS module imports"` — these are structural, not utility-choice

### Children-prop reminder

A second gap from Run 1V: the Badge component was specified as `"accepts severity and className props"` in the step description, with no mention of `children`. The criteria LLM mirrored the description and generated no children criterion. The component was written without a content slot.

For `.tsx` component files whose step description does not mention `children`, the criteria prompt now includes:

> *If this component wraps or displays content (text, icons, slots), include a criterion for "Accepts children: React.ReactNode". Omit it only for self-contained display components like icons or spinners.*

This is a reminder, not a requirement — the criteria LLM decides whether children applies. Self-contained display components (loaders, icons) should not be forced to have children.

---

## Consequences

**Positive:**
- The phantom-import probe (Check 2 / cross-file contract) can now fire on cn import paths — the criteria no longer pre-empt it
- Criteria describe behavior, which is more stable across refactors (cn → clsx migration does not invalidate criteria)
- The post-filter provides a deterministic backstop independent of LLM instruction-following

**Negative:**
- The post-filter removes criteria that happen to mention cn() as part of a larger behavioral statement: e.g., `"All className props are routed through cn() for conditional merging"`. This is a valid behavioral criterion (not just an import directive) that the filter incorrectly strips. The regex is intentionally conservative — edge cases are acceptable losses versus the probe-neutralization risk.

**Mitigations:**
- The filter pattern is narrow: it requires `cn(`, `imports cn`, or `uses cn` as a phrase — it will not strip a criterion that says `"Conditionally applies classes based on severity"` even if cn() is how the component achieves it

---

## Alternatives Considered

### Run the phantom-import probe before criteria injection

Run Check 2 against the file *before* injecting criteria into the generation prompt. Rejected: Check 2 runs *after* generation — there is no file to probe until the generator writes one. The criteria are injected *before* generation to guide the LLM.

### Use criteria only for the reviewer, not the generator

Don't inject criteria into the generation prompt — pass them only to the LLM reviewer. Rejected: this would eliminate the "generator knows what will be checked" benefit and increase first-pass failure rates. The generation quality improvement from criteria injection is observable.

### Separate criteria tiers: generator-facing vs. reviewer-facing

Generate two criterion sets: one behavioral set for the reviewer (what to check) and one structural set for the generator (what to produce). Rejected: doubles the LLM calls in the critical path and adds complexity. The outcome-only constraint achieves the same separation with a single criteria pass.
