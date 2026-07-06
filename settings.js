import { auth } from './core/auth.js';

const uiLoggedIn = document.getElementById('settings-logged-in');
const uiLoggedOut = document.getElementById('settings-logged-out');
const elEmail = document.getElementById('user-email');
const elTier = document.getElementById('user-tier');
const elCredits = document.getElementById('user-credits');
const btnSignOut = document.getElementById('btn-sign-out');
const btnSignIn = document.getElementById('btn-sign-in');

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
