-- =============================================================================
-- Fix: Recursive RLS policy on profiles table
-- =============================================================================
-- Migration 20260425000001 added "Super-admins can read all profiles" with a
-- USING clause that queries public.profiles directly inside a SELECT policy for
-- public.profiles. This causes PostgreSQL's infinite recursion guard to fire
-- ("ERROR: infinite recursion detected in policy for relation 'profiles'") for
-- every profiles query, breaking the dashboard and admin panel.
--
-- The fix mirrors the existing pattern used by current_company_id(): wrap the
-- self-referential table access in a SECURITY DEFINER function so that it
-- bypasses RLS and cannot recurse.
-- =============================================================================

-- ─── 1. SECURITY DEFINER helper: is_super_admin() ────────────────────────────
-- Queries profiles with RLS disabled (SECURITY DEFINER) so the call can safely
-- be used inside RLS policies without causing infinite recursion.

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select case
    when auth.uid() is null then false
    else coalesce(
      (select is_admin from public.profiles where id = auth.uid()),
      false
    )
  end;
$$;

-- ─── 2. Replace the recursive SELECT policy ───────────────────────────────────
-- The old policy contained `exists (select 1 from public.profiles …)` inside
-- its USING expression — a direct recursive reference that PostgreSQL rejects.
-- The new policy delegates the check to is_super_admin() which reads profiles
-- via SECURITY DEFINER (RLS-bypass), breaking the cycle.

drop policy if exists "Super-admins can read all profiles" on public.profiles;

create policy "Super-admins can read all profiles"
  on public.profiles for select
  using (public.is_super_admin());
