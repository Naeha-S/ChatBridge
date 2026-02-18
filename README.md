# ⚡ ChatBridge

> **Seamlessly bridge AI conversations across multiple platforms with intelligent transformation and cross-context memory**

A Chrome extension that captures, transforms, and continues conversations across ChatGPT, Claude, Gemini, Copilot, Perplexity, and more — with built-in AI-powered tools and a visual knowledge graph that connects your insights.

---

## 🔍 Problem

As AI assistants proliferate, users face challenges like:

* **Context Loss** – Conversations don’t carry across platforms
* **Platform Lock-in** – Chats are trapped within one ecosystem
* **Manual Copying** – Time-consuming copy-paste with messy formatting
* **Model-Specific Styles** – Each AI requires different communication tone
* **Information Overload** – Long threads become hard to reference
* **Lost Insights** – Past ideas get buried or forgotten
* **Language Barriers** – Multilingual users struggle with translation

---

## 💡 Solution

**ChatBridge** provides a unified interface to:

* **Scan conversations** from supported AI platforms
* **Preserve and restore context** across models
* **Transform content** (summarize, rewrite, translate, adapt tone)
* **Extract and visualize knowledge** automatically
* **Detect contradictions** and related insights
* **Build a connected memory graph** that grows with every chat

---

## ✨ Core Features

### 🌐 Universal Platform Support

Works across 10 major AI platforms:
**ChatGPT**, **Claude**, **Gemini**, **Copilot**, **Perplexity**, **Poe**, **Grok (X.AI)**, **DeepSeek**, **Mistral**, **Meta AI**.

### 🧠 Smart Message Extraction

* Platform-specific adapters for accurate extraction
* Filters out UI elements and duplicates
* Detects user vs assistant messages
* Handles sidebar and container filtering

### 🎚️ Sync Tone (Prompt Engineering)

* Rewrites prompts to match target model style
* Optimizes tone and phrasing for ChatGPT, Claude, Gemini, etc.
* Preserves meaning while improving clarity and model compatibility

### 📝 AI-Powered Summarization

* Multiple length modes: short → detailed
* Formats: paragraph, bullets, executive, technical
* Intelligent chunking + parallel summarization for speed
* Merges segments into coherent, structured output

### ✍️ Intelligent Rewriting

* Style modes: **Normal**, **Concise**, **Direct**, **Detailed**, **Academic**
* Improves clarity, removes filler, adapts tone, or adds depth

### 🌍 Multi-Language Translation

* Supports **20+ languages** (European, Asian, Middle Eastern, Slavic)
* Clean translation output without extra commentary

### 🧩 Cross-Context Memory Engine

* Automatically extracts entities, themes, and conclusions
* Suggests related past conversations
* Scores and ranks connections intelligently
* Manual and automatic discovery modes

### 📊 Visual Knowledge Graph

* Interactive, force-directed layout
* Node size = message count, color = platform
* Real-time stats and clickable nodes
* Highlights interconnections between insights

### ⚠️ Contradiction Tracking

* Detects semantic conflicts (e.g., “use vs avoid”)
* Shows review notifications with confidence scoring

### 🔍 Multi-Hop Discovery

* Discovers indirect links (A→B→C) between ideas
* Depth-first search with path scoring

### 💡 Insight Finder (NEW)

* **Semantic spotlight** for key chat elements
* Client-side extraction (100-300ms, no AI calls)
* Categories:
  - **Comparisons** ⚖️ — "vs", "better than", "difference between"
  - **Contradictions** ⚠️ — "however", "but", "incorrect", conflicts
  - **Requirements** ✓ — "must", "should", "need to", imperatives
  - **Todos** 📋 — checkboxes, action items, task markers
  - **Deprecated** 🗑️ — "obsolete", "no longer", "replaced by"
* **Inspector-style UI**: Click snippets to scroll to source message
* **Keyboard shortcut**: `Ctrl+Shift+F` (Windows/Linux) or `Cmd+Shift+F` (macOS)

### 🖼️ Image Vault (NEW)

* **Visual memory tool** - Never lose track of images in conversations
* Automatically detects and stores:
  - User uploads
  - AI-generated images
  - Markdown images, base64, data URLs
* **Smart deduplication** - Hash-based to prevent duplicates
* **Persistent storage** - IndexedDB keeps images across sessions
* **Quick actions**: Copy URL, expand full-size, jump to message
* **Privacy-first** - 100% local storage, no cloud sync

### ✨ Prompt Designer (NEW)

* **AI-powered next-step generator** - Never get stuck wondering what to ask
* Analyzes conversation context to suggest 5 grounded prompts:
  - ❓ **Clarification** - Ask about ambiguities
  - ⚡ **Improvement** - Suggest enhancements
  - 🔭 **Expansion** - Explore related areas
  - 🧠 **Critical Thinking** - Challenge assumptions
  - 💡 **Creative Alternative** - Propose different approaches
* **One-click actions**: Copy or send directly to chat
* **Intelligent fallback** - Works even without API key
* **No hallucinations** - Grounded in actual conversation content

### 🔧 Smart Query

* Semantic search across all chat histories
* Filters by platform, model, or date
* Shows provenance and metadata

### 💾 Export & Import

* Backup/restore JSON data (conversations + graph)
* Deduplication, validation, and merge strategy
* Toast feedback with import summary

### 🔒 Privacy & Security

* **Local-first architecture** — no cloud sync
* **Encrypted API keys** via Chrome storage
* **No third-party tracking**
* **Open-source transparency**

