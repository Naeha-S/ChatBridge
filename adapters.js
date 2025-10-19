// adapters.js
// Site adapters provide: detect(), scrollContainer() (optional), getMessages(), getInput()
// Each adapter returns array of {role:'user'|'assistant', text: '...'} in chronological order.

function applyCandidateFilter(nodes) {
  if (typeof window !== 'undefined' && typeof window.filterCandidateNodes === 'function') {
    return window.filterCandidateNodes(nodes);
  }
  return (nodes || []).filter(n => {
    try {
      return n && n.innerText && n.innerText.trim().length > 4;
    } catch (err) {
      return false;
    }
  });
}

function adapterDebug(label, payload) {
  if (typeof window !== 'undefined' && typeof window.debugLog === 'function') {
    window.debugLog(label, payload);
  }
}

// Visibility / scoring helpers
function isElementVisible(el) {
  try {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    if (r.bottom < 0 || r.top > (window.innerHeight || document.documentElement.clientHeight)) return false;
    return true;
  } catch (e) { return false; }
}

function widthScore(el) {
  try {
    const r = el.getBoundingClientRect(); const vw = window.innerWidth || document.documentElement.clientWidth || 1000;
    if (!r || !vw) return 0;
    // wider containers get higher score; normalize to 0..1
    return Math.min(1, Math.max(0, r.width / vw));
  } catch (e) { return 0; }
}

function centerProximityScore(el) {
  try {
    const r = el.getBoundingClientRect(); const cx = (r.left + r.right) / 2; const cy = (r.top + r.bottom) / 2;
    const vw = window.innerWidth || document.documentElement.clientWidth; const vh = window.innerHeight || document.documentElement.clientHeight;
    const dx = Math.abs(cx - vw/2) / (vw/2); const dy = Math.abs(cy - vh/2) / (vh/2);
    const d = Math.min(1, Math.sqrt(dx*dx + dy*dy));
    return 1 - d; // 1 is center, 0 is far
  } catch (e) { return 0; }
}

function proximityToElementScore(candidate, el) {
  try {
    if (!el || !candidate) return 0;
    const a = el.getBoundingClientRect(); const b = candidate.getBoundingClientRect();
    const dx = Math.abs(((a.left+a.right)/2) - ((b.left+b.right)/2));
    const dy = Math.abs(((a.top+a.bottom)/2) - ((b.top+b.bottom)/2));
    const dist = Math.sqrt(dx*dx + dy*dy);
    const diag = Math.sqrt((window.innerWidth||1000)**2 + (window.innerHeight||800)**2);
    return 1 - Math.min(1, dist/diag);
  } catch (e) { return 0; }
}

function messageLikeCount(container) {
  try {
    return Array.from(container.querySelectorAll('p, .message, .chat-line, .message-text, .markdown, .prose, .result, .chat-bubble, li')).filter(n => n && (n.innerText||'').trim().length > 3).length;
  } catch (e) { return 0; }
}

