# LLM Local Assistant - VS Code Extension

A VS Code extension that integrates with your local LLM (Ollama, LM Studio, etc.) to provide intelligent code assistance, autonomous file operations, and chat capabilities directly in your editor.

> ⚠️ **DOCUMENTATION CONSTRAINT**: The root directory contains a fixed set of documentation files: README.md, ROADMAP.md, ARCHITECTURE.md, PROJECT_STATUS.md, QUICK_REFERENCE.md, and CHANGELOG.md. No additional .md or .txt files should be created in root.

## ✨ Features

- 🤖 **Local LLM Chat** - Chat with your local LLM without sending data to external servers
- 🔄 **Agent Mode Commands** - File operations powered by your LLM:
  - `/read <path>` - Read files from your workspace
  - `/write <path> [prompt]` - Generate content and write to files via LLM
  - `/suggestwrite <path> [prompt]` - LLM suggests changes, you approve before writing
- ⚙️ **Fully Configurable** - Customize endpoint, model, temperature, and more via VS Code settings
- 💬 **Conversation Context** - Maintains chat history for coherent conversations
- 🚀 **Quick Access** - Open chat with a single click from the status bar
- 🔒 **100% Private** - All processing on your machine
- ⚡ **Streaming Support** - Real-time token streaming for responsive UX

## 📋 Prerequisites

You need a local LLM server. Choose one:

### Ollama (Recommended)
```bash
ollama run mistral
# Server: http://localhost:11434
```

### LM Studio
```bash
# Download from https://lmstudio.ai
# Start local server on http://localhost:8000
```

### vLLM
```bash
python -m vllm.entrypoints.openai.api_server \
  --model mistral-7b-instruct-v0.2 \
  --port 11434
```

## 🚀 Getting Started

### 1. Install the Extension
```bash
npm install
npm run compile
# Or for development watch mode:
npm run watch
```

### 2. Configure Your LLM Endpoint

Open VS Code Settings and set:

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

### 3. Test Connection

Click `LLM Assistant` in the status bar → Use the "Test Connection" command

## 💡 Usage

### Chat
Simply type messages in the chat panel and press Enter to get LLM responses.

### Agent Mode Commands

#### Read Files
```
/read src/main.ts
```
The LLM will read the file and display its contents.

#### Write Files (LLM Generated)
```
/write src/greeting.ts write a TypeScript function that greets users
```
The LLM generates content based on your prompt and writes to the file.

#### Suggest Changes
```
/suggestwrite src/config.ts add validation for the API endpoint
```
The LLM generates changes, shows you a preview, and you approve before writing.

## 🏗️ Architecture

### Core Files

- `src/extension.ts` - Main extension logic, command handlers, webview management
- `src/llmClient.ts` - LLM API client (streaming & non-streaming support)
- `src/webviewContent.ts` - Chat UI HTML/CSS/JavaScript

### Key Features

- **Streaming Support**: Real-time token streaming for responsive chat
- **Error Handling**: Comprehensive try-catch with user-friendly error messages
- **Directory Creation**: Auto-creates parent directories for `/write` operations
- **Regex-based Command Detection**: Flexible command parsing anywhere in messages

## 🔧 Development

### Build
```bash
npm run compile
```

### Watch Mode
```bash
npm run watch
```

### Run Tests
```bash
npm run test
```

### Debug
Press F5 in VS Code to launch the extension in debug mode.

## 📦 Configuration Reference

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `llm-assistant.endpoint` | string | `http://localhost:11434` | LLM server endpoint |
| `llm-assistant.model` | string | `mistral` | Model name |
| `llm-assistant.temperature` | number | `0.7` | Response randomness (0-1) |
| `llm-assistant.maxTokens` | number | `2048` | Max response length |
| `llm-assistant.timeout` | number | `30000` | Request timeout (ms) |

## 🗺️ Roadmap

See [ROADMAP.md](./ROADMAP.md) for planned features including GitHub Copilot Agent Mode integration.

## 📄 License

MIT
# LLM Local Assistant - VS Code Extension

