/**
 * Translation Module Integration Example
 * How to integrate ChatBridgeTranslator with the existing ChatBridge UI
 */

// Example 1: Add Translation Button to Sidebar UI
// Add this to content_script.js where UI buttons are created

function addTranslationUI() {
  const translationContainer = document.createElement('div');
  translationContainer.className = 'cb-translation-section';
  translationContainer.innerHTML = `
    <h3>Translate Conversation</h3>
    
    <div class="cb-form-group">
      <label for="cb-target-lang">Target Language:</label>
      <select id="cb-target-lang">
        <option value="es">Spanish</option>
        <option value="fr">French</option>
        <option value="de">German</option>
        <option value="ja">Japanese</option>
        <option value="zh">Chinese</option>
        <option value="ar">Arabic</option>
        <option value="ru">Russian</option>
        <option value="pt">Portuguese</option>
        <option value="it">Italian</option>
        <option value="ko">Korean</option>
        <option value="hi">Hindi</option>
      </select>
    </div>
    
    <div class="cb-form-group">
      <label for="cb-translation-mode">Mode:</label>
      <select id="cb-translation-mode">
        <option value="all">All Messages</option>
        <option value="user">User Messages Only</option>
        <option value="ai">AI Messages Only</option>
      </select>
    </div>
    
    <div class="cb-form-group">
      <label>
        <input type="checkbox" id="cb-shorten-before-translate">
        Summarize before translating (for long conversations)
      </label>
    </div>
    
    <button id="cb-translate-btn" class="cb-btn cb-btn-primary">
      Translate
    </button>
    
    <div id="cb-translation-result" style="display:none;">
      <h4>Translation Result</h4>
      <div id="cb-translation-domain" class="cb-meta"></div>
      <div id="cb-translation-output" class="cb-output"></div>
      <button id="cb-copy-translation" class="cb-btn">Copy Translation</button>
      <button id="cb-insert-translation" class="cb-btn">Insert to Chat</button>
    </div>
  `;
  
  // Add event listener for translate button
  const translateBtn = translationContainer.querySelector('#cb-translate-btn');
  translateBtn.addEventListener('click', handleTranslate);
  
  return translationContainer;
}

// Example 2: Handle Translation Request
async function handleTranslate() {
  const targetLang = document.getElementById('cb-target-lang').value;
  const mode = document.getElementById('cb-translation-mode').value;
  const shorten = document.getElementById('cb-shorten-before-translate').checked;
  
  // Get current conversation from last scan
  const lastScan = window.ChatBridge.getLastScan();
  if (!lastScan || !lastScan.messages || lastScan.messages.length === 0) {
    showToast('No conversation to translate. Please scan chat first.', 'warning');
    return;
  }
  
  const conversation = lastScan.messages;
  
  // Show loading state
  const translateBtn = document.getElementById('cb-translate-btn');
  const originalText = translateBtn.textContent;
  translateBtn.disabled = true;
  translateBtn.textContent = 'Translating...';
  
  try {
    // Call translation module
    const result = await ChatBridgeTranslator.translateContent({
      targetLanguage: targetLang,
      mode: mode,
      shorten: shorten,
      content: conversation
    });
    
    // Display result
    displayTranslationResult(result);
    
    showToast('Translation complete!', 'success');
    
  } catch (error) {
    console.error('Translation failed:', error);
    showToast(`Translation failed: ${error.message}`, 'error');
  } finally {
    // Restore button state
    translateBtn.disabled = false;
    translateBtn.textContent = originalText;
  }
}

