# ChatBridge Cloud Gateway

Cloudflare Worker that proxies LLM and embedding API calls so **provider keys never ship in the extension**.

## Architecture

```
Extension (background.js)
    → chatbridgeFetch() in core/cloudProxy.js
    → POST https://your-worker.workers.dev/v1/proxy
    → Worker injects server-side GEMINI_API_KEY / etc.
    → Upstream provider (Gemini, OpenAI, HuggingFace, NVIDIA)
```

The extension stores only:
- Gateway URL (`chatbridge_cloud_url`)
- Access token (`CHATBRIDGE_PROXY_SECRET`, encrypted at rest via `core/security.js`)

## Quick start

### 1. Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- Node.js 18+
- Wrangler CLI (installed via `npm install` below)

### 2. Install & configure

```bash
cd workers/chatbridge-gateway
npm install
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars`:

```env
CHATBRIDGE_PROXY_SECRET=your-long-random-secret
GEMINI_API_KEY=AIza...
```

Generate a strong secret:

```bash
openssl rand -base64 32
```

### 3. Local development

```bash
npm run dev
curl -H "Authorization: Bearer your-long-random-secret" http://127.0.0.1:8787/v1/health
```

### 4. Deploy to Cloudflare

```bash
npx wrangler secret put CHATBRIDGE_PROXY_SECRET
npx wrangler secret put GEMINI_API_KEY
npm run deploy
```

### 5. Connect the extension

1. Open **ChatBridge Options → API Keys → Cloud Gateway**
2. Enable **Use Cloud Gateway**
3. Paste your Worker URL (no trailing slash)
4. Paste `CHATBRIDGE_PROXY_SECRET` as the access token
5. Click **Test**, then **Save**

## API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/info` | No | Public service metadata |
| GET | `/v1/health` | Bearer | Provider key status + auth check |
| POST | `/v1/proxy` | Bearer | Forward request to upstream provider |

## Optional: rate limiting (KV)

```bash
npx wrangler kv namespace create RATE_LIMIT
```

Add the namespace ID to `wrangler.toml` under `[[kv_namespaces]]`, then redeploy.

## Vercel Edge (explored, not implemented)

Vercel Edge Functions could proxy similar requests. ChatBridge standardizes on Cloudflare Workers because Wrangler secrets, edge deployment, and the existing gateway code are already in place. Port `src/index.js` to a Vercel Edge Route Handler if you need a second host.

## Security checklist

- Use a long random `CHATBRIDGE_PROXY_SECRET` (32+ bytes)
- Never commit `.dev.vars` or provider keys
- Enable KV rate limiting for production
- Phase 6: replace shared secret with per-user OAuth/JWT
