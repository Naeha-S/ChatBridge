document.getElementById('open-options').addEventListener('click', () => {
  window.open(chrome.runtime.getURL('options.html'));
});

document.getElementById('open-store').addEventListener('click', () => {
  // open a basic viewer: open a new tab to show saved chats (we'll use chrome extension page)
  window.open(chrome.runtime.getURL('options.html') + "#viewer");
});
