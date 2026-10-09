import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14'

const stripe = new Stripe(Deno.env.get('STRIPE_API_KEY')!, { apiVersion: '2024-04-10' })
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
const RESEND_API_KEY        = Deno.env.get('RESEND_API_KEY')!
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
serve(async (req) => {
  const sig  = req.headers.get('stripe-signature')!
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature failed:', err)
    return new Response('Unauthorized', { status: 401 })
  }

  if (event.type !== 'checkout.session.completed') {
    return new Response('OK', { status: 200 })
  }

  const session = event.data.object as Stripe.Checkout.Session
  const m = session.metadata || {}

  switch (m.type) {
    case 'sms_credits':
      await handleSmsCreditsTopUp(session, m)
      break
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

// ── SMS credits top-up (existing dashboard company) ────────────────────────
async function handleSmsCreditsTopUp(session: Stripe.Checkout.Session, m: Record<string, string>) {
  console.log('SMS credits top-up for company:', m.company_id, 'credits:', m.credits)
  try {
    const credits = parseInt(m.credits)
    if (!credits || credits <= 0) throw new Error('Invalid credits value')

    await supabase.rpc('add_sms_credits', { p_company_id: m.company_id, p_amount: credits })

    const { data: company } = await supabase
      .from('companies').select('name, email').eq('id', m.company_id).maybeSingle()

    await sendInternalEmail(
      `📱 SMS credits top-up - ${company?.name}`,
      `<p>${company?.name} purchased ${credits} SMS credits.</p><p><strong>Email:</strong> ${company?.email}</p>`
    )
    console.log('SMS credits added:', credits, 'to', m.company_id)
  } catch (err) {
    console.error('handleSmsCreditsTopUp error:', err)
    await sendInternalEmail(
      `⚠️ SMS credits top-up failed - company ${m.company_id}`,
      `<p>Error: ${String(err)}</p><p>Credits: ${m.credits}</p><p>Stripe Session: ${session.id}</p>`
    )
  }
}

// ── Emails ───────────────────────────────────────────────────────────────────

async function sendInternalEmail(subject: string, body: string) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Lead Gen Rentals System <system@leadgenrentals.com.au>',
      to:   'contact@leadgenrentals.com.au',
      subject,
      html: `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#333;line-height:1.7">${body}</div>`,
    }),
  }).catch(err => console.error('sendInternalEmail error:', err))
}
