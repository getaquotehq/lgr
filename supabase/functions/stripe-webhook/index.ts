// ============================================================================
// stripe-webhook — turns a paid Stripe Checkout into a live LGR rental.
//
// Wire this endpoint up in the Stripe Dashboard (Developers → Webhooks) against
//   https://<project>.supabase.co/functions/v1/stripe-webhook
// and subscribe it to:
//   • checkout.session.completed        → activate the rental
//   • customer.subscription.deleted     → release the asset (cancel / lapse)
// The signing secret Stripe gives you goes in the STRIPE_WEBHOOK_SECRET secret.
//
// On checkout.session.completed (metadata.type === 'asset_rental') we call the
// activate_rental() RPC, which creates/updates the installer, marks the asset
// rented and opens a rentals history row — so the payment shows up in Mission
// Control automatically. The RPC is idempotent, so Stripe retries are safe.
//
// Secrets:
//   STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET  (required)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
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
    // Log but 200 the ack so Stripe doesn't hammer retries on a transient error.
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
  })
  if (error) throw new Error(`activate_rental: ${error.message}`)

  // flip the checkout attempt to paid (best-effort)
  await supabase.from('rental_checkouts')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
    })
    .eq('stripe_session_id', session.id)

  console.log('Rental activated:', JSON.stringify(data))
}
