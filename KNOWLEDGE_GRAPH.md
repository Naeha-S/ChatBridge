# Knowledge Graph – Advanced Features Guide

## Overview

The Knowledge Graph is ChatBridge's visual intelligence layer that connects your conversations across all AI platforms. It automatically detects relationships, surfaces insights, alerts you to contradictions, and helps you discover multi-hop connections you might have missed.

## Core Features

### 1. Visual Graph Explorer 🎨

**What it does:**
Renders your entire conversation network as an interactive force-directed graph. Each node represents a conversation, sized by message count and colored by platform. Edges show connections based on shared entities and themes.

**How to use:**
1. Click the **Knowledge Graph** button in the action bar
2. The graph renders automatically with all your conversations
3. **Click any node** to open that conversation
4. Use **Refresh** to rebuild after new scans
5. **Export** to save your graph as JSON
6. **Import** to restore or merge graphs

**Visual encoding:**
- **Node size**: Larger = more messages in that conversation
- **Node color**: Platform-specific (ChatGPT = green, Claude = purple, Gemini = blue, Copilot = cyan, Perplexity = indigo)
- **Edge thickness**: Thicker = stronger connection (more shared entities/themes)
- **Edge opacity**: Higher = more relevant relationship

**Stats display:**
Shows total conversations and connections in real-time.

**Canvas interaction:**
- **Click node**: Opens that conversation
- **Force simulation**: Nodes automatically arrange themselves to minimize edge crossings
- **Boundary constraints**: Nodes stay within canvas bounds

---

### 2. Contradiction Tracking 🚨

**What it does:**
Automatically detects when new knowledge contradicts past conclusions. Uses semantic analysis to identify conflicting statements about the same entities or topics.

**How it works:**
When you scan a new conversation and knowledge is extracted, ChatBridge:
1. Compares new conclusions against all past conclusions
2. Checks for entity/theme overlap
3. Detects contradictory word pairs (e.g., "better" vs "worse", "use" vs "avoid")
4. Shows a red alert with details if conflicts are found

**Contradiction detection algorithm:**
```
For each new conclusion:
  For each old conclusion with shared entities:
    Check for contradictory pairs:
      - better ↔ worse
      - faster ↔ slower
      - easier ↔ harder
      - recommended ↔ not recommended
      - use ↔ avoid
      - enable ↔ disable
      - good ↔ bad
      - secure ↔ insecure
      - safe ↔ unsafe
    
    If match found:
      confidence = 0.7
      alert user
```

**Alert UI:**
- **Position**: Fixed top-right corner
- **Color**: Red gradient (error state)
- **Auto-dismiss**: 20 seconds
- **Actions**:
  - **Review**: Opens console with full contradiction details
  - **Dismiss**: Closes alert immediately

**Example:**
If you previously concluded "Python is faster than Node.js" and now conclude "Node.js is faster for I/O", ChatBridge alerts you to the potential conflict.

---

### 3. Multi-Hop Discovery 🔍

**What it does:**
Finds indirect connections between conversations. Discovers A→B→C relationships where A and C are related through intermediate conversation B, even if they don't directly share entities.

**How it works:**
Uses graph traversal (depth-first search) to explore up to 2 hops from any conversation:
1. Start from conversation A
2. Find all conversations B that share entities/themes with A
3. From each B, find conversations C that share with B
4. Record path A→B→C with connection strength
5. Return top 5 strongest paths

**Scoring:**
- Entity match: +3 points per shared entity
- Theme match: +2 points per shared theme
- Path strength = sum of all connection strengths along path

**API:**
```javascript
const paths = await discoverMultiHopConnections(conversationId, maxHops);
// Returns: [{ path: [id1, id2, id3], entities: [...], themes: [...], strength: 15 }]
```

**Use cases:**
- "I discussed React best practices with ChatGPT and Next.js deployment with Claude. What connects them?"
- "Find hidden patterns across 3+ conversations about the same project."
- "Discover knowledge bridges between different domains."

**Example:**
```
Conversation A (ChatGPT): FastAPI performance optimization
Conversation B (Claude): Python async patterns
Conversation C (Gemini): Database connection pooling

Multi-hop discovery finds: A → B → C
Reasoning: A and B share "Python async", B and C share "connection management"
Even though A and C don't directly mention the same entities, they're related through B.
```

