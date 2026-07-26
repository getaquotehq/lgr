// SMS credit top-up checkout for authenticated dashboard users.
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

// Credit packs - cents (AUD ex-GST)
const PACKS: Record<string, { credits: number; cents: number; label: string }> = {
  '100':  { credits: 100,  cents:  1000, label: '100 SMS Credits'   },
  '500':  { credits: 500,  cents:  4500, label: '500 SMS Credits'   },
  '1000': { credits: 1000, cents:  8000, label: '1,000 SMS Credits' },
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401 })

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return new Response('Unauthorized', { status: 401 })

    const { pack } = await req.json()
    if (!PACKS[pack]) throw new Error(`Invalid pack: ${pack}. Choose 100, 500, or 1000.`)

    const { data: profile } = await supabase
      .from('profiles').select('company_id').eq('id', user.id).maybeSingle()
    if (!profile?.company_id) return new Response('Company not found', { status: 404 })

    const { data: company } = await supabase
      .from('companies').select('name, email, stripe_customer_id').eq('id', profile.company_id).maybeSingle()
    if (!company) return new Response('Company not found', { status: 404 })

    const chosen = PACKS[pack]

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      ...(company.stripe_customer_id
        ? { customer: company.stripe_customer_id }
        : { customer_email: company.email }),
      line_items: [{
        price_data: {
          currency: 'aud',
          unit_amount: chosen.cents,
          product_data: {
            name: chosen.label,
            description: `${chosen.credits} SMS credits added to your Lead Gen Rentals account. Each inbound and outbound SMS uses 1 credit.`,
          },
        },
        quantity: 1,
        tax_rates: [Deno.env.get('STRIPE_TAX_RATE_GST')!],
      }],
      metadata: {
        type:       'sms_credits',
        company_id: profile.company_id,
        credits:    String(chosen.credits),
      },
      success_url: 'https://leadgenrentals.com.au/dashboard?sms_credits_success=true',
      cancel_url:  'https://leadgenrentals.com.au/dashboard',
    })

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('create-sms-credits-checkout error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
