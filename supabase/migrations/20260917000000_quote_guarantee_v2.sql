-- ============================================================================
-- The guarantee, corrected: 10 quoted jobs. No pipeline figure.
--
-- 20260916000100 built the guarantee as TWO numbers - 10 quotes AND $100,000 of
-- quoted pipeline - with both required. That is not the promise. The promise is
-- ten quoted jobs in thirty days, and a dollar figure is a positioning line for
-- one landing page, not a term anyone is held to.
--
-- Carrying a pipeline target in the schema is not harmless. settle_guarantee_cycle
-- required both, so a client who produced twelve quotes worth $80,000 would have
-- been settled as a SHORTFALL and refunded, against a promise nobody made them.
-- The dollar figure is therefore removed from the settlement path entirely
-- rather than defaulted or made optional.
--
-- WHAT ELSE CHANGES, AND WHY
--
-- 1. A CONFIRMED LEAD COUNTS AS A QUOTED JOB.
--    Our control over a lead ends when that lead replies to the automated
--    follow-up confirming they want a quote or an appointment. Whether a written
--    quote then goes out is the client's own sales activity, which we do not
--    control and must not be judged on. So a lead that returns a confirmation
--    response inside the period counts, whether or not the client got around to
--    quoting it.
--
--    Nothing in the schema recorded that, so leads.confirmed_at is added. It is
--    stamped by the SMS handler when an inbound reply affirmatively confirms
--    interest, and the message that did it is kept alongside it, because a
--    guarantee settled on a flag nobody can trace back to a real message is a
--    guarantee settled on an assertion.
--
--    Counting is over DISTINCT LEADS: a lead that both confirmed and was quoted
--    is one quoted job, not two.
--
-- 2. SUSPENSION NO LONGER EXTENDS THE PERIOD.
--    The previous version paused the clock when delivery stopped. It now runs
--    thirty consecutive days from the day the ads first go live and is not
--    extended or reset by any suspension. Continuous funding is instead a
--    CONDITION of the guarantee: a client who lets the budget lapse has not met
--    it. That is the harder rule and it is the honest one, because a clock that
--    pauses whenever delivery stops can be held open indefinitely.
--
-- 3. A REFUND IS CLAIMED, NOT AUTOMATIC.
--    The client submits a claim in writing within 7 days of the period ending,
--    and we assess it against the platform record within 14 days. Recorded here
--    so a claim has a date, an assessor and an outcome rather than living in an
--    inbox. A cycle that ends short and is never claimed is settled 'shortfall'
--    with no remedy owed until a claim is made.
-- ============================================================================

-- ─── 1. Confirmation responses ──────────────────────────────────────────────
alter table public.leads
  add column if not exists confirmed_at             timestamptz,
  add column if not exists confirmation_message_id  uuid references public.messages(id) on delete set null;

comment on column public.leads.confirmed_at is
  'When this lead replied to the automated follow-up affirmatively confirming interest in a '
  'quote or an appointment. Counts as a quoted job for the guarantee even if no written quote '
  'was issued: our control ends at the confirmation, the quote is the client''s own sales activity.';
comment on column public.leads.confirmation_message_id is
  'The inbound message that constituted the confirmation, so a settled guarantee can always be '
  'traced back to a real reply from a real person.';

create index if not exists leads_confirmed_idx
  on public.leads (company_id, confirmed_at)
  where confirmed_at is not null;

-- Stamping it. Idempotent - the first confirmation is the one that counts, so a
-- chatty lead who says yes three times does not move their own timestamp later.
create or replace function public.mark_lead_confirmed(
  p_lead_id    uuid,
  p_message_id uuid default null,
  p_at         timestamptz default now()
) returns timestamptz language plpgsql security definer set search_path to 'public'
as $$
declare v_at timestamptz;
begin
  update public.leads
     set confirmed_at            = coalesce(confirmed_at, p_at),
         confirmation_message_id = coalesce(confirmation_message_id, p_message_id),
         -- Never downgrade a lead that is already further along.
         status = case when status in ('new','contacted') then 'qualified'::public.lead_status
                       else status end
   where id = p_lead_id
  returning confirmed_at into v_at;
  return v_at;
end $$;

