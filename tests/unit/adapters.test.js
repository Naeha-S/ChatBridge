const fs = require('fs');
const path = require('path');

// Evaluate adapters.js in the global JSDOM scope
const adaptersCode = fs.readFileSync(path.resolve(__dirname, '../../core/adapters.js'), 'utf8');
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

  test('Claude adapter handles nested wrappers, duplicates, and screen reader text correctly', () => {
    setHostname('claude.ai');
    const adapter = pickAdapter();

    // Mock Claude DOM with a high-level layout div, screen reader text, and nested message nodes
    document.body.innerHTML = `
      <div class="layout-root">
        <div class="sr-only">Use the up and down arrow keys to move between messages.</div>
        <div data-testid="user-message" class="font-user">
          <div class="whitespace-pre-wrap">
            <p>ok can u make me a google form?</p>
          </div>
        </div>
        <div data-testid="assistant-message" class="font-claude">
          <div class="break-words">
            <p>I can't create a Google Form directly</p>
          </div>
        </div>
      </div>
    `;

    // Mock getBoundingClientRect for elements to simulate visibility
    const elements = document.querySelectorAll('.whitespace-pre-wrap, .break-words, p, [data-testid]');
    elements.forEach(el => {
      el.getBoundingClientRect = () => ({
        top: 0,
        left: 0,
        bottom: 100,
        right: 100,
        width: 100,
        height: 100
      });
    });

    // Mock getBoundingClientRect for the sr-only element to return 0x0 or 1x1 (hidden)
    const srOnly = document.querySelector('.sr-only');
    srOnly.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      width: 1,
      height: 1
    });

    const msgs = adapter.getMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].text).toBe('ok can u make me a google form?');
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].text).toBe("I can't create a Google Form directly");
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

  test('findScrollableContainer finds the correct scrollable ancestor or falls back to scrollingElement', () => {
    const originalGetComputedStyle = window.getComputedStyle;
    window.getComputedStyle = (el) => {
      if (el.id === 'scrollable') {
        return { getPropertyValue: (prop) => prop === 'overflow-y' ? 'auto' : '' };
      }
      return { getPropertyValue: () => '' };
    };

    document.body.innerHTML = `
      <div id="outer">
        <div id="scrollable">
          <div id="inner">
            <span id="target">Content</span>
          </div>
        </div>
      </div>
    `;

    const scrollableEl = document.getElementById('scrollable');
    const targetEl = document.getElementById('target');

    Object.defineProperty(scrollableEl, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollableEl, 'clientHeight', { value: 500, configurable: true });

    const result = findScrollableContainer(targetEl);
    expect(result.id).toBe('scrollable');

    const nonScrollableEl = document.getElementById('outer');
    const fallbackResult = findScrollableContainer(nonScrollableEl);
    expect(fallbackResult).toBe(document.scrollingElement || document.documentElement);

    window.getComputedStyle = originalGetComputedStyle;
  });

  test('ChatGPT adapter skips hidden messages', () => {
    setHostname('chatgpt.com');
    const adapter = pickAdapter();

    // Mock ChatGPT DOM structures with a hidden message
    document.body.innerHTML = `
      <div data-testid="conversation-turns">
        <div data-message-author-role="user" class="user-turn">
          <div class="text-base">Hello, is anyone there?</div>
        </div>
        <div data-message-author-role="assistant" class="assistant-turn" id="hidden-turn">
          <div class="markdown">This is a hidden assistant message</div>
        </div>
        <div data-message-author-role="assistant" class="assistant-turn">
          <div class="markdown">Yes, how can I assist you today?</div>
        </div>
      </div>
    `;

    // Make the hidden turn return 0 width/height
    const hiddenTurn = document.getElementById('hidden-turn');
    const bodyEl = hiddenTurn.querySelector('.markdown');
    bodyEl.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0
    });

    const msgs = adapter.getMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0].text).toBe('Hello, is anyone there?');
    expect(msgs[1].text).toBe('Yes, how can I assist you today?');
  });
});

