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

        if (!SKIP_SCROLL_ON_SCAN) {
          try {
            await scrollContainerToTop(container);
            debugLog('scroll complete');
          } catch (e) {
            debugLog('scroll error:', e);
            try {
              if (window.ChatBridge && window.ChatBridge._lastScan) {
                window.ChatBridge._lastScan.errors.push('scroll_failed: ' + (e.message || String(e)));
              }
            } catch (_) { }
          }
        } else {
          debugLog('scroll skipped for speed');
        }

        try {
          await waitForDomStability(container);
          debugLog('DOM stable');
        } catch (e) {
          debugLog('DOM stability wait error:', e);
          try {
            if (window.ChatBridge && window.ChatBridge._lastScan) {
              window.ChatBridge._lastScan.errors.push('stability_timeout: ' + (e.message || String(e)));
            }
          } catch (_) { }
        }

        let raw = [];
        try {
          if (adapter && typeof adapter.getMessages === 'function') {
            raw = adapter.getMessages() || [];
            debugLog('adapter.getMessages returned:', raw.length, 'messages');
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
          }
        } catch (e) {
          debugLog('adapter.getMessages error:', e);
          try {
            if (window.ChatBridge && window.ChatBridge._lastScan) {
              window.ChatBridge._lastScan.errors.push('adapter_failed: ' + (e.message || String(e)));
            }
          } catch (_) { }
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
          const selector = '.message, .chat-line, .message-text, .markdown, .prose, p, li, div';
          let nodes = [];
          try {
            nodes = Array.from((container || document).querySelectorAll(selector));
            debugLog('querySelectorAll found:', nodes.length, 'nodes');
          } catch (e) {
            debugLog('querySelectorAll error, trying fallback selectors:', e);
            try {
              nodes = Array.from(document.querySelectorAll('p,div,li'));
              debugLog('fallback querySelectorAll found:', nodes.length, 'nodes');
            } catch (fallbackError) {
              debugLog('fallback querySelectorAll error:', fallbackError);
              nodes = [];
            }
          }

          try {
            nodes = nodes.filter((node) => node && node.innerText && node.closest && !node.closest('[data-cb-ignore], #cb-host'));
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

    return { scanChat };
  }

  window.ChatBridgeContentScan = { createFeature };
})();
