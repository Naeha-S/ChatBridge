/**
 * FINAL INTEGRATION - All Remaining UX Improvements + Luxury Mode
 * 
 * This file contains all code changes needed to complete ChatBridge v0.2.0
 * Apply these changes to content_script.js in the order listed below.
 */

// ============================================================================
// SECTION 1: LUXURY MODE INITIALIZATION
// ============================================================================
// Add this in the main init function, AFTER injectUI() call (around line 6700)

/*
  // Initialize Luxury Mode
  if (typeof LuxuryMode !== 'undefined') {
    window.luxuryModeInstance = new LuxuryMode(shadow);
    window.luxuryModeInstance.apply(); // Apply saved preference
    console.log('[ChatBridge] Luxury Mode initialized');
  } else {
    console.warn('[ChatBridge] LuxuryMode class not found - luxury mode disabled');
  }
*/


// ============================================================================
// SECTION 2: SETTINGS PANEL - ADD LUXURY MODE TOGGLE
// ============================================================================
// Find the renderSettings() function (around line 1100) and add this toggle
// AFTER the theme toggle section:

/*
  // Luxury Mode Toggle
  const luxuryToggle = document.createElement('div');
  luxuryToggle.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 0;
    border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.1));
  `;

  const luxuryLabel = document.createElement('div');
  luxuryLabel.innerHTML = `
    <div style="font-weight: 600; font-size: 14px; margin-bottom: 5px; color: var(--text-primary, #1a1a1a);">
      ✨ Luxury Mode
    </div>
    <div style="font-size: 12px; color: var(--text-secondary, #666); line-height: 1.4;">
      Vision Pro aesthetic with frosted glass, particles & animations
    </div>
  `;

  const luxurySwitch = document.createElement('input');
  luxurySwitch.type = 'checkbox';
  luxurySwitch.id = 'cb-luxury-toggle';
  luxurySwitch.checked = window.luxuryModeInstance?.isEnabled || false;
  luxurySwitch.style.cssText = `
    width: 44px;
    height: 24px;
    cursor: pointer;
    appearance: none;
    background: #ddd;
    border-radius: 12px;
    position: relative;
    transition: background 0.3s;
  `;

  // Switch styling
  const switchStyle = document.createElement('style');
  switchStyle.textContent = `
    #cb-luxury-toggle:checked {
      background: linear-gradient(135deg, #7FDBFF, #007AFF) !important;
    }
    #cb-luxury-toggle::before {
      content: '';
      position: absolute;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: white;
      top: 2px;
      left: 2px;
      transition: left 0.3s;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    #cb-luxury-toggle:checked::before {
      left: 22px;
    }
  `;
  shadow.appendChild(switchStyle);

  luxurySwitch.addEventListener('change', (e) => {
    if (window.luxuryModeInstance) {
      const enabled = window.luxuryModeInstance.toggle();
      console.log(`[Luxury Mode] ${enabled ? 'Enabled ✨' : 'Disabled'}`);
      
      // Show confirmation toast
      const toast = document.createElement('div');
      toast.textContent = enabled ? '✨ Luxury Mode Enabled' : 'Luxury Mode Disabled';
      toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: ${enabled ? 'linear-gradient(135deg, #7FDBFF, #007AFF)' : '#333'};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: cb-toast-slide-up 0.3s ease;
      `;
      
      shadow.appendChild(toast);
      setTimeout(() => {
        toast.style.animation = 'cb-toast-fade-out 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, 2000);
    } else {
      console.error('[Luxury Mode] Instance not found');
      e.target.checked = false;
    }
  });

  luxuryToggle.appendChild(luxuryLabel);
  luxuryToggle.appendChild(luxurySwitch);
  settingsContent.appendChild(luxuryToggle); // Add to settings container
*/


// ============================================================================
// SECTION 3: COPY BUTTON CLIPBOARD POPUP
// ============================================================================
// Find the Copy button handler (around line 4146) and REPLACE with:

