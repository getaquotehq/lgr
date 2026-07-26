-- =============================================================================
-- LeadGenRentalsHQ — Migration 022: Permissions, Visibility RLS & Lead Routing
-- =============================================================================
-- Adds per-action permission flags to sales_reps, updates RLS policies to
-- respect visibility settings, and adds lead routing configuration.
-- =============================================================================

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Permission columns on sales_reps
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.sales_reps
  add column if not exists can_edit_leads        boolean not null default false,
  add column if not exists can_edit_quotes       boolean not null default false,
  add column if not exists can_edit_appointments boolean not null default false,
  add column if not exists can_manage_pipeline   boolean not null default false,
  add column if not exists can_send_sms          boolean not null default false,
  add column if not exists can_initiate_calls    boolean not null default false;

-- Back-fill: any rep whose profile is owner/admin gets all permissions
update public.sales_reps sr
set
  can_edit_leads        = true,
  can_edit_quotes       = true,
  can_edit_appointments = true,
  can_manage_pipeline   = true,
  can_send_sms          = true,
  can_initiate_calls    = true
from public.profiles p
where sr.user_id = p.id
  and p.role in ('owner', 'admin');

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Helper: check if a user has a specific permission
-- ═════════════════════════════════════════════════════════════════════════════
-- Returns true if the user is owner/admin OR the sales_reps flag is true.
-- Used inside RLS policies for UPDATE/DELETE gates.

create or replace function public.has_permission(
  p_user_id uuid,
  p_permission text  -- 'can_edit_leads','can_edit_quotes','can_edit_appointments','can_manage_pipeline','can_send_sms','can_initiate_calls'
)
returns boolean
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_role text;
  v_result boolean;
begin
  select role into v_role from public.profiles where id = p_user_id;
  if v_role in ('owner', 'admin') then
    return true;
  end if;

  execute format(
    'select %I from public.sales_reps where user_id = $1 and is_active = true limit 1',
    p_permission
  ) into v_result using p_user_id;

  return coalesce(v_result, false);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Replace SELECT policies with visibility-aware versions
-- ═════════════════════════════════════════════════════════════════════════════
-- Pattern: company check + visibility filter.
--   'all'           → see all company records
--   'assigned_only' → only where assigned_to = auth.uid()
--   'none'          → nothing (no rows)
-- Owners/admins always get 'all' via get_rep_visibility().

-- ── Leads ────────────────────────────────────────────────────────────────────
drop policy if exists "Company members can view leads"   on public.leads;
drop policy if exists "Company members can update leads"  on public.leads;
drop policy if exists "Company members can delete leads"  on public.leads;

create policy "Company members can view leads"
  on public.leads for select
  using (
    company_id = public.current_company_id()
    and (
      public.get_rep_visibility(auth.uid(), 'leads') = 'all'
      or (
        public.get_rep_visibility(auth.uid(), 'leads') = 'assigned_only'
        and assigned_to = auth.uid()
      )
    )
  );

create policy "Company members can update leads"
  on public.leads for update
  using (
    company_id = public.current_company_id()
    and public.has_permission(auth.uid(), 'can_edit_leads')
  )
  with check (company_id = public.current_company_id());

create policy "Company members can delete leads"
  on public.leads for delete
  using (
    company_id = public.current_company_id()
    and public.has_permission(auth.uid(), 'can_edit_leads')
  );

-- ── Quotes ───────────────────────────────────────────────────────────────────
-- Quotes link to leads via lead_id. Visibility follows the lead's assignment.
drop policy if exists "Company members can view quotes"   on public.quotes;
drop policy if exists "Company members can update quotes"  on public.quotes;
drop policy if exists "Company members can delete quotes"  on public.quotes;

create policy "Company members can view quotes"
  on public.quotes for select
  using (
    company_id = public.current_company_id()
    and (
      public.get_rep_visibility(auth.uid(), 'quotes') = 'all'
      or (
        public.get_rep_visibility(auth.uid(), 'quotes') = 'assigned_only'
        and (
          created_by = auth.uid()
          or lead_id in (
            select id from public.leads where assigned_to = auth.uid()
          )
        )
      )
    )
  );

create policy "Company members can update quotes"
  on public.quotes for update
  using (
    company_id = public.current_company_id()
    and public.has_permission(auth.uid(), 'can_edit_quotes')
  )
  with check (company_id = public.current_company_id());

create policy "Company members can delete quotes"
  on public.quotes for delete
  using (
    company_id = public.current_company_id()
    and public.has_permission(auth.uid(), 'can_edit_quotes')
  );

-- ── Appointments ─────────────────────────────────────────────────────────────
drop policy if exists "Company members can view appointments"   on public.appointments;
drop policy if exists "Company members can update appointments"  on public.appointments;
drop policy if exists "Company members can delete appointments"  on public.appointments;

create policy "Company members can view appointments"
  on public.appointments for select
  using (
    company_id = public.current_company_id()
    and (
      public.get_rep_visibility(auth.uid(), 'appointments') = 'all'
      or (
        public.get_rep_visibility(auth.uid(), 'appointments') = 'assigned_only'
        and assigned_to = auth.uid()
      )
    )
  );

create policy "Company members can update appointments"
  on public.appointments for update
  using (
    company_id = public.current_company_id()
    and public.has_permission(auth.uid(), 'can_edit_appointments')
  )
  with check (company_id = public.current_company_id());

create policy "Company members can delete appointments"
  on public.appointments for delete
  using (
    company_id = public.current_company_id()
    and public.has_permission(auth.uid(), 'can_edit_appointments')
  );

