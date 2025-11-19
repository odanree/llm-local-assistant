# Change Log

All notable changes to the "llm-local-assistant" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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