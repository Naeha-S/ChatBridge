// popup.js - ChatBridge Popup Actions

document.getElementById('open-options').addEventListener('click', () => {
  window.open(chrome.runtime.getURL('options.html'));
});

document.getElementById('open-store').addEventListener('click', () => {
  window.open(chrome.runtime.getURL('options.html') + "#viewer");
});
