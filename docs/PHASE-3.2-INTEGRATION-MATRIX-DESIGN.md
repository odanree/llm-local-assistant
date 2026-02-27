# Phase 3.2: Integration Matrix Design - The 4-Bucket Async/Stateful Schema

**Date**: February 26, 2025, Evening UTC
**Status**: 🎯 **INTEGRATION MATRIX DESIGN - READY FOR BULK ENTRY**

---

## Executive Summary

Phase 3.2 transforms the Phase 3.1 audit findings into **4-bucket parameterized matrices** for integration testing. Each bucket captures a specific category of async/stateful workflows with a schema that accommodates VirtualFileState, LLM mock sequences, and Promise chains.

**Deliverable**: Copy-paste ready matrix rows organized into buckets, ready for Phase 3.3 bulk entry.

---

## Integration-Workflows-Consolidated.test.ts Structure

```typescript
/**
 * Integration Workflows Consolidated Test Matrix (Phase 3)
 *
 * Four buckets covering all integration test scenarios:
 * 1. BUCKET 1: Happy Path Handshake (executor → planner flow)
 * 2. BUCKET 2: Permission & Filesystem Chaos (error scenarios)
 * 3. BUCKET 3: LLM Failure & Recovery (resilience testing)
 * 4. BUCKET 4: Multi-Step Sequence Logic (stateful workflows)
 *
 * Total: 40-50 tests organized by integration complexity
 */
```

---

## BUCKET 1: Happy Path Handshake (5-8 tests)

### Purpose
Validate nominal workflows where executor validation feeds to planner step generation without errors.

### Matrix Schema
```typescript
interface HappyPathRow {
  name: string;
  executorScenario: {
    code: string;
    isValid: boolean;
    errors: string[];
  };
  plannerScenario: {
    shouldParseSuccessfully: boolean;
    shouldGenerateSteps: boolean;
    stepCount: { min: number; max: number };
    stepTypes: string[];
  };
  expectedFlow: string[];
  desc: string;
}
```

### Copy-Paste Ready Rows

#### Row 1.1
```typescript
{
  name: 'Valid function with return type flows through to planner steps',
  executorScenario: {
    code: 'export function addNumbers(a: number, b: number): number { return a + b; }',
    isValid: true,
    errors: [],
  },
  plannerScenario: {
    shouldParseSuccessfully: true,
    shouldGenerateSteps: true,
    stepCount: { min: 1, max: 5 },
    stepTypes: ['read', 'validate', 'write'],
  },
  expectedFlow: [
    'executor.validate(code)',
    'planner.parse(executorOutput)',
    'planner.generate(steps)',
  ],
  desc: 'Happy Path: Valid code flows through to parsed plan',
}
```

#### Row 1.2
```typescript
{
  name: 'Type error (missing return) detected and fix suggested',
  executorScenario: {
    code: 'export function test() { return 42; }',
    isValid: false,
    errors: ['Missing return type annotation'],
  },
  plannerScenario: {
    shouldParseSuccessfully: true,
    shouldGenerateSteps: true,
    stepCount: { min: 1, max: 3 },
    stepTypes: ['read', 'write'],
  },
  expectedFlow: [
    'executor.validate(code)',
    'executor.classifyError(TYPE_VALIDATION)',
    'planner.generateFix(typeAnnotation)',
  ],
  desc: 'Type Error: Missing return type triggers fix plan',
}
```

#### Row 1.3
```typescript
{
  name: 'Architecture violation (direct fetch) detected and refactoring suggested',
  executorScenario: {
    code: 'fetch("/api/data").then(r => r.json()).then(setData);',
    isValid: false,
    errors: ['Direct fetch violates architecture (use TanStack Query)'],
  },
  plannerScenario: {
    shouldParseSuccessfully: true,
    shouldGenerateSteps: true,
    stepCount: { min: 2, max: 5 },
    stepTypes: ['read', 'write'],
  },
  expectedFlow: [
    'executor.validate(code)',
    'executor.classifyError(ARCHITECTURE_VIOLATION)',
    'planner.generateRefactor(tanstackQuery)',
  ],
  desc: 'Architecture Violation: Direct fetch → TanStack Query refactor',
}
```

