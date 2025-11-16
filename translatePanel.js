// translatePanel.js
// Minimal, self-contained Translate UI for ChatBridge
(function() {
  if (window.ChatBridgeTranslatePanel) return;

  function createTranslatePanel({
    onTranslate,
    supportedLanguages = {},
    defaultLang = 'en',
    defaultMode = 'all',
    defaultShorten = false
  } = {}) {
    // Panel container
    const panel = document.createElement('div');
    panel.className = 'cb-translate-panel';
    panel.innerHTML = `
      <div class="cb-translate-header">Translate</div>
      <div class="cb-translate-row">
        <label for="cb-translate-lang">Output language:</label>
        <select id="cb-translate-lang"></select>
        <button id="cb-translate-gear" title="Options" class="cb-gear-btn">⚙️</button>
      </div>
      <div id="cb-translate-options" class="cb-translate-options" style="display:none;">
        <div class="cb-translate-options-group">
          <label class="cb-options-label">Selective translation:</label>
          <div class="cb-radio-group">
            <label><input type="radio" name="cb-translate-mode" value="all" checked> All messages</label>
            <label><input type="radio" name="cb-translate-mode" value="user"> Only user</label>
            <label><input type="radio" name="cb-translate-mode" value="ai"> Only AI</label>
            <label><input type="radio" name="cb-translate-mode" value="last"> Last message</label>
          </div>
        </div>
        <div class="cb-translate-options-group">
          <label for="cb-translate-shorten" class="cb-toggle-label">
            Shorten output:
            <input type="checkbox" id="cb-translate-shorten" class="cb-toggle">
          </label>
        </div>
      </div>
      <div class="cb-translate-row">
        <button id="cb-translate-btn" class="cb-btn cb-btn-primary">Translate</button>
        <span id="cb-translate-loading" style="display:none;">⏳ Translating...</span>
      </div>
      <div id="cb-translate-result" class="cb-translate-result" style="display:none;"></div>
    `;

    // Populate language dropdown
    const langSel = panel.querySelector('#cb-translate-lang');
    Object.entries(supportedLanguages).forEach(([code, name]) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = name;
      if (code === defaultLang) opt.selected = true;
      langSel.appendChild(opt);
    });

    // Gear icon toggles options
    const gearBtn = panel.querySelector('#cb-translate-gear');
    const optionsDiv = panel.querySelector('#cb-translate-options');
    gearBtn.onclick = () => {
      optionsDiv.style.display = optionsDiv.style.display === 'none' ? 'block' : 'none';
    };

    // Translate button handler
    const translateBtn = panel.querySelector('#cb-translate-btn');
    const loading = panel.querySelector('#cb-translate-loading');
    const resultDiv = panel.querySelector('#cb-translate-result');
    translateBtn.onclick = async () => {
      // Gather options
      const targetLanguage = langSel.value;
      const mode = panel.querySelector('input[name="cb-translate-mode"]:checked').value;
      const shorten = panel.querySelector('#cb-translate-shorten').checked;
      
      // UI feedback
      translateBtn.disabled = true;
      translateBtn.textContent = 'Translating...';
      loading.style.display = 'inline';
      resultDiv.style.display = 'none';
      resultDiv.textContent = '';
      
      try {
        const res = await onTranslate({ targetLanguage, mode, shorten });
        
        // Format output based on result type
        let displayText = '';
        if (res && res.translated) {
          if (Array.isArray(res.translated)) {
            // Format conversation with role labels
            displayText = res.translated.map(m => {
              const roleLabel = m.role === 'user' ? '👤 User' : '🤖 AI';
              return `${roleLabel}:\n${m.text}`;
            }).join('\n\n---\n\n');
          } else {
            displayText = res.translated;
          }
        } else {
          displayText = 'No translation result.';
        }
        
        resultDiv.style.display = 'block';
        resultDiv.textContent = displayText;
        
      } catch (e) {
        resultDiv.style.display = 'block';
        resultDiv.textContent = '❌ Translation failed: ' + (e && e.message ? e.message : String(e));
        console.error('[TranslatePanel] Error:', e);
      } finally {
        translateBtn.disabled = false;
        translateBtn.textContent = 'Translate';
        loading.style.display = 'none';
      }
    };

    // Set defaults
    panel.querySelector(`input[name="cb-translate-mode"][value="${defaultMode}"]`).checked = true;
    panel.querySelector('#cb-translate-shorten').checked = !!defaultShorten;

    return panel;
  }

  // Minimal CSS (inject once)
  if (!document.getElementById('cb-translate-style')) {
    const style = document.createElement('style');
    style.id = 'cb-translate-style';
    style.textContent = `
      .cb-translate-panel { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); padding: 20px; max-width: 380px; }
      .cb-translate-header { font-size: 1.25em; font-weight: 600; margin-bottom: 16px; color: #1a1a1a; }
      .cb-translate-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
      .cb-translate-row label { font-size: 0.95em; font-weight: 500; color: #333; }
      .cb-translate-row select { flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.95em; }
      .cb-gear-btn { background: none; border: none; font-size: 1.3em; cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: background 0.2s; }
      .cb-gear-btn:hover { background: #f3f4f6; }
      .cb-translate-options { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; margin-bottom: 14px; }
      .cb-translate-options-group { margin-bottom: 12px; }
      .cb-translate-options-group:last-child { margin-bottom: 0; }
      .cb-options-label { display: block; font-size: 0.9em; font-weight: 600; color: #374151; margin-bottom: 8px; }
      .cb-radio-group { display: flex; flex-direction: column; gap: 6px; }
      .cb-radio-group label { font-size: 0.9em; font-weight: 400; color: #4b5563; display: flex; align-items: center; gap: 6px; cursor: pointer; }
      .cb-radio-group input[type="radio"] { margin: 0; cursor: pointer; }
      .cb-toggle-label { display: flex; align-items: center; justify-content: space-between; font-size: 0.9em; font-weight: 600; color: #374151; }
      .cb-toggle { width: 40px; height: 22px; cursor: pointer; }
      .cb-btn { padding: 10px 20px; border-radius: 6px; border: none; background: #3b82f6; color: #fff; font-weight: 500; font-size: 0.95em; cursor: pointer; transition: background 0.2s; }
      .cb-btn:hover:not(:disabled) { background: #2563eb; }
      .cb-btn:disabled { background: #9ca3af; cursor: not-allowed; opacity: 0.6; }
      .cb-translate-result { margin-top: 14px; font-size: 0.95em; white-space: pre-wrap; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; min-height: 40px; max-height: 400px; overflow-y: auto; line-height: 1.6; color: #1f2937; }
    `;
    document.head.appendChild(style);
  }

  window.ChatBridgeTranslatePanel = createTranslatePanel;
})();
