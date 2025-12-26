// options.js - ChatBridge Settings Page

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

// Helper: Show toast notification (proper UI, no alert)
function showToast(message, type = 'success') {
  // Remove existing toast
  const existing = document.getElementById('cb-toast');
  if (existing) existing.remove();

  // Create toast
  const toast = document.createElement('div');
  toast.id = 'cb-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    padding: 16px 24px;
    border-radius: 12px;
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: white;
    z-index: 10000;
    animation: slideIn 0.3s ease;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    display: flex;
    align-items: center;
    gap: 10px;
  `;

  // Set color based on type
  if (type === 'success') {
    toast.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    toast.innerHTML = `<span>✓</span> ${message}`;
  } else if (type === 'error') {
    toast.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
    toast.innerHTML = `<span>✗</span> ${message}`;
  } else {
    toast.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
    toast.innerHTML = `<span>ℹ</span> ${message}`;
  }

  document.body.appendChild(toast);

  // Add animation keyframes if not exists
  if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100px); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================
// THEME MANAGEMENT - 4 Premium Themes
// ============================================

const themeNames = {
  dark: '🌙 Neon Dark',
  light: '☀️ Luxury Light',
  ocean: '🌊 Ocean Blue',
  sunset: '🌅 Sunset'
};

const btnSaveTheme = document.getElementById('btn-save-theme');
const themeRadios = document.querySelectorAll('input[name="cb-theme"]');

// Load and apply saved theme
chrome.storage.local.get(['cb_theme'], res => {
  const savedTheme = res.cb_theme || 'light';
  const radio = document.querySelector(`input[name="cb-theme"][value="${savedTheme}"]`);
  if (radio) radio.checked = true;
});

// Save theme
btnSaveTheme.addEventListener('click', () => {
  const selected = document.querySelector('input[name="cb-theme"]:checked');
  const val = selected ? selected.value : 'light';

  chrome.storage.local.set({ cb_theme: val }, () => {
    showToast(`Theme changed to ${themeNames[val]}`, 'success');

    // Broadcast theme change to all tabs
    chrome.tabs.query({}, tabs => {
      tabs.forEach(tab => {
        try {
          chrome.tabs.sendMessage(tab.id, { type: 'theme_changed', theme: val });
        } catch (e) { }
      });
    });
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
