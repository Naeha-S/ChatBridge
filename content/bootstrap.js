(function () {
  'use strict';

  const registry = (typeof window !== 'undefined' && window.ChatBridgePlatformRegistry) || null;

  function ensureSingleInjection() {
    if (typeof window !== 'undefined' && window.__CHATBRIDGE_INJECTED) {
      try { console.debug && console.debug('[ChatBridge] double-injection detected, skipping init'); } catch (_) { }
      return false;
    }
    return true;
  }

  function initGlobalState() {
    if (typeof window === 'undefined') return;
    window.__CHATBRIDGE_INJECTED = true;
    window.__CHATBRIDGE = window.__CHATBRIDGE || {};
    window.__CHATBRIDGE.MAX_MESSAGES = window.__CHATBRIDGE.MAX_MESSAGES || 200;
    window.ChatBridge = window.ChatBridge || {};
  }

  function shouldInjectOnCurrentSite() {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    return registry ? registry.isApprovedHost(hostname) : hostname === 'localhost';
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  function isSafeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch (_) {
      return false;
    }
  }

  async function loadContinueContext() {
    let continueData = null;

    try {
      if (chrome.storage && chrome.storage.local) {
        continueData = await new Promise((resolve) => {
          chrome.storage.local.get(['chatbridge:continue_context'], (data) => {
            resolve(data['chatbridge:continue_context'] || null);
          });
        });
      }
    } catch (_) { }

    if (!continueData) {
      try {
        const stored = localStorage.getItem('chatbridge:continue_context');
        if (stored) continueData = JSON.parse(stored);
      } catch (_) { }
    }

    return continueData;
  }

  function clearContinueContext() {
    try { localStorage.removeItem('chatbridge:continue_context'); } catch (_) { }
    try { chrome.storage.local.remove(['chatbridge:continue_context']); } catch (_) { }
  }

  function findContinueInsertInput() {
    const selectors = registry?.continueInsertSelectors || [];
    for (const selector of selectors) {
      const input = document.querySelector(selector);
      if (input) return input;
    }
    return null;
  }

  function insertContinueText(input, text) {
    if (input.isContentEditable || input.contentEditable === 'true') {
      input.focus();
      input.textContent = text;
      input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
      return;
    }

    input.focus();
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function showContinueNotification() {
    const notif = document.createElement('div');
    notif.style.cssText = 'position:fixed;top:20px;right:20px;background:linear-gradient(135deg,rgba(16,163,127,0.95),rgba(0,100,80,0.95));color:white;padding:12px 20px;border-radius:10px;font-size:13px;z-index:999999;box-shadow:0 4px 20px rgba(0,0,0,0.3);animation:slideIn 0.3s ease;';
    notif.innerHTML = '✨ <strong>ChatBridge</strong>: Conversation context inserted!';
    document.body.appendChild(notif);

    const style = document.createElement('style');
    style.textContent = '@keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }';
    document.head.appendChild(style);

    setTimeout(() => notif.remove(), 4000);
  }

  async function checkContinueWithAutoInsert() {
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const continueData = await loadContinueContext();
      if (!continueData || !continueData.text || !continueData.timestamp) return;

      const allowedHosts = registry?.getTargetHosts(continueData.target) || [];
      const currentHost = typeof window !== 'undefined' ? String(window.location.hostname || '').toLowerCase() : '';
      if (continueData.target && !allowedHosts.some((host) => currentHost === host || currentHost.endsWith(`.${host}`))) {
        console.log('[ChatBridge] Auto-insert skipped: current host does not match target', continueData.target);
        return;
      }

      if (Date.now() - continueData.timestamp > 5 * 60 * 1000) {
        clearContinueContext();
        return;
      }

      console.log('[ChatBridge] Found continue context, attempting auto-insert...');
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const input = findContinueInsertInput();
      if (!input) return;

      insertContinueText(input, continueData.text);
      clearContinueContext();
      console.log('[ChatBridge] Auto-inserted continue context!');
      showContinueNotification();
    } catch (e) {
      console.warn('[ChatBridge] Continue auto-insert error:', e);
    }
  }

  window.ChatBridgeContentBootstrap = {
    ensureSingleInjection,
    initGlobalState,
    shouldInjectOnCurrentSite,
    escapeHtml,
    isSafeUrl,
    checkContinueWithAutoInsert
  };
})();
