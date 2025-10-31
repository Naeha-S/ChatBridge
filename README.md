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

Works across major AI platforms:
**ChatGPT**, **Claude**, **Gemini**, **Copilot**, **Perplexity**, **Poe**, **Grok (X.AI)**, **DeepSeek**, **Mistral**, **Meta AI**, and more.

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
   Open any AI platform → click ⚡ → “Scan Chat”

2. **Transform with AI Tools**
   Use **Sync Tone**, **Summarize**, **Rewrite**, or **Translate**

3. **Explore Connections**
   View **Connections**, **Graph**, or run a **Smart Query**

4. **Restore Conversations**
   Choose saved conversation → click “Restore” → auto-paste into chat

---

## 🏗️ Tech Stack

**Frontend:**

* Vanilla JS, CSS3 (Inter font, dark/light themes)
* Shadow DOM for isolation
* Canvas-based visualizations

**Backend / Processing:**

* Google Gemini API
* Hierarchical chunking & parallel processing
* Retry & fallback logic

**Storage:**

* Chrome Storage API + LocalStorage fallback

**Architecture Patterns:**
Adapter • Observer • Strategy • Singleton

---

## 🔧 Project Structure

```
ChatBridge/
├── manifest.json              # Extension manifest (V3)
├── content_script.js          # Core logic and UI
├── background.js              # API calls and events
├── adapters.js                # Platform-specific extractors
├── storage.js                 # Data layer
├── sidebar.html/js            # Sidebar interface
├── popup.html/js              # Popup menu
├── options.html/js            # Settings
├── icons/                     # Toolbar icons
├── tests/                     # E2E & adapter tests
├── documentation/             # Deep-dive technical docs
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

Detailed guides available in `/documentation`:

* **QUICK_START.md** – Setup and usage
* **CROSS_CONTEXT_MEMORY.md** – Memory engine
* **KNOWLEDGE_GRAPH.md** – Graph visualization
* **DEBUGGING.md** – Developer logs and troubleshooting

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
