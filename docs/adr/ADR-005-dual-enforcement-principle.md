# ADR-005: Dual-Enforcement Principle — Every Prompt Constraint Needs a Code Backstop

**Date:** 2026-04-11  
**Status:** Accepted  
**Deciders:** Danh Le  
**Branch:** `feature/generation-quality-v2`

---

## Context

After the `.lla-rules` removal (ADR-001), the stated rule was: "constraints live in versioned code, not free-form text." The three subsequent fixes applied to the LoginForm eval series violated that rule by adding prompt-only constraints:

1. **Planner scope creep** — text block in `buildPlanPrompt`: "ONLY create files explicitly named in the user's request"
2. **Form import-don't-redefine** — text block in `formPatternSection`: "never shadow-define a component locally"
3. **Split React imports** — no fix at all; `reactImportsSection` was actively causing the bug by showing each hook as a separate import example

Run 1 of the LoginForm series demonstrated the failure: the planner ignored the scope constraint and generated 5 steps, including an unprompted `App.tsx` modification. Run 2 looked correct — but the improvement was explained by conversation history (`LLMClient.conversationHistory` sends the full prior session to the model), not the constraint working.

The existing post-processing filters (`filterNoisyReadSteps`, `filterTestSteps`, `filterRedundantWrites`) already applied the correct pattern: enforce in code, use the prompt as context not guarantee.

---

## Decision

**Dual-enforcement: every "don't do X" prompt constraint must have a code-level backstop.**

The trigger question before adding a prompt constraint:

> *"Could the LLM plausibly ignore this instruction on any given run?"*

If yes, the fix belongs at two layers:
1. **Code** (validator check or post-processing filter): fires deterministically, regardless of what the prompt says
2. **Prompt** (generation section or planner block): reduces frequency of the violation, gives the LLM a WRONG/RIGHT example

If the constraint only exists in a prompt, it is not enforced — it is suggested.

### Application to the three LoginForm gaps

**Split React imports:**
- Validator: `❌` when content has 2+ `from 'react'` import lines
- Prompt: `reactImportsSection` replaced with a WRONG/RIGHT merged example (the old version was causing the bug by listing each hook as a separate import)

**Planner scope creep (App.tsx modification):**
- New post-processing filter `filterUnrequestedEntryWrites`: drops WRITE steps for `App|main|layout|Root|index.tsx` unless explicitly in the user request
- Same code pattern as `filterNoisyReadSteps` — the prompt hint is retained but the filter is the actual enforcement

**Integration validator — fabricated import paths:**
- Code: import path resolution check in the integration validator; `❌` when a generated file imports from a path not created in this plan
- No prompt change needed — the issue was in the validator layer, not the generation prompt

### Scope of the principle

The principle applies to:
- **Validators**: if a rule fires as `❌` consistently on first-pass, it needs a generation prompt rule too (F4 / ADR-003 direction: prevent don't correct)
- **Planner post-processors**: if the prompt says "don't do X" but X still appears in plans, add a filter
- **Corrector prompts**: if the corrector introduces a specific bug pattern, add a validator that catches that pattern (the self-referential export fix in ADR-004)

The principle does NOT apply to:
- **Task-specific requirements** that vary by user request — those cannot be hardcoded
- **Stylistic preferences** where violations don't cause bugs (e.g., placeholder text)
- **Performance hints** (e.g., "use useCallback when the function is passed as a prop")

---

## Consequences

**Positive:**
- Every structural code constraint has a deterministic catch — prompt failures become `❌` before hitting disk
- Eval reliability improves: first-run results reflect code enforcement, not just LLM compliance
- The pattern is already established in the codebase (4 existing post-processing filters, multiple validator checks) — this ADR formalizes what was already partially true

**Negative:**
- More validator rules means more false-positive surface — a constraint that's "always wrong" in general may be correct in a specific context
- Post-processing filters can mask LLM behavior that would be useful to observe — filtering App.tsx writes prevents measuring how often the planner scopes creep

**Mitigations:**
- Validators fire `❌` and allow auto-correction — they don't silently discard output
- Post-processing filters log dropped steps to the console — the behavior is auditable
- The principle has a safety valve: "does not apply to task-specific requirements" prevents over-hardcoding

---

## Alternatives Considered

### Improve the prompt until the LLM is reliable

Not viable. LLM compliance with prompt instructions is probabilistic. Even well-crafted instructions are ignored on a non-trivial fraction of runs, especially for a 4B model where context window pressure and training data biases compete with the instruction. Prompt improvements reduce violation frequency; they cannot eliminate it.

### Add unit tests for the violated behaviors

Tests would catch regressions in the code-level checks (validators, filters) but can't test LLM behavior directly. Tests are the right backstop for the code layer, not a substitute for it.

### Accept prompt-only for low-severity issues

The risk: low-severity today becomes critical tomorrow when the same pattern appears in a different context. The JSX validator false-pass was "caught by auto-correction" until it wasn't (Input.tsx, which uses TypeScript generics). The cost of dual-enforcement is low (one validator check + one prompt example); the cost of a prompt-only miss that reaches disk is high (broken code committed).
