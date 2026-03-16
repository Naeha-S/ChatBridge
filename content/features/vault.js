(function () {
  'use strict';

  function createFeature(deps) {
    const {
      debugLog,
      toast,
      scanChat,
      extractImagesFromMessages,
      extractAllMediaFromPage,
      saveImagesToVault,
      clearImageVault,
      getImageVault,
      addLoadingToButton,
      removeLoadingFromButton
    } = deps;

    async function renderImageVaultWidget(container) {
      try {
        const vaultSection = document.createElement('div');
        vaultSection.style.cssText = 'margin:16px 12px;';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px;background:rgba(16,24,43,0.4);border:1px solid color-mix(in srgb, var(--cb-accent-primary) 25%, transparent);border-radius:8px 8px 0 0;cursor:pointer;';
        header.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:16px;">🖼️</span>
            <span style="font-weight:600;font-size:13px;color:#fff;">Image Vault</span>
            <span id="cb-image-count" style="font-size:11px;color:rgba(255,255,255,0.5);background:color-mix(in srgb, var(--cb-accent-primary) 20%, transparent);padding:2px 6px;border-radius:10px;">0</span>
          </div>
          <span id="cb-vault-toggle" style="font-size:18px;transition:transform 0.2s;">▼</span>
        `;

        const content = document.createElement('div');
        content.id = 'cb-vault-content';
        content.style.cssText = 'display:none;padding:12px;background:rgba(16,24,43,0.4);border:1px solid color-mix(in srgb, var(--cb-accent-primary) 25%, transparent);border-top:none;border-radius:0 0 8px 8px;';

        const thumbGrid = document.createElement('div');
        thumbGrid.id = 'cb-vault-grid';
        thumbGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;margin-bottom:12px;';

        const controls = document.createElement('div');
        controls.style.cssText = 'display:flex;gap:8px;';
        controls.innerHTML = `
          <button id="cb-vault-scan" class="cb-btn cb-btn-primary" style="flex:1;font-size:11px;padding:8px;">🔍 Scan Media</button>
          <button id="cb-vault-clear" class="cb-btn" style="font-size:11px;padding:8px;">🗑️ Clear</button>
        `;

        content.appendChild(thumbGrid);
        content.appendChild(controls);
        vaultSection.appendChild(header);
        vaultSection.appendChild(content);
        container.appendChild(vaultSection);

        let isExpanded = false;
        header.addEventListener('click', () => {
          isExpanded = !isExpanded;
          content.style.display = isExpanded ? 'block' : 'none';
          document.getElementById('cb-vault-toggle').style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
        });

        document.getElementById('cb-vault-scan').addEventListener('click', async () => {
          const btn = document.getElementById('cb-vault-scan');
          addLoadingToButton(btn, 'Scanning...');
          try {
            console.log('[ChatBridge] Image Vault: Starting scan...');
            const msgs = await scanChat();
            const userMsgs = msgs ? msgs.filter((m) => m.role === 'user').length : 0;
            const agentMsgs = msgs ? msgs.filter((m) => m.role === 'assistant').length : 0;
            console.log('[ChatBridge] Image Vault: Found', userMsgs, 'user messages,', agentMsgs, 'agent replies');

            let images = [];
            if (msgs && msgs.length > 0) {
              images = await extractImagesFromMessages(msgs);
              console.log('[ChatBridge] Image Vault: Message extraction found', images.length, 'images');
            }

            let files = [];
            let artifacts = [];
            if (images.length === 0) {
              console.log('[ChatBridge] Trying platform-specific extraction...');
              const media = await extractAllMediaFromPage();
              images = media.images || [];
              files = media.files || [];
              artifacts = media.artifacts || [];
              console.log('[ChatBridge] Platform extraction found:', images.length, 'images,', files.length, 'files,', artifacts.length, 'artifacts');
            }

            if (images.length > 0) {
              await saveImagesToVault(images);
              await refreshImageVault();
            }

            document.getElementById('cb-image-count').textContent = String(images.length);

            let resultMsg = `${userMsgs} user, ${agentMsgs} agent`;
            if (images.length > 0 || files.length > 0 || artifacts.length > 0) {
              resultMsg += `: ${images.length} images`;
              if (files.length > 0) resultMsg += `, ${files.length} files`;
              if (artifacts.length > 0) resultMsg += `, ${artifacts.length} artifacts`;
              resultMsg = 'Saved ' + resultMsg;
            } else {
              resultMsg = 'Scanned ' + resultMsg + '. No media found.';
            }

            toast(resultMsg);
            console.log('[ChatBridge] Image Vault scan complete');
          } catch (e) {
            console.error('[ChatBridge] Image Vault scan error:', e);
            toast('Image scan failed - check console for details');
          } finally {
            removeLoadingFromButton(btn, '🔍 Scan Media');
          }
        });

        document.getElementById('cb-vault-clear').addEventListener('click', async () => {
          if (confirm('Clear all stored images?')) {
            await clearImageVault();
            await refreshImageVault();
            toast('Image vault cleared');
          }
        });

        await refreshImageVault();
      } catch (e) {
        debugLog('renderImageVaultWidget error:', e);
      }
    }

    async function refreshImageVault() {
      try {
        const images = await getImageVault();
        const grid = document.getElementById('cb-vault-grid');
        const countEl = document.getElementById('cb-image-count');
        if (!grid) return;

        countEl.textContent = images.length.toString();
        grid.innerHTML = '';

        if (images.length === 0) {
          grid.innerHTML = `
            <div class="cb-empty-state" style="grid-column:1/-1;">
              <div class="cb-empty-state-icon">🖼️</div>
              <div class="cb-empty-state-title">No Images Yet</div>
              <div class="cb-empty-state-text">Images from your conversations will appear here. Click "Scan Images" to extract images from the current chat.</div>
            </div>
          `;
          return;
        }

        const userImages = images.filter((img) => img.role === 'user');
        const assistantImages = images.filter((img) => img.role === 'assistant');

        const renderGroup = (imgs, label, icon) => {
          if (imgs.length === 0) return;

          const groupLabel = document.createElement('div');
          groupLabel.style.cssText = 'grid-column:1/-1;font-size:11px;font-weight:600;color:rgba(255,255,255,0.6);margin-top:8px;display:flex;align-items:center;gap:6px;';
          groupLabel.innerHTML = `<span>${icon}</span><span>${label} (${imgs.length})</span>`;
          grid.appendChild(groupLabel);

          imgs.slice(0, 6).forEach((img) => {
            const thumb = document.createElement('div');
            thumb.style.cssText = 'position:relative;aspect-ratio:1;border-radius:6px;overflow:hidden;border:1px solid color-mix(in srgb, var(--cb-accent-primary) 20%, transparent);cursor:pointer;background:rgba(0,0,0,0.3);';

            const imgEl = document.createElement('img');
            imgEl.src = img.src;
            imgEl.style.cssText = 'width:100%;height:100%;object-fit:cover;';
            imgEl.loading = 'lazy';
            imgEl.onerror = () => {
              thumb.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:24px;">🖼️</div>';
            };

            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:none;align-items:center;justify-content:center;gap:8px;';
            overlay.innerHTML = `
              <button class="cb-img-copy" title="Copy" style="background:rgba(255,255,255,0.2);border:none;border-radius:4px;padding:4px 6px;cursor:pointer;font-size:14px;">📋</button>
              <button class="cb-img-expand" title="Expand" style="background:rgba(255,255,255,0.2);border:none;border-radius:4px;padding:4px 6px;cursor:pointer;font-size:14px;">🔍</button>
            `;

            thumb.appendChild(imgEl);
            thumb.appendChild(overlay);
            thumb.addEventListener('mouseenter', () => { overlay.style.display = 'flex'; });
            thumb.addEventListener('mouseleave', () => { overlay.style.display = 'none'; });

            overlay.querySelector('.cb-img-copy').addEventListener('click', async (e) => {
              e.stopPropagation();
              try {
                await navigator.clipboard.writeText(img.src);
                toast('Image URL copied');
              } catch (_) {
                toast('Copy failed');
              }
            });

            overlay.querySelector('.cb-img-expand').addEventListener('click', (e) => {
              e.stopPropagation();
              showImageModal(img);
            });

            grid.appendChild(thumb);
          });

          if (imgs.length > 6) {
            const viewAll = document.createElement('button');
            viewAll.className = 'cb-btn';
            viewAll.style.cssText = 'grid-column:1/-1;margin-top:8px;font-size:11px;';
            viewAll.textContent = `View all ${imgs.length} images`;
            viewAll.addEventListener('click', () => showAllImagesModal(imgs, label));
            grid.appendChild(viewAll);
          }
        };

        renderGroup(userImages, 'User Uploads', '👤');
        renderGroup(assistantImages, 'AI Generated', '🤖');
      } catch (e) {
        debugLog('refreshImageVault error:', e);
      }
    }

    function showImageModal(imgData) {
      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;z-index:999999;';

      const img = document.createElement('img');
      img.src = imgData.src;
      img.style.cssText = 'max-width:90%;max-height:90%;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,0.5);';

      const closeBtn = document.createElement('button');
      closeBtn.textContent = '×';
      closeBtn.style.cssText = 'position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.2);border:none;color:#fff;font-size:32px;width:50px;height:50px;border-radius:25px;cursor:pointer;';
      closeBtn.addEventListener('click', () => modal.remove());

      modal.appendChild(img);
      modal.appendChild(closeBtn);
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
      document.body.appendChild(modal);
    }

    function showAllImagesModal(images, title) {
      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:999999;padding:40px;';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;width:100%;max-width:1200px;margin-bottom:20px;';
      header.innerHTML = `<h2 style="color:#fff;font-size:24px;">${title} (${images.length})</h2>`;

      const closeBtn = document.createElement('button');
      closeBtn.textContent = '×';
      closeBtn.style.cssText = 'background:rgba(255,255,255,0.2);border:none;color:#fff;font-size:32px;width:50px;height:50px;border-radius:25px;cursor:pointer;';
      closeBtn.addEventListener('click', () => modal.remove());
      header.appendChild(closeBtn);

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;width:100%;max-width:1200px;overflow-y:auto;max-height:80vh;padding:20px;background:rgba(255,255,255,0.05);border-radius:12px;';

      images.forEach((imgData) => {
        const card = document.createElement('div');
        card.style.cssText = 'background:rgba(255,255,255,0.05);border-radius:8px;overflow:hidden;cursor:pointer;transition:transform 0.2s;';
        card.innerHTML = `
          <img src="${imgData.src}" style="width:100%;height:200px;object-fit:cover;" loading="lazy">
          <div style="padding:12px;">
            <div style="font-size:12px;color:rgba(255,255,255,0.7);">${imgData.role || 'unknown'} • ${new Date(imgData.timestamp).toLocaleString()}</div>
          </div>
        `;
        card.addEventListener('click', () => showImageModal(imgData));
        card.addEventListener('mouseenter', () => { card.style.transform = 'scale(1.02)'; });
        card.addEventListener('mouseleave', () => { card.style.transform = 'scale(1)'; });
        grid.appendChild(card);
      });

      modal.appendChild(header);
      modal.appendChild(grid);
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
      document.body.appendChild(modal);
    }

    return { renderImageVaultWidget, refreshImageVault };
  }

  window.ChatBridgeContentVault = { createFeature };
})();
