const StorageManager = (() => {
  const KEYS = {
    CONVERSATIONS: 'chatbridge_conversations_v1',
    CONFIG: 'chatbridge_config',
    THEME: 'cb_theme',
    CACHE_PREFIX: 'chatbridge:cache:',
    // Agent Hub storage keys
    AGENT_CATCHMEUP: 'chatbridge_agent_catchmeup',
    AGENT_TRACKED_TOPICS: 'chatbridge_agent_tracked_topics',
    AGENT_PULSE_SESSIONS: 'chatbridge_agent_pulse_sessions',
    AGENT_HANDOFF_DRAFTS: 'chatbridge_agent_handoff_drafts'
  };

  const LIMITS = {
    MAX_CONVERSATIONS: 50,
    MAX_RETRIES: 5,
    RETRY_DELAY: 1000
  };

  let storageAPI = null;
  let initPromise = null;

  function initStorage() {
    if (initPromise) return initPromise;

    initPromise = new Promise((resolve, reject) => {
      let retries = LIMITS.MAX_RETRIES;
      
      function check() {
        if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
          storageAPI = chrome.storage.local;
          resolve(storageAPI);
          return;
        }

        if (window.chrome?.storage?.local) {
          storageAPI = window.chrome.storage.local;
          resolve(storageAPI);
          return;
        }

        if (retries <= 0) {
          reject(new Error('chrome.storage not available'));
          return;
        }

        retries--;
        setTimeout(check, LIMITS.RETRY_DELAY);
      }

      check();
    });

    return initPromise;
  }

  async function get(key) {
    try {
      const storage = storageAPI || await initStorage();
      return new Promise((resolve, reject) => {
        storage.get([key], result => {
          if (chrome?.runtime?.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result[key]);
          }
        });
      });
    } catch (error) {
      console.warn('[ChatBridge] Storage get error:', error);
      return null;
    }
  }

  async function set(key, value) {
    try {
      const storage = storageAPI || await initStorage();
      return new Promise((resolve, reject) => {
        storage.set({ [key]: value }, () => {
          if (chrome?.runtime?.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      console.warn('[ChatBridge] Storage set error:', error);
      throw error;
    }
  }

  async function remove(key) {
    try {
      const storage = storageAPI || await initStorage();
      return new Promise((resolve, reject) => {
        storage.remove(key, () => {
          if (chrome?.runtime?.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      console.warn('[ChatBridge] Storage remove error:', error);
    }
  }

  async function saveConversation(conversation) {
    try {
      const conversations = (await get(KEYS.CONVERSATIONS)) || [];
      conversations.unshift(conversation);
      const trimmed = conversations.slice(0, LIMITS.MAX_CONVERSATIONS);
      await set(KEYS.CONVERSATIONS, trimmed);
    } catch (error) {
      console.error('[ChatBridge] Save conversation error:', error);
      fallbackToLocalStorage('save', conversation);
    }
  }

  async function getConversations() {
    try {
      return (await get(KEYS.CONVERSATIONS)) || [];
    } catch (error) {
      console.error('[ChatBridge] Get conversations error:', error);
      return [];
    }
  }

  async function clearConversations() {
    try {
      await set(KEYS.CONVERSATIONS, []);
    } catch (error) {
      console.error('[ChatBridge] Clear conversations error:', error);
    }
  }

  function fallbackToLocalStorage(operation, data) {
    try {
      if (operation === 'save' && data) {
        let arr = JSON.parse(localStorage.getItem(KEYS.CONVERSATIONS) || '[]');
        arr.unshift(data);
        arr = arr.slice(0, LIMITS.MAX_CONVERSATIONS);
        localStorage.setItem(KEYS.CONVERSATIONS, JSON.stringify(arr));
      }
    } catch (error) {
      console.warn('[ChatBridge] localStorage fallback failed:', error);
    }
  }

  function saveConversationSync(obj, cb) {
    saveConversation(obj).then(() => cb && cb()).catch(() => cb && cb());
  }

  function getConversationsSync(cb) {
    getConversations().then(data => cb && cb(data)).catch(() => cb && cb([]));
  }

  function clearConversationsSync(cb) {
    clearConversations().then(() => cb && cb()).catch(() => cb && cb());
  }

  // ============================================
  // AGENT HUB STORAGE HELPERS
  // ============================================

  // Catch Me Up — track when user last saw a briefing
  async function getAgentCatchMeUp() {
    try {
      return (await get(KEYS.AGENT_CATCHMEUP)) || { lastBriefedAt: 0, unreadCount: 0 };
    } catch (e) { return { lastBriefedAt: 0, unreadCount: 0 }; }
  }
  async function setAgentCatchMeUp(data) {
    try { await set(KEYS.AGENT_CATCHMEUP, data); } catch (e) { console.warn('[ChatBridge] Agent CatchMeUp save error:', e); }
  }

  // Track This — persistent topic tracking
  async function getTrackedTopics() {
    try {
      return (await get(KEYS.AGENT_TRACKED_TOPICS)) || [];
    } catch (e) { return []; }
  }
  async function setTrackedTopics(topics) {
    try { await set(KEYS.AGENT_TRACKED_TOPICS, topics); } catch (e) { console.warn('[ChatBridge] Agent TrackedTopics save error:', e); }
  }

  // My Pulse — session-level usage telemetry (rolling 90 days, max 500)
  async function getPulseSessions() {
    try {
      return (await get(KEYS.AGENT_PULSE_SESSIONS)) || [];
    } catch (e) { return []; }
  }
  async function appendPulseSession(session) {
    try {
      let sessions = (await get(KEYS.AGENT_PULSE_SESSIONS)) || [];
      sessions.push(session);
      // Rolling 90-day window, max 500 records
      const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
      sessions = sessions.filter(s => s.date > cutoff).slice(-500);
      await set(KEYS.AGENT_PULSE_SESSIONS, sessions);
    } catch (e) { console.warn('[ChatBridge] Agent Pulse save error:', e); }
  }

  // Handoff — saved briefing documents
  async function getHandoffDrafts() {
    try {
      return (await get(KEYS.AGENT_HANDOFF_DRAFTS)) || [];
    } catch (e) { return []; }
  }
  async function saveHandoffDraft(draft) {
    try {
      let drafts = (await get(KEYS.AGENT_HANDOFF_DRAFTS)) || [];
      drafts.unshift(draft);
      drafts = drafts.slice(0, 20); // Keep last 20
      await set(KEYS.AGENT_HANDOFF_DRAFTS, drafts);
    } catch (e) { console.warn('[ChatBridge] Agent Handoff save error:', e); }
  }

  return {
    KEYS,
    get,
    set,
    remove,
    saveConversation,
    getConversations,
    clearConversations,
    saveConversationSync,
    getConversationsSync,
    clearConversationsSync,
    // Agent Hub
    getAgentCatchMeUp,
    setAgentCatchMeUp,
    getTrackedTopics,
    setTrackedTopics,
    getPulseSessions,
    appendPulseSession,
    getHandoffDrafts,
    saveHandoffDraft
  };
})();

if (typeof window !== 'undefined') {
  window.StorageManager = StorageManager;
  window.saveConversation = StorageManager.saveConversationSync;
  window.getConversations = StorageManager.getConversationsSync;
  window.clearConversations = StorageManager.clearConversationsSync;
}
