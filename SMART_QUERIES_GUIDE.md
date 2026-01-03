# Smart Queries v3.0 - Visual Guide & Usage

## 🎯 Main Interface Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ 🧠 Smart Assistant  [📋]     [Current Chat] [Search Memory]     │
├────────┬────────────────────────────────────────────────────────┤
│        │                                                         │
│ 📋     │  ✨ Suggestion Chips (Memory Mode)                      │
│History │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│        │  │What were key │ │Where was I   │ │How did my    │   │
│        │  │decisions?    │ │stuck?        │ │understanding │   │
│        │  └──────────────┘ └──────────────┘ └──────────────┘   │
│        │                                                         │
│ Items: │  ┌───────────────────────────────────────────────────┐ │
│        │  │ [Search across memories...]                    ⚙️   │ │
│        │  │ ┌────────────────────────────┐                      │ │
│        │  │ │                            │  [Clear] [Search] ✨  │ │
│        │  │ └────────────────────────────┘                      │ │
│        │  └───────────────────────────────────────────────────┘ │
│        │                                                         │
│ Recent │  ┌─ ⚙️ Filters (Expanded) ──────────────────────────┐ │
│ Queries│  │ Sort: [Relevance ▼]  Date: [--] — [--]           │ │
│        │  └──────────────────────────────────────────────────┘ │
│        │                                                         │
│ • What │  ┌─ ✨ Synthesis ───────────────────────────────────┐ │
│  were  │  │ AI Answer                                [📋Copy] │ │
│  key   │  │                                                   │ │
│  points│  │ Summary of search results and synthesis here...  │ │
│        │  │ With key insights and findings.                 │ │
│        │  └───────────────────────────────────────────────────┘ │
│ • How  │                                                         │
│  to    │  Found 15 Segments                    (Page 1 / 2)    │
│  scale │                                                         │
│        │  ┌────────────────────────────────────────────────────┐ │
│ • What │  │ [92% Match]  [Jan 15, 2026]              [▼ More]  │ │
│  about │  │ You: Architecture scaling question...            │ │
│  API   │  │ AI: Here's how to approach scaling...            │ │
│        │  └────────────────────────────────────────────────────┘ │
│        │                                                         │
│ (✕)    │  ┌────────────────────────────────────────────────────┐ │
│        │  │ [85% Match]  [Jan 14, 2026]              [▼ More]  │ │
│        │  │ You: Database optimization techniques...          │ │
│        │  │ AI: Optimization involves indexing and...        │ │
│        │  └────────────────────────────────────────────────────┘ │
│        │                                                         │
│        │  ┌─ Pagination ────────────────────────────────────┐   │
│        │  │ [← Previous]  Page 1 / 2  [Next →]              │   │
│        │  └────────────────────────────────────────────────┘   │
│        │                                                         │
└────────┴────────────────────────────────────────────────────────┘
```

## 🎮 Feature Interactions

### 1. Query History (Left Sidebar)
```
[📋 History]
├─ Recent query... (2m ago)
├─ Another search... (15m ago)
├─ Earlier question... (1h ago)
└─ [✕] Close sidebar
```
- **Click any item** → Restores query to textarea
- **Auto-scroll** when sidebar is open
- **Timestamp display** (e.g., "5m ago", "2h ago")

### 2. Smart Suggestions (Memory Mode)
```
┌─ Suggestion Chips ─────────────────────────┐
│ [What were the key decisions?]             │
│ [Where was I stuck?]                       │
│ [How did my understanding evolve?]         │
│ [What were the main topics?]               │
└────────────────────────────────────────────┘
```
- **Click any chip** → Fills textarea and executes search
- **Context-aware** - appears only in Memory mode
- **Pre-written** for common queries

### 3. Advanced Filters
```
┌─ Filters Panel ──────────────────────────────┐
│ Sort: [Relevance ▼]                          │
│ Date Range: [YYYY-MM-DD] — [YYYY-MM-DD]     │
└──────────────────────────────────────────────┘
```
- **Click ⚙️ icon** → Toggle filters panel
- **Sort options**: Relevance, Most Recent, Oldest
- **Date filtering**: Optional (leave blank to skip)
- **Real-time** application to results

### 4. Result Previews (Expandable)
```
COLLAPSED:
┌─────────────────────────────────────────┐
│ [92% Match]  [Jan 15, 2026]    [▼ More] │
│ You: Question about architecture...     │
│ AI: Here's how to approach it...        │
└─────────────────────────────────────────┘

