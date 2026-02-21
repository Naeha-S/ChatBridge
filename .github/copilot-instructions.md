# ChatBridge – Copilot Instructions

Chrome Extension (Manifest V3) bridging AI conversations across ChatGPT, Claude, Gemini, Perplexity, Copilot, and 20+ platforms. No build step — load unpacked directly.

## Architecture

### Content script load chain (order matters — each depends on prior globals)
```
config.js → utils/constants.js → utils/rewriter.js → security.js → adapters.js →
storage.js → smartFeatures.js → SegmentEngine.js → IntentAnalyzer.js →
MemoryRetrieval.js → smartQueries.js → content_script.js
```
All files use IIFE + `'use strict'` and expose APIs on `window.*` — no ES module imports in content scripts. `content_script.js` loads **last** because it orchestrates everything.

### Core components
| File | Role | Key globals |
|------|------|-------------|
| `background.js` (~2820 lines) | Service worker: API calls (Gemini/Llama/OpenAI), message routing, Continue With flow, vector embeddings (IndexedDB) | 3 separate `onMessage` listeners handling 30+ message types |
| `content_script.js` (~20k lines) | Orchestrator: injection guard, Shadow DOM UI, scan/restore, keyboard routing | `window.ChatBridge`, `window.ChatBridgeHelpers` |
| `adapters.js` | 18 site-specific adapters + `AdapterGeneric` fallback | `window.SiteAdapters`, `window.AdapterGeneric` |
| `smartQueries.js` (~1700 lines) | Smart Queries panel: memory search, live AI Q&A, synthesis with self-contained CSS | `window.SmartQueryUI` |
| `SegmentEngine.js` → `IntentAnalyzer.js` → `MemoryRetrieval.js` | RAG pipeline: segment conversations → classify intent → hybrid retrieval | Dependency chain via `window.*` references |
| `smartFeatures.js` | SmartContextInjection, AISummaryEngine, UniversalClipboard, KnowledgeBase | 4 classes in one IIFE |
| `security.js` | AES-256-GCM encryption (Web Crypto), rate limiting, PII detection/redaction | `window.ChatBridgeSecurity` |

### Message passing patterns
- **Content → Background**: `chrome.runtime.sendMessage({ type, payload }, callback)` — always `return true` in async handlers to keep channel open.
- **Background → Content**: `chrome.tabs.sendMessage(tabId, { type, payload })`.
- **Keyboard shortcuts**: `background.js onCommand` → `{ type: 'keyboard_command', command }` → content script switches on `quick-scan` / `toggle-sidebar` / `insert-to-chat` / `insight-finder`.
- **Continue With flow**: `{ type: 'open_and_restore' }` → background creates tab → polls `restore_to_chat` every 500ms (max 30 attempts). The `restore_to_chat` listener is registered **before** `injectUI()` with a pending message queue — critical for fresh tab restore.
- **API response shape**: Always `{ ok: boolean, error?: string, message?: string }`.

### AI API routing (background.js)
- **Gemini**: Model failover chain `gemini-2.0-flash` → `gemini-2.5-flash` → `flash-lite` → `2.5-pro`. Dual rate limiting: sliding window (10/min, 100/hr) + token bucket via `limiterTry()`.
- **Llama**: HuggingFace router (`meta-llama/Llama-3.1-8B-Instruct:novita`), OpenAI-compatible format. `callLlama()` in smartQueries.js **never rejects** — resolves to `''` on error, shows toast instead.
- **Rewrite templates**: 12 named styles in `REWRITE_TEMPLATES` object in background.js (`normal`, `concise`, `direct`, `detailed`, `academic`, `humanized`, `creative`, `professional`, `simple`, `friendly`, `customStyle`, `project_summary`). Add new styles there.

## Naming conventions
- CSS classes: `cb-` prefix (content script UI), `sq-` prefix (Smart Queries)
- localStorage keys: `chatbridge:` prefix (e.g., `chatbridge:segments`)
- chrome.storage keys: `chatbridge_` prefix (e.g., `chatbridge_conversations_v1`)
- Console logs: `[ChatBridge]` prefix on all messages
- Window globals: `window.ChatBridge*` namespace (`ChatBridge`, `ChatBridgeHelpers`, `ChatBridgeRewriter`, `ChatBridgeSecurity`, `ChatBridgeConstants`)
- DOM exclusion: `data-cb-ignore="true"` marks extension elements to skip during scanning

