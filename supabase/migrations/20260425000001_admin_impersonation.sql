-- =============================================================================
-- Admin Impersonation: add is_admin flag to profiles
-- =============================================================================
-- is_admin = true identifies platform-level super-admins who can impersonate
-- any user via the internal admin panel.  This is completely separate from the
-- company-level `role` column ('owner' | 'admin' | 'member').
--
-- The column can only be set by the service role (edge functions / Supabase
-- Dashboard).  All RLS policies that govern profile updates are tightened to
-- include is_admin in the list of immutable fields for regular users.
-- =============================================================================

-- ─── 1. Add column ────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create index if not exists idx_profiles_is_admin
  on public.profiles (is_admin)
  where is_admin = true;

-- ─── 2. Tighten safe-fields UPDATE policy ────────────────────────────────────
-- The existing policy (from migration 27) already prevents changing role,
-- company_id and user_type.  We extend it to also freeze is_admin so that a
-- normal authenticated user cannot grant themselves super-admin access.

drop policy if exists "Users can update own profile safe fields" on public.profiles;

create policy "Users can update own profile safe fields"
  on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- role must stay the same
    and role = (select role from public.profiles where id = auth.uid())
    -- company_id must stay the same
    and company_id = (select company_id from public.profiles where id = auth.uid())
    -- user_type must stay the same
    and user_type = (select user_type from public.profiles where id = auth.uid())
    -- is_admin must stay the same (cannot self-grant super-admin)
    and is_admin = (select is_admin from public.profiles where id = auth.uid())
  );

-- ─── 3. Tighten admin role-change policy ─────────────────────────────────────
-- Owners/admins can change company-level roles for members, but they must
-- never be allowed to flip is_admin via this policy either.

drop policy if exists "Admins can change member roles" on public.profiles;

create policy "Admins can change member roles"
  on public.profiles for update
  using (
    company_id = public.current_company_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.company_id = profiles.company_id
        and p.role in ('owner', 'admin')
    )
  )
  with check (
    company_id = public.current_company_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.company_id = profiles.company_id
        and p.role in ('owner', 'admin')
    )
    -- is_admin may never be changed through this policy
    and is_admin = (select is_admin from public.profiles where id = profiles.id)
  );

-- ─── 4. Allow is_admin users to read all profiles ────────────────────────────
-- The admin panel lists every user in the system.  We grant a SELECT policy
-- scoped to rows where the caller has is_admin = true.

create policy "Super-admins can read all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_admin = true
    )
  );
