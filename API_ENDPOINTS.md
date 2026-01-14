# ChatBridge API Endpoints

This document lists all the external API endpoints utilized by the ChatBridge extension.

## 🤖 Large Language Models (LLMs)

### 1. EuroLLM (Hugging Face Router)
*   **Purpose**: Primary high-quality multilingual translation.
*   **Model**: `utter-project/EuroLLM-22B-Instruct-2512:publicai`
*   **Endpoint**: `https://router.huggingface.co/v1/chat/completions`
*   **Spec**: OpenAI-Compatible Chat Completions.

### 2. Google Gemini API
*   **Purpose**: General analysis, summarization, and final fallback.
*   **Models**: `gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-pro-vision`.
*   **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
*   **Auth**: API Key via Query Parameter.

### 3. Hugging Face Inference API (Direct)
*   **Purpose**: Llama-based queries and faster translations for small snippets.
*   **Models**: `meta-llama/Meta-Llama-3-8B-Instruct`, `meta-llama/Llama-2-7b-chat-hf`.
*   **Endpoint**: `https://api-inference.huggingface.co/models/{model}`

### 4. OpenAI API
*   **Purpose**: General purpose LLM fallback and embeddings (if local disabled).
*   **Models**: `gpt-4o`, `gpt-3.5-turbo`.
*   **Endpoint**: `https://api.openai.com/v1/chat/completions`

## 📊 Logic & Embeddings

### 5. Local Transformers (via Content Script)
*   **Purpose**: Local semantic embedding generation (Privacy-first).
*   **Models**: Quantized BERT/RoBERTa variants.
*   **Endpoint**: Local CPU execution within Browser Tab.

## ⚙️ Backend (Proxy/Helper)

### 6. Cloudflare Proxy (Custom)
*   **Purpose**: Bypassing CORS and Cloudflare protection for Blob fetching.
*   **Type**: Integrated into background script proxying.
