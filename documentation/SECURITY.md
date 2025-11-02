# Security and Privacy

This extension is local-first. It does not send your data anywhere except to the model APIs you explicitly enable.

- API keys are stored in Chrome’s local storage (encrypted at rest by Chrome).
- No analytics or third‑party tracking.
- No cloud backend – all state lives in your browser.

## API Keys

Chrome extensions cannot read .env files. Configure keys via the Options page:

1) Right‑click the extension → Options
2) Paste your Gemini API key → Save

The background script retrieves the key from `chrome.storage.local`.

Note: In this build, a development fallback key may be hardcoded for convenience. To disable it, set the fallback to an empty string in `background.js` (DEV_HARDCODED_GEMINI_KEY = '').

## Permissions

- storage: save settings and conversations locally
- activeTab/scripting: inject UI only on approved domains
- clipboardWrite: optional restore to chat conveniences

## Data Flow (High level)

User Page → Content Script (scan/restore) → Background (API calls) → Google Generative AI → Background → Content Script

All network calls use HTTPS to official APIs only.

## Rate Limiting and Fair Use

The background uses a token‑bucket limiter (defaults: 1 req/sec, burst 5). You can change it by writing `chatbridge_config` in `chrome.storage.local` with keys `ratePerSec` and `maxBurst`.

## Privacy Tips

- Don’t commit API keys to source control.
- Consider separate keys for dev vs personal usage.
- Review `manifest.json` matches and restrict to sites you actually use.