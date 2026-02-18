# API Reference

## Public API (Content Script)

The content script exposes a small API via `window.ChatBridge` and `window.ChatBridgeHelpers` for debugging and advanced usage.

### ChatBridge Global

#### `ChatBridge.enableDebug()`
Enable verbose console logging.

```javascript
ChatBridge.enableDebug()
```

#### `ChatBridge.getLastScan()`
Returns details about the most recent scan.

```javascript
const scan = ChatBridge.getLastScan()
console.log(scan)
// {
//   messages: [...],
//   platform: 'chatgpt',
//   timestamp: 1234567890,
//   errors: [...]
// }
```

#### `ChatBridge.highlightScan(enable: boolean)`
Visually highlights scanned message elements on the page.

```javascript
ChatBridge.highlightScan(true)  // Add highlights
ChatBridge.highlightScan(false) // Remove highlights
```

### ChatBridgeHelpers.utils

#### `sleep(ms: number): Promise<void>`
Promise-based delay.

```javascript
await ChatBridgeHelpers.utils.sleep(1000) // Wait 1 second
```

#### `waitFor(predicate: () => any, options): Promise<any>`
Poll until predicate returns truthy or timeout.

```javascript
const element = await ChatBridgeHelpers.utils.waitFor(
  () => document.querySelector('.composer'),
  { timeoutMs: 5000, intervalMs: 100 }
)
```

**Options:**
- `timeoutMs`: Max wait time (default: 8000)
- `intervalMs`: Check interval (default: 100)

#### `qs(root: Element, selector: string): Element | null`
Safe querySelector.

```javascript
const el = ChatBridgeHelpers.utils.qs(document, '.my-class')
```

#### `qsa(root: Element, selector: string): Element[]`
Safe querySelectorAll (returns array).

```javascript
const elements = ChatBridgeHelpers.utils.qsa(document, '.message')
```

### ChatBridgeHelpers (Legacy)

#### `filterCandidateNodes(nodes: Node[]): Node[]`
Filter DOM nodes to remove UI elements and noise.

#### `isInExtension(element: Element): boolean`
Check if element is part of ChatBridge UI.

#### `debugLog(...args)`
Conditional debug logging (respects debug mode).

#### `normalizeChatMessages(messages, maxMessages): Message[]`
Clean and deduplicate message array.

## Background API (Message Passing)

Send messages from content scripts or popup to background service worker.

### Call Gemini API

```javascript
chrome.runtime.sendMessage(
  {
    type: 'call_gemini',
    payload: {
      action: 'summarize',
      text: 'Your conversation text...',
      length: 'detailed',
      summaryType: 'bullet'
    }
  },
  response => {
    if (response.ok) {
      console.log(response.result)
    } else {
      console.error(response.error, response.message)
    }
  }
)
```

**Payload Options:**
- `action`: 'summarize' | 'rewrite' | 'translate' | 'syncTone' | 'prompt'
- `text`: Input text (required)
- `length`: 'short' | 'medium' | 'detailed' | 'comprehensive'
- `summaryType`: 'paragraph' | 'bullet' | 'executive' | 'technical' | 'transfer'
- `rewriteStyle`: 'normal' | 'concise' | 'direct' | 'detailed' | 'academic'
- `targetLang`: Language code (e.g., 'es', 'fr', 'ja')
- `targetModel`: Target AI model for syncTone
- `sourceModel`: Source AI model for syncTone

**Response:**
```javascript
{
  ok: boolean,
  result?: string,
  error?: string,
  message?: string
}
```

### Save Conversation

```javascript
chrome.runtime.sendMessage(
  {
    type: 'save_conversation',
    payload: {
      platform: 'chatgpt',
      url: window.location.href,
      conversation: [
        { role: 'user', text: 'Hello' },
        { role: 'assistant', text: 'Hi there!' }
      ],
      topics: ['greeting'],
      ts: Date.now()
    }
  },
  response => {
    console.log(response.ok ? 'Saved' : 'Failed')
  }
)
```

### Get Conversations

```javascript
chrome.runtime.sendMessage(
  {
    type: 'get_conversations',
    payload: {
      limit: 10,
      offset: 0
    }
  },
  response => {
    if (response.ok) {
      console.log(response.conversations)
      console.log('Total:', response.total)
    }
  }
)
```

### Clear Conversations

