# ChatBridge Debugging Guide

## Quick Debug Commands

Open the browser console (F12) on any approved site and use these commands:

### Enable Debug Mode
```javascript
ChatBridge.enableDebug()
```
Then reload the page to see detailed scan logs.

### Disable Debug Mode
```javascript
ChatBridge.disableDebug()
```

### View Last Scan Info
```javascript
ChatBridge.getLastScan()
```
This shows:
- Adapter used
- Container detected
- Number of nodes considered
- Any errors that occurred
- Container dimensions

### Enable Visual Highlighting
```javascript
ChatBridge.highlightScan(true)
```
This will visually highlight detected message nodes on the page.

### Disable Visual Highlighting
```javascript
ChatBridge.disableDebug()
```

### Manual Scan
```javascript
await ChatBridge.scanChat()
```

## Common Issues and Solutions

### Issue: "No messages found"

**Check 1: View scan details**
```javascript
ChatBridge.getLastScan()
```
Look for:
- `errors` array - lists what went wrong
- `adapterId` - which adapter was detected (e.g., "chatgpt", "claude", "gemini")
- `nodesConsidered` - how many DOM nodes were examined
- `messageCount` - how many messages were extracted

**Check 2: Enable debug mode**
```javascript
ChatBridge.enableDebug()
```
Reload the page and click Scan again. Watch the console for detailed logs:
- `=== SCAN START ===` - begins scan
- `adapter detected:` - which site adapter matched
- `input element found:` - whether chat input was located
- `container from...` - how the message container was detected
- `querySelectorAll found: X nodes` - raw node count
- `after filterCandidateNodes: X nodes` - filtered node count
- `=== SCAN COMPLETE ===` - final message count

**Check 3: Test different adapters**
If the site adapter isn't working, try forcing the generic adapter:
```javascript
// Temporarily disable site adapter
window.pickAdapter = () => window.AdapterGeneric
await ChatBridge.scanChat()
```

### Issue: Messages cut off or incomplete

**Solution 1: Check container width**
```javascript
ChatBridge.getLastScan().containerWidth
```
If < 400px, the scan may have selected a sidebar instead of the main chat.

**Solution 2: Scroll manually first**
Scroll to the top of the conversation manually, wait 2 seconds, then click Scan.

**Solution 3: Check for lazy loading**
Some sites lazy-load old messages. Scroll through the full conversation first to load all messages into the DOM.

### Issue: Wrong messages or UI elements captured

**Solution: Enable highlighting to see what's being detected**
```javascript
ChatBridge.highlightScan(true)
```
Click Scan. Detected nodes will be highlighted in yellow/green. If you see UI elements highlighted:
1. Note the class names/IDs of the UI elements
2. Report them so filters can be improved

### Issue: Scan takes too long or times out

**Check: View errors**
```javascript
ChatBridge.getLastScan().errors
```
Look for:
- `scroll_failed` - scrolling encountered an error
- `stability_timeout` - DOM took too long to stabilize
- `adapter_failed` - site-specific adapter crashed

These errors don't stop the scan, but indicate something unusual happened.

## Error Messages Explained

### `adapter_failed: ...`
The site-specific adapter (e.g., ChatGPT, Claude) threw an error. The scan will fall back to the generic adapter.

### `generic_adapter_failed: ...`
Both the site adapter and generic adapter failed. The scan will try manual node extraction.

### `scroll_failed: ...`
Couldn't scroll to the top of the conversation. This may mean some old messages were missed.

### `stability_timeout: ...`
The DOM kept changing and never stabilized within 8 seconds. The scan proceeded anyway but may have missed dynamically loaded content.

### `fatal: ...`
A critical error that stopped the scan completely. This is rare and indicates a serious bug.

## Site-Specific Tips

### ChatGPT (chat.openai.com, chatgpt.com)
- Works best on full conversations
- Regenerated responses may be duplicated
- Code blocks are included in the scan

### Claude (claude.ai)
- Conversation must be fully scrolled to load all messages
- Artifacts (code, documents) are included
- Works with both Claude 3 and earlier versions

### Gemini (gemini.google.com)
- Recent redesigns may cause issues
- Try scrolling manually first
- Multi-turn conversations work best

### Perplexity, Poe, Mistral, etc.
- These use simpler adapters
- If failing, enable debug mode and report the `adapterId` and `nodesConsidered`

## Reporting Issues

When reporting scan issues, please include:

1. **Site and URL** (e.g., "ChatGPT at chat.openai.com")

2. **Last scan info**:
```javascript
JSON.stringify(ChatBridge.getLastScan(), null, 2)
```

3. **Console errors** (from debug mode)

4. **Screenshot** (with highlighting enabled if possible)

## Advanced: Adapter Development

To test a custom adapter:
```javascript
window.SiteAdapters.push({
  id: "mysite",
  label: "My Custom Site",
  detect: () => location.hostname.includes("mysite.com"),
  scrollContainer: () => document.querySelector('.chat-container'),
  getMessages: () => {
    // Return array of {role: 'user'|'assistant', text: '...'}
    return [];
  },
  getInput: () => document.querySelector('textarea')
});
```

Then reload and scan to test your adapter.
