# How ChatBridge Scans & Restores Chats: Technical Deep Dive

ChatBridge acts as a universal bridge between your browser's DOM (what you see) and AI models. It doesn't use official APIs for the chat platforms (like ChatGPT or Gemini); instead, it "reads" the page like a human would and "types" into the box like a human would.

## 1. Scanning the Chat (`getConversationText`)

The core function for "reading" is `getConversationText`. It works by detecting which platform you are on and then selecting the specific HTML elements that contain the message text.

### How it works technically:

1.  **Platform Detection**:
    The code checks `window.location.hostname` to determine if you are on ChatGPT, Claude, Gemini, etc.

2.  **Selector Strategy**:
    It uses a list of known CSS selectors for each platform. These selectors point to the bubbling "speech bubbles" or text containers.
    *   *Code Reference*: `content_script.js`, function `getConversationText` (around line ~6200).

3.  **Extraction Loop**:
    It loops through all found elements (`document.querySelectorAll(selector)`).
    *   It extracts `.innerText` or `.textContent`.
    *   It cleans the text (removes "Copy" buttons, timestamps, or "Regenerate" labels that might be inside the text block).
    *   It identifies the **Role** (User vs. AI). This is often done by checking class names (e.g., `.user-message` vs `.assistant-message`) or by position (alternating messages).

4.  **Fallback (The "Universal" Scanner)**:
    If it's a site it doesn't know, it tries a generic "article reader" approach, looking for large blocks of text that appear sequentially.

```javascript
// Simplified logic from content_script.js
function getConversationText() {
  if (isChatGPT) {
    // Select all conversation turns
    const turns = document.querySelectorAll('[data-message-author-role]'); 
    return Array.from(turns).map(turn => {
       const role = turn.getAttribute('data-message-author-role');
       const text = turn.innerText;
       return `${role.toUpperCase()}: ${text}`;
    }).join('\n\n');
  }
  // ... other platforms
}
```

## 2. Restoring to Chat (`restoreToChat`)

"Restoring" means programmatically typing text into the chat input box and (optionally) pressing Enter. This is trickier than it sounds because modern React/Vue apps don't detect simple value changes.

### How it works technically:

1.  **Finding the Input Box**:
    It looks for `<textarea>`, `contenteditable` divs, or specific inputs by ID (like `#prompt-textarea`).
    *   *Code Reference*: `content_script.js`, function `restoreToChat` (search for `function restoreToChat`).

2.  **Simulated Typing (The "React Hack")**:
    Simply setting `input.value = "text"` doesn't work on sites like ChatGPT because React keeps an internal state. ChatBridge bypasses this by:
    *   Setting the value.
    *   Dispatching an `input` event.
    *   Dispatching a `change` event.
    *   Sometimes explicitly modifying the prototype (e.g., `nativeTextAreaValueSetter.call(input, text)`) to trigger React's internal listeners.

3.  **Submitting**:
    If the `autoSubmit` flag is true, it finds the "Send" button (often via `aria-label="Send message"` or an SVG icon) and programmatically clicks it.

```javascript
// Simplified logic from content_script.js
async function restoreToChat(text, attachments) {
  const input = document.querySelector('textarea'); 
  
  // 1. Focus
  input.focus();
  
  // 2. Set Value (React-safe way)
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
  nativeInputValueSetter.call(input, text);
  
  // 3. Trigger Events
  input.dispatchEvent(new Event('input', { bubbles: true }));
  
  // 4. Click Send (optional)
  const sendBtn = document.querySelector('button[aria-label="Send"]');
  sendBtn.click();
}
```

## 3. The "Smart" Layer (Agent Hub)

When you use the Extractor or Synthesizer, it combines these two:
1.  **READ**: Calls `getConversationText()` to get the last ~3000 chars.
2.  **THINK**: Sends that text to a background LLM (Llama 3.1) with a prompt like "Extract tasks from this text...".
3.  **WRITE**: Takes the LLM's response and displays it in the sidebar, or calls `restoreToChat()` to paste it back into the main chat.

## Key Files to Check

*   **`content_script.js`**:
    *   `getConversationText()`: The eyes (scanning).
    *   `restoreToChat()`: The hands (typing).
    *   `showActionExtractor()` / `showEchoSynth()`: The brain (UI logic).

*   **`adapters.js`** (if used):
    *   Often contains platform-specific selectors standardizing how we find elements on ChatGPT vs. Claude.
