# Future Roadmap: LLM Local Assistant v0.1+ (Phases 2-7)

**Document Purpose**: This is the **future development roadmap** for extending LLM Local Assistant beyond Phase 1. Use this as context/prompts when starting new feature projects.

**Current Status**: Phase 1 (MVP) is complete and shipped. These phases represent the long-term vision.

**Target Timeline**: Q1 2025 onwards (separate projects/phases)

---

## Phase 2: Agent Loop Foundation (Q1 2025)

**Goal**: Implement autonomous multi-step task execution with planning and error correction.

**Estimated Effort**: 10-15 person-days

### 2.1 Think-Act-Observe-Correct Loop

#### Planning Module
- [ ] Analyze complex user requests and generate structured action plans
- [ ] Break tasks into logical, atomic steps
- [ ] Generate plans as JSON with step dependencies
- [ ] Maintain progress tracking and checkpoint recovery

**Example**:
```
User: "Create a React component for user authentication with tests"
↓
Plan: [
  { step: 1, action: "read", path: "src/types/User.ts" },
  { step: 2, action: "read", path: "src/services/auth.ts" },
  { step: 3, action: "write", path: "src/components/Login.tsx", description: "Create login form" },
  { step: 4, action: "write", path: "src/components/__tests__/Login.test.tsx", description: "Add tests" },
  { step: 5, action: "run", command: "npm test" }
]
```

#### Execution Engine
- [ ] Command queue system for sequential execution
- [ ] Step-by-step execution tracker with logging
- [ ] Rollback capabilities for failed operations
- [ ] Transaction-like semantics (all-or-nothing commits)

#### Observation System
- [ ] Capture file I/O results (success/failure)
- [ ] Parse terminal output (stdout/stderr)
- [ ] Extract compilation errors with context
- [ ] Analyze test failures
- [ ] Validate LLM outputs against expectations

#### Correction Mechanism
- [ ] Classify error types (syntax, logic, runtime, etc.)
- [ ] Generate context-aware retry logic
- [ ] Auto-fix common issues (missing imports, type errors)
- [ ] Implement fallback strategies

### 2.2 Extended File Operations

#### Multi-file Editing
- [ ] Support batch file operations (generate multiple files from one prompt)
- [ ] Transaction-like semantics (all files succeed or all fail)
- [ ] File dependency tracking (e.g., config → service → component)
- [ ] Dependency-aware generation order

#### Advanced `/write` Command
```bash
/write --batch path1.ts path2.ts path3.ts "Generate a user service with tests"
/write --function User.greet "Add a greeting method"
/write --test src/services/auth.ts "Add comprehensive test suite"
```

#### Code Awareness in `/read`
```bash
/read --function UserService.login "Show just the login method"
/read --imports "Show all imports in this file"
/read --dependencies "Show what this file depends on"
```

### 2.3 Build System Integration

#### Terminal Command Support
```bash
/run npm test                    # Execute arbitrary commands
/build                           # Trigger project build
/test                            # Run test suite
/lint                            # Run linter
/format                          # Run formatter
```

#### Build Result Analysis
- [ ] Capture stdout/stderr from processes
- [ ] Parse TypeScript compiler errors
- [ ] Extract Jest/Mocha test failures
- [ ] Parse ESLint/Prettier output
- [ ] Link errors back to source files

**Prompt Generation Example**:
```
Build failed with error:
  src/index.ts:5:10 - error TS2339: Property 'foo' does not exist on type 'Bar'

LLM Prompt: "Fix this TypeScript error in src/index.ts by adding the missing 'foo' property"
```

---

## Phase 3: Agent Intelligence (Q2 2025)

**Goal**: Make agents smarter about diagnosing and fixing their own mistakes.

**Estimated Effort**: 8-12 person-days

### 3.1 Error Analysis & Auto-Correction Loop

#### Compiler Error Understanding
- [ ] Parse TypeScript, JSX, Python, Go error formats
- [ ] Extract error location, message, and suggestions
- [ ] Build context around errors (surrounding code)
- [ ] Suggest LLM fixes with high confidence

#### Runtime Error Debugging
- [ ] Capture stack traces and format them
- [ ] Link stack trace frames to source code
- [ ] Extract variable state from logs
- [ ] Generate debugging prompts for LLM

