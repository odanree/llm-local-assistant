# Quick Reference Guide

## 🚀 Getting Started (5 min)

### 1. Start Your LLM Server
```bash
# Ollama
ollama run mistral

# LM Studio
# Download from https://lmstudio.ai and start local server
```

### 2. Install & Compile Extension
```bash
cd llm-local-assistant
npm install
npm run compile
# Or: npm run watch (for development)
```

### 3. Configure (Optional)
VS Code Settings → Search "llm-assistant"
```json
{
  "llm-assistant.endpoint": "http://localhost:11434",
  "llm-assistant.model": "mistral"
}
```

### 4. Use It
- Click **LLM Assistant** button in status bar
- Type your question
- Press Enter to chat

---

## 💬 Chat Commands

### Normal Chat
```
You: "What's the best way to handle errors in TypeScript?"
LLM: [streaming response...]
```

### Read Files
```
/read src/main.ts
→ Displays file content in code block
```

### Generate & Write Files
```
/write src/greeting.ts write a TypeScript greeter function
→ LLM generates code, writes to file
→ Shows success with file preview
```

### Suggest & Approve Changes
```
/suggestwrite src/config.ts add environment variable validation
→ LLM generates code
→ Shows confirmation dialog
→ Write only if you click "Yes"
```

---

## ⚙️ Configuration

| Setting | Default | Purpose |
|---------|---------|---------|
| `endpoint` | `http://localhost:11434` | LLM server URL |
| `model` | `mistral` | Model name |
| `temperature` | `0.7` | Creativity (0-1) |
| `maxTokens` | `2048` | Max response length |
| `timeout` | `30000` | Request timeout (ms) |

### Custom Ollama Port
```json
{
  "llm-assistant.endpoint": "http://127.0.0.1:9000"
}
```

---

## 🔧 Development

### Build
```bash
npm run compile    # One-time build
npm run watch      # Watch mode (auto-rebuild)
npm run lint       # Check code style
```

### Debug
```bash
Press F5 in VS Code
→ Opens extension in new VS Code window
→ Debug with breakpoints, console, etc.
```

### Test LLM Connection
```bash
Ctrl+Shift+P → "Test LLM Connection"
→ Shows success/failure message
```

---

## 🐛 Troubleshooting

### Connection Failed
```
✗ "Could not connect to LLM server"

Solutions:
1. Verify LLM is running: ollama run mistral
2. Check endpoint URL is correct
3. Verify firewall allows localhost access
4. Restart VS Code
```

### Model Not Found
```
✗ "Model 'mistral' not found"

Solutions:
1. List available: ollama list
2. Pull model: ollama pull mistral
3. Update "model" setting to existing model name
```

### Timeout Errors
```
✗ "Request timeout after 30000ms"

Solutions:
1. Increase timeout: "llm-assistant.timeout": 60000
2. Reduce maxTokens to speed up response
3. Try shorter/simpler prompt
4. Check LLM server has enough RAM
```

### Commands Not Working
```
✗ "/read" or "/write" not responding

Solutions:
1. Open a folder in VS Code (File → Open Folder)
2. Use relative paths: /read src/main.ts
3. Check path exists: /read . (reads project root)
4. Check file permissions
```

---

## 📁 File Paths

### Valid Examples
```
/read src/main.ts           ✅
/read ./src/main.ts         ✅
/read package.json          ✅
/read dist/extension.js     ✅

/read /absolute/path        ❌ (must be relative)
/read nonexistent.ts        ❌ (file not found)
/read ../../../etc/passwd   ⚠️  (outside workspace)
```

### Path Tips
- Use relative paths from workspace root
- `.` refers to workspace root
- `..` goes up one level (workspace-safe)
- Paths are case-sensitive on Linux/Mac

---

## 📊 LLM Models Tested

### ✅ Verified Working
- Mistral 7B (recommended, fast & accurate)
- Neural Chat 7B
- Orca 2 13B
- Llama 2 7B

