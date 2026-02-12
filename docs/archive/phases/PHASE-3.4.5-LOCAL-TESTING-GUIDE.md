# Phase 3.4.5 Local Testing Guide - v2.0 Edge Cases & Gaps

**Goal:** Test all 5 new commands in real scenarios, find gaps, report bugs.

**Time Estimate:** 2-3 hours  
**Setup Time:** 15 minutes  
**Test Scenarios:** 25 total (5 per command)

---

## Setup (15 minutes)

### Prerequisites
```bash
# Make sure you're on the Phase 3.4.5 branch
git checkout feat/phase3.3-context-awareness
git pull origin feat/phase3.3-context-awareness

# Install dependencies
npm install

# Compile
npm run compile

# Start the dev extension
npm run dev
# (or open VS Code with this folder and press F5 to launch debug session)
```

### Create Test Project
```bash
# Create a test workspace
mkdir -p ~/test-llm-local-assistant
cd ~/test-llm-local-assistant

# Initialize as React project structure
mkdir -p src/{schemas,services,hooks,components}

# Create sample files for testing
```

### Sample Test Files

**`src/schemas/userSchema.ts`**
```typescript
// Schema layer - perfect structure
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  age: z.number().int().positive(),
  createdAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

export const validateUser = (data: any) => {
  return UserSchema.parse(data);
};
```