revoke all on function public.mark_lead_confirmed(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.mark_lead_confirmed(uuid, uuid, timestamptz) to service_role;

-- ─── 2. The cycle: quotes only, fixed window, claims ────────────────────────
alter table public.guarantee_cycles
  add column if not exists confirmations_delivered int not null default 0,
  add column if not exists quoted_jobs_delivered   int not null default 0,
  add column if not exists claim_submitted_at      timestamptz,
  add column if not exists claim_assessed_at       timestamptz,
  add column if not exists claim_assessed_by       uuid,
  add column if not exists claim_notes             text;

comment on column public.guarantee_cycles.quoted_jobs_delivered is
  'DISTINCT leads that were either quoted or returned a confirmation response inside the '
  'period. This is the number the guarantee is settled on.';
comment on column public.guarantee_cycles.confirmations_delivered is
  'Of those, how many counted by confirmation rather than by a written quote. Kept separately '
  'so a claim can be assessed without re-deriving it.';
comment on column public.guarantee_cycles.claim_submitted_at is
  'A refund is claimed, not automatic: in writing within 7 days of the period ending. Null on a '
  'shortfall means nobody has claimed yet, not that nothing is owed.';

-- The pipeline target stops being a requirement. The column stays on the table
-- so historic rows remain readable, but it is no longer settled against and
-- carries a comment saying so, because the next person to read it will assume
-- a not-null column with a number in it is part of the promise.
alter table public.guarantee_cycles alter column pipeline_required_aud drop not null;
update public.guarantee_cycles set pipeline_required_aud = null;

comment on column public.guarantee_cycles.pipeline_required_aud is
  'RETIRED. The guarantee is quoted jobs only. Kept for historic rows; never settled against, '
  'never published, and must not be reintroduced as a second target.';
comment on column public.guarantee_cycles.pipeline_delivered_aud is
  'Informational only - the value of quotes sent in the period. Useful to the client and to us, '
  'and settled against by nothing.';

alter table public.assets alter column guarantee_pipeline_aud drop not null;
update public.assets set guarantee_pipeline_aud = null;
update public.rentals set guarantee_pipeline_aud = null;
comment on column public.assets.guarantee_pipeline_aud is
  'RETIRED. See guarantee_cycles.pipeline_required_aud. The guarantee is guarantee_quotes only.';

-- 'paused' leaves the status list: the period is thirty consecutive days and is
-- not extended by a suspension. Any row sitting in it becomes 'running', which
-- is what it now is.
update public.guarantee_cycles set status = 'running' where status = 'paused';
alter table public.guarantee_cycles drop constraint if exists guarantee_cycles_status_check;
alter table public.guarantee_cycles
  add constraint guarantee_cycles_status_check
  check (status in ('pending','running','met','shortfall','void'));

comment on column public.guarantee_cycles.paused_days is
  'RETIRED. A suspension of advertising does not extend or reset the period. Continuous funding '
  'is a CONDITION of the guarantee instead - see the terms. Kept only so historic rows read.';

-- ─── 2b. Opening a cycle, without the pipeline requirement ──────────────────
-- 20260916000100's version bailed out unless BOTH guarantee numbers were set:
--
--     if v_r.guarantee_quotes is null or v_r.guarantee_pipeline_aud is null then
--       return null;
--     end if;
--
-- Section 2 above has just nulled guarantee_pipeline_aud on every asset and
-- rental, so that version would now return null for every engagement and no
-- cycle would ever open again - silently, because returning null is how it says
-- "this engagement has no guarantee". Redefined here to require the quote target
-- and nothing else.
create or replace function public.open_guarantee_cycle(
  p_rental_id uuid,
  p_cycle_no  int default null
) returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare v_r rentals; v_no int; v_id uuid;
begin
  select * into v_r from rentals where id = p_rental_id;
  if not found then
    raise exception 'open_guarantee_cycle: rental % not found', p_rental_id
      using errcode = 'no_data_found';
  end if;

  v_no := coalesce(p_cycle_no,
                   (select coalesce(max(cycle_no), 0) + 1
                      from guarantee_cycles where rental_id = p_rental_id));

  -- No quote target means no guarantee on this engagement (a custom tier still
  -- being scoped). No cycle rather than a cycle promising zero, because zero is
  -- a number somebody will eventually read as "met".
  if v_r.guarantee_quotes is null then
    return null;
  end if;

  insert into guarantee_cycles (
      rental_id, asset_id, cycle_no,
      quotes_required, window_days,
      fee_aud, budget_required_aud,
      -- Cycle 1 starts when the ads go live; a later cycle starts the moment the
      -- one before it ended, so cycles tile rather than drift.
      starts_at, ends_at,
      status)
  values (
      p_rental_id, v_r.asset_id, v_no,
      v_r.guarantee_quotes, coalesce(v_r.guarantee_window_days, 30),
      v_r.monthly_price_aud, v_r.agreed_daily_budget_aud,
      case when v_no = 1 then v_r.ads_live_at
           else (select ends_at from guarantee_cycles
                  where rental_id = p_rental_id and cycle_no = v_no - 1) end,
      null,
      'pending')
  on conflict (rental_id, cycle_no) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from guarantee_cycles
     where rental_id = p_rental_id and cycle_no = v_no;
  end if;

  update guarantee_cycles
     set ends_at = starts_at + (window_days || ' days')::interval,
         status  = 'running'
   where id = v_id and starts_at is not null and ends_at is null;

  return v_id;
end $$;

revoke all on function public.open_guarantee_cycle(uuid, int) from public, anon, authenticated;
grant execute on function public.open_guarantee_cycle(uuid, int) to service_role;

-- ─── 3. Measuring it ────────────────────────────────────────────────────────
-- Quoted jobs = DISTINCT leads from this engine that, inside the period, either
-- had a quote sent or returned a confirmation response. The union is taken over
-- lead ids precisely so the two cannot double-count the same person.
create or replace function public.recalc_guarantee_cycle(p_cycle_id uuid)
returns public.guarantee_cycles language plpgsql security definer set search_path to 'public'
as $$
declare
  v_c guarantee_cycles; v_company uuid;
  v_jobs int; v_confirmed int; v_quotes int; v_pipeline numeric; v_leads int;
begin
  select * into v_c from guarantee_cycles where id = p_cycle_id;
  if not found then
    raise exception 'recalc_guarantee_cycle: cycle % not found', p_cycle_id
      using errcode = 'no_data_found';
  end if;

  select i.company_id into v_company
    from rentals r join installers i on i.id = r.installer_id
   where r.id = v_c.rental_id;

  -- SECURITY DEFINER bypasses RLS and this returns the whole row, including
  -- fee_aud and the remedy. `authenticated` holds EXECUTE so a client can
  -- refresh their own progress widget, so ownership is checked explicitly - the
  -- "client reads own guarantee cycles" policy does not apply inside a definer
  -- function.
  --   * auth.uid() and auth.role() both null means there is no request context at
  --     all: a direct SQL session, i.e. a migration or psql. is_super_admin()
  --     returns FALSE for a null uid, so without this the backfill at the foot of
  --     this file would raise on its first row. anon and authenticated both carry
  --     a role claim, so neither slips through here.
  if not (public.is_super_admin()
          or auth.role() = 'service_role'
          or (auth.uid() is null and auth.role() is null)
          or (v_company is not null and v_company = public.current_company_id())) then
    raise exception 'recalc_guarantee_cycle: not authorised' using errcode = '42501';
  end if;

  if v_c.starts_at is null then return v_c; end if;   -- not started, nothing to measure
  if v_company is null then return v_c; end if;       -- no linked company, see 20260916000200

  with window_leads as (
    select l.id, l.confirmed_at
      from public.leads l
     where l.company_id = v_company
       and l.source = 'lgr_engine'
       and (l.metadata ->> 'asset_id')::uuid = v_c.asset_id
  ),
  quoted as (
    select distinct q.lead_id as id
      from public.quotes q
      join window_leads w on w.id = q.lead_id
     where q.company_id = v_company
       and q.sent_at is not null
       and q.sent_at >= v_c.starts_at
       and q.sent_at <  v_c.ends_at
  ),
  confirmed as (
    select w.id
      from window_leads w
     where w.confirmed_at is not null
       and w.confirmed_at >= v_c.starts_at
       and w.confirmed_at <  v_c.ends_at
  )
  select (select count(*) from (select id from quoted union select id from confirmed) u),
         (select count(*) from confirmed),
         (select count(*) from quoted)
    into v_jobs, v_confirmed, v_quotes;

  -- Informational only: the value of what was quoted. Settled against by nothing.
  select coalesce(sum(q.total), 0) into v_pipeline
    from public.quotes q
    join public.leads  l on l.id = q.lead_id
   where q.company_id = v_company
     and q.sent_at is not null
     and q.sent_at >= v_c.starts_at
     and q.sent_at <  v_c.ends_at
     and l.source = 'lgr_engine'
     and (l.metadata ->> 'asset_id')::uuid = v_c.asset_id;

  select count(*) into v_leads
    from public.asset_leads al
   where al.asset_id = v_c.asset_id
     and al.status   = 'delivered'
     and al.captured_at >= v_c.starts_at
     and al.captured_at <  v_c.ends_at;

  update guarantee_cycles
     set quoted_jobs_delivered   = v_jobs,
         confirmations_delivered = v_confirmed,
         quotes_delivered        = v_quotes,
         pipeline_delivered_aud  = v_pipeline,
         leads_delivered         = v_leads,
         recalculated_at         = now()
   where id = p_cycle_id
  returning * into v_c;

  return v_c;
end $$;

-- ─── 4. Settling it ─────────────────────────────────────────────────────────
-- One number decides it now. A remedy is RECORDED as owed; it is payable on a
-- claim, and issuing the Stripe refund is still a deliberate human step.
create or replace function public.settle_guarantee_cycle(
  p_cycle_id uuid,
  p_force    boolean default false
) returns public.guarantee_cycles language plpgsql security definer set search_path to 'public'
as $$
declare v_c guarantee_cycles; v_met boolean;
begin
  if not (public.is_super_admin() or auth.role() = 'service_role') then
    raise exception 'settle_guarantee_cycle: not authorised' using errcode = '42501';
  end if;

  v_c := public.recalc_guarantee_cycle(p_cycle_id);

  if v_c.status in ('met','shortfall','void') then return v_c; end if;
  if v_c.ends_at is null then
    raise exception 'settle_guarantee_cycle: cycle % has not started', p_cycle_id;
  end if;
  if v_c.ends_at > now() and not p_force then
    raise exception 'settle_guarantee_cycle: cycle % does not close until %', p_cycle_id, v_c.ends_at;
  end if;

  v_met := v_c.quoted_jobs_delivered >= v_c.quotes_required;

  update guarantee_cycles
     set status            = case when v_met then 'met' else 'shortfall' end,
         remedy            = case when v_met then 'none' else 'fee_refunded' end,
         remedy_amount_aud = case when v_met then null else fee_aud end,
         settled_at        = now()
   where id = p_cycle_id
  returning * into v_c;

  -- The engagement continues, so the next cycle opens now, tiling onto this
  -- one's ends_at rather than starting from the settlement run.
  perform public.open_guarantee_cycle(v_c.rental_id, v_c.cycle_no + 1);

  return v_c;
end $$;

-- ─── 5. Claims ──────────────────────────────────────────────────────────────
-- In writing, within 7 days of the period closing. Recorded rather than trusted
-- to an inbox, and deliberately NOT auto-approved: the assessment is against the
-- platform record and the conditions, which is a judgement.
create or replace function public.submit_guarantee_claim(
  p_cycle_id uuid,
  p_notes    text default null
) returns public.guarantee_cycles language plpgsql security definer set search_path to 'public'
as $$
declare v_c guarantee_cycles; v_company uuid;
begin
  select * into v_c from guarantee_cycles where id = p_cycle_id;
  if not found then
    raise exception 'submit_guarantee_claim: cycle % not found', p_cycle_id
      using errcode = 'no_data_found';
  end if;

  select i.company_id into v_company
    from rentals r join installers i on i.id = r.installer_id
   where r.id = v_c.rental_id;

  if not (public.is_super_admin()
          or auth.role() = 'service_role'
          or (v_company is not null and v_company = public.current_company_id())) then
    raise exception 'submit_guarantee_claim: not authorised' using errcode = '42501';
  end if;

  if v_c.ends_at is null or v_c.ends_at > now() then
    raise exception 'submit_guarantee_claim: the guarantee period has not ended yet';
  end if;

  -- The 7 day window. Enforced here rather than left to whoever reads the inbox,
  -- but note it only blocks the self-serve path: a super admin can still record
  -- a late claim by updating the row, which is the right shape - the deadline is
  -- ours to waive and should be a decision, not an accident.
  if not public.is_super_admin() and v_c.ends_at < now() - interval '7 days' then
    raise exception 'submit_guarantee_claim: claims close 7 days after the period ends (% )', v_c.ends_at;
  end if;

  update guarantee_cycles
     set claim_submitted_at = coalesce(claim_submitted_at, now()),
         claim_notes        = coalesce(nullif(btrim(p_notes), ''), claim_notes)
   where id = p_cycle_id
  returning * into v_c;

  return v_c;
end $$;

revoke all on function public.submit_guarantee_claim(uuid, text) from public, anon, authenticated;
grant execute on function public.submit_guarantee_claim(uuid, text) to authenticated, service_role;

-- ─── 6. Client-facing progress ──────────────────────────────────────────────
drop view if exists public.guarantee_progress;
create view public.guarantee_progress
with (security_invoker = true) as
  select c.id, c.rental_id, c.cycle_no, c.status,
         c.quotes_required,
         c.quoted_jobs_delivered,
         c.confirmations_delivered,
         c.quotes_delivered,
         c.pipeline_delivered_aud,
         c.leads_delivered,
         c.starts_at, c.ends_at,
         greatest(0, c.quotes_required - c.quoted_jobs_delivered) as jobs_outstanding,
         case when c.ends_at is null then null
              else greatest(0, ceil(extract(epoch from (c.ends_at - now())) / 86400)::int) end
                                                                  as days_remaining,
         c.claim_submitted_at, c.claim_assessed_at,
         c.recalculated_at
    from public.guarantee_cycles c;

comment on view public.guarantee_progress is
  'Guarantee tracking as the client sees it. quoted_jobs_delivered is the number that settles it; '
  'the pipeline value is shown because it is useful, not because anything is measured against it.';

revoke all on public.guarantee_progress from public, anon;
grant select on public.guarantee_progress to authenticated;

-- ─── 6b. The public views stop carrying the retired column ─────────────────
-- assets_public and engine_availability were built in 20260916000000 with
-- guarantee_pipeline_aud in their projections. It is always null now, so nothing
-- breaks - but a nullable column called "guarantee pipeline" sitting in the
-- catalogue anon reads is an invitation to put a dollar figure back on a page.
-- Both are rebuilt without it. The projections are otherwise unchanged.
drop view if exists public.assets_public;
create view public.assets_public as
  select a.id,
         a.tier,
         a.monthly_price_aud,
         a.min_daily_budget_aud,
         a.guarantee_quotes,
         a.guarantee_window_days,
         a.status,
         a.sold_out,
         a.created_at,
         a.niche_id,
         n.slug as niche_slug,
         n.name as niche_name
    from public.assets a
    join public.niches n on n.id = a.niche_id
   where a.deleted_at is null;

comment on view public.assets_public is
  'Public engine catalogue: trade, tier, fee, committed daily budget, the guaranteed '
  'number of quoted jobs, and availability. Never brand_name or brand_domain (engine '
  'identity is revealed after payment), never region (exclusivity is per engine), and '
  'never a dollar guarantee figure. MODEL.md sections 1.1, 7 and 9.1.';

revoke all on public.assets_public from anon, authenticated;
grant select on public.assets_public to anon, authenticated;

drop view if exists public.engine_availability;
create view public.engine_availability as
  select n.slug              as niche_slug,
         n.name              as niche_name,
         n.status            as niche_status,
         count(a.id) filter (
           where a.status = 'available' and not a.sold_out and a.deleted_at is null
         )                   as engines_available,
         min(a.monthly_price_aud)    filter (where a.deleted_at is null) as fee_aud,
         min(a.min_daily_budget_aud) filter (where a.deleted_at is null) as daily_budget_aud,
         min(a.guarantee_quotes)     filter (where a.deleted_at is null) as guarantee_quotes
    from public.niches n
    left join public.assets a
           on a.niche_id = n.id and a.tier = 'engine'
   group by n.slug, n.name, n.status, n.sort_order
   order by n.sort_order, n.name;

comment on view public.engine_availability is
  'Per-trade availability for the public pages. A count, never a list - a region-by-region '
  'breakdown is the territory map by another route. MODEL.md section 1.1.';

revoke all on public.engine_availability from anon, authenticated;
grant select on public.engine_availability to anon, authenticated;

-- ─── 7. Backfill ────────────────────────────────────────────────────────────
-- Any cycle already opened was measuring the wrong thing. Recompute the lot.
do $$
declare r record;
begin
  for r in select id from public.guarantee_cycles where starts_at is not null loop
    perform public.recalc_guarantee_cycle(r.id);
  end loop;
end $$;

notify pgrst, 'reload schema';
