document.getElementById('summarize-btn').addEventListener('click', async () => {
  const length = document.getElementById('summary-length').value;
  const type = document.getElementById('summary-type').value;
  document.getElementById('summary-preview').textContent = 'Summarizing...';
  chrome.storage.local.get(['cb_summarize_text'], data => {
    const chatText = data.cb_summarize_text || '';
    if (!chatText) {
      document.getElementById('summary-preview').textContent = 'No conversation found.';
      return;
    }
    chrome.runtime.sendMessage({
      type: 'call_gemini',
      payload: {
        action: 'summarize',
        text: chatText,
        length,
        summaryType: type
      }
    }, res => {
      if (!res || !res.ok) {
        document.getElementById('summary-preview').textContent = 'Summarize failed.';
        return;
      }
      document.getElementById('summary-preview').textContent = res.result;
    });
  });
});

document.getElementById('restore-btn').addEventListener('click', () => {
  const summary = document.getElementById('summary-preview').textContent;
  chrome.runtime.sendMessage({
    type: 'restore_summary',
    payload: { summary }
  });
});

// Apply saved theme class to the summarize tab body
try {
  chrome.storage.local.get(['cb_theme'], r => {
    try {
      const t = r && r.cb_theme;
      if (t && t !== 'dark') document.body.classList.add('cb-theme-' + t);
    } catch (e) { }
  });
} catch (e) { }
