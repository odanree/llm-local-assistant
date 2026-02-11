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

**Option A: From Marketplace (Easiest)**
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search: "LLM Local Assistant"
4. Click Install
5. Reload VS Code

**Option B: From Release**
1. Go to [Latest Release](https://github.com/odanree/llm-local-assistant/releases)
2. Download `.vsix` file
3. In terminal: `code --install-extension llm-local-assistant-*.vsix`
4. Reload VS Code

**Option C: From Source**
```bash
git clone https://github.com/odanree/llm-local-assistant.git
cd llm-local-assistant
npm install
npm run build
npm run watch  # Auto-rebuild on changes
```
Then press `F5` to launch debug window.

### 3. Configure (Optional)

If your LLM isn't at default localhost:11434:

1. Open VS Code Settings (`Ctrl+,`)
2. Search for "llm-assistant"
3. Set your endpoint and model

**Example: LM Studio on port 8000**
```json
{
  "llm-assistant.endpoint": "http://localhost:8000",
  "llm-assistant.model": "your-model-name"
}
```

### 4. Setup Voice Narration (Optional)

```
Press Cmd+Shift+P → LLM Assistant: Setup Voice Narration
```

Follow the setup wizard to install voice synthesis.

### 5. Use It!

1. Select code or open a file
2. Press `Cmd+Shift+E` (or use Command Palette: `/explain`)
3. Audio explanation plays automatically (if voice enabled)
4. Try other commands with `/help`

---

## Customize Your Model with ModelFile

v2.6 supports **Ollama ModelFile** for custom model configuration. This lets you adjust:
- **Temperature** (warmth/creativity)
- **Context window** (how much code it remembers)
- **System prompt** (AI personality and instructions)
- **Other parameters** (top_k, top_p, etc.)

### Create a Custom Model

**Step 1: Create a Modelfile**

```dockerfile
# File: MyModelfile (no extension)
FROM mistral

# Adjust warmth (0 = precise, 1 = creative)
PARAMETER temperature 0.7
PARAMETER top_k 40
PARAMETER top_p 0.9

# System prompt defines AI behavior
SYSTEM """You are a helpful code assistant.
- Explain code clearly and concisely
- Provide practical examples
- Consider edge cases
- Be direct and helpful
"""
```

**Step 2: Create the Model**

```bash
ollama create my-code-assistant -f MyModelfile
```

**Step 3: Configure Extension**

Open VS Code Settings (`Ctrl+,`):
```json
{
  "llm-assistant.model": "my-code-assistant"
}
```

**Step 4: Use It!**

```
Select code → Press Cmd+Shift+E → Enjoy!
```

---

## ModelFile Recipes

### Conservative Model (Production Code)

Use for critical code review and refactoring:

```dockerfile
FROM mistral
PARAMETER temperature 0.3
PARAMETER top_k 20
PARAMETER top_p 0.8

SYSTEM """You are a precise code assistant specializing in production code.
- Be direct and concise
- Focus on correctness and reliability
- Explain potential issues
- Suggest best practices
- Avoid unnecessary complexity
"""
```

**Create:** `ollama create production-assistant -f Modelfile`

### Balanced Model (Default Recommended)

Use for everyday code work:

```dockerfile
FROM mistral
PARAMETER temperature 0.7
PARAMETER top_k 40
PARAMETER top_p 0.9

SYSTEM """You are a helpful code assistant.
- Explain code clearly
- Balance detail with brevity
- Provide working examples
- Consider context and use cases
- Be practical and supportive
"""
```

**Create:** `ollama create code-assistant -f Modelfile`

### Creative Model (Design & Exploration)

Use for architecture decisions and new designs:

```dockerfile
FROM mistral
PARAMETER temperature 0.9
PARAMETER top_k 50
PARAMETER top_p 0.95

SYSTEM """You are a creative code assistant specializing in design.
- Explore multiple approaches
- Explain design trade-offs
- Consider alternatives
- Discuss architectural patterns
- Be thoughtful and thorough
"""
```

**Create:** `ollama create design-assistant -f Modelfile`

### Context-Aware Model (Large Projects)

Use for understanding large codebases:

```dockerfile
FROM mistral
PARAMETER temperature 0.7
PARAMETER num_ctx 8192
PARAMETER top_k 40

SYSTEM """You are a code assistant specialized in understanding large systems.
- Remember project context
- Understand cross-file relationships
- Explain system design
- Find patterns and connections
"""
```

**Create:** `ollama create context-assistant -f Modelfile`

---

## Detailed Setup by Platform

### macOS

**Using Homebrew**
```bash
brew install ollama
brew services start ollama
ollama run mistral
```

Then install extension from Marketplace.

**Create Custom Model**
```bash
# Edit Modelfile in your preferred editor
vim MyModelfile

# Create model
ollama create my-assistant -f MyModelfile

# Configure extension
# VS Code Settings → llm-assistant.model → my-assistant
```

### Windows

**Using Ollama**
1. Download from https://ollama.ai
2. Run installer
3. Open PowerShell:
```powershell
ollama run mistral
```

**Create Custom Model**
```powershell
# Create Modelfile (use Notepad or your editor)
# Save as: MyModelfile (no .txt extension)

# In PowerShell:
ollama create my-assistant -f MyModelfile
```

**Using LM Studio**
1. Download from https://lmstudio.ai
2. Run installer and start server
3. Install extension from Marketplace

### Linux

**Using Ollama**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
ollama run mistral
```

**Create Custom Model**
```bash
# Create Modelfile
vim MyModelfile

# Create model
ollama create my-assistant -f MyModelfile
```

---

## Voice Narration Setup

### Installation (First Time Only)

```
Press Cmd+Shift+P → LLM Assistant: Setup Voice Narration
```

The setup wizard will:
1. Check Python 3.8+
2. Install edge-tts (cloud TTS)
3. Verify setup

### Configuration

Open VS Code Settings (`Ctrl+,`) and search "voice":

- **voice.enabled** - Enable/disable voice narration
- **voice.speed** - Playback speed (0.5x to 2.0x)
- **voice.language** - Language (en for English, zh for Chinese)
- **voice.cacheEnabled** - Cache audio files for faster replay
- **pythonPath** - Path to Python (auto-detected on Windows/Unix)

### Using Voice

```
1. Select code or open a file
2. Press Cmd+Shift+E (or /explain in chat)
3. Explanation appears with audio player
4. Use player controls: play, pause, seek, volume
```

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

**Problem**: Model name doesn't match or isn't created yet

**Solutions**:
1. List available models:
   ```bash
   ollama list
   ```

2. Update setting with correct model name:
   - VS Code Settings → `llm-assistant.model`
   - Should match exactly (case-sensitive)

3. Create custom model if needed:
   ```bash
   ollama create my-model -f MyModelfile
   ```

### Voice Setup Fails

**Problem**: Python not found or dependencies missing

**Solutions**:
1. Check Python is installed:
   ```bash
   python --version      # Windows
   python3 --version     # macOS/Linux
   ```

2. Re-run setup:
   ```
   Cmd+Shift+P → LLM Assistant: Setup Voice Narration
   ```

3. Check extension output:
   ```
   View → Output → Extension Host
   ```

### Audio Not Playing

**Problem**: Voice enabled but no sound

**Solutions**:
1. Check voice is enabled:
   - VS Code Settings → `llm-assistant.voice.enabled`
   - Should be `true`

2. Check system volume (not muted)

3. Run voice test:
   ```
   Cmd+Shift+P → LLM Assistant: Test Voice Narration
   ```

4. If test fails, re-run setup:
   ```
   Cmd+Shift+P → LLM Assistant: Setup Voice Narration
   ```

### Extension doesn't appear

**Problem**: Extension failed to activate

**Solutions**:
1. Check VS Code version (needs 1.85+)
2. Open Command Palette (`Ctrl+Shift+P`)
3. Search "Developer: Show Logs" → Extension Host
4. Look for error messages
5. Try reinstalling extension

### Slow/Hanging Responses

**Problem**: Responses take too long or hang

**Solutions**:
1. Check model size (7B is faster than 70B)
2. Use ModelFile to adjust temperature:
   ```dockerfile
   FROM mistral
   PARAMETER temperature 0.5
   ```
3. Increase timeout in settings:
   ```json
   {
     "llm-assistant.timeout": 60000
   }
   ```
4. Check system resources (RAM, GPU)

---

## System Requirements

- **VS Code**: 1.85+
- **Node.js**: 16+ (for development only)
- **Python**: 3.8+ (for voice narration - optional)
- **RAM**: 4GB+ (8GB+ recommended for larger models)
- **LLM Server**: Ollama, LM Studio, or vLLM running locally
- **Network**: Only localhost communication (no internet required for local TTS)

---

## Next Steps

After successful installation:

1. **Create a custom model** using ModelFile (optional but recommended)
2. **Setup voice narration** (optional)
3. **Read [README.md](../README.md)** for feature overview
4. **Try example commands** - Select code and press Cmd+Shift+E
5. **Report issues** on GitHub if needed

---

## Getting Help

- **Command help**: Type `/help` in the extension chat
- **Documentation**: See [README.md](../README.md) and docs folder
- **Issues**: https://github.com/odanree/llm-local-assistant/issues
- **Discussions**: https://github.com/odanree/llm-local-assistant/discussions

