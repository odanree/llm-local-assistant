# Generation Quality Learnings

**Series:** Button/useCounter/LoginForm eval runs v1–v30  
**Branch:** `feature/generation-quality-v2`  
**Status:** Active — updated as new regressions are found and fixed

This document captures concrete learnings from iterative eval runs against a local model (Gemma 4 e4b). Each entry has a root cause, the fix applied, and the signal that told us it worked.

---

## 1. forwardRef: Prevent, Don't Correct

**Symptom:** Every Button generation required a correction loop — first pass always missed `React.forwardRef`, auto-corrector wrapped the signature, validator passed.

**Root cause:** The generation prompt said nothing about forwardRef. The validator checked for it *after* the fact. The corrector knew to add it but treated it as a surgical patch.

**Fix:** Inject `INTERACTIVE COMPONENT RULES` block into the generation prompt for files matching `Button|Input|Select|Textarea|...`. The LLM sees `MUST use React.forwardRef` and `MUST set displayName` as requirements, not corrections.

**Signal:** Runs after the fix showed `✅ Validation passed` on first attempt — no correction loop.

**File:** `src/executor.ts` — `interactiveComponentSection` injected into `buildGenerationPrompt`

---

## 2. Auto-corrector Must Include Current Code

**Symptom (run 2, v24 — 3/10 execution):** Auto-corrector wrapped the forwardRef signature correctly but the component body became a bare `cn()` call. No `<button>` element. Runtime: "Nothing was returned from render."

**Root cause:** The fix prompt was:
```
"The code you generated for Button.tsx has CRITICAL errors: ... 
Please fix them and provide ONLY the corrected code."
```
No current code attached. The LLM regenerated from scratch instead of patching — and got the signature right but forgot the JSX body entirely.

**Fix:** Both LLM fix paths now send:
```
"CURRENT CODE:\n<full existing content>\n\nERRORS TO FIX:\n..."
```
with the explicit instruction: *"Fix ONLY the listed errors. Keep all existing JSX structure, imports, and logic intact."*

**Signal:** Run 3 corrected forwardRef and preserved the `<button>` element with all styling utilities intact.

**File:** `src/executor.ts` — both `fixPrompt` constructions in `attemptAutoFix`

---

## 3. JSX Return Validator

**Symptom:** A component that returned `cn(...)` (a string) passed all validation checks and was written to disk. The runtime crash was only discoverable by rendering the component.

**Root cause:** No validator checked whether the component's return statement contained a JSX element. `cn()` is valid TypeScript, so type checks pass. The existing validators checked structure, imports, and Tailwind patterns — not whether JSX was actually returned.

**Fix:** Added check in `validateCommonPatterns`: for `.tsx` files in `/components/` or matching the interactive file pattern, verify the content contains at least one `<Tag` JSX element. If absent, fire `❌ Component returns no JSX`.

**Regex:** `/<[A-Za-z][\w.]*[\s\/>]/`

**File:** `src/executor.ts` — `validateCommonPatterns`, after the forwardRef block

---

## 4. Acceptance Criteria: System Role + Prompt Suffix

**Symptom:** `generateAcceptanceCriteria` returned `[]` silently. UI showed `🎯 Acceptance criteria (0)`. The reviewer had no criteria to check.

**Root cause (layered):**
1. Prompt ended with `JSON:` — the 7B model output nothing (treated as a continuation prompt, not a question)
2. Response was `content: ""` — `?? '[]'` didn't catch empty string (only catches `null`/`undefined`)
3. No system message — model mixed preamble with the JSON array

**Fixes applied:**
- Prompt suffix changed to `Output the JSON array:` (not `JSON:`)
- Fallback changed from `?? '[]'` to `|| '[]'` (catches empty string)
- Added `role: 'system'` message: `'You output only valid JSON arrays of strings. No explanation, no preamble, no markdown.'`
- `max_tokens: 150`, `timeout: 5000ms`

**Signal:** `⚠️ [AC debug]` messages showing empty content → after fix, first run showed `🎯 Acceptance criteria (4)`.

**File:** `src/executor.ts` — `generateAcceptanceCriteria`

---

## 5. Scope Creep Patterns and How to Block Them

Three distinct scope creep patterns appeared across runs. Each required both a prompt-level ban and a validator catch.

### 5a. Implicit Clamping

**Symptom:** `useCounter` decrement generated as `Math.max(0, count - 1)` without being asked.

**Root cause:** Training data for counters almost always includes a floor. The model treats clamping as a "sensible default."

**Fix:** Added to `SCOPE CONSTRAINT` in generation prompt:
> *"Do not add implicit bounds, clamping (Math.max/Math.min), guard clauses, or validation unless the REQUIREMENT explicitly asks for them. 'decrement' means subtract 1 — not 'subtract 1 but clamp at 0'."*

