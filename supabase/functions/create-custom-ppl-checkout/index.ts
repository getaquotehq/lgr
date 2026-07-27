// create-custom-ppl-checkout - SUPER-ADMIN ONLY.
//
// Generates a one-off Stripe Checkout link for a PPL order at an admin-set
// price (used to give a specific client a custom/lower rate than the DB price).
// Mirrors create-ppl-checkout exactly EXCEPT the price is supplied by the
// authenticated super-admin instead of being resolved from ppl_pricing. The
// resulting session carries the same metadata (type=ppl, order_id, …), so the
// existing stripe-webhook provisions and syncs it identically - no other
// change needed downstream.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14'

const stripe = new Stripe(Deno.env.get('STRIPE_API_KEY')!, { apiVersion: '2024-04-10' })
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ── Super-admin auth (same pattern as impersonate-user) ──────────────────
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'Missing Authorization header' }, 401)

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Not authenticated' }, 401)

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.is_admin) return json({ error: 'Forbidden: admin access required' }, 403)

    // ── Input ─────────────────────────────────────────────────────────────────
    const {
      company_id,
      niche,
      sub_niche,
      area_city,
      location_type,
      radius_km,
      postcode_list,
      quantity,
      price_per_lead,
      discount_percent,
    } = await req.json()

    if (!company_id || !niche || !area_city || !quantity || price_per_lead == null) {
      throw new Error('Missing required fields: company_id, niche, area_city, quantity, price_per_lead')
    }

    const qty       = Number(quantity)
    const price      = Number(price_per_lead)
    const discountPct = Math.min(100, Math.max(0, Number(discount_percent) || 0))
    if (!Number.isFinite(qty) || qty < 1) throw new Error('quantity must be a positive number')
    if (!Number.isFinite(price) || price <= 0) throw new Error('price_per_lead must be a positive number')

    const normNiche    = (niche as string).toLowerCase().trim().replace(/-/g, '_')
    const normSubNiche = sub_niche ? (sub_niche as string).toLowerCase().trim().replace(/-/g, '_') : null

    const totalCents = Math.round(price * qty * (1 - discountPct / 100) * 100)
    if (totalCents < 1) throw new Error('Computed total is zero')

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

    // Pending order at the CUSTOM price.
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
        quantity: qty,
        price_per_lead: price,
        total_amount: price * qty * (1 - discountPct / 100),
        status: 'pending',
        custom_link: true,
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
            name: `${qty} ${nicheDisplay} leads`,
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
        quantity:         String(qty),
        price_per_lead:   String(price),
        discount_percent: String(discountPct),
      },
      success_url: 'https://leadgenrentals.com.au/dashboard/dashboard.html?ppl_success=true',
      cancel_url:  'https://leadgenrentals.com.au/dashboard/dashboard.html?ppl_cancelled=true',
    })

    await supabase
      .from('ppl_lead_orders')
      .update({ stripe_session_id: session.id, checkout_url: session.url })
      .eq('id', order!.id)

    return json({ url: session.url, order_id: order!.id })
  } catch (err) {
    console.error('create-custom-ppl-checkout error:', err)
    return json({ error: String(err) }, 500)
  }
})
