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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const {
      company_id,
      niche,
      sub_niche,
      area_city,
      location_type,
      radius_km,
      postcode_list,
      quantity,
    } = await req.json()

    if (!company_id || !niche || !area_city || !quantity) {
      throw new Error('Missing required fields: company_id, niche, area_city, quantity')
    }
    if (Number(quantity) < 25) {
      throw new Error('Minimum order is 25 leads')
    }

    const normNiche    = (niche as string).toLowerCase().trim().replace(/-/g, '_')
    const normSubNiche = sub_niche ? (sub_niche as string).toLowerCase().trim().replace(/-/g, '_') : null

    // Always validate price from DB - never trust client.
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

    const { data: company } = await supabase
      .from('companies')
      .select('email, name')
      .eq('id', company_id)
      .maybeSingle()

    if (!company) throw new Error('Company not found')

    const locationDesc = location_type === 'statewide'
      ? `${area_city} - State Wide coverage`
      : location_type === 'postcodes'
      ? `Postcodes: ${(postcode_list || '').replace(/\s+/g, ', ').slice(0, 200)}`
      : `${area_city} - ${radius_km ?? 50}km radius`

    const nicheDisplay = [normNiche, normSubNiche]
      .filter(Boolean)
      .map(s => s!.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '))
      .join(' › ')

    // Create pending order
    const { data: order, error: orderErr } = await supabase
      .from('ppl_lead_orders')
      .insert({
        company_id,
        niche: normNiche,
        sub_niche: normSubNiche,
        area: area_city,
        area_city,
        location_type: location_type || 'radius',
        radius_km: (location_type === 'postcodes' || location_type === 'statewide') ? null : (radius_km ?? 50),
        postcode_list: location_type === 'postcodes' ? postcode_list : null,
        quantity,
        price_per_lead: validatedPrice,
        total_amount: validatedPrice * quantity * (1 - discountPercent / 100),
        status: 'pending',
      })
      .select('id')
      .single()

    if (orderErr) throw new Error(`Order creation failed: ${orderErr.message}`)

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      ...(company.email ? { customer_email: company.email } : {}),
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
        type: 'ppl',
        company_id,
        order_id:         order!.id,
        niche:            normNiche,
        sub_niche:        normSubNiche || '',
        area_city,
        location_type:    location_type || 'radius',
        radius_km:        String(radius_km ?? 50),
        quantity:         String(quantity),
        price_per_lead:   String(validatedPrice),
        discount_percent: String(discountPercent),
      },
      success_url: 'https://leadgenrentals.com.au/dashboard/?ppl_success=true',
      cancel_url:  'https://leadgenrentals.com.au/dashboard/?ppl_cancelled=true',
    })

    await supabase
      .from('ppl_lead_orders')
      .update({ stripe_session_id: session.id })
      .eq('id', order!.id)

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('create-ppl-checkout error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
