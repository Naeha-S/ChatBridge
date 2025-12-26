// smartQueries.js - Enhanced Smart Queries Tab with Luxury UI and Llama Integration
// This is the new Smart Queries command center with modern design

(function () {
    'use strict';

    // ============================================
    // LIVE AI ASSISTANT
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
                // Build prompt with context
                const fullPrompt = context
                    ? `Context from current conversation:\n${context}\n\nUser question: ${query}\n\nProvide a helpful, concise answer:`
                    : query;

                // Call Llama via background script
                const response = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        type: 'call_llama',
                        payload: {
                            action: 'prompt',
                            text: fullPrompt
                        }
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
                    // Add to conversation history
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

        renderAssistant(container) {
            if (!container) return;

            const html = `
        <div class="sq-assistant-card">
          <div class="sq-card-header">
            <div class="sq-header-icon">🤖</div>
            <h3 class="sq-card-title">Live AI Assistant</h3>
          </div>
          
          <div class="sq-assistant-body">
            <textarea 
              id="sq-ai-input" 
              class="sq-input-large" 
              placeholder="Ask anything about this conversation..."
              rows="3"
            ></textarea>
            
            <div class="sq-button-row">
              <button id="sq-ask-ai-btn" class="sq-btn sq-btn-primary">
                <span class="sq-btn-icon">✨</span>
                Ask AI
              </button>
              <button id="sq-clear-ai-btn" class="sq-btn sq-btn-secondary">
                Clear
              </button>
            </div>

            <div id="sq-ai-response" class="sq-response-area" style="display:none;">
              <div class="sq-response-header">
                <span class="sq-response-label">💬 AI Response</span>
                <div class="sq-response-actions">
                  <button class="sq-icon-btn" id="sq-copy-response" title="Copy response">📋</button>
                  <button class="sq-icon-btn" id="sq-insert-response" title="Insert to chat">➕</button>
                </div>
              </div>
              <div id="sq-response-content" class="sq-response-content"></div>
            </div>

            <div id="sq-followups" class="sq-followups" style="display:none;">
              <div class="sq-followups-label">💡 Follow-up questions:</div>
              <div id="sq-followups-list" class="sq-followups-list"></div>
            </div>
          </div>
        </div>
      `;

            container.innerHTML = html;

            // Add event listeners
            this.attachAssistantEvents(container);
        }

        attachAssistantEvents(container) {
            const input = container.querySelector('#sq-ai-input');
            const askBtn = container.querySelector('#sq-ask-ai-btn');
            const clearBtn = container.querySelector('#sq-clear-ai-btn');
            const responseArea = container.querySelector('#sq-ai-response');
            const responseContent = container.querySelector('#sq-response-content');
            const copyBtn = container.querySelector('#sq-copy-response');
            const insertBtn = container.querySelector('#sq-insert-response');

            let currentResponse = '';

            // Ask AI
            askBtn.addEventListener('click', async () => {
                const query = input.value.trim();
                if (!query) return;

                // Show loading state
                askBtn.disabled = true;
                askBtn.innerHTML = '<span class="sq-btn-icon">⏳</span> Processing...';
                responseArea.style.display = 'block';
                responseContent.innerHTML = '<div class="sq-loading">Thinking...</div>';

                try {
                    // Get conversation context
                    const context = this.getConversationContext();

                    // Ask AI
                    const response = await this.askAI(query, context);
                    currentResponse = response;

                    // Display response
                    responseContent.innerHTML = this.formatResponse(response);

                    // Generate and show follow-ups
                    this.showFollowups(query, response, container);

                    // Show toast
                    this.showToast('AI response generated!');
                } catch (error) {
                    responseContent.innerHTML = `
            <div class="sq-error">
              <span class="sq-error-icon">⚠️</span>
              <span>${error.message || 'Failed to get AI response'}</span>
            </div>
          `;
                } finally {
                    askBtn.disabled = false;
                    askBtn.innerHTML = '<span class="sq-btn-icon">✨</span> Ask AI';
                }
            });

            // Clear input
            clearBtn.addEventListener('click', () => {
                input.value = '';
                responseArea.style.display = 'none';
                container.querySelector('#sq-followups').style.display = 'none';
            });

            // Copy response
            copyBtn.addEventListener('click', async () => {
                if (currentResponse) {
                    await navigator.clipboard.writeText(currentResponse);
                    this.showToast('Response copied!');
                }
            });

            // Insert response
            insertBtn.addEventListener('click', async () => {
                if (currentResponse && typeof window.restoreToChat === 'function') {
                    await window.restoreToChat(currentResponse, []);
                    this.showToast('Response inserted to chat!');
                }
            });

            // Enter to submit
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    askBtn.click();
                }
            });
        }

        getConversationContext() {
            // Try to get current conversation
            try {
                const adapter = window.pickAdapter ? window.pickAdapter() : null;
                if (adapter && adapter.getMessages) {
                    const messages = adapter.getMessages();
                    return messages
                        .slice(-5) // Last 5 messages
                        .map(m => `${m.role}: ${m.text}`)
                        .join('\n\n');
                }
            } catch (e) { }
            return '';
        }

        formatResponse(text) {
            if (!text) return '';

            // Simple markdown-like formatting
            let formatted = text
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                .replace(/`(.+?)`/g, '<code>$1</code>')
                .replace(/\n/g, '<br>');

            return `<div class="sq-response-text">${formatted}</div>`;
        }

        showFollowups(query, response, container) {
            const followupsDiv = container.querySelector('#sq-followups');
            const followupsList = container.querySelector('#sq-followups-list');

            // Generate 3 follow-up questions
            const followups = this.generateFollowups(query, response);

            if (followups.length > 0) {
                followupsList.innerHTML = followups.map(q => `
          <button class="sq-followup-chip" data-question="${this.escapeHtml(q)}">
            ${q}
          </button>
        `).join('');

                followupsDiv.style.display = 'block';

                // Add click handlers
                followupsList.querySelectorAll('.sq-followup-chip').forEach(btn => {
                    btn.addEventListener('click', () => {
                        container.querySelector('#sq-ai-input').value = btn.dataset.question;
                        container.querySelector('#sq-ask-ai-btn').click();
                    });
                });
            }
        }

        generateFollowups(query, response) {
            const followups = [];
            const lowerQuery = query.toLowerCase();
            const lowerResponse = response.toLowerCase();

            // Pattern-based follow-ups
            if (lowerQuery.includes('how')) {
                followups.push('Can you show me a specific example?');
            }
            if (lowerQuery.includes('what')) {
                followups.push('How does this compare to alternatives?');
            }
            if (lowerQuery.includes('why')) {
                followups.push('Are there any exceptions to this?');
            }
            if (lowerResponse.includes('code') || lowerResponse.includes('implement')) {
                followups.push('What are the potential issues I should watch for?');
            }

            // Default follow-ups if none generated
            if (followups.length === 0) {
                followups.push('Can you elaborate on that?', 'What are best practices here?', 'Are there common pitfalls?');
            }

            return followups.slice(0, 3);
        }

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        showToast(message) {
            if (typeof window.toast === 'function') {
                window.toast(message);
            }
        }
    }

    // Export to window
    if (typeof window !== 'undefined') {
        window.LiveAIAssistant = LiveAIAssistant;
    }

})();
