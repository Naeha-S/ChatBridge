// background.js

// Import security, RAG and MCP modules (using importScripts for service worker)
try {
  // Note: Service workers in MV3 support ES modules if manifest sets "type": "module"
  // We'll use dynamic import for these modules
  importScripts('security.js', 'ragEngine.js', 'mcpBridge.js');
  console.log('[ChatBridge] Security, RAG and MCP modules loaded in background');
} catch (e) {
  console.warn('[ChatBridge] Could not load modules:', e);
}

// Initialize rate limiters
const rateLimiters = {
  gemini: { maxPerMinute: 10, maxPerHour: 100, requests: [] },
  scan: { maxPerMinute: 5, maxPerHour: 50, requests: [] }
};

function checkRateLimit(limiter) {
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;
  const oneHourAgo = now - 60 * 60 * 1000;

  limiter.requests = limiter.requests.filter(t => t > oneHourAgo);

  const lastMinute = limiter.requests.filter(t => t > oneMinuteAgo).length;
  const lastHour = limiter.requests.length;

  if (lastMinute >= limiter.maxPerMinute) {
    return { allowed: false, reason: 'rate_limit_minute', retryAfter: 60 };
  }

  if (lastHour >= limiter.maxPerHour) {
    return { allowed: false, reason: 'rate_limit_hour', retryAfter: 3600 };
  }

  return { allowed: true };
}

function recordRequest(limiter) {
  limiter.requests.push(Date.now());
}

// Gemini model priority: Best to worst based on rate limits
const GEMINI_MODEL_PRIORITY = [
  'gemini-2.5-pro',           // Best quality, 2 RPM
  'gemini-2.0-flash',         // 15 RPM, 1M TPM
  'gemini-2.5-flash',         // 10 RPM, 250K TPM
  'gemini-2.5-flash-lite',    // 15 RPM, 250K TPM
  'gemini-2.0-flash-exp'      // Experimental, 50 RPD
];

let currentModelIndex = 0; // Track which model we're using
let modelFailureCount = {}; // Track failures per model
const MAX_MODEL_FAILURES = 3; // Switch models after 3 consecutive failures

// Centralized rewrite templates map
// Safe, meaning-preserving prompts. No detector evasion or academic-integrity bypass.
const REWRITE_TEMPLATES = {
  normal: ({ text }) => `Rewrite this text to be clearer and more professional while preserving meaning and intent. Avoid changing facts or adding new claims. Output ONLY the rewritten text. Do not add summaries, headers, introductions, or explanations.\n\n${text}`,
  concise: ({ text }) => `Rewrite the following text to be concise and to-the-point. Remove redundancy and filler. Preserve meaning and essential context. Output ONLY the rewritten text. Do not add summaries, headers, or extra commentary.\n\n${text}`,
  direct: ({ text }) => `Rewrite the following text to be direct and straightforward. Use active voice and clear wording, keeping the original meaning unchanged. Output ONLY the rewritten text. No summaries, no headers.\n\n${text}`,
  detailed: ({ text }) => `Rewrite the following text to be more detailed and comprehensive. Clarify ambiguities, add structure, and preserve factual content. Output ONLY the rewritten text with added detail. No summaries or headers.\n\n${text}`,
  academic: ({ text }) => `Rewrite the following text in a formal, academic tone. Use precise terminology and structured paragraphs. Do not fabricate sources or citations. Preserve meaning. Output ONLY the rewritten text. No summaries.\n\n${text}`,
  humanized: ({ text, styleHint }) => `Rewrite the text in a Humanized Paraphrased style. Goals:\n- Natural, conversational voice (never robotic)\n- Smooth, deliberate transitions between ideas\n- Varied sentence lengths and cadence; avoid repetitive phrasing\n- Preserve meaning, facts, and nuance exactly (no additions)\n- Keep markdown intact; do not alter fenced/inline code, formulas, identifiers, or URLs\n- Keep length roughly similar; do not compress or expand unnaturally\nOutput ONLY the rewritten text. No summaries, no headers, no explanations.\n\nText to rewrite:\n\n${text}`,
  creative: ({ text }) => `Rewrite the following text with light stylistic flair and engaging phrasing, without changing meaning, claims, or facts. Keep it tasteful and clear. Output ONLY the rewritten text. No summaries or headers.\n\n${text}`,
  professional: ({ text }) => `Rewrite the following text in a polished, professional tone suitable for workplace communication. Keep it respectful, clear, and accurate. Output ONLY the rewritten text. No summaries.\n\n${text}`,
  simple: ({ text }) => `Rewrite the following text in simple, easy-to-read language. Reduce complexity while preserving important details and meaning. Output ONLY the rewritten text. No headers or summaries.\n\n${text}`,
  friendly: ({ text }) => `Rewrite the following text in a friendly, warm tone while remaining clear and respectful. Keep the original meaning intact. Output ONLY the rewritten text. No summaries or headers.\n\n${text}`,
  customStyle: ({ text, styleHint = '' }) => `Rewrite the following text in this personalized style: "${(styleHint || '').slice(0, 160)}". Maintain original meaning and facts. Do not use detector-evasion tricks or academic-integrity violations. Output ONLY the rewritten text. No summaries or headers.\n\n${text}`
};

// Get next available model, skipping those with too many failures
function getNextAvailableModel() {
  for (let i = 0; i < GEMINI_MODEL_PRIORITY.length; i++) {
    const idx = (currentModelIndex + i) % GEMINI_MODEL_PRIORITY.length;
    const model = GEMINI_MODEL_PRIORITY[idx];
    if ((modelFailureCount[model] || 0) < MAX_MODEL_FAILURES) {
      currentModelIndex = idx;
      return model;
    }
  }
  // All models have failures, reset and try again
  modelFailureCount = {};
  currentModelIndex = 0;
  return GEMINI_MODEL_PRIORITY[0];
}

// Mark model as failed and switch to next
function markModelFailed(model, statusCode) {
  modelFailureCount[model] = (modelFailureCount[model] || 0) + 1;
  console.warn(`[Gemini] Model ${model} failed (${modelFailureCount[model]}/${MAX_MODEL_FAILURES})`, statusCode);
  if (modelFailureCount[model] >= MAX_MODEL_FAILURES) {
    console.warn(`[Gemini] Switching from ${model} due to repeated failures`);
    currentModelIndex = (currentModelIndex + 1) % GEMINI_MODEL_PRIORITY.length;
  }
}

// Mark model as successful, reset failure count
function markModelSuccess(model) {
  if (modelFailureCount[model]) {
    modelFailureCount[model] = 0;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("ChatBridge installed/updated");

  // Initialize MCP Bridge in background
  try {
    if (typeof window.MCPBridge !== 'undefined') {
      window.MCPBridge.init();
      console.log('[ChatBridge] MCP Bridge initialized in background');
    }
  } catch (e) {
    console.error('[ChatBridge] Failed to initialize MCP:', e);
  }
});

// Migration endpoint: content script can send stored conversations to background for persistent storage
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  // CLOUDFLARE FIX: Proxy fetch requests through background to avoid triggering security
  if (msg.type === 'fetch_blob') {
    (async () => {
      try {
        const url = msg.url;
        if (!url) {
          sendResponse({ ok: false, error: 'No URL provided' });
          return;
        }

        // Fetch through background script (has broader permissions and doesn't trigger Cloudflare)
        const res = await fetch(url, {
          mode: 'cors',
          credentials: 'omit', // Don't send cookies to avoid CORS issues
          cache: 'default'
        });

        if (!res.ok) {
          sendResponse({ ok: false, error: `HTTP ${res.status}` });
          return;
        }

        const blob = await res.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({
            ok: true,
            data: reader.result, // base64 data URL
            type: blob.type,
            size: blob.size
          });
        };
        reader.onerror = () => {
          sendResponse({ ok: false, error: 'Failed to read blob' });
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true; // Keep channel open for async response
  }

  if (msg.type === 'migrate_conversations') {
    (async () => {
      try {
        const convs = Array.isArray(msg.payload && msg.payload.conversations) ? msg.payload.conversations : [];
        let count = 0;
        for (const c of convs) {
          try {
            const id = String(c.ts || c.id || Date.now());
            const obj = Object.assign({ id }, c);
            const ok = await convoPut(obj);
            if (ok) count++;
          } catch (e) { /* continue */ }
        }
        sendResponse({ ok: true, migrated: count });
      } catch (e) { sendResponse({ ok: false, error: e && e.message }); }
    })();
    return true;
  }

  if (msg.type === 'report_issue') {
    // simple logging; background can forward to a server if configured
    try { console.warn('REPORT_ISSUE', msg.payload || {}); } catch (e) { }
    sendResponse({ ok: true });
    return true;
  }
});

// OPTIMIZATION: Precompute embeddings during idle time with batching and throttling
// This runs ONLY when the browser is idle to avoid impacting user experience
async function precomputeEmbeddingsIdle(batch = 3) {
  try {
    const convs = await convoAll();
    if (!convs || !convs.length) return;
    let processed = 0;
    for (const c of convs) {
      if (processed >= batch) break;
      try {
        const id = String(c.ts || c.id || Date.now());
        const existing = await idbGet(id);
        if (existing && existing.vector && existing.vector.length) continue;
        const text = (c.conversation || []).map(m => `${m.role}: ${m.text}`).join('\n\n');
        if (!text || text.length < 30) continue;
        const emb = await fetchEmbeddingOpenAI(text);
        if (emb && Array.isArray(emb)) {
          await idbPut({ id, vector: emb, metadata: { platform: c.platform || '', url: c.url || '', ts: c.ts || 0, topics: c.topics || [] }, ts: Date.now() });
          processed++;
        }
        // OPTIMIZATION: Small delay to avoid CPU burst even during idle
        await new Promise(r => setTimeout(r, 300)); // Increased from 200ms to 300ms
      } catch (e) { /* ignore per-item */ }
    }
    if (processed) console.log('[ChatBridge] precomputed embeddings for', processed, 'conversations during idle');
  } catch (e) { console.warn('precomputeEmbeddingsIdle err', e); }
}

// OPTIMIZATION: Use chrome.idle API to trigger background tasks only when truly idle
// This prevents CPU usage when user is actively working
if (chrome.idle && chrome.idle.onStateChanged) {
  chrome.idle.setDetectionInterval(300); // Consider idle after 5 minutes
  chrome.idle.onStateChanged.addListener((state) => {
    try {
      if (state === 'idle') {
        // User is idle - safe to do background work
        precomputeEmbeddingsIdle(3); // Reduced batch from 4 to 3
      }
      // When state === 'active' or 'locked', do nothing to save CPU
    } catch (e) { }
  });
}

// OPTIMIZATION: Reduce alarm frequency from 30min to 60min to lower background activity
// Also create a periodic alarm to attempt precompute (background service workers may be stopped)
try {
  if (chrome.alarms) {
    chrome.alarms.create('chatbridge_precompute', { periodInMinutes: 60 }); // Increased from 30 to 60
    chrome.alarms.onAlarm.addListener((alarm) => {
      try { if (alarm && alarm.name === 'chatbridge_precompute') precomputeEmbeddingsIdle(2); } catch (e) { }
    });
  }
} catch (e) { }

// clean cache periodically
// OPTIMIZATION: Reduce cache cleanup frequency to lower background CPU usage
// Changed from every 10 minutes to every 30 minutes
try { setInterval(() => { cacheCleanExpired(); }, 1000 * 60 * 30); } catch (e) { } // Increased from 10 to 30
// Simple IndexedDB vector store (fallback to in-memory on failure)
const V_DB_NAME = 'chatbridge_vectors_v1';
const V_STORE = 'vectors';
let idb = null;

// Cache DB for API responses
const C_DB_NAME = 'chatbridge_cache_v1';
const C_STORE = 'cache';
let cacheDb = null;

// Conversations DB for large storage
const CONV_DB_NAME = 'chatbridge_conversations_v1';
const CONV_STORE = 'conversations';
let convDb = null;
function openVectorDB() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(V_DB_NAME, 1);
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        try { db.createObjectStore(V_STORE, { keyPath: 'id' }); } catch (e) { }
      };
      req.onsuccess = (ev) => { idb = ev.target.result; resolve(idb); };
      req.onerror = (ev) => { console.warn('IndexedDB open failed', ev); resolve(null); };
    } catch (e) { console.warn('openVectorDB err', e); resolve(null); }
  });
}

