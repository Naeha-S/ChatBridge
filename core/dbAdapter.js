/**
 * dbAdapter.js - Firebase Firestore integration via REST API for Chrome Extension
 *
 * Configure Firestore security rules so authenticated users can access only
 * their own profile document at /profiles/{userId}.
 */

const FIREBASE_PROJECT_ID = 'chatbridge-26cdb';
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

export const dbAdapter = {
  getHeaders(token = null) {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  },

  profileDocPath(userId) {
    return `${FIRESTORE_BASE_URL}/profiles/${encodeURIComponent(userId)}`;
  },

  parseProfileDoc(doc) {
    if (!doc || !doc.fields) return null;
    const fields = doc.fields;
    const value = (field) => field?.stringValue ?? field?.integerValue ?? null;
    return {
      email: fields.email?.stringValue || null,
      tier: fields.tier?.stringValue || null,
      credits: fields.credits?.integerValue ? parseInt(fields.credits.integerValue, 10) : null,
      last_reset: fields.last_reset?.integerValue ? parseInt(fields.last_reset.integerValue, 10) : null
    };
  },

  async syncUserProfile(session) {
    if (!session || !session.access_token || !session.user?.id) return null;
    
    // If it's a local/fallback session, bypass Firestore REST API entirely
    if (session.access_token.startsWith('local-')) {
      try {
        const localProfileKey = `chatbridge_local_profile_${session.user.id}`;
        const stored = await new Promise(r => chrome.storage.local.get([localProfileKey], r));
        const current = stored[localProfileKey] || {
          email: session.user.email,
          tier: 'free',
          credits: 100,
          last_reset: Date.now()
        };
        current.updated_at = new Date().toISOString();
        await new Promise(r => chrome.storage.local.set({ [localProfileKey]: current }, r));
        return current;
      } catch (e) {
        console.error('Local profile sync error:', e);
        return null;
      }
    }

    try {
      const { user, access_token } = session;
      const payload = {
        fields: {
          email: { stringValue: String(user.email || '') },
          updated_at: { stringValue: new Date().toISOString() }
        }
      };

      const response = await fetch(this.profileDocPath(user.id), {
        method: 'PATCH',
        headers: this.getHeaders(access_token),
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.warn('Failed to sync profile', await response.text());
        return null;
      }
      const json = await response.json();
      return this.parseProfileDoc(json);
    } catch (e) {
      console.error('syncUserProfile error:', e);
      return null;
    }
  },

  async getCreditsAndTier(session) {
    if (!session || !session.access_token || !session.user?.id) return null;

    if (session.access_token.startsWith('local-')) {
      try {
        const localProfileKey = `chatbridge_local_profile_${session.user.id}`;
        const stored = await new Promise(r => chrome.storage.local.get([localProfileKey], r));
        return stored[localProfileKey] || {
          email: session.user.email,
          tier: 'free',
          credits: 100,
          last_reset: Date.now()
        };
      } catch (e) {
        console.error('Local getCreditsAndTier error:', e);
        return null;
      }
    }

    try {
      const response = await fetch(this.profileDocPath(session.user.id), {
        method: 'GET',
        headers: this.getHeaders(session.access_token)
      });
      if (!response.ok) return null;
      const json = await response.json();
      return this.parseProfileDoc(json);
    } catch (e) {
      console.error('getCreditsAndTier error:', e);
      return null;
    }
  },

  async updateCredits(session, newCredits, lastReset) {
    if (!session || !session.access_token || !session.user?.id) return false;

    if (session.access_token.startsWith('local-')) {
      try {
        const localProfileKey = `chatbridge_local_profile_${session.user.id}`;
        const stored = await new Promise(r => chrome.storage.local.get([localProfileKey], r));
        const current = stored[localProfileKey] || {
          email: session.user.email,
          tier: 'free',
          credits: 100,
          last_reset: Date.now()
        };
        current.credits = newCredits;
        current.last_reset = lastReset;
        await new Promise(r => chrome.storage.local.set({ [localProfileKey]: current }, r));
        return true;
      } catch (e) {
        console.error('Local updateCredits error:', e);
        return false;
      }
    }

    try {
      const payload = {
        fields: {
          credits: { integerValue: String(newCredits) },
          last_reset: { integerValue: String(lastReset) }
        }
      };
      const response = await fetch(this.profileDocPath(session.user.id), {
        method: 'PATCH',
        headers: this.getHeaders(session.access_token),
        body: JSON.stringify(payload)
      });
      return response.ok;
    } catch (e) {
      console.error('updateCredits error:', e);
      return false;
    }
  }
};
