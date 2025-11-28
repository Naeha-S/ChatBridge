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
    const dx = Math.abs(cx - vw / 2) / (vw / 2); const dy = Math.abs(cy - vh / 2) / (vh / 2);
    const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
    return 1 - d; // 1 is center, 0 is far
  } catch (e) { return 0; }
}

function proximityToElementScore(candidate, el) {
  try {
    if (!el || !candidate) return 0;
    const a = el.getBoundingClientRect(); const b = candidate.getBoundingClientRect();
    const dx = Math.abs(((a.left + a.right) / 2) - ((b.left + b.right) / 2));
    const dy = Math.abs(((a.top + a.bottom) / 2) - ((b.top + b.bottom) / 2));
    const dist = Math.sqrt(dx * dx + dy * dy);
    const diag = Math.sqrt((window.innerWidth || 1000) ** 2 + (window.innerHeight || 800) ** 2);
    return 1 - Math.min(1, dist / diag);
  } catch (e) { return 0; }
}

function messageLikeCount(container) {
  try {
    return Array.from(container.querySelectorAll('p, .message, .chat-line, .message-text, .markdown, .prose, .result, .chat-bubble, li')).filter(n => n && (n.innerText || '').trim().length > 3).length;
  } catch (e) { return 0; }
}

// Default adapter - generic heuristic (fallback)
const AdapterGeneric = {
  id: "generic",
  label: "Generic",
  detect: () => true, // fallback applies everywhere
  scrollContainer: () => document.scrollingElement || document.documentElement,
  getFileInput: () => {
    try {
      // Prefer file input near the text input/composer
      const input = document.querySelector("textarea, input[type='text'], [contenteditable='true'], [role='textbox']");
      if (input) {
        let p = input.closest('form') || input.parentElement;
        for (let i = 0; i < 6 && p; i++) {
          const inps = p.querySelectorAll && p.querySelectorAll('input[type="file"]');
          if (inps && inps.length) return inps[0];
          p = p.parentElement;
        }
      }
      // Fallback: any file input on page
      const any = document.querySelector('input[type="file"]');
      return any || null;
    } catch (e) { return null; }
  },
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
      // Optimization: traverse down to find the element with the most text-containing children
      // instead of querying all descendants which is very slow
      let wrapper = container;

      // Limit depth to avoid infinite loops
      for (let i = 0; i < 5; i++) {
        if (!wrapper) break;
        const children = Array.from(wrapper.children).filter(n => n.tagName !== 'SCRIPT' && n.tagName !== 'STYLE' && n.tagName !== 'NOSCRIPT');
        const validChildren = children.filter(n => n.innerText && normalizeText(n.innerText).length > 3);

        // If we have a good number of children, check if a single child contains even more
        if (validChildren.length > 0) {
          // Find a child that has significantly more valid children than the current wrapper
          let betterChild = null;
          let maxCount = validChildren.length;

          // Only check children that are container-like
          const candidates = children.filter(c => ['DIV', 'MAIN', 'SECTION', 'UL', 'OL', 'ARTICLE'].includes(c.tagName));

          for (const child of candidates) {
            // Quick check of child's children count to avoid unnecessary processing
            if (child.children.length > maxCount) {
              const grandChildren = Array.from(child.children).filter(n => n.innerText && normalizeText(n.innerText).length > 3);
              if (grandChildren.length > maxCount) {
                maxCount = grandChildren.length;
                betterChild = child;
              }
            }
          }

          if (betterChild) {
            wrapper = betterChild;
          } else {
            // Current wrapper is likely the best
            break;
          }
        } else if (children.length === 1) {
          // Single child, go down
          wrapper = children[0];
        } else {
          break;
        }
      }

      // Now extract messages from the wrapper
      const candidates = Array.from(wrapper.children)
        .filter(n => n && n.innerText && normalizeText(n.innerText).length > 3);

      // map to structured messages (in DOM order)
      const mapped = candidates.map(n => ({ el: n, text: normalizeText(n.innerText), top: (() => { try { return n.getBoundingClientRect().top } catch (e) { return 0 } })(), role: guessRoleFromElement(n) }));

      // dedupe contiguous duplicates
      const out = [];
      for (const m of mapped) {
        if (!m.text) continue;
        if (out.length && out[out.length - 1].text === m.text && out[out.length - 1].role === m.role) continue;
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
        const cls = (c.className || '').toString().toLowerCase();
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
  mapped.sort((a, b) => a.top - b.top);
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
    } catch (e) { }
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
      const container = document.querySelector('[data-testid="conversation-turns"]') || document.querySelector('main') || document.body;
      if (!container) {
        console.log('[ChatGPT Debug] No container found');
        return [];
      }
      const wrappers = Array.from(container.querySelectorAll('[data-message-author-role]'));
      console.log('[ChatGPT Debug] Found wrappers:', wrappers.length);

      if (!wrappers.length) return [];
      const out = [];
      wrappers.forEach((w, i) => {
        const roleAttr = (w.getAttribute('data-message-author-role') || '').toLowerCase();
        const role = roleAttr.includes('user') ? 'user' : 'assistant';

        const body = w.querySelector('.markdown, .prose, .text-base, [data-testid*="message"]') || w;
        if (!body) {
          console.log(`[ChatGPT Debug] Wrapper ${i}: SKIPPED (no body)`);
          return;
        }

        const style = window.getComputedStyle(body);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          console.log(`[ChatGPT Debug] Wrapper ${i}: SKIPPED (hidden) role=${role}`);
          return;
        }

        // Use extractTextWithFormatting if available, otherwise fall back to innerText
        const text = (() => {
          try {
            if (typeof window.extractTextWithFormatting === 'function') {
              return window.extractTextWithFormatting(body);
            }
            return (body.innerText || '').trim();
          } catch (err) { return ''; }
        })();

        if (!text || text.length === 0) {
          console.log(`[ChatGPT Debug] Wrapper ${i}: SKIPPED (no text) role=${role}`);
          return;
        }

        // Only include actual chat messages (exclude system/tip/label)
        if (/^(new chat|system|tip:|regenerate|copy|share|model:|clear conversation|export|delete|upgrade|settings|custom instructions|beta|plus|team|help|log out|log in|sign up|quiz.com vs kahoot)$/i.test(text)) {
          console.log(`[ChatGPT Debug] Wrapper ${i}: SKIPPED (system message) role=${role} text="${text.slice(0, 40)}"`);
          return;
        }

        console.log(`[ChatGPT Debug] Wrapper ${i}: INCLUDED role=${role} text="${text.slice(0, 60)}"`);
        out.push({ role, text, el: body });
      });

      out.sort((a, b) => {
        try { return a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top; } catch (err) { return 0; }
      });

      console.log('[ChatGPT Debug] FINAL:', out.length, 'messages');
      adapterDebug('adapter:chatgpt', { wrappers: wrappers.length, filtered: out.length, sample: out.slice(0, 5).map(m => m.text.slice(0, 80)) });
      return out;
    },
    getInput: () => {
      // ChatGPT uses a contenteditable div as the main input, with a hidden textarea fallback
      // Try to find the visible contenteditable first
      const contentEditable = document.querySelector('#prompt-textarea');
      if (contentEditable && contentEditable.isContentEditable) {
        return contentEditable;
      }

      // Fallback: look for any contenteditable in the composer area
      const composerArea = document.querySelector('form') || document.querySelector('[class*="composer"]') || document.body;
      const editables = Array.from(composerArea.querySelectorAll('[contenteditable="true"]'));
      const visible = editables.filter(el => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });

      if (visible.length > 0) {
        return visible[0];
      }

      // Last resort: return the textarea (but this won't trigger the UI properly)
      return document.querySelector("textarea");
    }
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

      // Robust wrapper selection for user and assistant messages
      // Look for message wrapper containers first (more reliable than scanning all p tags)
      // NOTE: Keep selectors specific; avoid generic classes (e.g., .prose/.markdown) that appear in both roles.
      const userSelectors = [
        '[data-testid="user-message"]',
        '[class*="font-user-message"]',
        '[class*="from-user"]',
        '[class*="user-message"]'
      ];
      const assistantSelectors = [
        '[data-testid="assistant-message"]',
        '.standard-markdown',
        '[class*="font-claude-message"]',
        '[class*="from-claude"]',
        '[class*="assistant-message"]',
        '[class*="assistant"]'
      ];

      let userWrappers = Array.from(container.querySelectorAll(userSelectors.join(', ')));
      let assistantWrappers = Array.from(container.querySelectorAll(assistantSelectors.join(', ')));
      // Derive structural candidates likely representing message turns
      const structuralSelector = '[data-testid*="message"], .standard-markdown, .markdown, .whitespace-pre-wrap, .break-words, [class*="message"], [class*="chat-bubble"]';
      const structuralCandidates = Array.from(container.querySelectorAll(structuralSelector));

      // Find top-level wrappers for each candidate (closest ancestor whose parent is the container)
      const toTopLevelWrapper = (el) => {
        try {
          if (!el) return null;
          let node = el;
          let top = el;
          let steps = 0;
          while (node && node !== container && node.parentElement && steps < 10) {
            if (node.parentElement === container) { top = node; break; }
            top = node;
            node = node.parentElement;
            steps++;
          }
          return top || el;
        } catch (e) { return el; }
      };

      const structuralWrappers = structuralCandidates.map(toTopLevelWrapper).filter(Boolean);

      // Merge all wrapper sources and dedupe by top-level element
      let combinedWrappers = [...userWrappers, ...assistantWrappers, ...structuralWrappers];
      combinedWrappers = combinedWrappers.filter((el, idx, arr) => el && !arr.some((other, j) => j !== idx && other.contains(el)));
      // Remove duplicates by identity
      const uniq = new Set();
      combinedWrappers = combinedWrappers.filter(el => { if (uniq.has(el)) return false; uniq.add(el); return true; });

      console.log('[Claude Debug] Wrapper sources -> user:', userWrappers.length, 'assistant:', assistantWrappers.length, 'struct:', structuralWrappers.length, 'combinedTopLevel:', combinedWrappers.length);

      // Helper to infer role using specific cues; avoid generic class traps
      const inferRole = (el) => {
        try {
          if (!el) return '';
          const testEl = el.closest('*');
          if (!testEl) return '';
          if (testEl.matches(userSelectors.join(',')) || testEl.closest(userSelectors.join(','))) return 'user';
          if (testEl.matches(assistantSelectors.join(',')) || testEl.closest(assistantSelectors.join(','))) return 'assistant';
          // data-testid hints
          const ancWithTestId = testEl.closest('[data-testid]');
          const tid = ancWithTestId && ancWithTestId.getAttribute('data-testid');
          if (tid) {
            if (/user/i.test(tid)) return 'user';
            if (/assistant|model|claude/i.test(tid)) return 'assistant';
          }
          // aria-label hints
          const ancWithAria = testEl.closest('[aria-label]');
          const aria = ancWithAria && ancWithAria.getAttribute('aria-label');
          if (aria) {
            if (/you|user/i.test(aria)) return 'user';
            if (/assistant|claude|response/i.test(aria)) return 'assistant';
          }
          return '';
        } catch (e) { return ''; }
      };

      // If no wrappers found, fallback to p-scan (last resort)
      let entries = [];
      if (combinedWrappers.length) {
        // Sort by DOM order
        combinedWrappers.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
        // Assign roles with inference and alternation fallback
        let lastRole = '';
        entries = combinedWrappers.map((el, i) => {
          let role = inferRole(el);
          if (!role) role = lastRole === 'user' ? 'assistant' : 'user';
          lastRole = role;
          return { el, role };
        });
      } else {
        // Fallback: use p-scan but group by nearest role-like ancestor
        const ps = Array.from(container.querySelectorAll('p, .whitespace-pre-wrap, .break-words'));
        const grouped = new Map();
        ps.forEach(p => {
          let a = p.closest(userSelectors.join(',')) || p.closest(assistantSelectors.join(','));
          if (!a) return; // skip if no role-like ancestor
          const role = a.matches(userSelectors.join(',')) ? 'user' : 'assistant';
          if (!grouped.has(a)) grouped.set(a, { el: a, role, nodes: [] });
          grouped.get(a).nodes.push(p);
        });
        entries = Array.from(grouped.values());
        // Sort by DOM order
        entries.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
      }

      const sanitize = (text, role) => {
        // Remove UI/system lines and echoes
        let t = (text || '').replace(/\u00A0/g, ' ');
        // Remove UI lines
        t = t.split('\n').filter(line => !/continue the conversation|claude can make mistakes|new chat|system|tip:|regenerate|copy|share|model:|clear conversation|export|delete|upgrade|settings|custom instructions|beta|plus|team|help|log out|log in|sign up/i.test(line)).join('\n');
        if (role === 'assistant') {
          t = t.replace(/^User:\s.*$/gim, '');
        }
        if (role === 'user') {
          t = t.replace(/^N\s*/i, '').replace(/^User:\s*/i, '');
        }
        // Normalize whitespace
        t = t.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
        return t;
      };

      const messages = [];
      entries.forEach((entry, i) => {
        // Collect text nodes inside the wrapper
        const nodes = entry.nodes || Array.from(entry.el.querySelectorAll('p, .whitespace-pre-wrap, .whitespace-normal, .break-words'));
        const rawText = nodes.length ? nodes.map(n => (n.innerText || '').trim()).filter(Boolean).join('\n') : (entry.el.innerText || '').trim();
        try {
          // Log pre-sanitize snapshot (trim newlines for compact logs)
          console.log(`[Claude Debug] Entry ${i} pre-sanitize: role=${entry.role} nodes=${nodes.length} rawLen=${rawText.length} preview="${rawText.slice(0, 160).replace(/\n/g, '␤')}" el=${entry.el && entry.el.tagName} class="${(entry.el && entry.el.className) ? String(entry.el.className).slice(0, 120) : ''}"`);
        } catch (e) { }
        const text = sanitize(rawText, entry.role);
        if (!text || text.length <= 2) {
          try {
            console.log(`[Claude Debug] Skipping empty/filtered message ${i} role=${entry.role} sanitizedLen=${(text || '').length} sanitizedPreview="${(text || '').slice(0, 160).replace(/\n/g, '␤')}"`);
            // Optionally log node previews for deeper inspection (trim to avoid huge output)
            if (nodes && nodes.length) {
              const previews = nodes.slice(0, 4).map(n => (n && (n.innerText || '')).toString().replace(/\n/g, '␤').slice(0, 200));
              console.log(`[Claude Debug] Skipping details: nodePreviews=${JSON.stringify(previews)}`);
            }
          } catch (e) { }
          return;
        }
        console.log(`[Claude Debug] Message ${i}: role=${entry.role} text="${text.slice(0, 60)}"`);
        messages.push({ role: entry.role, text });
      });

      adapterDebug('adapter:claude', { wrappers: entries.length, filtered: messages.length, sample: messages.slice(0, 8).map(m => m.text.slice(0, 80)) });
      return messages;
    },
    getInput: () => {
      // Claude-specific selectors (try these first)
      let el = document.querySelector('[data-testid="composer-input"], [data-testid="composer"], [data-testid="prompt-input"]');
      if (el) {
        console.log('[Claude Debug] Found input via data-testid:', el.tagName);
        return el;
      }

      // Look for contenteditable with specific Claude patterns
      const contentEditables = Array.from(document.querySelectorAll('[contenteditable="true"], [role="textbox"]'));
      for (const ce of contentEditables) {
        // Check if it's visible and likely the main composer
        const style = window.getComputedStyle(ce);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

        // Check for Claude-specific attributes/patterns
        const placeholder = ce.getAttribute('placeholder') || '';
        const ariaLabel = ce.getAttribute('aria-label') || '';
        const className = (ce.className || '').toString().toLowerCase();
        const parent = ce.closest('[class*="composer"], [class*="input"], [class*="prompt"], form');

        // Common Claude patterns
        if (placeholder.includes('help') || placeholder.includes('message') || placeholder.includes('ask') ||
          ariaLabel.includes('message') || ariaLabel.includes('prompt') || ariaLabel.includes('ask') ||
          className.includes('composer') || className.includes('prompt') || parent) {
          console.log('[Claude Debug] Found input via contenteditable pattern:', ce.tagName, placeholder || ariaLabel);
          return ce;
        }
      }

      // Try obvious inputs
      el = document.querySelector('textarea, input[type=text], input[type=search]');
      if (el) {
        console.log('[Claude Debug] Found input via textarea/input:', el.tagName);
        return el;
      }

      // aria labelled inputs
      el = document.querySelector('[aria-label*="message"], [aria-label*="Message"], [aria-label*="Ask"], [aria-label*="prompt"], [placeholder*="message"], [placeholder*="help"]');
      if (el) {
        console.log('[Claude Debug] Found input via aria-label/placeholder:', el.tagName);
        return el;
      }

      // last resort: any input near a send button
      const send = document.querySelector('button[aria-label*="send"], button[aria-label*="Send"], button[type="submit"], button:has-text("Send")');
      if (send) {
        const near = send.closest('form') || send.closest('div') || document.body;
        const inp = near.querySelector('textarea, input, [contenteditable="true"]');
        if (inp) {
          console.log('[Claude Debug] Found input near send button:', inp.tagName);
          return inp;
        }
      }

      console.log('[Claude Debug] No input found');
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
        } catch (e) { }
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
        } catch (e) { }
      }
      mainChat = mainChat || document.querySelector('main') || document.body;
      console.log('[Gemini Debug] Using mainChat:', mainChat.tagName, (mainChat.className || ''));

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
            if (!ok) console.log('[Gemini Debug] Dropping native tag (no text):', tag, contentNode && contentNode.innerText?.slice(0, 40));
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
            console.log('[Gemini Debug] Excluding container (too short):', container.tagName, text?.slice(0, 40));
            return false;
          }

          // Exclude UI chrome containers by matching exact label text
          if (/^(show thinking|try:|suggested|related|regenerate|copy|share|new chat|history|more options)$/i.test(text)) {
            console.log('[Gemini Debug] Excluding container (UI chrome):', text.slice(0, 40));
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
        } catch (e) { }

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
        const key = (m.role || '') + '|' + m.text.slice(0, 100);
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
      const nodes = Array.from(document.querySelectorAll(".answer, .conversation__message, .chat-bubble")).filter(n => n && n.innerText && n.innerText.trim().length > 1);
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
      const nodes = Array.from(document.querySelectorAll(".message, .chat-item, .bot, .user")).filter(n => n && n.innerText && n.innerText.trim().length > 1);
      return nodes.map(n => ({ role: (n.className || "").toLowerCase().includes("user") ? "user" : "assistant", text: n.innerText.trim() }));
    },
    getInput: () => document.querySelector("textarea, [contenteditable='true']")
  },
  {
    id: "mistral",
    label: "Mistral (chat.mistral.ai)",
    detect: () => location.hostname.includes("mistral.ai"),
    scrollContainer: () => document.querySelector("main") || document.scrollingElement,
    getMessages: () => {
      const nodes = Array.from(document.querySelectorAll(".chat-message, .assistant, .user, .message")).filter(n => n && n.innerText && n.innerText.trim().length > 1);
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
      const nodes = Array.from(document.querySelectorAll(".reply, .message, .assistant")).filter(n => n && n.innerText && n.innerText.trim().length > 1);
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
      const nodes = Array.from(document.querySelectorAll(".conversation, .answer, .bot-message, .user-message")).filter(n => n && n.innerText && n.innerText.trim().length > 1);
      return nodes.map(n => ({ role: (n.className || "").toLowerCase().includes("user") ? "user" : "assistant", text: n.innerText.trim() }));
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
      return nodes.map(n => ({ role: (n.className || "").toLowerCase().includes("user") ? "user" : "assistant", text: n.innerText.trim() }));
    },
    getInput: () => document.querySelector("textarea, input[type='text']")
  },
  {
    id: "metaai",
    label: "Meta AI",
    detect: () => location.hostname.includes("meta.ai") || location.hostname.includes("facebook.com"),
    scrollContainer: () => document.scrollingElement,
    getMessages: () => {
      const nodes = Array.from(document.querySelectorAll(".message, .ai-response, .chat-bubble")).filter(n => n && n.innerText && n.innerText.trim().length > 1);
      return nodes.map(n => ({ role: (n.className || "").toLowerCase().includes("user") ? "user" : "assistant", text: n.innerText.trim() }));
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
