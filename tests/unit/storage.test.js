const fs = require('fs');
const path = require('path');

// Evaluate storage.js in global JSDOM scope
const storageCode = fs.readFileSync(path.resolve(__dirname, '../../storage.js'), 'utf8');
eval(storageCode);

describe('StorageManager Unit Tests', () => {
  beforeEach(() => {
    chrome.storage.local.storageMap = {};
    localStorage.clear();
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
  });

  test('set and get APIs retrieve stored values', async () => {
    await StorageManager.set('test_key', 'test_val');
    const val = await StorageManager.get('test_key');
    expect(val).toBe('test_val');
    expect(chrome.storage.local.set).toHaveBeenCalled();
    expect(chrome.storage.local.get).toHaveBeenCalled();
  });

  test('remove API clears value', async () => {
    await StorageManager.set('test_key', 'test_val');
    await StorageManager.remove('test_key');
    const val = await StorageManager.get('test_key');
    expect(val).toBeUndefined();
    expect(chrome.storage.local.remove).toHaveBeenCalled();
  });

  test('saveConversation and getConversations manage conversation list', async () => {
    const convo = { id: 'convo_1', ts: Date.now(), conversation: [{ role: 'user', text: 'Hello' }] };
    await StorageManager.saveConversation(convo);
    const list = await StorageManager.getConversations();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(convo);
  });

  test('clearConversations resets storage list', async () => {
    const convo = { id: 'convo_1', ts: Date.now(), conversation: [{ role: 'user', text: 'Hello' }] };
    await StorageManager.saveConversation(convo);
    await StorageManager.clearConversations();
    const list = await StorageManager.getConversations();
    expect(list).toHaveLength(0);
  });

  test('localStorage fallback when Chrome storage fails', async () => {
    const originalSet = chrome.storage.local.set;
    
    // Simulate runtime error
    chrome.storage.local.set = jest.fn((items, callback) => {
      chrome.runtime.lastError = { message: 'Quota exceeded' };
      callback();
    });

    const convo = { id: 'convo_fallback', ts: Date.now(), conversation: [{ role: 'user', text: 'fallback message' }] };
    await StorageManager.saveConversation(convo);

    const fallbackData = localStorage.getItem('chatbridge_conversations_v1');
    expect(fallbackData).not.toBeNull();
    const parsed = JSON.parse(fallbackData);
    expect(parsed[0].id).toBe('convo_fallback');

    // Clean up
    chrome.storage.local.set = originalSet;
    chrome.runtime.lastError = null;
  });

  test('Agent Hub CatchMeUp persistence', async () => {
    const brief = { lastBriefedAt: 1234567, unreadCount: 5 };
    await StorageManager.setAgentCatchMeUp(brief);
    const retrieved = await StorageManager.getAgentCatchMeUp();
    expect(retrieved).toEqual(brief);
  });

  test('Agent Hub Tracked Topics persistence', async () => {
    const topics = ['React hooks', 'CSS gradients'];
    await StorageManager.setTrackedTopics(topics);
    const retrieved = await StorageManager.getTrackedTopics();
    expect(retrieved).toEqual(topics);
  });
});
