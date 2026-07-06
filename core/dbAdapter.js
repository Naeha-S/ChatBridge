/**
 * dbAdapter.js - Supabase integration via REST API for Chrome Extension
 * 
 * NOTE: Replace SUPABASE_ANON_KEY with your actual anon key from Supabase dashboard.
 */

const PROJECT_REF = 'pdvaydoykjjioudxzkif';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE'; // TODO: Replace this!

export const dbAdapter = {
  
  getHeaders(token = null) {
    const headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      headers['Authorization'] = `Bearer ${SUPABASE_ANON_KEY}`;
    }
    return headers;
  },

  /**
   * Upsert user profile into `profiles` table.
   * Assumes table exists with: id (uuid), email (text), tier (text), credits (int)
   */
  async syncUserProfile(session) {
    if (!session || !session.access_token || !session.user) return null;
    
    try {
      const { user, access_token } = session;
      const payload = {
        id: user.id,
        email: user.email,
        updated_at: new Date().toISOString()
      };

      const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(access_token),
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        console.warn('Failed to sync profile', await response.text());
        return null;
      }
      return await response.json();
    } catch (e) {
      console.error('syncUserProfile error:', e);
      return null;
    }
  },

  /**
   * Get user credits and tier from the database
   */
  async getCreditsAndTier(session) {
    if (!session || !session.access_token || !session.user) return null;
    
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}&select=tier,credits,last_reset`, {
        method: 'GET',
        headers: this.getHeaders(session.access_token)
      });
      
      if (!response.ok) return null;
      const data = await response.json();
      if (data && data.length > 0) {
        return data[0]; // { tier, credits, last_reset }
      }
      return null;
    } catch (e) {
      console.error('getCreditsAndTier error:', e);
      return null;
    }
  },

  /**
   * Update credits in the database
   */
  async updateCredits(session, newCredits, lastReset) {
    if (!session || !session.access_token || !session.user) return false;
    
    try {
      const payload = {
        credits: newCredits,
        last_reset: lastReset
      };

      const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}`, {
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
