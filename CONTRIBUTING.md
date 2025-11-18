# Contributing to LLM Local Assistant

Thank you for your interest in contributing! This guide will help you understand how to develop, test, and submit contributions to the LLM Local Assistant project.

---

## Getting Started

### Prerequisites
- **Node.js** 18+ (check with `node --version`)
- **VS Code** 1.106+ (for testing the extension)
- **Local LLM Server** (Ollama, LM Studio, or vLLM) running during testing

### Initial Setup
```bash
# Clone and install
git clone https://github.com/YOUR-USERNAME/llm-local-assistant.git
cd llm-local-assistant
npm install

# Verify setup
npm run lint
npm run compile
```

---

## Development Workflow

### 1. Build Commands
```bash
npm run watch          # Auto-rebuild on file changes (recommended for dev)
npm run compile        # One-time build
npm run lint           # ESLint validation
npm run package        # Production build with source maps hidden
```

### 2. Running the Extension
- **Press F5** in VS Code to launch extension in debug window
- Extension reloads automatically when code changes (with watch mode running)
- Check Debug Console (Shift+Ctrl+Y) for logs prefixed `[LLM Assistant]`

### 3. Testing Your Changes
```bash
# Start your LLM server
ollama run mistral

# In VS Code debug window, test:
# 1. Click "LLM Assistant" in status bar
# 2. Type a normal chat message
# 3. Test /read src/extension.ts
# 4. Test /write temp-test.ts write a hello world function
# 5. Test /suggestwrite temp-test.ts improve the function
# 6. Verify history resets when panel closes/reopens
```

---

## Project Structure

```
src/
├── extension.ts         # Main handler: commands, agent parsing, webview mgmt
├── llmClient.ts         # LLM communication: streaming, non-streaming, history
└── webviewContent.ts    # Chat UI: HTML/CSS/JS webview content

Documentation (root):
├── README.md            # User-facing guide
├── ARCHITECTURE.md      # Technical design & data flows
├── ROADMAP.md           # Product vision & phases
├── QUICK_REFERENCE.md   # Developer cheat sheet
├── CHANGELOG.md         # Version history
└── PROJECT_STATUS.md    # Project state & cleanup summary

Build & Config:
├── package.json         # Dependencies, scripts, VS Code config
├── tsconfig.json        # TypeScript config
├── webpack.config.js    # Bundler config
└── eslint.config.mjs    # Linter config
```

---

## Code Patterns & Conventions

### Agent Command Parsing

Commands are regex-based. Keep patterns tight and unambiguous:

```typescript
// ❌ DON'T: Ambiguous whitespace
const match = text.match(/\/read\s+(.+)/);

// ✅ DO: Explicit boundaries
const match = text.match(/\/read\s+(\S+)/);

// ✅ Optional prompts with proper anchoring
const match = text.match(/\/write\s+(\S+)(?:\s+(.+))?$/);
```

### File I/O

Always use VS Code's URI-based API with proper encoding:

```typescript
// ❌ DON'T: Node fs
const fs = require('fs');
fs.readFileSync(path);

// ✅ DO: VS Code fs + TextEncoder/Decoder
const data = await vscode.workspace.fs.readFile(fileUri);
const content = new TextDecoder('utf-8').decode(data);

await vscode.workspace.fs.writeFile(
  fileUri, 
  new TextEncoder().encode(content)
);
```

### Error Handling

Wrap user-triggered operations in try-catch, always send errors to webview:

```typescript
try {
  // operation
} catch (err) {
  chatPanel?.webview.postMessage({
    command: 'addMessage',
    error: err instanceof Error ? err.message : String(err),
    success: false,
  });
}
```

### Streaming vs. Non-Streaming

The extension detects non-default Ollama ports and uses non-streaming mode:

```typescript
const isOllamaNonDefaultPort = 
  endpoint.includes("127.0.0.1:9000") || 
  endpoint.includes("localhost:9000");

if (isOllamaNonDefaultPort) {
  const response = await llmClient.sendMessage(text);
} else {
  const response = await llmClient.sendMessageStream(text, onToken);
}
```

---

## Documentation Constraints

