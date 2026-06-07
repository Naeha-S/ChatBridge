// Mock chrome APIs
global.chrome = {
  storage: {
    local: {
      storageMap: {},
      get: jest.fn((keys, callback) => {
        const result = {};
        const map = global.chrome.storage.local.storageMap;
        if (typeof keys === 'string') {
          result[keys] = map[keys];
        } else if (Array.isArray(keys)) {
          keys.forEach(k => {
            result[k] = map[k];
          });
        } else if (typeof keys === 'object' && keys !== null) {
          Object.keys(keys).forEach(k => {
            result[k] = map[k] !== undefined ? map[k] : keys[k];
          });
        }
        if (callback) {
          setTimeout(() => callback(result), 0);
        }
      }),
      set: jest.fn((items, callback) => {
        Object.keys(items).forEach(k => {
          global.chrome.storage.local.storageMap[k] = items[k];
        });
        if (callback) {
          setTimeout(callback, 0);
        }
      }),
      remove: jest.fn((keys, callback) => {
        if (typeof keys === 'string') {
          delete global.chrome.storage.local.storageMap[keys];
        } else if (Array.isArray(keys)) {
          keys.forEach(k => {
            delete global.chrome.storage.local.storageMap[k];
          });
        }
        if (callback) {
          setTimeout(callback, 0);
        }
      }),
      clear: jest.fn((callback) => {
        global.chrome.storage.local.storageMap = {};
        if (callback) {
          setTimeout(callback, 0);
        }
      })
    }
  },
  runtime: {
    id: 'mock-extension-id',
    lastError: null,
    sendMessage: jest.fn((message, callback) => {
      if (callback) {
        setTimeout(() => callback({ ok: true, driftScore: 0.1 }), 0);
      }
    })
  }
};

// Mock DOM execCommand
document.execCommand = jest.fn((command, showUI, value) => {
  if (command === 'insertText') {
    const active = document.activeElement;
    if (active) {
      if (active.isContentEditable || active.contentEditable === 'true') {
        active.textContent = value;
      } else {
        active.value = value;
      }
      return true;
    }
  }
  return false;
});

// Mock Clipboard API
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: jest.fn().mockImplementation(() => Promise.resolve()),
    readText: jest.fn().mockImplementation(() => Promise.resolve(''))
  },
  configurable: true,
  writable: true
});

// Mock Global functions
global.toast = jest.fn();
global.debugLog = jest.fn();
global.restoreLog = jest.fn();
global.CB_MAX_MESSAGES = 100;
global.escapeHtml = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Polyfill innerText in JSDOM using textContent
if (typeof HTMLElement !== 'undefined' && !Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'innerText')) {
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    get() {
      return this.textContent;
    },
    set(value) {
      this.textContent = value;
    },
    configurable: true
  });
}

