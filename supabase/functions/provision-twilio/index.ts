import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN')!
const ADDRESS_SID = Deno.env.get('TWILIO_ADDRESS_SID')!
const BUNDLE_SID  = Deno.env.get('TWILIO_BUNDLE_SID')!
const SMS_WEBHOOK = '__LGR_HQ_SUPABASE_URL__/functions/v1/twilio-inbound-sms'
const CREDS       = btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`)

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
    // Search AU mobile first, fall back to local
    let phoneNumber: string | null = null
    for (const type of ['Mobile', 'Local']) {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/AvailablePhoneNumbers/AU/${type}.json?SmsEnabled=true&Limit=1`,
        { headers: { Authorization: `Basic ${CREDS}` } }
      )
      const data = await res.json()
      phoneNumber = data.available_phone_numbers?.[0]?.phone_number || null
      if (phoneNumber) break
    }

    if (!phoneNumber) throw new Error('No AU numbers available')

    // Purchase with regulatory compliance params
    const buyRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/IncomingPhoneNumbers.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${CREDS}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          PhoneNumber: phoneNumber,
          SmsUrl: SMS_WEBHOOK,
          SmsMethod: 'POST',
          AddressSid: ADDRESS_SID,
          BundleSid: BUNDLE_SID,
        }).toString(),
      }
    )
    const bought = await buyRes.json()
    if (!bought.phone_number) throw new Error(`Purchase failed: ${JSON.stringify(bought)}`)

    // Save to twilio_numbers
    await supabase.from('twilio_numbers').insert({
      company_id,
      phone_number: bought.phone_number,
      friendly_name: 'Lead Gen Rentals SMS',
      twilio_sid: bought.sid,
    })

    // Enable AI agent
    await supabase
      .from('sms_agent_config')
      .update({
        twilio_number: bought.phone_number,
        is_active: true,
        auto_reply: true,
        auto_send_welcome: true,
      })
      .eq('company_id', company_id)

    console.log('Provisioned:', bought.phone_number, 'for company:', company_id)

    return new Response(
      JSON.stringify({ success: true, phone_number: bought.phone_number }),
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
