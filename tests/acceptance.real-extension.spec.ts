// @ts-nocheck
import { test, expect, chromium } from '@playwright/test';
import * as http from 'http';

// serve a page with two messages and an input
const pageHtml = `<!doctype html><html><body>
  <div id="app">
    <div class="message user">Hello</div>
    <div class="message assistant">Hi there!</div>
  </div>
  <textarea id="input"></textarea>
</body></html>`;

test('real extension loaded and generate inserts assistant text', async () => {
  const server = http.createServer((req: any, res: any) => {
    if (req.url === '/' || req.url === '/index.html') { res.writeHead(200, {'Content-Type':'text/html'}); res.end(pageHtml); return; }
    res.writeHead(404); res.end();
  }).listen(0);
  const port = (server.address() as any).port;
  const base = `http://localhost:${port}`;

  // process is available at runtime; ignore TS warning in the editor until dev deps are installed
  // @ts-ignore
  const extensionPath = process.cwd();

  const browser = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  // intercept the OpenAI call from any origin and return mocked assistant text
  await browser.route('https://api.openai.com/v1/chat/completions', (route: any) => {
    const body = {
      id: 'test', object: 'chat.completion', choices: [{ message: { role: 'assistant', content: 'Mocked assistant reply' } }]
    };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  const page = await browser.newPage();
  await page.goto(base);

  // give extension a moment to inject
  await page.waitForSelector('#cb-avatar', { timeout: 10000 });
  await page.click('#cb-avatar');
  // wait for generate button in the shadow host
  await page.waitForSelector('#cb-host', { timeout: 10000 });
  // click the generate button inside the shadow DOM
  await page.evaluate(() => {
    const host = document.getElementById('cb-host');
    if (!host) throw new Error('host not found');
    const shadow = (host as any).shadowRoot;
    const btn = shadow.querySelector('.cb-actions .cb-btn:last-child');
    (btn as HTMLElement).click();
  });

  // wait for the input to be filled
  await page.waitForFunction(() => { const el = document.getElementById('input'); return el && (el as any).value && (el as any).value.length > 0; }, { timeout: 10000 });
  const val = await page.$eval('#input', (el: any) => (el as HTMLTextAreaElement).value);
  expect(val).toContain('Mocked assistant reply');

  await browser.close();
  server.close();
});
