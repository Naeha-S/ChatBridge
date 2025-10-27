# ⚡ ChatBridge# ⚡ ChatBridge ⚡



> **Seamlessly bridge AI conversations across multiple platforms with intelligent transformation and your personal knowledge graph**

> **Seamlessly continue AI conversations across multiple platforms with intelligent transformation and enhancement tools**

A Chrome extension that captures, transforms, and continues conversations across ChatGPT, Claude, Gemini, Copilot, Perplexity, and more — with built-in AI-powered tools and a visual knowledge graph that connects your insights.

**Seamlessly continue AI conversations across multiple platforms with intelligent transformation and enhancement tools**A Chrome extension that seamlessly bridges conversations across multiple AI chat platforms (Gemini, ChatGPT, Claude, and more).

---

ChatBridge is a powerful Chrome extension that bridges conversations between different AI chat platforms (ChatGPT, Claude, Gemini, Perplexity, and more), while providing built-in AI-powered tools to summarize, rewrite, translate, and optimize your chats.

## 🎯 Project Aim

---

Break down the silos between AI platforms and empower users to:

ChatBridge is a Chrome extension that bridges conversations between AI chat platforms like ChatGPT, Claude, Gemini, Perplexity, and more. It captures your chats, transforms them intelligently (summarize, rewrite, translate, sync tone), and restores them across platforms — all locally and securely.

- **Switch platforms freely** without losing conversation context

- **Transform conversations** to match the communication style of different AI models## 🎯 Project Aim

- **Build a second brain** with automatic knowledge extraction and cross-context memory

- **Visualize connections** with an interactive force-directed knowledge graph**Features:**

- **Enhance productivity** with intelligent summarization, translation, and rewriting

- **Maintain privacy** with local-first processing and secure API key storageBreak down the silos between AI platforms and empower users to:



---- **Switch platforms freely** without losing conversation context

- **Smart Message Extraction**: Precisely captures user and assistant messages from chat platforms

## 🔍 Problem Statement- **Transform conversations** to match the communication style of different AI models

- **Enhance productivity** with intelligent summarization, translation, and rewriting

### The Challenge- **Cross-Platform Support**: Works with Gemini, ChatGPT, Claude, Perplexity, Poe, and more

- **Maintain privacy** with local-first processing and secure API key storage

As AI assistants proliferate, users face several key problems:

## 🎯 Project Aim- **Context Preservation**: Maintains conversation history when switching between platforms

1. **Context Loss**: Starting fresh conversations on a new platform means losing valuable context

2. **Platform Lock-in**: Conversations become trapped in a single platform's ecosystem---

3. **Manual Copying**: Time-consuming copy-paste between platforms with formatting issues- **UI Chrome Filtering**: Intelligently excludes buttons, suggestions, and system messages

4. **Model-Specific Language**: Each AI has different "styles" that work better with specific prompts

5. **Information Overload**: Long conversations become difficult to reference and share## 🔍 Problem Statement

6. **Lost Insights**: Valuable knowledge from past conversations is forgotten or buried

Break down the silos between AI platforms and empower users to:- **Restore Conversations**: Paste and continue conversations in chat inputs

### The Solution

### The Challenge

ChatBridge provides a unified interface to:

- **Switch platforms freely** without losing conversation context

- **Intelligently scan** conversations from any supported AI platform

- **Preserve context** when moving between platformsAs AI assistants proliferate, users face several key problems:

- **Transform content** with AI-powered tools (summarize, rewrite, translate, sync tone)

- **Extract knowledge** automatically from every conversation- **Transform conversations** to match the communication style of different AI models## Development

- **Visualize connections** with an interactive knowledge graph

- **Detect contradictions** when new insights conflict with past conclusions1. **Context Loss**: Starting fresh conversations on a new platform means losing valuable context and history

- **Discover patterns** through multi-hop connection analysis2. **Platform Lock-in**: Conversations become trapped in a single platform's ecosystem

- **Restore conversations** seamlessly into any platform's chat interface3. **Enhance productivity** with intelligent summarization, translation, and rewriting

4. **Manual Copying**: Time-consuming manual copy-paste between platforms with formatting issues

---5. **Model-Specific Language**: Each AI has different "communication styles" that work better with specific prompting approaches

