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

  function filterCandidateNodes(nodes) {
    if (!nodes || !nodes.length) return [];
    const blacklist = ['new chat','regenerate','clear','copy','download','openai','history','settings'];
    return nodes.filter(n => {
      try {
        if (!n || n.nodeType !== 1) return false;
        if (isInExtension(n)) return false;
        // skip hidden or UI elements
        if (n.closest && n.closest('[aria-hidden="true"], nav, aside, header, [role="navigation"], [role="toolbar"]')) return false;
        const anc = n.closest && n.closest('*');
        if (anc && anc.getAttribute && /suggestion|card|example|shortcut|quick|related|recommended|search-result/.test((anc.className||'') + ' ' + (anc.getAttribute('aria-label')||''))) return false;
        // exclude known response container / assistant chrome classes (Bard/Gemini style)
        const clsAll = ((n.className||'') + ' ' + (anc && anc.className || '')).toString().toLowerCase();
        if (/response-container|model-response|model-thoughts|response-content|avatar-gutter|bard-avatar|response-footer|message-actions|response-container-header/.test(clsAll)) return false;
        // avoid nodes that are primarily interactive UI (menus, buttons, inputs)
        try {
          const interactiveCount = (n.querySelectorAll && n.querySelectorAll('button,a,input,textarea,[role="menu"]').length) || 0;
          if (interactiveCount > 1) return false;
        } catch (e) {}
        // conservative: exclude nodes with many ARIA/role attributes (likely UI widgets)
        try {
          let ariaCount = 0;
          for (let i=0;i<(n.attributes||[]).length;i++) {
            const a = n.attributes[i]; if (!a) continue; const an = (a.name||'').toLowerCase(); if (an === 'role' || an.startsWith('aria-')) ariaCount++;
          }
          if (ariaCount >= 2) return false;
          if (anc && anc.attributes) {
            let a2 = 0; for (let i=0;i<anc.attributes.length;i++){ const a = anc.attributes[i]; if(!a) continue; const an=(a.name||'').toLowerCase(); if (an==='role' || an.startsWith('aria-')) a2++; }
            if (a2 >= 4) return false;
          }
        } catch(e){}
        // exclude very short nodes that sit adjacent to avatar-like elements (likely labels)
        try {
          const txt = (n.innerText || '').replace(/\s+/g,' ').trim();
          if (txt.length < 40) {
            const prev = n.previousElementSibling; const next = n.nextElementSibling;
            const nearAvatar = (prev && /(avatar|avatar-gutter|bard-avatar|avatar_primary|avatar-container)/i.test(prev.className || '')) || (next && /(avatar|avatar-gutter|bard-avatar|avatar_primary|avatar-container)/i.test(next.className || '')) || (!!n.closest && !!n.closest('[class*="avatar"]'));
            if (nearAvatar) return false;
          }
        } catch(e){}
        const text = (n.innerText || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length < 2) return false;
        const lt = text.toLowerCase();
        if (blacklist.includes(lt)) return false;
        // filter out lines that look like UI labels or suggestions
        if (/^(assistant[:\s\-]|show thinking|try:|suggested|you might|related)/i.test(text)) return false;
        const r = n.getBoundingClientRect(); if (!r || (r.width === 0 && r.height === 0)) return false;
        return true;
      } catch (e) { return false; }
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
    avatar.style.cssText = 'position:fixed;top:18px;right:18px;width:46px;height:46px;border-radius:12px;z-index:2147483646;display:flex;align-items:center;justify-content:center;cursor:pointer;background:linear-gradient(180deg,#0b1220,#071022);color:#fff;box-shadow:0 6px 20px rgba(2,6,23,0.6);font-size:20px';
    const host = document.createElement('div'); host.id = 'cb-host'; host.setAttribute('data-cb-ignore', 'true'); host.style.display = 'none';
    document.body.appendChild(avatar); document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    // Professional sidebar styling inside shadow DOM
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .cb-panel { box-sizing: border-box; position:fixed; top:12px; right:12px; width:360px; max-height:84vh; overflow:hidden; border-radius:12px; background:linear-gradient(180deg,#071022,#081a2a); color:#e6f6ff; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; z-index:2147483647; box-shadow: 0 10px 30px rgba(2,6,23,0.6); border: 1px solid rgba(255,255,255,0.04); }
      .cb-header { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; gap:8px; }
      .cb-title { font-weight:700; font-size:15px; letter-spacing:0.2px }
      .cb-actions { padding:10px 14px; display:flex; gap:8px; }
      .cb-btn { background:transparent; border:1px solid rgba(255,255,255,0.06); color:#e6f6ff; padding:8px 10px; border-radius:8px; cursor:pointer; font-size:13px }
      .cb-btn:hover { transform:translateY(-1px); box-shadow: 0 6px 14px rgba(2,6,23,0.45); }
      .cb-status { padding:0 14px 10px 14px; font-size:12px; color:#9fdfff }
      .cb-history { padding:10px 14px; max-height:260px; overflow:auto; font-size:13px; background: rgba(255,255,255,0.02); margin:10px; border-radius:8px }
      .cb-preview { padding:10px 14px; font-size:13px; color:#dbeffd; border-top:1px solid rgba(255,255,255,0.02) }
      .cb-footer { display:flex; justify-content:flex-end; gap:8px; padding:10px 14px }
      .cb-close { background:transparent; border:none; color:#9fdfff; cursor:pointer; font-size:14px }
    `;
    shadow.appendChild(style);

    const panel = document.createElement('div'); panel.className = 'cb-panel';
    const header = document.createElement('div'); header.className = 'cb-header';
    const title = document.createElement('div'); title.className = 'cb-title'; title.textContent = 'ChatBridge';
    const controls = document.createElement('div');
    const btnClose = document.createElement('button'); btnClose.className = 'cb-close'; btnClose.textContent = '✕';
    controls.appendChild(btnClose);
    header.appendChild(title); header.appendChild(controls);
    panel.appendChild(header);

    const actions = document.createElement('div'); actions.className = 'cb-actions';
    const btnScan = document.createElement('button'); btnScan.className = 'cb-btn'; btnScan.textContent = '📋 Scan Chat';
    const btnRestore = document.createElement('button'); btnRestore.className = 'cb-btn'; btnRestore.textContent = '🧠 Restore';
  const btnGenerate = document.createElement('button'); btnGenerate.className = 'cb-btn'; btnGenerate.textContent = '🤖 Generate';
  actions.appendChild(btnScan); actions.appendChild(btnRestore); actions.appendChild(btnGenerate);
    panel.appendChild(actions);

  // model and system prompt controls
  const controlsWrap = document.createElement('div'); controlsWrap.style.padding = '8px 14px'; controlsWrap.style.display = 'flex'; controlsWrap.style.flexDirection = 'column'; controlsWrap.style.gap = '8px';
  const modelSelect = document.createElement('select'); modelSelect.style.padding = '8px'; modelSelect.style.borderRadius = '8px';
  ['gpt-4o-mini','gpt-4o','gpt-4','gpt-3.5-turbo'].forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; modelSelect.appendChild(o); });
  const sysPrompt = document.createElement('textarea'); sysPrompt.placeholder = 'System prompt (optional)'; sysPrompt.style.padding = '8px'; sysPrompt.style.borderRadius = '8px'; sysPrompt.style.height = '64px'; sysPrompt.style.resize = 'vertical';
  controlsWrap.appendChild(modelSelect); controlsWrap.appendChild(sysPrompt);
  panel.appendChild(controlsWrap);

    const status = document.createElement('div'); status.className = 'cb-status'; status.textContent = 'Status: idle'; panel.appendChild(status);
    const historyEl = document.createElement('div'); historyEl.className = 'cb-history'; historyEl.textContent = 'No sessions yet.'; panel.appendChild(historyEl);
    const preview = document.createElement('div'); preview.className = 'cb-preview'; preview.textContent = 'Preview: (none)'; panel.appendChild(preview);
    const footer = document.createElement('div'); footer.className = 'cb-footer'; panel.appendChild(footer);

    // Debug: last scan info and controls
    const debugWrap = document.createElement('div');
    debugWrap.style.padding = '8px 14px'; debugWrap.style.display = 'flex'; debugWrap.style.flexDirection = 'column'; debugWrap.style.gap = '6px';
    const dbgTitle = document.createElement('div'); dbgTitle.textContent = 'Debug: Last Scan'; dbgTitle.style.color = '#9fdfff'; dbgTitle.style.fontSize = '12px';
    const dbgPre = document.createElement('pre'); dbgPre.style.whiteSpace = 'pre-wrap'; dbgPre.style.maxHeight = '140px'; dbgPre.style.overflow = 'auto'; dbgPre.style.fontSize = '11px'; dbgPre.style.background = 'rgba(255,255,255,0.03)'; dbgPre.style.padding = '6px 8px'; dbgPre.style.borderRadius = '6px'; dbgPre.textContent = '(none)';
    const dbgBtnRow = document.createElement('div'); dbgBtnRow.style.display = 'flex'; dbgBtnRow.style.gap = '8px';
    const btnShowContainer = document.createElement('button'); btnShowContainer.className = 'cb-btn'; btnShowContainer.textContent = 'Show container';
    const btnToggleHighlight = document.createElement('button'); btnToggleHighlight.className = 'cb-btn'; btnToggleHighlight.textContent = 'Toggle highlight';
    dbgBtnRow.appendChild(btnShowContainer); dbgBtnRow.appendChild(btnToggleHighlight);
    debugWrap.appendChild(dbgTitle); debugWrap.appendChild(dbgPre); debugWrap.appendChild(dbgBtnRow);
    panel.appendChild(debugWrap);

    function renderLastScan() {
      try {
        const ls = (window.ChatBridge && window.ChatBridge._lastScan) || null;
        if (!ls) { dbgPre.textContent = '(none)'; return; }
        const small = {
          adapterId: ls.adapterId || null,
          chosenContainer: ls.chosenContainer || null,
          nodesConsidered: ls.nodesConsidered || 0,
          messageCount: ls.messageCount || 0,
          timestamp: ls.timestamp ? new Date(ls.timestamp).toLocaleString() : null
        };
        dbgPre.textContent = JSON.stringify(small, null, 2);
      } catch (e) { dbgPre.textContent = '(error)'; }
    }

    btnShowContainer.addEventListener('click', () => {
      try {
        const ls = (window.ChatBridge && window.ChatBridge._lastScan) || null;
        const el = ls && ls.containerEl;
        if (el) { highlightNodesByElements([el]); setTimeout(() => { try { clearHighlights(); } catch(e){} }, 2200); }
        else toast('No container to show yet. Run a scan first.');
      } catch (e) { toast('Unable to show container'); }
    });
    btnToggleHighlight.addEventListener('click', () => {
      try { const enabled = window.ChatBridge && window.ChatBridge.highlightScan && window.ChatBridge.highlightScan(!CB_HIGHLIGHT_ENABLED); toast('Highlight ' + (enabled ? 'enabled' : 'disabled')); } catch (e) { toast('Unable to toggle highlight'); }
    });

    shadow.appendChild(panel);

    // interactions
    avatar.addEventListener('click', () => { host.style.display = 'block'; avatar.style.display = 'none'; });
    btnClose.addEventListener('click', () => { host.style.display = 'none'; avatar.style.display = 'flex'; });

    btnScan.addEventListener('click', async () => {
      btnScan.disabled = true; status.textContent = 'Status: scanning...';
      try {
        const msgs = await scanChat();
        if (!msgs || !msgs.length) { status.textContent = 'Status: no messages'; toast('No messages found in current chat'); }
        else {
          const final = normalizeMessages(msgs);
          const conv = { platform: location.hostname, url: location.href, ts: Date.now(), conversation: final };
          if (typeof window.saveConversation === 'function') {
            window.saveConversation(conv, () => { toast('Saved ' + final.length + ' messages'); refreshHistory(); });
          } else {
            const key = 'chatbridge:conversations'; const cur = JSON.parse(localStorage.getItem(key) || '[]'); cur.push(conv); localStorage.setItem(key, JSON.stringify(cur)); toast('Saved (local) ' + final.length + ' messages'); refreshHistory();
          }
          status.textContent = `Status: saved ${final.length}`;
        }
      } catch (e) { status.textContent = 'Status: error'; toast('Scan failed: ' + (e && e.message)); }
      btnScan.disabled = false;
    });

    btnRestore.addEventListener('click', async () => {
      try {
        const getter = (typeof window.getConversations === 'function') ? window.getConversations : (cb => cb(JSON.parse(localStorage.getItem('chatbridge:conversations') || '[]')));
        getter(list => {
          const arr = Array.isArray(list) ? list : [];
          if (!arr.length) { toast('No saved conversations'); return; }
          const sel = arr[0]; if (!sel || !sel.conversation || !sel.conversation.length) { toast('No messages in selected conversation'); return; }
          const formatted = sel.conversation.map(m => (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.text).join('\n\n') + '\n\n🔄 Please continue the conversation.';
          const input = (typeof window.pickAdapter === 'function' && window.pickAdapter().getInput) ? window.pickAdapter().getInput() : document.querySelector('textarea, [contenteditable="true"]');
          try { if (input && input.isContentEditable) input.textContent = formatted; else if (input) input.value = formatted; else throw new Error('no input'); input.dispatchEvent(new Event('input', { bubbles: true })); toast('Restored conversation'); }
          catch (e) { navigator.clipboard.writeText(formatted).then(()=>toast('Copied to clipboard (fallback)')); }
        });
      } catch (e) { toast('Restore failed'); }
    });

    // Generate via background OpenAI handler
    btnGenerate.addEventListener('click', async () => {
      btnGenerate.disabled = true; status.textContent = 'Status: generating...';
      try {
        const msgs = await scanChat();
  const final = normalizeMessages(msgs);
        if (!final || !final.length) { status.textContent = 'Status: idle'; toast('No messages to generate from'); btnGenerate.disabled = false; return; }

        // Build OpenAI messages (use AIClient helper if available)
        let oaMessages = null;
        try {
          if (window.AIClient && typeof window.AIClient.toOpenAIMessages === 'function') oaMessages = window.AIClient.toOpenAIMessages(final, 'You are a helpful assistant. Continue the conversation.');
          else oaMessages = final.map(m => ({ role: m.role, content: m.text }));
        } catch (e) { oaMessages = final.map(m => ({ role: m.role, content: m.text })); }

        // ask background to call OpenAI
        try {
          // allow tests to inject a test API key via window.__CHATBRIDGE_TEST_API_KEY
          const testApiKey = (typeof window !== 'undefined' && window.__CHATBRIDGE_TEST_API_KEY) ? window.__CHATBRIDGE_TEST_API_KEY : undefined;
          const payload = { messages: oaMessages };
          if (testApiKey) payload.apiKey = testApiKey;
          chrome.runtime.sendMessage({ type: 'call_openai', payload }, (res) => {
            try {
              if (!res) { status.textContent = 'Status: error'; toast('No response from background'); return; }
              if (!res.ok) {
                if (res.error === 'no_api_key') {
                  toast('No API key set. Open Options to save one.');
                } else {
                  toast('OpenAI error: ' + (res.error || res.message || JSON.stringify(res)) );
                }
                status.textContent = 'Status: error';
                return;
              }
              const assistantText = (res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message && res.data.choices[0].message.content) || '';
              if (!assistantText) { toast('No assistant content returned'); status.textContent = 'Status: error'; return; }

              // try to insert into the page input; fallback to clipboard
              const input = (typeof window.pickAdapter === 'function' && window.pickAdapter().getInput) ? window.pickAdapter().getInput() : document.querySelector('textarea, [contenteditable="true"]');
              try {
                if (input && input.isContentEditable) { input.textContent = assistantText; input.dispatchEvent(new Event('input', { bubbles: true })); toast('Generated text inserted'); }
                else if (input) { input.value = assistantText; input.dispatchEvent(new Event('input', { bubbles: true })); toast('Generated text inserted'); }
                else { navigator.clipboard.writeText(assistantText).then(()=>toast('Generated text copied to clipboard')); }
              } catch (e) { navigator.clipboard.writeText(assistantText).then(()=>toast('Generated text copied to clipboard')); }

              status.textContent = 'Status: generated';
            } finally { btnGenerate.disabled = false; }
          });
        } catch (e) { status.textContent = 'Status: error'; toast('Generate failed: ' + (e && e.message)); btnGenerate.disabled = false; }

      } catch (e) { status.textContent = 'Status: error'; toast('Generate failed: ' + (e && e.message)); btnGenerate.disabled = false; }
    });

    function refreshHistory() {
      const getter = (typeof window.getConversations === 'function') ? window.getConversations : (cb => cb(JSON.parse(localStorage.getItem('chatbridge:conversations') || '[]')));
      getter(list => { const arr = Array.isArray(list) ? list : []; if (!arr.length) { historyEl.textContent = 'History: (none)'; preview.textContent = 'Preview: (none)'; return; } historyEl.textContent = arr.slice(0,6).map(s => `${s.platform} — ${(s.conversation||[]).length} msgs — ${new Date(s.ts).toLocaleString()}`).join('\n\n'); preview.textContent = 'Preview: ' + (arr[0] && arr[0].conversation && arr[0].conversation[0] ? arr[0].conversation[0].text.slice(0,200) : '(none)'); });
    }

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

