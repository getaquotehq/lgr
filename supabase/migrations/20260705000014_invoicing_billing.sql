-- ============================================================================
-- VA + Admin invoicing / billing  (Phase 1: DB)
-- ============================================================================
-- Adds billing / onboarding tracking to companies, an invoices table (modelled
-- an invoices table, and a single-row business_settings holding the
-- bank details + PDF defaults.
--
-- Every read/write goes through the `va-api` edge function (service role), so
-- the app never needs an RLS policy here. We still ENABLE RLS with no policies
-- so the tables are invisible to the anon / authenticated keys - nothing can be
-- read or written except by the service role (which bypasses RLS).
-- ============================================================================

-- 1. Company billing / onboarding fields ------------------------------------
alter table public.companies
  add column if not exists payment_method    text,                 -- 'invoice' | 'stripe' | null
  add column if not exists ads_live_date      date,                 -- when their ads went live
  add column if not exists next_invoice_due   date,                 -- when the next invoice is due
  add column if not exists invoice_status      text default 'none', -- none | due | sent | paid | unpaid
  add column if not exists va_intro_done       boolean not null default false,
  add column if not exists va_intro_done_at    timestamptz;

-- 2. Invoice numbering sequence ---------------------------------------------
create sequence if not exists public.invoice_number_seq start 1000;

-- 3. Invoices ----------------------------------------------------------------
create table if not exists public.invoices (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid references public.companies(id) on delete set null,
  invoice_number         text default ('INV-' || lpad(nextval('public.invoice_number_seq')::text, 5, '0')),
  client_name            text,
  client_email           text,
  offer_type             text,
  vertical               text,
  delivery_period_start  date,
  delivery_period_end    date,
  line_items             jsonb not null default '[]'::jsonb,
  subtotal               numeric(12,2) not null default 0,
  gst_type               text default 'exclusive',   -- 'exclusive' | 'inclusive' | 'none'
  gst_amount             numeric(12,2) not null default 0,
  total                  numeric(12,2) not null default 0,
  payment_details        text,
  notes                  text,
  status                 text not null default 'draft', -- draft | sent | paid | unpaid
  invoice_date           date,
  due_date               date,
  created_by             uuid,          -- profiles.id of the admin/VA who raised it
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists invoices_company_id_idx on public.invoices (company_id);
create index if not exists invoices_status_idx     on public.invoices (status);
create index if not exists invoices_created_idx    on public.invoices (created_at desc);

-- Locked down: only the service role (va-api) touches this table.
alter table public.invoices enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'invoices' loop
    execute format('drop policy if exists %I on public.invoices', p.policyname);
  end loop;
end $$;

-- 4. Business settings (bank details + PDF defaults) - single row -----------
create table if not exists public.business_settings (
  id              int primary key default 1,
  business_name   text,
  abn             text,
  bank_name       text,
  account_name    text,
  bsb             text,
  account_number  text,
  payment_details text,   -- freeform fallback (e.g. "PayID: pay@leadgenrentals.com.au")
  logo_url        text,
  updated_at      timestamptz not null default now(),
  constraint business_settings_singleton check (id = 1)
);
insert into public.business_settings (id) values (1) on conflict (id) do nothing;

alter table public.business_settings enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'business_settings' loop
    execute format('drop policy if exists %I on public.business_settings', p.policyname);
  end loop;
end $$;

-- Refresh PostgREST's schema cache so the new columns/tables are queryable.
notify pgrst, 'reload schema';
