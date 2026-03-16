(function () {
  'use strict';

  function createFeature(deps) {
    const {
      host,
      panel,
      avatar,
      btnClose,
      shadow,
      closeAllViews,
      refreshHistory,
      updatePanelDynamicLayout
    } = deps;

    const toggleSidebar = () => {
      const isHidden = host.style.display === 'none';
      if (isHidden) {
        try { closeAllViews(); } catch (_) { }
        try { refreshHistory(); } catch (_) { }
        host.style.display = 'block';
        panel.style.opacity = '0';
        panel.style.transform = 'translateY(10px)';
        try { panel.scrollTop = 0; } catch (_) { }
        try { updatePanelDynamicLayout(); } catch (_) { }

        requestAnimationFrame(() => {
          panel.style.transition = 'opacity 0.3s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
          panel.style.opacity = '1';
          panel.style.transform = 'translateY(0)';
        });

        avatar.style.display = 'none';
      } else {
        panel.style.opacity = '0';
        panel.style.transform = 'translateY(10px) scale(0.98)';
        setTimeout(() => {
          host.style.display = 'none';
          avatar.style.display = 'flex';
        }, 200);
      }
    };

    const handleAvatarToggleClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (avatar._wasDragged) return;
      toggleSidebar();
    };

    avatar.onclick = null;
    avatar.addEventListener('click', handleAvatarToggleClick);

    if (typeof btnClose !== 'undefined') {
      btnClose.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleSidebar();
      });
    }

    avatar.toggle = toggleSidebar;

    document.addEventListener('keydown', (e) => {
      if (!host || host.style.display === 'none') return;
      const target = e.target;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (isInput && target !== host) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const key = e.key.toLowerCase();
      if (key === 's') {
        const btnScan = shadow.querySelector('#btnScan');
        if (btnScan) {
          e.preventDefault();
          btnScan.click();
          btnScan.style.transform = 'scale(0.95)';
          setTimeout(() => { btnScan.style.transform = ''; }, 150);
        }
      } else if (key === 'r') {
        const btnInsert = shadow.querySelector('#btnInsert') || shadow.querySelector('[id^="btnInsert"]');
        if (btnInsert) {
          e.preventDefault();
          btnInsert.click();
        }
      } else if (key === 'c') {
        const btnCopy = shadow.querySelector('#btnCopy');
        if (btnCopy) {
          e.preventDefault();
          btnCopy.click();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        toggleSidebar();
      }
    });

    return { toggleSidebar };
  }

  window.ChatBridgeContentSidebar = { createFeature };
})();
