// wrap everything in an IIFE and exit early if already injected to avoid redeclaration
(function () {
  'use strict';
  if (typeof window !== 'undefined' && window.__CHATBRIDGE_INJECTED) {
    try { console.debug && console.debug('[ChatBridge] double-injection detected, skipping init'); } catch (e) { }
    return;
  }
  if (typeof window !== 'undefined') {
    window.__CHATBRIDGE_INJECTED = true;
    window.__CHATBRIDGE = window.__CHATBRIDGE || {};
    // allow previously stored value to persist
    window.__CHATBRIDGE.MAX_MESSAGES = window.__CHATBRIDGE.MAX_MESSAGES || 200;
  }

  // APPROVED SITES - Only show avatar/sidebar on these domains
  const APPROVED_SITES = [
    'chat.openai.com',
    'chatgpt.com',
    'gemini.google.com',
    'claude.ai',
    'chat.mistral.ai',
    'deepseek.ai',
    'www.perplexity.ai',
    'perplexity.ai',
    'poe.com',
    'x.ai',
    'copilot.microsoft.com',
    'www.bing.com',
    'meta.ai'
  ];

  // Check if current site is approved
  function isApprovedSite() {
    const hostname = window.location.hostname;
    return APPROVED_SITES.some(site => hostname === site || hostname.endsWith('.' + site)) || hostname === 'localhost';
  }

  // Exit early if not on approved site
  if (!isApprovedSite()) {
    console.log('[ChatBridge] Not on approved site, skipping injection. Current:', window.location.hostname);
    return; // Early exit if not approved
  }

  console.log('[ChatBridge] Injecting on approved site:', window.location.hostname);

  // AUTO-INSERT: Check if we arrived from "Continue With" and should auto-insert context
  (async function checkContinueWithAutoInsert() {
    try {
      // Wait for page to be fully loaded
      await new Promise(r => setTimeout(r, 2000));

      // Check for stored continue context
      let continueData = null;

      // Try chrome.storage first (cross-tab)
      try {
        if (chrome.storage && chrome.storage.local) {
          continueData = await new Promise(resolve => {
            chrome.storage.local.get(['chatbridge:continue_context'], (data) => {
              resolve(data['chatbridge:continue_context'] || null);
            });
          });
        }
      } catch (e) { }

      // Fallback to localStorage
      if (!continueData) {
        try {
          const stored = localStorage.getItem('chatbridge:continue_context');
          if (stored) {
            continueData = JSON.parse(stored);
          }
        } catch (e) { }
      }

      // If no context or too old (>5 minutes), skip
      if (!continueData || !continueData.text || !continueData.timestamp) return;
      if (Date.now() - continueData.timestamp > 5 * 60 * 1000) {
        // Clear old context
        localStorage.removeItem('chatbridge:continue_context');
        try { chrome.storage.local.remove(['chatbridge:continue_context']); } catch (e) { }
        return;
      }

      console.log('[ChatBridge] Found continue context, attempting auto-insert...');

      // Wait a bit more for the input to be ready
      await new Promise(r => setTimeout(r, 1500));

      // Find the chat input
      const selectors = [
        'textarea[data-id="root"]', // ChatGPT
        'textarea#prompt-textarea', // ChatGPT
        'div[contenteditable="true"]', // Claude, Gemini
        'textarea', // Generic
        '[role="textbox"]', // Copilot
        'input[type="text"]' // Fallback
      ];

      let input = null;
      for (const sel of selectors) {
        input = document.querySelector(sel);
        if (input) break;
      }

      if (input) {
        // Insert the context
        if (input.isContentEditable || input.contentEditable === 'true') {
          input.focus();
          input.textContent = continueData.text;
          input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
        } else {
          input.focus();
          input.value = continueData.text;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Clear the stored context (one-time use)
        localStorage.removeItem('chatbridge:continue_context');
        try { chrome.storage.local.remove(['chatbridge:continue_context']); } catch (e) { }

        console.log('[ChatBridge] Auto-inserted continue context!');

        // Show a subtle notification
        const notif = document.createElement('div');
        notif.style.cssText = 'position:fixed;top:20px;right:20px;background:linear-gradient(135deg,rgba(16,163,127,0.95),rgba(0,100,80,0.95));color:white;padding:12px 20px;border-radius:10px;font-size:13px;z-index:999999;box-shadow:0 4px 20px rgba(0,0,0,0.3);animation:slideIn 0.3s ease;';
        notif.innerHTML = '✨ <strong>ChatBridge</strong>: Conversation context inserted!';
        document.body.appendChild(notif);

        // Add slide animation
        const style = document.createElement('style');
        style.textContent = '@keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }';
        document.head.appendChild(style);

        setTimeout(() => notif.remove(), 4000);
      }
    } catch (e) {
      console.warn('[ChatBridge] Continue auto-insert error:', e);
    }
  })();

  // CLOUDFLARE FIX: Defer UI injection until page is fully loaded to avoid triggering security checks
  let _pageFullyLoaded = document.readyState === 'complete';
  if (!_pageFullyLoaded) {
    window.addEventListener('load', () => { _pageFullyLoaded = true; }, { once: true, passive: true });
  }

  // OPTIMIZATION: Lazy initialization - only load RAG/MCP when user explicitly requests it
  // This prevents CPU/memory overhead on initial page load for low-end devices
  let _cbRAGInitialized = false;
  let _cbMCPInitialized = false;

  // Lazy loader for RAG Engine (called on first use, not on page load)
  async function ensureRAGInitialized() {
    if (_cbRAGInitialized) return;
    try {
      if (typeof window.RAGEngine !== 'undefined' && typeof window.RAGEngine.initEmbeddingPipeline === 'function') {
        await window.RAGEngine.initEmbeddingPipeline();
        console.log('[ChatBridge] RAG embedding model loaded on demand');
        _cbRAGInitialized = true;
      }
    } catch (e) {
      console.warn('[ChatBridge] RAG lazy init failed (will use fallback):', e);
    }
  }

  // Lazy loader for MCP Bridge (called on first agent use)
  function ensureMCPInitialized() {
    if (_cbMCPInitialized) return;
    try {
      if (typeof window.MCPBridge !== 'undefined') {
        window.MCPBridge.init();
        console.log('[ChatBridge] MCP Bridge initialized on demand');
        _cbMCPInitialized = true;
      }
    } catch (e) {
      console.warn('[ChatBridge] MCP lazy init failed:', e);
    }
  }

  // OPTIMIZATION: Monitor page visibility to pause/cleanup when user switches tabs
  // This reduces CPU usage when extension is not actively visible
  // CLOUDFLARE FIX: Use passive listeners to avoid blocking main thread
  if (document.readyState !== 'loading') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        debugLog('Page hidden, pausing background tasks');
      } else {
        debugLog('Page visible, resuming if needed');
      }
    }, { passive: true });
  }

  // avoid const redeclaration causing SyntaxError in some injection scenarios
  var CB_MAX_MESSAGES = (typeof window !== 'undefined' && window.__CHATBRIDGE && window.__CHATBRIDGE.MAX_MESSAGES) ? window.__CHATBRIDGE.MAX_MESSAGES : 200;
  const DOM_STABLE_MS = 10; // Ultra-fast scan - near-instant
  const DOM_STABLE_TIMEOUT_MS = 100; // Quick timeout for snappy response
  const SCROLL_MAX_STEPS = 2; // Minimal steps for speed
  const SCROLL_STEP_PAUSE_MS = 5; // Near-instant scrolling
  const SKIP_SCROLL_ON_SCAN = true; // Skip scrolling - most modern chats don't need it
  const DEBUG = !!(typeof window !== 'undefined' && window.__CHATBRIDGE_DEBUG === true);

  function debugLog(...args) { if (!DEBUG) return; try { console.debug('[ChatBridge]', ...args); } catch (e) { } }
  // Always log restore-related messages for debugging
  function restoreLog(...args) { try { console.log('[ChatBridge Restore]', ...args); } catch (e) { } }

  // --- Lightweight Config & Logger (non-invasive) ---------------------------
  const CBConfig = (function () {
    const DEFAULTS = { debug: DEBUG === true };
    let cache = { value: DEFAULTS, ts: 0 };
    function getAll(force) {
      if (!force && (Date.now() - cache.ts) < 60_000) return Promise.resolve(cache.value);
      return new Promise((resolve) => {
        try {
          chrome.storage && chrome.storage.local.get(['chatbridge_config'], (d) => {
            const v = d && d.chatbridge_config ? d.chatbridge_config : {};
            cache = { value: Object.assign({}, DEFAULTS, v), ts: Date.now() };
            resolve(cache.value);
          });
        } catch (_) { resolve(cache.value); }
      });
    }
    function get(key) { return getAll(false).then(c => c[key]); }
    try {
      chrome.storage && chrome.storage.onChanged && chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes && changes.chatbridge_config) {
          const v = changes.chatbridge_config.newValue || {}; cache = { value: Object.assign({}, DEFAULTS, v), ts: Date.now() };
        }
      });
    } catch (_) { }
    return { getAll, get };
  })();

  const CBLogger = (function () {
    let debug = DEBUG === true;
    CBConfig.get('debug').then(v => { if (typeof v === 'boolean') debug = v; }).catch(() => { });
    try {
      chrome.storage && chrome.storage.onChanged && chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes && changes.chatbridge_config) {
          const v = changes.chatbridge_config.newValue || {}; debug = !!v.debug;
        }
      });
    } catch (_) { }
    function log(method, args) { try { console[method].apply(console, ['[ChatBridge]', ...args]); } catch (_) { } }
    return {
      debug: (...a) => { if (debug) log('debug', a); },
      info: (...a) => log('log', a),
      warn: (...a) => log('warn', a),
      error: (...a) => log('error', a)
    };
  })();

  // --- Small, safe utilities (non-invasive; exported for future reuse) ------
  /** Sleep helper */
  function cbSleep(ms) { return new Promise(r => setTimeout(r, Number(ms) || 0)); }
  /** Wait until predicate returns truthy or timeout (returns null on timeout) */
  async function cbWaitFor(predicate, opts) {
    const timeout = (opts && opts.timeoutMs) || 8000;
    const interval = (opts && opts.intervalMs) || 100;
    const started = Date.now();
    while ((Date.now() - started) < timeout) {
      try {
        const v = (typeof predicate === 'function') ? await predicate() : null;
        if (v) return v;
      } catch (_) { /* ignore predicate errors */ }
      await cbSleep(interval);
    }
    return null;
  }
  /** Safe querySelector with root param */
  function cbQS(root, sel) { try { return (root || document).querySelector(sel); } catch (_) { return null; } }
  /** Safe querySelectorAll -> array */
  function cbQSA(root, sel) { try { return Array.from((root || document).querySelectorAll(sel)); } catch (_) { return []; } }

  // Register restore message listener EARLY, before injectUI, so it's ready when the tab opens
  // Store restoreToChat reference - will be defined later but we can queue messages
  let pendingRestoreMessages = [];
  let restoreToChatFunction = null;

  console.log('[ChatBridge] Registering restore_to_chat listener early');
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    try {
      if (msg && msg.type === 'restore_to_chat') {
        console.log('[ChatBridge] Received restore_to_chat message, text length:', msg.payload ? msg.payload.text ? msg.payload.text.length : 0 : 0);
        restoreLog('Restore message received early, queueing if needed');

        const payload = msg.payload || {};
        const text = payload.text || '';
        const attachments = payload.attachments || [];

        // If restoreToChat is not ready yet, queue the message
        if (!restoreToChatFunction) {
          restoreLog('restoreToChat function not ready yet, queueing message');
          pendingRestoreMessages.push({ text, attachments, sendResponse });
          return true; // Keep channel open
        }

        // Use async function to properly handle response
        (async () => {
          try {
            const result = await restoreToChatFunction(text, attachments);
            if (sendResponse) sendResponse({ ok: result });
          } catch (e) {
            console.error('[ChatBridge] Restore error:', e);
            if (sendResponse) sendResponse({ ok: false, error: e && e.message });
          }
        })();
        return true; // Keep channel open for async response
      }
      // Local embedding request from background (compute in content script)
      if (msg && msg.type === 'local_get_embedding') {
        (async () => {
          try {
            const text = (msg.payload && msg.payload.text) ? String(msg.payload.text) : '';
            if (!text) return sendResponse({ ok: false, error: 'no_text' });
            if (window.ChatBridgeEmbeddings && typeof window.ChatBridgeEmbeddings.getEmbedding === 'function') {
              const emb = await window.ChatBridgeEmbeddings.getEmbedding(text);
              const arr = Array.from(emb || []);
              return sendResponse({ ok: true, vector: arr });
            }
            return sendResponse({ ok: false, error: 'embeddings_unavailable' });
          } catch (e) {
            return sendResponse({ ok: false, error: e && e.message });
          }
        })();
        return true;
      }
      if (msg && msg.type === 'local_get_embeddings_batch') {
        (async () => {
          try {
            const texts = (msg.payload && Array.isArray(msg.payload.texts)) ? msg.payload.texts : [];
            if (!texts.length) return sendResponse({ ok: false, error: 'no_texts' });
            if (window.ChatBridgeEmbeddings && typeof window.ChatBridgeEmbeddings.getEmbedding === 'function') {
              const vectors = [];
              for (const t of texts) {
                const emb = await window.ChatBridgeEmbeddings.getEmbedding(String(t || ''));
                vectors.push(Array.from(emb || []));
              }
              return sendResponse({ ok: true, vectors });
            }
            return sendResponse({ ok: false, error: 'embeddings_unavailable' });
          } catch (e) {
            return sendResponse({ ok: false, error: e && e.message });
          }
        })();
        return true;
      }

      // Handle MCP requests from popup or other sources
      if (msg && msg.type === 'mcp_request') {
        console.log('[ChatBridge] Received MCP request:', msg.resource, msg.method);

        (async () => {
          try {
            // Forward to MCP bridge for handling
            if (typeof window.MCPBridge !== 'undefined') {
              const response = await window.MCPBridge.sendRequest(
                msg.resource,
                msg.method,
                msg.params || {},
                msg.source || 'unknown'
              );
              if (sendResponse) sendResponse(response);
            } else {
              if (sendResponse) sendResponse({ ok: false, error: 'MCP Bridge not available' });
            }
          } catch (e) {
            console.error('[ChatBridge] MCP request error:', e);
            if (sendResponse) sendResponse({ ok: false, error: e.message });
          }
        })();
        return true; // Keep channel open for async response
      }

      // Handle clear RAG cache request from popup
      if (msg && msg.type === 'clear_rag_cache') {
        (async () => {
          try {
            if (typeof window.RAGEngine !== 'undefined') {
              await window.RAGEngine.clearAllEmbeddings();
              if (sendResponse) sendResponse({ ok: true });
            } else {
              if (sendResponse) sendResponse({ ok: false, error: 'RAG Engine not available' });
            }
          } catch (e) {
            console.error('[ChatBridge] Clear RAG cache error:', e);
            if (sendResponse) sendResponse({ ok: false, error: e.message });
          }
        })();
        return true;
      }

      // Open Memory Architect focused on a specific theme (from popup Timeline)
      if (msg && msg.type === 'open_memory_architect') {
        (async () => {
          try {
            window.__CB_FOCUS_THEME = msg.theme || '';
            // Ensure UI visible
            try { const h = document.getElementById('cb-host'); if (h) h.style.display = 'block'; } catch (e) { }
            // Switch to Memory Architect view
            if (typeof showMemoryArchitect === 'function') {
              await showMemoryArchitect();
            }
            if (sendResponse) sendResponse({ ok: true });
          } catch (e) {
            if (sendResponse) sendResponse({ ok: false, error: e.message });
          }
        })();
        return true;
      }

      if (msg && msg.type === 'cs_self_test') {
        try {
          // Minimal sanity checks only; no DOM mutations
          const siteOk = isApprovedSite();
          CBLogger.debug('cs_self_test approved?', siteOk);
          sendResponse({ ok: true, approved: siteOk });
        } catch (e) {
          sendResponse({ ok: false, error: e && e.message });
        }
        return true;
      }
    } catch (e) {
      console.error('[ChatBridge] Message listener error:', e);
      if (sendResponse) sendResponse({ ok: false, error: e && e.message });
    }
  });

  // Ensure the floating avatar exists on the page. This is useful when the host
  // element is present (from a prior injection) but the avatar was removed by
  // page scripts or extensions. Calling this will recreate the avatar button.
  function ensureAvatarExists() {
    try {
      if (document.getElementById('cb-avatar')) return;
      const a = document.createElement('div');
      a.id = 'cb-avatar'; a.setAttribute('data-cb-ignore', 'true');
      // polished SVG lettermark for avatar (CB)
      a.innerHTML = `
        <svg width="34" height="34" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.12" flood-color="#000"/></filter>
          </defs>
          <g filter="url(#s)">
            <circle cx="17" cy="17" r="16" fill="#e6cf9f" stroke="#0b0f17" stroke-width="1" />
            <text x="50%" y="52%" text-anchor="middle" fill="#0b0f17" font-family="Inter, Arial, sans-serif" font-weight="700" font-size="12">CB</text>
          </g>
        </svg>`;
      a.style.cssText = 'position:fixed;bottom:22px;right:26px;width:48px;height:48px;border-radius:12px;z-index:2147483647;display:flex;align-items:center;justify-content:center;cursor:pointer;background:transparent;box-shadow:0 6px 20px rgba(0,0,0,0.18);transition: transform .12s ease, box-shadow .12s ease;';
      a.addEventListener('mouseenter', () => { try { a.style.transform = 'translateY(-2px)'; a.style.boxShadow = '0 10px 26px rgba(230,207,159,0.18)'; } catch (e) { } });
      a.addEventListener('mouseleave', () => { try { a.style.transform = ''; a.style.boxShadow = '0 6px 20px rgba(0,0,0,0.18)'; } catch (e) { } });
      // Click should reveal the host sidebar if present
      a.addEventListener('click', () => {
        try {
          const h = document.getElementById('cb-host');
          if (h) { h.style.display = 'block'; a.style.display = 'none'; }
        } catch (e) { }
      });
      document.body.appendChild(a);
    } catch (e) { debugLog('ensureAvatarExists failed', e); }
  }

  // Loading helpers for buttons - using animated dots instead of spinner
  function addLoadingToButton(btn, label) {
    try {
      if (!btn) return;
      if (!btn.getAttribute('data-orig-text')) btn.setAttribute('data-orig-text', btn.innerHTML || btn.textContent || '');
      btn.disabled = true;
      btn.classList.add('cb-loading');
      // animated dots + label
      btn.innerHTML = `${label}<span class="cb-dots" aria-hidden="true"><span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></span>`;
    } catch (e) { debugLog('addLoadingToButton failed', e); }
  }
  function removeLoadingFromButton(btn, restoreLabel) {
    try {
      if (!btn) return;
      btn.disabled = false;
      btn.classList.remove('cb-loading');
      const orig = btn.getAttribute('data-orig-text');
      if (restoreLabel) btn.textContent = restoreLabel;
      else if (orig !== null) btn.innerHTML = orig;
    } catch (e) { debugLog('removeLoadingFromButton failed', e); }
  }

  // Platform detection helper
  function detectCurrentPlatform() {
    const host = window.location.hostname.toLowerCase();
    if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'chatgpt';
    if (host.includes('claude.ai')) return 'claude';
    if (host.includes('gemini.google.com')) return 'gemini';
    if (host.includes('perplexity.ai')) return 'perplexity';
    if (host.includes('copilot.microsoft.com') || host.includes('bing.com')) return 'copilot';
    if (host.includes('poe.com')) return 'poe';
    if (host.includes('x.ai')) return 'grok';
    if (host.includes('meta.ai')) return 'meta';
    if (host.includes('mistral.ai')) return 'mistral';
    if (host.includes('deepseek.ai')) return 'deepseek';
    return 'unknown';
  }

  // Highlighting helpers for debug visualization
  var CB_HIGHLIGHT_ENABLED = false;
  var CB_HIGHLIGHT_ROOT = null;
  function ensureHighlightStyles() {
    if (document.getElementById('cb-scan-style')) return;
    try {
      const s = document.createElement('style'); s.id = 'cb-scan-style';
      s.textContent = `
        .cb-scan-highlight{ outline: 3px solid rgba(255,165,0,0.95) !important; box-shadow: 0 0 0 3px rgba(255,165,0,0.12) !important; }
        .cb-scan-label{ position: absolute; background: rgba(6,20,32,0.9); color:#ffdca3; font-size:12px; padding:2px 6px; border-radius:4px; z-index:2147483647; pointer-events:none; }
      `;
      document.head.appendChild(s);
    } catch (e) { }
  }

  function clearHighlights() {
    try {
      if (CB_HIGHLIGHT_ROOT) { CB_HIGHLIGHT_ROOT.remove(); CB_HIGHLIGHT_ROOT = null; }
      cbQSA(document, '.cb-scan-highlight').forEach(n => { try { n.classList.remove('cb-scan-highlight'); } catch (e) { } });
      cbQSA(document, '.cb-scan-label').forEach(n => { try { n.remove(); } catch (e) { } });
    } catch (e) { }
  }

  function highlightNodesByElements(elems) {
    try {
      if (!elems || !elems.length) return;
      ensureHighlightStyles(); clearHighlights();
      CB_HIGHLIGHT_ROOT = document.createElement('div'); CB_HIGHLIGHT_ROOT.id = 'cb-scan-highlights'; CB_HIGHLIGHT_ROOT.setAttribute('data-cb-ignore', 'true'); CB_HIGHLIGHT_ROOT.style.pointerEvents = 'none';
      document.body.appendChild(CB_HIGHLIGHT_ROOT);
      elems.slice(0, 60).forEach((el, i) => {
        try {
          if (!el || !(el instanceof Element)) return;
          el.classList.add('cb-scan-highlight');
          const rect = el.getBoundingClientRect();
          const label = document.createElement('div'); label.className = 'cb-scan-label'; label.setAttribute('data-cb-ignore', 'true');
          label.textContent = `#${i + 1}`;
          label.style.left = (window.scrollX + Math.max(0, rect.left)) + 'px';
          label.style.top = (window.scrollY + Math.max(0, rect.top - 18)) + 'px';
          CB_HIGHLIGHT_ROOT.appendChild(label);
        } catch (e) { }
      });
    } catch (e) { }
  }

  function isInExtension(node) {
    if (!node) return false;
    let cur = node;
    while (cur && cur !== document) {
      try { if (cur.id === 'cb-host' || (cur.getAttribute && cur.getAttribute('data-cb-ignore') === 'true')) return true; } catch (e) { }
      cur = cur.parentElement;
    }
    return false;
  }

  function inferRoleFromNode(n) {
    try {
      if (!n) return 'assistant';
      const cls = (n.className || '').toString().toLowerCase();
      if (cls.includes('user') || cls.includes('from-user') || cls.includes('you')) return 'user';
      if (cls.includes('assistant') || cls.includes('bot') || cls.includes('ai')) return 'assistant';
      const aria = (n.getAttribute && (n.getAttribute('aria-label') || n.getAttribute('role'))) || '';
      if (/user|you/i.test(aria)) return 'user';
      if (/assistant|bot|ai/i.test(aria)) return 'assistant';
      // look for nearby avatar or author markers
      try {
        const p = n.closest && n.closest('*');
        if (p) {
          const text = (n.innerText || '').trim();
          if (/^user[:\-]/i.test(text)) return 'user';
          if (/^assistant[:\-]/i.test(text)) return 'assistant';
        }
      } catch (e) { }
      // default to assistant
      return 'assistant';
    } catch (e) { return 'assistant'; }
  }

  // Enhance debug logging in filterCandidateNodes to log reasons for skipping nodes
  function filterCandidateNodes(nodes) {
    return nodes.filter(node => {
      if (!node || !node.textContent || node.textContent.trim() === '') {
        console.debug('[Claude Debug] Skipping node: Empty or whitespace-only content', node);
        return false;
      }
      if (node.textContent.length < 5) { // Example threshold for minimum length
        console.debug('[Claude Debug] Skipping node: Content too short', node.textContent);
        return false;
      }
      if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE) {
        console.debug('[Claude Debug] Skipping node: Unsupported node type', node.nodeType);
        return false;
      }
      if (node.hasAttribute && node.hasAttribute('aria-hidden') && node.getAttribute('aria-hidden') === 'true') {
        console.debug('[Claude Debug] Skipping node: aria-hidden=true', node);
        return false;
      }
      // Add more conditions as needed
      return true;
    });
  }

  async function scrollContainerToTop(container, maxSteps = SCROLL_MAX_STEPS, stepPause = SCROLL_STEP_PAUSE_MS) {
    if (!container) return;
    try {
      const isWindow = container === document.body || container === document.documentElement || container === document.scrollingElement;
      if (isWindow) {
        for (let i = 0; i < maxSteps; i++) {
          const cur = window.scrollY || document.documentElement.scrollTop || 0; if (cur <= 0) break;
          window.scrollTo({ top: 0, behavior: 'auto' }); await cbSleep(stepPause);
        }
        window.scrollTo({ top: 0, behavior: 'auto' }); return;
      }
      for (let i = 0; i < maxSteps; i++) {
        const cur = container.scrollTop; if (cur <= 0) break;
        container.scrollTop = Math.max(0, cur - Math.ceil(container.clientHeight * 0.85));
        await cbSleep(stepPause);
      }
      container.scrollTop = 0;
    } catch (e) { console.warn('scroll error', e); }
  }

  function waitForDomStability(container, stableMs = DOM_STABLE_MS, timeoutMs = DOM_STABLE_TIMEOUT_MS) {
    return new Promise(resolve => {
      const target = container || document.body; let timer = null; let resolved = false; let obs = null;
      function done(timedOut) { if (resolved) return; resolved = true; if (timer) clearTimeout(timer); try { if (obs) obs.disconnect(); } catch (e) { } resolve(!timedOut); }
      try {
        obs = new MutationObserver(() => { if (timer) clearTimeout(timer); timer = setTimeout(() => done(false), stableMs); });
        obs.observe(target, { childList: true, subtree: true, characterData: true });
        timer = setTimeout(() => done(false), stableMs);
        setTimeout(() => done(true), timeoutMs);
      } catch (e) { done(true); }
    });
  }

  // Extract text from element preserving code blocks, lists, links, and structure
  // Extract text from element preserving code blocks, lists, links, and structure
  function extractTextWithFormatting(element) {
    if (!element) return '';

    try {
      const buffer = [];

      // Process child nodes recursively but push to shared buffer
      function processNode(node) {
        if (!node) return;

        // Text nodes - push content
        if (node.nodeType === Node.TEXT_NODE) {
          buffer.push(node.textContent || '');
          return;
        }

        // Element nodes - handle special formatting
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tag = node.tagName?.toLowerCase();

          // Code blocks - preserve with markdown formatting
          if (tag === 'pre' || tag === 'code') {
            const codeText = node.textContent || '';
            // If it's a code block (pre), wrap in triple backticks
            if (tag === 'pre') {
              const lang = node.querySelector('code')?.className?.match(/language-(\w+)/)?.[1] || '';
              buffer.push(`\n\`\`\`${lang}\n${codeText}\n\`\`\`\n`);
              return;
            }
            // Inline code
            buffer.push(`\`${codeText}\``);
            return;
          }

          // Lists - preserve structure with bullets/numbers
          if (tag === 'ul' || tag === 'ol') {
            buffer.push('\n');
            const items = Array.from(node.querySelectorAll(':scope > li'));
            const prefix = tag === 'ol' ? (i) => `${i + 1}. ` : () => '- ';
            items.forEach((li, i) => {
              buffer.push(prefix(i) + (li.textContent || '').trim() + '\n');
            });
            buffer.push('\n');
            return;
          }

          // List items (if not caught by above)
          if (tag === 'li') {
            buffer.push('- ');
            Array.from(node.childNodes).forEach(processNode);
            buffer.push('\n');
            return;
          }

          // Links - preserve with markdown format
          if (tag === 'a') {
            const text = node.textContent || '';
            const href = node.getAttribute('href') || '';
            if (href && text) {
              buffer.push(`[${text}](${href})`);
              return;
            }
            buffer.push(text);
            return;
          }

          // Block elements - add line breaks
          if (['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
            Array.from(node.childNodes).forEach(processNode);
            buffer.push('\n');
            return;
          }

          if (tag === 'br') {
            buffer.push('\n');
            return;
          }

          // Bold/italic - preserve with markdown
          if (tag === 'strong' || tag === 'b') {
            buffer.push('**');
            Array.from(node.childNodes).forEach(processNode);
            buffer.push('**');
            return;
          }
          if (tag === 'em' || tag === 'i') {
            buffer.push('*');
            Array.from(node.childNodes).forEach(processNode);
            buffer.push('*');
            return;
          }

          // Default - process children
          Array.from(node.childNodes).forEach(processNode);
        }
      }

      processNode(element);

      // Clean up excessive newlines while preserving intentional structure
      return buffer.join('').replace(/\n{3,}/g, '\n\n').trim();

    } catch (e) {
      console.warn('[ChatBridge] extractTextWithFormatting error:', e);
      // Fallback to innerText
      return element.innerText || element.textContent || '';
    }
  }

  // Extract attachments (images, videos, docs) from a message element
  function extractAttachmentsFromElement(root) {
    const atts = [];
    if (!root || !root.querySelectorAll) return atts;
    try {
      // Images
      const imgs = cbQSA(root, 'img[src]');
      for (const img of imgs) {
        try {
          const src = img.getAttribute('src') || '';
          if (!src) continue;
          // skip tiny UI icons
          const r = img.getBoundingClientRect();
          if (r && (r.width < 24 || r.height < 24)) continue;
          atts.push({ type: 'image', url: src, alt: img.getAttribute('alt') || '', name: (src.split('?')[0].split('#')[0].split('/').pop() || 'image') });
        } catch (e) { }
      }
      // Videos
      const vids = cbQSA(root, 'video[src], video source[src]');
      for (const v of vids) {
        try {
          const src = v.getAttribute('src') || '';
          if (!src) continue;
          atts.push({ type: 'video', url: src, name: (src.split('?')[0].split('#')[0].split('/').pop() || 'video') });
        } catch (e) { }
      }
      // Docs/links
      const exts = /(\.pdf|\.docx?|\.pptx?|\.xlsx?|\.zip|\.rar|\.7z|\.csv|\.md|\.txt)$/i;
      const links = cbQSA(root, 'a[href]');
      for (const a of links) {
        try {
          const href = a.getAttribute('href') || '';
          if (!href) continue;
          if (exts.test(href)) {
            atts.push({ type: 'file', url: href, name: (href.split('?')[0].split('#')[0].split('/').pop() || 'file') });
          }
        } catch (e) { }
      }
    } catch (e) { }
    // dedupe by url
    const seen = new Set();
    return atts.filter(a => { if (seen.has(a.url)) return false; seen.add(a.url); return true; });
  }

  function normalizeMessages(raw, maxMessages) {
    maxMessages = (typeof maxMessages === 'number' && maxMessages > 0) ? maxMessages : CB_MAX_MESSAGES;
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const m of raw) {
      if (!m || !m.text) continue;
      let text = (m.text || '').replace(/\s+/g, ' ').trim();
      // Strip role prefixes that might have been captured during scan (e.g., "Assistant:", "User:")
      text = text.replace(/^(Assistant|User|System|AI|Human|Claude|ChatGPT|Gemini|Copilot|Me):\s*/i, '');
      if (!text) continue;
      const role = (m.role === 'user') ? 'user' : 'assistant'; const prev = out[out.length - 1];
      const attachments = Array.isArray(m.attachments) ? m.attachments.slice(0) : [];
      if (!prev || prev.text !== text || prev.role !== role) out.push({ role, text, attachments });
      else {
        // merge attachments when deduping contiguous duplicates
        try {
          const existing = prev.attachments || [];
          const combined = (existing.concat(attachments) || []).filter(a => a && a.url);
          const seen = new Set();
          prev.attachments = combined.filter(a => { const k = a.url + '|' + (a.kind || ''); if (seen.has(k)) return false; seen.add(k); return true; });
        } catch (e) { }
      }
    }
    const filtered = out.filter(x => x.text.length > 4 && !/^(new chat|regenerate|clear|copy|download|history)$/i.test(x.text));
    return filtered.slice(0, maxMessages);
  }

  // expose a very small, safe API surface
  if (typeof window !== 'undefined') {
    window.ChatBridgeHelpers = window.ChatBridgeHelpers || {};
    window.ChatBridgeHelpers.filterCandidateNodes = filterCandidateNodes;
    window.ChatBridgeHelpers.isInExtension = isInExtension;
    window.ChatBridgeHelpers.debugLog = debugLog;
    window.ChatBridgeHelpers.normalizeChatMessages = normalizeMessages;
    // Expose for adapters to extract formatted text (code blocks, lists, links)
    window.extractTextWithFormatting = extractTextWithFormatting;
    // expose utils under a namespaced object to avoid collisions
    window.ChatBridgeHelpers.utils = Object.assign({}, (window.ChatBridgeHelpers.utils || {}), {
      sleep: cbSleep,
      waitFor: cbWaitFor,
      qs: cbQS,
      qsa: cbQSA
    });
  }

  function injectUI() {
    // If host already exists, ensure avatar is present (in case it was removed)
    if (document.getElementById('cb-host')) {
      try { ensureAvatarExists(); } catch (e) { }
      return;
    }
    const avatar = document.createElement('div'); avatar.id = 'cb-avatar'; avatar.setAttribute('data-cb-ignore', 'true');
    const avatarImg = document.createElement('img');
    avatarImg.src = chrome.runtime.getURL('iconic.jpeg');
    avatarImg.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:12px;';
    avatarImg.alt = 'ChatBridge';
    avatar.appendChild(avatarImg);
    // store last scanned text so Clipboard and textarea can access it
    let lastScannedText = '';

    // Initialize ChatBridge.getLastScan() early so all sections can access it
    try {
      window.ChatBridge = window.ChatBridge || {};
      window.ChatBridge._lastScanData = null;
      window.ChatBridge.getLastScan = function () {
        return window.ChatBridge._lastScanData || null;
      };
    } catch (e) { }

    // Universal helper to get conversation text for any section
    async function getConversationText() {
      try {
        // Priority 1: Use stored scan data
        const lastScan = window.ChatBridge && window.ChatBridge.getLastScan ? window.ChatBridge.getLastScan() : null;
        if (lastScan && lastScan.text && lastScan.text.length > 10) {
          return lastScan.text;
        }
        // Priority 2: Use lastScannedText variable
        if (lastScannedText && lastScannedText.length > 10) {
          return lastScannedText;
        }
        // Priority 3: Re-scan the page
        const msgs = await scanChat();
        if (msgs && msgs.length > 0) {
          const text = msgs.map(m => `${m.role}: ${m.text}`).join('\n\n');
          lastScannedText = text;
          return text;
        }
        return '';
      } catch (e) {
        debugLog('getConversationText error:', e);
        return lastScannedText || '';
      }
    }

    // Continuum context state (global)
    let continuumContextState = {
      unifiedContext: [],
      activeGoals: [],
      currentProgress: [],
      unresolvedItems: [],
      keyDetails: [],
      nextActions: [],
      lastUpdate: null,
      messageHistory: []
    };

    // Slightly larger avatar, pulled in from the corner with refined styling
    avatar.style.cssText = 'position:fixed;bottom:22px;right:26px;width:48px;height:48px;border-radius:12px;z-index:2147483647;display:flex;align-items:center;justify-content:center;cursor:pointer;background:transparent;box-shadow:0 6px 20px rgba(0,0,0,0.18);transition: transform .12s ease, box-shadow .12s ease;overflow:hidden;';
    avatar.addEventListener('mouseenter', () => { try { avatar.style.transform = 'translateY(-2px)'; avatar.style.boxShadow = '0 10px 26px rgba(0,180,255,0.26), 0 0 12px rgba(0,180,255,0.35)'; } catch (e) { } });
    avatar.addEventListener('mouseleave', () => { try { avatar.style.transform = ''; avatar.style.boxShadow = '0 6px 20px rgba(0,0,0,0.18)'; } catch (e) { } });
    const host = document.createElement('div'); host.id = 'cb-host'; host.setAttribute('data-cb-ignore', 'true'); host.style.display = 'none';
    document.body.appendChild(avatar); document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    // High-end Dark Neon theme inside shadow DOM (Bebas Neue font)
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      :host { all: initial; }
  :host {
    /* Colors - Dark Theme */
    --cb-bg: #1a1a1a;
    --cb-bg2: #242424;
    --cb-bg3: #2e2e2e;
    --cb-accent-primary: #60a5fa;
    --cb-accent-secondary: #a78bfa;
    --cb-accent-tertiary: #34d399;
    --cb-white: #e5e5e5;
    --cb-subtext: #a1a1a1;
    --cb-error: #ef4444;
    --cb-success: #10b981;
    --cb-warning: #f59e0b;
    --cb-progress: #60a5fa;
    --cb-border: rgba(255, 255, 255, 0.1);
    --cb-shadow: rgba(0, 0, 0, 0.4);
    
    /* Spacing System */
    --cb-space-xs: 4px;
    --cb-space-sm: 8px;
    --cb-space-md: 12px;
    --cb-space-lg: 16px;
    --cb-space-xl: 20px;
    --cb-space-2xl: 24px;
    --cb-space-3xl: 32px;
    
    /* Typography Scale */
    --cb-text-xs: 11px;
    --cb-text-sm: 12px;
    --cb-text-base: 14px;
    --cb-text-lg: 16px;
    --cb-text-xl: 20px;
    --cb-text-2xl: 24px;
    
    /* Border Radius */
    --cb-radius-sm: 6px;
    --cb-radius-md: 10px;
    --cb-radius-lg: 12px;
    --cb-radius-xl: 16px;
    --cb-radius-full: 9999px;
    
    /* Shadows */
    --cb-shadow-sm: 0 1px 3px rgba(0,0,0,0.12);
    --cb-shadow-md: 0 4px 6px rgba(0,0,0,0.1);
    --cb-shadow-lg: 0 10px 20px rgba(0,0,0,0.15);
    --cb-shadow-xl: 0 20px 60px rgba(0,0,0,0.4);
  }
  :host(.cb-theme-light) {
    --cb-bg: #f8f9fa;
    --cb-bg2: #ffffff;
    --cb-bg3: #f1f3f5;
    --cb-white: #1a1a1a;
    --cb-subtext: #6c757d;
    --cb-accent-primary: #2563eb;
    --cb-accent-secondary: #7c3aed;
    --cb-accent-tertiary: #059669;
    --cb-error: #dc2626;
    --cb-success: #059669;
    --cb-warning: #d97706;
    --cb-progress: #2563eb;
    --cb-border: rgba(0, 0, 0, 0.12);
    --cb-shadow: rgba(0, 0, 0, 0.08);
    
    /* Override spacing/typography (inherit from base) */
    --cb-shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
    --cb-shadow-md: 0 2px 8px rgba(0,0,0,0.08);
    --cb-shadow-lg: 0 8px 16px rgba(0,0,0,0.1);
    --cb-shadow-xl: 0 20px 40px rgba(0,0,0,0.15);
  }
  :host(.cb-theme-aurora) {
    --cb-bg: #f7fbff;
    --cb-bg2: #ffffff;
    --cb-bg3: #eef7ff;
    --cb-white: #1a2332;
    --cb-subtext: #5a6b7d;
    --cb-accent-primary: #00e6b8;
    --cb-accent-secondary: #9370ff;
    --cb-accent-tertiary: #6dd5ed;
    --cb-error: #ff6b9d;
    --cb-success: #00e6b8;
    --cb-warning: #ffc947;
    --cb-progress: #00e6b8;
    --cb-border: rgba(0, 230, 184, 0.2);
    --cb-shadow: rgba(0, 230, 184, 0.15);
  }
  :host(.cb-theme-synthwave) {
    --cb-bg: #1a0b2e;
    --cb-bg2: #241334;
    --cb-bg3: #2d1b3d;
    --cb-white: #f9f0ff;
    --cb-subtext: #c4b5fd;
    --cb-accent-primary: #ff00ff;
    --cb-accent-secondary: #00ffff;
    --cb-accent-tertiary: #ff6ec7;
    --cb-error: #ff2975;
    --cb-success: #72f1b8;
    --cb-warning: #ffd93d;
    --cb-progress: #ff00ff;
    --cb-border: rgba(255, 0, 255, 0.3);
    --cb-shadow: rgba(255, 0, 255, 0.4);
  }
  :host(.cb-theme-nebula) {
    --cb-bg: #0f1120;
    --cb-bg2: #171a29;
    --cb-bg3: #1f2336;
    --cb-white: #e8f0ff;
    --cb-subtext: #a5b8d6;
    --cb-accent-primary: #7cc9ff;
    --cb-accent-secondary: #c6a8ff;
    --cb-accent-tertiary: #9dd9ff;
    --cb-error: #ff8fa3;
    --cb-success: #7ce3c4;
    --cb-warning: #ffca7a;
    --cb-progress: #7cc9ff;
    --cb-border: rgba(124, 201, 255, 0.25);
    --cb-shadow: rgba(124, 201, 255, 0.2);
  }
  :host(.cb-theme-rose) {
    --cb-bg: #f1e6e9;
    --cb-bg2: #f9eff3;
    --cb-bg3: #faf5f7;
    --cb-white: #3d2e33;
    --cb-subtext: #7a6268;
    --cb-accent-primary: #d97a9b;
    --cb-accent-secondary: #b46e8a;
    --cb-accent-tertiary: #e89fb8;
    --cb-error: #d85a7a;
    --cb-success: #91c7b1;
    --cb-warning: #e6a978;
    --cb-progress: #d97a9b;
    --cb-border: rgba(217, 122, 155, 0.25);
    --cb-shadow: rgba(217, 122, 155, 0.15);
  }
  :host * { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important; letter-spacing: -0.01em; }
  .cb-panel { box-sizing: border-box; position:fixed; top:var(--cb-space-md); right:var(--cb-space-md); width:400px; max-width:calc(100vw - 24px); max-height:calc(100vh - 120px); overflow-y:auto; overflow-x:hidden; border-radius:var(--cb-radius-xl); background: var(--cb-bg2); color:var(--cb-white) !important; z-index:2147483647; box-shadow: var(--cb-shadow-xl), 0 0 40px rgba(96, 165, 250, 0.1); border: 1px solid var(--cb-border); backdrop-filter: blur(12px); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); word-wrap: break-word; pointer-events:auto; }
  .cb-panel * { max-width: 100%; word-wrap: break-word; overflow-wrap: break-word; }
  .cb-panel::-webkit-scrollbar { width: 10px; }
  .cb-panel::-webkit-scrollbar-track { background: var(--cb-bg); border-radius: 10px; }
  .cb-panel::-webkit-scrollbar-thumb { background: linear-gradient(180deg, var(--cb-accent-primary), var(--cb-accent-secondary)); border-radius: 10px; border: 2px solid var(--cb-bg); }
  .cb-panel::-webkit-scrollbar-thumb:hover { opacity: 0.8; }
  .cb-header { display:flex; flex-direction:row; align-items:flex-start; justify-content:space-between; padding:var(--cb-space-xl) var(--cb-space-xl) var(--cb-space-lg) var(--cb-space-xl); gap:var(--cb-space-md); border-bottom: 1px solid var(--cb-border); }
  .cb-title { font-weight:800; font-size:20px; letter-spacing:-0.02em; color: var(--cb-white); background: linear-gradient(135deg, var(--cb-accent-primary), var(--cb-accent-secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .cb-subtitle { font-size:13px; color: var(--cb-subtext); font-weight:500; margin-top:4px; margin-bottom:2px; letter-spacing:-0.01em; }
    .cb-actions { padding:var(--cb-space-lg) var(--cb-space-xl) var(--cb-space-md) var(--cb-space-xl); display:flex; flex-direction:column; gap:var(--cb-space-md); align-items:stretch; justify-content:flex-start; }
  .cb-actions-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap:var(--cb-space-md); width:100%; }
  .cb-actions .cb-btn { min-width:0; padding:12px 14px; font-size:12px; white-space:nowrap; font-weight:600; letter-spacing:-0.01em; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); text-transform: uppercase; width:100%; position: relative; overflow: hidden; z-index: 0; }
    .cb-btn { background: var(--cb-bg3); border:1px solid var(--cb-border); color:var(--cb-white) !important; padding:12px 16px; border-radius:10px; cursor:pointer; font-size:13px; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); font-weight:600; box-shadow: 0 2px 8px var(--cb-shadow); position: relative; overflow: hidden; }
  .cb-btn::before { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent); transition: left 0.5s ease; pointer-events: none; z-index: 1; }
  .cb-btn:hover::before { left: 100%; }
  .cb-btn:hover { transform:translateY(-2px); box-shadow: 0 4px 16px var(--cb-shadow), 0 0 24px rgba(0, 180, 255, 0.15); border-color: var(--cb-accent-primary); }
  .cb-btn:focus { outline: none; box-shadow: 0 0 0 3px var(--cb-accent-primary); }
  .cb-btn:active { transform:translateY(0px); }
  .cb-btn.cb-loading { animation: cb-pulse 1.5s ease-in-out infinite; pointer-events: none; opacity: 0.7; }
  .cb-btn.cb-success { animation: cb-success 0.4s ease-out; background: var(--cb-success) !important; border-color: var(--cb-success) !important; }
  .cb-btn.cb-active { background: rgba(var(--cb-accent-primary-rgb, 96, 165, 250), 0.15); border-color: var(--cb-accent-primary); }
  .cb-btn-primary { background: linear-gradient(135deg, var(--cb-accent-primary), var(--cb-accent-secondary)); color:#FFFFFF !important; font-weight:700; border: none; box-shadow: var(--cb-shadow-md); position:relative; overflow:visible; }
  .cb-btn-primary:hover { box-shadow: var(--cb-shadow-lg), 0 0 20px rgba(96, 165, 250, 0.3); transform: translateY(-2px); }
  .cb-btn-primary:active { transform: translateY(-1px); box-shadow: var(--cb-shadow-sm); }
  .cb-btn-secondary { background: transparent; border: 1px solid var(--cb-border); color: var(--cb-subtext) !important; font-weight:500; }
  .cb-btn-secondary:hover { background: var(--cb-bg3); border-color: var(--cb-accent-primary); color: var(--cb-white) !important; }
  .cb-btn-tertiary { background: none; border: none; color: var(--cb-subtext) !important; padding:var(--cb-space-sm) var(--cb-space-md); font-weight:500; }
  .cb-btn-tertiary:hover { background: var(--cb-bg3); color: var(--cb-white) !important; }
  .cb-scan-row { padding: 0 var(--cb-space-xl) var(--cb-space-md) var(--cb-space-xl); }
  .cb-scan-wide { width: 100%; margin: 0; padding:var(--cb-space-lg); font-size:var(--cb-text-lg); font-weight:700; border-radius:var(--cb-radius-lg); display:block; letter-spacing:-0.02em; }
      .cb-btn-danger { background: rgba(255,30,86,0.1); border:1px solid rgba(255,30,86,0.3); color:#FF7A9A !important; font-size:13px; padding:8px 12px; }
      .cb-btn-danger:hover { background: rgba(255,30,86,0.15); border-color: rgba(255,30,86,0.5); color:#FF9CB3 !important; box-shadow: 0 4px 12px rgba(255,30,86,0.2); transform: translateY(-2px); }
      .cb-toolbar { display:flex; align-items:center; gap:var(--cb-space-md); padding:var(--cb-space-lg) var(--cb-space-xl); border-bottom: 1px solid var(--cb-border); }
      .cb-label { font-size:12px; color:var(--cb-subtext) !important; font-weight:600; }
  .cb-select { flex:1; appearance:none; background:var(--cb-bg); color:var(--cb-white) !important; border:1px solid var(--cb-border); border-radius:10px; padding:10px 12px; font-size:14px; outline:none; font-weight:500; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: all 0.2s ease; }
      .cb-select:hover { border-color: var(--cb-accent-primary); box-shadow: 0 0 0 3px rgba(0, 180, 255, 0.1); }
      .cb-select:focus { border-color: var(--cb-accent-primary); box-shadow: 0 0 0 3px rgba(0, 180, 255, 0.15); }
  select.cb-select option { background:var(--cb-bg); color:var(--cb-white); }
      .cb-status { padding:0 20px 12px 20px; font-size:12px; color:var(--cb-subtext) !important; }
      .cb-history-wrapper { position: relative; margin:16px 18px; }
      .cb-history-header { display:flex; align-items:center; justify-content:space-between; padding:0 0 10px 0; }
      .cb-history-title { font-size:12px; color:var(--cb-subtext) !important; font-weight:700; letter-spacing:-0.01em; text-transform: uppercase; }
      .cb-history { padding:14px 18px; max-height:260px; overflow-x:hidden; overflow-y:auto; font-size:13px; background: var(--cb-bg); border-radius:10px; border:1px solid var(--cb-border); white-space:pre-wrap; color:var(--cb-white) !important; line-height: 1.6; }
      .cb-history::-webkit-scrollbar { width: 8px; }
      .cb-history::-webkit-scrollbar-track { background: rgba(10,15,28,0.6); border-radius: 10px; }
  .cb-history::-webkit-scrollbar-thumb { background: linear-gradient(180deg, rgba(0,180,255,0.6), rgba(140,30,255,0.5)); border-radius: 10px; border: 2px solid rgba(10,15,28,0.6); }
  .cb-history::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, rgba(0,180,255,0.8), rgba(140,30,255,0.7)); }
      .cb-preview { padding:14px 18px; font-size:13px; color:var(--cb-white) !important; border-top:1px solid var(--cb-border); max-height:200px; overflow-x:hidden; overflow-y:auto; line-height: 1.6; background: var(--cb-bg); }
      .cb-preview::-webkit-scrollbar { width: 8px; }
      .cb-preview::-webkit-scrollbar-track { background: var(--cb-bg3); border-radius: 10px; }
      .cb-preview::-webkit-scrollbar-thumb { background: linear-gradient(180deg, var(--cb-accent-primary), var(--cb-accent-secondary)); border-radius: 10px; border: 2px solid var(--cb-bg3); }
      .cb-preview::-webkit-scrollbar-thumb:hover { opacity: 0.8; }
      .cb-footer { display:flex; justify-content:flex-end; gap:12px; padding:14px 20px }
  .cb-close { background:transparent; border:none; color:var(--cb-subtext) !important; cursor:pointer; font-size:16px; padding:8px; position:absolute; top:12px; right:12px; transition: all 0.2s ease; border-radius: 8px; }
  .cb-close:hover { background: rgba(255,255,255,0.05); color: var(--cb-white) !important; }
  .cb-header { padding-right: 50px; }
      textarea { background: var(--cb-bg); color: var(--cb-white) !important; border: 1px solid var(--cb-border); border-radius: 10px; font-size:14px; padding:12px; font-family:inherit; max-height:200px; overflow-x:hidden; overflow-y:auto; transition: all 0.2s ease; }
      textarea::-webkit-scrollbar { width: 8px; }
      textarea::-webkit-scrollbar-track { background: var(--cb-bg3); border-radius: 10px; }
      textarea::-webkit-scrollbar-thumb { background: linear-gradient(180deg, var(--cb-accent-primary), var(--cb-accent-secondary)); border-radius: 10px; border: 2px solid var(--cb-bg3); }
      textarea::-webkit-scrollbar-thumb:hover { opacity: 0.8; }
      textarea:focus { outline: none; border-color: var(--cb-accent-primary); box-shadow: 0 0 0 3px rgba(0, 180, 255, 0.15); }
      select:focus { outline: none; border-color: var(--cb-accent-primary); box-shadow: 0 0 0 3px rgba(0, 180, 255, 0.15); }
      /* Internal view sections - inline in the sidebar */
      .cb-internal-view { display: none; padding: var(--cb-space-xl); border-top: 1px solid var(--cb-border); background: var(--cb-bg); animation: slideIn 0.3s ease-out; }
      .cb-internal-view.cb-view-active { display: block; }
      @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      .cb-view-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
      .cb-view-close { background:transparent; border:1px solid var(--cb-border); color:var(--cb-white); padding:6px 12px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:600; transition: all 0.2s ease; position:relative; z-index:2; }
      .cb-view-close:hover { background:var(--cb-bg3); border-color: var(--cb-accent-primary); box-shadow: 0 2px 8px rgba(0, 180, 255, 0.2); transform: translateY(-1px); }
      .cb-view-title { font-weight:700; font-size:16px; color:var(--cb-white); letter-spacing:-0.01em; }
      .cb-view-intro { font-size:13px; color:var(--cb-subtext); line-height:1.6; margin:12px 0 16px 0; padding:12px 14px; background:var(--cb-bg3); border-left:3px solid var(--cb-accent-primary); border-radius:8px; }
      .cb-view-select { margin:10px 0 14px 0; width:100%; }
  .cb-view-text { width:100%; min-height:140px; max-height:200px; resize:vertical; background:var(--cb-bg); color:var(--cb-white); border:1px solid var(--cb-border); padding:12px; border-radius:10px; font-family:inherit; white-space:pre-wrap; overflow-y:auto; overflow-x:hidden; font-size:13px; line-height:1.6; transition: all 0.2s ease; }
  .cb-view-text:focus { border-color: var(--cb-accent-primary); box-shadow: 0 0 0 3px rgba(0, 180, 255, 0.15); outline: none; }
  .cb-view-text::-webkit-scrollbar { width: 8px; }
  .cb-view-text::-webkit-scrollbar-track { background: var(--cb-bg3); border-radius: 10px; }
  .cb-view-text::-webkit-scrollbar-thumb { background: linear-gradient(180deg, var(--cb-accent-primary), var(--cb-accent-secondary)); border-radius: 10px; border: 2px solid var(--cb-bg3); }
  .cb-view-text::-webkit-scrollbar-thumb:hover { opacity: 0.8; }
  /* Smart Query search result rows */
  .cb-row-result { margin-bottom: 12px; padding: 12px; background: var(--cb-bg2); border: 1px solid var(--cb-border); border-radius: 8px; transition: all 0.2s ease; }
  .cb-row-result:hover { border-color: var(--cb-accent-primary); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0, 180, 255, 0.15); }
  .cb-row-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 8px; }
  .cb-row-left { font-size: 12px; color: var(--cb-subtext); font-weight: 500; }
  .cb-row-right { display: flex; gap: 6px; }
  .cb-open-btn, .cb-copy-btn { padding: 4px 10px; font-size: 11px; border-radius: 6px; }
  .cb-snippet { font-size: 13px; line-height: 1.5; color: var(--cb-white); margin-bottom: 8px; white-space: pre-wrap; word-break: break-word; }
  .cb-tag-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
  .cb-tag-chip { display: inline-block; padding: 3px 8px; background: var(--cb-accent-primary); color: var(--cb-bg); font-size: 10px; font-weight: 600; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  /* AI Insights Styling */
  .cb-insights-section { display: flex; flex-direction: column; gap: 12px; }
  .cb-insight-block { padding: 10px 12px; background: rgba(0, 180, 255, 0.05); border-left: 3px solid var(--cb-accent-primary); border-radius: 6px; }
  .cb-insight-title { font-weight: 600; font-size: 11px; color: var(--cb-accent-primary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
  .cb-insight-content { font-size: 12px; color: var(--cb-white); line-height: 1.5; }
  .cb-insight-list { margin: 6px 0 0 18px; padding: 0; font-size: 12px; color: var(--cb-white); }
  .cb-insight-list li { margin-bottom: 4px; line-height: 1.4; }
  .cb-code-snippet { background: var(--cb-bg); border: 1px solid var(--cb-border); border-radius: 6px; padding: 8px; font-size: 11px; font-family: 'Courier New', monospace; color: var(--cb-accent-tertiary); overflow-x: auto; margin: 6px 0; }
  .cb-code-snippet::-webkit-scrollbar { height: 6px; }
  .cb-code-snippet::-webkit-scrollbar-track { background: var(--cb-bg3); }
  .cb-code-snippet::-webkit-scrollbar-thumb { background: var(--cb-accent-primary); border-radius: 3px; }
  /* Empty States */
  .cb-empty-state { text-align: center; padding: var(--cb-space-3xl) var(--cb-space-xl); color: var(--cb-subtext); animation: cb-fade-in 0.4s ease-out; }
  .cb-empty-state-icon { font-size: 56px; margin-bottom: var(--cb-space-lg); opacity: 0.4; filter: grayscale(0.3); }
  .cb-empty-state-title { font-size: var(--cb-text-lg); font-weight: 600; color: var(--cb-white); margin-bottom: var(--cb-space-sm); }
  .cb-empty-state-text { font-size: var(--cb-text-sm); line-height: 1.6; margin-bottom: var(--cb-space-xl); max-width: 280px; margin-left: auto; margin-right: auto; opacity: 0.9; }
  .cb-empty-state-action { margin-top: var(--cb-space-md); }
  /* Success/Error Feedback */
  .cb-feedback-toast { position: fixed; bottom: 80px; right: 24px; background: var(--cb-bg2); border: 1px solid var(--cb-border); border-radius: 10px; padding: 12px 16px; box-shadow: 0 8px 24px var(--cb-shadow); z-index: 2147483648; animation: cb-slide-up 0.3s ease-out; max-width: 300px; }
  .cb-feedback-toast.success { border-color: var(--cb-success); background: rgba(var(--cb-success-rgb, 16, 185, 129), 0.1); }
  .cb-feedback-toast.error { border-color: var(--cb-error); background: rgba(var(--cb-error-rgb, 239, 68, 68), 0.1); }
  /* Context Panel Styling */
  .cb-context-panel::-webkit-scrollbar { width: 8px; }
  .cb-context-panel::-webkit-scrollbar-track { background: var(--cb-bg3); border-radius: 10px; }
  .cb-context-panel::-webkit-scrollbar-thumb { background: linear-gradient(180deg, var(--cb-accent-primary), var(--cb-accent-secondary)); border-radius: 10px; border: 2px solid var(--cb-bg3); }
  .cb-context-panel::-webkit-scrollbar-thumb:hover { opacity: 0.8; }
      .cb-view-controls { margin:var(--cb-space-lg) 0; display:flex; gap:var(--cb-space-md); align-items:stretch; flex-wrap:wrap; }
      .cb-view-controls > * { min-width:0; flex:1 1 auto; }
      .cb-view-controls .cb-select { min-width:120px; }
      .cb-view-controls .cb-btn { flex:0 0 auto; min-width:80px; }
      .cb-view-go { margin-top:12px; }
  .cb-view-result { margin-top:16px; padding:14px; background: var(--cb-bg); border:1px solid var(--cb-border); border-radius:10px; white-space:pre-wrap; color:var(--cb-white); font-size:13px; line-height:1.6; max-height:200px; overflow-y:auto; overflow-x:hidden; }
  .cb-progress { display:inline-block; margin-left:10px; font-size:12px; color:var(--cb-subtext); opacity:0.9; font-weight:500; }
  .cb-dots { display:inline-block; }
  .cb-dots .dot { display:inline-block; opacity:0.25; animation: cb-ellipsis 1.1s ease-in-out infinite; }
  .cb-dots .dot:nth-child(2) { animation-delay: .18s; }
  .cb-dots .dot:nth-child(3) { animation-delay: .36s; }
  /* Reply list for assistant messages - compact preview mode */
  .cb-replies-wrap { margin-top: 12px; }
  .cb-replies-header { display:flex; align-items:center; justify-content:space-between; padding:8px 0 12px 0; border-bottom: 2px solid rgba(0, 180, 255, 0.12); }
  .cb-replies-title { font-size:14px; color:var(--cb-white); font-weight:700; letter-spacing:0.02em; text-transform: uppercase; background: linear-gradient(135deg, var(--cb-accent-primary), var(--cb-accent-secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .cb-replies { padding: 16px; max-height: 300px; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; gap: 12px; background: linear-gradient(180deg, rgba(10,15,28,0.4), rgba(16,24,43,0.3)); border: 1px solid rgba(0,180,255,0.15); border-radius: 12px; transition: padding-bottom 0.3s ease; box-shadow: inset 0 2px 8px rgba(0,0,0,0.2); }
  .cb-replies.cb-editor-open { padding-bottom: 220px; } /* Prevent overlap when editor is visible */
  .cb-replies::-webkit-scrollbar { width: 8px; }
  .cb-replies::-webkit-scrollbar-track { background: rgba(16,24,43,0.4); border-radius: 10px; }
  .cb-replies::-webkit-scrollbar-thumb { background: linear-gradient(180deg, var(--cb-accent-primary), var(--cb-accent-secondary)); border-radius: 10px; border: 2px solid rgba(10,15,28,0.4); }
  .cb-reply { background: linear-gradient(135deg, rgba(16,24,43,0.9), rgba(10,15,28,0.85)); border: 1px solid rgba(0,180,255,0.2); border-radius: 12px; padding: 14px 16px; font-size: 13px; line-height: 1.5; cursor: pointer; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); position:relative; min-height: 56px; max-height: 68px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
  .cb-reply:hover { border-color: rgba(0,180,255,0.6); box-shadow: 0 6px 20px rgba(0, 180, 255, 0.25), 0 0 24px rgba(96, 165, 250, 0.15); transform: translateY(-2px) scale(1.01); background: linear-gradient(135deg, rgba(20,28,50,0.95), rgba(12,18,32,0.9)); }
  .cb-reply.cb-selected { border-color: var(--cb-accent-primary); background: linear-gradient(135deg, rgba(14,165,233,0.18), rgba(96,165,250,0.12)); box-shadow: 0 8px 24px rgba(14,165,233,0.35), inset 0 1px 0 rgba(255,255,255,0.08); border-width: 2px; }
  .cb-reply-preview { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; color: var(--cb-white); font-size: 13px; line-height: 1.5; white-space: normal; word-break: break-word; font-weight: 500; }
  .cb-reply-meta { font-size: 11px; color: rgba(160,167,181,0.8); margin-top: 6px; opacity: 0.85; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
  /* Rewrite editor section (shown when a reply is selected) */
  .cb-rewrite-editor { display: none; margin-top: 16px; padding: 18px; background: linear-gradient(135deg, rgba(16,24,43,0.95), rgba(10,15,28,0.9)); border: 1px solid rgba(0,180,255,0.25); border-radius: 12px; animation: slideIn 0.3s ease-out; box-shadow: 0 4px 16px rgba(0,0,0,0.25); }
  .cb-rewrite-editor.cb-active { display: block; }
  .cb-editor-label { font-size: 12px; color: var(--cb-white); font-weight: 700; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.8px; background: linear-gradient(135deg, var(--cb-accent-primary), var(--cb-accent-secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .cb-editor-textarea { width: 100%; min-height: 160px; max-height: 240px; resize: vertical; background: rgba(10,15,28,0.6); color: var(--cb-white); border: 1px solid rgba(0,180,255,0.2); padding: 14px; border-radius: 10px; font-family: inherit; font-size: 13px; line-height: 1.7; overflow-y: auto; transition: all 0.25s ease; box-shadow: inset 0 2px 6px rgba(0,0,0,0.2); }
  .cb-editor-textarea:focus { border-color: var(--cb-accent-primary); box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.18), inset 0 2px 6px rgba(0,0,0,0.2); outline: none; }
  .cb-editor-actions { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
  .cb-editor-actions > .cb-btn { flex: 1 1 auto; min-width: 90px; padding: 10px 16px; font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
  .cb-editor-actions > .cb-btn:hover { box-shadow: 0 4px 14px rgba(0,180,255,0.3); transform: translateY(-1px); }
  .cb-style-hint-wrap { margin-top: 10px; }
  .cb-input { width: 100%; background: var(--cb-bg); color: var(--cb-white); border: 1px solid var(--cb-border); padding: 8px 10px; border-radius: 8px; font-size: 13px; font-family: inherit; transition: all 0.2s ease; }
  .cb-input:focus { border-color: var(--cb-accent-primary); box-shadow: 0 0 0 3px rgba(0, 180, 255, 0.12); outline: none; }
  /* small inline spinner used with loading buttons */
  .cb-spinner { display:inline-block; width:14px; height:14px; border-radius:50%; vertical-align:middle; margin-right:8px; background: conic-gradient(var(--cb-progress), rgba(255,255,255,0.9)); box-shadow: 0 0 12px rgba(0, 180, 255, 0.3), 0 0 0 1px rgba(0,0,0,0.08) inset; animation: cb-spin 0.9s linear infinite; }
  @keyframes cb-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes cb-ellipsis { 0% { opacity:0.25; transform: translateY(0); } 30% { opacity:1; transform: translateY(-2px); } 60% { opacity:0.25; transform: translateY(0); } 100% { opacity:0.25; transform: translateY(0); } }
  @keyframes cb-pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.8; transform: scale(0.98); } 100% { opacity: 1; transform: scale(1); } }
  @keyframes cb-success { 0% { transform: scale(0.8); opacity: 0; } 50% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
  @keyframes cb-shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
  @keyframes cb-fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes cb-slide-up { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }\r
  @keyframes cb-pulse-glow { 0%, 100% { box-shadow: 0 4px 12px rgba(0, 180, 255, 0.3), 0 0 20px rgba(96, 165, 250, 0.2); } 50% { box-shadow: 0 4px 20px rgba(0, 180, 255, 0.5), 0 0 32px rgba(96, 165, 250, 0.35); } }
    `;
    shadow.appendChild(style);
    // Apply saved theme preference - DEFAULT TO DARK
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['cb_theme'], (r) => {
          try {
            const theme = r?.cb_theme || 'dark';
            // Remove all theme classes first
            host.classList.remove('cb-theme-light', 'cb-theme-synthwave', 'cb-theme-aurora', 'cb-theme-nebula', 'cb-theme-rose');

            // Apply selected theme
            if (theme === 'light') {
              host.classList.add('cb-theme-light');
            } else if (theme === 'synthwave') {
              host.classList.add('cb-theme-synthwave');
            } else if (theme === 'aurora') {
              host.classList.add('cb-theme-aurora');
            } else if (theme === 'nebula') {
              host.classList.add('cb-theme-nebula');
            } else if (theme === 'rose') {
              host.classList.add('cb-theme-rose');
            }
            // dark is default (no class needed)
          } catch (e) { }
        });
      }
    } catch (e) { }

    const panel = document.createElement('div'); panel.className = 'cb-panel';

    // Load saved panel width
    try {
      const savedWidth = localStorage.getItem('chatbridge:panel_width');
      if (savedWidth) {
        panel.style.width = savedWidth + 'px';
      }
    } catch (e) { }

    // Add resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'cb-resize-handle';
    resizeHandle.innerHTML = '⋮⋮';
    resizeHandle.style.cssText = `
      position: absolute;
      bottom: 8px;
      right: 8px;
      width: 24px;
      height: 24px;
      cursor: nwse-resize;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      color: var(--cb-subtext);
      opacity: 0.5;
      transition: opacity 0.2s;
      z-index: 10;
      user-select: none;
    `;

    resizeHandle.addEventListener('mouseenter', () => {
      resizeHandle.style.opacity = '1';
    });
    resizeHandle.addEventListener('mouseleave', () => {
      resizeHandle.style.opacity = '0.5';
    });

    // Resize functionality
    let isResizing = false;
    let startX, startWidth;

    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = parseInt(document.defaultView.getComputedStyle(panel).width, 10);
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      const deltaX = startX - e.clientX;
      const newWidth = Math.max(300, Math.min(800, startWidth + deltaX));
      panel.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        // Save the new width
        try {
          const finalWidth = parseInt(document.defaultView.getComputedStyle(panel).width, 10);
          localStorage.setItem('chatbridge:panel_width', finalWidth);
        } catch (e) { }
      }
    });

    panel.appendChild(resizeHandle);

    // Header: Title and subtitle with CB badge
    const header = document.createElement('div'); header.className = 'cb-header';

    // CB Monogram Badge
    const badge = document.createElement('div');
    badge.className = 'cb-badge';
    badge.textContent = 'CB';
    badge.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, var(--cb-accent-primary), var(--cb-accent-secondary)); color: #ffffff; font-weight: 800; font-size: 14px; letter-spacing: -0.5px; box-shadow: 0 4px 12px rgba(0, 180, 255, 0.3); margin-right: 12px;';

    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display: flex; align-items: center; gap: 0;';

    const title = document.createElement('div');
    title.className = 'cb-title';
    title.textContent = 'ChatBridge';
    title.style.fontSize = '22px';

    titleRow.appendChild(badge);
    titleRow.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.className = 'cb-subtitle';
    subtitle.textContent = 'Bridge AI conversations seamlessly';

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.flexDirection = 'column';
    left.style.gap = '6px';
    left.style.alignItems = 'flex-start';
    left.appendChild(title);
    left.appendChild(subtitle);

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.alignItems = 'flex-start';
    controls.style.gap = '8px';

    const btnSettings = document.createElement('button');
    btnSettings.className = 'cb-btn';
    btnSettings.textContent = '⚙️';
    btnSettings.title = 'Settings';
    btnSettings.style.cssText = 'padding: 6px 10px; font-size: 16px;';
    btnSettings.setAttribute('aria-label', 'Open settings');

    const btnClose = document.createElement('button');
    btnClose.className = 'cb-close';
    btnClose.textContent = '✕';
    btnClose.setAttribute('aria-label', 'Close panel');

    controls.appendChild(btnSettings);
    controls.appendChild(btnClose);
    header.appendChild(left);
    header.appendChild(controls);
    panel.appendChild(header);

    // Actions: Scan, Restore, Gemini APIs
    const actions = document.createElement('div'); actions.className = 'cb-actions';

    // Create a neat grid for secondary actions (luxury layout)
    const actionsGrid = document.createElement('div'); actionsGrid.className = 'cb-actions-grid';

    const btnScan = document.createElement('button');
    btnScan.className = 'cb-btn cb-btn-primary cb-scan-wide';
    btnScan.innerHTML = '🔍 Scan Chat';
    btnScan.title = 'Capture this conversation - Save it for later, search across it, or continue on another AI [Shortcut: S]';
    btnScan.id = 'btnScan';
    btnScan.style.cssText = 'animation: cb-pulse-glow 2s ease-in-out infinite;';
    const btnRestore = document.createElement('button'); btnRestore.className = 'cb-btn'; btnRestore.textContent = 'Restore'; btnRestore.title = 'Continue where you left off - Pick any saved chat and paste it into this AI'; btnRestore.setAttribute('aria-label', 'Restore conversation');
    const btnClipboard = document.createElement('button'); btnClipboard.className = 'cb-btn'; btnClipboard.textContent = 'Copy'; btnClipboard.title = 'Quick export - Copy this conversation to share or save externally'; btnClipboard.setAttribute('aria-label', 'Copy conversation to clipboard');
    const btnSmartQuery = document.createElement('button'); btnSmartQuery.className = 'cb-btn'; btnSmartQuery.textContent = 'Query'; btnSmartQuery.title = 'Ask questions across ALL your saved chats - Natural language search powered by AI'; btnSmartQuery.setAttribute('aria-label', 'Open Smart Query');
    const btnKnowledgeGraph = document.createElement('button'); btnKnowledgeGraph.className = 'cb-btn'; btnKnowledgeGraph.textContent = 'Agent'; btnKnowledgeGraph.title = 'AI Agent – analyze this chat and suggest next actions'; btnKnowledgeGraph.setAttribute('aria-label', 'Open Agent');
    const btnInsights = document.createElement('button'); btnInsights.className = 'cb-btn'; btnInsights.textContent = 'Insights'; btnInsights.title = 'Smart workspace tools - Compare, merge, extract, and organize your conversations'; btnInsights.setAttribute('aria-label', 'Open Smart Workspace');

    // Gemini API buttons
    const btnPromptDesigner = document.createElement('button'); btnPromptDesigner.className = 'cb-btn'; btnPromptDesigner.textContent = 'Prompts'; btnPromptDesigner.title = 'AI-powered prompt suggestions - Get smart next steps for your conversation';
    const btnSummarize = document.createElement('button'); btnSummarize.className = 'cb-btn'; btnSummarize.textContent = 'Summarize'; btnSummarize.title = 'Get the key points - Condense long chats into concise summaries';
    const btnRewrite = document.createElement('button'); btnRewrite.className = 'cb-btn'; btnRewrite.textContent = 'Rewrite'; btnRewrite.title = 'Polish your content - Improve clarity, tone, and professionalism. Adapt for different AI models';
    const btnTranslate = document.createElement('button'); btnTranslate.className = 'cb-btn'; btnTranslate.textContent = 'Translate'; btnTranslate.title = 'Break language barriers - Convert chats to 20+ languages instantly';
    btnPromptDesigner.setAttribute('aria-label', 'Open Prompt Designer');
    btnSummarize.setAttribute('aria-label', 'Summarize conversation');
    btnRewrite.setAttribute('aria-label', 'Rewrite conversation');
    btnTranslate.setAttribute('aria-label', 'Translate conversation');

    // Place Scan button prominently in its own row below the header
    try {
      const scanRow = document.createElement('div'); scanRow.className = 'cb-scan-row';
      scanRow.appendChild(btnScan);
      panel.appendChild(scanRow);
    } catch (e) { try { row1.appendChild(btnScan); } catch (e2) { } }

    // Grid: Restore, Query, Graph, Insights, Copy, Prompts, Summarize, Rewrite, Translate
    [
      btnRestore,
      btnSmartQuery,
      btnKnowledgeGraph,
      btnInsights,
      btnClipboard,
      btnPromptDesigner,
      btnSummarize,
      btnRewrite,
      btnTranslate
    ].forEach(b => actionsGrid.appendChild(b));

    actions.appendChild(actionsGrid);
    panel.appendChild(actions);

    // Toolbar preview (moved above the Gemini textarea)
    const preview = document.createElement('div'); preview.className = 'cb-preview'; preview.textContent = 'Preview: (none)';

    // --- Internal views (Prompt Designer, Summarize, Rewrite, Translate) - inline sections ---

    // Prompt Designer view - Modern Clean Design
    const promptDesignerView = document.createElement('div');
    promptDesignerView.className = 'cb-internal-view';
    promptDesignerView.id = 'cb-prompt-designer-view';
    promptDesignerView.setAttribute('data-cb-ignore', 'true');

    const pdTop = document.createElement('div');
    pdTop.className = 'cb-view-top';
    pdTop.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--cb-border);';

    const pdTitle = document.createElement('div');
    pdTitle.className = 'cb-view-title';
    pdTitle.style.cssText = 'font-size: 20px; font-weight: 700; color: var(--cb-white); display: flex; align-items: center; gap: 10px;';
    pdTitle.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="url(#gradient)" stroke="var(--cb-accent-primary)" stroke-width="1.5"/><defs><linearGradient id="gradient" x1="2" y1="2" x2="22" y2="21" gradientUnits="userSpaceOnUse"><stop stop-color="var(--cb-accent-primary)"/><stop offset="1" stop-color="var(--cb-accent-secondary)"/></linearGradient></defs></svg><span>Smart Prompts</span>';

    const btnClosePD = document.createElement('button');
    btnClosePD.className = 'cb-view-close';
    btnClosePD.textContent = '✕';
    btnClosePD.style.cssText = 'background: transparent; border: none; color: var(--cb-subtext); cursor: pointer; font-size: 20px; padding: 4px 8px; border-radius: 6px; transition: all 0.2s ease; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;';
    btnClosePD.setAttribute('aria-label', 'Close Prompt Designer view');
    btnClosePD.addEventListener('mouseenter', () => { btnClosePD.style.background = 'rgba(255, 255, 255, 0.05)'; btnClosePD.style.color = 'var(--cb-white)'; });
    btnClosePD.addEventListener('mouseleave', () => { btnClosePD.style.background = 'transparent'; btnClosePD.style.color = 'var(--cb-subtext)'; });

    pdTop.appendChild(pdTitle);
    pdTop.appendChild(btnClosePD);
    promptDesignerView.appendChild(pdTop);

    const pdIntro = document.createElement('div');
    pdIntro.className = 'cb-view-intro';
    pdIntro.style.cssText = 'font-size:11px;line-height:1.4;color:var(--cb-subtext);margin-bottom:12px;padding:8px 12px;background:linear-gradient(135deg,rgba(96,165,250,0.06),rgba(167,139,250,0.06));border:1px solid rgba(96,165,250,0.1);border-radius:8px;';
    pdIntro.innerHTML = 'Click a category below to generate tailored prompts.';
    promptDesignerView.appendChild(pdIntro);

    // Prompt Designer content container - DROPDOWN CATEGORIES
    const pdContent = document.createElement('div');
    pdContent.id = 'cb-pd-content';
    pdContent.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

    // Add Generate Ideas button
    const btnGenerateIdeas = document.createElement('button');
    btnGenerateIdeas.className = 'cb-btn cb-btn-primary';
    btnGenerateIdeas.innerHTML = '✨ Generate Prompt Ideas';
    btnGenerateIdeas.style.cssText = 'margin-bottom:12px;padding:10px 14px;font-weight:600;font-size:12px;background:linear-gradient(135deg,rgba(96,165,250,0.2),rgba(167,139,250,0.2));border:1px solid rgba(96,165,250,0.3);border-radius:8px;color:var(--cb-white);cursor:pointer;transition:all 0.2s;';
    btnGenerateIdeas.addEventListener('mouseenter', () => { btnGenerateIdeas.style.background = 'linear-gradient(135deg,rgba(96,165,250,0.35),rgba(167,139,250,0.35))'; });
    btnGenerateIdeas.addEventListener('mouseleave', () => { btnGenerateIdeas.style.background = 'linear-gradient(135deg,rgba(96,165,250,0.2),rgba(167,139,250,0.2))'; });

    btnGenerateIdeas.addEventListener('click', async () => {
      try {
        btnGenerateIdeas.disabled = true;
        btnGenerateIdeas.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;"><span class="cb-spinner" style="width:14px;height:14px;border-width:2px;"></span> Generating...</span>';

        // Get conversation context
        let messages = [];
        const lastScan = window.ChatBridge?.getLastScan?.();
        if (lastScan && lastScan.messages && lastScan.messages.length > 0) {
          messages = lastScan.messages;
        } else {
          // Try to scan
          try {
            messages = await scanChat();
          } catch (e) { }
        }

        if (!messages || messages.length === 0) {
          toast('No conversation found. Please scan first.');
          btnGenerateIdeas.disabled = false;
          btnGenerateIdeas.innerHTML = '✨ Generate Prompt Ideas';
          return;
        }

        const contextText = messages.slice(-8).map(m => `${m.role}: ${m.text.substring(0, 300)}`).join('\n');
        const prompt = `Based on this conversation, generate 6 smart follow-up prompts in 3 categories.

Conversation:
${contextText}

Generate exactly 6 prompts in this format (2 per category):
FOLLOW-UP:
1. [prompt text here]
2. [prompt text here]
DEEP-DIVE:
3. [prompt text here]
4. [prompt text here]
CREATIVE:
5. [prompt text here]
6. [prompt text here]

Each prompt should be concise (1-2 sentences) and actionable. Output ONLY the prompts in the format above.`;

        // Call Llama model
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            type: 'call_llama',
            payload: {
              action: 'generate',
              text: prompt
            }
          }, (res) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(res || { ok: false, error: 'No response' });
            }
          });
        });

        if (response && response.ok && response.result) {
          // Parse the response
          const result = response.result;

          const categories = [
            { name: 'Follow-up', icon: '🎯', color: '#60a5fa', prompts: [] },
            { name: 'Deep-dive', icon: '🔍', color: '#a78bfa', prompts: [] },
            { name: 'Creative', icon: '💡', color: '#f59e0b', prompts: [] }
          ];

          // Parse prompts from response
          const lines = result.split('\n').filter(l => l.trim());
          let currentCategory = 0;

          lines.forEach(line => {
            if (line.toUpperCase().includes('FOLLOW')) currentCategory = 0;
            else if (line.toUpperCase().includes('DEEP')) currentCategory = 1;
            else if (line.toUpperCase().includes('CREATIVE')) currentCategory = 2;
            else {
              const match = line.match(/^\d+[\.\)]\s*(.+)/);
              if (match && match[1]) {
                categories[currentCategory].prompts.push(match[1].trim());
              }
            }
          });

          // If parsing failed, try to extract any numbered items
          if (categories.every(c => c.prompts.length === 0)) {
            const allPrompts = result.match(/\d+[\.\)]\s*[^\n]+/g) || [];
            allPrompts.forEach((p, i) => {
              const text = p.replace(/^\d+[\.\)]\s*/, '').trim();
              if (text) categories[i % 3].prompts.push(text);
            });
          }

          // Build beautiful UI
          let html = '';

          categories.forEach(cat => {
            if (cat.prompts.length > 0) {
              html += `
                <div style="margin-bottom:12px;">
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                    <span style="font-size:14px;">${cat.icon}</span>
                    <span style="font-size:11px;font-weight:600;color:${cat.color};text-transform:uppercase;letter-spacing:0.3px;">${cat.name}</span>
                  </div>
                  ${cat.prompts.map(p => `
                    <div class="cb-smart-prompt" data-prompt="${encodeURIComponent(p)}" style="padding:10px 12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:8px;margin-bottom:6px;cursor:pointer;transition:all 0.15s;font-size:11px;color:var(--cb-white);line-height:1.4;">
                      ${p}
                    </div>
                  `).join('')}
                </div>
              `;
            }
          });

          if (!html) {
            html = '<div style="text-align:center;padding:20px;color:var(--cb-subtext);">Could not parse suggestions. Try again.</div>';
          }

          html += '<div style="font-size:9px;color:var(--cb-subtext);text-align:center;margin-top:8px;">Click a prompt to copy • Double-click to insert</div>';

          pdContent.innerHTML = html;

          // Add click handlers
          pdContent.querySelectorAll('.cb-smart-prompt').forEach(card => {
            // Hover effects
            card.addEventListener('mouseenter', () => {
              card.style.background = 'rgba(96,165,250,0.1)';
              card.style.borderColor = 'rgba(96,165,250,0.3)';
              card.style.transform = 'translateX(2px)';
            });
            card.addEventListener('mouseleave', () => {
              card.style.background = 'rgba(255,255,255,0.02)';
              card.style.borderColor = 'rgba(255,255,255,0.06)';
              card.style.transform = 'translateX(0)';
            });

            // Single click = copy
            card.addEventListener('click', async () => {
              const text = decodeURIComponent(card.dataset.prompt);
              await navigator.clipboard.writeText(text);
              card.style.background = 'rgba(52,211,153,0.15)';
              setTimeout(() => { card.style.background = 'rgba(255,255,255,0.02)'; }, 300);
              toast('Copied!');
            });

            // Double click = insert into chat
            card.addEventListener('dblclick', async () => {
              const text = decodeURIComponent(card.dataset.prompt);
              const input = document.querySelector('textarea, div[contenteditable="true"], [role="textbox"]');
              if (input) {
                if (input.isContentEditable || input.contentEditable === 'true') {
                  input.focus();
                  input.textContent = text;
                  input.dispatchEvent(new InputEvent('input', { bubbles: true }));
                } else {
                  input.focus();
                  input.value = text;
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                }
                toast('Inserted!');
              } else {
                await navigator.clipboard.writeText(text);
                toast('Copied (no input found)');
              }
            });
          });

          toast('Ideas generated!');
        } else {
          throw new Error(response?.error || response?.message || 'Failed to generate ideas');
        }
      } catch (err) {
        console.error('[Smart Prompts] Generate error:', err);
        pdContent.innerHTML = `
          <div style="text-align:center;padding:20px;">
            <div style="font-size:24px;margin-bottom:8px;">😔</div>
            <div style="color:var(--cb-subtext);font-size:12px;margin-bottom:12px;">Failed to generate ideas</div>
            <div style="font-size:10px;color:var(--cb-subtext);opacity:0.7;">${err.message || 'Please try again'}</div>
          </div>
        `;
        toast('Generation failed');
      } finally {
        btnGenerateIdeas.disabled = false;
        btnGenerateIdeas.innerHTML = '✨ Generate Prompt Ideas';
      }
    });
    promptDesignerView.appendChild(btnGenerateIdeas);

    // Inject styles for dynamic content
    const pdStyle = document.createElement('style');
    pdStyle.textContent = `
      #cb-pd-content .cb-btn { width: 100%; text-align: left; margin-bottom: 8px; padding: 12px; background: var(--cb-bg3); border: 1px solid var(--cb-border); border-radius: 8px; transition: all 0.2s ease; }
      #cb-pd-content .cb-btn:hover { background: var(--cb-accent-primary-dim); border-color: var(--cb-accent-primary); transform: translateX(2px); }
      #cb-pd-content .cb-prompt-card { background: rgba(255,255,255,0.03); border: 1px solid var(--cb-border); border-radius: 10px; padding: 16px; margin-bottom: 12px; }
      #cb-pd-content .cb-prompt-title { font-weight: 600; color: var(--cb-white); margin-bottom: 8px; font-size: 14px; }
      #cb-pd-content .cb-prompt-text { color: var(--cb-subtext); font-size: 13px; line-height: 1.5; }
    `;
    promptDesignerView.appendChild(pdStyle);
    promptDesignerView.appendChild(pdContent);

    // Append to panel
    panel.appendChild(promptDesignerView);

    // Summarize view
    const summView = document.createElement('div'); summView.className = 'cb-internal-view'; summView.id = 'cb-summ-view'; summView.setAttribute('data-cb-ignore', 'true');
    const summTop = document.createElement('div'); summTop.className = 'cb-view-top';
    const summTitle = document.createElement('div'); summTitle.className = 'cb-view-title'; summTitle.textContent = '📝 Summarize';
    const btnCloseSumm = document.createElement('button'); btnCloseSumm.className = 'cb-view-close'; btnCloseSumm.textContent = '✕';
    btnCloseSumm.setAttribute('aria-label', 'Close Summarize view');
    summTop.appendChild(summTitle); summTop.appendChild(btnCloseSumm);
    summView.appendChild(summTop);
    const summIntro = document.createElement('div'); summIntro.className = 'cb-view-intro';
    summIntro.style.cssText = 'font-size: 13px; line-height: 1.6; color: var(--cb-subtext); margin-bottom: 16px; padding: 12px 14px; background: linear-gradient(135deg, rgba(96, 165, 250, 0.08), rgba(167, 139, 250, 0.08)); border: 1px solid rgba(96, 165, 250, 0.15); border-radius: 10px;';
    summIntro.innerHTML = '<div style="font-weight: 600; color: var(--cb-white); margin-bottom: 4px;">Extract Key Insights</div>Perfect for quick reviews, sharing highlights, or creating meeting notes.';
    summView.appendChild(summIntro);

    // Stats display (word count, char count, estimated time)
    const summStats = document.createElement('div');
    summStats.id = 'cb-summ-stats';
    summStats.style.cssText = 'font-size: 11px; color: var(--cb-subtext); padding: 8px 12px; background: rgba(0,0,0,0.2); border-radius: 6px; margin-bottom: 12px; display: flex; gap: 16px; flex-wrap: wrap;';
    summStats.innerHTML = '<span>📊 Words: --</span><span>📝 Chars: --</span><span>⏱️ Est. time: --</span>';
    summView.appendChild(summStats);

    const summControls = document.createElement('div'); summControls.className = 'cb-view-controls';
    summControls.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;';
    const summLengthLabel = document.createElement('label'); summLengthLabel.className = 'cb-label'; summLengthLabel.textContent = 'Length:';
    summLengthLabel.style.cssText = 'font-size: 11px; font-weight: 600; color: var(--cb-subtext); text-transform: uppercase; letter-spacing: 0.5px;';
    const summLengthSelect = document.createElement('select'); summLengthSelect.className = 'cb-select'; summLengthSelect.id = 'cb-summ-length';
    summLengthSelect.style.cssText = 'width: 100%; background: var(--cb-bg3); border: 1px solid var(--cb-border); color: var(--cb-white); padding: 8px 10px; border-radius: 6px; font-size: 13px;';
    ['concise', 'short', 'medium', 'comprehensive', 'detailed'].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v.charAt(0).toUpperCase() + v.slice(1); summLengthSelect.appendChild(o); });
    summLengthSelect.value = 'medium';
    const summTypeLabel = document.createElement('label'); summTypeLabel.className = 'cb-label'; summTypeLabel.textContent = 'Style:';
    summTypeLabel.style.cssText = 'font-size: 11px; font-weight: 600; color: var(--cb-subtext); text-transform: uppercase; letter-spacing: 0.5px;';
    const summTypeSelect = document.createElement('select'); summTypeSelect.className = 'cb-select'; summTypeSelect.id = 'cb-summ-type';
    summTypeSelect.style.cssText = 'width: 100%; background: var(--cb-bg3); border: 1px solid var(--cb-border); color: var(--cb-white); padding: 8px 10px; border-radius: 6px; font-size: 13px;';
    // Include a specialized AI-to-AI transfer style optimized for cross-model handoff
    const summTypes = ['paragraph', 'bullet', 'detailed', 'executive', 'technical', 'transfer'];
    summTypes.forEach(v => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = (v === 'transfer') ? 'AI-to-AI Transfer' : (v.charAt(0).toUpperCase() + v.slice(1));
      summTypeSelect.appendChild(o);
    });
    summTypeSelect.value = 'paragraph';

    const lengthGroup = document.createElement('div'); lengthGroup.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
    lengthGroup.appendChild(summLengthLabel); lengthGroup.appendChild(summLengthSelect);
    const typeGroup = document.createElement('div'); typeGroup.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
    typeGroup.appendChild(summTypeLabel); typeGroup.appendChild(summTypeSelect);
    summControls.appendChild(lengthGroup); summControls.appendChild(typeGroup);
    summView.appendChild(summControls);

    // Restore saved summary preferences
    try {
      const savedLen = localStorage.getItem('chatbridge:pref:summLength');
      const savedType = localStorage.getItem('chatbridge:pref:summType');
      if (savedLen) summLengthSelect.value = savedLen;
      if (savedType) summTypeSelect.value = savedType;
    } catch (e) { }
    summLengthSelect.addEventListener('change', () => { try { localStorage.setItem('chatbridge:pref:summLength', summLengthSelect.value); } catch (e) { } });
    summTypeSelect.addEventListener('change', () => { try { localStorage.setItem('chatbridge:pref:summType', summTypeSelect.value); } catch (e) { } });
    const summSourceText = document.createElement('div'); summSourceText.className = 'cb-view-text'; summSourceText.id = 'cb-summ-source-text'; summSourceText.setAttribute('contenteditable', 'false'); summSourceText.textContent = '';
    summSourceText.style.cssText = 'max-height: 200px; overflow-y: auto; padding: 12px; background: rgba(0,0,0,0.15); border-radius: 8px; border: 1px solid var(--cb-border); font-size: 12px; line-height: 1.5; margin-bottom: 12px;';
    summView.appendChild(summSourceText);

    // Button row
    const summBtnRow = document.createElement('div'); summBtnRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 12px;';
    const btnGoSumm = document.createElement('button'); btnGoSumm.className = 'cb-btn cb-btn-primary cb-view-go'; btnGoSumm.textContent = '✨ Summarize';
    btnGoSumm.style.cssText = 'flex: 1; padding: 10px 16px; font-weight: 600;';
    const btnCopySumm = document.createElement('button'); btnCopySumm.className = 'cb-btn'; btnCopySumm.textContent = '📋 Copy';
    btnCopySumm.style.cssText = 'padding: 10px 16px;';
    summBtnRow.appendChild(btnGoSumm); summBtnRow.appendChild(btnCopySumm);
    summView.appendChild(summBtnRow);

    const summProg = document.createElement('span'); summProg.className = 'cb-progress'; summProg.style.display = 'none'; summView.appendChild(summProg);
    const btnInsertSumm = document.createElement('button'); btnInsertSumm.className = 'cb-btn cb-view-go'; btnInsertSumm.textContent = '⬆️ Insert to Chat'; btnInsertSumm.style.display = 'none';
    summView.appendChild(btnInsertSumm);
    const summResult = document.createElement('div'); summResult.className = 'cb-view-result'; summResult.id = 'cb-summ-result'; summResult.textContent = '';
    summResult.style.cssText = 'font-size: 12px; color: var(--cb-subtext); padding: 8px 0;';
    summView.appendChild(summResult);

    // Helper to update stats display
    function updateSummStats(text) {
      try {
        const statsEl = summView.querySelector('#cb-summ-stats');
        if (!statsEl) return;
        const words = text ? text.trim().split(/\s+/).filter(w => w.length > 0).length : 0;
        const chars = text ? text.length : 0;
        const estSeconds = Math.max(2, Math.ceil(chars / 1500)); // ~1500 chars/sec processing
        statsEl.innerHTML = `<span>📊 Words: ${words.toLocaleString()}</span><span>📝 Chars: ${chars.toLocaleString()}</span><span>⏱️ Est. time: ~${estSeconds}s</span>`;
      } catch (e) { }
    }

    // Copy button handler
    btnCopySumm.addEventListener('click', async () => {
      try {
        const text = summSourceText.textContent || '';
        if (!text || text === '(no result)') { toast('Nothing to copy'); return; }
        await navigator.clipboard.writeText(text);
        toast(`Copied ${text.length.toLocaleString()} chars`);
      } catch (e) { toast('Copy failed'); }
    });

    // Rewrite view - Sleek Modern Redesign
    const rewView = document.createElement('div'); rewView.className = 'cb-internal-view'; rewView.id = 'cb-rew-view'; rewView.setAttribute('data-cb-ignore', 'true');

    const rewTop = document.createElement('div');
    rewTop.className = 'cb-view-top';
    rewTop.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--cb-border);';

    const rewTitle = document.createElement('div');
    rewTitle.className = 'cb-view-title';
    rewTitle.style.cssText = 'font-size: 20px; font-weight: 700; color: var(--cb-white); display: flex; align-items: center; gap: 10px;';
    rewTitle.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.06 9.02l.92.92L5.92 19H5v-.92l9.06-9.06M17.66 3c-.25 0-.51.1-.7.29l-1.83 1.83 3.75 3.75 1.83-1.83c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.2-.2-.45-.29-.71-.29zm-3.6 3.19L3 17.25V21h3.75L17.81 9.94l-3.75-3.75z" fill="url(#gradient2)" stroke="var(--cb-accent-primary)" stroke-width="0.5"/><defs><linearGradient id="gradient2" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse"><stop stop-color="var(--cb-accent-primary)"/><stop offset="1" stop-color="var(--cb-accent-secondary)"/></linearGradient></defs></svg><span>Rewrite</span>';

    const btnCloseRew = document.createElement('button');
    btnCloseRew.className = 'cb-view-close';
    btnCloseRew.textContent = '✕';
    btnCloseRew.style.cssText = 'background: transparent; border: none; color: var(--cb-subtext); cursor: pointer; font-size: 20px; padding: 4px 8px; border-radius: 6px; transition: all 0.2s ease; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;';
    btnCloseRew.setAttribute('aria-label', 'Close Rewrite view');
    btnCloseRew.addEventListener('mouseenter', () => { btnCloseRew.style.background = 'rgba(255, 255, 255, 0.05)'; btnCloseRew.style.color = 'var(--cb-white)'; });
    btnCloseRew.addEventListener('mouseleave', () => { btnCloseRew.style.background = 'transparent'; btnCloseRew.style.color = 'var(--cb-subtext)'; });

    rewTop.appendChild(rewTitle);
    rewTop.appendChild(btnCloseRew);
    rewView.appendChild(rewTop);

    const rewIntro = document.createElement('div');
    rewIntro.className = 'cb-view-intro';
    rewIntro.style.cssText = 'font-size: 13px; line-height: 1.6; color: var(--cb-subtext); margin-bottom: 20px; padding: 14px 16px; background: linear-gradient(135deg, rgba(96, 165, 250, 0.08), rgba(167, 139, 250, 0.08)); border: 1px solid rgba(96, 165, 250, 0.15); border-radius: 10px; backdrop-filter: blur(8px);';
    rewIntro.innerHTML = '<div style="font-weight: 600; color: var(--cb-white); margin-bottom: 6px; font-size: 14px;">Polish & Refine</div>Transform your conversation with style options, select specific messages, and adapt content for different AI models.';
    rewView.appendChild(rewIntro);
    const rewControls = document.createElement('div');
    rewControls.className = 'cb-view-controls';
    rewControls.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;';

    const styleGroup = document.createElement('div');
    styleGroup.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
    const rewStyleLabel = document.createElement('label');
    rewStyleLabel.className = 'cb-label';
    rewStyleLabel.textContent = 'Style';
    rewStyleLabel.style.cssText = 'font-size: 12px; font-weight: 600; color: var(--cb-subtext); text-transform: uppercase; letter-spacing: 0.5px;';

    const rewStyleSelect = document.createElement('select');
    rewStyleSelect.className = 'cb-select';
    rewStyleSelect.id = 'cb-rew-style';
    rewStyleSelect.style.cssText = 'width: 100%; background: var(--cb-bg3); border: 1px solid var(--cb-border); color: var(--cb-white); padding: 10px 12px; border-radius: 8px; font-size: 14px; outline: none; transition: all 0.2s ease; cursor: pointer;';
    rewStyleSelect.addEventListener('focus', () => rewStyleSelect.style.borderColor = 'var(--cb-accent-primary)');
    rewStyleSelect.addEventListener('blur', () => rewStyleSelect.style.borderColor = 'var(--cb-border)');

    // Organized dropdown with groups
    const groupBasic = document.createElement('optgroup'); groupBasic.label = 'Basic';
    ;['normal', 'concise', 'direct', 'detailed', 'academic'].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v.charAt(0).toUpperCase() + v.slice(1); groupBasic.appendChild(o); });
    rewStyleSelect.appendChild(groupBasic);
    const groupTonal = document.createElement('optgroup'); groupTonal.label = 'Tonal & Style';
    ;['humanized', 'creative', 'professional', 'simple', 'friendly'].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v.charAt(0).toUpperCase() + v.slice(1); groupTonal.appendChild(o); });
    rewStyleSelect.appendChild(groupTonal);
    const groupPersonal = document.createElement('optgroup'); groupPersonal.label = 'Personalized';
    ;['customStyle'].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = 'Personalized Style'; groupPersonal.appendChild(o); });
    rewStyleSelect.appendChild(groupPersonal);
    rewStyleSelect.value = 'normal';

    styleGroup.appendChild(rewStyleLabel);
    styleGroup.appendChild(rewStyleSelect);
    rewControls.appendChild(styleGroup);
    rewStyleSelect.value = 'normal';

    const targetGroup = document.createElement('div');
    targetGroup.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

    const rewTargetLabel = document.createElement('label');
    rewTargetLabel.className = 'cb-label';
    rewTargetLabel.textContent = 'Target Model';
    rewTargetLabel.style.cssText = 'font-size: 12px; font-weight: 600; color: var(--cb-subtext); text-transform: uppercase; letter-spacing: 0.5px;';

    const rewTargetSelect = document.createElement('select');
    rewTargetSelect.className = 'cb-select';
    rewTargetSelect.id = 'cb-rew-target-select';
    rewTargetSelect.style.cssText = 'width: 100%; background: var(--cb-bg3); border: 1px solid var(--cb-border); color: var(--cb-white); padding: 10px 12px; border-radius: 8px; font-size: 14px; outline: none; transition: all 0.2s ease; cursor: pointer;';
    rewTargetSelect.addEventListener('focus', () => rewTargetSelect.style.borderColor = 'var(--cb-accent-primary)');
    rewTargetSelect.addEventListener('blur', () => rewTargetSelect.style.borderColor = 'var(--cb-border)');

    const targetModels = ['None', 'Claude', 'ChatGPT', 'Gemini', 'OpenAI', 'Llama', 'Bing', 'Anthropic', 'Cohere', 'HuggingFace', 'Custom'];
    targetModels.forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; rewTargetSelect.appendChild(o); });
    rewTargetSelect.value = 'None';

    targetGroup.appendChild(rewTargetLabel);
    targetGroup.appendChild(rewTargetSelect);
    rewControls.appendChild(targetGroup);

    rewView.appendChild(rewControls);

    // Style hint (only for Personalized Style)
    const styleHintWrap = document.createElement('div');
    styleHintWrap.className = 'cb-style-hint-wrap';
    styleHintWrap.style.cssText = 'display: none; margin-bottom: 20px;';

    const styleHintLabel = document.createElement('label');
    styleHintLabel.className = 'cb-label';
    styleHintLabel.textContent = 'Style Hint (Optional)';
    styleHintLabel.style.cssText = 'font-size: 12px; font-weight: 600; color: var(--cb-subtext); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 8px;';

    const styleHintInput = document.createElement('input');
    styleHintInput.className = 'cb-input';
    styleHintInput.type = 'text';
    styleHintInput.id = 'cb-rew-style-hint';
    styleHintInput.placeholder = 'e.g., “Calm, minimalist, technical product docs”';
    styleHintInput.style.cssText = 'width: 100%; background: var(--cb-bg3); border: 1px solid var(--cb-border); color: var(--cb-white); padding: 10px 12px; border-radius: 8px; font-size: 14px; outline: none; transition: all 0.2s ease;';
    styleHintInput.addEventListener('focus', () => styleHintInput.style.borderColor = 'var(--cb-accent-primary)');
    styleHintInput.addEventListener('blur', () => styleHintInput.style.borderColor = 'var(--cb-border)');

    styleHintWrap.appendChild(styleHintLabel);
    styleHintWrap.appendChild(styleHintInput);
    rewControls.appendChild(styleHintWrap);
    rewControls.appendChild(styleHintWrap);
    // rewControls already appended to rewView earlier
    // Replies list (assistant only - compact preview mode)
    const rewRepliesWrap = document.createElement('div'); rewRepliesWrap.className = 'cb-replies-wrap';
    const rewRepliesHeader = document.createElement('div'); rewRepliesHeader.className = 'cb-replies-header';
    const rewRepliesTitle = document.createElement('div'); rewRepliesTitle.className = 'cb-replies-title'; rewRepliesTitle.textContent = 'Replies';
    const rewReplyControls = document.createElement('div'); rewReplyControls.style.cssText = 'display:flex;align-items:center;gap:var(--cb-space-sm);flex-wrap:wrap;';
    const rewMultiBtn = document.createElement('button'); rewMultiBtn.className = 'cb-btn cb-btn-secondary'; rewMultiBtn.style.cssText = 'padding:6px 12px;font-size:11px;'; rewMultiBtn.textContent = 'Multi'; rewMultiBtn.title = 'Toggle multi-select mode';
    const rewFilterBtn = document.createElement('button'); rewFilterBtn.className = 'cb-btn cb-btn-secondary'; rewFilterBtn.style.cssText = 'padding:6px 12px;font-size:11px;'; rewFilterBtn.textContent = 'All'; rewFilterBtn.title = 'Filter replies (All / Assistant / User)';
    // Remove selected message preview - only show selection controls
    rewReplyControls.appendChild(rewMultiBtn); rewReplyControls.appendChild(rewFilterBtn);
    rewRepliesHeader.appendChild(rewRepliesTitle); rewRepliesHeader.appendChild(rewReplyControls);
    const rewReplies = document.createElement('div'); rewReplies.className = 'cb-replies'; rewReplies.id = 'cb-replies-list';
    rewRepliesWrap.appendChild(rewRepliesHeader); rewRepliesWrap.appendChild(rewReplies);
    rewView.appendChild(rewRepliesWrap);

    // Rewrite editor (appears when a reply is selected)
    const rewEditor = document.createElement('div'); rewEditor.className = 'cb-rewrite-editor'; rewEditor.id = 'cb-rewrite-editor';
    const editorLabel = document.createElement('div'); editorLabel.className = 'cb-editor-label'; editorLabel.textContent = 'Editing Reply';
    rewEditor.appendChild(editorLabel);
    const editorTextarea = document.createElement('textarea'); editorTextarea.className = 'cb-editor-textarea'; editorTextarea.id = 'cb-editor-textarea'; editorTextarea.placeholder = 'Full reply text...';
    rewEditor.appendChild(editorTextarea);
    const editorActions = document.createElement('div'); editorActions.className = 'cb-editor-actions';
    const btnEditorRewrite = document.createElement('button'); btnEditorRewrite.className = 'cb-btn cb-btn-primary'; btnEditorRewrite.textContent = 'Rewrite'; btnEditorRewrite.id = 'cb-btn-editor-rewrite';
    const btnEditorCancel = document.createElement('button'); btnEditorCancel.className = 'cb-btn'; btnEditorCancel.textContent = 'Cancel'; btnEditorCancel.id = 'cb-btn-editor-cancel';
    const btnEditorCopy = document.createElement('button'); btnEditorCopy.className = 'cb-btn'; btnEditorCopy.textContent = 'Copy'; btnEditorCopy.id = 'cb-btn-editor-copy';
    editorActions.appendChild(btnEditorRewrite); editorActions.appendChild(btnEditorCopy); editorActions.appendChild(btnEditorCancel);
    rewEditor.appendChild(editorActions);
    rewView.appendChild(rewEditor);
    // Restore saved rewrite style
    try { const savedRew = localStorage.getItem('chatbridge:pref:rewStyle'); if (savedRew) rewStyleSelect.value = savedRew; } catch (e) { }
    try { const savedHint = localStorage.getItem('chatbridge:pref:rewStyleHint'); if (savedHint) styleHintInput.value = savedHint; } catch (e) { }
    function updateStyleHintVisibility() { styleHintWrap.style.display = (rewStyleSelect.value === 'customStyle') ? 'block' : 'none'; }
    updateStyleHintVisibility();
    rewStyleSelect.addEventListener('change', () => {
      try { localStorage.setItem('chatbridge:pref:rewStyle', rewStyleSelect.value); } catch (e) { }
      updateStyleHintVisibility();
    });
    styleHintInput.addEventListener('input', () => { try { localStorage.setItem('chatbridge:pref:rewStyleHint', styleHintInput.value); } catch (e) { } });
    const rewSourceText = document.createElement('div'); rewSourceText.className = 'cb-view-text'; rewSourceText.id = 'cb-rew-source-text'; rewSourceText.setAttribute('contenteditable', 'false'); rewSourceText.textContent = '';
    rewView.appendChild(rewSourceText);
    const btnGoRew = document.createElement('button');
    btnGoRew.className = 'cb-btn cb-view-go';
    btnGoRew.textContent = '✨ Rewrite';
    btnGoRew.style.cssText = 'width: 100%; margin-top: 16px; background: linear-gradient(135deg, var(--cb-accent-primary), var(--cb-accent-secondary)); border: none; padding: 12px; font-weight: 600; font-size: 14px; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(96, 165, 250, 0.3);';
    btnGoRew.onmouseenter = () => btnGoRew.style.filter = 'brightness(1.1) translateY(-1px)';
    btnGoRew.onmouseleave = () => btnGoRew.style.filter = 'brightness(1) translateY(0)';

    rewView.appendChild(btnGoRew);

    const rewProg = document.createElement('span'); rewProg.className = 'cb-progress'; rewProg.style.display = 'none'; rewView.appendChild(rewProg);

    const btnInsertRew = document.createElement('button');
    btnInsertRew.className = 'cb-btn cb-view-go';
    btnInsertRew.textContent = '⬆️ Insert to Chat';
    btnInsertRew.style.cssText = 'width: 100%; margin-top: 12px; display: none; background: var(--cb-bg3); border: 1px solid var(--cb-border); color: var(--cb-white); padding: 12px; font-weight: 600;';
    btnInsertRew.onmouseenter = () => { btnInsertRew.style.background = 'rgba(255, 255, 255, 0.1)'; btnInsertRew.style.borderColor = 'var(--cb-white)'; };
    btnInsertRew.onmouseleave = () => { btnInsertRew.style.background = 'var(--cb-bg3)'; btnInsertRew.style.borderColor = 'var(--cb-border)'; };

    rewView.appendChild(btnInsertRew);
    const rewResult = document.createElement('div'); rewResult.className = 'cb-view-result'; rewResult.id = 'cb-rew-result'; rewResult.textContent = '';
    rewView.appendChild(rewResult);

    // Translate view
    // Translate view - NEW SIMPLIFIED UI
    const transView = document.createElement('div'); transView.className = 'cb-internal-view'; transView.id = 'cb-trans-view'; transView.setAttribute('data-cb-ignore', 'true');
    const transTop = document.createElement('div'); transTop.className = 'cb-view-top';
    const transTitle = document.createElement('div'); transTitle.className = 'cb-view-title'; transTitle.textContent = '🌐 Translate';
    const btnCloseTrans = document.createElement('button'); btnCloseTrans.className = 'cb-view-close'; btnCloseTrans.textContent = '✕';
    btnCloseTrans.setAttribute('aria-label', 'Close Translate view');
    transTop.appendChild(transTitle); transTop.appendChild(btnCloseTrans);
    transView.appendChild(transTop);

    // Intro with helpful tips
    const transIntro = document.createElement('div');
    transIntro.style.cssText = 'font-size: 12px; color: var(--cb-subtext); margin-bottom: 14px; line-height: 1.5;';
    transIntro.innerHTML = 'Translate your conversation to another language. <strong>Technical terms and code</strong> are preserved.';
    transView.appendChild(transIntro);

    // Quick language chips
    const transQuickRow = document.createElement('div');
    transQuickRow.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;';
    const quickLangs = [
      { code: 'es', label: '🇪🇸 Spanish' },
      { code: 'fr', label: '🇫🇷 French' },
      { code: 'de', label: '🇩🇪 German' },
      { code: 'ja', label: '🇯🇵 Japanese' },
      { code: 'zh', label: '🇨🇳 Chinese' },
      { code: 'hi', label: '🇮🇳 Hindi' },
      { code: 'pt', label: '🇧🇷 Portuguese' },
      { code: 'ar', label: '🇸🇦 Arabic' }
    ];
    quickLangs.forEach(lang => {
      const chip = document.createElement('button');
      chip.className = 'cb-btn';
      chip.textContent = lang.label;
      chip.style.cssText = 'padding: 5px 10px; font-size: 11px; background: rgba(0,180,255,0.1); border: 1px solid rgba(0,180,255,0.3);';
      chip.addEventListener('click', () => {
        transLangSelect.value = lang.code;
        try { localStorage.setItem('chatbridge:pref:transLang', lang.code); } catch (e) { }
        toast(`Language: ${lang.label.split(' ')[1]}`);
      });
      transQuickRow.appendChild(chip);
    });
    transView.appendChild(transQuickRow);

    const transLangRow = document.createElement('div'); transLangRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin:16px 0;';
    const transLangLabel = document.createElement('label'); transLangLabel.textContent = 'Output language:'; transLangLabel.style.cssText = 'font-size:0.95em;font-weight:500;color:#e0e0e0;min-width:120px;';
    const transLangSelect = document.createElement('select'); transLangSelect.className = 'cb-select'; transLangSelect.id = 'cb-trans-lang'; transLangSelect.style.cssText = 'flex:1;padding:8px 12px;border-radius:6px;';
    const langNameToCode = { 'English': 'en', 'Spanish': 'es', 'French': 'fr', 'German': 'de', 'Italian': 'it', 'Portuguese': 'pt', 'Russian': 'ru', 'Japanese': 'ja', 'Korean': 'ko', 'Chinese': 'zh', 'Arabic': 'ar', 'Hindi': 'hi', 'Dutch': 'nl', 'Polish': 'pl', 'Turkish': 'tr', 'Vietnamese': 'vi', 'Thai': 'th', 'Swedish': 'sv', 'Danish': 'da', 'Finnish': 'fi', 'Norwegian': 'no', 'Czech': 'cs', 'Hungarian': 'hu', 'Romanian': 'ro', 'Greek': 'el', 'Hebrew': 'he', 'Indonesian': 'id', 'Malay': 'ms', 'Ukrainian': 'uk', 'Bulgarian': 'bg', 'Tamil': 'ta' };
    Object.entries(langNameToCode).forEach(([name, code]) => { const opt = document.createElement('option'); opt.value = code; opt.textContent = name; transLangSelect.appendChild(opt); });
    const transGearBtn = document.createElement('button'); transGearBtn.textContent = '⚙️'; transGearBtn.title = 'Options'; transGearBtn.style.cssText = 'background:none;border:none;font-size:1.3em;cursor:pointer;padding:4px 8px;border-radius:4px;transition:background 0.2s;';
    transGearBtn.onmouseenter = () => transGearBtn.style.background = 'rgba(255,255,255,0.1)'; transGearBtn.onmouseleave = () => transGearBtn.style.background = 'none';
    transLangRow.appendChild(transLangLabel); transLangRow.appendChild(transLangSelect); transLangRow.appendChild(transGearBtn); transView.appendChild(transLangRow);
    const transOptions = document.createElement('div'); transOptions.id = 'cb-trans-options'; transOptions.style.cssText = 'display:block;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:14px;margin:0 0 14px 0;';
    const transModeGroup = document.createElement('div'); transModeGroup.style.cssText = 'margin-bottom:14px;';
    const transModeLabel = document.createElement('div'); transModeLabel.textContent = 'Selective translation:'; transModeLabel.style.cssText = 'font-size:0.9em;font-weight:600;color:#e0e0e0;margin-bottom:8px;'; transModeGroup.appendChild(transModeLabel);
    const transRadioGroup = document.createElement('div'); transRadioGroup.className = 'cb-radio-group'; transRadioGroup.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
    ['all', 'user', 'ai', 'last'].forEach((mode, idx) => {
      const label = document.createElement('label');
      label.className = 'cb-radio';
      label.style.cssText = 'display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid rgba(255,255,255,0.15);border-radius:8px;background:rgba(255,255,255,0.04);cursor:pointer;transition:background .2s,border-color .2s;';
      const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'cb-trans-mode'; radio.value = mode; radio.style.cursor = 'pointer'; if (idx === 0) radio.checked = true;
      const span = document.createElement('span'); span.textContent = mode === 'all' ? 'All messages' : mode === 'user' ? 'Only user' : mode === 'ai' ? 'Only AI' : 'Last message'; span.className = 'cb-radio-text';
      label.appendChild(radio); label.appendChild(span); transRadioGroup.appendChild(label);
    });
    transModeGroup.appendChild(transRadioGroup); transOptions.appendChild(transModeGroup);
    const transShortenRow = document.createElement('div'); transShortenRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';
    const transShortenLabel = document.createElement('label'); transShortenLabel.textContent = 'Shorten output:'; transShortenLabel.htmlFor = 'cb-trans-shorten'; transShortenLabel.style.cssText = 'font-size:0.9em;font-weight:600;color:#e0e0e0;';
    const transShortenToggle = document.createElement('input'); transShortenToggle.type = 'checkbox'; transShortenToggle.id = 'cb-trans-shorten'; transShortenToggle.className = 'cb-toggle'; transShortenToggle.style.cssText = 'width:44px;height:24px;cursor:pointer;';
    transShortenRow.appendChild(transShortenLabel); transShortenRow.appendChild(transShortenToggle); transOptions.appendChild(transShortenRow); transView.appendChild(transOptions);
    const transActionRow = document.createElement('div'); transActionRow.style.cssText = 'display:flex;align-items:center;gap:12px;margin:14px 0;';
    const btnGoTrans = document.createElement('button'); btnGoTrans.className = 'cb-btn cb-btn-primary'; btnGoTrans.textContent = 'Translate'; btnGoTrans.style.cssText = 'padding:10px 20px;';
    const transProg = document.createElement('span'); transProg.style.cssText = 'display:none;font-size:0.9em;color:#7aa2ff;align-items:center;'; transProg.innerHTML = '<span class="cb-spinner"></span><span class="cb-translating">Translating...</span>';
    transActionRow.appendChild(btnGoTrans); transActionRow.appendChild(transProg); transView.appendChild(transActionRow);
    const transResult = document.createElement('div'); transResult.className = 'cb-view-result'; transResult.id = 'cb-trans-result'; transResult.style.cssText = 'margin-top:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:14px;max-height:400px;overflow-y:auto;white-space:pre-wrap;line-height:1.6;display:none;';
    transView.appendChild(transResult);
    const btnInsertTrans = document.createElement('button'); btnInsertTrans.className = 'cb-btn'; btnInsertTrans.textContent = 'Insert to Chat'; btnInsertTrans.style.cssText = 'margin-top:12px;display:none;'; transView.appendChild(btnInsertTrans);
    transGearBtn.addEventListener('click', () => { const isHidden = transOptions.style.display === 'none'; transOptions.style.display = isHidden ? 'block' : 'none'; });
    try { const saved = localStorage.getItem('chatbridge:pref:transLang'); if (saved) { transLangSelect.value = saved; } else { const nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase().split('-')[0]; const navToCode = { 'en': 'en', 'ja': 'ja', 'es': 'es', 'fr': 'fr', 'de': 'de', 'zh': 'zh', 'ko': 'ko', 'it': 'it', 'pt': 'pt', 'ru': 'ru', 'ar': 'ar', 'hi': 'hi', 'tr': 'tr', 'nl': 'nl', 'sv': 'sv', 'pl': 'pl', 'ta': 'ta' }; transLangSelect.value = navToCode[nav] || 'en'; } } catch (e) { }
    transLangSelect.addEventListener('change', () => { try { localStorage.setItem('chatbridge:pref:transLang', transLangSelect.value); } catch (e) { } });

    // Scoped polish styles for translate UI
    (function () {
      try {
        if (!transView.querySelector('#cb-trans-style')) {
          const style = document.createElement('style'); style.id = 'cb-trans-style';
          style.textContent = `
          .cb-radio:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.22); }
          .cb-radio input { accent-color: #7aa2ff; }
          .cb-radio input:checked + .cb-radio-text { font-weight: 600; color: #ffffff; }
          #cb-trans-options { box-shadow: 0 4px 14px rgba(0,0,0,0.25); }
          #cb-trans-result { box-shadow: inset 0 1px 0 rgba(255,255,255,0.04); }
          .cb-btn.cb-btn-primary { background: linear-gradient(135deg, #6aa0ff 0%, #8b6aff 100%); border: none; }
          .cb-btn.cb-btn-primary:hover { filter: brightness(1.05); }
          input.cb-toggle { appearance: none; background: rgba(255,255,255,0.2); border-radius: 999px; position: relative; outline: none; transition: background .2s; }
          input.cb-toggle:checked { background: #7aa2ff; }
          input.cb-toggle::before { content: ''; position: absolute; top: 3px; left: 4px; width: 18px; height: 18px; background: #fff; border-radius: 50%; transition: transform .2s; }
          input.cb-toggle:checked::before { transform: translateX(18px); }
        `;
          transView.appendChild(style);
        }
      } catch (_) { }
    })();

    // Append all internal views to the panel (after actions, before status)
    // Note: promptDesignerView is already appended in its creation block
    panel.appendChild(summView);
    panel.appendChild(rewView);
    panel.appendChild(transView);

    // Smart Query view
    const smartView = document.createElement('div'); smartView.className = 'cb-internal-view'; smartView.id = 'cb-smart-view'; smartView.setAttribute('data-cb-ignore', 'true');
    const smartTop = document.createElement('div'); smartTop.className = 'cb-view-top';
    const smartTitle = document.createElement('div'); smartTitle.className = 'cb-view-title'; smartTitle.textContent = 'Smart Archive + Query';
    const btnCloseSmart = document.createElement('button'); btnCloseSmart.className = 'cb-view-close'; btnCloseSmart.textContent = '✕';
    btnCloseSmart.setAttribute('aria-label', 'Close Smart Query view');
    smartTop.appendChild(smartTitle); smartTop.appendChild(btnCloseSmart);
    smartView.appendChild(smartTop);

    const smartIntro = document.createElement('div'); smartIntro.className = 'cb-view-intro'; smartIntro.textContent = 'Ask questions across all your saved conversations using natural language. Find insights, patterns, and connections you might have missed.';
    smartView.appendChild(smartIntro);
    // Suggestions row: pre-populated chips based on recent scans
    const smartSuggestRow = document.createElement('div'); smartSuggestRow.className = 'cb-view-controls'; smartSuggestRow.id = 'cb-smart-suggest-row';
    smartView.appendChild(smartSuggestRow);
    // Filters row: host, tag, date-range
    const smartFilterRow = document.createElement('div'); smartFilterRow.className = 'cb-view-controls';
    const hostSelect = document.createElement('select'); hostSelect.className = 'cb-select'; hostSelect.id = 'cb-smart-host';
    const tagSelect = document.createElement('select'); tagSelect.className = 'cb-select'; tagSelect.id = 'cb-smart-tag';
    const dateSelect = document.createElement('select'); dateSelect.className = 'cb-select'; dateSelect.id = 'cb-smart-date';
    // Default options
    const ho = document.createElement('option'); ho.value = ''; ho.textContent = 'All hosts'; hostSelect.appendChild(ho);
    const to = document.createElement('option'); to.value = ''; to.textContent = 'All tags'; tagSelect.appendChild(to);
    ['All time', 'Last 7 days', 'Last 30 days'].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; dateSelect.appendChild(o); });
    dateSelect.value = 'All time';
    smartFilterRow.appendChild(hostSelect); smartFilterRow.appendChild(tagSelect); smartFilterRow.appendChild(dateSelect);
    smartView.appendChild(smartFilterRow);

    const smartQueryRow = document.createElement('div'); smartQueryRow.className = 'cb-view-controls';
    const smartInput = document.createElement('input'); smartInput.type = 'text'; smartInput.className = 'cb-select'; smartInput.id = 'cb-smart-query'; smartInput.placeholder = 'e.g. What did Gemini say about API rate limits?';
    smartInput.setAttribute('aria-label', 'Smart query input');
    const btnSmartSearch = document.createElement('button'); btnSmartSearch.className = 'cb-btn'; btnSmartSearch.id = 'btnSmartSearch'; btnSmartSearch.textContent = 'Search';
    btnSmartSearch.setAttribute('aria-label', 'Search saved chats');
    smartQueryRow.appendChild(smartInput); smartQueryRow.appendChild(btnSmartSearch);
    smartView.appendChild(smartQueryRow);

    const smartResults = document.createElement('div'); smartResults.id = 'cb-smart-results'; smartResults.className = 'cb-view-text'; smartResults.textContent = '(No results yet)';
    smartView.appendChild(smartResults);

    const smartAskRow = document.createElement('div'); smartAskRow.className = 'cb-view-controls';
    const btnSmartAsk = document.createElement('button'); btnSmartAsk.className = 'cb-btn cb-view-go'; btnSmartAsk.id = 'btnSmartAsk'; btnSmartAsk.textContent = 'Ask AI';
    btnSmartAsk.setAttribute('aria-label', 'Ask AI about selected results');
    smartAskRow.appendChild(btnSmartAsk);
    const btnIndexAll = document.createElement('button'); btnIndexAll.className = 'cb-btn'; btnIndexAll.id = 'btnIndexAll'; btnIndexAll.textContent = 'Index all saved chats'; btnIndexAll.title = 'Create embeddings and index all saved chats (requires API key)';
    btnIndexAll.setAttribute('aria-label', 'Index all saved chats');
    smartAskRow.appendChild(btnIndexAll);
    smartView.appendChild(smartAskRow);

    const smartAnswer = document.createElement('div'); smartAnswer.id = 'cb-smart-answer'; smartAnswer.className = 'cb-view-result'; smartAnswer.textContent = '';
    smartView.appendChild(smartAnswer);
    const smartProvenance = document.createElement('div'); smartProvenance.id = 'cb-smart-provenance'; smartProvenance.style.fontSize = '12px'; smartProvenance.style.marginTop = '8px'; smartProvenance.style.color = 'rgba(200,200,200,0.9)'; smartProvenance.textContent = '';
    smartView.appendChild(smartProvenance);

    // Connections panel removed - not needed for basic functionality

    panel.appendChild(smartView);

    // Agent Hub view (replaces Knowledge Graph) - Multi-agent system
    const agentView = document.createElement('div'); agentView.className = 'cb-internal-view'; agentView.id = 'cb-agent-view'; agentView.setAttribute('data-cb-ignore', 'true');
    const agentTop = document.createElement('div'); agentTop.className = 'cb-view-top';
    const agentTitle = document.createElement('div'); agentTitle.className = 'cb-view-title'; agentTitle.textContent = '🤖 AI Agent Hub';
    const btnCloseAgent = document.createElement('button'); btnCloseAgent.className = 'cb-view-close'; btnCloseAgent.textContent = '✕';
    btnCloseAgent.setAttribute('aria-label', 'Close Agent Hub');
    agentTop.appendChild(agentTitle); agentTop.appendChild(btnCloseAgent);
    agentView.appendChild(agentTop);

    const agentIntro = document.createElement('div'); agentIntro.className = 'cb-view-intro'; agentIntro.textContent = 'Advanced AI agents that work in the background to enhance your conversations across platforms.';
    agentView.appendChild(agentIntro);

    // Agent content container (will be populated by renderAgentHub)
    const agentContent = document.createElement('div'); agentContent.id = 'cb-agent-content'; agentContent.style.cssText = 'padding:12px 0;overflow-y:auto;max-height:calc(100vh - 250px);';
    agentView.appendChild(agentContent);

    panel.appendChild(agentView);

    // ============================================
    // INSIGHTS / SMART WORKSPACE VIEW
    // ============================================
    const insightsView = document.createElement('div'); insightsView.className = 'cb-internal-view'; insightsView.id = 'cb-insights-view'; insightsView.setAttribute('data-cb-ignore', 'true');
    const insightsTop = document.createElement('div'); insightsTop.className = 'cb-view-top';
    const insightsTitle = document.createElement('div'); insightsTitle.className = 'cb-view-title'; insightsTitle.textContent = '🎯 Smart Workspace';
    const btnCloseInsights = document.createElement('button'); btnCloseInsights.className = 'cb-view-close'; btnCloseInsights.textContent = '✕';
    btnCloseInsights.setAttribute('aria-label', 'Close Smart Workspace view');
    insightsTop.appendChild(insightsTitle); insightsTop.appendChild(btnCloseInsights);
    insightsView.appendChild(insightsTop);

    const insightsIntro = document.createElement('div'); insightsIntro.className = 'cb-view-intro'; insightsIntro.textContent = 'Practical tools to help you work smarter: compare models, merge threads, extract content, and stay organized.';
    insightsView.appendChild(insightsIntro);

    const insightsContent = document.createElement('div'); insightsContent.id = 'cb-insights-content'; insightsContent.style.cssText = 'padding:12px 0;overflow-y:auto;max-height:calc(100vh - 250px);';
    // Add default insights blocks
    insightsContent.innerHTML = `
    <div class="cb-insights-section">
      <div class="cb-insight-block" id="cb-media-library-block" style="background:linear-gradient(135deg, rgba(0,180,255,0.1), rgba(120,0,255,0.1));border:1px solid rgba(0,180,255,0.3);">
        <div class="cb-insight-title" style="display:flex;align-items:center;justify-content:space-between;">
          <span>🖼️ Media Library</span>
          <span id="cb-media-library-count" style="font-size:11px;background:rgba(0,180,255,0.3);padding:2px 8px;border-radius:10px;color:#fff;">0</span>
        </div>
        <div class="cb-insight-content">Access images from your scanned conversations. Click on an image to insert it into the current chat.</div>
        <div id="cb-media-library-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(60px,1fr));gap:8px;margin-top:12px;max-height:180px;overflow-y:auto;"></div>
        <button id="cb-media-library-refresh" class="cb-btn cb-btn-primary" style="width:100%;margin-top:12px;font-size:11px;padding:8px;">🔄 Refresh Media Library</button>
      </div>
      <div class="cb-insight-block">
        <div class="cb-insight-title">Compare Models</div>
        <div class="cb-insight-content">Quickly compare responses from different AI models side-by-side. Spot differences, strengths, and weaknesses for each platform.</div>
      </div>
      <div class="cb-insight-block">
        <div class="cb-insight-title">Merge Threads</div>
        <div class="cb-insight-content">Combine multiple chat threads into a single unified view. Useful for project tracking, research, or summarizing long discussions.</div>
      </div>
      <div class="cb-insight-block">
        <div class="cb-insight-title">Extract Key Content</div>
        <div class="cb-insight-content">Automatically extract highlights, action items, and decisions from your conversations. Perfect for meeting notes and follow-ups.</div>
      </div>
      <div class="cb-insight-block">
        <div class="cb-insight-title">Organize & Tag</div>
        <div class="cb-insight-content">Tag, categorize, and search your chats for easy retrieval. Stay organized and never lose track of important information.</div>
      </div>
    </div>
  `;
    insightsView.appendChild(insightsContent);

    // Media Library functionality - load images and enable insertion
    async function loadMediaLibrary() {
      try {
        const grid = document.getElementById('cb-media-library-grid');
        const countEl = document.getElementById('cb-media-library-count');
        if (!grid) return;

        // Get images from vault
        let images = [];
        if (typeof window.ChatBridge !== 'undefined' && typeof window.ChatBridge.getImageVault === 'function') {
          images = await window.ChatBridge.getImageVault();
        }

        countEl.textContent = String(images.length);
        grid.innerHTML = '';

        if (images.length === 0) {
          grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:rgba(255,255,255,0.5);font-size:11px;padding:20px;">No images yet. Scan a conversation with images first.</div>';
          return;
        }

        // Display up to 12 images
        images.slice(0, 12).forEach(imgData => {
          const thumb = document.createElement('div');
          thumb.style.cssText = 'position:relative;aspect-ratio:1;border-radius:6px;overflow:hidden;border:1px solid rgba(0,180,255,0.3);cursor:pointer;background:rgba(0,0,0,0.3);transition:all 0.2s;';

          const img = document.createElement('img');
          img.src = imgData.src;
          img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
          img.loading = 'lazy';
          img.onerror = () => { thumb.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:16px;">🖼️</div>'; };

          thumb.appendChild(img);

          // Hover effect
          thumb.addEventListener('mouseenter', () => {
            thumb.style.transform = 'scale(1.05)';
            thumb.style.borderColor = 'rgba(0,180,255,0.8)';
          });
          thumb.addEventListener('mouseleave', () => {
            thumb.style.transform = 'scale(1)';
            thumb.style.borderColor = 'rgba(0,180,255,0.3)';
          });

          // Click to insert into chat
          thumb.addEventListener('click', () => insertImageToChat(imgData));

          grid.appendChild(thumb);
        });

        if (images.length > 12) {
          const moreLabel = document.createElement('div');
          moreLabel.style.cssText = 'grid-column:1/-1;text-align:center;color:rgba(0,180,255,0.8);font-size:11px;padding:8px;cursor:pointer;';
          moreLabel.textContent = `+${images.length - 12} more in Image Vault`;
          grid.appendChild(moreLabel);
        }
      } catch (e) {
        console.warn('[ChatBridge] loadMediaLibrary error:', e);
      }
    }

    // Insert image into current AI chat
    async function insertImageToChat(imgData) {
      try {
        console.log('[ChatBridge] Inserting image to chat:', imgData.src.substring(0, 50) + '...');

        // Try to find the input field for the current platform
        const adapter = (typeof window.pickAdapter === 'function') ? window.pickAdapter() : null;
        let input = null;

        if (adapter && typeof adapter.getInput === 'function') {
          input = adapter.getInput();
        }

        if (!input) {
          // Fallback: try common selectors
          input = document.querySelector('textarea[placeholder], textarea[data-testid], div[contenteditable="true"], input[type="text"]');
        }

        if (input) {
          // For data URLs or short URLs, try to paste directly
          if (imgData.src.startsWith('data:image') || imgData.src.length < 500) {
            // Insert as markdown image
            const markdownImg = `![Image](${imgData.src})`;

            if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
              const start = input.selectionStart || 0;
              const end = input.selectionEnd || 0;
              const text = input.value;
              input.value = text.slice(0, start) + markdownImg + text.slice(end);
              input.focus();
              // Trigger input event
              input.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (input.contentEditable === 'true') {
              // For contenteditable divs
              const selection = window.getSelection();
              const range = selection.getRangeAt(0);
              range.deleteContents();
              range.insertNode(document.createTextNode(markdownImg));
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }

            toast('Image inserted! (Markdown format)');
          } else {
            // For external URLs, just insert the URL
            const url = imgData.src;

            if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
              const start = input.selectionStart || 0;
              const end = input.selectionEnd || 0;
              const text = input.value;
              input.value = text.slice(0, start) + url + text.slice(end);
              input.focus();
              input.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (input.contentEditable === 'true') {
              input.focus();
              document.execCommand('insertText', false, url);
            }

            toast('Image URL inserted!');
          }
        } else {
          // Copy to clipboard as fallback
          await navigator.clipboard.writeText(imgData.src);
          toast('Image URL copied to clipboard!');
        }
      } catch (e) {
        console.error('[ChatBridge] insertImageToChat error:', e);
        try {
          await navigator.clipboard.writeText(imgData.src);
          toast('Image URL copied to clipboard!');
        } catch (_) {
          toast('Failed to insert image');
        }
      }
    }

    // Set up refresh button handler after content is appended
    setTimeout(() => {
      const refreshBtn = document.getElementById('cb-media-library-refresh');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
          loadMediaLibrary();
          toast('Media library refreshed');
        });
      }
      // Initial load
      loadMediaLibrary();
    }, 100);

    panel.appendChild(insightsView);

    // Gemini Nano input/output area
    const geminiWrap = document.createElement('div'); geminiWrap.style.padding = '8px 18px'; geminiWrap.style.display = 'flex'; geminiWrap.style.flexDirection = 'column'; geminiWrap.style.gap = '8px';
    // Insert preview above (textarea removed - preview is the read-only display)
    geminiWrap.appendChild(preview);
    // Note: removed editable textarea per UI simplification request.
    panel.appendChild(geminiWrap);

    const status = document.createElement('div'); status.className = 'cb-status'; status.textContent = 'Status: idle'; panel.appendChild(status);

    // History section with clear button
    // Settings Panel
    const settingsPanel = document.createElement('div'); settingsPanel.className = 'cb-internal-view'; settingsPanel.id = 'cb-settings-panel'; settingsPanel.style.display = 'none';
    settingsPanel.setAttribute('data-cb-ignore', 'true');
    const settingsTop = document.createElement('div'); settingsTop.className = 'cb-view-top';
    const settingsTitle = document.createElement('div'); settingsTitle.className = 'cb-view-title'; settingsTitle.textContent = '⚙️ Settings';
    const btnCloseSettings = document.createElement('button'); btnCloseSettings.className = 'cb-view-close'; btnCloseSettings.textContent = '✕';
    btnCloseSettings.setAttribute('aria-label', 'Close settings');
    settingsTop.appendChild(settingsTitle); settingsTop.appendChild(btnCloseSettings);
    settingsPanel.appendChild(settingsTop);

    // Settings content
    const settingsContent = document.createElement('div'); settingsContent.style.cssText = 'padding: 16px 0; display: flex; flex-direction: column; gap: 16px;';

    // Theme setting
    const themeSection = document.createElement('div'); themeSection.style.cssText = 'padding-bottom: 16px; border-bottom: 1px solid var(--cb-border);';
    const themeLabel = document.createElement('div'); themeLabel.style.cssText = 'font-weight: 600; margin-bottom: 10px; color: var(--cb-white);'; themeLabel.textContent = '🎨 Theme';
    const themeButtons = document.createElement('div'); themeButtons.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;';
    const btnDarkTheme = document.createElement('button'); btnDarkTheme.className = 'cb-btn'; btnDarkTheme.textContent = '🌙 Dark'; btnDarkTheme.dataset.theme = 'dark';
    const btnLightTheme = document.createElement('button'); btnLightTheme.className = 'cb-btn'; btnLightTheme.textContent = '☀️ Light'; btnLightTheme.dataset.theme = 'light';
    const btnSynthwaveTheme = document.createElement('button'); btnSynthwaveTheme.className = 'cb-btn'; btnSynthwaveTheme.textContent = '🌃 Synthwave'; btnSynthwaveTheme.dataset.theme = 'synthwave';
    const btnAuroraTheme = document.createElement('button'); btnAuroraTheme.className = 'cb-btn'; btnAuroraTheme.textContent = '🌅 Aurora'; btnAuroraTheme.dataset.theme = 'aurora';
    const btnNebulaTheme = document.createElement('button'); btnNebulaTheme.className = 'cb-btn'; btnNebulaTheme.textContent = '🌌 Nebula'; btnNebulaTheme.dataset.theme = 'nebula';
    const btnRoseTheme = document.createElement('button'); btnRoseTheme.className = 'cb-btn'; btnRoseTheme.textContent = '🌸 Rose'; btnRoseTheme.dataset.theme = 'rose';
    themeButtons.appendChild(btnDarkTheme); themeButtons.appendChild(btnLightTheme); themeButtons.appendChild(btnSynthwaveTheme);
    themeButtons.appendChild(btnAuroraTheme); themeButtons.appendChild(btnNebulaTheme); themeButtons.appendChild(btnRoseTheme);
    themeSection.appendChild(themeLabel); themeSection.appendChild(themeButtons);
    settingsContent.appendChild(themeSection);

    // ============================================
    // API Keys Section
    // ============================================
    const apiSection = document.createElement('div'); apiSection.style.cssText = 'padding-bottom: 16px; border-bottom: 1px solid var(--cb-border);';
    const apiLabel = document.createElement('div'); apiLabel.style.cssText = 'font-weight: 600; margin-bottom: 10px; color: var(--cb-white);'; apiLabel.textContent = '🔑 API Keys';
    apiSection.appendChild(apiLabel);

    // Gemini API Key
    const geminiKeyWrap = document.createElement('div'); geminiKeyWrap.style.cssText = 'margin-bottom: 10px;';
    const geminiKeyLabel = document.createElement('div'); geminiKeyLabel.style.cssText = 'font-size: 11px; color: var(--cb-subtext); margin-bottom: 4px;'; geminiKeyLabel.textContent = 'Gemini API Key';
    const geminiKeyRow = document.createElement('div'); geminiKeyRow.style.cssText = 'display: flex; gap: 6px;';
    const geminiKeyInput = document.createElement('input'); geminiKeyInput.type = 'password'; geminiKeyInput.id = 'cb-gemini-key'; geminiKeyInput.placeholder = 'Enter Gemini API key...';
    geminiKeyInput.style.cssText = 'flex: 1; background: var(--cb-bg); border: 1px solid var(--cb-border); color: var(--cb-white); padding: 8px; border-radius: 6px; font-size: 11px;';
    const geminiKeyToggle = document.createElement('button'); geminiKeyToggle.className = 'cb-btn'; geminiKeyToggle.textContent = '👁'; geminiKeyToggle.title = 'Show/hide';
    geminiKeyToggle.style.cssText = 'padding: 6px 10px;';
    geminiKeyRow.appendChild(geminiKeyInput); geminiKeyRow.appendChild(geminiKeyToggle);
    geminiKeyWrap.appendChild(geminiKeyLabel); geminiKeyWrap.appendChild(geminiKeyRow);
    apiSection.appendChild(geminiKeyWrap);

    // Hugging Face API Key
    const hfKeyWrap = document.createElement('div'); hfKeyWrap.style.cssText = 'margin-bottom: 10px;';
    const hfKeyLabel = document.createElement('div'); hfKeyLabel.style.cssText = 'font-size: 11px; color: var(--cb-subtext); margin-bottom: 4px;'; hfKeyLabel.textContent = 'Hugging Face Token';
    const hfKeyRow = document.createElement('div'); hfKeyRow.style.cssText = 'display: flex; gap: 6px;';
    const hfKeyInput = document.createElement('input'); hfKeyInput.type = 'password'; hfKeyInput.id = 'cb-hf-key'; hfKeyInput.placeholder = 'Enter HF token...';
    hfKeyInput.style.cssText = 'flex: 1; background: var(--cb-bg); border: 1px solid var(--cb-border); color: var(--cb-white); padding: 8px; border-radius: 6px; font-size: 11px;';
    const hfKeyToggle = document.createElement('button'); hfKeyToggle.className = 'cb-btn'; hfKeyToggle.textContent = '👁'; hfKeyToggle.title = 'Show/hide';
    hfKeyToggle.style.cssText = 'padding: 6px 10px;';
    hfKeyRow.appendChild(hfKeyInput); hfKeyRow.appendChild(hfKeyToggle);
    hfKeyWrap.appendChild(hfKeyLabel); hfKeyWrap.appendChild(hfKeyRow);
    apiSection.appendChild(hfKeyWrap);

    // Save keys button
    const saveKeysBtn = document.createElement('button'); saveKeysBtn.className = 'cb-btn cb-btn-primary'; saveKeysBtn.textContent = '💾 Save Keys';
    saveKeysBtn.style.cssText = 'width: 100%; padding: 8px;';
    apiSection.appendChild(saveKeysBtn);
    settingsContent.appendChild(apiSection);

    // ============================================
    // Detail Level Section
    // ============================================
    const detailSection = document.createElement('div'); detailSection.style.cssText = 'padding-bottom: 16px; border-bottom: 1px solid var(--cb-border);';
    const detailLabel = document.createElement('div'); detailLabel.style.cssText = 'font-weight: 600; margin-bottom: 10px; color: var(--cb-white);'; detailLabel.textContent = '📊 Response Detail Level';
    const detailButtons = document.createElement('div'); detailButtons.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;';
    const btnConcise = document.createElement('button'); btnConcise.className = 'cb-btn'; btnConcise.textContent = '⚡ Concise'; btnConcise.dataset.level = 'concise'; btnConcise.id = 'cb-detail-concise';
    const btnDetailed = document.createElement('button'); btnDetailed.className = 'cb-btn'; btnDetailed.textContent = '📝 Detailed'; btnDetailed.dataset.level = 'detailed'; btnDetailed.id = 'cb-detail-detailed';
    const btnExpert = document.createElement('button'); btnExpert.className = 'cb-btn'; btnExpert.textContent = '🎓 Expert'; btnExpert.dataset.level = 'expert'; btnExpert.id = 'cb-detail-expert';
    detailButtons.appendChild(btnConcise); detailButtons.appendChild(btnDetailed); detailButtons.appendChild(btnExpert);
    detailSection.appendChild(detailLabel); detailSection.appendChild(detailButtons);
    settingsContent.appendChild(detailSection);

    // ============================================
    // Keyboard Shortcuts Section
    // ============================================
    const shortcutsSection = document.createElement('div'); shortcutsSection.style.cssText = 'padding-bottom: 16px; border-bottom: 1px solid var(--cb-border);';
    const shortcutsLabel = document.createElement('div'); shortcutsLabel.style.cssText = 'font-weight: 600; margin-bottom: 10px; color: var(--cb-white);'; shortcutsLabel.textContent = '⌨️ Keyboard Shortcuts';
    const shortcutsList = document.createElement('div'); shortcutsList.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11px;';
    shortcutsList.innerHTML = `
      <div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--cb-bg);border-radius:4px;"><span>Scan Chat</span><kbd style="background:var(--cb-border);padding:2px 6px;border-radius:3px;">S</kbd></div>
      <div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--cb-bg);border-radius:4px;"><span>Restore</span><kbd style="background:var(--cb-border);padding:2px 6px;border-radius:3px;">R</kbd></div>
      <div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--cb-bg);border-radius:4px;"><span>Copy</span><kbd style="background:var(--cb-border);padding:2px 6px;border-radius:3px;">C</kbd></div>
      <div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--cb-bg);border-radius:4px;"><span>Close</span><kbd style="background:var(--cb-border);padding:2px 6px;border-radius:3px;">Esc</kbd></div>
    `;
    shortcutsSection.appendChild(shortcutsLabel); shortcutsSection.appendChild(shortcutsList);
    settingsContent.appendChild(shortcutsSection);

    // ============================================
    // About Section
    // ============================================
    const aboutSection = document.createElement('div'); aboutSection.style.cssText = 'text-align: center; padding-top: 8px;';
    aboutSection.innerHTML = `
      <div style="font-size: 18px; margin-bottom: 6px;">🌉 ChatBridge</div>
      <div style="font-size: 11px; color: var(--cb-subtext); margin-bottom: 8px;">Version 1.0.0 • Your AI conversation companion</div>
      <div style="display: flex; justify-content: center; gap: 12px;">
        <a href="https://github.com/Naeha-S/ChatBridge" target="_blank" style="color: var(--cb-accent-primary); font-size: 11px; text-decoration: none;">📦 GitHub</a>
        <a href="mailto:feedback@chatbridge.dev" style="color: var(--cb-accent-primary); font-size: 11px; text-decoration: none;">💬 Feedback</a>
      </div>
    `;
    settingsContent.appendChild(aboutSection);

    settingsPanel.appendChild(settingsContent);
    panel.appendChild(settingsPanel);

    const historyWrapper = document.createElement('div'); historyWrapper.className = 'cb-history-wrapper';
    const historyHeader = document.createElement('div'); historyHeader.className = 'cb-history-header';
    const historyTitle = document.createElement('div'); historyTitle.className = 'cb-history-title'; historyTitle.textContent = '📜 History';
    const btnClearHistory = document.createElement('button'); btnClearHistory.className = 'cb-btn cb-btn-danger'; btnClearHistory.textContent = '×'; btnClearHistory.title = 'Clear all saved conversation history';
    historyHeader.appendChild(historyTitle);
    historyHeader.appendChild(btnClearHistory);
    historyWrapper.appendChild(historyHeader);

    // Search filter input
    const historySearchWrap = document.createElement('div');
    historySearchWrap.style.cssText = 'padding: 8px 0; display: flex; gap: 6px;';
    const historySearchInput = document.createElement('input');
    historySearchInput.type = 'text';
    historySearchInput.placeholder = '🔍 Search history...';
    historySearchInput.className = 'cb-input';
    historySearchInput.id = 'cb-history-search';
    historySearchInput.style.cssText = 'flex: 1; background: var(--cb-bg3); border: 1px solid var(--cb-border); color: var(--cb-white); padding: 8px 12px; border-radius: 6px; font-size: 12px; outline: none;';
    historySearchInput.addEventListener('focus', () => historySearchInput.style.borderColor = 'var(--cb-accent-primary)');
    historySearchInput.addEventListener('blur', () => historySearchInput.style.borderColor = 'var(--cb-border)');
    historySearchWrap.appendChild(historySearchInput);
    historyWrapper.appendChild(historySearchWrap);

    const historyEl = document.createElement('div'); historyEl.className = 'cb-history'; historyEl.textContent = 'No sessions yet.';
    historyWrapper.appendChild(historyEl);
    panel.appendChild(historyWrapper);

    // Relative time helper
    function relativeTime(timestamp) {
      const now = Date.now();
      const diff = now - timestamp;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return 'just now';
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days === 1) return 'yesterday';
      if (days < 7) return `${days}d ago`;
      if (days < 30) return `${Math.floor(days / 7)}w ago`;
      return new Date(timestamp).toLocaleDateString();
    }

    // Date group helper
    function getDateGroup(timestamp) {
      const now = new Date();
      const date = new Date(timestamp);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today - 86400000);
      const weekAgo = new Date(today - 7 * 86400000);

      if (date >= today) return 'Today';
      if (date >= yesterday) return 'Yesterday';
      if (date >= weekAgo) return 'This Week';
      return 'Older';
    }

    // Enhanced refresh history with search, grouping, and relative times
    async function refreshHistory(filterText = '') {
      try {
        const convs = await loadConversationsAsync();
        historyEl.innerHTML = '';

        if (!convs || !convs.length) {
          historyEl.innerHTML = '<div style="text-align:center;padding:20px;opacity:0.7;">No saved conversations yet.<br/><span style="font-size:11px;">Click "Scan Chat" to save your first conversation!</span></div>';
          return;
        }

        // Sort by timestamp (newest first)
        const sorted = convs.sort((a, b) => (b.ts || 0) - (a.ts || 0));

        // Filter if search text provided
        const filter = (filterText || '').toLowerCase().trim();
        const filtered = filter ? sorted.filter(c => {
          const platform = (c.platform || '').toLowerCase();
          const model = (c.model || '').toLowerCase();
          const text = (c.conversation || []).map(m => m.text || '').join(' ').toLowerCase();
          return platform.includes(filter) || model.includes(filter) || text.includes(filter);
        }) : sorted;

        if (filtered.length === 0) {
          historyEl.innerHTML = `<div style="text-align:center;padding:20px;opacity:0.7;">No results for "${filterText}"</div>`;
          return;
        }

        // Group by date
        const groups = { 'Today': [], 'Yesterday': [], 'This Week': [], 'Older': [] };
        filtered.forEach(c => {
          const group = getDateGroup(c.ts || Date.now());
          groups[group].push(c);
        });

        // Render groups
        Object.entries(groups).forEach(([groupName, convList]) => {
          if (convList.length === 0) return;

          // Group header
          const groupHeader = document.createElement('div');
          groupHeader.style.cssText = 'font-size: 10px; font-weight: 600; color: var(--cb-subtext); text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 0 6px; border-bottom: 1px solid var(--cb-border); margin-bottom: 6px;';
          groupHeader.textContent = `${groupName} (${convList.length})`;
          historyEl.appendChild(groupHeader);

          // Render conversations in group
          convList.forEach((conv, idx) => {
            const row = document.createElement('div');
            row.className = 'cb-history-row';
            row.style.cssText = 'padding: 10px; margin-bottom: 6px; background: rgba(0, 180, 255, 0.05); border: 1px solid rgba(0, 180, 255, 0.15); border-radius: 8px; cursor: pointer; transition: all 0.2s;';

            const userMsgs = (conv.conversation || []).filter(m => m.role === 'user').length;
            const aiMsgs = (conv.conversation || []).filter(m => m.role === 'assistant').length;
            const totalMsgs = userMsgs + aiMsgs;
            const preview = (conv.conversation && conv.conversation[0]) ? conv.conversation[0].text.slice(0, 80) : 'No preview';
            const platform = conv.platform || 'unknown';
            const model = conv.model || '';
            const time = relativeTime(conv.ts || Date.now());

            row.innerHTML = `
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <div style="font-size: 12px; font-weight: 600; color: var(--cb-white);">${platform}${model ? ' · ' + model : ''}</div>
                <div style="font-size: 10px; color: var(--cb-subtext);">${time}</div>
              </div>
              <div style="font-size: 11px; color: var(--cb-subtext); line-height: 1.4; margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${preview}...</div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="font-size: 10px; color: var(--cb-subtext);">${totalMsgs} msgs (${userMsgs} user, ${aiMsgs} AI)</div>
                <div style="display: flex; gap: 4px;">
                  <button class="cb-btn cb-history-open" style="padding: 4px 8px; font-size: 10px;">Open</button>
                  <button class="cb-btn cb-btn-danger cb-history-delete" style="padding: 4px 8px; font-size: 10px;">×</button>
                </div>
              </div>
            `;

            // Hover effects
            row.addEventListener('mouseenter', () => {
              row.style.background = 'rgba(0, 180, 255, 0.1)';
              row.style.borderColor = 'rgba(0, 180, 255, 0.3)';
            });
            row.addEventListener('mouseleave', () => {
              row.style.background = 'rgba(0, 180, 255, 0.05)';
              row.style.borderColor = 'rgba(0, 180, 255, 0.15)';
            });

            // Open button
            const openBtn = row.querySelector('.cb-history-open');
            if (openBtn) {
              openBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                try {
                  window.ChatBridge.selectedConversation = conv;
                  const text = (conv.conversation || []).map(m => `${m.role}: ${m.text}`).join('\n\n');
                  lastScannedText = text;
                  preview.textContent = `Preview: "${(conv.conversation?.[0]?.text || '').slice(0, 100)}..."`;
                  toast(`Loaded: ${totalMsgs} messages`);
                } catch (err) { debugLog('open history error', err); }
              });
            }

            // Delete button
            const deleteBtn = row.querySelector('.cb-history-delete');
            if (deleteBtn) {
              deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('Delete this conversation?')) return;
                try {
                  await new Promise(resolve => {
                    chrome.runtime.sendMessage({ type: 'delete_conversation', payload: { id: String(conv.ts) } }, resolve);
                  });
                  toast('Deleted');
                  refreshHistory(filter);
                } catch (err) { debugLog('delete error', err); toast('Delete failed'); }
              });
            }

            historyEl.appendChild(row);
          });
        });
      } catch (e) {
        debugLog('refreshHistory error', e);
        historyEl.innerHTML = '<div style="padding:12px;opacity:0.7;">Failed to load history</div>';
      }
    }

    // Search input handler
    let historySearchTimeout = null;
    historySearchInput.addEventListener('input', () => {
      clearTimeout(historySearchTimeout);
      historySearchTimeout = setTimeout(() => {
        refreshHistory(historySearchInput.value);
      }, 300);
    });

    const footer = document.createElement('div'); footer.className = 'cb-footer'; panel.appendChild(footer);

    // Subtle suggestions container (This Might Help)
    const subtleSuggest = document.createElement('div');
    subtleSuggest.id = 'cb-subtle-suggestions';
    subtleSuggest.setAttribute('data-cb-ignore', 'true');
    subtleSuggest.style.cssText = 'margin-top:8px;padding:8px;border-top:1px dashed rgba(0,180,255,0.15);opacity:0.85;font-size:11px;color:var(--cb-subtext);display:none;';
    subtleSuggest.innerHTML = '<div style="font-weight:600;opacity:0.8;margin-bottom:6px;">This might help</div><div id="cb-subtle-list" style="display:flex;flex-direction:column;gap:6px;"></div>';
    panel.appendChild(subtleSuggest);

    function renderLastScan() { /* end-user UI hides debug */ }

    shadow.appendChild(panel);

    // Load subtle archive-based hints (quiet, optional)
    async function loadSubtleSuggestions() {
      try {
        const container = shadow.getElementById ? shadow.getElementById('cb-subtle-suggestions') : null;
        const list = shadow.getElementById ? shadow.getElementById('cb-subtle-list') : null;
        if (!container || !list) return;
        list.innerHTML = '';

        // Get a bit of current context
        const lastScan = (window.ChatBridge && window.ChatBridge.getLastScan && window.ChatBridge.getLastScan()) || {};
        const lastScanText = String(lastScan.text || '').slice(0, 400);
        const host = window.location.hostname.replace(/^www\./, '');

        // Pull recent conversations from background
        let convs = [];
        try { convs = await getAllStoredConversations(); } catch (_) { /* ignore */ }

        const items = [];
        if (convs && convs.length) {
          // Relevant old answer (same host)
          const byHost = convs.find(c => (c.host || '').includes(host));
          if (byHost && (byHost.title || byHost.text)) {
            items.push({
              label: 'Relevant old answer', text: (byHost.title || 'Conversation').slice(0, 80), action: () => {
                try { showOutputWithSendButton(String(byHost.summary || byHost.text || '').slice(0, 1200), 'Revisit Answer'); } catch (_) { }
              }
            });
          }

          // Related topic (top tag)
          const tagCounts = {};
          convs.slice(0, 50).forEach(c => (c.tags || []).forEach(t => { const k = (t || '').toLowerCase(); if (!k) return; tagCounts[k] = (tagCounts[k] || 0) + 1; }));
          const topTag = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
          if (topTag) {
            items.push({
              label: 'Related topic', text: `#${topTag}`, action: async () => {
                try {
                  const matches = convs.filter(c => (c.tags || []).map(x => String(x).toLowerCase()).includes(topTag)).slice(0, 3);
                  const quick = matches.map((m, i) => `${i + 1}. ${(m.title || 'Conversation').slice(0, 60)}`).join('\n');
                  showOutputWithSendButton(`Top related items for ${topTag}:\n\n${quick || '(none found)'}`, 'Related Topic');
                } catch (_) { }
              }
            });
          }

          // Supporting material (open extract view)
          items.push({ label: 'Supporting materials', text: 'Extract code blocks or media from recent chats', action: () => { try { showExtractView(); } catch (_) { } } });
        }

        if (!items.length) { container.style.display = 'none'; return; }

        items.slice(0, 3).forEach(it => {
          const btn = document.createElement('button');
          btn.className = 'cb-btn'; btn.type = 'button';
          btn.style.cssText = 'text-align:left;padding:8px;background:rgba(16,24,43,0.35);border:1px solid rgba(0,180,255,0.15);font-size:11px;display:flex;gap:6px;align-items:center;';
          btn.innerHTML = `<span style="opacity:0.85;">•</span><span style="opacity:0.9;font-weight:600;">${it.label}:</span><span style="opacity:0.85;">${it.text}</span>`;
          btn.addEventListener('click', () => { try { it.action(); } catch (_) { } });
          list.appendChild(btn);
        });

        container.style.display = 'block';
      } catch (_) { /* quiet */ }
    }

    // Defer a bit to avoid UI jank
    setTimeout(loadSubtleSuggestions, 600);

    // Accessible live region for screen readers and visually-hidden styling
    const ariaLive = document.createElement('div');
    ariaLive.id = 'cb-aria-live';
    ariaLive.setAttribute('aria-live', 'polite');
    ariaLive.setAttribute('aria-atomic', 'true');
    ariaLive.className = 'cb-visually-hidden';
    ariaLive.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;clip:rect(1px,1px,1px,1px);';
    shadow.appendChild(ariaLive);

    // Accessible helpers
    function announce(msg, polite = true) {
      try {
        if (!ariaLive) return;
        // Use a short delay to ensure assistive tech picks up changes
        ariaLive.textContent = '';
        setTimeout(() => { try { ariaLive.textContent = String(msg || ''); } catch (e) { } }, 50);
      } catch (e) { debugLog('announce failed', e); }
    }

    // Accessible error banner with retry support
    function showError(message, retryCallback) {
      try {
        const id = 'cb-error-banner';
        let existing = shadow.getElementById ? shadow.getElementById(id) : null;
        // create inside host shadow if possible, otherwise on document body
        const container = shadow || document.body;
        if (existing && existing.parentNode) existing.remove();
        const banner = document.createElement('div'); banner.id = id; banner.setAttribute('role', 'alert'); banner.style.cssText = 'position:fixed;top:18px;right:18px;z-index:2147483647;padding:12px 14px;background:#9b2c2c;color:#fff;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,0.4);font-weight:600;max-width:360px;';
        try {
          const main = document.createElement('div'); main.style.fontWeight = '700'; main.textContent = message || 'An error occurred';
          const detail = document.createElement('div'); detail.style.fontSize = '12px'; detail.style.fontWeight = '400'; detail.style.marginTop = '8px'; detail.style.opacity = '0.95';
          detail.innerHTML = `Try these steps: <ol style="margin:6px 0 0 18px;padding:0 0 0 0;color:#fff;opacity:0.95;font-size:12px;">` +
            `<li>Check your API key in the extension Options.</li>` +
            `<li>Retry the action using the 'Retry' button.</li>` +
            `<li>If the problem persists, click 'Report Issue' to capture debug details.</li></ol>`;
          banner.appendChild(main); banner.appendChild(detail);
        } catch (e) { banner.textContent = message || 'An error occurred'; }
        if (typeof retryCallback === 'function') {
          const retryBtn = document.createElement('button'); retryBtn.className = 'cb-btn'; retryBtn.style.marginLeft = '10px'; retryBtn.textContent = 'Retry'; retryBtn.setAttribute('aria-label', 'Retry');
          retryBtn.addEventListener('click', async (e) => { try { retryBtn.disabled = true; await retryCallback(); banner.remove(); } catch (err) { debugLog('retry failed', err); } });
          banner.appendChild(retryBtn);
        }
        // Report issue button: captures debug info and sends to background for logging
        try {
          const rep = document.createElement('button'); rep.className = 'cb-btn'; rep.style.marginLeft = '8px'; rep.textContent = 'Report Issue'; rep.setAttribute('aria-label', 'Report this issue');
          rep.addEventListener('click', async () => {
            try {
              rep.disabled = true; rep.textContent = 'Reporting…';
              const dbg = collectDebugInfo();
              try { await navigator.clipboard.writeText(JSON.stringify(dbg, null, 2)); toast('Debug info copied to clipboard'); } catch (e) { debugLog('clipboard copy failed', e); }
              try { chrome.runtime.sendMessage({ type: 'report_issue', payload: dbg }, (r) => { /* ack optional */ }); } catch (e) { debugLog('report send failed', e); }
              rep.textContent = 'Reported';
              setTimeout(() => { try { if (rep && rep.parentNode) rep.parentNode.removeChild(rep); } catch (e) { } }, 4000);
            } catch (e) { debugLog('report handler failed', e); }
          });
          banner.appendChild(rep);
        } catch (e) { debugLog('add report btn failed', e); }
        try { container.appendChild(banner); } catch (e) { document.body.appendChild(banner); }
        announce(message, false);
        setTimeout(() => { try { if (banner && banner.parentNode) banner.remove(); } catch (e) { } }, 8000);
      } catch (e) { debugLog('showError failed', e); }
    }

    // UX helpers: skeleton loader, optimistic UI, animations, and backoff
    try {
      const ux = document.createElement('style'); ux.id = 'cb-ux-style'; ux.textContent = `
          /* Skeleton loaders */
          .cb-skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 37%, rgba(255,255,255,0.03) 63%); background-size: 400% 100%; animation: cb-skel-shimmer 1.6s linear infinite; border-radius:6px; pointer-events: none; }
          @keyframes cb-skel-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
          /* Micro-animations */
          .cb-fade-in { animation: cb-fade .22s ease-out; }
          @keyframes cb-fade { from { opacity:0; transform: translateY(6px) scale(0.995); } to { opacity:1; transform: translateY(0) scale(1); } }
          .cb-slide-up { animation: cb-slide .26s cubic-bezier(0.2,0,0,1); }
          @keyframes cb-slide { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform: translateY(0); } }
          .cb-scale-pop { animation: cb-pop .16s ease-out; }
          @keyframes cb-pop { 0% { transform: scale(0.96); opacity:0.0; } 60% { transform: scale(1.02); opacity:1; } 100% { transform: scale(1); } }
          .cb-transition { transition: all 220ms cubic-bezier(0.2,0,0,1); }
        `; shadow.appendChild(ux);
    } catch (e) { debugLog('append ux styles failed', e); }

    function showSkeleton(el, height) {
      try { if (!el) return; el.__cb_orig = el.innerHTML; el.classList.add('cb-skeleton'); if (height) el.style.minHeight = (height + 'px'); }
      catch (e) { debugLog('showSkeleton failed', e); }
    }
    function hideSkeleton(el) {
      try { if (!el) return; el.classList.remove('cb-skeleton'); if (el.__cb_orig !== undefined) { el.innerHTML = el.__cb_orig; delete el.__cb_orig; } el.style.minHeight = ''; }
      catch (e) { debugLog('hideSkeleton failed', e); }
    }

    function animateEl(el, cls, duration = 400) {
      try {
        if (!el) return;
        el.classList.add(cls);
        setTimeout(() => { try { el.classList.remove(cls); } catch (e) { } }, duration);
      } catch (e) { debugLog('animateEl failed', e); }
    }

    // Exponential backoff wrapper for background messages / API calls
    async function callBackgroundWithBackoff(message, maxRetries = 3, baseMs = 400) {
      let attempt = 0;
      while (attempt <= maxRetries) {
        try {
          const res = await new Promise((resolve, reject) => {
            try { chrome.runtime.sendMessage(message, (r) => { if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message)); resolve(r); }); }
            catch (e) { reject(e); }
          });
          // consider res.ok === false an error to retry
          if (res && (res.ok === false)) throw new Error(res.error || 'background_error');
          return res;
        } catch (err) {
          attempt++;
          if (attempt > maxRetries) throw err;
          const jitter = Math.random() * 0.5 + 0.75; // 0.75..1.25
          const wait = Math.round(baseMs * Math.pow(2, attempt - 1) * jitter);
          await new Promise(r => setTimeout(r, wait));
        }
      }
    }

    // Optimistic UI helper: run immediate UI change, then perform action, roll back or confirm
    async function optimisticAction({ applyOptimistic, confirmUI, rollbackUI, action, onError }) {
      try {
        if (typeof applyOptimistic === 'function') applyOptimistic();
        const res = await action();
        if (typeof confirmUI === 'function') confirmUI(res);
        return res;
      } catch (err) {
        try { if (typeof rollbackUI === 'function') rollbackUI(err); } catch (e) { }
        if (typeof onError === 'function') onError(err);
        throw err;
      }
    }

    function collectDebugInfo() {
      try {
        const dbg = {
          url: location.href,
          ts: Date.now(),
          ua: navigator.userAgent,
          platform: navigator.platform,
          lastScan: (window.ChatBridge && window.ChatBridge._lastScan) ? window.ChatBridge._lastScan : null,
          localStorageSnapshot: {}
        };
        try { Object.keys(localStorage).filter(k => k && k.toLowerCase && k.toLowerCase().includes('chatbridge')).forEach(k => { dbg.localStorageSnapshot[k] = localStorage.getItem(k); }); } catch (e) { }
        return dbg;
      } catch (e) { return { error: 'collect failed' }; }
    }


    // High-contrast / focus-visible support
    try {
      const hc = document.createElement('style'); hc.id = 'cb-accessibility-style';
      hc.textContent = `
        .cb-visually-hidden { position:absolute !important; left:-9999px !important; width:1px !important; height:1px !important; overflow:hidden !important; clip:rect(1px,1px,1px,1px) !important; }
        .cb-btn:focus, .cb-select:focus, .cb-view-close:focus, #cb-graph-canvas:focus { outline: 3px solid #ffdca3 !important; outline-offset: 2px; }
        @media (forced-colors: active) {
          .cb-panel { background: Window !important; color: WindowText !important; border-color: GrayText !important; }
          .cb-btn { background: ButtonFace !important; color: ButtonText !important; border-color: ButtonText !important; }
          .cb-btn-primary { background: Highlight !important; color: HighlightText !important; }
        }
      `;
      shadow.appendChild(hc);
    } catch (e) { debugLog('add hc styles failed', e); }

    // interactions
    avatar.addEventListener('click', () => { host.style.display = 'block'; avatar.style.display = 'none'; });
    btnClose.addEventListener('click', () => { host.style.display = 'none'; avatar.style.display = 'flex'; });

    // Settings button handler
    btnSettings.addEventListener('click', () => {
      try {
        closeAllViews();
        const settingsPanel = shadow.getElementById('cb-settings-panel');
        if (settingsPanel) {
          settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
          settingsPanel.classList.toggle('cb-view-active');
        }
      } catch (e) { debugLog('settings toggle failed', e); }
    });

    // Close settings button
    btnCloseSettings.addEventListener('click', () => {
      try {
        const settingsPanel = shadow.getElementById('cb-settings-panel');
        if (settingsPanel) {
          settingsPanel.style.display = 'none';
          settingsPanel.classList.remove('cb-view-active');
        }
      } catch (e) { }
    });

    // Theme switchers
    // Universal theme button handler for all 6 themes
    [btnDarkTheme, btnLightTheme, btnSynthwaveTheme, btnAuroraTheme, btnNebulaTheme, btnRoseTheme].forEach(btn => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        try {
          const theme = btn.dataset.theme;
          // Remove all theme classes
          host.classList.remove('cb-theme-light', 'cb-theme-synthwave', 'cb-theme-aurora', 'cb-theme-nebula', 'cb-theme-rose');

          // Add new theme class (except for dark which is default)
          if (theme !== 'dark') {
            host.classList.add(`cb-theme-${theme}`);
          }

          // Save preference
          chrome.storage.local.set({ cb_theme: theme });

          // Toast with emoji
          const emojis = { light: '☀️', dark: '🌙', synthwave: '🌃', aurora: '🌅', nebula: '🌌', rose: '🌸' };
          const names = { light: 'Light', dark: 'Dark', synthwave: 'Synthwave', aurora: 'Aurora Mist', nebula: 'Nebula Fog', rose: 'Rose Mist' };
          toast(`${emojis[theme] || '🎨'} ${names[theme] || theme} theme enabled`);
        } catch (e) { debugLog('theme switch failed', e); }
      });
    });

    // ============================================
    // API Key Handlers
    // ============================================
    // Show/hide Gemini key toggle
    geminiKeyToggle.addEventListener('click', () => {
      geminiKeyInput.type = geminiKeyInput.type === 'password' ? 'text' : 'password';
      geminiKeyToggle.textContent = geminiKeyInput.type === 'password' ? '👁' : '🙈';
    });

    // Show/hide HF key toggle
    hfKeyToggle.addEventListener('click', () => {
      hfKeyInput.type = hfKeyInput.type === 'password' ? 'text' : 'password';
      hfKeyToggle.textContent = hfKeyInput.type === 'password' ? '👁' : '🙈';
    });

    // Save keys handler
    saveKeysBtn.addEventListener('click', async () => {
      try {
        const geminiKey = geminiKeyInput.value.trim();
        const hfKey = hfKeyInput.value.trim();

        // Save to chrome storage
        await new Promise((resolve, reject) => {
          chrome.storage.local.set({
            chatbridge_gemini_key: geminiKey,
            chatbridge_hf_key: hfKey
          }, () => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve();
          });
        });

        toast('✓ API keys saved');
        saveKeysBtn.textContent = '✅ Saved!';
        setTimeout(() => { saveKeysBtn.textContent = '💾 Save Keys'; }, 2000);
      } catch (e) {
        toast('Failed to save keys');
        debugLog('save keys error', e);
      }
    });

    // Load saved keys when settings opens
    btnSettings.addEventListener('click', async () => {
      try {
        chrome.storage.local.get(['chatbridge_gemini_key', 'chatbridge_hf_key', 'cb_detail_level'], (result) => {
          if (result.chatbridge_gemini_key) geminiKeyInput.value = result.chatbridge_gemini_key;
          if (result.chatbridge_hf_key) hfKeyInput.value = result.chatbridge_hf_key;

          // Highlight current detail level
          const level = result.cb_detail_level || 'concise';
          [btnConcise, btnDetailed, btnExpert].forEach(btn => {
            btn.style.background = btn.dataset.level === level ? 'var(--cb-accent-primary)' : '';
            btn.style.color = btn.dataset.level === level ? '#fff' : '';
          });
        });
      } catch (e) { debugLog('load settings failed', e); }
    });

    // ============================================
    // Detail Level Handlers
    // ============================================
    [btnConcise, btnDetailed, btnExpert].forEach(btn => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        try {
          const level = btn.dataset.level;

          // Update visual state
          [btnConcise, btnDetailed, btnExpert].forEach(b => {
            b.style.background = b === btn ? 'var(--cb-accent-primary)' : '';
            b.style.color = b === btn ? '#fff' : '';
          });

          // Save preference
          chrome.storage.local.set({ cb_detail_level: level });

          // Toast
          const labels = { concise: '⚡ Concise', detailed: '📝 Detailed', expert: '🎓 Expert' };
          toast(`${labels[level]} mode enabled`);
        } catch (e) { debugLog('detail level switch failed', e); }
      });
    });

    // Migrate conversations from page localStorage into background persistent storage (once)
    try {
      const _k = 'chatbridge:conversations';
      const raw = localStorage.getItem(_k);
      if (raw) {
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length) {
            chrome.runtime.sendMessage({ type: 'migrate_conversations', payload: { conversations: arr } }, (res) => {
              try {
                if (res && res.ok) {
                  try { localStorage.removeItem(_k); toast('Migrated conversations to extension storage'); } catch (e) { }
                }
              } catch (e) { debugLog('migrate callback err', e); }
            });
          }
        } catch (e) { debugLog('migrate parse failed', e); }
      }
    } catch (e) { debugLog('migrate convs failed', e); }

    // If legacy localStorage doesn't exist but extension storage has conversations,
    // show a one-time notice so users still see the migration toast.
    try {
      const legacy = (() => { try { return JSON.parse(localStorage.getItem('chatbridge:conversations') || '[]'); } catch (_) { return []; } })();
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['chatbridge:conversations', 'cb_migration_notice_shown_v1'], (data) => {
          try {
            const alreadyShown = !!data.cb_migration_notice_shown_v1;
            const inExt = Array.isArray(data['chatbridge:conversations']) && data['chatbridge:conversations'].length > 0;
            const noLegacy = !Array.isArray(legacy) || legacy.length === 0;
            if (!alreadyShown && inExt && noLegacy) {
              try { toast('Migrated conversations to extension storage'); } catch (_) { }
              try { chrome.storage.local.set({ cb_migration_notice_shown_v1: true }); } catch (_) { }
            }
          } catch (e) { /* ignore */ }
        });
      }
    } catch (_) { /* ignore */ }

    // Helper to close all internal views
    function closeAllViews() {
      try {
        syncView.classList.remove('cb-view-active');
        summView.classList.remove('cb-view-active');
        rewView.classList.remove('cb-view-active');
        transView.classList.remove('cb-view-active');
        try { if (typeof smartView !== 'undefined' && smartView) smartView.classList.remove('cb-view-active'); } catch (_) { }
        try { if (typeof graphView !== 'undefined' && graphView) graphView.classList.remove('cb-view-active'); } catch (_) { }
        try { if (typeof insightsView !== 'undefined' && insightsView) insightsView.classList.remove('cb-view-active'); } catch (_) { }
        try { if (typeof promptDesignerView !== 'undefined' && promptDesignerView) promptDesignerView.classList.remove('cb-view-active'); } catch (_) { }
        try { if (typeof agentView !== 'undefined' && agentView) agentView.classList.remove('cb-view-active'); } catch (_) { }
        try { if (typeof settingsPanel !== 'undefined' && settingsPanel) settingsPanel.classList.remove('cb-view-active'); } catch (_) { }
      } catch (e) { }
    }

    // Helper to load conversation text from lastScannedText or saved conversations
    async function getConversationText() {
      if (lastScannedText && lastScannedText.trim()) return lastScannedText.trim();
      try {
        const convs = await loadConversationsAsync();
        if (Array.isArray(convs) && convs.length) {
          const sel = convs[0];
          if (sel && sel.conversation && sel.conversation.length) return sel.conversation.map(m => `${m.role}: ${m.text}`).join('\n\n');
        }
      } catch (e) { debugLog('load convs', e); }
      return '';
    }

    // ============================================
    // SMART WORKSPACE FUNCTIONS
    // ============================================

    // INSIGHT FINDER - Extract semantic insights from chat (comparisons, contradictions, requirements, todos, deprecated)
    function extractInsights(messages) {
      const insights = {
        comparisons: [],
        contradictions: [],
        requirements: [],
        todos: [],
        deprecated: []
      };

      if (!messages || messages.length === 0) return insights;

      // Process each message
      messages.forEach((msg, idx) => {
        const text = msg.text || '';
        const lines = text.split(/\r?\n/).filter(l => l.trim());

        // 1. COMPARISONS - Look for "vs", "versus", "compared to", "better than", "worse than", "unlike", "difference between"
        lines.forEach(line => {
          if (/\b(vs\.?|versus|compared to|compare|better than|worse than|unlike|in contrast to|difference between|whereas|while)\b/i.test(line)) {
            insights.comparisons.push({ text: line.trim(), sourceIndex: idx });
          }
        });

        // 2. CONTRADICTIONS - Look for "however", "but", "actually", "incorrect", "wrong", "mistake", negations
        lines.forEach(line => {
          if (/\b(however|but|actually|incorrect|wrong|mistake|not quite|that's not|doesn't work|won't work|can't|shouldn't|instead|rather than)\b/i.test(line)) {
            insights.contradictions.push({ text: line.trim(), sourceIndex: idx });
          }
        });

        // 3. REQUIREMENTS - Look for "must", "need to", "required", "should", "important to", "ensure"
        lines.forEach(line => {
          if (/\b(must|required|requirement|need to|needs to|should|essential|important to|ensure|make sure|don't forget|remember to|always|never)\b/i.test(line)) {
            insights.requirements.push({ text: line.trim(), sourceIndex: idx });
          }
        });

        // 4. TODOS - Look for explicit todo markers, checkboxes, action items
        lines.forEach(line => {
          if (/^[-*•]\s*\[[ x]\]|^(TODO|To\s*Do|Action\s*Item|Task)[:\s]|^[-*•]\s*(install|set\s*up|configure|create|build|deploy|implement|add|update|fix|test)\b/i.test(line)) {
            insights.todos.push({ text: line.trim(), sourceIndex: idx });
          }
        });

        // 5. DEPRECATED - Look for "deprecated", "obsolete", "no longer", "replaced by", "legacy", "outdated"
        lines.forEach(line => {
          if (/\b(deprecated|obsolete|no longer|replaced by|legacy|outdated|old version|don't use|avoid using|stop using)\b/i.test(line)) {
            insights.deprecated.push({ text: line.trim(), sourceIndex: idx });
          }
        });
      });

      // Deduplicate by text
      Object.keys(insights).forEach(key => {
        const seen = new Set();
        insights[key] = insights[key].filter(item => {
          const normalized = item.text.toLowerCase().trim();
          if (seen.has(normalized)) return false;
          seen.add(normalized);
          return true;
        });
      });

      return insights;
    }

    // Show Insight Finder Modal
    function showInsightFinderModal(insights, messages) {
      // Remove existing modal if any
      const existing = document.getElementById('cb-insight-finder-modal');
      if (existing) existing.remove();

      // Helper to get theme variables
      function getThemeVars() {
        const style = getComputedStyle(document.documentElement);
        return {
          bg: style.getPropertyValue('--cb-bg').trim() || '#0A0F1C',
          bg2: style.getPropertyValue('--cb-bg2').trim() || '#10182B',
          white: style.getPropertyValue('--cb-white').trim() || '#E6E9F0',
          subtext: style.getPropertyValue('--cb-subtext').trim() || '#A0A7B5',
          accent: style.getPropertyValue('--cb-accent-primary').trim() || '#00B4FF',
          accent2: style.getPropertyValue('--cb-accent-secondary').trim() || '#8C1EFF',
        };
      }
      let themeVars = getThemeVars();

      // Create modal overlay
      const modal = document.createElement('div');
      modal.id = 'cb-insight-finder-modal';
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        backdrop-filter: blur(4px);
      `;

      // Create modal content
      const modalContent = document.createElement('div');
      modalContent.style.cssText = `
        background: linear-gradient(135deg, ${themeVars.bg2}F7 0%, ${themeVars.bg}F7 100%);
        border: 2px solid ${themeVars.accent}4D;
        border-radius: 16px;
        width: 90%;
        max-width: 1000px;
        height: 80%;
        max-height: 700px;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      `;

      // Header
      const header = document.createElement('div');
      header.style.cssText = `
        padding: 20px 24px;
        border-bottom: 1px solid ${themeVars.accent}33;
        display: flex;
        align-items: center;
        justify-content: space-between;
      `;
      header.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-size:24px;">🔍</span>
          <div>
            <div style="font-weight:700;font-size:18px;color:${themeVars.white};">Insight Finder</div>
            <div style="font-size:12px;color:${themeVars.subtext};margin-top:2px;">Semantic spotlight on key chat elements</div>
          </div>
        </div>
        <button id="cb-insight-close" style="background:none;border:none;color:${themeVars.white}B3;font-size:24px;cursor:pointer;padding:4px 8px;transition:all 0.2s;">×</button>
      `;

      // Main content area (split: categories left, snippets right)
      const mainArea = document.createElement('div');
      mainArea.style.cssText = `
        display: flex;
        flex: 1;
        overflow: hidden;
      `;

      // Left panel: Categories
      const leftPanel = document.createElement('div');
      leftPanel.style.cssText = `
        width: 200px;
        border-right: 1px solid ${themeVars.accent}33;
        padding: 16px;
        overflow-y: auto;
        background: ${themeVars.bg}33;
      `;

      const categories = [
        { key: 'comparisons', icon: '⚖️', label: 'Comparisons', count: insights.comparisons.length },
        { key: 'contradictions', icon: '⚠️', label: 'Contradictions', count: insights.contradictions.length },
        { key: 'requirements', icon: '✓', label: 'Requirements', count: insights.requirements.length },
        { key: 'todos', icon: '📋', label: 'Todos', count: insights.todos.length },
        { key: 'deprecated', icon: '🗑️', label: 'Deprecated', count: insights.deprecated.length }
      ];

      let selectedCategory = categories.find(c => c.count > 0)?.key || 'comparisons';

      categories.forEach(cat => {
        const catBtn = document.createElement('div');
        catBtn.className = 'cb-insight-category';
        catBtn.dataset.category = cat.key;
        catBtn.style.cssText = `
          padding: 12px;
          margin-bottom: 8px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          background: ${selectedCategory === cat.key ? themeVars.accent + '33' : 'transparent'};
          border: 1px solid ${selectedCategory === cat.key ? themeVars.accent + '66' : 'transparent'};
        `;
        catBtn.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span>${cat.icon}</span>
              <span style="font-size:13px;font-weight:500;color:${themeVars.white};">${cat.label}</span>
            </div>
            <span style="font-size:11px;color:${themeVars.white}80;background:${themeVars.accent}33;padding:2px 6px;border-radius:10px;">${cat.count}</span>
          </div>
        `;

        catBtn.addEventListener('mouseenter', () => {
          if (catBtn.dataset.category !== selectedCategory) {
            catBtn.style.background = themeVars.accent + '1A';
          }
        });
        catBtn.addEventListener('mouseleave', () => {
          if (catBtn.dataset.category !== selectedCategory) {
            catBtn.style.background = 'transparent';
          }
        });
        catBtn.addEventListener('click', () => {
          selectedCategory = cat.key;
          document.querySelectorAll('.cb-insight-category').forEach(el => {
            el.style.background = 'transparent';
            el.style.border = '1px solid transparent';
          });
          catBtn.style.background = themeVars.accent + '33';
          catBtn.style.border = '1px solid ' + themeVars.accent + '66';
          renderSnippets(cat.key);
        });

        leftPanel.appendChild(catBtn);
      });

      // Right panel: Snippets
      const rightPanel = document.createElement('div');
      rightPanel.id = 'cb-insight-snippets';
      rightPanel.style.cssText = `
        flex: 1;
        padding: 16px;
        overflow-y: auto;
      `;

      function renderSnippets(categoryKey) {
        const items = insights[categoryKey] || [];
        rightPanel.innerHTML = '';

        if (items.length === 0) {
          rightPanel.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;height:100%;color:${themeVars.subtext};font-size:14px;">
              No ${categoryKey} found in this conversation
            </div>
          `;
          return;
        }

        items.forEach(item => {
          const snippetCard = document.createElement('div');
          snippetCard.style.cssText = `
            background: ${themeVars.accent}0D;
            border: 1px solid ${themeVars.accent}26;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 12px;
            cursor: pointer;
            transition: all 0.2s;
          `;

          const msgRole = messages[item.sourceIndex]?.role || 'unknown';
          const roleIcon = msgRole === 'user' ? '👤' : '🤖';
          const roleColor = msgRole === 'user' ? '#4ade80' : '#60a5fa';

          snippetCard.innerHTML = `
            <div style="display:flex;align-items:start;gap:8px;margin-bottom:6px;">
              <span style="font-size:14px;">${roleIcon}</span>
              <span style="font-size:11px;color:${roleColor};font-weight:500;text-transform:capitalize;">${msgRole}</span>
              <span style="font-size:11px;color:${themeVars.subtext};margin-left:auto;">Message ${item.sourceIndex + 1}</span>
            </div>
            <div style="font-size:13px;line-height:1.5;color:${themeVars.white};white-space:pre-wrap;">${escapeHtml(item.text)}</div>
          `;

          snippetCard.addEventListener('mouseenter', () => {
            snippetCard.style.background = themeVars.accent + '1A';
            snippetCard.style.borderColor = themeVars.accent + '4D';
          });
          snippetCard.addEventListener('mouseleave', () => {
            snippetCard.style.background = themeVars.accent + '0D';
            snippetCard.style.borderColor = themeVars.accent + '26';
          });

          snippetCard.addEventListener('click', () => {
            // Scroll to message in chat
            scrollToMessage(item.sourceIndex);
            toast(`Scrolled to message ${item.sourceIndex + 1}`);
          });

          rightPanel.appendChild(snippetCard);
        });
      }

      // Helper: Scroll to message in chat
      function scrollToMessage(index) {
        try {
          const adapter = Object.values(window.SiteAdapters || {}).find(a => a.detect && a.detect());
          if (!adapter || !adapter.scrollContainer) return;

          const container = adapter.scrollContainer();
          if (!container) return;

          // Find all message elements
          const allMessages = Array.from(container.querySelectorAll('[data-message-id], .message, [class*="message"], [class*="Message"]')).filter(el => {
            const text = el.textContent || '';
            return text.trim().length > 10;
          });

          if (allMessages[index]) {
            allMessages[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Highlight briefly
            const originalBg = allMessages[index].style.background;
            allMessages[index].style.background = 'rgba(0,180,255,0.2)';
            setTimeout(() => {
              allMessages[index].style.background = originalBg;
            }, 2000);
          }
        } catch (e) {
          debugLog('Scroll to message failed', e);
        }
      }

      // Helper: Escape HTML
      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }

      // Initial render
      renderSnippets(selectedCategory);

      // Assemble modal
      mainArea.appendChild(leftPanel);
      mainArea.appendChild(rightPanel);
      modalContent.appendChild(header);
      modalContent.appendChild(mainArea);
      modal.appendChild(modalContent);

      // Close handler
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
      });
      // Use event delegation for close button (since it's innerHTML)
      modal.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'cb-insight-close') modal.remove();
      });

      // Theme update logic
      function updateThemeVars() {
        themeVars = getThemeVars();
        // Update modal content and all dynamic elements
        modalContent.style.background = `linear-gradient(135deg, ${themeVars.bg2}F7 0%, ${themeVars.bg}F7 100%)`;
        modalContent.style.border = `2px solid ${themeVars.accent}4D`;
        leftPanel.style.background = `${themeVars.bg}33`;
        leftPanel.style.borderRight = `1px solid ${themeVars.accent}33`;
        header.querySelector('div > div > div').style.color = themeVars.white;
        header.querySelector('div > div > div + div').style.color = themeVars.subtext;
        // Update all category buttons
        leftPanel.querySelectorAll('.cb-insight-category').forEach(catBtn => {
          const cat = catBtn.dataset.category;
          catBtn.style.background = (cat === selectedCategory) ? themeVars.accent + '33' : 'transparent';
          catBtn.style.border = (cat === selectedCategory) ? '1px solid ' + themeVars.accent + '66' : '1px solid transparent';
          catBtn.querySelector('span[style*="font-size:13px"]').style.color = themeVars.white;
          catBtn.querySelector('span[style*="font-size:11px"]').style.background = themeVars.accent + '33';
          catBtn.querySelector('span[style*="font-size:11px"]').style.color = themeVars.white + '80';
        });
        // Update all snippet cards
        rightPanel.querySelectorAll('div').forEach(snippetCard => {
          snippetCard.style.background = themeVars.accent + '0D';
          snippetCard.style.borderColor = themeVars.accent + '26';
          const meta = snippetCard.querySelector('span[style*="margin-left:auto"]');
          if (meta) meta.style.color = themeVars.subtext;
          const text = snippetCard.querySelector('div[style*="font-size:13px"]');
          if (text) text.style.color = themeVars.white;
        });
      }
      // Listen for theme changes
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      mql.addEventListener('change', updateThemeVars);
      // Also update on focus (in case theme changed while tab was inactive)
      window.addEventListener('focus', updateThemeVars);

      document.body.appendChild(modal);
      // Initial theme sync
      setTimeout(updateThemeVars, 10);
    }

    // ============================================
    // FAST LOCAL CONTENT EXTRACTION
    // Extracts URLs, numbers, lists, code, tables during scan (no API)
    // ============================================
    function extractContentFromMessages(messages) {
      const extracted = {
        urls: [],
        numbers: [],
        lists: [],
        codeBlocks: [],
        tables: [],
        keyPhrases: [],
        emails: [],
        dates: [],
        commands: []
      };

      if (!messages || !messages.length) return extracted;

      const seenUrls = new Set();
      const seenNumbers = new Set();

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const text = msg.text || '';
        const role = msg.role || 'unknown';

        // Extract URLs
        const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
        const urls = text.match(urlRegex) || [];
        urls.forEach(url => {
          const cleanUrl = url.replace(/[.,;:!?)]+$/, ''); // Remove trailing punctuation
          if (!seenUrls.has(cleanUrl) && cleanUrl.length > 10) {
            seenUrls.add(cleanUrl);
            extracted.urls.push({
              value: cleanUrl,
              msgIndex: i,
              role: role,
              domain: new URL(cleanUrl).hostname.replace('www.', '')
            });
          }
        });

        // Extract emails
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const emails = text.match(emailRegex) || [];
        emails.forEach(email => extracted.emails.push({ value: email, msgIndex: i, role }));

        // Extract numbers/statistics (with context)
        const numberRegex = /(\$[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?%|[\d,]+(?:\.\d+)?\s*(?:GB|MB|KB|TB|ms|seconds?|minutes?|hours?|days?|months?|years?|users?|items?|records?|rows?|files?)|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?|\b\d+(?:\.\d+)?(?:\s*(?:k|m|b|K|M|B))?\b)/gi;
        const lines = text.split('\n');
        lines.forEach(line => {
          const nums = line.match(numberRegex) || [];
          nums.forEach(num => {
            const key = num.toLowerCase().replace(/\s+/g, '');
            if (!seenNumbers.has(key) && num.length > 1) {
              seenNumbers.add(key);
              extracted.numbers.push({
                value: num.trim(),
                context: line.substring(0, 100).trim(),
                msgIndex: i,
                role
              });
            }
          });
        });

        // Extract dates - MORE STRICT to avoid false positives like "11 marks"
        // Only match: DD/MM/YYYY, YYYY-MM-DD, Month DD YYYY, DD Month YYYY
        const dateRegex = /(\d{1,2}[\\/\\-]\d{1,2}[\\/\\-]\d{2,4}|\d{4}[\\/\\-]\d{1,2}[\\/\\-]\d{1,2}|(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?(?:,?\s+\d{4})?)/gi;
        const dates = text.match(dateRegex) || [];
        // Filter out obvious false positives
        const validDates = dates.filter(d => {
          const lower = d.toLowerCase();
          // Must contain a month name or proper date format with separators
          const hasMonth = /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(d);
          const hasSeparator = /[\\/\\-]/.test(d);
          return hasMonth || hasSeparator;
        });
        validDates.forEach(date => extracted.dates.push({ value: date.trim(), msgIndex: i, role }));

        // Extract lists (bullet points, numbered lists) - more permissive
        lines.forEach(line => {
          // Match bullet points (-, *, •, →) or numbered lists (1. 2) a) etc)
          const listMatch = line.match(/^(?:\s*[-*•→▪▸]\s+|\s*\d+[.)]\s+|\s*[a-z][.)]\s+)(.+)/i);
          if (listMatch && listMatch[1] && listMatch[1].length > 3) {
            // Check if we already have a list being built for this pattern
            const existingList = extracted.lists.find(l => l.msgIndex === i);
            if (existingList) {
              existingList.items.push(listMatch[1].trim());
              existingList.count = existingList.items.length;
            } else {
              extracted.lists.push({
                items: [listMatch[1].trim()],
                count: 1,
                msgIndex: i,
                role
              });
            }
          }
        });

        // Extract code blocks
        const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
        let codeMatch;
        while ((codeMatch = codeBlockRegex.exec(text)) !== null) {
          const lang = codeMatch[1] || 'code';
          const code = codeMatch[2].trim();
          if (code.length > 10) {
            extracted.codeBlocks.push({
              language: lang,
              code: code,
              preview: code.substring(0, 100),
              msgIndex: i,
              role
            });
          }
        }

        // Extract inline code/commands
        const inlineCodeRegex = /`([^`]+)`/g;
        let inlineMatch;
        while ((inlineMatch = inlineCodeRegex.exec(text)) !== null) {
          const cmd = inlineMatch[1].trim();
          if (cmd.length > 3 && /^(npm|yarn|pip|python|node|git|docker|curl|wget|cd|mkdir|rm|mv|cp|ls|cat|echo|export|make|brew|apt|yum)/i.test(cmd)) {
            extracted.commands.push({
              value: cmd,
              msgIndex: i,
              role
            });
          }
        }

        // Detect tables (simple markdown tables)
        const tableLines = [];
        let inTable = false;
        lines.forEach(line => {
          if (line.includes('|') && line.split('|').length >= 3) {
            tableLines.push(line);
            inTable = true;
          } else if (inTable && tableLines.length > 0) {
            if (tableLines.length >= 2) {
              extracted.tables.push({
                rows: tableLines.length,
                preview: tableLines[0].substring(0, 80),
                content: tableLines.join('\n'),
                msgIndex: i,
                role
              });
            }
            tableLines.length = 0;
            inTable = false;
          }
        });
        if (tableLines.length >= 2) {
          extracted.tables.push({
            rows: tableLines.length,
            preview: tableLines[0].substring(0, 80),
            content: tableLines.join('\n'),
            msgIndex: i,
            role
          });
        }
      }

      // Store globally for UI access
      try {
        window.ChatBridge = window.ChatBridge || {};
        window.ChatBridge._extractedContent = extracted;
      } catch (e) { }

      console.log('[ChatBridge] Local extraction complete:', {
        urls: extracted.urls.length,
        numbers: extracted.numbers.length,
        lists: extracted.lists.length,
        codeBlocks: extracted.codeBlocks.length,
        tables: extracted.tables.length,
        emails: extracted.emails.length,
        dates: extracted.dates.length,
        commands: extracted.commands.length
      });

      return extracted;
    }

    // Expose globally
    try {
      window.ChatBridge = window.ChatBridge || {};
      window.ChatBridge.extractContentFromMessages = extractContentFromMessages;
    } catch (e) { }

    // ============================================
    // DEDUPLICATE & MERGE SAVED CONVERSATIONS
    // Removes exact duplicates and merges overlapping conversations
    // ============================================
    async function deduplicateSavedConversations() {
      const key = 'chatbridge:conversations';
      let conversations = [];

      // Load conversations - try loadConversationsAsync first, then fallback
      try {
        if (typeof loadConversationsAsync === 'function') {
          conversations = await loadConversationsAsync();
          console.log('[ChatBridge] Loaded', conversations.length, 'conversations via loadConversationsAsync');
        } else if (typeof window.ChatBridge?.loadConversationsAsync === 'function') {
          conversations = await window.ChatBridge.loadConversationsAsync();
        }
      } catch (e) {
        console.log('[ChatBridge] loadConversationsAsync failed, using direct storage access');
      }

      // Fallback to direct storage access if needed
      if (!conversations || conversations.length === 0) {
        try {
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            const data = await new Promise(r => chrome.storage.local.get([key], d => r(d && d[key])));
            conversations = Array.isArray(data) ? data : [];
          }
          if (conversations.length === 0) {
            try {
              const local = JSON.parse(localStorage.getItem(key) || '[]');
              conversations = Array.isArray(local) ? local : [];
            } catch (_) { }
          }
        } catch (_) { }
      }

      conversations = Array.isArray(conversations) ? conversations : [];

      if (conversations.length < 2) {
        return { cleaned: conversations, stats: { duplicates: 0, overlaps: 0, originalCount: conversations.length, finalCount: conversations.length } };
      }

      console.log('[ChatBridge] Deduplicating', conversations.length, 'saved conversations...');

      // Helper: Generate hash from messages for comparison
      const hashConversation = (conv) => {
        const msgs = conv.conversation || conv.messages || [];
        if (msgs.length === 0) return '';
        // Use first 3 + last 3 messages for hash
        const sample = [...msgs.slice(0, 3), ...msgs.slice(-3)];
        return sample.map(m => (m.text || '').trim().substring(0, 100)).join('|||');
      };

      // Helper: Check if conv A is subset of conv B
      const isSubset = (a, b) => {
        const msgsA = a.conversation || a.messages || [];
        const msgsB = b.conversation || b.messages || [];
        if (msgsA.length === 0 || msgsB.length <= msgsA.length) return false;
        if (a.platform?.toLowerCase() !== b.platform?.toLowerCase()) return false;

        // Check if first 3 messages of A match first 3 of B
        const sampleA = msgsA.slice(0, 3).map(m => (m.text || '').trim().substring(0, 200)).join('|||');
        const sampleB = msgsB.slice(0, 3).map(m => (m.text || '').trim().substring(0, 200)).join('|||');

        return sampleA === sampleB;
      };

      // Group by platform
      const byPlatform = {};
      conversations.forEach((conv, idx) => {
        const p = (conv.platform || 'unknown').toLowerCase();
        if (!byPlatform[p]) byPlatform[p] = [];
        byPlatform[p].push({ conv, idx, hash: hashConversation(conv) });
      });

      const toRemove = new Set();
      let duplicateCount = 0;
      let overlapCount = 0;

      // Process each platform group
      for (const platform in byPlatform) {
        const group = byPlatform[platform];

        // Find exact duplicates (same hash)
        const seenHashes = {};
        for (const item of group) {
          if (item.hash && seenHashes[item.hash] !== undefined) {
            // This is a duplicate - keep the newer one (higher timestamp)
            const existingIdx = seenHashes[item.hash];
            const existing = group.find(g => g.idx === existingIdx);
            if (existing) {
              const tsA = item.conv.ts || 0;
              const tsB = existing.conv.ts || 0;
              if (tsA > tsB) {
                toRemove.add(existingIdx);
                seenHashes[item.hash] = item.idx;
              } else {
                toRemove.add(item.idx);
              }
              duplicateCount++;
            }
          } else if (item.hash) {
            seenHashes[item.hash] = item.idx;
          }
        }

        // Find overlapping conversations (subset relationships)
        // Sort by message count descending
        const sortedByLength = [...group].sort((a, b) => {
          const lenA = (a.conv.conversation || a.conv.messages || []).length;
          const lenB = (b.conv.conversation || b.conv.messages || []).length;
          return lenB - lenA;
        });

        for (let i = 0; i < sortedByLength.length; i++) {
          if (toRemove.has(sortedByLength[i].idx)) continue;

          for (let j = i + 1; j < sortedByLength.length; j++) {
            if (toRemove.has(sortedByLength[j].idx)) continue;

            // Check if j is subset of i
            if (isSubset(sortedByLength[j].conv, sortedByLength[i].conv)) {
              toRemove.add(sortedByLength[j].idx);
              overlapCount++;
            }
          }
        }
      }

      // Build cleaned list
      const cleaned = conversations.filter((_, idx) => !toRemove.has(idx));

      console.log('[ChatBridge] Deduplication complete:', {
        original: conversations.length,
        duplicates: duplicateCount,
        overlaps: overlapCount,
        final: cleaned.length
      });

      return {
        cleaned,
        original: conversations,
        stats: {
          duplicates: duplicateCount,
          overlaps: overlapCount,
          originalCount: conversations.length,
          finalCount: cleaned.length
        }
      };
    }

    // Save cleaned conversations back to ALL storage locations
    async function saveCleannedConversations(conversations) {
      const key = 'chatbridge:conversations';
      let saved = false;

      try {
        // 1. Send to background script to replace IndexedDB AND chrome.storage.local
        // This is the primary storage - wait for it to complete
        try {
          if (typeof chrome !== 'undefined' && chrome.runtime) {
            const bgResult = await new Promise((resolve) => {
              chrome.runtime.sendMessage({
                type: 'replace_conversations',
                payload: { conversations: conversations }
              }, (response) => {
                if (chrome.runtime.lastError) {
                  console.warn('[ChatBridge] Background replace failed:', chrome.runtime.lastError);
                  resolve(false);
                } else {
                  resolve(response?.ok || false);
                }
              });
            });
            if (bgResult) {
              console.log('[ChatBridge] Background storage replaced with', conversations.length, 'conversations');
              saved = true;
            }
          }
        } catch (e) {
          console.warn('[ChatBridge] Background replace error:', e);
        }

        // 2. Also save to chrome.storage.local directly (backup)
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          await new Promise(r => chrome.storage.local.set({ [key]: conversations }, r));
          console.log('[ChatBridge] Saved', conversations.length, 'conversations to chrome.storage.local');
          saved = true;
        }

        // 3. Save to localStorage (fallback)
        try {
          localStorage.setItem(key, JSON.stringify(conversations));
          console.log('[ChatBridge] Saved', conversations.length, 'conversations to localStorage');
          saved = true;
        } catch (_) { }

        return saved;
      } catch (e) {
        console.error('[ChatBridge] Failed to save cleaned conversations:', e);
        return false;
      }
    }

    // Expose globally
    try {
      window.ChatBridge = window.ChatBridge || {};
      window.ChatBridge.deduplicateSavedConversations = deduplicateSavedConversations;
      window.ChatBridge.saveCleannedConversations = saveCleannedConversations;
    } catch (e) { }

    // Extract actionable items from plain chat text without AI calls
    function extractActionPlanFromText(text) {
      try {
        const out = { tasks: [], steps: [], todos: [], commands: [], reminders: [] };
        if (!text || !text.trim()) return out;

        const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);

        // Collect code fences as commands
        const codeBlocks = [];
        let inCode = false, codeLang = '', buffer = [];
        for (const l of lines) {
          if (/^```/.test(l)) {
            if (!inCode) { inCode = true; codeLang = l.replace(/```\s*/, '').trim(); buffer = []; }
            else { inCode = false; if (buffer.length) codeBlocks.push(buffer.join('\n')); buffer = []; codeLang = ''; }
            continue;
          }
          if (inCode) { buffer.push(l); }
        }
        codeBlocks.forEach(cb => cb.split(/\n/).forEach(cmd => {
          const c = cmd.trim();
          if (!c) return;
          if (/^(npm|yarn|pnpm|pip|pip3|python|node|npx|git|docker|kubectl|az|aws|gcloud|make|bash|sh|pwsh|powershell|cd|mkdir|rm|mv|cp|curl|wget)\b/i.test(c)) {
            out.commands.push(c);
          }
        }));

        // Expanded heuristics: action verbs, imperative, and user requests
        const taskVerbs = /(install|set\s*up|configure|create|build|deploy|design|draft|write|document|research|investigate|prototype|refactor|optimi[sz]e|test|fix|debug|review|plan|migrate|backup|monitor|enable|disable|implement|add|update|replace|remove|delete|change|modify|improve|enhance|ensure|verify|check)\b/i;
        const userRequestPattern = /^(user:|👤|User)\s*(.+?)$/i;
        const reminderTerms = /(remind|follow\s*up|check\s*back|tomorrow|next\s*(week|month)|later|by\s*\d{1,2}\/\d{1,2}|due\s*(date)?|schedule|deadline)/i;
        const stepMarker = /^(?:\d+\.|\d+\)|step\s*\d+\s*[:\-]|[-*•]\s+|—\s+|–\s+)/i;
        const todoPattern = /^(todo|to\s*do|action\s*item|task)[:\s]+(.+)/i;

        for (const l of lines) {
          if (/^>/.test(l)) continue; // skip blockquotes
          if (/^```/.test(l)) continue;
          if (/^(assistant:|🤖|Assistant)\s*$/i.test(l)) continue; // skip role markers alone

          // Detect explicit to-do items
          const todoMatch = l.match(todoPattern);
          if (todoMatch && todoMatch[2]) {
            out.todos.push(todoMatch[2].trim());
            continue;
          }

          // Step markers (lists)
          if (stepMarker.test(l)) {
            const clean = l.replace(stepMarker, '').trim();
            if (clean.length > 5) out.steps.push(clean);
            continue;
          }

          // Reminders
          if (reminderTerms.test(l)) {
            out.reminders.push(l);
            continue;
          }

          // Extract user requests as tasks
          const userMatch = l.match(userRequestPattern);
          if (userMatch && userMatch[2]) {
            const req = userMatch[2].trim();
            if (taskVerbs.test(req) && req.length > 10) {
              out.tasks.push(req);
              continue;
            }
          }

          // General task detection (imperative sentences with action verbs)
          if (taskVerbs.test(l) && l.length > 10) {
            // Heuristic: if starts with verb or contains "should", "need to", "want to"
            if (/^(please\s+)?[a-z]+/i.test(l) || /(should|need\s*to|want\s*to|must|have\s*to)\s+/i.test(l)) {
              if (/todo|to\s*do|action\s*item/i.test(l)) out.todos.push(l);
              else out.tasks.push(l);
              continue;
            }
          }

          // Commands inline with backticks
          const inlineCmds = [...l.matchAll(/`([^`]+)`/g)].map(m => m[1]);
          inlineCmds.forEach(c => {
            if (/^(npm|yarn|pnpm|pip|pip3|python|node|npx|git|docker|kubectl|az|aws|gcloud|make|bash|sh|pwsh|powershell|cd|mkdir|rm|mv|cp|curl|wget)\b/i.test(c.trim())) {
              out.commands.push(c.trim());
            }
          });
        }

        // De-duplicate and clip to one sentence
        const dedupe = arr => Array.from(new Set(arr.map(s => s.replace(/\s+/g, ' ').trim())));
        const oneSentence = s => {
          const clipped = s.replace(/\s+/g, ' ').trim();
          const cut = clipped.split(/(?<=\.)\s+/)[0] || clipped;
          return cut.length > 200 ? cut.slice(0, 200) : cut;
        };

        out.tasks = dedupe(out.tasks).map(oneSentence).slice(0, 12);
        out.steps = dedupe(out.steps).map(oneSentence).slice(0, 12);
        out.todos = dedupe(out.todos).map(oneSentence).slice(0, 12);
        out.commands = dedupe(out.commands).map(s => s.slice(0, 200)).slice(0, 12);
        out.reminders = dedupe(out.reminders).map(oneSentence).slice(0, 12);

        return out;
      } catch (e) { debugLog('extractActionPlanFromText error', e); return { tasks: [], steps: [], todos: [], commands: [], reminders: [] }; }
    }

    function actionPlanToReadable(plan) {
      try {
        let out = '📌 Action Plan\n\n';
        let count = 0;
        if (plan.tasks && plan.tasks.length) {
          out += '— Tasks\n';
          plan.tasks.forEach(t => { out += `  • ${t}\n`; });
          out += '\n';
          count += plan.tasks.length;
        }
        if (plan.steps && plan.steps.length) {
          out += '— Steps\n';
          plan.steps.forEach((s, i) => { out += `  ${i + 1}. ${s}\n`; });
          out += '\n';
          count += plan.steps.length;
        }
        if (plan.todos && plan.todos.length) {
          out += '— To-dos\n';
          plan.todos.forEach(t => { out += `  • ${t}\n`; });
          out += '\n';
          count += plan.todos.length;
        }
        if (plan.commands && plan.commands.length) {
          out += '— Commands\n';
          plan.commands.forEach(c => { out += `  $ ${c}\n`; });
          out += '\n';
          count += plan.commands.length;
        }
        if (plan.reminders && plan.reminders.length) {
          out += '— Reminders\n';
          plan.reminders.forEach(r => { out += `  ⏰ ${r}\n`; });
          out += '\n';
          count += plan.reminders.length;
        }
        if (count === 0) return '📌 Action Plan\n\n(No actionable items detected in this conversation)';
        return out.trim();
      } catch (_) { return '📌 Action Plan\n\n(Error formatting plan)'; }
    }

    // ============================================
    // IMAGE VAULT - Store and display all images from conversation
    // ============================================

    const IMAGE_VAULT_DB_NAME = 'chatbridge_image_vault';
    const IMAGE_VAULT_STORE_NAME = 'images';
    let imageVaultDB = null;

    // Initialize IndexedDB for Image Vault
    async function initImageVaultDB() {
      if (imageVaultDB) return imageVaultDB;

      return new Promise((resolve, reject) => {
        const request = indexedDB.open(IMAGE_VAULT_DB_NAME, 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          imageVaultDB = request.result;
          resolve(imageVaultDB);
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(IMAGE_VAULT_STORE_NAME)) {
            const store = db.createObjectStore(IMAGE_VAULT_STORE_NAME, { keyPath: 'id' });
            store.createIndex('timestamp', 'timestamp', { unique: false });
            store.createIndex('role', 'role', { unique: false });
            store.createIndex('messageIndex', 'messageIndex', { unique: false });
          }
        };
      });
    }

    // Hash image source for deduplication
    async function hashImageSrc(src) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(src);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) {
        // Fallback to simple hash
        let hash = 0;
        for (let i = 0; i < src.length; i++) {
          const char = src.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
      }
    }

    // ============================================
    // PLATFORM-SPECIFIC MEDIA EXTRACTION
    // Extracts images, files, and artifacts from each AI platform
    // ============================================
    async function extractAllMediaFromPage() {
      const platform = detectCurrentPlatform();
      console.log('[ChatBridge] Extracting all media from platform:', platform);

      const media = {
        images: [],
        files: [],
        artifacts: [],
        platform: platform,
        timestamp: Date.now()
      };

      const seenUrls = new Set();

      // Helper to add media item
      const addMedia = async (type, src, name, extra = {}) => {
        if (!src || src.length < 10 || seenUrls.has(src)) return;
        seenUrls.add(src);

        const hash = await hashImageSrc(src);
        const item = {
          id: hash,
          type: type,
          src: src,
          name: name || 'unnamed',
          timestamp: Date.now(),
          platform: platform,
          ...extra
        };

        if (type === 'image') media.images.push(item);
        else if (type === 'file') media.files.push(item);
        else if (type === 'artifact') media.artifacts.push(item);
      };

      // ========== CHATGPT EXTRACTION ==========
      if (platform === 'ChatGPT') {
        console.log('[ChatBridge] Using ChatGPT extraction...');

        // Images in ChatGPT - look for DALL-E generated images and uploaded images
        const imgSelectors = [
          'img[src*="oaidalleapiprodscus"]',  // DALL-E images
          'img[src*="blob:"]',                 // Uploaded images (blob URLs)
          'img[src*="files.oaiusercontent"]',  // User uploaded files
          'img[src*="openai"]',                // OpenAI hosted images
          '[data-testid*="image"] img',        // Image containers
          '[data-message-author-role] img',    // Images in message blocks
          '.group img',                        // Message group images
          'article img',                       // Article images
          '.prose img',                        // Prose content images
          'img[width][height]',                // Sized images (not icons)
          'main img'                           // Any image in main area
        ];

        for (const sel of imgSelectors) {
          try {
            const imgs = document.querySelectorAll(sel);
            console.log('[ChatBridge] ChatGPT selector', sel, 'found', imgs.length, 'images');
            for (const img of imgs) {
              const src = img.src || img.currentSrc;
              if (src && src.length > 50 && !src.includes('avatar') && !src.includes('icon') && !src.includes('emoji') && !src.includes('logo')) {
                // Check size to filter out tiny images
                try {
                  const rect = img.getBoundingClientRect();
                  if (rect.width > 50 && rect.height > 50) {
                    await addMedia('image', src, img.alt || 'ChatGPT Image');
                  }
                } catch (e) {
                  await addMedia('image', src, img.alt || 'ChatGPT Image');
                }
              }
            }
          } catch (e) { }
        }

        // Fallback: scan ALL images in the document
        if (media.images.length === 0) {
          console.log('[ChatBridge] ChatGPT: No images found with specific selectors, scanning all images...');
          const allImgs = document.querySelectorAll('img');
          console.log('[ChatBridge] ChatGPT: Found', allImgs.length, 'total images in document');
          for (const img of allImgs) {
            const src = img.src || img.currentSrc;
            if (!src || src.length < 50) continue;
            if (src.includes('avatar') || src.includes('icon') || src.includes('emoji') || src.includes('logo') || src.includes('favicon')) continue;

            try {
              const rect = img.getBoundingClientRect();
              if (rect.width > 50 && rect.height > 50) {
                console.log('[ChatBridge] ChatGPT fallback: Adding image', src.substring(0, 80));
                await addMedia('image', src, img.alt || 'Image');
              }
            } catch (e) { }
          }
        }

        // Files in ChatGPT - uploaded documents
        const fileLinks = document.querySelectorAll('a[href*="files.oaiusercontent"], a[download], [data-testid*="file"]');
        for (const link of fileLinks) {
          const href = link.href || link.getAttribute('data-url');
          const name = link.textContent || link.getAttribute('download') || 'File';
          if (href) await addMedia('file', href, name.trim());
        }
      }

      // ========== CLAUDE EXTRACTION ==========
      else if (platform === 'Claude') {
        console.log('[ChatBridge] Using Claude extraction...');

        // Images in Claude
        const claudeImgs = document.querySelectorAll([
          'img[src*="claude"]',
          'img[src*="anthropic"]',
          'img[src*="blob:"]',
          '.prose img',
          '[data-testid*="image"] img',
          'img:not([alt*="avatar"]):not([alt*="icon"]):not([alt*="logo"])'
        ].join(', '));

        for (const img of claudeImgs) {
          const src = img.src || img.currentSrc;
          if (src && src.length > 50) {
            // Check size
            try {
              const rect = img.getBoundingClientRect();
              if (rect.width > 50 && rect.height > 50) {
                await addMedia('image', src, img.alt || 'Claude Image');
              }
            } catch (e) {
              await addMedia('image', src, img.alt || 'Claude Image');
            }
          }
        }

        // Files in Claude - attachments
        const claudeFiles = document.querySelectorAll([
          'a[download]',
          '[data-testid*="attachment"]',
          '[class*="attachment"]',
          'a[href*="blob:"]'
        ].join(', '));

        for (const file of claudeFiles) {
          const href = file.href || file.getAttribute('data-url');
          const name = file.textContent || file.getAttribute('download') || 'File';
          if (href) await addMedia('file', href, name.trim());
        }

        // ARTIFACTS in Claude - code blocks, rendered content, canvas
        const artifactSelectors = [
          '[data-testid*="artifact"]',
          '[class*="artifact"]',
          '[class*="code-block"]',
          '[class*="rendered-content"]',
          'pre code',
          '.antml-artifact',
          '[data-artifact]'
        ];

        for (const sel of artifactSelectors) {
          const artifacts = document.querySelectorAll(sel);
          artifacts.forEach(async (artifact, idx) => {
            // Get artifact type/title if available
            const titleEl = artifact.querySelector('[class*="title"], [class*="header"], h1, h2, h3');
            const title = titleEl ? titleEl.textContent.trim() : `Artifact ${idx + 1}`;

            // Get artifact content
            let content = '';
            const codeEl = artifact.querySelector('code, pre');
            if (codeEl) {
              content = codeEl.textContent || codeEl.innerText;
            } else {
              content = artifact.innerHTML || artifact.textContent;
            }

            // Detect artifact type
            let artifactType = 'code';
            if (artifact.classList.contains('html') || content.includes('<!DOCTYPE') || content.includes('<html')) {
              artifactType = 'html';
            } else if (artifact.classList.contains('react') || content.includes('import React') || content.includes('useState')) {
              artifactType = 'react';
            } else if (artifact.classList.contains('svg') || content.includes('<svg')) {
              artifactType = 'svg';
            } else if (content.includes('```mermaid') || content.includes('graph ') || content.includes('sequenceDiagram')) {
              artifactType = 'mermaid';
            }

            if (content && content.length > 10) {
              await addMedia('artifact', 'artifact:' + idx, title, {
                artifactType: artifactType,
                content: content.substring(0, 50000), // Limit size
                preview: content.substring(0, 500)
              });
            }
          });
        }
      }

      // ========== GEMINI EXTRACTION ==========
      else if (platform === 'Gemini') {
        console.log('[ChatBridge] Using Gemini extraction...');

        // Images in Gemini
        const geminiImgs = document.querySelectorAll([
          'message-content img',
          'model-response img',
          'user-query img',
          'img[src*="googleusercontent"]',
          'img[src*="blob:"]',
          '.markdown img'
        ].join(', '));

        for (const img of geminiImgs) {
          const src = img.src || img.currentSrc;
          if (src && src.length > 50) {
            try {
              const rect = img.getBoundingClientRect();
              if (rect.width > 40 && rect.height > 40) {
                await addMedia('image', src, img.alt || 'Gemini Image');
              }
            } catch (e) {
              await addMedia('image', src, img.alt || 'Gemini Image');
            }
          }
        }
      }

      // ========== GENERIC FALLBACK ==========
      else {
        console.log('[ChatBridge] Using generic extraction...');

        // Generic image extraction
        const mainContent = document.querySelector('main, [role="main"], .conversation, .chat') || document.body;
        const allImgs = mainContent.querySelectorAll('img');

        for (const img of allImgs) {
          const src = img.src || img.currentSrc;
          if (!src || src.length < 30) continue;
          if (src.includes('icon') || src.includes('avatar') || src.includes('logo') || src.includes('emoji')) continue;

          try {
            const rect = img.getBoundingClientRect();
            if (rect.width > 50 && rect.height > 50) {
              await addMedia('image', src, img.alt || 'Image');
            }
          } catch (e) {
            await addMedia('image', src, img.alt || 'Image');
          }
        }

        // Generic file links
        const fileLinks = mainContent.querySelectorAll('a[download], a[href*=".pdf"], a[href*=".doc"], a[href*=".xlsx"]');
        for (const link of fileLinks) {
          const href = link.href;
          const name = link.textContent || link.getAttribute('download') || 'File';
          if (href) await addMedia('file', href, name.trim());
        }
      }

      console.log('[ChatBridge] Media extraction complete:', {
        images: media.images.length,
        files: media.files.length,
        artifacts: media.artifacts.length
      });

      return media;
    }

    // Expose the new function globally
    try {
      window.ChatBridge = window.ChatBridge || {};
      window.ChatBridge.extractAllMediaFromPage = extractAllMediaFromPage;
    } catch (e) { }

    // Extract images from messages
    async function extractImagesFromMessages(messages) {
      console.log('[ChatBridge] Starting image extraction from', messages.length, 'messages');
      const images = [];
      const seenHashes = new Set();

      // Debug: Log how many messages have element references
      const msgsWithEl = messages.filter(m => m.el).length;
      console.log('[ChatBridge] Messages with DOM element (el):', msgsWithEl, 'of', messages.length);

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const role = msg.role || 'unknown';
        const text = msg.text || '';
        const el = msg.el;

        const foundSrcs = new Set();

        // 1. Extract from message element if available
        if (el) {
          // Standard img tags
          const imgTags = el.querySelectorAll('img');
          console.log('[ChatBridge] Message', i, '- Found', imgTags.length, 'img tags');
          imgTags.forEach(img => {
            const src = img.src || img.dataset.src || img.getAttribute('data-src') || img.currentSrc;
            if (src && src.length > 10 && !src.includes('icon') && !src.includes('avatar') && !src.includes('emoji') && !src.includes('logo')) {
              foundSrcs.add(src);
              console.log('[ChatBridge] Found image in element:', src.substring(0, 100) + (src.length > 100 ? '...' : ''));
            }
          });

          // Picture/source elements
          const sources = el.querySelectorAll('picture source, source[type*="image"]');
          sources.forEach(source => {
            const srcset = source.srcset || source.src;
            if (srcset) {
              // Handle srcset format: "url1 1x, url2 2x"
              const urls = srcset.split(',').map(s => s.trim().split(' ')[0]);
              urls.forEach(url => {
                if (url && url.length > 10) {
                  foundSrcs.add(url);
                  console.log('[ChatBridge] Found image in picture/source:', url.substring(0, 100));
                }
              });
            }
          });

          // Background images in CSS
          const allElements = el.querySelectorAll('*');
          allElements.forEach(elem => {
            try {
              const style = window.getComputedStyle(elem);
              const bgImage = style.backgroundImage;
              if (bgImage && bgImage !== 'none' && bgImage.startsWith('url(')) {
                const match = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
                if (match && match[1] && !match[1].includes('icon') && !match[1].includes('avatar')) {
                  foundSrcs.add(match[1]);
                  console.log('[ChatBridge] Found background image:', match[1].substring(0, 100));
                }
              }
            } catch (e) { }
          });

          // Canvas elements (try to export as data URL)
          const canvases = el.querySelectorAll('canvas');
          canvases.forEach(canvas => {
            try {
              if (canvas.width > 50 && canvas.height > 50) {
                const dataUrl = canvas.toDataURL('image/png');
                if (dataUrl && dataUrl.length > 100) {
                  foundSrcs.add(dataUrl);
                  console.log('[ChatBridge] Found canvas image');
                }
              }
            } catch (e) { /* CORS might block this */ }
          });

          // SVG elements
          const svgs = el.querySelectorAll('svg');
          svgs.forEach(svg => {
            try {
              const rect = svg.getBoundingClientRect();
              if (rect.width > 50 && rect.height > 50) {
                const svgData = new XMLSerializer().serializeToString(svg);
                const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                foundSrcs.add(dataUrl);
                console.log('[ChatBridge] Found SVG image');
              }
            } catch (e) { }
          });
        } else {
          console.log('[ChatBridge] Message', i, '- No DOM element (el) available');
        }

        // 2. Extract from markdown images ![](url)
        const markdownImages = text.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g);
        for (const match of markdownImages) {
          foundSrcs.add(match[2]);
          console.log('[ChatBridge] Found markdown image:', match[2].substring(0, 100));
        }

        // 3. Extract from HTML img tags in text
        const htmlImages = text.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
        for (const match of htmlImages) {
          foundSrcs.add(match[1]);
          console.log('[ChatBridge] Found HTML img tag:', match[1].substring(0, 100));
        }

        // 4. Extract base64 and data URLs
        const dataUrls = text.matchAll(/data:image\/[^;]+;base64,[A-Za-z0-9+\/=]+/g);
        for (const match of dataUrls) {
          foundSrcs.add(match[0]);
          console.log('[ChatBridge] Found data URL image (base64)');
        }

        // 5. Extract blob URLs
        const blobUrls = text.matchAll(/blob:https?:\/\/[^\s"'<>]+/g);
        for (const match of blobUrls) {
          foundSrcs.add(match[0]);
          console.log('[ChatBridge] Found blob URL:', match[0].substring(0, 100));
        }

        // 6. Check attachments array if present
        if (msg.attachments && Array.isArray(msg.attachments)) {
          for (const att of msg.attachments) {
            if (att.type === 'image' && att.url) {
              foundSrcs.add(att.url);
              console.log('[ChatBridge] Found image in attachments:', att.url.substring(0, 100));
            }
          }
        }

        // Process found sources
        console.log('[ChatBridge] Message', i, '- Total unique sources found:', foundSrcs.size);
        for (const src of foundSrcs) {
          if (!src || src.length < 10) continue;

          const hash = await hashImageSrc(src);
          if (seenHashes.has(hash)) continue;
          seenHashes.add(hash);

          images.push({
            id: hash,
            src: src,
            role: role,
            timestamp: Date.now(),
            messageIndex: i,
            originatingModel: detectCurrentPlatform()
          });
        }
      }

      // FALLBACK: If no images found in messages, scan the entire chat area
      if (images.length === 0) {
        console.log('[ChatBridge] No images in messages, trying page-wide scan...');

        // Find the main chat container - try multiple selectors
        let chatContainer = null;
        const containerSelectors = [
          '[data-testid="conversation-turn-3"]',  // ChatGPT specific
          '[data-testid="conversation-turns"]',    // ChatGPT container
          'main[class*="flex"]',                   // ChatGPT main area
          '[role="main"]',
          'main',
          '.conversation',
          '.chat',
          '[data-testid*="conversation"]'
        ];

        for (const sel of containerSelectors) {
          const el = document.querySelector(sel);
          if (el && el.tagName !== 'BUTTON' && el.tagName !== 'A') {
            chatContainer = el;
            break;
          }
        }

        // Ultimate fallback - search entire document
        if (!chatContainer) {
          chatContainer = document.body;
        }

        console.log('[ChatBridge] Scanning container:', chatContainer.tagName, (chatContainer.className || '').substring(0, 50));

        // Get all images from the chat area AND the entire document
        let allImgs = Array.from(chatContainer.querySelectorAll('img'));

        // If still no images, search entire document
        if (allImgs.length === 0) {
          console.log('[ChatBridge] No images in container, searching entire document...');
          allImgs = Array.from(document.querySelectorAll('img'));
        }

        console.log('[ChatBridge] Page-wide: Found', allImgs.length, 'total img tags');

        for (const img of allImgs) {
          const src = img.src || img.dataset.src || img.getAttribute('data-src') || img.currentSrc;

          // Filter out icons, avatars, logos, and small images
          if (!src || src.length < 20) continue;
          if (src.includes('icon') || src.includes('avatar') || src.includes('emoji') || src.includes('logo') || src.includes('favicon')) continue;

          // Check image size (skip tiny images)
          try {
            const rect = img.getBoundingClientRect();
            if (rect.width < 40 || rect.height < 40) {
              console.log('[ChatBridge] Skipping small image:', rect.width, 'x', rect.height);
              continue;
            }
          } catch (e) { }

          const hash = await hashImageSrc(src);
          if (seenHashes.has(hash)) continue;
          seenHashes.add(hash);

          console.log('[ChatBridge] Page-wide: Adding image:', src.substring(0, 100));

          images.push({
            id: hash,
            src: src,
            role: 'unknown',
            timestamp: Date.now(),
            messageIndex: -1,
            originatingModel: detectCurrentPlatform()
          });
        }

        // Also check for background images in chat container
        const elementsWithBg = chatContainer.querySelectorAll('[style*="background"], [class*="image"], [class*="img"]');
        for (const elem of elementsWithBg) {
          try {
            const style = window.getComputedStyle(elem);
            const bgImage = style.backgroundImage;
            if (bgImage && bgImage !== 'none' && bgImage.startsWith('url(')) {
              const match = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
              if (match && match[1] && match[1].length > 20) {
                const src = match[1];
                if (src.includes('icon') || src.includes('avatar')) continue;

                const hash = await hashImageSrc(src);
                if (seenHashes.has(hash)) continue;
                seenHashes.add(hash);

                console.log('[ChatBridge] Page-wide: Adding background image:', src.substring(0, 100));

                images.push({
                  id: hash,
                  src: src,
                  role: 'unknown',
                  timestamp: Date.now(),
                  messageIndex: -1,
                  originatingModel: detectCurrentPlatform()
                });
              }
            }
          } catch (e) { }
        }
      }

      console.log('[ChatBridge] Image extraction complete. Found', images.length, 'unique images');
      return images;
    }

    // Save images to IndexedDB
    async function saveImagesToVault(images) {
      console.log('[ChatBridge] Saving', images.length, 'images to vault...');
      try {
        const db = await initImageVaultDB();
        const tx = db.transaction([IMAGE_VAULT_STORE_NAME], 'readwrite');
        const store = tx.objectStore(IMAGE_VAULT_STORE_NAME);
        let savedCount = 0;

        for (const img of images) {
          try {
            await new Promise((resolve, reject) => {
              const request = store.put(img);
              request.onsuccess = () => {
                savedCount++;
                resolve();
              };
              request.onerror = () => reject(request.error);
            });
          } catch (e) {
            console.warn('[ChatBridge] Failed to save image:', e.message || e);
          }
        }

        console.log('[ChatBridge] Successfully saved', savedCount, 'of', images.length, 'images to vault');
        return true;
      } catch (e) {
        console.error('[ChatBridge] saveImagesToVault error:', e.message || e);
        return false;
      }
    }

    // Get all images from vault
    async function getImageVault() {
      try {
        const db = await initImageVaultDB();
        const tx = db.transaction([IMAGE_VAULT_STORE_NAME], 'readonly');
        const store = tx.objectStore(IMAGE_VAULT_STORE_NAME);

        return new Promise((resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
        });
      } catch (e) {
        debugLog('getImageVault error:', e);
        return [];
      }
    }

    // Clear image vault
    async function clearImageVault() {
      try {
        const db = await initImageVaultDB();
        const tx = db.transaction([IMAGE_VAULT_STORE_NAME], 'readwrite');
        const store = tx.objectStore(IMAGE_VAULT_STORE_NAME);

        return new Promise((resolve, reject) => {
          const request = store.clear();
          request.onsuccess = () => resolve(true);
          request.onerror = () => reject(request.error);
        });
      } catch (e) {
        debugLog('clearImageVault error:', e);
        return false;
      }
    }

    // Detect current platform
    function detectCurrentPlatform() {
      const hostname = window.location.hostname;
      if (hostname.includes('chatgpt')) return 'ChatGPT';
      if (hostname.includes('claude')) return 'Claude';
      if (hostname.includes('gemini') || hostname.includes('bard')) return 'Gemini';
      if (hostname.includes('copilot') || hostname.includes('bing')) return 'Copilot';
      if (hostname.includes('perplexity')) return 'Perplexity';
      if (hostname.includes('poe')) return 'Poe';
      if (hostname.includes('x.ai') || hostname.includes('grok')) return 'Grok';
      if (hostname.includes('deepseek')) return 'DeepSeek';
      if (hostname.includes('mistral')) return 'Mistral';
      if (hostname.includes('meta.ai')) return 'Meta AI';
      return 'Unknown';
    }

    // EXPOSE IMAGE FUNCTIONS GLOBALLY for use by scanChat and other modules
    try {
      window.ChatBridge = window.ChatBridge || {};
      window.ChatBridge.extractImagesFromMessages = extractImagesFromMessages;
      window.ChatBridge.saveImagesToVault = saveImagesToVault;
      window.ChatBridge.getImageVault = getImageVault;
      window.ChatBridge.clearImageVault = clearImageVault;
      window.ChatBridge.refreshImageVault = async function () {
        try {
          const fn = typeof refreshImageVault === 'function' ? refreshImageVault : null;
          if (fn) await fn();
        } catch (e) { console.warn('[ChatBridge] refreshImageVault error:', e); }
      };
      console.log('[ChatBridge] Image vault functions exposed globally');
    } catch (e) {
      console.warn('[ChatBridge] Failed to expose image functions:', e);
    }

    // Render Image Vault Widget
    // Smart Library Widget - Browse saved conversations with semantic search
    async function renderSmartLibraryWidget(container) {
      try {
        const librarySection = document.createElement('div');
        librarySection.style.cssText = 'margin:16px 12px;';

        // Header with toggle
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px;background:rgba(16,24,43,0.4);border:1px solid rgba(0,180,255,0.25);border-radius:8px 8px 0 0;cursor:pointer;';
        header.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:16px;">📚</span>
            <span style="font-weight:600;font-size:13px;color:var(--cb-white);">Smart Library</span>
            <span id="cb-library-count" style="font-size:11px;color:rgba(255,255,255,0.5);background:rgba(0,180,255,0.2);padding:2px 6px;border-radius:10px;">0</span>
          </div>
          <span id="cb-library-toggle" style="font-size:18px;transition:transform 0.2s;">▼</span>
        `;

        // Content area (collapsible)
        const content = document.createElement('div');
        content.id = 'cb-library-content';
        content.style.cssText = 'display:none;padding:12px;background:rgba(16,24,43,0.4);border:1px solid rgba(0,180,255,0.25);border-top:none;border-radius:0 0 8px 8px;';

        // Search bar
        const searchBar = document.createElement('div');
        searchBar.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;';
        searchBar.innerHTML = `
          <input type="text" id="cb-library-search" class="cb-input" placeholder="Search conversations semantically..." style="flex:1;font-size:12px;"/>
          <button id="cb-library-search-btn" class="cb-btn cb-btn-primary" style="font-size:11px;padding:8px;">🔍 Search</button>
        `;

        // Tag filter
        const tagFilter = document.createElement('div');
        tagFilter.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;';
        tagFilter.id = 'cb-library-tags';

        // Conversations list
        const convList = document.createElement('div');
        convList.id = 'cb-library-list';
        convList.style.cssText = 'display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto;margin-bottom:12px;';

        // Controls
        const controls = document.createElement('div');
        controls.style.cssText = 'display:flex;gap:8px;';
        controls.innerHTML = `
          <button id="cb-library-refresh" class="cb-btn cb-btn-primary" style="flex:1;font-size:11px;padding:8px;">🔄 Refresh</button>
          <button id="cb-library-index" class="cb-btn" style="font-size:11px;padding:8px;">⚡ Index All</button>
        `;

        content.appendChild(searchBar);
        content.appendChild(tagFilter);
        content.appendChild(convList);
        content.appendChild(controls);
        librarySection.appendChild(header);
        librarySection.appendChild(content);
        container.appendChild(librarySection);

        // Toggle handler
        let isExpanded = false;
        header.addEventListener('click', () => {
          isExpanded = !isExpanded;
          content.style.display = isExpanded ? 'block' : 'none';
          document.getElementById('cb-library-toggle').style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
          if (isExpanded) refreshLibrary();
        });

        // Search handler
        document.getElementById('cb-library-search-btn').addEventListener('click', async () => {
          const query = document.getElementById('cb-library-search').value.trim();
          if (!query) {
            refreshLibrary();
            return;
          }

          const btn = document.getElementById('cb-library-search-btn');
          addLoadingToButton(btn, 'Searching...');
          try {
            await searchLibrarySemanticly(query);
          } catch (e) {
            debugLog('Semantic search error:', e);
            toast('Search failed');
          } finally {
            removeLoadingFromButton(btn, '🔍 Search');
          }
        });

        // Enter key for search
        document.getElementById('cb-library-search').addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            document.getElementById('cb-library-search-btn').click();
          }
        });

        // Refresh handler
        document.getElementById('cb-library-refresh').addEventListener('click', () => {
          refreshLibrary();
        });

        // Index all handler
        document.getElementById('cb-library-index').addEventListener('click', async () => {
          const btn = document.getElementById('cb-library-index');
          addLoadingToButton(btn, 'Indexing...');
          try {
            const convs = await loadConversationsAsync();
            let indexed = 0;
            for (const conv of convs) {
              if (!conv.embedding) {
                const text = conv.messages?.map(m => m.text).join(' ') || conv.conversation?.map(m => m.text).join(' ') || '';
                if (text && typeof window.getEmbedding === 'function') {
                  const emb = await window.getEmbedding(text.slice(0, 5000));
                  if (emb && emb.length > 0) {
                    conv.embedding = emb;
                    indexed++;
                  }
                }
              }
            }
            await saveConversationsAsync(convs);
            toast(`Indexed ${indexed} conversations`);
            refreshLibrary();
          } catch (e) {
            debugLog('Index error:', e);
            toast('Indexing failed');
          } finally {
            removeLoadingFromButton(btn, '⚡ Index All');
          }
        });

        // Render library list
        async function refreshLibrary() {
          try {
            const convs = await loadConversationsAsync();
            const list = document.getElementById('cb-library-list');
            const countEl = document.getElementById('cb-library-count');
            const tagsEl = document.getElementById('cb-library-tags');

            if (!list) return;

            countEl.textContent = convs.length.toString();
            list.innerHTML = '';
            tagsEl.innerHTML = '';

            if (convs.length === 0) {
              list.innerHTML = `
                <div class="cb-empty-state">
                  <div class="cb-empty-state-icon">📚</div>
                  <div class="cb-empty-state-title">No Saved Conversations</div>
                  <div class="cb-empty-state-text">Scan and save conversations to build your personal library. They'll appear here with tags and semantic search.</div>
                </div>
              `;
              return;
            }

            // Collect all unique tags
            const allTags = new Set();
            convs.forEach(c => {
              if (c.topics) c.topics.forEach(t => allTags.add(t));
            });

            // Render tag filter chips
            if (allTags.size > 0) {
              Array.from(allTags).slice(0, 8).forEach(tag => {
                const chip = document.createElement('button');
                chip.className = 'cb-btn';
                chip.style.cssText = 'font-size:10px;padding:4px 8px;background:rgba(0,180,255,0.1);border:1px solid rgba(0,180,255,0.3);';
                chip.textContent = `#${tag}`;
                chip.addEventListener('click', () => {
                  document.getElementById('cb-library-search').value = tag;
                  document.getElementById('cb-library-search-btn').click();
                });
                tagsEl.appendChild(chip);
              });
            }

            // Sort by timestamp (newest first)
            const sorted = convs.sort((a, b) => (b.ts || 0) - (a.ts || 0));

            // Render conversation cards
            sorted.slice(0, 20).forEach((conv, idx) => {
              const card = document.createElement('div');
              card.style.cssText = 'padding:10px;background:rgba(0,180,255,0.05);border:1px solid rgba(0,180,255,0.2);border-radius:6px;cursor:pointer;transition:all 0.2s;';

              const msgCount = conv.messages?.length || conv.conversation?.length || 0;
              const platform = conv.platform || 'unknown';
              const timestamp = conv.ts ? new Date(conv.ts).toLocaleDateString() : 'Unknown';
              const topics = conv.topics ? conv.topics.slice(0, 3).map(t => `<span style="font-size:10px;background:rgba(0,180,255,0.2);padding:2px 6px;border-radius:10px;margin-right:4px;">#${t}</span>`).join('') : '';
              const preview = conv.messages?.[0]?.text?.slice(0, 80) || conv.conversation?.[0]?.text?.slice(0, 80) || 'No preview';
              const hasEmbedding = conv.embedding ? '⚡' : '';

              card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px;">
                  <div style="font-size:12px;font-weight:600;color:var(--cb-white);">${platform} ${hasEmbedding}</div>
                  <div style="font-size:10px;color:var(--cb-subtext);">${timestamp}</div>
                </div>
                <div style="font-size:11px;color:var(--cb-subtext);margin-bottom:6px;line-height:1.3;">${preview}...</div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <span style="font-size:10px;color:var(--cb-subtext);">${msgCount} messages</span>
                  ${topics}
                </div>
              `;

              card.addEventListener('mouseenter', () => {
                card.style.background = 'rgba(0,180,255,0.1)';
                card.style.borderColor = 'rgba(0,180,255,0.4)';
              });
              card.addEventListener('mouseleave', () => {
                card.style.background = 'rgba(0,180,255,0.05)';
                card.style.borderColor = 'rgba(0,180,255,0.2)';
              });

              card.addEventListener('click', () => {
                // Load conversation into history view
                try {
                  // Navigate to history view
                  showView('history');
                  toast('Viewing conversation history');
                } catch (e) {
                  debugLog('Load conversation error:', e);
                }
              });

              list.appendChild(card);
            });
          } catch (e) {
            debugLog('refreshLibrary error:', e);
          }
        }

        // Semantic search function
        async function searchLibrarySemanticly(query) {
          try {
            const convs = await loadConversationsAsync();
            const list = document.getElementById('cb-library-list');

            if (!window.getEmbedding) {
              toast('Semantic search not available');
              return;
            }

            // Get query embedding
            const queryEmb = await window.getEmbedding(query);
            if (!queryEmb || queryEmb.length === 0) {
              toast('Failed to process query');
              return;
            }

            // Calculate similarities
            const results = [];
            for (const conv of convs) {
              if (conv.embedding && conv.embedding.length > 0) {
                const sim = cosineSimilarity(queryEmb, conv.embedding);
                if (sim > 0.3) { // Threshold for relevance
                  results.push({ conv, similarity: sim });
                }
              }
            }

            // Sort by similarity
            results.sort((a, b) => b.similarity - a.similarity);

            // Render results
            list.innerHTML = '';
            if (results.length === 0) {
              list.innerHTML = `
                <div class="cb-empty-state">
                  <div class="cb-empty-state-icon">🔍</div>
                  <div class="cb-empty-state-title">No Results Found</div>
                  <div class="cb-empty-state-text">Try a different search query or index more conversations.</div>
                </div>
              `;
              return;
            }

            results.slice(0, 10).forEach(({ conv, similarity }) => {
              const card = document.createElement('div');
              card.style.cssText = 'padding:10px;background:rgba(0,180,255,0.05);border:1px solid rgba(0,180,255,0.2);border-radius:6px;cursor:pointer;transition:all 0.2s;';

              const msgCount = conv.messages?.length || conv.conversation?.length || 0;
              const platform = conv.platform || 'unknown';
              const timestamp = conv.ts ? new Date(conv.ts).toLocaleDateString() : 'Unknown';
              const topics = conv.topics ? conv.topics.slice(0, 3).map(t => `<span style="font-size:10px;background:rgba(0,180,255,0.2);padding:2px 6px;border-radius:10px;margin-right:4px;">#${t}</span>`).join('') : '';
              const preview = conv.messages?.[0]?.text?.slice(0, 80) || conv.conversation?.[0]?.text?.slice(0, 80) || 'No preview';
              const relevance = Math.round(similarity * 100);

              card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px;">
                  <div style="font-size:12px;font-weight:600;color:var(--cb-white);">${platform} <span style="font-size:10px;color:#34d399;">${relevance}% match</span></div>
                  <div style="font-size:10px;color:var(--cb-subtext);">${timestamp}</div>
                </div>
                <div style="font-size:11px;color:var(--cb-subtext);margin-bottom:6px;line-height:1.3;">${preview}...</div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <span style="font-size:10px;color:var(--cb-subtext);">${msgCount} messages</span>
                  ${topics}
                </div>
              `;

              card.addEventListener('mouseenter', () => {
                card.style.background = 'rgba(0,180,255,0.1)';
                card.style.borderColor = 'rgba(0,180,255,0.4)';
              });
              card.addEventListener('mouseleave', () => {
                card.style.background = 'rgba(0,180,255,0.05)';
                card.style.borderColor = 'rgba(0,180,255,0.2)';
              });

              card.addEventListener('click', () => {
                try {
                  const chatSelect = shadow.getElementById('cb-chat-select');
                  if (chatSelect) {
                    chatSelect.value = conv.id || '0';
                    chatSelect.dispatchEvent(new Event('change'));
                    toast(`Loaded conversation (${relevance}% match)`);
                  }
                } catch (e) {
                  debugLog('Load conversation error:', e);
                }
              });

              list.appendChild(card);
            });

            toast(`Found ${results.length} relevant conversation(s)`);
          } catch (e) {
            debugLog('searchLibrarySemanticly error:', e);
            toast('Search failed');
          }
        }

        // Cosine similarity helper
        function cosineSimilarity(a, b) {
          if (!a || !b || a.length !== b.length) return 0;
          let dotProduct = 0;
          let normA = 0;
          let normB = 0;
          for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
          }
          return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
        }

      } catch (e) {
        debugLog('renderSmartLibraryWidget error:', e);
      }
    }

    async function renderImageVaultWidget(container) {
      try {
        const vaultSection = document.createElement('div');
        vaultSection.style.cssText = 'margin:16px 12px;';

        // Header with toggle
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px;background:rgba(16,24,43,0.4);border:1px solid rgba(0,180,255,0.25);border-radius:8px 8px 0 0;cursor:pointer;';
        header.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:16px;">🖼️</span>
            <span style="font-weight:600;font-size:13px;color:#fff;">Image Vault</span>
            <span id="cb-image-count" style="font-size:11px;color:rgba(255,255,255,0.5);background:rgba(0,180,255,0.2);padding:2px 6px;border-radius:10px;">0</span>
          </div>
          <span id="cb-vault-toggle" style="font-size:18px;transition:transform 0.2s;">▼</span>
        `;

        // Content area (collapsible)
        const content = document.createElement('div');
        content.id = 'cb-vault-content';
        content.style.cssText = 'display:none;padding:12px;background:rgba(16,24,43,0.4);border:1px solid rgba(0,180,255,0.25);border-top:none;border-radius:0 0 8px 8px;';

        // Thumbnail grid
        const thumbGrid = document.createElement('div');
        thumbGrid.id = 'cb-vault-grid';
        thumbGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;margin-bottom:12px;';

        // Controls
        const controls = document.createElement('div');
        controls.style.cssText = 'display:flex;gap:8px;';
        controls.innerHTML = `
          <button id="cb-vault-scan" class="cb-btn cb-btn-primary" style="flex:1;font-size:11px;padding:8px;">🔍 Scan Media</button>
          <button id="cb-vault-clear" class="cb-btn" style="font-size:11px;padding:8px;">🗑️ Clear</button>
        `;

        content.appendChild(thumbGrid);
        content.appendChild(controls);
        vaultSection.appendChild(header);
        vaultSection.appendChild(content);
        container.appendChild(vaultSection);

        // Toggle handler
        let isExpanded = false;
        header.addEventListener('click', () => {
          isExpanded = !isExpanded;
          content.style.display = isExpanded ? 'block' : 'none';
          document.getElementById('cb-vault-toggle').style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
        });

        // Scan images handler
        document.getElementById('cb-vault-scan').addEventListener('click', async () => {
          const btn = document.getElementById('cb-vault-scan');
          addLoadingToButton(btn, 'Scanning...');
          try {
            console.log('[ChatBridge] Image Vault: Starting scan...');
            const msgs = await scanChat();

            // Count user and agent messages
            const userMsgs = msgs ? msgs.filter(m => m.role === 'user').length : 0;
            const agentMsgs = msgs ? msgs.filter(m => m.role === 'assistant').length : 0;
            console.log('[ChatBridge] Image Vault: Found', userMsgs, 'user messages,', agentMsgs, 'agent replies');

            // Try message-based extraction first
            let images = [];
            if (msgs && msgs.length > 0) {
              images = await extractImagesFromMessages(msgs);
              console.log('[ChatBridge] Image Vault: Message extraction found', images.length, 'images');
            }

            // If no images found, use platform-specific page-wide extraction
            let files = [];
            let artifacts = [];
            if (images.length === 0) {
              console.log('[ChatBridge] Trying platform-specific extraction...');
              const media = await extractAllMediaFromPage();
              images = media.images || [];
              files = media.files || [];
              artifacts = media.artifacts || [];
              console.log('[ChatBridge] Platform extraction found:', images.length, 'images,', files.length, 'files,', artifacts.length, 'artifacts');
            }

            // Save images to vault
            if (images.length > 0) {
              await saveImagesToVault(images);
              await refreshImageVault();
            }

            // Update count display
            document.getElementById('cb-image-count').textContent = String(images.length);

            // Build result message
            let resultMsg = `${userMsgs} user, ${agentMsgs} agent`;
            if (images.length > 0 || files.length > 0 || artifacts.length > 0) {
              resultMsg += `: ${images.length} images`;
              if (files.length > 0) resultMsg += `, ${files.length} files`;
              if (artifacts.length > 0) resultMsg += `, ${artifacts.length} artifacts`;
              resultMsg = 'Saved ' + resultMsg;
            } else {
              resultMsg = 'Scanned ' + resultMsg + '. No media found.';
            }

            toast(resultMsg);
            console.log('[ChatBridge] Image Vault scan complete');
          } catch (e) {
            console.error('[ChatBridge] Image Vault scan error:', e);
            toast('Image scan failed - check console for details');
          } finally {
            removeLoadingFromButton(btn, '🔍 Scan Media');
          }
        });

        // Clear vault handler
        document.getElementById('cb-vault-clear').addEventListener('click', async () => {
          if (confirm('Clear all stored images?')) {
            await clearImageVault();
            await refreshImageVault();
            toast('Image vault cleared');
          }
        });

        // Initial load
        await refreshImageVault();

      } catch (e) {
        debugLog('renderImageVaultWidget error:', e);
      }
    }

    // Refresh image vault display
    async function refreshImageVault() {
      try {
        const images = await getImageVault();
        const grid = document.getElementById('cb-vault-grid');
        const countEl = document.getElementById('cb-image-count');

        if (!grid) return;

        countEl.textContent = images.length.toString();
        grid.innerHTML = '';

        if (images.length === 0) {
          grid.innerHTML = `
            <div class="cb-empty-state" style="grid-column:1/-1;">
              <div class="cb-empty-state-icon">🖼️</div>
              <div class="cb-empty-state-title">No Images Yet</div>
              <div class="cb-empty-state-text">Images from your conversations will appear here. Click "Scan Images" to extract images from the current chat.</div>
            </div>
          `;
          return;
        }

        // Group by role
        const userImages = images.filter(img => img.role === 'user');
        const assistantImages = images.filter(img => img.role === 'assistant');

        const renderGroup = (imgs, label, icon) => {
          if (imgs.length === 0) return;

          const groupLabel = document.createElement('div');
          groupLabel.style.cssText = 'grid-column:1/-1;font-size:11px;font-weight:600;color:rgba(255,255,255,0.6);margin-top:8px;display:flex;align-items:center;gap:6px;';
          groupLabel.innerHTML = `<span>${icon}</span><span>${label} (${imgs.length})</span>`;
          grid.appendChild(groupLabel);

          imgs.slice(0, 6).forEach((img, idx) => {
            const thumb = document.createElement('div');
            thumb.style.cssText = 'position:relative;aspect-ratio:1;border-radius:6px;overflow:hidden;border:1px solid rgba(0,180,255,0.2);cursor:pointer;background:rgba(0,0,0,0.3);';

            const imgEl = document.createElement('img');
            imgEl.src = img.src;
            imgEl.style.cssText = 'width:100%;height:100%;object-fit:cover;';
            imgEl.loading = 'lazy';
            imgEl.onerror = () => {
              thumb.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:24px;">🖼️</div>';
            };

            // Hover overlay
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:none;align-items:center;justify-content:center;gap:8px;';
            overlay.innerHTML = `
              <button class="cb-img-copy" title="Copy" style="background:rgba(255,255,255,0.2);border:none;border-radius:4px;padding:4px 6px;cursor:pointer;font-size:14px;">📋</button>
              <button class="cb-img-expand" title="Expand" style="background:rgba(255,255,255,0.2);border:none;border-radius:4px;padding:4px 6px;cursor:pointer;font-size:14px;">🔍</button>
            `;

            thumb.appendChild(imgEl);
            thumb.appendChild(overlay);

            thumb.addEventListener('mouseenter', () => overlay.style.display = 'flex');
            thumb.addEventListener('mouseleave', () => overlay.style.display = 'none');

            // Copy handler
            overlay.querySelector('.cb-img-copy').addEventListener('click', async (e) => {
              e.stopPropagation();
              try {
                await navigator.clipboard.writeText(img.src);
                toast('Image URL copied');
              } catch (err) {
                toast('Copy failed');
              }
            });

            // Expand handler
            overlay.querySelector('.cb-img-expand').addEventListener('click', (e) => {
              e.stopPropagation();
              showImageModal(img);
            });

            grid.appendChild(thumb);
          });

          // Show "View All" if more than 6 images
          if (imgs.length > 6) {
            const viewAll = document.createElement('button');
            viewAll.className = 'cb-btn';
            viewAll.style.cssText = 'grid-column:1/-1;margin-top:8px;font-size:11px;';
            viewAll.textContent = `View all ${imgs.length} images`;
            viewAll.addEventListener('click', () => showAllImagesModal(imgs, label));
            grid.appendChild(viewAll);
          }
        };

        renderGroup(userImages, 'User Uploads', '👤');
        renderGroup(assistantImages, 'AI Generated', '🤖');

      } catch (e) {
        debugLog('refreshImageVault error:', e);
      }
    }

    // Show image in modal
    function showImageModal(imgData) {
      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;z-index:999999;';

      const img = document.createElement('img');
      img.src = imgData.src;
      img.style.cssText = 'max-width:90%;max-height:90%;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,0.5);';

      const closeBtn = document.createElement('button');
      closeBtn.textContent = '×';
      closeBtn.style.cssText = 'position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.2);border:none;color:#fff;font-size:32px;width:50px;height:50px;border-radius:25px;cursor:pointer;';
      closeBtn.addEventListener('click', () => modal.remove());

      modal.appendChild(img);
      modal.appendChild(closeBtn);
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

      document.body.appendChild(modal);
    }

    // Show all images modal
    function showAllImagesModal(images, title) {
      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:999999;padding:40px;';

      const header = document.createElement('div');
      header.style.cssText = 'color:#fff;font-size:24px;font-weight:700;margin-bottom:20px;';
      header.textContent = title;

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px;max-width:1200px;max-height:70%;overflow-y:auto;padding:20px;background:rgba(16,24,43,0.8);border-radius:12px;';

      images.forEach(imgData => {
        const thumb = document.createElement('img');
        thumb.src = imgData.src;
        thumb.style.cssText = 'width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;cursor:pointer;border:2px solid rgba(0,180,255,0.3);';
        thumb.loading = 'lazy';
        thumb.addEventListener('click', () => {
          modal.remove();
          showImageModal(imgData);
        });
        grid.appendChild(thumb);
      });

      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'Close';
      closeBtn.className = 'cb-btn cb-btn-primary';
      closeBtn.style.cssText = 'margin-top:20px;padding:12px 24px;';
      closeBtn.addEventListener('click', () => modal.remove());

      modal.appendChild(header);
      modal.appendChild(grid);
      modal.appendChild(closeBtn);
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

      document.body.appendChild(modal);
    }

    // ============================================
    // TRENDING THEMES WIDGET - Shows theme evolution over time using RAG
    // ============================================
    async function renderTrendingThemesWidget(container) {
      try {
        const themesSection = document.createElement('div');
        themesSection.style.cssText = 'margin:16px 12px;';

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px;background:rgba(16,24,43,0.4);border:1px solid rgba(0,180,255,0.25);border-radius:8px 8px 0 0;cursor:pointer;';
        header.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:16px;">📊</span>
            <span style="font-weight:600;font-size:13px;color:#fff;">Trending Themes</span>
            <span style="font-size:10px;color:rgba(255,255,255,0.4);">Conversation patterns over time</span>
          </div>
          <span id="cb-themes-toggle" style="font-size:18px;transition:transform 0.2s;">▼</span>
        `;

        // Content area
        const content = document.createElement('div');
        content.id = 'cb-themes-content';
        content.style.cssText = 'display:none;padding:12px;background:rgba(16,24,43,0.4);border:1px solid rgba(0,180,255,0.25);border-top:none;border-radius:0 0 8px 8px;';

        // Theme list
        const themeList = document.createElement('div');
        themeList.id = 'cb-themes-list';
        themeList.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin-bottom:12px;';

        // Time range selector
        const controls = document.createElement('div');
        controls.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;';
        controls.innerHTML = `
          <button class="cb-themes-range cb-btn cb-btn-primary" data-range="day" style="flex:1;font-size:11px;padding:6px;">Today</button>
          <button class="cb-themes-range cb-btn" data-range="week" style="flex:1;font-size:11px;padding:6px;">Week</button>
          <button class="cb-themes-range cb-btn" data-range="month" style="flex:1;font-size:11px;padding:6px;">Month</button>
          <button class="cb-themes-range cb-btn" data-range="all" style="flex:1;font-size:11px;padding:6px;">All Time</button>
        `;

        content.appendChild(controls);
        content.appendChild(themeList);
        themesSection.appendChild(header);
        themesSection.appendChild(content);
        container.appendChild(themesSection);

        // Toggle handler
        let isExpanded = false;
        header.addEventListener('click', () => {
          isExpanded = !isExpanded;
          content.style.display = isExpanded ? 'block' : 'none';
          document.getElementById('cb-themes-toggle').style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
          if (isExpanded && themeList.children.length === 0) {
            refreshThemes('day');
          }
        });

        // Range button handlers
        controls.querySelectorAll('.cb-themes-range').forEach(btn => {
          btn.addEventListener('click', () => {
            controls.querySelectorAll('.cb-themes-range').forEach(b => {
              b.classList.remove('cb-btn-primary');
              b.classList.add('cb-btn');
            });
            btn.classList.add('cb-btn-primary');
            btn.classList.remove('cb-btn');
            refreshThemes(btn.dataset.range);
          });
        });

        // Refresh themes display
        async function refreshThemes(range) {
          try {
            themeList.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.5);">Loading themes...</div>';

            if (typeof window.RAGEngine === 'undefined' || typeof window.RAGEngine.getThemeEvolution !== 'function') {
              themeList.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.5);">RAG Engine not available</div>';
              return;
            }

            const evolution = await window.RAGEngine.getThemeEvolution({ bucket: range });

            if (!evolution || !evolution.themes || evolution.themes.length === 0) {
              themeList.innerHTML = '<div class="cb-empty-state">No themes found yet. Start conversations to see patterns emerge!</div>';
              return;
            }

            themeList.innerHTML = '';

            evolution.themes.slice(0, 8).forEach(theme => {
              const themeCard = document.createElement('div');
              themeCard.style.cssText = 'padding:10px;background:rgba(10,15,28,0.5);border:1px solid rgba(0,180,255,0.2);border-radius:6px;';

              const themeHeader = document.createElement('div');
              themeHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';

              const themeName = document.createElement('div');
              themeName.style.cssText = 'font-weight:600;font-size:12px;color:#fff;';
              themeName.textContent = theme.name;

              const themeCount = document.createElement('div');
              themeCount.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.6);background:rgba(0,180,255,0.2);padding:2px 8px;border-radius:10px;';
              themeCount.textContent = `${theme.count} mentions`;

              themeHeader.appendChild(themeName);
              themeHeader.appendChild(themeCount);

              // Sparkline visualization
              const sparkline = document.createElement('div');
              sparkline.style.cssText = 'height:30px;display:flex;align-items:flex-end;gap:2px;margin-top:6px;';

              if (theme.sparkline && theme.sparkline.length > 0) {
                const max = Math.max(...theme.sparkline, 1);
                theme.sparkline.forEach(val => {
                  const bar = document.createElement('div');
                  const height = (val / max) * 100;
                  bar.style.cssText = `flex:1;background:rgba(0,180,255,0.6);border-radius:2px 2px 0 0;height:${height}%;min-height:2px;`;
                  sparkline.appendChild(bar);
                });
              }

              themeCard.appendChild(themeHeader);
              themeCard.appendChild(sparkline);
              themeList.appendChild(themeCard);
            });

          } catch (e) {
            debugLog('refreshThemes error:', e);
            themeList.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,99,71,0.8);">Failed to load themes</div>';
          }
        }

      } catch (e) {
        debugLog('renderTrendingThemesWidget error:', e);
      }
    }

    // ============================================
    // PROMPT DESIGNER - Context-aware next-step generator
    // ============================================

    // Extract conversation context
    function extractConversationContext(messages) {
      const context = {
        userGoal: '',
        progressMade: [],
        ambiguities: [],
        contradictions: [],
        missingRequirements: [],
        pendingTasks: []
      };

      // First user message often contains the goal
      const firstUser = messages.find(m => m.role === 'user');
      if (firstUser) {
        context.userGoal = firstUser.text.substring(0, 200);
      }

      // Recent messages show progress
      const recentMsgs = messages.slice(-5);
      context.progressMade = recentMsgs
        .filter(m => m.role === 'assistant')
        .map(m => m.text.substring(0, 100));

      // Look for questions and uncertainties
      messages.forEach(msg => {
        const text = msg.text;
        if (/\?|unsure|not sure|unclear|ambiguous|confusing/i.test(text)) {
          context.ambiguities.push(text.substring(0, 150));
        }
        if (/however|but|actually|wrong|incorrect|instead/i.test(text)) {
          context.contradictions.push(text.substring(0, 150));
        }
        if (/need to|should|must|required|missing|lacking/i.test(text)) {
          context.missingRequirements.push(text.substring(0, 150));
        }
        if (/todo|task|action|next step|to do/i.test(text)) {
          context.pendingTasks.push(text.substring(0, 150));
        }
      });

      return context;
    }

    // Generate smart prompts using Gemini
    async function generateSmartPrompts(messages) {
      try {
        const context = extractConversationContext(messages);

        // Build prompt for Gemini
        const conversationText = messages.map(m => `${m.role}: ${m.text}`).join('\n\n');
        const systemPrompt = `You are a thought partner helping a user continue their AI conversation productively.

Analyze this conversation and generate exactly 5 follow-up questions that will help the user move forward:

1. CLARIFICATION - Ask about something ambiguous or unclear
2. IMPROVEMENT - Suggest how to make something better or more robust
3. EXPANSION - Explore a related area or dig deeper into a topic
4. CRITICAL THINKING - Challenge an assumption or identify a potential issue
5. CREATIVE ALTERNATIVE - Propose a different approach or perspective

Rules:
- Each question must be grounded in the actual conversation content
- Be specific, not generic
- Keep questions concise (1-2 sentences max)
- Act like a thoughtful colleague, not a template
- No hallucinations - only reference what's actually discussed

Conversation:
${conversationText.substring(0, 4000)}

Respond with JSON only:
{
  "questions": [
    {"text": "...", "category": "clarification", "sourceIndexes": [0, 3]},
    {"text": "...", "category": "improvement", "sourceIndexes": [5]},
    {"text": "...", "category": "expansion", "sourceIndexes": [2, 7]},
    {"text": "...", "category": "critical", "sourceIndexes": [4]},
    {"text": "...", "category": "creative", "sourceIndexes": [1, 6]}
  ]
}`;

        const result = await callGeminiAsync({
          action: 'custom',
          prompt: systemPrompt,
          temperature: 0.7
        });

        if (result && result.ok && result.result) {
          try {
            // Try to parse JSON from result
            let jsonStr = result.result;
            // Extract JSON if wrapped in markdown
            const jsonMatch = jsonStr.match(/```json\s*([\s\S]+?)```/) || jsonStr.match(/```\s*([\s\S]+?)```/);
            if (jsonMatch) jsonStr = jsonMatch[1];

            const parsed = JSON.parse(jsonStr);
            if (parsed.questions && Array.isArray(parsed.questions)) {
              return parsed;
            }
          } catch (parseErr) {
            debugLog('Failed to parse prompt designer JSON:', parseErr);
          }
        }

        // Fallback to generic prompts
        return generateFallbackPrompts(context);

      } catch (e) {
        debugLog('generateSmartPrompts error:', e);
        return generateFallbackPrompts({});
      }
    }

    // Fallback prompts when Gemini fails
    function generateFallbackPrompts(context) {
      return {
        questions: [
          { text: "What edge cases or error scenarios should we consider?", category: "clarification", sourceIndexes: [] },
          { text: "How can we make this solution more maintainable or scalable?", category: "improvement", sourceIndexes: [] },
          { text: "What related aspects of this problem should we explore?", category: "expansion", sourceIndexes: [] },
          { text: "What assumptions are we making that might not hold true?", category: "critical", sourceIndexes: [] },
          { text: "Is there a completely different approach we should consider?", category: "creative", sourceIndexes: [] }
        ]
      };
    }

    // Render Prompt Designer Widget - Clean Modern UI
    async function renderPromptDesignerWidget(container) {
      try {
        container.innerHTML = '';
        container.style.cssText = 'padding: 0; margin: 0; display: flex; flex-direction: column; gap: 16px;';

        // Action bar at top
        const actionBar = document.createElement('div');
        actionBar.className = 'cb-view-controls';
        actionBar.style.cssText = 'display: grid; grid-template-columns: 1fr auto auto; gap: 8px; margin-bottom: 4px;';

        const btnGenerate = document.createElement('button');
        btnGenerate.id = 'cb-prompts-generate';
        btnGenerate.className = 'cb-btn cb-btn-primary';
        btnGenerate.style.cssText = 'background: linear-gradient(135deg, var(--cb-accent-primary), var(--cb-accent-secondary)); border: none; padding: 10px 16px; font-weight: 600; font-size: 13px; letter-spacing: 0.3px; box-shadow: 0 4px 12px rgba(96, 165, 250, 0.25); display: flex; align-items: center; justify-content: center; gap: 8px;';
        btnGenerate.innerHTML = '<span style="font-size: 16px;">✨</span> Generate Ideas';

        const btnRefresh = document.createElement('button');
        btnRefresh.id = 'cb-prompts-refresh';
        btnRefresh.className = 'cb-btn';
        btnRefresh.title = 'Refresh Context';
        btnRefresh.style.cssText = 'width: 40px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 16px; background: var(--cb-bg3); border: 1px solid var(--cb-border);';
        btnRefresh.innerHTML = '🔄';

        const btnHistory = document.createElement('button');
        btnHistory.id = 'cb-prompts-history';
        btnHistory.className = 'cb-btn';
        btnHistory.title = 'History';
        btnHistory.style.cssText = 'width: 40px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 16px; background: var(--cb-bg3); border: 1px solid var(--cb-border);';
        btnHistory.innerHTML = '📜';

        actionBar.appendChild(btnGenerate);
        actionBar.appendChild(btnRefresh);
        actionBar.appendChild(btnHistory);
        container.appendChild(actionBar);

        // Prompts container
        const promptsList = document.createElement('div');
        promptsList.id = 'cb-prompts-list';
        promptsList.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

        // Beautiful empty state
        promptsList.innerHTML = `
          <div style="text-align: center; padding: 40px 20px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed var(--cb-border);">
            <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.8; filter: drop-shadow(0 0 10px rgba(96,165,250,0.3));">🎯</div>
            <h3 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: var(--cb-white);">Ready to Generate</h3>
            <p style="margin:0 0 24px;font-size:14px;color:rgba(255,255,255,0.6);max-width:320px;margin-left:auto;margin-right:auto;line-height:1.6;">
              Click the button above to analyze your conversation and get AI-powered prompt suggestions.
            </p>
            <div style="display:inline-flex;align-items:center;gap:8px;padding:10px 16px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:8px;font-size:12px;color:rgba(59,130,246,1);">
              <span>💡</span>
              <span>Works best with 3+ messages</span>
            </div>
          </div>
        `;

        promptsContainer.appendChild(promptsList);
        wrapper.appendChild(actionBar);
        wrapper.appendChild(promptsContainer);
        container.appendChild(wrapper);

        // Add hover effects
        const generateBtn = shadow.getElementById('cb-prompts-generate');
        const refreshBtn = shadow.getElementById('cb-prompts-refresh');
        const historyBtn = shadow.getElementById('cb-prompts-history');

        if (generateBtn) {
          generateBtn.addEventListener('mouseenter', () => {
            generateBtn.style.transform = 'translateY(-1px)';
            generateBtn.style.boxShadow = '0 4px 16px rgba(59,130,246,0.4)';
          });
          generateBtn.addEventListener('mouseleave', () => {
            generateBtn.style.transform = 'translateY(0)';
            generateBtn.style.boxShadow = '0 2px 8px rgba(59,130,246,0.3)';
          });
        }

        [refreshBtn, historyBtn].forEach(btn => {
          if (btn) {
            btn.addEventListener('mouseenter', () => {
              btn.style.background = 'rgba(96,165,250,0.2)';
              btn.style.borderColor = 'rgba(96,165,250,0.5)';
            });
            btn.addEventListener('mouseleave', () => {
              btn.style.background = 'rgba(96,165,250,0.1)';
              btn.style.borderColor = 'rgba(96,165,250,0.3)';
            });
          }
        });

        // Generate prompts handler
        const generateHandler = async () => {
          const btn = shadow.getElementById('cb-prompts-generate') || shadow.getElementById('cb-prompts-refresh');
          if (!btn) return;

          const originalHTML = btn.innerHTML;
          btn.innerHTML = '<span style="display:inline-block;animation:spin 1s linear infinite;">⚙️</span> Generating...';
          btn.disabled = true;
          btn.style.opacity = '0.7';

          try {
            const msgs = await scanChat();
            if (!msgs || msgs.length === 0) {
              toast('⚠️ No messages to analyze');
              return;
            }

            const prompts = await generateSmartPrompts(msgs);
            savePromptVersion(prompts);
            renderPrompts(prompts, msgs);
            toast('✨ Prompts generated successfully');
          } catch (e) {
            debugLog('Generate prompts error:', e);
            toast('❌ Prompt generation failed');
          } finally {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
            btn.style.opacity = '1';
          }
        };

        if (shadow.getElementById('cb-prompts-generate')) {
          shadow.getElementById('cb-prompts-generate').addEventListener('click', generateHandler);
        }
        if (shadow.getElementById('cb-prompts-refresh')) {
          shadow.getElementById('cb-prompts-refresh').addEventListener('click', generateHandler);
        }

        // History button handler
        if (shadow.getElementById('cb-prompts-history')) {
          shadow.getElementById('cb-prompts-history').addEventListener('click', () => {
            showPromptHistory();
          });
        }

        // Save prompt version to history
        function savePromptVersion(promptData) {
          try {
            const history = JSON.parse(localStorage.getItem('chatbridge:prompt_history') || '[]');
            history.unshift({
              timestamp: Date.now(),
              prompts: promptData,
              url: window.location.href
            });
            // Keep last 20 versions
            if (history.length > 20) history.splice(20);
            localStorage.setItem('chatbridge:prompt_history', JSON.stringify(history));
          } catch (e) {
            debugLog('savePromptVersion error:', e);
          }
        }

        // Show prompt history modal
        function showPromptHistory() {
          try {
            const history = JSON.parse(localStorage.getItem('chatbridge:prompt_history') || '[]');

            if (history.length === 0) {
              toast('No prompt history yet');
              return;
            }

            const modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;';
            modal.innerHTML = `
              <div style="background:var(--cb-bg);padding:24px;border-radius:12px;max-width:600px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.4);border:1px solid var(--cb-border);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                  <h3 style="margin:0;color:var(--cb-white);font-size:16px;">📜 Prompt History</h3>
                  <button id="cb-history-close" class="cb-btn" style="padding:4px 8px;font-size:12px;">✕ Close</button>
                </div>
                <div id="cb-history-list" style="display:flex;flex-direction:column;gap:12px;"></div>
              </div>
            `;

            document.body.appendChild(modal);

            const historyList = modal.querySelector('#cb-history-list');
            history.forEach((version, idx) => {
              const versionCard = document.createElement('div');
              versionCard.style.cssText = 'padding:12px;background:rgba(0,180,255,0.05);border:1px solid rgba(0,180,255,0.2);border-radius:8px;cursor:pointer;transition:all 0.2s;';

              const timestamp = new Date(version.timestamp).toLocaleString();
              const promptCount = version.prompts?.questions?.length || 0;

              versionCard.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                  <div style="font-size:12px;font-weight:600;color:var(--cb-white);">Version ${history.length - idx}</div>
                  <div style="font-size:11px;color:var(--cb-subtext);">${timestamp}</div>
                </div>
                <div style="font-size:11px;color:var(--cb-subtext);margin-bottom:8px;">${promptCount} prompts generated</div>
                <button class="cb-btn cb-btn-primary" style="width:100%;font-size:11px;padding:6px;">🔄 Restore This Version</button>
              `;

              versionCard.addEventListener('mouseenter', () => {
                versionCard.style.background = 'rgba(0,180,255,0.1)';
              });
              versionCard.addEventListener('mouseleave', () => {
                versionCard.style.background = 'rgba(0,180,255,0.05)';
              });

              versionCard.querySelector('button').addEventListener('click', () => {
                renderPrompts(version.prompts, []);
                modal.remove();
                toast(`Restored version ${history.length - idx}`);
              });

              historyList.appendChild(versionCard);
            });

            modal.querySelector('#cb-history-close').addEventListener('click', () => {
              modal.remove();
            });

            modal.addEventListener('click', (e) => {
              if (e.target === modal) modal.remove();
            });

          } catch (e) {
            debugLog('showPromptHistory error:', e);
            toast('Failed to load history');
          }
        }

        // Render prompts in list - Clean Modern Design
        function renderPrompts(promptData, messages) {
          const list = shadow.getElementById('cb-prompts-list');
          if (!list) return;

          list.innerHTML = '';

          if (!promptData || !promptData.questions || promptData.questions.length === 0) {
            list.innerHTML = `
              <div style="text-align:center;padding:40px 20px;">
                <div style="font-size:48px;margin-bottom:16px;opacity:0.5;">💭</div>
                <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.5);">No prompts generated yet</p>
              </div>
            `;
            return;
          }

          // Success header
          const header = document.createElement('div');
          header.style.cssText = 'margin-bottom:20px;padding:16px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:10px;display:flex;align-items:center;justify-content:space-between;';
          header.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;">
              <span style="font-size:24px;">✅</span>
              <div>
                <div style="font-size:15px;font-weight:700;color:#22c55e;">${promptData.questions.length} Prompts Generated</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:2px;">Ready to use or copy</div>
              </div>
            </div>
            <div style="font-size:11px;color:rgba(255,255,255,0.4);">${new Date().toLocaleTimeString()}</div>
          `;
          list.appendChild(header);

          const categoryIcons = {
            clarification: '❓',
            improvement: '⚡',
            expansion: '🔭',
            critical: '🧠',
            creative: '💡'
          };

          const categoryColors = {
            clarification: '#3b82f6',
            improvement: '#22c55e',
            expansion: '#a855f7',
            critical: '#f59e0b',
            creative: '#ec4899'
          };

          const categoryBg = {
            clarification: 'rgba(59,130,246,0.1)',
            improvement: 'rgba(34,197,94,0.1)',
            expansion: 'rgba(168,85,247,0.1)',
            critical: 'rgba(245,158,11,0.1)',
            creative: 'rgba(236,72,153,0.1)'
          };

          promptData.questions.forEach((q, idx) => {
            const promptCard = document.createElement('div');
            const color = categoryColors[q.category] || '#3b82f6';
            const bg = categoryBg[q.category] || 'rgba(59,130,246,0.1)';

            promptCard.style.cssText = `
              padding:18px;
              background:${bg};
              border:1px solid ${color}33;
              border-left:4px solid ${color};
              border-radius:10px;
              transition:all 0.2s ease;
              cursor:pointer;
            `;

            const icon = categoryIcons[q.category] || '💬';
            const categoryLabel = q.category.charAt(0).toUpperCase() + q.category.slice(1);

            promptCard.innerHTML = `
              <div style="display:flex;flex-direction:column;gap:14px;">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                  <span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:${color};font-weight:700;padding:6px 12px;background:${color}22;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;">
                    <span style="font-size:14px;">${icon}</span>
                    ${categoryLabel}
                  </span>
                  <span style="font-size:11px;color:rgba(255,255,255,0.3);font-weight:600;">#${idx + 1}</span>
                </div>
                <div style="font-size:14px;line-height:1.7;color:#fff;font-weight:400;">${escapeHtmlSimple(q.text)}</div>
                <div style="display:flex;gap:8px;">
                  <button class="cb-prompt-copy" style="flex:1;padding:10px;font-size:13px;font-weight:600;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;cursor:pointer;transition:all 0.2s;">
                    📋 Copy
                  </button>
                  <button class="cb-prompt-send" style="flex:1;padding:10px;font-size:13px;font-weight:600;background:linear-gradient(135deg,${color},${color}dd);border:none;border-radius:8px;color:#fff;cursor:pointer;transition:all 0.2s;box-shadow:0 2px 8px ${color}33;">
                    ➤ Use Now
                  </button>
                </div>
              </div>
            `;

            // Hover effects
            promptCard.addEventListener('mouseenter', () => {
              promptCard.style.background = `${bg.replace('0.1', '0.15')}`;
              promptCard.style.borderColor = `${color}66`;
              promptCard.style.transform = 'translateY(-2px)';
              promptCard.style.boxShadow = `0 8px 24px ${color}22`;
            });
            promptCard.addEventListener('mouseleave', () => {
              promptCard.style.background = bg;
              promptCard.style.borderColor = `${color}33`;
              promptCard.style.transform = 'translateY(0)';
              promptCard.style.boxShadow = 'none';
            });

            // Copy button hover
            const copyBtn = promptCard.querySelector('.cb-prompt-copy');
            copyBtn.addEventListener('mouseenter', () => {
              copyBtn.style.background = 'rgba(255,255,255,0.15)';
              copyBtn.style.transform = 'scale(1.02)';
            });
            copyBtn.addEventListener('mouseleave', () => {
              copyBtn.style.background = 'rgba(255,255,255,0.08)';
              copyBtn.style.transform = 'scale(1)';
            });

            // Send button hover
            const sendBtn = promptCard.querySelector('.cb-prompt-send');
            sendBtn.addEventListener('mouseenter', () => {
              sendBtn.style.transform = 'scale(1.02)';
              sendBtn.style.boxShadow = `0 4px 16px ${color}55`;
            });
            sendBtn.addEventListener('mouseleave', () => {
              sendBtn.style.transform = 'scale(1)';
              sendBtn.style.boxShadow = `0 2px 8px ${color}33`;
            });

            // Copy handler
            copyBtn.addEventListener('click', async (e) => {
              e.stopPropagation();
              try {
                await navigator.clipboard.writeText(q.text);
                toast('✓ Copied to clipboard');
                copyBtn.innerHTML = '✓ Copied!';
                setTimeout(() => { copyBtn.innerHTML = '📋 Copy'; }, 2000);
              } catch (err) {
                toast('❌ Copy failed');
              }
            });

            // Send to chat handler
            sendBtn.addEventListener('click', async (e) => {
              e.stopPropagation();
              try {
                const adapter = Object.values(window.SiteAdapters || {}).find(a => a.detect && a.detect());
                if (adapter && adapter.getInput) {
                  const input = adapter.getInput();
                  if (input) {
                    input.value = q.text;
                    input.textContent = q.text;
                    ['input', 'change', 'keydown'].forEach(evType => {
                      const ev = new Event(evType, { bubbles: true });
                      input.dispatchEvent(ev);
                    });
                    input.focus();
                    toast('✓ Inserted into chat');
                    sendBtn.innerHTML = '✓ Inserted!';
                    setTimeout(() => { sendBtn.innerHTML = '➤ Use Now'; }, 2000);
                  } else {
                    toast('⚠️ Chat input not found');
                  }
                } else {
                  toast('⚠️ Platform not supported');
                }
              } catch (err) {
                debugLog('Send prompt error:', err);
                toast('❌ Insert failed');
              }
            });

            list.appendChild(promptCard);
          });
        }

      } catch (e) {
        debugLog('renderPromptDesignerWidget error:', e);
      }
    }

    // Show fact-check modal with claims
    function showFactCheckModal(claims) {
      try {
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;';

        const confidenceColors = {
          high: '#34d399',
          medium: '#f59e0b',
          low: '#f87171'
        };

        const confidenceIcons = {
          high: '✅',
          medium: '⚠️',
          low: '❌'
        };

        modal.innerHTML = `
          <div style="background:var(--cb-bg);padding:24px;border-radius:12px;max-width:700px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.4);border:1px solid var(--cb-border);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
              <h3 style="margin:0;color:var(--cb-white);font-size:18px;">✓ Fact-Check Results</h3>
              <button id="cb-factcheck-close" class="cb-btn" style="padding:4px 8px;font-size:12px;">✕ Close</button>
            </div>
            <div style="margin-bottom:16px;padding:12px;background:rgba(0,180,255,0.1);border-radius:8px;font-size:12px;color:var(--cb-subtext);">
              Found ${claims.length} factual claim(s) in this conversation. Confidence levels indicate how verifiable each claim is.
            </div>
            <div id="cb-claims-list" style="display:flex;flex-direction:column;gap:12px;"></div>
          </div>
        `;

        document.body.appendChild(modal);

        const claimsList = modal.querySelector('#cb-claims-list');
        claims.forEach((claim, idx) => {
          const confidence = claim.confidence?.toLowerCase() || 'low';
          const color = confidenceColors[confidence] || '#f87171';
          const icon = confidenceIcons[confidence] || '❌';

          const claimCard = document.createElement('div');
          claimCard.style.cssText = `padding:14px;background:rgba(0,180,255,0.05);border-left:3px solid ${color};border-radius:8px;`;
          claimCard.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
              <div style="font-size:11px;font-weight:600;color:${color};display:flex;align-items:center;gap:6px;">
                <span>${icon}</span>
                <span>${confidence.toUpperCase()} CONFIDENCE</span>
              </div>
              <div style="font-size:10px;color:var(--cb-subtext);">
                ${claim.source || 'unknown'} • msg ${claim.messageIndex !== undefined ? claim.messageIndex + 1 : '?'}
              </div>
            </div>
            <div style="font-size:13px;line-height:1.5;color:var(--cb-white);">${escapeHtmlSimple(claim.text)}</div>
          `;
          claimsList.appendChild(claimCard);
        });

        modal.querySelector('#cb-factcheck-close').addEventListener('click', () => {
          modal.remove();
        });

        modal.addEventListener('click', (e) => {
          if (e.target === modal) modal.remove();
        });

      } catch (e) {
        debugLog('showFactCheckModal error:', e);
      }
    }

    // Helper: Simple HTML escape for prompts
    function escapeHtmlSimple(text) {
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // ============================================
    // DIAGRAM MAKER HELPERS
    // ============================================

    // Helper: Extract conversation structure for diagram generation
    function extractConversationStructure(messages) {
      if (!messages || messages.length === 0) return null;
      const structure = { nodes: [], edges: [], topics: new Set() };
      let nodeId = 0;

      messages.forEach((msg, idx) => {
        const role = msg.role === 'user' ? 'User' : 'AI';
        const snippet = msg.text.slice(0, 40).replace(/[\n\r]/g, ' ') + (msg.text.length > 40 ? '...' : '');
        structure.nodes.push({ id: `n${nodeId}`, label: `${role}: ${snippet}`, role: msg.role });
        if (idx > 0) {
          structure.edges.push({ from: `n${nodeId - 1}`, to: `n${nodeId}` });
        }
        // Extract topics from text
        const words = msg.text.toLowerCase().match(/\b\w{4,}\b/g) || [];
        words.slice(0, 3).forEach(w => structure.topics.add(w));
        nodeId++;
      });

      return structure;
    }

    // Helper: Generate Mermaid diagram code
    function generateDiagramMermaid(messages, type = 'flowchart') {
      const structure = extractConversationStructure(messages);
      if (!structure) return null;

      if (type === 'flowchart') {
        let mermaid = 'graph TD\n';
        structure.nodes.forEach(node => {
          const shape = node.role === 'user' ? `[${node.label}]` : `(${node.label})`;
          mermaid += `  ${node.id}${shape}\n`;
        });
        structure.edges.forEach(edge => {
          mermaid += `  ${edge.from} --> ${edge.to}\n`;
        });
        return mermaid;
      } else if (type === 'mindmap') {
        let mermaid = 'mindmap\n  root((Conversation))\n';
        const topics = Array.from(structure.topics).slice(0, 5);
        topics.forEach(topic => {
          mermaid += `    ${topic}\n`;
        });
        return mermaid;
      } else if (type === 'sequence') {
        let mermaid = 'sequenceDiagram\n';
        structure.nodes.forEach((node, idx) => {
          const from = node.role === 'user' ? 'User' : 'AI';
          const to = node.role === 'user' ? 'AI' : 'User';
          mermaid += `  ${from}->>${to}: ${node.label}\n`;
        });
        return mermaid;
      }

      return null;
    }

    // Helper: Render diagram preview in modal
    function renderDiagramPreview(mermaidCode) {
      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;';

      const container = document.createElement('div');
      container.style.cssText = 'background:var(--cb-bg);padding:24px;border-radius:12px;max-width:800px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 8px 32px rgba(0,0,0,0.4);border:1px solid var(--cb-border);';

      container.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="margin:0;color:var(--cb-white);font-size:16px;">📊 Conversation Diagram</h3>
          <button id="cb-diagram-close" class="cb-btn" style="padding:4px 12px;">✕</button>
        </div>
        <div style="background:var(--cb-surface);padding:16px;border-radius:8px;margin-bottom:16px;font-family:monospace;font-size:12px;color:var(--cb-subtext);white-space:pre-wrap;max-height:300px;overflow:auto;">${mermaidCode}</div>
        <div style="display:flex;gap:8px;">
          <button id="cb-diagram-copy" class="cb-btn cb-btn-primary" style="flex:1;">📋 Copy Mermaid</button>
          <button id="cb-diagram-markdown" class="cb-btn" style="flex:1;">📝 Copy as Markdown</button>
        </div>
        <p style="margin:8px 0 0 0;color:var(--cb-subtext);font-size:11px;text-align:center;">💡 Paste into Mermaid Live Editor or GitHub markdown</p>
      `;

      modal.appendChild(container);
      document.body.appendChild(modal);

      container.querySelector('#cb-diagram-close').addEventListener('click', () => modal.remove());
      container.querySelector('#cb-diagram-copy').addEventListener('click', async () => {
        await navigator.clipboard.writeText(mermaidCode);
        toast('Mermaid code copied!');
      });
      container.querySelector('#cb-diagram-markdown').addEventListener('click', async () => {
        await navigator.clipboard.writeText(`\`\`\`mermaid\n${mermaidCode}\n\`\`\``);
        toast('Markdown code block copied!');
      });
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }

    // ============================================
    // CONVERSATION CLEANUP HELPERS
    // ============================================

    // Helper: Clean conversation messages
    function cleanConversation(messages) {
      if (!messages || messages.length === 0) return { cleaned: [], stats: {} };

      const cleaned = [];
      const seen = new Set();
      let duplicates = 0;
      let emptyRemoved = 0;

      messages.forEach((msg, idx) => {
        // Skip empty or meaningless messages
        const text = msg.text.trim();
        if (!text || text.length < 3) {
          emptyRemoved++;
          return;
        }

        // Check for duplicates
        const hash = `${msg.role}:${text.slice(0, 100)}`;
        if (seen.has(hash)) {
          duplicates++;
          return;
        }
        seen.add(hash);

        // Normalize text
        let cleanedText = text
          .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
          .replace(/  +/g, ' ') // Collapse multiple spaces
          .trim();

        // Fix broken markdown lists
        cleanedText = cleanedText.replace(/^([\*\-])([^ ])/gm, '$1 $2');

        // Fix code blocks
        cleanedText = cleanedText.replace(/```(\w+)\n/g, '```$1\n');

        cleaned.push({ ...msg, text: cleanedText });
      });

      const stats = {
        original: messages.length,
        cleaned: cleaned.length,
        duplicates,
        emptyRemoved,
        saved: messages.length - cleaned.length
      };

      return { cleaned, stats };
    }

    // Helper: Show before/after cleanup preview
    function renderCleanupPreview(original, cleaned, stats) {
      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;';

      const container = document.createElement('div');
      container.style.cssText = 'background:var(--cb-bg);padding:24px;border-radius:12px;max-width:900px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 8px 32px rgba(0,0,0,0.4);border:1px solid var(--cb-border);';

      const originalText = original.map(m => `${m.role}: ${m.text}`).join('\n\n');
      const cleanedText = cleaned.map(m => `${m.role}: ${m.text}`).join('\n\n');

      container.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="margin:0;color:var(--cb-white);font-size:16px;">🧹 Cleanup Results</h3>
          <button id="cb-cleanup-close" class="cb-btn" style="padding:4px 12px;">✕</button>
        </div>
        <div style="background:var(--cb-surface);padding:12px;border-radius:8px;margin-bottom:16px;">
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;text-align:center;">
            <div><div style="color:var(--cb-white);font-size:20px;font-weight:bold;">${stats.original}</div><div style="color:var(--cb-subtext);font-size:11px;">Original</div></div>
            <div><div style="color:var(--cb-white);font-size:20px;font-weight:bold;">${stats.cleaned}</div><div style="color:var(--cb-subtext);font-size:11px;">Cleaned</div></div>
            <div><div style="color:#ff6b6b;font-size:20px;font-weight:bold;">${stats.duplicates}</div><div style="color:var(--cb-subtext);font-size:11px;">Duplicates</div></div>
            <div><div style="color:#4ecdc4;font-size:20px;font-weight:bold;">${stats.saved}</div><div style="color:var(--cb-subtext);font-size:11px;">Removed</div></div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
          <div>
            <h4 style="margin:0 0 8px 0;color:var(--cb-subtext);font-size:12px;">Before (${stats.original} messages)</h4>
            <div style="background:var(--cb-surface);padding:12px;border-radius:8px;font-size:11px;color:var(--cb-subtext);white-space:pre-wrap;max-height:300px;overflow:auto;font-family:monospace;">${originalText.slice(0, 2000)}${originalText.length > 2000 ? '\n...(truncated)' : ''}</div>
          </div>
          <div>
            <h4 style="margin:0 0 8px 0;color:var(--cb-subtext);font-size:12px;">After (${stats.cleaned} messages)</h4>
            <div style="background:var(--cb-surface);padding:12px;border-radius:8px;font-size:11px;color:var(--cb-white);white-space:pre-wrap;max-height:300px;overflow:auto;font-family:monospace;">${cleanedText.slice(0, 2000)}${cleanedText.length > 2000 ? '\n...(truncated)' : ''}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="cb-cleanup-copy-text" class="cb-btn cb-btn-primary" style="flex:1;">📋 Copy Cleaned Text</button>
          <button id="cb-cleanup-copy-json" class="cb-btn" style="flex:1;">📦 Copy as JSON</button>
        </div>
      `;

      modal.appendChild(container);
      document.body.appendChild(modal);

      container.querySelector('#cb-cleanup-close').addEventListener('click', () => modal.remove());
      container.querySelector('#cb-cleanup-copy-text').addEventListener('click', async () => {
        await navigator.clipboard.writeText(cleanedText);
        toast('Cleaned conversation copied!');
      });
      container.querySelector('#cb-cleanup-copy-json').addEventListener('click', async () => {
        await navigator.clipboard.writeText(JSON.stringify(cleaned, null, 2));
        toast('JSON copied!');
      });
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }

    // ============================================
    // INSIGHTS HUB - ALL INLINE (NO MODALS)
    // ============================================
    async function renderInsightsHub() {
      try {
        if (!insightsContent) {
          debugLog('insightsContent not found!');
          toast('Error: UI element missing');
          return;
        }
        insightsContent.innerHTML = '';
        debugLog('Rendering Insights Hub (inline)...');

        // Stats section
        const convs = await loadConversationsAsync();
        const totalConvs = convs.length;
        const totalMsgs = convs.reduce((sum, c) => sum + (c.conversation?.length || c.messages?.length || 0), 0);
        const platforms = [...new Set(convs.map(c => c.platform || 'Unknown'))];

        const statsSection = document.createElement('div');
        statsSection.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:0 8px;margin-bottom:16px;';
        statsSection.innerHTML = `
          <div style="background:linear-gradient(135deg,rgba(0,180,255,0.1),rgba(140,30,255,0.1));border:1px solid rgba(0,180,255,0.2);border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:20px;font-weight:700;color:var(--cb-white);">${totalConvs}</div>
            <div style="font-size:9px;color:var(--cb-subtext);text-transform:uppercase;">Chats</div>
          </div>
          <div style="background:linear-gradient(135deg,rgba(0,180,255,0.1),rgba(140,30,255,0.1));border:1px solid rgba(0,180,255,0.2);border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:20px;font-weight:700;color:var(--cb-white);">${totalMsgs}</div>
            <div style="font-size:9px;color:var(--cb-subtext);text-transform:uppercase;">Messages</div>
          </div>
          <div style="background:linear-gradient(135deg,rgba(0,180,255,0.1),rgba(140,30,255,0.1));border:1px solid rgba(0,180,255,0.2);border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:20px;font-weight:700;color:var(--cb-white);">${platforms.length}</div>
            <div style="font-size:9px;color:var(--cb-subtext);text-transform:uppercase;">Platforms</div>
          </div>
          <div style="background:linear-gradient(135deg,rgba(0,180,255,0.1),rgba(140,30,255,0.1));border:1px solid rgba(0,180,255,0.2);border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:20px;font-weight:700;color:var(--cb-white);">${Math.round(totalMsgs / Math.max(1, totalConvs))}</div>
            <div style="font-size:9px;color:var(--cb-subtext);text-transform:uppercase;">Avg/Chat</div>
          </div>
        `;
        insightsContent.appendChild(statsSection);

        // Tools label with refresh button
        const toolsHeader = document.createElement('div');
        toolsHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:0 8px;margin-bottom:12px;';
        toolsHeader.innerHTML = `
          <div style="font-size:11px;font-weight:600;color:var(--cb-accent-primary);text-transform:uppercase;letter-spacing:0.5px;">Workspace Tools</div>
          <button id="cb-insights-refresh" style="background:rgba(0,180,255,0.1);border:1px solid rgba(0,180,255,0.3);border-radius:6px;padding:4px 10px;font-size:10px;color:var(--cb-white);cursor:pointer;">🔄 Refresh</button>
        `;
        insightsContent.appendChild(toolsHeader);

        // Refresh button handler - clears cache and re-renders
        const refreshBtn = toolsHeader.querySelector('#cb-insights-refresh');
        if (refreshBtn) {
          refreshBtn.addEventListener('click', async () => {
            try {
              refreshBtn.textContent = '⏳ Loading...';
              refreshBtn.disabled = true;
              // Clear cache to force fresh load
              __cbConvCache.data = [];
              __cbConvCache.ts = 0;
              await renderInsightsHub();
              toast('✓ Refreshed');
            } catch (e) {
              toast('Refresh failed');
              debugLog('Insights refresh error', e);
            }
          });
        }

        // Content area for inline tool results - less boxy with themed scrollbar
        const toolResultArea = document.createElement('div');
        toolResultArea.id = 'cb-insights-tool-result';
        toolResultArea.style.cssText = 'display:none;margin:8px;background:transparent;border-radius:10px;padding:12px;max-height:320px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(100,100,100,0.5) transparent;';
        insightsContent.appendChild(toolResultArea);

        // Helper to show inline result
        function showToolResult(html, title = '') {
          toolResultArea.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <span style="font-weight:600;font-size:13px;color:var(--cb-white);">${title}</span>
              <button id="cb-tool-result-close" style="background:none;border:none;color:var(--cb-subtext);cursor:pointer;font-size:16px;">✕</button>
            </div>
            <div id="cb-tool-result-content">${html}</div>
          `;
          toolResultArea.style.display = 'block';
          toolResultArea.querySelector('#cb-tool-result-close').addEventListener('click', () => {
            toolResultArea.style.display = 'none';
          });
        }

        // Tool cards grid
        const toolsGrid = document.createElement('div');
        toolsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:0 8px;';

        // Helper to create tool card
        function createToolCard(icon, title, desc) {
          const card = document.createElement('div');
          card.style.cssText = 'background:rgba(255,255,255,0.03);border:1px solid var(--cb-border);border-radius:8px;padding:12px;cursor:pointer;transition:all 0.2s;';
          card.innerHTML = `
            <div style="font-size:24px;margin-bottom:6px;">${icon}</div>
            <div style="font-size:12px;font-weight:600;color:var(--cb-white);margin-bottom:4px;">${title}</div>
            <div style="font-size:10px;color:var(--cb-subtext);line-height:1.4;">${desc}</div>
          `;
          card.addEventListener('mouseenter', () => { card.style.background = 'rgba(0,180,255,0.1)'; card.style.borderColor = 'rgba(0,180,255,0.4)'; });
          card.addEventListener('mouseleave', () => { card.style.background = 'rgba(255,255,255,0.03)'; card.style.borderColor = 'var(--cb-border)'; });
          return card;
        }

        // 1. Media Vault
        const mediaCard = createToolCard('🖼️', 'Media Vault', 'View images from conversation');
        mediaCard.addEventListener('click', async () => {
          const msgs = await scanChat();
          const allMedia = [];
          for (const msg of (msgs || [])) {
            if (msg.attachments && msg.attachments.length > 0) {
              allMedia.push(...msg.attachments.filter(a => a.type === 'image' || a.type === 'video'));
            }
          }

          if (allMedia.length === 0) {
            showToolResult('<div style="text-align:center;padding:20px;color:var(--cb-subtext);">No media found in this conversation.<br><br>Scan a chat with images first.</div>', '🖼️ Media Vault');
            return;
          }

          const imageGrid = allMedia.filter(m => m.type === 'image').map(img =>
            `<div style="border-radius:6px;overflow:hidden;background:var(--cb-bg);border:1px solid var(--cb-border);">
              <img src="${img.url}" alt="" style="width:100%;height:80px;object-fit:cover;cursor:pointer;" onclick="window.open('${img.url}', '_blank')">
              <div style="padding:4px;font-size:9px;color:var(--cb-subtext);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${img.name || 'image'}</div>
            </div>`
          ).join('');

          showToolResult(`
            <div style="margin-bottom:10px;font-size:12px;color:var(--cb-subtext);">${allMedia.length} media items found</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">${imageGrid}</div>
            <button id="cb-media-copy-urls" style="margin-top:12px;width:100%;padding:8px;background:rgba(0,180,255,0.2);border:1px solid rgba(0,180,255,0.4);border-radius:6px;color:var(--cb-white);cursor:pointer;">📋 Copy All URLs</button>
          `, '🖼️ Media Vault');

          const copyBtn = toolResultArea.querySelector('#cb-media-copy-urls');
          if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
              const urls = allMedia.map(m => m.url).join('\n');
              await navigator.clipboard.writeText(urls);
              toast('URLs copied!');
            });
          }
        });
        toolsGrid.appendChild(mediaCard);

        // 2. Merge Chats
        const mergeCard = createToolCard('🔗', 'Merge Chats', 'Combine saved conversations');
        mergeCard.addEventListener('click', async () => {
          const saved = await loadConversationsAsync();
          if (!saved || saved.length === 0) {
            showToolResult('<div style="text-align:center;padding:20px;color:var(--cb-subtext);">No saved conversations to merge.<br><br>Scan and save some chats first.</div>', '🔗 Merge Chats');
            return;
          }

          const listHTML = saved.slice(0, 10).map((conv, idx) => {
            const count = conv.conversation?.length || conv.messages?.length || 0;
            const date = new Date(conv.ts || Date.now()).toLocaleDateString();
            const preview = (conv.conversation?.[0]?.text || conv.messages?.[0]?.text || '').substring(0, 30);
            return `<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.03);border-radius:8px;cursor:pointer;margin-bottom:6px;transition:all 0.15s;" onmouseenter="this.style.background='rgba(0,180,255,0.1)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)'">
              <input type="checkbox" class="merge-check" data-idx="${idx}" style="cursor:pointer;accent-color:#60a5fa;width:16px;height:16px;">
              <div style="flex:1;overflow:hidden;">
                <div style="font-size:12px;color:var(--cb-white);font-weight:500;">${conv.platform || 'Chat'} • ${count} msgs</div>
                <div style="font-size:10px;color:var(--cb-subtext);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${preview || date}</div>
              </div>
            </label>`;
          }).join('');

          showToolResult(`
            <div style="font-size:12px;color:var(--cb-subtext);margin-bottom:12px;">Select conversations to merge:</div>
            <div style="max-height:180px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(100,100,100,0.5) transparent;padding-right:4px;">${listHTML}</div>
            <div style="display:flex;gap:8px;margin-top:14px;">
              <button id="cb-merge-insert" style="flex:1;padding:10px;background:linear-gradient(135deg,rgba(96,165,250,0.2),rgba(167,139,250,0.2));border:1px solid rgba(96,165,250,0.4);border-radius:8px;color:var(--cb-white);cursor:pointer;font-size:11px;font-weight:500;">⬆️ Insert to Chat</button>
              <button id="cb-merge-copy" style="flex:1;padding:10px;background:rgba(255,255,255,0.05);border:1px solid var(--cb-border);border-radius:8px;color:var(--cb-white);cursor:pointer;font-size:11px;">📋 Copy</button>
            </div>
          `, '🔗 Merge Chats');

          // Helper to get merged text
          const getMergedText = () => {
            const checks = toolResultArea.querySelectorAll('.merge-check:checked');
            if (checks.length === 0) return null;

            const allMessages = [];
            checks.forEach(chk => {
              const idx = parseInt(chk.dataset.idx);
              const conv = saved[idx];
              const msgs = conv.conversation || conv.messages || [];
              allMessages.push(...msgs.map(m => ({ ...m, source: conv.platform })));
            });

            return allMessages.map(m => `${m.role}: ${m.text}`).join('\n\n');
          };

          // Insert to Chat handler
          const insertBtn = toolResultArea.querySelector('#cb-merge-insert');
          if (insertBtn) {
            insertBtn.addEventListener('click', async () => {
              const merged = getMergedText();
              if (!merged) { toast('Select at least one conversation'); return; }

              // Try to find the chat input
              const adapter = pickAdapter ? pickAdapter() : null;
              let input = adapter && adapter.getInput ? adapter.getInput() : null;

              if (!input) {
                input = document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
              }

              if (input) {
                if (input.isContentEditable || input.contentEditable === 'true') {
                  input.focus();
                  input.innerHTML = merged.replace(/\n/g, '<br>');
                  input.dispatchEvent(new InputEvent('input', { bubbles: true }));
                } else {
                  input.focus();
                  input.value = merged;
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                }
                toast('Merged content inserted!');
                toolResultArea.style.display = 'none';
              } else {
                // Fallback to clipboard
                await navigator.clipboard.writeText(merged);
                toast('No input found - copied to clipboard');
              }
            });
          }

          // Copy handler
          const copyBtn = toolResultArea.querySelector('#cb-merge-copy');
          if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
              const merged = getMergedText();
              if (!merged) { toast('Select at least one conversation'); return; }

              await navigator.clipboard.writeText(merged);
              toast('Merged content copied!');
            });
          }
        });
        toolsGrid.appendChild(mergeCard);

        // 3. Clean & Organize - Enhanced with storage deduplication
        const cleanCard = createToolCard('🧹', 'Clean & Organize', 'Remove duplicate saved chats');
        cleanCard.addEventListener('click', async () => {
          // First, analyze saved conversations for duplicates
          showToolResult('<div style="text-align:center;padding:20px;"><div class="cb-spinner"></div><div style="margin-top:8px;color:var(--cb-subtext);">Analyzing saved conversations...</div></div>', '🧹 Clean & Organize');

          try {
            const result = await deduplicateSavedConversations();
            const stats = result.stats;

            // No issues found
            if (stats.duplicates === 0 && stats.overlaps === 0) {
              showToolResult(`
                <div style="text-align:center;padding:20px;">
                  <div style="font-size:32px;margin-bottom:12px;">✅</div>
                  <div style="color:var(--cb-white);font-weight:600;margin-bottom:8px;">All Clean!</div>
                  <div style="color:var(--cb-subtext);font-size:11px;">No duplicate or overlapping conversations found in your ${stats.originalCount} saved chats.</div>
                </div>
              `, '🧹 Clean & Organize');
              return;
            }

            // Show confirmation with what will be cleaned
            const totalToRemove = stats.duplicates + stats.overlaps;

            showToolResult(`
              <div style="margin-bottom:16px;">
                <div style="font-size:12px;color:var(--cb-white);margin-bottom:12px;font-weight:500;">Found issues in saved conversations:</div>
                
                <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px;">
                  <div style="text-align:center;padding:12px;background:rgba(255,100,100,0.1);border:1px solid rgba(255,100,100,0.3);border-radius:8px;">
                    <div style="font-size:24px;font-weight:700;color:#ff6b6b;">${stats.duplicates}</div>
                    <div style="font-size:10px;color:var(--cb-subtext);">Exact Duplicates</div>
                    <div style="font-size:9px;color:var(--cb-subtext);opacity:0.7;margin-top:2px;">Same chat scanned twice</div>
                  </div>
                  <div style="text-align:center;padding:12px;background:rgba(255,180,100,0.1);border:1px solid rgba(255,180,100,0.3);border-radius:8px;">
                    <div style="font-size:24px;font-weight:700;color:#ffb347;">${stats.overlaps}</div>
                    <div style="font-size:10px;color:var(--cb-subtext);">Overlapping Chats</div>
                    <div style="font-size:9px;color:var(--cb-subtext);opacity:0.7;margin-top:2px;">10 msgs → 20 msgs</div>
                  </div>
                </div>
                
                <div style="padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:14px;">
                  <div style="font-size:11px;color:var(--cb-subtext);line-height:1.5;">
                    <strong style="color:var(--cb-white);">This will:</strong><br>
                    • Remove ${stats.duplicates} duplicate conversations<br>
                    • Merge ${stats.overlaps} overlapping chats (keeping the longer version)<br>
                    • Reduce from ${stats.originalCount} → ${stats.finalCount} saved chats
                  </div>
                </div>
                
                <div style="display:flex;gap:8px;">
                  <button id="cb-clean-cancel" style="flex:1;padding:10px;background:rgba(255,255,255,0.05);border:1px solid var(--cb-border);border-radius:8px;color:var(--cb-white);cursor:pointer;font-size:11px;">Cancel</button>
                  <button id="cb-clean-confirm" style="flex:1;padding:10px;background:linear-gradient(135deg,rgba(255,100,100,0.2),rgba(255,150,100,0.2));border:1px solid rgba(255,100,100,0.4);border-radius:8px;color:var(--cb-white);cursor:pointer;font-size:11px;font-weight:500;">🧹 Clean Storage</button>
                </div>
              </div>
            `, '🧹 Clean & Organize');

            // Cancel handler
            const cancelBtn = toolResultArea.querySelector('#cb-clean-cancel');
            if (cancelBtn) {
              cancelBtn.addEventListener('click', () => {
                toolResultArea.style.display = 'none';
              });
            }

            // Confirm handler
            const confirmBtn = toolResultArea.querySelector('#cb-clean-confirm');
            if (confirmBtn) {
              confirmBtn.addEventListener('click', async () => {
                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Cleaning...';

                try {
                  // Save the cleaned conversations
                  const success = await saveCleannedConversations(result.cleaned);

                  if (success) {
                    // Invalidate the conversation cache to force reload
                    try {
                      if (typeof __cbConvCache !== 'undefined') {
                        __cbConvCache.data = null;
                        __cbConvCache.ts = 0;
                      }
                    } catch (_) { }

                    showToolResult(`
                      <div style="text-align:center;padding:20px;">
                        <div style="font-size:32px;margin-bottom:12px;">🎉</div>
                        <div style="color:var(--cb-white);font-weight:600;margin-bottom:8px;">Storage Cleaned!</div>
                        <div style="color:var(--cb-subtext);font-size:11px;line-height:1.6;">
                          Removed ${stats.duplicates} duplicates<br>
                          Merged ${stats.overlaps} overlapping chats<br>
                          Now: ${stats.finalCount} saved conversations
                        </div>
                        <div style="margin-top:12px;font-size:10px;color:var(--cb-subtext);opacity:0.7;">
                          <span style="display:inline-block;animation:spin 1s linear infinite;">⚙️</span> Refreshing stats...
                        </div>
                      </div>
                    `, '🧹 Clean & Organize');

                    toast(`Cleaned! ${totalToRemove} conversations removed`);

                    // Auto-refresh the Insights Hub to update stats and history
                    setTimeout(async () => {
                      toolResultArea.style.display = 'none';

                      // Clear the conversation cache to force fresh load
                      try {
                        if (typeof __cbConvCache !== 'undefined') {
                          __cbConvCache.data = [];
                          __cbConvCache.ts = 0;
                        }
                      } catch (_) { }

                      // Re-render the insights hub to update stats
                      try {
                        if (typeof renderInsightsHub === 'function') {
                          await renderInsightsHub();
                        }
                      } catch (e) { console.log('renderInsightsHub error:', e); }

                      // Also refresh the history panel (use global exposure)
                      try {
                        if (typeof refreshHistory === 'function') {
                          await refreshHistory();
                        } else if (window.ChatBridge && typeof window.ChatBridge.refreshHistory === 'function') {
                          await window.ChatBridge.refreshHistory();
                        }
                      } catch (e) { console.log('refreshHistory error:', e); }

                      toast('Stats & history refreshed!');
                    }, 1500);
                  } else {
                    toast('Failed to save cleaned data');
                  }
                } catch (e) {
                  console.error('[ChatBridge] Clean failed:', e);
                  toast('Clean operation failed');
                }
              });
            }

          } catch (e) {
            console.error('[ChatBridge] Clean & Organize error:', e);
            showToolResult('<div style="text-align:center;padding:20px;color:var(--cb-subtext);">Failed to analyze conversations.</div>', '🧹 Clean & Organize');
          }
        });
        toolsGrid.appendChild(cleanCard);

        // 4. Export All
        const exportCard = createToolCard('📥', 'Export All', 'Download all saved chats');
        exportCard.addEventListener('click', async () => {
          const convs = await loadConversationsAsync();
          if (!convs || convs.length === 0) {
            toast('No conversations to export');
            return;
          }
          const data = JSON.stringify(convs, null, 2);
          const blob = new Blob([data], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `chatbridge-export-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(url);
          toast(`Exported ${convs.length} conversations`);
        });
        toolsGrid.appendChild(exportCard);

        // 5. Extract Content - REDESIGNED PREMIUM UI
        const extractCard = createToolCard('📋', 'Extract Content', 'URLs, numbers, code, lists');
        extractCard.addEventListener('click', async () => {
          // Get extracted content from last scan or extract now
          let extracted = window.ChatBridge?._extractedContent || window.ChatBridge?._lastScanData?.extracted;

          if (!extracted || Object.values(extracted).every(arr => !arr || arr.length === 0)) {
            // Need to scan first
            showToolResult('<div style="text-align:center;padding:20px;"><div class="cb-spinner"></div><div style="margin-top:8px;color:var(--cb-subtext);">Scanning conversation...</div></div>', '📋 Extract Content');
            const msgs = await scanChat();
            if (!msgs || msgs.length === 0) {
              showToolResult('<div style="text-align:center;padding:30px;color:var(--cb-subtext);"><div style="font-size:28px;margin-bottom:12px;">📭</div>No conversation found.<br><br><span style="font-size:10px;">Open a chat and try again.</span></div>', '📋 Extract Content');
              return;
            }
            extracted = window.ChatBridge?._extractedContent || {};
          }

          // Define all categories with colors
          const categoryConfig = {
            urls: { icon: '🔗', label: 'Links', color: '#60a5fa', gradient: 'linear-gradient(135deg, rgba(96,165,250,0.15), rgba(59,130,246,0.08))' },
            numbers: { icon: '🔢', label: 'Numbers', color: '#34d399', gradient: 'linear-gradient(135deg, rgba(52,211,153,0.15), rgba(16,185,129,0.08))' },
            lists: { icon: '📝', label: 'Lists', color: '#a78bfa', gradient: 'linear-gradient(135deg, rgba(167,139,250,0.15), rgba(139,92,246,0.08))' },
            codeBlocks: { icon: '💻', label: 'Code', color: '#f59e0b', gradient: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(217,119,6,0.08))' },
            commands: { icon: '⌨️', label: 'Commands', color: '#ec4899', gradient: 'linear-gradient(135deg, rgba(236,72,153,0.15), rgba(219,39,119,0.08))' },
            emails: { icon: '📧', label: 'Emails', color: '#06b6d4', gradient: 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(8,145,178,0.08))' },
            dates: { icon: '📅', label: 'Dates', color: '#f472b6', gradient: 'linear-gradient(135deg, rgba(244,114,182,0.15), rgba(236,72,153,0.08))' },
            tables: { icon: '📊', label: 'Tables', color: '#8b5cf6', gradient: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(124,58,237,0.08))' }
          };

          // Build categories with counts
          const categories = Object.keys(categoryConfig)
            .map(key => ({
              key,
              ...categoryConfig[key],
              count: extracted[key]?.length || 0
            }))
            .filter(c => c.count > 0);

          if (categories.length === 0) {
            showToolResult(`
              <div style="text-align:center;padding:20px;color:var(--cb-subtext);">
                <div style="font-size:24px;margin-bottom:8px;">🔍</div>
                <div style="font-weight:500;color:var(--cb-white);margin-bottom:4px;font-size:12px;">No Extractable Content</div>
                <div style="font-size:10px;opacity:0.7;">No links, numbers, code, or lists found.</div>
              </div>
            `, '📋 Extract Content');
            return;
          }

          // Calculate totals
          const totalItems = categories.reduce((sum, c) => sum + c.count, 0);

          // Build category pills with labels
          const categoryPillsHTML = categories.map((c, i) => `
            <div class="cb-extract-cat" data-key="${c.key}" style="display:flex;align-items:center;gap:5px;padding:6px 10px;background:${i === 0 ? c.gradient : 'rgba(255,255,255,0.03)'};border:1px solid ${i === 0 ? c.color + '40' : 'rgba(255,255,255,0.08)'};border-radius:8px;cursor:pointer;transition:all 0.15s;${i === 0 ? 'box-shadow:0 0 10px ' + c.color + '20;' : ''}">
              <span style="font-size:13px;">${c.icon}</span>
              <span style="font-size:10px;color:var(--cb-white);opacity:0.9;">${c.label}</span>
              <span style="font-size:10px;color:${c.color};font-weight:600;">${c.count}</span>
            </div>
          `).join('');

          showToolResult(`
            <div style="margin-bottom:12px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <span style="font-size:11px;color:var(--cb-subtext);">Found <span style="color:var(--cb-white);font-weight:600;">${totalItems}</span> items</span>
                <span id="cb-extract-copy-all" style="font-size:10px;color:#60a5fa;cursor:pointer;padding:4px 8px;background:rgba(96,165,250,0.1);border-radius:6px;">📋 Copy All</span>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;">${categoryPillsHTML}</div>
            </div>
            <div id="cb-extract-items" style="max-height:200px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(100,100,100,0.4) transparent;"></div>
          `, '📋 Extracted Content');

          const itemsContainer = toolResultArea.querySelector('#cb-extract-items');

          // Render items for a category - BEAUTIFUL VERSION
          const renderItems = (key) => {
            const items = extracted[key] || [];
            const config = categoryConfig[key];
            let html = '';

            items.forEach((item, idx) => {
              let content = '';
              let copyValue = '';
              let extraStyles = '';

              if (key === 'urls') {
                const domain = item.domain || new URL(item.value).hostname.replace('www.', '');
                content = `
                  <div style="display:flex;align-items:center;gap:8px;overflow:hidden;">
                    <span style="font-size:13px;">🔗</span>
                    <div style="flex:1;overflow:hidden;">
                      <div style="font-size:11px;color:${config.color};font-weight:500;">${domain}</div>
                      <div style="font-size:10px;color:var(--cb-subtext);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.value}</div>
                    </div>
                  </div>`;
                copyValue = item.value;
              } else if (key === 'numbers') {
                content = `
                  <div style="display:flex;align-items:center;gap:10px;overflow:hidden;">
                    <span style="font-size:15px;font-weight:700;color:${config.color};">${item.value}</span>
                    <span style="font-size:10px;color:var(--cb-subtext);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${(item.context || '').substring(0, 50)}</span>
                  </div>`;
                copyValue = item.value;
              } else if (key === 'lists') {
                const previewItems = item.items.slice(0, 3);
                content = `
                  <div>
                    <div style="font-size:10px;color:${config.color};font-weight:500;margin-bottom:5px;">📝 ${item.count} items</div>
                    <div style="padding-left:8px;border-left:2px solid ${config.color}40;">
                      ${previewItems.map((li, i) => `<div style="font-size:10px;color:var(--cb-subtext);margin-bottom:3px;line-height:1.3;">${li.substring(0, 55)}${li.length > 55 ? '...' : ''}</div>`).join('')}
                      ${item.items.length > 3 ? `<div style="font-size:9px;color:var(--cb-subtext);opacity:0.6;margin-top:2px;">+${item.items.length - 3} more...</div>` : ''}
                    </div>
                  </div>`;
                copyValue = item.items.map((li, i) => `${i + 1}. ${li}`).join('\n');
                extraStyles = 'white-space:normal;';
              } else if (key === 'codeBlocks') {
                const preview = (item.code || '').substring(0, 80).replace(/</g, '&lt;').replace(/>/g, '&gt;');
                content = `
                  <div>
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
                      <span style="background:${config.color}30;color:${config.color};font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600;">${item.language || 'code'}</span>
                      <span style="font-size:9px;color:var(--cb-subtext);">${(item.code || '').split('\n').length} lines</span>
                    </div>
                    <pre style="font-size:9px;color:var(--cb-subtext);background:rgba(0,0,0,0.25);padding:6px;border-radius:5px;margin:0;overflow:hidden;white-space:pre-wrap;max-height:50px;font-family:ui-monospace,monospace;">${preview}...</pre>
                  </div>`;
                copyValue = item.code;
                extraStyles = 'white-space:normal;';
              } else if (key === 'commands') {
                content = `
                  <div style="display:flex;align-items:center;gap:6px;">
                    <span style="font-size:12px;">⚡</span>
                    <code style="flex:1;background:rgba(0,0,0,0.3);padding:5px 8px;border-radius:5px;font-size:10px;color:${config.color};font-family:ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.value}</code>
                  </div>`;
                copyValue = item.value;
              } else if (key === 'emails') {
                content = `
                  <div style="display:flex;align-items:center;gap:6px;">
                    <span style="font-size:12px;">✉️</span>
                    <span style="color:${config.color};font-size:11px;">${item.value}</span>
                  </div>`;
                copyValue = item.value;
              } else if (key === 'dates') {
                content = `
                  <div style="display:flex;align-items:center;gap:6px;">
                    <span style="font-size:12px;">📅</span>
                    <span style="color:${config.color};font-size:11px;font-weight:500;">${item.value}</span>
                  </div>`;
                copyValue = item.value;
              } else if (key === 'tables') {
                content = `
                  <div>
                    <div style="font-size:10px;color:${config.color};font-weight:500;margin-bottom:4px;">📊 ${item.rows} rows</div>
                    <div style="font-size:9px;color:var(--cb-subtext);background:rgba(0,0,0,0.2);padding:6px;border-radius:4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${item.preview || 'Table data'}</div>
                  </div>`;
                copyValue = item.content || '';
              }

              html += `
                <div class="cb-extract-item" data-copy="${encodeURIComponent(copyValue)}" style="padding:10px 12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:8px;margin-bottom:8px;cursor:pointer;transition:all 0.15s;${extraStyles}" onmouseenter="this.style.background='rgba(255,255,255,0.05)';this.style.borderColor='${config.color}35'" onmouseleave="this.style.background='rgba(255,255,255,0.02)';this.style.borderColor='rgba(255,255,255,0.06)'">
                  ${content}
                </div>`;
            });

            itemsContainer.innerHTML = html || `
              <div style="text-align:center;padding:25px;color:var(--cb-subtext);">
                <div style="font-size:22px;margin-bottom:8px;opacity:0.5;">📭</div>
                <div style="font-size:11px;">No items in this category</div>
              </div>`;

            // Add click handlers
            itemsContainer.querySelectorAll('.cb-extract-item').forEach(el => {
              el.addEventListener('click', async () => {
                const val = decodeURIComponent(el.dataset.copy);
                await navigator.clipboard.writeText(val);
                el.style.background = 'rgba(52,211,153,0.15)';
                setTimeout(() => el.style.background = 'rgba(255,255,255,0.02)', 300);
                toast('Copied!');
              });
            });
          };

          // Category card click handlers
          toolResultArea.querySelectorAll('.cb-extract-cat').forEach(cat => {
            cat.addEventListener('click', () => {
              // Update active category styling
              toolResultArea.querySelectorAll('.cb-extract-cat').forEach(c => {
                c.style.transform = 'scale(1)';
                c.style.boxShadow = 'none';
              });
              const config = categoryConfig[cat.dataset.key];
              cat.style.transform = 'scale(1.02)';
              cat.style.boxShadow = `0 0 12px ${config.color}30`;

              // Render items
              renderItems(cat.dataset.key);
            });
          });

          // Copy all handler
          const copyAllBtn = toolResultArea.querySelector('#cb-extract-copy-all');
          if (copyAllBtn) {
            copyAllBtn.addEventListener('click', async () => {
              let allText = '';
              categories.forEach(c => {
                const items = extracted[c.key] || [];
                if (items.length > 0) {
                  allText += `\n\n## ${c.label}\n`;
                  items.forEach(item => {
                    if (c.key === 'urls') allText += `- ${item.value}\n`;
                    else if (c.key === 'lists') allText += item.items.map((li, i) => `${i + 1}. ${li}`).join('\n') + '\n';
                    else if (c.key === 'codeBlocks') allText += '```' + (item.language || '') + '\n' + item.code + '\n```\n';
                    else allText += `- ${item.value || item.context || ''}\n`;
                  });
                }
              });
              await navigator.clipboard.writeText(allText.trim());
              toast('All content copied!');
            });
          }

          // Render first category
          if (categories.length > 0) {
            renderItems(categories[0].key);
          }
        });
        toolsGrid.appendChild(extractCard);

        // 6. Continue With - ALL 10 PLATFORMS + AUTO-INSERT
        const continueCard = createToolCard('🔄', 'Continue With', 'Open chat in another AI');
        continueCard.addEventListener('click', async () => {
          const msgs = await scanChat();
          if (!msgs || msgs.length === 0) {
            toast('No conversation to continue');
            return;
          }

          // All 10 supported platforms with URLs and icons
          const platforms = [
            { id: 'chatgpt', name: 'ChatGPT', icon: '🤖', url: 'https://chatgpt.com/', color: '#10a37f' },
            { id: 'claude', name: 'Claude', icon: '🧠', url: 'https://claude.ai/', color: '#cc785c' },
            { id: 'gemini', name: 'Gemini', icon: '✨', url: 'https://gemini.google.com/', color: '#4285f4' },
            { id: 'copilot', name: 'Copilot', icon: '🔷', url: 'https://copilot.microsoft.com/', color: '#0078d4' },
            { id: 'perplexity', name: 'Perplexity', icon: '🔍', url: 'https://www.perplexity.ai/', color: '#1fb8cd' },
            { id: 'mistral', name: 'Mistral', icon: '🌀', url: 'https://chat.mistral.ai/', color: '#ff6b35' },
            { id: 'deepseek', name: 'DeepSeek', icon: '🌊', url: 'https://deepseek.ai/', color: '#0066cc' },
            { id: 'poe', name: 'Poe', icon: '💬', url: 'https://poe.com/', color: '#5a4fcf' },
            { id: 'grok', name: 'Grok', icon: '⚡', url: 'https://x.ai/', color: '#1da1f2' },
            { id: 'meta', name: 'Meta AI', icon: '🔵', url: 'https://meta.ai/', color: '#0668e1' }
          ];

          // Build platform grid
          const platformsHTML = platforms.map(p => `
            <button class="cb-continue-btn" data-id="${p.id}" data-url="${p.url}" style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:var(--cb-white);cursor:pointer;transition:all 0.15s;font-size:11px;" onmouseenter="this.style.background='${p.color}20';this.style.borderColor='${p.color}50'" onmouseleave="this.style.background='rgba(255,255,255,0.02)';this.style.borderColor='rgba(255,255,255,0.08)'">
              <span style="font-size:14px;">${p.icon}</span>
              <span>${p.name}</span>
            </button>
          `).join('');

          showToolResult(`
            <div style="margin-bottom:10px;">
              <div style="font-size:11px;color:var(--cb-subtext);margin-bottom:8px;">
                ${msgs.length} messages will be ${msgs.length > 20 ? '<span style="color:#f59e0b;">summarized</span>' : 'transferred'}
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;max-height:220px;overflow-y:auto;scrollbar-width:thin;">
              ${platformsHTML}
            </div>
            <div style="margin-top:10px;font-size:9px;color:var(--cb-subtext);text-align:center;">
              Context will be auto-inserted when you open the target AI
            </div>
          `, '🔄 Continue With');

          toolResultArea.querySelectorAll('.cb-continue-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
              const targetUrl = btn.dataset.url;
              const targetId = btn.dataset.id;

              btn.innerHTML = '<span style="font-size:11px;">⏳ Preparing...</span>';
              btn.disabled = true;

              try {
                let contextText = '';

                // If more than 20 messages, summarize
                if (msgs.length > 20) {
                  toast('Summarizing conversation...');

                  // Try to summarize using AI
                  try {
                    const fullConv = msgs.map(m => `${m.role}: ${m.text}`).join('\n\n');

                    // Use Gemini for summarization
                    const summaryResult = await new Promise((resolve) => {
                      chrome.runtime.sendMessage({
                        type: 'gemini_request',
                        payload: {
                          prompt: `Summarize this conversation into key points and context. Keep it under 1500 characters. Focus on the main topics discussed, any decisions made, and pending questions:\n\n${fullConv.substring(0, 8000)}`,
                          mode: 'summarize'
                        }
                      }, (response) => {
                        if (response && response.ok && response.text) {
                          resolve(response.text);
                        } else {
                          // Fallback: just take first and last few messages
                          const firstMsgs = msgs.slice(0, 5).map(m => `${m.role}: ${m.text}`).join('\n\n');
                          const lastMsgs = msgs.slice(-5).map(m => `${m.role}: ${m.text}`).join('\n\n');
                          resolve(`[Conversation Summary - ${msgs.length} messages]\n\n--- Start ---\n${firstMsgs}\n\n--- [${msgs.length - 10} messages omitted] ---\n\n--- Recent ---\n${lastMsgs}`);
                        }
                      });
                    });

                    contextText = `[Continued from a previous ${msgs.length}-message conversation]\n\n${summaryResult}\n\nPlease continue from where we left off.`;
                  } catch (e) {
                    // Fallback if summarization fails
                    const firstMsgs = msgs.slice(0, 5).map(m => `${m.role}: ${m.text}`).join('\n\n');
                    const lastMsgs = msgs.slice(-5).map(m => `${m.role}: ${m.text}`).join('\n\n');
                    contextText = `[Continued from ${msgs.length} messages]\n\n--- Start ---\n${firstMsgs}\n\n--- Recent ---\n${lastMsgs}\n\nPlease continue from where we left off.`;
                  }
                } else {
                  // Less than 20 messages - transfer full context
                  contextText = `[Continued from previous conversation - ${msgs.length} messages]\n\n${msgs.map(m => `${m.role}: ${m.text}`).join('\n\n')}\n\nPlease continue from where we left off.`;
                }

                // Store context for auto-insertion when target site loads
                try {
                  localStorage.setItem('chatbridge:continue_context', JSON.stringify({
                    text: contextText,
                    target: targetId,
                    timestamp: Date.now()
                  }));

                  // Also store in chrome.storage for cross-tab access
                  if (chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({
                      'chatbridge:continue_context': {
                        text: contextText,
                        target: targetId,
                        timestamp: Date.now()
                      }
                    });
                  }
                } catch (e) { }

                // Copy to clipboard as backup
                await navigator.clipboard.writeText(contextText);

                // Open target site
                window.open(targetUrl, '_blank');

                toast(`Opening ${btn.querySelector('span:last-child').textContent}. Context ready!`);
                toolResultArea.style.display = 'none';

              } catch (e) {
                console.error('[ChatBridge] Continue With error:', e);
                toast('Failed to prepare context');
                btn.innerHTML = `<span style="font-size:14px;">${platforms.find(p => p.id === targetId)?.icon || '🔄'}</span><span>${platforms.find(p => p.id === targetId)?.name || 'Retry'}</span>`;
                btn.disabled = false;
              }
            });
          });
        });
        toolsGrid.appendChild(continueCard);

        insightsContent.appendChild(toolsGrid);
        debugLog('[Insights Hub] Render complete (inline)');
      } catch (e) {
        debugLog('[Insights Hub] Render error:', e);
        toast('Failed to render Insights Hub');
      }
    }

    // Render Smart Workspace UI
    async function renderSmartWorkspace() {
      try {
        if (!insightsContent) {
          debugLog('insightsContent not found!');
          toast('Error: UI element missing');
          return;
        }
        insightsContent.innerHTML = '';
        debugLog('Rendering Smart Workspace...');

        // AI-Powered Insights Section (if available)
        try {
          const lastInsights = localStorage.getItem('chatbridge:last_insights');
          if (lastInsights && window.AISummaryEngine) {
            const insights = JSON.parse(lastInsights);
            const insightsSection = document.createElement('div');
            insightsSection.style.cssText = 'margin-bottom:16px;padding:0 12px;';

            const insightsTitle = document.createElement('div');
            insightsTitle.style.cssText = 'font-weight:600;font-size:12px;margin-bottom:8px;color:var(--cb-subtext);display:flex;align-items:center;justify-content:space-between;';
            insightsTitle.innerHTML = `
              <span>🎯 AI-Generated Insights</span>
              <button class="cb-btn" style="padding:2px 8px;font-size:10px;">Refresh</button>
            `;
            insightsSection.appendChild(insightsTitle);

            const insightsContainer = document.createElement('div');
            insightsContainer.id = 'cb-ai-insights-container';
            insightsContainer.style.cssText = 'background:rgba(16,24,43,0.4);border:1px solid rgba(0,180,255,0.2);border-radius:8px;padding:12px;max-height:300px;overflow-y:auto;';

            const summaryEngine = new window.AISummaryEngine();
            summaryEngine.renderInsights(insights, insightsContainer);

            insightsSection.appendChild(insightsContainer);
            insightsContent.appendChild(insightsSection);

            // Add refresh handler
            const refreshBtn = insightsTitle.querySelector('button');
            if (refreshBtn) {
              refreshBtn.addEventListener('click', async () => {
                try {
                  addLoadingToButton(refreshBtn, 'Refreshing...');
                  const msgs = await scanChat();
                  if (msgs && msgs.length > 0) {
                    const newInsights = await summaryEngine.generateInsights(msgs);
                    if (newInsights) {
                      localStorage.setItem('chatbridge:last_insights', JSON.stringify(newInsights));
                      insightsContainer.innerHTML = '';
                      summaryEngine.renderInsights(newInsights, insightsContainer);
                      toast('Insights refreshed');
                    }
                  }
                } catch (e) {
                  toast('Refresh failed');
                } finally {
                  removeLoadingFromButton(refreshBtn, 'Refresh');
                }
              });
            }
          }
        } catch (e) {
          debugLog('Failed to load AI insights:', e);
        }

        // Auto Summary when long threads (>15 messages)
        try {
          const msgs = await scanChat();
          if (msgs && msgs.length > 15) {
            const autoSection = document.createElement('div');
            autoSection.style.cssText = 'margin:12px;padding:12px;background:rgba(16,24,43,0.4);border:1px solid rgba(0,180,255,0.25);border-radius:8px;';
            autoSection.innerHTML = '<div style="font-weight:600;font-size:12px;margin-bottom:6px;color:var(--cb-subtext);">🧠 Auto Summary</div><div id="cb-auto-sum" style="font-size:12px;opacity:0.9;line-height:1.4;">Summarizing conversation…</div>';
            insightsContent.appendChild(autoSection);
            // Generate summary asynchronously without blocking UI
            (async () => {
              try {
                const prompt = msgs.map(m => `${m.role}: ${m.text}`).join('\n\n');
                const sum = await callGeminiAsync({ action: 'summarize', text: prompt, length: 'short', summaryType: 'paragraph' });
                const tgt = autoSection.querySelector('#cb-auto-sum');
                if (sum && sum.ok && tgt) {
                  const txt = String(sum.result || '').trim();
                  const maxLen = 200;
                  if (txt.length > maxLen) {
                    const preview = txt.slice(0, maxLen) + '…';
                    tgt.innerHTML = `<span>${preview}</span><button style="margin-left:8px;padding:2px 8px;background:rgba(0,180,255,0.2);border:1px solid rgba(0,180,255,0.4);border-radius:4px;color:var(--cb-white);font-size:11px;cursor:pointer;" data-expanded="false">Expand</button>`;
                    const expandBtn = tgt.querySelector('button');
                    expandBtn.addEventListener('click', () => {
                      const isExpanded = expandBtn.dataset.expanded === 'true';
                      if (isExpanded) {
                        tgt.querySelector('span').textContent = preview;
                        expandBtn.textContent = 'Expand';
                        expandBtn.dataset.expanded = 'false';
                      } else {
                        tgt.querySelector('span').textContent = txt;
                        expandBtn.textContent = 'Collapse';
                        expandBtn.dataset.expanded = 'true';
                      }
                    });
                  } else {
                    tgt.textContent = txt;
                  }
                } else if (tgt) {
                  tgt.textContent = '(Auto summary unavailable)';
                }
              } catch (_) {
                const tgt = autoSection.querySelector('#cb-auto-sum');
                if (tgt) tgt.textContent = '(Auto summary failed)';
              }
            })();
          }
        } catch (e) { debugLog('auto summary failed', e); }

        // Quick Actions Grid
        const actionsGrid = document.createElement('div');
        actionsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;padding:0 12px;';

        // 1. Quick Compare (compare responses from different models)
        const compareBtn = createFeatureCard('Compare Models', 'Compare how different AIs answered the same question', '🔄', async () => {
          try {
            const convs = await loadConversationsAsync();
            if (!convs || convs.length < 2) { toast('Need at least 2 conversations'); return; }

            // Find conversations with similar content
            const comparableGroups = findComparableConversations(convs);
            if (!comparableGroups.length) {
              toast('No similar conversations found to compare');
              return;
            }

            // Show comparison UI
            showComparisonView(comparableGroups[0]);
          } catch (e) {
            toast('Compare failed');
            debugLog('Compare error', e);
          }
        });

        // 2. Smart Merge (merge related conversations)
        const mergeBtn = createFeatureCard('Merge Threads', 'Combine related conversations into one coherent thread', '🔗', async () => {
          try {
            const convs = await loadConversationsAsync();
            if (!convs || convs.length < 2) { toast('Need at least 2 conversations'); return; }

            // Show merge UI
            showMergeView(convs);
          } catch (e) {
            toast('Merge failed');
            debugLog('Merge error', e);
          }
        });

        // 3. Quick Extract (extract code, lists, or key info)
        const extractBtn = createFeatureCard('Extract Content', 'Pull out code blocks, lists, or important info', '📋', () => {
          try {
            showExtractView();
          } catch (e) {
            toast('Extract failed');
            debugLog('Extract error', e);
          }
        });

        // 4. Insight Finder (semantic spotlight - CTRL+SHIFT+F)
        const insightBtn = createFeatureCard('Insight Finder', 'Extract comparisons, contradictions, requirements & more', '🔍', async () => {
          addLoadingToButton(insightBtn, 'Analyzing...');
          try {
            const msgs = await scanChat();
            if (!msgs || msgs.length === 0) {
              toast('No messages found in current chat');
              removeLoadingFromButton(insightBtn, 'Insight Finder');
              return;
            }
            const insights = extractInsights(msgs);
            const total = Object.values(insights).reduce((sum, arr) => sum + arr.length, 0);
            if (total === 0) {
              toast('No insights found in this conversation');
              removeLoadingFromButton(insightBtn, 'Insight Finder');
              return;
            }
            showInsightFinderModal(insights, msgs);
            toast(`Found ${total} insights`);
          } catch (e) {
            toast('Analysis failed');
            debugLog('Insight Finder error', e);
          } finally {
            removeLoadingFromButton(insightBtn, 'Insight Finder');
          }
        });

        // 5. Continue Conversation (cross-model handoff)
        const continueBtn = createFeatureCard('Continue on...', 'Move this conversation to a different AI model', '🔄', async () => {
          addLoadingToButton(continueBtn, 'Preparing...');
          try {
            const msgs = await scanChat();
            if (!msgs || msgs.length === 0) {
              toast('No conversation to continue');
              removeLoadingFromButton(continueBtn, 'Continue on...');
              return;
            }

            // Show model selector modal
            const modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:999999;display:flex;align-items:center;justify-content:center;';
            modal.innerHTML = `
              <div style="background:var(--cb-bg);padding:24px;border-radius:12px;max-width:400px;box-shadow:0 8px 32px rgba(0,0,0,0.4);border:1px solid var(--cb-border);">
                <h3 style="margin:0 0 16px 0;color:var(--cb-white);font-size:16px;">Continue on Different Model</h3>
                <p style="margin:0 0 16px 0;color:var(--cb-subtext);font-size:13px;line-height:1.4;">Select a model to continue this conversation. A summary will be generated and opened in a new tab.</p>
                <select id="cb-continue-target" class="cb-select" style="width:100%;margin-bottom:16px;">
                  <option value="Claude">Claude (Anthropic)</option>
                  <option value="ChatGPT">ChatGPT (OpenAI)</option>
                  <option value="Gemini">Gemini (Google)</option>
                  <option value="Copilot">Copilot (Microsoft)</option>
                </select>
                <div style="display:flex;gap:8px;">
                  <button id="cb-continue-go" class="cb-btn cb-btn-primary" style="flex:1;">Continue</button>
                  <button id="cb-continue-cancel" class="cb-btn" style="flex:1;">Cancel</button>
                </div>
              </div>
            `;

            document.body.appendChild(modal);

            modal.querySelector('#cb-continue-cancel').addEventListener('click', () => {
              modal.remove();
            });

            modal.querySelector('#cb-continue-go').addEventListener('click', async () => {
              const target = modal.querySelector('#cb-continue-target').value;
              const goBtn = modal.querySelector('#cb-continue-go');
              addLoadingToButton(goBtn, 'Processing...');

              try {
                // Generate context summary
                const convText = msgs.map(m => `${m.role}: ${m.text}`).join('\\n\\n');
                const prompt = `Summarize this conversation for continuing on ${target}. Include context, key points, and current state:\\n\\n${convText.slice(0, 8000)}`;

                const res = await callGeminiAsync({ action: 'summarize', text: prompt, length: 'medium', summaryType: 'transfer' });
                let summary = '';
                if (res && res.ok && res.result) {
                  summary = `[Continued from previous conversation]\\n\\n${res.result}\\n\\nPlease continue from where we left off.`;
                } else {
                  summary = `[Continued from previous conversation]\\n\\n${convText.slice(0, 2000)}\\n\\n...\\n\\nPlease continue from where we left off.`;
                }

                // Open target model with summary
                const url = getTargetModelUrl(target);
                if (url) {
                  try {
                    chrome.runtime.sendMessage({ type: 'open_and_restore', payload: { url, text: summary } }, () => { });
                    toast(`Opening ${target}...`);
                  } catch (e) {
                    window.open(url, '_blank');
                    await navigator.clipboard.writeText(summary);
                    toast('Tab opened. Summary copied to clipboard.');
                  }
                  modal.remove();
                } else {
                  toast('Model not supported');
                }
              } catch (e) {
                debugLog('Continue conversation error:', e);
                toast('Failed to continue conversation');
              } finally {
                removeLoadingFromButton(goBtn, 'Continue');
              }
            });

          } catch (e) {
            toast('Continue failed');
            debugLog('Continue conversation error', e);
          } finally {
            removeLoadingFromButton(continueBtn, 'Continue on...');
          }
        });

        actionsGrid.appendChild(compareBtn);
        actionsGrid.appendChild(mergeBtn);
        actionsGrid.appendChild(extractBtn);
        actionsGrid.appendChild(insightBtn);
        actionsGrid.appendChild(continueBtn);

        // 6. Fact-Check Mode (extract and verify claims)
        const factCheckBtn = createFeatureCard('Fact-Check', 'Extract and analyze factual claims from conversation', '✓', async () => {
          addLoadingToButton(factCheckBtn, 'Analyzing...');
          try {
            const msgs = await scanChat();
            if (!msgs || msgs.length === 0) {
              toast('No conversation to fact-check');
              removeLoadingFromButton(factCheckBtn, 'Fact-Check');
              return;
            }

            // Extract factual claims
            const convText = msgs.map(m => `${m.role}: ${m.text}`).join('\\n\\n');
            const prompt = `Analyze this conversation and extract factual claims that can be verified. For each claim, provide a confidence level (high/medium/low) based on how verifiable and specific it is.

Conversation:
${convText.slice(0, 5000)}

Respond with JSON only:
{
  "claims": [
    {"text": "claim statement", "confidence": "high/medium/low", "source": "user/assistant", "messageIndex": 0}
  ]
}`;

            const res = await callGeminiAsync({ action: 'custom', prompt, temperature: 0.3 });

            if (res && res.ok && res.result) {
              try {
                let jsonStr = res.result;
                const jsonMatch = jsonStr.match(/```json\\s*([\\s\\S]+?)```/) || jsonStr.match(/```\\s*([\\s\\S]+?)```/);
                if (jsonMatch) jsonStr = jsonMatch[1];

                const parsed = JSON.parse(jsonStr);
                if (parsed.claims && Array.isArray(parsed.claims) && parsed.claims.length > 0) {
                  showFactCheckModal(parsed.claims);
                  toast(`Found ${parsed.claims.length} claims`);
                } else {
                  toast('No verifiable claims found');
                }
              } catch (parseErr) {
                debugLog('Fact-check parse error:', parseErr);
                toast('Failed to parse results');
              }
            } else {
              toast('Fact-check failed');
            }
          } catch (e) {
            debugLog('Fact-check error:', e);
            toast('Fact-check failed');
          } finally {
            removeLoadingFromButton(factCheckBtn, 'Fact-Check');
          }
        });

        actionsGrid.appendChild(factCheckBtn);
        insightsContent.appendChild(actionsGrid);

        // ============================================
        // SMART LIBRARY WIDGET
        // ============================================
        await renderSmartLibraryWidget(insightsContent);

        // ============================================
        // TRENDING THEMES WIDGET
        // ============================================
        await renderTrendingThemesWidget(insightsContent);

        // ============================================
        // IMAGE VAULT WIDGET
        // ============================================
        await renderImageVaultWidget(insightsContent);

        // Output Preview Area
        const outputSection = document.createElement('div');
        outputSection.style.cssText = 'padding:0 12px;margin-bottom:16px;';

        const outputLabel = document.createElement('div');
        outputLabel.style.cssText = 'font-weight:600;font-size:12px;margin-bottom:8px;color:var(--cb-subtext);';
        outputLabel.textContent = '📄 Output Preview';
        outputSection.appendChild(outputLabel);

        const outputArea = document.createElement('div');
        outputArea.id = 'cb-insights-output';
        outputArea.className = 'cb-view-text';
        outputArea.style.cssText = 'min-height:120px;max-height:300px;overflow-y:auto;background:rgba(16,24,43,0.4);border:1px solid rgba(0,180,255,0.2);border-radius:8px;padding:12px;font-size:12px;line-height:1.5;white-space:pre-wrap;';
        outputArea.textContent = '(Results will appear here)';
        outputSection.appendChild(outputArea);

        const outputControls = document.createElement('div');
        outputControls.style.cssText = 'display:flex;gap:8px;margin-top:8px;';

        const btnSendToChat = document.createElement('button');
        btnSendToChat.className = 'cb-btn cb-btn-primary';
        btnSendToChat.textContent = '➤ Send to Chat';
        btnSendToChat.style.cssText = 'flex:1;';
        btnSendToChat.addEventListener('click', async () => {
          const outputText = outputArea.textContent;
          if (!outputText || outputText === '(Results will appear here)') {
            toast('No output to send');
            return;
          }

          try {
            // Find the chat input using the adapter
            const adapter = Object.values(window.SiteAdapters || {}).find(a => a.detect && a.detect());
            if (adapter && adapter.getInput) {
              const input = adapter.getInput();
              if (input) {
                input.value = outputText;
                input.textContent = outputText;
                // Trigger input events to ensure the site recognizes the change
                ['input', 'change', 'keydown'].forEach(evType => {
                  const ev = new Event(evType, { bubbles: true });
                  input.dispatchEvent(ev);
                });
                toast('Sent to chat input');
              } else {
                // Fallback: copy to clipboard
                await navigator.clipboard.writeText(outputText);
                toast('Copied to clipboard (paste into chat)');
              }
            } else {
              // Fallback: copy to clipboard
              await navigator.clipboard.writeText(outputText);
              toast('Copied to clipboard (paste into chat)');
            }
          } catch (e) {
            debugLog('Send to chat error', e);
            toast('Failed to send to chat');
          }
        });

        const btnCopyOutput = document.createElement('button');
        btnCopyOutput.className = 'cb-btn';
        btnCopyOutput.textContent = '📋 Copy';
        btnCopyOutput.addEventListener('click', async () => {
          const outputText = outputArea.textContent;
          if (!outputText || outputText === '(Results will appear here)') {
            toast('No output to copy');
            return;
          }

          try {
            await navigator.clipboard.writeText(outputText);
            toast('Copied to clipboard');
          } catch (e) {
            toast('Copy failed');
          }
        });

        const btnClearOutput = document.createElement('button');
        btnClearOutput.className = 'cb-btn';
        btnClearOutput.textContent = '✕ Clear';
        btnClearOutput.addEventListener('click', () => {
          outputArea.textContent = '(Results will appear here)';
          toast('Output cleared');
        });

        outputControls.appendChild(btnSendToChat);
        outputControls.appendChild(btnCopyOutput);
        outputControls.appendChild(btnClearOutput);
        outputSection.appendChild(outputControls);

        insightsContent.appendChild(outputSection);

        // Smart Suggestions Section
        const suggestTitle = document.createElement('div');
        suggestTitle.style.cssText = 'font-weight:600;font-size:12px;margin:16px 12px 8px 12px;color:var(--cb-subtext);';
        suggestTitle.textContent = '💡 Suggested Actions';
        insightsContent.appendChild(suggestTitle);

        // Generate contextual suggestions
        const suggestions = await generateSmartSuggestions();
        const suggestionsList = document.createElement('div');
        suggestionsList.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:0 12px;';

        suggestions.forEach(sugg => {
          const suggCard = document.createElement('div');
          suggCard.style.cssText = 'padding:10px 12px;background:rgba(0,180,255,0.08);border-left:3px solid var(--cb-accent-primary);border-radius:8px;cursor:pointer;transition:all 0.2s;';
          suggCard.innerHTML = `<div style="font-weight:600;font-size:12px;margin-bottom:4px;">${sugg.title}</div><div style="font-size:11px;opacity:0.8;">${sugg.description}</div>`;
          suggCard.addEventListener('mouseenter', () => suggCard.style.background = 'rgba(0,180,255,0.15)');
          suggCard.addEventListener('mouseleave', () => suggCard.style.background = 'rgba(0,180,255,0.08)');
          suggCard.addEventListener('click', () => sugg.action());
          suggestionsList.appendChild(suggCard);
        });

        insightsContent.appendChild(suggestionsList);

        debugLog('Smart Workspace rendered successfully');

      } catch (e) {
        debugLog('renderSmartWorkspace error', e);
        if (insightsContent) {
          insightsContent.innerHTML = `<div style="padding:12px;color:rgba(255,100,100,0.9);">Failed to load workspace: ${e.message || 'Unknown error'}</div>`;
        }
      }
    }

    // Helper: Create feature card
    function createFeatureCard(title, description, icon, onClick) {
      const card = document.createElement('button');
      card.className = 'cb-btn';
      card.style.cssText = 'padding:14px 12px;text-align:left;height:auto;display:flex;flex-direction:column;gap:6px;background:rgba(16,24,43,0.4);border:1px solid rgba(0,180,255,0.2);transition:all 0.2s;';
      card.innerHTML = `
        <div style="font-size:20px;line-height:1;">${icon}</div>
        <div style="font-weight:600;font-size:13px;">${title}</div>
        <div style="font-size:11px;opacity:0.7;line-height:1.3;">${description}</div>
      `;
      card.addEventListener('mouseenter', () => {
        card.style.background = 'rgba(0,180,255,0.15)';
        card.style.transform = 'translateY(-2px)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.background = 'rgba(16,24,43,0.4)';
        card.style.transform = 'translateY(0)';
      });
      card.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); try { onClick && onClick(e); } catch (_) { } });
      return card;
    }

    // Helper: Find comparable conversations (similar questions/topics)
    function findComparableConversations(convs) {
      const groups = [];
      const processed = new Set();

      for (let i = 0; i < convs.length; i++) {
        if (processed.has(i)) continue;

        const conv1 = convs[i];
        const similar = [conv1];
        processed.add(i);

        for (let j = i + 1; j < convs.length; j++) {
          if (processed.has(j)) continue;

          const conv2 = convs[j];

          // Check for topic overlap
          const topics1 = conv1.topics || [];
          const topics2 = conv2.topics || [];
          const overlap = topics1.filter(t => topics2.includes(t)).length;

          if (overlap >= 2) {
            similar.push(conv2);
            processed.add(j);
          }
        }

        if (similar.length >= 2) {
          groups.push(similar);
        }
      }

      return groups;
    }

    // Helper: Show comparison view
    function showComparisonView(conversations) {
      if (!insightsContent) return;
      insightsContent.innerHTML = '';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding:0 12px;';
      header.innerHTML = `<div style="font-weight:700;font-size:14px;">Model Comparison</div><button class="cb-btn cb-view-close">← Back</button>`;
      header.querySelector('.cb-view-close').addEventListener('click', () => renderSmartWorkspace());
      insightsContent.appendChild(header);

      conversations.forEach(conv => {
        const card = document.createElement('div');
        card.style.cssText = 'padding:12px;background:rgba(16,24,43,0.4);border-radius:8px;margin:0 12px 12px 12px;';

        const model = conv.model || conv.platform || 'Unknown';
        const preview = conv.conversation[0]?.text.slice(0, 200) || '';

        card.innerHTML = `
          <div style="font-weight:600;margin-bottom:8px;color:var(--cb-accent-primary);">${model}</div>
          <div style="font-size:12px;opacity:0.9;">${preview}...</div>
          <button class="cb-btn" style="margin-top:8px;padding:6px 10px;font-size:11px;">View Full</button>
        `;

        card.querySelector('.cb-btn').addEventListener('click', () => {
          const output = conv.conversation.map(m => `${m.role}: ${m.text}`).join('\n\n');
          showOutputWithSendButton(output, `${model} - Full Conversation`);
          toast('Loaded conversation');
        });

        insightsContent.appendChild(card);
      });
    }

    // Helper: Show merge view
    function showMergeView(convs) {
      if (!insightsContent) return;
      insightsContent.innerHTML = '';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding:0 12px;';
      header.innerHTML = `<div style="font-weight:700;font-size:14px;">Merge Threads</div><button class="cb-btn cb-view-close">← Back</button>`;
      header.querySelector('.cb-view-close').addEventListener('click', () => renderSmartWorkspace());
      insightsContent.appendChild(header);

      const intro = document.createElement('div');
      intro.style.cssText = 'font-size:12px;margin-bottom:12px;opacity:0.8;padding:0 12px;';
      intro.textContent = 'Select conversations to merge into a single coherent thread:';
      insightsContent.appendChild(intro);

      const selected = new Set();

      convs.slice(0, 10).forEach(conv => {
        const checkbox = document.createElement('label');
        checkbox.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px;background:rgba(16,24,43,0.3);border-radius:8px;margin:0 12px 8px 12px;cursor:pointer;';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = conv.ts;
        input.addEventListener('change', () => {
          if (input.checked) selected.add(conv.ts);
          else selected.delete(conv.ts);
        });

        // Get one-liner preview from first message
        let preview = '';
        try {
          if (conv.conversation && conv.conversation.length > 0) {
            const firstMsg = conv.conversation[0];
            preview = (firstMsg.text || '').replace(/\n/g, ' ').trim();
            if (preview.length > 60) preview = preview.substring(0, 57) + '...';
          }
        } catch (e) { }

        const chatName = preview || conv.name || 'Untitled Chat';
        const site = conv.platform || conv.host || (conv.url ? new URL(conv.url).hostname : 'Unknown');
        const count = conv.conversation?.length || 0;

        checkbox.innerHTML = `<div style="flex:1;"><div style="font-weight:600;font-size:12px;margin-bottom:4px;">${chatName}</div><div style="font-size:11px;opacity:0.7;">📍 ${site} • 💬 ${count} messages</div></div>`;
        checkbox.prepend(input);

        insightsContent.appendChild(checkbox);
      });

      const mergeBtn = document.createElement('button');
      mergeBtn.className = 'cb-btn cb-btn-primary';
      mergeBtn.textContent = 'Merge Selected';
      mergeBtn.style.cssText = 'margin:12px;';
      mergeBtn.addEventListener('click', async () => {
        if (selected.size < 2) { toast('Select at least 2 conversations'); return; }

        addLoadingToButton(mergeBtn, 'Merging...');
        try {
          const toMerge = convs.filter(c => selected.has(c.ts));
          const combined = toMerge.flatMap(c => c.conversation);
          const output = combined.map(m => `${m.role}: ${m.text}`).join('\n\n');

          // Show output with Send to Chat button
          showOutputWithSendButton(output, 'Merged Conversation');
          toast('Merged conversations ready!');
        } catch (e) {
          toast('Merge failed');
          debugLog('Merge execution error', e);
        } finally {
          removeLoadingFromButton(mergeBtn, 'Merge Selected');
        }
      });

      insightsContent.appendChild(mergeBtn);
    }

    // Helper: Show extract view
    function showExtractView() {
      if (!insightsContent) return;
      insightsContent.innerHTML = '';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding:0 12px;';
      header.innerHTML = `<div style="font-weight:700;font-size:14px;">Extract Content</div><button class="cb-btn cb-view-close">← Back</button>`;
      header.querySelector('.cb-view-close').addEventListener('click', () => renderSmartWorkspace());
      insightsContent.appendChild(header);

      const types = [
        { name: 'Code Blocks', icon: '💻', pattern: /```[\s\S]*?```/g },
        { name: 'Lists', icon: '📝', pattern: /^[\s]*[-*•]\s+.+$/gm },
        { name: 'Ordered Lists', icon: '🔢', pattern: /^[\s]*\d+\.\s+.+$/gm },
        { name: 'URLs', icon: '🔗', pattern: /https?:\/\/[^\s]+/g },
        { name: 'Numbers/Data', icon: '🔣', pattern: /\b\d+(?:[.,]\d+)?\b/g }
      ];

      types.forEach(type => {
        const btn = document.createElement('button');
        btn.className = 'cb-btn';
        btn.style.cssText = 'width:calc(100% - 24px);text-align:left;padding:12px;margin:0 12px 8px 12px;display:flex;align-items:center;gap:10px;';
        btn.innerHTML = `<span style="font-size:20px;">${type.icon}</span><span style="font-weight:600;">${type.name}</span>`;
        btn.addEventListener('click', async () => {
          const text = lastScannedText || '';
          if (!text || text.length < 10) {
            toast('Scan a conversation first');
            return;
          }
          let matches = text.match(type.pattern) || [];
          // Basic dedupe for URL/list-like extractions
          try {
            if (type.name === 'URLs' || type.name === 'Lists' || type.name === 'Ordered Lists') {
              const seen = new Set();
              matches = matches.filter(m => {
                const k = String(m).trim();
                if (!k || seen.has(k)) return false; seen.add(k); return true;
              });
            }
          } catch (_) { }

          if (!matches.length) {
            toast(`No ${type.name.toLowerCase()} found`);
            return;
          }

          const output = matches.join('\n\n');
          showOutputWithSendButton(output, `${type.icon} ${type.name} (${matches.length} found)`);
          toast(`Extracted ${matches.length} ${type.name.toLowerCase()}`);
        });
        insightsContent.appendChild(btn);
      });

      // Images & Media extraction from last scan (attachments)
      const mediaBtn = document.createElement('button');
      mediaBtn.className = 'cb-btn';
      mediaBtn.style.cssText = 'width:calc(100% - 24px);text-align:left;padding:12px;margin:0 12px 8px 12px;display:flex;align-items:center;gap:10px;';
      mediaBtn.innerHTML = `<span style="font-size:20px;">🖼️</span><span style="font-weight:600;">Images & Media</span>`;
      mediaBtn.addEventListener('click', async () => {
        try {
          const ls = (window.ChatBridge && typeof window.ChatBridge.getLastScan === 'function') ? window.ChatBridge.getLastScan() : null;
          const msgs = (ls && Array.isArray(ls.messages)) ? ls.messages : [];
          if (!msgs.length) { toast('Scan a conversation first'); return; }
          const all = [];
          msgs.forEach(m => { if (Array.isArray(m.attachments)) all.push(...m.attachments); });
          // Dedupe by URL
          const seen = new Set();
          const uniq = all.filter(a => { if (!a || !a.url) return false; if (seen.has(a.url)) return false; seen.add(a.url); return true; });
          if (!uniq.length) { toast('No images or media found'); return; }
          const grouped = uniq.reduce((acc, a) => { const k = a.kind || 'file'; (acc[k] = acc[k] || []).push(a); return acc; }, {});
          const lines = [];
          Object.keys(grouped).forEach(k => {
            lines.push(`# ${k.toUpperCase()} (${grouped[k].length})`);
            grouped[k].forEach((a, i) => {
              const name = a.name || a.alt || a.url.split('?')[0].split('#')[0].split('/').pop() || 'file';
              lines.push(`- ${name}: ${a.url}`);
            });
            lines.push('');
          });
          const textOut = lines.join('\n');
          showOutputWithSendButton(textOut, `🖼️ Images & Media (${uniq.length} found)`);
          toast(`Extracted ${uniq.length} media items`);
        } catch (e) {
          debugLog('Media extract error', e);
          toast('Extract failed');
        }
      });
      insightsContent.appendChild(mediaBtn);
    }

    // Helper: Show output with Send to Chat button
    function showOutputWithSendButton(output, title) {
      if (!insightsContent) return;
      insightsContent.innerHTML = '';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding:0 12px;';
      header.innerHTML = `<div style="font-weight:700;font-size:14px;">${title}</div><button class="cb-btn cb-view-close">← Back</button>`;
      header.querySelector('.cb-view-close').addEventListener('click', () => renderSmartWorkspace());
      insightsContent.appendChild(header);

      // Output preview area
      const outputArea = document.createElement('div');
      outputArea.id = 'cb-insights-output';
      outputArea.style.cssText = 'background:rgba(6,20,32,0.6);border:1px solid rgba(0,180,255,0.3);border-radius:8px;padding:12px;margin:0 12px 12px 12px;max-height:300px;overflow-y:auto;font-size:12px;line-height:1.6;white-space:pre-wrap;color:rgba(255,255,255,0.9);';
      outputArea.textContent = output;
      insightsContent.appendChild(outputArea);

      // Send to Chat button
      const sendBtn = document.createElement('button');
      sendBtn.className = 'cb-btn cb-btn-primary';
      sendBtn.textContent = '📤 Send to Chat';
      sendBtn.style.cssText = 'margin:0 12px;width:calc(100% - 24px);';
      sendBtn.addEventListener('click', async () => {
        try {
          await restoreToChat(output, []);
          toast('Sent to chat input!');
        } catch (e) {
          toast('Failed to send to chat');
          debugLog('Send to chat error', e);
        }
      });
      insightsContent.appendChild(sendBtn);

      // Scroll to show output
      setTimeout(() => {
        outputArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }

    // Helper: Generate smart suggestions based on conversation history
    async function generateSmartSuggestions() {
      const suggestions = [];

      try {
        const convs = await loadConversationsAsync();

        // Suggestion 1: If many untagged conversations
        const untagged = convs.filter(c => !c.topics || !c.topics.length).length;
        if (untagged > 5) {
          suggestions.push({
            title: `📌 ${untagged} untagged conversations`,
            description: 'Organize them for easier searching',
            action: () => {
              try {
                if (btnNormalizeTags) btnNormalizeTags.click();
                else toast('Feature not available');
              } catch (e) {
                toast('Error opening organizer');
              }
            }
          });
        }

        // Suggestion 2: If conversations not indexed
        if (convs.length > 3) {
          suggestions.push({
            title: '🔍 Enable semantic search',
            description: 'Index your conversations for AI-powered search',
            action: () => {
              try {
                if (btnIndexAll) btnIndexAll.click();
                else toast('Feature not available');
              } catch (e) {
                toast('Error opening indexer');
              }
            }
          });
        }

        // Suggestion 3: If similar recent conversations
        const recent = convs.slice(0, 5);
        const hasSimilar = recent.length >= 2 && recent[0].topics?.some(t => recent[1].topics?.includes(t));
        if (hasSimilar) {
          suggestions.push({
            title: '🔄 Similar conversations detected',
            description: 'Compare responses from different models',
            action: async () => {
              try {
                const groups = findComparableConversations(recent);
                if (groups.length) showComparisonView(groups[0]);
                else toast('No comparable conversations found');
              } catch (e) {
                toast('Comparison failed');
              }
            }
          });
        }

      } catch (e) {
        debugLog('generateSmartSuggestions error', e);
      }

      // If no suggestions, add a default one
      if (suggestions.length === 0) {
        suggestions.push({
          title: '🎯 Get started',
          description: 'Scan a conversation to unlock more features',
          action: () => toast('Click "Scan Chat" to save your first conversation')
        });
      }

      return suggestions.slice(0, 3); // Max 3 suggestions
    }

    // ============================================
    // AI AGENT HUB FUNCTIONS
    // ============================================

    // Render Agent Hub UI with all four agents
    async function renderAgentHub() {
      try {
        if (!agentContent) {
          debugLog('agentContent not found!');
          toast('Error: UI element missing');
          return;
        }
        agentContent.innerHTML = '';
        debugLog('Rendering Agent Hub...');

        // AI Status Header (simplified)
        const aiStatus = document.createElement('div');
        aiStatus.style.cssText = 'margin:12px;padding:14px 16px;background:linear-gradient(135deg,rgba(138,43,226,0.1),rgba(0,180,255,0.1));border:1px solid rgba(138,43,226,0.25);border-radius:12px;display:flex;align-items:center;gap:12px;';
        aiStatus.innerHTML = `
          <span style="font-size:24px;">🤖</span>
          <div style="flex:1;">
            <div style="font-weight:600;color:var(--cb-white);font-size:14px;">AI Agent Hub</div>
            <div style="font-size:11px;color:var(--cb-subtext);margin-top:2px;">Powered by Gemini • Analyze, organize, and enhance your conversations</div>
          </div>
        `;
        agentContent.appendChild(aiStatus);

        // Agent Cards Grid
        const agentsGrid = document.createElement('div');
        agentsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px;padding:0 12px;position:relative;z-index:0;';

        // 1. Continuum - Context Reconstruction Agent
        const continuumCard = createAgentCard(
          'Continuum',
          'Restore context across AI platforms',
          '🔄',
          'Never lose your train of thought when switching between AI tools',
          async () => {
            try {
              await showContinuumAgent();
            } catch (e) {
              toast('Continuum failed');
              debugLog('Continuum error', e);
            }
          }
        );

        // 2. Memory Architect - Knowledge Organizer
        const memoryCard = createAgentCard(
          'Memory Architect',
          'Build your AI knowledge base',
          '🧠',
          'Convert all chats into structured, searchable knowledge',
          async () => {
            try {
              await showMemoryArchitect();
            } catch (e) {
              toast('Memory Architect failed');
              debugLog('Memory Architect error', e);
            }
          }
        );

        // 3. EchoSynth - Multi-AI Synthesizer
        const echoCard = createAgentCard(
          'EchoSynth',
          'Merge insights from multiple AIs',
          '⚡',
          'One prompt queries all AIs, synthesizes best answer',
          async () => {
            try {
              await showEchoSynth();
            } catch (e) {
              toast('EchoSynth failed');
              debugLog('EchoSynth error', e);
            }
          }
        );

        // 4. Quick Agent - Simple task agent (original functionality)
        const quickCard = createAgentCard(
          'Quick Agent',
          'Analyze & suggest next steps',
          '🎯',
          'Quick analysis and action recommendations',
          async () => {
            try {
              await showQuickAgent();
            } catch (e) {
              toast('Quick Agent failed');
              debugLog('Quick Agent error', e);
            }
          }
        );

        [continuumCard, memoryCard, echoCard, quickCard].forEach(card => agentsGrid.appendChild(card));
        agentContent.appendChild(agentsGrid);

        // Second Row: Agentic AI Agents
        const agentsGrid2 = document.createElement('div');
        agentsGrid2.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px;padding:0 12px;position:relative;z-index:0;';

        // 5. Threadkeeper - Conversation Operator
        const threadkeeperCard = createAgentCard(
          'Threadkeeper',
          'Autonomous conversation tracking',
          '🧵',
          'Tracks all conversations, auto-injects context, warns when history is missing',
          async () => {
            try {
              await showThreadkeeperAgent();
            } catch (e) {
              toast('Threadkeeper failed');
              debugLog('Threadkeeper error', e);
            }
          }
        );

        // 6. Multi-AI Planner - Project Orchestrator
        const plannerCard = createAgentCard(
          'Multi-AI Planner',
          'Break goals into AI-powered steps',
          '🎯',
          'Breaks projects into steps, assigns to best AI, builds unified plan',
          async () => {
            try {
              await showMultiAIPlannerAgent();
            } catch (e) {
              toast('Multi-AI Planner failed');
              debugLog('Multi-AI Planner error', e);
            }
          }
        );

        [threadkeeperCard, plannerCard].forEach(card => agentsGrid2.appendChild(card));
        agentContent.appendChild(agentsGrid2);

        // Agent Output Area
        const outputSection = document.createElement('div');
        outputSection.style.cssText = 'padding:0 12px;margin-bottom:16px;';

        const outputLabel = document.createElement('div');
        outputLabel.style.cssText = 'font-weight:600;font-size:12px;margin-bottom:8px;color:var(--cb-subtext);';
        outputLabel.textContent = '📊 Agent Output';
        outputSection.appendChild(outputLabel);

        const outputArea = document.createElement('div');
        outputArea.id = 'cb-agent-output';
        outputArea.className = 'cb-view-text';
        outputArea.style.cssText = 'min-height:120px;max-height:400px;overflow-y:auto;background:rgba(16,24,43,0.4);border:1px solid rgba(0,180,255,0.2);border-radius:8px;padding:12px;font-size:12px;line-height:1.5;white-space:pre-wrap;';
        outputArea.textContent = '(Agent results will appear here)';
        outputSection.appendChild(outputArea);

        const outputControls = document.createElement('div');
        outputControls.style.cssText = 'display:flex;gap:8px;margin-top:8px;';

        const btnAgentToChat = document.createElement('button');
        btnAgentToChat.className = 'cb-btn cb-btn-primary';
        btnAgentToChat.textContent = '➤ Insert to Chat';
        btnAgentToChat.style.cssText = 'flex:1;';
        btnAgentToChat.addEventListener('click', async () => {
          const outputText = outputArea.textContent;
          if (!outputText || outputText === '(Agent results will appear here)') {
            toast('No output to insert');
            return;
          }

          try {
            await restoreToChat(outputText, []);
            toast('Inserted to chat!');
          } catch (e) {
            debugLog('Insert to chat error', e);
            toast('Failed to insert');
          }
        });

        const btnCopyAgentOutput = document.createElement('button');
        btnCopyAgentOutput.className = 'cb-btn';
        btnCopyAgentOutput.textContent = '📋 Copy';
        btnCopyAgentOutput.addEventListener('click', async () => {
          const outputText = outputArea.textContent;
          if (!outputText || outputText === '(Agent results will appear here)') {
            toast('No output to copy');
            return;
          }

          try {
            await navigator.clipboard.writeText(outputText);
            toast('Copied to clipboard');
          } catch (e) {
            toast('Copy failed');
          }
        });

        outputControls.appendChild(btnAgentToChat);
        outputControls.appendChild(btnCopyAgentOutput);
        outputSection.appendChild(outputControls);

        agentContent.appendChild(outputSection);

        debugLog('Agent Hub rendered successfully');

      } catch (e) {
        debugLog('renderAgentHub error', e);
        if (agentContent) {
          agentContent.innerHTML = `<div style="padding:12px;color:rgba(255,100,100,0.9);">Failed to load Agent Hub: ${e.message || 'Unknown error'}</div>`;
        }
      }
    }

    // Helper: Create agent card
    function createAgentCard(name, description, icon, details, onClick) {
      const card = document.createElement('button');
      card.className = 'cb-btn';
      card.style.cssText = 'padding:14px 12px;text-align:left;height:auto;display:flex;flex-direction:column;gap:6px;background:rgba(16,24,43,0.4);border:1px solid rgba(0,180,255,0.2);transition:all 0.2s; position:relative; z-index:1;';
      card.setAttribute('type', 'button');
      card.innerHTML = `
        <div style="font-size:24px;line-height:1;">${icon}</div>
        <div style="font-weight:700;font-size:13px;">${name}</div>
        <div style="font-size:10px;opacity:0.8;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--cb-accent-primary);">${description}</div>
        <div style="font-size:11px;opacity:0.7;line-height:1.3;margin-top:2px;">${details}</div>
      `;
      card.addEventListener('mouseenter', () => {
        card.style.background = 'rgba(0,180,255,0.15)';
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = '0 4px 12px rgba(0,180,255,0.2)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.background = 'rgba(16,24,43,0.4)';
        card.style.transform = 'translateY(0)';
        card.style.boxShadow = '';
      });
      // Add debouncing to prevent multiple rapid clicks
      let isProcessing = false;
      card.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isProcessing) {
          debugLog('Agent card click ignored - already processing');
          return;
        }
        isProcessing = true;
        card.style.opacity = '0.6';
        card.style.pointerEvents = 'none';

        try {
          await onClick();
        } catch (err) {
          debugLog('Agent card onClick error:', err);
        } finally {
          setTimeout(() => {
            isProcessing = false;
            card.style.opacity = '1';
            card.style.pointerEvents = '';
          }, 500);
        }
      });
      return card;
    }

    // Show Continuum Agent Interface (combines ALL relevant conversations using RAG)
    async function showContinuumAgent() {
      const outputArea = (agentContent && agentContent.querySelector('#cb-agent-output')) || (shadow && shadow.getElementById && shadow.getElementById('cb-agent-output'));
      if (!outputArea) return;

      outputArea.innerHTML = '<div style="text-align:center;padding:20px;"><div class="cb-spinner" style="display:inline-block;"></div><div style="margin-top:12px;">Analyzing context across platforms with RAG...</div></div>';

      try {
        // Get all conversations (for fallback)
        const convs = await loadConversationsAsync();
        if (!convs || convs.length === 0) {
          outputArea.textContent = '⚠️ No previous conversations found. Scan some chats first to enable Continuum.';
          return;
        }

        // Get current platform
        const currentHost = location.hostname;
        function hostFromConv(c) {
          try {
            return (c.platform || (c.url && new URL(c.url).hostname) || '').toString() || '';
          } catch (_) { return ''; }
        }

        // Get most recent conversation to build query context
        const recentDifferent = (convs || []).find(c => hostFromConv(c) && hostFromConv(c) !== currentHost);
        const recentSame = (convs || []).find(c => hostFromConv(c) && hostFromConv(c) === currentHost) || convs[0];
        const seedConv = recentDifferent || recentSame;
        const seedTopics = seedConv.topics || [];

        // Build query from recent messages and topics
        const recentMessages = seedConv.conversation || [];
        const queryText = [
          ...seedTopics,
          ...(recentMessages.slice(-3).map(m => m.text.slice(0, 200)))
        ].join(' ');

        let relatedConvs = [];
        let usingRAG = false;

        // Try RAG-powered semantic search first with enhanced relevance filtering
        if (typeof window.RAGEngine !== 'undefined') {
          try {
            debugLog('[Continuum] Using RAG to find related conversations');
            const ragResults = await window.RAGEngine.retrieve(queryText, 12); // Get more candidates for filtering

            if (ragResults && ragResults.length > 0) {
              usingRAG = true;

              // Enhanced filtering: only keep high-relevance results
              const RELEVANCE_THRESHOLD = 0.35; // Higher threshold = more selective
              const filteredResults = ragResults.filter(r => {
                // Filter out noise, greetings, generic responses
                const text = (r.text || '').toLowerCase();
                const isNoise = /^(hi|hello|thanks|thank you|ok|okay|yes|no|sure|got it)[\s\.\!]*$/i.test(text.trim());
                const isGreeting = text.length < 50 && /greeting|introduction|welcome/i.test(text);
                const hasContent = text.length > 100; // Require substantial content

                return r.score >= RELEVANCE_THRESHOLD && !isNoise && !isGreeting && hasContent;
              });

              debugLog('[Continuum] RAG found', filteredResults.length, 'high-relevance conversations (filtered from', ragResults.length, ')');

              // Map RAG results back to full conversation objects
              relatedConvs = filteredResults.slice(0, 8).map(r => {
                const conv = convs.find(c => String(c.ts) === String(r.id));
                return conv || {
                  ts: r.id,
                  platform: r.metadata?.platform || 'unknown',
                  topics: r.metadata?.topics || [],
                  conversation: [{ role: 'assistant', text: r.text }],
                  ragScore: r.score
                };
              });
            }
          } catch (e) {
            debugLog('[Continuum] RAG search failed, falling back to topic matching:', e);
          }
        }

        // Fallback: topic-based matching if RAG not available or failed
        if (!usingRAG || relatedConvs.length === 0) {
          debugLog('[Continuum] Using topic-based fallback');
          relatedConvs = (convs || []).filter(c => {
            if (c === seedConv) return true;
            const cTopics = c.topics || [];
            return cTopics.some(t => seedTopics.includes(t));
          }).slice(0, 8);
        }

        debugLog('[Continuum] Found', relatedConvs.length, 'related conversations on topics:', seedTopics, '(RAG:', usingRAG, ')');

        // Build combined context focusing on continuity and decisions
        let combinedContext = '';
        relatedConvs.forEach((conv, idx) => {
          const host = hostFromConv(conv) || 'unknown';
          const ago = Math.round((Date.now() - (conv.ts || Date.now())) / (1000 * 60 * 60));
          const msgs = conv.conversation || [];

          // Extract decision points, questions, and substantive exchanges
          const substantiveMessages = msgs.filter(m => {
            const text = (m.text || '').toLowerCase();
            // Filter out noise and focus on content
            const hasSubstance = text.length > 80;
            const isDecision = /decided|chose|selected|going with|will use|implemented/i.test(text);
            const isQuestion = text.includes('?') || /how|why|what|when|where|should|could|would/i.test(text);
            const isConstraint = /require|must|need|constraint|limitation|cannot/i.test(text);

            return hasSubstance && (isDecision || isQuestion || isConstraint);
          });

          // Use substantive messages if available, otherwise fall back to recent
          const relevantMsgs = substantiveMessages.length > 0 ? substantiveMessages.slice(-3) : msgs.slice(-3);
          const snippet = relevantMsgs.map(m => `${m.role}: ${m.text.slice(0, 250)}`).join('\n');
          const ragScore = conv.ragScore ? ` [${(conv.ragScore * 100).toFixed(0)}% match]` : '';

          combinedContext += `\n---\nConv ${idx + 1} (${host}, ${ago}h ago${ragScore}):\n${snippet}\n`;
        });

        // Truncate if too long, but prioritize recent conversations
        if (combinedContext.length > 3500) {
          combinedContext = combinedContext.slice(0, 3500) + '\n\n...(context truncated - showing most relevant exchanges)';
        }

        // Get detail level preference
        const detailLevel = await getDetailLevel();

        const depthInstructions = {
          concise: '2-3 sentences with key insights only',
          detailed: '3-4 sentences with patterns, decisions, and unresolved questions',
          expert: '5-6 sentences with comprehensive analysis, edge cases, and technical context'
        };

        const nextStepCount = {
          concise: '1',
          detailed: '2',
          expert: '3-4'
        };

        const prompt = `You are Continuum, a context reconstruction agent. Rebuild the current conversation state from ${relatedConvs.length} conversations${usingRAG ? ' (RAG-powered semantic search)' : ''}.

**INPUT CONVERSATIONS:**
${combinedContext}

**YOUR TASK:**
Analyze the conversations and extract structured context in 6 categories. Output REAL, SPECIFIC information - NEVER use placeholders like [What the user is doing] or [Current goal].

**OUTPUT FORMAT (use exact markers):**

---UNIFIED_CONTEXT---
• Specific detail about what user is working on (real information only)
• What they are trying to accomplish right now
• Current approach or technology being used
• Any key assumptions or working hypotheses

---ACTIVE_GOALS---
• Specific goal mentioned in conversations
• Another concrete objective if present

---CURRENT_PROGRESS---
• What was actually built, written, or decided
• Concrete steps already completed
• Technologies or approaches confirmed

---UNRESOLVED_ITEMS---
• Specific question or blocker from the messages
• Missing information that's needed
• Decision point that needs resolution

---KEY_DETAILS---
• Technical constraint or requirement mentioned
• Specific tool, framework, API, or library being used
• Important limitation or boundary condition

---NEXT_ACTIONS---
• Practical next step user can take immediately
• Another actionable item based on context

**CRITICAL RULES:**
1. NEVER output placeholders like [CONVERSATION STATE], [STATE], [What user is doing], etc.
2. NEVER output empty sections - if no real data, OMIT that section entirely
3. ONLY output real, specific information from actual messages
4. Each bullet (•) MUST contain concrete details from conversations
5. Be specific - mention actual technologies, decisions, problems
6. If you cannot find real information for a section, skip it completely

**GOOD EXAMPLE:**
---UNIFIED_CONTEXT---
• User is implementing OAuth2 authentication with Google provider in Next.js 14
• Trying to decide between JWT tokens vs server-side sessions for auth state
• Currently stuck on redirect URI configuration in Google Console

**BAD EXAMPLE (DO NOT DO THIS):**
---UNIFIED_CONTEXT---
• [What the user is currently doing]
• User is working on a project
• [Current approach or direction]`;

        const res = await callLlamaAsync({ action: 'prompt', text: prompt });

        if (res && res.ok) {
          const rawOutput = res.result || '';

          // Parse structured sections from AI output
          function extractSection(text, sectionName) {
            const pattern = '---' + sectionName + '---([\\s\\S]*?)(?=---|$)';
            const regex = new RegExp(pattern, 'i');
            const match = text.match(regex);
            if (!match) return [];
            return match[1].trim().split('\n').filter(line => line.trim().startsWith('•')).map(line => line.trim().substring(1).trim());
          }

          const sections = {
            unifiedContext: extractSection(rawOutput, 'UNIFIED_CONTEXT'),
            activeGoals: extractSection(rawOutput, 'ACTIVE_GOALS'),
            currentProgress: extractSection(rawOutput, 'CURRENT_PROGRESS'),
            unresolvedItems: extractSection(rawOutput, 'UNRESOLVED_ITEMS'),
            keyDetails: extractSection(rawOutput, 'KEY_DETAILS'),
            nextActions: extractSection(rawOutput, 'NEXT_ACTIONS')
          };

          // Build compact collapsible component
          const createComponent = (title, icon, items, color, defaultCollapsed = true) => {
            if (!items || items.length === 0) return '';
            const id = 'continuum-' + title.toLowerCase().replace(/\\s+/g, '-');

            return `
              <div style="background:var(--cb-surface);border:1px solid var(--cb-border);border-radius:4px;margin-bottom:4px;overflow:hidden;">
                <div id="${id}-header" style="display:flex;align-items:center;gap:6px;padding:6px 8px;cursor:pointer;user-select:none;border-left:2px solid ${color};transition:background 0.15s;" 
                     onmouseover="this.style.background='var(--cb-bg)'" 
                     onmouseout="this.style.background='transparent'">
                  <span id="${id}-toggle" style="font-size:9px;color:var(--cb-subtext);width:10px;">${defaultCollapsed ? '▶' : '▼'}</span>
                  <span style="font-size:12px;line-height:1;">${icon}</span>
                  <h4 style="margin:0;color:var(--cb-white);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;flex:1;">${title}</h4>
                  <span style="font-size:8px;color:var(--cb-subtext);background:var(--cb-bg);padding:1px 5px;border-radius:8px;">${items.length}</span>
                </div>
                <div id="${id}-content" style="display:${defaultCollapsed ? 'none' : 'block'};padding:4px 8px 6px 24px;border-left:2px solid ${color};">
                  ${items.map(item => `
                    <div style="font-size:10px;color:var(--cb-subtext);line-height:1.5;padding:3px 0 3px 10px;position:relative;margin-bottom:1px;">
                      <span style="position:absolute;left:0;top:7px;width:4px;height:4px;background:${color};border-radius:50%;opacity:0.7;"></span>
                      ${item}
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          };

          // Render beautiful structured UI
          outputArea.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:0;max-height:calc(100vh - 160px);overflow-y:auto;padding-right:6px;">
              ${createComponent('Context', '🔗', sections.unifiedContext, 'var(--cb-accent-primary)', true)}
              ${createComponent('Goals', '🎯', sections.activeGoals, 'var(--cb-accent-tertiary)', true)}
              ${createComponent('Progress', '✅', sections.currentProgress, 'var(--cb-success)', true)}
              ${createComponent('Unresolved', '⚠️', sections.unresolvedItems, 'var(--cb-warning)', true)}
              ${createComponent('Key Details', '🔑', sections.keyDetails, 'var(--cb-accent-secondary)', true)}
              ${createComponent('Next Actions', '➡️', sections.nextActions, 'var(--cb-accent-primary)', true)}
              
              <div style="background:var(--cb-bg);border:1px solid var(--cb-border);border-radius:4px;margin-top:8px;padding:8px;position:sticky;bottom:0;box-shadow:0 -2px 8px rgba(0,0,0,0.1);">
                <div style="display:flex;gap:6px;margin-bottom:6px;">
                  <button id="continuum-continue" class="cb-btn cb-btn-primary" style="font-size:10px;padding:6px 12px;flex:1;font-weight:500;">💬 Continue</button>
                  <button id="continuum-refresh" class="cb-btn" style="font-size:10px;padding:6px 12px;flex:1;font-weight:500;">🔄 Refresh</button>
                </div>
                <div style="display:flex;gap:4px;justify-content:center;">
                  <button id="continuum-review" class="cb-btn" style="font-size:9px;padding:4px 8px;background:transparent;border:1px solid var(--cb-border);">🔍 Review</button>
                  <button id="continuum-copy" class="cb-btn" style="font-size:9px;padding:4px 8px;background:transparent;border:1px solid var(--cb-border);">📋 Copy</button>
                </div>
                <div style="font-size:8px;color:var(--cb-subtext);margin-top:6px;text-align:center;opacity:0.7;">📊 ${relatedConvs.length} conversations • ${new Set(relatedConvs.map(c => hostFromConv(c))).size} platforms${usingRAG ? ' • RAG' : ''}</div>
              </div>
            </div>`;

          // Setup click handlers for dropdowns after rendering
          setTimeout(() => {
            ['context', 'goals', 'progress', 'unresolved', 'key-details', 'next-actions'].forEach(section => {
              const header = document.getElementById('continuum-' + section + '-header');
              const content = document.getElementById('continuum-' + section + '-content');
              const toggle = document.getElementById('continuum-' + section + '-toggle');

              if (header && content && toggle) {
                header.onclick = () => {
                  const isCollapsed = content.style.display === 'none';
                  content.style.display = isCollapsed ? 'block' : 'none';
                  toggle.textContent = isCollapsed ? '▼' : '▶';
                };
              }
            });
          }, 100);

          // Store context state
          continuumContextState = {
            unifiedContext: sections.unifiedContext,
            activeGoals: sections.activeGoals,
            currentProgress: sections.currentProgress,
            unresolvedItems: sections.unresolvedItems,
            keyDetails: sections.keyDetails,
            nextActions: sections.nextActions,
            lastUpdate: Date.now(),
            messageHistory: []
          };

          // Auto-scroll
          setTimeout(() => {
            outputArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);

          // Build context block helper
          const buildContextBlock = () => {
            let block = '[CONVERSATION STATE - Generated by Continuum]\\n\\n';
            if (sections.unifiedContext.length > 0) {
              block += '🔗 CONTEXT:\\n' + sections.unifiedContext.map(i => `• ${i}`).join('\\n') + '\\n\\n';
            }
            if (sections.activeGoals.length > 0) {
              block += '🎯 GOALS:\\n' + sections.activeGoals.map(i => `• ${i}`).join('\\n') + '\\n\\n';
            }
            if (sections.currentProgress.length > 0) {
              block += '✅ PROGRESS:\\n' + sections.currentProgress.map(i => `• ${i}`).join('\\n') + '\\n\\n';
            }
            if (sections.unresolvedItems.length > 0) {
              block += '⚠️ UNRESOLVED:\\n' + sections.unresolvedItems.map(i => `• ${i}`).join('\\n') + '\\n\\n';
            }
            if (sections.keyDetails.length > 0) {
              block += '🔑 KEY DETAILS:\\n' + sections.keyDetails.map(i => `• ${i}`).join('\\n') + '\\n\\n';
            }
            if (sections.nextActions && sections.nextActions.length > 0) {
              block += '➡️ NEXT:\\n' + sections.nextActions.map(i => `• ${i}`).join('\\n') + '\\n';
            }
            return block;
          };

          // Button event listeners
          const btnCont = outputArea.querySelector('#continuum-continue');
          const btnRev = outputArea.querySelector('#continuum-review');
          const btnRefresh = outputArea.querySelector('#continuum-refresh');
          const btnCopy = outputArea.querySelector('#continuum-copy');

          btnCont && btnCont.addEventListener('click', async () => {
            try {
              await restoreToChat(`Please continue from where we left off. Here is the working state:\\n\\n${buildContextBlock()}`, []);
              toast('Context inserted to chat');
            } catch (e) { toast('Insert failed'); }
          });

          btnRev && btnRev.addEventListener('click', async () => {
            try {
              await restoreToChat(`Before continuing, review this context and confirm your understanding:\\n\\n${buildContextBlock()}`, []);
              toast('Review request inserted');
            } catch (e) { toast('Insert failed'); }
          });

          btnCopy && btnCopy.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(buildContextBlock());
              toast('Context copied to clipboard!');
            } catch (e) { toast('Copy failed'); }
          });

          btnRefresh && btnRefresh.addEventListener('click', async () => {
            showContinuumAgent(); // Re-run the whole analysis
          });

          toast('Context bridge ready!');
        } else {
          outputArea.textContent = `❌ Failed to reconstruct context: ${res && res.error ? res.error : 'unknown error'}`;
        }
      } catch (e) {
        outputArea.textContent = `❌ Continuum error: ${e.message || 'Unknown error'}`;
        debugLog('Continuum error', e);
      }
    }

    // Show Memory Architect Interface (end-user actionable with RAG stats)
    async function showMemoryArchitect() {
      const outputArea = (agentContent && agentContent.querySelector('#cb-agent-output')) || (shadow && shadow.getElementById && shadow.getElementById('cb-agent-output'));
      if (!outputArea) return;

      outputArea.innerHTML = '<div style="text-align:center;padding:20px;"><div class="cb-spinner" style="display:inline-block;"></div><div style="margin-top:12px;">Building knowledge map with RAG...</div></div>';

      try {
        const convs = await loadConversationsAsync();
        if (!convs || convs.length === 0) {
          outputArea.textContent = '⚠️ No conversations to organize. Scan some chats first.';
          return;
        }

        // Get RAG stats if available
        let ragStats = null;
        if (typeof window.RAGEngine !== 'undefined') {
          try {
            ragStats = await window.RAGEngine.getStats();
            debugLog('[Memory Architect] RAG stats:', ragStats);
          } catch (e) {
            debugLog('[Memory Architect] Failed to get RAG stats:', e);
          }
        }

        // Analyze and categorize conversations
        const domainMap = {};
        const timeline = [];

        for (const conv of convs.slice(0, 20)) { // Limit to recent 20
          const topics = conv.topics || [];
          const date = new Date(conv.ts).toLocaleDateString();

          topics.forEach(topic => {
            if (!domainMap[topic]) domainMap[topic] = [];
            domainMap[topic].push({
              date,
              platform: conv.platform || 'unknown',
              preview: (conv.conversation && conv.conversation[0] && conv.conversation[0].text.slice(0, 80)) || '...'
            });
          });

          timeline.push({
            date,
            topics: topics.slice(0, 3),
            platform: conv.platform
          });
        }

        // Phase 3: Get theme clusters
        let themeClusters = [];
        if (typeof window.MCPBridge !== 'undefined') {
          try {
            const themeResponse = await window.MCPBridge.getThemes(0.7);
            themeClusters = themeResponse.clusters || [];
            debugLog('[Memory Architect] Theme clusters:', themeClusters);
          } catch (e) {
            debugLog('[Memory Architect] Failed to get theme clusters:', e);
          }
        }

        // Get detail level preference
        const detailLevel = await getDetailLevel();

        // Build knowledge report (Phase 3: content-focused, adaptive depth)
        const domains = Object.keys(domainMap).sort((a, b) => domainMap[b].length - domainMap[a].length);
        let topDomain = domains[0] || 'General';
        const focusTheme = (window.__CB_FOCUS_THEME || '').trim();
        if (focusTheme) {
          topDomain = focusTheme;
          if (!domains.includes(focusTheme)) domains.unshift(focusTheme);
        }
        const total = convs.length;
        const range = `${timeline[timeline.length - 1]?.date || ''} - ${timeline[0]?.date || ''}`;

        const maxClusters = { concise: 3, detailed: 5, expert: 8 }[detailLevel];
        const maxConvs = { concise: 3, detailed: 5, expert: 10 }[detailLevel];
        const contentLength = { concise: 80, detailed: 120, expert: 200 }[detailLevel];

        // Build user-friendly conversation list and topic compiler
        let outputHtml = '<div style="display:flex;flex-direction:column;gap:12px;">';
        outputHtml += '<div id="memory-detail-container"></div>';
        outputHtml += `
          <div style="display:flex;gap:8px;align-items:center;padding:8px 0;">
            <input id="memory-topic-input" class="cb-input" placeholder="Project/topic (e.g., onboarding portal)" style="flex:1;padding:8px;border-radius:6px;border:1px solid rgba(0,180,255,0.25);background:rgba(16,24,43,0.5);color:#E6E9F0;" />
            <button id="memory-compile" class="cb-btn cb-btn-primary">Compile Context</button>
          </div>
          <div id="memory-compiled" style="display:none;margin-top:8px;background:rgba(16,24,43,0.5);border:1px solid rgba(0,180,255,0.2);border-radius:8px;">
            <div style="padding:10px 12px;border-bottom:1px solid rgba(0,180,255,0.15);font-weight:600;">📚 Compiled Project Context</div>
            <div id="memory-compiled-body" style="white-space:pre-wrap;line-height:1.5;padding:12px;font-size:12px;"></div>
            <div style="display:flex;gap:8px;border-top:1px solid rgba(0,180,255,0.15);padding:10px 12px;">
              <button id="memory-copy" class="cb-btn cb-btn-primary" style="flex:1;">📋 Copy Context</button>
              <button id="memory-insert" class="cb-btn" style="flex:1;">➤ Insert to Chat</button>
            </div>
          </div>
        `;

        // Header with simple stats
        outputHtml += `<div style="font-weight:700;font-size:14px;margin-bottom:4px;">💬 Your Recent Conversations (${total})</div>`;
        if (focusTheme) {
          outputHtml += `<div style="font-size:11px;opacity:0.8;margin-bottom:8px;">Focusing on: <strong>${focusTheme}</strong></div>`;
        }

        // Show conversations as clickable cards
        convs.slice(0, maxConvs).forEach((conv, idx) => {
          const date = new Date(conv.ts).toLocaleDateString();
          const time = new Date(conv.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const platform = conv.platform || 'unknown';
          const firstMsg = conv.conversation?.find(m => m.role === 'user');
          const content = firstMsg ? firstMsg.text.slice(0, contentLength) : 'No preview available';
          const topics = (conv.topics || []).slice(0, 3).join(', ') || 'General';

          outputHtml += `
            <div style="background:rgba(16,24,43,0.5);border:1px solid rgba(0,180,255,0.2);border-radius:8px;padding:12px;">
              <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
                <div style="font-weight:600;color:var(--cb-accent-primary);font-size:12px;">${platform}</div>
                <div style="font-size:10px;opacity:0.7;">${date} • ${time}</div>
              </div>
              <div style="font-size:12px;line-height:1.5;margin-bottom:8px;opacity:0.9;">"${content}..."</div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="font-size:10px;opacity:0.7;">Topics: ${topics}</div>
                <button class="cb-btn memory-continue-btn" data-conv-idx="${idx}" style="font-size:10px;padding:4px 8px;">Continue Here</button>
              </div>
            </div>
          `;
        });

        outputHtml += '</div>';

        outputArea.innerHTML = outputHtml;

        // Add detail level toggle
        createDetailLevelToggle('memory-detail-container', async (newLevel) => {
          showMemoryArchitect();
        });

        // Seed topic input with focus or top domain
        const topicInput = outputArea.querySelector('#memory-topic-input');
        if (topicInput) topicInput.value = (focusTheme || topDomain || '').toString();

        // Compile Context handler
        const compileBtn = outputArea.querySelector('#memory-compile');
        const compiledBox = outputArea.querySelector('#memory-compiled');
        const compiledBody = outputArea.querySelector('#memory-compiled-body');
        const copyBtn = outputArea.querySelector('#memory-copy');
        const insertBtn = outputArea.querySelector('#memory-insert');

        function compileContextForTopic(topic) {
          try {
            const q = (topic || '').trim().toLowerCase();
            if (!q) return '';
            // Collect all messages across conversations that mention the topic
            const hits = [];
            convs.forEach(conv => {
              const ts = conv.ts || Date.now();
              const date = new Date(ts).toLocaleString();
              (conv.conversation || []).forEach((m, idx) => {
                const t = (m.text || '');
                if (!t) return;
                if ((conv.topics || []).some(tp => String(tp).toLowerCase().includes(q)) || t.toLowerCase().includes(q)) {
                  hits.push({ ts, date, role: m.role, text: t.slice(0, 800), platform: conv.platform || 'unknown' });
                }
              });
            });
            if (!hits.length) return '';
            hits.sort((a, b) => a.ts - b.ts);
            let out = `Project/Topic: ${topic}\nTotal mentions: ${hits.length}\n\n`;
            hits.forEach((h, i) => {
              out += `#${i + 1} • ${h.date} • ${h.platform} • ${h.role}\n${h.text}\n\n`;
            });
            out += '---\nContinue from here with the consolidated context above.';
            return out;
          } catch (_) { return ''; }
        }

        if (compileBtn && compiledBox && compiledBody && copyBtn && insertBtn) {
          compileBtn.addEventListener('click', () => {
            try {
              const topic = topicInput ? topicInput.value : '';
              const ctx = compileContextForTopic(topic);
              if (ctx) {
                compiledBody.textContent = ctx; compiledBox.style.display = 'block';
              } else {
                compiledBody.textContent = '(No mentions found across your chats)'; compiledBox.style.display = 'block';
              }
            } catch (_) { }
          });
          copyBtn.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(compiledBody.textContent || ''); copyBtn.textContent = '✓ Copied'; setTimeout(() => copyBtn.textContent = '📋 Copy Context', 2000); } catch (_) { }
          });
          insertBtn.addEventListener('click', async () => {
            try { const t = compiledBody.textContent || ''; if (window.ChatBridge && typeof window.ChatBridge.restoreToChat === 'function') { await window.ChatBridge.restoreToChat(t, []); } insertBtn.textContent = '✓ Inserted'; setTimeout(() => insertBtn.textContent = '➤ Insert to Chat', 2000); } catch (_) { }
          });
        }

        // Wire up continue buttons
        const continueButtons = outputArea.querySelectorAll('.memory-continue-btn');
        continueButtons.forEach(btn => {
          btn.addEventListener('click', async () => {
            const idx = parseInt(btn.dataset.convIdx);
            const conv = convs[idx];
            if (!conv) return;

            const firstMsg = conv.conversation?.find(m => m.role === 'user');
            const preview = firstMsg ? firstMsg.text.slice(0, 150) : '';
            const platform = conv.platform || 'unknown';
            const topics = (conv.topics || []).join(', ') || 'General';

            const contextPrompt = `I want to continue from my previous conversation on ${platform} about: ${topics}.\n\nI was discussing: "${preview}..."\n\nCan you help me pick up where I left off and provide the next steps?`;

            try {
              await restoreToChat(contextPrompt, []);
              toast('Context inserted!');
            } catch (e) {
              toast('Insert failed');
              debugLog('[Memory Architect] Continue failed:', e);
            }
          });
        });

        toast('Knowledge base indexed!');

      } catch (e) {
        outputArea.textContent = `❌ Memory Architect error: ${e.message || 'Unknown error'}`;
        debugLog('Memory Architect error', e);
      }
    }

    // Show EchoSynth Interface (ensure shadow-scoped bindings)
    async function showEchoSynth() {
      const outputArea = (agentContent && agentContent.querySelector('#cb-agent-output')) || (shadow && shadow.getElementById && shadow.getElementById('cb-agent-output'));
      if (!outputArea) return;

      // Show input UI for EchoSynth
      outputArea.innerHTML = `
        <div id="echosynth-detail-container"></div>
        <div style="margin-bottom:12px;">
          <div style="font-weight:600;margin-bottom:8px;font-size:13px;">⚡ EchoSynth - Multi-AI Query</div>
          <div style="font-size:11px;opacity:0.8;margin-bottom:12px;">Ask one question, get synthesized answer from multiple AIs with adaptive depth and tone</div>
          <div id="echosynth-tone" style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
            <span style="font-size:11px;opacity:0.8;">Tone:</span>
            <button class="cb-btn cb-btn-sm" data-tone="analytical">Analytical</button>
            <button class="cb-btn cb-btn-sm" data-tone="narrative">Narrative</button>
            <button class="cb-btn cb-btn-sm" data-tone="structured">Structured</button>
            <span id="tone-preview" style="font-size:11px;opacity:0.75;margin-left:auto;">Preview: auto</span>
          </div>
          <textarea id="echosynth-prompt" placeholder="Enter your question..." style="width:100%;min-height:80px;padding:10px;background:rgba(10,15,28,0.6);border:1px solid rgba(0,180,255,0.3);border-radius:8px;color:#E6E9F0;font-size:13px;resize:vertical;font-family:inherit;"></textarea>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <button id="echosynth-run" class="cb-btn cb-btn-primary" style="flex:1;">▶ Run EchoSynth</button>
            <button id="echosynth-cancel" class="cb-btn">Cancel</button>
          </div>
        </div>
        <div id="echosynth-results" style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(0,180,255,0.2);display:none;"></div>
      `;

      // Add detail level toggle
      createDetailLevelToggle('echosynth-detail-container', (level) => {
        debugLog('[EchoSynth] Detail level changed to:', level);
      });

      const promptInput = outputArea.querySelector('#echosynth-prompt');
      const runBtn = outputArea.querySelector('#echosynth-run');
      const cancelBtn = outputArea.querySelector('#echosynth-cancel');
      const resultsDiv = outputArea.querySelector('#echosynth-results');
      const toneBar = outputArea.querySelector('#echosynth-tone');
      const toneButtons = toneBar.querySelectorAll('button[data-tone]');
      const tonePreview = toneBar.querySelector('#tone-preview');

      // Tone detection heuristics
      const inferTone = (text) => {
        const s = (text || '').toLowerCase();
        if (/(implement|api|bug|error|stack|code|optimiz|complexity|latency|schema)/.test(s)) return 'analytical';
        if (/(story|creative|metaphor|vision|inspire|narrative|analogy)/.test(s)) return 'narrative';
        if (/(plan|roadmap|steps|milestone|timeline|prioritize|OKR|bullet)/.test(s)) return 'structured';
        return 'structured';
      };
      let selectedTone = 'auto';
      toneButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          selectedTone = btn.dataset.tone;
          toneButtons.forEach(b => b.classList.remove('cb-btn-primary'));
          btn.classList.add('cb-btn-primary');
          tonePreview.textContent = `Preview: ${selectedTone}`;
        });
      });

      cancelBtn.addEventListener('click', () => {
        outputArea.textContent = '(Agent results will appear here)';
      });

      runBtn.addEventListener('click', async () => {
        const userPrompt = promptInput.value.trim();
        if (!userPrompt) {
          toast('Enter a question first');
          return;
        }

        runBtn.disabled = true;
        runBtn.textContent = 'Processing...';
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = '<div style="text-align:center;padding:12px;"><div class="cb-spinner" style="display:inline-block;"></div><div style="margin-top:8px;font-size:12px;">Analyzing query...</div></div>';

        try {
          // ═══ ENHANCEMENT 1: Sub-Question Decomposer ═══
          // Detect multi-part questions using lightweight rule-based logic
          const hasMultiPart = /\band\b.*\?|\bor\b.*\?|,.*\?/.test(userPrompt) ||
            (userPrompt.match(/\?/g) || []).length > 1;
          const subQuestions = hasMultiPart ?
            userPrompt.split(/\?/).filter(q => q.trim().length > 10).map(q => q.trim() + '?').slice(0, 3) :
            [userPrompt];

          if (subQuestions.length > 1) {
            resultsDiv.innerHTML += `<div style="font-size:11px;opacity:0.7;">Detected ${subQuestions.length} sub-questions...</div>`;
          }

          // ═══ ENHANCEMENT 2: Intent Clarifier ═══
          // Optional lightweight query clarification (<20 tokens)
          let clarifiedPrompt = userPrompt;
          if (userPrompt.length > 100 || /\b(basically|kind of|like|sort of)\b/i.test(userPrompt)) {
            resultsDiv.innerHTML = '<div style="text-align:center;padding:12px;"><div class="cb-spinner" style="display:inline-block;"></div><div style="margin-top:8px;font-size:12px;">Clarifying intent...</div></div>';
            const clarifyPrompt = `Rewrite as clear instruction (<15 words): "${userPrompt.slice(0, 200)}"`;
            const clarifyRes = await callLlamaAsync({ action: 'prompt', text: clarifyPrompt });
            if (clarifyRes?.ok && clarifyRes.result && clarifyRes.result.length < userPrompt.length) {
              clarifiedPrompt = clarifyRes.result.trim().replace(/^["']|["']$/g, '');
              debugLog('[EchoSynth] Intent clarified:', clarifiedPrompt);
            }
          }

          resultsDiv.innerHTML = '<div style="text-align:center;padding:12px;"><div class="cb-spinner" style="display:inline-block;"></div><div style="margin-top:8px;font-size:12px;">Retrieving context via RAG, then querying AIs...</div></div>';

          // Retrieve relevant context from past conversations using RAG
          let ragContext = '';
          let ragResultCount = 0;
          if (typeof window.RAGEngine !== 'undefined') {
            try {
              const ragResults = await window.RAGEngine.retrieve(clarifiedPrompt, 3);
              if (ragResults && ragResults.length > 0) {
                ragResultCount = ragResults.length;
                ragContext = '\n\n[Relevant context from past conversations:]\n' +
                  ragResults.map((r, i) => `${i + 1}. ${r.text.slice(0, 200)}... (relevance: ${(r.score * 100).toFixed(0)}%)`).join('\n');
                debugLog('[EchoSynth] Retrieved RAG context:', ragResults);
              }
            } catch (e) {
              debugLog('[EchoSynth] RAG retrieval failed:', e);
            }
          }

          // Enhance prompt with RAG context if available
          const enhancedPrompt = ragContext ? clarifiedPrompt + ragContext : clarifiedPrompt;
          const tone = selectedTone === 'auto' ? inferTone(userPrompt) : selectedTone;
          tonePreview.textContent = `Preview: ${tone}`;

          // Query both Gemini and ChatGPT in parallel for true multi-AI synthesis
          const llamaPromise = callLlamaAsync({ action: 'prompt', text: enhancedPrompt }).catch(e => ({ ok: false, error: e.message }));
          const openaiPromise = callOpenAIAsync({ text: enhancedPrompt }).catch(e => ({ ok: false, error: e.message }));

          const [llamaRes, openaiRes] = await Promise.all([llamaPromise, openaiPromise]);

          // ═══ ENHANCEMENT 3: Ramble Filter ═══
          // Clean up AI responses locally before synthesis
          const cleanResponse = (text) => {
            if (!text) return '';
            return text
              .replace(/^(As an AI|As a language model|I'm an AI|I don't have|I cannot|I can't actually).*?[\.\n]/gmi, '')
              .replace(/\n{3,}/g, '\n\n') // Remove excessive newlines
              .replace(/^[\s\n]+|[\s\n]+$/g, '') // Trim whitespace
              .replace(/(.+)\n\1/g, '$1') // Remove duplicate consecutive lines
              .slice(0, 8000); // Reasonable length limit
          };

          // Collect successful responses with ramble filtering
          const responses = [];
          if (llamaRes && llamaRes.ok && llamaRes.result) {
            const modelName = 'Llama 3.1';
            const cleaned = cleanResponse(llamaRes.result);
            responses.push({
              source: modelName,
              answer: cleaned,
              raw: llamaRes.result
            });
          }
          if (openaiRes && openaiRes.ok && openaiRes.result) {
            const cleaned = cleanResponse(openaiRes.result);
            responses.push({
              source: 'ChatGPT (GPT-4o-mini)',
              answer: cleaned,
              raw: openaiRes.result
            });
          }

          if (responses.length === 0) {
            resultsDiv.innerHTML = `<div style="color:rgba(255,100,100,0.9);">❌ Both AI models failed to respond. Check API keys and try again.</div>`;
            return;
          }

          // ═══ ENHANCEMENT 4: Referee Mode ═══
          // Compare AI responses locally without re-querying
          let refereeAnalysis = '';
          if (responses.length > 1) {
            const text1 = responses[0].answer.toLowerCase();
            const text2 = responses[1].answer.toLowerCase();

            // Find shared claims (simple overlap detection)
            const sentences1 = text1.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 30);
            const sentences2 = text2.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 30);

            const agreements = sentences1.filter(s1 =>
              sentences2.some(s2 => {
                const words1 = s1.split(/\s+/).filter(w => w.length > 4);
                const words2 = s2.split(/\s+/).filter(w => w.length > 4);
                const overlap = words1.filter(w => words2.includes(w)).length;
                return overlap / Math.max(words1.length, words2.length) > 0.4;
              })
            );

            // Detect contradictions (opposite sentiments on same topic)
            const contradictions = [];
            const polarWords = {
              positive: ['yes', 'true', 'correct', 'better', 'should', 'recommended'],
              negative: ['no', 'false', 'incorrect', 'worse', 'shouldn\'t', 'not recommended']
            };

            sentences1.forEach(s1 => {
              sentences2.forEach(s2 => {
                const hasPos1 = polarWords.positive.some(w => s1.includes(w));
                const hasNeg1 = polarWords.negative.some(w => s1.includes(w));
                const hasPos2 = polarWords.positive.some(w => s2.includes(w));
                const hasNeg2 = polarWords.negative.some(w => s2.includes(w));

                if ((hasPos1 && hasNeg2) || (hasNeg1 && hasPos2)) {
                  contradictions.push({ sent1: s1.slice(0, 100), sent2: s2.slice(0, 100) });
                }
              });
            });

            refereeAnalysis = `
              <div style="margin:12px 0;padding:8px;background:rgba(138,43,226,0.08);border:1px solid rgba(138,43,226,0.25);border-radius:6px;font-size:11px;">
                <b>🔍 Referee Analysis:</b><br/>
                ✓ Agreements: ${agreements.length} shared claims<br/>
                ${contradictions.length > 0 ? `⚠️ Contradictions: ${contradictions.length} conflicting views<br/>` : ''}
                ${contradictions.length > 0 ? `<div style="opacity:0.8;margin-top:4px;">Note: Synthesis will prioritize more specific and well-reasoned claims.</div>` : ''}
              </div>
            `;
          }

          // Phase 3: Multi-stage generation pipeline
          const detailLevel = await getDetailLevel(); // Get from user preference
          let finalAnswer = '';

          if (responses.length > 1) {
            // Stage 1: Create outline
            resultsDiv.innerHTML += '<div style="font-size:11px;opacity:0.7;margin-top:8px;">Stage 1/3: Outlining key points...</div>';
            const outlinePrompt = `Analyze these two AI responses and create a brief outline (3-5 bullet points) of key points to cover:

Question: ${userPrompt}

Gemini: ${responses[0].answer.slice(0, 500)}...
ChatGPT: ${responses[1]?.answer?.slice(0, 500) || 'N/A'}...

Outline (bullet points only):`;

            const outlineRes = await callLlamaAsync({ action: 'prompt', text: outlinePrompt });
            const outline = outlineRes?.result || '• Main points\n• Key insights\n• Conclusion';

            // Stage 2: Expand with context
            resultsDiv.innerHTML += '<div style="font-size:11px;opacity:0.7;">Stage 2/3: Expanding with retrieved context...</div>';

            const depthInstructions = {
              concise: 'brief and to-the-point (2-3 paragraphs maximum)',
              detailed: 'comprehensive with examples and explanations',
              expert: 'highly technical with implementation details, edge cases, and best practices'
            };

            const toneInstructions = {
              analytical: `Technical Excellence Guidelines:
- Lead with core concepts and definitions
- Include code snippets, algorithms, or pseudo-code where relevant
- Explain time/space complexity for algorithms
- Call out edge cases, gotchas, and common pitfalls
- Reference specific technologies, versions, and APIs
- Use precise terminology (avoid vague words like "better" without metrics)
- Include performance considerations and trade-offs`,
              narrative: `Storytelling Excellence Guidelines:
- Open with a relatable scenario or metaphor
- Use analogies to explain complex concepts
- Build a narrative arc (setup → challenge → resolution)
- Include real-world examples or case studies
- Make abstract ideas concrete and visual
- End with key takeaways or actionable insights
- Keep the reader engaged with conversational flow`,
              structured: `Clarity & Organization Guidelines:
- Use clear section headings (##) and subheadings (###)
- Lead with an executive summary or TL;DR
- Break down into numbered steps or bullet points
- Prioritize information (most important first)
- Use tables or lists for comparisons
- Include a "Next Steps" or "Action Items" section
- Keep paragraphs short (2-4 sentences max)`
            };
            const expandPrompt = `You are EchoSynth, an elite AI synthesis engine that combines insights from multiple AI models into superior outputs.

**Your Mission**: Create a ${depthInstructions[detailLevel]} answer that synthesizes the best of both AI responses while adding your own expert insights.

**Tone**: ${tone}
${toneInstructions[tone]}

**Quality Standards**:
✓ Accuracy: Verify facts and correct any errors
✓ Completeness: Address all aspects of the question
✓ Clarity: Use clear language and logical structure
✓ Actionability: Include practical next steps when relevant
✓ Sources: Integrate insights from both models seamlessly

**Available Insights**:

📋 **Outline** (Key Points to Cover):
${outline}

🧠 **Retrieved Context** (From Past Conversations):
${ragContext || 'No additional context available'}

🤖 **Gemini's Perspective**:
${responses[0].answer}

💡 **ChatGPT's Perspective**:
${responses[1]?.answer || 'Not available'}

**Your Task**: Synthesize these perspectives into a unified, superior answer. Don't just merge—enhance. Add examples, clarify ambiguities, correct errors, and structure for maximum impact.

**Output Format**: Use Markdown formatting with:
- ## Section headings for major topics
- ### Subheadings for subtopics
- **Bold** for key terms
- \`code\` for technical references
- > Blockquotes for important notes
- Bullet points and numbered lists for clarity

**Depth Level**: ${detailLevel}
**Tone**: ${tone}

---

**Begin Your Synthesized Answer**:`;


            const expandRes = await callLlamaAsync({ action: 'prompt', text: expandPrompt });
            const expanded = expandRes?.result || responses.map(r => `**${r.source}:**\n${r.answer}`).join('\n\n---\n\n');

            // Stage 3: Refine and structure
            resultsDiv.innerHTML += '<div style="font-size:11px;opacity:0.7;">Stage 3/3: Refining final output...</div>';
            const refinePrompt = `Polish this answer for clarity and structure. Maintain the ${tone} tone. Add section headings, ensure logical flow, and highlight key takeaways:

${expanded}

Refined Answer (final, polished):`;

            const refineRes = await callLlamaAsync({ action: 'prompt', text: refinePrompt });
            finalAnswer = refineRes?.result || expanded;

          } else {
            // Only one response - still apply multi-stage enhancement
            resultsDiv.innerHTML += '<div style="font-size:11px;opacity:0.7;">Enhancing single response...</div>';
            const enhancePrompt = `Enhance this answer with additional context and structure:

Original: ${responses[0].answer}
RAG Context: ${ragContext}

Enhanced Answer:`;
            const enhanceRes = await callLlamaAsync({ action: 'prompt', text: enhancePrompt });
            finalAnswer = enhanceRes?.result || responses[0].answer;
          }

          // ═══ ENHANCEMENT 5: Follow-Up Suggestions ═══
          // Generate 1-3 follow-up suggestions locally (no AI calls)
          const generateFollowUps = (question, answer) => {
            const suggestions = [];
            const lowerQ = question.toLowerCase();
            const lowerA = answer.toLowerCase();

            // Detect domain and suggest relevant follow-ups
            if (/\b(how|implement|build|create)\b/.test(lowerQ)) {
              if (lowerA.includes('error') || lowerA.includes('issue')) {
                suggestions.push('How can I debug common errors in this implementation?');
              }
              if (lowerA.includes('performance') || lowerA.includes('optimize')) {
                suggestions.push('What are the performance considerations?');
              }
              suggestions.push('What are best practices for this approach?');
            } else if (/\b(what|explain|understand)\b/.test(lowerQ)) {
              suggestions.push('Can you provide a practical example?');
              if (lowerA.includes('vs') || lowerA.includes('compared')) {
                suggestions.push('Which option should I choose for my use case?');
              }
            } else if (/\b(why|reason)\b/.test(lowerQ)) {
              suggestions.push('What are alternative approaches?');
            }

            return suggestions.slice(0, 3);
          };

          const followUps = generateFollowUps(userPrompt, finalAnswer);
          const followUpHtml = followUps.length > 0 ? `
            <div style="margin-top:12px;padding:8px;background:rgba(0,180,255,0.05);border:1px solid rgba(0,180,255,0.2);border-radius:6px;">
              <div style="font-size:11px;font-weight:600;margin-bottom:6px;opacity:0.9;">💡 Suggested Follow-Ups:</div>
              ${followUps.map((q, i) => `<button class="cb-btn cb-followup" data-question="${q}" style="display:block;width:100%;text-align:left;margin:4px 0;padding:6px 8px;font-size:11px;">${i + 1}. ${q}</button>`).join('')}
            </div>
          ` : '';

          resultsDiv.innerHTML = `
            ${refereeAnalysis}
            <div style="font-weight:700;margin-bottom:8px;color:var(--cb-accent-primary);">✨ Synthesized Answer ${ragResultCount > 0 ? '🔍 (RAG-Enhanced)' : ''}</div>
            <div style="white-space:pre-wrap;line-height:1.6;">${finalAnswer || 'No result'}</div>
            <div style="margin-top:12px;padding:8px;background:rgba(0,180,255,0.1);border-radius:6px;font-size:11px;">
              <strong>Sources:</strong> ${responses.map(r => r.source).join(' + ')}${ragResultCount > 0 ? ` + ${ragResultCount} past conversations (RAG)` : ''} • Synthesized at ${new Date().toLocaleTimeString()}
            </div>
            ${followUpHtml}
          `;

          // Attach follow-up button handlers
          const followUpButtons = resultsDiv.querySelectorAll('.cb-followup');
          followUpButtons.forEach(btn => {
            btn.addEventListener('click', () => {
              promptInput.value = btn.dataset.question;
              toast('Follow-up loaded - click Run');
            });
          });
          try { if (window.RAGEngine && window.RAGEngine.incrementMetric) window.RAGEngine.incrementMetric('totalSynthesisSessions', 1); } catch (_) { }
          toast('Multi-AI synthesis complete!');
        } catch (e) {
          resultsDiv.innerHTML = `<div style="color:rgba(255,100,100,0.9);">❌ Error: ${e.message || 'Unknown error'}</div>`;
          debugLog('EchoSynth error', e);
        } finally {
          runBtn.disabled = false;
          runBtn.textContent = '▶ Run EchoSynth';
        }
      });
    }

    // Show Quick Agent Interface (original simple agent, lightly polished UI)
    async function showQuickAgent() {
      const outputArea = (agentContent && agentContent.querySelector('#cb-agent-output')) || (shadow && shadow.getElementById && shadow.getElementById('cb-agent-output'));
      if (!outputArea) return;

      outputArea.innerHTML = `
        <div style="margin-bottom:12px;">
          <div style="font-weight:700;margin-bottom:4px;font-size:13px;">🎯 Quick Agent</div>
          <div style="font-size:11px;opacity:0.85;margin-bottom:12px;">Analyze the current conversation and suggest next actions</div>
          <select id="quick-agent-goal" class="cb-select" style="width:100%;margin-bottom:8px;">
            <option value="Improve answer">Improve answer quality</option>
            <option value="Extract tasks">Extract action items</option>
            <option value="Generate follow-ups">Generate follow-up questions</option>
            <option value="Summarize executive">Executive summary</option>
            <option value="Debug plan">Debug & troubleshoot</option>
          </select>
          <button id="quick-agent-run" class="cb-btn cb-btn-primary" style="width:100%;margin-top:4px;">▶ Run Analysis</button>
        </div>
        <div id="quick-agent-results" style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(0,180,255,0.2);display:none;">
          <div style="font-weight:600;margin-bottom:8px;color:var(--cb-subtext);">Results</div>
        </div>
      `;

      const goalSelect = outputArea.querySelector('#quick-agent-goal');
      const runBtn = outputArea.querySelector('#quick-agent-run');
      const resultsDiv = outputArea.querySelector('#quick-agent-results');

      runBtn.addEventListener('click', async () => {
        runBtn.disabled = true;
        runBtn.textContent = 'Analyzing...';
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = '<div style="text-align:center;padding:12px;"><div class="cb-spinner" style="display:inline-block;"></div></div>';

        try {
          const chatText = await getConversationText();
          if (!chatText || chatText.length < 10) {
            resultsDiv.innerHTML = '<div style="color:rgba(255,100,100,0.9);">⚠️ No conversation found. Start chatting first.</div>';
            return;
          }

          const goal = goalSelect.value;
          const prompt = `You are a Quick Agent assistant. Based on the goal "${goal}", analyze this conversation and provide:

1. **Analysis** (2-3 bullet points)
2. **Recommendations** (3-5 specific action items)
3. **Next Steps** (What to do right now)

Keep it concise and actionable. Use Markdown formatting.

Conversation:
${chatText.slice(0, 3000)}`;

          const res = await callLlamaAsync({ action: 'prompt', text: prompt });

          if (res && res.ok) {
            resultsDiv.innerHTML = `<div style="white-space:pre-wrap;line-height:1.6;">${res.result || 'Analysis complete'}</div>`;
            toast('Analysis complete!');
          } else {
            resultsDiv.innerHTML = `<div style="color:rgba(255,100,100,0.9);">❌ Failed: ${res && res.error ? res.error : 'unknown error'}</div>`;
          }
        } catch (e) {
          resultsDiv.innerHTML = `<div style="color:rgba(255,100,100,0.9);">❌ Error: ${e.message || 'Unknown error'}</div>`;
          debugLog('Quick Agent error', e);
        } finally {
          runBtn.disabled = false;
          runBtn.textContent = '▶ Run Analysis';
        }
      });
    }

    // Threadkeeper Agent - Autonomous Conversation Tracking
    async function showThreadkeeperAgent() {
      const outputArea = (agentContent && agentContent.querySelector('#cb-agent-output')) || (shadow && shadow.getElementById && shadow.getElementById('cb-agent-output'));
      if (!outputArea) return;

      outputArea.innerHTML = `
        <div style="margin-bottom:12px;">
          <div style="font-weight:700;margin-bottom:4px;font-size:13px;">🧵 Threadkeeper</div>
          <div style="font-size:11px;opacity:0.85;margin-bottom:12px;">Autonomous conversation tracking with auto-context injection</div>
          <div style="background:rgba(138,43,226,0.08);border:1px solid rgba(138,43,226,0.25);border-radius:8px;padding:10px;margin-bottom:12px;font-size:11px;line-height:1.5;">
            <b>Agentic Capabilities:</b><br/>
            • Tracks all conversations across platforms<br/>
            • Identifies returning topics automatically<br/>
            • Auto-injects missing context<br/>
            • Warns when history is incomplete
          </div>
          <button id="threadkeeper-scan" class="cb-btn cb-btn-primary" style="width:100%;margin-top:4px;">🔍 Scan All Threads</button>
        </div>
        <div id="threadkeeper-results" style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(0,180,255,0.2);display:none;">
          <div style="font-weight:600;margin-bottom:8px;color:var(--cb-subtext);">Thread Analysis</div>
        </div>
      `;

      const scanBtn = outputArea.querySelector('#threadkeeper-scan');
      const resultsDiv = outputArea.querySelector('#threadkeeper-results');

      scanBtn.addEventListener('click', async () => {
        scanBtn.disabled = true;
        scanBtn.textContent = 'Scanning threads...';
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = '<div style="text-align:center;padding:12px;"><div class="cb-spinner" style="display:inline-block;"></div><div style="margin-top:8px;font-size:11px;">Analyzing conversation history...</div></div>';

        try {
          // Get current conversation
          const currentChat = await getConversationText();
          if (!currentChat || currentChat.length < 10) {
            resultsDiv.innerHTML = '<div style="color:rgba(255,100,100,0.9);">⚠️ No current conversation found.</div>';
            return;
          }

          // Get stored conversations from all platforms
          const allConvos = await getAllStoredConversations();

          const prompt = `You are Threadkeeper, an autonomous conversation tracking agent.

**Your Mission:** Analyze the current conversation and identify connections to past conversations.

**Current Conversation (last 1000 chars):**
${currentChat.slice(-1000)}

**Previous Conversations Available:**
${allConvos.length} stored conversations across AI platforms

**Your Agentic Analysis:**
1. **Topic Detection:** What is the user discussing now?
2. **Context Gaps:** What information from past conversations is missing?
3. **Auto-Injection Plan:** What context should be restored?
4. **Warnings:** Alert if critical history is missing

Format output as:
## 🎯 Current Topic
[brief description]

## 🔗 Related Past Conversations
[list with relevance scores]

## ⚠️ Missing Context
[what needs to be restored]

## 📝 Recommended Action
[specific context to inject into chat]`;

          const res = await callLlamaAsync({ action: 'prompt', text: prompt });

          if (res && res.ok && res.result) {
            // Render result
            resultsDiv.innerHTML = `<div class="cb-threadkeeper-result" style="white-space:pre-wrap;line-height:1.6;">${res.result}</div>`;
            // Add safe button (no inline handlers)
            const btn = document.createElement('button');
            btn.className = 'cb-btn cb-btn-primary';
            btn.style.cssText = 'width:100%;margin-top:12px;';
            btn.textContent = '📋 Copy Context & Inject';
            btn.addEventListener('click', async () => {
              try {
                btn.disabled = true; btn.textContent = 'Injecting context...';
                const contentDiv = resultsDiv.querySelector('.cb-threadkeeper-result');
                const text = contentDiv ? contentDiv.textContent : '';
                if (text) { await navigator.clipboard.writeText(text); }
                btn.textContent = '✓ Context copied - paste into chat';
                setTimeout(() => { btn.disabled = false; btn.textContent = '📋 Copy Context & Inject'; }, 3000);
              } catch (_) { btn.disabled = false; btn.textContent = '📋 Copy Context & Inject'; }
            });
            resultsDiv.appendChild(btn);
            toast('Thread analysis complete!');
          } else {
            resultsDiv.innerHTML = `<div style="color:rgba(255,100,100,0.9);">❌ Failed: ${res && res.error ? res.error : 'unknown error'}</div>`;
          }
        } catch (e) {
          resultsDiv.innerHTML = `<div style="color:rgba(255,100,100,0.9);">❌ Error: ${e.message || 'Unknown error'}</div>`;
          debugLog('Threadkeeper error', e);
        } finally {
          scanBtn.disabled = false;
          scanBtn.textContent = '🔍 Scan All Threads';
        }
      });
    }

    // Multi-AI Planner Agent - Project Orchestrator
    async function showMultiAIPlannerAgent() {
      const outputArea = (agentContent && agentContent.querySelector('#cb-agent-output')) || (shadow && shadow.getElementById && shadow.getElementById('cb-agent-output'));
      if (!outputArea) return;

      outputArea.innerHTML = `
        <div style="margin-bottom:12px;">
          <div style="font-weight:700;margin-bottom:4px;font-size:13px;">🎯 Multi-AI Planner</div>
          <div style="font-size:11px;opacity:0.85;margin-bottom:12px;">Break goals into AI-powered steps with orchestrated execution</div>
          <div style="background:rgba(0,180,255,0.08);border:1px solid rgba(0,180,255,0.25);border-radius:8px;padding:10px;margin-bottom:12px;font-size:11px;line-height:1.5;">
            <b>Agentic Planning:</b><br/>
            • Breaks goals into actionable steps<br/>
            • Assigns tasks to optimal AI models<br/>
            • Collects & synthesizes all results<br/>
            • Builds unified execution plan
          </div>
          <textarea id="planner-goal" class="cb-textarea" placeholder="Describe your project goal...
Examples:
• Build a portfolio website
• Deploy a Python API
• Create a Chrome extension
• Write a technical blog post" style="width:100%;min-height:80px;margin-bottom:8px;"></textarea>
          <button id="planner-create" class="cb-btn cb-btn-primary" style="width:100%;margin-top:4px;">🚀 Create AI-Powered Plan</button>
        </div>
        <div id="planner-results" style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(0,180,255,0.2);display:none;">
          <div style="font-weight:600;margin-bottom:8px;color:var(--cb-subtext);">Orchestrated Plan</div>
        </div>
      `;

      const goalInput = outputArea.querySelector('#planner-goal');
      const createBtn = outputArea.querySelector('#planner-create');
      const resultsDiv = outputArea.querySelector('#planner-results');

      createBtn.addEventListener('click', async () => {
        const goal = goalInput.value.trim();
        if (!goal) {
          toast('Please describe your goal');
          return;
        }

        createBtn.disabled = true;
        createBtn.textContent = 'Planning with multiple AIs...';
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = '<div style="text-align:center;padding:12px;"><div class="cb-spinner" style="display:inline-block;"></div><div style="margin-top:8px;font-size:11px;">Consulting Gemini, ChatGPT, Claude, and Copilot...</div></div>';

        try {
          // Helper: Convert breakdown/refinement into concise, skimmable plan
          function postProcessPlanner(breakdownText, goalText, refinementText) {
            try {
              const txt = String(breakdownText || '');
              const steps = [];
              // Find step headings
              const re = /(\n|^)\s*(?:##+\s*)?Step\s*(\d+)\s*[:\-]\s*([^\n]+)\s*/gi;
              let m;
              const indices = [];
              while ((m = re.exec(txt)) !== null) {
                indices.push({ idx: m.index, num: parseInt(m[2], 10) || steps.length + 1, title: (m[3] || '').trim() });
              }
              // Build step blocks
              for (let i = 0; i < indices.length; i++) {
                const start = indices[i].idx;
                const end = i + 1 < indices.length ? indices[i + 1].idx : txt.length;
                const block = txt.slice(start, end);
                const assignedMatch = block.match(/Assigned\s*to\s*:?\s*(?:\*\*|\*)?([^\n*]+)(?:\*\*|\*)?/i);
                const taskMatch = block.match(/Task\s*:?\s*([^\n\r]+(?:\n(?!\s*\w+\s*:\s).+)*)/i);
                const model = assignedMatch ? assignedMatch[1].trim() : '';
                const taskRaw = taskMatch ? taskMatch[1].trim() : '';
                const taskOne = (() => {
                  const t = taskRaw.replace(/\s+/g, ' ').trim();
                  // keep up to 2 short sentences or ~160 chars
                  const parts = t.split(/(?<=\.)\s+/).filter(Boolean);
                  const clipped = parts.slice(0, 2).join(' ');
                  return (clipped || t).slice(0, 160);
                })();
                steps.push({ num: indices[i].num, title: indices[i].title, model, task: taskOne });
              }

              // Fallback: if no steps matched, create a single-line summary
              if (!steps.length) {
                const one = (txt.split('\n').find(l => /Assigned to|Task|Step/i.test(l)) || txt).replace(/\s+/g, ' ').trim().slice(0, 180);
                return `# ${goalText}\n\n- ${one}`;
              }

              // Integration flow extraction
              let flow = '';
              try {
                const sec = /Integration\s*Plan[\s\S]*?\n+([^\n][^#\n]{0,160})/i.exec(txt);
                if (sec && sec[1]) flow = sec[1].replace(/\s+/g, ' ').trim();
              } catch (_) { }
              if (!flow) {
                const order = steps.map(s => `S${s.num}`).join(' → ');
                flow = `${order} → Final deliverable`;
              }

              // Compose concise plan
              const header = `# ${goalText}`;
              const lines = steps
                .sort((a, b) => a.num - b.num)
                .slice(0, 7)
                .map(s => `- [${s.model || 'Model'}] ${s.title || s.task}`);
              // Ensure at least 5 items if available
              const concise = `${header}\n\n${lines.join('\n')}\n\nIntegration Flow: ${flow}`;
              return concise;
            } catch (e) {
              return String(breakdownText || '');
            }
          }
          // Stage 1: Break down goal into steps
          resultsDiv.innerHTML += '<div style="font-size:11px;opacity:0.7;margin-top:8px;">Stage 1/3: Breaking down goal into steps...</div>';

          const breakdownPrompt = `You are Multi-AI Planner, a project orchestration agent.

**User Goal:**
${goal}

**Your Task:** Break this goal into 5-7 specific, actionable steps. For each step, assign the best AI model.

**Available AI Models:**
- Gemini 2.5-pro: Complex reasoning, analysis, architecture
- ChatGPT-4o: Code generation, debugging, implementation
- Claude: Writing, documentation, explanations
- Copilot: Code completion, refactoring, optimization

**Output Format:**
## 📋 Project Breakdown

### Step 1: [Title]
**Assigned to:** [AI Model]
**Task:** [Specific instruction for the AI]
**Expected Output:** [What result this produces]

[Repeat for all steps]

## 🔗 Integration Plan
[How all steps combine into final deliverable]`;

          const breakdown = await callGeminiAsync({ action: 'prompt', text: breakdownPrompt, length: 'long' });

          if (!breakdown || !breakdown.ok) {
            resultsDiv.innerHTML = `<div style="color:rgba(255,100,100,0.9);">❌ Planning failed: ${breakdown?.error || 'unknown error'}</div>`;
            return;
          }

          // Stage 2: Execute parallel consultations (simulate multi-AI)
          resultsDiv.innerHTML += '<div style="font-size:11px;opacity:0.7;">Stage 2/3: Executing parallel AI consultations...</div>';

          const refinementPrompt = `Based on this project breakdown, provide implementation guidance:

${breakdown.result}

**Your Role:** Act as the consulting AI team. Provide:
1. **Technical recommendations** (architecture, tools, best practices)
2. **Potential challenges** and how to overcome them
3. **Resource requirements** (time, skills, dependencies)
4. **Success criteria** for each step

Keep it practical and actionable.`;

          const refinement = await callGeminiAsync({ action: 'prompt', text: refinementPrompt, length: 'long' });

          // Stage 3: Final synthesis
          resultsDiv.innerHTML += '<div style="font-size:11px;opacity:0.7;">Stage 3/3: Synthesizing unified plan...</div>';

          const concisePlan = postProcessPlanner(String(breakdown.result || ''), goal, String(refinement?.result || ''));
          // Clear and render plan without inline handlers
          resultsDiv.innerHTML = '';
          const planDiv = document.createElement('div');
          planDiv.style.cssText = 'white-space:pre-wrap;line-height:1.6;font-size:12px;';
          planDiv.textContent = concisePlan;
          const btnBar = document.createElement('div');
          btnBar.style.cssText = 'display:flex;gap:8px;margin-top:12px;';
          const copyBtn = document.createElement('button');
          copyBtn.className = 'cb-btn cb-btn-primary';
          copyBtn.style.cssText = 'flex:1;';
          copyBtn.textContent = '📋 Copy Plan';
          copyBtn.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(planDiv.textContent || ''); copyBtn.textContent = '✓ Copied'; setTimeout(() => copyBtn.textContent = '📋 Copy Plan', 2000); } catch (_) { }
          });
          const insertBtn = document.createElement('button');
          insertBtn.className = 'cb-btn';
          insertBtn.style.cssText = 'flex:1;';
          insertBtn.textContent = '➤ Insert to Chat';
          insertBtn.addEventListener('click', async () => {
            try { const text = planDiv.textContent || ''; if (window.ChatBridge && typeof window.ChatBridge.restoreToChat === 'function') { await window.ChatBridge.restoreToChat(text, []); } insertBtn.textContent = '✓ Inserted'; setTimeout(() => insertBtn.textContent = '➤ Insert to Chat', 2000); } catch (_) { }
          });
          btnBar.appendChild(copyBtn);
          btnBar.appendChild(insertBtn);
          resultsDiv.appendChild(planDiv);
          resultsDiv.appendChild(btnBar);
          toast('Orchestrated plan ready!');

        } catch (e) {
          resultsDiv.innerHTML = `<div style="color:rgba(255,100,100,0.9);">❌ Error: ${e.message || 'Unknown error'}</div>`;
          debugLog('Multi-AI Planner error', e);
        } finally {
          createBtn.disabled = false;
          createBtn.textContent = '🚀 Create AI-Powered Plan';
        }
      });
    }

    // Helper: Get all stored conversations
    async function getAllStoredConversations() {
      try {
        const stored = await storageGet('chatbridge_conversations');
        if (stored && Array.isArray(stored)) {
          return stored;
        }
        return [];
      } catch (e) {
        debugLog('getAllStoredConversations error', e);
        return [];
      }
    }

    // Open Prompt Designer view
    btnPromptDesigner.addEventListener('click', async () => {
      try {
        closeAllViews(); // Close other views first
        promptDesignerView.classList.add('cb-view-active');

        // Render Prompt Designer widget inside the view
        const pdContent = shadow.getElementById('cb-pd-content');
        if (pdContent) {
          pdContent.innerHTML = ''; // Clear previous content
          await renderPromptDesignerWidget(pdContent);
        }
      } catch (e) { toast('Failed to open Prompt Designer'); debugLog('open prompt designer view', e); }
    });

    btnClosePD.addEventListener('click', () => {
      try { promptDesignerView.classList.remove('cb-view-active'); } catch (e) { }
    });

    // Helper: per-view progress updater
    function updateProgress(el, action, ev) {
      try {
        if (!el) return;
        const act = (action === 'summarize') ? 'Summarizing' : (action === 'rewrite') ? 'Rewriting' : (action === 'translate') ? 'Translating' : 'Syncing';
        let msg = '';
        if (!ev || !ev.phase) msg = act + '...';
        else if (ev.phase === 'preparing') msg = 'Analyzing input...';
        else if (ev.phase === 'chunking') msg = 'Breaking into ' + (ev.total || '?') + ' parts...';
        else if (ev.phase === 'chunk') msg = (act + ' part ' + (ev.index || '?') + '/' + (ev.total || '?') + '...');
        else if (ev.phase === 'merging') msg = 'Merging parts...';
        else if (ev.phase === 'done') msg = 'Finalizing...';
        else msg = act + '...';
        el.textContent = msg;
      } catch (e) { }
    }

    // Normalize an array/string of topic tags to canonical stored form
    function normalizeTopics(topics) {
      try {
        let arr = [];
        if (!topics) return [];
        if (Array.isArray(topics)) arr = topics.slice();
        else if (typeof topics === 'string') arr = topics.split(/[,\n]+/);
        else return [];

        // lowercase, remove quotes/parentheses/dots, strip other punctuation except dash/underscore, collapse spaces
        const cleaned = arr.map(t => String(t || '')
          .toLowerCase()
          .replace(/["'()\.]/g, '')
          .replace(/[^\w\s-_]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
        ).filter(Boolean);

        // dedupe preserve order and limit to 6
        const seen = new Set();
        const uniq = [];
        for (const t of cleaned) {
          if (!seen.has(t)) { seen.add(t); uniq.push(t); }
        }
        return uniq.slice(0, 6);
      } catch (e) { debugLog('normalizeTopics failed', e); return []; }
    }

    // Helper: per-view progress updater
    function getTargetModelUrl(name) {
      const n = (name || '').toLowerCase();
      if (n.includes('claude') || n.includes('anthropic')) return 'https://claude.ai/new';
      if (n.includes('chatgpt') || n.includes('openai')) return 'https://chatgpt.com/';
      if (n.includes('gemini') || n.includes('bard')) return 'https://gemini.google.com/app';
      if (n.includes('bing') || n.includes('copilot')) return 'https://copilot.microsoft.com/';
      // unsupported targets can be added here
      return null;
    }

    // Generate an optimized prompt for the target model by analyzing what made the source/assistant responses effective
    async function generateOptimizedPrompt(sourceModel, targetModel, originalConversation, assistantExample) {
      try {
        // Build an instruction that asks the backend to (1) summarize strengths, (2) produce an optimized prompt for target
        const instruct = `You are an expert prompt engineer and analyst. Given a short excerpt of an original conversation and an example assistant response (which performed well), do two things:
1) Briefly list the key strengths and techniques that made the assistant response effective (tone, structure, use of bullets/tables/code, examples, explicit constraints, data formatting, etc.). Provide 3-6 concise bullet points.
2) Produce a ready-to-use, optimized prompt tailored specifically for the target model: ${targetModel}. The prompt must include explicit formatting cues the model should follow (for example: headings, numbered steps, JSON/YAML output, code fences, output constraints). Keep the prompt itself concise (no more than ~350 tokens) but include an example of the desired output format (one short example).

Respond ONLY with a JSON object with keys: "strengths" (array of short strings) and "optimized_prompt" (string). Do NOT include extra commentary. Here are the inputs:\n\nOriginal conversation excerpt:\n${originalConversation}\n\nAssistant response example:\n${assistantExample}\n`;

        const res = await callGeminiAsync({ action: 'prompt', text: instruct, length: 'short' });
        if (res && res.ok && res.result) {
          const txt = String(res.result || '').trim();
          // try to extract JSON blob from the result
          try {
            const jsonStart = txt.indexOf('{');
            const jsonEnd = txt.lastIndexOf('}');
            if (jsonStart >= 0 && jsonEnd > jsonStart) {
              const jtxt = txt.slice(jsonStart, jsonEnd + 1);
              const parsed = JSON.parse(jtxt);
              return { strengths: parsed.strengths || parsed.strength || [], optimized_prompt: parsed.optimized_prompt || parsed.optimizedPrompt || parsed.prompt || parsed.optimized_prompt || '' };
            }
          } catch (e) { debugLog('parse json failed', e); }
          // fallback: return raw result as prompt
          return { strengths: [], optimized_prompt: txt };
        }
        return null;
      } catch (e) { debugLog('generateOptimizedPrompt err', e); return null; }
    }

    // Open target model in a new tab and auto-restore text
    function continueWithTargetModel(text) {
      try {
        const target = (syncTargetSelect && syncTargetSelect.value) ? syncTargetSelect.value : 'ChatGPT';
        const url = getTargetModelUrl(target);
        if (!url) { toast('Target not supported yet'); return; }
        if (!text || text === '(no result)') { toast('Nothing to send'); return; }
        try {
          chrome.runtime.sendMessage({ type: 'open_and_restore', payload: { url, text } }, (res) => {
            // optional ack
          });
        } catch (e) {
          // fallback: open window and rely on user to paste
          try { window.open(url, '_blank'); } catch (_) { }
          try { navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard. Paste into the new chat.')); } catch (_) { toast('Copied to clipboard.'); }
        }
      } catch (e) { toast('Continue failed'); }
    }

    // Map target model name to a URL we can open
    async function extractKnowledge(conversation, conversationId) {
      try {
        // Segment the conversation to identify topic shifts
        const segments = segmentConversation(conversation, 5, 0.5);
        debugLog('Conversation segmented into', segments.length, 'topics:', segments.map(s => s.topic));

        // Build conversation text for analysis
        const convText = conversation.map(m => `${m.role}: ${m.text}`).join('\n\n');
        const snippet = convText.length > 3000 ? convText.slice(0, 3000) + '\n\n...(truncated)' : convText;

        const prompt = `You are an expert knowledge analyst. Analyze this conversation excerpt and extract structured insights.

Conversation:
${snippet}

Extract and return ONLY a JSON object (no commentary) with:
{
  "entities": ["person/project/product names mentioned, max 8"],
  "themes": ["core topics discussed, max 6"],
  "conclusions": ["key decisions or insights reached, max 4"],
  "contradictions": ["any conflicting viewpoints or unresolved tensions, max 3"],
  "context": "one-sentence summary of the conversation's purpose"
}

Be concise. Focus on proper nouns, technical concepts, and actionable insights.`;

        const res = await callGeminiAsync({ action: 'prompt', text: prompt, length: 'short' });

        if (res && res.ok && res.result) {
          try {
            // Extract JSON from response
            const txt = String(res.result || '').trim();
            const jsonStart = txt.indexOf('{');
            const jsonEnd = txt.lastIndexOf('}');
            if (jsonStart >= 0 && jsonEnd > jsonStart) {
              const jsonStr = txt.slice(jsonStart, jsonEnd + 1);
              const parsed = JSON.parse(jsonStr);

              // Store knowledge with segmentation metadata
              const knowledge = {
                id: conversationId,
                ts: Date.now(),
                entities: Array.isArray(parsed.entities) ? parsed.entities.slice(0, 8) : [],
                themes: Array.isArray(parsed.themes) ? parsed.themes.slice(0, 6) : [],
                conclusions: Array.isArray(parsed.conclusions) ? parsed.conclusions.slice(0, 4) : [],
                contradictions: Array.isArray(parsed.contradictions) ? parsed.contradictions.slice(0, 3) : [],
                context: parsed.context || '',
                segments: segments.map(s => ({ topic: s.topic, keywords: s.keywords, confidence: s.confidence })),
                segmentCount: segments.length
              };

              // Check for contradictions before saving
              const contradictions = await detectContradictions(knowledge);
              if (contradictions.length > 0) {
                knowledge.detectedContradictions = contradictions;
                showContradictionAlert(contradictions);
              }

              // Save to knowledge graph
              const graphKey = 'chatbridge:knowledge_graph';
              const graph = JSON.parse(localStorage.getItem(graphKey) || '[]');
              graph.push(knowledge);
              localStorage.setItem(graphKey, JSON.stringify(graph));

              debugLog('Knowledge extracted with', segments.length, 'segments:', knowledge);
              return knowledge;
            }
          } catch (e) {
            debugLog('Knowledge extraction parse error', e);
          }
        }
        return null;
      } catch (e) {
        debugLog('extractKnowledge error', e);
        return null;
      }
    }

    // Cross-Context Memory: Find related past conversations with confidence scoring
    async function findRelatedConversations(currentEntities, currentThemes, limit = 3) {
      try {
        const graphKey = 'chatbridge:knowledge_graph';
        const graph = JSON.parse(localStorage.getItem(graphKey) || '[]');

        if (!graph.length || (!currentEntities.length && !currentThemes.length)) return [];

        // Score each past conversation by overlap with current context
        const scored = graph.map(kg => {
          let score = 0;
          let matchedEntities = 0;
          let matchedThemes = 0;
          let entityDetails = [];
          let themeDetails = [];

          // Entity overlap (higher weight) with exact and partial matching
          for (const e of currentEntities) {
            const eLower = e.toLowerCase();
            for (const ke of (kg.entities || [])) {
              const keLower = ke.toLowerCase();
              if (eLower === keLower) {
                // Exact match - highest score
                score += 5;
                matchedEntities++;
                entityDetails.push({ current: e, past: ke, type: 'exact' });
              } else if (keLower.includes(eLower) || eLower.includes(keLower)) {
                // Partial match
                score += 3;
                matchedEntities++;
                entityDetails.push({ current: e, past: ke, type: 'partial' });
              }
            }
          }

          // Theme overlap with fuzzy matching
          for (const t of currentThemes) {
            const tLower = t.toLowerCase();
            for (const kt of (kg.themes || [])) {
              const ktLower = kt.toLowerCase();
              if (tLower === ktLower) {
                score += 4;
                matchedThemes++;
                themeDetails.push({ current: t, past: kt, type: 'exact' });
              } else if (ktLower.includes(tLower) || tLower.includes(ktLower)) {
                score += 2;
                matchedThemes++;
                themeDetails.push({ current: t, past: kt, type: 'partial' });
              }
            }
          }

          // Recency bonus (decay over 30 days)
          const age = Date.now() - (kg.ts || 0);
          const daysSince = age / (1000 * 60 * 60 * 24);
          const recencyBonus = Math.max(0, (30 - daysSince) / 30) * 2;
          score += recencyBonus;

          // Calculate confidence score (0-100)
          const maxPossibleScore = (currentEntities.length * 5) + (currentThemes.length * 4) + 2;
          const confidence = Math.min(100, Math.round((score / maxPossibleScore) * 100));

          return {
            ...kg,
            score,
            confidence,
            matchedEntities,
            matchedThemes,
            entityDetails,
            themeDetails,
            recencyScore: recencyBonus,
            age: daysSince
          };
        }).filter(kg => kg.score > 0).sort((a, b) => b.score - a.score).slice(0, limit * 2); // Get more for filtering

        // Filter by minimum confidence threshold (30%)
        const filtered = scored.filter(kg => kg.confidence >= 30).slice(0, limit);

        return filtered;
      } catch (e) {
        debugLog('findRelatedConversations error', e);
        return [];
      }
    }

    // Cross-Context Memory: Show suggestion notification
    function showContextSuggestion(relatedConvs) {
      try {
        if (!relatedConvs || !relatedConvs.length) return;

        // Create notification element with multiple results
        const notification = document.createElement('div');
        notification.id = 'cb-context-notification';
        notification.setAttribute('data-cb-ignore', 'true');
        notification.style.cssText = `
          position: fixed;
          bottom: 80px;
          right: 26px;
          width: 340px;
          max-height: 500px;
          overflow-y: auto;
          background: linear-gradient(135deg, rgba(230,207,159,0.98), rgba(212,175,119,0.98));
          color: #0b0f17;
          padding: 16px 18px;
          border-radius: 14px;
          box-shadow: 0 12px 32px rgba(0,0,0,0.35);
          z-index: 2147483646;
          font-family: 'Inter', sans-serif;
          font-size: 13px;
          line-height: 1.5;
          animation: cb-slide-in 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        `;

        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;';

        const title = document.createElement('div');
        title.style.cssText = 'font-weight:700;font-size:15px;display:flex;align-items:center;gap:8px;';
        title.innerHTML = `<span>🔗</span><span>Related Conversations</span>`;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.setAttribute('aria-label', 'Close related conversations');
        closeBtn.style.cssText = 'background:transparent;border:none;color:#0b0f17;font-size:22px;cursor:pointer;padding:0;line-height:1;opacity:0.6;transition:opacity 0.2s;';
        closeBtn.addEventListener('mouseenter', () => closeBtn.style.opacity = '1');
        closeBtn.addEventListener('mouseleave', () => closeBtn.style.opacity = '0.6');
        closeBtn.addEventListener('click', () => notification.remove());

        topRow.appendChild(title);
        topRow.appendChild(closeBtn);
        notification.appendChild(topRow);

        const intro = document.createElement('div');
        intro.style.cssText = 'margin-bottom:14px;font-size:12px;opacity:0.85;';
        intro.textContent = `Found ${relatedConvs.length} conversation${relatedConvs.length > 1 ? 's' : ''} with similar themes and topics:`;
        notification.appendChild(intro);

        // Show up to 3 most relevant conversations
        relatedConvs.slice(0, 3).forEach((conv, idx) => {
          const card = document.createElement('div');
          card.style.cssText = 'background:rgba(11,15,23,0.15);padding:12px;border-radius:10px;margin-bottom:10px;border-left:3px solid rgba(11,15,23,0.4);transition:all 0.2s;cursor:pointer;';
          card.setAttribute('role', 'button');
          card.setAttribute('tabindex', '0');
          card.addEventListener('mouseenter', () => {
            card.style.background = 'rgba(11,15,23,0.25)';
            card.style.transform = 'translateX(2px)';
          });
          card.addEventListener('mouseleave', () => {
            card.style.background = 'rgba(11,15,23,0.15)';
            card.style.transform = 'translateX(0)';
          });

          const cardHeader = document.createElement('div');
          cardHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';

          const platform = document.createElement('div');
          platform.style.cssText = 'font-weight:600;font-size:12px;';
          const platformName = (conv.platform || 'Unknown').replace(/^https?:\/\//, '').replace(/\/$/, '');
          platform.textContent = platformName;
          // update aria-label now that platformName is known
          try { card.setAttribute('aria-label', 'Open conversation ' + platformName); } catch (e) { }

          const score = document.createElement('div');
          score.style.cssText = 'background:rgba(11,15,23,0.3);padding:4px 8px;border-radius:6px;font-size:11px;font-weight:600;display:flex;align-items:center;gap:4px;';

          // Confidence indicator with color coding
          const confidence = conv.confidence || 0;
          const confidenceColor = confidence >= 70 ? '#10a37f' : confidence >= 50 ? '#ffa500' : '#888';
          const confidenceDot = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${confidenceColor};"></span>`;
          score.innerHTML = `${confidenceDot} ${confidence}% match`;

          cardHeader.appendChild(platform);
          cardHeader.appendChild(score);
          card.appendChild(cardHeader);

          if (conv.context) {
            const context = document.createElement('div');
            context.style.cssText = 'font-size:12px;margin-bottom:8px;opacity:0.9;line-height:1.4;';
            context.textContent = conv.context.slice(0, 100) + (conv.context.length > 100 ? '...' : '');
            card.appendChild(context);
          }

          if (conv.entities && conv.entities.length > 0) {
            const entities = document.createElement('div');
            entities.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;';
            conv.entities.slice(0, 4).forEach(entity => {
              const tag = document.createElement('span');
              tag.style.cssText = 'background:rgba(11,15,23,0.25);padding:3px 8px;border-radius:6px;font-size:10px;font-weight:500;';
              tag.textContent = entity;
              entities.appendChild(tag);
            });
            card.appendChild(entities);
          }

          if (conv.themes && conv.themes.length > 0) {
            const themes = document.createElement('div');
            themes.style.cssText = 'font-size:10px;opacity:0.7;margin-top:6px;';
            themes.textContent = '💭 ' + conv.themes.slice(0, 3).join(' • ');
            card.appendChild(themes);
          }

          // Show segment information if available
          if (conv.segments && conv.segments.length > 1) {
            const segInfo = document.createElement('div');
            segInfo.style.cssText = 'font-size:10px;opacity:0.7;margin-top:4px;padding:4px 6px;background:rgba(11,15,23,0.15);border-radius:4px;';
            segInfo.innerHTML = `📊 ${conv.segments.length} topics: ${conv.segments.map(s => s.topic).join(', ')}`;
            card.appendChild(segInfo);
          }

          // Show matched details on hover (tooltip-style)
          if (conv.entityDetails && conv.entityDetails.length > 0) {
            const matchDetails = document.createElement('div');
            matchDetails.style.cssText = 'display:none;font-size:10px;margin-top:6px;padding:6px;background:rgba(11,15,23,0.25);border-radius:4px;border-left:2px solid rgba(0,180,255,0.5);';
            matchDetails.innerHTML = `<strong>Matches:</strong><br>` +
              `Entities: ${conv.matchedEntities} (${conv.entityDetails.slice(0, 3).map(e => e.current).join(', ')})<br>` +
              `Themes: ${conv.matchedThemes} (${conv.themeDetails.slice(0, 3).map(t => t.current).join(', ')})`;

            card.addEventListener('mouseenter', () => { matchDetails.style.display = 'block'; });
            card.addEventListener('mouseleave', () => { matchDetails.style.display = 'none'; });

            card.appendChild(matchDetails);
          }

          const viewBtn = document.createElement('button');
          viewBtn.textContent = 'Open Conversation →';
          viewBtn.style.cssText = 'margin-top:10px;width:100%;background:#0b0f17;color:#e6cf9f;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:600;font-size:11px;font-family:inherit;transition:all 0.2s;';
          viewBtn.addEventListener('mouseenter', () => {
            viewBtn.style.background = '#15192a';
            viewBtn.style.transform = 'translateY(-1px)';
            viewBtn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
          });
          viewBtn.addEventListener('mouseleave', () => {
            viewBtn.style.background = '#0b0f17';
            viewBtn.style.transform = 'translateY(0)';
            viewBtn.style.boxShadow = 'none';
          });
          viewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openConversationById(conv.id);
            notification.remove();
          });
          viewBtn.setAttribute('aria-label', 'Open conversation');
          // keyboard activation for card
          card.addEventListener('keydown', (ev) => { try { if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') { ev.preventDefault(); openConversationById(conv.id); notification.remove(); } } catch (e) { } });

          card.appendChild(viewBtn);
          card.addEventListener('click', () => {
            openConversationById(conv.id);
            notification.remove();
          });

          notification.appendChild(card);
        });

        if (relatedConvs.length > 3) {
          const moreInfo = document.createElement('div');
          moreInfo.style.cssText = 'text-align:center;font-size:11px;opacity:0.7;margin-top:8px;';
          moreInfo.textContent = `+ ${relatedConvs.length - 3} more related conversation${relatedConvs.length - 3 > 1 ? 's' : ''}`;
          notification.appendChild(moreInfo);
        }

        const dismissBtn = document.createElement('button');
        dismissBtn.textContent = 'Dismiss';
        dismissBtn.setAttribute('aria-label', 'Dismiss related conversations');
        dismissBtn.style.cssText = 'width:100%;margin-top:12px;background:rgba(11,15,23,0.2);color:#0b0f17;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:500;font-size:12px;font-family:inherit;transition:all 0.2s;';
        dismissBtn.addEventListener('mouseenter', () => dismissBtn.style.background = 'rgba(11,15,23,0.3)');
        dismissBtn.addEventListener('mouseleave', () => dismissBtn.style.background = 'rgba(11,15,23,0.2)');
        dismissBtn.addEventListener('click', () => notification.remove());
        notification.appendChild(dismissBtn);

        // Add animation style if not exists
        if (!document.getElementById('cb-context-styles')) {
          const styleEl = document.createElement('style');
          styleEl.id = 'cb-context-styles';
          styleEl.textContent = `
            @keyframes cb-slide-in {
              from { transform: translateX(30px) translateY(10px); opacity: 0; }
              to { transform: translateX(0) translateY(0); opacity: 1; }
            }
            #cb-context-notification::-webkit-scrollbar { width: 6px; }
            #cb-context-notification::-webkit-scrollbar-track { background: rgba(11,15,23,0.2); border-radius: 10px; }
            #cb-context-notification::-webkit-scrollbar-thumb { background: rgba(11,15,23,0.4); border-radius: 10px; }
            #cb-context-notification::-webkit-scrollbar-thumb:hover { background: rgba(11,15,23,0.6); }
          `;
          document.head.appendChild(styleEl);
        }

        // Remove existing notification if any
        const existing = document.getElementById('cb-context-notification');
        if (existing) existing.remove();

        document.body.appendChild(notification);

        // Auto-dismiss after 20 seconds
        setTimeout(() => {
          try { if (notification.parentNode) notification.remove(); } catch (e) { }
        }, 20000);

      } catch (e) {
        debugLog('showContextSuggestion error', e);
      }
    }

    // ============================================
    // INTELLIGENCE ENHANCEMENTS
    // ============================================
    // 
    // This section implements advanced context detection and conversation analysis:
    //
    // 1. Sliding Window Context Detection:
    //    - Analyzes recent messages (default: last 8) with configurable window size
    //    - Extracts entities, themes, and keywords from active conversation
    //    - Calculates confidence scores based on keyword density and variety
    //    - Minimum confidence threshold (40%) filters low-quality contexts
    //
    // 2. Conversation Segmentation:
    //    - Detects topic changes using overlapping windows (default: 5 messages, 50% overlap)
    //    - Uses Jaccard distance to measure topic shift between segments
    //    - Auto-labels topics based on most frequent keywords
    //    - Provides confidence scores for each segment
    //
    // 3. Confidence Scoring for Suggestions:
    //    - Exact entity/theme matches score higher than partial matches
    //    - Recency bonus decays over 30 days
    //    - Normalized confidence percentage (0-100%)
    //    - Minimum 30% confidence threshold for suggestions
    //    - Color-coded confidence indicators (green ≥70%, orange ≥50%, gray <50%)
    //
    // 4. Enhanced Knowledge Extraction:
    //    - Segments conversations before extracting knowledge
    //    - Stores segment metadata with knowledge graph entries
    //    - Preserves topic structure for better matching
    //
    // Debug helpers:
    //   ChatBridge.analyzeContext() - Full analysis of current conversation
    //   ChatBridge.showSegments() - Visualize detected topic segments
    //
    // ============================================

    // Conversation Segmentation: Detect topic changes using sliding window analysis
    function segmentConversation(messages, windowSize = 5, overlapRatio = 0.5) {
      try {
        if (!messages || messages.length < windowSize) {
          return [{ start: 0, end: messages.length, topic: 'main', confidence: 100 }];
        }

        const segments = [];
        const step = Math.max(1, Math.floor(windowSize * (1 - overlapRatio)));

        for (let i = 0; i < messages.length; i += step) {
          const windowEnd = Math.min(i + windowSize, messages.length);
          const window = messages.slice(i, windowEnd);

          // Extract keywords from window
          const windowText = window.map(m => m.text || '').join(' ');
          const keywords = extractKeywordsFromText(windowText, 8);

          // Calculate topic shift score compared to previous segment
          let shiftScore = 0;
          if (segments.length > 0) {
            const prevSegment = segments[segments.length - 1];
            const overlap = keywords.filter(k => prevSegment.keywords.includes(k)).length;
            const union = new Set([...keywords, ...prevSegment.keywords]).size;
            shiftScore = 1 - (overlap / union); // Jaccard distance
          }

          // Topic change detected if shift > threshold
          const isNewTopic = shiftScore > 0.5;

          if (isNewTopic || segments.length === 0) {
            segments.push({
              start: i,
              end: windowEnd,
              keywords,
              topic: inferTopicLabel(keywords),
              confidence: Math.round((1 - shiftScore) * 100),
              messageCount: windowEnd - i
            });
          } else {
            // Extend previous segment
            segments[segments.length - 1].end = windowEnd;
            segments[segments.length - 1].messageCount = windowEnd - segments[segments.length - 1].start;
            // Merge keywords
            segments[segments.length - 1].keywords = [...new Set([...segments[segments.length - 1].keywords, ...keywords])].slice(0, 10);
          }
        }

        return segments;
      } catch (e) {
        debugLog('segmentConversation error', e);
        return [{ start: 0, end: messages.length, topic: 'main', confidence: 100 }];
      }
    }

    // Extract keywords from text with frequency analysis
    function extractKeywordsFromText(text, limit = 8) {
      try {
        if (!text) return [];
        const stopWords = new Set(['the', 'that', 'this', 'with', 'from', 'about', 'they', 'would', 'have', 'there', 'their', 'which', 'what', 'when', 'where', 'your', 'you', 'will', 'could', 'should', 'and', 'for', 'but', 'are', 'not', 'was', 'were', 'has', 'had', 'can', 'all', 'any', 'more', 'our', 'its', 'also', 'use', 'using', 'like', 'just', 'know', 'get', 'make', 'want', 'need', 'think', 'see', 'look', 'take', 'come', 'well', 'even', 'back', 'good', 'very', 'much', 'said', 'than', 'some', 'into', 'them', 'only', 'over', 'such', 'other', 'then', 'now', 'may', 'these', 'after', 'most']);
        const words = String(text).toLowerCase().split(/[^\w]+/).filter(w => w.length > 3 && !stopWords.has(w));
        const freq = {};
        words.forEach(w => freq[w] = (freq[w] || 0) + 1);
        const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, limit);
        return sorted.map(([w]) => w);
      } catch (e) {
        return [];
      }
    }

    // Infer a topic label from keywords
    function inferTopicLabel(keywords) {
      if (!keywords || !keywords.length) return 'general';
      // Use most frequent keyword as topic, capitalize first letter
      const topic = keywords[0];
      return topic.charAt(0).toUpperCase() + topic.slice(1);
    }

    // Sliding Window Context Detection: Analyze recent messages with overlap
    function detectActiveContext(messages, windowSize = 8, minConfidence = 40) {
      try {
        if (!messages || messages.length < 3) return null;

        // Use last N messages as active window
        const window = messages.slice(-windowSize);
        const windowText = window.map(m => m.text || '').join('\n');

        // Extract entities and themes from active window
        const keywords = extractKeywordsFromText(windowText, 10);
        const entities = extractEntities(windowText);
        const themes = keywords.slice(0, 6);

        // Calculate confidence based on keyword density and variety
        const uniqueWords = new Set(windowText.toLowerCase().split(/\W+/).filter(w => w.length > 3));
        const totalWords = windowText.split(/\W+/).filter(Boolean).length;
        const variety = uniqueWords.size / Math.max(1, totalWords);
        const density = keywords.length / Math.max(1, window.length);

        const confidence = Math.round(Math.min(100, (variety * 50) + (density * 50)));

        if (confidence < minConfidence) return null;

        return {
          entities,
          themes,
          keywords,
          confidence,
          messageCount: window.length,
          totalWords,
          variety: Math.round(variety * 100)
        };
      } catch (e) {
        debugLog('detectActiveContext error', e);
        return null;
      }
    }

    // Extract named entities from text (simple pattern-based)
    function extractEntities(text) {
      try {
        if (!text) return [];
        const entities = [];

        // Capitalized words (potential proper nouns)
        const capitalizedWords = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
        const filtered = capitalizedWords.filter(w =>
          !['The', 'This', 'That', 'These', 'Those', 'There', 'Then', 'When', 'Where', 'What', 'Which', 'Who', 'How'].includes(w)
        );

        // Common tech/product patterns
        const techPatterns = text.match(/\b(?:API|SDK|CLI|UI|UX|AI|ML|HTTP|JSON|XML|SQL|NoSQL|REST|GraphQL|OAuth|JWT|CSS|HTML|JavaScript|Python|Java|React|Vue|Angular|Node|Express|Django|Flask)\b/gi) || [];

        // Combine and dedupe
        const combined = [...filtered, ...techPatterns];
        const unique = [...new Set(combined.map(e => e.toLowerCase()))];

        return unique.slice(0, 8);
      } catch (e) {
        return [];
      }
    }

    // Cross-Context Memory: Detect context on page and show suggestions with sliding window
    function renderConnectionsPanel(relatedConvs, activeContext) {
      try {
        if (!connectionsResult) return;
        // Build list of cards similar to the floating notification, but inline
        connectionsResult.innerHTML = '';
        if (!relatedConvs || relatedConvs.length === 0) {
          const empty = document.createElement('div');
          empty.style.cssText = 'opacity:0.8;';
          empty.textContent = 'No connections found yet.' + (activeContext && activeContext.keywords && activeContext.keywords.length ? ' Topics detected: ' + activeContext.keywords.slice(0, 5).join(', ') : '');
          connectionsResult.appendChild(empty);
          return;
        }
        relatedConvs.slice(0, 6).forEach(conv => {
          const card = document.createElement('div');
          card.style.cssText = 'background:rgba(11,15,23,0.15);padding:10px;border-radius:10px;margin-bottom:10px;border-left:3px solid rgba(11,15,23,0.4);';
          const header = document.createElement('div'); header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;';
          const platform = document.createElement('div'); platform.style.cssText = 'font-weight:600;font-size:12px;';
          const platformName = (conv.platform || 'Unknown').replace(/^https?:\/\//, '').replace(/\/$/, '');
          platform.textContent = platformName;
          const score = document.createElement('div'); score.style.cssText = 'background:rgba(11,15,23,0.3);padding:2px 6px;border-radius:6px;font-size:11px;font-weight:600;display:flex;align-items:center;gap:4px;';
          const confidence = conv.confidence || 0;
          const color = confidence >= 70 ? '#10a37f' : confidence >= 50 ? '#ffa500' : '#888';
          score.innerHTML = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${color}"></span> ${confidence}%`;
          header.appendChild(platform); header.appendChild(score);
          card.appendChild(header);
          if (conv.context) {
            const ctx = document.createElement('div'); ctx.style.cssText = 'font-size:12px;margin-bottom:6px;opacity:0.9;';
            ctx.textContent = conv.context.slice(0, 140) + (conv.context.length > 140 ? '…' : '');
            card.appendChild(ctx);
          }
          if (conv.entities && conv.entities.length) {
            const chips = document.createElement('div'); chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;';
            conv.entities.slice(0, 5).forEach(e => { const tag = document.createElement('span'); tag.style.cssText = 'background:rgba(11,15,23,0.25);padding:3px 8px;border-radius:6px;font-size:10px;font-weight:500;'; tag.textContent = e; chips.appendChild(tag); });
            card.appendChild(chips);
          }
          const open = document.createElement('button'); open.className = 'cb-btn'; open.textContent = 'Open conversation'; open.style.marginTop = '6px';
          open.addEventListener('click', () => { try { openConversationById(conv.id); } catch (_) { } });
          card.appendChild(open);
          connectionsResult.appendChild(card);
        });
      } catch (e) { debugLog('renderConnectionsPanel error', e); }
    }

    async function detectAndSuggestContext() {
      try {
        // Check if we have any knowledge graph data first
        const kg = await loadKnowledgeGraph();
        if (!kg || kg.length === 0) {
          // Reflect inline in Connections panel as well as toast
          try { if (connectionsResult) { connectionsResult.textContent = 'No saved conversations yet. Scan some chats first to build your knowledge graph!'; } } catch (_) { }
          toast('No saved conversations yet. Scan some chats first to build your knowledge graph!');
          return;
        }

        // Quick scan of visible messages to extract current context
        const msgs = await scanChat();
        if (!msgs || msgs.length < 2) {
          try { if (connectionsResult) { connectionsResult.textContent = 'Not enough conversation context on this page. Try having a longer chat first.'; } } catch (_) { }
          toast('Not enough conversation context on this page. Try having a longer chat first.');
          return;
        }

        // Use sliding window for smarter context detection
        const activeContext = detectActiveContext(msgs, 8, 40);

        if (!activeContext) {
          try { if (connectionsResult) { connectionsResult.textContent = 'Could not detect clear context from current conversation.'; } } catch (_) { }
          toast('Could not detect clear context from current conversation.');
          return;
        }

        debugLog('Active context detected:', activeContext);

        // Update inline panel status
        try { if (connectionsResult) connectionsResult.textContent = 'Analyzing connections…'; } catch (_) { }

        // Find related conversations using detected entities and themes
        const related = await findRelatedConversations(activeContext.entities, activeContext.themes, 5);

        if (related.length) {
          try { renderConnectionsPanel(related, activeContext); } catch (_) { }
          // Keep toast, but prefer inline panel over floating notification
          toast(`Found ${related.length} related conversation${related.length > 1 ? 's' : ''} (${activeContext.confidence}% confidence)`);
        } else {
          // Show helpful message inline when no connections found
          try { renderConnectionsPanel([], activeContext); } catch (_) { }
        }
      } catch (e) {
        debugLog('detectAndSuggestContext error', e);
        try { if (connectionsResult) { connectionsResult.textContent = 'Analysis failed. Please try again.'; } } catch (_) { }
      }
    }

    // Show helpful message when no connections found
    function showNoConnectionsMessage(keywords) {
      try {
        const notification = document.createElement('div');
        notification.id = 'cb-context-notification';
        notification.setAttribute('data-cb-ignore', 'true');
        notification.style.cssText = `
          position: fixed;
          bottom: 80px;
          right: 26px;
          width: 340px;
          background: linear-gradient(135deg, rgba(230,207,159,0.98), rgba(212,175,119,0.98));
          color: #0b0f17;
          padding: 16px 18px;
          border-radius: 14px;
          box-shadow: 0 12px 32px rgba(0,0,0,0.35);
          z-index: 2147483646;
          font-family: 'Inter', sans-serif;
          font-size: 13px;
          line-height: 1.5;
          animation: cb-slide-in 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        `;

        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;';

        const title = document.createElement('div');
        title.style.cssText = 'font-weight:700;font-size:15px;display:flex;align-items:center;gap:8px;';
        title.innerHTML = `<span>🔍</span><span>No Connections Found</span>`;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.setAttribute('aria-label', 'Close notification');
        closeBtn.style.cssText = 'background:transparent;border:none;color:#0b0f17;font-size:22px;cursor:pointer;padding:0;line-height:1;opacity:0.6;transition:opacity 0.2s;';
        closeBtn.addEventListener('mouseenter', () => closeBtn.style.opacity = '1');
        closeBtn.addEventListener('mouseleave', () => closeBtn.style.opacity = '0.6');
        closeBtn.addEventListener('click', () => notification.remove());

        topRow.appendChild(title);
        topRow.appendChild(closeBtn);
        notification.appendChild(topRow);

        const msg = document.createElement('div');
        msg.style.cssText = 'margin-bottom:12px;opacity:0.9;line-height:1.6;';
        msg.textContent = "This conversation doesn't share topics with your previous chats yet. Keep chatting and scanning to build connections!";
        notification.appendChild(msg);

        if (keywords && keywords.length > 0) {
          const keywordsSection = document.createElement('div');
          keywordsSection.style.cssText = 'background:rgba(11,15,23,0.15);padding:10px;border-radius:8px;margin-bottom:12px;';

          const keywordsTitle = document.createElement('div');
          keywordsTitle.style.cssText = 'font-size:11px;font-weight:600;margin-bottom:6px;opacity:0.8;';
          keywordsTitle.textContent = 'Current topics detected:';
          keywordsSection.appendChild(keywordsTitle);

          const keywordsList = document.createElement('div');
          keywordsList.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';
          keywords.slice(0, 5).forEach(kw => {
            const tag = document.createElement('span');
            tag.style.cssText = 'background:rgba(11,15,23,0.25);padding:3px 8px;border-radius:6px;font-size:10px;font-weight:500;';
            tag.textContent = kw;
            keywordsList.appendChild(tag);
          });
          keywordsSection.appendChild(keywordsList);
          notification.appendChild(keywordsSection);
        }

        const tip = document.createElement('div');
        tip.style.cssText = 'font-size:12px;opacity:0.75;font-style:italic;padding:10px;background:rgba(11,15,23,0.1);border-radius:8px;';
        tip.innerHTML = '💡 <strong>Tip:</strong> Scan more conversations about related topics to discover connections.';
        notification.appendChild(tip);

        const dismissBtn = document.createElement('button');
        dismissBtn.textContent = 'Got it';
        dismissBtn.setAttribute('aria-label', 'Acknowledge message');
        dismissBtn.style.cssText = 'width:100%;margin-top:12px;background:rgba(11,15,23,0.25);color:#0b0f17;border:none;padding:10px 12px;border-radius:8px;cursor:pointer;font-weight:600;font-size:12px;font-family:inherit;transition:all 0.2s;';
        dismissBtn.addEventListener('mouseenter', () => {
          dismissBtn.style.background = 'rgba(11,15,23,0.35)';
          dismissBtn.style.transform = 'translateY(-1px)';
        });
        dismissBtn.addEventListener('mouseleave', () => {
          dismissBtn.style.background = 'rgba(11,15,23,0.25)';
          dismissBtn.style.transform = 'translateY(0)';
        });
        dismissBtn.addEventListener('click', () => notification.remove());
        notification.appendChild(dismissBtn);

        // Remove existing notification if any
        const existing = document.getElementById('cb-context-notification');
        if (existing) existing.remove();

        document.body.appendChild(notification);

        // Auto-dismiss after 12 seconds
        setTimeout(() => {
          try { if (notification.parentNode) notification.remove(); } catch (e) { }
        }, 12000);

      } catch (e) {
        debugLog('showNoConnectionsMessage error', e);
      }
    }

    // Scan button handler: scan first, then save, then background tasks (RAG/MCP)
    btnScan.addEventListener('click', async () => {
      const scanStartTime = Date.now();
      addLoadingToButton(btnScan, 'Scanning');
      status.textContent = 'Status: scanning...';
      preview.textContent = 'Preview: Scanning messages...';
      announce('Scanning conversation now');

      try {
        // STEP 1: Pure scan - extract messages only (fast)
        status.textContent = 'Status: extracting messages...';
        const msgs = await scanChat();
        const scanDuration = Date.now() - scanStartTime;
        debugLog(`[Scan] Extraction completed in ${scanDuration}ms`);

        // persist lastScannedText for clipboard and Sync view
        try {
          if (Array.isArray(msgs) && msgs.length) {
            lastScannedText = msgs.map(m => `${m.role}: ${m.text}`).join('\n\n');
          }
        } catch (e) { }

        if (!msgs || !msgs.length) {
          // Check if there were errors during scan
          let errorMsg = 'No messages found in current chat';
          try {
            if (window.ChatBridge && window.ChatBridge._lastScan && window.ChatBridge._lastScan.errors && window.ChatBridge._lastScan.errors.length) {
              errorMsg += '\n\nErrors: ' + window.ChatBridge._lastScan.errors.join(', ');
              console.error('[ChatBridge] Scan errors:', window.ChatBridge._lastScan.errors);
            }
            if (window.ChatBridge && window.ChatBridge._lastScan) {
              console.log('[ChatBridge] Scan debug info:', {
                adapter: window.ChatBridge._lastScan.adapterId,
                container: window.ChatBridge._lastScan.chosenContainer,
                nodesConsidered: window.ChatBridge._lastScan.nodesConsidered,
                errors: window.ChatBridge._lastScan.errors
              });
            }
          } catch (e) { }

          status.textContent = 'Status: no messages';
          preview.textContent = 'Preview: No messages found. Try scrolling to load more chat history.';
          toast(errorMsg);
          announce('Scan completed: no messages found');
        } else {
          status.textContent = 'Status: processing...';
          const final = normalizeMessages(msgs);
          const currentModel = detectCurrentModel();

          // Count user vs AI messages for better feedback
          const userMsgs = final.filter(m => m.role === 'user').length;
          const aiMsgs = final.filter(m => m.role === 'assistant').length;

          const conv = {
            platform: location.hostname,
            url: location.href,
            ts: Date.now(),
            id: String(Date.now()),
            model: currentModel,
            conversation: final
          };

          // ensure lastScannedText updated when saving
          try {
            lastScannedText = final.map(m => `${m.role}: ${m.text}`).join('\n\n');
          } catch (e) { }

          // CRITICAL: Store scan result in central location for ALL sections to access
          try {
            window.ChatBridge = window.ChatBridge || {};
            window.ChatBridge._lastScanData = {
              messages: final,
              text: lastScannedText,
              conversation: conv,
              timestamp: Date.now(),
              platform: conv.platform,
              model: currentModel
            };
            // Define getLastScan function if not exists
            if (typeof window.ChatBridge.getLastScan !== 'function') {
              window.ChatBridge.getLastScan = function () {
                return window.ChatBridge._lastScanData || null;
              };
            }
            debugLog('[Scan] Stored in ChatBridge.getLastScan() - messages:', final.length);
          } catch (e) {
            debugLog('[Scan] Failed to store in ChatBridge:', e);
          }

          // STEP 2: Save conversation (quick - local storage)
          status.textContent = 'Status: saving...';
          try {
            await saveConversation(conv);
            const totalDuration = Date.now() - scanStartTime;

            // Show success with detailed count
            const successMsg = `✓ Saved ${final.length} messages (${userMsgs} user, ${aiMsgs} AI) in ${totalDuration}ms`;
            toast(successMsg);
            status.textContent = `Status: ${final.length} msgs saved`;

            // Show preview of first message
            const firstUser = final.find(m => m.role === 'user');
            const previewText = firstUser ? firstUser.text.slice(0, 150) : (final[0]?.text || '').slice(0, 150);
            preview.textContent = `Preview: "${previewText}${previewText.length >= 150 ? '...' : ''}"`;

            // Auto-select this conversation for other features
            try {
              window.ChatBridge.selectedConversation = conv;
            } catch (e) { }

            refreshHistory();
            announce('Scan complete, conversation saved');
          } catch (saveError) {
            debugLog('Save failed', saveError);
            toast('Save failed: ' + (saveError.message || 'unknown error'));
            status.textContent = `Status: save failed`;
            preview.textContent = 'Preview: Save failed - ' + (saveError.message || 'unknown error');
          }

          // STEP 3: Background tasks AFTER scan+save complete (non-blocking)
          // Use setTimeout to ensure UI update happens first
          setTimeout(() => {
            (async () => {
              try {
                // RAG indexing (only if 3+ messages)
                if (final.length >= 3 && typeof window.RAGEngine !== 'undefined' && typeof window.RAGEngine.indexConversation === 'function') {
                  debugLog('[Background] Starting RAG indexing...');
                  for (let i = 0; i < final.length; i++) {
                    const msg = final[i];
                    const msgId = `${conv.id}_msg_${i}`;
                    const msgText = `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}`;
                    try {
                      await window.RAGEngine.indexConversation(msgId, msgText, {
                        platform: conv.platform,
                        url: conv.url,
                        timestamp: conv.ts,
                        messageIndex: i,
                        messageRole: msg.role,
                        conversationId: conv.id
                      });
                    } catch (e) {
                      debugLog('[RAG] Message', i, 'indexing failed:', e);
                    }
                  }
                  debugLog('[Background] RAG indexing complete for', final.length, 'messages');
                }

                // Auto-summarize for longer conversations (15+ messages)
                if (final.length > 15) {
                  debugLog('[Background] Starting auto-summarize...');
                  const summaryPrompt = `Summarize this chat concisely:\n\n${final.slice(0, 30).map(m => `${m.role}: ${m.text.slice(0, 200)}`).join('\n')}`;
                  try {
                    const res = await callGeminiAsync({ action: 'prompt', text: summaryPrompt, length: 'short' });
                    if (res && res.ok && res.result) {
                      conv.summary = res.result.trim();
                      await saveConversation(conv);
                      debugLog('[Background] Auto-summary saved');
                    }
                  } catch (e) {
                    debugLog('[Background] Auto-summarize failed:', e);
                  }
                }
              } catch (e) {
                debugLog('[Background] Background tasks error:', e);
              }
            })();
          }, 50); // Small delay to let UI update first
        }
      } catch (e) {
        console.error('[ChatBridge] Scan error:', e);
        status.textContent = 'Status: error';
        toast('Scan failed: ' + (e && e.message));
        showError('Scan failed: ' + (e && e.message), async () => { try { btnScan.click(); } catch (_) { } });
        announce('Scan failed');
      } finally {
        // CRITICAL: Always remove loading state, even if errors occurred
        try {
          removeLoadingFromButton(btnScan, '🔍 Scan Chat');
        } catch (e) {
          console.error('[ChatBridge] Failed to remove loading from scan button:', e);
          // Fallback: manually reset button
          try {
            if (btnScan) {
              btnScan.disabled = false;
              btnScan.classList.remove('cb-loading');
              btnScan.innerHTML = '🔍 Scan Chat';
            }
          } catch (_) { }
        }
      }
    });

    // Clipboard button - copy most recent output (preview, summary, rewrite, translate, sync)
    btnClipboard.addEventListener('click', async () => {
      try {
        let txt = '';

        // Priority 1: Check if any internal view is active and has output
        if (summView.classList.contains('cb-view-active') && summSourceText && summSourceText.textContent && summSourceText.textContent !== '(no conversation found)' && summSourceText.textContent !== '(no result)') {
          txt = summSourceText.textContent;
        } else if (rewView.classList.contains('cb-view-active') && rewSourceText && rewSourceText.textContent && rewSourceText.textContent !== '(no conversation found)' && rewSourceText.textContent !== '(no result)') {
          txt = rewSourceText.textContent;
        } else if (transView.classList.contains('cb-view-active') && transResult && transResult.textContent) {
          txt = transResult.textContent;
        } else if (syncView.classList.contains('cb-view-active') && syncSourceText && syncSourceText.textContent && syncSourceText.textContent !== '(no conversation found)' && syncSourceText.textContent !== '(no result)') {
          txt = syncSourceText.textContent;
        }

        // Priority 2: Check preview area for recent auto-summary or restored content
        if (!txt && preview && preview.textContent && preview.textContent !== 'Preview: (none)' && !preview.textContent.startsWith('Preview:')) {
          txt = preview.textContent;
        }

        // Priority 3: Fallback to last scanned text
        if (!txt) {
          txt = lastScannedText || '';
        }

        if (!txt) { toast('Nothing to copy'); return; }
        await navigator.clipboard.writeText(txt);
        toast('Copied to clipboard');
      } catch (e) {
        try {
          // Last resort: try lastScannedText
          await navigator.clipboard.writeText(lastScannedText || '');
          toast('Copied to clipboard (fallback)');
        } catch (err) {
          toast('Copy failed');
        }
      }
    });

    // Clear History button - remove all saved conversations
    btnClearHistory.addEventListener('click', async () => {
      try {
        if (!confirm('Clear all saved conversation history? This cannot be undone.')) return;
        // Prefer background clear to wipe persistent DB and mirror
        const cleared = await new Promise((resolve) => {
          try {
            chrome.runtime.sendMessage({ type: 'clear_conversations' }, (r) => {
              if (chrome.runtime.lastError) return resolve(false);
              resolve(r && r.ok);
            });
          } catch (e) { resolve(false); }
        });
        if (!cleared) {
          // Use storage API if available
          if (typeof window.clearConversations === 'function') {
            await new Promise(res => window.clearConversations(() => res()));
          } else {
            // Fallback: clear BOTH storage locations
            try { localStorage.removeItem('chatbridge:conversations'); } catch (_) { }
            try {
              if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.remove(['chatbridge:conversations']);
              }
            } catch (_) { }
          }
        }
        toast('History cleared');
        // Clear Continuum context state
        continuumContextState = {
          unifiedContext: [],
          activeGoals: [],
          currentProgress: [],
          unresolvedItems: [],
          keyDetails: [],
          nextActions: [],
          lastUpdate: null,
          messageHistory: []
        };
        refreshHistory();
        // Clear the preview/last-scanned text
        try { preview.textContent = 'Preview: (none)'; } catch (e) { }
        lastScannedText = '';
      } catch (e) {
        toast('Clear failed: ' + (e && e.message));
      }
    });

    // ============================================
    // KNOWLEDGE GRAPH VISUALIZATION & ADVANCED FEATURES
    // ============================================

    // Agent: Open view
    btnKnowledgeGraph.addEventListener('click', async () => {
      try {
        closeAllViews();
        agentView.classList.add('cb-view-active');
        await renderAgentHub();
      } catch (e) {
        toast('Failed to open Agent Hub');
        debugLog('Agent Hub open error', e);
      }
    });

    // Agent: Close view
    btnCloseAgent.addEventListener('click', () => {
      agentView.classList.remove('cb-view-active');
    });

    // Insights: Open Smart Workspace view
    btnInsights.addEventListener('click', async () => {
      try {
        closeAllViews();
        insightsView.classList.add('cb-view-active');
        await renderInsightsHub();
      } catch (e) {
        toast('Failed to open Smart Workspace');
        debugLog('Insights open error', e);
      }
    });

    // Insights: Close view
    btnCloseInsights.addEventListener('click', () => {
      insightsView.classList.remove('cb-view-active');
    });

    // Knowledge Graph: Render force-directed graph on canvas
    async function renderKnowledgeGraph() {
      try {
        const kg = await loadKnowledgeGraph();
        const convs = await loadConversationsAsync();

        debugLog('[renderKnowledgeGraph] Starting render - kg entries:', kg.length, 'convs:', convs.length);

        if (!kg.length) {
          graphStats.innerHTML = '<div style="text-align:center;padding:20px;"><div style="font-size:48px;opacity:0.3;">📊</div><div style="margin-top:12px;opacity:0.7;">No knowledge graph data yet</div><div style="font-size:12px;margin-top:8px;opacity:0.5;">Scan some chats to build your graph!</div></div>';
          // Clear canvas to show empty state
          try {
            const ctx = graphCanvas.getContext('2d');
            ctx.fillStyle = '#0b0f17';
            ctx.fillRect(0, 0, graphCanvas.width, graphCanvas.height);
            ctx.fillStyle = 'rgba(230,207,159,0.3)';
            ctx.font = '14px Poppins';
            ctx.textAlign = 'center';
            ctx.fillText('No graph data - scan some conversations first', graphCanvas.width / 2, graphCanvas.height / 2);
          } catch (e) { debugLog('Canvas empty state render failed', e); }
          return Promise.resolve();
        }

        // Build graph data structure
        const nodes = kg.map(k => {
          const conv = convs.find(c => c.id === k.id);
          const msgCount = conv?.messages?.length || conv?.conversation?.length || 0;
          return {
            id: k.id,
            x: Math.random() * 300 + 25,
            y: Math.random() * 350 + 25,
            vx: 0,
            vy: 0,
            size: Math.min(Math.max(msgCount / 3, 6), 16),
            entities: k.entities || [],
            themes: k.themes || [],
            context: k.context || '',
            platform: conv?.platform || 'unknown',
            model: conv?.model || 'unknown',
            timestamp: conv?.ts || k.timestamp || Date.now(),
            messageCount: msgCount
          };
        });

        // Build edges based on shared entities/themes
        const edges = [];
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const n1 = nodes[i];
            const n2 = nodes[j];
            const sharedEntities = n1.entities.filter(e => n2.entities.includes(e)).length;
            const sharedThemes = n1.themes.filter(t => n2.themes.includes(t)).length;
            const strength = sharedEntities * 3 + sharedThemes * 2;

            if (strength > 0) {
              edges.push({
                source: i,
                target: j,
                strength: strength,
                width: Math.min(strength / 2, 4),
                sharedEntities: n1.entities.filter(e => n2.entities.includes(e)),
                sharedThemes: n1.themes.filter(t => n2.themes.includes(t))
              });
            }
          }
        }

        // Update stats with rich information
        const totalStrength = edges.reduce((sum, e) => sum + e.strength, 0);
        const avgConnections = edges.length > 0 ? (totalStrength / edges.length).toFixed(1) : 0;
        graphStats.innerHTML = `
          <div style="display:flex;justify-content:space-around;text-align:center;font-size:12px;">
            <div><div style="font-size:20px;font-weight:700;color:#e6cf9f;">${nodes.length}</div><div style="opacity:0.7;">Conversations</div></div>
            <div><div style="font-size:20px;font-weight:700;color:#e6cf9f;">${edges.length}</div><div style="opacity:0.7;">Connections</div></div>
            <div><div style="font-size:20px;font-weight:700;color:#e6cf9f;">${avgConnections}</div><div style="opacity:0.7;">Avg Strength</div></div>
          </div>
        `;

        // Canvas setup
        const canvas = graphCanvas;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Platform colors
        const platformColors = {
          'chatgpt.com': '#10a37f',
          'claude.ai': '#9b87f5',
          'gemini.google.com': '#4285f4',
          'copilot.microsoft.com': '#00a4ef',
          'perplexity.ai': '#6366f1',
          'chatgpt': '#10a37f',
          'claude': '#9b87f5',
          'gemini': '#4285f4',
          'copilot': '#00a4ef',
          'perplexity': '#6366f1',
          'unknown': '#6b7280'
        };

        // Interaction state
        let hoveredNode = null;
        let selectedNode = null;
        let isDragging = false;
        let dragNode = null;
        let panOffset = { x: 0, y: 0 };
        let zoom = 1;

        // Force simulation with completion tracking
        let animationFrames = 0;
        const maxFrames = 120;
        let simulationComplete = false;

        // Expose promise that resolves when simulation finishes
        const simulationPromise = new Promise(resolve => {
          window.__cbGraphSimulationResolve = resolve;
        });

        function applyForces() {
          // Repulsion between nodes
          for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
              const n1 = nodes[i];
              const n2 = nodes[j];
              const dx = n2.x - n1.x;
              const dy = n2.y - n1.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const force = 800 / (dist * dist);

              n1.vx -= (dx / dist) * force;
              n1.vy -= (dy / dist) * force;
              n2.vx += (dx / dist) * force;
              n2.vy += (dy / dist) * force;
            }
          }

          // Attraction along edges
          edges.forEach(e => {
            const n1 = nodes[e.source];
            const n2 = nodes[e.target];
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const targetDist = 100 - (e.strength * 5);
            const force = (dist - targetDist) * 0.015 * e.strength;

            n1.vx += (dx / dist) * force;
            n1.vy += (dy / dist) * force;
            n2.vx -= (dx / dist) * force;
            n2.vy -= (dy / dist) * force;
          });

          // Center gravity
          const centerX = width / 2;
          const centerY = height / 2;
          nodes.forEach(n => {
            const dx = centerX - n.x;
            const dy = centerY - n.y;
            n.vx += dx * 0.002;
            n.vy += dy * 0.002;
          });

          // Apply velocities with damping
          nodes.forEach(n => {
            if (n !== dragNode) {
              n.vx *= 0.85;
              n.vy *= 0.85;
              n.x += n.vx;
              n.y += n.vy;

              // Boundary constraints
              n.x = Math.max(n.size + 5, Math.min(width - n.size - 5, n.x));
              n.y = Math.max(n.size + 5, Math.min(height - n.size - 5, n.y));
            }
          });
        }

        function render() {
          // Clear canvas
          ctx.fillStyle = '#0b0f17';
          ctx.fillRect(0, 0, width, height);

          // DEBUG on first frame
          if (animationFrames === 0) {
            debugLog('First render frame - canvas:', canvas.width, 'x', canvas.height, 'nodes:', nodes.length, 'edges:', edges.length);
          }

          // Draw edges
          edges.forEach(e => {
            const n1 = nodes[e.source];
            const n2 = nodes[e.target];
            const isConnectedToHover = hoveredNode && (n1 === hoveredNode || n2 === hoveredNode);
            const alpha = isConnectedToHover ? Math.min(e.strength / 8, 0.7) : Math.min(e.strength / 12, 0.3);

            ctx.strokeStyle = `rgba(230, 207, 159, ${alpha})`;
            ctx.lineWidth = isConnectedToHover ? e.width * 1.5 : e.width;
            ctx.beginPath();
            ctx.moveTo(n1.x, n1.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.stroke();
          });

          // Draw nodes
          nodes.forEach(n => {
            const isHovered = n === hoveredNode;
            const isSelected = n === selectedNode;
            const platformKey = n.platform.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
            const color = platformColors[platformKey] || platformColors.unknown;

            // Glow effect for hovered/selected nodes
            if (isHovered || isSelected) {
              ctx.fillStyle = color;
              ctx.globalAlpha = 0.3;
              ctx.beginPath();
              ctx.arc(n.x, n.y, n.size + 6, 0, Math.PI * 2);
              ctx.fill();
              ctx.globalAlpha = 1;
            }

            // Node circle
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
            ctx.fill();

            // Node border
            ctx.strokeStyle = isHovered || isSelected ? '#ffe7b3' : 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = isHovered || isSelected ? 2.5 : 1.5;
            ctx.stroke();

            // Message count indicator (small text inside large nodes)
            if (n.size > 10 && n.messageCount > 0) {
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 9px Poppins';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(n.messageCount, n.x, n.y);
            }
          });

          // Continue simulation
          if (animationFrames < maxFrames && !isDragging) {
            applyForces();
            animationFrames++;
            requestAnimationFrame(render);
          } else if (isDragging || hoveredNode) {
            requestAnimationFrame(render);
          } else {
            // Simulation complete - signal completion
            if (!simulationComplete) {
              simulationComplete = true;
              if (typeof window.__cbGraphSimulationResolve === 'function') {
                window.__cbGraphSimulationResolve();
                window.__cbGraphSimulationResolve = null;
              }
            }
          }
        }

        // Tooltip helper
        function showTooltip(node, x, y) {
          if (!node) {
            graphTooltip.style.display = 'none';
            return;
          }

          const date = new Date(node.timestamp).toLocaleDateString();
          const platformName = node.platform.replace(/^https?:\/\//, '').replace(/\/$/, '');
          const modelName = node.model || 'Unknown';

          let html = `<div style="font-weight:700;margin-bottom:6px;color:#ffe7b3;">${platformName}</div>`;
          html += `<div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Model: ${modelName}</div>`;
          html += `<div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Messages: ${node.messageCount}</div>`;
          html += `<div style="font-size:11px;opacity:0.8;margin-bottom:6px;">Date: ${date}</div>`;

          if (node.context) {
            html += `<div style="font-size:11px;margin-top:6px;padding-top:6px;border-top:1px solid rgba(230,207,159,0.2);">${node.context.slice(0, 80)}${node.context.length > 80 ? '...' : ''}</div>`;
          }

          if (node.entities && node.entities.length > 0) {
            html += `<div style="font-size:10px;margin-top:6px;opacity:0.7;">🏷️ ${node.entities.slice(0, 3).join(', ')}</div>`;
          }

          html += `<div style="font-size:10px;margin-top:8px;opacity:0.6;font-style:italic;">Click to open conversation</div>`;

          graphTooltip.innerHTML = html;
          graphTooltip.style.display = 'block';
          graphTooltip.style.left = (x + 15) + 'px';
          graphTooltip.style.top = (y - 10) + 'px';
        }

        // Mouse interaction handlers
        canvas.addEventListener('mousemove', (e) => {
          const rect = canvas.getBoundingClientRect();
          const x = ((e.clientX - rect.left) * canvas.width) / rect.width;
          const y = ((e.clientY - rect.top) * canvas.height) / rect.height;

          if (isDragging && dragNode) {
            dragNode.x = x;
            dragNode.y = y;
            dragNode.vx = 0;
            dragNode.vy = 0;
            render();
            return;
          }

          // Find hovered node
          const oldHovered = hoveredNode;
          hoveredNode = nodes.find(n => {
            const dx = n.x - x;
            const dy = n.y - y;
            return Math.sqrt(dx * dx + dy * dy) <= n.size;
          });

          if (hoveredNode !== oldHovered) {
            canvas.style.cursor = hoveredNode ? 'pointer' : 'grab';
            if (hoveredNode) {
              showTooltip(hoveredNode, e.clientX - rect.left, e.clientY - rect.top);
            } else {
              showTooltip(null);
            }
            render();
          } else if (hoveredNode) {
            showTooltip(hoveredNode, e.clientX - rect.left, e.clientY - rect.top);
          }
        });

        canvas.addEventListener('mousedown', (e) => {
          const rect = canvas.getBoundingClientRect();
          const x = ((e.clientX - rect.left) * canvas.width) / rect.width;
          const y = ((e.clientY - rect.top) * canvas.height) / rect.height;

          dragNode = nodes.find(n => {
            const dx = n.x - x;
            const dy = n.y - y;
            return Math.sqrt(dx * dx + dy * dy) <= n.size;
          });

          if (dragNode) {
            isDragging = true;
            canvas.style.cursor = 'grabbing';
          }
        });

        canvas.addEventListener('mouseup', (e) => {
          if (isDragging && dragNode) {
            isDragging = false;
            dragNode = null;
            canvas.style.cursor = hoveredNode ? 'pointer' : 'grab';
          }
        });

        canvas.addEventListener('mouseleave', () => {
          hoveredNode = null;
          showTooltip(null);
          if (isDragging) {
            isDragging = false;
            dragNode = null;
          }
          canvas.style.cursor = 'grab';
          render();
        });

        canvas.addEventListener('click', (e) => {
          if (isDragging) return;

          const rect = canvas.getBoundingClientRect();
          const x = ((e.clientX - rect.left) * canvas.width) / rect.width;
          const y = ((e.clientY - rect.top) * canvas.height) / rect.height;

          const clicked = nodes.find(n => {
            const dx = n.x - x;
            const dy = n.y - y;
            return Math.sqrt(dx * dx + dy * dy) <= n.size;
          });

          if (clicked) {
            openConversationById(clicked.id);
            graphView.classList.remove('cb-view-active');
          }
        });

        // Keyboard support for canvas: pan with arrows, enter to open hovered node
        canvas.addEventListener('keydown', (e) => {
          try {
            if (!e) return;
            if (e.key && e.key.startsWith('Arrow')) {
              const delta = 12;
              if (e.key === 'ArrowLeft') nodes.forEach(n => n.x += delta);
              if (e.key === 'ArrowRight') nodes.forEach(n => n.x -= delta);
              if (e.key === 'ArrowUp') nodes.forEach(n => n.y += delta);
              if (e.key === 'ArrowDown') nodes.forEach(n => n.y -= delta);
              render();
              announce('Panned graph');
              e.preventDefault();
              return;
            }
            if (e.key === 'Enter' || e.key === ' ') {
              // activate hovered node or nearest node to center
              const node = hoveredNode || nodes[0];
              if (node) { openConversationById(node.id); graphView.classList.remove('cb-view-active'); announce('Opened conversation'); }
              e.preventDefault();
            }
          } catch (err) { debugLog('canvas keydown', err); }
        });

        // DEBUG: Force immediate render to show something
        try {
          ctx.fillStyle = '#0b0f17';
          ctx.fillRect(0, 0, width, height);
          debugLog('Initial canvas clear done, starting render loop with', nodes.length, 'nodes');
        } catch (e) {
          debugLog('Canvas initial clear failed', e);
        }

        // Start rendering loop
        render();

        // Return promise that resolves when simulation completes
        return simulationPromise;

      } catch (e) {
        debugLog('renderKnowledgeGraph error', e);
        graphStats.innerHTML = '<div style="color:#ff6b6b;text-align:center;">❌ Error rendering graph. Try refreshing.</div>';
        return Promise.resolve(); // Return resolved promise on error
      }
    }

    // Load knowledge graph from storage
    async function loadKnowledgeGraph() {
      try {
        const raw = await Storage.get('chatbridge:knowledge_graph');
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        debugLog('loadKnowledgeGraph error', e);
        return [];
      }
    }

    // Contradiction Detection: Compare new knowledge against existing
    async function detectContradictions(newKnowledge) {
      try {
        const kg = await loadKnowledgeGraph();
        if (!kg.length) return [];

        const contradictions = [];

        // Compare new conclusions against past conclusions for same entities/themes
        for (const oldK of kg) {
          // Check entity overlap
          const sharedEntities = (newKnowledge.entities || []).filter(e =>
            (oldK.entities || []).includes(e)
          );

          if (sharedEntities.length === 0) continue; // No overlap

          // Check for conflicting conclusions
          const oldConclusions = (oldK.conclusions || []).map(c => c.toLowerCase());
          const newConclusions = (newKnowledge.conclusions || []).map(c => c.toLowerCase());

          for (const newC of newConclusions) {
            for (const oldC of oldConclusions) {
              // Simple contradiction detection: opposite words
              const contradictoryPairs = [
                ['better', 'worse'],
                ['faster', 'slower'],
                ['easier', 'harder'],
                ['recommended', 'not recommended'],
                ['use', 'avoid'],
                ['enable', 'disable'],
                ['good', 'bad'],
                ['secure', 'insecure'],
                ['safe', 'unsafe']
              ];

              for (const [word1, word2] of contradictoryPairs) {
                if ((newC.includes(word1) && oldC.includes(word2)) ||
                  (newC.includes(word2) && oldC.includes(word1))) {
                  contradictions.push({
                    entity: sharedEntities[0],
                    oldConclusion: oldC,
                    newConclusion: newC,
                    oldId: oldK.id,
                    newId: newKnowledge.id,
                    confidence: 0.7
                  });
                }
              }
            }
          }
        }

        return contradictions;
      } catch (e) {
        debugLog('detectContradictions error', e);
        return [];
      }
    }

    // Show contradiction alert
    function showContradictionAlert(contradictions) {
      if (!contradictions.length) return;

      try {
        const alert = document.createElement('div');
        alert.id = 'cb-contradiction-alert';
        alert.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
          color: white;
          padding: 16px 20px;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(220, 38, 38, 0.3);
          z-index: 999999;
          max-width: 400px;
          animation: cb-slide-in 0.3s ease-out;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        `;

        const title = document.createElement('div');
        title.textContent = '⚠️ Potential Contradiction Detected';
        title.style.cssText = 'font-weight: 600; font-size: 14px; margin-bottom: 8px;';
        alert.appendChild(title);

        const message = document.createElement('div');
        message.textContent = `Found ${contradictions.length} conflicting conclusion${contradictions.length > 1 ? 's' : ''} about ${contradictions[0].entity}`;
        message.style.cssText = 'font-size: 13px; margin-bottom: 12px; opacity: 0.95;';
        alert.appendChild(message);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;';

        const viewBtn = document.createElement('button');
        viewBtn.textContent = 'Review';
        viewBtn.style.cssText = 'flex:1;background:rgba(255,255,255,0.2);color:white;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:500;font-size:12px;font-family:inherit;';
        viewBtn.addEventListener('click', () => {
          // Show details in console for now
          console.log('[ChatBridge] Contradictions:', contradictions);
          toast('Check console for contradiction details');
          alert.remove();
        });

        const dismissBtn = document.createElement('button');
        dismissBtn.textContent = 'Dismiss';
        dismissBtn.style.cssText = 'flex:1;background:rgba(0,0,0,0.2);color:white;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:500;font-size:12px;font-family:inherit;';
        dismissBtn.addEventListener('click', () => alert.remove());

        btnRow.appendChild(viewBtn);
        btnRow.appendChild(dismissBtn);
        alert.appendChild(btnRow);

        // Remove existing alert if any
        const existing = document.getElementById('cb-contradiction-alert');
        if (existing) existing.remove();

        document.body.appendChild(alert);

        // Auto-dismiss after 20 seconds
        setTimeout(() => {
          try { if (alert.parentNode) alert.remove(); } catch (e) { }
        }, 20000);

      } catch (e) {
        debugLog('showContradictionAlert error', e);
      }
    }

    // Multi-hop Discovery: Find indirect connections (A→B→C)
    async function discoverMultiHopConnections(conversationId, maxHops = 2) {
      try {
        const kg = await loadKnowledgeGraph();
        const startNode = kg.find(k => k.id === conversationId);
        if (!startNode) return [];

        const visited = new Set([conversationId]);
        const paths = [];

        function findPaths(currentId, currentPath, hops) {
          if (hops >= maxHops) return;

          const current = kg.find(k => k.id === currentId);
          if (!current) return;

          // Find related nodes
          for (const node of kg) {
            if (visited.has(node.id)) continue;

            // Calculate connection strength
            const sharedEntities = (current.entities || []).filter(e =>
              (node.entities || []).includes(e)
            );
            const sharedThemes = (current.themes || []).filter(t =>
              (node.themes || []).includes(t)
            );

            if (sharedEntities.length + sharedThemes.length > 0) {
              const newPath = [...currentPath, node.id];

              // Record path if it's at least 2 hops
              if (newPath.length >= 2) {
                paths.push({
                  path: [conversationId, ...newPath],
                  entities: sharedEntities,
                  themes: sharedThemes,
                  strength: sharedEntities.length * 3 + sharedThemes.length * 2
                });
              }

              // Continue exploring
              visited.add(node.id);
              findPaths(node.id, newPath, hops + 1);
              visited.delete(node.id);
            }
          }
        }

        findPaths(conversationId, [], 0);

        // Sort by strength and return top 5
        return paths.sort((a, b) => b.strength - a.strength).slice(0, 5);

      } catch (e) {
        debugLog('discoverMultiHopConnections error', e);
        return [];
      }
    }

    // Helper: find file input near composer or anywhere visible
    function findFileInputNearComposer() {
      try {
        const adapter = (typeof window.pickAdapter === 'function') ? window.pickAdapter() : null;
        if (adapter && typeof adapter.getFileInput === 'function') {
          const ai = adapter.getFileInput(); if (ai) return ai;
        }
      } catch (e) { }
      try {
        const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
        // prefer visible ones
        for (const fi of fileInputs) {
          try {
            const cs = window.getComputedStyle(fi);
            if (cs.display !== 'none' && cs.visibility !== 'hidden') return fi;
          } catch (e) { }
        }
        // else return first if any
        return fileInputs[0] || null;
      } catch (e) { return null; }
    }

    // Helper: attach files to chat composer via <input type="file">, fallback to clipboard for images
    async function attachFilesToChat(attachments) {
      const result = { uploaded: 0, failed: [] };
      const atts = Array.isArray(attachments) ? attachments.filter(a => a && a.url) : [];
      if (!atts.length) return result;

      restoreLog('Attempting to attach', atts.length, 'files');

      let fileInput = findFileInputNearComposer();
      if (!fileInput) {
        // Fallback: try clipboard for the first image
        const img = atts.find(a => a.type === 'image');
        if (img) {
          try {
            restoreLog('No file input found, trying clipboard for image:', img.url);
            // CLOUDFLARE FIX: Use background script proxy to fetch blob
            const res = await new Promise((resolve) => {
              chrome.runtime.sendMessage({ type: 'fetch_blob', url: img.url }, resolve);
            });

            if (!res || !res.ok) {
              throw new Error(res?.error || 'Fetch failed');
            }

            // Convert base64 data URL back to blob
            const response = await fetch(res.data);
            const blob = await response.blob();
            const item = new ClipboardItem({ [res.type || 'image/png']: blob });
            await navigator.clipboard.write([item]);
            toast('Image copied to clipboard. Press Ctrl+V to paste.');
            return result;
          } catch (e) {
            restoreLog('Clipboard copy failed:', e);
            result.failed.push({ url: img.url, error: 'clipboard_failed: ' + (e.message || String(e)) });
            toast('Could not copy image. Try downloading and uploading manually.');
            return result;
          }
        }
        restoreLog('No file input found and no images to attach');
        return result;
      }

      try {
        const dt = new DataTransfer();
        const multiple = !!fileInput.multiple;
        let count = 0;

        for (const a of atts) {
          try {
            restoreLog('Fetching attachment:', a.url);
            // CLOUDFLARE FIX: Use background script proxy to fetch blob
            const res = await new Promise((resolve) => {
              chrome.runtime.sendMessage({ type: 'fetch_blob', url: a.url }, resolve);
            });

            if (!res || !res.ok) {
              restoreLog('Fetch failed:', res?.error);
              result.failed.push({ url: a.url, error: res?.error || 'fetch_failed' });
              if (!multiple) break;
              continue;
            }

            // Convert base64 data URL back to blob
            const response = await fetch(res.data);
            const blob = await response.blob();
            const name = a.name || ('attachment.' + ((blob.type && blob.type.split('/')[1]) || 'bin'));
            const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
            dt.items.add(file);
            count++;
            restoreLog('Successfully added file:', name);

            if (!multiple) break;
          } catch (e) {
            restoreLog('Attachment fetch error:', e);
            result.failed.push({ url: a.url, error: e && e.message });
            if (!multiple) break;
          }
        }

        if (count > 0) {
          fileInput.files = dt.files;
          try { fileInput.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { }
          try { fileInput.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { }
          result.uploaded = count;
          toast('Attached ' + count + ' file' + (count > 1 ? 's' : '') + ' to chat');
          restoreLog('Successfully attached', count, 'files');
        } else if (result.failed.length > 0) {
          toast('Could not attach files. Check console for details.');
        }
      } catch (e) {
        restoreLog('attachFilesToChat error:', e);
        try { console.error('[ChatBridge attachFiles] error', e); } catch (_) { }
      }

      return result;
    }

    // Helper: find a visible chat input candidate
    function findVisibleInputCandidate() {
      try {
        const candidates = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], input[type="text"], div[role="textbox"]'));
        for (const el of candidates) {
          try {
            if (el.closest && el.closest('#cb-host')) continue; // skip extension UI
            const cs = window.getComputedStyle(el);
            const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0' && el.offsetWidth > 0 && el.offsetHeight > 0;
            if (!visible) continue;
            // Skip obvious search bars/nav inputs by heuristics
            const attrs = ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('placeholder') || '')).toLowerCase();
            if (/search|find|filter|nav|menu/.test(attrs)) continue;
            return el;
          } catch (_) { }
        }
      } catch (_) { }
      return null;
    }

    async function waitForComposer(timeoutMs = 8000, pollMs = 300) {
      const start = Date.now();
      let lastErr = null;
      while (Date.now() - start < timeoutMs) {
        try {
          const el = findVisibleInputCandidate();
          if (el) return el;
        } catch (e) { lastErr = e; }
        await new Promise(r => setTimeout(r, pollMs));
      }
      if (lastErr) { try { console.warn('[ChatBridge] waitForComposer error:', lastErr); } catch (_) { } }
      return null;
    }

    // Helper: restore arbitrary text into the visible chat input on the page, and attach optional files
    async function restoreToChat(text, attachments) {
      try {
        restoreLog('Starting restoreToChat with text length:', text ? text.length : 0);
        if (!text || !text.trim()) {
          restoreLog('No text provided');
          toast('No text to insert');
          return false;
        }

        // Clean text - remove role prefixes that might have leaked from scan
        let cleanText = text.trim();
        // Remove "Assistant:", "User:", etc. from beginning of text
        cleanText = cleanText.replace(/^(Assistant|User|System|AI):\s*/i, '');
        restoreLog('Cleaned text (first 100 chars):', cleanText.slice(0, 100));

        // Try to use adapter's getInput() method first (more reliable for site-specific inputs)
        let input = null;
        try {
          const pick = (typeof window.pickAdapter === 'function') ? window.pickAdapter : null;
          const adapter = pick ? pick() : null;
          if (adapter && typeof adapter.getInput === 'function') {
            input = adapter.getInput();
            if (input) {
              restoreLog('Found input via adapter:', input.tagName);
            }
          }
        } catch (e) {
          restoreLog('Adapter.getInput() error:', e);
        }

        // Fallback to generic input finder or wait
        if (!input) {
          input = findVisibleInputCandidate();
        }

        if (!input) {
          restoreLog('Waiting for composer...');
          input = await waitForComposer(10000, 300); // Reduced timeout to 10s
        }

        if (!input) {
          restoreLog('ERROR: No input found');
          try { await navigator.clipboard.writeText(cleanText); toast('Copied to clipboard'); } catch (e) { }
          return false;
        }

        restoreLog('Found input:', input.tagName, input.isContentEditable ? 'contenteditable' : 'textarea');

        // Fast insert based on input type
        if (input.isContentEditable) {
          // For contenteditable (ChatGPT, Claude, etc.)
          input.focus();

          // Clear existing content quickly
          input.textContent = '';

          // Insert text node
          const textNode = document.createTextNode(cleanText);
          input.appendChild(textNode);

          // Trigger essential events only (reduced from multiple)
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));

          restoreLog('Inserted to contenteditable');
        } else {
          // For textarea/input
          input.focus();
          input.value = cleanText;

          // Trigger essential events
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));

          restoreLog('Inserted to textarea/input');
        }

        toast('Restored to chat');

        // Attach files if provided (async, don't block)
        if (Array.isArray(attachments) && attachments.length > 0) {
          attachFilesToChat(attachments).catch(e => {
            restoreLog('Attachment error:', e);
          });
        }

        return true;
      } catch (e) {
        restoreLog('ERROR in restoreToChat:', e);
        try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch (_) { }
        return false;
      }
    }

    // Store reference to restoreToChat function so early listener can use it
    restoreToChatFunction = restoreToChat;
    restoreLog('restoreToChat function is now ready, processing queued messages:', pendingRestoreMessages.length);

    // Process any queued messages asynchronously
    if (pendingRestoreMessages.length > 0) {
      setTimeout(async () => {
        restoreLog('Processing', pendingRestoreMessages.length, 'queued restore messages');
        while (pendingRestoreMessages.length > 0) {
          const queued = pendingRestoreMessages.shift();
          try {
            restoreLog('Processing queued restore message, text length:', queued.text ? queued.text.length : 0);
            const result = await restoreToChat(queued.text, queued.attachments);
            if (queued.sendResponse) queued.sendResponse({ ok: result });
          } catch (e) {
            console.error('[ChatBridge] Error processing queued restore message:', e);
            if (queued.sendResponse) queued.sendResponse({ ok: false, error: e && e.message });
          }
        }
      }, 100); // Small delay to ensure DOM is ready
    }

    // Persistent Restore Status helpers (visible until restore completes)
    function getOrCreateRestoreStatus() {
      try {
        let el = document.getElementById('cb-restore-status');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'cb-restore-status';
        el.setAttribute('data-cb-ignore', 'true');
        el.style.position = 'fixed';
        el.style.bottom = '80px';
        el.style.right = '26px';
        el.style.maxWidth = '360px';
        el.style.background = 'rgba(10,15,28,0.92)';
        el.style.color = '#E6E9F0';
        el.style.padding = '10px 14px';
        el.style.borderRadius = '12px';
        el.style.zIndex = '2147483647';
        el.style.border = '1px solid rgba(0,180,255,0.28)';
        el.style.boxShadow = '0 8px 24px rgba(0,180,255,0.25)';
        el.style.fontSize = '13px';
        el.style.fontWeight = '600';
        el.style.letterSpacing = '0.2px';
        el.style.backdropFilter = 'blur(6px)';
        el.style.display = 'none';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        document.body.appendChild(el);
        return el;
      } catch (e) { return null; }
    }

    function updateRestoreStatus(message) {
      try {
        const el = getOrCreateRestoreStatus();
        if (!el) return;
        el.textContent = `⚡ ${message}`;
        el.style.display = 'block';
      } catch (e) { }
    }

    function hideRestoreStatus(success = true) {
      try {
        const el = document.getElementById('cb-restore-status');
        if (!el) return;
        if (success) {
          el.textContent = '✅ Restored';
          setTimeout(() => { try { el.remove(); } catch (_) { } }, 1400);
        } else {
          el.remove();
        }
      } catch (e) { }
    }

    btnRestore.addEventListener('click', async () => {
      try {
        // Priority 1: Use selected conversation from history (if user clicked "Open" previously)
        let sel = null;
        try {
          if (window.ChatBridge && window.ChatBridge.selectedConversation &&
            window.ChatBridge.selectedConversation.conversation &&
            window.ChatBridge.selectedConversation.conversation.length > 0) {
            sel = window.ChatBridge.selectedConversation;
            debugLog('[Restore] Using selected conversation from history');
          }
        } catch (e) { }

        // Priority 2: Load from saved conversations
        if (!sel) {
          const list = await loadConversationsAsync();
          const arr = Array.isArray(list) ? list : [];
          if (!arr.length) { toast('No saved conversations'); return; }
          // Use most recent conversation
          sel = arr[0];
        }

        if (!sel || !sel.conversation || !sel.conversation.length) {
          toast('No messages in selected conversation');
          return;
        }

        // Count messages for user feedback
        const userMsgs = sel.conversation.filter(m => m.role === 'user').length;
        const aiMsgs = sel.conversation.filter(m => m.role === 'assistant').length;
        const msgCount = sel.conversation.length;
        const platform = sel.platform || 'unknown';
        const model = sel.model || '';

        // Show toast with what's being restored (no confirmation needed)
        toast(`Restoring ${msgCount} msgs from ${platform}${model ? ' (' + model + ')' : ''}...`);

        // Auto-summarize if 10+ messages to preserve context without overwhelming the chat
        let formatted = '';
        if (msgCount >= 10 && (!sel.summary || sel.summary.trim().length === 0)) {
          // Auto-summarize for better context preservation with persistent status
          updateRestoreStatus(`Preparing autosummary for ${msgCount} messages...`);
          try {
            const fullText = sel.conversation.map(m => `${m.role}: ${m.text}`).join('\n\n');
            const RESTORE_MERGE_PROMPT = 'You are generating a long, transfer-ready summary of a multi-turn conversation suitable for ANY AI tool (ChatGPT, Claude, Gemini, Copilot, etc.).\n\n'
              + 'Output STRICTLY in clean Markdown with the following sections:\n\n'
              + '1) Executive Overview\n'
              + '2) Participants & Roles (only if inferable)\n'
              + '3) Timeline of Discussion (chronological highlights)\n'
              + '4) Key Topics & Decisions\n'
              + '5) Context, Requirements & Constraints\n'
              + '6) Action Items (with owners if present)\n'
              + '7) Risks, Unknowns & Follow-ups\n'
              + '8) Contradictions or Conflicts to Resolve\n'
              + '9) Model/Platform Nuances Mentioned\n'
              + '10) Attachments & Artifacts (summarize any referenced files/images)\n'
              + '11) Source Quotes (short key quotes with message # if inferable)\n'
              + '12) Next Prompt (one-line suggestion to continue)\n\n'
              + 'Guidelines:\n'
              + '- Preserve all facts; do NOT fabricate missing details.\n'
              + '- Be comprehensive but concise (no fluff/no meta commentary).\n'
              + '- Prefer bullet points and sub-bullets for readability.\n'
              + '- Keep code blocks, URLs, and examples intact where relevant.\n'
              + '- Optimize for immediate handoff to any AI chat input.\n';
            const opts = {
              chunkSize: 14000,
              maxParallel: 3,
              length: 'comprehensive',
              summaryType: 'transfer',
              mergePrompt: RESTORE_MERGE_PROMPT,
              onProgress: (ev) => {
                try {
                  if (!ev || !ev.phase) return;
                  if (ev.phase === 'preparing') updateRestoreStatus('Preparing autosummary...');
                  else if (ev.phase === 'chunking') updateRestoreStatus(`Splitting into ${ev.total || '?'} chunks...`);
                  else if (ev.phase === 'chunk') updateRestoreStatus(`Summarizing chunk ${ev.index || '?'} of ${ev.total || '?'}...`);
                  else if (ev.phase === 'merging') updateRestoreStatus('Merging summaries into transfer-ready format...');
                  else if (ev.phase === 'done') updateRestoreStatus('Summary ready. Restoring to chat...');
                } catch (_) { }
              }
            };
            const summary = await hierarchicalSummarize(fullText, opts);
            formatted = summary + '\n\n🔄 Please continue based on this context.';
            // Save summary for future use
            sel.summary = summary;
            await saveConversation(sel);
          } catch (sumErr) {
            debugLog('Auto-summarize failed, using full text', sumErr);
            updateRestoreStatus('Autosummary failed. Falling back to full text...');
            formatted = sel.conversation.map(m => (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.text).join('\n\n') + '\n\n🔄 Please continue the conversation.';
          }
        } else if (sel.summary && typeof sel.summary === 'string' && sel.summary.trim().length > 0) {
          // Use existing summary
          updateRestoreStatus('Using existing saved summary. Restoring to chat...');
          formatted = sel.summary.trim();
        } else {
          // Use full conversation for small chats
          updateRestoreStatus('Small chat detected. Restoring full conversation...');
          formatted = sel.conversation.map(m => (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.text).join('\n\n') + '\n\n🔄 Please continue the conversation.';
        }
        // Collect attachments from conversation
        const allAtts = [];
        try {
          for (const m of sel.conversation) {
            if (Array.isArray(m.attachments) && m.attachments.length) allAtts.push(...m.attachments);
          }
        } catch (e) { }

        // Use the restoreToChat function which has all the proper logic
        updateRestoreStatus('Restoring into the chat composer...');
        const success = await restoreToChat(formatted, allAtts);
        if (success) hideRestoreStatus(true); else hideRestoreStatus(false);
        if (!success) {
          // If restore failed, copy to clipboard as fallback
          try {
            await navigator.clipboard.writeText(formatted);
            toast('Copied to clipboard (paste into chat)');
            // Attempt to put first image on clipboard as well
            const img = allAtts.find(a => a.kind === 'image');
            if (img) {
              // CLOUDFLARE FIX: Use background proxy for fetch
              chrome.runtime.sendMessage({ type: 'fetch_blob', url: img.url }, async (res) => {
                if (res && res.ok) {
                  try {
                    const response = await fetch(res.data);
                    const blob = await response.blob();
                    const item = new ClipboardItem({ [res.type || 'image/png']: blob });
                    await navigator.clipboard.write([item]);
                    toast('Image copied too');
                  } catch (e) { }
                }
              });
            }
          } catch (_) { }
        }
      } catch (e) { toast('Restore failed'); }
    });


    // ========================= Ramble Filter (Post-Processing) =========================
    /**
     * Clean AI model output locally:
     * - Remove meta-text and disclaimers
     * - Remove repeated sentences
     * - Shorten verbose intros/outros
     * - Normalize formatting
     * Preserves meaning and core content.
     */

    const META_PATTERNS = [
      /^(As an AI (language model|assistant)|I'm (an AI|a language model)|I don't have personal|I cannot (actually|physically)|I must (remind you|clarify|note)|It's important to note|Please note|I should mention|I want to (emphasize|clarify|note)|Let me (clarify|explain)|To be clear)[^.!?]*[.!?]\s*/gim,
      /\b(I('m| am) not able to|I (can't|cannot) (provide|give|offer) personal|as (a|an) AI,? I)[^.!?]*[.!?]\s*/gi,
      /\b(however,? it's worth noting|it's important to understand|keep in mind|bear in mind|note that)\b/gi,
      /\*\*Disclaimer:?\*\*[^]*?(\n\n|$)/gi,
      /\(Disclaimer:[^)]*\)/gi
    ];

    const VERBOSE_INTROS = [
      /^(Certainly|Sure|Of course|Absolutely|Great question|That's a good question|I'd be happy to help|Let me help you with that|Here's what (I can tell you|you need to know))[.!,]\s*/i,
      /^(Based on (your question|what you've (described|mentioned|asked))|In response to your question)[,:]?\s*/i,
      /^To answer your question[,:]?\s*/i
    ];

    const VERBOSE_OUTROS = [
      /\n\n(I hope this helps|Hope this helps|Let me know if you (have|need)|Feel free to ask|If you have any (other|further|more) questions|Is there anything else)[^]*?$/i,
      /\n\n(Please let me know|Don't hesitate to)[^]*?$/i
    ];

    const FILLER_TRANSITIONS = [
      /\b(Additionally|Furthermore|Moreover|In addition|Also|As well|What's more),?\s+/gi,
      /\bIn other words,?\s+/gi,
      /\bThat (being )?said,?\s+/gi,
      /\bWith that in mind,?\s+/gi
    ];

    function rambleFilter(rawOutput) {
      try {
        if (!rawOutput || typeof rawOutput !== 'string') return rawOutput;

        let text = rawOutput.trim();
        const originalLength = text.length;

        // Skip for very short outputs
        if (text.length < 100) return text;

        // Step 1: Remove AI meta-text and disclaimers
        for (const pattern of META_PATTERNS) {
          text = text.replace(pattern, '');
        }

        // Step 2: Remove verbose intros (first 200 chars only)
        const intro = text.slice(0, 200);
        let cleanIntro = intro;
        for (const pattern of VERBOSE_INTROS) {
          cleanIntro = cleanIntro.replace(pattern, '');
        }
        if (cleanIntro !== intro) {
          text = cleanIntro + text.slice(200);
        }

        // Step 3: Remove verbose outros
        for (const pattern of VERBOSE_OUTROS) {
          text = text.replace(pattern, '');
        }

        // Step 4: Remove filler transitions
        for (const pattern of FILLER_TRANSITIONS) {
          text = text.replace(pattern, '');
        }

        // Step 5: Deduplicate repeated sentences
        const lines = text.split('\n');
        const uniqueLines = [];
        const seenNormalized = new Set();

        for (const line of lines) {
          const trimmed = line.trim();

          // Keep empty lines for structure
          if (!trimmed) {
            // Avoid consecutive empty lines
            if (uniqueLines.length > 0 && uniqueLines[uniqueLines.length - 1] !== '') {
              uniqueLines.push('');
            }
            continue;
          }

          // Normalize for comparison (remove punctuation, lowercase)
          const normalized = trimmed.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

          // Skip if we've seen this exact content
          if (normalized.length > 15 && seenNormalized.has(normalized)) {
            continue;
          }

          seenNormalized.add(normalized);
          uniqueLines.push(trimmed);
        }

        text = uniqueLines.join('\n');

        // Step 6: Normalize bullet points and spacing
        text = text
          // Normalize bullet markers
          .replace(/^[\s]*[-*+]\s+/gm, '• ')
          .replace(/^[\s]*(\d+)\.\s+/gm, '$1. ')
          // Fix spacing around headers
          .replace(/^(#{1,6})\s*([^\n]+)\s*$/gm, '$1 $2')
          // Remove excessive newlines (max 2)
          .replace(/\n{3,}/g, '\n\n')
          // Fix spacing before punctuation
          .replace(/\s+([,.!?;:])/g, '$1')
          // Remove trailing spaces
          .replace(/[ \t]+$/gm, '');

        // Step 7: Shorten redundant sentence starters
        text = text
          .replace(/^It is important to note that\s+/gim, '')
          .replace(/^It('s| is) worth mentioning that\s+/gim, '')
          .replace(/^You (should|might|may) want to\s+/gim, '')
          .replace(/^One thing to (consider|remember|keep in mind) is that\s+/gim, '');

        // Step 8: Clean up conversational hedging within sentences
        text = text
          .replace(/\s+might want to consider\s+/gi, ' ')
          .replace(/\s+you may want to\s+/gi, ' ')
          .replace(/\s+it would be (a good idea|advisable|wise) to\s+/gi, ' ')
          .replace(/\s+I would (recommend|suggest) that you\s+/gi, ' ');

        // Final cleanup
        text = text.trim();

        const reduction = originalLength > 0 ? Math.round((1 - text.length / originalLength) * 100) : 0;

        if (reduction > 5 && window.ChatBridge && window.ChatBridge._debug) {
          console.log(`[Ramble Filter] Cleaned ${reduction}% (${originalLength} → ${text.length} chars)`);
        }

        return text;
      } catch (e) {
        console.error('[Ramble Filter] Failed:', e);
        return rawOutput; // Return original on error
      }
    }

    // ========================= Prompt Optimizer =========================
    /**
     * Compress user input before sending to model:
     * - Remove filler phrases, repeated sentences, greetings
     * - Collapse paragraphs into concise bullet points
     * - Detect and structure multiple questions
     * - Preserve essential context and original meaning
     */

    const FILLER_PHRASES = [
      /\b(um|uh|like|you know|I mean|basically|actually|literally|obviously|honestly|just|really|very|quite|perhaps|maybe|kind of|sort of)\b/gi,
      /\b(I was wondering if|I'd like to know|could you please|would you mind|if you could|I want to|I need to|can you|please)\b/gi,
      /^(hi|hello|hey|greetings|good morning|good afternoon|good evening)[,!\s]*/i,
      /\b(thank you|thanks|thx|appreciate it|cheers)[\s!.]*$/i
    ];

    const REDUNDANT_PATTERNS = [
      /\b(the thing is|what I'm trying to say is|to be honest|in my opinion|I think that|it seems like)\b/gi,
      /\b(as I said|as mentioned|like I said|as I mentioned)\b/gi
    ];

    function optimizePrompt(rawText) {
      try {
        if (!rawText || typeof rawText !== 'string') return rawText;

        let text = rawText.trim();
        const originalLength = text.length;

        // Skip optimization for very short prompts
        if (text.length < 80) return text;

        // Step 1: Remove filler phrases
        for (const pattern of FILLER_PHRASES) {
          text = text.replace(pattern, '');
        }
        for (const pattern of REDUNDANT_PATTERNS) {
          text = text.replace(pattern, '');
        }

        // Step 2: Normalize whitespace
        text = text.replace(/\s+/g, ' ').trim();

        // Step 3: Detect and deduplicate repeated sentences
        const sentences = text.split(/([.!?]+\s+)/).filter(s => s.trim());
        const uniqueSentences = [];
        const seenHashes = new Set();

        for (let i = 0; i < sentences.length; i++) {
          const sent = sentences[i].trim();
          if (!sent || /^[.!?,;:\s]+$/.test(sent)) {
            if (uniqueSentences.length > 0) uniqueSentences[uniqueSentences.length - 1] += sent;
            continue;
          }

          // Hash sentence (normalize case/punctuation for comparison)
          const normalized = sent.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
          const hash = normalized.slice(0, 50); // Use first 50 chars as hash

          if (!seenHashes.has(hash)) {
            seenHashes.add(hash);
            uniqueSentences.push(sent);
          }
        }

        text = uniqueSentences.join(' ');

        // Step 4: Detect multiple questions and structure them
        const questions = text.match(/[^.!?]*\?/g);
        if (questions && questions.length > 2) {
          // Extract questions
          const cleanQuestions = questions.map(q => q.trim()).filter(q => q.length > 5);

          // Extract non-question context
          let context = text;
          for (const q of questions) {
            context = context.replace(q, '');
          }
          context = context.replace(/[.!?]+\s*/g, '. ').trim();

          // Rebuild: context first, then structured questions
          if (context.length > 10) {
            text = context + '\n\nQuestions:\n' + cleanQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n');
          } else {
            text = 'Questions:\n' + cleanQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n');
          }
        }

        // Step 5: Collapse paragraphs into bullets (if long-form text)
        if (text.length > 400 && !text.includes('\n') && !text.startsWith('Questions:')) {
          const parts = text.split(/\.\s+/).filter(p => p.trim().length > 10);

          if (parts.length > 3) {
            // Group related sentences (simple heuristic: topic word overlap)
            const bullets = [];
            let currentBullet = '';

            for (let i = 0; i < parts.length; i++) {
              const part = parts[i].trim();

              if (currentBullet.length === 0) {
                currentBullet = part;
              } else if (currentBullet.length + part.length < 120) {
                // Combine short related sentences
                currentBullet += '. ' + part;
              } else {
                // Start new bullet
                bullets.push(currentBullet);
                currentBullet = part;
              }
            }

            if (currentBullet) bullets.push(currentBullet);

            // Only use bullets if we actually reduce complexity
            if (bullets.length >= 2 && bullets.length < parts.length) {
              text = bullets.map(b => '• ' + b + (b.endsWith('.') ? '' : '.')).join('\n');
            }
          }
        }

        // Step 6: Final cleanup
        text = text.replace(/\s+([,.!?;:])/g, '$1'); // Fix spacing before punctuation
        text = text.replace(/([.!?])\s*([.!?])+/g, '$1'); // Remove duplicate punctuation
        text = text.replace(/\n{3,}/g, '\n\n'); // Max 2 newlines
        text = text.trim();

        const compressed = originalLength > 0 ? Math.round((1 - text.length / originalLength) * 100) : 0;

        if (compressed > 5 && window.ChatBridge && window.ChatBridge._debug) {
          console.log(`[Prompt Optimizer] Compressed ${compressed}% (${originalLength} → ${text.length} chars)`);
        }

        return text;
      } catch (e) {
        console.error('[Prompt Optimizer] Failed:', e);
        return rawText; // Return original on error
      }
    }

    // ========================= Token Governor Middleware =========================
    const _CB_TOKEN_CACHE = new Map(); // key -> { ts, res }
    const _CB_TOKEN_CACHE_MAX = 50;
    const _CB_TOKEN_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

    function _normalize(str) { return String(str || '').replace(/\s+/g, ' ').trim(); }
    function _hashKey(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; } return h.toString(36); }
    function _isSimplePrompt(t) {
      const txt = _normalize(t); if (txt.length >= 200) return false;
      const q = (txt.match(/[?]/g) || []).length; const commas = (txt.match(/[,;:]/g) || []).length; const bullets = (txt.match(/[-*•]/g) || []).length;
      return (q + commas + bullets) <= 2; // low structural complexity
    }
    function _localSummary(t) {
      const txt = _normalize(t);
      const sentences = txt.split(/[.!?]\s+/).filter(s => s && s.length > 3).slice(0, 4);
      if (!sentences.length) return txt.slice(0, 180);
      return '\u2022 ' + sentences.map(s => s.trim()).join('\n\u2022 ');
    }
    function _topicCount(t) {
      const words = String(t || '').toLowerCase().split(/[^a-z0-9_]+/).filter(w => w.length >= 5);
      const stop = new Set(['about', 'which', 'there', 'their', 'would', 'could', 'should', 'these', 'those', 'think', 'using', 'thing', 'things', 'after', 'before', 'where', 'while', 'doing', 'being', 'having', 'from', 'with', 'without', 'between', 'under', 'above', 'again']);
      const freq = {}; words.forEach(w => { if (!stop.has(w)) freq[w] = (freq[w] || 0) + 1; });
      const keys = Object.keys(freq).filter(k => freq[k] >= 2);
      return Math.max(1, Math.min(5, keys.length));
    }
    function _stripRAGContextIfSparse(text) {
      try {
        const rc = (window.RAGEngine && typeof window.RAGEngine._lastRetrievedCount === 'number') ? window.RAGEngine._lastRetrievedCount : null;
        if (rc !== null && rc < 2 && /\[Relevant context from past conversations:\]/.test(text)) {
          return text.replace(/\n\n\[Relevant context from past conversations:\][\s\S]*$/, '');
        }
      } catch (_) { }
      return text;
    }
    function _tryCacheGet(key) {
      const e = _CB_TOKEN_CACHE.get(key); if (!e) return null; if ((Date.now() - e.ts) > _CB_TOKEN_CACHE_TTL_MS) { _CB_TOKEN_CACHE.delete(key); return null; } return e.res;
    }
    function _cachePut(key, res) {
      _CB_TOKEN_CACHE.set(key, { ts: Date.now(), res });
      if (_CB_TOKEN_CACHE.size > _CB_TOKEN_CACHE_MAX) { const first = _CB_TOKEN_CACHE.keys().next().value; _CB_TOKEN_CACHE.delete(first); }
    }

    async function tokenGovernor(payload, provider) {
      try {
        const action = payload && payload.action ? String(payload.action) : 'prompt';
        let text = payload && payload.text ? String(payload.text) : '';

        // Apply prompt optimization FIRST (before any other processing)
        const originalText = text;
        text = optimizePrompt(text);

        // Update payload with optimized text
        if (text !== originalText && payload) {
          payload = Object.assign({}, payload, { text });
        }

        const normalized = _normalize(text);
        const len = normalized.length;
        const key = provider + '|' + action + '|' + _hashKey(normalized) + '|' + (payload.length || '');

        // RAG sparse context strip
        if (text && /\[Relevant context from past conversations:\]/.test(text)) {
          text = _stripRAGContextIfSparse(text);
          payload = Object.assign({}, payload, { text });
        }

        // Cache reuse for identical recent queries
        const cached = _tryCacheGet(key);
        if (cached) return { intercepted: true, res: cached };

        // Small simple summarize → local fast path
        if (action === 'summarize' && _isSimplePrompt(normalized)) {
          const result = _localSummary(text);
          const res = { ok: true, result, model: 'local-fast' };
          _cachePut(key, res);
          return { intercepted: true, res };
        }

        // Sub-question decomposition skip (heuristic on instruction text)
        if (/\b(sub[- ]?question|decompose|break\s+into\s+(steps|questions)|outline)/i.test(normalized)) {
          if (_topicCount(text) <= 1) {
            const one = 'Step 1: ' + (text.replace(/"/g, '').slice(0, 80) || 'Single-focus task');
            const res = { ok: true, result: one, model: 'local-fast' };
            _cachePut(key, res);
            return { intercepted: true, res };
          }
        }

        return { intercepted: false, payload, cacheKey: key };
      } catch (_) {
        return { intercepted: false, payload, cacheKey: null };
      }
    }

    // Gemini Cloud API handlers with governor
    function callGeminiAsync(originalPayload) {
      return new Promise(async (resolve) => {
        try {
          const gov = await tokenGovernor(Object.assign({}, originalPayload), 'gemini');
          if (gov.intercepted) return resolve(gov.res);
          chrome.runtime.sendMessage({ type: 'call_gemini', payload: gov.payload }, res => {
            const out = res || { ok: false, error: 'no-response' };
            // Apply ramble filter to successful responses
            if (out && out.ok && out.result && typeof out.result === 'string') {
              out.result = rambleFilter(out.result);
            }
            if (gov.cacheKey && out && out.ok) _cachePut(gov.cacheKey, out);
            resolve(out);
          });
        } catch (e) { resolve({ ok: false, error: e && e.message }); }
      });
    }

    // OpenAI API wrapper with governor (used by EchoSynth)
    function callOpenAIAsync(originalPayload) {
      return new Promise(async (resolve) => {
        try {
          const gov = await tokenGovernor(Object.assign({ action: 'prompt' }, originalPayload), 'openai');
          if (gov.intercepted) return resolve(gov.res);
          chrome.runtime.sendMessage({ type: 'call_openai', payload: gov.payload }, res => {
            const out = res || { ok: false, error: 'no-response' };
            // Apply ramble filter to successful responses
            if (out && out.ok && out.result && typeof out.result === 'string') {
              out.result = rambleFilter(out.result);
            }
            if (gov.cacheKey && out && out.ok) _cachePut(gov.cacheKey, out);
            resolve(out);
          });
        } catch (e) { resolve({ ok: false, error: e && e.message }); }
      });
    }

    // Llama API wrapper (for rewrite/translate using HuggingFace Llama 3.1)
    function callLlamaAsync(originalPayload) {
      return new Promise(async (resolve) => {
        try {
          chrome.runtime.sendMessage({ type: 'call_llama', payload: originalPayload }, res => {
            const out = res || { ok: false, error: 'no-response' };
            // Apply ramble filter to successful responses
            if (out && out.ok && out.result && typeof out.result === 'string') {
              out.result = rambleFilter(out.result);
            }
            resolve(out);
          });
        } catch (e) { resolve({ ok: false, error: e && e.message }); }
      });
    }

    // Hierarchical summarization: chunk long text, summarize chunks in parallel, then merge
    async function hierarchicalSummarize(text, options) {
      options = options || {};
      const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
      try { onProgress && onProgress({ phase: 'preparing' }); } catch (e) { }
      const chunkSize = options.chunkSize || 12000; // characters per chunk (~12k)
      const maxParallel = options.maxParallel || 3; // number of parallel chunk summaries
      const mergePrompt = options.mergePrompt || 'Merge the following chunk summaries into a single coherent summary preserving salient points and context.';
      if (!text || typeof text !== 'string') return '';
      // Small inputs: direct summarize call
      if (text.length <= chunkSize) {
        const res = await callGeminiAsync({ action: 'summarize', text, length: options.length || 'medium', summaryType: options.summaryType || 'paragraph' });
        if (res && res.ok) { try { onProgress && onProgress({ phase: 'done' }); } catch (e) { }; return res.result; }
        throw new Error(res && res.error ? res.error : 'summarize-failed');
      }
      // Split text into chunks on paragraph boundaries to avoid cutting sentences
      const paragraphs = text.split(/\n\s*\n/);
      const chunks = [];
      let cur = '';
      for (const p of paragraphs) {
        if ((cur + '\n\n' + p).length > chunkSize && cur) { chunks.push(cur); cur = p; }
        else { cur = cur ? (cur + '\n\n' + p) : p; }
      }
      if (cur) chunks.push(cur);
      try { onProgress && onProgress({ phase: 'chunking', total: chunks.length }); } catch (e) { }

      // Summarize chunks in parallel batches to limit concurrent calls
      const summaries = [];
      // small helper to pause
      const sleep = ms => new Promise(r => setTimeout(r, ms));

      // per-chunk summarizer with retry + fallback
      async function summarizeChunk(chunkText) {
        const chunkLen = options.chunkLength || 'short';
        const summaryType = 'bullet';
        try {
          // first attempt
          const a = await callGeminiAsync({ action: 'summarize', text: chunkText, length: chunkLen, summaryType });
          if (a && a.ok) return a.result;
          debugLog('hierarchicalSummarize: chunk primary failed', a);
        } catch (e) { debugLog('hierarchicalSummarize: chunk primary threw', e); }

        // brief wait then retry once
        try { await sleep(250); } catch (e) { }
        try {
          const b = await callGeminiAsync({ action: 'summarize', text: chunkText, length: chunkLen, summaryType });
          if (b && b.ok) return b.result;
          debugLog('hierarchicalSummarize: chunk retry failed', b);
        } catch (e) { debugLog('hierarchicalSummarize: chunk retry threw', e); }

        // fallback: simpler instruction which sometimes succeeds where default fails
        try {
          const fbPrompt = 'Provide a short bullet-point summary of the following text, listing the main points.';
          const f = await callGeminiAsync({ action: 'summarize', text: chunkText, length: chunkLen, summaryType: 'paragraph', prompt: fbPrompt });
          if (f && f.ok) return f.result;
          console.error('[ChatBridge] hierarchicalSummarize: chunk fallback failed', f);
        } catch (e) { console.error('[ChatBridge] hierarchicalSummarize: chunk fallback threw', e); }

        // All API calls failed - extract key sentences as fallback
        console.warn('[ChatBridge] All Gemini API calls failed for chunk, using text extraction fallback');
        const sentences = chunkText.split(/[.!?]+/).filter(s => s.trim().length > 10).slice(0, 5);
        return '\u2022 ' + sentences.map(s => s.trim()).join('\\n\u2022 ');
      }

      for (let i = 0; i < chunks.length; i += maxParallel) {
        const batchChunks = chunks.slice(i, i + maxParallel);
        const batch = batchChunks.map((c, idx) => {
          const globalIndex = i + idx + 1;
          try { onProgress && onProgress({ phase: 'chunk', index: globalIndex, total: chunks.length }); } catch (e) { }
          return summarizeChunk(c);
        });
        const results = await Promise.all(batch);
        summaries.push(...results);
      }

      // Merge chunk summaries
      const mergeInput = summaries.map((s, idx) => `Chunk ${idx + 1}:\n${s}`).join('\n\n');
      // Primary merge attempt
      try {
        try { onProgress && onProgress({ phase: 'merging' }); } catch (e) { }
        let mergeRes = await callGeminiAsync({ action: 'summarize', text: mergeInput, length: options.length || 'medium', summaryType: options.summaryType || 'paragraph', prompt: mergePrompt });
        if (mergeRes && mergeRes.ok) { try { onProgress && onProgress({ phase: 'done' }); } catch (e) { }; return mergeRes.result; }
        debugLog('hierarchicalSummarize: primary merge failed', mergeRes);

        // Retry once with the same payload (some transient backend issues recover on retry)
        try {
          const retryRes = await callGeminiAsync({ action: 'summarize', text: mergeInput, length: options.length || 'medium', summaryType: options.summaryType || 'paragraph', prompt: mergePrompt });
          if (retryRes && retryRes.ok) { try { onProgress && onProgress({ phase: 'done' }); } catch (e) { }; return retryRes.result; }
          debugLog('hierarchicalSummarize: retry merge failed', retryRes);
        } catch (retryErr) {
          debugLog('hierarchicalSummarize: retry merge threw', retryErr);
        }

        // Fallback: ask the model to summarize the concatenated chunk summaries with a simpler instruction
        try {
          const fallbackPrompt = 'Produce a single coherent, concise summary from the following chunk summaries. Preserve the key points and overall context.';
          const fallbackRes = await callGeminiAsync({ action: 'summarize', text: mergeInput, length: options.length || 'medium', summaryType: options.summaryType || 'paragraph', prompt: fallbackPrompt });
          if (fallbackRes && fallbackRes.ok) { try { onProgress && onProgress({ phase: 'done' }); } catch (e) { }; return fallbackRes.result; }
          debugLog('hierarchicalSummarize: fallback summarize failed', fallbackRes);
        } catch (fbErr) {
          debugLog('hierarchicalSummarize: fallback summarize threw', fbErr);
        }

      } catch (e) {
        debugLog('hierarchicalSummarize: merge attempt threw', e);
      }

      // Last resort: return concatenated chunk summaries so the caller still gets useful information
      try { onProgress && onProgress({ phase: 'done' }); } catch (e) { }
      debugLog('hierarchicalSummarize: returning concatenated chunk summaries as last resort');
      return summaries.join('\n\n');
    }

    // Generic hierarchical processor for other actions (prompt/rewrite/translate)
    async function hierarchicalProcess(text, action, options) {
      options = options || {};
      const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
      try { onProgress && onProgress({ phase: 'preparing' }); } catch (e) { }
      const chunkSize = options.chunkSize || 12000;
      const maxParallel = options.maxParallel || 3;
      const mergePrompt = options.mergePrompt || `Combine the following pieces into a single coherent output that preserves context, style, and important details.`;
      const perChunkExtra = options.extraPayload || {};
      if (!text || typeof text !== 'string') return '';
      if (text.length <= chunkSize) {
        const res = await callGeminiAsync(Object.assign({ action, text }, perChunkExtra));
        if (res && res.ok) { try { onProgress && onProgress({ phase: 'done' }); } catch (e) { }; return res.result; }
        throw new Error(res && res.error ? res.error : `${action}-failed`);
      }
      const paragraphs = text.split(/\n\s*\n/);
      const chunks = [];
      let cur = '';
      for (const p of paragraphs) {
        if ((cur + '\n\n' + p).length > chunkSize && cur) { chunks.push(cur); cur = p; }
        else { cur = cur ? (cur + '\n\n' + p) : p; }
      }
      if (cur) chunks.push(cur);
      try { onProgress && onProgress({ phase: 'chunking', total: chunks.length }); } catch (e) { }

      const outputs = [];
      for (let i = 0; i < chunks.length; i += maxParallel) {
        const slice = chunks.slice(i, i + maxParallel);
        const batch = slice.map((c, idx) => {
          const globalIndex = i + idx + 1;
          try { onProgress && onProgress({ phase: 'chunk', index: globalIndex, total: chunks.length }); } catch (e) { }
          return callGeminiAsync(Object.assign({ action, text: c }, perChunkExtra)).then(r => (r && r.ok) ? r.result : ('[chunk-failed]'))
        });
        const results = await Promise.all(batch);
        outputs.push(...results);
      }

      // If merge explicitly disabled, just concatenate chunk outputs
      if (options.merge === false) { try { onProgress && onProgress({ phase: 'done' }); } catch (e) { }; return outputs.join('\n\n'); }

      // Otherwise, merge outputs via a final prompt call (use 'prompt' action for merge)
      const mergeInput = outputs.map((s, idx) => `Part ${idx + 1}:\n${s}`).join('\n\n');
      const mergeText = mergePrompt + '\n\n' + mergeInput;
      // If syncing tone, forward source/target metadata and ask backend to perform tone transfer
      if (action === 'syncTone') {
        // Construct a prompt engineering instruction for the target AI model
        const src = options.sourceModel || 'SourceModel';
        const tgt = options.targetModel || 'TargetModel';
        const tonePrompt = `You are an expert prompt engineer. Rewrite the following conversation parts so that the complete conversation is optimally structured for ${tgt} to understand and produce the best responses. Optimize prompts for clarity, context, and ${tgt}'s communication style. Preserve all factual content and user intent. The original was optimized for ${src}.\n\n${mergeInput}`;
        try { onProgress && onProgress({ phase: 'merging' }); } catch (e) { }
        const mergeRes = await callGeminiAsync({ action: 'syncTone', text: tonePrompt, length: options.length || 'medium', sourceModel: src, targetModel: tgt });
        if (mergeRes && mergeRes.ok) { try { onProgress && onProgress({ phase: 'done' }); } catch (e) { }; return mergeRes.result; }
        throw new Error('syncTone-merge-failed');
      }
      try { onProgress && onProgress({ phase: 'merging' }); } catch (e) { }
      const mergeRes = await callGeminiAsync({ action: 'prompt', text: mergeText, length: options.length || 'medium' });
      if (mergeRes && mergeRes.ok) { try { onProgress && onProgress({ phase: 'done' }); } catch (e) { }; return mergeRes.result; }
      throw new Error('merge-failed');
    }

    // Selects template via background templates and handles chunk/merge.
    // Uses Llama (HuggingFace) as primary, Gemini as fallback
    async function rewriteText(mode, text, options = {}) {
      const styleKey = mode || 'normal';
      const styleHint = options.style || options.styleHint || '';
      const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

      // Try Llama first (faster for short texts)
      if (text && text.length < 8000) {
        try {
          if (onProgress) onProgress({ phase: 'preparing' });
          const llamaRes = await callLlamaAsync({
            action: 'rewrite',
            text: text,
            rewriteStyle: styleKey,
            styleHint: styleHint
          });
          if (llamaRes && llamaRes.ok && llamaRes.result) {
            if (onProgress) onProgress({ phase: 'done' });
            return llamaRes.result;
          }
        } catch (e) {
          debugLog('[Rewrite] Llama failed, falling back to Gemini', e);
        }
      }

      // Fallback to Gemini hierarchical processing (for long texts or if Llama fails)
      const opts = {
        chunkSize: options.chunkSize || 14000,
        maxParallel: options.maxParallel || 3,
        length: options.length || 'medium',
        extraPayload: { rewriteStyle: styleKey, styleHint },
        onProgress
      };
      return await hierarchicalProcess(text, 'rewrite', opts);
    }
    // Prompt button removed in favor of Sync Tone UI (see btnSyncTone)

    btnSummarize.addEventListener('click', async () => {
      closeAllViews();
      try {
        const inputText = await getConversationText();
        summSourceText.textContent = inputText || '(no conversation found)';
        summResult.textContent = '';
        summView.classList.add('cb-view-active');
        // Auto-pick a sensible default summary type (user can still change)
        try { if (inputText && summTypeSelect) { summTypeSelect.value = pickAdaptiveSummaryType(inputText); } } catch (_) { }
      } catch (e) { toast('Failed to open Summarize'); debugLog('open summ view', e); }
    });

    btnCloseSumm.addEventListener('click', () => {
      try { summView.classList.remove('cb-view-active'); } catch (e) { }
    });

    btnGoSumm.addEventListener('click', async () => {
      try {
        btnGoSumm.disabled = true; addLoadingToButton(btnGoSumm, 'Summarizing'); summResult.textContent = ''; btnInsertSumm.style.display = 'none';
        summProg.style.display = 'inline'; updateProgress(summProg, 'summarize', { phase: 'preparing' });
        const chatText = (summSourceText && summSourceText.textContent) ? summSourceText.textContent : '';
        if (!chatText || chatText.trim().length < 10) { toast('No conversation to summarize'); btnGoSumm.disabled = false; btnGoSumm.textContent = '✨ Summarize'; return; }

        // Calculate original stats
        const origWords = chatText.trim().split(/\s+/).filter(w => w.length > 0).length;
        const origChars = chatText.length;
        updateSummStats(chatText);

        const length = (summLengthSelect && summLengthSelect.value) || 'medium';
        const summaryType = (summTypeSelect && summTypeSelect.value) || 'paragraph';
        const opts = { chunkSize: 14000, maxParallel: 3, length, summaryType, onProgress: (ev) => updateProgress(summProg, 'summarize', ev) };
        const result = await hierarchicalSummarize(chatText, opts);

        // Update text area with result and show Insert button
        summSourceText.textContent = result || '(no result)';

        // Calculate result stats and show comparison
        const resultWords = result ? result.trim().split(/\s+/).filter(w => w.length > 0).length : 0;
        const resultChars = result ? result.length : 0;
        const reduction = origWords > 0 ? Math.round((1 - resultWords / origWords) * 100) : 0;

        updateSummStats(result);
        summResult.textContent = `✅ Reduced from ${origWords.toLocaleString()} → ${resultWords.toLocaleString()} words (${reduction}% smaller)`;
        btnInsertSumm.style.display = 'inline-block';
        summProg.style.display = 'none';
        toast(`Summarized: ${reduction}% reduction`);
      } catch (err) {
        toast('Summarize failed: ' + (err && err.message ? err.message : err));
        debugLog('hierarchicalSummarize error', err);
      } finally { removeLoadingFromButton(btnGoSumm, '✨ Summarize'); }
    });

    // Insert buttons: inject current text area content into the page chat input
    btnInsertSumm.addEventListener('click', () => {
      try {
        const text = (summSourceText && summSourceText.textContent) || '';
        if (!text || text === '(no result)') { toast('Nothing to insert'); return; }
        restoreToChat(text);
      } catch (e) { toast('Insert failed'); }
    });

    // State for reply selection & originals
    let _cbSelectedReplyId = null;
    let _cbRepliesData = []; // [{ id, text, preview, idx, role }]
    const _cbOriginals = new Map();
    // Multi-select state for Rewrite view
    let _rewMultiMode = false; // toggles multi-select mode in Rewrite view
    const _cbSelectedReplyIds = new Set();

    // NEW: State for chat message selection
    let _selectedMessages = new Set();
    let _allChatMessages = [];
    let _rewFilter = 'all'; // all, user, assistant

    function _hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; } return h.toString(36); }

    function _generatePreview(text) {
      if (!text || text.length === 0) return '(empty)';
      // Extract first sentence or first ~120 chars
      const normalized = text.replace(/\s+/g, ' ').trim();
      const firstSentence = normalized.match(/^[^.!?]{1,120}[.!?]?/);
      if (firstSentence && firstSentence[0]) {
        const preview = firstSentence[0].trim();
        return preview.length > 120 ? preview.slice(0, 117) + '...' : preview;
      }
      return normalized.length > 120 ? normalized.slice(0, 117) + '...' : normalized;
    }

    async function loadAssistantReplies() {
      try {
        const msgs = await scanChat();
        let candidates = (msgs || []).filter(m => (m && m.text && m.text.trim().length > 0));
        if (_rewFilter === 'assistant') candidates = candidates.filter(m => m.role === 'assistant');
        else if (_rewFilter === 'user') candidates = candidates.filter(m => m.role === 'user');

        // Auto-summarize if combined message count > 20
        if (msgs && msgs.length > 20) {
          try {
            const fullText = msgs.map(m => `${m.role}: ${m.text}`).join('\n\n');
            const summaryRes = await callGeminiAsync({ action: 'summarize', text: fullText, summaryType: 'paragraph', length: 'short' });
            if (summaryRes && summaryRes.ok && summaryRes.result) {
              assistants = [{ role: 'assistant', text: `📌 Auto-Summary (${msgs.length} messages):\n\n${summaryRes.result}` }].concat(assistants);
            }
          } catch (e) { debugLog('auto-summarize error', e); }
        }

        // newest first
        candidates.reverse();
        _cbRepliesData = candidates.map((m, i) => ({
          id: `r-${i}-${_hashStr(m.text.slice(0, 64))}`,
          text: m.text,
          preview: _generatePreview(m.text),
          idx: i,
          role: m.role || 'assistant'
        }));
        _cbSelectedReplyId = null;
        renderReplies();
        hideEditor();
      } catch (e) {
        debugLog('loadAssistantReplies error', e);
        _cbRepliesData = []; _cbSelectedReplyId = null; renderReplies(); hideEditor();
      }
    }

    function renderReplies() {
      try {
        const list = rewView.querySelector('#cb-replies-list');
        if (!list) return;
        while (list.firstChild) list.removeChild(list.firstChild);
        if (!_cbRepliesData.length) {
          const empty = document.createElement('div'); empty.style.cssText = 'font-size:12px;color:var(--cb-subtext)'; empty.textContent = 'No assistant replies found.'; list.appendChild(empty); return;
        }
        for (const r of _cbRepliesData) {
          const bubble = document.createElement('div'); bubble.className = 'cb-reply'; bubble.dataset.id = r.id;
          if (_cbSelectedReplyId === r.id || _cbSelectedReplyIds.has(r.id)) bubble.classList.add('cb-selected');
          const previewEl = document.createElement('div'); previewEl.className = 'cb-reply-preview'; previewEl.textContent = r.preview;
          bubble.appendChild(previewEl);
          const meta = document.createElement('div'); meta.className = 'cb-reply-meta'; meta.textContent = `${r.role === 'user' ? 'User' : 'AI'} • ${r.text.length} chars`;
          bubble.appendChild(meta);
          bubble.addEventListener('click', () => {
            if (_rewMultiMode) {
              if (_cbSelectedReplyIds.has(r.id)) _cbSelectedReplyIds.delete(r.id); else _cbSelectedReplyIds.add(r.id);
              // clear single-select id in multi mode
              _cbSelectedReplyId = null;
              renderReplies();
              updateRewSourceFromSelection();
            } else {
              _cbSelectedReplyId = r.id;
              _cbSelectedReplyIds.clear();
              renderReplies();
              showEditor(r);
            }
          });
          list.appendChild(bubble);
        }
      } catch (e) { debugLog('renderReplies error', e); }
    }

    function updateRewSourceFromSelection() {
      try {
        if (!_rewMultiMode) return;
        const selected = _cbRepliesData.filter(r => _cbSelectedReplyIds.has(r.id));
        const text = selected.map(r => r.text).join('\n\n');
        rewSourceText.textContent = text || '(no selection)';
      } catch (e) { }
    }

    function showEditor(reply) {
      try {
        const editor = rewView.querySelector('#cb-rewrite-editor');
        const textarea = rewView.querySelector('#cb-editor-textarea');
        const repliesList = rewView.querySelector('#cb-replies-list');
        if (!editor || !textarea) return;
        textarea.value = reply.text;
        editor.classList.add('cb-active');
        if (repliesList) repliesList.classList.add('cb-editor-open');
        setTimeout(() => { try { textarea.focus(); textarea.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) { } }, 100);
      } catch (e) { debugLog('showEditor error', e); }
    }

    function hideEditor() {
      try {
        const editor = rewView.querySelector('#cb-rewrite-editor');
        const repliesList = rewView.querySelector('#cb-replies-list');
        if (editor) editor.classList.remove('cb-active');
        if (repliesList) repliesList.classList.remove('cb-editor-open');
      } catch (e) { }
    }

    btnRewrite.addEventListener('click', async () => {
      closeAllViews();
      try {
        // Get text to rewrite from last scan
        const lastScan = window.ChatBridge.getLastScan();
        const textToRewrite = (lastScan && lastScan.messages) ? lastScan.messages.map(m => m.text).join('\n') : '';

        if (!textToRewrite) {
          toast('No conversation to rewrite. Please scan first.');
          return;
        }

        rewSourceText.textContent = textToRewrite.slice(0, 100) + '...';
        rewResult.textContent = '';
        rewView.classList.add('cb-view-active');

        // Load replies on open
        await loadAssistantReplies();
      } catch (e) { toast('Failed to open Rewrite: ' + (e.message || e)); }
    });

    // Controls: Multi-select toggle
    try {
      rewMultiBtn.addEventListener('click', () => {
        _rewMultiMode = !_rewMultiMode;
        try { if (_rewMultiMode) rewMultiBtn.classList.add('cb-active'); else rewMultiBtn.classList.remove('cb-active'); } catch (e) { }
        if (_rewMultiMode) {
          _cbSelectedReplyId = null;
          _cbSelectedReplyIds.clear();
          hideEditor();
          renderReplies();
          updateRewSourceFromSelection();
        }
      });
    } catch (e) { }

    // Controls: Filter cycling (All -> Assistant -> User)
    try {
      rewFilterBtn.addEventListener('click', async () => {
        if (_rewFilter === 'all') _rewFilter = 'assistant';
        else if (_rewFilter === 'assistant') _rewFilter = 'user';
        else _rewFilter = 'all';
        rewFilterBtn.textContent = 'Filter: ' + (_rewFilter === 'all' ? 'All' : (_rewFilter === 'assistant' ? 'Assistant' : 'User'));
        await loadAssistantReplies();
      });
    } catch (e) { }

    btnCloseRew.addEventListener('click', () => {
      try { rewView.classList.remove('cb-view-active'); _cbSelectedReplyId = null; hideEditor(); } catch (e) { }
    })

    // Editor rewrite button
    try {
      const btnEditorRewrite = rewView.querySelector('#cb-btn-editor-rewrite');
      const btnEditorCancel = rewView.querySelector('#cb-btn-editor-cancel');
      const btnEditorCopy = rewView.querySelector('#cb-btn-editor-copy');
      const editorTextarea = rewView.querySelector('#cb-editor-textarea');

      if (btnEditorRewrite) {
        btnEditorRewrite.addEventListener('click', async () => {
          try {
            if (!_cbSelectedReplyId || !editorTextarea) { toast('No reply selected'); return; }
            const target = _cbRepliesData.find(r => r.id === _cbSelectedReplyId);
            if (!target) { toast('Reply not found'); return; }
            const style = (rewStyleSelect && rewStyleSelect.value) || 'normal';
            const styleHint = (typeof styleHintInput !== 'undefined' && styleHintInput && styleHintInput.value) ? styleHintInput.value : '';
            const currentText = editorTextarea.value || target.text;
            if (!currentText || currentText.trim().length < 3) { toast('Text is empty'); return; }
            btnEditorRewrite.disabled = true; addLoadingToButton(btnEditorRewrite, 'Rewriting');
            const result = await rewriteText(style, currentText, { styleHint, chunkSize: 14000, maxParallel: 3, length: 'medium' });
            if (result && result.trim().length > 0) {
              if (!_cbOriginals.has(target.id)) _cbOriginals.set(target.id, target.text);
              target.text = result;
              target.preview = _generatePreview(result);
              editorTextarea.value = result;
              renderReplies();
              toast('Rewritten');
            } else {
              toast('No result');
            }
          } catch (err) {
            toast('Rewrite failed: ' + (err && err.message ? err.message : err));
            debugLog('editor rewrite error', err);
          } finally {
            removeLoadingFromButton(btnEditorRewrite, 'Rewrite');
          }
        });
      }

      if (btnEditorCancel) {
        btnEditorCancel.addEventListener('click', () => {
          _cbSelectedReplyId = null;
          hideEditor();
          renderReplies();
        });
      }

      if (btnEditorCopy) {
        btnEditorCopy.addEventListener('click', () => {
          try {
            if (editorTextarea && editorTextarea.value) {
              navigator.clipboard.writeText(editorTextarea.value);
              toast('Copied');
            }
          } catch (e) { toast('Copy failed'); }
        });
      }
    } catch (e) { debugLog('editor buttons setup error', e); }

    btnGoRew.addEventListener('click', async () => {
      try {
        btnGoRew.disabled = true; addLoadingToButton(btnGoRew, 'Rewriting'); rewResult.textContent = ''; btnInsertRew.style.display = 'none';
        rewProg.style.display = 'inline'; updateProgress(rewProg, 'rewrite', { phase: 'preparing' });
        const chatText = (rewSourceText && rewSourceText.textContent) ? rewSourceText.textContent : '';
        const style = (rewStyleSelect && rewStyleSelect.value) || 'normal';
        const styleHint = (typeof styleHintInput !== 'undefined' && styleHintInput && styleHintInput.value) ? styleHintInput.value : '';
        const targetModel = (rewTargetSelect && rewTargetSelect.value && rewTargetSelect.value !== 'None') ? rewTargetSelect.value : null;

        // Fallback to whole conversation rewrite (legacy behavior)
        if (!chatText || chatText.trim().length < 10) { toast('No conversation to rewrite'); btnGoRew.disabled = false; btnGoRew.textContent = 'Rewrite'; return; }

        let result = '';
        // If target model is selected, use syncTone logic
        if (targetModel) {
          updateProgress(rewProg, 'sync', { phase: 'preparing' });
          if (typeof window.syncTone === 'function') {
            try { result = await window.syncTone(chatText, targetModel); } catch (e) { debugLog('window.syncTone error', e); }
          }
          if (!result) {
            try {
              result = await hierarchicalProcess(chatText, 'syncTone', { chunkSize: 14000, maxParallel: 3, length: 'medium', sourceModel: 'unknown', targetModel: targetModel, onProgress: (ev) => updateProgress(rewProg, 'rewrite', ev) });
            } catch (e) { debugLog('hierarchicalProcess syncTone error', e); throw e; }
          }
        } else {
          // Standard rewrite
          result = await rewriteText(style, chatText, { styleHint, chunkSize: 14000, maxParallel: 3, length: 'medium', onProgress: (ev) => updateProgress(rewProg, 'rewrite', ev) });
        }

        rewSourceText.textContent = result || '(no result)';
        rewResult.textContent = '✅ Rewrite completed and inserted!';
        btnInsertRew.style.display = 'inline-block';
        rewProg.style.display = 'none';
        // Auto-insert into chat
        if (result && result.length > 10) {
          try { await restoreToChat(result); toast('✓ Rewritten and inserted'); } catch (e) { toast('Rewrite done - click Insert to add to chat'); }
        } else {
          toast(targetModel ? `Adapted for ${targetModel}` : 'Rewrite completed');
        }
      } catch (err) {
        toast('Rewrite failed: ' + (err && err.message ? err.message : err));
        debugLog('hierarchicalProcess rewrite error', err);
      } finally { removeLoadingFromButton(btnGoRew, 'Rewrite'); }
    });

    btnInsertRew.addEventListener('click', () => {
      try {
        const text = (rewSourceText && rewSourceText.textContent) || '';
        if (!text || text === '(no result)') { toast('Nothing to insert'); return; }
        restoreToChat(text);
      } catch (e) { toast('Insert failed'); }
    });

    btnTranslate.addEventListener('click', async () => {
      closeAllViews();
      try {
        transResult.textContent = ''; transResult.style.display = 'none'; btnInsertTrans.style.display = 'none';
        transView.classList.add('cb-view-active');
      } catch (e) { toast('Failed to open Translate'); debugLog('open trans view', e); }
    });

    btnCloseTrans.addEventListener('click', () => {
      try { transView.classList.remove('cb-view-active'); } catch (e) { }
    });

    btnGoTrans.addEventListener('click', async () => {
      try {
        // UI setup
        btnGoTrans.disabled = true;
        transProg.style.display = 'inline-flex';
        transResult.style.display = 'none';
        transResult.textContent = '';
        btnInsertTrans.style.display = 'none';

        // Get parameters
        const targetLanguage = transLangSelect.value || 'en';
        const radios = Array.from(transView.querySelectorAll('input[name="cb-trans-mode"]'));
        const selectedMode = radios.find(r => r && r.checked);
        const mode = selectedMode ? selectedMode.value : 'all';
        const shortenEl = transView.querySelector('#cb-trans-shorten');
        const shorten = !!(shortenEl && shortenEl.checked);

        // Get content to translate
        let content;
        const lastScan = window.ChatBridge.getLastScan();

        if (mode === 'last') {
          if (!lastScan || !lastScan.messages || lastScan.messages.length === 0) {
            toast('No messages found. Please scan first.');
            btnGoTrans.disabled = false;
            transProg.style.display = 'none';
            return;
          }
          const lastMsg = lastScan.messages[lastScan.messages.length - 1];
          content = [{ role: lastMsg.role || 'assistant', text: lastMsg.text || '' }];
        } else {
          if (!lastScan || !lastScan.messages || lastScan.messages.length === 0) {
            toast('No messages found. Please scan first.');
            btnGoTrans.disabled = false;
            transProg.style.display = 'none';
            return;
          }
          content = lastScan.messages;
        }

        // Filter content based on mode
        let textToTranslate = '';
        if (mode === 'user') {
          textToTranslate = content.filter(m => m.role === 'user').map(m => m.text).join('\n\n');
        } else if (mode === 'ai') {
          textToTranslate = content.filter(m => m.role !== 'user').map(m => m.text).join('\n\n');
        } else if (mode === 'last') {
          textToTranslate = content[content.length - 1]?.text || '';
        } else {
          textToTranslate = content.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n\n');
        }

        if (!textToTranslate || textToTranslate.length < 5) {
          toast('No content to translate');
          btnGoTrans.disabled = false;
          transProg.style.display = 'none';
          return;
        }

        // Get language name
        const langNames = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', ar: 'Arabic', hi: 'Hindi', nl: 'Dutch', pl: 'Polish', tr: 'Turkish', vi: 'Vietnamese', th: 'Thai', sv: 'Swedish', da: 'Danish', fi: 'Finnish', no: 'Norwegian', cs: 'Czech', hu: 'Hungarian', ro: 'Romanian', el: 'Greek', he: 'Hebrew', id: 'Indonesian', ms: 'Malay', uk: 'Ukrainian', bg: 'Bulgarian', ta: 'Tamil' };
        const langName = langNames[targetLanguage] || targetLanguage;

        // FAST: Use Llama directly for quick translation
        debugLog('[Translation] Using fast Llama translation...');
        const llamaResult = await callLlamaAsync({
          action: 'translate',
          text: textToTranslate.slice(0, 8000), // Limit for speed
          targetLang: langName
        });

        if (llamaResult && llamaResult.ok && llamaResult.result) {
          transResult.textContent = llamaResult.result;
          transResult.style.display = 'block';
          btnInsertTrans.style.display = 'inline-block';
          transProg.style.display = 'none';
          toast('✓ Translation complete');
        } else {
          // Fallback to Gemini if Llama fails
          debugLog('[Translation] Llama failed, trying Gemini...');
          const geminiResult = await callGeminiAsync({
            action: 'translate',
            text: textToTranslate.slice(0, 8000),
            targetLang: langName
          });

          if (geminiResult && geminiResult.ok && geminiResult.result) {
            transResult.textContent = geminiResult.result;
            transResult.style.display = 'block';
            btnInsertTrans.style.display = 'inline-block';
            transProg.style.display = 'none';
            toast('✓ Translation complete');
          } else {
            toast('Translation failed: ' + (geminiResult?.error || 'Unknown error'));
            transProg.style.display = 'none';
          }
        }

      } catch (err) {
        toast('Translation failed: ' + (err && err.message ? err.message : String(err)));
        debugLog('[Translation error]', err);
        transProg.style.display = 'none';
      } finally {
        btnGoTrans.disabled = false;
      }
    });
    btnInsertTrans.addEventListener('click', async () => {
      try {
        const text = transResult.textContent || '';
        if (!text) { toast('Nothing to insert'); return; }
        console.log('[ChatBridge] Translate Insert clicked, text length:', text.length);
        const success = await restoreToChat(text);
        if (success) { toast('Translation inserted successfully'); } else { console.log('[ChatBridge] restoreToChat returned false'); }
      } catch (e) { console.error('[ChatBridge] Translate Insert error:', e); toast('Insert failed: ' + (e.message || e)); }
    });

    // Smart Query handlers (open instantly, lazy-populate filters/suggestions)
    let __cbSmartOpenBusy = false;
    btnSmartQuery.addEventListener('click', async () => {
      if (__cbSmartOpenBusy) return; // simple click guard to avoid double-activation
      __cbSmartOpenBusy = true;
      try {
        closeAllViews();
        // Reset visible state immediately for perceived snappiness
        try { smartResults.textContent = '(No results yet)'; } catch (_) { }
        try { smartAnswer.textContent = ''; } catch (_) { }
        try { smartInput.value = ''; } catch (_) { }
        try { smartView.classList.add('cb-view-active'); } catch (_) { }

        // Defer heavy work to keep first-click instant
        setTimeout(async () => {
          try {
            // populate host and tag filters from saved conversations
            try {
              const convs = await loadConversationsAsync();
              // hosts
              try { while (hostSelect.firstChild) hostSelect.removeChild(hostSelect.firstChild); const ho = document.createElement('option'); ho.value = ''; ho.textContent = 'All hosts'; hostSelect.appendChild(ho); } catch (e) { }
              const hosts = Array.from(new Set((convs || []).map(c => { try { return (c.platform || (c.url && new URL(c.url).hostname) || location.hostname).toString(); } catch (_) { return location.hostname; } }))).slice(0, 50);
              hosts.forEach(h => { const o = document.createElement('option'); o.value = h; o.textContent = h.length > 24 ? (h.slice(0, 20) + '…') : h; hostSelect.appendChild(o); });
              // tags
              try { while (tagSelect.firstChild) tagSelect.removeChild(tagSelect.firstChild); const to = document.createElement('option'); to.value = ''; to.textContent = 'All tags'; tagSelect.appendChild(to); } catch (e) { }
              // normalize existing tags when populating filters (handles older saved convs)
              const rawTags = [].concat(...(convs || []).map(c => (c.topics || [])));
              const normTags = [];
              const seenTag = new Set();
              rawTags.forEach(tt => {
                try {
                  const tnorm = String(tt || '').toLowerCase().replace(/["'()\.]/g, '').replace(/\s+/g, ' ').trim();
                  if (tnorm && !seenTag.has(tnorm)) { seenTag.add(tnorm); normTags.push(tnorm); }
                } catch (_) { }
              });
              const tags = normTags.slice(0, 100);
              tags.forEach(t => { const o = document.createElement('option'); o.value = t; const disp = String(t).split(/[_\-\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); o.textContent = disp; tagSelect.appendChild(o); });
            } catch (e) { debugLog('populate filters failed', e); }

            // populate smart suggestions (chips) and placeholder
            try { await populateSmartSuggestions(); } catch (e) { debugLog('populateSmartSuggestions failed', e); }
          } catch (e) {
            debugLog('open smart view (deferred work) failed', e);
          } finally {
            __cbSmartOpenBusy = false;
          }
        }, 0);
      } catch (e) {
        __cbSmartOpenBusy = false;
        toast('Failed to open Smart Query');
        debugLog('open smart view', e);
      }
    });

    btnCloseSmart.addEventListener('click', () => { try { smartView.classList.remove('cb-view-active'); } catch (e) { } });

    // ============================================
    // AGENT HUB: AI Analysis & Smart Actions
    // ============================================
    btnKnowledgeGraph.addEventListener('click', async () => {
      try {
        closeAllViews();
        agentView.classList.add('cb-view-active');

        // Get the content container
        const content = agentView.querySelector('#cb-agent-content');
        if (!content) return;

        // Show loading state
        content.innerHTML = `
          <div style="text-align:center;padding:40px 20px;">
            <div class="cb-spinner" style="margin:0 auto 16px;"></div>
            <p style="color:var(--cb-subtext);font-size:14px;">Analyzing conversation...</p>
          </div>
        `;

        // Get conversation text
        const chatText = await getConversationText();
        if (!chatText || chatText.length < 20) {
          content.innerHTML = `
            <div style="text-align:center;padding:40px 20px;">
              <div style="font-size:48px;margin-bottom:16px;">💬</div>
              <p style="color:var(--cb-white);font-size:16px;font-weight:600;margin-bottom:8px;">No Conversation Found</p>
              <p style="color:var(--cb-subtext);font-size:13px;">Click "Scan Chat" first to capture the current conversation.</p>
            </div>
          `;
          return;
        }

        // Analyze with AI
        try {
          const analysisPrompt = `Analyze this conversation and provide actionable insights in JSON format:
{
  "summary": "1-2 sentence summary of what this conversation is about",
  "topics": ["topic1", "topic2", "topic3"],
  "sentiment": "positive/neutral/negative/mixed",
  "suggestedActions": [
    {"action": "Clear action item or follow-up", "priority": "high/medium/low"},
    {"action": "Another suggested action", "priority": "high/medium/low"}
  ],
  "keyInsights": ["key insight 1", "key insight 2"],
  "questionsToAsk": ["suggested follow-up question 1", "suggested follow-up question 2"]
}

Conversation:
${chatText.slice(0, 8000)}

Output ONLY valid JSON:`;

          const result = await callGeminiAsync({ action: 'custom', prompt: analysisPrompt, temperature: 0.3 });
          debugLog('Agent analysis result:', result);

          let analysis = null;
          let errorMessage = null;

          if (!result) {
            errorMessage = 'No response from AI service. Please check your connection.';
          } else if (!result.ok) {
            // Handle specific error types
            if (result.error === 'no_api_key') {
              errorMessage = 'Gemini API key not configured. Go to ChatBridge Options to set it up.';
            } else if (result.error === 'rate_limited') {
              errorMessage = 'Rate limit reached. Please wait a moment and try again.';
            } else if (result.error === 'all_models_failed') {
              errorMessage = 'AI service temporarily unavailable. Please try again later.';
            } else {
              errorMessage = result.message || result.error || 'AI service error. Please try again.';
            }
          } else if (result.result) {
            try {
              // Extract JSON from response
              const jsonMatch = result.result.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                analysis = JSON.parse(jsonMatch[0]);
              } else {
                errorMessage = 'AI response format error. Please try again.';
                debugLog('No JSON found in response:', result.result.slice(0, 200));
              }
            } catch (e) {
              debugLog('Agent JSON parse error', e);
              errorMessage = 'Failed to parse AI response. Please try again.';
            }
          }

          if (analysis) {
            // Render analysis results
            const topicsHtml = (analysis.topics || []).map(t =>
              `<span style="display:inline-block;padding:4px 10px;background:rgba(0,180,255,0.15);border:1px solid rgba(0,180,255,0.3);border-radius:12px;font-size:12px;margin:4px 4px 4px 0;">${t}</span>`
            ).join('');

            const actionsHtml = (analysis.suggestedActions || []).map(a => `
              <div class="cb-action-item" style="padding:12px;background:rgba(255,255,255,0.03);border:1px solid var(--cb-border);border-radius:8px;margin-bottom:8px;cursor:pointer;transition:all 0.2s;" data-action="${encodeURIComponent(a.action)}">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                  <span style="font-size:13px;color:var(--cb-white);">${a.action}</span>
                  <span style="font-size:10px;padding:2px 6px;background:${a.priority === 'high' ? 'rgba(255,100,100,0.2)' : a.priority === 'medium' ? 'rgba(255,200,100,0.2)' : 'rgba(100,255,100,0.2)'};border-radius:4px;color:${a.priority === 'high' ? '#ff6666' : a.priority === 'medium' ? '#ffcc66' : '#66ff66'};">${a.priority}</span>
                </div>
              </div>
            `).join('');

            const questionsHtml = (analysis.questionsToAsk || []).map(q => `
              <div class="cb-question-chip" style="padding:10px 14px;background:linear-gradient(135deg,rgba(140,30,255,0.1),rgba(0,180,255,0.1));border:1px solid rgba(140,30,255,0.25);border-radius:8px;margin-bottom:8px;cursor:pointer;transition:all 0.2s;font-size:13px;color:var(--cb-white);" data-question="${encodeURIComponent(q)}">
                💡 ${q}
              </div>
            `).join('');

            const insightsHtml = (analysis.keyInsights || []).map(i =>
              `<li style="margin-bottom:6px;color:var(--cb-subtext);font-size:13px;">${i}</li>`
            ).join('');

            content.innerHTML = `
              <div style="margin-bottom:20px;">
                <div style="font-size:12px;font-weight:600;color:var(--cb-accent-primary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Summary</div>
                <p style="margin:0;font-size:14px;line-height:1.6;color:var(--cb-white);">${analysis.summary || 'No summary available'}</p>
              </div>
              
              <div style="margin-bottom:20px;">
                <div style="font-size:12px;font-weight:600;color:var(--cb-accent-primary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Topics</div>
                <div>${topicsHtml || '<span style="color:var(--cb-subtext);">No topics detected</span>'}</div>
              </div>
              
              <div style="margin-bottom:20px;">
                <div style="font-size:12px;font-weight:600;color:var(--cb-accent-primary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Suggested Next Steps</div>
                ${actionsHtml || '<p style="color:var(--cb-subtext);font-size:13px;">No actions suggested</p>'}
              </div>
              
              <div style="margin-bottom:20px;">
                <div style="font-size:12px;font-weight:600;color:var(--cb-accent-primary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Follow-up Questions</div>
                ${questionsHtml || '<p style="color:var(--cb-subtext);font-size:13px;">No follow-up questions</p>'}
              </div>
              
              ${insightsHtml ? `
              <div style="margin-bottom:20px;">
                <div style="font-size:12px;font-weight:600;color:var(--cb-accent-primary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Key Insights</div>
                <ul style="margin:0;padding-left:20px;">${insightsHtml}</ul>
              </div>
              ` : ''}
              
              <div style="padding-top:16px;border-top:1px solid var(--cb-border);">
                <button class="cb-btn cb-btn-primary" id="cb-agent-deep-analysis" style="width:100%;padding:12px;">🔬 Deep Analysis</button>
              </div>
            `;

            // Add click handlers for actions
            content.querySelectorAll('.cb-action-item').forEach(el => {
              el.addEventListener('click', () => {
                const action = decodeURIComponent(el.dataset.action || '');
                if (action) {
                  navigator.clipboard.writeText(action).then(() => toast('Action copied!')).catch(() => { });
                }
              });
              el.addEventListener('mouseenter', () => { el.style.background = 'rgba(255,255,255,0.08)'; el.style.borderColor = 'rgba(0,180,255,0.4)'; });
              el.addEventListener('mouseleave', () => { el.style.background = 'rgba(255,255,255,0.03)'; el.style.borderColor = 'var(--cb-border)'; });
            });

            // Add click handlers for questions
            content.querySelectorAll('.cb-question-chip').forEach(el => {
              el.addEventListener('click', async () => {
                const question = decodeURIComponent(el.dataset.question || '');
                if (question) {
                  await restoreToChat(question);
                  toast('Question added to chat!');
                }
              });
              el.addEventListener('mouseenter', () => { el.style.transform = 'translateX(4px)'; el.style.borderColor = 'rgba(140,30,255,0.5)'; });
              el.addEventListener('mouseleave', () => { el.style.transform = 'translateX(0)'; el.style.borderColor = 'rgba(140,30,255,0.25)'; });
            });

            // Deep analysis button
            const deepBtn = content.querySelector('#cb-agent-deep-analysis');
            if (deepBtn) {
              deepBtn.addEventListener('click', async () => {
                deepBtn.disabled = true;
                deepBtn.textContent = '⏳ Analyzing...';
                try {
                  const deepPrompt = `Provide a comprehensive analysis of this conversation including:
1. Main objectives and whether they were achieved
2. Key decisions or conclusions reached
3. Areas of agreement and disagreement
4. Potential next steps or action items
5. Unanswered questions or concerns
6. Overall effectiveness of the conversation

Conversation:
${chatText.slice(0, 12000)}`;

                  const deepResult = await callGeminiAsync({ action: 'prompt', text: deepPrompt, temperature: 0.4 });
                  if (deepResult && deepResult.ok && deepResult.result) {
                    const modal = document.createElement('div');
                    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:999999;display:flex;align-items:center;justify-content:center;padding:40px;';
                    modal.innerHTML = `
                      <div style="background:var(--cb-bg);border:1px solid var(--cb-border);border-radius:12px;max-width:700px;width:100%;max-height:80vh;overflow:auto;padding:24px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                          <h3 style="margin:0;font-size:18px;color:var(--cb-white);">🔬 Deep Analysis</h3>
                          <button class="cb-btn" style="padding:4px 12px;" onclick="this.closest('div[style*=fixed]').remove()">✕</button>
                        </div>
                        <div style="white-space:pre-wrap;font-size:14px;line-height:1.7;color:var(--cb-subtext);">${deepResult.result}</div>
                      </div>
                    `;
                    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
                    document.body.appendChild(modal);
                  }
                } catch (e) { toast('Analysis failed'); }
                deepBtn.disabled = false;
                deepBtn.textContent = '🔬 Deep Analysis';
              });
            }
          } else {
            // Show specific error message if available
            const displayError = errorMessage || 'Could not analyze the conversation. Please try again.';
            content.innerHTML = `
              <div style="text-align:center;padding:40px 20px;">
                <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
                <p style="color:var(--cb-white);font-size:16px;font-weight:600;margin-bottom:8px;">Analysis Failed</p>
                <p style="color:var(--cb-subtext);font-size:13px;margin-bottom:16px;">${displayError}</p>
                <button class="cb-btn cb-btn-primary" id="cb-agent-retry" style="padding:10px 20px;">🔄 Try Again</button>
              </div>
            `;
            // Add retry handler
            const retryBtn = content.querySelector('#cb-agent-retry');
            if (retryBtn) {
              retryBtn.addEventListener('click', () => {
                btnKnowledgeGraph.click();
              });
            }
          }
        } catch (e) {
          debugLog('Agent analysis error', e);
          content.innerHTML = `<div style="text-align:center;padding:40px;color:var(--cb-subtext);">Analysis failed. Please try again.</div>`;
        }
      } catch (e) { toast('Failed to open Agent Hub'); debugLog('open agent view', e); }
    });

    btnCloseAgent.addEventListener('click', () => { try { agentView.classList.remove('cb-view-active'); } catch (e) { } });

    // Insights close handler (main handler is at renderInsightsHub)
    btnCloseInsights.addEventListener('click', () => { try { insightsView.classList.remove('cb-view-active'); } catch (e) { } });


    // Simple in-memory cache and batched storage writes for responsiveness
    const __cbConvCache = { data: [], ts: 0 };
    const __cbSetQueue = new Map(); // key -> { value, timer }
    function setStorageBatched(key, value, delayMs = 150) {
      try {
        const prev = __cbSetQueue.get(key);
        if (prev && prev.timer) clearTimeout(prev.timer);
        const timer = setTimeout(() => {
          try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
              chrome.storage.local.set({ [key]: value }, () => { });
            } else {
              localStorage.setItem(key, JSON.stringify(value));
            }
          } catch (e) { debugLog('batched set failed', e); }
        }, delayMs);
        __cbSetQueue.set(key, { value, timer });
      } catch (e) { debugLog('schedule set failed', e); }
    }

    // Phase 3: Detail Level Preference Management
    let cachedDetailLevel = null;

    async function getDetailLevel() {
      if (cachedDetailLevel) return cachedDetailLevel;

      return new Promise((resolve) => {
        try {
          chrome.storage.local.get(['cb_detail_level'], (result) => {
            const level = result?.cb_detail_level || 'concise'; // Default: concise
            cachedDetailLevel = level;
            resolve(level);
          });
        } catch (e) {
          debugLog('[DetailLevel] Failed to get:', e);
          resolve('concise'); // Fallback
        }
      });
    }

    async function setDetailLevel(level) {
      if (!['concise', 'detailed', 'expert'].includes(level)) {
        debugLog('[DetailLevel] Invalid level:', level);
        return false;
      }

      cachedDetailLevel = level;

      return new Promise((resolve) => {
        try {
          chrome.storage.local.set({ cb_detail_level: level }, () => {
            debugLog('[DetailLevel] Set to:', level);
            resolve(true);
          });
        } catch (e) {
          debugLog('[DetailLevel] Failed to set:', e);
          resolve(false);
        }
      });
    }

    function createDetailLevelToggle(containerId, onChangeCallback) {
      const container = document.getElementById(containerId);
      if (!container) return;

      const toggleHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px;background:rgba(0,180,255,0.1);border-radius:6px;">
          <span style="font-size:11px;font-weight:600;opacity:0.9;">Detail Level:</span>
          <div class="cb-detail-toggle" style="display:flex;gap:4px;">
            <button class="cb-detail-btn" data-level="concise" style="padding:4px 10px;font-size:11px;border-radius:4px;border:1px solid rgba(0,180,255,0.3);background:rgba(0,180,255,0.2);color:#E6E9F0;cursor:pointer;">Concise</button>
            <button class="cb-detail-btn" data-level="detailed" style="padding:4px 10px;font-size:11px;border-radius:4px;border:1px solid rgba(0,180,255,0.3);background:transparent;color:#E6E9F0;cursor:pointer;">Detailed</button>
            <button class="cb-detail-btn" data-level="expert" style="padding:4px 10px;font-size:11px;border-radius:4px;border:1px solid rgba(0,180,255,0.3);background:transparent;color:#E6E9F0;cursor:pointer;">Expert</button>
          </div>
        </div>
      `;

      container.insertAdjacentHTML('afterbegin', toggleHTML);

      // Set initial state
      getDetailLevel().then(level => {
        container.querySelectorAll('.cb-detail-btn').forEach(btn => {
          btn.style.background = btn.dataset.level === level ? 'rgba(0,180,255,0.4)' : 'transparent';
          btn.style.fontWeight = btn.dataset.level === level ? '700' : '400';
        });
      });

      // Add click handlers
      container.querySelectorAll('.cb-detail-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const level = btn.dataset.level;
          await setDetailLevel(level);

          // Update UI
          container.querySelectorAll('.cb-detail-btn').forEach(b => {
            b.style.background = b === btn ? 'rgba(0,180,255,0.4)' : 'transparent';
            b.style.fontWeight = b === btn ? '700' : '400';
          });

          // Callback
          if (onChangeCallback) onChangeCallback(level);
        });
      });
    }

    // Load conversations as a Promise with cache: prefer background persistent store, fallback to window.getConversations or localStorage
    function loadConversationsAsync() {
      return new Promise(res => {
        // Return cached list if fresh (< 1000ms)
        try {
          if (Array.isArray(__cbConvCache.data) && __cbConvCache.ts && (Date.now() - __cbConvCache.ts) < 1000) {
            return res(__cbConvCache.data);
          }
        } catch (_) { }
        // Try background handler first
        try {
          chrome.runtime.sendMessage({ type: 'get_conversations', payload: {} }, (r) => {
            if (chrome.runtime.lastError) {
              // Fallback chain below
              fallbackLoad();
              return;
            }
            if (r && r.ok && Array.isArray(r.conversations)) {
              // Merge with chrome.storage.local mirror to avoid race conditions
              if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(['chatbridge:conversations'], (data) => {
                  try {
                    const mirror = Array.isArray(data['chatbridge:conversations']) ? data['chatbridge:conversations'] : [];
                    const all = [].concat(r.conversations || [], mirror || []);
                    // Dedupe by id/ts
                    const m = new Map();
                    for (const c of all) {
                      const id = String((c && (c.id || c.ts)) || '');
                      if (!id) continue;
                      // prefer the version that has a conversation array/topics
                      if (!m.has(id)) m.set(id, c);
                      else {
                        const prev = m.get(id);
                        const better = (Array.isArray(c.conversation) && c.conversation.length >= (prev.conversation?.length || 0)) ? c : prev;
                        m.set(id, better);
                      }
                    }
                    const merged = Array.from(m.values()).sort((a, b) => (b.ts || 0) - (a.ts || 0));
                    try { __cbConvCache.data = merged; __cbConvCache.ts = Date.now(); } catch (_) { }
                    res(merged);
                  } catch (e) { res(r.conversations); }
                });
              } else {
                try { __cbConvCache.data = r.conversations; __cbConvCache.ts = Date.now(); } catch (_) { }
                res(r.conversations);
              }
            } else {
              fallbackLoad();
            }
          });
        } catch (e) {
          fallbackLoad();
        }

        function fallbackLoad() {
          try {
            if (typeof window.getConversations === 'function') {
              try { window.getConversations(list => res(Array.isArray(list) ? list : [])); } catch (e) { res([]); }
            } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
              // Try chrome.storage.local first (extension-wide)
              chrome.storage.local.get(['chatbridge:conversations'], (data) => {
                const arr = Array.isArray(data['chatbridge:conversations']) ? data['chatbridge:conversations'] : [];
                if (arr.length > 0) {
                  // Sort newest first
                  const sorted = arr.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
                  try { __cbConvCache.data = sorted; __cbConvCache.ts = Date.now(); } catch (_) { }
                  res(sorted);
                } else {
                  // Final fallback to localStorage
                  try {
                    const local = JSON.parse(localStorage.getItem('chatbridge:conversations') || '[]');
                    const sorted = (Array.isArray(local) ? local : []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
                    try { __cbConvCache.data = sorted; __cbConvCache.ts = Date.now(); } catch (_) { }
                    res(sorted);
                  } catch (e) { res([]); }
                }
              });
            } else {
              // Final fallback if chrome APIs not available
              const arr = JSON.parse(localStorage.getItem('chatbridge:conversations') || '[]');
              const sorted = (Array.isArray(arr) ? arr : []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
              try { __cbConvCache.data = sorted; __cbConvCache.ts = Date.now(); } catch (_) { }
              res(sorted);
            }
          } catch (e) { res([]); }
        }
      });
    }

    // Vector query helper used by Smart Query (returns background vector_query results)
    function runVectorQuery(qstr, topK) {
      return new Promise(res => {
        try {
          chrome.runtime.sendMessage({ type: 'vector_query', payload: { query: qstr, topK: topK || 8 } }, (r) => {
            if (chrome.runtime.lastError) return res({ ok: false, error: chrome.runtime.lastError.message });
            return res(r || { ok: false });
          });
        } catch (e) { return res({ ok: false, error: e && e.message }); }
      });
    }

    // Build topic suggestions from text (prioritize nouns, technical terms, capitalized words)
    function buildKeywordsFromText(text, limit = 5) {
      try {
        if (!text) return [];

        // Expanded stop words to filter out common verbs, auxiliaries, and non-topic words
        const stop = new Set([
          'the', 'that', 'this', 'with', 'from', 'about', 'they', 'would', 'have', 'there', 'their', 'which', 'what', 'when', 'where', 'your', 'you', 'will', 'could', 'should', 'and', 'for', 'but', 'are', 'not', 'was', 'were', 'has', 'had', 'can', 'all', 'any', 'more', 'our', 'its', 'also', 'use', 'using', 'like', 'just', 'know', 'get', 'make', 'want', 'need', 'think', 'see', 'look', 'take', 'come', 'well', 'even', 'back', 'good', 'very', 'much', 'said', 'than', 'some', 'into', 'them', 'only', 'over', 'such', 'other', 'then', 'now', 'may', 'these', 'after', 'most', 'been', 'find', 'here', 'give', 'many', 'does', 'done', 'being', 'because', 'going', 'really', 'actually', 'probably', 'definitely', 'maybe', 'perhaps', 'seems', 'something', 'anything', 'everything', 'nothing', 'someone', 'anyone', 'everyone', 'nobody', 'want', 'need', 'create', 'makes', 'trying', 'asked', 'looking', 'getting', 'working', 'having'
        ]);

        // Extract meaningful phrases (2-3 word combinations) and single words
        const phrases = [];
        const words = String(text).split(/[^\w\s]+/);

        // Look for 2-3 word technical phrases
        for (let i = 0; i < words.length - 1; i++) {
          const w1 = words[i].toLowerCase();
          const w2 = words[i + 1].toLowerCase();

          // Skip if either word is a stop word or too short
          if (w1.length <= 2 || w2.length <= 2 || stop.has(w1) || stop.has(w2)) continue;

          // Create phrase
          const phrase = words[i] + ' ' + words[i + 1];
          const phraseLower = phrase.toLowerCase();

          // Only keep if it looks like a topic (at least one word capitalized or technical pattern)
          if (/[A-Z]/.test(phrase) || /\d/.test(phrase)) {
            phrases.push(phrase);
          }
        }

        // Extract single words with scoring
        const scores = {};

        words.forEach((orig, idx) => {
          const lower = orig.toLowerCase();
          if (lower.length <= 3 || stop.has(lower)) return;

          let score = 0;

          // Bonus for capitalized words (proper nouns, technical terms)
          if (/^[A-Z]/.test(orig) && idx > 0) score += 5;

          // Bonus for technical patterns (camelCase, acronyms, compound words)
          if (/[A-Z]{2,}/.test(orig)) score += 8; // Acronyms like API, JSON, SQL
          if (/[a-z][A-Z]/.test(orig)) score += 6; // camelCase like useState, MongoDB
          if (orig.includes('_') || orig.includes('-')) score += 4; // snake_case or kebab-case

          // Bonus for technical/domain words
          if (/^(function|method|class|interface|component|service|controller|model|schema|database|server|client|endpoint|route|middleware|handler|provider|repository|factory|builder|adapter|decorator|strategy)$/i.test(lower)) score += 7;

          // Bonus for common technical suffixes
          if (/(?:tion|ness|ment|ence|ance|ity|er|or|ist|ism)$/.test(lower)) score += 2;

          // Base frequency score
          scores[lower] = (scores[lower] || 0) + 1 + score;
        });

        // Sort by score and take top results
        const topWords = Object.entries(scores)
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit * 2)
          .map(k => k[0]);

        // Combine phrases and words, prioritizing phrases
        const combined = [...new Set([...phrases.slice(0, 3), ...topWords])];

        // Capitalize and filter
        const topics = combined
          .map(k => k.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '))
          .filter(t => {
            const lower = t.toLowerCase();
            // Filter out common verb phrases and non-topics
            if (/^(want to|i want|to create|trying to|going to|need to|have to|using|making|doing|getting|taking|looking|thinking|working|creating|building)$/i.test(lower)) return false;
            // Filter out single letters or numbers
            if (/^[a-z]$/i.test(lower) || /^\d+$/.test(lower)) return false;
            return true;
          })
          .slice(0, limit);

        return topics;
      } catch (e) {
        console.error('buildKeywordsFromText error:', e);
        return [];
      }
    }

    // Try to get higher-quality suggestions using embeddings via background
    function requestEmbeddingSuggestions(text, topK = 6) {
      return new Promise(res => {
        try {
          if (!text || !chrome || !chrome.runtime || !chrome.runtime.sendMessage) return res({ ok: false, error: 'no-runtime' });
          chrome.runtime.sendMessage({ type: 'embed_suggest', payload: { text: text, topK: topK } }, (r) => {
            if (chrome.runtime.lastError) return res({ ok: false, error: chrome.runtime.lastError.message });
            return res(r || { ok: false });
          });
        } catch (e) { return res({ ok: false, error: e && e.message }); }
      });
    }

    async function populateSmartSuggestions() {
      function enforceKeywordStyle(str) {
        try {
          let s = String(str || '').toLowerCase();
          // strip punctuation except spaces, dash, underscore
          s = s.replace(/["'`.,:;!?()\[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
          // remove prompt-like prefixes
          s = s.replace(/^(how to|how can i|how can we|can you|please|write|generate|create|build|explain|tell me|what is|show me|give me|help me)\s+/i, '').trim();
          // limit to 3 words max
          const parts = s.split(/\s+/).filter(Boolean).slice(0, 3);
          if (!parts.length) return null;
          const out = parts.join(' ');
          // reject if still looks like a question/prompt
          if (/\?$/.test(out) || /^(how|can|please|what|why|when|where)\b/i.test(out)) return null;
          if (out.length < 3) return null;
          // Title Case for display
          return out.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        } catch (_) { return null; }
      }
      try {
        // clear existing
        try { while (smartSuggestRow.firstChild) smartSuggestRow.removeChild(smartSuggestRow.firstChild); } catch (e) { }
        let suggestions = [];

        // Priority 1: Use saved topics from recent conversations (most relevant)
        try {
          const convs = await loadConversationsAsync();
          if (convs && convs.length) {
            // Collect all topics from recent conversations
            const allTopics = [];
            convs.slice(0, 12).forEach(c => {
              if (c.topics && Array.isArray(c.topics)) {
                allTopics.push(...c.topics);
              }
            });

            // Count frequency and pick top topics
            if (allTopics.length > 0) {
              const freq = {};
              allTopics.forEach(t => {
                const normalized = t.trim().toLowerCase();
                freq[normalized] = (freq[normalized] || 0) + 1;
              });
              suggestions = Object.entries(freq)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([topic, count]) => ({ text: topic.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), confidence: Math.min(90, 50 + (count * 10)) }));
            }
          }
        } catch (e) { debugLog('load saved topics failed', e); }

        // Priority 2: Try embedding-based suggestions via background (if no saved topics)
        if ((!suggestions || suggestions.length === 0) && lastScannedText && lastScannedText.length) {
          try {
            const resp = await requestEmbeddingSuggestions(lastScannedText, 6);
            if (resp && resp.ok && Array.isArray(resp.suggestions) && resp.suggestions.length) {
              // Normalize: accept either strings or { phrase, confidence }
              suggestions = resp.suggestions.slice(0, 6).map(s => {
                if (typeof s === 'string') return { text: s, confidence: undefined };
                if (s && typeof s === 'object') {
                  const text = s.text || s.phrase || '';
                  const confidence = typeof s.confidence === 'number' ? s.confidence : undefined;
                  return { text, confidence };
                }
                return null;
              }).filter(Boolean);
            }
          } catch (e) { debugLog('embed suggest failed', e); }
        }

        // Priority 3: Extract topics from last scanned text (fallback)
        if (!suggestions || suggestions.length === 0) {
          try {
            if (lastScannedText && lastScannedText.length) {
              suggestions = buildKeywordsFromText(lastScannedText, 6).map(t => ({ text: t, confidence: 55 }));
            }
          } catch (e) { }
        }

        // Priority 4: Aggregate topics from recent conversation text (last resort)
        if (!suggestions || suggestions.length === 0) {
          try {
            const convs = await loadConversationsAsync();
            const sample = (convs || []).slice(-8).map(c => (c.conversation || []).map(m => m.text).join(' ')).join('\n');
            suggestions = buildKeywordsFromText(sample, 6).map(t => ({ text: t, confidence: 50 }));
          } catch (e) { suggestions = []; }
        }

        // Normalize to objects { text, confidence } if still strings
        if (suggestions && typeof suggestions[0] === 'string') {
          suggestions = suggestions.map(s => ({ text: String(s), confidence: undefined }));
        }

        // Enforce keyword-only style: strip prompt phrasing, limit to 3 words, reject questions
        suggestions = (suggestions || [])
          .map(obj => ({ text: String((obj && obj.text) || '').trim(), confidence: obj && obj.confidence }))
          .map(obj => {
            const kw = enforceKeywordStyle(obj.text);
            return kw ? { text: kw, confidence: obj.confidence } : null;
          })
          .filter(Boolean);

        // Ensure unique (case-insensitive, trimmed), apply patterns, and enforce minimum confidence when available
        const seen = new Set();
        suggestions = (suggestions || [])
          .filter(obj => {
            const normalized = obj.text.toLowerCase();
            if (!obj.text || obj.text.length < 3) return false;
            if (seen.has(normalized)) return false;
            if (typeof obj.confidence === 'number' && obj.confidence < 30) return false;
            seen.add(normalized);
            return true;
          })
          .slice(0, 6);

        if (!suggestions || suggestions.length === 0) {
          // default helpful prompts (topic-like)
          suggestions = [
            { text: 'API integration' },
            { text: 'Error handling' },
            { text: 'Best practices' },
            { text: 'Code optimization' },
            { text: 'Database design' },
            { text: 'Architecture' }
          ];
        }
        // create chips
        suggestions.forEach(s => {
          const chip = document.createElement('button');
          chip.className = 'cb-btn'; chip.style.padding = '6px 10px'; chip.style.fontSize = '12px'; chip.style.borderRadius = '999px'; chip.style.background = 'rgba(11,15,23,0.12)';
          const txt = s.text || String(s);
          // Confidence dot + percent if available
          let label = txt;
          if (typeof s.confidence === 'number') {
            const c = s.confidence;
            const color = c >= 70 ? '#10a37f' : c >= 50 ? '#ffa500' : '#888';
            const dot = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${color};margin-right:6px"></span>`;
            label = `${dot}<span>${txt}</span><span style="margin-left:6px;color:#888;font-size:11px">${c}%</span>`;
            chip.innerHTML = label;
          } else {
            chip.textContent = label;
          }
          chip.setAttribute('role', 'button');
          chip.setAttribute('tabindex', '0');
          chip.setAttribute('aria-label', 'Suggestion: ' + txt + (typeof s.confidence === 'number' ? `, confidence ${s.confidence} percent` : ''));
          chip.addEventListener('click', () => { try { smartInput.value = txt; smartInput.focus(); announce('Suggestion chosen: ' + txt); } catch (e) { } });
          chip.addEventListener('keydown', (ev) => { try { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); smartInput.value = txt; smartInput.focus(); announce('Suggestion chosen: ' + txt); } } catch (e) { } });
          smartSuggestRow.appendChild(chip);
        });
        // set placeholder to first suggestion
        try { if (suggestions && suggestions.length) smartInput.placeholder = (suggestions[0].text || String(suggestions[0])) + ' (click a suggestion)'; } catch (e) { }
      } catch (e) { debugLog('populateSmartSuggestions error', e); }
    }

    // Heuristic: choose a sensible default summary style based on the conversation text
    function pickAdaptiveSummaryType(text) {
      try {
        const t = String(text || '');
        const len = t.length;
        const lines = t.split(/\r?\n/);
        const bulletLines = lines.filter(l => /^\s*[-*•]/.test(l)).length;
        const hasCode = /```|\bfunction\b|\bclass\b|\bconst\b|\blet\b|\bvar\b|<\/?[a-z][^>]*>/i.test(t);
        const techTerms = /(api|endpoint|error|stack trace|database|schema|deploy|ci\/?cd|docker|kubernetes|oauth|jwt|typescript|javascript|react|node|python)/i.test(t);
        const aiHandoff = /(prompt|model|llm|gemini|claude|chatgpt|copilot|perplexity)/i.test(t);
        if (len > 5000 || aiHandoff) return 'transfer';
        if (hasCode || techTerms) return 'technical';
        if (bulletLines >= 8) return 'bullet';
        // default for general cases
        return 'paragraph';
      } catch (_) { return 'paragraph'; }
    }

    // Detect current model from page structure (safer than hostname inference)
    function detectCurrentModel() {
      try {
        const host = location.hostname.toLowerCase();
        // Check page title and meta tags first
        const title = document.title.toLowerCase();
        const metaOg = document.querySelector('meta[property="og:site_name"]');
        const metaName = metaOg ? metaOg.getAttribute('content') : '';

        // Claude detection
        if (host.includes('claude.ai') || host.includes('anthropic.com') || title.includes('claude') || metaName.toLowerCase().includes('claude')) {
          return 'Claude';
        }
        // Gemini detection
        if (host.includes('gemini.google.com') || host.includes('bard.google.com') || title.includes('gemini') || title.includes('bard')) {
          return 'Gemini';
        }
        // ChatGPT detection
        if (host.includes('chat.openai.com') || host.includes('chatgpt.com') || title.includes('chatgpt')) {
          return 'ChatGPT';
        }
        // Poe detection
        if (host.includes('poe.com')) {
          // Try to detect specific model from UI
          try {
            const modelSelector = document.querySelector('[data-testid="model-selector"]') || document.querySelector('.ModelSelector_modelName');
            if (modelSelector) return 'Poe:' + modelSelector.textContent.trim();
          } catch (e) { }
          return 'Poe';
        }
        // Copilot/Bing detection
        if (host.includes('copilot.microsoft.com') || host.includes('bing.com/chat')) {
          return 'Copilot/Bing';
        }
        // Mistral detection
        if (host.includes('mistral.ai') || host.includes('chat.mistral')) {
          return 'Mistral';
        }
        // Perplexity detection
        if (host.includes('perplexity.ai')) {
          return 'Perplexity';
        }

        // Fallback to hostname-based
        return prettyModelName(host);
      } catch (e) {
        debugLog('detectCurrentModel error', e);
        return prettyModelName(location.hostname);
      }
    }

    function prettyModelName(platform) {
      if (!platform) return 'Unknown';
      const p = String(platform).toLowerCase();
      if (p.includes('claude') || p.includes('anthropic')) return 'Claude';
      if (p.includes('gemini') || p.includes('bard') || p.includes('google')) return 'Gemini';
      if (p.includes('chat.openai') || p.includes('chatgpt') || p.includes('openai')) return 'ChatGPT';
      if (p.includes('poe.com') || p.includes('poe:')) return p.includes('poe:') ? 'Poe' : 'Poe';
      if (p.includes('mistral')) return 'Mistral';
      if (p.includes('perplexity')) return 'Perplexity';
      if (p.includes('bing') || p.includes('copilot')) return 'Copilot/Bing';
      return (platform.length > 20) ? platform.slice(0, 20) + '…' : platform;
    }

    // Helper: open a conversation by ID in Smart Results answer area
    async function openConversationById(id) {
      try {
        const convs = await loadConversationsAsync();
        const conv = (convs || []).find(c => String(c.ts) === String(id));
        if (!conv || !conv.conversation || !conv.conversation.length) {
          toast('Conversation not found');
          return;
        }
        const full = conv.conversation.map(m => `${m.role}: ${m.text}`).join('\n\n');
        smartAnswer.textContent = full;
        toast('Opened conversation');
        // Scroll Smart Results into view
        try {
          smartAnswer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (e) { }
      } catch (e) {
        debugLog('openConversationById error', e);
        toast('Failed to open conversation');
      }
    }

    let lastSmartResults = [];

    function renderSmartResults(results) {
      try {
        if (!results || !results.length) { smartResults.textContent = '(No matches)'; lastSmartResults = []; return; }
        lastSmartResults = results;
        // Build a small HTML list showing host, ts and snippet
        smartResults.innerHTML = '';
        results.forEach((r, idx) => {
          const row = document.createElement('div'); row.className = 'cb-row-result';
          const hdr = document.createElement('div'); hdr.className = 'cb-row-hdr';
          const left = document.createElement('div'); left.className = 'cb-row-left';
          left.textContent = `${r.host} • ${r.count} msgs • ${r.time}`;
          const right = document.createElement('div'); right.className = 'cb-row-right';
          const openBtn = document.createElement('button'); openBtn.className = 'cb-btn cb-open-btn'; openBtn.textContent = 'Open';
          openBtn.addEventListener('click', () => { smartAnswer.textContent = r.snippetFull || '(no text)'; });
          const copyBtn = document.createElement('button'); copyBtn.className = 'cb-btn cb-copy-btn'; copyBtn.textContent = 'Copy';
          copyBtn.addEventListener('click', () => { try { navigator.clipboard.writeText(r.snippetFull || ''); toast('Copied'); } catch (_) { toast('Copy failed'); } });
          right.appendChild(openBtn); right.appendChild(copyBtn);
          hdr.appendChild(left); hdr.appendChild(right);
          row.appendChild(hdr);
          const sn = document.createElement('div'); sn.className = 'cb-snippet'; sn.textContent = r.snippet || '';
          row.appendChild(sn);
          // tags display
          try {
            if (r.topics && Array.isArray(r.topics) && r.topics.length) {
              const tagRow = document.createElement('div'); tagRow.className = 'cb-tag-row';
              r.topics.slice(0, 6).forEach(t => { const chip = document.createElement('div'); chip.className = 'cb-tag-chip'; const disp = String(t).split(/[_\-\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); chip.textContent = disp; tagRow.appendChild(chip); });
              row.appendChild(tagRow);
            }
          } catch (e) { }
          smartResults.appendChild(row);
        });
      } catch (e) { debugLog('renderSmartResults', e); smartResults.textContent = '(render error)'; }
    }

    // Add Enter key handler for smart search input
    smartInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        btnSmartSearch.click();
      }
    });
    btnSmartSearch.addEventListener('click', async () => {
      try {
        const q = (smartInput && smartInput.value) ? smartInput.value.trim() : '';
        if (!q) { toast('Type a search query'); return; }
        smartResults.textContent = 'Searching...'; smartAnswer.textContent = ''; announce('Searching saved chats');
        // First try semantic vector query via background
        async function vectorQueryAsync(qstr, topK) {
          return new Promise(res => {
            try {
              chrome.runtime.sendMessage({ type: 'vector_query', payload: { query: qstr, topK: topK || 6 } }, (r) => {
                if (chrome.runtime.lastError) return res({ ok: false, error: chrome.runtime.lastError.message });
                return res(r || { ok: false });
              });
            } catch (e) { return res({ ok: false, error: e && e.message }); }
          });
        }

        let vectorFailed = false;
        let vectorError = '';
        try {
          const vres = await vectorQueryAsync(q, 8);
          if (vres && vres.ok && Array.isArray(vres.results) && vres.results.length) {
            // Map ids back to saved conversations
            const convs = await loadConversationsAsync();
            const mapped = vres.results.map(r => {
              const id = String(r.id || '');
              const conv = (convs || []).find(c => String(c.ts) === id);
              const host = (conv && (conv.platform || conv.url)) ? (conv.platform || new URL(conv.url || location.href).hostname) : (r.metadata && (r.metadata.platform || (r.metadata.url && new URL(r.metadata.url).hostname))) || location.hostname;
              const date = conv ? new Date(conv.ts) : (r.metadata && r.metadata.ts ? new Date(r.metadata.ts) : new Date());
              const time = date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
              const full = conv ? ((conv.conversation || []).map(m => `${m.role}: ${m.text}`).join('\n\n')) : (r.metadata && r.metadata.snippet) || '';
              const snippet = full.length > 400 ? full.slice(0, 400) + '…' : full;
              const count = conv ? (conv.conversation || []).length : (r.metadata && r.metadata.count) || 0;
              const topics = conv && Array.isArray(conv.topics) ? conv.topics : (r.metadata && r.metadata.topics ? r.metadata.topics : []);
              return { host, time, snippet, snippetFull: full, count, score: r.score, id, topics };
            }).slice(0, 12);
            // apply filters from UI
            try {
              const selHost = (hostSelect && hostSelect.value) ? hostSelect.value : '';
              const selTag = (tagSelect && tagSelect.value) ? tagSelect.value : '';
              const selDate = (dateSelect && dateSelect.value) ? dateSelect.value : 'All time';
              const now = Date.now();
              const filtered = mapped.filter(it => {
                if (selHost && it.host && it.host !== selHost) return false;
                if (selTag && (!it.topics || !it.topics.some(t => t.toLowerCase() === selTag.toLowerCase()))) return false;
                if (selDate && selDate !== 'All time') {
                  const days = selDate === 'Last 7 days' ? 7 : (selDate === 'Last 30 days' ? 30 : 0);
                  if (days > 0) {
                    const convTs = (convs || []).find(c => String(c.ts) === String(it.id));
                    const ts = convTs && convTs.ts ? Number(convTs.ts) : 0;
                    if (!ts) return false;
                    if ((now - ts) > days * 24 * 3600 * 1000) return false;
                  }
                }
                return true;
              }).slice(0, 12);
              renderSmartResults(filtered);
              announce('Search complete');
            } catch (e) { renderSmartResults(mapped); announce('Search complete'); }
            return;
          } else if (vres && !vres.ok) {
            vectorFailed = true;
            vectorError = vres.error || 'unknown error';
          }
        } catch (e) {
          debugLog('vector query failed', e);
          vectorFailed = true;
          vectorError = e.message || 'exception';
        }

        // Fallback to local substring search
        if (vectorFailed && vectorError === 'no_embedding') {
          toast('⚠️ AI search unavailable. Add Gemini API key in Options for semantic search. Using basic search...');
        } else if (vectorFailed) {
          toast('⚠️ AI search failed. Using basic keyword search...');
        }

        const convs = await loadConversationsAsync();
        if (!convs || convs.length === 0) {
          smartResults.textContent = '(No saved conversations yet. Scan and save some chats first!)';
          announce('No saved conversations found');
          return;
        }

        const ql = q.toLowerCase();
        const scored = (Array.isArray(convs) ? convs : []).map(s => {
          const host = (s.platform || s.url || '').toString();
          const date = new Date(s.ts || Date.now());
          const time = date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          const full = (s.conversation || []).map(m => `${m.role}: ${m.text}`).join('\n\n');
          const count = (s.conversation || []).length || 0;
          const score = (full.toLowerCase().split(ql).length - 1) + ((host || '').toLowerCase().includes(ql) ? 1 : 0);
          const snippet = full.length > 400 ? full.slice(0, 400) + '…' : full;
          return { s, score, host, time, snippet, snippetFull: full, count };
        }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 12);
        // map and apply filters
        const mapped = scored.map(r => ({ id: String(r.s && r.s.ts), host: r.host || new URL(r.s && r.s.url || location.href).hostname, time: r.time, snippet: r.snippet, snippetFull: r.snippetFull, count: r.count, topics: r.s && r.s.topics ? r.s.topics : [] }));
        try {
          const selHost = (hostSelect && hostSelect.value) ? hostSelect.value : '';
          const selTag = (tagSelect && tagSelect.value) ? tagSelect.value : '';
          const selDate = (dateSelect && dateSelect.value) ? dateSelect.value : 'All time';
          const now = Date.now();
          const filtered = mapped.filter(it => {
            if (selHost && it.host && it.host !== selHost) return false;
            if (selTag && (!it.topics || !it.topics.some(t => t.toLowerCase() === selTag.toLowerCase()))) return false;
            if (selDate && selDate !== 'All time') {
              const days = selDate === 'Last 7 days' ? 7 : (selDate === 'Last 30 days' ? 30 : 0);
              if (days > 0) {
                const convObj = (convs || []).find(c => String(c.ts) === String(it.id));
                const ts = convObj && convObj.ts ? Number(convObj.ts) : 0;
                if (!ts) return false;
                if ((now - ts) > days * 24 * 3600 * 1000) return false;
              }
            }
            return true;
          }).slice(0, 12);

          if (filtered.length === 0 && mapped.length > 0) {
            toast('No results match your filters. Showing all results.');
            renderSmartResults(mapped);
          } else {
            renderSmartResults(filtered);
          }
          announce(`Found ${filtered.length || mapped.length} results`);
        } catch (e) { renderSmartResults(mapped); }
      } catch (e) { debugLog('smart search error', e); smartResults.textContent = '(Search failed: ' + (e.message || 'unknown error') + ')'; toast('Search failed'); }
    });

    btnSmartAsk.addEventListener('click', async () => {
      try {
        const q = (smartInput && smartInput.value) ? smartInput.value.trim() : '';
        if (!q) { toast('Type a question to ask'); return; }

        btnSmartAsk.disabled = true; addLoadingToButton(btnSmartAsk, 'Searching chats…'); smartAnswer.textContent = ''; announce('Searching saved chats for relevant info');

        // First, search saved chats for relevant context
        let searchResults = [];
        try {
          const vres = await runVectorQuery(q, 8);
          if (vres && vres.ok && Array.isArray(vres.results)) {
            searchResults = vres.results;
          }
        } catch (searchErr) {
          debugLog('Vector search failed', searchErr);
        }

        addLoadingToButton(btnSmartAsk, 'Asking AI…');

        // Build context from search results
        let ctx = '';
        if (searchResults.length > 0) {
          const convs = await loadConversationsAsync();
          for (let i = 0; i < Math.min(6, searchResults.length); i++) {
            try {
              const r = searchResults[i];
              const id = String(r.id || '');
              const conv = (convs || []).find(c => String(c.ts) === id);
              if (conv && conv.conversation && conv.conversation.length) {
                const snippet = conv.conversation.map(m => `${m.role}: ${m.text}`).join('\n').slice(0, 2000);
                if ((ctx + '\n\n' + snippet).length > 13000) break;
                ctx += '\n\n--- Conversation excerpt ' + (i + 1) + ' ---\n\n' + snippet;
              }
            } catch (e) { }
          }
        }

        // If context found, use it; otherwise answer directly with AI
        let prompt = '';
        if (ctx.trim().length > 100) {
          prompt = `You are an assistant that answers questions about a user's past chat logs. Use the provided conversation excerpts as context to answer the question. If the answer isn't fully contained in the excerpts, you can supplement with your knowledge but clearly indicate what comes from the excerpts vs. your general knowledge.\n\nQuestion: ${q}\n\nContext from saved chats: ${ctx}`;
        } else {
          prompt = `Answer this question clearly and concisely: ${q}`;
          smartAnswer.textContent = '(No relevant saved chats found. Using AI knowledge directly.)\n\n';
        }

        const res = await callGeminiAsync({ action: 'prompt', text: prompt, length: 'short' });
        if (res && res.ok) {
          const answerText = res.result || '(no answer)';
          smartAnswer.textContent = answerText;
          announce('Answer ready');
          // provenance: find which saved conversations / models contributed similar content to this answer
          try {
            smartProvenance.innerHTML = '';
            const vres = await runVectorQuery(answerText, 12);
            if (vres && vres.ok && Array.isArray(vres.results) && vres.results.length) {
              const convs = await loadConversationsAsync();
              const contribs = [];
              const contribsWithDetails = [];
              for (const r of vres.results) {
                try {
                  const id = String(r.id || '');
                  const meta = r.metadata || {};
                  const conv = (convs || []).find(c => String(c.ts) === id) || null;
                  // Prefer explicit model field, fallback to platform inference
                  const explicitModel = conv && conv.model ? conv.model : null;
                  const platformRaw = conv && conv.platform ? conv.platform : (meta && (meta.platform || meta.url) ? (meta.platform || meta.url) : 'unknown');
                  const ts = conv && conv.ts ? Number(conv.ts) : (meta && meta.ts ? Number(meta.ts) : 0);
                  const model = explicitModel || prettyModelName(platformRaw);
                  const snippet = conv && conv.conversation ? conv.conversation.slice(0, 2).map(m => `${m.role}: ${(m.text || '').slice(0, 120)}`).join('\n') : '(no snippet)';
                  const entry = { model, ts: ts || 0, rawPlatform: platformRaw, id, snippet };
                  contribs.push(entry);
                  contribsWithDetails.push(entry);
                } catch (e) { debugLog('provenance map entry error', e); }
              }
              // sort by ts ascending and dedupe by model keeping first occurrence
              contribs.sort((a, b) => (a.ts || 0) - (b.ts || 0));
              const seen = new Set();
              const uniq = [];
              for (const c of contribs) {
                if (!seen.has(c.model)) { seen.add(c.model); uniq.push(c); }
              }
              if (uniq.length) {
                // build human-friendly sentence with clickable model names
                function fmtDate(ts) { try { if (!ts) return 'an earlier date'; const d = new Date(Number(ts)); return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return 'an earlier date'; } }

                // Create sentence container
                const sentenceEl = document.createElement('span');
                sentenceEl.style.color = 'rgba(200,200,200,0.9)';
                sentenceEl.style.fontSize = '12px';

                if (uniq.length === 1) {
                  sentenceEl.innerHTML = 'This solution was suggested by ';
                  const link = document.createElement('a');
                  link.href = '#';
                  link.textContent = uniq[0].model;
                  link.style.color = 'var(--cb-champagne)';
                  link.style.textDecoration = 'underline';
                  link.style.cursor = 'pointer';
                  link.addEventListener('click', (e) => {
                    e.preventDefault();
                    openConversationById(uniq[0].id);
                  });
                  sentenceEl.appendChild(link);
                  sentenceEl.appendChild(document.createTextNode(` on ${fmtDate(uniq[0].ts)}.`));
                } else if (uniq.length === 2) {
                  sentenceEl.innerHTML = 'This solution was suggested by ';
                  const link1 = document.createElement('a');
                  link1.href = '#';
                  link1.textContent = uniq[0].model;
                  link1.style.color = 'var(--cb-champagne)';
                  link1.style.textDecoration = 'underline';
                  link1.style.cursor = 'pointer';
                  link1.addEventListener('click', (e) => {
                    e.preventDefault();
                    openConversationById(uniq[0].id);
                  });
                  sentenceEl.appendChild(link1);
                  sentenceEl.appendChild(document.createTextNode(` on ${fmtDate(uniq[0].ts)} and refined by `));
                  const link2 = document.createElement('a');
                  link2.href = '#';
                  link2.textContent = uniq[1].model;
                  link2.style.color = 'var(--cb-champagne)';
                  link2.style.textDecoration = 'underline';
                  link2.style.cursor = 'pointer';
                  link2.addEventListener('click', (e) => {
                    e.preventDefault();
                    openConversationById(uniq[1].id);
                  });
                  sentenceEl.appendChild(link2);
                  sentenceEl.appendChild(document.createTextNode(` on ${fmtDate(uniq[1].ts)}.`));
                } else {
                  const first = uniq[0];
                  const last = uniq[uniq.length - 1];
                  const middle = uniq.slice(1, uniq.length - 1);
                  sentenceEl.innerHTML = 'This solution was first suggested by ';
                  const link1 = document.createElement('a');
                  link1.href = '#';
                  link1.textContent = first.model;
                  link1.style.color = 'var(--cb-champagne)';
                  link1.style.textDecoration = 'underline';
                  link1.style.cursor = 'pointer';
                  link1.addEventListener('click', (e) => {
                    e.preventDefault();
                    openConversationById(first.id);
                  });
                  sentenceEl.appendChild(link1);
                  sentenceEl.appendChild(document.createTextNode(` on ${fmtDate(first.ts)}, refined by ${middle.map(m => m.model).join(', ')} on subsequent dates, and verified by `));
                  const link2 = document.createElement('a');
                  link2.href = '#';
                  link2.textContent = last.model;
                  link2.style.color = 'var(--cb-champagne)';
                  link2.style.textDecoration = 'underline';
                  link2.style.cursor = 'pointer';
                  link2.addEventListener('click', (e) => {
                    e.preventDefault();
                    openConversationById(last.id);
                  });
                  sentenceEl.appendChild(link2);
                  sentenceEl.appendChild(document.createTextNode(` on ${fmtDate(last.ts)}.`));
                }

                smartProvenance.appendChild(sentenceEl);

                // Add Details toggle
                if (contribsWithDetails.length > 1) {
                  const detailsToggle = document.createElement('a');
                  detailsToggle.href = '#';
                  detailsToggle.textContent = ' [Show details]';
                  detailsToggle.style.color = 'var(--cb-accent)';
                  detailsToggle.style.fontSize = '11px';
                  detailsToggle.style.marginLeft = '8px';
                  detailsToggle.style.cursor = 'pointer';
                  detailsToggle.style.textDecoration = 'none';

                  const detailsContainer = document.createElement('div');
                  detailsContainer.style.display = 'none';
                  detailsContainer.style.marginTop = '12px';
                  detailsContainer.style.padding = '10px';
                  detailsContainer.style.background = 'rgba(20,20,30,0.18)';
                  detailsContainer.style.borderRadius = '8px';
                  detailsContainer.style.fontSize = '11px';
                  detailsContainer.style.maxHeight = '300px';
                  detailsContainer.style.overflowY = 'auto';

                  let isExpanded = false;
                  detailsToggle.addEventListener('click', (e) => {
                    e.preventDefault();
                    isExpanded = !isExpanded;
                    detailsContainer.style.display = isExpanded ? 'block' : 'none';
                    detailsToggle.textContent = isExpanded ? ' [Hide details]' : ' [Show details]';
                  });

                  // Populate details container
                  contribsWithDetails.forEach((contrib, idx) => {
                    const detailRow = document.createElement('div');
                    detailRow.style.marginBottom = '10px';
                    detailRow.style.paddingBottom = '10px';
                    detailRow.style.borderBottom = idx < contribsWithDetails.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none';

                    const detailHeader = document.createElement('div');
                    detailHeader.style.fontWeight = '600';
                    detailHeader.style.marginBottom = '4px';
                    detailHeader.style.color = 'var(--cb-champagne)';

                    const modelLink = document.createElement('a');
                    modelLink.href = '#';
                    modelLink.textContent = contrib.model;
                    modelLink.style.color = 'var(--cb-champagne)';
                    modelLink.style.textDecoration = 'underline';
                    modelLink.addEventListener('click', (e) => {
                      e.preventDefault();
                      openConversationById(contrib.id);
                    });

                    detailHeader.appendChild(modelLink);
                    detailHeader.appendChild(document.createTextNode(` • ${fmtDate(contrib.ts)} • ${contrib.rawPlatform}`));

                    const detailSnippet = document.createElement('div');
                    detailSnippet.style.color = 'rgba(200,200,200,0.8)';
                    detailSnippet.style.fontSize = '11px';
                    detailSnippet.style.marginTop = '4px';
                    detailSnippet.style.whiteSpace = 'pre-wrap';
                    detailSnippet.textContent = contrib.snippet + '…';

                    detailRow.appendChild(detailHeader);
                    detailRow.appendChild(detailSnippet);
                    detailsContainer.appendChild(detailRow);
                  });

                  smartProvenance.appendChild(detailsToggle);
                  smartProvenance.appendChild(detailsContainer);
                }
              }
            }
          } catch (e) { debugLog('provenance generation failed', e); }
        } else {
          smartAnswer.textContent = 'AI query failed: ' + (res && res.error ? res.error : 'unknown');
        }
      } catch (e) { debugLog('smart ask error', e); smartAnswer.textContent = '(ask failed)'; }
      finally { removeLoadingFromButton(btnSmartAsk, 'Ask AI'); }
    });

    // Index all saved conversations via background bulk index
    btnIndexAll.addEventListener('click', async () => {
      const prev = btnIndexAll.textContent;
      addLoadingToButton(btnIndexAll, 'Indexing...');
      smartAnswer.textContent = '';
      announce('Indexing all saved chats');
      try {
        await optimisticAction({
          applyOptimistic: () => { smartAnswer.textContent = 'Indexing started…'; smartAnswer.classList.add('cb-fade-in'); },
          confirmUI: (res) => { try { smartAnswer.textContent = `Indexed ${res.indexed || 0} conversations.`; smartAnswer.classList.add('cb-scale-pop'); announce('Indexing complete'); } catch (e) { } },
          rollbackUI: (err) => { try { smartAnswer.textContent = 'Index failed: ' + (err && err.message ? err.message : 'unknown'); } catch (e) { } },
          action: async () => {
            // call background with exponential backoff
            const res = await callBackgroundWithBackoff({ type: 'vector_index_all' }, 3, 500);
            return res;
          },
          onError: (err) => {
            showError('Index all failed: ' + (err && err.message ? err.message : 'unknown'), async () => { try { btnIndexAll.click(); } catch (e) { } });
          }
        });
      } catch (e) {
        debugLog('Index all exception', e);
      } finally {
        removeLoadingFromButton(btnIndexAll, prev);
      }
    });

    function refreshHistory() {
      loadConversationsAsync().then(list => {
        const arr = Array.isArray(list) ? list : [];
        if (!arr.length) {
          historyEl.textContent = 'History: (none)';
          preview.textContent = 'Preview: (none)';
          return;
        }
        // History: virtual list when large; compact text when small
        try {
          const LARGE_THRESHOLD = 30;
          if (arr.length > LARGE_THRESHOLD) {
            const ITEM_H = 44;
            historyEl.innerHTML = '';
            historyEl.style.maxHeight = '280px';
            historyEl.style.overflowY = 'auto';
            const full = document.createElement('div');
            full.style.position = 'relative';
            full.style.height = (arr.length * ITEM_H) + 'px';
            full.style.width = '100%';
            full.id = 'cb-history-virt';
            historyEl.appendChild(full);
            const render = () => {
              const scrollTop = historyEl.scrollTop || 0;
              const viewportH = historyEl.clientHeight || 280;
              const start = Math.max(0, Math.floor(scrollTop / ITEM_H) - 2);
              const end = Math.min(arr.length, start + Math.ceil(viewportH / ITEM_H) + 6);
              while (full.firstChild) full.removeChild(full.firstChild);
              for (let i = start; i < end; i++) {
                const s = arr[i];
                let host = s.platform || 'chat';
                try { host = new URL(s.url || location.href).hostname; } catch (_) { }
                if (host.length > 18) host = host.slice(0, 16) + '…';
                const date = new Date(s.ts);
                const timeStr = date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                const count = (s.conversation || []).length;
                const row = document.createElement('div');
                row.style.cssText = `position:absolute;left:0;right:0;top:${i * ITEM_H}px;height:${ITEM_H - 4}px;display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid rgba(230,207,159,0.08);cursor:pointer;`;
                row.setAttribute('role', 'button');
                row.setAttribute('aria-label', `Open ${host} with ${count} messages from ${timeStr}`);
                const dot = document.createElement('span');
                dot.style.cssText = 'display:inline-block;width:6px;height:6px;border-radius:50%;background:rgba(230,207,159,0.6)';
                row.appendChild(dot);
                const txt = document.createElement('div');
                txt.style.cssText = 'flex:1 1 auto;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0.92';

                // Get first message as preview (5-6 words max)
                let preview = '';
                try {
                  if (s.conversation && s.conversation.length > 0) {
                    const firstMsg = s.conversation[0];
                    preview = (firstMsg.text || '').replace(/\n/g, ' ').trim().split(' ').slice(0, 6).join(' ');
                    if (preview.length > 0) preview += '...';
                  }
                } catch (e) { }

                txt.textContent = preview || `${count} messages  ${timeStr}`;
                row.appendChild(txt);
                // Open button
                const openBtn = document.createElement('button');
                openBtn.className = 'cb-btn';
                openBtn.style.cssText = 'padding:4px 8px;font-size:11px;border-radius:8px;margin-left:8px;';
                openBtn.textContent = 'Open';
                row.appendChild(openBtn);
                // Delete button
                const delBtn = document.createElement('button');
                delBtn.className = 'cb-btn';
                delBtn.style.cssText = 'padding:4px 8px;font-size:11px;border-radius:8px;margin-left:4px;background:#ff4d4f;color:#fff;';
                delBtn.textContent = 'Delete';
                row.appendChild(delBtn);
                // Open handler
                const open = () => {
                  try {
                    // Show only first 5-6 words of first message
                    const firstMsg = (s.conversation && s.conversation[0]) ? s.conversation[0].text : '';
                    const words = firstMsg.split(' ').slice(0, 6).join(' ');
                    preview.textContent = 'Preview: ' + (words || '(empty)');
                    announce('Viewing conversation from ' + timeStr);
                  } catch (e) { }
                };
                row.addEventListener('click', open);
                openBtn.addEventListener('click', (ev) => { ev.stopPropagation(); open(); });
                // Delete handler
                delBtn.addEventListener('click', (ev) => {
                  ev.stopPropagation();
                  if (confirm('Delete this conversation?')) {
                    // Remove from storage and refresh
                    try {
                      const convs = (window.ChatBridge.getConversations && window.ChatBridge.getConversations()) || [];
                      const idx = convs.findIndex(c => c.ts === s.ts);
                      if (idx >= 0) {
                        convs.splice(idx, 1);
                        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                          chrome.storage.local.set({ cb_conversations: convs }, () => window.ChatBridge.refreshHistory());
                        } else {
                          localStorage.setItem('cb_conversations', JSON.stringify(convs));
                          window.ChatBridge.refreshHistory();
                        }
                      }
                    } catch (e) { toast('Delete failed'); }
                  }
                });
                full.appendChild(row);
              }
            };
            try { historyEl.__virtRender = render; historyEl.__virtItems = arr; } catch (_) { }
            historyEl.removeEventListener('scroll', historyEl.__virtScroll || (() => { }), { passive: true });
            historyEl.__virtScroll = () => render();
            // Mark scroll listener as passive to avoid main-thread blocking warnings
            historyEl.addEventListener('scroll', historyEl.__virtScroll, { passive: true });
            render();
          } else {
            historyEl.textContent = arr.slice(0, 6).map(s => {
              let host = s.platform || 'chat';
              try { host = new URL(s.url || location.href).hostname; } catch (_) { }
              const date = new Date(s.ts);
              const timeStr = date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
              return `${host} • ${(s.conversation || []).length} msgs • ${timeStr}`;
            }).join('\n\n');
          }
        } catch (e) { /* noop */ }
        // Default preview from first conversation (only 5-6 words)
        const firstConv = arr[0];
        if (firstConv && firstConv.conversation && firstConv.conversation.length > 0) {
          const firstMsg = firstConv.conversation[0].text || '';
          const words = firstMsg.split(' ').slice(0, 6).join(' ');
          preview.textContent = 'Preview: ' + (words || '(empty)');
        } else {
          preview.textContent = 'Preview: (none)';
        }
      });
    }

    // chatSelect removed - preview is now updated directly when clicking history items

    // load persisted model/prompt from chrome.storage.local with localStorage fallback
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['cb_model', 'cb_system'], (res) => {
          try { if (res && res.cb_model) modelSelect.value = res.cb_model; if (res && res.cb_system) sysPrompt.value = res.cb_system; } catch (e) { }
        });
      } else {
        const savedModel = localStorage.getItem('cb_model'); if (savedModel) modelSelect.value = savedModel;
        const savedSys = localStorage.getItem('cb_system'); if (savedSys) sysPrompt.value = savedSys;
      }
    } catch (e) { }

    modelSelect.addEventListener('change', () => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) chrome.storage.local.set({ cb_model: modelSelect.value });
        else localStorage.setItem('cb_model', modelSelect.value);
      } catch (e) { }
    });

    sysPrompt.addEventListener('change', () => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) chrome.storage.local.set({ cb_system: sysPrompt.value });
        else localStorage.setItem('cb_system', sysPrompt.value);
      } catch (e) { }
    });

    function toast(msg) {
      try {
        const t = document.createElement('div');
        t.setAttribute('data-cb-ignore', 'true');
        t.textContent = msg;
        t.style.position = 'fixed';
        t.style.bottom = '18px';
        t.style.left = '18px';
        t.style.background = 'rgba(10,15,28,0.9)';
        t.style.color = '#E6E9F0';
        t.style.padding = '8px 12px';
        t.style.borderRadius = '10px';
        t.style.zIndex = '2147483647';
        t.style.border = '1px solid rgba(0,180,255,0.25)';
        t.style.boxShadow = '0 0 12px rgba(0,180,255,0.25)';
        t.style.letterSpacing = '0.5px';
        t.style.fontFamily = "'Bebas Neue', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial";
        t.setAttribute('role', 'status');
        t.setAttribute('aria-live', 'polite');
        document.body.appendChild(t); announce(msg);
        setTimeout(() => { try { t.remove(); } catch (e) { } }, 2400);
      } catch (e) { try { alert(msg); } catch (_) { } }
    }

    refreshHistory();
    try {
      window.ChatBridge = window.ChatBridge || {};
      window.ChatBridge._renderLastScan = renderLastScan;
      window.ChatBridge.refreshHistory = refreshHistory;
    } catch (e) { }

    // Initialize Smart Context Injection
    try {
      if (window.SmartContextInjection) {
        const contextInjection = new window.SmartContextInjection();
        // Initialize after a short delay to ensure page is ready
        setTimeout(() => {
          try {
            // Find all AI chat inputs on the page
            const inputs = document.querySelectorAll('textarea, [contenteditable="true"]');
            inputs.forEach(input => {
              contextInjection.init(input, shadow);
            });
            debugLog('Smart Context Injection initialized');
          } catch (e) {
            debugLog('Smart Context Injection init failed:', e);
          }
        }, 1000);
      }
    } catch (e) {
      debugLog('Smart Context Injection setup failed:', e);
    }

    // Luxury Mode removed - themes handle visual styling now
    debugLog('[ChatBridge] Using theme system for visual styles');

    return { host, avatar, panel };
  }

  // Debounce mechanism for scan operations
  let scanDebounceTimer = null;
  let lastScanTimestamp = 0;
  const SCAN_DEBOUNCE_MS = 300; // Quick debounce - prevents accidental double-clicks only

  async function scanChat() {
    // Debounce rapid scan calls
    const now = Date.now();
    if (now - lastScanTimestamp < SCAN_DEBOUNCE_MS) {
      debugLog('[Scan] Debounced - too soon after last scan');
      return window.ChatBridge?._lastScanResult || [];
    }
    lastScanTimestamp = now;

    debugLog('[Scan] Starting scan...');
    try {
      debugLog('=== SCAN START ===');
      const pick = (typeof window.pickAdapter === 'function') ? window.pickAdapter : null;
      const adapter = pick ? pick() : null;
      debugLog('adapter detected:', adapter ? adapter.id : 'none');

      // prefer container near the input/composer when available to avoid picking sidebars
      let container = null;
      try {
        const inputEl = (adapter && typeof adapter.getInput === 'function') ? adapter.getInput() : (document.querySelector('textarea, [contenteditable="true"], input[type=text]'));
        debugLog('input element found:', !!inputEl, inputEl ? inputEl.tagName : 'none');

        if (inputEl) {
          try {
            if (typeof window.findChatContainerNearby === 'function') {
              container = window.findChatContainerNearby(inputEl) || null;
              debugLog('container from findChatContainerNearby:', !!container);
            } else {
              // fallback: climb parents searching for an element with multiple message-like children
              let p = inputEl.parentElement; let found = null; let depth = 0;
              while (p && depth < 10 && !found) {
                try {
                  const cnt = (p.querySelectorAll && p.querySelectorAll('p, .message, .chat-line, .message-text, .markdown, .prose, .result, .chat-bubble').length) || 0;
                  // Require container to be reasonably wide (not a narrow sidebar)
                  const rect = p.getBoundingClientRect();
                  if (cnt >= 2 && rect.width > 400) found = p;
                } catch (e) { debugLog('container climb error at depth', depth, e); }
                p = p.parentElement; depth++;
              }
              container = found || null;
              debugLog('container from parent climb:', !!container, 'depth:', depth);
            }
          } catch (e) {
            debugLog('container detection error:', e);
            container = null;
          }
        }
      } catch (e) {
        debugLog('input/container detection error:', e);
        container = null;
      }

      // Fallback chain with error handling
      if (!container) {
        try {
          container = (adapter && adapter.scrollContainer && adapter.scrollContainer()) || null;
          debugLog('container from adapter.scrollContainer:', !!container);
        } catch (e) {
          debugLog('adapter.scrollContainer error:', e);
        }
      }

      if (!container) {
        container = document.querySelector('main') || document.body;
        debugLog('container fallback to main/body:', container.tagName);
      }

      // Final validation - if chosen container is too narrow, try main or body
      try {
        const rect = container.getBoundingClientRect();
        debugLog('container width:', rect.width + 'px');
        if (rect.width < 400) {
          debugLog('chosen container too narrow (' + rect.width + 'px), falling back to main/body');
          container = document.querySelector('main') || document.body;
        }
      } catch (e) {
        debugLog('container width check error:', e);
      }

      debugLog('chosen container', {
        adapter: adapter && adapter.id,
        container: container && (container.tagName + (container.id ? '#' + container.id : '') + ' ' + (container.className || '').toString().split(' ').slice(0, 2).join(' ')),
        width: container && Math.round(container.getBoundingClientRect().width) + 'px'
      });

      try {
        window.ChatBridge = window.ChatBridge || {};
        window.ChatBridge._lastScan = {
          chosenContainer: container && (container.tagName + (container.id ? '#' + container.id : '') + (container.className ? '.' + (container.className || '').toString().split(' ').filter(c => c).slice(0, 2).join('.') : '')),
          adapterId: (adapter && adapter.id) || null,
          timestamp: Date.now(),
          nodesConsidered: 0,
          containerEl: container,
          containerWidth: container && Math.round(container.getBoundingClientRect().width),
          errors: []
        };
      } catch (e) {
        debugLog('_lastScan init error:', e);
      }

      // Scroll only if needed (skip for speed on modern AI chats)
      if (!SKIP_SCROLL_ON_SCAN) {
        try {
          await scrollContainerToTop(container);
          debugLog('scroll complete');
        } catch (e) {
          debugLog('scroll error:', e);
          try {
            if (window.ChatBridge && window.ChatBridge._lastScan) {
              window.ChatBridge._lastScan.errors.push('scroll_failed: ' + (e.message || String(e)));
            }
          } catch (_) { }
        }
      } else {
        debugLog('scroll skipped for speed');
      }

      // Quick stability check (very brief)
      try {
        await waitForDomStability(container);
        debugLog('DOM stable');
      } catch (e) {
        debugLog('DOM stability wait error:', e);
        try {
          if (window.ChatBridge && window.ChatBridge._lastScan) {
            window.ChatBridge._lastScan.errors.push('stability_timeout: ' + (e.message || String(e)));
          }
        } catch (_) { }
      }

      let raw = [];

      // Try adapter.getMessages with error handling
      try {
        if (adapter && typeof adapter.getMessages === 'function') {
          raw = adapter.getMessages() || [];
          debugLog('adapter.getMessages returned:', raw.length, 'messages');
          // enrich with attachments when source element present
          try {
            if (Array.isArray(raw)) {
              for (const m of raw) {
                try {
                  if (m && m.el && !m.attachments) {
                    const atts = extractAttachmentsFromElement(m.el);
                    if (atts && atts.length) m.attachments = atts;
                  }
                } catch (e) { }
              }
            }
          } catch (e) { debugLog('attachment enrichment error (adapter):', e); }
        }
      } catch (e) {
        debugLog('adapter.getMessages error:', e);
        try {
          if (window.ChatBridge && window.ChatBridge._lastScan) {
            window.ChatBridge._lastScan.errors.push('adapter_failed: ' + (e.message || String(e)));
          }
        } catch (_) { }
      }

      // Try AdapterGeneric fallback
      if ((!raw || !raw.length) && typeof window.AdapterGeneric !== 'undefined' && typeof window.AdapterGeneric.getMessages === 'function') {
        try {
          raw = window.AdapterGeneric.getMessages() || [];
          debugLog('AdapterGeneric.getMessages returned:', raw.length, 'messages');
        } catch (e) {
          debugLog('AdapterGeneric failed:', e);
          try {
            if (window.ChatBridge && window.ChatBridge._lastScan) {
              window.ChatBridge._lastScan.errors.push('generic_adapter_failed: ' + (e.message || String(e)));
            }
          } catch (_) { }
        }
      }

      // Last resort: manual node extraction
      if (!raw || !raw.length) {
        debugLog('falling back to manual node extraction');
        const sel = '.message, .chat-line, .message-text, .markdown, .prose, p, li, div';
        let nodes = [];
        try {
          nodes = Array.from((container || document).querySelectorAll(sel));
          debugLog('querySelectorAll found:', nodes.length, 'nodes');
        } catch (e) {
          debugLog('querySelectorAll error, trying fallback selectors:', e);
          try {
            nodes = Array.from(document.querySelectorAll('p,div,li'));
            debugLog('fallback querySelectorAll found:', nodes.length, 'nodes');
          } catch (e2) {
            debugLog('fallback querySelectorAll error:', e2);
            nodes = [];
          }
        }

        try {
          nodes = nodes.filter(n => n && n.innerText && n.closest && !n.closest('[data-cb-ignore], #cb-host'));
          debugLog('after filtering ignored:', nodes.length, 'nodes');
          nodes = filterCandidateNodes(nodes);
          debugLog('after filterCandidateNodes:', nodes.length, 'nodes');
        } catch (e) {
          debugLog('node filtering error:', e);
          // Keep unfiltered nodes if filtering fails
        }
        try { if (window.ChatBridge && window.ChatBridge._lastScan) window.ChatBridge._lastScan.nodesConsidered = nodes.length; } catch (e) { }
        // optionally highlight nodes for debug
        try { if (CB_HIGHLIGHT_ENABLED || DEBUG) highlightNodesByElements(nodes); } catch (e) { debugLog('highlight error:', e); }

        try {
          raw = nodes.map(n => ({
            text: extractTextWithFormatting(n),
            role: inferRoleFromNode(n),
            el: n,
            attachments: extractAttachmentsFromElement(n)
          }));
          debugLog('mapped to', raw.length, 'raw messages');
        } catch (e) {
          debugLog('node mapping error:', e);
          raw = [];
        }
      }

      debugLog('raw messages before normalization:', raw.length);
      try { if (window.ChatBridge && window.ChatBridge._lastScan) { window.ChatBridge._lastScan.messageCount = (raw && raw.length) || 0; } } catch (e) { }
      try { if (window.ChatBridge && typeof window.ChatBridge._renderLastScan === 'function') window.ChatBridge._renderLastScan(); } catch (e) { }

      const normalized = normalizeMessages(raw || []);
      debugLog('=== SCAN COMPLETE ===', normalized.length, 'messages');

      // Cache the result for debouncing
      try {
        window.ChatBridge = window.ChatBridge || {};
        window.ChatBridge._lastScanResult = normalized;
      } catch (e) { }

      // CRITICAL: Also update the central _lastScanData store for all sections
      try {
        if (normalized.length > 0) {
          const textContent = normalized.map(m => `${m.role}: ${m.text}`).join('\n\n');
          window.ChatBridge._lastScanData = window.ChatBridge._lastScanData || {};
          window.ChatBridge._lastScanData.messages = normalized;
          window.ChatBridge._lastScanData.text = textContent;
          window.ChatBridge._lastScanData.timestamp = Date.now();
          window.ChatBridge._lastScanData.platform = location.hostname;
          debugLog('[Scan] Updated _lastScanData with', normalized.length, 'messages');
        }
      } catch (e) { debugLog('[Scan] Failed to update _lastScanData:', e); }

      // Persist last scanned messages and attachments into debug object for downstream tools (e.g., media extract)
      try {
        if (window.ChatBridge && window.ChatBridge._lastScan) {
          window.ChatBridge._lastScan.messages = normalized;
          const atts = [];
          try { normalized.forEach(m => { if (Array.isArray(m.attachments)) atts.push(...m.attachments); }); } catch (_) { }
          window.ChatBridge._lastScan.attachments = atts;
        }
      } catch (_) { }

      // AUTOMATIC CONTENT EXTRACTION - Extract URLs, numbers, lists, code during scan
      try {
        if (typeof window.ChatBridge !== 'undefined' && typeof window.ChatBridge.extractContentFromMessages === 'function') {
          const extracted = window.ChatBridge.extractContentFromMessages(normalized);
          window.ChatBridge._lastScanData = window.ChatBridge._lastScanData || {};
          window.ChatBridge._lastScanData.extracted = extracted;
        }
      } catch (_) { }

      // AUTOMATIC IMAGE EXTRACTION AND SAVING - Extract images from messages and save to vault
      try {
        console.log('[ChatBridge] Extracting images from scan results...');
        if (typeof window.ChatBridge !== 'undefined' && typeof window.ChatBridge.extractImagesFromMessages === 'function') {
          // Use the exposed functions for full image extraction
          const images = await window.ChatBridge.extractImagesFromMessages(normalized);
          if (images && images.length > 0) {
            console.log('[ChatBridge] Saving', images.length, 'images to vault...');
            await window.ChatBridge.saveImagesToVault(images);
            // Update image count in _lastScanData
            window.ChatBridge._lastScanData = window.ChatBridge._lastScanData || {};
            window.ChatBridge._lastScanData.imageCount = images.length;
            // Update the image count element if it exists
            try {
              const countEl = document.getElementById('cb-image-count');
              if (countEl) {
                countEl.textContent = String(images.length);
              }
            } catch (_) { }
            // Trigger refresh of Image Vault display if function exists
            if (typeof window.ChatBridge.refreshImageVault === 'function') {
              try { await window.ChatBridge.refreshImageVault(); } catch (_) { }
            }
            console.log('[ChatBridge] Scan complete:', normalized.length, 'messages,', images.length, 'images saved');
          } else {
            console.log('[ChatBridge] No images found in scan');
            window.ChatBridge._lastScanData = window.ChatBridge._lastScanData || {};
            window.ChatBridge._lastScanData.imageCount = 0;
          }
        } else {
          // Fallback: count images from attachments only
          const imageCount = normalized.reduce((acc, m) => {
            if (Array.isArray(m.attachments)) {
              acc += m.attachments.filter(a => a.type === 'image').length;
            }
            return acc;
          }, 0);
          window.ChatBridge._lastScanData = window.ChatBridge._lastScanData || {};
          window.ChatBridge._lastScanData.imageCount = imageCount;
          console.log('[ChatBridge] Found', imageCount, 'images in attachments (fallback mode)');
        }
      } catch (e) {
        console.warn('[ChatBridge] Automatic image extraction failed:', e);
      }

      // Log any errors that occurred during scan
      debugLog('[Scan] Returning', normalized.length, 'messages');

      // Log any errors that occurred
      try {
        if (window.ChatBridge && window.ChatBridge._lastScan && window.ChatBridge._lastScan.errors && window.ChatBridge._lastScan.errors.length) {
          debugLog('Scan completed with errors:', window.ChatBridge._lastScan.errors);
        }
      } catch (e) { }

      return normalized;
    } catch (e) {
      debugLog('=== SCAN FAILED ===', e);
      console.error('[ChatBridge] Fatal scan error:', e);

      // Store error for debugging
      try {
        if (window.ChatBridge && window.ChatBridge._lastScan) {
          window.ChatBridge._lastScan.fatalError = e.message || String(e);
          window.ChatBridge._lastScan.errors = window.ChatBridge._lastScan.errors || [];
          window.ChatBridge._lastScan.errors.push('fatal: ' + (e.message || String(e)));
        }
      } catch (_) { }

      return [];
    }
  }

  async function saveConversation(conv) {
    try {
      // SECURITY: Sanitize conversation before saving
      if (typeof window.ChatBridgeSecurity !== 'undefined' && typeof window.ChatBridgeSecurity.sanitize === 'function') {
        try {
          // Check for sensitive data
          const fullText = (conv && conv.conversation) ? conv.conversation.map(m => m.text || '').join('\n') : '';
          const findings = window.ChatBridgeSecurity.detectSensitiveData(fullText);

          if (findings && findings.length > 0) {
            console.warn('[ChatBridge Security] Sensitive data detected in conversation:', findings);

            // Auto-sanitize the conversation
            if (Array.isArray(conv.conversation)) {
              conv.conversation = conv.conversation.map(msg => ({
                ...msg,
                text: window.ChatBridgeSecurity.sanitize(msg.text || '', { preserve: 3 })
              }));
            }

            // Log security event
            window.ChatBridgeSecurity.logSecurityEvent({
              type: 'sensitive_data_detected',
              details: { findings: findings.map(f => ({ type: f.type, count: f.count })), platform: conv.platform },
              severity: 'high'
            });
          }
        } catch (e) {
          console.warn('[ChatBridge Security] Sanitization check failed:', e);
        }
      }

      // persist to BOTH localStorage (page-local) AND chrome.storage.local (extension-wide)
      const key = 'chatbridge:conversations';

      // Deduplication guard: if the most-recent stored conversation looks identical
      // (same platform and same last message) and was saved very recently, skip saving.
      try {
        let top = null;
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          const data = await new Promise(r => chrome.storage.local.get([key], d => r(d && d[key]))).catch(() => null);
          const arr = Array.isArray(data) ? data : (Array.isArray(data) ? data : (Array.isArray(data) ? data : []));
          top = (Array.isArray(arr) && arr[0]) ? arr[0] : null;
        } else {
          try { const arr = JSON.parse(localStorage.getItem(key) || '[]'); top = (Array.isArray(arr) && arr[0]) ? arr[0] : null; } catch (_) { top = null; }
        }

        if (top) {
          const lastA = (conv && Array.isArray(conv.conversation) && conv.conversation.length) ? String(conv.conversation[conv.conversation.length - 1].text || '').trim().slice(0, 300) : '';
          const lastB = (top && Array.isArray(top.conversation) && top.conversation.length) ? String(top.conversation[top.conversation.length - 1].text || '').trim().slice(0, 300) : '';
          const samePlatform = String(top.platform || '').toLowerCase() === String(conv.platform || '').toLowerCase();
          const timeDiff = Math.abs((conv.ts || Date.now()) - (top.ts || 0));
          if (samePlatform && lastA && lastB && lastA === lastB && timeDiff < 60 * 1000) {
            debugLog('saveConversation: duplicate detected (same last message within 60s), skipping save');
            return true;
          }
        }
      } catch (e) { /* if dedupe check fails, continue to save */ }

      // 1) Persist to background IndexedDB first and wait for ack (prevents race with UI refresh)
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          const ok = await new Promise((resolve) => {
            try {
              chrome.runtime.sendMessage({ type: 'save_conversation', payload: conv }, (res) => {
                if (chrome.runtime.lastError) return resolve(false);
                resolve(res && res.ok);
              });
            } catch (e) { resolve(false); }
          });
          debugLog('background save_conversation ack', ok);
        }
      } catch (e) { debugLog('background save_conversation failed', e); }

      // 2) Mirror to localStorage (immediate) — newest first
      try {
        const cur = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(cur)) { cur.unshift(conv); localStorage.setItem(key, JSON.stringify(cur)); }
        else { localStorage.setItem(key, JSON.stringify([conv])); }
        debugLog('saved to localStorage', conv.ts);
      } catch (e) { debugLog('save error (localStorage)', e); }

      // 3) Mirror to chrome.storage.local (extension-wide) — newest first
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          const data = await new Promise(r => chrome.storage.local.get([key], d => r(d[key])));
          const cur = Array.isArray(data) ? data.slice(0) : [];
          cur.unshift(conv);
          await new Promise(r => chrome.storage.local.set({ [key]: cur }, () => r()));
          debugLog('saved to chrome.storage.local', conv.ts);
        }
      } catch (e) { debugLog('save error (chrome.storage.local)', e); }

      // Asynchronously extract topics/tags and index the conversation via background vector store
      (async () => {
        try {
          const full = (conv && conv.conversation) ? conv.conversation.map(m => `${m.role}: ${m.text}`).join('\n\n') : '';
          // Topic extraction: combine Gemini output with local keyword heuristics
          try {
            const prompt = `Extract up to 6 short topic tags (comma separated) that summarize the main topics in the following conversation. Output ONLY a comma-separated list of short tags (no extra text):\n\n${full}`;
            const res = await callGeminiAsync({ action: 'prompt', text: prompt, length: 'short' });
            let geminiTopics = [];
            if (res && res.ok && res.result) {
              geminiTopics = (res.result || '').split(/[,\n]+/).map(t => t.trim()).filter(Boolean).slice(0, 6);
            }

            // Local heuristic topics (multi-word phrases + technical terms)
            let localTopics = [];
            try { localTopics = buildKeywordsFromText(full, 6) || []; } catch (_) { localTopics = []; }

            // Normalize both sets and merge
            function normTopic(t) {
              return String(t || '').toLowerCase()
                .replace(/["'()\.]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            }
            const merged = [];
            const seen = new Set();
            [...geminiTopics, ...localTopics].forEach(raw => {
              const n = normTopic(raw);
              if (!n || seen.has(n)) return; seen.add(n); merged.push(n);
            });

            // Cap to 6 and assign
            if (merged.length) conv.topics = merged.slice(0, 6);
          } catch (e) { debugLog('topic extraction failed', e); }

          // update stored conversation with topics in BOTH storage locations
          try {
            // Update localStorage
            const cur2 = JSON.parse(localStorage.getItem(key) || '[]');
            const idx = cur2.findIndex(c => String(c.ts) === String(conv.ts));
            if (idx >= 0) { cur2[idx] = conv; localStorage.setItem(key, JSON.stringify(cur2)); }

            // Update chrome.storage.local
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
              chrome.storage.local.get([key], (data) => {
                const cur3 = Array.isArray(data[key]) ? data[key] : [];
                const idx2 = cur3.findIndex(c => String(c.ts) === String(conv.ts));
                if (idx2 >= 0) { cur3[idx2] = conv; chrome.storage.local.set({ [key]: cur3 }); }
              });
            }
          } catch (e) { debugLog('save update topics failed', e); }

          // Index conversation with RAG engine for semantic search
          try {
            if (typeof window.RAGEngine !== 'undefined' && typeof window.RAGEngine.indexConversation === 'function') {
              // Don't double-index - this is handled in scanChat now
              debugLog('[RAG] Skipping indexing in saveConversation (handled by scanChat)');
            }
          } catch (e) {
            debugLog('[RAG] Index check failed', e);
          }

          // Also send to background to index (legacy vector_index handler)
          try {
            chrome.runtime.sendMessage({ type: 'vector_index', payload: { id: String(conv.ts), text: full, metadata: { platform: conv.platform || location.hostname, url: conv.url || location.href, ts: conv.ts, topics: conv.topics || [] } } }, (res) => {
              try { if (res && res.ok) debugLog('vector index ok', conv.ts); else debugLog('vector index failed', res); } catch (_) { }
            });
          } catch (e) { debugLog('vector_index send failed', e); }
        } catch (e) { debugLog('post-save async tasks failed', e); }
      })();

      return true;
    } catch (e) { debugLog('save error', e); return false; }
  }

  // expose minimal API on window
  window.ChatBridge = window.ChatBridge || {};
  window.ChatBridge.scanChat = scanChat;
  window.ChatBridge.saveConversation = saveConversation;
  window.ChatBridge.highlightScan = function (enable) { try { CB_HIGHLIGHT_ENABLED = !!enable; if (!CB_HIGHLIGHT_ENABLED) clearHighlights(); else ensureHighlightStyles(); return CB_HIGHLIGHT_ENABLED; } catch (e) { return false; } };
  window.ChatBridge.enableDebug = function () {
    try {
      window.__CHATBRIDGE_DEBUG = true;
      console.log('[ChatBridge] Debug mode enabled. Reload the page for full effect.');
      return true;
    } catch (e) { return false; }
  };
  window.ChatBridge.disableDebug = function () {
    try {
      window.__CHATBRIDGE_DEBUG = false;
      console.log('[ChatBridge] Debug mode disabled. Reload the page for full effect.');
      return true;
    } catch (e) { return false; }
  };
  window.ChatBridge.getLastScan = function () {
    try {
      return window.ChatBridge._lastScan || null;
    } catch (e) { return null; }
  };
  window.ChatBridge.getImageVault = async function () {
    try {
      return await getImageVault();
    } catch (e) {
      debugLog('getImageVault public accessor error:', e);
      return [];
    }
  };

  // End-to-end validation: save → dropdown refresh → restore
  // Usage: ChatBridge.testE2E({ text?: string })
  // Returns a Promise<{ savedOk, topOk, restoreOk, details }>
  window.ChatBridge.testE2E = async function (opts) {
    const details = [];
    try {
      const before = await loadConversationsAsync();
      const preCount = Array.isArray(before) ? before.length : 0;
      details.push(`Pre-count: ${preCount}`);

      const now = Date.now();
      const conv = {
        ts: now,
        id: String(now),
        platform: (function () { try { return new URL(location.href).hostname; } catch (_) { return location.hostname || 'unknown'; } })(),
        url: location.href,
        conversation: [
          { role: 'user', text: (opts && opts.text) || 'E2E sanity check: user message ' + now },
          { role: 'assistant', text: 'E2E sanity check: assistant reply ' + now }
        ]
      };
      const savedOk = await saveConversation(conv);
      details.push(`Saved to background+mirrors: ${savedOk}`);

      // Give the mirror a brief moment just in case
      await new Promise(r => setTimeout(r, 120));

      // Refresh dropdown UI if available
      try { if (typeof window.ChatBridge.refreshHistory === 'function') window.ChatBridge.refreshHistory(); } catch (_) { }
      await new Promise(r => setTimeout(r, 60));

      const after = await loadConversationsAsync();
      const top = Array.isArray(after) && after[0] ? after[0] : null;
      const topOk = !!(top && String(top.ts) === String(conv.ts));
      details.push(`Top item is new conversation: ${topOk}`);

      // Attempt restore into visible composer (if present)
      let restoreOk = false;
      try {
        const testText = `[ChatBridge E2E ${now}]`;
        const res = await restoreToChat(testText);
        restoreOk = !!res;
        details.push(`restoreToChat returned: ${res}`);
      } catch (e) {
        details.push(`restoreToChat error: ${e && e.message}`);
      }

      return { savedOk, topOk, restoreOk, details };
    } catch (e) {
      details.push('testE2E failed: ' + (e && e.message ? e.message : String(e)));
      return { savedOk: false, topOk: false, restoreOk: false, details };
    }
  };

  // Debug helper to check storage
  window.ChatBridge.checkStorage = function () {
    console.log('🔍 Checking storage locations...');

    // Check localStorage
    try {
      const local = JSON.parse(localStorage.getItem('chatbridge:conversations') || '[]');
      console.log('localStorage:', local.length, 'conversations');
      if (local.length > 0) {
        console.table(local.slice(0, 3).map(c => ({
          platform: c.platform || 'unknown',
          messages: c.conversation?.length || 0,
          timestamp: new Date(c.ts).toLocaleString()
        })));
      }
    } catch (e) {
      console.error('localStorage error:', e);
    }

    // Check chrome.storage.local
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['chatbridge:conversations'], (data) => {
        const chromeData = data['chatbridge:conversations'] || [];
        console.log('chrome.storage.local:', chromeData.length, 'conversations');
        if (chromeData.length > 0) {
          console.table(chromeData.slice(0, 3).map(c => ({
            platform: c.platform || 'unknown',
            messages: c.conversation?.length || 0,
            timestamp: new Date(c.ts).toLocaleString()
          })));
        }

        // Check for mismatch
        try {
          const local = JSON.parse(localStorage.getItem('chatbridge:conversations') || '[]');
          if (local.length !== chromeData.length) {
            console.warn('⚠️ Storage mismatch detected!');
            console.log('localStorage has', local.length, 'but chrome.storage.local has', chromeData.length);
          } else {
            console.log('✅ Storage locations in sync');
          }
        } catch (e) { }
      });
    } else {
      console.log('chrome.storage.local: Not available');
    }

    // Check background handler
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'get_conversations' }, (r) => {
        if (chrome.runtime.lastError) {
          console.error('Background handler error:', chrome.runtime.lastError.message);
        } else {
          console.log('Background handler:', r?.conversations?.length || 0, 'conversations');
          if (r?.conversations?.length > 0) {
            console.table(r.conversations.slice(0, 3).map(c => ({
              platform: c.platform || 'unknown',
              messages: c.conversation?.length || 0,
              timestamp: new Date(c.ts).toLocaleString()
            })));
          }
        }
      });
    }
  };

  // Advanced intelligence helpers
  window.ChatBridge.analyzeContext = async function () {
    try {
      const msgs = await scanChat();
      if (!msgs || !msgs.length) {
        console.log('No messages found');
        return null;
      }
      const segments = segmentConversation(msgs, 5, 0.5);
      const context = detectActiveContext(msgs, 8, 40);
      console.log('📊 Conversation Analysis:');
      console.log('Messages:', msgs.length);
      console.log('Segments:', segments.length);
      console.table(segments.map(s => ({ topic: s.topic, messages: s.messageCount, confidence: s.confidence + '%', keywords: s.keywords.slice(0, 3).join(', ') })));
      console.log('Active Context:', context);
      return { messages: msgs, segments, context };
    } catch (e) {
      console.error('Analysis failed:', e);
      return null;
    }
  };

  window.ChatBridge.showSegments = async function () {
    try {
      const msgs = await scanChat();
      if (!msgs || !msgs.length) {
        toast('No messages to segment');
        return;
      }
      const segments = segmentConversation(msgs, 5, 0.5);
      console.log('📊 Conversation Segments:');
      console.table(segments.map((s, i) => ({
        segment: i + 1,
        topic: s.topic,
        messages: `${s.start}-${s.end}`,
        count: s.messageCount,
        confidence: s.confidence + '%',
        keywords: s.keywords.slice(0, 5).join(', ')
      })));
      toast(`Detected ${segments.length} topic segment${segments.length > 1 ? 's' : ''}`);
      return segments;
    } catch (e) {
      console.error('Segmentation failed:', e);
      return null;
    }
  };

  // bootstrap UI and auto-scan
  // CLOUDFLARE FIX: Wait for page to be fully loaded before injecting UI
  function initChatBridge() {
    try {
      const ui = injectUI();

      // Initialize MCP Bridge to enable agent-to-agent communication
      if (typeof window.MCPBridge !== 'undefined') {
        try {
          window.MCPBridge.init();
          _cbMCPInitialized = true;

          // Register ChatBridge-specific resources
          window.MCPBridge.registerResource('/chatbridge/scan', async (params) => {
            try {
              const msgs = await scanChat();
              return {
                ok: true,
                messages: msgs,
                count: msgs.length,
                platform: detectCurrentPlatform(),
                timestamp: Date.now()
              };
            } catch (e) {
              return { ok: false, error: e.message };
            }
          });

          window.MCPBridge.registerResource('/chatbridge/restore', async (params) => {
            try {
              const text = params.text || '';
              const attachments = params.attachments || [];
              const success = await restoreToChat(text, attachments);
              return { ok: success };
            } catch (e) {
              return { ok: false, error: e.message };
            }
          });

          window.MCPBridge.registerResource('/chatbridge/status', async (params) => {
            return {
              ok: true,
              platform: detectCurrentPlatform(),
              url: window.location.href,
              hasRAG: typeof window.RAGEngine !== 'undefined',
              hasONNX: typeof window.EmbeddingEngine !== 'undefined',
              timestamp: Date.now()
            };
          });

          console.log('[ChatBridge] MCP initialized with', window.MCPBridge.getStats().registeredResources.length, 'resources:', window.MCPBridge.getStats().registeredResources);
        } catch (e) {
          console.warn('[ChatBridge] MCP init failed:', e);
        }
      }

      // Keyboard command handlers
      if (ui && ui.avatar && ui.panel) {
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
          if (!msg || !msg.type) return;

          try {
            if (msg.type === 'keyboard_command') {
              const command = msg.command;

              if (command === 'quick-scan') {
                // Ctrl+Shift+S: Open sidebar and trigger scan
                if (ui.panel.style.display === 'none') {
                  ui.avatar.click(); // Open sidebar
                }
                setTimeout(() => {
                  const shadow = ui.panel.getRootNode();
                  const btnScan = shadow.querySelector('#btnScan');
                  if (btnScan) btnScan.click();
                }, 100);
                sendResponse({ ok: true });
              }
              else if (command === 'toggle-sidebar') {
                // Ctrl+Shift+H: Toggle sidebar visibility
                ui.avatar.click();
                sendResponse({ ok: true });
              }
              else if (command === 'insight-finder') {
                // Ctrl+Shift+F: Open Insight Finder modal
                (async () => {
                  try {
                    const msgs = await scanChat();
                    if (!msgs || msgs.length === 0) {
                      toast('No messages found in current chat');
                      sendResponse({ ok: false });
                      return;
                    }
                    const insights = extractInsights(msgs);
                    const total = Object.values(insights).reduce((sum, arr) => sum + arr.length, 0);
                    if (total === 0) {
                      toast('No insights found in this conversation');
                      sendResponse({ ok: false });
                      return;
                    }
                    showInsightFinderModal(insights, msgs);
                    toast(`Found ${total} insights`);
                    sendResponse({ ok: true });
                  } catch (e) {
                    debugLog('Insight Finder keyboard error', e);
                    sendResponse({ ok: false });
                  }
                })();
                return true; // Will respond asynchronously
              }
              else if (command === 'close-view') {
                // Escape: Close internal views or sidebar
                const shadow = ui.panel.getRootNode();
                const openView = shadow.querySelector('.cb-internal-view.cb-view-active');
                if (openView) {
                  // Close internal view
                  const closeBtn = openView.querySelector('.cb-view-close');
                  if (closeBtn) closeBtn.click();
                } else if (ui.panel.style.display !== 'none') {
                  // Close sidebar
                  ui.avatar.click();
                }
                sendResponse({ ok: true });
              }
              else if (command === 'insert-to-chat') {
                // Ctrl+Enter: Insert conversation to chat input
                const shadow = ui.panel.getRootNode();
                const insertBtns = Array.from(shadow.querySelectorAll('[id^="btnInsert"]'));
                const visibleBtn = insertBtns.find(btn => {
                  const view = btn.closest('.cb-internal-view');
                  return view && view.classList.contains('cb-view-active');
                });

                if (visibleBtn) {
                  visibleBtn.click();
                  sendResponse({ ok: true });
                } else {
                  // No insert button visible - show toast
                  try {
                    const t = document.createElement('div');
                    t.setAttribute('data-cb-ignore', 'true');
                    t.textContent = 'No insert action available';
                    t.style.cssText = 'position:fixed;bottom:18px;left:18px;background:rgba(6,20,32,0.9);color:#dff1ff;padding:8px 10px;border-radius:8px;z-index:2147483647;';
                    document.body.appendChild(t);
                    setTimeout(() => t.remove(), 2400);
                  } catch (e) { }
                  sendResponse({ ok: false, error: 'no_insert_button' });
                }
              }
            }
          } catch (e) {
            debugLog('keyboard command error', e);
            sendResponse({ ok: false, error: String(e) });
          }
        });
        // Note: restore_to_chat listener is registered earlier at the top level
        // to ensure it's ready when the tab opens

        // Cross-Context Memory: Auto-detect context and suggest connections after page loads
        setTimeout(async () => {
          try {
            // Wait for conversation to load, then check for connections
            await new Promise(r => setTimeout(r, 3000)); // 3s delay for chat to render
            const graphKey = 'chatbridge:knowledge_graph';
            const graph = JSON.parse(localStorage.getItem(graphKey) || '[]');

            // Only auto-suggest if we have a knowledge graph with at least 3 entries
            if (graph.length >= 3) {
              await detectAndSuggestContext();
            }
          } catch (e) {
            debugLog('Auto context detection error', e);
          }
        }, 1000);
      }

      setTimeout(async () => { const msgs = await scanChat(); if (msgs && msgs.length) { await saveConversation({ platform: location.hostname, url: location.href, ts: Date.now(), conversation: msgs }); debugLog('auto-saved', msgs.length); } }, 450);
    } catch (e) { debugLog('boot error', e); }
  }

  // CLOUDFLARE FIX: Defer initialization until page is fully loaded
  if (document.readyState === 'complete') {
    initChatBridge();
  } else {
    window.addEventListener('load', initChatBridge, { once: true, passive: true });
  }

})();

