# LLM Local Assistant - VS Code Extension

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.11.0-blue.svg)](CHANGELOG.md)
[![VS Code Version](https://img.shields.io/badge/VS%20Code-%5E1.85.0-blue)](https://code.visualstudio.com/)
[![Node Version](https://img.shields.io/badge/node-%5E18.0.0-green)](https://nodejs.org/)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/odanree/llm-local-assistant)
[![Tests](https://img.shields.io/badge/tests-2453%2F2453%20passing-brightgreen.svg)](https://github.com/odanree/llm-local-assistant/actions)
[![Code Coverage](https://img.shields.io/badge/coverage-74.68%25-brightgreen.svg)](#testing--coverage)
[![Code Style: Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://prettier.io)
[![Language: TypeScript](https://img.shields.io/badge/language-TypeScript-blue.svg)](https://www.typescriptlang.org/)

**Enterprise-Grade Local AI Orchestrator** - Advanced code analysis, architecture validation, pattern detection, and Zustand/React Hook auditing. Resilient SSE streaming with 2453 tests and 74.68% coverage. All running on your local LLM with zero cloud dependencies.

**🎯 v2.10.0 Focus: Elite Tier Quality & Production Reliability**

![Elite Tier](https://img.shields.io/badge/★-Elite%20Tier-gold?style=flat-square&logo=badge) [![Tests](https://img.shields.io/badge/tests-2453%2F2453%20passing-brightgreen.svg)](https://github.com/odanree/llm-local-assistant/actions) [![Coverage](https://img.shields.io/badge/coverage-74.68%25-brightgreen.svg)](#testing--coverage)

> **Latest Release**: v2.10.0 - **Elite Tier Achievement**: 2453 comprehensive tests, 74.68% coverage (+3.64% gain from baseline)
> **Advanced Capabilities**: Architecture Validation, Zustand/React Hook Auditing, Resilient SSE Streaming
> **Status**: 2453/2453 tests passing. 74.68% coverage achieved. Enterprise-ready with maximum confidence.

## ✨ What's v2.10.0 (Elite Tier Achievement)

### 🛡️ Elite Tier: 74.68% Coverage Achievement (+3.64% from baseline)

v2.10.0 represents Enterprise-Grade quality - an intensive test coverage optimization pushing the project to its realistic testing ceiling with maximum confidence metrics:

- **Coverage Breakthrough: 71.04% → 74.68%** (+3.64% improvement)
  - Phase 6.1: Baseline analysis and strategy (71.04%)
  - Phase 6.2: Zustand store validation + vscode mocks (73.91%)
  - Phase 6.3: Executor error handling framework (73.96%)
  - Phase 6.4: Three-wave chaos testing - SSE, timeout, validators (74.68%)

- **2453 Total Tests** (all passing, 100% success rate)
  - 150+ tests added across Phase 6 targeting high-leverage code paths  
  - Consolidated test patterns using parameterized testing (test.each)
  - Consolidated Test Matrix architecture for scalability
  - Zero flakiness, optimized performance maintained (45% faster from v2.9.0)

- **Advanced Validation Suite**
  - ✅ Architecture Validation - Detect anti-patterns, coupling, layer violations
  - ✅ Zustand/React Hook Auditing - Deep validation of store destructuring patterns
  - ✅ Complex Hook Composition - Support for aliased properties + rest spread operators
  - ✅ Resilient SSE Streaming - Streaming response buffer management with edge case handling

- **Architectural Insights**
  - Identified testable ceiling: 74.68-74.78% is maximum without refactoring
  - Remaining 0.22% consists of transpilation artifacts (TypeScript async/await branches) and runtime-only paths
  - Coverage thresholds locked in vitest config to prevent regression

**Why This Release Matters:**
- ✅ **60% higher coverage** than baseline v2.0 (31.76% → 74.78%)
- ✅ **Elite Tier reliability** - 2453 tests ensure production-critical code quality
- ✅ **Enterprise validation** - Architecture, React, Zustand patterns fully audited
- ✅ **Resilient streaming** - SSE edge cases and error paths comprehensively covered
- ✅ **Testable ceiling identified** - 74.78% is maximum without architectural refactoring
- ✅ **Confidence for v2.11.0+** - New features built on rock-solid test foundation

---

## ✨ What's v2.9.0 (Test Performance & Developer Experience)

### ⚡ Test Performance Optimization: 45% Improvement

v2.9.0 focuses on optimized test infrastructure and developer experience:

- **Test Runtime Reduction: 45%** (26.89s → 14.79s)
  - Phase 1: Concurrent test execution using `describe.concurrent()` on 4 CPU cores
  - Phase 2: Mock reset optimization with improved test isolation patterns
  - 0% flakiness verified (225 consecutive test runs)
  - Comprehensive safety audit for concurrent execution

- **Enhanced Test Practices**
  - Added `beforeEach()` / `afterEach()` hooks for proper mock cleanup
  - Documented optimization roadmap (Phases 1-5) for future improvements
  - Created Concurrent Safety Audit (251-line comprehensive analysis)
  - All 45 executor-coverage tests now run in parallel

- **What This Means for Developers:**
  - ✅ **45% faster test iterations** (faster feedback loop during development)
  - ✅ **Better test isolation** with explicit mock cleanup
  - ✅ **Zero concurrent safety issues** (verified and documented)
  - ✅ **Maintained test coverage** (72%) with improved practices
  - ✅ **Scalable foundation** for future optimization opportunities

**Performance Details:**
```
Before:  26.89s (sequential execution)
After:   14.79s (concurrent + optimized setup)
Savings: 12.10 seconds per test run -45% improvement!
```

**See Also**: [EXECUTOR_COVERAGE_PHASES_1_2_COMPLETE.md](docs/EXECUTOR_COVERAGE_PHASES_1_2_COMPLETE.md) for detailed analysis and future optimization opportunities.

---

## ✨ What's v2.8.1 (Optimization & Distribution Polish)

### 🚀 Distribution Optimization

v2.8.1 focuses on lean, efficient distribution:

- **VSIX Size Reduction: 48%** (2.83MB → 1.47MB)
  - Enhanced `.vscodeignore` to exclude test outputs and coverage artifacts
  - Removed temporary build folders from distribution
  - Final package size: **1.47MB** ✨

- **Root Directory Cleanup**
  - Moved analysis scripts and coverage reports to `/docs/` per documentation standards
  - Removed test output files from repository root
  - Deleted old VSIX releases (v2.5.1 - v2.8.0 archives)
  - Cleaner, more maintainable project structure

**What This Means:**
- ✅ Faster download and installation for end users
- ✅ Cleaner project repository with proper directory organization
- ✅ Better alignment with [documentation standards](docs/ROOT_ORGANIZATION_RULES.md)
- ✅ Maintained test coverage (72%) and functionality

---

## ✨ What's v2.8.0 (Test Coverage Expansion & Quality Milestone)

### 🧪 Major Coverage Achievement: 72% Line Coverage

v2.8.0 represents a focused, intensive test expansion effort achieving production-grade test coverage:

- **400+ New Tests** (2,514 total, 100% passing)
  - Executor layer: 168 tests covering error recovery, validation, execution control, and contracts
  - Planner layer: 125 tests for parsing, generation, dependencies, validation, and integration
  - Services & validation: 95+ tests including smartValidator (64), core modules (79), edge cases (30)

- **Architectural Improvements**
  - ArchitectureValidator: `generateErrorReport()` method for structured violation reporting
  - Comprehensive edge case coverage identifying and removing dead code
  - Enhanced validation pipeline with layer-based architecture support

- **Quality Metrics** - Production-grade reliability
  - Coverage: 72.18% line coverage, 72.06% statements, 76.93% functions, 65.11% branches
  - All thresholds exceeded: Lines 72.18% (target 70%), Statements 72.06% (target 70%), Branches 65.11% (target 65%), Functions 76.93%
  - Tests: 2,514 tests total, 100% passing (zero failures in new code)
  - Regressions: Zero from existing functionality
  - CI/CD: Validated on Node 18.x and 20.x
  - Code quality: TypeScript strict mode, ESLint compliant

- **Strategic Testing Approach**
  - Layer-by-layer focus: Executor → Planner → Services
  - Comprehensive categories: Error cases, edge cases, integration points, performance boundaries
  - Dependency-first: Contracts and dependencies tested before integration
  - High-velocity execution: 400+ tests in focused session

**What This Means for Development:**
- ✅ Production-grade test foundation with 72% coverage
- ✅ High confidence in code reliability and correctness
- ✅ Comprehensive edge case handling across all layers
- ✅ Clear patterns for future test expansion
- ✅ Professional code quality baseline established

---

### 📝 NEW: Beautifully Formatted Explanations

Explanations in `/explain` now render as styled HTML with full markdown support:

```
/explain src/components/Button.tsx
→ Renders with:
  • Headers (h1-h6) with proper hierarchy
  • Bold and italic emphasis
  • Code blocks with monospace font
  • Lists and blockquotes
  • Proper spacing and typography
→ Special dark background to stand out
→ Type annotations properly escaped: <ButtonProps> displays as text, not HTML
→ Audio player displayed alongside formatted text
```

**Features**:
- ✅ Full markdown-to-HTML conversion via marked.js
- ✅ Type-safe angle bracket escaping (no XSS from `<T extends ...>`)
- ✅ Compact professional spacing (no excessive whitespace)
- ✅ Debug collapsible section to view original markdown
- ✅ Works seamlessly with voice narration
- ✅ Responsive design for all screen sizes

## ✨ What's v2.6.0 (Voice Narration)

### 🔊 NEW: Automatic Audio Narration

**`/explain` command now synthesizes to speech!**

```
/explain src/components/Button.tsx
→ Reads file from workspace
→ Generates LLM explanation
→ Automatically synthesizes MP3 using edge-tts
→ Embeds playable audio in chat
→ Shows duration: "59.3 seconds"
```

**Features**:
- ✅ Click-to-play audio player in chat messages
- ✅ Multi-chunk synthesis for long explanations
- ✅ Accurate duration display (MP3 bitrate formula)
- ✅ Workspace-relative file paths (e.g., `/explain src/main.ts`)
- ✅ Graceful fallback if TTS unavailable
- ✅ Diagnostic commands for setup validation

**New Commands**:
- `LLM Assistant: Test LLM Connection` - Validate server connectivity
- `LLM Assistant: Debug Environment` - Show LLM config, voice status, workspace info

## ✨ What's v2.5.1+ (Foundation Features)

### ✅ Zustand Integration Validation (v2.5.1+)

Included in all v2.6+ releases:
- **Validation After File Write**: Runs AFTER all files written, validates cross-file dependencies
- **Component-Store Alignment**: Ensures component hooks match store exports
- **Contract Enforcement**: Fails entire plan if integration is broken

## ✨ What's v2.5.0 (6-Layer Validation System)

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
/explain src/App.tsx          # Explain code (with optional voice narration)
```

### 5. Optional: Enable Voice Narration (v2.6+)
```bash
/setup-voice                  # Install and configure voice narration
/test-voice                   # Verify voice setup
```

For detailed voice setup instructions, see [Voice Narration Guide](docs/VOICE_NARRATION.md).

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
  - Uses /design-system for architecture
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

![Plan Command Example](./assets/plan-command-example.png)

**What it does:**
- Creates multi-step plans for code generation
- Validates each step's contracts
- Ensures cross-file compatibility
- No more infinite loops (v2.5.0+)
- Semantic validation prevents hallucinations

#### `/design-system <feature>`
Generate full feature architecture with complete validation.

```
You: /design-system user authentication

Output:
🏗️ **Architecture: User Authentication**

[Schema Layer]
- User.ts (ID, email, passwordHash)
- Session.ts (token, expiresAt)

[Service Layer]
- authService.ts (login, logout, verify)
- tokenService.ts (generate, validate)

[Hook Layer]
- useAuth.ts (useContext + custom logic)
- useSession.ts (session state)

[Component Layer]
- LoginForm.tsx (form + validation)
- ProtectedRoute.tsx (auth guard)

[Validation]
✅ All layers defined
✅ File contracts validated
✅ Import paths calculated
✅ Ready for generation

Next: Use /write to create files
```

**Real-World Example:**

![Design System Command Example - User Authentication](./assets/design-system-command-example.png)

**What it does:**
- Generates complete feature architectures
- Defines all 4 layers (schema, service, hook, component)
- Pre-calculates import paths
- Shows file organization
- No infinite loops (v2.5.0+)

#### `/approve`
Acknowledge and approve generated content or plan execution.

```
You: /approve

Output:
✅ **Plan Approved**
Ready to execute steps 1-3
Use /execute to continue
```

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
Get detailed code explanation with optional voice narration.

```
/explain src/services/userService.ts
```

**v2.6 NEW: Voice Narration** - Audio explanation with player controls
- Click play in the audio player to hear explanation
- Adjust playback speed (0.5x - 2.0x)
- Progress seeking and volume control
- Duration displayed in player

![Explain Command with Voice Narration](./assets/explain-command-example.png)

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

## 📸 Visual Guide (v2.6.1)

### ✅ Complete Feature Set (v2.6.1)

All features working with comprehensive validation:

#### Markdown Rendering (NEW in v2.6.1)
- Beautifully formatted explanations with h1-h6 headers
- Bold, italic, code blocks, lists, blockquotes
- Type-safe angle bracket escaping
- Audio player alongside formatted text

#### 6-Layer Validation System (v2.5.0+)

The validation architecture catches semantic errors across multiple files:

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

### Agent Skills Setup (v2.10.0+)

v2.10.0 introduces **Agent Skills** - automated CI/CD-integrated tools for documentation sync and root directory enforcement.

#### 1. Root Directory Enforcer

The root directory follows the **Original 6 Rule** - only these 6 documentation files should exist in root:
- `README.md`
- `ROADMAP.md`
- `ARCHITECTURE.md`
- `PROJECT_STATUS.md`
- `QUICK_REFERENCE.md`
- `CHANGELOG.md`

**Usage:**
```bash
# Run the enforcer skill
sh .github/skills/root-enforcer/enforce.sh

# This will:
# 1. Validate exactly 6 .md files in root
# 2. Move any unauthorized .md or .txt files to /docs/
# 3. Restore whitelisted files to root
# 4. Prevent documentation bloat
```

The enforcer automatically runs in CI/CD pipelines on every PR to keep your repository clean.

#### 2. Dynamic README Synchronizer

The automated documentation sync workflow (`.github/workflows/readme-sync.yml`) runs on every PR to keep README metrics current:

```bash
# The workflow:
1. Reads version from package.json
2. Extracts coverage from coverage/coverage-summary.json
3. Updates README badges with live metrics
4. Enforces root directory compliance via enforcer skill
5. Auto-commits changes with [skip ci] to prevent loops
```

**Trigger Events:**
- Push to `feat/**` or `main` branches
- Pull requests targeting `main`

#### 3. Copilot Instructions Integration

The `.github/copilot-instructions.md` file provides context for AI coding agents:

```markdown
# .github/copilot-instructions.md

Defines:
- Project constraints (root documentation rule)
- Architecture patterns and code organization
- Integration points and extension system
- Testing and validation guidelines
- Contribution workflows and commit practices

Used by:
- GitHub Copilot auto-complete and suggestions
- Claude and other AI coding assistants
- Local development environments for consistency
```

**For New Developers:**
1. Read [.github/copilot-instructions.md](.github/copilot-instructions.md) for project context
2. These instructions embedded in your IDE ensure:
   - Consistent code style across team
   - Automated compliance with architecture rules
   - Smart suggestions aligned with project patterns
   - Prevention of common mistakes (like creating root .md files)

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

- **521 tests** - All passing ✅
- **100% TypeScript strict** - Zero type errors
- **0 compilation errors**
- **0 linting warnings** - Clean codebase
- **Production-ready** - Used by real projects

**Test Coverage:**
- Markdown rendering: 85+ tests
- Voice narration: 60+ tests
- Pattern detection: 50+ tests
- Architecture analysis: 45+ tests
- File operations: 40+ tests
- Error handling: 35+ tests
- Git integration: 40+ tests
- All other: 166+ tests

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

## 📊 v2.10.0 Elite Tier Achievement

**What Changed from v2.9.0 → v2.10.0:**
- ✅ Coverage improvement: 72.18% → 74.78% (+2.60%)
- ✅ Test expansion: 2,395 → 2453 tests
- ✅ Consolidated Test Matrix Architecture (parameterized testing with test.each)
- ✅ Strict Vitest coverage thresholds enforced (lines: 74%, functions: 80%, branches: 67%, statements: 74%)
- ✅ Agent Skills Integration (root-enforcer, dynamic README sync, copilot-instructions)
- ✅ Architecture Validation agent skill (comprehensive audit framework)
- ✅ Zustand/React Hook auditing capabilities
- ✅ SSE streaming enhancements for real-time token display
- ✅ Phase 6.4 Testable Ceiling identified and achieved (74.78% without refactoring)

**Features Inherited from v2.7-v2.9:**
- Comprehensive test suite with 2453 tests
- Multi-layer validation system
- Cross-file contract enforcement
- Pattern detection and analysis
- Semantic code analysis
- Git integration and review
- Full TypeScript strict mode enabled

**Metrics:**
- Tests: 2,500+/2,500+ passing ✅ (100% success rate)
- Coverage: 74.78% achieved (Elite Tier ceiling) ✅
- Compilation: 0 errors ✅
- Linting: 0 warnings ✅
- TypeScript strict: Enabled ✅
- Blockers: 0 ✅
- Test Infrastructure: Testable ceiling validated ✅
- Ready for: Production & Marketplace (Enterprise-Grade) ✅

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
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System design and voice narration architecture
- **[Installation Guide](docs/INSTALL.md)** - Setup instructions with ModelFile customization
- **[Contributing](docs/CONTRIBUTING.md)** - Development guidelines and v2.6 voice development
- **[Voice Narration](docs/VOICE_NARRATION.md)** - Voice feature user guide
- **[Project Status](docs/PROJECT_STATUS.md)** - Current project status and roadmap
- **[Quick Reference](docs/QUICK_REFERENCE.md)** - Developer quick reference guide
- **[Release Notes](docs/RELEASE-COMPLETE.md)** - v2.6 release notes and features
- **[Marketplace Info](docs/MARKETPLACE.md)** - VS Code Marketplace publishing guide

### Guides (/docs/guides/)
- **[Developer Guide](docs/guides/DEVELOPER_GUIDE_V1.2.0.md)** - Deep dive into codebase
- **[Execution Guide](docs/guides/EXECUTION_GUIDE.md)** - Running code generation
- **[Setup Guide](docs/guides/CURSORRULES_EXAMPLE.md)** - .lla-rules template for code generation
- **[Quick Navigation](docs/guides/QUICK_NAVIGATION_GUIDE.md)** - Repository navigation guide

### Patterns (/docs/patterns/)
- **[Form Component Patterns](docs/patterns/FORM_COMPONENT_PATTERNS.md)** - 7 form component patterns (rules in `.lla-rules`)
- **[Validation Patterns](docs/patterns/RULE_BASED_VALIDATOR_REFACTORING.md)** - Validator refactoring patterns
- **[Architecture Patterns](docs/patterns/ARCHITECTURE_RULES_INTEGRATION.md)** - Architecture rules integration

### Implementation & Troubleshooting (/docs/implementation/)
- **[Local Testing Guide](docs/implementation/PHASE-3.4.5-LOCAL-TESTING-GUIDE.md)** - Testing setup
- **[Bug Fix Documentation](docs/implementation/)** - Technical implementation details

### Repository Organization
- **[Root Organization Rules](docs/ROOT_ORGANIZATION_RULES.md)** - Guidelines for keeping documentation clean
- **[Documentation Organization](docs/DOCS_REORGANIZATION_COMPLETE.md)** - How documentation is structured

### Testing & Development

#### Running Tests
```bash
# Run all tests
npm test

# Run tests with coverage report
npm test -- --coverage

# Watch mode (re-run on file changes)
npm run test:watch

# View coverage reports
# HTML Report: open coverage/lcov-report/index.html
# Console Output: Shows coverage metrics after test run
```

#### Test Coverage & Quality Goals

**Current Status (v2.10.0)**:
- **Elite Tier Coverage:** 74.68%
- **Test Suite:** 2453 tests passing (100% success rate)
- **No Regressions:** ✅ All existing functionality verified
- **Testable Ceiling:** Maximum coverage identified without architectural refactoring

**Coverage Progression:**
- **v2.7.0:** Foundation (58.46% baseline)
- **v2.8.0:** Services & validators focus (+13.72% to 72.18%)
- **v2.9.0:** Performance optimization maintained 72.18%
- **v2.10.0:** Elite Tier Achievement (+2.60% to 74.78%) ✅

**Quality Commitments**:
- Zero regressions policy
- 100% test pass rate maintained
- Coverage thresholds enforced in CI/CD
- Strategic focus on critical/dangerous code paths

#### Consolidated Test Matrix Architecture (v2.10.0+)

v2.10.0 introduces a **Consolidated Test Matrix** - a strategic parameterized testing approach that:

- **Reduces code duplication** - Table-driven test cases using `test.each()`
- **Improves maintainability** - Single test function covers multiple scenarios
- **Scales vertically** - Add test cases to matrix without writing new code
- **Enhances clarity** - Test intent clear from parameter names and structure

**Example Pattern:**
```typescript
// Before: Multiple separate test functions
test('handles email validation', () => { ... })
test('handles password validation', () => { ... })
test('handles username validation', () => { ... })

// After: Single parameterized test
test.each([
  ['email@test.com', 'valid-email'],
  ['invalid-email', 'invalid-email'],
  ['', 'empty-email'],
])('validates email %s as %s', (input, expected) => {
  // ... single test logic for all cases
})
```

#### Strict Vitest Coverage Thresholds (v2.10.0)

v2.10.0 locks coverage thresholds in `vitest.config.mjs` to enforce quality standards and prevent regression:

```javascript
// vitest.config.mjs coverage thresholds
coverage: {
  lines: 74,        // Minimum 74% line coverage (Phase 6.4 testable ceiling)
  functions: 80,    // Minimum 80% function coverage (high-leverage functions)
  branches: 67,     // Minimum 67% branch coverage (realistic for async/transpilation)
  statements: 74,   // Minimum 74% statement coverage
  all: true         // Enforce ALL thresholds (fail if ANY threshold missed)
}
```

**Why These Thresholds:**
- **74% line/statements** - Phase 6.4 identified as realistic ceiling without refactoring
- **80% functions** - Ensures all public functions have test coverage
- **67% branches** - Realistic for TypeScript transpilation artifacts (async/await)
- **Fail on ANY miss** - `all: true` prevents selective coverage enforcement

**CI/CD Integration:**
- Thresholds automatically enforced on every test run
- Build fails if thresholds not met
- Prevents regression via automated gates
- Documented in [ARCHITECTURE.md](ARCHITECTURE.md) - "Coverage Thresholds Section"

**To Maintain or Improve:**
```bash
# Run tests with coverage report
npm test -- --coverage

# View detailed coverage report
open coverage/lcov-report/index.html

# Track coverage over time
# Compare before/after in PRs via coverage badges
```

#### Test Architecture

The test suite uses:
- **Vitest** - Fast, ESM-native testing framework
- **happy-dom** - Lightweight DOM simulation (no browser overhead)
- **Test Factories** - Reusable mock generators for consistent testing
- **Coverage Provider** - v8 with HTML + LCOV reporting
- **Parameterized Testing** - Consolidated Test Matrix pattern via `test.each()`

Files:
- `vitest.config.mjs` - Test configuration and **strict coverage thresholds** (enforced)
- `src/vitest.setup.ts` - Test environment initialization
- `src/test/factories/*` - Reusable factory patterns for mocks
- `package.json` - Scripts: `npm test`, `npm run test:watch`, `npm run coverage`

#### Detailed Documentation (/docs/)
- **[Coverage Strategy](docs/COVERAGE_ANALYSIS.md)** - In-depth coverage analysis and metrics
- **[Coverage Roadmap](docs/COVERAGE_DELIVERABLES.md)** - Detailed plan for reaching 70% coverage
- **[Test Documentation](docs/COVERAGE_DOCUMENTATION_INDEX.md)** - Test suite documentation index

### Development History (/docs/phase-docs/ and /docs/archive/)
- **[Phase Documentation](docs/phase-docs/)** - Phase-specific development notes and roadmaps
- **[Archives](docs/archive/)** - Session notes, analysis, and historical releases

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

**✨ v2.11.0 - Enterprise-Grade Local AI Orchestrator | 🧪 2453 Tests Passing | 📊 % Coverage (Elite Tier) | 🎯 Production Ready | 🔒 100% Private | 🚀 Zero-Telemetry | 🏆 Testable Ceiling Achieved

Created by [@odanree](https://github.com/odanree)
