/**
 * ragEngine.js - Local Retrieval-Augmented Generation Engine
 * 
 * Purpose:
 * - Generate text embeddings locally using transformers.js (all-MiniLM-L6-v2)
 * - Store embeddings and chat metadata in IndexedDB
 * - Retrieve top-K similar conversations using cosine similarity
 * - Works 100% offline with no external vector database
 * 
 * Data Flow:
 * 1. When a conversation is saved → generate embedding → store in IndexedDB
 * 2. When querying → embed query text → compute cosine similarity → return top matches
 * 3. Agents (Continuum/Memory/EchoSynth) call retrieve() to get relevant context
 * 
 * Usage Examples:
 * 
 * // Check if RAG is ready
 * await RAGEngine.initEmbeddingPipeline(); // Pre-load model (done automatically on init)
 * const stats = await RAGEngine.getStats(); // { totalEmbeddings, platforms, dbSizeBytes }
 * 
 * // Index a conversation (auto-called when saving)
 * await RAGEngine.indexConversation('conv_123', 'conversation text here', { platform: 'chatgpt', topics: ['AI'] });
 * 
 * // Retrieve similar conversations
 * const results = await RAGEngine.retrieve('tell me about AI', 5);
 * // Returns: [{ id, score, text, metadata, timestamp }, ...]
 * 
 * // Batch index existing conversations
 * const conversations = await Storage.conversations.getAll();
 * await RAGEngine.batchIndex(conversations, (progress) => console.log(`Indexed ${progress.current}/${progress.total}`));
 * 
 * // Debug commands (browser console)
 * RAGEngine.getStats()                     // Show embedding count
 * RAGEngine.retrieve('your query', 3)      // Test retrieval
 * RAGEngine.clearAllEmbeddings()           // Clear database (use with caution)
 */

// =============================================================================
// IndexedDB Setup for Embeddings
// =============================================================================

const RAG_DB_NAME = 'chatbridge_rag_v1';
const RAG_STORE_NAME = 'embeddings';
const RAG_DB_VERSION = 1;

let ragDB = null;

/**
 * Open/initialize the RAG IndexedDB store
 * Schema: { id: string, embedding: Float32Array, metadata: object, text: string, timestamp: number }
 */
async function openRAGDB() {
  if (ragDB) return ragDB;
  
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(RAG_DB_NAME, RAG_DB_VERSION);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create embeddings store if it doesn't exist
        if (!db.objectStoreNames.contains(RAG_STORE_NAME)) {
          const store = db.createObjectStore(RAG_STORE_NAME, { keyPath: 'id' });
          // Create indexes for efficient querying
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('platform', 'metadata.platform', { unique: false });
          console.log('[RAG] Created embeddings store with indexes');
        }
      };
      
      request.onsuccess = (event) => {
        ragDB = event.target.result;
        console.log('[RAG] Database opened successfully');
        resolve(ragDB);
      };
      
      request.onerror = (event) => {
        console.error('[RAG] Database open error:', event.target.error);
        reject(event.target.error);
      };
    } catch (e) {
      console.error('[RAG] Failed to open database:', e);
      reject(e);
    }
  });
}

/**
 * Store an embedding in IndexedDB
 * @param {string} id - Unique identifier (typically conversation timestamp)
 * @param {Float32Array} embedding - The embedding vector
 * @param {object} metadata - Chat metadata (platform, url, topics, etc.)
 * @param {string} text - Original text (for debugging/display)
 */
async function storeEmbedding(id, embedding, metadata, text) {
  try {
    const db = await openRAGDB();
    
    const record = {
      id: String(id),
      embedding: embedding, // Store as Float32Array directly
      metadata: metadata || {},
      text: (text || '').slice(0, 500), // Store first 500 chars for preview
      timestamp: Date.now()
    };
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction([RAG_STORE_NAME], 'readwrite');
      const store = tx.objectStore(RAG_STORE_NAME);
      const request = store.put(record);
      
      request.onsuccess = () => {
        console.log('[RAG] Stored embedding:', id);
        resolve(true);
      };
      
      request.onerror = () => {
        console.error('[RAG] Store error:', request.error);
        reject(request.error);
      };
    });
  } catch (e) {
    console.error('[RAG] storeEmbedding failed:', e);
    return false;
  }
}

