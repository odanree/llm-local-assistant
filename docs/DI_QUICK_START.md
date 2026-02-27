# DI Pattern Quick Start (5-Minute Read)

TL;DR: **Inject file system and command operations to make code testable.**

## The Pattern in 30 Seconds

```typescript
// ❌ BEFORE: Hard to test, tightly coupled
class MyModule {
  analyze() {
    const content = fs.readFileSync('./data.txt'); // Can't test disk errors
    cp.execSync('git status');                      // Can't test timeouts
  }
}

// ✅ AFTER: Easy to test, loosely coupled
class MyModule {
  constructor(
    private fs: IFileSystem = new FileSystemProvider(),
    private cmd: ICommandRunner = new CommandRunnerProvider()
  ) {}

  analyze() {
    const content = this.fs.readFileSync('./data.txt');  // Testable!
    this.cmd.execSync('git status');                     // Testable!
  }
}

// Production: Uses real providers (default)
const module = new MyModule();

// Testing: Use mocks for error injection
const mockFs = new MockFileSystem({ failOnRead: ['./data.txt'] });
const module = new MyModule(mockFs);
```

## Three Patterns You Need

### Pattern 1: Basic Constructor Injection (Recommended)

```typescript
import { IFileSystem } from '../providers/IFileSystem';
import { FileSystemProvider } from '../providers/FileSystemProvider';

class MyService {
  // Step 1: Add parameter with default production provider
  constructor(private fs: IFileSystem = new FileSystemProvider()) {}

  // Step 2: Use this.fs instead of importing fs
  doSomething() {
    return this.fs.readFileSync('/path/file.ts');
  }
}

// Automatic: Production uses FileSystemProvider, tests inject mocks
```

### Pattern 2: Optional (For Existing Complex Classes)

```typescript
import { IFileSystem } from '../providers/IFileSystem';
import { ICommandRunner } from '../providers/ICommandRunner';
import { FileSystemProvider } from '../providers/FileSystemProvider';
import { CommandRunnerProvider } from '../providers/CommandRunnerProvider';

interface MyServiceConfig {
  fs?: IFileSystem;
  cmd?: ICommandRunner;
}

class MyService {
  private fs: IFileSystem;
  private cmd: ICommandRunner;

  constructor(config: MyServiceConfig = {}) {
    this.fs = config.fs || new FileSystemProvider();
    this.cmd = config.cmd || new CommandRunnerProvider();
  }
}

// Used by: Executor.ts (already refactored)
```

### Pattern 3: Error Handling (For Testing)

```typescript
import { FileSystemError } from '../providers/IFileSystem';
import { CommandError, CommandTimeoutError } from '../providers/ICommandRunner';

try {
  this.fs.readFileSync('/protected');
} catch (error) {
  if (error instanceof FileSystemError) {
    if (error.code === 'EACCES') {
      // Permission denied - handle gracefully
      console.log(`Access denied to ${error.path}`);
    } else if (error.code === 'ENOENT') {
      // File not found
      console.log(`File not found: ${error.path}`);
    }
  }
}

try {
  this.cmd.execSync('git push');
} catch (error) {
  if (error instanceof CommandTimeoutError) {
    console.log(`Command timed out after ${error.code}ms`);
  } else if (error instanceof CommandError) {
    console.log(`Command failed with exit code ${error.code}`);
    console.log(`STDERR: ${error.stderr}`);
  }
}
```

## Copy-Paste Templates

### Template 1: Refactoring a File-Heavy Module

```typescript
// BEFORE
import * as fs from 'fs';

export class MyModule {
  analyze() {
    const file1 = fs.readFileSync('./src/file1.ts');
    const file2 = fs.readFileSync('./src/file2.ts');
    fs.writeFileSync('./output.ts', processed);
    return { file1, file2 };
  }
}

// AFTER
import { IFileSystem } from '../providers/IFileSystem';
import { FileSystemProvider } from '../providers/FileSystemProvider';

export class MyModule {
  constructor(private fs: IFileSystem = new FileSystemProvider()) {}

  analyze() {
    const file1 = this.fs.readFileSync('./src/file1.ts');
    const file2 = this.fs.readFileSync('./src/file2.ts');
    this.fs.writeFileSync('./output.ts', processed);
    return { file1, file2 };
  }
}

// TEST
import { MockFileSystem } from '../test/mocks/MockFileSystem';

it('handles file read errors', () => {
  const mockFs = new MockFileSystem({
    failOnRead: ['./src/file1.ts'],
    readErrorCode: 'EACCES'
  });
  const module = new MyModule(mockFs);

  expect(() => module.analyze()).toThrow();
});
```

### Template 2: Refactoring Command Execution

```typescript
// BEFORE
import * as cp from 'child_process';

export class GitClient {
  getStatus() {
    return cp.execSync('git status', { encoding: 'utf-8' });
  }
}

// AFTER
import { ICommandRunner } from '../providers/ICommandRunner';
import { CommandRunnerProvider } from '../providers/CommandRunnerProvider';

export class GitClient {
  constructor(private cmd: ICommandRunner = new CommandRunnerProvider()) {}

  getStatus() {
    return this.cmd.execSync('git status');
  }
}

// TEST
import { MockCommandRunner } from '../test/mocks/MockCommandRunner';

it('handles git command failure', () => {
  const mockCmd = new MockCommandRunner({
    failingCommands: ['git status'],
    failureErrorCode: 128,
    failureStderr: 'fatal: not a git repository'
  });
  const client = new GitClient(mockCmd);

  expect(() => client.getStatus()).toThrow();
});
```

