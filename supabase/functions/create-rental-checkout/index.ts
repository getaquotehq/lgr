// ============================================================================
// create-rental-checkout - public checkout for an LGR engine.
//
// Called from fleet.html. No auth: the client isn't a Supabase user yet - they
// become one (well, an `installers` row) once Stripe confirms payment, via
// stripe-webhook.
//
// WHAT THIS CHARGES FOR, AND WHAT IT DOES NOT
//
// It charges LGR's SERVICE FEE and nothing else. The advertising is paid by the
// client directly to Meta, on their own card, on the LGR ad account they are
// given access to after they pay. Not a cent of media passes through this
// Checkout Session, this Stripe account, or LGR's bank.
//
// That makes the line-item description load-bearing rather than decorative: a
// Stripe receipt saying "$1,250 - lead engine" and nothing else is a receipt a
// client will reasonably read as the total cost of advertising with us. The
// committed daily budget is therefore named in the product description, in the
// metadata, and on the confirmation - everywhere the fee is named. MODEL.md
// section 2.4.
//
// THE CLIENT DOES NOT PICK AN ENGINE
//
// They give us the postcode they want work in; the server resolves it to an
// available engine via allocate_engine(). Two reasons, both in MODEL.md:
// exclusivity is per engine and never per territory (1.1), and engine identity
// is not public (7). A picker over engines is a territory map with extra steps,
// and it hands out the shape of our inventory to anyone who opens the page.
//
// Request (JSON):
//   { niche_slug, postcode, business_name, contact_name, email, phone }
//   (asset_id is still accepted, for Mission Control's own "send a checkout
//    link for this specific engine" path. It is validated the same way.)
// Response: { url } → the browser redirects to Stripe.
//           { error, code: 'no_engine_available' } → nothing free for that area.
//
// GST is added by Stripe Tax via automatic_tax (uses the account's tax
// settings), so no tax-rate secret is needed.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   STRIPE_API_KEY            (required - the LGR Stripe secret key)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (auto-injected)
//   RESEND_API_KEY, RESEND_FROM_EMAIL         (optional - internal notice)
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

const TIER_NAME: Record<string, string> = { engine: 'Engine', custom: 'Custom' }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const money = (n: number) => '$' + Number(n).toLocaleString('en-AU')

