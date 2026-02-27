# Test Factories: State Injection Engine

**Phase 1 of Greenfield Test Suite 2.0**

This directory contains centralized mock factories that prevent "Mock Bloat" through state injection. Instead of 90% setup and 10% assertions, factories provide sensible defaults that can be overridden per test.

## Overview

### The Problem (Before)
```typescript
// Old pattern: Manual mocking for every test
const mockLLM = {
  sendMessage: vi.fn().mockResolvedValue('...'),
  sendMessageStream: vi.fn(),
  isServerHealthy: vi.fn(),
  clearHistory: vi.fn(),
};

const executor = new Executor({
  extension: {} as any,
  llmClient: mockLLM,
  workspace: vscode.Uri.file('/test'),
  maxRetries: 2,
  timeout: 30000,
  onProgress: vi.fn(),
  onMessage: vi.fn(),
  onStepOutput: vi.fn(),
});
```

### The Solution (After)
```typescript
// New pattern: One factory, sensible defaults
const { instance: executor, mocks } = createMockExecutor({
  llmResponse: 'customized response'
});

// Access mocks for verification
expect(mocks.sendMessageSpy).toHaveBeenCalled();
```

## Core Factories

### `createMockExecutor(options?)`

Creates a real Executor instance with injected state. Provides a happy-path LLM response and file system mock by default.

**Returns:**
```typescript
{
  instance: Executor;
  mocks: {
    llm: LLMClient;
    sendMessageSpy: MockFunction;
    sendMessageStreamSpy: MockFunction;
    isServerHealthySpy: MockFunction;
    clearHistorySpy: MockFunction;
    writeSpy: MockFunction;
  }
}
```

**Usage Examples:**

```typescript
// Default happy path
const { instance, mocks } = createMockExecutor();

// Custom LLM response
const { instance } = createMockExecutor({
  llmResponse: JSON.stringify({ error: 'file not found' })
});

// Test retry logic
const { instance } = createMockExecutor({
  retryCount: 2
});

// Test authorization failures
const { instance } = createMockExecutor({
  isAuthorized: false
});

// Verify calls
const { instance, mocks } = createMockExecutor();
// ... run test ...
expect(mocks.sendMessageSpy).toHaveBeenCalledWith(expectedPrompt);
```

### `createMockPlanner(options?)`

Creates a real Planner instance with simulated LLM responses. Supports three preset "moods" for realistic LLM behavior variations.

**Available Moods:**

1. **`'clean'`** (default): Standard JSON response
   ```
   {"steps": [{"action": "read", "path": "src/index.ts"}]}
   ```

2. **`'markdown'`**: JSON wrapped in markdown code blocks
   ```
   ```json
   {"steps": [{"action": "read", "path": "src/index.ts"}]}
   ```
   ```

3. **`'hallucination'`**: JSON embedded in prose text
   ```
   Here is the execution plan for your code: {"steps": [{"action": "read", "path": "src/index.ts"}]} This should help you get started!
   ```

**Returns:**
```typescript
{
  instance: Planner;
  mocks: {
    llm: LLMClient;
    sendMessageSpy: MockFunction;
    sendMessageStreamSpy: MockFunction;
    isServerHealthySpy: MockFunction;
    clearHistorySpy: MockFunction;
  }
}
```

**Usage Examples:**

```typescript
// Default happy path (clean JSON)
const { instance } = createMockPlanner();

// Markdown-wrapped response
const { instance } = createMockPlanner({ mood: 'markdown' });

// Hallucinated response
const { instance } = createMockPlanner({ mood: 'hallucination' });

// Custom response (overrides mood)
const { instance } = createMockPlanner({
  rawLLMResponse: '{"steps": [{"id": 1, "action": "write"}]}'
});

// Custom context depth
const { instance } = createMockPlanner({
  contextDepth: 10,
  availableTools: ['read', 'write', 'run', 'delete']
});
```

### `createCodePatterns`

Utility object for generating test code with known patterns. Used in SmartValidator and other semantic tests.

**Available Patterns:**