6.  **Maintain privacy** with local-first processing and secure API key storage### Running Tests

## ✨ Key Features7. **Information Overload**: Long conversations become difficult to reference and share

8. **Language Barriers**: Multilingual users need to translate conversations across platforms

### 🧠 Smart Message Extraction

- Adapter-based architecture with platform-specific extraction logic

- Intelligent filtering to exclude UI elements, buttons, and system messages### The Solution---Comprehensive regression tests ensure message scraping remains accurate:

- Deduplication of repeated messages

- Role detection (user vs. assistant messages)

- Container width filtering to exclude sidebar conversations

ChatBridge provides a unified interface to:

### 🌐 Universal Platform Support

Works seamlessly across major AI platforms:- **Intelligently scan** conversations from any supported AI platform

- **ChatGPT** (chat.openai.com, chatgpt.com)- **Preserve context** when moving between platforms## 🔍 Problem Statement:

- **Claude** (claude.ai)- **Transform content** with AI-powered tools (summarize, rewrite, translate)

- **Google Gemini** (gemini.google.com)- **Optimize prompts** for specific AI models with tone synchronizationAs AI assistants proliferate, users face several key problems

- **Perplexity AI** (perplexity.ai)- **Restore conversations** seamlessly into any platform's chat interfaces

- **Microsoft Copilot** (copilot.microsoft.com)

- **Poe** (poe.com)---

- **Grok (X.AI)** (x.ai)## ✨ Key Features

- **DeepSeek** (deepseek.ai)- 1. **Context Loss**: Starting fresh conversations on a new platform means losing valuable context and history

- **Mistral** (chat.mistral.ai)- 2. **Platform Lock-in**: Conversations become trapped in a single platform's ecosystem# Run tests with UI

- **Meta AI** (meta.ai)- 3. **Manual Copying**: Time-consuming manual copy-paste between platforms with formatting issuesnpx playwright test --ui

- 4. **Model-Specific Language**: Each AI has different "communication styles" that work better with specific prompting approaches```

### 🎚️ Sync Tone (Prompt Engineering)- 5. **Information Overload**: Long conversations become difficult to reference and share

Transform conversations for optimal performance on different AI models:- 6. **Language Barriers**: Multilingual users need to translate conversations across platforms### Test Coverage

- Rewrites prompts to match target model's communication style

- Optimizes context framing for specific AI platforms### 🧠 Smart Message Extraction```

- Preserves factual content while adapting tone and structure

- Supports: Claude, ChatGPT, Gemini, OpenAI, Llama, and more- Adapter-based architecture with platform-specific extraction logic## ✨ Key FeaturesChatBridge/



### 📝 AI-Powered Summarization- Intelligent filtering to exclude UI elements, buttons, and system messages

Intelligent hierarchical summarization for long conversations:

- **Length options**: Concise, Short, Medium, Comprehensive, Detailed- Deduplication of repeated messages├── adapters.js          # Site-specific adapters for each platform

- **Format styles**:

  - Paragraph (coherent narrative)- Role detection (user vs. assistant messages)

  - Bullet Points (key takeaways)

  - Executive Summary (high-level decisions)- Container width filtering to exclude sidebar conversations### 🌐 Universal Platform Support├── content_script.js    # Main content script for UI and message scanning

  - Technical Summary (specs & implementation)

  - Detailed Summary (comprehensive coverage)

- **Smart chunking**: Breaks large conversations into manageable pieces

- **Parallel processing**: Summarizes chunks concurrently for speed### 🎚️ Sync Tone (Prompt Engineering)├── background.js        # Service worker for API calls

- **Intelligent merging**: Combines chunk summaries into coherent output



### ✍️ Intelligent Rewriting

Enhance conversation quality with style-specific rewriting:Transform conversations for optimal performance on different AI models:Works seamlessly across major AI platforms:├── storage.js           # Storage abstraction with fallbacks

- **Normal**: Clearer, more professional phrasing

- **Concise**: Removes fluff, keeps essentials- Rewrites prompts to match target model's communication style

- **Direct**: Assertive, active voice, straightforward

