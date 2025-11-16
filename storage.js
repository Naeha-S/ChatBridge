const StorageManager = (() => {
  const KEYS = {
    CONVERSATIONS: 'chatbridge_conversations_v1',
    CONFIG: 'chatbridge_config',
    THEME: 'cb_theme',
    CACHE_PREFIX: 'chatbridge:cache:'
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
    clearConversationsSync
  };
})();

if (typeof window !== 'undefined') {
  window.StorageManager = StorageManager;
  window.saveConversation = StorageManager.saveConversationSync;
  window.getConversations = StorageManager.getConversationsSync;
  window.clearConversations = StorageManager.clearConversationsSync;
}
