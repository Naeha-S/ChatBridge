const fs = require('fs');
const path = require('path');

// Load restore.js into test context
const restoreCode = fs.readFileSync(path.resolve(__dirname, '../../content/features/restore.js'), 'utf8');
eval(restoreCode);

describe('Restore Auto-summarization Tests', () => {
  let restoreFeatureInstance;
  let mockTextarea;

  beforeEach(() => {
    document.body.innerHTML = '';
    
    // Create mock input textarea
    mockTextarea = document.createElement('textarea');
    mockTextarea.id = 'prompt-textarea';
    document.body.appendChild(mockTextarea);
    
    // Mock document.activeElement
    mockTextarea.focus();

    // Mock chrome.runtime.sendMessage
    chrome.runtime.sendMessage = jest.fn((message, callback) => {
      if (message.type === 'call_gemini' && message.payload.action === 'summarize') {
        setTimeout(() => callback({ ok: true, result: 'This is a mock summarized conversation.' }), 0);
      } else {
        setTimeout(() => callback({ ok: true }), 0);
      }
    });

    const restoreDeps = {
      restoreLog: jest.fn(),
      toast: jest.fn(),
      findVisibleInputCandidate: () => mockTextarea,
      waitForComposer: () => Promise.resolve(mockTextarea),
      attachFilesToChat: () => Promise.resolve(true),
      pendingRestoreMessages: [],
      setRestoreToChatFunction: jest.fn()
    };

    restoreFeatureInstance = window.ChatBridgeContentRestore.createFeature(restoreDeps);
  });

  test('does not summarize short texts (< 5000 chars and < 1200 words)', async () => {
    const text = 'This is a short message.';
    const result = await restoreFeatureInstance.restoreToChat(text);
    
    expect(result).toBe(true);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'call_gemini' }),
      expect.any(Function)
    );
    expect(mockTextarea.value).toBe(text);
  });

  test('auto summarizes long texts (>= 5000 chars)', async () => {
    // Generate a string >= 5000 chars
    const text = 'A'.repeat(5500);
    const result = await restoreFeatureInstance.restoreToChat(text);
    
    expect(result).toBe(true);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'call_gemini',
        payload: expect.objectContaining({
          action: 'summarize',
          text: text
        })
      }),
      expect.any(Function)
    );
    expect(mockTextarea.value).toContain('This is a mock summarized conversation.');
    expect(mockTextarea.value).toContain('[SYSTEM: The user just restored this past conversation summary.');
  });

  test('auto summarizes texts with >= 1200 words', async () => {
    // Generate 1250 words
    const words = Array(1250).fill('word').join(' ');
    const result = await restoreFeatureInstance.restoreToChat(words);
    
    expect(result).toBe(true);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'call_gemini',
        payload: expect.objectContaining({
          action: 'summarize',
          text: words
        })
      }),
      expect.any(Function)
    );
    expect(mockTextarea.value).toContain('This is a mock summarized conversation.');
    expect(mockTextarea.value).toContain('[SYSTEM: The user just restored this past conversation summary.');
  });
});
