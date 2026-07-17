const fs = require('fs');
const path = require('path');

// Load registry into test environment
const registryCode = fs.readFileSync(path.resolve(__dirname, '../../utils/platformRegistry.js'), 'utf8');
eval(registryCode);

describe('Platform Registry - New AI Chat Websites', () => {
  test('correctly approves new AI chat domains', () => {
    const newDomains = [
      'duck.ai',
      'chat.cohere.com',
      'coral.cohere.com',
      'cohere.com',
      'chat.qwen.ai',
      'qwen.ai',
      'chat.lmsys.org',
      'arena.lmsys.org',
      'openrouter.ai',
      'chat.deepinfra.com',
      'deepinfra.com',
      'kimi.com',
      'kimi.la',
      'kimi.moonshot.cn',
      'doubao.com',
      'chatglm.cn'
    ];

    newDomains.forEach((domain) => {
      expect(ChatBridgePlatformRegistry.isApprovedHost(domain)).toBe(true);
      expect(ChatBridgePlatformRegistry.isApprovedHost(`www.${domain}`)).toBe(true);
    });
  });

  test('correctly resolves platform names for new domains', () => {
    const mappings = {
      'duck.ai': 'DuckDuckGo AI Chat',
      'duckduckgo.com': 'DuckDuckGo AI Chat',
      'chat.cohere.com': 'Cohere Coral',
      'coral.cohere.com': 'Cohere Coral',
      'cohere.com': 'Cohere Coral',
      'chat.qwen.ai': 'Qwen',
      'qwen.ai': 'Qwen',
      'chat.lmsys.org': 'LMSYS Chatbot Arena',
      'arena.lmsys.org': 'LMSYS Chatbot Arena',
      'openrouter.ai': 'OpenRouter',
      'chat.deepinfra.com': 'DeepInfra Chat',
      'deepinfra.com': 'DeepInfra Chat',
      'kimi.com': 'Kimi Chat',
      'kimi.la': 'Kimi Chat',
      'kimi.moonshot.cn': 'Kimi Chat',
      'doubao.com': 'Doubao',
      'chatglm.cn': 'Zhipu Qingyan'
    };

    Object.entries(mappings).forEach(([domain, expectedName]) => {
      expect(ChatBridgePlatformRegistry.getPlatformName(domain)).toBe(expectedName);
      expect(ChatBridgePlatformRegistry.getPlatformName(`www.${domain}`)).toBe(expectedName);
    });
  });

  test('correctly maps target hosts for continuation routing', () => {
    expect(ChatBridgePlatformRegistry.getTargetHosts('duckduckgo')).toEqual(['duck.ai', 'duckduckgo.com']);
    expect(ChatBridgePlatformRegistry.getTargetHosts('cohere')).toEqual(['chat.cohere.com', 'coral.cohere.com', 'cohere.com']);
    expect(ChatBridgePlatformRegistry.getTargetHosts('qwen')).toEqual(['chat.qwen.ai', 'qwen.ai']);
    expect(ChatBridgePlatformRegistry.getTargetHosts('lmsys')).toEqual(['chat.lmsys.org', 'arena.lmsys.org']);
    expect(ChatBridgePlatformRegistry.getTargetHosts('openrouter')).toEqual(['openrouter.ai']);
    expect(ChatBridgePlatformRegistry.getTargetHosts('kimi')).toEqual(['kimi.com', 'kimi.la', 'kimi.moonshot.cn']);
    expect(ChatBridgePlatformRegistry.getTargetHosts('doubao')).toEqual(['doubao.com']);
    expect(ChatBridgePlatformRegistry.getTargetHosts('zhipu')).toEqual(['chatglm.cn']);
  });
});
