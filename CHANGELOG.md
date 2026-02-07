# Change Log

All notable changes to the "llm-local-assistant" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [2.0.1] - 2026-02-07

### Added - Phase 3.4 Enhancements & UI/UX
- **LLM-Based Pattern Detection** - Semantic analysis for `/suggest-patterns`
  - Replaces keyword matching with LLM semantic understanding
  - Confidence scoring (0-100%) with reasoning
  - Only flags files that truly need a pattern (60% threshold)
  - Graceful fallback to keyword detection if LLM unavailable
  - **Benefit**: Eliminates false positives, more actionable suggestions

- **CodebaseIndex Auto-Detection** - Supports any project structure
  - Auto-detects source directories: src → app → components → lib
  - Falls back to project root if no standard directory
  - Fixes multi-workspace analysis
  - Works with Next.js, Create React App, custom structures

- **Smart Chat UI/UX** - Keyboard shortcuts for efficient workflow
  - **Tab Autocomplete**: Complete commands (`/ref` → `/refactor`)
  - **Tab Cycling**: Navigate matches if multiple found (`/r` → cycles through options)
  - **Arrow Up/Down**: Navigate command history (recall previous commands)
  - **Copy-Pastable Commands**: `/suggest-patterns` shows: `` `/refactor app/page.tsx` ``
  
- **GitHub Actions CI/CD** - Automated testing on every PR
  - Tests run on Node 18.x and 20.x
  - 273 tests with 100% pass rate
  - Blocks PRs on test failures
  - Coverage tracking with Codecov

### Changed
- **`/refactor <file>`** - Now shows detected architectural patterns
  - Integrates with PatternDetector for semantic analysis
  - Displays pattern confidence and reasoning
  - Aligns with `/suggest-patterns` output
  
- **`/suggest-patterns`** - LLM-aware analysis with better UX
  - LLM semantic detection (not keywords)
  - Copy-pastable `/refactor` commands in output
  - Multi-workspace support with selection UI

### Fixed
- Multi-workspace file resolution (Windows path separators)
- Node modules parsing errors (skip during CodebaseIndex scan)
- Pattern detection consistency between `/suggest-patterns` and `/refactor`
- CodebaseIndex source directory detection

### Improved
- Performance: 10x faster scans (node_modules excluded)
- Accuracy: Semantic pattern detection vs keyword matching
- UX: Keyboard shortcuts for command completion and history
- Documentation: 273 tests with comprehensive coverage
- Infrastructure: GitHub Actions CI/CD pipeline

## [2.0.0] - 2026-02-06

### Added - Phase 3.3: Context Awareness
- **`/context show structure`** - Display project organization and file structure
- **`/context show patterns`** - Detect and list design patterns used in codebase
- **`/context show dependencies`** - Analyze and visualize file relationships

### Added - Phase 3.4: Intelligent Refactoring
- **`/refactor <file>`** - 5-layer semantic analysis of React hooks and components
  - Detects tight coupling, unused states, performance issues
  - Identifies anti-patterns and architectural violations
  - LLM-powered analysis with model routing
  - Suggests improvements with confidence scores
  - Success rate: 95%+

- **`/extract-service <hook> <name>`** - Extract business logic to pure service
  - LLM-guided service extraction respecting semantic analysis
  - Generates TypeScript service with error handling
  - Includes test suite automatically
  - Updates hook to use service
  - Success rate: 90%+

- **`/rate-architecture`** - Score and assess codebase architecture
  - Overall architecture rating (0-10 scale)
  - Layer breakdown analysis (schemas, services, hooks, components)
  - Pattern detection and recommendations
  - Architectural assessment with feedback
  - Success rate: 100%

- **`/suggest-patterns`** - Recommend design patterns for code
  - Analyzes codebase structure and file organization
  - Suggests 8 architectural patterns (CRUD, Auth, Forms, etc.)
  - File-specific recommendations
  - Pattern templates and best practices
  - Success rate: 100%

- **`/design-system <feature>`** - Generate complete multi-file architecture
  - Creates types, schemas, services, hooks, components, and tests
  - Automatic dependency ordering
  - Validation loop prevention with retry logic
  - Graceful error recovery
  - JSON truncation handling with simplified prompt retry
  - Success rate: 85%+

### Added - Diagnostics
- **`/check-model`** - Display configured LLM model and available options
  - Shows model routing and endpoint configuration
  - Useful for troubleshooting and verification

### Fixed - Critical Issues
1. **Semantic Analysis Gap** - `/refactor` now uses 5-layer semantic analyzer
2. **LLMClient Routing** - All analyzers respect configured model/endpoint
3. **LLM-Based Extraction** - `/extract-service` uses LLM intelligently
4. **Extract Command Routing** - Both button and direct command paths use LLM
5. **Validation Loop Prevention** - Architecture validator prevents infinite loops
6. **JSON Truncation Handling** - Automatic retry with simplified prompt

