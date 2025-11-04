// background.js
chrome.runtime.onInstalled.addListener(() => {
  console.log("ChatBridge installed/updated");
});

// Migration endpoint: content script can send stored conversations to background for persistent storage
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;
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
        sendResponse({ ok:true, migrated: count });
      } catch (e) { sendResponse({ ok:false, error: e && e.message }); }
    })();
    return true;
  }

  if (msg.type === 'report_issue') {
    // simple logging; background can forward to a server if configured
    try { console.warn('REPORT_ISSUE', msg.payload || {}); } catch(e){}
    sendResponse({ ok:true });
    return true;
  }
});

// Precompute embeddings during idle time: scan conversation DB and compute embeddings for missing items
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
        // small delay to avoid burst
        await new Promise(r => setTimeout(r, 200));
      } catch (e) { /* ignore per-item */ }
    }
    if (processed) console.log('[ChatBridge] precomputed embeddings for', processed, 'conversations');
  } catch (e) { console.warn('precomputeEmbeddingsIdle err', e); }
}

// Schedule precompute when browser goes idle
if (chrome.idle && chrome.idle.onStateChanged) {
  chrome.idle.onStateChanged.addListener((state) => {
    try {
      if (state === 'idle' || state === 'locked') {
        precomputeEmbeddingsIdle(4);
      }
    } catch (e) {}
  });
}

// Also create a periodic alarm to attempt precompute (background service workers may be stopped)
try {
  if (chrome.alarms) {
    chrome.alarms.create('chatbridge_precompute', { periodInMinutes: 30 });
    chrome.alarms.onAlarm.addListener((alarm) => {
      try { if (alarm && alarm.name === 'chatbridge_precompute') precomputeEmbeddingsIdle(2); } catch (e) {}
    });
  }
} catch (e) {}

// clean cache periodically
try { setInterval(() => { cacheCleanExpired(); }, 1000 * 60 * 10); } catch(e) {}
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
        try { db.createObjectStore(V_STORE, { keyPath: 'id' }); } catch (e) {}
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
        try { ev.target.result.createObjectStore(C_STORE, { keyPath: 'id' }); } catch (e) {}
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
        try { ev.target.result.createObjectStore(CONV_STORE, { keyPath: 'id' }); } catch (e) {}
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
        try { cur.delete(); } catch (e) {}
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
  for (let i=0;i<a.length;i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
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
// Vercel Proxy Configuration
// Set these after deploying to Vercel (see VERCEL_DEPLOYMENT.md)
const VERCEL_PROXY_URL = 'https://chatbridge-eta.vercel.app/api/gemini'; // e.g., 'https://your-project.vercel.app/api/gemini'
const VERCEL_EXT_SECRET = 'cb_s3cr3t_2024_xyz789'; // The EXT_SECRET/EXT_KEY you set in Vercel environment variables

// Lightweight cached accessor for the Gemini API key stored in chrome.storage.local
// This avoids repeated storage lookups across frequent background calls.
let __cbGeminiKeyCache = { value: null, ts: 0 };
// DEPRECATED: Direct API key (kept for backward compatibility during transition)
// After Vercel deployment, this will not be used
const DEV_HARDCODED_GEMINI_KEY = '';
/**
 * Call Gemini API via Vercel proxy (secure) or direct (fallback for local dev)
 * @param {string} endpoint - Gemini API endpoint URL (without key parameter)
 * @param {object} body - Request body to send to Gemini
 * @param {string} method - HTTP method (default: POST)
 * @returns {Promise<Response>} Fetch response
 */
async function callGeminiViaProxy(endpoint, body, method = 'POST') {
  // If Vercel proxy is configured, use it (secure)
  if (VERCEL_PROXY_URL && VERCEL_EXT_SECRET) {
    try {
      let response = await fetch(VERCEL_PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ext-key': VERCEL_EXT_SECRET
        },
        body: JSON.stringify({
          endpoint: endpoint,
          body: body,
          method: method
        })
      });
      // Fallback: if project root was set to `api/` in Vercel, route is "/gemini" not "/api/gemini"
      if (response && response.status === 404 && /\/api\//.test(VERCEL_PROXY_URL)) {
        try {
          const altUrl = VERCEL_PROXY_URL.replace('/api/', '/');
          response = await fetch(altUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-ext-key': VERCEL_EXT_SECRET
            },
            body: JSON.stringify({ endpoint, body, method })
          });
        } catch (_) { /* ignore, will fall back to direct */ }
      }
      return response;
    } catch (err) {
      Logger.error('Vercel proxy error, falling back to direct call:', err);
      // Fall through to direct call
    }
  }

  // Fallback: Direct call with API key (for local development or if proxy not configured)
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('No API key configured and Vercel proxy not set up');
  }
  const urlWithKey = `${endpoint}?key=${apiKey}`;
  return fetch(urlWithKey, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
}

