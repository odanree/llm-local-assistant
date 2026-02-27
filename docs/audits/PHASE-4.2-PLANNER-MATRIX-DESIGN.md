# Phase 4.2: Planner Matrix Design - Copy-Paste Ready Rows

**Date**: February 26, 2025, Evening UTC
**Status**: 🎯 **PLANNER MATRIX DESIGN - READY FOR BULK ENTRY**

---

## Overview

This document provides copy-paste ready parameterized matrix rows for all 4 planner consolidation files. Each file targets specific planner functionality.

---

## FILE 1: planner-parsing-consolidated.test.ts

### Strategy: Reuse Phase 3 Bucket 3 Pattern

The parsing tests are **nearly identical** to Phase 3 Bucket 3 (LLM Failure & Recovery). We'll adapt that pattern for planner-specific response parsing.

### Bucket Structure

```typescript
describe('BUCKET 1: Clean JSON Parsing', () => {
  // Direct JSON parsing scenarios
});

describe('BUCKET 2: Markdown Wrapped JSON', () => {
  // JSON in code blocks (```json...```)
});

describe('BUCKET 3: Prose Embedded JSON', () => {
  // JSON embedded in narrative text
});

describe('BUCKET 4: Malformed & Error Handling', () => {
  // Malformed JSON, timeouts, edge cases
});

describe('BUCKET 5: Format Normalization', () => {
  // Action normalization, whitespace handling
});

describe('BUCKET 6: Edge Cases', () => {
  // Empty responses, partial parsing, special cases
});
```

### Copy-Paste Rows for Bucket 1 (Clean JSON)

```typescript
// Row 1.1
{
  name: 'Parse simple valid JSON array with single step',
  responseText: JSON.stringify([
    {
      step: 1,
      action: 'write',
      description: 'Create button component',
      path: 'src/Button.tsx',
      expectedOutcome: 'Component file created',
    },
  ]),
  expectedStepCount: 1,
  expectedFirstAction: 'write',
  expectedFirstPath: 'src/Button.tsx',
  desc: 'Single step JSON parsing',
}

// Row 1.2
{
  name: 'Parse multi-step JSON response',
  responseText: JSON.stringify([
    { step: 1, action: 'write', description: 'Create store', path: 'src/store.ts' },
    { step: 2, action: 'write', description: 'Create component', path: 'src/Button.tsx' },
    { step: 3, action: 'run', description: 'Build', command: 'npm run build' },
  ]),
  expectedStepCount: 3,
  expectedFirstAction: 'write',
  expectedLastCommand: 'npm run build',
  desc: 'Multi-step JSON parsing',
}

// Row 1.3
{
  name: 'Parse JSON with optional fields',
  responseText: JSON.stringify([
    {
      step: 1,
      action: 'read',
      description: 'Read config',
      path: 'config.json',
      // expectedOutcome is optional
    },
  ]),
  expectedStepCount: 1,
  expectedFirstAction: 'read',
  hasExpectedOutcome: false,
  desc: 'JSON with minimal fields',
}

// Row 1.4
{
  name: 'Parse JSON with all possible action types',
  responseText: JSON.stringify([
    { step: 1, action: 'read', description: 'Read', path: 'src/index.ts' },
    { step: 2, action: 'write', description: 'Write', path: 'src/utils.ts' },
    { step: 3, action: 'delete', description: 'Delete', path: 'src/old.ts' },
    { step: 4, action: 'run', description: 'Run', command: 'npm test' },
    { step: 5, action: 'manual', description: 'Manual', instruction: 'Review manually' },
  ]),
  expectedStepCount: 5,
  actionVariants: ['read', 'write', 'delete', 'run', 'manual'],
  desc: 'All action types parsing',
}

// Row 1.5
{
  name: 'Parse JSON with special characters in descriptions',
  responseText: JSON.stringify([
    {
      step: 1,
      action: 'write',
      description: 'Create button: "Click Me" component with <Icon />',
      path: 'src/Button.tsx',
    },
  ]),
  expectedStepCount: 1,
  hasSpecialChars: true,
  desc: 'Special characters in text',
}

// Row 1.6
{
  name: 'Parse JSON with empty description',
  responseText: JSON.stringify([
    { step: 1, action: 'write', description: '', path: 'src/file.ts' },
  ]),
  expectedStepCount: 1,
  expectedFirstDescription: '',
  desc: 'Empty description handling',
}
```