---

### 4. Export & Import 📦

**What it does:**
Backs up your entire knowledge graph and conversations to a portable JSON file. Enables data portability, archiving, and merging across devices.

**Export format:**
```json
{
  "version": "1.0",
  "exportDate": "2024-01-15T10:30:00.000Z",
  "knowledgeGraph": [
    {
      "id": "1729900000123",
      "ts": 1729900000123,
      "entities": ["FastAPI", "Python"],
      "themes": ["web development"],
      "conclusions": ["Use async endpoints for better performance"],
      "contradictions": [],
      "context": "FastAPI setup discussion",
      "detectedContradictions": []
    }
  ],
  "conversations": [
    {
      "id": "1729900000123",
      "ts": 1729900000123,
      "platform": "chatgpt",
      "model": "gpt-4",
      "messages": [...],
      "metadata": {...}
    }
  ],
  "metadata": {
    "totalConversations": 15,
    "totalKnowledge": 15,
    "platforms": ["chatgpt", "claude", "gemini"]
  }
}
```

**Import strategy:**
- **Merge mode**: Only adds new items (deduplicates by ID)
- **Preserves existing data**: Never overwrites
- **Validation**: Checks for required fields before importing

**How to use:**
1. **Export**: Click Export button → saves `chatbridge-export-{timestamp}.json` to Downloads
2. **Import**: Click Import → select exported JSON file → auto-merges new data
3. **Result**: Toast shows "Imported X knowledge items, Y conversations"

**Use cases:**
- Backup before clearing localStorage
- Transfer data between browsers/devices
- Share curated conversation sets with team
- Archive old conversations for later analysis

---

## Data Model

### Knowledge Graph Entry
```typescript
interface KnowledgeGraphEntry {
  id: string;                    // Conversation ID (timestamp-based)
  ts: number;                    // Timestamp
  entities: string[];            // Max 8 entities (people, tools, concepts)
  themes: string[];              // Max 6 themes (topics, categories)
  conclusions: string[];         // Max 4 key takeaways
  contradictions: string[];      // Max 3 conflicting points
  context: string;               // Short summary
  detectedContradictions?: ContradictionAlert[];  // Auto-detected conflicts
}
```

### Contradiction Alert
```typescript
interface ContradictionAlert {
  entity: string;                // Conflicting entity
  oldConclusion: string;         // Previous conclusion
  newConclusion: string;         // New conflicting conclusion
  oldId: string;                 // Original conversation ID
  newId: string;                 // New conversation ID
  confidence: number;            // 0-1 confidence score
}
```

### Multi-Hop Path
```typescript
interface MultiHopPath {
  path: string[];                // [id1, id2, id3] conversation chain
  entities: string[];            // Shared entities along path
  themes: string[];              // Shared themes along path
  strength: number;              // Connection strength score
}
```

---

## Technical Architecture

### Storage
- **Key**: `chatbridge:knowledge_graph`
- **Format**: JSON array of KnowledgeGraphEntry objects
- **Backend**: localStorage (falls back from chrome.storage.sync if needed)
- **Parallel to**: `chatbridge:conversations` (main conversation store)

### Graph Rendering
- **Canvas**: HTML5 Canvas API (350×400px)
- **Layout**: Force-directed graph with:
  - Repulsion force between all nodes
  - Attraction force along edges (spring model)
  - Center gravity to keep graph centered
  - Velocity damping for smooth animation
  - Boundary constraints
- **Animation**: 100 frames @ 60fps (~1.6 seconds)

### Force Simulation Parameters
```javascript
repulsionForce = 500 / (distance^2)
springForce = (distance - 80) * 0.01 * edgeStrength
centerGravity = (centerX - nodeX) * 0.001
damping = 0.8
```

### Contradiction Detection
- **Trigger**: After every knowledge extraction (post-scan)
- **Scope**: Compares new knowledge against entire existing graph
- **Complexity**: O(n * m * p) where n=old conclusions, m=new conclusions, p=contradictory pairs
- **Optimization**: Early exit on no entity overlap

