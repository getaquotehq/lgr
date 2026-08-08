-- ============================================================================
-- Three lead-quality fixes.
--
--   1. insert_lead(): dedup per INSTALLER, not per asset.
--   2. enforce_lead_cooldown() / record_lead_submission(): stop a shared IP
--      locking out genuine homeowners.
--   3. release_pending_lead() + pending_lead_candidates(): let a held lead
--      actually be released to an installer. Manual only, by design.
-- ============================================================================


-- ── 1. Dedup per installer ──────────────────────────────────────────────────
-- The old key was (asset_id, installer_id, phone). Every brand is a separate
-- asset, so one homeowner filling in au + clear + premium produced three
-- non-duplicate leads. When the same installer rents across those brands they
-- were delivered - and charged for - the same person up to three times inside
-- the 30-day window. Dropping asset_id from the key makes "already had this
-- person recently" mean what an installer would expect it to mean.
--
-- create or replace (never drop/create): replace preserves the grants, and this
-- function's whole exposure story depends on them - see 20260808000000. The
-- authorisation guard from that migration is carried forward verbatim below.
create or replace function public.insert_lead(
  p_asset_id uuid,
  p_full_name text,
  p_phone text,
  p_email text default null,
  p_postcode text default null,
  p_extra jsonb default '{}'::jsonb
)
returns asset_leads
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_asset     assets;
  v_installer uuid;
  v_is_dup    boolean;
  v_lead      asset_leads;
begin
  -- auth.uid() is NULL for a service-role call (submit-lead), the only path
  -- that should create leads from the funnels. A request carrying a real
  -- end-user JWT is a human in a browser, and the only legitimate one of those
  -- is an LGR admin (the test-lead tool, or releasing a held lead).
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'insert_lead: not authorised' using errcode = '42501';
  end if;

  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'full_name is required';
  end if;
  if p_phone is null or btrim(p_phone) = '' then
    raise exception 'phone is required';
  end if;

  select * into v_asset from assets where id = p_asset_id;
  if not found then
    raise exception 'asset % not found', p_asset_id using errcode = 'no_data_found';
  end if;

  -- a lead belongs to whoever currently rents the asset
  v_installer := v_asset.rented_by;
  if v_installer is null then
    raise exception 'asset % is not currently rented; no installer to deliver to', p_asset_id;
  end if;

  -- per (installer_id, phone) dedup within the last 30 days - across every
  -- asset and brand that installer rents, not just this one.
  select exists (
    select 1
    from asset_leads l
    where l.installer_id = v_installer
      and l.phone = p_phone
      and l.status <> 'invalid'
      and l.captured_at > now() - interval '30 days'
  ) into v_is_dup;

  insert into asset_leads (
    asset_id, installer_id, full_name, email, phone, postcode, extra,
    status, is_duplicate
  ) values (
    p_asset_id, v_installer, p_full_name, p_email, p_phone, p_postcode,
    coalesce(p_extra, '{}'::jsonb),
    case when v_is_dup then 'duplicate' else 'delivered' end,
    v_is_dup
  )
  returning * into v_lead;

  if not v_is_dup then
    perform pg_notify(
      'lead_delivered',
      json_build_object(
        'lead_id',      v_lead.id,
        'asset_id',     v_lead.asset_id,
        'installer_id', v_lead.installer_id
      )::text
    );
  end if;

  return v_lead;
end;
$function$;

-- Supports the new dedup lookup (installer + phone + recency).
create index if not exists asset_leads_installer_phone_idx
  on asset_leads (installer_id, phone, captured_at desc);


