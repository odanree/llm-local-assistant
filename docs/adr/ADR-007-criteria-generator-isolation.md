# ADR-007: Acceptance Criteria Must Be Declarative, Not Imperative

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

This criterion is **imperative** — it tells the generator *how* to implement class merging. The correct form is **declarative** — describing *what* the component must expose:

> *"Accepts optional className prop"*

The imperative form caused two concrete failures:
- **Pre-instructed** the generator to import `cn` from `@/utils/cn`
- **Neutralized** the phantom-import probe before it could fire — the LLM was told to import cn, it did, and the validator found it and passed

The phantom-import probe's purpose is exactly to catch hallucinated import paths. By prescribing the import via criteria, the probe space collapsed: the only way to fail was to import cn *incorrectly*, not to hallucinate it *at all*.

### The imperative/declarative distinction

An **imperative** criterion specifies *how* to implement something. A **declarative** criterion specifies *what* the output must be. The difference:

| Imperative (how) | Declarative (what) |
|---|---|
| "Merges classNames using cn()" | "Accepts optional className prop" |
| "Imports cn from @/utils/cn" | "Applies variant-based Tailwind classes conditionally" |
| "Uses useCallback for event handlers" | "Handler functions are stable across renders" |
| "Uses clsx for conditional class merging" | "Severity prop controls which color classes are applied" |

A declarative criterion is satisfied by any correct implementation. An imperative criterion is satisfied only by one specific implementation — and pre-selects that implementation before validation can probe whether it's correct.

### Why the criteria LLM generates imperative criteria

The criteria prompt asked for criteria that are "concrete and checkable by reading code." For a Tailwind project, `"uses cn()"` satisfies that description — it is concrete, it is checkable, and it pattern-matches to every Tailwind component the LLM has seen in training. The model has no concept of probe space or downstream validation layers; it generates what looks like a good criterion.

This is a category of failure not covered by ADR-005 (Dual-Enforcement). ADR-005 addresses prompt constraints that the *generator* LLM ignores. This failure is upstream: the **criteria generator itself** is issuing an instruction that forecloses a validation check before the generator runs. The generator complied perfectly — that was the problem.

---

## Decision

**Acceptance criteria must be declarative: they describe what the output must be, not how to produce it.**

### Enforcement — two layers (per ADR-005)

**Layer 1 — Prompt constraint:**
The criteria prompt now explicitly states:

> *NEVER prescribe which utility to use for class merging. Do NOT write criteria like "uses cn()" or "imports cn from". Instead write the observable outcome: "Accepts optional className prop" or "Applies variant-based Tailwind classes conditionally".*

**Layer 2 — Post-filter:**
After the criteria LLM responds, strip any criterion matching `/\bcn\s*\(/` or `/imports?\s+cn\b/` or `/use[s]?\s+cn\b/`. Local LLMs reliably ignore negative constraints on high-frequency patterns — the post-filter is the deterministic backstop.

### Why the validator (not criteria) enforces cn() usage

Check 2 (bare-string className) and the manual-concat check already fire on the actual written file content. They are the correct enforcement layer: they observe the implementation and flag it if wrong. Criteria should declare the contract; validators should enforce the implementation rules. Mixing those layers is where probe space collapses.

### Boundary: declarative vs. definitionally-imperative

Some criteria are inherently about interface shape — they reference a specific API that is the point:

- `"Uses React.forwardRef"` — forwardRef is the required interface, not an implementation detail
- `"Exports a named const"` — export shape is the contract
- `"No JSX in a .ts file"` — file-type constraint, not utility choice

These are acceptable imperative-looking criteria because the *what* and the *how* are the same thing. The test: would a different implementation still satisfy it? For `"Uses React.forwardRef"` — no, nothing else satisfies it. For `"Uses cn() for class merging"` — yes, clsx or a conditional expression would satisfy the underlying intent. The latter is an imperative criterion masquerading as a declarative one.

### Children-prop reminder

A second gap from Run 1V: the Badge component was specified as `"accepts severity and className props"` — no mention of `children`. The criteria LLM mirrored the description and generated no children criterion. The component was written without a content slot.

For `.tsx` component files whose step description does not mention `children`, the criteria prompt now includes:

> *If this component wraps or displays content (text, icons, slots), include a criterion for "Accepts children: React.ReactNode". Omit it only for self-contained display components like icons or spinners.*

This is a reminder, not a mandate — the criteria LLM decides whether children applies.

---

## Consequences

**Positive:**
- Phantom-import probe (Check 2 / cross-file contract) can now fire on cn import paths — criteria no longer pre-empt it
- Declarative criteria are stable across refactors: a cn → clsx migration does not invalidate the criteria
- The post-filter provides a deterministic backstop independent of LLM instruction-following

**Negative:**
- The post-filter strips criteria that mention cn() as part of a genuinely behavioral statement: e.g., `"All className props are routed through cn() for conditional merging"`. This is a borderline case — it describes a behavior (routing) but names the utility. The filter errs on the side of stripping it. Acceptable loss versus probe-neutralization risk.

**Mitigations:**
- Filter pattern is narrow (`cn(`, `imports cn`, `uses cn` as phrases) — it does not strip `"Conditionally applies classes based on severity"` even if cn() is the implementation

---

## In My Own Words

> *What's the difference between imperative and declarative criteria, and why does it matter which one the criteria generator produces? Use the cn() example. (2-3 sentences in your own words)*

---

## Alternatives Considered

### Run the phantom-import probe before criteria injection

Run Check 2 against the file before injecting criteria into the generation prompt. Rejected: Check 2 runs after generation — there is no file to probe until the generator writes one.

### Use criteria only for the reviewer, not the generator

Don't inject criteria into the generation prompt — pass them only to the LLM reviewer. Rejected: eliminating criteria from the generator prompt increases first-pass failure rates. The quality improvement from criteria injection is observable.

### Separate criteria tiers: declarative for the reviewer, imperative for the generator

Generate two sets: behavioral criteria for the reviewer and structural directives for the generator. Rejected: doubles LLM calls in the critical path. The declarative-only constraint achieves the same separation with one pass.
