/**
 * auth.js - Authentication management via Supabase OAuth
 */

const PROJECT_REF = 'pdvaydoykjjioudxzkif';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkdmF5ZG95a2pqaW91ZHh6a2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzMjY4NTAsImV4cCI6MjA5ODkwMjg1MH0.v9-QE6nKvjSp6f1-DoIEzMgiRWOU67JNCePAMpRG0ZQ';

const buildAuthHeaders = (token = null) => {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': 'application/json'
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else {
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }
  return headers;
};

export const auth = {
  /**
   * Start OAuth flow with a specific provider
   * @param {string} provider 'google' or 'github'
   */
  async login(provider) {
    try {
      const redirectUrl = chrome.identity.getRedirectURL();
      const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectUrl)}`;

      const responseUrl = await new Promise((resolve, reject) => {
        chrome.identity.launchWebAuthFlow({
          url: authUrl,
          interactive: true
        }, (callbackUrl) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(callbackUrl);
          }
        });
      });

      if (!responseUrl) throw new Error('No response URL returned');

      // Parse hash fragments
      const hash = new URL(responseUrl).hash.substring(1);
      const params = new URLSearchParams(hash);

      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (!accessToken) throw new Error('No access token in response');

      // Get user profile from Supabase using the token
      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: buildAuthHeaders(accessToken)
      });

      if (!userRes.ok) throw new Error('Failed to fetch user data');
      const user = await userRes.json();

      const session = {
        access_token: accessToken,
        refresh_token: refreshToken,
        user: user,
        expires_at: Date.now() + (parseInt(params.get('expires_in') || '3600') * 1000)
      };

      await chrome.storage.local.set({ chatbridge_session: session });
      return session;
    } catch (e) {
      console.error('Login failed:', e);
      throw e;
    }
  },

  async signInWithEmail(email, password) {
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          email,
          password
        })
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        const message = json.error_description || json.error || json.msg || json.message || 'Email login failed';
        throw new Error(message);
      }

      const sessionData = await response.json();
      const { access_token, refresh_token, expires_in, user } = sessionData;
      if (!access_token || !user) throw new Error('Invalid login response');

      const session = {
        access_token,
        refresh_token,
        user,
        expires_at: Date.now() + (parseInt(expires_in || '3600', 10) * 1000)
      };

      await chrome.storage.local.set({ chatbridge_session: session });
      return session;
    } catch (e) {
      console.error('Email login failed:', e);
      throw e;
    }
  },

  async signUpWithEmail(email, password) {
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          email,
          password
        })
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        const message = json.error_description || json.error || json.msg || json.message || json.error_code || 'Signup failed';
        if (response.status === 429) {
          throw new Error('Email signup rate limit exceeded. Please wait a moment and try again.');
        }
        throw new Error(message);
      }

      const sessionData = await response.json();
      const { access_token, refresh_token, expires_in, user } = sessionData;

      if (!user) {
        throw new Error('Signup succeeded but no user data returned');
      }

      const session = {
        access_token: access_token || null,
        refresh_token: refresh_token || null,
        user,
        expires_at: access_token ? Date.now() + (parseInt(expires_in || '3600', 10) * 1000) : null
      };

      if (access_token) {
        await chrome.storage.local.set({ chatbridge_session: session });
      }
      return session;
    } catch (e) {
      console.error('Email signup failed:', e);
      throw e;
    }
  },

  async getSession() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['chatbridge_session'], (data) => {
        resolve(data.chatbridge_session || null);
      });
    });
  },

  async logout() {
    await chrome.storage.local.remove(['chatbridge_session', 'chatbridge_logged_in', 'chatbridge_user_email', 'chatbridge_subscription_tier', 'chatbridge_credits_balance', 'chatbridge_credits_last_reset']);
  }
};
