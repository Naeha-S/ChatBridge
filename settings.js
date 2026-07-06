import { auth } from './core/auth.js';

const uiLoggedIn = document.getElementById('settings-logged-in');
const uiLoggedOut = document.getElementById('settings-logged-out');
const elEmail = document.getElementById('user-email');
const elTier = document.getElementById('user-tier');
const elCredits = document.getElementById('user-credits');
const btnSignOut = document.getElementById('btn-sign-out');
const btnSignIn = document.getElementById('btn-sign-in');

const CREDIT_LIMITS = {
  free: 100,
  pro: 2000,
  max: 10000
};

const shouldResetCredits = (lastResetTs, nowTs = Date.now()) => {
  const lastReset = Number(lastResetTs || 0);
  if (!lastReset) return true;
  const previous = new Date(lastReset);
  const current = new Date(nowTs);
  return previous.getUTCFullYear() !== current.getUTCFullYear() ||
    previous.getUTCMonth() !== current.getUTCMonth();
};

async function refreshBillingState(sessionData) {
  const tier = String(sessionData.chatbridge_subscription_tier || 'free').toLowerCase();
  const limit = CREDIT_LIMITS[tier] || 100;
  const lastReset = Number(sessionData.chatbridge_credits_last_reset || 0) || 0;
  let balance = Number(sessionData.chatbridge_credits_balance ?? limit);
  if (!Number.isFinite(balance)) balance = limit;

  if (shouldResetCredits(lastReset)) {
    const now = Date.now();
    balance = limit;
    sessionData.chatbridge_credits_balance = balance;
    sessionData.chatbridge_credits_last_reset = now;
    await new Promise((resolve) => chrome.storage.local.set({
      chatbridge_credits_balance: balance,
      chatbridge_credits_last_reset: now
    }, resolve));
  }

  return sessionData;
}

async function updateUI() {
  const sessionData = await new Promise((resolve) => {
    chrome.storage.local.get([
      'chatbridge_logged_in',
      'chatbridge_user_email',
      'chatbridge_subscription_tier',
      'chatbridge_credits_balance'
    ], resolve);
  });

  if (sessionData.chatbridge_logged_in) {
    uiLoggedIn.hidden = false;
    uiLoggedOut.hidden = true;
    elEmail.textContent = sessionData.chatbridge_user_email || 'Unknown';
    elTier.textContent = sessionData.chatbridge_subscription_tier || 'Free';
    elCredits.textContent = sessionData.chatbridge_credits_balance !== undefined ? sessionData.chatbridge_credits_balance : 'N/A';
  } else {
    uiLoggedIn.hidden = true;
    uiLoggedOut.hidden = false;
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const relevantKeys = ['chatbridge_logged_in', 'chatbridge_subscription_tier', 'chatbridge_credits_balance', 'chatbridge_credits_last_reset', 'chatbridge_user_email'];
  if (Object.keys(changes).some((key) => relevantKeys.includes(key))) {
    updateUI();
  }
});

if (btnSignOut) {
  btnSignOut.addEventListener('click', async () => {
    await auth.logout();
    await updateUI();
    window.location.href = chrome.runtime.getURL('login.html');
  });
}

if (btnSignIn) {
  btnSignIn.addEventListener('click', () => {
    window.location.href = chrome.runtime.getURL('login.html');
  });
}

// Initial load
updateUI();
