# ChatBridge API Endpoints

This document lists the external API endpoints currently used by ChatBridge.

## LLM Generation Endpoints

### 1. Google Gemini API
- Purpose: Primary generation path for summarize, rewrite, translate, sync tone, prompt optimization, and Agent Hub routing.
- Models used in code:
  - `gemini-2.0-flash`
  - `gemini-1.5-pro`
  - `gemini-1.5-flash`
- Endpoint:
  - `https://generativelanguage.googleapis.com/v1/models/{model}:generateContent`
- Auth: API key in query string (`?key=...`).
- Used in: `background.js` (`call_gemini`, `agent_route`, and provider fallback logic).

### 2. HuggingFace Router (OpenAI-compatible)
- Purpose: Primary non-Gemini fallback for rewrite/translate/chat-style generation.
- Models used in fallback chain:
  - `meta-llama/Meta-Llama-3.1-8B-Instruct`
  - `meta-llama/Meta-Llama-3-8B-Instruct`
  - `google/gemma-2-2b-it`
- Endpoint:
  - `https://router.huggingface.co/v1/chat/completions`
- Auth: HuggingFace API token via `Authorization: Bearer ...`.
- Used in: `background.js` (`call_llama`, `call_gemma_rewrite`, `call_gemini` fallback, `agent_route`) via `core/providerFallback.js`.

### 3. HuggingFace Direct Inference (OpenAI-compatible route)
- Purpose: Secondary HuggingFace fallback if router path fails.
- Endpoint:
  - `https://api-inference.huggingface.co/models/{model}/v1/chat/completions`
- Auth: HuggingFace API token via `Authorization: Bearer ...`.
- Used in: `core/providerFallback.js`.

### 4. NVIDIA API
- Purpose:
  - Text generation fallback (OpenAI-compatible chat completions).
  - Embeddings for retrieval/vector indexing.
- Models:
  - Chat: `meta/llama-3.1-8b-instruct`
  - Embeddings: `llama-nemotron-embed-1b-v2`
- Endpoints:
  - `https://integrate.api.nvidia.com/v1/chat/completions`
  - `https://integrate.api.nvidia.com/v1/embeddings`
- Auth: NVIDIA API token via `Authorization: Bearer ...`.
- Used in: `background.js` and provider fallback chain.

### 5. OpenAI API
- Purpose: Additional fallback for chat-style generation.
- Model default: `gpt-4o-mini`.
- Endpoint:
  - `https://api.openai.com/v1/chat/completions`
- Auth: OpenAI API key via `Authorization: Bearer ...`.
- Used in: `background.js` (`call_openai`) and provider fallback chain.

### 6. Anthropic Claude API (connection test only)
- Purpose: API key/connectivity validation from the options flow.
- Model in test call: `claude-3-haiku-20240307`.
- Endpoint:
  - `https://api.anthropic.com/v1/messages`
- Auth: `x-api-key` header plus `anthropic-version` header.
- Used in: `background.js` (`test_claude_api`).

## Embedding Endpoints

## Gemini Embeddings
- Models:
  - `gemini-embedding-001`
  - `gemini-embedding-2`
- Endpoint:
  - `https://generativelanguage.googleapis.com/v1/models/{model}:embedContent`
- Used in: `background.js` (`fetchEmbeddingViaGemini`).

### NVIDIA Embeddings
- Model: `llama-nemotron-embed-1b-v2`
- Endpoint:
  - `https://integrate.api.nvidia.com/v1/embeddings`
- Used in: `background.js` (`fetchEmbeddingNvidia`).

## Cloud Gateway Endpoint

When Cloud Gateway is enabled, provider calls are routed through a Worker URL (default below) before upstream delivery.

- Default gateway base URL:
  - `https://chatbridge-gateway.chatbridge-cloud.workers.dev`
- Worker API paths:
  - `POST /v1/proxy`
  - `GET /v1/health`
  - `GET /v1/info`
- Used in: `core/cloudProxy.js` and `workers/chatbridge-gateway/src/index.js`.

## API Key Storage Keys

Keys are stored in `chrome.storage.local` (NVIDIA key is encrypted at rest).

| Provider | Storage Key | Notes |
|---|---|---|
| Gemini | `chatbridge_gemini_key` | Primary generation key |
| HuggingFace | `chatbridge_hf_key` | Router/direct inference fallback |
| OpenAI | `chatbridge_openai_key` | Additional fallback |
| NVIDIA | `chatbridge_api_nvidia` | Encrypted before storage |
| Cloud Gateway Token | `chatbridge_api_cloud` (or `chatbridge_cloud_token`) | Worker bearer token |

## Manifest Host Permissions

Current `manifest.json` `host_permissions` include:

```json
"host_permissions": [
  "https://generativelanguage.googleapis.com/*",
  "https://api.openai.com/*",
  "https://api.anthropic.com/*",
  "https://api-inference.huggingface.co/*",
  "https://router.huggingface.co/*",
  "https://integrate.api.nvidia.com/*",
  "https://chatbridge-gateway.chatbridge-cloud.workers.dev/*"
]
```

Optional host permissions include wildcard Workers and local dev endpoints for custom gateway setups.