### Multi-Hop Traversal
- **Algorithm**: Depth-first search with visited tracking
- **Max depth**: 2 hops (configurable)
- **Pruning**: Only explores nodes with entity/theme overlap
- **Result limit**: Top 5 strongest paths

---

## API Reference

### Functions

#### `renderKnowledgeGraph()`
Renders the visual graph on canvas.
- **Parameters**: None
- **Returns**: Promise<void>
- **Side effects**: Updates canvas and stats display

#### `loadKnowledgeGraph()`
Loads knowledge graph from storage.
- **Parameters**: None
- **Returns**: Promise<KnowledgeGraphEntry[]>
- **Throws**: Returns empty array on error

#### `detectContradictions(newKnowledge)`
Detects contradictions between new and existing knowledge.
- **Parameters**: 
  - `newKnowledge`: KnowledgeGraphEntry to check
- **Returns**: Promise<ContradictionAlert[]>
- **Side effects**: None (pure function)

#### `showContradictionAlert(contradictions)`
Displays red alert with contradiction details.
- **Parameters**:
  - `contradictions`: ContradictionAlert[] to display
- **Returns**: void
- **Side effects**: Injects alert DOM element, auto-removes after 20s

#### `discoverMultiHopConnections(conversationId, maxHops)`
Finds indirect connections via graph traversal.
- **Parameters**:
  - `conversationId`: Starting conversation ID
  - `maxHops`: Maximum path length (default: 2)
- **Returns**: Promise<MultiHopPath[]>
- **Algorithm**: Depth-first search with backtracking

---

## Event Handlers

### Button Handlers

#### `btnKnowledgeGraph.click`
Opens graph view and triggers initial render.

#### `btnCloseGraph.click`
Closes graph view.

#### `btnRefreshGraph.click`
Rebuilds graph visualization from latest data.

#### `btnExportGraph.click`
Downloads complete export JSON to Downloads folder.

#### `btnImportGraph.click`
Opens file picker → validates → merges imported data.

### Canvas Handlers

#### `graphCanvas.click`
Detects clicked node → opens corresponding conversation.

---

## Integration Points

### Knowledge Extraction Flow
```
1. User clicks "Scan Chat"
2. scanChat() extracts messages
3. normalizeMessages() cleans data
4. saveConversation() persists to storage
5. extractKnowledge() analyzes with Gemini API
6. detectContradictions() checks for conflicts
7. showContradictionAlert() if conflicts found
8. localStorage saves knowledge graph entry
```

### Context Detection Flow
```
1. Page load (4s delay)
2. detectAndSuggestContext() scans recent messages
3. findRelatedConversations() scores past conversations
4. showContextSuggestion() displays champagne notification
5. User clicks "View" → opens related conversation
```

### Graph Visualization Flow
```
1. User clicks "Knowledge Graph"
2. loadKnowledgeGraph() fetches data
3. loadConversationsAsync() fetches conversations
4. Build nodes array (position, size, color)
5. Build edges array (connection strength)
6. Force simulation (100 frames)
7. Render nodes + edges on canvas
8. Add click handler for interaction
```

---

## Performance Considerations

### Canvas Rendering
- **Frame budget**: 16.67ms @ 60fps
- **Node count**: Tested up to 100 nodes
- **Edge count**: O(n²) worst case, typically O(n log n)
- **Optimization**: Early termination of force simulation if velocities < threshold

### Contradiction Detection
- **Worst case**: O(n * m * p) = O(1000 * 10 * 9) = 90,000 operations
- **Typical case**: O(100 * 4 * 9) = 3,600 operations
- **Async**: Runs after save, doesn't block UI

### Multi-Hop Discovery
- **Worst case**: O(n^maxHops) = O(100²) = 10,000 traversals
- **Pruning**: Only explores relevant paths (shared entities)
- **Typical case**: O(20 * 5) = 100 traversals

### Storage
- **Knowledge graph size**: ~500 bytes per entry
- **100 conversations**: ~50KB
- **1000 conversations**: ~500KB
- **localStorage limit**: 5-10MB (browser-dependent)

---

## Debugging

### Enable Debug Mode
```javascript
ChatBridge.enableDebug();
```

### Inspect Knowledge Graph
```javascript
const kg = await ChatBridge.loadKnowledgeGraph();
console.log(kg);
```

