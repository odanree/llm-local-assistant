# Local Testing Guide - v2.6 Voice Narration

**Release**: v2.6.0  
**Focus**: Voice narration feature testing and verification  
**Platforms**: Windows, macOS, Linux

---

## Quick Start (5 Minutes)

### 1. Clone and Setup
```bash
git clone https://github.com/odanree/llm-local-assistant.git
cd llm-local-assistant
git checkout feat/v2.6-voice-narration
npm install
npm run build
```

### 2. Start LLM Server
```bash
# In separate terminal
ollama run mistral
```

### 3. Launch Extension
```bash
# In VS Code
Press F5  # Opens debug window with extension
```

### 4. Test Voice
```
Cmd+Shift+P → LLM Assistant: Setup Voice Narration
Follow wizard (1-2 minutes)
Cmd+Shift+P → LLM Assistant: Test Voice Narration
Should hear "Voice narration is working!" spoken aloud
```

---

## Detailed Testing Checklist

### Environment Setup

- [ ] Node.js 18+ installed: `node --version`
- [ ] Python 3.8+ installed: `python3 --version` (for voice)
- [ ] VS Code 1.85+ installed: Check Help → About
- [ ] Ollama running: `ollama list` should show models
- [ ] Git with feature branch: `git branch -a | grep v2.6`

### Build & Compilation

- [ ] npm install succeeds: `npm install` (no errors)
- [ ] Build succeeds: `npm run build` (0 errors)
- [ ] No type errors: `npx tsc --noEmit`
- [ ] Linting passes: `npm run lint` (0 errors)
- [ ] Extension loads: F5 → debug window opens

### Basic LLM Functionality

- [ ] Chat messages work: Type "hello" → Send
- [ ] /read command: `/read src/extension.ts` → shows file
- [ ] /write command: `/write test.ts write a hello function` → creates file
- [ ] Error handling: `/read invalid/path.ts` → error message
- [ ] History clearing: Close/reopen chat → history cleared

### Voice Narration Feature

#### Setup Phase
- [ ] Setup command available: `Cmd+Shift+P → Setup Voice Narration`
- [ ] Setup wizard runs: Checks Python, installs edge-tts
- [ ] Setup completes: "Voice setup complete!" message
- [ ] Configuration saved: Settings appear in VS Code settings

#### Voice Testing
- [ ] Test command available: `Cmd+Shift+P → Test Voice Narration`
- [ ] Test executes: Shows "Testing voice..." message
- [ ] Audio plays: Hears "Voice narration is working!" (or similar)
- [ ] Duration shows: Audio player shows "0:05" or similar length
- [ ] Player controls work:
  - [ ] Play button works
  - [ ] Pause button works
  - [ ] Progress seeking works
  - [ ] Volume control works

#### /explain with Voice
- [ ] /explain command: `/explain src/extension.ts` → generates explanation
- [ ] Audio appears: AudioPlayer component visible in chat
- [ ] Audio plays automatically: Sound plays without clicking
- [ ] Player visible: All controls visible (play, pause, seek, volume)
- [ ] Can replay: Click play button again → plays again
- [ ] Caching works: Explain same file twice → second is instant

### Cross-Platform Verification

#### Windows
- [ ] Python found automatically: No manual pythonPath config needed
- [ ] UTF-8 output: Emoji (✅, ❌) display correctly in Python output
- [ ] Paths work: Absolute paths resolve correctly
- [ ] Build succeeds: `npm run build` (Windows PowerShell)

#### macOS
- [ ] Homebrew ollama: Works with `brew services start ollama`
- [ ] Audio plays: System audio works in VS Code
- [ ] Keyboard shortcut: Cmd+Shift+E works for /explain

#### Linux
- [ ] Snap/package ollama: Works with `ollama run mistral`
- [ ] Audio plays: ALSA/PulseAudio works
- [ ] File paths: Unix paths work correctly

### Configuration & Settings

- [ ] Settings visible: VS Code Settings → voice.enabled
- [ ] Speed adjustment: Slider 0.5x to 2.0x works
- [ ] Language options: en / zh selectable
- [ ] Cache toggle: cacheEnabled on/off works
- [ ] Python path: pythonPath auto-detected correctly

### Documentation Verification