A VS Code extension that integrates with your local LLM (like Mistral 7B via Ollama or LM Studio) to provide intelligent code assistance and chat directly in your editor.

## Features

✨ **Key Features**

- 🤖 **Local LLM Chat** - Chat with your local LLM without sending data to external servers
- ⚙️ **Fully Configurable** - Customize endpoint, model, temperature, and more via VS Code settings
- 💬 **Conversation Context** - Maintains chat history across messages for coherent conversations
- 🚀 **Quick Access** - Open chat with a single click from the status bar
- 🔒 **100% Private** - All processing on your machine - your code never leaves your computer
- ⚡ **Fast** - Optimized for local LLM inference

## Prerequisites

You need a local LLM server. Choose one:

### Ollama (Recommended)
```bash
ollama run mistral
# Server: http://localhost:11434
```

### LM Studio
1. Download from https://lmstudio.ai
2. Load a model and start the local server
3. Configure endpoint in extension settings

### llama.cpp Server
```bash
./server -m model.gguf
```

## Installation & Setup

1. Clone/download this repository
2. Open in VS Code: `code VsCode-extension/`
3. Install dependencies: `npm install`
4. Compile: `npm run compile`
5. Press `F5` to launch extension in debug mode

## Configuration

Open VS Code Settings (`Ctrl+,`) and search for "llm-assistant":

```json
{
  "llm-assistant.endpoint": "http://localhost:11434",
  "llm-assistant.model": "mistral",
  "llm-assistant.temperature": 0.7,
  "llm-assistant.maxTokens": 2048,
  "llm-assistant.timeout": 30000
}
```

| Setting | Default | Purpose |
|---------|---------|---------|
| endpoint | `http://localhost:11434` | LLM server URL |
| model | `mistral` | Model name |
| temperature | `0.7` | Creativity (0-2) |
| maxTokens | `2048` | Max response length |
| timeout | `30000` | Request timeout (ms) |

## Usage

### Open Chat
- Click **🤖 LLM Assistant** in status bar
- Or: `Ctrl+Shift+P` → "Open LLM Chat"

### Send Messages
- Type your question
- Press `Enter` or click Send
- Continue the conversation

### Clear History
- Click **Clear** to start fresh

### Test Connection
- Run: `Ctrl+Shift+P` → "Test LLM Connection"

## Troubleshooting

**Connection Failed?**
- Verify LLM server is running
- Check endpoint URL in settings
- Restart VS Code

**Model Not Found?**
- List available: `ollama list`
- Pull model: `ollama pull mistral`
- Update model name in settings

**Slow Responses?**
- Reduce `maxTokens`
- Try smaller model
- Ensure server has enough RAM

**Timeout?**
- Increase `timeout` setting
- Ask shorter questions

## Architecture

```
VS Code Extension
    ↓ (HTTP)
LLM Server (Ollama/LM Studio)
    ↓
LLM Model (Mistral/Neural Chat/Orca)
```

## Development

### Build Commands
```bash
npm run compile       # One-time compile
npm run watch        # Watch mode
npm run lint         # Lint code
npm run package      # Production build
```

### Project Files
- `src/extension.ts` - Main extension logic
- `src/llmClient.ts` - LLM HTTP client
- `src/webviewContent.ts` - Chat UI

### Debug
Press `F5` to launch VS Code with extension

## Privacy

✅ **100% Local & Private**
- Zero external API calls
- Your code never leaves your machine
- Works offline after model download
- No telemetry

## Future Enhancements

- Streaming responses (real-time tokens)
- Code context awareness
- Custom system prompts
- Multiple threads
- Keyboard shortcuts
- Message history export

## Support

Having issues? Check:
1. LLM server is running and accessible
2. Model name exists and is downloaded
3. Settings are correctly configured
4. VS Code Output panel for errors

## License

MIT License

---

**Local • Private • Open Source AI Assistant** 🚀

\!\[feature X\]\(images/feature-x.png\)

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Requirements

If you have any requirements or dependencies, add a section describing those and how to install and configure them.

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.
* `myExtension.thing`: Set to `blah` to do something.

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
