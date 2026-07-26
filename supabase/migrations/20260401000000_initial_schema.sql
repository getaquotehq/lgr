-- =============================================================================
-- LeadGenRentalsHQ — Initial Schema Migration
-- =============================================================================
-- Includes: companies, user profiles (internal/external), encrypted API key
-- storage, leads, quotes, appointments, sales, conversations, pgcrypto,
-- Vault integration, Row Level Security, indexes, and auto-profile trigger.
-- =============================================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto" with schema "extensions";
create extension if not exists "supabase_vault" with schema "vault";

-- ─── Enums ───────────────────────────────────────────────────────────────────

create type public.user_type as enum ('internal', 'external');
-- internal = agency-managed client (keys pre-configured by agency)
-- external = self-service client (brings their own keys)

create type public.lead_status as enum (
  'new', 'contacted', 'qualified', 'quoted', 'won', 'lost', 'follow_up'
);

create type public.quote_status as enum (
  'draft', 'sent', 'viewed', 'accepted', 'declined', 'expired'
);

create type public.appointment_status as enum (
  'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'
);

create type public.sale_status as enum (
  'pending', 'processing', 'completed', 'refunded', 'cancelled'
);

create type public.conversation_channel as enum (
  'sms', 'email', 'webchat', 'whatsapp', 'phone'
);

create type public.api_key_provider as enum (
  'openai', 'twilio', 'twilio_auth', 'sendgrid', 'stripe', 'custom'
);

-- ─── Companies ───────────────────────────────────────────────────────────────

create table public.companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text unique not null,
  domain        text,
  logo_url      text,
  plan          text default 'free',
  settings      jsonb default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index idx_companies_slug on public.companies (slug);

-- ─── User Profiles ───────────────────────────────────────────────────────────

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  user_type     public.user_type not null default 'external',
  full_name     text,
  avatar_url    text,
  role          text default 'member',     -- 'owner' | 'admin' | 'member'
  phone         text,
  is_active     boolean default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index idx_profiles_company on public.profiles (company_id);
create index idx_profiles_user_type on public.profiles (user_type);

-- ─── Encrypted API Keys ─────────────────────────────────────────────────────
-- External users store their own keys (encrypted with pgcrypto).
-- Internal users share agency-level keys stored in Supabase Vault.
--
-- Encryption uses pgp_sym_encrypt with a per-row passphrase derived from
-- the user's ID + a server-side secret. The service-role or edge function
-- decrypts at runtime — the raw key is never sent to the client.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  provider      public.api_key_provider not null,
  label         text,                                  -- e.g. "Production Twilio"
  encrypted_key bytea not null,                        -- pgp_sym_encrypt output
  key_hint      text,                                  -- last 4 chars for display
  is_active     boolean default true,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),

  unique (company_id, provider, label)
);

create index idx_api_keys_company on public.api_keys (company_id);
create index idx_api_keys_provider on public.api_keys (company_id, provider);

-- ─── Agency Keys (Vault) ────────────────────────────────────────────────────
-- For internal (agency-managed) clients the agency stores master keys in
-- Supabase Vault. This table maps a company to the Vault secret IDs so
-- edge functions can look up the correct secret at runtime.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.agency_key_mappings (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  provider        public.api_key_provider not null,
  vault_secret_id uuid not null,           -- references vault.secrets(id)
  label           text,
  is_active       boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),

  unique (company_id, provider, label)
);

create index idx_agency_keys_company on public.agency_key_mappings (company_id);

-- ─── Leads ───────────────────────────────────────────────────────────────────

