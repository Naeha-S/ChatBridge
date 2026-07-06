/**
 * auth.js - Authentication management via Supabase OAuth
 */

const PROJECT_REF = 'pdvaydoykjjioudxzkif';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;

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
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': 'YOUR_SUPABASE_ANON_KEY_HERE' // TODO: Replace
        }
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
