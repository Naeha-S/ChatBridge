const fs = require('fs');
const path = require('path');

// Evaluate adapters.js in the global JSDOM scope
const adaptersCode = fs.readFileSync(path.resolve(__dirname, '../../adapters.js'), 'utf8');
eval(adaptersCode);

describe('Adapters Unit Tests', () => {
  let originalLocation;

  beforeAll(() => {
    // Save original window.location
    originalLocation = window.location;
  });

  afterAll(() => {
    // Restore window.location
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      configurable: true,
      writable: true
    });
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  const setHostname = (hostname) => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname,
        href: `https://${hostname}/`
      },
      configurable: true,
      writable: true
    });
  };

  test('detects ChatGPT correctly', () => {
    setHostname('chatgpt.com');
    const adapter = pickAdapter();
    expect(adapter.id).toBe('chatgpt');

    setHostname('chat.openai.com');
    const adapter2 = pickAdapter();
    expect(adapter2.id).toBe('chatgpt');
  });

  test('detects Claude correctly', () => {
    setHostname('claude.ai');
    const adapter = pickAdapter();
    expect(adapter.id).toBe('claude');
  });

  test('detects Gemini correctly', () => {
    setHostname('gemini.google.com');
    const adapter = pickAdapter();
    expect(adapter.id).toBe('gemini');
  });

  test('falls back to generic adapter for unknown sites', () => {
    setHostname('example.com');
    const adapter = pickAdapter();
    expect(adapter.id).toBe('generic');
  });

  test('ChatGPT adapter extracts messages correctly', () => {
    setHostname('chatgpt.com');
    const adapter = pickAdapter();

    // Mock ChatGPT DOM structures
    document.body.innerHTML = `
      <div data-testid="conversation-turns">
        <div data-message-author-role="user" class="user-turn">
          <div class="text-base">Hello, is anyone there?</div>
        </div>
        <div data-message-author-role="assistant" class="assistant-turn">
          <div class="markdown">Yes, how can I assist you today?</div>
        </div>
      </div>
      <textarea id="prompt-textarea"></textarea>
    `;

    const msgs = adapter.getMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({
      role: 'user',
      text: 'Hello, is anyone there?',
      el: expect.any(HTMLElement)
    });
    expect(msgs[1]).toEqual({
      role: 'assistant',
      text: 'Yes, how can I assist you today?',
      el: expect.any(HTMLElement)
    });

    const input = adapter.getInput();
    expect(input.id).toBe('prompt-textarea');
  });

  test('Claude adapter extracts messages correctly', () => {
    setHostname('claude.ai');
    const adapter = pickAdapter();

    // Mock Claude DOM structures
    document.body.innerHTML = `
      <div data-testid="conversation-view">
        <div class="font-user" data-testid="user-message">
          <div class="whitespace-pre-wrap">User message text</div>
        </div>
        <div class="font-claude" data-testid="assistant-message">
          <div class="break-words">Claude response text</div>
        </div>
      </div>
      <div contenteditable="true" class="composer-editable"></div>
    `;

    const msgs = adapter.getMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].text).toBe('User message text');
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].text).toBe('Claude response text');

    const input = adapter.getInput();
    expect(input.className).toBe('composer-editable');
  });

  test('Gemini adapter extracts messages correctly', () => {
    setHostname('gemini.google.com');
    const adapter = pickAdapter();

    // Mock Gemini DOM structures
    document.body.innerHTML = `
      <div class="conversation-container">
        <user-query data-role="user">
          <div class="message-text">Explain quantum physics</div>
        </user-query>
        <model-response data-role="assistant">
          <message-content class="markdown markdown-main-panel">Quantum physics is the study of matter and energy...</message-content>
        </model-response>
      </div>
      <rich-textarea>
        <textarea id="gemini-input"></textarea>
      </rich-textarea>
    `;

    const msgs = adapter.getMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].text).toBe('Explain quantum physics');
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].text).toBe('Quantum physics is the study of matter and energy...');

    const input = adapter.getInput();
    expect(input.id).toBe('gemini-input');
  });

  test('Generic adapter works as a fallback', () => {
    setHostname('unknown-site.org');
    const adapter = pickAdapter();

    document.body.innerHTML = `
      <div class="conversation">
        <div class="chat-bubble user">Tell me a joke.</div>
        <div class="chat-bubble assistant">Why did the chicken cross the road?</div>
      </div>
      <input type="text" id="generic-input" />
    `;

    const msgs = adapter.getMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].text).toBe('Tell me a joke.');
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].text).toBe('Why did the chicken cross the road?');

    const input = adapter.getInput();
    expect(input.id).toBe('generic-input');
  });
});
