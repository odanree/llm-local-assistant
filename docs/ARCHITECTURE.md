# Architecture Documentation

> ⚠️ **DOCUMENTATION CONSTRAINT**: The root directory contains a fixed set of documentation files: README.md, ROADMAP.md, ARCHITECTURE.md, PROJECT_STATUS.md, QUICK_REFERENCE.md, and CHANGELOG.md. No additional .md or .txt files should be created in root. Updates should be made to existing files or placed in `/docs/` if necessary.

---

## Core Architecture Layers (v2.11-v2.13)

### v2.11: Dependency Injection & Provider Architecture
**Release**: v2.11.0 - Side-Effect Decoupling & Fault-Tolerance
**Status**: Foundation for v2.12 streaming infrastructure

### v2.12: Real-Time Streaming & Interactive Execution
**Release**: v2.12.0 - Reactive Infrastructure
**Status**: AsyncCommandRunner, process streaming, suspend/resume state machine

### v2.13: Safety Rails & Reactive Orchestration (Current)
**Release**: v2.13.0 - Self-Healing Systems
**Status**: Production-ready; three independent safety rails with Chaos Suite validation

### High-Level Provider Pattern

To reach "Diamond Tier" coverage (80%+), the architecture has shifted from direct Node.js calls to a Strategy Pattern for all side effects. This allows the system to simulate complex failure states (disk full, permission denied) that are impossible to trigger with physical hardware.

```
Layer 1: Orchestration (Services)
  ├─ executor.ts (Consumes IFileSystem, ICommandRunner)
  ├─ codebaseIndex.ts (Migrated to IFileSystem)
  └─ plannerModule.ts (Planned migration)

Layer 2: Abstraction (Interfaces)
  ├─ IFileSystem.ts (Contract for read/write/exists)
  └─ ICommandRunner.ts (Contract for shell/process execution)

Layer 3: Implementation (Providers)
  ├─ FileSystemProvider.ts (Production: wraps 'fs')
  ├─ CommandRunnerProvider.ts (Production: wraps 'child_process')
  ├─ MockFileSystem.ts (Test: memory-based with fault injection)
  └─ MockCommandRunner.ts (Test: predictable exit codes/timeouts)
```

### Dependency Injection (DI) Implementation

Services now receive their dependencies via the constructor. To maintain backward compatibility and simplify production usage, we use **Default Parameter Injection**.

```typescript
// src/executor.ts
constructor(
  private fs: IFileSystem = new FileSystemProvider(),
  private commandRunner: ICommandRunner = new CommandRunnerProvider()
) {
  // Existing initialization...
}
```

### Chaos Engineering & Fault Injection

The MockFileSystem and MockCommandRunner are designed to inject "Apocalypse Scenarios" into tests. This provides 100% coverage of try/catch blocks that were previously "Dark Blocks."

| Scenario | Mock Trigger | Purpose |
|----------|--------------|---------|
| Disk Full | `mockFs.setFault('write', 'ENOSPC')` | Verify graceful handling of failed saves |
| Permission Denied | `mockFs.setFault('read', 'EACCES')` | Test UI warnings for locked files |
| Command Timeout | `mockCmd.setTimeout(5000)` | Ensure extension remains responsive during hangs |
| File Not Found | Default behavior for missing files | Test error recovery paths |

---

## NEW (v2.10): Surgical Orchestration & Pure Logic

**Release**: v2.10.0 - "Elite Tier" Coverage Foundation
**Status**: Completed; 1,000+ lines of logic extracted to utilities

### The "Surgical Orchestration" Pattern

To maximize testability, we have separated **Intelligence** from **Execution**. This pattern ensures that complex regex and parsing logic can be tested with 100% statement coverage without mocking the VS Code API.

1. **Pure Logic (Utilities)**: Deterministic functions in `src/utils/` (e.g., `refactoringValidator.ts`, `codePatternMatcher.ts`)
2. **Thin Orchestration (Services)**: The "Decision Maker" in the main service that calls the utility and maps results to the UI

### Map and Wrap Logic

