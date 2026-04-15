# LLM Local Assistant - VS Code Extension

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.15.0-blue.svg)](CHANGELOG.md)
[![VS Code Version](https://img.shields.io/badge/VS%20Code-%5E1.85.0-blue)](https://code.visualstudio.com/)
[![Node Version](https://img.shields.io/badge/node-%5E18.0.0-green)](https://nodejs.org/)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/odanree/llm-local-assistant)
[![Tests](https://img.shields.io/badge/tests-2872%20passing-brightgreen.svg)](https://github.com/odanree/llm-local-assistant/actions)
[![Code Style: Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://prettier.io)
[![Language: TypeScript](https://img.shields.io/badge/language-TypeScript-blue.svg)](https://www.typescriptlang.org/)

**Local AI Code Orchestrator** - Multi-step planning, architecture validation, RAG-powered codebase context, and Zustand/React Hook auditing. 2,872 tests. All running on your local LLM with zero cloud dependencies.

**🚀 v2.15.0: Pipeline Correctness — planner filters, architecture validator, and auto-correction hardened**

> **Latest Release**: v2.15.0 - **Pipeline Correctness**: Fixed four deterministic bugs in the planner step filters, architecture validator recommendation logic, and `isAutoFixable` classification. `isNonVisualWrapper` extracted to shared static method. 2,872 tests passing.
> **Advanced Capabilities**: Real-time Streaming, Interactive Prompts, RAG Embeddings, Suspend/Resume State Machine, Three-Layer Self-Healing
> **Status**: 2,872 tests passing. Production-ready with enterprise reliability.

## 📚 Release History

For a complete history of releases and detailed changelogs, see [CHANGELOG.md](CHANGELOG.md).

**Recent Releases:**
- **v2.15.0** (Current) - Pipeline Correctness: planner filter over-firing fixed, ArchitectureValidator skip/fix recommendation restored, isAutoFixable unclosed-brace classification fixed, isNonVisualWrapper shared static method
- **v2.15.0** - Lean Edition: Babel removed, 0 runtime deps, .vsix 1.06MB → 79KB, SOLID improvements, RAG incremental indexing
- **v2.13.1** - Reactive Orchestrator: marketplace bloat fix (18.06MB → 1.59MB)
- **v2.13.0** - Reactive Orchestrator: 81.61% coverage, 3,637 tests, self-healing architecture with safety rails
- **v2.12.0** - Infrastructure: Real-time streaming, interactive prompts, suspend/resume state machine
- **v2.11.0** - Diamond Tier: 80.27% coverage, 3,594 tests, automated quality gates
- **v2.10.0** - Elite Tier: 74.68% coverage, 2453 tests, agent skills integration
- **v2.9.0** - Performance: 45% test optimization, concurrent execution
- **v2.8.x** - Foundation: 72% coverage, distribution optimization, root directory cleanup
- **v2.7.0-v2.5.0** - Core features: Validation system, pattern detection, Zustand support

---

## ✨ Key Features & Capabilities (v2.14.0)

### 🏛️ Architecture & Validation System

**6-Check Sequential Validation**
- **Check 1: Syntax** - Brace balance, no markdown-in-code, no `any` types
- **Check 2: Patterns** - Bare classNames, JSX in `.ts` files, missing padding on interactive elements
- **Check 3: Hook Usage** - Called not just imported, destructured properties used, no mixed state management
- **Check 4: Cross-File Contract** - Every named import symbol exists as a named export in the source file
- **Check 5: LLM Reviewer** - Structured YES/NO against pre-generated acceptance criteria
- **Check 6: TypeScript Compiler** - `tsc --noEmit` post-write; ground-truth type errors in the file, with LLM correction loop

**Code Analysis**
- ✅ **`/refactor <file>`** - LLM-powered refactoring suggestions
- ✅ **`/context show structure`** - Visualize project organization
- ✅ **`/context show patterns`** - View detected code patterns
- ✅ **Zustand store validation** - Property extraction + destructuring validation
- ✅ **Cross-file contract enforcement** - Component-store alignment guaranteed

### 📝 Code Generation & Analysis

**Multi-Step Planning with Validation**
- ✅ **`/plan <task>`** - Create multi-step action plans with semantic validation
- ✅ **`/approve`** / **`/reject`** - Approve or discard generated plans
- ✅ **`/execute`** - Run the plan step-by-step

**File Operations with Confidence**
- ✅ **`/read <path>`** - Read and display file contents
- ✅ **`/write <path> <prompt>`** - Generate file content with validation
- ✅ **`/explain <path>`** - Get detailed code explanations
- ✅ **Markdown rendering** - Beautifully formatted output with h1-h6 headers, bold, italic, code blocks, lists, blockquotes

### 🔍 RAG Codebase Context

**Embedding-Powered Import Resolution**
- ✅ Incremental indexing — only re-indexes changed files
- ✅ Embeddings persisted to `.lla-embeddings.json` for fast restarts
- ✅ **`/context find similar <file>`** - Find semantically similar files

### 📊 Git Integration & Code Review

**AI-Powered Git Operations**
- ✅ **`/git-commit-msg`** - Generate conventional commit messages from staged changes
- ✅ **`/git-review`** - AI-powered code review of staged changes with issue detection
- ✅ Integration with workspace staged files
- ✅ Comprehensive review with suggestions and confidence scoring

### 🔐 Quality & Testing Infrastructure

**Automated Quality Assurance**
- ✅ **2,891 comprehensive tests** - 78 test files, 100% pass rate
- ✅ **Zero regressions** - All existing functionality verified
- ✅ **Strict coverage thresholds** - Enforced via vitest.config.mjs
- ✅ **CI/CD integration** - Automatic quality checks on every PR

## 🚀 Quick Start (30 seconds)

### 1. Start Local LLM Server
```bash
# Option A: Ollama (Recommended)
ollama run mistral

# Option B: LM Studio
# Download: https://lmstudio.ai
# Click "Start Local Server"

# Option C: vLLM
python -m vllm.entrypoints.openai.api_server --model mistral-7b
```

### 2. Install Extension
- Open VS Code → Extensions (Ctrl+Shift+X)
- Search: "LLM Local Assistant"
- Click Install

### 3. Test It
- Open Command Palette (Cmd+Shift+P / Ctrl+Shift+P)
- Run: `/check-model`
- Should show your configured model ✅

### 4. Analyze Your Code
```bash
/context show structure       # See your project layout
/refactor src/App.tsx         # Analyze and suggest improvements
/explain src/App.tsx          # Explain code with markdown output
/plan create a login form     # Multi-step code generation
```

## 📋 Command Reference

### Multi-Step Code Generation (v2.5.0+ - VALIDATED & RELIABLE)

#### `/plan <task>`
Create a multi-step action plan for complex code generation with built-in semantic validation.

```
You: /plan create a login form with Zustand store and validation

Output:
📋 **Action Plan: Login Form with Zustand**

Step 1: Create useLoginStore.ts
  - Zustand store with form state
  - Properties: formData, errors, handlers
  - Pattern: Zustand create

Step 2: Create LoginForm.tsx  
  - Component with store integration
  - Validation: 6-layer semantic checks

Step 3: Add validation logic
  - Email & password validation
  - Error handling patterns
  - Type-safe implementation

[Validation]
✅ Multi-step plan created
✅ Cross-file contracts defined
✅ Semantic validation passed

Ready to execute with: /execute
```

**What it does:**
- Creates multi-step plans for code generation
- Validates each step's contracts
- Ensures cross-file compatibility
- No more infinite loops (v2.5.0+)
- Semantic validation prevents hallucinations

#### `/approve`
Acknowledge and approve generated content or plan execution.

```
You: /approve

Output:
✅ **Plan Approved**
Ready to execute steps 1-3
Use /execute to continue
```

### Architecture Analysis

#### `/refactor <file>`
LLM-powered refactoring analysis with actionable recommendations.

```
You: /refactor src/hooks/useUser.ts

Output:
🔍 **Refactor Analysis** (useUser.ts)

[Recommendations]
1. Extract API logic to service layer
2. Add useCallback optimization
3. Improve error handling patterns
```

### Project Context

#### `/context show structure`
Visualize your project organization.

```
You: /context show structure

Output:
📁 Project Structure

schemas/
├─ User.ts
├─ Post.ts
└─ Comment.ts

services/
├─ userService.ts
├─ postService.ts
└─ commentService.ts

hooks/
├─ useUser.ts
├─ usePost.ts
└─ usePagination.ts

components/
├─ UserProfile.tsx
├─ PostList.tsx
└─ CommentThread.tsx

Overall: 12 files organized in 4 layers
```

#### `/context show patterns`
See detected design patterns.

```
You: /context show patterns

Output:
🎯 Detected Patterns

Zod Schema: 3 files
React Component: 3 files
Custom Hook: 3 files
API Service: 3 files
```

### File Operations

#### `/read <path>`
Read and display file contents.

```
/read src/hooks/useUser.ts
```

#### `/write <path> <prompt>`
Generate and write file content.

```
/write src/utils/validators.ts generate validation functions for email and password
```

#### `/explain <path>`
Get a detailed explanation of any file in your workspace.

```
/explain src/services/userService.ts
```

### Git Integration

#### `/git-commit-msg`
Generate conventional commit message from staged changes.

```
/git-commit-msg

Output:
feat(auth): add remember-me functionality to login form

- Add remember-me checkbox to LoginForm component
- Store session token in localStorage for 30 days
- Update Auth context to check for stored token on app load
- Add tests for localStorage persistence
```

#### `/git-review`
AI-powered code review of staged changes.

```
/git-review

Output:
📝 **Code Review**

[Issues Found]
⚠️ Missing null check on user object (line 42)
⚠️ Potential race condition in async handler (line 58)
✅ Good: Error handling comprehensive
✅ Good: Type safety throughout

[Suggestions]
1. Add null coalescing operator on user
2. Use AbortController for cancellable requests
```

### Diagnostics

#### `/check-model`
Verify LLM configuration and connectivity.

```
/check-model

Output:
🔍 **Model Configuration**

Endpoint: http://localhost:11434
Configured Model: mistral
Status: ✅ Connected

Available Models:
- mistral ✅ (active)
- llama2
- neural-chat
```

#### `/help`
Show all available commands.

```
/help
```

## ⚙️ Configuration

### VS Code Settings

Open Settings (Cmd+, / Ctrl+,) and search "llm-assistant":

| Setting | Default | Description |
|---------|---------|-------------|
| `llm-assistant.endpoint` | `http://localhost:11434` | LLM server URL |
| `llm-assistant.model` | `mistral` | Model name to use |
| `llm-assistant.temperature` | `0.7` | Response randomness (0-1) |
| `llm-assistant.maxTokens` | `4096` | Max response length |
| `llm-assistant.timeout` | `60000` | Request timeout (ms) |

### LLM Server Setup

**Ollama** (Recommended)
```bash
# Install: https://ollama.ai
# Run model server:
ollama run mistral
# Server: http://localhost:11434
```

**LM Studio**
```
1. Download: https://lmstudio.ai
2. Open app → Select model → Click "Start Local Server"
3. Server: http://localhost:8000
4. In VS Code settings, set endpoint to: http://localhost:8000
```

**vLLM**
```bash
python -m vllm.entrypoints.openai.api_server \
  --model mistral-7b-instruct-v0.2 \
  --port 11434
```

### Recommended Models

| Model | Rating | Notes |
|-------|--------|-------|
| `mistral` | ⭐⭐⭐⭐⭐ | Best all-around (recommended) |
| `qwen2.5-coder` | ⭐⭐⭐⭐⭐ | Best for code analysis |
| `llama2-uncensored` | ⭐⭐⭐⭐ | Good general analysis |
| `neural-chat` | ⭐⭐⭐⭐ | Fast, decent quality |

### Architecture Rules (Optional Quality Enforcement)

The extension is fully customizable and does **not enforce quality** by default. You decide whether to enable pattern validation.

#### How It Works

1. **No rules**: Extension works normally, LLM generates code without validation
2. **With rules**: Extension validates generated code against your custom patterns
3. **Opt-in**: You control what gets validated and when

#### Using Architecture Rules

**Step 1: View Example Rules**
```
The extension includes example rules in: examples/.lla-rules
View this file to see available patterns (forms, components, state management, etc.)
```

**Step 2: Copy to Your Workspace**
```bash
# Copy the example rules to your workspace root:
cp examples/.lla-rules /path/to/your/workspace/.lla-rules
```

**Step 3: Customize for Your Project**
Edit `.lla-rules` in your workspace root to define:
- Form component patterns (7 required patterns)
- Component architecture rules
- API design standards
- Validation requirements
- Code style guidelines

**Step 4: Enable Validation**
Once `.lla-rules` exists in your workspace, the extension automatically:
- Injects rules into LLM context during code generation
- Validates generated code against your patterns
- Rejects code that violates rules
- Asks LLM to regenerate with compliance

#### Example: Form Component Validation

If you include the "Form Component Architecture" section in `.lla-rules`, the extension will enforce these 7 patterns:

1. **State Interface** - `interface LoginFormState {}`
2. **Handler Typing** - `FormEventHandler<HTMLFormElement>`
3. **Consolidator Pattern** - Single `handleChange` function
4. **Submit Handler** - `onSubmit` on `<form>` element
5. **Zod Validation** - Schema-based validation
6. **Error State Tracking** - Field-level errors
7. **Semantic Markup** - Proper HTML form elements

**No `.lla-rules` file?** Extension works fine without it - just no pattern validation.

#### For More Details

See [docs/patterns/FORM_COMPONENT_PATTERNS.md](docs/patterns/FORM_COMPONENT_PATTERNS.md) for detailed explanation of each pattern and why they matter.

## 🔒 Privacy & Security

✅ **100% Local & Private**
- No external APIs
- No cloud services
- No telemetry
- No internet required
- Your code stays on your machine

**How it works:**
1. Your LLM runs locally (Ollama, LM Studio, vLLM)
2. Extension sends requests to local server only
3. All processing happens locally
4. Responses processed in VS Code
5. Nothing leaves your machine

## 🏗️ Architecture & Design

```
/plan <task>
     │
     ▼
 [PLANNER]  ──── LLM call: natural language → PlanStep[]
     │            Post-processed: inject missing deliverables,
     │            topological sort by dependency
     │
     ▼
 [ARCHITECT]  ── Per-file: generate 3-5 YES/NO acceptance criteria
     │            Injected into generator AND used by reviewer
     │            File-type guards prevent nonsensical criteria
     │            (e.g. no "uses cn()" criterion for a .ts config file)
     │
     ▼
 [GENERATOR]  ── Conditional constraint injection by file type:
     │            hooks → no JSX / return contract rules
     │            stores → flat state / no React imports
     │            .ts data files → absolutely no JSX
     │            structural layouts → copy all visual sections
     │            interactive components → forwardRef required
     │
     ▼
 [VALIDATOR]  ── 6 sequential checks (1-5 pre-write, 6 post-write):
     │            1. Syntax — brace balance, markdown-in-code, any types
     │            2. Patterns — bare classNames, JSX in .ts, missing padding
     │            3. Hook usage — called? destructured? mixed state?
     │            4. Cross-file contract — imported symbols exist in source
     │            5. LLM reviewer — structured YES/NO vs acceptance criteria
     │         ── file written to disk ──
     │            6. tsc --noEmit — ground-truth compiler errors for this file
     │
     ▼
 [CORRECTOR]  ── Two layers before giving up:
     │            A. Deterministic (SmartAutoCorrection):
     │               merge split React imports, remove cn from .ts files,
     │               fix circular imports, template-literal→ternary in style objects
     │            B. LLM correction: targeted error list + file-specific
     │               instructions (e.g. "REMOVE ALL JSX" for .ts files,
     │               not the default "keep existing JSX structure")
     │            Loop detector: aborts if same error repeats twice
     │
     ▼
  Your Files
```

### Design Principle: Push Decisions Left

Every constraint that can be expressed as a regex belongs in the **validator**, not the generator. Every constraint that can be deterministically fixed belongs in **SmartAutoCorrection**, not the LLM corrector. The LLM corrector is a last resort — it consumes context, produces non-deterministic output, and can introduce new errors while fixing old ones.

The failure modes this architecture is designed to prevent:

| Failure | Where it's caught | How |
|---|---|---|
| LLM imports hallucinated packages | Generator | `availablePackagesSection` injects exact `package.json` deps |
| JSX generated in a `.ts` config file | Generator + Validator | `configTsConstraintSection` + extension check |
| Sibling component imports sibling | Generator | `createdFilesSection` sibling rule + example |
| Wrong step order (Layout before Routes) | Planner post-processor | Topological sort on description patterns |
| Ghost symbol imports (`@/types/config`) | Validator Check 4 | Cross-file contract reads actual exports from disk |
| Corrector loops on unfixable error | Corrector | Loop detector + `unfixablePatterns` early exit |
| Architecture violation silently allowed | ArchitectureValidator | High-severity violations always produce `'skip'` regardless of strict mode |
| Planner drops legitimate run/verify steps | Planner | Narrowed `isManualStep` and `isRedundantTestStep` guards to exact patterns |

**A longer prompt is always cheaper than a failed correction attempt.** One hallucinated import triggers up to 9 correction calls (3 inner × 3 outer retries), each consuming context and producing a shorter, degraded file. Preventing the hallucination at generation time with an extra instruction line costs nothing.

## ✅ Quality & Testing

- **2,872 tests** — 78 test files, 100% pass rate ✅
- **TypeScript strict mode** — 0 compilation errors
- **CI/CD** — Automatic quality checks on every PR

```bash
npm test              # Run all tests
npm run coverage      # Run with coverage report
```

## ⚠️ Limitations & Agentic Boundaries

### Cross-File Contract Drift

**Current Limitation: Multi-file Refactoring**

V3.0 implements strict per-file governance. However, in complex refactors involving Zustand stores and consumers, the system may encounter **Contract Drift** where the component's expected interface mismatches the store's generated exports.

**What is Contract Drift?**

When the LLM generates multiple files in sequence, each file is validated independently. However, between files, the interface contract can drift:

```typescript
// Step 1: Store created with interface
export const useLoginStore = create<LoginFormStore>((set) => ({
  formData: { email: '', password: '' },
  errors: {},
  setFormData: (data) => set({ formData: data }),
  setErrors: (errors) => set({ errors }),
}))  // 4 exports

// Step 2: Component generated, expects DIFFERENT interface
const { formData, errors, setFormData, setErrors, submitForm } = useLoginStore();
                                                                   // ❌ 5th export (submitForm) doesn't exist!
```

**Why it happens:**

1. **File-level validation:** Each file is validated in isolation
2. **No persistent contract tracking:** Once Store file is written, component generation starts fresh
3. **LLM context window:** By the time component is generated, LLM may have forgotten exact store interface
4. **State evolution:** LLM might imagine properties the store doesn't actually export

**How it's detected:**

- ✅ Store property extraction via regex parsing of TypeScript generics
- ✅ Component destructuring pattern matching
- ✅ Cross-file property validation (component properties must exist in store)
- ✅ Detailed error messages showing actual vs expected

**Workaround:**

1. **Generate store first** - Use `/write` or `/plan` to create `useLoginStore.ts`
2. **Verify store exports** - Open the file, confirm properties match your design
3. **Generate component second** - The executor passes store content as context to downstream steps
4. **Validate alignment** - Check component destructuring matches store exactly
5. **Run tests** - TypeScript compiler catches mismatches immediately

The system will catch contract drift during validation and prevent broken code from being written — but it cannot prevent the LLM from imagining properties that don't exist. Trust your eyes more than the AI for this pattern.

## 🚀 Development

### Build
```bash
npm run compile        # Single build
npm run watch         # Auto-rebuild on changes
npm run package       # Production VSIX package
```

### Test
```bash
npm test              # Run all tests
npm run test:watch   # Auto-run on changes
```

### Debug
```bash
# Press F5 in VS Code to start debug session
# Then test commands in chat window
```

## 📚 Documentation

### Industry Standard (Root)
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and releases
- **[ROADMAP.md](ROADMAP.md)** - Future development plans
- **[LICENSE](LICENSE)** - MIT License

### Core Documentation (/docs/)
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System design
- **[Installation Guide](docs/INSTALL.md)** - Setup instructions
- **[Contributing](docs/CONTRIBUTING.md)** - Development guidelines
- **[Project Status](docs/PROJECT_STATUS.md)** - Current status and roadmap
- **[Marketplace Info](docs/MARKETPLACE.md)** - VS Code Marketplace publishing guide

### Patterns (/docs/patterns/)
- **[Form Component Patterns](docs/patterns/FORM_COMPONENT_PATTERNS.md)** - 7 form component patterns (rules in `.lla-rules`)
- **[Architecture Patterns](docs/patterns/ARCHITECTURE_RULES_INTEGRATION.md)** - Architecture rules integration

## 🐛 Troubleshooting

### LLM Server Issues

### "Cannot connect to endpoint"
- Make sure LLM server is running
- Check endpoint URL in settings
- Test with `/check-model` command

### "Model not found"
- List models: `ollama list`
- Download: `ollama pull mistral`
- Update settings with correct model name

### "Request timeout"
- Increase timeout in settings (default 60000ms)
- Check server resources (CPU, RAM)
- Try smaller model

## 📝 License

MIT License - See [LICENSE](LICENSE) for details.

---

**v2.15.0** — Local AI Code Orchestrator | 🧪 2,872 Tests Passing | 📦 79KB Install | 🔒 100% Private | Zero-Telemetry

Created by [@odanree](https://github.com/odanree)
