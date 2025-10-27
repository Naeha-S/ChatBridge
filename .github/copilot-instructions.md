# ChatBridge – Copilot Instructions for this Repo

This repo is a Chrome Extension (Manifest V3) that bridges AI chats across platforms (ChatGPT, Claude, Gemini, Perplexity, etc.). The core logic lives in a single content script with adapters; background handles API calls and cross-tab handoffs.

## Architecture at a glance
- manifest.json: MV3 config; content_scripts restricted to approved hosts; keyboard commands configured here.
- background.js (service worker):
  - API calls (Gemini) with rate limiting and retries.
  - Keyboard shortcuts routing (commands → active tab message).
  - Continue With flow: receives open_and_restore, opens a target URL in a new tab, then repeatedly sends restore_to_chat until the content script responds.
- content_script.js (main):
  - Guarded IIFE injection; exits if not on approved sites.
  - UI injected via Shadow DOM (injectUI) returning { host, avatar, panel }.
  - Scanning (scanChat): choose adapter → pick container near composer → scroll to top → wait for DOM stability → extract messages → fallback to generic/node scan.
  - Normalization (normalizeMessages): dedupe contiguous messages, filter UI noise, and preserve per-message attachments.
  - Restore: restoreToChat waits for composer to render, inserts text (fires input/change/keydown), and attaches files via <input type=file> or clipboard fallback.
  - Sync Tone “Insert to Chat” behaves as Continue With: opens target model (Gemini/Claude/ChatGPT/Copilot) and auto-inserts text via background + restore_to_chat.
- adapters.js: SiteAdapters + AdapterGeneric implement:
  - detect(), getMessages(), getInput(), scrollContainer(), and getFileInput().
  - getMessages should return [{ role: 'user'|'assistant', text, el?, attachments? }]. If el is present, attachments can be derived.
- storage.js: Storage abstraction; falls back to localStorage.

## Key patterns and conventions
- Injection guard: content script starts with window.__CHATBRIDGE_INJECTED; also checks APPROVED_SITES. Don’t remove these.
- Shadow DOM: All UI elements live inside #cb-host shadow root; avoid leaking styles to page; skip elements with [data-cb-ignore].
- Message passing:
  - background ⇄ content_script via chrome.runtime.sendMessage / chrome.tabs.sendMessage.
  - Keyboard shortcuts fire commands in background, forwarded as { type: 'keyboard_command', command } to the active tab.
  - Continue With uses { type: 'open_and_restore' } (background) then { type: 'restore_to_chat' } (content script).
- Scanning fallbacks: adapter.getMessages → AdapterGeneric.getMessages → manual node mapping with inferRoleFromNode and filterCandidateNodes. Always keep error-tolerant try/catch and continue.
- Attachments: extractAttachmentsFromElement(element) collects images/videos/doc links; normalized messages carry attachments array; restore flow can attach them.
- Debugging hooks: window.ChatBridge.enableDebug(), getLastScan(), highlightScan(true). Errors accumulate in window.ChatBridge._lastScan.errors.

## Developer workflows
- Load locally:
  1) Open chrome://extensions → Enable Developer mode → Load unpacked → select repo folder.
  2) Navigate to a supported site (manifest matches). The ⚡ avatar appears only on approved domains.
- Quick sanity:
  - Click ⚡ → Scan Chat → verify messages in history; use Summarize/Rewrite/Translate/Sync Tone.
  - Try Sync Tone → Insert to Chat to verify Continue With handoff opens target tab and auto-inserts.
- Debug:
  - F12 console → ChatBridge.enableDebug() then rescan; check ChatBridge.getLastScan().
  - highlightScan(true) to visualize captured nodes.

## Extension points (what to change where)
- New platform adapter: add to SiteAdapters in adapters.js (detect/getMessages/getInput/getFileInput). Ensure getMessages returns elements (el) when possible so attachments can be derived.
- Improve restore on a site: implement adapter.getFileInput to return the site’s upload input; restoreToChat already waits for the composer and fires input/change.
- Add new Continue With target: update getTargetModelUrl(name) in content_script.js and, if needed, add site to manifest matches.
- Keyboard flows: background.js onCommand → send { type: 'keyboard_command' } to content script; content_script.js switches on quick-scan / toggle-sidebar / insert-to-chat.

## Gotchas
- Manifest shortcuts can’t use Enter as a chord key (Chrome restriction). Use Ctrl+Shift+I instead of Ctrl+Enter.
- Approved site list exists both in manifest (matches) and content_script.js (APPROVED_SITES). Keep them in sync when adding a site.
- Some targets render inputs late; rely on restoreToChat’s waitForComposer instead of fixed delays.
- If fetch of attachment URL fails due to auth/CORS, we fall back to clipboard for the first image.

## File references
- content_script.js: injectUI(), scanChat(), normalizeMessages(), restoreToChat(), attachFilesToChat(), getTargetModelUrl(), keyboard handler, debug helpers.
- background.js: open_and_restore, commands listener, Gemini API calls with rate limiting.
- adapters.js: SiteAdapters, AdapterGeneric, getFileInput; extraction heuristics and debug logs per site.
- manifest.json: matches, commands, background service worker.
