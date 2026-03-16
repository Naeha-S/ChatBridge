# Architecture Overview

## System Design

ChatBridge follows a Chrome Extension Manifest V3 architecture with clear separation of concerns.

### Components

```
┌───────────────────────────────────────────────────── ────┐
│                     Chrome Extension                     │
├───────────────────────────────────────────────────── ────┤
│  ┌──────────────┐         ┌──────────────┐               │
│  │   Popup UI   │         │  Options UI  │               │
│  │ (popup.html) │         │(options.html)│               │
│  └──────────────┘         └──────────────┘               │
│                                                          │
│  ┌─────────────────────────────────────────────────-┐    │
│  │          Content Script (content_script.js)      │    │
│  │  • UI Injection (Shadow DOM)                     │    │
│  │  • Message Scanning                              │    │
│  │  • Chat Restoration                              │    │
│  │  • Platform Adapters                             │    │
│  └────────────────────────────────────────────────-─┘    │
│                         ↕                                │
│              chrome.runtime.sendMessage                  │
│                         ↕                                │
│  ┌───────────────────────────────────────────────── ┐    │
│  │       Background Service Worker (background.js)  │    │
│  │  • API Calls (Gemini)                            │    │
│  │  • Rate Limiting                                 │    │
│  │  • Message Routing                               │    │
│  │  • Storage Management                            │    │
│  └───────────────────────────────────────────────── ┘    │
│                         ↕                                │
│                    External APIs                         │
│              (Google Generative AI)                      │
└───────────────────────────────────────────────────────── ┘
```

## Core Modules

### 1. Content Script (`content_script.js`)

**Responsibilities:**
- Inject UI into approved sites
- Scan conversations using adapters
- Normalize and filter messages
- Restore text to chat inputs
- Handle keyboard shortcuts

**Key Functions:**
- `injectUI()`: Create Shadow DOM interface
- `scanChat()`: Extract messages from page
- `normalizeMessages()`: Clean and dedupe
- `restoreToChat()`: Insert text into composer
- Platform detection and adapter selection

**Utilities:**
- `cbSleep(ms)`: Promise-based delay
- `cbWaitFor(predicate, opts)`: Polling with timeout
- `cbQS/cbQSA`: Safe DOM queries

**Supporting Modules:**
- `content/bootstrap.js`: Early injection guard, site approval, continue-with auto-insert bootstrap
- `utils/platformRegistry.js`: Shared platform metadata used by popup and content script
- `content/features/scan.js`: Scan orchestration and extraction pipeline
- `content/features/restore.js`: Restore flow, queued restores, drift repair loop
- `content/features/sidebar.js`: Sidebar open/close interactions and keyboard bindings
- `content/features/vault.js`: Image Vault UI rendering and interactions

### 2. Background Script (`background.js`)

**Responsibilities:**
- Handle API calls to Gemini
- Implement token-bucket rate limiting
- Route messages between tabs
- Manage keyboard commands
- Cache API responses

**Key Services:**
- `getGeminiApiKey()`: Cached API key retrieval
- `Config`: Storage-backed configuration
- `Logger`: Conditional debug logging
- `RateLimiter`: Token bucket implementation
- `createTokenBucket()`: Reusable rate limiter

**Message Handlers:**
- `call_gemini`: Summarize, rewrite, translate
- `call_gemma_rewrite`: Gemma-based rewriting via HuggingFace
- `rewrite_text`: Unified rewrite dispatcher
- `open_and_restore`: Continue With flow
- `self_test`: Built-in diagnostics

### 3. Adapters (`adapters.js`)

**Interface:**
```javascript
{
  detect(): boolean,
  getMessages(): Array<{role, text, el?, attachments?}>,
  getInput(): HTMLElement | null,
  scrollContainer(): HTMLElement | null,
  getFileInput(): HTMLElement | null
}
```

**Per-Platform Implementations:**
- ChatGPT / OpenAI
- Claude (Anthropic)
- Google Gemini
- Microsoft Copilot
- Perplexity
- Poe, Grok, DeepSeek, Mistral, Meta AI
- Generic fallback