// Fire an internal "checkout started" notice to the LGR inbox via Resend.
// Best-effort - a failure here never blocks the checkout.
async function notifyCheckoutStarted(d: {
  business_name: string; contact_name: string; email: string; phone: string
  brand_name: string; niche: string; postcode: string; tier: string
  fee: number; daily_budget: number; guarantee: string
  session_id: string; service_type: string
}) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL')
  if (!apiKey || !fromEmail) {
    console.warn('checkout-started notice skipped: RESEND_* not configured')
    return
  }
  const esc = (s: string) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 14px 4px 0;color:#656D76">${k}</td><td><strong>${v}</strong></td></tr>`
  const html = `
    <h2 style="margin:0 0 14px;font-family:Arial,sans-serif">Checkout started - not yet paid</h2>
    <table style="border-collapse:collapse;font-size:14px;font-family:Arial,sans-serif">
      ${row('Business', esc(d.business_name))}
      ${row('Contact', esc(d.contact_name) || '-')}
      ${row('Email', `<a href="mailto:${esc(d.email)}">${esc(d.email)}</a>`)}
      ${row('Phone', esc(d.phone) || '-')}
      ${row('Engine allocated', esc(d.brand_name))}
      ${row('Trade', esc(d.niche) + ' (' + esc(d.tier) + ')')}
      ${row('Service postcode', esc(d.postcode) || '-')}
      ${row('Our fee', money(d.fee) + ' + GST / 30 days')}
      ${row('Their Meta budget', money(d.daily_budget) + '/day, paid direct to Meta on their own card')}
      ${row('Guarantee', esc(d.guarantee))}
      ${row('Stripe session', `<code>${esc(d.session_id)}</code>`)}
    </table>
    <p style="margin:16px 0 0;font-size:13px;color:#444;font-family:Arial,sans-serif">
      <strong>If this one completes, the next step is the ad account handover.</strong>
      Grant access, get their card onto it, then launch. Nothing is live and no guarantee
      clock is running until someone marks the ads live.
    </p>
    <p style="margin:10px 0 0;font-size:12px;color:#888;font-family:Arial,sans-serif">Payment has not been received yet.</p>`

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
    const body = await req.json()
    const { business_name, contact_name, email, phone, service_type } = body
    const nicheSlug = String(body.niche_slug || 'solar').trim().toLowerCase()
    const postcode = String(body.postcode || '').trim()
    const serviceType = String(service_type || 'residential_solar_battery').trim()

    if (!business_name || !email) {
      return json({ error: 'Missing required fields (business_name, email)' }, 400)
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return json({ error: 'Enter a valid email address' }, 400)
    }

    // ── resolve the engine ───────────────────────────────────────────────────
    // Either an explicit asset_id (Mission Control sending a link for a named
    // engine) or, for everyone else, a postcode the server turns into one.
    let assetId: string | null = body.asset_id ? String(body.asset_id) : null

    if (!assetId) {
      if (!/^\d{4}$/.test(postcode)) {
        return json({ error: 'Enter the 4-digit postcode of the area you want work in.' }, 400)
      }
      const { data: allocated, error: allocErr } = await supabase
        .rpc('allocate_engine', { p_niche_slug: nicheSlug, p_postcode: postcode, p_tier: 'engine' })
      if (allocErr) throw allocErr
      if (!allocated) {
        // Deliberately says nothing about WHICH engines exist or where. "Nothing
        // free here" is all a prospect needs and all an adversary gets.
        return json({
          error: 'We do not have an engine free covering that area right now. ' +
                 'Email contact@leadgenrentals.com.au and we will tell you when one opens up.',
          code: 'no_engine_available',
        }, 409)
      }
      assetId = String(allocated)
    }

    // ── read the deal server-side (never trust the client with an amount) ────
    const { data: asset, error: assetErr } = await supabase
      .from('assets')
      .select('id, tier, brand_name, monthly_price_aud, min_daily_budget_aud, ' +
              'guarantee_quotes, guarantee_window_days, ' +
              'status, sold_out, deleted_at, niches(name)')
      .eq('id', assetId)
      .maybeSingle()

    if (assetErr) throw assetErr
    if (!asset || asset.deleted_at) return json({ error: 'That engine no longer exists.' }, 404)
    if (asset.status !== 'available' || asset.sold_out) {
      return json({
        error: 'That engine has just been taken. Try again and we will allocate another.',
        code: 'no_engine_available',
      }, 409)
    }

    const fee = asset.monthly_price_aud
    const dailyBudget = Number(asset.min_daily_budget_aud ?? 0)
    const windowDays = Number(asset.guarantee_window_days ?? 30)
    const gQuotes = asset.guarantee_quotes
    const gPipeline = null  // retired: the guarantee is quoted jobs only
    const nicheName = (asset as any).niches?.name || 'Leads'
    const tierName = TIER_NAME[asset.tier] || asset.tier

    // The guarantee sentence, built once and reused on the Stripe line item, in
    // the metadata and in the internal notice, so the three can never drift into
    // promising three slightly different things.
    // Quoted jobs only. No dollar figure: a pipeline number on a Stripe receipt
    // is a term the client can hold us to, and it is not the promise.
    const guaranteeLine = gQuotes
      ? `${gQuotes} quoted jobs per ${windowDays} days, or this fee is refunded in full.`
      : 'Guarantee per the scope agreed in writing.'

    const productName = `${tierName} lead engine - ${nicheName} (LGR service fee)`
    // Every clause here is a MODEL.md rule: fee excludes media (2.1), the client
    // pays Meta on their own card (2.2), the budget is named beside the fee
    // (2.4), the guarantee and its remedy (3.1), exclusivity is per engine and
    // never territorial (1.1).
    const productDesc =
      `LGR's service fee only - it does NOT include advertising spend. ` +
      `You pay Meta directly from your own card on the ad account we give you access to, ` +
      `with a committed minimum of ${money(dailyBudget)}/day (about ${money(dailyBudget * windowDays)} per ${windowDays} days). ` +
      `We own and run the engine and the campaigns; it is yours alone while you are on it. ` +
      `Guarantee: ${guaranteeLine} ` +
      `Month to month, cancel any time before your next cycle. Confers no exclusive right to any area or postcode.`

    // ── reuse a Stripe customer for this email if we've seen it before ───────
    let customerId: string | undefined
    const existing = await stripe.customers.list({ email: String(email).trim(), limit: 1 })
    if (existing.data.length) customerId = existing.data[0].id

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      ...(customerId ? { customer: customerId } : { customer_email: String(email).trim() }),
      automatic_tax: { enabled: true },
      line_items: [{
        price_data: {
          currency: 'aud',
          unit_amount: fee * 100,
          recurring: { interval: 'month' },
          // Prices are advertised "+GST", so tax-exclusive: Stripe Tax adds 10%
          // on top rather than carving it out.
          tax_behavior: 'exclusive',
          product_data: { name: productName, description: productDesc },
        },
        quantity: 1,
      }],
      metadata: {
        type: 'asset_rental',
        asset_id: String(assetId),
        business_name: String(business_name).slice(0, 250),
        contact_name: String(contact_name || '').slice(0, 250),
        email: String(email).trim(),
        phone: String(phone || '').slice(0, 40),
        postcode,
        niche_slug: nicheSlug,
        // Named `fee_aud`, not `price`, so nobody downstream mistakes it for a
        // total that includes media.
        fee_aud: String(fee),
        min_daily_budget_aud: String(dailyBudget),
        guarantee_quotes: String(gQuotes ?? ''),
        service_type: serviceType,
      },
      subscription_data: {
        metadata: { type: 'asset_rental', asset_id: String(assetId) },
      },
      // session_id lets the landing page poll get-magic-link for a one-click way
      // into the dashboard once the webhook has provisioned the account.
      success_url: `${SITE}/fleet.html?checkout=success&session_id={CHECKOUT_SESSION_ID}&value=${encodeURIComponent(String(fee))}&currency=AUD`,
      cancel_url: `${SITE}/fleet.html?checkout=cancelled`,
    })

    // ── record the attempt (visible in Mission Control before payment) ───────
    await supabase.from('rental_checkouts').insert({
      asset_id: assetId,
      business_name: String(business_name).slice(0, 250),
      contact_name: String(contact_name || '').slice(0, 250) || null,
      email: String(email).trim(),
      phone: String(phone || '').slice(0, 40) || null,
      monthly_price_aud: fee,
      min_daily_budget_aud: dailyBudget || null,
      guarantee_quotes: gQuotes ?? null,
      service_type: serviceType,
      stripe_session_id: session.id,
      stripe_customer_id: customerId || null,
      status: 'pending',
    })

    await notifyCheckoutStarted({
      business_name: String(business_name),
      contact_name: String(contact_name || ''),
      email: String(email).trim(),
      phone: String(phone || ''),
      brand_name: asset.brand_name,
      niche: nicheName,
      postcode,
      tier: tierName,
      fee,
      daily_budget: dailyBudget,
      guarantee: guaranteeLine,
      session_id: session.id,
      service_type: serviceType,
    }).catch((e) => console.error('notifyCheckoutStarted failed (non-fatal):', e))

    return json({ url: session.url })
  } catch (err) {
    console.error('create-rental-checkout error:', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