// Example 3: Display Translation Result
function displayTranslationResult(result) {
  const resultContainer = document.getElementById('cb-translation-result');
  const domainDisplay = document.getElementById('cb-translation-domain');
  const outputDisplay = document.getElementById('cb-translation-output');
  
  // Show result container
  resultContainer.style.display = 'block';
  
  // Display metadata
  const { domain, shortened, targetLanguage, mode } = result.meta;
  domainDisplay.innerHTML = `
    <span><strong>Domain:</strong> ${domain}</span> | 
    <span><strong>Language:</strong> ${targetLanguage}</span> | 
    <span><strong>Mode:</strong> ${mode}</span>
    ${shortened ? ' | <span class="cb-badge">Summarized</span>' : ''}
  `;
  
  // Display translated content
  if (Array.isArray(result.translated)) {
    // Conversation array
    outputDisplay.innerHTML = result.translated.map(msg => `
      <div class="cb-message cb-message-${msg.role}">
        <div class="cb-message-role">${msg.role === 'user' ? 'User' : 'Assistant'}</div>
        <div class="cb-message-text">${escapeHTML(msg.text)}</div>
      </div>
    `).join('');
  } else {
    // Plain string
    outputDisplay.innerHTML = `<div class="cb-text">${escapeHTML(result.translated)}</div>`;
  }
  
  // Add event listeners for action buttons
  document.getElementById('cb-copy-translation').onclick = () => copyTranslation(result.translated);
  document.getElementById('cb-insert-translation').onclick = () => insertTranslation(result.translated);
}

// Example 4: Copy Translation to Clipboard
function copyTranslation(translated) {
  let textToCopy;
  
  if (Array.isArray(translated)) {
    // Format conversation for clipboard
    textToCopy = translated.map(msg => 
      `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}`
    ).join('\n\n');
  } else {
    textToCopy = translated;
  }
  
  navigator.clipboard.writeText(textToCopy).then(() => {
    showToast('Translation copied to clipboard!', 'success');
  }).catch(err => {
    console.error('Failed to copy:', err);
    showToast('Failed to copy translation', 'error');
  });
}

// Example 5: Insert Translation to Chat Input
async function insertTranslation(translated) {
  let textToInsert;
  
  if (Array.isArray(translated)) {
    // For conversation arrays, insert formatted text
    textToInsert = translated.map(msg => msg.text).join('\n\n');
  } else {
    textToInsert = translated;
  }
  
  // Use existing restoreToChat function
  try {
    await window.ChatBridge.restoreToChat(textToInsert);
    showToast('Translation inserted to chat!', 'success');
  } catch (error) {
    console.error('Failed to insert translation:', error);
    showToast('Failed to insert translation', 'error');
  }
}

// Example 6: Translate Plain Text (not conversation)
async function translatePlainText(text, targetLang) {
  try {
    const result = await ChatBridgeTranslator.translateContent({
      targetLanguage: targetLang,
      mode: 'all',
      shorten: false,
      content: text  // Plain string
    });
    
    return result.translated;  // Returns translated string
    
  } catch (error) {
    console.error('Translation failed:', error);
    throw error;
  }
}

// Example 7: Quick Translate with Keyboard Shortcut
// Add to keyboard command handler in content_script.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'keyboard_command' && msg.command === 'quick-translate') {
    const selection = window.getSelection().toString();
    if (selection) {
      // Translate selected text to default language
      translatePlainText(selection, 'es').then(translated => {
        showToast(`Translation: ${translated}`, 'info', 5000);
      });
    } else {
      showToast('Select text to translate', 'warning');
    }
  }
});

// Example 8: Integrate with "Sync Tone" Feature
// Translate before syncing tone
async function syncToneAndTranslate(text, targetLang, tone) {
  // First translate
  const translationResult = await ChatBridgeTranslator.translateContent({
    targetLanguage: targetLang,
    mode: 'all',
    shorten: false,
    content: text
  });
  
  const translatedText = translationResult.translated;
  
  // Then sync tone on translated text
  const response = await chrome.runtime.sendMessage({
    type: 'call_gemini',
    payload: {
      action: 'syncTone',
      text: translatedText,
      tone: tone
    }
  });
  
  return response.result;  // Returns tone-matched translation
}

// Example 9: Batch Translate Multiple Texts
async function batchTranslate(texts, targetLang) {
  const results = [];
  
  for (const text of texts) {
    try {
      const result = await ChatBridgeTranslator.translateContent({
        targetLanguage: targetLang,
        mode: 'all',
        shorten: false,
        content: text
      });
      results.push({ success: true, translated: result.translated });
    } catch (error) {
      results.push({ success: false, error: error.message, original: text });
    }
  }
  
  return results;
}

