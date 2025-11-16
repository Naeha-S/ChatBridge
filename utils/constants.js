const ChatBridgeConstants = {
  APPROVED_SITES: [
    'chat.openai.com',
    'chatgpt.com',
    'gemini.google.com',
    'claude.ai',
    'chat.mistral.ai',
    'deepseek.ai',
    'www.perplexity.ai',
    'perplexity.ai',
    'poe.com',
    'x.ai',
    'copilot.microsoft.com',
    'www.bing.com',
    'meta.ai'
  ],

  TIMING: {
    DOM_STABLE_MS: 150,
    DOM_STABLE_TIMEOUT_MS: 2000,
    SCROLL_STEP_PAUSE_MS: 80,
    DEBOUNCE_DELAY: 300,
    RAG_PRELOAD_DELAY: 2000,
    CONFIG_CACHE_MS: 60000
  },

  LIMITS: {
    MAX_MESSAGES: 200,
    SCROLL_MAX_STEPS: 20,
    MAX_CHUNK_SIZE: 14000,
    MAX_PARALLEL: 3,
    PREVIEW_LENGTH: 120
  },

  STORAGE_KEYS: {
    CONFIG: 'chatbridge_config',
    THEME: 'cb_theme',
    REWRITE_STYLE: 'chatbridge:pref:rewStyle',
    REWRITE_STYLE_HINT: 'chatbridge:pref:rewStyleHint',
    TRANS_LANG: 'chatbridge:pref:transLang',
    HISTORY: 'chatbridge:history',
    CACHE_PREFIX: 'chatbridge:cache:'
  },

  MESSAGES: {
    SCAN_CHAT: 'scan_chat',
    REWRITE: 'rewrite',
    SUMMARIZE: 'summarize',
    TRANSLATE: 'translate',
    SYNC_TONE: 'syncTone',
    OPEN_AND_RESTORE: 'open_and_restore',
    RESTORE_TO_CHAT: 'restore_to_chat',
    KEYBOARD_COMMAND: 'keyboard_command',
    GET_AI_MODELS: 'get_ai_models',
    CALL_GEMINI: 'call_gemini',
    CALL_OPENAI: 'call_openai'
  },

  API: {
    GEMINI_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models',
    OPENAI_ENDPOINT: 'https://api.openai.com/v1/chat/completions'
  },

  TARGET_MODELS: {
    GEMINI: 'https://gemini.google.com/app',
    CLAUDE: 'https://claude.ai/new',
    CHATGPT: 'https://chatgpt.com/',
    COPILOT: 'https://copilot.microsoft.com/'
  },

  REGEX: {
    FILLER_PHRASES: /\b(actually|basically|essentially|literally|honestly|frankly|obviously|clearly|simply|just|really|very|quite|rather|fairly|pretty|somewhat|kind of|sort of)\b/gi,
    META_TEXT: /^(As (an AI|a language model|ChatGPT|Claude|Gemini)|I (don't|can't|cannot) (have|provide)|I'm (sorry|afraid|unable)|Please note|Disclaimer:|Important:|Note:)/gm,
    HEDGING: /\b(might|maybe|perhaps|possibly|probably|likely|seems|appears|tends to)\b/gi,
    MULTIPLE_SPACES: /\s+/g,
    MULTIPLE_NEWLINES: /\n{3,}/g
  }
};

if (typeof window !== 'undefined') {
  window.ChatBridgeConstants = ChatBridgeConstants;
}
