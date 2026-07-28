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

// ── Shared helpers ─────────────────────────────────────────────────────────────

async function createMagicLink(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${Deno.env.get('SITE_URL') ?? 'https://leadgenrentals.com.au/dashboard'}/index.html`, expiresIn: 86400 },
  })
  if (error) throw new Error(`Magic link: ${error.message}`)
  return data.properties.action_link
}

function buildSmsPrompts(company: string, niche: string): { system_prompt: string; welcome_message: string } {
  const system_prompt =
    `Use natural Australian English, not American English.

Never quote specific prices or guarantees - always defer to the team. For financing specifics, defer to the team.

If someone says not interested, acknowledge it politely and close the conversation.

Escalate to a human immediately if: the lead mentions a complaint, asks about an existing job, mentions anything legal or billing related, or asks for the owner or manager. Do not attempt to handle these yourself.`

  const welcome_message =
    `Hi, thanks for reaching out to ${company}. We just wanted to confirm you're looking for a ${niche} quote - is that correct?`

  return { system_prompt, welcome_message }
}

function buildSystemPrompt(m: Record<string, string>): string {
  return `You are a friendly and professional sales assistant for ${m.company}, a ${m.industry} business based in ${m.service_location}.

Your job is to qualify inbound leads via SMS. Keep messages short, warm and conversational - never more than 2-3 sentences.

Key details:
- Business: ${m.company}
- Industry: ${m.industry}
- Service area: ${m.service_location} within ${m.service_radius}
${m.special_offers   ? `- Current offers: ${m.special_offers}`     : ''}
${m.products_brands  ? `- Products/brands: ${m.products_brands}`   : ''}

Goals in order:
1. Confirm what the lead needs and their name
2. Qualify their timeline and rough budget
3. Book a callback or on-site visit
4. If ready, initiate a quote

Always be helpful, never pushy. Sign off as the ${m.company} team.`
}

async function insertSmsAgentConfig(companyId: string, m: Record<string, string>) {
  await supabase.from('sms_agent_config').insert({
    company_id:               companyId,
    model:                    'gpt-4o',
    is_active:                false,
    auto_reply:               false,
    callback_enabled:         true,
    onsite_enabled:           false,
    quote_drafting_enabled:   false,
    lead_scoring_enabled:     true,
    auto_send_welcome:        false,
    agent_name:               'Alex',
    reply_delay_seconds:      8,
    max_sms_words:            60,
    special_offers:           m.special_offers  || null,
    service_locations:        [m.service_location].filter(Boolean),
    max_travel_distance:      50,
    max_travel_distance_unit: 'km',
    callback_hours_start:     '08:00',
    callback_hours_end:       '18:00',
    welcome_message:          `Hi {{first_name}}, thanks for reaching out to ${m.company}! We'll be in touch shortly.`,
    automate_quote_followup:  true,
    days_until_followup:      3,
    followup_message:         `Hi {{first_name}}, just following up on your quote. Let us know if you have any questions!`,
    quote_pricing_config: {
      items:    [],
      tax_rate: 10,
      tax_mode: 'exclusive',
      currency: 'AUD',
      formula:  m.products_brands ? `Products/brands: ${m.products_brands}` : '',
    },
    system_prompt: buildSystemPrompt(m),
  })
}

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

// Internal ops emails show solar_battery as solar_and_battery
function emailNiche(niche: string | null | undefined): string {
  return niche === 'solar_battery' ? 'solar_and_battery' : (niche || '')
}

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
