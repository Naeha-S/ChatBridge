/**
 * Multi-provider text generation with ordered fallback.
 * Default chain: Gemini → HuggingFace → NVIDIA → OpenAI
 *
 * generateWithProviderFallback(opts, deps) — use for any AI text generation.
 * generateText(promptText, opts, deps)     — convenience wrapper with sensible defaults.
 */

export const PROVIDER_FALLBACK_ORDER = ['gemini', 'huggingface', 'nvidia', 'openai'];

const HF_CHAT_MODELS = [
  'meta-llama/Meta-Llama-3.1-8B-Instruct',   // Router (best)
  'meta-llama/Meta-Llama-3-8B-Instruct',      // Direct (stable)
  'google/gemma-2-2b-it',                      // Lightweight fallback
];

const HF_ROUTER_ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';
const HF_DIRECT_ENDPOINT_BASE = 'https://api-inference.huggingface.co/models';

const OPENAI_CHAT_MODEL = 'gpt-4o-mini';
const NVIDIA_CHAT_MODEL = 'meta/llama-3.1-8b-instruct';

// ─── Error classification ─────────────────────────────────────────────────────

function isAuthError(status, json) {
  if (status === 401 || status === 403) return true;
  if (
    status === 400 &&
    json?.error?.message &&
    /key|permission|auth|credential/i.test(json.error.message)
  ) return true;
  return false;
}

function isRetryableStatus(status) {
  // 404 means model/endpoint not found — worth trying next provider
  return status === 404 || status === 429 || status >= 500;
}

// ─── Response parsing ─────────────────────────────────────────────────────────

async function parseJsonResponse(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (_) {
    return { _parseError: true, _raw: text };
  }
}

// ─── OpenAI-compatible message builder ───────────────────────────────────────

function buildChatMessages(promptText, systemInstruction) {
  const messages = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
  messages.push({ role: 'user', content: promptText });
  return messages;
}

// ─── Provider: Gemini ────────────────────────────────────────────────────────

async function tryGemini(deps, opts) {
  const { promptText, systemInstruction, generationConfig, preferredModel, skipProviders } = opts;

  if (skipProviders?.includes('gemini')) return { ok: false, skipped: true };
  if (!(await deps.hasProviderAccess('gemini'))) return { ok: false, skipped: true };

  const geminiKey = await deps.getGeminiApiKey({ force: true });
  let lastError = null;

  for (let attempt = 0; attempt < deps.GEMINI_MODEL_PRIORITY.length; attempt++) {
    const currentModel = await deps.getNextAvailableModel(preferredModel);
    const endpoint = `https://generativelanguage.googleapis.com/v1/models/${currentModel}:generateContent?key=${geminiKey || 'proxy'}`;

    const body = {
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: {
        temperature: generationConfig.temperature ?? 0.7,
        topP: generationConfig.topP ?? 0.95,
        topK: generationConfig.topK ?? 40,
        maxOutputTokens: generationConfig.maxOutputTokens ?? 8192,
      },
    };
    if (!systemInstruction) delete body.systemInstruction;

    let res;
    try {
      const apiStart = performance.now();
      res = await deps.chatbridgeFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      deps.recordPerformanceMetric?.('api_latency', performance.now() - apiStart);
    } catch (fetchError) {
      deps.markModelFailed(currentModel, 'fetch_error');
      lastError = { model: currentModel, error: fetchError?.message || String(fetchError) };
      continue;
    }

    const json = await parseJsonResponse(res);
    if (json._parseError) {
      deps.markModelFailed(currentModel, 'parse_error');
      lastError = { model: currentModel, error: 'parse_error' };
      continue;
    }

    if (!res.ok) {
      deps.markModelFailed(currentModel, res.status);
      lastError = { model: currentModel, status: res.status, body: json };
      if (isAuthError(res.status, json)) {
        // Auth error — no point retrying other Gemini models, go to next provider
        return { ok: false, provider: 'gemini', retryNextProvider: true, lastError };
      }
      if (isRetryableStatus(res.status)) continue;
      return { ok: false, provider: 'gemini', retryNextProvider: true, lastError };
    }

    const result = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!result) {
      deps.markModelFailed(currentModel, 'no_candidates');
      lastError = { model: currentModel, error: 'no_candidates' };
      continue;
    }

    deps.markModelSuccess(currentModel);
    return {
      ok: true,
      result,
      model: currentModel,
      provider: 'gemini',
      usage: {
        inputTokens: json.usageMetadata?.promptTokenCount,
        outputTokens: json.usageMetadata?.candidatesTokenCount,
      },
    };
  }

  return { ok: false, provider: 'gemini', retryNextProvider: true, lastError };
}

