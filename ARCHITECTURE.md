# Architecture Documentation

> ⚠️ **DOCUMENTATION CONSTRAINT**: The root directory contains a fixed set of documentation files: README.md, ROADMAP.md, ARCHITECTURE.md, PROJECT_STATUS.md, QUICK_REFERENCE.md, and CHANGELOG.md. No additional .md or .txt files should be created in root. Updates should be made to existing files or placed in `/docs/` if necessary.

## Phase 3: Architecture Alignment - `.lla-rules` Injection + Vector RAG

**Phase 3.1 (v1.3.0):** Project-specific architecture rules via `.lla-rules` files.  
**Phase 3.2 (v1.3.1):** Local Vector RAG for semantic code search.

### Phase 3.1: Architecture Rules (`.lla-rules`)

1. **Create `.lla-rules` in your project root** with team patterns:
```yaml
- Use functional components only
- Validate with Zod
- State: Zustand (not Redux)
- API: TanStack Query
```

2. **Extension loads automatically** on startup
3. **Rules injected into LLM system prompt** before every `/plan` or `/write`
4. **Generated code matches project patterns** without manual guidance

**Example:**
- Without `.lla-rules`: LLM generates `class Component extends React.Component`
- With `.lla-rules`: LLM generates `export function Component() { ... }`

**Setup:** See `docs/CURSORRULES_EXAMPLE.md`

### Phase 3.2: Vector RAG (Semantic Code Search)

**NEW** (v1.3.1): Semantic code search with `/context` command.

**How it works:**
1. **Index workspace** — Run "Index Workspace for Semantic Search" command
   - Scans all code files
   - Extracts function/class definitions
   - Generates embeddings (offline, local)
   - Builds HNSW vector index
   - Takes ~10-30 seconds first time

2. **Search code** — Run "Search Code" command
   - Type query: "authentication logic", "API routes", "validation"
   - Returns top 5 matching code files + excerpts
   - Shows relevance score
   - Click to open file

3. **Auto-integration** — When you ask `/plan` or `/write`, relevant code is automatically found and injected into context

**Example:**
```
Senior: /context Show me authentication
RAG: Returns src/auth/handler.ts, src/auth/middleware.ts, etc.

Senior: /write Extend login with 2FA
LLM sees actual auth patterns → generates perfect integration
```

**Technology:**
- **Embeddings:** `Xenova/all-MiniLM-L6-v2` (384-dim, offline)
- **Index:** HNSW (Hierarchical Navigable Small World)
- **Performance:** <10ms per query, ~50MB memory for typical codebase
- **Privacy:** 100% local, no cloud, no API calls

### Migration Support

If you have existing `.cursorrules` files, they still work:
1. Extension checks for `.lla-rules` first (recommended)
2. Falls back to `.cursorrules` if `.lla-rules` doesn't exist

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
