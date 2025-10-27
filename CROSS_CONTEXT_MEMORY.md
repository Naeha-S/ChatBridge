# Cross-Context Memory Engine 🧠

## Overview

The **Cross-Context Memory Engine** transforms ChatBridge from a conversation transfer tool into an intelligent **"second brain"** that:
- **Learns** from every conversation you scan
- **Remembers** key entities, themes, and insights across all AI platforms
- **Connects** related discussions you didn't know were related
- **Suggests** relevant past context when you start new conversations

## How It Works

### 1. Knowledge Extraction (Automatic)

Every time you scan a conversation, ChatBridge automatically extracts structured knowledge:

```json
{
  "entities": ["Python", "FastAPI", "PostgreSQL", "Docker"],
  "themes": ["web development", "API design", "database optimization"],
  "conclusions": ["Use connection pooling for better performance"],
  "contradictions": ["SQLite vs PostgreSQL for production"],
  "context": "Discussion about building a scalable REST API"
}
```

**What gets extracted:**
- **Entities** (8 max): People, projects, products, technologies, companies
- **Themes** (6 max): Core topics and domains discussed
- **Conclusions** (4 max): Key decisions, insights, or recommendations
- **Contradictions** (3 max): Conflicting viewpoints or unresolved tensions
- **Context**: One-sentence summary of the conversation's purpose

### 2. Context Detection (Automatic & Manual)

**Automatic Detection:**
- Runs 4 seconds after you open a chat on any supported platform
- Only activates if you have 3+ saved conversations with knowledge
- Analyzes visible messages to understand current context
- Finds related past conversations using entity/theme matching

**Manual Trigger:**
- Click **"Find Connections"** button anytime
- Immediately scans current conversation
- Shows related memories even if auto-detection hasn't run

### 3. Intelligent Suggestions

When ChatBridge finds related conversations, you see a beautiful notification:

```
🧠 Related Memory
Earlier you discussed "building scalable REST APIs" extensively.
🏷️ Python, FastAPI, PostgreSQL

[View]  [Dismiss]
```

**Scoring System:**
- Entity match = +3 points (strong signal)
- Theme match = +2 points (moderate signal)
- Only shows connections scoring 1+
- Displays top 3 most relevant conversations

### 4. One-Click Access

Click **"View"** to:
- Open the full conversation in Smart Results
- See the complete context of that discussion
- Continue your train of thought from months ago

---

## User Flows

### Flow 1: First-Time User
1. Install ChatBridge
2. Scan 3-5 conversations across different platforms
3. Knowledge automatically extracted in background
4. No visible changes yet (building your memory graph)

### Flow 2: Returning User (Automatic)
1. Open ChatGPT and start discussing "React performance"
2. 4 seconds later, notification appears:
   > "Earlier you discussed React optimization with Claude. Connect?"
3. Click "View" → Full conversation opens
4. Copy key insights from that discussion
5. Continue with better context

### Flow 3: Manual Connection Search
1. Mid-conversation, wonder if you've discussed this before
2. Click **"Find Connections"** button
3. Wait 2-3 seconds for analysis
4. See notification if related memories exist
5. Dismiss if not relevant, or view for deeper context

---

## Technical Architecture

### Data Storage

**Knowledge Graph:**
```javascript
localStorage['chatbridge:knowledge_graph'] = [
  {
    id: "1729900000123",  // matches conversation timestamp
    ts: 1729900000123,
    entities: ["FastAPI", "Python", "Docker"],
    themes: ["web development", "deployment"],
    conclusions: ["Use uvicorn with --reload for dev"],
    contradictions: [],
    context: "Setting up FastAPI development environment"
  },
  // ... more entries
]
```

**Conversation Storage:**
```javascript
localStorage['chatbridge:conversations'] = [
  {
    ts: 1729900000123,
    platform: "chat.openai.com",
    model: "ChatGPT",
    url: "https://chat.openai.com/c/abc123",
    conversation: [
      { role: "user", text: "How do I set up FastAPI?" },
      { role: "assistant", text: "Here's how..." }
    ]
  }
]
```

### Knowledge Extraction Pipeline

