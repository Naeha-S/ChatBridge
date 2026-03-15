const ChatBridgePlatformRegistry = (() => {
  const platformNames = {
    'chat.openai.com': 'ChatGPT',
    'chatgpt.com': 'ChatGPT',
    'gemini.google.com': 'Gemini',
    'claude.ai': 'Claude',
    'chat.mistral.ai': 'Mistral',
    'deepseek.ai': 'DeepSeek',
    'chat.deepseek.com': 'DeepSeek',
    'perplexity.ai': 'Perplexity',
    'www.perplexity.ai': 'Perplexity',
    'poe.com': 'Poe',
    'x.ai': 'Grok',
    'copilot.microsoft.com': 'Copilot',
    'www.bing.com': 'Bing AI',
    'meta.ai': 'Meta AI',
    'huggingface.co': 'HuggingChat',
    'you.com': 'You.com',
    'phind.com': 'Phind',
    'character.ai': 'Character AI',
    'beta.character.ai': 'Character AI',
    'replika.ai': 'Replika',
    'jasper.ai': 'Jasper',
    'writesonic.com': 'Writesonic',
    'app.writesonic.com': 'Writesonic',
    'forefront.ai': 'Forefront',
    'open-assistant.io': 'Open Assistant',
    'kuki.ai': 'Kuki'
  };

  const approvedSites = [
    'chat.openai.com',
    'chatgpt.com',
    'gemini.google.com',
    'claude.ai',
    'chat.mistral.ai',
    'copilot.microsoft.com',
    'www.bing.com',
    'perplexity.ai',
    'www.perplexity.ai',
    'you.com',
    'phind.com',
    'poe.com',
    'huggingface.co',
    'forefront.ai',
    'deepseek.ai',
    'chat.deepseek.com',
    'open-assistant.io',
    'x.ai',
    'meta.ai',
    'character.ai',
    'beta.character.ai',
    'replika.ai',
    'jasper.ai',
    'writesonic.com',
    'app.writesonic.com',
    'kuki.ai'
  ];

  const targetHosts = {
    chatgpt: ['chat.openai.com', 'chatgpt.com'],
    claude: ['claude.ai'],
    gemini: ['gemini.google.com'],
    copilot: ['copilot.microsoft.com'],
    perplexity: ['perplexity.ai', 'www.perplexity.ai'],
    mistral: ['chat.mistral.ai'],
    poe: ['poe.com'],
    deepseek: ['chat.deepseek.com', 'deepseek.ai'],
    grok: ['x.ai'],
    meta: ['meta.ai']
  };

  const continueInsertSelectors = [
    'textarea[data-id="root"]',
    'textarea#prompt-textarea',
    'div[contenteditable="true"]',
    'textarea',
    '[role="textbox"]',
    'input[type="text"]'
  ];

  function normalizeHost(hostname) {
    return String(hostname || '').toLowerCase().trim();
  }

  function isApprovedHost(hostname) {
    const host = normalizeHost(hostname);
    if (!host) return false;
    if (host === 'localhost') return true;
    return approvedSites.some((site) => host === site || host.endsWith(`.${site}`));
  }

  function getPlatformName(hostname) {
    const host = normalizeHost(hostname).replace(/^www\./, '');
    return platformNames[host] || platformNames[`www.${host}`] || null;
  }

  function getTargetHosts(target) {
    return targetHosts[String(target || '').toLowerCase()] || [];
  }

  return {
    approvedSites,
    platformNames,
    targetHosts,
    continueInsertSelectors,
    isApprovedHost,
    getPlatformName,
    getTargetHosts
  };
})();

if (typeof window !== 'undefined') {
  window.ChatBridgePlatformRegistry = ChatBridgePlatformRegistry;
}
