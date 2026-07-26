-- =============================================================================
-- LeadGenRentalsHQ — Migration 004: SMS Inbound Workflow Support
-- =============================================================================
-- Adds: SMS credit ledger, enhanced sms_agent_config settings (callback,
-- on-site appointment, quote drafting toggles), per-lead AI control & scoring,
-- phone-number indexes for fast lead lookup, and appointment type tracking.
-- =============================================================================

-- ─── SMS Credit Ledger ──────────────────────────────────────────────────────
-- Tracks SMS credit balance per company. Edge functions check this before
-- sending AI replies. Credits are topped up via billing or manual adjustment.

create table public.sms_credits (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade unique,
  balance       int not null default 0,        -- current SMS credits remaining
  lifetime_used int not null default 0,        -- total credits ever consumed
  updated_at    timestamptz default now()
);

create index idx_sms_credits_company on public.sms_credits (company_id);

alter table public.sms_credits enable row level security;

create policy "Company members can view sms credits"
  on public.sms_credits for select
  using (company_id = public.current_company_id());

create policy "Admins can update sms credits"
  on public.sms_credits for update
  using (company_id = public.current_company_id()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('owner', 'admin')
    ))
  with check (company_id = public.current_company_id());

-- Allow service-role inserts (edge functions use service role)
create policy "Service role can insert sms credits"
  on public.sms_credits for insert
  with check (true);

-- ─── Enhanced SMS Agent Config ──────────────────────────────────────────────
-- Add explicit columns for the workflow toggles that were previously in Make.

alter table public.sms_agent_config
  add column if not exists callback_enabled       boolean default false,
  add column if not exists callback_hours_start   time default '09:00',
  add column if not exists callback_hours_end     time default '17:00',
  add column if not exists callback_days          jsonb default '["tue","wed","fri","sat"]',
  add column if not exists onsite_enabled         boolean default false,
  add column if not exists quote_drafting_enabled  boolean default false,
  add column if not exists company_name           text,
  add column if not exists company_area           text,
  add column if not exists service_description    text;

-- ─── Per-Lead AI Control & Scoring ──────────────────────────────────────────
-- ai_enabled: toggle AI responses per lead (default true, can be turned off
-- if a human wants to take over the conversation).
-- ai_score: 0-100 lead quality score updated by AI after each interaction.
-- ai_score_reason: brief explanation of the score.

alter table public.leads
  add column if not exists ai_enabled     boolean default true,
  add column if not exists ai_score       int default 0 check (ai_score >= 0 and ai_score <= 100),
  add column if not exists ai_score_reason text;

-- Fast lookup: find a lead by phone within a company
create index if not exists idx_leads_phone on public.leads (company_id, phone);

-- Fast lookup: find sms config by twilio number
create index if not exists idx_sms_agent_twilio_number on public.sms_agent_config (twilio_number);

-- ─── Appointment Type ───────────────────────────────────────────────────────
-- Track whether an appointment is a callback or on-site visit.

create type public.appointment_type as enum ('callback', 'onsite', 'other');

alter table public.appointments
  add column if not exists appointment_type public.appointment_type default 'other';

-- ─── Helper: Deduct SMS Credit ──────────────────────────────────────────────
-- Atomically deducts 1 credit. Returns true if successful, false if no credits.
-- Called by the twilio-inbound-sms edge function before sending a reply.

create or replace function public.deduct_sms_credit(p_company_id uuid)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_balance int;
begin
  update public.sms_credits
    set balance = balance - 1,
        lifetime_used = lifetime_used + 1,
        updated_at = now()
    where company_id = p_company_id
      and balance > 0
    returning balance into v_balance;

  return found;
end;
$$;

-- ─── Auto-Provision SMS on New Company ──────────────────────────────────────
-- When a new company is created, automatically give them:
--   1. An sms_credits row (starts at 0 — topped up via billing)
--   2. A default sms_agent_config row (inactive until Twilio number is set)
-- For agency (internal) clients, also auto-map agency vault keys.

create or replace function public.provision_sms_for_company()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  -- 1. Create SMS credit row
  insert into public.sms_credits (company_id, balance)
  values (new.id, 0)
  on conflict (company_id) do nothing;

  -- 2. Create default SMS agent config (inactive until twilio_number is set)
  insert into public.sms_agent_config (company_id, name, auto_reply, is_active, lead_scoring_enabled)
  values (new.id, 'Default SMS Agent', false, false, false)
  on conflict do nothing;

  return new;
end;
$$;

create trigger auto_provision_sms
  after insert on public.companies
  for each row
  execute function public.provision_sms_for_company();

-- ─── Auto-Map Agency Keys for Internal Users ────────────────────────────────
-- When a profile is created with user_type='internal', auto-map the agency
-- vault keys so the edge function can resolve them without manual setup.

create or replace function public.provision_agency_keys()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_twilio_sid_id uuid;
  v_twilio_auth_id uuid;
  v_openai_id uuid;
begin
  if new.user_type != 'internal' then
    return new;
  end if;

  -- Look up agency vault secret IDs by name
  select id into v_twilio_sid_id from vault.secrets where name = 'agency_twilio_sid' limit 1;
  select id into v_twilio_auth_id from vault.secrets where name = 'agency_twilio_auth' limit 1;
  select id into v_openai_id from vault.secrets where name = 'agency_openai_key' limit 1;

  -- Map each key (skip if vault secret doesn't exist)
  if v_twilio_sid_id is not null then
    insert into public.agency_key_mappings (company_id, provider, vault_secret_id, label)
    values (new.company_id, 'twilio', v_twilio_sid_id, 'Agency Twilio SID')
    on conflict (company_id, provider, label) do nothing;
  end if;

  if v_twilio_auth_id is not null then
    insert into public.agency_key_mappings (company_id, provider, vault_secret_id, label)
    values (new.company_id, 'twilio_auth', v_twilio_auth_id, 'Agency Twilio Auth')
    on conflict (company_id, provider, label) do nothing;
  end if;

  if v_openai_id is not null then
    insert into public.agency_key_mappings (company_id, provider, vault_secret_id, label)
    values (new.company_id, 'openai', v_openai_id, 'Agency OpenAI Key')
    on conflict (company_id, provider, label) do nothing;
  end if;

  return new;
end;
$$;

create trigger auto_provision_agency_keys
  after insert on public.profiles
  for each row
  execute function public.provision_agency_keys();