// Default adapter - generic heuristic (fallback)
const AdapterGeneric = {
  id: "generic",
  label: "Generic",
  detect: () => true, // fallback applies everywhere
  scrollContainer: () => document.scrollingElement || document.documentElement,
  getMessages: () => {
    // Improved container-first extraction to avoid scraping unrelated page text
    const containerSelectors = [
      '.conversation', '.conversations', '.messages', '.message-list', '.chat', '.chat-window', '.thread', '[data-testid*="conversation"]', 'main', '[role="main"]', '#root'
    ];

    function normalizeText(s) {
      return (s || '').replace(/\s+/g, ' ').trim();
    }

    function guessRoleFromElement(el) {
      const cls = (el.className || '').toString().toLowerCase();
      if (cls.includes('user') || cls.includes('from-user') || el.closest('[data-role*="user"]') || el.closest('[aria-label*="user"]')) return 'user';
      if (cls.includes('assistant') || cls.includes('bot') || cls.includes('ai') || el.closest('[data-role*="assistant"]') || el.closest('[aria-label*="assistant"]')) return 'assistant';
      // look for labels inside
      const lbl = (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('role'))) || '';
      if (lbl && /user|you/i.test(lbl)) return 'user';
      if (lbl && /assistant|bot|ai/i.test(lbl)) return 'assistant';
      // default to assistant for safety
      return 'assistant';
    }

    function extractDirectMessages(container) {
      // find candidate message wrappers (direct children or descendants with consistent classnames)
      const candidates = Array.from(container.querySelectorAll(':scope > * , :scope *'))
        .filter(n => n && n.innerText && normalizeText(n.innerText).length > 3);

      // group by nearest reasonable wrapper: prefer elements that have many sibling message-like nodes
      const wrappers = new Map();
      for (const el of candidates) {
        let wrapper = el;
        // climb up until parent has multiple similar children
        while (wrapper && wrapper !== container && wrapper.parentElement && wrapper.parentElement !== document.body) {
          const siblings = Array.from(wrapper.parentElement.children).filter(ch => ch && ch.innerText && normalizeText(ch.innerText).length > 3);
          if (siblings.length >= 2) { wrapper = wrapper.parentElement; break; }
          wrapper = wrapper.parentElement;
        }
        const key = wrapper || container;
        if (!wrappers.has(key)) wrappers.set(key, []);
        wrappers.get(key).push(el);
      }

      // pick the wrapper with most entries
      let best = container;
      let bestCount = 0;
      for (const [w, arr] of wrappers.entries()) {
        if (arr.length > bestCount) { bestCount = arr.length; best = w; }
      }

      // Now select direct child nodes of best that look like messages
      const msgCandidates = Array.from(best.querySelectorAll(':scope > *'))
        .filter(n => n && n.innerText && normalizeText(n.innerText).length > 3);
      // fallback: if none found as direct children, use the earlier candidates within best
      const finalList = msgCandidates.length ? msgCandidates : Array.from(best.querySelectorAll('*')).filter(n => n && n.innerText && normalizeText(n.innerText).length > 3);

      // map to structured messages (in DOM order)
      const mapped = finalList.map(n => ({ el: n, text: normalizeText(n.innerText), top: (() => { try { return n.getBoundingClientRect().top } catch(e) { return 0 } })(), role: guessRoleFromElement(n) }));
      mapped.sort((a,b) => a.top - b.top);
      // dedupe contiguous duplicates
      const out = [];
      for (const m of mapped) {
        if (!m.text) continue;
        if (out.length && out[out.length-1].text === m.text && out[out.length-1].role === m.role) continue;
        out.push({ role: m.role, text: m.text });
      }
      return out;
    }

    // try to find the best container on the page
    const containers = [];
    for (const sel of containerSelectors) {
      const found = Array.from(document.querySelectorAll(sel)).filter(Boolean);
      for (const f of found) containers.push(f);
    }
    // include root fallbacks
    containers.push(document.querySelector('main'));
    containers.push(document.body);

    // find input element to bias containers near composer
    let inputEl = null;
    try { inputEl = document.querySelector('textarea, [contenteditable="true"], input[type=text], [role="textbox"]'); } catch (e) { inputEl = null; }

    // score containers using multiple signals (message count, width, visibility, center proximity, proximity to input)
    let bestContainer = null;
    let bestScore = -1;
    for (const c of containers.filter(Boolean)) {
      try {
        if (!isElementVisible(c)) continue; // skip offscreen/hidden candidates
        const msgCount = messageLikeCount(c);
        // penalize likely sidebars/drawers by class or role
        const cls = (c.className||'').toString().toLowerCase();
        if (/sidebar|drawer|nav|list|history|recent|menu|toolbar|secondary|aside/.test(cls)) continue;
        const wscore = widthScore(c); const cscore = centerProximityScore(c);
        const pscore = inputEl ? proximityToElementScore(c, inputEl) : 0;
        // weights: message count strong, width, center, and nearby to input
        const score = (msgCount * 6) + (wscore * 8) + (cscore * 6) + (pscore * 10);
        if (score > bestScore) { bestScore = score; bestContainer = c; }
      } catch (e) { continue; }
    }

    if (!bestContainer) {
      // fallback to any visible container with at least 2 message-like children
      bestContainer = containers.filter(Boolean).find(c => isElementVisible(c) && messageLikeCount(c) >= 2) || document.body;
    }

    const extracted = extractDirectMessages(bestContainer);
    if (extracted && extracted.length) return extracted;

    // last resort: fall back to scanning body
    return extractDirectMessages(document.body);
  },
  getInput: () => {
    // find textarea or contenteditable
    const input = document.querySelector("textarea, input[type='text'], [contenteditable='true']");
    return input || null;
  }
};

