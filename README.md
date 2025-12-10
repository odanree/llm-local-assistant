# LLM Local Assistant - VS Code Extension

A powerful VS Code extension that brings autonomous AI agent capabilities to your local machine. Break down complex tasks into structured multi-step plans, execute them automatically, and stay in control with the ability to review and reject plans before execution.

> **Latest Release**: v1.1.1 - Phase 2 Core Features Complete ✨  
> 📚 **Contributing**: See [CONTRIBUTING.md](https://github.com/odanree/llm-local-assistant/blob/main/CONTRIBUTING.md) for development guide.

## ✨ Key Features

**🧠 Autonomous Planning** (Phase 2 - NEW!)
- Break complex tasks into structured multi-step plans
- Review plans before execution
- Automatic error recovery with retry logic

**🤖 Agent Mode Commands**
- `/plan <task>` - Generate multi-step action plans with LLM
- `/approve` - Execute approved plans sequentially
- `/reject` - Discard plans without execution
- `/read <path>` - Read files from workspace
- `/write <path>` - Generate and write file content
- `/git-commit-msg` - Generate conventional commit messages
- `/git-review` - AI-powered code review of staged changes

**💻 Local & Private**
- 🔒 Works with Ollama, LM Studio, vLLM - no external APIs
- 🚀 Fast local LLM inference with streaming support
- ⚙️ Fully configurable (endpoint, model, temperature, timeout)
- 💬 Conversation context maintained per session
- ✅ Production-ready with comprehensive error handling

## 📊 Project Status & Version History

### Latest: v1.1.1 (December 2025) - Phase 2 Complete ✅

**Phase 2: Multi-Step Planning & Autonomous Execution**
- ✅ **Planner Module** - LLM-based task decomposition into structured plans
- ✅ **Executor Module** - Sequential execution with automatic retry (up to 2 attempts per step)
- ✅ **Observer System** - Real-time progress tracking
- ✅ **Error Recovery** - Intelligent error handling with helpful feedback
- ✅ **32+ Unit Tests** - >85% code coverage
- ✅ **Full Type Safety** - TypeScript strict mode, 0 errors
- ✅ **Backward Compatible** - All v1.0 commands unchanged

**Phase 1 Foundation (v1.0.0):**
- 💬 Local LLM chat with streaming support
- 📁 File operations (read, write, suggestwrite)
- 🔀 Git integration (commit messages, code review)
- 🔒 100% private, offline-first design
- 92 unit tests with 100% pass rate

### What's New in Phase 2

**Autonomous Planning & Execution Workflow:**
1. Describe a task: `/plan create a React component with tests`
2. Review the plan: See breakdown of steps (read, generate, write)
3. Approve execution: `/approve` to run all steps sequentially
4. Monitor progress: Real-time status for each step
5. Handle errors: Automatic retry or manual investigation

**Real-World Use Cases:**
- 🚀 Refactoring modules (analyze, generate, test, verify)
- 📝 Generating documentation (read code, analyze, write docs)
- 🏗️ Creating project structures (multiple files, configs, tests)
- 🔄 Multi-step code transformations (analyze, plan, execute)

---

## 📸 Workflow Screenshots

### 1. Planning View - Multi-Step Decomposition
![Phase 2 Planning](https://github.com/odanree/llm-local-assistant/raw/main/assets/phase2-planning.png)

*Shows `/plan` command breaking down a task:*
- *LLM analyzes request and creates structured plan*
- *Step-by-step action breakdown (read, write operations)*
- *Detailed descriptions for each step*
- *Ready for approval: `/approve` to execute*

### 2. Plan Steps - Review Before Execution
![Phase 2 Plan Steps](https://github.com/odanree/llm-local-assistant/raw/main/assets/phase2-plan-steps.png)

*Shows the generated plan ready for review:*
- *Multi-step action sequence (typically 2-5 steps)*
- *Each step shows action, path, and description*
- *User controls: `/approve` to execute or `/reject` to cancel*
- *Transparent decision point before running*

### 3. Execution View - Real-Time Progress
![Phase 2 Execution](https://github.com/odanree/llm-local-assistant/raw/main/assets/phase2-execution.png)

*Shows `/approve` executing the plan:*
- *Step-by-step execution with real-time status*
- *Progress indicator (Step X of Y)*
- *Step output and results displayed inline*
- *Automatic error recovery with retry logic*

### 4. Error Recovery - Automatic Retry Handling
![Phase 2 Error Recovery](https://github.com/odanree/llm-local-assistant/raw/main/assets/phase2-error-recovery.png)

*Shows error handling and recovery:*
- *Step failure detection with clear error message*
- *Automatic retry mechanism triggered (up to 2 attempts)*
- *Detailed error information for troubleshooting*
- *User has control to proceed or abort*

### 5. Completed Workflow - Results Summary
![Phase 2 Workflow Complete](https://github.com/odanree/llm-local-assistant/raw/main/assets/phase2-complete.png)

*Shows successful plan completion:*
- *Summary of completed steps*
- *Files created and modifications made*
- *Ready for next task or manual review*
- *Full chat history maintained*

### 6. Git Integration - Autonomous Commit Messages
![Git Integration](https://github.com/odanree/llm-local-assistant/raw/main/assets/git-integration.png)

*Shows Phase 1 git integration commands:*
- *`/git-commit-msg` analyzing staged changes*
- *AI-generated conventional commit message*
- *Professional message format ready to use*
- *Can also use `/git-review` for code analysis*

---

## 📋 Prerequisites

### Local LLM Server (Required)

You need one of:

**Ollama** (Recommended)
```bash
ollama run mistral
# Server at: http://localhost:11434
```

**LM Studio**
- Download: https://lmstudio.ai
- Start local server on: http://localhost:8000

**vLLM**
```bash
python -m vllm.entrypoints.openai.api_server \
  --model mistral-7b-instruct-v0.2 \
  --port 11434
```

## 🚀 Getting Started

### Quick Install (One Command)

**From VS Code Marketplace (Easiest):**
```bash
code --install-extension odanree.llm-local-assistant
```

Or search for "LLM Local Assistant" in VS Code Extensions marketplace: https://marketplace.visualstudio.com/items?itemName=odanree.llm-local-assistant

**See [docs/INSTALL.md](https://github.com/odanree/llm-local-assistant/blob/main/docs/INSTALL.md) for detailed platform-specific setup, troubleshooting, and development instructions.**

## 🚀 Development & Building

### Build
```bash
npm run compile        # Single build
npm run watch         # Auto-rebuild on changes
npm run package       # Production VSIX package
```

### Testing
```bash
npm test              # Run all 120+ tests
npm run test:watch   # Auto-run on changes
npm run test:coverage # Coverage report
```

### Debug
```bash
# Launch in VS Code debug mode
F5

# Then interact with extension:
- Type messages to chat
- Use /plan, /approve, /reject
- Check console for debug output
```

### Source Code Structure
```
src/
├── extension.ts           # Command routing, UI orchestration
├── planner.ts            # Plan generation with thinking phase
├── executor.ts           # Step execution with retry logic
├── llmClient.ts          # LLM API abstraction
├── gitClient.ts          # Git operations
├── webviewContent.ts     # Chat UI HTML/CSS/JS
├── *.test.ts             # 120+ unit tests
└── vitest.setup.ts       # Test configuration
```

---

#### System
- **`/help`** - Show available commands
  ```
  /help
  ```

## 🤖 Phase 2 Commands Guide

### Planning & Execution

#### `/plan <task>`
**Analyze a task and create a structured multi-step plan**

```
You: /plan create a React component with unit tests

LLM: 📋 **Plan Created** (5 steps, 8.3s thinking)

STEP 1: read
  Read example React components to understand style

STEP 2: write  
  Generate TypeScript React component with hooks

STEP 3: write
  Generate Jest unit tests for component

STEP 4: run
  Execute npm test to verify tests pass

STEP 5: write
  Create documentation for component

Ready to execute? Use **/approve** or **/reject**
```

**What it does:**
- Uses LLM thinking phase to analyze your request
- Breaks task into 3-10 atomic steps
- Each step is one of: `read`, `write`, `run`, or `suggestwrite`
- Generates step descriptions explaining the action

#### `/approve`
**Execute the current plan step-by-step**

```
You: /approve

LLM: ⚙️ **Executing Plan** (5 steps)

✅ STEP 1: read (127ms)
   Read example React components

✅ STEP 2: write (3.2s)
   Generated MyComponent.tsx (284 lines)

✅ STEP 3: write (2.1s)
   Generated MyComponent.test.tsx (156 lines)

⚠️ STEP 4: run (1.8s)
   npm test - Retry 1 of 2
   ✅ Retry succeeded, tests pass

✅ STEP 5: write (890ms)
   Generated COMPONENT.md

✅ **Plan completed successfully** (7.9 seconds)
```

**Features:**
- Executes steps sequentially
- Automatic retry (up to 2 times) on step failure
- Real-time progress with elapsed time
- Shows output for each step
- Continues on success, stops on unrecoverable error

#### `/reject`
**Discard the current plan without executing**

```
You: /reject

LLM: ❌ Plan discarded. What would you like to do?
```

---

### File Operations (Phase 1 - Still Available)

#### `/read <path>`
```
/read src/main.ts
```
Read and display file contents with syntax highlighting.

#### `/write <path> [prompt]`
```
/write src/greeting.ts write a TypeScript function that greets users with their name
```
Generate file content via LLM and write to disk.

#### `/suggestwrite <path> [prompt]`
```
/suggestwrite src/config.ts add validation for the API endpoint
```
LLM suggests changes, you review the diff before writing.

---

### Git Integration (Phase 1 - Still Available)

#### `/git-commit-msg`
**Generate conventional commit message from staged changes**
```
/git-commit-msg
```

Analyzes all staged diffs and generates a message following the pattern:
```
<type>(<scope>): <description>

[optional body with detailed changes]
```

#### `/git-review`
**AI-powered code review of staged changes**
```
/git-review
```

Reviews staged changes and provides:
- Potential issues or bugs
- Code quality suggestions
- Security considerations
- Style recommendations

## 🏗️ Architecture & Design

### Why This Design?

**Three-Module Agent Loop**
```
User Request
    ↓
[PLANNER] → Breaks task into structured steps
    ↓
[REVIEW] → You see plan, decide to approve/reject
    ↓
[EXECUTOR] → Runs steps sequentially with retry
    ↓
[OBSERVER] → Monitors progress, provides feedback
```

**Key Design Decisions:**

1. **Planner → Executor Separation**
   - You always review before execution
   - Plan can be rejected without side effects
   - Clear visibility into what will happen

2. **Sequential Execution with Retry**
   - Each step runs to completion before next
   - Automatic retry (up to 2 times) on failure
   - Stops on unrecoverable errors

3. **Observable Progress**
   - Real-time output for each step
   - Elapsed time and performance metrics
   - Detailed error messages guide investigation

4. **Atomic Steps**
   - Each step is one of: read, write, run, suggestwrite
   - No partial execution or rollback needed
   - Simple state management

### Module Responsibilities

**Planner** (`src/planner.ts` - 366 lines)
- Analyzes user task
- Generates execution plan as JSON
- Validates steps are valid action types
- Returns readable plan summary

**Executor** (`src/executor.ts` - 503 lines)
- Executes steps sequentially
- Implements each action type (read, write, run)
- Handles errors and retries
- Provides progress callbacks for UI

**Extension** (`src/extension.ts` - 385 lines)
- Routes commands to Planner/Executor
- Manages webview chat UI
- Handles approval/rejection UI
- Orchestrates the agent loop

### Error Handling & Recovery

**Automatic Retry Pattern**
```typescript
for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    return await executeStep(step);
  } catch (error) {
    if (attempt === maxRetries) throw error;
    logRetry(step, attempt, error);
  }
}
```

**Error Categories & Handling**
- **Transient** (retry): Network timeouts, temporary file locks
- **Unrecoverable** (stop): File not found, syntax errors, permissions
- **Information** (continue): Warnings logged but execution continues

**Error Message Strategy**
- Always show specific error details
- Suggest corrective actions (💡 prefix)
- Include affected file paths and line numbers

## 🎯 Use Cases & Examples

### Example 1: Refactor Module with Tests
```
You: /plan refactor src/auth.js to use async/await and add comprehensive tests

LLM Creates Plan:
  1. Read src/auth.js (analyze current implementation)
  2. Write src/auth.js (generate refactored async/await version)
  3. Write src/auth.test.js (generate test suite)
  4. Run npm test (verify tests pass)
  5. Write docs/REFACTOR.md (document changes)

You: /approve
→ 5 steps execute in 12.4 seconds
→ All tests pass
→ Documentation created
```

### Example 2: Generate Project Structure
```
You: /plan create a new TypeScript project structure for an Express API

LLM Creates Plan:
  1. Read examples/project-template (reference structure)
  2. Write src/index.ts (create main server file)
  3. Write src/routes/api.ts (create API routes)
  4. Write src/middleware/auth.ts (create auth middleware)
  5. Write tests/api.test.ts (create tests)
  6. Write README.md (create documentation)

You: /approve
→ Complete project scaffolding in seconds
```

### Example 3: Implement Feature with Documentation
```
You: /plan add a rate-limiting feature to the API

LLM Creates Plan:
  1. Read current middleware structure
  2. Write src/middleware/rateLimit.ts (implementation)
  3. Write docs/RATE_LIMITING.md (docs)
  4. Write tests/rateLimit.test.ts (tests)

You: /approve
→ Feature fully implemented with tests and docs
```

---

## 📦 Installation & Configuration

### Quick Start

1. **Start your LLM server**
   ```bash
   # Ollama (recommended)
   ollama run mistral
   
   # LM Studio
   # Open LM Studio → Select model → Start local server
   
   # vLLM
   python -m vllm.entrypoints.openai.api_server --model mistral-7b
   ```

2. **Install extension**
   - Open VS Code Extensions (Ctrl+Shift+X)
   - Search "LLM Local Assistant"
   - Click Install

3. **Configure endpoint** (if not using defaults)
   - Open VS Code Settings (Ctrl+,)
   - Set `llm-assistant.endpoint`: `http://localhost:11434`
   - Set `llm-assistant.model`: `mistral`

4. **Test connection**
   - Click **LLM Assistant** in status bar
   - Run "Test Connection" command
   - ✅ Should show "Connection successful"

See [docs/INSTALL.md](docs/INSTALL.md) for platform-specific setup.

### Configuration Reference

| Setting | Default | Description |
|---------|---------|-------------|
| `llm-assistant.endpoint` | `http://localhost:11434` | LLM server URL |
| `llm-assistant.model` | `mistral` | Model name to use |
| `llm-assistant.temperature` | `0.7` | Response randomness (0-1) |
| `llm-assistant.maxTokens` | `2048` | Max response length |
| `llm-assistant.timeout` | `60000` | Request timeout (ms) |

### Supported LLM Servers

| Server | Endpoint | Setup |
|--------|----------|-------|
| **Ollama** | `http://localhost:11434` | `ollama run mistral` |
| **LM Studio** | `http://localhost:8000` | Start local server in UI |
| **vLLM** | `http://localhost:8000` | Python server |
| **OpenAI Compatible** | Custom URL | Any OpenAI-compatible endpoint |

---

## ✅ Quality & Testing

### Test Coverage
- **120+ unit tests** covering all core functionality
- **>85% code coverage** on Planner and Executor modules
- **100% pass rate** on every commit
- Tests run on: Linux, macOS, Windows

**Coverage by Module:**
- `planner.ts`: 17 tests
- `executor.ts`: 15 tests  
- `extension.ts`: 36 tests
- `llmClient.ts`: 33 tests
- `gitClient.ts`: 23 tests

### Type Safety
- **TypeScript strict mode** enabled
- **Zero type errors** in entire codebase
- **Explicit types** on all public APIs
- **JSDoc comments** on all modules

### Error Handling
- **Specific error detection** - Different handling for timeouts, not-found, permission errors
- **User-friendly messages** - Technical details only shown for debugging
- **Automatic retry logic** - Up to 2 retries for transient failures
- **Timeout handling** - Clean cancellation with AbortController

### Code Quality
- **100% ESLint compliant** - Clean code standards enforced
- **Clean git history** - 30+ atomic commits showing development progression
- **Comprehensive documentation** - Every module documented with architecture rationale

---

## 🔒 Privacy & Security

### 100% Local & Private
✅ **No external APIs** - Works completely offline with local LLM  
✅ **No cloud services** - Zero dependencies on external infrastructure  
✅ **No telemetry** - No tracking, analytics, or data collection  
✅ **No internet required** - After model download, works completely offline  
✅ **Your code stays private** - Never sent to external servers  

**How it works:**
1. Your LLM server runs on your machine (Ollama, LM Studio, vLLM)
2. Extension sends requests to local server only
3. All responses processed locally in VS Code
4. Your code, conversations, and tasks never leave your machine

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| **[README.md](README.md)** (this file) | Overview, features, quick start |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Deep dive into design and modules |
| **[PROJECT_STATUS.md](PROJECT_STATUS.md)** | Current development status |
| **[ROADMAP.md](ROADMAP.md)** | Future features and phases |
| **[CHANGELOG.md](CHANGELOG.md)** | Version history |
| **[CONTRIBUTING.md](CONTRIBUTING.md)** | Developer guide |

**Phase 2 Deep Dives:**
- `docs/PHASE2_GUIDE.md` - Complete Phase 2 specification
- `docs/PHASE2_INTEGRATION.md` - Integration architecture
- `docs/EXTENSIBILITY_ANALYSIS.md` - Extension patterns and examples

---

## 🐛 Troubleshooting

### Connection Issues

**"Cannot connect to endpoint"**
- Verify LLM server running: `ollama serve` or LM Studio UI
- Check endpoint in settings: `llm-assistant.endpoint`
- Test connection: Click status bar → "Test Connection"
- Check firewall: Port 11434 (Ollama) or 8000 (LM Studio) accessible?

**"Model not found"**
- List available models: `ollama list`
- Download if needed: `ollama pull mistral`
- Update settings: `llm-assistant.model: mistral`

### Performance Issues

**"Requests timing out"**
- Increase `llm-assistant.timeout` (default 60000ms)
- Check server resources: CPU, RAM, disk space
- Try smaller model: `ollama run tinyllama` instead of mistral

**"Very slow responses"**
- Use smaller model: `ollama pull orca-mini` (3.8GB)
- Reduce `llm-assistant.maxTokens` (default 2048)
- Check GPU acceleration: Ollama can use CUDA/Metal

### LLM Server Setup

**Ollama Won't Start**
```bash
# Mac/Linux: Reinstall
curl -fsSL https://ollama.ai/install.sh | sh

# Windows: Download from https://ollama.ai/download
# Then: ollama run mistral
```

**LM Studio Issues**
- Download latest: https://lmstudio.ai
- Load model in UI
- Ensure "Local Server" is started (green dot)
- Default port: 8000, check in settings

---

## 🎓 Learn More

### For Users
- How to install and configure: [docs/INSTALL.md](docs/INSTALL.md)
- Command reference: [docs/QUICK_REFERENCE.md](docs/QUICK_REFERENCE.md)
- Video tutorial: [See demo video](https://github.com/odanree/llm-local-assistant/wiki/Demo-Video)

### For Developers
- Architecture deep dive: [ARCHITECTURE.md](ARCHITECTURE.md)
- Development guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Phase 2 extensibility: [docs/EXTENSIBILITY_ANALYSIS.md](docs/EXTENSIBILITY_ANALYSIS.md)
- Future roadmap: [ROADMAP.md](ROADMAP.md)

### For Contributors
- Clean code patterns: Review `src/*.ts` files
- Test patterns: Review `src/*.test.ts` files
- Git workflow: Check clean commit history with `git log --oneline`

---

## 📊 Project Stats

| Metric | Count |
|--------|-------|
| **Tests** | 120+ |
| **Test Coverage** | >85% |
| **Modules** | 6 core |
| **TypeScript Strict** | ✅ Yes |
| **Type Errors** | 0 |
| **Commit History** | 30+ atomic |
| **Versions** | 2 released |

---

## 🙏 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Development setup
- Code style guidelines  
- Testing requirements
- Pull request process

### Quick Contribution Guide
1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-thing`)
3. **Code** with tests (see existing patterns)
4. **Test** locally (`npm test`)
5. **Commit** with clear message (`git commit -m "feat: add amazing thing"`)
6. **Push** to your fork
7. **Open** PR with description

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details

**Created by [@odanree](https://github.com/odanree)**

---

**🚀 Local AI Agent for VS Code | 🔒 100% Private | ⚡ Autonomous Planning & Execution**
