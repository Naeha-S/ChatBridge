// options.js - ChatBridge Premium Settings Page

(function () {
  'use strict';

  // Current language
  let currentLang = 'en';

  // ============================================
  // TRANSLATION SYSTEM
  // ============================================
  function applyTranslations(lang) {
    currentLang = lang;

    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (window.t) {
        el.textContent = window.t(key, lang);
      }
    });

    // Update page title based on current section
    const activeNav = document.querySelector('.nav-item.active');
    if (activeNav && pageTitle) {
      const section = activeNav.dataset.section;
      const titleKey = sectionTitleKeys[section];
      if (titleKey && window.t) {
        pageTitle.textContent = window.t(titleKey, lang);
      }
    }

    // Update specific elements
    updateSpecificTranslations(lang);
  }

  function updateSpecificTranslations(lang) {
    const t = window.t || ((k) => k);

    // Quick action buttons
    const quickHistory = document.getElementById('quick-history');
    const quickApi = document.getElementById('quick-api');
    const quickTheme = document.getElementById('quick-theme');
    if (quickHistory) quickHistory.textContent = t('viewHistory', lang);
    if (quickApi) quickApi.textContent = t('configureApis', lang);
    if (quickTheme) quickTheme.textContent = t('changeTheme', lang);

    // Dashboard labels
    const labels = {
      'dashboard-chats': t('savedChats', lang),
      'dashboard-messages': t('totalMessages', lang),
      'dashboard-platforms': t('platformsUsed', lang),
      'dashboard-api-status': t('apiStatus', lang)
    };

    // Update stat labels
    document.querySelectorAll('.stat-info .stat-label').forEach((el, i) => {
      const keys = ['savedChats', 'totalMessages', 'platformsUsed', 'apiStatus'];
      if (keys[i]) el.textContent = t(keys[i], lang);
    });

    // Theme pills
    document.querySelectorAll('.theme-pill .theme-name').forEach(el => {
      const pill = el.closest('.theme-pill');
      if (pill) {
        const theme = pill.dataset.theme;
        el.textContent = t(theme, lang);
      }
    });

    // Language settings
    const interfaceLangLabel = document.querySelector('.settings-label');
    const interfaceLangDesc = document.querySelector('.settings-desc');
    if (interfaceLangLabel) interfaceLangLabel.textContent = t('interfaceLanguage', lang);
    if (interfaceLangDesc) interfaceLangDesc.textContent = t('chooseLanguage', lang);

    // Buttons
    document.querySelectorAll('.btn-primary').forEach(btn => {
      if (btn.id === 'btn-save-hf' || btn.id === 'btn-save-gemini' || btn.id === 'btn-save-nvidia') {
        if (!btn.disabled) btn.textContent = t('save', lang);
      }
    });

    const clearBtn = document.getElementById('btn-clear');
    if (clearBtn) clearBtn.textContent = t('clearAll', lang);

    // Card titles
    const cardTitles = document.querySelectorAll('.card-title');
    const titleMappings = ['overview', 'quickActions', 'apiKeys', 'savedConversations', 'theme', 'language', 'aboutChatBridge'];
    cardTitles.forEach((title, i) => {
      if (titleMappings[i]) {
        const svg = title.querySelector('svg');
        const text = t(titleMappings[i], lang);
        if (svg) {
          title.innerHTML = '';
          title.appendChild(svg);
          title.appendChild(document.createTextNode(' ' + text));
        }
      }
    });
  }

  // Section title keys mapping
  const sectionTitleKeys = {
    'dashboard': 'dashboard',
    'api-keys': 'apiKeys',
    'history': 'history',
    'appearance': 'appearance',
    'about': 'about'
  };

  // ============================================
  // NAVIGATION
  // ============================================
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.section');
  const pageTitle = document.getElementById('page-title');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navigateToSection(item.dataset.section);
    });
  });

  function navigateToSection(sectionId) {
    navItems.forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
    if (navItem) navItem.classList.add('active');

    sections.forEach(s => s.classList.remove('active'));
    const section = document.getElementById(`section-${sectionId}`);
    if (section) section.classList.add('active');

    if (pageTitle && window.t) {
      const titleKey = sectionTitleKeys[sectionId];
      pageTitle.textContent = window.t(titleKey, currentLang);
    }
  }

  // Quick action buttons
  document.getElementById('quick-history')?.addEventListener('click', () => navigateToSection('history'));
  document.getElementById('quick-api')?.addEventListener('click', () => navigateToSection('api-keys'));
  document.getElementById('quick-theme')?.addEventListener('click', () => navigateToSection('appearance'));

  // ============================================
  // VERSION
  // ============================================
  try {
    const manifest = chrome.runtime.getManifest();
    if (manifest && manifest.version) {
      const versionText = document.getElementById('version-text');
      const aboutVersion = document.getElementById('about-version');
      if (versionText) versionText.textContent = `v${manifest.version}`;
      if (aboutVersion) aboutVersion.textContent = manifest.version;
    }
  } catch (e) { }

  // ============================================
  // STORAGE KEYS
  // ============================================
  const STORAGE_KEYS = [
    'chatbridge:conversations',
    'chatbridge_conversations_v1',
    'chatbridge_conversations'
  ];

  async function getConversations() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEYS, (result) => {
        for (const key of STORAGE_KEYS) {
          if (result[key] && Array.isArray(result[key]) && result[key].length > 0) {
            resolve(result[key]);
            return;
          }
        }
        resolve([]);
      });
    });
  }

  // ============================================
  // DASHBOARD STATS
  // ============================================
  async function loadDashboardStats() {
    const conversations = await getConversations();

    const chatsEl = document.getElementById('dashboard-chats');
    if (chatsEl) chatsEl.textContent = conversations.length;

    let totalMessages = 0;
    const platforms = new Set();
    conversations.forEach(conv => {
      if (conv.conversation && Array.isArray(conv.conversation)) {
        totalMessages += conv.conversation.length;
      }
      if (conv.platform) {
        platforms.add(conv.platform.toLowerCase());
      }
    });

    const messagesEl = document.getElementById('dashboard-messages');
    if (messagesEl) messagesEl.textContent = totalMessages;

    const platformsEl = document.getElementById('dashboard-platforms');
    if (platformsEl) platformsEl.textContent = platforms.size;

    const apiStatusEl = document.getElementById('dashboard-api-status');
    if (apiStatusEl) {
      chrome.storage.local.get(['chatbridge_hf_key', 'chatbridge_gemini_key', 'chatbridge_api_nvidia'], (res) => {
        const hasHf = !!res.chatbridge_hf_key;
        const hasGemini = !!res.chatbridge_gemini_key;
        const hasNvidia = !!res.chatbridge_api_nvidia;
        const active = (hasHf ? 1 : 0) + (hasGemini ? 1 : 0) + (hasNvidia ? 1 : 0);

        if (active >= 1) {
          apiStatusEl.textContent = `${active} Active`;
          apiStatusEl.style.color = active >= 2 ? 'var(--success)' : 'var(--warning)';
        } else {
          apiStatusEl.textContent = 'None';
          apiStatusEl.style.color = 'var(--text-muted)';
        }
      });
    }
  }

  loadDashboardStats();

  // ============================================
  // API KEY MANAGEMENT
  // ============================================
  const hfApiKeyInput = document.getElementById('hfApiKey');
  const geminiApiKeyInput = document.getElementById('geminiApiKey');
  const nvidiaApiKeyInput = document.getElementById('nvidiaApiKey');
  const btnSaveHF = document.getElementById('btn-save-hf');
  const btnSaveGemini = document.getElementById('btn-save-gemini');
  const btnSaveNvidia = document.getElementById('btn-save-nvidia');
  const btnRebuildEmbeddings = document.getElementById('btn-rebuild-embeddings');
  const hfStatus = document.getElementById('hfStatus');
  const geminiStatus = document.getElementById('geminiStatus');
  const nvidiaStatus = document.getElementById('nvidiaStatus');
  const rebuildStatus = document.getElementById('rebuildStatus');
  const hfToggle = document.getElementById('hf-toggle');
  const geminiToggle = document.getElementById('gemini-toggle');
  const nvidiaToggle = document.getElementById('nvidia-toggle');

  chrome.storage.local.get(['chatbridge_hf_key', 'chatbridge_gemini_key'], async (res) => {
    if (res.chatbridge_hf_key) {
      hfApiKeyInput.value = res.chatbridge_hf_key;
      updateApiStatus(hfStatus, window.t ? window.t('connected', currentLang) : 'Connected', 'success');
    }
    if (res.chatbridge_gemini_key) {
      geminiApiKeyInput.value = res.chatbridge_gemini_key;
      updateApiStatus(geminiStatus, window.t ? window.t('connected', currentLang) : 'Connected', 'success');
    }

    try {
      if (window.ChatBridgeSecurity && typeof window.ChatBridgeSecurity.getApiKey === 'function') {
        const nvidiaKey = await window.ChatBridgeSecurity.getApiKey('nvidia');
        if (nvidiaKey) {
          nvidiaApiKeyInput.value = nvidiaKey;
          updateApiStatus(nvidiaStatus, window.t ? window.t('connected', currentLang) : 'Connected', 'success');
        }
      }
    } catch (e) {
      console.warn('[ChatBridge Options] Failed to load encrypted NVIDIA key:', e);
    }
  });

  hfToggle?.addEventListener('click', () => {
    hfApiKeyInput.type = hfApiKeyInput.type === 'password' ? 'text' : 'password';
  });

  geminiToggle?.addEventListener('click', () => {
    geminiApiKeyInput.type = geminiApiKeyInput.type === 'password' ? 'text' : 'password';
  });

  nvidiaToggle?.addEventListener('click', () => {
    nvidiaApiKeyInput.type = nvidiaApiKeyInput.type === 'password' ? 'text' : 'password';
  });

  btnSaveHF?.addEventListener('click', async () => {
    const v = (hfApiKeyInput.value || '').trim();
    const t = window.t || ((k) => k);

    if (!v) {
      if (!confirm('Remove stored HuggingFace API key?')) return;
      chrome.storage.local.remove(['chatbridge_hf_key'], () => {
        hfApiKeyInput.value = '';
        updateApiStatus(hfStatus, t('notSet', currentLang), '');
        showToast(t('keyRemoved', currentLang), 'success');
        loadDashboardStats();
      });
      return;
    }

    btnSaveHF.textContent = t('saving', currentLang);
    btnSaveHF.disabled = true;
    updateApiStatus(hfStatus, t('connecting', currentLang), 'pending');

    chrome.runtime.sendMessage({ type: 'test_huggingface_api', apiKey: v }, (response) => {
      btnSaveHF.textContent = t('save', currentLang);
      btnSaveHF.disabled = false;

      if (response && response.ok) {
        chrome.storage.local.set({ chatbridge_hf_key: v }, () => {
          updateApiStatus(hfStatus, t('connected', currentLang), 'success');
          showToast(t('keySaved', currentLang), 'success');
          loadDashboardStats();
        });
      } else if (response && response.status === 503) {
        chrome.storage.local.set({ chatbridge_hf_key: v }, () => {
          updateApiStatus(hfStatus, t('modelLoading', currentLang), 'pending');
          showToast(t('keySaved', currentLang), 'warning');
          loadDashboardStats();
        });
      } else {
        updateApiStatus(hfStatus, t('invalidKey', currentLang), 'error');
        showToast(t('invalidKey', currentLang), 'error');
      }
    });
  });

  btnSaveGemini?.addEventListener('click', async () => {
    const v = (geminiApiKeyInput.value || '').trim();
    const t = window.t || ((k) => k);

    if (!v) {
      if (!confirm('Remove stored Gemini API key?')) return;
      chrome.storage.local.remove(['chatbridge_gemini_key'], () => {
        geminiApiKeyInput.value = '';
        updateApiStatus(geminiStatus, t('notSet', currentLang), '');
        showToast(t('keyRemoved', currentLang), 'success');
        loadDashboardStats();
      });
      return;
    }

    btnSaveGemini.textContent = t('saving', currentLang);
    btnSaveGemini.disabled = true;
    updateApiStatus(geminiStatus, t('connecting', currentLang), 'pending');

    chrome.runtime.sendMessage({ type: 'test_gemini_api', apiKey: v }, (response) => {
      btnSaveGemini.textContent = t('save', currentLang);
      btnSaveGemini.disabled = false;

      if (response && response.ok) {
        chrome.storage.local.set({ chatbridge_gemini_key: v }, () => {
          updateApiStatus(geminiStatus, t('connected', currentLang), 'success');
          showToast(t('keySaved', currentLang), 'success');
          loadDashboardStats();
        });
      } else {
        updateApiStatus(geminiStatus, t('invalidKey', currentLang), 'error');
        showToast(t('invalidKey', currentLang), 'error');
      }
    });
  });

  btnSaveNvidia?.addEventListener('click', async () => {
    const v = (nvidiaApiKeyInput.value || '').trim();
    const t = window.t || ((k) => k);

    if (!v) {
      if (!confirm('Remove stored NVIDIA API key?')) return;
      chrome.storage.local.remove(['chatbridge_api_nvidia'], () => {
        nvidiaApiKeyInput.value = '';
        updateApiStatus(nvidiaStatus, t('notSet', currentLang), '');
        showToast(t('keyRemoved', currentLang), 'success');
        loadDashboardStats();
      });
      return;
    }

    btnSaveNvidia.textContent = t('saving', currentLang);
    btnSaveNvidia.disabled = true;
    updateApiStatus(nvidiaStatus, t('connecting', currentLang), 'pending');

    chrome.runtime.sendMessage({ type: 'test_nvidia_api', apiKey: v }, async (response) => {
      btnSaveNvidia.textContent = t('save', currentLang);
      btnSaveNvidia.disabled = false;

      if (response && response.ok) {
        try {
          if (!window.ChatBridgeSecurity || typeof window.ChatBridgeSecurity.saveApiKey !== 'function') {
            updateApiStatus(nvidiaStatus, t('invalidKey', currentLang), 'error');
            showToast('Security module unavailable', 'error');
            return;
          }

          const saved = await window.ChatBridgeSecurity.saveApiKey('nvidia', v);
          if (!saved) {
            updateApiStatus(nvidiaStatus, t('invalidKey', currentLang), 'error');
            showToast('Failed to save encrypted key', 'error');
            return;
          }

          updateApiStatus(nvidiaStatus, t('connected', currentLang), 'success');
          showToast(t('keySaved', currentLang), 'success');
          loadDashboardStats();
        } catch (e) {
          updateApiStatus(nvidiaStatus, t('invalidKey', currentLang), 'error');
          showToast('Failed to save key', 'error');
        }
      } else {
        updateApiStatus(nvidiaStatus, t('invalidKey', currentLang), 'error');
        showToast(t('invalidKey', currentLang), 'error');
      }
    });
  });

  btnRebuildEmbeddings?.addEventListener('click', async () => {
    const t = window.t || ((k) => k);
    btnRebuildEmbeddings.disabled = true;
    updateApiStatus(rebuildStatus, t('connecting', currentLang), 'pending');

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'vector_index_all', payload: { clearExisting: true } }, (response) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!response || !response.ok) return reject(new Error((response && response.error) || 'rebuild_failed'));
          return resolve(response);
        });
      });
      updateApiStatus(rebuildStatus, 'Done', 'success');
      showToast(`Embeddings rebuilt (${response.indexed || 0} indexed)`, 'success');
    } catch (e) {
      updateApiStatus(rebuildStatus, 'Failed', 'error');
      showToast('Embedding rebuild failed', 'error');
    } finally {
      btnRebuildEmbeddings.disabled = false;
    }
  });

  function updateApiStatus(element, text, type) {
    if (!element) return;
    const dot = element.querySelector('.status-dot');
    const span = element.querySelector('span:last-child');
    if (dot) dot.className = 'status-dot ' + type;
    if (span) span.textContent = text;
  }

  // ============================================
  // HISTORY MANAGEMENT
  // ============================================
  const historyList = document.getElementById('history-list');
  const historyStats = document.getElementById('history-stats');
  const btnClear = document.getElementById('btn-clear');

  async function loadHistory() {
    const arr = await getConversations();
    const t = window.t || ((k) => k);

    if (historyStats) {
      historyStats.textContent = `${arr.length} ${t('savedConversations', currentLang).toLowerCase()}`;
    }

    if (!historyList) return;

    if (!arr.length) {
      historyList.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <div>${t('noConversations', currentLang)}</div>
        </div>
      `;
      return;
    }

    const platformEmojis = {
      'ChatGPT': '🤖', 'chatgpt': '🤖',
      'Claude': '🧠', 'claude': '🧠',
      'Gemini': '✨', 'gemini': '✨',
      'Perplexity': '🔍', 'perplexity': '🔍',
      'Poe': '🐝', 'poe': '🐝',
      'Copilot': '🪟', 'copilot': '🪟',
      'DeepSeek': '🌊', 'deepseek': '🌊'
    };

    historyList.innerHTML = arr.map((conv, i) => {
      const platform = conv.platform || conv.host || 'Unknown';
      const emoji = platformEmojis[platform] || '💬';
      const msgCount = conv.conversation ? conv.conversation.length : 0;
      const date = new Date(conv.ts || conv.timestamp || Date.now());
      const timeAgo = getTimeAgo(date, currentLang);

      return `
        <div class="history-item" data-index="${i}">
          <div class="history-platform">${emoji}</div>
          <div class="history-info">
            <div class="history-title">${platform}</div>
            <div class="history-meta">${msgCount} ${t('messages', currentLang)} · ${timeAgo}</div>
          </div>
          <button class="history-delete" data-index="${i}" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;
    }).join('');

    historyList.querySelectorAll('.history-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        if (!confirm('Delete this conversation?')) return;

        const currentArr = await getConversations();
        currentArr.splice(idx, 1);

        const updates = {};
        STORAGE_KEYS.forEach(key => updates[key] = currentArr);
        chrome.storage.local.set(updates, () => {
          loadHistory();
          loadDashboardStats();
          showToast(t('conversationDeleted', currentLang), 'success');
        });
      });
    });
  }

  function getTimeAgo(date, lang = 'en') {
    const t = window.t || ((k) => k);
    const now = new Date();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return t('justNow', lang);
    if (mins < 60) return `${mins}${t('mAgo', lang)}`;
    if (hours < 24) return `${hours}${t('hAgo', lang)}`;
    if (days < 7) return `${days}${t('dAgo', lang)}`;
    return date.toLocaleDateString();
  }

  btnClear?.addEventListener('click', async () => {
    if (!confirm('Clear ALL saved conversations?\n\nThis cannot be undone.')) return;

    const updates = {};
    STORAGE_KEYS.forEach(key => updates[key] = []);
    chrome.storage.local.set(updates, () => {
      // Sync to background (IndexedDB clear)
      try { chrome.runtime.sendMessage({ type: 'clear_conversations' }); } catch (_) { }
      loadHistory();
      loadDashboardStats();
      showToast(window.t ? window.t('allCleared', currentLang) : 'All conversations cleared', 'success');
    });
  });

  loadHistory();

  // ============================================
  // THEME MANAGEMENT
  // ============================================
  const themePills = document.querySelectorAll('.theme-pill');

  chrome.storage.local.get(['cb_theme'], res => {
    const savedTheme = res.cb_theme || 'dark';
    themePills.forEach(pill => {
      if (pill.dataset.theme === savedTheme) {
        pill.classList.add('active');
        pill.querySelector('input').checked = true;
      } else {
        pill.classList.remove('active');
      }
    });
    applyPageTheme(savedTheme);
  });

  themePills.forEach(pill => {
    pill.addEventListener('click', () => {
      const theme = pill.dataset.theme;

      themePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      pill.querySelector('input').checked = true;

      applyPageTheme(theme);

      chrome.storage.local.set({ cb_theme: theme }, () => {
        const t = window.t || ((k) => k);
        showToast(`${t('themeChanged', currentLang)}: ${t(theme, currentLang)}`, 'success');

        chrome.tabs.query({}, tabs => {
          tabs.forEach(tab => {
            try { chrome.tabs.sendMessage(tab.id, { type: 'theme_changed', theme: theme }); } catch (e) { }
          });
        });
      });
    });
  });

  function applyPageTheme(theme) {
    document.body.classList.remove('theme-light', 'theme-synthwave', 'theme-skeuomorphic', 'theme-brutalism', 'theme-glass');
    if (theme !== 'dark') {
      document.body.classList.add('theme-' + theme);
    }
  }

  // ============================================
  // LANGUAGE MANAGEMENT
  // ============================================
  const languageSelect = document.getElementById('language-select');

  chrome.storage.local.get(['cb_language'], res => {
    const savedLang = res.cb_language || 'en';
    currentLang = savedLang;
    if (languageSelect) languageSelect.value = savedLang;

    // Apply translations on load
    setTimeout(() => applyTranslations(savedLang), 100);
  });

  languageSelect?.addEventListener('change', () => {
    const lang = languageSelect.value;
    currentLang = lang;

    // Apply translations immediately
    applyTranslations(lang);

    // Reload dynamic content with new language
    loadHistory();

    chrome.storage.local.set({ cb_language: lang }, () => {
      const t = window.t || ((k) => k);
      showToast(t('languageSaved', lang), 'success');
    });
  });

  // ============================================
  // TOAST NOTIFICATIONS
  // ============================================
  function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = document.createElement('span');
    icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';
    toast.appendChild(icon);
    toast.appendChild(document.createTextNode(' ' + message));
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ============================================
  // HASH NAVIGATION
  // ============================================
  if (window.location.hash) {
    const hash = window.location.hash.substring(1);
    const sectionMap = {
      'viewer': 'history',
      'history': 'history',
      'appearance': 'appearance',
      'about': 'about',
      'api': 'api-keys',
      'api-keys': 'api-keys'
    };
    const section = sectionMap[hash];
    if (section) {
      setTimeout(() => navigateToSection(section), 100);
    }
  }

})();