- **Detailed**: Adds context, clarity, and elaboration- Optimizes context framing for specific AI platforms- **ChatGPT** (chat.openai.com, chatgpt.com)├── popup.html/js        # Extension popup UI

- **Academic**: Formal tone with scholarly language

- Preserves factual content while adapting tone and structure

### 🌍 Multi-Language Translation

Break language barriers with 20+ supported languages:- Supports: Claude, ChatGPT, Gemini, OpenAI, Llama, and more- **Claude** (claude.ai)├── options.html/js      # Settings page

- English, Spanish, French, German, Italian, Portuguese

- Chinese, Japanese, Korean

- Arabic, Russian, Hindi, Tamil, Vietnamese, Thai

- Polish, Turkish, Indonesian, Dutch, Swedish, Norwegian, Danish### 📝 AI-Powered Summarization- **Google Gemini** (gemini.google.com)└── tests/

- Output-only translation (no explanations or extra text)



### 🧠 Cross-Context Memory Engine

Build your personal AI "second brain":Intelligent hierarchical summarization for long conversations:- **Perplexity AI** (perplexity.ai)    ├── acceptance.spec.ts           # End-to-end acceptance tests

- **Automatic knowledge extraction**: AI analyzes every conversation for entities, themes, conclusions

- **Context detection**: Proactively suggests related past conversations- **Length options**: Short, Medium, Long, Comprehensive

- **Smart scoring**: Entity match +3, theme match +2, ranks relevance

- **Proactive suggestions**: Champagne-gradient notifications with auto-dismiss- **Format styles**: - **Poe** (poe.com)    └── adapter-regression.spec.ts   # Adapter scraping regression tests

- **Manual trigger**: "Connections" button for on-demand analysis

  - Paragraph (coherent narrative)

### 📊 Visual Knowledge Graph

