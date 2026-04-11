# ADR-001: Remove .lla-rules Architecture Rules Feature

**Date:** 2026-04-11  
**Status:** Accepted  
**Deciders:** Danh Le  
**Branch:** `feature/generation-quality-v2`

---

## Context

LLA supported a `.lla-rules` file — a free-form text file in the workspace root that users could populate with architecture rules (e.g. "use Zustand, not Redux"). The extension loaded this file at activation time and injected the rules as a validation pass (Check 6) and as context in generation prompts.

During generation quality eval work (v1–v25), two conflicts surfaced:

1. **Zod conflict:** `examples/.lla-rules` line 24 mandated Zod for all form validation. The executor's hardcoded fallback prompt explicitly said `DO NOT use Zod`. LoginForm generation was non-deterministic — output depended on which rule the 7B model weighted.

2. **Scope creep vector:** Free-form rules could ask for things the executor's SCOPE CONSTRAINT explicitly banned (e.g. extra variants, clamping behavior). There was no conflict detection between `.lla-rules` content and hardcoded executor rules.

A third problem: the `.lla-rules` loading path added ~80 lines of extension activation code and ~400 lines of test coverage for a feature that few users populated with meaningful rules in practice.

---

## Decision

Remove `.lla-rules` entirely:

- `loadArchitectureRules()` function deleted from `extension.ts`
- Check 6 (architecture rules validation block) deleted from `extension.ts`  
- `validateArchitectureRules()` method deleted from `executor.ts`
- `validateArchitectureRulePure` import deleted
- `examples/.lla-rules`, `.lla-rules` (root), `examples/.lla-rules copy` deleted
- All test coverage for the feature deleted (`executor-terminal.test.ts` entirely; matrix blocks from three other test files)

Architecture rules are now expressed as:
- **Hardcoded validator checks** in `validateCommonPatterns` and `validateFormComponentPatterns` — versioned, testable, deterministic
- **Generation prompt constraints** — `SCOPE CONSTRAINT`, `INTERACTIVE COMPONENT RULES`, `HOOK FILE RULES`, `formPatternSection`
- **Project profile** (`ProjectProfile` class) — detected from `package.json` and workspace scan, injected as constraints

---

## Consequences

**Positive:**
- No more rule conflicts between user-supplied `.lla-rules` and hardcoded executor constraints
- ~1,100 lines of code and tests removed
- Validation is deterministic — same input always produces same check result
- Rules are versioned with the codebase, not per-workspace files

**Negative:**
- Users lose the ability to add custom architecture rules without modifying extension code
- Projects with genuinely project-specific rules (e.g. "use our internal design system, not Tailwind") have no mechanism to express them

**Mitigations for the negative:**
- The `ProjectProfile` class provides auto-detected project conventions (Tailwind vs CSS modules, Zustand vs Redux, etc.) as injected constraints
- Custom rules can be added to the `validateCommonPatterns` method via PR — they get test coverage and conflict detection automatically
- A future `ProjectProfile.customRules` API could provide a type-safe replacement for `.lla-rules` with explicit conflict checking

---

## Alternatives Considered

### Keep `.lla-rules` but add conflict detection

Would require parsing `.lla-rules` for known keywords (Zod, Redux, cn, etc.) and cross-checking against hardcoded constraints. Complex, fragile against free-form text, and still wouldn't catch semantic conflicts.

### Move `.lla-rules` rules into `ProjectProfile`

`ProjectProfile` is typed and auto-detected. Merging free-form text into it would undermine the type safety. Rejected.

### Keep `.lla-rules` but stop injecting it into generation prompts

Validation-only mode. Would eliminate the Zod generation conflict but not the scope creep vector. Partial fix — rejected in favor of full removal.