### Check Contradictions
```javascript
const contradictions = await ChatBridge.detectContradictions(knowledge);
console.log(contradictions);
```

### Test Multi-Hop
```javascript
const paths = await ChatBridge.discoverMultiHopConnections('1729900000123', 2);
console.log(paths);
```

### Canvas Debug
```javascript
// Get last render stats
console.log(graphStats.textContent);

// Inspect node positions
console.log(nodes.map(n => ({ id: n.id, x: n.x, y: n.y })));
```

---

## Troubleshooting

### "No knowledge graph data yet"
**Cause**: Haven't scanned any chats yet.
**Fix**: Click "Scan Chat" on a few conversations first.

### Graph not rendering
**Cause**: Canvas not initialized or empty knowledge graph.
**Fix**: Check browser console for errors. Verify `loadKnowledgeGraph()` returns data.

### Contradictions not alerting
**Cause**: No entity overlap or contradictory pairs not detected.
**Fix**: Check console for `detectContradictions` output. Verify entities match.

### Import fails with "Invalid export file format"
**Cause**: JSON missing required fields.
**Fix**: Verify export has `knowledgeGraph` and `conversations` properties.

### Canvas click not working
**Cause**: Click coordinates outside node radius.
**Fix**: Increase node size or click more precisely. Check canvas bounding rect calculation.

---

## Future Enhancements

### Planned Features
- **Timeline view**: Chronological graph with time-based edges
- **Filter by platform**: Show only ChatGPT conversations, etc.
- **Search nodes**: Find conversations by entity/theme
- **Zoom/pan**: Canvas transform controls
- **3D graph**: WebGL-based 3D force-directed layout
- **AI-powered insights**: "What patterns do you see in my conversations?"
- **Collaborative graphs**: Share/merge graphs with team members

### Algorithm Improvements
- **Better contradiction detection**: Use embeddings for semantic similarity
- **Weighted multi-hop**: Consider path diversity and relevance
- **Temporal analysis**: Detect evolving knowledge over time
- **Cluster detection**: Identify conversation communities

---

## Best Practices

### For Users
1. **Scan regularly**: More scans = richer graph
2. **Review contradictions**: Don't ignore alerts—they reveal important conflicts
3. **Export often**: Back up your knowledge graph
4. **Explore connections**: Use multi-hop discovery to find hidden insights
5. **Name conversations**: Better context = better relationships

### For Developers
1. **Async everything**: Never block the main thread
2. **Validate imports**: Check data structure before merging
3. **Limit graph size**: Consider pagination for 1000+ nodes
4. **Optimize force simulation**: Use spatial hashing for O(n log n) collision detection
5. **Test edge cases**: Empty graph, single node, disconnected components

---

## Examples

### Example 1: Find Related Discussions
```javascript
// You're discussing "React hooks" with ChatGPT
// Knowledge graph automatically finds:
// - Past Claude conversation about "useState patterns"
// - Gemini conversation about "component lifecycle"
// Shows champagne notification: "Found 2 related conversations"
```

### Example 2: Contradiction Alert
```javascript
// Conversation 1 (ChatGPT): "Use Redux for state management"
// Conversation 2 (Claude): "Avoid Redux, use Context API"
// Alert: "⚠️ Potential contradiction about Redux"
// Review → See both conclusions side-by-side
```

### Example 3: Multi-Hop Discovery
```javascript
// A: FastAPI + PostgreSQL (ChatGPT)
// B: Python async patterns (Claude)
// C: Database connection pooling (Gemini)
// Multi-hop: A → B → C via "async" and "connections"
```

### Example 4: Export & Transfer
```javascript
// Device 1: Export knowledge graph (100 conversations)
// Device 2: Import → merges with existing 50 conversations
// Result: 150 total conversations, no duplicates
```

---

## License & Credits

Part of ChatBridge Chrome Extension.
Knowledge Graph implementation inspired by D3.js force-directed layouts.
Contradiction detection based on semantic opposition analysis.

---

**Built with:** Vanilla JavaScript, HTML5 Canvas, localStorage, Gemini API
**Performance:** Optimized for 100-1000 conversations
**Browser support:** Chrome 88+, Edge 88+, Brave 1.20+
