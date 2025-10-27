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
    return APPROVED_SITES.some(site => hostname === site || hostname.endsWith('.' + site));
  }

  // Exit early if not on approved site
  if (!isApprovedSite()) {
    console.log('[ChatBridge] Not on approved site, skipping injection. Current:', window.location.hostname);
    return;
  }

  console.log('[ChatBridge] Injecting on approved site:', window.location.hostname);

  // avoid const redeclaration causing SyntaxError in some injection scenarios
  var CB_MAX_MESSAGES = (typeof window !== 'undefined' && window.__CHATBRIDGE && window.__CHATBRIDGE.MAX_MESSAGES) ? window.__CHATBRIDGE.MAX_MESSAGES : 200;
  const DOM_STABLE_MS = 600;
  const DOM_STABLE_TIMEOUT_MS = 8000;
  const SCROLL_MAX_STEPS = 25;
  const SCROLL_STEP_PAUSE_MS = 320;
  const DEBUG = !!(typeof window !== 'undefined' && window.__CHATBRIDGE_DEBUG === true);

  function debugLog(...args) { if (!DEBUG) return; try { console.debug('[ChatBridge]', ...args); } catch (e) {} }

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
            <text x="50%" y="52%" text-anchor="middle" fill="#0b0f17" font-family="Poppins, Arial, sans-serif" font-weight="700" font-size="12">CB</text>
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

  // Loading helpers for buttons
  function addLoadingToButton(btn, label) {
    try {
      if (!btn) return;
      if (!btn.getAttribute('data-orig-text')) btn.setAttribute('data-orig-text', btn.innerHTML || btn.textContent || '');
      btn.disabled = true;
      btn.classList.add('cb-loading');
      // spinner + label
      btn.innerHTML = `<span class="cb-spinner" aria-hidden="true"></span> ${label}`;
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
      document.querySelectorAll('.cb-scan-highlight').forEach(n => { try { n.classList.remove('cb-scan-highlight'); } catch(e){} });
      document.querySelectorAll('.cb-scan-label').forEach(n => { try { n.remove(); } catch(e){} });
    } catch (e) {}
  }

  function highlightNodesByElements(elems) {
    try {
      if (!elems || !elems.length) return;
      ensureHighlightStyles(); clearHighlights();
      CB_HIGHLIGHT_ROOT = document.createElement('div'); CB_HIGHLIGHT_ROOT.id = 'cb-scan-highlights'; CB_HIGHLIGHT_ROOT.setAttribute('data-cb-ignore','true');
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
          window.scrollTo({ top: 0, behavior: 'auto' }); await new Promise(r => setTimeout(r, stepPause));
        }
        window.scrollTo({ top: 0, behavior: 'auto' }); return;
      }
      for (let i = 0; i < maxSteps; i++) {
        const cur = container.scrollTop; if (cur <= 0) break;
        container.scrollTop = Math.max(0, cur - Math.ceil(container.clientHeight * 0.85));
        await new Promise(r => setTimeout(r, stepPause));
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

  // Extract attachments (images, videos, docs) from a message element
  function extractAttachmentsFromElement(root) {
    const atts = [];
    if (!root || !root.querySelectorAll) return atts;
    try {
      // Images
      const imgs = Array.from(root.querySelectorAll('img[src]'));
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
      const vids = Array.from(root.querySelectorAll('video[src], video source[src]'));
      for (const v of vids) {
        try {
          const src = v.getAttribute('src') || '';
          if (!src) continue;
          atts.push({ kind: 'video', url: src, name: (src.split('?')[0].split('#')[0].split('/').pop() || 'video') });
        } catch (e) {}
      }
      // Docs/links
      const exts = /(\.pdf|\.docx?|\.pptx?|\.xlsx?|\.zip|\.rar|\.7z|\.csv|\.md|\.txt)$/i;
      const links = Array.from(root.querySelectorAll('a[href]'));
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
      const text = (m.text || '').replace(/\s+/g, ' ').trim(); if (!text) continue;
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
  }

  function injectUI() {
    // If host already exists, ensure avatar is present (in case it was removed)
    if (document.getElementById('cb-host')) {
      try { ensureAvatarExists(); } catch (e) {}
      return null;
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
  avatar.addEventListener('mouseenter', () => { try { avatar.style.transform = 'translateY(-2px)'; avatar.style.boxShadow = '0 10px 26px rgba(230,207,159,0.18)'; } catch(e){} });
  avatar.addEventListener('mouseleave', () => { try { avatar.style.transform = ''; avatar.style.boxShadow = '0 6px 20px rgba(0,0,0,0.18)'; } catch(e){} });
    const host = document.createElement('div'); host.id = 'cb-host'; host.setAttribute('data-cb-ignore', 'true'); host.style.display = 'none';
    document.body.appendChild(avatar); document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    // High-end professional dark theme styling inside shadow DOM (Poppins font)
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
      :host { all: initial; }
  :host { --cb-accent: #d4af77; --cb-champagne: #e6cf9f; --cb-champagne-rgb: 230,207,159; }
      :host * { font-family: 'Poppins', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial !important; }
  .cb-panel { box-sizing: border-box; position:fixed; top:12px; right:12px; width:380px; max-height:86vh; overflow-y:auto; overflow-x:hidden; border-radius:14px; background: linear-gradient(180deg, rgba(9,13,22,0.97), rgba(8,18,34,0.98)); color:var(--cb-accent) !important; font-family: 'Poppins', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; z-index:2147483647; box-shadow: 0 12px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); backdrop-filter: blur(10px); }
  .cb-panel::-webkit-scrollbar { width: 10px; }
  .cb-panel::-webkit-scrollbar-track { background: #0b0f17; border-radius: 10px; }
  .cb-panel::-webkit-scrollbar-thumb { background: linear-gradient(180deg, rgba(212,175,119,0.8), rgba(212,175,119,0.55)); border-radius: 10px; border: 2px solid #0b0f17; }
  .cb-panel::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, rgba(212,175,119,1), rgba(212,175,119,0.7)); }
  .cb-header { display:flex; flex-direction:row; align-items:flex-start; justify-content:space-between; padding:14px 18px 8px 18px; gap:6px; border-bottom: 1px solid rgba(255,255,255,0.04); }
  .cb-title { font-weight:900; font-size:22px; letter-spacing:0.5px; color: var(--cb-champagne); text-shadow:0 2px 12px rgba(0,0,0,0.4); }
  .cb-subtitle { font-size:13px; color: var(--cb-accent); font-weight:500; margin-top:2px; margin-bottom:2px; letter-spacing:0.3px; }
    .cb-actions { padding:12px 16px 8px 16px; display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:space-between; }
  .cb-actions-left, .cb-actions-right { display:flex; gap:8px; align-items:center; }
  .cb-actions .cb-btn { min-width:0; padding:10px 14px; }
    .cb-btn { background: linear-gradient(180deg, rgba(40,40,60,0.98), rgba(20,20,30,0.98)); border:1px solid rgba(255,255,255,0.12); color:#d4af77 !important; padding:10px 14px; border-radius:10px; cursor:pointer; font-size:14px; transition: all .15s ease; font-weight:600; }
  .cb-btn:hover { transform:translateY(-1px); box-shadow: 0 8px 18px rgba(var(--cb-champagne-rgb),0.14); border-color: rgba(255,255,255,0.22); background: linear-gradient(180deg, #2a2a3a, #18181f); }
  .cb-btn-primary { background: linear-gradient(180deg, #f3e4b9, #d2b478); color:#000 !important; font-weight:700; border: 1px solid rgba(0,0,0,0.18); }
  .cb-btn-primary:hover { box-shadow: 0 10px 24px rgba(var(--cb-champagne-rgb),0.20); }
  .cb-scan-row { padding: 10px 16px; }
  .cb-scan-wide { width: 100%; margin: 0; padding:12px 14px; font-size:15px; border-radius:12px; display:block; }
      .cb-btn-danger { background: linear-gradient(180deg, rgba(60,20,20,0.95), rgba(40,15,15,0.95)); border:1px solid rgba(255,100,100,0.25); color:rgba(255,180,180,0.75) !important; font-size:13px; padding:6px 10px; }
      .cb-btn-danger:hover { background: linear-gradient(180deg, rgba(80,25,25,0.95), rgba(50,18,18,0.95)); border-color: rgba(255,120,120,0.4); color:rgba(255,200,200,0.9) !important; box-shadow: 0 4px 12px rgba(200,50,50,0.15); }
      .cb-toolbar { display:flex; align-items:center; gap:10px; padding:12px 18px 8px 18px; border-bottom: 1px solid rgba(255,255,255,0.04); }
      .cb-label { font-size:12px; color:#d4af77 !important; }
  .cb-select { flex:1; appearance:none; background:#0b0f17; color:#d4af77 !important; border:1px solid rgba(255,255,255,0.18); border-radius:10px; padding:10px 12px; font-size:14px; outline:none; font-weight:500; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cb-select:hover { border-color: #d2b478; box-shadow: 0 0 0 3px rgba(210, 180, 120, 0.12); }
  select.cb-select option { background:#0b0f17; color:#d4af77; }
      .cb-status { padding:0 18px 10px 18px; font-size:12px; color:#d4af77 !important; }
      .cb-history-wrapper { position: relative; margin:12px; }
      .cb-history-header { display:flex; align-items:center; justify-content:space-between; padding:0 0 8px 0; }
      .cb-history-title { font-size:12px; color:#d4af77 !important; font-weight:600; letter-spacing:0.3px; }
      .cb-history { padding:12px 18px; max-height:260px; overflow-x:hidden; overflow-y:auto; font-size:13px; background: rgba(20,20,30,0.18); border-radius:10px; white-space:pre-wrap; color:#d4af77 !important; line-height: 1.5; }
      .cb-history::-webkit-scrollbar { width: 8px; }
      .cb-history::-webkit-scrollbar-track { background: rgba(20,20,30,0.4); border-radius: 10px; }
  .cb-history::-webkit-scrollbar-thumb { background: linear-gradient(180deg, rgba(230,207,159,0.6), rgba(230,207,159,0.4)); border-radius: 10px; border: 2px solid rgba(20,20,30,0.4); }
  .cb-history::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, rgba(230,207,159,0.8), rgba(230,207,159,0.6)); }
      .cb-preview { padding:12px 18px; font-size:13px; color:#d4af77 !important; border-top:1px solid rgba(255,255,255,0.04); max-height:200px; overflow-x:hidden; overflow-y:auto; line-height: 1.5; }
      .cb-preview::-webkit-scrollbar { width: 8px; }
      .cb-preview::-webkit-scrollbar-track { background: rgba(20,20,30,0.4); border-radius: 10px; }
      .cb-preview::-webkit-scrollbar-thumb { background: linear-gradient(180deg, rgba(212,175,119,0.6), rgba(212,175,119,0.4)); border-radius: 10px; border: 2px solid rgba(20,20,30,0.4); }
      .cb-preview::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, rgba(212,175,119,0.8), rgba(212,175,119,0.6)); }
      .cb-footer { display:flex; justify-content:flex-end; gap:10px; padding:12px 18px }
  .cb-close { background:transparent; border:none; color:#d4af77 !important; cursor:pointer; font-size:15px; padding:6px; position:absolute; top:8px; right:10px; }
  .cb-header { padding-right: 42px; }
      textarea { background: #181c2a; color: #d4af77 !important; border: 1px solid rgba(255,255,255,0.18); border-radius: 10px; font-size:14px; padding:10px; font-family:inherit; max-height:200px; overflow-x:hidden; overflow-y:auto; }
      textarea::-webkit-scrollbar { width: 8px; }
      textarea::-webkit-scrollbar-track { background: rgba(20,20,30,0.4); border-radius: 10px; }
      textarea::-webkit-scrollbar-thumb { background: linear-gradient(180deg, rgba(212,175,119,0.6), rgba(212,175,119,0.4)); border-radius: 10px; border: 2px solid rgba(20,20,30,0.4); }
      textarea::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, rgba(212,175,119,0.8), rgba(212,175,119,0.6)); }
      textarea:focus { outline: 2px solid #d2b478; }
      select:focus { outline: 2px solid #d2b478; }
      /* Internal view sections - inline in the sidebar */
      .cb-internal-view { display: none; padding: 14px 18px; border-top: 1px solid rgba(255,255,255,0.06); background: rgba(6,10,18,0.3); }
      .cb-internal-view.cb-view-active { display: block; }
      .cb-view-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
      .cb-view-close { background:transparent; border:1px solid rgba(255,255,255,0.06); color:#d4af77; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:12px; }
      .cb-view-close:hover { background:rgba(255,255,255,0.04); }
      .cb-view-title { font-weight:700; font-size:14px; color:#ffe7b3; }
      .cb-view-select { margin:8px 0 12px 0; width:100%; }
  .cb-view-text { width:100%; min-height:140px; max-height:200px; resize:vertical; background:#0b0f17; color:#e8d6b0; border:1px solid rgba(255,255,255,0.06); padding:10px; border-radius:8px; font-family:inherit; white-space:pre-wrap; overflow-y:auto; overflow-x:hidden; font-size:12px; line-height:1.4; }
  .cb-view-text::-webkit-scrollbar { width: 8px; }
  .cb-view-text::-webkit-scrollbar-track { background: #0b0f17; border-radius: 10px; }
  .cb-view-text::-webkit-scrollbar-thumb { background: linear-gradient(180deg, rgba(212,175,119,0.8), rgba(212,175,119,0.55)); border-radius: 10px; border: 2px solid #0b0f17; }
  .cb-view-text::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, rgba(212,175,119,1), rgba(212,175,119,0.7)); }
      .cb-view-controls { margin:12px 0; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
      .cb-view-go { margin-top:10px; }
  .cb-view-result { margin-top:14px; padding:12px; background: rgba(20,20,30,0.18); border-radius:10px; white-space:pre-wrap; color:#d4af77; font-size:12px; line-height:1.4; max-height:200px; overflow-y:auto; overflow-x:hidden; }
  .cb-progress { display:inline-block; margin-left:10px; font-size:12px; color:#d4af77; opacity:0.9; }
  .cb-dots { display:inline-block; }
  .cb-dots .dot { display:inline-block; opacity:0.25; animation: cb-ellipsis 1.1s ease-in-out infinite; }
  .cb-dots .dot:nth-child(2) { animation-delay: .18s; }
  .cb-dots .dot:nth-child(3) { animation-delay: .36s; }
  /* small inline spinner used with loading buttons */
  .cb-spinner { display:inline-block; width:14px; height:14px; border-radius:50%; vertical-align:middle; margin-right:8px; background: conic-gradient(rgba(var(--cb-champagne-rgb),0.95), rgba(255,255,255,0.9)); box-shadow: 0 0 0 1px rgba(0,0,0,0.08) inset; animation: cb-spin 0.9s linear infinite; }
  @keyframes cb-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes cb-ellipsis { 0% { opacity:0.25; transform: translateY(0); } 30% { opacity:1; transform: translateY(-2px); } 60% { opacity:0.25; transform: translateY(0); } 100% { opacity:0.25; transform: translateY(0); } }
    `;
    shadow.appendChild(style);

  const panel = document.createElement('div'); panel.className = 'cb-panel';
    // Header: Title and subtitle
    const header = document.createElement('div'); header.className = 'cb-header';
  const title = document.createElement('div'); title.className = 'cb-title'; title.textContent = 'ChatBridge';
  const subtitle = document.createElement('div'); subtitle.className = 'cb-subtitle'; subtitle.textContent = 'Effortlessly continue conversations across models';
  const left = document.createElement('div');
  left.style.display = 'flex'; left.style.flexDirection = 'column'; left.style.gap = '6px'; left.style.alignItems = 'flex-start';
  left.appendChild(title); left.appendChild(subtitle);
  const controls = document.createElement('div'); controls.style.display = 'flex'; controls.style.alignItems = 'flex-start';
  const btnClose = document.createElement('button'); btnClose.className = 'cb-close'; btnClose.textContent = '✕';
  controls.appendChild(btnClose);
  header.appendChild(left);
  header.appendChild(controls);
    panel.appendChild(header);

  // Actions: Scan, Restore, Gemini APIs
  const actions = document.createElement('div'); actions.className = 'cb-actions';
  const actionsLeft = document.createElement('div'); actionsLeft.className = 'cb-actions-left';
  const actionsRight = document.createElement('div'); actionsRight.className = 'cb-actions-right';

  const btnScan = document.createElement('button'); btnScan.className = 'cb-btn cb-btn-primary cb-scan-wide'; btnScan.textContent = 'Scan Chat'; btnScan.title = 'Scan the visible chat on the page'; btnScan.id = 'btnScan';
  const btnRestore = document.createElement('button'); btnRestore.className = 'cb-btn'; btnRestore.textContent = 'Restore'; btnRestore.title = 'Restore saved conversation into current chat';
  const btnClipboard = document.createElement('button'); btnClipboard.className = 'cb-btn'; btnClipboard.textContent = 'Clipboard'; btnClipboard.title = 'Copy scanned chat to clipboard';
  const btnSmartQuery = document.createElement('button'); btnSmartQuery.className = 'cb-btn'; btnSmartQuery.textContent = 'Smart Query'; btnSmartQuery.title = 'Search and ask your saved chats'; btnSmartQuery.id = 'btnSmartQuery';
  const btnFindConnections = document.createElement('button'); btnFindConnections.className = 'cb-btn'; btnFindConnections.textContent = 'Find Connections'; btnFindConnections.title = 'Find related past conversations based on current context'; btnFindConnections.id = 'btnFindConnections';

  // Gemini API buttons (keep on the right)
  // Sync Tone: replace old Prompt button with a model-to-model tone sync UI
  const syncWrapper = document.createElement('div'); syncWrapper.style.display = 'flex'; syncWrapper.style.alignItems = 'center'; syncWrapper.style.gap = '6px';

  // Replace compact main-page model selects with a single Sync Tone launcher button to reduce UI clutter
  const btnSyncTone = document.createElement('button'); btnSyncTone.className = 'cb-btn'; btnSyncTone.textContent = 'Sync Tone'; btnSyncTone.title = 'Rewrite the scanned conversation to match another model\'s tone';
  syncWrapper.appendChild(btnSyncTone);
  const btnSummarize = document.createElement('button'); btnSummarize.className = 'cb-btn'; btnSummarize.textContent = 'Summarize'; btnSummarize.title = 'Distill long chats into short summaries';
  const btnRewrite = document.createElement('button'); btnRewrite.className = 'cb-btn'; btnRewrite.textContent = 'Rewrite'; btnRewrite.title = 'Improve tone and readability of scraped messages';
  const btnTranslate = document.createElement('button'); btnTranslate.className = 'cb-btn'; btnTranslate.textContent = 'Translate'; btnTranslate.title = 'Translate chats between languages';

  // Place Scan button prominently in its own row below the header
  try {
    const scanRow = document.createElement('div'); scanRow.className = 'cb-scan-row';
    scanRow.appendChild(btnScan);
    panel.appendChild(scanRow);
  } catch (e) { try { actionsLeft.appendChild(btnScan); } catch (e2) {} }
  actionsLeft.appendChild(btnRestore);
  // user requested Clipboard and Sync Tone swap: put Sync Tone on the left actions
  actionsLeft.appendChild(syncWrapper);
  actionsLeft.appendChild(btnSmartQuery);
  actionsLeft.appendChild(btnFindConnections);
  // move Clipboard to the right-side group
  actionsRight.appendChild(btnClipboard);
  actionsRight.appendChild(btnSummarize);
  actionsRight.appendChild(btnRewrite);
  actionsRight.appendChild(btnTranslate);
  actions.appendChild(actionsLeft);
  actions.appendChild(actionsRight);
  panel.appendChild(actions);

    // Toolbar with Chat dropdown
    const toolbar = document.createElement('div'); toolbar.className = 'cb-toolbar';
  const lab = document.createElement('div'); lab.className = 'cb-label'; lab.textContent = 'Select Chat';
    const chatSelect = document.createElement('select'); chatSelect.className = 'cb-select'; chatSelect.id = 'cb-chat-select';
    toolbar.appendChild(lab); toolbar.appendChild(chatSelect);
    panel.appendChild(toolbar);

  // Toolbar preview (moved above the Gemini textarea)
  const preview = document.createElement('div'); preview.className = 'cb-preview'; preview.textContent = 'Preview: (none)';

  // --- Internal views (Sync Tone, Summarize, Rewrite, Translate) - inline sections ---
  
  // Sync Tone view
  const syncView = document.createElement('div'); syncView.className = 'cb-internal-view'; syncView.id = 'cb-sync-view'; syncView.setAttribute('data-cb-ignore','true');
  const syncTop = document.createElement('div'); syncTop.className = 'cb-view-top';
  const syncTitle = document.createElement('div'); syncTitle.className = 'cb-view-title'; syncTitle.textContent = 'Sync Tone';
  const btnCloseSync = document.createElement('button'); btnCloseSync.className = 'cb-view-close'; btnCloseSync.textContent = '✕';
  syncTop.appendChild(syncTitle); syncTop.appendChild(btnCloseSync);
  syncView.appendChild(syncTop);
  const syncTargetLabel = document.createElement('div'); syncTargetLabel.className = 'cb-label'; syncTargetLabel.textContent = 'Target model / tone';
  const syncTargetSelect = document.createElement('select'); syncTargetSelect.className = 'cb-select cb-view-select'; syncTargetSelect.id = 'cb-sync-target-select';
  const approved = ['Claude','ChatGPT','Gemini','OpenAI','Llama','Bing','Anthropic','Cohere','HuggingFace','Custom'];
  approved.forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; syncTargetSelect.appendChild(o); });
  try { if (syncTargetSelect && syncTargetSelect.options && syncTargetSelect.options.length) syncTargetSelect.selectedIndex = 0; } catch (e) {}
  syncView.appendChild(syncTargetLabel); syncView.appendChild(syncTargetSelect);
  const syncSourceText = document.createElement('div'); syncSourceText.className = 'cb-view-text'; syncSourceText.id = 'cb-sync-source-text'; syncSourceText.setAttribute('contenteditable','false'); syncSourceText.textContent = '';
  syncView.appendChild(syncSourceText);
  const btnGoSync = document.createElement('button'); btnGoSync.className = 'cb-btn cb-view-go'; btnGoSync.textContent = 'Sync Tone';
  syncView.appendChild(btnGoSync);
  const syncProg = document.createElement('span'); syncProg.className = 'cb-progress'; syncProg.style.display = 'none'; syncView.appendChild(syncProg);
  const btnInsertSync = document.createElement('button'); btnInsertSync.className = 'cb-btn cb-view-go'; btnInsertSync.textContent = 'Insert to Chat'; btnInsertSync.style.display = 'none';
  syncView.appendChild(btnInsertSync);
  const syncResult = document.createElement('div'); syncResult.className = 'cb-view-result'; syncResult.id = 'cb-sync-result'; syncResult.textContent = '';
  syncView.appendChild(syncResult);

  // Summarize view
  const summView = document.createElement('div'); summView.className = 'cb-internal-view'; summView.id = 'cb-summ-view'; summView.setAttribute('data-cb-ignore','true');
  const summTop = document.createElement('div'); summTop.className = 'cb-view-top';
  const summTitle = document.createElement('div'); summTitle.className = 'cb-view-title'; summTitle.textContent = 'Summarize';
  const btnCloseSumm = document.createElement('button'); btnCloseSumm.className = 'cb-view-close'; btnCloseSumm.textContent = '✕';
  summTop.appendChild(summTitle); summTop.appendChild(btnCloseSumm);
  summView.appendChild(summTop);
  const summControls = document.createElement('div'); summControls.className = 'cb-view-controls';
  const summLengthLabel = document.createElement('label'); summLengthLabel.className = 'cb-label'; summLengthLabel.textContent = 'Length:';
  const summLengthSelect = document.createElement('select'); summLengthSelect.className = 'cb-select'; summLengthSelect.id = 'cb-summ-length';
  ['concise','short','medium','comprehensive','detailed'].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v.charAt(0).toUpperCase()+v.slice(1); summLengthSelect.appendChild(o); });
  summLengthSelect.value = 'medium';
  const summTypeLabel = document.createElement('label'); summTypeLabel.className = 'cb-label'; summTypeLabel.textContent = 'Style:';
  const summTypeSelect = document.createElement('select'); summTypeSelect.className = 'cb-select'; summTypeSelect.id = 'cb-summ-type';
  ['paragraph','bullet','detailed','executive','technical'].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v.charAt(0).toUpperCase()+v.slice(1); summTypeSelect.appendChild(o); });
  summTypeSelect.value = 'paragraph';
  summControls.appendChild(summLengthLabel); summControls.appendChild(summLengthSelect); summControls.appendChild(summTypeLabel); summControls.appendChild(summTypeSelect);
  summView.appendChild(summControls);
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
  rewTop.appendChild(rewTitle); rewTop.appendChild(btnCloseRew);
  rewView.appendChild(rewTop);
  const rewStyleLabel = document.createElement('label'); rewStyleLabel.className = 'cb-label'; rewStyleLabel.textContent = 'Style:';
  const rewStyleSelect = document.createElement('select'); rewStyleSelect.className = 'cb-select'; rewStyleSelect.id = 'cb-rew-style';
  ['normal','concise','direct','detailed','academic'].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v.charAt(0).toUpperCase()+v.slice(1); rewStyleSelect.appendChild(o); });
  rewStyleSelect.value = 'normal';
  const rewControls = document.createElement('div'); rewControls.className = 'cb-view-controls';
  rewControls.appendChild(rewStyleLabel); rewControls.appendChild(rewStyleSelect);
  rewView.appendChild(rewControls);
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
  const transView = document.createElement('div'); transView.className = 'cb-internal-view'; transView.id = 'cb-trans-view'; transView.setAttribute('data-cb-ignore','true');
  const transTop = document.createElement('div'); transTop.className = 'cb-view-top';
  const transTitle = document.createElement('div'); transTitle.className = 'cb-view-title'; transTitle.textContent = 'Translate';
  const btnCloseTrans = document.createElement('button'); btnCloseTrans.className = 'cb-view-close'; btnCloseTrans.textContent = '✕';
  transTop.appendChild(transTitle); transTop.appendChild(btnCloseTrans);
  transView.appendChild(transTop);
  const transLangLabel = document.createElement('div'); transLangLabel.className = 'cb-label'; transLangLabel.textContent = 'Target language';
  const transLangSelect = document.createElement('select'); transLangSelect.className = 'cb-select'; transLangSelect.id = 'cb-trans-lang';
  ['Japanese','Spanish','French','German','Chinese','Korean','Italian','Portuguese','Russian','Arabic','Hindi','Turkish','Dutch','Swedish','Polish','Tamil'].forEach(lang => { const o = document.createElement('option'); o.value = lang; o.textContent = lang; transLangSelect.appendChild(o); });
  transLangSelect.value = 'Japanese';
  transView.appendChild(transLangLabel); transView.appendChild(transLangSelect);
  const transSourceText = document.createElement('div'); transSourceText.className = 'cb-view-text'; transSourceText.id = 'cb-trans-source-text'; transSourceText.setAttribute('contenteditable','false'); transSourceText.textContent = '';
  transView.appendChild(transSourceText);
  const btnGoTrans = document.createElement('button'); btnGoTrans.className = 'cb-btn cb-view-go'; btnGoTrans.textContent = 'Translate';
  transView.appendChild(btnGoTrans);
  const transProg = document.createElement('span'); transProg.className = 'cb-progress'; transProg.style.display = 'none'; transView.appendChild(transProg);
  const btnInsertTrans = document.createElement('button'); btnInsertTrans.className = 'cb-btn cb-view-go'; btnInsertTrans.textContent = 'Insert to Chat'; btnInsertTrans.style.display = 'none';
  transView.appendChild(btnInsertTrans);
  const transResult = document.createElement('div'); transResult.className = 'cb-view-result'; transResult.id = 'cb-trans-result'; transResult.textContent = '';
  transView.appendChild(transResult);

  // Append all internal views to the panel (after actions, before status)
  panel.appendChild(syncView);
  panel.appendChild(summView);
  panel.appendChild(rewView);
  panel.appendChild(transView);

  // Smart Query view
  const smartView = document.createElement('div'); smartView.className = 'cb-internal-view'; smartView.id = 'cb-smart-view'; smartView.setAttribute('data-cb-ignore','true');
  const smartTop = document.createElement('div'); smartTop.className = 'cb-view-top';
  const smartTitle = document.createElement('div'); smartTitle.className = 'cb-view-title'; smartTitle.textContent = 'Smart Archive + Query';
  const btnCloseSmart = document.createElement('button'); btnCloseSmart.className = 'cb-view-close'; btnCloseSmart.textContent = '✕';
  smartTop.appendChild(smartTitle); smartTop.appendChild(btnCloseSmart);
  smartView.appendChild(smartTop);

  const smartIntro = document.createElement('div'); smartIntro.className = 'cb-label'; smartIntro.textContent = 'Search your saved chats and ask a question about them.';
  smartView.appendChild(smartIntro);
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
  const btnSmartSearch = document.createElement('button'); btnSmartSearch.className = 'cb-btn'; btnSmartSearch.id = 'btnSmartSearch'; btnSmartSearch.textContent = 'Search';
  smartQueryRow.appendChild(smartInput); smartQueryRow.appendChild(btnSmartSearch);
  smartView.appendChild(smartQueryRow);

  const smartResults = document.createElement('div'); smartResults.id = 'cb-smart-results'; smartResults.className = 'cb-view-text'; smartResults.textContent = '(No results yet)';
  smartView.appendChild(smartResults);

  const smartAskRow = document.createElement('div'); smartAskRow.className = 'cb-view-controls';
  const btnSmartAsk = document.createElement('button'); btnSmartAsk.className = 'cb-btn cb-view-go'; btnSmartAsk.id = 'btnSmartAsk'; btnSmartAsk.textContent = 'Ask AI';
  smartAskRow.appendChild(btnSmartAsk);
  const btnIndexAll = document.createElement('button'); btnIndexAll.className = 'cb-btn'; btnIndexAll.id = 'btnIndexAll'; btnIndexAll.textContent = 'Index all saved chats'; btnIndexAll.title = 'Create embeddings and index all saved chats (requires API key)';
  smartAskRow.appendChild(btnIndexAll);
  const btnNormalizeTags = document.createElement('button'); btnNormalizeTags.className = 'cb-btn'; btnNormalizeTags.id = 'btnNormalizeTags'; btnNormalizeTags.textContent = 'Normalize tags & index'; btnNormalizeTags.title = 'Normalize tags for all saved chats and re-index them';
  smartAskRow.appendChild(btnNormalizeTags);
  smartView.appendChild(smartAskRow);

  const smartAnswer = document.createElement('div'); smartAnswer.id = 'cb-smart-answer'; smartAnswer.className = 'cb-view-result'; smartAnswer.textContent = '';
  smartView.appendChild(smartAnswer);
  const smartProvenance = document.createElement('div'); smartProvenance.id = 'cb-smart-provenance'; smartProvenance.style.fontSize = '12px'; smartProvenance.style.marginTop = '8px'; smartProvenance.style.color = 'rgba(200,200,200,0.9)'; smartProvenance.textContent = '';
  smartView.appendChild(smartProvenance);

  panel.appendChild(smartView);

  // Gemini Nano input/output area
  const geminiWrap = document.createElement('div'); geminiWrap.style.padding = '8px 18px'; geminiWrap.style.display = 'flex'; geminiWrap.style.flexDirection = 'column'; geminiWrap.style.gap = '8px';
  // Insert preview above (textarea removed - preview is the read-only display)
  geminiWrap.appendChild(preview);
  // Note: removed editable textarea per UI simplification request.
  panel.appendChild(geminiWrap);

  const status = document.createElement('div'); status.className = 'cb-status'; status.textContent = 'Status: idle'; panel.appendChild(status);

  // History section with clear button
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

    function renderLastScan() { /* end-user UI hides debug */ }

    shadow.appendChild(panel);

    // interactions
    avatar.addEventListener('click', () => { host.style.display = 'block'; avatar.style.display = 'none'; });
    btnClose.addEventListener('click', () => { host.style.display = 'none'; avatar.style.display = 'flex'; });

    // Helper to close all internal views
    function closeAllViews() {
      try {
        syncView.classList.remove('cb-view-active');
        summView.classList.remove('cb-view-active');
        rewView.classList.remove('cb-view-active');
        transView.classList.remove('cb-view-active');
        try { if (typeof smartView !== 'undefined' && smartView) smartView.classList.remove('cb-view-active'); } catch(_) {}
      } catch (e) {}
    }

    // Helper to load conversation text from lastScannedText or saved conversations
    async function getConversationText() {
      if (lastScannedText && lastScannedText.trim()) return lastScannedText.trim();
      try {
        const convs = (typeof window.getConversations === 'function') ? await new Promise(res=>window.getConversations(res)) : JSON.parse(localStorage.getItem('chatbridge:conversations') || '[]');
        if (Array.isArray(convs) && convs.length) {
          const sel = convs[0];
          if (sel && sel.conversation && sel.conversation.length) return sel.conversation.map(m => `${m.role}: ${m.text}`).join('\n\n');
        }
      } catch (e) { debugLog('load convs', e); }
      return '';
    }

    // Open Sync Tone view
    btnSyncTone.addEventListener('click', async () => {
      try {
        closeAllViews(); // Close other views first
        const inputText = await getConversationText();
        syncSourceText.textContent = inputText || '(no conversation found)';
        syncResult.textContent = '';
        syncView.classList.add('cb-view-active');
      } catch (e) { toast('Failed to open Sync Tone'); debugLog('open sync view', e); }
    });

    btnCloseSync.addEventListener('click', () => {
      try { syncView.classList.remove('cb-view-active'); } catch (e) {}
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

      btnGoSync.addEventListener('click', async () => {
        try {
          addLoadingToButton(btnGoSync, 'Syncing'); syncResult.textContent = ''; btnInsertSync.style.display = 'none';
        syncProg.style.display = 'inline'; updateProgress(syncProg, 'sync', { phase: 'preparing' });
        const chatText = (syncSourceText && syncSourceText.textContent) ? syncSourceText.textContent : '';
        const target = (syncTargetSelect && syncTargetSelect.value) || 'TargetModel';
  if (!chatText || chatText.trim().length < 10) { toast('No conversation to sync'); btnGoSync.disabled = false; btnGoSync.textContent = 'Sync Tone'; return; }

        let resText = '';
        if (typeof window.syncTone === 'function') {
          try { resText = await window.syncTone(chatText, target); } catch (e) { debugLog('window.syncTone error', e); }
        }
        if (!resText) {
          try {
            resText = await hierarchicalProcess(chatText, 'syncTone', { chunkSize: 14000, maxParallel: 3, length: 'medium', sourceModel: 'unknown', targetModel: target, onProgress: (ev)=>updateProgress(syncProg, 'sync', ev) });
          } catch (e) { debugLog('hierarchicalProcess syncTone error', e); throw e; }
        }

        // Update text area with result and show Insert button
        syncSourceText.textContent = resText || '(no result)';
        syncResult.textContent = '✅ Tone sync completed! The text area above now shows the synced version.';
        btnInsertSync.style.display = 'inline-block';
        // Generate an optimized prompt for the target model that explains what made the source responses successful
        try {
          (async () => {
            try {
              const srcModel = 'SourceModel';
              const tgtModel = target || 'TargetModel';
              const orig = chatText && chatText.length > 4000 ? chatText.slice(0,4000) + '\n\n...(truncated)' : (chatText || '');
              const assistantExample = resText && resText.length > 4000 ? resText.slice(0,4000) + '\n\n... (truncated)' : (resText || '');
              const gen = await generateOptimizedPrompt(srcModel, tgtModel, orig, assistantExample);
              if (gen) {
                try {
                  // render structured analysis and the optimized prompt with a copy button
                  syncResult.innerHTML = '';
                  const hdr = document.createElement('div'); hdr.style.fontWeight = '700'; hdr.style.marginBottom = '6px'; hdr.textContent = 'Analysis & Optimized Prompt for ' + tgtModel;
                  syncResult.appendChild(hdr);
                  const strengths = document.createElement('div'); strengths.style.marginBottom = '8px'; strengths.style.fontSize = '13px';
                  strengths.textContent = (Array.isArray(gen.strengths) ? gen.strengths.map((s,i)=> (i+1)+'. '+s).join('\n') : String(gen.strengths || '') );
                  syncResult.appendChild(strengths);
                  const promptLabel = document.createElement('div'); promptLabel.style.fontWeight = '600'; promptLabel.style.marginTop = '8px'; promptLabel.textContent = 'Optimized prompt (copy & use):';
                  syncResult.appendChild(promptLabel);
                  const pre = document.createElement('pre'); pre.style.whiteSpace = 'pre-wrap'; pre.style.background = 'rgba(0,0,0,0.04)'; pre.style.padding = '8px'; pre.style.borderRadius = '8px'; pre.style.fontSize = '13px'; pre.textContent = gen.optimized_prompt || gen.prompt || gen.optimizedPrompt || '';
                  syncResult.appendChild(pre);
                  const copyBtn = document.createElement('button'); copyBtn.className = 'cb-btn'; copyBtn.textContent = 'Copy optimized prompt'; copyBtn.style.marginTop = '8px';
                  copyBtn.addEventListener('click', async () => {
                    try { await navigator.clipboard.writeText(pre.textContent || ''); toast('Prompt copied to clipboard'); } catch (e) { toast('Copy failed'); }
                  });
                  syncResult.appendChild(copyBtn);
                } catch (e) { debugLog('render gen prompt failed', e); }
              }
            } catch (e) { debugLog('generateOptimizedPrompt error', e); }
          })();
        } catch (e) { debugLog('async optimize fire failed', e); }
        syncProg.style.display = 'none';
  // No duplicate output in preview; go straight to history below
        toast('Sync Tone completed');
      } catch (err) {
        toast('Sync Tone failed: ' + (err && err.message ? err.message : err));
  } finally { removeLoadingFromButton(btnGoSync, 'Sync Tone'); }
    });

    // Map target model name to a URL we can open
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

    btnInsertSync.addEventListener('click', () => {
      const text = syncSourceText.textContent || '';
      continueWithTargetModel(text);
    });

    // Cross-Context Memory: Extract structured knowledge from a conversation
    async function extractKnowledge(conversation, conversationId) {
      try {
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
              
              // Store knowledge in localStorage
              const knowledge = {
                id: conversationId,
                ts: Date.now(),
                entities: Array.isArray(parsed.entities) ? parsed.entities.slice(0, 8) : [],
                themes: Array.isArray(parsed.themes) ? parsed.themes.slice(0, 6) : [],
                conclusions: Array.isArray(parsed.conclusions) ? parsed.conclusions.slice(0, 4) : [],
                contradictions: Array.isArray(parsed.contradictions) ? parsed.contradictions.slice(0, 3) : [],
                context: parsed.context || ''
              };
              
              // Save to knowledge graph
              const graphKey = 'chatbridge:knowledge_graph';
              const graph = JSON.parse(localStorage.getItem(graphKey) || '[]');
              graph.push(knowledge);
              localStorage.setItem(graphKey, JSON.stringify(graph));
              
              debugLog('Knowledge extracted', knowledge);
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

    // Cross-Context Memory: Find related past conversations based on current context
    async function findRelatedConversations(currentEntities, currentThemes, limit = 3) {
      try {
        const graphKey = 'chatbridge:knowledge_graph';
        const graph = JSON.parse(localStorage.getItem(graphKey) || '[]');
        
        if (!graph.length || (!currentEntities.length && !currentThemes.length)) return [];
        
        // Score each past conversation by overlap with current context
        const scored = graph.map(kg => {
          let score = 0;
          
          // Entity overlap (higher weight)
          for (const e of currentEntities) {
            if (kg.entities.some(ke => ke.toLowerCase().includes(e.toLowerCase()) || e.toLowerCase().includes(ke.toLowerCase()))) {
              score += 3;
            }
          }
          
          // Theme overlap
          for (const t of currentThemes) {
            if (kg.themes.some(kt => kt.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(kt.toLowerCase()))) {
              score += 2;
            }
          }
          
          return { ...kg, score };
        }).filter(kg => kg.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
        
        return scored;
      } catch (e) {
        debugLog('findRelatedConversations error', e);
        return [];
      }
    }

    // Cross-Context Memory: Show suggestion notification
    function showContextSuggestion(relatedConvs) {
      try {
        if (!relatedConvs || !relatedConvs.length) return;
        
        // Create notification element
        const notification = document.createElement('div');
        notification.id = 'cb-context-notification';
        notification.setAttribute('data-cb-ignore', 'true');
        notification.style.cssText = `
          position: fixed;
          bottom: 80px;
          right: 26px;
          width: 320px;
          background: linear-gradient(135deg, rgba(230,207,159,0.98), rgba(212,175,119,0.98));
          color: #0b0f17;
          padding: 14px 16px;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
          z-index: 2147483646;
          font-family: 'Poppins', sans-serif;
          font-size: 13px;
          line-height: 1.4;
          animation: cb-slide-in 0.3s ease-out;
        `;
        
        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';
        
        const title = document.createElement('div');
        title.style.cssText = 'font-weight:700;font-size:14px;';
        title.textContent = '🧠 Related Memory';
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = 'background:transparent;border:none;color:#0b0f17;font-size:20px;cursor:pointer;padding:0;line-height:1;opacity:0.6;';
        closeBtn.addEventListener('mouseenter', () => closeBtn.style.opacity = '1');
        closeBtn.addEventListener('mouseleave', () => closeBtn.style.opacity = '0.6');
        closeBtn.addEventListener('click', () => notification.remove());
        
        topRow.appendChild(title);
        topRow.appendChild(closeBtn);
        notification.appendChild(topRow);
        
        const conv = relatedConvs[0];
        const msg = document.createElement('div');
        msg.style.cssText = 'margin-bottom:10px;opacity:0.9;';
        msg.textContent = `Earlier you discussed "${conv.context || 'similar topics'}" ${conv.score > 5 ? 'extensively' : ''}.`;
        notification.appendChild(msg);
        
        if (conv.entities && conv.entities.length) {
          const entities = document.createElement('div');
          entities.style.cssText = 'font-size:11px;opacity:0.8;margin-bottom:8px;';
          entities.textContent = '🏷️ ' + conv.entities.slice(0, 3).join(', ');
          notification.appendChild(entities);
        }
        
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;margin-top:10px;';
        
        const viewBtn = document.createElement('button');
        viewBtn.textContent = 'View';
        viewBtn.style.cssText = 'flex:1;background:#0b0f17;color:#e6cf9f;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:600;font-size:12px;font-family:inherit;';
        viewBtn.addEventListener('click', () => {
          openConversationById(conv.id);
          notification.remove();
        });
        
        const dismissBtn = document.createElement('button');
        dismissBtn.textContent = 'Dismiss';
        dismissBtn.style.cssText = 'flex:1;background:rgba(0,0,0,0.1);color:#0b0f17;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:500;font-size:12px;font-family:inherit;';
        dismissBtn.addEventListener('click', () => notification.remove());
        
        btnRow.appendChild(viewBtn);
        btnRow.appendChild(dismissBtn);
        notification.appendChild(btnRow);
        
        // Add animation style if not exists
        if (!document.getElementById('cb-context-styles')) {
          const styleEl = document.createElement('style');
          styleEl.id = 'cb-context-styles';
          styleEl.textContent = `
            @keyframes cb-slide-in {
              from { transform: translateY(20px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
          `;
          document.head.appendChild(styleEl);
        }
        
        // Remove existing notification if any
        const existing = document.getElementById('cb-context-notification');
        if (existing) existing.remove();
        
        document.body.appendChild(notification);
        
        // Auto-dismiss after 15 seconds
        setTimeout(() => {
          try { if (notification.parentNode) notification.remove(); } catch (e) {}
        }, 15000);
        
      } catch (e) {
        debugLog('showContextSuggestion error', e);
      }
    }

    // Cross-Context Memory: Detect context on page and show suggestions
    async function detectAndSuggestContext() {
      try {
        // Quick scan of visible messages to extract current context
        const msgs = await scanChat();
        if (!msgs || msgs.length < 2) return; // Need at least some conversation
        
        const recentText = msgs.slice(-5).map(m => m.text).join('\n');
        if (recentText.length < 100) return; // Not enough context
        
        // Extract quick entities and themes (lightweight extraction)
        const words = recentText.toLowerCase().split(/\W+/).filter(w => w.length > 3);
        const wordFreq = {};
        words.forEach(w => wordFreq[w] = (wordFreq[w] || 0) + 1);
        const commonWords = Object.entries(wordFreq).filter(([w, f]) => f >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);
        
        // Find related conversations
        const related = await findRelatedConversations(commonWords, commonWords, 3);
        
        if (related.length) {
          showContextSuggestion(related);
        }
      } catch (e) {
        debugLog('detectAndSuggestContext error', e);
      }
    }

    // Scan button handler: scan, normalize, save, and optionally auto-summarize
    btnScan.addEventListener('click', async () => {
      addLoadingToButton(btnScan, 'Scanning'); status.textContent = 'Status: scanning...';
      try {
  const msgs = await scanChat();
  // persist lastScannedText for clipboard and Sync view
  try { if (Array.isArray(msgs) && msgs.length) { lastScannedText = msgs.map(m => `${m.role}: ${m.text}`).join('\n\n'); } } catch (e) {}
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
        }
        else {
          const final = normalizeMessages(msgs);
          const currentModel = detectCurrentModel();
          const conv = { platform: location.hostname, url: location.href, ts: Date.now(), model: currentModel, conversation: final };
          // ensure lastScannedText updated when saving
          try { lastScannedText = final.map(m => `${m.role}: ${m.text}`).join('\n\n'); } catch (e) {}
          if (typeof window.saveConversation === 'function') {
            window.saveConversation(conv, () => { toast('Saved ' + final.length + ' messages'); refreshHistory(); });
          } else {
            const key = 'chatbridge:conversations'; const cur = JSON.parse(localStorage.getItem(key) || '[]'); cur.push(conv); localStorage.setItem(key, JSON.stringify(cur)); toast('Saved (local) ' + final.length + ' messages'); refreshHistory();
          }
          status.textContent = `Status: saved ${final.length}`;

          // Cross-Context Memory: Extract knowledge from conversation (async, non-blocking)
          try {
            (async () => {
              const knowledge = await extractKnowledge(final, String(conv.ts));
              if (knowledge) {
                debugLog('Knowledge extracted and stored', knowledge);
              }
            })();
          } catch (e) {
            debugLog('Background knowledge extraction failed', e);
          }

          // Auto-summarize if 20+ messages or 50,000+ characters
          const totalChars = final.reduce((sum, m) => sum + (m.text || '').length, 0);
          if (final.length >= 20 || totalChars >= 50000) {
            status.textContent = `Status: auto-summarizing ${final.length} messages (${totalChars} chars)...`;
            const inputText = final.map(m => `${m.role}: ${m.text}`).join('\n');
            hierarchicalSummarize(inputText, { chunkSize: 14000, maxParallel: 3, length: 'comprehensive', summaryType: 'detailed' })
              .then(result => {
                preview.textContent = `Auto-Summary (${final.length} msgs, comprehensive context preserved):\n\n` + result;
                status.textContent = 'Status: done (auto-summarized)';
                toast('Auto-summarized with full context!');
                restoreToChat(result);
              }).catch(err => {
                status.textContent = `Status: saved ${final.length} (summarize failed)`;
                debugLog('hierarchicalSummarize error', err);
              });
          }
        }
      } catch (e) { status.textContent = 'Status: error'; toast('Scan failed: ' + (e && e.message)); }
      removeLoadingFromButton(btnScan, 'Scan Chat');
    });

    // Clipboard button - copy last scanned text (textarea removed)
    btnClipboard.addEventListener('click', async () => {
      try {
        const txt = lastScannedText || '';
        if (!txt) { toast('Nothing to copy'); return; }
        await navigator.clipboard.writeText(txt);
        toast('Copied scanned chat to clipboard');
      } catch (e) {
        try { navigator.clipboard.writeText(lastScannedText || ''); toast('Copied to clipboard (fallback)'); } catch(err){ toast('Copy failed'); }
      }
    });

    // Clear History button - remove all saved conversations
    btnClearHistory.addEventListener('click', async () => {
      try {
        if (!confirm('Clear all saved conversation history? This cannot be undone.')) return;
        
        // Use the storage API if available
        if (typeof window.clearConversations === 'function') {
          window.clearConversations(() => {
            toast('History cleared');
            refreshHistory();
            // Clear the preview/last-scanned text
            try { preview.textContent = 'Preview: (none)'; } catch (e) {}
            lastScannedText = '';
          });
        } else {
          // Fallback to direct localStorage clear
          localStorage.removeItem('chatbridge:conversations');
          toast('History cleared');
          refreshHistory();
          // Clear the preview/last-scanned text
          try { preview.textContent = 'Preview: (none)'; } catch (e) {}
          lastScannedText = '';
        }
      } catch (e) {
        toast('Clear failed: ' + (e && e.message));
      }
    });

    // Find Connections button handler
    btnFindConnections.addEventListener('click', async () => {
      try {
        addLoadingToButton(btnFindConnections, 'Analyzing…');
        await detectAndSuggestContext();
        toast('Context analysis complete');
      } catch (e) {
        toast('Context detection failed');
        debugLog('Find Connections error', e);
      } finally {
        removeLoadingFromButton(btnFindConnections, 'Find Connections');
      }
    });

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
      let fileInput = findFileInputNearComposer();
      if (!fileInput) {
        // Fallback: try clipboard for the first image
        const img = atts.find(a => a.kind === 'image');
        if (img) {
          try {
            const res = await fetch(img.url, { credentials: 'include' });
            const blob = await res.blob();
            const item = new ClipboardItem({ [blob.type || 'image/png']: blob });
            await navigator.clipboard.write([item]);
            toast('Image copied to clipboard. Press Ctrl+V in the chat to paste.');
            return result;
          } catch (e) {
            result.failed.push({ url: img.url, error: 'clipboard_failed' });
            return result;
          }
        }
        return result;
      }
      try {
        const dt = new DataTransfer();
        const multiple = !!fileInput.multiple;
        let count = 0;
        for (const a of atts) {
          try {
            const res = await fetch(a.url, { credentials: 'include' });
            if (!res.ok) { result.failed.push({ url: a.url, error: 'http_'+res.status }); if (!multiple) break; continue; }
            const blob = await res.blob();
            const name = a.name || ('attachment.' + ((blob.type && blob.type.split('/')[1]) || 'bin'));
            const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
            dt.items.add(file);
            count++;
            if (!multiple) break;
          } catch (e) {
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
        }
      } catch (e) {
        // Swallow and report
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
        // Wait for composer to exist and be visible
        let input = findVisibleInputCandidate();
        if (!input) input = await waitForComposer(10000, 350);
        if (input && input.isContentEditable) {
          input.textContent = text;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus(); input.blur();
          toast('Restored to chat');
        } else if (input) {
          input.value = text;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus(); input.blur();
          // poke keydown for some frameworks
          try { input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ' ' })); } catch(e) {}
          setTimeout(() => { try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch(e){} }, 60);
          try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch(e){}
          toast('Restored to chat');
        } else {
          // No input found; put text on clipboard
          try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch(e) { toast('Copied to clipboard'); }
        }
        // Attach files if provided
        try {
          const atts = Array.isArray(attachments) ? attachments : [];
          if (atts.length) {
            const res = await attachFilesToChat(atts);
            if (res.failed && res.failed.length) {
              console.warn('[ChatBridge] Some attachments failed to attach:', res.failed);
              toast((res.uploaded||0) + ' attached, ' + res.failed.length + ' failed');
            }
          }
        } catch (e) { console.warn('[ChatBridge] attachFiles error', e); }
        return true;
      } catch (e) {
        try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch(_) { toast('Copied to clipboard'); }
        return false;
      }
    }

    btnRestore.addEventListener('click', async () => {
      try {
        const getter = (typeof window.getConversations === 'function') ? window.getConversations : (cb => cb(JSON.parse(localStorage.getItem('chatbridge:conversations') || '[]')));
        getter(list => {
          const arr = Array.isArray(list) ? list : [];
          if (!arr.length) { toast('No saved conversations'); return; }
          // Use selected chat from dropdown if available (fallback to first)
          let sel = null;
          try {
            if (chatSelect && chatSelect.value) {
              const i = arr.findIndex(v => String(v.ts) === chatSelect.value);
              sel = i >= 0 ? arr[i] : arr[0];
            } else { sel = arr[0]; }
          } catch (_) { sel = arr[0]; }
          if (!sel || !sel.conversation || !sel.conversation.length) { toast('No messages in selected conversation'); return; }
          const formatted = sel.conversation.map(m => (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.text).join('\n\n') + '\n\n🔄 Please continue the conversation.';
          // Collect attachments from conversation
          const allAtts = [];
          try {
            for (const m of sel.conversation) {
              if (Array.isArray(m.attachments) && m.attachments.length) allAtts.push(...m.attachments);
            }
          } catch (e) {}
          // Find only visible textarea or contenteditable input
          let input = null;
          const candidates = Array.from(document.querySelectorAll('textarea, [contenteditable="true"]'));
          for (const el of candidates) {
            const style = window.getComputedStyle(el);
            if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
              input = el;
              break;
            }
          }
          try {
            if (input && input.isContentEditable) {
              console.log('[ChatBridge Restore] Found contenteditable input:', input);
              input.textContent = formatted;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.focus();
              input.blur();
              console.log('[ChatBridge Restore] Set textContent and dispatched input event.');
              // Attach files after text
              try { if (allAtts.length) { attachFilesToChat(allAtts); } } catch(e){}
              toast('Restored conversation');
              setTimeout(() => {
                console.log('[ChatBridge Restore] Final input value:', input.textContent);
              }, 100);
            } else if (input) {
              console.log('[ChatBridge Restore] Found textarea input:', input);
              input.value = formatted;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.focus();
              input.blur();
              const evt = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ' ' });
              input.dispatchEvent(evt);
              setTimeout(() => {
                input.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('[ChatBridge Restore] Final input value:', input.value);
              }, 100);
              // Attach files after text
              try { if (allAtts.length) { attachFilesToChat(allAtts); } } catch(e){}
              toast('Restored conversation');
            } else throw new Error('no input');
          } catch (e) {
            console.log('[ChatBridge Restore] Error during restore:', e);
            navigator.clipboard.writeText(formatted).then(()=>toast('Copied to clipboard (fallback)'));
            // Attempt to put first image on clipboard as well
            try {
              const img = allAtts.find(a => a.kind === 'image');
              if (img) {
                fetch(img.url).then(r=>r.blob()).then(b=>{
                  const item = new ClipboardItem({ [b.type||'image/png']: b });
                  return navigator.clipboard.write([item]);
                }).then(()=>toast('Image copied to clipboard too')).catch(()=>{});
              }
            } catch (_) {}
          }
        });
      } catch (e) { toast('Restore failed'); }
    });


    // Gemini Cloud API handlers
    // small promise wrapper around chrome.runtime.sendMessage
    function callGeminiAsync(payload) {
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ type: 'call_gemini', payload }, res => { resolve(res || { ok: false, error: 'no-response' }); });
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
          debugLog('hierarchicalSummarize: chunk fallback failed', f);
        } catch (e) { debugLog('hierarchicalSummarize: chunk fallback threw', e); }

        return '[chunk-summarize-failed]';
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
    // Prompt button removed in favor of Sync Tone UI (see btnSyncTone)

    btnSummarize.addEventListener('click', async () => {
      closeAllViews();
      try {
        const inputText = await getConversationText();
        summSourceText.textContent = inputText || '(no conversation found)';
        summResult.textContent = '';
        summView.classList.add('cb-view-active');
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

    btnRewrite.addEventListener('click', async () => {
      closeAllViews();
      try {
        const inputText = await getConversationText();
        rewSourceText.textContent = inputText || '(no conversation found)';
        rewResult.textContent = '';
        rewView.classList.add('cb-view-active');
      } catch (e) { toast('Failed to open Rewrite'); debugLog('open rew view', e); }
    });

    btnCloseRew.addEventListener('click', () => {
      try { rewView.classList.remove('cb-view-active'); } catch (e) {}
    })

    btnGoRew.addEventListener('click', async () => {
      try {
  btnGoRew.disabled = true; addLoadingToButton(btnGoRew, 'Rewriting'); rewResult.textContent = ''; btnInsertRew.style.display = 'none';
        rewProg.style.display = 'inline'; updateProgress(rewProg, 'rewrite', { phase: 'preparing' });
        const chatText = (rewSourceText && rewSourceText.textContent) ? rewSourceText.textContent : '';
        const style = (rewStyleSelect && rewStyleSelect.value) || 'normal';
  if (!chatText || chatText.trim().length < 10) { toast('No conversation to rewrite'); btnGoRew.disabled = false; btnGoRew.textContent = 'Rewrite'; return; }

        const result = await hierarchicalProcess(chatText, 'rewrite', { chunkSize: 14000, maxParallel: 3, length: 'medium', extraPayload: { rewriteStyle: style }, onProgress: (ev)=>updateProgress(rewProg, 'rewrite', ev) });

        // Update text area with result and show Insert button
        rewSourceText.textContent = result || '(no result)';
        rewResult.textContent = '✅ Rewrite completed! The text area above now shows the rewritten version.';
        btnInsertRew.style.display = 'inline-block';
        rewProg.style.display = 'none';
  // No duplicate output in preview; go straight to history below
        toast('Rewrite completed');
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
        const inputText = await getConversationText();
        transSourceText.textContent = inputText || '(no conversation found)';
        transResult.textContent = '';
        transView.classList.add('cb-view-active');
      } catch (e) { toast('Failed to open Translate'); debugLog('open trans view', e); }
    });

    btnCloseTrans.addEventListener('click', () => {
      try { transView.classList.remove('cb-view-active'); } catch (e) {}
    });

    btnGoTrans.addEventListener('click', async () => {
      try {
  btnGoTrans.disabled = true; addLoadingToButton(btnGoTrans, 'Translating'); transResult.textContent = ''; btnInsertTrans.style.display = 'none';
        transProg.style.display = 'inline'; updateProgress(transProg, 'translate', { phase: 'preparing' });
        const chatText = (transSourceText && transSourceText.textContent) ? transSourceText.textContent : '';
        const lang = (transLangSelect && transLangSelect.value) || 'Japanese';
  if (!chatText || chatText.trim().length < 10) { toast('No conversation to translate'); btnGoTrans.disabled = false; btnGoTrans.textContent = 'Translate'; return; }

        const result = await hierarchicalProcess(chatText, 'translate', { chunkSize: 14000, maxParallel: 3, length: 'medium', extraPayload: { targetLang: lang }, onProgress: (ev)=>updateProgress(transProg, 'translate', ev) });

        // Update text area with result and show Insert button
        transSourceText.textContent = result || '(no result)';
        transResult.textContent = `✅ Translation to ${lang} completed! The text area above now shows the translated version.`;
        btnInsertTrans.style.display = 'inline-block';
        transProg.style.display = 'none';
  // No duplicate output in preview; go straight to history below
        toast('Translate completed');
      } catch (err) {
        toast('Translate failed: ' + (err && err.message ? err.message : err));
        debugLog('hierarchicalProcess translate error', err);
  } finally { removeLoadingFromButton(btnGoTrans, 'Translate'); }
    });

    btnInsertTrans.addEventListener('click', () => {
      try {
        const text = (transSourceText && transSourceText.textContent) || '';
        if (!text || text === '(no result)') { toast('Nothing to insert'); return; }
        restoreToChat(text);
      } catch (e) { toast('Insert failed'); }
    });

    // Smart Query handlers
    btnSmartQuery.addEventListener('click', async () => {
      try {
        closeAllViews();
        smartResults.textContent = '(No results yet)';
        smartAnswer.textContent = '';
        smartInput.value = '';
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

        smartView.classList.add('cb-view-active');
      } catch (e) { toast('Failed to open Smart Query'); debugLog('open smart view', e); }
    });

    btnCloseSmart.addEventListener('click', () => { try { smartView.classList.remove('cb-view-active'); } catch (e) {} });

    // Load conversations as a Promise (supports window.getConversations hook or localStorage)
    function loadConversationsAsync() {
      return new Promise(res => {
        try {
          if (typeof window.getConversations === 'function') {
            try { window.getConversations(list => res(Array.isArray(list) ? list : [])); } catch (e) { res([]); }
          } else {
            const arr = JSON.parse(localStorage.getItem('chatbridge:conversations') || '[]'); res(Array.isArray(arr) ? arr : []);
          }
        } catch (e) { res([]); }
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

    btnSmartSearch.addEventListener('click', async () => {
      try {
        const q = (smartInput && smartInput.value) ? smartInput.value.trim() : '';
        if (!q) { toast('Type a search query'); return; }
        smartResults.textContent = 'Searching...'; smartAnswer.textContent = '';
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
            } catch (e) { renderSmartResults(mapped); }
            return;
          }
        } catch (e) { debugLog('vector query failed', e); }

        // Fallback to local substring search
        const convs = await loadConversationsAsync();
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
          renderSmartResults(filtered);
        } catch (e) { renderSmartResults(mapped); }
      } catch (e) { debugLog('smart search error', e); smartResults.textContent = '(search failed)'; }
    });

    btnSmartAsk.addEventListener('click', async () => {
      try {
        const q = (smartInput && smartInput.value) ? smartInput.value.trim() : '';
        if (!q) { toast('Type a question to ask'); return; }
        if (!lastSmartResults || !lastSmartResults.length) { toast('No search results to provide context. Run Search first.'); return; }
  btnSmartAsk.disabled = true; addLoadingToButton(btnSmartAsk, 'Asking…'); smartAnswer.textContent = '';
        // Combine top matches into context (limit to ~13000 chars)
        let ctx = '';
        for (let i=0;i<Math.min(6,lastSmartResults.length);i++) {
          const t = lastSmartResults[i].snippetFull || '';
          if (!t) continue;
          if ((ctx + '\n\n' + t).length > 13000) break;
          ctx += '\n\n--- Conversation excerpt ' + (i+1) + ' ---\n\n' + t;
        }
        const prompt = `You are an assistant that answers questions about a user's past chat logs. Use ONLY the provided conversation excerpts as context to answer the question. If the answer isn't contained in the excerpts, say you don't know.\n\nQuestion: ${q}\n\nContext: ${ctx}`;
        const res = await callGeminiAsync({ action: 'prompt', text: prompt, length: 'short' });
        if (res && res.ok) {
          const answerText = res.result || '(no answer)';
          smartAnswer.textContent = answerText;
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
      try {
  const prev = btnIndexAll.textContent;
  addLoadingToButton(btnIndexAll, 'Indexing...');
        smartAnswer.textContent = '';
        chrome.runtime.sendMessage({ type: 'vector_index_all' }, (res) => {
          try {
            if (chrome.runtime.lastError) { smartAnswer.textContent = 'Index failed: ' + chrome.runtime.lastError.message; }
            else if (res && res.ok) { smartAnswer.textContent = `Indexed ${res.indexed || 0} conversations.`; }
            else { smartAnswer.textContent = 'Index failed: ' + (res && res.error ? res.error : 'unknown'); }
          } catch (e) { smartAnswer.textContent = 'Index response error'; }
          finally { removeLoadingFromButton(btnIndexAll, prev); }
        });
  } catch (e) { toast('Index all failed'); btnIndexAll.disabled = false; btnIndexAll.textContent = 'Index all saved chats'; }
    });

    // Normalize tags (migration) for all saved conversations and re-index them
    btnNormalizeTags.addEventListener('click', async () => {
      try {
  const prev = btnNormalizeTags.textContent;
  addLoadingToButton(btnNormalizeTags, 'Normalizing...');
        smartAnswer.textContent = '';

        // load conversations
        const getter = (typeof window.getConversations === 'function') ? window.getConversations : (cb => cb(JSON.parse(localStorage.getItem('chatbridge:conversations') || '[]')));
        const convs = await new Promise(res => getter(res));
        const arr = Array.isArray(convs) ? convs : [];
        let updated = 0, extracted = 0;

        for (let i = 0; i < arr.length; i++) {
          const c = arr[i];
          try {
            const oldTopics = Array.isArray(c.topics) ? c.topics.slice() : [];
            let normalized = [];

            if (Array.isArray(c.topics) && c.topics.length) {
              normalized = normalizeTopics(c.topics);
            } else {
              // try to extract topics for conversations that don't have them
              try {
                const full = (c && c.conversation) ? c.conversation.map(m => `${m.role}: ${m.text}`).join('\n\n') : '';
                const prompt = `Extract up to 6 short topic tags (comma separated) that summarize the main topics in the following conversation. Output ONLY a comma-separated list of short tags (no extra text):\n\n${full}`;
                const res = await callGeminiAsync({ action: 'prompt', text: prompt, length: 'short' });
                if (res && res.ok && res.result) {
                  const parts = (res.result || '').split(/[,\n]+/).map(t => t.trim()).filter(Boolean);
                  const nt = normalizeTopics(parts);
                  if (nt && nt.length) { normalized = nt; extracted++; }
                }
              } catch (e) { debugLog('topic extraction (migration) failed', e); }
            }

            // compare and update if changed
            const oldJson = JSON.stringify(oldTopics || []);
            const newJson = JSON.stringify(normalized || []);
            if (newJson !== oldJson) {
              arr[i].topics = normalized;
              updated++;
              try { localStorage.setItem('chatbridge:conversations', JSON.stringify(arr)); } catch (e) { debugLog('save migration update failed', e); }

              // re-send to background for re-indexing
              try {
                const full = (c && c.conversation) ? c.conversation.map(m => `${m.role}: ${m.text}`).join('\n\n') : '';
                chrome.runtime.sendMessage({ type: 'vector_index', payload: { id: String(c.ts), text: full, metadata: { platform: c.platform || location.hostname, url: c.url || location.href, ts: c.ts, topics: arr[i].topics || [] } } }, () => {});
              } catch (e) { debugLog('vector_index send failed (migration)', e); }
            }
          } catch (e) { debugLog('migration loop item failed', e); }
        }

        smartAnswer.textContent = `Migration complete. Updated ${updated} conversations. Extracted tags for ${extracted} conversations.`;
      } catch (e) { debugLog('normalize migration failed', e); smartAnswer.textContent = 'Migration failed: ' + (e && e.message ? e.message : String(e)); }
  finally { removeLoadingFromButton(btnNormalizeTags, 'Normalize tags & index'); }
    });

    function refreshHistory() {
      const getter = (typeof window.getConversations === 'function') ? window.getConversations : (cb => cb(JSON.parse(localStorage.getItem('chatbridge:conversations') || '[]')));
      getter(list => {
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
        // History text
        historyEl.textContent = arr.slice(0,6).map(s => {
          let host = s.platform || 'chat';
          try { host = new URL(s.url||location.href).hostname; } catch (_) {}
          const date = new Date(s.ts);
          const timeStr = date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          return `${host} • ${(s.conversation||[]).length} msgs • ${timeStr}`;
        }).join('\n\n');
        // Default preview from first conversation
        preview.textContent = 'Preview: ' + (arr[0] && arr[0].conversation && arr[0].conversation[0] ? arr[0].conversation[0].text.slice(0,200) : '(none)');

        // Populate chat dropdown while preserving selection when possible
        try {
          const prev = chatSelect.value;
          while (chatSelect.firstChild) chatSelect.removeChild(chatSelect.firstChild);
          arr.forEach(s => {
            const o = document.createElement('option');
            o.value = String(s.ts);
            const count = (s.conversation||[]).length;
            let host = s.platform || 'chat';
            try { host = new URL(s.url||location.href).hostname; } catch (_) {}
            // Truncate hostname if too long
            if (host.length > 15) host = host.substring(0, 12) + '...';
            const date = new Date(s.ts);
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            o.textContent = `${host} • ${count} msgs • ${timeStr}`;
            chatSelect.appendChild(o);
          });
          // restore previous selection if still present, else select the latest (first in list)
          if (prev && Array.from(chatSelect.options).some(o => o.value === prev)) chatSelect.value = prev; else chatSelect.selectedIndex = 0;
        } catch (e) {}
      });
    }

    // Update preview when selecting a chat (use shadow DOM element reference)
    try {
      chatSelect.addEventListener('change', () => {
        try {
          const getter = (typeof window.getConversations === 'function') ? window.getConversations : (cb => cb(JSON.parse(localStorage.getItem('chatbridge:conversations') || '[]')));
          getter(list => {
            const arr = Array.isArray(list) ? list : [];
            const idx = arr.findIndex(v => String(v.ts) === chatSelect.value);
            const sel = idx >= 0 ? arr[idx] : arr[0];
            if (!sel) { preview.textContent = 'Preview: (none)'; return; }
            const text = sel.conversation && sel.conversation[0] ? sel.conversation[0].text.slice(0,200) : '(none)';
            preview.textContent = 'Preview: ' + text;
          });
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

    function toast(msg) { try { const t = document.createElement('div'); t.setAttribute('data-cb-ignore','true'); t.textContent = msg; t.style.position='fixed'; t.style.bottom='18px'; t.style.left='18px'; t.style.background='rgba(6,20,32,0.9)'; t.style.color='#dff1ff'; t.style.padding='8px 10px'; t.style.borderRadius='8px'; t.style.zIndex='2147483647'; document.body.appendChild(t); setTimeout(()=>t.remove(),2400); } catch (e) { try { alert(msg); } catch(_) {} } }

    refreshHistory();
    try { window.ChatBridge = window.ChatBridge || {}; window.ChatBridge._renderLastScan = renderLastScan; } catch (e) {}
    return { host, avatar, panel };
  }

  async function scanChat() {
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
    raw = nodes.map(n => ({ text: (n.innerText||'').trim(), role: inferRoleFromNode(n), el: n, attachments: extractAttachmentsFromElement(n) }));
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
    
    // Log any errors that occurred
    try {
      if (window.ChatBridge && window.ChatBridge._lastScan && window.ChatBridge._lastScan.errors && window.ChatBridge._lastScan.errors.length) {
        debugLog('Scan completed with errors:', window.ChatBridge._lastScan.errors);
      }
    } catch (e) {}
    
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
      // persist locally (simple localStorage fallback)
      const key = 'chatbridge:conversations';
      try {
        const cur = JSON.parse(localStorage.getItem(key) || '[]');
        cur.push(conv);
        localStorage.setItem(key, JSON.stringify(cur));
      } catch (e) {
        debugLog('save error (localStorage)', e);
      }

      // Asynchronously extract topics/tags and index the conversation via background vector store
      (async () => {
        try {
          const full = (conv && conv.conversation) ? conv.conversation.map(m => `${m.role}: ${m.text}`).join('\n\n') : '';
          // Topic extraction prompt
          try {
            const prompt = `Extract up to 6 short topic tags (comma separated) that summarize the main topics in the following conversation. Output ONLY a comma-separated list of short tags (no extra text):\n\n${full}`;
            const res = await callGeminiAsync({ action: 'prompt', text: prompt, length: 'short' });
            let topics = [];
            if (res && res.ok && res.result) {
              topics = (res.result || '').split(/[,\n]+/).map(t => t.trim()).filter(Boolean).slice(0,6);
              // normalize: lowercase, collapse spaces, remove punctuation except dashes/underscores, dedupe
              topics = topics.map(t => t.toLowerCase().replace(/["'()\.]/g, '').replace(/\s+/g, ' ').trim())
                             .filter(Boolean);
              // dedupe while preserving order
              const seen = new Set();
              const uniq = [];
              for (const t of topics) {
                if (!seen.has(t)) { seen.add(t); uniq.push(t); }
              }
              topics = uniq.slice(0,6);
            }
            if (topics && topics.length) conv.topics = topics;
          } catch (e) { debugLog('topic extraction failed', e); }

          // update stored conversation with topics
          try {
            const cur2 = JSON.parse(localStorage.getItem(key) || '[]');
            const idx = cur2.findIndex(c => String(c.ts) === String(conv.ts));
            if (idx >= 0) { cur2[idx] = conv; localStorage.setItem(key, JSON.stringify(cur2)); }
          } catch (e) { debugLog('save update topics failed', e); }

          // send to background to index (background will request embeddings)
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

  // bootstrap UI and auto-scan
  try { 
    const ui = injectUI(); 
    
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
      // Listener to restore text/attachments when background opens a new tab
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        try {
          if (msg && msg.type === 'restore_to_chat') {
            const payload = msg.payload || {};
            const text = payload.text || '';
            const attachments = payload.attachments || [];
            restoreToChat(text, attachments).then(() => sendResponse && sendResponse({ ok: true })).catch(() => sendResponse && sendResponse({ ok: false }));
            return true;
          }
        } catch (e) {}
      });

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

})();