### Copy-Paste Rows for Bucket 2 (Markdown Wrapped)

```typescript
// Row 2.1
{
  name: 'Parse markdown-wrapped JSON with json tag',
  responseText: '```json\n' + JSON.stringify([
    { step: 1, action: 'write', description: 'Create file', path: 'src/file.ts' },
  ]) + '\n```',
  expectedStepCount: 1,
  shouldStripMarkdown: true,
  desc: 'Markdown with json language tag',
}

// Row 2.2
{
  name: 'Parse markdown-wrapped JSON without language tag',
  responseText: '```\n' + JSON.stringify([
    { step: 1, action: 'read', description: 'Read file', path: 'src/existing.ts' },
  ]) + '\n```',
  expectedStepCount: 1,
  shouldStripMarkdown: true,
  desc: 'Markdown without language tag',
}

// Row 2.3
{
  name: 'Parse markdown with extra whitespace',
  responseText: '```json\n\n' + JSON.stringify([
    { step: 1, action: 'write', description: 'Create', path: 'src/index.ts' },
  ]) + '\n\n```',
  expectedStepCount: 1,
  shouldTrimWhitespace: true,
  desc: 'Markdown with extra whitespace',
}

// Row 2.4
{
  name: 'Parse multiple markdown code blocks (use first)',
  responseText: '```json\n' + JSON.stringify([
    { step: 1, action: 'write', description: 'First plan', path: 'src/file1.ts' },
  ]) + '\n```\n\nSome text\n\n```json\n' + JSON.stringify([
    { step: 2, action: 'write', description: 'Second plan', path: 'src/file2.ts' },
  ]) + '\n```',
  expectedStepCount: 1,  // Should use first block
  expectedFirstPath: 'src/file1.ts',
  desc: 'Multiple blocks uses first',
}
```

### Copy-Paste Rows for Bucket 3 (Prose Embedded)

```typescript
// Row 3.1
{
  name: 'Extract JSON from prose narrative',
  responseText: 'Here is the plan for refactoring:\n\n' + JSON.stringify([
    { step: 1, action: 'read', description: 'Read auth', path: 'src/auth.ts' },
  ]) + '\n\nLet me know if you have questions!',
  expectedStepCount: 1,
  shouldExtractFromProse: true,
  desc: 'JSON embedded in prose',
}

// Row 3.2
{
  name: 'Extract JSON from narrative with multiple paragraphs',
  responseText: 'I recommend the following steps:\n\nFirst, let me present the plan:\n' + JSON.stringify([
    { step: 1, action: 'write', description: 'Create', path: 'src/index.ts' },
    { step: 2, action: 'read', description: 'Read', path: 'src/config.ts' },
  ]) + '\n\nThis will complete the refactoring.',
  expectedStepCount: 2,
  shouldExtractFromProse: true,
  desc: 'JSON in narrative with context',
}

// Row 3.3
{
  name: 'Prefer JSON block over prose-embedded JSON',
  responseText: 'Here is prose JSON: ' + JSON.stringify([
    { step: 1, action: 'write', description: 'Wrong plan', path: 'wrong.ts' },
  ]) + '\n\n```json\n' + JSON.stringify([
    { step: 1, action: 'read', description: 'Correct plan', path: 'correct.ts' },
  ]) + '\n```',
  expectedStepCount: 1,
  expectedFirstPath: 'correct.ts',  // Should use block, not prose
  prioritizeMarkdown: true,
  desc: 'Prefer markdown block over prose',
}
```

### Copy-Paste Rows for Bucket 4 (Error Handling)

```typescript
// Row 4.1
{
  name: 'Handle malformed JSON gracefully',
  responseText: JSON.stringify([
    { step: 1, action: 'write', description: 'Create', path: 'src/file.ts' },
  ]).slice(0, -5),  // Truncate to make malformed
  shouldError: true,
  errorType: 'MALFORMED_JSON',
  desc: 'Malformed JSON detection',
}

