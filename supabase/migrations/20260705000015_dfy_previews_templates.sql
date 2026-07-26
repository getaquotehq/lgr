-- ============================================================================
-- DFY (managed) client content: profile, preview links, email templates
-- ============================================================================
-- Shared 1:1 between /admin and /va (both go through the va-api edge function,
-- so the same underlying rows back both panels — nothing to keep "in sync",
-- there is a single source of truth).
--
--   • companies.dfy_profile   → service area + onboarding details + campaign
--                                preferences for Done-For-You / Managed clients.
--   • preview_links           → links + screenshot URLs to send a DFY client.
--   • email_templates         → reusable email templates (global, not per-client).
--
-- Self-contained dfy_profile JSONB deliberately avoids the existing
-- onboarding_* / campaign_* columns (which the AI onboarding flow writes) so a
-- VA editing here can never clobber automated fulfilment data.
--
-- RLS enabled with no policies → service-role-only (va-api). Invisible to the
-- anon / authenticated keys.
-- ============================================================================

-- 1. DFY profile blob on companies -----------------------------------------
alter table public.companies
  add column if not exists dfy_profile jsonb not null default '{}'::jsonb;

-- 2. Preview links / screenshots to send a client ---------------------------
create table if not exists public.preview_links (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies(id) on delete cascade,
  kind        text not null default 'link',   -- 'link' | 'image'
  url         text not null,
  label       text,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists preview_links_company_idx on public.preview_links (company_id, created_at desc);

alter table public.preview_links enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'preview_links' loop
    execute format('drop policy if exists %I on public.preview_links', p.policyname);
  end loop;
end $$;

-- 3. Email templates (global, reusable) -------------------------------------
create table if not exists public.email_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  subject     text,
  body        text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists email_templates_name_idx on public.email_templates (name);

alter table public.email_templates enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'email_templates' loop
    execute format('drop policy if exists %I on public.email_templates', p.policyname);
  end loop;
end $$;

notify pgrst, 'reload schema';
