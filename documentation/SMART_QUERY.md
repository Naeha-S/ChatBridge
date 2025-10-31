Smart Archive + Query (ChatBridge)

Overview

This feature adds a local "Smart Archive + Query" panel to ChatBridge which lets you search and ask questions about your saved conversations.

What it does

- Saves conversations locally on scan/restore under `localStorage` key `chatbridge:conversations`.
- Extracts short topic tags for each saved conversation using the extension's AI backend and persists them as `conv.topics`.
- Indexes conversations into an on-device vector store (IndexedDB) for semantic search using embeddings.
- Provides a Smart Query UI:
  - Search: tries semantic (vector) search first, falls back to substring search.
  - Ask AI: combines top matches into context and asks the model for an answer using existing `callGeminiAsync` logic.
  - Index all saved chats: bulk-index existing saved conversations (requires an embeddings API key).

How embeddings work

- The background script will request embeddings using the OpenAI embeddings endpoint by calling `fetchEmbeddingOpenAI`.
- The OpenAI API key must be stored in extension storage under key: `chatbridge_api_key`.
  - Example (DevTools):

```javascript
chrome.storage.local.set({ chatbridge_api_key: 'sk-...YOUR_KEY...' }, () => console.log('saved'));
```

- After the key is set, use the Smart Query view > "📥 Index all saved chats" to compute embeddings and populate the IndexedDB vector store.

Storage & persistence

- Conversations remain stored in `localStorage` (fallback) under `chatbridge:conversations`.
- Vectors are stored in IndexedDB database `chatbridge_vectors_v1`, object store `vectors`.
- The vector store is persistent to the browser profile (no external databases).

Privacy note

- Embeddings require sending conversation text to the embedding provider (OpenAI). Don't index sensitive or private content unless you're comfortable sending it to the provider.

Developer notes

- The background exposes these messages:
  - `vector_index` — index a single conversation ({ id, text, metadata })
  - `vector_query` — query the vector store ({ query, topK }) → returns top results with scores
  - `vector_index_all` — bulk-index all saved conversations (no payload necessary)

- Smart Query falls back to substring matching if vector search is not available or returns no matches.

Next steps (optional)

- Replace OpenAI embeddings with a local model (if needed for privacy).
- Add a provider selector and embedders adapter (OpenAI, Cohere, local).
- Improve topic extraction sanitization and tagging UI (filters by tag/date/model).
