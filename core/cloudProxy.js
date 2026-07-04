/**

 * ChatBridge cloud proxy client — routes provider API calls through the hosted gateway.

 */



export const CLOUD_STORAGE_KEYS = {

  enabled: 'chatbridge_cloud_enabled',

  url: 'chatbridge_cloud_url',

  token: 'chatbridge_cloud_token',

  encryptedToken: 'chatbridge_api_cloud',

};



export const DEFAULT_GATEWAY_URL = 'https://chatbridge-gateway.chatbridgeai.workers.dev';

export const DEFAULT_GATEWAY_TOKEN = 'j3Wb5g4hQdN1Yk8m7rP2Xz9LwUaCt6FvE0sI+BnJeRc=';



const MASTER_KEY_NAME = 'chatbridge_master_key';



const PROVIDER_HOSTS = [

  { id: 'gemini', pattern: /generativelanguage\.googleapis\.com/i },

  { id: 'openai', pattern: /api\.openai\.com/i },

  { id: 'huggingface', pattern: /huggingface\.co/i },

  { id: 'nvidia', pattern: /integrate\.api\.nvidia\.com/i },

];



let __configCache = { value: null, ts: 0 };

let __masterKeyCache = null;



export function inferProviderFromUrl(url) {

  const target = String(url || '');

  for (const entry of PROVIDER_HOSTS) {

    if (entry.pattern.test(target)) return entry.id;

  }

  return null;

}



async function getMasterKey() {

  if (__masterKeyCache) return __masterKeyCache;

  const stored = await new Promise((resolve) => {

    chrome.storage.local.get([MASTER_KEY_NAME], resolve);

  });

  const raw = stored && stored[MASTER_KEY_NAME];

  if (!raw) return null;

  try {

    const jwk = JSON.parse(raw);

    __masterKeyCache = await crypto.subtle.importKey(

      'jwk',

      jwk,

      { name: 'AES-GCM', length: 256 },

      true,

      ['encrypt', 'decrypt']

    );

    return __masterKeyCache;

  } catch (_) {

    return null;

  }

}



async function decryptStoredToken(encryptedB64) {

  if (!encryptedB64) return '';

  try {

    const key = await getMasterKey();

    if (!key) return '';

    const combined = Uint8Array.from(atob(encryptedB64), (c) => c.charCodeAt(0));

    const iv = combined.slice(0, 12);

    const ciphertext = combined.slice(12);

    const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);

    return new TextDecoder().decode(plainBuffer);

  } catch (_) {

    return '';

  }

}



async function resolveCloudToken(data) {

  const encrypted = data && data[CLOUD_STORAGE_KEYS.encryptedToken];

  if (encrypted) {

    const decrypted = await decryptStoredToken(encrypted);

    if (decrypted) return decrypted.trim();

  }

  return String((data && data[CLOUD_STORAGE_KEYS.token]) || '').trim();

}



export async function getCloudProxyConfig(opts) {

  const force = !!(opts && opts.force);

  const now = Date.now();

  if (!force && __configCache.value && (now - __configCache.ts) < 30_000) {

    return __configCache.value;

  }



  const data = await new Promise((resolve) => {

    chrome.storage.local.get(

      [

        CLOUD_STORAGE_KEYS.enabled,

        CLOUD_STORAGE_KEYS.url,

        CLOUD_STORAGE_KEYS.token,

        CLOUD_STORAGE_KEYS.encryptedToken,

      ],

      resolve

    );

  });



  const enabled = data[CLOUD_STORAGE_KEYS.enabled] !== undefined ? !!data[CLOUD_STORAGE_KEYS.enabled] : true;

  const baseUrl = (String(data[CLOUD_STORAGE_KEYS.url] || '').trim() || DEFAULT_GATEWAY_URL).replace(/\/+$/, '');

  const token = (await resolveCloudToken(data)) || DEFAULT_GATEWAY_TOKEN;

  const ready = enabled && !!baseUrl && !!token;



  __configCache = {

    value: { enabled, baseUrl, token, ready },

    ts: now,

  };

  return __configCache.value;

}



