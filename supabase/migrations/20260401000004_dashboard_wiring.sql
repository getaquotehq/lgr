-- =============================================================================
-- LeadGenRentalsHQ — Migration 004: Dashboard Wiring
-- =============================================================================
-- Adds missing tables and columns that the dashboard frontend expects:
--   1. custom_fields — dynamic lead form fields per company
--   2. twilio_numbers — phone numbers linked to a company
--   3. ai_workflow_runs — log of AI agent workflow executions
--   4. sales_rep_invites — team member invitation tracking
--   5. Leads table: name, address, postcode, custom_data columns
--   6. sms_agent_config: additional dashboard-expected columns
-- =============================================================================

-- ─── Custom Fields ──────────────────────────────────────────────────────────
-- Allows companies to define custom form fields for lead capture.

create table if not exists public.custom_fields (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  label       text not null,
  key         text not null,
  type        text not null default 'text',  -- text, number, email, textarea, date, etc.
  created_at  timestamptz default now(),
  unique(company_id, key)
);

create index if not exists idx_custom_fields_company on public.custom_fields (company_id);

alter table public.custom_fields enable row level security;

do $$ begin
  create policy "Company members can view custom fields"
    on public.custom_fields for select
    using (company_id = public.current_company_id());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Company members can manage custom fields"
    on public.custom_fields for all
    using (company_id = public.current_company_id())
    with check (company_id = public.current_company_id());
exception when duplicate_object then null;
end $$;

-- ─── Twilio Numbers ─────────────────────────────────────────────────────────
-- Tracks Twilio phone numbers associated with a company workspace.

create table if not exists public.twilio_numbers (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  phone_number  text not null,
  friendly_name text,
  created_at    timestamptz default now()
);

create index if not exists idx_twilio_numbers_company on public.twilio_numbers (company_id);

alter table public.twilio_numbers enable row level security;

do $$ begin
  create policy "Company members can view twilio numbers"
    on public.twilio_numbers for select
    using (company_id = public.current_company_id());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Company members can manage twilio numbers"
    on public.twilio_numbers for all
    using (company_id = public.current_company_id())
    with check (company_id = public.current_company_id());
exception when duplicate_object then null;
end $$;

-- ─── AI Workflow Runs ───────────────────────────────────────────────────────
-- Logs each AI workflow execution for audit and dashboard display.

create table if not exists public.ai_workflow_runs (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  workflow_type  text not null,         -- e.g. 'sms_reply', 'quote_draft', 'follow_up'
  status         text default 'success', -- 'success', 'error', 'skipped'
  model          text,                   -- LLM model used
  key_source     text,                   -- 'agency' or 'customer'
  error_text     text,
  metadata       jsonb default '{}',
  created_at     timestamptz default now()
);

create index if not exists idx_ai_workflow_runs_company on public.ai_workflow_runs (company_id, created_at desc);

alter table public.ai_workflow_runs enable row level security;

do $$ begin
  create policy "Company members can view workflow runs"
    on public.ai_workflow_runs for select
    using (company_id = public.current_company_id());
exception when duplicate_object then null;
end $$;

-- Allow service-role inserts (edge functions log runs)
do $$ begin
  create policy "Service role can insert workflow runs"
    on public.ai_workflow_runs for insert
    with check (true);
exception when duplicate_object then null;
end $$;

-- ─── Sales Rep Invites ──────────────────────────────────────────────────────
-- Tracks pending team member invitations before they accept.

create table if not exists public.sales_rep_invites (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  email       text not null,
  full_name   text,
  phone       text,
  status      text default 'pending',  -- 'pending', 'accepted', 'revoked'
  invited_at  timestamptz default now(),
  accepted_at timestamptz,
  revoked_at  timestamptz
);

create index if not exists idx_sales_rep_invites_company on public.sales_rep_invites (company_id, status);

alter table public.sales_rep_invites enable row level security;

do $$ begin
  create policy "Company members can view invites"
    on public.sales_rep_invites for select
    using (company_id = public.current_company_id());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Company members can manage invites"
    on public.sales_rep_invites for all
    using (company_id = public.current_company_id())
    with check (company_id = public.current_company_id());
exception when duplicate_object then null;
end $$;

-- ─── Companies Table — Additional Columns ───────────────────────────────────
-- The dashboard settings form expects email and phone on the company.

alter table public.companies
  add column if not exists email text,
  add column if not exists phone text;

-- ─── Leads Table — Additional Columns ───────────────────────────────────────
-- The dashboard expects: name (single field), address, postcode, custom_data

alter table public.leads
  add column if not exists name        text,
  add column if not exists address     text,
  add column if not exists postcode    text,
  add column if not exists custom_data jsonb default '{}';

-- Backfill name from first_name + last_name for existing rows
update public.leads
  set name = trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
  where name is null;

-- ─── SMS Agent Config — Additional Dashboard Columns ────────────────────────
-- The dashboard AI settings form expects columns beyond what migration 003 added.

alter table public.sms_agent_config
  add column if not exists agent_name              text,
  add column if not exists special_offers           text,
  add column if not exists welcome_message          text default 'Hi {{first_name}}, thanks for reaching out!',
  add column if not exists service_locations        jsonb default '[]',
  add column if not exists max_travel_distance      int default 50,
  add column if not exists max_travel_distance_unit text default 'km',
  add column if not exists preparation_required     text,
  add column if not exists automate_quote_followup  boolean default false,
  add column if not exists followup_message         text default 'Hi {{first_name}}, just following up on your quote!',
  add column if not exists days_until_followup      int default 3,
  add column if not exists ai_nurture_enabled       boolean default true,
  add column if not exists lead_scoring_enabled     boolean default false,
  add column if not exists max_sms_words            int default 15,
  add column if not exists reply_delay_seconds      int default 0;
