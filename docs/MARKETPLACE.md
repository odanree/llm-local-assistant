# VS Code Marketplace Description - v2.14.0

## Short Description (for extension listing)
Local LLM code orchestrator with multi-step planning, RAG codebase context, architecture validation, and AI-powered refactoring. Zero cloud dependencies, 79KB install.

## Full Description

### LLM Local Assistant v2.14.0 — Lean Edition

Write better code faster with AI-powered planning, refactoring, and codebase analysis. All running locally on your machine. Zero runtime dependencies. 79KB install.

---

## Commands

**Plan & Execute**
- `/plan <task>` — Create a multi-step action plan with validation
- `/execute` — Run the plan step-by-step
- `/approve` / `/reject` — Approve or discard the plan

**Analyze & Improve**
- `/refactor <file>` — LLM-powered refactoring suggestions
- `/explain <path>` — Detailed code explanation with markdown output

**Codebase Context (RAG-powered)**
- `/context show structure` — File organization
- `/context show patterns` — Detected code patterns
- `/context show dependencies` — File relationships
- `/context find similar <file>` — Semantically similar files

**File Operations**
- `/read <path>` — Read file contents
- `/write <path> <prompt>` — Generate and write file content
- `/suggestwrite <path> <prompt>` — Preview before writing

**Git Integration**
- `/git-commit-msg` — Generate conventional commit messages from staged changes
- `/git-review [staged|unstaged|all]` — AI-powered code review

**Diagnostics**
- `/check-model` — Verify LLM server connection

---

## Key Features

**Architecture Rules**
- Define patterns in `.lla-rules` file
- LLM automatically follows your project conventions
- No per-request guidance needed

**RAG Embeddings**
- Incremental indexing — only re-indexes changed files
- Embeddings persisted across restarts
- Semantic similarity search

**Autonomous Planning**
- Multi-step task planning with cross-file contract validation
- Interactive approval before execution
- Automatic error recovery and retry

**Safety First**
- 6-layer validation for generated code
- Architecture rule enforcement
- Zustand store contract validation

**Local & Private**
- Works with Ollama, LM Studio, vLLM
- No external APIs, no telemetry
- 100% on your machine

---

## What Users Say

> "5x faster to implement features. The planning system catches cross-file issues before they happen." — Developer

> "Finally have a local alternative that actually understands my codebase structure." — Team Lead
