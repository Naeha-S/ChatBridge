// agents.js - ChatBridge Agent Hub
// Houses 6 Specialized Agents with a Master RAG Engine and Cross-Agent Shadow Memory

(function() {
  'use strict';

  // ==========================================
  // 1. THEME & CSS DEFINITIONS
  // ==========================================
  const AGENT_CSS = `
:host {
  --ah-bg: #0f1629;
  --ah-surface: rgba(20, 24, 39, 0.85);
  --ah-text: #e2e8f0;
  --ah-subtext: #94a3b8;
  --ah-border: rgba(255, 255, 255, 0.1);
  --ah-accent-primary: #00D4FF;
  --ah-accent-secondary: #7C3AED;
  --ah-danger: #ef4444;
  --ah-success: #22c55e;
  --ah-warning: #f59e0b;
  --ah-radius: 12px;
  --ah-font: 'Inter', sans-serif;
  --ah-transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  --ah-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

/* Light Theme overrides */
:host(.cb-theme-light) .ah-wrapper {
  --ah-bg: #f8fafc;
  --ah-surface: #ffffff;
  --ah-text: #0f172a;
  --ah-subtext: #64748b;
  --ah-border: #e2e8f0;
  --ah-accent-primary: #0ea5e9;
  --ah-accent-secondary: #8b5cf6;
  --ah-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

/* Skeuomorphic Theme overrides */
:host(.cb-theme-skeuomorphic) .ah-wrapper {
  --ah-bg: #d2d2d2;
  --ah-surface: #e5e5e5;
  --ah-text: #1a1a1a;
  --ah-subtext: #4a4a4a;
  --ah-border: #a3a3a3;
  --ah-accent-primary: #3b82f6;
  --ah-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.8), 0 4px 6px rgba(0, 0, 0, 0.1);
}

/* Brutalism Theme overrides */
:host(.cb-theme-brutalism) .ah-wrapper {
  --ah-bg: #FFFBEB;
  --ah-surface: #ffffff;
  --ah-text: #000000;
  --ah-subtext: #333333;
  --ah-border: #000000;
  --ah-accent-primary: #FF6B9D;
  --ah-accent-secondary: #4ECDC4;
  --ah-shadow: 4px 4px 0 #000000;
  --ah-radius: 0px;
}

/* Synthwave Theme overrides */
:host(.cb-theme-synthwave) .ah-wrapper {
  --ah-bg: #0a0514;
  --ah-surface: #1e1136;
  --ah-text: #fdf2f8;
  --ah-subtext: #fbcfe8;
  --ah-border: #ec4899;
  --ah-accent-primary: #06b6d4;
  --ah-accent-secondary: #d946ef;
  --ah-shadow: 0 0 15px rgba(236, 72, 153, 0.3);
}

/* Glass Theme overrides */
:host(.cb-theme-glass) .ah-wrapper {
  --ah-bg: transparent;
  --ah-surface: rgba(255, 255, 255, 0.05);
  --ah-text: #f8fafc;
  --ah-subtext: #cbd5e1;
  --ah-border: rgba(255, 255, 255, 0.1);
  --ah-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.ah-wrapper {
  font-family: var(--ah-font);
  background: var(--ah-bg);
  color: var(--ah-text);
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

/* Header */
.ah-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--ah-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--ah-surface);
  flex-shrink: 0;
}

.ah-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--ah-accent-primary), var(--ah-accent-secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.ah-close-btn {
  background: transparent;
  border: none;
  color: var(--ah-subtext);
  cursor: pointer;
  font-size: 20px;
  transition: var(--ah-transition);
  padding: 4px;
}
.ah-close-btn:hover {
  color: var(--ah-text);
  transform: scale(1.1);
}

/* Main Container: Grid of Agents */
.ah-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Grid for selection */
.ah-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.ah-agent-card {
  background: var(--ah-surface);
  border: 1px solid var(--ah-border);
  border-radius: var(--ah-radius);
  padding: 16px;
  cursor: pointer;
  transition: var(--ah-transition);
  box-shadow: var(--ah-shadow);
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
}

.ah-agent-card:hover {
  transform: translateY(-2px);
  border-color: var(--ah-accent-primary);
  box-shadow: 0 8px 24px rgba(0, 212, 255, 0.15);
}

.ah-agent-icon {
  font-size: 24px;
  margin-bottom: 4px;
}

.ah-agent-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ah-text);
}

.ah-agent-desc {
  font-size: 11px;
  color: var(--ah-subtext);
  line-height: 1.4;
}

/* Active Agent View */
.ah-active-view {
  display: none;
  flex-direction: column;
  height: 100%;
}
.ah-active-view.active {
  display: flex;
}

.ah-active-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--ah-border);
  margin-bottom: 16px;
}

.ah-back-btn {
  background: var(--ah-surface);
  border: 1px solid var(--ah-border);
  color: var(--ah-text);
  border-radius: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: var(--ah-transition);
}
.ah-back-btn:hover {
  background: var(--ah-accent-primary);
  color: #fff;
  border-color: var(--ah-accent-primary);
}

.ah-active-title {
  font-size: 18px;
  font-weight: 700;
}

/* Content Area */
.ah-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ah-section {
  background: var(--ah-surface);
  border: 1px solid var(--ah-border);
  border-radius: var(--ah-radius);
  padding: 16px;
}

.ah-section-title {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ah-accent-primary);
  margin-bottom: 12px;
  font-weight: 700;
}
  
.ah-btn-primary {
  background: var(--ah-accent-primary);
  color: #000;
  border: none;
  padding: 10px 16px;
  border-radius: var(--ah-radius);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--ah-transition);
  width: 100%;
  margin-top: 10px;
}
.ah-btn-primary:hover {
  filter: brightness(1.1);
  box-shadow: 0 4px 12px rgba(0, 212, 255, 0.3);
}

.ah-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 0;
  color: var(--ah-subtext);
  font-size: 13px;
  gap: 12px;
}

.ah-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--ah-border);
  border-top-color: var(--ah-accent-primary);
  border-radius: 50%;
  animation: ah-spin 1s linear infinite;
}

@keyframes ah-spin {
  to { transform: rotate(360deg); }
}

.ah-result-card {
  font-size: 13px;
  line-height: 1.6;
  color: var(--ah-text);
}

.ah-evidence-tag {
  display: inline-block;
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(0, 212, 255, 0.1);
  color: var(--ah-accent-primary);
  border: 1px solid rgba(0, 212, 255, 0.2);
  border-radius: 4px;
  margin-right: 4px;
  margin-bottom: 4px;
}

.ah-markdown-content h3 { font-size: 14px; margin-top: 12px; margin-bottom: 8px; color: var(--ah-text); }
.ah-markdown-content p { margin-bottom: 8px; }
.ah-markdown-content ul { padding-left: 20px; margin-bottom: 12px; }
.ah-markdown-content li { margin-bottom: 4px; }
`;

  // ==========================================
  // 2. MASTER RAG ENGINE (Agent Context Router)
  // ==========================================
  
  class AgentRAGEngine {
    constructor() {
      // Make sure MemoryRetrieval is available
      this.isReady = typeof window.MemoryRetrieval !== 'undefined';
    }

    /**
     * Retrieve context tailored for a specific agent
     */
    async retrieveContextForAgent(agentType, query = '') {
      if (!this.isReady && typeof window.MemoryRetrieval !== 'undefined') {
        this.isReady = true;
      }

      if (!this.isReady) {
        throw new Error('MemoryRetrieval system is not initialized.');
      }

      // Base query analysis
      let options = {
        limit: 15,
        threshold: 0.65
      };

      // Agent-specific retrieval weighting and filtering
      // This is the core "Layer One: Memory Specialization"
      switch (agentType) {
        case 'catch_me_up':
          // Chronology matters most. High relevance threshold.
          options.sortBy = 'date_desc';
          options.limit = 20;
          options.intentBias = window.INTENT_TYPES ? window.INTENT_TYPES.FACT_RETRIEVAL : 'fact_retrieval';
          break;
          
        case 'second_opinion':
          // Evidence diversity matters. Look for different sources/platforms.
          options.diversityBoost = true;
          options.limit = 10;
          break;
          
        case 'prepare_me':
          // Look for unresolved questions and constraints
          options.intentBias = window.INTENT_TYPES ? window.INTENT_TYPES.PROBLEM_SOLVING : 'problem_solving';
          break;
          
        case 'track_this':
          // Specific topic tracking
          options.strictKeywordMatch = true;
          break;

        case 'handoff':
          // Comprehensive, strict threshold to avoid hallucination
          options.threshold = 0.75;
          break;
      }

      // Execute hybrid search through existing MemoryRetrieval
      let results = [];
      try {
        if (window.MemoryRetrieval && typeof window.MemoryRetrieval.search === 'function') {
           results = await window.MemoryRetrieval.search(query || 'recent context', options);
        } else {
           // Fallback if full search isn't ready
           console.warn('MemoryRetrieval full API missing, using fallback');
           const convs = await window.StorageManager.getConversations();
           results = convs.slice(0, 5).map(c => ({
             segment: { text: c.messages && c.messages.length ? c.messages[c.messages.length-1].text : 'Empty' },
             relevanceScore: 0.8,
             conversationId: c.id
           }));
        }
      } catch (e) {
        console.error('AgentRAGEngine retrieval error:', e);
      }

      return this.formatContextForAgent(results, agentType);
    }

    /**
     * Format context into a strict text block for the LLM
     */
    formatContextForAgent(results, agentType) {
      if (!results || results.length === 0) {
        return "No relevant context found in recent memory.";
      }

      // Deduplicate results and structure with provenance
      const seen = new Set();
      let contextStr = "### RETRIEVED CONTEXT (High Confidence)\n\n";
      
      results.slice(0, 10).forEach((res, i) => {
        const text = res.segment ? res.segment.text : '';
        // Deduplicate
        const hash = text.substring(0, 50);
        if (seen.has(hash)) return;
        seen.add(hash);
        
        // Agent aware formatting
        const score = Math.round((res.relevanceScore || 0.8) * 100);
        const source = (res.segment && res.segment.platform) ? res.segment.platform : 'History';
        
        contextStr += `[Source: ${source} | Confidence: ${score}%]\n`;
        contextStr += `"${text.substring(0, 500)}..."\n\n`;
      });
      
      return contextStr;
    }
  }

  // ==========================================
  // 3. THE AGENT HUB UI SYSTEM
  // ==========================================

  class AgentHub {
    constructor() {
      this.ragEngine = new AgentRAGEngine();
      this.activeAgent = null;
      this.agents = [
        { id: 'catch_me_up', name: 'Catch Me Up', icon: '⏱️', desc: 'Chronological timeline of recent decisions.' },
        { id: 'prepare_me', name: 'Prepare Me', icon: '🧠', desc: 'Predictive context and readiness signals.' },
        { id: 'track_this', name: 'Track This', icon: '🎯', desc: 'Evolving topic timeline and signal detection.' },
        { id: 'second_opinion', name: 'Second Opinion', icon: '⚖️', desc: 'Evidence comparison and contradiction checks.' },
        { id: 'handoff', name: 'Handoff', icon: '📋', desc: 'Structured, transferable briefing generation.' },
        { id: 'my_pulse', name: 'My Pulse', icon: '📊', desc: 'Usage analytics and behavioral trends.' },
      ];
      this.panel = null;
    }

    init(hostElement, shadowRoot) {
      this.hostElement = hostElement;
      this.shadowRoot = shadowRoot;

      // Inject CSS
      const style = document.createElement('style');
      style.textContent = AGENT_CSS;
      this.shadowRoot.appendChild(style);

      // Create UI Wrapper
      this.panel = document.createElement('div');
      this.panel.className = 'ah-wrapper';
      this.renderMainView();

      this.shadowRoot.appendChild(this.panel);
      
      // Sync theme with host
      this.syncTheme();
      const observer = new MutationObserver(() => this.syncTheme());
      observer.observe(this.hostElement, { attributes: true, attributeFilter: ['class'] });
    }

    syncTheme() {
      const cls = this.hostElement.className;
      this.hostElement.className = cls; // Force re-eval if needed
    }

    renderMainView() {
      this.activeAgent = null;
      let gridHtml = '';
      
      this.agents.forEach(a => {
        gridHtml += `
          <div class="ah-agent-card" data-agent="${a.id}">
            <div class="ah-agent-icon">${a.icon}</div>
            <div class="ah-agent-name">${a.name}</div>
            <div class="ah-agent-desc">${a.desc}</div>
          </div>
        `;
      });

      this.panel.innerHTML = `
        <div class="ah-header">
          <div class="ah-header-title">
            <span>🤖</span>
            <span>Agent Hub</span>
          </div>
          <button class="ah-close-btn" id="ah-close">&times;</button>
        </div>
        <div class="ah-container" id="ah-main-container">
          <div style="font-size: 13px; color: var(--ah-subtext); margin-bottom: 8px;">
            Select a specialized agent context retrieval task.
          </div>
          <div class="ah-grid">
            ${gridHtml}
          </div>
        </div>
        <div class="ah-container ah-active-view" id="ah-active-view" style="display:none;">
          <!-- Active agent injected here -->
        </div>
      `;

      // Events
      this.panel.querySelector('#ah-close').addEventListener('click', () => {
        if (this.hostElement) this.hostElement.style.display = 'none';
      });

      this.panel.querySelectorAll('.ah-agent-card').forEach(card => {
        card.addEventListener('click', () => {
          this.openAgent(card.dataset.agent);
        });
      });
    }

    openAgent(agentId) {
      this.activeAgent = this.agents.find(a => a.id === agentId);
      
      const mainContainer = this.panel.querySelector('#ah-main-container');
      const activeView = this.panel.querySelector('#ah-active-view');
      
      mainContainer.style.display = 'none';
      activeView.style.display = 'flex';
      
      activeView.innerHTML = `
        <div class="ah-active-header">
          <button class="ah-back-btn" id="ah-back">←</button>
          <div class="ah-active-title">${this.activeAgent.icon} ${this.activeAgent.name}</div>
        </div>
        <div class="ah-content">
          <div class="ah-section">
            <div class="ah-section-title">Agent Readiness</div>
            <div style="font-size: 13px; color: var(--ah-subtext); margin-bottom: 12px;">
              ${this.activeAgent.desc}
            </div>
            <button class="ah-btn-primary" id="ah-run-agent">Run Agent</button>
          </div>
          <div id="ah-results-container"></div>
        </div>
      `;

      activeView.querySelector('#ah-back').addEventListener('click', () => {
        this.renderMainView();
      });

      activeView.querySelector('#ah-run-agent').addEventListener('click', () => {
        this.executeAgent(agentId);
      });
    }

    async executeAgent(agentId) {
      const resultsContainer = this.panel.querySelector('#ah-results-container');
      const btn = this.panel.querySelector('#ah-run-agent');
      
      btn.disabled = true;
      btn.textContent = 'Running...';
      resultsContainer.innerHTML = `
        <div class="ah-section">
          <div class="ah-loading">
            <div class="ah-spinner"></div>
            <div>Retrieving context & running ${this.activeAgent.name}...</div>
          </div>
        </div>
      `;

      try {
        // 1. Retrieve specific context weighting
        const contextStr = await this.ragEngine.retrieveContextForAgent(agentId, '');
        
        // 2. Draft prompt for the LLM based on "Reasoning Scaffold"
        const prompt = this.buildAgentPrompt(agentId, contextStr);
        
        // 3. Call AI
        let aiResult = 'No AI endpoint configured. Showing raw context:\n\n' + contextStr;
        
        if (window.AISummaryEngine && typeof window.AISummaryEngine === 'function') {
           const engine = new window.AISummaryEngine();
           // Try to use full engine if available
           try {
              const res = await engine.callAI({
                action: 'summarize',
                text: prompt,
                style: 'professional'
              });
              if (res) aiResult = res;
           } catch(e) { console.warn("AI Engine failed, falling back"); }
        }

        // 4. Update Shadow Memory (Signal Bus)
        this.emitShadowSignal(agentId, aiResult);

        // 5. Render Output
        resultsContainer.innerHTML = `
          <div class="ah-section">
            <div class="ah-section-title">Output Analysis</div>
            <div class="ah-result-card ah-markdown-content">
               ${this.formatMarkdown(aiResult)}
            </div>
            <button id="ah-insert-btn" class="ah-btn-primary" style="background: rgba(255,255,255,0.05); border: 1px solid var(--ah-border); color: var(--ah-white); margin-top: 16px;">Insert to Chat</button>
          </div>
        `;
        
        const insertBtn = resultsContainer.querySelector('#ah-insert-btn');
        if (insertBtn) {
          insertBtn.addEventListener('click', () => {
            if (typeof window.insertTextToChat === 'function') {
              const success = window.insertTextToChat(aiResult);
              if (success) {
                insertBtn.textContent = 'Inserted!';
                setTimeout(() => insertBtn.textContent = 'Insert to Chat', 2000);
              } else {
                navigator.clipboard.writeText(aiResult);
                insertBtn.textContent = 'Copied to Keyboard!';
                setTimeout(() => insertBtn.textContent = 'Insert to Chat', 2000);
              }
            } else {
              navigator.clipboard.writeText(aiResult);
              insertBtn.textContent = 'Copied to Clipboard!';
              setTimeout(() => insertBtn.textContent = 'Insert to Chat', 2000);
            }
          });
        }

        // Reset button
        btn.disabled = false;
        btn.textContent = 'Run Agent Again';

      } catch (err) {
        resultsContainer.innerHTML = `
          <div class="ah-section" style="border-color: var(--ah-danger);">
            <div style="color: var(--ah-danger); font-size: 13px;">Error: ${err.message}</div>
          </div>
        `;
        btn.disabled = false;
        btn.textContent = 'Retry';
      }
    }

    /**
     * Agent-Specific Reasoning Scaffolds
     */
    buildAgentPrompt(agentId, contextStr) {
      let systemPrompt = '';
      
      switch (agentId) {
        case 'catch_me_up':
          systemPrompt = `You are a timeline specialist. From the context provided, identify the sequence of events and the key decisions made. Do not hallucinate.`;
          break;
        case 'second_opinion':
          systemPrompt = `You are an evidence verifier. Look for contradictions or missing facts in the provided context. Compare different statements. Note any uncertainty.`;
          break;
        case 'prepare_me':
          systemPrompt = `Create a predictive context summary. Highlight what risks are present, what information is missing, and what actions need readiness.`;
          break;
        case 'handoff':
          systemPrompt = `Restructure this context into a transferable briefing format: 1. Core Goal. 2. Current State. 3. Open Issues. 4. Next Actions.`;
          break;
        case 'track_this':
          systemPrompt = `Extract the evolving topic timeline. Identify what changed and what signals exist about future actions.`;
          break;
        case 'my_pulse':
          systemPrompt = `Perform usage analytics based on the provided session context. Identify behavioral trends.`;
          break;
      }
      
      return `${systemPrompt}\n\nCONTEXT:\n${contextStr}`;
    }

    /**
     * Cross-Agent Shadow Memory Bus
     */
    async emitShadowSignal(agentId, result) {
      if (window.StorageManager && typeof window.StorageManager.appendShadowSignal === 'function') {
         // Create a highly compressed signal string
         const signal = `[${agentId.toUpperCase()}] ${result.substring(0, 100)}...`;
         await window.StorageManager.appendShadowSignal({
           agent: agentId,
           signal: signal,
           timestamp: Date.now()
         });
      }
    }

    formatMarkdown(text) {
      if (!text) return '';
      let html = text
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br/>')
        .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
        .replace(/### (.*?)(<br\/>|$)/g, '<h3>$1</h3>')
        .replace(/- (.*?)<br\/>/g, '<li>$1</li>');
        
      if (html.includes('<li>')) {
        html = '<ul>' + html + '</ul>';
      }
        
      return '<p>' + html + '</p>';
    }
  }

  // Define custom element to host Agent Hub in Shadow DOM
  class ChatBridgeAgentHub extends HTMLElement {
    constructor() {
      super();
      this.root = this.attachShadow({ mode: 'open' });
      this.app = new AgentHub();
    }
    
    connectedCallback() {
      this.app.init(this, this.root);
    }
  }

  // Register Custom Element
  if (!customElements.get('cb-agent-hub')) {
    customElements.define('cb-agent-hub', ChatBridgeAgentHub);
  }

  // Export so 'content_script.js' can summon it
  window.renderAgentHubCore = function() {
    let host = document.getElementById('cb-agent-hub-host');
    if (!host) {
      host = document.createElement('cb-agent-hub');
      host.id = 'cb-agent-hub-host';
      host.className = window.__CB_CURRENT_THEME || 'cb-theme-glass'; // Inherit theme
      
      // Styling to match smartQueries floating window
      host.style.cssText = `
        position: fixed;
        bottom: 90px;
        right: 20px;
        width: 380px;
        height: 600px;
        max-height: calc(100vh - 120px);
        z-index: 2147483647;
        pointer-events: auto;
        border-radius: 14px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        display: block;
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
      `;
      
      document.body.appendChild(host);
    } else {
      host.style.display = host.style.display === 'none' ? 'block' : 'none';
      if (host.style.display === 'block') {
         // Sync theme again when re-opened
         host.className = window.__CB_CURRENT_THEME || 'cb-theme-glass';
      }
    }
  }

})();
