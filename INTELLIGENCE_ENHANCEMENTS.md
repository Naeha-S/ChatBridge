# Intelligence Enhancements - ChatBridge

## Overview

ChatBridge now includes advanced intelligence features for smarter context detection, conversation analysis, and relationship discovery.

## Features Implemented

### 1. Sliding Window Context Detection

**Purpose**: Analyze active conversation context with configurable window size and overlap.

**How it works**:
- Examines the most recent N messages (default: 8)
- Extracts entities, themes, and keywords from the active window
- Calculates confidence based on:
  - Keyword variety (unique words / total words)
  - Keyword density (keywords per message)
- Minimum confidence threshold: 40%

**Code location**: `detectActiveContext(messages, windowSize, minConfidence)`

**Example**:
```javascript
const msgs = await ChatBridge.scanChat();
const context = detectActiveContext(msgs, 8, 40);
console.log(context);
// {
//   entities: ['React', 'API', 'Node'],
//   themes: ['components', 'hooks', 'state'],
//   keywords: [...],
//   confidence: 78,
//   messageCount: 8,
//   variety: 65
// }
```

---

### 2. Conversation Segmentation

**Purpose**: Automatically detect topic changes within long conversations.

**How it works**:
- Uses overlapping sliding windows (default: 5 messages, 50% overlap)
- Calculates topic shift using Jaccard distance between keyword sets
- Shift score > 0.5 = new topic detected
- Auto-labels each segment with most frequent keyword

**Code location**: `segmentConversation(messages, windowSize, overlapRatio)`

**Example**:
```javascript
await ChatBridge.showSegments();
// Console output:
// ┌─────────┬─────────┬──────────┬───────┬────────────┬──────────────────────────────┐
// │ segment │ topic   │ messages │ count │ confidence │ keywords                     │
// ├─────────┼─────────┼──────────┼───────┼────────────┼──────────────────────────────┤
// │ 1       │ React   │ 0-8      │ 8     │ 85%        │ react, components, hooks     │
// │ 2       │ API     │ 8-15     │ 7     │ 72%        │ api, fetch, endpoint         │
// │ 3       │ Testing │ 15-22    │ 7     │ 68%        │ testing, jest, coverage      │
// └─────────┴─────────┴──────────┴───────┴────────────┴──────────────────────────────┘
```

---

### 3. Confidence Scoring

**Purpose**: Rank related conversation suggestions with explainable scores.

**Scoring algorithm**:
```
Entity matches:
  - Exact match: +5 points
  - Partial match: +3 points

Theme matches:
  - Exact match: +4 points
  - Partial match: +2 points

Recency bonus:
  - Linear decay over 30 days: +0 to +2 points

Confidence = (score / maxPossibleScore) * 100
```

**Minimum threshold**: 30% confidence to show suggestion

**Visual indicators**:
- 🟢 Green (≥70%): High confidence match
- 🟠 Orange (≥50%): Medium confidence match
- ⚪ Gray (<50%): Low confidence match

**Code location**: `findRelatedConversations(entities, themes, limit)`

---

### 4. Enhanced Knowledge Extraction

**Improvements**:
- Segments conversation before knowledge extraction
- Stores segment metadata (topics, keywords, confidence)
- Better topic matching using segment data
- Hover over suggestion cards to see match details

**Stored metadata**:
```javascript
{
  entities: [...],
  themes: [...],
  segments: [
    { topic: 'React', keywords: [...], confidence: 85 },
    { topic: 'API', keywords: [...], confidence: 72 }
  ],
  segmentCount: 2
}
```

---

## Debug Tools

### Full Context Analysis
```javascript
const analysis = await ChatBridge.analyzeContext();
```

**Output**:
- Total message count
- Number of segments detected
- Table view of segments with topics, confidence, keywords
- Active context window details

### Segment Visualization
```javascript
await ChatBridge.showSegments();
```

**Output**:
- Console table showing all detected segments
- Toast notification with segment count

### Enable Debug Logging
```javascript
ChatBridge.enableDebug();
```

Then refresh and rescan to see detailed logs for:
- Context detection
- Segmentation process
- Confidence calculations
- Match scoring

---

