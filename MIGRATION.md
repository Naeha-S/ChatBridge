# Migration Guide: Local API Keys → Cloudflare Worker

## Overview
This guide shows you how to migrate from storing API keys locally to using a secure Cloudflare Worker backend.

---

## Step 1: Deploy Cloudflare Worker (5 minutes)

Follow the instructions in `worker/SETUP.md`:

```bash
# Quick commands:
npm install -g wrangler
wrangler login
cd worker
wrangler secret put AIzaSyDHI3zMNupMAScI9aGVGL_nahrxoqNwMvc        # Paste your Gemini key
wrangler secret put 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'   # Paste your HF key
wrangler deploy
```

You'll get a URL like: `https://chatbridge-api.USERNAME.workers.dev`

---

## Step 2: Update config.js

```javascript
const CONFIG = {
  // Add your worker URL
  WORKER_URL: 'https://chatbridge-api.chatbridgeai.workers.dev', 
  GEMINI_API_KEY: '',
  HUGGINGFACE_API_KEY: '',
};

if (typeof window !== 'undefined') {
  window.CHATBRIDGE_CONFIG = CONFIG;
}
```

---

## Step 3: Add apiClient.js to manifest.json

In `manifest.json`, add `apiClient.js` to content_scripts:

```json
"js": [
  "config.js",
  "apiClient.js",    // ← ADD THIS
  "utils/constants.js",
  ...
]
```

---

## Step 4: Update API Calls in background.js

### Find and replace Gemini calls:

**BEFORE:**
```javascript
const apiKey = await getGeminiApiKey();
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [...] })
  }
);
```

**AFTER:**
```javascript
const response = await window.apiClient.callGemini({
  model: 'gemini-1.5-flash',
  contents: [...],
  generationConfig: {}
});
```

### Find and replace Llama calls:

**BEFORE:**
```javascript
const apiKey = await getHuggingFaceApiKey();
const response = await fetch(
  'https://api-inference.huggingface.co/models/meta-llama/Meta-Llama-3-8B-Instruct',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ inputs: "..." })
  }
);
```

**AFTER:**
```javascript
const response = await window.apiClient.callLlama({
  inputs: "...",
  parameters: { max_new_tokens: 500 }
});
```

---

## Step 5: Test the Integration

1. Reload your extension
2. Open DevTools (F12) and check console for errors
3. Try using a feature that calls Gemini or Llama
4. Verify in Cloudflare dashboard that requests are going through

---

## Step 6: Clean Up (IMPORTANT!)

### Remove old API keys from Git history:

```bash
# Install BFG Repo Cleaner
# Download from: https://rtyley.github.io/bfg-repo-cleaner/

# Remove sensitive strings from all commits
bfg --replace-text passwords.txt

# passwords.txt should contain:
# AIzaSyDHI3zMNupMAScI9aGVGL_nahrxoqNwMvc
# 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
```

### Or use GitHub's approach:
1. Go to your repo settings
2. Navigate to "Security" → "Secret scanning"
3. Revoke the detected secrets
4. Generate new API keys
5. Update Cloudflare Worker secrets: `wrangler secret put KEY_NAME`

---

## Verification Checklist

- [ ] Worker deployed and accessible
- [ ] `config.js` updated with WORKER_URL
- [ ] `apiClient.js` added to manifest
- [ ] All Gemini calls use `apiClient.callGemini()`
- [ ] All Llama calls use `apiClient.callLlama()`
- [ ] Extension reloaded and tested
- [ ] Old API keys invalidated
- [ ] New API keys added to Cloudflare
- [ ] Local `config.js` has empty API key strings

---

## Rollback Plan (if something breaks)

1. **Revert config.js:**
   ```javascript
   const CONFIG = {
     WORKER_URL: '',  // Empty to disable worker
     GEMINI_API_KEY: 'YOUR_KEY',
     HUGGINGFACE_API_KEY: 'YOUR_KEY',
   };
   ```

2. **Reload extension** - it will fall back to direct API calls

3. **Debug worker** - Check Cloudflare dashboard logs

---

## Benefits After Migration

✅ **No exposed API keys** - Keys never leave Cloudflare  
✅ **Easier key rotation** - Just update worker secrets  
✅ **Better security** - Can't be extracted from extension  
✅ **Rate limiting** - Add worker-side rate limiting if needed  
✅ **Analytics** - Track usage in Cloudflare dashboard  
✅ **Free tier** - 100,000 requests/day on Cloudflare free plan

---

## Support

**Worker not responding?**
- Check: `wrangler tail` for logs
- Test: `curl https://YOUR-WORKER.workers.dev/health`

**API calls failing?**
- Verify secrets are set: `wrangler secret list`
- Check CORS headers in worker response

**Extension errors?**
- Open DevTools console
- Look for `[APIClient]` log messages
