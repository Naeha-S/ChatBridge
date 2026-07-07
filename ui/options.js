// options.js - ChatBridge Premium Settings Page

(function () {
  if (typeof globalThis.browser === 'undefined' && typeof globalThis.chrome !== 'undefined') {
    try { globalThis.browser = globalThis.chrome; } catch (e) { }
  }
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
      if (btn.id === 'btn-save-hf' || btn.id === 'btn-save-gemini' || btn.id === 'btn-save-nvidia' || btn.id === 'btn-save-openai' || btn.id === 'btn-save-claude') {
        if (!btn.disabled) btn.textContent = t('save', lang);
      }
    });

    const openPricing = document.getElementById('btn-open-pricing');
    if (openPricing) openPricing.textContent = t('upgrade', lang);
    const logoutBtn = document.getElementById('btn-options-logout');
    if (logoutBtn) logoutBtn.textContent = 'Sign Out';
    setText('billing-tier-label', 'subscriptionPlan');
    setText('billing-credits-label', 'aiCredits');
    setText('billing-byok-title', 'bringYourOwnKeys');
    setText('billing-byok-desc', 'savedPersonalKeys');

    ['gemini', 'openai', 'hf', 'claude', 'nvidia'].forEach((provider) => {
      const input = document.getElementById(`api-key-${provider}`);
      const toggle = document.getElementById(`btn-toggle-${provider}`);
      if (toggle && input) toggle.textContent = input.type === 'password' ? t('show', lang) : t('hide', lang);
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
  // Section title keys mapping
  const sectionTitleKeys = {
    'dashboard': 'dashboard',
    'analytics': 'analytics',
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

    if (sectionId === 'analytics') {
      if (typeof loadAndRenderAnalytics === 'function') {
        loadAndRenderAnalytics();
      }
    }
  }

  // Quick action buttons
  document.getElementById('quick-history')?.addEventListener('click', () => navigateToSection('history'));
  document.getElementById('quick-analytics')?.addEventListener('click', () => navigateToSection('analytics'));
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
        chrome.storage.local.get(STORAGE_KEYS, (result) => {
          for (const key of STORAGE_KEYS) {
            if (result[key] && Array.isArray(result[key]) && result[key].length > 0) {
              resolve(result[key]);
              return;
            }
          }
          resolve([]);
        });
      }
    });
  }

  // ============================================
  // DASHBOARD STATS
  // ============================================
  async function loadDashboardStats(providedArr = null) {
    const conversations = providedArr || await getConversations();

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
    const optionsApiWarning = document.getElementById('options-api-warning');
    if (apiStatusEl) {
      apiStatusEl.textContent = 'Cloud Gateway';
      apiStatusEl.style.color = 'var(--ok)';
    }
    if (optionsApiWarning) {
      optionsApiWarning.style.display = 'none';
    }

    // Fetch and display Performance Telemetry
    chrome.storage.local.get(['cb_telemetry'], (res) => {
      const telemetry = res.cb_telemetry || {};
      
      const computeStats = (name) => {
        const list = telemetry[name] || [];
        if (list.length === 0) return { avg: 0, p50: 0, p95: 0, p99: 0 };
        const vals = list.map(item => item.val).sort((a, b) => a - b);
        const sum = vals.reduce((a, b) => a + b, 0);
        const avg = sum / vals.length;
        
        const getPercentile = (percentile) => {
          const idx = Math.min(vals.length - 1, Math.floor(vals.length * (percentile / 100)));
          return vals[idx];
        };
        
        return {
          avg,
          p50: getPercentile(50),
          p95: getPercentile(95),
          p99: getPercentile(99)
        };
      };

      const domScan = computeStats('dom_scan');
      const uiRender = computeStats('ui_render');
      const apiLatency = computeStats('api_latency');

      const domScanEl = document.getElementById('perf-dom-scan');
      if (domScanEl) domScanEl.textContent = `${domScan.avg.toFixed(2)} ms`;

      const uiRenderEl = document.getElementById('perf-ui-render');
      if (uiRenderEl) uiRenderEl.textContent = `${uiRender.avg.toFixed(2)} ms`;

      const p50El = document.getElementById('perf-api-p50');
      if (p50El) p50El.textContent = `${apiLatency.p50.toFixed(2)} ms`;

      const p95El = document.getElementById('perf-api-p95');
      if (p95El) p95El.textContent = `${apiLatency.p95.toFixed(2)} ms`;

      const p99El = document.getElementById('perf-api-p99');
      if (p99El) p99El.textContent = `${apiLatency.p99.toFixed(2)} ms`;
    });
  }

  const DISABLED_SITES_KEY = 'chatbridge:disabled_sites';

  function loadDisabledSites() {
    const listEl = document.getElementById('disabled-sites-list');
    const emptyEl = document.getElementById('disabled-sites-empty');
    if (!listEl || !emptyEl) return;

    chrome.storage.local.get([DISABLED_SITES_KEY], (data) => {
      const sites = Array.isArray(data[DISABLED_SITES_KEY]) ? data[DISABLED_SITES_KEY] : [];
      listEl.innerHTML = '';

      if (!sites.length) {
        emptyEl.style.display = 'block';
        listEl.style.display = 'none';
        return;
      }

      emptyEl.style.display = 'none';
      listEl.style.display = 'grid';

      sites.forEach((site) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg-input);';

        const label = document.createElement('div');
        label.style.cssText = 'font-size:13px;color:var(--text);font-weight:500;font-family:monospace;';
        label.textContent = site;

        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:11px;color:var(--text-2);margin-top:2px;';
        hint.textContent = 'Avatar and sidebar hidden';

        const copyWrap = document.createElement('div');
        copyWrap.appendChild(label);
        copyWrap.appendChild(hint);

        const btn = document.createElement('button');
        btn.className = 'btn btn-secondary';
        btn.type = 'button';
        btn.textContent = 'Re-enable';
        btn.style.cssText = 'flex-shrink:0;padding:8px 12px;font-size:12px;';
        btn.addEventListener('click', () => {
          const next = sites.filter((entry) => String(entry).toLowerCase() !== String(site).toLowerCase());
          chrome.storage.local.set({ [DISABLED_SITES_KEY]: next }, () => {
            showToast(`${site} re-enabled. Refresh that tab to see ChatBridge again.`, 'success');
            loadDisabledSites();
          });
        });

        row.appendChild(copyWrap);
        row.appendChild(btn);
        listEl.appendChild(row);
      });
    });
  }

  loadDashboardStats();
  loadDisabledSites();

  const BILLING_KEYS = {
    tier: 'chatbridge_subscription_tier',
    balance: 'chatbridge_credits_balance',
    lastReset: 'chatbridge_credits_last_reset',
    gemini: 'chatbridge_gemini_key',
    openai: 'chatbridge_openai_key',
    hf: 'chatbridge_hf_key',
    claude: 'chatbridge_api_claude',
    nvidia: 'chatbridge_api_nvidia',
    loggedIn: 'chatbridge_logged_in',
    userEmail: 'chatbridge_user_email'
  };
  const DEFAULT_FREE_CREDITS = 100;
  const TIER_CREDIT_LIMITS = {
    free: 100,
    pro: 2000,
    max: 10000
  };
  const PROVIDER_LABELS = {
    gemini: 'Gemini',
    openai: 'OpenAI',
    hf: 'Hugging Face',
    claude: 'Claude',
    nvidia: 'NVIDIA'
  };
  const PROVIDER_TEST_TYPES = {
    gemini: 'test_gemini_api',
    openai: 'test_openai_api',
    hf: 'test_huggingface_api',
    claude: 'test_claude_api',
    nvidia: 'test_nvidia_api'
  };
  const ENCRYPTED_PROVIDERS = new Set(['claude', 'nvidia']);

  function getLocal(keysOrObject) {
    return new Promise((resolve) => chrome.storage.local.get(keysOrObject, resolve));
  }

  function setLocal(items) {
    return new Promise((resolve) => chrome.storage.local.set(items, resolve));
  }

  function removeLocal(keys) {
    return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
  }

  function formatNextReset(lastReset) {
    const ts = Number(lastReset || 0) || Date.now();
    const date = new Date(ts);
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    return next.toLocaleDateString();
  }

  function shouldResetCredits(lastResetTs, nowTs = Date.now()) {
    const lastReset = Number(lastResetTs || 0);
    if (!lastReset) return true;
    const previous = new Date(lastReset);
    const current = new Date(nowTs);
    return previous.getUTCFullYear() !== current.getUTCFullYear() ||
      previous.getUTCMonth() !== current.getUTCMonth();
  }

  async function refreshBillingState(data) {
    const tier = String(data[BILLING_KEYS.tier] || 'free').toLowerCase();
    const limit = TIER_CREDIT_LIMITS[tier] || 100;
    let balance = data[BILLING_KEYS.balance] !== null && data[BILLING_KEYS.balance] !== undefined
      ? Math.max(0, Number(data[BILLING_KEYS.balance]))
      : limit;
    if (!Number.isFinite(balance)) balance = limit;
    let lastReset = Number(data[BILLING_KEYS.lastReset] || 0) || 0;

    if (shouldResetCredits(lastReset)) {
      balance = limit;
      lastReset = Date.now();
      await setLocal({
        [BILLING_KEYS.balance]: balance,
        [BILLING_KEYS.lastReset]: lastReset,
        [BILLING_KEYS.tier]: tier
      });
      data[BILLING_KEYS.balance] = balance;
      data[BILLING_KEYS.lastReset] = lastReset;
    }

    return data;
  }

  function tKey(key, lang = currentLang) {
    return window.t ? window.t(key, lang) : key;
  }

  function setText(id, key) {
    const el = document.getElementById(id);
    if (el) el.textContent = tKey(key);
  }

  async function loadBillingPanel() {
    const data = await getLocal({
      [BILLING_KEYS.tier]: 'free',
      [BILLING_KEYS.balance]: null,
      [BILLING_KEYS.lastReset]: Date.now(),
      [BILLING_KEYS.gemini]: '',
      [BILLING_KEYS.openai]: '',
      [BILLING_KEYS.hf]: '',
      [BILLING_KEYS.claude]: '',
      [BILLING_KEYS.loggedIn]: false,
      [BILLING_KEYS.userEmail]: '',
    });

    const tier = String(data[BILLING_KEYS.tier] || 'free').toLowerCase();
    const limit = TIER_CREDIT_LIMITS[tier] || 100;
    const balance = data[BILLING_KEYS.balance] !== null && data[BILLING_KEYS.balance] !== undefined
      ? Math.max(0, Number(data[BILLING_KEYS.balance]))
      : limit;
    const pct = Math.max(0, Math.min(100, Math.round((balance / limit) * 100)));

    setText('billing-tier-label', 'subscriptionPlan');
    setText('billing-credits-label', 'aiCredits');
    setText('billing-byok-title', 'bringYourOwnKeys');
    setText('billing-byok-desc', 'savedPersonalKeys');
    setText('btn-open-pricing', 'upgrade');

    const tierBadge = document.getElementById('billing-tier-badge');
    const tierDetail = document.getElementById('billing-tier-detail');
    const progressBar = document.getElementById('billing-progress-bar');
    const progressLabel = document.getElementById('billing-progress-label');
    const resetInfo = document.getElementById('billing-reset-info');
    const userEmailEl = document.getElementById('billing-user-email-text') || document.getElementById('billing-user-email');
    const logoutBtn = document.getElementById('btn-options-logout');
    const loginBtn = document.getElementById('btn-options-login');
    const devStatus = document.getElementById('dev-status');

    const isLoggedIn = !!data[BILLING_KEYS.loggedIn];
    const userEmail = data[BILLING_KEYS.userEmail] || '';

    if (userEmailEl) {
      userEmailEl.textContent = isLoggedIn ? `Logged in as: ${userEmail}` : 'Not logged in';
      userEmailEl.style.color = isLoggedIn ? 'var(--text)' : 'var(--text-muted)';
    }

    if (loginBtn) {
      loginBtn.style.display = isLoggedIn ? 'none' : 'inline-block';
    }

    if (logoutBtn) {
      logoutBtn.style.display = isLoggedIn ? 'inline-block' : 'none';
    }

    if (tierBadge) {
      tierBadge.textContent = tier === 'pro' ? tKey('proPlan') : tier === 'max' ? tKey('maxPlan') : tKey('freeTier');
      tierBadge.className = `badge${tier === 'free' ? '' : ' green'}`;
    }
    if (tierDetail) {
      tierDetail.textContent = tier === 'free' ? tKey('sharedProxyCopy') : tKey('paidBypassesCopy');
    }
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (progressLabel) progressLabel.textContent = `${balance} / ${limit} ${tKey('creditsRemaining')}`;
    if (!isLoggedIn) {
      if (progressBar) progressBar.style.width = '0%';
      if (progressLabel) progressLabel.textContent = tKey('loginToViewCredits');
      if (resetInfo) resetInfo.textContent = tKey('signInToSeeResetDate');
    } else {
      if (progressBar) progressBar.style.width = `${pct}%`;
      if (progressLabel) progressLabel.textContent = `${balance} / ${limit} ${tKey('creditsRemaining')}`;
      if (resetInfo) resetInfo.textContent = `${tKey('nextReset')}: ${formatNextReset(data[BILLING_KEYS.lastReset])}`;
    }
    if (devStatus) devStatus.textContent = tKey('useTheseControlsCopy');

    const keyMappings = [
      ['gemini', BILLING_KEYS.gemini],
      ['openai', BILLING_KEYS.openai],
      ['hf', BILLING_KEYS.hf],
      ['claude', BILLING_KEYS.claude],
    ];
    keyMappings.forEach(([provider, storageKey]) => {
      const status = document.getElementById(`status-${provider}`);
      if (status) status.textContent = data[storageKey] ? tKey('configured') : tKey('notConfigured');
    });

    try {
      const encryptedClaude = await ChatBridgeSecurity.getApiKey('claude');
      const encryptedNvidia = await ChatBridgeSecurity.getApiKey('nvidia');
      const claudeInput = document.getElementById('api-key-claude');
      const nvidiaInput = document.getElementById('api-key-nvidia');
      const claudeStatus = document.getElementById('status-claude');
      const nvidiaStatus = document.getElementById('status-nvidia');
      if (claudeInput && encryptedClaude) claudeInput.value = encryptedClaude;
      if (claudeStatus) claudeStatus.textContent = encryptedClaude ? tKey('configured') : tKey('notConfigured');
      if (nvidiaInput && encryptedNvidia) nvidiaInput.value = encryptedNvidia;
      if (nvidiaStatus) nvidiaStatus.textContent = encryptedNvidia ? tKey('configured') : tKey('notConfigured');
    } catch (_) {}

    const geminiInput = document.getElementById('api-key-gemini');
    const openaiInput = document.getElementById('api-key-openai');
    const hfInput = document.getElementById('api-key-hf');
    if (geminiInput) geminiInput.value = data[BILLING_KEYS.gemini] || '';
    if (openaiInput) openaiInput.value = data[BILLING_KEYS.openai] || '';
    if (hfInput) hfInput.value = data[BILLING_KEYS.hf] || '';
  }

  function bindVisibilityToggle(provider) {
    const input = document.getElementById(`api-key-${provider}`);
    const button = document.getElementById(`btn-toggle-${provider}`);
    if (!input || !button) return;
    button.addEventListener('click', () => {
      const nextType = input.type === 'password' ? 'text' : 'password';
      input.type = nextType;
      button.textContent = nextType === 'password' ? tKey('show') : tKey('hide');
    });
  }

  async function saveProviderKey(provider) {
    const input = document.getElementById(`api-key-${provider}`);
    if (!input) return;
    const value = String(input.value || '').trim();
    if (!value) {
      showToast(tKey('enterKeyBeforeSaving'), 'warning');
      return;
    }

    if (provider === 'nvidia' || provider === 'claude') {
      await ChatBridgeSecurity.saveApiKey(provider, value);
    } else {
      const keyMap = { gemini: BILLING_KEYS.gemini, openai: BILLING_KEYS.openai, hf: BILLING_KEYS.hf };
      await setLocal({ [keyMap[provider]]: value });
    }
    await loadBillingPanel();
    const providerLabel = provider === 'hf' ? 'Hugging Face' : provider === 'nvidia' ? 'NVIDIA' : provider === 'claude' ? 'Claude' : provider.charAt(0).toUpperCase() + provider.slice(1);
    showToast(`${providerLabel} key saved.`, 'success');
  }

  async function deleteProviderKey(provider) {
    if (provider === 'nvidia' || provider === 'claude') {
      await removeLocal(provider === 'nvidia' ? BILLING_KEYS.nvidia : BILLING_KEYS.claude);
    } else {
      const keyMap = { gemini: BILLING_KEYS.gemini, openai: BILLING_KEYS.openai, hf: BILLING_KEYS.hf };
      await removeLocal(keyMap[provider]);
    }
    const input = document.getElementById(`api-key-${provider}`);
    if (input) input.value = '';
    await loadBillingPanel();
    const providerLabel = provider === 'hf' ? 'Hugging Face' : provider === 'nvidia' ? 'NVIDIA' : provider === 'claude' ? 'Claude' : provider.charAt(0).toUpperCase() + provider.slice(1);
    showToast(`${providerLabel} key removed.`, 'success');
  }

  async function testProviderKey(provider) {
    const input = document.getElementById(`api-key-${provider}`);
    const status = document.getElementById(`status-${provider}`);
    const value = String(input?.value || '').trim();
    if (!value) {
      showToast(tKey('enterKeyBeforeTesting'), 'warning');
      return;
    }
    if (status) status.textContent = 'Testing...';

    const typeMap = {
      gemini: 'test_gemini_api',
      openai: 'test_openai_api',
      hf: 'test_huggingface_api',
      claude: 'test_claude_api',
      nvidia: 'test_nvidia_api'
    };

    chrome.runtime.sendMessage({ type: typeMap[provider], apiKey: value }, (response) => {
      const ok = !!(response && response.ok);
      if (status) status.textContent = ok ? tKey('connectionOk') : `${tKey('connectionFailed')}${response?.status ? ` (${response.status})` : ''}`;
      const providerLabel = provider === 'hf' ? 'Hugging Face' : provider === 'nvidia' ? 'NVIDIA' : provider === 'claude' ? 'Claude' : provider.charAt(0).toUpperCase() + provider.slice(1);
      showToast(ok ? `${providerLabel} ${tKey('connectionSucceeded')}` : `${providerLabel} ${tKey('connectionFailedToast')}`, ok ? 'success' : 'error');
    });
  }

  function bindBillingPanel() {
    ['gemini', 'openai', 'hf', 'claude', 'nvidia'].forEach((provider) => {
      bindVisibilityToggle(provider);
      document.getElementById(`btn-save-${provider}`)?.addEventListener('click', () => saveProviderKey(provider));
      document.getElementById(`btn-delete-${provider}`)?.addEventListener('click', () => deleteProviderKey(provider));
      document.getElementById(`btn-test-${provider}`)?.addEventListener('click', () => testProviderKey(provider));
    });

    document.getElementById('btn-open-pricing')?.addEventListener('click', () => {
      window.location.href = chrome.runtime.getURL('ui/welcome.html?upgrade=1');
    });

    document.getElementById('btn-options-login')?.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('ui/login.html') });
    });

    document.getElementById('btn-options-logout')?.addEventListener('click', async () => {
      if (window.confirm('Are you sure you want to sign out? Your subscription status will revert to Free.')) {
        await setLocal({
          [BILLING_KEYS.loggedIn]: false,
          [BILLING_KEYS.userEmail]: '',
          [BILLING_KEYS.tier]: 'free',
          [BILLING_KEYS.balance]: 100,
          [BILLING_KEYS.lastReset]: Date.now()
        });
        showToast('Successfully signed out.', 'success');
        await loadBillingPanel();
      }
    });
  }

  bindBillingPanel();
  loadBillingPanel();

  // ============================================
  // HISTORY MANAGEMENT
  // ============================================
  const historyList = document.getElementById('history-list');
  const historyStats = document.getElementById('history-stats');
  const btnClear = document.getElementById('btn-clear');

  async function loadHistory(providedArr = null) {
    const arr = providedArr || await getConversations();
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
          // Sync to background (IndexedDB)
          try { chrome.runtime.sendMessage({ type: 'replace_conversations', payload: { conversations: currentArr } }); } catch (_) { }
          loadHistory(currentArr);
          loadDashboardStats(currentArr);
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
      loadHistory([]);
      loadDashboardStats([]);
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
  chrome.storage.local.get(['cb_language'], res => {
    const savedLang = res.cb_language || 'en';
    currentLang = savedLang;

    // Apply translations on load
    setTimeout(() => applyTranslations(savedLang), 100);
  });

  // ============================================
  // CACHE MANAGEMENT
  // ============================================
  const btnClearCache = document.getElementById('btn-clear-cache');
  btnClearCache?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'clear_cache' }, (response) => {
      const t = window.t || ((k) => k);
      if (response && response.ok) {
        showToast(t('cacheCleared', currentLang), 'success');
      } else {
        showToast('Failed to clear cache.', 'error');
      }
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
      toast.style.animation = 'toastOut 0.25s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ============================================
  // ANALYTICS & TELEMETRY DASHBOARD
  // ============================================
  async function loadAndRenderAnalytics() {
    if (typeof AnalyticsManager === 'undefined') return;

    const enabled = await AnalyticsManager.isEnabled();
    
    // Update opt-in toggle UI
    const toggle = document.getElementById('analyticsEnabled');
    if (toggle) toggle.checked = enabled;

    const actionsContainer = document.getElementById('analytics-actions-container');
    const optinWarning = document.getElementById('analytics-optin-warning');
    const contentContainer = document.getElementById('analytics-content-container');

    if (enabled) {
      if (optinWarning) optinWarning.style.display = 'none';
      if (actionsContainer) actionsContainer.style.display = 'flex';
      if (contentContainer) contentContainer.style.display = 'block';

      const summary = await AnalyticsManager.getSummary();
      
      // Populate summary numbers
      const totalCallsEl = document.getElementById('stats-total-calls');
      const totalTokensEl = document.getElementById('stats-total-tokens');
      const inTokensEl = document.getElementById('stats-in-tokens');
      const outTokensEl = document.getElementById('stats-out-tokens');

      if (totalCallsEl) totalCallsEl.textContent = summary.transformCount.toLocaleString();
      if (totalTokensEl) totalTokensEl.textContent = summary.totalTokens.toLocaleString();
      if (inTokensEl) inTokensEl.textContent = summary.inputTokens.toLocaleString();
      if (outTokensEl) outTokensEl.textContent = summary.outputTokens.toLocaleString();

      // Render Canvas-based charts
      renderFeatureChart(summary.features);
      renderProviderChart(summary.providers);
      renderTrendChart(summary.dailyTrend);
    } else {
      if (optinWarning) optinWarning.style.display = 'block';
      if (actionsContainer) actionsContainer.style.display = 'none';
      if (contentContainer) contentContainer.style.display = 'none';
    }
  }

  // Pure Canvas Bar Chart for Feature Usage
  function renderFeatureChart(features) {
    const canvas = document.getElementById('chartFeatures');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const data = [
      { label: 'Summarize', value: features.summarize || 0 },
      { label: 'Rewrite', value: features.rewrite || 0 },
      { label: 'Translate', value: features.translate || 0 },
      { label: 'Sync Tone', value: features.syncTone || 0 },
      { label: 'Custom', value: features.custom || 0 }
    ];

    const maxValue = Math.max(...data.map(d => d.value), 5);
    const chartLeft = 85;
    const chartWidth = width - chartLeft - 40;
    const barHeight = 18;
    const barSpacing = 32;

    ctx.font = '500 11px Inter, sans-serif';
    ctx.textBaseline = 'middle';

    data.forEach((d, idx) => {
      const y = 20 + idx * barSpacing;
      
      // Draw label
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-2').trim() || '#7d8590';
      ctx.textAlign = 'right';
      ctx.fillText(d.label, chartLeft - 12, y + barHeight / 2);

      // Draw bar background track
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(chartLeft, y, chartWidth, barHeight, 4) : ctx.rect(chartLeft, y, chartWidth, barHeight);
      ctx.fill();

      // Draw filled bar
      if (d.value > 0) {
        const barValWidth = (d.value / maxValue) * chartWidth;
        const grad = ctx.createLinearGradient(chartLeft, y, chartLeft + barValWidth, y);
        const accent1 = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#58a6ff';
        const accent2 = getComputedStyle(document.body).getPropertyValue('--accent-2').trim() || '#bc8cff';
        grad.addColorStop(0, accent1);
        grad.addColorStop(1, accent2);
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(chartLeft, y, barValWidth, barHeight, 4) : ctx.rect(chartLeft, y, barValWidth, barHeight);
        ctx.fill();
      }

      // Draw value label
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#e6edf3';
      ctx.textAlign = 'left';
      ctx.fillText(d.value.toString(), chartLeft + ((d.value > 0) ? (d.value / maxValue) * chartWidth + 8 : 8), y + barHeight / 2);
    });
  }

  // Pure Canvas Donut Chart for Provider Distribution
  function renderProviderChart(providers) {
    const canvas = document.getElementById('chartProviders');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const rawData = [
      { label: 'Gemini', value: providers.gemini || 0, color: '#7C3AED' },
      { label: 'OpenAI', value: providers.openai || 0, color: '#10b981' },
      { label: 'HuggingFace', value: providers.huggingface || 0, color: '#fbbf24' },
      { label: 'Nvidia', value: providers.nvidia || 0, color: '#76b900' },
      { label: 'Local', value: providers.local || 0, color: '#6b7280' }
    ];

    const data = rawData.filter(d => d.value > 0);
    const total = data.reduce((acc, d) => acc + d.value, 0);

    const centerX = 80;
    const centerY = height / 2;
    const outerRadius = 60;
    const innerRadius = 38;

    if (total === 0) {
      // Draw empty donut state
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(centerX, centerY, (outerRadius + innerRadius) / 2, 0, 2 * Math.PI);
      ctx.stroke();

      ctx.fillStyle = '#8b949e';
      ctx.font = '500 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No data', centerX, centerY);

      // Draw placeholder legend
      ctx.textAlign = 'left';
      ctx.fillText('No calls made yet.', 160, centerY);
      return;
    }

    let startAngle = -0.5 * Math.PI;
    data.forEach(d => {
      const sliceAngle = (d.value / total) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;

      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
      ctx.closePath();
      ctx.fill();

      startAngle = endAngle;
    });

    // Draw inner cutout circle to make it a donut
    const baseColor = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#0d1117';
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius, 0, 2 * Math.PI);
    ctx.fill();

    // Draw legend
    const legendX = 160;
    const legendStartY = 28;
    const spacing = 28;

    ctx.font = '500 11px Inter, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    rawData.forEach((d, idx) => {
      const y = legendStartY + idx * spacing;
      
      // Color block
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(legendX, y - 5, 10, 10, 2) : ctx.rect(legendX, y - 5, 10, 10);
      ctx.fill();

      // Text label
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#e6edf3';
      ctx.fillText(d.label, legendX + 16, y);

      // Percentage
      const pct = total > 0 && d.value > 0 ? Math.round((d.value / total) * 100) : 0;
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-3').trim() || '#484f58';
      ctx.fillText(`${pct}% (${d.value})`, legendX + 90, y);
    });
  }

  // Pure Canvas Line Trend Chart for daily tokens
  function renderTrendChart(dailyTrend) {
    const canvas = document.getElementById('chartTokensTrend');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const dates = Object.keys(dailyTrend).sort();
    const data = dates.map(d => dailyTrend[d]);

    const maxVal = Math.max(...data.map(d => d.tokens), 500);
    const maxValue = Math.ceil(maxVal / 100) * 100; // round up to nearest 100

    const padLeft = 50;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 30;

    const chartWidth = width - padLeft - padRight;
    const chartHeight = height - padTop - padBottom;

    // Draw horizontal gridlines & Y labels
    const gridCount = 4;
    ctx.font = '500 10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= gridCount; i++) {
      const yVal = Math.round((maxValue / gridCount) * i);
      const y = padTop + chartHeight - (i / gridCount) * chartHeight;

      // Draw gridline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();

      // Draw Y label
      ctx.fillStyle = '#8b949e';
      ctx.fillText(yVal >= 1000 ? (yVal / 1000).toFixed(1) + 'k' : yVal.toString(), padLeft - 10, y);
    }

    // Map coordinates
    const points = data.map((d, idx) => {
      const x = padLeft + idx * (chartWidth / (dates.length - 1));
      const y = padTop + chartHeight - (d.tokens / maxValue) * chartHeight;
      return { x, y, tokens: d.tokens, date: dates[idx] };
    });

    // Draw area under curve
    if (points.length > 0) {
      const grad = ctx.createLinearGradient(0, padTop, 0, padTop + chartHeight);
      const accentGlow = 'rgba(88, 166, 255, 0.14)';
      grad.addColorStop(0, accentGlow);
      grad.addColorStop(1, 'rgba(88, 166, 255, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(points[0].x, padTop + chartHeight);
      
      // Draw smooth curve path
      ctx.lineTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
      }
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      ctx.lineTo(points[points.length - 1].x, padTop + chartHeight);
      ctx.closePath();
      ctx.fill();

      // Draw line stroke
      const strokeGrad = ctx.createLinearGradient(padLeft, 0, width - padRight, 0);
      const accent1 = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#58a6ff';
      const accent2 = getComputedStyle(document.body).getPropertyValue('--accent-2').trim() || '#bc8cff';
      strokeGrad.addColorStop(0, accent1);
      strokeGrad.addColorStop(1, accent2);

      ctx.strokeStyle = strokeGrad;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      
      for (let i = 0; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
      }
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      ctx.stroke();

      // Draw circles on points
      points.forEach(p => {
        // Outer glow
        ctx.fillStyle = 'rgba(88, 166, 255, 0.2)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, 2 * Math.PI);
        ctx.fill();

        // Inner solid dot
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = accent1;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      });
    }

    // Draw X labels (date days)
    ctx.fillStyle = '#8b949e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    points.forEach(p => {
      const parts = p.date.split('-');
      const label = parts.length === 3 ? `${parts[1]}/${parts[2]}` : p.date;
      ctx.fillText(label, p.x, padTop + chartHeight + 10);
    });
  }

  // Register events on options page DOM load
  async function initAnalyticsUI() {
    const toggle = document.getElementById('analyticsEnabled');
    if (toggle) {
      toggle.addEventListener('change', async (e) => {
        if (typeof AnalyticsManager !== 'undefined') {
          const checked = e.target.checked;
          await AnalyticsManager.setEnabled(checked);
          showToast(checked ? 'Local telemetry dashboard enabled.' : 'Telemetry disabled. History cleared.', 'success');
          loadAndRenderAnalytics();
        }
      });
    }

    const quickOptin = document.getElementById('btn-quick-optin');
    if (quickOptin) {
      quickOptin.addEventListener('click', async () => {
        if (typeof AnalyticsManager !== 'undefined') {
          await AnalyticsManager.setEnabled(true);
          showToast('Local telemetry dashboard enabled.', 'success');
          loadAndRenderAnalytics();
        }
      });
    }

    const clearBtn = document.getElementById('btn-clear-telemetry');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to permanently erase all local telemetry data? This action cannot be undone.')) {
          if (typeof AnalyticsManager !== 'undefined') {
            await AnalyticsManager.clearTelemetry();
            showToast('All local telemetry data erased.', 'success');
            loadAndRenderAnalytics();
          }
        }
      });
    }

    const exportBtn = document.getElementById('btn-export-telemetry');
    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        if (typeof AnalyticsManager !== 'undefined') {
          try {
            const records = await AnalyticsManager.getTelemetry();
            const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chatbridge_telemetry_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('Telemetry report exported successfully.', 'success');
          } catch (e) {
            showToast('Export failed: ' + e.message, 'error');
          }
        }
      });
    }

    // Load initial state
    loadAndRenderAnalytics();
  }

  // Call immediately to register options page triggers
  setTimeout(initAnalyticsUI, 100);

  // ============================================
  // HASH NAVIGATION
  // ============================================
  if (window.location.hash) {
    const hash = window.location.hash.substring(1);
    const sectionMap = {
      'dashboard': 'dashboard',
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

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.cb_theme) {
        const theme = changes.cb_theme.newValue || 'dark';
        themePills.forEach(pill => {
          if (pill.dataset.theme === theme) {
            pill.classList.add('active');
            const inp = pill.querySelector('input');
            if (inp) inp.checked = true;
          } else {
            pill.classList.remove('active');
          }
        });
        applyPageTheme(theme);
      }
      if (changes.cb_language) {
        applyTranslations(changes.cb_language.newValue || 'en');
      }
      const billingKeysToSync = [
        'chatbridge_subscription_tier',
        'chatbridge_credits_balance',
        'chatbridge_credits_last_reset',
        'chatbridge_gemini_key',
        'chatbridge_openai_key',
        'chatbridge_hf_key',
        'chatbridge_api_claude',
        'chatbridge_api_nvidia',
        'chatbridge_logged_in',
        'chatbridge_user_email'
      ];
      const hasBillingChanges = Object.keys(changes).some(k => billingKeysToSync.includes(k));
      if (hasBillingChanges) {
        loadBillingPanel();
      }
    }
  });

})();
