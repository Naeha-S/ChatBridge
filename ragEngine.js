/**
 * Phase 4 — Learning Interface & Adaptive Voice Layer
 * 
 * This file implements a local Retrieval-Augmented Generation engine and now
 * also exposes learning analytics utilities used by Timeline/Reflection.
 * 
 * Additions in Phase 4:
 * - Theme evolution computation and persistence (theme_nodes)
 * - Lightweight weekly reflection synthesis (local, template-based)
 * - Learning metrics aggregation (/analytics via MCP)
 * 
 * Existing (Phase 3):
 * - Local embeddings (transformers.js) + IndexedDB storage
 * - Semantic chunking, adaptive weighting, and topic clustering
 * 
 * Notes: All data stays local (IndexedDB/chrome.storage.local). No external calls.
 */

// =============================================================================
// IndexedDB Setup for Embeddings
// =============================================================================

const RAG_DB_NAME = 'chatbridge_rag_v1';
const RAG_STORE_NAME = 'embeddings';
const RAG_DB_VERSION = 1;

let ragDB = null;

// Phase 4: Local storage keys for analytics/evolution
const THEME_NODES_KEY = 'cb_theme_nodes_v1';
const METRICS_KEY = 'cb_learning_metrics_v1';

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
// Semantic Chunking & Adaptive Weighting (Phase 3)
// =============================================================================

/**
 * Split text into semantic chunks (~300 tokens each)
 * Strategy: Split by sentences/paragraphs, combine until ~300 tokens, with overlap
 * 
 * @param {string} text - Full conversation text
 * @param {number} chunkSize - Target chunk size in characters (~300 tokens ≈ 1200 chars)
 * @param {number} overlap - Overlap between chunks (characters)
 * @returns {Array<string>} Array of text chunks
 */
