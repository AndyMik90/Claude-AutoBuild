# Ollama Hybrid Setup Guide

This guide explains how to configure Auto-Claude with Ollama for local LLM execution, either as a standalone provider or in hybrid mode with Claude.

## Overview

Auto-Claude supports multiple AI providers through its flexible API profile system. Ollama integration enables:

- **Fully offline operation** with local LLMs
- **Cost savings** by running models on your own hardware
- **Hybrid mode** combining Claude (cloud) for complex tasks and Ollama (local) for routine operations
- **Privacy** by keeping sensitive code on your local machine

## Hardware Requirements

### Minimum Requirements
- **CPU**: Modern multi-core processor (4+ cores recommended)
- **RAM**: 16GB (32GB recommended for parallel agents)
- **GPU**: Optional but highly recommended for performance
- **Storage**: 10-50GB depending on model sizes

### Recommended Configuration (Example: RTX 3080 Ti Setup)
- **CPU**: AMD Ryzen 7 2700X or equivalent
- **RAM**: 32GB DDR4
- **GPU**: NVIDIA RTX 3080 Ti (12GB VRAM) with CUDA support
- **Storage**: SSD with 50GB+ free space

This configuration can efficiently run:
- 4-6 parallel agents with quantized 7B-8B models
- Context windows of 8k-16k tokens
- Full GPU acceleration for inference

## Installation

### 1. Install Ollama