**`src/hooks/useUser.ts`** (FAT HOOK - needs refactoring)
```typescript
// Hook layer - needs extraction
import { useState, useEffect, useCallback } from 'react';

export const useUser = (userId: string) => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
  const [sortBy, setSortBy] = useState('name');

  // API Call 1
  const fetchUser = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/users/${userId}`);
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      
      // Validation inline (should be in service)
      if (!data.id || !data.email) {
        throw new Error('Invalid user data');
      }
      
      setUser(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // API Call 2
  const updateUser = useCallback(async (updates: any) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const updated = await response.json();
      setUser(updated);
      setError(null);
      return updated;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // API Call 3
  const deleteUser = useCallback(async () => {
    if (!window.confirm('Are you sure?')) return;
    
    try {
      await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      setUser(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  }, [userId]);

  // Filtering logic (should be in service)
  const filterAndSort = useCallback(() => {
    if (!user) return [];
    
    const filtered = [user].filter(u => u.status === 'active');
    
    if (sortBy === 'name') {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'email') {
      filtered.sort((a, b) => a.email.localeCompare(b.email));
    } else if (sortBy === 'date') {
      filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
    
    return filtered;
  }, [user, sortBy]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    setFilteredUsers(filterAndSort());
  }, [filterAndSort]);

  return {
    user,
    users: filteredUsers,
    loading,
    error,
    fetchUser,
    updateUser,
    deleteUser,
    setSortBy,
    sortBy,
  };
};
```

**`src/services/userService.ts`** (Good structure - use as reference)
```typescript
// Service layer - good patterns
import { UserSchema, User } from '../schemas/userSchema';

export class UserService {
  async getUser(id: string): Promise<User> {
    const response = await fetch(`/api/users/${id}`);
    if (!response.ok) throw new Error(`Failed to fetch user: ${response.statusText}`);
    
    const data = await response.json();
    return UserSchema.parse(data);
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const response = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    
    if (!response.ok) throw new Error(`Failed to update user: ${response.statusText}`);
    
    const data = await response.json();
    return UserSchema.parse(data);
  }

  async deleteUser(id: string): Promise<void> {
    const response = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(`Failed to delete user: ${response.statusText}`);
  }
}

export const userService = new UserService();
```

**`src/components/UserProfile.tsx`** (Bad patterns - uses any types)
```typescript
// Component layer - anti-patterns
import React from 'react';
import { useUser } from '../hooks/useUser';

export const UserProfile: React.FC<any> = ({ userId }) => {
  const { user, loading, error, updateUser } = useUser(userId);

  // Inline styles (anti-pattern)
  const styles = {
    container: { padding: '20px', backgroundColor: '#f5f5f5' },
    header: { fontSize: '24px', fontWeight: 'bold', color: '#333' },
    error: { color: 'red', padding: '10px', backgroundColor: '#ffe6e6' },
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div style={styles.error}>{error}</div>;
  if (!user) return <div>No user found</div>;

  // Magic strings (anti-pattern)
  return (
    <div style={styles.container}>
      <h1 style={styles.header}>{user.name}</h1>
      <p>Email: {user.email}</p>
      <p>Age: {user.age}</p>
      
      <button
        onClick={() => updateUser({ name: 'Updated Name' })}
        style={{ padding: '10px 20px', backgroundColor: 'blue', color: 'white' }}
      >
        Update
      </button>
    </div>
  );
};
```

---

## Test Scenarios

### Command 1: `/refactor <file>`

#### Test 1.1: Refactor Fat Hook
**File:** `src/hooks/useUser.ts`

**What to do:**
```
Type in chat: /refactor src/hooks/useUser.ts
```

**Expected Behavior:**
- ✅ Status message shows "🔍 Analyzing src/hooks/useUser.ts..."
- ✅ File is read correctly
- ✅ Analysis completes
- ✅ Shows: Complexity (HIGH), Confidence (70-85%), Proposed Changes
- ✅ Lists extract API, extract validation, simplify filtering
- ✅ Shows "Risks" section

**Edge Cases to Test:**
1. **File doesn't exist:** `/refactor src/hooks/nonexistent.ts`
   - Expected: Error message "File not found"
   - Bug if: App crashes or hangs
   
2. **Invalid path:** `/refactor ../../etc/passwd`
   - Expected: File not found or permission error
   - Bug if: Reads files outside workspace
   
3. **Empty file:** Create `src/hooks/empty.ts` (blank)
   - Expected: Shows analysis (empty, low complexity)
   - Bug if: Crashes on empty content
   
4. **Large file:** `src/hooks/useUser.ts` (2000+ lines)
   - Expected: Completes in <5 seconds
   - Bug if: Times out or hangs
   
5. **Non-TypeScript:** `/refactor src/styles.css`
   - Expected: Graceful handling
   - Bug if: Crashes or shows incorrect analysis

**Questions to Answer:**
- [ ] Does it correctly detect it as a "fat hook"?
- [ ] Are all 3 API calls identified?
- [ ] Are complexity estimates reasonable?
- [ ] Is confidence score justified?

---

#### Test 1.2: Refactor Perfect Service
**File:** `src/services/userService.ts`

**What to do:**
```
Type: /refactor src/services/userService.ts
```

**Expected Behavior:**
- ✅ Shows LOW complexity
- ✅ High confidence (90%+)
- ✅ Few or no suggested changes
- ✅ Notes: "Well-structured service layer"

**Edge Cases:**
- Single-file service (1 exported function)
- Service with validation
- Service with error handling

---

#### Test 1.3: Refactor Component with Anti-Patterns
**File:** `src/components/UserProfile.tsx`

**What to do:**
```
Type: /refactor src/components/UserProfile.tsx
```

**Expected Behavior:**
- ✅ Detects: inline styles, magic strings, `any` types
- ✅ Suggests: Extract styles to CSS module, use constants
- ✅ Complexity: MEDIUM
- ✅ Includes anti-pattern warnings

---

#### Test 1.4: Refactor with Special Characters
**Create file:** `src/hooks/use-User-Profile.ts`

**What to do:**
```
Type: /refactor src/hooks/use-User-Profile.ts
```

**Expected Behavior:**
- ✅ Path handling works with hyphens
- ✅ No parsing errors

---

#### Test 1.5: Refactor with Very Long Path
**Create file:** `src/deeply/nested/folder/structure/hooks/useVeryLongNamedHook.ts`

**What to do:**
```
Type: /refactor src/deeply/nested/folder/structure/hooks/useVeryLongNamedHook.ts
```

**Expected Behavior:**
- ✅ Path is handled correctly
- ✅ File is found and analyzed

---

### Command 2: `/extract-service <hook> <name>`

#### Test 2.1: Extract Service from Fat Hook
**What to do:**
```
Type: /extract-service src/hooks/useUser.ts UserService
```

**Expected Behavior:**
- ✅ Status: "🔄 Extracting service from src/hooks/useUser.ts..."
- ✅ Analysis runs
- ✅ Shows dialog: "What would you like to do?"
  - Execute Refactoring
  - Preview Only
  - Cancel
- ✅ Select "Preview Only"
- ✅ Shows preview with:
  - New Service File: UserService.ts
  - Lines: X
  - Functions: Y
  - Tests: Z

**Then run again and select "Execute Refactoring":**
- ✅ Shows: "✅ Service Extraction Successful"
- ✅ Lists: New Service File, Updated Hook, Generated Tests
- ✅ Impact assessment

**Edge Cases:**
1. **Service already exists:** Extract to existing file
   - Expected: Warning or prompt
   - Bug if: Silently overwrites

2. **Hook has no extractable logic:** Empty hook
   - Expected: Shows low confidence
   - Bug if: Crashes

3. **Cancel operation:**
   - Expected: Extraction stops, nothing changes
   - Bug if: Partial changes made

---

#### Test 2.2: Extract with Special Characters in Name
**What to do:**
```
Type: /extract-service src/hooks/useUser.ts User-API-Service
```

**Expected Behavior:**
- ✅ Service name is validated
- ✅ Path is normalized

---

#### Test 2.3: Extract from Schema (should be low priority)
**What to do:**
```
Type: /extract-service src/schemas/userSchema.ts UserSchemaHelper
```

**Expected Behavior:**
- ✅ Shows low confidence
- ✅ Suggests: "Schema files typically don't need extraction"

---

#### Test 2.4: Extract Missing Service Name
**What to do:**
```
Type: /extract-service src/hooks/useUser.ts
```

**Expected Behavior:**
- ✅ Error: "Missing service name"
- Bug if: Crashes or hangs

---

#### Test 2.5: Extract with Invalid File
**What to do:**
```
Type: /extract-service /etc/passwd MyService
```

**Expected Behavior:**
- ✅ Error: "File not found or outside workspace"
- Bug if: Attempts to read system files

---

### Command 3: `/design-system <feature>`

#### Test 3.1: Design User Profile System
**What to do:**
```
Type: /design-system User Profile System
```

**Expected Behavior:**
- ✅ Status: "🎨 Designing system for User Profile System..."
- ✅ Shows design plan with multiple steps
- ✅ Lists available patterns
- ✅ Message: "Use **/approve** to generate all files"
- ✅ Internal plan is stored for /approve

**Then execute:**
```
Type: /approve
```

**Expected Behavior:**
- ✅ Multi-file generation starts
- ✅ Creates:
  - userSchema.ts (Zod schema)
  - userService.ts (API + mutations)
  - useUser.ts (React hook)
  - UserProfile.tsx (Component)
- ✅ All files created successfully
- ✅ Files compile without errors

**Edge Cases:**
1. **Very complex feature description:** Add details, nested concepts
   ```
   /design-system User Profile with authentication, notifications, real-time updates, and role-based access control
   ```
   - Expected: Still generates coherent plan
   - Bug if: Breaks or generates invalid code

2. **Very simple feature:**
   ```
   /design-system Counter
   ```
   - Expected: Minimal but valid plan
   - Bug if: Crashes on simple input

3. **Special characters in feature name:**
   ```
   /design-system User Profile (v2.0)
   ```
   - Expected: Handles gracefully
   - Bug if: Parse errors

4. **Empty feature name:**
   ```
   /design-system 
   ```
   - Expected: Error or prompt for name
   - Bug if: Crashes

5. **Very long feature name (100+ chars):**
   - Expected: Handles gracefully
   - Bug if: Truncation without warning

---

#### Test 3.2: Design with Existing Files
**What to do:**
```
# Set up existing project first
/plan Create user management system
/approve

# Then try to design similar system
/design-system User Management Features
```

**Expected Behavior:**
- ✅ Detects existing files
- ✅ Offers options: Create new or update existing
- Bug if: Overwrites without warning

---

#### Test 3.3: Design Multiple Times
**What to do:**
```
/design-system Blog Post
# Wait for completion

/design-system Blog Comment
# Execute immediately after
```

**Expected Behavior:**
- ✅ Both plans execute independently
- ✅ No interference or conflicts
- Bug if: One cancels the other

---

#### Test 3.4: Cancel During Approval
**What to do:**
```
/design-system Payment Checkout
# Wait for plan

/reject
```

**Expected Behavior:**
- ✅ Plan is discarded
- ✅ No files are created
- Bug if: Files are partially created

---

#### Test 3.5: Timeout Handling
**What to do:**
```
# Create a very complex feature
/design-system Real-time collaborative document editing with version control, conflict resolution, and audit logging
```

**Expected Behavior:**
- ✅ Completes in <30 seconds
- ✅ Shows partial plan if timeout occurs
- Bug if: Hangs indefinitely

---

### Command 4: `/rate-architecture`

#### Test 4.1: Rate Good Project
**What to do:**
```
# Make sure userSchema.ts and userService.ts exist
/rate-architecture
```

**Expected Behavior:**
- ✅ Status: "📊 Scanning codebase..."
- ✅ Returns score: 7-10/10
- ✅ Message: "✅ Excellent architecture!" (if score >= 8)
- ✅ Files Analyzed: Shows correct count

**Edge Cases:**
1. **Empty project (no files):**
   ```
   mkdir -p empty-project
   cd empty-project
   # Open in VS Code
   /rate-architecture
   ```
   - Expected: Score: 0/10 or "No files to analyze"
   - Bug if: Crashes

2. **Only schema files:**
   - Expected: Low score (incomplete architecture)
   - Bug if: Scores as excellent

3. **Only components (no layers):**
   - Expected: Medium score (missing architecture)
   - Bug if: Can't detect missing layers

---

#### Test 4.2: Rate After Refactoring
**What to do:**
```
/refactor src/hooks/useUser.ts
# Wait for analysis

/rate-architecture
```

**Expected Behavior:**
- ✅ Score improves after refactoring suggestions
- ✅ Reflects better architecture

---

#### Test 4.3: Rate Large Project
**What to do:**
```
# Create many files
for i in {1..50}; do touch src/hooks/use$i.ts; done

/rate-architecture
```

**Expected Behavior:**
- ✅ Completes in <5 seconds even with 50+ files
- ✅ Accurate score
- Bug if: Performance degradation or timeout

---

#### Test 4.4: Rate After New Files
**What to do:**
```
# Get initial rating
/rate-architecture

# Create new well-structured files
touch src/services/newService.ts

# Rate again
/rate-architecture
```

**Expected Behavior:**
- ✅ Score should be slightly better
- ✅ CodebaseIndex is updated
- Bug if: Score doesn't change

---

#### Test 4.5: Rate Mixed Quality Project
**What to do:**
```
# Create mix of good and bad files
# Keep userSchema.ts and userService.ts (good)
# Keep UserProfile.tsx (bad - anti-patterns)

/rate-architecture
```

**Expected Behavior:**
- ✅ Score reflects mixed quality (6-7/10)
- ✅ Message: "⚠️ Good structure, room for improvement"
- Bug if: Ignores bad files

---

### Command 5: `/suggest-patterns`

#### Test 5.1: Suggest Patterns for Project
**What to do:**
```
/suggest-patterns
```

**Expected Behavior:**
- ✅ Status: "🔍 Analyzing patterns..."
- ✅ Shows: Available Patterns (8 types)
- ✅ Shows: Recommendations (up to 5)
- ✅ Message: "Use **/refactor <file>** to apply improvements"

**Edge Cases:**
1. **Project following all patterns:**
   - Expected: "All files follow good patterns!"
   - Bug if: Shows false recommendations

2. **Project with no patterns:**
   - Expected: Lists all 50+ files as recommendations
   - But shows only first 5
   - Bug if: Shows all 50+ (UX issue)

---

#### Test 5.2: Patterns in Different Languages
**What to do:**
```
# Create files in different types
touch src/utils.js
touch src/styles.css
touch src/index.html

/suggest-patterns
```

**Expected Behavior:**
- ✅ Handles non-TypeScript files gracefully
- ✅ Focuses on TypeScript/React files
- Bug if: Crashes on non-TS files

---

#### Test 5.3: Suggest After Design-System
**What to do:**
```
/design-system User Authentication
/approve

# Wait for files to be created

/suggest-patterns
```

**Expected Behavior:**
- ✅ Recognizes new files follow patterns
- ✅ Few or no recommendations
- Bug if: Recommends files that just followed patterns

---

#### Test 5.4: Suggest with Empty Project
**What to do:**
```
mkdir empty-test
cd empty-test
# Open in VS Code

/suggest-patterns
```

**Expected Behavior:**
- ✅ Shows available patterns
- ✅ "All files follow good patterns!" (no files to suggest)
- Bug if: Crashes on empty project

---

#### Test 5.5: Suggest with Very Specific Files
**What to do:**
```
# Create very specific files
touch src/hooks/useApi.ts
touch src/services/api.ts
touch src/services/cache.ts

/suggest-patterns
```

**Expected Behavior:**
- ✅ Recognizes API pattern
- ✅ Suggests consolidation if needed
- Bug if: Misses obvious patterns

---

## Cross-Command Workflows

### Workflow 1: Complete Refactoring Journey
```
1. /context show structure
   Expected: Project structure visible

2. /rate-architecture
   Expected: Initial score (e.g., 5/10)

3. /refactor src/hooks/useUser.ts
   Expected: Issues identified

4. /extract-service src/hooks/useUser.ts UserService
   Select: Execute Refactoring
   Expected: Refactoring completes

5. /rate-architecture
   Expected: Score improves (e.g., 7/10)

6. /suggest-patterns
   Expected: Fewer recommendations
```

**Success Criteria:**
- ✅ Score improves
- ✅ Pattern recommendations decrease
- ✅ No errors throughout

---

### Workflow 2: Design + Approve + Refactor
```
1. /design-system Blog System
   Expected: Plan shown

2. /approve
   Expected: All files created

3. /rate-architecture
   Expected: Good score (7-10/10)

4. /suggest-patterns
   Expected: "All files follow good patterns!"
```

**Success Criteria:**
- ✅ Complete workflow works
- ✅ Quality is high from start
- ✅ Patterns recognized immediately

---

### Workflow 3: Mixed Good and Bad Code
```
1. Create userSchema.ts (good)
2. Create UserProfile.tsx (bad - anti-patterns)
3. Create useUser.ts (fat hook)

4. /rate-architecture
   Expected: Medium score (5-6/10)

5. /refactor src/components/UserProfile.tsx
   Expected: Inline styles, magic strings detected

6. /refactor src/hooks/useUser.ts
   Expected: Extract suggestions

7. /suggest-patterns
   Expected: Multiple recommendations
```

**Success Criteria:**
- ✅ Correctly identifies issues
- ✅ Prioritizes by severity
- ✅ Actionable suggestions

---

## Performance Benchmarks

### Expected Performance

| Operation | Time | Acceptable Range |
|-----------|------|------------------|
| /refactor (single file) | <2s | <5s |
| /extract-service preview | <2s | <5s |
| /design-system | <5s | <15s |
| /rate-architecture (10 files) | <2s | <5s |
| /rate-architecture (100 files) | <10s | <30s |
| /suggest-patterns | <3s | <10s |

**Test:**
```bash
# Time each command
time /refactor src/hooks/useUser.ts
time /design-system User Profile
time /rate-architecture
```

---

## Bug Report Template

If you find bugs, use this template:

```markdown
### Bug: [Brief Title]

**Command:** /command-name

**Steps to Reproduce:**
1. ...
2. ...
3. ...

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happened]

**Screenshots/Logs:**
[Paste error messages]

**Environment:**
- VS Code version: [version]
- Extension loaded: [yes/no]
- Project size: [files]
- OS: [macOS/Linux/Windows]

**Severity:** [Critical/High/Medium/Low]
```

---

## Testing Checklist

### Command Completeness
- [ ] /refactor works on all file types
- [ ] /extract-service preview and execute both work
- [ ] /design-system generates all 4 layers
- [ ] /rate-architecture scans entire project
- [ ] /suggest-patterns shows relevant suggestions

### Error Handling
- [ ] File not found → graceful error
- [ ] Invalid paths → rejected safely
- [ ] Empty files → handled correctly
- [ ] Timeouts → show progress, no hang
- [ ] Missing parameters → clear errors

### Performance
- [ ] Single file: <5s
- [ ] 10 files: <10s
- [ ] 100 files: <30s
- [ ] No memory leaks
- [ ] No UI freezes

### Integration
- [ ] Commands work independently
- [ ] Commands work in sequence
- [ ] CodebaseIndex updates properly
- [ ] Help text is accurate
- [ ] Error messages are clear

### Edge Cases
- [ ] Very long file paths
- [ ] Special characters in names
- [ ] Files with unusual encoding
- [ ] Symlinks
- [ ] Read-only files
- [ ] Very large files (10MB+)

---

## Final Sign-Off

When you've completed testing, answer:

1. **Overall Quality:** 1-10 (1=broken, 10=perfect)
2. **Critical Bugs Found:** [List any]
3. **Gaps Identified:** [What's missing]
4. **Performance Issues:** [Any?]
5. **Recommendation:** Merge to main? Y/N

---

## Quick Reference

### Copy-Paste Commands

```
# Test 1.1
/refactor src/hooks/useUser.ts

# Test 2.1
/extract-service src/hooks/useUser.ts UserService

# Test 3.1
/design-system User Profile System
/approve

# Test 4.1
/rate-architecture

# Test 5.1
/suggest-patterns

# Full workflow
/context show structure
/rate-architecture
/refactor src/hooks/useUser.ts
/extract-service src/hooks/useUser.ts UserService
/rate-architecture
/suggest-patterns
```

---

**Total Test Cases:** 25  
**Estimated Time:** 2-3 hours  
**Priority:** Find gaps before v2.0 release  
**Report Issues:** Document in bug template above  

Good luck! 🚀
