/**
 * tests/unit/freeTier.test.js
 *
 * Tests for the dynamic free-tier system:
 *   - checkAndDeductCredits: login_required, waitlisted, insufficient_credits, byok bypass
 *   - getNextAvailableModel: free chain vs premium chain selection
 */

// ─── Minimal chrome stub ─────────────────────────────────────────────────────
const localStore = {};
const sessionStore = {};

global.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = {};
        const keysArr = Array.isArray(keys)
          ? keys
          : typeof keys === 'object'
          ? Object.keys(keys)
          : [keys];
        for (const k of keysArr) {
          result[k] =
            localStore[k] !== undefined
              ? localStore[k]
              : typeof keys === 'object'
              ? keys[k]
              : undefined;
        }
        if (cb) cb(result);
        return Promise.resolve(result);
      },
      set: (items, cb) => {
        Object.assign(localStore, items);
        if (cb) cb();
        return Promise.resolve();
      },
    },
    session: {
      get: (keys) => {
        const result = {};
        for (const k of Array.isArray(keys) ? keys : [keys]) result[k] = sessionStore[k];
        return Promise.resolve(result);
      },
      set: (items) => {
        Object.assign(sessionStore, items);
        return Promise.resolve();
      },
    },
  },
  runtime: { lastError: null },
};

// ─── Constants mirrored from background.js ───────────────────────────────────
const GEMINI_FREE_MODEL_CHAIN = [
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.0-flash',
  'gemini-2.5-flash',
  'gemma-4-26b',
];

const GEMINI_PREMIUM_MODEL_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-3.1-flash-lite',
  'gemini-3.1-pro',
  'gemini-3.5-flash',
  'gemini-2.5-flash-lite',
];

const MAX_MODEL_FAILURES = 1;
const FREE_TIER_STORAGE_KEYS = {
  waitlisted: 'chatbridge_waitlisted',
  creditSyncTs: 'chatbridge_server_credit_sync_ts',
};
const BILLING_STORAGE_KEYS = {
  tier: 'chatbridge_subscription_tier',
  balance: 'chatbridge_credits_balance',
  lastReset: 'chatbridge_credits_last_reset',
};
const TIER_CREDIT_LIMITS = { free: 100, pro: 2000, max: 10000 };

// ─── Inline implementations of testable pure functions ───────────────────────
function isPaidTier(tier) { return tier === 'pro' || tier === 'max'; }

function getCreditCost(action) {
  const costs = { summarize: 1, translate: 1, rewrite: 1, call_gemini: 3, chat: 3, query: 3 };
  return costs[String(action).toLowerCase()] || 0;
}

async function storageLocalGet(keys) {
  return new Promise(r => chrome.storage.local.get(keys, r));
}
async function storageLocalSet(items) {
  return new Promise(r => chrome.storage.local.set(items, r));
}

async function checkAndDeductCredits(action, _provider, overrides = {}) {
  const cost = getCreditCost(action);
  const data = await storageLocalGet([
    'chatbridge_logged_in',
    FREE_TIER_STORAGE_KEYS.waitlisted,
    BILLING_STORAGE_KEYS.balance,
    BILLING_STORAGE_KEYS.tier,
    BILLING_STORAGE_KEYS.lastReset,
  ]);
  const isLoggedIn   = !!data.chatbridge_logged_in;
  const isWaitlisted = !!data[FREE_TIER_STORAGE_KEYS.waitlisted];
  const balance      = data[BILLING_STORAGE_KEYS.balance] !== undefined ? Number(data[BILLING_STORAGE_KEYS.balance]) : 100;
  const tier         = data[BILLING_STORAGE_KEYS.tier] || 'free';
  const usingPersonalKey = !!overrides.usingPersonalKey;

  if (!isLoggedIn && !usingPersonalKey && cost > 0)
    return { ok: false, error: 'login_required', cost, balance };

  if (isWaitlisted && !usingPersonalKey && cost > 0)
    return { ok: false, error: 'waitlisted', cost, balance };

  if (cost === 0 || usingPersonalKey || isPaidTier(tier))
    return { ok: true, byok: usingPersonalKey, forceFreeProxy: !usingPersonalKey && !isPaidTier(tier), cost, balance, balanceAfter: balance, deducted: false };

  const resetDate = new Date(data[BILLING_STORAGE_KEYS.lastReset] || Date.now());
  resetDate.setUTCMonth(resetDate.getUTCMonth() + 1);
  resetDate.setUTCDate(1);
  const resetStr = resetDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

  if (balance < cost)
    return { ok: false, error: 'insufficient_credits', message: `You've used all ${TIER_CREDIT_LIMITS[tier] || 100} free credits this month. Resets on ${resetStr}.`, cost, balance, resetDate: resetStr };

  const newBalance = balance - cost;
  await storageLocalSet({ [BILLING_STORAGE_KEYS.balance]: newBalance });
  return { ok: true, byok: false, forceFreeProxy: true, cost, balance, balanceAfter: newBalance, deducted: true };
}

