-- ============================================================================
-- Rename leads -> asset_leads.
--
-- lgr-hq (the client platform, ported from ql-hq) shares this Supabase project
-- and brings its own `leads` table: a company CRM lead, a completely different
-- shape to this one. This table holds RENTAL leads - a lead captured by an
-- asset's funnel and delivered to whoever currently rents that asset - so
-- `asset_leads` is the more accurate name anyway.
--
-- Foreign keys, RLS policies and indexes follow the rename automatically; the
-- three functions that reference the table by name are recreated below.
-- The table is empty at the time of this migration, so there is no data risk.
-- ============================================================================
alter table if exists public.leads rename to asset_leads;

-- keep index names consistent with the new table name (cosmetic, but avoids
-- confusion against lgr-hq's own leads_* indexes in the same schema)
alter index if exists leads_pkey          rename to asset_leads_pkey;
alter index if exists leads_asset_idx     rename to asset_leads_asset_idx;
alter index if exists leads_installer_idx rename to asset_leads_installer_idx;
alter index if exists leads_dedup_idx     rename to asset_leads_dedup_idx;

-- ── insert_lead: attribution + strict 30-day dedup ──────────────────────────
drop function if exists public.insert_lead(uuid, text, text, text, text, jsonb);

create function public.insert_lead(
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

  -- per (asset_id, installer_id, phone) dedup within the last 30 days
  select exists (
    select 1
    from asset_leads l
    where l.asset_id = p_asset_id
      and l.installer_id = v_installer
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

-- ── admin hard deletes ──────────────────────────────────────────────────────
create or replace function public.hard_delete_asset(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  delete from asset_leads      where asset_id = p_id;   -- cascades lead_delivery_log
  delete from rentals          where asset_id = p_id;
  delete from rental_checkouts where asset_id = p_id;
  delete from assets           where id = p_id;
end $function$;

create or replace function public.hard_delete_installer(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- free any asset this business currently rents
  update assets set status='available', rented_by=null, rented_until=null,
                    stripe_subscription_id=null
  where rented_by = p_id;
  delete from asset_leads where installer_id = p_id;    -- cascades lead_delivery_log
  delete from rentals     where installer_id = p_id;
  delete from installers  where id = p_id;
end $function$;
