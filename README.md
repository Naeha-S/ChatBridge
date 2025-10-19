# ChatBridge

A Chrome extension that seamlessly bridges conversations across multiple AI chat platforms (Gemini, ChatGPT, Claude, and more).

## Features

- **Smart Message Extraction**: Precisely captures user and assistant messages from chat platforms
- **Cross-Platform Support**: Works with Gemini, ChatGPT, Claude, Perplexity, Poe, and more
- **Context Preservation**: Maintains conversation history when switching between platforms
- **UI Chrome Filtering**: Intelligently excludes buttons, suggestions, and system messages
- **Restore Conversations**: Paste and continue conversations in chat inputs

## Development

### Running Tests

Comprehensive regression tests ensure message scraping remains accurate:

```powershell
# Run all tests
npm run test:acceptance

# Run only adapter regression tests
npx playwright test tests/adapter-regression.spec.ts

# Run tests with UI
npx playwright test --ui
```

### Test Coverage

The test suite validates:

- **Gemini Adapter**: Extracts exactly 2 messages (user + assistant) from native `<user-query>` and `<model-response>` tags
- **ChatGPT Adapter**: Captures messages using `[data-message-author-role]` selectors
- **Claude Adapter**: Deep scans `<p>`, `.whitespace-pre-wrap`, `.break-words` nodes and merges assistant fragments
- **UI Chrome Filtering**: Excludes sidebar conversations, regenerate buttons, system messages, and footer text
- **Cross-Platform Consistency**: Ensures all adapters return the same message structure

### Architecture

```
ChatBridge/
├── adapters.js          # Site-specific adapters for each platform
├── content_script.js    # Main content script for UI and message scanning
├── background.js        # Service worker for API calls
├── storage.js           # Storage abstraction with fallbacks
├── popup.html/js        # Extension popup UI
├── options.html/js      # Settings page
└── tests/
    ├── acceptance.spec.ts           # End-to-end acceptance tests
    └── adapter-regression.spec.ts   # Adapter scraping regression tests
```

### Key Components

#### Adapters (`adapters.js`)

Each adapter provides:
- `detect()`: Returns true if the adapter matches the current site
- `getMessages()`: Extracts `{ role: 'user' | 'assistant', text: string }[]` from the page
- `getInput()`: Returns the chat input element for restore functionality
- `scrollContainer()`: Returns the scrollable chat container (optional)

#### Message Extraction Strategy

**Gemini**:
- Prefers native `<user-query>` and `<model-response>` tags
- Filters by main chat container width to exclude sidebars
- Deduplicates by first 100 characters of text
- Excludes UI chrome: "show thinking", "try:", "suggested", "regenerate", etc.

**ChatGPT**:
- Uses `[data-message-author-role="user|assistant"]` selectors
- Extracts text from `.markdown.prose` children
- Filters out system messages and short texts

**Claude**:
- Deep scans all `<p>`, `.whitespace-pre-wrap`, `.break-words` nodes
- First candidate is user, remaining are assistant
- Merges consecutive assistant fragments into single message
- Cleans user message text (removes "N\n", "User:", extra whitespace)
- Filters: "Please continue the conversation", "Claude can make mistakes", etc.

### Debugging

All adapters log detailed debug output to the browser console:

```javascript
// Gemini
[Gemini Debug] Found: { userQueries: 1, modelResponses: 1 }
[Gemini Debug] Using native tags, total containers: 2
[Gemini Debug] After filtering: 2 containers
[Gemini Debug] FINAL RESULT: 2 messages

// ChatGPT
[ChatGPT Debug] Wrappers found: 2
[ChatGPT Debug] Wrapper 0: USER role=user text="Hello"
[ChatGPT Debug] Wrapper 1: ASSISTANT role=assistant text="Hi there!"

// Claude
[Claude Debug] Container found: DIV root
[Claude Debug] Candidate message nodes found: 2
[Claude Debug] Message 0: role=user text="What is TypeScript"
[Claude Debug] Message 1: role=assistant text="TypeScript is a strongly typed..."
```

### Adding a New Adapter

1. Add a new adapter object to `SiteAdapters` array in `adapters.js`:

```javascript
{
  id: "myplatform",
  label: "My Platform",
  detect: () => location.hostname.includes("myplatform.com"),
  scrollContainer: () => document.querySelector('.chat-container'),
  getMessages: () => {
    // Extract messages from the page
    const nodes = Array.from(document.querySelectorAll('.message'));
    return nodes.map(n => ({
      role: n.classList.contains('user') ? 'user' : 'assistant',
      text: n.innerText.trim()
    }));
  },
  getInput: () => document.querySelector('textarea')
}
```

2. Add regression tests in `tests/adapter-regression.spec.ts`
3. Test manually on the target platform
4. Run the test suite to ensure no regressions

## Installation

### Development Mode

1. Clone the repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the ChatBridge directory
5. The extension icon should appear in your toolbar

### Production Build

(Future: Add build/packaging steps here)

## Privacy

See [PRIVACY.md](PRIVACY.md) for details on data handling and API key storage.

## License

(Add license information here)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite: `npm run test:acceptance`
6. Submit a pull request

## Troubleshooting

### Extension shows "Extension context invalidated"

This happens when the extension is reloaded. The storage fallback system will automatically use `localStorage` until the next page refresh.

### Messages not being captured correctly

1. Open browser DevTools (F12)
2. Navigate to the Console tab
3. Click "Scan Chat" button
4. Look for `[Platform Debug]` logs showing exactly what's being extracted
5. File an issue with the console output

### Restore not working in chat input

Some platforms use React-controlled inputs. The extension dispatches both `input` and `change` events, and manually focuses/blurs the input to trigger React's reconciliation.

## Roadmap

- [ ] Add support for more platforms (Anthropic Console, Cohere, etc.)
- [ ] Improve message deduplication logic
- [ ] Add conversation export/import
- [ ] Implement conversation branching visualization
- [ ] Add keyboard shortcuts
- [ ] Support for multi-turn conversation editing

---

**Note**: This extension requires API keys for AI platforms. Keys are stored locally in Chrome's secure storage and never transmitted to third parties.
