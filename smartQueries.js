// smartQueries.js - Advanced Smart Queries with Query History, Advanced Filters, & Improved UX
// Self-contained styling and logic to ensure perfect rendering

(function () {
  'use strict';

  // ==========================================
  // ROBUST CSS INJECTION
  // ==========================================
  const UI_STYLES = `
/* ============================================
   SMART QUERIES - LUXURY MINIMALIST DESIGN
   Refined Glassmorphism + Soft Gradients
   ============================================ */

.sq-wrapper {
  --sq-bg: #0A0F1C;
  --sq-bg2: #0f1629;
  --sq-bg3: #141d30;
  --sq-surface: rgba(255, 255, 255, 0.03);
  --sq-surface-elevated: rgba(255, 255, 255, 0.06);
  --sq-white: #F0F2F5;
  --sq-subtext: #8B95A5;
  --sq-accent: #00D4FF;
  --sq-accent2: #7C3AED;
  --sq-accent3: #06B6D4;
  --sq-success: #10B981;
  --sq-error: #ef4444;
  --sq-muted: #5A6478;
  --sq-border: rgba(255, 255, 255, 0.08);
  --sq-border-accent: rgba(0, 212, 255, 0.25);
  --sq-gradient: linear-gradient(135deg, #00D4FF 0%, #7C3AED 100%);
  --sq-glow-1: rgba(0, 212, 255, 0.4);
  --sq-glow-2: rgba(124, 58, 237, 0.3);
  --sq-shadow-sm: 0 4px 16px rgba(0, 0, 0, 0.2);
  --sq-shadow-lg: 0 12px 48px rgba(0, 0, 0, 0.35);
  --sq-radius: 14px;
  --sq-font: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --sq-transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* ===== Theme Overrides (inherit from host theme classes) ===== */
:host(.cb-theme-light) .sq-wrapper {
  --sq-bg: #F8FAFC;
  --sq-bg2: #FFFFFF;
  --sq-bg3: #f1f3f5;
  --sq-surface: rgba(255, 255, 255, 0.9);
  --sq-surface-elevated: rgba(255, 255, 255, 0.95);
  --sq-white: #0F172A;
  --sq-subtext: #4b5563;
  --sq-muted: #94a3b8;
  --sq-accent: #0891b2;
  --sq-accent2: #7c3aed;
  --sq-accent3: #059669;
  --sq-success: #16a34a;
  --sq-error: #dc2626;
  --sq-border: rgba(0, 0, 0, 0.08);
  --sq-border-accent: rgba(8, 145, 178, 0.25);
  --sq-gradient: linear-gradient(135deg, #0891b2 0%, #7c3aed 100%);
  --sq-glow-1: rgba(8, 145, 178, 0.15);
  --sq-glow-2: rgba(124, 58, 237, 0.1);
  --sq-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.06);
  --sq-shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.1);
}

:host(.cb-theme-skeuomorphic) .sq-wrapper {
  --sq-bg: #d2d2d2;
  --sq-bg2: #dedede;
  --sq-bg3: #c5c5c5;
  --sq-surface: rgba(210, 210, 210, 0.9);
  --sq-surface-elevated: rgba(225, 225, 225, 0.95);
  --sq-white: #1a1a1a;
  --sq-subtext: #4a4a4a;
  --sq-muted: #7a7a7a;
  --sq-accent: #4a90d9;
  --sq-accent2: #6a7b8a;
  --sq-accent3: #5a9e6f;
  --sq-success: #27ae60;
  --sq-error: #c0392b;
  --sq-border: rgba(0, 0, 0, 0.2);
  --sq-border-accent: rgba(74, 144, 217, 0.3);
  --sq-gradient: linear-gradient(135deg, #4a90d9 0%, #6a7b8a 100%);
  --sq-glow-1: rgba(74, 144, 217, 0.06);
  --sq-glow-2: rgba(106, 123, 138, 0.06);
  --sq-shadow-sm: inset 1px 1px 0 rgba(255,255,255,0.6), 0 1px 3px rgba(0,0,0,0.12);
  --sq-shadow-lg: inset 1px 1px 0 rgba(255,255,255,0.4), 0 4px 12px rgba(0,0,0,0.2);
}

:host(.cb-theme-brutalism) .sq-wrapper {
  --sq-bg: #FFFBEB;
  --sq-bg2: #FFFFFF;
  --sq-bg3: #FEF3C7;
  --sq-surface: rgba(255, 251, 235, 0.95);
  --sq-surface-elevated: rgba(255, 255, 255, 0.95);
  --sq-white: #000000;
  --sq-subtext: #1a1a1a;
  --sq-muted: #555555;
  --sq-accent: #FF6B9D;
  --sq-accent2: #4ECDC4;
  --sq-accent3: #FFE156;
  --sq-success: #00CC00;
  --sq-error: #FF0000;
  --sq-border: #000000;
  --sq-border-accent: #FF6B9D;
  --sq-gradient: linear-gradient(135deg, #FF6B9D 0%, #4ECDC4 100%);
  --sq-glow-1: transparent;
  --sq-glow-2: transparent;
  --sq-shadow-sm: 3px 3px 0 #000;
  --sq-shadow-lg: 5px 5px 0 #000;
  --sq-radius: 0px;
}

:host(.cb-theme-synthwave) .sq-wrapper {
  --sq-bg: #0a0515;
  --sq-bg2: #130a2a;
  --sq-bg3: #1a0a2e;
  --sq-surface: rgba(45, 27, 105, 0.5);
  --sq-surface-elevated: rgba(45, 27, 105, 0.7);
  --sq-white: #f0e6ff;
  --sq-subtext: #c4a0ff;
  --sq-muted: #7a5dbf;
  --sq-accent: #FF2D95;
  --sq-accent2: #00F0FF;
  --sq-accent3: #FFD700;
  --sq-success: #39ff14;
  --sq-error: #ff3366;
  --sq-border: rgba(255, 45, 149, 0.2);
  --sq-border-accent: rgba(255, 45, 149, 0.4);
  --sq-gradient: linear-gradient(135deg, #FF2D95 0%, #00F0FF 100%);
  --sq-glow-1: rgba(255, 45, 149, 0.3);
  --sq-glow-2: rgba(0, 240, 255, 0.2);
  --sq-shadow-sm: 0 4px 12px rgba(255, 45, 149, 0.15);
  --sq-shadow-lg: 0 12px 48px rgba(255, 45, 149, 0.2), 0 0 60px rgba(0, 240, 255, 0.1);
}

:host(.cb-theme-glass) .sq-wrapper {
  --sq-bg: #1e1a2e;
  --sq-bg2: #252038;
  --sq-bg3: #1a1628;
  --sq-surface: rgba(37, 32, 56, 0.7);
  --sq-surface-elevated: rgba(42, 36, 69, 0.85);
  --sq-white: #e8e4f0;
  --sq-subtext: #a89ec0;
  --sq-muted: #6e6590;
  --sq-accent: #b48eff;
  --sq-accent2: #ff8fa3;
  --sq-accent3: #7ecbff;
  --sq-success: #69db7c;
  --sq-error: #ff6b6b;
  --sq-border: rgba(180, 142, 255, 0.12);
  --sq-border-accent: rgba(180, 142, 255, 0.25);
  --sq-gradient: linear-gradient(135deg, #b48eff 0%, #ff8fa3 100%);
  --sq-glow-1: rgba(180, 142, 255, 0.08);
  --sq-glow-2: rgba(255, 143, 163, 0.08);
  --sq-shadow-sm: 4px 4px 10px rgba(0,0,0,0.35), -2px -2px 8px rgba(60,50,90,0.25);
  --sq-shadow-lg: 8px 8px 20px rgba(0,0,0,0.45), -4px -4px 14px rgba(60,50,90,0.18);
}

.sq-wrapper {
  font-family: var(--sq-font);
  color: var(--sq-white);
  line-height: 1.6;
  display: flex;
  flex-direction: column;
  background: transparent;
  box-sizing: border-box;
  -webkit-font-smoothing: antialiased;
  width: 100%;
  max-width: 100%;
  height: 100%;
  overflow-x: hidden;
  overflow-y: hidden;
  position: relative;
}

.sq-wrapper > * { position: relative; z-index: 1; }

.sq-wrapper * { box-sizing: border-box; }

/* Premium Scrollbars */
.sq-wrapper ::-webkit-scrollbar { width: 4px; height: 4px; }
.sq-wrapper ::-webkit-scrollbar-track { background: transparent; }
.sq-wrapper ::-webkit-scrollbar-thumb { 
  background: rgba(0, 212, 255, 0.12); 
  border-radius: 10px; 
}
.sq-wrapper ::-webkit-scrollbar-thumb:hover { background: rgba(0, 212, 255, 0.25); }

/* Shimmer loading animation */
@keyframes sq-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.sq-shimmer {
  background: linear-gradient(90deg, transparent 25%, rgba(0, 212, 255, 0.06) 50%, transparent 75%);
  background-size: 200% 100%;
  animation: sq-shimmer 1.5s infinite;
  border-radius: 6px;
  height: 14px;
  margin: 4px 0;
}

/* Inline loading spinner (for small UI elements) */
@keyframes sq-spin { to { transform: rotate(360deg); } }
.sq-loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--sq-border);
  border-top-color: var(--sq-accent);
  border-radius: 50%;
  animation: sq-spin 0.6s linear infinite;
  display: inline-block;
}

/* Layout Structure */
.sq-main-layout {
  display: flex;
  height: 100%;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

/* Header */
.sq-header {
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding: 10px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid var(--sq-border);
  flex-shrink: 0;
  width: 100%;
}

.sq-title-icon { font-size: 20px; }

/* Tabs */
.sq-tabs {
  display: flex;
  background: rgba(15, 23, 42, 0.6);
  padding: 3px;
  border-radius: 10px;
  border: 1px solid var(--sq-border);
  gap: 2px;
  flex-shrink: 0;
}

.sq-tab {
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--sq-subtext);
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: var(--sq-transition);
  position: relative;
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.sq-tab.active {
  color: var(--sq-accent);
  background: rgba(0, 212, 255, 0.1);
  box-shadow: inset 0 0 0 1px rgba(0, 212, 255, 0.2);
}

.sq-tab:hover:not(.active) {
  color: var(--sq-white);
  background: rgba(255, 255, 255, 0.04);
}

/* Helper Text */
.sq-helper-text {
  font-size: 11px;
  color: var(--sq-subtext);
  padding: 6px 16px;
  background: rgba(0, 212, 255, 0.03);
  border-bottom: 1px solid var(--sq-border);
  font-weight: 500;
  letter-spacing: 0.03em;
  animation: fadeIn 0.4s ease-out;
  flex-shrink: 0;
}

/* Body */
.sq-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 0;
}

/* Suggestions */
.sq-suggestions {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 2px;
  scrollbar-width: none;
  -ms-overflow-style: none;
  animation: slideUp 0.4s ease-out;
}
.sq-suggestions::-webkit-scrollbar { display: none; }

.sq-suggestion-chip {
  padding: 6px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--sq-border);
  border-radius: 20px;
  font-size: 11px;
  color: var(--sq-subtext);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  white-space: nowrap;
  flex-shrink: 0;
}

.sq-suggestion-chip:hover {
  border-color: var(--sq-accent);
  color: var(--sq-accent);
  background: rgba(0, 212, 255, 0.08);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* Input Card — elevated glass like popup stat-card */
.sq-input-card {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: var(--sq-radius);
  border: 1px solid var(--sq-border);
  padding: 4px;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  overflow: hidden;
}

.sq-input-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
}

.sq-input-card:focus-within {
  border-color: rgba(0, 212, 255, 0.3);
  box-shadow: 0 0 0 2px rgba(0, 212, 255, 0.06), 0 4px 16px rgba(0, 0, 0, 0.15);
}

.sq-textarea {
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: transparent;
  color: var(--sq-white);
  font-family: inherit;
  font-size: 13px;
  resize: none;
  height: 56px;
  max-height: 120px;
  overflow-y: auto;
  outline: none;
  line-height: 1.6;
}

.sq-textarea::placeholder { color: var(--sq-subtext); opacity: 0.6; }

.sq-controls {
  padding: 8px 12px;
  border-top: 1px solid var(--sq-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

/* Buttons */
.sq-btn {
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: var(--sq-transition);
  letter-spacing: -0.01em;
}

.sq-btn-primary {
  background: var(--sq-gradient);
  color: white;
  box-shadow: 0 4px 14px rgba(0, 212, 255, 0.2);
  position: relative;
}

.sq-btn-primary::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  background: var(--sq-gradient);
  opacity: 0;
  filter: blur(10px);
  z-index: -1;
  transition: opacity 0.3s ease;
}

.sq-btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(0, 212, 255, 0.35);
}

.sq-btn-primary:hover::after {
  opacity: 0.4;
}

.sq-btn-secondary {
  background: rgba(255, 255, 255, 0.05);
  color: var(--sq-white);
  border: 1px solid var(--sq-border);
}

.sq-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: var(--sq-subtext);
}

.sq-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Filters Component */
.sq-filters-panel {
  display: none;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: var(--sq-radius);
  border: 1px solid var(--sq-border);
  animation: fadeIn 0.3s ease;
}

.sq-filters-panel.active { display: grid; }

.sq-filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sq-filter-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--sq-subtext);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sq-filter-select, .sq-filter-input {
  background: var(--sq-bg);
  border: 1px solid var(--sq-border);
  padding: 8px 12px;
  border-radius: 6px;
  color: var(--sq-white);
  font-size: 13px;
  outline: none;
}

.sq-filter-select:focus, .sq-filter-input:focus {
  border-color: var(--sq-accent);
}

/* Response Section */
.sq-response-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* Cards — elevated glassmorphism matching popup */
.sq-synthesis-card, .sq-result {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--sq-border);
  border-radius: var(--sq-radius);
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  min-width: 0;
  position: relative;
}

/* Glass top-edge highlight — signature popup detail */
.sq-synthesis-card::before, .sq-result::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.12), transparent);
  z-index: 1;
}

/* Hover glow — radial accent reveal */
.sq-synthesis-card::after, .sq-result::after {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle at 50% 50%, var(--sq-glow-1), transparent 60%);
  opacity: 0;
  transition: opacity 0.4s ease;
  pointer-events: none;
}

.sq-synthesis-card:hover::after, .sq-result:hover::after {
  opacity: 0.12;
}

.sq-synthesis-card {
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.04) 0%, rgba(124, 58, 237, 0.04) 100%);
  border-color: var(--sq-border-accent);
}

.sq-card-header {
  padding: 8px 14px;
  border-bottom: 1px solid var(--sq-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.02);
}

.sq-card-title-text {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--sq-accent);
}

.sq-card-content {
  padding: 14px 16px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--sq-white);
  overflow-y: auto;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* Collapsed state — click to expand */
.sq-card-content.sq-collapsed {
  max-height: 220px;
  position: relative;
}

.sq-card-content.sq-collapsed::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 48px;
  background: linear-gradient(transparent, var(--sq-bg2));
  pointer-events: none;
}

.sq-expand-btn {
  display: none;
  width: 100%;
  padding: 6px;
  background: rgba(255,255,255,0.02);
  border: none;
  border-top: 1px solid var(--sq-border);
  color: var(--sq-accent);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  letter-spacing: 0.03em;
  transition: var(--sq-transition);
}

.sq-expand-btn:hover {
  background: rgba(0, 212, 255, 0.06);
}

.sq-expand-btn.sq-visible {
  display: block;
}

.sq-result {
  border-left: 2px solid transparent;
}

.sq-result:hover {
  transform: translateY(-2px);
  border-color: var(--sq-border-accent);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 212, 255, 0.08);
}

.sq-result[data-tag='decision'] { border-left-color: var(--sq-success); }
.sq-result[data-tag='unresolved'] { border-left-color: #f59e0b; }
.sq-result[data-tag='change'] { border-left-color: var(--sq-accent); }

.sq-res-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  font-size: 11px;
  color: var(--sq-subtext);
}

.sq-res-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
}

.sq-res-tag.decision { color: #10b981; background: rgba(16, 185, 129, 0.1); }
.sq-res-tag.unresolved { color: #f59e0b; background: rgba(245, 158, 11, 0.1); }
.sq-res-tag.change { color: #3b82f6; background: rgba(59, 130, 246, 0.1); }

.sq-res-preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sq-res-msg {
  display: flex;
  gap: 8px;
}

.sq-res-role {
  font-weight: 700;
  font-size: 12px;
  color: var(--sq-accent);
  min-width: 32px;
}

/* History Sidebar — elevated overlay dropdown */
.sq-history-sidebar {
  position: absolute;
  top: 44px;
  right: 12px;
  width: 260px;
  max-height: 300px;
  background: var(--sq-bg2);
  border: 1px solid var(--sq-border);
  border-radius: var(--sq-radius);
  overflow: hidden;
  display: none;
  flex-direction: column;
  z-index: 200;
  box-shadow: var(--sq-shadow-lg);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}

.sq-history-sidebar::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.12), transparent);
  z-index: 1;
}

.sq-history-sidebar.open { display: flex; }

.sq-history-header {
  padding: 10px 14px;
  border-bottom: 1px solid var(--sq-border);
  font-size: 12px;
  font-weight: 700;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sq-history-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
  max-height: 240px;
}

.sq-history-item {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--sq-subtext);
  cursor: pointer;
  transition: var(--sq-transition);
  margin-bottom: 2px;
}

.sq-history-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--sq-white);
}

.sq-history-item-time {
  font-size: 10px;
  margin-top: 4px;
  opacity: 0.6;
}

/* Pagination */
.sq-pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  padding-top: 10px;
}

.sq-pagination-info {
  font-size: 11px;
  color: var(--sq-subtext);
  font-variant-numeric: tabular-nums;
}

/* Animations */
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

/* No-scroll utilities */
.sq-no-hscroll { overflow-x: hidden !important; }

/* Responsive adjustments */
@media (max-width: 768px) {
  .sq-history-sidebar.open {
    position: absolute;
    height: 100%;
    z-index: 100;
    box-shadow: 20px 0 50px rgba(0,0,0,0.5);
  }
}
`;
  ;

  // ==========================================
  // UI CLASS
  // ==========================================
  class SmartQueryUI {
    constructor() {
      this.mode = 'live'; // 'live' | 'memory'
      this.history = []; // Query history
      this.savedSearches = [];
      this.currentResults = [];
      this.currentPage = 1;
      this.resultsPerPage = 5;
      this.debounceTimer = null;
      this.lastQueryTime = 0; // Rate limiting
      this.loadHistory();
      this.loadSavedSearches();
    }

    escapeHTML(str) {
      if (!str) return '';
      return str.replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
    }

    injectStyles(root) {
      if (!root) return;
      // Prevent duplicate injection in the same root
      if (root.querySelector && root.querySelector('#sq-injected-styles')) return;
      if (root.getElementById && root.getElementById('sq-injected-styles')) return;

      const style = document.createElement('style');
      style.id = 'sq-injected-styles';
      style.textContent = UI_STYLES;

      // Handle both Head and ShadowRoot
      if (root.head) {
        root.head.appendChild(style);
      } else {
        root.appendChild(style);
      }
    }

    async initialize() {
      if (window.MemoryRetrieval) {
        this.memoryRetrieval = new window.MemoryRetrieval();
        await this.memoryRetrieval.initialize();
      }
    }

    loadHistory() {
      try {
        const stored = localStorage.getItem('sq-query-history');
        this.history = stored ? JSON.parse(stored) : [];
      } catch (e) {
        console.error('[ChatBridge] Failed to load query history:', e);
        this.history = [];
      }
    }

    saveHistory() {
      try {
        localStorage.setItem('sq-query-history', JSON.stringify(this.history.slice(0, 50)));
      } catch (e) {
        console.error('[ChatBridge] Failed to save query history:', e);
      }
    }

    loadSavedSearches() {
      try {
        const stored = localStorage.getItem('sq-saved-searches');
        this.savedSearches = stored ? JSON.parse(stored) : [];
      } catch (e) {
        console.error('[ChatBridge] Failed to load saved searches:', e);
        this.savedSearches = [];
      }
    }

    saveSavedSearches() {
      try {
        localStorage.setItem('sq-saved-searches', JSON.stringify(this.savedSearches));
      } catch (e) {
        console.error('[ChatBridge] Failed to save searches:', e);
      }
    }

    addToHistory(query, mode = this.mode) {
      if (!query.trim()) return;
      this.history.unshift({
        text: query.length > 50 ? query.slice(0, 50) + '...' : query,
        fullText: query,
        timestamp: new Date().toISOString(),
        mode: mode
      });
      // Limit history to 50 items
      if (this.history.length > 50) this.history.pop();
      this.saveHistory();
    }

    render(container) {
      if (!container) return;
      this.container = container;
      this.injectStyles(container.getRootNode());

      container.innerHTML = `
        <div class="sq-wrapper sq-no-hscroll">
          <div class="sq-main-layout">
            <!-- Main Content -->
            <div style="flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; overflow-x: visible; position: relative;">
              <!-- Header -->
              <div class="sq-header">
                <div class="sq-tabs">
                    <button class="sq-tab active" data-mode="live">Current Chat</button>
                    <button class="sq-tab" data-mode="memory">Search Memory</button>
                    <button class="sq-tab" data-mode="graph">Knowledge Graph</button>
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                  <button class="sq-btn sq-btn-secondary sq-btn-sm" id="sq-open-history" title="History">📋</button>
                  <button class="sq-btn sq-btn-secondary sq-btn-sm" id="btn-index-now" title="Train your AI memory on saved conversations">↻ Train</button>
                </div>
              </div>

              <!-- History Dropdown Overlay -->
              <div class="sq-history-sidebar" id="sq-sidebar">
                <div class="sq-history-header">
                  <span>📋 Query History</span>
                  <button class="sq-history-toggle" id="sq-sidebar-toggle" style="background:none;border:none;color:var(--sq-subtext);cursor:pointer;font-size:14px;">✕</button>
                </div>
                <div id="sq-history-list" class="sq-history-list"></div>
              </div>
              
              <div id="sq-mode-helper" class="sq-helper-text">Reason only over this conversation</div>

              <!-- Body -->
              <div class="sq-body">
                
                <!-- Suggestions -->
                <div id="sq-suggestions-area" class="sq-suggestions" style="display:none;"></div>

                <!-- Input Card -->
                <div class="sq-input-card">
                  <div class="sq-input-wrapper">
                    <textarea 
                      class="sq-textarea" 
                      id="sq-query-input"
                      placeholder="Ask about decisions, confusions, patterns..."
                    ></textarea>
                  </div>
                  
                  <div class="sq-controls">
                    <div class="sq-options" style="display:flex;gap:6px;align-items:center;">
                       <label class="sq-checkbox-label" style="display:none;font-size:11px;color:var(--sq-subtext);gap:4px;align-items:center;" id="chk-synthesis-wrapper">
                         <input type="checkbox" checked id="chk-synthesis" style="accent-color:var(--sq-accent);">
                         <span>Synthesis</span>
                       </label>
                       <button class="sq-btn sq-btn-secondary sq-btn-sm" id="sq-toggle-filters" title="Advanced filters">⚙️</button>
                       <button class="sq-btn sq-btn-secondary sq-btn-sm" id="btn-clear">Clear</button>
                    </div>
                    <button class="sq-btn sq-btn-primary" id="btn-ask">
                      ✨ <span>Ask AI</span>
                    </button>
                  </div>
                </div>

                <!-- Advanced Filters -->
                <div class="sq-filters-panel" id="sq-filters-panel">
                  <div class="sq-filter-group">
                    <label class="sq-filter-label">Sort By</label>
                    <select class="sq-filter-select" id="sq-sort-by">
                      <option value="relevance">Relevance</option>
                      <option value="recent">Most Recent</option>
                      <option value="oldest">Oldest</option>
                    </select>
                  </div>
                  <div class="sq-filter-group">
                    <label class="sq-filter-label">Date Range</label>
                    <div style="display:flex; gap:6px; align-items:center;">
                      <input type="date" class="sq-filter-input" id="sq-date-from" style="font-size:11px;padding:6px 8px;">
                      <span style="color: var(--sq-subtext); font-size:11px;">to</span>
                      <input type="date" class="sq-filter-input" id="sq-date-to" style="font-size:11px;padding:6px 8px;">
                    </div>
                  </div>
                </div>

                <!-- Response Area -->
                <div id="sq-results-area" class="sq-response-section" style="display:none;"></div>

              </div>
            </div>
          </div>
        </div>
      `;

      this.attachEvents();
      this.updateHistoryList();

      if (this.mode === 'live') {
        this.showKeywordSuggestions();
      }
    }

    updateHistoryList() {
      const historyList = this.container.querySelector('#sq-history-list');
      if (!historyList) return;

      if (this.history.length === 0) {
        historyList.innerHTML = '<div style="padding:16px;text-align:center;color:#9ca3af;font-size:12px;">No history yet</div>';
        return;
      }

      historyList.innerHTML = this.history.map((item, idx) => `
              <div class="sq-history-item" data-index="${idx}" title="${item.fullText}">
                <div>${item.text}</div>
                <div class="sq-history-item-time">${this.formatTime(item.timestamp)}</div>
              </div>
            `).join('');

      historyList.querySelectorAll('.sq-history-item').forEach(el => {
        el.addEventListener('click', () => {
          const idx = parseInt(el.dataset.index);
          this.container.querySelector('#sq-query-input').value = this.history[idx].fullText;
        });
      });
    }

    attachEvents() {
      const tabs = this.container.querySelectorAll('.sq-tab');
      const textarea = this.container.querySelector('#sq-query-input');
      const askBtn = this.container.querySelector('#btn-ask');
      const clearBtn = this.container.querySelector('#btn-clear');
      const resultsArea = this.container.querySelector('#sq-results-area');
      const synthesisWrapper = this.container.querySelector('#chk-synthesis-wrapper');
      const askSpan = askBtn ? askBtn.querySelector('span') : null;
      const sidebar = this.container.querySelector('#sq-sidebar');
      const sidebarToggle = this.container.querySelector('#sq-sidebar-toggle');
      const openHistory = this.container.querySelector('#sq-open-history');
      const toggleFilters = this.container.querySelector('#sq-toggle-filters');
      const filtersPanel = this.container.querySelector('#sq-filters-panel');
      const indexBtn = this.container.querySelector('#btn-index-now');
      const modeHelper = this.container.querySelector('#sq-mode-helper');

      // Index Button
      if (indexBtn) {
        indexBtn.addEventListener('click', async () => {
          indexBtn.disabled = true;
          indexBtn.innerHTML = '<div class="sq-loading-spinner" style="width:12px;height:12px;border-width:2px;margin:0;"></div> Training...';

          try {
            // Trigger indexing via the main extension logic
            await new Promise((resolve, reject) => {
              chrome.runtime.sendMessage({ type: 'vector_index_all' }, (res) => {
                if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                else resolve(res);
              });
            });

            // Also trigger basic refresh if available
            if (window.indexAllChats) { // Fallback if exposed
              await window.indexAllChats();
            }

            indexBtn.innerHTML = '✓ Trained';
            setTimeout(() => { indexBtn.innerHTML = '↻ Train Memory'; indexBtn.disabled = false; }, 2000);
          } catch (e) {
            console.error('Indexing failed', e);
            indexBtn.innerHTML = '✕ Error';
            setTimeout(() => { indexBtn.innerHTML = '↻ Train Memory'; indexBtn.disabled = false; }, 2000);
          }
        });
      }

      // Sidebar Toggle
      if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
          sidebar.classList.remove('open');
        });
      }

      if (openHistory) {
        openHistory.addEventListener('click', () => {
          sidebar.classList.toggle('open');
        });
      }

      // Filters Toggle
      if (toggleFilters) {
        toggleFilters.addEventListener('click', () => {
          filtersPanel.classList.toggle('active');
        });
      }

      // Tab Switch
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          this.mode = tab.dataset.mode;

          // Update helper text dynamically
          if (this.mode === 'live') {
            modeHelper.textContent = "Reason only over this conversation";
            synthesisWrapper.style.display = "none";
            if (askSpan) askSpan.textContent = "Ask AI";
            textarea.placeholder = "Ask about decisions, confusions, patterns...";
            // Show keyword suggestions for current chat
            this.showKeywordSuggestions();
          } else if (this.mode === 'graph') {
            modeHelper.textContent = "Query your cross-platform knowledge graph";
            synthesisWrapper.style.display = "none";
            if (askSpan) askSpan.textContent = "Query Graph";
            textarea.placeholder = "What have I discussed about React hooks across all platforms?";
          } else {
            modeHelper.textContent = "Reason across all saved conversations";
            synthesisWrapper.style.display = "flex";
            if (askSpan) askSpan.textContent = "Search Memory";
            textarea.placeholder = "Find patterns across your knowledge base...";
            this.showSuggestions();
          }

          // Reset UI
          resultsArea.innerHTML = '';
          resultsArea.style.display = 'none';
          this.currentPage = 1;
        });
      });

      // Input logic — auto-resize capped at 120px
      textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
      });

      // Summary Checkbox Logic
      const chk = this.container.querySelector('#chk-synthesis');
      const lbl = this.container.querySelector('#chk-synthesis-wrapper span');
      if (chk && lbl) {
        chk.addEventListener('change', () => {
          lbl.textContent = chk.checked ? 'Summarize selected segments' : 'Raw excerpts only. No synthesis.';
          lbl.style.opacity = chk.checked ? '1' : '0.7';
        });
      }

      // Ask Logic with debouncing
      askBtn.addEventListener('click', async () => {
        const query = textarea.value.trim();
        if (!query) return;

        this.addToHistory(query);
        this.updateHistoryList();

        askBtn.disabled = true;
        const origBtn = askBtn.innerHTML;
        askBtn.innerHTML = '✨ Processing...';

        resultsArea.style.display = 'block';
        resultsArea.innerHTML = `
          <div style="display:flex; flex-direction:column; align-items:center; gap:12px; padding:24px;">
            <div class="sq-shimmer" style="width:80%;height:12px;"></div>
            <div class="sq-shimmer" style="width:60%;height:12px;"></div>
            <div class="sq-shimmer" style="width:70%;height:12px;"></div>
            <div style="font-size: 12px; color: var(--sq-subtext); margin-top:4px;">Querying Intelligence...</div>
          </div>
        `;

        try {
          if (this.mode === 'live') {
            await this.runLiveQuery(query, resultsArea);
          } else if (this.mode === 'graph') {
            await this.runGraphQuery(query, resultsArea);
          } else {
            const synth = this.container.querySelector('#chk-synthesis')?.checked ?? true;
            const sortBy = this.container.querySelector('#sq-sort-by')?.value || 'relevance';
            const dateFrom = this.container.querySelector('#sq-date-from')?.value;
            const dateTo = this.container.querySelector('#sq-date-to')?.value;

            await this.runMemorySearch(query, resultsArea, synth, { sortBy, dateFrom, dateTo });
          }
        } catch (e) {
          // Show friendly toast instead of an error card
          this.showToast(e?.message?.includes?.('API') || e?.message?.includes?.('fetch')
            ? 'Please configure your API key in ChatBridge Options'
            : (e?.message || 'Something went wrong. Please try again.'));
          resultsArea.innerHTML = '';
          resultsArea.style.display = 'none';
        } finally {
          askBtn.disabled = false;
          askBtn.innerHTML = origBtn;
        }
      });

      // Keyboard shortcuts

      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + K to focus query input
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
          e.preventDefault();
          textarea.focus();
        }
        // Enter in textarea with Ctrl to submit
        if (textarea === document.activeElement && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          askBtn.click();
        }
        // Escape to close sidebar
        if (e.key === 'Escape') {
          sidebar.classList.remove('open');
        }
      });

      // ARIA live region for loading states
      const ariaLive = document.createElement('div');
      ariaLive.setAttribute('aria-live', 'polite');
      ariaLive.setAttribute('aria-atomic', 'true');
      ariaLive.style.position = 'absolute';
      ariaLive.style.left = '-10000px';
      ariaLive.id = 'sq-aria-live';
      this.container.appendChild(ariaLive);
    }

    showSuggestions() {
      const suggestionsArea = this.container.querySelector('#sq-suggestions-area');
      if (!suggestionsArea) return;

      const suggestions = [
        { text: 'What was decided so far?', tip: 'Summarize key decisions and conclusions from this chat' },
        { text: 'Continue from where we left off', tip: 'Pick up the conversation thread naturally' },
        { text: 'What questions are still open?', tip: 'Find unresolved questions and loose threads' },
        { text: 'What should I ask next?', tip: 'Suggest follow-up questions based on the conversation' },
        { text: 'Summarize the key points', tip: 'Get a concise overview of the conversation so far' },
        { text: 'What changed during this chat?', tip: 'Track how ideas evolved over the conversation' }
      ];

      suggestionsArea.innerHTML = suggestions.map(s => `
              <button class="sq-suggestion-chip" title="${s.tip}">${s.text}</button>
            `).join('');

      suggestionsArea.style.display = 'flex';

      suggestionsArea.querySelectorAll('.sq-suggestion-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          this.container.querySelector('#sq-query-input').value = btn.textContent;
          this.container.querySelector('#btn-ask').click();
        });
      });
    }

    showKeywordSuggestions() {
      const suggestionsArea = this.container.querySelector('#sq-suggestions-area');
      if (!suggestionsArea) return;

      // Extract keywords from current conversation
      const context = this.getContext();
      const keywords = this.extractKeywords(context);

      if (keywords.length === 0) {
        suggestionsArea.style.display = 'none';
        return;
      }

      suggestionsArea.innerHTML = keywords.slice(0, 8).map(kw => `
              <button class="sq-suggestion-chip" title="Search for: ${this.escapeHTML(kw)}">${this.escapeHTML(kw)}</button>
            `).join('');

      suggestionsArea.style.display = 'flex';

      suggestionsArea.querySelectorAll('.sq-suggestion-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          this.container.querySelector('#sq-query-input').value = btn.textContent;
          this.container.querySelector('#btn-ask').click();
        });
      });
    }

    extractKeywords(text) {
      if (!text || text.length < 50) return [];

      // Expanded stop words list to filter common words
      const stopWords = new Set([
        'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'in', 'with', 'to', 'for', 'of', 'as', 'by', 'from', 'that', 'this', 'it', 'its', 'be', 'are', 'was', 'were', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'cant', 'i', 'you', 'he', 'she', 'we', 'they', 'them', 'their', 'theirs', 'what', 'when', 'where', 'why', 'how', 'who', 'whom', 'whose', 'if', 'then', 'than', 'so', 'such', 'like', 'just', 'very', 'too', 'also', 'only', 'own', 'same', 'other', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'once', 'here', 'there', 'all', 'both', 'each', 'few', 'more', 'most', 'some', 'any', 'no', 'nor', 'not', 'yes', 'about', 'between', 'because', 'until', 'while', 'these', 'those', 'am', 'being', 'having', 'doing', 'get', 'got', 'make', 'made', 'see', 'saw', 'seen', 'go', 'went', 'gone', 'come', 'came', 'know', 'knew', 'known', 'think', 'thought', 'take', 'took', 'taken', 'give', 'gave', 'given', 'find', 'found', 'tell', 'told', 'ask', 'asked', 'work', 'worked', 'seem', 'seemed', 'feel', 'felt', 'try', 'tried', 'leave', 'left', 'call', 'called', 'use', 'used', 'using', 'need', 'needed', 'want', 'wanted', 'let', 'put', 'mean', 'meant', 'keep', 'kept', 'say', 'said', 'show', 'showed', 'shown', 'still', 'even', 'well', 'back', 'much', 'many', 'now', 'way', 'new', 'good', 'great', 'first', 'last', 'long', 'little', 'own', 'old', 'right', 'big', 'high', 'different', 'small', 'large', 'next', 'early', 'young', 'important', 'public', 'bad', 'able', 'sure'
      ]);

      // Extract words (3+ chars, alphanumeric, prioritize capitalized and technical terms)
      const words = text
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => {
          const lower = w.toLowerCase();
          return w.length >= 3 &&
            !stopWords.has(lower) &&
            !/^\d+$/.test(w); // Filter pure numbers
        });

      // Count frequency
      const freq = {};
      words.forEach(w => {
        const key = w.toLowerCase();
        freq[key] = (freq[key] || 0) + 1;
      });

      // Sort by frequency and return top keywords
      return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([word]) => word)
        .filter(w => w.length <= 20); // Avoid very long words
    }

    async runLiveQuery(query, container) {
      const rateError = this.checkRateLimit();
      if (rateError) {
        container.innerHTML = `<div class="sq-error" style="text-align:center;padding:16px;color:var(--sq-subtext);font-size:13px;">${rateError}</div>`;
        return;
      }
      if (!query.trim()) return;
      const context = this.getContext();
      const prompt = `You are a helpful assistant reasoning about an ongoing conversation.

Conversation context:
${context}

User question: ${query}

Provide a clear, thorough answer. If the question is about continuing the conversation, suggest what to discuss next. Format important points with **bold**. Be specific and reference the actual conversation content.`;

      const response = await this.callLlama(prompt);

      // If callLlama returned empty (toast already shown), clear results area
      if (!response) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
      }

      container.innerHTML = `
        <div class="sq-synthesis-card">
          <div class="sq-card-header">
            <span class="sq-card-title-text">✨ AI Answer</span>
            <button class="sq-btn sq-btn-secondary sq-btn-sm" id="btn-copy-live">📋 Copy</button>
          </div>
          <div class="sq-card-content" id="sq-live-answer">${this.formatText(this.escapeHTML(response))}</div>
          <button class="sq-expand-btn" id="sq-expand-answer">▼ Show full answer</button>
        </div>
      `;

      // Auto-detect if content overflows and show expand button
      const answerEl = container.querySelector('#sq-live-answer');
      const expandBtn = container.querySelector('#sq-expand-answer');
      if (answerEl && expandBtn) {
        requestAnimationFrame(() => {
          if (answerEl.scrollHeight > 220) {
            answerEl.classList.add('sq-collapsed');
            expandBtn.classList.add('sq-visible');
            expandBtn.addEventListener('click', () => {
              const isCollapsed = answerEl.classList.contains('sq-collapsed');
              answerEl.classList.toggle('sq-collapsed');
              expandBtn.textContent = isCollapsed ? '▲ Collapse' : '▼ Show full answer';
            });
          }
        });
      }

      const copyBtn = container.querySelector('#btn-copy-live');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          const content = container.querySelector('.sq-card-content').innerText;
          navigator.clipboard.writeText(content).then(() => {
            const orig = copyBtn.innerHTML;
            copyBtn.innerHTML = '✅ Copied!';
            copyBtn.style.color = 'var(--sq-success)';
            setTimeout(() => {
              copyBtn.innerHTML = orig;
              copyBtn.style.color = '';
            }, 2000);
          });
        });
      }
    }

    async runMemorySearch(query, container, synthesize, filters = {}) {
      const rateError = this.checkRateLimit();
      if (rateError) {
        container.innerHTML = `<div class="sq-error" style="text-align:center;padding:16px;color:var(--sq-subtext);font-size:13px;">${rateError}</div>`;
        return;
      }
      if (!this.memoryRetrieval) await this.initialize();
      const rawResults = await this.memoryRetrieval.search(query, { limit: 50 });

      if (!rawResults || rawResults.length === 0) {
        container.innerHTML = `<div class="sq-empty">No relevant memories found.</div>`;
        return;
      }

      this.rawResultsCount = rawResults.length;

      // 1. Deduplication (String Similarity/Exact Check)
      const uniqueResults = [];
      const seenTexts = new Set();

      for (const res of rawResults) {
        // Flatten segments for comparison
        const fullText = res.excerpt.map(m => m.text.trim()).join(' ');
        // Simple fuzzy signature: first 60 chars
        const signature = fullText.slice(0, 60).toLowerCase();

        if (!seenTexts.has(signature)) {
          seenTexts.add(signature);
          uniqueResults.push(res);
        }
      }

      // 2. Filter by Date
      let filtered = uniqueResults;
      if (filters.dateFrom) {
        const fromDate = new Date(filters.dateFrom);
        filtered = filtered.filter(r => new Date(r.segment.timestamp) >= fromDate);
      }
      if (filters.dateTo) {
        const toDate = new Date(filters.dateTo);
        filtered = filtered.filter(r => new Date(r.segment.timestamp) <= toDate);
      }

      // 3. Sorting
      if (filters.sortBy === 'recent') {
        filtered.sort((a, b) => new Date(b.segment.timestamp) - new Date(a.segment.timestamp));
      } else if (filters.sortBy === 'oldest') {
        filtered.sort((a, b) => new Date(a.segment.timestamp) - new Date(b.segment.timestamp));
      }

      this.currentResults = filtered;
      this.currentPage = 1;
      this.renderMemoryResults(container, synthesize);
    }

    renderMemoryResults(container, synthesize) {
      let html = '';

      if (this.currentResults.length === 0) {
        container.innerHTML = `<div class="sq-empty">No results match your filters.</div>`;
        return;
      }

      // Synthesis (Answer)
      if (synthesize) {
        // Use up to 16 results for comprehensive synthesis
        const topResults = this.currentResults.slice(0, 16);
        const context = topResults.map((r, i) => {
          const date = new Date(r.segment.timestamp).toLocaleDateString();
          const messages = r.excerpt.map(m => `  ${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n');
          return `[Source ${i + 1} — ${date}]\n${messages}`;
        }).join('\n\n---\n\n');

        const sourceCount = topResults.length;
        const totalCount = this.currentResults.length;

        html += `
          <div class="sq-synthesis-card" style="margin-bottom:10px;">
            <div class="sq-card-header">
              <span class="sq-card-title-text">✨ AI Synthesis · ${sourceCount} sources</span>
              <button class="sq-btn sq-btn-secondary sq-btn-sm" id="btn-copy-memory">📋 Copy</button>
            </div>
            <div class="sq-card-content" id="sq-synthesis-content">
              <div style="display:flex; flex-direction:column; gap:6px; padding:8px;">
                <div class="sq-shimmer" style="width:90%;height:10px;"></div>
                <div class="sq-shimmer" style="width:70%;height:10px;"></div>
                <div class="sq-shimmer" style="width:80%;height:10px;"></div>
                <div class="sq-shimmer" style="width:60%;height:10px;"></div>
              </div>
            </div>
            <button class="sq-expand-btn" id="sq-expand-synthesis">▼ Show full synthesis</button>
          </div>
        `;

        const userQuery = this.currentResults[0].fullQuery || '';
        const prompt = `You are a thorough research assistant synthesizing insights from ${sourceCount} saved conversation memories (out of ${totalCount} total matches).

User's question: "${userQuery}"

Memory sources:
${context}

Write a comprehensive, detailed synthesis covering ALL relevant information from every source above.

Requirements:
- Structure with **bold section headers** for each major theme or topic area
- Under each section, use bullet points to list specific findings, decisions, ideas, or facts
- For key points, note the date they came up
- Cover: decisions made, ideas explored, open questions, action items, and how thinking evolved
- If sources conflict, note the contradiction and which view is more recent
- Be thorough and detailed - synthesize across ALL ${sourceCount} sources, not just 1-2
- Do NOT start with "Based on..." or describe what the user asked
- Jump straight into the structured findings

Synthesize now:`;

        this.callLlama(prompt).then(summary => {
          const syntContent = container.querySelector('#sq-synthesis-content');
          if (syntContent) {
            syntContent.innerHTML = this.formatText(summary);

            // Auto-detect overflow and show expand button
            const expandBtn = container.querySelector('#sq-expand-synthesis');
            requestAnimationFrame(() => {
              if (syntContent.scrollHeight > 220) {
                syntContent.classList.add('sq-collapsed');
                if (expandBtn) {
                  expandBtn.classList.add('sq-visible');
                  expandBtn.addEventListener('click', () => {
                    const isCollapsed = syntContent.classList.contains('sq-collapsed');
                    syntContent.classList.toggle('sq-collapsed');
                    expandBtn.textContent = isCollapsed ? '▲ Collapse' : '▼ Show full synthesis';
                  });
                }
              }
            });

            const copyBtn = container.querySelector('#btn-copy-memory');
            if (copyBtn) {
              copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(summary).then(() => {
                  const orig = copyBtn.innerHTML;
                  copyBtn.innerHTML = '✅ Copied!';
                  copyBtn.style.color = 'var(--sq-success)';
                  setTimeout(() => {
                    copyBtn.innerHTML = orig;
                    copyBtn.style.color = '';
                  }, 2000);
                });
              });
            }
          }
        });
      }

      // Results List with pagination
      const start = (this.currentPage - 1) * this.resultsPerPage;
      const end = start + this.resultsPerPage;
      const pagedResults = this.currentResults.slice(start, end);

      // Dedupe notice
      if (this.rawResultsCount > this.currentResults.length) {
        const mergedCount = this.rawResultsCount - this.currentResults.length;
        html += `<div class="sq-dedupe-notice">Merged ${mergedCount} similar segments</div>`;
      }

      html += `<div style="font-size:10px; color:var(--sq-subtext); text-transform:uppercase; font-weight:700; letter-spacing:0.08em; display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <span>${this.currentResults.length} Memories</span>
        ${this.currentResults.length > pagedResults.length ? `<span style="opacity:0.6;">Page ${this.currentPage}</span>` : ''}
      </div>`;

      html += pagedResults.map((r, idx) => {
        let tags = '';
        let tagType = '';
        const txt = r.excerpt.map(m => m.text).join(' ').toLowerCase();
        if (txt.includes('decide') || txt.includes('agreed') || txt.includes('plan')) { tags += `<span class="sq-res-tag decision">Decision</span>`; tagType = 'decision'; }
        else if (txt.includes('unsure') || txt.includes('maybe') || txt.includes('?')) { tags += `<span class="sq-res-tag unresolved">Unresolved</span>`; tagType = 'unresolved'; }
        else if (txt.includes('change') || txt.includes('instead')) { tags += `<span class="sq-res-tag change">Shift</span>`; tagType = 'change'; }

        return `
          <div class="sq-result" data-result-index="${start + idx}" data-tag="${tagType}" style="padding:10px 14px;">
            <div class="sq-res-meta">
               <div style="display:flex; gap:5px; align-items:center;">
                 ${tags}
                 <span style="font-size:10px; opacity:0.7;">${new Date(r.segment.timestamp).toLocaleDateString()}</span>
               </div>
               <button class="sq-btn sq-btn-secondary sq-btn-sm sq-expand-btn" style="padding:2px 8px; height:22px; font-size:10px;">Details</button>
            </div>
            <div class="sq-res-preview" style="font-size:12px;">
              <div class="sq-res-content">
                ${r.excerpt.slice(0, 2).map(m => `
                  <div class="sq-res-msg" style="gap:8px;">
                    <span class="sq-res-role" style="font-size:10px;min-width:22px;">${m.role === 'user' ? 'You' : 'AI'}</span>
                    <div style="flex:1; min-width:0; overflow-wrap:break-word; line-height:1.5;">${this.escapeHTML(m.text.length > 120 ? m.text.slice(0, 120) + '...' : m.text)}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Pagination
      if (this.currentResults.length > this.resultsPerPage) {
        const totalPages = Math.ceil(this.currentResults.length / this.resultsPerPage);
        html += `
          <div class="sq-pagination">
            <button class="sq-btn sq-btn-secondary sq-btn-sm" id="sq-prev-page" ${this.currentPage === 1 ? 'disabled' : ''}>← Prev</button>
            <div class="sq-pagination-info">${this.currentPage} of ${totalPages}</div>
            <button class="sq-btn sq-btn-secondary sq-btn-sm" id="sq-next-page" ${this.currentPage === totalPages ? 'disabled' : ''}>Next →</button>
          </div>
        `;
      }

      container.innerHTML = html;

      // Expandable preview items
      container.querySelectorAll('.sq-result').forEach(el => {
        const btn = el.querySelector('.sq-expand-btn');
        btn.addEventListener('click', () => {
          el.classList.toggle('expanded');
          btn.textContent = el.classList.contains('expanded') ? 'Hide Details' : 'View Details';
        });
      });

      // Pagination Listeners
      const prevBtn = container.querySelector('#sq-prev-page');
      const nextBtn = container.querySelector('#sq-next-page');

      if (prevBtn) prevBtn.addEventListener('click', () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.renderMemoryResults(container, false);
          container.scrollIntoView({ behavior: 'smooth' });
        }
      });
      if (nextBtn) nextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(this.currentResults.length / this.resultsPerPage);
        if (this.currentPage < totalPages) {
          this.currentPage++;
          this.renderMemoryResults(container, false);
          container.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }

    // --- Helpers ---

    checkRateLimit() {
      const now = Date.now();
      if (now - this.lastQueryTime < 3000) { // 3 second cooldown
        const remaining = Math.ceil((3000 - (now - this.lastQueryTime)) / 1000);
        return `Please wait ${remaining}s before searching again.`;
      }
      this.lastQueryTime = now;
      return null;
    }

    formatTime(isoString) {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    }

    /**
     * Run a graph query: search the EntityResolver knowledge graph,
     * then optionally synthesize an answer via Gemini.
     */
    async runGraphQuery(query, container) {
      // Initialize EntityResolver if available
      if (!this.entityResolver && window.EntityResolver) {
        this.entityResolver = new window.EntityResolver();
      }

      if (!this.entityResolver) {
        container.innerHTML = `
          <div style="text-align:center; padding:24px; color:var(--sq-subtext); font-size:13px;">
            Knowledge Graph not available.<br>
            <span style="font-size:11px; opacity:0.8;">Scan some conversations first to build the graph.</span>
          </div>`;
        return;
      }

      // Query the graph
      const graphResult = this.entityResolver.queryGraph(query, { limit: 15 });
      const stats = this.entityResolver.getStats();
      const crossPlatform = this.entityResolver.getCrossPlatformEntities(2);

      if (graphResult.entities.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:24px; color:var(--sq-subtext); font-size:13px;">
            No matching entities found for "${query.length > 50 ? query.slice(0, 50) + '...' : query}"<br>
            <span style="font-size:11px; opacity:0.8;">Graph has ${stats.totalEntities} entities across ${Object.keys(stats.entitiesByPlatform).length} platforms. Try different search terms.</span>
          </div>`;
        return;
      }

      // Build graph context for AI synthesis
      const graphContextParts = [];
      for (const ent of graphResult.entities.slice(0, 10)) {
        let line = `Entity: ${ent.name} (${ent.type})`;
        if (ent.description) line += ` — ${ent.description}`;
        line += ` | Mentions: ${ent.mentions} | Platforms: ${ent.platforms.join(', ')}`;
        if (ent.conversations.length > 0) {
          line += ` | Conversations: ${ent.conversations.length}`;
        }
        graphContextParts.push(line);
      }
      for (const rel of graphResult.relationships.slice(0, 10)) {
        graphContextParts.push(`Relationship: ${rel.source} ${rel.relation.replace(/_/g, ' ')} ${rel.target} (${rel.platforms.join(', ')})`);
      }

      const graphContext = graphContextParts.join('\n');

      // Build result HTML — entities section
      let html = `<div style="margin-bottom:12px;">`;

      // Stats bar
      html += `<div style="padding:8px 12px; background:rgba(0,212,255,0.08); border:1px solid rgba(0,212,255,0.2); border-radius:8px; margin-bottom:12px; font-size:11px; color:var(--sq-subtext); display:flex; gap:12px; flex-wrap:wrap;">
        <span>🧠 ${stats.totalEntities} entities</span>
        <span>🔗 ${stats.totalRelationships} relationships</span>
        <span>🌐 ${stats.crossPlatformEntities} cross-platform</span>
        <span>📊 ${graphResult.matchedNodes || graphResult.entities.length} matched</span>
      </div>`;

      // Entity cards
      for (const ent of graphResult.entities.slice(0, 10)) {
        const platformBadges = ent.platforms.map(p =>
          `<span style="display:inline-block; padding:1px 6px; border-radius:4px; font-size:10px; background:rgba(124,58,237,0.15); color:rgba(124,58,237,0.9); margin-right:4px;">${p.replace(/\.com$|\.ai$/, '')}</span>`
        ).join('');

        const typeColor = {
          framework: '#00D4FF', library: '#7C3AED', language: '#10A37F',
          tool: '#F59E0B', concept: '#6B7280', product: '#EF4444',
          person: '#EC4899', organization: '#8B5CF6', technology: '#3B82F6'
        }[ent.type] || '#6B7280';

        html += `<div style="padding:10px 12px; margin-bottom:8px; background:var(--sq-surface, rgba(255,255,255,0.04)); border:1px solid var(--sq-border, rgba(255,255,255,0.08)); border-radius:8px; border-left:3px solid ${typeColor};">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-weight:600; font-size:13px; color:var(--sq-text, #fff);">${ent.name}</span>
            <span style="font-size:10px; color:${typeColor}; text-transform:uppercase; font-weight:600;">${ent.type}</span>
          </div>
          ${ent.description ? `<div style="font-size:12px; color:var(--sq-subtext); margin-bottom:4px;">${ent.description}</div>` : ''}
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            ${platformBadges}
            <span style="font-size:10px; color:var(--sq-subtext);">${ent.mentions} mentions · ${ent.conversations.length} conversations</span>
          </div>
        </div>`;
      }

      // Relationships section
      if (graphResult.relationships.length > 0) {
        html += `<div style="margin-top:12px; padding:8px 12px; background:rgba(124,58,237,0.06); border:1px solid rgba(124,58,237,0.15); border-radius:8px;">
          <div style="font-size:11px; font-weight:600; color:var(--sq-subtext); margin-bottom:6px;">Relationships</div>`;
        for (const rel of graphResult.relationships.slice(0, 8)) {
          html += `<div style="font-size:12px; color:var(--sq-text); margin-bottom:4px;">
            <span style="font-weight:500;">${rel.source}</span>
            <span style="color:var(--sq-subtext); font-style:italic;"> ${rel.relation.replace(/_/g, ' ')} </span>
            <span style="font-weight:500;">${rel.target}</span>
            <span style="font-size:10px; color:var(--sq-subtext); margin-left:4px;">(${rel.platforms.join(', ')})</span>
          </div>`;
        }
        html += `</div>`;
      }

      html += `</div>`;

      // AI synthesis section
      html += `<div id="sq-graph-synthesis" style="margin-top:12px;">
        <div style="display:flex; flex-direction:column; align-items:center; gap:8px; padding:16px;">
          <div class="sq-shimmer" style="width:80%;height:10px;"></div>
          <div class="sq-shimmer" style="width:60%;height:10px;"></div>
          <div style="font-size:11px; color:var(--sq-subtext);">Synthesizing answer from knowledge graph...</div>
        </div>
      </div>`;

      container.innerHTML = html;

      // Request AI synthesis
      try {
        const synthResult = await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            type: 'graph_query_synthesize',
            payload: { query, graphContext }
          }, resolve);
        });

        const synthContainer = container.querySelector('#sq-graph-synthesis');
        if (synthResult && synthResult.ok && synthResult.result) {
          synthContainer.innerHTML = `
            <div style="padding:12px; background:rgba(0,212,255,0.06); border:1px solid rgba(0,212,255,0.15); border-radius:8px;">
              <div style="font-size:11px; font-weight:600; color:rgba(0,212,255,0.8); margin-bottom:6px;">🧠 AI Synthesis</div>
              <div style="font-size:13px; color:var(--sq-text); line-height:1.6; white-space:pre-wrap;">${synthResult.result}</div>
            </div>`;
        } else {
          synthContainer.innerHTML = `
            <div style="padding:8px 12px; background:rgba(255,255,255,0.03); border-radius:8px; font-size:12px; color:var(--sq-subtext);">
              Graph results shown above. Configure API key for AI synthesis.
            </div>`;
        }
      } catch (e) {
        const synthContainer = container.querySelector('#sq-graph-synthesis');
        if (synthContainer) {
          synthContainer.innerHTML = `
            <div style="padding:8px 12px; font-size:12px; color:var(--sq-subtext);">
              Graph search complete. AI synthesis unavailable.
            </div>`;
        }
      }
    }

    getContext() {
      try {
        if (window.pickAdapter) {
          const msgs = window.pickAdapter().getMessages();
          return msgs.slice(-5).map(m => `${m.role}: ${m.text}`).join('\n');
        }
      } catch (e) { }
      return '';
    }

    async callLlama(text) {
      return new Promise(resolve => {
        try {
          chrome.runtime.sendMessage({
            type: 'call_llama',
            payload: { action: 'prompt', text: text }
          }, res => {
            if (chrome.runtime.lastError) {
              this.showToast('Please configure your API key in ChatBridge Options');
              return resolve('');
            }
            if (res && res.ok) return resolve(res.result);
            // Friendly toast for any API error
            const msg = (res && res.error === 'no_api_key')
              ? 'Please configure your API key in ChatBridge Options'
              : (res && res.message) || 'Please configure your API key in ChatBridge Options';
            this.showToast(msg);
            return resolve('');
          });
        } catch (e) {
          this.showToast('Please configure your API key in ChatBridge Options');
          resolve('');
        }
      });
    }

    showToast(msg) {
      // Use existing page-level toast if available
      if (typeof window !== 'undefined' && typeof window.__cbToast === 'function') {
        window.__cbToast(msg);
        return;
      }
      // Fallback: inject a lightweight toast into the shadow root
      const root = this.container?.getRootNode?.() || document;
      let container = root.querySelector?.('#sq-toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'sq-toast-container';
        container.style.cssText = 'position:fixed;bottom:18px;left:18px;z-index:2147483647;display:flex;flex-direction:column-reverse;gap:8px;pointer-events:none;';
        (root === document ? document.body : root).appendChild(container);
      }
      const t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = `
        background:rgba(10,15,28,0.95);color:#E6E9F0;padding:10px 16px;border-radius:10px;
        border:1px solid rgba(0,212,255,0.25);box-shadow:0 4px 16px rgba(0,0,0,0.3);
        font-family:'Inter',system-ui,sans-serif;font-size:13px;font-weight:500;
        pointer-events:auto;max-width:320px;word-wrap:break-word;
        animation:cb-toast-slide-in 0.25s ease-out;
      `;
      container.appendChild(t);
      setTimeout(() => { try { t.remove(); } catch(e){} }, 3000);
    }

    formatText(text) {
      if (!text) return '';
      // Convert markdown-style formatting to HTML
      const lines = text.split('\n');
      let html = '';
      let inList = false;
      for (const line of lines) {
        const trimmed = line.trim();
        const bulletMatch = trimmed.match(/^[-•]\s+(.+)/);
        if (bulletMatch) {
          if (!inList) { html += '<ul style="margin:4px 0 4px 8px;padding-left:14px;">'; inList = true; }
          html += `<li>${bulletMatch[1]}</li>`;
        } else {
          if (inList) { html += '</ul>'; inList = false; }
          if (trimmed === '') { html += '<br>'; }
          else { html += `<p style="margin:3px 0;">${trimmed}</p>`; }
        }
      }
      if (inList) html += '</ul>';
      // Bold and italic
      html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
      html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
      return html;
    }

    announceToScreenReader(message) {
      const ariaLive = document.getElementById('sq-aria-live');
      if (ariaLive) {
        ariaLive.textContent = message;
      }
    }
  }

  // Export
  window.SmartQueryUI = SmartQueryUI;
  console.log('[ChatBridge] SmartQueryUI v3 (Enhanced) Loaded');

})();