### Added - Validation & Safety
- **Architecture Validator** - Enforces layer-specific rules
  - Prevents React hooks in service files
  - Prevents runtime code in type files
  - Prevents state libraries in utilities
  - Graceful file skipping on violations

- **Semantic Error Detection** - Identifies architectural violations
  - Wrong-layer imports detection
  - Forbidden pattern detection (zustand, redux in wrong places)
  - Dependency validation
  - Layer boundary enforcement

### Added - Documentation
- Complete README with Phase 3.3-3.4 feature guides
- 5 production-quality command screenshots
- Architecture and design pattern documentation
- Testing and setup guides
- Real-world usage examples

### Quality Improvements
- 255 comprehensive tests (100% passing)
- 100% TypeScript strict mode
- Zero compilation errors
- Zero production blockers
- 1,200+ lines of new production code
- 21 new validator tests

### Verified
- `/refactor` working with 95%+ success
- `/extract-service` working with 90%+ success
- `/rate-architecture` working with 100% success
- `/suggest-patterns` working with 100% success
- `/design-system` working with 85%+ success (improved from 60%)
- All context commands working perfectly
- Retry logic tested and verified in real usage

## [1.2.5] - 2026-01-16

### Fixed
- **Marketplace Documentation Sync** - Removed personal narrative from marketplace description
  - Aligned marketplace messaging with professional README documentation
  - Personal story moved to LinkedIn post for appropriate audience
  - Maintains technical focus for VS Code Marketplace listing

## [1.2.4] - 2026-01-16

### Added
- **v1.2.3 Release Documentation** - Updated README with AI Agent Safety features
  - Documented write operation safety and interactive confirmation
  - Added smart risk detection for critical files
  - Highlighted user control and balanced automation

## [1.2.3] - 2026-01-16

### Added
- **Follow-up Questions for Write Operations (Phase 2.2 Enhancement)** - Protection for critical files
  - Questions trigger when writing to risky files: config.json, .env, Dockerfile, tsconfig.json, .eslintrc, webpack.config.js, etc.
  - User can approve, skip, or cancel before writing to important configuration files
  - Simple text files (.txt, .md, etc.) write directly without questions
  - 20+ file patterns detected as risky (build configs, linters, CI/CD, containers, database files)
  - Comprehensive logging for debugging question flow

### Tests
- Added 5 new test cases for write operation questions (140 total tests passing)
  - Trigger question for package.json
  - Trigger question for .env files
  - Don't trigger question for simple text files
  - Handle user skipping risky writes
  - Trigger question for Dockerfile

## [1.2.2] - 2026-01-16

### Added
- **Follow-up Questions (Phase 2.2)** - Interactive clarification before risky operations
  - Questions appear in chat UI with interactive buttons when running npm/test commands
  - User can choose: "Yes, proceed", "No, skip this step", or "Cancel execution"
  - Executor waits for user response before continuing
  - Prevents accidental execution of long-running or destructive commands

### Fixed
- **Plan Protection** - Safeguards against destructive plan generation
  - Blocks LLM from generating write steps for critical files (package.json, tsconfig.json, config files, lock files)
  - Enhanced system prompt with explicit rules against modifying configuration
  - Validation rejects plans trying to overwrite protected files
  - Prevents 'just run X' requests from generating unnecessary destructive write steps

- **Executor Flow** - Fixed question callback to properly continue execution
  - Corrected return value when user approves question (was skipping, now proceeds)
  - Added comprehensive logging for debugging question feature flow

## [1.2.1] - 2025-12-10

### Updated
- **Documentation** - Updated README.md to reflect v1.2.0 features
  - Added `/explain` command documentation
  - Documented auto-correction feature
  - Updated feature list with codebase awareness
  - Marketplace listing now reflects latest capabilities

## [1.2.0] - 2025-12-10

### Added
- **Feature 1: Auto-Correction in Executor** - Intelligent error recovery during plan execution
  - Auto-creates missing parent directories when writing files
  - Falls back to parent directory when reading non-existent files
  - Recovers from command-not-found errors by trying alternatives (npx, yarn)
  - Transparent to user - only shows results, not recovery attempts

- **Feature 2: Codebase Awareness** - Context-aware planning based on project analysis
  - Analyzes package.json to detect project type, language, and frameworks
  - Passes codebase context to LLM for informed planning
  - TypeScript/Node.js project detection working
  - Framework detection infrastructure ready for expansion

- **Feature 3: Follow-up Questions Infrastructure** - Foundation for interactive execution
  - `askClarification()` method implemented in Executor
  - `onQuestion` callback wired in ExecutorConfig
  - Ready for webview UI integration in Phase 2.2
  - Supports ambiguous file selection scenarios

