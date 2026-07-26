-- =============================================================================
-- Fix: "new row violates row-level security policy for table leads"
-- =============================================================================
-- Root cause: when a rep inserts a lead via .insert().select(), PostgREST
-- tries to SELECT the row back to return it (RETURNING clause).  If the rep's
-- leads_visibility is 'assigned_only' and the lead isn't routed to them, or
-- their visibility is 'none', the SELECT policy returns no rows.  PostgREST
-- interprets the missing row as an RLS violation and throws the error.
--
-- Fix: add a `created_by` column (auto-filled from auth.uid() on insert) and
-- extend the SELECT policy to also show leads the authenticated user created.
-- This ensures PostgREST can always read back the row it just inserted.
-- =============================================================================

-- ── 1. Add created_by column ─────────────────────────────────────────────────
alter table public.leads
  add column if not exists created_by uuid references auth.users(id) on delete set null;

-- ── 2. Trigger: auto-populate created_by from auth.uid() on insert ───────────
create or replace function public.set_lead_created_by()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists lead_set_created_by on public.leads;
create trigger lead_set_created_by
  before insert on public.leads
  for each row
  execute function public.set_lead_created_by();

-- ── 3. Update SELECT policy to include rows the caller created ────────────────
-- Drops the policy added by migration 22 (which replaced the original from 0).
drop policy if exists "Company members can view leads" on public.leads;

create policy "Company members can view leads"
  on public.leads for select
  using (
    company_id = public.current_company_id()
    and (
      -- Normal visibility rules
      public.get_rep_visibility(auth.uid(), 'leads') = 'all'
      or (
        public.get_rep_visibility(auth.uid(), 'leads') = 'assigned_only'
        and assigned_to = auth.uid()
      )
      -- Always allow seeing a lead you just created so PostgREST's RETURNING
      -- clause can read the row back without throwing an RLS error.
      or created_by = auth.uid()
    )
  );
