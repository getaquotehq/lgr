-- =============================================================================
-- LeadGenRentalsHQ — Migration 002: AI SMS Agent, Sales Reps
-- =============================================================================

-- ─── Sales Reps ──────────────────────────────────────────────────────────────
-- Each company can have up to 10 reps. Visibility controls what each rep
-- can access: leads, quotes, appointments, sales, conversations.

do $$ begin
  create type public.rep_visibility as enum (
    'all',           -- sees everything in the company
    'assigned_only', -- only sees records assigned to them
    'none'           -- no access to this section
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.sales_reps (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  email           text,
  phone           text,
  is_active       boolean default true,

  -- Visibility per section
  leads_visibility         public.rep_visibility default 'assigned_only',
  quotes_visibility        public.rep_visibility default 'assigned_only',
  appointments_visibility  public.rep_visibility default 'assigned_only',
  sales_visibility         public.rep_visibility default 'assigned_only',
  conversations_visibility public.rep_visibility default 'assigned_only',

  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),

  unique (company_id, user_id)
);

create index if not exists idx_sales_reps_company on public.sales_reps (company_id);
create index if not exists idx_sales_reps_user on public.sales_reps (user_id);

-- Enforce max 10 reps per company
create or replace function public.check_rep_limit()
returns trigger
language plpgsql
as $$
begin
  if (
    select count(*) from public.sales_reps
    where company_id = new.company_id
  ) >= 10 then
    raise exception 'Maximum of 10 sales reps per company reached.';
  end if;
  return new;
end;
$$;

create or replace trigger enforce_rep_limit
  before insert on public.sales_reps
  for each row
  execute function public.check_rep_limit();

-- updated_at trigger
create or replace trigger set_updated_at before update on public.sales_reps
  for each row execute function public.set_updated_at();

-- ─── SMS Agent Config ────────────────────────────────────────────────────────
-- Stores AI SMS agent configuration per company (uses Twilio + OpenAI).

create table if not exists public.sms_agent_config (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  name            text not null default 'Default SMS Agent',
  system_prompt   text,                      -- AI personality / instructions
  twilio_number   text,                      -- Twilio phone number to send from
  model           text default 'gpt-4o',     -- LLM model for the agent
  auto_reply      boolean default true,      -- auto-respond to inbound SMS
  reply_delay     int default 0,             -- delay in seconds before replying
  max_messages    int default 50,            -- max AI messages per conversation
  business_hours  jsonb default '{}',        -- e.g. {"mon": ["09:00","17:00"], ...}
  out_of_hours_msg text,                     -- message sent outside business hours
  is_active       boolean default true,
  settings        jsonb default '{}',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_sms_agent_company on public.sms_agent_config (company_id);

create or replace trigger set_updated_at before update on public.sms_agent_config
  for each row execute function public.set_updated_at();

-- ─── Add agent tracking to messages ──────────────────────────────────────────
-- Track whether a message was sent by AI or a human.

alter table public.messages add column if not exists is_ai_generated boolean default false;
alter table public.messages add column if not exists agent_type text;  -- 'sms' | null (human)

-- ─── Add agent tracking to conversations ────────────────────────────────────
alter table public.conversations add column if not exists assigned_to uuid references auth.users(id) on delete set null;
alter table public.conversations add column if not exists sms_config_id uuid references public.sms_agent_config(id) on delete set null;

-- ═════════════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Sales Reps ───────────────────────────────────────────────────────────────
alter table public.sales_reps enable row level security;

do $$ begin
  create policy "Company members can view reps"
    on public.sales_reps for select
    using (company_id = public.current_company_id());
exception when duplicate_object then null;
end $$;

-- Only owners/admins can manage reps
do $$ begin
  create policy "Admins can create reps"
    on public.sales_reps for insert
    with check (
      company_id = public.current_company_id()
      and exists (
        select 1 from public.profiles
        where id = auth.uid()
          and role in ('owner', 'admin')
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Admins can update reps"
    on public.sales_reps for update
    using (company_id = public.current_company_id()
      and exists (
        select 1 from public.profiles
        where id = auth.uid()
          and role in ('owner', 'admin')
      ))
    with check (company_id = public.current_company_id());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Admins can delete reps"
    on public.sales_reps for delete
    using (company_id = public.current_company_id()
      and exists (
        select 1 from public.profiles
        where id = auth.uid()
          and role in ('owner', 'admin')
      ));
exception when duplicate_object then null;
end $$;

-- ── SMS Agent Config ─────────────────────────────────────────────────────────
alter table public.sms_agent_config enable row level security;

do $$ begin
  create policy "Company members can view sms config"
    on public.sms_agent_config for select
    using (company_id = public.current_company_id());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Company members can manage sms config"
    on public.sms_agent_config for all
    using (company_id = public.current_company_id())
    with check (company_id = public.current_company_id());
exception when duplicate_object then null;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Rep Visibility Helper
-- ═════════════════════════════════════════════════════════════════════════════
-- Use this in edge functions / app logic to check what a rep can see.
-- Returns the visibility level for a given user + section.

create or replace function public.get_rep_visibility(
  p_user_id uuid,
  p_section text   -- 'leads', 'quotes', 'appointments', 'sales', 'conversations'
)
returns public.rep_visibility
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_visibility public.rep_visibility;
  v_role text;
begin
  -- Owners/admins always see everything
  select role into v_role from public.profiles where id = p_user_id;
  if v_role in ('owner', 'admin') then
    return 'all';
  end if;

  -- Check rep record
  execute format(
    'select %I from public.sales_reps where user_id = $1 and is_active = true limit 1',
    p_section || '_visibility'
  ) into v_visibility using p_user_id;

  return coalesce(v_visibility, 'none');
end;
$$;
