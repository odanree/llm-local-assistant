# Model Comparison & System Requirements

This guide compares local open-source models with cloud-hosted proprietary models, helping you choose the right setup for your use case.

---

## System Requirements by Model Size

### Minimum Requirements

| Model Size | Parameters | RAM | VRAM (GPU) | Storage | Notes |
|---|---|---|---|---|---|
| **Tiny** | 1-3B | 4 GB | 2 GB | 2-4 GB | Mobile/Edge, basic tasks |
| **Small** | 7B | 8 GB | 4-6 GB | 15 GB | Recommended minimum for coding |
| **Medium** | 13B | 16 GB | 8 GB | 25 GB | Better quality, still fast |
| **Large** | 34B | 32 GB | 16+ GB | 65 GB | High quality, requires server |
| **Very Large** | 70B+ | 64+ GB | 40+ GB | 140+ GB | Enterprise use, significant resources |

### Performance Factors

1. **GPU Acceleration** (10-50x faster)
   - NVIDIA: CUDA-enabled GPUs (RTX 3060+ recommended)
   - AMD: ROCm support (RX 6700+ or MI100+)
   - Apple: Metal acceleration (M1/M2/M3 chips excellent)
   - CPU only: 5-10x slower, acceptable for small models

2. **Quantization Impact** (Reduces size/VRAM by 50-75%)
   - Q8: Full precision, minimal loss (8-bit quantization)
   - Q6: Good balance, ~6x compression
   - Q5: Recommended for most uses, ~5x compression
   - Q4: Good quality, ~4x compression
   - Q3: Fast but noticeable quality loss
   - Q2: Very small, poor quality

---

## Local Open-Source Models

### Mistral 7B (Recommended for LLM Local Assistant)

**Specifications:**
- Parameters: 7 billion
- Architecture: Transformer-based, trained on 8T tokens
- License: Apache 2.0 (commercial use allowed)
- Inference Speed: 50-100 tokens/sec (GPU), 5-10 tokens/sec (CPU)

**System Requirements:**
- RAM: 8 GB minimum, 16 GB recommended
- VRAM: 4-6 GB with quantization, 14 GB full precision
- Storage: 15 GB (Q4 quantization), 29 GB (full)
- GPU: Optional but highly recommended (10x speedup)

**Performance:**
```
Benchmark vs Closed-Source (normalized to Claude 3.5)
┌─────────────────────┬────────┬──────────┬──────────┐
│ Task                │ Mistral│ GPT-4o   │ Claude3.5│
├─────────────────────┼────────┼──────────┼──────────┤
│ Coding (HumanEval)  │ 73%    │ 88%      │ 92%      │
│ Math (MATH)         │ 35%    │ 64%      │ 72%      │
│ Reasoning (MMLU)    │ 64%    │ 88%      │ 88%      │
│ Instruction Follow  │ 90%    │ 88%      │ 95%      │
└─────────────────────┴────────┴──────────┴──────────┘
```

**Strengths:**
- Excellent code understanding and generation
- Fast inference, good quality-to-speed ratio
- Apache 2.0 license (commercial friendly)
- Community support and fine-tuning examples
- Good at instruction following

**Weaknesses:**
- Below Claude/GPT-4 on complex reasoning
- Limited math/science knowledge compared to larger models
- Context window: 32K (vs 200K for larger models)

**Use Cases:**
- ✅ Code assistance and generation
- ✅ Documentation writing
- ✅ Code review and analysis
- ✅ Task planning and decomposition
- ⚠️ Complex reasoning (acceptable for most coding tasks)
- ❌ Research-level math/physics

---

### Other Popular Open-Source Models

#### Llama 2 7B
- **Parameters**: 7B
- **Performance**: Similar to Mistral 7B (73% HumanEval)
- **Advantage**: Most popular, massive community
- **License**: Meta's license (commercial with limitations)
- **Best for**: General purpose, most examples online

#### Phi 2 / Phi 3
- **Parameters**: 2.7B / 3.8B
- **Performance**: Surprisingly good for size (HumanEval ~65%)
- **Advantage**: Tiny, runs on laptop CPU
- **License**: MIT (fully open)
- **Best for**: Edge devices, limited hardware

