background.js: 10[ChatBridge] Could not load modules: TypeError: Failed to execute 'importScripts' on 'WorkerGlobalScope': Module scripts don't support importScripts().
    at background.js: 7: 3
  (anonymous) @background.js: 10Understand this warning
background.js: 107 ChatBridge installed / updated
background.js: 116[ChatBridge] Failed to initialize MCP: ReferenceError: window is not defined
    at background.js: 111: 5
  (anonymous) @background.js: 116Understand this error
options.js: 200[ERROR] Connection failed: 410
options.js: 200[ERROR] Invalid Gemini API key// options.js - Enhanced with HuggingFace API key support and connection testing

function loadSaved() {
  chrome.storage.local.get(['chatbridge_conversations_v1'], res => {
    const arr = res['chatbridge_conversations_v1'] || [];
    const viewer = document.getElementById('viewer');
    if (!arr.length) viewer.innerText = "No saved sessions.";
    else {
      const s = arr.map(a => {
        const dt = new Date(a.ts).toLocaleString();
        const count = (a.conversation && a.conversation.length) || 0;
        return `${a.platform} (${a.host}) — ${count} msgs — ${dt}\n${a.conversation.slice(0, 5).map(m => m.role + ': ' + m.text.replace(/\n/g, ' ')).join('\n')}\n---`;
      }).join('\n\n');
      viewer.innerText = s;
    }
  });
}

// Clear conversations
document.getElementById('btn-clear').addEventListener('click', () => {
  if (!confirm("Clear all saved sessions?")) return;
  chrome.storage.local.set({ 'chatbridge_conversations_v1': [] }, () => {
    loadSaved();
    showToast('All sessions cleared', 'success');
  });
});

// Adapter debug
document.getElementById('btn-refresh-adapter').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs || !tabs[0]) return;
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => {
        try {
          const a = (window.pickAdapter && window.pickAdapter()) || null;
          return { ok: true, adapter: a ? { id: a.id || a.label, label: a.label, detected: true } : null };
        } catch (e) {
          return { ok: false, err: e && e.message };
        }
      }
    }, (res) => {
      const pre = document.getElementById('adapterInfo');
      if (!res || !res[0]) {
        pre.innerText = "No result (ensure you opened options from a page that has the content script loaded).";
        return;
      }
      pre.innerText = JSON.stringify(res[0].result, null, 2);
    });
  });
});

loadSaved();

// ============================================
// API KEY MANAGEMENT
// ============================================

const hfApiKeyInput = document.getElementById('hfApiKey');
const geminiApiKeyInput = document.getElementById('geminiApiKey');
const btnSaveHF = document.getElementById('btn-save-hf');
const btnTestHF = document.getElementById('btn-test-hf');
const btnSaveGemini = document.getElementById('btn-save-gemini');
const btnTestGemini = document.getElementById('btn-test-gemini');
const hfStatus = document.getElementById('hfStatus');
const geminiStatus = document.getElementById('geminiStatus');

// Load saved API keys
chrome.storage.local.get(['chatbridge_hf_key', 'chatbridge_gemini_key'], res => {
  hfApiKeyInput.value = res.chatbridge_hf_key || '';
  geminiApiKeyInput.value = res.chatbridge_gemini_key || '';
});

// Save HuggingFace API Key
btnSaveHF.addEventListener('click', () => {
  const v = (hfApiKeyInput.value || '').trim();
  if (!v) {
    if (!confirm('Remove stored HuggingFace API key?')) return;
    chrome.storage.local.remove(['chatbridge_hf_key'], () => {
      hfApiKeyInput.value = '';
      showToast('HuggingFace key removed', 'success');
      updateStatus(hfStatus, '', '');
    });
    return;
  }
  chrome.storage.local.set({ chatbridge_hf_key: v }, () => {
    showToast('HuggingFace API key saved', 'success');
  });
});

// Save Gemini API Key
btnSaveGemini.addEventListener('click', () => {
  const v = (geminiApiKeyInput.value || '').trim();
  if (!v) {
    if (!confirm('Remove stored Gemini API key?')) return;
    chrome.storage.local.remove(['chatbridge_gemini_key'], () => {
      geminiApiKeyInput.value = '';
      showToast('Gemini key removed', 'success');
      updateStatus(geminiStatus, '', '');
    });
    return;
  }
  chrome.storage.local.set({ chatbridge_gemini_key: v }, () => {
    showToast('Gemini API key saved', 'success');
  });
});

