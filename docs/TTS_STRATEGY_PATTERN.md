# TTS Strategy Pattern - Architecture Guide

## Overview

The TTS service now uses a **pluggable strategy architecture** with dependency injection, making it easy to swap different TTS implementations without changing extension code.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ extension.ts - Extension Handler                            │
│ Uses: getTTSService() / TTSServiceFactory                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ TTSServiceFactory - Strategy Selection                      │
│ Creates appropriate strategy instance based on config       │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ↓            ↓            ↓
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │EdgeTTS   │ │Chatterbox│ │Future    │
        │Strategy  │ │Strategy  │ │Strategies│
        │(Stable)  │ │(Planned) │ │(TBD)     │
        └──────────┘ └──────────┘ └──────────┘
             ↓            ↓            ↓
        ┌─────────────────────────────────────────────────────┐
        │ All implement: ITTSStrategy interface               │
        │ - isAvailable()                                     │
        │ - synthesize(text, lang)                           │
        │ - getBackendName()                                 │
        │ - getInfo()                                        │
        └─────────────────────────────────────────────────────┘
```

## Strategy Classes

### ITTSStrategy Interface
All TTS backends must implement this:

```typescript
interface ITTSStrategy {
  isAvailable(): Promise<boolean>;
  synthesize(text: string, lang?: string): Promise<SynthesisResult>;
  getBackendName(): string;
  getInfo(): Promise<Record<string, any>>;
}
```

### BaseTTSStrategy
Abstract base class providing common functionality:
- Caching (read/write audio files)
- Text chunking at sentence boundaries
- String escaping for command lines
- Cache key generation
- Metadata formatting

Subclasses only need to implement:
- `isAvailable()` - Check if backend is ready
- `synthesize()` - Synthesize text to audio
- `getBackendName()` - Return strategy name
- `getInfo()` - Return diagnostic info

### EdgeTTSStrategy (Current)
Uses Microsoft Edge cloud TTS API via edge-tts Python library.
- **Status**: Stable, production-ready
- **Configuration**: pythonPath, pythonDir
- **Cost**: Free (no API keys)
- **Features**: Multi-language, fast

### ChatterboxStrategy (Future)
Placeholder for local Chatterbox TTS backend.
- **Status**: Planned (not yet implemented)
- **Configuration**: modelPath, gpu
- **Cost**: No API calls (local inference)
- **Features**: Fully offline, customizable voices

## Usage

### Basic Usage (Backward Compatible)

```typescript
// Old API still works
import { getTTSService } from './services/ttsService';

const tts = getTTSService();
const result = await tts.synthesize('Hello world');
```

### Using Factory (Recommended)

```typescript
import { TTSServiceFactory } from './services/ttsServiceFactory';

// Create with default config (EdgeTTS)
const tts = TTSServiceFactory.create();

// Create with custom config
const tts = TTSServiceFactory.create({
  language: 'zh',
  pythonPath: '/usr/bin/python3',
});

// Switch strategies
const tts = TTSServiceFactory.create({
  strategy: 'chatterbox', // When implemented
  gpu: true,
});
```

### Checking Available Strategies

```typescript
const strategies = TTSServiceFactory.getAvailableStrategies();
// Returns:
// [
//   { name: 'edge-tts', description: '...', status: 'stable' },
//   { name: 'chatterbox', description: '...', status: 'planned' }
// ]
```

## Adding a New TTS Strategy

### Step 1: Create Strategy Class

```typescript
// src/services/myttsStrategy.ts
import { BaseTTSStrategy, ITTSStrategy, SynthesisResult } from './ttsStrategy';

export interface MyTTSConfig extends TTSStrategyConfig {
  customOption?: string;
}

export class MyTTSStrategy extends BaseTTSStrategy implements ITTSStrategy {
  constructor(config: MyTTSConfig = {}) {
    super(config);
    // Initialize your backend
  }

  getBackendName(): string {
    return 'my-tts';
  }

  async isAvailable(): Promise<boolean> {
    // Check if your TTS service is ready
  }

  async synthesize(text: string, lang?: string): Promise<SynthesisResult> {
    // Implement synthesis
    const chunks = this.chunkText(text);
    // ... synthesize chunks ...
    return { audio, metadata };
  }

  async getInfo(): Promise<Record<string, any>> {
    // Return diagnostic info
    return {
      backend: this.getBackendName(),
      available: await this.isAvailable(),
    };
  }
}
```

### Step 2: Register in Factory

```typescript
// src/services/ttsServiceFactory.ts

private static createStrategy(strategy: TTSStrategy, config: TTSServiceConfig): ITTSStrategy {
  switch (strategy) {
    case 'edge-tts':
      return new EdgeTTSStrategy(config);
    case 'chatterbox':
      return new ChatterboxStrategy(config);
    case 'my-tts':  // Add here
      return new MyTTSStrategy(config);
    default:
      throw new Error(`Unknown TTS strategy: ${strategy}`);
  }
}
```

### Step 3: Update Type Definitions

```typescript
// src/services/ttsServiceFactory.ts

export type TTSStrategy = 'edge-tts' | 'chatterbox' | 'my-tts';
```

### Step 4: Update Available Strategies

```typescript
// src/services/ttsServiceFactory.ts

static getAvailableStrategies() {
  return [
    // ... existing ...
    {
      name: 'my-tts',
      description: 'My custom TTS backend',
      status: 'experimental',
    },
  ];
}
```

## Testing Strategies

```typescript
// Test multiple strategies in parallel
async function testAllStrategies() {
  const strategies = ['edge-tts', 'chatterbox', 'my-tts'];
  
  for (const strategyName of strategies) {
    const tts = TTSServiceFactory.createNew({ 
      strategy: strategyName as TTSStrategy 
    });
    
    const available = await tts.isAvailable();
    console.log(`${strategyName}: ${available ? 'available' : 'not available'}`);
    
    if (available) {
      const result = await tts.synthesize('Test text');
      console.log(`Duration: ${result.metadata.duration}s`);
    }
  }
}
```

## Benefits of This Architecture

✅ **Modularity** - Each strategy is independent
✅ **Testability** - Easy to mock/test individual strategies
✅ **Extensibility** - Add new TTS backends without changing core code
✅ **Type Safety** - Interfaces ensure consistency
✅ **DRY** - Shared logic in BaseTTSStrategy
✅ **Backward Compatibility** - Old getTTSService() still works
✅ **Flexibility** - Switch strategies at runtime based on config
✅ **Future-Proof** - Prepared for local TTS (Chatterbox, etc)

## Configuration

Strategies can be configured via environment variables or settings:

```json
{
  "llm-assistant.tts.strategy": "edge-tts",
  "llm-assistant.tts.language": "en",
  "llm-assistant.tts.pythonPath": "/usr/bin/python3"
}
```

## Performance Considerations

- **EdgeTTS**: Fast (2-5s per 100 chars), requires internet
- **Chatterbox** (when ready): Slower (5-10s per 100 chars), fully offline
- **Caching**: All strategies support caching to prevent re-synthesis

## Future Enhancements

Potential TTS backends to add:
- **Chatterbox** - Local, fully offline
- **Azure TTS** - Professional quality, API-based
- **Google Cloud TTS** - Excellent quality, API-based
- **ElevenLabs** - Natural voices, API-based
- **Tacotron2** - Local, high quality
- **Glow-TTS** - Local, fast
