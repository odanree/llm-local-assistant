# Dependency Injection Architecture Guide

## Overview

This project uses the **Strategy Pattern** for dependency injection to enable:
- Testable error paths through mock providers
- Chaos engineering / fault injection testing
- Decoupled side effects from business logic
- Enterprise-grade error handling

## Architecture

### Core Interfaces

**IFileSystem** (`src/providers/IFileSystem.ts`)
- Contracts for file operations: read, write, delete, mkdir, stat, etc.
- All operations throw `FileSystemError` with error codes (ENOENT, EACCES, ENOSPC)
- Use case: Testing "Disk Full" scenarios, permission errors, file not found

**ICommandRunner** (`src/providers/ICommandRunner.ts`)
- Contracts for synchronous command execution
- Methods: `execSync`, `execSyncWithResult`, `commandExists`, `getPlatform`
- Use case: Testing command failures, exit codes, timeouts
- Note: Currently designed for synchronous operations. See [IAsyncCommandRunner Design](#iasynccommandrunner-design) for streaming

### Implementations

**FileSystemProvider** (`src/providers/FileSystemProvider.ts`)
- Production implementation wrapping Node.js `fs` module
- Used by: Future refactoring of codebaseIndex.ts, utils/contextBuilder.ts, etc.
- Status: Ready for integration

**CommandRunnerProvider** (`src/providers/CommandRunnerProvider.ts`)
- Production implementation wrapping `child_process` module
- Used by: Future refactoring of command execution
- Status: Ready for integration

### Test Doubles

**MockFileSystem** (`src/test/mocks/MockFileSystem.ts`)
- Test implementation with full fault injection
- Supports: ENOSPC (Disk Full), EACCES (Permission Denied), ENOENT (File Not Found)
- Usage:
  ```typescript
  const mockFs = new MockFileSystem({
    files: { '/test/file.ts': 'content' },
    failOnWrite: ['/test/readonly.ts'],
    writeErrorCode: 'EACCES'
  });
  ```

**MockCommandRunner** (`src/test/mocks/MockCommandRunner.ts`)
- Test implementation with command response customization
- Supports: Timeouts, exit codes, stderr, custom responses
- Usage:
  ```typescript
  const mockCmd = new MockCommandRunner({
    failingCommands: ['git push'],
    failureErrorCode: 128,
    timeoutCommands: ['slow-operation'],
    timeoutMs: 1000
  });
  ```

## Usage Patterns

### Pattern 1: Constructor Injection (Recommended)

```typescript
class MyService {
  constructor(
    private fs: IFileSystem = new FileSystemProvider(),
    private commandRunner: ICommandRunner = new CommandRunnerProvider()
  ) {}

  async doSomething() {
    const content = this.fs.readFileSync('/path/to/file');
    const result = this.commandRunner.execSync('git status');
    return { content, result };
  }
}

// Production: Uses FileSystemProvider and CommandRunnerProvider
const service = new MyService();

// Testing: Use mocks for error injection
const mockFs = new MockFileSystem({ failOnRead: ['/path/to/file'] });
const service = new MyService(mockFs);
```

### Pattern 2: Config-Based Injection (For Optional Migration)

```typescript
interface ServiceConfig {
  fs?: IFileSystem;
  commandRunner?: ICommandRunner;
}

class MyService {
  private fs: IFileSystem;
  private commandRunner: ICommandRunner;

  constructor(config: ServiceConfig = {}) {
    this.fs = config.fs || new FileSystemProvider();
    this.commandRunner = config.commandRunner || new CommandRunnerProvider();
  }
}

// See Executor.ts for real example
```

### Pattern 3: Error Handling with Fault Injection

```typescript
// Test: Verify error handling for permission denied
it('should handle permission denied errors', () => {
  const mockFs = new MockFileSystem({
    files: { '/test/file.ts': 'content' }
  });
  mockFs.setFailureMode('write', '/test/file.ts', 'EACCES');

  expect(() => {
    mockFs.writeFileSync('/test/file.ts', 'new content');
  }).toThrow();
});

// Production: Same code path tested without mocks
const realFs = new FileSystemProvider();
realFs.writeFileSync('/test/file.ts', 'new content'); // Uses real fs
```

## Error Handling

### FileSystemError

All file system errors are mapped to `FileSystemError`:

```typescript
export class FileSystemError extends Error {
  constructor(
    public code: string,      // 'ENOENT', 'EACCES', 'ENOSPC'
    message: string,
    public path?: string
  ) {
    super(message);
  }
}

// Usage
try {
  fs.readFileSync('/nonexistent');
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log('File not found');
  } else if (error.code === 'EACCES') {
    console.log('Permission denied');
  }
}
```

### CommandError

Command execution errors are mapped to `CommandError`:

```typescript
export class CommandError extends Error {
  constructor(
    public code: string | number,
    public command: string,
    public stdout: string,
    public stderr: string,
    message?: string
  ) {
    super(message);
  }
}

export class CommandTimeoutError extends CommandError {
  // Specific error for timeouts
}
```

## Testing with Fault Injection

### Example: Testing Disk Full Scenario

```typescript
import { MockFileSystem } from './mocks/MockFileSystem';

describe('File Writing', () => {
  it('should handle disk full errors', () => {
    const mockFs = new MockFileSystem({
      failOnWrite: ['/output.ts'],
      writeErrorCode: 'ENOSPC'
    });

    expect(() => {
      mockFs.writeFileSync('/output.ts', 'code');
    }).toThrow('ENOSPC');
  });
});
```

### Example: Testing Command Timeout

```typescript
import { MockCommandRunner } from './mocks/MockCommandRunner';

describe('Command Execution', () => {
  it('should handle command timeout', () => {
    const mockCmd = new MockCommandRunner({
      timeoutCommands: ['slow-process'],
      timeoutMs: 100
    });

    expect(() => {
      mockCmd.execSync('slow-process', { timeout: 100 });
    }).toThrow('CommandTimeoutError');
  });
});
```

## Migration Roadmap

### Phase 1: Documentation (Week 1)
- ✅ Create this architecture guide
- Document provider interfaces in README
- Add examples to CONTRIBUTING.md

### Phase 2: codebaseIndex.ts (Week 2)
**Why first**: File-heavy code with many fs operations
**Expected impact**: +0.3-0.4% coverage

```typescript
// Before
const content = fs.readFileSync(path, 'utf-8');

// After
class CodebaseIndex {
  constructor(private fs: IFileSystem = new FileSystemProvider()) {}

  analyze() {
    const content = this.fs.readFileSync(path, 'utf-8');
  }
}
```

### Phase 3: utils/contextBuilder.ts (Week 3)
**Why next**: Isolated file operations
**Expected impact**: +0.2-0.3% coverage

### Phase 4: utils/generationModeDetector.ts (Week 3)
**Why parallel**: Similar pattern to contextBuilder
**Expected impact**: +0.2-0.3% coverage

### Phase 5: IAsyncCommandRunner Design (Week 4)
**Why separate**: Requires new interface for streaming
**Expected impact**: +0.5% coverage + foundation for cp.spawn coverage

## IAsyncCommandRunner Design (Future)

Current `ICommandRunner` is synchronous. For cp.spawn streaming:

```typescript
// Proposed interface for async operations
export interface IAsyncCommandRunner {
  spawn(
    command: string,
    args: string[],
    options?: SpawnOptions
  ): ChildProcess;

  spawnWithStreaming(
    command: string,
    onStdout: (data: string) => void,
    onStderr: (data: string) => void,
    options?: SpawnOptions
  ): Promise<{ exitCode: number }>;
}

// Executor could use:
this.asyncCommandRunner.spawnWithStreaming(
  'git push',
  (out) => console.log(out),
  (err) => console.error(err)
);
```

## Best Practices

### ✅ DO

- Inject all side effects (file I/O, commands, HTTP calls)
- Use type-safe interfaces for contracts
- Throw typed errors (FileSystemError, CommandError)
- Test with mocks using fault injection
- Default to production providers in constructors

### ❌ DON'T

- Use `fs` directly in new code (use `this.fs` instead)
- Catch generic Error (catch FileSystemError instead)
- Test filesystem operations with real files
- Mock providers that already exist (use the provided mocks)
- Create parallel provider implementations

## Performance Notes

- Mock providers are designed for testing, not production speed
- FileSystemProvider is a thin wrapper (no performance cost)
- CommandRunnerProvider delegates to child_process (no performance cost)
- Error path testing via mocks is typically 10-100x faster than integration tests

## Troubleshooting

### Issue: Tests still hitting real filesystem

**Solution**: Ensure the service is instantiated with mocks:
```typescript
const mockFs = new MockFileSystem({ /* config */ });
const service = new MyService(mockFs); // Pass mock explicitly
```

### Issue: Error codes not matching

**Solution**: Verify FileSystemError has the correct error code:
```typescript
expect(error.code).toBe('EACCES'); // Not 'PERMISSION_DENIED'
```

### Issue: Command output not captured

**Solution**: Use `execSyncWithResult` instead of `execSync`:
```typescript
const result = this.commandRunner.execSyncWithResult('command');
console.log(result.stdout, result.stderr, result.exitCode);
```

## References

- Source: `src/providers/`
- Tests: `src/test/mocks/`
- Example: `src/executor.ts` (constructor DI pattern)
- Fault injection tests: `src/test/executor-fault-injection.test.ts`

## Questions or Issues?

Refer to this guide when:
- Adding file I/O to new modules
- Writing error path tests
- Designing testable command execution
- Setting up dependency injection

The architecture is designed to be **progressive** - adopt providers incrementally as you refactor existing code.
