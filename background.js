// background.js
chrome.runtime.onInstalled.addListener(() => {
  console.log("ChatBridge installed/updated");
});

// Simple IndexedDB vector store (fallback to in-memory on failure)
const V_DB_NAME = 'chatbridge_vectors_v1';
const V_STORE = 'vectors';
let idb = null;

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

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i=0;i<a.length;i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  if (na === 0 || nb === 0) return 0; return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Ask OpenAI embeddings endpoint (if API key available) — returns embedding array or null
async function fetchEmbeddingOpenAI(text) {
  try {
    const key = await new Promise(r => chrome.storage.local.get(['chatbridge_api_key'], d => r(d.chatbridge_api_key)));
    if (!key) return null;
    const apiKey = key;
    const endpoint = 'https://api.openai.com/v1/embeddings';
    const body = { input: text, model: 'text-embedding-3-small' };
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type':'application/json', 'Authorization': 'Bearer ' + apiKey }, body: JSON.stringify(body) });
    if (!res.ok) return null;
    const j = await res.json();
    if (j && j.data && j.data[0] && j.data[0].embedding) return j.data[0].embedding;
    return null;
  } catch (e) { console.warn('fetchEmbeddingOpenAI err', e); return null; }
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
          // load conversations from chrome.storage.local or payload
          const fromPayload = (msg.payload && Array.isArray(msg.payload.conversations)) ? msg.payload.conversations : null;
          let convs = fromPayload;
          if (!convs) {
            const data = await new Promise(r => chrome.storage.local.get(['chatbridge:conversations'], d => r(d['chatbridge:conversations'])));
            convs = Array.isArray(data) ? data : [];
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
        const maxAttempts = 12; // ~6s total
        const interval = setInterval(() => {
          attempts++;
          if (attempts > maxAttempts) {
            clearInterval(interval);
            sendResponse && sendResponse({ ok:false, error:'restore_timeout' });
            return;
          }
          try {
            chrome.tabs.sendMessage(tabId, { type: 'restore_to_chat', payload: { text, attachments } }, (res) => {
              if (chrome.runtime.lastError) {
                // Content script might not be loaded yet; keep retrying
                return;
              }
              // got a response – success
              clearInterval(interval);
              sendResponse && sendResponse({ ok:true });
            });
          } catch (e) {
            // ignore and retry
          }
        }, 500);
      });
    } catch (e) {
      sendResponse && sendResponse({ ok:false, error: e && e.message });
    }
    return true; // async
  }

  // --- simple token-bucket rate limiter ---
  // allow `ratePerSec` tokens per second with a burst of `maxBurst`
  const limiter = (function(){
    const ratePerSec = 1; const maxBurst = 5; let tokens = maxBurst; let last = Date.now();
    return function tryRemoveToken() {
      const now = Date.now(); const delta = (now - last) / 1000; last = now; tokens = Math.min(maxBurst, tokens + delta * ratePerSec);
      if (tokens >= 1) { tokens -= 1; return true; } return false;
    };
  })();

  // Background handler for calling OpenAI (safe place to keep API keys)
  if (msg && msg.type === 'call_openai') {
    if (!limiter()) return sendResponse({ ok:false, error: 'rate_limited' });

    (async () => {
      try {
        const payload = msg.payload || {};
        const key = payload.apiKey || (await new Promise(r => chrome.storage.local.get(['chatbridge_api_key'], d => r(d.chatbridge_api_key))));
        const model = payload.model || 'gpt-4o-mini';
        const timeoutMs = (typeof payload.timeout === 'number') ? payload.timeout : 25000;
        if (!key) return sendResponse({ ok:false, error: 'no_api_key' });

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
    // Use hardcoded Gemini API key (never expose in repo/UI)
    const GEMINI_API_KEY = 'AIzaSyDH7q1lOI8grDht1H-WHNtsyptIiSrgogQ';
    if (!limiter()) return sendResponse({ ok:false, error: 'rate_limited' });
    (async () => {
      try {
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
            if (payload.summaryType === 'bullet') {
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
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_API_KEY;
        const body = {
          contents: [{ parts: [{ text: promptText }] }]
        };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const json = await res.json();
        if (!res.ok) {
          console.error('[Gemini API Error]', res.status, json);
          return sendResponse({ ok:false, error: 'gemini_http_error', status: res.status, body: json });
        }
        if (!json.candidates || !json.candidates[0] || !json.candidates[0].content || !json.candidates[0].content.parts || !json.candidates[0].content.parts[0]) {
          return sendResponse({ ok:false, error: 'gemini_parse_error', body: json });
        }
        const result = json.candidates[0].content.parts[0].text || '';
        return sendResponse({ ok:true, result });
      } catch (e) {
        return sendResponse({ ok:false, error: 'gemini_fetch_error', message: (e && e.message) || String(e) });
      }
    })();
    return true;
  }
});
