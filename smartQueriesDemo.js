// Theme cycling via cb_theme storage
const SQ_THEMES = ['dark', 'light', 'synthwave', 'skeuomorphic', 'brutalism', 'glass'];
const SQ_THEME_LABELS = { dark: '🌙 Dark', light: '☀️ Light', synthwave: '🌆 Synthwave', skeuomorphic: '🔩 Skeuomorphic', brutalism: '🧱 Brutalism', glass: '🫧 Claymorphism' };
let sqCurrentTheme = 'dark';

function applySqTheme(theme) {
    SQ_THEMES.forEach(t => document.body.classList.remove('sq-theme-' + t));
    if (theme !== 'dark') document.body.classList.add('sq-theme-' + theme);
    sqCurrentTheme = theme;
    const btn = document.getElementById('sq-theme-toggle');
    if (btn) btn.textContent = SQ_THEME_LABELS[theme] || '🎨 Theme';
}

document.getElementById('sq-theme-toggle').addEventListener('click', function () {
    const idx = SQ_THEMES.indexOf(sqCurrentTheme);
    const next = SQ_THEMES[(idx + 1) % SQ_THEMES.length];
    applySqTheme(next);
    try { chrome.storage.local.set({ cb_theme: next }); } catch (e) {
        localStorage.setItem('sq-theme', next);
    }
});

// Load theme from cb_theme storage
try {
    chrome.storage.local.get(['cb_theme'], r => {
        if (r && r.cb_theme) applySqTheme(r.cb_theme);
    });
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.cb_theme) applySqTheme(changes.cb_theme.newValue || 'dark');
    });
} catch (e) {
    const saved = localStorage.getItem('sq-theme');
    if (saved) applySqTheme(saved);
}

// Mock chrome.runtime for demo
if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
    window.chrome = window.chrome || {};
    window.chrome.runtime = window.chrome.runtime || {};
    window.chrome.runtime.sendMessage = function (msg, callback) {
        // Mock Llama response for demo
        setTimeout(() => {
            if (msg.type === 'call_llama') {
                const responses = [
                    `This is a demo response from the AI assistant.\n\nThe question was: "${msg.payload.text}"\n\n**Key Points:**\n- AI synthesis is working perfectly\n- This is a simulated response for the demo\n- In production, Llama 3.1 would process your query\n- Responses are based on conversation context`,
                    `**Summary of Findings:**\n\n1. **Primary Theme**: Your conversations focus on technical implementation and architecture\n2. **Decision Points**: Multiple architectural decisions were made with careful consideration\n3. **Evolution**: Your understanding of the system evolved significantly through discussion\n4. **Key Insights**: Integration between components is critical for performance`,
                    `Based on the conversation context:\n\n**Main Topics Discussed:**\n- System architecture and design patterns\n- Implementation strategies and best practices\n- Integration points between different modules\n- Performance optimization techniques\n\n**Notable Patterns:**\nThe conversation shows a progression from high-level planning to implementation details, with a focus on maintaining code quality and system reliability.`
                ];
                const response = responses[Math.floor(Math.random() * responses.length)];
                if (callback) callback({ ok: true, result: response });
            }
        }, 1500);
    };
}

// Mock pick adapter for demo
if (typeof window.pickAdapter === 'undefined') {
    window.pickAdapter = function () {
        return {
            getMessages: function () {
                return [
                    { role: 'user', text: 'How do I implement advanced caching strategies?' },
                    { role: 'assistant', text: 'There are several effective caching strategies you can implement. Let me break down the most important ones...' },
                    { role: 'user', text: 'What about memory efficiency?' },
                    { role: 'assistant', text: 'Memory efficiency is crucial. You should consider using weak references, object pooling, and implementing cache eviction policies...' },
                    { role: 'user', text: 'Can you give me a concrete example?' }
                ];
            }
        };
    };
}

// Mock MemoryRetrieval for demo
if (typeof window.MemoryRetrieval === 'undefined') {
    window.MemoryRetrieval = class {
        async initialize() { }

        async search(query, options = {}) {
            // Generate mock results
            const mockData = [
                {
                    score: 0.95,
                    segment: { timestamp: new Date(Date.now() - 86400000).toISOString() },
                    excerpt: [
                        { role: 'user', text: 'How should I structure my authentication system?' },
                        { role: 'assistant', text: 'A good authentication system should have clear separation of concerns...' }
                    ]
                },
                {
                    score: 0.87,
                    segment: { timestamp: new Date(Date.now() - 172800000).toISOString() },
                    excerpt: [
                        { role: 'user', text: 'What are the best practices for API design?' },
                        { role: 'assistant', text: 'API design is critical for maintainability and usability. Consider RESTful principles...' }
                    ]
                },
                {
                    score: 0.79,
                    segment: { timestamp: new Date(Date.now() - 259200000).toISOString() },
                    excerpt: [
                        { role: 'user', text: 'How do I handle errors gracefully?' },
                        { role: 'assistant', text: 'Error handling is essential for user experience. Implement proper logging...' }
                    ]
                },
                {
                    score: 0.71,
                    segment: { timestamp: new Date(Date.now() - 345600000).toISOString() },
                    excerpt: [
                        { role: 'user', text: 'What about database optimization?' },
                        { role: 'assistant', text: 'Database optimization involves query planning, indexing, and proper schema design...' }
                    ]
                },
                {
                    score: 0.65,
                    segment: { timestamp: new Date(Date.now() - 432000000).toISOString() },
                    excerpt: [
                        { role: 'user', text: 'How do I scale microservices?' },
                        { role: 'assistant', text: 'Scaling microservices requires careful planning of communication patterns...' }
                    ]
                }
            ];

            return mockData.slice(0, options.limit || 8);
        }
    };
}

// Initialize Smart Queries UI
document.addEventListener('DOMContentLoaded', async () => {
    const container = document.querySelector('#smartQueriesDemo');
    const ui = new SmartQueryUI();
    await ui.initialize();
    ui.render(container);
});
