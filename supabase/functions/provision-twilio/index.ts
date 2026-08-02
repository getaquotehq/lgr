import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Every Lead Gen Rentals company shares a single Twilio number instead of
// each getting a dedicated one purchased from Twilio's inventory. The number
// is admin-configurable (platform_settings.shared_twilio_number, set from
// /admin -> Shared SMS Number) so it can be changed without a code deploy -
// nothing here is hardcoded.
// Conversation ownership for inbound replies is resolved per-message by
// twilio-inbound-sms, matching the lead's phone number against each
// company's own leads - never by which company "owns" the number.
async function getSharedTwilioNumber(): Promise<string | null> {
  const { data } = await supabase
    .from('platform_settings')
    .select('shared_twilio_number')
    .eq('id', 1)
    .maybeSingle()
  return data?.shared_twilio_number || Deno.env.get('SHARED_TWILIO_NUMBER') || null
}

serve(async (req) => {
  const { company_id } = await req.json()
  if (!company_id) return new Response('Missing company_id', { status: 400 })

  // Skip if already provisioned
  const { data: existing } = await supabase
    .from('twilio_numbers')
    .select('id, phone_number')
    .eq('company_id', company_id)
    .maybeSingle()

  if (existing) {
    return new Response(
      JSON.stringify({ already_provisioned: true, phone_number: existing.phone_number }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const phoneNumber = await getSharedTwilioNumber()
    if (!phoneNumber) {
      return new Response(
        JSON.stringify({ error: 'Shared Twilio number not configured. Set it in /admin (Shared SMS Number) first.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Assign the shared number - nothing to buy from Twilio, it's already
    // purchased and wired to the inbound webhook. Deliberately no
    // twilio_sid stored: admin's "delete number" action releases a number on
    // Twilio when it has a sid, and this number must never be released while
    // other companies are still assigned to it.
    const { error: insertErr } = await supabase.from('twilio_numbers').insert({
      company_id,
      phone_number: phoneNumber,
      friendly_name: 'Lead Gen Rentals SMS (shared number)',
    })
    if (insertErr) throw new Error(`twilio_numbers insert: ${insertErr.message}`)

    // Enable AI agent
    await supabase
      .from('sms_agent_config')
      .update({
        twilio_number: phoneNumber,
        is_active: true,
        auto_reply: true,
        auto_send_welcome: true,
      })
      .eq('company_id', company_id)

    console.log('Provisioned shared number:', phoneNumber, 'for company:', company_id)

    return new Response(
      JSON.stringify({ success: true, phone_number: phoneNumber }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('provision-twilio error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
