// New-company PPL signup checkout.
// Called from leadgenrentals.com.au - no auth required.
// Company + user are created by the stripe-webhook on payment completion.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14'

const stripe = new Stripe(Deno.env.get('STRIPE_API_KEY')!, { apiVersion: '2024-04-10' })
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Resolve price: sub_niche+area → sub_niche default → parent area → parent default
async function resolvePrice(niche: string, subNiche: string | null, area: string) {
  const { data: rows } = await supabase
    .from('ppl_pricing')
    .select('price_per_lead, sub_niche, area, max_order_qty')
    .eq('niche', niche)

  if (!rows?.length) return null

  const match = (sn: string | null, a: string | null) =>
    rows.find(r =>
      (sn === null ? !r.sub_niche : r.sub_niche === sn) &&
      (a  === null ? !r.area      : r.area?.toLowerCase() === a.toLowerCase())
    ) ?? null

  return (
    (subNiche ? match(subNiche, area) : null) ??
    (subNiche ? match(subNiche, null) : null) ??
    match(null, area) ??
    match(null, null)
  )
}

// Fire internal notification via the notify-internal edge function
// Internal ops emails show solar_battery as solar_and_battery
function emailNiche(niche: string | null | undefined): string {
  return niche === 'solar_battery' ? 'solar_and_battery' : (niche || '')
}

