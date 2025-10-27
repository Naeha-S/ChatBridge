# ChatBridge – Quick Start Guide

## 🚀 Getting Started

### Installation
1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the ChatBridge folder
5. Navigate to any supported AI platform (ChatGPT, Claude, Gemini, Copilot, Perplexity)

### First Use
Look for the **⚡ avatar** in the bottom-right corner of the page. If you don't see it, refresh the page.

---

## ⌨️ Keyboard Shortcuts

- **Ctrl+Shift+Q**: Quick scan current chat
- **Ctrl+Shift+S**: Toggle sidebar visibility
- **Ctrl+Shift+I**: Insert to chat (Continue With flow)

---

## 📚 Core Features

### 1. Scan Chat
**Button**: Click the ⚡ avatar → **Scan Chat**
**What it does**: Extracts all messages from the current conversation
**Result**: Saves conversation history with automatic knowledge extraction

### 2. Smart Query
**Button**: **Smart Query** in action bar
**What it does**: AI-powered conversation search with metadata filters
**Features**:
- Ask questions about your chat history
- Filter by platform (ChatGPT, Claude, Gemini, etc.)
- Filter by model (GPT-4, Claude Opus, Gemini Pro, etc.)
- View provenance details (message count, age, memory usage)
- Click platform/model to filter list

### 3. Find Connections
**Button**: **Find Connections** in action bar
**What it does**: Analyzes current page context and finds related past conversations
**Result**: Shows champagne-gradient notification with related chats

### 4. Knowledge Graph
**Button**: **Knowledge Graph** in action bar
**What it does**: Visual force-directed graph of all your conversations
**Features**:
- Nodes sized by message count
- Nodes colored by platform
- Edges show shared entities/themes
- Click any node to open that conversation
- Export/Import for backup

---

## 🧠 Cross-Context Memory Engine

### Automatic Features
- **Knowledge extraction**: Runs after every scan (async)
- **Context detection**: Runs 4 seconds after page load (if 3+ conversations exist)
- **Contradiction tracking**: Alerts you when new conclusions conflict with past ones

### Manual Triggers
- **Find Connections**: Analyze current page for related chats
- **Knowledge Graph**: Visualize your entire conversation network

---

## 🎨 Knowledge Graph Usage

### Opening the Graph
1. Click **Knowledge Graph** button in action bar
2. Graph renders automatically with force simulation
3. Wait ~1.6 seconds for layout to stabilize

### Interacting with the Graph
- **Click node**: Opens that conversation
- **Check stats**: Bottom shows "X conversations • Y connections"
- **Refresh**: Rebuilds graph from latest data
- **Export**: Downloads JSON backup to Downloads folder
- **Import**: Merges imported JSON without duplicates

### Understanding the Visualization
- **Node size**: Larger = more messages
- **Node color**: 
  - Green = ChatGPT
  - Purple = Claude
  - Blue = Gemini
  - Cyan = Copilot
  - Indigo = Perplexity
- **Edge thickness**: Thicker = stronger connection
- **Edge opacity**: Higher = more shared entities/themes

---

## ⚠️ Contradiction Alerts

### When They Appear
Automatically after every scan if new knowledge contradicts past conclusions.

### Alert Details
- **Position**: Top-right corner
- **Color**: Red gradient
- **Actions**:
  - **Review**: Logs contradiction details to console
  - **Dismiss**: Closes alert
- **Auto-dismiss**: 20 seconds

### Example
```
Past: "Python is better for data science"
New: "R is better for data science"
Alert: "⚠️ Potential Contradiction Detected"
```

---

## 💡 Proactive Suggestions

### When They Appear
- After clicking **Find Connections**
- Automatically on page load (if related conversations found)

### Notification Details
- **Position**: Bottom-right, above avatar
- **Color**: Champagne gradient
- **Actions**:
  - **View**: Opens related conversation
  - **Dismiss**: Closes notification
- **Auto-dismiss**: 15 seconds

### Example
```
"💡 Found 2 related conversations
Shared topics: FastAPI, Python, async patterns"
```

---

## 📤 Export & Import

### Export Process
1. Open **Knowledge Graph** view
2. Click **Export** button
3. File saves to Downloads: `chatbridge-export-{timestamp}.json`
4. Contains: knowledge graph + conversations + metadata

### Import Process
1. Open **Knowledge Graph** view
2. Click **Import** button
3. Select exported JSON file
4. Merges without duplicates (checks IDs)
5. Toast shows: "Imported X knowledge items, Y conversations"
6. Graph auto-refreshes

### Use Cases
- **Backup**: Export before clearing browser data
- **Transfer**: Move data between browsers/devices
- **Archive**: Save old conversations for later
- **Share**: Curate conversation sets for team

---

## 🛠️ Debugging

### Enable Debug Mode
```javascript
// Open browser console (F12)
ChatBridge.enableDebug();
```

### Check Last Scan
```javascript
ChatBridge.getLastScan();
// Returns: { messages: [...], errors: [...], adapter: "..." }
```

