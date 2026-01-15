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
          <div style="font-size: 13px;">No conversations found</div>
        </div>
      `;
            return;
        }

        // Helper: Generate 3-word title from conversation
        function generateShortTitle(conv) {
            const msgs = conv.conversation || [];
            const firstUser = msgs.find(m => m.role === 'user' || m.type === 'human');
            const text = firstUser?.content || firstUser?.text || msgs[0]?.content || msgs[0]?.text || '';

            const stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'i', 'you', 'we', 'they', 'it', 'this', 'that', 'what', 'how', 'can', 'do', 'please', 'help', 'me', 'my'];
            const words = text.toLowerCase()
                .replace(/[^a-z0-9\s]/g, '')
                .split(/\s+/)
                .filter(w => w.length > 2 && !stopWords.includes(w));

            if (words.length === 0) return formatPlatform(conv.platform || conv.host || 'Chat');

            return words.slice(0, 3)
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');
        }

        conversationList.innerHTML = filteredConversations.map((conv, i) => {
            const title = generateShortTitle(conv);
            const date = new Date(conv.ts || conv.timestamp || Date.now());
            const timeAgo = getTimeAgo(date);
            const msgCount = conv.conversation ? conv.conversation.length : 0;
            const isActive = conversations.indexOf(conv) === selectedIndex;

            return `
        <div class="list-item ${isActive ? 'active' : ''}" data-index="${conversations.indexOf(conv)}">
          <div class="item-header">
            <div class="item-platform">${title}</div>
            <div class="item-time">${timeAgo}</div>
          </div>
          <div class="item-preview">${msgCount} msgs</div>
        </div>
      `;
        }).join('');

        // Re-apply translations for "All" chip if list re-render triggered it
        if (window.t) {
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                el.textContent = window.t(key, currentLang);
            });
        }
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

        // List Selection
        conversationList.addEventListener('click', (e) => {
            const item = e.target.closest('.list-item');
            if (!item) return;

            const index = parseInt(item.dataset.index);
            selectConversation(index);
        });

        // Actions
        btnCopy.addEventListener('click', copyConversation);
        btnDelete.addEventListener('click', deleteConversation);
        btnClose.addEventListener('click', clearDetail);
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
        if (window.innerWidth < 768) {
            document.querySelector('.sidebar').style.display = 'none';
            document.querySelector('.main').style.display = 'flex';
            btnClose.style.display = 'flex';
        }
    }

    async function deleteConversation() {
        if (selectedIndex === -1) return;
        if (!confirm('Delete this conversation?')) return;

        conversations.splice(selectedIndex, 1);

        // Save to all keys
        const updates = {};
        STORAGE_KEYS.forEach(key => updates[key] = conversations);

        await new Promise(r => chrome.storage.local.set(updates, r));

        clearDetail();
        filterConversations(searchInput.value.toLowerCase(), document.querySelector('.chip.active').dataset.filter);
        renderFilters(); // Update chips if platform removed
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
        document.body.classList.remove('theme-light', 'theme-synthwave', 'theme-aurora');
        if (theme === 'light') document.body.classList.add('theme-light');
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
