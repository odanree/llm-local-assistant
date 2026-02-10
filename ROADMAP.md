# ROADMAP - LLM Local Assistant

## Current Status: v2.5.0 Production Ready ✅

**Release Date:** February 9, 2026  
**Status:** Stable, Production-Ready  
**Tests:** 486/489 passing  
**TypeScript:** Strict mode, 0 errors  
**Blockers:** None

---

## 🟢 v2.5.0: The Governance Foundation (CURRENT - PR #18) ✅

**Focus:** Stabilizing the local execution loop and enforcing architectural standards.

### Foundation Layer (Complete)

**Active Rule Injection** ✅
- Transform `.lla-rules` from passive config to active prompt constraints
- Rules now actively shape LLM behavior during generation
- Enforce architectural standards programmatically

**The Golden Shield** ✅
- Implement linter-rule shielding for critical infrastructure files (e.g., `cn.ts`)
- Protect core utilities from being rewritten or modified
- Maintain architectural integrity during multi-step operations

**Plan-Content Decoupling** ✅
- Separate high-level reasoning (Planning) from raw code generation (Execution)
- Prevents JSON serialization crashes in complex workflows
- Enables multi-file generation without state loss

**Windows Shell Hardening** ✅
- Full support for PowerShell/CMD pathing and command execution
- Cross-platform execution (macOS/Linux/Windows)
- Absolute ComSpec path handling

**Tiered Validation** ✅
- Distinguish between blocking syntax errors and non-blocking architectural suggestions
- 6-layer validation architecture (syntax → store contracts)
- Pre-validation import calculation (no path guessing)
- Semantic hook usage validation (catches incomplete refactorings)

### Code Generation (RE-ENABLED)
- ✅ `/plan` - Multi-step generation with validation
- ✅ `/design-system` - Feature generation with validation
- ✅ `/approve` - Approval workflow
- ✅ No more infinite loops (pre-validation + semantic validation)

### Pattern Detection & Architecture Analysis
- ✅ `/refactor <file>` - 5-layer semantic analysis
- ✅ `/rate-architecture` - Score codebase (0-10)
- ✅ `/suggest-patterns` - Pattern recommendations (8 patterns)
- ✅ `/context show structure` - Project organization
- ✅ `/context show patterns` - Detected patterns
- ✅ `/git-review` - Code review

### File Operations
- ✅ `/read <path>` - Read files
- ✅ `/write <path>` - Generate file content with validation
- ✅ `/suggestwrite <path>` - Preview before writing
- ✅ `/explain <path>` - Code explanation
- ✅ `/git-commit-msg` - Generate commit messages
- ✅ `/help` - Command reference
- ✅ `/check-model` - Model diagnostics

### Quality Metrics
- 486/489 tests passing (99.4%)
- 0 compilation errors
- 0 regressions
- Production ready

---

## 🟡 v3.0: Semantic Orchestration (The "Contract" Release)

**Focus:** Solving "Semantic Drift" and ensuring multi-file integration.

### Features (Planned)

- [ ] **Cross-File Contract Validation**
  - Implement an "Interface Sniffer" that extracts public exports from Step N
  - Enforce extracted interfaces as constraints in Step N+1
  - 100% type-safety across multi-file workflows

- [ ] **State-Management Guardrails**
  - Strict enforcement of "No Mixed State"
  - Automatically detect and fail builds that mix `useState` with global store hooks (Zustand/Redux)
  - Prevent accidental state management conflicts

- [ ] **Atomic Refactoring**
  - Support for safe logic migration (e.g., moving local form state to a global store)
  - 100% interface matching verification
  - Rollback capability if contracts break

- [ ] **Type-Safe Event Handling**
  - Standardized enforcement of `FormEvent<T>` and `React.FC` patterns
  - Automatic type generation for event handlers
  - Consistent across all generated UI components

- [ ] **Automated Dependency Installation**
  - Planner identifies missing npm packages
  - Executor installs them before writing code
  - No more "module not found" errors

### Quality Goals
- Contract validation on 100% of multi-file operations
- Zero "semantic drift" defects
- Full IDE integration (IntelliSense support)

---

## 🔵 v3.5: Workspace Awareness (Local RAG)

**Focus:** Teaching the agent to "Read" the existing codebase before "Writing."

### Features (Planned)

- [ ] **Local Codebase Indexing**
  - Lightweight local vector store (LanceDB/Chroma)
  - Index `src/` directory for semantic search
  - Fast, privacy-first retrieval

