const fs = require('fs');
const path = require('path');

// Mock IndexedDB locally with proper async behavior for testing cache helpers
const mockStore = {};
global.indexedDB = {
  open: () => {
    const req = {
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null
    };
    setTimeout(() => {
      const db = {
        transaction: () => {
          return {
            objectStore: () => {
              return {
                put: (obj) => {
                  mockStore[obj.id] = obj;
                  const request = { onsuccess: null, onerror: null };
                  setTimeout(() => { if (request.onsuccess) request.onsuccess(); }, 0);
                  return request;
                },
                get: (id) => {
                  const res = mockStore[id] || null;
                  const request = {
                    onsuccess: null,
                    onerror: null,
                    get result() { return res; }
                  };
                  setTimeout(() => { if (request.onsuccess) request.onsuccess({ target: { result: res } }); }, 0);
                  return request;
                },
                clear: () => {
                  Object.keys(mockStore).forEach(k => delete mockStore[k]);
                  const request = { onsuccess: null, onerror: null };
                  setTimeout(() => { if (request.onsuccess) request.onsuccess(); }, 0);
                  return request;
                },
                delete: (id) => {
                  delete mockStore[id];
                  const request = { onsuccess: null, onerror: null };
                  setTimeout(() => { if (request.onsuccess) request.onsuccess(); }, 0);
                  return request;
                },
                openCursor: () => {
                  const request = { onsuccess: null, onerror: null };
                  setTimeout(() => { if (request.onsuccess) request.onsuccess({ target: { result: null } }); }, 0);
                  return request;
                }
              };
            }
          };
        }
      };
      
      const event = { target: { result: db } };
      if (req.onupgradeneeded) req.onupgradeneeded(event);
      if (req.onsuccess) req.onsuccess(event);
    }, 0);
    return req;
  }
};

// Mock chrome APIs more thoroughly
global.chrome.runtime.onInstalled = { addListener: jest.fn() };
global.chrome.runtime.onStartup = { addListener: jest.fn() };
global.chrome.runtime.onMessage = { addListener: jest.fn() };
global.chrome.tabs = { create: jest.fn(), query: jest.fn() };
global.chrome.commands = { onCommand: { addListener: jest.fn() } };
global.chrome.alarms = { create: jest.fn(), onAlarm: { addListener: jest.fn() } };
global.self = { addEventListener: jest.fn() };

// Evaluate dependencies in the global test environment
let analyticsCode = fs.readFileSync(path.resolve(__dirname, '../../core/telemetry.js'), 'utf8')
  .replace(/^\s*export\s+default\s+\w+\s*;?/gm, '')
  .replace(/^\s*export\s+\{[^}]+\}\s*;?/gm, '');
eval(analyticsCode);

let bgCode = fs.readFileSync(path.resolve(__dirname, '../../background.js'), 'utf8')
  .replace(/^\s*import\s+[^;]+;?/gm, '')
  .replace(/^\s*export\s+default\s+\w+\s*;?/gm, '')
  .replace(/^\s*export\s+\{[^}]+\}\s*;?/gm, '');

// Eval background.js to load its helper functions
eval(bgCode);

