# ADR-006: READ Step Content Injection into Multi-Step Generation Context

**Date:** 2026-04-12  
**Status:** Accepted  
**Deciders:** Danh Le  
**Branch:** `feature/generation-quality-v2`

---

## Context

LLA supports multi-step plans where a READ step precedes a WRITE step. The intended semantics: read an existing file first so the generator has context about its API before writing a dependent file. Example from the T3R benchmark:

```
Step 1: READ  examples/src/stores/authStore.ts
Step 2: WRITE examples/src/components/LoginFormRefactor.tsx  (must import from authStore)
```

Prior to this ADR, `executeRead` stored a human-readable summary in `StepResult.output`:

```typescript
return {
  output: `Read ${step.path} (${text.length} bytes)`,
  // ...
};
```

`buildGenerationPrompt` collected all prior step results and injected them as a "multi-step context" block — but the context was built from `prevResult.output`. With only a byte-count summary in `output`, the generation prompt for Step 2 contained:

```
FILES CREATED IN PRIOR STEPS:
  - examples/src/stores/authStore.ts (Read ... 847 bytes)
```

The LLM had no information about what `authStore.ts` actually exported. It generated:

```tsx
import authStore from '@/store/authStore';    // wrong path (singular)
const user = authStore.getUser();             // fabricated method
```

The real file exported `export default useAuthStore` (a Zustand hook; state is destructured, not accessed via methods). The mismatch caused both an integration validator path failure and a runtime API error.

---

## Decision

**Store actual file content in `StepResult.output` for READ steps. Inject READ step content into multi-step WRITE prompts as an `EXISTING CODEBASE` section.**

### Change 1 — `executeRead` stores content

```typescript
// Before:
return { output: `Read ${step.path} (${text.length} bytes)`, ... };

// After:
this.config.onMessage?.(`Read ${step.path} (${text.length} bytes)`, 'info'); // UI notification
return { output: text, ... };                                                  // actual content
```

The byte-count summary is preserved as a UI notification; `output` now carries the raw file content.

### Change 2 — `buildGenerationPrompt` injects READ content

Before building the generation prompt for any WRITE step, collect all READ step outputs from prior steps:

```typescript
const readStepContents: { path: string; content: string }[] = [];
for (let i = 1; i < step.stepId; i++) {
  const prevStep = this.plan.steps.find(s => s.stepId === i);
  const prevResult = completedSteps.get(i);
  if (prevStep?.action === 'read' && prevResult?.success && prevResult.output) {
    const isSummary = prevResult.output.startsWith('Read ')
      && prevResult.output.includes(' bytes)');
    if (!isSummary && prevResult.output.length > 0) {
      readStepContents.push({ path: prevStep.path, content: prevResult.output });
    }
  }
}
```

When `readStepContents` is non-empty, prepend an `EXISTING CODEBASE` section to the prompt (before import rules, capped at 1500 chars per file):

```
EXISTING CODEBASE (files you must integrate with — match their export style exactly):
--- examples/src/stores/authStore.ts ---
import { create } from 'zustand';
...
export default useAuthStore;
---
```

### Backward compatibility guard

The `isSummary` check ensures that plans executed before this change (whose `output` fields hold summary strings) do not inject the summary text as if it were file content. The guard is intentionally narrow: it matches the exact format `executeRead` used to produce.

### Prompt position

The `EXISTING CODEBASE` section is injected immediately before `importSection`. This ordering ensures that:
1. The LLM sees the actual file content before import rules that reference it
2. Import rules can reference the actual export names from the file

---

## Consequences

**Positive:**
- Generated components that depend on existing files now receive the actual API (export names, call conventions, import path style) rather than fabricated guesses
- Integration validator path failures caused by wrong import paths are reduced at the source
- READ steps serve their intended purpose in the plan architecture

**Negative:**
- `StepResult.output` now carries large strings (full file content) instead of compact summaries for READ steps — memory usage per-run increases if files are large
- The `isSummary` backward-compat guard is a code smell; it will be dead code once all result caches are regenerated

**Mitigations:**
- Content is capped at 1500 chars per file in the injected section — large files are truncated before injection
- The `isSummary` guard is intentionally narrow and low-maintenance; it can be removed in a future cleanup pass once old result caches are no longer referenced

---

## In My Own Words

> *What was the generator getting wrong before this fix, and why? What does injecting READ step content actually give the LLM that it didn't have before? (2-3 sentences in your own words)*

---

## Alternatives Considered

### Pass file content directly to planner — annotate READ steps before execution

The planner could pre-read files and annotate the step metadata. Rejected: the planner runs before file I/O; reading files during planning would require a separate FS pass and complicate the plan/execute boundary.

### Store content in a separate `fileContents` map on `StepResult`

Adding a typed field (`fileContents?: string`) would be cleaner than overloading `output`. Rejected for now: `output` is typed as "File contents (READ) or command output (RUN)" — the field already documents this dual use. The separation can be made in a future refactor if the type diverges further.

### Inject context only when integration errors occur (on-demand)

Wait for the integration validator to fire, then re-read the file and retry generation with content. Rejected: this turns a preventable error into a reactive correction loop. Prevention is cheaper than correction (ADR-003 principle).