- **Feature 4: /explain Command** - LLM-powered code explanation
  - Generate detailed explanations of code files
  - Context-aware explanations using conversation history
  - Proper error handling for missing files
  - Integrates with conversation for debugging workflows

- **Feature 5: Full Integration** - All systems working together
  - Explain command provides knowledge
  - Plan command uses codebase context
  - Executor handles execution with auto-correction
  - Complete workflow: explain → plan → execute

### Improved
- **Shell Command Execution** - Fixed PATH issues on macOS
  - Uses login shell (`/bin/bash -l`) to source shell configuration
  - Explicitly includes homebrew paths in environment
  - Properly inherits parent process environment variables
  - Resolves npm/node command discovery issues

- **Error Recovery** - More intelligent auto-correction patterns
  - Pattern 1: Creates parent directories on write failures
  - Pattern 2: Falls back to parent directory on read failures
  - Pattern 3: Tries alternative commands (npx npm, npx tsc, etc.)

### Testing
- Comprehensive v1.2.0 feature test suite (8/10 tests passing)
- Auto-correction patterns verified for all scenarios
- Codebase awareness context-aware planning validated
- /explain command tested with context awareness
- Full integration workflow tested successfully
- Success rate: 89% (8/9 applicable tests)

## [1.1.2] - 2025-12-09

### Added
- **Directory Reading Support** - Executor can now read and display directory structures recursively
  - Visual tree output with 📁 folder and 📄 file icons
  - Supports glob patterns (e.g., `examples/**`)
  - Proper depth limiting to prevent overwhelming output
- **Chat History Persistence** - Chat messages now persist when switching between editors and chat panel
  - New `postChatMessage()` helper for automatic message storage
  - History restored when chat panel reopens
  - Fixes context loss issue during workflow

### Improved
- **Planner Action Validation** - Enhanced system prompt with clearer action type indicators (✅/❌)
  - Better error messages showing which invalid actions were used
  - Restricted valid actions to `read`, `write`, `run` (removed `suggestwrite` from plans)
  - Improved validation error reporting for clarity
- **LLM Timeout Configuration** - Increased default timeout from 30s → 60s
  - Accommodates complex multi-step planning tasks
  - Configurable via `llm-assistant.timeout` setting
- **Error Handling** - More descriptive error suggestions when operations fail
  - Directory detection prevents EISDIR errors
  - Better fallback behavior when file paths are directories

### Fixed
- Chat history loss when switching between editors and chat panel (#phase2-persistence)
- Directory reading fails with EISDIR errors (#phase2-dirread)
- Planner generates unsupported `suggestwrite` actions (#phase2-validation)
- LLM timeout for complex multi-step planning tasks (#phase2-timeout)

### Testing
- End-to-end execution: plan → read → write → test generation ✓
- Chat persistence across panel switches ✓
- Directory structure visualization with tree output ✓
- Error handling for invalid plan actions ✓
- All unit tests passing (94+) ✓

## [1.1.0] - 2025-12-07

### Added
- **Phase 2: Agent Loop Foundation** - Multi-step planning and autonomous execution
- `/plan <task>` command to generate structured action plans using LLM
- `/approve` command to execute approved plans with automatic retry logic
- `/reject` command to discard plans before execution
- `Planner` module for intelligent task decomposition (breaks complex requests into 3-10 steps)
- `Executor` module for sequential step execution with configurable retry logic
- Automatic error recovery with up to 2 retry attempts per step
- Progress callbacks for real-time plan execution monitoring
- 32 comprehensive unit tests for Planner and Executor modules (>85% coverage)

### Improved
- Updated help text to display new planning commands alongside existing file operations
- Enhanced command routing for agent mode with planning workflow
- Better state management for active plans across chat sessions

## [1.0.1] - 2025-11-19

### Updated
- Documentation updates for v1.0.0 stable release
- Updated README with semantic versioning details
- Updated CHANGELOG with v1.0.0 release information
- All metrics synchronized across documentation

## [1.0.0] - 2025-11-19

### Released
- First stable release with semantic versioning
- Production-ready extension published to VS Code Marketplace
- All core features complete and tested
- Comprehensive documentation and error handling

## [Unreleased]

### Added
- Token buffering for streaming responses (batch updates every 10 tokens)
- Performance optimization for large file reading (handles files >5MB gracefully)

### Improved
- **UI Performance**: Reduced DOM reflows during token streaming by batching updates (~3-5x fewer redraws)
- **File Handling**: Large files (>5MB) now show truncation warning instead of causing lag
- **Streaming UX**: Smoother streaming display with optimized buffer flush timing (50ms timeout for small responses)

### Initial release

- Chat interface with streaming responses
- File read/write/suggest commands
- Configuration management for local LLM endpoints
- Support for Ollama, LM Studio, vLLM servers
- Error handling with actionable error messages
- Comprehensive TypeScript type safety