/**
 * Get the Gemini API key from chrome.storage.local with a short-lived cache.
 * DEPRECATED: Use callGeminiViaProxy instead for security
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

// Keep cache fresh when the key changes in Options
try {
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      try {
        if (area === 'local' && changes && changes.chatbridge_gemini_key) {
          __cbGeminiKeyCache = { value: changes.chatbridge_gemini_key.newValue || null, ts: Date.now() };
        }
      } catch (_) {}
    });
  }
} catch (_) {}

// --- Config, Logger, Errors, Rate Limiter (lightweight, non-invasive) ------
/** @typedef {{ ratePerSec: number, maxBurst: number }} TokenBucketConfig */

const Config = (function(){
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
    async getAll(force=false){ if (!force && (Date.now()-cache.ts)<60_000) return cache.value; return _load(); },
    /** @returns {Promise<any>} */
    async get(key){ const c = await this.getAll(); return c[key]; },
    /** @param {Partial<typeof DEFAULTS>} partial */
    async set(partial){ try { const cur = await this.getAll(true); const next = Object.assign({}, cur, partial||{}); await new Promise(r=>chrome.storage.local.set({ chatbridge_config: next }, r)); cache={value:next,ts:Date.now()}; } catch(_){} }
  };
})();

const Logger = (function(){
  let debugEnabled = false;
  (async ()=>{ try { debugEnabled = !!(await Config.get('debug')); } catch(_){} })();
  try {
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area)=>{
        try { if (area==='local' && changes && changes.chatbridge_config) {
          const v = changes.chatbridge_config.newValue||{}; debugEnabled = !!v.debug;
        } } catch(_){}
      });
    }
  } catch(_){}
  function log(method, args){ try { console[method].apply(console, ['[ChatBridge]', ...args]); } catch(_){} }
  return {
    debug: (...a)=>{ if (debugEnabled) log('debug', a); },
    info: (...a)=>log('log', a),
    warn: (...a)=>log('warn', a),
    error: (...a)=>log('error', a)
  };
})();

function makeError(code, message, extra){ return Object.assign({ ok:false, error: String(code||'error'), message: String(message||'') }, extra||{}); }

function createTokenBucket(cfg){
  const rate = Math.max(0.1, Number(cfg && cfg.ratePerSec || 1));
  const burst = Math.max(1, Number(cfg && cfg.maxBurst || 5));
  let tokens = burst; let last = Date.now();
  return {
    try(){ const now=Date.now(); const delta=(now-last)/1000; last=now; tokens = Math.min(burst, tokens + delta*rate); if (tokens>=1){ tokens-=1; return true;} return false; },
    peek(){ return tokens; }
  };
}

let RateLimiter = createTokenBucket({ ratePerSec: 1, maxBurst: 5 });
(async ()=>{
  try { const ratePerSec = await Config.get('ratePerSec'); const maxBurst = await Config.get('maxBurst'); RateLimiter = createTokenBucket({ ratePerSec, maxBurst }); } catch(_){}
})();
try {
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area)=>{
      try { if (area==='local' && changes && changes.chatbridge_config) {
        const v = changes.chatbridge_config.newValue || {}; RateLimiter = createTokenBucket({ ratePerSec: Number(v.ratePerSec)||1, maxBurst: Number(v.maxBurst)||5 });
      } } catch(_){}
    });
  }
} catch(_){}