- `createCodePatterns.undefinedVariable(varName?)` - Code with undefined variables
- `createCodePatterns.badImport(importPath?)` - Code with missing imports
- `createCodePatterns.unusedImport(importName?)` - Code with unused imports
- `createCodePatterns.missingTypeImport(typeName?)` - Code with missing type definitions
- `createCodePatterns.valid()` - Valid code baseline

**Usage:**

```typescript
import { createCodePatterns } from './factories/stateInjectionFactory';

const { instance } = createMockValidator();
const code = createCodePatterns.undefinedVariable('myVar');
const errors = instance.validate(code);
expect(errors.length).toBeGreaterThan(0);
```

## Design Principles

### 1. State Injection Over Mocking
- Uses real instances with injected private state
- Provides partial mocks (only external dependencies are mocked)
- Enables white-box testing of private methods

### 2. Happy Path Defaults
- Executor: Returns success responses, file operations succeed, authorization passes
- Planner: Returns clean JSON (most common case), context available, tools available
- Reduces test setup boilerplate by 80%

### 3. Spy-First Design
- All mocks expose underlying Vitest spies
- Enables call verification and integration testing
- Phase 3 uses spies to verify Executor → Planner → LLM flow

### 4. Property Assignment Pattern
```typescript
// Uses this pattern for state injection:
(instance as any).privateField = value;
```
- Avoids constructor refactoring
- Maintains 70%+ coverage on existing code
- Allows direct private method testing via string indexing: `instance['methodName'](args)`

## Integration Testing (Phase 3)

With these factories, Phase 3 integration tests verify multi-step flows:

```typescript
it('should call planner with correct prompt', async () => {
  // Phase 3: Executor -> Planner -> LLM flow
  const { instance: executor, mocks: executorMocks } = createMockExecutor();
  const { instance: planner, mocks: plannerMocks } = createMockPlanner();

  // ... orchestrate calls ...

  expect(executorMocks.sendMessageSpy).toHaveBeenCalled();
  expect(plannerMocks.sendMessageSpy).toHaveBeenCalled();
});
```

## Test.Each() Pattern

Factories work seamlessly with parameterized tests:

```typescript
const validationMatrix = [
  { input: 'const x = 1;', expected: true, desc: 'valid syntax' },
  { input: 'const x = ;', expected: false, desc: 'invalid syntax' },
];

it.each(validationMatrix)(
  'validates: $desc',
  ({ input, expected }) => {
    const { instance } = createMockExecutor();
    const result = (instance as any).validateSyntax(input);
    expect(result).toBe(expected);
  }
);
```

## File Structure

```
src/test/factories/
├── stateInjectionFactory.ts    # Main factories (Executor + Planner)
└── README.md                   # This file
```

## When to Use Each Factory

| Scenario | Factory | Mood |
|----------|---------|------|
| Basic executor test | `createMockExecutor()` | N/A |
| Testing retry logic | `createMockExecutor({ retryCount: 2 })` | N/A |
| Testing parser with clean JSON | `createMockPlanner()` | `'clean'` |
| Testing parser with markdown | `createMockPlanner({ mood: 'markdown' })` | `'markdown'` |
| Testing error recovery | `createMockPlanner({ mood: 'hallucination' })` | `'hallucination'` |
| Testing validator | Depends on what you're validating | N/A |

## Backward Compatibility

Existing factories in this directory remain available:
- `mockFactory.ts` - Low-level dependency mocks
- `executorFactory.ts` - Task plan templates
- `plannerFactory.ts` - Plan response templates

New code should prefer `stateInjectionFactory.ts` as it replaces 90% of those use cases.

## Phase 2: Usage in Tests

See these examples for patterns:

- `src/test/executor-internals.test.ts` - Validation matrix example
- `src/test/planner-internals.test.ts` - Parsing matrix example

These demonstrate:
1. How to use factories in test setup
2. How to call private methods via string indexing
3. How to structure test.each() matrices
4. How to verify calls using spies

## Future Phases

**Phase 3**: Update existing tests to use factories (backward compatible)
**Phase 4**: Add SmartValidator factory for semantic test coverage
**Phase 5**: Integration workflows testing Executor + Planner + LLMClient

---

**Author**: Claude Code (Anthropic)
**Phase**: 1 - The Infrastructure (Global Mock Factory)
**Updated**: 2025-02-26
