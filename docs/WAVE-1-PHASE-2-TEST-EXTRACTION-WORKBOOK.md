# Phase 2 Test Extraction Workbook - Ready for Bulk Entry

**Purpose**: Complete data extraction (test parameters only, no test logic) for Phase 2 bulk matrix entry
**Format**: Structured test case matrices ready to copy-paste into it.each() arrays
**Timeline**: 40 min extraction + 60 min bulk entry = 2-hour sprint

---

## BUCKET 1: Architecture & Layer Rules

### Matrix Set 1.1: validateArchitectureRules (executor-validation.test.ts)
```typescript
const validateArchitectureRulesMatrix = [
  {
    name: 'fetch vs TanStack Query',
    content: 'export async function fetchUsers() { const response = await fetch("/api/users"); }',
    path: 'src/api/users.ts',
    expectedErrorPattern: 'fetch|TanStack|TanStack Query',
    description: 'Should detect fetch() without TanStack Query wrapper'
  },
  {
    name: 'Redux instead of Zustand',
    content: 'import { useSelector } from "react-redux";',
    path: 'src/pages/Profile.tsx',
    expectedErrorPattern: 'Redux|Zustand|state management',
    description: 'Should detect Redux usage in Zustand-only codebase'
  },
  {
    name: 'class components instead of functional',
    content: 'export class Button extends React.Component { render() { return <button />; } }',
    path: 'src/components/Button.tsx',
    expectedErrorPattern: 'class|functional|component',
    description: 'Should detect class components instead of functional'
  },
  {
    name: 'modern architecture pattern',
    content: 'import { useQuery } from "@tanstack/react-query";',
    path: 'test.tsx',
    expectedErrorPattern: '',
    shouldPass: true,
    description: 'Should accept modern TanStack Query patterns'
  }
];
```

### Matrix Set 1.2: Multiple File References (executor-validation.test.ts)
```typescript
const multipleFileReferencesMatrix = [
  {
    name: 'multiple file refs',
    content: '// File: src/stores/authStore.ts\n// Also need to update: src/components/LoginForm.tsx\n// Update this too: src/hooks/useAuth.ts',
    path: 'plan.md',
    expectedError: 'multiple file references',
    description: 'Should detect planning files referencing multiple files'
  }
];
```

### Matrix Set 1.3: Error Type Categorization (executor-errors.test.ts)
```typescript
const errorTypeCategorizationMatrix = [
  {
    errorCode: 'ENOENT',
    message: 'File not found',
    expectedAction: 'walk_up_directory',
    recoveryStrategy: 'parent directory'
  },
  {
    errorCode: 'EACCES',
    message: 'Permission denied',
    expectedAction: 'suggest_alternative',
    recoveryStrategy: 'alternative location'
  },
  {
    errorCode: 'EISDIR',
    message: 'Is a directory',
    expectedAction: 'add_recurse_flag',
    recoveryStrategy: 'recurse flag'
  },
  {
    errorCode: 'EMFILE',
    message: 'Too many open files',
    expectedAction: 'retry_later',
    recoveryStrategy: 'retry later'
  }
];
```

---

## BUCKET 2: Code Quality & Patterns

### Matrix Set 2.1: validateTypes (executor-validation.test.ts)
```typescript
const validateTypesMatrix = [
  {
    name: 'markdown code blocks',
    content: '```typescript\nexport const MyComponent = () => <div>Hello</div>;\n```',
    path: 'instructions.md',
    shouldError: true,
    errorPattern: 'markdown|backticks'
  },
  {
    name: 'documentation instead of code',
    content: '# Setup\n## Installation\n### Step 1: Install dependencies\nnpm install react',
    path: 'README.md',
    shouldError: true,
    errorPattern: 'documentation|tutorial'
  },
  {
    name: 'any type usage',
    content: 'export function processData(data: any): any { return data as any; }',
    path: 'src/utils/processor.ts',
    shouldError: true,
    errorPattern: 'any'
  },
  {
    name: 'valid TypeScript code',
    content: 'interface User { id: string; email: string; } export function getUser(id: string): User { return { id, email: "test@example.com" }; }',
    path: 'src/types/User.ts',
    shouldError: false
  },
  {
    name: 'type-only exports without implementations',
    content: 'export type LoginFormValues = { email: string; password: string; };\nexport type LoginResponse = { token: string; };',
    path: 'src/types/login.ts',
    shouldError: true,
    errorPattern: 'only exports types'
  },
  {
    name: 'function exports with types',
    content: 'export type User = { id: string }; export function createUser(name: string): User { return { id: "1" }; }',
    path: 'src/services/user.ts',
    shouldError: false
  },
  {
    name: 'valid exports with implementation',
    content: 'export interface Config { apiUrl: string; } export const createConfig = (url: string): Config => ({ apiUrl: url });',
    path: 'src/config/index.ts',
    shouldError: false
  }
];
```