Interactive force-directed graph visualization:  - Bullet Points (key takeaways)- **Microsoft Copilot** (copilot.microsoft.com)```

- **Node encoding**: Size = message count, color = platform

- **Edge encoding**: Thickness = connection strength, opacity = relevance  - Executive Summary (high-level decisions)

- **Physics simulation**: 100-frame force-directed layout with spring model

- **Platform colors**: ChatGPT (green), Claude (purple), Gemini (blue), Copilot (cyan), Perplexity (indigo)  - Technical Summary (specs & implementation)- **Grok (X.AI)** (x.ai)

- **Interactive**: Click any node to open that conversation

- **Real-time stats**: Shows total conversations and connections  - Detailed Summary (comprehensive coverage)



### ⚠️ Contradiction Tracking- **Smart chunking**: Breaks large conversations into manageable pieces- **DeepSeek** (deepseek.ai)### Key Components

Automatic detection of conflicting conclusions:

- **Semantic analysis**: Detects 9 contradictory word pairs (better/worse, use/avoid, etc.)- **Parallel processing**: Summarizes chunks concurrently for speed

- **Entity overlap**: Only alerts when contradictions involve same topics

- **Red alert notification**: Fixed top-right with Review/Dismiss actions- **Intelligent merging**: Combines chunk summaries into coherent output- **Mistral** (chat.mistral.ai)

- **Confidence scoring**: 0.7 confidence for all detected contradictions

- **Console logging**: Full details available for review- **Retry/fallback logic**: Ensures reliability even with API hiccups



### 🔍 Multi-Hop Discovery- **Meta AI** (meta.ai)#### Adapters (`adapters.js`)

Find indirect connections through graph traversal:

- **Depth-first search**: Explores up to 2 hops by default### ✍️ Intelligent Rewriting

- **Path scoring**: Entity +3, theme +2 per hop

- **Top 5 results**: Returns strongest connection paths

- **A→B→C patterns**: Discovers knowledge bridges between different domains

Enhance conversation quality with style-specific rewriting:

### 💾 Export & Import

Portable JSON backup system:- **Normal**: Clearer, more professional phrasing### 🧠 Smart Message ExtractionEach adapter provides:

- **Complete backup**: Knowledge graph + conversations + metadata

- **Merge strategy**: Imports only new items (deduplicates by ID)- **Concise**: Removes fluff, keeps essentials

- **Validation**: Checks required fields before importing

- **Auto-refresh**: Rebuilds graph visualization after import- **Direct**: Assertive, active voice, straightforward- `detect()`: Returns true if the adapter matches the current site

- **Toast feedback**: Shows import results (X knowledge items, Y conversations)

- **Detailed**: Adds context, clarity, and elaboration

### 🔧 Smart Query

AI-powered conversation search:- **Academic**: Formal tone with scholarly language- Adapter-based architecture with platform-specific extraction logic- `getMessages()`: Extracts `{ role: 'user' | 'assistant', text: string }[]` from the page

- **Natural language search**: Ask questions about your chat history

- **Metadata filters**: Filter by platform, model, date range

- **Embeddings**: Uses Gemini API for semantic search

- **Provenance tracking**: Shows model, message count, conversation age### 🌍 Multi-Language Translation- Intelligent filtering to exclude UI elements, buttons, and system messages- `getInput()`: Returns the chat input element for restore functionality

- **Clickable metadata**: Click platform/model to filter list



### 💾 Conversation Management

- Save and organize multiple conversation historiesBreak language barriers with 20+ supported languages:- Deduplication of repeated messages- `scrollContainer()`: Returns the scrollable chat container (optional)

- Quick preview of saved conversations

- Dropdown selector for easy access- English, Spanish, French, German, Italian, Portuguese

- Local storage with Chrome sync support

- Export conversations to clipboard- Chinese (Simplified & Traditional), Japanese, Korean- Role detection (user vs. assistant messages)



### 🔒 Privacy & Security- Arabic, Russian, Hindi, Tamil, Vietnamese, Thai

- **Local-first**: Conversations stored locally in your browser

- **Secure API keys**: Stored in Chrome's encrypted storage- Polish, Turkish, Indonesian, Dutch, Swedish, Norwegian, Danish- Container width filtering to exclude sidebar conversations#### Message Extraction Strategy

- **No third-party tracking**: Your data never leaves your control

- **Open source**: Full transparency of data handling- Output-only translation (no explanations or extra text)



---



## 🏗️ Tech Stack### 💾 Conversation Management



### Frontend### 🎚️ Sync Tone (Prompt Engineering)**Gemini**:

- **Vanilla JavaScript** - No framework dependencies, pure performance

- **Shadow DOM** - Isolated UI preventing conflicts with host pages- Save and organize multiple conversation histories

- **CSS3** - Custom dark theme with champagne/gold accents

- **Web Extensions API** - Chrome Extension Manifest V3- Quick preview of saved conversations- Prefers native `<user-query>` and `<model-response>` tags



### Backend/Processing- Dropdown selector for easy access

- **Google Gemini API** - AI processing for summarization, translation, rewriting

- **Hierarchical Processing** - Smart chunking and parallel processing for large texts- Local storage with Chrome sync supportTransform conversations for optimal performance on different AI models:- Filters by main chat container width to exclude sidebars

- **Retry/Fallback Logic** - Robust error handling with exponential backoff

- **Force-Directed Graph** - Canvas-based physics simulation for visualization- Export conversations to clipboard



### Storage- Rewrites prompts to match target model's communication style- Deduplicates by first 100 characters of text

- **Chrome Storage API** - Secure, synced storage across devices

- **LocalStorage Fallback** - Graceful degradation when extension context unavailable### 🔒 Privacy & Security

- **Knowledge Graph Store** - Separate localStorage key for extracted insights

- Optimizes context framing for specific AI platforms- Excludes UI chrome: "show thinking", "try:", "suggested", "regenerate", etc.

### Architecture Patterns

- **Adapter Pattern** - Pluggable platform-specific extractors- **Local-first**: Conversations stored locally in your browser

- **Observer Pattern** - Event-driven communication between components

- **Strategy Pattern** - Configurable processing strategies- **Secure API keys**: Stored in Chrome's encrypted storage- Preserves factual content while adapting tone and structure

- **Singleton Pattern** - Shared state management

- **No third-party tracking**: Your data never leaves your control

---

- **Open source**: Full transparency of data handling- Supports: Claude, ChatGPT, Gemini, OpenAI, Llama, and more**ChatGPT**:

## 🚀 Installation & Setup



### Quick Start (Chrome)

---- Uses `[data-message-author-role="user|assistant"]` selectors

1. **Clone the repository**

   ```bash

   git clone https://github.com/Naeha-S/ChatBridge.git

   cd ChatBridge## 🏗️ Tech Stack### 📝 AI-Powered Summarization- Extracts text from `.markdown.prose` children

   ```



2. **Load extension in Chrome**

   - Open Chrome and navigate to `chrome://extensions/`### Frontend- Filters out system messages and short texts

   - Enable **Developer mode** (toggle in top-right corner)

   - Click **"Load unpacked"**- **Vanilla JavaScript** - No framework dependencies, pure performance

   - Select the `ChatBridge` directory

   - The ChatBridge icon (⚡) should appear in your toolbar- **Shadow DOM** - Isolated UI preventing conflicts with host pagesIntelligent hierarchical summarization for long conversations:



