# ChatBridge Test Suite - Summary

## Test Coverage Overview

All adapter regression tests are passing ✅

### Test Results

```
Running 8 tests using 1 worker

  ✓  Gemini › should extract exactly 2 messages from native Gemini structure (1.4s)
  ✓  Gemini › should not extract sidebar conversations or UI chrome (19.0s)
  ✓  ChatGPT › should extract exactly 2 messages from ChatGPT structure (907ms)
  ✓  ChatGPT › should not extract system messages or UI chrome (395ms)
  ✓  Claude › should extract exactly 2 messages from Claude structure (383ms)
  ✓  Claude › should clean and merge assistant message fragments (234ms)
  ✓  Claude › should filter out system UI messages (2.3s)
  ✓  Cross-Platform › all adapters should return consistent message structure (222ms)

8 passed (37.1s)
```

## What's Protected

### Gemini Adapter
- ✅ Extracts exactly 2 messages (1 user, 1 assistant) from native `<user-query>` and `<model-response>` tags
- ✅ Filters out sidebar conversations (conversation list, history)
- ✅ Excludes UI chrome (suggestion chips, regenerate/copy/share buttons)
- ✅ Uses main chat container width to avoid scanning sidebars
- ✅ Deduplicates by message text (first 100 characters)

### ChatGPT Adapter
- ✅ Extracts exactly 2 messages using `[data-message-author-role]` selectors
- ✅ Filters out system messages (`data-message-author-role="system"`)
- ✅ Excludes UI chrome (regenerate, copy buttons)
- ✅ Extracts text from `.markdown.prose` children
- ✅ Filters messages shorter than 5 characters

### Claude Adapter
- ✅ Deep scans `<p>`, `.whitespace-pre-wrap`, `.break-words` nodes
- ✅ Infers roles by order (first is user, rest are assistant)
- ✅ Merges consecutive assistant message fragments into single message
- ✅ Cleans user message text (removes "N\n", "User:", extra whitespace)
- ✅ Filters out UI/system messages:
  - "continue the conversation"
  - "Claude can make mistakes"
  - "User:" prefix
  - System messages (regenerate, copy, share, etc.)

### Cross-Platform Consistency
- ✅ All adapters return messages with consistent structure: `{ role: 'user' | 'assistant', text: string }`
- ✅ Role values are normalized to 'user' or 'assistant'
- ✅ Text is always a string

## Running Tests

```powershell
# Run all acceptance tests
npm run test:acceptance

# Run only adapter regression tests
npm run test:acceptance -- tests/adapter-regression.spec.ts

# Run tests with UI
npx playwright test --ui

# Run tests in headed mode (see browser)
npx playwright test --headed

# Run specific test by name
npx playwright test -g "should extract exactly 2 messages from Claude"
```

## Test Maintenance

When modifying adapter code:

1. **Always run the test suite** after changes:
   ```powershell
   npm run test:acceptance -- tests/adapter-regression.spec.ts
   ```

2. **If tests fail**, check:
   - Did the DOM structure change on the target platform?
   - Are new UI elements being captured that should be filtered?
   - Is the filtering regex too strict or too loose?

3. **Update tests** when intentionally changing behavior:
   - Add new test cases for new filtering rules
   - Update assertions if message structure changes
   - Document the reason for the change

## Continuous Integration

These tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npx playwright install --with-deps
      - run: npm run test:acceptance
```

## Known Limitations

- Tests validate adapter logic in isolation, not the full extension context
- Real-world DOM structures may have variations not covered by test fixtures
- Tests don't validate API calls or background script behavior
- Network conditions and rate limits are not simulated

## Future Enhancements

- [ ] Add tests for error scenarios (empty DOM, malformed structure)
- [ ] Add performance benchmarks for large conversations
- [ ] Add visual regression tests for UI elements
- [ ] Add tests for restore functionality
- [ ] Mock real platform HTML for more realistic testing
- [ ] Add tests for adapter detection logic
- [ ] Add tests for scroll container selection
