# Generation Quality Learnings

**Series:** Button/useCounter/LoginForm eval runs v1–v30  
**Branch:** `feature/generation-quality-v2`  
**Status:** Active — updated as new regressions are found and fixed

This document captures concrete learnings from iterative eval runs against a local 7B model (Qwen). Each entry has a root cause, the fix applied, and the signal that told us it worked.

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
