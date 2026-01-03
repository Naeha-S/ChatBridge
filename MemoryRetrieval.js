// MemoryRetrieval.js - Three-Layer Hybrid Search System
// Combines semantic similarity, intent alignment, and reasoning filtering

(function () {
    'use strict';

    // Relevance levels for display
    const RELEVANCE_LEVELS = {
        HIGH: 'high',
        MEDIUM: 'medium',
        EXPLORATORY: 'exploratory'
    };

    class MemoryRetrieval {
        constructor() {
            this.segmentEngine = null;
            this.intentAnalyzer = null;
            this.embeddings = new Map(); // segmentId -> embedding vector
            this.embeddingCache = new Map(); // query -> results cache
            this.initialized = false;
        }

        /**
         * Initialize the retrieval system
         */
        async initialize() {
            // Initialize engines
            if (window.SegmentEngine) {
                this.segmentEngine = new window.SegmentEngine();
            }
            if (window.IntentAnalyzer) {
                this.intentAnalyzer = new window.IntentAnalyzer();
            }
            this.initialized = true;
        }

        /**
         * Index a conversation - extract segments and compute embeddings
         * @param {Object} conversation - Conversation to index
         */
        async indexConversation(conversation) {
            if (!this.segmentEngine) return;

            // Extract segments
            const segments = this.segmentEngine.extractSegments(conversation);

            // Index segments
            this.segmentEngine.indexSegments(conversation.ts || Date.now(), segments);

            // Compute embeddings for each segment (if API available)
            for (const segment of segments) {
                try {
                    const embedding = await this.computeEmbedding(segment);
                    if (embedding) {
                        this.embeddings.set(segment.id, embedding);
                    }
                } catch (e) {
                    console.log('[MemoryRetrieval] Embedding computation skipped:', e.message);
                }
            }

            return segments;
        }

        /**
         * Compute embedding for a segment using available API
         */
        async computeEmbedding(segment) {
            // Get text for embedding
            const text = segment.messages.map(m => m.text).join(' ').slice(0, 1000);

            // Try to use Gemini API for embeddings
            try {
                if (window.callGeminiAsync) {
                    // Use a simpler representation for now - can be enhanced with actual embeddings
                    const keywords = segment.keywords || [];
                    const role = segment.role || '';
                    const type = segment.type || '';

                    // Create a simple vector representation based on keywords
                    return {
                        keywords: keywords,
                        role: role,
                        type: type,
                        textHash: this.simpleHash(text),
                        certainty: segment.certaintyLevel
                    };
                }
            } catch (e) {
                console.log('[MemoryRetrieval] Embedding API not available');
            }

            // Fallback: use keyword-based representation
            return {
                keywords: segment.keywords || [],
                role: segment.role || '',
                type: segment.type || '',
                textHash: this.simpleHash(text)
            };
        }

        /**
         * Simple hash function for text comparison
         */
        simpleHash(text) {
            let hash = 0;
            for (let i = 0; i < text.length; i++) {
                const char = text.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return hash;
        }

        /**
         * Main search function - three-layer retrieval
         * @param {string} query - Natural language query
         * @param {Object} options - Search options
         * @returns {Array} Ranked results with segments
         */
        async search(query, options = {}) {
            if (!query) return [];

            // Check cache
            const cacheKey = `${query}_${JSON.stringify(options)}`;
            if (this.embeddingCache.has(cacheKey)) {
                return this.embeddingCache.get(cacheKey);
            }

            // Step 1: Analyze query intent
            const queryAnalysis = this.intentAnalyzer
                ? this.intentAnalyzer.analyzeQuery(query)
                : { intent: 'find_specific', keywords: query.split(/\s+/), modifiers: [] };

            // Step 2: Get all segments
            const allSegments = this.segmentEngine ? this.segmentEngine.getAllSegments() : [];

            if (allSegments.length === 0) {
                return [];
            }

            // Step 3: Layer 1 - Semantic/Keyword similarity
            let candidates = this.semanticSearch(allSegments, queryAnalysis);

            // Step 4: Layer 2 - Intent alignment scoring
            candidates = this.scoreByIntentAlignment(candidates, queryAnalysis);

            // Step 5: Layer 3 - Reasoning filter
            candidates = this.applyReasoningFilter(candidates, queryAnalysis);

            // Step 6: Rank and limit results
            const results = this.rankResults(candidates, options.limit || 10);

            // Cache results
            this.embeddingCache.set(cacheKey, results);

            return results;
        }

        /**
         * Layer 1: Semantic/Keyword search
         */
        semanticSearch(segments, queryAnalysis) {
            const keywords = queryAnalysis.keywords || [];
            const topicFocus = queryAnalysis.topicFocus;

            return segments.map(segment => {
                const segmentText = segment.messages.map(m => m.text).join(' ').toLowerCase();
                let semanticScore = 0;

                // Keyword matching
                for (const keyword of keywords) {
                    if (segmentText.includes(keyword.toLowerCase())) {
                        semanticScore += 0.2;
                    }
                    if ((segment.keywords || []).includes(keyword.toLowerCase())) {
                        semanticScore += 0.15;
                    }
                }

                // Topic matching
                if (topicFocus && segment.topic) {
                    if (segment.topic.toLowerCase().includes(topicFocus.toLowerCase())) {
                        semanticScore += 0.3;
                    }
                    if (segmentText.includes(topicFocus.toLowerCase())) {
                        semanticScore += 0.2;
                    }
                }

                return {
                    segment: segment,
                    semanticScore: Math.min(1, semanticScore)
                };
            }).filter(r => r.semanticScore > 0.1);
        }

        /**
         * Layer 2: Intent alignment scoring
         */
        scoreByIntentAlignment(candidates, queryAnalysis) {
            return candidates.map(candidate => {
                let alignmentScore = 0;

                if (this.intentAnalyzer) {
                    alignmentScore = this.intentAnalyzer.calculateAlignmentScore(
                        queryAnalysis,
                        candidate.segment
                    );
                }

                return {
                    ...candidate,
                    alignmentScore: alignmentScore,
                    combinedScore: (candidate.semanticScore * 0.4) + (alignmentScore * 0.6)
                };
            });
        }

        /**
         * Layer 3: Reasoning filter - does segment actually answer the query?
         */
        applyReasoningFilter(candidates, queryAnalysis) {
            return candidates.map(candidate => {
                const segment = candidate.segment;
                let relevanceReason = '';
                let passesFilter = true;

                // Check based on intent type
                switch (queryAnalysis.intent) {
                    case 'find_decision':
                        passesFilter = segment.role === 'decision' || segment.type === 'decision_made';
                        relevanceReason = passesFilter ? 'Contains a decision point' : '';
                        break;

                    case 'find_confusion':
                        passesFilter = segment.role === 'confusion' || segment.type === 'confusion_loop';
                        relevanceReason = passesFilter ? 'Shows moment of confusion' : '';
                        break;

                    case 'find_evolution':
                        passesFilter = segment.type === 'idea_evolution';
                        relevanceReason = passesFilter ? 'Shows how thinking evolved' : '';
                        break;

                    case 'find_contradiction':
                        passesFilter = segment.type === 'contradiction';
                        relevanceReason = passesFilter ? 'Contradiction detected' : '';
                        break;

                    case 'find_breakthrough':
                        passesFilter = segment.role === 'breakthrough' || segment.type === 'breakthrough_moment';
                        relevanceReason = passesFilter ? 'Breakthrough moment' : '';
                        break;

                    case 'find_pattern':
                        passesFilter = segment.type === 'repeated_pattern';
                        relevanceReason = passesFilter ? 'Repeated pattern' : '';
                        break;

                    case 'middle_only':
                        // Check if segment is in middle of conversation
                        passesFilter = segment.startIndex > 2;
                        relevanceReason = passesFilter ? 'From middle of discussion' : '';
                        break;

                    default:
                        // For general search, all candidates pass but with varied reasons
                        relevanceReason = this.generateRelevanceReason(segment, queryAnalysis);
                        break;
                }

                // Apply modifier filters
                if (queryAnalysis.modifiers.includes('recent')) {
                    const isRecent = Date.now() - segment.timestamp < 7 * 24 * 60 * 60 * 1000;
                    if (!isRecent) candidate.combinedScore *= 0.5;
                }

                if (queryAnalysis.modifiers.includes('ignore_conclusions')) {
                    if (segment.role === 'decision') {
                        passesFilter = false;
                    }
                }

                return {
                    ...candidate,
                    passesFilter: passesFilter,
                    relevanceReason: relevanceReason,
                    relevanceLevel: this.calculateRelevanceLevel(candidate.combinedScore)
                };
            }).filter(c => c.passesFilter || c.combinedScore > 0.3);
        }

        /**
         * Generate a human-readable relevance reason
         */
        generateRelevanceReason(segment, queryAnalysis) {
            const reasons = [];

            if (segment.type === 'decision_made') reasons.push('Decision made');
            else if (segment.type === 'confusion_loop') reasons.push('Confusion detected');
            else if (segment.type === 'breakthrough_moment') reasons.push('Breakthrough moment');
            else if (segment.type === 'idea_evolution') reasons.push('Idea evolution');
            else if (segment.type === 'contradiction') reasons.push('Contradiction found');

            if (segment.role === 'question') reasons.push('Key question');
            else if (segment.role === 'hypothesis') reasons.push('Hypothesis explored');
            else if (segment.role === 'rejection') reasons.push('Idea rejected');

            if (reasons.length === 0) {
                reasons.push('Relevant content');
            }

            return reasons.join(' • ');
        }

        /**
         * Calculate relevance level for display
         */
        calculateRelevanceLevel(score) {
            if (score >= 0.7) return RELEVANCE_LEVELS.HIGH;
            if (score >= 0.4) return RELEVANCE_LEVELS.MEDIUM;
            return RELEVANCE_LEVELS.EXPLORATORY;
        }

        /**
         * Rank and format final results
         */
        rankResults(candidates, limit) {
            return candidates
                .sort((a, b) => b.combinedScore - a.combinedScore)
                .slice(0, limit)
                .map((candidate, index) => ({
                    rank: index + 1,
                    segment: candidate.segment,
                    score: candidate.combinedScore,
                    relevanceLevel: candidate.relevanceLevel,
                    relevanceReason: candidate.relevanceReason,
                    excerpt: this.formatExcerpt(candidate.segment),
                    expandedContext: null, // Loaded on demand
                    fullConversation: null // Loaded on demand
                }));
        }

        /**
         * Format segment as excerpt (5-8 turns)
         */
        formatExcerpt(segment) {
            const messages = segment.messages.slice(0, 8);
            return messages.map(m => ({
                role: m.role,
                text: m.text.length > 200 ? m.text.slice(0, 200) + '...' : m.text
            }));
        }

        /**
         * Load expanded context for a result
         */
        async loadExpandedContext(result, conversationId) {
            // Get full conversation to provide more context
            try {
                const conversations = await this.getStoredConversations();
                const conv = conversations.find(c => String(c.ts) === String(conversationId));

                if (conv && conv.conversation) {
                    const segment = result.segment;
                    const startIdx = Math.max(0, segment.startIndex - 3);
                    const endIdx = Math.min(conv.conversation.length, segment.endIndex + 4);

                    return conv.conversation.slice(startIdx, endIdx).map(m => ({
                        role: m.role,
                        text: m.text,
                        isCore: m.index >= segment.startIndex && m.index <= segment.endIndex
                    }));
                }
            } catch (e) {
                console.log('[MemoryRetrieval] Error loading context:', e);
            }
            return null;
        }

        /**
         * Load full conversation for a result
         */
        async loadFullConversation(conversationId) {
            try {
                const conversations = await this.getStoredConversations();
                return conversations.find(c => String(c.ts) === String(conversationId));
            } catch (e) {
                console.log('[MemoryRetrieval] Error loading conversation:', e);
                return null;
            }
        }

        /**
         * Get stored conversations from Chrome storage
         */
        getStoredConversations() {
            return new Promise((resolve) => {
                try {
                    chrome.storage.local.get(['chatbridge_conversations_v1'], (res) => {
                        resolve(res['chatbridge_conversations_v1'] || []);
                    });
                } catch (e) {
                    resolve([]);
                }
            });
        }

        /**
         * Index all stored conversations
         */
        async indexAllConversations() {
            const conversations = await this.getStoredConversations();
            let totalSegments = 0;

            for (const conv of conversations) {
                const segments = await this.indexConversation(conv);
                totalSegments += segments.length;
            }

            return {
                conversationsIndexed: conversations.length,
                segmentsCreated: totalSegments
            };
        }

        /**
         * Get filter by segment type
         */
        getSegmentsByType(type) {
            if (!this.segmentEngine) return [];
            return this.segmentEngine.filterByType(type);
        }

        /**
         * Clear cache
         */
        clearCache() {
            this.embeddingCache.clear();
        }
    }

    // Export
    window.MemoryRetrieval = MemoryRetrieval;
    window.RELEVANCE_LEVELS = RELEVANCE_LEVELS;

})();
