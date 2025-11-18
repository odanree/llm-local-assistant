# Demo Video Script: LLM Local Assistant

**Duration**: 2-3 minutes  
**Audience**: Technical interviewers, code reviewers, potential users  
**Format**: Screen recording with voiceover  
**Goal**: Show core capabilities and architectural thinking in action

---

## Video Overview

This script guides a 2-3 minute demonstration of the extension's key features, ending with a discussion of architectural decisions. Designed for:
- **Job interviews**: Show what you built and why
- **Code review**: Demonstrate the extension working
- **Portfolio**: Proof of functional, polished software
- **YouTube/Blog**: Short-form technical content

---

## Pre-Recording Checklist

- [ ] Ollama running: `ollama run mistral` (listening on localhost:11434)
- [ ] VS Code open with LLM Local Assistant extension loaded
- [ ] Examples folder visible in file explorer
- [ ] Settings configured (endpoint, model, temperature)
- [ ] Terminal ready for any commands
- [ ] Screen recording software ready (OBS, Zoom, etc.)
- [ ] Microphone tested and level-checked

---

## Act 1: Introduction & Setup (30 seconds)

### Visual: Title Screen (0:00 - 0:05)

**Voiceover**:
> "This is LLM Local Assistant, a VS Code extension that brings your local LLM directly into the editor. Built with TypeScript, it provides intelligent code assistance while keeping all your data on your machine."

**On Screen**:
- Display: LLM Local Assistant logo (if available) or extension name in VS Code
- Show: Version 0.0.1

### Visual: Settings Configuration (0:05 - 0:15)

**Action**: 
1. Open VS Code Settings (Ctrl+,)
2. Search for "llm-assistant"
3. Show the configuration section

**Voiceover**:
> "Setup is simple. Just configure your LLM endpoint—in this case, Ollama on localhost:11434—choose your model, and adjust the temperature for creativity. Default settings work great for most people."

**On Screen**:
- Highlight these settings:
  - `llm-assistant.endpoint`: `http://localhost:11434`
  - `llm-assistant.model`: `mistral`
  - `llm-assistant.temperature`: `0.7`

### Visual: Open Chat (0:15 - 0:30)

**Action**:
1. Close Settings
2. Click "LLM Assistant" in the status bar (bottom right)
3. Chat panel opens on the right side

**Voiceover**:
> "Click the LLM Assistant button in the status bar to open the chat panel. You'll see the interface is clean and straightforward—just like any other chat application, but running entirely on your machine."

**On Screen**:
- Show chat panel appearing
- Display: Empty chat with input field
- Show: Example commands in the interface

---

## Act 2: Core Features Demo (1 minute)

### Feature 1: Test Connection (0:30 - 0:45)

**Action**:
1. Type: `Test Connection` or use command palette
2. Show connection test result

**Voiceover**:
> "First, let's verify the connection to Ollama. There's a built-in test that checks your LLM server is responding and your model is available."

**Expected Output**:
```
Testing connection to http://localhost:11434...
✓ Connected! Model: mistral
```

**Talking Point**:
> "The test provides immediate feedback. If something's wrong—like a missing model or wrong endpoint—you get an actionable error message right here in the chat."

### Feature 2: Read Files with /read (0:45 - 1:15)

**Action**:
1. Type: `/read examples/hello.ts`
2. Wait for response
3. Show file content displayed in chat

**Voiceover**:
> "The `/read` command lets you pull file content into the chat. I'll read one of our example files."

**On Screen**:
- Show the hello.ts file content appearing in the chat:
  ```typescript
  export function greet(name: string): string {
    return `Hello, ${name}!`;
  }
  ```

**Follow-up Chat**:
Type: `Explain this TypeScript function`

**Voiceover**:
> "Now I can ask questions about it. The LLM understands the context and provides relevant answers."

**Expected Output**:
```
This is a simple TypeScript function that:
- Takes a name parameter (string type)
- Returns a greeting string
- Uses template literals for string interpolation
```

**Talking Point**:
> "Notice how the response streams in real-time, token by token. This gives you immediate feedback instead of waiting for the full response. It's a small UX detail that makes a big difference."

### Feature 3: Write Files with /write (1:15 - 1:50)

