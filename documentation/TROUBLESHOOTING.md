# Troubleshooting Guide

## Common Issues

### Extension Not Visible

**Symptoms:** ⚡ avatar doesn't appear on AI platform pages

**Solutions:**
1. **Check site is supported**: See list in [FEATURES.md](FEATURES.md)
2. **Enable Developer Mode**: 
   - Go to `chrome://extensions/`
   - Toggle "Developer mode" (top right)
3. **Reload extension**:
   - Click refresh icon on extension card
4. **Reload page**: Press F5 or Ctrl+R
5. **Check console**: Open DevTools (F12) and look for errors

### Empty or Incomplete Scan

**Symptoms:** Scan returns no messages or misses content

**Solutions:**
1. **Wait for page load**: Ensure all messages are visible
2. **Scroll manually first**: Scroll to top and bottom to load all content
3. **Check for dynamic loading**: Some sites lazy-load; wait a moment
4. **Try manual scroll mode**: In settings, disable auto-scroll
5. **Check adapter**: Open console and verify correct adapter detected

**Debug command:**
```javascript
ChatBridge.getLastScan()
```

### Restore Not Working

**Symptoms:** "Insert to Chat" doesn't paste content

**Solutions:**
1. **Click input first**: Click the chat input box before restoring
2. **Wait for page load**: Ensure target page fully loaded
3. **Check permissions**: Verify extension has scripting permission
4. **Try manual paste**: Copy from scan and paste manually
5. **Check adapter support**: Some sites may need adapter updates

**Debug restore:**
```javascript
ChatBridge.enableDebug()
// Then try restore and check console logs
```

### API Key Issues

**Symptoms:** "No API key" or "API call failed" errors

**Solutions:**
1. **Set key in Options**:
   - Right-click extension → Options
   - Paste Gemini API key → Save
2. **Verify key is valid**: Test at [Google AI Studio](https://makersuite.google.com)
3. **Check rate limits**: Default is 1 req/sec
4. **Clear and re-enter**: Sometimes cache needs refresh
5. **Check console**: Look for specific API error messages

**Note:** Chrome extensions can't read `.env` files. You must use Options page.

### Rate Limiting

**Symptoms:** "Rate limited" errors, requests blocked

**Solutions:**
1. **Wait a moment**: Default allows 1 request/sec with burst of 5
2. **Use personal API key**: Get your own from Google AI Studio
3. **Adjust rate limit** (advanced):
   ```javascript
   // In console
   chrome.storage.local.set({
     chatbridge_config: {
       ratePerSec: 2,  // 2 requests per second
       maxBurst: 10     // Allow burst of 10
     }
   })
   ```

### Keyboard Shortcuts Not Working

**Symptoms:** Ctrl+Shift+S, Ctrl+Shift+H, Ctrl+Shift+I don't work

**Solutions:**
1. **Check for conflicts**: Other extensions may use same shortcuts
2. **Reconfigure shortcuts**:
   - Go to `chrome://extensions/shortcuts`
   - Find ChatBridge and customize
3. **Verify page focus**: Click on page before using shortcuts
4. **Try on different site**: Some sites block keyboard events

### Performance Issues

**Symptoms:** Slow scans, UI lag, browser slowdown

**Solutions:**
1. **Limit message count**: Very long conversations can be slow
2. **Close other tabs**: Reduce browser memory usage
3. **Disable auto-scroll**: Manual scroll is faster
4. **Clear old conversations**: Export and delete old data
5. **Check for memory leaks**: Reload page and extension

**Check extension memory:**
- Go to `chrome://extensions/`
- Enable Developer mode
- Click "background page" link
- Check console for errors

### Translation Issues

**Symptoms:** Translation incomplete, wrong language, errors

**Solutions:**
1. **Verify language selection**: Check target language is correct
2. **Try shorter text**: Very long text may time out
3. **Check API quota**: Gemini API has daily limits
4. **Specify language code**: Use ISO codes (e.g., "es" for Spanish)

### Sync Tone Not Optimal

**Symptoms:** Rewritten prompt doesn't work well with target model

**Solutions:**
1. **Try different length**: Use "comprehensive" for complex topics
2. **Manual adjustment**: Edit output before inserting
3. **Provide context**: Add model-specific notes in prompt
4. **Report feedback**: Help improve the feature

## Debug Mode

Enable detailed logging:

```javascript
// In page console
ChatBridge.enableDebug()

// Scan a conversation
// Check console for detailed logs

// View last scan details
ChatBridge.getLastScan()

// Highlight scanned elements visually
ChatBridge.highlightScan(true)
```

## Background Page Console

For deeper debugging:

1. Go to `chrome://extensions/`
2. Enable Developer mode
3. Find ChatBridge
4. Click "service worker" (or "background page")
5. Console opens with background logs

## Reporting Issues

When reporting bugs, include:

1. **Chrome version**: `chrome://version/`
2. **Extension version**: Check `manifest.json`
3. **Affected site**: Which AI platform
4. **Console logs**: Screenshots of errors
5. **Steps to reproduce**: Exact sequence
6. **Expected vs actual**: What should happen vs what does

## Common Error Messages

### "no_api_key"
→ Set API key in Options page

### "rate_limited"
→ Wait a moment or adjust rate limit config

### "gemini_http_error"
→ Check API key validity and quota

### "restore_timeout"
→ Page took too long to load; try again

### "tab_not_found"
→ Tab was closed before restore completed

### "no_text"
→ Scan captured no content; check site compatibility

## Advanced Diagnostics

### Test background services:

```javascript
chrome.runtime.sendMessage(
  { type: 'self_test' },
  response => console.log(response)
)
```

### Test content script:

```javascript
chrome.runtime.sendMessage(
  { type: 'cs_self_test' },
  response => console.log(response)
)
```

### Check storage:

```javascript
chrome.storage.local.get(null, data => console.log(data))
```

### Clear all data (caution):

```javascript
chrome.storage.local.clear()
localStorage.clear()
```

## Still Having Issues?

1. Check [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) for technical details
2. Open an issue on GitHub with details
3. Include console logs and error messages
