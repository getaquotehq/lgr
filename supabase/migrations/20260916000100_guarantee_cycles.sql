-- ============================================================================
-- Guarantee cycles: the promise, the evidence, and the remedy.
--
-- "10 quotes and $100,000 of quoted pipeline in 30 days, or your fee is
-- refunded in full" is only a real guarantee if the numbers can be settled
-- without an argument. That needs three things written down BEFORE the cycle
-- runs rather than reconstructed after it:
--
--   what was required   - snapshotted from the rental, so repricing an engine
--                         mid-engagement cannot move the goalposts
--   what was delivered  - recomputed from `quotes`, not typed in by anyone
--   what we owe         - recorded on the row, so a refund is a fact with a
--                         timestamp rather than a conversation
--
-- WHY THE CLOCK STARTS AT ads_live_at
--
-- The cycle runs 30 days from the day the ads go live, never from the Stripe
-- charge. Onboarding is our time to lose. A client who waits five days for us
-- to launch has not spent five days of their guarantee, and a row created at
-- checkout therefore starts with NULL dates and status 'pending' - it is not a
-- cycle yet, it is a promise waiting for a start date.
--
-- WHY A SHORTFALL CAN BE VOIDED, AND WHY THAT IS NARROW
--
-- The guarantee is conditional on things only the client controls: the budget
-- stays funded, the ad account is not paused or edited, quotes get sent through
-- the dashboard. A cycle where the client turned the ads off on day three is
-- not a cycle we missed. But "the client breached a condition" is exactly the
-- escape hatch a bad-faith operator would reach for, so it is deliberately
-- awkward: 'void' requires a written reason on the row, it is never set by the
-- automation, and a card that simply declined PAUSES the cycle rather than
-- voiding it - paused_days extends ends_at instead. A client who can fix
-- something is given the chance to, because we are not hunting a technicality.
--
-- WHY SETTLEMENT DOES NOT ISSUE THE REFUND
--
-- settle_guarantee_cycle records the remedy as owed. Issuing it is a person in
-- Mission Control pressing a button against Stripe. The first refunds under a
-- new guarantee should be looked at by someone; automating the payout before
-- anyone has watched the measurement work is how you refund a month because a
-- sync job was down.
--
-- LOCKED DOWN like every other asset-side table: RLS on, super admins through
-- Mission Control, the client reads their OWN cycles (they are entitled to see
-- their guarantee tracking - it is the product), and nobody writes but the
-- service role.
-- ============================================================================

create table if not exists public.guarantee_cycles (
  id          uuid primary key default gen_random_uuid(),
  rental_id   uuid not null references public.rentals(id) on delete cascade,
  asset_id    uuid not null references public.assets(id)  on delete restrict,
  cycle_no    int  not null,                    -- 1-based, per rental

  -- ── the promise, snapshotted ──
  quotes_required        int     not null,
  pipeline_required_aud  int     not null,
  window_days            int     not null default 30,
  fee_aud                numeric(10,2) not null,   -- what is at risk
  budget_required_aud    numeric(10,2),            -- daily, on the client's card

  -- ── the window ──
  -- Null until the ads go live. See the header.
  starts_at   timestamptz,
  ends_at     timestamptz,
  -- Days the clock was stopped because delivery stopped through no decision of
  -- ours - a declined card, a Meta billing hold. Added to ends_at on resume.
  paused_days int not null default 0,

  -- ── what was delivered, recomputed never typed ──
  quotes_delivered       int           not null default 0,
  pipeline_delivered_aud numeric(14,2) not null default 0,
  leads_delivered        int           not null default 0,
  recalculated_at        timestamptz,

  -- pending   created at checkout, ads not live yet
  -- running   ads live, window open
  -- paused    delivery stopped for a reason the client can fix; clock stopped
  -- met       settled, both numbers reached
  -- shortfall settled, one or both missed - a remedy is owed
  -- void      settled, guarantee did not apply. Requires void_reason.
  status      text not null default 'pending'
    check (status in ('pending','running','paused','met','shortfall','void')),

  -- none | fee_refunded. There is no credit, no pro-rata and no make-good
  -- month: MODEL.md section 3.1 promises the fee back, in full, and a second
  -- remedy shape existing at all invites someone to offer it instead.
  remedy            text not null default 'none'
    check (remedy in ('none','fee_refunded')),
  remedy_amount_aud numeric(10,2),
  remedy_issued_at  timestamptz,
  stripe_refund_id  text,

  void_reason text,
  notes       text,
  settled_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint guarantee_cycles_rental_cycle_uniq unique (rental_id, cycle_no),
  -- A void is a claim about the client's conduct. It does not get to be
  -- wordless.
  constraint guarantee_cycles_void_needs_reason
    check (status <> 'void' or coalesce(btrim(void_reason), '') <> ''),
  -- A remedy implies a shortfall. Nothing else may carry one.
  constraint guarantee_cycles_remedy_needs_shortfall
    check (remedy = 'none' or status = 'shortfall')
);