---

## 🚀 Installation & Setup

### Quick Start (Chrome)

```bash
git clone https://github.com/Naeha-S/ChatBridge.git
cd ChatBridge
```

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `ChatBridge` directory
4. Pin the ⚡ icon for quick access

### API Key Setup (Optional)

1. Get a free Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click ChatBridge ⚡ icon → **Settings**
3. Paste your key and save

---

## 📖 How to Use

1. **Scan a Conversation**
   Open any AI platform → click ⚡ → "Scan Chat"

2. **Transform with AI Tools**
   Use **Sync Tone**, **Summarize**, **Rewrite**, or **Translate**

3. **Find Key Insights** ⚡NEW
   Press `Ctrl+Shift+F` or click "Insight Finder" in Smart Workspace
   - Instantly extract comparisons, requirements, todos, and more
   - Click snippets to jump to source messages
   - No AI calls, 100% client-side and fast

4. **Explore Connections**
   View **Connections**, **Graph**, or run a **Smart Query**

5. **Restore Conversations**
   Choose saved conversation → click "Restore" → auto-paste into chat

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action | Description |
|----------|--------|-------------|
| `Ctrl+Shift+S` | Quick Scan | Open sidebar and scan current chat |
| `Ctrl+Shift+H` | Toggle Sidebar | Show/hide ChatBridge panel |
| `Ctrl+Shift+F` | **Insight Finder** ⚡NEW | Open semantic spotlight tool |
| `Ctrl+Shift+I` | Insert to Chat | Paste processed text into chat input |

*(Replace `Ctrl` with `Cmd` on macOS)*

---

## 🏗️ Tech Stack

**Frontend:**

* Vanilla JS, CSS3 (Inter font, dark/light themes)
* Shadow DOM for isolation
* Canvas-based visualizations

**Backend / Processing:**

* Google Gemini API (summarize, rewrite, translate)
* HuggingFace Inference API (EuroLLM, Gemma, Llama)
* OpenAI API (optional fallback)
* Hierarchical chunking & parallel processing
* Retry, caching & fallback logic

**Storage:**

* Chrome Storage API + LocalStorage fallback

**Architecture Patterns:**
Adapter • Observer • Strategy • Singleton

---

## 🔧 Project Structure

```
ChatBridge/
├── manifest.json              # Extension manifest (MV3)
├── content_script.js          # Core logic, UI, and sidebar injection
├── background.js              # API calls, rate limiting, events
├── adapters.js                # Platform-specific message extractors
├── storage.js                 # Chrome storage abstraction
├── config.js                  # Runtime configuration
├── security.js                # Input sanitization & data detection
├── smartFeatures.js           # Smart context injection
├── SegmentEngine.js           # Text segmentation engine
├── IntentAnalyzer.js          # Intent classification
├── MemoryRetrieval.js         # Memory retrieval pipeline
├── smartQueries.js/html/css   # Smart Query UI & logic
├── sidebar.html/js            # History sidebar interface
├── popup.html/js              # Popup menu
├── options.html/js            # Settings page
├── translations.js            # i18n translations
├── summarize_tab.html/js      # Standalone summarize tab
├── utils/constants.js         # Shared constants
├── utils/rewriter.js          # Rewrite utility (code-block-safe)
├── icons/                     # Toolbar icons
├── fonts/                     # Inter font files
├── documentation/             # Technical docs
└── README.md
```

---

## 🛠️ Troubleshooting

**Extension not visible:**
Enable *Developer Mode* and reload Chrome.

**Empty scan:**
Ensure page fully loaded; check console logs (`F12`).

**Restore not working:**
Click chat input before restore; verify no console errors.

**Rate limits:**
Default = 1 request/sec; add personal Gemini key for more.

---

## 🗺️ Roadmap

* [ ] Timeline view for knowledge graph
* [ ] Platform/model filters
* [ ] Conversation analytics dashboard
* [ ] Batch conversation processing
* [ ] 3D visualization (WebGL)

---

## 📚 Documentation

- [Architecture](documentation/ARCHITECTURE.md) — System design and data flows
- [API Reference](documentation/API_REFERENCE.md) — Public API, message types, storage schema
- [API Endpoints](documentation/API_ENDPOINTS.md) — External APIs used
- [Developer Guide](documentation/DEVELOPER_GUIDE.md) — How to extend & debug
- [Features](documentation/FEATURES.md) — Full feature overview
- [Quick Start](documentation/QUICK_START.md) — Installation & first use
- [Security](documentation/SECURITY.md) — Privacy & security model
- [Troubleshooting](documentation/TROUBLESHOOTING.md) — Common issues & fixes
- [How It Works](documentation/HOW_IT_WORKS.md) — Scanning & restoring deep dive

---

## 🎁 Benefits

**For Users:**

* Freedom to switch platforms
* Summaries, translations, and rewrites in seconds
* Private, local, and secure data
* Second-brain memory system

**For Developers:**

* Open-source and extensible architecture
* Well-documented and tested
* Easy adapter integration

**For Organizations:**

* Avoid vendor lock-in
* Centralized knowledge management
* Multi-language support for teams

---

## 👤 Author

**Naeha S**
GitHub: [@Naeha-S](https://github.com/Naeha-S)

---

## 📄 License

MIT License — see LICENSE file for details.

---

**⚡ Built to break barriers between AI platforms and unlock the power of connected knowledge.**
