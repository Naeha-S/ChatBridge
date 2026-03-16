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
    responseStructureHints: {
      // ChatGPT: heavy markdown structure — headers, bullet lists, code blocks
      codeHeavy: true,
      citationHeavy: false,
      segParams: { maxTurnsPerSegment: 7, roleClusterThreshold: 5, topicShiftSensitivity: 0.6 }
    },
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
    responseStructureHints: {
      // Claude: long-form paragraphs, numbered reasoning, fewer headers
      codeHeavy: false,
      citationHeavy: false,
      segParams: { maxTurnsPerSegment: 5, roleClusterThreshold: 6, topicShiftSensitivity: 0.6 }
    },
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
    responseStructureHints: {
      // Gemini: shorter, conversational turns; fewer code blocks
      codeHeavy: false,
      citationHeavy: false,
      segParams: { maxTurnsPerSegment: 12, roleClusterThreshold: 4, topicShiftSensitivity: 0.4 }
    },
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
    responseStructureHints: {
      // Perplexity: citation-heavy, self-contained responses with inline sources
      codeHeavy: false,
      citationHeavy: true,
      segParams: { maxTurnsPerSegment: 6, roleClusterThreshold: 5, topicShiftSensitivity: 0.65 }
    },
    detect: () => location.hostname.includes("perplexity.ai"),
    scrollContainer: () => document.querySelector('[class*="ThreadContent"]') || document.querySelector('main') || document.scrollingElement,
    getMessages: () => {
      const messages = [];

      // Perplexity structures: look for thread/query blocks
      // User messages are typically in query wrappers
      const threadBlocks = document.querySelectorAll('[class*="ThreadMessage"], [class*="ConversationTurn"], [data-testid*="message"]');

      if (threadBlocks.length) {
        threadBlocks.forEach(block => {
          const cls = (block.className || '').toLowerCase();
          const isUser = cls.includes('user') || cls.includes('query') || cls.includes('human');

          // Get text content from the prose/markdown area
          const textEl = block.querySelector('.prose, .markdown, [class*="message-content"]') || block;
          const text = (textEl.innerText || '').trim();

          if (text && text.length > 3) {
            // Skip citations, sources, related questions
            if (/^\\[\\d+\\]|^Source:|^Related:|^Citations?:|^See also:/i.test(text)) return;
            if (/^\\d+\\s*(sources?|results?)/i.test(text)) return;

            if (!messages.some(m => m.text === text)) {
              messages.push({ role: isUser ? 'user' : 'assistant', text, el: block });
            }
          }
        });
      } else {
        // Fallback: look for specific Perplexity elements
        // User queries
        const queries = document.querySelectorAll('[class*="Query"], [class*="UserMessage"], .whitespace-pre-wrap:not(.prose)');
        queries.forEach(q => {
          const text = (q.innerText || '').trim();
          if (text && text.length > 2 && !messages.some(m => m.text === text)) {
            messages.push({ role: 'user', text, el: q });
          }
        });

        // AI answers - be very specific to avoid grabbing citations
        const answers = document.querySelectorAll('[class*="AnswerContent"], [class*="prose"]:not([class*="source"]):not([class*="citation"])');
        answers.forEach(a => {
          const text = (a.innerText || '').trim();
          if (text && text.length > 20 && !messages.some(m => m.text === text)) {
            if (!/^\\[\\d+\\]|^Source:|^Related:/i.test(text)) {
              messages.push({ role: 'assistant', text, el: a });
            }
          }
        });
      }

      // Sort by vertical position
      messages.sort((a, b) => {
        try { return a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top; } catch (e) { return 0; }
      });

      return messages;
    },
    getInput: () => document.querySelector('textarea[placeholder*="Ask"], textarea[class*="Input"], textarea, [contenteditable="true"]')
  },
  {
    id: "poe",
    label: "Poe (poe.com)",
    responseStructureHints: {
      // Poe: varies by bot, use moderate defaults
      codeHeavy: false,
      citationHeavy: false,
      segParams: { maxTurnsPerSegment: 8, roleClusterThreshold: 5, topicShiftSensitivity: 0.5 }
    },
    detect: () => location.hostname.includes("poe.com"),
    scrollContainer: () => document.querySelector('[class*="ChatMessagesView"]') || document.querySelector("main") || document.scrollingElement,
    getMessages: () => {
      const messages = [];

      // Poe often renders quick-suggestion chips like:
      // "Assistant: Compare @GPT-5.2 Compare @Kimi..." as UI affordances.
      // These are not real conversation turns and should not be scanned.
      const isPoeModelCompareSuggestion = (text) => {
        try {
          const t = String(text || '').replace(/\s+/g, ' ').trim();
          if (!t) return false;
          const hasCompareLead = /^assistant:\s*compare\s+@/i.test(t) || /^compare\s+@/i.test(t);
          const compareMentions = (t.match(/\bcompare\s+@/gi) || []).length;
          const modelMentions = (t.match(/@[\w.-]+/g) || []).length;
          const isShortSuggestionLine = t.length <= 220;
          return hasCompareLead && isShortSuggestionLine && compareMentions >= 1 && modelMentions >= 2;
        } catch (_) {
          return false;
        }
      };

      // Poe uses specific message wrapper classes - target the actual message bubbles
      // Look for message containers with specific Poe class patterns
      const messageContainers = document.querySelectorAll('[class*="Message_row"], [class*="ChatMessage"], [class*="message_row"]');

      messageContainers.forEach(container => {
        // Find the actual text content, not the entire container
        const textEl = container.querySelector('[class*="Message_text"], [class*="Markdown_markdownContainer"], [class*="markdown"], .prose') || container;
        const text = (textEl.innerText || '').trim();

        // Skip if too short, is a script, JSON, or system text
        if (!text || text.length < 3) return;
        if (text.startsWith('{') || text.startsWith('[') || text.startsWith('function') || text.startsWith('var ') || text.startsWith('window.')) return;
        if (/^!function|^<img|^<script|fbq\(|gtm\.start|OptanonWrapper/i.test(text)) return;
        if (/View all Bots|Get more points|Creators API|Download.*app|Follow us|Privacy policy|Terms of service/i.test(text)) return;
        if (isPoeModelCompareSuggestion(text)) return;

        // Determine role - look for specific class patterns
        const containerClass = (container.className || '').toLowerCase();
        const parentClass = (container.parentElement?.className || '').toLowerCase();
        const isUser = containerClass.includes('human') || containerClass.includes('user') || parentClass.includes('human') || parentClass.includes('user');

        // Avoid duplicates
        if (!messages.some(m => m.text === text)) {
          messages.push({ role: isUser ? 'user' : 'assistant', text, el: container });
        }
      });

      // Sort by vertical position
      messages.sort((a, b) => {
        try { return a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top; } catch (e) { return 0; }
      });

      return messages;
    },
    getInput: () => document.querySelector('textarea[class*="GrowingTextArea"], textarea, [contenteditable="true"]')
  },
  {
    id: "mistral",
    label: "Mistral (chat.mistral.ai)",
    responseStructureHints: {
      // Mistral: moderate length, structured but not heavy on markdown
      codeHeavy: false,
      citationHeavy: false,
      segParams: { maxTurnsPerSegment: 8, roleClusterThreshold: 5, topicShiftSensitivity: 0.5 }
    },
    detect: () => location.hostname.includes("mistral.ai"),
    scrollContainer: () => document.querySelector("main") || document.scrollingElement,
    getMessages: () => {
      const normalize = (value) => String(value || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
      const getText = (el) => {
        try {
          if (typeof window !== 'undefined' && typeof window.extractTextWithFormatting === 'function') {
            return normalize(window.extractTextWithFormatting(el));
          }
        } catch (_) { }
        return normalize(el && el.innerText);
      };
      const isVisible = (el) => {
        try {
          if (!el || !el.getBoundingClientRect) return false;
          if (el.closest && el.closest('#cb-host, [data-cb-ignore="true"], nav, header, aside, [role="navigation"]')) return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        } catch (_) { return false; }
      };
      const isMistralUiText = (text) => {
        const t = normalize(text).toLowerCase();
        if (!t) return true;
        if (/^sign in sign up$/i.test(t)) return true;
        if (/^think tools le chat can make mistakes\. check answers\. learn more$/i.test(t)) return true;
        if (/^le chat can make mistakes\. check answers\. learn more$/i.test(t)) return true;
        if (/^think tools$/i.test(t)) return true;
        if (/^learn more$/i.test(t)) return true;
        return false;
      };
      const cleanMistralText = (text) => {
        let out = String(text || '');
        out = out.replace(/^sign in\s+sign up\s*/i, '');
        out = out.replace(/\s*think tools\s+le chat can make mistakes\. check answers\. learn more\s*$/i, '');
        out = out.replace(/\s*le chat can make mistakes\. check answers\. learn more\s*$/i, '');
        return normalize(out);
      };
      const inferRole = (el, text) => {
        const cls = ((el && el.className) || '').toString().toLowerCase();
        const attrs = `${(el && el.getAttribute && (el.getAttribute('aria-label') || '')) || ''} ${(el && el.getAttribute && (el.getAttribute('data-testid') || '')) || ''}`.toLowerCase();
        const preview = normalize(text).toLowerCase();
        if (/\buser\b|\byou\b|\bprompt\b|\brequest\b/.test(cls) || /\buser\b|\byou\b|\bprompt\b|\brequest\b/.test(attrs)) return 'user';
        if (/assistant|answer|response|bot|model/.test(cls) || /assistant|answer|response|bot|model/.test(attrs)) return 'assistant';
        if (preview.length <= 240 && !/[.!?]\s/.test(preview)) return 'user';
        return 'assistant';
      };
      const splitCollapsedTranscript = (text) => {
        const raw = cleanMistralText(text);
        if (!raw) return [];
        const timeRegex = /\b\d{1,2}:\d{2}\s?(?:am|pm)\b/ig;
        const matches = Array.from(raw.matchAll(timeRegex));
        if (!matches.length) return [];
        const parts = [];
        const firstIndex = matches[0].index;
        const lead = normalize(raw.slice(0, firstIndex));
        if (lead && !isMistralUiText(lead)) {
          parts.push({ role: 'user', text: lead });
        }
        for (let i = 0; i < matches.length; i++) {
          const start = matches[i].index + matches[i][0].length;
          const end = i + 1 < matches.length ? matches[i + 1].index : raw.length;
          let chunk = normalize(raw.slice(start, end));
          chunk = cleanMistralText(chunk);
          if (!chunk || isMistralUiText(chunk)) continue;
          parts.push({ role: i === 0 ? 'assistant' : 'assistant', text: chunk });
        }
        return parts.filter((part) => part.text && !isMistralUiText(part.text));
      };

      const container = findChatContainerNearby(document.querySelector('textarea, [contenteditable="true"], [role="textbox"]')) || document.querySelector('main') || document.body;
      const selectors = [
        '[data-testid*="message"]',
        '[data-testid*="turn"]',
        '[role="article"]',
        'article',
        '[class*="message"]',
        '[class*="turn"]',
        '[class*="answer"]',
        '[class*="response"]',
        '[class*="assistant"]',
        '[class*="user"]',
        '[class*="prompt"]'
      ];
      let nodes = [];
      try {
        nodes = Array.from(container.querySelectorAll(selectors.join(','))).filter(isVisible);
      } catch (_) {
        nodes = [];
      }

      nodes = nodes.filter((node, index, arr) => {
        if (!node) return false;
        const ownText = getText(node);
        return !arr.some((other, otherIndex) => {
          if (!other || other === node || otherIndex === index) return false;
          try {
            if (!node.contains(other)) return false;
            const otherText = getText(other);
            return otherText.length > 10 && otherText.length < ownText.length;
          } catch (_) { return false; }
        });
      });

      let messages = [];
      for (const node of nodes) {
        const rawText = getText(node);
        const cleanedText = cleanMistralText(rawText);
        if (!cleanedText || isMistralUiText(cleanedText)) continue;

        const transcriptParts = splitCollapsedTranscript(cleanedText);
        if (transcriptParts.length > 1) {
          messages.push(...transcriptParts.map((part) => ({ role: part.role, text: part.text, el: node })));
          continue;
        }

        const role = inferRole(node, cleanedText);
        messages.push({ role, text: cleanedText, el: node });
      }

      if (!messages.length || messages.length === 1) {
        const transcriptFallback = splitCollapsedTranscript(getText(container));
        if (transcriptFallback.length > messages.length) {
          messages = transcriptFallback.map((part) => ({ role: part.role, text: part.text, el: container }));
        }
      }

      const seen = new Set();
      const filtered = messages.filter((msg) => {
        const text = cleanMistralText(msg && msg.text);
        if (!text || text.length < 2) return false;
        if (isMistralUiText(text)) return false;
        const key = `${msg.role}|${text}`;
        if (seen.has(key)) return false;
        seen.add(key);
        msg.text = text;
        return true;
      });

      adapterDebug('adapter:mistral', {
        nodes: nodes.length,
        filtered: filtered.length,
        sample: filtered.slice(0, 6).map((m) => `${m.role}: ${m.text.slice(0, 80)}`)
      });

      return filtered;
    },
    getInput: () => document.querySelector("textarea, [contenteditable='true']")
  },
  {
    id: "grok",
    label: "Grok (x.ai / grok)",
    responseStructureHints: {
      // Grok: conversational, concise responses
      codeHeavy: false,
      citationHeavy: false,
      segParams: { maxTurnsPerSegment: 10, roleClusterThreshold: 5, topicShiftSensitivity: 0.45 }
    },
    detect: () => location.hostname.includes("x.ai") || location.hostname.includes("grok.ai") || location.hostname.includes("grok.com"),
    scrollContainer: () => document.scrollingElement,
    getMessages: () => {
      const normalize = (v) => String(v || '').replace(/\s+/g, ' ').trim();
      const isGrokUiText = (text) => {
        const t = normalize(text).toLowerCase();
        if (!t || t.length > 500) return false;
        if (/(sign in|sign up|new chat|import|settings|appearance)/.test(t)) return true;
        return false;
      };
      const nodes = Array.from(document.querySelectorAll("[role='main'] [class*='message'], [role='main'] [class*='turn'], [role='main'] article")).filter(n => {
        if (!n || !n.innerText) return false;
        const text = n.innerText.trim();
        if (text.length < 2) return false;
        if (isGrokUiText(text)) return false;
        return true;
      });
      return nodes.map(n => ({
        role: (n.className || "").toLowerCase().includes("user") ? "user" : "assistant",
        text: normalize(n.innerText),
        el: n
      })).filter((m, i, arr) => {
        if (i > 0 && arr[i - 1].text === m.text) return false;
        return true;
      });
    },
    getInput: () => {
      if (document.activeElement && (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.getAttribute('contenteditable') === 'true')) {
        return document.activeElement;
      }
      const main = document.querySelector("[role='main']");
      if (main) {
        const ta = main.querySelector("textarea[placeholder*='mess' i], textarea[placeholder*='ask' i], textarea[placeholder*='prompt' i]");
        if (ta) return ta;
      }
      const candidates = Array.from(document.querySelectorAll("textarea, [contenteditable='true']")).filter(el => {
        try {
          const rect = el.getBoundingClientRect();
          if (rect.height < 20 || rect.width < 100) return false;
          if (!el.closest("[role='navigation'], nav, aside, [class*='sidebar']")) return true;
        } catch (_) { }
        return false;
      });
      return candidates[0] || document.querySelector("textarea, [contenteditable='true']");
    }
  },
  {
    id: "copilot",
    label: "MS Copilot / Bing Chat",
    responseStructureHints: {
      // Copilot: citation-augmented, moderate length
      codeHeavy: false,
      citationHeavy: true,
      segParams: { maxTurnsPerSegment: 7, roleClusterThreshold: 5, topicShiftSensitivity: 0.55 }
    },
    detect: () => location.hostname.includes("bing.com") || location.hostname.includes("copilot.microsoft.com"),
    scrollContainer: () => document.querySelector("main") || document.scrollingElement,
    getMessages: () => {
      const normalize = (value) => String(value || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
      const getText = (el) => {
        try {
          if (typeof window !== 'undefined' && typeof window.extractTextWithFormatting === 'function') {
            return normalize(window.extractTextWithFormatting(el));
          }
        } catch (_) { }
        return normalize(el && el.innerText);
      };
      const isVisible = (el) => {
        try {
          if (!el || !el.getBoundingClientRect) return false;
          if (el.closest && el.closest('#cb-host, [data-cb-ignore="true"], nav, header, aside, [role="navigation"]')) return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        } catch (_) { return false; }
      };
      const isCopilotUiText = (text) => {
        const t = normalize(text).toLowerCase();
        if (!t) return true;
        if (t.length <= 220 && /^(open sidebar|go to copilot home page|new chat|discover|imagine|labs|library|dismiss|message copilot)$/i.test(t)) return true;
        if (t.length <= 600 && /(quick response|real talk|think deeper|study and learn|actions|search)/.test(t) && /(message copilot|attach files|connect apps|copilot)/.test(t)) return true;
        if (/^show all smart$/i.test(t)) return true;
        if (t.startsWith('{"lng":"en-us","resources":')) return true;
        if (t.includes('server.html.title":"microsoft copilot: your ai companion')) return true;
        if (t.includes('sidebar.actions.newchatv2') || t.includes('composer.chatmodes.reasoning.title')) return true;
        if (/^sources?$/i.test(t)) return true;
        return false;
      };
      const stripRoleLabel = (text, role) => {
        let out = String(text || '').trim();
        out = out.replace(/^(today|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+/i, '');
        if (role === 'user') out = out.replace(/^you said\s*/i, '');
        if (role === 'assistant') out = out.replace(/^copilot said\s*/i, '');
        return out.trim();
      };
      const splitTranscript = (text) => {
        const raw = String(text || '').trim();
        const labelRegex = /(?:^|\s)(today|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)?\s*(you said|copilot said)\s/gi;
        const matches = [];
        let match;
        while ((match = labelRegex.exec(raw)) !== null) {
          matches.push({ index: match.index + (match[0].startsWith(' ') ? 1 : 0), role: /you said/i.test(match[2]) ? 'user' : 'assistant' });
        }
        if (!matches.length) return [];
        const parts = [];
        for (let i = 0; i < matches.length; i++) {
          const start = matches[i].index;
          const end = i + 1 < matches.length ? matches[i + 1].index : raw.length;
          const chunk = raw.slice(start, end).trim();
          const role = matches[i].role;
          const cleaned = stripRoleLabel(chunk, role);
          if (!cleaned || isCopilotUiText(cleaned)) continue;
          parts.push({ role, text: cleaned });
        }
        return parts;
      };
      const inferRole = (el, text) => {
        const cls = ((el && el.className) || '').toString().toLowerCase();
        const attrs = `${(el && el.getAttribute && (el.getAttribute('aria-label') || '')) || ''} ${(el && el.getAttribute && (el.getAttribute('data-testid') || '')) || ''}`.toLowerCase();
        const preview = normalize(text).toLowerCase();
        if (/\byou said\b/.test(preview)) return 'user';
        if (/\bcopilot said\b/.test(preview)) return 'assistant';
        if (/user|request|prompt|human|you/.test(cls) || /user|request|prompt|human|you/.test(attrs)) return 'user';
        if (/assistant|copilot|bot|response|answer|agent/.test(cls) || /assistant|copilot|bot|response|answer|agent/.test(attrs)) return 'assistant';
        return 'assistant';
      };

      const container = findChatContainerNearby(document.querySelector('textarea, [contenteditable="true"], [role="textbox"]')) || document.querySelector('main') || document.body;
      const selectors = [
        '[data-testid*="message"]',
        '[data-testid*="turn"]',
        '[data-content*="message"]',
        '[data-content*="turn"]',
        '[role="article"]',
        'article',
        '[class*="message"]',
        '[class*="turn"]',
        '[class*="response"]',
        '[class*="answer"]',
        '[class*="request"]'
      ];
      let nodes = [];
      try {
        nodes = Array.from(container.querySelectorAll(selectors.join(','))).filter(isVisible);
      } catch (_) {
        nodes = [];
      }

      nodes = nodes.filter((node, index, arr) => {
        if (!node) return false;
        return !arr.some((other, otherIndex) => {
          if (!other || other === node || otherIndex === index) return false;
          try {
            if (!node.contains(other)) return false;
            return getText(other).length > 24 && getText(other).length < getText(node).length;
          } catch (_) { return false; }
        });
      });

      let messages = [];
      for (const node of nodes) {
        const rawText = getText(node);
        if (!rawText || isCopilotUiText(rawText)) continue;

        const transcriptParts = splitTranscript(rawText);
        if (transcriptParts.length > 1) {
          messages.push(...transcriptParts.map((part) => ({ role: part.role, text: part.text, el: node })));
          continue;
        }

        const role = inferRole(node, rawText);
        const cleaned = stripRoleLabel(rawText, role);
        if (!cleaned || isCopilotUiText(cleaned)) continue;
        messages.push({ role, text: cleaned, el: node });
      }

      if (!messages.length) {
        const transcriptFallback = splitTranscript(getText(container));
        if (transcriptFallback.length) {
          messages = transcriptFallback.map((part) => ({ role: part.role, text: part.text, el: container }));
        }
      }

      const seen = new Set();
      const filtered = messages.filter((msg) => {
        const text = normalize(msg && msg.text);
        if (!text || text.length < 3) return false;
        if (isCopilotUiText(text)) return false;
        const key = `${msg.role}|${text}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      adapterDebug('adapter:copilot', {
        nodes: nodes.length,
        filtered: filtered.length,
        sample: filtered.slice(0, 6).map((m) => `${m.role}: ${m.text.slice(0, 80)}`)
      });

      return filtered;
    },
    getInput: () => document.querySelector("textarea, [contenteditable='true']")
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    responseStructureHints: {
      // DeepSeek: code-heavy (Coder model), structured responses
      codeHeavy: true,
      citationHeavy: false,
      segParams: { maxTurnsPerSegment: 6, roleClusterThreshold: 5, topicShiftSensitivity: 0.6 }
    },
    detect: () => location.hostname.includes("deepseek") || location.hostname.includes("deepseek.ai"),
    scrollContainer: () => document.scrollingElement,
    getMessages: () => {
      const normalize = (v) => String(v || '').replace(/\s+/g, ' ').trim();
      const isDeepSeekUiText = (text) => {
        const t = normalize(text).toLowerCase();
        if (!t || t.length > 300) return false;
        if (/(^new chat$|^today$|^yesterday$|^[a-z]+ \d+|patent research|sign in|sign up|settings)/.test(t)) return true;
        if (t.length <= 50 && /(read \d+ web|web pages|auto|for reference)/.test(t)) return true;
        return false;
      };
      const isLikelySidebarContainer = (el) => {
        try {
          if (!el || !el.closest) return false;
          return !!el.closest('aside, nav, [class*="sidebar"], [class*="nav"], [role="navigation"], header, [class*="item-wrapper"]');
        } catch (_) { return false; }
      };
      let messages = [];
      try {
        const userMsgs = Array.from(document.querySelectorAll('[data-testid*="user"], [class*="user-message"], .message[data-role="user"]'));
        const assistantMsgs = Array.from(document.querySelectorAll('[data-testid*="assistant"], [class*="assistant-message"], .message[data-role="assistant"]'));
        userMsgs.forEach(el => {
          if (isLikelySidebarContainer(el)) return;
          const text = normalize(el.innerText);
          if (text && !isDeepSeekUiText(text)) {
            messages.push({ role: 'user', text, el });
          }
        });
        assistantMsgs.forEach(el => {
          if (isLikelySidebarContainer(el)) return;
          const text = normalize(el.innerText);
          if (text && !isDeepSeekUiText(text)) {
            messages.push({ role: 'assistant', text, el });
          }
        });
      } catch (_) { }
      if (messages.length === 0) {
        try {
          const allMsgs = Array.from(document.querySelectorAll('.message, [class*="message-item"], [class*="chat-item"]'));
          allMsgs.forEach(el => {
            if (isLikelySidebarContainer(el)) return;
            const text = normalize(el.innerText);
            if (text && text.length > 10 && !isDeepSeekUiText(text)) {
              const role = (el.className || "").toLowerCase().includes("user") ? "user" : "assistant";
              messages.push({ role, text, el });
            }
          });
        } catch (_) { }
      }
      if (messages.length > 0) {
        messages.sort((a, b) => {
          try { return a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top; } catch (_) { return 0; }
        });
      }
      const seen = new Set();
      return messages.filter(m => {
        const key = `${m.role}|${m.text.substring(0, 100)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    getInput: () => {
      if (document.activeElement && (document.activeElement.tagName === 'TEXTAREA' || (document.activeElement.getAttribute && document.activeElement.getAttribute('contenteditable') === 'true'))) {
        return document.activeElement;
      }
      const main = document.querySelector('[role="main"], main, .chat');
      if (main) {
        const ta = main.querySelector("textarea[placeholder*='mess' i], textarea[placeholder*='ask' i], input[placeholder*='mess' i]");
        if (ta) return ta;
      }
      const candidates = Array.from(document.querySelectorAll('textarea, input[type="text"]')).filter(el => {
        try {
          const rect = el.getBoundingClientRect();
          if (rect.height < 20 || rect.width < 100) return false;
          if (!el.closest('[role="navigation"], nav, aside, [class*="sidebar"]')) return true;
        } catch (_) { }
        return false;
      });
      return candidates[0] || document.querySelector('textarea, input[type="text"]');
    }
  },
  {
    id: "metaai",
    label: "Meta AI",
    detect: () => location.hostname.includes("meta.ai"),
    scrollContainer: () => document.querySelector('[role="main"], main, [class*="chat"]') || document.scrollingElement,
    getMessages: () => {
      const normalize = (v) => String(v || '').replace(/\s+/g, ' ').trim();
      const isMetaUiChromeText = (text) => {
        const t = normalize(text).toLowerCase();
        if (!t) return true;
        if (t.length <= 160 && /(new chat|log in|sign up)/.test(t) && /(vibes|create|ctrl\+shift|shortcut|menu)/.test(t)) return true;
        if (/^new chat(\s+ctrl\+shift\+[a-z0-9]+)?(\s+vibes)?(\s+create)?(\s+log in)?(\s+sign up)?$/i.test(t)) return true;
        // Home-screen recommendation cards like:
        // "Book recommendations for you Help me discover..."
        if (t.length <= 320 && /\bfor you\b/.test(t) && /\bhelp me\b/.test(t) && /(recommendations?|discover|plan|ideas)/.test(t)) return true;
        return false;
      };

      const isMetaSuggestedPromptCard = (text) => {
        const t = normalize(text).toLowerCase();
        if (!t) return false;
        if (t.length <= 320 && /\bfor you\b/.test(t) && /\bhelp me\b/.test(t)) return true;
        if (t.length <= 260 && /\bhelp me\b/.test(t) && /(book|weekend|getaway|plan|recommendations?|ideas)/.test(t)) return true;
        return false;
      };

      const isLikelyMetaUiContainer = (el) => {
        try {
          if (!el || !el.closest) return false;
          return !!el.closest(
            'header, nav, aside, [role="navigation"], [class*="sidebar"], [class*="menu"], [class*="nav"], [class*="prompt-card"], [class*="suggestion"], [class*="quick-prompt"], [data-testid*="sidebar"], [data-testid*="nav"], [data-testid*="suggestion"]'
          );
        } catch (_) {
          return false;
        }
      };

      let messages = [];
      // Primary: explicit Meta wrappers observed on meta.ai
      try {
        const userRows = Array.from(document.querySelectorAll('.group\\/user-message'));
        const assistantRows = Array.from(document.querySelectorAll('.group\\/assistant-message, [data-testid="assistant-message"]'));

        userRows.forEach((row) => {
          const body = row.querySelector('[class*="text-response"], .whitespace-pre-wrap, span, div') || row;
          const text = normalize(body && body.innerText);
          if (!text) return;
          if (isMetaUiChromeText(text)) return;
          if (isMetaSuggestedPromptCard(text)) return;
          messages.push({ role: 'user', text, el: row });
        });

        assistantRows.forEach((row) => {
          const body = row.querySelector('[class*="text-response"], .whitespace-pre-wrap, span, div') || row;
          const text = normalize(body && body.innerText);
          if (!text) return;
          if (isMetaUiChromeText(text)) return;
          messages.push({ role: 'assistant', text, el: row });
        });

        if (messages.length > 0) {
          messages.sort((a, b) => {
            try { return a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top; } catch (_) { return 0; }
          });
        }
      } catch (_) { }

      if (messages.length > 0) {
        const seen = new Set();
        return messages.filter((m) => {
          const key = `${m.role}|${m.text}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      // Fallback: broader extraction (kept for layout variants)
      try {
        const main = document.querySelector('[role="main"], main, article') || document.body;
        messages = extractMessagesFromContainer(main, [
          '[data-testid*="message"]',
          '[data-testid*="conversation"] [role="article"]',
          '[role="article"]',
          '[class*="conversation"] [class*="message"]',
          '[class*="thread"] [class*="message"]',
          '[class*="chat"] [class*="message"]',
          '[class*="bubble"]',
          '[class*="response"]'
        ]) || [];
      } catch (_) {
        messages = [];
      }

      // If generic extraction collapsed the thread into a single mega-block,
      // try a more targeted pass over main/article message-like rows.
      if (messages.length <= 1) {
        const main = document.querySelector('[role="main"], main, article') || document.body;
        try {
          const fallback = extractMessagesFromContainer(main, [
            '[data-testid*="message"]',
            '[role="article"]',
            'article',
            '[class*="message"]',
            '[class*="bubble"]',
            '[class*="response"]'
          ]);
          if (Array.isArray(fallback) && fallback.length > messages.length) {
            messages = fallback;
          }
        } catch (_) { }
      }

      messages = (messages || []).filter((m) => {
        const text = String(m && m.text || '').trim();
        if (!text || text.length < 2) return false;
        if (m && m.el && isLikelyMetaUiContainer(m.el)) return false;
        if (isMetaUiChromeText(text)) return false;
        return true;
      });

      return messages;
    },
    getInput: () => {
      const active = document.activeElement;
      if (active && (active.isContentEditable || /^(TEXTAREA|INPUT)$/i.test(active.tagName || ''))) {
        try {
          const hint = `${active.getAttribute('aria-label') || ''} ${active.getAttribute('placeholder') || ''}`.toLowerCase();
          if (!/search|find|filter|nav|menu/.test(hint) && (active.isContentEditable || /message|ask|prompt|chat/.test(hint))) {
            const cs = window.getComputedStyle(active);
            if (cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0' && active.offsetWidth > 0 && active.offsetHeight > 0) {
              return active;
            }
          }
        } catch (_) { }
      }

      const selectors = [
        'div[role="textbox"][contenteditable="true"][data-lexical-editor="true"]',
        'div[role="textbox"][contenteditable="true"]',
        'div[role="textbox"]',
        'div[contenteditable="true"][data-lexical-editor="true"]',
        'div[contenteditable="plaintext-only"]',
        'div[contenteditable="true"][aria-label*="Message" i]',
        'div[contenteditable="true"][aria-label*="Ask" i]',
        'textarea[placeholder*="Message" i]',
        'textarea[placeholder*="Ask" i]',
        'input[placeholder*="Message" i]',
        'input[placeholder*="Ask" i]',
        'textarea',
        '[contenteditable="true"]'
      ];
      const candidates = Array.from(document.querySelectorAll(selectors.join(',')));
      for (const el of candidates) {
        try {
          if (!el) continue;
          const cs = window.getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
          if (el.offsetWidth <= 0 || el.offsetHeight <= 0) continue;
          if (el.closest('header, nav, [role="navigation"], [class*="sidebar"], [class*="menu"]')) continue;
          const hint = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('placeholder') || ''}`.toLowerCase();
          if (/search|find|filter/.test(hint)) continue;
          if (el.tagName === 'INPUT' && !/message|ask|prompt|chat/.test(hint)) continue;
          // Prefer elements inside main chat surface, not shell UI.
          if (!el.closest('[role="main"], main, [class*="chat"], [class*="thread"], [class*="composer"]') && !/message|ask|prompt|chat/.test(hint)) continue;
          return el;
        } catch (_) { }
      }

      try {
        const hosts = Array.from(document.querySelectorAll('*')).slice(0, 500);
        for (const host of hosts) {
          const root = host && host.shadowRoot;
          if (!root) continue;
          const el = root.querySelector('div[role="textbox"], [contenteditable="true"], textarea, input[placeholder*="Message" i], input[placeholder*="Ask" i]');
          if (!el) continue;
          const cs = window.getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
          if (el.offsetWidth <= 0 || el.offsetHeight <= 0) continue;
          return el;
        }
      } catch (_) { }

      return null;
    }
  },
  // === NEW ADAPTERS ===
  {
    id: "huggingchat",
    label: "HuggingChat (huggingface.co/chat)",
    detect: () => location.hostname.includes("huggingface.co") && location.pathname.includes("/chat"),
    scrollContainer: () => document.querySelector('main') || document.scrollingElement,
    getMessages: () => {
      const messages = [];
      // HuggingChat uses specific message containers
      const containers = document.querySelectorAll('[class*="message"], .group\\/message, [data-message]');
      containers.forEach(c => {
        const text = (c.innerText || '').trim();
        if (text && text.length > 2) {
          const cls = (c.className || '').toLowerCase();
          const role = cls.includes('user') || cls.includes('human') ? 'user' : 'assistant';
          if (!messages.some(m => m.text === text)) {
            messages.push({ role, text, el: c });
          }
        }
      });
      return messages;
    },
    getInput: () => document.querySelector('textarea, [contenteditable="true"]')
  },
  {
    id: "phind",
    label: "Phind (phind.com)",
    detect: () => location.hostname.includes("phind.com"),
    scrollContainer: () => document.querySelector('main') || document.scrollingElement,
    getMessages: () => {
      const messages = [];
      // Phind shows code-focused responses
      const userQueries = document.querySelectorAll('[class*="UserMessage"], [class*="user-message"], .prose.user');
      userQueries.forEach(q => {
        const text = (q.innerText || '').trim();
        if (text && text.length > 2) messages.push({ role: 'user', text, el: q });
      });

      const aiResponses = document.querySelectorAll('[class*="AIMessage"], [class*="assistant-message"], .prose:not(.user), .markdown');
      aiResponses.forEach(a => {
        const text = (a.innerText || '').trim();
        if (text && text.length > 5 && !messages.some(m => m.text === text)) {
          messages.push({ role: 'assistant', text, el: a });
        }
      });

      messages.sort((a, b) => {
        try { return a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top; } catch (e) { return 0; }
      });
      return messages;
    },
    getInput: () => document.querySelector('textarea, input[type="text"]')
  },
  {
    id: "characterai",
    label: "Character.AI",
    detect: () => location.hostname.includes("character.ai"),
    scrollContainer: () => document.querySelector('[class*="chat"]') || document.scrollingElement,
    getMessages: () => {
      const messages = [];
      // Character.AI has a unique chat bubble structure
      const bubbles = document.querySelectorAll('[class*="msg"], [class*="message"], [class*="chat-msg"]');
      bubbles.forEach(b => {
        const text = (b.innerText || '').trim();
        if (text && text.length > 1) {
          const cls = (b.className || '').toLowerCase();
          const isUser = cls.includes('human') || cls.includes('user') || cls.includes('self');
          if (!messages.some(m => m.text === text)) {
            messages.push({ role: isUser ? 'user' : 'assistant', text, el: b });
          }
        }
      });
      return messages;
    },
    getInput: () => document.querySelector('textarea, [contenteditable="true"]')
  },
  {
    id: "youchat",
    label: "YouChat (you.com)",
    detect: () => location.hostname.includes("you.com"),
    scrollContainer: () => document.scrollingElement,
    getMessages: () => {
      const messages = [];
      // You.com combines search with chat
      const userParts = document.querySelectorAll('[class*="query"], [class*="user-input"], .searchbox-input');
      userParts.forEach(u => {
        const text = (u.innerText || u.value || '').trim();
        if (text && text.length > 1) messages.push({ role: 'user', text, el: u });
      });

      const aiParts = document.querySelectorAll('[class*="answer"], [class*="response"], .markdown, .prose');
      aiParts.forEach(a => {
        const text = (a.innerText || '').trim();
        if (text && text.length > 10 && !messages.some(m => m.text === text)) {
          messages.push({ role: 'assistant', text, el: a });
        }
      });
      return messages;
    },
    getInput: () => document.querySelector('textarea, input[type="text"], [contenteditable="true"]')
  },
  {
    id: "replika",
    label: "Replika",
    detect: () => location.hostname.includes("replika.ai") || location.hostname.includes("replika.com"),
    scrollContainer: () => document.scrollingElement,
    getMessages: () => {
      const msgs = document.querySelectorAll('[class*="message"], [class*="chat-bubble"]');
      return Array.from(msgs).map(m => {
        const cls = (m.className || '').toLowerCase();
        return { role: cls.includes('user') || cls.includes('self') ? 'user' : 'assistant', text: (m.innerText || '').trim() };
      }).filter(m => m.text.length > 1);
    },
    getInput: () => document.querySelector('textarea, input[type="text"]')
  },
  {
    id: "jasper",
    label: "Jasper Chat",
    detect: () => location.hostname.includes("jasper.ai"),
    scrollContainer: () => document.scrollingElement,
    getMessages: () => {
      const msgs = document.querySelectorAll('[class*="message"], .chat-message, .prose');
      return Array.from(msgs).map(m => {
        const cls = (m.className || '').toLowerCase();
        return { role: cls.includes('user') || cls.includes('human') ? 'user' : 'assistant', text: (m.innerText || '').trim() };
      }).filter(m => m.text.length > 2);
    },
    getInput: () => document.querySelector('textarea, [contenteditable="true"]')
  },
  {
    id: "writesonic",
    label: "Writesonic/Chatsonic",
    detect: () => location.hostname.includes("writesonic.com"),
    scrollContainer: () => document.scrollingElement,
    getMessages: () => {
      const msgs = document.querySelectorAll('[class*="message"], [class*="chat"], .prose');
      return Array.from(msgs).map(m => {
        const cls = (m.className || '').toLowerCase();
        return { role: cls.includes('user') || cls.includes('human') ? 'user' : 'assistant', text: (m.innerText || '').trim() };
      }).filter(m => m.text.length > 2);
    },
    getInput: () => document.querySelector('textarea, [contenteditable="true"]')
  },
  {
    id: "forefront",
    label: "Forefront AI",
    detect: () => location.hostname.includes("forefront.ai"),
    scrollContainer: () => document.querySelector('main') || document.scrollingElement,
    getMessages: () => {
      const msgs = document.querySelectorAll('[class*="message"], .chat-message, .prose');
      return Array.from(msgs).map(m => {
        const cls = (m.className || '').toLowerCase();
        return { role: cls.includes('user') || cls.includes('human') ? 'user' : 'assistant', text: (m.innerText || '').trim() };
      }).filter(m => m.text.length > 2);
    },
    getInput: () => document.querySelector('textarea, [contenteditable="true"]')
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