**Action**:
1. Type: `/write examples/calculator.ts create a TypeScript calculator class with add and multiply methods`
2. Wait for LLM to generate code
3. Show file appears in file explorer
4. Open file to show generated content

**Voiceover**:
> "The `/write` command generates new files based on your description. The LLM creates the code, and it's automatically written to your workspace. Watch the file explorer—the new file appears instantly."

**On Screen**:
- Show the new `calculator.ts` file appearing in the explorer
- Show generated code in the editor:
  ```typescript
  export class Calculator {
    add(a: number, b: number): number {
      return a + b;
    }
    
    multiply(a: number, b: number): number {
      return a * b;
    }
  }
  ```

**Talking Point**:
> "The extension automatically creates parent directories if needed. It also handles cross-platform path differences—this works on Windows, Mac, and Linux without any special handling from the user."

### Feature 4: Suggest Changes with /suggestwrite (1:50 - 2:10)

**Action**:
1. Type: `/suggestwrite examples/calculator.ts add JSDoc comments`
2. Wait for dialog to appear
3. Show approval dialog
4. Click "Approve"
5. File is updated

**Voiceover**:
> "The `/suggestwrite` command is different. Instead of directly writing, it asks for your approval first. The LLM suggests improvements, you review them, and then decide whether to apply the changes."

**On Screen**:
- Show the approval dialog:
  ```
  Suggested changes for examples/calculator.ts:
  [Preview of changes]
  
  [Approve] [Cancel]
  ```
- Show file updates with JSDoc comments:
  ```typescript
  /**
   * Simple calculator class
   */
  export class Calculator {
    /**
     * Adds two numbers
     * @param a First number
     * @param b Second number
     * @returns Sum of a and b
     */
    add(a: number, b: number): number {
      return a + b;
    }
    // ...
  }
  ```

**Talking Point**:
> "This is a key design decision: users maintain control. AI suggestions are powerful, but you should always review before changes are applied. It builds trust and prevents unexpected modifications."

---

## Act 3: Architecture & Design (0:50 - 1:20)

### Visual: Show Architecture (if using screen share/slides)

**Voiceover**:
> "Behind the scenes, the architecture is clean and maintainable. There are three main layers:"

**On Screen** (show diagram or point in code):
```
┌─────────────────────┐
│ Webview UI (Chat)   │  ← What you see
├─────────────────────┤
│ Extension Handler   │  ← Command parsing
├─────────────────────┤
│ LLM Client          │  ← Network communication
└─────────────────────┘
```

**Talking Points** (pick 2-3 most relevant):

**1. Regex-Based Command Parsing**
> "Commands work naturally in conversation. You're not restricted to slash commands on their own line—you can ask 'can you /read src/main.ts' and it works. This is a deliberate design choice. We chose flexibility over strict CLI validation."

**2. Streaming Responses**
> "See how the response appears token-by-token? That's not by accident. Streaming provides real-time feedback while waiting for a full response. It makes the interaction feel responsive and interactive."

**3. Type Safety**
> "The code runs in TypeScript strict mode with zero type errors. This catches bugs at compile time rather than runtime. For a production tool, that matters."

**4. Test Coverage**
> "We have 52 unit tests covering the core functionality—command parsing, error handling, edge cases. Every test passes. That's what gives us confidence that the code is solid."

### Code Show (optional, if time permits)

**If doing a live demo**, open one of these in the editor:

**Show 1: LLMClient Error Handling** (`src/llmClient.ts`, lines ~113-117):
```typescript
if (response.status === 404) {
  throw new Error('Model not found. Check llm-assistant.model setting.');
} else if (response.status === 503) {
  throw new Error('LLM server is busy. Try again in a moment.');
}
```

**Voiceover**:
> "Notice the error handling. We detect specific HTTP status codes and provide actionable messages. If the model isn't found, we tell you exactly where to check. This is what makes the tool feel professional."

**Show 2: Command Parsing** (`src/extension.ts`, lines ~180-190):
```typescript
const readMatch = userMessage.match(/\/read\s+(\S+)/);
const writeMatch = userMessage.match(/\/write\s+(\S+)(?:\s+(.+))?$/);
```

**Voiceover**:
> "The command parsing uses regex patterns. Simple, readable, and flexible. New contributors can understand it at a glance."

---

## Act 4: Closing Remarks (0:30 - 0:45)

