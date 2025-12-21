(function(){
  if (window.ChatBridgeRewriter) return;

  function protectCodeBlocks(text){
    const blocks = [];
    const placeholder = (i)=>`__CB_PROTECT_${i}__`;
    let out = text;
    // Fenced code blocks ```...```
    out = out.replace(/```[\s\S]*?```/g, (m)=>{ blocks.push(m); return placeholder(blocks.length-1); });
    // Display math $$...$$ (multiline)
    out = out.replace(/\$\$[\s\S]*?\$\$/g, (m)=>{ blocks.push(m); return placeholder(blocks.length-1); });
    // Inline code `...`
    out = out.replace(/`[^`\n]+`/g, (m)=>{ blocks.push(m); return placeholder(blocks.length-1); });
    // Inline math $...$ (not $$)
    out = out.replace(/(?<!\$)\$([^$\n]+)\$(?!\$)/g, (m)=>{ blocks.push(m); return placeholder(blocks.length-1); });
    return { text: out, restore:(t)=>t.replace(/__CB_PROTECT_(\d+)__/g, (_,i)=>blocks[Number(i)]||'') };
  }

  function cleanText(input){
    if (!input) return '';
    let text = String(input);
    // normalize whitespace
    text = text.replace(/[\t\f\v\u00A0\u200B\u200C\u200D]+/g,' ');
    text = text.replace(/ {2,}/g,' ');
    text = text.replace(/\n{3,}/g,'\n\n');
    // remove common filler phrases repeated
    const fillers = [
      /(?:(?:As an AI|I am an AI|As a language model)[^.]*\.)/gi,
      /(?:Hope this helps!|Let me know if you need anything else\.?)/gi,
      /(?:Sure, here(?:'|’)s a|Great question!|Absolutely!)/gi
    ];
    fillers.forEach(r=>{ text = text.replace(new RegExp(`(${r.source}){2,}`,'gi'),'$1'); });
    return text.trim();
  }

  async function callBG(payload){
    return await new Promise((resolve)=>{
      try { chrome.runtime.sendMessage(payload, resolve); } catch(e){ resolve({ ok:false, error: e.message||String(e) }); }
    });
  }

  async function rewriteWithStyle(text, style, styleHint){
    const { text: safe, restore } = protectCodeBlocks(cleanText(text));
    const res = await callBG({ type:'rewrite_text', text: safe, style, styleHint });
    if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'rewrite failed');
    return restore(res.result||'');
  }

  async function extractMeaningFromChat(fullChat){
    const res = await callBG({ type:'extract_meaning', content: fullChat });
    if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'extract meaning failed');
    return res.result;
  }

  async function structureDocument(meaningDraft){
    const res = await callBG({ type:'structure_document', draft: meaningDraft });
    if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'structure failed');
    return res.result;
  }

  async function applyStyleToDocument(structuredDoc, style, styleHint){
    const res = await callBG({ type:'apply_style_document', doc: structuredDoc, style, styleHint });
    if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'apply style failed');
    return res.result;
  }

  async function rewriteSelected(messages, style, styleHint){
    if (!Array.isArray(messages) || messages.length===0) throw new Error('no messages');
    const out = [];
    for (const msg of messages){
      const txt = (msg && msg.text) ? msg.text : String(msg||'');
      const rewritten = await rewriteWithStyle(txt, style, styleHint);
      out.push({ ...msg, text: rewritten });
    }
    return out;
  }

  async function chatToDocument(conversation, style, styleHint){
    // Allow background to handle full pipeline for efficiency if available
    const res = await callBG({ type:'chat_to_document', content: conversation, style, styleHint });
    if (res && res.ok && res.result) return res.result;
    // Fallback: do three-step locally via BG calls
    const meaning = await extractMeaningFromChat(conversation);
    const structured = await structureDocument(meaning);
    return await applyStyleToDocument(structured, style, styleHint);
  }

  // Structured outputs per spec
  async function rewriteSelectedMessages(messages, style, styleHint){
    const usedCustomHint = style === 'customStyle' && !!styleHint;
    const resultArr = await rewriteSelected(messages, style, styleHint);
    const charCount = resultArr.reduce((n,m)=>n + (m.text?m.text.length:0), 0);
    return {
      type: 'selected',
      style,
      result: resultArr.map(m=>({ role: m.role || 'assistant', text: m.text })),
      meta: { usedCustomHint, selectedCount: resultArr.length, sections: 0, charCount }
    };
  }

  async function chatToDocumentStructured(conversation, style, styleHint){
    const usedCustomHint = style === 'customStyle' && !!styleHint;
    const text = await chatToDocument(conversation, style, styleHint);
    const sections = String(text||'').split(/\n/).filter(l=>/^#+\s/.test(l)).length;
    return {
      type: 'chatDocument',
      style,
      result: text,
      meta: { usedCustomHint, selectedCount: 0, sections, charCount: (text||'').length }
    };
  }

  window.ChatBridgeRewriter = {
    cleanText,
    rewriteWithStyle,
    extractMeaningFromChat,
    structureDocument,
    applyStyleToDocument,
    rewriteSelected,
    chatToDocument,
    rewriteSelectedMessages,
    chatToDocumentStructured
  };
})();
