Playwright acceptance tests

Setup (Windows PowerShell):

# Install dev deps
npm install

# Install Playwright browsers
npm run pw:install

Run tests:

npm run test:acceptance

Notes:
- Tests run headless by default. If you need to see the browser, edit `playwright.config.ts` and set `headless: false`.
- The tests mock `chrome.runtime.sendMessage` in the page context so they don't rely on a real extension background. To test the real extension behavior, run the tests with the extension loaded in a persistent context (more advanced).
 
Real-extension test:
- The `tests/acceptance.real-extension.spec.ts` test launches Chromium with the unpacked extension loaded. This test runs in headful mode and will open a visible browser. Make sure no conflicting Chrome instances are running.
- To run it, first install the deps and browsers, then run the Playwright test command. The test may take a few seconds to allow the extension to inject into the page.