Download and install Ollama from [https://ollama.ai/](https://ollama.ai/)

**Linux/macOS:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Windows:**
Download the installer from the official website.

### 2. Pull Recommended Models

For coding tasks with Auto-Claude, we recommend:

```bash
# Primary LLM for code generation (optimized for 12GB VRAM)
ollama pull llama3.1:8b-instruct-q4_K_M

# Alternative: Specialized coding model
ollama pull qwen2.5-coder:7b

# Embedding model for memory/context
ollama pull nomic-embed-text
```

**Model Selection Guide:**

| Model | Size | VRAM Usage | Best For |
|-------|------|------------|----------|
| `llama3.1:8b-instruct-q4_K_M` | ~4.5GB | 5-6GB | General coding, balanced performance |
| `qwen2.5-coder:7b` | ~4GB | 4-5GB | Code-specific tasks, faster inference |
| `deepseek-r1:7b` | ~4GB | 4-5GB | Reasoning tasks, complex logic |
| `codellama:7b` | ~3.8GB | 4-5GB | Code completion, legacy support |
| `nomic-embed-text` | ~274MB | <1GB | Embeddings for memory layer |

### 3. Verify Installation

```bash
# Check Ollama is running
ollama list

# Test a model
ollama run llama3.1:8b-instruct-q4_K_M "Write a Python function to calculate fibonacci"
```

## Configuration

### Basic Ollama Setup

1. Copy the example environment file:
```bash
cd apps/backend
cp .env.example .env
```

2. Configure Ollama in `.env`:
```bash
# Enable Graphiti memory with Ollama
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=ollama
GRAPHITI_EMBEDDER_PROVIDER=ollama

# Ollama server settings
OLLAMA_BASE_URL=http://localhost:11434

# Model configuration
OLLAMA_LLM_MODEL=llama3.1:8b-instruct-q4_K_M
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_EMBEDDING_DIM=768
```

### Hardware-Optimized Settings (RTX 3080 Ti Example)

For systems with 32GB RAM and 12GB VRAM:

```bash
# Limit parallel agents to prevent memory exhaustion
MAX_PARALLEL_AGENTS=6

# GPU acceleration (auto-detect optimal layers)
OLLAMA_NUM_GPU=-1

# Context window (balance between capability and VRAM)
OLLAMA_NUM_CTX=8192
```

**Tuning Guidelines:**

- **MAX_PARALLEL_AGENTS**: 
  - 16GB RAM: 2-3 agents
  - 32GB RAM: 4-6 agents
  - 64GB RAM: 8-12 agents

- **OLLAMA_NUM_GPU**:
  - `-1`: Auto-detect (recommended)
  - `0`: CPU only
  - `32`: Manual layer count (for fine-tuning)

- **OLLAMA_NUM_CTX**:
  - `4096`: Minimal, fastest inference
  - `8192`: Recommended for coding tasks
  - `16384`: Larger context, more VRAM usage
  - `32768+`: Only for high-VRAM GPUs (24GB+)

### Hybrid Mode (Claude + Ollama)

Use Claude for complex tasks and Ollama for routine operations:

```bash
# Primary agent uses Claude
CLAUDE_CODE_OAUTH_TOKEN=your-oauth-token-here
AUTO_BUILD_MODEL=claude-opus-4-5-20251101

# Memory layer uses Ollama (local, offline)
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=ollama
GRAPHITI_EMBEDDER_PROVIDER=ollama
OLLAMA_LLM_MODEL=llama3.1:8b-instruct-q4_K_M
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_EMBEDDING_DIM=768
```

**Hybrid Strategy:**
- **Claude**: Complex reasoning, architecture decisions, critical code reviews
- **Ollama**: Context retrieval, embeddings, routine QA checks, offline operation

## Performance Optimization

### GPU Acceleration

Ensure CUDA is properly configured:

```bash
# Check NVIDIA driver
nvidia-smi

# Verify Ollama GPU usage
ollama run llama3.1:8b-instruct-q4_K_M "test"
# Watch GPU usage in another terminal
watch -n 1 nvidia-smi
```

### Memory Management

Monitor resource usage:

```bash
# Install monitoring tools
pip install psutil gputil

# Check available resources
python3 -c "import psutil; print(f'RAM: {psutil.virtual_memory().percent}%')"
```

### Context Window Optimization

Auto-Claude includes built-in context management:
- **File filtering**: Only loads relevant code files
- **Chunking**: Splits large files into manageable pieces
- **Memory layer**: Uses embeddings to retrieve relevant context

For Ollama, these features are especially important due to smaller context windows compared to Claude.

## Troubleshooting

### Issue: "Connection refused" to Ollama

**Solution:**
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Restart Ollama service
# Linux/macOS:
systemctl restart ollama
# Windows: Restart from system tray
```

### Issue: Out of memory (OOM) errors

**Solution:**
1. Reduce `MAX_PARALLEL_AGENTS` in `.env`
2. Use smaller models (e.g., `llama3.2:3b` instead of `8b`)
3. Lower `OLLAMA_NUM_CTX` to 4096 or 2048
4. Close other GPU-intensive applications

### Issue: Slow inference speed

**Solution:**
1. Verify GPU is being used: `nvidia-smi` should show GPU utilization
2. Use quantized models (q4_K_M variants)
3. Reduce context window size
4. Ensure Ollama has latest version: `ollama --version`

### Issue: Model not found

**Solution:**
```bash
# List available models
ollama list

# Pull missing model
ollama pull llama3.1:8b-instruct-q4_K_M
```

## Advanced Configuration

### Custom Model Parameters

Create a `Modelfile` for fine-tuned control:

```bash
# Create Modelfile
cat > Modelfile << EOF
FROM llama3.1:8b-instruct-q4_K_M

# Set temperature for more deterministic output
PARAMETER temperature 0.7

# Set context window
PARAMETER num_ctx 8192

# System prompt for coding tasks
SYSTEM You are an expert software engineer. Provide concise, production-ready code with clear explanations.
EOF

# Create custom model
ollama create auto-claude-coder -f Modelfile

# Use in .env
OLLAMA_LLM_MODEL=auto-claude-coder
```

### Multi-Model Strategy

Switch models based on task type:

```bash
# Fast model for simple tasks
OLLAMA_LLM_MODEL_SIMPLE=llama3.2:3b

# Powerful model for complex tasks
OLLAMA_LLM_MODEL_COMPLEX=llama3.1:70b-instruct-q4_K_M

# Coding-specialized model
OLLAMA_LLM_MODEL_CODE=qwen2.5-coder:7b
```

## Benchmarks

Performance comparison on RTX 3080 Ti (12GB VRAM):

| Model | Tokens/sec | VRAM Usage | Context Window | Quality (1-10) |
|-------|-----------|------------|----------------|----------------|
| llama3.1:8b-q4_K_M | 45-55 | 5.5GB | 8k | 8 |
| qwen2.5-coder:7b | 50-60 | 4.8GB | 8k | 8 |
| deepseek-r1:7b | 40-50 | 5.2GB | 8k | 9 |
| llama3.2:3b | 80-100 | 2.5GB | 4k | 6 |

*Note: Actual performance varies based on system configuration and workload.*

## Resources

- **Ollama Documentation**: [https://github.com/ollama/ollama](https://github.com/ollama/ollama)
- **Model Library**: [https://ollama.ai/library](https://ollama.ai/library)
- **Auto-Claude Repository**: [https://github.com/AndyMik90/Auto-Claude](https://github.com/AndyMik90/Auto-Claude)
- **CUDA Setup**: [https://developer.nvidia.com/cuda-downloads](https://developer.nvidia.com/cuda-downloads)

## Contributing

Found an optimization or improvement? Contributions are welcome! Please follow the AGPL-3.0 license terms and submit pull requests to the main repository.

## License

This guide is part of Auto-Claude, licensed under AGPL-3.0. Any forks or derivatives must maintain the same license.
