"use strict";

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

const welcomeUrl = chrome.runtime.getURL("welcome.html");

const setBusyState = (isBusy) => {
  if (loginSubmit) {
    loginSubmit.disabled = isBusy;
    loginSubmit.textContent = isBusy ? "Signing in..." : "Continue";
  }

  [loginEmail, loginPassword, btnOauthGoogle, btnOauthGithub].forEach((element) => {
    if (element) element.disabled = isBusy;
  });
};

const navigateHome = () => {
  window.location.href = welcomeUrl;
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

const completeLogin = async (email) => {
  setBusyState(true);

  await new Promise((resolve) => window.setTimeout(resolve, 900));

  const currentData = await getAuthLocal([authKeys.tier]);
  const currentTier = String(currentData[authKeys.tier] || "free").toLowerCase();
  const initialCredits = currentTier === "max" ? 10000 : currentTier === "pro" ? 2000 : 100;

  await setAuthLocal({
    [authKeys.loggedIn]: true,
    [authKeys.userEmail]: email,
    [authKeys.tier]: currentTier,
    [authKeys.balance]: initialCredits,
    [authKeys.lastReset]: Date.now(),
  });

  if (authStatusPill) {
    authStatusPill.textContent = `Signed in as ${email}`;
  }
  if (loginForm) loginForm.hidden = true;
  if (loginSuccess) loginSuccess.hidden = false;
  if (loginSuccessCopy) {
    loginSuccessCopy.textContent = `Your ${currentTier} tier is active and ${initialCredits.toLocaleString()} monthly credits are ready.`;
  }

  window.setTimeout(() => {
    navigateHome();
  }, 1500);
};

if (loginForm) {
  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = loginEmail && loginEmail.value.trim() ? loginEmail.value.trim() : "naeha@chatbridge.dev";
    completeLogin(email);
  });
}

if (btnOauthGoogle) {
  btnOauthGoogle.addEventListener("click", () => completeLogin("google.user@chatbridge.dev"));
}

if (btnOauthGithub) {
  btnOauthGithub.addEventListener("click", () => completeLogin("github.user@chatbridge.dev"));
}

if (btnReturnWelcome) {
  btnReturnWelcome.addEventListener("click", navigateHome);
}

refreshLoggedInState();
