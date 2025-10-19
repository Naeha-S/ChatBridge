// storage.js
const STORAGE_KEY = "chatbridge_conversations_v1";
const MAX_ITEMS = 50; // keep recent 50
const MAX_RETRIES = 5;
const RETRY_DELAY = 1000; // ms

// Initialize storage API
let storageAPI = null;
let initPromise = null;

// Wait for chrome.storage to be available
function initStorage() {
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
    let retries = MAX_RETRIES;
    
    function check() {
      // Check if we have direct access
      if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
        storageAPI = chrome.storage.local;
        resolve(storageAPI);
        return;
      }

      // Check if we're in an extension context
      if (window.chrome?.storage?.local) {
        storageAPI = window.chrome.storage.local;
        resolve(storageAPI);
        return;
      }

      // Still no storage API
      if (retries <= 0) {
        const err = new Error('ChatBridge: chrome.storage not available after retries');
        console.warn(err);
        reject(err);
        return;
      }

      retries--;
      console.debug('ChatBridge: waiting for storage API, retries left:', retries);
      setTimeout(check, RETRY_DELAY);
    }

    // Start checking
    check();
  });

  return initPromise;
}

// Check if chrome.storage is available
const hasStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

function saveConversation(obj, cb) {
  // obj: { platform, ts, conversation: [{role,text}, ...] }
  if (storageAPI) {
    // Use cached API if available
    try {
      storageAPI.get([STORAGE_KEY], res => {
        const arr = res[STORAGE_KEY] || [];
        arr.unshift(obj);
        const trimmed = arr.slice(0, MAX_ITEMS);
        const payload = {};
        payload[STORAGE_KEY] = trimmed;
        storageAPI.set(payload, () => {
          if (chrome?.runtime?.lastError) {
            console.warn('ChatBridge storage error:', chrome.runtime.lastError);
          }
          if (cb) cb();
        });
      });
    } catch(e) {
      console.warn('ChatBridge direct storage error:', e);
      showStorageErrorToast(e);
      if (cb) cb();
    }
    return;
  }

  // Initialize if needed
  initStorage()
    .then(storage => {
      storage.get([STORAGE_KEY], res => {
        const arr = res[STORAGE_KEY] || [];
        arr.unshift(obj);
        const trimmed = arr.slice(0, MAX_ITEMS);
        const payload = {};
        payload[STORAGE_KEY] = trimmed;
        storage.set(payload, () => {
          if (chrome?.runtime?.lastError) {
            console.warn('ChatBridge storage error:', chrome.runtime.lastError);
          }
          if (cb) cb();
        });
      });
    })
    .catch(err => {
      console.warn('ChatBridge storage init error:', err);
      showStorageErrorToast(err);
      if (cb) cb();
    });
}

function getConversations(cb) {
  if (storageAPI) {
    // Use cached API if available
    try {
      storageAPI.get([STORAGE_KEY], res => {
        if (chrome?.runtime?.lastError) {
          console.warn('ChatBridge storage error:', chrome.runtime.lastError);
          cb([]);
          return;
        }
        cb(res[STORAGE_KEY] || []);
      });
    } catch(e) {
      console.warn('ChatBridge direct storage error:', e);
      showStorageErrorToast(e);
      cb([]);
    }
    return;
  }

  // Initialize if needed
  initStorage()
    .then(storage => {
      storage.get([STORAGE_KEY], res => {
        if (chrome?.runtime?.lastError) {
          console.warn('ChatBridge storage error:', chrome.runtime.lastError);
          cb([]);
          return;
        }
        cb(res[STORAGE_KEY] || []);
      });
    })
    .catch(err => {
      console.warn('ChatBridge storage init error:', err);
      showStorageErrorToast(err);
      cb([]);
    });
}

function clearConversations(cb) {
  if (storageAPI) {
    // Use cached API if available
    try {
      const payload = {};
      payload[STORAGE_KEY] = [];
      storageAPI.set(payload, () => {
        if (chrome?.runtime?.lastError) {
          console.warn('ChatBridge storage error:', chrome.runtime.lastError);
        }
        if (cb) cb();
      });
    } catch(e) {
      console.warn('ChatBridge direct storage error:', e);
      showStorageErrorToast(e);
      if (cb) cb();
    }
    return;
  }

  // Initialize if needed
  initStorage()
    .then(storage => {
      const payload = {};
      payload[STORAGE_KEY] = [];
      storage.set(payload, () => {
        if (chrome?.runtime?.lastError) {
          console.warn('ChatBridge storage error:', chrome.runtime.lastError);
        }
        if (cb) cb();
      });
    })
    .catch(err => {
      console.warn('ChatBridge storage init error:', err);
      showStorageErrorToast(err);
      if (cb) cb();
    });
}

function showStorageErrorToast(err) {
  if (typeof window !== 'undefined' && window.document) {
    const msg = (err && err.message && err.message.includes('Extension context invalidated'))
      ? 'ChatBridge: Extension context lost. Please refresh the page or reload the extension.'
      : 'ChatBridge: Storage error. Try refreshing the page.';
    try {
      const t = document.createElement('div');
      t.innerText = msg;
      t.style.position = 'fixed';
      t.style.bottom = '22px';
      t.style.left = '22px';
      t.style.background = 'rgba(176, 0, 0, 0.95)';
      t.style.color = '#fff';
      t.style.padding = '8px 12px';
      t.style.borderRadius = '8px';
      t.style.zIndex = 2147483647;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 4000);
    } catch(e) {
      alert(msg);
    }
  }
}

// Expose storage functions globally for content_script.js
if (typeof window !== 'undefined') {
  window.saveConversation = saveConversation;
  window.getConversations = getConversations;
  window.clearConversations = clearConversations;
}
