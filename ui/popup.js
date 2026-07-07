// popup.js - ChatBridge Premium Popup

(function () {
  if (typeof globalThis.browser === 'undefined' && typeof globalThis.chrome !== 'undefined') {
    try { globalThis.browser = globalThis.chrome; } catch (e) { }
  }
  'use strict';

  const platformRegistry = window.ChatBridgePlatformRegistry || null;

  // DOM Elements
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const statusDetail = document.getElementById('status-detail');
  const chatsCount = document.getElementById('chats-count');
  const messagesCount = document.getElementById('messages-count');
  const versionText = document.getElementById('version-text');
  const openDashboard = document.getElementById('open-dashboard');
  const openSettings = document.getElementById('open-settings');
  const statChats = document.getElementById('stat-chats');
  const statMessages = document.getElementById('stat-messages');

  // Initialize
  async function init() {
    // Load theme
    loadTheme();

    // Set version from manifest
    setVersion();

    // Check current tab status
    await checkCurrentTab();

    // Load stats
    await loadStats();

    // Setup event listeners
    setupListeners();
  }

  // Load saved theme
  function loadTheme() {
    try {
      chrome.storage.local.get(['cb_theme'], (result) => {
        const theme = result && result.cb_theme ? result.cb_theme : 'dark';
        document.body.classList.remove('cb-theme-light', 'cb-theme-synthwave', 'cb-theme-skeuomorphic', 'cb-theme-brutalism', 'cb-theme-glass');
        if (theme !== 'dark') {
          document.body.classList.add('cb-theme-' + theme);
        }
      });
    } catch (e) {
      console.warn('Theme load failed:', e);
    }
  }

  // Set version from manifest
  function setVersion() {
    try {
      const manifest = chrome.runtime.getManifest();
      if (manifest && manifest.version) {
        versionText.textContent = `v${manifest.version}`;
      }
    } catch (e) {
      versionText.textContent = 'v0.2.0';
    }
  }

  // Check current tab and update status
  async function checkCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      let isPlatform = false;
      let platformName = null;

      if (tab && tab.url) {
        const url = new URL(tab.url);
        platformName = platformRegistry ? platformRegistry.getPlatformName(url.hostname) : null;
        isPlatform = !!platformName;
      }

      // Check if API keys are missing
      const keys = await new Promise(r => {
        chrome.storage.local.get(['chatbridge_hf_key', 'chatbridge_gemini_key', 'chatbridge_openai_key', 'chatbridge_api_nvidia'], r);
      });
      const hasHf = !!keys.chatbridge_hf_key;
      const hasGemini = !!keys.chatbridge_gemini_key;
      const hasOpenai = !!keys.chatbridge_openai_key;
      const hasNvidia = !!keys.chatbridge_api_nvidia;

      if (!hasHf && !hasGemini && !hasOpenai && !hasNvidia) {
        statusDot.className = 'status-indicator';
        statusDot.style.background = '#f59e0b';
        statusDot.style.boxShadow = '0 0 0 4px rgba(245, 158, 11, 0.15)';
        statusText.textContent = 'API Keys Missing';
        statusText.style.color = '#f59e0b';
        statusDetail.textContent = 'Click to configure keys in Options';
        
        // Add click listener on status card to open options
        const statusCard = document.querySelector('.status-card');
        if (statusCard) {
          statusCard.style.cursor = 'pointer';
          statusCard.onclick = () => {
            chrome.runtime.openOptionsPage();
          };
        }
        return;
      } else {
        // Reset styles if keys are present
        statusText.style.color = '';
        statusDot.style.background = '';
        statusDot.style.boxShadow = '';
        const statusCard = document.querySelector('.status-card');
        if (statusCard) {
          statusCard.style.cursor = '';
          statusCard.onclick = null;
        }
      }

      if (isPlatform) {
        statusDot.classList.add('active');
        statusText.textContent = `Ready on ${platformName}`;
        statusDetail.textContent = 'Click the floating button to open ChatBridge';
      } else {
        statusDot.classList.remove('active');
        statusText.textContent = 'Navigate to an AI chat';
        statusDetail.textContent = 'ChatGPT, Claude, Gemini, and more';
      }
    } catch (e) {
      console.warn('Tab check failed:', e);
      statusDot.classList.remove('active');
      statusText.textContent = 'Ready to connect';
      statusDetail.textContent = 'Open any supported AI chat';
    }
  }

  // Load conversation stats
  async function loadStats() {
    try {
      // Get conversations from storage/background
      const conversations = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ type: 'get_conversations' }, (res) => {
            if (chrome.runtime.lastError) {
              fallback();
              return;
            }
            if (res && res.ok && Array.isArray(res.conversations)) {
              resolve(res.conversations);
            } else {
              fallback();
            }
          });
        } catch (e) {
          fallback();
        }

        function fallback() {
          chrome.storage.local.get(['chatbridge:conversations'], (result) => {
            resolve(result['chatbridge:conversations'] || []);
          });
        }
      });

      // Count conversations
      chatsCount.textContent = formatNumber(conversations.length);

      // Count total messages across all conversations
      let totalMessages = 0;
      conversations.forEach(conv => {
        if (conv.conversation && Array.isArray(conv.conversation)) {
          totalMessages += conv.conversation.length;
        }
      });
      messagesCount.textContent = formatNumber(totalMessages);

    } catch (e) {
      console.warn('Stats load failed:', e);
      chatsCount.textContent = '0';
      messagesCount.textContent = '0';
    }
  }

  // Format large numbers (e.g., 1200 → 1.2k)
  function formatNumber(num) {
    if (num >= 1000) {
      return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    }
    return num.toString();
  }

  // Setup event listeners
  function setupListeners() {
    // Open Dashboard button
    openDashboard.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Settings button
    openSettings.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Stat cards - open options with focus on relevant section
    statChats.addEventListener('click', () => {
      window.open(chrome.runtime.getURL('ui/options.html') + '#viewer');
    });

    statMessages.addEventListener('click', () => {
      window.open(chrome.runtime.getURL('ui/options.html') + '#viewer');
    });
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
