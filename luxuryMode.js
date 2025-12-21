// ChatBridge Luxury Mode - Apple Vision Pro Aesthetic
// Premium frosted-glass UI with glow effects and smooth animations

(function() {
  'use strict';

  class LuxuryMode {
    constructor(shadowRoot) {
      this.shadow = shadowRoot;
      this.isEnabled = false;
      this.loadPreference();
    }

    loadPreference() {
      try {
        const saved = localStorage.getItem('chatbridge:luxury_mode');
        this.isEnabled = saved === 'true';
      } catch (e) {
        this.isEnabled = false;
      }
    }

    savePreference() {
      try {
        localStorage.setItem('chatbridge:luxury_mode', String(this.isEnabled));
      } catch (e) {}
    }

    toggle() {
      this.isEnabled = !this.isEnabled;
      this.savePreference();
      this.apply();
      return this.isEnabled;
    }

    apply() {
      if (!this.shadow) return;

      const panel = this.shadow.querySelector('.cb-panel');
      if (!panel) return;

      if (this.isEnabled) {
        this.enableLuxuryStyles(panel);
      } else {
        this.disableLuxuryStyles(panel);
      }
    }

    enableLuxuryStyles(panel) {
      // Add luxury mode class
      panel.classList.add('cb-luxury-mode');

      // Inject luxury styles if not already present
      if (!this.shadow.querySelector('#cb-luxury-styles')) {
        const luxuryStyles = document.createElement('style');
        luxuryStyles.id = 'cb-luxury-styles';
        luxuryStyles.textContent = this.getLuxuryCSS();
        this.shadow.appendChild(luxuryStyles);
      }

      // Add floating particles background
      this.addFloatingParticles(panel);

      // Animate entrance
      panel.style.animation = 'cb-luxury-fade-in 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
    }

    disableLuxuryStyles(panel) {
      panel.classList.remove('cb-luxury-mode');
      
      // Remove particles
      const particles = panel.querySelector('.cb-luxury-particles');
      if (particles) particles.remove();

      // Remove luxury styles
      const luxuryStyleEl = this.shadow.querySelector('#cb-luxury-styles');
      if (luxuryStyleEl) luxuryStyleEl.remove();
    }

    addFloatingParticles(panel) {
      // Check if particles already exist
      if (panel.querySelector('.cb-luxury-particles')) return;

      const particlesContainer = document.createElement('div');
      particlesContainer.className = 'cb-luxury-particles';
      particlesContainer.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        overflow: hidden;
        border-radius: 16px;
        z-index: -1;
        background: transparent;
      `;

      // Create 20 floating particles
      for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        const size = Math.random() * 4 + 2;
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        const duration = Math.random() * 10 + 15;
        const delay = Math.random() * 5;

        particle.style.cssText = `
          position: absolute;
          width: ${size}px;
          height: ${size}px;
          background: radial-gradient(circle, rgba(127, 219, 255, 0.8), transparent);
          border-radius: 50%;
          left: ${x}%;
          top: ${y}%;
          animation: cb-luxury-float ${duration}s ease-in-out ${delay}s infinite;
          opacity: 0.3;
        `;
        particlesContainer.appendChild(particle);
      }

      panel.insertBefore(particlesContainer, panel.firstChild);
    }

    getLuxuryCSS() {
      return `
        @keyframes cb-luxury-fade-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes cb-luxury-float {
          0%, 100% {
            transform: translateY(0) translateX(0);
            opacity: 0.3;
          }
          25% {
            transform: translateY(-20px) translateX(10px);
            opacity: 0.5;
          }
          50% {
            transform: translateY(-40px) translateX(-10px);
            opacity: 0.3;
          }
          75% {
            transform: translateY(-20px) translateX(5px);
            opacity: 0.5;
          }
        }

        @keyframes cb-luxury-glow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(0, 122, 255, 0.4), 0 0 40px rgba(127, 219, 255, 0.2);
          }
          50% {
            box-shadow: 0 0 30px rgba(0, 122, 255, 0.6), 0 0 60px rgba(127, 219, 255, 0.3);
          }
        }

        @keyframes cb-luxury-shimmer {
          0% {
            background-position: -200% center;
          }
          100% {
            background-position: 200% center;
          }
        }

        /* Luxury Mode Panel - Apple Vision Pro aesthetic */
        .cb-panel.cb-luxury-mode {
          background: rgba(240, 245, 255, 0.7) !important;
          backdrop-filter: blur(60px) saturate(160%) !important;
          -webkit-backdrop-filter: blur(60px) saturate(160%) !important;
          border: 1px solid rgba(200, 220, 255, 0.4) !important;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 
                      0 0 0 1px rgba(255, 255, 255, 0.1) inset,
                      0 20px 80px rgba(100, 150, 255, 0.08) !important;
          position: fixed;
          top: 12px;
          right: 12px;
          width: 380px;
          max-height: 86vh;
          overflow-y: auto;
          overflow-x: hidden;
          border-radius: 24px;
          z-index: 2147483647;
          pointer-events: auto;
        }

        .cb-luxury-mode::before {
          content: '';
          position: absolute;
          top: -1px;
          left: -1px;
          right: -1px;
          bottom: -1px;
          background: linear-gradient(135deg, rgba(100, 180, 255, 0.15), rgba(80, 160, 255, 0.15));
          border-radius: 24px;
          z-index: -1;
          opacity: 0;
          transition: opacity 0.4s ease;
        }

        .cb-luxury-mode:hover::before {
          opacity: 0.6;
        }

        /* Luxury Header */
        .cb-luxury-mode .cb-header {
          background: transparent;
          backdrop-filter: none;
          border-radius: 16px;
          padding: 24px 20px 16px 20px;
          margin-bottom: 0;
          border: none;
          border-bottom: 1px solid rgba(200, 220, 255, 0.2);
        }

        .cb-luxury-mode .cb-title {
          color: rgba(60, 120, 200, 0.95) !important;
          font-size: 26px !important;
          font-weight: 700;
          letter-spacing: -0.8px;
          text-shadow: none;
        }

        .cb-luxury-mode .cb-subtitle {
          color: rgba(255, 255, 255, 0.7) !important;
          font-weight: 500;
        }

        /* Luxury Scan Button */
        .cb-luxury-mode .cb-scan-wide {
          background: linear-gradient(135deg, rgba(80, 160, 255, 0.9), rgba(100, 180, 255, 0.8)) !important;
          border: 1px solid rgba(120, 200, 255, 0.3) !important;
          box-shadow: 0 4px 16px rgba(80, 160, 255, 0.25), 
                      0 1px 0 rgba(255, 255, 255, 0.2) inset !important;
          font-size: 17px !important;
          font-weight: 600 !important;
          padding: 16px 24px !important;
          position: relative;
          overflow: hidden;
          color: rgba(255, 255, 255, 0.98) !important;
        }

        .cb-luxury-mode .cb-scan-wide::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
          transition: left 0.5s;
        }

        .cb-luxury-mode .cb-scan-wide:hover {
          animation: cb-luxury-glow 2s ease-in-out infinite;
          transform: translateY(-3px) scale(1.02);
        }

        .cb-luxury-mode .cb-scan-wide:hover::before {
          left: 100%;
        }

        .cb-luxury-mode .cb-scan-wide:active {
          transform: translateY(-1px) scale(0.98);
        }

        /* Luxury Action Buttons */
        .cb-luxury-mode .cb-btn {
          background: rgba(255, 255, 255, 0.08) !important;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          color: rgba(255, 255, 255, 0.9) !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }

        .cb-luxury-mode .cb-btn::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          border-radius: 50%;
          background: rgba(127, 219, 255, 0.4);
          transform: translate(-50%, -50%);
          transition: width 0.4s, height 0.4s;
        }

        .cb-luxury-mode .cb-btn:hover {
          background: rgba(255, 255, 255, 0.15) !important;
          border-color: rgba(127, 219, 255, 0.6) !important;
          box-shadow: 0 0 20px rgba(0, 122, 255, 0.4);
          transform: translateY(-3px) scale(1.05);
        }

        .cb-luxury-mode .cb-btn:hover::after {
          width: 300px;
          height: 300px;
        }

        .cb-luxury-mode .cb-btn:active {
          transform: translateY(-1px) scale(1.02);
        }

        /* Luxury Primary Button */
        .cb-luxury-mode .cb-btn-primary {
          background: rgba(0, 122, 255, 0.8) !important;
          border: 1px solid rgba(127, 219, 255, 0.4) !important;
          box-shadow: 0 0 20px rgba(0, 122, 255, 0.5);
        }

        .cb-luxury-mode .cb-btn-primary:hover {
          box-shadow: 0 0 30px rgba(0, 122, 255, 0.7), 
                      0 0 50px rgba(127, 219, 255, 0.4);
        }

        /* Luxury Selection Card */
        .cb-luxury-mode .cb-toolbar {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 12px;
          padding: 16px 20px;
          margin: 12px 0;
        }

        .cb-luxury-mode .cb-select {
          background: rgba(255, 255, 255, 0.08) !important;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          color: rgba(255, 255, 255, 0.9) !important;
          transition: all 0.3s;
        }

        .cb-luxury-mode .cb-select:hover,
        .cb-luxury-mode .cb-select:focus {
          background: rgba(255, 255, 255, 0.12) !important;
          border-color: rgba(127, 219, 255, 0.6) !important;
          box-shadow: 0 0 15px rgba(0, 122, 255, 0.3);
        }

        /* Luxury Internal Views */
        .cb-luxury-mode .cb-internal-view {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(15px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 14px;
          padding: 20px;
        }

        .cb-luxury-mode .cb-view-title {
          color: rgba(127, 219, 255, 0.95) !important;
          font-size: 18px;
          font-weight: 700;
        }

        .cb-luxury-mode .cb-view-text {
          background: rgba(255, 255, 255, 0.05) !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          color: rgba(255, 255, 255, 0.9) !important;
        }

        /* Luxury History */
        .cb-luxury-mode .cb-history {
          background: rgba(255, 255, 255, 0.05) !important;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
        }

        /* Luxury Scrollbars */
        .cb-luxury-mode ::-webkit-scrollbar-thumb {
          background: rgba(0, 122, 255, 0.6) !important;
          border-radius: 10px;
          box-shadow: 0 0 10px rgba(0, 122, 255, 0.5);
        }

        .cb-luxury-mode ::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05) !important;
          border-radius: 10px;
        }

        /* Luxury Tag Chips */
        .cb-luxury-mode .cb-tag-chip {
          background: rgba(0, 122, 255, 0.25) !important;
          color: rgba(255, 255, 255, 0.95) !important;
          border: 1px solid rgba(127, 219, 255, 0.5);
          box-shadow: 0 2px 8px rgba(0, 122, 255, 0.3);
        }

        /* Luxury Insights */
        .cb-luxury-mode .cb-insight-block {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          border-left: 3px solid rgba(127, 219, 255, 0.8);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        }

        /* Luxury Follow-up Items */
        .cb-luxury-mode .cb-followup-item {
          background: rgba(255, 255, 255, 0.06) !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .cb-luxury-mode .cb-followup-item:hover {
          background: rgba(255, 255, 255, 0.1) !important;
          border-color: rgba(127, 219, 255, 0.6) !important;
          box-shadow: 0 0 20px rgba(0, 122, 255, 0.4);
          transform: translateX(6px) scale(1.02);
        }

        .cb-luxury-mode .cb-followup-btn {
          background: rgba(0, 122, 255, 0.8) !important;
          border: 1px solid rgba(127, 219, 255, 0.4) !important;
          box-shadow: 0 2px 8px rgba(0, 122, 255, 0.4);
        }

        .cb-luxury-mode .cb-followup-btn:hover {
          box-shadow: 0 4px 12px rgba(0, 122, 255, 0.6);
          transform: scale(1.1);
        }

        /* Luxury Resize Handle */
        .cb-luxury-mode .cb-resize-handle {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          transition: all 0.3s;
        }

        .cb-luxury-mode .cb-resize-handle:hover {
          background: rgba(127, 219, 255, 0.2);
          border-color: rgba(127, 219, 255, 0.5);
          box-shadow: 0 0 15px rgba(0, 122, 255, 0.5);
        }

        /* Breathing animation for emphasis */
        @keyframes cb-luxury-breathe {
          0%, 100% {
            opacity: 0.85;
          }
          50% {
            opacity: 1;
          }
        }

        .cb-luxury-mode .cb-title {
          animation: cb-luxury-breathe 4s ease-in-out infinite;
        }
      `;
    }
  }

  // Export to window
  if (typeof window !== 'undefined') {
    window.LuxuryMode = LuxuryMode;
  }

})();