```javascript
chrome.runtime.sendMessage(
  { type: 'clear_conversations' },
  response => console.log('Cleared:', response.ok)
)
```

### Continue With (Open and Restore)

```javascript
chrome.runtime.sendMessage(
  {
    type: 'open_and_restore',
    payload: {
      url: 'https://claude.ai',
      text: 'Text to restore...',
      attachments: []
    }
  },
  response => {
    console.log(response.ok ? 'Restored' : 'Failed')
  }
)
```

### Self-Test

```javascript
chrome.runtime.sendMessage(
  { type: 'self_test' },
  response => {
    console.log('All tests passed:', response.ok)
    console.log('Details:', response.details)
  }
)
```

## Configuration

### Get Config

```javascript
chrome.storage.local.get(['chatbridge_config'], data => {
  const config = data.chatbridge_config || {}
  console.log('Rate:', config.ratePerSec)
  console.log('Burst:', config.maxBurst)
  console.log('Debug:', config.debug)
})
```

### Set Config

```javascript
chrome.storage.local.set({
  chatbridge_config: {
    ratePerSec: 2,      // Requests per second
    maxBurst: 10,       // Burst capacity
    debug: true         // Enable debug logs
  }
}, () => {
  console.log('Config updated')
})
```

### Get API Key

```javascript
chrome.storage.local.get(['chatbridge_gemini_key'], data => {
  console.log('Key set:', !!data.chatbridge_gemini_key)
})
```

### Set API Key

```javascript
chrome.storage.local.set({
  chatbridge_gemini_key: 'AIza...'
}, () => {
  console.log('Key saved')
})
```

## Storage Schema

### Conversations

```javascript
{
  id: string,                    // Unique ID
  ts: number,                    // Timestamp
  platform: string,              // 'chatgpt', 'claude', etc.
  url: string,                   // Source URL
  conversation: Array<{
    role: 'user' | 'assistant',
    text: string,
    attachments?: Array<{
      kind: 'image' | 'video' | 'doc',
      url: string,
      title?: string
    }>
  }>,
  topics?: string[],             // Extracted topics
  metadata?: object              // Additional data
}
```

## Error Codes

| Code | Meaning |
|------|---------|
| `no_api_key` | API key not configured |
| `rate_limited` | Too many requests |
| `no_text` | Empty input text |
| `gemini_http_error` | HTTP error from Gemini API |
| `gemini_parse_error` | Failed to parse API response |
| `gemini_fetch_error` | Network error calling API |
| `restore_timeout` | Restore took too long |
| `tab_not_found` | Target tab closed |

## Events

### Storage Change Events

Listen for config/key changes:

```javascript
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.chatbridge_config) {
      console.log('Config changed:', changes.chatbridge_config.newValue)
    }
    if (changes.chatbridge_gemini_key) {
      console.log('API key changed')
    }
  }
})
```

## Rate Limiting

Default limits:
- 1 request per second
- Burst capacity: 5 requests
- Applied per extension (not per tab)

Customize:
```javascript
chrome.storage.local.set({
  chatbridge_config: {
    ratePerSec: 5,    // 5 req/sec
    maxBurst: 20      // Burst of 20
  }
})
```

## Examples

### Complete Scan and Transform Flow

```javascript
// 1. Enable debug mode
ChatBridge.enableDebug()

// 2. Trigger scan programmatically
// (Usually done via UI, but can be scripted)
const scan = await scanChat() // Internal function

// 3. Get scan results
const lastScan = ChatBridge.getLastScan()
console.log('Captured', lastScan.messages.length, 'messages')

// 4. Summarize
chrome.runtime.sendMessage(
  {
    type: 'call_gemini',
    payload: {
      action: 'summarize',
      text: lastScan.messages.map(m => `${m.role}: ${m.text}`).join('\n'),
      length: 'detailed',
      summaryType: 'bullet'
    }
  },
  response => {
    if (response.ok) {
      console.log('Summary:', response.result)
    }
  }
)
```

### Custom Adapter for Testing

```javascript
// Test adapter detection
const adapters = SiteAdapters // From adapters.js
const detected = adapters.find(a => a.detect())
console.log('Detected adapter:', detected ? detected.name : 'Generic')

// Manually test message extraction
if (detected) {
  const messages = detected.getMessages()
  console.log('Found', messages.length, 'messages')
  console.log('First:', messages[0])
}
```