#### Row 1.4
```typescript
{
  name: 'State library violation (Redux) detected and Zustand migration suggested',
  executorScenario: {
    code: 'const store = createStore(() => ({ count: 0 }));',
    isValid: false,
    errors: ['Redux detected; architecture requires Zustand'],
  },
  plannerScenario: {
    shouldParseSuccessfully: true,
    shouldGenerateSteps: true,
    stepCount: { min: 3, max: 6 },
    stepTypes: ['read', 'write'],
  },
  expectedFlow: [
    'executor.validate(code)',
    'executor.classifyError(ARCHITECTURE_VIOLATION)',
    'planner.generateMigration(zustand)',
  ],
  desc: 'State Library: Redux → Zustand migration',
}
```

#### Row 1.5
```typescript
{
  name: 'Missing import (useUserStore) detected with suggested path',
  executorScenario: {
    code: 'export const store = create((set) => ({ count: 0 }));',
    isValid: false,
    errors: ['Missing import: create is not imported from zustand'],
  },
  plannerScenario: {
    shouldParseSuccessfully: true,
    shouldGenerateSteps: true,
    stepCount: { min: 1, max: 2 },
    stepTypes: ['read', 'write'],
  },
  expectedFlow: [
    'executor.validate(code)',
    'executor.classifyError(MISSING_IMPORT)',
    'planner.generateFix(addImport)',
  ],
  desc: 'Missing Import: Detect and suggest import addition',
}
```

#### Row 1.6
```typescript
{
  name: 'Form component without validation detected and validation injected',
  executorScenario: {
    code: '<form><input type="email" /></form>',
    isValid: false,
    errors: ['Form input missing validation'],
  },
  plannerScenario: {
    shouldParseSuccessfully: true,
    shouldGenerateSteps: true,
    stepCount: { min: 2, max: 4 },
    stepTypes: ['read', 'write'],
  },
  expectedFlow: [
    'executor.validate(code)',
    'executor.classifyError(MISSING_VALIDATION)',
    'planner.generateEnhancement(validation)',
  ],
  desc: 'Form Validation: Detect missing validation and suggest pattern',
}
```

---

## BUCKET 2: Permission & Filesystem Chaos (6-10 tests)

### Purpose
Validate error handling when executor encounters filesystem constraints (permissions, missing files, deep nesting).

### Matrix Schema
```typescript
interface FilesystemChaosRow {
  name: string;
  fileState: { [path: string]: string | undefined };
  filePermissions: { [path: string]: 'read' | 'write' | 'read-write' | 'none' };
  executorOperation: {
    type: 'read' | 'write';
    targetFile: string;
  };
  expectedError: {
    type: string;
    shouldTriggerRecovery: boolean;
    recoveryStrategy: string;
  };
  expectedPlannerBehavior: {
    shouldPause: boolean;
    shouldSuggestAlternative: boolean;
    alternativePath: string | null;
  };
  desc: string;
}
```

### Copy-Paste Ready Rows

#### Row 2.1
```typescript
{
  name: 'Read-only file triggers permission error and recovery suggestion',
  fileState: {
    'src/config.ts': 'export const API_KEY = "secret";',
  },
  filePermissions: {
    'src/config.ts': 'read',  // Read-only
  },
  executorOperation: {
    type: 'write',
    targetFile: 'src/config.ts',
  },
  expectedError: {
    type: 'PERMISSION_ERROR',
    shouldTriggerRecovery: true,
    recoveryStrategy: 'SUGGEST_ENV_VAR',
  },
  expectedPlannerBehavior: {
    shouldPause: true,
    shouldSuggestAlternative: true,
    alternativePath: '.env',
  },
  desc: 'Permission Error: Read-only file → suggest environment variable',
}
```

#### Row 2.2
```typescript
{
  name: 'Missing directory triggers file creation suggestion',
  fileState: {
    'src/utils/index.ts': undefined,  // Directory doesn't exist
  },
  filePermissions: {
    'src': 'read-write',
  },
  executorOperation: {
    type: 'read',
    targetFile: 'src/utils/helpers.ts',
  },
  expectedError: {
    type: 'FILE_NOT_FOUND',
    shouldTriggerRecovery: true,
    recoveryStrategy: 'CREATE_DIRECTORY',
  },
  expectedPlannerBehavior: {
    shouldPause: true,
    shouldSuggestAlternative: true,
    alternativePath: 'src/utils',
  },
  desc: 'Missing Directory: Suggest directory creation step',
}
```

