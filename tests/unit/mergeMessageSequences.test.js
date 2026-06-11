const fs = require('fs');
const path = require('path');

// Load scan.js into test context
const scanCode = fs.readFileSync(path.resolve(__dirname, '../../content/features/scan.js'), 'utf8');
eval(scanCode);

describe('mergeMessageSequences Unit Tests', () => {
  let scanFeature;
  let merge;

  beforeAll(() => {
    // Instantiate scanFeature with minimum dummy dependencies
    scanFeature = window.ChatBridgeContentScan.createFeature({
      debugLog: () => {},
      scanState: { lastScanTimestamp: 0 },
      SCAN_DEBOUNCE_MS: 0,
      SKIP_SCROLL_ON_SCAN: true,
      scrollContainerToTop: () => Promise.resolve(),
      waitForDomStability: () => Promise.resolve(),
      normalizeMessages: (x) => x,
      extractAttachmentsFromElement: () => [],
      filterCandidateNodes: (x) => x,
      highlightNodesByElements: () => {},
      extractTextWithFormatting: (x) => x,
      inferRoleFromNode: () => 'assistant',
      getDebugFlags: () => ({})
    });
    merge = scanFeature.mergeMessageSequences;
  });

  test('returns other array if one is empty/null', () => {
    const list = [{ role: 'user', text: 'Hello' }];
    expect(merge(null, list)).toEqual(list);
    expect(merge(list, null)).toEqual(list);
    expect(merge([], list)).toEqual(list);
    expect(merge(list, [])).toEqual(list);
  });

  test('merges with partial overlap', () => {
    const older = [
      { role: 'user', text: 'Message 1' },
      { role: 'assistant', text: 'Message 2' },
      { role: 'user', text: 'Message 3' }
    ];
    const newer = [
      { role: 'assistant', text: 'Message 2' },
      { role: 'user', text: 'Message 3' },
      { role: 'assistant', text: 'Message 4' }
    ];
    const expected = [
      { role: 'user', text: 'Message 1' },
      { role: 'assistant', text: 'Message 2' },
      { role: 'user', text: 'Message 3' },
      { role: 'assistant', text: 'Message 4' }
    ];
    expect(merge(older, newer)).toEqual(expected);
  });

  test('merges with full overlap', () => {
    const older = [
      { role: 'user', text: 'Message 1' },
      { role: 'assistant', text: 'Message 2' }
    ];
    const newer = [
      { role: 'user', text: 'Message 1' },
      { role: 'assistant', text: 'Message 2' }
    ];
    expect(merge(older, newer)).toEqual(older);
  });

  test('concatenates if no overlap is found', () => {
    const older = [
      { role: 'user', text: 'Message 1' }
    ];
    const newer = [
      { role: 'assistant', text: 'Message 2' }
    ];
    const expected = [
      { role: 'user', text: 'Message 1' },
      { role: 'assistant', text: 'Message 2' }
    ];
    expect(merge(older, newer)).toEqual(expected);
  });

  test('ignores trailing/leading spaces when checking overlap', () => {
    const older = [
      { role: 'user', text: 'Message 1  ' },
      { role: 'assistant', text: 'Message 2' }
    ];
    const newer = [
      { role: 'assistant', text: '  Message 2  ' },
      { role: 'user', text: 'Message 3' }
    ];
    const expected = [
      { role: 'user', text: 'Message 1  ' },
      { role: 'assistant', text: 'Message 2' },
      { role: 'user', text: 'Message 3' }
    ];
    expect(merge(older, newer)).toEqual(expected);
  });

  test('handles virtualization (some intermediate elements unmounted/missing in older view)', () => {
    const older = [
      { role: 'user', text: 'Message 0' },
      { role: 'user', text: 'Message 1' },
      { role: 'assistant', text: 'Message 2' },
      { role: 'user', text: 'Message 3' },
      { role: 'assistant', text: 'Message 4' },
      // Message 5 and 6 are unmounted/missing here
      { role: 'assistant', text: 'Message 7' },
      { role: 'user', text: 'Message 8' }
    ];
    const newer = [
      { role: 'user', text: 'Message 0' },
      { role: 'user', text: 'Message 1' },
      { role: 'assistant', text: 'Message 2' },
      { role: 'user', text: 'Message 3' },
      { role: 'assistant', text: 'Message 4' },
      { role: 'user', text: 'Message 5' },
      { role: 'assistant', text: 'Message 6' },
      { role: 'assistant', text: 'Message 7' },
      { role: 'user', text: 'Message 8' }
    ];
    const expected = [
      { role: 'user', text: 'Message 0' },
      { role: 'user', text: 'Message 1' },
      { role: 'assistant', text: 'Message 2' },
      { role: 'user', text: 'Message 3' },
      { role: 'assistant', text: 'Message 4' },
      { role: 'user', text: 'Message 5' },
      { role: 'assistant', text: 'Message 6' },
      { role: 'assistant', text: 'Message 7' },
      { role: 'user', text: 'Message 8' }
    ];
    expect(merge(older, newer)).toEqual(expected);
  });

  test('handles virtualization (older elements unmounted/missing in newer view)', () => {
    const older = [
      { role: 'user', text: 'Message 0' },
      { role: 'user', text: 'Message 1' },
      { role: 'assistant', text: 'Message 2' },
      { role: 'user', text: 'Message 3' },
      { role: 'assistant', text: 'Message 4' }
    ];
    const newer = [
      // Message 0 and 1 are unmounted/missing here
      { role: 'assistant', text: 'Message 2' },
      { role: 'user', text: 'Message 3' },
      { role: 'assistant', text: 'Message 4' },
      { role: 'user', text: 'Message 5' },
      { role: 'assistant', text: 'Message 6' }
    ];
    const expected = [
      { role: 'user', text: 'Message 0' },
      { role: 'user', text: 'Message 1' },
      { role: 'assistant', text: 'Message 2' },
      { role: 'user', text: 'Message 3' },
      { role: 'assistant', text: 'Message 4' },
      { role: 'user', text: 'Message 5' },
      { role: 'assistant', text: 'Message 6' }
    ];
    expect(merge(older, newer)).toEqual(expected);
  });
});