- [ ] README.md: v2.6 features documented
- [ ] INSTALL.md: ModelFile guide included
- [ ] INSTALL.md: Voice setup instructions clear
- [ ] RELEASE-COMPLETE.md: v2.6 release notes present
- [ ] ARCHITECTURE.md: Voice architecture documented
- [ ] CONTRIBUTING.md: Voice development guide included

### Error Handling

- [ ] Python not found: Shows clear error message
- [ ] Voice disabled: Commands handle gracefully
- [ ] TTS failure: Falls back or shows error
- [ ] Invalid settings: Defaults used
- [ ] Network error (edge-tts): Shows retry option

### Performance

- [ ] Startup time: <3 seconds (F5 to ready)
- [ ] /explain speed: <5 seconds for typical code
- [ ] TTS speed: <2 seconds for 500 char explanation
- [ ] Memory: Extension memory stable (no leaks after 10 operations)
- [ ] CPU: CPU returns to baseline between operations

### File Changes Verification

**Python Files (voice service)**:
- [ ] python/tts_service.py exists and has UTF-8 force
- [ ] python/setup_tts.py exists and has UTF-8 force
- [ ] python/test_tts.py exists and has UTF-8 force

**TypeScript Files (commands & service)**:
- [ ] src/services/ttsService.ts: Cross-platform Python detection
- [ ] src/services/ttsService.ts: context.extensionPath usage
- [ ] src/commands/voice.ts: Setup command handler
- [ ] src/commands/explain.ts: Audio integration
- [ ] src/extension.ts: Context passed to services

**React Components**:
- [ ] webview/components/AudioPlayer.tsx exists
- [ ] webview/components/ExplanationPanel.tsx exists
- [ ] webview/styles/audioPlayer.css exists

**Configuration**:
- [ ] package.json: Voice settings schema
- [ ] package.json: Voice commands registered
- [ ] .vscodeignore: python/ folder included

### Git Commit Verification

- [ ] 12 clean commits total
- [ ] Latest commit: documentation updates
- [ ] All commits have meaningful messages
- [ ] No merge commits in feature branch
- [ ] No large binary files accidentally committed

---

## Troubleshooting During Testing

### Python Not Found
```bash
# Check Python installed
python3 --version    # Should be 3.8+

# If not found, install:
brew install python3        # macOS
apt install python3         # Linux
# Windows: Download from python.org
```

### Voice Setup Fails
```bash
# Re-run setup
Cmd+Shift+P → Setup Voice Narration

# Check Python path in settings
VS Code Settings → python-path

# Test Python directly
python3 /path/to/python/setup_tts.py
```

### Audio Not Playing
```bash
# Check system volume (not muted)
# Run test command
Cmd+Shift+P → Test Voice Narration

# Check extension output
View → Output → Extension Host

# Verify settings
VS Code Settings → voice.enabled (should be true)
```

### Build Fails
```bash
# Clean build
rm -rf dist node_modules
npm install
npm run build

# Check for errors
npm run lint
npx tsc --noEmit
```

### CI/CD Issues

- [ ] npm ci works: `npm ci` (no ERESOLVE)
- [ ] Lock file synced: `git diff package-lock.json` (small/none)
- [ ] All tests pass: `npm test` (if applicable)

---

## Test Report Template

**Tested By**: [Your Name]  
**Platform**: Windows/macOS/Linux  
**Date**: [YYYY-MM-DD]  
**Branch**: feat/v2.6-voice-narration  

### Summary
- [ ] All basic features work
- [ ] Voice narration works
- [ ] Cross-platform verified
- [ ] Documentation correct
- [ ] Ready for release

### Issues Found
1. [Issue description] - Severity: High/Medium/Low

### Sign-Off
- [ ] Ready for GitHub PR
- [ ] Ready for Marketplace

---

## Useful Commands

```bash
# Build & test
npm run build              # Compile
npm run lint               # ESLint
npm run watch              # Auto-rebuild

# Voice testing
python3 python/test_tts.py          # Direct TTS test
python3 python/setup_tts.py          # Setup manually

# Git operations
git log -5 --oneline                # Last 5 commits
git diff HEAD~5..HEAD               # Changes in v2.6
git status                          # Working directory

# Debugging
F5                                  # Launch debug window
Shift+Ctrl+Y                        # Debug console
Cmd+Shift+P → Developer: Show Logs  # Extension logs
```

---

**Ready to Test!** 🚀

Use this guide to verify v2.6 voice narration is production-ready.

Report any issues on GitHub with this test guide reference.
