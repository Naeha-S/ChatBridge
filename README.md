# ⚡ ChatBridge# ChatBridge



> **Seamlessly continue AI conversations across multiple platforms with intelligent transformation and enhancement tools**A Chrome extension that seamlessly bridges conversations across multiple AI chat platforms (Gemini, ChatGPT, Claude, and more).



ChatBridge is a powerful Chrome extension that bridges conversations between different AI chat platforms (ChatGPT, Claude, Gemini, Perplexity, and more), while providing built-in AI-powered tools to summarize, rewrite, translate, and optimize your chats.## Features



---- **Smart Message Extraction**: Precisely captures user and assistant messages from chat platforms

- **Cross-Platform Support**: Works with Gemini, ChatGPT, Claude, Perplexity, Poe, and more

## 🎯 Project Aim- **Context Preservation**: Maintains conversation history when switching between platforms

- **UI Chrome Filtering**: Intelligently excludes buttons, suggestions, and system messages

Break down the silos between AI platforms and empower users to:- **Restore Conversations**: Paste and continue conversations in chat inputs

- **Switch platforms freely** without losing conversation context

- **Transform conversations** to match the communication style of different AI models## Development

- **Enhance productivity** with intelligent summarization, translation, and rewriting

- **Maintain privacy** with local-first processing and secure API key storage### Running Tests



---Comprehensive regression tests ensure message scraping remains accurate:



## 🔍 Problem Statement```powershell

# Run all tests

### The Challengenpm run test:acceptance



As AI assistants proliferate, users face several key problems:# Run only adapter regression tests

npx playwright test tests/adapter-regression.spec.ts

1. **Context Loss**: Starting fresh conversations on a new platform means losing valuable context and history

2. **Platform Lock-in**: Conversations become trapped in a single platform's ecosystem# Run tests with UI

3. **Manual Copying**: Time-consuming manual copy-paste between platforms with formatting issuesnpx playwright test --ui

4. **Model-Specific Language**: Each AI has different "communication styles" that work better with specific prompting approaches```

5. **Information Overload**: Long conversations become difficult to reference and share

6. **Language Barriers**: Multilingual users need to translate conversations across platforms### Test Coverage



### The SolutionThe test suite validates:



ChatBridge provides a unified interface to:- **Gemini Adapter**: Extracts exactly 2 messages (user + assistant) from native `<user-query>` and `<model-response>` tags

- **Intelligently scan** conversations from any supported AI platform- **ChatGPT Adapter**: Captures messages using `[data-message-author-role]` selectors

- **Preserve context** when moving between platforms- **Claude Adapter**: Deep scans `<p>`, `.whitespace-pre-wrap`, `.break-words` nodes and merges assistant fragments

- **Transform content** with AI-powered tools (summarize, rewrite, translate)- **UI Chrome Filtering**: Excludes sidebar conversations, regenerate buttons, system messages, and footer text

- **Optimize prompts** for specific AI models with tone synchronization- **Cross-Platform Consistency**: Ensures all adapters return the same message structure

- **Restore conversations** seamlessly into any platform's chat interface

### Architecture

---

```

## ✨ Key FeaturesChatBridge/

├── adapters.js          # Site-specific adapters for each platform

### 🌐 Universal Platform Support├── content_script.js    # Main content script for UI and message scanning

├── background.js        # Service worker for API calls

Works seamlessly across major AI platforms:├── storage.js           # Storage abstraction with fallbacks

- **ChatGPT** (chat.openai.com, chatgpt.com)├── popup.html/js        # Extension popup UI

- **Claude** (claude.ai)├── options.html/js      # Settings page

- **Google Gemini** (gemini.google.com)└── tests/

- **Perplexity AI** (perplexity.ai)    ├── acceptance.spec.ts           # End-to-end acceptance tests

- **Poe** (poe.com)    └── adapter-regression.spec.ts   # Adapter scraping regression tests

