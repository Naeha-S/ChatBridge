# ChatBridge Vercel Deployment Checklist

## Quick Start (5 Minutes)

### Step 1: Deploy to Vercel
```powershell
# Navigate to your project
cd "C:\Users\nehas\OneDrive\Desktop\ChatBridge"

# Initialize git if not already done
git init
git add .
git commit -m "Initial commit with Vercel proxy"

# Push to GitHub (replace with your repo)
# git remote add origin https://github.com/yourusername/ChatBridge.git
# git push -u origin main

# Or use Vercel CLI
npx vercel
```

### Step 2: Set Environment Variables in Vercel
Go to your Vercel dashboard → Project Settings → Environment Variables:

1. **GEMINI_API_KEY**
   - Value: `AIzaSyDH7q1lOI8grDht1H-WHNtsyptIiSrgogQ`
   - Environment: Production, Preview, Development

2. **EXT_SECRET** (or **EXT_KEY**)
   - Value: Generate a random string (e.g., `cb-secret-2024-xyz789`)
   - Command: `[guid]::NewGuid().ToString()` (PowerShell)
   - Environment: Production, Preview, Development

3. **NODE_ENV** (optional)
   - Value: `production`

### Step 3: Get Your Deployment URL
After deployment, Vercel will give you a URL like:
```
https://your-project-name.vercel.app
```

### Step 4: Update Extension Configuration
Open `background.js` and update these constants (lines ~290-295):

```javascript
// Vercel Proxy Configuration (fill after deployment)
// If your Vercel project Root Directory is './':
const VERCEL_PROXY_URL = 'https://your-project-name.vercel.app/api/gemini';
// If you set Root Directory to 'api/':
// const VERCEL_PROXY_URL = 'https://your-project-name.vercel.app/gemini';
const VERCEL_EXT_SECRET = 'your-secret-here'; // Same as EXT_SECRET or EXT_KEY in Vercel
```

### Step 5: Test the Extension
```powershell
# Test from PowerShell
$headers = @{
    'Content-Type' = 'application/json'
    'x-ext-secret' = 'your-secret-here'
}
$body = @{
    endpoint = 'https://generativelanguage.googleapis.com/v1/models/text-embedding-004:embedContent'
    body = @{
        model = 'models/text-embedding-004'
        content = @{
            parts = @(@{ text = 'Hello world' })
        }
    }
    method = 'POST'
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri 'https://your-project-name.vercel.app/api/gemini' `
    -Method POST `
    -Headers $headers `
    -Body $body
```

### Step 6: Reload Extension
1. Go to `chrome://extensions/`
2. Click "Reload" on ChatBridge
3. Navigate to any AI chat site (ChatGPT, Claude, etc.)
4. Click the ⚡ icon → Test "Summarize" or "Rewrite"

---

## Verification Checklist

- [ ] Vercel project deployed successfully
- [ ] Environment variables set (GEMINI_API_KEY, EXT_SECRET)
- [ ] VERCEL_PROXY_URL updated in background.js
- [ ] VERCEL_EXT_SECRET updated in background.js
- [ ] Extension reloaded in Chrome
- [ ] Test: Summarize works without errors
- [ ] Test: Rewrite works without errors
- [ ] Test: Translate works without errors
- [ ] Test: Sync Tone works without errors
- [ ] Console shows no "no_api_key" errors
- [ ] Console shows successful proxy calls

---

## Post-Deployment Security

### Rotate Your API Key (Recommended)
Your old key `AIzaSyDH7q1lOI8grDht1H-WHNtsyptIiSrgogQ` is now visible in git history.

1. **Generate new key:**
   - Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Create new API key
   - Copy the new key

2. **Update Vercel:**
   - Go to Vercel Dashboard → Settings → Environment Variables
   - Edit GEMINI_API_KEY
   - Paste new key
   - Redeploy: `npx vercel --prod`

3. **Delete old key:**
   - Go back to Google AI Studio
   - Delete the old key `AIzaSyDH7q...`

---

## Troubleshooting

### "Rate limited" errors
- Check Vercel function logs: `npx vercel logs`
- Verify x-ext-secret header matches

