// SegmentEngine.js - Semantic Chunking and Segment Metadata Extraction
// Breaks conversations into meaning-based segments for intent-aware retrieval
// Supports platform-aware segmentation via PlatformFingerprint

(function () {
    'use strict';

    // ─── Constants ────────────────────────────────────────────────────────────
    const FINGERPRINT_STORAGE_KEY = 'chatbridge:platform_fingerprints';

    // Segment roles for classification
    const SEGMENT_ROLES = {
        QUESTION: 'question',
        HYPOTHESIS: 'hypothesis',
        REJECTION: 'rejection',
        DECISION: 'decision',
        REFLECTION: 'reflection',
        EXPLANATION: 'explanation',
        CONFUSION: 'confusion',
        BREAKTHROUGH: 'breakthrough'
    };

    // Segment types for grouping results
    const SEGMENT_TYPES = {
        DECISION_MADE: 'decision_made',
        CONFUSION_LOOP: 'confusion_loop',
        IDEA_EVOLUTION: 'idea_evolution',
        REPEATED_PATTERN: 'repeated_pattern',
        CONTRADICTION: 'contradiction',
        BREAKTHROUGH: 'breakthrough_moment'
    };

    // ─── PlatformFingerprint ──────────────────────────────────────────────────
    // Analyzes and stores per-platform response structure characteristics.
    // Used to tune segment boundaries for each AI chat platform.

    /**
     * Shape of a platform fingerprint:
     * {
     *   platformId: string,
     *   avgParagraphLength: number,    // avg chars per paragraph in assistant responses
     *   avgTurnLength: number,         // avg chars per assistant turn
     *   codeBlockFrequency: number,    // code blocks per assistant message (0-1+)
     *   listFrequency: number,         // bullet/numbered lists per assistant message
     *   headerFrequency: number,       // markdown headers per assistant message
     *   citationFrequency: number,     // inline citations per assistant message
     *   avgTurnsPerExchange: number,   // avg messages per user-assistant exchange
     *   shortResponseRatio: number,    // fraction of responses under 200 chars
     *   longResponseRatio: number,     // fraction of responses over 2000 chars
     *   sampleCount: number,           // how many conversations contributed
     *   lastUpdated: number,
     *   // Derived segmentation parameters (computed from the above)
     *   segParams: {
     *     maxTurnsPerSegment: number,  // replaces the hardcoded 8
     *     roleClusterThreshold: number,// replaces the hardcoded 5
     *     topicShiftSensitivity: number // 0-1, higher = more eager to split
     *   }
     * }
     */

    class PlatformFingerprint {
        constructor() {
            this.fingerprints = {};
            this._loaded = false;
        }

        // ─── Persistence ────────────────────────────────────────────────────

        /** Load fingerprints from localStorage */
        load() {
            try {
                const raw = localStorage.getItem(FINGERPRINT_STORAGE_KEY);
                if (raw) {
                    this.fingerprints = JSON.parse(raw);
                    console.log('[ChatBridge] PlatformFingerprint loaded:', Object.keys(this.fingerprints).length, 'platforms');
                }
            } catch (e) {
                console.warn('[ChatBridge] PlatformFingerprint load error:', e);
                this.fingerprints = {};
            }
            this._loaded = true;
        }

        /** Save fingerprints to localStorage */
        save() {
            try {
                localStorage.setItem(FINGERPRINT_STORAGE_KEY, JSON.stringify(this.fingerprints));
            } catch (e) {
                console.warn('[ChatBridge] PlatformFingerprint save error:', e);
            }
        }

        // ─── Fingerprinting ─────────────────────────────────────────────────

        /**
         * Analyze a conversation's messages and update the fingerprint for its platform.
         * Call this after each scan to incrementally refine the fingerprint.
         *
         * @param {string} platformId - Platform identifier (adapter.id or hostname)
         * @param {Array} messages - Array of {role, text} message objects
         * @param {Object} [hints] - Optional responseStructureHints from the adapter
         */
        analyze(platformId, messages, hints) {
            if (!platformId || !messages || messages.length < 2) return;

            const assistantMsgs = messages.filter(m => m.role === 'assistant' && m.text && m.text.length > 10);
            if (assistantMsgs.length === 0) return;

            // Compute structural metrics from assistant responses
            const metrics = this._computeMetrics(assistantMsgs, messages);

            // Merge with existing fingerprint (incremental update)
            const existing = this.fingerprints[platformId];
            if (existing && existing.sampleCount > 0) {
                this.fingerprints[platformId] = this._mergeFingerprint(existing, metrics);
            } else {
                this.fingerprints[platformId] = {
                    platformId,
                    ...metrics,
                    sampleCount: 1,
                    lastUpdated: Date.now(),
                    segParams: this._deriveSegParams(metrics, hints)
                };
            }

            // Apply adapter hints as overrides if provided
            if (hints) {
                this._applyHints(this.fingerprints[platformId], hints);
            }

            this.save();
        }

        /**
         * Compute structural metrics from a set of assistant messages.
         * @param {Array} assistantMsgs - Messages with role=assistant
         * @param {Array} allMessages - All messages in the conversation
         * @returns {Object} Raw metric values
         */
        _computeMetrics(assistantMsgs, allMessages) {
            let totalParagraphLen = 0;
            let paragraphCount = 0;
            let totalTurnLen = 0;
            let codeBlockCount = 0;
            let listCount = 0;
            let headerCount = 0;
            let citationCount = 0;
            let shortResponses = 0;
            let longResponses = 0;

            for (const msg of assistantMsgs) {
                const text = msg.text;
                totalTurnLen += text.length;

                // Paragraphs: split by double newline or single newline with blank
                const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
                paragraphCount += paragraphs.length;
                for (const p of paragraphs) {
                    totalParagraphLen += p.trim().length;
                }

                // Code blocks: count ``` occurrences (paired)
                const codeMatches = text.match(/```/g);
                codeBlockCount += codeMatches ? Math.floor(codeMatches.length / 2) : 0;

                // Lists: count lines starting with - or * or numbered (1. 2. etc.)
                const listLines = text.match(/^[\s]*[-*•]\s|^[\s]*\d+\.\s/gm);
                listCount += listLines ? listLines.length : 0;

                // Headers: count markdown # lines
                const headers = text.match(/^#{1,6}\s/gm);
                headerCount += headers ? headers.length : 0;

                // Citations: count [N] or [source] or (source) patterns
                const citations = text.match(/\[\d+\]|\[source[^\]]*\]|\[citation[^\]]*\]/gi);
                citationCount += citations ? citations.length : 0;

                // Length classification
                if (text.length < 200) shortResponses++;
                if (text.length > 2000) longResponses++;
            }

            const n = assistantMsgs.length;

            // Compute turns per exchange (user-assistant pairs)
            let exchanges = 0;
            let turnsInExchanges = 0;
            let inExchange = false;
            for (const msg of allMessages) {
                if (msg.role === 'user') {
                    if (inExchange) exchanges++;
                    inExchange = true;
                    turnsInExchanges++;
                } else if (msg.role === 'assistant' && inExchange) {
                    turnsInExchanges++;
                }
            }
            if (inExchange) exchanges++;

            return {
                avgParagraphLength: paragraphCount > 0 ? totalParagraphLen / paragraphCount : 0,
                avgTurnLength: n > 0 ? totalTurnLen / n : 0,
                codeBlockFrequency: n > 0 ? codeBlockCount / n : 0,
                listFrequency: n > 0 ? listCount / n : 0,
                headerFrequency: n > 0 ? headerCount / n : 0,
                citationFrequency: n > 0 ? citationCount / n : 0,
                avgTurnsPerExchange: exchanges > 0 ? turnsInExchanges / exchanges : 2,
                shortResponseRatio: n > 0 ? shortResponses / n : 0,
                longResponseRatio: n > 0 ? longResponses / n : 0
            };
        }

        /**
         * Merge new metrics into an existing fingerprint using exponential moving average.
         * Older data is weighted less as more samples arrive.
         */
        _mergeFingerprint(existing, newMetrics) {
            const totalSamples = existing.sampleCount + 1;
            // Weight: new data gets 1/totalSamples influence (diminishing returns)
            const alpha = 1 / totalSamples;

            const merged = { ...existing };
            const metricKeys = [
                'avgParagraphLength', 'avgTurnLength', 'codeBlockFrequency',
                'listFrequency', 'headerFrequency', 'citationFrequency',
                'avgTurnsPerExchange', 'shortResponseRatio', 'longResponseRatio'
            ];

            for (const key of metricKeys) {
                if (typeof newMetrics[key] === 'number') {
                    merged[key] = existing[key] * (1 - alpha) + newMetrics[key] * alpha;
                }
            }

            merged.sampleCount = totalSamples;
            merged.lastUpdated = Date.now();
            merged.segParams = this._deriveSegParams(merged, null);

            return merged;
        }

        /**
         * Derive segmentation parameters from fingerprint metrics.
         * This is the core logic that converts platform behavior observations
         * into actionable segmentation tuning.
         *
         * @param {Object} metrics - Fingerprint metrics
         * @param {Object} [hints] - Optional adapter hints
         * @returns {Object} { maxTurnsPerSegment, roleClusterThreshold, topicShiftSensitivity }
         */
        _deriveSegParams(metrics, hints) {
            // Base defaults (match the original hardcoded values)
            let maxTurns = 8;
            let roleCluster = 5;
            let topicShiftSensitivity = 0.5;

            // Platforms with long responses → allow more turns per segment
            // (each turn carries more content, so fewer turns = adequate context)
            if (metrics.avgTurnLength > 1500) {
                maxTurns = 5;  // Long responses (Claude-like): fewer turns per segment
                topicShiftSensitivity = 0.6; // More eager to split
            } else if (metrics.avgTurnLength > 800) {
                maxTurns = 7;  // Medium responses
            } else if (metrics.avgTurnLength < 300) {
                maxTurns = 12; // Short, conversational (Gemini-like): more turns per segment
                topicShiftSensitivity = 0.4; // Less eager to split
            }

            // Platforms with heavy structure (headers, code blocks) → structure-aware splitting
            if (metrics.headerFrequency > 0.5) {
                // Headers are natural segment boundaries
                topicShiftSensitivity = 0.7;
            }

            if (metrics.codeBlockFrequency > 0.3) {
                // Code-heavy conversations: keep code blocks within segments
                maxTurns = Math.max(maxTurns, 6);
                roleCluster = 6; // Allow longer runs of same role (code explanations)
            }

            // Platforms with inline citations (Perplexity-like)
            if (metrics.citationFrequency > 0.5) {
                // Citation-heavy: each response is self-contained, split tighter
                maxTurns = Math.min(maxTurns, 6);
                topicShiftSensitivity = 0.65;
            }

            // Short response platforms → group more turns together
            if (metrics.shortResponseRatio > 0.6) {
                maxTurns = Math.max(maxTurns, 10);
                roleCluster = 4; // Shorter role clusters before splitting
            }

            // Apply adapter hints as strong overrides
            if (hints && hints.segParams) {
                if (typeof hints.segParams.maxTurnsPerSegment === 'number') maxTurns = hints.segParams.maxTurnsPerSegment;
                if (typeof hints.segParams.roleClusterThreshold === 'number') roleCluster = hints.segParams.roleClusterThreshold;
                if (typeof hints.segParams.topicShiftSensitivity === 'number') topicShiftSensitivity = hints.segParams.topicShiftSensitivity;
            }

            return {
                maxTurnsPerSegment: Math.max(3, Math.min(20, Math.round(maxTurns))),
                roleClusterThreshold: Math.max(3, Math.min(10, Math.round(roleCluster))),
                topicShiftSensitivity: Math.max(0, Math.min(1, topicShiftSensitivity))
            };
        }

        /**
         * Apply adapter responseStructureHints as refinements to an existing fingerprint.
         */
        _applyHints(fingerprint, hints) {
            if (!hints) return;
            // Hints can override derived segParams
            if (hints.segParams) {
                const sp = fingerprint.segParams;
                if (typeof hints.segParams.maxTurnsPerSegment === 'number') sp.maxTurnsPerSegment = hints.segParams.maxTurnsPerSegment;
                if (typeof hints.segParams.roleClusterThreshold === 'number') sp.roleClusterThreshold = hints.segParams.roleClusterThreshold;
                if (typeof hints.segParams.topicShiftSensitivity === 'number') sp.topicShiftSensitivity = hints.segParams.topicShiftSensitivity;
            }
            // Hints can also set known characteristic flags
            if (typeof hints.citationHeavy === 'boolean' && hints.citationHeavy) {
                fingerprint.citationFrequency = Math.max(fingerprint.citationFrequency, 0.6);
            }
            if (typeof hints.codeHeavy === 'boolean' && hints.codeHeavy) {
                fingerprint.codeBlockFrequency = Math.max(fingerprint.codeBlockFrequency, 0.4);
            }
        }

        /**
         * Get the fingerprint for a platform (returns null if not yet computed).
         * @param {string} platformId
         * @returns {Object|null}
         */
        getFingerprint(platformId) {
            if (!this._loaded) this.load();
            return this.fingerprints[platformId] || null;
        }

        /**
         * Get segmentation parameters for a platform.
         * Falls back to defaults if no fingerprint exists.
         * @param {string} platformId
         * @returns {Object} { maxTurnsPerSegment, roleClusterThreshold, topicShiftSensitivity }
         */
        getSegParams(platformId) {
            const fp = this.getFingerprint(platformId);
            if (fp && fp.segParams) return fp.segParams;

            // Default params (match original hardcoded behavior)
            return {
                maxTurnsPerSegment: 8,
                roleClusterThreshold: 5,
                topicShiftSensitivity: 0.5
            };
        }

        /** Get all fingerprints for display/debug */
        getAllFingerprints() {
            if (!this._loaded) this.load();
            return { ...this.fingerprints };
        }

        /** Clear all fingerprints */
        clear() {
            this.fingerprints = {};
            this.save();
        }
    }

    // ─── NormalizedSegment ────────────────────────────────────────────────────
    // Strips platform-specific formatting from segment text before embedding.
    // Produces a common representation so cross-platform retrieval is fair.

    class NormalizedSegment {
        /**
         * Normalize a segment's text content for platform-agnostic embedding.
         * Strips markdown headers, code fences, citation markers, list bullets,
         * and extra whitespace to produce clean semantic content.
         *
         * @param {Object} segment - A segment object with .messages[]
         * @returns {Object} { normalizedText, originalSegment, platformId, normalizationApplied }
         */
        static normalize(segment) {
            if (!segment || !segment.messages) {
                return { normalizedText: '', originalSegment: segment, platformId: null, normalizationApplied: [] };
            }

            const platformId = segment.platform || 'unknown';
            const applied = [];

            let text = segment.messages.map(m => {
                let t = m.text || '';

                // 1. Strip markdown headers
                const hadHeaders = /^#{1,6}\s/m.test(t);
                t = t.replace(/^#{1,6}\s+/gm, '');
                if (hadHeaders) applied.push('strip_headers');

                // 2. Strip code fences (keep code content, remove ``` markers)
                const hadCodeFences = /```/.test(t);
                t = t.replace(/```[\w]*\n?/g, '');
                if (hadCodeFences) applied.push('strip_code_fences');

                // 3. Strip inline code backticks
                t = t.replace(/`([^`]+)`/g, '$1');

                // 4. Strip citation markers [1] [2] [source]
                const hadCitations = /\[\d+\]|\[source/i.test(t);
                t = t.replace(/\[\d+\]/g, '');
                t = t.replace(/\[source[^\]]*\]/gi, '');
                t = t.replace(/\[citation[^\]]*\]/gi, '');
                if (hadCitations) applied.push('strip_citations');

                // 5. Normalize list markers to plain dashes
                t = t.replace(/^[\s]*[*•]\s/gm, '- ');
                t = t.replace(/^[\s]*\d+\.\s/gm, '- ');

                // 6. Strip bold/italic markers
                t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
                t = t.replace(/\*([^*]+)\*/g, '$1');
                t = t.replace(/__([^_]+)__/g, '$1');
                t = t.replace(/_([^_]+)_/g, '$1');

                // 7. Collapse whitespace
                t = t.replace(/\n{3,}/g, '\n\n');
                t = t.replace(/[ \t]+/g, ' ');

                return t.trim();
            }).join('\n');

            // Final cleanup
            text = text.replace(/\n{3,}/g, '\n\n').trim();

            return {
                normalizedText: text,
                originalSegment: segment,
                platformId,
                normalizationApplied: [...new Set(applied)]
            };
        }

        /**
         * Batch normalize segments, optionally filtering out very short results.
         * @param {Array} segments - Array of segment objects
         * @param {number} minLength - Minimum normalized text length to keep (default 20)
         * @returns {Array} Array of normalized segment objects
         */
        static normalizeBatch(segments, minLength = 20) {
            if (!Array.isArray(segments)) return [];
            return segments
                .map(seg => NormalizedSegment.normalize(seg))
                .filter(ns => ns.normalizedText.length >= minLength);
        }
    }

    class SegmentEngine {
        constructor() {
            this.segments = [];
            this.segmentIndex = new Map(); // conversationId -> segments[]
            this.fingerprinter = new PlatformFingerprint();
        }

        /**
         * Extract segments from a conversation.
         * When platformId is provided, loads the platform fingerprint to tune
         * segment boundaries. Falls back to generic defaults if no fingerprint exists.
         *
         * @param {Object} conversation - Conversation object with messages
         * @param {string} [platformId] - Optional platform identifier for fingerprint lookup
         * @returns {Array} Array of segment objects
         */
        extractSegments(conversation, platformId) {
            if (!conversation || !conversation.conversation || !Array.isArray(conversation.conversation)) {
                return [];
            }

            // Resolve platform ID: explicit param > conversation.platform > 'unknown'
            const resolvedPlatform = platformId || conversation.platform || 'unknown';

            // Load platform-specific segmentation parameters
            const segParams = this.fingerprinter.getSegParams(resolvedPlatform);

            const messages = conversation.conversation;
            const segments = [];
            let currentSegment = null;
            let segmentIndex = 0;

            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];
                const prevMsg = i > 0 ? messages[i - 1] : null;
                const nextMsg = i < messages.length - 1 ? messages[i + 1] : null;

                // Detect topic shift or role change to start new segment
                // Uses platform-specific segParams for boundary tuning
                const shouldStartNewSegment = this.detectSegmentBoundary(msg, prevMsg, currentSegment, segParams);

                if (shouldStartNewSegment || !currentSegment) {
                    // Save previous segment
                    if (currentSegment && currentSegment.messages.length > 0) {
                        currentSegment.endIndex = i - 1;
                        this.enrichSegment(currentSegment);
                        segments.push(currentSegment);
                    }

                    // Start new segment
                    segmentIndex++;
                    currentSegment = {
                        id: `${conversation.ts || Date.now()}_seg_${segmentIndex}`,
                        conversationId: String(conversation.ts || Date.now()),
                        conversationUrl: conversation.url || '',
                        platform: conversation.platform || 'unknown',
                        startIndex: i,
                        endIndex: i,
                        messages: [],
                        topic: null,
                        intent: null,
                        role: null,
                        type: null,
                        certaintyLevel: 0.5, // 0-1 scale
                        keywords: [],
                        summary: null,
                        timestamp: conversation.ts || Date.now()
                    };
                }

                currentSegment.messages.push({
                    index: i,
                    role: msg.role,
                    text: msg.text || '',
                    timestamp: msg.timestamp || null
                });
                currentSegment.endIndex = i;
            }

            // Save final segment
            if (currentSegment && currentSegment.messages.length > 0) {
                this.enrichSegment(currentSegment);
                segments.push(currentSegment);
            }

            // Detect cross-segment patterns
            this.detectPatterns(segments);

            return segments;
        }

        /**
         * Detect if we should start a new segment.
         * Uses platform-tuned parameters for boundary decisions.
         *
         * @param {Object} msg - Current message
         * @param {Object} prevMsg - Previous message
         * @param {Object} currentSegment - Current segment being built
         * @param {Object} [segParams] - Platform-specific segmentation parameters
         */
        detectSegmentBoundary(msg, prevMsg, currentSegment, segParams) {
            if (!prevMsg || !currentSegment) return true;

            // Platform-tuned parameters (with fallbacks to original hardcoded values)
            const maxTurns = (segParams && segParams.maxTurnsPerSegment) || 8;
            const roleClusterThreshold = (segParams && segParams.roleClusterThreshold) || 5;
            const sensitivity = (segParams && segParams.topicShiftSensitivity) || 0.5;

            const text = (msg.text || '').toLowerCase();
            const prevText = (prevMsg.text || '').toLowerCase();

            // Topic shift indicators
            const topicShiftPhrases = [
                'let\'s talk about', 'moving on', 'another thing', 'by the way',
                'changing topic', 'on a different note', 'actually,', 'wait,',
                'hold on', 'back to', 'regarding', 'about the'
            ];

            for (const phrase of topicShiftPhrases) {
                if (text.includes(phrase)) return true;
            }

            // Platform-aware structural boundary detection:
            // If the message starts with a markdown header, treat as segment boundary
            // (stronger effect when topicShiftSensitivity is high)
            if (sensitivity >= 0.6 && /^#{1,3}\s/.test(msg.text || '')) {
                return true;
            }

            // Role change (user asking vs AI explaining for extended period)
            // Uses platform-tuned roleClusterThreshold instead of hardcoded 5
            if (currentSegment.messages.length >= roleClusterThreshold) {
                const recentRoles = currentSegment.messages.slice(-3).map(m => m.role);
                if (recentRoles.every(r => r === msg.role)) {
                    // Same role for 3+ messages, might be a new segment
                    return true;
                }
            }

            // Segment getting too long — uses platform-tuned maxTurns instead of hardcoded 8
            if (currentSegment.messages.length >= maxTurns) {
                return true;
            }

            return false;
        }

        /**
         * Enrich segment with metadata
         */
        enrichSegment(segment) {
            const fullText = segment.messages.map(m => m.text).join(' ');
            const lowerText = fullText.toLowerCase();

            // Detect role
            segment.role = this.detectRole(segment.messages, lowerText);

            // Detect type
            segment.type = this.detectType(segment.messages, lowerText);

            // Extract keywords
            segment.keywords = this.extractKeywords(fullText);

            // Detect topic
            segment.topic = this.detectTopic(segment.keywords, fullText);

            // Calculate certainty level
            segment.certaintyLevel = this.calculateCertainty(lowerText);

            // Generate summary
            segment.summary = this.generateSummary(segment);
        }

        /**
         * Detect the primary role of a segment
         */
        detectRole(messages, text) {
            // Questions
            const questionCount = (text.match(/\?/g) || []).length;
            if (questionCount >= 2) return SEGMENT_ROLES.QUESTION;

            // Decision indicators
            const decisionPhrases = ['i\'ll go with', 'let\'s use', 'i decided', 'the answer is', 'i\'m going to'];
            if (decisionPhrases.some(p => text.includes(p))) return SEGMENT_ROLES.DECISION;

            // Rejection indicators
            const rejectionPhrases = ['that won\'t work', 'i don\'t think', 'no, because', 'actually no', 'let\'s not'];
            if (rejectionPhrases.some(p => text.includes(p))) return SEGMENT_ROLES.REJECTION;

            // Confusion indicators
            const confusionPhrases = ['i\'m confused', 'not sure', 'don\'t understand', 'what do you mean', 'i\'m lost'];
            if (confusionPhrases.some(p => text.includes(p))) return SEGMENT_ROLES.CONFUSION;

            // Breakthrough indicators
            const breakthroughPhrases = ['aha', 'i get it', 'that makes sense', 'now i understand', 'oh!'];
            if (breakthroughPhrases.some(p => text.includes(p))) return SEGMENT_ROLES.BREAKTHROUGH;

            // Hypothesis indicators
            const hypothesisPhrases = ['what if', 'maybe', 'could we', 'i think', 'perhaps'];
            if (hypothesisPhrases.some(p => text.includes(p))) return SEGMENT_ROLES.HYPOTHESIS;

            // Default to explanation
            return SEGMENT_ROLES.EXPLANATION;
        }

        /**
         * Detect the type of segment for result grouping
         */
        detectType(messages, text) {
            // Check for contradiction
            const contradictionPhrases = ['but earlier', 'wait, you said', 'that contradicts', 'on the other hand'];
            if (contradictionPhrases.some(p => text.includes(p))) return SEGMENT_TYPES.CONTRADICTION;

            // Check for decision
            const decisionPhrases = ['final', 'decided', 'going with', 'the choice is'];
            if (decisionPhrases.some(p => text.includes(p))) return SEGMENT_TYPES.DECISION_MADE;

            // Check for confusion loop
            const confusionCount = (text.match(/\?/g) || []).length;
            const stillPhrases = ['still don\'t', 'still confused', 'not getting'];
            if (confusionCount > 3 || stillPhrases.some(p => text.includes(p))) {
                return SEGMENT_TYPES.CONFUSION_LOOP;
            }

            // Check for breakthrough
            const breakthroughPhrases = ['finally', 'got it', 'makes sense now', 'i see'];
            if (breakthroughPhrases.some(p => text.includes(p))) return SEGMENT_TYPES.BREAKTHROUGH;

            // Default to idea evolution
            return SEGMENT_TYPES.IDEA_EVOLUTION;
        }

        /**
         * Extract keywords from text
         */
        extractKeywords(text) {
            // Remove common words and extract significant terms
            const stopWords = new Set([
                'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
                'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
                'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
                'i', 'you', 'we', 'they', 'it', 'he', 'she', 'my', 'your', 'our',
                'and', 'or', 'but', 'if', 'then', 'so', 'because', 'for', 'with',
                'to', 'from', 'in', 'on', 'at', 'by', 'of', 'about', 'into'
            ]);

            const words = text.toLowerCase()
                .replace(/[^a-z0-9\s]/g, '')
                .split(/\s+/)
                .filter(w => w.length > 3 && !stopWords.has(w));

            // Count frequency
            const freq = {};
            words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });

            // Return top keywords
            return Object.entries(freq)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([word]) => word);
        }

        /**
         * Detect the main topic
         */
        detectTopic(keywords, text) {
            if (keywords.length === 0) return 'General Discussion';

            // Use top 2-3 keywords as topic
            return keywords.slice(0, 3)
                .map(k => k.charAt(0).toUpperCase() + k.slice(1))
                .join(', ');
        }

        /**
         * Calculate certainty level (how confident the user seems)
         */
        calculateCertainty(text) {
            let certainty = 0.5;

            // Uncertainty indicators
            const uncertainPhrases = ['maybe', 'perhaps', 'i think', 'not sure', 'might', 'could be'];
            uncertainPhrases.forEach(p => {
                if (text.includes(p)) certainty -= 0.1;
            });

            // Certainty indicators
            const certainPhrases = ['definitely', 'absolutely', 'i know', 'clearly', 'obviously', 'for sure'];
            certainPhrases.forEach(p => {
                if (text.includes(p)) certainty += 0.1;
            });

            // Clamp between 0 and 1
            return Math.max(0, Math.min(1, certainty));
        }

        /**
         * Generate a brief summary of the segment
         */
        generateSummary(segment) {
            const firstMsg = segment.messages[0];
            const lastMsg = segment.messages[segment.messages.length - 1];

            // Take first 100 chars of first message + last 50 chars of last message
            const start = (firstMsg.text || '').slice(0, 100);
            const end = segment.messages.length > 1 ? '...' + (lastMsg.text || '').slice(-50) : '';

            return start + end;
        }

        /**
         * Detect patterns across segments
         */
        detectPatterns(segments) {
            // Detect repeated questions or topics
            const topicCounts = {};
            segments.forEach(seg => {
                if (seg.topic) {
                    topicCounts[seg.topic] = (topicCounts[seg.topic] || 0) + 1;
                }
            });

            // Mark repeated patterns
            segments.forEach(seg => {
                if (seg.topic && topicCounts[seg.topic] > 2) {
                    seg.type = SEGMENT_TYPES.REPEATED_PATTERN;
                }
            });

            // Detect idea evolution (same topic, different conclusions)
            const topicSegments = {};
            segments.forEach(seg => {
                if (seg.topic) {
                    if (!topicSegments[seg.topic]) topicSegments[seg.topic] = [];
                    topicSegments[seg.topic].push(seg);
                }
            });

            Object.values(topicSegments).forEach(segs => {
                if (segs.length > 1) {
                    const hasDecision = segs.some(s => s.role === SEGMENT_ROLES.DECISION);
                    const hasRejection = segs.some(s => s.role === SEGMENT_ROLES.REJECTION);
                    if (hasDecision && hasRejection) {
                        segs.forEach(s => { if (s.type !== SEGMENT_TYPES.DECISION_MADE) s.type = SEGMENT_TYPES.IDEA_EVOLUTION; });
                    }
                }
            });
        }

        /**
         * Index segments for a conversation
         */
        indexSegments(conversationId, segments) {
            this.segmentIndex.set(String(conversationId), segments);
            this.segments = Array.from(this.segmentIndex.values()).flat();
        }

        /**
         * Get all segments for a conversation
         */
        getSegments(conversationId) {
            return this.segmentIndex.get(String(conversationId)) || [];
        }

        /**
         * Get all indexed segments
         */
        getAllSegments() {
            return this.segments;
        }

        /**
         * Search segments by keyword
         */
        searchByKeyword(query) {
            const queryLower = query.toLowerCase();
            const queryWords = queryLower.split(/\s+/);

            return this.segments.filter(seg => {
                const segText = seg.messages.map(m => m.text).join(' ').toLowerCase();
                return queryWords.some(word => segText.includes(word) || seg.keywords.includes(word));
            });
        }

        /**
         * Filter segments by type
         */
        filterByType(type) {
            return this.segments.filter(seg => seg.type === type);
        }

        /**
         * Filter segments by role
         */
        filterByRole(role) {
            return this.segments.filter(seg => seg.role === role);
        }

        // ─── Drift Detection Utilities ──────────────────────────────────────────

        /**
         * Build a compact text representation from source segments for drift comparison.
         * Extracts the most semantically important parts: topics, decisions, key questions.
         * @param {Array} segments - Array of segment objects from extractSegments()
         * @param {number} maxChars - Maximum characters for the output (default 2000)
         * @returns {string} Compact context string optimized for embedding comparison
         */
        static buildDriftContext(segments, maxChars = 2000) {
            if (!segments || segments.length === 0) return '';

            // Prioritize segments by relevance for drift detection
            const priorityOrder = [
                SEGMENT_ROLES.DECISION,
                SEGMENT_ROLES.BREAKTHROUGH,
                SEGMENT_ROLES.QUESTION,
                SEGMENT_ROLES.HYPOTHESIS,
                SEGMENT_ROLES.REJECTION,
                SEGMENT_ROLES.CONFUSION,
                SEGMENT_ROLES.REFLECTION,
                SEGMENT_ROLES.EXPLANATION
            ];

            // Sort by priority (but keep chronological within same priority)
            const sorted = [...segments].sort((a, b) => {
                const aPri = priorityOrder.indexOf(a.role);
                const bPri = priorityOrder.indexOf(b.role);
                if (aPri !== bPri) return aPri - bPri;
                return a.startIndex - b.startIndex;
            });

            let context = '';
            for (const seg of sorted) {
                if (context.length >= maxChars) break;

                const part = `[${seg.role || 'general'}] ${seg.topic || ''}: ${seg.summary || seg.messages.map(m => m.text).join(' ').slice(0, 200)}\n`;
                context += part;
            }

            return context.slice(0, maxChars);
        }

        /**
         * Extract key topics and decisions from segments for repair prompt generation.
         * Returns structured data about what matters most in the source conversation.
         * @param {Array} segments - Array of segment objects
         * @returns {Object} { topics: string[], decisions: string[], openQuestions: string[], keyTerms: string[] }
         */
        static extractDriftRepairContext(segments) {
            if (!segments || segments.length === 0) {
                return { topics: [], decisions: [], openQuestions: [], keyTerms: [] };
            }

            const topics = [];
            const decisions = [];
            const openQuestions = [];
            const keyTerms = new Set();

            for (const seg of segments) {
                if (seg.topic) topics.push(seg.topic);
                if (seg.keywords) seg.keywords.forEach(k => keyTerms.add(k));

                if (seg.role === SEGMENT_ROLES.DECISION) {
                    const decisionText = seg.summary || seg.messages.map(m => m.text).join(' ').slice(0, 150);
                    decisions.push(decisionText);
                }

                if (seg.role === SEGMENT_ROLES.QUESTION || seg.role === SEGMENT_ROLES.CONFUSION) {
                    // Check if this question was answered in a later segment
                    const lastMsg = seg.messages[seg.messages.length - 1];
                    if (lastMsg && lastMsg.role === 'user') {
                        openQuestions.push(lastMsg.text.slice(0, 150));
                    }
                }
            }

            return {
                topics: [...new Set(topics)],
                decisions,
                openQuestions: openQuestions.slice(0, 5),
                keyTerms: [...keyTerms].slice(0, 15)
            };
        }
    }

    // Export
    window.SegmentEngine = SegmentEngine;
    window.SEGMENT_ROLES = SEGMENT_ROLES;
    window.SEGMENT_TYPES = SEGMENT_TYPES;
    window.PlatformFingerprint = PlatformFingerprint;
    window.NormalizedSegment = NormalizedSegment;

})();
