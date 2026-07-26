// One-time magic link retrieval keyed by Stripe session ID.
// Called by the /welcome page on leadgenrentals.com.au while it polls after payment.
// Returns { url } when ready, { pending: true } if the webhook hasn't fired yet,
// or { error } if the session is unknown / expired.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url       = new URL(req.url)
  const sessionId = url.searchParams.get('session_id')

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'Missing session_id' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data, error } = await supabase
    .from('pending_magic_links')
    .select('magic_link, expires_at')
    .eq('stripe_session_id', sessionId)
    .maybeSingle()

  if (error) {
    return new Response(JSON.stringify({ error: 'Lookup failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Webhook hasn't fired yet - tell client to keep polling
  if (!data) {
    return new Response(JSON.stringify({ pending: true }), {
      status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Expired
  if (new Date(data.expires_at) < new Date()) {
    await supabase.from('pending_magic_links').delete().eq('stripe_session_id', sessionId)
    return new Response(JSON.stringify({ error: 'Link expired - check your email.' }), {
      status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // One-time use - delete after retrieval
  await supabase.from('pending_magic_links').delete().eq('stripe_session_id', sessionId)

  return new Response(JSON.stringify({ url: data.magic_link }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