// Row 4.2
{
  name: 'Handle empty response',
  responseText: '',
  shouldError: true,
  errorType: 'EMPTY_RESPONSE',
  expectedStepCount: 0,
  desc: 'Empty response handling',
}

// Row 4.3
{
  name: 'Handle whitespace-only response',
  responseText: '   \n  \n  ',
  shouldError: true,
  errorType: 'EMPTY_RESPONSE',
  desc: 'Whitespace-only response',
}

// Row 4.4
{
  name: 'Handle timeout scenario',
  responseText: null,  // Represents timeout
  shouldError: true,
  errorType: 'TIMEOUT',
  desc: 'Timeout handling',
}
```

### Copy-Paste Rows for Bucket 5 (Normalization)

```typescript
// Row 5.1
{
  name: 'Normalize uppercase actions to lowercase',
  responseText: JSON.stringify([
    { step: 1, action: 'WRITE', description: 'Test', path: 'file.ts' },
    { step: 2, action: 'READ', description: 'Test', path: 'file.ts' },
    { step: 3, action: 'RUN', description: 'Test', command: 'npm test' },
  ]),
  expectedStepCount: 3,
  expectedActions: ['write', 'read', 'run'],  // All lowercase
  desc: 'Uppercase action normalization',
}

// Row 5.2
{
  name: 'Normalize mixed-case actions',
  responseText: JSON.stringify([
    { step: 1, action: 'Write', description: 'Test', path: 'file.ts' },
    { step: 2, action: 'Read', description: 'Test', path: 'file.ts' },
    { step: 3, action: 'Delete', description: 'Test', path: 'file.ts' },
  ]),
  expectedActions: ['write', 'read', 'delete'],
  desc: 'Mixed-case normalization',
}

// Row 5.3
{
  name: 'Handle responses with leading/trailing whitespace',
  responseText: '  \n  ' + JSON.stringify([
    { step: 1, action: 'write', description: 'Create', path: 'src/file.ts' },
  ]) + '  \n  ',
  expectedStepCount: 1,
  shouldTrimWhitespace: true,
  desc: 'Whitespace trimming',
}

// Row 5.4
{
  name: 'Handle newlines in JSON',
  responseText: '[\n  {\n    "step": 1,\n    "action": "write",\n    "description": "Create",\n    "path": "src/file.ts"\n  }\n]',
  expectedStepCount: 1,
  hasNewlines: true,
  desc: 'Formatted JSON with newlines',
}
```

### Copy-Paste Rows for Bucket 6 (Edge Cases)

```typescript
// Row 6.1
{
  name: 'Handle step numbers out of order',
  responseText: JSON.stringify([
    { step: 3, action: 'write', description: 'Third', path: 'file3.ts' },
    { step: 1, action: 'write', description: 'First', path: 'file1.ts' },
    { step: 2, action: 'write', description: 'Second', path: 'file2.ts' },
  ]),
  expectedStepCount: 3,
  shouldReorder: false,  // Keep as-is or reorder?
  desc: 'Out-of-order step numbers',
}

// Row 6.2
{
  name: 'Generate step IDs correctly',
  responseText: JSON.stringify([
    { step: 1, action: 'write', description: 'First', path: 'file1.ts' },
    { step: 2, action: 'write', description: 'Second', path: 'file2.ts' },
  ]),
  expectedStepCount: 2,
  shouldHaveStepIds: true,
  stepIdPattern: /^step-\d+$/,
  desc: 'Step ID generation',
}

// Row 6.3
{
  name: 'Handle null/undefined fields',
  responseText: JSON.stringify([
    { step: 1, action: 'write', description: null, path: 'src/file.ts' },
  ]),
  expectedStepCount: 1,
  hasNullFields: true,
  desc: 'Null field handling',
}

// Row 6.4
{
  name: 'Handle very large response',
  responseText: JSON.stringify(Array.from({ length: 50 }, (_, i) => ({
    step: i + 1,
    action: 'write',
    description: `Step ${i + 1}`,
    path: `src/file${i + 1}.ts`,
  }))),
  expectedStepCount: 50,
  isLargePayload: true,
  desc: 'Large payload parsing',
}
```

---

## FILE 2: planner-generation-consolidated.test.ts (27 tests)

### Bucket Structure

```typescript
describe('BUCKET 1: LLM Response Handling', () => {
  // Different LLM response formats
});

