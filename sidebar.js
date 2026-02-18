// sidebar.js - ChatBridge History Viewer

(function () {
    'use strict';

    // State
    let conversations = [];
    let filteredConversations = [];
    let selectedIndex = -1;
    let currentLang = 'en';

    // Elements
    const searchInput = document.getElementById('search');
    const filterChips = document.getElementById('filter-chips');
    const conversationList = document.getElementById('conversation-list');
    const messagesContainer = document.getElementById('messages-container');
    const viewerHeader = document.getElementById('viewer-header');
    const emptyViewer = document.getElementById('empty-viewer');
    const headerTitle = document.getElementById('header-title');
    const headerMeta = document.getElementById('header-meta');
    const btnCopy = document.getElementById('btn-copy');
    const btnDelete = document.getElementById('btn-delete');
    const btnClose = document.getElementById('btn-close');

    // ============================================
    // INITIALIZATION
    // ============================================
    async function init() {
        // Load settings
        const settings = await chrome.storage.local.get(['cb_theme', 'cb_language']);
        applyTheme(settings.cb_theme || 'dark');
        currentLang = settings.cb_language || 'en';

        // Load conversations
        await loadConversations();

        // Render
        renderFilters();
        renderList();
        applyTranslations(currentLang);

        // Event Listeners
        setupEventListeners();

        // Handle initial selection if passed in URL
        const urlParams = new URLSearchParams(window.location.search);
        const initialIndex = urlParams.get('index');
        if (initialIndex !== null) {
            selectConversation(parseInt(initialIndex));
        }
    }

    // ============================================
    // DATA LOADING
    // ============================================
    const STORAGE_KEYS = [
        'chatbridge:conversations',
        'chatbridge_conversations_v1',
        'chatbridge_conversations'
    ];

    async function loadConversations() {
        return new Promise((resolve) => {
            chrome.storage.local.get(STORAGE_KEYS, (result) => {
                for (const key of STORAGE_KEYS) {
                    if (result[key] && Array.isArray(result[key])) {
                        conversations = result[key];
                        filteredConversations = [...conversations];
                        resolve();
                        return;
                    }
                }
                conversations = [];
                filteredConversations = [];
                resolve();
            });
        });
    }

    // ============================================
    // RENDERING
    // ============================================
    function renderFilters() {
        const platforms = new Set(conversations.map(c => c.platform || c.host || 'Unknown').map(p => p.toLowerCase()));
        const platformArr = ['all', ...Array.from(platforms)];

        const currentFilter = document.querySelector('.chip.active')?.dataset.filter || 'all';

        filterChips.innerHTML = platformArr.map(p => `
      <div class="chip ${p === currentFilter ? 'active' : ''}" 
           data-filter="${p}"
           ${p === 'all' ? 'data-i18n="all"' : ''}>
        ${p === 'all' ? (window.t ? window.t('all', currentLang) : 'All') : formatPlatform(p)}
      </div>
    `).join('');
    }

    function renderList() {
        if (!filteredConversations.length) {
            conversationList.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
          <div style="font-size: 13px;">${window.t ? window.t('noConversations', currentLang) : 'No conversations found'}</div>
        </div>
      `;
            return;
        }

        // Grouping logic
        const groups = {
            today: [],
            yesterday: [],
            thisWeek: [],
            older: []
        };

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const yesterday = today - 86400000;
        const thisWeek = today - (now.getDay() * 86400000);

        filteredConversations.forEach(conv => {
            const date = new Date(conv.ts || conv.timestamp || Date.now()).getTime();
            if (date >= today) groups.today.push(conv);
            else if (date >= yesterday) groups.yesterday.push(conv);
            else if (date >= thisWeek) groups.thisWeek.push(conv);
            else groups.older.push(conv);
        });

        const groupLabels = {
            today: window.t ? window.t('today', currentLang) : 'Today',
            yesterday: window.t ? window.t('yesterday', currentLang) : 'Yesterday',
            thisWeek: window.t ? window.t('thisWeek', currentLang) : 'This Week',
            older: window.t ? window.t('older', currentLang) : 'Older'
        };

        let html = '';
        for (const [key, items] of Object.entries(groups)) {
            if (items.length > 0) {
                html += `<div class="date-group-header">${groupLabels[key]}</div>`;
                html += `<div class="date-group">`;
                items.forEach(conv => {
                    html += createConversationCard(conv);
                });
                html += `</div>`;
            }
        }

        conversationList.innerHTML = html;

        // Re-apply translations for static elements if needed
        applyTranslations(currentLang);
    }

    function createConversationCard(conv) {
        const platform = (conv.platform || conv.host || 'Unknown').toLowerCase();
        const platformEmoji = getPlatformEmoji(platform);
        const msgCount = conv.conversation ? conv.conversation.length : 0;
        const date = new Date(conv.ts || conv.timestamp || Date.now());
        const timeAgo = getTimeAgo(date);
        const previewText = getPreviewText(conv);
        const isActive = conversations.indexOf(conv) === selectedIndex;
        const index = conversations.indexOf(conv);

        return `
            <div class="list-item ${isActive ? 'active' : ''}" data-index="${index}">
                <div class="item-header">
                    <div class="item-platform-wrap">
                        <span class="platform-icon">${platformEmoji}</span>
                        <div class="item-platform">${formatPlatform(platform)}</div>
                    </div>
                    <div class="item-time">${timeAgo}</div>
                </div>
                <div class="item-preview">${previewText}</div>
                <div class="item-footer">
                    <span class="msg-count-badge">${msgCount} msg${msgCount !== 1 ? 's' : ''}</span>
                    <div class="item-actions">
                        <button class="item-action-btn btn-load" data-index="${index}" title="Load">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                            </svg>
                        </button>
                        <button class="item-action-btn delete btn-item-delete" data-index="${index}" title="Delete">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    function getPlatformEmoji(p) {
        const emojis = {
            'chatgpt': '🤖',
            'claude': '🧠',
            'gemini': '✨',
            'perplexity': '🔍',
            'poe': '🐝',
            'copilot': '🪟',
            'deepseek': '🌊',
            'mistral': '🌪️'
        };
        return emojis[p] || '💬';
    }

    function formatPlatform(p) {
        if (!p) return 'Unknown';
        return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    }

    function getPreviewText(conv) {
        if (!conv.conversation || !conv.conversation.length) return 'Empty conversation';
        // Find first user message
        const firstMsg = conv.conversation.find(m => m.role === 'user' || m.type === 'human');
        if (firstMsg) return firstMsg.content || firstMsg.text || 'Image content';
        return conv.conversation[0].content || conv.conversation[0].text || 'Content';
    }

    function renderDetail(index) {
        const conv = conversations[index];
        if (!conv) return;

        // Show viewer, hide empty state
        emptyViewer.style.display = 'none';
        viewerHeader.style.display = 'flex';
        messagesContainer.style.display = 'block';

        // Header
        const platform = formatPlatform(conv.platform || conv.host || 'Unknown');
        const msgCount = conv.conversation ? conv.conversation.length : 0;

        headerTitle.textContent = platform;
        headerMeta.textContent = `${msgCount} ${window.t ? window.t('messages', currentLang) : 'messages'}`; // i18n handled by applyTranslations usually, but dynamic here

        // Messages
        messagesContainer.innerHTML = (conv.conversation || []).map(msg => {
            const role = (msg.role === 'user' || msg.type === 'human') ? 'user' : 'ai';
            const content = msg.content || msg.text || '';
            // Simple Markdown-ish processing (bold, code blocks)
            const formattedContent = content
                .replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
                .replace(/`([^`]+)`/g, '<code>$1</code>')
                .replace(/\n/g, '<br>');

            return `
        <div class="message ${role}">
          <span class="sender-name">${role === 'user' ? 'You' : 'AI'}</span>
          <div class="bubble">${formattedContent}</div>
        </div>
      `;
        }).join('');

        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function clearDetail() {
        selectedIndex = -1;
        emptyViewer.style.display = 'flex';
        viewerHeader.style.display = 'none';
        messagesContainer.style.display = 'none';

        // Update active state in list
        document.querySelectorAll('.list-item').forEach(el => el.classList.remove('active'));

        // Reset mobile view
        document.querySelector('.sidebar').style.display = '';
        document.querySelector('.main').classList.remove('active');
        btnClose.style.display = 'none';
    }

    // ============================================
    // LOGIC & EVENTS
    // ============================================
    function setupEventListeners() {
        // Search
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            filterConversations(query, document.querySelector('.chip.active').dataset.filter);
        });

        // Chips
        filterChips.addEventListener('click', (e) => {
            const chip = e.target.closest('.chip');
            if (!chip) return;

            document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            const filter = chip.dataset.filter;
            filterConversations(searchInput.value.toLowerCase(), filter);
        });

        // List Item Selection & Actions (using delegation)
        conversationList.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.btn-item-delete');
            if (deleteBtn) {
                e.stopPropagation();
                const index = parseInt(deleteBtn.dataset.index);
                deleteConversationByIndex(index);
                return;
            }

            const loadBtn = e.target.closest('.btn-load');
            if (loadBtn) {
                e.stopPropagation();
                const index = parseInt(loadBtn.dataset.index);
                selectConversation(index);
                return;
            }

            const item = e.target.closest('.list-item');
            if (item) {
                const index = parseInt(item.dataset.index);
                selectConversation(index);
            }
        });

        // Actions
        btnCopy.addEventListener('click', copyConversation);
        btnDelete.addEventListener('click', deleteConversation);
        btnClose.addEventListener('click', clearDetail);

        const btnClearAll = document.getElementById('btn-clear-all');
        if (btnClearAll) {
            btnClearAll.addEventListener('click', clearAllHistory);
        }

        // Resize listener for responsive reset
        window.addEventListener('resize', () => {
            if (window.innerWidth >= 768) {
                document.querySelector('.sidebar').style.display = '';
                document.querySelector('.main').classList.remove('active');
                btnClose.style.display = 'none';
            }
        });
    }

    function filterConversations(query, platformFilter) {
        filteredConversations = conversations.filter(conv => {
            const platform = (conv.platform || conv.host || '').toLowerCase();
            const content = JSON.stringify(conv.conversation || '').toLowerCase();

            const matchesPlatform = platformFilter === 'all' || platform === platformFilter;
            const matchesQuery = !query || platform.includes(query) || content.includes(query);

            return matchesPlatform && matchesQuery;
        });

        renderList();
        // Maintain selection if still visible
        if (selectedIndex !== -1 && filteredConversations.includes(conversations[selectedIndex])) {
            const item = document.querySelector(`.list-item[data-index="${selectedIndex}"]`);
            if (item) item.classList.add('active');
        }
    }

    function selectConversation(index) {
        if (index < 0 || index >= conversations.length) return;

        selectedIndex = index;
        renderDetail(index);
        renderList(); // Re-render to update active class logic

        // Mobile view handling (if we add responsive styles)
        // Mobile view handling
        if (window.innerWidth < 768) {
            document.querySelector('.sidebar').style.display = 'none';
            document.querySelector('.main').classList.add('active');
            btnClose.style.display = 'flex';
        }
    }

    async function deleteConversation() {
        if (selectedIndex === -1) return;
        deleteConversationByIndex(selectedIndex);
    }

    async function deleteConversationByIndex(index) {
        if (index < 0 || index >= conversations.length) return;
        if (!confirm('Delete this conversation?')) return;

        conversations.splice(index, 1);

        // Save to all keys
        const updates = {};
        for (const key of STORAGE_KEYS) {
            updates[key] = conversations;
        }

        await new Promise(r => chrome.storage.local.set(updates, r));

        if (selectedIndex === index) {
            clearDetail();
        } else if (selectedIndex > index) {
            selectedIndex--; // Adjust for item removed before selection
        }

        filterConversations(searchInput.value.toLowerCase(), document.querySelector('.chip.active').dataset.filter);
        renderFilters();
    }

    async function clearAllHistory() {
        if (!conversations.length) return;
        if (!confirm('Are you sure you want to clear ALL history? This cannot be undone.')) return;

        conversations = [];
        filteredConversations = [];

        const updates = {};
        for (const key of STORAGE_KEYS) {
            updates[key] = [];
        }

        await new Promise(r => chrome.storage.local.set(updates, r));

        clearDetail();
        renderFilters();
        renderList();
    }

    function copyConversation() {
        if (selectedIndex === -1) return;
        const conv = conversations[selectedIndex];

        const text = (conv.conversation || []).map(m => {
            const role = (m.role === 'user' || m.type === 'human') ? 'User' : 'AI';
            return `[${role}]: ${m.content || m.text}`;
        }).join('\n\n');

        navigator.clipboard.writeText(text).then(() => {
            const icon = btnCopy.innerHTML;
            btnCopy.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            setTimeout(() => btnCopy.innerHTML = icon, 2000);

            // Toast fallback if needed, but button change is good feedback
        });
    }

    function getTimeAgo(date) {
        const t = window.t || ((k) => k);
        const now = new Date();
        const diff = now - date;
        const mins = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (mins < 1) return t('justNow', currentLang);
        if (mins < 60) return `${mins}${t('mAgo', currentLang)}`;
        if (hours < 24) return `${hours}${t('hAgo', currentLang)}`;
        if (days < 7) return `${days}${t('dAgo', currentLang)}`;
        return date.toLocaleDateString();
    }

    function applyTheme(theme) {
        document.body.classList.remove('theme-light', 'theme-synthwave', 'theme-skeuomorphic', 'theme-brutalism', 'theme-glass');
        if (theme !== 'dark') {
            document.body.classList.add('theme-' + theme);
        }
    }

    function applyTranslations(lang) {
        if (!window.t) return;

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.textContent = window.t(key, lang);
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = window.t(key, lang);
        });
    }

    // Init
    init();

})();
