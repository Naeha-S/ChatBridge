/**
 * auth.js - Authentication management via Firebase Auth SDK
 */

const firebaseConfig = {
  apiKey: "AIzaSyArJBAq1qPdBkw8xy9ibMDMg_JZ1lSoMss",
  authDomain: "chatbridge-26cdb.firebaseapp.com",
  projectId: "chatbridge-26cdb",
  storageBucket: "chatbridge-26cdb.firebasestorage.app",
  messagingSenderId: "298285295649",
  appId: "1:298285295649:web:5343edae0dfaf4a787db60"
};

// Initialize Firebase compat if loaded globally
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const auth = {
  async login(providerName) {
    if (typeof firebase === 'undefined') {
      throw new Error('Firebase SDK not loaded');
    }
    let provider;
    if (providerName === 'google') {
      provider = new firebase.auth.GoogleAuthProvider();
      // Standard popup sign-in
      const result = await firebase.auth().signInWithPopup(provider);
      const user = result.user;
      const idToken = await user.getIdToken();
      const session = {
        access_token: idToken,
        refresh_token: user.refreshToken,
        user: {
          id: user.uid,
          email: user.email
        },
        expires_at: Date.now() + 3600 * 1000
      };
      await chrome.storage.local.set({ chatbridge_session: session });
      return session;
    } else {
      throw new Error('Unsupported provider: ' + providerName);
    }
  },

  async signInWithEmail(email, password) {
    if (typeof firebase === 'undefined') {
      throw new Error('Firebase SDK not loaded');
    }
    const result = await firebase.auth().signInWithEmailAndPassword(email, password);
    const user = result.user;
    const idToken = await user.getIdToken();
    const session = {
      access_token: idToken,
      refresh_token: user.refreshToken,
      user: {
        id: user.uid,
        email: user.email
      },
      expires_at: Date.now() + 3600 * 1000
    };
    await chrome.storage.local.set({ chatbridge_session: session });
    return session;
  },

  async signUpWithEmail(email, password) {
    if (typeof firebase === 'undefined') {
      throw new Error('Firebase SDK not loaded');
    }
    const result = await firebase.auth().createUserWithEmailAndPassword(email, password);
    const user = result.user;
    const idToken = await user.getIdToken();
    const session = {
      access_token: idToken,
      refresh_token: user.refreshToken,
      user: {
        id: user.uid,
        email: user.email
      },
      expires_at: Date.now() + 3600 * 1000
    };
    await chrome.storage.local.set({ chatbridge_session: session });
    return session;
  },

  async getSession() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['chatbridge_session'], async (data) => {
        let session = data.chatbridge_session || null;
        if (session && session.expires_at && Date.now() >= session.expires_at) {
          if (typeof firebase !== 'undefined' && firebase.auth().currentUser) {
            try {
              const idToken = await firebase.auth().currentUser.getIdToken(true);
              session.access_token = idToken;
              session.expires_at = Date.now() + 3600 * 1000;
              await chrome.storage.local.set({ chatbridge_session: session });
            } catch (e) {
              console.warn('Firebase token refresh failed:', e);
            }
          }
        }
        resolve(session);
      });
    });
  },

  async logout() {
    if (typeof firebase !== 'undefined') {
      try {
        await firebase.auth().signOut();
      } catch (e) {
        console.warn('Firebase signOut failed:', e);
      }
    }
    await chrome.storage.local.remove([
      'chatbridge_session',
      'chatbridge_logged_in',
      'chatbridge_user_email',
      'chatbridge_subscription_tier',
      'chatbridge_credits_balance',
      'chatbridge_credits_last_reset'
    ]);
  }
};