3. **Pin the extension** (optional but recommended)- **CSS3** - Custom dark theme with gold accents

   - Click the puzzle icon in Chrome toolbar

   - Find "ChatBridge" and click the pin icon- **Web Extensions API** - Chrome Extension Manifest V3- **Length options**: Short, Medium, Long, Comprehensive**Claude**:

   - The ⚡ icon will now be visible for quick access



4. **Start using**

   - Navigate to any supported AI chat platform### Backend/Processing- **Format styles**: - Deep scans all `<p>`, `.whitespace-pre-wrap`, `.break-words` nodes

   - Click the ⚡ floating button (bottom-right corner)

   - Click **"Scan Chat"** to capture the conversation- **Google Gemini API** - AI processing for summarization, translation, rewriting

   - Use the AI tools (Sync Tone, Summarize, Rewrite, Translate)

   - Explore the **Knowledge Graph** to visualize connections- **Hierarchical Processing** - Smart chunking and parallel processing for large texts  - Paragraph (coherent narrative)- First candidate is user, remaining are assistant



### API Key Setup (Optional)- **Retry/Fallback Logic** - Robust error handling with exponential backoff



ChatBridge uses Google Gemini API for AI features. A default key is included for testing, but you can add your own:  - Bullet Points (key takeaways)- Merges consecutive assistant fragments into single message