describe('ChatBridge Core AI API Optimizations', () => {
  describe('Prompt Context Trimming', () => {
    test('trimPromptText leaves short prompts unchanged', () => {
      const text = 'Translate: Hello world';
      expect(trimPromptText(text, 100)).toBe(text);
    });

    test('trimPromptText truncates flat text exceeding limit', () => {
      const longText = 'A'.repeat(200);
      const trimmed = trimPromptText(longText, 100);
      expect(trimmed).toContain('truncated due to context size limits');
      expect(trimmed.length).toBeLessThanOrEqual(100);
    });

    test('trimPromptText trims turns while preserving system prompt', () => {
      const prompt = [
        'System: You are an translator.',
        'User: Message 1',
        'Assistant: Response 1',
        'User: Message 2',
        'Assistant: Response 2'
      ].join('\n\n');

      // Set maxChars tight (80 chars) so it has to drop the older turns
      const trimmed = trimPromptText(prompt, 80);
      expect(trimmed).toContain('System: You are an translator.');
      expect(trimmed).toContain('... [older conversation history omitted due to token limits] ...');
      expect(trimmed).toContain('User: Message 2');
      expect(trimmed).toContain('Assistant: Response 2');
      expect(trimmed).not.toContain('User: Message 1');
    });
  });

  describe('OpenAI Message List Trimming', () => {
    test('trimOpenAiMessages preserves system message and trims older history', () => {
      const messages = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'First user message' },
        { role: 'assistant', content: 'First assistant response' },
        { role: 'user', content: 'Second user message' }
      ];

      // Limit length so only last message fits
      const trimmed = trimOpenAiMessages(messages, 50);
      expect(trimmed[0]).toEqual({ role: 'system', content: 'System prompt' });
      expect(trimmed[trimmed.length - 1]).toEqual({ role: 'user', content: 'Second user message' });
      expect(trimmed.some(m => m.content === 'First user message')).toBe(false);
    });
  });

  describe('Caching Strategy', () => {
    test('cacheClearAll successfully clears cache', async () => {
      // Mock IndexedDB active store for testing
      mockStore['test_key'] = { id: 'test_key', ts: Date.now(), ttl: 60000, response: { ok: true } };
      const cleared = await cacheClearAll();
      expect(cleared).toBe(true);
      expect(Object.keys(mockStore).length).toBe(0);
    });
  });

  describe('Batch Requests & Concurrency Throttling', () => {
    test('mainMessageListener handles batch_requests message type', (done) => {
      const reqs = [
        { type: 'test_huggingface_api', apiKey: '', apiVersion: 'v1' }
      ];

      const batchMsg = {
        type: 'batch_requests',
        payload: {
          requests: reqs,
          concurrency: 2
        },
        apiVersion: 'v1'
      };

      const isAsync = mainMessageListener(batchMsg, {}, (res) => {
        expect(res.ok).toBe(true);
        expect(res.results).toBeDefined();
        expect(res.results.length).toBe(1);
        done();
      });

      expect(isAsync).toBe(true);
    });
  });

  describe('Model Load Balancing', () => {
    beforeEach(() => {
      global.chrome.storage.session.storageMap = {};
      _modelStateCache = null;
    });

    test('getNextAvailableModel distributes generic request across healthy flash models', async () => {
      const selectedModels = new Set();
      for (let i = 0; i < 20; i++) {
        // Clearing cache to simulate fresh load balance selection
        _modelStateCache = null;
        const model = await getNextAvailableModel(null);
        selectedModels.add(model);
      }
      expect(selectedModels.has('gemini-3.5-flash')).toBe(true);
      expect(selectedModels.has('gemini-2.5-flash')).toBe(true);
      expect(selectedModels.has('gemini-1.5-flash')).toBe(true);
    });

    test('getNextAvailableModel respects preferred model if healthy', async () => {
      const model = await getNextAvailableModel('gemini-3.1-pro');
      expect(model).toBe('gemini-3.1-pro');
    });

    test('getNextAvailableModel falls back when preferred model fails', async () => {
      await markModelFailed('gemini-3.1-pro', 429);
      _modelStateCache = null;
      const model = await getNextAvailableModel('gemini-3.1-pro');
      expect(model).not.toBe('gemini-3.1-pro');
    });
  });

  describe('Performance Telemetry', () => {
    beforeEach(() => {
      global.chrome.storage.local.storageMap = {};
    });

    test('recordPerformanceMetric saves metrics and caps at 100 entries', async () => {
      for (let i = 0; i < 105; i++) {
        await recordPerformanceMetric('test_metric', i);
      }
      const data = global.chrome.storage.local.storageMap['cb_telemetry'];
      expect(data).toBeDefined();
      expect(data['test_metric'].length).toBe(100);
      expect(data['test_metric'][0].val).toBe(5);
      expect(data['test_metric'][99].val).toBe(104);
    });
  });
});
