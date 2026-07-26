-- =============================================================================
-- LeadGenRentalsHQ — Migration 003: Pipeline Stages, Opportunities, Kanban
-- =============================================================================
-- Replaces lead_status with a unified pipeline_stage used across leads,
-- opportunities, quotes, appointments, and sales. Adds opportunities table.
-- =============================================================================

-- ─── New Pipeline Stage Enum ─────────────────────────────────────────────────
-- This is the single source of truth for where a deal sits in the pipeline.
-- Used by leads, opportunities, and referenced by quotes/appointments/sales.

create type public.pipeline_stage as enum (
  'new_lead',
  'follow_up',
  'quote_in_progress',
  'quoted',
  'closed_won',
  'closed_lost'
);

-- ─── Update Leads table ──────────────────────────────────────────────────────
-- Add the new pipeline_stage column, migrate data from old status, then drop old.

alter table public.leads
  add column pipeline_stage public.pipeline_stage default 'new_lead';

-- Migrate existing lead_status values to pipeline_stage
update public.leads set pipeline_stage = 'new_lead'          where status = 'new';
update public.leads set pipeline_stage = 'follow_up'         where status = 'contacted';
update public.leads set pipeline_stage = 'follow_up'         where status = 'qualified';
update public.leads set pipeline_stage = 'follow_up'         where status = 'follow_up';
update public.leads set pipeline_stage = 'quoted'            where status = 'quoted';
update public.leads set pipeline_stage = 'closed_won'        where status = 'won';
update public.leads set pipeline_stage = 'closed_lost'       where status = 'lost';

-- Drop old status column and enum
alter table public.leads drop column status;
drop type public.lead_status;

-- Add pipeline position for Kanban ordering within a stage
alter table public.leads
  add column pipeline_position int default 0;

create index idx_leads_pipeline on public.leads (company_id, pipeline_stage);
create index idx_leads_pipeline_pos on public.leads (company_id, pipeline_stage, pipeline_position);

-- ─── Opportunities ───────────────────────────────────────────────────────────
-- An opportunity is created when a lead progresses beyond initial contact.
-- It ties together the lead, quotes, appointments, and eventual sale.

