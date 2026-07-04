/**

 * ChatBridge API Gateway (Cloudflare Worker)

 *

 * Proxies LLM / embedding requests so provider API keys stay on the server.

 * Clients authenticate with CHATBRIDGE_PROXY_SECRET via Authorization: Bearer.

 */



const DEFAULT_BASES = {

  gemini: 'https://generativelanguage.googleapis.com',

  openai: 'https://api.openai.com',

  huggingface: 'https://router.huggingface.co',

  nvidia: 'https://integrate.api.nvidia.com',

};



const CORS_HEADERS = {

  'Access-Control-Allow-Origin': '*',

  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',

  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-ChatBridge-Client',

};



const RATE_LIMIT_WINDOW_SEC = 60;

const RATE_LIMIT_MAX_REQUESTS = 120;



function json(data, status = 200, extraHeaders = {}) {

  return new Response(JSON.stringify(data), {

    status,

    headers: {

      'Content-Type': 'application/json; charset=utf-8',

      ...CORS_HEADERS,

      ...extraHeaders,

    },

  });

}



function timingSafeEqual(a, b) {

  const left = String(a || '');

  const right = String(b || '');

  if (left.length !== right.length) return false;

  let mismatch = 0;

  for (let i = 0; i < left.length; i += 1) {

    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);

  }

  return mismatch === 0;

}



function verifyAuth(request, env) {

  const secret = String(env.CHATBRIDGE_PROXY_SECRET || '').trim();

  if (!secret) {

    return { ok: false, status: 503, message: 'Gateway auth secret not configured' };

  }



  const header = request.headers.get('Authorization') || '';

  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!timingSafeEqual(token, secret)) {

    return { ok: false, status: 401, message: 'Unauthorized' };

  }



  return { ok: true };

}



function rateLimitKey(request) {

  const client = request.headers.get('X-ChatBridge-Client') || 'unknown';

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  return `rl:${client}:${ip}`;

}



async function checkRateLimit(request, env) {

  if (!env.RATE_LIMIT) return { ok: true };



  const key = rateLimitKey(request);

  const now = Math.floor(Date.now() / 1000);

  const windowStart = now - RATE_LIMIT_WINDOW_SEC;



  let bucket = [];

  try {

    const raw = await env.RATE_LIMIT.get(key);

    bucket = raw ? JSON.parse(raw) : [];

  } catch (_) {

    bucket = [];

  }



  bucket = bucket.filter((ts) => ts > windowStart);

  if (bucket.length >= RATE_LIMIT_MAX_REQUESTS) {

    const retryAfter = Math.max(1, bucket[0] + RATE_LIMIT_WINDOW_SEC - now);

    return { ok: false, retryAfter };

  }



  bucket.push(now);

  try {

    await env.RATE_LIMIT.put(key, JSON.stringify(bucket), { expirationTtl: RATE_LIMIT_WINDOW_SEC * 2 });

  } catch (_) { }



  return { ok: true, remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - bucket.length) };

}



function providerKey(env, provider) {

  switch (provider) {

    case 'gemini':

      return String(env.GEMINI_API_KEY || '').trim();

    case 'openai':

      return String(env.OPENAI_API_KEY || '').trim();

    case 'huggingface':

      return String(env.HUGGINGFACE_API_KEY || '').trim();

    case 'nvidia':

      return String(env.NVIDIA_API_KEY || '').trim();

    default:

      return '';

  }

}



function buildUpstreamUrl(payload) {

  const provider = payload.provider;

  const base = String(payload.base || DEFAULT_BASES[provider] || '').trim();

  const path = String(payload.path || '').trim();

  if (!base || !path) throw new Error('missing_base_or_path');



  const upstream = new URL(path.startsWith('/') ? path : `/${path}`, base);

  const query = payload.query && typeof payload.query === 'object' ? payload.query : {};

  for (const [key, value] of Object.entries(query)) {

    if (value === undefined || value === null) continue;

    if (provider === 'gemini' && key === 'key') continue;

    upstream.searchParams.set(key, String(value));

  }

  return upstream;

}



function applyProviderAuth(provider, upstreamUrl, headers, env) {

  const key = providerKey(env, provider);

  if (!key) {

    return { ok: false, status: 503, message: `${provider}_key_not_configured` };

  }



  if (provider === 'gemini') {

    upstreamUrl.searchParams.set('key', key);

    return { ok: true, headers };

  }



  const nextHeaders = { ...headers };

  nextHeaders.Authorization = `Bearer ${key}`;

  return { ok: true, headers: nextHeaders };

}