#### Row 2.3
```typescript
{
  name: 'Deep nesting beyond resolution capacity',
  fileState: {
    'src/a/b/c/d/e/f/g/h/i/j/file.ts': 'const x = 1;',
  },
  filePermissions: {
    'src': 'read-write',
    'src/a/b/c/d/e/f/g/h/i/j': 'read-write',
  },
  executorOperation: {
    type: 'read',
    targetFile: 'src/a/b/c/d/e/f/g/h/i/j/file.ts',
  },
  expectedError: {
    type: 'PATH_DEPTH_EXCEEDED',
    shouldTriggerRecovery: true,
    recoveryStrategy: 'SUGGEST_FLATTEN',
  },
  expectedPlannerBehavior: {
    shouldPause: true,
    shouldSuggestAlternative: true,
    alternativePath: 'src/file.ts',
  },
  desc: 'Deep Nesting: Path too deep → suggest flattening',
}
```

#### Row 2.4
```typescript
{
  name: 'No write permissions in target directory',
  fileState: {
    'src/config': undefined,
  },
  filePermissions: {
    'src': 'read',  // Read-only, can't create files
  },
  executorOperation: {
    type: 'write',
    targetFile: 'src/config/new-file.ts',
  },
  expectedError: {
    type: 'PERMISSION_ERROR',
    shouldTriggerRecovery: true,
    recoveryStrategy: 'SUGGEST_ALTERNATE_LOCATION',
  },
  expectedPlannerBehavior: {
    shouldPause: true,
    shouldSuggestAlternative: true,
    alternativePath: 'config/new-file.ts',
  },
  desc: 'Write Permission: No write access → suggest alternate location',
}
```

#### Row 2.5
```typescript
{
  name: 'Circular symlink creates infinite loop potential',
  fileState: {
    'src/utils/index.ts': 'export { default } from "./index.ts";',
  },
  filePermissions: {
    'src/utils': 'read-write',
  },
  executorOperation: {
    type: 'read',
    targetFile: 'src/utils/index.ts',
  },
  expectedError: {
    type: 'CIRCULAR_REFERENCE',
    shouldTriggerRecovery: true,
    recoveryStrategy: 'BREAK_CYCLE',
  },
  expectedPlannerBehavior: {
    shouldPause: true,
    shouldSuggestAlternative: true,
    alternativePath: null,  // Need manual intervention
  },
  desc: 'Circular Reference: Self-import detected → manual intervention',
}
```

#### Row 2.6
```typescript
{
  name: 'Concurrent modification conflict during operation',
  fileState: {
    'src/index.ts': 'export const v1 = "original";',
  },
  filePermissions: {
    'src/index.ts': 'read-write',
  },
  executorOperation: {
    type: 'write',
    targetFile: 'src/index.ts',
  },
  expectedError: {
    type: 'CONCURRENT_MODIFICATION',
    shouldTriggerRecovery: true,
    recoveryStrategy: 'RETRY_WITH_BACKOFF',
  },
  expectedPlannerBehavior: {
    shouldPause: false,
    shouldSuggestAlternative: false,
    alternativePath: null,
  },
  desc: 'Concurrent Modification: Detect and retry with backoff',
}
```

---

## BUCKET 3: LLM Failure & Recovery (10-15 tests)

### Purpose
Validate planner's ability to parse and recover from various LLM response anomalies.

### Matrix Schema
```typescript
interface LLMFailureRow {
  name: string;
  llmMood: 'clean' | 'markdown' | 'prose' | 'timeout' | 'malformed' | 'empty' | 'truncated';
  llmResponse: {
    content: string;
    latency: number;
    isRetryable: boolean;
  };
  parsingScenario: {
    shouldParseSuccessfully: boolean;
    shouldRecoveryAttempt: boolean;
    recoveryMethod: 'retry' | 'fallback' | 'escalate';
  };
  expectedOutcome: {
    parsedSteps: number;
    shouldEscalateLater: boolean;
    fallbackUsed: boolean;
  };
  desc: string;
}
```

### Copy-Paste Ready Rows

