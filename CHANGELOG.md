# CHANGELOG

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.3] - 2026-02-08

### Focus: Analysis-Only, Production-Ready

**v2.0.3 is the honest release.** We disabled broken code generation and focused on what works.

### Changed

- **Disabled `/plan`, `/design-system`, `/approve`** - Code generation creates infinite validation loops
  - Problem: LLM generates code missing imports, auto-correction regenerates same broken code repeatedly
  - Solution: Disabled unreliable features, updated docs with honest assessment
  - Better tools: Use Cursor, Windsurf, or VS Code + Copilot for code generation

- **Updated README.md** - Reflects v2.0.3 analysis-only focus
  - Removed misleading code generation claims
  - Clear before/after comparison (what works, what doesn't)
  - Honest about limitations and better alternatives
  - Quick start guide for analysis commands

- **Updated ROADMAP.md** - Transparent about design decisions
  - Philosophy: Honest about limitations
  - Known limitations (by design)
  - Future plans (v2.1+)
  - Contributing guidelines

- **Cleaned up project root** - Production-standard structure only
  - Removed: PHASE-*.md, FIX-*.md, GITHUB-*.md, LOCAL_TESTING_GUIDE.md, VSIX packages
  - Kept: README.md, CHANGELOG.md, ROADMAP.md, LICENSE, package.json, tsconfig.json

### Fixed

- **Fixed `/suggest-patterns` file discovery**
  - Now scans BOTH src AND root directories (not just one or the other)
  - Finds all files in project, comprehensive pattern detection
  - Works with any project structure (single-dir, organized, refactored)

- **Fixed `/plan`, `/design-system`, `/approve` multi-workspace support**
  - Plans now execute in correct workspace (not always workspace[0])
  - Added `getActiveWorkspace()` function to detect active editor's workspace
  - Updates Planner/Executor workspace context before creating/executing plans

### Quality

- **Tests**: 284/284 passing ✅
- **Compilation**: 0 errors ✅
- **TypeScript strict**: Enabled ✅
- **Production blockers**: 0 ✅

### Notes

**What v2.0.3 Teaches Us:**

1. **Analysis > Generation**
   - Pattern detection is 100% reliable
   - Code generation is fundamentally unreliable
   - Better to admit limitations than hide them

2. **Honesty Builds Trust**
   - Clear about what works and what doesn't
   - Recommend better tools when appropriate
   - Users know exactly what they're getting

3. **Focus on Strength**
   - This extension excels at code understanding
   - Let other tools handle what they're better at
   - Do one thing well, not many things poorly

---

## [2.0.2] - 2026-02-07

### Changed

- **Pattern detection enhancements** - Improved accuracy for all 8 patterns
- **Safety improvements** - Added pattern blocking to prevent unsafe refactorings
- **UI/UX polish** - Better error messages and command feedback
- **Multi-workspace support (initial)** - Basic support for multiple workspaces

### Fixed

- Fixed pattern detection timeouts
- Fixed import validation loop detection
- Fixed service extraction workspace handling

### Quality

- **Tests**: 273/273 passing ✅
- **Compilation**: 0 errors ✅
- **TypeScript strict**: Enabled ✅

---

## [2.0.1] - 2026-02-06

### Added

- **Pattern Detection Foundation**
  - 8 design patterns: CRUD, Authentication, Forms, DataFetching, StateManagement, Notifications, SearchFilter, Pagination
  - Automatic pattern discovery across codebase
  - Pattern availability scoring

- **Architecture Analysis**
  - 5-layer semantic analysis (state, dependencies, coupling, data flow, anti-patterns)
  - Layer-aware code quality scoring (0-10)
  - Actionable recommendations for improvements

### Changed

- `/refactor <file>` command redesigned
  - Now focuses on analysis and recommendations
  - Removed automatic code generation
  - Shows pattern suggestions instead

### Fixed

- Fixed circular import detection
- Fixed validation loop prevention
- Fixed service extraction safety checks

### Quality

- **Tests**: 255+ passing ✅
- **Compilation**: 0 errors ✅
- **TypeScript strict**: Enabled ✅

---

## [2.0.0] - 2026-02-06

### Major Release: Intelligent Refactoring Framework

### Added

- **Phase 3: Intelligent Refactoring (NEW)**
  - `/refactor <file>` - Deep semantic analysis with recommendations
  - `/rate-architecture` - Architecture scoring (0-10)
  - `/suggest-patterns` - Pattern recommendations (8 patterns)
  - `/context show structure` - Project organization
  - `/context show patterns` - Detected patterns
  - `/context show dependencies` - File relationships

- **Architecture Analysis Engine**
  - 5-layer semantic analysis
  - Pattern detection for 8 common patterns
  - Architecture scoring algorithm
  - Issue classification and severity

- **Safety Features**
  - Validation loop prevention
  - Circular import detection
  - Smart error recovery
  - Graceful degradation

### Changed

- Refactored core architecture for Phase 3
- Updated LLM client for better analysis prompts
- Improved error messages and diagnostics
- Enhanced documentation

### Quality

- **Tests**: 234 passing ✅
- **Compilation**: 0 errors ✅
- **TypeScript strict**: Enabled ✅
- **Type coverage**: 100% ✅

---

## [1.2.5] - 2026-02-05

### Added

- Multi-step planning with LLM
- Autonomous plan execution with retry logic
- Interactive plan approval/rejection
- Real-time progress tracking

### Changed

- Redesigned command system
- Updated webview UI for better clarity
- Improved error handling

---

## [1.2.0] - 2026-02-04

### Added

- `/plan <task>` - Break down tasks into multi-step plans
- `/approve` - Execute approved plans
- `/reject` - Discard plans
- Plan execution with automatic retry (up to 2 attempts)
- Interactive confirmation for risky operations

### Changed

- Chat UI redesigned for planning workflow
- New plan execution system

---

## [1.0.0] - 2026-01-31

### Initial Release

### Added

- Basic LLM chat with streaming support
- `/read <path>` - Read files
- `/write <path>` - Generate file content
- `/suggestwrite <path>` - Preview before writing
- `/explain <path>` - Code explanation
- `/git-commit-msg` - Generate commit messages
- `/git-review` - Code review
- `/check-model` - Model diagnostics
- `/help` - Command reference
- Local LLM support (Ollama, LM Studio, vLLM)
- 100% local and private
- TypeScript strict mode
- 92 comprehensive tests

---

## Philosophy

This changelog documents our learnings, not just features:

### What We've Learned

1. **Analysis is more valuable than generation**
   - Pattern detection excels, code generation fails
   - Focus on understanding code, not writing it

2. **Honesty about limitations builds trust**
   - Better to say "we can't do this" than break promises
   - Recommend better tools when appropriate

3. **Simple, focused tools are better than everything**
   - Do one thing well (analysis)
   - Let other tools handle other things (generation)

4. **Local and private is a feature**
   - Users care about code privacy
   - Worth the effort to support local-only

5. **Tests catch everything**
   - 100% test coverage prevents regressions
   - Tests guide API design
   - Tests build confidence in changes

### Future Mindset

- **Quality over quantity** - Focus on reliability, not features
- **Honest scope** - Clear about what works and what doesn't
- **User control** - No surprise automation
- **Local first** - Privacy and offline-capability
- **Community feedback** - Listen to users, adapt accordingly

---

## Acknowledgments

Thanks to the LLM community for inspiration and tools:
- Ollama - Local LLM serving
- VS Code - Extension API
- TypeScript - Type safety
- Vitest - Testing framework

---

**Last Updated**: 2026-02-08  
**Current Version**: v2.0.3 ✅  
**Status**: Production Ready
