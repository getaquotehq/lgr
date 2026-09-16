-- ============================================================================
-- Mirror engine leads into the dashboard, so the guarantee can be measured.
--
-- THE GAP THIS CLOSES
--
-- LGR has two lead tables and they have never been connected:
--
--   public.asset_leads  what an engine captured, keyed to an asset and an
--                       installer. Written by insert_lead, delivered by
--                       deliver-lead over email and SMS.
--   public.leads        the client platform's lead record, keyed to a company.
--                       What the dashboard renders, what the SMS agent works,
--                       and what `quotes` hangs off.
--
-- DASHBOARD.md has said "there is no lgr <-> dashboard sync layer yet" since
-- the two were merged. Under the old model that was untidy. Under the new one
-- it is fatal: the guarantee is "10 quotes and $100,000 of quoted pipeline",
-- quotes live in `quotes`, `quotes.lead_id` points at `leads`, and no engine
-- lead has ever existed there. Measured today, every client's guarantee reads
-- zero quotes and every cycle settles as a refund.
--
-- So the mirror is not a nice-to-have alongside the guarantee. It is the part
-- of the guarantee that makes it a number instead of a slogan.
--
-- WHAT IT DOES NOT DO
--
-- It does not make `leads` the source of truth. asset_leads stays the record of
-- what the engine captured and what was delivered - disputes, duplicates,
-- assignment and the delivery log all hang off it. The mirror is one-way and
-- additive: a row in `leads` that points back at the asset lead it came from.
--
-- WHY source = 'lgr_engine' AND metadata->>'asset_id' BOTH
--
-- The source tag is what the dashboard filters on and what a human reads. The
-- asset_id is what recalc_guarantee_cycle joins on, because a client could in
-- principle be on two engines and each engine's guarantee is settled against
-- its own leads. Neither alone is enough, and inferring one from the other
-- later means a guarantee that depends on a join nobody wrote down.
-- ============================================================================

-- asset_leads gains the back-pointer, so the mirror is idempotent and so a
-- delivered lead can be traced in both directions.
alter table public.asset_leads
  add column if not exists mirrored_lead_id uuid references public.leads(id) on delete set null;

create unique index if not exists asset_leads_mirrored_lead_uniq
  on public.asset_leads (mirrored_lead_id)
  where mirrored_lead_id is not null;

comment on column public.asset_leads.mirrored_lead_id is
  'The public.leads row this engine lead was mirrored into, so the client platform '
  '(and the quote guarantee) can see it. One-way: asset_leads stays the source of truth.';

-- ─── The mirror ─────────────────────────────────────────────────────────────
-- Idempotent by construction: an asset lead that already carries a
-- mirrored_lead_id returns it and writes nothing. deliver-lead can therefore be
-- replayed, and a Supabase function retry cannot double a client's lead count.
create or replace function public.sync_asset_lead_to_company(p_asset_lead_id uuid)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare
  v_al      asset_leads;
  v_company uuid;
  v_first   text;
  v_last    text;
  v_lead    uuid;
begin
  select * into v_al from asset_leads where id = p_asset_lead_id;
  if not found then
    raise exception 'sync_asset_lead_to_company: asset lead % not found', p_asset_lead_id
      using errcode = 'no_data_found';
  end if;

  if v_al.mirrored_lead_id is not null then
    return v_al.mirrored_lead_id;   -- already mirrored
  end if;

  -- Only leads that were actually delivered are mirrored. A lead recorded
  -- 'invalid' - a duplicate, or one refused because the person is already bound
  -- to another client (20260831160000) - was never given to anybody, and
  -- putting it in their dashboard would be handing them a contact we told them
  -- they were not getting.
  if v_al.status <> 'delivered' then
    return null;
  end if;

  select i.company_id into v_company from installers i where i.id = v_al.installer_id;
  if v_company is null then
    -- The installer has no dashboard account linked yet. Not an error - the
    -- lead was still delivered by email and SMS - but it cannot be mirrored,
    -- and the guarantee for that engagement cannot be measured until it is.
    -- Visible rather than silent: Mission Control lists delivered engine leads
    -- with a null mirrored_lead_id.
    return null;
  end if;

  -- asset_leads carries one full_name; leads wants first and last. Split on the
  -- first space and put the remainder in last_name, which is wrong for some
  -- names and right for most, and is only ever a display field here.
  v_first := split_part(btrim(coalesce(v_al.full_name, '')), ' ', 1);
  v_last  := nullif(btrim(substr(btrim(coalesce(v_al.full_name, '')), length(v_first) + 1)), '');
  if v_first = '' then v_first := 'Unknown'; end if;

  insert into public.leads (
      company_id, first_name, last_name, email, phone,
      source, service_type, status, notes, metadata, created_at)
  values (
      v_company, v_first, v_last, v_al.email, v_al.phone,
      'lgr_engine',
      (select n.name from assets a join niches n on n.id = a.niche_id where a.id = v_al.asset_id),
      'new',
      nullif(btrim(concat_ws(E'\n',
        case when v_al.postcode is not null then 'Postcode: ' || v_al.postcode end)), ''),
      jsonb_strip_nulls(jsonb_build_object(
        'asset_lead_id', v_al.id,
        'asset_id',      v_al.asset_id,
        'postcode',      v_al.postcode,
        'engine_extra',  v_al.extra
      )),
      v_al.captured_at)
  returning id into v_lead;

  update asset_leads set mirrored_lead_id = v_lead where id = p_asset_lead_id;
  return v_lead;
end $$;

comment on function public.sync_asset_lead_to_company(uuid) is
  'Mirrors a DELIVERED engine lead into public.leads for the installer''s company, so it '
  'appears in the dashboard and so quotes written against it count toward the guarantee. '
  'Idempotent via asset_leads.mirrored_lead_id. MODEL.md section 8.2.';

-- Service role only: deliver-lead is the caller. A client able to call this
-- could conjure leads into their own dashboard, and leads are what the
-- guarantee is measured through.
revoke all on function public.sync_asset_lead_to_company(uuid) from public, anon, authenticated;
grant execute on function public.sync_asset_lead_to_company(uuid) to service_role;

-- ─── Backfill ───────────────────────────────────────────────────────────────
-- Every already-delivered engine lead belonging to an installer with a linked
-- company. Without this, a client's first cycle under the new model would start
-- with an empty dashboard and their existing leads would be unquotable against
-- the guarantee.
--
-- Bounded by the mirror's own idempotency, so re-running the migration is safe.
do $$
declare r record; v uuid;
begin
  for r in
    select al.id
      from public.asset_leads al
      join public.installers  i on i.id = al.installer_id
     where al.status = 'delivered'
       and al.mirrored_lead_id is null
       and i.company_id is not null
     order by al.captured_at
  loop
    v := public.sync_asset_lead_to_company(r.id);
  end loop;
end $$;

-- ─── Visibility for the unmirrored ──────────────────────────────────────────
-- A delivered lead with no mirror means an installer with no dashboard company,
-- which means an unmeasurable guarantee. That has to be findable, not inferred
-- from a client complaining their quote count is wrong.
create index if not exists asset_leads_unmirrored_idx
  on public.asset_leads (installer_id, captured_at desc)
  where mirrored_lead_id is null and status = 'delivered';

notify pgrst, 'reload schema';
