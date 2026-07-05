const fs = require('fs');
const path = require('path');

let initialized = false;

function initBackgroundGlobals() {
  if (initialized) return;

  global.chrome.storage.onChanged = { addListener: jest.fn() };
  global.chrome.runtime.onInstalled = { addListener: jest.fn() };
  global.chrome.runtime.onStartup = { addListener: jest.fn() };
  global.chrome.runtime.onMessage = { addListener: jest.fn() };
  global.chrome.tabs = { create: jest.fn(), query: jest.fn() };
  global.chrome.commands = { onCommand: { addListener: jest.fn() } };
  global.chrome.alarms = { create: jest.fn(), onAlarm: { addListener: jest.fn() } };
  global.self = { addEventListener: jest.fn() };

  let analyticsCode = fs.readFileSync(path.resolve(__dirname, '../../core/telemetry.js'), 'utf8')
    .replace(/^\s*export\s+default\s+\w+\s*;?/gm, '')
    .replace(/^\s*export\s+\{[^}]+\}\s*;?/gm, '');
  eval(analyticsCode);

  let bgCode = fs.readFileSync(path.resolve(__dirname, '../../background.js'), 'utf8')
    .replace(/^\s*import\s+[^;]+;?/gm, '')
    .replace(/^\s*export\s+default\s+\w+\s*;?/gm, '')
    .replace(/^\s*export\s+\{[^}]+\}\s*;?/gm, '');
  bgCode += '\nglobalThis.__billingTestExports = { shouldResetCredits, checkAndDeductCredits, finalizeCreditTransaction };';
  eval(bgCode);

  initialized = true;
}

describe('Credits and Billing', () => {
  beforeAll(() => {
    initBackgroundGlobals();
  });

  beforeEach(() => {
    chrome.storage.local.storageMap = {
      chatbridge_subscription_tier: 'free',
      chatbridge_credits_balance: 100,
      chatbridge_credits_last_reset: Date.now(),
    };
    chrome.storage.session.storageMap = {};
  });

  test('shouldResetCredits rolls over on month boundary', () => {
    const { shouldResetCredits } = globalThis.__billingTestExports;
    const lastMonth = Date.UTC(2026, 5, 30);
    const nextMonth = Date.UTC(2026, 6, 1);
    expect(shouldResetCredits(lastMonth, nextMonth)).toBe(true);
    expect(shouldResetCredits(nextMonth, nextMonth)).toBe(false);
  });

  test('checkAndDeductCredits deducts credits for free tier without BYOK', async () => {
    const { checkAndDeductCredits } = globalThis.__billingTestExports;
    const result = await checkAndDeductCredits('summarize', 'gemini');
    expect(result.ok).toBe(true);
    expect(result.deducted).toBe(true);
    expect(result.balanceAfter).toBe(99);
    expect(chrome.storage.local.storageMap.chatbridge_credits_balance).toBe(99);
  });

  test('checkAndDeductCredits blocks when free tier balance is too low', async () => {
    const { checkAndDeductCredits } = globalThis.__billingTestExports;
    chrome.storage.local.storageMap.chatbridge_credits_balance = 0;
    const result = await checkAndDeductCredits('summarize', 'gemini');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('insufficient_credits');
  });

  test('checkAndDeductCredits bypasses credits when local BYOK is present', async () => {
    const { checkAndDeductCredits } = globalThis.__billingTestExports;
    chrome.storage.local.storageMap.chatbridge_gemini_key = 'AIza-test';
    const result = await checkAndDeductCredits('summarize', 'gemini');
    expect(result.ok).toBe(true);
    expect(result.deducted).toBe(false);
    expect(result.usingPersonalKey).toBe(true);
    expect(chrome.storage.local.storageMap.chatbridge_credits_balance).toBe(100);
  });

  test('finalizeCreditTransaction refunds a failed deducted request', async () => {
    const { checkAndDeductCredits, finalizeCreditTransaction } = globalThis.__billingTestExports;
    const txn = await checkAndDeductCredits('summarize', 'gemini');
    const response = await finalizeCreditTransaction(txn, { ok: false, error: 'upstream_failed' });
    expect(response.credits.refunded).toBe(true);
    expect(response.credits.remaining).toBe(100);
    expect(chrome.storage.local.storageMap.chatbridge_credits_balance).toBe(100);
  });
});