```typescript
// 1. Pure validator returns structured violations
const violations = validateArchitectureRulePure(content, rules, filePath);

// 2. Orchestration maps to service-specific formats
violations.forEach(v => this.reportError(v.message));
```

---

## NEW (v2.6): Voice Narration Architecture

**Release**: v2.6.0 - Voice narration for code explanations  
**Status**: Production-ready with 3 critical cross-platform fixes

### Voice Narration 4-Layer Stack

```
Layer 1: VS Code UI
  ├─ AudioPlayer.tsx (React component with controls)
  └─ ExplanationPanel.tsx (integration with chat)

Layer 2: Extension Commands
  ├─ /explain command (reads file + generates explanation + synthesis)
  ├─ /setup-voice command (installation wizard)
  └─ /test-voice command (verification)

Layer 3: Node.js Bridge (ttsService.ts)
  ├─ Spawns Python subprocess
  ├─ Passes text for synthesis
  ├─ Receives MP3 audio stream
  └─ Handles errors and cleanup

Layer 4: Python Service (python/)
  ├─ tts_service.py (edge-tts or ChatTTS synthesis)
  ├─ setup_tts.py (dependency installation)
  └─ test_tts.py (service verification)
```

### TTS Engine Strategy (Pluggable)

**Primary: edge-tts (Microsoft Edge)**
- Provider: Free cloud API (no API keys)
- Quality: High
- Speed: <1 second per chunk
- Internet: Required
- Model size: 0 MB (cloud-based)

**Fallback: ChatTTS (Local)**
- Provider: Self-hosted model
- Quality: Medium (conversational)
- Speed: 2-3s first run, <1s cached
- Internet: Not required
- Model size: ~1 GB

**Why Pluggable?**
- Users can choose primary engine
- Automatic fallback if primary fails
- Easy to add new engines (edge-tts → azure-tts, etc.)
- Graceful degradation

### Cross-Platform Fixes (v2.6)

**Fix #1: Cross-Platform Python Detection**
```typescript
// Auto-detect correct Python command
const pythonCmd = os.platform() === 'win32' ? 'python' : 'python3';

// Windows: "python" (correct default)
// Unix/macOS: "python3" (standard command)
```

**Fix #2: Absolute Path Resolution**
```typescript
// Use context.extensionPath instead of __dirname
const scriptPath = path.join(context.extensionPath, 'python', 'setup_tts.py');

// Works reliably in packaged VSIX
// Fallback to relative paths in dev mode
```

**Fix #3: UTF-8 Encoding**
```python
# Force UTF-8 at startup (especially Windows)
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Professional emoji output on all systems
print("✅ Setup complete")
```

### Voice Data Flow

```
User selects code → /explain command
    ↓
LLMClient generates explanation text
    ↓
ttsService.synthesize(text)
    ↓
Spawn Python process (subprocess)
    ↓
Python uses edge-tts or ChatTTS
    ↓
Receive MP3 audio stream
    ↓
Cache locally (optional)
    ↓
Send to webview via data URL
    ↓
AudioPlayer renders with controls
    ↓
User clicks play → Browser audio API
```

### Configuration

**VS Code Settings** (contributes.configuration):
```json
{
  "llm-assistant.voice.enabled": {
    "type": "boolean",
    "default": true,
    "description": "Enable voice narration for explanations"
  },
  "llm-assistant.voice.speed": {
    "type": "number",
    "default": 1.0,
    "minimum": 0.5,
    "maximum": 2.0,
    "description": "Playback speed (0.5x - 2.0x)"
  },
  "llm-assistant.voice.language": {
    "type": "string",
    "default": "en",
    "enum": ["en", "zh"],
    "description": "Language for voice narration"
  },
  "llm-assistant.voice.cacheEnabled": {
    "type": "boolean",
    "default": true,
    "description": "Cache generated audio files"
  },
  "llm-assistant.pythonPath": {
    "type": "string",
    "default": "",
    "description": "Path to Python executable (auto-detected if empty)"
  }
}
```

---

## Phase 3: Architecture Alignment - `.lla-rules` Injection

**NEW** (v1.3.0): The extension now supports project-specific architecture rules via `.lla-rules` files.

