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

    async function restoreToChat(text, attachments) {
      try {
        restoreLog('Starting restoreToChat with text length:', text ? text.length : 0);
        if (!text || !text.trim()) {
          restoreLog('No text provided');
          toast('No text to insert');
          return false;
        }

        let cleanText = text.trim();
        cleanText = cleanText.replace(/^(Assistant|User|System|AI):\s*/i, '');
        restoreLog('Cleaned text (first 100 chars):', cleanText.slice(0, 100));

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
        if (!input) {
          restoreLog('Waiting for composer...');
          input = await waitForComposer(10000, 300);
        }

        if (!input) {
          restoreLog('ERROR: No input found');
          try { await navigator.clipboard.writeText(cleanText); toast('Copied to clipboard'); } catch (_) { }
          return false;
        }

        restoreLog('Found input:', input.tagName, input.isContentEditable ? 'contenteditable' : 'textarea');

        if (input.isContentEditable) {
          input.focus();
          input.textContent = '';
          input.appendChild(document.createTextNode(cleanText));
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          restoreLog('Inserted to contenteditable');
        } else {
          input.focus();
          input.value = cleanText;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          restoreLog('Inserted to textarea/input');
        }

        toast('Restored to chat');

        if (Array.isArray(attachments) && attachments.length > 0) {
          attachFilesToChat(attachments).catch((e) => restoreLog('Attachment error:', e));
        }

        return true;
      } catch (e) {
        restoreLog('ERROR in restoreToChat:', e);
        try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch (_) { }
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
