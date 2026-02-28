# 🚀 Milestone 1 Kickoff: Core Streaming Interface
## Ready to Implement AsyncCommandRunner.ts

**Commit**: 07d7215 - Type architecture locked in
**Branch**: feat/v2.12.0-streaming-io
**Status**: ✅ Ready for implementation

---

## 📊 What We Just Locked In

### Type Foundation (9 files, 2,422 lines)

✅ **5 Core Type Files**
- `PlanState.ts` - SUSPENDED_FOR_PERMISSION state
- `ProcessHandle.ts` - Real-time process interaction
- `SuspendedExecutionState.ts` - Crash-proof state persistence
- `StreamingIO.ts` - Prompt detection patterns
- `ExecutorExtensions.ts` - Implementation guide

✅ **3 Documentation Files**
- `v2.12.0-roadmap.md` - Updated with 5 milestones
- `v2.12.0-type-architecture.md` - Type interactions & dependency graph
- `v2.12.0-milestone-1-implementation.md` - Code patterns & test structure

✅ **Updated**
- `src/types/index.ts` - Exports all new types

---

## 🎯 The "Prompt Detector" Circuit Breaker

This is THE solution to the "Retry Trap":

```
BEFORE v2.12.0:
npm install → hangs → auto-retry (1/3) → hangs → auto-retry (2/3) → FAILS ❌

AFTER v2.12.0:
npm install → prompt detected → SUSPEND → user responds → RESUME → SUCCESS ✅
```

**How it works**:
1. Process outputs: "proceed? (y/n)"
2. executeRun() detects prompt via `detectPrompt(data)`
3. Sets `requiresUserInput = true` immediately
4. Returns from loop → executor state = SUSPENDED_FOR_PERMISSION
5. Catch block is BYPASSED (circuit breaker!)
6. UI shows input box → user types → resume() → continue

---

## 📁 What Needs to Be Built

### Milestone 1: Core Streaming Interface
**Goal**: Implement ProcessHandle via child_process.spawn()

**Files to Create**:
- `src/services/AsyncCommandRunner.ts` (350 lines)
- `src/test/asyncCommandRunner-streaming.test.ts` (24 tests)

**Files to Modify**:
- `src/providers/ICommandRunner.ts` - Add spawn() method
- `src/providers/CommandRunnerProvider.ts` - Delegate to AsyncCommandRunner
- `src/executor.ts` - Use spawn() in executeRun()

**Tests**: 24 (covering all aspects)
- Basic streaming (6): onData, onError, onExit, order, buffering, multiple handlers
- Timeout handling (5): auto-kill, SIGTERM first, SIGKILL, configurable, exit event
- Signal handling (4): kill(), isRunning(), getExitCode(), getPID()
- Large buffers (3): 10,000 lines, memory, chunk callbacks
- Edge cases (6): empty command, ENOENT, EPERM, exit during flow, multi-kill, sendInput after exit

---

## 🔧 Implementation Roadmap

### Phase 1: AsyncCommandRunner Class (~200 lines)
```typescript
export class AsyncCommandRunner implements ICommandRunner {
  exec(command: string): Promise<...> { ... }
  spawn(command: string, options?: SpawnOptions): ProcessHandle { ... }
  private parseCommand(...) { ... }
  private setupHandlers(...) { ... }
}
```

**Key methods**:
- `spawn()` - Create ProcessHandle from child_process
- `parseCommand()` - Handle shell/args parsing
- `setupHandlers()` - Setup all event listeners

### Phase 2: Event Handler Setup (~150 lines)
```typescript
private setupHandlers(child, handle, timeout, echo) {
  // Track state
  let exited = false;
  let promptDetected = false;

  // Register callbacks
  handle.onData = (cb) => { ... }
  handle.onError = (cb) => { ... }
  handle.onExit = (cb) => { ... }
  handle.onPrompt = (cb) => { ... }

  // Setup listeners
  child.stdout.on('data', (chunk) => {
    // Check for prompt
    if (detectPrompt(chunk)) {
      promptDetected = true;
      promptCallbacks.forEach(cb => cb(chunk));
    }
    dataCallbacks.forEach(cb => cb(chunk));
  });

  child.stderr.on('data', (chunk) => {
    errorCallbacks.forEach(cb => cb(new Error(chunk)));
  });

  child.on('exit', (code) => {
    exited = true;
    exitCallbacks.forEach(cb => cb(code));
  });

  // Implement methods
  handle.sendInput = (data) => child.stdin.write(data);
  handle.kill = () => { /* SIGTERM → SIGKILL */ };
  handle.isRunning = () => !exited;
  handle.getExitCode = () => exitCode;
  handle.getPID = () => child.pid;
}
```