// Fetch embedding using Gemini API (text-embedding-004 model)
async function fetchEmbeddingGemini(text) {
  try {
    const endpoint = 'https://generativelanguage.googleapis.com/v1/models/text-embedding-004:embedContent';
    const body = {
      model: "models/text-embedding-004",
      content: {
        parts: [{
          text: text.slice(0, 10000) // Gemini embedding limit
        }]
      }
    };
    
    const res = await callGeminiViaProxy(endpoint, body, 'POST');
    
    if (!res.ok) {
      console.warn('Gemini embedding failed:', res.status);
      return null;
    }
    const j = await res.json();
    if (j && j.embedding && j.embedding.values) return j.embedding.values;
    return null;
  } catch (e) { 
    console.warn('fetchEmbeddingGemini err', e); 
    return null; 
  }
}

// Legacy function - now uses Gemini
async function fetchEmbeddingOpenAI(text) {
  return fetchEmbeddingGemini(text);
}

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
        if (!text) return sendResponse({ ok:false, error:'no_text' });
        // Try to get embedding from payload first
        let embedding = payload.embedding || null;
        if (!embedding) {
          // try OpenAI embeddings
          embedding = await fetchEmbeddingOpenAI(text);
        }
        if (!embedding) return sendResponse({ ok:false, error:'no_embedding' });
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
        if (!q) return sendResponse({ ok:false, error:'no_query' });
        // get embedding for query
        const qemb = await fetchEmbeddingOpenAI(q);
        if (!qemb) return sendResponse({ ok:false, error:'no_embedding' });
        const all = await idbAll();
        const scored = all.map(it => ({ id: it.id, score: cosine(qemb, it.vector || []), metadata: it.metadata || {} }));
        scored.sort((a,b) => b.score - a.score);
        const top = scored.slice(0, topK);
        return sendResponse({ ok:true, results: top });
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
          return sendResponse({ ok:true, indexed });
        } catch (e) { return sendResponse({ ok:false, error: e && e.message }); }
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
        }).sort((a,b) => (b.ts||0) - (a.ts||0));
        const slice = (limit && limit > 0) ? norm.slice(offset, offset + limit) : (offset ? norm.slice(offset) : norm);
        sendResponse({ ok: true, conversations: slice, total: norm.length });
      } catch (e) {
        sendResponse({ ok:false, error: e && e.message });
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
        try { chrome.storage.local.set({ 'chatbridge:conversations': [] }, () => {}); } catch (e) {}
        sendResponse({ ok: true });
      } catch (e) { sendResponse({ ok:false, error: e && e.message }); }
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
              const arr = Array.isArray(data['chatbridge:conversations']) ? data['chatbridge:conversations'] : [];
              // Put newest first
              arr.unshift(obj);
              // Keep a reasonable cap (optional) — here we keep full list but could trim
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
  if (msg && msg.type === 'ping') return sendResponse({ ok:true });

  // Built-in self-test (non-invasive unit checks) for quick validation via message
  if (msg && msg.type === 'self_test') {
    (async () => {
      const details = [];
      try {
        // hashString deterministic
        const h1 = hashString('abc'); const h2 = hashString('abc'); const h3 = hashString('abcd');
        details.push({ test: 'hashString deterministic', pass: h1===h2 && h1!==h3 });
        // cosine basics
        const c1 = cosine([1,0],[1,0]); const c2 = cosine([1,0],[0,1]);
        details.push({ test: 'cosine basics', pass: Math.abs(c1-1)<1e-9 && Math.abs(c2-0)<1e-9 });
        // rate limiter
        const rl = createTokenBucket({ ratePerSec: 100, maxBurst: 2 });
        const p = [rl.try(), rl.try(), rl.try()].map(Boolean); // 3rd likely false immediately
        details.push({ test: 'rate limiter burst', pass: p[0]===true && p[1]===true && p[2]===false });
        // config read
        const cfg = await Config.getAll();
        details.push({ test: 'config defaults', pass: typeof cfg.ratePerSec==='number' && typeof cfg.maxBurst==='number' });
        const allPass = details.every(d => d.pass);
        return sendResponse({ ok: allPass, details });
      } catch (e) {
        return sendResponse({ ok:false, error: 'self_test_failed', message: (e&&e.message)||String(e), details });
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
        if (!text) return sendResponse({ ok:false, error: 'no_text' });

        // Try to get a query embedding first
        const qemb = await fetchEmbeddingOpenAI(text);

        // Fallback simple keyword extractor if no embedding available
        function extractLocalPhrases(src, maxPhrases = 80) {
          const s = (src || '').toLowerCase().replace(/["'`/\\()\[\]{}<>]/g,' ');
          const words = s.split(/[^a-z0-9]+/).filter(Boolean);
          const stop = new Set(['the','and','for','with','that','this','from','your','you','have','are','was','but','not','what','when','where','which','like','they','their','will','can','all','any','one','use','uses']);
          const grams = new Map();
          // prefer 2..4 grams
          for (let n=2;n<=4;n++) {
            for (let i=0;i+ n <= words.length;i++) {
              const g = words.slice(i,i+n).filter(w => !stop.has(w)).join(' ');
              if (!g || g.length < 3) continue;
              grams.set(g, (grams.get(g)||0)+1);
              if (grams.size > maxPhrases*3) break;
            }
          }
          // rank by frequency then length
          const arr = Array.from(grams.entries()).map(([k,v])=>({phrase:k,count:v,words:k.split(' ').length}));
          arr.sort((a,b)=> (b.count - a.count) || (b.words - a.words));
          return arr.slice(0, maxPhrases).map(x=>x.phrase);
        }

        // If no embedding available, fallback to local extraction from latest conversations
        if (!qemb) {
          // load conversations
          const data = await new Promise(r => chrome.storage.local.get(['chatbridge:conversations'], d => r(d['chatbridge:conversations'])));
          const convs = Array.isArray(data) ? data : [];
          const joined = (convs.slice(0,10).map(c => (c.conversation||[]).map(m=>m.text).join(' ')).join('\n\n')) || text;
          const phrases = extractLocalPhrases(joined, topK*6).slice(0, topK*2);
          // Provide basic confidence (frequency-based) when embeddings are unavailable
          const mapped = phrases.slice(0, topK).map((p, idx) => ({ phrase: p, confidence: Math.max(30, 80 - idx*10) }));
          return sendResponse({ ok:true, suggestions: mapped });
        }

        // We have an embedding: find top similar indexed items
        const allVec = await idbAll();
        const scored = allVec.map(it => ({ id: it.id, score: cosine(qemb, it.vector || []), metadata: it.metadata || {}, text: '' }));
        scored.sort((a,b)=>b.score - a.score);
        const topDocs = scored.slice(0, Math.min(12, scored.length));

        // Load stored conversations to extract candidate phrases
        const stored = await new Promise(r => chrome.storage.local.get(['chatbridge:conversations'], d => r(d['chatbridge:conversations'])));
        const convs = Array.isArray(stored) ? stored : [];

        // map id/ts to conversation text for quick lookup
        const convMap = new Map();
        for (const c of convs) {
          const id = String(c.ts || c.id || Date.now());
          const body = (c.conversation||[]).map(m => m.text || '').join(' ');
          convMap.set(id, body);
        }

        // Build phrase candidates from top docs
        const candidateCounts = new Map();
        function addCandidatesFromText(t) {
          if (!t || typeof t !== 'string') return;
          const s = t.toLowerCase().replace(/["'`/\\()\[\]{}<>]/g,' ');
          const words = s.split(/[^a-z0-9]+/).filter(Boolean);
          const stop = new Set(['the','and','for','with','that','this','from','your','you','you','have','are','was','but','not','what','when','where','which','like','they','their','will','can','all','any','one','use','uses','about','there','been']);
          for (let n=2;n<=4;n++) {
            for (let i=0;i + n <= words.length;i++) {
              const arr = words.slice(i,i+n);
              if (arr.some(w => stop.has(w))) continue;
              const phrase = arr.join(' ');
              if (phrase.length < 4) continue;
              candidateCounts.set(phrase, (candidateCounts.get(phrase)||0) + 1);
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
        const candidates = Array.from(candidateCounts.entries()).map(([p,c])=>({ phrase: p, count: c, words: p.split(' ').length }));
        candidates.sort((a,b)=> (b.count - a.count) || (b.words - a.words));
        const topCandidates = candidates.slice(0, 120).map(c=>c.phrase);

        // Request embeddings for candidate phrases in batches to compute semantic similarity
        async function fetchEmbeddingBatch(texts) {
          try {
            // Prefer batch endpoint in v1
            const endpoint = 'https://generativelanguage.googleapis.com/v1/models/text-embedding-004:batchEmbedContents';
            const body = {
              requests: texts.map(t => ({
                model: 'models/text-embedding-004',
                content: { parts: [{ text: String(t || '').slice(0, 10000) }] }
              }))
            };
            const res = await callGeminiViaProxy(endpoint, body, 'POST');
            if (!res.ok) {
              // Fallback to per-text calls if batch not supported
              const arr = [];
              for (const t of texts) {
                const v = await fetchEmbeddingGemini(t);
                arr.push(v || null);
              }
              return arr;
            }
            const j = await res.json();
            if (j && Array.isArray(j.embeddings)) {
              return j.embeddings.map(e => (e && e.values) ? e.values : null);
            }
            // Some responses may nest under 'responses' depending on API version
            if (j && Array.isArray(j.responses)) {
              return j.responses.map(r => (r && r.embedding && r.embedding.values) ? r.embedding.values : null);
            }
            return null;
          } catch (e) {
            // As a last resort, per-text sequential fetch
            try {
              const arr = [];
              for (const t of texts) {
                const v = await fetchEmbeddingGemini(t);
                arr.push(v || null);
              }
              return arr;
            } catch (_) {
              return null;
            }
          }
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
          const simple = topCandidates.slice(0, topK*3).slice(0, topK).map((p, idx) => ({ phrase: p, confidence: Math.max(30, 70 - idx*8) }));
          return sendResponse({ ok:true, suggestions: simple });
        }

        // compute similarity and combined score
        const maxCount = Math.max(...candidates.map(c=>c.count), 1);
        const candidateMap = new Map(candidates.map(c=>[c.phrase, c]));
        const scoredP = phraseEmbs.map(pe => {
          const sem = cosine(qemb, pe.emb || []);
          const meta = candidateMap.get(pe.phrase) || { count: 1, words: pe.phrase.split(' ').length };
          const freqScore = meta.count / maxCount; // 0..1
          const multiBoost = Math.min(0.2, (meta.words - 1) * 0.06); // prefer multi-word
          // combine: semantic heavy, then freq, then multiword
          const score = (0.72 * (sem || 0)) + (0.24 * freqScore) + (0.04 * multiBoost);
          return { phrase: pe.phrase, score, sem: sem || 0, freq: meta.count, words: meta.words };
        });
        scoredP.sort((a,b)=> b.score - a.score);
        const uniques = [];
        const seen = new Set();
        for (const s of scoredP) {
          const p = s.phrase.replace(/\s+/g,' ').trim();
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
            .map((p, idx) => ({ phrase: p, confidence: Math.max(30, 60 - idx*10) }));
          uniques.push(...more);
        }

        // Enforce minimum confidence threshold of 30%
        const final = uniques
          .filter(u => (typeof u.confidence === 'number' ? u.confidence >= 30 : true))
          .slice(0, topK);

        return sendResponse({ ok:true, suggestions: final });
      } catch (e) {
        return sendResponse({ ok:false, error: 'embed_suggest_error', message: (e && e.message) || String(e) });
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
    if (!url || !text) { sendResponse && sendResponse({ ok:false, error:'missing_params' }); return true; }
    try {
      chrome.tabs.create({ url }, (tab) => {
        if (!tab || !tab.id) { sendResponse && sendResponse({ ok:false, error:'tab_create_failed' }); return; }
        const tabId = tab.id;
        let attempts = 0;
        const maxAttempts = 30; // ~15s total (increased from 6s)
        // Wait a bit longer before first attempt to let page start loading
        setTimeout(() => {
          const interval = setInterval(() => {
            attempts++;
            if (attempts > maxAttempts) {
              clearInterval(interval);
              sendResponse && sendResponse({ ok:false, error:'restore_timeout' });
              return;
            }
            try {
              // Check if tab is still valid before sending message
              chrome.tabs.get(tabId, (tabInfo) => {
                if (chrome.runtime.lastError || !tabInfo) {
                  clearInterval(interval);
                  sendResponse && sendResponse({ ok:false, error:'tab_not_found' });
                  return;
                }
                chrome.tabs.sendMessage(tabId, { type: 'restore_to_chat', payload: { text, attachments } }, (res) => {
                  if (chrome.runtime.lastError) {
                    // Content script might not be loaded yet; keep retrying
                    return;
                  }
                  // got a response – success
                  clearInterval(interval);
                  sendResponse && sendResponse({ ok:true });
                });
              });
            } catch (e) {
              // ignore and retry
            }
          }, 500);
        }, 1000); // Wait 1 second before starting to send messages
      });
    } catch (e) {
      sendResponse && sendResponse({ ok:false, error: e && e.message });
    }
    return true; // async
  }

  // rate limiter (token bucket)
  const limiterTry = () => RateLimiter.try();

  // Background handler for calling OpenAI (safe place to keep API keys)
  if (msg && msg.type === 'call_openai') {
    if (!limiterTry()) return sendResponse({ ok:false, error: 'rate_limited' });

    (async () => {
      try {
        const payload = msg.payload || {};
        const key = payload.apiKey || (await new Promise(r => chrome.storage.local.get(['chatbridge_api_key'], d => r(d.chatbridge_api_key))));
        const model = payload.model || 'gpt-4o-mini';
        const timeoutMs = (typeof payload.timeout === 'number') ? payload.timeout : 25000;
        if (!key) return sendResponse({ ok:false, error: 'no_api_key' });

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
            const json = await (async ()=>{ const t = await res.text(); try { return JSON.parse(t); } catch(e){ return { raw: t }; } })();
            if (!res.ok) {
              lastErr = { status: res.status, body: json };
              // retry on 5xx
              if (res.status >= 500 && attempt < maxAttempts) { await new Promise(r => setTimeout(r, 300 * attempt)); continue; }
              return sendResponse({ ok:false, error: 'http_error', status: res.status, body: json });
            }
            // extract assistant text safely
            const assistant = (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';
            // cache successful response (5min TTL)
            try {
              const cacheKey = hashString(stableStringify({ type: 'call_openai', model: model, messages: payload.messages || [] }));
              await cachePut({ id: cacheKey, ts: Date.now(), ttl: 1000 * 60 * 5, response: { ok:true, assistant } });
              cacheCleanExpired();
            } catch (e) { /* ignore cache write errors */ }
            return sendResponse({ ok:true, assistant: assistant });
          } catch (e) {
            lastErr = e;
            if (e && e.name === 'AbortError') return sendResponse({ ok:false, error: 'timeout' });
            // transient network error -> backoff and retry
            if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 200 * attempt));
          }
        }
        return sendResponse({ ok:false, error: 'failed', detail: lastErr });
      } catch (e) {
        return sendResponse({ ok:false, error: 'fetch_error', message: (e && e.message) || String(e) });
      }
    })();
    // indicate we'll respond asynchronously
    return true;
  }

  // Gemini cloud API handler
  if (msg && msg.type === 'call_gemini') {
    if (!limiterTry()) return sendResponse({ ok:false, error: 'rate_limited' });
    (async () => {
      try {
        // If proxy isn't configured, require a local API key; otherwise skip this check
        if (!(VERCEL_PROXY_URL && VERCEL_EXT_SECRET)) {
          const GEMINI_API_KEY = await getGeminiApiKey();
          if (!GEMINI_API_KEY) {
            return sendResponse({ ok:false, error: 'no_api_key', message: 'Gemini API key not configured and proxy not set. Configure the Vercel proxy (background.js) or add a local key in Options.' });
          }
        }
        const payload = msg.payload || {};
        let promptText = '';
        if (payload.action === 'prompt') {
          promptText = `Analyze this conversation and provide helpful insights or suggestions:\n\n${payload.text}`;
        } else if (payload.action === 'summarize') {
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
          const style = payload.rewriteStyle || 'normal';
          if (style === 'concise') {
            promptText = `Rewrite the following text to be concise and to-the-point. Remove unnecessary words and keep only essential information:\n\n${payload.text}`;
          } else if (style === 'direct') {
            promptText = `Rewrite the following text to be direct and straightforward. Use clear, assertive language and active voice:\n\n${payload.text}`;
          } else if (style === 'detailed') {
            promptText = `Rewrite the following text to be more detailed and comprehensive. Add clarity, context, and elaboration where helpful:\n\n${payload.text}`;
          } else if (style === 'academic') {
            promptText = `Rewrite the following text in an academic tone. Use formal language, precise terminology, and scholarly phrasing:\n\n${payload.text}`;
          } else {
            // normal
            promptText = `Rewrite this text to be clearer and more professional:\n\n${payload.text}`;
          }
        } else if (payload.action === 'translate') {
          promptText = `Translate the following text to ${payload.targetLang || 'English'}. Output ONLY the translated text with no explanations, notes, or additional commentary:\n\n${payload.text}`;
        } else if (payload.action === 'syncTone') {
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
        } else {
          promptText = payload.text || '';
        }
        // Before making network call, check cache for this prompt
        try {
          const cacheKey = hashString(stableStringify({ type:'call_gemini', action: payload.action || 'unknown', prompt: promptText, length: payload.length || '', summaryType: payload.summaryType || '' }));
          const rec = await cacheGet(cacheKey);
          if (rec && rec.ts && rec.ttl && (Date.now() - rec.ts) < rec.ttl && rec.response) {
            return sendResponse(rec.response);
          }
        } catch (e) { /* ignore */ }
        
        const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
        const body = {
          contents: [{ role: 'user', parts: [{ text: promptText }] }]
        };
        
        const res = await callGeminiViaProxy(endpoint, body, 'POST');
        
        // Parse JSON response - handle both success and error responses
        let json;
        try {
          const text = await res.text();
          json = text ? JSON.parse(text) : {};
        } catch (e) {
          console.error('[Gemini API] Failed to parse response as JSON:', e);
          return sendResponse({ ok:false, error: 'gemini_parse_error', message: 'Invalid JSON response', status: res.status });
        }
        
        // Check if HTTP request was successful
        if (!res.ok) {
          console.error('[Gemini API Error]', res.status, json);
          return sendResponse({ ok:false, error: 'gemini_http_error', status: res.status, body: json });
        }
        
        // Validate response structure
        if (!json.candidates || !Array.isArray(json.candidates) || json.candidates.length === 0) {
          console.error('[Gemini API] No candidates in response:', json);
          return sendResponse({ ok:false, error: 'gemini_parse_error', message: 'No candidates in response', body: json });
        }
        
        const candidate = json.candidates[0];
        if (!candidate || !candidate.content || !candidate.content.parts || !Array.isArray(candidate.content.parts) || candidate.content.parts.length === 0) {
          console.error('[Gemini API] Invalid candidate structure:', candidate);
          return sendResponse({ ok:false, error: 'gemini_parse_error', message: 'Invalid candidate structure', body: json });
        }
        
        // Check for finish reason (might be blocked, stopped, etc.)
        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
          console.warn('[Gemini API] Unexpected finish reason:', candidate.finishReason);
          // Still try to extract text if available
        }
        
        const result = candidate.content.parts[0].text || '';
        // cache gemini successful result (5min TTL)
        try {
          const cacheKey = hashString(stableStringify({ type:'call_gemini', action: payload.action || 'unknown', prompt: promptText, length: payload.length || '', summaryType: payload.summaryType || '' }));
          await cachePut({ id: cacheKey, ts: Date.now(), ttl: 1000 * 60 * 5, response: { ok:true, result } });
          cacheCleanExpired();
        } catch (e) { /* ignore */ }
        return sendResponse({ ok:true, result });
      } catch (e) {
        return sendResponse({ ok:false, error: 'gemini_fetch_error', message: (e && e.message) || String(e) });
      }
    })();
    return true;
  }

  // Image generation via Gemini (optional - if API supports model)
  if (msg && msg.type === 'generate_image') {
    if (!limiterTry()) return sendResponse({ ok:false, error: 'rate_limited' });
    (async () => {
      try {
        const payload = msg.payload || {};
        const model = payload.model || 'imagen-3.0-generate-001';
        const prompt = payload.prompt || '';
        
        // Imagen 3 API endpoint for Google Generative AI
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        
        const body = {
          contents: [{
            role: 'user',
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
        
        const res = await callGeminiViaProxy(endpoint, body, 'POST');
        
        const json = await res.json();
        console.log('[ChatBridge BG] Imagen response:', json);
        
        if (!res.ok) {
          return sendResponse({ ok:false, error: 'image_http_error', status: res.status, body: json });
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
          return sendResponse({ ok:false, error: 'no_image_in_response', body: json });
        }
        
        return sendResponse({ ok:true, imageBase64: b64 });
      } catch (e) {
        console.error('[ChatBridge BG] Image generation error:', e);
        return sendResponse({ ok:false, error: 'image_fetch_error', message: (e && e.message) || String(e) });
      }
    })();
    return true;
  }
});
