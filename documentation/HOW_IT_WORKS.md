# How ChatBridge Scans & Restores Chats: Technical Deep Dive

ChatBridge acts as a universal bridge between your browser's DOM and AI models. It doesn't use official APIs for chat platforms; instead, it reads the page like a human would and types into the input like a human would.

## 1. Scanning the Chat (`scanChat`)

The core scanning function uses platform-specific **adapters** to extract messages accurately.

### How it works:

1.  **Platform Detection**:
    `pickAdapter()` in `adapters.js` checks `location.hostname` against each adapter's `detect()` function.

2.  **Adapter Selection**:
    Each supported platform (ChatGPT, Claude, Gemini, Perplexity, Poe, etc.) has a dedicated adapter with tailored CSS selectors. If no platform matches, `AdapterGeneric` is used as fallback.

3.  **Message Extraction** (`adapter.getMessages()`):
    Each adapter queries platform-specific DOM elements:
    - **ChatGPT**: `[data-message-author-role]` attributes
    - **Claude**: `[data-testid="user-message"]`, `.standard-markdown`
    - **Gemini**: `<user-query>`, `<model-response>` custom elements
    - **Generic**: Heuristic container scoring (width, center proximity, message count)

4.  **Normalization** (`normalizeMessages()`):
    Raw messages are cleaned — deduplication, UI noise removal, role verification, and contiguous merge.

5.  **Storage**:
    Scanned conversations are saved via `saveConversation()` from `storage.js` into `chrome.storage.local`.

```javascript
// Simplified flow
const adapter = pickAdapter(); // from adapters.js
const raw = adapter.getMessages();
// Returns: [{ role: 'user'|'assistant', text: '...', el: HTMLElement }]

const final = normalizeMessages(raw);
saveConversation({ platform: adapter.id, conversation: final, url: location.href });
```

## 2. Restoring to Chat (`restoreToChat`)

Restoring means programmatically typing text into the chat input and optionally sending it. This is tricky because modern React/Vue apps don't detect simple `input.value` changes.

### How it works:

1.  **Finding the Input**:
    `adapter.getInput()` returns the chat composer (`<textarea>`, `[contenteditable]`, or specific element IDs like `#prompt-textarea`).

2.  **Waiting for Composer**:
    `restoreToChat` uses a polling utility (`cbWaitFor`) to wait until the input element renders — critical for "Continue With" flows where a new tab is opened.

3.  **Simulated Typing (React-safe)**:
    Simply setting `input.value = "text"` doesn't work on React apps. ChatBridge bypasses this by:
    - Setting the value via the native setter: `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, text)`
    - Dispatching `input`, `change`, and `keydown` events with `{ bubbles: true }`
    - For `contenteditable` elements: setting `innerHTML` or `textContent` directly

4.  **File Attachments**:
    If attachments are provided, `attachFilesToChat()` attempts to:
    - Find the site's `<input type="file">` via `adapter.getFileInput()`
    - Create `File` objects and set them via `DataTransfer`
    - Fall back to clipboard paste for the first image if direct upload fails

```javascript
async function restoreToChat(text, attachments) {
  const input = adapter.getInput();
  await cbWaitFor(() => input, { timeoutMs: 5000 });

  input.focus();
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype, 'value'
  ).set;
  setter.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
```

## 3. Continue With Flow

The "Continue With" feature lets users take a conversation from one platform and insert it into another:

1. **Content script** sends `{ type: 'open_and_restore', url, text }` to background
2. **Background** opens a new tab with the target URL
3. **Background** polls the new tab with `{ type: 'restore_to_chat' }` messages
4. **Target content script** receives the message, waits for the composer, and inserts text

## 4. Transform Pipeline

Summarize, Rewrite, Translate, and Sync Tone all follow the same pattern:

1. **Content script** sends `{ type: 'call_gemini', payload: { action, text, ... } }` to background
2. **Background** checks rate limits, retrieves the API key from storage
3. **Background** calls the Gemini API (or HuggingFace/OpenAI as fallback)
4. **Background** caches the response and returns it to content script
5. **Content script** displays the result in the sidebar UI

## Key Files

| File | Role |
|------|------|
| `content_script.js` | UI injection, scanning, restoring, keyboard handling |
| `adapters.js` | Platform-specific message extraction and input detection |
| `background.js` | API calls, rate limiting, caching, tab management |
| `storage.js` | Chrome storage abstraction |
| `utils/rewriter.js` | Code-block-safe rewriting utility |
| `security.js` | Input sanitization and sensitive data detection |