## Checklist: "I'm Ready to Refactor"

Before you refactor a module:

- [ ] Module has file I/O (fs.read/write/mkdir) or command execution (cp.execSync)
- [ ] You understand what errors it should handle (ENOENT, EACCES, timeouts)
- [ ] You're not changing business logic (pure refactoring)
- [ ] You have 30 minutes for the refactoring
- [ ] You can run tests immediately after

Refactoring steps:

1. [ ] Add import: `import { IFileSystem } from '../providers/IFileSystem'`
2. [ ] Add to constructor: `private fs: IFileSystem = new FileSystemProvider()`
3. [ ] Replace `fs.readFileSync` with `this.fs.readFileSync` (search/replace)
4. [ ] Replace `fs.writeFileSync` with `this.fs.writeFileSync`
5. [ ] Replace `cp.execSync` with `this.cmd.execSync`
6. [ ] Run tests: `npm run test`
7. [ ] Coverage check: Should stay same or increase
8. [ ] Add error injection test (optional but recommended)
9. [ ] Commit with message: `refactor: Add DI providers to [ModuleName]`

## Common Pitfalls

### ❌ Pitfall 1: Forgot to Remove Import

```typescript
// WRONG: Still importing fs but not using it
import * as fs from 'fs';

class MyModule {
  constructor(private fs: IFileSystem = new FileSystemProvider()) {}
}

// RIGHT: Remove the import once fully migrated
class MyModule {
  constructor(private fs: IFileSystem = new FileSystemProvider()) {}
}
```

**Fix**: Search for `fs.` in your file - if nothing found, remove the import.

### ❌ Pitfall 2: Wrong Error Type

```typescript
// WRONG: Catching generic Error
try {
  this.fs.readFileSync(path);
} catch (error) {
  console.log(error.message); // May not have .code property
}

// RIGHT: Catch FileSystemError
try {
  this.fs.readFileSync(path);
} catch (error) {
  if (error instanceof FileSystemError && error.code === 'ENOENT') {
    // Handle file not found
  }
}
```

**Fix**: Always use `instanceof FileSystemError` or `instanceof CommandError`.

### ❌ Pitfall 3: Forgot to Pass Mock in Test

```typescript
// WRONG: Mock created but not injected
it('should fail on permission denied', () => {
  const mockFs = new MockFileSystem({
    failOnRead: ['/protected']
  });
  const service = new MyService(); // Forgot to pass mockFs!
  // Test will use real FileSystemProvider, mock never used
});

// RIGHT: Pass mock to constructor
it('should fail on permission denied', () => {
  const mockFs = new MockFileSystem({
    failOnRead: ['/protected']
  });
  const service = new MyService(mockFs); // Inject mock
  expect(() => service.doSomething()).toThrow();
});
```

**Fix**: Always pass injected providers to constructor in tests.

## Error Codes Reference

**File System** (from `FileSystemError`):
- `ENOENT` - File not found
- `EACCES` - Permission denied
- `ENOSPC` - Disk full
- `EEXIST` - File/directory already exists

**Commands** (from `CommandError`):
- Exit code `0` - Success
- Exit code `1-127` - Command failure
- Exit code `128` - Git-specific errors
- `TIMEOUT` - Command timed out (from `CommandTimeoutError`)

## Real Examples in Codebase

- **Executor.ts** (lines 57-70): Constructor with DI + defaults
- **executor-fault-injection.test.ts**: 25 examples of fault injection testing
- **MockFileSystem.ts**: Full mock implementation (study for patterns)

## One-Minute Test Template

```typescript
import { MockFileSystem } from '../test/mocks/MockFileSystem';
import { MyModule } from './MyModule';

describe('MyModule', () => {
  it('handles disk full errors', () => {
    const mockFs = new MockFileSystem({
      failOnWrite: ['/output.ts'],
      writeErrorCode: 'ENOSPC'
    });
    const module = new MyModule(mockFs);

    expect(() => module.process()).toThrow('ENOSPC');
  });
});
```

Copy this, change the paths and expectations, and you're done.

## When to Ask for Help

- "My module doesn't have file I/O or commands" → Don't refactor yet (no benefit)
- "Tests are failing after refactoring" → Check you're passing mocks correctly
- "Coverage went down" → Normal if adding new code; check next sprint
- "I'm not sure what errors to test" → Look at try/catch blocks in original code

## Success Metrics (Per Module)

After refactoring a module:

✅ Tests pass: `npm run test` shows same or more tests passing
✅ No regressions: Same or higher coverage
✅ Error testable: Can inject ENOENT, EACCES, ENOSPC
✅ Committed: Git history shows clean refactoring commit

## Questions?

- **Architecture questions**: Read `DI_ARCHITECTURE.md`
- **How do I test X scenario**: Check `executor-fault-injection.test.ts` for examples
- **What if my module doesn't fit pattern**: Ask - there are alternatives

---

**TL;DR for the impatient**:
1. Add `constructor(private fs = new FileSystemProvider())`
2. Replace `fs.` with `this.fs.`
3. In tests, inject `new MockFileSystem(config)` instead
4. Done. Coverage improves automatically.
