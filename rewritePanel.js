(function () {
    if (window.ChatBridgeRewritePanel) return;

    function createRewritePanel({ onRewrite, onInsert }) {
        const panel = document.createElement('div');
        panel.className = 'cb-rewrite-panel';
        // Inline styles for simplicity
        const css = `
      .cb-rewrite-panel { padding: 16px; font-family: 'Inter', sans-serif; color: #e6edf3; }
      .cb-rewrite-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .cb-rewrite-select { background: #0d1117; color: #c9d1d9; border: 1px solid #30363d; padding: 4px 8px; border-radius: 6px; }
      .cb-rewrite-input { width: 100%; height: 120px; background: #0d1117; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 8px; resize: vertical; margin-bottom: 12px; font-family: inherit; }
      .cb-rewrite-input:focus { border-color: #58a6ff; outline: none; }
      .cb-rewrite-actions { display: flex; justify-content: flex-end; }
      .cb-rewrite-result { padding: 12px; background: #161b22; border: 1px solid #30363d; border-radius: 6px; margin-top: 8px; font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
      .cb-rewrite-footer { display: flex; gap: 8px; margin-top: 8px; justify-content: flex-end; }
      .cb-rewrite-label { font-size: 12px; color: #8b949e; font-weight: 600; margin-bottom: 4px; }
    `;
        const style = document.createElement('style');
        style.textContent = css;
        panel.appendChild(style);

        const container = document.createElement('div');
        container.innerHTML = `
      <div class="cb-rewrite-header">
        <span style="font-weight:600;">Rewrite / Summarize</span>
        <select id="cb-rewrite-style" class="cb-rewrite-select">
          <option value="normal">Standard</option>
          <option value="project_summary" selected>Project Summary</option>
          <option value="professional">Professional</option>
          <option value="academic">Academic</option>
          <option value="concise">Concise</option>
          <option value="casual">Casual</option>
          <option value="creative">Creative</option>
        </select>
      </div>
      <textarea id="cb-rewrite-input" class="cb-rewrite-input" placeholder="Enter text or recent chat will be used..."></textarea>
      
      <div class="cb-rewrite-actions">
        <button id="cb-do-rewrite" class="cb-btn cb-btn-primary" style="background:#238636; border:none; color:white; padding:6px 16px; border-radius:6px; cursor:pointer; font-weight:600;">Regenerate</button>
      </div>

      <div id="cb-rewrite-loading" style="display:none; text-align:center; margin-top:16px; color:#8b949e; font-size:13px;">
        <span class="cb-spinner">⏳</span> Processing...
      </div>

      <div id="cb-rewrite-output-container" style="display:none; margin-top: 16px; border-top:1px solid #30363d; padding-top:16px;">
        <div class="cb-rewrite-label">Generated Output:</div>
        <div id="cb-rewrite-result" class="cb-rewrite-result"></div>
        <div class="cb-rewrite-footer">
           <button id="cb-rewrite-copy" class="cb-btn" style="background:#21262d; border:1px solid #30363d; color:#c9d1d9; padding:4px 12px; border-radius:6px; cursor:pointer;">Copy</button>
           <button id="cb-rewrite-insert" class="cb-btn" style="background:#1f6feb; border:none; color:white; padding:4px 12px; border-radius:6px; cursor:pointer;">Insert</button>
        </div>
      </div>
    `;
        panel.appendChild(container);

        const btnRewrite = container.querySelector('#cb-do-rewrite');
        const input = container.querySelector('#cb-rewrite-input');
        const styleSelect = container.querySelector('#cb-rewrite-style');
        const outputContainer = container.querySelector('#cb-rewrite-output-container');
        const resultDiv = container.querySelector('#cb-rewrite-result');
        const loading = container.querySelector('#cb-rewrite-loading');
        const btnCopy = container.querySelector('#cb-rewrite-copy');
        const btnInsert = container.querySelector('#cb-rewrite-insert');

        // Auto-fill input
        setTimeout(() => {
            if (!input.value) {
                const selection = window.getSelection().toString();
                if (selection && selection.length > 5) {
                    input.value = selection;
                } else {
                    try {
                        // Try last scanned result
                        const lastScan = window.ChatBridge && window.ChatBridge.getLastScan && window.ChatBridge.getLastScan();
                        if (lastScan && lastScan.text) {
                            input.value = lastScan.text;
                        } else if (lastScan && lastScan.messages && lastScan.messages.length) {
                            input.value = lastScan.messages.map(m => m.role + ': ' + m.text).join('\n\n');
                        }
                    } catch (e) { }
                }
            }
        }, 500);

        btnRewrite.onclick = async () => {
            const text = input.value.trim();
            if (!text) return;

            const style = styleSelect.value;
            loading.style.display = 'block';
            outputContainer.style.display = 'none';
            btnRewrite.disabled = true;

            try {
                const res = await onRewrite(text, style);
                if (res) {
                    resultDiv.textContent = res;
                    outputContainer.style.display = 'block';
                } else {
                    resultDiv.textContent = 'Error: No response from rewrite service.';
                    outputContainer.style.display = 'block';
                }
            } catch (e) {
                resultDiv.textContent = 'Error: ' + e.message;
                outputContainer.style.display = 'block';
            } finally {
                loading.style.display = 'none';
                btnRewrite.disabled = false;
            }
        };

        btnCopy.onclick = () => {
            navigator.clipboard.writeText(resultDiv.textContent);
            const original = btnCopy.textContent;
            btnCopy.textContent = 'Copied!';
            setTimeout(() => btnCopy.textContent = original, 1500);
        };

        btnInsert.onclick = () => {
            if (onInsert) {
                onInsert(resultDiv.textContent);
                const original = btnInsert.textContent;
                btnInsert.textContent = 'Inserted!';
                setTimeout(() => btnInsert.textContent = original, 1500);
            }
        };

        return panel;
    }

    window.ChatBridgeRewritePanel = createRewritePanel;
})();
