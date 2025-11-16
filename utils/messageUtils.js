const MessageUtils = (() => {
  const { MESSAGES } = window.ChatBridgeConstants || {};

  function createMessage(type, payload = {}) {
    return {
      type,
      payload,
      timestamp: Date.now()
    };
  }

  function createResponse(success, result = null, error = null) {
    return {
      ok: success,
      result,
      error: error ? String(error) : null,
      timestamp: Date.now()
    };
  }

  async function sendToBackground(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function sendToTab(tabId, message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.sendMessage(tabId, message, response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function sendToActiveTab(message) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        throw new Error('No active tab found');
      }
      return await sendToTab(tab.id, message);
    } catch (error) {
      throw error;
    }
  }

  function validateMessage(message) {
    if (!message || typeof message !== 'object') {
      return { valid: false, error: 'Invalid message format' };
    }
    if (!message.type) {
      return { valid: false, error: 'Message type is required' };
    }
    return { valid: true };
  }

  function createRewriteMessage(text, style, options = {}) {
    return createMessage(MESSAGES?.REWRITE || 'rewrite', {
      text,
      styleKey: style,
      styleHint: options.styleHint || '',
      chunkSize: options.chunkSize || 14000,
      maxParallel: options.maxParallel || 3,
      length: options.length || 'medium'
    });
  }

  function createSummarizeMessage(text, summaryType = 'paragraph', length = 'medium') {
    return createMessage(MESSAGES?.SUMMARIZE || 'summarize', {
      text,
      summaryType,
      length
    });
  }

  function createTranslateMessage(text, targetLang) {
    return createMessage(MESSAGES?.TRANSLATE || 'translate', {
      text,
      targetLang
    });
  }

  function createSyncToneMessage(text, targetModel) {
    return createMessage(MESSAGES?.SYNC_TONE || 'syncTone', {
      text,
      targetModel
    });
  }

  function createRestoreMessage(text, files = []) {
    return createMessage(MESSAGES?.RESTORE_TO_CHAT || 'restore_to_chat', {
      text,
      files
    });
  }

  function createOpenAndRestoreMessage(url, text, files = []) {
    return createMessage(MESSAGES?.OPEN_AND_RESTORE || 'open_and_restore', {
      url,
      text,
      files
    });
  }

  function handleMessageError(error) {
    console.error('[ChatBridge] Message error:', error);
    return createResponse(false, null, error.message || String(error));
  }

  return {
    createMessage,
    createResponse,
    sendToBackground,
    sendToTab,
    sendToActiveTab,
    validateMessage,
    createRewriteMessage,
    createSummarizeMessage,
    createTranslateMessage,
    createSyncToneMessage,
    createRestoreMessage,
    createOpenAndRestoreMessage,
    handleMessageError
  };
})();

if (typeof window !== 'undefined') {
  window.MessageUtils = MessageUtils;
}
