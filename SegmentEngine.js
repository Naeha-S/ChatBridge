// SegmentEngine.js - Semantic Chunking and Segment Metadata Extraction
// Breaks conversations into meaning-based segments for intent-aware retrieval

(function () {
    'use strict';

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

    class SegmentEngine {
        constructor() {
            this.segments = [];
            this.segmentIndex = new Map(); // conversationId -> segments[]
        }

        /**
         * Extract segments from a conversation
         * @param {Object} conversation - Conversation object with messages
         * @returns {Array} Array of segment objects
         */
        extractSegments(conversation) {
            if (!conversation || !conversation.conversation || !Array.isArray(conversation.conversation)) {
                return [];
            }

            const messages = conversation.conversation;
            const segments = [];
            let currentSegment = null;
            let segmentIndex = 0;

            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];
                const prevMsg = i > 0 ? messages[i - 1] : null;
                const nextMsg = i < messages.length - 1 ? messages[i + 1] : null;

                // Detect topic shift or role change to start new segment
                const shouldStartNewSegment = this.detectSegmentBoundary(msg, prevMsg, currentSegment);

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
         * Detect if we should start a new segment
         */
        detectSegmentBoundary(msg, prevMsg, currentSegment) {
            if (!prevMsg || !currentSegment) return true;

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

            // Role change (user asking vs AI explaining for extended period)
            if (currentSegment.messages.length >= 5) {
                const recentRoles = currentSegment.messages.slice(-3).map(m => m.role);
                if (recentRoles.every(r => r === msg.role)) {
                    // Same role for 3+ messages, might be a new segment
                    return true;
                }
            }

            // Segment getting too long (max 8 turns for display)
            if (currentSegment.messages.length >= 8) {
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
    }

    // Export
    window.SegmentEngine = SegmentEngine;
    window.SEGMENT_ROLES = SEGMENT_ROLES;
    window.SEGMENT_TYPES = SEGMENT_TYPES;

})();
