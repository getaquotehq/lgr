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
    case 'ppl':
      await handlePplPayment(session, m)
      break
    case 'ppl_signup':
      await handlePplSignupPayment(session, m)
      break
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

async function provisionTwilio(companyId: string) {
  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/provision-twilio`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ company_id: companyId }),
  }).catch(err => console.error('provision-twilio error:', err))
}

async function hasTwilioNumber(companyId: string): Promise<boolean> {
  const { data } = await supabase
    .from('twilio_numbers')
    .select('id')
    .eq('company_id', companyId)
    .maybeSingle()
  return !!data
}

async function createMagicLink(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${Deno.env.get('SITE_URL') ?? 'https://leadgenrentals.com.au/dashboard'}/dashboard.html`, expiresIn: 86400 },
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

// ── PPL payment (existing company buying more leads) ─────────────────────────
async function handlePplPayment(session: Stripe.Checkout.Session, m: Record<string, string>) {
  console.log('PPL payment for order:', m.order_id)
  try {
    await supabase
      .from('ppl_lead_orders')
      .update({ status: 'active', stripe_payment_intent_id: session.payment_intent as string })
      .eq('id', m.order_id)

    // Sync postcodes to company service areas if postcode-targeted
    const { data: orderData } = await supabase
      .from('ppl_lead_orders')
      .select('location_type, postcode_list')
      .eq('id', m.order_id)
      .maybeSingle()

    if (orderData?.location_type === 'postcodes' && orderData?.postcode_list) {
      const newPostcodes = orderData.postcode_list
        .split(/[\s,\n]+/).map((p: string) => p.trim()).filter(Boolean)
      const { data: companyData } = await supabase
        .from('companies').select('ppl_agreed_postcodes').eq('id', m.company_id).maybeSingle()
      const merged = [...new Set([...(companyData?.ppl_agreed_postcodes || []), ...newPostcodes])]
      await supabase.from('companies').update({ ppl_agreed_postcodes: merged }).eq('id', m.company_id)
    }

    if (!await hasTwilioNumber(m.company_id)) {
      await provisionTwilio(m.company_id)
      await supabase.from('ppl_lead_orders').update({ twilio_provisioned: true }).eq('id', m.order_id)
    }

    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 14)
    const { error: pplOrderError } = await supabase.from('ppl_orders').insert({
      company_id:  m.company_id,
      total_leads: parseInt(m.quantity),
      due_date:    dueDate.toISOString().split('T')[0],
      status:      'active',
      notes:       `${m.niche}${m.sub_niche ? ' › ' + m.sub_niche : ''} - ${m.area_city}`,
    })
    if (pplOrderError) console.error('ppl_orders insert error:', pplOrderError.message)

    const { data: company } = await supabase
      .from('companies').select('name, email, phone').eq('id', m.company_id).maybeSingle()

    const totalExGst = (parseFloat(m.price_per_lead) * parseInt(m.quantity)).toFixed(2)
    const locationDetail = m.location_type === 'statewide'
      ? `${m.area_city} - State Wide`
      : m.location_type === 'postcodes'
      ? `Postcodes - ${m.postcode_list || '(none)'}`
      : `${m.area_city} - ${m.radius_km || 50}km radius`

    await sendInternalEmail(
      `💰 PPL reorder - ${company?.name}`,
      `<h2 style="margin:0 0 16px">${company?.name} purchased a new lead pack.</h2>
       <table style="border-collapse:collapse;font-size:14px">
         <tr><td style="padding:4px 12px 4px 0;color:#666">Company</td><td><strong>${company?.name}</strong></td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#666">Email</td><td><a href="mailto:${company?.email}">${company?.email}</a></td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#666">Phone</td><td>${company?.phone || '-'}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#666">Niche</td><td>${emailNiche(m.niche)}${m.sub_niche ? ' › ' + m.sub_niche : ''}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#666">Location</td><td>${locationDetail}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#666">Quantity</td><td><strong>${m.quantity} leads</strong></td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#666">Price/lead</td><td>$${parseFloat(m.price_per_lead).toFixed(2)} AUD</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#666">Total (ex GST)</td><td><strong>$${totalExGst} AUD</strong></td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#666">Stripe session</td><td><a href="https://dashboard.stripe.com/payments/${session.payment_intent}">${session.id}</a></td></tr>
       </table>`
    )
    console.log('PPL order activated:', m.order_id)
  } catch (err) {
    console.error('handlePplPayment error:', err)
    await sendInternalEmail(
      `⚠️ PPL payment processing failed - order ${m.order_id}`,
      `<p>Error: ${String(err)}</p><p>Order ID: ${m.order_id}</p><p>Company ID: ${m.company_id}</p>`
    )
  }
}

