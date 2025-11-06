/**
 * mcpBridge.js - Model Context Protocol Bridge
 * 
 * Purpose:
 * - Implement a lightweight MCP (Model Context Protocol) for agent-to-agent communication
 * - Define standard resources: /context, /memory, /synthesis
 * - Route messages between Continuum, Memory Architect, and EchoSynth
 * - Enable agents to query each other's capabilities locally
 * 
 * Architecture:
 * - Uses chrome.runtime.sendMessage for cross-script communication
 * - Each agent registers handlers for their MCP resources
 * - MCP messages follow standardized format: { resource, method, params, requestId }
 * - All communication is local (no network calls)
 * 
 * MCP Resources:
 * - /context (Continuum) - Get cross-platform conversation context
 * - /memory (Memory Architect) - Query long-term knowledge base
 * - /synthesis (EchoSynth) - Request multi-AI answer synthesis
 * 
 * Usage Examples:
 * 
 * // Initialize MCP (done automatically)
 * MCPBridge.init();
 * 
 * // Query context from Continuum (anywhere in the extension)
 * const contextData = await MCPBridge.queryContext('machine learning projects', 5);
 * // Returns: { query, results: [{ id, score, platform, preview, topics }], timestamp }
 * 
 * // Query memory from Memory Architect
 * const memories = await MCPBridge.queryMemory('recent debugging sessions');
 * // Returns: { query, results: [{ id, relevance, content, metadata }], timestamp }
 * 
 * // Request synthesis from EchoSynth
 * const synthesis = await MCPBridge.requestSynthesis('What is the future of AI?', ['gemini', 'chatgpt']);
 * // Returns: { synthesisId, status, models, timestamp }
 * 
 * // Low-level MCP request (for custom resources)
 * const response = await MCPBridge.sendRequest('/context', 'GET', {});
 * 
 * // Debug commands (browser console)
 * MCPBridge.queryContext('test query', 3)       // Test context retrieval
 * MCPBridge.queryMemory('debugging')            // Test memory query
 */

// =============================================================================
// MCP Message Protocol
// =============================================================================

/**
 * MCP Message Format:
 * {
 *   type: 'mcp_request' | 'mcp_response',
 *   resource: '/context' | '/memory' | '/synthesis',
 *   method: 'GET' | 'POST' | 'QUERY',
 *   params: { ... }, // Resource-specific parameters
 *   requestId: string, // Unique ID for matching requests/responses
 *   timestamp: number,
 *   source: string // Agent name that sent the message
 * }
 */

// =============================================================================
// MCP Resource Registry
// =============================================================================

const MCP_RESOURCES = {
  CONTEXT: '/context',      // Continuum - Cross-platform context
  MEMORY: '/memory',        // Memory Architect - Knowledge base
  SYNTHESIS: '/synthesis'   // EchoSynth - Multi-AI synthesis
};

// Handler registry: resource -> handler function
const mcpHandlers = new Map();

// Pending requests: requestId -> { resolve, reject, timeout }
const pendingRequests = new Map();

// Request timeout (ms)
const MCP_TIMEOUT = 30000; // 30 seconds

/**
 * Register an MCP resource handler
 * @param {string} resource - Resource path (e.g., '/context')
 * @param {function} handler - Handler function (params) => Promise<result>
 */
function registerMCPHandler(resource, handler) {
  if (typeof handler !== 'function') {
    console.error('[MCP] Handler must be a function');
    return false;
  }
  
  mcpHandlers.set(resource, handler);
  console.log('[MCP] Registered handler for', resource);
  return true;
}

/**
 * Unregister an MCP resource handler
 */
function unregisterMCPHandler(resource) {
  mcpHandlers.delete(resource);
  console.log('[MCP] Unregistered handler for', resource);
}

// =============================================================================
// MCP Request/Response
// =============================================================================

/**
 * Send an MCP request
 * @param {string} resource - Target resource (e.g., '/context')
 * @param {string} method - HTTP-like method ('GET', 'POST', 'QUERY')
 * @param {object} params - Request parameters
 * @param {string} source - Source agent name
 * @returns {Promise<any>} Response data
 */
