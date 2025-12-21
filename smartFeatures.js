// smartFeatures.js - Smart Context Injection, AI Summaries, Universal Clipboard, Knowledge Base

(function() {
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
        } catch (e) {}
        
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
      } catch (e) {}
      
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
  }

})();
