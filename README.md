# ⚡ ChatBridge# ⚡ ChatBridge



> **Seamlessly continue AI conversations across multiple platforms with intelligent transformation and enhancement tools**

> **Seamlessly continue AI conversations across multiple platforms with intelligent transformation and enhancement tools**A Chrome extension that seamlessly bridges conversations across multiple AI chat platforms (Gemini, ChatGPT, Claude, and more).

ChatBridge is a powerful Chrome extension that bridges conversations between different AI chat platforms (ChatGPT, Claude, Gemini, Perplexity, and more), while providing built-in AI-powered tools to summarize, rewrite, translate, and optimize your chats.



---

ChatBridge is a Chrome extension that bridges conversations between AI chat platforms like ChatGPT, Claude, Gemini, Perplexity, and more. It captures your chats, transforms them intelligently (summarize, rewrite, translate, sync tone), and restores them across platforms — all locally and securely.

## 🎯 Project Aim

**Features:**

Break down the silos between AI platforms and empower users to:

- **Switch platforms freely** without losing conversation context---- **Smart Message Extraction**: Precisely captures user and assistant messages from chat platforms

- **Transform conversations** to match the communication style of different AI models

- **Enhance productivity** with intelligent summarization, translation, and rewriting- **Cross-Platform Support**: Works with Gemini, ChatGPT, Claude, Perplexity, Poe, and more

- **Maintain privacy** with local-first processing and secure API key storage

## 🎯 Project Aim- **Context Preservation**: Maintains conversation history when switching between platforms

---

- **UI Chrome Filtering**: Intelligently excludes buttons, suggestions, and system messages

## 🔍 Problem Statement

Break down the silos between AI platforms and empower users to:- **Restore Conversations**: Paste and continue conversations in chat inputs

### The Challenge

- **Switch platforms freely** without losing conversation context

As AI assistants proliferate, users face several key problems:

- **Transform conversations** to match the communication style of different AI models## Development

1. **Context Loss**: Starting fresh conversations on a new platform means losing valuable context and history

2. **Platform Lock-in**: Conversations become trapped in a single platform's ecosystem- **Enhance productivity** with intelligent summarization, translation, and rewriting

3. **Manual Copying**: Time-consuming manual copy-paste between platforms with formatting issues

4. **Model-Specific Language**: Each AI has different "communication styles" that work better with specific prompting approaches- **Maintain privacy** with local-first processing and secure API key storage### Running Tests

5. **Information Overload**: Long conversations become difficult to reference and share

6. **Language Barriers**: Multilingual users need to translate conversations across platforms



### The Solution---Comprehensive regression tests ensure message scraping remains accurate:



ChatBridge provides a unified interface to:

- **Intelligently scan** conversations from any supported AI platform

- **Preserve context** when moving between platforms## 🔍 Problem Statement:

- **Transform content** with AI-powered tools (summarize, rewrite, translate)

- **Optimize prompts** for specific AI models with tone synchronizationAs AI assistants proliferate, users face several key problems:# Run only adapter regression tests

- **Restore conversations** seamlessly into any platform's chat interface

npx playwright test tests/adapter-regression.spec.ts

---

1. **Context Loss**: Starting fresh conversations on a new platform means losing valuable context and history

## ✨ Key Features

2. **Platform Lock-in**: Conversations become trapped in a single platform's ecosystem# Run tests with UI

### 🌐 Universal Platform Support

3. **Manual Copying**: Time-consuming manual copy-paste between platforms with formatting issuesnpx playwright test --ui

Works seamlessly across major AI platforms:

- **ChatGPT** (chat.openai.com, chatgpt.com)4. **Model-Specific Language**: Each AI has different "communication styles" that work better with specific prompting approaches```

- **Claude** (claude.ai)

- **Google Gemini** (gemini.google.com)5. **Information Overload**: Long conversations become difficult to reference and share

- **Perplexity AI** (perplexity.ai)

- **Poe** (poe.com)6. **Language Barriers**: Multilingual users need to translate conversations across platforms### Test Coverage

- **Microsoft Copilot** (copilot.microsoft.com)   

- **Grok (X.AI)** (x.ai)

- **DeepSeek** (deepseek.ai)### Architecture

- **Mistral** (chat.mistral.ai)

- **Meta AI** (meta.ai)---



### 🧠 Smart Message Extraction```



- Adapter-based architecture with platform-specific extraction logic## ✨ Key FeaturesChatBridge/

- Intelligent filtering to exclude UI elements, buttons, and system messages

