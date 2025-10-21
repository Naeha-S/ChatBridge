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

  // avoid const redeclaration causing SyntaxError in some injection scenarios
  var CB_MAX_MESSAGES = (typeof window !== 'undefined' && window.__CHATBRIDGE && window.__CHATBRIDGE.MAX_MESSAGES) ? window.__CHATBRIDGE.MAX_MESSAGES : 200;
  const DOM_STABLE_MS = 600;
  const DOM_STABLE_TIMEOUT_MS = 8000;
  const SCROLL_MAX_STEPS = 25;
  const SCROLL_STEP_PAUSE_MS = 320;
  const DEBUG = !!(typeof window !== 'undefined' && window.__CHATBRIDGE_DEBUG === true);

  function debugLog(...args) { if (!DEBUG) return; try { console.debug('[ChatBridge]', ...args); } catch (e) {} }

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

  function normalizeMessages(raw, maxMessages) {
    maxMessages = (typeof maxMessages === 'number' && maxMessages > 0) ? maxMessages : CB_MAX_MESSAGES;
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const m of raw) {
      if (!m || !m.text) continue;
      const text = (m.text || '').replace(/\s+/g, ' ').trim(); if (!text) continue;
      const role = (m.role === 'user') ? 'user' : 'assistant'; const prev = out[out.length - 1];
      if (!prev || prev.text !== text || prev.role !== role) out.push({ role, text });
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
    if (document.getElementById('cb-host')) return null;
  const avatar = document.createElement('div'); avatar.id = 'cb-avatar'; avatar.setAttribute('data-cb-ignore', 'true'); avatar.textContent = '⚡';
  // store last scanned text so Clipboard and textarea can access it
  let lastScannedText = '';
  // Slightly larger avatar, pulled in from the corner and with a gold border
  avatar.style.cssText = 'position:fixed;bottom:22px;right:26px;width:48px;height:48px;border-radius:12px;z-index:2147483646;display:flex;align-items:center;justify-content:center;cursor:pointer;background:linear-gradient(180deg,#0b1220,#071022);color:#d4af77;box-shadow:0 6px 20px rgba(2,6,23,0.6);font-size:20px;border:3px solid rgba(212,175,119,0.95);transition: transform .12s ease, box-shadow .12s ease;';
  avatar.addEventListener('mouseenter', () => { avatar.style.transform = 'translateY(-2px)'; avatar.style.boxShadow = '0 10px 26px rgba(212,175,119,0.15)'; });
  avatar.addEventListener('mouseleave', () => { avatar.style.transform = ''; avatar.style.boxShadow = '0 6px 20px rgba(2,6,23,0.6)'; });
    const host = document.createElement('div'); host.id = 'cb-host'; host.setAttribute('data-cb-ignore', 'true'); host.style.display = 'none';
    document.body.appendChild(avatar); document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    // High-end professional dark theme styling inside shadow DOM
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
      :host { all: initial; }
  .cb-panel { box-sizing: border-box; position:fixed; top:12px; right:12px; width:380px; max-height:86vh; overflow-y:auto; overflow-x:hidden; border-radius:14px; background: linear-gradient(180deg, rgba(9,13,22,0.97), rgba(8,18,34,0.98)); color:#d4af77 !important; font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; z-index:2147483647; box-shadow: 0 12px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); backdrop-filter: blur(10px); }
  .cb-panel::-webkit-scrollbar { width: 10px; }
  .cb-panel::-webkit-scrollbar-track { background: #0b0f17; border-radius: 10px; }
  .cb-panel::-webkit-scrollbar-thumb { background: linear-gradient(180deg, rgba(212,175,119,0.8), rgba(212,175,119,0.55)); border-radius: 10px; border: 2px solid #0b0f17; }
  .cb-panel::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, rgba(212,175,119,1), rgba(212,175,119,0.7)); }
  .cb-header { display:flex; flex-direction:row; align-items:flex-start; justify-content:space-between; padding:14px 18px 8px 18px; gap:6px; border-bottom: 1px solid rgba(255,255,255,0.04); }
      .cb-title { font-weight:900; font-size:20px; letter-spacing:0.5px; color:#ffe7b3; text-shadow:0 2px 12px #1a1a1a; }
      .cb-subtitle { font-size:13px; color:#d4af77; font-weight:500; margin-top:2px; margin-bottom:2px; letter-spacing:0.3px; }
  .cb-actions { padding:12px 16px 8px 16px; display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:space-between; }
  .cb-actions-left, .cb-actions-right { display:flex; gap:8px; align-items:center; }
  .cb-actions .cb-btn { min-width:0; padding:8px 12px; }
      .cb-btn { background: linear-gradient(180deg, rgba(40,40,60,0.98), rgba(20,20,30,0.98)); border:1px solid rgba(255,255,255,0.12); color:#d4af77 !important; padding:10px 12px; border-radius:10px; cursor:pointer; font-size:14px; transition: all .15s ease; font-weight:600; }
      .cb-btn:hover { transform:translateY(-1px); box-shadow: 0 8px 18px rgba(210,180,120,0.18); border-color: rgba(255,255,255,0.22); background: linear-gradient(180deg, #2a2a3a, #18181f); }
      .cb-btn-primary { background: linear-gradient(180deg, #f3e4b9, #d2b478); color:#000 !important; font-weight:900; border: 1px solid rgba(0,0,0,0.18); }
      .cb-btn-primary:hover { box-shadow: 0 10px 24px rgba(210,180,120,0.35); }
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
      .cb-history::-webkit-scrollbar-thumb { background: linear-gradient(180deg, rgba(212,175,119,0.6), rgba(212,175,119,0.4)); border-radius: 10px; border: 2px solid rgba(20,20,30,0.4); }
      .cb-history::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, rgba(212,175,119,0.8), rgba(212,175,119,0.6)); }
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
  @keyframes cb-ellipsis { 0% { opacity:0.25; transform: translateY(0); } 30% { opacity:1; transform: translateY(-2px); } 60% { opacity:0.25; transform: translateY(0); } 100% { opacity:0.25; transform: translateY(0); } }
    `;
    shadow.appendChild(style);

    const panel = document.createElement('div'); panel.className = 'cb-panel';
    // Header: Title and subtitle
    const header = document.createElement('div'); header.className = 'cb-header';
    const title = document.createElement('div'); title.className = 'cb-title'; title.textContent = '⚡ ChatBridge';
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

  const btnScan = document.createElement('button'); btnScan.className = 'cb-btn cb-btn-primary'; btnScan.textContent = '📸 Scan Chat'; btnScan.title = 'Scan the visible chat on the page';
  const btnRestore = document.createElement('button'); btnRestore.className = 'cb-btn'; btnRestore.textContent = '♻️ Restore'; btnRestore.title = 'Restore saved conversation into current chat';
  const btnClipboard = document.createElement('button'); btnClipboard.className = 'cb-btn'; btnClipboard.textContent = '📋 Clipboard'; btnClipboard.title = 'Copy scanned chat to clipboard';

  // Gemini API buttons (keep on the right)
  // Sync Tone: replace old Prompt button with a model-to-model tone sync UI
  const syncWrapper = document.createElement('div'); syncWrapper.style.display = 'flex'; syncWrapper.style.alignItems = 'center'; syncWrapper.style.gap = '6px';

  // Replace compact main-page model selects with a single Sync Tone launcher button to reduce UI clutter
  const btnSyncTone = document.createElement('button'); btnSyncTone.className = 'cb-btn'; btnSyncTone.textContent = '🎚️ Sync Tone'; btnSyncTone.title = 'Rewrite the scanned conversation to match another model\'s tone';
  syncWrapper.appendChild(btnSyncTone);
  const btnSummarize = document.createElement('button'); btnSummarize.className = 'cb-btn'; btnSummarize.textContent = '📝 Summarize'; btnSummarize.title = 'Distill long chats into short summaries';
  const btnRewrite = document.createElement('button'); btnRewrite.className = 'cb-btn'; btnRewrite.textContent = '✍️ Rewrite'; btnRewrite.title = 'Improve tone and readability of scraped messages';
  const btnTranslate = document.createElement('button'); btnTranslate.className = 'cb-btn'; btnTranslate.textContent = '🌐 Translate'; btnTranslate.title = 'Translate chats between languages';

  actionsLeft.appendChild(btnScan);
  actionsLeft.appendChild(btnRestore);
  actionsLeft.appendChild(btnClipboard);
  actionsRight.appendChild(syncWrapper);
  actionsRight.appendChild(btnSummarize);
  actionsRight.appendChild(btnRewrite);
  actionsRight.appendChild(btnTranslate);
  actions.appendChild(actionsLeft);
  actions.appendChild(actionsRight);
  panel.appendChild(actions);

    // Toolbar with Chat dropdown
    const toolbar = document.createElement('div'); toolbar.className = 'cb-toolbar';
    const lab = document.createElement('div'); lab.className = 'cb-label'; lab.textContent = '💬 Select Chat';
    const chatSelect = document.createElement('select'); chatSelect.className = 'cb-select'; chatSelect.id = 'cb-chat-select';
    toolbar.appendChild(lab); toolbar.appendChild(chatSelect);
    panel.appendChild(toolbar);

  // Toolbar preview (moved above the Gemini textarea)
  const preview = document.createElement('div'); preview.className = 'cb-preview'; preview.textContent = 'Preview: (none)';

  // --- Internal views (Sync Tone, Summarize, Rewrite, Translate) - inline sections ---
  
  // Sync Tone view
  const syncView = document.createElement('div'); syncView.className = 'cb-internal-view'; syncView.id = 'cb-sync-view'; syncView.setAttribute('data-cb-ignore','true');
  const syncTop = document.createElement('div'); syncTop.className = 'cb-view-top';
  const syncTitle = document.createElement('div'); syncTitle.className = 'cb-view-title'; syncTitle.textContent = '🎚️ Sync Tone';
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
  const btnGoSync = document.createElement('button'); btnGoSync.className = 'cb-btn cb-view-go'; btnGoSync.textContent = '🎚️ Sync Tone';
  syncView.appendChild(btnGoSync);
  const syncProg = document.createElement('span'); syncProg.className = 'cb-progress'; syncProg.style.display = 'none'; syncView.appendChild(syncProg);
  const btnInsertSync = document.createElement('button'); btnInsertSync.className = 'cb-btn cb-view-go'; btnInsertSync.textContent = '📥 Insert to Chat'; btnInsertSync.style.display = 'none';
  syncView.appendChild(btnInsertSync);
  const syncResult = document.createElement('div'); syncResult.className = 'cb-view-result'; syncResult.id = 'cb-sync-result'; syncResult.textContent = '';
  syncView.appendChild(syncResult);

  // Summarize view
  const summView = document.createElement('div'); summView.className = 'cb-internal-view'; summView.id = 'cb-summ-view'; summView.setAttribute('data-cb-ignore','true');
  const summTop = document.createElement('div'); summTop.className = 'cb-view-top';
  const summTitle = document.createElement('div'); summTitle.className = 'cb-view-title'; summTitle.textContent = '📝 Summarize';
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
  const btnGoSumm = document.createElement('button'); btnGoSumm.className = 'cb-btn cb-view-go'; btnGoSumm.textContent = '📝 Summarize';
  summView.appendChild(btnGoSumm);
  const summProg = document.createElement('span'); summProg.className = 'cb-progress'; summProg.style.display = 'none'; summView.appendChild(summProg);
  const btnInsertSumm = document.createElement('button'); btnInsertSumm.className = 'cb-btn cb-view-go'; btnInsertSumm.textContent = '📥 Insert to Chat'; btnInsertSumm.style.display = 'none';
  summView.appendChild(btnInsertSumm);
  const summResult = document.createElement('div'); summResult.className = 'cb-view-result'; summResult.id = 'cb-summ-result'; summResult.textContent = '';
  summView.appendChild(summResult);

  // Rewrite view
  const rewView = document.createElement('div'); rewView.className = 'cb-internal-view'; rewView.id = 'cb-rew-view'; rewView.setAttribute('data-cb-ignore','true');
  const rewTop = document.createElement('div'); rewTop.className = 'cb-view-top';
  const rewTitle = document.createElement('div'); rewTitle.className = 'cb-view-title'; rewTitle.textContent = '✍️ Rewrite';
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
  const btnGoRew = document.createElement('button'); btnGoRew.className = 'cb-btn cb-view-go'; btnGoRew.textContent = '✍️ Rewrite';
  rewView.appendChild(btnGoRew);
  const rewProg = document.createElement('span'); rewProg.className = 'cb-progress'; rewProg.style.display = 'none'; rewView.appendChild(rewProg);
  const btnInsertRew = document.createElement('button'); btnInsertRew.className = 'cb-btn cb-view-go'; btnInsertRew.textContent = '📥 Insert to Chat'; btnInsertRew.style.display = 'none';
  rewView.appendChild(btnInsertRew);
  const rewResult = document.createElement('div'); rewResult.className = 'cb-view-result'; rewResult.id = 'cb-rew-result'; rewResult.textContent = '';
  rewView.appendChild(rewResult);

  // Translate view
  const transView = document.createElement('div'); transView.className = 'cb-internal-view'; transView.id = 'cb-trans-view'; transView.setAttribute('data-cb-ignore','true');
  const transTop = document.createElement('div'); transTop.className = 'cb-view-top';
  const transTitle = document.createElement('div'); transTitle.className = 'cb-view-title'; transTitle.textContent = '🌐 Translate';
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
  const btnGoTrans = document.createElement('button'); btnGoTrans.className = 'cb-btn cb-view-go'; btnGoTrans.textContent = '🌐 Translate';
  transView.appendChild(btnGoTrans);
  const transProg = document.createElement('span'); transProg.className = 'cb-progress'; transProg.style.display = 'none'; transView.appendChild(transProg);
  const btnInsertTrans = document.createElement('button'); btnInsertTrans.className = 'cb-btn cb-view-go'; btnInsertTrans.textContent = '📥 Insert to Chat'; btnInsertTrans.style.display = 'none';
  transView.appendChild(btnInsertTrans);
  const transResult = document.createElement('div'); transResult.className = 'cb-view-result'; transResult.id = 'cb-trans-result'; transResult.textContent = '';
  transView.appendChild(transResult);

  // Append all internal views to the panel (after actions, before status)
  panel.appendChild(syncView);
  panel.appendChild(summView);
  panel.appendChild(rewView);
  panel.appendChild(transView);

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

    btnGoSync.addEventListener('click', async () => {
      try {
  btnGoSync.disabled = true; btnGoSync.innerHTML = '⏳ Syncing <span class="cb-dots"><span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></span>'; syncResult.textContent = ''; btnInsertSync.style.display = 'none';
        syncProg.style.display = 'inline'; updateProgress(syncProg, 'sync', { phase: 'preparing' });
        const chatText = (syncSourceText && syncSourceText.textContent) ? syncSourceText.textContent : '';
        const target = (syncTargetSelect && syncTargetSelect.value) || 'TargetModel';
        if (!chatText || chatText.trim().length < 10) { toast('No conversation to sync'); btnGoSync.disabled = false; btnGoSync.textContent = '🎚️ Sync Tone'; return; }

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
        syncProg.style.display = 'none';
  // No duplicate output in preview; go straight to history below
        toast('Sync Tone completed');
      } catch (err) {
        toast('Sync Tone failed: ' + (err && err.message ? err.message : err));
      } finally { btnGoSync.disabled = false; btnGoSync.textContent = '🎚️ Sync Tone'; }
    });

    btnInsertSync.addEventListener('click', () => {
      try {
        const text = syncSourceText.textContent || '';
        if (!text || text === '(no result)') { toast('Nothing to insert'); return; }
        restoreToChat(text);
      } catch (e) { toast('Insert failed'); }
    });

    // Scan button handler: scan, normalize, save, and optionally auto-summarize
    btnScan.addEventListener('click', async () => {
      btnScan.disabled = true; status.textContent = 'Status: scanning...';
      try {
  const msgs = await scanChat();
  // persist lastScannedText for clipboard and Sync view
  try { if (Array.isArray(msgs) && msgs.length) { lastScannedText = msgs.map(m => `${m.role}: ${m.text}`).join('\n\n'); } } catch (e) {}
  if (!msgs || !msgs.length) { status.textContent = 'Status: no messages'; toast('No messages found in current chat'); }
        else {
          const final = normalizeMessages(msgs);
          const conv = { platform: location.hostname, url: location.href, ts: Date.now(), conversation: final };
          // ensure lastScannedText updated when saving
          try { lastScannedText = final.map(m => `${m.role}: ${m.text}`).join('\n\n'); } catch (e) {}
          if (typeof window.saveConversation === 'function') {
            window.saveConversation(conv, () => { toast('Saved ' + final.length + ' messages'); refreshHistory(); });
          } else {
            const key = 'chatbridge:conversations'; const cur = JSON.parse(localStorage.getItem(key) || '[]'); cur.push(conv); localStorage.setItem(key, JSON.stringify(cur)); toast('Saved (local) ' + final.length + ' messages'); refreshHistory();
          }
          status.textContent = `Status: saved ${final.length}`;

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
      btnScan.disabled = false;
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

    // Helper: restore arbitrary text into the visible chat input on the page
    function restoreToChat(text) {
      try {
        let input = null;
        // broaden candidates and avoid picking extension elements
        const candidates = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], input[type="text"], div[role="textbox"]'));
        for (const el of candidates) {
          try {
            // skip extension host and hidden/offscreen elements
            if (el.closest && el.closest('#cb-host')) continue;
            const cs = window.getComputedStyle(el);
            if (cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0' && el.offsetWidth > 0 && el.offsetHeight > 0) { input = el; break; }
          } catch (e) {}
        }
        if (input && input.isContentEditable) {
          input.textContent = text;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus(); input.blur();
          toast('Restored to chat');
          return true;
        } else if (input) {
          input.value = text;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus(); input.blur();
          // poke keydown for some frameworks
          try { input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ' ' })); } catch(e) {}
          setTimeout(() => { try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch(e){} }, 60);
          try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch(e){}
          toast('Restored to chat');
          return true;
        }
      } catch (e) {}
      try { navigator.clipboard.writeText(text).then(()=>toast('Copied to clipboard')) } catch(e) { toast('Copied to clipboard'); }
      return false;
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
              toast('Restored conversation');
            } else throw new Error('no input');
          } catch (e) {
            console.log('[ChatBridge Restore] Error during restore:', e);
            navigator.clipboard.writeText(formatted).then(()=>toast('Copied to clipboard (fallback)'));
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
  btnGoSumm.disabled = true; btnGoSumm.innerHTML = '⏳ Summarizing <span class="cb-dots"><span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></span>'; summResult.textContent = ''; btnInsertSumm.style.display = 'none';
        summProg.style.display = 'inline'; updateProgress(summProg, 'summarize', { phase: 'preparing' });
        const chatText = (summSourceText && summSourceText.textContent) ? summSourceText.textContent : '';
        if (!chatText || chatText.trim().length < 10) { toast('No conversation to summarize'); btnGoSumm.disabled = false; btnGoSumm.textContent = '📝 Summarize'; return; }

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
      } finally { btnGoSumm.disabled = false; btnGoSumm.textContent = '📝 Summarize'; }
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
  btnGoRew.disabled = true; btnGoRew.innerHTML = '⏳ Rewriting <span class="cb-dots"><span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></span>'; rewResult.textContent = ''; btnInsertRew.style.display = 'none';
        rewProg.style.display = 'inline'; updateProgress(rewProg, 'rewrite', { phase: 'preparing' });
        const chatText = (rewSourceText && rewSourceText.textContent) ? rewSourceText.textContent : '';
        const style = (rewStyleSelect && rewStyleSelect.value) || 'normal';
        if (!chatText || chatText.trim().length < 10) { toast('No conversation to rewrite'); btnGoRew.disabled = false; btnGoRew.textContent = '✍️ Rewrite'; return; }

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
      } finally { btnGoRew.disabled = false; btnGoRew.textContent = '✍️ Rewrite'; }
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
  btnGoTrans.disabled = true; btnGoTrans.innerHTML = '⏳ Translating <span class="cb-dots"><span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></span>'; transResult.textContent = ''; btnInsertTrans.style.display = 'none';
        transProg.style.display = 'inline'; updateProgress(transProg, 'translate', { phase: 'preparing' });
        const chatText = (transSourceText && transSourceText.textContent) ? transSourceText.textContent : '';
        const lang = (transLangSelect && transLangSelect.value) || 'Japanese';
        if (!chatText || chatText.trim().length < 10) { toast('No conversation to translate'); btnGoTrans.disabled = false; btnGoTrans.textContent = '🌐 Translate'; return; }

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
      } finally { btnGoTrans.disabled = false; btnGoTrans.textContent = '🌐 Translate'; }
    });

    btnInsertTrans.addEventListener('click', () => {
      try {
        const text = (transSourceText && transSourceText.textContent) || '';
        if (!text || text === '(no result)') { toast('Nothing to insert'); return; }
        restoreToChat(text);
      } catch (e) { toast('Insert failed'); }
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
      const pick = (typeof window.pickAdapter === 'function') ? window.pickAdapter : null;
      const adapter = pick ? pick() : null;
      // prefer container near the input/composer when available to avoid picking sidebars
      let container = null;
      try {
        const inputEl = (adapter && typeof adapter.getInput === 'function') ? adapter.getInput() : (document.querySelector('textarea, [contenteditable="true"], input[type=text]'));
        if (inputEl) {
          try {
            if (typeof window.findChatContainerNearby === 'function') {
              container = window.findChatContainerNearby(inputEl) || null;
            } else {
              // fallback: climb parents searching for an element with multiple message-like children
              let p = inputEl.parentElement; let found = null; let depth = 0;
              while (p && depth < 10 && !found) {
                try { 
                  const cnt = (p.querySelectorAll && p.querySelectorAll('p, .message, .chat-line, .message-text, .markdown, .prose, .result, .chat-bubble').length) || 0;
                  // Require container to be reasonably wide (not a narrow sidebar)
                  const rect = p.getBoundingClientRect();
                  if (cnt >= 2 && rect.width > 400) found = p;
                } catch (e) {}
                p = p.parentElement; depth++;
              }
              container = found || null;
            }
          } catch (e) { container = null; }
        }
      } catch (e) { container = null; }
      container = container || (adapter && adapter.scrollContainer && adapter.scrollContainer()) || document.querySelector('main') || document.body;
      
      // Final validation - if chosen container is too narrow, try main or body
      try {
        const rect = container.getBoundingClientRect();
        if (rect.width < 400) {
          debugLog('chosen container too narrow (' + rect.width + 'px), falling back to main/body');
          container = document.querySelector('main') || document.body;
        }
      } catch (e) {}
      
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
          containerWidth: container && Math.round(container.getBoundingClientRect().width)
        }; 
      } catch (e) {}
      await scrollContainerToTop(container);
      await waitForDomStability(container);
      let raw = [];
      try { if (adapter && typeof adapter.getMessages === 'function') raw = adapter.getMessages() || []; } catch (e) { debugLog('adapter.getMessages error', e); }
      if ((!raw || !raw.length) && typeof window.AdapterGeneric !== 'undefined' && typeof window.AdapterGeneric.getMessages === 'function') {
        try { raw = window.AdapterGeneric.getMessages() || []; } catch (e) { debugLog('AdapterGeneric failed', e); }
      }
      if (!raw || !raw.length) {
        const sel = '.message, .chat-line, .message-text, .markdown, .prose, p, li, div'; let nodes = [];
        try { nodes = Array.from((container || document).querySelectorAll(sel)); } catch (e) { nodes = Array.from(document.querySelectorAll('p,div,li')); }
        nodes = nodes.filter(n => n && n.innerText && n.closest && !n.closest('[data-cb-ignore], #cb-host'));
        nodes = filterCandidateNodes(nodes);
  try { if (window.ChatBridge && window.ChatBridge._lastScan) window.ChatBridge._lastScan.nodesConsidered = nodes.length; } catch (e) {}
  // optionally highlight nodes for debug
  try { if (CB_HIGHLIGHT_ENABLED || DEBUG) highlightNodesByElements(nodes); } catch (e) {}
  raw = nodes.map(n => ({ text: (n.innerText||'').trim(), role: inferRoleFromNode(n), el: n }));
      }
    try { if (window.ChatBridge && window.ChatBridge._lastScan) { window.ChatBridge._lastScan.messageCount = (raw && raw.length) || 0; } } catch (e) {}
    try { if (window.ChatBridge && typeof window.ChatBridge._renderLastScan === 'function') window.ChatBridge._renderLastScan(); } catch (e) {}
    return normalizeMessages(raw || []);
    } catch (e) { debugLog('scan error', e); return []; }
  }

  async function saveConversation(conv) {
    try { if (typeof window.saveConversation === 'function') { window.saveConversation(conv, ()=>{}); return true; } const key = 'chatbridge:conversations'; const cur = JSON.parse(localStorage.getItem(key) || '[]'); cur.push(conv); localStorage.setItem(key, JSON.stringify(cur)); return true; } catch (e) { debugLog('save error', e); return false; }
  }

  // expose minimal API on window
  window.ChatBridge = window.ChatBridge || {};
  window.ChatBridge.scanChat = scanChat;
  window.ChatBridge.saveConversation = saveConversation;
  window.ChatBridge.highlightScan = function(enable) { try { CB_HIGHLIGHT_ENABLED = !!enable; if (!CB_HIGHLIGHT_ENABLED) clearHighlights(); else ensureHighlightStyles(); return CB_HIGHLIGHT_ENABLED; } catch (e) { return false; } };

  // bootstrap UI and auto-scan
  try { injectUI(); setTimeout(async ()=>{ const msgs = await scanChat(); if (msgs && msgs.length) { await saveConversation({ platform: location.hostname, url: location.href, ts: Date.now(), conversation: msgs }); debugLog('auto-saved', msgs.length); } }, 450); } catch (e) { debugLog('boot error', e); }

})();

