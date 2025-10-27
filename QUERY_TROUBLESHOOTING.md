# Smart Query Troubleshooting Guide

## Issue: Query button not showing results

### Quick Fixes Applied ✅

1. **Added Enter key support** - Now you can press Enter in the search box to execute the query
2. **Better error messages** - The extension now shows helpful messages when:
   - No API key is configured (for AI search)
   - Vector search fails and falls back to basic search
   - No saved conversations exist
   - Filters exclude all results
3. **Improved fallback** - Basic keyword search always works, even without API key

---

## Testing Steps

### 1. Basic Search (No API Key Required)

1. **Reload the extension**:
   - Open `chrome://extensions`
   - Click the refresh icon on ChatBridge
   - Go back to your chat page and refresh

2. **Save some conversations**:
   - Click the ⚡ icon
   - Click "Scan Chat"
   - Verify you see messages in the history
   - This saves the conversation

3. **Test the Query button**:
   - Click "Query" button in sidebar
   - Type a keyword from your saved conversation (e.g., "API", "error", "code")
   - Press Enter OR click "Search"
   - You should see results matching your keyword

### 2. Check Console for Errors

Open the browser console (F12) and look for:

```javascript
// Enable debug mode
ChatBridge.enableDebug()

// Then try your search again
```

Common error messages:
- `no_embedding` = API key not configured (expected, basic search will still work)
- `no-runtime` = Extension connection issue (reload extension)
- `No saved conversations yet` = Need to scan and save chats first

### 3. Verify Data Storage

In console:
```javascript
// Check if you have saved conversations
chrome.runtime.sendMessage({ type: 'get_conversations' }, (r) => {
  console.log('Saved conversations:', r);
});
```

---

## How Search Works

### Basic Search (Always Available)
- **Trigger**: Automatic fallback when AI search unavailable
- **Method**: Simple keyword matching
- **Requirements**: Just saved conversations
- **Message**: "⚠️ AI search unavailable. Using basic search..."

### AI Search (Requires Setup)
- **Trigger**: When API key is configured
- **Method**: Semantic embedding similarity
- **Requirements**: 
  - OpenAI API key in Options
  - Indexed conversations (click "Index all saved chats")
- **Benefit**: Understands meaning, not just exact keywords

---

## Common Issues & Solutions

### "Nothing happens when I click Query"

**Cause**: Extension might not be loaded or sidebar not open

**Fix**:
1. Reload extension: `chrome://extensions` → ChatBridge → Refresh
2. Refresh the chat page (F5)
3. Click the ⚡ avatar to open sidebar
4. Try "Query" button again

---

### "(No saved conversations yet)"

**Cause**: Haven't scanned any conversations

**Fix**:
1. Have a conversation on ChatGPT/Claude/Gemini/etc.
2. Click ⚡ icon → "Scan Chat"
3. Verify messages appear in History
4. Now try Query again

---

### "Type a search query"

**Cause**: Search box is empty

**Fix**: Type something in the search box before clicking Search

---

### "(No matches)"

**Cause**: Your search term doesn't appear in any saved conversations

**Fix**:
- Try a more general keyword
- Check your filters (host, tag, date range)
- Save more conversations first

---

### "⚠️ AI search unavailable"

**Cause**: No OpenAI API key configured (this is OK!)

**Fix**: 
- **Option A**: Continue using basic search (works fine for exact keywords)
- **Option B**: Add API key for better semantic search:
  1. Right-click extension icon → Options
  2. Add OpenAI API key
  3. Click "Index all saved chats"
  4. Now AI search will work

---

## Feature Matrix

| Feature | Basic Search | AI Search |
|---------|--------------|-----------|
| Keyword matching | ✅ Yes | ✅ Yes |
| Semantic understanding | ❌ No | ✅ Yes |
| Requires API key | ❌ No | ✅ Yes |
| Filters (host, tag, date) | ✅ Yes | ✅ Yes |
| Speed | ⚡ Instant | 🐢 ~1-2 seconds |

---

## Debug Commands

Open console (F12) and run:

```javascript
// 1. Enable debug logging
ChatBridge.enableDebug()

// 2. Check current scan
ChatBridge.getLastScan()

// 3. Check saved conversations
chrome.runtime.sendMessage({ type: 'get_conversations' }, (r) => {
  console.log('Total saved:', r.conversations?.length);
  console.table(r.conversations?.slice(0, 5));
});

// 4. Test vector query (requires API key)
chrome.runtime.sendMessage({ 
  type: 'vector_query', 
  payload: { query: 'your search term', topK: 5 } 
}, (r) => {
  console.log('Vector results:', r);
});

// 5. Check for errors
window.ChatBridge._lastError
```

---

## What Changed

### Before:
- ❌ No Enter key support (had to click button)
- ❌ Silent failures (no error messages)
- ❌ Confusing when API key missing
- ❌ No feedback when results are filtered out

### After:
- ✅ Press Enter to search
- ✅ Clear error messages at each step
- ✅ Explains API key requirement
- ✅ Shows count of results found
- ✅ Warns when filters exclude everything
- ✅ Always falls back to basic search

---

## Still Having Issues?

1. **Check extension is loaded**: `chrome://extensions` → ChatBridge should be enabled
2. **Check page is supported**: Only works on ChatGPT, Claude, Gemini, Perplexity, Mistral, Copilot, Poe
3. **Check console for errors**: F12 → Console tab
4. **Try in incognito**: Rules out cache/cookie issues
5. **Reload everything**: Extension, page, browser

---

*Last updated: October 27, 2025*
