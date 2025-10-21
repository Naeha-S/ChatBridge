
document.getElementById('open-options').addEventListener('click', () => {
  window.open(chrome.runtime.getURL('options.html'));
});

document.getElementById('open-store').addEventListener('click', () => {
  window.open(chrome.runtime.getURL('options.html') + "#viewer");
});

// Summarization tab logic
const summarizeTabBtn = document.getElementById('summarize-tab-btn');
const summarizeSection = document.getElementById('summarize-section');
const backBtn = document.getElementById('back-btn');
const summarizeBtn = document.getElementById('summarize-btn');
const summaryPreview = document.getElementById('summary-preview');
const restoreBtn = document.getElementById('restore-btn');

summarizeTabBtn.addEventListener('click', () => {
  summarizeSection.style.display = 'block';
  summarizeTabBtn.style.display = 'none';
  document.querySelector('h3').style.display = 'none';
  document.querySelector('p.small').style.display = 'none';
  document.getElementById('open-options').style.display = 'none';
  document.getElementById('open-store').style.display = 'none';
  summaryPreview.textContent = 'Preview will appear here...';
});

backBtn.addEventListener('click', () => {
  summarizeSection.style.display = 'none';
  summarizeTabBtn.style.display = 'block';
  document.querySelector('h3').style.display = '';
  document.querySelector('p.small').style.display = '';
  document.getElementById('open-options').style.display = '';
  document.getElementById('open-store').style.display = '';
});

summarizeBtn.addEventListener('click', () => {
  summaryPreview.textContent = 'Summarizing...';
  // Get latest chat from storage
  chrome.storage.local.get(['chatbridge:conversations'], data => {
    const arr = Array.isArray(data['chatbridge:conversations']) ? data['chatbridge:conversations'] : [];
    if (!arr.length) {
      summaryPreview.textContent = 'No conversation found.';
      return;
    }
    const sel = arr[0];
    const chatText = sel && sel.conversation ? sel.conversation.map(m => `${m.role}: ${m.text}`).join('\n') : '';
    const length = document.getElementById('summary-length').value;
    const type = document.getElementById('summary-type').value;
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
        summaryPreview.textContent = 'Summarize failed.';
        return;
      }
      summaryPreview.textContent = res.result;
    });
  });
});

restoreBtn.addEventListener('click', () => {
  const summary = summaryPreview.textContent;
  // Send message to content script to restore summary
  chrome.tabs.query({active: true, currentWindow: true}, tabs => {
    if (tabs && tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'restore_to_chat',
        payload: { summary }
      });
    }
  });
});
