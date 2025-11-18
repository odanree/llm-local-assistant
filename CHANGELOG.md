# Change Log

All notable changes to the "llm-local-assistant" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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