- Deduplication of repeated messages├── adapters.js          # Site-specific adapters for each platform

- Role detection (user vs. assistant messages)

- Container width filtering to exclude sidebar conversations### 🌐 Universal Platform Support├── content_script.js    # Main content script for UI and message scanning



### 🎚️ Sync Tone (Prompt Engineering)├── background.js        # Service worker for API calls



Transform conversations for optimal performance on different AI models:Works seamlessly across major AI platforms:├── storage.js           # Storage abstraction with fallbacks

- Rewrites prompts to match target model's communication style

- Optimizes context framing for specific AI platforms- **ChatGPT** (chat.openai.com, chatgpt.com)├── popup.html/js        # Extension popup UI

- Preserves factual content while adapting tone and structure

- Supports: Claude, ChatGPT, Gemini, OpenAI, Llama, and more- **Claude** (claude.ai)├── options.html/js      # Settings page



### 📝 AI-Powered Summarization- **Google Gemini** (gemini.google.com)└── tests/



Intelligent hierarchical summarization for long conversations:- **Perplexity AI** (perplexity.ai)    ├── acceptance.spec.ts           # End-to-end acceptance tests

- **Length options**: Short, Medium, Long, Comprehensive

- **Format styles**: - **Poe** (poe.com)    └── adapter-regression.spec.ts   # Adapter scraping regression tests

  - Paragraph (coherent narrative)

  - Bullet Points (key takeaways)- **Microsoft Copilot** (copilot.microsoft.com)```

  - Executive Summary (high-level decisions)

  - Technical Summary (specs & implementation)- **Grok (X.AI)** (x.ai)

  - Detailed Summary (comprehensive coverage)

- **Smart chunking**: Breaks large conversations into manageable pieces- **DeepSeek** (deepseek.ai)### Key Components

- **Parallel processing**: Summarizes chunks concurrently for speed

- **Intelligent merging**: Combines chunk summaries into coherent output- **Mistral** (chat.mistral.ai)

- **Retry/fallback logic**: Ensures reliability even with API hiccups

- **Meta AI** (meta.ai)#### Adapters (`adapters.js`)

### ✍️ Intelligent Rewriting



Enhance conversation quality with style-specific rewriting:

- **Normal**: Clearer, more professional phrasing### 🧠 Smart Message ExtractionEach adapter provides:

- **Concise**: Removes fluff, keeps essentials

- **Direct**: Assertive, active voice, straightforward- `detect()`: Returns true if the adapter matches the current site

- **Detailed**: Adds context, clarity, and elaboration

- **Academic**: Formal tone with scholarly language- Adapter-based architecture with platform-specific extraction logic- `getMessages()`: Extracts `{ role: 'user' | 'assistant', text: string }[]` from the page



### 🌍 Multi-Language Translation- Intelligent filtering to exclude UI elements, buttons, and system messages- `getInput()`: Returns the chat input element for restore functionality



Break language barriers with 20+ supported languages:- Deduplication of repeated messages- `scrollContainer()`: Returns the scrollable chat container (optional)

- English, Spanish, French, German, Italian, Portuguese

- Chinese (Simplified & Traditional), Japanese, Korean- Role detection (user vs. assistant messages)

- Arabic, Russian, Hindi, Tamil, Vietnamese, Thai

- Polish, Turkish, Indonesian, Dutch, Swedish, Norwegian, Danish- Container width filtering to exclude sidebar conversations#### Message Extraction Strategy

- Output-only translation (no explanations or extra text)



### 💾 Conversation Management

### 🎚️ Sync Tone (Prompt Engineering)**Gemini**:

- Save and organize multiple conversation histories

- Quick preview of saved conversations- Prefers native `<user-query>` and `<model-response>` tags

- Dropdown selector for easy access

- Local storage with Chrome sync supportTransform conversations for optimal performance on different AI models:- Filters by main chat container width to exclude sidebars

- Export conversations to clipboard

- Rewrites prompts to match target model's communication style- Deduplicates by first 100 characters of text

### 🔒 Privacy & Security

- Optimizes context framing for specific AI platforms- Excludes UI chrome: "show thinking", "try:", "suggested", "regenerate", etc.

- **Local-first**: Conversations stored locally in your browser

- **Secure API keys**: Stored in Chrome's encrypted storage- Preserves factual content while adapting tone and structure

- **No third-party tracking**: Your data never leaves your control

- **Open source**: Full transparency of data handling- Supports: Claude, ChatGPT, Gemini, OpenAI, Llama, and more**ChatGPT**:



---- Uses `[data-message-author-role="user|assistant"]` selectors



## 🏗️ Tech Stack### 📝 AI-Powered Summarization- Extracts text from `.markdown.prose` children



### Frontend- Filters out system messages and short texts

- **Vanilla JavaScript** - No framework dependencies, pure performance

- **Shadow DOM** - Isolated UI preventing conflicts with host pagesIntelligent hierarchical summarization for long conversations:

- **CSS3** - Custom dark theme with gold accents

- **Web Extensions API** - Chrome Extension Manifest V3- **Length options**: Short, Medium, Long, Comprehensive**Claude**:



### Backend/Processing- **Format styles**: - Deep scans all `<p>`, `.whitespace-pre-wrap`, `.break-words` nodes

- **Google Gemini API** - AI processing for summarization, translation, rewriting

- **Hierarchical Processing** - Smart chunking and parallel processing for large texts  - Paragraph (coherent narrative)- First candidate is user, remaining are assistant

- **Retry/Fallback Logic** - Robust error handling with exponential backoff

  - Bullet Points (key takeaways)- Merges consecutive assistant fragments into single message

### Storage

- **Chrome Storage API** - Secure, synced storage across devices  - Executive Summary (high-level decisions)- Cleans user message text (removes "N\n", "User:", extra whitespace)

- **LocalStorage Fallback** - Graceful degradation when extension context unavailable

  - Technical Summary (specs & implementation)- Filters: "Please continue the conversation", "Claude can make mistakes", etc.

### Architecture Patterns

- **Adapter Pattern** - Pluggable platform-specific extractors  - Detailed Summary (comprehensive coverage)

- **Observer Pattern** - Event-driven communication between components

- **Strategy Pattern** - Configurable processing strategies (summarize styles, rewrite modes)- **Smart chunking**: Breaks large conversations into manageable pieces### Debugging

- **Singleton Pattern** - Shared state management and storage abstraction

- **Parallel processing**: Summarizes chunks concurrently for speed

---

- **Intelligent merging**: Combines chunk summaries into coherent outputAll adapters log detailed debug output to the browser console:

## 🚀 Installation & Setup

- **Retry/fallback logic**: Ensures reliability even with API hiccups

### Quick Start (Chrome)

```javascript