- **Microsoft Copilot** (copilot.microsoft.com)```

- **Grok (X.AI)** (x.ai)

- **DeepSeek** (deepseek.ai)### Key Components

- **Mistral** (chat.mistral.ai)

- **Meta AI** (meta.ai)#### Adapters (`adapters.js`)



### 🧠 Smart Message ExtractionEach adapter provides:

- `detect()`: Returns true if the adapter matches the current site

- Adapter-based architecture with platform-specific extraction logic- `getMessages()`: Extracts `{ role: 'user' | 'assistant', text: string }[]` from the page

- Intelligent filtering to exclude UI elements, buttons, and system messages- `getInput()`: Returns the chat input element for restore functionality

- Deduplication of repeated messages- `scrollContainer()`: Returns the scrollable chat container (optional)

- Role detection (user vs. assistant messages)

- Container width filtering to exclude sidebar conversations#### Message Extraction Strategy



### 🎚️ Sync Tone (Prompt Engineering)**Gemini**:

- Prefers native `<user-query>` and `<model-response>` tags

Transform conversations for optimal performance on different AI models:- Filters by main chat container width to exclude sidebars

- Rewrites prompts to match target model's communication style- Deduplicates by first 100 characters of text

- Optimizes context framing for specific AI platforms- Excludes UI chrome: "show thinking", "try:", "suggested", "regenerate", etc.

- Preserves factual content while adapting tone and structure

- Supports: Claude, ChatGPT, Gemini, OpenAI, Llama, and more**ChatGPT**:

- Uses `[data-message-author-role="user|assistant"]` selectors

### 📝 AI-Powered Summarization- Extracts text from `.markdown.prose` children

- Filters out system messages and short texts

Intelligent hierarchical summarization for long conversations:

- **Length options**: Short, Medium, Long, Comprehensive**Claude**:

- **Format styles**: - Deep scans all `<p>`, `.whitespace-pre-wrap`, `.break-words` nodes

  - Paragraph (coherent narrative)- First candidate is user, remaining are assistant

  - Bullet Points (key takeaways)- Merges consecutive assistant fragments into single message

  - Executive Summary (high-level decisions)- Cleans user message text (removes "N\n", "User:", extra whitespace)

  - Technical Summary (specs & implementation)- Filters: "Please continue the conversation", "Claude can make mistakes", etc.

  - Detailed Summary (comprehensive coverage)

- **Smart chunking**: Breaks large conversations into manageable pieces### Debugging

- **Parallel processing**: Summarizes chunks concurrently for speed

- **Intelligent merging**: Combines chunk summaries into coherent outputAll adapters log detailed debug output to the browser console:

- **Retry/fallback logic**: Ensures reliability even with API hiccups

```javascript

### ✍️ Intelligent Rewriting// Gemini

[Gemini Debug] Found: { userQueries: 1, modelResponses: 1 }

Enhance conversation quality with style-specific rewriting:[Gemini Debug] Using native tags, total containers: 2

- **Normal**: Clearer, more professional phrasing[Gemini Debug] After filtering: 2 containers

- **Concise**: Removes fluff, keeps essentials[Gemini Debug] FINAL RESULT: 2 messages

- **Direct**: Assertive, active voice, straightforward

- **Detailed**: Adds context, clarity, and elaboration// ChatGPT

- **Academic**: Formal tone with scholarly language[ChatGPT Debug] Wrappers found: 2

[ChatGPT Debug] Wrapper 0: USER role=user text="Hello"

### 🌍 Multi-Language Translation[ChatGPT Debug] Wrapper 1: ASSISTANT role=assistant text="Hi there!"



Break language barriers with 20+ supported languages:// Claude

- English, Spanish, French, German, Italian, Portuguese[Claude Debug] Container found: DIV root

- Chinese (Simplified & Traditional), Japanese, Korean[Claude Debug] Candidate message nodes found: 2

- Arabic, Russian, Hindi, Tamil, Vietnamese, Thai[Claude Debug] Message 0: role=user text="What is TypeScript"

