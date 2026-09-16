// ============================================================================
// stripe-webhook - turns a paid Stripe Checkout into a live LGR rental.
//
// Wire this endpoint (Stripe Dashboard -> Event destinations) to
//   https://<project>.supabase.co/functions/v1/stripe-webhook
// subscribed to:
//   - checkout.session.completed        -> activate the rental
//   - customer.subscription.deleted     -> release the asset (cancel / lapse)
// The signing secret goes in STRIPE_WEBHOOK_SECRET.
//
// On checkout.session.completed (metadata.type === 'asset_rental') we call the
// activate_rental() RPC (creates/updates the service business, marks the asset
// rented, opens a rentals history row), email the renter a confirmation, and
// email contact@leadgenrentals.com.au a "new rental paid" notice. All emails
// are best-effort and never block the (already active) rental.
//
// Secrets: STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET (required),
//          RESEND_API_KEY, RESEND_FROM_EMAIL (for emails),
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
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
const SITE = 'https://leadgenrentals.com.au'


// Every LGR company shares the same Twilio number instead of a dedicated one
// (see provision-twilio / platform_settings.shared_twilio_number, set from
// /admin -> Shared SMS Number). provision-twilio is itself idempotent - it
// no-ops if the company already has a twilio_numbers row - so this is safe
// to call unconditionally on every rental activation.
async function provisionTwilio(companyId: string) {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/provision-twilio`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ company_id: companyId }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`provision-twilio returned HTTP ${res.status}: ${text}`)
  }
}

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
    p_is_trial: false,
  })
  if (error) throw new Error(`activate_rental: ${error.message}`)

  await supabase.from('rental_checkouts')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      ...(m.service_type ? { service_type: m.service_type } : {}),
    })
    .eq('stripe_session_id', session.id)

  await supabase.from('rentals')
    .update({
      ...(m.service_type ? { service_type: m.service_type } : {}),
    })
    .eq('stripe_session_id', session.id)

  console.log('Rental activated:', JSON.stringify(data))

  const to = m.email || session.customer_details?.email || ''
  const installerId = (data as { installer_id?: string } | null)?.installer_id
  const rentalId = (data as { rental_id?: string } | null)?.rental_id

  // Open cycle 1 of the guarantee. It opens `pending` with NO dates: the clock
  // starts when the ads go live, not when the card is charged, so the days we
  // spend on the ad account handover come out of our time and not the client's
  // guarantee (MODEL.md section 3.2). mark_ads_live() sets the dates later.
  //
  // Idempotent on (rental_id, cycle_no), so a Stripe webhook retry cannot open
  // two cycles - and best-effort, because a client whose guarantee row failed to
  // create still has a paid, active engagement. It is recreated by the same call
  // when the ads are marked live.
  if (rentalId) {
    const { error: cycleErr } = await supabase.rpc('open_guarantee_cycle', {
      p_rental_id: rentalId, p_cycle_no: 1,
    })
    if (cycleErr) console.error('open_guarantee_cycle failed (non-fatal):', cycleErr.message)
  }

  // Link this rental to a dashboard (HQ) login - new account if the email is
  // new, otherwise attach to the existing one. Best-effort: a failure here
  // never undoes the (already active) rental.
  let magicLink: string | null = null
  if (installerId && to) {
    magicLink = await provisionDashboardAccount(
      installerId, to, m.business_name || '', m.contact_name || null,
      m.phone || null, customerId, session.id,
    ).catch(err => {
      console.error('provisionDashboardAccount failed (non-fatal):', err)
      return null
    })
  }

  if (to) {
    await sendConfirmationEmail(to, m, magicLink).catch(err =>
      console.error('confirmation email failed (non-fatal):', err))
  }

  await notifyRentalPaid(m, to, session).catch(err =>
    console.error('rental-paid notice failed (non-fatal):', err))
}

// Link (or create) the dashboard account that owns this installer, then hand
// back a one-click login link for the renter. Same self-service model as the
// rest of LGR: no admin step required.
//
//   - installer already linked (company_id set)      -> just refresh the link
//   - a companies row already exists for this email   -> attach to it
//   - neither exists                                  -> create a new account
//     (handle_new_user() trigger creates companies + profiles synchronously
//     off auth.users metadata - same mechanism create-user-silent uses)
//
// The link is also stashed in pending_magic_links (keyed by the Stripe
// checkout session id) so fleet.html's post-checkout banner can poll
// get-magic-link and offer a "go to your dashboard" button without emailing
// being the only path in.
async function provisionDashboardAccount(
  installerId: string,
  email: string,
  businessName: string,
  contactName: string | null,
  phone: string | null,
  stripeCustomerId: string | null,
  sessionId: string,
): Promise<string | null> {
  const normalisedEmail = email.trim().toLowerCase()

  const { data: installer, error: instErr } = await supabase
    .from('installers')
    .select('company_id')
    .eq('id', installerId)
    .maybeSingle()
  if (instErr) throw instErr

  let companyId = (installer?.company_id as string | null) || null

  if (!companyId) {
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('id')
      .eq('email', normalisedEmail)
      .maybeSingle()

    if (existingCompany) {
      companyId = existingCompany.id as string
    } else {
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: normalisedEmail,
        email_confirm: true,
        user_metadata: {
          full_name: contactName || businessName,
          user_type: 'external',
          company_name: businessName,
        },
      })
      if (createErr || !newUser?.user) throw createErr || new Error('createUser returned no user')

      // handle_new_user() runs synchronously on the auth.users insert, but poll
      // briefly for replication safety (same pattern as create-user-silent).
      for (let attempt = 0; attempt < 8 && !companyId; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 200))
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('id', newUser.user.id)
          .maybeSingle()
        if (profileRow?.company_id) companyId = profileRow.company_id as string
      }
      if (!companyId) throw new Error('company_id never appeared after createUser')
    }

    await supabase.from('companies').update({
      email: normalisedEmail,
      ...(phone ? { phone } : {}),
      ...(stripeCustomerId ? { stripe_customer_id: stripeCustomerId } : {}),
    }).eq('id', companyId)

    await supabase.from('installers').update({ company_id: companyId }).eq('id', installerId)
  }

  // Assign the shared platform SMS number so the AI agent is send-ready
  // without a manual admin step. Best-effort: never blocks the (already
  // active) rental or the dashboard login link below.
  await provisionTwilio(companyId).catch(err =>
    console.error('provisionTwilio failed (non-fatal):', err))

  // One-click login, regardless of new vs existing account.
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: normalisedEmail,
    options: { redirectTo: `${SITE}/dashboard/index.html` },
  })
  if (linkErr || !linkData?.properties?.action_link) {
    throw linkErr || new Error('generateLink returned no action_link')
  }

  await supabase.from('pending_magic_links').upsert({
    stripe_session_id: sessionId,
    magic_link: linkData.properties.action_link,
  })

  return linkData.properties.action_link
}

// Confirmation email to the renter (Resend, best-effort).
async function sendConfirmationEmail(to: string, m: Record<string, string>, magicLink: string | null) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL')
  if (!apiKey || !fromEmail) {
    console.warn('confirmation email skipped: RESEND_* not configured')
    return
  }

  const { data: asset } = await supabase
    .from('assets')
    .select('brand_name, monthly_price_aud, min_daily_budget_aud, guarantee_quotes, ' +
            'guarantee_pipeline_aud, guarantee_window_days, tier, niches(name)')
    .eq('id', m.asset_id)
    .maybeSingle()

  // The engine's brand is deliberately NOT in this email. Identity is disclosed
  // once the client is in their dashboard and paid up (MODEL.md section 7), and
  // a confirmation email is forwarded, screenshotted and quoted in ways a
  // logged-in page is not.
  const nicheName = (asset as any)?.niches?.name || 'lead'
  const fee = (asset as any)?.monthly_price_aud ?? Number(m.fee_aud || m.monthly_price_aud || 0)
  const dailyBudget = Number((asset as any)?.min_daily_budget_aud ?? m.min_daily_budget_aud ?? 0)
  const windowDays = Number((asset as any)?.guarantee_window_days ?? 30)
  const gQuotes = (asset as any)?.guarantee_quotes ?? Number(m.guarantee_quotes || 0)
  const gPipeline = (asset as any)?.guarantee_pipeline_aud ?? Number(m.guarantee_pipeline_aud || 0)
  const TIER_LABEL: Record<string, string> = { engine: 'Engine', custom: 'Custom' }
  const tierLabel = TIER_LABEL[(asset as any)?.tier] || (asset as any)?.tier || 'Engine'
  const money = (n: number) => '$' + Number(n).toLocaleString('en-AU')
  const esc = (s: string) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  const firstName = (m.contact_name || '').trim().split(/\s+/)[0] || 'there'

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0D1117">
    <h2 style="font-size:20px;letter-spacing:-.02em;margin:0 0 6px">You're in, ${esc(firstName)}.</h2>
    <p style="font-size:15px;line-height:1.55;color:#3A424D;margin:0 0 18px">
      Your ${esc(nicheName.toLowerCase())} engine is allocated and it's yours alone while you're on it.
      Every lead it produces goes to your business and nobody else, with your name on the consent
      the homeowner agrees to. Never shared, never resold.
    </p>
    <table style="border-collapse:collapse;font-size:14px;width:100%;border:1px solid #E6E8EB;border-radius:10px;overflow:hidden">
      <tr><td style="padding:11px 14px;color:#656D76;border-bottom:1px solid #F0F2F4">Plan</td><td style="padding:11px 14px;text-align:right;font-weight:600;border-bottom:1px solid #F0F2F4">${esc(tierLabel)}</td></tr>
      <tr><td style="padding:11px 14px;color:#656D76;border-bottom:1px solid #F0F2F4">Our fee (this invoice)</td><td style="padding:11px 14px;text-align:right;font-weight:600;border-bottom:1px solid #F0F2F4">${money(fee)} + GST / ${windowDays} days</td></tr>
      <tr><td style="padding:11px 14px;color:#656D76;border-bottom:1px solid #F0F2F4">Your ad budget <span style="color:#98A0A8">(paid to Meta, not to us)</span></td><td style="padding:11px 14px;text-align:right;font-weight:600;border-bottom:1px solid #F0F2F4">${money(dailyBudget)}/day</td></tr>
      ${gQuotes && gPipeline ? `<tr><td style="padding:11px 14px;color:#656D76">Guarantee</td><td style="padding:11px 14px;text-align:right;font-weight:600">${gQuotes} quotes &amp; ${money(gPipeline)} pipeline</td></tr>` : ''}
    </table>
    <p style="font-size:13px;line-height:1.55;color:#656D76;margin:12px 0 0">
      The ${money(fee)} above is our fee and it contains no advertising spend. Your advertising is
      billed by Meta, to your own card, at Meta's prices - we never touch it and never mark it up.
    </p>
    <p style="font-size:15px;line-height:1.55;color:#3A424D;margin:18px 0 0">
      <strong>What happens next - and this bit needs you:</strong>
    </p>
    <ol style="font-size:14px;line-height:1.7;color:#3A424D;margin:8px 0 0;padding-left:20px">
      <li><strong>We give you access to the ad account.</strong> It's ours, it runs your engine, and you'll see every campaign, every dollar and every result in it.</li>
      <li><strong>You add your own card to it.</strong> Meta bills that card directly for the ${money(dailyBudget)}/day. Nothing can go live until this is done - there's no one for Meta to bill.</li>
      <li><strong>We build and launch</strong>, targeting the area you gave us.</li>
      <li><strong>Your 30 days start the day the ads go live</strong> - not today. Getting you launched is our time to lose, not yours.</li>
    </ol>
    ${gQuotes && gPipeline ? `
    <p style="font-size:14px;line-height:1.6;color:#3A424D;margin:16px 0 0;padding:12px 14px;background:#F6F8FA;border-radius:8px">
      <strong>The guarantee:</strong> ${gQuotes} quotes sent and ${money(gPipeline)} in quoted pipeline in your first ${windowDays} days,
      or this fee comes back in full. You'll see it tracking daily in your dashboard - you won't be
      finding out on day 30.
    </p>` : ''}
    ${magicLink ? `
    <p style="margin:22px 0 0">
      <a href="${esc(magicLink)}" style="display:inline-block;background:#0D1117;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600">
        Go to your dashboard &rarr;
      </a>
    </p>
    <p style="font-size:12px;line-height:1.5;color:#98A0A8;margin:10px 0 0">
      This is where your leads, conversations and account live. The link above logs you straight in and expires after
      one use - if it's already expired, use "Forgot password" at leadgenrentals.com.au/dashboard.
    </p>` : ''}
    <p style="font-size:13px;line-height:1.55;color:#656D76;margin:18px 0 0">
      Billed month to month in advance - cancel any time before your next cycle from your Stripe receipt, no lock-in.
      Questions? Just reply to this email.
    </p>
    <p style="font-size:12px;color:#98A0A8;margin:22px 0 0">Lead Gen Rentals - leadgenrentals.com.au</p>
  </div>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Lead Gen Rentals <${fromEmail}>`,
      to: [to],
      reply_to: 'contact@leadgenrentals.com.au',
      subject: `You're in - your ${nicheName.toLowerCase()} engine is allocated`,
      html,
    }),
  })
  if (!res.ok) console.error('resend error:', res.status, (await res.text()).slice(0, 300))
}

