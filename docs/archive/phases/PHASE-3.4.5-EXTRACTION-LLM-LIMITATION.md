# Phase 3.4.5 - Known Limitations & Next Steps

## Current Status (Feb 6, 20:55 PST)

### ✅ FIXED
1. **Blocker #1: Semantic Analysis** - `/refactor` now uses 5-layer semantic analyzer
2. **Blocker #2: LLMClient Routing** - All analyzers receive llmClient, debug logs show model
3. **File Path Bug** - Services now write to `src/services/` (not `hooks/`)
4. **Dialog UX** - Extraction buttons in chat UI (not VS Code popup)
5. **Extraction Suggestions** - `/refactor` shows copy-paste commands + buttons

### ⏳ KNOWN LIMITATION - Phase 3.4.5.1 Task
**`/extract-service` doesn't use LLM for intelligent extraction**

Current behavior:
- `/refactor` analyzes with LLM → provides insights ✅
- `/extract-service` extracts mechanically (no LLM) ❌
- Same extraction regardless of configured model

Desired behavior:
- `/extract-service` should receive analysis from `/refactor`
- Use LLM to intelligently extract (guided by insights)
- Generate better service code based on model choice

Example:
```
/refactor detects: "tight coupling - API in component, extract useApi"
/extract-service should use LLM to:
- Understand what useApi should do
- Generate clean, testable service code
- Follow the model's coding style (Mistral vs Qwen vs Claude)
```

## Why This Matters
- Users should see different extraction results for different models
- Mistral might create more opinionated code
- Qwen might be more conservative
- Claude might add better error handling
- Currently: all produce identical mechanical extraction

## Implementation Notes
1. Pass semantic analysis to `/extract-service` command
2. Add `llmClient.sendMessage()` call to generate service code
3. Use analysis insights in LLM prompt (tight coupling, unused states, etc.)
4. Maintain deterministic structure but intelligent content

## Files to Update
- `src/extension.ts` - `/extract-service` handler needs to call LLM
- `src/serviceExtractor.ts` - Add LLM-based generation option
- Possibly new method: `generateServiceCodeWithLLM()`

## Estimated Time
2-3 hours (Phase 3.4.5.1 sub-task)

## Current Test Evidence
Danh tested with Mistral and Qwen:
- Both produced identical extraction output
- Confirms no LLM routing in extraction
- Different models should produce different results