export async function isCloudProxyActive() {

  const cfg = await getCloudProxyConfig();

  return cfg.ready;

}



export async function requestCloudHostPermission(baseUrl) {

  if (!chrome.permissions) return true;

  try {

    const origin = new URL(baseUrl).origin + '/*';

    const has = await chrome.permissions.contains({ origins: [origin] });

    if (has) return true;



    // We can only request permission from a window/document context (options/popup page).

    // In background service workers, chrome.permissions.request will throw an error

    // because there is no user gesture.

    if (typeof window !== 'undefined' && chrome.permissions.request) {

      return await chrome.permissions.request({ origins: [origin] });

    }

    return false;

  } catch (_) {

    return false;

  }

}



function normalizeHeaders(headers) {

  const out = {};

  if (!headers) return out;

  if (headers instanceof Headers) {

    headers.forEach((value, key) => { out[key] = value; });

    return out;

  }

  return { ...headers };

}



function normalizeBody(body) {

  if (body === undefined || body === null) return null;

  if (typeof body === 'string') {

    try {

      return JSON.parse(body);

    } catch (_) {

      return body;

    }

  }

  return body;

}



export async function chatbridgeFetch(url, options = {}) {

  const provider = inferProviderFromUrl(url);

  const cfg = await getCloudProxyConfig();



  if (!cfg.ready || !provider) {

    return fetch(url, options);

  }



  const parsed = new URL(url);

  const query = {};

  parsed.searchParams.forEach((value, key) => {

    if (provider === 'gemini' && key === 'key') return;

    query[key] = value;

  });



  const headers = normalizeHeaders(options.headers);

  delete headers.Authorization;

  delete headers.authorization;



  const payload = {

    provider,

    base: `${parsed.protocol}//${parsed.host}`,

    path: parsed.pathname,

    query,

    method: options.method || 'GET',

    headers,

    body: normalizeBody(options.body),

  };



  return fetch(`${cfg.baseUrl}/v1/proxy`, {

    method: 'POST',

    headers: {

      'Content-Type': 'application/json',

      Authorization: `Bearer ${cfg.token}`,

      'X-ChatBridge-Client': 'extension',

    },

    body: JSON.stringify(payload),

  });

}



export async function testCloudProxyConnection(overrides) {

  const current = await getCloudProxyConfig({ force: true });

  const enabled = overrides?.enabled !== undefined ? !!overrides.enabled : current.enabled;

  const baseUrl = String(overrides?.baseUrl || current.baseUrl || '').trim().replace(/\/+$/, '');

  const token = String(overrides?.token || current.token || '').trim();



  if (!enabled) {

    return { ok: false, error: 'cloud_disabled', message: 'Cloud proxy is disabled.' };

  }

  if (!baseUrl || !token) {

    return { ok: false, error: 'cloud_incomplete', message: 'Gateway URL and access token are required.' };

  }



  const permitted = await requestCloudHostPermission(baseUrl);

  if (!permitted) {

    return { ok: false, error: 'permission_denied', message: 'Host permission for the gateway URL was denied.' };

  }



  try {

    const res = await fetch(`${baseUrl}/v1/health`, {

      method: 'GET',

      headers: {

        Authorization: `Bearer ${token}`,

        'X-ChatBridge-Client': 'extension',

      },

    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {

      return {

        ok: false,

        error: 'health_check_failed',

        message: body.error || `Gateway returned HTTP ${res.status}`,

        status: res.status,

        providers: body.providers || null,

      };

    }

    return {

      ok: true,

      providers: body.providers || {},

      service: body.service,

      version: body.version,

      environment: body.environment,

    };

  } catch (e) {

    return {

      ok: false,

      error: 'fetch_error',

      message: (e && e.message) || String(e),

    };

  }

}



export function invalidateCloudProxyCache() {

  __configCache = { value: null, ts: 0 };

  __masterKeyCache = null;

}