### 5b. Silent Prop Forwarding

**Symptom:** `initialCount` prop destructured from props but never forwarded to the hook's `useState`. The counter always started at 0.

**Root cause:** The model added `initialCount` to the interface (correct) but forgot to thread it into `useState(initialCount)`.

**Fix:** Validator counts occurrences of `initial*` prop names. If a prop appears ≤2 times (interface definition + destructure only), fire `❌ Silent prop — never used after destructuring`.

### 5c. Unrequested Variants/Props

**Symptom:** Button generated with `size`, `isLoading`, `disabled` props when only `primary/secondary` variants were requested.

**Fix:** Explicit SCOPE CONSTRAINT: *"If the REQUIREMENT says 'variant prop supporting primary and secondary', output EXACTLY those two variants — no size prop, no loading state, no icon slot, no extra variants."*

**File:** `src/executor.ts` — `SCOPE CONSTRAINT` block in `buildGenerationPrompt`; `validateCommonPatterns` for the prop check

---

## 6. Hook Constraint Section

**Symptom:** `useCounter.ts` (a `.ts` hook file) kept importing `cn` — a Tailwind utility that has no meaning in a hook.

**Root cause:** Acceptance criteria at one point included a cn-related item (from a prior Button run's criteria leaking context). The model saw `cn` mentioned and imported it.

**Fix (three-layer):**
1. Validator: `❌` if `cn` is imported in a hook file
2. Generation prompt: `HOOK FILE RULES` block — *"NEVER import cn, clsx, classnames, or any CSS/style utility — hooks have no className"*
3. Acceptance criteria prompt: Hook constraint injected into the criteria-generation prompt so criteria never mention cn for hook files

**Signal:** v20 was the first run where `🎯` criteria explicitly said "Does not import cn" — model never generated it.

**File:** `src/executor.ts` — `hookConstraintSection`, injected into both generation prompt and `generateAcceptanceCriteria`

---

## 7. Form Pattern Scope Creep

**Symptom:** LoginForm generated with email format validation and password length checks that were not requested. Pattern 6 ("Simple validation") was injected as mandatory.

**Root cause:** The form pattern section listed 7 patterns as mandatory, including "Validation: Zod for all inputs" and "Error states: field-level errors." These were copied from `.lla-rules` which was broader than the test case.

**Fix:** Removed patterns 5 and 6 from the mandatory injection. Kept only the 5 structural patterns (state interface, event typing, consolidator, submit handler, controlled inputs). Validation is only added if the REQUIREMENT explicitly requests it.

**File:** `src/executor.ts` — `formPatternSection` (hardcoded 5-pattern fallback, removed "ALL 7 MANDATORY" language)

---

## 8. `onProgress` Step Count Mismatch

**Symptom:** UI showed "Generated 3 steps" but plan displayed only 2. Confusing to users and masked filtering activity.

**Root cause:** `onProgress` reported `steps.length` (raw parsed count before filtering) instead of `sortedSteps.length` (post-filter count).

**Fix:** Changed to `sortedSteps.length` at the point after all filters have run.

**File:** `src/planner.ts` — line after `validatePlanAgainstTemplates`

---

## 9. .lla-rules Caused Zod/Ruleset Conflicts

**Symptom:** Executor fallback prompt said `DO NOT use Zod`. `examples/.lla-rules` line 24 said `Validate all form inputs with Zod schemas`. LoginForm generation was non-deterministic depending on which rule the model weighted more.

**Decision:** Removed `.lla-rules` entirely. The feature was too free-form — any user could add rules that conflicted with hardcoded executor constraints. Rules are now in code, versioned and testable.

**See:** [ADR-001: Remove .lla-rules Architecture Rules](../adr/ADR-001-remove-lla-rules.md)

---

## 10. Non-Deterministic Criteria as a Hidden Failure Vector

**Symptom (Test #2, run 1):** `useCounter` returned `{ increment, decrement, reset }` — omitting `count`. The consumer (`Counter.tsx`) couldn't read the current value. The LLM actually detected the missing value and worked around it by calling `useCounter()` twice — two independent state atoms. The counter incremented the first instance but displayed from the second (always 0). A comment in the JSX said *"Assuming we can destructure count, even if the previous step omitted it"* — the LLM knew the contract was broken and chose a wrong workaround.

**Root cause:** `generateAcceptanceCriteria` is sampled non-deterministically. Run 1 criteria said `"Returns an object containing increment, decrement, and reset functions"` — count never mentioned. The LLM followed the spec exactly. Run 2 criteria said `"Uses React.useState to manage the count state"` — LLM understood count was the point and included it. Same prompt, different criteria, different output.

**The double-call workaround signal:** When the LLM works around a bug it introduced rather than fixing the source, it's a sign the spec it was given was incomplete. The workaround is always wrong — two `useCounter()` calls = two independent state atoms = state desync.

**Fix (two layers):**
1. `hookConstraintSection` in generation prompt: explicit `RETURN CONTRACT` rule with WRONG/RIGHT examples — fires on every hook file regardless of what criteria generate
2. Validator: scans all `const [x, setX] = useState(...)` declarations and verifies `x` appears in `return { ... }`. Fires `❌` if any state var is hidden from the consumer

**Generalizes to:** Any hook that manages state. The rule is: *every piece of state created with `useState` MUST appear in the return object.* The validator now enforces this for all hook files, not just `useCounter`.

**See:** [ADR-004: Deterministic Safety Nets for Non-Deterministic Criteria](../adr/ADR-004-deterministic-safety-nets.md)

---

## 11. Self-Referential Export from Auto-Corrector

**Symptom (v18, v21, v26):** `export const Button = Button` or an internal-alias pattern (`const ButtonInner = forwardRef(...); export const Button = ButtonInner`) generated after auto-correction. TypeScript throws "Block-scoped variable used before its declaration" or a circular reference. Appeared in three separate runs across different components — always after the corrector ran, never on first-pass generations.

**Root cause:** The corrector fixed one error (e.g. missing padding) and the LLM restructured the component body by wrapping in an inner const then re-exporting under the same name. The validator had no check for this pattern.

**Fix (three layers):**
1. Validator: regex `export\s+const\s+(\w+)\s*=\s*(\w+)\s*;` — fires `❌` when both sides are the same identifier
2. `interactiveComponentSection`: explicit ban — `NEVER assign to an internal name and re-export under the same name`
3. Auto-corrector prompt: `IMPORTANT: Never introduce an internal alias re-export`

**Pattern:** If a bug appears 3+ times across different components after auto-correction, it's a corrector prompt gap, not a one-off model quirk.

---

## 12. JSX Validator False-Pass — TypeScript Generics Matched as HTML Elements

**Symptom (Test #3A, all runs):** `Input.tsx` used `React.forwardRef<HTMLInputElement, InputProps>`. The JSX return validator passed it as valid even though the component body returned `cn(...)` — a bare string. Same class of bug as v24 (Button missing JSX body), but the old fix didn't hold because Button had no TypeScript generics in its forwardRef signature.

**Root cause:** The regex `/<[A-Za-z][\w.]*[\s/>]/` matched `<HTMLInputElement>` as if it were a JSX element. TypeScript generics are always PascalCase; JSX HTML tags are always lowercase. The check was actually a `<` check, not a JSX check.

**Fix:** Changed to `/<[a-z][a-z0-9-]*[\s/>]/` (lowercase only) `|| /return\s+null\b/`. Exploits the invariant that TypeScript types are PascalCase and JSX HTML elements are lowercase.

**File:** `src/executor.ts` — `validateCommonPatterns`, JSX return block

---

## 13. Split React Imports — Prompt Was Causing the Bug

**Symptom (Test #3A, runs 1–2):** Every LoginForm run produced two separate `from 'react'` import lines: one for `React`, one for `{ useState, FormEvent, ... }`. Appeared on every run, never merged.

**Root cause:** `reactImportsSection` showed each hook as a separate example:
```
- If using useState: `import { useState } from 'react';`
- If using form events: `import { FormEvent, FormEventHandler } from 'react';`
```
The LLM reproduced the examples verbatim. The prompt was generating the bug.

**Fix (two layers):**
1. Validator: `❌` when content has 2+ `from 'react'` import lines
2. Prompt: replaced per-hook examples with a single WRONG/RIGHT merged import example

**File:** `src/executor.ts` — `validateCommonPatterns` (validator); `reactImportsSection` (prompt)

---

## 14. Planner Scope Creep — App.tsx Post-Processing Filter

**Symptom (Test #3A, run 1):** Planner added WRITE step for `App.tsx` to "wire up the new LoginForm component" — user only asked for `LoginForm.tsx`. This pattern appeared on every first-run-from-fresh-chat across Button, Counter, and LoginForm series.

**Root cause:** Prompt constraint ("ONLY create files explicitly named in the user's request") had ~50% compliance. The planner's training data strongly associates "create a component" with "wire it up in App.tsx."

**Fix:** `filterUnrequestedEntryWrites` post-processing filter — drops WRITE steps for `App|main|layout|Root|index.tsx` unless the user request explicitly names the file. Same code pattern as `filterNoisyReadSteps`.

**Key distinction:** `index.ts` excluded intentionally (module barrel file, not a UI entry point). Only `index.tsx`/`index.jsx` are treated as entry points.

**File:** `src/planner.ts` — `filterUnrequestedEntryWrites`, called after `filterRedundantWrites`

---

## 15. Eval Methodology — Run 2 Benefits from Conversation History

**Observation:** Run 2 within a session consistently outperforms Run 1 across every test series (Button, Counter, LoginForm). This was attributed to code fixes working, but the actual mechanism is `LLMClient.conversationHistory`.

**How it works:** Every `sendMessage` and `streamMessage` call appends to `conversationHistory`. The planner, executor, acceptance criteria generator, and auto-corrector all share the same `LLMClient` instance. By run 2, the LLM has seen the full run 1 output: the plan, all generated code, all validation errors, all correction attempts. The model self-corrects based on this context.

**Implication for evals:** Run 1 from a fresh chat (window reload + "Chat history cleared") is the honest benchmark. Run 2 scores are partially explained by model self-correction via conversation context — independent of any code fix applied between runs.

**Practical effect:** A fix that improves Run 1 scores across sessions is real. A fix that only improves Run 2 scores within the same session may just be conversation history at work.

---

## Eval Rating Anchors

These benchmarks are used to assess generation quality consistently:

| Score | Meaning |
|-------|---------|
| 10/10 | Matches or exceeds reference implementation. No gaps. |
| 9/10  | Functional, minor styling/a11y omissions (e.g. missing `focus:ring-2`). |
| 7/10  | Works but over-engineered (extra steps) or missing one structural pattern. |
| 3/10  | Critical runtime bug — crash on render, or missing JSX return. |
| 0/10  | Writes wrong content to disk, or writes nothing. |

**Milestones:**
- v11: First 10/10 on Test #1 (Button)
- v20: First 10/10 on Test #2 (useCounter + Counter multi-file)
- v28: First 10/10 plan (1 step) + first-pass clean execution for Test #1
- v30: First 10/10 execution for Test #2 on run 2 after hook return contract fix

---

## 16. Fabricated Import Prefixes Bypass Incomplete Validators

**Symptom (T3R, run 1):** LLM generated `import { api } from 'src/api'`. The integration validator reported `✅` and no `❌` was emitted. `src/api.ts` does not exist.

**Root cause:** The import regex only matched two prefix styles: `@/` (alias) and `./`/`../` (relative). `src/api` begins with neither, so it was never captured. The disk check never ran.

**Fix:** Extended the regex to a third alternative: `src\/[^'"]+`. Added a resolver branch that strips the `src/` prefix (`rawPath.slice(4)`) and runs the same disk check as `@/` aliases. Regression test uses a plain `.ts` file (not `.tsx`) — per-step JSX validators don't run on `.ts` files, so the integration validator result is unambiguous.

**Rule:** A validator that covers "some import prefixes" is not a path validator — it's a filter with a bypass. After each new fabrication pattern, add the new prefix to the regex and write a regression test. The set of valid import prefixes in TypeScript is small and known; the validator should cover all of them.

**File:** `src/executor.ts` — integration validator import regex; `src/executor-integration-consolidated.test.ts` — `src/api` regression test

**See:** [F8 in LEARNINGS.md](../LEARNINGS.md#f8-fabricated-bare-import-bypassed-integration-validator)

---

## 17. READ Step Context Must Flow to Downstream WRITE Steps

**Symptom (T3R, run 1):** Plan: READ `authStore.ts` → WRITE `LoginFormRefactor.tsx`. The generated component imported from `@/store/authStore` (singular path, wrong) and called `authStore.getUser()` (fabricated method). Real export: `export default useAuthStore` (Zustand hook, state destructured).

**Root cause:** `executeRead` stored `"Read stores/authStore.ts (847 bytes)"` in `StepResult.output`. `buildGenerationPrompt` built multi-step context from `prevResult.output` — the summary contained no file content. The generation prompt for the WRITE step had no information about the store's actual exports. The LLM guessed.

**Fix (two layers):**
1. `executeRead` stores raw file content in `output`; byte-count summary routed to `onMessage` for UI display only
2. `buildGenerationPrompt` collects READ step outputs (filtered by `isSummary` guard for backward compat), injects them as an `EXISTING CODEBASE` section immediately before import rules, capped at 1500 chars per file

**Prompt injection format:**
```
EXISTING CODEBASE (files you must integrate with — match their export style exactly):
--- examples/src/stores/authStore.ts ---
<actual file content>
---
```

**Rule:** If a plan step READs a file, that content must reach the next generation prompt. A byte-count summary in `output` is not context — it's noise. The `output` field for READ steps exists to carry file content to downstream prompts; anything else in that field defeats the purpose of the READ step entirely.

**File:** `src/executor.ts` — `executeRead` (output = content), `buildGenerationPrompt` (readStepContents injection)

**See:** [F10 in LEARNINGS.md](../LEARNINGS.md#f10-read-step-content-not-propagated-to-write-step), [ADR-006](../adr/ADR-006-read-step-context-injection.md)
