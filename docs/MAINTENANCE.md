# 🛠️ Maintenance: CI Hardening & Async Reliability Guide

This document serves as the "Source of Truth" for the high-integrity asynchronous patterns used in the `llm-local-assistant`. To maintain our **81.4% Diamond Tier** coverage and 100% CI pass rate, all future contributions to the `AsyncCommandRunner` or I/O-heavy services must adhere to these deterministic patterns.

---

## 🏛️ The Three Pillars of Async Stability



### 1. Process Lifecycle vs. Pipe I/O (The "Event Ordering" Fallacy)
**The Rule**: Never assume the `exit` event means all stdout/stderr data has been received.

* **The Problem**: On multi-core Linux kernels (CI), `waitpid()` (which triggers the `exit` event) and pipe `read()` (which triggers `onData`) are independent syscalls. A process can be reaped and "exit" before the OS has finished flushing the pipe buffer to Node.js.
* **The Solution**: For data-dependent assertions, use **State-Driven Polling** (`waitFor(() => data.includes(...))`) instead of event-based assertions. This waits for the "truth" (the data) rather than a "proxy" (the exit signal).

### 2. Atomic Subscription & Event Sourcing (Replay Buffers)
**The Rule**: Use Replay Buffers to eliminate "Too-Late" callback registration.

* **The Problem**: High-speed processes (like `echo`) can spawn, execute, and exit in a fraction of a millisecond—sometimes faster than the JS thread moves from the `spawn()` line to the `.onData()` line.
* **The Solution**: The `AsyncCommandRunner` uses an **Event Sourcing** pattern. All `stdout`, `stderr`, and `exit` events are captured in internal `ReplayBuffers`. When a callback is registered, the runner synchronously replays the history, ensuring zero data loss even if the process is already dead.



### 3. Cross-Platform Determinism (Node-as-Shell)
**The Rule**: Avoid shell built-ins (`echo`, `read`, `for`) in test suites.

* **The Problem**: `read -p` writes to `stderr` on Linux but `stdout` on macOS, and fails on Windows. Simple loops behave differently in `cmd.exe` vs `bash`.
* **The Solution**: Use **`node -e "<script>"`**. Since this is a Node.js project, the runtime is guaranteed to be present and behave identically across all CI runners (Ubuntu, macOS, Windows).

---

## 🔍 Common "Ghost" Bugs & Proven Fixes

| Symptom | Probable Cause | The Diamond Tier Fix |
| :--- | :--- | :--- |
| **Test hangs forever in CI** | Orphaned child processes holding pipes open. | Switch from `close` event to **`exit` event**. |
| **Empty output string (`''`)** | Assertions ran before the kernel flushed the pipe. | Use **`waitFor()` polling** or `setImmediate()`. |
| **Exit code 0 (expected 42)** | Double-shell wrapping in `spawn`. | Return **raw command string** when `shell: true`. |
| **Intermittent CI Timeouts** | Shared runner CPU throttling/variance. | Relax thresholds (e.g., **200ms instead of 100ms**). |

---

## 📊 Infrastructure Status



* **Total Test Count**: 3600
* **Determinism**: 100% (Verified on Node 18.x / 20.x)
* **Global Coverage**: 81.4% (Threshold-locked in `vitest.config`)
* **Architecture**: Layer-validated via `ArchitectureValidator`

---

## 🚀 Adding New Tests
When adding new streaming tests, follow this template to avoid flakiness:

```typescript
it('should be deterministic', async () => {
  let output = '';
  const handle = runner.spawn('node -e "console.log(\'valid\')"');
  
  // 1. Register immediately
  handle.onData(c => output += c);

  // 2. Poll for the STATE change, not just the event
  await waitFor(() => output.includes('valid'), 3000);

  expect(output).toContain('valid');
});