## User Experience Enhancements

### Related Conversation Cards

Each suggestion card now shows:
1. **Platform name** (e.g., "ChatGPT", "Claude")
2. **Confidence score** with color-coded indicator
3. **Context summary** (first 100 chars)
4. **Entity tags** (up to 4)
5. **Theme indicators** (up to 3)
6. **Segment info** (if multi-topic conversation)
7. **Match details** (on hover) - shows which entities/themes matched

### Auto-Detection

The system automatically runs context detection:
- On page load (3 second delay)
- Only if knowledge graph has ≥3 entries
- Uses sliding window to analyze recent messages
- Shows notification if high-confidence matches found

---

## Configuration

### Adjust Window Size
```javascript
// Larger window = more context, slower topic detection
const context = detectActiveContext(msgs, 12, 40);

// Smaller window = faster topic shifts, less context
const context = detectActiveContext(msgs, 5, 40);
```

### Adjust Segmentation Sensitivity
```javascript
// More sensitive (smaller windows, more segments)
const segments = segmentConversation(msgs, 3, 0.3);

// Less sensitive (larger windows, fewer segments)
const segments = segmentConversation(msgs, 8, 0.7);
```

### Adjust Confidence Threshold
```javascript
// Stricter (only high-confidence matches)
const related = await findRelatedConversations(entities, themes, 3);
// Then filter: related.filter(r => r.confidence >= 70)

// More lenient (show more matches)
// Default threshold is 30%
```

---

## Performance Characteristics

- **Sliding window**: O(n) where n = message count
- **Segmentation**: O(n × w) where w = window size
- **Context detection**: ~10-50ms for typical conversations
- **Confidence scoring**: ~5-20ms per stored conversation
- **Memory overhead**: ~2KB per conversation segment

---

## Future Enhancements

Potential improvements:
1. **Semantic embeddings** for better topic matching
2. **Time-based segmentation** (detect conversation pauses)
3. **Multi-language support** in keyword extraction
4. **User feedback loop** to improve confidence scoring
5. **Topic clustering** across multiple conversations
6. **Contradiction detection** between segments

---

## Testing Checklist

- [ ] Have a multi-topic conversation (e.g., discuss React, then APIs, then testing)
- [ ] Run `ChatBridge.showSegments()` to verify topic detection
- [ ] Run `ChatBridge.analyzeContext()` to check active context
- [ ] Scan the conversation to save it
- [ ] Start a new related conversation
- [ ] Click "Find Connections" button
- [ ] Verify confidence scores are displayed
- [ ] Hover over cards to see match details
- [ ] Check that segment info shows for multi-topic conversations
- [ ] Verify color coding: green ≥70%, orange ≥50%, gray <50%

---

## Troubleshooting

**No segments detected**:
- Conversation may be too short (< 5 messages)
- Topic may be too consistent (no keyword shifts)
- Try adjusting window size or overlap ratio

**Low confidence scores**:
- Not enough entity/theme overlap
- Conversations may be truly unrelated
- Try having more similar discussions

**No context detected**:
- Active window may have low variety/density
- Increase window size or lower confidence threshold
- Ensure conversation has technical terms/proper nouns

**Suggestions not appearing**:
- Check if knowledge graph has ≥3 entries
- Verify current conversation has ≥2 messages
- Check console for errors with `ChatBridge.enableDebug()`

---

## Technical Details

### Keyword Extraction
- Filters stop words (common words like "the", "and", "for")
- Requires minimum word length of 4 characters
- Ranks by frequency
- Returns top N keywords

### Entity Extraction
- Pattern-based detection of capitalized phrases
- Filters common sentence-starting words
- Detects technical acronyms (API, SDK, JSON, etc.)
- Deduplicates and normalizes to lowercase

### Jaccard Distance
```javascript
distance = 1 - (intersection_size / union_size)
```
- 0.0 = identical keyword sets
- 1.0 = completely different sets
- Threshold 0.5 for new topic detection

### Confidence Calculation
```javascript
confidence = (actualScore / maxPossibleScore) × 100
maxPossibleScore = (entities × 5) + (themes × 4) + 2
```

---

*Last updated: October 27, 2025*
