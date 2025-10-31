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
    --cb-bg: #0A0F1C;
    --cb-bg2: #10182B;
    --cb-bg3: #1a2332;
    --cb-accent-primary: #00B4FF;
    --cb-accent-secondary: #8C1EFF;
    --cb-accent-tertiary: #1EF2F7;
    --cb-white: #E6E9F0;
    --cb-subtext: #A0A7B5;
    --cb-error: #FF1E56;
    --cb-progress: #00E5FF;
    --cb-border: rgba(0, 180, 255, 0.15);
    --cb-shadow: rgba(0, 0, 0, 0.3);
  }
  :host(.cb-theme-light) {
    --cb-bg: #F8FAFC;
    --cb-bg2: #FFFFFF;
    --cb-bg3: #F1F5F9;
    --cb-white: #0F172A;
    --cb-subtext: #475569;
    --cb-accent-primary: #0EA5E9;
    --cb-accent-secondary: #8B5CF6;
    --cb-border: rgba(15, 23, 42, 0.12);
    --cb-shadow: rgba(0, 0, 0, 0.08);
  }
  :host * { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important; letter-spacing: -0.01em; }
  .cb-panel { box-sizing: border-box; position:fixed; top:12px; right:12px; width:380px; max-height:86vh; overflow-y:auto; overflow-x:hidden; border-radius:16px; background: var(--cb-bg2); color:var(--cb-white) !important; z-index:2147483647; box-shadow: 0 20px 60px var(--cb-shadow), 0 0 40px rgba(140, 30, 255, 0.15); border: 1px solid var(--cb-border); backdrop-filter: blur(12px); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); word-wrap: break-word; }
  .cb-panel * { max-width: 100%; word-wrap: break-word; overflow-wrap: break-word; }
  .cb-panel::-webkit-scrollbar { width: 10px; }
  .cb-panel::-webkit-scrollbar-track { background: var(--cb-bg); border-radius: 10px; }
  .cb-panel::-webkit-scrollbar-thumb { background: linear-gradient(180deg, var(--cb-accent-primary), var(--cb-accent-secondary)); border-radius: 10px; border: 2px solid var(--cb-bg); }
  .cb-panel::-webkit-scrollbar-thumb:hover { opacity: 0.8; }
  .cb-header { display:flex; flex-direction:row; align-items:flex-start; justify-content:space-between; padding:18px 20px 12px 20px; gap:8px; border-bottom: 1px solid var(--cb-border); }
  .cb-title { font-weight:800; font-size:20px; letter-spacing:-0.02em; color: var(--cb-white); background: linear-gradient(135deg, var(--cb-accent-primary), var(--cb-accent-secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .cb-subtitle { font-size:13px; color: var(--cb-subtext); font-weight:500; margin-top:4px; margin-bottom:2px; letter-spacing:-0.01em; }
    .cb-actions { padding:16px 18px 12px 18px; display:flex; flex-direction:column; gap:12px; align-items:stretch; justify-content:flex-start; }
  .cb-actions-grid { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:10px; width:100%; }
  .cb-actions .cb-btn { min-width:0; padding:12px 14px; font-size:12px; white-space:nowrap; font-weight:600; letter-spacing:-0.01em; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); text-transform: uppercase; width:100%; position: relative; overflow: hidden; }
    .cb-btn { background: var(--cb-bg3); border:1px solid var(--cb-border); color:var(--cb-white) !important; padding:12px 16px; border-radius:10px; cursor:pointer; font-size:13px; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); font-weight:600; box-shadow: 0 2px 8px var(--cb-shadow); }
  .cb-btn::before { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent); transition: left 0.5s ease; }
  .cb-btn:hover::before { left: 100%; }
  .cb-btn:hover { transform:translateY(-2px); box-shadow: 0 4px 16px var(--cb-shadow), 0 0 24px rgba(0, 180, 255, 0.15); border-color: var(--cb-accent-primary); }
  .cb-btn:focus { outline: none; box-shadow: 0 0 0 3px rgba(0, 180, 255, 0.25); }
  .cb-btn:active { transform:translateY(0px); }
  .cb-btn-primary { background: linear-gradient(135deg, var(--cb-accent-primary), var(--cb-accent-secondary)); color:#FFFFFF !important; font-weight:700; border: none; box-shadow: 0 4px 12px rgba(0,180,255,0.3); }
  .cb-btn-primary:hover { box-shadow: 0 8px 24px rgba(0,180,255,0.4), 0 0 30px rgba(140, 30, 255, 0.3); transform: translateY(-2px); }
  .cb-scan-row { padding: 12px 18px; }
  .cb-scan-wide { width: 100%; margin: 0; padding:14px 16px; font-size:15px; font-weight:600; border-radius:12px; display:block; }
      .cb-btn-danger { background: rgba(255,30,86,0.1); border:1px solid rgba(255,30,86,0.3); color:#FF7A9A !important; font-size:13px; padding:8px 12px; }
      .cb-btn-danger:hover { background: rgba(255,30,86,0.15); border-color: rgba(255,30,86,0.5); color:#FF9CB3 !important; box-shadow: 0 4px 12px rgba(255,30,86,0.2); transform: translateY(-2px); }
      .cb-toolbar { display:flex; align-items:center; gap:12px; padding:16px 20px 12px 20px; border-bottom: 1px solid var(--cb-border); }
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
      .cb-internal-view { display: none; padding: 18px 20px; border-top: 1px solid var(--cb-border); background: var(--cb-bg); animation: slideIn 0.3s ease-out; }
      .cb-internal-view.cb-view-active { display: block; }
      @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      .cb-view-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
      .cb-view-close { background:transparent; border:1px solid var(--cb-border); color:var(--cb-white); padding:6px 12px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:600; transition: all 0.2s ease; }
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
      .cb-view-controls { margin:14px 0; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
      .cb-view-go { margin-top:12px; }
  .cb-view-result { margin-top:16px; padding:14px; background: var(--cb-bg); border:1px solid var(--cb-border); border-radius:10px; white-space:pre-wrap; color:var(--cb-white); font-size:13px; line-height:1.6; max-height:200px; overflow-y:auto; overflow-x:hidden; }
  .cb-progress { display:inline-block; margin-left:10px; font-size:12px; color:var(--cb-subtext); opacity:0.9; font-weight:500; }
  .cb-dots { display:inline-block; }
  .cb-dots .dot { display:inline-block; opacity:0.25; animation: cb-ellipsis 1.1s ease-in-out infinite; }
  .cb-dots .dot:nth-child(2) { animation-delay: .18s; }
  .cb-dots .dot:nth-child(3) { animation-delay: .36s; }
  /* small inline spinner used with loading buttons */
  .cb-spinner { display:inline-block; width:14px; height:14px; border-radius:50%; vertical-align:middle; margin-right:8px; background: conic-gradient(var(--cb-progress), rgba(255,255,255,0.9)); box-shadow: 0 0 12px rgba(0, 180, 255, 0.3), 0 0 0 1px rgba(0,0,0,0.08) inset; animation: cb-spin 0.9s linear infinite; }
  @keyframes cb-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes cb-ellipsis { 0% { opacity:0.25; transform: translateY(0); } 30% { opacity:1; transform: translateY(-2px); } 60% { opacity:0.25; transform: translateY(0); } 100% { opacity:0.25; transform: translateY(0); } }
    `;
    shadow.appendChild(style);
    // Apply saved theme preference
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['cb_theme'], (r) => {
          try { if (r && r.cb_theme === 'light') host.classList.add('cb-theme-light'); } catch (e) {}
        });
      }
    } catch (e) {}

  const panel = document.createElement('div'); panel.className = 'cb-panel';
    // Header: Title and subtitle
    const header = document.createElement('div'); header.className = 'cb-header';
  const title = document.createElement('div'); title.className = 'cb-title'; title.textContent = 'ChatBridge'; title.style.fontSize = '22px';
  const subtitle = document.createElement('div'); subtitle.className = 'cb-subtitle'; subtitle.textContent = 'Effortlessly continue conversations across models';
  const left = document.createElement('div');
  left.style.display = 'flex'; left.style.flexDirection = 'column'; left.style.gap = '6px'; left.style.alignItems = 'flex-start';
  left.appendChild(title); left.appendChild(subtitle);
  const controls = document.createElement('div'); controls.style.display = 'flex'; controls.style.alignItems = 'flex-start';
  const btnClose = document.createElement('button'); btnClose.className = 'cb-close'; btnClose.textContent = '✕';
  btnClose.setAttribute('aria-label','Close panel');
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
  const btnKnowledgeGraph = document.createElement('button'); btnKnowledgeGraph.className = 'cb-btn'; btnKnowledgeGraph.textContent = 'Graph'; btnKnowledgeGraph.title = 'Visualize your conversation network - Interactive map of how your chats connect'; btnKnowledgeGraph.setAttribute('aria-label','Open Knowledge Graph');
  const btnInsights = document.createElement('button'); btnInsights.className = 'cb-btn'; btnInsights.textContent = 'Insights'; btnInsights.title = 'Smart workspace tools - Compare, merge, extract, and organize your conversations'; btnInsights.setAttribute('aria-label','Open Smart Workspace');

  // Gemini API buttons
  const btnSyncTone = document.createElement('button'); btnSyncTone.className = 'cb-btn'; btnSyncTone.textContent = 'Sync'; btnSyncTone.title = 'Adapt conversations - Rewrite for a different AI model\'s style and strengths';
  const btnSummarize = document.createElement('button'); btnSummarize.className = 'cb-btn'; btnSummarize.textContent = 'Summarize'; btnSummarize.title = 'Get the key points - Condense long chats into concise summaries';
  const btnRewrite = document.createElement('button'); btnRewrite.className = 'cb-btn'; btnRewrite.textContent = 'Rewrite'; btnRewrite.title = 'Polish your content - Improve clarity, tone, and professionalism';
  const btnTranslate = document.createElement('button'); btnTranslate.className = 'cb-btn'; btnTranslate.textContent = 'Translate'; btnTranslate.title = 'Break language barriers - Convert chats to 20+ languages instantly';
  btnSyncTone.setAttribute('aria-label','Sync tone to target model');
  btnSummarize.setAttribute('aria-label','Summarize conversation');
  btnRewrite.setAttribute('aria-label','Rewrite conversation');
  btnTranslate.setAttribute('aria-label','Translate conversation');

  // Place Scan button prominently in its own row below the header
  try {
    const scanRow = document.createElement('div'); scanRow.className = 'cb-scan-row';
    scanRow.appendChild(btnScan);
    panel.appendChild(scanRow);
  } catch (e) { try { row1.appendChild(btnScan); } catch (e2) {} }
  
  // Grid: Restore, Query, Graph, Insights, Copy, Sync, Summarize, Rewrite, Translate
  [
    btnRestore,
    btnSmartQuery,
    btnKnowledgeGraph,
    btnInsights,
    btnClipboard,
    btnSyncTone,
    btnSummarize,
    btnRewrite,
    btnTranslate
  ].forEach(b => actionsGrid.appendChild(b));

  actions.appendChild(actionsGrid);
  panel.appendChild(actions);

    // Toolbar with Chat dropdown
    const toolbar = document.createElement('div'); toolbar.className = 'cb-toolbar';
  const lab = document.createElement('div'); lab.className = 'cb-label'; lab.textContent = 'Select Chat';
    const chatSelect = document.createElement('select'); chatSelect.className = 'cb-select'; chatSelect.id = 'cb-chat-select';
  chatSelect.setAttribute('aria-label', 'Select saved chat');
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
  btnCloseSync.setAttribute('aria-label','Close Sync view');
  syncTop.appendChild(syncTitle); syncTop.appendChild(btnCloseSync);
  syncView.appendChild(syncTop);
  const syncIntro = document.createElement('div'); syncIntro.className = 'cb-view-intro'; syncIntro.textContent = 'Adapt this conversation for a different AI model. Each model has unique strengths - this rewrites your chat to match the target model\'s style and capabilities.';
  syncView.appendChild(syncIntro);
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
  const rewIntro = document.createElement('div'); rewIntro.className = 'cb-view-intro'; rewIntro.textContent = 'Polish and refine your conversation. Improve clarity, adjust tone, or restructure for better readability and impact.';
  rewView.appendChild(rewIntro);
  const rewStyleLabel = document.createElement('label'); rewStyleLabel.className = 'cb-label'; rewStyleLabel.textContent = 'Style:';
  const rewStyleSelect = document.createElement('select'); rewStyleSelect.className = 'cb-select'; rewStyleSelect.id = 'cb-rew-style';
  ['normal','concise','direct','detailed','academic'].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v.charAt(0).toUpperCase()+v.slice(1); rewStyleSelect.appendChild(o); });
  rewStyleSelect.value = 'normal';
  const rewControls = document.createElement('div'); rewControls.className = 'cb-view-controls';
  rewControls.appendChild(rewStyleLabel); rewControls.appendChild(rewStyleSelect);
  rewView.appendChild(rewControls);
  // Restore saved rewrite style
  try { const savedRew = localStorage.getItem('chatbridge:pref:rewStyle'); if (savedRew) rewStyleSelect.value = savedRew; } catch(e){}
  rewStyleSelect.addEventListener('change', () => { try { localStorage.setItem('chatbridge:pref:rewStyle', rewStyleSelect.value); } catch(e){} });
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
  btnCloseTrans.setAttribute('aria-label','Close Translate view');
  transTop.appendChild(transTitle); transTop.appendChild(btnCloseTrans);
  transView.appendChild(transTop);
  const transIntro = document.createElement('div'); transIntro.className = 'cb-view-intro'; transIntro.textContent = 'Break language barriers instantly. Convert conversations to 20+ languages while preserving context and technical accuracy.';
  transView.appendChild(transIntro);
  const transLangLabel = document.createElement('div'); transLangLabel.className = 'cb-label'; transLangLabel.textContent = 'Target language';
  const transLangSelect = document.createElement('select'); transLangSelect.className = 'cb-select'; transLangSelect.id = 'cb-trans-lang';
  // include English and common targets; order: English first
  ['English','Japanese','Spanish','French','German','Chinese','Korean','Italian','Portuguese','Russian','Arabic','Hindi','Turkish','Dutch','Swedish','Polish','Tamil'].forEach(lang => { const o = document.createElement('option'); o.value = lang; o.textContent = lang; transLangSelect.appendChild(o); });
  // Auto-detect user's preferred language and restore saved preference
  try {
    const saved = localStorage.getItem('chatbridge:pref:transLang');
    if (saved) {
      try { transLangSelect.value = saved; } catch(e) {}
    } else {
      const nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
      // map primary tag to available option names
      const langMap = { 'en': 'English', 'en-us': 'English', 'en-gb': 'English', 'ja': 'Japanese', 'es': 'Spanish', 'fr': 'French', 'de': 'German', 'zh': 'Chinese', 'ko': 'Korean', 'it': 'Italian', 'pt': 'Portuguese', 'ru': 'Russian', 'ar': 'Arabic', 'hi': 'Hindi', 'tr': 'Turkish', 'nl': 'Dutch', 'sv': 'Swedish', 'pl': 'Polish', 'ta': 'Tamil' };
      const key = nav.split('-')[0];
      const mapped = langMap[nav] || langMap[key] || 'English';
      try { transLangSelect.value = mapped; } catch(e) { transLangSelect.value = 'English'; }
    }
  } catch (e) {}
  // persist when changed
  transLangSelect.addEventListener('change', () => { try { localStorage.setItem('chatbridge:pref:transLang', transLangSelect.value); } catch(e){} });
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
  const btnNormalizeTags = document.createElement('button'); btnNormalizeTags.className = 'cb-btn'; btnNormalizeTags.id = 'btnNormalizeTags'; btnNormalizeTags.textContent = 'Normalize tags & index'; btnNormalizeTags.title = 'Normalize tags for all saved chats and re-index them';
  btnNormalizeTags.setAttribute('aria-label', 'Normalize tags and index');
  smartAskRow.appendChild(btnNormalizeTags);
  smartView.appendChild(smartAskRow);

  const smartAnswer = document.createElement('div'); smartAnswer.id = 'cb-smart-answer'; smartAnswer.className = 'cb-view-result'; smartAnswer.textContent = '';
  smartView.appendChild(smartAnswer);
  const smartProvenance = document.createElement('div'); smartProvenance.id = 'cb-smart-provenance'; smartProvenance.style.fontSize = '12px'; smartProvenance.style.marginTop = '8px'; smartProvenance.style.color = 'rgba(200,200,200,0.9)'; smartProvenance.textContent = '';
  smartView.appendChild(smartProvenance);

  // Connections panel (for Find Connections results)
  const connectionsTitle = document.createElement('div'); connectionsTitle.className = 'cb-view-title'; connectionsTitle.style.fontSize = '13px'; connectionsTitle.style.marginTop = '12px'; connectionsTitle.textContent = 'Connections';
  smartView.appendChild(connectionsTitle);
  const connectionsResult = document.createElement('div'); connectionsResult.id = 'cb-connections-result'; connectionsResult.className = 'cb-view-result'; connectionsResult.textContent = '(No connections yet)';
  smartView.appendChild(connectionsResult);

  panel.appendChild(smartView);

  // Knowledge Graph Explorer view
  const graphView = document.createElement('div'); graphView.className = 'cb-internal-view'; graphView.id = 'cb-graph-view'; graphView.setAttribute('data-cb-ignore','true');
  const graphTop = document.createElement('div'); graphTop.className = 'cb-view-top';
  const graphTitle = document.createElement('div'); graphTitle.className = 'cb-view-title'; graphTitle.textContent = 'Knowledge Graph';
  const btnCloseGraph = document.createElement('button'); btnCloseGraph.className = 'cb-view-close'; btnCloseGraph.textContent = '✕';
  btnCloseGraph.setAttribute('aria-label','Close Graph view');
  graphTop.appendChild(graphTitle); graphTop.appendChild(btnCloseGraph);
  graphView.appendChild(graphTop);

  const graphIntro = document.createElement('div'); graphIntro.className = 'cb-view-intro'; graphIntro.textContent = 'See how your conversations connect and build on each other. An interactive network revealing patterns, contradictions, and knowledge threads across all your chats.';
  graphView.appendChild(graphIntro);

  const graphControls = document.createElement('div'); graphControls.className = 'cb-view-controls';
  const btnExportPNG = document.createElement('button'); btnExportPNG.className = 'cb-btn'; btnExportPNG.textContent = 'Export PNG'; btnExportPNG.title = 'Export knowledge graph as PNG (optionally generated via Gemini)';
  const btnExportHTML = document.createElement('button'); btnExportHTML.className = 'cb-btn'; btnExportHTML.textContent = 'Export HTML'; btnExportHTML.title = 'Export knowledge graph as standalone HTML snapshot';
  const btnRefreshGraph = document.createElement('button'); btnRefreshGraph.className = 'cb-btn'; btnRefreshGraph.textContent = 'Refresh'; btnRefreshGraph.title = 'Rebuild graph visualization';
  graphControls.appendChild(btnExportPNG); graphControls.appendChild(btnExportHTML); graphControls.appendChild(btnRefreshGraph);

  const graphCanvas = document.createElement('canvas'); graphCanvas.id = 'cb-graph-canvas'; graphCanvas.width = 350; graphCanvas.height = 400;
  graphCanvas.style.cssText = 'width:100%;height:400px;background:#0b0f17;border-radius:10px;margin-top:12px;cursor:grab;position:relative;';
  // Accessibility: make canvas focusable and announceable
  graphCanvas.setAttribute('tabindex', '0');
  graphCanvas.setAttribute('role', 'application');
  graphCanvas.setAttribute('aria-label', 'Knowledge graph visualization. Use arrow keys to pan, enter to open a node.');
  graphView.appendChild(graphCanvas);

  const graphLegend = document.createElement('div'); graphLegend.className = 'cb-graph-legend';
  graphLegend.innerHTML = `
    <div style="font-size:11px;color:rgba(212,175,119,0.75);margin-top:8px;display:flex;flex-wrap:wrap;gap:12px;justify-content:center;">
      <div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#10a37f;margin-right:4px;"></span>ChatGPT</div>
      <div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#9b87f5;margin-right:4px;"></span>Claude</div>
      <div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#4285f4;margin-right:4px;"></span>Gemini</div>
      <div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#00a4ef;margin-right:4px;"></span>Copilot</div>
      <div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#6366f1;margin-right:4px;"></span>Perplexity</div>
    </div>
  `;
  graphView.appendChild(graphLegend);

  // Place export / refresh controls after the image and legend as requested
  graphView.appendChild(graphControls);

  const graphTooltip = document.createElement('div'); graphTooltip.id = 'cb-graph-tooltip';
  graphTooltip.style.cssText = 'display:none;position:absolute;background:rgba(20,20,30,0.98);color:#e6cf9f;padding:10px 12px;border-radius:8px;font-size:12px;line-height:1.4;max-width:250px;pointer-events:none;z-index:10;border:1px solid rgba(230,207,159,0.3);box-shadow:0 4px 12px rgba(0,0,0,0.4);';
  graphView.appendChild(graphTooltip);

  const graphStats = document.createElement('div'); graphStats.className = 'cb-view-result'; graphStats.id = 'cb-graph-stats'; graphStats.style.marginTop = '12px'; graphStats.textContent = 'Loading graph...';
  graphView.appendChild(graphStats);

  panel.appendChild(graphView);

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

  const insightsIntro = document.createElement('div'); insightsIntro.className = 'cb-view-intro'; insightsIntro.textContent = 'Practical tools to help you work smarter: compare models, merge threads, extract content, and stay organized.';
  insightsView.appendChild(insightsIntro);

  const insightsContent = document.createElement('div'); insightsContent.id = 'cb-insights-content'; insightsContent.style.cssText = 'padding:12px 0;overflow-y:auto;max-height:calc(100vh - 250px);';
  insightsView.appendChild(insightsContent);

  panel.appendChild(insightsView);

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
          .cb-skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 37%, rgba(255,255,255,0.03) 63%); background-size: 400% 100%; animation: cb-skel-shimmer 1.6s linear infinite; border-radius:6px; }
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

        // Quick Actions Grid
        const actionsGrid = document.createElement('div');
        actionsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px;padding:0 12px;';

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

        // 4. Auto-Organize (tag and organize conversations)
        const organizeBtn = createFeatureCard('Auto-Organize', 'Automatically tag and organize your chats', '🗂️', async () => {
          addLoadingToButton(organizeBtn, 'Organizing...');
          try {
            const convs = await loadConversationsAsync();
            let organized = 0;
            
            for (const conv of convs.slice(0, 20)) { // Limit to recent 20
              if (!conv.topics || !conv.topics.length) {
                // Extract topics
                const full = conv.conversation.map(m => `${m.role}: ${m.text}`).join('\n\n');
                const prompt = `Extract 3-5 short topic tags for this conversation. Output only comma-separated tags:\n\n${full.slice(0, 2000)}`;
                const res = await callGeminiAsync({ action: 'prompt', text: prompt, length: 'short' });
                
                if (res && res.ok) {
                  const topics = res.result.split(',').map(t => t.trim()).slice(0, 5);
                  conv.topics = topics;
                  organized++;
                }
              }
            }
            
            // Save updated conversations
            if (organized > 0) {
              localStorage.setItem('chatbridge:conversations', JSON.stringify(convs));
              toast(`Organized ${organized} conversations`);
            } else {
              toast('All conversations already organized');
            }
          } catch (e) {
            toast('Organize failed');
            debugLog('Organize error', e);
          } finally {
            removeLoadingFromButton(organizeBtn, 'Auto-Organize');
          }
        });

        actionsGrid.appendChild(compareBtn);
        actionsGrid.appendChild(mergeBtn);
        actionsGrid.appendChild(extractBtn);
        actionsGrid.appendChild(organizeBtn);
        insightsContent.appendChild(actionsGrid);

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
      card.addEventListener('click', onClick);
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
        
        // Get chat name/topic (first user message or topics)
        const chatName = conv.name || (conv.conversation && conv.conversation.find(m => m.role === 'user')?.text.slice(0, 60)) || 'Untitled Chat';
        const site = conv.platform || conv.host || (conv.url ? new URL(conv.url).hostname : 'Unknown');
        const count = conv.conversation?.length || 0;
        
        checkbox.innerHTML = `<div style="flex:1;"><div style="font-weight:600;font-size:12px;margin-bottom:4px;">${chatName}${chatName.length > 57 ? '...' : ''}</div><div style="font-size:11px;opacity:0.7;">📍 ${site} • 💬 ${count} messages</div></div>`;
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
        { name: 'URLs', icon: '🔗', pattern: /https?:\/\/[^\s]+/g },
        { name: 'Numbers/Data', icon: '🔢', pattern: /\d+\.?\d*/g }
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
          const matches = text.match(type.pattern) || [];
          
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
          syncProg.style.display = 'inline'; updateProgress(syncProg, 'sync', { phase: 'preparing' }); announce('Syncing conversation tone');
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
    toast('Sync Tone completed'); announce('Sync Tone completed');
      } catch (err) {
    toast('Sync Tone failed: ' + (err && err.message ? err.message : err)); showError('Sync Tone failed: ' + (err && err.message ? err.message : err), async () => { try { btnGoSync.click(); } catch(_) {} }); announce('Sync Tone failed');
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

    // Cross-Context Memory: Extract structured knowledge from a conversation with segmentation
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
      addLoadingToButton(btnScan, 'Scanning'); status.textContent = 'Status: scanning...'; announce('Scanning conversation now');
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
          announce('Scan completed: no messages found');
        }
        else {
          const final = normalizeMessages(msgs);
          const currentModel = detectCurrentModel();
          const conv = { platform: location.hostname, url: location.href, ts: Date.now(), model: currentModel, conversation: final };
          // ensure lastScannedText updated when saving
          try { lastScannedText = final.map(m => `${m.role}: ${m.text}`).join('\n\n'); } catch (e) {}
          
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
            try {
              showSkeleton(preview, 120);
              // For long chats, generate an AI-to-AI transfer summary to preserve intent, relationships, and next steps
              hierarchicalSummarize(inputText, { chunkSize: 14000, maxParallel: 3, length: 'comprehensive', summaryType: 'transfer' })
                .then(result => {
                  hideSkeleton(preview);
                  preview.textContent = `Auto-Summary (${final.length} msgs, comprehensive context preserved):\n\n` + result;
                  preview.classList.add('cb-slide-up'); setTimeout(()=> preview.classList.remove('cb-slide-up'), 360);
                  status.textContent = 'Status: done (auto-summarized)';
                  toast('Auto-summarized with full context!');
                  restoreToChat(result);
                }).catch(err => {
                  hideSkeleton(preview);
                  status.textContent = `Status: saved ${final.length} (summarize failed)`;
                  debugLog('hierarchicalSummarize error', err);
                  showError('Auto-summarize failed: ' + (err && err.message ? err.message : 'unknown'), async () => { try { btnScan.click(); } catch(_) {} });
                });
            } catch (e) {
              hideSkeleton(preview);
              debugLog('auto-summarize setup failed', e);
            }
          }
        }
      } catch (e) { status.textContent = 'Status: error'; toast('Scan failed: ' + (e && e.message)); showError('Scan failed: ' + (e && e.message), async () => { try { btnScan.click(); } catch(_) {} }); announce('Scan failed'); }
      removeLoadingFromButton(btnScan, 'Scan Chat');
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
        } else if (transView.classList.contains('cb-view-active') && transSourceText && transSourceText.textContent && transSourceText.textContent !== '(no conversation found)' && transSourceText.textContent !== '(no result)') {
          txt = transSourceText.textContent;
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

    // Knowledge Graph: Open graph view and render visualization
    btnKnowledgeGraph.addEventListener('click', async () => {
      try {
        closeAllViews();
        graphView.classList.add('cb-view-active');
        const simulationPromise = renderKnowledgeGraph();
        // Let simulation run in background (no need to block UI opening)
      } catch (e) {
        toast('Failed to open knowledge graph');
        debugLog('Knowledge Graph open error', e);
      }
    });

    // Knowledge Graph: Close view
    btnCloseGraph.addEventListener('click', () => {
      graphView.classList.remove('cb-view-active');
    });

    // ============================================
    // SMART WORKSPACE / INSIGHTS HANDLERS
    // ============================================

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

    // Knowledge Graph: Refresh visualization
    btnRefreshGraph.addEventListener('click', async () => {
      try {
        addLoadingToButton(btnRefreshGraph, 'Refreshing…');
        announce('Refreshing knowledge graph');
        try { showSkeleton(graphStats, 80); } catch(e){}
        const simulationPromise = renderKnowledgeGraph();
        // Wait for simulation to complete before showing "done" toast
        await Promise.race([simulationPromise, new Promise(r => setTimeout(r, 5000))]);
        try { hideSkeleton(graphStats); } catch(e){}
        toast('Graph refreshed');
        announce('Knowledge graph refreshed');
      } catch (e) {
        toast('Refresh failed');
        showError('Graph refresh failed', async () => { try { btnRefreshGraph.click(); } catch(_) {} });
        debugLog('Graph refresh error', e);
      } finally {
        removeLoadingFromButton(btnRefreshGraph, 'Refresh');
      }
    });

    // Knowledge Graph: Export PNG via Gemini (if available) or fallback to canvas snapshot
    btnExportPNG.addEventListener('click', async () => {
      try {
        // Ensure graph data exists and graph is rendered
        const kg = await loadKnowledgeGraph();
        if (!kg || !kg.length) {
          toast('No knowledge graph data found — exporting canvas snapshot instead');
          // still try to render canvas (may show "no data")
          const simulationPromise = renderKnowledgeGraph();
          // Wait for simulation to complete (or timeout after 5s)
          await Promise.race([simulationPromise, new Promise(r => setTimeout(r, 5000))]);
          try {
            const canvas = graphCanvas;
            const scale = 2;
            const tmp = document.createElement('canvas');
            tmp.width = canvas.width * scale;
            tmp.height = canvas.height * scale;
            const tctx = tmp.getContext('2d');
            tctx.fillStyle = '#0b0f17';
            tctx.fillRect(0, 0, tmp.width, tmp.height);
            tctx.drawImage(canvas, 0, 0, tmp.width, tmp.height);
            const dataUrl = tmp.toDataURL('image/png');
            const a = document.createElement('a'); a.href = dataUrl; a.download = `chatbridge-graph-${Date.now()}.png`; a.click();
            toast('Graph exported as PNG (canvas snapshot)');
            return;
          } catch (e) { debugLog('fallback canvas export failed', e); toast('Export failed'); return; }
        }

        const simulationPromise = renderKnowledgeGraph();
        // Wait for force-directed layout to settle (or timeout after 5s)
        await Promise.race([simulationPromise, new Promise(r => setTimeout(r, 5000))]);
        toast('Preparing graph for export...');

        // Build a descriptive prompt for Imagen 3 to generate the graph visualization
        const convs = await loadConversationsAsync();
        const nodeCount = kg.length;
        const topEntities = Array.from(new Set([].concat(...(kg.map(k => k.entities || []))))).slice(0,8);
        const topThemes = Array.from(new Set([].concat(...(kg.map(k => k.themes || []))))).slice(0,8);
        const platforms = Array.from(new Set(kg.map(k => {
          const c = convs.find(cv => cv.id === k.id);
          return c?.platform || 'unknown';
        }).filter(Boolean))).slice(0,5);
        
        const prompt = `Create a beautiful, high-quality network graph visualization showing ${nodeCount} interconnected conversation nodes. Style: modern tech aesthetic with a dark navy background (#0b0f17). Draw circles for nodes in these colors: ChatGPT (green #10a37f), Claude (purple #9b87f5), Gemini (blue #4285f4), Copilot (cyan #00a4ef), Perplexity (indigo #6366f1). Connect related nodes with glowing golden lines (#e6cf9f). Label key nodes with these topics: ${topThemes.slice(0,5).join(', ')}. Show a knowledge graph that emphasizes clusters and connections between AI conversations. Platforms: ${platforms.join(', ')}. Entities discussed: ${topEntities.join(', ')}. Professional, clean, and data-driven visualization.`;

        // Ask background to generate image via Imagen 3
        let geminiImage = null;
        try {
          debugLog('Requesting Imagen 3 generation with prompt:', prompt.slice(0, 150) + '...');
          const resp = await new Promise(res => {
            try {
              chrome.runtime.sendMessage({ type: 'generate_image', payload: { model: 'imagen-3.0-generate-001', prompt } }, (r) => {
                if (chrome.runtime.lastError) return res({ ok: false, error: chrome.runtime.lastError.message });
                return res(r || { ok: false });
              });
            } catch (e) { return res({ ok: false, error: e && e.message }); }
          });
          debugLog('gemini image response', resp);
          if (resp && resp.ok && resp.imageBase64) geminiImage = resp.imageBase64;
        } catch (e) { debugLog('gemini image request failed', e); }

        // Helper: check if an image (dataURL) is mostly black
        const isMostlyBlack = async (dataUrl) => {
          return new Promise((res) => {
            try {
              const img = new Image();
              img.onload = () => {
                try {
                  const c = document.createElement('canvas');
                  c.width = Math.min(img.width, 300);
                  c.height = Math.min(img.height, 300);
                  const cx = c.getContext('2d');
                  cx.drawImage(img, 0, 0, c.width, c.height);
                  const d = cx.getImageData(0, 0, c.width, c.height).data;
                  let black = 0, total = 0;
                  for (let i = 0; i < d.length; i += 4 * 10) { // sample every 10th pixel
                    const r = d[i], g = d[i+1], b = d[i+2];
                    total++;
                    if (r < 12 && g < 12 && b < 12) black++;
                  }
                  res((black / Math.max(1,total)) > 0.95);
                } catch (e) { res(false); }
              };
              img.onerror = () => res(false);
              img.src = dataUrl;
            } catch (e) { res(false); }
          });
        };

        // If we have an image from Gemini, validate it (avoid pure-black images)
        if (geminiImage) {
          try {
            const dataUrl = 'data:image/png;base64,' + geminiImage;
            const black = await isMostlyBlack(dataUrl);
            if (!black) {
              const a = document.createElement('a'); a.href = dataUrl; a.download = `chatbridge-graph-${Date.now()}.png`; a.click();
              toast('Graph exported as PNG (generated by Gemini)');
              return;
            } else {
              debugLog('Gemini image appears mostly black, falling back to canvas snapshot');
            }
          } catch (e) { debugLog('gemini image validation failed', e); }
        }

        // Fallback: capture canvas snapshot
        try {
          const canvas = graphCanvas;
          const scale = 2;
          const tmp = document.createElement('canvas');
          tmp.width = canvas.width * scale;
          tmp.height = canvas.height * scale;
          const tctx = tmp.getContext('2d');
          tctx.fillStyle = '#0b0f17';
          tctx.fillRect(0, 0, tmp.width, tmp.height);
          tctx.drawImage(canvas, 0, 0, tmp.width, tmp.height);
          const dataUrl = tmp.toDataURL('image/png');
          const a = document.createElement('a'); a.href = dataUrl; a.download = `chatbridge-graph-${Date.now()}.png`; a.click();
          toast('Graph exported as PNG (canvas snapshot)');
        } catch (e) {
          toast('Export PNG failed');
          debugLog('Export PNG failed', e);
        }
      } catch (e) {
        toast('Export PNG failed');
        debugLog('Export PNG error', e);
      }
    });

    // Knowledge Graph: Export HTML snapshot (standalone page embedding canvas image)
    btnExportHTML.addEventListener('click', async () => {
      try {
        const simulationPromise = renderKnowledgeGraph();
        // Wait for force-directed layout to complete (or timeout after 5s)
        await Promise.race([simulationPromise, new Promise(r => setTimeout(r, 5000))]);
        const canvas = graphCanvas;
        let dataUrl = '';
        try { dataUrl = canvas.toDataURL('image/png'); } catch (e) { dataUrl = ''; }

        const html = `<!doctype html>\n<html><head><meta charset="utf-8"><title>ChatBridge Knowledge Graph</title><style>body{margin:0;background:#0A0F1C;color:#E6E9F0;font-family:Arial,sans-serif} .wrap{padding:18px}</style></head><body><div class="wrap"><h2>ChatBridge Knowledge Graph (snapshot)</h2><p>Generated: ${new Date().toLocaleString()}</p>${dataUrl ? `<img src="${dataUrl}" alt="Knowledge graph snapshot" style="max-width:100%;height:auto;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,0.5)" />` : '<p>(Preview unavailable)</p>'}</div></body></html>`;

        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chatbridge-graph-snapshot-${Date.now()}.html`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast('Graph snapshot exported (HTML)');
      } catch (e) {
        toast('Export HTML failed');
        debugLog('Export HTML error', e);
      }
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
          // If a summary exists, restore that instead of the full chat
          let formatted = '';
          if (sel.summary && typeof sel.summary === 'string' && sel.summary.trim().length > 0) {
            formatted = sel.summary.trim();
          } else {
            formatted = sel.conversation.map(m => (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.text).join('\n\n') + '\n\n🔄 Please continue the conversation.';
          }
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

        // populate smart suggestions (chips) and placeholder
        try { await populateSmartSuggestions(); } catch(e) { debugLog('populateSmartSuggestions failed', e); }

        smartView.classList.add('cb-view-active');
      } catch (e) { toast('Failed to open Smart Query'); debugLog('open smart view', e); }
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
          toast('⚠️ AI search unavailable. Add OpenAI API key in Options for semantic search. Using basic search...');
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
        if (!lastSmartResults || !lastSmartResults.length) { toast('No search results to provide context. Run Search first.'); return; }
  btnSmartAsk.disabled = true; addLoadingToButton(btnSmartAsk, 'Asking…'); smartAnswer.textContent = ''; announce('Asking AI for an answer');
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

    // Normalize tags (migration) for all saved conversations and re-index them
    btnNormalizeTags.addEventListener('click', async () => {
      try {
  const prev = btnNormalizeTags.textContent;
  addLoadingToButton(btnNormalizeTags, 'Normalizing...');
        smartAnswer.textContent = '';

        // load conversations
        const convs = await loadConversationsAsync();
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
                txt.textContent = `${host} • ${count} msgs • ${timeStr}`;
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
            historyEl.removeEventListener('scroll', historyEl.__virtScroll || (()=>{}));
            historyEl.__virtScroll = () => render();
            historyEl.addEventListener('scroll', historyEl.__virtScroll);
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

    // Auto-summarize if more than 10 messages
    let summary = '';
    if (normalized.length > 10) {
      try {
        // Compose summary prompt in your required format
        const summaryPrompt = `Summarize the following chat in this format:\n\n[Summary]\n- Main points\n- Key actions\n- Decisions\n- Next steps\n\nChat:\n${normalized.map(m => (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.text).join('\n')}`;
        // Call Gemini or your LLM for summary
        const res = await callGeminiAsync({ action: 'prompt', text: summaryPrompt, length: 'medium' });
        if (res && res.ok && res.result) {
          summary = res.result.trim();
        }
      } catch (e) { debugLog('auto-summarize failed', e); }
    }

    // Save conversation with summary if present
    try {
      const convObj = {
        ts: Date.now(),
        id: String(Date.now()),
        platform: (function(){ try { return new URL(location.href).hostname; } catch(_) { return location.hostname || 'unknown'; } })(),
        url: location.href,
        conversation: normalized,
      };
      if (summary) convObj.summary = summary;
      await saveConversation(convObj);
    } catch (e) { debugLog('auto-save failed', e); }

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
      // persist to BOTH localStorage (page-local) AND chrome.storage.local (extension-wide)
      const key = 'chatbridge:conversations';

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