- [ ] **Component Discovery**
  - Before generating a new UI element, search for existing components (e.g., `Button.tsx`)
  - Maximize reuse and maintain DRY principles
  - Suggest existing component modifications over new creation

- [ ] **Context-Aware Documentation**
  - Index internal READMEs and documentation
  - Ensure agent uses correct internal APIs
  - Enforce business logic patterns automatically

- [ ] **Project-Level Planning**
  - Planner can "Read" multiple files to understand large-scale architecture
  - Propose changes that respect existing patterns
  - Understand project conventions and enforce them

### Quality Goals
- 90%+ component reuse on new feature generation
- Zero conflicts with existing codebase patterns
- Local inference only (no external APIs)

---

## 🔴 v4.0: The Autonomous Architect (Agentic Excellence)

**Focus:** Complex refactoring, recursive self-correction, and platform-agnosticism.

### Features (Planned)

- [ ] **"God Object" Decomposition**
  - Ability to take a massive, 1000-line component
  - Automatically split into logically decoupled sub-components and hooks
  - Maintain functionality while improving architecture

- [ ] **Recursive Self-Correction**
  - Agent can proactively "realize" it needs a new utility or hook
  - Pause current step to create the dependency first
  - Resume original task with all dependencies ready

- [ ] **Environment Abstraction Layer**
  - Auto-detect OS/Shell environment (macOS/Linux/Windows)
  - Adjust shell commands dynamically
  - Full cross-platform execution reliability

- [ ] **Visual Validation (Optional)**
  - Integration with basic screenshot-based testing
  - Verify that generated Tailwind classes actually look correct in a browser
  - Catch visual regressions automatically

- [ ] **CI/CD Integration**
  - Headless mode runs as GitHub Action
  - Perform "Architecture-Aware" code reviews
  - Auto-fix simple linting violations
  - Enable automated architectural enforcement in pull requests

### Quality Goals
- Fully autonomous complex refactorings (0 manual intervention)
- Visual regression detection: 100%
- CI/CD integration for all GitHub Actions
- Cross-platform execution reliability: 99%+

---

## v2.0.2: UX Polish & Bug Fixes (Previous Release)

**Date:** February 7, 2026

**Features:**
- ✅ Pattern detection enhancements
- ✅ Safety improvements (pattern blocking)
- ✅ UI/UX polish
- ✅ Multi-workspace initial support

**Tests:** 273/273 passing

---

## v2.0.1: Pattern Detection Foundation (Previous Release)

**Date:** February 6, 2026

**Features:**
- ✅ Semantic analysis (5 layers)
- ✅ Pattern detection (8 patterns)
- ✅ Architecture scoring
- ✅ Initial `/refactor` command

---

## v2.0.0: Intelligent Refactoring (Previous Release)

**Date:** February 6, 2026

**Features:**
- ✅ Phase 3 architecture analysis
- ✅ Pattern detection framework
- ✅ Multi-file coordination foundation
- ✅ Validation loop detection

---

## Future Phases (v2.1+)

### v2.1: Better Analysis & Recommendations

**Possible Future Features:**
- Improved pattern detection accuracy
- Better architecture scoring algorithm
- More specific refactoring recommendations
- Performance profiling analysis

**Status:** Not started (focused on stability first)

### v2.2: Enhanced Context & Integration

**Possible Future Features:**
- Better multi-workspace support
- Context caching for faster analysis
- Git history analysis
- Team-based recommendations

**Status:** Not started (focused on stability first)

### v3.0: Code Generation (Revisited)

**Not In Active Development:**
- Would require solving infinite loop problem
- Better approach: partner with Cursor/Windsurf instead of competing
- This extension is better as analysis tool than generation tool

---

## Known Limitations (By Design)

### v2.0.3

1. **No Code Generation**
   - Why: LLM can't reliably follow validation constraints
   - Workaround: Use Cursor, Windsurf, or manual coding
   - Evidence: v2.0.0-2.0.2 attempts created infinite loops

2. **Pattern Detection Limited to Common Patterns**
   - Current: 8 patterns (CRUD, Auth, Forms, DataFetching, StateManagement, Notifications, SearchFilter, Pagination)
   - Why: Others less common or harder to detect reliably
   - Workaround: Use `/refactor` for custom pattern analysis

3. **Architecture Scoring Based on File Structure**
   - Current: Analyzes layers and organization
   - Limitation: Can't measure actual runtime performance
   - Workaround: Use performance profiling tools for runtime analysis

4. **Multi-File Operations Limited**
   - Current: Can analyze codebase, show structure
   - Limitation: Won't generate multiple coordinated files
   - Workaround: Use Cursor/Windsurf for multi-file generation