// Example 10: Translation with Progress Feedback
async function translateWithProgress(conversation, targetLang, onProgress) {
  const total = Array.isArray(conversation) ? conversation.length : 1;
  let completed = 0;
  
  // Process in chunks to show progress
  const chunkSize = 5;
  const chunks = [];
  
  if (Array.isArray(conversation)) {
    for (let i = 0; i < conversation.length; i += chunkSize) {
      chunks.push(conversation.slice(i, i + chunkSize));
    }
  } else {
    chunks.push([{ role: 'user', text: conversation }]);
  }
  
  const translatedChunks = [];
  
  for (const chunk of chunks) {
    const result = await ChatBridgeTranslator.translateContent({
      targetLanguage: targetLang,
      mode: 'all',
      shorten: false,
      content: chunk
    });
    
    translatedChunks.push(result.translated);
    completed += chunk.length;
    
    if (onProgress) {
      onProgress({
        completed,
        total,
        percentage: Math.round((completed / total) * 100)
      });
    }
  }
  
  return translatedChunks.flat();
}

// Example 11: Add Translation to Context Menu
// Add to manifest.json permissions: "contextMenus"
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'translate-selection',
    title: 'Translate to %s',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'translate-selection') {
    const selectedText = info.selectionText;
    
    // Send to content script for translation
    chrome.tabs.sendMessage(tab.id, {
      type: 'translate_selection',
      text: selectedText
    });
  }
});

// Example 12: Store Translation History
async function saveTranslationToHistory(original, translated, meta) {
  const history = await chrome.storage.local.get(['translation_history']) || {};
  const historyArray = history.translation_history || [];
  
  historyArray.unshift({
    id: Date.now(),
    original: original,
    translated: translated,
    meta: meta,
    timestamp: new Date().toISOString()
  });
  
  // Keep last 50 translations
  const trimmed = historyArray.slice(0, 50);
  
  await chrome.storage.local.set({ translation_history: trimmed });
}

// Example 13: Helper - Escape HTML for Display
function escapeHTML(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Example 14: Helper - Show Toast Notification
function showToast(message, type = 'info', duration = 3000) {
  // Use existing ChatBridge toast system or create simple one
  const toast = document.createElement('div');
  toast.className = `cb-toast cb-toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('cb-toast-fade-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Example 15: Complete UI Integration in Sidebar
function initializeTranslationFeature() {
  // Add translation UI to sidebar
  const sidebar = document.querySelector('.cb-sidebar-content');
  if (sidebar) {
    const translationUI = addTranslationUI();
    sidebar.appendChild(translationUI);
  }
  
  // Log initialization
  console.log('[ChatBridge] Translation feature initialized');
  console.log('[ChatBridge] Supported languages:', 
    Object.keys(ChatBridgeTranslator.getSupportedLanguages()).length
  );
}

// Initialize when content script loads
if (window.ChatBridgeTranslator) {
  initializeTranslationFeature();
}

// Example: Mount the new Translate Panel UI
if (window.ChatBridgeTranslatePanel && window.ChatBridgeTranslator) {
  const supportedLanguages = window.ChatBridgeTranslator.getSupportedLanguages();
  const panel = window.ChatBridgeTranslatePanel({
    supportedLanguages,
    defaultLang: 'en',
    defaultMode: 'all',
    defaultShorten: false,
    onTranslate: async ({ targetLanguage, mode, shorten }) => {
      // Use last scanned conversation or fallback
      const lastScan = window.ChatBridge && window.ChatBridge.getLastScan ? window.ChatBridge.getLastScan() : null;
      const content = lastScan && lastScan.messages && lastScan.messages.length ? lastScan.messages : 'Hello, world!';
      return await window.ChatBridgeTranslator.translateContent({
        targetLanguage,
        mode,
        shorten,
        content
      });
    }
  });
  // Mount in sidebar or popup
  const mountPoint = document.querySelector('.cb-sidebar-content') || document.body;
  mountPoint.appendChild(panel);
}
