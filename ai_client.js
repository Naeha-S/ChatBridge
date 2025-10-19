
/*
 * ai_client.js
 * Minimal AI client helpers for ChatBridge.
 * - Converts internal conversation format into OpenAI chat messages
 * - Provides `callOpenAI(apiKey, messages, opts)` to call the OpenAI Chat Completions API
 *
 * Notes:
 * - Do NOT embed API keys in source. Pass an API key at call time or call from background
 *   code that retrieves the key from chrome.storage (background scripts avoid CORS issues).
 * - This file intentionally provides a small, safe surface attached to window.AIClient.
 */

(function(){
	'use strict';

	const DEFAULT_MODEL = 'gpt-4o-mini';
	const DEFAULT_TIMEOUT_MS = 25_000;

	function normalizeConversation(conv) {
		if (!Array.isArray(conv)) return [];
		return conv.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', text: (m.text || '').replace(/\s+/g,' ').trim() })).filter(x => x.text);
	}

	function toOpenAIMessages(conv, systemPrompt) {
		const norm = normalizeConversation(conv);
		const out = [];
		if (systemPrompt) out.push({ role: 'system', content: String(systemPrompt) });
		for (const m of norm) out.push({ role: m.role, content: m.text });
		return out;
	}

	async function callOpenAI(apiKey, messages, opts = {}) {
		if (!apiKey) return { error: 'no_api_key' };
		const model = opts.model || DEFAULT_MODEL;
		const timeout = typeof opts.timeout === 'number' ? opts.timeout : DEFAULT_TIMEOUT_MS;

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		try {
			const body = JSON.stringify({ model, messages });
			const res = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': 'Bearer ' + apiKey
				},
				body,
				signal: controller.signal
			});
			clearTimeout(timeoutId);
			if (!res.ok) {
				const txt = await res.text().catch(()=>null);
				return { error: 'http_error', status: res.status, body: txt };
			}
			const data = await res.json();
			// try to extract assistant text safely
			const msg = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || null;
			return { ok: true, data, assistant: msg };
		} catch (e) {
			if (e && e.name === 'AbortError') return { error: 'timeout' };
			return { error: 'fetch_error', message: (e && e.message) || String(e) };
		} finally {
			clearTimeout(timeoutId);
		}
	}

	// Attach small API surface
	if (typeof window !== 'undefined') {
		window.AIClient = window.AIClient || {};
		window.AIClient.toOpenAIMessages = toOpenAIMessages;
		window.AIClient.normalizeConversation = normalizeConversation;
		window.AIClient.callOpenAI = callOpenAI;
	}

})();
