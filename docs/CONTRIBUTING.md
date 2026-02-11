# Contributing to LLM Local Assistant

Thank you for your interest in contributing! This guide will help you understand how to develop, test, and submit contributions to the LLM Local Assistant project.

---

## Getting Started

### Prerequisites
- **Node.js** 18+ (check with `node --version`)
- **VS Code** 1.85+ (for testing the extension)
- **Python** 3.8+ (optional, for voice narration feature)
- **Local LLM Server** (Ollama, LM Studio, or vLLM) running during testing

### Initial Setup
```bash
# Clone and install
git clone https://github.com/YOUR-USERNAME/llm-local-assistant.git
cd llm-local-assistant
npm install

# Verify setup
npm run lint
npm run build
```

---

## Development Workflow

### 1. Build Commands
```bash
npm run watch          # Auto-rebuild on file changes (recommended for dev)
npm run build          # One-time build
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
# 3. Test /explain src/extension.ts (with voice if setup)
# 4. Test /read src/extension.ts
# 5. Test /write temp-test.ts write a hello world function
# 6. Verify history resets when panel closes/reopens
```

### 4. Testing Voice Narration (Optional)
```bash
# Run voice setup (one time only)
Cmd+Shift+P → LLM Assistant: Setup Voice Narration

# Then test:
# 1. Select code or open a file
# 2. Press Cmd+Shift+E (or /explain in chat)
# 3. Audio player should appear with explanation
# 4. Click play to hear narration
```

---

## Project Structure

```
src/
├── extension.ts              # Main handler: commands, agent parsing, webview mgmt
├── llmClient.ts              # LLM communication: streaming, non-streaming, history
├── services/
│   └── ttsService.ts         # Voice narration: TTS synthesis (edge-tts, ChatTTS)
├── commands/
│   ├── explain.ts            # /explain command with audio
│   ├── voice.ts              # Voice setup and testing
│   └── voiceCommands.ts      # Voice configuration
└── webviewContent.ts         # Chat UI: HTML/CSS/JS webview content

webview/
├── components/
│   ├── AudioPlayer.tsx       # Voice narration audio controls
│   └── ExplanationPanel.tsx  # Integration with chat
└── styles/
    └── audioPlayer.css       # Audio player styling

python/
├── tts_service.py            # TTS synthesis service (edge-tts, ChatTTS)
├── setup_tts.py              # Automated TTS setup
└── test_tts.py               # TTS testing

Root (Industry-Standard Only):
├── README.md                 # User-facing guide
├── CHANGELOG.md              # Version history
├── ROADMAP.md                # Product vision & phases
├── ARCHITECTURE.md           # Technical design
├── QUICK_REFERENCE.md        # Developer cheat sheet
├── PROJECT_STATUS.md         # Current project state
└── LICENSE                   # MIT License

Documentation (/docs/):
├── CONTRIBUTING.md                    # This file
├── INSTALL.md                         # Installation guide (with ModelFile)
├── RELEASE-COMPLETE.md                # Release notes
├── VOICE_NARRATION.md                 # Voice feature guide
├── ARCHITECTURE.md                    # Technical deep dive
├── FORM_COMPONENT_PATTERNS.md         # Form architecture rules
├── DEVELOPER_GUIDE_V1.2.0.md         # Developer reference
├── ROOT_ORGANIZATION_RULES.md         # Repository organization
└── ... (other project docs)

Build & Config:
├── package.json              # Dependencies, scripts, VS Code config
├── tsconfig.json             # TypeScript config
├── webpack.config.js         # Bundler config
├── eslint.config.mjs         # Linter config
└── .vscodeignore             # Files to exclude from VSIX
```

**See [ROOT_ORGANIZATION_RULES.md](./ROOT_ORGANIZATION_RULES.md)** for repository organization guidelines when adding new documentation.

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

### Subprocess Communication (Voice Narration)

For Python subprocess calls (like TTS), use proper process handling:

```typescript
// ✅ DO: Spawn with error handling
const { spawn } = require('child_process');
const process = spawn(pythonCmd, [scriptPath, '--args']);

process.stdout.on('data', (data) => {
  // Handle output
});

process.stderr.on('data', (data) => {
  // Log errors
  console.error(`[TTS Error]: ${data}`);
});

process.on('error', (err) => {
  // Handle spawn errors
});
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

## v2.6 Voice Narration Development

### Understanding the Voice Architecture

**4-Layer Stack:**
1. **VS Code UI** (src/webview) - React components for audio player
2. **Extension Commands** (src/commands) - /explain, /setup-voice, /test-voice
3. **Node.js Bridge** (src/services/ttsService.ts) - Subprocess wrapper
4. **Python Service** (python/) - TTS synthesis (edge-tts or ChatTTS)

### Adding Voice Features

**Step 1: Add new voice command** in `src/commands/voiceCommands.ts`:
```typescript
if (text.includes('/my-voice-cmd')) {
  // Handle new voice command
  await ttsService.synthesize(text);
}
```

**Step 2: Update configuration** in `package.json`:
```json
{
  "llm-assistant.voice.myNewSetting": {
    "type": "boolean",
    "default": true,
    "description": "My new voice setting"
  }
}
```

**Step 3: Test thoroughly**:
- Run voice setup: `Cmd+Shift+P → Setup Voice Narration`
- Test command with voice enabled
- Test with Python 3.8 minimum
- Verify on Windows, macOS, Linux

### Testing Voice Setup

```bash
# Verify Python
python3 --version   # Should be 3.8+

