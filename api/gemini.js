// api/gemini.js - Vercel Serverless Function
// Securely proxies Gemini API calls without exposing your API key

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple auth: check extension secret header (support x-ext-secret or x-ext-key)
  const extSecretHeader = req.headers['x-ext-secret'] || req.headers['x-ext-key'];
  const serverSecret = process.env.EXT_SECRET || process.env.EXT_KEY;
  if (!extSecretHeader || !serverSecret || extSecretHeader !== serverSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Robust body parsing: handle string, object, or raw stream
  let body = req.body;
  try {
    if (!body) {
      // Collect raw body from stream if not parsed
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      const text = buffer.toString('utf8');
      body = text ? JSON.parse(text) : {};
    } else if (typeof body === 'string') {
      body = body ? JSON.parse(body) : {};
    } else if (typeof body !== 'object') {
      // Fallback: attempt JSON parse
      body = JSON.parse(String(body));
    }
  } catch (e) {
    return res.status(400).json({ error: 'invalid_request_body', message: e.message });
  }
  const endpoint = body.endpoint; // Which Gemini endpoint to call
  const requestBody = body.body;  // The actual request body for Gemini
  const method = body.method || 'POST';

  if (!endpoint) {
    return res.status(400).json({ error: 'endpoint required' });
  }

  try {
    // Build full Gemini URL with API key from secure env var
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.error('GEMINI_API_KEY not configured in environment');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const url = `${endpoint}?key=${geminiApiKey}`;

    // Forward request to Gemini API
    const geminiResponse = await fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: requestBody ? JSON.stringify(requestBody) : undefined
    });

    // Get response text
    const responseText = await geminiResponse.text();

    // Always return JSON to clients for predictable parsing
    let out;
    try {
      out = JSON.parse(responseText);
    } catch {
      out = { raw: responseText };
    }
    return res.status(geminiResponse.status).json(out);

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ 
      error: 'Proxy error', 
      message: err.message 
    });
  }
}