// Test HuggingFace API connection
btnTestHF.addEventListener('click', () => {
  const key = (hfApiKeyInput.value || '').trim();
  if (!key) {
    showToast('Please enter a HuggingFace API key', 'error');
    return;
  }

  updateStatus(hfStatus, 'Testing connection...', 'pending');
  btnTestHF.disabled = true;
  btnTestHF.textContent = '⏳ Testing...';

  chrome.runtime.sendMessage(
    { type: 'test_huggingface_api', apiKey: key },
    (response) => {
      btnTestHF.disabled = false;
      btnTestHF.textContent = '🧪 Test';

      if (chrome.runtime.lastError || !response) {
        updateStatus(hfStatus, '✗ Extension error', 'error');
        showToast('Failed to connect to background script', 'error');
        return;
      }

      if (response.ok) {
        updateStatus(hfStatus, '✓ Connection successful!', 'success');
        showToast('HuggingFace API connected successfully', 'success');
      } else if (response.status === 401) {
        updateStatus(hfStatus, '✗ Invalid API key', 'error');
        showToast('Invalid HuggingFace API key', 'error');
      } else if (response.status === 503) {
        updateStatus(hfStatus, '⚠ Model loading (retry in 30s)', 'pending');
        showToast('Model is loading, please retry in 30 seconds', 'warning');
      } else {
        updateStatus(hfStatus, `✗ Error: ${response.status}`, 'error');
        showToast(`Connection failed: ${response.status}`, 'error');
      }
    }
  );
});

// Test Gemini API connection
btnTestGemini.addEventListener('click', () => {
  const key = (geminiApiKeyInput.value || '').trim();
  if (!key) {
    showToast('Please enter a Gemini API key', 'error');
    return;
  }

  updateStatus(geminiStatus, 'Testing connection...', 'pending');
  btnTestGemini.disabled = true;
  btnTestGemini.textContent = '⏳ Testing...';

  chrome.runtime.sendMessage(
    { type: 'test_gemini_api', apiKey: key },
    (response) => {
      btnTestGemini.disabled = false;
      btnTestGemini.textContent = '🧪 Test';

      if (chrome.runtime.lastError || !response) {
        updateStatus(geminiStatus, '✗ Extension error', 'error');
        showToast('Failed to connect to background script', 'error');
        return;
      }

      if (response.ok) {
        updateStatus(geminiStatus, '✓ Connection successful!', 'success');
        showToast('Gemini API connected successfully', 'success');
      } else if (response.status === 400 || response.status === 404) {
        updateStatus(geminiStatus, '✗ Invalid API key', 'error');
        showToast('Invalid Gemini API key', 'error');
      } else {
        updateStatus(geminiStatus, `✗ Error: ${response.status}`, 'error');
        showToast(`Connection failed: ${response.status}`, 'error');
      }
    }
  );
});

// Helper: Update status badge
function updateStatus(element, text, type) {
  if (!text) {
    element.innerHTML = '';
    return;
  }
  element.innerHTML = `<div class="status-badge ${type}">${text}</div>`;
}

// Helper: Show toast notification
function showToast(message, type = 'success') {
  // Use browser's built-in notification for now
  // You can enhance this with a custom toast UI later
  console.log(`[${type.toUpperCase()}] ${message}`);
  if (type === 'success') {
    alert(`✓ ${message}`);
  } else if (type === 'error') {
    alert(`✗ ${message}`);
  } else {
    alert(`ℹ ${message}`);
  }
}

// ============================================
// THEME MANAGEMENT
// ============================================

const themeDark = document.getElementById('theme-dark');
const themeLight = document.getElementById('theme-light');
const themeDarkOption = document.getElementById('theme-dark-option');
const themeLightOption = document.getElementById('theme-light-option');
const btnSaveTheme = document.getElementById('btn-save-theme');

// Load and apply theme preference
chrome.storage.local.get(['cb_theme'], res => {
  const t = res.cb_theme || 'light';
  if (t === 'light') {
    themeLight.checked = true;
    themeLightOption.classList.add('selected');
  } else {
    themeDark.checked = true;
    themeDarkOption.classList.add('selected');
  }
});

// Update selected state on radio change
themeDark.addEventListener('change', () => {
  themeDarkOption.classList.add('selected');
  themeLightOption.classList.remove('selected');
});

themeLight.addEventListener('change', () => {
  themeLightOption.classList.add('selected');
  themeDarkOption.classList.remove('selected');
});

// Save theme
btnSaveTheme.addEventListener('click', () => {
  const val = themeLight.checked ? 'light' : 'dark';
  chrome.storage.local.set({ cb_theme: val }, () => {
    showToast(`Theme set to ${val === 'light' ? 'Light Mode' : 'Dark Neon'}`, 'success');
  });
});

// ============================================
// LUXURY MODE
// ============================================

const luxuryToggle = document.getElementById('luxury-mode-toggle');
const btnSaveLuxury = document.getElementById('btn-save-luxury');

// Load saved value
try {
  const saved = localStorage.getItem('chatbridge:luxury_mode');
  luxuryToggle.checked = saved === 'true';
} catch (e) { }

btnSaveLuxury.addEventListener('click', () => {
  try {
    localStorage.setItem('chatbridge:luxury_mode', String(luxuryToggle.checked));
    showToast(`Luxury Mode ${luxuryToggle.checked ? 'enabled' : 'disabled'}`, 'success');
  } catch (e) {
    showToast('Failed to save luxury mode setting', 'error');
  }
});
