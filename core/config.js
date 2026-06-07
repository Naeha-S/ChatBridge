// config.js - API Keys Configuration
// Simple config with direct API keys (for demo/dev use)

const CONFIG = {
    GEMINI_API_KEY: '',
    HUGGINGFACE_API_KEY: '',
};

if (typeof window !== 'undefined') {
    window.CHATBRIDGE_CONFIG = CONFIG;
}

// ============================================================================
// Chrome Extension MV3 Compliance: localStorage to chrome.storage.local Shim
// Redirects all keys containing 'chatbridge', 'cb_', or 'sq-' to chrome.storage.local
// using an in-memory cache to support synchronous operations safely and securely.
// ============================================================================
(function () {
    // Only run this shim in a browser window environment where chrome.storage is available
    if (typeof window === 'undefined' || typeof Storage === 'undefined' || typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        return;
    }

    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    const originalClear = Storage.prototype.clear;
    const originalKey = Storage.prototype.key;

    // Retrieve original length property descriptor
    const originalLengthDescriptor = Object.getOwnPropertyDescriptor(Storage.prototype, 'length');
    const originalLengthGetter = originalLengthDescriptor ? originalLengthDescriptor.get : null;

    const chromeStorageCache = {};
    let cacheInitialized = false;

    // Helper to identify keys belonging to ChatBridge
    function isExtensionKey(key) {
        if (typeof key !== 'string') return false;
        const lowerKey = key.toLowerCase();
        return lowerKey.includes('chatbridge') || lowerKey.includes('cb_') || lowerKey.includes('sq-');
    }

    // Load initial values from chrome.storage.local
    chrome.storage.local.get(null, (items) => {
        try {
            // Populate our in-memory cache
            for (const [key, val] of Object.entries(items)) {
                if (isExtensionKey(key)) {
                    chromeStorageCache[key] = typeof val === 'string' ? val : JSON.stringify(val);
                }
            }

            // Migration: Migrate any extension keys currently stored in insecure host localStorage
            const migrationData = {};
            const keysToRemove = [];
            
            // Read from original localStorage safely
            const len = originalLengthGetter ? originalLengthGetter.call(window.localStorage) : window.localStorage.length;
            for (let i = 0; i < len; i++) {
                const key = originalKey.call(window.localStorage, i);
                if (isExtensionKey(key)) {
                    const localVal = originalGetItem.call(window.localStorage, key);
                    if (localVal !== null) {
                        // If it's not already in chrome.storage, queue it for migration
                        if (chromeStorageCache[key] === undefined) {
                            chromeStorageCache[key] = localVal;
                            // Attempt to parse JSON if it is serialized, otherwise save as string
                            try {
                                migrationData[key] = JSON.parse(localVal);
                            } catch (_) {
                                migrationData[key] = localVal;
                            }
                        }
                        keysToRemove.push(key);
                    }
                }
            }

            // Write migrated keys to chrome.storage.local
            if (Object.keys(migrationData).length > 0) {
                chrome.storage.local.set(migrationData);
            }

            // Remove legacy keys from original localStorage to secure them
            keysToRemove.forEach(key => {
                try {
                    originalRemoveItem.call(window.localStorage, key);
                } catch (_) {}
            });
        } catch (err) {
            console.warn('[ChatBridge Shim] Migration error:', err);
        } finally {
            cacheInitialized = true;
        }
    });

    // Listen for storage changes in other contexts (e.g. background page or other tabs)
    if (chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local') {
                for (const [key, change] of Object.entries(changes)) {
                    if (isExtensionKey(key)) {
                        if ('newValue' in change) {
                            const val = change.newValue;
                            chromeStorageCache[key] = typeof val === 'string' ? val : JSON.stringify(val);
                        } else {
                            delete chromeStorageCache[key];
                        }
                    }
                }
            }
        });
    }

    // Override getItem
    Storage.prototype.getItem = function (key) {
        if (isExtensionKey(key)) {
            // Return from cache if we have it, otherwise fallback to original localStorage if cache not ready yet
            if (chromeStorageCache[key] !== undefined) {
                return chromeStorageCache[key];
            }
            if (!cacheInitialized) {
                return originalGetItem.call(this, key);
            }
            return null;
        }
        return originalGetItem.call(this, key);
    };

    // Override setItem
    Storage.prototype.setItem = function (key, value) {
        if (isExtensionKey(key)) {
            const strVal = String(value);
            chromeStorageCache[key] = strVal;

            // Save to chrome.storage.local asynchronously
            let parsedVal = strVal;
            try {
                parsedVal = JSON.parse(strVal);
            } catch (_) {
                // Keep as string if it is not valid JSON
            }
            try {
                chrome.storage.local.set({ [key]: parsedVal });
            } catch (err) {
                console.warn('[ChatBridge Shim] Failed to write to chrome.storage.local:', err);
            }

            // Clean up original localStorage if it got written there somehow
            try {
                originalRemoveItem.call(this, key);
            } catch (_) {}
            return;
        }
        originalSetItem.call(this, key, value);
    };

    // Override removeItem
    Storage.prototype.removeItem = function (key) {
        if (isExtensionKey(key)) {
            delete chromeStorageCache[key];
            try {
                chrome.storage.local.remove(key);
            } catch (err) {
                console.warn('[ChatBridge Shim] Failed to remove from chrome.storage.local:', err);
            }
            try {
                originalRemoveItem.call(this, key);
            } catch (_) {}
            return;
        }
        originalRemoveItem.call(this, key);
    };

    // Override clear
    Storage.prototype.clear = function () {
        // Clear all keys from cache and chrome.storage.local
        const keysToRemove = Object.keys(chromeStorageCache);
        keysToRemove.forEach(key => {
            delete chromeStorageCache[key];
        });
        if (keysToRemove.length > 0) {
            try {
                chrome.storage.local.remove(keysToRemove);
            } catch (err) {
                console.warn('[ChatBridge Shim] Failed to clear from chrome.storage.local:', err);
            }
        }

        // Also clean up any matching keys in original localStorage
        try {
            const len = originalLengthGetter ? originalLengthGetter.call(this) : this.length;
            const originalKeysToRemove = [];
            for (let i = 0; i < len; i++) {
                const key = originalKey.call(this, i);
                if (isExtensionKey(key)) {
                    originalKeysToRemove.push(key);
                }
            }
            originalKeysToRemove.forEach(key => {
                try {
                    originalRemoveItem.call(this, key);
                } catch (_) {}
            });
        } catch (_) {}

        originalClear.call(this);
    };

    // Override key
    Storage.prototype.key = function (index) {
        const originalKeys = [];
        try {
            const len = originalLengthGetter ? originalLengthGetter.call(this) : this.length;
            for (let i = 0; i < len; i++) {
                const key = originalKey.call(this, i);
                if (!isExtensionKey(key)) {
                    originalKeys.push(key);
                }
            }
        } catch (_) {}

        const extensionKeys = Object.keys(chromeStorageCache);
        const combinedKeys = [...originalKeys, ...extensionKeys];
        return combinedKeys[index] !== undefined ? combinedKeys[index] : null;
    };

    // Override length getter
    if (originalLengthDescriptor) {
        Object.defineProperty(Storage.prototype, 'length', {
            get: function () {
                const originalKeys = [];
                try {
                    const len = originalLengthGetter ? originalLengthGetter.call(this) : this.length;
                    for (let i = 0; i < len; i++) {
                        const key = originalKey.call(this, i);
                        if (!isExtensionKey(key)) {
                            originalKeys.push(key);
                        }
                    }
                } catch (_) {}
                const extensionKeys = Object.keys(chromeStorageCache);
                return originalKeys.length + extensionKeys.length;
            },
            configurable: true
        });
    }
})();

