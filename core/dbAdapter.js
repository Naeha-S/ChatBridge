/**
 * dbAdapter.js - Firebase Firestore integration via REST API for Chrome Extension
 *
 * Configure Firestore security rules so authenticated users can access only
 * their own profile document at /profiles/{userId}.
 */

const FIREBASE_PROJECT_ID = 'chatbridge-26cdb';
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

const DEFAULT_PROFILE = Object.freeze({
  email: '',
  tier: 'free',
  credits: 100,
  last_reset: 0,
  waitlisted: false
});

function getLocal(keys) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, resolve);
    } catch (_) {
      resolve({});
    }
  });
}

function setLocal(items) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(items, resolve);
    } catch (_) {
      resolve();
    }
  });
}

function normalizeTier(tier) {
  const value = String(tier || 'free').toLowerCase();
  return ['free', 'pro', 'max'].includes(value) ? value : 'free';
}

function normalizeCredits(tier, credits) {
  const limits = { free: 100, pro: 2000, max: 10000 };
  const limit = limits[tier] || 100;
  const value = Number(credits);
  return Number.isFinite(value) ? Math.max(0, value) : limit;
}

function normalizeProfile(profile, session) {
  const tier = normalizeTier(profile?.tier);
  return {
    email: String(profile?.email || session?.user?.email || ''),
    tier,
    credits: normalizeCredits(tier, profile?.credits),
    last_reset: Number(profile?.last_reset || 0) || Date.now(),
    waitlisted: !!profile?.waitlisted
  };
}

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

  localProfileKey(userId) {
    return `chatbridge_local_profile_${userId}`;
  },

  async getLocalProfile(session) {
    if (!session?.user?.id) {
      return normalizeProfile(DEFAULT_PROFILE, session);
    }
    const key = this.localProfileKey(session.user.id);
    const stored = await getLocal([key]);
    return normalizeProfile(stored[key] || DEFAULT_PROFILE, session);
  },

  async setLocalProfile(session, updates = {}) {
    if (!session?.user?.id) return false;
    const key = this.localProfileKey(session.user.id);
    const current = await this.getLocalProfile(session);
    const next = normalizeProfile({ ...current, ...updates }, session);
    next.updated_at = new Date().toISOString();
    await setLocal({ [key]: next });
    return next;
  },

  parseProfileDoc(doc) {
    if (!doc || !doc.fields) return null;
    const fields = doc.fields;
    return {
      email: fields.email?.stringValue || null,
      tier: fields.tier?.stringValue || null,
      credits: fields.credits?.integerValue ? parseInt(fields.credits.integerValue, 10) : null,
      last_reset: fields.last_reset?.integerValue ? parseInt(fields.last_reset.integerValue, 10) : null,
      waitlisted: fields.waitlisted?.booleanValue === true
    };
  },

  async readRemoteProfile(session) {
    try {
      const response = await fetch(this.profileDocPath(session.user.id), {
        method: 'GET',
        headers: this.getHeaders(session.access_token)
      });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        console.warn('Failed to read profile', await response.text());
        return null;
      }
      const json = await response.json();
      return normalizeProfile(this.parseProfileDoc(json), session);
    } catch (e) {
      console.error('readRemoteProfile error:', e);
      return null;
    }
  },

  async patchRemoteProfile(session, fields) {
    try {
      const response = await fetch(this.profileDocPath(session.user.id), {
        method: 'PATCH',
        headers: this.getHeaders(session.access_token),
        body: JSON.stringify({ fields })
      });
      if (!response.ok) {
        console.warn('Failed to patch profile', await response.text());
        return null;
      }
      const json = await response.json();
      return normalizeProfile(this.parseProfileDoc(json), session);
    } catch (e) {
      console.error('patchRemoteProfile error:', e);
      return null;
    }
  },

  async syncUserProfile(session) {
    if (!session || !session.access_token || !session.user?.id) return null;

    if (session.access_token.startsWith('local-')) {
      return this.setLocalProfile(session, { email: session.user.email });
    }

    const remote = await this.patchRemoteProfile(session, {
      email: { stringValue: String(session.user.email || '') },
      updated_at: { stringValue: new Date().toISOString() }
    });

    return remote || this.getLocalProfile(session);
  },

  async getCreditsAndTier(session) {
    if (!session || !session.access_token || !session.user?.id) return null;

    if (session.access_token.startsWith('local-')) {
      return this.getLocalProfile(session);
    }

    const remote = await this.readRemoteProfile(session);
    if (remote) return remote;
    return this.getLocalProfile(session);
  },

  async updateCredits(session, newCredits, lastReset) {
    if (!session || !session.access_token || !session.user?.id) return false;

    if (session.access_token.startsWith('local-')) {
      return this.setLocalProfile(session, {
        credits: newCredits,
        last_reset: lastReset
      });
    }

    const remote = await this.patchRemoteProfile(session, {
      credits: { integerValue: String(Math.max(0, Number(newCredits) || 0)) },
      last_reset: { integerValue: String(Number(lastReset) || Date.now()) }
    });

    if (remote) {
      return true;
    }

    await this.setLocalProfile(session, {
      credits: newCredits,
      last_reset: lastReset
    });
    return false;
  },

  async updateTier(session, tier, credits, lastReset = Date.now()) {
    if (!session || !session.access_token || !session.user?.id) return false;
    const normalizedTier = normalizeTier(tier);
    const normalizedCredits = normalizeCredits(normalizedTier, credits);
    const normalizedLastReset = Number(lastReset) || Date.now();

    if (session.access_token.startsWith('local-')) {
      return this.setLocalProfile(session, {
        tier: normalizedTier,
        credits: normalizedCredits,
        last_reset: normalizedLastReset
      });
    }

    const remote = await this.patchRemoteProfile(session, {
      tier: { stringValue: normalizedTier },
      credits: { integerValue: String(normalizedCredits) },
      last_reset: { integerValue: String(normalizedLastReset) }
    });

    if (remote) {
      return true;
    }

    await this.setLocalProfile(session, {
      tier: normalizedTier,
      credits: normalizedCredits,
      last_reset: normalizedLastReset
    });
    return false;
  },

  async isUserWaitlisted(session) {
    if (!session || !session.access_token || !session.user?.id) return false;

    if (session.access_token.startsWith('local-')) {
      const local = await this.getLocalProfile(session);
      return !!local.waitlisted;
    }

    const remote = await this.readRemoteProfile(session);
    if (remote) return !!remote.waitlisted;

    const local = await this.getLocalProfile(session);
    return !!local.waitlisted;
  }
};