async function getNextAvailableModel(preferredModel, opts) {
  const byok  = !!(opts && opts.byok);
  const chain = byok ? GEMINI_PREMIUM_MODEL_CHAIN : GEMINI_FREE_MODEL_CHAIN;
  const key   = byok ? 'cb_modelStatePremium' : 'cb_modelState';
  const sd    = await chrome.storage.session.get([key]);
  const state = sd[key] || { currentModelIndex: 0, modelFailureCount: {} };

  if (preferredModel && chain.includes(preferredModel) && (state.modelFailureCount[preferredModel] || 0) < MAX_MODEL_FAILURES)
    return preferredModel;

  for (let i = 0; i < chain.length; i++) {
    const idx = (state.currentModelIndex + i) % chain.length;
    const m   = chain[idx];
    if ((state.modelFailureCount[m] || 0) < MAX_MODEL_FAILURES) {
      state.currentModelIndex = idx;
      await chrome.storage.session.set({ [key]: state });
      return m;
    }
  }
  state.modelFailureCount = {};
  state.currentModelIndex = 0;
  await chrome.storage.session.set({ [key]: state });
  return chain[0];
}

// ─── Reset stores between tests ──────────────────────────────────────────────
beforeEach(() => {
  for (const k of Object.keys(localStore))   delete localStore[k];
  for (const k of Object.keys(sessionStore)) delete sessionStore[k];
});

// ─── checkAndDeductCredits ───────────────────────────────────────────────────
describe('checkAndDeductCredits', () => {
  test('blocks anonymous users without a personal key', async () => {
    const r = await checkAndDeductCredits('summarize', 'gemini');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('login_required');
  });

  test('allows BYOK anonymous users (bypasses login check)', async () => {
    const r = await checkAndDeductCredits('summarize', 'gemini', { usingPersonalKey: true });
    expect(r.ok).toBe(true);
    expect(r.byok).toBe(true);
    expect(r.deducted).toBe(false);
  });

  test('blocks waitlisted logged-in users without a personal key', async () => {
    localStore['chatbridge_logged_in'] = true;
    localStore['chatbridge_waitlisted'] = true;
    localStore[BILLING_STORAGE_KEYS.balance] = 80;
    const r = await checkAndDeductCredits('summarize', 'gemini');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('waitlisted');
  });

  test('allows waitlisted BYOK users', async () => {
    localStore['chatbridge_logged_in'] = true;
    localStore['chatbridge_waitlisted'] = true;
    const r = await checkAndDeductCredits('summarize', 'gemini', { usingPersonalKey: true });
    expect(r.ok).toBe(true);
    expect(r.byok).toBe(true);
  });

  test('deducts credits for a logged-in free user', async () => {
    localStore['chatbridge_logged_in'] = true;
    localStore[BILLING_STORAGE_KEYS.balance] = 50;
    localStore[BILLING_STORAGE_KEYS.tier] = 'free';
    const r = await checkAndDeductCredits('summarize', 'gemini'); // cost = 1
    expect(r.ok).toBe(true);
    expect(r.deducted).toBe(true);
    expect(r.balanceAfter).toBe(49);
    expect(localStore[BILLING_STORAGE_KEYS.balance]).toBe(49);
  });

  test('blocks when balance is below cost', async () => {
    localStore['chatbridge_logged_in'] = true;
    localStore[BILLING_STORAGE_KEYS.balance] = 2;
    localStore[BILLING_STORAGE_KEYS.tier] = 'free';
    const r = await checkAndDeductCredits('call_gemini', 'gemini'); // cost = 3
    expect(r.ok).toBe(false);
    expect(r.error).toBe('insufficient_credits');
    expect(r.resetDate).toBeTruthy();
  });

  test('insufficient_credits message includes a month name', async () => {
    localStore['chatbridge_logged_in'] = true;
    localStore[BILLING_STORAGE_KEYS.balance] = 0;
    localStore[BILLING_STORAGE_KEYS.tier] = 'free';
    localStore[BILLING_STORAGE_KEYS.lastReset] = new Date('2025-07-01T00:00:00Z').getTime();
    const r = await checkAndDeductCredits('summarize', 'gemini');
    expect(r.error).toBe('insufficient_credits');
    expect(r.message).toContain('August');
  });

  test('pro tier bypasses credit deduction', async () => {
    localStore['chatbridge_logged_in'] = true;
    localStore[BILLING_STORAGE_KEYS.balance] = 0;
    localStore[BILLING_STORAGE_KEYS.tier] = 'pro';
    const r = await checkAndDeductCredits('call_gemini', 'gemini');
    expect(r.ok).toBe(true);
    expect(r.deducted).toBe(false);
  });

  test('zero-cost actions always pass through', async () => {
    const r = await checkAndDeductCredits('unknown_zero_cost_action', 'gemini');
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(0);
  });
});