#### Code Llama
- **Parameters**: 7B / 13B / 34B variants
- **Performance**: Better at code than Llama 2 (HumanEval ~80% for 13B)
- **Advantage**: Specialized for code
- **License**: Meta's license
- **Best for**: When code quality is paramount

#### Openchat 3.5
- **Parameters**: 7B
- **Performance**: ~75% HumanEval, faster than base Mistral
- **Advantage**: Optimized for chat/instruction
- **License**: Apache 2.0
- **Best for**: Conversation-focused applications

---

## Cloud-Hosted Proprietary Models

### Claude 3.5 Sonnet (Anthropic)

**Performance:**
- HumanEval: 92% (top-tier for coding)
- MMLU: 88% (strong reasoning)
- Math: 92%
- Long context: 200K tokens

**Cost:**
- Input: $3/million tokens
- Output: $15/million tokens
- Example: 100 planning requests × 2K tokens = ~$0.30

**Strengths:**
- Best-in-class code generation
- Strong reasoning and problem-solving
- Excellent safety and constitutional AI
- Large context window (good for understanding full projects)
- Real-time API with streaming

**Weaknesses:**
- Requires internet connection
- Data privacy concerns (Anthropic stores usage)
- Vendor lock-in
- Rate limiting for free accounts
- Latency: 1-5 seconds typical

**Comparison to Mistral 7B:**
```
Coding Capability (relative performance)
Claude 3.5:    ████████████ 92%
Mistral 7B:    ███████░░░░░ 73%
GPT-4o:        ███████████░ 88%
Gap:           19% improvement over Mistral
Cost Premium:  200x more expensive per request
Speed:         20x slower (local vs cloud latency)
```

---

### GPT-4o (OpenAI)

**Performance:**
- HumanEval: 88% (excellent)
- MMLU: 88%
- Speed: Faster than Claude (turbo mode)

**Cost:**
- Input: $5/million tokens ($0.005 per 1K tokens)
- Output: $15/million tokens ($0.015 per 1K tokens)
- More expensive than Claude for most workloads

**Strengths:**
- Multimodal (vision, images)
- Fast inference
- Very popular, lots of examples
- Good all-around capability

**Weaknesses:**
- Highest cost among major models
- More aggressive rate limiting
- Not as good as Claude for reasoning-heavy tasks

---

### Gemini 3 Pro (Google)

**Performance:**
- HumanEval: ~78% (solid for coding)
- MMLU: 85%
- Context: 1M tokens (largest)

**Cost:**
- Input: $0.075/million tokens (cheapest)
- Output: $0.3/million tokens
- Best for high-volume workloads

**Strengths:**
- Huge context window (1M tokens)
- Cheapest option for large-scale
- Excellent for processing large codebases
- Integrated with Google services

**Weaknesses:**
- Newer model, less stability
- Slightly lower code quality than Claude
- API less mature

---

## Performance Comparison Matrix

### Coding Tasks (HumanEval Score)
```
Local Models:
  Mistral 7B:      73% (free, fast, privacy)
  Llama 2 13B:     77% (larger)
  Code Llama 13B:  80% (specialized)
  Openchat 7B:     72% (optimized for chat)

Cloud Models:
  Claude 3.5:      92% ($3 input, $15 output per 1M tokens)
  GPT-4o:          88% ($5 input, $15 output per 1M tokens)
  Gemini 3 Pro:    78% ($0.075 input, $0.3 output per 1M tokens)
```

### Reasoning Tasks (MMLU Score)
```
Local:
  Mistral 7B:      64% (good for practical tasks)
  Llama 2 13B:     73%

Cloud:
  Claude 3.5:      88% (best)
  GPT-4o:          88% (tied)
  Gemini 3 Pro:    85%
```

---

## Cost Analysis

### Scenario 1: Autonomous Task Planning (10 planning sessions/day)

**Local (Mistral 7B):**
- Hardware: $500 (GPU), $30/month power
- Per request: ~$0.0025 (amortized hardware + power)
- 300 requests/month: $0.75 + electricity
- Privacy: ✅ Full

**Cloud (Claude 3.5):**
- Per planning request: ~0.5K input tokens = $0.0015
- Per execution: ~2K output tokens = $0.03
- 300 requests/month: $10.50
- Privacy: ⚠️ Data shared with provider

