// ============================================================================
// stripe-webhook — turns a paid Stripe Checkout into a live LGR rental.
//
// Wire this endpoint up in the Stripe Dashboard (Developers → Webhooks) against
//   https://<project>.supabase.co/functions/v1/stripe-webhook
// and subscribe it to:
//   • checkout.session.completed        → activate the rental
//   • customer.subscription.deleted     → release the asset (cancel / lapse)
// The signing secret Stripe gives you goes in the STRIPE_WEBHOOK_SECRET secret.
//
// On checkout.session.completed (metadata.type === 'asset_rental') we call the
// activate_rental() RPC, which creates/updates the installer, marks the asset
// rented and opens a rentals history row — so the payment shows up in Mission
// Control automatically. The RPC is idempotent, so Stripe retries are safe.
//
// Secrets:
//   STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET  (required)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14'

const stripe = new Stripe(Deno.env.get('STRIPE_API_KEY')!, { apiVersion: '2024-04-10' })
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

serve(async (req) => {
  const sig = req.headers.get('stripe-signature')
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature failed:', err)
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const m = session.metadata || {}
      if (m.type === 'asset_rental') {
        await activateRental(session, m)
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription
      await supabase.rpc('release_rental', { p_stripe_subscription_id: sub.id })
    }
  } catch (err) {
    // Log but 200 the ack so Stripe doesn't hammer retries on a transient error.
    console.error(`Handler error for ${event.type}:`, err)
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

async function activateRental(session: Stripe.Checkout.Session, m: Record<string, string>) {
  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id ?? null
  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id ?? null

  const { data, error } = await supabase.rpc('activate_rental', {
    p_asset_id: m.asset_id,
    p_business_name: m.business_name || '',
    p_contact_name: m.contact_name || null,
    p_email: m.email || session.customer_details?.email || '',
    p_phone: m.phone || null,
    p_stripe_customer_id: customerId,
    p_stripe_subscription_id: subscriptionId,
    p_stripe_session_id: session.id,
  })
  if (error) throw new Error(`activate_rental: ${error.message}`)

  // flip the checkout attempt to paid (best-effort)
  await supabase.from('rental_checkouts')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
    })
    .eq('stripe_session_id', session.id)

  console.log('Rental activated:', JSON.stringify(data))

  // fire-and-forget confirmation email to the installer
  const to = m.email || session.customer_details?.email || ''
  if (to) {
    await sendConfirmationEmail(to, m).catch(err =>
      console.error('confirmation email failed (non-fatal):', err))
  }
}

// Confirmation email — uses the same Resend setup as deliver-lead
// (RESEND_API_KEY / RESEND_FROM_EMAIL). Best-effort: a failure here never
// blocks the rental, which is already active in the DB.
async function sendConfirmationEmail(to: string, m: Record<string, string>) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL')
  if (!apiKey || !fromEmail) {
    console.warn('confirmation email skipped: RESEND_* not configured')
    return
  }

  // pull the asset details for a personalised email
  const { data: asset } = await supabase
    .from('assets')
    .select('brand_name, monthly_price_aud, floor_leads, typical_min, typical_max, niches(name), regions(name)')
    .eq('id', m.asset_id)
    .maybeSingle()

  const brandName = (asset as any)?.brand_name || 'your lead engine'
  const nicheName = (asset as any)?.niches?.name || 'lead'
  const regionName = (asset as any)?.regions?.name || ''
  const price = (asset as any)?.monthly_price_aud ?? Number(m.monthly_price_aud || 0)
  const floor = (asset as any)?.floor_leads ?? Number(m.floor_leads || 0)
  const tmin = (asset as any)?.typical_min
  const tmax = (asset as any)?.typical_max
  const range = tmin && tmax ? `typically ${tmin}–${tmax} leads` : ''
  const money = (n: number) => '$' + Number(n).toLocaleString('en-AU')
  const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const firstName = (m.contact_name || '').trim().split(/\s+/)[0] || 'there'

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0D1117">
    <h2 style="font-size:20px;letter-spacing:-.02em;margin:0 0 6px">You're locked in, ${esc(firstName)}. 🎉</h2>
    <p style="font-size:15px;line-height:1.55;color:#3A424D;margin:0 0 18px">
      Your rental of <strong>${esc(brandName)}</strong>${regionName ? ' in ' + esc(regionName) : ''} is now active.
      This ${esc(nicheName)} lead engine is yours alone — every lead it makes goes to your business and nobody else,
      with your name on the consent.
    </p>
    <table style="border-collapse:collapse;font-size:14px;width:100%;border:1px solid #E6E8EB;border-radius:10px;overflow:hidden">
      <tr><td style="padding:11px 14px;color:#656D76;border-bottom:1px solid #F0F2F4">Asset</td><td style="padding:11px 14px;text-align:right;font-weight:600;border-bottom:1px solid #F0F2F4">${esc(brandName)}</td></tr>
      <tr><td style="padding:11px 14px;color:#656D76;border-bottom:1px solid #F0F2F4">Guaranteed floor</td><td style="padding:11px 14px;text-align:right;font-weight:600;border-bottom:1px solid #F0F2F4">${floor} leads / 30 days${range ? ' · ' + esc(range) : ''}</td></tr>
      <tr><td style="padding:11px 14px;color:#656D76">Rental</td><td style="padding:11px 14px;text-align:right;font-weight:600">${money(price)} + GST / 30 days</td></tr>
    </table>
    <p style="font-size:15px;line-height:1.55;color:#3A424D;margin:18px 0 0">
      <strong>What happens next:</strong> your landing page and paid campaigns go live on our accounts and our budget —
      nothing to set up. The moment a homeowner submits, our AI texts them in your name within ~60 seconds, and the lead
      lands with you. First leads typically arrive within a few days.
    </p>
    <p style="font-size:13px;line-height:1.55;color:#656D76;margin:18px 0 0">
      Billed month to month in advance — cancel any time before your next cycle from your Stripe receipt, no lock-in.
      Questions? Just reply to this email.
    </p>
    <p style="font-size:12px;color:#98A0A8;margin:22px 0 0">Lead Gen Rentals · leadgenrentals.com.au</p>
  </div>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Lead Gen Rentals <${fromEmail}>`,
      to: [to],
      reply_to: 'contact@leadgenrentals.com.au',
      subject: `You're locked in — ${brandName} is now yours`,
      html,
    }),
  })
  if (!res.ok) console.error('resend error:', res.status, (await res.text()).slice(0, 300))
}
