/**
 * ChatBridge API Gateway (Cloudflare Worker) — v2.0
 *
 * Features:
 *  1. Server-side response caching (RESPONSE_CACHE KV)
 *  2. Automatic model fallbacks (gemini → openai → huggingface)
 *  3. Audit log with D1 SQL database (AUDIT_LOG)
 *  4. Prompt guardrails — system prompt injection + keyword blocking
 *  5. Tiered rate limiting — free vs premium quotas (RATE_LIMIT KV)
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BASES = {
  gemini:      'https://generativelanguage.googleapis.com',
  openai:      'https://api.openai.com',
  huggingface: 'https://router.huggingface.co',
  nvidia:      'https://integrate.api.nvidia.com',
};

// Ordered list tried when a provider fails with 429/5xx
const FALLBACK_CHAIN = ['gemini', 'openai', 'huggingface'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-ChatBridge-Client, X-CB-No-Cache',
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

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
  const left  = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

function verifyAuth(request, env) {
  const secret = String(env.CHATBRIDGE_PROXY_SECRET || '').trim();
  if (!secret) return { ok: false, status: 503, message: 'Gateway auth secret not configured' };

  const header = request.headers.get('Authorization') || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!timingSafeEqual(token, secret)) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }
  return { ok: true, token };
}

function providerKey(env, provider) {
  switch (provider) {
    case 'gemini':      return String(env.GEMINI_API_KEY      || '').trim();
    case 'openai':      return String(env.OPENAI_API_KEY      || '').trim();
    case 'huggingface': return String(env.HUGGINGFACE_API_KEY || '').trim();
    case 'nvidia':      return String(env.NVIDIA_API_KEY      || '').trim();
    default:            return '';
  }
}

function buildUpstreamUrl(payload) {
  const provider = payload.provider;
  const base     = String(payload.base || DEFAULT_BASES[provider] || '').trim();
  const path     = String(payload.path || '').trim();
  if (!base || !path) throw new Error('missing_base_or_path');

  const upstream = new URL(path.startsWith('/') ? path : `/${path}`, base);
  const query    = payload.query && typeof payload.query === 'object' ? payload.query : {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (provider === 'gemini' && key === 'key') continue;
    upstream.searchParams.set(key, String(value));
  }
  return upstream;
}

function applyProviderAuth(provider, upstreamUrl, headers, env) {
  const key = providerKey(env, provider);
  if (!key) return { ok: false, status: 503, message: `${provider}_key_not_configured` };

  if (provider === 'gemini') {
    upstreamUrl.searchParams.set('key', key);
    return { ok: true, headers };
  }

  const nextHeaders = { ...headers };
  nextHeaders.Authorization = `Bearer ${key}`;
  return { ok: true, headers: nextHeaders };
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 1 — SERVER-SIDE RESPONSE CACHE
// ─────────────────────────────────────────────────────────────────────────────

async function sha256(text) {
  const encoded = new TextEncoder().encode(text);
  const digest  = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getCacheKey(payload) {
  const stable = JSON.stringify({
    provider: payload.provider,
    path:     payload.path,
    method:   payload.method || 'POST',
    body:     payload.body,
  });
  const hash = await sha256(stable);
  return `cache:${hash}`;
}

async function getCachedResponse(env, cacheKey) {
  if (!env.RESPONSE_CACHE) return null;
  try {
    const raw = await env.RESPONSE_CACHE.get(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (_) {
    return null;
  }
}

async function setCachedResponse(env, cacheKey, data, ttlSec) {
  if (!env.RESPONSE_CACHE || ttlSec <= 0) return;
  try {
    await env.RESPONSE_CACHE.put(cacheKey, JSON.stringify(data), {
      expirationTtl: ttlSec,
    });
  } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 3 — AUDIT LOG (D1)
// ─────────────────────────────────────────────────────────────────────────────

async function ensureAuditTable(env) {
  if (!env.AUDIT_LOG) return;
  try {
    await env.AUDIT_LOG.prepare(`
      CREATE TABLE IF NOT EXISTS requests (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        ts           INTEGER,
        ip           TEXT,
        client_id    TEXT,
        provider     TEXT,
        path         TEXT,
        status       INTEGER,
        tokens_est   INTEGER,
        cache_hit    INTEGER,
        fallback_used TEXT
      )
    `).run();
  } catch (_) {}
}

async function writeAuditLog(env, entry) {
  if (!env.AUDIT_LOG) return;
  try {
    await env.AUDIT_LOG.prepare(
      `INSERT INTO requests (ts, ip, client_id, provider, path, status, tokens_est, cache_hit, fallback_used)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      entry.ts,
      entry.ip,
      entry.client_id,
      entry.provider,
      entry.path,
      entry.status,
      entry.tokens_est,
      entry.cache_hit ? 1 : 0,
      entry.fallback_used || null,
    ).run();
  } catch (_) {}
}

function estimateTokens(body) {
  // ~4 chars per token heuristic
  try {
    const text = typeof body === 'string' ? body : JSON.stringify(body || '');
    return Math.ceil(text.length / 4);
  } catch (_) {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 4 — PROMPT GUARDRAILS
// ─────────────────────────────────────────────────────────────────────────────

function applyGuardrails(payload, env) {
  const blockedRaw = String(env.BLOCKED_KEYWORDS || '').trim();
  const systemPrompt = String(env.SYSTEM_PROMPT || '').trim();

  // Build body object for inspection
  let body;
  try {
    body = typeof payload.body === 'string' ? JSON.parse(payload.body) : (payload.body || {});
  } catch (_) {
    body = {};
  }

  // Keyword blocking — search stringified body
  if (blockedRaw) {
    const patterns = blockedRaw.split('|').map(k => k.trim()).filter(Boolean);
    const bodyText = JSON.stringify(body).toLowerCase();
    for (const kw of patterns) {
      if (bodyText.includes(kw.toLowerCase())) {
        return { ok: false, blockedBy: kw };
      }
    }
  }

  // Inject system prompt
  if (systemPrompt) {
    const provider = String(payload.provider || '').trim();

    if (provider === 'gemini') {
      // Gemini uses systemInstruction.parts[0].text
      if (!body.systemInstruction) {
        body.systemInstruction = { parts: [{ text: systemPrompt }] };
      } else if (body.systemInstruction.parts && body.systemInstruction.parts.length > 0) {
        body.systemInstruction.parts[0].text =
          systemPrompt + '\n\n' + (body.systemInstruction.parts[0].text || '');
      }
    } else {
      // OpenAI-compatible: inject as first system message
      if (Array.isArray(body.messages)) {
        const hasSystem = body.messages[0]?.role === 'system';
        if (hasSystem) {
          body.messages[0].content = systemPrompt + '\n\n' + body.messages[0].content;
        } else {
          body.messages.unshift({ role: 'system', content: systemPrompt });
        }
      }
    }
  }

  return { ok: true, body: JSON.stringify(body) };
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 5 — TIERED RATE LIMITING
// ─────────────────────────────────────────────────────────────────────────────

function getTier(token, env) {
  let tierConfig = { default: { rpm: 20, daily: 100 }, premium: { rpm: 120, daily: -1 } };
  try {
    tierConfig = JSON.parse(String(env.TIER_CONFIG || '{}'));
  } catch (_) {}

  const secret = String(env.CHATBRIDGE_PROXY_SECRET || '').trim();
  // If token matches the master secret → premium unlimited tier
  if (timingSafeEqual(token, secret)) {
    return tierConfig.premium || { rpm: 120, daily: -1 };
  }
  return tierConfig.default || { rpm: 20, daily: 100 };
}

async function checkTieredRateLimit(request, env, token) {
  if (!env.RATE_LIMIT) return { ok: true };

  const ip       = request.headers.get('CF-Connecting-IP') || 'unknown';
  const clientId = request.headers.get('X-ChatBridge-Client') || 'unknown';
  const tier     = getTier(token, env);
  const now      = Math.floor(Date.now() / 1000);

  // ── Per-minute sliding window ─────────────────────────────────────────────
  const rpmKey    = `rl:rpm:${clientId}:${ip}`;
  const windowSec = 60;
  let bucket      = [];
  try {
    const raw = await env.RATE_LIMIT.get(rpmKey);
    bucket    = raw ? JSON.parse(raw) : [];
  } catch (_) {}

  bucket = bucket.filter(ts => ts > now - windowSec);
  if (bucket.length >= tier.rpm) {
    const retryAfter = Math.max(1, bucket[0] + windowSec - now);
    return { ok: false, reason: 'rpm_exceeded', retryAfter, tier };
  }
  bucket.push(now);
  try {
    await env.RATE_LIMIT.put(rpmKey, JSON.stringify(bucket), { expirationTtl: windowSec * 2 });
  } catch (_) {}

  // ── Daily counter ─────────────────────────────────────────────────────────
  if (tier.daily > 0) {
    const today    = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const dayKey   = `rl:day:${clientId}:${ip}:${today}`;
    let dayCount   = 0;
    try {
      const raw = await env.RATE_LIMIT.get(dayKey);
      dayCount  = raw ? parseInt(raw, 10) : 0;
    } catch (_) {}

    if (dayCount >= tier.daily) {
      return { ok: false, reason: 'daily_limit_exceeded', retryAfter: 86400, tier };
    }
    try {
      await env.RATE_LIMIT.put(dayKey, String(dayCount + 1), { expirationTtl: 86400 + 3600 });
    } catch (_) {}
  }

  return {
    ok: true,
    remaining_rpm:   Math.max(0, tier.rpm - bucket.length),
    remaining_daily: tier.daily < 0 ? 'unlimited' : Math.max(0, tier.daily - 1),
    tier,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 2 — MODEL FALLBACKS + CORE PROXY
// ─────────────────────────────────────────────────────────────────────────────

async function attemptUpstream(provider, payload, env) {
  const tryPayload = { ...payload, provider };

  let upstreamUrl;
  try {
    upstreamUrl = buildUpstreamUrl(tryPayload);
  } catch (_) {
    return { ok: false, error: 'invalid_upstream_target' };
  }

  const incomingHeaders = tryPayload.headers && typeof tryPayload.headers === 'object'
    ? tryPayload.headers : {};
  const sanitizedHeaders = { ...incomingHeaders };
  delete sanitizedHeaders.host;
  delete sanitizedHeaders.Host;
  delete sanitizedHeaders.authorization;
  delete sanitizedHeaders.Authorization;

  if (!sanitizedHeaders['Content-Type'] && !sanitizedHeaders['content-type']) {
    sanitizedHeaders['Content-Type'] = 'application/json';
  }

  const authResult = applyProviderAuth(provider, upstreamUrl, sanitizedHeaders, env);
  if (!authResult.ok) return { ok: false, error: authResult.message, skip: true };

  const method  = String(tryPayload.method || 'POST').toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  let body;
  if (hasBody && tryPayload.body !== undefined && tryPayload.body !== null) {
    body = typeof tryPayload.body === 'string' ? tryPayload.body : JSON.stringify(tryPayload.body);
  }

  try {
    const res = await fetch(upstreamUrl.toString(), {
      method,
      headers: authResult.headers,
      body,
    });

    // Retry on retryable errors
    if (res.status === 429 || res.status >= 500) {
      return { ok: false, status: res.status, retryable: true };
    }

    // Read response body so we can cache it
    const responseBody = await res.text();
    return { ok: true, status: res.status, body: responseBody, contentType: res.headers.get('Content-Type') || 'application/json' };
  } catch (e) {
    return { ok: false, error: e.message, retryable: true };
  }
}

async function handleProxy(request, env, token) {
  let payload;
  try {
    payload = await request.json();
  } catch (_) {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const requestedProvider = String(payload.provider || '').trim();
  if (!DEFAULT_BASES[requestedProvider]) {
    return json({ ok: false, error: 'unknown_provider' }, 400);
  }

  const ip       = request.headers.get('CF-Connecting-IP') || 'unknown';
  const clientId = request.headers.get('X-ChatBridge-Client') || 'unknown';
  const noCache  = request.headers.get('X-CB-No-Cache') === '1';
  const cacheTtl = parseInt(String(env.CACHE_TTL_SEC || '300'), 10);

  // ── FEATURE 4: Apply guardrails ───────────────────────────────────────────
  const guardrail = applyGuardrails(payload, env);
  if (!guardrail.ok) {
    await writeAuditLog(env, {
      ts: Date.now(), ip, client_id: clientId,
      provider: requestedProvider, path: payload.path || '',
      status: 403, tokens_est: 0, cache_hit: false, fallback_used: null,
    });
    return json({ ok: false, error: 'prompt_blocked', reason: `Blocked keyword: "${guardrail.blockedBy}"` }, 403);
  }
  // Use guardrail-modified body going forward
  payload = { ...payload, body: guardrail.body };

  // ── FEATURE 1: Check cache (skip for real-time / streaming requests) ──────
  let cacheKey = null;
  if (!noCache && cacheTtl > 0) {
    cacheKey = await getCacheKey(payload);
    const cached = await getCachedResponse(env, cacheKey);
    if (cached) {
      await writeAuditLog(env, {
        ts: Date.now(), ip, client_id: clientId,
        provider: requestedProvider, path: payload.path || '',
        status: 200, tokens_est: estimateTokens(payload.body),
        cache_hit: true, fallback_used: null,
      });
      return new Response(cached.body, {
        status: 200,
        headers: {
          'Content-Type': cached.contentType || 'application/json',
          'X-ChatBridge-Proxied': '1',
          'X-ChatBridge-Provider': requestedProvider,
          'X-CB-Cache': 'HIT',
          ...CORS_HEADERS,
        },
      });
    }
  }

  // ── FEATURE 2: Try primary provider, fallback on failure ──────────────────
  const providersToTry = [
    requestedProvider,
    ...FALLBACK_CHAIN.filter(p => p !== requestedProvider && providerKey(env, p)),
  ];

  let lastResult = null;
  let usedProvider = requestedProvider;

  for (const provider of providersToTry) {
    const result = await attemptUpstream(provider, payload, env);

    if (result.ok) {
      lastResult   = result;
      usedProvider = provider;
      break;
    }

    if (result.skip) continue;   // provider not configured — skip silently
    if (!result.retryable) break; // hard error — don't try fallbacks
    // retryable → try next provider
  }

  if (!lastResult || !lastResult.ok) {
    const status = lastResult?.status || 502;
    await writeAuditLog(env, {
      ts: Date.now(), ip, client_id: clientId,
      provider: requestedProvider, path: payload.path || '',
      status, tokens_est: 0, cache_hit: false, fallback_used: null,
    });
    return json({ ok: false, error: 'upstream_failed', status }, status);
  }

  // ── FEATURE 1: Store successful response in cache ─────────────────────────
  if (!noCache && cacheKey && cacheTtl > 0) {
    await setCachedResponse(env, cacheKey, {
      body:        lastResult.body,
      contentType: lastResult.contentType,
    }, cacheTtl);
  }

  // ── FEATURE 3: Write audit log ────────────────────────────────────────────
  await writeAuditLog(env, {
    ts:            Date.now(),
    ip,
    client_id:     clientId,
    provider:      usedProvider,
    path:          payload.path || '',
    status:        lastResult.status,
    tokens_est:    estimateTokens(payload.body),
    cache_hit:     false,
    fallback_used: usedProvider !== requestedProvider ? usedProvider : null,
  });

  // ── Build response ────────────────────────────────────────────────────────
  const responseHeaders = {
    'Content-Type':            lastResult.contentType,
    'X-ChatBridge-Proxied':    '1',
    'X-ChatBridge-Provider':   usedProvider,
    'X-CB-Cache':              'MISS',
    ...CORS_HEADERS,
  };
  if (usedProvider !== requestedProvider) {
    responseHeaders['X-CB-Fallback-Provider'] = usedProvider;
  }

  return new Response(lastResult.body, {
    status:  lastResult.status,
    headers: responseHeaders,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN STATS ENDPOINT
// ─────────────────────────────────────────────────────────────────────────────

async function handleAdminStats(env) {
  if (!env.AUDIT_LOG) {
    return json({ ok: false, error: 'audit_log_not_configured' }, 503);
  }

  const since = Date.now() - 86400 * 1000; // last 24 hours

  try {
    const totalResult = await env.AUDIT_LOG.prepare(
      'SELECT COUNT(*) as count, SUM(tokens_est) as tokens FROM requests WHERE ts > ?'
    ).bind(since).first();

    const cacheResult = await env.AUDIT_LOG.prepare(
      'SELECT COUNT(*) as count FROM requests WHERE ts > ? AND cache_hit = 1'
    ).bind(since).first();

    const providerResult = await env.AUDIT_LOG.prepare(
      'SELECT provider, COUNT(*) as count FROM requests WHERE ts > ? GROUP BY provider ORDER BY count DESC'
    ).bind(since).all();

    const errorResult = await env.AUDIT_LOG.prepare(
      'SELECT COUNT(*) as count FROM requests WHERE ts > ? AND status >= 400'
    ).bind(since).first();

    const fallbackResult = await env.AUDIT_LOG.prepare(
      'SELECT COUNT(*) as count FROM requests WHERE ts > ? AND fallback_used IS NOT NULL'
    ).bind(since).first();

    return json({
      ok: true,
      period: '24h',
      total_requests:   totalResult?.count  || 0,
      total_tokens_est: totalResult?.tokens || 0,
      cache_hits:       cacheResult?.count  || 0,
      errors:           errorResult?.count  || 0,
      fallbacks_used:   fallbackResult?.count || 0,
      by_provider:      providerResult?.results || [],
    });
  } catch (e) {
    return json({ ok: false, error: 'db_error', detail: e.message }, 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN FETCH HANDLER
// ─────────────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    // Ensure D1 table exists (idempotent, cached internally by D1)
    await ensureAuditTable(env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // ── Public endpoints ───────────────────────────────────────────────────
    if ((url.pathname === '/' || url.pathname === '') && request.method === 'GET') {
      return json({
        ok:      true,
        service: 'chatbridge-gateway',
        status:  'online',
        version: '2.0.0',
        message: 'ChatBridge Cloud Gateway is running.',
        features: ['response-cache', 'model-fallbacks', 'audit-log', 'prompt-guardrails', 'tiered-rate-limiting'],
      });
    }

    if (url.pathname === '/v1/info' && request.method === 'GET') {
      return json({
        ok:          true,
        service:     'chatbridge-gateway',
        version:     '2.0.0',
        environment: env.ENVIRONMENT || 'production',
      });
    }

    // ── Authenticated endpoints ────────────────────────────────────────────
    const auth = verifyAuth(request, env);

    if (url.pathname === '/v1/health' && request.method === 'GET') {
      return json({
        ok:          true,
        service:     'chatbridge-gateway',
        version:     '2.0.0',
        environment: env.ENVIRONMENT || 'production',
        providers: {
          gemini:      !!providerKey(env, 'gemini'),
          openai:      !!providerKey(env, 'openai'),
          huggingface: !!providerKey(env, 'huggingface'),
          nvidia:      !!providerKey(env, 'nvidia'),
        },
        authenticated: auth.ok,
        features: {
          cache:         !!env.RESPONSE_CACHE,
          audit_log:     !!env.AUDIT_LOG,
          rate_limiting: !!env.RATE_LIMIT,
          guardrails:    !!(env.SYSTEM_PROMPT || env.BLOCKED_KEYWORDS),
          fallbacks:     true,
        },
      }, auth.ok ? 200 : 401);
    }

    if (url.pathname === '/v1/admin/stats' && request.method === 'GET') {
      if (!auth.ok) return json({ ok: false, error: auth.message }, auth.status);
      return handleAdminStats(env);
    }

    if (url.pathname === '/v1/proxy' && request.method === 'POST') {
      if (!auth.ok) return json({ ok: false, error: auth.message }, auth.status);

      // FEATURE 5: Tiered rate limit check
      const rate = await checkTieredRateLimit(request, env, auth.token);
      if (!rate.ok) {
        return json({
          ok:    false,
          error: rate.reason,
          tier:  rate.tier,
        }, 429, {
          'Retry-After': String(rate.retryAfter || 60),
        });
      }

      return handleProxy(request, env, auth.token);
    }

    return json({ ok: false, error: 'not_found' }, 404);
  },
};