// Internal "new rental - paid" notice to the LGR inbox (Resend, best-effort).
async function notifyRentalPaid(m: Record<string, string>, renterEmail: string, session: Stripe.Checkout.Session) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL')
  if (!apiKey || !fromEmail) return

  const { data: asset } = await supabase
    .from('assets')
    .select('brand_name, monthly_price_aud, min_daily_budget_aud, guarantee_quotes, ' +
            'guarantee_pipeline_aud, niches(name), regions(name)')
    .eq('id', m.asset_id)
    .maybeSingle()

  const esc = (s: string) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  const money = (n: number) => '$' + Number(n).toLocaleString('en-AU')
  const brandName = (asset as any)?.brand_name || m.asset_id
  const nicheName = (asset as any)?.niches?.name || ''
  const regionName = (asset as any)?.regions?.name || ''
  const fee = (asset as any)?.monthly_price_aud ?? Number(m.fee_aud || m.monthly_price_aud || 0)
  const dailyBudget = Number((asset as any)?.min_daily_budget_aud ?? m.min_daily_budget_aud ?? 0)
  const gQuotes = (asset as any)?.guarantee_quotes ?? Number(m.guarantee_quotes || 0)
  const gPipeline = (asset as any)?.guarantee_pipeline_aud ?? Number(m.guarantee_pipeline_aud || 0)
  const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || ''
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 14px 4px 0;color:#656D76">${k}</td><td><strong>${v}</strong></td></tr>`

  const html = `
    <h2 style="margin:0 0 14px;font-family:Arial,sans-serif">New engagement - fee received</h2>
    <table style="border-collapse:collapse;font-size:14px;font-family:Arial,sans-serif">
      ${row('Business', esc(m.business_name || ''))}
      ${row('Contact', esc(m.contact_name || '') || '-')}
      ${row('Email', `<a href="mailto:${esc(renterEmail)}">${esc(renterEmail)}</a>`)}
      ${row('Phone', esc(m.phone || '') || '-')}
      ${row('Engine', esc(brandName))}
      ${row('Trade', esc(nicheName) + (regionName ? ' - ' + esc(regionName) : ''))}
      ${row('Service postcode', esc(m.postcode || '') || '-')}
      ${row('Our fee', money(fee) + ' + GST / 30 days')}
      ${row('Their Meta budget', money(dailyBudget) + '/day, direct to Meta on their own card')}
      ${gQuotes && gPipeline ? row('Guarantee', gQuotes + ' quotes &amp; ' + money(gPipeline) + ' pipeline') : ''}
      ${row('Stripe subscription', `<code>${esc(subId)}</code>`)}
    </table>
    <p style="margin:16px 0 0;font-size:14px;font-family:Arial,sans-serif;padding:10px 12px;background:#FFF8E1;border-radius:6px">
      <strong>Next: the ad account handover.</strong> Grant them access, get their card on the account,
      then launch and mark the ads live. The guarantee clock is NOT running yet - it starts at
      ads_live_at - and nothing can deliver until Meta has a card to bill.
    </p>
    <p style="margin:12px 0 0;font-size:12px;color:#888;font-family:Arial,sans-serif">The engine is marked rented in Mission Control, guarantee cycle 1 is open and pending, and the client has been emailed.</p>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Lead Gen Rentals <${fromEmail}>`,
      to: ['contact@leadgenrentals.com.au'],
      reply_to: renterEmail || 'contact@leadgenrentals.com.au',
      subject: `New engagement paid - ${m.business_name || brandName}`,
      html,
    }),
  })
  if (!res.ok) console.error('resend (rental-paid) error:', res.status, (await res.text()).slice(0, 300))
}
