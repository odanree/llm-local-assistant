# RefactorTest - Benchmark Test Suite

Systematic tests for Plan/Execution evaluation across different complexity levels.

---

## Test #1: The "Greenfield" Scaffold  (Simple)

**Goal:** Verify SCAFFOLD-MODE triggers correctly in an empty directory.

**Command:**
```bash
/plan create a stateless Button component with primary and secondary variants using Tailwind
```

**What it tests:**
- ✓ Does it detect the lack of package.json and switch to Scaffold?
- ✓ Does it generate a complete file with imports?
- ✓ Does it handle simple CSS class logic?

---

## Test #2: The Logic & Hook Extraction  (Medium)

**Goal:** Test the Babel AST Validator and the SimpleFixer.

**Command:**
```bash
/plan create a useCounter hook with increment, decrement, and reset logic, then implement it in a Counter.tsx component
```

**What it tests:**
- ✓ Multi-file parsing: Does it create 2 separate write steps or fail with a comma-separated path?
- ✓ Imports: Does Counter.tsx correctly import useCounter?
- ✓ Auto-fix: If it forgets useState, does your SimpleFixer catch it?

---

## Test #3: The "Brownfield" Refactor  (Intermediate)

**Goal:** Verify DIFF-MODE and Search/Replace precision.

**Command:**
```bash
/plan refactor the existing LoginForm.tsx to use Zustand for state instead of local useState
```

**What it tests:**
- ✓ Context Injection: Does the RAG/ContextBuilder find your Zustand store?
- ✓ Diff Schema: Does the LLM output valid {find, replace} blocks?
- ✓ Unused Imports: Does it correctly remove useState and add useStore without "lying" about usage?

---

## Test #4: The Orchestrated Flow  (Complex)

**Goal:** Test the Planner vs. Executor contract (The "Analyze" vs "Write" issue).

**Command:**
```bash
/plan create a protected route wrapper that checks a mockAuth service and redirects to /login if unauthenticated
```

**What it tests:**
- ✓ Contract Match: Does the Planner use valid actions (write, read) instead of unsupported ones like ANALYZE?
- ✓ Logic Flow: Does Step 1 (MockAuth) correctly set up the dependency for Step 2 (Wrapper)?
- ✓ Platform Blindness: If you add a "Run tests" step, does it use the correct shell for your Windows environment?

---

## Test #5: The "God Object" Decomposition  (Advanced)

**Goal:** Test the limits of Stateful Correction and Recursive Validation.

**Command:**
```bash
/plan take the 300-line App.tsx and decompose it into a Layout component, a Navigation component, and a separate Routes.ts config
```

**What it tests:**
- ✓ Heavy Lifting: Can it handle high-token generation without losing the component scaffolding?
- ✓ Pathing: Does it correctly create the src/components/layout directory structure?
- ✓ Infinite Loop Check: If Step 1 fails, does the RetryContext prevent it from making the same mistake in Step 2?