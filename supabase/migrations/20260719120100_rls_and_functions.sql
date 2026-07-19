-- ============================================================================
-- Row Level Security + lead-capture RPC
--
-- Client (anon) may ONLY:
--   * read niches, regions, assets  (public catalog / fleet data)
--   * call insert_lead()            (capture a lead - never touch the table)
-- Everything else (installers, leads, rentals) is service-role only.
-- ============================================================================

alter table niches     enable row level security;
alter table regions    enable row level security;
alter table assets     enable row level security;
alter table installers enable row level security;
alter table leads      enable row level security;
alter table rentals    enable row level security;

-- Public, read-only catalog tables -------------------------------------------
drop policy if exists "public read niches"  on niches;
drop policy if exists "public read regions" on regions;
drop policy if exists "public read assets"  on assets;

create policy "public read niches"  on niches  for select to anon, authenticated using (true);
create policy "public read regions" on regions for select to anon, authenticated using (true);
create policy "public read assets"  on assets  for select to anon, authenticated using (true);

-- installers / leads / rentals: no anon or authenticated policies at all, so
-- RLS denies every client operation. Only the service role (which bypasses
-- RLS) and the SECURITY DEFINER insert_lead() function can touch them.

-- Table privileges (belt-and-suspenders on top of RLS) ------------------------
grant select on niches, regions, assets to anon, authenticated;
revoke insert, update, delete on niches, regions, assets from anon, authenticated;
revoke all on installers, leads, rentals from anon, authenticated;

-- ----------------------------------------------------------------------------
-- insert_lead(): the ONLY way a client writes a lead.
--
-- Dedup scope is strictly (asset_id, installer_id, phone) within 30 days:
-- the same phone re-submitting on the SAME asset while it's rented to the SAME
-- installer is a real duplicate (double-click / re-fill) and is recorded as
-- status='duplicate', is_duplicate=true, and does NOT count toward the floor.
-- A different asset, or the same asset rented to a different installer, never
-- dedups - even with an identical phone number.
--
-- The installer is resolved from the asset's current renter (assets.rented_by).
-- ----------------------------------------------------------------------------
create or replace function insert_lead(
  p_asset_id uuid,
  p_full_name text,
  p_phone text,
  p_email text default null,
  p_postcode text default null,
  p_extra jsonb default '{}'::jsonb
) returns leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset       assets;
  v_installer   uuid;
  v_is_dup      boolean;
  v_lead        leads;
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
    from leads l
    where l.asset_id = p_asset_id
      and l.installer_id = v_installer
      and l.phone = p_phone
      and l.status <> 'invalid'
      and l.captured_at > now() - interval '30 days'
  ) into v_is_dup;

  insert into leads (
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
    -- Delivery workflow (SMS / email / CRM push) - STUB.
    -- pg_notify is a hook an edge function or external worker can subscribe to;
    -- swap this for the real fan-out when the delivery service is built.
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
$$;

-- Only expose the RPC to clients; no direct table writes.
revoke all on function insert_lead(uuid, text, text, text, text, jsonb) from public;
grant execute on function insert_lead(uuid, text, text, text, text, jsonb) to anon, authenticated;
