const fs = require('fs');
const path = require('path');

// Extract builtInAi block from content_script.js
const contentScriptCode = fs.readFileSync(path.resolve(__dirname, '../../content_script.js'), 'utf8');
const startIndex = contentScriptCode.indexOf('const builtInAi = {');
if (startIndex === -1) {
  throw new Error('Could not find builtInAi block in content_script.js');
}
const endIndex = contentScriptCode.indexOf('const insertTextToChat =', startIndex);
if (endIndex === -1) {
  throw new Error('Could not find end of builtInAi block (insertTextToChat) in content_script.js');
}
let builtInAi;
let runLocalBuiltInAi;
let runLocalSummarizer;
let runLocalPromptModel;
let runLocalTranslator;

const builtInAiCode = contentScriptCode.substring(startIndex, endIndex)
  .replace('const builtInAi =', 'builtInAi =')
  .replace('const runLocalBuiltInAi =', 'runLocalBuiltInAi =')
  .replace('const runLocalSummarizer =', 'runLocalSummarizer =')
  .replace('const runLocalPromptModel =', 'runLocalPromptModel =')
  .replace('const runLocalTranslator =', 'runLocalTranslator =');

// Evaluate builtInAi code in test context
eval(builtInAiCode);

// Extract callGeminiAsync block
const geminiStartIndex = contentScriptCode.indexOf('function callGeminiAsync(');
if (geminiStartIndex === -1) {
  throw new Error('Could not find callGeminiAsync in content_script.js');
}
const geminiEndIndex = contentScriptCode.indexOf('function callOpenAIAsync(', geminiStartIndex);
if (geminiEndIndex === -1) {
  throw new Error('Could not find callOpenAIAsync in content_script.js');
}
let callGeminiAsync;
let tokenGovernor = jest.fn(async (payload) => ({ intercepted: false, payload, cacheKey: 'test-key' }));
let callLlamaAsync = jest.fn();
let rambleFilter = jest.fn((text) => text);
let _cachePut = jest.fn();
let handleBillingAwareResult = jest.fn((res) => res);

const callGeminiCode = contentScriptCode.substring(geminiStartIndex, geminiEndIndex)
  .replace('function callGeminiAsync(', 'callGeminiAsync = function(');

// Evaluate callGeminiAsync in test context
eval(callGeminiCode);

