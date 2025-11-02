# Developer Guide

## Architecture

- Manifest V3 extension
- background.js (service worker): API calls, rate limiting, tab messaging
- content_script.js: UI injection (Shadow DOM), scan/normalize/restore
- adapters.js: per-site detection, messages, composer, file input
- storage.js: abstraction for storage operations

### Message Passing

- background ⇄ content via `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`
- Keyboard shortcuts → background commands → forwarded to the active tab
- Continue With flow: `open_and_restore` (background) then retries `restore_to_chat` until content script responds

### Approved Sites and Injection Guard

- `APPROVED_SITES` check in content script
- Early injection guard with `window.__CHATBRIDGE_INJECTED`

## Core Flows

### Scan Chat
- Adapter chosen for the site
- Scroll to top and wait for DOM stability
- Extract messages: `{ role, text, el?, attachments? }`
- Normalize: dedupe, filter UI noise, preserve per-message attachments

### Restore to Chat
- Wait for composer to render
- Insert text (fire input/change/keydown)
- Attach files via `<input type=file>` or clipboard fallback

### Continue With (Insert to Chat)
- Background opens target URL
- Sends `restore_to_chat` repeatedly until acknowledged

## Adapters

Implement in `adapters.js`:
- `detect()`
- `getMessages()`
- `getInput()`
- `scrollContainer()`
- `getFileInput()`

Returning `el` with a message allows attachment discovery.

## Debugging Hooks

From the console on a page:
- `ChatBridge.enableDebug()`
- `ChatBridge.getLastScan()`
- `ChatBridge.highlightScan(true)`

Background self-test (optional): send `{ type: 'self_test' }`.

## Rate Limiting

The background uses a token-bucket limiter; defaults are 1 req/sec and burst of 5. You can write `chatbridge_config` to `chrome.storage.local` to adjust.

## Adding a Platform Adapter

- Add to SiteAdapters in `adapters.js`
- Implement `detect`, `getMessages`, `getInput`, `getFileInput`
- Prefer returning DOM elements to enable attachment handling

## File Map

- `manifest.json`: matches, commands, background worker
- `background.js`: API calls, Continue With, limiter, storage-backed config
- `content_script.js`: UI, scanning, restore, helpers
- `adapters.js`: per-site implementations
- `storage.js`: storage abstraction
- `styles.css`: scoped styles for Shadow DOM

## Notes

- Avoid `.env` – extensions can’t import them. Use Options (chrome.storage.local).
- The content script exposes small helpers under `window.ChatBridgeHelpers.utils`.
- Keep approved sites in sync between manifest and content script.
