// === Create Floating Avatar ===
const avatar = document.createElement('div');
avatar.id = 'cb-toggle';
avatar.innerText = '🤖';
document.body.appendChild(avatar);

const menu = document.createElement('div');
menu.id = 'cb-panel';
menu.innerHTML = `
  <button id="scanChat">📋 Scan Chat</button>
  <button id="restoreChat">🧠 Restore Chat</button>
`;
document.body.appendChild(menu);

avatar.addEventListener('click', () => {
  menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
});

// === Chat Scraping Logic ===
document.getElementById('scanChat').addEventListener('click', () => {
  let messages = [];

  if (window.location.hostname.includes("chat.openai.com")) {
    document.querySelectorAll('.markdown').forEach(msg => {
      messages.push(msg.innerText);
    });
  } else if (window.location.hostname.includes("claude.ai")) {
    document.querySelectorAll('.message-text').forEach(msg => {
      messages.push(msg.innerText);
    });
  }

  chrome.storage.local.set({ lastChat: messages }, () => {
    alert('Chat saved successfully ✅');
  });
});

// === Restore Logic ===
document.getElementById('restoreChat').addEventListener('click', () => {
  chrome.storage.local.get('lastChat', data => {
    const chat = data.lastChat?.join('\n---\n') || "No chat found.";
    const input = document.querySelector('textarea');
    if (input) {
      input.value = `Here's my previous chat:\n${chat}\nContinue from here.`;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      alert('No input box found on this site!');
    }
  });
});