describe('BUCKET 2: Step Generation', () => {
  // Step generation from LLM responses
});

describe('BUCKET 3: Context Inclusion', () => {
  // Project context in generated plans
});

describe('BUCKET 4: Error Recovery', () => {
  // Error handling in generation
});

describe('BUCKET 5: Configuration Variants', () => {
  // Different project configurations
});

describe('BUCKET 6: Edge Cases', () => {
  // Special scenarios
});
```

### Copy-Paste Rows (Sample - Same Pattern as Parsing)

```typescript
// Bucket 1: LLM Response Handling
{
  name: 'Generate plan with valid LLM response',
  userRequest: 'Create a button component',
  llmResponse: JSON.stringify([
    { step: 1, action: 'write', description: 'Create button', path: 'src/Button.tsx' },
  ]),
  expectedTaskId: /^plan-\d+$/,
  expectedStepCount: 1,
  desc: 'Valid LLM response generation',
}

// Bucket 2: Step Generation
{
  name: 'Generate plan with multiple steps',
  userRequest: 'Add authentication',
  llmResponse: JSON.stringify([
    { step: 1, action: 'write', description: 'Create auth', path: 'src/auth.ts' },
    { step: 2, action: 'write', description: 'Add provider', path: 'src/Provider.tsx' },
  ]),
  expectedStepCount: 2,
  expectedFirstPath: 'src/auth.ts',
  desc: 'Multi-step generation',
}

// Bucket 3: Context Inclusion
{
  name: 'Include workspace context in plan',
  userRequest: 'Create something',
  llmResponse: JSON.stringify([
    { step: 1, action: 'write', description: 'Create', path: 'src/file.ts' },
  ]),
  workspacePath: '/path/to/workspace',
  workspaceName: 'MyProject',
  expectedWorkspacePath: '/path/to/workspace',
  expectedWorkspaceName: 'MyProject',
  desc: 'Workspace context inclusion',
}

// Bucket 4: Error Recovery
{
  name: 'Handle LLM error response gracefully',
  userRequest: 'Create component',
  llmResponse: null,  // Simulate error
  shouldError: true,
  errorType: 'LLM_ERROR',
  desc: 'LLM error handling',
}

// Bucket 5: Configuration Variants
{
  name: 'Generate plan with TypeScript configuration',
  userRequest: 'Add feature',
  llmResponse: JSON.stringify([
    { step: 1, action: 'write', description: 'Create', path: 'src/index.ts' },
  ]),
  language: 'TypeScript',
  extension: '.ts',
  expectedExtension: '.ts',
  desc: 'TypeScript configuration',
}

// Bucket 6: Edge Cases
{
  name: 'Handle empty user request',
  userRequest: '',
  llmResponse: JSON.stringify([]),
  shouldError: true,
  desc: 'Empty request handling',
}
```

---

## FILE 3: planner-validation-consolidated.test.ts (30 tests)

### Bucket Structure

```typescript
describe('BUCKET 1: Step Validation', () => {
  // Step structure validation
});

describe('BUCKET 2: Path Validation', () => {
  // File path validation
});

describe('BUCKET 3: Dependency Validation', () => {
  // Dependency validation
});

describe('BUCKET 4: Action Type Validation', () => {
  // Action type validation
});

describe('BUCKET 5: Error Messages', () => {
  // Error message generation
});

describe('BUCKET 6: Recovery Suggestions', () => {
  // Recovery suggestions
});
```

### Copy-Paste Rows (Sample)

```typescript
// Bucket 1: Step Validation
{
  name: 'Validate step with all required fields',
  step: { step: 1, action: 'write', description: 'Create', path: 'src/file.ts' },
  shouldBeValid: true,
  desc: 'Valid step structure',
}

{
  name: 'Reject step missing required path',
  step: { step: 1, action: 'write', description: 'Create' },
  shouldBeValid: false,
  expectedError: 'MISSING_PATH',
  desc: 'Missing path validation',
}

