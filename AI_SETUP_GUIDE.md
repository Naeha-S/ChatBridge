# Chrome AI Setup Guide for ChatBridge

## Step 1: Check Chrome Version
Go to `chrome://version` and ensure you have **Chrome 127+** (you have 141 ✅)

## Step 2: Enable Required Flags

### Go to each URL and enable:

1. **Prompt API (Required)**
   ```
   chrome://flags/#prompt-api-for-gemini-nano
   ```
   Set to: **Enabled**

2. **Optimization Guide (Required)**
   ```
   chrome://flags/#optimization-guide-on-device-model
   ```
   Set to: **Enabled BypassPerfRequirement**

3. **Summarization API (Optional)**
   ```
   chrome://flags/#summarization-api-for-gemini-nano
   ```
   Set to: **Enabled**

4. **Rewriter API (Optional)**
   ```
   chrome://flags/#rewriter-api-for-gemini-nano
   ```
   Set to: **Enabled**

5. **Translation API (Optional)**
   ```
   chrome://flags/#translation-api
   ```
   Set to: **Enabled**

### After enabling all flags:
- Click **"Relaunch"** to restart Chrome

---

## Step 3: Download the AI Model

1. Go to: `chrome://components`
2. Find: **"Optimization Guide On Device Model"**
3. Click: **"Check for update"**
4. Wait for download (~1.7GB, may take 5-10 minutes)
5. Status should show: **"Up-to-date"**

---

## Step 4: Verify API Availability

After restarting Chrome and downloading the model:

1. Open DevTools (F12) on any webpage
2. Run this in console:
   ```javascript
   console.log('ai' in window);
   console.log('ai' in window && 'createPromptSession' in window.ai);
   ```
   Both should return `true`

3. Test if model is ready:
   ```javascript
   (async () => {
     try {
       const session = await window.ai.createPromptSession();
       const result = await session.prompt("Say hello!");
       console.log("✅ AI is working:", result);
       session.destroy();
     } catch (e) {
       console.error("❌ AI failed:", e);
     }
   })();
   ```

---

## Step 5: Reload ChatBridge Extension

1. Go to: `chrome://extensions`
2. Find: **ChatBridge**
3. Click: **Reload button** (circular arrow icon)
4. Test on a supported AI chat site (ChatGPT, Gemini, etc.)

---

## Troubleshooting

### If `window.ai` is still undefined:

1. **Wait 5-10 minutes** after enabling flags and downloading model
2. **Fully close and restart Chrome** (not just reload tabs)
3. **Check system requirements:**
   - Windows 10/11 (64-bit)
   - At least 4GB RAM
   - ~2GB free disk space

### If model won't download:

1. Check internet connection
2. Try: `chrome://components` → Force update multiple times
3. Restart Chrome and check again

### Still not working?

Your Chrome build may not have the AI features enabled yet. Try:
- Chrome Canary (most up-to-date): https://www.google.com/chrome/canary/
- Chrome Dev channel: https://www.google.com/chrome/dev/

---

## Expected Result

Once working, all these should return `true`:
```javascript
console.log('ai' in window);                          // true
console.log('createPromptSession' in window.ai);      // true
console.log('summarizer' in window.ai);               // true (if flag enabled)
console.log('rewriter' in window.ai);                 // true (if flag enabled)
```

Then your ChatBridge extension buttons will work! 🎉
