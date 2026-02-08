# Phase 3.5: Testing & Integration Guide

## Quick Start: Test Pattern Refactoring

### Prerequisites
- VS Code extension loaded in debug mode (F5)
- Local LLM running (Ollama: `ollama serve`)
- One of these projects open: shopify-ecommerce, ai-chatbot, adu-cost-matcher

### Test Steps

**1. Test StateManagement Pattern**
```
File: shopify-ecommerce/app/cart/page.tsx
Command: /refactor app\cart\page.tsx
Expected:
  - Detects StateManagement pattern (90%+ confidence)
  - Shows "🔧 Refactor to Apply Pattern" button
  - Click button → generates refactored code with Zustand
```

**2. Test DataFetching Pattern**
```
File: shopify-ecommerce/app/collections/page.tsx
Command: /refactor app\collections\page.tsx
Expected:
  - Detects DataFetching pattern (90%+ confidence)
  - Shows button → generates useData hook with loading/error
```

**3. Test Preview Modal**
```
At refactoring preview:
- Click "👁️ Show Full Preview"
- Should show before/after code comparison
- Should list all changes
- Should allow writing after preview
```

**4. Test File Writing & Backup**
```
At preview:
- Click "💾 Write Refactored File"
- Should create .refactor-backups/ directory
- Should backup original file
- Should write refactored code
- Should show success message
- Check: app/cart/page.tsx should be refactored
- Check: .refactor-backups/ should contain backup
```

**5. Test Error Handling**
```
Scenarios:
- Close file while refactoring is generating
- Disconnect LLM during generation
- Cancel at preview
- Expected: Graceful error messages, no data loss
```

## Test Matrix

| Pattern | File | Success Rate | Notes |
|---------|------|--------------|-------|
| StateManagement | app/cart/page.tsx | TBD | Test with Zustand generation |
| DataFetching | app/collections/page.tsx | TBD | Test with useData hook |
| Forms | (need test file) | TBD | Test with validation |
| CRUD | (need test file) | TBD | Test with operations |
| Pagination | (need test file) | TBD | Test with paging |
| Authentication | (need test file) | TBD | Test with login flow |
| Notifications | (need test file) | TBD | Test with toast system |
| SearchFilter | (need test file) | TBD | Test with search/filter |

## Known Issues & Fixes Needed

### Issue #1: Pattern Timeout on Large Files
**Problem**: Some large files cause 5-second timeout during generation
**Solution**: Implement chunking or simpler prompts for large files
**Status**: 🔄 To investigate during testing

### Issue #2: Backup Directory Creation
**Problem**: May fail if permissions restricted
**Solution**: Show user-friendly error with resolution steps
**Status**: 🔄 To test

### Issue #3: File Encoding
**Problem**: Unicode characters might not be preserved
**Solution**: Already using TextEncoder, verify with test
**Status**: ✅ Implemented

## Testing Checklist

### Basic Functionality
- [ ] Pattern detected correctly
- [ ] Button appears for >70% confidence
- [ ] Preview generates without errors
- [ ] Changes list is accurate

### UI/UX
- [ ] Status messages appear during generation
- [ ] Preview is readable and formatted well
- [ ] Buttons are clear and responsive
- [ ] Error messages are helpful

### File Operations
- [ ] Backup created successfully
- [ ] Backup has correct filename format
- [ ] Refactored code written correctly
- [ ] Original file replaced (not appended)
- [ ] Success message shows backup location

### Error Handling
- [ ] LLM timeout handled gracefully
- [ ] File write errors shown to user
- [ ] Can cancel at any stage
- [ ] No data loss on errors

### Cross-Platform
- [ ] Windows path handling (backslashes)
- [ ] Mac/Linux path handling (forward slashes)
- [ ] File encoding works on all platforms

## Success Criteria for Phase 3.5

### Code Quality
- [ ] 288/288 tests passing
- [ ] 100% TypeScript strict mode
- [ ] 0 compilation errors
- [ ] 0 console warnings

### Functionality
- [ ] Generate refactored code for all 8 patterns
- [ ] Preview before writing
- [ ] Safe file writing with backup
- [ ] Graceful error handling
- [ ] 80%+ success rate on pattern application

### User Experience
- [ ] Clear UI flow
- [ ] Helpful status messages
- [ ] Easy to undo (backup available)
- [ ] Takes <10 seconds for full flow

### Documentation
- [ ] PHASE-3.5-PLAN.md complete
- [ ] README updated with v3.5 features
- [ ] Changelog entry for v3.5 release
- [ ] Examples of refactored code

## Test Results Log

```
Date: [When testing begins]
Tester: Danh
Environment: macOS/Windows, VS Code X.X, Node X.X
LLM: qwen2.5-coder:7b (Ollama)

Pattern Tests:
- StateManagement: ✓/✗ (notes)
- DataFetching: ✓/✗ (notes)
- Forms: ✓/✗ (notes)
- CRUD: ✓/✗ (notes)
- Pagination: ✓/✗ (notes)
- Authentication: ✓/✗ (notes)
- Notifications: ✓/✗ (notes)
- SearchFilter: ✓/✗ (notes)

Issues Found:
1. [Issue description] - [Severity] - [Status]
2. [Issue description] - [Severity] - [Status]

Overall Success Rate: X%
```

## Next Steps After Testing

**If all tests pass (80%+ success):**
1. Merge to main
2. Tag v2.1.0 release
3. Publish to VS Code Marketplace
4. Update documentation
5. Announce on social media

**If issues found:**
1. Document issues with severity
2. Create bug fixes/improvements
3. Re-test
4. Iterate until success criteria met

## Performance Expectations

| Operation | Expected Time | Tolerance |
|-----------|---------------|-----------|
| Pattern detection | 2-3 seconds | <5 seconds |
| Code generation | 3-5 seconds | <10 seconds |
| File write | <1 second | <2 seconds |
| Total flow | 5-10 seconds | <15 seconds |

## Rollback Plan

If critical issues found:
1. Keep backups in .refactor-backups/ directory
2. User can restore manually: `cp .refactor-backups/file.bak original.tsx`
3. Or implement "Undo Last Refactoring" command
4. Or revert git commit if in version control