/*
  btnClipboard.addEventListener('click', async () => {
    if (!window.ChatBridge._lastScan || !window.ChatBridge._lastScan.normalized) {
      alert('⚠️ No conversation scanned yet. Click "Scan Chat" first!');
      return;
    }

    const formatted = formatMessages(window.ChatBridge._lastScan.normalized);
    
    try {
      await navigator.clipboard.writeText(formatted);
      
      // Show clipboard popup instead of alert
      showClipboardPopup(formatted, btnClipboard);
      
    } catch (err) {
      console.error('[Copy] Failed:', err);
      alert('Failed to copy. Please try again.');
    }
  });

  // Clipboard popup function
  function showClipboardPopup(text, anchorElement) {
    // Remove existing popup if any
    const existing = shadow.querySelector('.cb-clipboard-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.className = 'cb-clipboard-popup';
    popup.style.cssText = `
      position: absolute;
      background: white;
      border: 1px solid #ddd;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      z-index: 10001;
      max-width: 320px;
      animation: cb-popup-appear 0.3s ease;
    `;

    popup.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
        <span style="font-size: 20px;">📋</span>
        <strong style="font-size: 14px; color: #1a1a1a;">Copied to Clipboard!</strong>
      </div>
      <div style="font-size: 12px; color: #666; margin-bottom: 12px;">
        ${text.split('\n').length} lines • ${Math.round(text.length / 1024)}KB
      </div>
      <div style="background: #f5f5f5; border-radius: 8px; padding: 10px; max-height: 120px; overflow-y: auto; font-family: monospace; font-size: 11px; line-height: 1.5; color: #333; white-space: pre-wrap; word-wrap: break-word;">
        ${text.substring(0, 300)}${text.length > 300 ? '...' : ''}
      </div>
      <button class="cb-popup-close" style="
        margin-top: 12px;
        width: 100%;
        padding: 8px;
        background: #007AFF;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      ">Got it</button>
    `;

    // Position near the Copy button
    const rect = anchorElement.getBoundingClientRect();
    popup.style.top = `${rect.bottom + 8}px`;
    popup.style.left = `${rect.left}px`;

    shadow.appendChild(popup);

    // Auto-hide after 5 seconds
    const autoHide = setTimeout(() => popup.remove(), 5000);

    // Close button
    popup.querySelector('.cb-popup-close').addEventListener('click', () => {
      clearTimeout(autoHide);
      popup.style.animation = 'cb-popup-disappear 0.3s ease';
      setTimeout(() => popup.remove(), 300);
    });

    // Click outside to close
    const closeOnOutside = (e) => {
      if (!popup.contains(e.target) && e.target !== anchorElement) {
        clearTimeout(autoHide);
        popup.remove();
        document.removeEventListener('click', closeOnOutside);
      }
    };
    setTimeout(() => document.addEventListener('click', closeOnOutside), 100);
  }
*/


// ============================================================================
// SECTION 4: REORGANIZED INSIGHTS LAYOUT
// ============================================================================
// Find renderSmartWorkspace() function (around line 1400) and REPLACE with:

/*
  function renderSmartWorkspace() {
    const workspace = document.createElement('div');
    workspace.className = 'cb-internal-view';
    workspace.style.cssText = `
      background: var(--bg-secondary, #f9f9f9);
      border-radius: 12px;
      padding: 20px;
      margin-top: 16px;
    `;

    // Title
    const title = document.createElement('h3');
    title.className = 'cb-view-title';
    title.textContent = '🧠 Smart Workspace';
    title.style.cssText = `
      margin: 0 0 16px 0;
      font-size: 16px;
      font-weight: 700;
      color: var(--text-primary, #1a1a1a);
    `;
    workspace.appendChild(title);

    // SECTION 1: Action Buttons (Top Priority)
    const actionsSection = document.createElement('div');
    actionsSection.style.marginBottom = '20px';

    const actionsTitle = document.createElement('div');
    actionsTitle.textContent = '⚡ Quick Actions';
    actionsTitle.style.cssText = `
      font-weight: 600;
      font-size: 13px;
      color: var(--text-secondary, #666);
      margin-bottom: 10px;
    `;
    actionsSection.appendChild(actionsTitle);

    const actionButtons = document.createElement('div');
    actionButtons.style.cssText = `
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    `;

    const actions = [
      { icon: '📝', label: 'Summarize', action: 'summarize' },
      { icon: '✨', label: 'Rewrite', action: 'rewrite' },
      { icon: '🌐', label: 'Translate', action: 'translate' },
      { icon: '🎯', label: 'Extract Tasks', action: 'tasks' }
    ];

    actions.forEach(({ icon, label, action }) => {
      const btn = document.createElement('button');
      btn.className = 'cb-btn';
      btn.innerHTML = `${icon} ${label}`;
      btn.style.cssText = `
        padding: 10px;
        font-size: 13px;
        border-radius: 8px;
        border: 1px solid #ddd;
        background: white;
        cursor: pointer;
        transition: all 0.2s;
        font-weight: 500;
      `;
      btn.addEventListener('click', () => handleSmartAction(action));
      actionButtons.appendChild(btn);
    });

    actionsSection.appendChild(actionButtons);
    workspace.appendChild(actionsSection);

    // SECTION 2: AI Insights (Hidden until generated)
    const insightsSection = document.createElement('div');
    insightsSection.id = 'cb-insights-section';
    insightsSection.style.display = 'none'; // Hidden by default
    workspace.appendChild(insightsSection);

    // SECTION 3: Output Area (Hidden until generated)
    const outputSection = document.createElement('div');
    outputSection.id = 'cb-output-section';
    outputSection.style.display = 'none';
    workspace.appendChild(outputSection);

    return workspace;
  }

  // Helper function to show insights
  function showInsightsOutput(insights) {
    const insightsSection = shadow.querySelector('#cb-insights-section');
    if (!insightsSection) return;

    insightsSection.innerHTML = ''; // Clear previous
    insightsSection.style.display = 'block';

    const insightsTitle = document.createElement('div');
    insightsTitle.textContent = '💡 AI Insights';
    insightsTitle.style.cssText = `
      font-weight: 600;
      font-size: 13px;
      color: var(--text-secondary, #666);
      margin-bottom: 12px;
    `;
    insightsSection.appendChild(insightsTitle);

    // Render insights from AISummaryEngine
    const insightsContainer = document.createElement('div');
    insightsContainer.innerHTML = insights; // HTML from generateInsights()
    insightsSection.appendChild(insightsContainer);
  }
*/