/**
 * Get all embeddings from IndexedDB
 * @returns {Promise<Array>} Array of embedding records
 */
async function getAllEmbeddings() {
  try {
    const db = await openRAGDB();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction([RAG_STORE_NAME], 'readonly');
      const store = tx.objectStore(RAG_STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => {
        resolve(request.result || []);
      };
      
      request.onerror = () => {
        console.error('[RAG] getAll error:', request.error);
        reject(request.error);
      };
    });
  } catch (e) {
    console.error('[RAG] getAllEmbeddings failed:', e);
    return [];
  }
}

/**
 * Delete an embedding by ID
 */
async function deleteEmbedding(id) {
  try {
    const db = await openRAGDB();
    
    return new Promise((resolve) => {
      const tx = db.transaction([RAG_STORE_NAME], 'readwrite');
      const store = tx.objectStore(RAG_STORE_NAME);
      const request = store.delete(String(id));
      
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  } catch (e) {
    console.error('[RAG] deleteEmbedding failed:', e);
    return false;
  }
}

// =============================================================================
// Transformers.js Integration (Local Embeddings)
// =============================================================================

let embeddingPipeline = null;
let pipelineLoading = false;

/**
 * Initialize the transformers.js embedding pipeline
 * Model: all-MiniLM-L6-v2 (384-dim embeddings, ~23MB)
 * Runs entirely in the browser via ONNX Runtime
 */
async function initEmbeddingPipeline() {
  // Return existing pipeline if already loaded
  if (embeddingPipeline) return embeddingPipeline;
  
  // Wait if currently loading
  if (pipelineLoading) {
    while (pipelineLoading) {
      await new Promise(r => setTimeout(r, 100));
    }
    return embeddingPipeline;
  }
  
  try {
    pipelineLoading = true;
    console.log('[RAG] Loading transformers.js embedding model...');
    
    // Dynamic import of transformers.js
    // Note: In a Chrome extension, you'll need to include transformers.js via CDN in manifest.json
    // or bundle it. For now, we'll use the CDN approach.
    const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.10.0');
    
    // Load the feature-extraction pipeline with all-MiniLM-L6-v2
    embeddingPipeline = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      {
        quantized: true, // Use quantized model for smaller size
      }
    );
    
    console.log('[RAG] Embedding model loaded successfully');
    pipelineLoading = false;
    return embeddingPipeline;
  } catch (e) {
    console.error('[RAG] Failed to load embedding model:', e);
    pipelineLoading = false;
    
    // Fallback: return null and use simple keyword matching instead
    return null;
  }
}

/**
 * Generate embedding for a text string
 * @param {string} text - Input text
 * @returns {Promise<Float32Array|null>} 384-dim embedding vector or null if failed
 */
async function generateEmbedding(text) {
  try {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      console.warn('[RAG] Empty text provided for embedding');
      return null;
    }
    
    // Truncate very long texts (model has 512 token limit)
    const truncated = text.slice(0, 4000);
    
    const pipeline = await initEmbeddingPipeline();
    if (!pipeline) {
      console.warn('[RAG] Pipeline not available, using fallback');
      return null;
    }
    
    // Generate embedding
    const output = await pipeline(truncated, {
      pooling: 'mean', // Mean pooling of token embeddings
      normalize: true  // L2 normalize for cosine similarity
    });
    
    // Extract the embedding array
    // transformers.js returns a Tensor, convert to Float32Array
    const embedding = new Float32Array(output.data);
    
    console.log('[RAG] Generated embedding, dim:', embedding.length);
    return embedding;
  } catch (e) {
    console.error('[RAG] generateEmbedding failed:', e);
    return null;
  }
}

