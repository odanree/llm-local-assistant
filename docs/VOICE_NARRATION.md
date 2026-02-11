# Voice Narration Guide - v2.6

## Quick Start

### 1. Enable Voice (Setup)

```bash
# In VS Code, run:
LLM: Setup Voice Narration
```

This will:
- ✅ Check Python 3.8+ is installed
- ✅ Install dependencies (ChatTTS, torch, numpy)
- ✅ Download ChatTTS model (~1 GB)
- ✅ Verify setup is complete

**Time:** 5-10 minutes (first time only)

### 2. Test Voice

```bash
# In VS Code, run:
LLM: Test Voice Narration
```

This will:
- ✅ Verify TTS is working
- ✅ Synthesize test audio
- ✅ Report timing and metadata

### 3. Use Explain with Voice

```bash
# Select code in editor
# Run: LLM: Explain Code  (or Cmd+Shift+E)
```

The explanation panel will show:
- 📝 Text explanation from LLM
- 🎧 Audio player (if voice enabled)
- 📄 Original code (toggle to view)

---

## Configuration

### Voice Settings

Open settings and search for `llm-assistant.voice`:

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| `enabled` | `true` | - | Enable voice narration |
| `speed` | `1.0` | 0.5 - 2.0 | Playback speed |
| `language` | `en` | en, zh | Narration language |
| `maxChunkLength` | `500` | 100-2000 | Chars per synthesis call |
| `cacheEnabled` | `true` | - | Cache audio files |

### Example: Change Speed

```json
{
  "llm-assistant.voice.speed": 1.5
}
```

Options: 0.5x, 0.75x, 1.0x, 1.25x, 1.5x, 2.0x

### Example: Change Language

```json
{
  "llm-assistant.voice.language": "zh"
}
```

Options: `"en"` (English), `"zh"` (Chinese)

---

## Storage

### Where Audio is Cached

Audio files are cached locally for reuse:

**macOS/Linux:**
```bash
~/.cache/chat-tts/
```

**Windows:**
```
%APPDATA%\Chat-TTS\
```

### Clear Cache

To free up space:

```bash
# macOS/Linux
rm -rf ~/.cache/chat-tts/

# Windows
rmdir /s %APPDATA%\Chat-TTS\
```

Cache will be rebuilt automatically on next use.

### Cache Size

Check your cache usage in VS Code output panel (Voice section).

---

## Troubleshooting

### "Python 3.8+ required"

**Problem:** Setup fails because Python is not installed

**Solution:**
1. Download Python from https://www.python.org/downloads/
2. Install it (add to PATH during installation)
3. Verify: `python3 --version` (should show 3.8 or later)
4. Re-run `/setup-voice`

### "Voice not available"

**Problem:** Voice works on first setup, but later fails

**Possible causes:**
1. Model was deleted → Re-run `/setup-voice`
2. Python path changed → Check `llm-assistant.pythonPath` setting
3. Dependency issue → Run `/test-voice` to diagnose

**Solution:**
```
LLM: Test Voice Narration
(see detailed error message)
```

### "Slow audio generation"

**Problem:** First run takes 2-3 seconds, subsequent runs take 1-2 seconds

**This is normal!** 
- First run: Model loads into memory (~2-3 sec)
- Subsequent runs: Model cached in memory (~<1 sec per 100 chars)

**Optimization:**
- Increase `maxChunkLength` to reduce synthesis calls
- Disable voice temporarily if you need instant explanations

### "Audio sounds robotic"

**Problem:** Voice quality not conversational enough

**This is ChatTTS design.** It's optimized for clarity over emotion.

**Options:**
1. Adjust speed (faster = clearer, slower = more natural)
2. Try different speed settings in player
3. Consider enabling captions (text display)

### "No audio in explanation panel"

**Problem:** Explanation shows but no audio player

**Causes:**
1. Voice is disabled → Enable in settings
2. Voice not set up → Run `/setup-voice`
3. Model corrupted → Delete cache and re-run `/setup-voice`

**Solution:**
```
Run: LLM: Setup Voice Narration
```

---

## Performance

### Timing

