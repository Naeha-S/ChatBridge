// Rewrite Tab Redesign - New UI Structure
// This file contains the new rewrite tab logic for ChatBridge
// Structure: Style selector → Multi-select chat → Filter gear → Rewrite entire chat to document → Output area

// Global variables for message selection
let _selectedMessages = new Set();
let _allMessages = [];
let _rewFilter = 'all'; // all, user, ai

// Load and render chat messages in the multi-select list
async function loadChatMessages() {
  try {
    const msgs = await scanChat();
    if (!msgs || msgs.length === 0) {
      const list = document.getElementById('cb-rew-chat-list');
      if (list) list.innerHTML = '<div style="padding:12px;text-align:center;color:var(--cb-subtext);font-size:12px;">No messages found</div>';
      return;
    }
    
    // Filter messages based on current filter
    _allMessages = msgs.filter(m => {
      if (_rewFilter === 'user') return m.role === 'user';
      if (_rewFilter === 'ai') return m.role === 'assistant';
      return true;
    });
    
    renderChatList();
  } catch (e) {
    debugLog('loadChatMessages error', e);
  }
}

// Render the chat list with checkboxes
function renderChatList() {
  const list = document.getElementById('cb-rew-chat-list');
  if (!list) return;
  
  list.innerHTML = '';
  
  if (_allMessages.length === 0) {
    list.innerHTML = '<div style="padding:12px;text-align:center;color:var(--cb-subtext);font-size:12px;">No messages match filter</div>';
    return;
  }
  
  _allMessages.forEach((msg, idx) => {
    const item = document.createElement('div');
    item.style.cssText = 'display:flex;gap:10px;padding:8px;background:rgba(0,180,255,0.05);border:1px solid rgba(0,180,255,0.15);border-radius:6px;margin-bottom:6px;cursor:pointer;transition:all 0.2s;';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.style.cssText = 'cursor:pointer;';
    checkbox.checked = _selectedMessages.has(idx);
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      if (checkbox.checked) {
        _selectedMessages.add(idx);
      } else {
        _selectedMessages.delete(idx);
      }
    });
    
    const content = document.createElement('div');
    content.style.cssText = 'flex:1;';
    
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
    const roleIcon = msg.role === 'user' ? '👤' : '🤖';
    const roleColor = msg.role === 'user' ? '#4ade80' : '#60a5fa';
    header.innerHTML = `<span>${roleIcon}</span><span style="font-size:11px;color:${roleColor};font-weight:500;">${msg.role === 'user' ? 'User' : 'AI'}</span><span style="font-size:10px;color:var(--cb-subtext);margin-left:auto;">Message ${idx + 1}</span>`;
    
    const preview = document.createElement('div');
    preview.style.cssText = 'font-size:12px;color:var(--cb-white);opacity:0.85;line-height:1.3;';
    const previewText = msg.text.slice(0, 80) + (msg.text.length > 80 ? '…' : '');
    preview.textContent = previewText;
    
    content.appendChild(header);
    content.appendChild(preview);
    
    item.appendChild(checkbox);
    item.appendChild(content);
    
    item.addEventListener('click', () => {
      checkbox.checked = !checkbox.checked;
      if (checkbox.checked) {
        _selectedMessages.add(idx);
      } else {
        _selectedMessages.delete(idx);
      }
    });
    
    item.addEventListener('mouseenter', () => {
      item.style.background = 'rgba(0,180,255,0.1)';
      item.style.borderColor = 'rgba(0,180,255,0.3)';
    });
    item.addEventListener('mouseleave', () => {
      item.style.background = 'rgba(0,180,255,0.05)';
      item.style.borderColor = 'rgba(0,180,255,0.15)';
    });
    
    list.appendChild(item);
  });
  
  // Add select all/none buttons
  const selectActions = document.createElement('div');
  selectActions.style.cssText = 'display:flex;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(0,180,255,0.15);';
  const btnSelectAll = document.createElement('button');
  btnSelectAll.textContent = 'Select All';
  btnSelectAll.style.cssText = 'flex:1;padding:6px;background:rgba(0,180,255,0.1);border:1px solid rgba(0,180,255,0.3);border-radius:4px;color:var(--cb-white);font-size:11px;cursor:pointer;';
  btnSelectAll.addEventListener('click', () => {
    _selectedMessages.clear();
    _allMessages.forEach((_, idx) => _selectedMessages.add(idx));
    renderChatList();
  });
  const btnSelectNone = document.createElement('button');
  btnSelectNone.textContent = 'Clear All';
  btnSelectNone.style.cssText = 'flex:1;padding:6px;background:rgba(0,180,255,0.1);border:1px solid rgba(0,180,255,0.3);border-radius:4px;color:var(--cb-white);font-size:11px;cursor:pointer;';
  btnSelectNone.addEventListener('click', () => {
    _selectedMessages.clear();
    renderChatList();
  });
  selectActions.appendChild(btnSelectAll);
  selectActions.appendChild(btnSelectNone);
  list.appendChild(selectActions);
}

