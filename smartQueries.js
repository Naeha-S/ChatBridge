// smartQueries.js - Intent-Aware Segment-Level Memory Exploration Interface
// Transforms keyword-based chat retrieval into meaning-driven conversation analysis

(function () {
    'use strict';

    // ============================================
    // SMART QUERY UI RENDERER
    // ============================================
    class SmartQueryUI {
        constructor() {
            this.memoryRetrieval = null;
            this.currentResults = [];
            this.activeFilters = new Set();
            this.expandedResults = new Set();
        }

        /**
         * Initialize the Smart Query system
         */
        async initialize() {
            // Initialize memory retrieval system
            if (window.MemoryRetrieval) {
                this.memoryRetrieval = new window.MemoryRetrieval();
                await this.memoryRetrieval.initialize();
            }
        }

        /**
         * Render the full Smart Query interface
         */
        render(container) {
            if (!container) return;

            container.innerHTML = `
        <div class="sq-microscope">
          <!-- Header -->
          <div class="sq-header">
            <div class="sq-title-row">
              <span class="sq-icon">🔬</span>
              <h2 class="sq-title">Conversation Microscope</h2>
            </div>
            <p class="sq-tagline">Searching for meaning, not words</p>
          </div>

          <!-- Query Input -->
          <div class="sq-query-section">
            <div class="sq-query-wrapper">
              <textarea 
                id="sq-query-input" 
                class="sq-query-input" 
                placeholder="Ask about your conversations...&#10;&#10;Examples:&#10;• What was I confused about when building ChatBridge?&#10;• Where did my opinion change over time?&#10;• Show me decisions I made about the UI"
                rows="3"
              ></textarea>
              <div class="sq-query-hint" id="sq-query-hint">
                <span class="sq-hint-icon">💡</span>
                <span class="sq-hint-text">Try natural language questions</span>
              </div>
            </div>
            <div class="sq-query-actions">
              <button id="sq-search-btn" class="sq-btn sq-btn-primary">
                <span class="sq-btn-icon">🔍</span>
                Search Memory
              </button>
              <button id="sq-index-btn" class="sq-btn sq-btn-secondary" title="Index all saved conversations">
                <span class="sq-btn-icon">📚</span>
                Index All
              </button>
            </div>
          </div>

          <!-- Intent Label (shown during/after search) -->
          <div id="sq-intent-label" class="sq-intent-label" style="display:none;">
            <span class="sq-intent-icon">🎯</span>
            <span id="sq-intent-text" class="sq-intent-text"></span>
          </div>

          <!-- Result Type Lenses -->
          <div class="sq-lenses" id="sq-lenses" style="display:none;">
            <div class="sq-lenses-label">Filter by insight type:</div>
            <div class="sq-lens-buttons">
              <button class="sq-lens" data-type="all">All</button>
              <button class="sq-lens" data-type="decision_made">
                <span>✓</span> Decisions
              </button>
              <button class="sq-lens" data-type="confusion_loop">
                <span>❓</span> Confusions
              </button>
              <button class="sq-lens" data-type="idea_evolution">
                <span>🔄</span> Evolution
              </button>
              <button class="sq-lens" data-type="contradiction">
                <span>⚡</span> Contradictions
              </button>
              <button class="sq-lens" data-type="breakthrough_moment">
                <span>💡</span> Breakthroughs
              </button>
            </div>
          </div>

          <!-- Results Container -->
          <div id="sq-results" class="sq-results">
            <div class="sq-empty-state">
              <div class="sq-empty-icon">🧠</div>
              <p class="sq-empty-text">Your conversation memory is ready to explore</p>
              <p class="sq-empty-hint">Ask a question to find insights across all your chats</p>
            </div>
          </div>

          <!-- Stats Footer -->
          <div id="sq-stats" class="sq-stats" style="display:none;">
            <span id="sq-stats-text"></span>
          </div>
        </div>
      `;

            // Attach event listeners
            this.attachEvents(container);
        }

        /**
         * Attach event listeners
         */
        attachEvents(container) {
            const queryInput = container.querySelector('#sq-query-input');
            const searchBtn = container.querySelector('#sq-search-btn');
            const indexBtn = container.querySelector('#sq-index-btn');
            const lensButtons = container.querySelectorAll('.sq-lens');

            // Search on button click
            searchBtn.addEventListener('click', () => this.performSearch(container));

            // Search on Ctrl+Enter
            queryInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    this.performSearch(container);
                }
            });

            // Update hint as user types
            queryInput.addEventListener('input', () => {
                this.updateQueryHint(container, queryInput.value);
            });

            // Index all conversations
            indexBtn.addEventListener('click', () => this.indexAll(container));

            // Lens filters
            lensButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const type = btn.dataset.type;
                    this.toggleLens(container, type, btn);
                });
            });
        }

        /**
         * Update query hint based on detected intent
         */
        updateQueryHint(container, query) {
            const hintEl = container.querySelector('#sq-query-hint');
            if (!query.trim()) {
                hintEl.innerHTML = '<span class="sq-hint-icon">💡</span><span class="sq-hint-text">Try natural language questions</span>';
                return;
            }

            if (window.IntentAnalyzer) {
                const analyzer = new window.IntentAnalyzer();
                const analysis = analyzer.analyzeQuery(query);
                const label = analyzer.getIntentLabel(analysis.intent);
                hintEl.innerHTML = `<span class="sq-hint-icon">🎯</span><span class="sq-hint-text">${label}</span>`;
            }
        }

        /**
         * Perform search
         */
        async performSearch(container) {
            const queryInput = container.querySelector('#sq-query-input');
            const query = queryInput.value.trim();

            if (!query) {
                this.showToast('Please enter a search query');
                return;
            }

            const searchBtn = container.querySelector('#sq-search-btn');
            const resultsContainer = container.querySelector('#sq-results');
            const intentLabel = container.querySelector('#sq-intent-label');
            const lenses = container.querySelector('#sq-lenses');
            const stats = container.querySelector('#sq-stats');

            // Show loading state
            searchBtn.disabled = true;
            searchBtn.innerHTML = '<span class="sq-btn-icon">⏳</span> Searching...';
            resultsContainer.innerHTML = '<div class="sq-loading"><div class="sq-loading-spinner"></div><p>Analyzing your memory...</p></div>';

            try {
                // Ensure memory retrieval is initialized
                if (!this.memoryRetrieval) {
                    await this.initialize();
                }

                // Perform search
                const results = await this.memoryRetrieval.search(query, { limit: 12 });
                this.currentResults = results;

                // Show intent label
                if (window.IntentAnalyzer) {
                    const analyzer = new window.IntentAnalyzer();
                    const analysis = analyzer.analyzeQuery(query);
                    const label = analyzer.getIntentLabel(analysis.intent);
                    container.querySelector('#sq-intent-text').textContent = label;
                    intentLabel.style.display = 'flex';
                }

                // Show lenses
                lenses.style.display = 'block';

                // Render results
                this.renderResults(container, results);

                // Show stats
                stats.style.display = 'block';
                container.querySelector('#sq-stats-text').textContent =
                    `Found ${results.length} relevant segments across your conversations`;

            } catch (error) {
                console.error('[SmartQuery] Search error:', error);
                resultsContainer.innerHTML = `
          <div class="sq-error">
            <span class="sq-error-icon">⚠️</span>
            <p>${error.message || 'Search failed. Please try again.'}</p>
          </div>
        `;
            } finally {
                searchBtn.disabled = false;
                searchBtn.innerHTML = '<span class="sq-btn-icon">🔍</span> Search Memory';
            }
        }

        /**
         * Render search results
         */
        renderResults(container, results) {
            const resultsContainer = container.querySelector('#sq-results');

            if (!results || results.length === 0) {
                resultsContainer.innerHTML = `
          <div class="sq-no-results">
            <div class="sq-no-results-icon">🔍</div>
            <p>No matching segments found</p>
            <p class="sq-no-results-hint">Try a different query or index more conversations</p>
          </div>
        `;
                return;
            }

            resultsContainer.innerHTML = results.map((result, idx) => `
        <div class="sq-result-card" data-index="${idx}" data-type="${result.segment.type}">
          <div class="sq-result-header">
            <div class="sq-result-meta">
              <span class="sq-relevance sq-relevance-${result.relevanceLevel}">
                ${this.getRelevanceIcon(result.relevanceLevel)} ${result.relevanceLevel}
              </span>
              <span class="sq-result-reason">${result.relevanceReason}</span>
            </div>
            <div class="sq-result-source">
              <span class="sq-platform-badge">${result.segment.platform || 'Chat'}</span>
              <span class="sq-result-time">${this.formatTime(result.segment.timestamp)}</span>
            </div>
          </div>
          
          <div class="sq-result-topic">
            <span class="sq-topic-label">Topic:</span> ${result.segment.topic || 'General'}
          </div>

          <div class="sq-result-excerpt">
            ${this.renderExcerpt(result.excerpt)}
          </div>

          <div class="sq-result-actions">
            <button class="sq-action-btn sq-expand-btn" data-index="${idx}">
              <span>📖</span> Show Context
            </button>
            <button class="sq-action-btn sq-full-btn" data-index="${idx}">
              <span>📄</span> Full Conversation
            </button>
            <button class="sq-action-btn sq-copy-btn" data-index="${idx}">
              <span>📋</span> Copy
            </button>
          </div>

          <div class="sq-expanded-context" id="sq-context-${idx}" style="display:none;"></div>
        </div>
      `).join('');

            // Attach result actions
            this.attachResultActions(container);
        }

        /**
         * Render excerpt messages
         */
        renderExcerpt(excerpt) {
            if (!excerpt || excerpt.length === 0) return '<p class="sq-no-excerpt">No content available</p>';

            return excerpt.map(msg => `
        <div class="sq-excerpt-msg sq-role-${msg.role}">
          <span class="sq-msg-role">${msg.role === 'user' ? '👤' : '🤖'}</span>
          <span class="sq-msg-text">${this.escapeHtml(msg.text)}</span>
        </div>
      `).join('');
        }

        /**
         * Get relevance icon
         */
        getRelevanceIcon(level) {
            const icons = {
                'high': '🎯',
                'medium': '📍',
                'exploratory': '🔎'
            };
            return icons[level] || '📍';
        }

        /**
         * Format timestamp
         */
        formatTime(timestamp) {
            if (!timestamp) return '';
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now - date;

            if (diff < 86400000) return 'Today';
            if (diff < 172800000) return 'Yesterday';
            if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`;
            return date.toLocaleDateString();
        }

        /**
         * Attach actions to result cards
         */
        attachResultActions(container) {
            // Expand context buttons
            container.querySelectorAll('.sq-expand-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const idx = parseInt(btn.dataset.index);
                    await this.toggleContext(container, idx);
                });
            });

            // Full conversation buttons
            container.querySelectorAll('.sq-full-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const idx = parseInt(btn.dataset.index);
                    await this.showFullConversation(container, idx);
                });
            });

            // Copy buttons
            container.querySelectorAll('.sq-copy-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const idx = parseInt(btn.dataset.index);
                    await this.copyExcerpt(idx);
                });
            });
        }

        /**
         * Toggle expanded context
         */
        async toggleContext(container, idx) {
            const contextEl = container.querySelector(`#sq-context-${idx}`);
            const btn = container.querySelector(`.sq-expand-btn[data-index="${idx}"]`);

            if (this.expandedResults.has(idx)) {
                // Collapse
                contextEl.style.display = 'none';
                btn.innerHTML = '<span>📖</span> Show Context';
                this.expandedResults.delete(idx);
            } else {
                // Expand
                const result = this.currentResults[idx];
                if (result && this.memoryRetrieval) {
                    btn.innerHTML = '<span>⏳</span> Loading...';
                    btn.disabled = true;

                    try {
                        const context = await this.memoryRetrieval.loadExpandedContext(
                            result,
                            result.segment.conversationId
                        );

                        if (context) {
                            contextEl.innerHTML = `
                <div class="sq-context-header">Surrounding Context</div>
                ${context.map(msg => `
                  <div class="sq-context-msg ${msg.isCore ? 'sq-core-msg' : ''} sq-role-${msg.role}">
                    <span class="sq-msg-role">${msg.role === 'user' ? '👤' : '🤖'}</span>
                    <span class="sq-msg-text">${this.escapeHtml(msg.text)}</span>
                  </div>
                `).join('')}
              `;
                        } else {
                            contextEl.innerHTML = '<p class="sq-no-context">Context not available</p>';
                        }

                        contextEl.style.display = 'block';
                        this.expandedResults.add(idx);
                        btn.innerHTML = '<span>📕</span> Hide Context';
                    } catch (e) {
                        contextEl.innerHTML = '<p class="sq-error">Failed to load context</p>';
                    } finally {
                        btn.disabled = false;
                    }
                }
            }
        }

        /**
         * Show full conversation in modal
         */
        async showFullConversation(container, idx) {
            const result = this.currentResults[idx];
            if (!result || !this.memoryRetrieval) return;

            const conv = await this.memoryRetrieval.loadFullConversation(result.segment.conversationId);
            if (!conv) {
                this.showToast('Could not load full conversation');
                return;
            }

            // Create modal
            const modal = document.createElement('div');
            modal.className = 'sq-modal';
            modal.innerHTML = `
        <div class="sq-modal-content">
          <div class="sq-modal-header">
            <h3>Full Conversation</h3>
            <button class="sq-modal-close">✕</button>
          </div>
          <div class="sq-modal-body">
            ${(conv.conversation || []).map((msg, i) => {
                const isHighlighted = i >= result.segment.startIndex && i <= result.segment.endIndex;
                return `
                <div class="sq-full-msg ${isHighlighted ? 'sq-highlighted-msg' : ''} sq-role-${msg.role}">
                  <span class="sq-msg-role">${msg.role === 'user' ? '👤 You' : '🤖 AI'}</span>
                  <div class="sq-msg-content">${this.escapeHtml(msg.text)}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;

            document.body.appendChild(modal);

            // Close handlers
            modal.querySelector('.sq-modal-close').addEventListener('click', () => modal.remove());
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });
        }

        /**
         * Copy excerpt to clipboard
         */
        async copyExcerpt(idx) {
            const result = this.currentResults[idx];
            if (!result) return;

            const text = result.excerpt.map(m => `${m.role}: ${m.text}`).join('\n\n');

            try {
                await navigator.clipboard.writeText(text);
                this.showToast('Excerpt copied!');
            } catch (e) {
                this.showToast('Copy failed');
            }
        }

        /**
         * Toggle lens filter
         */
        toggleLens(container, type, btn) {
            const lensButtons = container.querySelectorAll('.sq-lens');

            // Update active state
            lensButtons.forEach(b => b.classList.remove('sq-lens-active'));
            btn.classList.add('sq-lens-active');

            // Filter results
            const resultCards = container.querySelectorAll('.sq-result-card');
            resultCards.forEach(card => {
                if (type === 'all' || card.dataset.type === type) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        }

        /**
         * Index all conversations
         */
        async indexAll(container) {
            const indexBtn = container.querySelector('#sq-index-btn');

            indexBtn.disabled = true;
            indexBtn.innerHTML = '<span class="sq-btn-icon">⏳</span> Indexing...';

            try {
                if (!this.memoryRetrieval) {
                    await this.initialize();
                }

                const result = await this.memoryRetrieval.indexAllConversations();
                this.showToast(`Indexed ${result.conversationsIndexed} conversations with ${result.segmentsCreated} segments`);
            } catch (error) {
                console.error('[SmartQuery] Index error:', error);
                this.showToast('Indexing failed: ' + error.message);
            } finally {
                indexBtn.disabled = false;
                indexBtn.innerHTML = '<span class="sq-btn-icon">📚</span> Index All';
            }
        }

        /**
         * Escape HTML
         */
        escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        /**
         * Show toast notification
         */
        showToast(message) {
            if (typeof window.toast === 'function') {
                window.toast(message);
            } else {
                console.log('[SmartQuery]', message);
            }
        }
    }

    // ============================================
    // LIVE AI ASSISTANT (KEPT FOR COMPATIBILITY)
    // ============================================
    class LiveAIAssistant {
        constructor() {
            this.conversationHistory = [];
            this.isProcessing = false;
        }

        async askAI(query, context = '') {
            if (!query || this.isProcessing) return null;
            this.isProcessing = true;

            try {
                const fullPrompt = context
                    ? `Context from conversation memory:\n${context}\n\nUser question: ${query}\n\nProvide a helpful, concise answer that synthesizes the information:`
                    : query;

                const response = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        type: 'call_llama',
                        payload: { action: 'prompt', text: fullPrompt }
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            resolve({ ok: false, error: chrome.runtime.lastError.message });
                        } else {
                            resolve(response);
                        }
                    });
                });

                this.isProcessing = false;

                if (response && response.ok && response.result) {
                    this.conversationHistory.push({
                        query: query,
                        response: response.result,
                        timestamp: Date.now()
                    });
                    return response.result;
                } else {
                    throw new Error(response?.error || 'AI request failed');
                }
            } catch (error) {
                this.isProcessing = false;
                throw error;
            }
        }
    }

    // Export to window
    if (typeof window !== 'undefined') {
        window.SmartQueryUI = SmartQueryUI;
        window.LiveAIAssistant = LiveAIAssistant;
    }

})();