```
Scan Chat
    ↓
normalizeMessages()
    ↓
detectCurrentModel()
    ↓
saveConversation()
    ↓
[Async Background]
extractKnowledge()
    ↓
callGeminiAsync(analysis prompt)
    ↓
Parse JSON response
    ↓
Store in knowledge_graph
```

**AI Prompt Template:**
```
You are an expert knowledge analyst. Analyze this conversation 
excerpt and extract structured insights.

Conversation:
{conversation_text}

Extract and return ONLY a JSON object with:
{
  "entities": [...],
  "themes": [...],
  "conclusions": [...],
  "contradictions": [...],
  "context": "..."
}
```

### Context Detection Algorithm

```javascript
async function detectAndSuggestContext() {
  // 1. Quick scan of last 5 messages
  const msgs = await scanChat();
  const recentText = msgs.slice(-5).map(m => m.text).join('\n');
  
  // 2. Extract frequent words (lightweight)
  const words = recentText.toLowerCase().split(/\W+/);
  const commonWords = getTopWords(words, 5);
  
  // 3. Find related conversations
  const related = await findRelatedConversations(
    commonWords, 
    commonWords, 
    limit: 3
  );
  
  // 4. Show notification if matches found
  if (related.length) {
    showContextSuggestion(related);
  }
}
```

**Matching Logic:**
```javascript
function findRelatedConversations(entities, themes, limit) {
  const graph = JSON.parse(localStorage['chatbridge:knowledge_graph']);
  
  return graph.map(kg => {
    let score = 0;
    
    // Entity overlap (case-insensitive substring match)
    for (const e of entities) {
      if (kg.entities.some(ke => 
        ke.toLowerCase().includes(e) || 
        e.includes(ke.toLowerCase())
      )) {
        score += 3;  // High-value signal
      }
    }
    
    // Theme overlap
    for (const t of themes) {
      if (kg.themes.some(kt => 
        kt.toLowerCase().includes(t) || 
        t.includes(kt.toLowerCase())
      )) {
        score += 2;  // Moderate signal
      }
    }
    
    return { ...kg, score };
  })
  .filter(kg => kg.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, limit);
}
```

---

## UI Components

### Find Connections Button

**Location:** Main action bar (left side)  
**Style:** Standard action button  
**States:**
- Idle: "Find Connections"
- Loading: "Analyzing…" (with spinner)
- Complete: Returns to idle

### Context Notification

**Position:** Fixed, bottom-right (above avatar)  
**Dimensions:** 320px × auto  
**Animation:** Slide-in from bottom (0.3s ease-out)  
**Auto-dismiss:** 15 seconds  
**Styling:**
```css
background: linear-gradient(135deg, 
  rgba(230,207,159,0.98), 
  rgba(212,175,119,0.98)
);
color: #0b0f17;
border-radius: 12px;
box-shadow: 0 8px 24px rgba(0,0,0,0.3);
```

**Structure:**
```
┌─────────────────────────────────────┐
│ 🧠 Related Memory              [×]  │
│                                      │
│ Earlier you discussed "..." with... │
│ 🏷️ Entity1, Entity2, Entity3       │
│                                      │
│ [   View   ]  [  Dismiss  ]         │
└─────────────────────────────────────┘
```

---

## User Privacy & Performance

### Privacy
- **100% local:** All knowledge stored in browser localStorage
- **No external sync:** Knowledge graph never leaves your device
- **AI analysis:** Uses existing Gemini API (same as other features)
- **Opt-in:** Auto-detection only runs if you have 3+ saved conversations

### Performance
- **Non-blocking extraction:** Runs asynchronously after save
- **Fast matching:** Simple word frequency + substring matching
- **Minimal overhead:** ~100ms for context detection
- **Smart triggers:** Only runs on page load (1x per session)

### Data Size
- **Per conversation:** ~500-1000 bytes of knowledge metadata
- **100 conversations:** ~50-100KB total
- **No cleanup needed:** localStorage has 5-10MB limit

---

## Example Scenarios

### Scenario 1: Technical Troubleshooting
**Past (Week 1):**
- Discussed Docker networking issues with Claude
- Resolved with `--network=host` flag

**Present (Week 4):**
- Start new chat about container connectivity
- Notification: "Earlier you discussed Docker networking with Claude"
- View past solution → Save hours of re-debugging

### Scenario 2: Project Planning
**Past (Month 1):**
- Brainstormed project structure with Gemini
- Decided on microservices architecture