async function notifyCheckoutStarted(data: {
  first_name: string; last_name: string; email: string; phone: string
  company: string; niche: string; sub_niche: string | null; area_city: string
  location_type: string; radius_km: number; postcode_list: string
  quantity: number; price_per_lead: number; discount_percent: number
  stripe_session_id: string
}) {
  const totalExGst  = (data.price_per_lead * data.quantity).toFixed(2)
  const totalIncGst = (data.price_per_lead * data.quantity * 1.1).toFixed(2)
  const locationDetail = data.location_type === 'statewide'
    ? `${data.area_city} - State Wide`
    : data.location_type === 'postcodes'
    ? `Postcodes - ${data.postcode_list || '(none)'}`
    : `${data.area_city} - ${data.radius_km}km radius`

  const subject = `🛒 Checkout started - ${data.company} (${data.email})`
  const body = `
    <h2 style="margin:0 0 16px">${data.company} started a PPL checkout - not yet paid.</h2>
    <table style="border-collapse:collapse;font-size:14px">
      <tr><td style="padding:4px 12px 4px 0;color:#666">Company</td><td><strong>${data.company}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Name</td><td>${data.first_name} ${data.last_name}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Email</td><td><a href="mailto:${data.email}">${data.email}</a></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Phone</td><td>${data.phone}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Niche</td><td>${emailNiche(data.niche)}${data.sub_niche ? ' › ' + data.sub_niche : ''}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Location</td><td>${locationDetail}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Quantity</td><td><strong>${data.quantity} leads</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Price/lead</td><td>$${data.price_per_lead.toFixed(2)} AUD</td></tr>
      ${data.discount_percent > 0 ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Volume discount</td><td>${data.discount_percent}% off</td></tr>` : ''}
      <tr><td style="padding:4px 12px 4px 0;color:#666">Total (ex GST)</td><td><strong>$${totalExGst} AUD</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Total (inc GST)</td><td>$${totalIncGst} AUD</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Stripe session</td><td><code>${data.stripe_session_id}</code></td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:#888">Payment has not been received yet. A second notification will fire on completion.</p>
  `

  // Call the notify-internal edge function in the same Supabase project
  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-internal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ subject, body }),
  }).catch(err => console.error('notifyCheckoutStarted error (non-fatal):', err))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const {
      first_name,
      last_name,
      email,
      phone,
      company,
      niche,
      sub_niche,
      area_city,
      location_type,
      radius_km,
      postcode_list,
      quantity,
    } = await req.json()

    if (!first_name || !last_name || !email || !phone || !company || !niche || !area_city || !quantity) {
      throw new Error('Missing required fields')
    }
    if (Number(quantity) < 25) {
      throw new Error('Minimum order is 25 leads')
    }

    const normNiche    = (niche as string).toLowerCase().trim().replace(/-/g, '_')
    const normSubNiche = sub_niche ? (sub_niche as string).toLowerCase().trim().replace(/-/g, '_') : null

    // Validate price from DB - never trust client
    const pricing = await resolvePrice(normNiche, normSubNiche, area_city)
    if (!pricing) throw new Error(`No pricing configured for niche: ${normNiche}`)

    const validatedPrice = pricing.price_per_lead

    // Enforce per-order volume cap for this niche/area (null = unlimited, hard ceiling 500)
    const orderCap = Math.min(pricing.max_order_qty ?? 500, 500)
    if (Number(quantity) > orderCap) {
      throw new Error(`Maximum order for this area is ${orderCap} leads`)
    }

    // Derive discount server-side - never trust a client-supplied value
    const { data: tierRows } = await supabase
      .from('volume_discount_tiers')
      .select('min_quantity, discount_percent')
      .eq('active', true)
      .lte('min_quantity', quantity)
      .order('min_quantity', { ascending: false })
      .limit(1)

    const discountPercent = tierRows?.[0]?.discount_percent ?? 0
    const totalCents = Math.round(validatedPrice * quantity * (1 - discountPercent / 100) * 100)

    // Capture signup attempt before redirecting
    const { data: attempt } = await supabase
      .from('signup_attempts')
      .insert({
        type: 'ppl_signup',
        first_name, last_name, email, phone, company,
        niche: normNiche,
        sub_niche: normSubNiche,
        area_city,
        quantity,
        price_per_lead: validatedPrice,
        status: 'pending',
      })
      .select('id')
      .single()

    const locationDesc = location_type === 'statewide'
      ? `${area_city} - State Wide coverage`
      : location_type === 'postcodes'
      ? `Postcodes: ${(postcode_list || '').replace(/\s+/g, ', ').slice(0, 200)}`
      : `${area_city} - ${radius_km ?? 50}km radius`

    const nicheDisplay = [normNiche, normSubNiche]
      .filter(Boolean)
      .map(s => s!.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '))
      .join(' › ')

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'aud',
          unit_amount: totalCents,
          product_data: {
            name: `${quantity} ${nicheDisplay} leads`,
            description: `${locationDesc}. Exclusive leads delivered in real-time to your pipeline.`,
          },
        },
        quantity: 1,
        tax_rates: [Deno.env.get('STRIPE_TAX_RATE_GST')!],
      }],
      metadata: {
        type:          'ppl_signup',
        first_name,
        last_name,
        email,
        phone,
        company,
        niche:         normNiche,
        sub_niche:     normSubNiche || '',
        area_city,
        location_type: location_type || 'radius',
        radius_km:     String(radius_km ?? 50),
        postcode_list: postcode_list || '',
        quantity:         String(quantity),
        price_per_lead:   String(validatedPrice),
        discount_percent: String(discountPercent),
      },
      success_url: 'https://leadgenrentals.com.au/welcome?session_id={CHECKOUT_SESSION_ID}&type=ppl',
      cancel_url:  'https://leadgenrentals.com.au/buy-leads?cancelled=true',
    })

    if (attempt?.id) {
      await supabase.from('signup_attempts').update({ stripe_session_id: session.id }).eq('id', attempt.id)
    }

    // Fire-and-forget: notify the team that a checkout session has been created
    notifyCheckoutStarted({
      first_name, last_name, email, phone, company,
      niche: normNiche, sub_niche: normSubNiche,
      area_city,
      location_type: location_type || 'radius',
      radius_km: radius_km ?? 50,
      postcode_list: postcode_list || '',
      quantity,
      price_per_lead: validatedPrice,
      discount_percent: discountPercent,
      stripe_session_id: session.id,
    })

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('create-ppl-signup-checkout error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