1. **Clone the repository**

   ```bash### ✍️ Intelligent Rewriting// Gemini

   git clone https://github.com/Naeha-S/ChatBridge.git

   cd ChatBridge[Gemini Debug] Found: { userQueries: 1, modelResponses: 1 }

   ```

Enhance conversation quality with style-specific rewriting:[Gemini Debug] Using native tags, total containers: 2

2. **Load extension in Chrome**

   - Open Chrome and navigate to `chrome://extensions/`- **Normal**: Clearer, more professional phrasing[Gemini Debug] After filtering: 2 containers

   - Enable **Developer mode** (toggle in top-right corner)

   - Click **"Load unpacked"**- **Concise**: Removes fluff, keeps essentials[Gemini Debug] FINAL RESULT: 2 messages

   - Select the `ChatBridge` directory

   - The ChatBridge icon (⚡) should appear in your toolbar- **Direct**: Assertive, active voice, straightforward



3. **Pin the extension** (optional but recommended)- **Detailed**: Adds context, clarity, and elaboration// ChatGPT

   - Click the puzzle icon in Chrome toolbar

   - Find "ChatBridge" and click the pin icon- **Academic**: Formal tone with scholarly language[ChatGPT Debug] Wrappers found: 2

   - The ⚡ icon will now be visible for quick access

[ChatGPT Debug] Wrapper 0: USER role=user text="Hello"

4. **Start using**

   - Navigate to any supported AI chat platform### 🌍 Multi-Language Translation[ChatGPT Debug] Wrapper 1: ASSISTANT role=assistant text="Hi there!"

   - Click the ⚡ floating button (bottom-right corner)

   - Click **"📸 Scan Chat"** to capture the conversation

   - Use the AI tools (Sync Tone, Summarize, Rewrite, Translate)

   - Click **"♻️ Restore"** to paste into another platform's chatBreak language barriers with 20+ supported languages:// Claude



### API Key Setup (Optional)- English, Spanish, French, German, Italian, Portuguese[Claude Debug] Container found: DIV root



ChatBridge uses Google Gemini API for AI features. A default key is included for testing, but you can add your own:- Chinese (Simplified & Traditional), Japanese, Korean[Claude Debug] Candidate message nodes found: 2



