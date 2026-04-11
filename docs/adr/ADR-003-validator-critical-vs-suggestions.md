# ADR-003: Split Validator Output into Critical Errors vs Suggestions

**Date:** 2026-04-11  
**Status:** Accepted  
**Deciders:** Danh Le  
**Branch:** `feature/generation-quality-v2`

---

## Context

Early validation returned a flat list of errors. Any single error — whether a missing `forwardRef` or a stylistic warning about Tailwind class order — blocked generation and triggered the correction loop. This caused two problems:

1. **Correction loop inflation.** A ⚠️ "consider adding disabled styles" warning would send the LLM into a correction loop for a minor issue, wasting a round-trip and sometimes introducing new bugs.

2. **Signal noise.** Users couldn't distinguish "this code will crash" from "this code could be better." Both appeared as the same ❌ in the UI.

---

## Decision

Split all validator output into two tiers:

### Critical (❌) — Block generation

These fire the correction loop. Code is not written to disk until they are resolved (or max retries exhausted):

- Missing `forwardRef` on interactive components
- Missing `displayName` after `forwardRef`
- Component returns no JSX (bare string/cn() return)
- Missing padding utilities on interactive components
- `cn` imported but never called (dead import)
- `cn` imported in a hook file (wrong layer)
- `initial*` prop destructured but never used (silent prop)
- Missing `value` on a controlled `<input>` that has `onChange`
- Form component missing required structural patterns (state interface, submit handler, controlled inputs)

### Suggestions (⚠️) — Log only, non-blocking

These are logged in the UI for user awareness but do not trigger correction:

- JSX detected without React import (Modern React 17+ doesn't need it)
- Conflicting Tailwind transition utilities (twMerge silently resolves)
- Duplicate utility-only default export without named export
- Minor a11y gaps (missing `focus:ring-offset-2` etc.)

### Implementation

`filterCriticalErrors(errors)` splits the flat error array by prefix:
- `❌` prefix → critical
- `⚠️` prefix → suggestion

The correction loop only uses `criticalErrors`. `suggestions` are passed to `onMessage` as warnings.

---

## Consequences

**Positive:**
- Correction loops only fire for genuine blockers — faster generation overall
- Users see a clear distinction between "must fix" and "could improve"
- Suggestions accumulate feedback without inflating correction rounds

**Negative:**
- Some ⚠️ issues (e.g. missing `disabled:opacity-50`) affect real usability but don't block
- A developer might ship a component with suggestions unfixed because they're non-blocking

**Mitigations:**
- Suggestions are shown in the UI and logged — they're visible, just not blocking
- The bar for ❌ is deliberately high: "would this cause a runtime crash or a spec violation?" If yes, critical. If it's a style or completeness gap, suggestion.
- Critical/suggestion classification can be revisited per-rule as eval data accumulates

---

## Classification Heuristic

When adding a new validator check, use this decision tree:

```
Would this cause a runtime error or crash on render?
  → YES: ❌ Critical

Does this violate the component spec (missing required prop, wrong return type)?
  → YES: ❌ Critical

Is this a styling/a11y completeness gap that doesn't break functionality?
  → YES: ⚠️ Suggestion

Is this a best-practice recommendation?
  → YES: ⚠️ Suggestion
```
