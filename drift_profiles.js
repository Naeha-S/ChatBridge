// drift_profiles.js - Conversation Drift Detection & Cross-Platform Context Repair
// Tracks per-platform drift statistics and manages the drift detection/repair feedback loop
// Depends on: storage.js, SegmentEngine.js (loaded before this in manifest)

(function () {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'chatbridge_drift_profiles';
  const DRIFT_LOG_KEY = 'chatbridge_drift_log';
  const DRIFT_THRESHOLD = 0.65; // Below this cosine similarity = context drift detected
  const REPAIR_IMPROVEMENT_THRESHOLD = 0.10; // Repair must improve score by at least this
  const MAX_LOG_ENTRIES = 200; // Max drift log entries to retain
  const MAX_SOURCE_CHARS = 3000; // Max chars from source context for embedding
  const MAX_REPAIR_ATTEMPTS = 2; // Max repair prompt injections per transfer

  // ─── DriftProfile: Per-platform statistics ──────────────────────────────────
  /**
   * Shape of a platform drift profile:
   * {
   *   platformId: string,
   *   totalTransfers: number,
   *   driftDetectedCount: number,
   *   repairsAttempted: number,
   *   repairsSuccessful: number,
   *   avgDriftScore: number,
   *   avgRepairImprovement: number,
   *   lastUpdated: number (timestamp),
   *   driftScoreHistory: number[] (last 20 scores)
   * }
   */

  class DriftProfileManager {
    constructor() {
      this.profiles = {};       // platformId -> profile object
      this.driftLog = [];       // Array of drift event records
      this._loaded = false;
    }

    // ─── Persistence ────────────────────────────────────────────────────────

    /** Load profiles from chrome.storage */
    async load() {
      try {
        const data = await new Promise((resolve) => {
          chrome.storage.local.get([STORAGE_KEY, DRIFT_LOG_KEY], (result) => {
            resolve(result || {});
          });
        });
        this.profiles = data[STORAGE_KEY] || {};
        this.driftLog = data[DRIFT_LOG_KEY] || [];
        this._loaded = true;
        console.log('[ChatBridge] DriftProfileManager loaded:', Object.keys(this.profiles).length, 'profiles,', this.driftLog.length, 'log entries');
      } catch (e) {
        console.warn('[ChatBridge] DriftProfileManager load error:', e);
        this.profiles = {};
        this.driftLog = [];
      }
    }

    /** Save profiles to chrome.storage */
    async save() {
      try {
        // Trim drift log if too large
        if (this.driftLog.length > MAX_LOG_ENTRIES) {
          this.driftLog = this.driftLog.slice(-MAX_LOG_ENTRIES);
        }
        await new Promise((resolve) => {
          chrome.storage.local.set({
            [STORAGE_KEY]: this.profiles,
            [DRIFT_LOG_KEY]: this.driftLog
          }, resolve);
        });
      } catch (e) {
        console.warn('[ChatBridge] DriftProfileManager save error:', e);
      }
    }

    // ─── Profile Management ─────────────────────────────────────────────────

    /** Get or create a profile for a platform */
    getProfile(platformId) {
      if (!this.profiles[platformId]) {
        this.profiles[platformId] = {
          platformId,
          totalTransfers: 0,
          driftDetectedCount: 0,
          repairsAttempted: 0,
          repairsSuccessful: 0,
          avgDriftScore: 0,
          avgRepairImprovement: 0,
          lastUpdated: Date.now(),
          driftScoreHistory: []
        };
      }
      return this.profiles[platformId];
    }

    /** Record a drift measurement for a platform */
    recordDriftScore(platformId, driftScore, wasDriftDetected) {
      const profile = this.getProfile(platformId);
      profile.totalTransfers++;
      if (wasDriftDetected) {
        profile.driftDetectedCount++;
      }

      // Update running average
      const prevTotal = profile.totalTransfers - 1;
      profile.avgDriftScore = prevTotal > 0
        ? (profile.avgDriftScore * prevTotal + driftScore) / profile.totalTransfers
        : driftScore;

      // Keep last 20 scores
      profile.driftScoreHistory.push(driftScore);
      if (profile.driftScoreHistory.length > 20) {
        profile.driftScoreHistory.shift();
      }

      profile.lastUpdated = Date.now();
    }

    /** Record a repair attempt result */
    recordRepairResult(platformId, preRepairScore, postRepairScore) {
      const profile = this.getProfile(platformId);
      profile.repairsAttempted++;

      const improvement = postRepairScore - preRepairScore;
      if (improvement >= REPAIR_IMPROVEMENT_THRESHOLD) {
        profile.repairsSuccessful++;
      }

      // Update running average improvement
      const prevAttempts = profile.repairsAttempted - 1;
      profile.avgRepairImprovement = prevAttempts > 0
        ? (profile.avgRepairImprovement * prevAttempts + improvement) / profile.repairsAttempted
        : improvement;

      profile.lastUpdated = Date.now();
    }

    /** Log a complete drift event */
    logDriftEvent(event) {
      this.driftLog.push({
        ts: Date.now(),
        sourcePlatform: event.sourcePlatform || 'unknown',
        targetPlatform: event.targetPlatform || 'unknown',
        driftScore: event.driftScore || 0,
        driftDetected: event.driftDetected || false,
        repairAttempted: event.repairAttempted || false,
        postRepairScore: event.postRepairScore || null,
        repairSuccess: event.repairSuccess || false,
        sourceContextLength: event.sourceContextLength || 0,
        targetResponseLength: event.targetResponseLength || 0
      });
    }

    /** Get the expected drift score for a platform pair (predictive) */
    getExpectedDrift(sourcePlatform, targetPlatform) {
      const targetProfile = this.profiles[targetPlatform];
      if (!targetProfile || targetProfile.totalTransfers < 3) {
        return null; // Not enough data to predict
      }
      return targetProfile.avgDriftScore;
    }

    /** Get a summary of all drift profiles for display */
    getSummary() {
      const summary = {};
      for (const [id, profile] of Object.entries(this.profiles)) {
        summary[id] = {
          transfers: profile.totalTransfers,
          driftRate: profile.totalTransfers > 0
            ? (profile.driftDetectedCount / profile.totalTransfers * 100).toFixed(1) + '%'
            : 'N/A',
          avgScore: profile.avgDriftScore.toFixed(3),
          repairSuccessRate: profile.repairsAttempted > 0
            ? (profile.repairsSuccessful / profile.repairsAttempted * 100).toFixed(1) + '%'
            : 'N/A',
          avgImprovement: profile.avgRepairImprovement.toFixed(3)
        };
      }
      return summary;
    }

    /** Clear all drift data */
    async clearAll() {
      this.profiles = {};
      this.driftLog = [];
      await this.save();
    }
  }

  // ─── DriftDetector: Core detection and repair logic ─────────────────────────

  class DriftDetector {
    constructor(profileManager) {
      this.profileManager = profileManager;
      this.pendingTransfers = new Map(); // tabId -> transfer context
    }

    /**
     * Prepare for drift detection after a "Continue With" transfer.
     * Called when the user initiates a transfer from Platform A.
     * Stores the source context so we can compare when Platform B responds.
     *
     * @param {number} tabId - The target tab ID
     * @param {Object} transferContext - { sourcePlatform, targetPlatform, sourceMessages, sourceText, transferTs }
     */
    registerTransfer(tabId, transferContext) {
      this.pendingTransfers.set(tabId, {
        ...transferContext,
        transferTs: Date.now(),
        repairAttempts: 0,
        initialDriftScore: null,
        status: 'waiting_for_response' // waiting_for_response | measuring | repairing | complete
      });
      console.log('[ChatBridge] Drift detector: registered transfer for tab', tabId,
        'from', transferContext.sourcePlatform, '→', transferContext.targetPlatform);
    }

    /** Check if a tab has a pending transfer */
    hasPendingTransfer(tabId) {
      return this.pendingTransfers.has(tabId);
    }

    /** Get the pending transfer context for a tab */
    getTransferContext(tabId) {
      return this.pendingTransfers.get(tabId) || null;
    }

    /** Mark a transfer as complete and clean up */
    completeTransfer(tabId) {
      this.pendingTransfers.delete(tabId);
    }

    /**
     * Compute drift score between source context and target response.
     * Uses background.js embedding infrastructure via message passing.
     *
     * @param {string} sourceContext - The original conversation text from Platform A
     * @param {string} targetResponse - The first response from Platform B
     * @returns {Promise<{score: number, sourceEmbedding: Array, targetEmbedding: Array}>}
     */
    async computeDriftScore(sourceContext, targetResponse) {
      // Truncate source context to avoid embedding issues
      const truncatedSource = sourceContext.length > MAX_SOURCE_CHARS
        ? sourceContext.slice(-MAX_SOURCE_CHARS) // Use the END of conversation (most recent context)
        : sourceContext;

      // Request embeddings from background
      // In content_script context: use chrome.runtime.sendMessage
      // In background context: call embedding function directly
      const getEmbedding = async (text) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { type: 'get_drift_embedding', payload: { text } },
            (response) => {
              if (chrome.runtime.lastError || !response || !response.ok) {
                resolve(null);
              } else {
                resolve(response.vector);
              }
            }
          );
        });
      };

      try {
        // Get embeddings for both contexts
        const [sourceEmbedding, targetEmbedding] = await Promise.all([
          getEmbedding(truncatedSource),
          getEmbedding(targetResponse)
        ]);

        if (!sourceEmbedding || !targetEmbedding) {
          console.warn('[ChatBridge] Drift: Could not compute embeddings');
          return { score: -1, sourceEmbedding: null, targetEmbedding: null };
        }

        // Compute cosine similarity
        const score = this._cosine(sourceEmbedding, targetEmbedding);
        console.log('[ChatBridge] Drift score:', score.toFixed(4));

        return { score, sourceEmbedding, targetEmbedding };
      } catch (e) {
        console.error('[ChatBridge] Drift score computation error:', e);
        return { score: -1, sourceEmbedding: null, targetEmbedding: null };
      }
    }

    /**
     * Determine if drift was detected and whether repair is needed.
     *
     * @param {number} driftScore - Cosine similarity (0-1)
     * @param {string} targetPlatform - Platform ID
     * @returns {{driftDetected: boolean, severity: string, expectedScore: number|null}}
     */
    assessDrift(driftScore, targetPlatform) {
      if (driftScore < 0) {
        return { driftDetected: false, severity: 'unknown', expectedScore: null };
      }

      const expectedScore = this.profileManager.getExpectedDrift(null, targetPlatform);
      const threshold = expectedScore !== null
        ? Math.min(DRIFT_THRESHOLD, expectedScore - 0.05) // Adaptive threshold
        : DRIFT_THRESHOLD;

      const driftDetected = driftScore < threshold;
      let severity = 'none';
      if (driftDetected) {
        if (driftScore < 0.3) severity = 'critical';
        else if (driftScore < 0.5) severity = 'high';
        else severity = 'moderate';
      }

      return { driftDetected, severity, expectedScore };
    }

    /**
     * Generate a repair prompt to re-align the conversation on Platform B.
     * Sends the request to background.js which uses Gemini to generate it.
     *
     * @param {string} sourceContext - Original conversation text
     * @param {string} targetResponse - The drifted response from Platform B
     * @param {number} driftScore - The measured drift score
     * @param {string} severity - 'moderate', 'high', or 'critical'
     * @returns {Promise<string>} The repair prompt text
     */
    async generateRepairPrompt(sourceContext, targetResponse, driftScore, severity) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'generate_repair_prompt',
          payload: {
            sourceContext: sourceContext.slice(-MAX_SOURCE_CHARS),
            targetResponse,
            driftScore,
            severity
          }
        }, (response) => {
          if (chrome.runtime.lastError || !response || !response.ok) {
            console.warn('[ChatBridge] Repair prompt generation failed:', response?.error);
            resolve(null);
          } else {
            resolve(response.repairPrompt);
          }
        });
      });
    }

    /** Cosine similarity for two vectors */
    _cosine(a, b) {
      if (!a || !b || a.length !== b.length) return 0;
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
      }
      if (na === 0 || nb === 0) return 0;
      return dot / (Math.sqrt(na) * Math.sqrt(nb));
    }
  }

  // ─── DriftUI: Toast notifications for drift events ──────────────────────────

  const DriftUI = {
    /** Show a drift detection notification */
    showDriftNotification(score, severity, repairing) {
      const severityColors = {
        moderate: '#FFA500',
        high: '#FF6B35',
        critical: '#FF3333'
      };
      const color = severityColors[severity] || '#FFA500';
      const icon = severity === 'critical' ? '⚠️' : severity === 'high' ? '🔶' : '🔸';

      const msg = repairing
        ? `${icon} Context drift detected (${(score * 100).toFixed(0)}% similarity). Injecting repair prompt...`
        : `${icon} Context drift detected (${(score * 100).toFixed(0)}% similarity, ${severity}).`;

      // Use ChatBridge's existing toast if available
      if (typeof window.ChatBridge !== 'undefined' && typeof window.ChatBridge.toast === 'function') {
        window.ChatBridge.toast(msg);
      } else if (typeof toast === 'function') {
        toast(msg);
      } else {
        console.log('[ChatBridge] Drift:', msg);
      }
    },

    /** Show repair result notification */
    showRepairResult(preScore, postScore, success) {
      const improvement = ((postScore - preScore) * 100).toFixed(0);
      const msg = success
        ? `✅ Context repaired! Similarity improved by ${improvement}% (${(preScore * 100).toFixed(0)}% → ${(postScore * 100).toFixed(0)}%)`
        : `⚠️ Repair attempted but drift persists (${(preScore * 100).toFixed(0)}% → ${(postScore * 100).toFixed(0)}%)`;

      if (typeof window.ChatBridge !== 'undefined' && typeof window.ChatBridge.toast === 'function') {
        window.ChatBridge.toast(msg);
      } else if (typeof toast === 'function') {
        toast(msg);
      } else {
        console.log('[ChatBridge] Repair:', msg);
      }
    }
  };

  // ─── Exports ────────────────────────────────────────────────────────────────
  const profileManager = new DriftProfileManager();
  const driftDetector = new DriftDetector(profileManager);

  // Auto-load profiles on script init
  profileManager.load().catch(e => console.warn('[ChatBridge] DriftProfile auto-load error:', e));

  window.DriftProfileManager = DriftProfileManager;
  window.DriftDetector = DriftDetector;
  window.DriftUI = DriftUI;

  // Singleton instances for use by content_script.js
  window.ChatBridgeDrift = {
    profileManager,
    detector: driftDetector,
    ui: DriftUI,
    DRIFT_THRESHOLD,
    MAX_REPAIR_ATTEMPTS,
    REPAIR_IMPROVEMENT_THRESHOLD
  };

})();
