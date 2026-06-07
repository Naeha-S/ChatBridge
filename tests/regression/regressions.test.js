const fs = require('fs');
const path = require('path');

// Load adapters.js into test environment
const adaptersCode = fs.readFileSync(path.resolve(__dirname, '../../core/adapters.js'), 'utf8');
eval(adaptersCode);

describe('Adapter Selector Regression & Layout Retro-compatibility Tests', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  const setHostname = (hostname) => {
    Object.defineProperty(window, 'location', {
      value: { hostname },
      configurable: true,
      writable: true
    });
  };

  describe('ChatGPT Layout Permutations', () => {
    beforeEach(() => setHostname('chatgpt.com'));

    test('Permutation 1: Modern data-message-author-role attribute layout', () => {
      document.body.innerHTML = `
        <div data-testid="conversation-turns">
          <div data-message-author-role="user">
            <div class="text-base">Modern ChatGPT User Message</div>
          </div>
          <div data-message-author-role="assistant">
            <div class="markdown prose">Modern ChatGPT Assistant Response</div>
          </div>
        </div>
      `;

      const adapter = pickAdapter();
      const msgs = adapter.getMessages();
      expect(msgs).toHaveLength(2);
      expect(msgs[0]).toEqual(expect.objectContaining({ role: 'user', text: 'Modern ChatGPT User Message' }));
      expect(msgs[1]).toEqual(expect.objectContaining({ role: 'assistant', text: 'Modern ChatGPT Assistant Response' }));
    });

    test('Permutation 2: Legacy article-based fallback layout', () => {
      // Missing data-message-author-role but using articles
      document.body.innerHTML = `
        <main>
          <article class="w-full text-token-text-primary">
            <div class="avatar-wrapper"><span class="user-avatar">User Icon</span></div>
            <div class="text-base">Legacy Article ChatGPT User message</div>
          </article>
          <article class="w-full text-token-text-primary">
            <div class="markdown prose">Legacy Article ChatGPT Assistant message</div>
          </article>
        </main>
      `;

      const adapter = pickAdapter();
      const msgs = adapter.getMessages();
      expect(msgs).toHaveLength(2);
      expect(msgs[0]).toEqual(expect.objectContaining({ role: 'user', text: 'Legacy Article ChatGPT User message' }));
      expect(msgs[1]).toEqual(expect.objectContaining({ role: 'assistant', text: 'Legacy Article ChatGPT Assistant message' }));
    });
  });

  describe('Claude Layout Permutations', () => {
    beforeEach(() => setHostname('claude.ai'));

    test('Permutation 1: Modern data-testid based layout', () => {
      document.body.innerHTML = `
        <div data-testid="conversation-view">
          <div data-testid="user-message">
            <div class="whitespace-pre-wrap">Modern Claude User Message</div>
          </div>
          <div data-testid="assistant-message">
            <div class="break-words">Modern Claude Assistant Message</div>
          </div>
        </div>
      `;

      const adapter = pickAdapter();
      const msgs = adapter.getMessages();
      expect(msgs).toHaveLength(2);
      expect(msgs[0]).toEqual(expect.objectContaining({ role: 'user', text: 'Modern Claude User Message' }));
      expect(msgs[1]).toEqual(expect.objectContaining({ role: 'assistant', text: 'Modern Claude Assistant Message' }));
    });

    test('Permutation 2: Class-based from-user/from-claude layout', () => {
      document.body.innerHTML = `
        <main>
          <div class="chat-row from-user">
            <p>Class-based Claude User Message</p>
          </div>
          <div class="chat-row from-claude">
            <p>Class-based Claude Assistant Message</p>
          </div>
        </main>
      `;

      const adapter = pickAdapter();
      const msgs = adapter.getMessages();
      expect(msgs).toHaveLength(2);
      expect(msgs[0]).toEqual(expect.objectContaining({ role: 'user', text: 'Class-based Claude User Message' }));
      expect(msgs[1]).toEqual(expect.objectContaining({ role: 'assistant', text: 'Class-based Claude Assistant Message' }));
    });

    test('Permutation 3: Structural alternation fallback layout', () => {
      // Fallback when wrappers lack user/assistant markers and uses direct child parsing
      document.body.innerHTML = `
        <div data-testid="chat-scroll">
          <div class="message-wrapper">
            <div class="break-words">Alternating Message 1 (assumed User)</div>
          </div>
          <div class="message-wrapper">
            <div class="break-words">Alternating Message 2 (assumed Assistant)</div>
          </div>
        </div>
      `;

      const adapter = pickAdapter();
      const msgs = adapter.getMessages();
      expect(msgs).toHaveLength(2);
      expect(msgs[0]).toEqual(expect.objectContaining({ role: 'user', text: 'Alternating Message 1 (assumed User)' }));
      expect(msgs[1]).toEqual(expect.objectContaining({ role: 'assistant', text: 'Alternating Message 2 (assumed Assistant)' }));
    });
  });

  describe('Gemini Layout Permutations', () => {
    beforeEach(() => setHostname('gemini.google.com'));

    test('Permutation 1: Modern custom element tags (user-query / model-response)', () => {
      document.body.innerHTML = `
        <div class="conversation-container">
          <user-query>
            <div class="message-text">Modern Gemini User Message</div>
          </user-query>
          <model-response>
            <message-content class="markdown">Modern Gemini Assistant Message</message-content>
          </model-response>
        </div>
      `;

      const adapter = pickAdapter();
      const msgs = adapter.getMessages();
      expect(msgs).toHaveLength(2);
      expect(msgs[0]).toEqual(expect.objectContaining({ role: 'user', text: 'Modern Gemini User Message' }));
      expect(msgs[1]).toEqual(expect.objectContaining({ role: 'assistant', text: 'Modern Gemini Assistant Message' }));
    });

    test('Permutation 2: Bard/Gemini legacy message-set children layout', () => {
      // Uses message-set fallback
      document.body.innerHTML = `
        <main>
          <message-set>
            <div class="user-query-class from-user">
              <div class="message-text">Legacy message-set User Message</div>
            </div>
            <div class="model-response-class from-model">
              <div class="message-text">Legacy message-set Assistant Message</div>
            </div>
          </message-set>
        </main>
      `;

      const adapter = pickAdapter();
      const msgs = adapter.getMessages();
      expect(msgs).toHaveLength(2);
      expect(msgs[0]).toEqual(expect.objectContaining({ role: 'user', text: 'Legacy message-set User Message' }));
      expect(msgs[1]).toEqual(expect.objectContaining({ role: 'assistant', text: 'Legacy message-set Assistant Message' }));
    });

    test('Permutation 3: Generic conversation-turn fallback layout', () => {
      document.body.innerHTML = `
        <main>
          <div class="conversation-turn user">
            <div class="message-text">Fallback conversation-turn User Message</div>
          </div>
          <div class="conversation-turn assistant">
            <div class="message-text">Fallback conversation-turn Assistant Message</div>
          </div>
        </main>
      `;

      const adapter = pickAdapter();
      const msgs = adapter.getMessages();
      expect(msgs).toHaveLength(2);
      expect(msgs[0]).toEqual(expect.objectContaining({ role: 'user', text: 'Fallback conversation-turn User Message' }));
      expect(msgs[1]).toEqual(expect.objectContaining({ role: 'assistant', text: 'Fallback conversation-turn Assistant Message' }));
    });
  });
});
