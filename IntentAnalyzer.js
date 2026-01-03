// IntentAnalyzer.js - Query Intent Classification and Alignment Scoring
// Parses natural language queries to understand user intent for memory retrieval

(function () {
    'use strict';

    // Query intent types
    const INTENT_TYPES = {
        FIND_DECISION: 'find_decision',
        FIND_CONFUSION: 'find_confusion',
        FIND_EVOLUTION: 'find_evolution',
        FIND_CONTRADICTION: 'find_contradiction',
        FIND_BREAKTHROUGH: 'find_breakthrough',
        FIND_PATTERN: 'find_pattern',
        FIND_SPECIFIC: 'find_specific',
        SUMMARIZE: 'summarize',
        COMPARE: 'compare',
        MIDDLE_ONLY: 'middle_only',
        IGNORE_CONCLUSIONS: 'ignore_conclusions'
    };

    // Query modifiers
    const QUERY_MODIFIERS = {
        RECENT: 'recent',
        OLDEST: 'oldest',
        MOST_CONFIDENT: 'most_confident',
        LEAST_CONFIDENT: 'least_confident',
        CHANGED: 'changed',
        REPEATED: 'repeated'
    };

    class IntentAnalyzer {
        constructor() {
            this.intentPatterns = this.buildIntentPatterns();
            this.modifierPatterns = this.buildModifierPatterns();
        }

        /**
         * Build regex patterns for intent detection
         */
        buildIntentPatterns() {
            return [
                {
                    intent: INTENT_TYPES.FIND_DECISION,
                    patterns: [
                        /what did i decide/i,
                        /when did i choose/i,
                        /my decision about/i,
                        /final choice/i,
                        /went with/i,
                        /concluded that/i,
                        /settled on/i
                    ],
                    keywords: ['decided', 'chose', 'picked', 'selected', 'went with', 'final']
                },
                {
                    intent: INTENT_TYPES.FIND_CONFUSION,
                    patterns: [
                        /what was i confused about/i,
                        /where was i stuck/i,
                        /didn't understand/i,
                        /struggled with/i,
                        /unclear about/i,
                        /lost on/i
                    ],
                    keywords: ['confused', 'stuck', 'unclear', 'lost', 'struggling', 'didn\'t get']
                },
                {
                    intent: INTENT_TYPES.FIND_EVOLUTION,
                    patterns: [
                        /how did my (opinion|view|thinking) (change|evolve)/i,
                        /changed my mind/i,
                        /evolution of/i,
                        /shifted from/i,
                        /over time/i,
                        /progression of/i
                    ],
                    keywords: ['evolved', 'changed', 'shifted', 'progression', 'over time']
                },
                {
                    intent: INTENT_TYPES.FIND_CONTRADICTION,
                    patterns: [
                        /where did i contradict/i,
                        /inconsisten(t|cy)/i,
                        /said different things/i,
                        /conflicting/i,
                        /opposite of/i
                    ],
                    keywords: ['contradict', 'inconsistent', 'conflicting', 'opposite']
                },
                {
                    intent: INTENT_TYPES.FIND_BREAKTHROUGH,
                    patterns: [
                        /when did i finally/i,
                        /aha moment/i,
                        /breakthrough/i,
                        /finally understood/i,
                        /got it/i,
                        /clicked/i
                    ],
                    keywords: ['finally', 'breakthrough', 'understood', 'realized', 'clicked']
                },
                {
                    intent: INTENT_TYPES.FIND_PATTERN,
                    patterns: [
                        /keep asking/i,
                        /repeated(ly)?/i,
                        /pattern of/i,
                        /always do/i,
                        /tend to/i
                    ],
                    keywords: ['repeatedly', 'pattern', 'always', 'tend to', 'keep']
                },
                {
                    intent: INTENT_TYPES.MIDDLE_ONLY,
                    patterns: [
                        /only the (part|middle|section) where/i,
                        /middle of/i,
                        /not the beginning/i,
                        /skip the intro/i,
                        /somewhere in the middle/i
                    ],
                    keywords: ['middle', 'part where', 'section where']
                },
                {
                    intent: INTENT_TYPES.IGNORE_CONCLUSIONS,
                    patterns: [
                        /ignore (the )?conclusion/i,
                        /before i decided/i,
                        /not the final/i,
                        /exclude ending/i,
                        /without the result/i
                    ],
                    keywords: ['ignore conclusion', 'before decided', 'not final']
                },
                {
                    intent: INTENT_TYPES.SUMMARIZE,
                    patterns: [
                        /summarize/i,
                        /give me a summary/i,
                        /tldr/i,
                        /key points/i,
                        /main takeaways/i
                    ],
                    keywords: ['summarize', 'summary', 'tldr', 'key points', 'takeaways']
                },
                {
                    intent: INTENT_TYPES.COMPARE,
                    patterns: [
                        /compare/i,
                        /difference between/i,
                        /versus|vs/i,
                        /how does .+ differ/i
                    ],
                    keywords: ['compare', 'difference', 'versus', 'differ']
                }
            ];
        }

        /**
         * Build modifier patterns
         */
        buildModifierPatterns() {
            return [
                { modifier: QUERY_MODIFIERS.RECENT, patterns: [/recent(ly)?/i, /last few/i, /latest/i] },
                { modifier: QUERY_MODIFIERS.OLDEST, patterns: [/oldest/i, /first time/i, /earliest/i, /beginning/i] },
                { modifier: QUERY_MODIFIERS.MOST_CONFIDENT, patterns: [/most confident/i, /sure about/i, /certain/i] },
                { modifier: QUERY_MODIFIERS.LEAST_CONFIDENT, patterns: [/least confident/i, /unsure/i, /uncertain/i] },
                { modifier: QUERY_MODIFIERS.CHANGED, patterns: [/changed/i, /different now/i, /used to/i] },
                { modifier: QUERY_MODIFIERS.REPEATED, patterns: [/repeated/i, /multiple times/i, /again and again/i] }
            ];
        }

        /**
         * Analyze a natural language query
         * @param {string} query - The user's search query
         * @returns {Object} Analyzed intent with metadata
         */
        analyzeQuery(query) {
            if (!query || typeof query !== 'string') {
                return { intent: INTENT_TYPES.FIND_SPECIFIC, modifiers: [], keywords: [], raw: '' };
            }

            const queryLower = query.toLowerCase().trim();

            // Detect primary intent
            const intentResult = this.detectIntent(queryLower);

            // Detect modifiers
            const modifiers = this.detectModifiers(queryLower);

            // Extract search keywords (after removing intent phrases)
            const keywords = this.extractSearchKeywords(queryLower, intentResult.matchedPatterns);

            // Detect topic focus
            const topicFocus = this.detectTopicFocus(queryLower);

            return {
                intent: intentResult.intent,
                confidence: intentResult.confidence,
                modifiers: modifiers,
                keywords: keywords,
                topicFocus: topicFocus,
                raw: query,
                analyzed: true
            };
        }

        /**
         * Detect the primary intent from query
         */
        detectIntent(query) {
            let bestMatch = {
                intent: INTENT_TYPES.FIND_SPECIFIC,
                confidence: 0.3,
                matchedPatterns: []
            };

            for (const intentDef of this.intentPatterns) {
                let matchScore = 0;
                const matchedPatterns = [];

                // Check regex patterns
                for (const pattern of intentDef.patterns) {
                    if (pattern.test(query)) {
                        matchScore += 0.4;
                        matchedPatterns.push(pattern.toString());
                    }
                }

                // Check keywords
                for (const keyword of intentDef.keywords) {
                    if (query.includes(keyword)) {
                        matchScore += 0.15;
                    }
                }

                if (matchScore > bestMatch.confidence) {
                    bestMatch = {
                        intent: intentDef.intent,
                        confidence: Math.min(1, matchScore),
                        matchedPatterns: matchedPatterns
                    };
                }
            }

            return bestMatch;
        }

        /**
         * Detect query modifiers
         */
        detectModifiers(query) {
            const modifiers = [];

            for (const modDef of this.modifierPatterns) {
                for (const pattern of modDef.patterns) {
                    if (pattern.test(query)) {
                        modifiers.push(modDef.modifier);
                        break;
                    }
                }
            }

            return modifiers;
        }

        /**
         * Extract search keywords after removing intent phrases
         */
        extractSearchKeywords(query, matchedPatterns) {
            let cleanedQuery = query;

            // Remove matched intent patterns
            for (const patternStr of matchedPatterns) {
                try {
                    const pattern = new RegExp(patternStr.slice(1, -1), 'gi');
                    cleanedQuery = cleanedQuery.replace(pattern, '');
                } catch (e) { /* ignore invalid regex */ }
            }

            // Remove common question words
            const removeWords = ['what', 'where', 'when', 'how', 'why', 'did', 'was', 'were', 'is', 'are', 'about', 'the', 'my', 'i'];
            const words = cleanedQuery.split(/\s+/).filter(w => {
                const lower = w.toLowerCase().replace(/[^a-z]/g, '');
                return lower.length > 2 && !removeWords.includes(lower);
            });

            return words.map(w => w.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()).filter(w => w.length > 0);
        }

        /**
         * Detect if query focuses on a specific topic
         */
        detectTopicFocus(query) {
            // Look for "about X" or "regarding X" patterns
            const aboutMatch = query.match(/(?:about|regarding|on|for)\s+(.+?)(?:\s+when|\s+where|\s+how|\?|$)/i);
            if (aboutMatch && aboutMatch[1]) {
                return aboutMatch[1].trim();
            }

            // Look for quoted phrases
            const quotedMatch = query.match(/"([^"]+)"|'([^']+)'/);
            if (quotedMatch) {
                return quotedMatch[1] || quotedMatch[2];
            }

            return null;
        }

        /**
         * Calculate alignment score between query intent and segment
         * @param {Object} queryAnalysis - Analyzed query
         * @param {Object} segment - Segment to score
         * @returns {number} Score between 0 and 1
         */
        calculateAlignmentScore(queryAnalysis, segment) {
            let score = 0;

            // Intent alignment
            const intentScores = {
                [INTENT_TYPES.FIND_DECISION]: segment.role === 'decision' ? 0.5 : 0,
                [INTENT_TYPES.FIND_CONFUSION]: segment.role === 'confusion' || segment.type === 'confusion_loop' ? 0.5 : 0,
                [INTENT_TYPES.FIND_EVOLUTION]: segment.type === 'idea_evolution' ? 0.5 : 0,
                [INTENT_TYPES.FIND_CONTRADICTION]: segment.type === 'contradiction' ? 0.5 : 0,
                [INTENT_TYPES.FIND_BREAKTHROUGH]: segment.role === 'breakthrough' || segment.type === 'breakthrough_moment' ? 0.5 : 0,
                [INTENT_TYPES.FIND_PATTERN]: segment.type === 'repeated_pattern' ? 0.5 : 0
            };

            score += intentScores[queryAnalysis.intent] || 0;

            // Keyword matching
            const segmentText = segment.messages.map(m => m.text).join(' ').toLowerCase();
            const segmentKeywords = segment.keywords || [];

            for (const keyword of queryAnalysis.keywords) {
                if (segmentText.includes(keyword)) score += 0.15;
                if (segmentKeywords.includes(keyword)) score += 0.1;
            }

            // Topic focus matching
            if (queryAnalysis.topicFocus) {
                const topicLower = queryAnalysis.topicFocus.toLowerCase();
                if (segmentText.includes(topicLower)) score += 0.2;
                if (segment.topic && segment.topic.toLowerCase().includes(topicLower)) score += 0.2;
            }

            // Modifier adjustments
            if (queryAnalysis.modifiers.includes(QUERY_MODIFIERS.MOST_CONFIDENT)) {
                score += segment.certaintyLevel * 0.2;
            }
            if (queryAnalysis.modifiers.includes(QUERY_MODIFIERS.LEAST_CONFIDENT)) {
                score += (1 - segment.certaintyLevel) * 0.2;
            }

            return Math.min(1, score);
        }

        /**
         * Generate a human-readable label for the query intent
         */
        getIntentLabel(intent) {
            const labels = {
                [INTENT_TYPES.FIND_DECISION]: 'Finding decisions you made',
                [INTENT_TYPES.FIND_CONFUSION]: 'Finding moments of confusion',
                [INTENT_TYPES.FIND_EVOLUTION]: 'Tracing how your thinking evolved',
                [INTENT_TYPES.FIND_CONTRADICTION]: 'Detecting contradictions',
                [INTENT_TYPES.FIND_BREAKTHROUGH]: 'Finding breakthrough moments',
                [INTENT_TYPES.FIND_PATTERN]: 'Identifying repeated patterns',
                [INTENT_TYPES.FIND_SPECIFIC]: 'Searching for specific content',
                [INTENT_TYPES.SUMMARIZE]: 'Creating a summary',
                [INTENT_TYPES.COMPARE]: 'Comparing information',
                [INTENT_TYPES.MIDDLE_ONLY]: 'Looking at the middle of discussions',
                [INTENT_TYPES.IGNORE_CONCLUSIONS]: 'Excluding final conclusions'
            };
            return labels[intent] || 'Searching for meaning';
        }
    }

    // Export
    window.IntentAnalyzer = IntentAnalyzer;
    window.INTENT_TYPES = INTENT_TYPES;
    window.QUERY_MODIFIERS = QUERY_MODIFIERS;

})();
