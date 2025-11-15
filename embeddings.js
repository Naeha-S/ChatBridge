/**
 * Local Embeddings using transformers.js + ONNX Runtime Web
 * Lightweight sentence transformer for privacy-preserving similarity scoring, RAG, and topic detection.
 */

(function() {
  'use strict';

  // Use CDN-hosted transformers.js (no npm needed for chrome extension)
  const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
  
  let pipelineInstance = null;
  let isLoading = false;
  let loadPromise = null;

  /**
   * Lazy-load the sentence transformer model
   * Uses all-MiniLM-L6-v2 quantized ONNX model (~23MB)
   */
  async function loadEmbeddingModel() {
    if (pipelineInstance) return pipelineInstance;
    if (isLoading) return loadPromise;

    isLoading = true;
    loadPromise = (async () => {
      try {
        // Dynamically import transformers.js from CDN
        const { pipeline } = await import(TRANSFORMERS_CDN);
        
        // Load the feature extraction pipeline with all-MiniLM-L6-v2
        // This model is small, fast, and good for general-purpose semantic similarity
        pipelineInstance = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
          quantized: true, // Use quantized model for smaller size
          progress_callback: (progress) => {
            if (progress.status === 'downloading' || progress.status === 'loading') {
              console.debug(`[ChatBridge Embeddings] ${progress.status}: ${progress.file} (${Math.round((progress.progress || 0) * 100)}%)`);
            }
          }
        });

        console.log('[ChatBridge Embeddings] Model loaded successfully');
        return pipelineInstance;
      } catch (e) {
        console.error('[ChatBridge Embeddings] Failed to load model:', e);
        isLoading = false;
        pipelineInstance = null;
        throw e;
      } finally {
        isLoading = false;
      }
    })();

    return loadPromise;
  }

  /**
   * Generate embedding for a text string
   * @param {string} text - Input text to embed
   * @returns {Promise<Float32Array>} - 384-dimensional embedding vector
   */
  async function getEmbedding(text) {
    try {
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        // Return zero vector for empty input
        return new Float32Array(384).fill(0);
      }

      // Truncate very long texts to avoid performance issues
      const maxLength = 512;
      const truncated = text.length > maxLength ? text.slice(0, maxLength) : text;

      const model = await loadEmbeddingModel();
      
      // Generate embedding (mean pooling is done automatically)
      const output = await model(truncated, { pooling: 'mean', normalize: true });
      
      // Extract the embedding tensor data as Float32Array
      const embedding = output.data;
      
      return embedding;
    } catch (e) {
      console.error('[ChatBridge Embeddings] getEmbedding error:', e);
      // Fallback: return zero vector
      return new Float32Array(384).fill(0);
    }
  }

  /**
   * Compute cosine similarity between two embeddings
   * @param {Float32Array} a - First embedding vector
   * @param {Float32Array} b - Second embedding vector
   * @returns {number} - Similarity score [0, 1]
   */
  function cosineSimilarity(a, b) {
    try {
      if (!a || !b || a.length !== b.length) return 0;

      let dotProduct = 0;
      let normA = 0;
      let normB = 0;

      for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }

      const denominator = Math.sqrt(normA) * Math.sqrt(normB);
      if (denominator === 0) return 0;

      // Clamp to [0, 1] range (normalized embeddings should already be in this range)
      return Math.max(0, Math.min(1, dotProduct / denominator));
    } catch (e) {
      console.error('[ChatBridge Embeddings] cosineSimilarity error:', e);
      return 0;
    }
  }

  /**
   * Compute similarity between two text strings
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {Promise<number>} - Similarity score [0, 1]
   */
  async function computeSimilarity(text1, text2) {
    try {
      const [emb1, emb2] = await Promise.all([
        getEmbedding(text1),
        getEmbedding(text2)
      ]);
      return cosineSimilarity(emb1, emb2);
    } catch (e) {
      console.error('[ChatBridge Embeddings] computeSimilarity error:', e);
      return 0;
    }
  }

  /**
   * Find most similar items from a list
   * @param {string} query - Query text
   * @param {Array<{text: string, ...}>} items - Items to search
   * @param {number} topK - Number of top results to return
   * @returns {Promise<Array<{item: any, score: number}>>} - Sorted results by similarity
   */
  async function findSimilar(query, items, topK = 5) {
    try {
      if (!items || items.length === 0) return [];

      const queryEmb = await getEmbedding(query);
      
      // Compute similarities in parallel (with batching for large lists)
      const batchSize = 10;
      const results = [];

      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchPromises = batch.map(async (item) => {
          const text = item.text || item.content || String(item);
          const emb = await getEmbedding(text);
          const score = cosineSimilarity(queryEmb, emb);
          return { item, score };
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }

      // Sort by similarity and return top K
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, topK);
    } catch (e) {
      console.error('[ChatBridge Embeddings] findSimilar error:', e);
      return [];
    }
  }

  /**
   * Preload the model in the background (optional optimization)
   * Call this during extension initialization to reduce first-use latency
   */
  async function preloadModel() {
    try {
      await loadEmbeddingModel();
    } catch (e) {
      console.warn('[ChatBridge Embeddings] Preload failed (will retry on first use):', e);
    }
  }

  // Export to global scope for use in content script
  window.ChatBridgeEmbeddings = {
    getEmbedding,
    cosineSimilarity,
    computeSimilarity,
    findSimilar,
    preloadModel
  };

  console.log('[ChatBridge Embeddings] Module loaded (model will load on first use)');
})();
