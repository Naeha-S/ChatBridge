const fs = require('fs');
const path = require('path');

// Extract normalizeMessages function from content_script.js
const contentScriptCode = fs.readFileSync(path.resolve(__dirname, '../../content_script.js'), 'utf8');
const startIndex = contentScriptCode.indexOf('function normalizeMessages(');
if (startIndex === -1) {
  throw new Error('Could not find function normalizeMessages in content_script.js');
}
const endIndex = contentScriptCode.indexOf('// expose a very small', startIndex);
if (endIndex === -1) {
  throw new Error('Could not find end of normalizeMessages (the expose comment) in content_script.js');
}
const functionCode = contentScriptCode.substring(startIndex, endIndex);

// Evaluate it in the test context so normalizeMessages becomes available
eval(functionCode);

describe('normalizeMessages Unit Tests', () => {
  test('returns empty array if input is not an array', () => {
    expect(normalizeMessages(null)).toEqual([]);
    expect(normalizeMessages(undefined)).toEqual([]);
    expect(normalizeMessages('string')).toEqual([]);
    expect(normalizeMessages({})).toEqual([]);
  });

  test('cleans system instruction blocks', () => {
    const raw = [
      { role: 'user', text: 'Hello world\n---[SYSTEM: instruction]' },
      { role: 'assistant', text: 'Hi [SYSTEM: instruction] there' },
      { role: 'user', text: 'Yo my friend\n\n--- [SYSTEM: instruction]\n' }
    ];
    const normalized = normalizeMessages(raw);
    expect(normalized).toHaveLength(3);
    expect(normalized[0].text).toBe('Hello world');
    expect(normalized[1].text).toBe('Hi there');
    expect(normalized[2].text).toBe('Yo my friend');
  });

  test('normalizes whitespace and newlines', () => {
    const raw = [
      { role: 'user', text: '  Hello   there\tworld  ' },
      { role: 'assistant', text: 'Line 1\n\n\nLine 2\n\n\n\n\nLine 3' }
    ];
    const normalized = normalizeMessages(raw);
    expect(normalized[0].text).toBe('Hello there world');
    expect(normalized[1].text).toBe('Line 1\n\nLine 2\n\nLine 3');
  });

  test('strips role prefixes', () => {
    const prefixes = ['Assistant', 'User', 'System', 'AI', 'Human', 'Claude', 'ChatGPT', 'Gemini', 'Copilot', 'Me'];
    const raw = prefixes.map((pref, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      text: `${pref}: Hello from ${pref}`
    }));
    const normalized = normalizeMessages(raw);
    normalized.forEach((msg, i) => {
      expect(msg.text).toBe(`Hello from ${prefixes[i]}`);
    });
  });

  test('filters out short messages and invalid input', () => {
    const raw = [
      { role: 'user', text: 'abc' }, // too short (<= 4 chars)
      { role: 'user', text: '  ' }, // empty
      { role: 'assistant', text: 'Hello' } // length 5, valid
    ];
    const normalized = normalizeMessages(raw);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].text).toBe('Hello');
  });

  test('filters out system buttons and action prompts', () => {
    const raw = [
      { role: 'assistant', text: 'new chat' },
      { role: 'assistant', text: 'regenerate' },
      { role: 'assistant', text: 'Copy' },
      { role: 'assistant', text: 'RIZZ GPT' },
      { role: 'assistant', text: 'This is a valid assistant message' }
    ];
    const normalized = normalizeMessages(raw);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].text).toBe('This is a valid assistant message');
  });

  test('filters out JSON strings', () => {
    const raw = [
      { role: 'assistant', text: '{"someKey": "someValue", "count": 123}' },
      { role: 'assistant', text: '[{"id": 1}, {"id": 2}]' },
      { role: 'assistant', text: '{"broken JSON: value' }, // invalid JSON, should not be filtered
      { role: 'assistant', text: 'Normal text' }
    ];
    const normalized = normalizeMessages(raw);
    expect(normalized).toHaveLength(2);
    expect(normalized[0].text).toBe('{"broken JSON: value');
    expect(normalized[1].text).toBe('Normal text');
  });

  test('filters out JavaScript structures and variables', () => {
    const raw = [
      { role: 'assistant', text: 'const x = 5; let y = 10; function test() {}' },
      { role: 'assistant', text: 'localStorage.getItem("token")' },
      { role: 'assistant', text: 'statsigPayload details' },
      { role: 'assistant', text: 'A completely normal paragraph with code words like const but not starting or matching the bad structure.' }
    ];
    const normalized = normalizeMessages(raw);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].text).toContain('A completely normal paragraph');
  });

  test('filters out typical sidebar navigation dumps', () => {
    const raw = [
      { role: 'assistant', text: 'Chat history\nSearch chats\nToday\nYesterday' },
      { role: 'assistant', text: 'Explore GPTs\nRizz GPT\nCustom bot' },
      { role: 'assistant', text: 'Valid message mentioning Chat history but not containing the whole list.' }
    ];
    const normalized = normalizeMessages(raw);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].text).toBe('Valid message mentioning Chat history but not containing the whole list.');
  });

  test('deduplicates adjacent duplicate messages and merges attachments', () => {
    const raw = [
      {
        role: 'user',
        text: 'Duplicate text',
        attachments: [{ url: 'http://example.com/doc1.pdf', kind: 'pdf' }]
      },
      {
        role: 'user',
        text: 'Duplicate text',
        attachments: [
          { url: 'http://example.com/doc1.pdf', kind: 'pdf' }, // duplicate attachment
          { url: 'http://example.com/doc2.pdf', kind: 'pdf' }  // new attachment
        ]
      },
      {
        role: 'assistant',
        text: 'Hello assistant'
      }
    ];
    const normalized = normalizeMessages(raw);
    expect(normalized).toHaveLength(2);
    expect(normalized[0].text).toBe('Duplicate text');
    expect(normalized[0].role).toBe('user');
    expect(normalized[0].attachments).toHaveLength(2);
    expect(normalized[0].attachments).toEqual([
      { url: 'http://example.com/doc1.pdf', kind: 'pdf' },
      { url: 'http://example.com/doc2.pdf', kind: 'pdf' }
    ]);
  });

  test('respects maxMessages limit', () => {
    const raw = Array.from({ length: 20 }, (_, i) => ({
      role: 'user',
      text: `Message index is ${100 + i}`
    }));
    
    const max5 = normalizeMessages(raw, 5);
    expect(max5).toHaveLength(5);
    expect(max5[0].text).toBe('Message index is 100');
    expect(max5[4].text).toBe('Message index is 104');

    // Default max
    const defaultMax = normalizeMessages(raw);
    expect(defaultMax).toHaveLength(20);
  });
});