### Recap

**Voiceover**:
> "To summarize: LLM Local Assistant brings intelligent code assistance to VS Code while keeping everything local and private. The architecture is clean, the code is well-tested, and it's designed to extend easily into future features."

### Key Takeaways

**Pick 2-3 strongest points**:

1. **Local-First**: "All your code stays on your machine. There's no cloud dependency, no data leaving your computer."

2. **Production Quality**: "This isn't a quick prototype. We invested in type safety, test coverage, error handling, and thoughtful UI design."

3. **Pragmatic Engineering**: "Every architectural decision was made with a clear trade-off analysis. We chose simplicity and maintainability over over-engineering."

4. **Extensible**: "The foundation is solid and flexible. Adding new features in Phase 2 won't require rearchitecting."

### Call to Action

**Voiceover**:
> "Want to try it? Head to the GitHub repository. The setup takes less than 5 minutes. Everything is documented, and there are example files to get started immediately."

**On Screen**:
- Show GitHub URL or QR code
- Show the DEMO.md walkthrough link

### Final Screen

**Display**:
```
LLM Local Assistant
Local • Private • Offline-First AI for VS Code

✓ 52 Unit Tests (100% pass rate)
✓ TypeScript Strict Mode (0 errors)
✓ Production Error Handling
✓ Extensible Architecture

Ready to build Phase 2?
```

---

## Interview-Specific Talking Points

### If Asked: "Walk Us Through Your Architecture"

**Response** (use during Act 3):
> "The extension uses three layers: the webview provides the UI, the extension handler orchestrates operations and parses commands, and the LLM client manages communication with the local LLM server.
>
> I chose regex-based parsing instead of a formal CLI framework because users interact naturally—they ask 'can you read this file?' rather than strictly typing `/read file.ts` on its own line. This feels more conversational.
>
> The architecture separates concerns nicely: I can test the LLM client without VS Code, test the extension logic with mocks, and test the UI separately. We have 52 tests passing with 100% success rate, which gives me confidence in the implementation."

### If Asked: "Why TypeScript Strict Mode?"

**Response**:
> "Strict mode catches entire classes of bugs at compile time. Missing properties, wrong types, unsafe operations—the compiler won't let them through. For a tool that interacts with user files and network, I want maximum safety. Yeah, it requires more upfront typing, but it paid for itself by catching bugs early."

### If Asked: "What's Your Biggest Trade-Off?"

**Response**:
> "Choosing in-memory conversation history over persistent storage. I could have added a database, but for the MVP, keeping history in memory was simpler and aligned with the 'local, private' positioning. When the chat closes, history clears—users understand that. In Phase 2, we can add optional persistence if users want it.
>
> The trade-off was intentional: do the simplest thing first, document the decision, and be ready to revisit if priorities change."

### If Asked: "How Would You Extend This?"

**Response** (reference Act 3 or code):
> "The architecture is built for extension. Adding a new command is three lines: add a regex pattern, write a handler, wire it up. Extending the LLMClient is straightforward—just add a new method. The webview can be enhanced without touching core logic.
>
> I documented three explicit extension points in the PORTFOLIO.md analysis: new commands, LLM client enhancements, and UI features. Each can be added without refactoring the foundation."

---

## Technical Deep Dive (Optional - only if time permits)

### If Asked About Error Handling

**Show**: The six error paths in extension.ts and llmClient.ts

**Voiceover**:
> "We identified six critical error scenarios: connection failures, model not found, server busy, timeouts, file I/O errors, and workspace not found. Each has specific handling and a user-friendly message.
>
> For example, if the server returns a 404, we know the model isn't available—so we tell the user exactly that and point them to the settings. If there's a timeout, we suggest increasing the timeout setting.
>
> This level of care in error handling is what makes a tool feel professional and trustworthy."

### If Asked About Testing Strategy

**Show**: Brief overview of test files

**Voiceover**:
> "We use vitest for the test runner. LLMClient has 24 tests covering initialization, health checks, error scenarios, and API contracts. The extension has 28 tests for command parsing, path validation, and edge cases.
>
> Tests are fast (run in ~400ms), they're comprehensive (52 tests total, 100% pass rate), and they serve as documentation—read a test and understand exactly how the code should behave."

---

## Timing Breakdown