# Run setup wizard
Cmd+Shift+P → LLM Assistant: Setup Voice Narration

# Test voice
Cmd+Shift+P → LLM Assistant: Test Voice Narration
```

---

## Submission Guidelines

### Before Submitting a PR

1. **Run the linter**
   ```bash
   npm run lint
   ```
   Fix any errors. ESLint config is in `eslint.config.mjs`.

2. **Build and test**
   ```bash
   npm run build
   npm run package  # Creates production VSIX
   ```

3. **Test locally**
   - Build: `npm run build`
   - Run extension in debug mode (F5)
   - Test the specific feature you changed
   - Verify no regressions in chat, /read, /write, /explain
   - If voice feature: Run voice setup and test audio

4. **Update documentation**
   - If adding a feature: Update README.md usage section
   - If adding a setting: Update package.json `contributes.configuration`
   - If fixing a bug: Add entry to CHANGELOG.md
   - If touching voice: Update docs/VOICE_NARRATION.md

5. **Check git status**
   ```bash
   git status
   # Should NOT include dist/, node_modules/, or python/.venv
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
- `[feat] Add voice narration to /read command`
- `[docs] Update ARCHITECTURE.md with voice architecture`

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
- [If voice] Ran voice setup and tested audio
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

3. **Document in README.md and docs/INSTALL.md**

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

### Debugging Voice Issues

1. **Check Python path** in settings:
   ```
   VS Code Settings → llm-assistant.pythonPath
   ```

2. **Verify TTS service running**:
   ```
   Cmd+Shift+P → LLM Assistant: Test Voice Narration
   ```

3. **Check Python version**:
   ```bash
   python3 --version    # Should be 3.8+
   ```

4. **Test TTS directly**:
   ```bash
   cd python/
   python3 test_tts.py
   ```

---

## Reporting Issues

When reporting bugs, include:

1. **Environment**:
   - VS Code version
   - Extension version
   - Node.js version
   - Python version (if voice-related)
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
   - Python output (if voice-related)

---

## Repository Organization

The project follows strict organization rules to keep the repository clean and professional.

**Root Directory Rule**: Only industry-standard files (README.md, CHANGELOG.md, ROADMAP.md, LICENSE, and core technical docs)

All project-specific documentation goes in `/docs/` folder.

**When adding documentation**:
1. Check [ROOT_ORGANIZATION_RULES.md](./ROOT_ORGANIZATION_RULES.md)
2. Create in `/docs/` directory, not root
3. Update README.md with link if it's user-facing
4. Reference from appropriate doc sections if it's developer-focused

If root gets bloated with multiple `.md` files, apply the cleanup checklist in ROOT_ORGANIZATION_RULES.md.

---

## Architecture Rules

All development follows the architecture rules defined in `.lla-rules`:

**Key Rule Areas:**
- **Logic vs UI Separation**: Business logic in src/, UI components in src/components/
- **Component Props**: TypeScript interfaces (Zod for forms only)
- **Styling**: All reusable components must accept `className` prop
- **Accessibility**: All interactive elements must be keyboard-navigable and screen-reader friendly
- **Form Components**: 7 required patterns (state interface, handler typing, consolidator, submit handler, Zod validation, error states, semantic HTML)
- **Pre-Flight Checks**: Mandatory validation before generating plans
- **Cross-Platform**: All features must work on Windows, macOS, and Linux

See [.lla-rules](../.lla-rules) for complete architecture rules.

For detailed form component patterns, see [FORM_COMPONENT_PATTERNS.md](./FORM_COMPONENT_PATTERNS.md).

---

## Resources

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Technical deep dive
- **[INSTALL.md](./INSTALL.md)** - Installation guide with ModelFile support
- **[VOICE_NARRATION.md](./VOICE_NARRATION.md)** - Voice feature guide
- **[ROOT_ORGANIZATION_RULES.md](./ROOT_ORGANIZATION_RULES.md)** - Repository organization guidelines
- **[DEVELOPER_GUIDE_V1.2.0.md](./DEVELOPER_GUIDE_V1.2.0.md)** - Developer reference
- **[VS Code Extension API](https://code.visualstudio.com/api)** - Official docs
- **[OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat)** - LLM endpoint spec

---

## Questions?

Open an issue with the `question` label, or check existing issues for similar topics.

Thank you for contributing! 🎉

