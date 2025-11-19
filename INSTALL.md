# Installation Guide

## Quick Start (30 seconds)

### 1. Start Your LLM Server

**Ollama (Recommended)**
```bash
ollama run mistral
```

**LM Studio**
- Download from https://lmstudio.ai
- Load a model and start server on port 8000

**vLLM**
```bash
python -m vllm.entrypoints.openai.api_server \
  --model mistral-7b-instruct-v0.2 \
  --port 11434
```

### 2. Install Extension

**Option A: From Release (Easiest)**
1. Go to [Latest Release](https://github.com/odanree/llm-local-assistant/releases)
2. Download `llm-local-assistant-0.0.1.vsix`
3. In terminal: `code --install-extension llm-local-assistant-0.0.1.vsix`
4. Reload VS Code

**Option B: From Source**
```bash
git clone https://github.com/odanree/llm-local-assistant.git
cd llm-local-assistant
npm install
npm run compile
npm run watch  # Auto-rebuild on changes
```
Then press `F5` to launch debug window.

### 3. Configure (Optional)

If your LLM isn't at default localhost:11434:

1. Open VS Code Settings (`Ctrl+,`)
2. Search for "llm-assistant"
3. Set your endpoint and model

**Example: LM Studio on default port**
```json
{
  "llm-assistant.endpoint": "http://localhost:8000",
  "llm-assistant.model": "your-model-name"
}
```

### 4. Use It!

1. Click **LLM Assistant** button in status bar (bottom right)
2. Type a message and press Enter
3. Try these commands:
   - `/read src/main.ts` - Read a file
   - `/write test.ts generate a hello world function` - Create a file
   - `/git-commit-msg` - Generate commit message from staged changes
   - `/auto-docs` - Generate project documentation

---

## Detailed Setup by Platform

### macOS

**Using Homebrew**
```bash
brew install ollama
brew services start ollama
ollama run mistral
```

Then install extension as described above.

### Windows

**Using Ollama**
1. Download from https://ollama.ai
2. Run installer
3. Open PowerShell and run:
```powershell
ollama run mistral
```

**Using LM Studio**
1. Download from https://lmstudio.ai
2. Run installer
3. Load model and start server
4. Install extension VSIX file

### Linux

**Using Ollama**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
ollama run mistral
```

**Using LM Studio**
- Download AppImage or use Flatpak
- Start local server
- Install extension VSIX

---

## Troubleshooting

### "Connection refused" error

**Problem**: Extension can't connect to LLM server

**Solutions**:
1. Make sure LLM server is running
   ```bash
   # Ollama
   ollama run mistral
   
   # LM Studio
   # Start from GUI
   ```

2. Check endpoint in VS Code Settings
   - Press `Ctrl+,` → search "llm-assistant.endpoint"
   - Should match your server address

3. Test connection manually:
   ```bash
   curl http://localhost:11434/api/tags
   # Should return model list
   ```

### "Model not found" error

**Problem**: Model name doesn't match available models

**Solutions**:
1. List available models:
   ```bash
   ollama list
   ```

2. Update setting with correct model name:
   - VS Code Settings → `llm-assistant.model`
   - Should match exactly (case-sensitive)

3. Pull new model if needed:
   ```bash
   ollama pull llama2
   ```

### Extension doesn't appear in status bar

**Problem**: Extension failed to activate

**Solutions**:
1. Check VS Code version (needs 1.80+)
2. Open Command Palette (`Ctrl+Shift+P`)
3. Search "Developer: Show Logs" → Extension Host
4. Look for error messages
5. Try reinstalling extension

### Slow/Hanging Responses

**Problem**: Responses take too long or hang

**Solutions**:
1. Check model size (7B is faster than 70B)
2. Increase timeout in settings:
   ```json
   {
     "llm-assistant.timeout": 60000
   }
   ```
3. Reduce `maxTokens`:
   ```json
   {
     "llm-assistant.maxTokens": 1024
   }
   ```
4. Check system resources (RAM, GPU)

### VSIX Installation Issues

**On Windows PowerShell**
```powershell
# Use full path if needed
code --install-extension "C:\path\to\llm-local-assistant-0.0.1.vsix"
```

**On macOS/Linux**
```bash
# Make sure vscode command is available
which code
# If not found, add to PATH or use full path
/usr/local/bin/code --install-extension llm-local-assistant-0.0.1.vsix
```

---

## System Requirements

- **VS Code**: 1.80+
- **Node.js**: 16+ (for development only)
- **RAM**: 4GB+ (8GB+ recommended for larger models)
- **LLM Server**: Ollama, LM Studio, or vLLM running locally
- **Network**: Only localhost communication (no internet required)

---

## Next Steps

After successful installation:

1. **Read [README.md](README.md)** for full feature overview
2. **Check [ARCHITECTURE.md](https://github.com/odanree/llm-local-assistant/blob/main/ARCHITECTURE.md)** for technical details
3. **Review commands** in VS Code with `/help` in chat

**Need help?** Open an issue on GitHub!
