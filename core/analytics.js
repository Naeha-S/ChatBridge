const AnalyticsManager = (() => {
  const KEYS = {
    ENABLED: 'chatbridge_analytics_enabled',
    TELEMETRY: 'chatbridge_telemetry_v1'
  };

  const LIMITS = {
    MAX_RECORDS: 1000,
    RETENTION_MS: 30 * 24 * 60 * 60 * 1000 // 30 days
  };

  function estimateTokens(text) {
    if (!text) return 0;
    if (typeof text !== 'string') text = String(text);
    // Standard rule of thumb: ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }

  function getStorage(key, defaultValue) {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        // Fallback to localStorage if chrome.storage is not available
        try {
          const val = localStorage.getItem(key);
          resolve(val ? JSON.parse(val) : defaultValue);
        } catch (_) {
          resolve(defaultValue);
        }
        return;
      }
      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
          resolve(defaultValue);
        } else {
          resolve(result[key] !== undefined ? result[key] : defaultValue);
        }
      });
    });
  }

  function setStorage(key, value) {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        try {
          localStorage.setItem(key, JSON.stringify(value));
        } catch (_) {}
        resolve();
        return;
      }
      chrome.storage.local.set({ [key]: value }, () => {
        resolve();
      });
    });
  }

  async function isEnabled() {
    return await getStorage(KEYS.ENABLED, false);
  }

  async function setEnabled(enabled) {
    await setStorage(KEYS.ENABLED, !!enabled);
    if (!enabled) {
      // Clear data if opted out for maximum privacy compliance
      await clearTelemetry();
    }
  }

  async function getTelemetry() {
    return await getStorage(KEYS.TELEMETRY, []);
  }

  async function saveTelemetry(records) {
    // Keep it trimmed
    const now = Date.now();
    const cutoff = now - LIMITS.RETENTION_MS;
    
    const filtered = records
      .filter(r => r.timestamp > cutoff)
      .slice(-LIMITS.MAX_RECORDS);

    await setStorage(KEYS.TELEMETRY, filtered);
  }

  async function logEvent(type, platform, payload = {}) {
    try {
      const enabled = await isEnabled();
      if (!enabled) return;

      const record = {
        timestamp: Date.now(),
        type,
        platform: platform || 'unknown',
        payload
      };

      const records = await getTelemetry();
      records.push(record);
      await saveTelemetry(records);
    } catch (e) {
      console.warn('[ChatBridge Analytics] Log event error:', e);
    }
  }

  async function logScan(platform, messageCount) {
    await logEvent('scan', platform, { messageCount: messageCount || 0 });
  }

  async function logTransform({ platform, feature, model, provider, inputText, outputText, inputTokens, outputTokens }) {
    const calculatedInput = inputTokens !== undefined ? inputTokens : estimateTokens(inputText);
    const calculatedOutput = outputTokens !== undefined ? outputTokens : estimateTokens(outputText);

    await logEvent('transform', platform, {
      feature: feature || 'unknown',
      model: model || 'unknown',
      provider: provider || 'unknown',
      inputTokens: calculatedInput,
      outputTokens: calculatedOutput
    });
  }

  async function clearTelemetry() {
    await setStorage(KEYS.TELEMETRY, []);
  }

  async function getSummary(days = 30) {
    const records = await getTelemetry();
    const now = Date.now();
    const cutoff = now - (days * 24 * 60 * 60 * 1000);
    const recent = records.filter(r => r.timestamp > cutoff);

    const summary = {
      scanCount: 0,
      transformCount: 0,
      totalMessagesScanned: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      features: {
        summarize: 0,
        rewrite: 0,
        translate: 0,
        syncTone: 0,
        custom: 0,
        prompt: 0
      },
      providers: {},
      platforms: {},
      dailyTrend: {} // Key: YYYY-MM-DD, Value: { tokens: 0, scans: 0, transforms: 0 }
    };

    // Initialize daily trend for the last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - (i * 24 * 60 * 60 * 1000));
      const dateStr = d.toISOString().split('T')[0];
      summary.dailyTrend[dateStr] = { tokens: 0, scans: 0, transforms: 0 };
    }

    recent.forEach(r => {
      const dateStr = new Date(r.timestamp).toISOString().split('T')[0];
      const isInTrend = summary.dailyTrend[dateStr] !== undefined;

      if (r.type === 'scan') {
        summary.scanCount++;
        const msgCount = r.payload?.messageCount || 0;
        summary.totalMessagesScanned += msgCount;
        if (isInTrend) {
          summary.dailyTrend[dateStr].scans++;
        }
      } else if (r.type === 'transform') {
        summary.transformCount++;
        const feature = r.payload?.feature || 'unknown';
        if (summary.features[feature] !== undefined) {
          summary.features[feature]++;
        } else {
          summary.features[feature] = (summary.features[feature] || 0) + 1;
        }

        const provider = r.payload?.provider || 'unknown';
        summary.providers[provider] = (summary.providers[provider] || 0) + 1;

        const inTok = r.payload?.inputTokens || 0;
        const outTok = r.payload?.outputTokens || 0;
        const totalTok = inTok + outTok;

        summary.inputTokens += inTok;
        summary.outputTokens += outTok;
        summary.totalTokens += totalTok;

        if (isInTrend) {
          summary.dailyTrend[dateStr].transforms++;
          summary.dailyTrend[dateStr].tokens += totalTok;
        }
      }

      // Track platform usage
      let plat = r.platform || 'unknown';
      // Clean hostnames (e.g. www.chatgpt.com -> chatgpt.com)
      if (plat.startsWith('www.')) plat = plat.slice(4);
      summary.platforms[plat] = (summary.platforms[plat] || 0) + 1;
    });

    return summary;
  }

  return {
    isEnabled,
    setEnabled,
    getTelemetry,
    logScan,
    logTransform,
    clearTelemetry,
    getSummary,
    estimateTokens
  };
})();

if (typeof window !== 'undefined') {
  window.AnalyticsManager = AnalyticsManager;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AnalyticsManager;
}

export default AnalyticsManager;

