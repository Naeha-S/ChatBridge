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
const loginError = document.getElementById("login-error");
const loginSuccess = document.getElementById("login-success");
const loginSuccessCopy = document.getElementById("login-success-copy");
const authStatusPill = document.getElementById("auth-status-pill");
const btnOauthGoogle = document.getElementById("btn-oauth-google");
const btnOauthGithub = document.getElementById("btn-oauth-github");
const btnSignup = document.getElementById("login-signup-btn");
const btnReturnWelcome = document.getElementById("btn-return-welcome");
const authNonce = document.getElementById("auth-nonce");

const CREDIT_LIMITS = {
  free: 100,
  pro: 2000,
  max: 10000
};

const upgradeUrl = chrome.runtime.getURL("upgrade.html");

const setBusyState = (isBusy) => {
  if (loginSubmit) {
    loginSubmit.disabled = isBusy;
    loginSubmit.textContent = isBusy ? "Signing in..." : "Continue";
  }

  [loginEmail, loginPassword, btnOauthGoogle, btnOauthGithub, btnSignup].forEach((element) => {
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
    await persistSession(session);
  } catch (error) {
    console.error("Login failed", error);
    showError(error.message || "Login failed. Please try again.");
  } finally {
    setBusyState(false);
  }
};

const handleEmailLogin = async () => {
  setBusyState(true);
  clearError();

  const email = loginEmail?.value.trim() || "";
  const password = loginPassword?.value || "";

  if (!email || !password) {
    showError("Email and password are required.");
    setBusyState(false);
    return;
  }

  try {
    const session = await auth.signInWithEmail(email, password);
    await persistSession(session);
  } catch (error) {
    console.error("Email login failed", error);
    showError(error.message || "Email login failed. Please check your credentials.");
  } finally {
    setBusyState(false);
  }
};

const handleEmailSignup = async () => {
  setBusyState(true);
  clearError();

  const email = loginEmail?.value.trim() || "";
  const password = loginPassword?.value || "";

  if (!email || !password) {
    showError("Email and password are required.");
    setBusyState(false);
    return;
  }

  try {
    const session = await auth.signUpWithEmail(email, password);
    if (session.access_token) {
      await persistSession(session);
    } else {
      if (loginSuccess) loginSuccess.hidden = false;
      if (loginSuccessCopy) {
        loginSuccessCopy.textContent =
          "Account created. Please check your email to confirm your address before signing in.";
      }
      if (loginForm) loginForm.hidden = true;
    }
  } catch (error) {
    console.error("Email signup failed", error);
    showError(error.message || "Signup failed. Please try again.");
  } finally {
    setBusyState(false);
  }
};

const showError = (message) => {
  if (loginError) {
    loginError.hidden = false;
    loginError.textContent = message;
  } else {
    alert(message);
  }
};

const shouldResetCredits = (lastResetTs, nowTs = Date.now()) => {
  const lastReset = Number(lastResetTs || 0);
  if (!lastReset) return true;
  const previous = new Date(lastReset);
  const current = new Date(nowTs);
  return previous.getUTCFullYear() !== current.getUTCFullYear() ||
    previous.getUTCMonth() !== current.getUTCMonth();
};

const normalizeBillingInfo = async (session, dbInfo) => {
  let tier = String(dbInfo?.tier || 'free').toLowerCase();
  if (!['free', 'pro', 'max'].includes(tier)) tier = 'free';
  const limit = CREDIT_LIMITS[tier] || 100;
  let credits = Number(dbInfo?.credits ?? limit);
  if (!Number.isFinite(credits)) credits = limit;
  let lastReset = Number(dbInfo?.last_reset || 0) || 0;
  const now = Date.now();

  if (shouldResetCredits(lastReset, now)) {
    credits = limit;
    lastReset = now;
    await dbAdapter.updateCredits(session, credits, lastReset);
  }

  return {
    tier,
    credits,
    last_reset: lastReset
  };
};

const clearError = () => {
  if (loginError) {
    loginError.hidden = true;
    loginError.textContent = "";
  }
};

const persistSession = async (session) => {
  const userEmail = session?.user?.email || "";
  await dbAdapter.syncUserProfile(session);
  let dbInfo = await dbAdapter.getCreditsAndTier(session);

  if (!dbInfo) {
    dbInfo = { tier: 'free', credits: 100, last_reset: Date.now() };
    await dbAdapter.updateCredits(session, 100, dbInfo.last_reset);
  } else {
    dbInfo = await normalizeBillingInfo(session, dbInfo);
  }

  await setAuthLocal({
    [authKeys.loggedIn]: true,
    [authKeys.userEmail]: userEmail,
    [authKeys.tier]: dbInfo.tier,
    [authKeys.balance]: dbInfo.credits,
    [authKeys.lastReset]: dbInfo.last_reset || Date.now(),
  });

  if (authStatusPill) {
    authStatusPill.textContent = `Signed in as ${userEmail || 'guest'}`;
  }
  if (loginForm) loginForm.hidden = true;
  if (loginSuccess) loginSuccess.hidden = false;
  if (loginSuccessCopy) {
    loginSuccessCopy.textContent = `Your ${dbInfo.tier} tier is active and ${dbInfo.credits.toLocaleString()} monthly credits are ready.`;
  }

  window.setTimeout(() => {
    navigateToUpgrade();
  }, 1500);
};

if (loginForm) {
  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleEmailLogin();
  });
}

if (btnOauthGoogle) {
  btnOauthGoogle.addEventListener("click", () => handleProviderLogin("google"));
}

if (btnOauthGithub) {
  btnOauthGithub.addEventListener("click", () => handleProviderLogin("github"));
}

if (btnSignup) {
  btnSignup.addEventListener("click", () => handleEmailSignup());
}

if (btnReturnWelcome) {
  btnReturnWelcome.addEventListener("click", () => {
    window.location.href = chrome.runtime.getURL("welcome.html");
  });
}

refreshLoggedInState();
