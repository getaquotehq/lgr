-- =============================================================================
-- PPL Lead Disputes
-- =============================================================================
-- Adds support for marking leads as Pay-Per-Lead (PPL) and allowing companies
-- to dispute those leads via three auto-checked reasons:
--   1. Invalid Number  — verified via Veriphone API (E164 normalised)
--   2. Duplicate       — checked against existing leads in same company
--   3. Outside Agreed Criteria — postcode checked against company agreed list
--
-- Only 'outside_agreed_criteria' can escalate to manual review, which is
-- gated behind a scrub-cap check.
-- =============================================================================

-- ─── Enums ────────────────────────────────────────────────────────────────────

create type public.dispute_reason as enum (
  'invalid_number',
  'duplicate',
  'outside_agreed_criteria'
);

create type public.dispute_status as enum (
  'pending',
  'auto_approved',
  'auto_rejected',
  'pending_manual_review',
  'manual_approved',
  'manual_rejected'
);

-- ─── Leads: mark as PPL ───────────────────────────────────────────────────────

alter table public.leads
  add column if not exists is_ppl boolean not null default false;

create index if not exists idx_leads_is_ppl
  on public.leads (company_id, is_ppl)
  where is_ppl = true;

-- Backfill: leads already tracked as PPL via the source field
update public.leads
set is_ppl = true
where lower(source) = 'ppl' and is_ppl = false;

-- ─── Companies: PPL territory & scrub cap ─────────────────────────────────────
-- ppl_agreed_postcodes — the postcode list this company has contracted for.
--   Empty array means no postcodes have been configured; outside_agreed_criteria
--   auto-check will be inconclusive in that case.
-- ppl_scrub_cap_pct — maximum percentage of PPL leads the company can get
--   replaced/refunded (default 10%).

alter table public.companies
  add column if not exists ppl_agreed_postcodes text[] not null default '{}',
  add column if not exists ppl_scrub_cap_pct    numeric(5,2) not null default 10;

-- ─── Lead Disputes table ──────────────────────────────────────────────────────

create table public.lead_disputes (
  id                   uuid        primary key default gen_random_uuid(),
  lead_id              uuid        not null references public.leads(id) on delete cascade,
  company_id           uuid        not null references public.companies(id) on delete cascade,
  raised_by            uuid        references auth.users(id),
  reason               public.dispute_reason  not null,
  status               public.dispute_status  not null default 'pending',
  -- Snapshot of what the auto-check found (stored for audit)
  auto_check_result    jsonb       not null default '{}',
  -- Populated when user sends for manual review
  manual_review_notes  text,
  -- Snapshot of scrub-cap state at time of manual review request
  scrub_cap_pct        numeric(5,2),
  scrub_used_pct       numeric(5,2),
  -- Resolution (set by Lead Gen Rentals staff via service-role)
  resolved_at          timestamptz,
  resolved_by          uuid        references auth.users(id),
  resolution_notes     text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index idx_lead_disputes_lead    on public.lead_disputes (lead_id);
create index idx_lead_disputes_company on public.lead_disputes (company_id, created_at desc);
create index idx_lead_disputes_status  on public.lead_disputes (company_id, status);

create trigger trg_lead_disputes_updated_at
  before update on public.lead_disputes
  for each row execute function public.set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table public.lead_disputes enable row level security;

-- Read: company members see their own disputes
create policy "lead_disputes_select"
  on public.lead_disputes for select
  using (
    company_id = (
      select company_id from public.profiles where id = auth.uid()
    )
  );

-- Insert: company members can only raise disputes on their own PPL leads
create policy "lead_disputes_insert"
  on public.lead_disputes for insert
  with check (
    company_id = (
      select company_id from public.profiles where id = auth.uid()
    )
    and exists (
      select 1 from public.leads
      where id = lead_id
        and is_ppl = true
        and company_id = lead_disputes.company_id
    )
  );

-- Update is handled exclusively by the edge function via service-role key,
-- so no authenticated update policy is needed.

-- ─── Helper: scrub-cap usage ─────────────────────────────────────────────────
-- Returns a JSON object describing how much of the scrub cap has been used.
-- Called by the dispute-lead edge function and from the client for display.

create or replace function public.get_ppl_scrub_usage(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_ppl   bigint;
  v_approved    bigint;
  v_scrub_cap   numeric(5,2);
  v_scrub_used  numeric(5,2);
begin
  select count(*)
  into v_total_ppl
  from public.leads
  where company_id = p_company_id and is_ppl = true;

  select count(*)
  into v_approved
  from public.lead_disputes
  where company_id = p_company_id
    and status in ('auto_approved', 'manual_approved');

  select ppl_scrub_cap_pct
  into v_scrub_cap
  from public.companies
  where id = p_company_id;

  if v_total_ppl = 0 then
    v_scrub_used := 0;
  else
    v_scrub_used := round(
      (v_approved::numeric / v_total_ppl::numeric) * 100, 2
    );
  end if;

  return jsonb_build_object(
    'total_ppl_leads',   v_total_ppl,
    'approved_disputes', v_approved,
    'scrub_cap_pct',     coalesce(v_scrub_cap, 10),
    'scrub_used_pct',    v_scrub_used,
    'cap_exceeded',      v_scrub_used >= coalesce(v_scrub_cap, 10)
  );
end;
$$;

grant execute on function public.get_ppl_scrub_usage(uuid) to authenticated;