describe('On-Device Built-In AI APIs', () => {
  let consoleLogSpy;

  beforeEach(() => {
    // Reset global mocks
    global.LanguageModel = null;
    global.Summarizer = null;
    global.Translator = null;
    global.translation = null;
    global.ai = null;

    // Reset navigator userActivation mock
    Object.defineProperty(navigator, 'userActivation', {
      value: { isActive: true },
      writable: true,
      configurable: true
    });

    // Spy on console.log
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('Prompt API (LanguageModel)', () => {
    test('runLocalBuiltInAi logs SUCCESS when Prompt API succeeds', async () => {
      const mockSession = {
        prompt: jest.fn().mockResolvedValue('  Hello from Local Prompt Model!  '),
        destroy: jest.fn(),
      };
      global.LanguageModel = {
        availability: jest.fn().mockResolvedValue('available'),
        create: jest.fn().mockResolvedValue(mockSession),
      };

      // Set up builtInAi state in eval context
      builtInAi.languageModel = global.LanguageModel;

      const payload = { action: 'prompt', text: 'Hello' };
      const result = await runLocalBuiltInAi(payload);

      expect(result).toBe('Hello from Local Prompt Model!');
      expect(mockSession.prompt).toHaveBeenCalledWith('Hello');
      expect(mockSession.destroy).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ChatBridge AI] On-device Prompt API (LanguageModel) SUCCESS')
      );
    });

    test('runLocalBuiltInAi logs FAILED when Prompt API is unavailable', async () => {
      global.LanguageModel = {
        availability: jest.fn().mockResolvedValue('unavailable'),
        create: jest.fn(),
      };

      builtInAi.languageModel = global.LanguageModel;

      const payload = { action: 'prompt', text: 'Hello' };
      const result = await runLocalBuiltInAi(payload);

      expect(result).toBeNull();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ChatBridge AI] On-device Prompt API (LanguageModel) FAILED')
      );
    });

    test('runLocalBuiltInAi logs FAILED when Prompt API throws exception', async () => {
      global.LanguageModel = {
        availability: jest.fn().mockResolvedValue('available'),
        create: jest.fn().mockRejectedValue(new Error('Prompt creation error')),
      };

      builtInAi.languageModel = global.LanguageModel;

      const payload = { action: 'prompt', text: 'Hello' };
      const result = await runLocalBuiltInAi(payload);

      expect(result).toBeNull();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ChatBridge AI] On-device Prompt API (LanguageModel) FAILED')
      );
    });
  });

  describe('Summarizer API', () => {
    test('runLocalBuiltInAi logs SUCCESS when Summarizer API succeeds', async () => {
      const mockSummarizer = {
        summarize: jest.fn().mockResolvedValue('This is a summary.'),
        destroy: jest.fn(),
      };
      global.Summarizer = {
        availability: jest.fn().mockResolvedValue('available'),
        create: jest.fn().mockResolvedValue(mockSummarizer),
      };

      builtInAi.summarizer = global.Summarizer;

      const payload = { action: 'summarize', text: 'Long conversation text' };
      const result = await runLocalBuiltInAi(payload);

      expect(result).toBe('This is a summary.');
      expect(mockSummarizer.summarize).toHaveBeenCalled();
      expect(mockSummarizer.destroy).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ChatBridge AI] On-device Summarizer API SUCCESS')
      );
    });

    test('runLocalBuiltInAi logs FAILED when Summarizer API is unavailable', async () => {
      global.Summarizer = {
        availability: jest.fn().mockResolvedValue('unavailable'),
        create: jest.fn(),
      };

      builtInAi.summarizer = global.Summarizer;

      const payload = { action: 'summarize', text: 'Long conversation text' };
      const result = await runLocalBuiltInAi(payload);

      expect(result).toBeNull();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ChatBridge AI] On-device Summarizer API FAILED')
      );
    });
  });

  describe('Translator API', () => {
    test('runLocalBuiltInAi logs SUCCESS when native Translator API succeeds', async () => {
      const mockTranslator = {
        translate: jest.fn().mockResolvedValue('Hola Mundo'),
        destroy: jest.fn(),
      };
      global.Translator = {
        canTranslate: jest.fn().mockResolvedValue('readily'),
        create: jest.fn().mockResolvedValue(mockTranslator),
      };

      builtInAi.translator = global.Translator;

      const payload = { action: 'translate', text: 'Hello World', targetLangCode: 'es' };
      const result = await runLocalBuiltInAi(payload);

      expect(result).toBe('Hola Mundo');
      expect(mockTranslator.translate).toHaveBeenCalledWith('Hello World');
      expect(mockTranslator.destroy).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ChatBridge AI] On-device Translator API SUCCESS')
      );
    });

    test('runLocalBuiltInAi falls back to Prompt API when native Translator is unavailable but Prompt API succeeds', async () => {
      // Mock Translator to fail
      global.Translator = {
        canTranslate: jest.fn().mockResolvedValue('unavailable'),
        create: jest.fn(),
      };

      // Mock LanguageModel (Prompt API) to succeed
      const mockPromptSession = {
        prompt: jest.fn().mockResolvedValue('Hola Mundo (via Prompt API)'),
        destroy: jest.fn(),
      };
      global.LanguageModel = {
        availability: jest.fn().mockResolvedValue('available'),
        create: jest.fn().mockResolvedValue(mockPromptSession),
      };

      builtInAi.translator = global.Translator;
      builtInAi.languageModel = global.LanguageModel;

      const payload = { action: 'translate', text: 'Hello World', targetLang: 'Spanish', targetLangCode: 'es' };
      const result = await runLocalBuiltInAi(payload);

      expect(result).toBe('Hola Mundo (via Prompt API)');
      expect(mockPromptSession.prompt).toHaveBeenCalledWith(
        expect.stringContaining('Translate the following text to Spanish')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ChatBridge AI] On-device Translator API SUCCESS')
      );
    });

    test('runLocalBuiltInAi logs FAILED when both native Translator and Prompt API fallback fail', async () => {
      global.Translator = null;
      global.LanguageModel = null;
      builtInAi.translator = null;
      builtInAi.languageModel = null;

      const payload = { action: 'translate', text: 'Hello World', targetLangCode: 'es' };
      const result = await runLocalBuiltInAi(payload);

      expect(result).toBeNull();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ChatBridge AI] On-device Translator API FAILED')
      );
    });
  });

  describe('callGeminiAsync Fallback Hierarchy', () => {
    let sendMessageMock;
    let storageGetMock;

    beforeEach(() => {
      sendMessageMock = jest.fn();
      chrome.runtime.sendMessage = sendMessageMock;

      storageGetMock = jest.fn();
      chrome.storage.local.get = storageGetMock;

      tokenGovernor.mockClear();
      callLlamaAsync.mockClear();
      _cachePut.mockClear();
      handleBillingAwareResult.mockClear();
    });

    test('callGeminiAsync uses Local Built-in AI first', async () => {
      // Mock Local AI to succeed
      const mockSession = {
        prompt: jest.fn().mockResolvedValue('Local response'),
        destroy: jest.fn(),
      };
      global.LanguageModel = {
        availability: jest.fn().mockResolvedValue('available'),
        create: jest.fn().mockResolvedValue(mockSession),
      };
      builtInAi.languageModel = global.LanguageModel;

      const result = await callGeminiAsync({ action: 'prompt', text: 'Hello' });

      expect(result.ok).toBe(true);
      expect(result.result).toBe('Local response');
      expect(sendMessageMock).not.toHaveBeenCalled();
      expect(callLlamaAsync).not.toHaveBeenCalled();
    });

    test('callGeminiAsync falls back to Llama second', async () => {
      // Local AI fails
      global.LanguageModel = null;
      builtInAi.languageModel = null;

      // Mock Llama key configured
      storageGetMock.mockImplementation((keys, callback) => {
        callback({ chatbridge_hf_key: 'hf_test_key' });
      });

      // Mock callLlamaAsync response
      callLlamaAsync.mockResolvedValue({ ok: true, result: 'Llama response' });

      const result = await callGeminiAsync({ action: 'prompt', text: 'Hello' });

      expect(result.ok).toBe(true);
      expect(result.result).toBe('Llama response');
      expect(callLlamaAsync).toHaveBeenCalled();
      expect(sendMessageMock).not.toHaveBeenCalled();
    });

    test('callGeminiAsync falls back to Gemini Cloud third', async () => {
      // Local AI fails
      global.LanguageModel = null;
      builtInAi.languageModel = null;

      // Mock Llama not configured
      storageGetMock.mockImplementation((keys, callback) => {
        callback({});
      });

      // Mock call_gemini background response
      sendMessageMock.mockImplementation((msg, callback) => {
        if (msg.type === 'call_gemini') {
          callback({ ok: true, result: 'Gemini response' });
        }
      });

      const result = await callGeminiAsync({ action: 'prompt', text: 'Hello' });

      expect(result.ok).toBe(true);
      expect(result.result).toBe('Gemini response');
      expect(callLlamaAsync).not.toHaveBeenCalled();
      expect(sendMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'call_gemini' }),
        expect.any(Function)
      );
    });
  });
});
