(function () {
  'use strict';

  function createFeature(deps) {
    const {
      debugLog,
      scanState,
      SCAN_DEBOUNCE_MS,
      SKIP_SCROLL_ON_SCAN,
      scrollContainerToTop,
      waitForDomStability,
      normalizeMessages,
      extractAttachmentsFromElement,
      filterCandidateNodes,
      highlightNodesByElements,
      extractTextWithFormatting,
      inferRoleFromNode,
      getDebugFlags
    } = deps;

    function mergeMessageSequences(olderMsgs, newerMsgs) {
      if (!olderMsgs || !olderMsgs.length) return newerMsgs || [];
      if (!newerMsgs || !newerMsgs.length) return olderMsgs || [];
      
      const m = olderMsgs.length;
      const n = newerMsgs.length;
      
      // Compute DP table for LCS (Longest Common Subsequence)
      const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
      
      const match = (msg1, msg2) => {
        if (!msg1 || !msg2) return false;
        if (msg1.role !== msg2.role) return false;
        const t1 = (msg1.text || '').trim();
        const t2 = (msg2.text || '').trim();
        return t1 === t2;
      };
      
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          if (match(olderMsgs[i - 1], newerMsgs[j - 1])) {
            dp[i][j] = dp[i - 1][j - 1] + 1;
          } else {
            dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
          }
        }
      }
      
      // Backtrack to build the merged list preserving order and deduplicating
      const merged = [];
      let i = m;
      let j = n;
      
      while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && match(olderMsgs[i - 1], newerMsgs[j - 1])) {
          // Overlapping/matching elements: keep the olderMsgs version (preserves whitespace/formatting preferences of the earlier scanned list)
          merged.unshift(olderMsgs[i - 1]);
          i--;
          j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
          // Unique to newerMsgs (newer part of conversation)
          merged.unshift(newerMsgs[j - 1]);
          j--;
        } else {
          // Unique to olderMsgs (older/further scrolled part of conversation)
          merged.unshift(olderMsgs[i - 1]);
          i--;
        }
      }
      
      return merged;
    }

    async function scanChat() {
      const now = Date.now();
      if (now - scanState.lastScanTimestamp < SCAN_DEBOUNCE_MS) {
        debugLog('[Scan] Debounced - too soon after last scan');
        return window.ChatBridge?._lastScanResult || [];
      }
      scanState.lastScanTimestamp = now;

      debugLog('[Scan] Starting scan...');
      try {
        debugLog('=== SCAN START ===');
        const pick = (typeof window.pickAdapter === 'function') ? window.pickAdapter : null;
        const adapter = pick ? pick() : null;
        debugLog('adapter detected:', adapter ? adapter.id : 'none');

        let container = null;
        try {
          const inputEl = (adapter && typeof adapter.getInput === 'function')
            ? adapter.getInput()
            : document.querySelector('textarea, [contenteditable="true"], input[type=text]');
          debugLog('input element found:', !!inputEl, inputEl ? inputEl.tagName : 'none');

          if (inputEl) {
            try {
              if (typeof window.findChatContainerNearby === 'function') {
                container = window.findChatContainerNearby(inputEl) || null;
                debugLog('container from findChatContainerNearby:', !!container);
              } else {
                let p = inputEl.parentElement;
                let found = null;
                let depth = 0;
                while (p && depth < 10 && !found) {
                  try {
                    const cnt = (p.querySelectorAll && p.querySelectorAll('p, .message, .chat-line, .message-text, .markdown, .prose, .result, .chat-bubble').length) || 0;
                    const rect = p.getBoundingClientRect();
                    if (cnt >= 2 && rect.width > 400) found = p;
                  } catch (e) {
                    debugLog('container climb error at depth', depth, e);
                  }
                  p = p.parentElement;
                  depth++;
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
            chosenContainer: container && (container.tagName + (container.id ? '#' + container.id : '') + (container.className ? '.' + (container.className || '').toString().split(' ').filter(Boolean).slice(0, 2).join('.') : '')),
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

        let scrollContainer = null;
        try {
          scrollContainer = (adapter && typeof adapter.scrollContainer === 'function')
            ? adapter.scrollContainer()
            : null;
          debugLog('scrollContainer from adapter:', !!scrollContainer);
        } catch (e) {
          debugLog('adapter.scrollContainer error:', e);
        }
        
        if (!scrollContainer) {
          scrollContainer = container || document.querySelector('main') || document.body;
        }

        const isWindow = scrollContainer === document.body || scrollContainer === document.documentElement || scrollContainer === document.scrollingElement;

        const getScrollTop = () => {
          if (isWindow) {
            return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
          }
          return scrollContainer ? scrollContainer.scrollTop : 0;
        };

        const setScrollTop = (val) => {
          if (isWindow) {
            window.scrollTo({ top: val, behavior: 'auto' });
          } else if (scrollContainer) {
            scrollContainer.scrollTop = val;
          }
        };

        const getClientHeight = () => {
          if (isWindow) {
            return window.innerHeight;
          }
          return scrollContainer ? scrollContainer.clientHeight : 800;
        };

        let raw = [];
        const domScanStart = performance.now();

        // Save original scroll position
        const originalScrollTop = getScrollTop();

        try {
          if (adapter && typeof adapter.getMessages === 'function') {
            raw = adapter.getMessages() || [];
            debugLog('Initial adapter.getMessages returned:', raw.length, 'messages');
          }
        } catch (e) {
          debugLog('Initial adapter.getMessages error:', e);
        }

        let overlay = null;
        let styleTag = null;

        const needsScroll = !SKIP_SCROLL_ON_SCAN && scrollContainer && originalScrollTop > 50 && raw.length > 4;
        if (needsScroll) {
          try {
            // Inject spinner keyframes if not already present
            if (!document.getElementById('cb-spin-style')) {
              styleTag = document.createElement('style');
              styleTag.id = 'cb-spin-style';
              styleTag.textContent = `
                @keyframes cb-spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `;
              document.head.appendChild(styleTag);
            }

            // Create and position overlay
            const rect = scrollContainer.getBoundingClientRect();
            overlay = document.createElement('div');
            overlay.id = 'cb-scan-overlay';
            overlay.style.cssText = `
              position: fixed;
              top: ${rect.top}px;
              left: ${rect.left}px;
              width: ${rect.width}px;
              height: ${rect.height}px;
              background: rgba(255, 255, 255, 0.15);
              backdrop-filter: blur(10px);
              -webkit-backdrop-filter: blur(10px);
              display: flex;
              align-items: center;
              justify-content: center;
              z-index: 999999;
              transition: opacity 0.2s ease;
              pointer-events: all;
            `;

            const isDarkMode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) || 
                               document.documentElement.classList.contains('dark') || 
                               document.body.classList.contains('dark');

            overlay.innerHTML = `
              <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                background: ${isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)'};
                color: ${isDarkMode ? '#f8fafc' : '#0f172a'};
                padding: 24px 32px;
                border-radius: 16px;
                box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);
                border: 1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'};
                font-family: system-ui, -apple-system, sans-serif;
              ">
                <div style="
                  width: 32px;
                  height: 32px;
                  border: 3px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
                  border-top: 3px solid #3b82f6;
                  border-radius: 50%;
                  animation: cb-spin 0.8s linear infinite;
                  margin-bottom: 12px;
                "></div>
                <div style="font-weight: 600; font-size: 14px;">Scanning Chat...</div>
                <div style="font-size: 11px; color: ${isDarkMode ? '#94a3b8' : '#64748b'}; margin-top: 4px;">Capturing conversation history</div>
              </div>
            `;

            document.body.appendChild(overlay);
          } catch (e) {
            console.warn('[ChatBridge] Could not create scan overlay:', e);
          }

          try {
            console.log('[ChatBridge Debug] Starting scroll-based message accumulation...');
            console.log('[ChatBridge Debug] scrollContainer:', scrollContainer.tagName, scrollContainer.className);
            console.log('[ChatBridge Debug] scrollContainer dimensions:', {
              scrollTop: scrollContainer.scrollTop,
              scrollHeight: scrollContainer.scrollHeight,
              clientHeight: scrollContainer.clientHeight
            });
            console.log('[ChatBridge Debug] isWindow:', isWindow);
            
            let cur = getScrollTop();
            console.log('[ChatBridge Debug] Initial getScrollTop():', cur);
            let steps = 0;
            const isChatGPT = !!(adapter && adapter.id === 'chatgpt');
            const maxSteps = isChatGPT ? 80 : 30;
            const stepFraction = isChatGPT ? 0.95 : 0.85;
            const maxStalledSteps = isChatGPT ? 4 : 1;
            let stalledSteps = 0;
            let lastMessageCount = raw.length;
            
            while (steps < maxSteps) {
              const targetScrollTop = Math.max(0, cur - Math.ceil(getClientHeight() * stepFraction));
              console.log(`[ChatBridge Debug] Step ${steps}: cur=${cur}, targetScrollTop=${targetScrollTop}`);
              setScrollTop(targetScrollTop);
              
              // Wait for scroll to register and DOM to stabilize
              await new Promise(r => setTimeout(r, 80));
              if (typeof waitForDomStability === 'function') {
                await waitForDomStability(scrollContainer, 100, 400);
              } else {
                await new Promise(r => setTimeout(r, 120));
              }
              
              let stepRaw = [];
              try {
                if (adapter && typeof adapter.getMessages === 'function') {
                  stepRaw = adapter.getMessages() || [];
                }
              } catch (e) {
                console.log('[ChatBridge Debug] Step scan error:', e);
              }
              
              if (stepRaw.length > 0) {
                raw = mergeMessageSequences(stepRaw, raw);
              }
              
              const nextCur = getScrollTop();
              
              // Determine if new messages were successfully loaded in this step
              const messageCountChanged = raw.length > lastMessageCount;
              console.log(`[ChatBridge Debug] Step ${steps} after scroll: nextCur=${nextCur}, raw.length=${raw.length}, messageCountChanged=${messageCountChanged}`);
              lastMessageCount = raw.length;
              stalledSteps = messageCountChanged ? 0 : stalledSteps + 1;
              
              // If we tried to scroll up but scroll position did not change AND we did not load any new messages,
              // we have likely reached the top or a virtualized loading boundary.
              if (nextCur === cur && !messageCountChanged && stalledSteps >= maxStalledSteps) {
                console.log(`[ChatBridge Debug] Step ${steps} BREAK: nextCur === cur (${nextCur} === ${cur}) and no new messages`);
                break;
              }
              
              // If we are at scroll position 0 and no new messages were loaded, we are at the top.
              if (nextCur === 0 && !messageCountChanged && stalledSteps >= maxStalledSteps) {
                console.log(`[ChatBridge Debug] Step ${steps} BREAK: nextCur === 0 and no new messages`);
                break;
              }
              
              cur = nextCur;
              steps++;
            }
            console.log(`[ChatBridge Debug] Scroll accumulation complete. Steps: ${steps}, Accumulated messages: ${raw.length}`);
          } catch (e) {
            console.log('[ChatBridge Debug] Scroll accumulation error:', e);
            try {
              if (window.ChatBridge && window.ChatBridge._lastScan) {
                window.ChatBridge._lastScan.errors.push('scroll_failed: ' + (e.message || String(e)));
              }
            } catch (_) { }
          } finally {
            // Restore original scroll position
            try {
              setScrollTop(originalScrollTop);
              debugLog('Restored original scroll position:', originalScrollTop);
            } catch (_) {}

            // Remove overlay with a fade out
            if (overlay) {
              try {
                overlay.style.opacity = '0';
                setTimeout(() => {
                  try { overlay.remove(); } catch (_) {}
                }, 200);
              } catch (_) {
                try { overlay.remove(); } catch (_) {}
              }
            }
            if (styleTag) {
              try { styleTag.remove(); } catch (_) {}
            }
          }
        } else {
          debugLog('scroll skipped (disabled or no container)');
        }

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

        if (!raw || !raw.length) {
          debugLog('falling back to manual node extraction');
          const selector = '.message, .chat-line, .message-text, .markdown, .prose, p, li, [class*="message"], [class*="bubble"], [class*="chat"]';
          let nodes = [];
          try {
            nodes = Array.from((container || document).querySelectorAll(selector));
            debugLog('querySelectorAll found:', nodes.length, 'nodes');
          } catch (e) {
            debugLog('querySelectorAll error, trying fallback selectors:', e);
            try {
              nodes = Array.from(document.querySelectorAll('p,li,[class*="message"],[class*="bubble"]'));
              debugLog('fallback querySelectorAll found:', nodes.length, 'nodes');
            } catch (fallbackError) {
              debugLog('fallback querySelectorAll error:', fallbackError);
              nodes = [];
            }
          }

          try {
            nodes = nodes.filter((node) => {
              if (!node || !node.innerText || !node.closest) return false;
              if (node.closest('[data-cb-ignore], #cb-host, #cb-avatar')) return false;
              const badAncestor = node.closest('nav, aside, header, footer, [role="navigation"], [class*="sidebar"], [class*="drawer"], [class*="nav"], [class*="menu"], [class*="history"], [class*="recent"]');
              if (badAncestor) return false;
              return true;
            });
            debugLog('after filtering ignored:', nodes.length, 'nodes');
            nodes = filterCandidateNodes(nodes);
            debugLog('after filterCandidateNodes:', nodes.length, 'nodes');
          } catch (e) {
            debugLog('node filtering error:', e);
          }

          try {
            if (window.ChatBridge && window.ChatBridge._lastScan) window.ChatBridge._lastScan.nodesConsidered = nodes.length;
          } catch (_) { }

          try {
            const flags = getDebugFlags();
            if (flags.CB_HIGHLIGHT_ENABLED || flags.DEBUG) highlightNodesByElements(nodes);
          } catch (e) {
            debugLog('highlight error:', e);
          }

          try {
            raw = nodes.map((node) => ({
              text: extractTextWithFormatting(node),
              role: inferRoleFromNode(node),
              el: node,
              attachments: extractAttachmentsFromElement(node)
            }));
            debugLog('mapped to', raw.length, 'raw messages');
          } catch (e) {
            debugLog('node mapping error:', e);
            raw = [];
          }
        }

        // Extract attachments for all collected messages if not already present
        if (Array.isArray(raw)) {
          for (const message of raw) {
            try {
              if (message && message.el && !message.attachments) {
                const attachments = extractAttachmentsFromElement(message.el);
                if (attachments && attachments.length) message.attachments = attachments;
              }
            } catch (_) { }
          }
        }

        const domScanDuration = performance.now() - domScanStart;
        try {
          chrome.runtime.sendMessage({ type: 'record_metric', name: 'dom_scan', duration: domScanDuration });
        } catch (_) {}

        debugLog('raw messages before normalization:', raw.length);
        try { if (window.ChatBridge && window.ChatBridge._lastScan) window.ChatBridge._lastScan.messageCount = (raw && raw.length) || 0; } catch (_) { }
        try { if (window.ChatBridge && typeof window.ChatBridge._renderLastScan === 'function') window.ChatBridge._renderLastScan(); } catch (_) { }

        const normalized = normalizeMessages(raw || []);
        debugLog('=== SCAN COMPLETE ===', normalized.length, 'messages');

        try {
          window.ChatBridge = window.ChatBridge || {};
          window.ChatBridge._lastScanResult = normalized;
        } catch (_) { }

        try {
          if (normalized.length > 0) {
            const textContent = normalized.map((message) => `${message.role}: ${message.text}`).join('\n\n');
            window.ChatBridge._lastScanData = window.ChatBridge._lastScanData || {};
            window.ChatBridge._lastScanData.messages = normalized;
            window.ChatBridge._lastScanData.text = textContent;
            window.ChatBridge._lastScanData.timestamp = Date.now();
            window.ChatBridge._lastScanData.platform = location.hostname;
            debugLog('[Scan] Updated _lastScanData with', normalized.length, 'messages');
          }
        } catch (e) {
          debugLog('[Scan] Failed to update _lastScanData:', e);
        }

        try {
          if (window.ChatBridge && window.ChatBridge._lastScan) {
            window.ChatBridge._lastScan.messages = normalized;
            const attachments = [];
            normalized.forEach((message) => {
              if (Array.isArray(message.attachments)) attachments.push(...message.attachments);
            });
            window.ChatBridge._lastScan.attachments = attachments;
          }
        } catch (_) { }

        try {
          if (typeof window.ChatBridge !== 'undefined' && typeof window.ChatBridge.extractContentFromMessages === 'function') {
            const extracted = window.ChatBridge.extractContentFromMessages(normalized);
            window.ChatBridge._lastScanData = window.ChatBridge._lastScanData || {};
            window.ChatBridge._lastScanData.extracted = extracted;
          }
        } catch (_) { }

        (async () => {
          try {
            debugLog('[ChatBridge] Background: Extracting images from scan results...');
            if (typeof window.ChatBridge !== 'undefined' && typeof window.ChatBridge.extractImagesFromMessages === 'function') {
              const images = await window.ChatBridge.extractImagesFromMessages(normalized);
              if (images && images.length > 0) {
                debugLog('[ChatBridge] Background: Saving', images.length, 'images to vault...');
                await window.ChatBridge.saveImagesToVault(images);
                window.ChatBridge._lastScanData = window.ChatBridge._lastScanData || {};
                window.ChatBridge._lastScanData.imageCount = images.length;
                try {
                  const countEl = document.getElementById('cb-image-count');
                  if (countEl) countEl.textContent = String(images.length);
                } catch (_) { }
                if (typeof window.ChatBridge.refreshImageVault === 'function') {
                  try { await window.ChatBridge.refreshImageVault(); } catch (_) { }
                }
                debugLog('[ChatBridge] Background: Image extraction complete:', images.length, 'images saved');
              } else {
                window.ChatBridge._lastScanData = window.ChatBridge._lastScanData || {};
                window.ChatBridge._lastScanData.imageCount = 0;
              }
            } else {
              const imageCount = normalized.reduce((count, message) => {
                if (Array.isArray(message.attachments)) {
                  count += message.attachments.filter((attachment) => attachment.type === 'image').length;
                }
                return count;
              }, 0);
              window.ChatBridge._lastScanData = window.ChatBridge._lastScanData || {};
              window.ChatBridge._lastScanData.imageCount = imageCount;
            }
          } catch (e) {
            debugLog('[ChatBridge] Background image extraction failed:', e);
          }
        })();

        debugLog('[Scan] Returning', normalized.length, 'messages');
        try {
          if (window.ChatBridge && window.ChatBridge._lastScan && window.ChatBridge._lastScan.errors && window.ChatBridge._lastScan.errors.length) {
            debugLog('Scan completed with errors:', window.ChatBridge._lastScan.errors);
          }
        } catch (_) { }

        const resultObj = Object.assign([...normalized], {
          conversation: normalized,
          messages: normalized,
          platform: (adapter && adapter.name) || (document.title || 'Chat'),
          ts: Date.now(),
          url: window.location.href
        });

        if (window.ChatBridge) window.ChatBridge._lastScanResult = resultObj;
        return resultObj;
      } catch (e) {
        debugLog('=== SCAN FAILED ===', e);
        console.error('[ChatBridge] Fatal scan error:', e);
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

    return { scanChat, mergeMessageSequences };
  }

  window.ChatBridgeContentScan = { createFeature };
})();
