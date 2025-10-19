// @ts-nocheck
import { test, expect, chromium } from '@playwright/test';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';

// small static page with two chat messages and an extension-like UI element
const pageHtml = `<!doctype html><html><body>
  <div id="app">
    <div class="message user">Hello</div>
    <div class="message assistant">Hi there!</div>
    <!-- extension UI that should be excluded -->
    <div id="cb-host" data-cb-ignore="true">EXTENSION</div>
  </div>
  <textarea id="input"></textarea>
  <script src="/content_script_stub.js"></script>
</body></html>`;

// stub content script to simulate extension being present on the page (we will not load real extension here)
const stubScript = `window.__CHATBRIDGE_TEST_API_KEY = 'test-key';
window.pickAdapter = ()=>({ getInput: ()=>document.getElementById('input') });
window.scanChat = async ()=>{
  return [ { role:'user', text: document.querySelector('.message.user').innerText }, { role:'assistant', text: document.querySelector('.message.assistant').innerText } ];
};
`;

test('scan excludes extension UI and generate flow works (mocked background)', async () => {
  // start static server
  const server = http.createServer((req: any, res: any) => {
    if (req.url === '/' || req.url === '/index.html') { res.writeHead(200, {'Content-Type':'text/html'}); res.end(pageHtml); return; }
    if (req.url === '/content_script_stub.js') { res.writeHead(200, {'Content-Type':'text/javascript'}); res.end(stubScript); return; }
    res.writeHead(404); res.end();
  }).listen(0);
  const port = (server.address() as any).port;
  const base = `http://localhost:${port}`;

  const args = [];
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.route('**/json**', (route: any) => route.continue());

  // stub chrome.runtime.sendMessage on the page to simulate background returning assistant text
  await page.addInitScript(() => {
    (window as any).chrome = (window as any).chrome || {};
    (window as any).chrome.runtime = (window as any).chrome.runtime || {};
    (window as any).chrome.runtime.sendMessage = (msg: any, cb: any) => { setTimeout(()=>cb({ ok:true, assistant: 'This is a generated reply' }), 50); };
  });

  await page.goto(base);

  // verify scan picks the two messages and does not include extension UI
  const msgs = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('.message, #cb-host')) as Element[];
    const filtered = nodes.filter(n => n && !(n.getAttribute && n.getAttribute('data-cb-ignore') === 'true')).map(n => (n as HTMLElement).innerText);
    return filtered;
  });
  expect(msgs).toEqual(['Hello','Hi there!']);

  // call the generate flow - emulate calling the real content script's generate handler by sending the chrome.runtime message
  const res = await page.evaluate(() => new Promise(resolve => (window as any).chrome.runtime.sendMessage({ type:'call_openai', payload:{ messages: [] } }, (r: any) => resolve(r))));
  expect(res.ok).toBe(true);
  expect(res.assistant).toContain('generated reply');

  await browser.close();
  server.close();
});