create table public.opportunities (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  lead_id         uuid not null references public.leads(id) on delete cascade,
  assigned_to     uuid references auth.users(id) on delete set null,
  name            text not null,              -- e.g. "Smith Residence - Roof Replacement"
  pipeline_stage  public.pipeline_stage default 'new_lead',
  pipeline_position int default 0,            -- ordering within the stage for Kanban
  expected_value  numeric(12,2) default 0,
  actual_value    numeric(12,2),
  probability     int default 0 check (probability >= 0 and probability <= 100),
  expected_close  date,
  closed_at       timestamptz,
  loss_reason     text,
  notes           text,
  metadata        jsonb default '{}',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index idx_opportunities_company on public.opportunities (company_id);
create index idx_opportunities_lead on public.opportunities (lead_id);
create index idx_opportunities_pipeline on public.opportunities (company_id, pipeline_stage);
create index idx_opportunities_pipeline_pos on public.opportunities (company_id, pipeline_stage, pipeline_position);
create index idx_opportunities_assigned on public.opportunities (assigned_to);

create trigger set_updated_at before update on public.opportunities
  for each row execute function public.set_updated_at();

-- ─── Link quotes, appointments, sales to opportunities ──────────────────────

alter table public.quotes
  add column opportunity_id uuid references public.opportunities(id) on delete set null;

alter table public.appointments
  add column opportunity_id uuid references public.opportunities(id) on delete set null;

alter table public.sales
  add column opportunity_id uuid references public.opportunities(id) on delete set null;

create index idx_quotes_opportunity on public.quotes (opportunity_id);
create index idx_appointments_opportunity on public.appointments (opportunity_id);
create index idx_sales_opportunity on public.sales (opportunity_id);

-- ─── Auto-sync pipeline stage ────────────────────────────────────────────────
-- When a lead's pipeline_stage changes, update all linked opportunities.
-- When an opportunity's stage changes, update the lead.

create or replace function public.sync_lead_pipeline_stage()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.pipeline_stage is distinct from old.pipeline_stage then
    update public.opportunities
      set pipeline_stage = new.pipeline_stage,
          updated_at = now()
      where lead_id = new.id
        and pipeline_stage is distinct from new.pipeline_stage;
  end if;
  return new;
end;
$$;

create trigger sync_lead_stage
  after update on public.leads
  for each row
  execute function public.sync_lead_pipeline_stage();

create or replace function public.sync_opportunity_pipeline_stage()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.pipeline_stage is distinct from old.pipeline_stage then
    update public.leads
      set pipeline_stage = new.pipeline_stage,
          updated_at = now()
      where id = new.lead_id
        and pipeline_stage is distinct from new.pipeline_stage;
  end if;
  return new;
end;
$$;

create trigger sync_opportunity_stage
  after update on public.opportunities
  for each row
  execute function public.sync_opportunity_pipeline_stage();

-- ─── Auto-advance pipeline on key events ─────────────────────────────────────

-- When a quote is created → move to 'quote_in_progress'
create or replace function public.on_quote_created()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.lead_id is not null then
    update public.leads
      set pipeline_stage = 'quote_in_progress'
      where id = new.lead_id
        and pipeline_stage in ('new_lead', 'follow_up');
  end if;
  return new;
end;
$$;

create trigger auto_advance_on_quote
  after insert on public.quotes
  for each row
  execute function public.on_quote_created();

-- When a quote is sent → move to 'quoted'
create or replace function public.on_quote_sent()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.status = 'sent' and old.status != 'sent' and new.lead_id is not null then
    update public.leads
      set pipeline_stage = 'quoted'
      where id = new.lead_id
        and pipeline_stage in ('new_lead', 'follow_up', 'quote_in_progress');
  end if;
  return new;
end;
$$;

create trigger auto_advance_on_quote_sent
  after update on public.quotes
  for each row
  execute function public.on_quote_sent();

-- When a sale is completed → move to 'closed_won'
create or replace function public.on_sale_completed()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.status = 'completed' then
    if new.lead_id is not null then
      update public.leads
        set pipeline_stage = 'closed_won'
        where id = new.lead_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger auto_advance_on_sale
  after insert or update on public.sales
  for each row
  execute function public.on_sale_completed();

-- ─── Kanban board helper view ────────────────────────────────────────────────
-- Returns leads grouped by pipeline stage with related counts.
-- Use: select * from pipeline_board where company_id = '...';

create or replace view public.pipeline_board as
select
  l.id as lead_id,
  l.company_id,
  l.pipeline_stage,
  l.pipeline_position,
  l.first_name,
  l.last_name,
  l.email,
  l.phone,
  l.service_type,
  l.value,
  l.assigned_to,
  l.created_at,
  l.updated_at,
  -- Opportunity info
  o.id as opportunity_id,
  o.name as opportunity_name,
  o.expected_value,
  o.probability,
  o.expected_close,
  -- Counts
  (select count(*) from public.quotes q where q.lead_id = l.id) as quote_count,
  (select count(*) from public.appointments a where a.lead_id = l.id) as appointment_count,
  (select count(*) from public.sales s where s.lead_id = l.id) as sale_count,
  (select count(*) from public.conversations c where c.lead_id = l.id) as conversation_count
from public.leads l
left join public.opportunities o on o.lead_id = l.id
order by l.pipeline_stage, l.pipeline_position;

-- ─── RLS for Opportunities ───────────────────────────────────────────────────
alter table public.opportunities enable row level security;

create policy "Company members can view opportunities"
  on public.opportunities for select
  using (company_id = public.current_company_id());

create policy "Company members can create opportunities"
  on public.opportunities for insert
  with check (company_id = public.current_company_id());

create policy "Company members can update opportunities"
  on public.opportunities for update
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "Company members can delete opportunities"
  on public.opportunities for delete
  using (company_id = public.current_company_id());

-- ─── Add opportunities visibility to sales reps ─────────────────────────────
alter table public.sales_reps
  add column opportunities_visibility public.rep_visibility default 'assigned_only';
