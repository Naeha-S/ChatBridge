import { auth } from './core/auth.js';
import { dbAdapter } from './core/dbAdapter.js';

const authKeys = {
  loggedIn: "chatbridge_logged_in",
  userEmail: "chatbridge_user_email",
  tier: "chatbridge_subscription_tier",
  balance: "chatbridge_credits_balance",
  lastReset: "chatbridge_credits_last_reset",
};

const getAuthLocal = (keys) =>
  new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, resolve);
    } catch (_) {
      resolve({});
    }
  });

const setAuthLocal = (items) =>
  new Promise((resolve) => {
    try {
      chrome.storage.local.set(items, resolve);
    } catch (_) {
      resolve();
    }
  });

const loginForm = document.getElementById("login-form");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginSubmit = document.getElementById("login-submit");
const loginSuccess = document.getElementById("login-success");
const loginSuccessCopy = document.getElementById("login-success-copy");
const authStatusPill = document.getElementById("auth-status-pill");
const btnOauthGoogle = document.getElementById("btn-oauth-google");
const btnOauthGithub = document.getElementById("btn-oauth-github");
const btnReturnWelcome = document.getElementById("btn-return-welcome");

const upgradeUrl = chrome.runtime.getURL("upgrade.html");

const setBusyState = (isBusy) => {
  if (loginSubmit) {
    loginSubmit.disabled = isBusy;
    loginSubmit.textContent = isBusy ? "Signing in..." : "Continue";
  }

  [loginEmail, loginPassword, btnOauthGoogle, btnOauthGithub].forEach((element) => {
    if (element) element.disabled = isBusy;
  });
};

const navigateToUpgrade = () => {
  window.location.href = upgradeUrl;
};

const refreshLoggedInState = async () => {
  const data = await getAuthLocal([authKeys.loggedIn, authKeys.userEmail, authKeys.tier]);
  const isLoggedIn = !!data[authKeys.loggedIn];
  const email = String(data[authKeys.userEmail] || "").trim();
  const tier = String(data[authKeys.tier] || "free").toLowerCase();

  if (authStatusPill) {
    authStatusPill.textContent = isLoggedIn ? `Signed in as ${email || "guest"}` : "Not signed in";
  }

  if (isLoggedIn) {
    if (loginForm) loginForm.hidden = true;
    if (loginSuccess) loginSuccess.hidden = false;
    if (loginSuccessCopy) {
      const creditText = tier === "max" ? "10,000" : tier === "pro" ? "2,000" : "100";
      loginSuccessCopy.textContent = `Your ${tier} tier is active and ${creditText} monthly credits are ready.`;
    }
  }
};

const handleProviderLogin = async (provider) => {
  setBusyState(true);
  try {
    const session = await auth.login(provider);
    
    // Sync profile and get credits from DB
    await dbAdapter.syncUserProfile(session);
    let dbInfo = await dbAdapter.getCreditsAndTier(session);
    
    // If no dbInfo, default to free 100
    if (!dbInfo) {
      dbInfo = { tier: 'free', credits: 100, last_reset: Date.now() };
      await dbAdapter.updateCredits(session, 100, dbInfo.last_reset);
    }
    
    await setAuthLocal({
      [authKeys.loggedIn]: true,
      [authKeys.userEmail]: session.user.email,
      [authKeys.tier]: dbInfo.tier,
      [authKeys.balance]: dbInfo.credits,
      [authKeys.lastReset]: dbInfo.last_reset || Date.now(),
    });

    if (authStatusPill) {
      authStatusPill.textContent = `Signed in as ${session.user.email}`;
    }
    if (loginForm) loginForm.hidden = true;
    if (loginSuccess) loginSuccess.hidden = false;
    if (loginSuccessCopy) {
      loginSuccessCopy.textContent = `Your ${dbInfo.tier} tier is active and ${dbInfo.credits.toLocaleString()} monthly credits are ready.`;
    }

    window.setTimeout(() => {
      navigateToUpgrade();
    }, 1500);

  } catch (error) {
    console.error("Login failed", error);
    alert("Login failed: " + error.message);
  } finally {
    setBusyState(false);
  }
};

// Handle Email/Password login placeholder
if (loginForm) {
  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    alert("Email/Password login is not implemented in this demo. Please use Google or GitHub.");
  });
}

if (btnOauthGoogle) {
  btnOauthGoogle.addEventListener("click", () => handleProviderLogin("google"));
}

if (btnOauthGithub) {
  btnOauthGithub.addEventListener("click", () => handleProviderLogin("github"));
}

if (btnReturnWelcome) {
  btnReturnWelcome.addEventListener("click", () => {
    window.location.href = chrome.runtime.getURL("welcome.html");
  });
}

refreshLoggedInState();