1. Get a free Gemini API key at [Google AI Studio](https://makersuite.google.com/app/apikey)### Storage

2. Click the ChatBridge extension icon

3. Click **"Settings"** (or right-click extension → Options)- **Chrome Storage API** - Secure, synced storage across devices  - Executive Summary (high-level decisions)- Cleans user message text (removes "N\n", "User:", extra whitespace)

4. Paste your API key and save

- **LocalStorage Fallback** - Graceful degradation when extension context unavailable

---

  - Technical Summary (specs & implementation)- Filters: "Please continue the conversation", "Claude can make mistakes", etc.

## 📖 How to Use

### Architecture Patterns

### Basic Workflow

- **Adapter Pattern** - Pluggable platform-specific extractors  - Detailed Summary (comprehensive coverage)

1. **Scan a Conversation**

   - Open any AI chat (ChatGPT, Claude, Gemini, etc.)- **Observer Pattern** - Event-driven communication between components

   - Click the ⚡ button (bottom-right)

   - Click **"Scan Chat"**- **Strategy Pattern** - Configurable processing strategies (summarize styles, rewrite modes)- **Smart chunking**: Breaks large conversations into manageable pieces### Debugging

   - The sidebar shows your captured conversation

- **Singleton Pattern** - Shared state management and storage abstraction

2. **Transform with AI Tools**

   - **Parallel processing**: Summarizes chunks concurrently for speed

   **🎚️ Sync Tone** - Optimize for another AI model:

   - Select target model (Claude, ChatGPT, Gemini, etc.)---

   - Click **"Sync Tone"**

   - Wait for transformation (shows progress)- **Intelligent merging**: Combines chunk summaries into coherent outputAll adapters log detailed debug output to the browser console:

   - Click **"Insert to Chat"** to paste optimized version

## 🚀 Installation & Setup

   **📝 Summarize** - Condense long chats:

   - Choose length (short/medium/long/comprehensive)- **Retry/fallback logic**: Ensures reliability even with API hiccups

   - Select style (paragraph/bullet/executive/technical)

   - Click **"Summarize"**### Quick Start (Chrome)

   - See progress indicator as chunks are processed

```javascript

   **✍️ Rewrite** - Improve clarity and tone:

   - Select style (normal/concise/direct/detailed/academic)1. **Clone the repository**

   - Click **"Rewrite"**

   - Review rewritten version   ```bash### ✍️ Intelligent Rewriting// Gemini



   **🌐 Translate** - Convert to another language:   git clone https://github.com/Naeha-S/ChatBridge.git

   - Select target language (20+ options)

   - Click **"Translate"**   cd ChatBridge[Gemini Debug] Found: { userQueries: 1, modelResponses: 1 }

   - Get clean translation (no extra explanations)

   ```

3. **Explore Connections**

   Enhance conversation quality with style-specific rewriting:[Gemini Debug] Using native tags, total containers: 2

   **🔍 Connections** - Discover related conversations:

   - Click **"Connections"** button2. **Load extension in Chrome**

   - AI analyzes current page context

   - Champagne notification shows related chats   - Open Chrome and navigate to `chrome://extensions/`- **Normal**: Clearer, more professional phrasing[Gemini Debug] After filtering: 2 containers

   - Click **"View"** to open related conversation

   - Enable **Developer mode** (toggle in top-right corner)

   **📊 Graph** - Visualize your network:

   - Click **"Graph"** button   - Click **"Load unpacked"**- **Concise**: Removes fluff, keeps essentials[Gemini Debug] FINAL RESULT: 2 messages

   - Interactive force-directed graph renders

   - Click any node to open that conversation   - Select the `ChatBridge` directory

   - Use **Export** to backup, **Import** to restore

   - The ChatBridge icon (⚡) should appear in your toolbar- **Direct**: Assertive, active voice, straightforward

4. **Restore to Another Platform**

   - Navigate to a different AI platform

   - Open the ChatBridge sidebar (⚡ button)

   - Select a saved conversation from dropdown3. **Pin the extension** (optional but recommended)- **Detailed**: Adds context, clarity, and elaboration// ChatGPT

   - Click **"Restore"**

   - Conversation is automatically pasted into the chat input   - Click the puzzle icon in Chrome toolbar



### Pro Tips   - Find "ChatBridge" and click the pin icon- **Academic**: Formal tone with scholarly language[ChatGPT Debug] Wrappers found: 2



- **Progress Indicators**: Watch animated dots for real-time processing status   - The ⚡ icon will now be visible for quick access

- **Chunking**: Long conversations are automatically split and processed in parallel

- **History**: Recent scans are saved automatically in the dropdown[ChatGPT Debug] Wrapper 0: USER role=user text="Hello"

- **Multiple Saves**: Switch between multiple saved conversations via dropdown

- **Auto-detection**: Context suggestions appear automatically after 4 seconds4. **Start using**

- **Contradictions**: Red alerts show when new insights conflict with past conclusions

- **Multi-hop**: Discover A→B→C connection patterns in your knowledge graph   - Navigate to any supported AI chat platform### 🌍 Multi-Language Translation[ChatGPT Debug] Wrapper 1: ASSISTANT role=assistant text="Hi there!"



---   - Click the ⚡ floating button (bottom-right corner)



## 🔧 Project Structure   - Click **"📸 Scan Chat"** to capture the conversation



```   - Use the AI tools (Sync Tone, Summarize, Rewrite, Translate)

ChatBridge/

├── manifest.json                  # Extension manifest (V3)   - Click **"♻️ Restore"** to paste into another platform's chatBreak language barriers with 20+ supported languages:// Claude

├── content_script.js              # Main UI and logic (3400+ lines)

├── background.js                  # Service worker for API calls

├── adapters.js                    # Platform-specific message extractors

├── storage.js                     # Storage abstraction layer### API Key Setup (Optional)- English, Spanish, French, German, Italian, Portuguese[Claude Debug] Container found: DIV root

├── popup.html/js                  # Extension popup interface

├── options.html/js                # Settings/options page

├── sidebar.html/js                # Sidebar UI (if separate)

├── styles.css                     # Global stylesChatBridge uses Google Gemini API for AI features. A default key is included for testing, but you can add your own:- Chinese (Simplified & Traditional), Japanese, Korean[Claude Debug] Candidate message nodes found: 2

├── iconic.jpeg                    # Extension avatar icon

├── icons/                         # Extension toolbar icons

├── tests/

│   ├── acceptance.spec.ts         # E2E tests1. Get a free Gemini API key at [Google AI Studio](https://makersuite.google.com/app/apikey)- Arabic, Russian, Hindi, Tamil, Vietnamese, Thai[Claude Debug] Message 0: role=user text="What is TypeScript"

│   └── adapter-regression.spec.ts # Adapter validation

├── playwright.config.ts           # Test configuration2. Click the ChatBridge extension icon

├── package.json                   # Dependencies and scripts

├── .gitignore                     # Git ignore rules3. Click **"Settings"** (or right-click extension → Options)- Polish, Turkish, Indonesian, Dutch, Swedish, Norwegian, Danish[Claude Debug] Message 1: role=assistant text="TypeScript is a strongly typed..."

├── README.md                      # This file

├── QUICK_START.md                 # Quick reference guide4. Paste your API key and save

├── IMPLEMENTATION_SUMMARY.md      # Technical implementation details

├── CROSS_CONTEXT_MEMORY.md        # Memory engine deep dive- Output-only translation (no explanations or extra text)```

├── KNOWLEDGE_GRAPH.md             # Graph features comprehensive guide

├── PROVENANCE_ENHANCEMENTS.md     # Provenance features documentation---

└── DEBUGGING.md                   # Debugging tools and techniques

```



---## 📖 How to Use



## 🛠️ Troubleshooting### 💾 Conversation Management### Adding a New Adapter



### Extension not visible### Basic Workflow

- Ensure Developer mode is enabled in `chrome://extensions/`

- Check that extension is loaded and toggle is ON

- Reload the extension or restart Chrome

1. **Scan a Conversation**

### Scan Chat returns empty

- Check browser console (F12) for `[Debug]` logs   - Open any AI chat (ChatGPT, Claude, Gemini, etc.)- Save and organize multiple conversation histories1. Add a new adapter object to `SiteAdapters` array in `adapters.js`:

- Some platforms need page fully loaded - wait and retry

- Ensure you're on a supported platform (see list above)   - Click the ⚡ button (bottom-right)



### Restore not working   - Click **"📸 Scan Chat"**- Quick preview of saved conversations

- Some platforms use React/Vue inputs requiring special events

- Try clicking in the input field before clicking Restore   - The sidebar shows your captured conversation

- Check console for errors

- Dropdown selector for easy access```javascript

### Knowledge Graph empty

- Scan at least one conversation first2. **Transform with AI Tools**

- Wait for knowledge extraction to complete (async, ~3s)

- Check localStorage: `localStorage.getItem('chatbridge:knowledge_graph')`   - Local storage with Chrome sync support{



### Contradictions not alerting   **🎚️ Sync Tone** - Optimize for another AI model:

- Check if entities overlap (must have shared entities)

- Verify contradictory words exist (better/worse, use/avoid, etc.)   - Select target model (Claude, ChatGPT, Gemini, etc.)

- Enable debug and check console

   - Click **"🎚️ Sync Tone"**## 🏗️ Tech Stack  },

### API rate limiting

- Default: 1 request/sec with burst of 5   - Wait for transformation (shows progress)

- Wait a few seconds between operations

- Use your own Gemini API key for higher limits   - Click **"Insert to Chat"** to paste optimized version  getInput: () => document.querySelector('textarea')



---



## 📊 Performance   **📝 Summarize** - Condense long chats:### Frontend}



### Memory Usage   - Choose length (short/medium/long/comprehensive)

- Base extension: ~2MB

- Per conversation: ~5KB   - Select style (paragraph/bullet/executive/technical)- **Vanilla JavaScript** - No framework dependencies, pure performance```

- Per knowledge entry: ~500 bytes

- 100 conversations: ~2.5MB total   - Click **"📝 Summarize"**



### Rendering Performance   - See progress indicator as chunks are processed- **Shadow DOM** - Isolated UI preventing conflicts with host pages

- Canvas FPS: 60fps target

- Force simulation: ~1.6s (100 frames)   - Click **"Insert to Chat"** when complete

- Node count tested: 100 nodes, 300 edges

- **CSS3** - Custom dark theme with gold accents2. Add regression tests in `tests/adapter-regression.spec.ts`

### API Calls

- Knowledge extraction: 1 call per scan   **✍️ Rewrite** - Improve clarity and tone:

- Rate limit: 60 req/min (Gemini free tier)

- Typical latency: 2-3 seconds   - Select style (normal/concise/direct/detailed/academic)- **Web Extensions API** - Chrome Extension Manifest V33. Test manually on the target platform



---   - Click **"✍️ Rewrite"**



## 🗺️ Roadmap   - Review rewritten version4. Run the test suite to ensure no regressions



### Planned Features   - Click **"Insert to Chat"**

- [ ] Timeline view with temporal edges

- [ ] Filter graph by platform/model### Backend/Processing

- [ ] Search nodes by entity/theme

- [ ] Zoom/pan controls for canvas   **🌐 Translate** - Convert to another language:

- [ ] 3D graph with WebGL

- [ ] Conversation branching and merge tools   - Select target language (20+ options)- **Google Gemini API** - AI processing for summarization, translation, rewriting## Installation

- [ ] Custom prompt templates

- [ ] Keyboard shortcuts for quick access   - Click **"🌐 Translate"**

- [ ] Batch processing multiple conversations

- [ ] Team/shared conversation spaces   - Get clean translation (no extra explanations)- **Hierarchical Processing** - Smart chunking and parallel processing for large texts

- [ ] Conversation analytics and insights

   - Click **"Insert to Chat"**

---

- **Retry/Fallback Logic** - Robust error handling with exponential backoff### Development Mode

## 👤 Author

3. **Restore to Another Platform**

**Naeha S**

- GitHub: [@Naeha-S](https://github.com/Naeha-S)   - Navigate to a different AI platform



---   - Open the ChatBridge sidebar (⚡ button)



## 📄 License   - Select a saved conversation from dropdown### Storage1. Clone the repository



MIT License - See LICENSE file for details   - Click **"♻️ Restore"**



---   - Conversation is automatically pasted into the chat input- **Chrome Storage API** - Secure, synced storage across devices2. Open Chrome and navigate to `chrome://extensions/`



## 🎁 Benefits   - Press Enter to start chatting!



### For Users- **LocalStorage Fallback** - Graceful degradation when extension context unavailable3. Enable "Developer mode"

- ✅ **Freedom**: Switch AI platforms without losing context

- ✅ **Productivity**: Summarize, translate, enhance conversations in seconds### Pro Tips

- ✅ **Privacy**: Your data stays local and secure

- ✅ **Intelligence**: Build a second brain that connects your insights4. Click "Load unpacked" and select the ChatBridge directory

- ✅ **Flexibility**: 20+ languages, multiple formats, customizable styles

- **Progress Indicators**: Watch the animated dots (. . .) for real-time processing status

### For Developers

- ✅ **Open Source**: Learn from clean, well-documented code- **Chunking**: Long conversations are automatically split and processed in parallel### Testing5. The extension icon should appear in your toolbar

- ✅ **Extensible**: Easy adapter pattern for new platforms

- ✅ **Tested**: Comprehensive test suite ensures reliability- **History**: Recent scans are saved automatically in the dropdown

- ✅ **Modern**: Manifest V3, Shadow DOM, async/await patterns

- **Clipboard**: Use **"📋 Clipboard"** to copy raw conversation text- **Playwright** - End-to-end testing framework

### For Organizations

- ✅ **Cost Effective**: Maximize value from multiple AI subscriptions- **Multiple Saves**: Switch between multiple saved conversations via dropdown

- ✅ **Vendor Independence**: Avoid lock-in to single platform

- ✅ **Knowledge Management**: Preserve and organize AI conversations- **TypeScript** - Type-safe test definitions### Production Build

- ✅ **Multilingual Support**: Global team collaboration

---

---

- **Regression Tests** - Platform-specific adapter validation

**⚡ Built with passion to break down barriers between AI platforms and unlock the power of connected knowledge**

## 🔧 Project Structure

(Future: Add build/packaging steps here)

```
```## 🚀 Installation & Setup

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