### 4. Storage Layer (`storage.js`)

**Abstraction over:**
- `chrome.storage.local` (primary)
- `localStorage` (fallback)

**Operations:**
- `Storage.get(key)`
- `Storage.set(key, value)`
- `Storage.remove(key)`
- `Storage.clear()`

## Data Flow

### Scan Flow

```
User clicks "Scan"
  ↓
content_script.js detects platform
  ↓
Adapter.getMessages() extracts raw messages
  ↓
normalizeMessages() cleans and dedupes
  ↓
Store in chrome.storage.local
  ↓
Display in UI
```

### Transform Flow (Summarize/Rewrite/Translate)

```
User selects action + options
  ↓
content_script sends message to background
  ↓
background.js checks rate limit
  ↓
Retrieve API key from chrome.storage.local
  ↓
Call Gemini API
  ↓
Cache response (5 min TTL)
  ↓
Return to content_script
  ↓
Display result in UI
```

### Continue With Flow

```
User clicks "Insert to Chat" → selects target
  ↓
content_script sends open_and_restore to background
  ↓
background opens new tab with target URL
  ↓
Polls tab with restore_to_chat messages
  ↓
Target content_script receives message
  ↓
Waits for composer to render
  ↓
Inserts text, fires events
  ↓
Attempts file attachment if provided
  ↓
Responds success
```

## Design Patterns

### Observer Pattern
- `chrome.storage.onChanged` listeners update cached config/keys
- MutationObserver for DOM stability detection

### Strategy Pattern
- Per-platform adapters with common interface
- Adapter selection based on hostname

### Singleton Pattern
- Single background service worker
- Cached API key and config instances

### Factory Pattern
- `createTokenBucket(config)` for rate limiters

## Security Model

### Permissions
- `storage`: Local data persistence
- `activeTab`: Inject into active tab only

### Data Isolation
- Shadow DOM prevents CSS/JS conflicts
- Content scripts run in isolated world
- Background has no DOM access

### API Key Handling
1. User enters key in Options page
2. Stored in `chrome.storage.local` (encrypted by Chrome)
3. Retrieved by background script only
4. Never exposed to content scripts or page
5. Cached for 60s with auto-refresh on change

### Rate Limiting
- Token bucket algorithm (default: 1 req/sec, burst 5)
- Per-extension (not per-tab)
- Configurable via `chrome.storage.local`

## Message Passing

### Content → Background

```javascript
chrome.runtime.sendMessage(
  { type: 'call_gemini', payload: {...} },
  response => { /* handle */ }
)
```

### Background → Content

```javascript
chrome.tabs.sendMessage(
  tabId,
  { type: 'restore_to_chat', payload: {...} },
  response => { /* handle */ }
)
```

### Keyboard Commands

```
User presses Ctrl+Shift+S
  ↓
chrome.commands.onCommand fires in background
  ↓
Background forwards to active tab:
  { type: 'keyboard_command', command: 'quick-scan' }
  ↓
Content script handles command
```

## Local Analytics Event Schema (Phase 5.2)

ChatBridge uses opt-in, local-only analytics in `content_script.js` via `CBAnalytics.track(feature, action, meta)`.

### Scope
- Storage: `localStorage` key `chatbridge_analytics_v1`
- Opt-in gate: `chrome.storage.local` key `cb_analytics_optin`
- No external telemetry endpoint is used by this schema

### Canonical Event Shape

```javascript
{
  ts: number,                // epoch millis
  feature: string,           // namespace/surface
  action: string,            // canonical action key
  host: string,              // location.hostname
  meta: Record<string, any>  // optional diagnostics/context
}
```

### Canonical Naming Convention

- `feature`: one of
  - `quick_action`
  - `smart_workspace`
  - `scan`
  - `summarize`
  - `rewrite`
  - `sync_tone`
  - `translate`