### Performance
```
Speed:    Mistral > Neural Chat > Orca > Llama 2
Quality:  Orca > Llama 2 > Mistral > Neural Chat
Memory:   Mistral (4GB) > Neural Chat > Orca > Llama 2

Recommendation: Mistral (best balance)
```

---

## 🎯 Common Use Cases

### Code Review
```
User: "Review this code for security issues"
     [paste code here]
LLM: [analyzes and provides feedback]
```

### Generate Boilerplate
```
/write src/utils/validation.ts create email validation utilities
→ LLM generates complete validation functions
```

### Understand Code
```
/read src/complex-algorithm.ts
User: "Explain this algorithm step by step"
LLM: [detailed explanation with references to code]
```

### Refactor with Approval
```
/suggestwrite src/old-code.ts modernize this to ES2020
→ Review suggestions
→ Click Yes to apply
```

---

## 🚀 Advanced Tips

### Using with VS Code Workspace
```bash
# Open workspace-specific LLM chat
code --extensions-dir . llm-local-assistant.code-workspace

# Create multiple VS Code instances with different LLM models
# (useful for comparing responses)
```

### Streaming Large Files
```
# For large /write operations, chat will stream in real-time
# You can see tokens appearing one by one
# Ctrl+C to cancel if needed (not yet supported, coming Phase 2)
```

### Context Awareness
```
Best Practice:
1. /read relevant files first
2. Chat about changes needed
3. Use /suggestwrite to preview
4. Use /write for final version

This way LLM understands context better
```

### Multiple Commands in One Prompt
```
You: Read the config file and generate validation. 
     /read config.ts
     /write validation.ts validate the config based on the schema
```

---

## 📚 Next Steps

### Want to Contribute?
1. Read ARCHITECTURE.md (understand code structure)
2. Check ROADMAP.md (see what needs work)
3. Pick a Phase 2 item to implement
4. Submit PR with tests

### Want to Learn More?
1. Read ARCHITECTURE.md for technical details
2. Read ROADMAP.md for product vision
3. Review source code: src/extension.ts, src/llmClient.ts
4. Check PROJECT_STATUS.md for metrics & roadmap

### Want Advanced Features?
See ROADMAP.md for:
- Phase 2: Agent loop & error correction
- Phase 3: Smart debugging
- Phase 4: VS Code integration
- Phase 5: External tool APIs
- Phase 6: Mission Control UI
- Phase 7: Enterprise features

---

## 🎓 Architecture Crash Course

```
User Types in Chat
    ↓
Webview captures input
    ↓
Extension.ts processes command
    ↓
Regex checks for /read, /write, /suggestwrite
    ↓
If file operation: File I/O
If chat: LLMClient.sendMessageStream()
    ↓
HTTP → Ollama/LM Studio → LLM Model
    ↓
Streaming tokens back
    ↓
Webview renders in real-time
```

---

## 📞 Getting Help

### Check These First
1. README.md - General guide
2. ARCHITECTURE.md - Technical questions
3. ROADMAP.md - Planned features
4. This quick ref - Common issues

### Still Stuck?
1. Enable console logging in debugger (F12)
2. Check Extension Host output panel
3. Verify LLM server is responding: `curl localhost:11434/api/tags`
4. Try with simpler prompt/file
5. Review error message carefully (usually has a hint)

---

## 🎉 Pro Tips

1. **Combine commands in chat context**
   - Read files, ask questions, then generate variations
   
2. **Use /suggestwrite for important changes**
   - Safer than /write, gives you time to review

3. **Test connection after config changes**
   - Cmd+Shift+P → "Test LLM Connection"

4. **Keep prompts specific**
   - "Generate a React component" → "Generate a React date picker component with props for minDate and maxDate"

5. **Use temperature wisely**
   - Lower (0.3): Deterministic (code generation)
   - Higher (0.9): Creative (brainstorming)

---

Last Updated: November 2025  
Status: ✅ Current & Accurate