// =============================================================================
// Cosine Similarity & Retrieval
// =============================================================================

/**
 * Compute cosine similarity between two vectors
 * @param {Float32Array|Array} a - First vector
 * @param {Float32Array|Array} b - Second vector
 * @returns {number} Similarity score (0 to 1, higher = more similar)
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) {
    console.warn('[RAG] Invalid vectors for similarity:', a?.length, b?.length);
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Retrieve top-K most similar conversations
 * @param {string} queryText - The query text
 * @param {number} topK - Number of results to return (default: 3)
 * @param {object} filters - Optional filters (e.g., { platform: 'chatgpt.com' })
 * @returns {Promise<Array>} Array of { id, score, metadata, text } sorted by similarity
 */
async function retrieve(queryText, topK = 3, filters = {}) {
  try {
    console.log('[RAG] Retrieving similar conversations for query:', queryText.slice(0, 100));
    
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(queryText);
    if (!queryEmbedding) {
      console.warn('[RAG] Could not generate query embedding, using fallback keyword search');
      return await fallbackKeywordSearch(queryText, topK, filters);
    }
    
    // Get all stored embeddings
    const allEmbeddings = await getAllEmbeddings();
    console.log('[RAG] Retrieved', allEmbeddings.length, 'stored embeddings');
    
    if (allEmbeddings.length === 0) {
      console.log('[RAG] No embeddings in database yet');
      return [];
    }
    
    // Compute similarities
    const results = [];
    for (const record of allEmbeddings) {
      // Apply filters if provided
      if (filters.platform && record.metadata?.platform !== filters.platform) {
        continue;
      }
      
      const similarity = cosineSimilarity(queryEmbedding, record.embedding);
      results.push({
        id: record.id,
        score: similarity,
        metadata: record.metadata,
        text: record.text,
        timestamp: record.timestamp
      });
    }
    
    // Sort by similarity (highest first) and return top-K
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, topK);
    
    console.log('[RAG] Top', topK, 'results:', topResults.map(r => ({
      id: r.id,
      score: r.score.toFixed(3),
      platform: r.metadata?.platform
    })));
    
    return topResults;
  } catch (e) {
    console.error('[RAG] Retrieve failed:', e);
    return [];
  }
}

/**
 * Fallback keyword-based search when embeddings aren't available
 * Simple TF-IDF-like scoring based on keyword overlap
 */
async function fallbackKeywordSearch(queryText, topK = 3, filters = {}) {
  try {
    console.log('[RAG] Using fallback keyword search');
    
    const allEmbeddings = await getAllEmbeddings();
    if (allEmbeddings.length === 0) return [];
    
    // Tokenize query
    const queryTokens = new Set(
      queryText.toLowerCase()
        .split(/\W+/)
        .filter(t => t.length > 2)
    );
    
    // Score each document
    const results = [];
    for (const record of allEmbeddings) {
      if (filters.platform && record.metadata?.platform !== filters.platform) {
        continue;
      }
      
      const docTokens = record.text.toLowerCase().split(/\W+/);
      let matches = 0;
      for (const token of docTokens) {
        if (queryTokens.has(token)) matches++;
      }
      
      const score = matches / Math.max(queryTokens.size, 1);
      if (score > 0) {
        results.push({
          id: record.id,
          score,
          metadata: record.metadata,
          text: record.text,
          timestamp: record.timestamp
        });
      }
    }
    
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  } catch (e) {
    console.error('[RAG] Fallback search failed:', e);
    return [];
  }
}

// =============================================================================
// Batch Processing & Indexing
// =============================================================================

/**
 * Index a conversation (generate and store embedding)
 * @param {string} id - Conversation ID (timestamp)
 * @param {string} text - Full conversation text
 * @param {object} metadata - Metadata (platform, url, topics, etc.)
 * @returns {Promise<boolean>} Success status
 */