### Matrix Set 2.2: validateCommonPatterns (executor-validation.test.ts)
```typescript
const validateCommonPatternsMatrix = [
  {
    name: 'React imports without hooks',
    content: 'import React from "react";\nconst [state, setState] = React.useState("");',
    path: 'src/components/Button.tsx',
    shouldWarn: true,
    warningType: 'import_style'
  },
  {
    name: 'missing destructuring in imports',
    content: 'import React from "react";\nconst [value, setValue] = React.useState("");',
    path: 'src/components/Form.tsx',
    shouldWarn: true,
    warningType: 'destructuring'
  },
  {
    name: 'Zustand usage without proper init',
    content: 'export const useStore = create(() => ({ count: 0 }));',
    path: 'src/components/Counter.tsx',
    shouldWarn: true,
    warningType: 'zustand_pattern'
  },
  {
    name: 'correct Zustand pattern',
    content: 'import { create } from "zustand";\ninterface CounterStore { count: number; increment: () => void; }\nexport const useCounterStore = create<CounterStore>((set) => ({ count: 0, increment: () => set(state => ({ count: state.count + 1 })) }));',
    path: 'src/stores/counter.ts',
    shouldWarn: false
  },
  {
    name: 'TanStack Query misuse',
    content: 'const data = useQuery(); // Missing options',
    path: 'src/hooks/useData.ts',
    shouldWarn: true,
    warningType: 'tanstack_pattern'
  },
  {
    name: 'mixed validation libraries',
    content: 'import { z } from "zod";\nimport * as yup from "yup";\nconst schema1 = z.object({});\nconst schema2 = yup.object({});',
    path: 'src/validation/schemas.ts',
    shouldWarn: true,
    warningType: 'mixed_libraries'
  }
];
```

### Matrix Set 2.3: validateFormComponentPatterns (executor-validation.test.ts)
```typescript
const validateFormComponentPatternsMatrix = [
  {
    name: 'missing state interface in form',
    content: 'const form = useForm();\nreturn <form></form>;',
    path: 'src/components/LoginForm.tsx',
    shouldError: true,
    errorType: 'missing_interface'
  },
  {
    name: 'handler typed as any',
    content: 'const handleChange: any = (e) => {};',
    path: 'src/components/Form.tsx',
    shouldError: true,
    errorType: 'any_type_handler'
  },
  {
    name: 'missing form onSubmit handler',
    content: '<form><input /></form>',
    path: 'src/components/UserForm.tsx',
    shouldError: true,
    errorType: 'missing_onsubmit'
  },
  {
    name: 'button onClick instead of form onSubmit',
    content: '<button onClick={handleSubmit}>Submit</button>',
    path: 'src/components/FormControls.tsx',
    shouldError: true,
    errorType: 'onclick_not_onsubmit'
  },
  {
    name: 'correct form pattern',
    content: 'interface FormData { name: string; }\nconst form = useForm<FormData>();\n<form onSubmit={form.handleSubmit(onSubmit)}>',
    path: 'src/components/CorrectForm.tsx',
    shouldError: false
  },
  {
    name: 'multiple handlers with any types',
    content: 'const handleChange: any = (e) => {};\nconst handleSubmit: any = (data) => {};\nconst handleBlur: any = (e) => {};',
    path: 'src/components/MultiHandlerForm.tsx',
    shouldError: true,
    errorCount: 3
  }
];
```

### Matrix Set 2.4: Path Sanitization (executor-coverage-focus.test.ts)
```typescript
const pathSanitizationMatrix = [
  {
    input: 'src/file.tsx.',
    expected: 'src/file.tsx',
    pattern: 'trailing dots'
  },
  {
    input: 'src/file.tsx ',
    expected: 'src/file.tsx',
    pattern: 'trailing spaces'
  },
  {
    input: '`src/file.tsx`',
    expected: 'src/file.tsx',
    pattern: 'backticks'
  },
  {
    input: 'src\\file.tsx',
    expected: 'src/file.tsx',
    pattern: 'backslashes'
  },
  {
    input: 'src/file.tsx... ',
    expected: 'src/file.tsx',
    pattern: 'multiple trailing artifacts'
  }
];
```