async function handleProxy(request, env) {

  let payload;

  try {

    payload = await request.json();

  } catch (_) {

    return json({ ok: false, error: 'invalid_json' }, 400);

  }



  const provider = String(payload.provider || '').trim();

  if (!DEFAULT_BASES[provider]) {

    return json({ ok: false, error: 'unknown_provider' }, 400);

  }



  let upstreamUrl;

  try {

    upstreamUrl = buildUpstreamUrl(payload);

  } catch (_) {

    return json({ ok: false, error: 'invalid_upstream_target' }, 400);

  }



  const incomingHeaders = payload.headers && typeof payload.headers === 'object' ? payload.headers : {};

  const sanitizedHeaders = { ...incomingHeaders };

  delete sanitizedHeaders.host;

  delete sanitizedHeaders.Host;

  delete sanitizedHeaders.authorization;

  delete sanitizedHeaders.Authorization;



  if (!sanitizedHeaders['Content-Type'] && !sanitizedHeaders['content-type']) {

    sanitizedHeaders['Content-Type'] = 'application/json';

  }



  const authResult = applyProviderAuth(provider, upstreamUrl, sanitizedHeaders, env);

  if (!authResult.ok) {

    return json({ ok: false, error: authResult.message }, authResult.status);

  }



  const method = String(payload.method || 'POST').toUpperCase();

  const hasBody = method !== 'GET' && method !== 'HEAD';

  let body;

  if (hasBody && payload.body !== undefined && payload.body !== null) {

    body = typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body);

  }



  const upstreamRes = await fetch(upstreamUrl.toString(), {

    method,

    headers: authResult.headers,

    body,

  });



  const contentType = upstreamRes.headers.get('Content-Type') || 'application/json';

  return new Response(upstreamRes.body, {

    status: upstreamRes.status,

    headers: {

      'Content-Type': contentType,

      'X-ChatBridge-Proxied': '1',

      'X-ChatBridge-Provider': provider,

      ...CORS_HEADERS,

    },

  });

}



export default {

  async fetch(request, env) {

    if (request.method === 'OPTIONS') {

      return new Response(null, { status: 204, headers: CORS_HEADERS });

    }



    const url = new URL(request.url);

    if ((url.pathname === '/' || url.pathname === '') && request.method === 'GET') {

      return json({

        ok: true,

        service: 'chatbridge-gateway',

        status: 'online',

        message: 'ChatBridge Cloud Gateway is running. Configure this URL in your extension Options page.'

      });

    }



    if (url.pathname === '/v1/info' && request.method === 'GET') {

      return json({

        ok: true,

        service: 'chatbridge-gateway',

        version: '1.0.0',

        environment: env.ENVIRONMENT || 'production',

      });

    }



    if (url.pathname === '/v1/health' && request.method === 'GET') {

      const auth = verifyAuth(request, env);

      return json({

        ok: true,

        service: 'chatbridge-gateway',

        version: '1.0.0',

        environment: env.ENVIRONMENT || 'production',

        providers: {

          gemini: !!providerKey(env, 'gemini'),

          openai: !!providerKey(env, 'openai'),

          huggingface: !!providerKey(env, 'huggingface'),

          nvidia: !!providerKey(env, 'nvidia'),

        },

        authenticated: auth.ok,

        rateLimit: env.RATE_LIMIT ? { windowSec: RATE_LIMIT_WINDOW_SEC, maxRequests: RATE_LIMIT_MAX_REQUESTS } : null,

      }, auth.ok ? 200 : 401);

    }



    if (url.pathname === '/v1/proxy' && request.method === 'POST') {

      const auth = verifyAuth(request, env);

      if (!auth.ok) return json({ ok: false, error: auth.message }, auth.status);



      const rate = await checkRateLimit(request, env);

      if (!rate.ok) {

        return json({ ok: false, error: 'rate_limit_exceeded' }, 429, {

          'Retry-After': String(rate.retryAfter || RATE_LIMIT_WINDOW_SEC),

        });

      }



      return handleProxy(request, env);

    }



    return json({ ok: false, error: 'not_found' }, 404);

  },

};