function openCacheDB() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(C_DB_NAME, 1);
      req.onupgradeneeded = (ev) => {
        try { ev.target.result.createObjectStore(C_STORE, { keyPath: 'id' }); } catch (e) { }
      };
      req.onsuccess = (ev) => { cacheDb = ev.target.result; resolve(cacheDb); };
      req.onerror = () => { cacheDb = null; resolve(null); };
    } catch (e) { cacheDb = null; resolve(null); }
  });
}

function openConvoDB() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(CONV_DB_NAME, 1);
      req.onupgradeneeded = (ev) => {
        try { ev.target.result.createObjectStore(CONV_STORE, { keyPath: 'id' }); } catch (e) { }
      };
      req.onsuccess = (ev) => { convDb = ev.target.result; resolve(convDb); };
      req.onerror = () => { convDb = null; resolve(null); };
    } catch (e) { convDb = null; resolve(null); }
  });
}

async function idbPut(obj) {
  try {
    if (!idb) await openVectorDB();
    if (!idb) return false;
    return await new Promise((res) => {
      const tx = idb.transaction([V_STORE], 'readwrite');
      const st = tx.objectStore(V_STORE);
      const req = st.put(obj);
      req.onsuccess = () => res(true);
      req.onerror = () => res(false);
    });
  } catch (e) { return false; }
}

async function idbAll() {
  try {
    if (!idb) await openVectorDB();
    if (!idb) return [];
    return await new Promise((res) => {
      const tx = idb.transaction([V_STORE], 'readonly');
      const st = tx.objectStore(V_STORE);
      const req = st.getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => res([]);
    });
  } catch (e) { return []; }
}

async function idbGet(id) {
  try {
    if (!idb) await openVectorDB();
    if (!idb) return null;
    return await new Promise((res) => {
      const tx = idb.transaction([V_STORE], 'readonly');
      const st = tx.objectStore(V_STORE);
      const req = st.get(id);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => res(null);
    });
  } catch (e) { return null; }
}

// Cache helpers
async function cachePut(obj) {
  try {
    if (!cacheDb) await openCacheDB();
    if (!cacheDb) return false;
    return await new Promise((res) => {
      const tx = cacheDb.transaction([C_STORE], 'readwrite');
      const st = tx.objectStore(C_STORE);
      const req = st.put(obj);
      req.onsuccess = () => res(true);
      req.onerror = () => res(false);
    });
  } catch (e) { return false; }
}

async function cacheGet(id) {
  try {
    if (!cacheDb) await openCacheDB();
    if (!cacheDb) return null;
    return await new Promise((res) => {
      const tx = cacheDb.transaction([C_STORE], 'readonly');
      const st = tx.objectStore(C_STORE);
      const req = st.get(id);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => res(null);
    });
  } catch (e) { return null; }
}

// Clean expired cache entries older than their ttl
async function cacheCleanExpired() {
  try {
    if (!cacheDb) await openCacheDB();
    if (!cacheDb) return;
    const tx = cacheDb.transaction([C_STORE], 'readwrite');
    const st = tx.objectStore(C_STORE);
    const req = st.openCursor();
    req.onsuccess = (ev) => {
      const cur = ev.target.result;
      if (!cur) return;
      const rec = cur.value;
      if (rec && rec.ts && rec.ttl && (Date.now() - rec.ts) > rec.ttl) {
        try { cur.delete(); } catch (e) { }
      }
      cur.continue();
    };
  } catch (e) { /* ignore */ }
}

// Conversation DB helpers
async function convoPut(obj) {
  try {
    if (!convDb) await openConvoDB();
    if (!convDb) return false;
    return await new Promise((res) => {
      const tx = convDb.transaction([CONV_STORE], 'readwrite');
      const st = tx.objectStore(CONV_STORE);
      const req = st.put(obj);
      req.onsuccess = () => res(true);
      req.onerror = () => res(false);
    });
  } catch (e) { return false; }
}

async function convoAll() {
  try {
    if (!convDb) await openConvoDB();
    if (!convDb) return [];
    return await new Promise((res) => {
      const tx = convDb.transaction([CONV_STORE], 'readonly');
      const st = tx.objectStore(CONV_STORE);
      const req = st.getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => res([]);
    });
  } catch (e) { return []; }
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0; return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// stable JSON stringify that sorts object keys (simple recursive)
function stableStringify(obj) {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  let out = '{';
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]; out += JSON.stringify(k) + ':' + stableStringify(obj[k]);
    if (i < keys.length - 1) out += ',';
  }
  out += '}';
  return out;
}

function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) + h) + s.charCodeAt(i); h = h & 0xffffffff; }
  return 'h' + (h >>> 0).toString(16);
}

// --- Key & Config Utilities -------------------------------------------------
// Lightweight cached accessor for the Gemini API key stored in chrome.storage.local
// This avoids repeated storage lookups across frequent background calls.
let __cbGeminiKeyCache = { value: null, ts: 0 };
// WARNING: Hardcoding your API key exposes it if you share this code. Proceed intentionally.
// If you insist on hardcoding, set your key below. It will be used as a fallback when no key is set in Options.
const DEV_HARDCODED_GEMINI_KEY = 'AIzaSyDH7q1lOI8grDht1H-WHNtsyptIiSrgogQ';
/**
 * Get the Gemini API key from chrome.storage.local with a short-lived cache.
 * Never reads from .env (extensions cannot access it); Options page must set the key.
 * @param {{force?: boolean}} [opts]
 * @returns {Promise<string|null>} key or null if not configured
 */
async function getGeminiApiKey(opts) {
  const force = !!(opts && opts.force);
  const now = Date.now();
  if (!force && __cbGeminiKeyCache.value && (now - __cbGeminiKeyCache.ts) < 60_000) {
    return __cbGeminiKeyCache.value;
  }
  try {
    let key = await new Promise(r => chrome.storage.local.get(['chatbridge_gemini_key'], d => r(d && d.chatbridge_gemini_key)));
    // Fallback to hardcoded key if nothing found in storage
    if (!key && DEV_HARDCODED_GEMINI_KEY) key = DEV_HARDCODED_GEMINI_KEY;
    __cbGeminiKeyCache = { value: key || null, ts: now };
    return __cbGeminiKeyCache.value;
  } catch (_) {
    // On storage error, still attempt to use hardcoded key if present
    if (DEV_HARDCODED_GEMINI_KEY) {
      __cbGeminiKeyCache = { value: DEV_HARDCODED_GEMINI_KEY, ts: now };
      return DEV_HARDCODED_GEMINI_KEY;
    }
    return null;
  }
}

// OpenAI API key getter with cache (for EchoSynth)
const __cbOpenAIKeyCache = { value: null, ts: 0 };
const DEV_HARDCODED_OPENAI_KEY = 'sk-1234efgh5678ijkl1234efgh5678ijkl1234efg'; // SECURITY NOTE: For development/demo only. Store in chrome.storage for production.

async function getOpenAIApiKey(opts) {
  const force = !!(opts && opts.force);
  const now = Date.now();
  if (!force && __cbOpenAIKeyCache.value && (now - __cbOpenAIKeyCache.ts) < 60_000) {
    return __cbOpenAIKeyCache.value;
  }
  try {
    let key = await new Promise(r => chrome.storage.local.get(['chatbridge_openai_key'], d => r(d && d.chatbridge_openai_key)));
    // Fallback to hardcoded key if nothing found in storage
    if (!key && DEV_HARDCODED_OPENAI_KEY) key = DEV_HARDCODED_OPENAI_KEY;
    __cbOpenAIKeyCache.value = key || null;
    __cbOpenAIKeyCache.ts = now;
    return __cbOpenAIKeyCache.value;
  } catch (_) {
    if (DEV_HARDCODED_OPENAI_KEY) {
      __cbOpenAIKeyCache.value = DEV_HARDCODED_OPENAI_KEY;
      __cbOpenAIKeyCache.ts = now;
      return DEV_HARDCODED_OPENAI_KEY;
    }
    return null;
  }
}

// HuggingFace API key getter with cache (for Llama rewrite/translate)
const __cbHuggingFaceKeyCache = { value: null, ts: 0 };
const DEV_HARDCODED_HF_KEY = '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'; // User's HuggingFace API key

async function getHuggingFaceApiKey(opts) {
  const force = !!(opts && opts.force);
  const now = Date.now();
  if (!force && __cbHuggingFaceKeyCache.value && (now - __cbHuggingFaceKeyCache.ts) < 60_000) {
    return __cbHuggingFaceKeyCache.value;
  }
  try {
    let key = await new Promise(r => chrome.storage.local.get(['chatbridge_hf_key'], d => r(d && d.chatbridge_hf_key)));
    // Fallback to hardcoded key if nothing found in storage
    if (!key && DEV_HARDCODED_HF_KEY) key = DEV_HARDCODED_HF_KEY;
    __cbHuggingFaceKeyCache.value = key || null;
    __cbHuggingFaceKeyCache.ts = now;
    return __cbHuggingFaceKeyCache.value;
  } catch (_) {
    if (DEV_HARDCODED_HF_KEY) {
      __cbHuggingFaceKeyCache.value = DEV_HARDCODED_HF_KEY;
      __cbHuggingFaceKeyCache.ts = now;
      return DEV_HARDCODED_HF_KEY;
    }
    return null;
  }
}

