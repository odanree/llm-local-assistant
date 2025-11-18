# LLM Assistant Demo Walkthrough

Complete this 5-minute demo to experience all core features of the LLM Assistant extension.

## Prerequisites

1. **Start Local LLM Server** (if using Ollama):
   ```bash
   ollama run mistral
   ```
   Or use LM Studio / vLLM on port 11434

2. **Open VS Code** with the llm-local-assistant extension running

3. **Open Workspace** ensuring you have a workspace folder open (File → Open Folder)

---

## Step 1: Open Chat Panel (30 seconds)

Click the **"LLM Assistant"** button in the VS Code status bar (bottom right).

A chat panel will appear on the right side showing:
- Welcome message
- Input field with "Send" button
- Example commands: `/read`, `/write`, `/suggestwrite`

**Result**: You should see the interactive chat interface.

---

## Step 2: Test Connection (30 seconds)

In the chat input, type:
```
/test
```

Click **Send** or press Enter.

**Expected output**: 
- Status message showing your LLM endpoint
- Model name (e.g., "mistral")
- Connection test result

**What this shows**: 
- Extension can communicate with your LLM server
- Settings are properly configured
- Real-time status feedback works

---

## Step 3: Read a File (1 minute)

In the chat input, type:
```
/read examples/hello.ts
```

Click **Send**.

**Expected output**:
- The full content of `hello.ts` appears in the chat
- Shows TypeScript code with greet() and add() functions
- Demonstrates file reading capability

**What this shows**:
- File I/O operations work
- Extension can access workspace files
- Content displays in chat for reference

---

## Step 4: Write a New File (1.5 minutes)

In the chat input, type:
```
/write examples/test-output.ts create a TypeScript function that calculates the area of a circle
```

Click **Send**.

**Expected output**:
- Extension generates TypeScript code based on your prompt
- New file `examples/test-output.ts` appears in Explorer
- Shows generated function implementation

**What this shows**:
- LLM-generated code integrated into your workspace
- File creation works automatically
- AI can understand domain-specific prompts (math, TypeScript, etc.)

---

## Step 5: Suggest Write (Confirmation Flow) (1.5 minutes)

In the chat input, type:
```
/suggestwrite examples/test-output.ts add JSDoc comments and type annotations to improve documentation
```

Click **Send**.

**Expected behavior**:
- Dialog appears asking to approve the suggestion
- Shows a preview of suggested changes
- Click "Approve" to accept changes, or close dialog to skip

**Expected output** (after approval):
- File `examples/test-output.ts` is updated with improved documentation
- Chat shows confirmation message

**What this shows**:
- Users maintain control over AI suggestions
- Can preview changes before applying
- Suggested modifications enhance code quality

---

## Step 6: Regular Chat (without commands) (1 minute)

In the chat input, type:
```
What's the difference between TypeScript and JavaScript? Keep it brief.
```

Click **Send**.

**Expected output**:
- LLM streams response token-by-token
- Displays in real-time in the chat panel
- Response explains key differences

**What this shows**:
- Regular chat works without special commands
- Streaming provides responsive feedback
- Can ask questions about code, concepts, etc.

---

## Verification Checklist

After completing all steps, verify:

- ✅ Chat panel opens and responds
- ✅ Connection test shows endpoint and model
- ✅ `/read` displays file contents correctly
- ✅ `/write` creates new files in workspace
- ✅ `/suggestwrite` shows approval dialog
- ✅ Regular chat responds with streaming tokens
- ✅ No error messages in chat

## Troubleshooting

**"Cannot connect to endpoint"**
- Verify LLM server is running: `ollama run mistral`
- Check endpoint in VS Code settings: `llm-assistant.endpoint`
- Default: `http://localhost:11434`

**"File not found" on /read**
- Use relative paths from workspace root
- Example: `examples/hello.ts` (not absolute path)

**"Model not found" error**
- Ensure model is downloaded: `ollama pull mistral`
- Check model name in settings: `llm-assistant.model`

**Chat not responding**
- Check LLM server terminal for errors
- Increase timeout in settings: `llm-assistant.timeout`
- Default: 30000ms (30 seconds)

---

## Next Steps

Explore these advanced scenarios:

1. **Ask for code review**: Upload code, ask LLM for suggestions
2. **Generate boilerplate**: Use `/write` to create class templates
3. **Learn from examples**: Ask about patterns in existing files
4. **Refactor existing code**: Use `/suggestwrite` to improve implementations

---

## Portfolio Note

This demo showcases:
- **Seamless AI Integration**: Chat interface directly in VS Code
- **Multi-Modal Commands**: Regular chat + specialized `/` commands
- **File Operations**: Read, write, and suggest modifications
- **User Control**: Approval dialogs for AI suggestions
- **Error Handling**: Clear, actionable error messages
- **Streaming UX**: Real-time token display for responsive feel

Total time: ~5 minutes | Real-world scenario: 30+ minutes of productive coding with AI assistance