// ─── getNextAvailableModel ───────────────────────────────────────────────────
describe('getNextAvailableModel', () => {
  test('returns first free-chain model by default', async () => {
    expect(await getNextAvailableModel(null, { byok: false })).toBe(GEMINI_FREE_MODEL_CHAIN[0]);
  });

  test('returns first premium-chain model for BYOK', async () => {
    expect(await getNextAvailableModel(null, { byok: true })).toBe(GEMINI_PREMIUM_MODEL_CHAIN[0]);
  });

  test('honours a valid preferred model in the free chain', async () => {
    expect(await getNextAvailableModel('gemini-3.1-flash-lite', { byok: false })).toBe('gemini-3.1-flash-lite');
  });

  test('honours a valid preferred model in the premium chain', async () => {
    expect(await getNextAvailableModel('gemini-2.5-pro', { byok: true })).toBe('gemini-2.5-pro');
  });

  test('skips a failed free-chain model', async () => {
    sessionStore['cb_modelState'] = {
      currentModelIndex: 0,
      modelFailureCount: { 'gemini-2.5-flash-lite': MAX_MODEL_FAILURES },
    };
    expect(await getNextAvailableModel(null, { byok: false })).toBe(GEMINI_FREE_MODEL_CHAIN[1]);
  });

  test('skips a failed premium-chain model', async () => {
    sessionStore['cb_modelStatePremium'] = {
      currentModelIndex: 0,
      modelFailureCount: { 'gemini-2.5-flash': MAX_MODEL_FAILURES },
    };
    expect(await getNextAvailableModel(null, { byok: true })).toBe(GEMINI_PREMIUM_MODEL_CHAIN[1]);
  });

  test('resets and returns first model when entire free chain has failed', async () => {
    const allFailed = {};
    for (const m of GEMINI_FREE_MODEL_CHAIN) allFailed[m] = MAX_MODEL_FAILURES;
    sessionStore['cb_modelState'] = { currentModelIndex: 0, modelFailureCount: allFailed };
    expect(await getNextAvailableModel(null, { byok: false })).toBe(GEMINI_FREE_MODEL_CHAIN[0]);
  });

  test('free and premium chain failures are isolated from each other', async () => {
    const allFailed = {};
    for (const m of GEMINI_FREE_MODEL_CHAIN) allFailed[m] = MAX_MODEL_FAILURES;
    sessionStore['cb_modelState'] = { currentModelIndex: 0, modelFailureCount: allFailed };
    // Premium chain should still be healthy
    expect(await getNextAvailableModel(null, { byok: true })).toBe(GEMINI_PREMIUM_MODEL_CHAIN[0]);
  });
});