### Matrix Set 2.5: Import Path Calculation (executor-coverage-focus.test.ts)
```typescript
const importPathCalculationMatrix = [
  {
    name: 'Zustand store pattern',
    fileName: 'useLoginStore.ts',
    isStore: true,
    pattern: 'use.*Store'
  },
  {
    name: 'non-store utility',
    fileName: 'loginStore.ts',
    isStore: false,
    pattern: 'non-store'
  },
  {
    name: 'cn utility',
    fileName: 'cn.ts',
    isSpecial: true,
    pattern: 'special utility'
  }
];
```

### Matrix Set 2.6: Type Validation (executor-coverage-focus.test.ts)
```typescript
const typeValidationMatrix = [
  {
    name: 'markdown code block',
    content: '```typescript\nfunction hello() {}',
    shouldError: true
  },
  {
    name: 'documentation instead of code',
    content: '# Setup\n## Installation',
    shouldError: true
  },
  {
    name: 'type-only exports',
    content: 'export type User = { id: string };',
    shouldError: true
  },
  {
    name: 'valid function with types',
    content: 'export function getUser(id: string) { return { id }; }',
    shouldError: false
  }
];
```

### Matrix Set 2.7: Common Pattern Validation (executor-coverage-focus.test.ts)
```typescript
const commonPatternValidationMatrix = [
  {
    name: 'React imports without hooks',
    content: 'import React from "react";',
    path: 'Component.tsx'
  },
  {
    name: 'Zustand usage',
    content: 'const store = create(() => ({}));',
    path: 'Store.ts'
  },
  {
    name: 'form component patterns',
    content: 'interface FormData { name: string; }',
    path: 'Form.tsx'
  }
];
```

### Matrix Set 2.8: Form Component Validation (executor-coverage-focus.test.ts)
```typescript
const formComponentValidationMatrix = [
  {
    name: 'form with state interface',
    content: 'interface FormData { email: string; }',
    path: 'LoginForm.tsx',
    isForm: true
  },
  {
    name: 'non-form component',
    content: '<div>Hello</div>',
    path: 'Button.tsx',
    isForm: false
  }
];
```

---

## BUCKET 3: Auto-Fix & Error Recovery

### Matrix Set 3.1: Directory Walking for ENOENT (executor-errors.test.ts)
```typescript
const directoryWalkingMatrix = [
  {
    depth: 1,
    walkTimes: 1,
    description: 'walks up one level for missing file'
  },
  {
    depth: 3,
    walkTimes: 3,
    description: 'walks up multiple levels until finding directory'
  },
  {
    depth: 5,
    walkTimes: 5,
    description: 'handles deep path traversal'
  }
];
```

### Matrix Set 3.2: Retry Logic (executor-errors.test.ts)
```typescript
const retryLogicMatrix = [
  {
    maxRetries: 1,
    attemptCount: 1,
    description: 'stops at max retries = 1'
  },
  {
    maxRetries: 2,
    attemptCount: 2,
    description: 'stops at max retries = 2'
  },
  {
    maxRetries: 3,
    attemptCount: 3,
    description: 'stops at max retries = 3'
  }
];
```

### Matrix Set 3.3: Hallucination Detection (executor-errors.test.ts)
```typescript
const hallucinationDetectionMatrix = [
  {
    field: 'path',
    step: { action: 'write', path: undefined },
    shouldFail: true,
    description: 'missing required path field'
  },
  {
    field: 'action',
    step: { action: 'invalid', path: 'test.ts' },
    shouldFail: true,
    description: 'invalid action type'
  },
  {
    field: 'command',
    step: { action: 'run', path: undefined, command: undefined },
    shouldFail: true,
    description: 'run action without command'
  }
];
```

### Matrix Set 3.4: Pre-Flight Safety Checks (executor-errors.test.ts)
```typescript
const preFlightChecksMatrix = [
  {
    check: 'path_validity',
    stepConfig: { path: '../../../etc/passwd' },
    shouldWarn: true,
    description: 'warns on suspicious path traversal'
  },
  {
    check: 'command_safety',
    stepConfig: { command: 'rm -rf /' },
    shouldWarn: true,
    description: 'warns on dangerous commands'
  },
  {
    check: 'file_size',
    stepConfig: { path: 'huge-10gb-file.bin' },
    shouldWarn: false,
    description: 'skips warning for reasonable operations'
  }
];
```

### Matrix Set 3.5: Error Detection and Suggestions (executor-errors.test.ts)
```typescript
const errorSuggestionsMatrix = [
  {
    errorCode: 'ENOENT',
    message: 'File not found',
    expectedSuggestion: 'parent directory'
  },
  {
    errorCode: 'EACCES',
    message: 'Permission denied',
    expectedSuggestion: 'alternative location'
  },
  {
    errorCode: 'EISDIR',
    message: 'Is a directory',
    expectedSuggestion: 'recurse flag'
  },
  {
    errorCode: 'EMFILE',
    message: 'Too many open files',
    expectedSuggestion: 'retry later'
  }
];
```

### Matrix Set 3.6: Validation Edge Cases (executor-validation.test.ts)
```typescript
const validationEdgeCasesMatrix = [
  {
    name: 'empty content',
    content: '',
    shouldThrow: false
  },
  {
    name: 'null/undefined content',
    content: null,
    shouldThrow: true
  },
  {
    name: 'very long files',
    content: 'const x = 1;\n'.repeat(10000),
    shouldThrow: false
  },
  {
    name: 'special characters in code',
    content: '// Comment with émojis 🚀\nconst x = "unicode: ñ";',
    shouldThrow: false
  },
  {
    name: 'many violations combined',
    content: '```typescript\nconst x = 5; export type T = {}; export class C extends React.Component {}; const y: any = null;',
    shouldThrow: false,
    shouldHaveErrors: true
  },
  {
    name: 'error message quality',
    content: '```typescript\nconst x = 5;\n```',
    expectMessageLength: '> 0'
  },
  {
    name: 'path normalization',
    content: 'some code',
    path: 'src\\components\\Button.tsx',
    expectNormalizedPath: 'src/components/Button.tsx'
  }
];
```

### Matrix Set 3.7: Error Handling (executor-coverage-focus.test.ts)
```typescript
const errorHandlingMatrix = [
  {
    errorType: 'ENOENT',
    description: 'missing file'
  },
  {
    errorType: 'EACCES',
    description: 'permission error'
  },
  {
    errorType: 'EISDIR',
    description: 'is directory'
  }
];
```

### Matrix Set 3.8: Error Handling - Execution (executor-execution.test.ts)
```typescript
const executionErrorHandlingMatrix = [
  {
    name: 'missing file',
    errorType: 'ENOENT',
    description: 'File not found error'
  },
  {
    name: 'permission denied',
    errorType: 'EACCES',
    description: 'Access denied error'
  },
  {
    name: 'command execution error',
    errorType: 'COMMAND_ERROR',
    description: 'Command failed to execute'
  }
];
```

---

## BUCKET 4: Execution & Lifecycle

### Matrix Set 4.1: Constructor Initialization (executor-coverage-focus.test.ts)
```typescript
const constructorInitMatrix = [
  {
    name: 'with all config options',
    config: { maxRetries: 2, timeout: 30000 }
  },
  {
    name: 'with custom maxRetries',
    config: { maxRetries: 5 }
  },
  {
    name: 'with custom timeout',
    config: { timeout: 60000 }
  }
];
```

### Matrix Set 4.2: executePlan - Plan Orchestration (executor-execution.test.ts)
```typescript
const executePlanMatrix = [
  {
    name: 'empty plan',
    steps: [],
    expectedSuccess: true,
    expectedCompletedSteps: 0
  },
  {
    name: 'plan with single step',
    steps: [
      {
        stepId: 1,
        action: 'read',
        path: 'src/file.ts',
        description: 'Read test file'
      }
    ],
    expectedSuccess: true,
    expectedCompletedSteps: 0
  }
];
```

### Matrix Set 4.3: executeStep - Action Execution (executor-execution.test.ts)
```typescript
const executeStepMatrix = [
  {
    action: 'read',
    name: 'read action'
  },
  {
    action: 'write',
    name: 'write action'
  },
  {
    action: 'run',
    name: 'run/command action'
  }
];
```

### Matrix Set 4.4: Step Action Types (executor-real-execution.test.ts)
```typescript
const stepActionTypesMatrix = [
  {
    action: 'read',
    description: 'Read file from workspace',
    hasPath: true,
    hasCommand: false
  },
  {
    action: 'write',
    description: 'Write file to workspace',
    hasPath: true,
    hasCommand: false
  },
  {
    action: 'run',
    description: 'Run command in workspace',
    hasPath: false,
    hasCommand: true
  },
  {
    action: 'delete',
    description: 'Delete file from workspace',
    hasPath: true,
    hasCommand: false
  },
  {
    action: 'manual',
    description: 'Manual step requiring user',
    hasPath: false,
    hasCommand: false
  }
];
```

### Matrix Set 4.5: File Operations - read (executor-execution.test.ts)
```typescript
const readOperationsMatrix = [
  {
    name: 'TypeScript file',
    path: 'src/components/Button.tsx',
    description: 'Reads .tsx files'
  },
  {
    name: 'JSON configuration',
    path: 'tsconfig.json',
    description: 'Reads .json config files'
  },
  {
    name: 'utility file',
    path: 'src/utils/helpers.ts',
    description: 'Reads utility .ts files'
  }
];
```

### Matrix Set 4.6: File Operations - write (executor-execution.test.ts)
```typescript
const writeOperationsMatrix = [
  {
    name: 'TypeScript file',
    path: 'src/components/Button.tsx',
    content: 'export const Button = () => <button />;'
  },
  {
    name: 'configuration file',
    path: 'package.json',
    content: '{"name": "test", "version": "1.0.0"}'
  }
];
```

### Matrix Set 4.7: Command Execution (executor-execution.test.ts)
```typescript
const commandExecutionMatrix = [
  {
    name: 'npm test',
    command: 'npm test',
    description: 'Test runner command'
  },
  {
    name: 'build command',
    command: 'npm run build',
    description: 'Build process command'
  },
  {
    name: 'install dependencies',
    command: 'npm install',
    description: 'Package manager command'
  }
];
```

### Matrix Set 4.8: Dependency Management (executor-dependencies.test.ts)
```typescript
// Complex dependency logic - KEEP EXPLICIT (not parameterizable)
// Tests include:
// - Diamond import pattern resolution
// - Circular import detection
// - Store-component dependency pattern
// - Complex workflow reordering
// - Multiple folder structure handling
// Total: ~11 explicit tests
```

### Matrix Set 4.9: Step Contracts & Validation (executor-dependencies.test.ts)
```typescript
// Contract validation - KEEP EXPLICIT for detailed assertions
// Tests include:
// - Required field validation
// - Path format validation
// - Run action command requirement
// - Metadata inclusion
// Total: ~6 explicit tests
```

### Matrix Set 4.10: File Path Types (executor-real-execution.test.ts)
```typescript
const filePathTypesMatrix = [
  {
    path: 'src/App.tsx',
    description: 'Simple file in src root'
  },
  {
    path: 'src/components/auth/LoginForm.tsx',
    description: 'Nested components structure'
  },
  {
    path: 'src/utils/helpers/string-utils.ts',
    description: 'Deep nesting with kebab-case'
  },
  {
    path: 'src/types/ComponentProps.ts',
    description: 'PascalCase naming convention'
  },
  {
    path: 'src/styles/Button.module.css',
    description: 'CSS Module files'
  }
];
```

### Matrix Set 4.11: Callback Handlers (executor-real-execution.test.ts)
```typescript
const callbackHandlersMatrix = [
  {
    name: 'onProgress callback',
    callback: 'onProgress',
    expected: 'step progress tracking'
  },
  {
    name: 'onMessage callback',
    callback: 'onMessage',
    expected: 'message logging'
  },
  {
    name: 'onStepOutput callback',
    callback: 'onStepOutput',
    expected: 'step output capture'
  },
  {
    name: 'onQuestion callback',
    callback: 'onQuestion',
    expected: 'user question handling'
  },
  {
    name: 'optional callbacks',
    callback: 'all_optional',
    expected: 'works without callbacks'
  }
];
```

---

## NOTES FOR BULK ENTRY PHASE

1. **Total Parameterizable Matrices**: 31 groups across 4 buckets
2. **Total Parameterizable Test Cases**: ~120 cases
3. **Total Explicit Tests to Preserve**: ~66 tests (complex logic, real-world scenarios)
4. **Estimated Total After Consolidation**: 180-190 test cases
5. **Expected Coverage**: >= 71.28% (maintaining current baseline)

---

**Status**: Ready for Phase 2 Bulk Entry (60 min sprint)

All test case parameters extracted. Next: Copy matrices into it.each() arrays and run coverage verification.