function sendMCPRequest(resource, method, params, source = 'unknown') {
  return new Promise((resolve, reject) => {
    try {
      const requestId = generateRequestId();
      
      const message = {
        type: 'mcp_request',
        resource,
        method,
        params: params || {},
        requestId,
        timestamp: Date.now(),
        source
      };
      
      // Set up timeout
      const timeoutId = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error(`MCP request timeout for ${resource}`));
      }, MCP_TIMEOUT);
      
      // Store pending request
      pendingRequests.set(requestId, { resolve, reject, timeoutId });
      
      // Send via chrome.runtime.sendMessage (works across content/background scripts)
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(message, (response) => {
          handleMCPResponse(response, requestId);
        });
      } else {
        // Fallback: try handling locally (for same-script calls)
        handleMCPRequestLocally(message)
          .then(result => handleMCPResponse({ ok: true, result }, requestId))
          .catch(error => handleMCPResponse({ ok: false, error: error.message }, requestId));
      }
    } catch (e) {
      console.error('[MCP] sendMCPRequest failed:', e);
      reject(e);
    }
  });
}

/**
 * Handle MCP response
 */
function handleMCPResponse(response, requestId) {
  const pending = pendingRequests.get(requestId);
  if (!pending) {
    console.warn('[MCP] Received response for unknown request:', requestId);
    return;
  }
  
  // Clear timeout
  clearTimeout(pending.timeoutId);
  pendingRequests.delete(requestId);
  
  // Resolve or reject based on response
  if (response && response.ok) {
    pending.resolve(response.result);
  } else {
    pending.reject(new Error(response?.error || 'MCP request failed'));
  }
}

/**
 * Handle MCP request locally (when handler is registered in same script)
 */
async function handleMCPRequestLocally(message) {
  try {
    const handler = mcpHandlers.get(message.resource);
    if (!handler) {
      throw new Error(`No handler registered for ${message.resource}`);
    }
    
    console.log('[MCP] Handling request locally:', message.resource, message.method);
    const result = await handler(message.params, message.method, message.source);
    return result;
  } catch (e) {
    console.error('[MCP] Local handler error:', e);
    throw e;
  }
}

/**
 * Set up MCP message listener
 * Call this in background.js and content_script.js to enable MCP routing
 */
function initMCPListener() {
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    console.warn('[MCP] chrome.runtime not available, MCP disabled');
    return;
  }
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Only handle MCP messages
    if (!message || message.type !== 'mcp_request') {
      return false; // Let other handlers process it
    }
    
    console.log('[MCP] Received request:', message.resource, message.method);
    
    // Handle asynchronously
    (async () => {
      try {
        const result = await handleMCPRequestLocally(message);
        sendResponse({ ok: true, result });
      } catch (e) {
        console.error('[MCP] Request handler error:', e);
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    
    // Return true to indicate async response
    return true;
  });
  
  console.log('[MCP] Message listener initialized');
}

/**
 * Generate a unique request ID
 */
