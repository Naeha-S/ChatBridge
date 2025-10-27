// options.js
function loadSaved() {
  chrome.storage.local.get(['chatbridge_conversations_v1'], res => {
    const arr = res['chatbridge_conversations_v1'] || [];
    const viewer = document.getElementById('viewer');
    if (!arr.length) viewer.innerText = "No saved sessions.";
    else {
      const s = arr.map(a => {
        const dt = new Date(a.ts).toLocaleString();
        const count = (a.conversation && a.conversation.length) || 0;
        return `${a.platform} (${a.host}) — ${count} msgs — ${dt}\n${a.conversation.slice(0,5).map(m=> m.role+': '+m.text.replace(/\n/g,' ')).join('\n')}\n---`;
      }).join('\n\n');
      viewer.innerText = s;
    }
  });
}

document.getElementById('btn-clear').addEventListener('click', () => {
  if (!confirm("Clear all saved sessions?")) return;
  chrome.storage.local.set({ 'chatbridge_conversations_v1': [] }, () => {
    loadSaved();
    alert('Cleared.');
  });
});

document.getElementById('btn-refresh-adapter').addEventListener('click', () => {
  // ask active tab to evaluate pickAdapter() by injecting a small script
  chrome.tabs.query({ active:true, currentWindow:true }, tabs => {
    if (!tabs || !tabs[0]) return;
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => {
        try {
          const a = (window.pickAdapter && window.pickAdapter()) || null;
          return { ok:true, adapter: a ? { id: a.id||a.label, label: a.label, detected: true } : null };
        } catch(e) {
          return { ok:false, err: e && e.message };
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

loadSaved();// API key storage
const apiKeyInput = document.getElementById('apiKey');
const btnSaveKey = document.getElementById('btn-save-key');
const themeDark = document.getElementById('theme-dark');
const themeLight = document.getElementById('theme-light');
const btnSaveTheme = document.getElementById('btn-save-theme');

chrome.storage.local.get(['chatbridge_api_key'], res => {
  apiKeyInput.value = res.chatbridge_api_key || '';
});

btnSaveKey.addEventListener('click', () => {
  const v = (apiKeyInput.value || '').trim();
  if (!v) {
    if (!confirm('Remove stored API key?')) return;
    chrome.storage.local.remove(['chatbridge_api_key'], () => { apiKeyInput.value = ''; alert('Removed.'); });
    return;
  }
  chrome.storage.local.set({ chatbridge_api_key: v }, () => { alert('Saved API key.'); });
});

// Load and apply theme preference to Options page
chrome.storage.local.get(['cb_theme'], res => {
  const t = res.cb_theme || 'dark';
  if (t === 'light') {
    themeLight.checked = true;
    document.body.classList.add('cb-theme-light');
  } else {
    themeDark.checked = true;
    document.body.classList.remove('cb-theme-light');
  }
});

btnSaveTheme.addEventListener('click', () => {
  const val = themeLight.checked ? 'light' : 'dark';
  chrome.storage.local.set({ cb_theme: val }, () => {
    if (val === 'light') document.body.classList.add('cb-theme-light'); else document.body.classList.remove('cb-theme-light');
    alert('Theme saved.');
  });
});