- `action`: `<flow>_<stage>` or `<flow>_<stage>_<outcome>`
  - Preferred stages/outcomes:
    - `click`
    - `confirm_click`
    - `target_click`
    - `success`
    - `empty`
    - `error`
    - `failed`

### Phase 5.2 Normalization Rules

1. Keep `feature` stable as surface namespace (`quick_action` / `smart_workspace`).
2. Encode outcome in `action` suffix (`_success`, `_empty`, `_error`) when applicable.
3. Put variable detail in `meta` (target model, export format, counts), not in `action` where possible.
4. Preserve legacy action keys for backward compatibility; treat them as aliases to canonical outcomes.

### Legacy → Canonical Alias Mapping

| Feature | Legacy Action | Canonical Intent |
|---|---|---|
| `quick_action` | `clean_save_failed` | `clean_failed` |
| `quick_action` | `optimize_failed` | `optimize_failed` |
| `quick_action` | `copy_fallback_success` | `copy_success` (`meta.path='fallback'`) |
| `quick_action` | `export_json` / `export_markdown` / `export_text` / `export_csv` / `export_pdf` | `export_success` (`meta.format=...`) |
| `smart_workspace` | `extract_empty_no_conversation` / `extract_empty_no_items` | `extract_empty` (`meta.reason=...`) |
| `smart_workspace` | `carry_forward_target_click` | `carry_forward_target_click` |
| `smart_workspace` | `migration_kit_export_click` / `migration_kit_export_success` / `migration_kit_export_empty` / `migration_kit_export_error` | unchanged (already normalized lifecycle) |
| `smart_workspace` | `migration_kit_import_success` / `migration_kit_import_error` | unchanged (already normalized lifecycle) |

### Example Queries Against Counters

- Success rate per flow:
  - numerator: `*_success`
  - denominator: `*_click`
- Empty-state rate:
  - `*_empty` / `*_click`
- Error rate:
  - `*_error` or `*_failed` / `*_click`

## Extension Points

### Adding a New Platform

1. **Create adapter in `adapters.js`:**
   ```javascript
   {
     name: 'NewPlatform',
     detect: () => window.location.hostname.includes('new.ai'),
     getMessages: () => { /* extract logic */ },
     getInput: () => document.querySelector('textarea'),
     scrollContainer: () => document.querySelector('.chat'),
     getFileInput: () => document.querySelector('input[type=file]')
   }
   ```

2. **Add to manifest.json matches:**
   ```json
   "*://new.ai/*"
   ```

3. **Add to APPROVED_SITES in content_script.js:**
   ```javascript
   'new.ai'
   ```

### Adding a New Transform Action

1. **Add UI in content_script.js**
2. **Add handler in background.js:**
   ```javascript
   if (payload.action === 'newAction') {
     promptText = `Your prompt: ${payload.text}`;
   }
   ```

### Custom Rate Limit

```javascript
chrome.storage.local.set({
  chatbridge_config: {
    ratePerSec: 2,
    maxBurst: 10,
    debug: true
  }
})
```

## Performance Optimizations

- **Caching**: API responses (5 min), API key (60 sec), config (60 sec)
- **Lazy loading**: UI rendered only when avatar clicked
- **Debouncing**: DOM stability checks with timeout
- **Batch operations**: Chunked summarization for long texts
- **Shadow DOM**: Isolated styles prevent reflow

## Testing

### Manual Testing
- Load unpacked extension
- Test on each supported platform
- Verify scan, transform, restore flows

### Debug Hooks
```javascript
ChatBridge.enableDebug()
ChatBridge.getLastScan()
ChatBridge.highlightScan(true)
```

### Self-Tests
```javascript
// Background
chrome.runtime.sendMessage({ type: 'self_test' })

// Content script
chrome.runtime.sendMessage({ type: 'cs_self_test' })
```

## Future Architecture Improvements

- [ ] Move to ES modules (when MV3 fully supports)
- [ ] Split content_script.js into smaller modules
- [ ] Add formal state management (e.g., Redux-like)
- [ ] Implement pub/sub for cross-tab communication
- [ ] Add service worker persistence layer