## Theming & CSS
6 themes: `dark` (default), `light`, `synthwave`, `skeuomorphic`, `brutalism`, `glass` — applied via `:host(.cb-theme-*)` selectors. Brand palette: `--sq-accent: #00D4FF` (cyan), `--sq-accent2: #7C3AED` (purple). Shadow DOM uses `{ mode: 'open' }` with `:host { all: initial; }` reset. Overlays use `z-index: 2147483647`. smartQueries.js has fully self-contained `UI_STYLES` CSS embedded at top of file.

## Storage split
| Layer | What | Used by |
|-------|------|---------|
| `chrome.storage.local` | Conversations, config, theme, encrypted API keys | storage.js, options.js, popup.js, sidebar.js |
| `localStorage` | UI prefs (avatar side, query history, knowledge graph, segment cache) | content_script.js, smartFeatures.js — **per-origin** |
| `IndexedDB` | Vector embeddings for semantic search | background.js `idb*` functions |

## Critical gotchas
1. **Three copies of approved sites** — `manifest.json` matches, `content_script.js` APPROVED_SITES array (~25 entries), and `utils/constants.js` (~14 entries, shorter!). **Keep all three in sync** when adding a platform.
2. **Smart/curly quotes in source files** — `utils/rewriter.js` and some older code uses Unicode quotes (`'` `"` `"`). String replacements with straight ASCII quotes will fail. Always read the raw file first.
3. **Multiple `onMessage` listeners** in background.js (3 separate) — all receive all messages. Check placement when adding new types.
4. **Injection guard** — `window.__CHATBRIDGE_INJECTED` + APPROVED_SITES check at top of content_script.js. Never remove.
5. **Cloudflare fix** — Bootstrap defers to `window.load` event (not `DOMContentLoaded`) for Cloudflare challenge pages.
6. **`return true` is mandatory** in every async `onMessage` handler to keep the `sendResponse` channel open.
7. **Attachment fallback** — if fetch fails due to auth/CORS, falls back to clipboard for first image.
8. **Manifest shortcuts** — Chrome can't use Enter as chord key; current shortcuts: `Ctrl+Shift+S` (scan), `Ctrl+Shift+H` (sidebar), `Ctrl+Shift+I` (insert).

## Adding a new platform adapter
1. Add adapter object to `SiteAdapters` array in `adapters.js`: `{ id, label, detect(), getMessages(), getInput?(), scrollContainer?(), getFileInput?() }`.
2. `getMessages()` must return `[{ role: 'user'|'assistant', text, el? }]` — include `el` so `extractAttachmentsFromElement()` can derive attachments.
3. Add URL pattern to **all three** approved site lists (manifest matches, content_script APPROVED_SITES, utils/constants).
4. For restore: implement `getFileInput()` returning the site's `<input type=file>`. `restoreToChat` handles the rest via `waitForComposer`.

## Debugging
```js
ChatBridge.enableDebug()        // Verbose logging
ChatBridge.getLastScan()        // Inspect last scan result + errors array
ChatBridge.highlightScan(true)  // Visualize captured message nodes on page
ChatBridge.testE2E()            // End-to-end validation
// Also: ChatBridgeHelpers.debugLog, window.__CHATBRIDGE_DEBUG flag
```

## Developer workflow
1. `chrome://extensions` → Developer mode → Load unpacked → select repo folder (no build needed)
2. Navigate to any supported AI chat — ⚡ avatar appears on approved domains
3. Click ⚡ → Scan Chat → verify messages; test Summarize/Rewrite/Translate/Sync Tone
4. Sync Tone → Insert to Chat tests the Continue With cross-tab handoff
5. F12 console → `ChatBridge.enableDebug()` for verbose logs; errors in `ChatBridge._lastScan.errors`
