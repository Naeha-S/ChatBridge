// popup.js - ChatBridge Premium Popup

(function () {
  'use strict';

  // Platform detection mapping
  const PLATFORM_NAMES = {
    'chat.openai.com': 'ChatGPT',
    'chatgpt.com': 'ChatGPT',
    'gemini.google.com': 'Gemini',
    'claude.ai': 'Claude',
    'chat.mistral.ai': 'Mistral',
    'deepseek.ai': 'DeepSeek',
    'chat.deepseek.com': 'DeepSeek',
    'perplexity.ai': 'Perplexity',
    'www.perplexity.ai': 'Perplexity',
    'poe.com': 'Poe',
    'x.ai': 'Grok',
    'copilot.microsoft.com': 'Copilot',
    'www.bing.com': 'Bing AI',
    'meta.ai': 'Meta AI',
    'huggingface.co': 'HuggingChat',
    'you.com': 'You.com',
    'phind.com': 'Phind',
    'character.ai': 'Character AI',
    'beta.character.ai': 'Character AI'
  };

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

      if (tab && tab.url) {
        const url = new URL(tab.url);
        const hostname = url.hostname.replace('www.', '');

        // Check if on a supported platform
        const platformName = PLATFORM_NAMES[hostname] || PLATFORM_NAMES['www.' + hostname];

        if (platformName) {
          statusDot.classList.add('active');
          statusText.textContent = `Ready on ${platformName}`;
          statusDetail.textContent = 'Click the floating button to open ChatBridge';
        } else {
          statusDot.classList.remove('active');
          statusText.textContent = 'Navigate to an AI chat';
          statusDetail.textContent = 'ChatGPT, Claude, Gemini, and more';
        }
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
      // Get conversations from storage
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(['chatbridge:conversations'], resolve);
      });

      const conversations = result['chatbridge:conversations'] || [];

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
      window.open(chrome.runtime.getURL('options.html') + '#viewer');
    });

    statMessages.addEventListener('click', () => {
      window.open(chrome.runtime.getURL('options.html') + '#viewer');
    });
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
