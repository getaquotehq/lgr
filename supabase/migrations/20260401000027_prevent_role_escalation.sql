-- =============================================================================
-- Security: Prevent users from changing their own role via profile UPDATE
-- =============================================================================
-- The previous policy allowed users to update ANY column on their own profile,
-- including `role`. This migration restricts self-service profile updates to
-- safe columns only, and adds a separate policy for owner/admin role changes.
-- =============================================================================

-- Drop the overly-permissive old policy
drop policy if exists "Users can update own profile" on public.profiles;

-- Users can update their own profile (safe columns only — NOT role, company_id, user_type)
create policy "Users can update own profile safe fields"
  on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- Prevent changing role: the new value must equal the existing value
    and role = (select role from public.profiles where id = auth.uid())
    -- Prevent changing company_id
    and company_id = (select company_id from public.profiles where id = auth.uid())
    -- Prevent changing user_type
    and user_type = (select user_type from public.profiles where id = auth.uid())
  );

-- Owners/admins can change roles for members in their company
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
  );