function generateRequestId() {
  return 'mcp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

// =============================================================================
// Standard MCP Resource Implementations
// =============================================================================

/**
 * /context resource (Continuum Agent)
 * 
 * Methods:
 * - GET: Retrieve cross-platform context for current session
 * - QUERY: Find related conversations across platforms
 * 
 * Params:
 * - query: string (for QUERY method)
 * - platform: string (optional filter)
 * - topK: number (default: 3)
 */
const ContextResource = {
  async handle(params, method, source) {
    console.log('[MCP /context] Handling', method, 'from', source);
    
    if (method === 'GET') {
      // Return current context summary
      return await getContextSummary(params);
    } else if (method === 'QUERY') {
      // Query related conversations using RAG
      if (!params.query) {
        throw new Error('Query parameter required for QUERY method');
      }
      return await queryRelatedContext(params.query, params.topK || 3, params.platform);
    } else {
      throw new Error(`Unsupported method: ${method}`);
    }
  }
};

/**
 * /memory resource (Memory Architect Agent)
 * 
 * Methods:
 * - GET: Retrieve knowledge base stats
 * - QUERY: Search knowledge base
 * - POST: Add new knowledge entry
 * 
 * Params:
 * - query: string (for QUERY)
 * - entry: object (for POST)
 * - filters: object (optional)
 */
const MemoryResource = {
  async handle(params, method, source) {
    console.log('[MCP /memory] Handling', method, 'from', source);
    
    if (method === 'GET') {
      // Return memory stats
      return await getMemoryStats();
    } else if (method === 'QUERY') {
      // Query knowledge base using RAG
      if (!params.query) {
        throw new Error('Query parameter required for QUERY method');
      }
      return await queryMemory(params.query, params.filters);
    } else if (method === 'POST') {
      // Store new knowledge entry
      if (!params.entry) {
        throw new Error('Entry parameter required for POST method');
      }
      return await storeKnowledge(params.entry);
    } else {
      throw new Error(`Unsupported method: ${method}`);
    }
  }
};

/**
 * /synthesis resource (EchoSynth Agent)
 * 
 * Methods:
 * - POST: Request multi-AI synthesis
 * - GET: Get synthesis status
 * 
 * Params:
 * - prompt: string (for POST)
 * - models: string[] (optional, default: ['gemini', 'chatgpt'])
 * - synthesisId: string (for GET)
 */
const SynthesisResource = {
  async handle(params, method, source) {
    console.log('[MCP /synthesis] Handling', method, 'from', source);
    
    if (method === 'POST') {
      // Request synthesis
      if (!params.prompt) {
        throw new Error('Prompt parameter required for POST method');
      }
      return await requestSynthesis(params.prompt, params.models);
    } else if (method === 'GET') {
      // Get synthesis status/result
      if (!params.synthesisId) {
        throw new Error('SynthesisId parameter required for GET method');
      }
      return await getSynthesisResult(params.synthesisId);
    } else {
      throw new Error(`Unsupported method: ${method}`);
    }
  }
};

// =============================================================================
// Resource Implementation Helpers (Stubs for Integration)
// =============================================================================

/**
 * Get current context summary (Continuum)
 * Provides overview of recent conversations and suggested actions
 */
async function getContextSummary(params) {
  try {
    const currentPlatform = location.hostname;
    const recentConversations = [];
    
    // Try to get recent conversations from storage
    if (typeof window.Storage !== 'undefined' && window.Storage.conversations) {
      const allConvs = await window.Storage.conversations.getAll();
      if (allConvs && allConvs.length > 0) {
        // Get last 5 conversations
        const sorted = allConvs.sort((a, b) => (b.ts || 0) - (a.ts || 0));
        recentConversations.push(...sorted.slice(0, 5).map(c => ({
          id: c.id,
          platform: c.platform,
          topics: c.topics || [],
          timestamp: c.ts,
          preview: c.conversation?.[0]?.text?.slice(0, 100) || 'No preview'
        })));
      }
    }
    
    // Generate suggested actions based on context
    const suggestedActions = ['Continue from last session'];
    if (recentConversations.length > 0) {
      const lastTopics = recentConversations[0].topics || [];
      if (lastTopics.length > 0) {
        suggestedActions.push(`Explore more about "${lastTopics[0]}"`);
      }
    }
    suggestedActions.push('Start fresh conversation');
    
    return {
      currentPlatform,
      recentConversations,
      suggestedActions,
      conversationCount: recentConversations.length,
      timestamp: Date.now()
    };
  } catch (e) {
    console.error('[MCP /context] getContextSummary failed:', e);
    // Return minimal data on error
    return {
      currentPlatform: location.hostname,
      recentConversations: [],
      suggestedActions: ['Continue from last session', 'Start fresh'],
      timestamp: Date.now()
    };
  }
}

/**
 * Query related conversations using RAG (Continuum)
 */
async function queryRelatedContext(query, topK, platform) {
  try {
    // Use RAG engine to find similar conversations
    if (typeof window.RAGEngine !== 'undefined') {
      const filters = platform ? { platform } : {};
      const results = await window.RAGEngine.retrieve(query, topK, filters);
      return {
        query,
        results: results.map(r => ({
          id: r.id,
          score: r.score,
          platform: r.metadata?.platform,
          preview: r.text,
          topics: r.metadata?.topics || []
        })),
        timestamp: Date.now()
      };
    } else {
      console.warn('[MCP] RAG Engine not available');
      return { query, results: [], timestamp: Date.now() };
    }
  } catch (e) {
    console.error('[MCP /context] queryRelatedContext failed:', e);
    throw e;
  }
}

/**
 * Get memory/knowledge base stats (Memory Architect)
 */
async function getMemoryStats() {
  try {
    if (typeof window.RAGEngine !== 'undefined') {
      const stats = await window.RAGEngine.getStats();
      return {
        ...stats,
        timestamp: Date.now()
      };
    } else {
      return {
        totalEmbeddings: 0,
        platforms: [],
        timestamp: Date.now()
      };
    }
  } catch (e) {
    console.error('[MCP /memory] getMemoryStats failed:', e);
    throw e;
  }
}

/**
 * Query knowledge base (Memory Architect)
 */
async function queryMemory(query, filters) {
  try {
    if (typeof window.RAGEngine !== 'undefined') {
      const results = await window.RAGEngine.retrieve(query, 5, filters || {});
      return {
        query,
        results: results.map(r => ({
          id: r.id,
          relevance: r.score,
          content: r.text,
          metadata: r.metadata,
          timestamp: r.timestamp
        })),
        timestamp: Date.now()
      };
    } else {
      return { query, results: [], timestamp: Date.now() };
    }
  } catch (e) {
    console.error('[MCP /memory] queryMemory failed:', e);
    throw e;
  }
}

/**
 * Store new knowledge entry (Memory Architect)
 */
async function storeKnowledge(entry) {
  try {
    // TODO: Implement knowledge storage
    // This should integrate with the existing Knowledge Graph/Memory system
    console.log('[MCP /memory] Storing knowledge:', entry);
    return {
      success: true,
      id: 'knowledge_' + Date.now(),
      timestamp: Date.now()
    };
  } catch (e) {
    console.error('[MCP /memory] storeKnowledge failed:', e);
    throw e;
  }
}

/**
 * Request multi-AI synthesis (EchoSynth)
 */
async function requestSynthesis(prompt, models = ['gemini', 'chatgpt']) {
  try {
    const synthesisId = 'synth_' + Date.now();
    
    // TODO: Integrate with actual EchoSynth agent
    // This should call the existing multi-AI query logic
    console.log('[MCP /synthesis] Requesting synthesis:', prompt, models);
    
    return {
      synthesisId,
      status: 'pending',
      models,
      timestamp: Date.now()
    };
  } catch (e) {
    console.error('[MCP /synthesis] requestSynthesis failed:', e);
    throw e;
  }
}

/**
 * Get synthesis result (EchoSynth)
 */
async function getSynthesisResult(synthesisId) {
  try {
    // TODO: Implement result retrieval
    console.log('[MCP /synthesis] Getting result:', synthesisId);
    
    return {
      synthesisId,
      status: 'completed',
      result: 'Synthesis result placeholder',
      timestamp: Date.now()
    };
  } catch (e) {
    console.error('[MCP /synthesis] getSynthesisResult failed:', e);
    throw e;
  }
}

// =============================================================================
// MCP Bridge Initialization
// =============================================================================

/**
 * Initialize the MCP bridge with standard resources
 * Call this in both background.js and content_script.js
 */
function initMCPBridge() {
  console.log('[MCP] Initializing bridge...');
  
  // Register standard resource handlers
  registerMCPHandler(MCP_RESOURCES.CONTEXT, ContextResource.handle);
  registerMCPHandler(MCP_RESOURCES.MEMORY, MemoryResource.handle);
  registerMCPHandler(MCP_RESOURCES.SYNTHESIS, SynthesisResource.handle);
  
  // Set up message listener
  initMCPListener();
  
  console.log('[MCP] Bridge initialized with resources:', Object.values(MCP_RESOURCES));
}

// =============================================================================
// Public API
// =============================================================================

window.MCPBridge = {
  // Core functions
  init: initMCPBridge,
  sendRequest: sendMCPRequest,
  
  // Handler registration
  registerHandler: registerMCPHandler,
  unregisterHandler: unregisterMCPHandler,
  
  // Resources
  resources: MCP_RESOURCES,
  
  // Convenience methods for agents
  async queryContext(query, topK = 3, platform) {
    return sendMCPRequest(MCP_RESOURCES.CONTEXT, 'QUERY', { query, topK, platform }, 'MCPBridge');
  },
  
  async getContext() {
    return sendMCPRequest(MCP_RESOURCES.CONTEXT, 'GET', {}, 'MCPBridge');
  },
  
  async queryMemory(query, filters) {
    return sendMCPRequest(MCP_RESOURCES.MEMORY, 'QUERY', { query, filters }, 'MCPBridge');
  },
  
  async getMemoryStats() {
    return sendMCPRequest(MCP_RESOURCES.MEMORY, 'GET', {}, 'MCPBridge');
  },
  
  async requestSynthesis(prompt, models) {
    return sendMCPRequest(MCP_RESOURCES.SYNTHESIS, 'POST', { prompt, models }, 'MCPBridge');
  },
  
  async getSynthesis(synthesisId) {
    return sendMCPRequest(MCP_RESOURCES.SYNTHESIS, 'GET', { synthesisId }, 'MCPBridge');
  },
  
  // Stats
  getStats() {
    return {
      registeredResources: Array.from(mcpHandlers.keys()),
      pendingRequests: pendingRequests.size
    };
  }
};

console.log('[MCP] Bridge module loaded and ready');