### How It Works

1. **Create `.lla-rules` in your project root** with team patterns:
```yaml
- Use functional components only
- Form state must use typed interfaces (e.g., LoginFormState)
- Form handlers must be explicitly typed (FormEventHandler<HTMLFormElement>)
- Multi-field forms use handleChange consolidator pattern
- Validate with Zod (never inline validators)
- State: Zustand (not Redux)
- API: TanStack Query
```

2. **Extension loads automatically** on startup
3. **Rules injected into LLM system prompt** before every `/plan` or `/write`
4. **Generated code matches project patterns** without manual guidance

### Built-in Form Component Pattern

The extension recognizes form component rules and applies:
- **State Interface**: Automatically creates typed form state interface
- **Handler Typing**: Explicitly types handlers as `FormEventHandler<HTMLFormElement>`
- **Consolidator**: Multi-field forms use `handleChange` to manage updates
- **Submit Handler**: Always includes onSubmit (never callback-only)
- **Validation**: Uses Zod schema patterns for runtime validation

### Example

**Without `.lla-rules`** (LLM guesses):
```
User: /write src/LoginForm.tsx
LLM: Generates class component with useState + fetch
Result: ❌ Doesn't match team patterns
```

**With `.lla-rules`** (LLM follows rules):
```
User: /write src/LoginForm.tsx
LLM: Generates functional component with TanStack Query + Zod
Result: ✅ Matches team patterns automatically
```

### Migration Support

If you have existing `.cursorrules` files, they'll still work as fallback:
1. Extension checks for `.lla-rules` first (recommended)
2. Falls back to `.cursorrules` if `.lla-rules` doesn't exist
3. Smooth transition and multi-tool support

### Setup

See `docs/CURSORRULES_EXAMPLE.md` for a complete example file to copy and customize.

---

## High-Level Overview

[Rest of existing documentation...]

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Extension                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐              │
│  │  Webview UI      │  │  Command Handler │              │
│  │  - Chat panel    │  │  - /read         │              │
│  │  - Messages      │  │  - /write        │              │
│  │  - Input field   │  │  - /suggestwrite │              │
│  │  - Streaming     │  │  - Chat          │              │
│  └────────┬─────────┘  └────────┬─────────┘              │
│           │                     │                        │
│           └─────────────────────┼────────────────────┐   │
│                                 │                    │   │
│                          ┌──────┴─────────┐    ┌────┴──┐ │
│                          │ LLMClient       │    │ File  │ │
│                          │ - sendMessage() │    │ Utils │ │
│                          │ - sendStream()  │    │       │ │
│                          │ - isHealthy()   │    └───────┘ │
│                          └─────────┬───────┘              │
│                                    │                      │
│                          ┌─────────▼──────────┐          │
│                          │ HTTP Client        │          │
│                          │ (axios/fetch)      │          │
│                          └─────────┬──────────┘          │
└──────────────────────────────────────┼──────────────────────┘
                                       │
                        ┌──────────────┴───────────────┐
                        │                              │
                   ┌────▼────┐                   ┌─────▼────┐
                   │ Ollama   │                   │LM Studio │
                   │ API      │                   │API       │
                   │ (Local)  │                   │(Local)   │
                   └──────────┘                   └──────────┘
```

---

## Core Components

### 1. Extension (src/extension.ts)

**Responsibility**: Main orchestrator, command handling, webview management

**Key Functions**:
- `activate()` - Extension startup, command registration
- `openLLMChat()` - Create and manage webview panel
- Message handler for `sendMessage` command
- Agent command parsing (/read, /write, /suggestwrite)
- Error handling and user messaging

**Flow**:
```
User triggers /read, /write, /suggestwrite
    ↓
Regex parsing extracts command + params
    ↓
Command-specific handler executes
    ↓
File I/O or LLM call
    ↓
Result sent to webview via postMessage
```

### 2. LLMClient (src/llmClient.ts)

**Responsibility**: LLM communication, streaming, configuration

**Key Methods**:
- `sendMessage(prompt)` - Non-streaming request
- `sendMessageStream(prompt, callback)` - Streaming with token callback
- `isServerHealthy()` - Health check
- `clearHistory()` - Reset conversation context

**Architecture**:
```typescript
class LLMClient {
  private config: LLMConfig;
  private messageHistory: Message[];
  
