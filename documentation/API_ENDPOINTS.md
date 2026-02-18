# ChatBridge API Endpoints

This document lists all external API endpoints utilized by the ChatBridge extension.

## 🤖 Large Language Models (LLMs)

### 1. Google Gemini API
*   **Purpose**: Primary API for summarization, rewriting, translation, sync tone, and general analysis.
*   **Models**: `gemini-2.0-flash`, `gemini-1.5-flash`.
*   **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
*   **Auth**: API Key via query parameter (`?key=...`).
*   **Used in**: `background.js` — `call_gemini` handler.

### 2. EuroLLM (HuggingFace Router)
*   **Purpose**: High-quality multilingual translation.
*   **Model**: `utter-project/EuroLLM-22B-Instruct-2512:publicai`
*   **Endpoint**: `https://router.huggingface.co/v1/chat/completions`
*   **Spec**: OpenAI-compatible Chat Completions format.
*   **Auth**: HuggingFace API token via `Authorization: Bearer` header.
*   **Used in**: `background.js` — `call_eurollm` handler.

### 3. Gemma 2 (HuggingFace Router)
*   **Purpose**: Style-conditioned rewriting.
*   **Model**: `google/gemma-2-2b-it`
*   **Endpoint**: `https://router.huggingface.co/hf-inference/models/google/gemma-2-2b-it/v1/chat/completions`
*   **Auth**: HuggingFace API token via `Authorization: Bearer` header.
*   **Used in**: `background.js` — `call_gemma_rewrite` handler.

### 4. Llama 3 (HuggingFace Inference)
*   **Purpose**: Fallback translation and rewriting.
*   **Model**: `meta-llama/Meta-Llama-3-8B-Instruct`
*   **Endpoint**: `https://api-inference.huggingface.co/models/{model}`
*   **Auth**: HuggingFace API token via `Authorization: Bearer` header.
*   **Used in**: `background.js` — `call_huggingface` handler.

### 5. OpenAI API
*   **Purpose**: Optional fallback for general LLM queries.
*   **Models**: `gpt-4o`, `gpt-3.5-turbo`.
*   **Endpoint**: `https://api.openai.com/v1/chat/completions`
*   **Auth**: OpenAI API key via `Authorization: Bearer` header.
*   **Used in**: `background.js` — `call_openai` handler.

## 🔑 API Key Configuration

All API keys are stored in `chrome.storage.local` and configured via the Options page:

| Key | Storage Key | Required? |
|-----|------------|-----------|
| Gemini | `chatbridge_gemini_key` | Recommended (enables summarize, rewrite, translate) |
| HuggingFace | `chatbridge_hf_key` | Optional (enables EuroLLM translation, Gemma rewrite) |
| OpenAI | `chatbridge_openai_key` | Optional (fallback LLM) |

## 📋 Host Permissions

Declared in `manifest.json`:
```json
"host_permissions": [
  "https://generativelanguage.googleapis.com/*",
  "https://api.openai.com/*",
  "https://api-inference.huggingface.co/*"
]
```

> **Note**: HuggingFace Router calls (`router.huggingface.co`) also need a host permission entry to avoid CORS issues.
