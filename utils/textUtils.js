const TextUtils = (() => {
  const { LIMITS, REGEX } = window.ChatBridgeConstants || {};

  function normalize(text) {
    if (!text) return '';
    return text
      .replace(REGEX?.MULTIPLE_SPACES || /\s+/g, ' ')
      .replace(REGEX?.MULTIPLE_NEWLINES || /\n{3,}/g, '\n\n')
      .trim();
  }

  function removeFiller(text) {
    if (!text) return '';
    return text.replace(REGEX?.FILLER_PHRASES || /\b(actually|basically|essentially)\b/gi, '');
  }

  function removeMetaText(text) {
    if (!text) return '';
    return text.replace(REGEX?.META_TEXT || /^(As (an AI|a language model))/gm, '');
  }

  function deduplicate(text) {
    if (!text) return '';
    const lines = text.split('\n');
    const seen = new Set();
    return lines.filter(line => {
      const normalized = line.trim().toLowerCase();
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    }).join('\n');
  }

  function truncate(text, maxLength = 100, suffix = '...') {
    if (!text || text.length <= maxLength) return text;
    return text.slice(0, maxLength - suffix.length).trim() + suffix;
  }

  function generatePreview(text, maxLength = 120) {
    if (!text || text.length === 0) return '(empty)';
    
    const normalized = normalize(text);
    const firstSentence = normalized.match(/^[^.!?]{1,120}[.!?]?/);
    
    if (firstSentence && firstSentence[0]) {
      const preview = firstSentence[0].trim();
      return preview.length > maxLength ? truncate(preview, maxLength) : preview;
    }
    
    return truncate(normalized, maxLength);
  }

  function extractFirstSentence(text) {
    if (!text) return '';
    const match = text.match(/^[^.!?]+[.!?]/);
    return match ? match[0].trim() : text.split('\n')[0].trim();
  }

  function wordCount(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
  }

  function charCount(text) {
    return text ? text.length : 0;
  }

  function sanitize(text) {
    if (!text) return '';
    return text
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .trim();
  }

  function splitIntoChunks(text, chunkSize = 14000) {
    if (!text) return [];
    if (text.length <= chunkSize) return [text];
    
    const chunks = [];
    const paragraphs = text.split('\n\n');
    let currentChunk = '';
    
    for (const para of paragraphs) {
      if ((currentChunk + para).length > chunkSize && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = para;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + para;
      }
    }
    
    if (currentChunk) chunks.push(currentChunk.trim());
    return chunks;
  }

  function hashString(str) {
    if (!str) return '0';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(36);
  }

  function escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function unescapeHTML(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || '';
  }

  function countTokensApprox(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  return {
    normalize,
    removeFiller,
    removeMetaText,
    deduplicate,
    truncate,
    generatePreview,
    extractFirstSentence,
    wordCount,
    charCount,
    sanitize,
    splitIntoChunks,
    hashString,
    escapeHTML,
    unescapeHTML,
    countTokensApprox
  };
})();

if (typeof window !== 'undefined') {
  window.TextUtils = TextUtils;
}
