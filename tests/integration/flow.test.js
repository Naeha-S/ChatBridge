const fs = require('fs');
const path = require('path');

// Load adapters, normalizeMessages, scan, and restore scripts into test environment
const adaptersCode = fs.readFileSync(path.resolve(__dirname, '../../core/adapters.js'), 'utf8');
const scanCode = fs.readFileSync(path.resolve(__dirname, '../../content/features/scan.js'), 'utf8');
const restoreCode = fs.readFileSync(path.resolve(__dirname, '../../content/features/restore.js'), 'utf8');

const contentScriptCode = fs.readFileSync(path.resolve(__dirname, '../../content_script.js'), 'utf8');
const startIndex = contentScriptCode.indexOf('function normalizeMessages(');
const endIndex = contentScriptCode.indexOf('// expose a very small', startIndex);
const normalizeCode = contentScriptCode.substring(startIndex, endIndex);

eval(adaptersCode);
eval(normalizeCode);
eval(scanCode);
eval(restoreCode);

describe('Scan -> Transform -> Restore Integration Flow', () => {
  let originalLocation;
  let scanFeatureInstance;
  let restoreFeatureInstance;
  let inputEvents = [];

  beforeAll(() => {
    originalLocation = window.location;
    window.ChatBridge = {};
  });

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      configurable: true,
      writable: true
    });
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    inputEvents = [];
    jest.clearAllMocks();

    // Set mock hostname for ChatGPT page
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'chatgpt.com',
        href: 'https://chatgpt.com/c/test-session'
      },
      configurable: true,
      writable: true
    });

    // Setup Mock DOM
    document.body.innerHTML = `
      <div data-testid="conversation-turns">
        <div data-message-author-role="user" class="turn-user">
          <div class="text-base">Explain React useEffect hook in one sentence.</div>
        </div>
        <div data-message-author-role="assistant" class="turn-assistant">
          <div class="markdown">The useEffect hook allows you to perform side effects in function components.</div>
        </div>
      </div>
      <textarea id="prompt-textarea"></textarea>
    `;

    // Hook listener to track dispatch events on prompt textarea
    const textarea = document.getElementById('prompt-textarea');
    ['input', 'change', 'textInput'].forEach(evtType => {
      textarea.addEventListener(evtType, (e) => {
        inputEvents.push({ type: evtType, value: textarea.value || e.data });
      });
    });

    // Instantiate Features with mock dependencies
    const scanDeps = {
      debugLog: jest.fn(),
      scanState: { lastScanTimestamp: 0 },
      SCAN_DEBOUNCE_MS: 0,
      SKIP_SCROLL_ON_SCAN: true,
      scrollContainerToTop: jest.fn().mockResolvedValue(),
      waitForDomStability: jest.fn().mockResolvedValue(),
      normalizeMessages: normalizeMessages, // from content_script
      extractAttachmentsFromElement: jest.fn().mockReturnValue([]),
      filterCandidateNodes: jest.fn(nodes => nodes),
      highlightNodesByElements: jest.fn(),
      extractTextWithFormatting: jest.fn(el => el.innerText),
      inferRoleFromNode: jest.fn().mockReturnValue('assistant'),
      getDebugFlags: jest.fn().mockReturnValue({})
    };

    const restoreDeps = {
      restoreLog: jest.fn(),
      toast: jest.fn(),
      findVisibleInputCandidate: jest.fn(() => document.getElementById('prompt-textarea')),
      waitForComposer: jest.fn().mockResolvedValue(document.getElementById('prompt-textarea')),
      attachFilesToChat: jest.fn().mockResolvedValue(true),
      pendingRestoreMessages: [],
      setRestoreToChatFunction: jest.fn()
    };

    scanFeatureInstance = window.ChatBridgeContentScan.createFeature(scanDeps);
    restoreFeatureInstance = window.ChatBridgeContentRestore.createFeature(restoreDeps);
  });

  test('full scan -> transform -> restore workflow successfully executes', async () => {
    // 1. Scan step: Scan the mock page
    const scannedMessages = await scanFeatureInstance.scanChat();
    
    expect(scannedMessages).toHaveLength(2);
    expect(scannedMessages[0].role).toBe('user');
    expect(scannedMessages[0].text).toBe('Explain React useEffect hook in one sentence.');
    expect(scannedMessages[1].role).toBe('assistant');
    expect(scannedMessages[1].text).toBe('The useEffect hook allows you to perform side effects in function components.');

    // 2. Transform step: Simulate a model transform (e.g. summarize/translate)
    // Here we'll wrap the scanned chat into a formatted prompt block (simulating Handoff/Prepare Me)
    const summaryHeader = 'Here is the summary of the scanned conversation:';
    const transformedText = `${summaryHeader}\n\n- User asked: "${scannedMessages[0].text}"\n- AI answered: "${scannedMessages[1].text}"`;

    // 3. Restore step: Restore the transformed text back into the composer input
    const restoreResult = await restoreFeatureInstance.restoreToChat(transformedText);
    
    expect(restoreResult).toBe(true);

    // 4. Verification step: Check the input element's final state and events
    const textarea = document.getElementById('prompt-textarea');
    
    // Check text was inserted
    expect(textarea.value).toBe(transformedText);

    // Check dispatch events were fired
    expect(inputEvents.some(e => e.type === 'input')).toBe(true);
    expect(inputEvents.some(e => e.type === 'change')).toBe(true);
  });
});
