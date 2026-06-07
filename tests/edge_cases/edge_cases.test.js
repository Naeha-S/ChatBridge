const fs = require('fs');
const path = require('path');

// Load required scripts for testing edge cases
const contentScriptCode = fs.readFileSync(path.resolve(__dirname, '../../content_script.js'), 'utf8');
const startIndex = contentScriptCode.indexOf('function normalizeMessages(');
const endIndex = contentScriptCode.indexOf('// expose a very small', startIndex);
const normalizeCode = contentScriptCode.substring(startIndex, endIndex);

const adaptersCode = fs.readFileSync(path.resolve(__dirname, '../../core/adapters.js'), 'utf8');
const storageCode = fs.readFileSync(path.resolve(__dirname, '../../core/storage.js'), 'utf8');

eval(normalizeCode);
eval(adaptersCode);
eval(storageCode);

describe('ChatBridge Edge Case Tests', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    chrome.storage.local.storageMap = {};
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('normalizeMessages Edge Cases', () => {
    test('handles empty chat arrays cleanly', () => {
      expect(normalizeMessages([])).toEqual([]);
    });

    test('handles single message chats correctly', () => {
      const single = [{ role: 'user', text: 'Just one simple message.' }];
      const res = normalizeMessages(single);
      expect(res).toHaveLength(1);
      expect(res[0].text).toBe('Just one simple message.');
    });

    test('handles heavy payloads (1,000+ messages) efficiently without stack overflows', () => {
      const messages = Array.from({ length: 1500 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        text: `This is test message number ${i} in a very long conversation to test memory and performance scaling.`
      }));

      const startTime = Date.now();
      const res = normalizeMessages(messages, 2000); // specify high limit to get all
      const duration = Date.now() - startTime;

      expect(res).toHaveLength(1500);
      expect(duration).toBeLessThan(200); // Should parse 1500 simple messages under 200ms
    });
  });

  describe('StorageManager Limits & Fallbacks', () => {
    test('limits conversation list to MAX_CONVERSATIONS (50)', async () => {
      // Add 60 conversations and check if it gets trimmed to 50
      for (let i = 1; i <= 60; i++) {
        await StorageManager.saveConversation({ id: `convo_${i}`, ts: i, conversation: [{ role: 'user', text: `message ${i}` }] });
      }

      const list = await StorageManager.getConversations();
      expect(list).toHaveLength(50);
      // Because we unshift, the most recent one (convo_60) should be at the front
      expect(list[0].id).toBe('convo_60');
      // The oldest one (convo_11) should be at the end
      expect(list[49].id).toBe('convo_11');
    });
  });

  describe('Adapters Error Resilience', () => {
    test('ChatGPT adapter handles empty/broken DOM elements without throwing', () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'chatgpt.com' },
        configurable: true,
        writable: true
      });

      const adapter = pickAdapter();
      expect(adapter.id).toBe('chatgpt');

      // Empty document
      expect(adapter.getMessages()).toEqual([]);

      // Broken markup (e.g. wrapper exists but no elements with roles or text)
      document.body.innerHTML = `
        <div data-testid="conversation-turns">
          <div data-message-author-role="user">
            <!-- Completely empty role -->
          </div>
        </div>
      `;
      expect(adapter.getMessages()).toEqual([]);
    });

    test('Claude adapter handles empty/broken DOM elements without throwing', () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'claude.ai' },
        configurable: true,
        writable: true
      });

      const adapter = pickAdapter();
      expect(adapter.id).toBe('claude');

      expect(adapter.getMessages()).toEqual([]);

      document.body.innerHTML = `
        <div data-testid="conversation-view">
          <div class="font-user" data-testid="user-message"></div>
        </div>
      `;
      expect(adapter.getMessages()).toEqual([]);
    });
  });
});
