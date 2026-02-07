# Fix: Align /suggest-patterns and /refactor Output

## Problem

`/suggest-patterns` recommends files need a structured pattern, but when running `/refactor` on those same files, no issues are detected.

**Example:**
```
/suggest-patterns
  → src\components\ChatWidget.tsx (component) — Could use a structured pattern

/refactor src\components\ChatWidget.tsx
  → Overall Complexity: LOW
  → No major semantic issues detected
```

This creates confusion: if `/suggest-patterns` flags it, `/refactor` should find actionable issues.

## Root Cause Analysis

- **`/suggest-patterns`**: Uses `architecturePatterns.detectPattern()` to check if file follows known patterns
  - Flags files that don't match predefined patterns (CRUD, Auth, Forms, etc.)
  - Pattern-based check: "Does this follow an expected structure?"
  
- **`/refactor`**: Uses `featureAnalyzer.analyzeHookSemantically()` for code quality
  - Checks for: complexity, API calls in components, unused states, anti-patterns
  - Semantic check: "Is there bad code or design smell?"

**The disconnect:** A file can be well-written code but not follow a specific pattern, or vice versa.

## Solutions to Consider

1. **Align detection criteria**: Make both use the same analysis
   - Pro: Consistent messaging
   - Con: May reduce the value of pattern suggestions

2. **Add pattern-based refactoring**: When `/suggest-patterns` flags something, `/refactor` should address it
   - Pro: Both commands remain useful for different purposes
   - Con: More complex refactoring logic

3. **Separate the signals**: Keep them independent but clarify messaging
   - `/suggest-patterns`: "Could follow pattern X for better maintainability"
   - `/refactor`: "Found these code quality issues"
   - Pro: Clear semantics
   - Con: Users might ignore one or the other

## Recommendation

**Option 2**: Add pattern-based refactoring guidance
- When `/refactor` analyzes a file, also check if it could use a pattern
- Provide refactoring suggestions tailored to the detected pattern
- Example: "ChatWidget doesn't follow the Forms pattern. Consider: extracting validation logic, using react-hook-form, etc."

## Next Steps

- [ ] Investigate why pattern detection flags files but semantic analysis doesn't
- [ ] Consider adding pattern-aware suggestions to `/refactor`
- [ ] Update tests to ensure both commands flag the same issues
- [ ] Document the distinction between pattern and semantic analysis