// Keep cache fresh when the key changes in Options
try {
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      try {
        if (area === 'local') {
          if (changes && changes.chatbridge_gemini_key) {
            __cbGeminiKeyCache = { value: changes.chatbridge_gemini_key.newValue || null, ts: Date.now() };
          }
          if (changes && changes.chatbridge_openai_key) {
            __cbOpenAIKeyCache.value = changes.chatbridge_openai_key.newValue || null;
            __cbOpenAIKeyCache.ts = Date.now();
          }
          if (changes && changes.chatbridge_hf_key) {
            __cbHuggingFaceKeyCache.value = changes.chatbridge_hf_key.newValue || null;
            __cbHuggingFaceKeyCache.ts = Date.now();
          }
        }
      } catch (_) { }
    });
  }
} catch (_) { }

// --- Config, Logger, Errors, Rate Limiter (lightweight, non-invasive) ------
/** @typedef {{ ratePerSec: number, maxBurst: number }} TokenBucketConfig */

const Config = (function () {
  const DEFAULTS = { ratePerSec: 1, maxBurst: 5, debug: false };
  let cache = { value: DEFAULTS, ts: 0 };
  async function _load() {
    try {
      const raw = await new Promise(r => chrome.storage.local.get(['chatbridge_config'], d => r(d && d.chatbridge_config)));
      const merged = Object.assign({}, DEFAULTS, raw || {});
      cache = { value: merged, ts: Date.now() };
    } catch (_) { cache = { value: DEFAULTS, ts: Date.now() }; }
    return cache.value;
  }
  return {
    /** @returns {Promise<typeof DEFAULTS>} */
    async getAll(force = false) { if (!force && (Date.now() - cache.ts) < 60_000) return cache.value; return _load(); },
    /** @returns {Promise<any>} */
    async get(key) { const c = await this.getAll(); return c[key]; },
    /** @param {Partial<typeof DEFAULTS>} partial */
    async set(partial) { try { const cur = await this.getAll(true); const next = Object.assign({}, cur, partial || {}); await new Promise(r => chrome.storage.local.set({ chatbridge_config: next }, r)); cache = { value: next, ts: Date.now() }; } catch (_) { } }
  };
})();

const Logger = (function () {
  let debugEnabled = false;
  (async () => { try { debugEnabled = !!(await Config.get('debug')); } catch (_) { } })();
  try {
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        try {
          if (area === 'local' && changes && changes.chatbridge_config) {
            const v = changes.chatbridge_config.newValue || {}; debugEnabled = !!v.debug;
          }
        } catch (_) { }
      });
    }
  } catch (_) { }
  function log(method, args) { try { console[method].apply(console, ['[ChatBridge]', ...args]); } catch (_) { } }
  return {
    debug: (...a) => { if (debugEnabled) log('debug', a); },
    info: (...a) => log('log', a),
    warn: (...a) => log('warn', a),
    error: (...a) => log('error', a)
  };
})();

function makeError(code, message, extra) { return Object.assign({ ok: false, error: String(code || 'error'), message: String(message || '') }, extra || {}); }

function createTokenBucket(cfg) {
  const rate = Math.max(0.1, Number(cfg && cfg.ratePerSec || 1));
  const burst = Math.max(1, Number(cfg && cfg.maxBurst || 5));
  let tokens = burst; let last = Date.now();
  return {
    try() { const now = Date.now(); const delta = (now - last) / 1000; last = now; tokens = Math.min(burst, tokens + delta * rate); if (tokens >= 1) { tokens -= 1; return true; } return false; },
    peek() { return tokens; }
  };
}

let RateLimiter = createTokenBucket({ ratePerSec: 1, maxBurst: 5 });
(async () => {
  try { const ratePerSec = await Config.get('ratePerSec'); const maxBurst = await Config.get('maxBurst'); RateLimiter = createTokenBucket({ ratePerSec, maxBurst }); } catch (_) { }
})();
try {
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      try {
        if (area === 'local' && changes && changes.chatbridge_config) {
          const v = changes.chatbridge_config.newValue || {}; RateLimiter = createTokenBucket({ ratePerSec: Number(v.ratePerSec) || 1, maxBurst: Number(v.maxBurst) || 5 });
        }
      } catch (_) { }
    });
  }
} catch (_) { }

// Route embedding computation to content script (local transformers.js)
async function getLocalEmbeddingViaContent(text) {
  const queryTabs = () => new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
  const sendToTab = (tabId) => new Promise(resolve => {
    try {
      chrome.tabs.sendMessage(tabId, { type: 'local_get_embedding', payload: { text } }, (res) => {
        if (chrome.runtime.lastError) return resolve(null);
        resolve(res && res.ok && Array.isArray(res.vector) ? res.vector : null);
      });
    } catch (_) { resolve(null); }
  });
  try {
    // Try active tab first
    const tabs = await queryTabs();
    if (tabs && tabs[0] && tabs[0].id) {
      const v = await sendToTab(tabs[0].id);
      if (v) return v;
    }
    // Fallback: try all tabs where content script may exist
    return await new Promise(resolve => {
      chrome.tabs.query({}, async (all) => {
        for (const t of all) {
          const v = await sendToTab(t.id);
          if (v) return resolve(v);
        }
        resolve(null);
      });
    });
  } catch (e) { return null; }
}

async function getLocalEmbeddingsBatchViaContent(texts) {
  const queryTabs = () => new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
  const sendToTab = (tabId) => new Promise(resolve => {
    try {
      chrome.tabs.sendMessage(tabId, { type: 'local_get_embeddings_batch', payload: { texts } }, (res) => {
        if (chrome.runtime.lastError) return resolve(null);
        resolve(res && res.ok && Array.isArray(res.vectors) ? res.vectors : null);
      });
    } catch (_) { resolve(null); }
  });
  try {
    const tabs = await queryTabs();
    if (tabs && tabs[0] && tabs[0].id) {
      const vs = await sendToTab(tabs[0].id);
      if (vs) return vs;
    }
    return await new Promise(resolve => {
      chrome.tabs.query({}, async (all) => {
        for (const t of all) {
          const vs = await sendToTab(t.id);
          if (vs) return resolve(vs);
        }
        resolve(null);
      });
    });
  } catch (e) { return null; }
}

// Fetch embedding (now local via content script)
async function fetchEmbeddingGemini(text) { return getLocalEmbeddingViaContent(text); }
async function fetchEmbeddingOpenAI(text) { return getLocalEmbeddingViaContent(text); }

// Message handlers for vector index / query
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  try {
    if (!msg || !msg.type) return;
    if (msg.type === 'vector_index') {
      (async () => {
        const payload = msg.payload || {};
        const id = String(payload.id || payload.ts || Date.now());
        const text = payload.text || '';
        const metadata = payload.metadata || {};
        if (!text) return sendResponse({ ok: false, error: 'no_text' });
        // Try to get embedding from payload first
        let embedding = payload.embedding || null;
        if (!embedding) {
          // try OpenAI embeddings
          embedding = await fetchEmbeddingOpenAI(text);
        }
        if (!embedding) return sendResponse({ ok: false, error: 'no_embedding' });
        const obj = { id, vector: embedding, metadata: metadata, ts: Date.now() };
        const ok = await idbPut(obj);
        return sendResponse({ ok: !!ok });
      })();
      return true;
    }

    if (msg.type === 'vector_query') {
      (async () => {
        const q = (msg.payload && msg.payload.query) ? msg.payload.query : '';
        const topK = (msg.payload && msg.payload.topK) ? Math.max(1, msg.payload.topK) : 6;
        if (!q) return sendResponse({ ok: false, error: 'no_query' });
        // get embedding for query
        const qemb = await fetchEmbeddingOpenAI(q);
        if (!qemb) return sendResponse({ ok: false, error: 'no_embedding' });
        const all = await idbAll();
        const scored = all.map(it => ({ id: it.id, score: cosine(qemb, it.vector || []), metadata: it.metadata || {} }));
        scored.sort((a, b) => b.score - a.score);
        const top = scored.slice(0, topK);
        return sendResponse({ ok: true, results: top });
      })();
      return true;
    }

    if (msg.type === 'vector_index_all') {
      (async () => {
        try {
          // load conversations from convo DB, payload, or fallback to chrome.storage.local
          const fromPayload = (msg.payload && Array.isArray(msg.payload.conversations)) ? msg.payload.conversations : null;
          let convs = [];
          if (fromPayload) convs = fromPayload;
          else {
            try { convs = await convoAll(); } catch (e) { convs = []; }
            if (!convs || !convs.length) {
              const data = await new Promise(r => chrome.storage.local.get(['chatbridge:conversations'], d => r(d['chatbridge:conversations'])));
              convs = Array.isArray(data) ? data : [];
            }
          }
          let indexed = 0;
          for (const c of convs) {
            try {
              const id = String(c.ts || Date.now());
              const text = (c.conversation || []).map(m => `${m.role}: ${m.text}`).join('\n\n');
              if (!text || text.trim().length < 20) continue;
              const emb = await fetchEmbeddingOpenAI(text);
              if (!emb) continue;
              const obj = { id, vector: emb, metadata: { platform: c.platform || '', url: c.url || '', ts: c.ts || 0, topics: c.topics || [] }, ts: Date.now() };
              await idbPut(obj);
              indexed++;
            } catch (e) { /* continue on per-item error */ }
          }
          return sendResponse({ ok: true, indexed });
        } catch (e) { return sendResponse({ ok: false, error: e && e.message }); }
      })();
      return true;
    }
  } catch (e) { /* ignore other messages here */ }
});

// Keyboard command listener - forwards commands to active tab
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'keyboard_command',
        command: command
      }, (response) => {
        // Ignore errors if content script not loaded on the page
        if (chrome.runtime.lastError) {
          console.log('Keyboard command not handled:', chrome.runtime.lastError.message);
        }
      });
    }
  });
});

