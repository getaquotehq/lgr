// Public endpoint - returns PPL price for a given niche + optional sub_niche + optional area.
// GET ?niche=hvac&sub_niche=split_ducted&area=Brisbane  → { price_per_lead, discount_tiers }
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url      = new URL(req.url)
  const niche    = url.searchParams.get('niche')?.toLowerCase().trim().replace(/-/g, '_')
  const subNiche = url.searchParams.get('sub_niche')?.toLowerCase().trim().replace(/-/g, '_') || null
  const area     = url.searchParams.get('area')?.toLowerCase().trim() || null

  if (!niche) {
    return new Response(
      JSON.stringify({ error: 'niche is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Pricing resolution order:
  // 1. (niche, sub_niche, area)  - most specific
  // 2. (niche, sub_niche, null)  - sub-niche default
  // 3. (niche, null,      area)  - parent niche, area-specific
  // 4. (niche, null,      null)  - parent niche default (fallback)

  const { data: rows, error } = await supabase
    .from('ppl_pricing')
    .select('price_per_lead, sub_niche, area, sold_out, max_order_qty')
    .eq('niche', niche)

  if (error) {
    console.error('ppl_pricing query error:', JSON.stringify(error))
    return new Response(
      JSON.stringify({ error: 'DB error', detail: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!rows || rows.length === 0) {
    return new Response(
      JSON.stringify({ error: `No pricing found for niche: ${niche}` }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const match = (sn: string | null, a: string | null) =>
    rows.find(r =>
      (sn === null ? !r.sub_niche : r.sub_niche === sn) &&
      (a  === null ? !r.area      : r.area?.toLowerCase().trim() === a)
    ) ?? null

  const pricing =
    (subNiche && area ? match(subNiche, area) : null) ??
    (subNiche        ? match(subNiche, null)  : null) ??
    (area            ? match(null, area)      : null) ??
    match(null, null)

  if (!pricing) {
    return new Response(
      JSON.stringify({ error: `No pricing found for niche: ${niche}` }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { data: tiers } = await supabase
    .from('volume_discount_tiers')
    .select('min_quantity, discount_percent, label, is_popular')
    .eq('active', true)
    .order('sort_order')

  return new Response(
    JSON.stringify({
      price_per_lead: pricing.price_per_lead,
      sold_out: pricing.sold_out === true,
      max_order_qty: pricing.max_order_qty ?? null,
      discount_tiers: tiers || [],
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
