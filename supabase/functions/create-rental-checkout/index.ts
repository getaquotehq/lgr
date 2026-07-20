// ============================================================================
// create-rental-checkout — public checkout for an LGR asset rental.
//
// Called from fleet.html when an installer clicks "Rent this asset". No auth:
// the installer isn't a Supabase user yet — they become one (well, an
// `installers` row) only once the Stripe payment completes, via stripe-webhook.
//
// LGR rentals are billed month-to-month in advance, so this creates a Stripe
// Checkout Session in `subscription` mode with an inline recurring monthly
// price. The price and floor are read from the DB — the client is never
// trusted with the amount.
//
// Request (JSON):
//   { asset_id, business_name, contact_name, email, phone }
// Response: { url }  → the browser redirects to Stripe.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   STRIPE_API_KEY            (required — the LGR Stripe secret key)
//   STRIPE_TAX_RATE_GST       (optional — a Stripe tax rate id for 10% GST)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (auto-injected)
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14'

const stripe = new Stripe(Deno.env.get('STRIPE_API_KEY')!, { apiVersion: '2024-04-10' })
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const SITE = 'https://leadgenrentals.com.au'
const GST_TAX_RATE = Deno.env.get('STRIPE_TAX_RATE_GST') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TIER_NAME: Record<string, string> = { starter: 'Starter', growth: 'Growth', scale: 'Scale' }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const { asset_id, business_name, contact_name, email, phone } = await req.json()

    if (!asset_id || !business_name || !email) {
      return json({ error: 'Missing required fields (asset_id, business_name, email)' }, 400)
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return json({ error: 'Enter a valid email address' }, 400)
    }

    // ── validate the asset + read price server-side (never trust the client) ──
    const { data: asset, error: assetErr } = await supabase
      .from('assets')
      .select('id, tier, brand_name, monthly_price_aud, floor_leads, status, deleted_at, niches(name), regions(name)')
      .eq('id', asset_id)
      .maybeSingle()

    if (assetErr) throw assetErr
    if (!asset || asset.deleted_at) return json({ error: 'That asset no longer exists.' }, 404)
    if (asset.status !== 'available') {
      return json({ error: 'That asset has just been taken. Please pick another.' }, 409)
    }

    const price = asset.monthly_price_aud
    const nicheName = (asset as any).niches?.name || 'Leads'
    const regionName = (asset as any).regions?.name || ''
    const tierName = TIER_NAME[asset.tier] || asset.tier
    const productName = `${asset.brand_name} — ${tierName} lead engine`
    const productDesc = `Exclusive ${nicheName} lead engine${regionName ? ' · ' + regionName : ''}. ` +
      `Guaranteed floor of ${asset.floor_leads} leads / 30 days, delivered to you alone. ` +
      `Flat monthly rental, cancel any time.`

    // ── reuse a Stripe customer for this email if we've seen it before ────────
    let customerId: string | undefined
    const existing = await stripe.customers.list({ email: String(email).trim(), limit: 1 })
    if (existing.data.length) customerId = existing.data[0].id

    const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = {
      price_data: {
        currency: 'aud',
        unit_amount: price * 100,
        recurring: { interval: 'month' },
        product_data: { name: productName, description: productDesc },
      },
      quantity: 1,
    }
    if (GST_TAX_RATE) lineItem.tax_rates = [GST_TAX_RATE]

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      ...(customerId ? { customer: customerId } : { customer_email: String(email).trim() }),
      line_items: [lineItem],
      metadata: {
        type: 'asset_rental',
        asset_id: String(asset_id),
        business_name: String(business_name).slice(0, 250),
        contact_name: String(contact_name || '').slice(0, 250),
        email: String(email).trim(),
        phone: String(phone || '').slice(0, 40),
        monthly_price_aud: String(price),
        floor_leads: String(asset.floor_leads),
      },
      subscription_data: {
        metadata: { type: 'asset_rental', asset_id: String(asset_id) },
      },
      success_url: `${SITE}/fleet.html?checkout=success&asset=${encodeURIComponent(asset_id)}`,
      cancel_url: `${SITE}/fleet.html?checkout=cancelled`,
    })

    // ── record the attempt (visible in Mission Control before payment) ────────
    await supabase.from('rental_checkouts').insert({
      asset_id,
      business_name: String(business_name).slice(0, 250),
      contact_name: String(contact_name || '').slice(0, 250) || null,
      email: String(email).trim(),
      phone: String(phone || '').slice(0, 40) || null,
      monthly_price_aud: price,
      floor_leads: asset.floor_leads,
      stripe_session_id: session.id,
      stripe_customer_id: customerId || null,
      status: 'pending',
    })

    return json({ url: session.url })
  } catch (err) {
    console.error('create-rental-checkout error:', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
