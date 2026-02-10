# LLM Local Assistant - VS Code Extension

[![Tests](https://github.com/odanree/llm-local-assistant/workflows/Test%20Build/badge.svg)](https://github.com/odanree/llm-local-assistant/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![VS Code Marketplace](https://img.shields.io/visual-studio-code/v/odanree.llm-local-assistant)](https://marketplace.visualstudio.com/items?itemName=odanree.llm-local-assistant)

A powerful VS Code extension that brings autonomous AI capabilities to your local machine. Analyze code patterns, detect architecture issues, and refactor with confidence using your local LLM.

**🎯 v2.5.0 Focus: Multi-Step Validation & Zustand Refactoring (Complete 6-Layer Validation System)**

> **Latest Release**: v2.5.0 - 6-Layer Validation System, Production-Ready ✅  
> **Philosophy**: Complete validation architecture with semantic enforcement. Zustand stores now fully validated.  
> **Status**: 486/489 tests passing. 0 errors. Production ready.

## ✨ What's v2.5.0 (Multi-Step Validation System)

### ✅ What Works Great (Keep These)

**6-Layer Validation System** - New in v2.5.0
- **`/plan` with validation** - Multi-step code generation with semantic validation (NEW)
- **Cross-file contract enforcement** - Component-store alignment guaranteed
- **Zustand store validation** - Property extraction and destructuring validation
- **Hook usage detection** - Semantic validation of actual hook usage
- **Pre-validation import calculation** - Eliminate import path guessing
- **Store property extraction** - TypeScript generic support

**Pattern Detection & Analysis** - Reliable, accurate
- **`/refactor <file>`** - Semantic code analysis (5-layer deep)
- **`/rate-architecture`** - Score your codebase (0-10)
- **`/suggest-patterns`** - Pattern recommendations (8 patterns)
- **`/context show structure`** - See project organization
- **`/context show patterns`** - View detected patterns
- **`/git-review`** - AI code review

**File Operations**
- **`/read <path>`** - Read files
- **`/write <path> <prompt>`** - Generate file content with validation
- **`/suggestwrite <path> <prompt>`** - Review before writing
- **`/explain <path>`** - Explain code
- **`/git-commit-msg`** - Generate commit messages

### ⚠️ Known Limitations (v2.5.0)

**Cross-File Contract Drift** - See Limitations section
- Multi-file generation may have interface mismatches between files
- Validation catches these, manual verification recommended
- Future: v2.6+ will have persistent contract tracking

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
/rate-architecture            # Score your code (0-10)
/suggest-patterns             # Get pattern suggestions
/refactor src/App.tsx         # Analyze and suggest improvements
```

## 📋 Command Reference

### Architecture Analysis (SAFE & RELIABLE)

#### `/refactor <file>`
Deep semantic analysis with actionable recommendations.

```
You: /refactor src/hooks/useUser.ts

Output:
🔍 **Semantic Analysis** (useUser.ts)

[5-Layer Analysis]
✅ State Management: 3 states, well-organized
⚠️ Dependencies: Missing useCallback on fetchUser
⚠️ Coupling: Tight to AuthContext
⚠️ Anti-patterns: Direct API call (should extract)
⚠️ Data Flow: Incomplete error handling

[Recommendations]
1. Extract API logic to service layer (95% confidence)
2. Add useCallback optimization (88% confidence)
3. Improve error handling patterns (92% confidence)
```

**What it analyzes:**
- State management (unused states, missing deps)
- Coupling (tight dependencies on context/props)
- Data flow (traces data movement)
- Anti-patterns (unsafe practices, magic strings)
- Performance (optimization opportunities)

#### `/rate-architecture`
Score your codebase with layer-aware analysis.

```
You: /rate-architecture

Output:
📊 **Architecture Rating: 9/10** ⭐⭐⭐⭐⭐

[Layer Breakdown]
├─ Schema Layer (types/): 9/10
├─ Service Layer (services/): 8/10
├─ Hook Layer (hooks/): 9/10
└─ Component Layer (components/): 8/10

[Strengths]
✅ Clear separation of concerns
✅ Proper error handling
✅ Type-safe implementation
✅ Testable architecture

[Recommendations]
⚠️ Some hooks are large (150+ lines)
⚠️ Missing error boundary components
```

#### `/suggest-patterns`
Get pattern recommendations for your codebase.

```
You: /suggest-patterns

Output:
🎯 **Available Patterns**

1. CRUD Pattern (95% match) ✅ Already implemented
   Where: src/services/userService.ts
   
2. Forms Pattern (82% match) ⚠️ Partially implemented
   Gap: Missing form validation framework
   
3. DataFetching Pattern (78% match) ✅ Already implemented
   Where: src/hooks/useUser.ts

4. StateManagement Pattern (65% match) ⚠️ Partial
   Gap: No centralized state store
   
5-8. Other patterns...

[Supported Patterns]
CRUD, Authentication, Forms, DataFetching, StateManagement,
Notifications, SearchFilter, Pagination
```

### Project Context (100% Reliable)

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

#### `/suggestwrite <path> <prompt>`
Preview changes before writing.

```
/suggestwrite src/App.tsx add dark mode support using context and localStorage
```

#### `/explain <path>`
Get detailed code explanation.

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

## 📸 Visual Guide (v2.5.0)

### ✅ 6-Layer Validation System (New in v2.5.0)

The new validation architecture catches semantic errors across multiple files:

#### Layer 1: Syntax Validation
- Valid TypeScript code
- Proper syntax structure
- No compilation errors

#### Layer 2: Type Validation
- Correct type inference
- Type-safe operations
- No implicit any types

#### Layer 3: Import Validation
- Files exist at specified paths
- Relative paths resolve correctly
- No missing dependencies

#### Layer 4: Cross-File Validation
- Component imports resolve to stores
- Store files exist in workspace
- Import paths calculated pre-generation

#### Layer 5: Hook Usage Validation
- Hooks imported from correct modules
- Hooks actually called in code
- Destructured state actually used
- No mixed state management

#### Layer 6: Store Contract Validation
- Store properties extracted (TypeScript generics supported)
- Component destructuring matches store exports
- All destructured properties exist in store
- Property types align correctly

**Example: Zustand Refactoring**
```typescript
// Step 1: Store created with validation
export const useLoginStore = create<LoginFormStore>((set) => ({
  formData: {},
  errors: {},
  setFormData: (data) => set({ formData: data }),
  setErrors: (errors) => set({ errors }),
}))  // 4 exports extracted and stored

// Step 2: Component generated with validation
const { formData, errors, setFormData, setErrors } = useLoginStore();
// Validation: ✅ All 4 properties exist in store
```

### ✅ Pattern Detection & Analysis (Proven Reliable)

#### `/refactor <file>` - Semantic Analysis

Shows 5-layer semantic analysis:
- State management issues
- Dependency problems  
- Coupling analysis
- Data flow inspection
- Anti-pattern detection
- Actionable recommendations

**Example Output:**
```
🔍 **Semantic Analysis** (hooks/useUser.ts)

[5-Layer Analysis]
✅ State Management: 3 states, well-organized
⚠️ Dependencies: Missing useCallback on fetchUser
⚠️ Coupling: Tight to AuthContext
⚠️ Anti-patterns: Direct API call (should extract)
⚠️ Data Flow: Incomplete error handling

[Recommendations]
1. Extract API logic to service layer (95% confidence)
2. Add useCallback optimization (88% confidence)
3. Improve error handling patterns (92% confidence)
```

#### `/rate-architecture` - Code Quality Scoring

Architecture scoring (0-10):
- Overall rating with breakdown
- Layer-by-layer analysis
- Strengths and weaknesses
- Specific recommendations

**Example Output:**
```
📊 **Architecture Rating: 9/10** ⭐⭐⭐⭐⭐

[Layer Breakdown]
├─ Schema Layer (types/): 9/10
├─ Service Layer (services/): 8/10
├─ Hook Layer (hooks/): 9/10
└─ Component Layer (components/): 8/10

[Strengths]
✅ Clear separation of concerns
✅ Proper error handling
✅ Type-safe implementation

[Recommendations]
⚠️ Some hooks are large (150+ lines)
⚠️ Missing error boundary components
```

#### `/suggest-patterns` - Pattern Recommendations

8 design patterns:
- CRUD, Authentication, Forms
- DataFetching, StateManagement
- Notifications, SearchFilter, Pagination
- Shows which patterns are applicable
- Implementation guidance

**Example Output:**
```
🎯 **Available Patterns**

1. CRUD Pattern (95% match) ✅ Already implemented
   Where: src/services/userService.ts
   
2. Forms Pattern (82% match) ⚠️ Partially implemented
   Gap: Missing form validation framework
   
3. DataFetching Pattern (78% match) ✅ Already implemented
   Where: src/hooks/useUser.ts

[5-8 more patterns...]
```

#### `/context show structure` - Project Organization

Visualizes project layout:
- Files organized by purpose
- Proper separation of concerns
- Clear architecture view

**Example Output:**
```
📁 Project Structure

schemas/
├─ User.ts
├─ Post.ts
└─ Comment.ts

services/
├─ userService.ts
├─ postService.ts

hooks/
├─ useUser.ts
├─ usePost.ts

components/
├─ UserProfile.tsx
├─ PostList.tsx

Overall: 12 files organized in 4 layers
```

#### `/context show patterns` - Pattern Detection

Shows detected patterns:
- Pattern type and count
- Which files implement which patterns
- Architecture understanding

**Example Output:**
```
🎯 Detected Patterns

Zod Schema: 3 files
React Component: 3 files
Custom Hook: 3 files
API Service: 3 files
```

### ⚠️ Disabled Features (None in v2.5.0)

All planned features are functional. See Limitations section for known constraints.

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

See [docs/FORM_COMPONENT_PATTERNS.md](docs/FORM_COMPONENT_PATTERNS.md) for detailed explanation of each pattern and why they matter.

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

### Three-Phase AI Loop

```
Your Code
   ↓
[ANALYZER] → Detects patterns and issues
   ↓
[RECOMMENDATIONS] → Suggests improvements
   ↓
[ACTION] → You decide what to do next
```

### Phase 3: Architecture Analysis (SAFE)
- Semantic code analysis (5 layers)
- Pattern detection (8 patterns)
- Architecture scoring (0-10)
- Safe, always reliable

### Phase 2: File Operations (SAFE)
- Read files
- Generate file content
- Review before writing
- Git integration

### Phase 1: Chat & Utilities (SAFE)
- LLM chat with context
- Model diagnostics
- Help and documentation

**What's NOT included:**
- Code generation with planning
- Multi-file generation
- Automatic refactoring
- (These had infinite loop bugs, disabled for safety)

## ✅ Quality & Testing

- **284 tests** - All passing ✅
- **100% TypeScript strict** - Zero type errors
- **0 compilation errors**
- **Production-ready** - Used by real projects

**Test Coverage:**
- Pattern detection: 50+ tests
- Architecture analysis: 45+ tests
- File operations: 40+ tests
- Error handling: 35+ tests
- Git integration: 40+ tests
- All other: 74+ tests

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

**How we detect it (v3.0):**

- ✅ Store property extraction via regex parsing of TypeScript generics
- ✅ Component destructuring pattern matching
- ✅ Cross-file property validation (component properties must exist in store)
- ✅ Detailed error messages showing actual vs expected

**Workaround (Manual Verification Recommended):**

1. **Generate store first** - Use `/write` or `/plan` to create `useLoginStore.ts`
2. **Verify store exports** - Open file, confirm properties match your design
3. **Generate component second** - Reference the file when writing component
4. **Validate alignment** - Check component destructuring matches store exactly
5. **Run tests** - TypeScript compiler catches mismatches immediately

**Future Solutions (v3.1+):**

- [ ] Persistent contract store during multi-step generation
- [ ] Real-time contract validation across files
- [ ] Automatic property sync for generated consumers
- [ ] Semantic understanding of "store" pattern by LLM

**For Production Use:**

Until v3.1, **manual verification is recommended** for multi-file state migrations. The system will:

- ✅ Catch contract drift during validation (report errors)
- ✅ Prevent broken code from being written
- ✅ Guide you to fix mismatches

But it won't prevent the LLM from imagining properties that don't exist. Trust your eyes more than the AI for this pattern.

## 📊 v2.5.0 Status

**What Changed from v2.0.3:**
- ✅ Implemented complete 6-layer validation system
- ✅ Fixed form validation patterns (remove Zod requirement, allow handler consolidation)
- ✅ Added multi-step context injection (share state between generation steps)
- ✅ Added cross-file contract validation (component-store alignment)
- ✅ Added semantic hook usage validation (hooks actually used, not just called)
- ✅ Fixed store property extraction with TypeScript generics
- ✅ Added pre-validation import path calculation (eliminate guessing)
- ✅ Added refactoring scenario detection (allow useState → store migration)
- ✅ Created working Zustand example (RefactorTest workspace)
- ✅ Re-enabled `/plan` with validation (no more infinite loops)

**New Validation Capabilities:**
- Store property extraction (regex parsing of TypeScript generics)
- Component destructuring pattern matching
- Cross-file property validation
- Semantic hook usage detection
- Pre-validation import statement calculation

**Metrics:**
- Tests: 486/489 passing ✅
- Compilation: 0 errors ✅
- TypeScript strict: Enabled ✅
- Blockers: 0 ✅
- Ready for: Production ✅

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

### Industry Standard
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and releases
- **[ROADMAP.md](ROADMAP.md)** - Future development plans
- **[LICENSE](LICENSE)** - MIT License

### Architecture & Design
- **[Architecture](docs/ARCHITECTURE.md)** - System design and component overview
- **[Form Component Patterns](docs/FORM_COMPONENT_PATTERNS.md)** - Detailed explanation of 7 form component patterns (rules defined in `.lla-rules`)

### Project Setup & Configuration
- **[.lla-rules Reference](docs/CURSORRULES_EXAMPLE.md)** - Architecture rules template for code generation
- **[Installation Guide](docs/INSTALL.md)** - Setup instructions
- **[Contributing](docs/CONTRIBUTING.md)** - Development guidelines & repository organization

### Repository Organization
- **[Root Organization Rules](docs/ROOT_ORGANIZATION_RULES.md)** - Guidelines for keeping root clean (reference when root gets bloated)

### Troubleshooting & Reference
- **[Model Comparison](docs/MODEL_COMPARISON.md)** - LLM model recommendations
- **[Local Testing Guide](docs/LOCAL_TESTING_GUIDE.md)** - Testing setup
- **[Release History](docs/RELEASE-COMPLETE.md)** - Detailed release notes

### Development
- **[Developer Guide](docs/DEVELOPER_GUIDE_V1.2.0.md)** - Deep dive into codebase
- **[Execution Guide](docs/EXECUTION_GUIDE.md)** - Running code generation
- **[Marketplace Info](docs/MARKETPLACE.md)** - VS Code Marketplace details

## 🐛 Troubleshooting

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

**✨ v2.5.0 - 6-Layer Validation & Zustand Support | 🎯 Complete Architecture | 🔒 100% Private | 🚀 Production-Ready**

Created by [@odanree](https://github.com/odanree)