  async sendMessage(text: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;
  
  async sendMessageStream(
    text: string,
    onToken: (token: string, complete: boolean) => Promise<void>
  ): Promise<{ success: boolean; error?: string }>;
}
```

**Streaming Logic**:
1. Open SSE connection to LLM endpoint
2. Listen for `data:` events
3. Parse JSON responses
4. Invoke callback for each token
5. Call callback with `complete: true` when done

### 3. Webview Content (src/webviewContent.ts)

**Responsibility**: Chat UI, message rendering, user interaction

**HTML Structure**:
```html
<div id="chat">
  <!-- Messages append here -->
</div>
<div class="input-row">
  <input id="input" type="text" placeholder="..." />
  <button id="send">Send</button>
  <button id="clear">Clear</button>
</div>
```

**Message Types**:
- `streamToken` - Single token in streaming response
- `streamComplete` - Marks end of streaming
- `addMessage` - Complete message (error, file content, etc.)
- `status` - Status message (grayed out)

**Styling**:
- User messages: Blue gradient (left align)
- Assistant messages: Gray gradient (right align)
- Error messages: Red gradient with warning icon
- Status messages: Subtle gray background
- Hover effects: transform and shadow transitions
- Focus states: Blue outline rings

---

## Command Processing Flow

### `/read <path>`

```
User enters: /read src/main.ts
    ↓
Regex: /\/read\s+(\S+)/
    ↓
Extract path: "src/main.ts"
    ↓
vscode.workspace.fs.readFile(fileUri)
    ↓
TextDecoder converts to string
    ↓
Send to webview as addMessage with file content in code block
```

### `/write <path> [prompt]`

```
User enters: /write config.ts validate this config
    ↓
Regex: /\/write\s+(\S+)(?:\s+(.+))?$/
    ↓
Extract path: "config.ts", prompt: "validate this config"
    ↓
LLMClient.sendMessageStream(prompt)
    ↓
Collect all tokens into generatedContent
    ↓
Create parent directories with createDirectory()
    ↓
vscode.workspace.fs.writeFile(fileUri, content)
    ↓
Send success message with preview to webview
```

### `/suggestwrite <path> [prompt]`

```
Similar to /write, but:
    ↓
After LLM generates content
    ↓
Show confirmation dialog with preview
    ↓
If user clicks "Yes": write file
If user clicks "No": send cancel message to webview
```

---

## Data Flow: Chat Message

```
1. User types & presses Enter
2. Webview JavaScript captures input
3. vscode.postMessage({ command: 'sendMessage', text: '...' })
4. Extension receives onDidReceiveMessage
5. Parse for agent commands (regex)
   - If command found: execute special logic
   - If normal chat: send to LLM
6. Streaming:
   - LLM returns token-by-token via SSE
   - For each token: postMessage({ command: 'streamToken', token: '...' })
   - Webview appends token to message
7. Final:
   - postMessage({ command: 'streamComplete' })
   - Webview freezes final message

```

---

## Error Handling

### Try-Catch Strategy
- All user-triggered operations wrapped in try-catch
- Errors sent as `addMessage` with `error` property
- Webview renders in red with warning icon
- Includes helpful context (file path, error message)

### Common Errors
```typescript
// File not found
Error reading file: src/missing.ts
No such file or directory

// No workspace
Error: No workspace folder open.
Suggestion: Open a folder first

// LLM timeout
Error: Request timeout after 30000ms
Suggestion: Increase timeout in settings or simplify prompt
```

---

## Configuration Management

### Settings Flow
```
package.json contributes section
    ↓
VS Code loads settings
    ↓
Extension queries at startup via getLLMConfig()
    ↓
Create LLMClient with config
    ↓
Settings available via vscode.workspace.getConfiguration()
```

### Config Validation
- Endpoint URL must be valid HTTP(S)
- Model name required
- Temperature 0-2 range
- Timeout >= 1000ms
- MaxTokens >= 100

---

## Extension Activation

```
1. VS Code starts
2. Loads extension.ts
3. activate() called
4. Register commands: openChat, testConnection
5. Create status bar item "🤖 LLM Assistant"
6. Initialize LLMClient with config
7. Ready for user interaction
```

---

## File Structure

```
llm-local-assistant/
├── src/
│   ├── extension.ts           # Main orchestrator (385 lines)
│   ├── llmClient.ts           # LLM API client (200+ lines)
│   └── webviewContent.ts      # Chat UI (226 lines)
├── dist/
│   └── extension.js           # Compiled output (webpack)
├── .vscode/
│   ├── launch.json            # Debug configuration
│   └── tasks.json             # Build tasks
├── package.json               # Dependencies, scripts, config
├── tsconfig.json              # TypeScript config
├── webpack.config.js          # Bundle configuration
├── eslint.config.mjs          # Linting rules
├── README.md                  # User guide
├── ROADMAP.md                 # Future features
├── ARCHITECTURE.md            # This file
└── CHANGELOG.md               # Version history
```

---

## Build Pipeline

### Development
```
npm run watch
    ↓
Webpack watches src/ for changes
    ↓
Compiles to dist/extension.js
    ↓
Auto-reload available in debugger (F5)
```

### Production
```
npm run compile
    ↓
Webpack bundles with minification
    ↓
Outputs dist/extension.js (~29KB)
    ↓
Ready for packaging/distribution
```

### TypeScript → JavaScript
- Language: TypeScript (src/)
- Target: ES2020 JavaScript
- Module format: CommonJS
- Declaration files: Not generated

---

## VS Code API Usage

### Core APIs Used

| API | Purpose | Used For |
|-----|---------|----------|
| `vscode.window.createWebviewPanel()` | Create chat UI | Chat window |
| `webview.postMessage()` | Send to webview | Update UI |
| `webview.onDidReceiveMessage()` | Receive from UI | Handle user actions |
| `vscode.workspace.fs` | File I/O | /read, /write |
| `vscode.window.showInformationMessage()` | Dialogs | /suggestwrite approval |
| `vscode.commands.registerCommand()` | Commands | openChat, testConnection |
| `vscode.window.createStatusBarItem()` | Status bar | Quick access button |
| `vscode.workspace.getConfiguration()` | Settings | Get config values |
| `vscode.Uri.joinPath()` | Path handling | Build file URIs |

---

## Security Considerations

### Current Safeguards
- No `eval()` or `innerHTML` with user input
- File operations limited to workspace folder
- Commands registered by extension only
- No shell access (yet)
- No internet access required

### Future Security Needs (Agent Mode)
- Whitelist allowed shell commands
- Audit logging for file operations
- Permission system for external tools
- Sandboxing for tool execution

---

## Performance Optimizations

### Current
- Streaming reduces perceived latency
- Lazy webview creation
- Single LLMClient instance (connection pooling)
- CSS transitions for smooth UX

### Future
- Context windowing for large files
- Incremental file indexing
- Token caching for common patterns
- Background worker for heavy parsing

---

## Testing Strategy

### Unit Tests
- LLMClient methods
- Regex command parsing
- File path normalization
- Configuration validation

### Integration Tests
- End-to-end message flow
- File I/O with error handling
- Streaming response handling
- Webview communication

### Manual Testing
- Chat with different models
- File operations (/read, /write, /suggestwrite)
- Error scenarios (offline, missing files)
- Custom port configurations

---

## Debugging Tips

### Enable Debug Logging
```typescript
// In extension.ts
console.log('[LLM Assistant]', message);
```

View in VS Code "Output" panel → "Extension Host"

### Common Issues

| Issue | Debug Step |
|-------|-----------|
| "Cannot connect" | Check LLM server running: `curl http://localhost:11434/api/tags` |
| "Model not found" | Verify model: `ollama list` |
| "Timeout" | Increase `llm-assistant.timeout` in settings |
| "No workspace" | Open a folder before using /read, /write |
| Chat not responding | Check Network tab in DevTools (F12 in debug host) |

---

Last Updated: November 2025