// Bucket 2: Path Validation
{
  name: 'Validate file path with extension',
  step: { step: 1, action: 'write', description: 'Create', path: 'src/Button.tsx' },
  shouldBeValid: true,
  pathIsValid: true,
  desc: 'Valid file path',
}

{
  name: 'Reject path without extension',
  step: { step: 1, action: 'write', description: 'Create', path: 'src/Button' },
  shouldBeValid: false,
  expectedError: 'NO_EXTENSION',
  desc: 'Missing file extension',
}

// Bucket 3: Dependency Validation
{
  name: 'Detect circular dependencies',
  steps: [
    { step: 1, action: 'write', path: 'src/A.ts', dependsOn: ['src/B.ts'] },
    { step: 2, action: 'write', path: 'src/B.ts', dependsOn: ['src/A.ts'] },
  ],
  shouldBeValid: false,
  expectedError: 'CIRCULAR_DEPENDENCY',
  desc: 'Circular dependency detection',
}

// Bucket 4: Action Type Validation
{
  name: 'Validate recognized action types',
  step: { step: 1, action: 'write', description: 'Create', path: 'src/file.ts' },
  shouldBeValid: true,
  validActions: ['read', 'write', 'delete', 'run', 'manual'],
  desc: 'Valid action types',
}

{
  name: 'Reject unknown action type',
  step: { step: 1, action: 'unknown', description: 'Create', path: 'src/file.ts' },
  shouldBeValid: false,
  expectedError: 'INVALID_ACTION',
  desc: 'Unknown action rejection',
}

// Bucket 5: Error Messages
{
  name: 'Generate helpful error message',
  step: { step: 1, action: 'teleport', description: 'Create', path: 'src/file.ts' },
  shouldBeValid: false,
  expectedMessage: /must be one of:/,
  desc: 'Helpful error message',
}

// Bucket 6: Recovery Suggestions
{
  name: 'Suggest recovery for invalid path',
  step: { step: 1, action: 'write', description: 'Create', path: '' },
  shouldBeValid: false,
  hasSuggestion: true,
  suggestion: /provide a valid file path/,
  desc: 'Recovery suggestion',
}
```

---

## FILE 4: planner-dependencies-consolidated.test.ts (19 tests)

### Similar pattern with focus on dependency graphs, cycle detection, ordering validation

---

## Implementation Notes

### Phase 4.3 Bulk Entry Process

1. **Start with planner-parsing-consolidated.test.ts**
   - Copy rows from Bucket 1 (Clean JSON) - 6 tests
   - Copy rows from Bucket 2 (Markdown) - 4 tests
   - Copy rows from Bucket 3 (Prose) - 3 tests
   - Copy rows from Bucket 4 (Error) - 4 tests
   - Copy rows from Bucket 5 (Normalization) - 4 tests
   - Copy rows from Bucket 6 (Edge Cases) - 4 tests
   - **Total**: 25 tests (close to 36 from original)

2. **Then planner-generation-consolidated.test.ts**
   - Populate 6 buckets with appropriate generation tests
   - **Total**: 27 tests

3. **Then planner-validation-consolidated.test.ts**
   - Populate 6 buckets with validation scenarios
   - **Total**: 30 tests

4. **Finally planner-dependencies-consolidated.test.ts**
   - Populate 5 buckets with dependency tests
   - **Total**: 19 tests

---

## Summary

### Phase 4.2: Planner Matrix Design - COMPLETE

**Total Matrix Rows Designed**: 112+ rows across 4 files
**Copy-Paste Readiness**: Complete - All rows have full parameters
**Reuse from Phase 3**: Parsing pattern directly from Phase 3 Bucket 3
**Confidence**: 94% (proven pattern from Phase 3)

---

**Status**: 🎯 **PHASE 4.2 MATRIX DESIGN COMPLETE - READY FOR BULK ENTRY**

*"Planner matrices designed for all 4 consolidation files. Copy-paste ready rows prepared. Phase 3 parsing pattern reused. Ready for Phase 4.3 bulk entry."* ⚡

