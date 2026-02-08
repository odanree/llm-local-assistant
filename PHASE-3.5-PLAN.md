# Phase 3.5: Pattern-Based Code Refactoring

## Goal
When `/refactor` detects a pattern that should be applied (e.g., StateManagement, DataFetching), offer a button to generate refactored code and write it to disk.

## Current State
- ✅ `/refactor` detects patterns (semantic LLM analysis)
- ✅ Shows pattern with confidence & reasoning
- ❌ Doesn't generate refactored code to apply pattern
- ❌ Doesn't write refactored files to disk
- ❌ No "Apply Pattern" buttons

## Design Approach

### 1. When Pattern is Detected
After showing pattern analysis, offer button:
```
🔧 Would you like me to refactor this file to apply the [Pattern] pattern?
[Refactor to Apply Pattern] [Show Preview]
```

### 2. Generate Refactored Code
Create new helper: `generateRefactoredCodeForPattern(code, pattern, filepath)`
- Takes: original code + pattern + context
- Uses LLM to generate refactored code applying that pattern
- Returns: refactored code + explanation

**Pattern-Specific Prompts:**
- **StateManagement**: Lift state to hooks, add context provider, reduce local useState
- **DataFetching**: Extract async logic, add error handling, implement loading states
- **Forms**: Validate input, handle submission, add error boundaries
- **CRUD**: Generate create/read/update/delete with proper error handling
- **Pagination**: Split data into pages, add navigation
- **Authentication**: Add login flow, token management, protected routes

### 3. Show Preview
Display refactored code in collapsible preview:
```markdown
📋 **Preview: Refactored Code**
[Show/Hide]

```typescript
// Refactored code here
```

**Changes:**
- Item 1: Added state management with Zustand
- Item 2: Extracted async logic to custom hook
- Item 3: Added loading and error states
```

### 4. Write to Disk (With Confirmation)
After preview approval:
```
✅ Ready to write? This will replace: app/cart/page.tsx

[Write Refactored File] [Cancel]
```

If confirmed:
- Write refactored code to file
- Show success message
- Offer to generate related files (e.g., "Hook file generated at useCart.ts")

### 5. Safety Features
- ✅ Original file backed up (can restore)
- ✅ Preview before writing
- ✅ User confirmation required
- ✅ Error handling for write failures
- ✅ Git-friendly (can git diff before committing)

## Implementation Plan

### Files to Create/Modify

1. **New: `src/patternRefactoringGenerator.ts`** (400-500 lines)
   - Class: `PatternRefactoringGenerator`
   - Methods:
     - `generateRefactoredCode(code, pattern, filepath): Promise<string>`
     - `explainChanges(original, refactored): Promise<string>`
     - Pattern-specific prompt generators
   - Uses: LLMClient for generation

2. **Modify: `src/extension.ts`** (200-300 lines)
   - After pattern detection in `/refactor` handler:
     - If pattern detected and confidence > 70%
     - Show button: "Refactor to Apply Pattern"
     - Handle button click → generate refactored code
     - Show preview modal
     - Handle write confirmation

3. **Modify: `src/webviewContent.ts`** (150-200 lines)
   - Add preview modal UI
   - Add "Apply Pattern" button handler
   - Add write confirmation dialog

### Implementation Phases

**Phase 3.5.1: Code Generation (4-6 hours)**
- Create PatternRefactoringGenerator
- Pattern-specific LLM prompts
- Generate refactored code for all 8 patterns
- Test code quality

**Phase 3.5.2: UI & Preview (2-3 hours)**
- Add preview modal to webview
- Show changes explanation
- Before/after comparison

**Phase 3.5.3: Disk Writing (2-3 hours)**
- Safe file writing with backup
- Write confirmation flow
- Error handling
- Success feedback

**Phase 3.5.4: Testing & Polish (2-3 hours)**
- Comprehensive test suite
- Real-world testing on sample projects
- Bug fixes
- Documentation

**Total Effort: 10-15 hours across 2-3 sessions**

## Success Criteria
- ✅ Generate refactored code for all 8 patterns
- ✅ Preview shows differences clearly
- ✅ Safe write with backup
- ✅ 80%+ success rate on pattern application
- ✅ 0 data loss incidents
- ✅ User always in control

## Example Flow

**User runs:** `/refactor app/cart/page.tsx`

**Extension detects:** StateManagement pattern (95% confidence)

**Extension shows:**
```
📊 Refactoring Analysis: app/cart/page.tsx
...
🎯 Architectural Pattern: StateManagement (95% confidence)
> This file manages state using React's useState...

[Refactor to Apply Pattern]
```

**User clicks button:**

**Extension generates & shows:**
```
📋 Preview: Refactored Code

**Changes:**
- Moved cart state to custom useCart hook
- Replaced useState with Zustand store
- Added error boundary wrapper
- Extracted async logic to separate function

[Show Full Code] [Apply Changes] [Cancel]
```

**User clicks "Apply Changes":**

**Extension writes:**
```
✅ Refactored file written: app/cart/page.tsx
💾 Original backed up: .backups/cart/page.tsx.bak.20260207

Generated related files:
- hooks/useCart.ts (custom hook)
- stores/cartStore.ts (Zustand store)
```

## Next Steps
1. Start with PatternRefactoringGenerator
2. Implement for StateManagement pattern (most common)
3. Test on shopify-ecommerce project
4. Iterate and expand to other patterns
