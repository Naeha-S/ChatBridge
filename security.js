// ============================================
// CHATBRIDGE SECURITY MODULE
// Encryption, rate limiting, and input sanitization
// ============================================

const ChatBridgeSecurity = (() => {
  'use strict';

  // ============================================
  // ENCRYPTION - Web Crypto API for API keys
  // ============================================
  
  const ENCRYPTION_KEY_NAME = 'chatbridge_master_key';
  let masterKey = null;

  // Generate or retrieve master encryption key
  async function getMasterKey() {
    if (masterKey) return masterKey;
    
    try {
      // Check if key exists in storage
      const stored = await chrome.storage.local.get(ENCRYPTION_KEY_NAME);
      
      if (stored[ENCRYPTION_KEY_NAME]) {
        // Import existing key
        const keyData = JSON.parse(stored[ENCRYPTION_KEY_NAME]);
        masterKey = await crypto.subtle.importKey(
          'jwk',
          keyData,
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );
      } else {
        // Generate new key
        masterKey = await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );
        
        // Store key
        const exportedKey = await crypto.subtle.exportKey('jwk', masterKey);
        await chrome.storage.local.set({
          [ENCRYPTION_KEY_NAME]: JSON.stringify(exportedKey)
        });
      }
      
      return masterKey;
    } catch (e) {
      console.error('[Security] Master key error:', e);
      throw e;
    }
  }

  // Encrypt sensitive data (like API keys)
  async function encrypt(plaintext) {
    try {
      const key = await getMasterKey();
      const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
      const encoded = new TextEncoder().encode(plaintext);
      
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encoded
      );
      
      // Return base64-encoded IV + ciphertext
      const combined = new Uint8Array(iv.length + ciphertext.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(ciphertext), iv.length);
      
      return btoa(String.fromCharCode(...combined));
    } catch (e) {
      console.error('[Security] Encryption error:', e);
      throw e;
    }
  }

  // Decrypt sensitive data
  async function decrypt(encryptedData) {
    try {
      const key = await getMasterKey();
      const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
      
      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        ciphertext
      );
      
      return new TextDecoder().decode(decrypted);
    } catch (e) {
      console.error('[Security] Decryption error:', e);
      throw e;
    }
  }

  // Save encrypted API key
  async function saveApiKey(service, apiKey) {
    try {
      const encrypted = await encrypt(apiKey);
      await chrome.storage.local.set({
        [`chatbridge_api_${service}`]: encrypted
      });
      return true;
    } catch (e) {
      console.error('[Security] Save API key error:', e);
      return false;
    }
  }

  // Retrieve and decrypt API key
  async function getApiKey(service) {
    try {
      const result = await chrome.storage.local.get(`chatbridge_api_${service}`);
      const encrypted = result[`chatbridge_api_${service}`];
      
      if (!encrypted) return null;
      
      return await decrypt(encrypted);
    } catch (e) {
      console.error('[Security] Get API key error:', e);
      return null;
    }
  }

  // ============================================
  // RATE LIMITING - Prevent API abuse
  // ============================================

  class RateLimiter {
    constructor(options = {}) {
      this.maxPerMinute = options.maxPerMinute || 10;
      this.maxPerHour = options.maxPerHour || 100;
      this.requests = [];
    }

    // Check if request is allowed
    isAllowed() {
      const now = Date.now();
      const oneMinuteAgo = now - 60 * 1000;
      const oneHourAgo = now - 60 * 60 * 1000;

      // Clean old requests
      this.requests = this.requests.filter(t => t > oneHourAgo);

      const lastMinute = this.requests.filter(t => t > oneMinuteAgo).length;
      const lastHour = this.requests.length;

      if (lastMinute >= this.maxPerMinute) {
        return { allowed: false, reason: 'rate_limit_minute', retryAfter: 60 };
      }

      if (lastHour >= this.maxPerHour) {
        return { allowed: false, reason: 'rate_limit_hour', retryAfter: 3600 };
      }

      return { allowed: true };
    }

    // Record a request
    recordRequest() {
      this.requests.push(Date.now());
    }

    // Get current stats
    getStats() {
      const now = Date.now();
      const oneMinuteAgo = now - 60 * 1000;
      const oneHourAgo = now - 60 * 60 * 1000;

      return {
        lastMinute: this.requests.filter(t => t > oneMinuteAgo).length,
        lastHour: this.requests.filter(t => t > oneHourAgo).length,
        maxPerMinute: this.maxPerMinute,
        maxPerHour: this.maxPerHour
      };
    }
  }

  // Global rate limiters
  const rateLimiters = {
    gemini: new RateLimiter({ maxPerMinute: 10, maxPerHour: 100 }),
    scan: new RateLimiter({ maxPerMinute: 5, maxPerHour: 50 }),
    embed: new RateLimiter({ maxPerMinute: 20, maxPerHour: 200 })
  };

  // ============================================
  // INPUT SANITIZATION - Detect/redact sensitive data
  // ============================================

  const PATTERNS = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    ipAddress: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    apiKey: /\b(sk-|pk-|API[_-]?KEY[_-]?)[A-Za-z0-9_-]{20,}\b/gi,
    password: /\b(password|pwd|passwd)[\s:=]+\S+/gi
  };

  // Detect sensitive information in text
  function detectSensitiveData(text) {
    const findings = [];

    for (const [type, pattern] of Object.entries(PATTERNS)) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        findings.push({
          type,
          count: matches.length,
          samples: matches.slice(0, 2) // First 2 examples
        });
      }
    }

    return findings;
  }

  // Sanitize text by redacting sensitive data
  function sanitize(text, options = {}) {
    const redactChar = options.redactChar || '*';
    const preserve = options.preserve || 4; // Characters to show at start/end
    let sanitized = text;

    // Redact emails
    sanitized = sanitized.replace(PATTERNS.email, (match) => {
      const [local, domain] = match.split('@');
      return local[0] + redactChar.repeat(local.length - 1) + '@' + domain;
    });

    // Redact SSN
    sanitized = sanitized.replace(PATTERNS.ssn, () => 
      redactChar.repeat(3) + '-' + redactChar.repeat(2) + '-' + redactChar.repeat(4)
    );

    // Redact credit cards
    sanitized = sanitized.replace(PATTERNS.creditCard, (match) => {
      const cleaned = match.replace(/[\s-]/g, '');
      const lastFour = cleaned.slice(-4);
      return redactChar.repeat(12) + lastFour;
    });

    // Redact phone numbers
    sanitized = sanitized.replace(PATTERNS.phone, () => 
      redactChar.repeat(3) + '-' + redactChar.repeat(3) + '-' + redactChar.repeat(4)
    );

    // Redact API keys
    sanitized = sanitized.replace(PATTERNS.apiKey, (match) => {
      const prefix = match.substring(0, preserve);
      return prefix + redactChar.repeat(Math.max(match.length - preserve * 2, 10)) + '...';
    });

    // Redact passwords
    sanitized = sanitized.replace(PATTERNS.password, (match) => {
      const parts = match.split(/[\s:=]+/);
      return parts[0] + ': ' + redactChar.repeat(8);
    });

    return sanitized;
  }

  // ============================================
  // AUDIT LOGGING - Track security events
  // ============================================

  const auditLog = [];
  const MAX_AUDIT_ENTRIES = 1000;

  function logSecurityEvent(event) {
    const entry = {
      timestamp: Date.now(),
      type: event.type,
      details: event.details,
      severity: event.severity || 'info'
    };

    auditLog.unshift(entry);
    
    // Keep only recent entries
    if (auditLog.length > MAX_AUDIT_ENTRIES) {
      auditLog.splice(MAX_AUDIT_ENTRIES);
    }

    // Log high severity events
    if (entry.severity === 'high' || entry.severity === 'critical') {
      console.warn('[Security Audit]', entry);
    }
  }

  function getAuditLog(options = {}) {
    const limit = options.limit || 100;
    const severity = options.severity;

    let filtered = auditLog;
    if (severity) {
      filtered = auditLog.filter(e => e.severity === severity);
    }

    return filtered.slice(0, limit);
  }

  // ============================================
  // PUBLIC API
  // ============================================

  return {
    // Encryption
    encrypt,
    decrypt,
    saveApiKey,
    getApiKey,

    // Rate limiting
    RateLimiter,
    rateLimiters,

    // Sanitization
    detectSensitiveData,
    sanitize,

    // Audit
    logSecurityEvent,
    getAuditLog
  };
})();

// Export to window for content script access
if (typeof window !== 'undefined') {
  window.ChatBridgeSecurity = ChatBridgeSecurity;
}