function semanticChunk(text, chunkSize = 1200, overlap = 200) {
  if (!text || text.length < chunkSize) {
    return [text]; // Return whole text if too small
  }
  
  const chunks = [];
  
  // Split by paragraphs first, then sentences
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';
  
  for (const para of paragraphs) {
    // If adding this paragraph exceeds chunk size, save current chunk
    if (currentChunk.length + para.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Start new chunk with overlap from previous
      const overlapText = currentChunk.slice(-overlap);
      currentChunk = overlapText + ' ' + para;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
  }
  
  // Add remaining chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  console.log(`[RAG Chunking] Split text (${text.length} chars) into ${chunks.length} chunks`);
  return chunks;
}

/**
 * Calculate adaptive weight for a conversation/chunk
 * Formula: weight = recencyFactor * frequencyFactor * topicSimilarity
 * 
 * @param {object} metadata - Conversation metadata
 * @param {string} queryText - Current query for topic similarity
 * @returns {number} Weight score (0 to 1)
 */
function calculateAdaptiveWeight(metadata, queryText = '') {
  let weight = 1.0;
  
  // Recency factor: exponential decay (newer = higher weight)
  if (metadata.timestamp) {
    const ageInDays = (Date.now() - metadata.timestamp) / (1000 * 60 * 60 * 24);
    const recencyFactor = Math.exp(-ageInDays / 30); // Decay over 30 days
    weight *= recencyFactor;
  }
  
  // Frequency factor: conversations accessed more often have higher weight
  if (metadata.accessCount) {
    const frequencyFactor = Math.min(1.0, metadata.accessCount / 10); // Cap at 10 accesses
    weight *= (0.7 + 0.3 * frequencyFactor); // Base 0.7, up to 1.0
  }
  
  // Topic similarity: boost if query mentions topics from this conversation
  if (queryText && metadata.topics && metadata.topics.length > 0) {
    const queryLower = queryText.toLowerCase();
    const matchingTopics = metadata.topics.filter(t => 
      queryLower.includes(t.toLowerCase())
    );
    const topicSimilarity = matchingTopics.length / metadata.topics.length;
    weight *= (0.8 + 0.2 * topicSimilarity); // Base 0.8, up to 1.0
  }
  
  return Math.min(1.0, weight); // Cap at 1.0
}

// =============================================================================
// Local Embeddings via transformers.js (ChatBridgeEmbeddings)
// =============================================================================

/**
 * Initialize local embedding model (preload to reduce first-use latency)
 */
async function initEmbeddingPipeline() {
  try {
    if (window.ChatBridgeEmbeddings && typeof window.ChatBridgeEmbeddings.preloadModel === 'function') {
      await window.ChatBridgeEmbeddings.preloadModel();
      console.log('[RAG] Local embedding model preloaded');
    } else {
      console.warn('[RAG] ChatBridgeEmbeddings not found; embeddings will load on first use');
    }
  } catch (e) {
    console.warn('[RAG] Embedding preload failed:', e);
  }
  return null; // keep API stable
}

/**
 * Generate embedding using local transformers.js pipeline
 * @param {string} text
 * @returns {Promise<Float32Array|null>}
 */
async function generateEmbedding(text) {
  try {
    if (!text || typeof text !== 'string' || !text.trim()) return null;
    if (window.ChatBridgeEmbeddings && typeof window.ChatBridgeEmbeddings.getEmbedding === 'function') {
      const emb = await window.ChatBridgeEmbeddings.getEmbedding(text);
      return emb instanceof Float32Array ? emb : new Float32Array(emb || []);
    }
    console.warn('[RAG] ChatBridgeEmbeddings.getEmbedding unavailable');
    return null;
  } catch (e) {
    console.error('[RAG] generateEmbedding error:', e);
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
  try {
    if (window.ChatBridgeEmbeddings && typeof window.ChatBridgeEmbeddings.cosineSimilarity === 'function') {
      return window.ChatBridgeEmbeddings.cosineSimilarity(a, b);
    }
  } catch {}
  if (!a || !b || a.length !== b.length) return 0;
  let dot=0, na=0, nb=0; for (let i=0;i<a.length;i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
  const denom = Math.sqrt(na)*Math.sqrt(nb); return denom? (dot/denom):0;
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
    
    // Get all stored embeddings (now chunks)
    const allEmbeddings = await getAllEmbeddings();
    console.log('[RAG] Retrieved', allEmbeddings.length, 'stored chunk embeddings');
    
    if (allEmbeddings.length === 0) {
      console.log('[RAG] No embeddings in database yet');
      return [];
    }
    
    // Phase 3: Compute similarities with adaptive weighting
    const chunkResults = [];
    for (const record of allEmbeddings) {
      // Apply filters if provided
      if (filters.platform && record.metadata?.platform !== filters.platform) {
        continue;
      }
      
      // Cosine similarity
      const similarity = cosineSimilarity(queryEmbedding, record.embedding);
      
      // Apply adaptive weight
      const weight = record.metadata?.weight || calculateAdaptiveWeight(record.metadata, queryText);
      const weightedScore = similarity * weight;
      
      chunkResults.push({
        id: record.id,
        parentId: record.metadata?.parentId || record.id,
        chunkIndex: record.metadata?.chunkIndex || 0,
        score: similarity,
        weightedScore: weightedScore,
        weight: weight,
        metadata: record.metadata,
        text: record.text,
        timestamp: record.timestamp
      });
    }
    
    // Sort by weighted score (highest first) and return top-K chunks
    chunkResults.sort((a, b) => b.weightedScore - a.weightedScore);
    
    // Take top N*3 chunks to have enough for re-ranking
    const topChunks = chunkResults.slice(0, topK * 3);
    
    // Re-rank: Group by parent conversation and select best chunks
    const conversationGroups = {};
    for (const chunk of topChunks) {
      const parentId = chunk.parentId;
      if (!conversationGroups[parentId]) {
        conversationGroups[parentId] = [];
      }
      conversationGroups[parentId].push(chunk);
    }
    
    // Combine chunks from same conversation into context packages
    const contextPackages = Object.entries(conversationGroups).map(([parentId, chunks]) => {
      // Sort chunks by position in original conversation
      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      
      // Combine text with ellipsis between non-consecutive chunks
      let combinedText = '';
      let lastIndex = -1;
      for (const chunk of chunks) {
        if (lastIndex >= 0 && chunk.chunkIndex !== lastIndex + 1) {
          combinedText += '\n\n[...]\n\n';
        }
        combinedText += chunk.text;
        lastIndex = chunk.chunkIndex;
      }
      
      // Aggregate score (max score from chunks)
      const maxScore = Math.max(...chunks.map(c => c.weightedScore));
      
      return {
        id: parentId,
        score: maxScore,
        chunks: chunks.length,
        metadata: chunks[0].metadata,
        text: combinedText,
        timestamp: chunks[0].timestamp,
        chunkDetails: chunks.map(c => ({ index: c.chunkIndex, score: c.score.toFixed(3) }))
      };
    });
    
    // Sort packages by score and return top-K
    contextPackages.sort((a, b) => b.score - a.score);
    const topResults = contextPackages.slice(0, topK);
    
    try { if (window && window.RAGEngine) window.RAGEngine._lastRetrievedCount = topResults.length; } catch {}
    console.log('[RAG] Top', topK, 'context packages:', topResults.map(r => ({
      id: r.id,
      score: r.score.toFixed(3),
      chunks: r.chunks,
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
    console.log('[RAG] Indexing conversation with chunking:', id);
    
    // Check if already indexed (check first chunk)
    const existing = await getEmbeddingById(id + '_chunk_0');
    if (existing) {
      console.log('[RAG] Conversation already indexed, skipping:', id);
      return true;
    }
    
    // Phase 3: Split into semantic chunks
    const chunks = semanticChunk(text);
    console.log(`[RAG] Split conversation ${id} into ${chunks.length} chunks`);
    
    // Calculate adaptive weight
    const weight = calculateAdaptiveWeight(metadata, text);
    
    // Index each chunk separately
    let successCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunkId = `${id}_chunk_${i}`;
      const chunkText = chunks[i];
      
      // Generate embedding for chunk
      const embedding = await generateEmbedding(chunkText);
      if (!embedding) {
        console.warn(`[RAG] Failed to generate embedding for chunk ${i} of ${id}`);
        continue;
      }
      
      // Store chunk with parent reference and weight
      const chunkMetadata = {
        ...metadata,
        parentId: id,
        chunkIndex: i,
        totalChunks: chunks.length,
        weight: weight,
        accessCount: metadata.accessCount || 0
      };
      
      const stored = await storeEmbedding(chunkId, embedding, chunkMetadata, chunkText);
      if (stored) successCount++;
    }
    
    console.log(`[RAG] Indexed ${successCount}/${chunks.length} chunks for conversation ${id} (weight: ${weight.toFixed(2)})`);
    return successCount > 0;
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
// Topic Clustering (Phase 3)
// =============================================================================

/**
 * Cluster topics using cosine similarity thresholding
 * Groups topics that are semantically similar (e.g., "Firebase Auth" + "Authentication Issues")
 * 
 * @param {number} threshold - Similarity threshold (0.7 = 70% similar)
 * @returns {Promise<Array>} Array of theme clusters: [{ theme: string, topics: [], count: number }]
 */
async function getThemeClusters(threshold = 0.7) {
  try {
    console.log('[RAG Clustering] Starting topic clustering...');
    
    // Get all embeddings
    const allEmbeddings = await getAllEmbeddings();
    
    // Extract unique topics across all conversations
    const topicMap = new Map(); // topic -> { text, count, embeddings: [] }
    
    for (const record of allEmbeddings) {
      const topics = record.metadata?.topics || [];
      for (const topic of topics) {
        if (!topicMap.has(topic)) {
          topicMap.set(topic, { text: topic, count: 0, embeddings: [] });
        }
        const entry = topicMap.get(topic);
        entry.count++;
        // Store chunk embedding as proxy for topic embedding
        entry.embeddings.push(record.embedding);
      }
    }
    
    console.log(`[RAG Clustering] Found ${topicMap.size} unique topics`);
    
    if (topicMap.size === 0) return [];
    
    // Average embeddings for each topic
    const topicEmbeddings = [];
    for (const [topic, data] of topicMap.entries()) {
      // Average all chunk embeddings for this topic
      const avgEmbedding = new Float32Array(data.embeddings[0].length);
      for (const emb of data.embeddings) {
        for (let i = 0; i < emb.length; i++) {
          avgEmbedding[i] += emb[i];
        }
      }
      for (let i = 0; i < avgEmbedding.length; i++) {
        avgEmbedding[i] /= data.embeddings.length;
      }
      
      topicEmbeddings.push({
        topic,
        count: data.count,
        embedding: avgEmbedding
      });
    }
    
    // Cosine similarity clustering (greedy approach)
    const clusters = [];
    const clustered = new Set();
    
    for (let i = 0; i < topicEmbeddings.length; i++) {
      if (clustered.has(i)) continue;
      
      const cluster = {
        theme: topicEmbeddings[i].topic, // Use most common topic as theme name
        topics: [topicEmbeddings[i].topic],
        count: topicEmbeddings[i].count
      };
      
      clustered.add(i);
      
      // Find similar topics
      for (let j = i + 1; j < topicEmbeddings.length; j++) {
        if (clustered.has(j)) continue;
        
        const similarity = cosineSimilarity(
          topicEmbeddings[i].embedding,
          topicEmbeddings[j].embedding
        );
        
        if (similarity >= threshold) {
          cluster.topics.push(topicEmbeddings[j].topic);
          cluster.count += topicEmbeddings[j].count;
          clustered.add(j);
        }
      }
      
      clusters.push(cluster);
    }
    
    // Sort clusters by count (most frequent first)
    clusters.sort((a, b) => b.count - a.count);
    
    console.log(`[RAG Clustering] Created ${clusters.length} theme clusters`);
    return clusters;
  } catch (e) {
    console.error('[RAG Clustering] Failed:', e);
    return [];
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
  
  // Phase 4: Learning & Reflection helpers
  async getThemeEvolution(options = {}) {
    const { threshold = 0.7, bucket = 'day', startTs = null, endTs = null } = options;
    // Build per-conversation view first (dedupe chunks)
    const all = await getAllEmbeddings();
    if (all.length === 0) return { themes: [], timeline: [] };

    // Map parentId -> { ts, topics, platform }
    const convMap = new Map();
    for (const r of all) {
      const pid = r.metadata?.parentId || r.id;
      const ts = r.timestamp || Date.now();
      const topics = r.metadata?.topics || [];
      const platform = r.metadata?.platform || 'unknown';
      if (!convMap.has(pid)) {
        convMap.set(pid, { ts, topics: new Set(topics), platform });
      } else {
        const ent = convMap.get(pid);
        ent.ts = Math.min(ent.ts, ts);
        topics.forEach(t => ent.topics.add(t));
      }
    }

    // Build clusters to normalize themes
    const clusters = await getThemeClusters(threshold);
    const normalizeToTheme = (topic) => {
      // Find cluster containing topic
      for (const c of clusters) {
        if (c.topics.includes(topic)) return c.theme;
      }
      return topic;
    };

    // Bucket helper
    const fmtBucket = (ts) => {
      const d = new Date(ts);
      if (bucket === 'week') {
        // ISO week key: YYYY-Www
        const onejan = new Date(d.getFullYear(),0,1);
        const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay()+1)/7);
        return `${d.getFullYear()}-W${String(week).padStart(2,'0')}`;
      }
      // default day
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    };

    // Aggregate counts per theme per bucket
    const themeBuckets = new Map(); // theme -> Map(bucketKey -> count)
    let minTs = Infinity, maxTs = -Infinity;
    for (const [pid, ent] of convMap.entries()) {
      const ts = ent.ts;
      if ((startTs && ts < startTs) || (endTs && ts > endTs)) continue;
      minTs = Math.min(minTs, ts); maxTs = Math.max(maxTs, ts);
      const key = fmtBucket(ts);
      for (const t of ent.topics) {
        const theme = normalizeToTheme(t);
        if (!themeBuckets.has(theme)) themeBuckets.set(theme, new Map());
        const m = themeBuckets.get(theme);
        m.set(key, (m.get(key) || 0) + 1);
      }
    }

    // Build sparkline arrays (sorted by time)
    const sortKeys = (keys) => keys.sort((a,b) => a.localeCompare(b));
    const themes = [];
    for (const [theme, bucketMap] of themeBuckets.entries()) {
      const keys = sortKeys(Array.from(bucketMap.keys()));
      const counts = keys.map(k => bucketMap.get(k));
      const total = counts.reduce((s,c)=>s+c,0);
      const firstKey = keys[0];
      const lastKey = keys[keys.length-1];
      themes.push({
        theme,
        total,
        firstKey,
        lastKey,
        spark: counts,
        keys
      });
    }
    themes.sort((a,b)=> b.total - a.total);

    // Persist as theme_nodes for quick access
    try {
      const payload = themes.map(t => ({
        theme: t.theme,
        total: t.total,
        firstKey: t.firstKey,
        lastKey: t.lastKey,
        spark: t.spark,
        keys: t.keys,
        updatedAt: Date.now()
      }));
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const obj = {}; obj[THEME_NODES_KEY] = payload; chrome.storage.local.set(obj, ()=>{});
      } else {
        localStorage.setItem(THEME_NODES_KEY, JSON.stringify(payload));
      }
    } catch {}

    return { themes, range: { start: isFinite(minTs)?minTs:null, end: isFinite(maxTs)?maxTs:null }, bucket };
  },

  async getSavedThemeNodes() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return await new Promise((resolve)=> chrome.storage.local.get([THEME_NODES_KEY], r => resolve(r[THEME_NODES_KEY] || [])));
      }
      const raw = localStorage.getItem(THEME_NODES_KEY); return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  async getAnalytics() {
    // Compute metrics from embeddings plus persisted counters
    const embeddings = await getAllEmbeddings();
    const parentIds = new Set();
    const topics = new Set();
    for (const e of embeddings) {
      if (e.metadata?.parentId) parentIds.add(e.metadata.parentId);
      (e.metadata?.topics || []).forEach(t=> topics.add(t));
    }
    const totalConversations = parentIds.size || 0;
    const uniqueTags = topics.size || 0;

    // Load counters
    let counters = { totalSynthesisSessions: 0, revisits: 0 };
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const res = await new Promise((resolve)=> chrome.storage.local.get([METRICS_KEY], r => resolve(r[METRICS_KEY] || {})));
        counters = { totalSynthesisSessions: res.totalSynthesisSessions||0, revisits: res.revisits||0 };
      } else {
        const raw = localStorage.getItem(METRICS_KEY); const obj = raw? JSON.parse(raw):{};
        counters = { totalSynthesisSessions: obj.totalSynthesisSessions||0, revisits: obj.revisits||0 };
      }
    } catch {}

    return {
      totalConversations,
      uniqueTags,
      totalSynthesisSessions: counters.totalSynthesisSessions,
      revisitedTopics: counters.revisits
    };
  },

  async incrementMetric(name, delta = 1) {
    try {
      let obj = {};
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const cur = await new Promise((resolve)=> chrome.storage.local.get([METRICS_KEY], r => resolve(r[METRICS_KEY] || {})));
        obj = cur || {};
        obj[name] = (obj[name] || 0) + delta;
        const payload = {}; payload[METRICS_KEY] = obj; chrome.storage.local.set(payload, ()=>{});
      } else {
        const raw = localStorage.getItem(METRICS_KEY); obj = raw? JSON.parse(raw):{};
        obj[name] = (obj[name] || 0) + delta;
        localStorage.setItem(METRICS_KEY, JSON.stringify(obj));
      }
      return true;
    } catch { return false; }
  },

  async generateReflection({ days = 7 } = {}) {
    const endTs = Date.now();
    const startTs = endTs - days * 24 * 60 * 60 * 1000;
    const evo = await this.getThemeEvolution({ startTs, endTs, bucket: 'day' });
    const themes = evo.themes.slice(0, 8); // top themes
    if (themes.length === 0) return '# Weekly Reflection\n\nNo new activity in the selected period.';

    // Template-based summary
    const lines = [];
    lines.push('# Weekly Reflection');
    lines.push(`Period: ${new Date(startTs).toLocaleDateString()} → ${new Date(endTs).toLocaleDateString()}`);
    lines.push('');
    lines.push('## Theme Evolutions');
    for (const t of themes) {
      const dir = (t.spark[t.spark.length-1]||0) >= (t.spark[0]||0) ? 'growing' : 'stabilizing';
      const trend = t.spark.slice(-3).reduce((s,c)=> s+c,0) >= t.spark.slice(0,3).reduce((s,c)=> s+c,0) ? 'uptrend' : 'downtrend';
      lines.push(`- ${t.theme}: ${dir} (${trend}). Total refs: ${t.total}.`);
    }
    lines.push('');
    lines.push('## Focus for Next Week');
    lines.push('- Double down on the top 1-2 growing themes.');
    lines.push('- Revisit stabilizing topics to consolidate learnings.');
    lines.push('');
    lines.push('> Generated locally from your recent conversations (no external calls).');
    return lines.join('\n');
  },
  
  // Indexing
  indexConversation,
  batchIndex,
  
  // Storage management
  storeEmbedding,
  getAllEmbeddings,
  getEmbeddingById,
  deleteEmbedding,
  clearAllEmbeddings,
  
  // Phase 3: Advanced features
  semanticChunk,
  calculateAdaptiveWeight,
  getThemeClusters,
  
  // Utilities
  cosineSimilarity,
  
  // Stats
  async getStats() {
    const embeddings = await getAllEmbeddings();
    const chunks = embeddings.filter(e => e.metadata?.parentId);
    const conversations = new Set(chunks.map(c => c.metadata.parentId)).size;
    
    return {
      totalEmbeddings: embeddings.length,
      totalChunks: chunks.length,
      totalConversations: conversations,
      avgChunksPerConv: conversations > 0 ? (chunks.length / conversations).toFixed(1) : 0,
      oldestTimestamp: embeddings.length > 0 ? Math.min(...embeddings.map(e => e.timestamp)) : null,
      newestTimestamp: embeddings.length > 0 ? Math.max(...embeddings.map(e => e.timestamp)) : null,
      platforms: [...new Set(embeddings.map(e => e.metadata?.platform).filter(Boolean))],
      dbSizeBytes: embeddings.reduce((sum, e) => sum + (e.embedding?.byteLength || 0) + (e.text?.length || 0) * 2, 0)
    };
  }
};

console.log('[RAG] Engine initialized and ready');
