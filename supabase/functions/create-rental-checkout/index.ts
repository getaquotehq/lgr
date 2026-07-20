// ============================================================================
// create-rental-checkout - public checkout for an LGR asset rental.
//
// Called from fleet.html when an installer clicks "Rent this asset". No auth:
// the installer isn't a Supabase user yet - they become one (well, an
// `installers` row) only once the Stripe payment completes, via stripe-webhook.
//
// LGR rentals are billed month-to-month in advance, so this creates a Stripe
// Checkout Session in `subscription` mode with an inline recurring monthly
// price. The price and floor are read from the DB - the client is never
// trusted with the amount.
//
// Request (JSON):
//   { asset_id, business_name, contact_name, email, phone }
// Response: { url }  → the browser redirects to Stripe.
//
// GST is added by Stripe Tax via automatic_tax below (uses the account's tax
// settings), so no tax-rate secret is needed. Checkout collects the billing
// address automatically because automatic_tax is enabled.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   STRIPE_API_KEY            (required - the LGR Stripe secret key)
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

// Fire an internal "checkout started" notice to the LGR inbox via Resend.
// Best-effort: RESEND_API_KEY / RESEND_FROM_EMAIL must be set (same as the
// confirmation email). A failure here never blocks the checkout.
async function notifyCheckoutStarted(d: {
  business_name: string; contact_name: string; email: string; phone: string
  brand_name: string; niche: string; region: string; tier: string
  price: number; floor: number; session_id: string
}) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL')
  if (!apiKey || !fromEmail) {
    console.warn('checkout-started notice skipped: RESEND_* not configured')
    return
  }
  const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const money = (n: number) => '$' + Number(n).toLocaleString('en-AU')
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 14px 4px 0;color:#656D76">${k}</td><td><strong>${v}</strong></td></tr>`
  const html = `
    <h2 style="margin:0 0 14px;font-family:Arial,sans-serif">Checkout started - not yet paid</h2>
    <table style="border-collapse:collapse;font-size:14px;font-family:Arial,sans-serif">
      ${row('Business', esc(d.business_name))}
      ${row('Contact', esc(d.contact_name) || '-')}
      ${row('Email', `<a href="mailto:${esc(d.email)}">${esc(d.email)}</a>`)}
      ${row('Phone', esc(d.phone) || '-')}
      ${row('Asset', esc(d.brand_name))}
      ${row('Trade', esc(d.niche) + (d.region ? ' - ' + esc(d.region) : '') + ' (' + esc(d.tier) + ')')}
      ${row('Rental', money(d.price) + ' + GST / 30 days')}
      ${row('Floor', d.floor + ' leads')}
      ${row('Stripe session', `<code>${esc(d.session_id)}</code>`)}
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:#888;font-family:Arial,sans-serif">Payment has not been received yet. A confirmation is sent to the renter on completion.</p>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Lead Gen Rentals <${fromEmail}>`,
      to: ['contact@leadgenrentals.com.au'],
      reply_to: d.email || 'contact@leadgenrentals.com.au',
      subject: `New checkout started - ${d.business_name} (${d.email})`,
      html,
    }),
  })
  if (!res.ok) console.error('resend (checkout-started) error:', res.status, (await res.text()).slice(0, 300))
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
    const productName = `${asset.brand_name} - ${tierName} lead engine`
    const productDesc = `Exclusive ${nicheName} lead engine${regionName ? ' - ' + regionName : ''}. ` +
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
        // Prices are advertised "+GST", so treat them as tax-exclusive - Stripe
        // Tax adds 10% GST on top rather than carving it out of the amount.
        tax_behavior: 'exclusive',
        product_data: { name: productName, description: productDesc },
      },
      quantity: 1,
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      ...(customerId ? { customer: customerId } : { customer_email: String(email).trim() }),
      // Uses the account's Stripe Tax settings (GST) - required to make tax
      // apply to an API-created Checkout Session.
      automatic_tax: { enabled: true },
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

    // ── notify the team that a checkout has started (not yet paid) ────────────
    await notifyCheckoutStarted({
      business_name: String(business_name),
      contact_name: String(contact_name || ''),
      email: String(email).trim(),
      phone: String(phone || ''),
      brand_name: asset.brand_name,
      niche: nicheName,
      region: regionName,
      tier: tierName,
      price,
      floor: asset.floor_leads,
      session_id: session.id,
    }).catch((e) => console.error('notifyCheckoutStarted failed (non-fatal):', e))

    return json({ url: session.url })
  } catch (err) {
    console.error('create-rental-checkout error:', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
