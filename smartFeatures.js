// smartFeatures.js - Smart Context Injection, AI Summaries, Universal Clipboard, Knowledge Base

(function () {
  'use strict';

  // ============================================
  // SMART CONTEXT INJECTION
  // ============================================
  class SmartContextInjection {
    constructor() {
      this.suggestions = [];
      this.panel = null;
      this.lastQuery = '';
      this.debounceTimer = null;
      this.isActive = false;
    }

    // Initialize context injection for a given input element
    init(inputElement, shadowRoot) {
      if (!inputElement || !shadowRoot) return;

      // Create floating suggestion panel
      this.panel = this.createSuggestionPanel(shadowRoot);

      // Listen to input changes
      inputElement.addEventListener('input', (e) => {
        this.handleInput(e.target);
      });

      // Listen to focus/blur
      inputElement.addEventListener('focus', () => {
        if (this.suggestions.length > 0) {
          this.showPanel();
        }
      });

      inputElement.addEventListener('blur', () => {
        // Delay hiding to allow click on suggestions
        setTimeout(() => this.hidePanel(), 200);
      });
    }

    createSuggestionPanel(shadowRoot) {
      const panel = document.createElement('div');
      panel.id = 'cb-context-panel';
      panel.className = 'cb-context-panel';
      panel.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 12px;
        width: 340px;
        max-height: 400px;
        overflow-y: auto;
        background: var(--cb-bg2);
        border: 1px solid var(--cb-border);
        border-radius: 12px;
        box-shadow: 0 12px 40px var(--cb-shadow);
        display: none;
        z-index: 2147483646;
        padding: 12px;
      `;

      shadowRoot.appendChild(panel);
      return panel;
    }

    handleInput(input) {
      clearTimeout(this.debounceTimer);
      const query = input.value || input.textContent || '';

      if (query.length < 3) {
        this.hidePanel();
        return;
      }

      // Debounce for 300ms
      this.debounceTimer = setTimeout(async () => {
        await this.fetchSuggestions(query);
        if (this.suggestions.length > 0) {
          this.renderSuggestions();
          this.showPanel();
        } else {
          this.hidePanel();
        }
      }, 300);
    }

    async fetchSuggestions(query) {
      this.lastQuery = query;
      this.suggestions = [];

      try {
        // Use RAG engine to find relevant past chats
        if (typeof window.RAGEngine !== 'undefined' && window.RAGEngine.search) {
          const results = await window.RAGEngine.search(query, { limit: 5 });
          this.suggestions = results.map(r => ({
            type: 'chat',
            title: r.title || 'Past conversation',
            snippet: r.text || '',
            score: r.score || 0,
            data: r
          }));
        }

        // Add code snippets from localStorage if available
        try {
          const clipboardData = JSON.parse(localStorage.getItem('chatbridge:clipboard') || '[]');
          const codeSnippets = clipboardData.filter(item =>
            item.type === 'code' &&
            item.content.toLowerCase().includes(query.toLowerCase())
          ).slice(0, 3);

          this.suggestions.push(...codeSnippets.map(s => ({
            type: 'code',
            title: 'Code snippet',
            snippet: s.content.slice(0, 100) + '...',
            data: s
          })));
        } catch (e) { }

        // Sort by relevance
        this.suggestions.sort((a, b) => (b.score || 0) - (a.score || 0));
      } catch (e) {
        console.error('[SmartContext] Failed to fetch suggestions:', e);
      }
    }

    renderSuggestions() {
      if (!this.panel) return;

      const html = `
        <div style="font-size: 12px; color: var(--cb-subtext); margin-bottom: 8px; font-weight: 600;">
          💡 Suggested Context
        </div>
        ${this.suggestions.map((s, idx) => `
          <div class="cb-suggestion-item" data-idx="${idx}" style="
            padding: 10px;
            margin-bottom: 8px;
            background: var(--cb-bg3);
            border: 1px solid var(--cb-border);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
          ">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
              <span style="font-size: 10px;">${s.type === 'chat' ? '💬' : '📝'}</span>
              <span style="font-size: 11px; font-weight: 600; color: var(--cb-white);">
                ${s.title}
              </span>
            </div>
            <div style="font-size: 11px; color: var(--cb-subtext); line-height: 1.4;">
              ${s.snippet}
            </div>
          </div>
        `).join('')}
      `;

      this.panel.innerHTML = html;

      // Add click handlers
      this.panel.querySelectorAll('.cb-suggestion-item').forEach(item => {
        item.addEventListener('mouseenter', (e) => {
          e.target.style.borderColor = 'var(--cb-accent-primary)';
          e.target.style.transform = 'translateY(-1px)';
        });
        item.addEventListener('mouseleave', (e) => {
          e.target.style.borderColor = 'var(--cb-border)';
          e.target.style.transform = 'translateY(0)';
        });
        item.addEventListener('click', (e) => {
          const idx = parseInt(e.currentTarget.dataset.idx);
          this.insertSuggestion(idx);
        });
      });
    }

    insertSuggestion(index) {
      const suggestion = this.suggestions[index];
      if (!suggestion) return;

      // Find the active input and insert
      const input = this.findActiveInput();
      if (!input) return;

      const textToInsert = suggestion.data.text || suggestion.data.content || suggestion.snippet;

      if (input.isContentEditable) {
        input.focus();
        const currentText = input.textContent || '';
        input.textContent = currentText + '\n\n' + textToInsert;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        input.focus();
        const currentValue = input.value || '';
        input.value = currentValue + '\n\n' + textToInsert;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      this.hidePanel();
      this.showToast('Context inserted');
    }

    findActiveInput() {
      // Try adapter first
      try {
        const adapter = window.pickAdapter ? window.pickAdapter() : null;
        if (adapter && adapter.getInput) {
          const input = adapter.getInput();
          if (input) return input;
        }
      } catch (e) { }

      // Fallback to document query
      const inputs = document.querySelectorAll('textarea, [contenteditable="true"]');
      for (const inp of inputs) {
        if (inp.offsetWidth > 0 && inp.offsetHeight > 0) {
          return inp;
        }
      }
      return null;
    }

    showPanel() {
      if (this.panel) {
        this.panel.style.display = 'block';
        this.isActive = true;
      }
    }

    hidePanel() {
      if (this.panel) {
        this.panel.style.display = 'none';
        this.isActive = false;
      }
    }

    showToast(message) {
      if (typeof window.toast === 'function') {
        window.toast(message);
      }
    }
  }

  // ============================================
  // AI-POWERED SUMMARIES & ACTION ITEMS
  // ============================================
  class AISummaryEngine {
    constructor() {
      this.lastSummary = null;
    }

    async generateInsights(messages) {
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return null;
      }

      const conversationText = messages
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
        .join('\n\n');

      try {
        // Extract insights using AI
        const insights = {
          summary: await this.generateSummary(conversationText),
          todos: this.extractTodos(conversationText),
          followUps: this.generateFollowUpQuestions(conversationText, messages),
          links: this.extractLinks(conversationText),
          keyTopics: await this.extractTopics(conversationText)
        };

        this.lastSummary = insights;
        return insights;
      } catch (e) {
        console.error('[AISummary] Failed to generate insights:', e);
        return null;
      }
    }

    async generateSummary(text) {
      // Use Gemini or OpenAI to generate summary
      try {
        const payload = {
          prompt: `Summarize this conversation in 2-3 concise sentences:\n\n${text.slice(0, 4000)}`,
          maxTokens: 150
        };

        const response = await this.callAI(payload);
        return response || 'Summary unavailable';
      } catch (e) {
        return 'Summary unavailable';
      }
    }

    extractTodos(text) {
      const todos = [];
      const lines = text.split('\n');
      const todoPatterns = [
        /(?:TODO|To-do|Task|Action item):\s*(.+)/gi,
        /(?:Need to|Should|Must|Remember to)\s+(.+)/gi,
        /^[-•*]\s*(.+)$/gm
      ];

      for (const pattern of todoPatterns) {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
          if (match[1] && match[1].length > 5 && match[1].length < 200) {
            todos.push(match[1].trim());
          }
        }
      }

      return [...new Set(todos)].slice(0, 10);
    }

    generateFollowUpQuestions(text, messages) {
      // Generate intelligent follow-up questions based on conversation
      const followUps = [];
      const lastUserMsg = messages.filter(m => m.role === 'user').slice(-1)[0];
      const lastAssistantMsg = messages.filter(m => m.role === 'assistant').slice(-1)[0];

      if (!lastUserMsg || !lastAssistantMsg) return [];

      // Pattern-based follow-up generation
      const patterns = [
        { match: /how (to|do|can)/i, followUp: 'Can you show me a specific example?' },
        { match: /what (is|are)/i, followUp: 'How does this compare to alternatives?' },
        { match: /why/i, followUp: 'Are there any exceptions to this?' },
        { match: /code|implement|build/i, followUp: 'What are the potential issues I should watch for?' },
        { match: /error|bug|issue/i, followUp: 'How can I prevent this in the future?' }
      ];

      for (const pattern of patterns) {
        if (pattern.match.test(lastUserMsg.text)) {
          followUps.push(pattern.followUp);
          if (followUps.length >= 3) break;
        }
      }

      // Default follow-ups if none matched
      if (followUps.length === 0) {
        followUps.push('Can you elaborate on that?');
        followUps.push('What are the best practices here?');
        followUps.push('Are there any common pitfalls?');
      }

      return followUps.slice(0, 3);
    }

    extractLinks(text) {
      const links = [];
      const urlPattern = /(https?:\/\/[^\s]+)/g;
      const matches = text.matchAll(urlPattern);

      for (const match of matches) {
        links.push(match[1]);
      }

      return [...new Set(links)].slice(0, 10);
    }

    async extractTopics(text) {
      // Simple keyword extraction - can be enhanced with TF-IDF
      const words = text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 4);

      const frequency = {};
      for (const word of words) {
        frequency[word] = (frequency[word] || 0) + 1;
      }

      const commonWords = new Set(['about', 'would', 'could', 'should', 'there', 'their', 'where', 'which', 'these', 'those']);

      return Object.entries(frequency)
        .filter(([word]) => !commonWords.has(word))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word]) => word);
    }

    async callAI(payload) {
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({
            type: 'call_gemini',
            payload
          }, (response) => {
            if (response && response.ok && response.result) {
              resolve(response.result);
            } else {
              resolve(null);
            }
          });
        } catch (e) {
          resolve(null);
        }
      });
    }

    renderInsights(insights, container) {
      if (!insights || !container) return;

      const html = `
        <div class="cb-insights-section">
          <div class="cb-insight-block">
            <div class="cb-insight-title">📝 Summary</div>
            <div class="cb-insight-content">${insights.summary}</div>
          </div>

          ${insights.todos && insights.todos.length > 0 ? `
            <div class="cb-insight-block">
              <div class="cb-insight-title">✅ Action Items</div>
              <ul class="cb-insight-list">
                ${insights.todos.map(todo => `<li>${todo}</li>`).join('')}
              </ul>
            </div>
          ` : ''}

          ${insights.followUps && insights.followUps.length > 0 ? `
            <div class="cb-insight-block">
              <div class="cb-insight-title">� Follow-up Questions</div>
              <div class="cb-followup-list">
                ${insights.followUps.map((q, idx) => `
                  <div class="cb-followup-item" data-question="${this.escapeHtml(q)}">
                    <span class="cb-followup-icon">💬</span>
                    <span class="cb-followup-text">${q}</span>
                    <button class="cb-followup-btn" title="Ask this question">→</button>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          ${insights.links && insights.links.length > 0 ? `
            <div class="cb-insight-block">
              <div class="cb-insight-title">🔗 Links</div>
              <ul class="cb-insight-list">
                ${insights.links.map(link => `
                  <li><a href="${link}" target="_blank" style="color: var(--cb-accent-primary); text-decoration: none;">${link}</a></li>
                `).join('')}
              </ul>
            </div>
          ` : ''}

          ${insights.keyTopics && insights.keyTopics.length > 0 ? `
            <div class="cb-insight-block">
              <div class="cb-insight-title">🏷️ Key Topics</div>
              <div class="cb-tag-row">
                ${insights.keyTopics.map(topic => `
                  <span class="cb-tag-chip">${topic}</span>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      `;

      container.innerHTML = html;

      // Add click handlers for follow-up questions
      container.querySelectorAll('.cb-followup-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const item = e.target.closest('.cb-followup-item');
          const question = item.dataset.question;
          if (question && typeof window.restoreToChat === 'function') {
            await window.restoreToChat(question, []);
            this.showToast('Question inserted');
          } else if (question && typeof restoreToChatFunction === 'function') {
            await restoreToChatFunction(question, []);
            this.showToast('Question inserted');
          }
        });
      });
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  // ============================================
  // UNIVERSAL AI CLIPBOARD
  // ============================================
  class UniversalClipboard {
    constructor() {
      this.items = [];
      this.maxItems = 50;
      this.storageKey = 'chatbridge:clipboard';
      this.loadFromStorage();
    }

    loadFromStorage() {
      try {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) {
          this.items = JSON.parse(stored);
        }
      } catch (e) {
        console.error('[Clipboard] Failed to load:', e);
        this.items = [];
      }
    }

    saveToStorage() {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.items));
      } catch (e) {
        console.error('[Clipboard] Failed to save:', e);
      }
    }

    addItem(item) {
      const newItem = {
        id: Date.now() + Math.random(),
        timestamp: Date.now(),
        type: item.type || 'text',
        content: item.content || '',
        metadata: item.metadata || {},
        source: item.source || window.location.hostname
      };

      this.items.unshift(newItem);
      if (this.items.length > this.maxItems) {
        this.items = this.items.slice(0, this.maxItems);
      }

      this.saveToStorage();
      return newItem;
    }

    removeItem(id) {
      this.items = this.items.filter(item => item.id !== id);
      this.saveToStorage();
    }

    clearAll() {
      this.items = [];
      this.saveToStorage();
    }

    getItems() {
      return this.items;
    }

    renderClipboard(container) {
      if (!container) return;

      const html = `
        <div class="cb-clipboard-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div style="font-size: 12px; color: var(--cb-subtext); font-weight: 600;">
            📋 Clipboard (${this.items.length})
          </div>
          <button class="cb-btn cb-btn-danger" id="cb-clear-clipboard" style="padding: 4px 10px; font-size: 11px;">
            Clear All
          </button>
        </div>
        <div class="cb-clipboard-items" style="max-height: 400px; overflow-y: auto;">
          ${this.items.length === 0 ? `
            <div style="text-align: center; padding: 40px 20px; color: var(--cb-subtext); font-size: 13px;">
              No clipboard items yet.<br>
              <span style="font-size: 11px; opacity: 0.8;">Copy text, code, or images to add them here.</span>
            </div>
          ` : this.items.map(item => `
            <div class="cb-clipboard-item" data-id="${item.id}" style="
              padding: 12px;
              margin-bottom: 10px;
              background: var(--cb-bg3);
              border: 1px solid var(--cb-border);
              border-radius: 8px;
              cursor: pointer;
              transition: all 0.2s ease;
            ">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span>${this.getTypeIcon(item.type)}</span>
                  <span style="font-size: 11px; color: var(--cb-subtext);">
                    ${this.formatTimestamp(item.timestamp)}
                  </span>
                </div>
                <div style="display: flex; gap: 4px;">
                  <button class="cb-copy-clip" data-id="${item.id}" style="
                    padding: 3px 8px;
                    font-size: 10px;
                    background: var(--cb-bg);
                    border: 1px solid var(--cb-border);
                    border-radius: 4px;
                    color: var(--cb-white);
                    cursor: pointer;
                  ">Copy</button>
                  <button class="cb-insert-clip" data-id="${item.id}" style="
                    padding: 3px 8px;
                    font-size: 10px;
                    background: var(--cb-accent-primary);
                    border: none;
                    border-radius: 4px;
                    color: white;
                    cursor: pointer;
                  ">Insert</button>
                  <button class="cb-remove-clip" data-id="${item.id}" style="
                    padding: 3px 8px;
                    font-size: 10px;
                    background: transparent;
                    border: 1px solid rgba(255, 30, 86, 0.5);
                    border-radius: 4px;
                    color: #FF7A9A;
                    cursor: pointer;
                  ">×</button>
                </div>
              </div>
              <div style="font-size: 12px; color: var(--cb-white); line-height: 1.4; word-break: break-word;">
                ${this.truncateContent(item.content, 200)}
              </div>
              ${item.source ? `
                <div style="font-size: 10px; color: var(--cb-subtext); margin-top: 4px;">
                  From: ${item.source}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      `;

      container.innerHTML = html;

      // Add event listeners
      container.querySelectorAll('.cb-clipboard-item').forEach(item => {
        item.addEventListener('mouseenter', (e) => {
          e.currentTarget.style.borderColor = 'var(--cb-accent-primary)';
        });
        item.addEventListener('mouseleave', (e) => {
          e.currentTarget.style.borderColor = 'var(--cb-border)';
        });
      });

      const clearBtn = container.querySelector('#cb-clear-clipboard');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          if (confirm('Clear all clipboard items?')) {
            this.clearAll();
            this.renderClipboard(container);
          }
        });
      }

      container.querySelectorAll('.cb-copy-clip').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = parseFloat(e.target.dataset.id);
          const item = this.items.find(i => i.id === id);
          if (item) {
            this.copyToSystemClipboard(item.content);
          }
        });
      });

      container.querySelectorAll('.cb-insert-clip').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = parseFloat(e.target.dataset.id);
          const item = this.items.find(i => i.id === id);
          if (item) {
            this.insertToChat(item.content);
          }
        });
      });

      container.querySelectorAll('.cb-remove-clip').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = parseFloat(e.target.dataset.id);
          this.removeItem(id);
          this.renderClipboard(container);
        });
      });
    }

    getTypeIcon(type) {
      const icons = {
        text: '📝',
        code: '💻',
        image: '🖼️',
        link: '🔗',
        chat: '💬'
      };
      return icons[type] || '📄';
    }

    formatTimestamp(timestamp) {
      const date = new Date(timestamp);
      const now = Date.now();
      const diff = now - timestamp;

      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return date.toLocaleDateString();
    }

    truncateContent(content, maxLength) {
      if (!content) return '';
      const escaped = this.escapeHtml(content);
      if (escaped.length <= maxLength) return escaped;
      return escaped.slice(0, maxLength) + '...';
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    async copyToSystemClipboard(text) {
      try {
        await navigator.clipboard.writeText(text);
        this.showToast('Copied to clipboard');
      } catch (e) {
        console.error('[Clipboard] Copy failed:', e);
      }
    }

    async insertToChat(text) {
      // Use restoreToChat if available
      if (typeof window.restoreToChat === 'function') {
        await window.restoreToChat(text, []);
      } else if (typeof restoreToChatFunction === 'function') {
        await restoreToChatFunction(text, []);
      }
      this.showToast('Inserted to chat');
    }

    showToast(message) {
      if (typeof window.toast === 'function') {
        window.toast(message);
      }
    }
  }

  // ============================================
  // KNOWLEDGE BASE ENHANCEMENTS
  // ============================================

  // ─── Entity Extractor ──────────────────────────────────────────────────
  // Extracts entities and relationships from AI chat messages using
  // both pattern-based extraction and Gemini API for deep extraction.
  class EntityExtractor {
    constructor() {
      this.ENTITY_TYPES = {
        PERSON: 'person',
        TECHNOLOGY: 'technology',
        CONCEPT: 'concept',
        LIBRARY: 'library',
        PRODUCT: 'product',
        ORGANIZATION: 'organization',
        LANGUAGE: 'language',
        FRAMEWORK: 'framework',
        TOOL: 'tool'
      };

      // High-confidence pattern matchers for fast client-side extraction
      this.TECH_PATTERNS = /\b(React|Vue|Angular|Svelte|Next\.?js|Nuxt|Remix|Gatsby|Express|Django|Flask|FastAPI|Spring|Rails|Laravel|ASP\.NET|Node\.?js|Deno|Bun|TypeScript|JavaScript|Python|Java|Kotlin|Swift|Rust|Go|Ruby|PHP|C\+\+|C#|Scala|Elixir|Haskell|Dart|Flutter|React Native|Electron|Tauri|Docker|Kubernetes|Terraform|AWS|Azure|GCP|Firebase|Supabase|MongoDB|PostgreSQL|MySQL|Redis|SQLite|GraphQL|REST|gRPC|WebSocket|OAuth|JWT|WASM|WebAssembly|TensorFlow|PyTorch|Keras|scikit-learn|pandas|NumPy|Hugging\s?Face|LangChain|LlamaIndex|OpenAI|GPT-[34o]|Claude|Gemini|Llama|Mistral|Anthropic|Vercel|Netlify|Cloudflare|Nginx|Apache|Linux|Windows|macOS|iOS|Android|Git|GitHub|GitLab|VS\s?Code|Webpack|Vite|esbuild|Rollup|Babel|ESLint|Prettier|Jest|Vitest|Cypress|Playwright|Storybook|Tailwind(?:\s?CSS)?|Bootstrap|Material\s?UI|Chakra\s?UI|Figma|Sketch|Notion|Slack|Jira|Confluence)\b/gi;

      this.CONCEPT_PATTERNS = /\b(machine learning|deep learning|neural network|transformer|attention mechanism|fine-tuning|prompt engineering|RAG|retrieval augmented generation|vector database|embeddings?|tokenization|inference|training|backpropagation|gradient descent|reinforcement learning|supervised learning|unsupervised learning|NLP|natural language processing|computer vision|generative AI|LLM|large language model|API|microservices?|serverless|CI\/CD|DevOps|agile|scrum|kanban|TDD|test-driven development|DDD|domain-driven design|SOLID|design pattern|refactoring|code review|pull request|deployment|containerization|orchestration|load balancing|caching|rate limiting|authentication|authorization|encryption|hashing|middleware|webhook|SSR|SSG|SPA|PWA|accessibility|responsive design|mobile-first|SEO|performance optimization|lazy loading|code splitting|tree shaking|hot module replacement)\b/gi;

      this.RELATIONSHIP_VERBS = /\b(uses|depends on|integrates with|replaces|compared to|similar to|better than|alternative to|built with|built on|extends|implements|wraps|connects to|migrated? (?:from|to)|combined with|works with|powered by|compatible with|supports|requires|conflicts with)\b/gi;
    }

    /**
     * Fast pattern-based entity extraction (no API call needed).
     * Returns entities with types and positions.
     */
    extractLocal(messages) {
      if (!messages || !Array.isArray(messages)) return { entities: [], relationships: [] };

      const fullText = messages.map(m => `${m.role || 'unknown'}: ${m.text || ''}`).join('\n\n');
      const entityMap = new Map(); // name_lower -> { name, type, mentions, contexts }

      // 1. Technology/framework extraction
      let match;
      const techRegex = new RegExp(this.TECH_PATTERNS.source, 'gi');
      while ((match = techRegex.exec(fullText)) !== null) {
        const name = match[1];
        const key = name.toLowerCase().replace(/\s+/g, '');
        if (!entityMap.has(key)) {
          entityMap.set(key, {
            name: name,
            type: this._classifyTech(name),
            mentions: 0,
            contexts: [],
            firstSeen: match.index
          });
        }
        const ent = entityMap.get(key);
        ent.mentions++;
        // Capture surrounding context (±80 chars)
        const ctxStart = Math.max(0, match.index - 80);
        const ctxEnd = Math.min(fullText.length, match.index + name.length + 80);
        if (ent.contexts.length < 3) {
          ent.contexts.push(fullText.slice(ctxStart, ctxEnd).replace(/\n/g, ' ').trim());
        }
      }

      // 2. Concept extraction
      const conceptRegex = new RegExp(this.CONCEPT_PATTERNS.source, 'gi');
      while ((match = conceptRegex.exec(fullText)) !== null) {
        const name = match[1];
        const key = name.toLowerCase().replace(/\s+/g, '');
        if (!entityMap.has(key)) {
          entityMap.set(key, {
            name: name,
            type: this.ENTITY_TYPES.CONCEPT,
            mentions: 0,
            contexts: [],
            firstSeen: match.index
          });
        }
        const ent = entityMap.get(key);
        ent.mentions++;
        if (ent.contexts.length < 3) {
          const ctxStart = Math.max(0, match.index - 80);
          const ctxEnd = Math.min(fullText.length, match.index + name.length + 80);
          ent.contexts.push(fullText.slice(ctxStart, ctxEnd).replace(/\n/g, ' ').trim());
        }
      }

      // 3. Capitalized proper nouns (potential people/orgs/products)
      const properNounRegex = /\b([A-Z][a-z]{2,})(?:\s+([A-Z][a-z]{2,})){0,2}\b/g;
      const stopWords = new Set([
        'The', 'This', 'That', 'These', 'Those', 'There', 'Then', 'When', 'Where',
        'What', 'Which', 'Who', 'How', 'Here', 'However', 'Therefore', 'Furthermore',
        'Additionally', 'Moreover', 'Although', 'Because', 'Since', 'While', 'Before',
        'After', 'During', 'About', 'Above', 'Below', 'Between', 'Through', 'Into',
        'From', 'With', 'Without', 'Against', 'Within', 'Along', 'Until', 'Upon',
        'Also', 'Just', 'Only', 'Even', 'Still', 'Already', 'Always', 'Never',
        'Often', 'Sometimes', 'Usually', 'Perhaps', 'Maybe', 'Sure', 'Yes', 'Well',
        'First', 'Second', 'Third', 'Next', 'Last', 'Finally', 'User', 'Assistant',
        'Note', 'Example', 'Step', 'Summary', 'Output', 'Input', 'Result', 'Error'
      ]);
      while ((match = properNounRegex.exec(fullText)) !== null) {
        const fullMatch = match[0];
        if (fullMatch.length < 3 || stopWords.has(fullMatch)) continue;
        const key = fullMatch.toLowerCase().replace(/\s+/g, '');
        if (entityMap.has(key)) continue; // Already captured by tech/concept patterns
        entityMap.set(key, {
          name: fullMatch,
          type: this.ENTITY_TYPES.PERSON, // Default; will be refined by AI extraction
          mentions: 1,
          contexts: [],
          firstSeen: match.index
        });
        const ent = entityMap.get(key);
        const ctxStart = Math.max(0, match.index - 60);
        const ctxEnd = Math.min(fullText.length, match.index + fullMatch.length + 60);
        ent.contexts.push(fullText.slice(ctxStart, ctxEnd).replace(/\n/g, ' ').trim());
      }

      // 4. Extract relationships between entities
      const relationships = this._extractRelationships(fullText, entityMap);

      // Convert to array, sort by mentions, limit
      const entities = Array.from(entityMap.values())
        .sort((a, b) => b.mentions - a.mentions)
        .slice(0, 50) // Cap at 50 entities per conversation
        .map(e => ({
          name: e.name,
          type: e.type,
          mentions: e.mentions,
          contexts: e.contexts,
          firstSeen: e.firstSeen
        }));

      return { entities, relationships };
    }

    /**
     * Deep extraction using Gemini API (called from background.js).
     * Produces richer entity/relationship data than pattern matching.
     */
    static buildExtractionPrompt(conversationText) {
      return `You are an expert knowledge analyst. Extract entities and relationships from this AI conversation.

Conversation:
${conversationText}

Return ONLY a JSON object (no commentary):
{
  "entities": [
    {"name": "exact name", "type": "person|technology|concept|library|product|organization|language|framework|tool", "description": "one-sentence description in context"}
  ],
  "relationships": [
    {"source": "entity name", "target": "entity name", "relation": "uses|depends_on|integrates_with|replaces|compared_to|similar_to|alternative_to|built_with|extends|implements|wraps|connects_to|migrated_from|migrated_to|combined_with|works_with|powered_by|compatible_with|supports|requires|conflicts_with", "context": "brief explanation"}
  ]
}

Rules:
- Max 30 entities, 20 relationships
- Entity names should be canonical (e.g., "React" not "ReactJS" or "react.js")
- Include ONLY entities actually discussed, not just mentioned in passing
- Relationships must reference entities in the entities array
- Focus on technical entities, frameworks, concepts, and people`;
    }

    /**
     * Merge local (pattern) extraction with AI (Gemini) extraction.
     * AI results take priority for type classification; local results
     * fill in missing entities and provide mention counts.
     */
    mergeExtractions(localResult, aiResult) {
      const merged = new Map(); // key -> entity

      // Start with local entities (they have mention counts)
      for (const ent of (localResult.entities || [])) {
        const key = this._normalizeEntityKey(ent.name);
        merged.set(key, { ...ent });
      }

      // Overlay AI entities (better type classification, descriptions)
      for (const ent of (aiResult.entities || [])) {
        const key = this._normalizeEntityKey(ent.name);
        if (merged.has(key)) {
          const existing = merged.get(key);
          // AI type is more accurate
          existing.type = ent.type || existing.type;
          existing.description = ent.description || existing.description || '';
        } else {
          merged.set(key, {
            name: ent.name,
            type: ent.type || 'concept',
            mentions: 1,
            contexts: [],
            description: ent.description || ''
          });
        }
      }

      // Merge relationships (dedupe by source+target+relation)
      const relSet = new Map();
      for (const rel of [...(localResult.relationships || []), ...(aiResult.relationships || [])]) {
        const relKey = `${this._normalizeEntityKey(rel.source)}|${rel.relation}|${this._normalizeEntityKey(rel.target)}`;
        if (!relSet.has(relKey)) {
          relSet.set(relKey, rel);
        }
      }

      return {
        entities: Array.from(merged.values()),
        relationships: Array.from(relSet.values())
      };
    }

    _normalizeEntityKey(name) {
      return (name || '').toLowerCase()
        .replace(/[.\-_\s]+/g, '')
        .replace(/js$/, '')  // "nodejs" == "node"
        .replace(/css$/, '') // "tailwindcss" == "tailwind"
        .trim();
    }

    _classifyTech(name) {
      const lower = name.toLowerCase();
      const frameworks = ['react', 'vue', 'angular', 'svelte', 'next', 'nuxt', 'remix', 'gatsby', 'express', 'django', 'flask', 'fastapi', 'spring', 'rails', 'laravel', 'asp.net', 'flutter', 'react native', 'electron', 'tauri'];
      const languages = ['typescript', 'javascript', 'python', 'java', 'kotlin', 'swift', 'rust', 'go', 'ruby', 'php', 'c++', 'c#', 'scala', 'elixir', 'haskell', 'dart'];
      const tools = ['docker', 'kubernetes', 'terraform', 'git', 'github', 'gitlab', 'webpack', 'vite', 'esbuild', 'rollup', 'babel', 'eslint', 'prettier', 'jest', 'vitest', 'cypress', 'playwright', 'storybook', 'figma', 'sketch', 'notion', 'slack', 'jira', 'confluence', 'vs code'];
      const libraries = ['tensorflow', 'pytorch', 'keras', 'scikit-learn', 'pandas', 'numpy', 'langchain', 'llamaindex', 'tailwind', 'bootstrap', 'material ui', 'chakra ui'];
      const products = ['aws', 'azure', 'gcp', 'firebase', 'supabase', 'vercel', 'netlify', 'cloudflare', 'nginx', 'apache'];

      if (frameworks.some(f => lower.includes(f))) return this.ENTITY_TYPES.FRAMEWORK;
      if (languages.some(l => lower.includes(l))) return this.ENTITY_TYPES.LANGUAGE;
      if (tools.some(t => lower.includes(t))) return this.ENTITY_TYPES.TOOL;
      if (libraries.some(l => lower.includes(l))) return this.ENTITY_TYPES.LIBRARY;
      if (products.some(p => lower.includes(p))) return this.ENTITY_TYPES.PRODUCT;
      return this.ENTITY_TYPES.TECHNOLOGY;
    }

    _extractRelationships(text, entityMap) {
      const relationships = [];
      const entityNames = Array.from(entityMap.values()).map(e => e.name);
      if (entityNames.length < 2) return relationships;

      // Find sentences containing relationship verbs + multiple entities
      const sentences = text.split(/[.!?\n]+/).filter(s => s.trim().length > 10);
      const relSet = new Set();

      for (const sentence of sentences) {
        const verbMatch = sentence.match(this.RELATIONSHIP_VERBS);
        if (!verbMatch) continue;

        // Find which entities appear in this sentence
        const presentEntities = entityNames.filter(name =>
          sentence.toLowerCase().includes(name.toLowerCase())
        );

        if (presentEntities.length >= 2) {
          // Create relationships between co-occurring entities
          for (let i = 0; i < presentEntities.length - 1; i++) {
            for (let j = i + 1; j < presentEntities.length; j++) {
              const relKey = `${presentEntities[i]}|${verbMatch[0]}|${presentEntities[j]}`;
              if (relSet.has(relKey)) continue;
              relSet.add(relKey);
              relationships.push({
                source: presentEntities[i],
                target: presentEntities[j],
                relation: verbMatch[0].toLowerCase().replace(/\s+/g, '_'),
                context: sentence.trim().slice(0, 200)
              });
              if (relationships.length >= 30) return relationships;
            }
          }
        }
      }

      return relationships;
    }
  }

  // ─── Entity Resolver ───────────────────────────────────────────────────
  // Cross-platform entity resolution: links the same entity discussed
  // in ChatGPT and Claude conversations, even if described differently.
  class EntityResolver {
    constructor() {
      this.storageKey = 'chatbridge:entity_graph';
      this.graph = { nodes: {}, edges: [], meta: { lastUpdated: 0, version: 1 } };
      this._loadGraph();
    }

    _loadGraph() {
      try {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.nodes) {
            this.graph = parsed;
          }
        }
      } catch (e) {
        console.error('[EntityResolver] Failed to load graph:', e);
      }
    }

    _saveGraph() {
      try {
        this.graph.meta.lastUpdated = Date.now();
        const json = JSON.stringify(this.graph);
        // Cap storage at ~2MB to avoid localStorage quota issues
        if (json.length > 2 * 1024 * 1024) {
          this._pruneGraph();
        }
        localStorage.setItem(this.storageKey, JSON.stringify(this.graph));
      } catch (e) {
        console.error('[EntityResolver] Failed to save graph:', e);
      }
    }

    /**
     * Index entities and relationships from a conversation into the graph.
     * @param {Object} extraction - { entities: [], relationships: [] }
     * @param {string} conversationId - Unique conversation identifier
     * @param {string} platform - Platform hostname (e.g., "chatgpt.com")
     */
    indexConversation(extraction, conversationId, platform) {
      if (!extraction || !extraction.entities) return;

      const timestamp = Date.now();

      // Index entities as graph nodes
      for (const entity of extraction.entities) {
        const canonicalKey = this._canonicalize(entity.name);
        if (!canonicalKey) continue;

        if (!this.graph.nodes[canonicalKey]) {
          this.graph.nodes[canonicalKey] = {
            canonical: entity.name,
            type: entity.type,
            aliases: [],
            platforms: {},
            mentions: 0,
            description: entity.description || '',
            firstSeen: timestamp,
            lastSeen: timestamp,
            conversations: []
          };
        }

        const node = this.graph.nodes[canonicalKey];
        node.mentions += (entity.mentions || 1);
        node.lastSeen = timestamp;

        // Track per-platform occurrence
        if (!node.platforms[platform]) {
          node.platforms[platform] = { count: 0, firstSeen: timestamp, lastSeen: timestamp };
        }
        node.platforms[platform].count += (entity.mentions || 1);
        node.platforms[platform].lastSeen = timestamp;

        // Track conversation references (cap at 50)
        if (!node.conversations.includes(conversationId)) {
          node.conversations.push(conversationId);
          if (node.conversations.length > 50) {
            node.conversations = node.conversations.slice(-50);
          }
        }

        // Update description if AI provided a better one
        if (entity.description && entity.description.length > (node.description || '').length) {
          node.description = entity.description;
        }

        // Update type if more specific
        if (entity.type && entity.type !== 'concept' && node.type === 'concept') {
          node.type = entity.type;
        }
      }

      // Index relationships as graph edges
      for (const rel of (extraction.relationships || [])) {
        const sourceKey = this._canonicalize(rel.source);
        const targetKey = this._canonicalize(rel.target);
        if (!sourceKey || !targetKey || sourceKey === targetKey) continue;
        if (!this.graph.nodes[sourceKey] || !this.graph.nodes[targetKey]) continue;

        // Deduplicate edges
        const existingEdge = this.graph.edges.find(e =>
          e.source === sourceKey && e.target === targetKey && e.relation === rel.relation
        );
        if (existingEdge) {
          existingEdge.weight = (existingEdge.weight || 1) + 1;
          existingEdge.lastSeen = timestamp;
          if (!existingEdge.platforms.includes(platform)) {
            existingEdge.platforms.push(platform);
          }
        } else {
          this.graph.edges.push({
            source: sourceKey,
            target: targetKey,
            relation: rel.relation,
            context: rel.context || '',
            weight: 1,
            platforms: [platform],
            firstSeen: timestamp,
            lastSeen: timestamp
          });
        }
      }

      this._saveGraph();
    }

    /**
     * Cross-platform entity resolution.
     * Finds entities that refer to the same thing across different platforms
     * using fuzzy matching + embedding similarity.
     */
    resolveEntities() {
      const nodes = Object.entries(this.graph.nodes);
      const merged = [];

      // Pass 1: Exact canonical match (already handled by _canonicalize)
      // Pass 2: Fuzzy match on aliases and similar names
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const [keyA, nodeA] = nodes[i];
          const [keyB, nodeB] = nodes[j];

          const similarity = this._computeSimilarity(keyA, keyB, nodeA, nodeB);
          if (similarity >= 0.8) {
            merged.push({ keyA, keyB, similarity, reason: this._getSimilarityReason(keyA, keyB, nodeA, nodeB) });
          }
        }
      }

      // Apply merges (merge smaller into larger)
      for (const merge of merged) {
        this._mergeNodes(merge.keyA, merge.keyB);
      }

      if (merged.length > 0) {
        this._saveGraph();
      }

      return merged;
    }

    /**
     * Resolve entities using embedding similarity from background.js.
     * Called asynchronously — sends entities to background for vector comparison.
     */
    async resolveWithEmbeddings() {
      const nodeEntries = Object.entries(this.graph.nodes);
      if (nodeEntries.length < 2) return [];

      const resolutions = [];

      // Only compare entities that appear on different platforms
      const multiPlatformNodes = nodeEntries.filter(([_, node]) =>
        Object.keys(node.platforms).length >= 1
      );

      // Build comparison pairs (limit to prevent API overload)
      const pairs = [];
      for (let i = 0; i < multiPlatformNodes.length && pairs.length < 100; i++) {
        for (let j = i + 1; j < multiPlatformNodes.length && pairs.length < 100; j++) {
          const [keyA, nodeA] = multiPlatformNodes[i];
          const [keyB, nodeB] = multiPlatformNodes[j];

          // Skip if already same type and very different names
          if (this._computeSimilarity(keyA, keyB, nodeA, nodeB) < 0.3) continue;

          // Only send for embedding comparison if fuzzy match is ambiguous (0.3–0.8)
          const fuzzySim = this._computeSimilarity(keyA, keyB, nodeA, nodeB);
          if (fuzzySim >= 0.3 && fuzzySim < 0.8) {
            pairs.push({ keyA, keyB, nodeA, nodeB, fuzzySim });
          }
        }
      }

      // Request embedding comparisons from background
      for (const pair of pairs) {
        try {
          const textA = `${pair.nodeA.canonical}: ${pair.nodeA.description || pair.nodeA.type}`;
          const textB = `${pair.nodeB.canonical}: ${pair.nodeB.description || pair.nodeB.type}`;

          const result = await new Promise((resolve) => {
            chrome.runtime.sendMessage({
              type: 'resolve_entities',
              payload: { textA, textB }
            }, resolve);
          });

          if (result && result.ok && result.similarity >= 0.85) {
            resolutions.push({
              keyA: pair.keyA,
              keyB: pair.keyB,
              similarity: result.similarity,
              reason: 'embedding_similarity'
            });
            this._mergeNodes(pair.keyA, pair.keyB);
          }
        } catch (e) {
          // Embedding resolution is best-effort
        }
      }

      if (resolutions.length > 0) {
        this._saveGraph();
      }

      return resolutions;
    }

    /**
     * Query the knowledge graph.
     * @param {string} query - Natural language query
     * @param {Object} options - { limit, platform, entityType }
     * @returns {Object} { entities: [], relationships: [], summary: string }
     */
    queryGraph(query, options = {}) {
      const queryLower = query.toLowerCase();
      const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);
      const limit = options.limit || 20;

      // Score each node by relevance to query
      const scoredNodes = Object.entries(this.graph.nodes).map(([key, node]) => {
        let score = 0;

        // Name match
        if (node.canonical.toLowerCase().includes(queryLower)) score += 5;
        for (const term of queryTerms) {
          if (key.includes(term)) score += 2;
          if ((node.description || '').toLowerCase().includes(term)) score += 1.5;
          if (node.aliases.some(a => a.toLowerCase().includes(term))) score += 1;
        }

        // Boost by mentions (log scale)
        score += Math.log2(node.mentions + 1) * 0.5;

        // Boost cross-platform entities (they're more significant)
        const platformCount = Object.keys(node.platforms).length;
        if (platformCount > 1) score += platformCount * 1.5;

        // Platform filter
        if (options.platform && !node.platforms[options.platform]) score *= 0.1;

        // Entity type filter
        if (options.entityType && node.type !== options.entityType) score *= 0.2;

        return { key, node, score };
      }).filter(n => n.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      // Find relevant edges
      const relevantKeys = new Set(scoredNodes.map(n => n.key));
      const relevantEdges = this.graph.edges.filter(e =>
        relevantKeys.has(e.source) || relevantKeys.has(e.target)
      );

      // Build response
      return {
        entities: scoredNodes.map(n => ({
          name: n.node.canonical,
          type: n.node.type,
          description: n.node.description,
          mentions: n.node.mentions,
          platforms: Object.keys(n.node.platforms),
          platformDetails: n.node.platforms,
          conversations: n.node.conversations,
          relevanceScore: n.score
        })),
        relationships: relevantEdges.map(e => ({
          source: this.graph.nodes[e.source]?.canonical || e.source,
          target: this.graph.nodes[e.target]?.canonical || e.target,
          relation: e.relation,
          context: e.context,
          weight: e.weight,
          platforms: e.platforms
        })),
        stats: {
          totalNodes: Object.keys(this.graph.nodes).length,
          totalEdges: this.graph.edges.length,
          matchedNodes: scoredNodes.length,
          matchedEdges: relevantEdges.length
        }
      };
    }

    /**
     * Get entities that span multiple platforms (cross-platform entities).
     */
    getCrossPlatformEntities(minPlatforms = 2) {
      return Object.entries(this.graph.nodes)
        .filter(([_, node]) => Object.keys(node.platforms).length >= minPlatforms)
        .map(([key, node]) => ({
          name: node.canonical,
          type: node.type,
          platforms: Object.keys(node.platforms),
          mentions: node.mentions,
          description: node.description
        }))
        .sort((a, b) => b.mentions - a.mentions);
    }

    /**
     * Get graph statistics for debugging/benchmarking.
     */
    getStats() {
      const nodes = Object.values(this.graph.nodes);
      const platformCounts = {};
      const typeCounts = {};
      let crossPlatform = 0;

      for (const node of nodes) {
        const pCount = Object.keys(node.platforms).length;
        if (pCount > 1) crossPlatform++;
        for (const p of Object.keys(node.platforms)) {
          platformCounts[p] = (platformCounts[p] || 0) + 1;
        }
        typeCounts[node.type] = (typeCounts[node.type] || 0) + 1;
      }

      return {
        totalEntities: nodes.length,
        totalRelationships: this.graph.edges.length,
        crossPlatformEntities: crossPlatform,
        entitiesByPlatform: platformCounts,
        entitiesByType: typeCounts,
        lastUpdated: this.graph.meta.lastUpdated
      };
    }

    _canonicalize(name) {
      if (!name) return '';
      return name.toLowerCase()
        .replace(/[.\-_\s]+/g, '')
        .replace(/\.js$/i, '')
        .replace(/\.ts$/i, '')
        .replace(/\.py$/i, '')
        .trim();
    }

    _computeSimilarity(keyA, keyB, nodeA, nodeB) {
      // Exact match after canonicalization
      if (keyA === keyB) return 1.0;

      // Substring containment
      if (keyA.includes(keyB) || keyB.includes(keyA)) return 0.85;

      // Same type + Levenshtein distance
      const editDist = this._levenshtein(keyA, keyB);
      const maxLen = Math.max(keyA.length, keyB.length);
      const stringSim = 1 - (editDist / maxLen);

      // Type agreement bonus
      const typeBonus = (nodeA.type === nodeB.type) ? 0.1 : 0;

      return Math.min(1, stringSim + typeBonus);
    }

    _getSimilarityReason(keyA, keyB, nodeA, nodeB) {
      if (keyA === keyB) return 'exact_canonical';
      if (keyA.includes(keyB) || keyB.includes(keyA)) return 'substring_match';
      return 'fuzzy_match';
    }

    _mergeNodes(keyA, keyB) {
      const nodeA = this.graph.nodes[keyA];
      const nodeB = this.graph.nodes[keyB];
      if (!nodeA || !nodeB) return;

      // Merge into the more-mentioned node
      const [keepKey, keep, mergeKey, merge] = nodeA.mentions >= nodeB.mentions
        ? [keyA, nodeA, keyB, nodeB]
        : [keyB, nodeB, keyA, nodeA];

      // Merge platforms
      for (const [platform, data] of Object.entries(merge.platforms)) {
        if (!keep.platforms[platform]) {
          keep.platforms[platform] = data;
        } else {
          keep.platforms[platform].count += data.count;
          keep.platforms[platform].lastSeen = Math.max(keep.platforms[platform].lastSeen, data.lastSeen);
        }
      }

      // Merge conversations
      const convSet = new Set([...keep.conversations, ...merge.conversations]);
      keep.conversations = Array.from(convSet).slice(-50);

      // Merge mentions
      keep.mentions += merge.mentions;

      // Add alias
      if (!keep.aliases.includes(merge.canonical)) {
        keep.aliases.push(merge.canonical);
      }

      // Update description if merged has better one
      if ((merge.description || '').length > (keep.description || '').length) {
        keep.description = merge.description;
      }

      // Re-point edges from merge to keep
      for (const edge of this.graph.edges) {
        if (edge.source === mergeKey) edge.source = keepKey;
        if (edge.target === mergeKey) edge.target = keepKey;
      }

      // Remove duplicate self-edges
      this.graph.edges = this.graph.edges.filter(e => e.source !== e.target);

      // Delete merged node
      delete this.graph.nodes[mergeKey];
    }

    _levenshtein(a, b) {
      const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
      for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
      for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
          const cost = a[j - 1] === b[i - 1] ? 0 : 1;
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j - 1] + cost
          );
        }
      }
      return matrix[b.length][a.length];
    }

    _pruneGraph() {
      // Remove nodes with fewest mentions to save space
      const entries = Object.entries(this.graph.nodes)
        .sort((a, b) => a[1].mentions - b[1].mentions);

      // Remove bottom 30%
      const removeCount = Math.floor(entries.length * 0.3);
      for (let i = 0; i < removeCount; i++) {
        const key = entries[i][0];
        delete this.graph.nodes[key];
        this.graph.edges = this.graph.edges.filter(e => e.source !== key && e.target !== key);
      }
    }
  }

  class KnowledgeBase {
    constructor() {
      this.storageKey = 'chatbridge:knowledge';
      this.items = [];
      this.loadFromStorage();
    }

    loadFromStorage() {
      try {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) {
          this.items = JSON.parse(stored);
        }
      } catch (e) {
        console.error('[Knowledge] Failed to load:', e);
        this.items = [];
      }
    }

    saveToStorage() {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.items));
      } catch (e) {
        console.error('[Knowledge] Failed to save:', e);
      }
    }

    addEntry(entry) {
      const newEntry = {
        id: Date.now() + Math.random(),
        timestamp: Date.now(),
        title: entry.title || 'Untitled',
        content: entry.content || '',
        tags: entry.tags || [],
        source: entry.source || window.location.hostname,
        metadata: entry.metadata || {}
      };

      this.items.unshift(newEntry);
      this.saveToStorage();
      return newEntry;
    }

    updateEntry(id, updates) {
      const index = this.items.findIndex(item => item.id === id);
      if (index >= 0) {
        this.items[index] = { ...this.items[index], ...updates };
        this.saveToStorage();
      }
    }

    removeEntry(id) {
      this.items = this.items.filter(item => item.id !== id);
      this.saveToStorage();
    }

    search(query, filters = {}) {
      let results = this.items;

      if (query) {
        const lowerQuery = query.toLowerCase();
        results = results.filter(item =>
          item.title.toLowerCase().includes(lowerQuery) ||
          item.content.toLowerCase().includes(lowerQuery) ||
          item.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
        );
      }

      if (filters.tags && filters.tags.length > 0) {
        results = results.filter(item =>
          filters.tags.some(tag => item.tags.includes(tag))
        );
      }

      if (filters.source) {
        results = results.filter(item => item.source === filters.source);
      }

      return results;
    }

    getAllTags() {
      const tagSet = new Set();
      this.items.forEach(item => {
        item.tags.forEach(tag => tagSet.add(tag));
      });
      return Array.from(tagSet).sort();
    }

    renderKnowledge(container) {
      if (!container) return;

      const allTags = this.getAllTags();

      const html = `
        <div class="cb-knowledge-header" style="margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="font-size: 12px; color: var(--cb-subtext); font-weight: 600;">
              📚 Knowledge Base (${this.items.length})
            </div>
            <button class="cb-btn" id="cb-add-knowledge" style="padding: 6px 12px; font-size: 11px;">
              + Add Entry
            </button>
          </div>
          <div style="display: flex; gap: 8px; margin-bottom: 12px;">
            <input type="text" id="cb-kb-search" placeholder="Search..." style="
              flex: 1;
              padding: 8px 12px;
              background: var(--cb-bg);
              border: 1px solid var(--cb-border);
              border-radius: 8px;
              color: var(--cb-white);
              font-size: 13px;
            ">
            <select id="cb-kb-tag-filter" style="
              padding: 8px 12px;
              background: var(--cb-bg);
              border: 1px solid var(--cb-border);
              border-radius: 8px;
              color: var(--cb-white);
              font-size: 13px;
            ">
              <option value="">All tags</option>
              ${allTags.map(tag => `<option value="${tag}">${tag}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="cb-knowledge-items" style="max-height: 400px; overflow-y: auto;">
          ${this.items.length === 0 ? `
            <div style="text-align: center; padding: 40px 20px; color: var(--cb-subtext); font-size: 13px;">
              No knowledge entries yet.<br>
              <span style="font-size: 11px; opacity: 0.8;">Add your first entry to start building your knowledge base.</span>
            </div>
          ` : this.items.map(item => `
            <div class="cb-kb-item" data-id="${item.id}" style="
              padding: 14px;
              margin-bottom: 12px;
              background: var(--cb-bg3);
              border: 1px solid var(--cb-border);
              border-radius: 8px;
              transition: all 0.2s ease;
            ">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                <div style="font-weight: 600; font-size: 14px; color: var(--cb-white);">
                  ${item.title}
                </div>
                <div style="display: flex; gap: 6px;">
                  <button class="cb-edit-kb" data-id="${item.id}" style="
                    padding: 3px 8px;
                    font-size: 10px;
                    background: var(--cb-bg);
                    border: 1px solid var(--cb-border);
                    border-radius: 4px;
                    color: var(--cb-white);
                    cursor: pointer;
                  ">Edit</button>
                  <button class="cb-remove-kb" data-id="${item.id}" style="
                    padding: 3px 8px;
                    font-size: 10px;
                    background: transparent;
                    border: 1px solid rgba(255, 30, 86, 0.5);
                    border-radius: 4px;
                    color: #FF7A9A;
                    cursor: pointer;
                  ">×</button>
                </div>
              </div>
              <div style="font-size: 12px; color: var(--cb-subtext); line-height: 1.5; margin-bottom: 8px;">
                ${this.truncateContent(item.content, 150)}
              </div>
              ${item.tags.length > 0 ? `
                <div class="cb-tag-row">
                  ${item.tags.map(tag => `<span class="cb-tag-chip">${tag}</span>`).join('')}
                </div>
              ` : ''}
              <div style="font-size: 10px; color: var(--cb-subtext); margin-top: 6px;">
                ${this.formatTimestamp(item.timestamp)} · ${item.source}
              </div>
            </div>
          `).join('')}
        </div>
      `;

      container.innerHTML = html;

      // Event listeners
      const searchInput = container.querySelector('#cb-kb-search');
      const tagFilter = container.querySelector('#cb-kb-tag-filter');

      const applyFilters = () => {
        const query = searchInput.value;
        const tag = tagFilter.value;
        const results = this.search(query, tag ? { tags: [tag] } : {});
        // Re-render with filtered results
        // TODO: Implement filtered rendering
      };

      if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
      }
      if (tagFilter) {
        tagFilter.addEventListener('change', applyFilters);
      }

      const addBtn = container.querySelector('#cb-add-knowledge');
      if (addBtn) {
        addBtn.addEventListener('click', () => {
          this.showAddEntryDialog();
        });
      }

      container.querySelectorAll('.cb-edit-kb').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = parseFloat(e.target.dataset.id);
          const item = this.items.find(i => i.id === id);
          if (item) {
            this.showEditEntryDialog(item);
          }
        });
      });

      container.querySelectorAll('.cb-remove-kb').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = parseFloat(e.target.dataset.id);
          if (confirm('Remove this entry?')) {
            this.removeEntry(id);
            this.renderKnowledge(container);
          }
        });
      });
    }

    showAddEntryDialog() {
      // TODO: Implement modal dialog for adding entries
      const title = prompt('Entry title:');
      if (!title) return;

      const content = prompt('Entry content:');
      if (!content) return;

      const tagsInput = prompt('Tags (comma-separated):');
      const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];

      this.addEntry({ title, content, tags });

      // Re-render to show new entry
      const container = document.querySelector('#cb-agent-content');
      if (container) {
        this.renderKnowledge(container);
      }
    }

    showEditEntryDialog(entry) {
      // TODO: Implement modal dialog for editing entries
      const title = prompt('Entry title:', entry.title);
      if (!title) return;

      const content = prompt('Entry content:', entry.content);
      if (content === null) return;

      const tagsInput = prompt('Tags (comma-separated):', entry.tags.join(', '));
      const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];

      this.updateEntry(entry.id, { title, content, tags });

      // Re-render
      const container = document.querySelector('#cb-agent-content');
      if (container) {
        this.renderKnowledge(container);
      }
    }

    truncateContent(content, maxLength) {
      if (!content) return '';
      const escaped = this.escapeHtml(content);
      if (escaped.length <= maxLength) return escaped;
      return escaped.slice(0, maxLength) + '...';
    }

    formatTimestamp(timestamp) {
      const date = new Date(timestamp);
      return date.toLocaleDateString();
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  // ============================================
  // EXPORT TO WINDOW
  // ============================================
  if (typeof window !== 'undefined') {
    window.SmartContextInjection = SmartContextInjection;
    window.AISummaryEngine = AISummaryEngine;
    window.UniversalClipboard = UniversalClipboard;
    window.KnowledgeBase = KnowledgeBase;
    window.EntityExtractor = EntityExtractor;
    window.EntityResolver = EntityResolver;
  }

  // ============================================
  // CONTENT EXTRACTION UTILITIES
  // ============================================
  const ContentExtractor = {
    // Regex Patterns
    PATTERNS: {
      URL: /(https?:\/\/[^\s<]+)/g,
      EMAIL: /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi,
      NUMBER: /\b\d+(?:,\d{3})*(?:\.\d+)?\b/g,
      DATE: /\b(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}(?:, \d{4})?)\b/gi,
      CODE_BLOCK: /```(\w*)\n([\s\S]*?)```/g,
      INLINE_CODE: /`([^`]+)`/g,
      LIST_BULLET: /^[\s]*[-*+]\s+(.+)$/gm,
      LIST_NUMBER: /^[\s]*\d+\.\s+(.+)$/gm,
      TABLE: /\|.+?\|.+?\|\n\|[-:| ]+\|\n((?:\|.+?\|\n)+)/g,
      COMMAND: /^[/$!]([a-zA-Z0-9_-]+)/gm // e.g., /slash-commands
    },

    extract(messages) {
      if (!messages || !Array.isArray(messages)) return {};

      const results = {
        urls: new Set(),
        emails: new Set(),
        numbers: [],
        dates: new Set(),
        codeBlocks: [],
        inlineCode: new Set(),
        lists: [],
        tables: [],
        uniqueStats: {
          wordCount: 0,
          charCount: 0
        }
      };

      const fullText = messages.map(m => m.text || '').join('\n');

      // 1. URLs
      const urls = fullText.match(this.PATTERNS.URL);
      if (urls) urls.forEach(u => results.urls.add(u));

      // 2. Emails
      const emails = fullText.match(this.PATTERNS.EMAIL);
      if (emails) emails.forEach(e => results.emails.add(e));

      // 3. Dates
      const dates = fullText.match(this.PATTERNS.DATE);
      if (dates) dates.forEach(d => results.dates.add(d));

      // 4. Code Blocks
      let match;
      while ((match = this.PATTERNS.CODE_BLOCK.exec(fullText)) !== null) {
        results.codeBlocks.push({
          language: match[1] || 'text',
          code: match[2].trim()
        });
      }

      // 5. Lists (Bullet & Numbered)
      const visibleLists = [];
      let listMatch;
      // Combine list regexes manually or iterate matching lines
      const bulletMatches = fullText.match(this.PATTERNS.LIST_BULLET);
      if (bulletMatches) visibleLists.push(...bulletMatches.map(l => l.trim()));

      const numberMatches = fullText.match(this.PATTERNS.LIST_NUMBER);
      if (numberMatches) visibleLists.push(...numberMatches.map(l => l.trim()));

      if (visibleLists.length > 0) results.lists = visibleLists;

      // 6. Inline Code / Commands
      const inlineMatches = fullText.match(this.PATTERNS.INLINE_CODE);
      if (inlineMatches) inlineMatches.forEach(c => results.inlineCode.add(c));

      // 7. Stats
      results.uniqueStats.charCount = fullText.length;
      results.uniqueStats.wordCount = fullText.trim().split(/\s+/).length;

      return {
        urls: Array.from(results.urls),
        emails: Array.from(results.emails),
        dates: Array.from(results.dates),
        codeBlocks: results.codeBlocks,
        inlineCode: Array.from(results.inlineCode),
        lists: results.lists,
        stats: results.uniqueStats
      };
    }
  };

  // Expose to ChatBridge global
  if (typeof window !== 'undefined') {
    window.ChatBridge = window.ChatBridge || {};
    window.ChatBridge.extractContentFromMessages = (messages) => {
      return ContentExtractor.extract(messages);
    };
  }

})();
