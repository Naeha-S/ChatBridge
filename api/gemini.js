// api/gemini.js - Vercel Serverless Function
// Securely proxies Gemini API calls without exposing your API key

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple auth: check extension secret header
  const extSecret = req.headers['x-ext-secret'];
  if (!extSecret || extSecret !== process.env.EXT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body || {};
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
        'Content-Type': 'application/json'
      },
      body: requestBody ? JSON.stringify(requestBody) : undefined
    });

    // Get response text
    const responseText = await geminiResponse.text();

    // Try to parse as JSON, return raw text if not JSON
    try {
      const json = JSON.parse(responseText);
      return res.status(geminiResponse.status).json(json);
    } catch {
      return res.status(geminiResponse.status).send(responseText);
    }

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ 
      error: 'Proxy error', 
      message: err.message 
    });
  }
}