// simple message handler for future hooks
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Handler to get latest conversation text
  if (msg && msg.type === 'get_latest_conversation') {
    chrome.storage.local.get(['chatbridge:conversations'], data => {
      const arr = Array.isArray(data['chatbridge:conversations']) ? data['chatbridge:conversations'] : [];
      if (!arr.length) return sendResponse({ text: '' });
      const sel = arr[0];
      const text = sel && sel.conversation ? sel.conversation.map(m => `${m.role}: ${m.text}`).join('\n') : '';
      sendResponse({ text });
    });
    return true;
  }

  // Handler to retrieve conversations from persistent DB (with fallback)
  if (msg && msg.type === 'get_conversations') {
    (async () => {
      try {
        // optional controls
        const limit = (msg.payload && typeof msg.payload.limit === 'number') ? msg.payload.limit : null;
        const offset = (msg.payload && typeof msg.payload.offset === 'number') ? Math.max(0, msg.payload.offset) : 0;
        let convs = [];
        try { convs = await convoAll(); } catch (e) { convs = []; }
        // Fallback to chrome.storage.local mirror if DB empty
        if (!convs || !convs.length) {
          const data = await new Promise(r => chrome.storage.local.get(['chatbridge:conversations'], d => r(d['chatbridge:conversations'])));
          convs = Array.isArray(data) ? data : [];
        }
        // Normalize id and sort newest first
        const norm = (convs || []).map(c => {
          const id = String(c.id || c.ts || Date.now());
          const ts = Number(c.ts || c.metadata && c.metadata.ts || Date.now());
          return Object.assign({ id, ts }, c);
        }).sort((a, b) => (b.ts || 0) - (a.ts || 0));
        const slice = (limit && limit > 0) ? norm.slice(offset, offset + limit) : (offset ? norm.slice(offset) : norm);
        sendResponse({ ok: true, conversations: slice, total: norm.length });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message });
      }
    })();
    return true;
  }

  // Handler to clear all conversations from persistent DB and mirror store
  if (msg && msg.type === 'clear_conversations') {
    (async () => {
      try {
        if (!convDb) await openConvoDB();
        if (convDb) {
          await new Promise((res) => {
            try {
              const tx = convDb.transaction([CONV_STORE], 'readwrite');
              const st = tx.objectStore(CONV_STORE);
              const req = st.clear();
              req.onsuccess = () => res(true);
              req.onerror = () => res(false);
            } catch (_) { res(false); }
          });
        }
        // Clear mirror
        try { chrome.storage.local.set({ 'chatbridge:conversations': [] }, () => { }); } catch (e) { }
        sendResponse({ ok: true });
      } catch (e) { sendResponse({ ok: false, error: e && e.message }); }
    })();
    return true;
  }

  // Handler to REPLACE all conversations with a new cleaned list
  if (msg && msg.type === 'replace_conversations') {
    (async () => {
      try {
        const newConvs = Array.isArray(msg.payload && msg.payload.conversations) ? msg.payload.conversations : [];
        console.log('[ChatBridge] Replacing conversations with', newConvs.length, 'cleaned items');

        // Clear the IndexedDB conversations store
        if (!convDb) await openConvoDB();
        if (convDb) {
          await new Promise((res) => {
            try {
              const tx = convDb.transaction([CONV_STORE], 'readwrite');
              const st = tx.objectStore(CONV_STORE);
              const req = st.clear();
              req.onsuccess = () => res(true);
              req.onerror = () => res(false);
            } catch (_) { res(false); }
          });
        }

        // Save the new conversations to IndexedDB
        for (const c of newConvs) {
          try {
            const id = String(c.ts || c.id || Date.now());
            const obj = Object.assign({ id }, c);
            await convoPut(obj);
          } catch (e) { /* continue */ }
        }

        // Update chrome.storage.local mirror
        try {
          await new Promise(r => chrome.storage.local.set({ 'chatbridge:conversations': newConvs }, r));
        } catch (e) { }

        console.log('[ChatBridge] Replaced conversations successfully');
        sendResponse({ ok: true, count: newConvs.length });
      } catch (e) {
        console.error('[ChatBridge] Replace conversations failed:', e);
        sendResponse({ ok: false, error: e && e.message });
      }
    })();
    return true;
  }

  // Handler to save a conversation from content script into conversation DB
  if (msg && msg.type === 'save_conversation') {
    (async () => {
      try {
        const conv = msg.payload || {};
        const id = String(conv.ts || conv.id || Date.now());
        const obj = Object.assign({ id }, conv);
        const ok = await convoPut(obj);
        // Mirror into chrome.storage.local array for backwards compatibility
        try {
          chrome.storage.local.get(['chatbridge:conversations'], data => {
            try {
              let arr = Array.isArray(data['chatbridge:conversations']) ? data['chatbridge:conversations'] : [];
              // Put newest first
              arr.unshift(obj);
              // MEMORY OPTIMIZATION: Keep max 50 conversations
              const MAX_CONVERSATIONS = 50;
              if (arr.length > MAX_CONVERSATIONS) {
                arr = arr.slice(0, MAX_CONVERSATIONS);
                console.log(`[ChatBridge] Trimmed conversations to ${MAX_CONVERSATIONS} (was ${arr.length})`);
              }
              chrome.storage.local.set({ 'chatbridge:conversations': arr });
            } catch (e) { /* ignore mirror errors */ }
          });
        } catch (e) { /* ignore */ }
        sendResponse({ ok: !!ok });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message });
      }
    })();
    return true;
  }

  // Handler to restore summary to chat input
  if (msg && msg.type === 'restore_summary') {
    chrome.tabs.sendMessage(sender.tab.id, {
      type: 'restore_to_chat',
      payload: { summary: msg.payload.summary }
    });
    sendResponse({ ok: true });
    return true;
  }
  if (msg && msg.type === 'ping') return sendResponse({ ok: true });

  // Built-in self-test (non-invasive unit checks) for quick validation via message
  if (msg && msg.type === 'self_test') {
    (async () => {
      const details = [];
      try {
        // hashString deterministic
        const h1 = hashString('abc'); const h2 = hashString('abc'); const h3 = hashString('abcd');
        details.push({ test: 'hashString deterministic', pass: h1 === h2 && h1 !== h3 });
        // cosine basics
        const c1 = cosine([1, 0], [1, 0]); const c2 = cosine([1, 0], [0, 1]);
        details.push({ test: 'cosine basics', pass: Math.abs(c1 - 1) < 1e-9 && Math.abs(c2 - 0) < 1e-9 });
        // rate limiter
        const rl = createTokenBucket({ ratePerSec: 100, maxBurst: 2 });
        const p = [rl.try(), rl.try(), rl.try()].map(Boolean); // 3rd likely false immediately
        details.push({ test: 'rate limiter burst', pass: p[0] === true && p[1] === true && p[2] === false });
        // config read
        const cfg = await Config.getAll();
        details.push({ test: 'config defaults', pass: typeof cfg.ratePerSec === 'number' && typeof cfg.maxBurst === 'number' });
        const allPass = details.every(d => d.pass);
        return sendResponse({ ok: allPass, details });
      } catch (e) {
        return sendResponse({ ok: false, error: 'self_test_failed', message: (e && e.message) || String(e), details });
      }
    })();
    return true;
  }

  // Embedding-based suggestion helper: return short multi-word suggestions
  if (msg && msg.type === 'embed_suggest') {
    (async () => {
      try {
        const payload = msg.payload || {};
        const text = (payload.text || '').trim();
        const topK = Math.max(1, payload.topK || 6);
        if (!text) return sendResponse({ ok: false, error: 'no_text' });

        // Try to get a query embedding first
        const qemb = await fetchEmbeddingOpenAI(text);

        // Fallback simple keyword extractor if no embedding available
        function extractLocalPhrases(src, maxPhrases = 80) {
          const s = (src || '').toLowerCase().replace(/["'`/\\()\[\]{}<>]/g, ' ');
          const words = s.split(/[^a-z0-9]+/).filter(Boolean);
          const stop = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'have', 'are', 'was', 'but', 'not', 'what', 'when', 'where', 'which', 'like', 'they', 'their', 'will', 'can', 'all', 'any', 'one', 'use', 'uses']);
          const grams = new Map();
          // prefer 2..4 grams
          for (let n = 2; n <= 4; n++) {
            for (let i = 0; i + n <= words.length; i++) {
              const g = words.slice(i, i + n).filter(w => !stop.has(w)).join(' ');
              if (!g || g.length < 3) continue;
              grams.set(g, (grams.get(g) || 0) + 1);
              if (grams.size > maxPhrases * 3) break;
            }
          }
          // rank by frequency then length
          const arr = Array.from(grams.entries()).map(([k, v]) => ({ phrase: k, count: v, words: k.split(' ').length }));
          arr.sort((a, b) => (b.count - a.count) || (b.words - a.words));
          return arr.slice(0, maxPhrases).map(x => x.phrase);
        }

        // If no embedding available, fallback to local extraction from latest conversations
        if (!qemb) {
          // load conversations
          const data = await new Promise(r => chrome.storage.local.get(['chatbridge:conversations'], d => r(d['chatbridge:conversations'])));
          const convs = Array.isArray(data) ? data : [];
          const joined = (convs.slice(0, 10).map(c => (c.conversation || []).map(m => m.text).join(' ')).join('\n\n')) || text;
          const phrases = extractLocalPhrases(joined, topK * 6).slice(0, topK * 2);
          // Provide basic confidence (frequency-based) when embeddings are unavailable
          const mapped = phrases.slice(0, topK).map((p, idx) => ({ phrase: p, confidence: Math.max(30, 80 - idx * 10) }));
          return sendResponse({ ok: true, suggestions: mapped });
        }

        // We have an embedding: find top similar indexed items
        const allVec = await idbAll();
        const scored = allVec.map(it => ({ id: it.id, score: cosine(qemb, it.vector || []), metadata: it.metadata || {}, text: '' }));
        scored.sort((a, b) => b.score - a.score);
        const topDocs = scored.slice(0, Math.min(12, scored.length));

        // Load stored conversations to extract candidate phrases
        const stored = await new Promise(r => chrome.storage.local.get(['chatbridge:conversations'], d => r(d['chatbridge:conversations'])));
        const convs = Array.isArray(stored) ? stored : [];

        // map id/ts to conversation text for quick lookup
        const convMap = new Map();
        for (const c of convs) {
          const id = String(c.ts || c.id || Date.now());
          const body = (c.conversation || []).map(m => m.text || '').join(' ');
          convMap.set(id, body);
        }

        // Build phrase candidates from top docs
        const candidateCounts = new Map();
        function addCandidatesFromText(t) {
          if (!t || typeof t !== 'string') return;
          const s = t.toLowerCase().replace(/["'`/\\()\[\]{}<>]/g, ' ');
          const words = s.split(/[^a-z0-9]+/).filter(Boolean);
          const stop = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'you', 'have', 'are', 'was', 'but', 'not', 'what', 'when', 'where', 'which', 'like', 'they', 'their', 'will', 'can', 'all', 'any', 'one', 'use', 'uses', 'about', 'there', 'been']);
          for (let n = 2; n <= 4; n++) {
            for (let i = 0; i + n <= words.length; i++) {
              const arr = words.slice(i, i + n);
              if (arr.some(w => stop.has(w))) continue;
              const phrase = arr.join(' ');
              if (phrase.length < 4) continue;
              candidateCounts.set(phrase, (candidateCounts.get(phrase) || 0) + 1);
              if (candidateCounts.size > 300) break;
            }
            if (candidateCounts.size > 300) break;
          }
        }

        for (const d of topDocs) {
          const id = String(d.id || d.metadata && d.metadata.ts || '');
          const textBody = convMap.get(id) || d.metadata && d.metadata.title || '';
          if (textBody) addCandidatesFromText(textBody);
        }

        // if still empty, add from the original query text
        if (candidateCounts.size === 0) addCandidatesFromText(text);

        // Convert candidates to array and keep top N by count
        const candidates = Array.from(candidateCounts.entries()).map(([p, c]) => ({ phrase: p, count: c, words: p.split(' ').length }));
        candidates.sort((a, b) => (b.count - a.count) || (b.words - a.words));
        const topCandidates = candidates.slice(0, 120).map(c => c.phrase);

        // Request embeddings for candidate phrases in batches to compute semantic similarity
        async function fetchEmbeddingBatch(texts) {
          const vs = await getLocalEmbeddingsBatchViaContent(texts);
          if (vs && Array.isArray(vs)) return vs;
          // fallback: sequential local calls
          const arr = [];
          for (const t of texts) { arr.push(await fetchEmbeddingGemini(t)); }
          return arr;
        }

        const chunkSize = 32;
        const phraseEmbs = [];

        // First, check IndexedDB for cached phrase embeddings to avoid repeated API calls
        const ids = topCandidates.map(p => 'phrase:' + encodeURIComponent(p));
        const existingPromises = ids.map(id => idbGet(id));
        const existingResults = await Promise.all(existingPromises);
        const toFetch = [];
        for (let i = 0; i < topCandidates.length; i++) {
          const rec = existingResults[i];
          if (rec && rec.vector && Array.isArray(rec.vector)) {
            phraseEmbs.push({ phrase: topCandidates[i], emb: rec.vector });
          } else {
            toFetch.push(topCandidates[i]);
          }
        }

        // Batch fetch embeddings only for phrases missing in the cache
        for (let i = 0; i < toFetch.length; i += chunkSize) {
          const batch = toFetch.slice(i, i + chunkSize);
          const embs = await fetchEmbeddingBatch(batch);
          if (!embs) {
            // if batch failed, stop trying further and continue with cached ones
            break;
          }
          for (let k = 0; k < batch.length; k++) {
            const ph = batch[k];
            const emb = embs[k];
            if (!emb) continue;
            // cache into IndexedDB for future use
            const pid = 'phrase:' + encodeURIComponent(ph);
            try {
              await idbPut({ id: pid, vector: emb, metadata: { type: 'phrase', text: ph }, ts: Date.now() });
            } catch (e) { /* ignore cache write errors */ }
            phraseEmbs.push({ phrase: ph, emb });
          }
        }

        // If we have no embeddings at all (no cache + API failed), fallback to local ranking
        if (!phraseEmbs.length) {
          const simple = topCandidates.slice(0, topK * 3).slice(0, topK).map((p, idx) => ({ phrase: p, confidence: Math.max(30, 70 - idx * 8) }));
          return sendResponse({ ok: true, suggestions: simple });
        }

        // compute similarity and combined score
        const maxCount = Math.max(...candidates.map(c => c.count), 1);
        const candidateMap = new Map(candidates.map(c => [c.phrase, c]));
        const scoredP = phraseEmbs.map(pe => {
          const sem = cosine(qemb, pe.emb || []);
          const meta = candidateMap.get(pe.phrase) || { count: 1, words: pe.phrase.split(' ').length };
          const freqScore = meta.count / maxCount; // 0..1
          const multiBoost = Math.min(0.2, (meta.words - 1) * 0.06); // prefer multi-word
          // combine: semantic heavy, then freq, then multiword
          const score = (0.72 * (sem || 0)) + (0.24 * freqScore) + (0.04 * multiBoost);
          return { phrase: pe.phrase, score, sem: sem || 0, freq: meta.count, words: meta.words };
        });
        scoredP.sort((a, b) => b.score - a.score);
        const uniques = [];
        const seen = new Set();
        for (const s of scoredP) {
          const p = s.phrase.replace(/\s+/g, ' ').trim();
          if (!p || seen.has(p)) continue;
          // prefer multi-word phrases and length reasonable
          if (p.split(' ').length === 1) continue; // skip unigrams
          if (p.length < 4) continue;
          seen.add(p);
          const confidence = Math.min(100, Math.round(s.score * 100));
          uniques.push({ phrase: p, confidence });
          if (uniques.length >= topK) break;
        }

        // final fallback: if not enough, add top local phrases
        if (uniques.length < topK) {
          const more = topCandidates
            .filter(p => !seen.has(p) && p.split(' ').length > 1)
            .slice(0, topK - uniques.length)
            .map((p, idx) => ({ phrase: p, confidence: Math.max(30, 60 - idx * 10) }));
          uniques.push(...more);
        }

        // Enforce minimum confidence threshold of 30%
        const final = uniques
          .filter(u => (typeof u.confidence === 'number' ? u.confidence >= 30 : true))
          .slice(0, topK);

        return sendResponse({ ok: true, suggestions: final });
      } catch (e) {
        return sendResponse({ ok: false, error: 'embed_suggest_error', message: (e && e.message) || String(e) });
      }
    })();
    return true;
  }

  // Open target URL in a new tab and restore text when ready
  if (msg && msg.type === 'open_and_restore') {
    const payload = msg.payload || {};
    const url = payload.url;
    const text = payload.text || '';
    const attachments = payload.attachments || [];
    if (!url || !text) { sendResponse && sendResponse({ ok: false, error: 'missing_params' }); return true; }
    try {
      chrome.tabs.create({ url }, (tab) => {
        if (!tab || !tab.id) { sendResponse && sendResponse({ ok: false, error: 'tab_create_failed' }); return; }
        const tabId = tab.id;
        let attempts = 0;
        const maxAttempts = 30; // ~15s total (increased from 6s)
        // Wait a bit longer before first attempt to let page start loading
        setTimeout(() => {
          const interval = setInterval(() => {
            attempts++;
            if (attempts > maxAttempts) {
              clearInterval(interval);
              sendResponse && sendResponse({ ok: false, error: 'restore_timeout' });
              return;
            }
            try {
              // Check if tab is still valid before sending message
              chrome.tabs.get(tabId, (tabInfo) => {
                if (chrome.runtime.lastError || !tabInfo) {
                  clearInterval(interval);
                  sendResponse && sendResponse({ ok: false, error: 'tab_not_found' });
                  return;
                }
                chrome.tabs.sendMessage(tabId, { type: 'restore_to_chat', payload: { text, attachments } }, (res) => {
                  if (chrome.runtime.lastError) {
                    // Content script might not be loaded yet; keep retrying
                    return;
                  }
                  // got a response – success
                  clearInterval(interval);
                  sendResponse && sendResponse({ ok: true });
                });
              });
            } catch (e) {
              // ignore and retry
            }
          }, 500);
        }, 1000); // Wait 1 second before starting to send messages
      });
    } catch (e) {
      sendResponse && sendResponse({ ok: false, error: e && e.message });
    }
    return true; // async
  }

  // rate limiter (token bucket)
  const limiterTry = () => RateLimiter.try();

  // Background handler for calling OpenAI (safe place to keep API keys)
  if (msg && msg.type === 'call_openai') {
    if (!limiterTry()) return sendResponse({ ok: false, error: 'rate_limited' });

    (async () => {
      try {
        const payload = msg.payload || {};
        const key = payload.apiKey || (await new Promise(r => chrome.storage.local.get(['chatbridge_api_key'], d => r(d.chatbridge_api_key))));
        const model = payload.model || 'gpt-4o-mini';
        const timeoutMs = (typeof payload.timeout === 'number') ? payload.timeout : 25000;
        if (!key) return sendResponse({ ok: false, error: 'no_api_key' });

        // Cache lookup (5 minute TTL)
        try {
          const cacheKey = hashString(stableStringify({ type: 'call_openai', model: model, messages: payload.messages || [] }));
          const rec = await cacheGet(cacheKey);
          if (rec && rec.ts && rec.ttl && (Date.now() - rec.ts) < rec.ttl && rec.response) {
            return sendResponse(rec.response);
          }
        } catch (e) { /* ignore cache errors */ }

        // retry/backoff parameters
        const maxAttempts = 3; let attempt = 0; let lastErr = null;
        while (attempt < maxAttempts) {
          attempt += 1;
          try {
            const controller = new AbortController();
            const to = setTimeout(() => controller.abort(), timeoutMs);
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
              body: JSON.stringify({ model, messages: payload.messages || [] }),
              signal: controller.signal
            });
            clearTimeout(to);
            const json = await (async () => { const t = await res.text(); try { return JSON.parse(t); } catch (e) { return { raw: t }; } })();
            if (!res.ok) {
              lastErr = { status: res.status, body: json };
              // retry on 5xx
              if (res.status >= 500 && attempt < maxAttempts) { await new Promise(r => setTimeout(r, 300 * attempt)); continue; }
              return sendResponse({ ok: false, error: 'http_error', status: res.status, body: json });
            }
            // extract assistant text safely
            const assistant = (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';
            // cache successful response (5min TTL)
            try {
              const cacheKey = hashString(stableStringify({ type: 'call_openai', model: model, messages: payload.messages || [] }));
              await cachePut({ id: cacheKey, ts: Date.now(), ttl: 1000 * 60 * 5, response: { ok: true, assistant } });
              cacheCleanExpired();
            } catch (e) { /* ignore cache write errors */ }
            return sendResponse({ ok: true, assistant: assistant });
          } catch (e) {
            lastErr = e;
            if (e && e.name === 'AbortError') return sendResponse({ ok: false, error: 'timeout' });
            // transient network error -> backoff and retry
            if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 200 * attempt));
          }
        }
        return sendResponse({ ok: false, error: 'failed', detail: lastErr });
      } catch (e) {
        return sendResponse({ ok: false, error: 'fetch_error', message: (e && e.message) || String(e) });
      }
    })();
    // indicate we'll respond asynchronously
    return true;
  }

  // OpenAI API handler for EchoSynth multi-AI synthesis
  if (msg && msg.type === 'call_openai') {
    if (!limiterTry()) return sendResponse({ ok: false, error: 'rate_limited' });
    (async () => {
      try {
        const OPENAI_API_KEY = await getOpenAIApiKey();
        if (!OPENAI_API_KEY) {
          return sendResponse({ ok: false, error: 'no_api_key', message: 'OpenAI API key not configured.' });
        }
        const payload = msg.payload || {};
        const promptText = payload.text || payload.prompt || '';

        // Check cache first
        try {
          const cacheKey = hashString(stableStringify({ type: 'call_openai', prompt: promptText }));
          const rec = await cacheGet(cacheKey);
          if (rec && rec.ts && rec.ttl && (Date.now() - rec.ts) < rec.ttl && rec.response) {
            return sendResponse(rec.response);
          }
        } catch (e) { /* ignore */ }

        const endpoint = 'https://api.openai.com/v1/chat/completions';
        const body = {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: promptText }],
          temperature: 0.7,
          max_tokens: 2000
        };

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          },
          body: JSON.stringify(body)
        });

        let json;
        try {
          const text = await res.text();
          json = text ? JSON.parse(text) : {};
        } catch (e) {
          console.error('[OpenAI API] Failed to parse response as JSON:', e);
          return sendResponse({ ok: false, error: 'openai_parse_error', message: 'Invalid JSON response', status: res.status });
        }

        if (!res.ok) {
          console.error('[OpenAI API Error]', res.status, json);
          return sendResponse({ ok: false, error: 'openai_http_error', status: res.status, body: json });
        }

        if (!json.choices || !Array.isArray(json.choices) || json.choices.length === 0) {
          console.error('[OpenAI API] No choices in response:', json);
          return sendResponse({ ok: false, error: 'openai_parse_error', message: 'No choices in response', body: json });
        }

        const result = json.choices[0].message?.content || '';

        // Cache successful result (5min TTL)
        try {
          const cacheKey = hashString(stableStringify({ type: 'call_openai', prompt: promptText }));
          await cachePut({ id: cacheKey, ts: Date.now(), ttl: 1000 * 60 * 5, response: { ok: true, result } });
          cacheCleanExpired();
        } catch (e) { /* ignore */ }

        return sendResponse({ ok: true, result });
      } catch (e) {
        return sendResponse({ ok: false, error: 'openai_fetch_error', message: (e && e.message) || String(e) });
      }
    })();
    return true;
  }

  // Gemini cloud API handler
  if (msg && msg.type === 'call_gemini') {
    // Check rate limit before processing
    const rateCheck = checkRateLimit(rateLimiters.gemini);
    if (!rateCheck.allowed) {
      return sendResponse({
        ok: false,
        error: 'rate_limited',
        message: `Rate limit exceeded. Try again in ${rateCheck.retryAfter} seconds.`,
        retryAfter: rateCheck.retryAfter
      });
    }

    if (!limiterTry()) return sendResponse({ ok: false, error: 'rate_limited' });
    (async () => {
      try {
        // Record the request
        recordRequest(rateLimiters.gemini);

        let geminiApiKey = await getGeminiApiKey();
        if (!geminiApiKey) {
          return sendResponse({ ok: false, error: 'no_api_key', message: 'Gemini API key not configured. Open ChatBridge Options to set it.' });
        }
        const payload = msg.payload || {};
        let promptText = '';
        let systemInstruction = ''; // Add system instruction for better outputs

        if (payload.action === 'prompt') {
          systemInstruction = 'You are an expert conversation analyst. Provide insightful, actionable analysis focusing on key patterns, decisions, and next steps.';
          promptText = `Analyze this conversation and provide helpful insights or suggestions:\n\n${payload.text}`;
        } else if (payload.action === 'summarize') {
          systemInstruction = 'You are an expert at creating clear, comprehensive summaries that preserve critical context and actionable details. Focus on accuracy and completeness.';
          // Use summary length/type if provided
          let opts = '';
          if (payload.length === 'comprehensive') {
            promptText = `Create a DETAILED, COMPREHENSIVE summary of this conversation that preserves ALL important context, topics, decisions, and nuances. This summary will be used by AI tools to continue the conversation seamlessly, so DO NOT omit any significant information. Include:
- All key topics and subtopics discussed in detail
- Important decisions, conclusions, or outcomes reached
- Any unresolved questions or pending items
- Technical details, code snippets, or specific terminology mentioned
- The flow and progression of the conversation with transitions
- Any user preferences, requirements, or constraints stated
- Context about what was attempted and what worked/failed

Make this summary as thorough as needed to capture the full context - prioritize completeness and clarity over brevity.\n\n${payload.text}`;
          } else {
            // Enforce formatting based on summaryType
            if (payload.summaryType === 'transfer') {
              // Optimized AI-to-AI handoff schema
              // The model should reconstruct identity, goals, relationships, causal links, status, and next actions.
              const lenHint = payload.length ? `Aim for a ${payload.length} length.` : '';
              promptText = `Generate a summary optimized for AI-to-AI context transfer. ${lenHint}

Follow this exact structure with section headers (do not add extra commentary outside sections):

1) Context Overview:
- Who the user is and their role, background, and working style. If not explicit, infer from the conversation. One to two sentences.

2) Ongoing Goals:
- Bullet list of the user's current long-term aims and recurring themes (e.g., building tools, content series, learning tracks). Keep each goal on one line.

3) Recent Topics (Chronological):
- 5–10 concise bullets describing what was discussed, in order. Include technical keywords and short details. Keep them brief.

4) Causal Links and Relationships:
- Explain how topics connect (e.g., “X led to Y because Z”). Mention dependencies, constraints, or design decisions.

5) Current Status:
- What is completed vs ongoing vs blocked. Use labels [done], [ongoing], [blocked].

6) Next Steps / Suggested Continuation:
- 3–6 concrete, actionable next steps for the next AI to continue. Be specific and reference the items above.

7) AI Handoff TL;DR:
- One paragraph the next AI can read to pick up immediately. Include the current task, constraints, and preferred tone/format.

Constraints:
- Preserve important technical details, terminology, and user intent.
- Prefer crisp, skimmable bullets. Keep narrative tone pragmatic, not verbose.
- If user identity/goals are unclear, sensibly infer from context and mark with (inferred).

Source conversation:
${payload.text}`;
            } else if (payload.summaryType === 'bullet') {
              promptText = `Summarize the following text as a bullet-point list. Use actual bullet points (•) or numbered list format. Each key point should be on its own line. ${payload.length ? `Keep it ${payload.length} in length.` : ''}\n\n${payload.text}`;
            } else if (payload.summaryType === 'executive') {
              promptText = `Create an executive summary of the following text: a high-level overview focusing on key decisions, outcomes, and actionable insights. ${payload.length ? `Length: ${payload.length}.` : ''}\n\n${payload.text}`;
            } else if (payload.summaryType === 'technical') {
              promptText = `Create a technical summary of the following text: focus on technical details, specifications, code snippets, and implementation notes. ${payload.length ? `Length: ${payload.length}.` : ''}\n\n${payload.text}`;
            } else if (payload.summaryType === 'detailed') {
              promptText = `Create a detailed summary of the following text with comprehensive coverage of all topics discussed. ${payload.length ? `Length: ${payload.length}.` : ''}\n\n${payload.text}`;
            } else {
              // paragraph format
              promptText = `Summarize this text as a clear, coherent paragraph. ${payload.length ? `Length: ${payload.length}.` : ''}\n\n${payload.text}`;
            }
          }
        } else if (payload.action === 'rewrite') {
          systemInstruction = 'You are a professional writing assistant. Rewrite text to match the requested style while preserving all important information and intent.';
          const styleKey = (payload.rewriteStyle || 'normal');
          const styleHint = payload.styleHint || payload.style || '';
          const builder = REWRITE_TEMPLATES[styleKey] || REWRITE_TEMPLATES.normal;
          promptText = builder({ text: payload.text || '', styleHint });
        } else if (payload.action === 'translate') {
          systemInstruction = 'You are a professional translator. Provide accurate, natural translations that preserve meaning, tone, and nuance. Output ONLY the translation.';
          promptText = `Translate the following text to ${payload.targetLang || 'English'}. Output ONLY the translated text with no explanations, notes, or additional commentary:\n\n${payload.text}`;
        } else if (payload.action === 'syncTone') {
          systemInstruction = 'You are an elite prompt engineer specialized in optimizing conversations for different AI models. Transform inputs to maximize output quality for the target model.';
          // Tone sync: prompt engineering for the target AI model
          const src = payload.sourceModel || 'SourceModel';
          const tgt = payload.targetModel || 'TargetModel';
          promptText = `You are an expert prompt engineer. Your task is to rewrite the following conversation so that it is optimally structured for ${tgt} to understand and respond with the highest quality output.

Instructions:
1. Rewrite the conversation to match ${tgt}'s expected input format and communication style
2. Optimize the prompts/questions to be clear, specific, and well-structured for ${tgt}
3. Ensure context is properly framed so ${tgt} has all necessary information
4. Adapt tone, phrasing, and structure to what works best with ${tgt}
5. Preserve all factual content and user intent from the original conversation
6. Keep the same conversation flow and message roles (user/assistant)
The goal is prompt engineering: transform this conversation into the ideal input format that will make ${tgt} produce the best possible responses.
Original conversation (currently optimized for ${src}):
${payload.text}

Rewritten conversation (optimized for ${tgt}):`;
        } else if (payload.action === 'custom') {
          // Custom prompt with optional system instruction and temperature
          systemInstruction = payload.systemInstruction || '';
          promptText = payload.prompt || payload.text || '';
        } else {
          promptText = payload.text || '';
        }
        // Before making network call, check cache for this prompt
        try {
          const cacheKey = hashString(stableStringify({ type: 'call_gemini', action: payload.action || 'unknown', prompt: promptText, length: payload.length || '', summaryType: payload.summaryType || '' }));
          const rec = await cacheGet(cacheKey);
          if (rec && rec.ts && rec.ttl && (Date.now() - rec.ts) < rec.ttl && rec.response) {
            return sendResponse(rec.response);
          }
        } catch (e) { /* ignore */ }
        geminiApiKey = await getGeminiApiKey();
        if (!geminiApiKey) {
          return sendResponse({ ok: false, error: 'no_api_key', message: 'Gemini API key not configured.' });
        }

        // Try models with fallback
        let lastError = null;
        const maxRetries = GEMINI_MODEL_PRIORITY.length;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          const currentModel = getNextAvailableModel();
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${geminiApiKey}`;
          const body = {
            systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
              temperature: payload.temperature !== undefined ? payload.temperature : 0.7,
              topP: payload.topP !== undefined ? payload.topP : 0.95,
              topK: 40,
              maxOutputTokens: 8192
            }
          };
          // Remove undefined fields
          if (!systemInstruction) delete body.systemInstruction;

          console.log(`[Gemini] Attempt ${attempt + 1}/${maxRetries} using model: ${currentModel}`);

          let res;
          try {
            res = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });
          } catch (fetchError) {
            console.error(`[Gemini] Fetch failed for ${currentModel}:`, fetchError);
            markModelFailed(currentModel, 'fetch_error');
            lastError = { model: currentModel, error: fetchError };
            continue; // Try next model
          }

          // Parse JSON response - handle both success and error responses
          let json;
          try {
            const text = await res.text();
            json = text ? JSON.parse(text) : {};
          } catch (e) {
            console.error(`[Gemini API] Failed to parse response as JSON for ${currentModel}:`, e);
            markModelFailed(currentModel, 'parse_error');
            lastError = { model: currentModel, error: e, status: res.status };
            continue; // Try next model
          }

          // Check if HTTP request was successful
          if (!res.ok) {
            const errorInfo = {
              400: 'Invalid request - check API key or model name',
              403: 'API key invalid or lacks permissions',
              429: 'Rate limit exceeded - switching to next model',
              500: 'Gemini API server error',
              503: 'Gemini API unavailable'
            }[res.status] || 'Unknown error';

            console.error(`[Gemini API Error] HTTP ${res.status} for ${currentModel}:`, json);
            console.error(`[Gemini API Error] ${errorInfo}`);

            // Rate limit (429) or server errors - try next model
            if (res.status === 429 || res.status >= 500) {
              markModelFailed(currentModel, res.status);
              lastError = { model: currentModel, status: res.status, body: json };
              continue; // Try next model
            }

            // Auth errors (400, 403) - don't retry, return immediately
            return sendResponse({
              ok: false,
              error: 'gemini_http_error',
              status: res.status,
              body: json,
              message: json.error?.message || errorInfo,
              model: currentModel
            });
          }

          // Validate response structure
          if (!json.candidates || !Array.isArray(json.candidates) || json.candidates.length === 0) {
            console.error(`[Gemini API] No candidates in response for ${currentModel}:`, json);
            markModelFailed(currentModel, 'no_candidates');
            lastError = { model: currentModel, error: 'no_candidates', body: json };
            continue; // Try next model
          }

          const candidate = json.candidates[0];
          if (!candidate || !candidate.content || !candidate.content.parts || !Array.isArray(candidate.content.parts) || candidate.content.parts.length === 0) {
            console.error(`[Gemini API] Invalid candidate structure for ${currentModel}:`, candidate);
            markModelFailed(currentModel, 'invalid_structure');
            lastError = { model: currentModel, error: 'invalid_structure', body: json };
            continue; // Try next model
          }

          // Check for finish reason (might be blocked, stopped, etc.)
          if (candidate.finishReason && candidate.finishReason !== 'STOP') {
            console.warn(`[Gemini API] Unexpected finish reason for ${currentModel}:`, candidate.finishReason);
            // Still try to extract text if available
          }

          const result = candidate.content.parts[0].text || '';

          // Success! Mark model as working
          markModelSuccess(currentModel);
          console.log(`[Gemini] ✓ Success with model: ${currentModel}`);

          // Cache successful result (5min TTL)
          try {
            const cacheKey = hashString(stableStringify({ type: 'call_gemini', action: payload.action || 'unknown', prompt: promptText, length: payload.length || '', summaryType: payload.summaryType || '' }));
            await cachePut({ id: cacheKey, ts: Date.now(), ttl: 1000 * 60 * 5, response: { ok: true, result, model: currentModel } });
            cacheCleanExpired();
          } catch (e) { /* ignore */ }

          return sendResponse({ ok: true, result, model: currentModel });
        }

        // All models failed, return last error
        console.error('[Gemini] All models failed, last error:', lastError);
        return sendResponse({
          ok: false,
          error: 'all_models_failed',
          message: 'All Gemini models exhausted. Please try again later.',
          lastError
        });
      } catch (e) {
        return sendResponse({ ok: false, error: 'gemini_fetch_error', message: (e && e.message) || String(e) });
      }
    })();
    return true;
  }

  // HuggingFace Llama 3.1 API handler (for rewrite/translate)
  if (msg && msg.type === 'call_llama') {
    if (!limiterTry()) return sendResponse({ ok: false, error: 'rate_limited' });
    (async () => {
      try {
        const HF_API_KEY = await getHuggingFaceApiKey();
        if (!HF_API_KEY) {
          return sendResponse({ ok: false, error: 'no_api_key', message: 'HuggingFace API key not configured.' });
        }

        const payload = msg.payload || {};
        const action = payload.action || 'rewrite';
        let promptText = '';

        // Build prompt based on action
        if (action === 'rewrite') {
          const styleKey = payload.rewriteStyle || 'normal';
          const styleHint = payload.styleHint || '';
          const styleInstructions = {
            normal: 'Rewrite this text to be clearer and more professional while preserving meaning.',
            concise: 'Rewrite to be concise and to-the-point. Remove redundancy.',
            direct: 'Rewrite to be direct and straightforward. Use active voice.',
            detailed: 'Rewrite to be more detailed and comprehensive.',
            academic: 'Rewrite in a formal, academic tone.',
            humanized: 'Rewrite in a natural, conversational voice.',
            creative: 'Rewrite with light stylistic flair and engaging phrasing.',
            professional: 'Rewrite in a polished, professional tone.',
            simple: 'Rewrite in simple, easy-to-read language.',
            friendly: 'Rewrite in a friendly, warm tone.'
          };
          const instruction = styleInstructions[styleKey] || styleInstructions.normal;
          promptText = `${instruction}${styleHint ? ` Style hint: ${styleHint}` : ''} Output ONLY the rewritten text with no explanations.\n\n${payload.text}`;
        } else if (action === 'translate') {
          const targetLang = payload.targetLang || 'English';
          promptText = `Translate the following text to ${targetLang}. Output ONLY the translated text with no explanations.\n\n${payload.text}`;
        } else if (action === 'generate' || action === 'prompt') {
          // Smart prompts / general generation - use text as-is
          promptText = payload.text || '';
        } else {
          promptText = payload.text || '';
        }

        // Call HuggingFace router API
        const endpoint = 'https://router.huggingface.co/v1/chat/completions';
        const body = {
          model: 'meta-llama/Llama-3.1-8B-Instruct:novita',
          messages: [{ role: 'user', content: promptText }],
          temperature: 0.7,
          max_tokens: 4096
        };

        console.log(`[Llama] Calling HuggingFace router for ${action}...`);

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${HF_API_KEY}`
          },
          body: JSON.stringify(body)
        });

        let json;
        try {
          const text = await res.text();
          json = text ? JSON.parse(text) : {};
        } catch (e) {
          console.error('[Llama API] Failed to parse response:', e);
          return sendResponse({ ok: false, error: 'llama_parse_error', message: 'Invalid JSON response' });
        }

        if (!res.ok) {
          console.error('[Llama API Error]', res.status, json);
          return sendResponse({ ok: false, error: 'llama_http_error', status: res.status, body: json });
        }

        if (!json.choices || !Array.isArray(json.choices) || json.choices.length === 0) {
          console.error('[Llama API] No choices in response:', json);
          return sendResponse({ ok: false, error: 'llama_no_choices', message: 'No response from model' });
        }

        const result = json.choices[0].message?.content || '';
        console.log(`[Llama] ✓ Success for ${action}: ${result.length} chars`);

        return sendResponse({ ok: true, result, model: 'llama-3.1-8b' });
      } catch (e) {
        console.error('[Llama API] Error:', e);
        return sendResponse({ ok: false, error: 'llama_fetch_error', message: (e && e.message) || String(e) });
      }
    })();
    return true;
  }

  if (msg && msg.type === 'translate_text') {
    if (!limiterTry()) return sendResponse({ ok: false, error: 'rate_limited' });
    (async () => {
      try {
        let geminiApiKey = await getGeminiApiKey();
        if (!geminiApiKey) return sendResponse({ ok: false, error: 'no_api_key', message: 'Gemini API key not configured.' });
        const promptText = msg.prompt || msg.text;
        let lastError = null;
        const maxRetries = GEMINI_MODEL_PRIORITY.length;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          const currentModel = getNextAvailableModel();
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${geminiApiKey}`;
          const body = {
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { temperature: 0.2, topP: 0.9, topK: 20, maxOutputTokens: 4096 }
          };

          try {
            const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const text = await res.text();
            let json = {};
            try { json = text ? JSON.parse(text) : {}; } catch (e) { markModelFailed(currentModel, 'parse_error'); lastError = e; continue; }

            if (!res.ok) { markModelFailed(currentModel, res.status); lastError = { status: res.status, body: json }; continue; }

            if (!json.candidates || !json.candidates[0] || !json.candidates[0].content || !json.candidates[0].content.parts || !json.candidates[0].content.parts[0]) {
              markModelFailed(currentModel, 'no_candidates'); lastError = 'no_candidates'; continue;
            }

            const result = json.candidates[0].content.parts[0].text || '';
            markModelSuccess(currentModel);
            return sendResponse({ ok: true, translated: result, model: currentModel });

          } catch (e) {
            markModelFailed(currentModel, 'fetch_error'); lastError = e;
          }
        }
        return sendResponse({ ok: false, error: 'all_models_failed', lastError });
      } catch (e) { return sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }

  if (msg && msg.type === 'summarize_for_translation') {
    if (!limiterTry()) return sendResponse({ ok: false, error: 'rate_limited' });
    (async () => {
      try {
        let geminiApiKey = await getGeminiApiKey();
        if (!geminiApiKey) return sendResponse({ ok: false, error: 'no_api_key', message: 'Gemini API key not configured.' });
        const promptText = msg.prompt || msg.text;
        let lastError = null;
        const maxRetries = GEMINI_MODEL_PRIORITY.length;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          const currentModel = getNextAvailableModel();
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${geminiApiKey}`;
          const body = {
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { temperature: 0.3, topP: 0.9, topK: 20, maxOutputTokens: 2048 }
          };

          try {
            const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const text = await res.text();
            let json = {};
            try { json = text ? JSON.parse(text) : {}; } catch (e) { markModelFailed(currentModel, 'parse_error'); lastError = e; continue; }

            if (!res.ok) { markModelFailed(currentModel, res.status); lastError = { status: res.status, body: json }; continue; }

            if (!json.candidates || !json.candidates[0] || !json.candidates[0].content || !json.candidates[0].content.parts || !json.candidates[0].content.parts[0]) {
              markModelFailed(currentModel, 'no_candidates'); lastError = 'no_candidates'; continue;
            }

            const result = json.candidates[0].content.parts[0].text || '';
            markModelSuccess(currentModel);
            return sendResponse({ ok: true, summary: result, model: currentModel });

          } catch (e) {
            markModelFailed(currentModel, 'fetch_error'); lastError = e;
          }
        }
        return sendResponse({ ok: false, error: 'all_models_failed', lastError });
      } catch (e) { return sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }

  // --- Rewriter Handlers --------------------------------------------------
  if (msg && (msg.type === 'rewrite_text' || msg.type === 'extract_meaning' || msg.type === 'structure_document' || msg.type === 'apply_style_document' || msg.type === 'chat_to_document')) {
    if (!limiterTry()) return sendResponse({ ok: false, error: 'rate_limited' });
    (async () => {
      try {
        let geminiApiKey = await getGeminiApiKey();
        if (!geminiApiKey) return sendResponse({ ok: false, error: 'no_api_key', message: 'Gemini API key not configured.' });

        // Local helper to call Gemini with model fallback
        async function geminiGenerate(systemInstruction, promptText) {
          let lastError = null;
          for (let attempt = 0; attempt < GEMINI_MODEL_PRIORITY.length; attempt++) {
            const currentModel = getNextAvailableModel();
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${geminiApiKey}`;
            const body = {
              systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
              contents: [{ parts: [{ text: promptText }] }],
              generationConfig: { temperature: 0.2, topP: 0.8, topK: 32, maxOutputTokens: 8192 }
            };
            if (!systemInstruction) delete body.systemInstruction;
            try {
              const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
              const text = await res.text();
              let json = {};
              try { json = text ? JSON.parse(text) : {}; } catch (e) { markModelFailed(currentModel, 'parse_error'); lastError = e; continue; }
              if (!res.ok) { markModelFailed(currentModel, res.status); lastError = { status: res.status, body: json }; continue; }
              if (!json.candidates || !json.candidates[0] || !json.candidates[0].content || !json.candidates[0].content.parts || !json.candidates[0].content.parts[0]) {
                markModelFailed(currentModel, 'no_candidates'); lastError = 'no_candidates'; continue;
              }
              const out = json.candidates[0].content.parts[0].text || '';
              markModelSuccess(currentModel);
              return { ok: true, text: out, model: currentModel };
            } catch (e) { markModelFailed(currentModel, 'fetch_error'); lastError = e; continue; }
          }
          return { ok: false, error: 'all_models_failed', detail: lastError };
        }

        const type = msg.type;
        if (type === 'rewrite_text') {
          const styleKey = msg.style || 'normal';
          const styleHint = msg.styleHint || '';
          const builder = REWRITE_TEMPLATES[styleKey] || REWRITE_TEMPLATES.normal;
          const systemInstruction = 'You are a professional writing assistant. Rewrite text to match the requested style while preserving all important information and intent. Never alter or invent code blocks. Output ONLY the rewritten text with no summaries, headers, or meta-commentary.';
          const prompt = builder({ text: msg.text || '', styleHint });
          const r = await geminiGenerate(systemInstruction, prompt);
          if (!r.ok) return sendResponse(r);

          // Post-process to remove any summary headers that may have been added
          let result = r.text || '';
          // Remove lines that are clearly headers/summaries
          result = result
            .replace(/^#{1,6}\s+Summary[^]*?\n\n/gim, '') // Remove markdown headers like "# Summary"
            .replace(/^##\s+(Summary|Key Points|Rewritten Text)[^]*?\n\n/gim, '')
            .replace(/^(Summary|Key Points|Rewritten Output|Here's the rewrite)[\s:]*\n\n/gim, '')
            .replace(/^(Here's|Here is|Below is) (your|the) (rewritten|rephrased) (text|version)[:\s]*\n\n/gim, '')
            .trim();

          return sendResponse({ ok: true, result: result, model: r.model });
        }
        if (type === 'extract_meaning') {
          const systemInstruction = 'You are a conversation analyst. Extract only the key ideas, decisions, explanations, insights, and instructions from the chat. Remove greetings, tangents, mistakes, contradictions, and noise. Output a succinct “meaning draft” without role attributions.';
          const src = Array.isArray(msg.content) ? msg.content.map(m => `${m.role || 'assistant'}: ${m.text || ''}`).join('\n\n') : String(msg.content || '');
          const prompt = `Conversation:\n\n${src}\n\nMeaning Draft (key ideas, decisions, explanations, insights, instructions only):`;
          const r = await geminiGenerate(systemInstruction, prompt);
          if (!r.ok) return sendResponse(r);
          return sendResponse({ ok: true, result: r.text, model: r.model });
        }
        if (type === 'structure_document') {
          const systemInstruction = 'You are a technical editor. Convert the meaning draft into a coherent, human-friendly document with section headings, bullet points, definitions, steps/processes, and summaries of reasoning. No “user said/assistant said”. Produce clean Markdown.';
          const prompt = `Meaning Draft:\n\n${msg.draft || ''}\n\nStructured Document (Markdown):`;
          const r = await geminiGenerate(systemInstruction, prompt);
          if (!r.ok) return sendResponse(r);
          return sendResponse({ ok: true, result: r.text, model: r.model });
        }
        if (type === 'apply_style_document') {
          const style = msg.style || 'professional';
          const styleHint = msg.styleHint || '';
          const systemInstruction = 'You are a style enforcer. Rewrite the structured document to match the requested style. Maintain markdown structure and never modify fenced code blocks.';
          const styleGuide = (style === 'customStyle') ? `Personalized style: "${String(styleHint).slice(0, 160)}".` : `Style preset: ${style}.`;
          const prompt = `${styleGuide}\n\nStructured Document (Markdown):\n\n${msg.doc || ''}\n\nStyled Document (same markdown, style applied):`;
          const r = await geminiGenerate(systemInstruction, prompt);
          if (!r.ok) return sendResponse(r);
          return sendResponse({ ok: true, result: r.text, model: r.model });
        }
        if (type === 'chat_to_document') {
          const style = msg.style || 'professional';
          const styleHint = msg.styleHint || '';
          // Orchestrate: extract → structure → style
          const meaning = await (async () => {
            const systemInstruction = 'You are a conversation analyst. Extract only the key ideas, decisions, explanations, insights, and instructions from the chat. Remove greetings, tangents, mistakes, contradictions, and noise. Output a succinct “meaning draft” without role attributions.';
            const src = Array.isArray(msg.content) ? msg.content.map(m => `${m.role || 'assistant'}: ${m.text || ''}`).join('\n\n') : String(msg.content || '');
            const prompt = `Conversation:\n\n${src}\n\nMeaning Draft (key ideas, decisions, explanations, insights, instructions only):`;
            const r = await geminiGenerate(systemInstruction, prompt);
            if (!r.ok) throw new Error(r.error || 'extract_failed');
            return r.text;
          })();
          const structured = await (async () => {
            const systemInstruction = 'You are a technical editor. Convert the meaning draft into a coherent, human-friendly document with section headings, bullet points, definitions, steps/processes, and summaries of reasoning. No “user said/assistant said”. Produce clean Markdown.';
            const prompt = `Meaning Draft:\n\n${meaning}\n\nStructured Document (Markdown):`;
            const r = await geminiGenerate(systemInstruction, prompt);
            if (!r.ok) throw new Error(r.error || 'structure_failed');
            return r.text;
          })();
          const styled = await (async () => {
            const systemInstruction = 'You are a style enforcer. Rewrite the structured document to match the requested style. Maintain markdown structure and never modify fenced code blocks.';
            const styleGuide = (style === 'customStyle') ? `Personalized style: "${String(styleHint).slice(0, 160)}".` : `Style preset: ${style}.`;
            const prompt = `${styleGuide}\n\nStructured Document (Markdown):\n\n${structured}\n\nStyled Document (same markdown, style applied):`;
            const r = await geminiGenerate(systemInstruction, prompt);
            if (!r.ok) throw new Error(r.error || 'style_failed');
            return r.text;
          })();
          return sendResponse({ ok: true, result: styled });
        }

        return sendResponse({ ok: false, error: 'unknown_rewriter_type' });
      } catch (e) {
        return sendResponse({ ok: false, error: 'rewriter_error', message: (e && e.message) || String(e) });
      }
    })();
    return true;
  }

  // Image generation via Gemini (optional - if API supports model)
  if (msg && msg.type === 'generate_image') {
    if (!limiterTry()) return sendResponse({ ok: false, error: 'rate_limited' });
    (async () => {
      try {
        const GEMINI_API_KEY = await getGeminiApiKey();
        if (!GEMINI_API_KEY) {
          return sendResponse({ ok: false, error: 'no_api_key', message: 'Gemini API key not configured. Open ChatBridge Options to set it.' });
        }
        const payload = msg.payload || {};
        const model = payload.model || 'imagen-3.0-generate-001';
        const prompt = payload.prompt || '';

        // Imagen 3 API endpoint for Google Generative AI
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

        const body = {
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.4,
            topK: 32,
            topP: 1,
            maxOutputTokens: 2048
          }
        };

        const res = await fetch(`${endpoint}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        const json = await res.json();
        console.log('[ChatBridge BG] Imagen response:', json);

        if (!res.ok) {
          return sendResponse({ ok: false, error: 'image_http_error', status: res.status, body: json });
        }

        // Parse image from response - Imagen returns base64 in inlineData
        let b64 = null;
        try {
          if (json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) {
            const parts = json.candidates[0].content.parts;
            for (const part of parts) {
              if (part.inlineData && part.inlineData.data) {
                b64 = part.inlineData.data;
                break;
              }
            }
          }
        } catch (e) {
          console.error('[ChatBridge BG] Parse image failed:', e);
          b64 = null;
        }

        if (!b64) {
          // Fallback: return empty/error so content script uses canvas
          return sendResponse({ ok: false, error: 'no_image_in_response', body: json });
        }

        return sendResponse({ ok: true, imageBase64: b64 });
      } catch (e) {
        console.error('[ChatBridge BG] Image generation error:', e);
        return sendResponse({ ok: false, error: 'image_fetch_error', message: (e && e.message) || String(e) });
      }
    })();
    return true;
  }
});