// ─── Provider: OpenAI-compatible (shared by HF, NVIDIA, OpenAI) ──────────────

async function tryOpenAiCompatible(deps, opts, config) {
  const { promptText, systemInstruction, generationConfig, skipProviders } = opts;
  const { provider, endpoint, model } = config;

  if (skipProviders?.includes(provider)) return { ok: false, skipped: true };
  if (!(await deps.hasProviderAccess(provider))) return { ok: false, skipped: true };

  const key = await config.getKey({ force: true });
  const cloudActive = deps.isCloudProxyActive ? await deps.isCloudProxyActive() : false;
  if (!key && !cloudActive) return { ok: false, skipped: true };

  const messages = buildChatMessages(promptText, systemInstruction);
  const body = {
    model,
    messages,
    temperature: generationConfig.temperature ?? 0.7,
    max_tokens: generationConfig.maxOutputTokens ?? 4096,
  };

  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;

  let res;
  try {
    const apiStart = performance.now();
    res = await deps.chatbridgeFetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    deps.recordPerformanceMetric?.('api_latency', performance.now() - apiStart);
  } catch (fetchError) {
    return {
      ok: false,
      provider,
      retryNextProvider: true,
      lastError: fetchError?.message || String(fetchError),
    };
  }

  const json = await parseJsonResponse(res);
  if (json._parseError) {
    return { ok: false, provider, retryNextProvider: true, lastError: 'parse_error' };
  }

  if (!res.ok) {
    const retryNext =
      isAuthError(res.status, json) || isRetryableStatus(res.status) || res.status === 503;
    return {
      ok: false,
      provider,
      retryNextProvider: retryNext,
      lastError: { status: res.status, body: json },
    };
  }

  const result = json.choices?.[0]?.message?.content || '';
  if (!result) {
    return { ok: false, provider, retryNextProvider: true, lastError: 'no_choices' };
  }

  return {
    ok: true,
    result,
    model,
    provider,
    usage: {
      inputTokens: json.usage?.prompt_tokens,
      outputTokens: json.usage?.completion_tokens,
    },
  };
}

// ─── Provider: HuggingFace ───────────────────────────────────────────────────

async function tryHuggingFace(deps, opts) {
  if (opts.skipProviders?.includes('huggingface')) return { ok: false, skipped: true };
  if (!(await deps.hasProviderAccess('huggingface'))) return { ok: false, skipped: true };

  const hfKey = await deps.getHuggingFaceApiKey({ force: true });
  const cloudActive = deps.isCloudProxyActive ? await deps.isCloudProxyActive() : false;
  if (!hfKey && !cloudActive) return { ok: false, skipped: true };

  // Try router endpoint first (supports all models, best routing)
  for (const hfModel of HF_CHAT_MODELS) {
    const attempt = await tryOpenAiCompatible(deps, opts, {
      provider: 'huggingface',
      endpoint: HF_ROUTER_ENDPOINT,
      model: hfModel,
      getKey: deps.getHuggingFaceApiKey,
    });
    if (attempt.ok) return attempt;
    // If auth error, no point trying other models on the same endpoint
    if (attempt.lastError?.status === 401 || attempt.lastError?.status === 403) break;
  }

  // Fallback: direct inference endpoints per model
  for (const hfModel of HF_CHAT_MODELS) {
    const attempt = await tryOpenAiCompatible(deps, opts, {
      provider: 'huggingface',
      endpoint: `${HF_DIRECT_ENDPOINT_BASE}/${hfModel}/v1/chat/completions`,
      model: hfModel,
      getKey: deps.getHuggingFaceApiKey,
    });
    if (attempt.ok) return attempt;
    if (attempt.lastError?.status === 401 || attempt.lastError?.status === 403) break;
  }

  return { ok: false, provider: 'huggingface', retryNextProvider: true };
}

