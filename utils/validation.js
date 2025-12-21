const ValidationUtils = (() => {
  function isApprovedSite(hostname) {
    if (!hostname) return false;
    const { APPROVED_SITES } = window.ChatBridgeConstants || {};
    if (!APPROVED_SITES) return false;
    
    return APPROVED_SITES.some(site => 
      hostname === site || hostname.endsWith('.' + site)
    ) || hostname === 'localhost';
  }

  function validateMessage(message) {
    if (!message || typeof message !== 'object') {
      return { valid: false, error: 'Invalid message format' };
    }
    
    if (!message.type) {
      return { valid: false, error: 'Message type required' };
    }
    
    return { valid: true };
  }

  function validateText(text, minLength = 1) {
    if (!text || typeof text !== 'string') {
      return { valid: false, error: 'Invalid text' };
    }
    
    if (text.trim().length < minLength) {
      return { valid: false, error: `Text too short (min ${minLength} chars)` };
    }
    
    return { valid: true };
  }

  function validateUrl(url) {
    try {
      new URL(url);
      return { valid: true };
    } catch (e) {
      return { valid: false, error: 'Invalid URL' };
    }
  }

  function validateConversation(conversation) {
    if (!Array.isArray(conversation)) {
      return { valid: false, error: 'Conversation must be array' };
    }
    
    for (const msg of conversation) {
      if (!msg.role || !msg.text) {
        return { valid: false, error: 'Invalid message format' };
      }
      
      if (!['user', 'assistant'].includes(msg.role)) {
        return { valid: false, error: 'Invalid role' };
      }
    }
    
    return { valid: true };
  }

  return {
    isApprovedSite,
    validateMessage,
    validateText,
    validateUrl,
    validateConversation
  };
})();

if (typeof window !== 'undefined') {
  window.ValidationUtils = ValidationUtils;
}