#### Test-Driven Correction
- [ ] Run tests after each modification
- [ ] Parse test failures (Jest, Mocha, pytest, etc.)
- [ ] Generate targeted fixes (e.g., "Test expects X but got Y")
- [ ] Retry until tests pass (with max retry limits)

### 3.2 Context Awareness

#### Workspace Analysis & Indexing
- [ ] Index all workspace files on startup
- [ ] Build dependency graph (what imports what)
- [ ] Identify related code patterns and conventions
- [ ] Suggest relevant context files for prompts

#### Codebase Understanding
- [ ] Extract function signatures
- [ ] Build symbol table (classes, interfaces, types)
- [ ] Detect code patterns (e.g., this project uses Zod for validation)
- [ ] Auto-include relevant context in LLM prompts

**Smart Context Example**:
```
User: "Add a new user endpoint"

Agent Context:
- Identifies: "This is a Node.js/Express project"
- Finds: Existing endpoints in src/routes/
- Includes: User type from src/types/
- Suggests: Follow the same error handling pattern
- Recommends: Add tests in __tests__/ directory
```

### 3.3 Plan Mode UI

#### Plan Generation & Display
- [ ] Generate plans as JSON with descriptions
- [ ] Display plan in webview with checkboxes
- [ ] Show step descriptions and estimated time
- [ ] Allow users to edit/approve/reject plans

#### Plan Refinement
- [ ] Track which steps succeed/fail
- [ ] Learn from past executions
- [ ] Adjust future plans based on failures
- [ ] Suggest alternative approaches when stuck

---

## Phase 4: VS Code Deep Integration (Q3 2025)

**Goal**: Native VS Code workflows (command palette, editor selections, problem panel).

**Estimated Effort**: 10-14 person-days

### 4.1 Native VS Code Commands

#### Command Palette Integration
```bash
Cmd+Shift+P → "LLM: Refactor Selected Code"
Cmd+Shift+P → "LLM: Add Documentation"
Cmd+Shift+P → "LLM: Optimize Performance"
Cmd+Shift+P → "LLM: Check Security"
```