async function indexConversation(id, text, metadata) {
  try {
    console.log('[RAG] Indexing conversation:', id);
    
    // Check if already indexed
    const existing = await getEmbeddingById(id);
    if (existing) {
      console.log('[RAG] Conversation already indexed, skipping:', id);
      return true;
    }
    
    // Generate embedding
    const embedding = await generateEmbedding(text);
    if (!embedding) {
      console.warn('[RAG] Failed to generate embedding for:', id);
      return false;
    }
    
    // Store embedding
    const stored = await storeEmbedding(id, embedding, metadata, text);
    return stored;
  } catch (e) {
    console.error('[RAG] indexConversation failed:', e);
    return false;
  }
}

/**
 * Get a specific embedding by ID
 */
async function getEmbeddingById(id) {
  try {
    const db = await openRAGDB();
    
    return new Promise((resolve) => {
      const tx = db.transaction([RAG_STORE_NAME], 'readonly');
      const store = tx.objectStore(RAG_STORE_NAME);
      const request = store.get(String(id));
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

/**
 * Batch index multiple conversations
 * @param {Array} conversations - Array of { id, text, metadata }
 * @param {function} onProgress - Optional progress callback
 */
async function batchIndex(conversations, onProgress) {
  console.log('[RAG] Starting batch index of', conversations.length, 'conversations');
  
  let indexed = 0;
  let failed = 0;
  
  for (let i = 0; i < conversations.length; i++) {
    const conv = conversations[i];
    try {
      const success = await indexConversation(conv.id, conv.text, conv.metadata);
      if (success) indexed++;
      else failed++;
      
      if (onProgress) {
        onProgress({
          total: conversations.length,
          current: i + 1,
          indexed,
          failed
        });
      }
      
      // Small delay to avoid blocking the UI
      if (i % 5 === 0) {
        await new Promise(r => setTimeout(r, 50));
      }
    } catch (e) {
      console.error('[RAG] Batch index error for', conv.id, ':', e);
      failed++;
    }
  }
  
  console.log('[RAG] Batch index complete:', indexed, 'indexed,', failed, 'failed');
  return { indexed, failed };
}

/**
 * Clear all embeddings (for testing/reset)
 */
async function clearAllEmbeddings() {
  try {
    const db = await openRAGDB();
    
    return new Promise((resolve) => {
      const tx = db.transaction([RAG_STORE_NAME], 'readwrite');
      const store = tx.objectStore(RAG_STORE_NAME);
      const request = store.clear();
      
      request.onsuccess = () => {
        console.log('[RAG] All embeddings cleared');
        resolve(true);
      };
      request.onerror = () => resolve(false);
    });
  } catch (e) {
    console.error('[RAG] clearAllEmbeddings failed:', e);
    return false;
  }
}

// =============================================================================
// Public API
// =============================================================================

window.RAGEngine = {
  // Core functions
  initEmbeddingPipeline,
  generateEmbedding,
  retrieve,
  
  // Indexing
  indexConversation,
  batchIndex,
  
  // Storage management
  storeEmbedding,
  getAllEmbeddings,
  getEmbeddingById,
  deleteEmbedding,
  clearAllEmbeddings,
  
  // Utilities
  cosineSimilarity,
  
  // Stats
  async getStats() {
    const embeddings = await getAllEmbeddings();
    return {
      totalEmbeddings: embeddings.length,
      oldestTimestamp: embeddings.length > 0 ? Math.min(...embeddings.map(e => e.timestamp)) : null,
      newestTimestamp: embeddings.length > 0 ? Math.max(...embeddings.map(e => e.timestamp)) : null,
      platforms: [...new Set(embeddings.map(e => e.metadata?.platform).filter(Boolean))]
    };
  }
};

console.log('[RAG] Engine initialized and ready');
