// ChatBridge - Complete UX Updates
// This file contains all the code snippets to complete the remaining improvements

// ============================================
// 1. DISABLE SMART CONTEXT INJECTION AUTO-INIT (Performance Fix)
// ============================================
// REPLACE in content_script.js around line 6773:

// OLD CODE:
/*
    // Initialize Smart Context Injection
    try {
      if (window.SmartContextInjection) {
        const contextInjection = new window.SmartContextInjection();
        // Initialize after a short delay to ensure page is ready
        setTimeout(() => {
          try {
            // Find all AI chat inputs on the page
            const inputs = document.querySelectorAll('textarea, [contenteditable="true"]');
            inputs.forEach(input => {
              contextInjection.init(input, shadow);
            });
            debugLog('Smart Context Injection initialized');
          } catch (e) {
            debugLog('Smart Context Injection init failed:', e);
          }
        }, 1000);
      }
    } catch (e) {
      debugLog('Smart Context Injection setup failed:', e);
    }
*/

// NEW CODE:
/*
    // Smart Context Injection - DISABLED by default for performance
    // Can be enabled via settings if needed
    // The auto-listener on every input was slowing down restore operations
    window.ChatBridge = window.ChatBridge || {};
    window.ChatBridge.enableSmartContext = function() {
      try {
        if (window.SmartContextInjection) {
          const contextInjection = new window.SmartContextInjection();
          const inputs = document.querySelectorAll('textarea, [contenteditable="true"]');
          inputs.forEach(input => contextInjection.init(input, shadow));
          toast('Smart Context enabled');
        }
      } catch (e) {
        console.error('Smart Context enable failed:', e);
      }
    };
*/

// ============================================
// 2. UPDATE COPY BUTTON TO SHOW CLIPBOARD POPUP
// ============================================
// REPLACE btnClipboard.addEventListener in content_script.js around line 4146:

