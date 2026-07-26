import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14'

const stripe = new Stripe(Deno.env.get('STRIPE_API_KEY')!, { apiVersion: '2024-04-10' })
const PRICE_ID = Deno.env.get('STRIPE_PRICE_MANAGED')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const formData = await req.json()

    // Stripe metadata values must be strings under 500 chars
    const metadata: Record<string, string> = {}
    for (const [key, value] of Object.entries(formData)) {
      if (value !== null && value !== undefined) {
        const str = Array.isArray(value) ? value.join(', ') : String(value)
        metadata[key] = str.slice(0, 500)
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      customer_email: formData.email,
      metadata,
      success_url: 'https://leadgenrentals.com.au/payment-success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://leadgenrentals.com.au/get-started?cancelled=true',
      allow_promotion_codes: true,
    })

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('create-checkout error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
