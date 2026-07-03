(function () {
  'use strict';

  function createFeature(deps) {
    const {
      restoreLog,
      toast,
      findVisibleInputCandidate,
      waitForComposer,
      attachFilesToChat,
      pendingRestoreMessages,
      setRestoreToChatFunction
    } = deps;

    async function restoreToChat(text, attachments, options) {
      try {
        const opts = Object.assign({
          fallbackToClipboard: true,
          fallbackToast: 'Copied to clipboard',
          successToast: 'Restored to chat',
          waitTimeoutMs: 10000
        }, options || {});

        restoreLog('Starting restoreToChat with text length:', text ? text.length : 0);
        if (!text || !text.trim()) {
          restoreLog('No text provided');
          toast('No text to insert');
          return false;
        }

        let cleanText = text.trim();
        cleanText = cleanText.replace(/^(Assistant|User|System|AI):\s*/i, '');
        restoreLog('Cleaned text (first 100 chars):', cleanText.slice(0, 100));

        // Auto-summarize check for long content
        const wordCount = cleanText.split(/\s+/).filter(Boolean).length;
        if (cleanText.length >= 5000 || wordCount >= 1200) {
          restoreLog(`Text qualifies for auto-summarize (length: ${cleanText.length}, words: ${wordCount})`);
          toast('Summarizing large context...');
          try {
            const summaryResult = await new Promise((resolve) => {
              chrome.runtime.sendMessage({
                type: 'call_gemini',
                payload: {
                  action: 'summarize',
                  text: cleanText,
                  length: 'comprehensive',
                  summaryType: 'transfer'
                }
              }, (res) => {
                if (chrome.runtime.lastError) {
                  resolve({ ok: false, error: chrome.runtime.lastError.message });
                } else {
                  resolve(res || { ok: false });
                }
              });
            });

            if (summaryResult && summaryResult.ok && summaryResult.result) {
              restoreLog('Auto-summarization successful');
              cleanText = summaryResult.result + '\n\n---\n[SYSTEM: The user just restored this past conversation summary. Analyze the context above, but DO NOT summarize it or answer it yet. Acknowledge by simply saying "Context restored. Ready for your next prompt." and await instructions.]';
            } else {
              restoreLog('Auto-summarization failed, falling back to full text:', summaryResult ? summaryResult.error || summaryResult.message : 'empty');
              const errDetail = summaryResult && (summaryResult.message || summaryResult.error);
              const warnMsg = errDetail ? `Auto-summarize failed (${errDetail}).` : 'Summarization failed.';
              toast(`⚠️ ${warnMsg} Transferring full text...`);
            }
          } catch (sumErr) {
            restoreLog('Auto-summarization exception:', sumErr);
            const errDetail = sumErr && (sumErr.message || sumErr);
            toast(`⚠️ Summarization error (${errDetail}). Transferring full text...`);
          }
        }

        let input = null;
        try {
          const pick = (typeof window.pickAdapter === 'function') ? window.pickAdapter : null;
          const adapter = pick ? pick() : null;
          if (adapter && typeof adapter.getInput === 'function') {
            input = adapter.getInput();
            if (input) restoreLog('Found input via adapter:', input.tagName);
          }
        } catch (e) {
          restoreLog('Adapter.getInput() error:', e);
        }

        if (!input) input = findVisibleInputCandidate();
        if (input && /(^|\.)meta\.ai$/i.test(location.hostname || '') && input.tagName === 'INPUT') {
          restoreLog('Ignoring adapter INPUT on meta.ai (likely non-composer)');
          input = null;
        }

        if (!input) {
          restoreLog('Waiting for composer...');
          input = await waitForComposer(opts.waitTimeoutMs, 250);
        }

        // Meta AI safeguard: avoid writing into shell/search inputs.
        if (input && /(^|\.)meta\.ai$/i.test(location.hostname || '') && input.tagName === 'INPUT') {
          restoreLog('Ignoring INPUT candidate on meta.ai (likely non-composer)');
          input = await waitForComposer(4000, 250);
        }

        if (!input && /(^|\.)meta\.ai$/i.test(location.hostname || '')) {
          restoreLog('Meta fallback: nudging composer mount and retrying');
          try {
            const nudges = Array.from(document.querySelectorAll(
              'main, [role="main"], button[aria-label*="Message" i], button[aria-label*="Ask" i], [class*="composer" i], [data-testid*="composer" i]'
            )).slice(0, 8);
            for (const node of nudges) {
              try { node.click(); } catch (_) { }
            }
            const ae = document.activeElement;
            if (ae && (ae.isContentEditable || /^(TEXTAREA|INPUT)$/i.test(ae.tagName || ''))) {
              input = ae;
            }
          } catch (_) { }
          if (!input) {
            await new Promise((resolve) => setTimeout(resolve, 350));
            input = await waitForComposer(5000, 200);
          }
        }

        if (!input) {
          restoreLog('ERROR: No input found');
          if (opts.fallbackToClipboard) {
            try {
              await navigator.clipboard.writeText(cleanText);
              if (opts.fallbackToast) toast(opts.fallbackToast);
            } catch (_) { }
          }
          return false;
        }

        // Check if the input already contains this text to prevent duplicate insertion
        const existingText = (input.isContentEditable || input.contentEditable === 'true') ? input.textContent : input.value;
        const existingTextNorm = (existingText || '').trim().replace(/\s+/g, ' ');
        const cleanTextNorm = cleanText.trim().replace(/\s+/g, ' ');
        if (existingTextNorm) {
          if (existingTextNorm === cleanTextNorm) {
            restoreLog('Input already contains exact text, skipping duplicate insert');
            if (opts.successToast) toast(opts.successToast);
            return true;
          }
          if (cleanTextNorm.length > 100 && existingTextNorm.length > 100) {
            const prefix1 = cleanTextNorm.substring(0, 100);
            const prefix2 = existingTextNorm.substring(0, 100);
            if (prefix1 === prefix2) {
              restoreLog('Input already contains matching prefix text, skipping duplicate insert');
              if (opts.successToast) toast(opts.successToast);
              return true;
            }
          }
        }

        input.focus();
        let success = false;
        try {
          if (input.isContentEditable || input.contentEditable === 'true') {
            const selection = window.getSelection();
            selection.selectAllChildren(input);
            document.execCommand('delete', false, null);
            success = document.execCommand('insertText', false, cleanText);
          } else {
            input.select();
            success = document.execCommand('insertText', false, cleanText);
          }
        } catch (execErr) {
          restoreLog('execCommand failed, using fallback', execErr);
        }

        if (!success) {
          if (input.isContentEditable || input.contentEditable === 'true') {
            input.textContent = '';
            input.appendChild(document.createTextNode(cleanText));
          } else {
            input.value = cleanText;
          }
        }

        // Dispatch events to trigger editor listeners
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new InputEvent('input', { bubbles: true, data: cleanText }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        try {
          const textEvent = new TextEvent('textInput', { bubbles: true, cancelable: true, data: cleanText });
          input.dispatchEvent(textEvent);
        } catch (_) {}

        restoreLog('Inserted text successfully');

        if (opts.successToast) toast(opts.successToast);

        if (Array.isArray(attachments) && attachments.length > 0) {
          attachFilesToChat(attachments).catch((e) => restoreLog('Attachment error:', e));
        }

        return true;
      } catch (e) {
        restoreLog('ERROR in restoreToChat:', e);
        try {
          const opts = Object.assign({ fallbackToClipboard: true, fallbackToast: 'Copied to clipboard' }, options || {});
          if (opts.fallbackToClipboard) {
            await navigator.clipboard.writeText(text);
            if (opts.fallbackToast) toast(opts.fallbackToast);
          }
        } catch (_) { }
        return false;
      }
    }

    function startDriftMonitoring(sourceText) {
      const drift = window.ChatBridgeDrift;
      if (!drift || !drift.detector || !drift.profileManager) {
        console.log('[ChatBridge] Drift detection not available (drift_profiles.js not loaded)');
        return;
      }

      let targetPlatform = 'unknown';
      try {
        const pick = (typeof window.pickAdapter === 'function') ? window.pickAdapter : null;
        const adapter = pick ? pick() : null;
        if (adapter && adapter.id) targetPlatform = adapter.id;
        else if (adapter && adapter.label) targetPlatform = adapter.label;
      } catch (_) { }

      console.log('[ChatBridge] Drift monitoring started for platform:', targetPlatform);

      let baselineMessageCount = 0;
      try {
        const pick = (typeof window.pickAdapter === 'function') ? window.pickAdapter : null;
        const adapter = pick ? pick() : null;
        if (adapter && typeof adapter.getMessages === 'function') {
          const msgs = adapter.getMessages();
          baselineMessageCount = Array.isArray(msgs) ? msgs.length : 0;
        }
      } catch (_) { }

      let pollCount = 0;
      const maxPolls = 30;
      const pollInterval = 2000;

      const pollTimer = setInterval(async () => {
        pollCount++;
        if (pollCount > maxPolls) {
          clearInterval(pollTimer);
          console.log('[ChatBridge] Drift monitoring: timeout waiting for response');
          return;
        }

        try {
          const pick = (typeof window.pickAdapter === 'function') ? window.pickAdapter : null;
          const adapter = pick ? pick() : null;
          if (!adapter || typeof adapter.getMessages !== 'function') return;

          const currentMsgs = adapter.getMessages();
          if (!Array.isArray(currentMsgs)) return;

          const newMsgs = currentMsgs.slice(baselineMessageCount);
          const firstAssistantResponse = newMsgs.find((message) => message.role === 'assistant' && message.text && message.text.length > 30);
          if (!firstAssistantResponse) return;

          clearInterval(pollTimer);
          console.log('[ChatBridge] Drift monitoring: first response detected, length:', firstAssistantResponse.text.length);
          await runDriftDetectionLoop(sourceText, firstAssistantResponse.text, targetPlatform, adapter);
        } catch (e) {
          console.warn('[ChatBridge] Drift poll error:', e);
        }
      }, pollInterval);
    }

    async function runDriftDetectionLoop(sourceText, targetResponse, targetPlatform, adapter) {
      const drift = window.ChatBridgeDrift;
      if (!drift) return;

      const { detector, profileManager, ui, REPAIR_IMPROVEMENT_THRESHOLD: repairThreshold } = drift;

      try {
        console.log('[ChatBridge] Computing drift score...');
        const driftResult = await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            type: 'measure_drift',
            payload: {
              sourceContext: sourceText.slice(-3000),
              targetResponse: targetResponse.slice(0, 1500)
            }
          }, (res) => {
            if (chrome.runtime.lastError) resolve({ ok: false });
            else resolve(res || { ok: false });
          });
        });

        if (!driftResult.ok) {
          console.warn('[ChatBridge] Drift measurement failed:', driftResult.error);
          return;
        }

        const initialScore = driftResult.driftScore;
        console.log('[ChatBridge] Initial drift score:', initialScore.toFixed(4));
        const assessment = detector.assessDrift(initialScore, targetPlatform);
        console.log('[ChatBridge] Drift assessment:', assessment);
        profileManager.recordDriftScore(targetPlatform, initialScore, assessment.driftDetected);

        if (!assessment.driftDetected) {
          console.log('[ChatBridge] No significant drift detected (score:', initialScore.toFixed(4), ')');
          profileManager.logDriftEvent({
            sourcePlatform: 'transfer_source',
            targetPlatform,
            driftScore: initialScore,
            driftDetected: false,
            repairAttempted: false,
            sourceContextLength: sourceText.length,
            targetResponseLength: targetResponse.length
          });
          await profileManager.save();
          return;
        }

        console.log('[ChatBridge] Drift detected! Severity:', assessment.severity, 'Score:', initialScore.toFixed(4));
        ui.showDriftNotification(initialScore, assessment.severity, true);

        const repairPrompt = await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            type: 'generate_repair_prompt',
            payload: {
              sourceContext: sourceText.slice(-3000),
              targetResponse: targetResponse.slice(0, 800),
              driftScore: initialScore,
              severity: assessment.severity
            }
          }, (res) => {
            if (chrome.runtime.lastError) resolve(null);
            else resolve(res && res.ok ? res.repairPrompt : null);
          });
        });

        if (!repairPrompt) {
          console.warn('[ChatBridge] Could not generate repair prompt');
          profileManager.logDriftEvent({
            sourcePlatform: 'transfer_source',
            targetPlatform,
            driftScore: initialScore,
            driftDetected: true,
            repairAttempted: false,
            sourceContextLength: sourceText.length,
            targetResponseLength: targetResponse.length
          });
          await profileManager.save();
          return;
        }

        console.log('[ChatBridge] Injecting repair prompt (', repairPrompt.length, 'chars)');
        const repairInjected = await restoreToChat(repairPrompt);
        if (!repairInjected) {
          console.warn('[ChatBridge] Failed to inject repair prompt');
          profileManager.logDriftEvent({
            sourcePlatform: 'transfer_source',
            targetPlatform,
            driftScore: initialScore,
            driftDetected: true,
            repairAttempted: true,
            sourceContextLength: sourceText.length,
            targetResponseLength: targetResponse.length
          });
          await profileManager.save();
          return;
        }

        console.log('[ChatBridge] Waiting for post-repair response...');
        const postRepairResponse = await waitForNextAssistantResponse(adapter, 45000);
        if (postRepairResponse) {
          const postResult = await new Promise((resolve) => {
            chrome.runtime.sendMessage({
              type: 'measure_drift',
              payload: {
                sourceContext: sourceText.slice(-3000),
                targetResponse: postRepairResponse.slice(0, 1500)
              }
            }, (res) => {
              if (chrome.runtime.lastError) resolve({ ok: false });
              else resolve(res || { ok: false });
            });
          });

          const postScore = postResult.ok ? postResult.driftScore : initialScore;
          const repairSuccess = (postScore - initialScore) >= repairThreshold;

          console.log('[ChatBridge] Post-repair drift score:', postScore.toFixed(4),
            'Improvement:', (postScore - initialScore).toFixed(4),
            'Success:', repairSuccess);

          profileManager.recordRepairResult(targetPlatform, initialScore, postScore);
          ui.showRepairResult(initialScore, postScore, repairSuccess);
          profileManager.logDriftEvent({
            sourcePlatform: 'transfer_source',
            targetPlatform,
            driftScore: initialScore,
            driftDetected: true,
            repairAttempted: true,
            postRepairScore: postScore,
            repairSuccess,
            sourceContextLength: sourceText.length,
            targetResponseLength: targetResponse.length
          });
        } else {
          profileManager.logDriftEvent({
            sourcePlatform: 'transfer_source',
            targetPlatform,
            driftScore: initialScore,
            driftDetected: true,
            repairAttempted: true,
            sourceContextLength: sourceText.length,
            targetResponseLength: targetResponse.length
          });
        }

        await profileManager.save();
      } catch (e) {
        console.error('[ChatBridge] Drift detection loop error:', e);
      }
    }

    async function waitForNextAssistantResponse(adapter, timeoutMs = 45000) {
      if (!adapter || typeof adapter.getMessages !== 'function') return null;

      let currentMsgs;
      try {
        currentMsgs = adapter.getMessages();
      } catch (_) {
        return null;
      }
      const baseCount = Array.isArray(currentMsgs) ? currentMsgs.length : 0;
      const pollMs = 2000;
      const startTime = Date.now();

      while (Date.now() - startTime < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
        try {
          const msgs = adapter.getMessages();
          if (!Array.isArray(msgs)) continue;
          const newMsgs = msgs.slice(baseCount);
          const assistantMsg = newMsgs.find((message) => message.role === 'assistant' && message.text && message.text.length > 30);
          if (assistantMsg) return assistantMsg.text;
        } catch (_) { }
      }

      return null;
    }

    function initialize() {
      setRestoreToChatFunction(restoreToChat);
      restoreLog('restoreToChat function is now ready, processing queued messages:', pendingRestoreMessages.length);

      if (pendingRestoreMessages.length > 0) {
        setTimeout(async () => {
          restoreLog('Processing', pendingRestoreMessages.length, 'queued restore messages');
          while (pendingRestoreMessages.length > 0) {
            const queued = pendingRestoreMessages.shift();
            try {
              restoreLog('Processing queued restore message, text length:', queued.text ? queued.text.length : 0);
              const result = await restoreToChat(queued.text, queued.attachments);
              if (queued.sendResponse) queued.sendResponse({ ok: result });
              if (result && queued.text && queued.text.length > 50) {
                try { startDriftMonitoring(queued.text); } catch (driftErr) { console.warn('[ChatBridge] Drift monitoring init error:', driftErr); }
              }
            } catch (e) {
              console.error('[ChatBridge] Error processing queued restore message:', e);
              if (queued.sendResponse) queued.sendResponse({ ok: false, error: e && e.message });
            }
          }
        }, 100);
      }
    }

    return { restoreToChat, initialize };
  }

  window.ChatBridgeContentRestore = { createFeature };
})();
