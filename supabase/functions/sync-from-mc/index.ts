import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Normalise an AU number to E.164 (+61…) so bulk-SMS recipients match the way
// leads are stored here (twilio-inbound writes E.164 too).
function normalisePhone(raw: string): string | null {
  let p = (raw || '').replace(/[\s\-().]/g, '')
  if (p.startsWith('0') && p.length === 10) p = '+61' + p.slice(1)
  else if (p.startsWith('614') && p.length === 11) p = '+' + p
  else if (p.startsWith('61') && !p.startsWith('+') && p.length === 11) p = '+' + p
  return p || null
}

// action: disable_ai — a bulk SMS was sent from ql-mc to these leads. Turn the
// AI SMS agent OFF for each of them on the agency (super-admin) company so it
// never auto-replies to their responses. Leads that don't exist in ql-hq yet
// are created up-front with ai_enabled=false, otherwise twilio-inbound would
// create them with ai_enabled=true on their first reply and the AI would fire.
// deno-lint-ignore no-explicit-any
async function handleDisableAi(supabase: any, body: any) {
  // Accept either [{phone,name}] objects or bare phone strings.
  const rawLeads: Array<{ phone?: string; name?: string } | string> =
    Array.isArray(body.leads) ? body.leads
    : Array.isArray(body.phones) ? body.phones
    : body.phone ? [body.phone] : []

  // Map normalised E.164 phone -> best-known name (first non-empty wins).
  const byPhone = new Map<string, string>()
  for (const item of rawLeads) {
    const rawPhone = typeof item === 'string' ? item : item?.phone
    const name = typeof item === 'string' ? '' : (item?.name || '')
    const norm = normalisePhone(rawPhone || '')
    if (!norm) continue
    if (!byPhone.has(norm) || (!byPhone.get(norm) && name)) byPhone.set(norm, (name || '').trim())
  }
  const phones = [...byPhone.keys()]
  if (!phones.length) return json({ error: 'leads (with phone) is required' }, 400)

  // The agency's leads live under the one super-admin company (the tenant tied
  // to a profiles.is_admin=true user) — the only place the AI SMS agent runs.
  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('is_admin', true)
    .not('company_id', 'is', null)
    .limit(1)
    .maybeSingle()
  const superId = adminProfile?.company_id
  if (!superId) return json({ error: 'super-admin company not found' }, 404)

  // Older leads may store the phone without the + or in AU local format, so
  // match every plausible variant when disabling AI on existing rows.
  const candidates = new Set<string>()
  for (const p of phones) {
    candidates.add(p)
    candidates.add(p.replace(/^\+/, ''))
    if (p.startsWith('+61')) candidates.add('0' + p.slice(3))
  }

  const { data: updated, error: updErr } = await supabase
    .from('leads')
    .update({ ai_enabled: false, updated_at: new Date().toISOString() })
    .eq('company_id', superId)
    .in('phone', [...candidates])
    .select('phone')
  if (updErr) throw updErr

  const matched = new Set<string>()
  for (const row of updated || []) {
    const n = normalisePhone(row.phone as string)
    if (n) matched.add(n)
  }

  const toCreate = phones.filter((p) => !matched.has(p))
  let created = 0
  if (toCreate.length) {
    const rows = toCreate.map((p) => {
      const full = (byPhone.get(p) || '').trim()
      const first = full ? full.split(/\s+/)[0] : 'SMS Lead'
      return {
        company_id: superId,
        first_name: first,
        name: full || 'SMS Lead',
        phone: p,
        source: 'bulk_sms',
        pipeline_stage: 'new_lead',
        ai_enabled: false,
        ai_score: 0,
        ai_score_reason: 'AI disabled - contacted via bulk SMS',
      }
    })
    const { error: insErr } = await supabase.from('leads').insert(rows)
    if (insErr) throw insErr
    created = rows.length
  }

  return json({ ok: true, disabled: (updated || []).length, created })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const apiSecret = Deno.env.get('QL_MC_API_SECRET')
  const provided  = req.headers.get('x-api-secret')
  if (!apiSecret || !provided || provided !== apiSecret) {
    return json({ error: 'unauthorized' }, 401)
  }

  try {
    const body = await req.json()
    const { action, ql_hq_company_id, email, sms_number, webhook_url, postcodes } = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── action: disable_ai ──────────────────────────────────────────────────
    // Resolves the super-admin company server-side, so no ql_hq_company_id.
    if (action === 'disable_ai') {
      return await handleDisableAi(supabase, body)
    }

    if (!ql_hq_company_id || typeof ql_hq_company_id !== 'string' || !ql_hq_company_id.trim()) {
      return json({ error: 'ql_hq_company_id is required' }, 400)
    }

    const companyId = ql_hq_company_id.trim()

    // ── action: scrub ─────────────────────────────────────────────────────────
    // A lead was scrubbed in ql-mc - pull the delivered count back by one on the
    // most relevant order. We mirror this onto BOTH order tables independently:
    //   • ppl_orders.delivered_leads      (admin fulfillment tracker)
    //   • ppl_lead_orders.delivered_count (client dashboard order)
    // Each is guarded: if that table has no matching row for the company, it's
    // skipped silently so nothing breaks. Prefer the oldest active order, fall
    // back to the most recently completed/fulfilled one (in case the scrub tips
    // it back under the threshold and should reopen).
    if (action === 'scrub') {
      // ── ppl_orders (admin) ──────────────────────────────────────────────────
      let { data: order } = await supabase
        .from('ppl_orders')
        .select('id, delivered_leads, total_leads, status')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('purchased_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (!order) {
        const { data: completed } = await supabase
          .from('ppl_orders')
          .select('id, delivered_leads, total_leads, status')
          .eq('company_id', companyId)
          .eq('status', 'completed')
          .order('purchased_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        order = completed
      }

      let delivered_leads: number | null = null
      if (order) {
        const newDelivered = Math.max(0, order.delivered_leads - 1)
        // If we're pulling back below total, reopen a completed order
        const newStatus = order.status === 'completed' && newDelivered < order.total_leads
          ? 'active'
          : order.status
        await supabase
          .from('ppl_orders')
          .update({ delivered_leads: newDelivered, status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', order.id)
        delivered_leads = newDelivered
      }

      // ── ppl_lead_orders (client dashboard) - independent + guarded ──────────
      let { data: leadOrder } = await supabase
        .from('ppl_lead_orders')
        .select('id, delivered_count, quantity, status')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (!leadOrder) {
        const { data: fulfilled } = await supabase
          .from('ppl_lead_orders')
          .select('id, delivered_count, quantity, status')
          .eq('company_id', companyId)
          .eq('status', 'fulfilled')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        leadOrder = fulfilled
      }

      let delivered_count: number | null = null
      if (leadOrder) {
        const newCount = Math.max(0, leadOrder.delivered_count - 1)
        // If we're pulling back below quantity, reopen a fulfilled order
        const newStatus = leadOrder.status === 'fulfilled' && newCount < leadOrder.quantity
          ? 'active'
          : leadOrder.status
        await supabase
          .from('ppl_lead_orders')
          .update({ delivered_count: newCount, status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', leadOrder.id)
        delivered_count = newCount
      }

      // ── flag the exact lead as scrubbed (blocks any future dispute) ─────────
      // Matched by phone + name + company, all exact (phone E.164-normalised,
      // name trimmed case-insensitive). Most recent un-flagged match wins.
      let lead_flagged: string | null = null
      const leadIdent = (body as { lead?: { name?: string | null; phone?: string | null } }).lead
      if (leadIdent?.phone && leadIdent?.name) {
        const wantPhone = normalisePhone(leadIdent.phone)
        const wantName  = leadIdent.name.trim().toLowerCase()
        const { data: hqLeads } = await supabase
          .from('leads')
          .select('id, name, phone, ppl_scrubbed')
          .eq('company_id', companyId)
          .eq('is_ppl', true)
          .eq('ppl_scrubbed', false)
          .order('created_at', { ascending: false })
          .limit(200)
        const hqMatch = (hqLeads || []).find((l: { name?: string | null; phone?: string | null }) =>
          normalisePhone((l.phone as string) || '') === wantPhone &&
          ((l.name as string) || '').trim().toLowerCase() === wantName,
        )
        if (hqMatch) {
          await supabase
            .from('leads')
            .update({ ppl_scrubbed: true, updated_at: new Date().toISOString() })
            .eq('id', (hqMatch as { id: string }).id)
          lead_flagged = (hqMatch as { id: string }).id
        }
      }

      return json({ ok: true, delivered_leads, delivered_count, lead_flagged })
    }

    // ── default action: sync delivery config + postcodes ─────────────────────
    const { data: company, error: readErr } = await supabase
      .from('companies')
      .select('settings')
      .eq('id', companyId)
      .maybeSingle()

    if (readErr) throw readErr
    if (!company) return json({ error: 'company not found' }, 404)

    const updates: Record<string, unknown> = {
      settings: {
        ...(company.settings || {}),
        lead_delivery: {
          email:       email       ?? null,
          sms_number:  sms_number  ?? null,
          webhook_url: webhook_url ?? null,
        },
      },
    }

    if (Array.isArray(postcodes)) {
      updates.ppl_agreed_postcodes = (postcodes as unknown[])
        .map((p) => String(p).trim().toUpperCase())
        .filter(Boolean)
    }

    const { error: updateErr } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', companyId)

    if (updateErr) throw updateErr

    return json({ ok: true })
  } catch (err) {
    console.error('sync-from-mc error:', err)
    return json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500)
  }
})
