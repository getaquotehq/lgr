// ============================================================================
// preview-link - "see it with your name on it before you pay".
//
// A prospect in checkout has not bought anything yet, so they must NOT be
// written into the live matching data. If they were, a real homeowner in that
// postcode could be matched to a business that has no agreement with us, and
// that homeowner's consent line would name a company that is not a customer.
// That is the exact collision the named-consent model exists to prevent.
//
// So a preview is a RENDER MODE of the engine page, never a row anywhere:
//
//   POST /preview-link  { business_name }   -> { token, expires_at }
//   GET  /preview-link?token=...            -> { business_name, expires_at }
//
// The token is an HMAC-SHA256 signed blob. Nothing is persisted. The engine
// page swaps the consent name for the previewed business, shows a banner, and
// disables submission, so no lead can be produced while previewing.
//
// Secrets: PREVIEW_TOKEN_SECRET (optional - falls back to the service role key,
//          which never leaves the server and is only used here as an HMAC key).
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const TTL_SECONDS = 30 * 60          // a preview is for the checkout session, not a shareable asset
const MAX_NAME_LEN = 80

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function secret(): string {
  return Deno.env.get('PREVIEW_TOKEN_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
}

const b64url = {
  enc(bytes: Uint8Array) {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  },
  dec(s: string) {
    const p = s.replace(/-/g, '+').replace(/_/g, '/')
    const pad = p + '='.repeat((4 - (p.length % 4)) % 4)
    return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0))
  },
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return b64url.enc(new Uint8Array(mac))
}

// Constant-time compare so a wrong signature cannot be probed byte by byte.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Strip control characters and collapse whitespace. The engine renders this
// with textContent (never innerHTML), but a clean value keeps it clean if a
// future caller is less careful.
function cleanName(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LEN)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!secret()) return json({ error: 'preview signing key not configured' }, 500)

  try {
    // -- issue ---------------------------------------------------------------
    if (req.method === 'POST') {
      const { business_name } = await req.json().catch(() => ({}))
      const name = cleanName(business_name)
      if (!name) return json({ error: 'business_name is required' }, 400)

      const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS
      const body = b64url.enc(new TextEncoder().encode(JSON.stringify({ n: name, e: exp })))
      const token = `${body}.${await sign(body)}`
      return json({ token, expires_at: new Date(exp * 1000).toISOString() })
    }

    // -- resolve -------------------------------------------------------------
    if (req.method === 'GET') {
      const token = new URL(req.url).searchParams.get('token') || ''
      const [body, sig] = token.split('.')
      if (!body || !sig) return json({ error: 'invalid token' }, 400)

      if (!safeEqual(sig, await sign(body))) return json({ error: 'invalid token' }, 400)

      let claims: { n?: string; e?: number }
      try {
        claims = JSON.parse(new TextDecoder().decode(b64url.dec(body)))
      } catch {
        return json({ error: 'invalid token' }, 400)
      }

      if (!claims.e || claims.e < Math.floor(Date.now() / 1000)) {
        return json({ error: 'preview link has expired' }, 410)
      }
      const name = cleanName(claims.n)
      if (!name) return json({ error: 'invalid token' }, 400)

      return json({ business_name: name, expires_at: new Date(claims.e * 1000).toISOString() })
    }

    return json({ error: 'method_not_allowed' }, 405)
  } catch (err) {
    console.error('preview-link error:', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
