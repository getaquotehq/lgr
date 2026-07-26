# LeadGenRentalsHQ - API Proxy (Cloudflare Worker)

Reverse-proxy that gives the REST API a clean, branded URL:

```
api.leadgenrentalshq.com/v1/leads   →   <supabase>/functions/v1/api/leads
api.leadgenrentalshq.com/v1/quotes  →   <supabase>/functions/v1/api/quotes
```

All authentication headers are passed through as-is. The Supabase URL is never exposed.

## Setup

### 1. Install dependencies

```bash
cd workers/api-proxy
npm install
```

### 2. Local development

```bash
npm run dev
# Worker runs at http://localhost:8787
# Try: curl http://localhost:8787/v1/leads -H "Authorization: Bearer qlhq_..."
```

### 3. Deploy to Cloudflare

```bash
# First time: authenticate with Cloudflare
npx wrangler login

# Deploy
npm run deploy
```

### 4. Set up custom domain

After deploying, go to **Cloudflare Dashboard → Workers & Pages → qlhq-api-proxy → Settings → Domains & Routes** and add:

```
api.leadgenrentalshq.com
```

Cloudflare will automatically provision the SSL certificate.

> **DNS requirement:** Your `leadgenrentalshq.com` domain must already be on Cloudflare DNS (orange-clouded). If it's on another DNS provider, use a Workers Route + CNAME instead.

### 5. Verify

```bash
curl https://api.leadgenrentalshq.com/health
# → {"status":"ok","service":"leadgenrentalshq-api"}

curl https://api.leadgenrentalshq.com/v1/leads \
  -H "Authorization: Bearer qlhq_your_token"
# → {"data":[...],"meta":{"page":1,...}}
```

## Configuration

The Supabase backend URL is set in `wrangler.toml`:

```toml
[vars]
SUPABASE_FUNCTION_URL = "https://wjadekgptkstfdootuol.supabase.co/functions/v1/api"
```

To change it (e.g., for a staging environment), update the value and re-deploy.

## How it works

| Incoming request | Proxied to |
|---|---|
| `GET /v1/leads?page=2` | `GET <SUPABASE_URL>/leads?page=2` |
| `POST /v1/leads` | `POST <SUPABASE_URL>/leads` |
| `GET /v1/quotes/:id` | `GET <SUPABASE_URL>/quotes/:id` |
| `GET /health` | Returns `200 OK` (not proxied) |
| `GET /anything-else` | Returns `404` with docs link |
