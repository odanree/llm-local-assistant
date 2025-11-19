# LLM Local Assistant - VS Code Extension

A VS Code extension that integrates with your local LLM (Ollama, LM Studio, vLLM) to provide intelligent code assistance, autonomous file operations, and chat capabilities directly in your editor.

> 📚 **Contributing**: See [CONTRIBUTING.md](https://github.com/odanree/llm-local-assistant/blob/main/CONTRIBUTING.md) for development guide.

## ✨ Features

- 🤖 **Local LLM Chat** - Chat with your local LLM without sending data to external servers
- 🔄 **Agent Mode Commands** - Autonomous file operations:
  - `/read <path>` - Read files from your workspace
  - `/write <path> [prompt]` - Generate content and write to files via LLM
  - `/suggestwrite <path> [prompt]` - LLM suggests changes, you approve before writing
- ⚙️ **Fully Configurable** - Customize endpoint, model, temperature, max tokens, timeout
- 💬 **Conversation Context** - Maintains chat history for coherent multi-turn conversations
- 🚀 **Quick Access** - Open chat with a single click from the status bar
- 🔒 **100% Private** - All processing stays on your machine
- ⚡ **Streaming Support** - Real-time token streaming for responsive UX
- ✅ **Production-Ready** - Comprehensive error handling, type safety, test coverage

## 📊 Project Status

**v0.1.0** - Production-Ready MVP

- ✅ **13 commits** - Clean, atomic git history showing full development progression
- ✅ **92 tests** - 100% passing (28 extension + 24 llmClient + 14 gitClient + 26 docsGenerator)
- ✅ **TypeScript strict mode** - 0 type errors, full type safety
- ✅ **5 core modules** - extension, llmClient, gitClient, docsGenerator, webviewContent
- ✅ **Packaged as VSIX** - One-command installation for users
- ✅ **Complete documentation** - README, ARCHITECTURE, INSTALL, guides, and more

**Features included:**
- Chat interface with streaming support
- File operations (`/read`, `/write`, `/suggestwrite`)
- Git integration (`/git-commit-msg`, `/git-review`)
- Performance optimizations (token buffering, DOM batching)
- Monochrome UI with WCAG AA accessibility
- Comprehensive error handling

**Ready for:**
- Portfolio showcase - professional-grade code
- Production use - tested and optimized
- Extension by others - clear architecture and test coverage
- Interview discussion - full git history and talking points

## 📋 Prerequisites

### Local LLM Server (Required)

You need one of:

**Ollama** (Recommended)
```bash
ollama run mistral
# Server at: http://localhost:11434
```

**LM Studio**
- Download: https://lmstudio.ai
- Start local server on: http://localhost:8000

**vLLM**
```bash
python -m vllm.entrypoints.openai.api_server \
  --model mistral-7b-instruct-v0.2 \
  --port 11434
```

## 🚀 Getting Started

### Quick Install (One Command)

```bash
code --install-extension llm-local-assistant-0.0.1.vsix
```

Download the VSIX from [Latest Release](https://github.com/odanree/llm-local-assistant/releases/tag/v0.1.0), then run the command above.

**See [docs/INSTALL.md](https://github.com/odanree/llm-local-assistant/blob/main/docs/INSTALL.md) for detailed platform-specific setup, troubleshooting, and development instructions.**

### Option A: Install from VSIX (Recommended for Users)

1. Download `llm-local-assistant-0.0.1.vsix` from [Latest Release](https://github.com/odanree/llm-local-assistant/releases)
2. In VS Code, run: `code --install-extension llm-local-assistant-0.0.1.vsix`
   - Or open Command Palette (`Ctrl+Shift+P`) → "Extensions: Install from VSIX"
3. Reload VS Code

### Option B: Build from Source (Development)

1. **Install & Compile**
```bash
npm install
npm run compile
# Or development watch mode:
npm run watch
```

2. **Launch in Debug Mode**
   - Press `F5` in VS Code to open debug window with extension loaded

### Configure Endpoint

Open VS Code Settings (`Ctrl+,`) and set:

```json
{
  "llm-assistant.endpoint": "http://localhost:11434",
  "llm-assistant.model": "mistral",
  "llm-assistant.temperature": 0.7,
  "llm-assistant.maxTokens": 2048,
  "llm-assistant.timeout": 30000
}
```

For custom ports:
```json
{
  "llm-assistant.endpoint": "http://127.0.0.1:9000"
}
```

### Test Connection

Click **LLM Assistant** in status bar → Run "Test Connection" command

## 💡 Usage

### Chat
Simply type messages and press Enter to chat with your LLM.

### Available Commands

#### File Operations
- **`/read <path>`** - Read and display file contents
  ```
  /read src/main.ts
  ```

- **`/write <path> [prompt]`** - Generate file content via LLM and write to disk
  ```
  /write src/greeting.ts write a TypeScript function that greets users
  ```
  If no prompt provided, uses: "Generate appropriate content for this file based on its name."

- **`/suggestwrite <path> [prompt]`** - LLM suggests changes, you review and approve before writing
  ```
  /suggestwrite src/config.ts add validation for the API endpoint
  ```

#### Git Integration
- **`/git-commit-msg`** - Generate commit message from staged changes
  ```
  /git-commit-msg
  ```
  Reads all staged diffs, analyzes changes, and generates a conventional commit message following the pattern: `<type>(<scope>): <description>`

- **`/git-review`** - AI-powered code review of staged changes
  ```
  /git-review
  ```
  Reviews all staged changes, identifies potential issues, suggests improvements, and provides specific feedback.

#### System
- **`/help`** - Show available commands
  ```
  /help
  ```

## 🏗️ Architecture & Design Decisions

### Why This Architecture?

The extension uses a **deliberately simple, regex-based command parser** instead of a formal CLI framework. Here's why:

1. **User-Centric**: Commands work anywhere in messages - `/read file.ts` can appear mid-conversation
2. **Low Overhead**: No dependency on heavyweight CLI libraries, keeping bundle size small
3. **Maintainability**: Regex patterns are explicit and easy to audit in code review
4. **Extensibility**: Easy to add new commands (e.g., `/analyze`, `/refactor`) without architecture changes

**Trade-off**: Less strict argument validation than formal parsers, but gained flexibility for natural interaction patterns.

### Streaming vs Non-Streaming

The extension supports **both streaming and non-streaming responses**:

- **Streaming** (primary): Token-by-token display for real-time feedback
- **Non-Streaming** (fallback): For servers with streaming limitations (e.g., Ollama on non-standard ports)

**Why this matters**: Users get responsive, interactive feedback while typing long responses. The UI updates continuously instead of waiting for the full response.

### In-Memory Conversation History

The `LLMClient` maintains conversation history **per-session, not persisted**:

```typescript
private conversationHistory: Array<{ role: string; content: string }> = [];
```

**Why**: 
- Simpler state management without database/file I/O
- Clear semantics: closing the chat panel resets history (expected behavior)
- Reduces complexity for MVP
- Future enhancement: optional persistence to disk/localStorage

**Trade-off**: Restarting VS Code or closing the chat panel loses context. This is intentional for simplicity; persistent history is a Phase 2 feature.

### Async/Await + Try-Catch Error Handling

All user-triggered operations follow this pattern:

```typescript
try {
  const result = await llmClient.sendMessage(userInput);
  // Display result
} catch (error) {
  // Send user-friendly error message to chat
  showError(`Error: ${error.message}`);
}
```

**Why**: Consistent error propagation, easy to debug, and all errors surface in the chat UI for users to see.

### File I/O via VS Code Workspace API

All file operations use **VS Code's URI-based `workspace.fs` API**:

```typescript
const uri = vscode.Uri.joinPath(workspaceFolder, relativePath);
await vscode.workspace.fs.writeFile(uri, encodedContent);
```

**Why**:
- Cross-platform path handling (Windows \ vs Unix /)
- Respects workspace folder boundaries
- Works with remote development (SSH, Codespaces)
- Triggers VS Code's file watching automatically

## Production-Ready Features

### Type Safety
- **TypeScript strict mode enabled** (`strict: true` in tsconfig.json)
- All code passes type checking: 0 errors, 0 warnings
- Explicit types on public APIs

### Error Handling
- Specific error detection for HTTP status codes (404 → model not found, 503 → server busy)
- Helpful error messages guide users to settings or configuration
- Timeout handling with AbortController for clean cancellation

### Test Coverage
- **52 unit tests** covering:
  - LLMClient initialization, configuration, API contracts
  - Command parsing (regex patterns for /read, /write, /suggestwrite)
  - Error scenarios (connection failures, timeouts, invalid endpoints)
  - File path validation and resolution
  - Message formatting
- Run with: `npm test` (100% pass rate)

### Extensibility

Three clear extension points for Phase 2:

1. **New LLM Commands**: Add regex pattern + handler in `extension.ts`
2. **LLM Client Enhancements**: Extend `LLMClient` class with new capabilities
3. **Webview Features**: Enhance UI in `webviewContent.ts`

See [ROADMAP.md](https://github.com/odanree/llm-local-assistant/blob/main/ROADMAP.md) for planned enhancements.

## 📦 Configuration Reference

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `llm-assistant.endpoint` | string | `http://localhost:11434` | LLM server endpoint |
| `llm-assistant.model` | string | `mistral` | Model name |
| `llm-assistant.temperature` | number | `0.7` | Response randomness (0-1, higher=creative) |
| `llm-assistant.maxTokens` | number | `2048` | Max response length in tokens |
| `llm-assistant.timeout` | number | `30000` | Request timeout in milliseconds |

## 🔧 Development

### Build
```bash
npm run compile       # Single build
npm run watch        # Auto-rebuild on changes
npm run package      # Production bundle
```

### Testing
```bash
npm test                    # Run all tests
npm run test:coverage       # Coverage report
npm run test:ui            # Interactive test UI
```

### Linting
```bash
npm run lint         # ESLint validation
```

### Debug
Press `F5` in VS Code to launch extension in debug mode with breakpoints.

## 🗺️ Roadmap

See [ROADMAP.md](https://github.com/odanree/llm-local-assistant/blob/main/ROADMAP.md) for planned features including:
- GitHub Copilot Agent Mode integration
- Persistent conversation history
- Custom system prompts
- Code-aware context injection

## 📚 Documentation

- **[ARCHITECTURE.md](https://github.com/odanree/llm-local-assistant/blob/main/ARCHITECTURE.md)** - Deep dive into component design
- **[PROJECT_STATUS.md](https://github.com/odanree/llm-local-assistant/blob/main/PROJECT_STATUS.md)** - Development phase tracking
- **[QUICK_REFERENCE.md](https://github.com/odanree/llm-local-assistant/blob/main/QUICK_REFERENCE.md)** - Developer quick start
- **[CHANGELOG.md](https://github.com/odanree/llm-local-assistant/blob/main/CHANGELOG.md)** - Version history
- **[CONTRIBUTING.md](https://github.com/odanree/llm-local-assistant/blob/main/CONTRIBUTING.md)** - Contribution guidelines

For advanced topics, see `/docs/` folder.

## 🐛 Troubleshooting

**"Cannot connect to endpoint"**
- Verify LLM server is running and accessible
- Check endpoint URL in settings
- Test manually: `curl http://localhost:11434/api/tags`

**"Model not found"**
- Verify model exists: `ollama list`
- Download if needed: `ollama pull mistral`
- Update `llm-assistant.model` setting

**"Request timeout"**
- Increase `llm-assistant.timeout` (default 30000ms)
- Try shorter prompts or smaller models
- Check server logs for errors

**Slow responses?**
- Reduce `maxTokens` for shorter responses
- Try a smaller/faster model
- Ensure server has adequate resources

## 🔒 Privacy & Security

✅ **100% Local & Private**
- Zero external API calls or cloud dependencies
- Your code and conversations never leave your machine
- Works completely offline after model is downloaded
- No telemetry or tracking

## 📄 License

MIT License - See LICENSE file for details

---

**Local • Private • Offline-First AI Assistant for VS Code** 🚀
