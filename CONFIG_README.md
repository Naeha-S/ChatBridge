# API Keys Configuration

## Setup

1. **Copy the template:**
   ```bash
   cp config.example.js config.js
   ```

2. **Add your API keys to `config.js`:**
   - Get Gemini API key from: https://makersuite.google.com/app/apikey
   - Get HuggingFace API key from: https://huggingface.co/settings/tokens

3. **The `config.js` file is gitignored** - it will never be committed to the repository.

## Current Setup (Temporary)

For the demo, API keys are stored in `config.js`. This file:
- ✅ Is loaded by the extension automatically
- ✅ Is excluded from Git via `.gitignore`
- ✅ Works without any backend setup
- ⚠️ Should be replaced with a proper backend solution

## Future: Backend Integration

After your demo, replace the `config.js` approach with either:

### Option 1: Firebase
```javascript
// In config.js
const CONFIG = {
  FIREBASE_CONFIG: {
    apiKey: "your-firebase-api-key",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
  }
};
```

Then create a Firebase Cloud Function to proxy API requests.

### Option 2: Cloudflare Workers
```javascript
// In config.js
const CONFIG = {
  CLOUDFLARE_WORKER_URL: 'https://chatbridge-api.your-username.workers.dev'
};
```

Then deploy a Cloudflare Worker that handles API requests server-side.

## Security Notes

- Never commit `config.js` to Git
- Rotate API keys regularly
- Use backend proxies for production
- Keep `config.example.js` updated as a template