// NEW CODE:
btnClipboard.addEventListener('click', async () => {
  try {
    // Check if clipboard popup already exists
    let clipboardPopup = shadow.querySelector('#cb-clipboard-popup');
    
    if (clipboardPopup) {
      // Toggle visibility
      clipboardPopup.style.display = clipboardPopup.style.display === 'none' ? 'flex' : 'none';
      return;
    }
    
    // Create new clipboard popup
    clipboardPopup = document.createElement('div');
    clipboardPopup.id = 'cb-clipboard-popup';
    clipboardPopup.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 500px;
      max-height: 600px;
      background: var(--cb-bg2);
      border: 1px solid var(--cb-border);
      border-radius: 16px;
      box-shadow: 0 20px 60px var(--cb-shadow);
      z-index: 2147483648;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    `;
    
    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;';
    header.innerHTML = `
      <div style="font-size: 18px; font-weight: 700; color: var(--cb-white);">📋 Universal Clipboard</div>
      <button class="cb-btn" id="cb-close-clipboard" style="padding: 6px 12px; font-size: 12px;">✕</button>
    `;
    clipboardPopup.appendChild(header);
    
    // Clipboard content
    const clipboardContent = document.createElement('div');
    clipboardContent.id = 'cb-clipboard-content';
    clipboardPopup.appendChild(clipboardContent);
    
    // Render clipboard
    if (window.UniversalClipboard) {
      const clipboardManager = new window.UniversalClipboard();
      clipboardManager.renderClipboard(clipboardContent);
    } else {
      clipboardContent.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--cb-subtext);">Clipboard feature not available</div>';
    }
    
    // Add to shadow DOM
    shadow.appendChild(clipboardPopup);
    
    // Close button handler
    const closeBtn = clipboardPopup.querySelector('#cb-close-clipboard');
    closeBtn.addEventListener('click', () => {
      clipboardPopup.style.display = 'none';
    });
    
    // Close on backdrop click
    clipboardPopup.addEventListener('click', (e) => {
      if (e.target === clipboardPopup) {
        clipboardPopup.style.display = 'none';
      }
    });
    
  } catch (e) {
    console.error('Clipboard popup error:', e);
    toast('Failed to open clipboard');
  }
});

// ============================================
// 3. REORGANIZE INSIGHTS TAB LAYOUT
// ============================================
// REPLACE renderSmartWorkspace function around line 1400:

async function renderSmartWorkspace() {
  try {
    if (!insightsContent) {
      debugLog('insightsContent not found!');
      toast('Error: UI element missing');
      return;
    }
    insightsContent.innerHTML = '';
    debugLog('Rendering Smart Workspace...');

    // 1. Quick Actions Grid FIRST (at top)
    const actionsGrid = document.createElement('div');
    actionsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px;padding:0 12px;';

    // Create action buttons
    const compareBtn = createFeatureCard('Compare Models', 'Compare how different AIs answered the same question', '🔄', async () => {
      const convs = await loadConversationsAsync();
      if (!convs || convs.length < 2) { toast('Need at least 2 conversations'); return; }
      const comparableGroups = findComparableConversations(convs);
      if (!comparableGroups.length) { toast('No similar conversations found to compare'); return; }
      showComparisonView(comparableGroups[0]);
    });

    const mergeBtn = createFeatureCard('Merge Threads', 'Combine related conversations into one coherent thread', '🔗', async () => {
      const convs = await loadConversationsAsync();
      if (!convs || convs.length < 2) { toast('Need at least 2 conversations'); return; }
      showMergeView(convs);
    });

    const extractBtn = createFeatureCard('Extract Content', 'Pull out code blocks, lists, or important info', '📋', () => {
      showExtractView();
    });

    const snapshotBtn = createFeatureCard('Context Snapshot', 'Export current chat as shareable context', '📸', async () => {
      addLoadingToButton(snapshotBtn, 'Creating snapshot...');
      try {
        const msgs = await scanChat();
        if (!msgs || msgs.length === 0) {
          toast('No messages found in current chat');
          removeLoadingFromButton(snapshotBtn, 'Context Snapshot');
          return;
        }
        
        // Generate snapshot
        const now = new Date();
        let snapshot = `# ChatBridge Context Snapshot\n`;
        snapshot += `**Generated**: ${now.toLocaleString()}\n`;
        snapshot += `**Platform**: ${location.hostname}\n`;
        snapshot += `**Messages**: ${msgs.length}\n\n---\n\n`;
        
        msgs.forEach((m, idx) => {
          const role = m.role === 'user' ? '👤 **User**' : '🤖 **Assistant**';
          snapshot += `### Message ${idx + 1} (${role})\n\n${m.text}\n\n---\n\n`;
        });
        
        // Show in output area
        showInsightsOutput(snapshot);
        await navigator.clipboard.writeText(snapshot);
        toast(`Snapshot created (${msgs.length} messages)`);
        
      } catch (e) {
        toast('Snapshot creation failed');
      } finally {
        removeLoadingFromButton(snapshotBtn, 'Context Snapshot');
      }
    });

    actionsGrid.appendChild(compareBtn);
    actionsGrid.appendChild(mergeBtn);
    actionsGrid.appendChild(extractBtn);
    actionsGrid.appendChild(snapshotBtn);
    insightsContent.appendChild(actionsGrid);

    // 2. AI-Generated Insights Section (BELOW buttons, shown if available)
    const insightsSection = document.createElement('div');
    insightsSection.id = 'cb-insights-section';
    insightsSection.style.cssText = 'margin-bottom:16px;padding:0 12px;display:none;'; // Hidden by default
    
    try {
      const lastInsights = localStorage.getItem('chatbridge:last_insights');
      if (lastInsights && window.AISummaryEngine) {
        const insights = JSON.parse(lastInsights);
        
        const insightsTitle = document.createElement('div');
        insightsTitle.style.cssText = 'font-weight:600;font-size:12px;margin-bottom:8px;color:var(--cb-subtext);display:flex;align-items:center;justify-content:space-between;';
        insightsTitle.innerHTML = `
          <span>🎯 AI-Generated Insights</span>
          <button class="cb-btn" id="cb-refresh-insights" style="padding:2px 8px;font-size:10px;">Refresh</button>
        `;
        insightsSection.appendChild(insightsTitle);
        
        const insightsContainer = document.createElement('div');
        insightsContainer.id = 'cb-ai-insights-container';
        insightsContainer.style.cssText = 'background:rgba(16,24,43,0.4);border:1px solid rgba(0,180,255,0.2);border-radius:8px;padding:12px;max-height:300px;overflow-y:auto;';
        
        const summaryEngine = new window.AISummaryEngine();
        summaryEngine.renderInsights(insights, insightsContainer);
        
        insightsSection.appendChild(insightsContainer);
        insightsSection.style.display = 'block'; // Show since we have data
        
        // Add refresh handler
        setTimeout(() => {
          const refreshBtn = insightsTitle.querySelector('#cb-refresh-insights');
          if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
              addLoadingToButton(refreshBtn, 'Refreshing...');
              try {
                const msgs = await scanChat();
                if (msgs && msgs.length > 0) {
                  const newInsights = await summaryEngine.generateInsights(msgs);
                  if (newInsights) {
                    localStorage.setItem('chatbridge:last_insights', JSON.stringify(newInsights));
                    insightsContainer.innerHTML = '';
                    summaryEngine.renderInsights(newInsights, insightsContainer);
                    toast('Insights refreshed');
                  }
                }
              } catch (e) {
                toast('Refresh failed');
              } finally {
                removeLoadingFromButton(refreshBtn, 'Refresh');
              }
            });
          }
        }, 100);
      }
    } catch (e) {
      debugLog('Failed to load AI insights:', e);
    }
    
    insightsContent.appendChild(insightsSection);

    // 3. Output Preview Area (HIDDEN initially, shown after process completes)
    const outputSection = document.createElement('div');
    outputSection.id = 'cb-insights-output-section';
    outputSection.style.cssText = 'padding:0 12px;margin-bottom:16px;display:none;'; // Hidden initially
    
    const outputLabel = document.createElement('div');
    outputLabel.style.cssText = 'font-weight:600;font-size:12px;margin-bottom:8px;color:var(--cb-subtext);';
    outputLabel.textContent = '📄 Output Preview';
    outputSection.appendChild(outputLabel);
    
    const outputArea = document.createElement('div');
    outputArea.id = 'cb-insights-output';
    outputArea.className = 'cb-view-text';
    outputArea.style.cssText = 'min-height:120px;max-height:300px;overflow-y:auto;background:rgba(16,24,43,0.4);border:1px solid rgba(0,180,255,0.2);border-radius:8px;padding:12px;font-size:12px;line-height:1.5;white-space:pre-wrap;';
    outputArea.textContent = '(Results will appear here)';
    outputSection.appendChild(outputArea);
    
    const outputControls = document.createElement('div');
    outputControls.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
    
    const btnSendToChat = document.createElement('button');
    btnSendToChat.className = 'cb-btn cb-btn-primary';
    btnSendToChat.textContent = '➤ Send to Chat';
    btnSendToChat.style.cssText = 'flex:1;';
    btnSendToChat.addEventListener('click', async () => {
      const outputText = outputArea.textContent;
      if (!outputText || outputText === '(Results will appear here)') {
        toast('No output to send');
        return;
      }
      try {
        await restoreToChat(outputText, []);
        toast('Sent to chat');
      } catch (e) {
        toast('Failed to send to chat');
      }
    });
    
    const btnCopyOutput = document.createElement('button');
    btnCopyOutput.className = 'cb-btn';
    btnCopyOutput.textContent = '📋 Copy';
    btnCopyOutput.addEventListener('click', async () => {
      const outputText = outputArea.textContent;
      if (!outputText || outputText === '(Results will appear here)') {
        toast('No output to copy');
        return;
      }
      try {
        await navigator.clipboard.writeText(outputText);
        toast('Copied to clipboard');
      } catch (e) {
        toast('Copy failed');
      }
    });
    
    const btnClearOutput = document.createElement('button');
    btnClearOutput.className = 'cb-btn';
    btnClearOutput.textContent = '✕ Clear';
    btnClearOutput.addEventListener('click', () => {
      outputArea.textContent = '(Results will appear here)';
      outputSection.style.display = 'none';
      toast('Output cleared');
    });
    
    outputControls.appendChild(btnSendToChat);
    outputControls.appendChild(btnCopyOutput);
    outputControls.appendChild(btnClearOutput);
    outputSection.appendChild(outputControls);
    
    insightsContent.appendChild(outputSection);

    debugLog('Smart Workspace rendered successfully');

  } catch (e) {
    debugLog('renderSmartWorkspace error', e);
    if (insightsContent) {
      insightsContent.innerHTML = `<div style="padding:12px;color:rgba(255,100,100,0.9);">Failed to load workspace: ${e.message || 'Unknown error'}</div>`;
    }
  }
}

// Helper function to show output section
function showInsightsOutput(result) {
  const outputSection = document.getElementById('cb-insights-output-section');
  const outputArea = document.getElementById('cb-insights-output');
  if (outputSection && outputArea) {
    outputArea.textContent = result;
    outputSection.style.display = 'block'; // Show after process completes
  }
}

// ============================================
// 4. ADD CSS FOR FOLLOW-UP QUESTIONS
// ============================================
// ADD to the style section in content_script.js (around line 780):

  .cb-followup-list { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
  .cb-followup-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: var(--cb-bg);
    border: 1px solid var(--cb-border);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .cb-followup-item:hover {
    border-color: var(--cb-accent-primary);
    transform: translateX(4px);
  }
  .cb-followup-icon { font-size: 16px; }
  .cb-followup-text { flex: 1; font-size: 12px; color: var(--cb-white); }
  .cb-followup-btn {
    padding: 4px 10px;
    background: var(--cb-accent-primary);
    border: none;
    border-radius: 6px;
    color: white;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    opacity: 0.8;
    transition: opacity 0.2s;
  }
  .cb-followup-btn:hover { opacity: 1; }

// ============================================
// DONE - All UX improvements complete!
// ============================================
