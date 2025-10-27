# Storage Sync Fix - Migration Guide

## Issue Fixed
Scanned conversations were saving to `localStorage` (page-local) but the sidebar was reading from `chrome.storage.local` (extension-wide), causing a mismatch where saved conversations wouldn't appear in the dropdown, preview, or history.

## What Changed

### Before:
- ❌ `saveConversation()` → localStorage only
- ❌ `loadConversationsAsync()` → chrome.storage.local (didn't match!)
- ❌ Saved chats invisible in sidebar
- ❌ Data lost on page navigation

### After:
- ✅ `saveConversation()` → **BOTH** localStorage AND chrome.storage.local
- ✅ `loadConversationsAsync()` → chrome.storage.local first, then localStorage fallback
- ✅ All saved chats visible immediately
- ✅ Data persists across page navigation

## Migration Steps

### For Fresh Start (Recommended)

1. **Reload the extension**:
   ```
   chrome://extensions → ChatBridge → Refresh icon
   ```

2. **Refresh your chat page** (F5)

3. **Test the fix**:
   - Click ⚡ icon → "Scan Chat"
   - You should see: "Saved X messages" toast
   - Check sidebar immediately:
     - Dropdown should show the chat
     - History should display it
     - Preview should show first message

### If You Have Existing Data in localStorage

If you scanned chats before this fix and want to migrate them:

**Option A: Manual Re-scan (Easiest)**
1. Go back to each conversation
2. Click "Scan Chat" again
3. It will save to both storage locations now

**Option B: Console Migration Script**
1. Open browser console (F12)
2. Paste and run this script:

```javascript
(async function migrateLocalStorageToChrome() {
  try {
    const key = 'chatbridge:conversations';
    
    // Get data from localStorage
    const localData = JSON.parse(localStorage.getItem(key) || '[]');
    console.log('Found in localStorage:', localData.length, 'conversations');
    
    if (localData.length === 0) {
      console.log('Nothing to migrate!');
      return;
    }
    
    // Get existing data from chrome.storage.local
    chrome.storage.local.get([key], (result) => {
      const chromeData = Array.isArray(result[key]) ? result[key] : [];
      console.log('Found in chrome.storage.local:', chromeData.length, 'conversations');
      
      // Merge and deduplicate by timestamp
      const merged = [...chromeData];
      const existingIds = new Set(chromeData.map(c => String(c.ts)));
      
      let added = 0;
      for (const conv of localData) {
        const id = String(conv.ts);
        if (!existingIds.has(id)) {
          merged.push(conv);
          existingIds.add(id);
          added++;
        }
      }
      
      // Save merged data
      chrome.storage.local.set({ [key]: merged }, () => {
        console.log('✅ Migration complete!');
        console.log('- Added:', added, 'new conversations');
        console.log('- Total in chrome.storage.local:', merged.length);
        console.log('Refresh the page to see all conversations in sidebar.');
      });
    });
  } catch (e) {
    console.error('Migration failed:', e);
  }
})();
```

3. Refresh the page (F5)
4. Check sidebar - all conversations should appear now

## Verification

After the fix, verify everything works:

### 1. Save Test
```javascript
// In console:
ChatBridge.enableDebug();
// Then click "Scan Chat" and watch console for:
// "saved to localStorage"
// "saved to chrome.storage.local"
```

### 2. Load Test
```javascript
// Check both storage locations:
console.log('localStorage:', JSON.parse(localStorage.getItem('chatbridge:conversations') || '[]').length);
chrome.storage.local.get(['chatbridge:conversations'], (d) => {
  console.log('chrome.storage.local:', d['chatbridge:conversations']?.length || 0);
});
```

### 3. Display Test
- Click ⚡ icon
- Check dropdown: Should show "hostname • X msgs • time"
- Check History section: Should list recent chats
- Check Preview: Should show first message of latest chat

## Technical Details

### Storage Location Hierarchy

1. **IndexedDB** (`convDb`) - Background persistent storage for embeddings
2. **chrome.storage.local** - Extension-wide, survives navigation ✅ **Now used**
3. **localStorage** - Page-local, lost on navigation ❌ **Old behavior**

### Functions Updated

| Function | Change |
|----------|--------|
| `saveConversation()` | Now saves to both localStorage AND chrome.storage.local |
| `loadConversationsAsync()` | Prefers chrome.storage.local, falls back to localStorage |
| `btnClearHistory` handler | Clears both storage locations |
| Topic update after extraction | Updates both storage locations |

### Message Flow

```
Scan Chat
    ↓
saveConversation(conv)
    ↓
├─→ localStorage.setItem() ✅
└─→ chrome.storage.local.set() ✅
    ↓
Extract topics (async)
    ↓
Update both storages with topics ✅
    ↓
refreshHistory()
    ↓
loadConversationsAsync()
    ↓
├─→ Try: background get_conversations
├─→ Fallback: chrome.storage.local ✅
└─→ Last resort: localStorage
    ↓
Display in dropdown/history/preview ✅
```

## Troubleshooting

### "Still not showing after fix"

1. **Hard refresh**: Ctrl+Shift+R
2. **Check console for errors**: F12 → Console tab
3. **Clear extension cache**:
   ```
   chrome://extensions → ChatBridge → Remove → Re-add
   ```
4. **Verify data exists**:
   ```javascript
   chrome.storage.local.get(['chatbridge:conversations'], console.log);
   ```

### "Getting duplicates"

This can happen if you run the migration script multiple times. To clean up:

```javascript
chrome.storage.local.get(['chatbridge:conversations'], (data) => {
  const convs = data['chatbridge:conversations'] || [];
  const seen = new Set();
  const unique = convs.filter(c => {
    const id = String(c.ts);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  chrome.storage.local.set({ 'chatbridge:conversations': unique }, () => {
    console.log('Removed', convs.length - unique.length, 'duplicates');
  });
});
```

### "Data disappeared"

Check if background handler is working:

```javascript
chrome.runtime.sendMessage({ type: 'get_conversations' }, (r) => {
  console.log('Background response:', r);
  console.log('Total conversations:', r?.conversations?.length || 0);
});
```

## Performance Impact

- **Memory**: ~2-5KB per conversation (stored twice now, negligible)
- **Speed**: No noticeable difference (both are fast synchronous/async operations)
- **Reliability**: ✅ Much better (chrome.storage.local persists across navigations)

---

*Fixed: October 27, 2025*
