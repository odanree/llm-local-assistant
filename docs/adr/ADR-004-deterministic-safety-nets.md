# ADR-004: Deterministic Safety Nets for Non-Deterministic Criteria

**Date:** 2026-04-11  
**Status:** Accepted  
**Deciders:** Danh Le  
**Branch:** `feature/generation-quality-v2`

---

## Context

`generateAcceptanceCriteria` calls the LLM to produce task-specific YES/NO criteria before code generation. This is intentionally non-deterministic — the criteria vary between runs to stay task-relevant.

The failure mode surfaced clearly in Test #2 (useCounter + Counter):

- **Run 1 criteria:** `"Returns an object containing increment, decrement, and reset functions"` — `count` not mentioned
- **Run 2 criteria:** `"Uses React.useState to manage the count state"` — LLM understood count was the point

Run 1 produced a hook that returned `{ increment, decrement, reset }` only. The consumer (`Counter.tsx`) had no way to read the count value. The LLM detected this gap and worked around it by calling `useCounter()` twice — creating two independent state atoms. The increment buttons updated the first atom; the displayed count came from the second (always 0). A comment in the generated JSX read: *"Assuming we can destructure count, even if the previous step omitted it"* — the LLM knew the contract was broken and chose a wrong workaround over fixing the source.

The validator had no check for this. The workaround passed validation and was written to disk.

---

## Decision

**Non-deterministic criteria cannot be the sole enforcement mechanism for structural contracts.** Every contract that is both:
1. Always required for correctness (not task-specific), AND
2. Missed by criteria at a non-trivial frequency

...must have a corresponding **deterministic validator check** and/or a **hardcoded generation prompt rule**.

### For the hook return contract specifically:

**Generation prompt rule** (`hookConstraintSection`):

```
RETURN CONTRACT: The return object MUST expose ALL managed state values AND their manipulation functions.
  WRONG: return { increment, decrement, reset }  — hides the count value from the consumer
  RIGHT:  return { count, increment, decrement, reset }  — count is the primary value, always expose it
  Rule: every piece of state created with useState MUST appear in the return object.
```

**Validator check** (`validateCommonPatterns`):

Scan all `const [x, setX] = useState(...)` declarations in hook files. For each state variable `x`, verify `x` appears in the `return { ... }` object. If absent, fire `❌ Hook return missing state`.

This is deterministic — it fires on every hook file regardless of what the acceptance criteria generated.

### General principle

When adding a new hardcoded constraint (prompt rule or validator check), the trigger question is:

> *"Could generateAcceptanceCriteria plausibly omit this requirement on any given run?"*

If yes, the constraint belongs in the deterministic layer (prompt section + validator), not only in criteria.

---

## Consequences

**Positive:**
- Hook return contract is now enforced regardless of criteria variance
- The double-call workaround pattern is caught at the hook level (missing state in return) rather than requiring the consumer to behave incorrectly before anyone notices
- Pattern generalizes: any future hook that hides state from its consumers will be flagged

**Negative:**
- More hardcoded rules means more maintenance surface
- A hook that intentionally omits a state variable from its return (e.g. an internal error state not meant for consumers) would false-positive

**Mitigations:**
- The validator is limited to hook files (`.ts` in `hooks/`) — no false positives in stores, utilities, or components
- The check is structural (state variable name in return object), not semantic — easy to audit
- A hook that genuinely wants to hide state can use a different variable name that doesn't match `const [x, set...]`

---

## Alternatives Considered

### Fix criteria generation to always include state values

Add a system instruction to `generateAcceptanceCriteria`: *"Always include the primary return values in criteria for hook files."* Rejected: the LLM can still phrase criteria in ways that imply the state value without naming it. Non-determinism is fundamental to sampling — you cannot reliably force specific content.

### Rely on consumer-level validation

If `Counter.tsx` calls `useCounter()` twice, that could be caught. Rejected: the consumer-level symptom is one step removed from the root cause. Fixing at the hook level is cleaner — the contract violation is where the state is defined, not where it's consumed.

### Only enforce via generation prompt, no validator

The generation prompt rule is necessary but not sufficient. If the LLM ignores the rule (common on first pass for 7B models), the validator is the backstop. Both layers are needed.
