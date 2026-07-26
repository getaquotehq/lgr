-- =============================================================================
-- VA (Virtual Assistant) account type
-- =============================================================================
-- A VA is an internal user who can VIEW (and add notes to) a specific set of
-- client companies assigned to them by a super-admin. They cannot edit anything
-- else and cannot see clients that aren't assigned to them.
--
-- DESIGN NOTE — why this is safe for existing accounts:
--   * `profiles.is_va` defaults FALSE, so every existing user is unaffected.
--   * The two new tables are brand new (nothing reads them today).
--   * We DO NOT modify any existing RLS policy. All VA data access goes through
--     the `va-api` edge function using the service role, which enforces the
--     is_va / assignment / is_admin checks itself — exactly like the existing
--     /admin panel works via `impersonate-user`. So client and super-admin
--     behaviour on every existing table is byte-for-byte unchanged.
-- =============================================================================

-- 1. Flag a user as a VA (mirrors the proven `is_admin` flag).
alter table public.profiles
  add column if not exists is_va boolean not null default false;

-- 2. Which client companies each VA manages.
create table if not exists public.va_assignments (
  id          uuid primary key default gen_random_uuid(),
  va_user_id  uuid not null references auth.users(id)      on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (va_user_id, company_id)
);
create index if not exists idx_va_assignments_va      on public.va_assignments (va_user_id);
create index if not exists idx_va_assignments_company on public.va_assignments (company_id);

-- 3. Internal, client-level notes (added by VAs or admins). NOT visible to the
--    client themselves — these are internal management notes.
create table if not exists public.client_notes (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  author_id   uuid references auth.users(id) on delete set null,
  author_name text,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_client_notes_company on public.client_notes (company_id, created_at desc);

-- 4. Lock the new tables down. RLS is ON with NO permissive policies, so no
--    normal user JWT can read or write them directly — they are reachable ONLY
--    via the va-api edge function (service role). This keeps every existing
--    table's access model completely untouched.
alter table public.va_assignments enable row level security;
alter table public.client_notes   enable row level security;
