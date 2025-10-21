// Sidebar logic for ChatBridge Sync Tone
(function(){
  async function getConversationsAsync() {
    return new Promise(resolve => {
      try {
        if (typeof window.getConversations === 'function') return window.getConversations(list => resolve(Array.isArray(list) ? list : []));
        const raw = localStorage.getItem('chatbridge:conversations'); if (!raw) return resolve([]); try { const arr = JSON.parse(raw||'[]'); resolve(arr); } catch(e){ resolve([]); }
      } catch(e){ resolve([]); }
    });
  }

  function populateModelOptions(sel) {
    const models = ['ChatGPT','Claude','Gemini','OpenAI','Llama','Other'];
    sel.innerHTML = '';
    models.forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; sel.appendChild(o); });
  }

  async function refreshChats() {
    const arr = await getConversationsAsync();
    const sel = document.getElementById('sb-chat-select'); sel.innerHTML = '';
    if (!arr || !arr.length) { const o = document.createElement('option'); o.value=''; o.textContent='No saved chats'; sel.appendChild(o); return; }
    arr.forEach(s => {
      const o = document.createElement('option'); o.value = String(s.ts); o.textContent = `${s.platform||'chat'} • ${(s.conversation||[]).length} msgs • ${new Date(s.ts).toLocaleString()}`; sel.appendChild(o);
    });
  }

  function renderPreviewFor(ts) {
    const arr = JSON.parse(localStorage.getItem('chatbridge:conversations') || '[]');
    const sel = arr.find(a => String(a.ts) === String(ts));
    const p = document.getElementById('sb-preview');
    if (!sel || !sel.conversation || !sel.conversation.length) { p.textContent = 'No conversation selected.'; return; }
    p.textContent = sel.conversation.map(m => (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.text).join('\n\n');
  }

  async function doSyncTone() {
    const sel = document.getElementById('sb-chat-select'); const src = document.getElementById('sb-src').value; const tgt = document.getElementById('sb-tgt').value;
    const status = document.getElementById('sb-status'); const preview = document.getElementById('sb-preview');
    try {
      status.textContent = 'Status: processing...';
      const arr = await getConversationsAsync();
      const conv = arr.find(a => String(a.ts) === String(sel.value));
      if (!conv) { status.textContent = 'Status: no conversation selected'; return; }
      const inputText = conv.conversation.map(m => `${m.role}: ${m.text}`).join('\n\n');
      // call background message via content script wrapper
      const res = await new Promise(r => { try { chrome.runtime.sendMessage({ type:'call_gemini', payload: { action:'syncTone', text: inputText, sourceModel: src, targetModel: tgt } }, resp => r(resp||{})); } catch(e){ r({ok:false,error:String(e)}); } });
      if (res && res.ok) {
        preview.textContent = res.result || (res && res.resultText) || 'No result';
        status.textContent = 'Status: done';
      } else {
        status.textContent = 'Status: failed: ' + (res && res.error ? res.error : 'unknown');
      }
    } catch (e) { status.textContent = 'Status: error'; }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    populateModelOptions(document.getElementById('sb-src'));
    populateModelOptions(document.getElementById('sb-tgt'));
    await refreshChats();
    document.getElementById('sb-refresh').addEventListener('click', refreshChats);
    document.getElementById('sb-chat-select').addEventListener('change', (e) => { renderPreviewFor(e.target.value); });
    document.getElementById('sb-back').addEventListener('click', () => { window.close(); });
    document.getElementById('sb-sync').addEventListener('click', doSyncTone);
    // initial preview
    const sel = document.getElementById('sb-chat-select'); if (sel && sel.value) renderPreviewFor(sel.value);
  });
})();