**Present (Month 2):**
- Discuss database design with ChatGPT
- Notification: "Earlier you discussed project architecture with Gemini"
- View to ensure consistency with original decisions

### Scenario 3: Learning Path
**Past:**
- Asked Claude about React hooks (3 conversations)
- Asked Gemini about state management (2 conversations)
- Asked ChatGPT about performance (1 conversation)

**Present:**
- Start new chat about React optimization
- Notification shows connection to performance discussion
- Can trace back through entire learning journey

---

## Advanced Features (Future)

### Phase 2: Knowledge Graph Visualization
```
Visual graph showing:
- Nodes: Conversations (sized by length)
- Edges: Shared entities/themes (thickness = strength)
- Clusters: Related topic groups
- Timeline: Chronological evolution of ideas
```

### Phase 3: Contradiction Tracking
```
Alert when new conversation contradicts past conclusions:
"⚠️ Earlier you decided X, but now discussing Y. Review?"
```

### Phase 4: Multi-hop Connections
```
Current: A ← current chat
            ↑ (matches)
            B ← past conversation

Future:  A ← current
             ↑
             B ← past
             ↑
             C ← earlier (discovered via B)
```

### Phase 5: Export & Backup
```
- Export knowledge graph as JSON
- Import from backup
- Sync across devices (optional cloud storage)
- Share knowledge with team (enterprise feature)
```

---

## Developer Guide

### Adding New Knowledge Fields

```javascript
// 1. Update extraction prompt in extractKnowledge()
const prompt = `...
{
  "entities": [...],
  "themes": [...],
  "conclusions": [...],
  "contradictions": [...],
  "context": "...",
  "newField": ["..."]  // Add here
}`;

// 2. Update knowledge object
const knowledge = {
  // ... existing fields
  newField: Array.isArray(parsed.newField) 
    ? parsed.newField.slice(0, maxItems) 
    : []
};

// 3. Update matching logic in findRelatedConversations()
if (kg.newField && kg.newField.some(...)) {
  score += weight;
}
```

### Customizing Notification UI

```javascript
// In showContextSuggestion()
notification.style.cssText = `
  position: fixed;
  bottom: 80px;           // Distance from avatar
  right: 26px;            // Align with avatar
  width: 320px;           // Fixed width
  background: ...;        // Custom gradient
  // ... other styles
`;
```

### Adjusting Auto-Detection Timing

```javascript
// In initialization code (bottom of file)
setTimeout(async () => {
  await new Promise(r => setTimeout(r, 3000));  // Wait 3s for chat
  // ... detection logic
}, 1000);  // Initial 1s delay
```

**Recommended timings:**
- Fast sites (ChatGPT): 2-3s total delay
- Slow sites (Claude): 4-5s total delay
- API-heavy (Poe): 5-6s total delay

### Testing Knowledge Extraction

```javascript
// In browser console (after scanning a conversation)
const graph = JSON.parse(localStorage['chatbridge:knowledge_graph']);
console.table(graph);

// Test specific conversation
const latest = graph[graph.length - 1];
console.log('Entities:', latest.entities);
console.log('Themes:', latest.themes);
console.log('Context:', latest.context);
```

---

## Troubleshooting

### Issue: No Suggestions Appearing

**Check:**
1. Do you have 3+ scanned conversations?
   ```javascript
   JSON.parse(localStorage['chatbridge:knowledge_graph'] || '[]').length
   ```
2. Is current conversation substantial? (100+ chars in last 5 messages)
3. Did you wait 4+ seconds after page load?
4. Are there actually matching entities/themes?

**Solution:**
- Manually click "Find Connections" to force check
- Enable debug mode: `ChatBridge.enableDebug()`
- Check console for "detectAndSuggestContext" logs

### Issue: Poor Matching Quality

**Symptoms:**
- Irrelevant conversations suggested
- Obvious matches not found

**Solutions:**
1. Adjust scoring weights in `findRelatedConversations()`:
   ```javascript
   score += 3;  // Entity match (increase for stricter)
   score += 2;  // Theme match (decrease if too loose)
   ```

2. Improve extraction prompt:
   ```javascript
   // Add more specific instructions
   "Focus on technical terms and proper nouns"
   "Ignore common words like 'help', 'please', 'thanks'"
   ```

