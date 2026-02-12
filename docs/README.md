# Documentation

Active documentation organized by topic. Historical work archived separately.

## 📚 Active Documentation (Root Level)

Organized by purpose - only essential, current documentation.

### Getting Started
- **[INSTALL.md](./INSTALL.md)** - Installation and setup instructions
- **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** - Quick command reference
- **[EXECUTION_GUIDE.md](./EXECUTION_GUIDE.md)** - Guide for executing and testing

### Core Architecture & Design
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture and design patterns
- **[TTS_STRATEGY_PATTERN.md](./TTS_STRATEGY_PATTERN.md)** - Pluggable TTS backend architecture with dependency injection
- **[VOICE_NARRATION.md](./VOICE_NARRATION.md)** - Voice narration feature documentation

### Development & Contribution
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Contribution guidelines and development workflow
- **[FORM_COMPONENT_PATTERNS.md](./FORM_COMPONENT_PATTERNS.md)** - React form component patterns and examples
- **[MODEL_COMPARISON.md](./MODEL_COMPARISON.md)** - LLM model comparison and selection guide

### Product & Roadmap
- **[FUTURE_ROADMAP.md](./FUTURE_ROADMAP.md)** - Future features and development plans
- **[MARKETPLACE.md](./MARKETPLACE.md)** - VS Code Marketplace listing and distribution
- **[PROJECT_STATUS.md](./PROJECT_STATUS.md)** - Current project status and milestones

---

## 📦 Archive Documentation

Organized by category for reference without cluttering active workspace.

### [archive/phases/](./archive/phases/)
Complete project history organized by phase (Phase 0 → Phase 4).
- **PHASES_OVERVIEW.md** - Consolidated summary of all phases
- All detailed phase documentation in subdirectory

### [archive/bug-fixes/](./archive/bug-fixes/)
Technical deep dives into specific bug fixes, refactoring work, and validation improvements.

### [archive/sessions/](./archive/sessions/)
Session summaries, completion reports, and historical work logs.

### [archive/releases/](./archive/releases/)
Historical PR descriptions and release notes.

### [archive/analysis/](./archive/analysis/)
Analysis reports, portfolio information, and miscellaneous documentation.

---

## 🎯 Quick Navigation

### I want to contribute code
→ Read **[CONTRIBUTING.md](./CONTRIBUTING.md)** and **[ARCHITECTURE.md](./ARCHITECTURE.md)**

### I want to understand the design
→ Read **[ARCHITECTURE.md](./ARCHITECTURE.md)** → **[TTS_STRATEGY_PATTERN.md](./TTS_STRATEGY_PATTERN.md)**

### I want to add a new TTS backend
→ See **[TTS_STRATEGY_PATTERN.md](./TTS_STRATEGY_PATTERN.md)** (Adding a New TTS Strategy section)

### I want to see the roadmap
→ Read **[FUTURE_ROADMAP.md](./FUTURE_ROADMAP.md)**

### I need to understand the voice feature
→ Read **[VOICE_NARRATION.md](./VOICE_NARRATION.md)**

### I want historical context
→ Browse **[archive/phases/PHASES_OVERVIEW.md](./archive/phases/PHASES_OVERVIEW.md)**

---

## 📋 Root Directory Rule

⚠️ **ENFORCED**: Root directory contains only essential, actively maintained documentation. All other files archived in `/docs/archive/`.

---

**Remember**: All future documentation additions go in `/docs/`, never in root.
