const fs = require('fs');
const path = require('path');

// Evaluate analytics.js in global JSDOM scope
const analyticsCode = fs.readFileSync(path.resolve(__dirname, '../../core/telemetry.js'), 'utf8')
  .replace(/^\s*export\s+default\s+\w+\s*;?/gm, '')
  .replace(/^\s*export\s+\{[^}]+\}\s*;?/gm, '');
eval(analyticsCode);

describe('AnalyticsManager Unit Tests', () => {
  beforeEach(async () => {
    chrome.storage.local.storageMap = {};
    jest.clearAllMocks();
    // Default to opted-in for testing purposes
    await AnalyticsManager.setEnabled(true);
  });

  test('toggle analytics state controls storage', async () => {
    await AnalyticsManager.setEnabled(false);
    let enabled = await AnalyticsManager.isEnabled();
    expect(enabled).toBe(false);

    await AnalyticsManager.setEnabled(true);
    enabled = await AnalyticsManager.isEnabled();
    expect(enabled).toBe(true);
  });

  test('logScan logs scan details in storage when enabled', async () => {
    await AnalyticsManager.logScan('slack', 12);
    const telemetry = await AnalyticsManager.getTelemetry();
    expect(telemetry).toHaveLength(1);
    expect(telemetry[0].type).toBe('scan');
    expect(telemetry[0].platform).toBe('slack');
    expect(telemetry[0].payload.messageCount).toBe(12);
  });

  test('logScan does not log if disabled', async () => {
    await AnalyticsManager.setEnabled(false);
    await AnalyticsManager.logScan('slack', 12);
    const telemetry = await AnalyticsManager.getTelemetry();
    expect(telemetry).toHaveLength(0);
  });

  test('logTransform logs transform details and calculates tokens', async () => {
    await AnalyticsManager.logTransform({
      platform: 'teams',
      feature: 'summarize',
      model: 'gemini-1.5-flash',
      provider: 'gemini',
      inputText: 'Short input',
      outputText: 'Short output',
      inputTokens: 10,
      outputTokens: 20
    });

    const telemetry = await AnalyticsManager.getTelemetry();
    expect(telemetry).toHaveLength(1);
    expect(telemetry[0].type).toBe('transform');
    expect(telemetry[0].platform).toBe('teams');
    expect(telemetry[0].payload.feature).toBe('summarize');
    expect(telemetry[0].payload.model).toBe('gemini-1.5-flash');
    expect(telemetry[0].payload.provider).toBe('gemini');
    expect(telemetry[0].payload.inputTokens).toBe(10);
    expect(telemetry[0].payload.outputTokens).toBe(20);
  });

  test('logTransform estimates tokens if none provided', async () => {
    // 24 characters input = ~6 tokens; 40 characters output = ~10 tokens
    await AnalyticsManager.logTransform({
      platform: 'discord',
      feature: 'translate',
      model: 'llama-3.1-8b',
      provider: 'huggingface',
      inputText: 'abcdefghijklmnopqrstuvwx', // 24 chars
      outputText: 'abcdefghijklmnopqrstabcdefghijklmnopqrst' // 40 chars
    });

    const telemetry = await AnalyticsManager.getTelemetry();
    expect(telemetry).toHaveLength(1);
    expect(telemetry[0].payload.inputTokens).toBe(6);
    expect(telemetry[0].payload.outputTokens).toBe(10);
  });

  test('getSummary produces correct aggregates', async () => {
    // Log multiple entries
    await AnalyticsManager.logScan('slack', 10);
    await AnalyticsManager.logTransform({
      platform: 'slack',
      feature: 'summarize',
      model: 'gemini-1.5-flash',
      provider: 'gemini',
      inputText: 'Input content',
      outputText: 'Output content',
      inputTokens: 50,
      outputTokens: 50
    });

    await AnalyticsManager.logTransform({
      platform: 'teams',
      feature: 'rewrite',
      model: 'gpt-4o-mini',
      provider: 'openai',
      inputText: 'Input content',
      outputText: 'Output content',
      inputTokens: 100,
      outputTokens: 150
    });

    const summary = await AnalyticsManager.getSummary();
    expect(summary.scanCount).toBe(1);
    expect(summary.transformCount).toBe(2);
    expect(summary.totalTokens).toBe(350); // 50 + 50 + 100 + 150
    expect(summary.inputTokens).toBe(150);
    expect(summary.outputTokens).toBe(200);
    expect(summary.features.summarize).toBe(1);
    expect(summary.features.rewrite).toBe(1);
    expect(summary.providers.gemini).toBe(1);
    expect(summary.providers.openai).toBe(1);
    expect(summary.platforms.slack).toBe(2); // 1 scan, 1 transform
    expect(summary.platforms.teams).toBe(1); // 1 transform
  });

  test('clearTelemetry erases all records', async () => {
    await AnalyticsManager.logScan('slack', 10);
    let telemetry = await AnalyticsManager.getTelemetry();
    expect(telemetry).toHaveLength(1);

    await AnalyticsManager.clearTelemetry();
    telemetry = await AnalyticsManager.getTelemetry();
    expect(telemetry).toHaveLength(0);
  });

  test('limitTelemetry keeps rolling window of 1000 items', async () => {
    // Override max records to 5 for testing rolling window limit
    const originalMax = 1000;
    // We can evaluate or inject a quick change or just mock it since limitTelemetry is internal.
    // Let's inspect the telemetry array directly to see if we can trigger the trim logic.
    // Let's add 1005 items and see if it cuts to 1000.
    const items = [];
    for (let i = 0; i < 1005; i++) {
      items.push({ id: i, ts: Date.now(), type: 'scan', platform: 'slack', metadata: { messageCount: 1 } });
    }
    chrome.storage.local.storageMap['chatbridge:telemetry'] = items;
    
    // Log one more scan to trigger limitTelemetry
    await AnalyticsManager.logScan('slack', 1);
    const telemetry = await AnalyticsManager.getTelemetry();
    expect(telemetry.length).toBeLessThanOrEqual(1000);
  });
});