EXPANDED (after clicking [▼ More]):
┌─────────────────────────────────────────┐
│ [92% Match]  [Jan 15, 2026]    [▲ Less] │
│                                          │
│ You: Question about architecture        │
│ scaling and performance...               │
│                                          │
│ AI: Here's how to approach it. First,   │
│ consider your current bottlenecks...    │
│                                          │
│ [Additional context and full text...]   │
└─────────────────────────────────────────┘
```

### 5. Pagination
```
At bottom of results:
┌──────────────────────────────────┐
│ [← Previous]  Page 1 / 5  [Next →] │
└──────────────────────────────────┘
```
- **Navigate** through large result sets
- **Disabled** when at first/last page
- **Page indicator** shows current position

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` / `Cmd+K` | Focus query input field |
| `Ctrl+Enter` / `Cmd+Enter` | Submit query (from textarea) |
| `Escape` | Close history sidebar |
| `Tab` | Navigate between controls |

## 🎨 Visual States

### Loading State
```
┌─ Results Area ─────────┐
│                         │
│     ◐ (spinning)        │
│   Scanning memories...   │
│                         │
└─────────────────────────┘
```

### Error State
```
┌─ Results Area ─────────┐
│                         │
│  ⚠️  Error: Connection  │
│      timeout. Please    │
│      try again.         │
│                         │
└─────────────────────────┘
```

### Empty State
```
┌─ Results Area ─────────┐
│                         │
│  No relevant memories   │
│  found for your query.  │
│                         │
└─────────────────────────┘
```

## 🌙 Dark Mode

- **Toggle**: Click 🌙 button in demo page
- **Auto-applies**: `.cb-theme-dark` class
- **Full support**: All colors inverted
- **Smooth transition**: CSS-based theme switching

```
Light Mode:
- Background: #f3f4f6 (light gray)
- Cards: #ffffff (white)
- Text: #1f2937 (dark gray)
- Accents: #3b82f6 (blue)

Dark Mode:
- Background: #111827 (very dark)
- Cards: #1f2937 (dark gray)
- Text: #f3f4f6 (light gray)
- Accents: #60a5fa (light blue)
```

## 📱 Responsive Behavior

- **Desktop (1200px+)**: Full sidebar visible, all controls visible
- **Tablet (768px-1199px)**: Sidebar can be toggled, controls stack vertically
- **Mobile (< 768px)**: Sidebar hidden by default, full-width interface

## 💾 Data Persistence

### Query History (localStorage)
- **Key**: `sq-query-history`
- **Format**: JSON array of query objects
- **Limit**: 50 most recent queries
- **Survives**: Browser restart

### Saved Searches (localStorage)
- **Key**: `sq-saved-searches`
- **Format**: JSON array of saved search objects
- **Persists**: Across sessions

### Theme Preference
- **Key**: `sq-theme-dark`
- **Value**: `true` (dark) or `false` (light)

## 🎯 Usage Workflows

### Workflow 1: Quick Question
1. Type question in textarea
2. Press `Ctrl+Enter` or click [Ask AI]
3. View synthesis result
4. Copy answer if needed

### Workflow 2: Memory Search with Filters
1. Switch to "Search Memory" tab
2. Click ⚙️ to open filters
3. Set date range or sort order
4. Type search query
5. Click [Search Memory]
6. Browse results, expand as needed
7. Use pagination for more results

### Workflow 3: Restore Previous Query
1. Click 📋 history button
2. Click any previous query
3. Textarea auto-fills
4. Modify if needed
5. Press Enter or click Ask

## 🔍 Search Examples

**Current Chat Mode**:
- "Summarize what we discussed"
- "What were the key points?"
- "What decisions were made?"

**Memory Search Mode**:
- "How do I implement authentication?"
- "What about caching strategies?"
- "Explain the architecture"
- "Database optimization tips"

## ♿ Accessibility Features

- **Screen readers** announce loading/results via ARIA live regions
- **Keyboard navigation** with Tab through all controls
- **Focus indicators** visible on all interactive elements
- **High contrast** text for readability
- **Semantic HTML** for proper structure
- **Status announcements** for async operations

## 🚀 Performance Tips

1. **Filters first**: Narrow results before viewing
2. **Use pagination**: Don't load all results at once
3. **Synthesis**: Generates async, doesn't block interface
4. **History**: Managed automatically, no manual cleanup needed
5. **Storage**: Clears old entries, maintains 50-query limit

---

**Quick Start**: Open `smartQueries.html` and start experimenting! 🎉