### Intentional Design Choices

**Analysis Only, No Generation** - Because:
- Analysis is 100% reliable (just reading code)
- Generation is unreliable (writing working code)
- Better to be honest about limitations
- Recommend better tools for generation (Cursor, Windsurf)

**No Automatic Refactoring** - Because:
- Users should understand changes before applying them
- Recommendations without generation safer and more useful
- Puts user in control of transformation

**No External APIs** - Because:
- Local privacy more important than cloud features
- Users can run offline
- No dependency on external services

---

## Version History

| Version | Date | Status | Focus |
|---------|------|--------|-------|
| v2.5.0 | Feb 9, 2026 | ✅ Current | Governance Foundation: Rule Injection, Golden Shield, Plan-Content Decoupling, Windows Hardening, Tiered Validation |
| v3.0 | TBD | 📋 Planned | Semantic Orchestration: Cross-File Contracts, State Guardrails, Atomic Refactoring, Type-Safe Events, Dependency Auto-Install |
| v3.5 | TBD | 📋 Planned | Workspace Awareness: Local RAG, Component Discovery, Context-Aware Docs, Project-Level Planning |
| v4.0 | TBD | 📋 Planned | Autonomous Architect: God Object Decomposition, Recursive Self-Correction, Environment Abstraction, Visual Validation, CI/CD Integration |
| v2.0.3 | Feb 8, 2026 | ✅ Previous | Analysis-only release (code generation disabled) |
| v2.0.2 | Feb 7, 2026 | ✅ Stable | UX polish, safety improvements |
| v2.0.1 | Feb 6, 2026 | ✅ Stable | Pattern detection foundation |
| v2.0.0 | Feb 6, 2026 | ✅ Stable | Intelligent refactoring framework |

---

## Contributing

### How to Help

**Bug Reports**
- Found an issue? Please report via GitHub Issues
- Include: what happened, expected behavior, steps to reproduce, setup (model/OS)

**Feature Requests**
- Have an idea? Open GitHub Discussion
- Community votes on priorities

**Code Contributions**
- Fork repository
- Follow code style (see README.md Development section)
- Submit PR with tests
- All tests must pass

### Development Setup

```bash
# Clone repository
git clone https://github.com/odanree/llm-local-assistant.git
cd llm-local-assistant

# Install dependencies
npm install

# Start development
npm run watch        # Auto-rebuild on changes

# Run tests
npm test             # All tests
npm run test:watch   # Auto-run on changes

# Debug
# Press F5 in VS Code to launch debug extension
```

### Code Quality Standards

- TypeScript strict mode (0 errors)
- 100% test coverage for new features
- ESLint compliant
- Clear commit messages
- Comprehensive documentation

---

## Philosophy & Values

### Why This Extension Exists

1. **Local & Private** - Process code locally, never send to cloud
2. **Honest** - Clear about what it does well and what it doesn't
3. **Focused** - Do one thing (analysis) and do it well
4. **Safe** - No risky automation or broken promises
5. **Open** - Free and open source

### Design Principles

**Principle 1: Analysis Over Generation**
- Analysis (reading code) is reliable
- Generation (writing code) is unreliable
- Focus on what we're good at

**Principle 2: User Control**
- Always show plan before execution
- User approves changes
- Never automate risky operations

**Principle 3: Honest Scope**
- Clear about limitations
- Recommend better tools when appropriate
- Don't pretend to do things we can't

**Principle 4: Privacy First**
- 100% local processing
- No external APIs
- No data collection
- Works offline

**Principle 5: Keep It Simple**
- Focus on core functionality
- Don't try to do everything
- Let other tools handle what they're better at

---

## Getting Help

### Documentation
- **[README.md](README.md)** - Features and quick start
- **[CHANGELOG.md](CHANGELOG.md)** - What's new in each version
- **[LICENSE](LICENSE)** - MIT License

### Support
- **GitHub Issues** - Bug reports and feature requests
- **GitHub Discussions** - Questions and community support
- **VS Code Marketplace** - Community reviews and feedback

---

## Contact & Social

- **GitHub:** https://github.com/odanree/llm-local-assistant
- **Marketplace:** https://marketplace.visualstudio.com/items?itemName=odanree.llm-local-assistant
- **Twitter:** [@odanree](https://twitter.com/odanree) (if available)

---

**Last Updated:** February 9, 2026  
**Status:** v2.5.0 Production Ready ✅ (PR #18)  
**Next Phase:** v3.0 Semantic Orchestration (Planning)