-- ── Sales ────────────────────────────────────────────────────────────────────
-- Sales use closed_by rather than assigned_to.
drop policy if exists "Company members can view sales"   on public.sales;
drop policy if exists "Company members can update sales"  on public.sales;
drop policy if exists "Company members can delete sales"  on public.sales;

create policy "Company members can view sales"
  on public.sales for select
  using (
    company_id = public.current_company_id()
    and (
      public.get_rep_visibility(auth.uid(), 'sales') = 'all'
      or (
        public.get_rep_visibility(auth.uid(), 'sales') = 'assigned_only'
        and closed_by = auth.uid()
      )
    )
  );

create policy "Company members can update sales"
  on public.sales for update
  using (
    company_id = public.current_company_id()
    and public.has_permission(auth.uid(), 'can_edit_leads')
  )
  with check (company_id = public.current_company_id());

create policy "Company members can delete sales"
  on public.sales for delete
  using (
    company_id = public.current_company_id()
    and public.has_permission(auth.uid(), 'can_edit_leads')
  );

-- ── Conversations ────────────────────────────────────────────────────────────
drop policy if exists "Company members can view conversations"   on public.conversations;
drop policy if exists "Company members can update conversations"  on public.conversations;

create policy "Company members can view conversations"
  on public.conversations for select
  using (
    company_id = public.current_company_id()
    and (
      public.get_rep_visibility(auth.uid(), 'conversations') = 'all'
      or (
        public.get_rep_visibility(auth.uid(), 'conversations') = 'assigned_only'
        and assigned_to = auth.uid()
      )
    )
  );

create policy "Company members can update conversations"
  on public.conversations for update
  using (
    company_id = public.current_company_id()
    and (
      public.get_rep_visibility(auth.uid(), 'conversations') = 'all'
      or (
        public.get_rep_visibility(auth.uid(), 'conversations') = 'assigned_only'
        and assigned_to = auth.uid()
      )
    )
  )
  with check (company_id = public.current_company_id());

-- INSERT policies stay unchanged — any company member can create records.
-- The visibility filters only restrict what they can SEE and EDIT.

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Lead routing helper (called from edge functions)
-- ═════════════════════════════════════════════════════════════════════════════
-- Routing config lives in companies.settings->'lead_routing':
--   { "mode": "all" | "round_robin" | "postcode",
--     "round_robin_index": 0,
--     "postcode_rules": [ { "postcodes": ["2000","2001"], "rep_id": "uuid" } ] }
--
-- This function picks the right rep and returns their user_id (or null for "all").

create or replace function public.route_lead(
  p_company_id uuid,
  p_postcode   text default null
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_settings   jsonb;
  v_routing    jsonb;
  v_mode       text;
  v_reps       uuid[];
  v_count      int;
  v_idx        int;
  v_next_rep   uuid;
  v_rules      jsonb;
  v_rule       jsonb;
  v_postcodes  jsonb;
  v_pc         text;
  i            int;
  j            int;
begin
  select settings into v_settings from public.companies where id = p_company_id;
  v_routing := v_settings->'lead_routing';

  if v_routing is null then
    return null; -- no routing configured → everyone sees it
  end if;

  v_mode := v_routing->>'mode';

  -- Mode: all — no assignment
  if v_mode is null or v_mode = 'all' then
    return null;
  end if;

  -- Get active reps
  select array_agg(user_id order by created_at)
  into v_reps
  from public.sales_reps
  where company_id = p_company_id and is_active = true;

  v_count := coalesce(array_length(v_reps, 1), 0);
  if v_count = 0 then
    return null; -- no reps → unassigned
  end if;

  -- Mode: round_robin
  if v_mode = 'round_robin' then
    v_idx := coalesce((v_routing->>'round_robin_index')::int, 0);
    v_next_rep := v_reps[(v_idx % v_count) + 1];  -- 1-indexed array

    -- Increment the index
    update public.companies
    set settings = jsonb_set(
      coalesce(settings, '{}'),
      '{lead_routing,round_robin_index}',
      to_jsonb((v_idx + 1) % v_count)
    )
    where id = p_company_id;

    return v_next_rep;
  end if;

  -- Mode: postcode
  if v_mode = 'postcode' and p_postcode is not null then
    v_rules := v_routing->'postcode_rules';
    if v_rules is not null and jsonb_array_length(v_rules) > 0 then
      for i in 0 .. jsonb_array_length(v_rules) - 1 loop
        v_rule := v_rules->i;
        v_postcodes := v_rule->'postcodes';
        if v_postcodes is not null then
          for j in 0 .. jsonb_array_length(v_postcodes) - 1 loop
            v_pc := v_postcodes->>j;
            -- Exact match or range match (e.g. "2000-2050")
            if v_pc = p_postcode then
              return (v_rule->>'rep_id')::uuid;
            elsif v_pc like '%-%' then
              -- Range: "2000-2050" — use numeric comparison for safety
              declare
                v_lo text := split_part(v_pc, '-', 1);
                v_hi text := split_part(v_pc, '-', 2);
              begin
                if lpad(p_postcode, 10, '0') >= lpad(v_lo, 10, '0')
                   and lpad(p_postcode, 10, '0') <= lpad(v_hi, 10, '0') then
                  return (v_rule->>'rep_id')::uuid;
                end if;
              end;
            end if;
          end loop;
        end if;
      end loop;
    end if;

    -- No postcode match — fall back to round robin if reps exist
    v_idx := coalesce((v_routing->>'round_robin_index')::int, 0);
    v_next_rep := v_reps[(v_idx % v_count) + 1];
    update public.companies
    set settings = jsonb_set(
      coalesce(settings, '{}'),
      '{lead_routing,round_robin_index}',
      to_jsonb((v_idx + 1) % v_count)
    )
    where id = p_company_id;
    return v_next_rep;
  end if;

  return null;
end;
$$;