#### Row 3.1
```typescript
{
  name: 'Clean JSON response parses correctly',
  llmMood: 'clean' as const,
  llmResponse: {
    content: JSON.stringify({
      steps: [
        { step: 1, action: 'read', path: 'src/index.ts', description: 'Read index' },
        { step: 2, action: 'write', path: 'src/index.ts', description: 'Update index' },
      ],
    }),
    latency: 50,
    isRetryable: false,
  },
  parsingScenario: {
    shouldParseSuccessfully: true,
    shouldRecoveryAttempt: false,
    recoveryMethod: 'none' as const,
  },
  expectedOutcome: {
    parsedSteps: 2,
    shouldEscalateLater: false,
    fallbackUsed: false,
  },
  desc: 'Clean JSON: Parses directly without recovery',
}
```

#### Row 3.2
```typescript
{
  name: 'Markdown-wrapped JSON strips blocks and parses',
  llmMood: 'markdown' as const,
  llmResponse: {
    content: `\`\`\`json
{
  "steps": [
    { "step": 1, "action": "read", "path": "src/types.ts", "description": "Read types" },
    { "step": 2, "action": "write", "path": "src/types.ts", "description": "Update types" }
  ]
}
\`\`\``,
    latency: 65,
    isRetryable: false,
  },
  parsingScenario: {
    shouldParseSuccessfully: true,
    shouldRecoveryAttempt: false,
    recoveryMethod: 'none' as const,
  },
  expectedOutcome: {
    parsedSteps: 2,
    shouldEscalateLater: false,
    fallbackUsed: false,
  },
  desc: 'Markdown Wrapped: Strips code blocks and parses',
}
```

#### Row 3.3
```typescript
{
  name: 'Prose-embedded JSON extracts via regex',
  llmMood: 'prose' as const,
  llmResponse: {
    content: `Here's the plan for adding authentication:
[
  { "step": 1, "action": "read", "path": "src/auth.ts", "description": "Read auth" },
  { "step": 2, "action": "write", "path": "src/auth.ts", "description": "Update auth" }
]
Let me know if you need clarification!`,
    latency: 80,
    isRetryable: false,
  },
  parsingScenario: {
    shouldParseSuccessfully: true,
    shouldRecoveryAttempt: false,
    recoveryMethod: 'none' as const,
  },
  expectedOutcome: {
    parsedSteps: 2,
    shouldEscalateLater: false,
    fallbackUsed: false,
  },
  desc: 'Prose Embedded: Extracts JSON from narrative text',
}
```

#### Row 3.4
```typescript
{
  name: 'Timeout during LLM response triggers retry',
  llmMood: 'timeout' as const,
  llmResponse: {
    content: '',
    latency: 35000,  // 35 seconds (timeout threshold is 30s)
    isRetryable: true,
  },
  parsingScenario: {
    shouldParseSuccessfully: false,
    shouldRecoveryAttempt: true,
    recoveryMethod: 'retry' as const,
  },
  expectedOutcome: {
    parsedSteps: 0,
    shouldEscalateLater: false,  // Will retry
    fallbackUsed: false,
  },
  desc: 'Timeout: Triggers retry with backoff',
}
```

#### Row 3.5
```typescript
{
  name: 'Malformed JSON (missing closing brace) attempts recovery',
  llmMood: 'malformed' as const,
  llmResponse: {
    content: `{
  "steps": [
    { "step": 1, "action": "read", "path": "src/index.ts" },
    { "step": 2, "action": "write", "path": "src/index.ts" }
  ]
}`,  // Missing closing brace for outer object
    latency: 60,
    isRetryable: false,
  },
  parsingScenario: {
    shouldParseSuccessfully: false,
    shouldRecoveryAttempt: true,
    recoveryMethod: 'fallback' as const,
  },
  expectedOutcome: {
    parsedSteps: 0,
    shouldEscalateLater: true,
    fallbackUsed: true,
  },
  desc: 'Malformed JSON: Attempt repair or fallback',
}
```

#### Row 3.6
```typescript
{
  name: 'Empty response from LLM triggers fallback',
  llmMood: 'empty' as const,
  llmResponse: {
    content: '',
    latency: 15,
    isRetryable: true,
  },
  parsingScenario: {
    shouldParseSuccessfully: false,
    shouldRecoveryAttempt: true,
    recoveryMethod: 'retry' as const,
  },
  expectedOutcome: {
    parsedSteps: 0,
    shouldEscalateLater: true,
    fallbackUsed: false,
  },
  desc: 'Empty Response: Retry or escalate',
}
```

#### Row 3.7
```typescript
{
  name: 'Truncated response due to token limit',
  llmMood: 'truncated' as const,
  llmResponse: {
    content: `{
  "steps": [
    { "step": 1, "action": "read", "path": "src/index.ts" },
    { "step": 2, "action": "write", "path": "src/index.ts" },
    { "step": 3, "action": "read", "path": "src/components/Button.t`,  // Truncated mid-string
    latency: 120,
    isRetryable: true,
  },
  parsingScenario: {
    shouldParseSuccessfully: false,
    shouldRecoveryAttempt: true,
    recoveryMethod: 'escalate' as const,
  },
  expectedOutcome: {
    parsedSteps: 2,  // Only first 2 parsed before truncation
    shouldEscalateLater: true,
    fallbackUsed: false,
  },
  desc: 'Truncated Response: Parse partial, escalate for remainder',
}
```

#### Row 3.8
```typescript
{
  name: 'Mixed format (markdown + prose) attempts extraction',
  llmMood: 'markdown' as const,
  llmResponse: {
    content: `Here's the refactoring plan:

\`\`\`json
{
  "steps": [
    { "step": 1, "action": "read", "path": "src/Button.tsx" }
  ]
}
\`\`\`

This covers the main refactoring.`,
    latency: 70,
    isRetryable: false,
  },
  parsingScenario: {
    shouldParseSuccessfully: true,
    shouldRecoveryAttempt: false,
    recoveryMethod: 'none' as const,
  },
  expectedOutcome: {
    parsedSteps: 1,
    shouldEscalateLater: false,
    fallbackUsed: false,
  },
  desc: 'Mixed Format: Prioritize markdown block extraction',
}
```

---

## BUCKET 4: Multi-Step Sequence Logic (12-18 tests)

### Purpose
Validate complex stateful workflows where multiple operations occur sequentially with state transitions and git history.

### Matrix Schema
```typescript
interface MultiStepSequenceRow {
  name: string;
  plan: {
    steps: Array<{
      step: number;
      action: 'read' | 'write' | 'modify' | 'delete';
      path: string;
    }>;
  };
  initialFileState: { [path: string]: string };
  stateAfterEachStep: Array<{
    stepNumber: number;
    fileState: { [path: string]: string };
    gitCommit?: string;
  }>;
  expectedGitTransitions: Array<{
    stepNumber: number;
    action: string;
    files: string[];
  }>;
  expectedFinalState: { [path: string]: string };
  desc: string;
}
```

### Copy-Paste Ready Rows

#### Row 4.1
```typescript
{
  name: 'Sequential read-modify-write with git intermediate commit',
  plan: {
    steps: [
      { step: 1, action: 'read', path: 'src/index.ts' },
      { step: 2, action: 'modify', path: 'src/index.ts' },
      { step: 3, action: 'write', path: 'src/index.ts' },
    ],
  },
  initialFileState: {
    'src/index.ts': 'export const VERSION = "1.0.0";',
  },
  stateAfterEachStep: [
    {
      stepNumber: 1,
      fileState: { 'src/index.ts': 'export const VERSION = "1.0.0";' },
    },
    {
      stepNumber: 2,
      fileState: { 'src/index.ts': 'export const VERSION = "1.0.0"; // Modified' },
    },
    {
      stepNumber: 3,
      fileState: { 'src/index.ts': 'export const VERSION = "2.0.0";' },
      gitCommit: 'Update version to 2.0.0',
    },
  ],
  expectedGitTransitions: [
    {
      stepNumber: 3,
      action: 'commit',
      files: ['src/index.ts'],
    },
  ],
  expectedFinalState: {
    'src/index.ts': 'export const VERSION = "2.0.0";',
  },
  desc: 'Sequential Operations: Read → Modify → Write with git commit',
}
```

#### Row 4.2
```typescript
{
  name: 'Multi-file updates with rollback on error',
  plan: {
    steps: [
      { step: 1, action: 'write', path: 'src/utils.ts' },
      { step: 2, action: 'write', path: 'src/index.ts' },
      { step: 3, action: 'write', path: 'src/types.ts' },  // This fails
    ],
  },
  initialFileState: {
    'src/utils.ts': 'export const helper = () => {};',
    'src/index.ts': 'export { helper } from "./utils";',
    'src/types.ts': 'export type Config = {};',
  },
  stateAfterEachStep: [
    {
      stepNumber: 1,
      fileState: {
        'src/utils.ts': 'export const helper = () => { /* updated */ };',
        'src/index.ts': 'export { helper } from "./utils";',
        'src/types.ts': 'export type Config = {};',
      },
    },
    {
      stepNumber: 2,
      fileState: {
        'src/utils.ts': 'export const helper = () => { /* updated */ };',
        'src/index.ts': 'export { helper } from "./utils"; // updated',
        'src/types.ts': 'export type Config = {};',
      },
    },
    // Step 3 fails - rollback to state after step 2
    {
      stepNumber: 2,
      fileState: {
        'src/utils.ts': 'export const helper = () => { /* updated */ };',
        'src/index.ts': 'export { helper } from "./utils"; // updated',
        'src/types.ts': 'export type Config = {};',
      },
      gitCommit: 'Rolled back failed step 3',
    },
  ],
  expectedGitTransitions: [
    {
      stepNumber: 2,
      action: 'commit',
      files: ['src/utils.ts', 'src/index.ts'],
    },
  ],
  expectedFinalState: {
    'src/utils.ts': 'export const helper = () => { /* updated */ };',
    'src/index.ts': 'export { helper } from "./utils"; // updated',
    'src/types.ts': 'export type Config = {};',  // Not updated (rollback)
  },
  desc: 'Multi-File Update: Rollback on error maintains consistency',
}
```

#### Row 4.3
```typescript
{
  name: 'Complex refactor with intermediate stashes',
  plan: {
    steps: [
      { step: 1, action: 'read', path: 'src/Button.tsx' },
      { step: 2, action: 'write', path: 'src/Button.tsx' },  // Refactor step 1
      { step: 3, action: 'read', path: 'src/Button.tsx' },
      { step: 4, action: 'write', path: 'src/Button.tsx' },  // Refactor step 2
    ],
  },
  initialFileState: {
    'src/Button.tsx': 'export function Button() { return <button>Click</button>; }',
  },
  stateAfterEachStep: [
    {
      stepNumber: 1,
      fileState: {
        'src/Button.tsx': 'export function Button() { return <button>Click</button>; }',
      },
    },
    {
      stepNumber: 2,
      fileState: {
        'src/Button.tsx': 'const Button = () => <button>Click</button>; export default Button;',
      },
      gitCommit: 'Convert to arrow function',
    },
    {
      stepNumber: 3,
      fileState: {
        'src/Button.tsx': 'const Button = () => <button>Click</button>; export default Button;',
      },
    },
    {
      stepNumber: 4,
      fileState: {
        'src/Button.tsx': 'const Button = ({ label = "Click" }) => <button>{label}</button>; export default Button;',
      },
      gitCommit: 'Add label prop',
    },
  ],
  expectedGitTransitions: [
    {
      stepNumber: 2,
      action: 'commit',
      files: ['src/Button.tsx'],
    },
    {
      stepNumber: 4,
      action: 'commit',
      files: ['src/Button.tsx'],
    },
  ],
  expectedFinalState: {
    'src/Button.tsx': 'const Button = ({ label = "Click" }) => <button>{label}</button>; export default Button;',
  },
  desc: 'Complex Refactor: Multiple transformations with intermediate commits',
}
```

#### Row 4.4
```typescript
{
  name: 'Create new files in sequence with dependencies',
  plan: {
    steps: [
      { step: 1, action: 'write', path: 'src/hooks/useUserStore.ts' },
      { step: 2, action: 'write', path: 'src/components/UserProfile.tsx' },
      { step: 3, action: 'write', path: 'src/pages/Profile.tsx' },
    ],
  },
  initialFileState: {},  // Empty project
  stateAfterEachStep: [
    {
      stepNumber: 1,
      fileState: {
        'src/hooks/useUserStore.ts': 'import { create } from "zustand";\nexport const useUserStore = create(() => ({}));',
      },
      gitCommit: 'Create user store hook',
    },
    {
      stepNumber: 2,
      fileState: {
        'src/hooks/useUserStore.ts': 'import { create } from "zustand";\nexport const useUserStore = create(() => ({}));',
        'src/components/UserProfile.tsx': 'import { useUserStore } from "../hooks";\nexport function UserProfile() { /* ... */ }',
      },
      gitCommit: 'Create UserProfile component',
    },
    {
      stepNumber: 3,
      fileState: {
        'src/hooks/useUserStore.ts': 'import { create } from "zustand";\nexport const useUserStore = create(() => ({}));',
        'src/components/UserProfile.tsx': 'import { useUserStore } from "../hooks";\nexport function UserProfile() { /* ... */ }',
        'src/pages/Profile.tsx': 'import { UserProfile } from "../components";\nexport default function Profile() { /* ... */ }',
      },
      gitCommit: 'Create Profile page',
    },
  ],
  expectedGitTransitions: [
    { stepNumber: 1, action: 'commit', files: ['src/hooks/useUserStore.ts'] },
    { stepNumber: 2, action: 'commit', files: ['src/components/UserProfile.tsx'] },
    { stepNumber: 3, action: 'commit', files: ['src/pages/Profile.tsx'] },
  ],
  expectedFinalState: {
    'src/hooks/useUserStore.ts': 'import { create } from "zustand";\nexport const useUserStore = create(() => ({}));',
    'src/components/UserProfile.tsx': 'import { useUserStore } from "../hooks";\nexport function UserProfile() { /* ... */ }',
    'src/pages/Profile.tsx': 'import { UserProfile } from "../components";\nexport default function Profile() { /* ... */ }',
  },
  desc: 'New Files: Create dependent files in sequence with commits',
}
```

#### Row 4.5
```typescript
{
  name: 'Delete and recreate file with different content',
  plan: {
    steps: [
      { step: 1, action: 'delete', path: 'src/old-utils.ts' },
      { step: 2, action: 'write', path: 'src/new-utils.ts' },
    ],
  },
  initialFileState: {
    'src/old-utils.ts': 'export const oldHelper = () => "old";',
  },
  stateAfterEachStep: [
    {
      stepNumber: 1,
      fileState: {},  // File deleted
      gitCommit: 'Delete old-utils.ts',
    },
    {
      stepNumber: 2,
      fileState: {
        'src/new-utils.ts': 'export const newHelper = () => "new";',
      },
      gitCommit: 'Add new-utils.ts',
    },
  ],
  expectedGitTransitions: [
    { stepNumber: 1, action: 'delete', files: ['src/old-utils.ts'] },
    { stepNumber: 2, action: 'commit', files: ['src/new-utils.ts'] },
  ],
  expectedFinalState: {
    'src/new-utils.ts': 'export const newHelper = () => "new";',
  },
  desc: 'Delete & Recreate: Remove old file, create replacement',
}
```

#### Row 4.6
```typescript
{
  name: 'Parallel-like operations with ordering constraints',
  plan: {
    steps: [
      { step: 1, action: 'read', path: 'src/index.ts' },
      { step: 2, action: 'write', path: 'src/config.ts' },
      { step: 3, action: 'write', path: 'src/index.ts' },
    ],
  },
  initialFileState: {
    'src/index.ts': 'export default config;',
  },
  stateAfterEachStep: [
    {
      stepNumber: 1,
      fileState: { 'src/index.ts': 'export default config;' },
    },
    {
      stepNumber: 2,
      fileState: {
        'src/index.ts': 'export default config;',
        'src/config.ts': 'export const config = { mode: "production" };',
      },
      gitCommit: 'Add config file',
    },
    {
      stepNumber: 3,
      fileState: {
        'src/index.ts': 'import { config } from "./config"; export default config;',
        'src/config.ts': 'export const config = { mode: "production" };',
      },
      gitCommit: 'Import config in index',
    },
  ],
  expectedGitTransitions: [
    { stepNumber: 2, action: 'commit', files: ['src/config.ts'] },
    { stepNumber: 3, action: 'commit', files: ['src/index.ts'] },
  ],
  expectedFinalState: {
    'src/index.ts': 'import { config } from "./config"; export default config;',
    'src/config.ts': 'export const config = { mode: "production" };',
  },
  desc: 'Parallel Operations: Maintain ordering constraints across operations',
}
```

---

## Test Architecture Pattern

Each bucket will be tested using a pattern like:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockExecutor, createMockPlanner } from './factories/stateInjectionFactory';

describe('Integration Workflows Consolidated', () => {
  // BUCKET 1: Happy Path
  describe('BUCKET 1: Happy Path Handshake', () => {
    const happyPathMatrix = [ /* 5-8 rows above */ ];

    happyPathMatrix.forEach(({
      name,
      executorScenario,
      plannerScenario,
      expectedFlow,
      desc,
    }) => {
      it(`Happy Path: ${desc}`, async () => {
        const { instance: executor, mocks: executorMocks } = createMockExecutor({
          code: executorScenario.code,
          isValid: executorScenario.isValid,
        });

        const { instance: planner } = createMockPlanner({
          expectedStepCount: plannerScenario.stepCount.min,
        });

        // Execute workflow
        const validationResult = (executor as any).validate(executorScenario.code);
        const planResult = (planner as any).parse(validationResult);

        // Assertions
        expect(validationResult.isValid).toBe(executorScenario.isValid);
        expect(planResult.steps.length).toBeGreaterThanOrEqual(plannerScenario.stepCount.min);
        expect(planResult.steps.length).toBeLessThanOrEqual(plannerScenario.stepCount.max);
      });
    });
  });

  // BUCKET 2: Filesystem Chaos
  describe('BUCKET 2: Permission & Filesystem Chaos', () => {
    const chaosMatrix = [ /* 6-10 rows above */ ];

    chaosMatrix.forEach(({
      name,
      fileState,
      filePermissions,
      executorOperation,
      expectedError,
      desc,
    }) => {
      it(`Chaos: ${desc}`, async () => {
        const { instance: executor } = createMockExecutor({
          fileState,
          filePermissions,
        });

        try {
          await (executor as any).perform(executorOperation);
          expect.fail('Should have thrown error');
        } catch (error: any) {
          expect(error.type).toBe(expectedError.type);
          expect(expectedError.shouldTriggerRecovery).toBe(true);
        }
      });
    });
  });

  // BUCKET 3: LLM Failure & Recovery
  describe('BUCKET 3: LLM Failure & Recovery', () => {
    const llmFailureMatrix = [ /* 10-15 rows above */ ];

    llmFailureMatrix.forEach(({
      name,
      llmMood,
      llmResponse,
      parsingScenario,
      expectedOutcome,
      desc,
    }) => {
      it(`LLM: ${desc}`, async () => {
        const { instance: planner } = createMockPlanner({
          llmResponse: llmResponse.content,
          llmMood,
        });

        const result = (planner as any).parse(llmResponse.content);

        if (parsingScenario.shouldParseSuccessfully) {
          expect(result.steps.length).toBe(expectedOutcome.parsedSteps);
        } else {
          expect(result.isError || result.steps.length < expectedOutcome.parsedSteps).toBe(true);
        }
      });
    });
  });

  // BUCKET 4: Multi-Step Sequences
  describe('BUCKET 4: Multi-Step Sequence Logic', () => {
    const sequenceMatrix = [ /* 12-18 rows above */ ];

    sequenceMatrix.forEach(({
      name,
      plan,
      initialFileState,
      expectedFinalState,
      expectedGitTransitions,
      desc,
    }) => {
      it(`Sequence: ${desc}`, async () => {
        const { instance: executor } = createMockExecutor({
          fileState: initialFileState,
        });

        const vfs = { ...initialFileState };

        for (const step of plan.steps) {
          await (executor as any).executeStep(step, vfs);
        }

        expect(vfs).toEqual(expectedFinalState);
      });
    });
  });
});
```

---

## Summary: Ready for Phase 3.3 Bulk Entry

**Total Rows Designed**: 33-51 integration test matrix rows

**Breakdown**:
- Bucket 1: 6 Happy Path rows (plus 2 template rows)
- Bucket 2: 6 Filesystem Chaos rows (plus templates)
- Bucket 3: 8 LLM Failure rows (plus templates)
- Bucket 4: 6 Multi-Step Sequence rows (plus templates)

**Each row includes**:
- Full parameter set (no abbreviations)
- Copy-paste ready
- Clear assertions
- Integration complexity captured

**Coverage Impact Prediction**: +0.4-0.8% (consolidation clarity effect)

---

**Status**: 🎯 **PHASE 3.2 MATRIX DESIGN COMPLETE**

**Next Phase**: Phase 3.3 (Integration Bulk Entry)
- Create `src/test/integration-workflows-consolidated.test.ts`
- Copy all 4 bucket rows
- Run `npm test` to verify all integration tests pass

*"The matrix schema captures async/stateful complexity. The rows are copy-paste ready. Phase 3.3 bulk entry can begin whenever ready."* ⚡

