// ============================================================================
// create-rental-checkout - public checkout for an LGR asset rental.
//
// Called from fleet.html when an installer clicks "Rent this asset". No auth:
// the installer isn't a Supabase user yet - they become one (well, an
// `installers` row) only once the Stripe payment completes, via stripe-webhook.
//
// LGR rentals are billed month-to-month in advance, so a normal rental creates
// a Stripe Checkout Session in `subscription` mode with an inline recurring
// monthly price. The price and floor are read from the DB - the client is
// never trusted with the amount.
//
// The 5-lead trial (trial: true) is a completely separate, one-off `payment`
// mode session - no subscription, no recurring price, nothing scheduled to
// bill later. Continuing past the trial is a separate checkout the renter
// starts themselves.
//
// Request (JSON):
//   { asset_id, business_name, contact_name, email, phone, trial? }
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
  price: number; floor: number; session_id: string; is_trial: boolean
  rush_delivery: boolean; trial_total_aud: number; service_type: string
}) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL')
  if (!apiKey || !fromEmail) {
    console.warn('checkout-started notice skipped: RESEND_* not configured')
    return
  }
  const esc = (s: string) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  const money = (n: number) => '$' + Number(n).toLocaleString('en-AU')
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 14px 4px 0;color:#656D76">${k}</td><td><strong>${v}</strong></td></tr>`
  const kind = d.is_trial ? '5-LEAD TRIAL' : 'Rental'
  const html = `
    <h2 style="margin:0 0 14px;font-family:Arial,sans-serif">Checkout started (${esc(kind)}) - not yet paid</h2>
    <table style="border-collapse:collapse;font-size:14px;font-family:Arial,sans-serif">
      ${row('Business', esc(d.business_name))}
      ${row('Contact', esc(d.contact_name) || '-')}
      ${row('Email', `<a href="mailto:${esc(d.email)}">${esc(d.email)}</a>`)}
      ${row('Phone', esc(d.phone) || '-')}
      ${row('Asset', esc(d.brand_name))}
      ${row('Trade', esc(d.niche) + (d.region ? ' - ' + esc(d.region) : '') + ' (' + esc(d.tier) + ')')}
      ${d.is_trial ? row('Service type', esc(d.service_type === 'battery_retrofit' ? 'Battery Retrofit' : 'Residential Solar + Battery')) : ''}
      ${d.is_trial ? row('Trial', '5 leads @ $78 = $390 + GST, one-off charge, no subscription') : ''}
      ${d.is_trial && d.rush_delivery ? row('Rush Delivery', '$97 + GST · all 5 leads in 3-5 days or refund the $97') : ''}
      ${d.is_trial ? row('Charge today', money(d.trial_total_aud) + ' + GST') : ''}
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
      subject: `New ${d.is_trial ? 'TRIAL ' : ''}checkout started - ${d.business_name} (${d.email})`,
      html,
    }),
  })
  if (!res.ok) console.error('resend (checkout-started) error:', res.status, (await res.text()).slice(0, 300))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const { asset_id, business_name, contact_name, email, phone, trial, rush_delivery, service_type } = await req.json()
    const isTrial = trial === true
    const rushDelivery = isTrial && rush_delivery === true
    const serviceType = String(service_type || 'residential_solar_battery').trim()

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

    // ── 5-lead trial (public /trial offer) ────────────────────────────────────
    // A pure one-off payment - mode 'payment', not 'subscription'. No recurring
    // price, no subscription_data, no trial_period_days. Nothing about the
    // ongoing monthly rental is created or scheduled here; if the renter wants
    // to continue after the trial, that's a separate, deliberate checkout.
    const TRIAL_LEADS = 5
    const TRIAL_RATE  = 78                                      // $/lead, locked
    const RUSH_DELIVERY_AUD = 97
    const TRIAL_TOTAL = Math.round(TRIAL_LEADS * TRIAL_RATE * 100)  // cents

    const trialLineItem: Stripe.Checkout.SessionCreateParams.LineItem = {
      price_data: {
        currency: 'aud',
        unit_amount: TRIAL_TOTAL,
        tax_behavior: 'exclusive',
        product_data: {
          name: `${asset.brand_name} - ${TRIAL_LEADS}-lead trial`,
          description:
            `${TRIAL_LEADS} exclusive ${nicheName} leads${regionName ? ' - ' + regionName : ''}, ` +
            `guaranteed and delivered over 7-14 days, at a locked $${TRIAL_RATE} per lead. ` +
            `Yours alone, never shared or resold. One-off charge, not a subscription.`,
        },
      },
      quantity: 1,
    }

    const rushDeliveryLineItem: Stripe.Checkout.SessionCreateParams.LineItem = {
      price_data: {
        currency: 'aud',
        unit_amount: RUSH_DELIVERY_AUD * 100,
        tax_behavior: 'exclusive',
        product_data: {
          name: 'Rush Delivery',
          description:
            `Get all 5 leads in 3-5 days instead of the standard 7-14. ` +
            `If we don't deliver all 5 within 5 days, we refund the $97 - you keep the leads either way.`,
        },
      },
      quantity: 1,
    }

    const rentalLineItem: Stripe.Checkout.SessionCreateParams.LineItem = {
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

    const lineItems = isTrial
      ? [trialLineItem, ...(rushDelivery ? [rushDeliveryLineItem] : [])]
      : [rentalLineItem]
    const trialTotalAud = TRIAL_TOTAL / 100 + (rushDelivery ? RUSH_DELIVERY_AUD : 0)

    const session = await stripe.checkout.sessions.create({
      mode: isTrial ? 'payment' : 'subscription',
      payment_method_types: ['card'],
      ...(customerId ? { customer: customerId } : { customer_email: String(email).trim() }),
      // Uses the account's Stripe Tax settings (GST) - required to make tax
      // apply to an API-created Checkout Session.
      automatic_tax: { enabled: true },
      line_items: lineItems,
      metadata: {
        type: isTrial ? 'asset_trial' : 'asset_rental',
        asset_id: String(asset_id),
        business_name: String(business_name).slice(0, 250),
        contact_name: String(contact_name || '').slice(0, 250),
        email: String(email).trim(),
        phone: String(phone || '').slice(0, 40),
        monthly_price_aud: String(price),
        floor_leads: String(asset.floor_leads),
        rush_delivery: rushDelivery ? 'true' : 'false',
        service_type: serviceType,
        ...(isTrial
          ? {
            trial_leads: String(TRIAL_LEADS),
            trial_rate_aud: String(TRIAL_RATE),
            trial_total_aud: String((TRIAL_TOTAL / 100).toFixed(2)),
            rush_delivery_price_aud: rushDelivery ? String(RUSH_DELIVERY_AUD) : '0',
            checkout_total_aud: String(trialTotalAud.toFixed(2)),
          }
          : {}),
      },
      ...(isTrial ? {} : {
        subscription_data: {
          metadata: { type: 'asset_rental', asset_id: String(asset_id) },
        },
      }),
      // session_id lets the landing page poll get-magic-link for a one-click
      // way into the dashboard once the webhook has provisioned the account -
      // {CHECKOUT_SESSION_ID} is a Stripe template string it fills in itself.
      success_url: isTrial
        ? `${SITE}/solar-trial.html?checkout=success&asset=${encodeURIComponent(asset_id)}&session_id={CHECKOUT_SESSION_ID}&value=${encodeURIComponent(trialTotalAud.toFixed(2))}&currency=AUD`
        : `${SITE}/fleet.html?checkout=success&asset=${encodeURIComponent(asset_id)}&session_id={CHECKOUT_SESSION_ID}&value=${encodeURIComponent(String(price))}&currency=AUD`,
      cancel_url: isTrial
        ? `${SITE}/solar-trial.html?checkout=cancelled`
        : `${SITE}/fleet.html?checkout=cancelled`,
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
      rush_delivery: rushDelivery,
      service_type: serviceType,
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
      is_trial: isTrial,
      rush_delivery: rushDelivery,
      trial_total_aud: trialTotalAud,
      service_type: serviceType,
    }).catch((e) => console.error('notifyCheckoutStarted failed (non-fatal):', e))

    return json({ url: session.url })
  } catch (err) {
    console.error('create-rental-checkout error:', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