### "no_api_key" errors
- VERCEL_PROXY_URL is empty → proxy not configured, falls back to direct call
- DEV_HARDCODED_GEMINI_KEY is empty → no fallback available
- **Solution:** Complete Step 4 above

### "Invalid secret" errors
- x-ext-secret header doesn't match Vercel EXT_SECRET env var
- Check typos in VERCEL_EXT_SECRET in background.js

### Extension works locally but not after deployment
- Clear extension data: Chrome → Settings → Privacy → Clear browsing data → Cached images and files
- Hard reload: Ctrl+Shift+R
- Check console for CORS errors

### Vercel function timeout
- Default: 10 seconds for hobby plan
- Upgrade to Pro for 60 seconds
- Or optimize prompts to be shorter

---

## Files Modified in This Deployment

### New Files (Deploy these to Vercel)
- `api/gemini.js` - Serverless function
- `package.json` - Node.js config
- `vercel.json` - Vercel routing config
- `.vercelignore` - Deployment exclusions

### Modified Files (In extension, not deployed)
- `background.js` - Added proxy wrapper, updated 4 API call sites
- `manifest.json` - Added Vercel host permissions

### Documentation
- `VERCEL_DEPLOYMENT.md` - Full deployment guide (600+ lines)
- `DEPLOYMENT_CHECKLIST.md` - This file (quick reference)

---

## What Changed in background.js?

### Constants Added (Lines ~290-295)
```javascript
const VERCEL_PROXY_URL = ''; // Fill after deployment
const VERCEL_EXT_SECRET = ''; // Fill after deployment
const DEV_HARDCODED_GEMINI_KEY = ''; // Cleared for security
```

### New Function (Lines ~330-360)
```javascript
async function callGeminiViaProxy(endpoint, body, method = 'POST') {
  if (VERCEL_PROXY_URL && VERCEL_EXT_SECRET) {
    // Use Vercel proxy (secure)
    const response = await fetch(VERCEL_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ext-secret': VERCEL_EXT_SECRET
      },
      body: JSON.stringify({ endpoint, body, method })
    });
    return response;
  }
  // Fallback to direct call (requires API key)
  const apiKey = await getGeminiApiKey();
  if (!apiKey) throw new Error('No API key and no proxy configured');
  const url = `${endpoint}?key=${apiKey}`;
  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}
```

### Updated Functions (4 locations)
1. `fetchEmbeddingGemini()` - Line ~608
2. `fetchEmbeddingBatch()` - Line ~772
3. `call_gemini` handler - Line ~1189
4. `generate_image` handler - Line ~1268

All now use `callGeminiViaProxy()` instead of direct fetch with API key.

---

## Next Steps After Deployment

1. **Test thoroughly:**
   - Try all features: Summarize, Rewrite, Translate, Sync Tone
   - Test on multiple AI platforms (ChatGPT, Claude, Gemini)
   - Check browser console for errors

2. **Rotate API key:**
   - Generate new key in Google AI Studio
   - Update Vercel environment variable
   - Delete old exposed key

3. **Monitor usage:**
   - Check Vercel Dashboard → Functions → Logs
   - Monitor Google AI Studio quotas

4. **Consider security upgrades:**
   - Use JWT tokens instead of simple secret
   - Add IP allowlisting in Vercel
   - Implement request signing

5. **Share and publish:**
   - Update README with deployment instructions
   - Submit to Chrome Web Store (if not already)
   - Consider open-sourcing (if key is secured)

---

## Support

For detailed step-by-step instructions, see:
- **VERCEL_DEPLOYMENT.md** - Comprehensive guide with PowerShell commands
- **README.md** - Project overview and features
- **documentation/TROUBLESHOOTING.md** - Common issues

For Vercel-specific help:
- [Vercel Docs](https://vercel.com/docs)
- [Serverless Functions](https://vercel.com/docs/functions)
- [Environment Variables](https://vercel.com/docs/projects/environment-variables)

---

**Status:** 🟢 Ready to deploy! All code changes complete, just waiting for your Vercel URL and secret.