create table public.leads (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  assigned_to   uuid references auth.users(id) on delete set null,
  first_name    text not null,
  last_name     text,
  email         text,
  phone         text,
  source        text,                      -- 'web_form' | 'referral' | 'ad' | etc.
  service_type  text,                      -- e.g. "Commercial Roofing"
  status        public.lead_status default 'new',
  value         numeric(12,2) default 0,
  notes         text,
  metadata      jsonb default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index idx_leads_company on public.leads (company_id);
create index idx_leads_status on public.leads (company_id, status);
create index idx_leads_assigned on public.leads (assigned_to);
create index idx_leads_created on public.leads (company_id, created_at desc);

-- ─── Quotes ──────────────────────────────────────────────────────────────────

create table public.quotes (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  lead_id       uuid references public.leads(id) on delete set null,
  created_by    uuid references auth.users(id) on delete set null,
  quote_number  text not null,
  status        public.quote_status default 'draft',
  subtotal      numeric(12,2) default 0,
  tax           numeric(12,2) default 0,
  total         numeric(12,2) default 0,
  valid_until   date,
  notes         text,
  line_items    jsonb default '[]',
  metadata      jsonb default '{}',
  sent_at       timestamptz,
  viewed_at     timestamptz,
  accepted_at   timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index idx_quotes_company on public.quotes (company_id);
create index idx_quotes_lead on public.quotes (lead_id);
create index idx_quotes_status on public.quotes (company_id, status);

-- ─── Appointments ────────────────────────────────────────────────────────────

create table public.appointments (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  lead_id       uuid references public.leads(id) on delete set null,
  assigned_to   uuid references auth.users(id) on delete set null,
  title         text not null,
  description   text,
  status        public.appointment_status default 'scheduled',
  start_time    timestamptz not null,
  end_time      timestamptz not null,
  location      text,
  meeting_url   text,
  notes         text,
  metadata      jsonb default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index idx_appointments_company on public.appointments (company_id);
create index idx_appointments_assigned on public.appointments (assigned_to);
create index idx_appointments_start on public.appointments (company_id, start_time);
create index idx_appointments_status on public.appointments (company_id, status);

-- ─── Sales ───────────────────────────────────────────────────────────────────

create table public.sales (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  quote_id      uuid references public.quotes(id) on delete set null,
  lead_id       uuid references public.leads(id) on delete set null,
  closed_by     uuid references auth.users(id) on delete set null,
  status        public.sale_status default 'pending',
  amount        numeric(12,2) not null default 0,
  currency      text default 'USD',
  notes         text,
  metadata      jsonb default '{}',
  closed_at     timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index idx_sales_company on public.sales (company_id);
create index idx_sales_status on public.sales (company_id, status);
create index idx_sales_closed_at on public.sales (company_id, closed_at desc);

-- ─── Conversations ───────────────────────────────────────────────────────────

create table public.conversations (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  lead_id       uuid references public.leads(id) on delete set null,
  channel       public.conversation_channel default 'sms',
  subject       text,
  is_open       boolean default true,
  last_message  text,
  last_message_at timestamptz,
  metadata      jsonb default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index idx_conversations_company on public.conversations (company_id);
create index idx_conversations_lead on public.conversations (lead_id);
create index idx_conversations_open on public.conversations (company_id, is_open);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid references auth.users(id) on delete set null,
  direction       text not null check (direction in ('inbound', 'outbound')),
  body            text not null,
  channel         public.conversation_channel,
  metadata        jsonb default '{}',
  created_at      timestamptz default now()
);

create index idx_messages_conversation on public.messages (conversation_id, created_at);

-- ─── Activity Log ────────────────────────────────────────────────────────────

create table public.activity_log (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  action        text not null,             -- 'lead.created', 'quote.sent', etc.
  entity_type   text,                      -- 'lead', 'quote', 'sale', etc.
  entity_id     uuid,
  details       jsonb default '{}',
  created_at    timestamptz default now()
);

create index idx_activity_company on public.activity_log (company_id, created_at desc);
create index idx_activity_entity on public.activity_log (entity_type, entity_id);

-- ─── Helper Functions ────────────────────────────────────────────────────────

-- Encrypt an API key. The passphrase is a combination of a server-side secret
-- (stored in Vault as 'app_encryption_key') and the company_id for isolation.
-- Call from a server-side context (edge function / service role) only.
create or replace function public.encrypt_api_key(
  p_raw_key text,
  p_company_id uuid
)
returns bytea
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_passphrase text;
begin
  -- Retrieve the master encryption key from Vault
  select decrypted_secret into v_passphrase
    from vault.decrypted_secrets
    where name = 'app_encryption_key'
    limit 1;

  if v_passphrase is null then
    raise exception 'Encryption key not found in Vault. Insert a secret named "app_encryption_key".';
  end if;

  return extensions.pgp_sym_encrypt(
    p_raw_key,
    v_passphrase || '::' || p_company_id::text
  );
end;
$$;

-- Decrypt an API key (server-side only).
create or replace function public.decrypt_api_key(
  p_encrypted bytea,
  p_company_id uuid
)
returns text
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_passphrase text;
begin
  select decrypted_secret into v_passphrase
    from vault.decrypted_secrets
    where name = 'app_encryption_key'
    limit 1;

  if v_passphrase is null then
    raise exception 'Encryption key not found in Vault.';
  end if;

  return extensions.pgp_sym_decrypt(
    p_encrypted,
    v_passphrase || '::' || p_company_id::text
  );
end;
$$;

-- Resolve the active API key for a given company + provider.
-- For external users → decrypts from api_keys table.
-- For internal users → fetches from Vault via agency_key_mappings.
create or replace function public.resolve_api_key(
  p_company_id uuid,
  p_provider   public.api_key_provider
)
returns text
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_user_type public.user_type;
  v_encrypted bytea;
  v_vault_id  uuid;
  v_key       text;
begin
  -- Determine company's user type from the first profile (company-level setting)
  select user_type into v_user_type
    from public.profiles
    where company_id = p_company_id
    limit 1;

  if v_user_type = 'external' then
    -- External: decrypt from api_keys
    select encrypted_key into v_encrypted
      from public.api_keys
      where company_id = p_company_id
        and provider = p_provider
        and is_active = true
      limit 1;

    if v_encrypted is null then
      raise exception 'No active % key found for company %', p_provider, p_company_id;
    end if;

    return public.decrypt_api_key(v_encrypted, p_company_id);

  else
    -- Internal: fetch from Vault via agency_key_mappings
    select vault_secret_id into v_vault_id
      from public.agency_key_mappings
      where company_id = p_company_id
        and provider = p_provider
        and is_active = true
      limit 1;

    if v_vault_id is null then
      raise exception 'No agency key mapping for % / company %', p_provider, p_company_id;
    end if;

    select decrypted_secret into v_key
      from vault.decrypted_secrets
      where id = v_vault_id;

    return v_key;
  end if;
end;
$$;

-- ─── Auto-create profile on signup ───────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_company_id uuid;
  v_user_type  public.user_type := 'external';
  v_full_name  text;
begin
  -- Pull metadata supplied at signup (e.g. via signUp({ options: { data: {...} } }))
  v_full_name  := coalesce(new.raw_user_meta_data ->> 'full_name', '');
  v_user_type  := coalesce((new.raw_user_meta_data ->> 'user_type')::public.user_type, 'external');
  v_company_id := (new.raw_user_meta_data ->> 'company_id')::uuid;

  -- If no company_id was supplied, create a new company for this user
  if v_company_id is null then
    insert into public.companies (name, slug)
    values (
      coalesce(new.raw_user_meta_data ->> 'company_name', v_full_name || '''s Company'),
      'co-' || substr(new.id::text, 1, 8)
    )
    returning id into v_company_id;
  end if;

  insert into public.profiles (id, company_id, user_type, full_name, role)
  values (
    new.id,
    v_company_id,
    v_user_type,
    v_full_name,
    case when v_user_type = 'internal' then 'member' else 'owner' end
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ─── Updated_at trigger helper ───────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply updated_at triggers to all relevant tables
do $$
declare
  tbl text;
begin
  for tbl in
    select unnest(array[
      'companies','profiles','api_keys','agency_key_mappings',
      'leads','quotes','appointments','sales','conversations'
    ])
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()',
      tbl
    );
  end loop;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ═════════════════════════════════════════════════════════════════════════════

-- Helper: get the company_id of the currently authenticated user
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = 'public'
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

-- ── Enable RLS on all tables ─────────────────────────────────────────────────
alter table public.companies           enable row level security;
alter table public.profiles            enable row level security;
alter table public.api_keys            enable row level security;
alter table public.agency_key_mappings enable row level security;
alter table public.leads               enable row level security;
alter table public.quotes              enable row level security;
alter table public.appointments        enable row level security;
alter table public.sales               enable row level security;
alter table public.conversations       enable row level security;
alter table public.messages            enable row level security;
alter table public.activity_log        enable row level security;

-- ── Companies ────────────────────────────────────────────────────────────────
create policy "Users can view own company"
  on public.companies for select
  using (id = public.current_company_id());

create policy "Owners can update own company"
  on public.companies for update
  using (id = public.current_company_id())
  with check (id = public.current_company_id());

-- ── Profiles ─────────────────────────────────────────────────────────────────
create policy "Users can view company members"
  on public.profiles for select
  using (company_id = public.current_company_id());

create policy "Users can update own profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ── API Keys (external users only) ──────────────────────────────────────────
create policy "Users can view own company keys"
  on public.api_keys for select
  using (company_id = public.current_company_id());

create policy "Users can insert keys for own company"
  on public.api_keys for insert
  with check (company_id = public.current_company_id());

create policy "Users can update own company keys"
  on public.api_keys for update
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "Users can delete own company keys"
  on public.api_keys for delete
  using (company_id = public.current_company_id());

-- ── Agency Key Mappings (read-only for internal users) ───────────────────────
create policy "Internal users can view agency key mappings"
  on public.agency_key_mappings for select
  using (company_id = public.current_company_id());

-- ── Leads ────────────────────────────────────────────────────────────────────
create policy "Company members can view leads"
  on public.leads for select
  using (company_id = public.current_company_id());

create policy "Company members can create leads"
  on public.leads for insert
  with check (company_id = public.current_company_id());

create policy "Company members can update leads"
  on public.leads for update
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "Company members can delete leads"
  on public.leads for delete
  using (company_id = public.current_company_id());

-- ── Quotes ───────────────────────────────────────────────────────────────────
create policy "Company members can view quotes"
  on public.quotes for select
  using (company_id = public.current_company_id());

create policy "Company members can create quotes"
  on public.quotes for insert
  with check (company_id = public.current_company_id());

create policy "Company members can update quotes"
  on public.quotes for update
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "Company members can delete quotes"
  on public.quotes for delete
  using (company_id = public.current_company_id());

-- ── Appointments ─────────────────────────────────────────────────────────────
create policy "Company members can view appointments"
  on public.appointments for select
  using (company_id = public.current_company_id());

create policy "Company members can create appointments"
  on public.appointments for insert
  with check (company_id = public.current_company_id());

create policy "Company members can update appointments"
  on public.appointments for update
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "Company members can delete appointments"
  on public.appointments for delete
  using (company_id = public.current_company_id());

-- ── Sales ────────────────────────────────────────────────────────────────────
create policy "Company members can view sales"
  on public.sales for select
  using (company_id = public.current_company_id());

create policy "Company members can create sales"
  on public.sales for insert
  with check (company_id = public.current_company_id());

create policy "Company members can update sales"
  on public.sales for update
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "Company members can delete sales"
  on public.sales for delete
  using (company_id = public.current_company_id());

-- ── Conversations ────────────────────────────────────────────────────────────
create policy "Company members can view conversations"
  on public.conversations for select
  using (company_id = public.current_company_id());

create policy "Company members can create conversations"
  on public.conversations for insert
  with check (company_id = public.current_company_id());

create policy "Company members can update conversations"
  on public.conversations for update
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- ── Messages ─────────────────────────────────────────────────────────────────
create policy "Company members can view messages"
  on public.messages for select
  using (
    conversation_id in (
      select id from public.conversations
      where company_id = public.current_company_id()
    )
  );

create policy "Company members can send messages"
  on public.messages for insert
  with check (
    conversation_id in (
      select id from public.conversations
      where company_id = public.current_company_id()
    )
  );

-- ── Activity Log ─────────────────────────────────────────────────────────────
create policy "Company members can view activity"
  on public.activity_log for select
  using (company_id = public.current_company_id());

create policy "Company members can log activity"
  on public.activity_log for insert
  with check (company_id = public.current_company_id());

-- ═════════════════════════════════════════════════════════════════════════════
-- Vault Setup Reminder
-- ═════════════════════════════════════════════════════════════════════════════
-- After running this migration, insert your encryption key into Vault:
--
--   select vault.create_secret('your-strong-random-passphrase', 'app_encryption_key');
--
-- For agency (internal) client keys, store each in Vault and reference via
-- agency_key_mappings:
--
--   select vault.create_secret('sk-agency-openai-key-here', 'agency_openai_key');
--   -- Then insert into agency_key_mappings with the returned secret id.
-- ═════════════════════════════════════════════════════════════════════════════
