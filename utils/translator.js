/**
 * Translation Module for ChatBridge
 * Multi-stage translation pipeline with preprocessing, domain detection,
 * semantic shortening, formatting preservation, and typography normalization.
 */

console.log('[Translator] Starting module initialization...');

(() => {
  'use strict';

  console.log('[Translator] IIFE starting');

  const Logger = window.ChatBridgeLogger || console;
  const Constants = window.ChatBridgeConstants || {};
  const TextUtils = window.ChatBridgeTextUtils || {};

  // ========================================
  // CONSTANTS
  // ========================================

  const SUPPORTED_LANGUAGES = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'ar': 'Arabic',
    'hi': 'Hindi',
    'nl': 'Dutch',
    'pl': 'Polish',
    'tr': 'Turkish',
    'vi': 'Vietnamese',
    'th': 'Thai',
    'sv': 'Swedish',
    'da': 'Danish',
    'fi': 'Finnish',
    'no': 'Norwegian',
    'cs': 'Czech',
    'hu': 'Hungarian',
    'ro': 'Romanian',
    'el': 'Greek',
    'he': 'Hebrew',
    'id': 'Indonesian',
    'ms': 'Malay',
    'uk': 'Ukrainian',
    'bg': 'Bulgarian',
    'hr': 'Croatian',
    'sr': 'Serbian',
    'sk': 'Slovak',
    'sl': 'Slovenian',
    'lt': 'Lithuanian',
    'lv': 'Latvian',
    'et': 'Estonian',
    'ta': 'Tamil'
  };

  const TRANSLATION_MODES = {
    ALL: 'all',
    USER: 'user',
    AI: 'ai',
    LAST: 'last'
  };

  const DOMAINS = {
    TECHNICAL: 'technical',
    CONVERSATIONAL: 'conversational',
    ACADEMIC: 'academic',
    INSTRUCTIONAL: 'instructional',
    CODE_RELATED: 'code-related'
  };

  // Domain detection patterns
  const DOMAIN_PATTERNS = {
    technical: [
      /\b(API|SDK|CLI|GUI|UI|UX|HTTP|HTTPS|REST|GraphQL|JSON|XML|YAML|SQL|NoSQL)\b/i,
      /\b(database|server|client|backend|frontend|framework|library|package|module)\b/i,
      /\b(algorithm|optimization|performance|scalability|latency|throughput)\b/i,
      /\b(deployment|infrastructure|container|docker|kubernetes|cloud)\b/i,
      /\b(bug|debug|error|exception|stack trace|log|warning)\b/i
    ],
    academic: [
      /\b(hypothesis|methodology|research|study|analysis|conclusion|abstract)\b/i,
      /\b(peer.review|journal|publication|citation|reference|bibliography)\b/i,
      /\b(theorem|lemma|corollary|proof|axiom|proposition)\b/i,
      /\b(quantitative|qualitative|empirical|theoretical|statistical)\b/i,
      /\b(literature review|meta.analysis|systematic review)\b/i
    ],
    instructional: [
      /\b(step|tutorial|guide|how.to|instruction|procedure|process)\b/i,
      /\b(first|second|third|next|then|finally|lastly)\b/i,
      /\b(example|demo|walkthrough|setup|configuration|installation)\b/i,
      /\b(beginner|intermediate|advanced|prerequisite|requirement)\b/i,
      /numbered lists|bullet points|step.by.step/i
    ],
    codeRelated: [
      /```[\s\S]*?```/,
      /`[^`]+`/,
      /\b(function|class|const|let|var|import|export|return|if|else|for|while)\b/,
      /\b(def|print|return|import|from|class|self|lambda|async|await)\b/,
      /\.(js|ts|py|java|cpp|c|go|rs|rb|php|swift|kt)$/i
    ]
  };

  // Filler phrases to remove during cleanup
  const FILLER_PHRASES = [
    /\b(um|uh|like|you know|I mean|basically|actually|literally|honestly)\b/gi,
    /\b(kind of|sort of|more or less|or something|or whatever)\b/gi,
    /\b(I think that|I believe that|in my opinion)\s+/gi,
    /\b(just|really|very|quite|pretty|somewhat)\s+/gi
  ];

  // Typography rules per language
  const TYPOGRAPHY_RULES = {
    fr: {
      // French spacing before punctuation
      beforePunctuation: { '?': ' ?', '!': ' !', ':': ' :', ';': ' ;' },
      quotes: { open: '« ', close: ' »' }
    },
    es: {
      // Spanish inverted punctuation
      questionMarks: { pattern: /\?/g, replace: (match, text) => text.startsWith('¿') ? match : '¿' + text + '?' },
      exclamationMarks: { pattern: /!/g, replace: (match, text) => text.startsWith('¡') ? match : '¡' + text + '!' }
    },
    ja: {
      // Japanese full-width punctuation
      punctuation: { '.': '。', ',': '、', '?': '?', '!': '!', ':': ':' },
      fullWidth: true
    },
    zh: {
      // Chinese full-width punctuation
      punctuation: { '.': '。', ',': ',', '?': '?', '!': '!', ':': ':' },
      fullWidth: true
    },
    ko: {
      // Korean punctuation
      punctuation: { '.': '.', ',': ',', '?': '?', '!': '!' },
      spacing: 'standard'
    },
    ar: {
      // Arabic punctuation
      punctuation: { ',': '،', ';': '؛', '?': '؟' },
      direction: 'rtl'
    }
  };

  // Code fence markers to preserve
  const CODE_FENCE_REGEX = /```[\s\S]*?```|`[^`\n]+`/g;
  const MARKDOWN_ELEMENTS = [
    /^#{1,6}\s+.+$/gm,           // Headers
    /^\s*[-*+]\s+.+$/gm,         // Unordered lists
    /^\s*\d+\.\s+.+$/gm,         // Ordered lists
    /\*\*[^*]+\*\*/g,            // Bold
    /\*[^*]+\*/g,                // Italic
    /\[([^\]]+)\]\(([^)]+)\)/g,  // Links
    /!\[([^\]]*)\]\(([^)]+)\)/g, // Images
    /^\|.+\|$/gm                 // Tables
  ];

  // ========================================
  // PREPROCESSING AND CLEANING
  // ========================================

  /**
   * Extract and preserve code blocks and inline code
   * @param {string} text - Text to process
   * @returns {{cleaned: string, placeholders: Map<string, string>}}
   */
  function extractCodeBlocks(text) {
    const placeholders = new Map();
    let index = 0;

    const cleaned = text.replace(CODE_FENCE_REGEX, (match) => {
      const placeholder = `__CODE_BLOCK_${index}__`;
      placeholders.set(placeholder, match);
      index++;
      return placeholder;
    });

    return { cleaned, placeholders };
  }

  /**
   * Restore code blocks from placeholders
   * @param {string} text - Text with placeholders
   * @param {Map<string, string>} placeholders - Map of placeholders to original code
   * @returns {string}
   */
  function restoreCodeBlocks(text, placeholders) {
    let restored = text;
    placeholders.forEach((original, placeholder) => {
      restored = restored.replace(placeholder, original);
    });
    return restored;
  }

  /**
   * Fix broken sentence boundaries
   * @param {string} text - Text to fix
   * @returns {string}
   */
  function fixSentenceBoundaries(text) {
    return text
      // Fix missing space after period
      .replace(/\.([A-Z])/g, '. $1')
      // Fix missing space after comma
      .replace(/,([^\s\d])/g, ', $1')
      // Fix multiple periods
      .replace(/\.{2,}/g, '.')
      // Fix space before period
      .replace(/\s+\./g, '.')
      // Ensure newline after sentence-ending punctuation before capital letter
      .replace(/([.!?])\s+([A-Z])/g, '$1\n$2');
  }

  /**
   * Remove filler phrases
   * @param {string} text - Text to clean
   * @returns {string}
   */
  function removeFiller(text) {
    let cleaned = text;
    FILLER_PHRASES.forEach(pattern => {
      cleaned = cleaned.replace(pattern, ' ');
    });
    return cleaned;
  }

  /**
   * Normalize spacing
   * @param {string} text - Text to normalize
   * @returns {string}
   */
  function normalizeSpacing(text) {
    return text
      // Remove multiple spaces
      .replace(/  +/g, ' ')
      // Remove spaces at line start/end
      .replace(/^[ \t]+|[ \t]+$/gm, '')
      // Normalize line breaks (max 2 consecutive)
      .replace(/\n{3,}/g, '\n\n')
      // Trim
      .trim();
  }

  /**
   * Clean text with preprocessing pipeline
   * @param {string} text - Raw text
   * @returns {string}
   */
  function cleanText(text) {
    if (!text || typeof text !== 'string') return '';

    // Extract code blocks first
    const { cleaned, placeholders } = extractCodeBlocks(text);

    // Apply cleaning steps
    let processed = cleaned;
    processed = fixSentenceBoundaries(processed);
    processed = removeFiller(processed);
    processed = normalizeSpacing(processed);

    // Restore code blocks
    processed = restoreCodeBlocks(processed, placeholders);

    return processed;
  }

  // ========================================
  // DOMAIN DETECTION
  // ========================================

  /**
   * Calculate domain score based on pattern matches
   * @param {string} text - Text to analyze
   * @param {RegExp[]} patterns - Domain patterns
   * @returns {number}
   */
  function calculateDomainScore(text, patterns) {
    let score = 0;
    patterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        score += matches.length;
      }
    });
    return score;
  }

  /**
   * Detect content domain automatically
   * @param {string} text - Text to analyze
   * @returns {string} - Domain type
   */
  function detectDomain(text) {
    if (!text) return DOMAINS.CONVERSATIONAL;

    const scores = {
      [DOMAINS.CODE_RELATED]: calculateDomainScore(text, DOMAIN_PATTERNS.codeRelated),
      [DOMAINS.TECHNICAL]: calculateDomainScore(text, DOMAIN_PATTERNS.technical),
      [DOMAINS.ACADEMIC]: calculateDomainScore(text, DOMAIN_PATTERNS.academic),
      [DOMAINS.INSTRUCTIONAL]: calculateDomainScore(text, DOMAIN_PATTERNS.instructional)
    };

    // Find domain with highest score
    const maxDomain = Object.entries(scores).reduce((max, [domain, score]) => {
      return score > max.score ? { domain, score } : max;
    }, { domain: DOMAINS.CONVERSATIONAL, score: 0 });

    // Require minimum threshold
    return maxDomain.score >= 2 ? maxDomain.domain : DOMAINS.CONVERSATIONAL;
  }

  // ========================================
  // SEMANTIC SHORTENING
  // ========================================

  /**
   * Summarize text for translation (when shorten=true)
   * Internal use only - returns summary that will be translated
   * @param {string} text - Text to summarize
   * @param {string} domain - Detected domain
   * @returns {Promise<string>}
   */
  async function summarizeForTranslation(text, domain) {
    if (!text) return '';

    try {
      // Use background script to call Gemini with the correct message format
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'call_gemini',
          payload: {
            action: 'summarize',
            text: text,
            length: 'short',
            summaryType: 'paragraph'
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });

      if (response && response.ok && response.result) {
        Logger.debug('[Translator] Summarized for translation', {
          original: text.length,
          summary: response.result.length
        });
        return response.result;
      }
    } catch (error) {
      Logger.error('[Translator] Summarization failed', error);
    }

    // Fallback: extract first few sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    return sentences.slice(0, 3).join(' ').trim();
  }

  // ========================================
  // TRANSLATION ENGINE
  // ========================================

  /**
   * Build translation prompt with domain-aware instructions
   * @param {string} text - Text to translate
   * @param {string} targetLanguage - Target language code
   * @param {string} domain - Content domain
   * @returns {string}
   */
  function buildTranslationPrompt(text, targetLanguage, domain) {
    const languageName = SUPPORTED_LANGUAGES[targetLanguage] || targetLanguage;
    return `Translate to ${languageName}. Output ONLY the translation.\n\n${text}`;
  }

  /**
   * Translate text with meaning-first approach
   * @param {string} text - Cleaned text to translate
   * @param {string} targetLanguage - Target language code
   * @param {string} domain - Detected domain
   * @returns {Promise<string>}
   */
  async function translateText(text, targetLanguage, domain) {
    if (!text) return '';

    // Extract and preserve code blocks
    const { cleaned, placeholders } = extractCodeBlocks(text);

    const languageName = SUPPORTED_LANGUAGES[targetLanguage] || targetLanguage;
    // Try Llama first (faster for short texts)
    if (cleaned && cleaned.length < 8000) {
      try {
        const llamaResponse = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            type: 'call_llama',
            payload: {
              action: 'translate',
              text: cleaned,
              targetLang: languageName
            }
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });

        if (llamaResponse && llamaResponse.ok && llamaResponse.result) {
          Logger.debug('[Translator] Translation complete via Llama', {
            targetLanguage,
            domain,
            length: llamaResponse.result.length
          });
          const restored = restoreCodeBlocks(llamaResponse.result, placeholders);
          return restored;
        }
      } catch (llamaError) {
        Logger.warn('[Translator] Llama failed, falling back to Gemini', llamaError);
      }
    }

    // Fallback to Gemini
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'call_gemini',
          payload: {
            action: 'translate',
            text: cleaned,
            targetLang: languageName
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });

      if (response && response.ok && response.result) {
        Logger.debug('[Translator] Translation complete via Gemini', {
          targetLanguage,
          domain,
          length: response.result.length
        });

        // Restore code blocks
        const restored = restoreCodeBlocks(response.result, placeholders);
        return restored;
      } else {
        throw new Error(response?.error || response?.message || 'Translation failed - no valid response');
      }
    } catch (error) {
      Logger.error('[Translator] Translation failed', error);
      throw error;
    }
  }

  // ========================================
  // TYPOGRAPHY NORMALIZATION
  // ========================================

  /**
   * Apply language-specific typography rules
   * @param {string} text - Translated text
   * @param {string} targetLanguage - Target language code
   * @returns {string}
   */
  function applyTypographyRules(text, targetLanguage) {
    if (!text || !TYPOGRAPHY_RULES[targetLanguage]) return text;

    const rules = TYPOGRAPHY_RULES[targetLanguage];
    let formatted = text;

    // Extract and preserve code blocks
    const { cleaned, placeholders } = extractCodeBlocks(text);
    formatted = cleaned;

    // Apply language-specific rules
    if (rules.beforePunctuation) {
      Object.entries(rules.beforePunctuation).forEach(([punct, replacement]) => {
        // Add space before punctuation (French style)
        const regex = new RegExp(`\\s*${punct.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
        formatted = formatted.replace(regex, replacement);
      });
    }

    if (rules.punctuation) {
      Object.entries(rules.punctuation).forEach(([from, to]) => {
        // Replace punctuation marks (outside code blocks)
        formatted = formatted.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), to);
      });
    }

    if (rules.quotes) {
      // Replace quotes with language-specific style
      formatted = formatted.replace(/"([^"]+)"/g, `${rules.quotes.open}$1${rules.quotes.close}`);
    }

    // Restore code blocks
    formatted = restoreCodeBlocks(formatted, placeholders);

    return formatted;
  }

  // ========================================
  // MAIN TRANSLATION PIPELINE
  // ========================================

  /**
   * Translate content with full pipeline
   * @param {Object} options - Translation options
   * @param {string} options.targetLanguage - Target language code
   * @param {string} options.mode - Translation mode (all/user/ai)
   * @param {boolean} options.shorten - Whether to summarize before translating
   * @param {Array|string} options.content - Content to translate
   * @returns {Promise<Object>} - Translation result
   */
  async function translateContent({ targetLanguage, mode = 'all', shorten = false, content }) {
    Logger.debug('[Translator] Starting translation', { targetLanguage, mode, shorten });

    // Validate inputs
    if (!targetLanguage || !SUPPORTED_LANGUAGES[targetLanguage]) {
      throw new Error(`Unsupported target language: ${targetLanguage}`);
    }

    if (!TRANSLATION_MODES[mode.toUpperCase()]) {
      throw new Error(`Invalid translation mode: ${mode}`);
    }

    if (!content) {
      throw new Error('No content provided for translation');
    }

    const isArray = Array.isArray(content);
    let messages = isArray ? content : [{ role: 'user', text: content }];

    // Validate message structure
    if (!messages.every(m => m.role && m.text)) {
      throw new Error('Invalid message structure - each message must have role and text');
    }

    // Filter messages based on mode BEFORE processing
    let filteredMessages = [];
    if (mode === TRANSLATION_MODES.LAST) {
      // Only last message
      filteredMessages = messages.length > 0 ? [messages[messages.length - 1]] : [];
    } else if (mode === TRANSLATION_MODES.USER) {
      // Only user messages
      filteredMessages = messages.filter(m => m.role === 'user');
    } else if (mode === TRANSLATION_MODES.AI) {
      // Only AI messages
      filteredMessages = messages.filter(m => m.role === 'assistant');
    } else {
      // All messages
      filteredMessages = messages;
    }

    if (filteredMessages.length === 0) {
      Logger.warn('[Translator] No messages match the selected mode:', mode);
      return {
        translated: isArray ? [] : '',
        meta: { domain: 'conversational', shortened: shorten, targetLanguage, mode }
      };
    }

    // Detect domain from filtered content only
    const allText = filteredMessages.map(m => m.text).join('\n');
    const domain = detectDomain(allText);
    Logger.debug('[Translator] Detected domain:', domain);

    // Process each filtered message
    const translated = [];

    for (const message of filteredMessages) {
      try {
        // Step 1: Clean text
        let processedText = cleanText(message.text);

        // Step 2: Optional summarization (internal only, not shown to user)
        if (shorten) {
          processedText = await summarizeForTranslation(processedText, domain);
        }

        // Step 3: Translate the processed text (summary or original)
        let translatedText = await translateText(processedText, targetLanguage, domain);

        // Step 4: Apply typography rules
        translatedText = applyTypographyRules(translatedText, targetLanguage);

        translated.push({
          role: message.role,
          text: translatedText
        });

      } catch (error) {
        Logger.error('[Translator] Failed to translate message', error);
        // On error, keep original message
        translated.push({ ...message });
      }
    }

    // Return result
    const result = {
      translated: isArray ? translated : translated[0].text,
      meta: {
        domain: domain,
        shortened: shorten,
        targetLanguage: targetLanguage,
        mode: mode
      }
    };

    Logger.debug('[Translator] Translation complete', result.meta);
    return result;
  }

  // ========================================
  // PUBLIC API
  // ========================================

  const Translator = {
    translateContent,
    cleanText,
    detectDomain,
    getSupportedLanguages: () => ({ ...SUPPORTED_LANGUAGES }),
    getModes: () => ({ ...TRANSLATION_MODES }),
    getDomains: () => ({ ...DOMAINS })
  };

  // Export to global scope
  console.log('[Translator] About to export module...');
  window.ChatBridgeTranslator = Translator;
  window.ChatBridgeTranslatorReady = true;
  console.log('[Translator] Module exported:', typeof window.ChatBridgeTranslator, window.ChatBridgeTranslatorReady);
  if (typeof window.ChatBridgeLogger !== 'undefined') {
    window.ChatBridgeLogger.info('[Translator] Module initialized and exported');
  } else {
    console.log('[Translator] Module initialized and exported');
  }
})();
console.log('[Translator] IIFE completed, window.ChatBridgeTranslator =', typeof window.ChatBridgeTranslator);