1. Get a free Gemini API key at [Google AI Studio](https://makersuite.google.com/app/apikey)- Arabic, Russian, Hindi, Tamil, Vietnamese, Thai[Claude Debug] Message 0: role=user text="What is TypeScript"

2. Click the ChatBridge extension icon

3. Click **"Settings"** (or right-click extension → Options)- Polish, Turkish, Indonesian, Dutch, Swedish, Norwegian, Danish[Claude Debug] Message 1: role=assistant text="TypeScript is a strongly typed..."

4. Paste your API key and save

- Output-only translation (no explanations or extra text)```

---



## 📖 How to Use

### 💾 Conversation Management### Adding a New Adapter

### Basic Workflow



1. **Scan a Conversation**

   - Open any AI chat (ChatGPT, Claude, Gemini, etc.)- Save and organize multiple conversation histories1. Add a new adapter object to `SiteAdapters` array in `adapters.js`:

   - Click the ⚡ button (bottom-right)

   - Click **"📸 Scan Chat"**- Quick preview of saved conversations

   - The sidebar shows your captured conversation

- Dropdown selector for easy access```javascript

2. **Transform with AI Tools**

   - Local storage with Chrome sync support{

   **🎚️ Sync Tone** - Optimize for another AI model:

   - Select target model (Claude, ChatGPT, Gemini, etc.)

   - Click **"🎚️ Sync Tone"**## 🏗️ Tech Stack  },

   - Wait for transformation (shows progress)

   - Click **"Insert to Chat"** to paste optimized version  getInput: () => document.querySelector('textarea')



   **📝 Summarize** - Condense long chats:### Frontend}

   - Choose length (short/medium/long/comprehensive)

   - Select style (paragraph/bullet/executive/technical)- **Vanilla JavaScript** - No framework dependencies, pure performance```

   - Click **"📝 Summarize"**

   - See progress indicator as chunks are processed- **Shadow DOM** - Isolated UI preventing conflicts with host pages

   - Click **"Insert to Chat"** when complete

- **CSS3** - Custom dark theme with gold accents2. Add regression tests in `tests/adapter-regression.spec.ts`

   **✍️ Rewrite** - Improve clarity and tone:

   - Select style (normal/concise/direct/detailed/academic)- **Web Extensions API** - Chrome Extension Manifest V33. Test manually on the target platform

   - Click **"✍️ Rewrite"**

   - Review rewritten version4. Run the test suite to ensure no regressions

   - Click **"Insert to Chat"**

### Backend/Processing

   **🌐 Translate** - Convert to another language:

   - Select target language (20+ options)- **Google Gemini API** - AI processing for summarization, translation, rewriting## Installation

   - Click **"🌐 Translate"**

   - Get clean translation (no extra explanations)- **Hierarchical Processing** - Smart chunking and parallel processing for large texts

   - Click **"Insert to Chat"**

- **Retry/Fallback Logic** - Robust error handling with exponential backoff### Development Mode

3. **Restore to Another Platform**

   - Navigate to a different AI platform

   - Open the ChatBridge sidebar (⚡ button)

   - Select a saved conversation from dropdown### Storage1. Clone the repository

   - Click **"♻️ Restore"**

   - Conversation is automatically pasted into the chat input- **Chrome Storage API** - Secure, synced storage across devices2. Open Chrome and navigate to `chrome://extensions/`

   - Press Enter to start chatting!

- **LocalStorage Fallback** - Graceful degradation when extension context unavailable3. Enable "Developer mode"

### Pro Tips

4. Click "Load unpacked" and select the ChatBridge directory

- **Progress Indicators**: Watch the animated dots (. . .) for real-time processing status

- **Chunking**: Long conversations are automatically split and processed in parallel### Testing5. The extension icon should appear in your toolbar

- **History**: Recent scans are saved automatically in the dropdown

- **Clipboard**: Use **"📋 Clipboard"** to copy raw conversation text- **Playwright** - End-to-end testing framework

- **Multiple Saves**: Switch between multiple saved conversations via dropdown

- **TypeScript** - Type-safe test definitions### Production Build

---

- **Regression Tests** - Platform-specific adapter validation

## 🔧 Project Structure

(Future: Add build/packaging steps here)

```

ChatBridge/### Architecture Patterns

├── manifest.json              # Extension manifest (V3)

├── content_script.js          # Main UI and logic (1200+ lines)- **Adapter Pattern** - Pluggable platform-specific extractors## Privacy

├── background.js              # Service worker for API calls

├── adapters.js                # Platform-specific message extractors- **Observer Pattern** - Event-driven communication between components

├── storage.js                 # Storage abstraction layer

├── popup.html/js              # Extension popup interface- **Strategy Pattern** - Configurable processing strategies (summarize styles, rewrite modes)See [PRIVACY.md](PRIVACY.md) for details on data handling and API key storage.

├── options.html/js            # Settings/options page

├── styles.css                 # Global styles- **Singleton Pattern** - Shared state management and storage abstraction

└── icons/                     # Extension icons

```## 🚀 Installation & Setup



### Key Files Explained1. Fork the repository



**`adapters.js`** - Platform detection and message extraction1. **Clone the repository**2. Create a feature branch

- Each adapter implements: `detect()`, `getMessages()`, `getInput()`, `scrollContainer()`

- Handles platform-specific DOM structures and quirks   ```bash3. Make your changes



**`content_script.js`** - Core extension logic   git clone https://github.com/Naeha-S/ChatBridge.git4. Add tests for new functionality

- Shadow DOM UI rendering

- Conversation scanning orchestration   cd ChatBridge5. Run the test suite: `npm run test:acceptance`

- AI processing functions (hierarchical chunking, parallel processing)

- Event handlers for all UI buttons   ```6. Submit a pull request

- Message restoration logic



**`background.js`** - Background service worker

- Gemini API integration2. **Load extension in Chrome**## Troubleshooting

- Rate limiting (token bucket algorithm)

- Retry/backoff logic for API calls   - Open Chrome and navigate to `chrome://extensions/`

- Secure API key handling

   - Enable **Developer mode** (toggle in top-right corner)### Extension shows "Extension context invalidated"

**`storage.js`** - Storage abstraction

- Chrome Storage API wrapper   - Click **"Load unpacked"**

- LocalStorage fallback

- Graceful error handling   - Select the `ChatBridge` directoryThis happens when the extension is reloaded. The storage fallback system will automatically use `localStorage` until the next page refresh.



---   - The ChatBridge icon (⚡) should appear in your toolbar



## 🎁 Benefits### Messages not being captured correctly



### For Users3. **Pin the extension** (optional but recommended)

- ✅ **Freedom**: Switch AI platforms without losing context

- ✅ **Productivity**: Summarize, translate, enhance conversations in seconds   - Click the puzzle icon in Chrome toolbar1. Open browser DevTools (F12)

- ✅ **Privacy**: Your data stays local and secure

- ✅ **Efficiency**: Parallel processing makes bulk operations fast   - Find "ChatBridge" and click the pin icon2. Navigate to the Console tab

- ✅ **Flexibility**: 20+ languages, multiple formats, customizable styles

   - The ⚡ icon will now be visible for quick access3. Click "Scan Chat" button

### For Developers

- ✅ **Open Source**: Learn from clean, well-documented code4. Look for `[Platform Debug]` logs showing exactly what's being extracted

- ✅ **Extensible**: Easy adapter pattern for new platforms

- ✅ **Modern**: Manifest V3, Shadow DOM, async/await patterns4. **Start using**5. File an issue with the console output



### For Organizations   - Navigate to any supported AI chat platform

- ✅ **Cost Effective**: Maximize value from multiple AI subscriptions

- ✅ **Vendor Independence**: Avoid lock-in to single platform   - Click the ⚡ floating button (bottom-right corner)### Restore not working in chat input

- ✅ **Knowledge Management**: Preserve and organize AI conversations

- ✅ **Multilingual Support**: Global team collaboration   - Click **"📸 Scan Chat"** to capture the conversation



---   - Use the AI tools (Sync Tone, Summarize, Rewrite, Translate)Some platforms use React-controlled inputs. The extension dispatches both `input` and `change` events, and manually focuses/blurs the input to trigger React's reconciliation.



## 🛠️ Troubleshooting   - Click **"♻️ Restore"** to paste into another platform's chat



### Extension not visible## Roadmap

- Ensure Developer mode is enabled in `chrome://extensions/`

- Check that extension is loaded and toggle is ON### API Key Setup (Optional)

- Reload the extension or restart Chrome

- [ ] Add support for more platforms (Anthropic Console, Cohere, etc.)

### Scan Chat returns empty

- Check browser console (F12) for debug logsChatBridge uses Google Gemini API for AI features. A default key is included for testing, but you can add your own:- [ ] Improve message deduplication logic

- Some platforms need page fully loaded - wait and retry

- Ensure you're on a supported platform (see list above)- [ ] Add conversation export/import



### Restore not working1. Get a free Gemini API key at [Google AI Studio](https://makersuite.google.com/app/apikey)- [ ] Implement conversation branching visualization

- Some platforms use React/Vue inputs requiring special events

- Try clicking in the input field before clicking Restore2. Click the ChatBridge extension icon- [ ] Add keyboard shortcuts

- Check console for errors

3. Click **"Settings"** (or right-click extension → Options)- [ ] Support for multi-turn conversation editing

### API rate limiting

- Default: 1 request/sec with burst of 54. Paste your API key and save

- Wait a few seconds between operations

- Use your own Gemini API key for higher limits---



### Extension context invalidated---

- Happens when extension is reloaded during use

- Storage automatically falls back to localStorage**Note**: This extension requires API keys for AI platforms. Keys are stored locally in Chrome's secure storage and never transmitted to third parties.

- Reload the page to restore full functionality

## 📖 How to Use

---

### Basic Workflow

## 🗺️ Roadmap

1. **Scan a Conversation**

### Planned Features   - Open any AI chat (ChatGPT, Claude, Gemini, etc.)

- [ ] Export conversations to Markdown/JSON   - Click the ⚡ button (bottom-right)

- [ ] Conversation branching and merge tools   - Click **"📸 Scan Chat"**

- [ ] Custom prompt templates   - The sidebar shows your captured conversation

- [ ] Keyboard shortcuts for quick access

- [ ] Batch processing multiple conversations2. **Transform with AI Tools**

- [ ] Conversation search and filtering   

- [ ] Support for more AI platforms (Cohere, Anthropic Console, etc.)   **🎚️ Sync Tone** - Optimize for another AI model:

- [ ] Conversation analytics and insights   - Select target model (Claude, ChatGPT, Gemini, etc.)

- [ ] Team/shared conversation spaces   - Click **"🎚️ Sync Tone"**

   - Wait for transformation (shows progress)

---   - Click **"Insert to Chat"** to paste optimized version



## 📄 License   **📝 Summarize** - Condense long chats:

   - Choose length (short/medium/long/comprehensive)

MIT License - See LICENSE file for details   - Select style (paragraph/bullet/executive/technical)

   - Click **"📝 Summarize"**

---   - See progress indicator as chunks are processed

   - Click **"Insert to Chat"** when complete

## 🤝 Contributing

   **✍️ Rewrite** - Improve clarity and tone:

Contributions welcome! Please:   - Select style (normal/concise/direct/detailed/academic)

   - Click **"✍️ Rewrite"**

1. Fork the repository   - Review rewritten version

2. Create a feature branch (`git checkout -b feature/amazing-feature`)   - Click **"Insert to Chat"**

3. Make your changes with clear commit messages

4. Submit a pull request   **🌐 Translate** - Convert to another language:

   - Select target language (20+ options)

---   - Click **"🌐 Translate"**

   - Get clean translation (no extra explanations)

## 👤 Author   - Click **"Insert to Chat"**



**Naeha S**3. **Restore to Another Platform**

- GitHub: [@Naeha-S](https://github.com/Naeha-S)   - Navigate to a different AI platform

   - Open the ChatBridge sidebar (⚡ button)

---   - Select a saved conversation from dropdown

   - Click **"♻️ Restore"**

## 📞 Support   - Conversation is automatically pasted into the chat input

   - Press Enter to start chatting!

- **Issues**: [GitHub Issues](https://github.com/Naeha-S/ChatBridge/issues)

- **Discussions**: [GitHub Discussions](https://github.com/Naeha-S/ChatBridge/discussions)### Pro Tips

- **Privacy**: See [PRIVACY.md](PRIVACY.md)

- **Progress Indicators**: Watch the animated dots (. . .) for real-time processing status

---- **Chunking**: Long conversations are automatically split and processed in parallel

- **History**: Recent scans are saved automatically in the dropdown

## 🙏 Acknowledgments- **Clipboard**: Use **"📋 Clipboard"** to copy raw conversation text

- **Multiple Saves**: Switch between multiple saved conversations via dropdown

- Google Gemini API for AI processing

- Chrome Extensions team for excellent documentation---

- All AI platforms for their amazing products

## 🔧 Development

---

### Prerequisites

**⚡ Built with passion to break down barriers between AI platforms**

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

## 👤 Author

**Naeha S**
- GitHub: [@Naeha-S](https://github.com/Naeha-S)

---


**⚡ Built with passion to break down barriers between AI platforms**
