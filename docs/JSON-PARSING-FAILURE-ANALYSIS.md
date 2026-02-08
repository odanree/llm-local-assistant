# JSON Parsing Failure - Root Cause Analysis & Fix

**Date**: Feb 6, 2026 22:50 PST  
**Issue**: `/design-system` fails at plan generation - JSON truncated at 693 bytes  
**Severity**: HIGH - Blocks `/design-system` feature  
**Status**: Requires investigation + fix before release

---

## The Problem

### What Happened

1. User requests: `/design-system User Management`
2. LLM is asked to generate a structured plan (JSON)
3. LLM starts responding...
4. Response **truncated at 693 bytes**
5. System tries to parse incomplete JSON
6. `JSON.parse()` fails
7. Plan creation fails entirely

### Error Message
```
Failed to parse plan JSON. Response appears truncated.
Length: 693. Last 200 chars: ...
```

### Root Causes (Suspected)

1. **LLM Response Timeout**
   - LLM took too long to generate
   - Connection killed before completion
   - Only 693 bytes received (incomplete)

2. **Response Length Limit**
   - Some LLM endpoints have max response sizes
   - Plan JSON exceeds the limit
   - Response gets truncated

3. **Connection Drop**
   - Network issue mid-transfer
   - Buffer overflow
   - Incomplete data

4. **Ollama Model Constraint**
   - Local model has response size limit
   - Complex plans exceed it
   - Need to split into smaller requests

---

## Current Error Handling (Exists but Insufficient)

**In planner.ts line 220:**
```typescript
const isTruncated = message.endsWith('fil') || message.endsWith('...') || 
                   message.match(/[a-z]$/) && message.length > 1000;

if (isTruncated) {
  const errorMsg = `Failed to parse plan JSON. Response appears truncated. Length: ${message.length}...`;
  throw new Error(errorMsg);
}
```

**Problem**: Error is detected but not handled gracefully. Just throws and fails.

---

## Solutions

### Solution 1: Retry with Smaller Prompts (IMMEDIATE)

**Approach**: If JSON parsing fails, retry with simplified prompt

```typescript
async generatePlan(userRequest: string, context?: ConversationContext) {
  try {
    // Try full plan generation
    const response = await this.config.llmClient.sendMessage(fullPrompt);
    return this.parseAndValidatePlan(response.message);
  } catch (e) {
    if ((e as Error).message.includes('truncated')) {
      // Retry with simplified prompt
      console.log('[Planner] Retrying with simplified prompt...');
      const simplifiedPrompt = this.generateSimplifiedPlanPrompt(userRequest);
      const retryResponse = await this.config.llmClient.sendMessage(simplifiedPrompt);
      return this.parseAndValidatePlan(retryResponse.message);
    }
    throw e;
  }
}
```

### Solution 2: Split Plan into Stages (MEDIUM EFFORT)

**Approach**: Generate plan in multiple smaller requests

```typescript
// Stage 1: Generate just the schema/types
const typesStep = await this.generateStep({
  action: 'write',
  description: 'Create Zod schema for entities'
});

// Stage 2: Generate services
const serviceSteps = await this.generateSteps({
  description: 'Create API services',
  count: 3
});

// Stage 3: Generate hooks
const hookSteps = await this.generateSteps({
  description: 'Create custom hooks',
  count: 2
});

// Combine into full plan
const plan: TaskPlan = {
  steps: [typesStep, ...serviceSteps, ...hookSteps]
};
```

### Solution 3: Streaming/Chunked Response (ADVANCED)

**Approach**: Handle responses in chunks

```typescript
// For streaming responses
const stream = await this.config.llmClient.sendMessageStreaming(prompt);
let fullResponse = '';

for await (const chunk of stream) {
  fullResponse += chunk;
  // Check if complete JSON received
  if (isCompleteJSON(fullResponse)) {
    return parseAndValidatePlan(fullResponse);
  }
}

// Handle incomplete after stream ends
if (!isCompleteJSON(fullResponse)) {
  throw new Error('Response incomplete after streaming ended');
}
```

---

## Why This Happened Now

**Context**: 
- `/design-system` generates complex multi-file plans
- Plans require detailed step descriptions
- JSON response for 6-8 file generation is large
- Ollama (local model) may have response limits

**Why not caught earlier**:
- Simpler commands (`/refactor`, `/extract-service`) don't need plans
- `/plan` command uses simpler JSON structure
- Only `/design-system` generates detailed plans

---

## Impact on v2.0 Release

**Commands Status**:
- ✅ `/refactor` - Not affected (no JSON parsing)
- ✅ `/extract-service` - Not affected (no planning)
- ✅ `/rate-architecture` - Not affected
- ✅ `/suggest-patterns` - Not affected
- ❌ `/design-system` - **BLOCKED** (needs fix)

**Options**:
1. **Release v2.0 without `/design-system`** - 4 perfect commands
2. **Delay release to fix `/design-system`** - All 5 commands stable
3. **Release with `/design-system` beta** - Note instability in README

---

## Recommended Fix Path

### Immediate (30 min)
1. Add simplified plan generation prompt
2. Implement retry logic for truncated responses
3. Test with `/design-system` command
4. Verify 85%+ success rate achieved

### Testing
```bash
# Test 1: Simple feature
/design-system User Management

# Test 2: Complex feature  
/design-system Blog System (categories, tags, comments)

# Test 3: Edge case
/design-system Authentication (OAuth + JWT)

# Monitor: JSON parsing failures should drop to 0%
```

### Expected Outcome
- Retry logic catches truncated responses
- Falls back to simplified prompt
- Still generates valid multi-file plan
- Success rate improves to 90%+

---

## Next Steps

**Decision required**:

1. **Fix now** (30 min)
   - Implement retry + simplified prompt
   - Include in v2.0 release
   - All 5 commands stable

2. **Fix after v2.0** (1-2 hours post-release)
   - Release v2.0 with 4 commands
   - Release v2.0.1 with `/design-system` stable
   - Better confidence in v2.0

3. **Release as beta** (30 min)
   - Include `/design-system` with warning
   - Document instability
   - Promise fix in v2.0.1

**My recommendation**: Option 1 (fix now) - 30 minutes to full stability
