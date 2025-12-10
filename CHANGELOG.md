# Change Log

All notable changes to the "llm-local-assistant" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.1.1] - 2025-12-09

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