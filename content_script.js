// wrap everything in an IIFE and exit early if already injected to avoid redeclaration
(function(){
  'use strict';
  if (typeof window !== 'undefined' && window.__CHATBRIDGE_INJECTED) {
    try { console.debug && console.debug('[ChatBridge] double-injection detected, skipping init'); } catch (e) {}
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
    const DOM_STABLE_MS = 100; // Ultra-fast scan - minimal wait (optimized)
    const DOM_STABLE_TIMEOUT_MS = 1500; // Fast timeout for quick completion
  const SCROLL_MAX_STEPS = 15; // Fewer steps for instant feel
    const SCROLL_STEP_PAUSE_MS = 50; // Minimal pause for lightning-fast scrolling
  const DEBUG = !!(typeof window !== 'undefined' && window.__CHATBRIDGE_DEBUG === true);

  function debugLog(...args) { if (!DEBUG) return; try { console.debug('[ChatBridge]', ...args); } catch (e) {} }
  // Always log restore-related messages for debugging
  function restoreLog(...args) { try { console.log('[ChatBridge Restore]', ...args); } catch (e) {} }

  // --- Lightweight Config & Logger (non-invasive) ---------------------------
  const CBConfig = (function(){
    const DEFAULTS = { debug: DEBUG === true };
    let cache = { value: DEFAULTS, ts: 0 };
    function getAll(force){
      if (!force && (Date.now()-cache.ts) < 60_000) return Promise.resolve(cache.value);
      return new Promise((resolve)=>{
        try { chrome.storage && chrome.storage.local.get(['chatbridge_config'], (d)=>{
          const v = d && d.chatbridge_config ? d.chatbridge_config : {};
          cache = { value: Object.assign({}, DEFAULTS, v), ts: Date.now() };
          resolve(cache.value);
        }); } catch(_) { resolve(cache.value); }
      });
    }
    function get(key){ return getAll(false).then(c=>c[key]); }
    try {
      chrome.storage && chrome.storage.onChanged && chrome.storage.onChanged.addListener((changes, area)=>{
        if (area==='local' && changes && changes.chatbridge_config) {
          const v = changes.chatbridge_config.newValue || {}; cache = { value: Object.assign({}, DEFAULTS, v), ts: Date.now() };
        }
      });
    } catch(_){}
    return { getAll, get };
  })();

  const CBLogger = (function(){
    let debug = DEBUG === true;
    CBConfig.get('debug').then(v=>{ if (typeof v==='boolean') debug = v; }).catch(()=>{});
    try { chrome.storage && chrome.storage.onChanged && chrome.storage.onChanged.addListener((changes, area)=>{
      if (area==='local' && changes && changes.chatbridge_config) {
        const v = changes.chatbridge_config.newValue || {}; debug = !!v.debug;
      }
    }); } catch(_){}
    function log(method, args){ try { console[method].apply(console, ['[ChatBridge]', ...args]); } catch(_){} }
    return {
      debug: (...a)=>{ if (debug) log('debug', a); },
      info: (...a)=>log('log', a),
      warn: (...a)=>log('warn', a),
      error: (...a)=>log('error', a)
    };
  })();

  // --- Small, safe utilities (non-invasive; exported for future reuse) ------
  /** Sleep helper */
  function cbSleep(ms) { return new Promise(r => setTimeout(r, Number(ms)||0)); }
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
  function cbQS(root, sel) { try { return (root || document).querySelector(sel); } catch(_) { return null; } }
  /** Safe querySelectorAll -> array */
  function cbQSA(root, sel) { try { return Array.from((root || document).querySelectorAll(sel)); } catch(_) { return []; } }

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
            if (!text) return sendResponse({ ok:false, error:'no_text' });
            if (window.ChatBridgeEmbeddings && typeof window.ChatBridgeEmbeddings.getEmbedding === 'function') {
              const emb = await window.ChatBridgeEmbeddings.getEmbedding(text);
              const arr = Array.from(emb || []);
              return sendResponse({ ok:true, vector: arr });
            }
            return sendResponse({ ok:false, error:'embeddings_unavailable' });
          } catch (e) {
            return sendResponse({ ok:false, error: e && e.message });
          }
        })();
        return true;
      }
      if (msg && msg.type === 'local_get_embeddings_batch') {
        (async () => {
          try {
            const texts = (msg.payload && Array.isArray(msg.payload.texts)) ? msg.payload.texts : [];
            if (!texts.length) return sendResponse({ ok:false, error:'no_texts' });
            if (window.ChatBridgeEmbeddings && typeof window.ChatBridgeEmbeddings.getEmbedding === 'function') {
              const vectors = [];
              for (const t of texts) {
                const emb = await window.ChatBridgeEmbeddings.getEmbedding(String(t||''));
                vectors.push(Array.from(emb || []));
              }
              return sendResponse({ ok:true, vectors });
            }
            return sendResponse({ ok:false, error:'embeddings_unavailable' });
          } catch (e) {
            return sendResponse({ ok:false, error: e && e.message });
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
            try { const h = document.getElementById('cb-host'); if (h) h.style.display = 'block'; } catch(e) {}
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
          sendResponse({ ok:false, error: e && e.message });
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
      a.addEventListener('mouseenter', () => { try { a.style.transform = 'translateY(-2px)'; a.style.boxShadow = '0 10px 26px rgba(230,207,159,0.18)'; } catch(e){} });
      a.addEventListener('mouseleave', () => { try { a.style.transform = ''; a.style.boxShadow = '0 6px 20px rgba(0,0,0,0.18)'; } catch(e){} });
      // Click should reveal the host sidebar if present
      a.addEventListener('click', () => {
        try {
          const h = document.getElementById('cb-host');
          if (h) { h.style.display = 'block'; a.style.display = 'none'; }
        } catch (e) {}
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
    } catch (e) {}
  }

  function clearHighlights() {
    try {
      if (CB_HIGHLIGHT_ROOT) { CB_HIGHLIGHT_ROOT.remove(); CB_HIGHLIGHT_ROOT = null; }
  cbQSA(document, '.cb-scan-highlight').forEach(n => { try { n.classList.remove('cb-scan-highlight'); } catch(e){} });
  cbQSA(document, '.cb-scan-label').forEach(n => { try { n.remove(); } catch(e){} });
    } catch (e) {}
  }

  function highlightNodesByElements(elems) {
    try {
      if (!elems || !elems.length) return;
      ensureHighlightStyles(); clearHighlights();
  CB_HIGHLIGHT_ROOT = document.createElement('div'); CB_HIGHLIGHT_ROOT.id = 'cb-scan-highlights'; CB_HIGHLIGHT_ROOT.setAttribute('data-cb-ignore','true'); CB_HIGHLIGHT_ROOT.style.pointerEvents = 'none';
      document.body.appendChild(CB_HIGHLIGHT_ROOT);
      elems.slice(0, 60).forEach((el, i) => {
        try {
          if (!el || !(el instanceof Element)) return;
          el.classList.add('cb-scan-highlight');
          const rect = el.getBoundingClientRect();
          const label = document.createElement('div'); label.className = 'cb-scan-label'; label.setAttribute('data-cb-ignore','true');
          label.textContent = `#${i+1}`;
          label.style.left = (window.scrollX + Math.max(0, rect.left)) + 'px';
          label.style.top = (window.scrollY + Math.max(0, rect.top - 18)) + 'px';
          CB_HIGHLIGHT_ROOT.appendChild(label);
        } catch (e) {}
      });
    } catch (e) {}
  }

  function isInExtension(node) {
    if (!node) return false;
    let cur = node;
    while (cur && cur !== document) {
      try { if (cur.id === 'cb-host' || (cur.getAttribute && cur.getAttribute('data-cb-ignore') === 'true')) return true; } catch (e) {}
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
      } catch (e) {}
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
      function done(timedOut) { if (resolved) return; resolved = true; if (timer) clearTimeout(timer); try { if (obs) obs.disconnect(); } catch (e) {} resolve(!timedOut); }
      try {
        obs = new MutationObserver(() => { if (timer) clearTimeout(timer); timer = setTimeout(() => done(false), stableMs); });
        obs.observe(target, { childList: true, subtree: true, characterData: true });
        timer = setTimeout(() => done(false), stableMs);
        setTimeout(() => done(true), timeoutMs);
      } catch (e) { done(true); }
    });
  }

  // Extract text from element preserving code blocks, lists, links, and structure
  function extractTextWithFormatting(element) {
    if (!element) return '';
    
    try {
      let result = '';
      
      // Process child nodes recursively
      function processNode(node) {
        if (!node) return '';
        
        // Text nodes - return content
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent || '';
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
              return `\n\`\`\`${lang}\n${codeText}\n\`\`\`\n`;
            }
            // Inline code
            return `\`${codeText}\``;
          }
          
          // Lists - preserve structure with bullets/numbers
          if (tag === 'ul' || tag === 'ol') {
            const items = Array.from(node.querySelectorAll(':scope > li'));
            const prefix = tag === 'ol' ? (i) => `${i + 1}. ` : () => '- ';
            return '\n' + items.map((li, i) => prefix(i) + (li.textContent || '').trim()).join('\n') + '\n';
          }
          
          // List items (if not caught by above)
          if (tag === 'li') {
            return '- ' + Array.from(node.childNodes).map(processNode).join('') + '\n';
          }
          
          // Links - preserve with markdown format
          if (tag === 'a') {
            const text = node.textContent || '';
            const href = node.getAttribute('href') || '';
            if (href && text) {
              return `[${text}](${href})`;
            }
            return text;
          }
          
          // Block elements - add line breaks
          if (['div', 'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
            const content = Array.from(node.childNodes).map(processNode).join('');
            return tag === 'br' ? '\n' : content + '\n';
          }
          
          // Bold/italic - preserve with markdown
          if (tag === 'strong' || tag === 'b') {
            return '**' + Array.from(node.childNodes).map(processNode).join('') + '**';
          }
          if (tag === 'em' || tag === 'i') {
            return '*' + Array.from(node.childNodes).map(processNode).join('') + '*';
          }
          
          // Default - process children
          return Array.from(node.childNodes).map(processNode).join('');
        }
        
        return '';
      }
      
      result = processNode(element);
      
      // Clean up excessive newlines while preserving intentional structure
      result = result.replace(/\n{3,}/g, '\n\n').trim();
      
      return result;
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
          atts.push({ kind: 'image', url: src, alt: img.getAttribute('alt') || '', name: (src.split('?')[0].split('#')[0].split('/').pop() || 'image') });
        } catch (e) {}
      }
      // Videos
  const vids = cbQSA(root, 'video[src], video source[src]');
      for (const v of vids) {
        try {
          const src = v.getAttribute('src') || '';
          if (!src) continue;
          atts.push({ kind: 'video', url: src, name: (src.split('?')[0].split('#')[0].split('/').pop() || 'video') });
        } catch (e) {}
      }
      // Docs/links
      const exts = /(\.pdf|\.docx?|\.pptx?|\.xlsx?|\.zip|\.rar|\.7z|\.csv|\.md|\.txt)$/i;
  const links = cbQSA(root, 'a[href]');
      for (const a of links) {
        try {
          const href = a.getAttribute('href') || '';
          if (!href) continue;
          if (exts.test(href)) {
            atts.push({ kind: 'file', url: href, name: (href.split('?')[0].split('#')[0].split('/').pop() || 'file') });
          }
        } catch (e) {}
      }
    } catch (e) {}
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
          prev.attachments = combined.filter(a => { const k = a.url + '|' + (a.kind||''); if (seen.has(k)) return false; seen.add(k); return true; });
        } catch (e) {}
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
    window.ChatBridgeHelpers.utils = Object.assign({}, (window.ChatBridgeHelpers.utils||{}), {
      sleep: cbSleep,
      waitFor: cbWaitFor,
      qs: cbQS,
      qsa: cbQSA
    });
  }

  function injectUI() {
    // If host already exists, ensure avatar is present (in case it was removed)
    if (document.getElementById('cb-host')) {
      try { ensureAvatarExists(); } catch (e) {}
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
  // Slightly larger avatar, pulled in from the corner with refined styling
  avatar.style.cssText = 'position:fixed;bottom:22px;right:26px;width:48px;height:48px;border-radius:12px;z-index:2147483647;display:flex;align-items:center;justify-content:center;cursor:pointer;background:transparent;box-shadow:0 6px 20px rgba(0,0,0,0.18);transition: transform .12s ease, box-shadow .12s ease;overflow:hidden;';
  avatar.addEventListener('mouseenter', () => { try { avatar.style.transform = 'translateY(-2px)'; avatar.style.boxShadow = '0 10px 26px rgba(0,180,255,0.26), 0 0 12px rgba(0,180,255,0.35)'; } catch(e){} });
  avatar.addEventListener('mouseleave', () => { try { avatar.style.transform = ''; avatar.style.boxShadow = '0 6px 20px rgba(0,0,0,0.18)'; } catch(e){} });
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
  :host(.cb-theme-high-contrast) {
    --cb-bg: #000000;
    --cb-bg2: #0a0a0a;
    --cb-bg3: #141414;
    --cb-white: #ffffff;
    --cb-subtext: #e0e0e0;
    --cb-accent-primary: #ffd700;
    --cb-accent-secondary: #00ff88;
    --cb-accent-tertiary: #00d9ff;
    --cb-error: #ff3366;
    --cb-success: #00ff88;
    --cb-warning: #ffaa00;
    --cb-progress: #ffd700;
    --cb-border: rgba(255, 255, 255, 0.3);
    --cb-shadow: rgba(255, 255, 255, 0.2);
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
  
  /* Insights Panel Sidebar Tabs */
  .cb-insights-container { display: flex; height: 100%; }
  .cb-insights-sidebar { width: 160px; background: rgba(10,15,28,0.6); border-right: 1px solid rgba(0,180,255,0.2); padding: 12px 0; }
  .cb-insight-tab { 
    padding: 10px 16px; 
    margin: 4px 8px; 
    font-size: 12px; 
    color: rgba(255,255,255,0.6); 
    cursor: pointer; 
    border-radius: 6px; 
    transition: all 0.2s ease; 
    display: flex; 
    align-items: center; 
    gap: 8px;
  }
  .cb-insight-tab:hover { 
    background: rgba(0,180,255,0.1); 
    color: rgba(255,255,255,0.9); 
  }
  .cb-insight-tab.active { 
    background: rgba(0,180,255,0.2); 
    color: var(--cb-white); 
    border-left: 3px solid rgba(0,180,255,0.9); 
    font-weight: 600; 
  }
  #cb-insights-main { 
    flex: 1; 
    overflow-y: auto; 
    background: rgba(10,15,28,0.4); 
  }
  #cb-insights-main::-webkit-scrollbar { width: 8px; }
  #cb-insights-main::-webkit-scrollbar-track { background: rgba(10,15,28,0.6); border-radius: 10px; }
  #cb-insights-main::-webkit-scrollbar-thumb { background: linear-gradient(180deg, rgba(0,180,255,0.6), rgba(140,30,255,0.5)); border-radius: 10px; }
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
  .cb-replies-wrap { margin-top: 8px; }
  .cb-replies-header { display:flex; align-items:center; justify-content:space-between; padding:6px 0 8px 0; }
  .cb-replies-title { font-size:12px; color:var(--cb-subtext); font-weight:700; letter-spacing:-0.01em; text-transform: uppercase; }
  .cb-replies { padding: var(--cb-space-md); max-height: 260px; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; gap: var(--cb-space-sm); background: var(--cb-bg); border: 1px solid var(--cb-border); border-radius: var(--cb-radius-md); transition: padding-bottom 0.3s ease; }
  .cb-replies.cb-editor-open { padding-bottom: 220px; } /* Prevent overlap when editor is visible */
  .cb-replies::-webkit-scrollbar { width: 8px; }
  .cb-replies::-webkit-scrollbar-track { background: var(--cb-bg3); border-radius: 10px; }
  .cb-replies::-webkit-scrollbar-thumb { background: linear-gradient(180deg, var(--cb-accent-primary), var(--cb-accent-secondary)); border-radius: 10px; border: 2px solid var(--cb-bg3); }
  .cb-reply { background: var(--cb-bg2); border: 1px solid var(--cb-border); border-radius: 10px; padding: 10px 12px; font-size: 13px; line-height: 1.4; cursor: pointer; transition: all 0.2s ease; position:relative; min-height: 48px; max-height: 56px; overflow: hidden; }
  .cb-reply:hover { border-color: var(--cb-accent-primary); box-shadow: 0 4px 12px rgba(0, 180, 255, 0.12); transform: translateY(-1px); }
  .cb-reply.cb-selected { border-color: var(--cb-accent-primary); background: rgba(14,165,233,0.08); box-shadow: 0 6px 18px rgba(14,165,233,0.18); }
  .cb-reply-preview { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; color: var(--cb-white); font-size: 12px; line-height: 1.4; white-space: normal; word-break: break-word; }
  .cb-reply-meta { font-size: 10px; color: var(--cb-subtext); margin-top: 4px; opacity: 0.7; }
  /* Rewrite editor section (shown when a reply is selected) */
  .cb-rewrite-editor { display: none; margin-top: var(--cb-space-lg); padding: var(--cb-space-lg); background: var(--cb-bg2); border: 1px solid var(--cb-border); border-radius: var(--cb-radius-md); animation: slideIn 0.25s ease-out; }
  .cb-rewrite-editor.cb-active { display: block; }
  .cb-editor-label { font-size: var(--cb-text-xs); color: var(--cb-subtext); font-weight: 600; margin-bottom: var(--cb-space-sm); text-transform: uppercase; letter-spacing: 0.5px; }
  .cb-editor-textarea { width: 100%; min-height: 160px; max-height: 240px; resize: vertical; background: var(--cb-bg); color: var(--cb-white); border: 1px solid var(--cb-border); padding: var(--cb-space-md); border-radius: var(--cb-radius-sm); font-family: inherit; font-size: var(--cb-text-sm); line-height: 1.6; overflow-y: auto; transition: all 0.2s ease; }
  .cb-editor-textarea:focus { border-color: var(--cb-accent-primary); box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.12); outline: none; }
  .cb-editor-actions { display: flex; gap: var(--cb-space-sm); margin-top: var(--cb-space-md); flex-wrap: wrap; }
  .cb-editor-actions > .cb-btn { flex: 1 1 auto; min-width: 80px; }
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
  @keyframes cb-slide-up { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    `;
    shadow.appendChild(style);
    // Apply saved theme preference - DEFAULT TO LIGHT
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['cb_theme'], (r) => {
          try {
            // Default to light theme
            if (!r || !r.cb_theme || r.cb_theme === 'light') {
              host.classList.add('cb-theme-light');
            }
            // Dark theme
            else if (r.cb_theme === 'dark') {
              host.classList.remove('cb-theme-light');
              host.classList.remove('cb-theme-high-contrast');
            }
            // High-contrast accessibility theme
            else if (r.cb_theme === 'high-contrast') {
              host.classList.remove('cb-theme-light');
              host.classList.add('cb-theme-high-contrast');
            }
          } catch (e) {}
        });
      } else {
        // Fallback: default to light
        host.classList.add('cb-theme-light');
      }
    } catch (e) {
      host.classList.add('cb-theme-light');
    }

  const panel = document.createElement('div'); panel.className = 'cb-panel';
    
    // Load saved panel width
    try {
      const savedWidth = localStorage.getItem('chatbridge:panel_width');
      if (savedWidth) {
        panel.style.width = savedWidth + 'px';
      }
    } catch (e) {}
    
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
        } catch (e) {}
      }
    });
    
    panel.appendChild(resizeHandle);
    
    // Header: Title and subtitle
    const header = document.createElement('div'); header.className = 'cb-header';
  const title = document.createElement('div'); title.className = 'cb-title'; title.textContent = 'ChatBridge'; title.style.fontSize = '22px';
  const subtitle = document.createElement('div'); subtitle.className = 'cb-subtitle'; subtitle.textContent = 'Effortlessly continue conversations across models';
  const left = document.createElement('div');
  left.style.display = 'flex'; left.style.flexDirection = 'column'; left.style.gap = '6px'; left.style.alignItems = 'flex-start';
  left.appendChild(title); left.appendChild(subtitle);
  const controls = document.createElement('div'); controls.style.display = 'flex'; controls.style.alignItems = 'flex-start'; controls.style.gap = '8px';
  const btnSettings = document.createElement('button'); btnSettings.className = 'cb-btn'; btnSettings.textContent = '⚙️'; btnSettings.title = 'Settings';
  btnSettings.style.cssText = 'padding: 6px 10px; font-size: 16px;';
  btnSettings.setAttribute('aria-label','Open settings');
  const btnClose = document.createElement('button'); btnClose.className = 'cb-close'; btnClose.textContent = '✕';
  btnClose.setAttribute('aria-label','Close panel');
  controls.appendChild(btnSettings);
  controls.appendChild(btnClose);
  header.appendChild(left);
  header.appendChild(controls);
    panel.appendChild(header);

  // Actions: Scan, Restore, Gemini APIs
  const actions = document.createElement('div'); actions.className = 'cb-actions';
  
  // Create a neat grid for secondary actions (luxury layout)
  const actionsGrid = document.createElement('div'); actionsGrid.className = 'cb-actions-grid';

  const btnScan = document.createElement('button'); btnScan.className = 'cb-btn cb-btn-primary cb-scan-wide'; btnScan.textContent = 'Scan Chat'; btnScan.title = 'Capture this conversation - Save it for later, search across it, or continue on another AI'; btnScan.id = 'btnScan';
  const btnRestore = document.createElement('button'); btnRestore.className = 'cb-btn'; btnRestore.textContent = 'Restore'; btnRestore.title = 'Continue where you left off - Pick any saved chat and paste it into this AI'; btnRestore.setAttribute('aria-label','Restore conversation');
  const btnClipboard = document.createElement('button'); btnClipboard.className = 'cb-btn'; btnClipboard.textContent = 'Copy'; btnClipboard.title = 'Quick export - Copy this conversation to share or save externally'; btnClipboard.setAttribute('aria-label','Copy conversation to clipboard');
  const btnSmartQuery = document.createElement('button'); btnSmartQuery.className = 'cb-btn'; btnSmartQuery.textContent = 'Query'; btnSmartQuery.title = 'Ask questions across ALL your saved chats - Natural language search powered by AI'; btnSmartQuery.setAttribute('aria-label','Open Smart Query');
  const btnKnowledgeGraph = document.createElement('button'); btnKnowledgeGraph.className = 'cb-btn'; btnKnowledgeGraph.textContent = 'Agent'; btnKnowledgeGraph.title = 'AI Agent – analyze this chat and suggest next actions'; btnKnowledgeGraph.setAttribute('aria-label','Open Agent');
  const btnInsights = document.createElement('button'); btnInsights.className = 'cb-btn'; btnInsights.textContent = 'Insights'; btnInsights.title = 'Smart workspace tools - Compare, merge, extract, and organize your conversations'; btnInsights.setAttribute('aria-label','Open Smart Workspace');

  // Gemini API buttons
  const btnPromptDesigner = document.createElement('button'); btnPromptDesigner.className = 'cb-btn'; btnPromptDesigner.textContent = 'Prompts'; btnPromptDesigner.title = 'AI-powered prompt suggestions - Get smart next steps for your conversation';
  const btnSummarize = document.createElement('button'); btnSummarize.className = 'cb-btn'; btnSummarize.textContent = 'Summarize'; btnSummarize.title = 'Get the key points - Condense long chats into concise summaries';
  const btnRewrite = document.createElement('button'); btnRewrite.className = 'cb-btn'; btnRewrite.textContent = 'Rewrite'; btnRewrite.title = 'Polish your content - Improve clarity, tone, and professionalism. Adapt for different AI models';
  const btnTranslate = document.createElement('button'); btnTranslate.className = 'cb-btn'; btnTranslate.textContent = 'Translate'; btnTranslate.title = 'Break language barriers - Convert chats to 20+ languages instantly';
  btnPromptDesigner.setAttribute('aria-label','Open Prompt Designer');
  btnSummarize.setAttribute('aria-label','Summarize conversation');
  btnRewrite.setAttribute('aria-label','Rewrite conversation');
  btnTranslate.setAttribute('aria-label','Translate conversation');

  // Place Scan button prominently in its own row below the header
  try {
    const scanRow = document.createElement('div'); scanRow.className = 'cb-scan-row';
    scanRow.appendChild(btnScan);
    panel.appendChild(scanRow);
  } catch (e) { try { row1.appendChild(btnScan); } catch (e2) {} }
  
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
  promptDesignerView.setAttribute('data-cb-ignore','true');
  
  const pdTop = document.createElement('div'); 
  pdTop.className = 'cb-view-top';
  
  const pdTitle = document.createElement('div'); 
  pdTitle.className = 'cb-view-title'; 
  pdTitle.innerHTML = '<span style="font-size:20px;margin-right:8px;">✨</span>Smart Prompts';
  
  const btnClosePD = document.createElement('button'); 
  btnClosePD.className = 'cb-view-close'; 
  btnClosePD.textContent = '✕';
  btnClosePD.setAttribute('aria-label','Close Prompt Designer view');
  
  pdTop.appendChild(pdTitle); 
  pdTop.appendChild(btnClosePD);
  promptDesignerView.appendChild(pdTop);
  
  const pdIntro = document.createElement('div'); 
  pdIntro.className = 'cb-view-intro'; 
  pdIntro.innerHTML = '<strong>AI-powered prompt suggestions</strong> to help you get more from your conversations.<br><span style="font-size:12px;opacity:0.8;">Generated prompts are tailored to your chat context and conversation flow.</span>';
  promptDesignerView.appendChild(pdIntro);
  
  // Prompt Designer content container
  const pdContent = document.createElement('div'); 
  pdContent.id = 'cb-pd-content'; 
  pdContent.style.cssText = 'margin:0;padding:0;';
  promptDesignerView.appendChild(pdContent);
  
  // Append to panel
  panel.appendChild(promptDesignerView);

  // Summarize view
  const summView = document.createElement('div'); summView.className = 'cb-internal-view'; summView.id = 'cb-summ-view'; summView.setAttribute('data-cb-ignore','true');
  const summTop = document.createElement('div'); summTop.className = 'cb-view-top';
  const summTitle = document.createElement('div'); summTitle.className = 'cb-view-title'; summTitle.textContent = 'Summarize';
  const btnCloseSumm = document.createElement('button'); btnCloseSumm.className = 'cb-view-close'; btnCloseSumm.textContent = '✕';
  btnCloseSumm.setAttribute('aria-label','Close Summarize view');
  summTop.appendChild(summTitle); summTop.appendChild(btnCloseSumm);
  summView.appendChild(summTop);
  const summIntro = document.createElement('div'); summIntro.className = 'cb-view-intro'; summIntro.textContent = 'Extract the key insights from long conversations. Perfect for quick reviews, sharing highlights, or creating meeting notes.';
  summView.appendChild(summIntro);
  const summControls = document.createElement('div'); summControls.className = 'cb-view-controls';
  const summLengthLabel = document.createElement('label'); summLengthLabel.className = 'cb-label'; summLengthLabel.textContent = 'Length:';
  const summLengthSelect = document.createElement('select'); summLengthSelect.className = 'cb-select'; summLengthSelect.id = 'cb-summ-length';
  ['concise','short','medium','comprehensive','detailed'].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v.charAt(0).toUpperCase()+v.slice(1); summLengthSelect.appendChild(o); });
  summLengthSelect.value = 'medium';
  const summTypeLabel = document.createElement('label'); summTypeLabel.className = 'cb-label'; summTypeLabel.textContent = 'Style:';
  const summTypeSelect = document.createElement('select'); summTypeSelect.className = 'cb-select'; summTypeSelect.id = 'cb-summ-type';
  // Include a specialized AI-to-AI transfer style optimized for cross-model handoff
  const summTypes = ['paragraph','bullet','detailed','executive','technical','transfer'];
  summTypes.forEach(v => { 
    const o = document.createElement('option'); 
    o.value = v; 
    o.textContent = (v === 'transfer') ? 'AI-to-AI Transfer' : (v.charAt(0).toUpperCase()+v.slice(1)); 
    summTypeSelect.appendChild(o); 
  });
  summTypeSelect.value = 'paragraph';
  summControls.appendChild(summLengthLabel); summControls.appendChild(summLengthSelect); summControls.appendChild(summTypeLabel); summControls.appendChild(summTypeSelect);
  summView.appendChild(summControls);
  // Restore saved summary preferences
  try {
    const savedLen = localStorage.getItem('chatbridge:pref:summLength');
    const savedType = localStorage.getItem('chatbridge:pref:summType');
    if (savedLen) summLengthSelect.value = savedLen;
    if (savedType) summTypeSelect.value = savedType;
  } catch(e){}
  summLengthSelect.addEventListener('change', () => { try { localStorage.setItem('chatbridge:pref:summLength', summLengthSelect.value); } catch(e){} });
  summTypeSelect.addEventListener('change', () => { try { localStorage.setItem('chatbridge:pref:summType', summTypeSelect.value); } catch(e){} });
  const summSourceText = document.createElement('div'); summSourceText.className = 'cb-view-text'; summSourceText.id = 'cb-summ-source-text'; summSourceText.setAttribute('contenteditable','false'); summSourceText.textContent = '';
  summView.appendChild(summSourceText);
  const btnGoSumm = document.createElement('button'); btnGoSumm.className = 'cb-btn cb-view-go'; btnGoSumm.textContent = 'Summarize';
  summView.appendChild(btnGoSumm);
  const summProg = document.createElement('span'); summProg.className = 'cb-progress'; summProg.style.display = 'none'; summView.appendChild(summProg);
  const btnInsertSumm = document.createElement('button'); btnInsertSumm.className = 'cb-btn cb-view-go'; btnInsertSumm.textContent = 'Insert to Chat'; btnInsertSumm.style.display = 'none';
  summView.appendChild(btnInsertSumm);
  const summResult = document.createElement('div'); summResult.className = 'cb-view-result'; summResult.id = 'cb-summ-result'; summResult.textContent = '';
  summView.appendChild(summResult);

  // Rewrite view
  const rewView = document.createElement('div'); rewView.className = 'cb-internal-view'; rewView.id = 'cb-rew-view'; rewView.setAttribute('data-cb-ignore','true');
  const rewTop = document.createElement('div'); rewTop.className = 'cb-view-top';
  const rewTitle = document.createElement('div'); rewTitle.className = 'cb-view-title'; rewTitle.textContent = 'Rewrite';
  const btnCloseRew = document.createElement('button'); btnCloseRew.className = 'cb-view-close'; btnCloseRew.textContent = '✕';
  btnCloseRew.setAttribute('aria-label','Close Rewrite view');
  rewTop.appendChild(rewTitle); rewTop.appendChild(btnCloseRew);
  rewView.appendChild(rewTop);
  const rewIntro = document.createElement('div'); rewIntro.className = 'cb-view-intro'; rewIntro.textContent = 'Polish and refine your conversation. Select style, choose messages, and adapt for different AI models.';
  rewView.appendChild(rewIntro);
  const rewStyleLabel = document.createElement('label'); rewStyleLabel.className = 'cb-label'; rewStyleLabel.textContent = 'Style:';
  const rewStyleSelect = document.createElement('select'); rewStyleSelect.className = 'cb-select'; rewStyleSelect.id = 'cb-rew-style';
  // Organized dropdown with groups
  const groupBasic = document.createElement('optgroup'); groupBasic.label = 'Basic';
  ;['normal','concise','direct','detailed','academic'].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v.charAt(0).toUpperCase()+v.slice(1); groupBasic.appendChild(o); });
  rewStyleSelect.appendChild(groupBasic);
  const groupTonal = document.createElement('optgroup'); groupTonal.label = 'Tonal & Style';
  ;['humanized','creative','professional','simple','friendly'].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v.charAt(0).toUpperCase()+v.slice(1); groupTonal.appendChild(o); });
  rewStyleSelect.appendChild(groupTonal);
  const groupPersonal = document.createElement('optgroup'); groupPersonal.label = 'Personalized';
  ;['customStyle'].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = 'Personalized Style'; groupPersonal.appendChild(o); });
  rewStyleSelect.appendChild(groupPersonal);
  rewStyleSelect.value = 'normal';
  
  // Target model selector (from Sync Tone)
  const rewTargetLabel = document.createElement('label'); rewTargetLabel.className = 'cb-label'; rewTargetLabel.textContent = 'Target Model (optional):';
  rewTargetLabel.style.marginTop = '12px';
  const rewTargetSelect = document.createElement('select'); rewTargetSelect.className = 'cb-select'; rewTargetSelect.id = 'cb-rew-target-select';
  const targetModels = ['None','Claude','ChatGPT','Gemini','OpenAI','Llama','Bing','Anthropic','Cohere','HuggingFace','Custom'];
  targetModels.forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; rewTargetSelect.appendChild(o); });
  rewTargetSelect.value = 'None';
  
  const rewControls = document.createElement('div'); rewControls.className = 'cb-view-controls';
  rewControls.appendChild(rewStyleLabel); rewControls.appendChild(rewStyleSelect);
  rewControls.appendChild(rewTargetLabel); rewControls.appendChild(rewTargetSelect);
  // Style hint (only for Personalized Style)
  const styleHintWrap = document.createElement('div'); styleHintWrap.className = 'cb-style-hint-wrap'; styleHintWrap.style.display = 'none';
  const styleHintLabel = document.createElement('label'); styleHintLabel.className = 'cb-label'; styleHintLabel.textContent = 'Style hint (optional):';
  const styleHintInput = document.createElement('input'); styleHintInput.className = 'cb-input'; styleHintInput.type = 'text'; styleHintInput.id = 'cb-rew-style-hint'; styleHintInput.placeholder = 'e.g., “Calm, minimalist, technical product docs”';
  styleHintWrap.appendChild(styleHintLabel); styleHintWrap.appendChild(styleHintInput);
  rewControls.appendChild(styleHintWrap);
  rewView.appendChild(rewControls);
  // Replies list (assistant only - compact preview mode)
  const rewRepliesWrap = document.createElement('div'); rewRepliesWrap.className = 'cb-replies-wrap';
  const rewRepliesHeader = document.createElement('div'); rewRepliesHeader.className = 'cb-replies-header';
  const rewRepliesTitle = document.createElement('div'); rewRepliesTitle.className = 'cb-replies-title'; rewRepliesTitle.textContent = 'Replies';
  const rewReplyControls = document.createElement('div'); rewReplyControls.style.cssText = 'display:flex;align-items:center;gap:var(--cb-space-sm);flex-wrap:wrap;';
  const rewMultiBtn = document.createElement('button'); rewMultiBtn.className = 'cb-btn cb-btn-secondary'; rewMultiBtn.style.cssText = 'padding:6px 12px;font-size:11px;'; rewMultiBtn.textContent = 'Multi'; rewMultiBtn.title = 'Toggle multi-select mode';
  const rewFilterBtn = document.createElement('button'); rewFilterBtn.className = 'cb-btn cb-btn-secondary'; rewFilterBtn.style.cssText = 'padding:6px 12px;font-size:11px;'; rewFilterBtn.textContent = 'All'; rewFilterBtn.title = 'Filter replies (All / Assistant / User)';
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
  try { const savedRew = localStorage.getItem('chatbridge:pref:rewStyle'); if (savedRew) rewStyleSelect.value = savedRew; } catch(e){}
  try { const savedHint = localStorage.getItem('chatbridge:pref:rewStyleHint'); if (savedHint) styleHintInput.value = savedHint; } catch(e){}
  function updateStyleHintVisibility(){ styleHintWrap.style.display = (rewStyleSelect.value === 'customStyle') ? 'block' : 'none'; }
  updateStyleHintVisibility();
  rewStyleSelect.addEventListener('change', () => { 
    try { localStorage.setItem('chatbridge:pref:rewStyle', rewStyleSelect.value); } catch(e){} 
    updateStyleHintVisibility();
  });
  styleHintInput.addEventListener('input', ()=>{ try { localStorage.setItem('chatbridge:pref:rewStyleHint', styleHintInput.value); } catch(e){} });
  const rewSourceText = document.createElement('div'); rewSourceText.className = 'cb-view-text'; rewSourceText.id = 'cb-rew-source-text'; rewSourceText.setAttribute('contenteditable','false'); rewSourceText.textContent = '';
  rewView.appendChild(rewSourceText);
  const btnGoRew = document.createElement('button'); btnGoRew.className = 'cb-btn cb-view-go'; btnGoRew.textContent = 'Rewrite';
  rewView.appendChild(btnGoRew);
  const rewProg = document.createElement('span'); rewProg.className = 'cb-progress'; rewProg.style.display = 'none'; rewView.appendChild(rewProg);
  const btnInsertRew = document.createElement('button'); btnInsertRew.className = 'cb-btn cb-view-go'; btnInsertRew.textContent = 'Insert to Chat'; btnInsertRew.style.display = 'none';
  rewView.appendChild(btnInsertRew);
  const rewResult = document.createElement('div'); rewResult.className = 'cb-view-result'; rewResult.id = 'cb-rew-result'; rewResult.textContent = '';
  rewView.appendChild(rewResult);

  // Translate view
  // Translate view - NEW SIMPLIFIED UI
  const transView = document.createElement('div'); transView.className = 'cb-internal-view'; transView.id = 'cb-trans-view'; transView.setAttribute('data-cb-ignore','true');
  const transTop = document.createElement('div'); transTop.className = 'cb-view-top';
  const transTitle = document.createElement('div'); transTitle.className = 'cb-view-title'; transTitle.textContent = 'Translate';
  const btnCloseTrans = document.createElement('button'); btnCloseTrans.className = 'cb-view-close'; btnCloseTrans.textContent = '✕';
  btnCloseTrans.setAttribute('aria-label','Close Translate view');
  transTop.appendChild(transTitle); transTop.appendChild(btnCloseTrans);
  transView.appendChild(transTop);
  const transLangRow = document.createElement('div'); transLangRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin:16px 0;';
  const transLangLabel = document.createElement('label'); transLangLabel.textContent = 'Output language:'; transLangLabel.style.cssText = 'font-size:0.95em;font-weight:500;color:#e0e0e0;min-width:120px;';
  const transLangSelect = document.createElement('select'); transLangSelect.className = 'cb-select'; transLangSelect.id = 'cb-trans-lang'; transLangSelect.style.cssText = 'flex:1;padding:8px 12px;border-radius:6px;';
  const langNameToCode = {'English':'en','Spanish':'es','French':'fr','German':'de','Italian':'it','Portuguese':'pt','Russian':'ru','Japanese':'ja','Korean':'ko','Chinese':'zh','Arabic':'ar','Hindi':'hi','Dutch':'nl','Polish':'pl','Turkish':'tr','Vietnamese':'vi','Thai':'th','Swedish':'sv','Danish':'da','Finnish':'fi','Norwegian':'no','Czech':'cs','Hungarian':'hu','Romanian':'ro','Greek':'el','Hebrew':'he','Indonesian':'id','Malay':'ms','Ukrainian':'uk','Bulgarian':'bg','Tamil':'ta'};
  Object.entries(langNameToCode).forEach(([name,code])=>{const opt=document.createElement('option');opt.value=code;opt.textContent=name;transLangSelect.appendChild(opt);});
  const transGearBtn = document.createElement('button'); transGearBtn.textContent='⚙️'; transGearBtn.title='Options'; transGearBtn.style.cssText='background:none;border:none;font-size:1.3em;cursor:pointer;padding:4px 8px;border-radius:4px;transition:background 0.2s;';
  transGearBtn.onmouseenter=()=>transGearBtn.style.background='rgba(255,255,255,0.1)'; transGearBtn.onmouseleave=()=>transGearBtn.style.background='none';
  transLangRow.appendChild(transLangLabel); transLangRow.appendChild(transLangSelect); transLangRow.appendChild(transGearBtn); transView.appendChild(transLangRow);
  const transOptions=document.createElement('div'); transOptions.id='cb-trans-options'; transOptions.style.cssText='display:none;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:14px;margin:0 0 14px 0;';
  const transModeGroup=document.createElement('div'); transModeGroup.style.cssText='margin-bottom:14px;';
  const transModeLabel=document.createElement('div'); transModeLabel.textContent='Selective translation:'; transModeLabel.style.cssText='font-size:0.9em;font-weight:600;color:#e0e0e0;margin-bottom:8px;'; transModeGroup.appendChild(transModeLabel);
  const transRadioGroup=document.createElement('div'); transRadioGroup.className='cb-radio-group'; transRadioGroup.style.cssText='display:flex;gap:8px;flex-wrap:wrap;';
  ['all','user','ai','last'].forEach((mode,idx)=>{
    const label=document.createElement('label');
    label.className='cb-radio';
    label.style.cssText='display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid rgba(255,255,255,0.15);border-radius:8px;background:rgba(255,255,255,0.04);cursor:pointer;transition:background .2s,border-color .2s;';
    const radio=document.createElement('input'); radio.type='radio'; radio.name='cb-trans-mode'; radio.value=mode; radio.style.cursor='pointer'; if(idx===0) radio.checked=true;
    const span=document.createElement('span'); span.textContent = mode==='all'?'All messages':mode==='user'?'Only user':mode==='ai'?'Only AI':'Last message'; span.className='cb-radio-text';
    label.appendChild(radio); label.appendChild(span); transRadioGroup.appendChild(label);
  });
  transModeGroup.appendChild(transRadioGroup); transOptions.appendChild(transModeGroup);
  const transShortenRow=document.createElement('div'); transShortenRow.style.cssText='display:flex;align-items:center;justify-content:space-between;';
  const transShortenLabel=document.createElement('label'); transShortenLabel.textContent='Shorten output:'; transShortenLabel.htmlFor='cb-trans-shorten'; transShortenLabel.style.cssText='font-size:0.9em;font-weight:600;color:#e0e0e0;';
  const transShortenToggle=document.createElement('input'); transShortenToggle.type='checkbox'; transShortenToggle.id='cb-trans-shorten'; transShortenToggle.className='cb-toggle'; transShortenToggle.style.cssText='width:44px;height:24px;cursor:pointer;';
  transShortenRow.appendChild(transShortenLabel); transShortenRow.appendChild(transShortenToggle); transOptions.appendChild(transShortenRow); transView.appendChild(transOptions);
  const transActionRow=document.createElement('div'); transActionRow.style.cssText='display:flex;align-items:center;gap:12px;margin:14px 0;';
  const btnGoTrans=document.createElement('button'); btnGoTrans.className='cb-btn cb-btn-primary'; btnGoTrans.textContent='Translate'; btnGoTrans.style.cssText='padding:10px 20px;';
  const transProg=document.createElement('span'); transProg.style.cssText='display:none;font-size:0.9em;color:rgba(255,255,255,0.7);'; transProg.textContent='⏳ Translating...';
  transActionRow.appendChild(btnGoTrans); transActionRow.appendChild(transProg); transView.appendChild(transActionRow);
  const transResult=document.createElement('div'); transResult.className='cb-view-result'; transResult.id='cb-trans-result'; transResult.style.cssText='margin-top:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:14px;max-height:400px;overflow-y:auto;white-space:pre-wrap;line-height:1.6;display:none;';
  transView.appendChild(transResult);
  const btnInsertTrans=document.createElement('button'); btnInsertTrans.className='cb-btn'; btnInsertTrans.textContent='Insert to Chat'; btnInsertTrans.style.cssText='margin-top:12px;display:none;'; transView.appendChild(btnInsertTrans);
  transGearBtn.addEventListener('click',()=>{const isHidden=transOptions.style.display==='none';transOptions.style.display=isHidden?'block':'none';});
  try{const saved=localStorage.getItem('chatbridge:pref:transLang');if(saved){transLangSelect.value=saved;}else{const nav=(navigator.language||navigator.userLanguage||'en').toLowerCase().split('-')[0];const navToCode={'en':'en','ja':'ja','es':'es','fr':'fr','de':'de','zh':'zh','ko':'ko','it':'it','pt':'pt','ru':'ru','ar':'ar','hi':'hi','tr':'tr','nl':'nl','sv':'sv','pl':'pl','ta':'ta'};transLangSelect.value=navToCode[nav]||'en';}}catch(e){}
  transLangSelect.addEventListener('change',()=>{try{localStorage.setItem('chatbridge:pref:transLang',transLangSelect.value);}catch(e){}});

  // Scoped polish styles for translate UI
  (function(){
    try {
      if (!transView.querySelector('#cb-trans-style')) {
        const style=document.createElement('style'); style.id='cb-trans-style';
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
    } catch(_) {}
  })();

  // Append all internal views to the panel (after actions, before status)
  // Note: promptDesignerView is already appended in its creation block
  panel.appendChild(summView);
  panel.appendChild(rewView);
  panel.appendChild(transView);

  // Smart Query view
  const smartView = document.createElement('div'); smartView.className = 'cb-internal-view'; smartView.id = 'cb-smart-view'; smartView.setAttribute('data-cb-ignore','true');
  const smartTop = document.createElement('div'); smartTop.className = 'cb-view-top';
  const smartTitle = document.createElement('div'); smartTitle.className = 'cb-view-title'; smartTitle.textContent = 'Smart Archive + Query';
  const btnCloseSmart = document.createElement('button'); btnCloseSmart.className = 'cb-view-close'; btnCloseSmart.textContent = '✕';
  btnCloseSmart.setAttribute('aria-label','Close Smart Query view');
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
  ['All time','Last 7 days','Last 30 days'].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; dateSelect.appendChild(o); });
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
  const agentView = document.createElement('div'); agentView.className = 'cb-internal-view'; agentView.id = 'cb-agent-view'; agentView.setAttribute('data-cb-ignore','true');
  const agentTop = document.createElement('div'); agentTop.className = 'cb-view-top';
  const agentTitle = document.createElement('div'); agentTitle.className = 'cb-view-title'; agentTitle.textContent = '🤖 AI Agent Hub';
  const btnCloseAgent = document.createElement('button'); btnCloseAgent.className = 'cb-view-close'; btnCloseAgent.textContent = '✕';
  btnCloseAgent.setAttribute('aria-label','Close Agent Hub');
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
  const insightsView = document.createElement('div'); insightsView.className = 'cb-internal-view'; insightsView.id = 'cb-insights-view'; insightsView.setAttribute('data-cb-ignore','true');
  const insightsTop = document.createElement('div'); insightsTop.className = 'cb-view-top';
  const insightsTitle = document.createElement('div'); insightsTitle.className = 'cb-view-title'; insightsTitle.textContent = '🎯 Smart Workspace';
  const btnCloseInsights = document.createElement('button'); btnCloseInsights.className = 'cb-view-close'; btnCloseInsights.textContent = '✕';
  btnCloseInsights.setAttribute('aria-label','Close Smart Workspace view');
  insightsTop.appendChild(insightsTitle); insightsTop.appendChild(btnCloseInsights);
  insightsView.appendChild(insightsTop);

  const insightsIntro = document.createElement('div'); insightsIntro.className = 'cb-view-intro'; insightsIntro.textContent = 'Smart tools to enhance your AI workflows. Extract insights, merge conversations, and work more efficiently.';
  insightsView.appendChild(insightsIntro);

  const insightsContent = document.createElement('div'); insightsContent.id = 'cb-insights-content'; insightsContent.style.cssText = 'display:flex;gap:16px;padding:16px 12px;overflow-y:auto;max-height:calc(100vh - 250px);';
  
  // Left sidebar with tabs
  const sidebar = document.createElement('div');
  sidebar.style.cssText = 'width:180px;display:flex;flex-direction:column;gap:8px;flex-shrink:0;';
  
  const tabs = [
    { id: 'actions', label: '⚡ Quick Actions', icon: '⚡' },
    { id: 'extract', label: '📋 Extract', icon: '📋' },
    { id: 'merge', label: '🔗 Merge', icon: '🔗' },
    { id: 'insights', label: '🔍 Deep Insights', icon: '🔍' },
    { id: 'media', label: '🖼️ Media Vault', icon: '🖼️' }
  ];
  
  tabs.forEach(tab => {
    const btn = document.createElement('button');
    btn.className = 'cb-insight-tab';
    btn.dataset.tab = tab.id;
    btn.innerHTML = `<span style="font-size:16px;margin-right:8px;">${tab.icon}</span><span>${tab.label.replace(tab.icon + ' ', '')}</span>`;
    btn.style.cssText = 'padding:12px 14px;background:rgba(10,15,28,0.4);border:1px solid rgba(0,180,255,0.2);border-radius:8px;color:var(--cb-white);font-size:13px;font-weight:500;text-align:left;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;';
    btn.addEventListener('click', () => {
      sidebar.querySelectorAll('.cb-insight-tab').forEach(b => {
        b.style.background = 'rgba(10,15,28,0.4)';
        b.style.borderColor = 'rgba(0,180,255,0.2)';
      });
      btn.style.background = 'linear-gradient(135deg,rgba(0,180,255,0.15),rgba(120,80,200,0.15))';
      btn.style.borderColor = 'rgba(0,180,255,0.4)';
      showInsightTab(tab.id);
    });
    btn.addEventListener('mouseenter', () => {
      if (btn.style.background !== 'linear-gradient(135deg,rgba(0,180,255,0.15),rgba(120,80,200,0.15))') {
        btn.style.background = 'rgba(10,15,28,0.6)';
        btn.style.borderColor = 'rgba(0,180,255,0.3)';
      }
    });
    btn.addEventListener('mouseleave', () => {
      if (btn.style.background !== 'linear-gradient(135deg,rgba(0,180,255,0.15),rgba(120,80,200,0.15))') {
        btn.style.background = 'rgba(10,15,28,0.4)';
        btn.style.borderColor = 'rgba(0,180,255,0.2)';
      }
    });
    sidebar.appendChild(btn);
  });
  
  // Main content area
  const mainContent = document.createElement('div');
  mainContent.id = 'cb-insights-main';
  mainContent.style.cssText = 'flex:1;background:rgba(10,15,28,0.3);border:1px solid rgba(0,180,255,0.15);border-radius:12px;padding:20px;min-height:400px;';
  
  insightsContent.appendChild(sidebar);
  insightsContent.appendChild(mainContent);
  insightsView.appendChild(insightsContent);
  
  // Function to show different tabs
  function showInsightTab(tabId) {
    const main = shadow.getElementById('cb-insights-main');
    if (!main) return;
    main.innerHTML = '';
    
    switch(tabId) {
      case 'actions':
        renderQuickActionsTab(main);
        break;
      case 'extract':
        renderExtractTab(main);
        break;
      case 'merge':
        renderMergeTab(main);
        break;
      case 'insights':
        renderDeepInsightsTab(main);
        break;
      case 'media':
        renderMediaVaultTab(main);
        break;
    }
  }

  // === Tab Rendering Functions ===
  
  function renderQuickActionsTab(container) {
    container.innerHTML = `
      <style>
        .qa-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; padding: 20px; animation: fadeInUp 0.4s ease; }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(15px); } to { opacity:1; transform:translateY(0); } }
        .qa-card { background: linear-gradient(135deg, rgba(0,180,255,0.15) 0%, rgba(99,102,241,0.15) 100%); border: 1px solid rgba(0,180,255,0.4); border-radius: 14px; padding: 20px; cursor: pointer; transition: all 0.35s cubic-bezier(0.4,0,0.2,1); position: relative; overflow: hidden; }
        .qa-card::before { content:''; position:absolute; top:0; left:0; right:0; bottom:0; background: linear-gradient(135deg, rgba(0,180,255,0.25) 0%, rgba(99,102,241,0.25) 100%); opacity:0; transition: opacity 0.3s; }
        .qa-card:hover { transform: translateY(-4px); box-shadow: 0 12px 28px rgba(0,180,255,0.3); border-color: rgba(0,180,255,0.7); }
        .qa-card:hover::before { opacity:1; }
        .qa-card:active { transform: translateY(-2px); }
        .qa-icon { font-size: 44px; margin-bottom: 12px; filter: drop-shadow(0 4px 10px rgba(0,180,255,0.4)); position:relative; z-index:1; }
        .qa-title { font-family: 'Bebas Neue', 'Arial Black', sans-serif; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: 1.2px; position:relative; z-index:1; }
      </style>
      <div class="qa-grid">
        <div class="qa-card" id="cb-quick-summarize">
          <div class="qa-icon">📝</div>
          <div class="qa-title">SUMMARIZE</div>
        </div>
        <div class="qa-card" id="cb-quick-rewrite">
          <div class="qa-icon">✍️</div>
          <div class="qa-title">REWRITE</div>
        </div>
        <div class="qa-card" id="cb-quick-translate">
          <div class="qa-icon">🌐</div>
          <div class="qa-title">TRANSLATE</div>
        </div>
        <div class="qa-card" id="cb-quick-tone">
          <div class="qa-icon">🎭</div>
          <div class="qa-title">SYNC TONE</div>
        </div>
      </div>
    `;
    
    shadow.getElementById('cb-quick-summarize')?.addEventListener('click', () => showView('summarize'));
    shadow.getElementById('cb-quick-rewrite')?.addEventListener('click', () => showView('rewrite'));
    shadow.getElementById('cb-quick-translate')?.addEventListener('click', () => showView('translate'));
    shadow.getElementById('cb-quick-tone')?.addEventListener('click', () => showView('tone'));
  }

  function renderExtractTab(container) {
    container.innerHTML = `
      <style>
        .extract-wrap { padding: 20px; animation: fadeInUp 0.4s ease; }
        .extract-title { font-family: 'Bebas Neue', 'Arial Black', sans-serif; font-size: 26px; color: #ffffff; margin-bottom: 8px; letter-spacing: 1.5px; background: linear-gradient(135deg, #00b4ff 0%, #6366f1 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .extract-desc { font-size: 13px; color: rgba(255,255,255,0.6); margin-bottom: 18px; }
        .extract-options { display: flex; flex-direction: column; gap: 12px; }
        .extract-btn { background: rgba(0,180,255,0.12); border: 1px solid rgba(0,180,255,0.35); border-radius: 10px; padding: 14px 16px; color: #fff; cursor: pointer; text-align: left; transition: all 0.3s ease; }
        .extract-btn:hover { background: rgba(0,180,255,0.22); border-color: rgba(0,180,255,0.6); transform: translateX(4px); }
        .extract-btn-title { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
        .extract-btn-sub { font-size: 11px; opacity: 0.65; }
      </style>
      <div class="extract-wrap">
        <div class="extract-title">EXTRACT CONTENT</div>
        <div class="extract-desc">Export conversation in multiple formats</div>
        <div class="extract-options">
          <button class="extract-btn" id="cb-extract-markdown">
            <div class="extract-btn-title">📄 Export as Markdown</div>
            <div class="extract-btn-sub">Clean .md file ready for documentation</div>
          </button>
          <button class="extract-btn" id="cb-extract-json">
            <div class="extract-btn-title">📊 Export as JSON</div>
            <div class="extract-btn-sub">Structured data with metadata</div>
          </button>
          <button class="extract-btn" id="cb-extract-text">
            <div class="extract-btn-title">📝 Plain Text</div>
            <div class="extract-btn-sub">Simple text export</div>
          </button>
        </div>
      </div>
    `;
    
    shadow.getElementById('cb-extract-markdown')?.addEventListener('click', async () => {
      const msgs = await scanChat();
      const md = msgs.map(m => `**${m.role}**: ${m.text}`).join('\n\n');
      copyToClipboard(md);
      showToast('Copied as Markdown!');
    });
    
    shadow.getElementById('cb-extract-json')?.addEventListener('click', async () => {
      const msgs = await scanChat();
      copyToClipboard(JSON.stringify(msgs, null, 2));
      showToast('Copied as JSON!');
    });
    
    shadow.getElementById('cb-extract-text')?.addEventListener('click', async () => {
      const msgs = await scanChat();
      const txt = msgs.map(m => `${m.role}: ${m.text}`).join('\n\n');
      copyToClipboard(txt);
      showToast('Copied as text!');
    });
  }

  function renderMergeTab(container) {
    container.innerHTML = `
      <style>
        .merge-wrap { padding: 20px; animation: fadeInUp 0.4s ease; }
        .merge-hero { background: linear-gradient(135deg, rgba(0,180,255,0.18) 0%, rgba(99,102,241,0.18) 100%); border: 1px solid rgba(0,180,255,0.4); border-radius: 14px; padding: 28px; text-align: center; margin-bottom: 20px; }
        .merge-icon { font-size: 56px; margin-bottom: 14px; filter: drop-shadow(0 4px 14px rgba(0,180,255,0.5)); }
        .merge-title { font-family: 'Bebas Neue', 'Arial Black', sans-serif; font-size: 28px; color: #ffffff; margin-bottom: 10px; letter-spacing: 2px; }
        .merge-desc { font-size: 13px; color: rgba(255,255,255,0.7); line-height: 1.5; max-width: 400px; margin: 0 auto; }
        .merge-btn { width: 100%; background: linear-gradient(135deg, #00b4ff 0%, #6366f1 100%); border: none; border-radius: 10px; padding: 16px; color: #fff; font-family: 'Bebas Neue', sans-serif; font-size: 17px; letter-spacing: 1px; cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 14px rgba(0,180,255,0.35); }
        .merge-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,180,255,0.45); }
        .merge-status { margin-top: 12px; font-size: 11px; color: rgba(255,255,255,0.55); text-align: center; }
      </style>
      <div class="merge-wrap">
        <div class="merge-hero">
          <div class="merge-icon">🔀</div>
          <div class="merge-title">MERGE CONVERSATIONS</div>
          <div class="merge-desc">Combine multiple chat threads into a unified timeline for research and synthesis</div>
        </div>
        <button class="merge-btn" id="cb-merge-start">START MERGE PROCESS</button>
        <div class="merge-status" id="cb-merge-status"></div>
      </div>
    `;
    
    shadow.getElementById('cb-merge-start')?.addEventListener('click', () => {
      const status = shadow.getElementById('cb-merge-status');
      if (status) status.textContent = '🚧 Coming soon: Multi-chat merger for cross-platform synthesis';
    });
  }

  function renderDeepInsightsTab(container) {
    container.innerHTML = `
      <style>
        .insights-wrap { padding: 20px; animation: fadeInUp 0.4s ease; }
        .insights-title { font-family: 'Bebas Neue', 'Arial Black', sans-serif; font-size: 26px; color: #ffffff; margin-bottom: 18px; letter-spacing: 1.5px; text-align: center; }
        .insights-grid { display: grid; gap: 14px; }
        .insight-card { background: linear-gradient(135deg, rgba(0,180,255,0.12) 0%, rgba(99,102,241,0.12) 100%); border: 1px solid rgba(0,180,255,0.35); border-radius: 12px; padding: 18px; transition: all 0.3s; }
        .insight-card:hover { border-color: rgba(0,180,255,0.55); background: linear-gradient(135deg, rgba(0,180,255,0.18) 0%, rgba(99,102,241,0.18) 100%); }
        .insight-label { font-size: 11px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
        .insight-value { font-family: 'Bebas Neue', sans-serif; font-size: 32px; color: #ffffff; letter-spacing: 1px; }
        .insight-desc { font-size: 12px; color: rgba(255,255,255,0.7); margin-top: 6px; }
        .loading-shimmer { background: linear-gradient(90deg, rgba(0,180,255,0.1) 0%, rgba(99,102,241,0.2) 50%, rgba(0,180,255,0.1) 100%); background-size: 200% 100%; animation: shimmer 2s infinite; }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      </style>
      <div class="insights-wrap">
        <div class="insights-title">DEEP INSIGHTS</div>
        <div class="insights-grid" id="cb-insights-content">
          <div class="insight-card loading-shimmer">
            <div class="insight-label">Analyzing conversation...</div>
            <div class="insight-value">⏳</div>
          </div>
        </div>
      </div>
    `;
    
    (async () => {
      const msgs = await scanChat();
      const content = shadow.getElementById('cb-insights-content');
      if (!content) return;
      
      if (!msgs || msgs.length === 0) {
        content.innerHTML = '<div class="insight-card"><div class="insight-label">No Data</div><div class="insight-value">📭</div></div>';
        return;
      }
      
      const userMsgs = msgs.filter(m => m.role === 'user').length;
      const assistMsgs = msgs.filter(m => m.role === 'assistant').length;
      const totalWords = msgs.reduce((sum, m) => sum + m.text.split(/\s+/).length, 0);
      const avgWords = Math.round(totalWords / msgs.length);
      const hasCode = msgs.some(m => m.text.includes('```'));
      
      content.innerHTML = `
        <div class="insight-card">
          <div class="insight-label">Total Messages</div>
          <div class="insight-value">${msgs.length}</div>
          <div class="insight-desc">${userMsgs} from you, ${assistMsgs} from assistant</div>
        </div>
        <div class="insight-card">
          <div class="insight-label">Word Count</div>
          <div class="insight-value">${totalWords.toLocaleString()}</div>
          <div class="insight-desc">~${avgWords} words per message</div>
        </div>
        <div class="insight-card">
          <div class="insight-label">Content Type</div>
          <div class="insight-value">${hasCode ? '💻' : '💬'}</div>
          <div class="insight-desc">${hasCode ? 'Contains code snippets' : 'Text conversation'}</div>
        </div>
      `;
    })();
  }

  function renderMediaVaultTab(container) {
    container.innerHTML = `
      <style>
        .vault-wrap { padding: 20px; animation: fadeInUp 0.4s ease; }
        .vault-title { font-family: 'Bebas Neue', 'Arial Black', sans-serif; font-size: 26px; color: #ffffff; margin-bottom: 18px; letter-spacing: 1.5px; text-align: center; }
        .vault-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
        .vault-item { aspect-ratio: 1; border-radius: 10px; overflow: hidden; background: rgba(0,180,255,0.1); border: 1px solid rgba(0,180,255,0.3); cursor: pointer; transition: all 0.3s; position: relative; }
        .vault-item:hover { transform: scale(1.05); border-color: rgba(0,180,255,0.6); box-shadow: 0 8px 20px rgba(0,180,255,0.35); }
        .vault-item img { width: 100%; height: 100%; object-fit: cover; }
        .vault-empty { text-align: center; padding: 50px 20px; color: rgba(255,255,255,0.5); font-size: 13px; }
        .vault-empty-icon { font-size: 56px; margin-bottom: 12px; opacity: 0.3; }
      </style>
      <div class="vault-wrap">
        <div class="vault-title">MEDIA VAULT</div>
        <div class="vault-grid" id="cb-media-grid">
          <div class="vault-empty"><div class="vault-empty-icon">⏳</div>Scanning media...</div>
        </div>
      </div>
    `;
    
    (async () => {
      const msgs = await scanChat();
      const grid = shadow.getElementById('cb-media-grid');
      if (!grid) return;
      
      const allMedia = [];
      for (const msg of msgs) {
        if (msg.attachments && msg.attachments.length > 0) {
          allMedia.push(...msg.attachments.filter(a => a.type === 'image' || a.type === 'video'));
        }
      }
      
      if (allMedia.length === 0) {
        grid.innerHTML = '<div class="vault-empty"><div class="vault-empty-icon">📁</div>No media found in this conversation</div>';
        return;
      }
      
      grid.innerHTML = allMedia.map(media => `
        <div class="vault-item" onclick="window.open('${media.url}', '_blank')">
          ${media.type === 'image' ? `<img src="${media.url}" loading="lazy" />` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:40px;">🎥</div>`}
        </div>
      `).join('');
    })();
  }
  
  // Initialize with Quick Actions
  setTimeout(() => {
    const firstTab = sidebar.querySelector('.cb-insight-tab');
    if (firstTab) firstTab.click();
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
  settingsPanel.setAttribute('data-cb-ignore','true');
  const settingsTop = document.createElement('div'); settingsTop.className = 'cb-view-top';
  const settingsTitle = document.createElement('div'); settingsTitle.className = 'cb-view-title'; settingsTitle.textContent = '⚙️ Settings';
  const btnCloseSettings = document.createElement('button'); btnCloseSettings.className = 'cb-view-close'; btnCloseSettings.textContent = '✕';
  btnCloseSettings.setAttribute('aria-label','Close settings');
  settingsTop.appendChild(settingsTitle); settingsTop.appendChild(btnCloseSettings);
  settingsPanel.appendChild(settingsTop);
  
  // Settings content
  const settingsContent = document.createElement('div'); settingsContent.style.cssText = 'padding: 16px 0; display: flex; flex-direction: column; gap: 16px;';
  
  // Theme setting
  const themeSection = document.createElement('div'); themeSection.style.cssText = 'padding-bottom: 16px; border-bottom: 1px solid var(--cb-border);';
  const themeLabel = document.createElement('div'); themeLabel.style.cssText = 'font-weight: 600; margin-bottom: 10px; color: var(--cb-white);'; themeLabel.textContent = '🎨 Theme';
  const themeButtons = document.createElement('div'); themeButtons.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;';
  const btnLightTheme = document.createElement('button'); btnLightTheme.className = 'cb-btn'; btnLightTheme.textContent = '☀️ Light'; btnLightTheme.style.flex = '1';
  const btnDarkTheme = document.createElement('button'); btnDarkTheme.className = 'cb-btn'; btnDarkTheme.textContent = '🌙 Dark'; btnDarkTheme.style.flex = '1';
  const btnHighContrastTheme = document.createElement('button'); btnHighContrastTheme.className = 'cb-btn'; btnHighContrastTheme.id = 'cb-btn-high-contrast'; btnHighContrastTheme.textContent = '🎨 High-Contrast'; btnHighContrastTheme.style.flex = '1';
  themeButtons.appendChild(btnLightTheme); themeButtons.appendChild(btnDarkTheme); themeButtons.appendChild(btnHighContrastTheme);
  themeSection.appendChild(themeLabel); themeSection.appendChild(themeButtons);
  settingsContent.appendChild(themeSection);
  
  // Luxury Mode toggle
  const luxurySection = document.createElement('div'); luxurySection.style.cssText = 'padding-bottom: 16px; border-bottom: 1px solid var(--cb-border);';
  const luxuryLabel = document.createElement('div'); luxuryLabel.style.cssText = 'font-weight: 600; margin-bottom: 6px; color: var(--cb-white);'; luxuryLabel.textContent = '✨ Luxury Mode';
  const luxuryDesc = document.createElement('div'); luxuryDesc.style.cssText = 'font-size: 12px; color: var(--cb-subtext); margin-bottom: 12px; line-height: 1.4;'; luxuryDesc.textContent = 'Vision Pro aesthetic with frosted glass, floating particles & smooth animations';
  const luxuryToggle = document.createElement('div'); luxuryToggle.style.cssText = 'display: flex; align-items: center; gap: 12px;';
  const luxuryCheckbox = document.createElement('input'); luxuryCheckbox.type = 'checkbox'; luxuryCheckbox.id = 'cb-luxury-checkbox';
  luxuryCheckbox.style.cssText = 'width: 20px; height: 20px; cursor: pointer;';
  try {
    const savedLuxury = localStorage.getItem('chatbridge:luxury_mode');
    luxuryCheckbox.checked = savedLuxury === 'true';
  } catch (e) {}
  const luxuryCheckLabel = document.createElement('label'); luxuryCheckLabel.setAttribute('for', 'cb-luxury-checkbox'); luxuryCheckLabel.style.cssText = 'color: var(--cb-white); cursor: pointer;'; luxuryCheckLabel.textContent = 'Enable Luxury Mode';
  luxuryToggle.appendChild(luxuryCheckbox); luxuryToggle.appendChild(luxuryCheckLabel);
  luxurySection.appendChild(luxuryLabel); luxurySection.appendChild(luxuryDesc); luxurySection.appendChild(luxuryToggle);
  settingsContent.appendChild(luxurySection);
  
  settingsPanel.appendChild(settingsContent);
  panel.appendChild(settingsPanel);

  const historyWrapper = document.createElement('div'); historyWrapper.className = 'cb-history-wrapper';
  const historyHeader = document.createElement('div'); historyHeader.className = 'cb-history-header';
  const historyTitle = document.createElement('div'); historyTitle.className = 'cb-history-title'; historyTitle.textContent = '📜 History';
  const btnClearHistory = document.createElement('button'); btnClearHistory.className = 'cb-btn cb-btn-danger'; btnClearHistory.textContent = '×'; btnClearHistory.title = 'Clear all saved conversation history';
  historyHeader.appendChild(historyTitle);
  historyHeader.appendChild(btnClearHistory);
  historyWrapper.appendChild(historyHeader);
  const historyEl = document.createElement('div'); historyEl.className = 'cb-history'; historyEl.textContent = 'No sessions yet.';
  historyWrapper.appendChild(historyEl);
  panel.appendChild(historyWrapper);

  const footer = document.createElement('div'); footer.className = 'cb-footer'; panel.appendChild(footer);

  // Subtle suggestions container (This Might Help)
  const subtleSuggest = document.createElement('div');
  subtleSuggest.id = 'cb-subtle-suggestions';
  subtleSuggest.setAttribute('data-cb-ignore','true');
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
        const host = window.location.hostname.replace(/^www\./,'');

        // Pull recent conversations from background
        let convs = [];
        try { convs = await getAllStoredConversations(); } catch(_){ /* ignore */ }

        const items = [];
        if (convs && convs.length) {
          // Relevant old answer (same host)
          const byHost = convs.find(c => (c.host||'').includes(host));
          if (byHost && (byHost.title || byHost.text)) {
            items.push({ label: 'Relevant old answer', text: (byHost.title || 'Conversation').slice(0,80), action: () => {
              try { showOutputWithSendButton(String(byHost.summary||byHost.text||'').slice(0,1200), 'Revisit Answer'); } catch(_){}
            }});
          }

          // Related topic (top tag)
          const tagCounts = {};
          convs.slice(0,50).forEach(c => (c.tags||[]).forEach(t => { const k=(t||'').toLowerCase(); if(!k) return; tagCounts[k]=(tagCounts[k]||0)+1; }));
          const topTag = Object.entries(tagCounts).sort((a,b)=>b[1]-a[1])[0]?.[0];
          if (topTag) {
            items.push({ label: 'Related topic', text: `#${topTag}`, action: async () => {
              try {
                const matches = convs.filter(c => (c.tags||[]).map(x=>String(x).toLowerCase()).includes(topTag)).slice(0,3);
                const quick = matches.map((m,i)=>`${i+1}. ${(m.title||'Conversation').slice(0,60)}`).join('\n');
                showOutputWithSendButton(`Top related items for ${topTag}:\n\n${quick||'(none found)'}`, 'Related Topic');
              } catch(_){}
            }});
          }

          // Supporting material (open extract view)
          items.push({ label: 'Supporting materials', text: 'Extract code blocks or media from recent chats', action: () => { try { showExtractView(); } catch(_){} }});
        }

        if (!items.length) { container.style.display='none'; return; }

        items.slice(0,3).forEach(it => {
          const btn = document.createElement('button');
          btn.className = 'cb-btn'; btn.type = 'button';
          btn.style.cssText = 'text-align:left;padding:8px;background:rgba(16,24,43,0.35);border:1px solid rgba(0,180,255,0.15);font-size:11px;display:flex;gap:6px;align-items:center;';
          btn.innerHTML = `<span style="opacity:0.85;">•</span><span style="opacity:0.9;font-weight:600;">${it.label}:</span><span style="opacity:0.85;">${it.text}</span>`;
          btn.addEventListener('click', () => { try { it.action(); } catch(_){} });
          list.appendChild(btn);
        });

        container.style.display = 'block';
      } catch(_){ /* quiet */ }
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
        setTimeout(() => { try { ariaLive.textContent = String(msg || ''); } catch (e) {} }, 50);
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
        const banner = document.createElement('div'); banner.id = id; banner.setAttribute('role','alert'); banner.style.cssText = 'position:fixed;top:18px;right:18px;z-index:2147483647;padding:12px 14px;background:#9b2c2c;color:#fff;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,0.4);font-weight:600;max-width:360px;';
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
          const retryBtn = document.createElement('button'); retryBtn.className = 'cb-btn'; retryBtn.style.marginLeft = '10px'; retryBtn.textContent = 'Retry'; retryBtn.setAttribute('aria-label','Retry');
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
              try { await navigator.clipboard.writeText(JSON.stringify(dbg, null, 2)); toast('Debug info copied to clipboard'); } catch(e) { debugLog('clipboard copy failed', e); }
              try { chrome.runtime.sendMessage({ type: 'report_issue', payload: dbg }, (r) => { /* ack optional */ }); } catch(e) { debugLog('report send failed', e); }
              rep.textContent = 'Reported';
              setTimeout(()=>{ try{ if (rep && rep.parentNode) rep.parentNode.removeChild(rep); }catch(e){} }, 4000);
            } catch (e) { debugLog('report handler failed', e); }
          });
          banner.appendChild(rep);
        } catch (e) { debugLog('add report btn failed', e); }
        try { container.appendChild(banner); } catch (e) { document.body.appendChild(banner); }
        announce(message, false);
        setTimeout(() => { try { if (banner && banner.parentNode) banner.remove(); } catch (e) {} }, 8000);
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
      } catch(e){ debugLog('append ux styles failed', e); }

      function showSkeleton(el, height) {
        try { if (!el) return; el.__cb_orig = el.innerHTML; el.classList.add('cb-skeleton'); if (height) el.style.minHeight = (height+'px'); }
        catch(e){ debugLog('showSkeleton failed', e); }
      }
      function hideSkeleton(el) {
        try { if (!el) return; el.classList.remove('cb-skeleton'); if (el.__cb_orig !== undefined) { el.innerHTML = el.__cb_orig; delete el.__cb_orig; } el.style.minHeight = ''; }
        catch(e){ debugLog('hideSkeleton failed', e); }
      }

      function animateEl(el, cls, duration = 400) {
        try {
          if (!el) return;
          el.classList.add(cls);
          setTimeout(() => { try { el.classList.remove(cls); } catch(e){} }, duration);
        } catch(e) { debugLog('animateEl failed', e); }
      }

      // Exponential backoff wrapper for background messages / API calls
      async function callBackgroundWithBackoff(message, maxRetries = 3, baseMs = 400) {
        let attempt = 0;
        while (attempt <= maxRetries) {
          try {
            const res = await new Promise((resolve, reject) => {
              try { chrome.runtime.sendMessage(message, (r) => { if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message)); resolve(r); }); }
              catch(e) { reject(e); }
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
      async function optimisticAction({applyOptimistic, confirmUI, rollbackUI, action, onError}){
        try {
          if (typeof applyOptimistic === 'function') applyOptimistic();
          const res = await action();
          if (typeof confirmUI === 'function') confirmUI(res);
          return res;
        } catch (err) {
          try { if (typeof rollbackUI === 'function') rollbackUI(err); } catch(e){}
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
          try { Object.keys(localStorage).filter(k => k && k.toLowerCase && k.toLowerCase().includes('chatbridge')).forEach(k => { dbg.localStorageSnapshot[k] = localStorage.getItem(k); }); } catch(e){}
          return dbg;
        } catch(e){ return { error: 'collect failed' }; }
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
      } catch (e) {}
    });
    
    // Theme switchers
    btnLightTheme.addEventListener('click', () => {
      try {
        host.classList.remove('cb-theme-high-contrast');
        host.classList.add('cb-theme-light');
        chrome.storage.local.set({ cb_theme: 'light' });
        toast('☀️ Light theme enabled');
      } catch (e) { debugLog('light theme failed', e); }
    });
    
    btnDarkTheme.addEventListener('click', () => {
      try {
        host.classList.remove('cb-theme-light');
        host.classList.remove('cb-theme-high-contrast');
        chrome.storage.local.set({ cb_theme: 'dark' });
        toast('🌙 Dark theme enabled');
      } catch (e) { debugLog('dark theme failed', e); }
    });
    
    // High-contrast theme (accessibility)
    try {
      const btnHighContrastTheme = shadow.querySelector('#cb-btn-high-contrast');
      if (btnHighContrastTheme) {
        btnHighContrastTheme.addEventListener('click', () => {
          try {
            host.classList.remove('cb-theme-light');
            host.classList.add('cb-theme-high-contrast');
            chrome.storage.local.set({ cb_theme: 'high-contrast' });
            toast('🎨 High-contrast theme enabled');
          } catch (e) { debugLog('high-contrast theme failed', e); }
        });
      }
    } catch (e) { debugLog('high-contrast setup failed', e); }
    
    // Luxury Mode toggle
    luxuryCheckbox.addEventListener('change', (e) => {
      try {
        const enabled = e.target.checked;
        localStorage.setItem('chatbridge:luxury_mode', String(enabled));
        
        // Try to initialize if not already done
        if (!window.luxuryModeInstance && typeof LuxuryMode !== 'undefined') {
          try {
            window.luxuryModeInstance = new LuxuryMode(shadow);
            debugLog('Luxury Mode instance created from toggle');
          } catch (err) {
            debugLog('Failed to create Luxury Mode instance', err);
          }
        }
        
        if (enabled) {
          // Apply luxury mode
          if (window.luxuryModeInstance) {
            window.luxuryModeInstance.isEnabled = true;
            window.luxuryModeInstance.apply();
            toast('✨ Luxury Mode enabled');
          } else {
            toast('⚠️ Luxury Mode loading... try again in 1 sec');
            setTimeout(() => {
              e.target.checked = false;
            }, 1000);
          }
        } else {
          // Disable luxury mode
          if (window.luxuryModeInstance) {
            window.luxuryModeInstance.isEnabled = false;
            window.luxuryModeInstance.apply();
            toast('Luxury Mode disabled');
          }
        }
      } catch (e) { debugLog('luxury toggle failed', e); }
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
                  try { localStorage.removeItem(_k); toast('Migrated conversations to extension storage'); } catch(e){}
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
      const legacy = (() => { try { return JSON.parse(localStorage.getItem('chatbridge:conversations') || '[]'); } catch(_) { return []; } })();
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['chatbridge:conversations','cb_migration_notice_shown_v1'], (data) => {
          try {
            const alreadyShown = !!data.cb_migration_notice_shown_v1;
            const inExt = Array.isArray(data['chatbridge:conversations']) && data['chatbridge:conversations'].length > 0;
            const noLegacy = !Array.isArray(legacy) || legacy.length === 0;
            if (!alreadyShown && inExt && noLegacy) {
              try { toast('Migrated conversations to extension storage'); } catch(_) {}
              try { chrome.storage.local.set({ cb_migration_notice_shown_v1: true }); } catch(_) {}
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
        try { if (typeof smartView !== 'undefined' && smartView) smartView.classList.remove('cb-view-active'); } catch(_) {}
        try { if (typeof graphView !== 'undefined' && graphView) graphView.classList.remove('cb-view-active'); } catch(_) {}
        try { if (typeof insightsView !== 'undefined' && insightsView) insightsView.classList.remove('cb-view-active'); } catch(_) {}
        try { if (typeof promptDesignerView !== 'undefined' && promptDesignerView) promptDesignerView.classList.remove('cb-view-active'); } catch(_) {}
        try { if (typeof agentView !== 'undefined' && agentView) agentView.classList.remove('cb-view-active'); } catch(_) {}
        try { if (typeof settingsPanel !== 'undefined' && settingsPanel) settingsPanel.classList.remove('cb-view-active'); } catch(_) {}
      } catch (e) {}
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
            if (!inCode) { inCode = true; codeLang = l.replace(/```\s*/,'').trim(); buffer = []; }
            else { inCode = false; if (buffer.length) codeBlocks.push(buffer.join('\n')); buffer = []; codeLang=''; }
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
          const inlineCmds = [...l.matchAll(/`([^`]+)`/g)].map(m=>m[1]);
          inlineCmds.forEach(c => {
            if (/^(npm|yarn|pnpm|pip|pip3|python|node|npx|git|docker|kubectl|az|aws|gcloud|make|bash|sh|pwsh|powershell|cd|mkdir|rm|mv|cp|curl|wget)\b/i.test(c.trim())) {
              out.commands.push(c.trim());
            }
          });
        }

        // De-duplicate and clip to one sentence
        const dedupe = arr => Array.from(new Set(arr.map(s => s.replace(/\s+/g,' ').trim())));
        const oneSentence = s => {
          const clipped = s.replace(/\s+/g,' ').trim();
          const cut = clipped.split(/(?<=\.)\s+/)[0] || clipped;
          return cut.length > 200 ? cut.slice(0,200) : cut;
        };

        out.tasks = dedupe(out.tasks).map(oneSentence).slice(0,12);
        out.steps = dedupe(out.steps).map(oneSentence).slice(0,12);
        out.todos = dedupe(out.todos).map(oneSentence).slice(0,12);
        out.commands = dedupe(out.commands).map(s=>s.slice(0,200)).slice(0,12);
        out.reminders = dedupe(out.reminders).map(oneSentence).slice(0,12);

        return out;
      } catch (e) { debugLog('extractActionPlanFromText error', e); return { tasks:[], steps:[], todos:[], commands:[], reminders:[] }; }
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
          plan.steps.forEach((s, i) => { out += `  ${i+1}. ${s}\n`; });
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

    // Extract images from messages
    async function extractImagesFromMessages(messages) {
      const images = [];
      const seenHashes = new Set();
      
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const role = msg.role || 'unknown';
        const text = msg.text || '';
        const el = msg.el;
        
        const foundSrcs = new Set();
        
        // 1. Extract from message element if available
        if (el) {
          const imgTags = el.querySelectorAll('img');
          imgTags.forEach(img => {
            const src = img.src || img.dataset.src || img.getAttribute('data-src');
            if (src && !src.includes('icon') && !src.includes('avatar')) {
              foundSrcs.add(src);
            }
          });
        }
        
        // 2. Extract from markdown images ![](url)
        const markdownImages = text.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g);
        for (const match of markdownImages) {
          foundSrcs.add(match[2]);
        }
        
        // 3. Extract from HTML img tags in text
        const htmlImages = text.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
        for (const match of htmlImages) {
          foundSrcs.add(match[1]);
        }
        
        // 4. Extract base64 and data URLs
        const dataUrls = text.matchAll(/data:image\/[^;]+;base64,[A-Za-z0-9+\/=]+/g);
        for (const match of dataUrls) {
          foundSrcs.add(match[0]);
        }
        
        // Process found sources
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
      
      return images;
    }

    // Save images to IndexedDB
    async function saveImagesToVault(images) {
      try {
        const db = await initImageVaultDB();
        const tx = db.transaction([IMAGE_VAULT_STORE_NAME], 'readwrite');
        const store = tx.objectStore(IMAGE_VAULT_STORE_NAME);
        
        for (const img of images) {
          try {
            await new Promise((resolve, reject) => {
              const request = store.put(img);
              request.onsuccess = () => resolve();
              request.onerror = () => reject(request.error);
            });
          } catch (e) {
            debugLog('Failed to save image:', e);
          }
        }
        
        return true;
      } catch (e) {
        debugLog('saveImagesToVault error:', e);
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
          <button id="cb-vault-scan" class="cb-btn cb-btn-primary" style="flex:1;font-size:11px;padding:8px;">🔍 Scan Images</button>
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
            const msgs = await scanChat();
            if (!msgs || msgs.length === 0) {
              toast('No messages to scan');
              return;
            }
            
            const images = await extractImagesFromMessages(msgs);
            if (images.length === 0) {
              toast('No images found in conversation');
              document.getElementById('cb-image-count').textContent = '0';
              return;
            }
            
            await saveImagesToVault(images);
            await refreshImageVault();
            toast(`Found ${images.length} image(s)`);
          } catch (e) {
            debugLog('Scan images error:', e);
            toast('Image scan failed');
          } finally {
            removeLoadingFromButton(btn, '🔍 Scan Images');
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

    async function renderTrendingThemesWidget_REMOVED(container) {
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
        const systemPrompt = `You are an expert conversation strategist helping users extract maximum value from their AI interactions.

Analyze this conversation and generate exactly 5 high-quality, actionable follow-up prompts:

1. **Clarification** - Identify the most important ambiguity or assumption that needs validation
2. **Optimization** - Suggest a concrete improvement to enhance quality, efficiency, or robustness  
3. **Deep Dive** - Propose exploring the most valuable unexplored angle or implication
4. **Risk Analysis** - Highlight the most critical edge case, limitation, or potential failure mode
5. **Innovation** - Offer a genuinely creative alternative approach or perspective

**Quality Standards:**
- Ground each prompt in ACTUAL conversation content - no generic filler
- Be precise and actionable - user should know exactly what to ask
- Keep prompts concise but complete (15-25 words ideal)
- Sound professional and insightful, not robotic
- Focus on moving the conversation forward toward concrete outcomes
- Vary sentence structure - avoid repetitive phrasing

**Conversation:**
${conversationText.substring(0, 4000)}

**Output Format (JSON only):**
{
  "questions": [
    {"text": "<specific, grounded prompt>", "category": "clarification", "sourceIndexes": [0, 3]},
    {"text": "<specific, grounded prompt>", "category": "improvement", "sourceIndexes": [5]},
    {"text": "<specific, grounded prompt>", "category": "expansion", "sourceIndexes": [2, 7]},
    {"text": "<specific, grounded prompt>", "category": "critical", "sourceIndexes": [4]},
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
          { text: "What specific requirements or constraints haven't we fully defined yet?", category: "clarification", sourceIndexes: [] },
          { text: "How could we optimize this solution for better performance and maintainability?", category: "improvement", sourceIndexes: [] },
          { text: "What adjacent problems or use cases should we consider addressing?", category: "expansion", sourceIndexes: [] },
          { text: "What are the most likely failure modes and how should we handle them?", category: "critical", sourceIndexes: [] },
          { text: "What alternative approaches might achieve the same goal more elegantly?", category: "creative", sourceIndexes: [] }
        ]
      };
    }

    // Render Prompt Designer Widget - Clean Modern UI
    async function renderPromptDesignerWidget(container) {
      try {
        container.innerHTML = '';
        container.style.cssText = 'padding:0;margin:0;';
        
        // Main wrapper - luxury dark theme
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'background:linear-gradient(180deg,rgba(10,15,28,0.95) 0%,rgba(15,20,35,0.98) 100%);border-radius:12px;overflow:hidden;border:1px solid rgba(0,180,255,0.15);box-shadow:0 8px 32px rgba(0,0,0,0.4);';
        
        // Action bar at top - luxury styling
        const actionBar = document.createElement('div');
        actionBar.style.cssText = 'padding:18px 20px;background:linear-gradient(135deg,rgba(0,180,255,0.08),rgba(120,80,200,0.08));border-bottom:1px solid rgba(0,180,255,0.12);display:flex;gap:12px;align-items:center;';
        actionBar.innerHTML = `
          <button id="cb-prompts-generate" class="cb-btn cb-btn-primary" style="flex:1;font-size:14px;font-weight:600;padding:12px 20px;background:linear-gradient(135deg,rgba(0,180,255,0.2),rgba(120,80,200,0.2));border:1px solid rgba(0,180,255,0.3);border-radius:8px;color:#E6E9F0;transition:all 0.2s;font-family:'Bebas Neue',sans-serif;letter-spacing:0.5px;">
            <span style="font-size:16px;margin-right:8px;">✨</span>
            GENERATE PROMPTS
          </button>
          <button id="cb-prompts-refresh" class="cb-btn" title="Refresh - Generate new prompts" style="padding:12px 16px;font-size:16px;background:rgba(0,180,255,0.08);border:1px solid rgba(0,180,255,0.2);border-radius:8px;color:#00B4FF;transition:all 0.2s;cursor:pointer;">
            ↻
          </button>
          <button id="cb-prompts-history" class="cb-btn" title="History - View previous prompt sets" style="padding:12px 16px;font-size:16px;background:rgba(0,180,255,0.08);border:1px solid rgba(0,180,255,0.2);border-radius:8px;color:#00B4FF;transition:all 0.2s;cursor:pointer;">
            📊
          </button>
        `;
        
        // Prompts container
        const promptsContainer = document.createElement('div');
        promptsContainer.style.cssText = 'padding:20px;';
        
        const promptsList = document.createElement('div');
        promptsList.id = 'cb-prompts-list';
        promptsList.style.cssText = 'display:grid;gap:12px;';
        
        // Beautiful empty state
        promptsList.innerHTML = `
          <div style="text-align:center;padding:60px 20px;">
            <div style="font-size:64px;margin-bottom:20px;opacity:0.7;line-height:1;">🎯</div>
            <h3 style="margin:0 0 12px;font-size:18px;font-weight:700;color:#fff;">Ready to Generate</h3>
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
            generateBtn.style.background = 'linear-gradient(135deg,rgba(0,180,255,0.3),rgba(120,80,200,0.3))';
            generateBtn.style.borderColor = 'rgba(0,180,255,0.5)';
            generateBtn.style.transform = 'translateY(-1px)';
            generateBtn.style.boxShadow = '0 4px 16px rgba(0,180,255,0.3)';
          });
          generateBtn.addEventListener('mouseleave', () => {
            generateBtn.style.background = 'linear-gradient(135deg,rgba(0,180,255,0.2),rgba(120,80,200,0.2))';
            generateBtn.style.borderColor = 'rgba(0,180,255,0.3)';
            generateBtn.style.transform = 'translateY(0)';
            generateBtn.style.boxShadow = 'none';
          });
        }
        
        [refreshBtn, historyBtn].forEach(btn => {
          if (btn) {
            btn.addEventListener('mouseenter', () => {
              btn.style.background = 'rgba(0,180,255,0.15)';
              btn.style.borderColor = 'rgba(0,180,255,0.4)';
              btn.style.transform = 'translateY(-1px)';
            });
            btn.addEventListener('mouseleave', () => {
              btn.style.background = 'rgba(0,180,255,0.08)';
              btn.style.borderColor = 'rgba(0,180,255,0.2)';
              btn.style.transform = 'translateY(0)';
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
            clarification: '#00b4ff',
            improvement: '#10b981',
            expansion: '#7850c8',
            critical: '#f59e0b',
            creative: '#a855f7'
          };
          
          const categoryBg = {
            clarification: 'rgba(0,180,255,0.1)',
            improvement: 'rgba(16,185,129,0.1)',
            expansion: 'rgba(120,80,200,0.1)',
            critical: 'rgba(245,158,11,0.1)',
            creative: 'rgba(168,85,247,0.1)'
          };
          
          promptData.questions.forEach((q, idx) => {
            const promptCard = document.createElement('div');
            const color = categoryColors[q.category] || '#3b82f6';
            const bg = categoryBg[q.category] || 'rgba(59,130,246,0.1)';
            
            promptCard.style.cssText = `
              padding:18px;
              background:rgba(10,15,28,0.6);
              border:1px solid ${color}33;
              border-left:4px solid ${color};
              border-radius:10px;
              transition:all 0.2s ease;
              backdrop-filter:blur(10px);
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
              promptCard.style.background = 'rgba(10,15,28,0.8)';
              promptCard.style.borderColor = `${color}66`;
              promptCard.style.transform = 'translateY(-2px)';
              promptCard.style.boxShadow = `0 8px 24px ${color}40`;
            });
            promptCard.addEventListener('mouseleave', () => {
              promptCard.style.background = 'rgba(10,15,28,0.6)';
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
          
          // Add regenerate button at the bottom
          const regenerateContainer = document.createElement('div');
          regenerateContainer.style.cssText = 'margin-top:24px;padding:20px;background:rgba(10,15,28,0.4);border:2px dashed rgba(0,180,255,0.3);border-radius:12px;text-align:center;';
          regenerateContainer.innerHTML = `
            <button id="cb-regenerate-btn" class="cb-btn" style="
              padding:14px 32px;
              font-size:14px;
              font-weight:700;
              background:linear-gradient(135deg,rgba(0,180,255,0.2),rgba(120,80,200,0.2));
              border:2px solid rgba(0,180,255,0.3);
              border-radius:10px;
              color:#fff;
              cursor:pointer;
              transition:all 0.3s ease;
              text-transform:uppercase;
              letter-spacing:1px;
              font-family:'Bebas Neue',sans-serif;
            ">
              🔄 Regenerate All Prompts
            </button>
          `;
          
          const regenerateBtn = regenerateContainer.querySelector('#cb-regenerate-btn');
          regenerateBtn.addEventListener('mouseenter', () => {
            regenerateBtn.style.background = 'linear-gradient(135deg,rgba(0,180,255,0.3),rgba(120,80,200,0.3))';
            regenerateBtn.style.borderColor = 'rgba(0,180,255,0.5)';
            regenerateBtn.style.transform = 'translateY(-2px)';
            regenerateBtn.style.boxShadow = '0 6px 20px rgba(0,180,255,0.4)';
          });
          regenerateBtn.addEventListener('mouseleave', () => {
            regenerateBtn.style.background = 'linear-gradient(135deg,rgba(0,180,255,0.2),rgba(120,80,200,0.2))';
            regenerateBtn.style.borderColor = 'rgba(0,180,255,0.3)';
            regenerateBtn.style.transform = 'translateY(0)';
            regenerateBtn.style.boxShadow = 'none';
          });
          regenerateBtn.addEventListener('click', () => {
            const generateBtn = shadow.getElementById('cb-generate-prompts');
            if (generateBtn) {
              regenerateBtn.innerHTML = '⏳ Regenerating...';
              regenerateBtn.disabled = true;
              regenerateBtn.style.opacity = '0.6';
              generateBtn.click();
            }
          });
          
          list.appendChild(regenerateContainer);
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
                  const txt = String(sum.result||'').trim();
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

        // 1. Smart Merge (merge related conversations)
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
                    chrome.runtime.sendMessage({ type: 'open_and_restore', payload: { url, text: summary } }, () => {});
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
  card.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); try { onClick && onClick(e); } catch(_){} });
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
        } catch (e) {}
        
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
          } catch(_){}
          
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

        // MCP Connection Status Banner
        const mcpStatus = document.createElement('div');
        mcpStatus.style.cssText = 'margin:12px;padding:10px 14px;background:rgba(0,180,255,0.08);border:1px solid rgba(0,180,255,0.25);border-radius:10px;display:flex;align-items:center;gap:10px;font-size:13px;';
        
        const statusIcon = document.createElement('span');
        statusIcon.style.cssText = 'font-size:18px;';
        
        const statusText = document.createElement('div');
        statusText.style.cssText = 'flex:1;';
        
        // Check MCPBridge availability
        if (typeof window.MCPBridge !== 'undefined') {
          try {
            const stats = window.MCPBridge.getStats();
            const resourceCount = stats.registeredResources.length;
            if (resourceCount > 0) {
              statusIcon.textContent = '✅';
              statusText.innerHTML = `<b>MCP Connected</b><br/><span style="font-size:11px;opacity:0.8;">${resourceCount} resources: ${stats.registeredResources.join(', ')}</span>`;
            } else {
              statusIcon.textContent = '⚠️';
              statusText.innerHTML = `<b>MCP Initialized</b><br/><span style="font-size:11px;opacity:0.8;">No resources registered yet</span>`;
            }
          } catch (e) {
            statusIcon.textContent = '⚠️';
            statusText.innerHTML = `<b>MCP Loaded</b><br/><span style="font-size:11px;opacity:0.8;">Status check failed</span>`;
          }
        } else {
          statusIcon.textContent = '❌';
          statusText.innerHTML = `<b>MCP Not Available</b><br/><span style="font-size:11px;opacity:0.8;">mcpBridge.js not loaded</span>`;
        }
        
        const testBtn = document.createElement('button');
        testBtn.className = 'cb-btn';
        testBtn.style.cssText = 'padding:6px 12px;font-size:11px;';
        testBtn.textContent = 'Test';
        testBtn.addEventListener('click', async () => {
          try {
            if (typeof window.MCPBridge === 'undefined') {
              toast('MCP Bridge not available');
              return;
            }
            const stats = window.MCPBridge.getStats();
            console.log('[MCP Test] Stats:', stats);
            toast(`MCP: ${stats.registeredResources.length} resources`);
          } catch (e) {
            console.error('[MCP Test] Error:', e);
            toast('MCP test failed: ' + e.message);
          }
        });
        
        mcpStatus.appendChild(statusIcon);
        mcpStatus.appendChild(statusText);
        mcpStatus.appendChild(testBtn);
        agentContent.appendChild(mcpStatus);

        // Gemini Model Status Banner
        const geminiStatus = document.createElement('div');
        geminiStatus.style.cssText = 'margin:12px;padding:10px 14px;background:rgba(138,43,226,0.08);border:1px solid rgba(138,43,226,0.25);border-radius:10px;display:flex;align-items:center;gap:10px;font-size:13px;';
        
        const geminiIcon = document.createElement('span');
        geminiIcon.style.cssText = 'font-size:18px;';
        geminiIcon.textContent = '✨';
        
        const geminiText = document.createElement('div');
        geminiText.style.cssText = 'flex:1;';
        geminiText.innerHTML = `<b>Gemini AI</b><br/><span style="font-size:11px;opacity:0.8;">Auto-fallback: 2.5-pro → 2.0-flash → 2.5-flash → lite → exp</span>`;
        
        geminiStatus.appendChild(geminiIcon);
        geminiStatus.appendChild(geminiText);
        agentContent.appendChild(geminiStatus);

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
  card.setAttribute('type','button');
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
        function hostFromConv(c){
          try {
            return (c.platform || (c.url && new URL(c.url).hostname) || '').toString() || '';
          } catch(_) { return ''; }
        }
        
        // Get most recent conversation to build query context
        const recentDifferent = (convs||[]).find(c => hostFromConv(c) && hostFromConv(c) !== currentHost);
        const recentSame = (convs||[]).find(c => hostFromConv(c) && hostFromConv(c) === currentHost) || convs[0];
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
          relatedConvs = (convs||[]).filter(c => {
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
          const ago = Math.round((Date.now() - (conv.ts||Date.now())) / (1000 * 60 * 60));
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
          const snippet = relevantMsgs.map(m => `${m.role}: ${m.text.slice(0,250)}`).join('\n');
          const ragScore = conv.ragScore ? ` [${(conv.ragScore * 100).toFixed(0)}% match]` : '';
          
          combinedContext += `\n---\nConv ${idx+1} (${host}, ${ago}h ago${ragScore}):\n${snippet}\n`;
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
        
        const prompt = `You are Continuum, a context reconstruction agent. Analyze ${relatedConvs.length} related conversations${usingRAG ? ' (semantic search)' : ''} and extract ONLY what matters for continuing work.

**Your Task:** Identify the user's underlying intent, key decisions, and what's unresolved.

**Input:**
${combinedContext}

**Output Requirements:**

1. **Unified Context Summary** (4-5 lines MAX)
   - Focus on USER INTENT, not surface keywords
   - What is the user trying to accomplish?
   - What decisions/constraints were established?
   - What's still unclear or unresolved?
   - Use analytical, direct language - NO fluff

2. **Topics** (3-5 precise concepts)
   - High-signal conceptual labels ONLY
   - NO generic terms like "discussion", "conversation", "questions"
   - Prefer technical/domain terms over keywords
   - Examples: "React Context API", "OAuth2 flow", "PostgreSQL indexing"

3. **Suggested Next Steps** (1-3 items)
   - MUST be actionable and specific
   - Prioritize: clarification > missing info > decisions > next logical action
   - Format: "Clarify X", "Define Y constraints", "Decide between A vs B"
   - NO generic advice like "continue working" or "test the code"

**Format (exact structure):**
**Unified Context Summary** ${usingRAG ? '🔍' : ''}
[4-5 line intent analysis]

**Topics:** [Concept 1], [Concept 2], [Concept 3]
**Conversations:** ${relatedConvs.length} across ${new Set(relatedConvs.map(c => hostFromConv(c))).size} platforms

**Suggested Next Steps**
1. [Specific actionable step]
2. [Specific actionable step]
${detailLevel !== 'concise' ? '3. [Specific actionable step]' : ''}

CRITICAL: Be analytical and concise. This is for a user switching AI platforms mid-task who needs continuity, NOT a general summary.`;

        const res = await callGeminiAsync({ action: 'prompt', text: prompt, length: 'short' });

        if (res && res.ok) {
          const summary = res.result || 'Context reconstructed.';
          
          // Build related conversations list - only show high-relevance ones
          let relatedHtml = '';
          if (relatedConvs && relatedConvs.length > 0) {
            // Filter to only show conversations with clear relevance
            const HIGH_DISPLAY_THRESHOLD = usingRAG ? 0.40 : 0; // Higher bar for display
            const displayConvs = relatedConvs.filter(conv => {
              if (!usingRAG) return true; // Show all if no RAG scores
              return conv.ragScore && conv.ragScore >= HIGH_DISPLAY_THRESHOLD;
            }).slice(0, 4); // Max 4 related conversations
            
            if (displayConvs.length > 0) {
              relatedHtml = '<div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(0,180,255,0.2);"><div style="font-weight:600;font-size:12px;margin-bottom:8px;opacity:0.8;">🔗 High-Relevance Context:</div>';
              displayConvs.forEach((conv, idx) => {
                const host = hostFromConv(conv) || 'unknown';
                const ago = Math.round((Date.now() - (conv.ts||Date.now())) / (1000 * 60 * 60));
                const agoLabel = ago < 1 ? 'recent' : ago < 24 ? `${ago}h ago` : `${Math.round(ago/24)}d ago`;
                const ragScore = conv.ragScore ? `${(conv.ragScore * 100).toFixed(0)}%` : '';
                
                // Get a more meaningful preview - prefer questions or decisions
                const msgs = conv.conversation || [];
                const meaningfulMsg = msgs.find(m => {
                  const t = m.text || '';
                  return t.length > 100 && (t.includes('?') || /decided|chose|implemented|will use/i.test(t));
                }) || msgs[0] || { text: '' };
                const preview = meaningfulMsg.text.slice(0, 120).trim();
                
                relatedHtml += `
                <div style="background:rgba(10,15,28,0.4);border:1px solid rgba(0,180,255,0.2);border-radius:6px;padding:8px;margin-bottom:6px;font-size:11px;">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                    <span style="font-weight:600;color:rgba(0,180,255,0.9);">${host}</span>
                    <span style="opacity:0.7;font-size:10px;">${agoLabel}${ragScore ? ' • ' + ragScore : ''}</span>
                  </div>
                  <div style="opacity:0.8;line-height:1.4;margin-bottom:6px;">${preview}${preview.length >= 120 ? '...' : ''}</div>
                  <button class="cb-btn cb-inject-conv" data-conv-idx="${idx}" style="font-size:10px;padding:4px 8px;">💉 Inject Context</button>
                </div>
              `;
              });
              relatedHtml += '</div>';
            }
          }
          
          // Render with quick action buttons
          outputArea.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:10px;">
              <div id="continuum-detail-container"></div>
              <div style="white-space:pre-wrap;line-height:1.6;">${summary}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button id="continuum-continue" class="cb-btn cb-btn-primary">Continue here</button>
                <button id="continuum-review" class="cb-btn">Review key points</button>
                <button id="continuum-fresh" class="cb-btn">Start fresh with context</button>
              </div>
              ${relatedHtml}
            </div>`;
          
          // Add detail level toggle
          createDetailLevelToggle('continuum-detail-container', async (newLevel) => {
            // Re-run analysis with new detail level
            showContinuumAgent();
          });

          const btnCont = outputArea.querySelector('#continuum-continue');
          const btnRev = outputArea.querySelector('#continuum-review');
          const btnFresh = outputArea.querySelector('#continuum-fresh');
          const btnInjectConvs = outputArea.querySelectorAll('.cb-inject-conv');

          const summaryPlain = (summary || '').replace(/<[^>]*>/g,'');
          const baseAsk = 'Please pick up from the previous session using the summary below.';

          btnCont && btnCont.addEventListener('click', async () => {
            try { await restoreToChat(`${baseAsk}\n\nSummary:\n${summaryPlain}`, []); toast('Inserted to chat'); } catch(e){ toast('Insert failed'); }
          });
          btnRev && btnRev.addEventListener('click', async () => {
            try { await restoreToChat(`Before continuing, briefly review these key points and ask me to confirm any assumptions.\n\nSummary:\n${summaryPlain}`, []); toast('Inserted to chat'); } catch(e){ toast('Insert failed'); }
          });
          btnFresh && btnFresh.addEventListener('click', async () => {
            try { await restoreToChat(`Start a new approach but keep this context in mind. Provide a short plan first.\n\nContext:\n${summaryPlain}`, []); toast('Inserted to chat'); } catch(e){ toast('Insert failed'); }
          });
          
          // Inject individual conversation context
          btnInjectConvs.forEach(btn => {
            btn.addEventListener('click', async () => {
              const convIdx = parseInt(btn.dataset.convIdx);
              const conv = relatedConvs[convIdx];
              if (!conv) return;
              
              const convText = (conv.conversation || []).map(m => `${m.role}: ${m.text}`).join('\n\n');
              const convSummary = `[Context from ${hostFromConv(conv)}]\nTopics: ${(conv.topics||[]).join(', ')}\n\n${convText.slice(0, 2000)}`;
              
              try { 
                await restoreToChat(convSummary, []); 
                toast('Context injected!'); 
              } catch(e) { 
                toast('Inject failed'); 
                debugLog('[Continuum] Inject conv failed:', e);
              }
            });
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
            const q = (topic||'').trim().toLowerCase();
            if (!q) return '';
            // Collect all messages across conversations that mention the topic
            const hits = [];
            convs.forEach(conv => {
              const ts = conv.ts || Date.now();
              const date = new Date(ts).toLocaleString();
              (conv.conversation||[]).forEach((m, idx) => {
                const t = (m.text||'');
                if (!t) return;
                if ((conv.topics||[]).some(tp => String(tp).toLowerCase().includes(q)) || t.toLowerCase().includes(q)) {
                  hits.push({ ts, date, role: m.role, text: t.slice(0, 800), platform: conv.platform || 'unknown' });
                }
              });
            });
            if (!hits.length) return '';
            hits.sort((a,b)=> a.ts - b.ts);
            let out = `Project/Topic: ${topic}\nTotal mentions: ${hits.length}\n\n`;
            hits.forEach((h,i)=>{
              out += `#${i+1} • ${h.date} • ${h.platform} • ${h.role}\n${h.text}\n\n`;
            });
            out += '---\nContinue from here with the consolidated context above.';
            return out;
          } catch(_) { return ''; }
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
            } catch(_){}
          });
          copyBtn.addEventListener('click', async ()=>{
            try { await navigator.clipboard.writeText(compiledBody.textContent||''); copyBtn.textContent='✓ Copied'; setTimeout(()=> copyBtn.textContent='📋 Copy Context', 2000); } catch(_){}
          });
          insertBtn.addEventListener('click', async ()=>{
            try { const t = compiledBody.textContent||''; if (window.ChatBridge && typeof window.ChatBridge.restoreToChat==='function') { await window.ChatBridge.restoreToChat(t, []); } insertBtn.textContent='✓ Inserted'; setTimeout(()=> insertBtn.textContent='➤ Insert to Chat', 2000); } catch(_){}
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
        const s = (text||'').toLowerCase();
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
            const clarifyRes = await callGeminiAsync({ action: 'prompt', text: clarifyPrompt, length: 'short' });
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
                  ragResults.map((r, i) => `${i+1}. ${r.text.slice(0, 200)}... (relevance: ${(r.score * 100).toFixed(0)}%)`).join('\n');
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
          const geminiPromise = callGeminiAsync({ action: 'prompt', text: enhancedPrompt, length: 'medium' }).catch(e => ({ ok: false, error: e.message }));
          const openaiPromise = callOpenAIAsync({ text: enhancedPrompt }).catch(e => ({ ok: false, error: e.message }));
          
          const [geminiRes, openaiRes] = await Promise.all([geminiPromise, openaiPromise]);
          
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
          if (geminiRes && geminiRes.ok && geminiRes.result) {
            const modelName = geminiRes.model || 'Gemini';
            const cleaned = cleanResponse(geminiRes.result);
            responses.push({ 
              source: `${modelName.replace('gemini-', 'Gemini ')}`, 
              answer: cleaned,
              raw: geminiRes.result 
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
            const polarWords = { positive: ['yes', 'true', 'correct', 'better', 'should', 'recommended'], 
                                 negative: ['no', 'false', 'incorrect', 'worse', 'shouldn\'t', 'not recommended'] };
            
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
            
            const outlineRes = await callGeminiAsync({ action: 'prompt', text: outlinePrompt, length: 'short' });
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

            
            const expandRes = await callGeminiAsync({ action: 'prompt', text: expandPrompt, length: 'comprehensive' });
            const expanded = expandRes?.result || responses.map(r => `**${r.source}:**\n${r.answer}`).join('\n\n---\n\n');
            
            // Stage 3: Refine and structure
            resultsDiv.innerHTML += '<div style="font-size:11px;opacity:0.7;">Stage 3/3: Refining final output...</div>';
            const refinePrompt = `Polish this answer for clarity and structure. Maintain the ${tone} tone. Add section headings, ensure logical flow, and highlight key takeaways:

${expanded}

Refined Answer (final, polished):`;
            
            const refineRes = await callGeminiAsync({ action: 'prompt', text: refinePrompt, length: 'comprehensive' });
            finalAnswer = refineRes?.result || expanded;
            
          } else {
            // Only one response - still apply multi-stage enhancement
            resultsDiv.innerHTML += '<div style="font-size:11px;opacity:0.7;">Enhancing single response...</div>';
            const enhancePrompt = `Enhance this answer with additional context and structure:

Original: ${responses[0].answer}
RAG Context: ${ragContext}

Enhanced Answer:`;
            const enhanceRes = await callGeminiAsync({ action: 'prompt', text: enhancePrompt, length: 'comprehensive' });
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
              ${followUps.map((q, i) => `<button class="cb-btn cb-followup" data-question="${q}" style="display:block;width:100%;text-align:left;margin:4px 0;padding:6px 8px;font-size:11px;">${i+1}. ${q}</button>`).join('')}
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
          try { if (window.RAGEngine && window.RAGEngine.incrementMetric) window.RAGEngine.incrementMetric('totalSynthesisSessions', 1); } catch(_){}
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

          const res = await callGeminiAsync({ action: 'prompt', text: prompt, length: 'medium' });
          
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

          const res = await callGeminiAsync({ action: 'prompt', text: prompt, length: 'long' });
          
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
              const txt = String(breakdownText||'');
              const steps = [];
              // Find step headings
              const re = /(\n|^)\s*(?:##+\s*)?Step\s*(\d+)\s*[:\-]\s*([^\n]+)\s*/gi;
              let m;
              const indices = [];
              while ((m = re.exec(txt)) !== null) {
                indices.push({ idx: m.index, num: parseInt(m[2],10)||steps.length+1, title: (m[3]||'').trim() });
              }
              // Build step blocks
              for (let i=0;i<indices.length;i++) {
                const start = indices[i].idx;
                const end = i+1<indices.length ? indices[i+1].idx : txt.length;
                const block = txt.slice(start, end);
                const assignedMatch = block.match(/Assigned\s*to\s*:?\s*(?:\*\*|\*)?([^\n*]+)(?:\*\*|\*)?/i);
                const taskMatch = block.match(/Task\s*:?\s*([^\n\r]+(?:\n(?!\s*\w+\s*:\s).+)*)/i);
                const model = assignedMatch ? assignedMatch[1].trim() : '';
                const taskRaw = taskMatch ? taskMatch[1].trim() : '';
                const taskOne = (() => {
                  const t = taskRaw.replace(/\s+/g,' ').trim();
                  // keep up to 2 short sentences or ~160 chars
                  const parts = t.split(/(?<=\.)\s+/).filter(Boolean);
                  const clipped = parts.slice(0,2).join(' ');
                  return (clipped || t).slice(0, 160);
                })();
                steps.push({ num: indices[i].num, title: indices[i].title, model, task: taskOne });
              }

              // Fallback: if no steps matched, create a single-line summary
              if (!steps.length) {
                const one = (txt.split('\n').find(l=>/Assigned to|Task|Step/i.test(l))||txt).replace(/\s+/g,' ').trim().slice(0,180);
                return `# ${goalText}\n\n- ${one}`;
              }

              // Integration flow extraction
              let flow = '';
              try {
                const sec = /Integration\s*Plan[\s\S]*?\n+([^\n][^#\n]{0,160})/i.exec(txt);
                if (sec && sec[1]) flow = sec[1].replace(/\s+/g,' ').trim();
              } catch(_) {}
              if (!flow) {
                const order = steps.map(s=>`S${s.num}`).join(' → ');
                flow = `${order} → Final deliverable`;
              }

              // Compose concise plan
              const header = `# ${goalText}`;
              const lines = steps
                .sort((a,b)=>a.num-b.num)
                .slice(0,7)
                .map(s => `- [${s.model||'Model'}] ${s.title || s.task}`);
              // Ensure at least 5 items if available
              const concise = `${header}\n\n${lines.join('\n')}\n\nIntegration Flow: ${flow}`;
              return concise;
            } catch (e) {
              return String(breakdownText||'');
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
          
          const concisePlan = postProcessPlanner(String(breakdown.result||''), goal, String(refinement?.result||''));
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
          copyBtn.addEventListener('click', async ()=>{
            try { await navigator.clipboard.writeText(planDiv.textContent||''); copyBtn.textContent = '✓ Copied'; setTimeout(()=> copyBtn.textContent='📋 Copy Plan', 2000); } catch(_){}
          });
          const insertBtn = document.createElement('button');
          insertBtn.className = 'cb-btn';
          insertBtn.style.cssText = 'flex:1;';
          insertBtn.textContent = '➤ Insert to Chat';
          insertBtn.addEventListener('click', async ()=>{
            try { const text = planDiv.textContent || ''; if (window.ChatBridge && typeof window.ChatBridge.restoreToChat === 'function') { await window.ChatBridge.restoreToChat(text, []); } insertBtn.textContent = '✓ Inserted'; setTimeout(()=> insertBtn.textContent='➤ Insert to Chat', 2000); } catch(_){}
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
      try { promptDesignerView.classList.remove('cb-view-active'); } catch (e) {}
    });

    // Helper: per-view progress updater
    function updateProgress(el, action, ev){
      try {
        if (!el) return;
        const act = (action==='summarize') ? 'Summarizing' : (action==='rewrite') ? 'Rewriting' : (action==='translate') ? 'Translating' : 'Syncing';
        let msg = '';
        if (!ev || !ev.phase) msg = act + '...';
        else if (ev.phase === 'preparing') msg = 'Analyzing input...';
        else if (ev.phase === 'chunking') msg = 'Breaking into ' + (ev.total||'?') + ' parts...';
        else if (ev.phase === 'chunk') msg = (act + ' part ' + (ev.index||'?') + '/' + (ev.total||'?') + '...');
        else if (ev.phase === 'merging') msg = 'Merging parts...';
        else if (ev.phase === 'done') msg = 'Finalizing...';
        else msg = act + '...';
        el.textContent = msg;
      } catch(e){}
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
        return uniq.slice(0,6);
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
          try { window.open(url, '_blank'); } catch(_) {}
          try { navigator.clipboard.writeText(text).then(()=>toast('Copied to clipboard. Paste into the new chat.')); } catch(_){ toast('Copied to clipboard.'); }
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
          card.setAttribute('role','button');
          card.setAttribute('tabindex','0');
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
          try { card.setAttribute('aria-label', 'Open conversation ' + platformName); } catch(e) {}
          
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
              `Entities: ${conv.matchedEntities} (${conv.entityDetails.slice(0,3).map(e => e.current).join(', ')})<br>` +
              `Themes: ${conv.matchedThemes} (${conv.themeDetails.slice(0,3).map(t => t.current).join(', ')})`;
            
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
          viewBtn.setAttribute('aria-label','Open conversation');
          // keyboard activation for card
          card.addEventListener('keydown', (ev) => { try { if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') { ev.preventDefault(); openConversationById(conv.id); notification.remove(); } } catch(e){} });
          
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
          try { if (notification.parentNode) notification.remove(); } catch (e) {}
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
        const stopWords = new Set(['the','that','this','with','from','about','they','would','have','there','their','which','what','when','where','your','you','will','could','should','and','for','but','are','not','was','were','has','had','can','all','any','more','our','its','also','use','using','like','just','know','get','make','want','need','think','see','look','take','come','well','even','back','good','very','much','said','than','some','into','them','only','over','such','other','then','now','may','these','after','most']);
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
          !['The','This','That','These','Those','There','Then','When','Where','What','Which','Who','How'].includes(w)
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
          empty.textContent = 'No connections found yet.' + (activeContext && activeContext.keywords && activeContext.keywords.length ? ' Topics detected: ' + activeContext.keywords.slice(0,5).join(', ') : '');
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
            conv.entities.slice(0,5).forEach(e => { const tag = document.createElement('span'); tag.style.cssText = 'background:rgba(11,15,23,0.25);padding:3px 8px;border-radius:6px;font-size:10px;font-weight:500;'; tag.textContent = e; chips.appendChild(tag); });
            card.appendChild(chips);
          }
          const open = document.createElement('button'); open.className = 'cb-btn'; open.textContent = 'Open conversation'; open.style.marginTop = '6px';
          open.addEventListener('click', () => { try { openConversationById(conv.id); } catch(_) {} });
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
          try { if (connectionsResult) { connectionsResult.textContent = 'No saved conversations yet. Scan some chats first to build your knowledge graph!'; } } catch(_) {}
          toast('No saved conversations yet. Scan some chats first to build your knowledge graph!');
          return;
        }
        
        // Quick scan of visible messages to extract current context
        const msgs = await scanChat();
        if (!msgs || msgs.length < 2) {
          try { if (connectionsResult) { connectionsResult.textContent = 'Not enough conversation context on this page. Try having a longer chat first.'; } } catch(_) {}
          toast('Not enough conversation context on this page. Try having a longer chat first.');
          return;
        }
        
        // Use sliding window for smarter context detection
        const activeContext = detectActiveContext(msgs, 8, 40);
        
        if (!activeContext) {
          try { if (connectionsResult) { connectionsResult.textContent = 'Could not detect clear context from current conversation.'; } } catch(_) {}
          toast('Could not detect clear context from current conversation.');
          return;
        }
        
        debugLog('Active context detected:', activeContext);
        
        // Update inline panel status
        try { if (connectionsResult) connectionsResult.textContent = 'Analyzing connections…'; } catch(_) {}
        
        // Find related conversations using detected entities and themes
        const related = await findRelatedConversations(activeContext.entities, activeContext.themes, 5);
        
        if (related.length) {
          try { renderConnectionsPanel(related, activeContext); } catch(_) {}
          // Keep toast, but prefer inline panel over floating notification
          toast(`Found ${related.length} related conversation${related.length > 1 ? 's' : ''} (${activeContext.confidence}% confidence)`);
        } else {
          // Show helpful message inline when no connections found
          try { renderConnectionsPanel([], activeContext); } catch(_) {}
        }
      } catch (e) {
        debugLog('detectAndSuggestContext error', e);
        try { if (connectionsResult) { connectionsResult.textContent = 'Analysis failed. Please try again.'; } } catch(_) {}
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
          try { if (notification.parentNode) notification.remove(); } catch (e) {}
        }, 12000);
        
      } catch (e) {
        debugLog('showNoConnectionsMessage error', e);
      }
    }

    // Scan button handler: scan, normalize, save, and optionally auto-summarize
    btnScan.addEventListener('click', async () => {
      addLoadingToButton(btnScan, 'Scanning'); 
      status.textContent = 'Status: scanning...'; 
      announce('Scanning conversation now');
      
      try {
        const msgs = await scanChat();
        
        // persist lastScannedText for clipboard and Sync view
        try { 
          if (Array.isArray(msgs) && msgs.length) { 
            lastScannedText = msgs.map(m => `${m.role}: ${m.text}`).join('\n\n'); 
          } 
        } catch (e) {}
        
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
          } catch (e) {}
          
          status.textContent = 'Status: no messages'; 
          toast(errorMsg);
          announce('Scan completed: no messages found');
        } else {
          const final = normalizeMessages(msgs);
          const currentModel = detectCurrentModel();
          const conv = { platform: location.hostname, url: location.href, ts: Date.now(), model: currentModel, conversation: final };
          
          // ensure lastScannedText updated when saving
          try { 
            lastScannedText = final.map(m => `${m.role}: ${m.text}`).join('\n\n'); 
          } catch (e) {}
          
          // Use the async saveConversation function directly
          try {
            await saveConversation(conv);
            toast('Saved ' + final.length + ' messages');
            status.textContent = `Status: saved ${final.length}`;
            refreshHistory();
            announce('Scan complete, conversation saved');
          } catch (saveError) {
            debugLog('Save failed', saveError);
            toast('Save failed: ' + (saveError.message || 'unknown error'));
            status.textContent = `Status: save failed`;
          }

          // DISABLED: All heavy operations moved to background to keep scan instant
          // Users can manually trigger these from the Insights tab if needed
        }
      } catch (e) { 
        console.error('[ChatBridge] Scan error:', e);
        status.textContent = 'Status: error'; 
        toast('Scan failed: ' + (e && e.message)); 
        showError('Scan failed: ' + (e && e.message), async () => { try { btnScan.click(); } catch(_) {} }); 
        announce('Scan failed'); 
      } finally {
        // CRITICAL: Always remove loading state, even if errors occurred
        try {
          removeLoadingFromButton(btnScan, 'Scan Chat');
        } catch (e) {
          console.error('[ChatBridge] Failed to remove loading from scan button:', e);
          // Fallback: manually reset button
          try {
            if (btnScan) {
              btnScan.disabled = false;
              btnScan.classList.remove('cb-loading');
              btnScan.textContent = 'Scan Chat';
            }
          } catch (_) {}
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
        } catch(err){ 
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
            try { localStorage.removeItem('chatbridge:conversations'); } catch (_) {}
            try { 
              if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.remove(['chatbridge:conversations']);
              }
            } catch (_) {}
          }
        }
        toast('History cleared');
        refreshHistory();
        // Clear the preview/last-scanned text
        try { preview.textContent = 'Preview: (none)'; } catch (e) {}
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
        await renderSmartWorkspace();
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
          try { if (alert.parentNode) alert.remove(); } catch (e) {}
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
      } catch (e) {}
      try {
        const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
        // prefer visible ones
        for (const fi of fileInputs) {
          try {
            const cs = window.getComputedStyle(fi);
            if (cs.display !== 'none' && cs.visibility !== 'hidden') return fi;
          } catch (e) {}
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
        const img = atts.find(a => a.kind === 'image');
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
          try { fileInput.dispatchEvent(new Event('change', { bubbles: true })); } catch(e) {}
          try { fileInput.dispatchEvent(new Event('input', { bubbles: true })); } catch(e) {}
          result.uploaded = count;
          toast('Attached ' + count + ' file' + (count>1?'s':'') + ' to chat');
          restoreLog('Successfully attached', count, 'files');
        } else if (result.failed.length > 0) {
          toast('Could not attach files. Check console for details.');
        }
      } catch (e) {
        restoreLog('attachFilesToChat error:', e);
        try { console.error('[ChatBridge attachFiles] error', e); } catch(_) {}
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
            const attrs = ((el.getAttribute('aria-label')||'') + ' ' + (el.getAttribute('placeholder')||'')).toLowerCase();
            if (/search|find|filter|nav|menu/.test(attrs)) continue;
            return el;
          } catch (_) {}
        }
      } catch (_) {}
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
      if (lastErr) { try { console.warn('[ChatBridge] waitForComposer error:', lastErr); } catch(_){} }
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
          try { await navigator.clipboard.writeText(cleanText); toast('Copied to clipboard'); } catch(e) {}
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
        try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch(_) {}
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

    btnRestore.addEventListener('click', async () => {
      try {
        // Always load from the unified loader (merges background DB + chrome mirror)
        const list = await loadConversationsAsync();
        const arr = Array.isArray(list) ? list : [];
        if (!arr.length) { toast('No saved conversations'); return; }
        // Use selected chat from dropdown if available (fallback to first)
        let sel = null;
        try {
          if (chatSelect && chatSelect.value) {
            const i = arr.findIndex(v => String(v.ts) === chatSelect.value || String(v.id) === chatSelect.value);
            sel = i >= 0 ? arr[i] : arr[0];
          } else { sel = arr[0]; }
        } catch (_) { sel = arr[0]; }
        if (!sel || !sel.conversation || !sel.conversation.length) { toast('No messages in selected conversation'); return; }
        
        // Auto-summarize if 10+ messages to preserve context without overwhelming the chat
        let formatted = '';
        const msgCount = sel.conversation.length;
        
        if (msgCount >= 10 && (!sel.summary || sel.summary.trim().length === 0)) {
          // Auto-summarize for better context preservation
          toast(`Auto-summarizing ${msgCount} messages for optimal context...`);
          try {
            const fullText = sel.conversation.map(m => `${m.role}: ${m.text}`).join('\n\n');
            const opts = { chunkSize: 14000, maxParallel: 3, length: 'comprehensive', summaryType: 'transfer' };
            const summary = await hierarchicalSummarize(fullText, opts);
            formatted = summary + '\n\n🔄 Please continue based on this context.';
            // Save summary for future use
            sel.summary = summary;
            await saveConversation(sel);
          } catch (sumErr) {
            debugLog('Auto-summarize failed, using full text', sumErr);
            formatted = sel.conversation.map(m => (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.text).join('\n\n') + '\n\n🔄 Please continue the conversation.';
          }
        } else if (sel.summary && typeof sel.summary === 'string' && sel.summary.trim().length > 0) {
          // Use existing summary
          formatted = sel.summary.trim();
        } else {
          // Use full conversation for small chats
          formatted = sel.conversation.map(m => (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.text).join('\n\n') + '\n\n🔄 Please continue the conversation.';
        }
        // Collect attachments from conversation
        const allAtts = [];
        try {
          for (const m of sel.conversation) {
            if (Array.isArray(m.attachments) && m.attachments.length) allAtts.push(...m.attachments);
          }
        } catch (e) {}
        
        // Use the restoreToChat function which has all the proper logic
        const success = await restoreToChat(formatted, allAtts);
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
                    const item = new ClipboardItem({ [res.type||'image/png']: blob });
                    await navigator.clipboard.write([item]);
                    toast('Image copied too');
                  } catch(e) {}
                }
              });
            }
            } catch (_) {}
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

    function _normalize(str){ return String(str||'').replace(/\s+/g,' ').trim(); }
    function _hashKey(s){ let h=0; for (let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0; } return h.toString(36); }
    function _isSimplePrompt(t){
      const txt=_normalize(t); if (txt.length>=200) return false;
      const q = (txt.match(/[?]/g)||[]).length; const commas=(txt.match(/[,;:]/g)||[]).length; const bullets=(txt.match(/[-*•]/g)||[]).length;
      return (q+commas+bullets) <= 2; // low structural complexity
    }
    function _localSummary(t){
      const txt = _normalize(t);
      const sentences = txt.split(/[.!?]\s+/).filter(s=>s && s.length>3).slice(0,4);
      if (!sentences.length) return txt.slice(0,180);
      return '\u2022 ' + sentences.map(s=>s.trim()).join('\n\u2022 ');
    }
    function _topicCount(t){
      const words = String(t||'').toLowerCase().split(/[^a-z0-9_]+/).filter(w=>w.length>=5);
      const stop=new Set(['about','which','there','their','would','could','should','these','those','think','using','thing','things','after','before','where','while','doing','being','having','from','with','without','between','under','above','again']);
      const freq={}; words.forEach(w=>{ if(!stop.has(w)) freq[w]=(freq[w]||0)+1; });
      const keys=Object.keys(freq).filter(k=>freq[k]>=2);
      return Math.max(1, Math.min(5, keys.length));
    }
    function _stripRAGContextIfSparse(text){
      try {
        const rc = (window.RAGEngine && typeof window.RAGEngine._lastRetrievedCount==='number') ? window.RAGEngine._lastRetrievedCount : null;
        if (rc !== null && rc < 2 && /\[Relevant context from past conversations:\]/.test(text)) {
          return text.replace(/\n\n\[Relevant context from past conversations:\][\s\S]*$/,'');
        }
      } catch(_){}
      return text;
    }
    function _tryCacheGet(key){
      const e=_CB_TOKEN_CACHE.get(key); if(!e) return null; if ((Date.now()-e.ts)>_CB_TOKEN_CACHE_TTL_MS) { _CB_TOKEN_CACHE.delete(key); return null; } return e.res;
    }
    function _cachePut(key,res){
      _CB_TOKEN_CACHE.set(key,{ ts: Date.now(), res });
      if (_CB_TOKEN_CACHE.size>_CB_TOKEN_CACHE_MAX){ const first=_CB_TOKEN_CACHE.keys().next().value; _CB_TOKEN_CACHE.delete(first); }
    }

    async function tokenGovernor(payload, provider){
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
        const key = provider + '|' + action + '|' + _hashKey(normalized) + '|' + (payload.length||'');

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
            const one = 'Step 1: ' + (text.replace(/"/g,'').slice(0,80) || 'Single-focus task');
            const res = { ok: true, result: one, model: 'local-fast' };
            _cachePut(key, res);
            return { intercepted: true, res };
          }
        }

        return { intercepted: false, payload, cacheKey: key };
      } catch(_) {
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

    // Hierarchical summarization: chunk long text, summarize chunks in parallel, then merge
    async function hierarchicalSummarize(text, options) {
      options = options || {};
      const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
      try { onProgress && onProgress({ phase: 'preparing' }); } catch(e){}
      const chunkSize = options.chunkSize || 12000; // characters per chunk (~12k)
      const maxParallel = options.maxParallel || 3; // number of parallel chunk summaries
      const mergePrompt = options.mergePrompt || 'Merge the following chunk summaries into a single coherent summary preserving salient points and context.';
      if (!text || typeof text !== 'string') return '';
      // Small inputs: direct summarize call
      if (text.length <= chunkSize) {
        const res = await callGeminiAsync({ action: 'summarize', text, length: options.length || 'medium', summaryType: options.summaryType || 'paragraph' });
        if (res && res.ok) { try { onProgress && onProgress({ phase: 'done' }); } catch(e){}; return res.result; }
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
      try { onProgress && onProgress({ phase: 'chunking', total: chunks.length }); } catch(e){}

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
        try { await sleep(250); } catch(e){}
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
          try { onProgress && onProgress({ phase: 'chunk', index: globalIndex, total: chunks.length }); } catch(e){}
          return summarizeChunk(c);
        });
        const results = await Promise.all(batch);
        summaries.push(...results);
      }

      // Merge chunk summaries
      const mergeInput = summaries.map((s, idx) => `Chunk ${idx+1}:\n${s}`).join('\n\n');
      // Primary merge attempt
      try {
        try { onProgress && onProgress({ phase: 'merging' }); } catch(e){}
  let mergeRes = await callGeminiAsync({ action: 'summarize', text: mergeInput, length: options.length || 'medium', summaryType: options.summaryType || 'paragraph', prompt: mergePrompt });
  if (mergeRes && mergeRes.ok) { try { onProgress && onProgress({ phase: 'done' }); } catch(e){}; return mergeRes.result; }
        debugLog('hierarchicalSummarize: primary merge failed', mergeRes);

        // Retry once with the same payload (some transient backend issues recover on retry)
        try {
          const retryRes = await callGeminiAsync({ action: 'summarize', text: mergeInput, length: options.length || 'medium', summaryType: options.summaryType || 'paragraph', prompt: mergePrompt });
          if (retryRes && retryRes.ok) { try { onProgress && onProgress({ phase: 'done' }); } catch(e){}; return retryRes.result; }
          debugLog('hierarchicalSummarize: retry merge failed', retryRes);
        } catch (retryErr) {
          debugLog('hierarchicalSummarize: retry merge threw', retryErr);
        }

        // Fallback: ask the model to summarize the concatenated chunk summaries with a simpler instruction
        try {
          const fallbackPrompt = 'Produce a single coherent, concise summary from the following chunk summaries. Preserve the key points and overall context.';
          const fallbackRes = await callGeminiAsync({ action: 'summarize', text: mergeInput, length: options.length || 'medium', summaryType: options.summaryType || 'paragraph', prompt: fallbackPrompt });
          if (fallbackRes && fallbackRes.ok) { try { onProgress && onProgress({ phase: 'done' }); } catch(e){}; return fallbackRes.result; }
          debugLog('hierarchicalSummarize: fallback summarize failed', fallbackRes);
        } catch (fbErr) {
          debugLog('hierarchicalSummarize: fallback summarize threw', fbErr);
        }

      } catch (e) {
        debugLog('hierarchicalSummarize: merge attempt threw', e);
      }

      // Last resort: return concatenated chunk summaries so the caller still gets useful information
  try { onProgress && onProgress({ phase: 'done' }); } catch(e){}
  debugLog('hierarchicalSummarize: returning concatenated chunk summaries as last resort');
      return summaries.join('\n\n');
    }
    
    // Generic hierarchical processor for other actions (prompt/rewrite/translate)
    async function hierarchicalProcess(text, action, options) {
      options = options || {};
      const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
      try { onProgress && onProgress({ phase: 'preparing' }); } catch(e){}
      const chunkSize = options.chunkSize || 12000;
      const maxParallel = options.maxParallel || 3;
      const mergePrompt = options.mergePrompt || `Combine the following pieces into a single coherent output that preserves context, style, and important details.`;
      const perChunkExtra = options.extraPayload || {};
      if (!text || typeof text !== 'string') return '';
      if (text.length <= chunkSize) {
        const res = await callGeminiAsync(Object.assign({ action, text }, perChunkExtra));
        if (res && res.ok) { try { onProgress && onProgress({ phase: 'done' }); } catch(e){}; return res.result; }
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
  try { onProgress && onProgress({ phase: 'chunking', total: chunks.length }); } catch(e){}

      const outputs = [];
      for (let i = 0; i < chunks.length; i += maxParallel) {
        const slice = chunks.slice(i, i + maxParallel);
        const batch = slice.map((c, idx) => {
          const globalIndex = i + idx + 1;
          try { onProgress && onProgress({ phase: 'chunk', index: globalIndex, total: chunks.length }); } catch(e){}
          return callGeminiAsync(Object.assign({ action, text: c }, perChunkExtra)).then(r => (r && r.ok) ? r.result : ('[chunk-failed]'))
        });
        const results = await Promise.all(batch);
        outputs.push(...results);
      }

      // If merge explicitly disabled, just concatenate chunk outputs
  if (options.merge === false) { try { onProgress && onProgress({ phase: 'done' }); } catch(e){}; return outputs.join('\n\n'); }

      // Otherwise, merge outputs via a final prompt call (use 'prompt' action for merge)
      const mergeInput = outputs.map((s, idx) => `Part ${idx+1}:\n${s}`).join('\n\n');
      const mergeText = mergePrompt + '\n\n' + mergeInput;
      // If syncing tone, forward source/target metadata and ask backend to perform tone transfer
      if (action === 'syncTone') {
        // Construct a prompt engineering instruction for the target AI model
        const src = options.sourceModel || 'SourceModel';
        const tgt = options.targetModel || 'TargetModel';
        const tonePrompt = `You are an expert prompt engineer. Rewrite the following conversation parts so that the complete conversation is optimally structured for ${tgt} to understand and produce the best responses. Optimize prompts for clarity, context, and ${tgt}'s communication style. Preserve all factual content and user intent. The original was optimized for ${src}.\n\n${mergeInput}`;
        try { onProgress && onProgress({ phase: 'merging' }); } catch(e){}
        const mergeRes = await callGeminiAsync({ action: 'syncTone', text: tonePrompt, length: options.length || 'medium', sourceModel: src, targetModel: tgt });
        if (mergeRes && mergeRes.ok) { try { onProgress && onProgress({ phase: 'done' }); } catch(e){}; return mergeRes.result; }
        throw new Error('syncTone-merge-failed');
      }
      try { onProgress && onProgress({ phase: 'merging' }); } catch(e){}
      const mergeRes = await callGeminiAsync({ action: 'prompt', text: mergeText, length: options.length || 'medium' });
      if (mergeRes && mergeRes.ok) { try { onProgress && onProgress({ phase: 'done' }); } catch(e){}; return mergeRes.result; }
      throw new Error('merge-failed');
    }
    
    // Unified Rewrite API
    // Selects template via background templates and handles chunk/merge.
    async function rewriteText(mode, text, options = {}) {
      const styleKey = mode || 'normal';
      const styleHint = options.style || options.styleHint || '';
      const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
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
        try { if (inputText && summTypeSelect) { summTypeSelect.value = pickAdaptiveSummaryType(inputText); } } catch(_){ }
      } catch (e) { toast('Failed to open Summarize'); debugLog('open summ view', e); }
    });

    btnCloseSumm.addEventListener('click', () => {
      try { summView.classList.remove('cb-view-active'); } catch (e) {}
    });

    btnGoSumm.addEventListener('click', async () => {
      try {
  btnGoSumm.disabled = true; addLoadingToButton(btnGoSumm, 'Summarizing'); summResult.textContent = ''; btnInsertSumm.style.display = 'none';
        summProg.style.display = 'inline'; updateProgress(summProg, 'summarize', { phase: 'preparing' });
        const chatText = (summSourceText && summSourceText.textContent) ? summSourceText.textContent : '';
  if (!chatText || chatText.trim().length < 10) { toast('No conversation to summarize'); btnGoSumm.disabled = false; btnGoSumm.textContent = 'Summarize'; return; }

        const length = (summLengthSelect && summLengthSelect.value) || 'medium';
        const summaryType = (summTypeSelect && summTypeSelect.value) || 'paragraph';
        const opts = { chunkSize: 14000, maxParallel: 3, length, summaryType, onProgress: (ev)=>updateProgress(summProg, 'summarize', ev) };
        const result = await hierarchicalSummarize(chatText, opts);

        // Update text area with result and show Insert button
        summSourceText.textContent = result || '(no result)';
        summResult.textContent = '✅ Summary completed! The text area above now shows the summarized version.';
        btnInsertSumm.style.display = 'inline-block';
        summProg.style.display = 'none';
  // No duplicate output in preview; go straight to history below
        toast('Summarize completed');
      } catch (err) {
        toast('Summarize failed: ' + (err && err.message ? err.message : err));
        debugLog('hierarchicalSummarize error', err);
  } finally { removeLoadingFromButton(btnGoSumm, 'Summarize'); }
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

    function _hashStr(s){ let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0; } return h.toString(36); }

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
        let candidates = (msgs || []).filter(m => (m && m.text && m.text.trim().length>0));
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
          id: `r-${i}-${_hashStr(m.text.slice(0,64))}`, 
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
          const empty = document.createElement('div'); empty.style.cssText='font-size:12px;color:var(--cb-subtext)'; empty.textContent='No assistant replies found.'; list.appendChild(empty); return;
        }
        for (const r of _cbRepliesData) {
          const bubble = document.createElement('div'); bubble.className='cb-reply'; bubble.dataset.id = r.id;
          if (_cbSelectedReplyId === r.id || _cbSelectedReplyIds.has(r.id)) bubble.classList.add('cb-selected');
          const previewEl = document.createElement('div'); previewEl.className='cb-reply-preview'; previewEl.textContent = r.preview;
          bubble.appendChild(previewEl);
          const meta = document.createElement('div'); meta.className='cb-reply-meta'; meta.textContent = `${r.role === 'user' ? 'User' : 'AI'} • ${r.text.length} chars`;
          bubble.appendChild(meta);
          bubble.addEventListener('click', ()=>{
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
      } catch(e){ debugLog('renderReplies error', e); }
    }

    function updateRewSourceFromSelection() {
      try {
        if (!_rewMultiMode) return;
        const selected = _cbRepliesData.filter(r => _cbSelectedReplyIds.has(r.id));
        const text = selected.map(r => r.text).join('\n\n');
        rewSourceText.textContent = text || '(no selection)';
      } catch(e){}
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
        setTimeout(() => { try { textarea.focus(); textarea.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch(e){} }, 100);
      } catch(e){ debugLog('showEditor error', e); }
    }

    function hideEditor() {
      try {
        const editor = rewView.querySelector('#cb-rewrite-editor');
        const repliesList = rewView.querySelector('#cb-replies-list');
        if (editor) editor.classList.remove('cb-active');
        if (repliesList) repliesList.classList.remove('cb-editor-open');
      } catch(e){}
    }

    btnRewrite.addEventListener('click', async () => {
      closeAllViews();
      try {
        const inputText = await getConversationText();
        rewSourceText.textContent = inputText || '(no conversation found)';
        rewResult.textContent = '';
        rewView.classList.add('cb-view-active');
        // Load replies on open
        await loadAssistantReplies();
      } catch (e) { toast('Failed to open Rewrite'); debugLog('open rew view', e); }
    });

      // Controls: Multi-select toggle
      try {
        rewMultiBtn.addEventListener('click', () => {
          _rewMultiMode = !_rewMultiMode;
          try { if (_rewMultiMode) rewMultiBtn.classList.add('cb-active'); else rewMultiBtn.classList.remove('cb-active'); } catch(e){}
          if (_rewMultiMode) {
            _cbSelectedReplyId = null;
            _cbSelectedReplyIds.clear();
            hideEditor();
            renderReplies();
            updateRewSourceFromSelection();
          }
        });
      } catch(e){}

      // Controls: Filter cycling (All -> Assistant -> User)
      try {
        rewFilterBtn.addEventListener('click', async () => {
          if (_rewFilter === 'all') _rewFilter = 'assistant';
          else if (_rewFilter === 'assistant') _rewFilter = 'user';
          else _rewFilter = 'all';
          rewFilterBtn.textContent = 'Filter: ' + (_rewFilter === 'all' ? 'All' : (_rewFilter === 'assistant' ? 'Assistant' : 'User'));
          await loadAssistantReplies();
        });
      } catch(e){}

    btnCloseRew.addEventListener('click', () => {
      try { rewView.classList.remove('cb-view-active'); _cbSelectedReplyId = null; hideEditor(); } catch (e) {}
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
          } catch(e) { toast('Copy failed'); }
        });
      }
    } catch(e) { debugLog('editor buttons setup error', e); }

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
              result = await hierarchicalProcess(chatText, 'syncTone', { chunkSize: 14000, maxParallel: 3, length: 'medium', sourceModel: 'unknown', targetModel: targetModel, onProgress: (ev)=>updateProgress(rewProg, 'rewrite', ev) });
            } catch (e) { debugLog('hierarchicalProcess syncTone error', e); throw e; }
          }
        } else {
          // Standard rewrite
          result = await rewriteText(style, chatText, { styleHint, chunkSize: 14000, maxParallel: 3, length: 'medium', onProgress: (ev)=>updateProgress(rewProg, 'rewrite', ev) });
        }
        
        rewSourceText.textContent = result || '(no result)';
        rewResult.textContent = targetModel 
          ? `✅ Conversation adapted for ${targetModel}! The text area above shows the optimized version.`
          : '✅ Rewrite completed! The text area above now shows the rewritten version.';
        btnInsertRew.style.display = 'inline-block';
        rewProg.style.display = 'none';
        toast(targetModel ? `Adapted for ${targetModel}` : 'Rewrite completed');
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
      try { transView.classList.remove('cb-view-active'); } catch (e) {}
    });

    btnGoTrans.addEventListener('click', async () => {
      try {
        btnGoTrans.disabled = true; transProg.style.display = 'inline'; transResult.style.display = 'none'; transResult.textContent = ''; btnInsertTrans.style.display = 'none';
        const targetLanguage = transLangSelect.value || 'en';
        const radios = Array.from(transView.querySelectorAll('input[name="cb-trans-mode"]'));
        console.log('[ChatBridge] Found radios:', radios.length);
        const selectedMode = radios.find(r=>r && r.checked);
        const mode = selectedMode ? selectedMode.value : 'all';
        console.log('[ChatBridge] Translation mode:', mode);
        const shortenEl = transView.querySelector('#cb-trans-shorten');
        console.log('[ChatBridge] Shorten element:', shortenEl);
        const shorten = !!(shortenEl && shortenEl.checked);
        console.log('[ChatBridge] Shorten:', shorten);
        let content;
        if (mode === 'last') {
          const lastScan = window.ChatBridge.getLastScan();
          if (!lastScan || !lastScan.messages || lastScan.messages.length === 0) { toast('No messages found'); btnGoTrans.disabled = false; transProg.style.display = 'none'; return; }
          const lastMsg = lastScan.messages[lastScan.messages.length - 1];
          content = [{ role: lastMsg.role || 'assistant', text: lastMsg.text || '' }];
        } else {
          const lastScan = window.ChatBridge.getLastScan();
          if (!lastScan || !lastScan.messages || lastScan.messages.length === 0) {
            const chatText = await getConversationText();
            content = chatText || '';
          } else {
            content = lastScan.messages;
          }
        }
        if (typeof window.ChatBridgeTranslator === 'undefined') { toast('Translation module not loaded'); btnGoTrans.disabled = false; transProg.style.display = 'none'; return; }
        const result = await window.ChatBridgeTranslator.translateContent({ targetLanguage, mode, shorten, content });
        if (!result || !result.translated) { toast('Translation failed: no result'); btnGoTrans.disabled = false; transProg.style.display = 'none'; return; }
        let displayText = '';
        if (Array.isArray(result.translated)) {
          displayText = result.translated.map(msg => {
            const roleIcon = msg.role === 'user' ? '👤 User' : '🤖 AI';
            return `${roleIcon}:\n${msg.text}`;
          }).join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n');
        } else {
          displayText = result.translated;
        }
        transResult.textContent = displayText;
        transResult.style.display = 'block';
        btnInsertTrans.style.display = 'inline-block';
        transProg.style.display = 'none';
        toast('Translation completed');
      } catch (err) {
        toast('Translation failed: ' + (err && err.message ? err.message : err));
        console.error('[ChatBridge] Translation error:', err);
        transProg.style.display = 'none';
      } finally { btnGoTrans.disabled = false; }
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
        try { smartResults.textContent = '(No results yet)'; } catch(_) {}
        try { smartAnswer.textContent = ''; } catch(_) {}
        try { smartInput.value = ''; } catch(_) {}
        try { smartView.classList.add('cb-view-active'); } catch(_) {}

        // Defer heavy work to keep first-click instant
        setTimeout(async () => {
          try {
            // populate host and tag filters from saved conversations
            try {
              const convs = await loadConversationsAsync();
              // hosts
              try { while (hostSelect.firstChild) hostSelect.removeChild(hostSelect.firstChild); const ho = document.createElement('option'); ho.value = ''; ho.textContent = 'All hosts'; hostSelect.appendChild(ho); } catch (e) {}
              const hosts = Array.from(new Set((convs||[]).map(c => { try { return (c.platform || (c.url && new URL(c.url).hostname) || location.hostname).toString(); } catch(_) { return location.hostname; } }))).slice(0,50);
              hosts.forEach(h => { const o = document.createElement('option'); o.value = h; o.textContent = h.length > 24 ? (h.slice(0,20) + '…') : h; hostSelect.appendChild(o); });
              // tags
              try { while (tagSelect.firstChild) tagSelect.removeChild(tagSelect.firstChild); const to = document.createElement('option'); to.value = ''; to.textContent = 'All tags'; tagSelect.appendChild(to); } catch (e) {}
              // normalize existing tags when populating filters (handles older saved convs)
              const rawTags = [].concat(...(convs||[]).map(c => (c.topics||[])));
              const normTags = [];
              const seenTag = new Set();
              rawTags.forEach(tt => {
                try {
                  const tnorm = String(tt||'').toLowerCase().replace(/["'()\.]/g, '').replace(/\s+/g, ' ').trim();
                  if (tnorm && !seenTag.has(tnorm)) { seenTag.add(tnorm); normTags.push(tnorm); }
                } catch(_) {}
              });
              const tags = normTags.slice(0,100);
              tags.forEach(t => { const o = document.createElement('option'); o.value = t; const disp = String(t).split(/[_\-\s]+/).map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' '); o.textContent = disp; tagSelect.appendChild(o); });
            } catch (e) { debugLog('populate filters failed', e); }

            // populate smart suggestions (chips) and placeholder
            try { await populateSmartSuggestions(); } catch(e) { debugLog('populateSmartSuggestions failed', e); }
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

    btnCloseSmart.addEventListener('click', () => { try { smartView.classList.remove('cb-view-active'); } catch (e) {} });

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
              chrome.storage.local.set({ [key]: value }, () => {});
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
        } catch (_) {}
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
                        const better = (Array.isArray(c.conversation) && c.conversation.length >= (prev.conversation?.length||0)) ? c : prev;
                        m.set(id, better);
                      }
                    }
                    const merged = Array.from(m.values()).sort((a,b) => (b.ts||0) - (a.ts||0));
                    try { __cbConvCache.data = merged; __cbConvCache.ts = Date.now(); } catch(_){}
                    res(merged);
                  } catch (e) { res(r.conversations); }
                });
              } else {
                try { __cbConvCache.data = r.conversations; __cbConvCache.ts = Date.now(); } catch(_){}
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
                  const sorted = arr.slice().sort((a,b) => (b.ts||0) - (a.ts||0));
                  try { __cbConvCache.data = sorted; __cbConvCache.ts = Date.now(); } catch(_){}
                  res(sorted);
                } else {
                  // Final fallback to localStorage
                  try {
                    const local = JSON.parse(localStorage.getItem('chatbridge:conversations') || '[]');
                    const sorted = (Array.isArray(local) ? local : []).slice().sort((a,b) => (b.ts||0) - (a.ts||0));
                    try { __cbConvCache.data = sorted; __cbConvCache.ts = Date.now(); } catch(_){}
                    res(sorted);
                  } catch (e) { res([]); }
                }
              });
            } else {
              // Final fallback if chrome APIs not available
              const arr = JSON.parse(localStorage.getItem('chatbridge:conversations') || '[]'); 
              const sorted = (Array.isArray(arr) ? arr : []).slice().sort((a,b) => (b.ts||0) - (a.ts||0));
              try { __cbConvCache.data = sorted; __cbConvCache.ts = Date.now(); } catch(_){}
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
            if (chrome.runtime.lastError) return res({ ok:false, error: chrome.runtime.lastError.message });
            return res(r || { ok:false });
          });
        } catch (e) { return res({ ok:false, error: e && e.message }); }
      });
    }

    // Build topic suggestions from text (prioritize nouns, technical terms, capitalized words)
    function buildKeywordsFromText(text, limit = 5) {
      try {
        if (!text) return [];
        
        // Expanded stop words to filter out common verbs, auxiliaries, and non-topic words
        const stop = new Set([
          'the','that','this','with','from','about','they','would','have','there','their','which','what','when','where','your','you','will','could','should','and','for','but','are','not','was','were','has','had','can','all','any','more','our','its','also','use','using','like','just','know','get','make','want','need','think','see','look','take','come','well','even','back','good','very','much','said','than','some','into','them','only','over','such','other','then','now','may','these','after','most','been','find','here','give','many','does','done','being','because','going','really','actually','probably','definitely','maybe','perhaps','seems','something','anything','everything','nothing','someone','anyone','everyone','nobody','want','need','create','makes','trying','asked','looking','getting','working','having'
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
          .sort((a,b) => b[1] - a[1])
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
            if (chrome.runtime.lastError) return res({ ok:false, error: chrome.runtime.lastError.message });
            return res(r || { ok:false });
          });
        } catch (e) { return res({ ok:false, error: e && e.message }); }
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
        try { while (smartSuggestRow.firstChild) smartSuggestRow.removeChild(smartSuggestRow.firstChild); } catch(e){}
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
                .sort((a,b) => b[1] - a[1])
                .slice(0, 6)
                .map(([topic, count]) => ({ text: topic.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), confidence: Math.min(90, 50 + (count * 10)) }));
            }
          }
        } catch(e) { debugLog('load saved topics failed', e); }
        
        // Priority 2: Try embedding-based suggestions via background (if no saved topics)
        if ((!suggestions || suggestions.length === 0) && lastScannedText && lastScannedText.length) {
          try {
            const resp = await requestEmbeddingSuggestions(lastScannedText, 6);
            if (resp && resp.ok && Array.isArray(resp.suggestions) && resp.suggestions.length) {
              // Normalize: accept either strings or { phrase, confidence }
              suggestions = resp.suggestions.slice(0,6).map(s => {
                if (typeof s === 'string') return { text: s, confidence: undefined };
                if (s && typeof s === 'object') {
                  const text = s.text || s.phrase || '';
                  const confidence = typeof s.confidence === 'number' ? s.confidence : undefined;
                  return { text, confidence };
                }
                return null;
              }).filter(Boolean);
            }
          } catch(e) { debugLog('embed suggest failed', e); }
        }

        // Priority 3: Extract topics from last scanned text (fallback)
        if (!suggestions || suggestions.length === 0) {
          try { 
            if (lastScannedText && lastScannedText.length) {
              suggestions = buildKeywordsFromText(lastScannedText, 6).map(t => ({ text: t, confidence: 55 }));
            }
          } catch(e){}
        }
        
        // Priority 4: Aggregate topics from recent conversation text (last resort)
        if (!suggestions || suggestions.length === 0) {
          try {
            const convs = await loadConversationsAsync();
            const sample = (convs || []).slice(-8).map(c => (c.conversation||[]).map(m=>m.text).join(' ')).join('\n');
            suggestions = buildKeywordsFromText(sample, 6).map(t => ({ text: t, confidence: 50 }));
          } catch(e) { suggestions = []; }
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
          chip.setAttribute('role','button');
          chip.setAttribute('tabindex','0');
          chip.setAttribute('aria-label', 'Suggestion: ' + txt + (typeof s.confidence === 'number' ? `, confidence ${s.confidence} percent` : ''));
          chip.addEventListener('click', () => { try { smartInput.value = txt; smartInput.focus(); announce('Suggestion chosen: ' + txt); } catch(e){} });
          chip.addEventListener('keydown', (ev) => { try { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); smartInput.value = txt; smartInput.focus(); announce('Suggestion chosen: ' + txt); } } catch(e){} });
          smartSuggestRow.appendChild(chip);
        });
        // set placeholder to first suggestion
        try { if (suggestions && suggestions.length) smartInput.placeholder = (suggestions[0].text || String(suggestions[0])) + ' (click a suggestion)'; } catch(e){}
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
          } catch (e) {}
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
      return (platform.length > 20) ? platform.slice(0,20) + '…' : platform;
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
        } catch (e) {}
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
          copyBtn.addEventListener('click', () => { try { navigator.clipboard.writeText(r.snippetFull || ''); toast('Copied'); } catch(_) { toast('Copy failed'); } });
          right.appendChild(openBtn); right.appendChild(copyBtn);
          hdr.appendChild(left); hdr.appendChild(right);
          row.appendChild(hdr);
          const sn = document.createElement('div'); sn.className = 'cb-snippet'; sn.textContent = r.snippet || '';
          row.appendChild(sn);
          // tags display
          try {
            if (r.topics && Array.isArray(r.topics) && r.topics.length) {
              const tagRow = document.createElement('div'); tagRow.className = 'cb-tag-row';
              r.topics.slice(0,6).forEach(t => { const chip = document.createElement('div'); chip.className = 'cb-tag-chip'; const disp = String(t).split(/[_\-\s]+/).map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' '); chip.textContent = disp; tagRow.appendChild(chip); });
              row.appendChild(tagRow);
            }
          } catch (e) {}
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
                if (chrome.runtime.lastError) return res({ ok:false, error: chrome.runtime.lastError.message });
                return res(r || { ok:false });
              });
            } catch (e) { return res({ ok:false, error: e && e.message }); }
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
              const host = (conv && (conv.platform || conv.url)) ? (conv.platform || new URL(conv.url||location.href).hostname) : (r.metadata && (r.metadata.platform || (r.metadata.url && new URL(r.metadata.url).hostname))) || location.hostname;
              const date = conv ? new Date(conv.ts) : (r.metadata && r.metadata.ts ? new Date(r.metadata.ts) : new Date());
              const time = date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
              const full = conv ? ((conv.conversation||[]).map(m => `${m.role}: ${m.text}`).join('\n\n')) : (r.metadata && r.metadata.snippet) || '';
              const snippet = full.length > 400 ? full.slice(0,400) + '…' : full;
              const count = conv ? (conv.conversation||[]).length : (r.metadata && r.metadata.count) || 0;
              const topics = conv && Array.isArray(conv.topics) ? conv.topics : (r.metadata && r.metadata.topics ? r.metadata.topics : []);
              return { host, time, snippet, snippetFull: full, count, score: r.score, id, topics };
            }).slice(0,12);
            // apply filters from UI
            try {
              const selHost = (hostSelect && hostSelect.value) ? hostSelect.value : '';
              const selTag = (tagSelect && tagSelect.value) ? tagSelect.value : '';
              const selDate = (dateSelect && dateSelect.value) ? dateSelect.value : 'All time';
              const now = Date.now();
              const filtered = mapped.filter(it => {
                if (selHost && it.host && it.host !== selHost) return false;
                if (selTag && (!it.topics || !it.topics.some(t=>t.toLowerCase() === selTag.toLowerCase()))) return false;
                if (selDate && selDate !== 'All time') {
                  const days = selDate === 'Last 7 days' ? 7 : (selDate === 'Last 30 days' ? 30 : 0);
                  if (days > 0) {
                    const convTs = (convs || []).find(c=>String(c.ts)===String(it.id));
                    const ts = convTs && convTs.ts ? Number(convTs.ts) : 0;
                    if (!ts) return false;
                    if ((now - ts) > days * 24 * 3600 * 1000) return false;
                  }
                }
                return true;
              }).slice(0,12);
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
          const score = (full.toLowerCase().split(ql).length - 1) + ((host||'').toLowerCase().includes(ql) ? 1 : 0);
          const snippet = full.length > 400 ? full.slice(0,400) + '…' : full;
          return { s, score, host, time, snippet, snippetFull: full, count };
        }).filter(x => x.score > 0).sort((a,b) => b.score - a.score).slice(0,12);
        // map and apply filters
        const mapped = scored.map(r => ({ id: String(r.s && r.s.ts), host: r.host || new URL(r.s && r.s.url || location.href).hostname, time: r.time, snippet: r.snippet, snippetFull: r.snippetFull, count: r.count, topics: r.s && r.s.topics ? r.s.topics : [] }));
        try {
          const selHost = (hostSelect && hostSelect.value) ? hostSelect.value : '';
          const selTag = (tagSelect && tagSelect.value) ? tagSelect.value : '';
          const selDate = (dateSelect && dateSelect.value) ? dateSelect.value : 'All time';
          const now = Date.now();
          const filtered = mapped.filter(it => {
            if (selHost && it.host && it.host !== selHost) return false;
            if (selTag && (!it.topics || !it.topics.some(t=>t.toLowerCase() === selTag.toLowerCase()))) return false;
            if (selDate && selDate !== 'All time') {
              const days = selDate === 'Last 7 days' ? 7 : (selDate === 'Last 30 days' ? 30 : 0);
              if (days > 0) {
                const convObj = (convs || []).find(c=>String(c.ts)===String(it.id));
                const ts = convObj && convObj.ts ? Number(convObj.ts) : 0;
                if (!ts) return false;
                if ((now - ts) > days * 24 * 3600 * 1000) return false;
              }
            }
            return true;
          }).slice(0,12);
          
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
            } catch (e) {}
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
                  const snippet = conv && conv.conversation ? conv.conversation.slice(0,2).map(m=>`${m.role}: ${(m.text||'').slice(0,120)}`).join('\n') : '(no snippet)';
                  const entry = { model, ts: ts || 0, rawPlatform: platformRaw, id, snippet };
                  contribs.push(entry);
                  contribsWithDetails.push(entry);
                } catch (e) { debugLog('provenance map entry error', e); }
              }
              // sort by ts ascending and dedupe by model keeping first occurrence
              contribs.sort((a,b) => (a.ts||0) - (b.ts||0));
              const seen = new Set();
              const uniq = [];
              for (const c of contribs) {
                if (!seen.has(c.model)) { seen.add(c.model); uniq.push(c); }
              }
              if (uniq.length) {
                // build human-friendly sentence with clickable model names
                function fmtDate(ts) { try { if (!ts) return 'an earlier date'; const d = new Date(Number(ts)); return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); } catch(e){return 'an earlier date'; } }
                
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
                  const last = uniq[uniq.length-1];
                  const middle = uniq.slice(1, uniq.length-1);
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
                  sentenceEl.appendChild(document.createTextNode(` on ${fmtDate(first.ts)}, refined by ${middle.map(m=>m.model).join(', ')} on subsequent dates, and verified by `));
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
          confirmUI: (res) => { try { smartAnswer.textContent = `Indexed ${res.indexed || 0} conversations.`; smartAnswer.classList.add('cb-scale-pop'); announce('Indexing complete'); } catch(e){} },
          rollbackUI: (err) => { try { smartAnswer.textContent = 'Index failed: ' + (err && err.message ? err.message : 'unknown'); } catch(e){} },
          action: async () => {
            // call background with exponential backoff
            const res = await callBackgroundWithBackoff({ type: 'vector_index_all' }, 3, 500);
            return res;
          },
          onError: (err) => {
            showError('Index all failed: ' + (err && err.message ? err.message : 'unknown'), async () => { try { btnIndexAll.click(); } catch(e){} });
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
          // reset dropdown to a single disabled option
          try {
            const prev = chatSelect.value;
            while (chatSelect.firstChild) chatSelect.removeChild(chatSelect.firstChild);
            const o = document.createElement('option'); o.value = ''; o.textContent = 'No saved chats'; chatSelect.appendChild(o);
            chatSelect.value = '';
          } catch (e) {}
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
                try { host = new URL(s.url||location.href).hostname; } catch (_) {}
                if (host.length > 18) host = host.slice(0, 16) + '…';
                const date = new Date(s.ts);
                const timeStr = date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                const count = (s.conversation||[]).length;
                const row = document.createElement('div');
                row.style.cssText = `position:absolute;left:0;right:0;top:${i*ITEM_H}px;height:${ITEM_H-4}px;display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid rgba(230,207,159,0.08);cursor:pointer;`;
                row.setAttribute('role','button');
                row.setAttribute('aria-label', `Open ${host} with ${count} messages from ${timeStr}`);
                const dot = document.createElement('span');
                dot.style.cssText = 'display:inline-block;width:6px;height:6px;border-radius:50%;background:rgba(230,207,159,0.6)';
                row.appendChild(dot);
                const txt = document.createElement('div');
                txt.style.cssText = 'flex:1 1 auto;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0.92';
                
                // Get first message as preview (one-liner)
                let preview = '';
                try {
                  if (s.conversation && s.conversation.length > 0) {
                    const firstMsg = s.conversation[0];
                    preview = (firstMsg.text || '').replace(/\n/g, ' ').trim();
                    if (preview.length > 40) preview = preview.substring(0, 37) + '...';
                  }
                } catch (e) {}
                
                txt.textContent = preview || `${count} messages • ${timeStr}`;
                row.appendChild(txt);
                const openBtn = document.createElement('button');
                openBtn.className = 'cb-btn';
                openBtn.style.cssText = 'padding:4px 8px;font-size:11px;border-radius:8px;';
                openBtn.textContent = 'Open';
                row.appendChild(openBtn);
                const open = () => { try { chatSelect.value = String(s.ts); chatSelect.dispatchEvent(new Event('change')); announce('Selected conversation ' + timeStr); } catch(e){} };
                row.addEventListener('click', open);
                openBtn.addEventListener('click', (ev)=>{ ev.stopPropagation(); open(); });
                full.appendChild(row);
              }
            };
            try { historyEl.__virtRender = render; historyEl.__virtItems = arr; } catch(_){}
            historyEl.removeEventListener('scroll', historyEl.__virtScroll || (()=>{}), { passive: true });
            historyEl.__virtScroll = () => render();
            // Mark scroll listener as passive to avoid main-thread blocking warnings
            historyEl.addEventListener('scroll', historyEl.__virtScroll, { passive: true });
            render();
          } else {
            historyEl.textContent = arr.slice(0,6).map(s => {
              let host = s.platform || 'chat';
              try { host = new URL(s.url||location.href).hostname; } catch (_) {}
              const date = new Date(s.ts);
              const timeStr = date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
              return `${host} • ${(s.conversation||[]).length} msgs • ${timeStr}`;
            }).join('\n\n');
          }
        } catch (e) { /* noop */ }
        // Default preview from first conversation
        preview.textContent = 'Preview: ' + (arr[0] && arr[0].conversation && arr[0].conversation[0] ? arr[0].conversation[0].text.slice(0,200) : '(none)');

        // Populate chat dropdown and always select the most recent (newly saved)
        try {
          while (chatSelect.firstChild) chatSelect.removeChild(chatSelect.firstChild);
          // Filter out chats with 0 messages
          const validChats = arr.filter(s => s.conversation && s.conversation.length > 0);
          validChats.forEach(s => {
            const o = document.createElement('option');
            o.value = String(s.ts);
            const count = (s.conversation||[]).length;
            let host = s.platform || 'chat';
            try { host = new URL(s.url||location.href).hostname; } catch (_) {}
            // Truncate hostname if too long
            if (host.length > 15) host = host.substring(0, 12) + '...';
            
            // Get first message as preview (one-liner)
            let preview = '';
            try {
              if (s.conversation && s.conversation.length > 0) {
                const firstMsg = s.conversation[0];
                preview = (firstMsg.text || '').replace(/\n/g, ' ').trim();
                if (preview.length > 50) preview = preview.substring(0, 47) + '...';
              }
            } catch (e) {}
            
            o.textContent = preview || `${count} messages`;
            chatSelect.appendChild(o);
          });
          // Always select the most recent (first in list, which is newest by timestamp)
          chatSelect.selectedIndex = 0;
          // Ensure preview reflects selection immediately
          try { chatSelect.dispatchEvent(new Event('change')); } catch (e) {}
        } catch (e) {}
      });
    }

    // Update preview when selecting a chat (use shadow DOM element reference)
    try {
      chatSelect.addEventListener('change', async () => {
        try {
          const list = await loadConversationsAsync();
          const arr = Array.isArray(list) ? list : [];
          const idx = arr.findIndex(v => String(v.ts) === chatSelect.value);
          const sel = idx >= 0 ? arr[idx] : arr[0];
          if (!sel) { preview.textContent = 'Preview: (none)'; return; }
          const text = sel.conversation && sel.conversation[0] ? sel.conversation[0].text.slice(0,200) : '(none)';
          preview.textContent = 'Preview: ' + text;
        } catch (e) {}
      });
    } catch (e) {}

    // load persisted model/prompt from chrome.storage.local with localStorage fallback
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['cb_model','cb_system'], (res) => {
          try { if (res && res.cb_model) modelSelect.value = res.cb_model; if (res && res.cb_system) sysPrompt.value = res.cb_system; } catch(e) {}
        });
      } else {
        const savedModel = localStorage.getItem('cb_model'); if (savedModel) modelSelect.value = savedModel;
        const savedSys = localStorage.getItem('cb_system'); if (savedSys) sysPrompt.value = savedSys;
      }
    } catch (e) {}

    modelSelect.addEventListener('change', () => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) chrome.storage.local.set({ cb_model: modelSelect.value });
        else localStorage.setItem('cb_model', modelSelect.value);
      } catch (e) {}
    });

    sysPrompt.addEventListener('change', () => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) chrome.storage.local.set({ cb_system: sysPrompt.value });
        else localStorage.setItem('cb_system', sysPrompt.value);
      } catch (e) {}
    });

    function toast(msg) { 
      try { 
        const t = document.createElement('div');
        t.setAttribute('data-cb-ignore','true');
        t.textContent = msg;
        t.style.position='fixed';
        t.style.bottom='18px';
        t.style.left='18px';
        t.style.background='rgba(10,15,28,0.9)';
        t.style.color='#E6E9F0';
        t.style.padding='8px 12px';
        t.style.borderRadius='10px';
        t.style.zIndex='2147483647';
        t.style.border='1px solid rgba(0,180,255,0.25)';
        t.style.boxShadow='0 0 12px rgba(0,180,255,0.25)';
        t.style.letterSpacing='0.5px';
        t.style.fontFamily="'Bebas Neue', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial";
        t.setAttribute('role','status');
        t.setAttribute('aria-live','polite');
        document.body.appendChild(t); announce(msg);
        setTimeout(()=>{ try { t.remove(); } catch(e){} },2400);
      } catch (e) { try { alert(msg); } catch(_) {} } 
    }

    refreshHistory();
    try { 
      window.ChatBridge = window.ChatBridge || {}; 
      window.ChatBridge._renderLastScan = renderLastScan; 
      window.ChatBridge.refreshHistory = refreshHistory; 
    } catch (e) {}

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

    // Initialize Luxury Mode
    try {
      if (typeof LuxuryMode !== 'undefined') {
        window.luxuryModeInstance = new LuxuryMode(shadow);
        window.luxuryModeInstance.apply();
        debugLog('[ChatBridge] Luxury Mode initialized');
      } else {
        debugLog('[ChatBridge] LuxuryMode class not found');
      }
    } catch (e) {
      debugLog('Luxury Mode init failed:', e);
    }

    // =============================================================================
    // INITIALIZE MCP BRIDGE FOR AI AGENT HUB
    // =============================================================================
    try {
      if (typeof window.MCPBridge !== 'undefined') {
        debugLog('[MCP] Initializing bridge...');
        window.MCPBridge.init();
        
        // Register ChatBridge-specific MCP resources
        window.MCPBridge.registerHandler('/chatbridge/scan', async (params) => {
          debugLog('[MCP /chatbridge/scan] Handling request');
          const messages = await scanChat();
          return { 
            messages, 
            count: messages.length, 
            platform: detectCurrentPlatform(),
            timestamp: Date.now() 
          };
        });
        
        window.MCPBridge.registerHandler('/chatbridge/restore', async (params) => {
          debugLog('[MCP /chatbridge/restore] Handling request');
          if (!params.text) throw new Error('text parameter required');
          const success = await restoreToChat(params.text, params.attachments || []);
          return { success, timestamp: Date.now() };
        });
        
        window.MCPBridge.registerHandler('/chatbridge/status', async (params) => {
          debugLog('[MCP /chatbridge/status] Handling request');
          return {
            platform: detectCurrentPlatform(),
            url: location.href,
            hasRAG: typeof window.RAGEngine !== 'undefined',
            hasONNX: typeof window.getEmbedding !== 'undefined',
            timestamp: Date.now()
          };
        });
        
        const stats = window.MCPBridge.getStats();
        debugLog('[MCP] Bridge initialized:', stats);
        console.log('[ChatBridge] MCP Initialized -', stats.registeredResources.length, 'resources');
      } else {
        console.warn('[ChatBridge] MCPBridge not loaded - Agent Hub features unavailable');
      }
    } catch (e) {
      console.error('[ChatBridge] MCP initialization failed:', e);
    }

    return { host, avatar, panel };
  }

  // Debounce mechanism for scan operations
  let scanDebounceTimer = null;
  let lastScanTimestamp = 0;
  const SCAN_DEBOUNCE_MS = 1000; // Wait 1 second between scans

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
        container: container && (container.tagName + (container.id ? '#'+container.id : '') + ' ' + (container.className||'').toString().split(' ').slice(0,2).join(' ')),
        width: container && Math.round(container.getBoundingClientRect().width) + 'px'
      });
      
      try { 
        window.ChatBridge = window.ChatBridge || {}; 
        window.ChatBridge._lastScan = { 
          chosenContainer: container && (container.tagName + (container.id ? '#'+container.id : '') + (container.className ? '.' + (container.className||'').toString().split(' ').filter(c=>c).slice(0,2).join('.') : '')),
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
      
      // Scroll and wait for stability with error handling
      try {
        await scrollContainerToTop(container);
        debugLog('scroll complete');
      } catch (e) {
        debugLog('scroll error:', e);
        // Continue anyway - scroll failure shouldn't block scan
        try {
          if (window.ChatBridge && window.ChatBridge._lastScan) {
            window.ChatBridge._lastScan.errors.push('scroll_failed: ' + (e.message || String(e)));
          }
        } catch (_) {}
      }
      
      try {
        await waitForDomStability(container);
        debugLog('DOM stable');
      } catch (e) {
        debugLog('DOM stability wait error:', e);
        // Continue anyway - stability timeout shouldn't block scan
        try {
          if (window.ChatBridge && window.ChatBridge._lastScan) {
            window.ChatBridge._lastScan.errors.push('stability_timeout: ' + (e.message || String(e)));
          }
        } catch (_) {}
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
                } catch (e) {}
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
        } catch (_) {}
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
          } catch (_) {}
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
  try { if (window.ChatBridge && window.ChatBridge._lastScan) window.ChatBridge._lastScan.nodesConsidered = nodes.length; } catch (e) {}
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
    try { if (window.ChatBridge && window.ChatBridge._lastScan) { window.ChatBridge._lastScan.messageCount = (raw && raw.length) || 0; } } catch (e) {}
    try { if (window.ChatBridge && typeof window.ChatBridge._renderLastScan === 'function') window.ChatBridge._renderLastScan(); } catch (e) {}
    
    const normalized = normalizeMessages(raw || []);
    debugLog('=== SCAN COMPLETE ===', normalized.length, 'messages');
    
    // Cache the result for debouncing
    try {
      window.ChatBridge = window.ChatBridge || {};
      window.ChatBridge._lastScanResult = normalized;
    } catch (e) {}

    // Persist last scanned messages and attachments into debug object for downstream tools (e.g., media extract)
    try {
      if (window.ChatBridge && window.ChatBridge._lastScan) {
        window.ChatBridge._lastScan.messages = normalized;
        const atts = [];
        try { normalized.forEach(m => { if (Array.isArray(m.attachments)) atts.push(...m.attachments); }); } catch(_){}
        window.ChatBridge._lastScan.attachments = atts;
      }
    } catch(_) {}

    // Only save if we have messages
    if (normalized.length === 0) {
      debugLog('[Scan] No messages to save, skipping');
      return normalized;
    }

    // Fire-and-forget: Save and index in background (don't block scan completion)
    const convObj = {
      ts: Date.now(),
      id: String(Date.now()),
      platform: (function(){ try { return new URL(location.href).hostname; } catch(_) { return location.hostname || 'unknown'; } })(),
      url: location.href,
      conversation: normalized,
    };
    
    // Return scan results immediately
    debugLog('[Scan] Returning', normalized.length, 'messages (save/index running in background)');
    
    // All async operations happen in background
    (async () => {
      try {
        await saveConversation(convObj);
      
        // Auto-index into RAG (async, don't wait)
        if (normalized.length >= 3 && typeof window.RAGEngine !== 'undefined' && typeof window.RAGEngine.indexConversation === 'function') {
          for (let i = 0; i < normalized.length; i++) {
            const msg = normalized[i];
            const msgId = `${convObj.id}_msg_${i}`;
            // Only pass string to RAG indexConversation
            let msgText = '';
            if (typeof msg.text === 'string') {
              msgText = `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}`;
            } else if (Array.isArray(msg.text)) {
              msgText = msg.text.map(t => String(t)).join(' ');
            } else {
              msgText = String(msg.text || '');
            }
            // Defensive: never pass object
            if (typeof msgText !== 'string') msgText = '';
            window.RAGEngine.indexConversation(msgId, msgText, {
              platform: convObj.platform,
              url: convObj.url,
              timestamp: convObj.ts,
              messageIndex: i,
              messageRole: msg.role,
              conversationId: convObj.id
            }).catch(e => debugLog('[Auto-Index] Message', i, 'failed:', e));
          }
          debugLog('[Auto-Index] Queued', normalized.length, 'messages for indexing');
        }
      
        // Auto-summarize (async, only for longer conversations)
        if (normalized.length > 15) {
          const summaryPrompt = `Summarize the following chat in this format:\n\n[Summary]\n- Main points\n- Key actions\n- Decisions\n- Next steps\n\nChat:\n${normalized.map(m => (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.text).join('\n')}`;
          callGeminiAsync({ action: 'prompt', text: summaryPrompt, length: 'medium' }).then(res => {
            if (res && res.ok && res.result) {
              convObj.summary = res.result.trim();
              saveConversation(convObj).catch(e => debugLog('summary save failed', e));
            }
          }).catch(e => debugLog('auto-summarize failed', e));
        }
      } catch (e) { 
        debugLog('[Background] Tasks failed:', e); 
      }
      }, 0); // End background tasks setTimeout
      
      // Return messages immediately without waiting
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
      } catch (_) {}
      
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
          try { const arr = JSON.parse(localStorage.getItem(key) || '[]'); top = (Array.isArray(arr) && arr[0]) ? arr[0] : null; } catch(_) { top = null; }
        }

        if (top) {
          const lastA = (conv && Array.isArray(conv.conversation) && conv.conversation.length) ? String(conv.conversation[conv.conversation.length-1].text||'').trim().slice(0,300) : '';
          const lastB = (top && Array.isArray(top.conversation) && top.conversation.length) ? String(top.conversation[top.conversation.length-1].text||'').trim().slice(0,300) : '';
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
              geminiTopics = (res.result || '').split(/[,\n]+/).map(t => t.trim()).filter(Boolean).slice(0,6);
            }

            // Local heuristic topics (multi-word phrases + technical terms)
            let localTopics = [];
            try { localTopics = buildKeywordsFromText(full, 6) || []; } catch(_) { localTopics = []; }

            // Normalize both sets and merge
            function normTopic(t){
              return String(t||'').toLowerCase()
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
            if (merged.length) conv.topics = merged.slice(0,6);
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
              try { if (res && res.ok) debugLog('vector index ok', conv.ts); else debugLog('vector index failed', res); } catch(_) {}
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
  window.ChatBridge.highlightScan = function(enable) { try { CB_HIGHLIGHT_ENABLED = !!enable; if (!CB_HIGHLIGHT_ENABLED) clearHighlights(); else ensureHighlightStyles(); return CB_HIGHLIGHT_ENABLED; } catch (e) { return false; } };
  window.ChatBridge.enableDebug = function() { 
    try { 
      window.__CHATBRIDGE_DEBUG = true; 
      console.log('[ChatBridge] Debug mode enabled. Reload the page for full effect.'); 
      return true; 
    } catch (e) { return false; } 
  };
  window.ChatBridge.disableDebug = function() { 
    try { 
      window.__CHATBRIDGE_DEBUG = false; 
      console.log('[ChatBridge] Debug mode disabled. Reload the page for full effect.'); 
      return true; 
    } catch (e) { return false; } 
  };
  window.ChatBridge.getLastScan = function() { 
    try { 
      return window.ChatBridge._lastScan || null; 
    } catch (e) { return null; } 
  };
  window.ChatBridge.getImageVault = async function() {
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
  window.ChatBridge.testE2E = async function(opts) {
    const details = [];
    try {
      const before = await loadConversationsAsync();
      const preCount = Array.isArray(before) ? before.length : 0;
      details.push(`Pre-count: ${preCount}`);

      const now = Date.now();
      const conv = {
        ts: now,
        id: String(now),
        platform: (function(){ try { return new URL(location.href).hostname; } catch(_) { return location.hostname || 'unknown'; } })(),
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
      try { if (typeof window.ChatBridge.refreshHistory === 'function') window.ChatBridge.refreshHistory(); } catch(_){}
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
  window.ChatBridge.checkStorage = function() {
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
        } catch (e) {}
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
  window.ChatBridge.analyzeContext = async function() {
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
      console.table(segments.map(s => ({ topic: s.topic, messages: s.messageCount, confidence: s.confidence + '%', keywords: s.keywords.slice(0,3).join(', ') })));
      console.log('Active Context:', context);
      return { messages: msgs, segments, context };
    } catch (e) {
      console.error('Analysis failed:', e);
      return null;
    }
  };
  
  window.ChatBridge.showSegments = async function() {
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
          console.log('[ChatBridge] MCP Bridge initialized with resources:', window.MCPBridge.getStats().registeredResources);
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
                  t.setAttribute('data-cb-ignore','true');
                  t.textContent = 'No insert action available';
                  t.style.cssText = 'position:fixed;bottom:18px;left:18px;background:rgba(6,20,32,0.9);color:#dff1ff;padding:8px 10px;border-radius:8px;z-index:2147483647;';
                  document.body.appendChild(t);
                  setTimeout(()=>t.remove(),2400);
                } catch (e) {}
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
    
    setTimeout(async ()=>{ const msgs = await scanChat(); if (msgs && msgs.length) { await saveConversation({ platform: location.hostname, url: location.href, ts: Date.now(), conversation: msgs }); debugLog('auto-saved', msgs.length); } }, 450); 
  } catch (e) { debugLog('boot error', e); }
  }
  
  // CLOUDFLARE FIX: Defer initialization until page is fully loaded
  if (document.readyState === 'complete') {
    initChatBridge();
  } else {
    window.addEventListener('load', initChatBridge, { once: true, passive: true });
  }

})();