### Fixed Root Files
The following files exist in root and **should NOT be duplicated**:
- `README.md` - User guide
- `ARCHITECTURE.md` - Technical design
- `ROADMAP.md` - Product roadmap
- `QUICK_REFERENCE.md` - Developer cheat sheet
- `CHANGELOG.md` - Version history
- `PROJECT_STATUS.md` - Project state

**Updates go TO existing files, not new ones.**

### Creating New Docs
If you need a new documentation file:
- **Don't**: Create `/NEWDOC.md` in root
- **Do**: Create in `/docs/NEWDOC.md` or update an existing root file

---

## Submission Guidelines

### Before Submitting a PR

1. **Run the linter**
   ```bash
   npm run lint
   ```
   Fix any errors. ESLint config is in `eslint.config.mjs`.

2. **Test locally**
   - Build: `npm run compile`
   - Run extension in debug mode (F5)
   - Test the specific feature you changed
   - Verify no regressions in chat, /read, /write, /suggestwrite

3. **Update documentation**
   - If adding a feature: Update README.md usage section
   - If adding a setting: Update package.json `contributes.configuration`
   - If fixing a bug: Add entry to CHANGELOG.md

4. **Check git status**
   ```bash
   git status
   # Should NOT include dist/ or node_modules/
   # Check .gitignore if they appear
   ```

### PR Title & Description

**Title format**:
```
[feature|fix|docs|refactor] Brief description (< 60 chars)
```

**Examples**:
- `[feature] Add timeout configuration setting`
- `[fix] Handle missing workspace folder gracefully`
- `[docs] Update ARCHITECTURE.md with streaming flow`

**Description template**:
```
## What does this PR do?
Brief summary of changes.

## Why?
Motivation or problem being solved.

## Testing
How did you verify this works?
- Started Ollama at localhost:11434
- Tested /read command with src/extension.ts
- Verified error handling with invalid path
```

---

## Common Development Tasks

### Adding a New Setting

1. **Update package.json** (`contributes.configuration`):
   ```json
   {
     "llm-assistant.newSetting": {
       "type": "string",
       "default": "defaultValue",
       "description": "What this does"
     }
   }
   ```

2. **Read in extension.ts**:
   ```typescript
   const config = vscode.workspace.getConfiguration('llm-assistant');
   const value = config.get('newSetting', 'defaultValue');
   ```

3. **Document in README.md**

### Adding a New Agent Command

1. **Add regex pattern** in `extension.ts` `sendMessage` handler:
   ```typescript
   const newMatch = text.match(/\/newcmd\s+(\S+)(?:\s+(.+))?$/);
   if (newMatch) {
     // Handle new command
   }
   ```

2. **Update help text** (shown when chat panel opens)

3. **Update README.md** and `QUICK_REFERENCE.md`

4. **Test thoroughly**:
   - Test with minimal args: `/newcmd path`
   - Test with optional prompt: `/newcmd path with this prompt`
   - Test error cases: `/newcmd` (missing args), `/newcmd invalid/path`

### Debugging LLM Issues

1. **Add logging** around LLM calls in `llmClient.ts`:
   ```typescript
   console.log('[LLM] Sending payload:', JSON.stringify(payload, null, 2));
   ```

2. **Test endpoint directly**:
   ```bash
   curl -X GET http://localhost:11434/api/tags
   curl -X POST http://localhost:11434/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"model":"mistral","messages":[{"role":"user","content":"test"}]}'
   ```

3. **Check SSE parsing** (streaming issues often silently drop events):
   - Add `console.log()` for each parsed event
   - Verify `data: ` prefix is being stripped

---

## Reporting Issues

When reporting bugs, include:

1. **Environment**:
   - VS Code version
   - Extension version
   - Node.js version
   - LLM server (Ollama/LM Studio) and model

2. **Steps to reproduce**:
   - Clear, numbered steps
   - Include exact command/input you used

3. **Expected vs. actual**:
   - What you expected to happen
   - What actually happened

4. **Logs**:
   - Debug Console output (F5 → Shift+Ctrl+Y)
   - Any error messages

---

## Resources

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Technical deep dive
- **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** - Developer commands
- **[VS Code Extension API](https://code.visualstudio.com/api)** - Official docs
- **[OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat)** - LLM endpoint spec

---

## Questions?

Open an issue with the `question` label, or check existing issues for similar topics.

Thank you for contributing! 🎉