### Issue: Notifications Too Frequent

**Solution:**
```javascript
// Disable auto-detection, keep manual button
// Comment out the setTimeout() block at end of file

// Or increase minimum graph size
if (graph.length >= 10) {  // Instead of 3
  await detectAndSuggestContext();
}
```

---

## API Reference

### Public Functions

#### `extractKnowledge(conversation, conversationId)`
Extract structured knowledge from a conversation.

**Parameters:**
- `conversation` (Array): Normalized message array `[{role, text}, ...]`
- `conversationId` (String): Unique ID (typically timestamp)

**Returns:** `Promise<Object|null>`
```javascript
{
  id: "1729900000123",
  ts: 1729900000123,
  entities: ["..."],
  themes: ["..."],
  conclusions: ["..."],
  contradictions: ["..."],
  context: "..."
}
```

#### `findRelatedConversations(entities, themes, limit)`
Find past conversations related to current context.

**Parameters:**
- `entities` (Array<String>): Entity names to match
- `themes` (Array<String>): Theme keywords to match
- `limit` (Number): Max results (default: 3)

**Returns:** `Promise<Array>`
```javascript
[
  {
    id: "...",
    entities: [...],
    themes: [...],
    score: 8,  // Relevance score
    // ... other knowledge fields
  }
]
```

#### `showContextSuggestion(relatedConvs)`
Display notification with related conversation suggestions.

**Parameters:**
- `relatedConvs` (Array): Results from `findRelatedConversations()`

**Returns:** `void`

**Side effects:**
- Creates DOM notification element
- Auto-removes after 15 seconds
- Removes existing notification if present

#### `detectAndSuggestContext()`
Scan current page context and show suggestions if matches found.

**Returns:** `Promise<void>`

**Flow:**
1. Scan last 5 visible messages
2. Extract frequent words (lightweight)
3. Find related conversations
4. Show notification if matches exist

---

## Metrics & Analytics

### Key Metrics to Track

**Usage:**
- Knowledge extractions per day
- Manual "Find Connections" clicks
- Notification views vs dismissals
- Notification "View" click-through rate

**Quality:**
- Average relevance score of shown suggestions
- User dismissal rate (high = poor matching)
- Time-to-action after viewing related conversation
- Repeat "View" clicks for same conversation (indicates value)

**Performance:**
- Extraction time per conversation
- Context detection latency
- Notification render time
- Knowledge graph size growth

### Recommended Logging

```javascript
// Add to relevant functions
function extractKnowledge(conversation, conversationId) {
  const startTime = performance.now();
  // ... extraction logic
  const duration = performance.now() - startTime;
  console.log(`[Analytics] Knowledge extracted in ${duration}ms`);
}

function showContextSuggestion(relatedConvs) {
  console.log('[Analytics] Showing suggestion', {
    topScore: relatedConvs[0]?.score,
    count: relatedConvs.length
  });
}
```

---

## Changelog

### Version 1.0.0 (October 27, 2025)
- ✅ Initial release
- ✅ Automatic knowledge extraction on scan
- ✅ Manual "Find Connections" button
- ✅ Automatic context detection on page load
- ✅ Beautiful notification UI
- ✅ One-click access to related conversations
- ✅ localStorage-based knowledge graph

### Planned Future Releases

**v1.1.0:**
- [ ] Knowledge graph visualization
- [ ] Advanced filtering options
- [ ] Export/import knowledge graph

**v1.2.0:**
- [ ] Multi-hop connection discovery
- [ ] Contradiction tracking
- [ ] Smart merge for similar entities

**v1.3.0:**
- [ ] Cloud sync (optional)
- [ ] Team collaboration features
- [ ] Enterprise API

---

## Credits

**Concept:** Cross-Context Memory Engine  
**Implementation:** ChatBridge Team  
**AI Partner:** Gemini API (knowledge extraction)  
**Inspiration:** Roam Research, Obsidian, Notion AI

---

**🎉 Congratulations! You now have a personal AI "second brain" that remembers and connects your thoughts across all AI platforms.**

**Next Steps:**
1. Scan 5-10 conversations to build initial knowledge graph
2. Start a new conversation on any platform
3. Watch the magic happen! ✨