create index if not exists guarantee_cycles_rental_idx on public.guarantee_cycles (rental_id, cycle_no);
create index if not exists guarantee_cycles_status_idx on public.guarantee_cycles (status, ends_at);
create index if not exists guarantee_cycles_owed_idx   on public.guarantee_cycles (remedy_issued_at)
  where remedy = 'fee_refunded' and remedy_issued_at is null;

comment on table public.guarantee_cycles is
  'One row per 30-day guarantee cycle per engagement: what was promised, what was '
  'delivered, and what remedy is owed. MODEL.md section 3.';
comment on column public.guarantee_cycles.starts_at is
  'Null until rentals.ads_live_at is stamped. The clock starts at delivery, never at payment.';
comment on column public.guarantee_cycles.quotes_delivered is
  'Recomputed by recalc_guarantee_cycle from public.quotes. Never hand-edited - a '
  'guarantee settled against a typed-in number is not a guarantee.';

create or replace function public.guarantee_cycles_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists guarantee_cycles_touch_trg on public.guarantee_cycles;
create trigger guarantee_cycles_touch_trg
  before update on public.guarantee_cycles
  for each row execute function public.guarantee_cycles_touch();

-- ─── Opening a cycle ────────────────────────────────────────────────────────
-- Called at checkout for cycle 1, and after each settlement for the next one.
-- Idempotent on (rental_id, cycle_no) so a Stripe webhook retry cannot open two.
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

  -- An engagement with no guarantee attached (a custom tier still being scoped)
  -- gets no cycle rather than a cycle promising zero. Zero is a number someone
  -- will eventually read as "met".
  if v_r.guarantee_quotes is null or v_r.guarantee_pipeline_aud is null then
    return null;
  end if;

  insert into guarantee_cycles (
      rental_id, asset_id, cycle_no,
      quotes_required, pipeline_required_aud, window_days,
      fee_aud, budget_required_aud,
      -- Cycle 1 starts when the ads go live; a later cycle starts the moment the
      -- one before it ended, so the cycles tile rather than drift.
      starts_at, ends_at,
      status)
  values (
      p_rental_id, v_r.asset_id, v_no,
      v_r.guarantee_quotes, v_r.guarantee_pipeline_aud, coalesce(v_r.guarantee_window_days, 30),
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

  -- If we already know the start, derive the end and start running.
  update guarantee_cycles
     set ends_at = starts_at + (window_days || ' days')::interval,
         status  = 'running'
   where id = v_id and starts_at is not null and ends_at is null;

  return v_id;
end $$;

-- ─── Starting the clock ─────────────────────────────────────────────────────
-- Called when ads go live. Stamps the rental and opens/starts cycle 1.
create or replace function public.mark_ads_live(
  p_rental_id uuid,
  p_at        timestamptz default now()
) returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare v_cycle uuid;
begin
  -- Callable from Mission Control by a super admin, or by an edge function on
  -- the service role. Anyone else stamping this would start their own guarantee
  -- clock, which is a refund they wrote themselves.
  if not (public.is_super_admin() or current_setting('role', true) = 'service_role'
          or auth.role() = 'service_role') then
    raise exception 'mark_ads_live: not authorised' using errcode = '42501';
  end if;

  update rentals
     set ads_live_at = coalesce(ads_live_at, p_at)   -- first launch wins
   where id = p_rental_id;

  v_cycle := public.open_guarantee_cycle(p_rental_id, 1);
  if v_cycle is null then return null; end if;

  update guarantee_cycles c
     set starts_at = coalesce(c.starts_at, r.ads_live_at),
         ends_at   = coalesce(c.ends_at,
                              r.ads_live_at + (c.window_days || ' days')::interval),
         status    = case when c.status = 'pending' then 'running' else c.status end
    from rentals r
   where c.id = v_cycle and r.id = p_rental_id;

  return v_cycle;
end $$;

-- ─── Measuring it ───────────────────────────────────────────────────────────
-- Delivered quotes and pipeline come from the dashboard's own `quotes` table,
-- restricted to quotes the client actually SENT (sent_at, not drafts) against
-- leads THIS ENGINE delivered. A client's own referrals and walk-ins are their
-- business and do not discharge our guarantee - hence the join through
-- leads.metadata->>'asset_lead_id', which only the engine mirror sets
-- (20260916000200).
--
-- A cancelled quote still counts if it was sent inside the window. We promised
-- to put quotes in front of homeowners, not to close them, and stripping a
-- quote because the homeowner said no would make the guarantee depend on the
-- outcome we explicitly do not guarantee (MODEL.md section 3.4).
create or replace function public.recalc_guarantee_cycle(p_cycle_id uuid)
returns public.guarantee_cycles language plpgsql security definer set search_path to 'public'
as $$
declare v_c guarantee_cycles; v_company uuid; v_quotes int; v_pipeline numeric; v_leads int;
begin
  select * into v_c from guarantee_cycles where id = p_cycle_id;
  if not found then
    raise exception 'recalc_guarantee_cycle: cycle % not found', p_cycle_id
      using errcode = 'no_data_found';
  end if;

  select i.company_id into v_company
    from rentals r join installers i on i.id = r.installer_id
   where r.id = v_c.rental_id;

  -- SECURITY DEFINER bypasses RLS, and this returns the whole row - including
  -- fee_aud and the remedy. The client's dashboard refreshes its own progress
  -- widget with this, so `authenticated` holds EXECUTE; without this gate a
  -- logged-in account could pass any cycle id and read another client's
  -- commercial terms. The "client reads own guarantee cycles" policy does not
  -- help here precisely because a definer function is not subject to it.
  if not (public.is_super_admin()
          or auth.role() = 'service_role'
          or (v_company is not null and v_company = public.current_company_id())) then
    raise exception 'recalc_guarantee_cycle: not authorised' using errcode = '42501';
  end if;
  if v_c.starts_at is null then return v_c; end if;   -- nothing to measure yet

  -- No dashboard company linked yet: leave the counters alone rather than
  -- writing zeros that look like a measured shortfall. Engine leads are also
  -- unmirrorable in that state (20260916000200), so there is genuinely nothing
  -- to count rather than a count of nothing.
  if v_company is null then return v_c; end if;

  select count(*), coalesce(sum(q.total), 0)
    into v_quotes, v_pipeline
    from public.quotes q
    join public.leads  l on l.id = q.lead_id
   where q.company_id = v_company
     and q.sent_at is not null
     and q.sent_at >= v_c.starts_at
     and q.sent_at <  coalesce(v_c.ends_at, now())
     and l.source = 'lgr_engine'
     and (l.metadata ->> 'asset_id')::uuid = v_c.asset_id;

  select count(*) into v_leads
    from public.asset_leads al
   where al.asset_id = v_c.asset_id
     and al.status   = 'delivered'
     and al.captured_at >= v_c.starts_at
     and al.captured_at <  coalesce(v_c.ends_at, now());

  update guarantee_cycles
     set quotes_delivered       = v_quotes,
         pipeline_delivered_aud = v_pipeline,
         leads_delivered        = v_leads,
         recalculated_at        = now()
   where id = p_cycle_id
  returning * into v_c;

  return v_c;
end $$;

-- ─── Settling it ────────────────────────────────────────────────────────────
-- Recomputes first, then decides. Refuses to settle a cycle whose window has
-- not closed, unless forced - a guarantee called short on day 12 is not a
-- guarantee, it is a panic.
--
-- The remedy is recorded, not issued. remedy_issued_at stays null until a human
-- puts the Stripe refund through. See the header.
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

  -- BOTH numbers. Either one short is a shortfall - MODEL.md section 3.1 sells
  -- "10 quotes AND $100,000", and settling on whichever is easier that month is
  -- how a guarantee quietly becomes a marketing line.
  v_met := v_c.quotes_delivered >= v_c.quotes_required
       and v_c.pipeline_delivered_aud >= v_c.pipeline_required_aud;

  update guarantee_cycles
     set status            = case when v_met then 'met' else 'shortfall' end,
         remedy            = case when v_met then 'none' else 'fee_refunded' end,
         remedy_amount_aud = case when v_met then null else fee_aud end,
         settled_at        = now()
   where id = p_cycle_id
  returning * into v_c;

  -- The engagement continues, so the next cycle opens straight away. It tiles
  -- onto this one's ends_at rather than starting now, so a settlement run three
  -- days late does not give the client three free days or cost them three.
  perform public.open_guarantee_cycle(v_c.rental_id, v_c.cycle_no + 1);

  return v_c;
end $$;

-- ─── Client-facing progress ─────────────────────────────────────────────────
-- What the dashboard renders. Deliberately carries no fee_aud: the client
-- already knows what they pay, and a refund amount on a mid-cycle progress
-- widget invites reading a running total as money owed.
drop view if exists public.guarantee_progress;
create view public.guarantee_progress
with (security_invoker = true) as
  select c.id, c.rental_id, c.cycle_no, c.status,
         c.quotes_required, c.quotes_delivered,
         c.pipeline_required_aud, c.pipeline_delivered_aud,
         c.leads_delivered,
         c.starts_at, c.ends_at, c.paused_days,
         greatest(0, c.quotes_required - c.quotes_delivered)             as quotes_outstanding,
         greatest(0, c.pipeline_required_aud - c.pipeline_delivered_aud) as pipeline_outstanding_aud,
         case when c.ends_at is null then null
              else greatest(0, ceil(extract(epoch from (c.ends_at - now())) / 86400)::int) end
                                                                         as days_remaining,
         c.recalculated_at
    from public.guarantee_cycles c;

comment on view public.guarantee_progress is
  'Guarantee tracking as the client sees it. security_invoker, so the rentals policy '
  'underneath decides whose cycles come back.';

-- ─── Lock down ──────────────────────────────────────────────────────────────
alter table public.guarantee_cycles enable row level security;

-- Mission Control.
drop policy if exists "super admin all guarantee cycles" on public.guarantee_cycles;
create policy "super admin all guarantee cycles" on public.guarantee_cycles
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- The client reads their own, and only reads. Guarantee tracking is the product
-- - hiding it would mean the client only finds out on day 30 - but a client who
-- could UPDATE these rows could write themselves a refund.
drop policy if exists "client reads own guarantee cycles" on public.guarantee_cycles;
create policy "client reads own guarantee cycles" on public.guarantee_cycles
  for select to authenticated
  using (
    rental_id in (
      select r.id from public.rentals r
        join public.installers i on i.id = r.installer_id
       where i.company_id = public.current_company_id()
    )
  );

revoke all on table public.guarantee_cycles from public, anon;
grant select on table public.guarantee_cycles to authenticated;
grant all    on table public.guarantee_cycles to service_role;

revoke all on public.guarantee_progress from public, anon;
grant select on public.guarantee_progress to authenticated;

revoke all on function public.guarantee_cycles_touch()                      from public, anon, authenticated;
revoke all on function public.open_guarantee_cycle(uuid, int)               from public, anon, authenticated;
revoke all on function public.mark_ads_live(uuid, timestamptz)              from public, anon, authenticated;
revoke all on function public.recalc_guarantee_cycle(uuid)                  from public, anon, authenticated;
revoke all on function public.settle_guarantee_cycle(uuid, boolean)         from public, anon, authenticated;

-- open_guarantee_cycle is internal: the webhook and the two functions below are
-- its only callers, and both of those are SECURITY DEFINER so Postgres checks
-- EXECUTE against the owner rather than the caller.
grant execute on function public.open_guarantee_cycle(uuid, int)       to service_role;

-- These two are pattern 1 from 20260831130000: Mission Control calls them as a
-- logged-in super admin, so the grant stays and the guard lives in the body.
grant execute on function public.mark_ads_live(uuid, timestamptz)      to authenticated, service_role;
grant execute on function public.settle_guarantee_cycle(uuid, boolean) to authenticated, service_role;

-- recalc only refreshes counters from data the caller can already see, and the
-- client's own dashboard refreshes its progress widget with it. Its writes are
-- confined to the three measured columns.
grant execute on function public.recalc_guarantee_cycle(uuid)          to authenticated, service_role;

notify pgrst, 'reload schema';