- Polish, Turkish, Indonesian, Dutch, Swedish, Norwegian, Danish[Claude Debug] Message 1: role=assistant text="TypeScript is a strongly typed..."

- Output-only translation (no explanations or extra text)```



### 💾 Conversation Management### Adding a New Adapter



- Save and organize multiple conversation histories1. Add a new adapter object to `SiteAdapters` array in `adapters.js`:

- Quick preview of saved conversations

- Dropdown selector for easy access```javascript

- Local storage with Chrome sync support{

- Export conversations to clipboard  id: "myplatform",

  label: "My Platform",

### 🔒 Privacy & Security  detect: () => location.hostname.includes("myplatform.com"),

  scrollContainer: () => document.querySelector('.chat-container'),

- **Local-first**: Conversations stored locally in your browser  getMessages: () => {

- **Secure API keys**: Stored in Chrome's encrypted storage    // Extract messages from the page

- **No third-party tracking**: Your data never leaves your control    const nodes = Array.from(document.querySelectorAll('.message'));

- **Open source**: Full transparency of data handling    return nodes.map(n => ({

      role: n.classList.contains('user') ? 'user' : 'assistant',

---      text: n.innerText.trim()

    }));

## 🏗️ Tech Stack  },

  getInput: () => document.querySelector('textarea')

### Frontend}

- **Vanilla JavaScript** - No framework dependencies, pure performance```

- **Shadow DOM** - Isolated UI preventing conflicts with host pages

- **CSS3** - Custom dark theme with gold accents2. Add regression tests in `tests/adapter-regression.spec.ts`

- **Web Extensions API** - Chrome Extension Manifest V33. Test manually on the target platform

4. Run the test suite to ensure no regressions

### Backend/Processing

- **Google Gemini API** - AI processing for summarization, translation, rewriting## Installation

- **Hierarchical Processing** - Smart chunking and parallel processing for large texts

- **Retry/Fallback Logic** - Robust error handling with exponential backoff### Development Mode



### Storage1. Clone the repository

- **Chrome Storage API** - Secure, synced storage across devices2. Open Chrome and navigate to `chrome://extensions/`

- **LocalStorage Fallback** - Graceful degradation when extension context unavailable3. Enable "Developer mode"

4. Click "Load unpacked" and select the ChatBridge directory

### Testing5. The extension icon should appear in your toolbar

- **Playwright** - End-to-end testing framework

- **TypeScript** - Type-safe test definitions### Production Build

- **Regression Tests** - Platform-specific adapter validation

(Future: Add build/packaging steps here)

### Architecture Patterns

- **Adapter Pattern** - Pluggable platform-specific extractors## Privacy

- **Observer Pattern** - Event-driven communication between components

- **Strategy Pattern** - Configurable processing strategies (summarize styles, rewrite modes)See [PRIVACY.md](PRIVACY.md) for details on data handling and API key storage.

- **Singleton Pattern** - Shared state management and storage abstraction

## License

---

(Add license information here)

## 🚀 Installation & Setup

## Contributing

### Quick Start (Chrome)

1. Fork the repository

1. **Clone the repository**2. Create a feature branch

   ```bash3. Make your changes

   git clone https://github.com/Naeha-S/ChatBridge.git4. Add tests for new functionality

   cd ChatBridge5. Run the test suite: `npm run test:acceptance`

   ```6. Submit a pull request



2. **Load extension in Chrome**## Troubleshooting

   - Open Chrome and navigate to `chrome://extensions/`

   - Enable **Developer mode** (toggle in top-right corner)### Extension shows "Extension context invalidated"

   - Click **"Load unpacked"**

   - Select the `ChatBridge` directoryThis happens when the extension is reloaded. The storage fallback system will automatically use `localStorage` until the next page refresh.

   - The ChatBridge icon (⚡) should appear in your toolbar

### Messages not being captured correctly

3. **Pin the extension** (optional but recommended)

   - Click the puzzle icon in Chrome toolbar1. Open browser DevTools (F12)

   - Find "ChatBridge" and click the pin icon2. Navigate to the Console tab

   - The ⚡ icon will now be visible for quick access3. Click "Scan Chat" button

4. Look for `[Platform Debug]` logs showing exactly what's being extracted

4. **Start using**5. File an issue with the console output

   - Navigate to any supported AI chat platform

   - Click the ⚡ floating button (bottom-right corner)### Restore not working in chat input

   - Click **"📸 Scan Chat"** to capture the conversation

   - Use the AI tools (Sync Tone, Summarize, Rewrite, Translate)Some platforms use React-controlled inputs. The extension dispatches both `input` and `change` events, and manually focuses/blurs the input to trigger React's reconciliation.

   - Click **"♻️ Restore"** to paste into another platform's chat

## Roadmap

### API Key Setup (Optional)

- [ ] Add support for more platforms (Anthropic Console, Cohere, etc.)

ChatBridge uses Google Gemini API for AI features. A default key is included for testing, but you can add your own:- [ ] Improve message deduplication logic

- [ ] Add conversation export/import

1. Get a free Gemini API key at [Google AI Studio](https://makersuite.google.com/app/apikey)- [ ] Implement conversation branching visualization

2. Click the ChatBridge extension icon- [ ] Add keyboard shortcuts

3. Click **"Settings"** (or right-click extension → Options)- [ ] Support for multi-turn conversation editing

4. Paste your API key and save

---

---

**Note**: This extension requires API keys for AI platforms. Keys are stored locally in Chrome's secure storage and never transmitted to third parties.

## 📖 How to Use

### Basic Workflow

1. **Scan a Conversation**
   - Open any AI chat (ChatGPT, Claude, Gemini, etc.)
   - Click the ⚡ button (bottom-right)
   - Click **"📸 Scan Chat"**
   - The sidebar shows your captured conversation

2. **Transform with AI Tools**
   
   **🎚️ Sync Tone** - Optimize for another AI model:
   - Select target model (Claude, ChatGPT, Gemini, etc.)
   - Click **"🎚️ Sync Tone"**
   - Wait for transformation (shows progress)
   - Click **"Insert to Chat"** to paste optimized version

   **📝 Summarize** - Condense long chats:
   - Choose length (short/medium/long/comprehensive)
   - Select style (paragraph/bullet/executive/technical)
   - Click **"📝 Summarize"**
   - See progress indicator as chunks are processed
   - Click **"Insert to Chat"** when complete

   **✍️ Rewrite** - Improve clarity and tone:
   - Select style (normal/concise/direct/detailed/academic)
   - Click **"✍️ Rewrite"**
   - Review rewritten version
   - Click **"Insert to Chat"**

   **🌐 Translate** - Convert to another language:
   - Select target language (20+ options)
   - Click **"🌐 Translate"**
   - Get clean translation (no extra explanations)
   - Click **"Insert to Chat"**

3. **Restore to Another Platform**
   - Navigate to a different AI platform
   - Open the ChatBridge sidebar (⚡ button)
   - Select a saved conversation from dropdown
   - Click **"♻️ Restore"**
   - Conversation is automatically pasted into the chat input
   - Press Enter to start chatting!

### Pro Tips

- **Progress Indicators**: Watch the animated dots (. . .) for real-time processing status
- **Chunking**: Long conversations are automatically split and processed in parallel
- **History**: Recent scans are saved automatically in the dropdown
- **Clipboard**: Use **"📋 Clipboard"** to copy raw conversation text
- **Multiple Saves**: Switch between multiple saved conversations via dropdown

---

## 🔧 Development

### Prerequisites

- Node.js 18+ and npm
- Chrome browser
- Basic understanding of Chrome Extensions

### Setup Development Environment

```bash
# Install dependencies
npm install

# Install Playwright browsers
npm run pw:install
```

### Project Structure

```
ChatBridge/
├── manifest.json              # Extension manifest (V3)
├── content_script.js          # Main UI and logic (1200+ lines)
├── background.js              # Service worker for API calls
├── adapters.js                # Platform-specific message extractors
├── storage.js                 # Storage abstraction layer
├── popup.html/js              # Extension popup interface
├── options.html/js            # Settings/options page
├── styles.css                 # Global styles
├── icons/                     # Extension icons
├── tests/
│   ├── acceptance.spec.ts               # E2E tests
│   └── adapter-regression.spec.ts       # Adapter validation
├── playwright.config.ts       # Test configuration
└── package.json               # Dependencies and scripts
```

### Key Files Explained

**`adapters.js`** - Platform detection and message extraction
- Each adapter implements: `detect()`, `getMessages()`, `getInput()`, `scrollContainer()`
- Handles platform-specific DOM structures and quirks

**`content_script.js`** - Core extension logic
- Shadow DOM UI rendering
- Conversation scanning orchestration
- AI processing functions (hierarchical chunking, parallel processing)
- Event handlers for all UI buttons
- Message restoration logic

**`background.js`** - Background service worker
- Gemini API integration
- Rate limiting (token bucket algorithm)
- Retry/backoff logic for API calls
- Secure API key handling

**`storage.js`** - Storage abstraction
- Chrome Storage API wrapper
- LocalStorage fallback
- Graceful error handling

## 🎁 Benefits

### For Users
- ✅ **Freedom**: Switch AI platforms without losing context
- ✅ **Productivity**: Summarize, translate, enhance conversations in seconds
- ✅ **Privacy**: Your data stays local and secure
- ✅ **Efficiency**: Parallel processing makes bulk operations fast
- ✅ **Flexibility**: 20+ languages, multiple formats, customizable styles

### For Developers
- ✅ **Open Source**: Learn from clean, well-documented code
- ✅ **Extensible**: Easy adapter pattern for new platforms
- ✅ **Tested**: Comprehensive test suite ensures reliability
- ✅ **Modern**: Manifest V3, Shadow DOM, async/await patterns

### For Organizations
- ✅ **Cost Effective**: Maximize value from multiple AI subscriptions
- ✅ **Vendor Independence**: Avoid lock-in to single platform
- ✅ **Knowledge Management**: Preserve and organize AI conversations
- ✅ **Multilingual Support**: Global team collaboration

---

## 🛠️ Troubleshooting

### Extension not visible
- Ensure Developer mode is enabled in `chrome://extensions/`
- Check that extension is loaded and toggle is ON
- Reload the extension or restart Chrome

### Scan Chat returns empty
- Check browser console (F12) for `[Debug]` logs
- Some platforms need page fully loaded - wait and retry
- Ensure you're on a supported platform (see list above)

### Restore not working
- Some platforms use React/Vue inputs requiring special events
- Try clicking in the input field before clicking Restore
- Check console for errors

### API rate limiting
- Default: 1 request/sec with burst of 5
- Wait a few seconds between operations
- Use your own Gemini API key for higher limits

### Extension context invalidated
- Happens when extension is reloaded during use
- Storage automatically falls back to localStorage
- Reload the page to restore full functionality

---

## 🗺️ Roadmap

### Planned Features
- [ ] Export conversations to Markdown/JSON
- [ ] Conversation branching and merge tools
- [ ] Custom prompt templates
- [ ] Keyboard shortcuts for quick access
- [ ] Batch processing multiple conversations
- [ ] Conversation search and filtering
- [ ] Support for more AI platforms (Cohere, Anthropic Console, etc.)
- [ ] Conversation analytics and insights
- [ ] Team/shared conversation spaces

---

## 👤 Author

**Naeha S**
- GitHub: [@Naeha-S](https://github.com/Naeha-S)

---


**⚡ Built with passion to break down barriers between AI platforms**
