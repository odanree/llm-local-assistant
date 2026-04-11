# Generation Quality Learnings

**Series:** Button/useCounter/LoginForm eval runs v1–v25  
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
