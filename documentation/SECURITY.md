# Security and Privacy

ChatBridge is local-first. Conversation data stays in-browser unless you explicitly invoke an AI provider.

- API keys are stored in `chrome.storage.local`.
- No analytics or third-party trackers are required for core functionality.
- No mandatory cloud backend for conversation storage.

## Security Model

### Trust Boundaries

- Untrusted input:
	- Web page DOM content from supported chat sites
	- Conversation text (user- and AI-generated)
	- Extracted URLs and attachment URLs
- Trusted components:
	- Extension background service worker
	- Extension content scripts and UI (after sanitization)

## Data Flow (High Level)

User Page -> Content Script (scan/restore) -> Background (API calls) -> AI Provider API -> Background -> Content Script

All outbound provider calls are expected to use HTTPS endpoints.

## Key Security Controls

### Input and Output Safety

- HTML escaping is used before rendering dynamic error messages and AI/user-derived fields in `innerHTML` contexts.
- UI paths that can render generated text (agent panels, synthesis output, segment/topic displays) now escape dynamic values before insertion.
- `options.js` toast rendering uses safe text-node APIs instead of direct `innerHTML` message interpolation.

### URL and Navigation Safety

- Dynamic `window.open(...)` paths now validate URL protocol and only allow `http:` and `https:`.
- Background `fetch_blob` URL handling validates protocol and rejects private/internal targets (for example localhost, loopback, and RFC1918 ranges) to reduce SSRF risk.

### Sandbox and Code Execution Safety

- Code preview/execution uses sandboxed iframes.
- Sandbox message handling validates sender (`postMessage` source check) before accepting execution results.
- HTML preview sandbox is constrained to reduce abuse paths (navigation/popups/forms are not granted).

## API Keys

Chrome extensions cannot read `.env` files. Configure keys via the Options page:

1. Right-click the extension -> Options
2. Paste your Gemini API key -> Save

The background script reads keys from `chrome.storage.local`.

Note: If a development fallback key exists in your branch, remove it before production builds.

## Permissions

- `storage`: save settings and conversations locally
- `activeTab`: inject UI only on approved domains

## Rate Limiting

The background uses request limiting (token-bucket style defaults are typically `1 req/sec`, burst `5`). You can tune this with `chatbridge_config` in `chrome.storage.local` (`ratePerSec`, `maxBurst`).

## Residual Risks and Hardening TODOs

- Maintain parity between approved-site lists (`manifest.json`, `content_script.js`, `utils/constants.js`).
- Keep all new `innerHTML` usage reviewed for escaping guarantees.
- Add automated security tests for:
	- URL protocol/host validation
	- Rendering of hostile HTML payloads
	- Message-origin checks for sandbox communication

## Privacy Tips

- Never commit API keys to source control.
- Use separate keys for development and personal/production use.
- Restrict `manifest.json` matches to domains you actually need.