#### Editor Actions
- [ ] Context menu: "Ask LLM about this..."
- [ ] Inline quick fixes from LLM (lightbulb icon)
- [ ] Selection-aware prompts (LLM knows what's selected)
- [ ] Multi-cursor support

### 4.2 Problem Panel Integration

#### Error Collection & Auto-Fix
- [ ] Parse VS Code's Problem Panel
- [ ] Auto-run LLM on new errors
- [ ] Display fixes inline (CodeLens)
- [ ] Apply fixes with one-click approval

#### Continuous Improvement Loop
- [ ] Fix errors as they appear (while typing)
- [ ] Validate fixes with linter
- [ ] Iterate until problems panel is clean

### 4.3 Debug Integration

#### Debugger Control via LLM
- [ ] Set breakpoints from LLM suggestions
- [ ] Step through code via agent commands
- [ ] Watch expressions and variable state
- [ ] Pause automatically on errors

---

## Phase 5: MCP & Tool Integration (Q4 2025)

**Goal**: Connect to external tools via Model Context Protocol (MCP).

**Estimated Effort**: 12-16 person-days

### 5.1 Model Context Protocol (MCP) Server

#### MCP Server Implementation
- [ ] Create MCP server wrapper around extension
- [ ] Expose workspace tools to compatible LLM clients
- [ ] Implement tool registry pattern
- [ ] Support tool parameter validation

#### Built-in Tools
- **File System**: `read_file`, `write_file`, `list_directory`, `delete_file`
- **Terminal**: `execute_command`, `get_working_directory`, `change_directory`
- **Git**: `git_status`, `git_diff`, `git_commit`, `git_log`
- **Package Manager**: `npm_install`, `npm_run`, `pip_install`
- **Analysis**: `grep`, `find`, `analyze_imports`

### 5.2 External Service Integration

#### Database Tools (Optional)
- [ ] SQL query execution
- [ ] Schema introspection
- [ ] Migration verification

#### Cloud Tools (Optional)
- [ ] AWS CLI integration
- [ ] Deployment verification
- [ ] Status checking

#### Custom Script Tools
- [ ] Register custom executables
- [ ] Pass LLM output to scripts
- [ ] Capture script results

---

## Phase 6: Mission Control UI (Q1 2026)

**Goal**: Advanced task tracking, multi-agent support, and user control.

**Estimated Effort**: 10-12 person-days

### 6.1 Task Management Panel

#### Visual Task Tracking
- [ ] Real-time progress display with status updates
- [ ] Step-by-step breakdown with descriptions
- [ ] Success/failure indicators with error details
- [ ] Complete action history and logs

#### User Control
- [ ] Pause/resume agent execution mid-task
- [ ] Skip individual steps
- [ ] Manual intervention points
- [ ] Edit plan on-the-fly

### 6.2 Multi-Agent Support

#### Background Agents
- [ ] Run long-running tasks in background
- [ ] Notification on completion
- [ ] Switch between multiple running agents
- [ ] Task priority/queue management

#### Specialized Sub-Agents
- **Test Agent**: Test-driven development workflows
- **Refactor Agent**: Code modernization and cleanup
- **Documentation Agent**: Generate docs, comments, type definitions
- **Security Agent**: Vulnerability scanning, fixes, best practices

---

## Phase 7: Enterprise Features (2026+)

**Goal**: Team collaboration, workflow automation, and specialized agents.

**Estimated Effort**: Variable (ongoing)

### 7.1 Advanced Capabilities

#### Workflow Automation
- [ ] Predefined workflows for common tasks (create-react-app, setup CI/CD, etc.)
- [ ] Custom workflow creation and sharing
- [ ] Workflow scheduling and triggers
- [ ] Workflow marketplace

#### Team Collaboration
- [ ] Shared configuration across team
- [ ] Audit logging (who ran what, when)
- [ ] Change approval workflows
- [ ] Code review integration

### 7.2 Specialized Agents

#### Domain-Specific Agents
- **Frontend Agent**: React, Vue, Angular, Svelte patterns and best practices
- **Backend Agent**: Node.js, Python, Go, Rust backend patterns
- **DevOps Agent**: Docker, Kubernetes, CI/CD pipelines
- **DBA Agent**: Database schema design, migration strategies

---

## Technical Deep Dive

### Agent Loop Architecture

```
┌─────────────────────────────────────────────────────┐
│                  User Task                          │
│         "Create a login component with tests"      │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  THINK: Planner Module                              │
│  - Analyze task requirements                        │
│  - Generate structured plan (JSON)                  │
│  - Identify dependencies                            │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
    ┌────────────────────────────────────┐
    │  ACT: Execute Step                 │
    │  - Run command/file operation      │
    │  - Capture result                  │
    └────────────┬───────────────────────┘
                 │
                 ▼
    ┌────────────────────────────────────┐
    │  OBSERVE: Analyze Result           │
    │  - Check for errors                │
    │  - Extract error details           │
    │  - Validate output                 │
    └────────────┬───────────────────────┘
                 │
         ┌───────┴────────┐
         │                │
        YES              NO
    (Success)          (Error)
         │                │
         │                ▼
         │     ┌────────────────────────────┐
         │     │  CORRECT: Correction Loop  │
         │     │  - Classify error type     │
         │     │  - Generate fix prompt     │
         │     │  - Retry with fix          │
         │     └────────────┬───────────────┘
         │                  │
         │         ┌────────┴──────────┐
         │         │                   │
         │        YES                 NO
         │     (Fixed)             (Still Error)
         │         │                   │
         ▼         ▼                   ▼
    ┌──────────────────────────────────────────┐
    │  Next Step or Complete                   │
    └──────────────────────────────────────────┘
```

### Data Flow Example

```typescript
// User submits complex task
const task = "Create a REST API endpoint for user profile with validation and tests";

// Phase 2: Planning
const plan = await agent.generatePlan(task);
// Result:
[
  { step: 1, action: "read", target: "src/types/User.ts" },
  { step: 2, action: "write", target: "src/routes/profile.ts", 
    prompt: "Create GET /profile endpoint with auth validation" },
  { step: 3, action: "write", target: "src/__tests__/profile.test.ts", 
    prompt: "Add integration tests for profile endpoint" },
  { step: 4, action: "run", command: "npm test" },
  { step: 5, action: "run", command: "npm run lint" }
]

// Phase 2: Execution
for (const step of plan) {
  const result = await executor.execute(step);
  
  if (!result.success) {
    // Phase 3: Correction
    const fix = await corrector.generateFix(result.error, context);
    await executor.execute(fix);
  }
}
```

### Error Classification System

```typescript
enum ErrorType {
  // Syntax errors
  SYNTAX_ERROR = "syntax",
  TYPE_ERROR = "type",
  
  // Runtime errors
  RUNTIME_ERROR = "runtime",
  UNDEFINED_VARIABLE = "undefined",
  NULL_REFERENCE = "null_ref",
  
  // Test errors
  ASSERTION_FAILED = "assertion",
  TEST_TIMEOUT = "timeout",
  
  // Build errors
  COMPILATION_FAILED = "compile",
  MISSING_DEPENDENCY = "missing_dep",
  
  // File errors
  FILE_NOT_FOUND = "not_found",
  PERMISSION_DENIED = "permission",
  
  // Logic errors
  LOGIC_ERROR = "logic",
  INCORRECT_OUTPUT = "incorrect_output"
}

// Auto-repair strategies by error type
const repairStrategies = {
  [ErrorType.SYNTAX_ERROR]: "Fix syntax - regenerate with correct grammar",
  [ErrorType.TYPE_ERROR]: "Add missing type annotations or cast",
  [ErrorType.UNDEFINED_VARIABLE]: "Add variable declaration with import",
  [ErrorType.MISSING_DEPENDENCY]: "Add to package.json and install",
  [ErrorType.ASSERTION_FAILED]: "Analyze test expectation and fix logic",
  // ... etc
};
```

---

## Success Metrics

- **Phase 2**: Multi-step tasks execute 60%+ without user intervention
- **Phase 3**: Auto-correction resolves 80% of encountered errors
- **Phase 4**: Agents handle common refactoring tasks autonomously
- **Phase 5**: External tool integration enables complex multi-service workflows
- **Phase 6**: Users manage 5+ concurrent tasks with full control
- **Phase 7**: Enterprise teams adopt for CI/CD and workflow automation

---

## Technical Challenges & Mitigations

| Challenge | Impact | Mitigation |
|-----------|--------|-----------|
| Error classification accuracy | Low accuracy = bad fixes | Extensive error patterns database, manual validation |
| Context window limits | Can't see all code | Compression, smart selection, summarization |
| Rollback safety | Multi-file ops can corrupt | Use Git, create backups, test rollback |
| Terminal command safety | Malicious commands possible | Command whitelist, sandboxing, audit logs |
| Performance with large files | Slow indexing/analysis | Incremental indexing, caching, lazy loading |

---

## How to Use This Document

### Starting a Phase 2 Project
1. Read the "Phase 2: Agent Loop Foundation" section
2. Review the "Agent Loop Architecture" section
3. Start with 2.1 (Think-Act-Observe-Correct)
4. Use examples as starting points

### Starting a Phase 3+ Project
1. Read the relevant phase section
2. Review technical deep dive sections
3. Check success metrics and blockers
4. Plan incrementally

### For New Contributors
- Pick a specific subsection (e.g., "Observation System")
- Reference the architecture diagrams
- Check error classification examples
- Test against Phase 1 (foundation is stable)

---

## Integration Points with Phase 1

- **LLMClient**: Use existing streaming/non-streaming methods
- **File Operations**: Extend existing `/read`, `/write` logic
- **Error Handling**: Reuse error propagation patterns
- **UI**: Extend webview with plan display, progress tracking
- **Configuration**: Add new settings for agent behavior, timeouts, retries

---

## Questions for Future Developers

1. **Should error correction be automatic or user-approved?**
   - Recommended: User-approved for Phase 2, auto with confidence scores in Phase 3+

2. **How many retries before giving up?**
   - Suggested: 3 retries, escalate to user on 4th attempt

3. **Should plans be persisted or ephemeral?**
   - Recommended: Ephemeral in v0.1, persist for analytics in v0.2+

4. **How to handle file conflicts (multiple operations on same file)?**
   - Suggested: Queue operations, validate dependencies, atomic commits

5. **Should MCP server be in same codebase or separate?**
   - Recommended: Separate module/package for maintainability

---

**Last Updated**: November 2025  
**Next Review**: When Phase 2 development begins

---

## References

- [GitHub Copilot Agent Mode Docs](https://github.blog/copilot-agent-mode)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [VS Code Extension API](https://code.visualstudio.com/api)
- Phase 1 code: `src/extension.ts`, `src/llmClient.ts`, `src/webviewContent.ts`
