const fs = require('fs');
const path = require('path');

// Load scan.js into test context
const scanCode = fs.readFileSync(path.resolve(__dirname, '../../content/features/scan.js'), 'utf8');
eval(scanCode);

describe('Scroll-based Message Accumulation Tests', () => {
  let scanFeature;
  let scrollContainer;
  let scrollPos;
  let scrollSetAttempts;
  let stallScrollUpdates;
  let messagesList;
  let mockAdapter;

  beforeEach(() => {
    document.body.innerHTML = '';
    scrollPos = 1200;
    scrollSetAttempts = 0;
    stallScrollUpdates = false;
    
    // Create mock scroll container
    scrollContainer = document.createElement('div');
    scrollContainer.id = 'chat-scroll-container';
    document.body.appendChild(scrollContainer);
    
    Object.defineProperty(scrollContainer, 'scrollTop', {
      get: () => scrollPos,
      set: (val) => {
        scrollSetAttempts += 1;
        if (!stallScrollUpdates || scrollSetAttempts > 3) {
          scrollPos = val;
        }
      },
      configurable: true
    });
    
    Object.defineProperty(scrollContainer, 'clientHeight', {
      get: () => 800,
      configurable: true
    });

    // Populate mock message database
    messagesList = [];
    for (let i = 1; i <= 16; i++) {
      messagesList.push({ role: i % 2 === 0 ? 'assistant' : 'user', text: `Message ${i}` });
    }

    // Mock adapter
    mockAdapter = {
      id: 'mock-adapter',
      scrollContainer: () => scrollContainer,
      getInput: () => document.createElement('textarea'),
      getMessages: () => {
        // Return different message slices based on the current scroll position
        if (scrollPos > 800) {
          // Scrolled at the bottom - only return the last 6 messages (11 to 16)
          return messagesList.slice(10);
        } else if (scrollPos > 0) {
          // Scrolled in the middle - return messages 6 to 16 (11 messages total)
          return messagesList.slice(5);
        } else {
          // Scrolled to top - return all 16 messages
          return messagesList;
        }
      }
    };

    window.pickAdapter = () => mockAdapter;

    // Instantiate scanFeature
    scanFeature = window.ChatBridgeContentScan.createFeature({
      debugLog: () => {},
      scanState: { lastScanTimestamp: 0 },
      SCAN_DEBOUNCE_MS: 0,
      SKIP_SCROLL_ON_SCAN: false,
      scrollContainerToTop: () => Promise.resolve(),
      waitForDomStability: (container, stableMs, timeoutMs) => Promise.resolve(true),
      normalizeMessages: (x) => x,
      extractAttachmentsFromElement: () => [],
      filterCandidateNodes: (x) => x,
      highlightNodesByElements: () => {},
      extractTextWithFormatting: (x) => x,
      inferRoleFromNode: () => 'assistant',
      getDebugFlags: () => ({})
    });
  });

  test('successfully scrolls and accumulates all 16 messages', async () => {
    const result = await scanFeature.scanChat();
    
    // Result should contain all 16 messages
    expect(result).toHaveLength(16);
    expect(result[0].text).toBe('Message 1');
    expect(result[15].text).toBe('Message 16');

    // Verify it restored original scroll position
    expect(scrollPos).toBe(1200);
  });

  test('keeps scanning through stalled ChatGPT-style scroll updates', async () => {
    stallScrollUpdates = true;
    messagesList = [];
    for (let i = 1; i <= 30; i++) {
      messagesList.push({ role: i % 2 === 0 ? 'assistant' : 'user', text: `Message ${i}` });
    }

    mockAdapter = {
      id: 'chatgpt',
      scrollContainer: () => scrollContainer,
      getInput: () => document.createElement('textarea'),
      getMessages: () => {
        if (scrollSetAttempts < 4) {
          return messagesList.slice(22);
        }
        if (scrollPos > 700) {
          return messagesList.slice(14);
        }
        if (scrollPos > 0) {
          return messagesList.slice(6);
        }
        return messagesList;
      }
    };

    const result = await scanFeature.scanChat();

    expect(result).toHaveLength(30);
    expect(result[0].text).toBe('Message 1');
    expect(result[29].text).toBe('Message 30');
  });
});
