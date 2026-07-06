const fs = require('fs');
const path = require('path');

const securityCode = fs.readFileSync(path.resolve(__dirname, '../../core/security.js'), 'utf8');
eval(securityCode);

describe('Security module unit tests', () => {
  test('detectSensitiveData finds email addresses and sanitizes them', () => {
    const text = 'Contact me at test@example.com for details.';
    const findings = ChatBridgeSecurity.detectSensitiveData(text);
    expect(findings).toEqual([
      expect.objectContaining({
        type: 'email',
        count: 1,
      })
    ]);

    const sanitized = ChatBridgeSecurity.sanitize(text, { preserve: 2 });
    expect(sanitized).toContain('@');
    expect(sanitized).not.toContain('test@example.com');
    expect(sanitized).toMatch(/t\*+t@e\*+e\.com/i);
  });
});