// ── PPL signup (new company, first lead pack from website) ──────────────────
async function handlePplSignupPayment(session: Stripe.Checkout.Session, m: Record<string, string>) {
  console.log('PPL signup for:', m.email)
  try {
    // createUser triggers handle_new_user() which auto-creates a company + profile
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: m.email,
      email_confirm: true,
      user_metadata: { full_name: `${m.first_name} ${m.last_name}` },
    })
    if (authError) throw new Error(`Auth: ${authError.message}`)
    const userId = authData.user.id

    const { data: profileData, error: profileFetchError } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', userId)
      .single()
    if (profileFetchError) throw new Error(`Profile fetch: ${profileFetchError.message}`)
    const companyId = profileData.company_id

    const signupPostcodes = m.location_type === 'postcodes' && m.postcode_list
      ? m.postcode_list.split(/[\s,\n]+/).map((p: string) => p.trim()).filter(Boolean)
      : []

    const { error: companyError } = await supabase
      .from('companies')
      .update({
        name:               m.company,
        email:              m.email,
        phone:              m.phone,
        plan:               'ppl',
        status:             'active',
        stripe_customer_id: session.customer as string,
        niche:              m.niche || null,
        ...(signupPostcodes.length > 0 && { ppl_agreed_postcodes: signupPostcodes }),
      })
      .eq('id', companyId)
    if (companyError) throw new Error(`Company: ${companyError.message}`)

    // Bake system_prompt and welcome_message into the SMS agent config row
    // that was created by the DB trigger when the user was provisioned.
    if (m.company && m.niche) {
      const { system_prompt, welcome_message } = buildSmsPrompts(m.company, m.niche)
      const { data: agentCfg } = await supabase
        .from('sms_agent_config')
        .select('id')
        .eq('company_id', companyId)
        .maybeSingle()
      if (agentCfg) {
        await supabase
          .from('sms_agent_config')
          .update({ system_prompt, welcome_message })
          .eq('id', agentCfg.id)
      }
    }

    await supabase.from('profiles').upsert({
      id:         userId,
      company_id: companyId,
      full_name:  `${m.first_name} ${m.last_name}`,
      phone:      m.phone,
      role:       'owner',
      is_active:  true,
    })

    const { data: order, error: orderError } = await supabase
      .from('ppl_lead_orders')
      .insert({
        company_id:     companyId,
        niche:          m.niche,
        sub_niche:      m.sub_niche || null,
        area:           m.area_city,
        area_city:      m.area_city,
        location_type:  m.location_type || 'radius',
        radius_km:      (m.location_type === 'postcodes' || m.location_type === 'statewide') ? null : parseFloat(m.radius_km || '50'),
        postcode_list:  m.location_type === 'postcodes' ? m.postcode_list : null,
        quantity:       parseInt(m.quantity),
        price_per_lead: parseFloat(m.price_per_lead),
        total_amount:   parseFloat(m.price_per_lead) * parseInt(m.quantity),
        status:         'active',
        stripe_session_id:        session.id,
        stripe_payment_intent_id: session.payment_intent as string,
      })
      .select('id')
      .single()
    if (orderError) throw new Error(`ppl_lead_orders insert: ${orderError.message}`)

    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 14)
    const { error: pplOrderError } = await supabase.from('ppl_orders').insert({
      company_id:  companyId,
      total_leads: parseInt(m.quantity),
      due_date:    dueDate.toISOString().split('T')[0],
      status:      'active',
      notes:       `${m.niche}${m.sub_niche ? ' › ' + m.sub_niche : ''} - ${m.area_city}`,
    })
    if (pplOrderError) throw new Error(`ppl_orders insert: ${pplOrderError.message}`)

    await provisionTwilio(companyId)
    if (order) {
      await supabase.from('ppl_lead_orders').update({ twilio_provisioned: true }).eq('id', order.id)
    }

    const magicLink = await createMagicLink(m.email)

    const { error: linkError } = await supabase.from('pending_magic_links').insert({
      stripe_session_id: session.id,
      magic_link:        magicLink,
    })
    if (linkError) console.error('pending_magic_links insert failed:', linkError.message)

    await sendPplWelcomeEmail(m.email, m.first_name, m.company, m.niche, m.area_city, m.quantity, magicLink)

    // ── Full-detail internal notification ─────────────────────────────────────
    const totalExGst  = (parseFloat(m.price_per_lead) * parseInt(m.quantity)).toFixed(2)
    const totalIncGst = (parseFloat(m.price_per_lead) * parseInt(m.quantity) * 1.1).toFixed(2)
    const discountPct = parseFloat(m.discount_percent || '0')
    const locationDetail = m.location_type === 'statewide'
      ? `${m.area_city} - State Wide`
      : m.location_type === 'postcodes'
      ? `Postcodes - ${m.postcode_list || '(none supplied)'}`
      : `${m.area_city} - ${m.radius_km || 50}km radius`

    await sendInternalEmail(
      `💰 New PPL signup - ${m.company}`,
      `<h2 style="margin:0 0 16px">${m.company} signed up and paid for a lead pack.</h2>
       <table style="border-collapse:collapse;font-size:14px">
         <tr><td style="padding:4px 12px 4px 0;color:#666">Company</td><td><strong>${m.company}</strong></td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#666">Name</td><td>${m.first_name} ${m.last_name}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#666">Email</td><td><a href="mailto:${m.email}">${m.email}</a></td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#666">Phone</td><td>${m.phone}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#666">Niche</td><td>${emailNiche(m.niche)}${m.sub_niche ? ' › ' + m.sub_niche : ''}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#666">Location</td><td>${locationDetail}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#666">Quantity</td><td><strong>${m.quantity} leads</strong></td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#666">Price/lead</td><td>$${parseFloat(m.price_per_lead).toFixed(2)} AUD</td></tr>
         ${discountPct > 0 ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Volume discount</td><td>${discountPct}% off</td></tr>` : ''}
         <tr><td style="padding:4px 12px 4px 0;color:#666">Total (ex GST)</td><td><strong>$${totalExGst} AUD</strong></td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#666">Total (inc GST)</td><td>$${totalIncGst} AUD</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#666">Company ID</td><td><code>${companyId}</code></td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#666">Stripe session</td><td><a href="https://dashboard.stripe.com/payments/${session.payment_intent}">${session.id}</a></td></tr>
       </table>`
    )

    await supabase.from('signup_attempts').update({ status: 'completed' })
      .eq('stripe_session_id', session.id)

    console.log('PPL signup provisioned:', companyId)
  } catch (err) {
    console.error('handlePplSignupPayment error:', err)
    await sendInternalEmail(
      `⚠️ PPL signup provisioning failed - ${m.email}`,
      `<p><strong>Email:</strong> ${m.email}</p><p><strong>Stripe Session:</strong> ${session.id}</p><pre>${String(err)}</pre>`
    )
  }
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

async function sendPplWelcomeEmail(
  to: string, firstName: string, company: string,
  niche: string, city: string, quantity: string, magicLink: string
) {
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Lead Gen Rentals <onboarding@leadgenrentals.com.au>',
      to,
      subject: `You're in, ${firstName}. Your leads are on their way.`,
      html: `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f5f5f5;margin:0;padding:40px 20px">
        <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5">
          <div style="background:#0a0b0f;padding:28px 36px">
            <img src="https://leadgenrentals.com.au/leadgenrentals-logo-white.png" alt="Lead Gen Rentals" style="height:30px">
          </div>
          <div style="padding:36px">
            <h1 style="font-size:22px;font-weight:600;color:#0a0b0f;margin:0 0 8px">Your leads are on their way, ${firstName}.</h1>
            <p style="color:#666;font-size:15px;line-height:1.6;margin:0 0 28px">
              Your ${company} workspace is live and your first batch of ${quantity} ${niche === 'solar_battery' ? 'Solar + Battery' : niche} leads for ${city} will start arriving within 7–14 days.
            </p>
            <a href="${magicLink}" style="display:inline-block;background:#4797FF;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:500;margin-bottom:32px">
              Access My Dashboard →
            </a>
            <div style="background:#f8f9fb;border-radius:8px;padding:18px;margin-bottom:24px">
              <p style="font-size:13px;font-weight:600;color:#0a0b0f;margin:0 0 10px">What's ready:</p>
              <ul style="font-size:13px;color:#555;line-height:1.9;margin:0;padding-left:18px">
                <li>CRM and pipeline</li>
                <li>Order tracking and delivery status</li>
                <li>Quote templates</li>
              </ul>
            </div>
            <p style="font-size:12px;color:#999;margin:24px 0 0;line-height:1.6">
              Questions? Reply to this email or reach us on WhatsApp.<br>
              This login link expires in 24 hours.
            </p>
          </div>
        </div>
      </body></html>`,
    }),
  })
  if (!emailRes.ok) {
    const errBody = await emailRes.text()
    throw new Error(`Resend error ${emailRes.status}: ${errBody}`)
  }
}

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
