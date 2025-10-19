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
    label: "ChatGPT (chat.openai.com)",
    detect: () => location.hostname.includes("chat.openai.com"),
    scrollContainer: () => document.querySelector('[data-testid="conversation-turns"]')?.parentElement || document.querySelector('main') || document.scrollingElement,
    getMessages: () => {
      const container = document.querySelector('[data-testid="conversation-turns"]') || document.querySelector('main') || document.body;
      if (!container) return [];
      const wrappers = Array.from(container.querySelectorAll('[data-message-author-role]'));
      if (!wrappers.length) return [];
      const entries = wrappers.map(w => {
        const body = w.querySelector('.markdown, .prose, .text-base, [data-testid*="message"]') || w;
        if (!body) return null;
        const roleAttr = (w.getAttribute('data-message-author-role') || '').toLowerCase();
        const role = roleAttr.includes('user') ? 'user' : 'assistant';
        return { el: body, role };
      }).filter(Boolean);
      if (!entries.length) return [];
      const filteredNodes = applyCandidateFilter(entries.map(e => e.el));
      const out = [];
      for (const entry of entries) {
        if (!filteredNodes.includes(entry.el)) continue;
        const text = (() => {
          try { return (entry.el.innerText || '').trim(); } catch (err) { return ''; }
        })();
        if (!text) continue;
        out.push({ role: entry.role, text, el: entry.el });
      }
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
      const container = document.querySelector('[data-testid="conversation-view"]') || document.querySelector('[data-testid="chat-scroll"]') || document.querySelector('main') || document.body;
      if (!container) return [];
      let wrappers = Array.from(container.querySelectorAll('[data-testid="chat-message"], [data-testid="assistant-message"], [data-testid="user-message"]'));
      if (!wrappers.length) {
        wrappers = Array.from(container.querySelectorAll('.message, .message-text, .Message, article'));
      }
      if (!wrappers.length) return [];

      const entries = wrappers.map(w => {
        const body = w.querySelector('.message-text, .content, [data-testid="message-text"], .text, .markdown, p') || w;
        if (!body) return null;
        let role = 'assistant';
        const testId = (w.getAttribute && w.getAttribute('data-testid')) || '';
        const combinedCls = ((w.className || '') + ' ' + (w.parentElement?.className || '')).toLowerCase();
        if (/user/.test(testId.toLowerCase()) || combinedCls.includes('user')) {
          role = 'user';
        } else if (/assistant|bot/.test(testId.toLowerCase()) || combinedCls.includes('assistant') || combinedCls.includes('bot')) {
          role = 'assistant';
        } else {
          const userAncestor = body.closest('[data-testid*="user"], [class*="user"]');
          if (userAncestor) role = 'user';
        }
        return { el: body, role };
      }).filter(Boolean);

      if (!entries.length) return [];
      const filteredNodes = applyCandidateFilter(entries.map(e => e.el));
      const out = [];
      for (const entry of entries) {
        if (!filteredNodes.includes(entry.el)) continue;
        const text = (() => {
          try { return (entry.el.innerText || '').trim(); } catch (err) { return ''; }
        })();
        if (!text) continue;
        out.push({ role: entry.role, text, el: entry.el });
      }

      out.sort((a, b) => {
        try { return a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top; } catch (err) { return 0; }
      });

      adapterDebug('adapter:claude', { nodes: wrappers.length, filtered: out.length, sample: out.slice(0, 5).map(m => m.text.slice(0, 80)) });
      return out;
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
    detect: () => location.hostname.includes("gemini.google.com"),
    scrollContainer: () => document.querySelector("main") || document.scrollingElement,
    getMessages: () => {
      // Prefer the container near the composer/input to avoid scraping sidebars or suggestion cards
      let main = document.querySelector('main');
      if (!main) main = document.body;

      // try to find an input/composer and nearby chat container
      let input = document.querySelector('textarea, [contenteditable="true"], input[type=text], [role="textbox"]');
      try { if (!input) input = document.querySelector('[aria-label*="Message"], [placeholder*="Message"]'); } catch (e) {}
      let chatArea = null;
      try {
        if (input) {
          const nearby = findChatContainerNearby(input);
          if (nearby && nearby !== document.body) chatArea = nearby;
        }
      } catch (e) { /* ignore */ }

      // Fallback: search main for best candidate but be more conservative
      if (!chatArea) {
        const candidates = Array.from(main.querySelectorAll('div')).filter(div => {
          const cls = (div.className||'').toLowerCase();
          if (cls.includes('sidebar') || cls.includes('nav') || cls.includes('drawer') || cls.includes('list') || cls.includes('history') || cls.includes('suggestion') || cls.includes('card')) return false;
          if (div.getAttribute('aria-label') && /sidebar|history|chats|conversations|list|suggestion/i.test(div.getAttribute('aria-label'))) return false;
          // require at least two message-like children to consider it the chat area
          const msgCount = div.querySelectorAll('.result, .message, .assistant, .UserMessage, .answer, .chat-bubble').length;
          return msgCount >= 2;
        });
        if (candidates.length) chatArea = candidates.reduce((a,b) => (a.scrollHeight > b.scrollHeight ? a : b));
        else chatArea = main;
      }

      // Extract only from chatArea, using message selectors
      let msgs = extractMessagesFromContainer(chatArea, ['.result', '.message', '.assistant', '.UserMessage', '.answer', '.chat-bubble']);

      // Remove items that look like UI/suggestions or are located inside nav/aside
      msgs = msgs.filter(m => {
        if (!m || !m.text) return false;
        const text = m.text.trim();
        if (text.length < 3) return false;
        if (/^(new chat|history|chats|conversations|recents|starred|drafts|settings|help|feedback|show thinking|show thinking)$/i.test(text)) return false;
        // exclude messages that appear inside UI widgets by checking for parent landmarks
        try {
          const el = (m.el) ? m.el : null;
          if (el) {
            const anc = el.closest('nav, aside, header, [role="navigation"], [aria-label*="sidebar"], [aria-label*="history"]');
            if (anc) return false;
            const cls = (el.className||'').toString().toLowerCase();
            if (/suggestion|card|example|topic|shortcut|quick|tool|related|recommended|search-result/.test(cls)) return false;
          }
        } catch (e) {}
        return true;
      });

      // Apply candidate filter for final sanitization
      try {
        if (typeof window !== 'undefined' && typeof window.filterCandidateNodes === 'function') {
          // map msgs back to DOM nodes, filter, then keep only those matching
          const nodes = msgs.map(m => document.createElement('div'));
          // can't easily remap without original el - fallback to standard out
        }
      } catch (e) {}

      // Remove duplicates (contiguous and non-contiguous)
      const seen = new Set();
      const final = [];
      for (const m of msgs) {
        const key = (m.role||'') + '|' + (m.text||'');
        if (seen.has(key)) continue;
        seen.add(key);
        final.push(m);
      }
      return final;
    },
    getInput: () => {
      let el = document.querySelector('textarea, input[type=text], [contenteditable="true"]');
      if (el) return el;
      el = document.querySelector('[role="textbox"], [aria-label*="message"], [placeholder*="Message"]');
      if (el) return el;
      // try near common composer buttons
      const send = document.querySelector('button[aria-label*="send"], button[title*="send"]');
      if (send) {
        const near = send.closest('form') || document.body;
        const inp = near.querySelector('textarea, input, [contenteditable="true"]');
        if (inp) return inp;
      }
      return null;
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