**Cloud (Gemini 3 Pro):**
- 300 requests/month: $0.20
- Privacy: ⚠️ Data shared with provider

**Break-even Analysis:**
- Mistral: Hardware cost pays for itself if >1000 API requests/month
- Best for frequent users: Local
- Best for occasional users: Gemini 3 Pro or Claude API with free tier

---

## Recommendation by Use Case

### For LLM Local Assistant Users

**Use Local (Mistral 7B) if:**
- ✅ Privacy critical (proprietary code)
- ✅ High volume planning requests (>5/day)
- ✅ Offline capability required
- ✅ Have GPU available
- ✅ Consistent, predictable latency important

**Use Cloud (Claude 3.5) if:**
- ✅ Maximum code quality needed
- ✅ Complex reasoning required
- ✅ Large context windows needed (whole project in context)
- ✅ Willing to pay premium for top-tier performance

**Use Cloud (Gemini 3 Pro) if:**
- ✅ Cost conscious (<$1/month expected)
- ✅ Occasional use (few requests/week)
- ✅ Processing large codebases (1M token context)

**Hybrid Approach:**
```
Local: Planning phase (fast, free, private)
Cloud: Complex reasoning (when needed, pay per use)
```

---

## Performance Characteristics

### Latency Comparison

```
                    Planning Phase    Execution Phase
Local (GPU):        200-500ms         500ms-2s per step
Local (CPU):        2-5s              3-10s per step
Claude API:         1-2s              1-2s per step
GPT-4:              2-3s              2-3s per step
Gemini:             1-2s              1-2s per step

Advantage: Local has predictable latency, no internet required
```

### Memory Usage During Execution

```
Mistral 7B:    
  - Load time: 5-10 seconds (cold start)
  - Peak VRAM: 6GB (with quantization)
  - System RAM: 4GB overhead
  - Total: 10GB dedicated hardware needed

Claude API:
  - No local resources
  - Network: 1-5 Mbps
```

---

## Implementation in LLM Local Assistant

### Current Configuration
- **Default Model**: Mistral 7B Instruct
- **Endpoints Supported**: Ollama, LM Studio, vLLM
- **Quantization**: Automatically handled by chosen platform
- **Planning Timeout**: 120 seconds (sufficient for Mistral)

### Switching Models

**To use a different local model:**
```bash
# Ollama - Switch model
ollama run llama2          # Llama 2 7B
ollama run openchat:7b     # Openchat 3.5
ollama run codellama:13b   # Code Llama 13B

# LM Studio - Select model in UI and start server
# vLLM - Specify model
python -m vllm.entrypoints.openai.api_server \
  --model mistral-7b-instruct-v0.2
```

**To use cloud models:**
```bash
# Configure extension to point to Claude API
# (Set endpoint: https://api.anthropic.com/v1)
# Note: Requires separate API configuration
```

---

## Summary Table

| Aspect | Local (Mistral) | Claude 3.5 | GPT-4o | Gemini 3 |
|---|---|---|---|---|
| **Coding Ability** | ⭐⭐⭐⭐ (73%) | ⭐⭐⭐⭐⭐ (92%) | ⭐⭐⭐⭐⭐ (88%) | ⭐⭐⭐⭐ (78%) |
| **Reasoning** | ⭐⭐⭐ (64%) | ⭐⭐⭐⭐⭐ (88%) | ⭐⭐⭐⭐⭐ (88%) | ⭐⭐⭐⭐ (85%) |
| **Speed** | ⭐⭐⭐⭐ Fast | ⭐⭐⭐ Slow | ⭐⭐⭐⭐ Fast | ⭐⭐⭐⭐ Fast |
| **Privacy** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ |
| **Cost** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐ | ⭐⭐⭐⭐ |
| **Offline** | ⭐⭐⭐⭐⭐ | ❌ | ❌ | ❌ |
| **Setup** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## References

- Mistral AI: https://mistral.ai/
- HumanEval Benchmark: https://github.com/openai/human-eval
- MMLU Benchmark: https://github.com/hendrycks/test
- Claude API: https://www.anthropic.com/
- GPT-4: https://openai.com/
- Gemini: https://ai.google.dev/

**Last Updated**: December 10, 2025