### Highlight Scanned Elements
```javascript
ChatBridge.highlightScan(true);  // Show borders
ChatBridge.highlightScan(false); // Hide borders
```

### Inspect Knowledge Graph
```javascript
const kg = await ChatBridge.loadKnowledgeGraph();
console.log(kg);
```

### Check for Contradictions
```javascript
const contradictions = await ChatBridge.detectContradictions(knowledge);
console.log(contradictions);
```

### Test Multi-Hop Discovery
```javascript
const paths = await ChatBridge.discoverMultiHopConnections('1729900000123', 2);
console.log(paths);
```

---

## 🔧 Troubleshooting

### Avatar Not Appearing
**Problem**: ⚡ avatar not visible on page
**Solutions**:
1. Refresh the page
2. Check you're on an approved site (ChatGPT, Claude, Gemini, Copilot, Perplexity)
3. Open console and check for errors
4. Verify extension is enabled in `chrome://extensions`

### Scan Not Working
**Problem**: "No messages found" error
**Solutions**:
1. Enable debug mode: `ChatBridge.enableDebug()`
2. Run scan again
3. Check console for errors
4. Try `ChatBridge.getLastScan()` to see what was captured
5. Highlight elements: `ChatBridge.highlightScan(true)`

### Knowledge Graph Empty
**Problem**: "No knowledge graph data yet" message
**Solutions**:
1. Scan at least one conversation first
2. Wait for knowledge extraction to complete (async, ~3s)
3. Check localStorage: `localStorage.getItem('chatbridge:knowledge_graph')`
4. Refresh graph view

### Contradictions Not Alerting
**Problem**: No alerts despite conflicting conclusions
**Solutions**:
1. Check if entities overlap (must have shared entities)
2. Verify contradictory words exist (better/worse, use/avoid, etc.)
3. Enable debug and check console
4. Manually test: `await ChatBridge.detectContradictions(knowledge)`

### Import Fails
**Problem**: "Invalid export file format" error
**Solutions**:
1. Verify JSON has `knowledgeGraph` and `conversations` properties
2. Check JSON is valid (use online JSON validator)
3. Ensure file was exported from ChatBridge (not manually edited)

---

## 📖 Documentation

- **PROVENANCE_ENHANCEMENTS.md**: Provenance features deep dive
- **CROSS_CONTEXT_MEMORY.md**: Memory engine architecture and algorithms
- **KNOWLEDGE_GRAPH.md**: Advanced features comprehensive guide
- **IMPLEMENTATION_SUMMARY.md**: Complete feature summary with technical details
- **README.md**: Project overview and architecture
- **DEBUGGING.md**: Debugging tools and techniques

---

## 🎯 Best Practices

### For Maximum Value
1. **Scan regularly**: More scans = richer knowledge graph
2. **Review contradictions**: Don't ignore alerts—they reveal important insights
3. **Export often**: Back up your knowledge graph weekly
4. **Explore connections**: Use Find Connections to discover hidden patterns
5. **Use Smart Query**: Ask questions about your conversation history

### For Developers
1. **Keep docs updated**: Edit copilot-instructions.md when changing architecture
2. **Test on all platforms**: ChatGPT, Claude, Gemini, Copilot, Perplexity
3. **Check console**: Watch for errors during development
4. **Use debug tools**: Enable debug mode before reporting issues
5. **Validate exports**: Test import/export flow after changes

---

## 🚀 Quick Command Reference

### Browser Console Commands
```javascript
// Enable debug mode
ChatBridge.enableDebug();

// Get last scan results
ChatBridge.getLastScan();

// Highlight scanned elements
ChatBridge.highlightScan(true);

// Load knowledge graph
await ChatBridge.loadKnowledgeGraph();

// Find related conversations
await ChatBridge.findRelatedConversations(['FastAPI', 'Python'], ['web dev'], 5);

// Detect contradictions
await ChatBridge.detectContradictions(knowledge);

// Multi-hop discovery
await ChatBridge.discoverMultiHopConnections('1729900000123', 2);

// Open conversation by ID
ChatBridge.openConversationById('1729900000123');
```

---

## 📊 Storage Keys

- `chatbridge:conversations`: Main conversation store
- `chatbridge:knowledge_graph`: Extracted knowledge entries
- `chatbridge:settings`: User preferences

---

## 🌐 Supported Platforms

- ✅ ChatGPT (chat.openai.com)
- ✅ Claude (claude.ai)
- ✅ Gemini (gemini.google.com)
- ✅ Copilot (copilot.microsoft.com)
- ✅ Perplexity (perplexity.ai)

---

## 💬 Need Help?

1. **Check documentation**: Start with README.md
2. **Enable debug mode**: `ChatBridge.enableDebug()`
3. **Check console**: F12 → Console tab
4. **Review logs**: Look for `[ChatBridge]` prefixed messages
5. **Test basic flow**: Scan → Smart Query → Find Connections → Knowledge Graph

---

## 🎉 You're Ready!

Start by scanning a few conversations to build your knowledge graph, then explore the connections and insights ChatBridge discovers for you. Happy bridging! ⚡