For a **2-minute demo**:
- Act 1 (Intro & Setup): 0:00 - 0:30
- Act 2 (Features): 0:30 - 1:50
- Act 3 (Architecture): 1:50 - 2:00
- Act 4 (Closing): 2:00 - 2:10

For a **3-minute demo**:
- Act 1 (Intro & Setup): 0:00 - 0:30
- Act 2 (Features): 0:30 - 1:50
- Act 3 (Architecture & Code): 1:50 - 2:45
- Act 4 (Closing): 2:45 - 3:00

For a **5-minute deep dive** (technical conference):
- Add full code walkthroughs
- Expand architecture discussion
- Include live Q&A

---

## Recording Tips

### Audio Quality
- Use a good microphone (USB condenser or lapel)
- Record in a quiet room
- Speak clearly and at a moderate pace
- Pause between thoughts to allow for editing

### Screen Recording
- Use 1920x1080 resolution for clarity
- Zoom in on important areas (code, chat output)
- Use a dark theme for easy reading
- Close unnecessary tabs and windows

### Editing Suggestions
- Add captions for accessibility and remote viewing
- Highlight key code sections with color overlays
- Use "callout" graphics to point to important UI elements
- Add text overlays for technical terms (e.g., "Streaming responses = real-time tokens")
- Include background music (royalty-free) at low volume

### Post-Production
- Total video length: 2-3 minutes (keep it snappy)
- Add title card (0-2 seconds)
- Add end card with links (last 5 seconds)
- Include captions throughout
- Export at 1080p 30fps for web

---

## Alternative Formats

### Twitter/Short-Form (30 seconds)
**Hook**: "Built a VS Code extension that runs your local LLM in the editor"  
**Focus**: Quick demo of `/write` command  
**Outro**: "TypeScript + tests + production ready"

### LinkedIn Post (with video)
**Hook**: "How I built an offline-first code assistant in TypeScript"  
**Focus**: Architecture decisions and why they matter  
**Call-to-action**: "Check out the GitHub repo"

### Technical Blog Post (with embedded video)
**Title**: "Building LLM Local Assistant: Architecture & Design Decisions"  
**Structure**: 
1. Introduction (problem statement)
2. Embedded video (2-minute demo)
3. Architecture deep-dive (expanded Act 3)
4. Design decisions (trade-off analysis)
5. Code highlights
6. Future roadmap
7. Call-to-action (GitHub link)

---

## Troubleshooting During Demo

### Problem: Ollama Not Responding

**Solution**:
- Have backup screenshot/gif of working demo
- Explain: "Normally this would show [expected output]"
- Pivot to discussing the error handling code

### Problem: Response Takes Too Long

**Solution**:
- Use shorter prompts (fewer tokens = faster response)
- Have pre-generated responses ready (screenshots)
- Explain: "In production, this would appear token-by-token as the LLM generates"

### Problem: File Doesn't Appear in Explorer

**Solution**:
- Trigger a refresh (F5 or click in explorer)
- Explain: "The file is written; we're just refreshing the view"

### Problem: Internet/Network Issues

**Solution**:
- Everything is local, so network shouldn't matter
- Check: Ollama server status
- Use terminal: `curl http://localhost:11434/api/tags`

---

## Success Criteria

✅ **After watching, the viewer understands**:
- What the extension does (chat + file operations)
- How it works (three-layer architecture)
- Why it's well-built (tests, types, error handling)
- How to try it (setup instructions)

✅ **Interview success**:
- Demonstrates technical depth
- Shows thoughtful design decisions
- Proves working, testable code
- Communicates clearly under observation

✅ **Code review perspective**:
- Proves extension works as intended
- Shows quality and attention to detail
- Demonstrates extensibility
- Builds confidence in the codebase

---

## Final Checklist Before Publishing

- [ ] Video is 2-3 minutes (not longer)
- [ ] Audio is clear and at consistent volume
- [ ] Screen is readable at 480p (test on mobile)
- [ ] Captions are accurate and timed
- [ ] All links in video/description are working
- [ ] GitHub repository link is prominent
- [ ] Example walkthrough (DEMO.md) link is included
- [ ] Video thumbnail is clear and compelling
- [ ] Title includes keywords: "LLM", "VS Code", "extension"
- [ ] Description includes setup instructions and timestamps