-- ── 2. Shared IPs must not lock out real people ─────────────────────────────
-- The old rule treated a bare IP match as "the same visitor" and escalated the
-- penalty to 24 hours and then 7 days. Australian mobile carriers run large
-- CGNAT pools and offices/apartment blocks share an egress IP, so two unrelated
-- homeowners could trivially collide - and one abuser could push a shared row
-- to a 7-day block that silently swallowed every genuine lead behind that IP.
--
-- Now the two signals are treated differently:
--
--   * STRONG identity (browser fingerprint or device hash) - genuinely the same
--     browser. Escalates exactly as before: 30 minutes, 24 hours, 7 days.
--   * IP ONLY - might be a whole suburb behind one carrier NAT. Blocks only a
--     rapid-fire burst (another submission within 2 minutes), never escalates,
--     and never increments the violation counter. Enough to stop a scripted
--     flood that sends no browser signals; short enough that a real person
--     behind the same NAT is not shut out.
create or replace function enforce_lead_cooldown(
  p_fingerprint text,
  p_device_hash text,
  p_ip text,
  p_phone text default null,
  p_email text default null,
  p_postcode text default null,
  p_brand_domain text default null,
  p_user_agent text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row      lead_abuse_visitors;
  v_count    int;
  v_penalty  interval;
  v_label    text;
  v_until    timestamptz;
  v_fp       text := nullif(btrim(coalesce(p_fingerprint, '')), '');
  v_dh       text := nullif(btrim(coalesce(p_device_hash, '')), '');
  v_ip       text := nullif(btrim(coalesce(p_ip, '')), '');
begin
  -- STRONG match first: same browser, inside an active cooldown → violation.
  if v_fp is not null or v_dh is not null then
    select * into v_row
    from lead_abuse_visitors
    where cooldown_until is not null and cooldown_until > now()
      and (
        (v_fp is not null and fingerprint = v_fp)
        or (v_dh is not null and device_hash = v_dh)
      )
    order by cooldown_until desc
    limit 1
    for update;

    if found then
      v_count := v_row.violation_count + 1;
      if v_count >= 3 then
        v_penalty := interval '7 days';   v_label := '7 days';
      elsif v_count = 2 then
        v_penalty := interval '24 hours'; v_label := '24 hours';
      else
        v_penalty := interval '30 minutes'; v_label := '30 minutes';
      end if;
      v_until := now() + v_penalty;

      update lead_abuse_visitors set
        violation_count = v_count,
        cooldown_until  = v_until,
        fingerprint     = coalesce(v_fp, fingerprint),
        device_hash     = coalesce(v_dh, device_hash),
        ip              = coalesce(v_ip, ip),
        updated_at      = now()
      where id = v_row.id;

      insert into lead_abuse_log (
        visitor_id, fingerprint, device_hash, ip, phone, email, postcode,
        brand_domain, user_agent, violation_number, penalty, cooldown_until
      ) values (
        v_row.id, p_fingerprint, p_device_hash, p_ip, p_phone, p_email, p_postcode,
        p_brand_domain, p_user_agent, v_count, v_label, v_until
      );

      return jsonb_build_object('blocked', true, 'violation', v_count,
                                'cooldown_until', v_until, 'basis', 'device');
    end if;
  end if;

  -- IP-ONLY: burst control, not identity. No escalation, no counter bump, and
  -- deliberately short - a shared carrier IP is not evidence of the same person.
  if v_ip is not null then
    select * into v_row
    from lead_abuse_visitors
    where ip = v_ip
      and last_submission_at is not null
      and last_submission_at > now() - interval '2 minutes'
    order by last_submission_at desc
    limit 1;

    if found then
      insert into lead_abuse_log (
        visitor_id, fingerprint, device_hash, ip, phone, email, postcode,
        brand_domain, user_agent, violation_number, penalty, cooldown_until
      ) values (
        v_row.id, p_fingerprint, p_device_hash, p_ip, p_phone, p_email, p_postcode,
        p_brand_domain, p_user_agent, 0, 'ip burst (2 minutes)', null
      );
      return jsonb_build_object('blocked', true, 'basis', 'ip_burst');
    end if;
  end if;

  return jsonb_build_object('blocked', false);
end $$;

-- record_lead_submission(): key the visitor row on the STRONG signals, and only
-- fall back to IP when the request carries none (a scripted post). The old
-- version matched on IP too and then coalesce()d the fingerprint, so a second
-- browser behind a shared IP was folded into the first one's row - it never got
-- its own identity and inherited a stranger's cooldown.
create or replace function record_lead_submission(
  p_fingerprint text,
  p_device_hash text,
  p_ip text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_fp text := nullif(btrim(coalesce(p_fingerprint, '')), '');
  v_dh text := nullif(btrim(coalesce(p_device_hash, '')), '');
  v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
begin
  if v_fp is not null or v_dh is not null then
    select id into v_id
    from lead_abuse_visitors
    where (v_fp is not null and fingerprint = v_fp)
       or (v_dh is not null and device_hash = v_dh)
    order by updated_at desc
    limit 1;
  else
    -- No browser signals at all. Only then does IP stand in for identity, and
    -- only against rows that are themselves IP-only, so a real browser's row is
    -- never hijacked by a scripted post from the same network.
    select id into v_id
    from lead_abuse_visitors
    where v_ip is not null and ip = v_ip
      and fingerprint is null and device_hash is null
    order by updated_at desc
    limit 1;
  end if;

  if v_id is null then
    insert into lead_abuse_visitors (fingerprint, device_hash, ip, cooldown_until, last_submission_at)
    values (v_fp, v_dh, v_ip, now() + interval '30 minutes', now());
  else
    update lead_abuse_visitors set
      cooldown_until     = now() + interval '30 minutes',
      last_submission_at = now(),
      fingerprint        = coalesce(v_fp, fingerprint),
      device_hash        = coalesce(v_dh, device_hash),
      ip                 = coalesce(v_ip, ip),
      updated_at         = now()
    where id = v_id;
  end if;
end $$;

-- Supports the IP-burst lookup.
create index if not exists lead_abuse_visitors_ip_last_idx
  on lead_abuse_visitors (ip, last_submission_at desc);

-- Only submit-lead (service role) may call these. The grant to service_role is
-- explicit rather than left to Supabase's schema defaults: leaning on an
-- implicit default is precisely how insert_lead ended up reachable by anon
-- (see 20260808000000), so the intent is spelled out here instead.
revoke all on function enforce_lead_cooldown(text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function record_lead_submission(text, text, text) from public, anon, authenticated;
grant execute on function enforce_lead_cooldown(text, text, text, text, text, text, text, text) to service_role;
grant execute on function record_lead_submission(text, text, text) to service_role;


-- ── 3. Releasing a held lead ────────────────────────────────────────────────
-- pending_leads could only be discarded or restored; the delivered/
-- delivered_lead_id columns existed but nothing ever wrote them, so a held lead
-- had no route back into the system. Release stays MANUAL by design - nothing
-- here fires on its own.

-- Which live assets could take this held lead? Same coverage rule the funnels
-- use: the asset's own service_postcodes if it has any, otherwise its region's.
-- An empty patch is NOT match-all.
create or replace function public.pending_lead_candidates(p_pending_id uuid)
returns table (
  asset_id uuid,
  brand_name text,
  brand_domain text,
  installer_id uuid,
  business_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending pending_leads;
begin
  if not public.is_super_admin() then
    raise exception 'pending_lead_candidates: not authorised' using errcode = '42501';
  end if;

  select * into v_pending from pending_leads where id = p_pending_id;
  if not found then
    raise exception 'pending lead % not found', p_pending_id using errcode = 'no_data_found';
  end if;

  return query
  select a.id, a.brand_name, a.brand_domain, i.id, i.business_name
  from assets a
  join installers i on i.id = a.rented_by
  where a.deleted_at is null
    and a.status = 'rented'
    and a.rented_by is not null
    and v_pending.postcode = any (
      case
        when a.service_postcodes is not null and array_length(a.service_postcodes, 1) > 0
          then a.service_postcodes
        else coalesce((select r.postcodes from regions r where r.id = a.region_id), '{}')
      end
    )
  order by i.business_name, a.brand_name;
end $$;

-- Release a held lead to a chosen asset. Reuses insert_lead() so attribution and
-- the 30-day dedup behave exactly as they do for a funnel capture - a released
-- lead the installer already has recently still comes back marked duplicate
-- rather than quietly double-charging them.
create or replace function public.release_pending_lead(
  p_pending_id uuid,
  p_asset_id uuid
)
returns asset_leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending pending_leads;
  v_lead    asset_leads;
begin
  if not public.is_super_admin() then
    raise exception 'release_pending_lead: not authorised' using errcode = '42501';
  end if;

  select * into v_pending from pending_leads where id = p_pending_id for update;
  if not found then
    raise exception 'pending lead % not found', p_pending_id using errcode = 'no_data_found';
  end if;
  if v_pending.status <> 'pending' then
    raise exception 'pending lead % is already %', p_pending_id, v_pending.status;
  end if;

  v_lead := public.insert_lead(
    p_asset_id,
    v_pending.full_name,
    v_pending.phone,
    v_pending.email,
    v_pending.postcode,
    coalesce(v_pending.extra, '{}'::jsonb)
      || jsonb_build_object(
           'released_from_pending', p_pending_id,
           'original_reason',       v_pending.reason,
           'consent_text',          v_pending.consent_text
         )
  );

  update pending_leads set
    status            = 'delivered',
    delivered_lead_id = v_lead.id,
    resolved_at       = now()
  where id = p_pending_id;

  return v_lead;
end $$;

revoke all on function public.pending_lead_candidates(uuid) from public, anon;
revoke all on function public.release_pending_lead(uuid, uuid) from public, anon;
grant execute on function public.pending_lead_candidates(uuid) to authenticated, service_role;
grant execute on function public.release_pending_lead(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