// Rewrite entire chat to document
async function rewriteEntireChatToDocument() {
  try {
    const btnRewriteDoc = document.querySelector('#cb-rew-view .cb-btn-primary');
    if (!btnRewriteDoc) return;
    
    // Get selected messages or all if none selected
    let messagesToRewrite;
    if (_selectedMessages.size === 0) {
      messagesToRewrite = _allMessages;
    } else {
      messagesToRewrite = _allMessages.filter((_, idx) => _selectedMessages.has(idx));
    }
    
    if (messagesToRewrite.length === 0) {
      toast('No messages to rewrite');
      return;
    }
    
    btnRewriteDoc.disabled = true;
    addLoadingToButton(btnRewriteDoc, 'Rewriting');
    
    const rewProg = document.querySelector('#cb-rew-view .cb-progress');
    if (rewProg) {
      rewProg.style.display = 'inline';
      updateProgress(rewProg, 'rewrite', { phase: 'preparing' });
    }
    
    // Get style settings
    const rewStyleSelect = document.getElementById('cb-rew-style');
    const styleHintInput = document.getElementById('cb-rew-style-hint');
    const style = (rewStyleSelect && rewStyleSelect.value) || 'normal';
    const styleHint = (styleHintInput && styleHintInput.value) ? styleHintInput.value : '';
    
    // Combine messages into document
    const chatText = messagesToRewrite.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n\n');
    
    // Rewrite
    const result = await rewriteText(style, chatText, {
      styleHint,
      chunkSize: 14000,
      maxParallel: 3,
      length: 'medium',
      onProgress: (ev) => rewProg && updateProgress(rewProg, 'rewrite', ev)
    });
    
    // Show output
    const rewOutputSection = document.querySelector('#cb-rew-view > div[style*="display:none"]');
    const rewResult = document.getElementById('cb-rew-result');
    
    if (rewResult && result) {
      rewResult.textContent = result;
      if (rewOutputSection) {
        rewOutputSection.style.display = 'block';
        // Scroll to output
        setTimeout(() => rewOutputSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
      }
      toast('Rewrite completed');
    } else {
      toast('Rewrite failed');
    }
    
    if (rewProg) rewProg.style.display = 'none';
  } catch (err) {
    toast('Rewrite failed: ' + (err && err.message ? err.message : err));
    debugLog('rewriteEntireChatToDocument error', err);
  } finally {
    const btnRewriteDoc = document.querySelector('#cb-rew-view .cb-btn-primary');
    if (btnRewriteDoc) removeLoadingFromButton(btnRewriteDoc, '📄 Rewrite Entire Chat to Document');
  }
}

// Export for use in content_script.js
if (typeof window !== 'undefined') {
  window._cbRewriteTab = {
    loadChatMessages,
    renderChatList,
    rewriteEntireChatToDocument
  };
}
