import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!

serve(async (req) => {
  const { subject, body } = await req.json()

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Lead Gen Rentals System <system@leadgenrentals.com.au>',
      to: 'contact@leadgenrentals.com.au',
      subject,
      html: body,
    }),
  })

  return new Response('OK', { status: 200 })
})