// Helper: find chat container near the input element to avoid capturing other page areas
function findChatContainerNearby(input) {
  try {
    if (!input) return null;
    let el = input;
    for (let i = 0; i < 8 && el; i++) {
      // count message-like children
      const count = (el.querySelectorAll && el.querySelectorAll('.message, .group, .chat-line, .message-text, .chat-bubble, .assistant, .user, p').length) || 0;
      if (count > 1) return el;
      el = el.parentElement;
    }
    // fallbacks
    const byRole = document.querySelector('[role="main"]') || document.querySelector('main');
    if (byRole) return byRole;
    const conv = document.querySelector('.conversation, .conversations, .messages, .chat, .chat-window, .message-list');
    if (conv) return conv;
    return document.body;
  } catch (e) { return document.body; }
}

// Helper: extract messages from a container using selectors, sort by position and dedupe contiguous
function extractMessagesFromContainer(container, selectors) {
  const sel = (selectors && selectors.length) ? selectors.join(',') : '.message, .group, .markdown, .prose, .text-base, .message-text, .chat-bubble, .answer, p, li, div';
  let nodes = [];
  try {
    nodes = Array.from(container.querySelectorAll(sel)).filter(n => n && n.innerText && n.innerText.trim().length > 1);
  } catch (e) {
    nodes = Array.from(container.querySelectorAll('p, div, span')).filter(n => n && n.innerText && n.innerText.trim().length > 1);
  }
  // sort by vertical position
  const mapped = nodes.map(n => ({ el: n, text: n.innerText.trim(), top: (() => { try { return n.getBoundingClientRect().top } catch (e) { return 0 } })() }));
  mapped.sort((a,b) => a.top - b.top);
  const out = [];
  for (const m of mapped) {
    const text = (m.text || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    // dedupe contiguous duplicates
    if (out.length && out[out.length - 1].text === text) continue;
    // guess role
    const el = m.el;
    const cls = (el.className || '').toString().toLowerCase();
    let role = 'assistant';
    try {
      if (cls.includes('user') || cls.includes('from-user') || el.closest('[data-role*="user"]') || el.closest('[aria-label*="user"]')) role = 'user';
      else if (cls.includes('assistant') || cls.includes('bot') || el.closest('[data-role*="assistant"]') || el.closest('[aria-label*="assistant"]')) role = 'assistant';
      else {
        // look for avatar or authorship markers nearby
        const avatar = (el.querySelector && (el.querySelector('img[alt*="User"], img[alt*="you"], img[alt*="Me"]'))) || (el.previousElementSibling && (el.previousElementSibling.className || '').toLowerCase().includes('user'));
        if (avatar) role = 'user';
      }
    } catch (e) {}
    out.push({ role, text, el });
  }
  return out;
}

// Site-specific adapters (pre-populated, tweak via options)
const SiteAdapters = [
  {
    id: "chatgpt",
    label: "ChatGPT (chat.openai.com, chatgpt.com)",
    detect: () => location.hostname.includes("chat.openai.com") || location.hostname.includes("chatgpt.com"),
    scrollContainer: () => document.querySelector('[data-testid="conversation-turns"]')?.parentElement || document.querySelector('main') || document.scrollingElement,
    getMessages: () => {
      // Always use ChatGPT adapter on chatgpt.com
      const container = document.querySelector('[data-testid="conversation-turns"]') || document.querySelector('main') || document.body;
      if (!container) return [];
      const wrappers = Array.from(container.querySelectorAll('[data-message-author-role]'));
      if (!wrappers.length) return [];
      const out = [];
      wrappers.forEach((w, i) => {
        const body = w.querySelector('.markdown, .prose, .text-base, [data-testid*="message"]') || w;
        if (!body) return;
        const roleAttr = (w.getAttribute('data-message-author-role') || '').toLowerCase();
        const role = roleAttr.includes('user') ? 'user' : 'assistant';
        const style = window.getComputedStyle(body);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
        const text = (() => {
          try { return (body.innerText || '').trim(); } catch (err) { return ''; }
        })();
        if (!text) return;
        // Only include actual chat messages (exclude system/tip/label)
        if (/^(new chat|system|tip:|regenerate|copy|share|model:|clear conversation|export|delete|upgrade|settings|custom instructions|beta|plus|team|help|log out|log in|sign up|quiz.com vs kahoot)$/i.test(text)) return;
        out.push({ role, text, el: body });
      });
      out.sort((a, b) => {
        try { return a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top; } catch (err) { return 0; }
      });
      adapterDebug('adapter:chatgpt', { wrappers: wrappers.length, filtered: out.length, sample: out.slice(0, 5).map(m => m.text.slice(0, 80)) });
      return out;
    },
    getInput: () => document.querySelector("textarea")
  },
  {
    id: "claude",
    label: "Claude (claude.ai)",
    detect: () => location.hostname.includes("claude.ai"),
    scrollContainer: () => document.querySelector('[data-testid="chat-scroll"]') || document.querySelector('[data-testid="conversation-view"]') || document.querySelector('main') || document.scrollingElement,
    getMessages: () => {
      // Try to find the actual conversation container, not just body
      let container = document.querySelector('[data-testid="conversation-view"]') || 
                      document.querySelector('[data-testid="chat-scroll"]') || 
                      document.querySelector('main[role="main"]') ||
                      document.querySelector('main') ||
                      document.querySelector('[class*="conversation"]') ||
                      document.querySelector('[class*="chat"]');
      
      // If still body, look for a container with multiple message-like children
      if (!container || container === document.body) {
        const candidates = Array.from(document.querySelectorAll('div')).filter(d => {
          const msgCount = d.querySelectorAll('[data-testid*="message"], .message, p, .markdown').length;
          return msgCount >= 2;
        });
        if (candidates.length > 0) {
          container = candidates[0];
          console.log('[Claude Debug] Found better container with', container.querySelectorAll('[data-testid*="message"]').length, 'message elements');
        } else {
          container = document.body;
        }
      }
      
      if (!container) {
        console.log('[Claude Debug] No container found');
        return [];
      }
      console.log('[Claude Debug] Container found:', container.tagName, container.className);
      
      // Broaden selectors to always get both user and assistant messages
      // Deep scan for all <p>, .whitespace-pre-wrap, .break-words inside container
      let candidates = Array.from(container.querySelectorAll('p, .whitespace-pre-wrap, .break-words'));
      console.log('[Claude Debug] Candidate message nodes found:', candidates.length);
      candidates.forEach((node, i) => {
        const tag = node.tagName;
        const cls = node.className || '';
        const testid = node.getAttribute && node.getAttribute('data-testid');
        const text = (node.innerText || '').trim();
        const parentTag = node.parentElement ? node.parentElement.tagName : '';
        const parentCls = node.parentElement ? node.parentElement.className : '';
        console.log(`[Claude Debug] Candidate ${i}: <${tag}> class="${cls}" testid="${testid}" parent=<${parentTag}> class="${parentCls}" text="${text.slice(0,60)}"`);
      });
      // Filter out nodes with very short or empty text and UI/system messages
      candidates = candidates.filter(n => {
        const t = (n.innerText || '').trim();
        return t.length > 2 && !/^(User:|Please continue the conversation|Claude can make mistakes|new chat|system|tip:|regenerate|copy|share|model:|clear conversation|export|delete|upgrade|settings|custom instructions|beta|plus|team|help|log out|log in|sign up)$/i.test(t);
      });
      // Infer roles by order: first is user, rest are assistant
      let messages = candidates.map((node, i) => {
        let role = (i === 0) ? 'user' : 'assistant';
        let text = (node.innerText || '').trim();
        // Clean user message
        if (role === 'user') {
          text = text.replace(/^N\s*/i, '').replace(/^User:\s*/i, '').replace(/\s+/g, ' ').trim();
        }
        console.log(`[Claude Debug] Message ${i}: role=${role} text="${text.slice(0,60)}"`);
        return { role, text };
      });
      // Merge consecutive assistant messages into one
      if (messages.length > 2) {
        const userMsg = messages[0];
        const assistantMsgs = messages.slice(1).map(m => m.text).filter(Boolean);
        messages = [userMsg, { role: 'assistant', text: assistantMsgs.join(' ') }];
      }
      adapterDebug('adapter:claude', { nodes: candidates.length, filtered: messages.length, sample: messages.slice(0, 2).map(m => m.text.slice(0, 80)) });
      return messages;
    },
    getInput: () => {
      // Try obvious inputs
      let el = document.querySelector('textarea, input[type=text], input[type=search]');
      if (el) return el;
      // contenteditable composers
      el = document.querySelector('[contenteditable="true"], [role="textbox"]');
      if (el) return el;
      // aria labelled inputs
      el = document.querySelector('[aria-label*="message"], [aria-label*="Message"], [aria-label*="Ask"], [placeholder*="message"]');
      if (el) return el;
      // last resort: any input near a send button
      const send = document.querySelector('button[aria-label*="send"], button:contains("Send")');
      if (send) {
        const near = send.closest('form') || document.body;
        const inp = near.querySelector('textarea, input, [contenteditable="true"]');
        if (inp) return inp;
      }
      return null;
    }
  },

  // Add placeholders for other sites; selectors may need updates
  {
    id: "gemini",
    label: "Gemini (gemini.google.com)",
    detect: () => location.hostname.includes("gemini.google.com") || location.hostname.includes("bard.google.com"),
    
    scrollContainer: () => {
      // Gemini's main chat scroll area (NOT the sidebar)
      // The actual conversation is in a specific container, not in nav/aside
      const candidates = [
        document.querySelector('chat-window'),
        document.querySelector('main[role="main"]'),
        document.querySelector('.conversation-container'),
        document.querySelector('[data-test-id="conversation-container"]'),
        document.querySelector('main')
      ].filter(Boolean);
      
      // Pick the widest visible container (chat is always wider than sidebar)
      let best = null;
      let maxWidth = 0;
      for (const c of candidates) {
        try {
          const rect = c.getBoundingClientRect();
          if (rect.width > maxWidth && rect.width > 400) {
            maxWidth = rect.width;
            best = c;
          }
        } catch (e) {}
      }
      
      return best || document.querySelector('main') || document.scrollingElement;
    },
    
    getMessages: () => {
      // Strategy: Gemini uses user-query and model-response custom elements
      // Identify the main chat container to avoid scanning sidebars or UI chrome
      const candidates = [
        document.querySelector('chat-window'),
        document.querySelector('main[role="main"]'),
        document.querySelector('.conversation-container'),
        document.querySelector('[data-test-id="conversation-container"]'),
        document.querySelector('main')
      ].filter(Boolean);
      let mainChat = null;
      let maxWidth = 0;
      for (const c of candidates) {
        try {
          const rect = c.getBoundingClientRect();
          if (rect.width > maxWidth && rect.width > 400) {
            maxWidth = rect.width;
            mainChat = c;
          }
        } catch (e) {}
      }
      mainChat = mainChat || document.querySelector('main') || document.body;
      console.log('[Gemini Debug] Using mainChat:', mainChat.tagName, (mainChat.className||''));
      
      // Gemini's structure: each message is wrapped in user-query or model-response tags
      const userQueries = Array.from(mainChat.querySelectorAll('user-query'));
      const modelResponses = Array.from(mainChat.querySelectorAll('model-response'));
      
      console.log('[Gemini Debug] Found:', { userQueries: userQueries.length, modelResponses: modelResponses.length });
      
      let messageContainers = [];
      
      // If we found the native Gemini tags, use them directly
      if (userQueries.length > 0 || modelResponses.length > 0) {
        // Interleave user and model messages in DOM order
        const allMessages = [...userQueries, ...modelResponses].sort((a, b) => {
          return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });
        messageContainers = allMessages;
        console.log('[Gemini Debug] Using native tags, total containers:', messageContainers.length);
      } else {
        // Fallback for older Gemini/Bard versions: look for message-set children
        const messageSetChildren = Array.from(mainChat.querySelectorAll('message-set > *'));
        if (messageSetChildren.length > 0) {
          messageContainers = messageSetChildren;
        } else {
          // Last resort: find conversation turns or message wrappers
          messageContainers = Array.from(mainChat.querySelectorAll('.conversation-turn, [data-message-id], [class*="message-wrapper"]'));
        }
      }
      
      // Filter containers conservatively. Accept native Gemini tags immediately.
      messageContainers = messageContainers.filter(container => {
        try {
          const tag = (container.tagName || '').toLowerCase();

          // If it's a native Gemini element, accept it if it has any text.
          if (tag === 'user-query' || tag === 'model-response') {
            const contentNode = container.querySelector('message-content, .markdown.markdown-main-panel, .message-text, [data-test-id="model-response-text"]') || container;
            const text = (contentNode.innerText || contentNode.textContent || '').trim();
            const ok = !!text && text.length >= 3;
            if (!ok) console.log('[Gemini Debug] Dropping native tag (no text):', tag, contentNode && contentNode.innerText?.slice(0,40));
            return ok;
          }

          // For non-native containers, be conservative: only exclude if clearly in a sidebar OUTSIDE the main chat area
          const badAncestor = container.closest('nav, aside, [role="navigation"], [class*="sidebar"], [class*="panel-side"], [class*="conversation-list"], [class*="suggestion"]');
          if (badAncestor && !mainChat.contains(badAncestor)) {
            console.log('[Gemini Debug] Excluding container: ancestor outside mainChat', badAncestor.tagName);
            return false;
          }

          const contentNode = container.querySelector('message-content, .markdown.markdown-main-panel, .message-text, [data-test-id="model-response-text"]') || container;
          const text = (contentNode.innerText || contentNode.textContent || '').trim();
          if (!text || text.length < 10) {
            console.log('[Gemini Debug] Excluding container (too short):', container.tagName, text?.slice(0,40));
            return false;
          }

          // Exclude UI chrome containers by matching exact label text
          if (/^(show thinking|try:|suggested|related|regenerate|copy|share|new chat|history|more options)$/i.test(text)) {
            console.log('[Gemini Debug] Excluding container (UI chrome):', text.slice(0,40));
            return false;
          }

          return true;
        } catch (e) {
          console.log('[Gemini Debug] Filter exception', e && e.message);
          return false;
        }
      });
      
      console.log('[Gemini Debug] After filtering:', messageContainers.length, 'containers');
      messageContainers.forEach((c, i) => {
        console.log(`  [${i}] ${c.tagName}:`, c.innerText?.slice(0, 50));
      });
      
      // Extract ONE message per container
      const messages = messageContainers.map((container, idx) => {
        let role = 'assistant'; // default
        
        try {
          // Check container tag name
          const tag = (container.tagName || '').toLowerCase();
          if (tag === 'user-query' || tag.includes('user')) {
            role = 'user';
          } else if (tag === 'model-response' || tag.includes('model') || tag.includes('assistant')) {
            role = 'assistant';
          }
          
          // Check data attributes
          const dataRole = container.getAttribute('data-role');
          if (dataRole === 'user') role = 'user';
          else if (dataRole === 'assistant' || dataRole === 'model') role = 'assistant';
          
          // Check classes
          const className = (container.className || '').toString().toLowerCase();
          if (className.includes('user') || className.includes('from-user')) {
            role = 'user';
          } else if (className.includes('assistant') || className.includes('model') || className.includes('from-model')) {
            role = 'assistant';
          }
        } catch (e) {}
        
        // Extract text from the content area, not chrome
        let text = '';
        try {
          const contentNode = container.querySelector('message-content, .markdown.markdown-main-panel, .message-text, [data-test-id="model-response-text"]') || container;
          text = (contentNode.innerText || contentNode.textContent || '').trim();
        } catch (e) {
          text = (container.innerText || '').trim();
        }
        
        console.log(`[Gemini Debug] Message ${idx}:`, { role, tagName: container.tagName, textLength: text.length, preview: text.slice(0, 50) });
        
        return {
          role,
          text,
          el: container
        };
      });
      
      // Deduplicate by text content (in case nested selectors matched)
      const seen = new Set();
      const final = [];
      for (const m of messages) {
        if (!m.text || m.text.length < 10) {
          console.log('[Gemini Debug] Skipping message (too short):', m.text?.length, 'chars');
          continue;
        }
        
        // Use first 100 chars as dedup key to handle slight variations
        const key = (m.role||'') + '|' + m.text.slice(0, 100);
        if (seen.has(key)) {
          console.log('[Gemini Debug] Skipping duplicate:', m.text.slice(0, 50));
          continue;
        }
        seen.add(key);
        final.push(m);
      }
      
      console.log('[Gemini Debug] FINAL RESULT:', final.length, 'messages');
      final.forEach((m, i) => {
        console.log(`  [${i}] ${m.role}:`, m.text.slice(0, 80));
      });
      
      adapterDebug('adapter:gemini', { containers: messageContainers.length, filtered: final.length, sample: final.slice(0, 3).map(m => ({ role: m.role, text: m.text.slice(0, 60) })) });
      return final;
    },
    
    getInput: () => {
      // Gemini uses a rich-textarea or contenteditable
      return document.querySelector('rich-textarea textarea') || 
             document.querySelector('[contenteditable="true"]') ||
             document.querySelector('textarea') ||
             document.querySelector('[role="textbox"]');
    }
  },
  {
    id: "perplexity",
    label: "Perplexity (perplexity.ai)",
    detect: () => location.hostname.includes("perplexity.ai"),
    scrollContainer: () => document.scrollingElement,
    getMessages: () => {
      const nodes = Array.from(document.querySelectorAll(".answer, .conversation__message, .chat-bubble")).filter(n => n && n.innerText && n.innerText.trim().length>1);
      return nodes.map(n => ({ role: n.className.toLowerCase().includes("user") ? "user" : "assistant", text: n.innerText.trim() }));
    },
    getInput: () => document.querySelector("textarea, input[type='text']")
  },
  {
    id: "poe",
    label: "Poe (poe.com)",
    detect: () => location.hostname.includes("poe.com"),
    scrollContainer: () => document.querySelector("main") || document.scrollingElement,
    getMessages: () => {
      const nodes = Array.from(document.querySelectorAll(".message, .chat-item, .bot, .user")).filter(n => n && n.innerText && n.innerText.trim().length>1);
      return nodes.map(n => ({ role: (n.className||"").toLowerCase().includes("user") ? "user" : "assistant", text: n.innerText.trim() }));
    },
    getInput: () => document.querySelector("textarea, [contenteditable='true']")
  },
  {
    id: "mistral",
    label: "Mistral (chat.mistral.ai)",
    detect: () => location.hostname.includes("mistral.ai"),
    scrollContainer: () => document.querySelector("main") || document.scrollingElement,
    getMessages: () => {
      const nodes = Array.from(document.querySelectorAll(".chat-message, .assistant, .user, .message")).filter(n => n && n.innerText && n.innerText.trim().length>1);
      return nodes.map(n => ({ role: n.className.toLowerCase().includes("user") ? "user" : "assistant", text: n.innerText.trim() }));
    },
    getInput: () => document.querySelector("textarea, [contenteditable='true']")
  },
  {
    id: "grok",
    label: "Grok (x.ai / grok)",
    detect: () => location.hostname.includes("x.ai") || location.hostname.includes("grok.ai"),
    scrollContainer: () => document.scrollingElement,
    getMessages: () => {
      const nodes = Array.from(document.querySelectorAll(".reply, .message, .assistant")).filter(n => n && n.innerText && n.innerText.trim().length>1);
      return nodes.map(n => ({ role: (n.className || "").toLowerCase().includes("user") ? "user" : "assistant", text: n.innerText.trim() }));
    },
    getInput: () => document.querySelector("textarea, input[type='text']")
  },
  {
    id: "copilot",
    label: "MS Copilot / Bing Chat",
    detect: () => location.hostname.includes("bing.com") || location.hostname.includes("copilot.microsoft.com"),
    scrollContainer: () => document.querySelector("main") || document.scrollingElement,
    getMessages: () => {
      const nodes = Array.from(document.querySelectorAll(".conversation, .answer, .bot-message, .user-message")).filter(n => n && n.innerText && n.innerText.trim().length>1);
      return nodes.map(n => ({ role: (n.className||"").toLowerCase().includes("user") ? "user" : "assistant", text: n.innerText.trim() }));
    },
    getInput: () => document.querySelector("textarea, [contenteditable='true']")
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    detect: () => location.hostname.includes("deepseek") || location.hostname.includes("deepseek.ai"),
    scrollContainer: () => document.scrollingElement,
    getMessages: () => {
      const nodes = Array.from(document.querySelectorAll(".message-text, .response")).filter(n => n && n.innerText && n.innerText.trim().length);
      return nodes.map(n => ({ role: (n.className||"").toLowerCase().includes("user") ? "user" : "assistant", text: n.innerText.trim() }));
    },
    getInput: () => document.querySelector("textarea, input[type='text']")
  },
  {
    id: "metaai",
    label: "Meta AI",
    detect: () => location.hostname.includes("meta.ai") || location.hostname.includes("facebook.com"),
    scrollContainer: () => document.scrollingElement,
    getMessages: () => {
      const nodes = Array.from(document.querySelectorAll(".message, .ai-response, .chat-bubble")).filter(n => n && n.innerText && n.innerText.trim().length>1);
      return nodes.map(n => ({ role: (n.className||"").toLowerCase().includes("user") ? "user" : "assistant", text: n.innerText.trim() }));
    },
    getInput: () => document.querySelector("textarea, [contenteditable='true']")
  }
];

// function to pick the best adapter for current page
function pickAdapter() {
  for (const a of SiteAdapters) {
    try {
      if (a.detect && a.detect()) return a;
    } catch (e) { continue; }
  }
  return AdapterGeneric;
}
// Attach to window for non-module content scripts
try {
  if (typeof window !== 'undefined') {
    window.pickAdapter = pickAdapter;
    window.SiteAdapters = SiteAdapters;
    window.AdapterGeneric = AdapterGeneric;
  }
} catch (e) {
  // ignore in non-browser environments
}
// Example usage:
// const adapter = pickAdapter();
// const messages = adapter.getMessages();
// const input = adapter.getInput();
// const container = adapter.scrollContainer();
// console.log(adapter.id, messages, input, container);
// You can tweak SiteAdapters array to add/remove or modify adapters as needed.