| Operation | Time |
|-----------|------|
| First synthesis (model load) | 2-3 seconds |
| Subsequent synthesis | <1 second per 100 chars |
| File playback | Instant |

### Optimization Tips

1. **Use caching** (default enabled)
   - Same explanations instantly re-played
   - Disable if storage is limited

2. **Adjust chunk size**
   - Smaller chunks = more API calls
   - Larger chunks = longer wait time
   - Default 500 chars is balanced

3. **Pre-generate if needed**
   - Run `/explain` during break
   - Audio is cached for later

---

## Accessibility

### Keyboard Controls

- **Space** - Play/Pause
- **Arrow Left/Right** - Seek 5 seconds
- **Arrow Up/Down** - Volume control
- **Tab** - Navigate controls

### Audio Features

- **Playback Speed:** Adjust 0.5x - 2.0x
- **Volume Control:** Full slider support
- **Progress Bar:** Visual seek indicator
- **Time Display:** Current / Total duration

### Screen Readers

The audio player includes:
- ARIA labels
- Semantic buttons
- Time announcements
- Status updates

---

## Advanced

### Custom Python Path

If Python is not in PATH, specify manually:

```json
{
  "llm-assistant.pythonPath": "/usr/local/bin/python3"
}
```

Or on Windows:
```json
{
  "llm-assistant.pythonPath": "C:\\Python311\\python.exe"
}
```

### Environment Variables

If you need to set environment variables for Python:

```bash
# Linux/macOS
export PYTHONPATH=/path/to/custom/libs
export CUDA_VISIBLE_DEVICES=0

# Windows (PowerShell)
$env:PYTHONPATH = "C:\path\to\custom\libs"
$env:CUDA_VISIBLE_DEVICES = "0"

# Then run setup
```

### GPU Acceleration

ChatTTS automatically detects CUDA (NVIDIA GPU):

- **With CUDA:** 2-3x faster synthesis
- **Without CUDA:** CPU mode (still fast)

To check if CUDA is detected:
```
LLM: Test Voice Narration
(look for "cuda_available: true" in output)
```

To force CPU mode:
```bash
export CUDA_VISIBLE_DEVICES=""
```

---

## Commands Reference

### `/setup-voice`
Initialize voice narration with automated setup

**Output:** Setup progress panel, success/failure message

### `/test-voice`
Verify voice narration is working

**Output:** Test results (success/failure + metadata)

### `/explain` (Cmd+Shift+E)
Generate code explanation with optional audio narration

**Output:** Webview panel with text + audio player

### Voice Settings
Quick-pick menu to adjust voice configuration

**Options:** Enable/disable, adjust speed, change language, toggle cache

---

## FAQ

**Q: Does voice work offline?**
A: Yes! ChatTTS runs entirely locally. No internet required after setup.

**Q: How much disk space does voice use?**
A: ~1 GB for the model. Audio cache depends on usage (typically 10-100 MB).

**Q: Can I use voice with other LLMs?**
A: Yes! Voice works with any LLM provider. Integration shown in v2.6 example.

**Q: What languages are supported?**
A: English (en) and Chinese (zh). More coming in future versions.

**Q: How long does setup take?**
A: 5-10 minutes depending on internet speed (model download ~1 GB).

**Q: Can I customize the voice?**
A: Not in v2.6. Voice cloning coming in v2.7+.

**Q: Does voice work on mobile/iPad?**
A: No, desktop VS Code only. Web version not supported yet.

---

## Getting Help

### Check Logs

Open the output panel and look for "Voice" channel:

```
Cmd+Shift+U → Select "Voice Narration" or "Voice Setup"
```

### Common Error Messages

**"Model not found"**
→ Run `/setup-voice` to download

**"Synthesis failed"**
→ Check Python path in settings

**"Audio playback failed"**
→ Update your browser/VS Code

### Report Issues

GitHub: https://github.com/odanree/llm-local-assistant/issues

Include:
1. Error message from output panel
2. Python version (`python3 --version`)
3. OS version
4. VS Code version

---

**Version:** v2.6.0  
**Updated:** Feb 10, 2026  
**Status:** Stable