// ============================================================================
// SECTION 5: DISABLE SMART CONTEXT AUTO-INIT (Performance Fix)
// ============================================================================
// Find around line 6773 and COMMENT OUT:

/*
  // DISABLED FOR PERFORMANCE - Smart Context slows restore
  // Users can manually enable from settings if needed
  
  // setTimeout(() => {
  //   if (window.smartContextInstance) {
  //     window.smartContextInstance.init();
  //     console.log('[ChatBridge] Smart Context Injection initialized');
  //   }
  // }, 2000);
*/


// ============================================================================
// SECTION 6: FOLLOW-UP QUESTIONS CSS
// ============================================================================
// Add to the main CSS block (around line 780, inside injectUI styles):

/*
  .cb-followup-item {
    background: var(--bg-secondary, #f9f9f9);
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 12px;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
  }

  .cb-followup-item:hover {
    background: white;
    border-color: #007AFF;
    box-shadow: 0 2px 8px rgba(0, 122, 255, 0.15);
    transform: translateX(4px);
  }

  .cb-followup-text {
    flex: 1;
    font-size: 13px;
    color: var(--text-primary, #1a1a1a);
    line-height: 1.5;
  }

  .cb-followup-btn {
    background: linear-gradient(135deg, #007AFF, #0051D5);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .cb-followup-btn:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 8px rgba(0, 122, 255, 0.3);
  }

  .cb-followup-btn:active {
    transform: scale(0.98);
  }

  @keyframes cb-toast-slide-up {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  @keyframes cb-toast-fade-out {
    to {
      opacity: 0;
      transform: translateX(-50%) translateY(-10px);
    }
  }

  @keyframes cb-popup-appear {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes cb-popup-disappear {
    to {
      opacity: 0;
      transform: translateY(-10px);
    }
  }
*/


// ============================================================================
// SECTION 7: APPLY LUXURY MODE ON SHOW
// ============================================================================
// Find showPanel() or wherever panel.style.display = 'block' happens
// Add this right after:

/*
  // Apply Luxury Mode if enabled
  if (window.luxuryModeInstance?.isEnabled) {
    requestAnimationFrame(() => {
      window.luxuryModeInstance.apply();
    });
  }
*/


// ============================================================================
// INTEGRATION CHECKLIST
// ============================================================================
/*
  APPLY IN THIS ORDER:

  1. ✅ manifest.json already updated (luxuryMode.js added)
  2. ⏳ Section 1 - Luxury Mode initialization (after injectUI)
  3. ⏳ Section 2 - Settings panel luxury toggle
  4. ⏳ Section 3 - Copy button clipboard popup
  5. ⏳ Section 4 - Reorganized renderSmartWorkspace()
  6. ⏳ Section 5 - Disable Smart Context auto-init
  7. ⏳ Section 6 - Follow-up questions CSS
  8. ⏳ Section 7 - Apply luxury on panel show

  AFTER APPLYING ALL:
  - Reload extension in Chrome
  - Test on any supported AI chat site
  - Verify all features work:
    ✓ Copy button shows popup (not just alert)
    ✓ Insights section hidden until scan completes
    ✓ Actions appear first in Smart Workspace
    ✓ Luxury Mode toggle in settings
    ✓ Luxury Mode applies frosted glass + particles
    ✓ Restore is instant (no Smart Context delay)
    ✓ Follow-up questions show with arrow icon
    ✓ Light theme is default
    ✓ Resize handle works and persists

  ALL UX IMPROVEMENTS COMPLETE! 🎉
*/

// ============================================================================
// DEBUG HELPERS
// ============================================================================
/*
  // Test luxury mode from console:
  window.luxuryModeInstance.toggle()
  
  // Check if luxury mode loaded:
  console.log(window.LuxuryMode)
  console.log(window.luxuryModeInstance)
  
  // Force re-apply luxury styles:
  window.luxuryModeInstance.apply()
  
  // Check last scan insights:
  console.log(window.ChatBridge._lastScan.insights)
  
  // Test clipboard popup:
  // (Click Copy button after a scan)
*/