### Phase 3: Executor Integration (~20 lines)
```typescript
private async executeRun(step: ExecutionStep): Promise<StepResult> {
  const handle = this.commandRunner.spawn(step.command!, {
    cwd: this.config.workspace.fsPath,
    timeout: 30000
  });

  let stdout = '';
  handle.onData(data => {
    stdout += data;
    // ← CIRCUIT BREAKER ←
    if (detectPrompt(data)) {
      return { requiresUserInput: true, promptText: data, ... };
    }
  });

  return new Promise((resolve) => {
    handle.onExit(code => {
      resolve({ stepId, success: code === 0, output: stdout, ... });
    });
  });
}
```

---

## ✅ Success Criteria

**For Milestone 1 to be complete**:
- [x] Type architecture locked in (DONE)
- [ ] AsyncCommandRunner.ts created (350 lines)
- [ ] 24 tests written and passing
- [ ] ICommandRunner interface updated
- [ ] CommandRunnerProvider updated
- [ ] Executor.executeRun() uses spawn()
- [ ] All existing tests still passing (zero regressions)
- [ ] Coverage increases by +0.4% (targeting hidden Executor paths)

---

## 📊 Coverage Unlock Strategy

Milestone 1 unlocks "dark matter" in executor.ts:

**Current coverage**: 61.29% (executor.ts)
**Target**: 69.25% (+7.96%)

**Hidden paths we unlock**:
1. `executeRun()` streaming logic (new branches)
2. Signal handling paths (SIGTERM/SIGKILL)
3. Timeout escalation (5s SIGTERM wait)
4. Prompt detection branches (new conditions)
5. Stream buffer overflow protection (large data)

By testing these paths, we expose code that was previously untested.

---

## 🎯 Next Immediate Tasks

### Task 1: Implement AsyncCommandRunner.ts
**Effort**: 3-4 hours
**Complexity**: Medium (child_process, streams, signals)

```bash
# Implementation steps:
1. Create src/services/AsyncCommandRunner.ts
2. Implement spawn() method
3. Implement parseCommand() parser
4. Implement setupHandlers() event system
5. Implement ProcessHandle methods (sendInput, kill, etc.)
6. Handle all error cases
```

### Task 2: Write 24 Tests
**Effort**: 2-3 hours
**Structure**:
- Test streaming (6 tests)
- Test timeouts (5 tests)
- Test signals (4 tests)
- Test large buffers (3 tests)
- Test edge cases (6 tests)

### Task 3: Update Executor
**Effort**: 1 hour
**Changes**:
- executeRun() uses spawn() instead of exec()
- Detect prompts with detectPrompt()
- Return early when requiresUserInput = true
- Emit streaming data via onStreamData()

### Task 4: Verify Zero Regressions
**Effort**: 30 minutes
```bash
npm test # Should pass all 3,594 existing tests + 24 new ones
```

---

## 🚀 Ready to Start

Everything is locked in:
- ✅ Type definitions
- ✅ Interfaces
- ✅ Implementation patterns
- ✅ Test structure
- ✅ Coverage strategy
- ✅ Documentation

**Next step**: Implement AsyncCommandRunner.ts

**Estimated duration**: 6-8 hours (1 full day)
**Target completion**: Tomorrow
**Follow-up**: Milestone 2 (Interactive Input) immediately after

---

## 📚 Quick Reference

**Key Files**:
- Type patterns: `src/types/ProcessHandle.ts`
- Prompt detection: `src/types/StreamingIO.ts`
- Implementation guide: `docs/v2.12.0-milestone-1-implementation.md`
- Full roadmap: `docs/roadmap/v2.12.0-streaming-io.md`

**Key Patterns**:
- Spawn a process: `commandRunner.spawn(cmd, { timeout: 30000 })`
- Detect prompts: `detectPrompt(stdout)`
- Send input: `handle.sendInput(userInput + '\n')`
- Kill process: `handle.kill()` (SIGTERM → SIGKILL)

**Circuit Breaker Logic**:
```typescript
if (detectPrompt(data)) {
  // Return immediately - don't wait for exit, don't auto-retry
  return { requiresUserInput: true, promptText: data };
}
```

---

## 💡 Pro Tips

1. **Stream parsing**: Process data incrementally, not as single blob
2. **Memory safety**: Don't accumulate unlimited data - use circular buffers
3. **Signal handling**: Test SIGTERM timeout carefully (5s window)
4. **Prompt detection**: Use heuristics (ends with ?, [Y/n], etc.) + regex patterns
5. **Test isolation**: Mock child_process, don't spawn real processes in tests

---

**Status**: 🚀 Ready to implement
**Branch**: feat/v2.12.0-streaming-io
**Commit**: 07d7215 ✅

Go build! 🎯