// ─── Provider: NVIDIA ────────────────────────────────────────────────────────

async function tryNvidia(deps, opts) {
  return tryOpenAiCompatible(deps, opts, {
    provider: 'nvidia',
    endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
    model: NVIDIA_CHAT_MODEL,
    getKey: deps.getNvidiaApiKey,
  });
}

// ─── Provider: OpenAI ────────────────────────────────────────────────────────

async function tryOpenAI(deps, opts) {
  return tryOpenAiCompatible(deps, opts, {
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: OPENAI_CHAT_MODEL,
    getKey: deps.getOpenAIApiKey,
  });
}

// ─── Provider dispatch map ────────────────────────────────────────────────────

const PROVIDER_HANDLERS = {
  gemini: tryGemini,
  huggingface: tryHuggingFace,
  nvidia: tryNvidia,
  openai: tryOpenAI,
};

// ─── Core fallback engine ─────────────────────────────────────────────────────

/**
 * Generate text using an ordered provider fallback chain.
 *
 * @param {object} opts
 *   promptText        {string}   The user prompt to send.
 *   systemInstruction {string}   Optional system/persona text.
 *   generationConfig  {object}   temperature, topP, topK, maxOutputTokens.
 *   providerOrder     {string[]} Override default provider order.
 *   preferredModel    {string}   Preferred Gemini model name.
 *   skipProviders     {string[]} Providers to skip this call.
 *   feature           {string}   Label for analytics/logging.
 * @param {object} deps  Injected dependencies (from getProviderRouterDeps() in background.js).
 * @returns {Promise<{ok, result, provider, model, usage, errors}>}
 */
export async function generateWithProviderFallback(opts, deps) {
  let order = opts.providerOrder || PROVIDER_FALLBACK_ORDER;
  if (opts.preferPersonalProviders && deps.hasLocalProviderAccess) {
    const localFirst = [];
    const fallback = [];
    for (const provider of order) {
      if (await deps.hasLocalProviderAccess(provider)) {
        localFirst.push(provider);
      } else {
        fallback.push(provider);
      }
    }
    order = [...localFirst, ...fallback];
  }
  const errors = [];
  let anyAccess = false;

  for (const provider of order) {
    if (!(await deps.hasProviderAccess(provider))) continue;
    anyAccess = true;

    const handler = PROVIDER_HANDLERS[provider];
    if (!handler) continue;

    console.log(`[ProviderFallback] Trying ${provider} for ${opts.feature || 'generate'}…`);
    let result;
    try {
      result = await handler(deps, opts);
    } catch (e) {
      console.warn(`[ProviderFallback] ${provider} threw:`, e?.message || e);
      errors.push({ provider, error: e?.message || String(e) });
      continue;
    }

    if (result.ok) {
      console.log(`[ProviderFallback] ✓ ${provider} succeeded (model: ${result.model})`);
      return Object.assign(result, { errors });
    }

    if (result.skipped) {
      // Not configured — silently skip
      continue;
    }

    errors.push({ provider, error: result.lastError });
    console.warn(`[ProviderFallback] ${provider} failed:`, result.lastError);

    if (!result.retryNextProvider) {
      // Hard stop — provider said don't continue
      break;
    }
  }

  if (!anyAccess) {
    return {
      ok: false,
      error: 'no_providers_configured',
      message:
        'No API keys configured. Open ChatBridge Options and add at least one key (Gemini, HuggingFace, NVIDIA, or OpenAI).',
      errors,
    };
  }

  return {
    ok: false,
    error: 'all_providers_failed',
    message: `All providers failed (tried: ${order.join(' → ')}). Check your API keys in ChatBridge Options.`,
    errors,
  };
}

/**
 * Convenience wrapper: generate text with a single prompt string.
 * Uses standard defaults; caller can override via opts.
 *
 * @param {string} promptText
 * @param {object} opts   Same as generateWithProviderFallback opts, minus promptText.
 * @param {object} deps   Same deps object.
 */
export async function generateText(promptText, opts, deps) {
  return generateWithProviderFallback(
    Object.assign(
      {
        promptText,
        systemInstruction: '',
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
        feature: 'generate',
      },
      opts || {},
      { promptText } // ensure promptText is always the passed string
    ),
    deps
  );
}
