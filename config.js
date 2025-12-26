// config.js - API Keys Configuration
// Simple config with direct API keys (for demo/dev use)

const CONFIG = {
    GEMINI_API_KEY: '',
    HUGGINGFACE_API_KEY: '',
};

if (typeof window !== 'undefined') {
    window.CHATBRIDGE_CONFIG = CONFIG;
}
